const webpush = require("web-push");
const User = require("../models/User");
const { emitToUser, isUserOnline } = require("../socket");

function vapidReady() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

if (vapidReady()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@localhost",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function previewText(payload) {
  if (payload.messageType === "sticker") return "Sent a sticker";
  if (payload.messageType === "file") return "Sent a file";
  const text = String(payload.message || "").trim();
  if (!text) return "New message";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

async function sendPushToUser(userId, payload) {
  if (!vapidReady() || !userId) return;
  const user = await User.findById(userId).select("pushSubscriptions");
  if (!user || !Array.isArray(user.pushSubscriptions) || !user.pushSubscriptions.length) {
    return;
  }

  const body = JSON.stringify(payload);
  const stale = [];

  await Promise.all(
    user.pushSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys?.p256dh,
              auth: sub.keys?.auth,
            },
          },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale.push(sub.endpoint);
        } else {
          console.warn("Web push failed:", err.statusCode || err.message);
        }
      }
    })
  );

  if (stale.length) {
    user.pushSubscriptions = user.pushSubscriptions.filter(
      (s) => !stale.includes(s.endpoint)
    );
    await user.save();
  }
}

async function notifyNewChatMessage({
  senderId,
  senderName,
  receiverIds,
  groupId,
  preview,
  messageType,
  messageId,
}) {
  const targets = [...new Set((receiverIds || []).map((id) => String(id)).filter(Boolean))];
  const from = String(senderId || "");
  const event = {
    senderId: from,
    senderName: senderName || "Someone",
    groupId: groupId || null,
    preview: preview || "New message",
    messageType: messageType || "text",
    messageId: messageId ? String(messageId) : null,
    createdAt: new Date().toISOString(),
  };

  await Promise.all(
    targets.map(async (uid) => {
      if (!uid || uid === from) return;
      emitToUser(uid, "new_message", event);
      if (!isUserOnline(uid)) {
        await sendPushToUser(uid, {
          title: event.senderName,
          body: event.preview,
          tag: groupId ? `group-${groupId}` : `chat-${from}`,
          url: groupId ? "/chat" : `/chat?peer=${from}`,
          peerId: from,
          groupId: groupId || null,
        });
      }
    })
  );
}

module.exports = {
  vapidReady,
  previewText,
  notifyNewChatMessage,
};
