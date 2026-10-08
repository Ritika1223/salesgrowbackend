const User = require("../models/User");
const { vapidReady } = require("../helper/pushNotify");

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

exports.getVapidPublicKey = async (_req, res) => {
  if (!vapidReady()) {
    return res.status(503).json({ message: "Push is not configured" });
  }
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

exports.subscribePush = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ message: "Invalid push subscription" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const list = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];
    const next = list.filter((s) => s.endpoint !== sub.endpoint);
    next.push({
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
    user.pushSubscriptions = next;
    await user.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.unsubscribePush = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: "endpoint required" });
    }
    await User.findByIdAndUpdate(userId, {
      $pull: { pushSubscriptions: { endpoint } },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
