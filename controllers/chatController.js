const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");
const Wallet = require("../models/wallet");
const Group = require("../models/Group");
const Conversation = require("../models/Conversation");
const Sticker = require("../models/Sticker");
const LiveSession = require("../models/LiveSession");
const Investment = require("../models/Investment");
const { notifyNewChatMessage, previewText } = require("../helper/pushNotify");
const path = require("path");
const fs = require("fs");
const upload = require("../middleware/upload")

const COINS_PER_RUPEE = 10;
const FREE_MESSAGES_ON_SIGNUP = 50;
const TEXT_MESSAGE_COST_AFTER_FREE = 2;
const NEW_DM_START_COST = 50;
const LIVE_VIEWER_TEXT_COINS = 2;

/** Coin ledger used by chat, live, host earnings, and coin purchases. */
const CHAT_COIN_TYPES = [
  "BUY_COIN",
  "TOPUP",
  "CHAT_SPEND",
  "CHAT_EARN",
  "LIVE_TIP",
  "ADMIN_ADJUST",
  "REFERRAL_BONUS",
];
const HOST_EARN_TYPES = ["CHAT_EARN", "LIVE_TIP"];

async function withInvestmentAmounts(users) {
  if (!Array.isArray(users) || users.length === 0) return users || [];
  const ids = users.map((user) => user._id).filter(Boolean);
  const rows = await Investment.find({
    userId: { $in: ids },
    status: "active",
    endsAt: { $gt: new Date() },
  }).select("userId amount").lean();

  const totals = new Map();
  for (const row of rows) {
    const key = String(row.userId);
    totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
  }

  return users.map((user) => {
    const plain = typeof user.toObject === "function" ? user.toObject() : user;
    return {
      ...plain,
      planAmount: totals.get(String(plain._id)) || 0,
    };
  });
}

// GET USERS

exports.getUsers = async (req, res) => {
  try {

    const allowedTypes = [
      'TOPUP',
      'REFERRAL_BONUS',
      'CHAT_SPEND',
      'CHAT_EARN',
      'LIVE_TIP'
    ];

    const users = await withInvestmentAmounts(await User.aggregate([
      
      {
        $lookup: {
          from: 'wallets',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    '$userId',
                    '$$userId'
                  ]
                },
                type: { $in: allowedTypes }
              }
            },
            {
              $group: {
                _id: null,
                totalEarn: { $sum: '$amount' },
                totalCredit: {
                  $sum: {
                    $cond: [
                      { $eq: ['$direction', 'credit'] },
                      '$amount',
                      0
                    ]
                  }
                },
                totalDebit: {
                  $sum: {
                    $cond: [
                      { $eq: ['$direction', 'debit'] },
                      '$amount',
                      0
                    ]
                  }
                }
              }
            }
          ],
          as:
            'walletData'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          nickname: 1,
          about: 1,
          profilePhoto: 1,
          gallery: 1,
          referralCode: 1,
          referredBy: 1,
          directs: 1,
          activeDirectCount: 1,
          isActive: 1,
          plan: 1,
          role: 1,
          poolRank: 1,
          bonusRank: 1,
          totalReferrals: 1,
          walletBalance: 1,
          totalEarning: 1,
          totalWithdraw: 1,
          freeMessagesRemaining: 1,
          profileMode: 1,
          followers: 1,
          sex: 1,
          category: 1,
          age: 1,
          city: 1,
          isDisabled: 1,
          totalCredit: {
            $ifNull: [
              {
                $arrayElemAt: ['$walletData.totalCredit', 0]
              },
              0
            ]
          },
          totalDebit: {
            $ifNull: [
              { $arrayElemAt: ['$walletData.totalDebit', 0] },
              0
            ]
          },
          totalEarned: {
            $subtract: [
              {
                $ifNull: [
                  {
                    $arrayElemAt: [
                      '$walletData.totalCredit',
                      0
                    ]
                  },
                  0
                ]
              },
              {
                $ifNull: [
                  {
                    $arrayElemAt: [
                      '$walletData.totalDebit',
                      0
                    ]
                  },
                  0
                ]
              }
            ]
          }

        }
      }
    ]));
    return res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (err) {
    return res
      .status(500)
      .json({
        success: false, message: err.message
      });
  }

};

// 🔥 GET USERS EXCLUDING THOSE WHO BLOCKED ME
// GET /chat/users-not-blocked-me?myId=<myUserId>
exports.getUsersNotBlockedMe = async (req, res) => {
  try {
    const { myId } = req.query;
    if (!myId) {
      return res.status(400).json({ success: false, message: "myId required" });
    }

    // Find users where their blockedUsers does NOT include myId
    // And exclude myself from the users list if needed
    const users = await withInvestmentAmounts(await User.find({
      _id: { $ne: myId }, // exclude myself
      blockedUsers: { $ne: myId }, // users who have NOT blocked me
      isDisabled: { $ne: true },
    }).select("-password"));

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



// GET PRIVATE MESSAGES
exports.getMessages = async (req, res) => {
  const { user1, user2 } = req.params;

  const messages = await Message.find({
    $or: [
      { senderId: user1, receiverId: user2 },
      { senderId: user2, receiverId: user1 },
    ],
    liveSessionId: null,
  })
    .sort({ createdAt: 1 })
    .limit(100);

  res.json(messages);
};

// CREATE GROUP
exports.createGroup = async (req, res) => {
  try {
    const { name, members, createdBy } = req.body;

    if (!createdBy) {
      return res.status(400).json({ message: "createdBy required" });
    }
    const creator = await User.findById(createdBy).select("profileMode");
    if (!creator || (creator.profileMode || "user") !== "host") {
      return res.status(403).json({
        message: "Switch to host profile to create groups",
      });
    }

    const group = await Group.create({
      name,
      members,
      createdBy
    });

    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addGroupMembers = async (req, res) => {
  try {
    const { groupId, userIdsToAdd } = req.body;
    if (!groupId || !Array.isArray(userIdsToAdd) || userIdsToAdd.length === 0) {
      return res.status(400).json({ message: "groupId and userIdsToAdd[] required" });
    }

 

    // Add new members to the group (no duplicates)
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { members: { $each: userIdsToAdd } } },
      { new: true }
    )
      .populate({
        path: 'members',
        select: 'name profilePhoto sex profileMode'
      })
      .populate({
        path: 'createdBy',
        select: 'name profilePhoto'
      });

    if (!updatedGroup) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.json({
      success: true,
      message: "Members added successfully",
      group: updatedGroup
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUsersNotInGroupAndNotBlockedMe = async (req, res) => {
  try {
    const { groupId, myId } = req.query;

    if (!groupId || !myId) {
      return res.status(400).json({ success: false, message: "groupId and myId are required" });
    }

    // Get the group and its members array
    const group = await Group.findById(groupId).select("members");
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    const members = group.members.map(id => String(id)); // get as array of String

    // Find users who:
    // 1. Are not in the group (not in members)
    // 2. Have not blocked me (blockedUsers does NOT include myId)
    // 3. Are not myself
    const users = await User.find({
      _id: { $nin: [...members, myId] }, // not in group and not myself
      blockedUsers: { $ne: myId }
    }).select("-password");

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET GROUP MESSAGES
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;

    const messages = await Message.find({ groupId })
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//getGroup
exports.getGroups = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    if (userId) {
      const u = await User.findById(userId).select("profileMode");
      if (u && (u.profileMode || "user") !== "host") {
        return res.json([]);
      }
    }
    const groups = await Group.find()
      .populate({
        path: 'members',
        select: 'name profilePhoto sex profileMode'
      })
      .populate({
        path: 'createdBy',
        select: 'name profilePhoto'
      });


    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// GET USER GROUPS
exports.getUserGroups = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    const u = await User.findById(userId).select("profileMode");
    if (u && (u.profileMode || "user") !== "host") {
      return res.json([]);
    }
    const groups = await Group.find({ members: userId });

    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Unread counts grouped by sender (DMs only)
async function getUnreadCountsMap(userId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const rows = await Message.aggregate([
    {
      $match: {
        receiverId: uid,
        isRead: false,
        groupId: null,
        liveSessionId: null,
      },
    },
    { $group: { _id: "$senderId", count: { $sum: 1 } } },
  ]);

  const counts = {};
  let totalUnread = 0;
  for (const row of rows) {
    const key = String(row._id);
    counts[key] = row.count;
    totalUnread += row.count;
  }
  return { counts, totalUnread };
}

// 🔥 GET CONVERSATIONS (CHAT LIST)
exports.getConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    const chats = await Conversation.find({
      $or: [
        { participants: userId },
        { groupId: { $ne: null } }
      ]
    })
      .sort({ lastMessageTime: -1 })
      .populate("participants", "name")
      .populate("groupId", "name");

    const { counts: unreadMap } = await getUnreadCountsMap(userId);

    const enriched = chats.map((chat) => {
      const obj = chat.toObject();
      if (!obj.isGroup && Array.isArray(obj.participants)) {
        const peer = obj.participants.find(
          (p) => String(p._id) !== String(userId)
        );
        obj.unreadCount = peer ? (unreadMap[String(peer._id)] || 0) : 0;
      } else {
        obj.unreadCount = 0;
      }
      return obj;
    });

    res.json(enriched);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteDirectChat = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    const peerId = req.params.peerId || req.body?.peerId;

    if (!userId || !peerId) {
      return res.status(400).json({ message: "userId and peerId required" });
    }
    if (String(userId) === String(peerId)) {
      return res.status(400).json({ message: "Invalid peer" });
    }

    const conversationId = buildPrivateConversationId(userId, peerId);

    const messagesResult = await Message.deleteMany({
      groupId: null,
      liveSessionId: null,
      $or: [
        { senderId: userId, receiverId: peerId },
        { senderId: peerId, receiverId: userId },
      ],
    });

    // Keep the conversation so first-DM coins are not charged again.
    await Conversation.findOneAndUpdate(
      { conversationId, isGroup: false },
      {
        $set: {
          lastMessage: "",
          lastMessageType: "system",
          lastMessageTime: new Date(),
        },
        $setOnInsert: {
          conversationId,
          isGroup: false,
          participants: [userId, peerId],
        },
      },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: "Chat deleted",
      deletedMessages: messagesResult.deletedCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

exports.getUnreadCounts = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    const { counts, totalUnread } = await getUnreadCountsMap(userId);
    return res.json({ success: true, counts, totalUnread });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getMessageStats = async (req, res) => {
  try {
    const { userId, peerId } = req.params;
    if (!userId || !peerId) {
      return res.status(400).json({ message: "userId and peerId required" });
    }

    const uid = new mongoose.Types.ObjectId(userId);
    const pid = new mongoose.Types.ObjectId(peerId);

    const dmFilter = { groupId: null, liveSessionId: null };

    const [receivedUnread, receivedRead, sentRead, sentUnread] = await Promise.all([
      Message.countDocuments({ senderId: pid, receiverId: uid, isRead: false, ...dmFilter }),
      Message.countDocuments({ senderId: pid, receiverId: uid, isRead: true, ...dmFilter }),
      Message.countDocuments({ senderId: uid, receiverId: pid, isRead: true, ...dmFilter }),
      Message.countDocuments({ senderId: uid, receiverId: pid, isRead: false, ...dmFilter }),
    ]);

    return res.json({
      receivedUnread,
      receivedRead,
      sentRead,
      sentUnread,
      totalUnread: receivedUnread,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};



exports.sendMessage = async (req, res) => {
  const {
    senderId,
    receiverId,
    groupId,
    message,
    type,
    stickerId,
    stickerSlug,
    sticker,
    liveSessionId,
    isRead = false
  } = req.body;

  // File upload handled by separate endpoint, but ADD: accept file reference (URL or path) in req.body.file
  const uploadedFile = req.body.file;

  const fileUrl =
    typeof uploadedFile === "string"
      ? uploadedFile
      : uploadedFile?.fileUrl;
  try {
    if (!senderId || (!message && !fileUrl)) { // MESSAGE OR FILE must be present
      return res.status(400).json({ message: "Invalid data" });
    }

    let liveSession = null;
    if (liveSessionId) {
      if (groupId) {
        return res.status(400).json({ message: "Invalid live payload" });
      }
      liveSession = await LiveSession.findById(liveSessionId);
      if (!liveSession || liveSession.status !== "active") {
        return res.status(400).json({ message: "Live session is not active" });
      }
      const hostIdStr = String(liveSession.hostId);
      const senderStr = String(senderId);
      if (senderStr !== hostIdStr) {
        if (!receiverId || String(receiverId) !== hostIdStr) {
          return res
            .status(400)
            .json({ message: "Send messages to the host in this live chat" });
        }
      }
    } else if (!receiverId && !groupId) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    const senderStr = String(senderId);
    const isLiveHost =
      !!(liveSessionId && liveSession && senderStr === String(liveSession.hostId));

    if (!liveSessionId && groupId) {
      if ((sender.profileMode || "user") !== "host") {
        return res.status(403).json({
          message: "Group chat is only available in host profile",
        });
      }
    }

    // 🔥 CONVERSATION LOGIC (FINAL FIX)
    let filter;
    let updateData;
    let isNewPrivateConversation = false;

    if (!liveSessionId && groupId) {
      // ✅ GROUP CHAT
      filter = { groupId };

      updateData = {
        isGroup: true,
        groupId,
        lastMessage: message || "[file]",
        lastMessageType: type || (fileUrl ? "file" : "text"),
        lastSenderId: senderId,
        lastMessageTime: new Date()
      };

      await Conversation.findOneAndUpdate(
        filter,
        updateData,
        {
          upsert: true,
          returnDocument: "after"
        }
      );
    } else if (!liveSessionId) {
      // ✅ PRIVATE CHAT
      const conversationId = [senderId, receiverId].sort().join("_");
      filter = { conversationId };

      const existing = await Conversation.findOne(filter).select("_id");
      isNewPrivateConversation = !existing;
      if (!existing) {
        const priorDmCount = await Message.countDocuments({
          $or: [
            { senderId, receiverId, groupId: null, liveSessionId: null },
            { senderId: receiverId, receiverId: senderId, groupId: null, liveSessionId: null },
          ],
        });
        isNewPrivateConversation = priorDmCount === 0;
      }

      updateData = {
        conversationId,
        isGroup: false,
        lastMessage: message || "[file]",
        lastMessageType: type || (fileUrl ? "file" : "text"),
        lastSenderId: senderId,
        lastMessageTime: new Date(),

        // ONLY on first insert
        $setOnInsert: {
          participants: [senderId, receiverId]
        }
      };

      await Conversation.findOneAndUpdate(
        filter,
        updateData,
        {
          upsert: true,
          returnDocument: "after"
        }
      );
    }

    let receiver = null;
    if (!liveSessionId && !groupId && receiverId) {
      receiver = await User.findById(receiverId).select("profileMode walletBalance");
    }
    const senderIsHost = (sender.profileMode || "user") === "host";
    const receiverIsHost = !!(receiver && (receiver.profileMode || "user") === "host");
    const userToHostDm = !liveSessionId && !groupId && !senderIsHost && receiverIsHost;
    const hostOutboundDm = !liveSessionId && !groupId && senderIsHost;

    // ✅ COST CALCULATION
    let cost = 0;
    let reason = type || (fileUrl ? "file" : "text");

    if (liveSessionId) {
      // Live: viewer text is LIVE_VIEWER_TEXT_COINS; host pays 0.
    } else if (groupId) {
      // Group: message/sticker costs, no new-DM fee.
    } else if (hostOutboundDm) {
      // Host → user or host → host: no coin exchange.
    } else if (isNewPrivateConversation && !userToHostDm) {
      cost += NEW_DM_START_COST;
      reason = "new_dm";
    }

    const sendType = type || (fileUrl ? "file" : "text");
    if (sendType === "text" || sendType === "file") {
      if (liveSessionId && liveSession) {
        if (!isLiveHost) {
          cost += LIVE_VIEWER_TEXT_COINS;
          reason = "live_" + sendType;
        }
      } else if (hostOutboundDm) {
        // no charge
      } else if (userToHostDm) {
        cost += TEXT_MESSAGE_COST_AFTER_FREE;
        reason = sendType;
      } else {
        const remaining = Number.isFinite(sender.freeMessagesRemaining)
          ? sender.freeMessagesRemaining
          : FREE_MESSAGES_ON_SIGNUP;

        if (remaining > 0) {
          sender.freeMessagesRemaining = Math.max(0, remaining - 1);
        } else {
          cost += TEXT_MESSAGE_COST_AFTER_FREE;
          reason = reason === "new_dm"
            ? ("new_dm_" + sendType)
            : sendType;
        }
      }
    }

    let foundSticker = null;
    if (type === "sticker") {
      if (stickerId) {
        foundSticker = await Sticker.findById(stickerId);
      }
      if (!foundSticker && stickerSlug) {
        foundSticker = await Sticker.findOne({ slug: String(stickerSlug).toLowerCase().trim() });
      }
      if (!foundSticker && sticker && (sticker.slug || sticker.imageUrl)) {
        if (sticker.slug) {
          foundSticker = await Sticker.findOne({ slug: String(sticker.slug).toLowerCase().trim() });
        }
        if (!foundSticker && sticker.imageUrl) {
          foundSticker = await Sticker.findOne({ imageUrl: sticker.imageUrl });
        }
      }
      if (!foundSticker) {
        return res.status(400).json({ message: "Invalid sticker" });
      }
      const hostOwnLiveFreeSticker = Boolean(liveSessionId && isLiveHost);
      if (!hostOwnLiveFreeSticker && !hostOutboundDm) {
        cost += foundSticker.cost;
      }
      reason = reason === "new_dm" ? "new_dm_sticker" : "sticker";
    }

    let chargeAmount = hostOutboundDm ? 0 : cost;
    let hostCreditAmount = userToHostDm && chargeAmount > 0 ? chargeAmount : 0;

    if (chargeAmount > 0 && sender.walletBalance < chargeAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ✅ WALLET DEDUCTION + TRANSACTION
    if (chargeAmount > 0) {
      sender.walletBalance -= chargeAmount;
      await sender.save();

      await Wallet.create({
        userId: senderId,
        fromUserId: receiverId || null,
        amount: chargeAmount,
        direction: "debit",
        type: "CHAT_SPEND",
        description: userToHostDm ? "Message to host" : reason
      });

      if (hostCreditAmount > 0 && receiver) {
        receiver.walletBalance = (Number(receiver.walletBalance) || 0) + hostCreditAmount;
        await receiver.save();
        await Wallet.create({
          userId: receiverId,
          fromUserId: senderId,
          amount: hostCreditAmount,
          direction: "credit",
          type: "CHAT_EARN",
          description: "Chat earning from user",
        });
      }
    } else {
      await sender.save();
    }

    // ✅ SAVE MESSAGE
    // Add "file" field if present. Store only file URL, not binary.
    const messageData = {
      senderId,
      receiverId: receiverId || null,
      groupId: groupId || null,
      liveSessionId: liveSessionId || null,
      message,
      messageType: type || (fileUrl ? "file" : "text"),
      stickerId: type === "sticker" && foundSticker ? foundSticker._id : (type === "sticker" ? (stickerId || null) : null),
      stickerSlug: type === "sticker" && foundSticker ? foundSticker.slug : (type === "sticker" ? (stickerSlug || "") : ""),
      cost: chargeAmount
    };
    if (fileUrl) {
      // fileUrl should be in form "/uploads/xxxx.ext" - easily accessible due to:
      // app.use("/uploads", express.static(path.join(__dirname, "utils/uploads")));
      messageData.file = fileUrl;
    }

    const newMessage = await Message.create(messageData);

    try {
      if (!liveSessionId) {
        let receiverIds = [];
        if (groupId) {
          const group = await Group.findById(groupId).select("members");
          receiverIds = (group?.members || []).map((m) => String(m));
        } else if (receiverId) {
          receiverIds = [String(receiverId)];
        }
        await notifyNewChatMessage({
          senderId,
          senderName: sender.name || sender.nickname || "Someone",
          receiverIds,
          groupId: groupId || null,
          preview: previewText({
            message: message || "",
            messageType: type || (fileUrl ? "file" : "text"),
          }),
          messageType: type || (fileUrl ? "file" : "text"),
          messageId: newMessage._id,
        });
      }
    } catch (notifyErr) {
      console.warn("Chat notify failed:", notifyErr.message);
    }

    // Live tips: viewer pays; host earns (stickers: sticker cost; text: flat LIVE_VIEWER_TEXT_COINS per message)
    if (liveSessionId && liveSession && String(senderId) !== String(liveSession.hostId)) {
      if ((type || (fileUrl ? "file" : "text")) === "sticker" && foundSticker) {
        const tip = Number(foundSticker.cost) || 0;
        if (tip > 0) {
          const host = await User.findById(liveSession.hostId);
          if (host) {
            host.walletBalance = (Number(host.walletBalance) || 0) + tip;
            await host.save();
            await Wallet.create({
              userId: liveSession.hostId,
              fromUserId: receiverId,
              amount: tip,
              direction: "credit",
              type: "LIVE_TIP",
              description: "live_sticker_tip",
            });
          }
        }
      } else if ((type || (fileUrl ? "file" : "text")) === "text" && LIVE_VIEWER_TEXT_COINS > 0) {
        const tip = LIVE_VIEWER_TEXT_COINS;
        const host = await User.findById(liveSession.hostId);
        if (host) {
          host.walletBalance = (Number(host.walletBalance) || 0) + tip;
          await host.save();
          await Wallet.create({
            userId: liveSession.hostId,
            fromUserId: receiverId,
            amount: tip,
            direction: "credit",
            type: "LIVE_TIP",
            description: "live_text_tip",
          });
        }
      }
      // You may want to handle "file" tip as well if needed.
    }

    // ✅ RESPONSE
    res.json({
      message: "Message sent",
      data: newMessage,
      remainingBalance: sender.walletBalance, // coins
      remainingBalanceRupees: (Number(sender.walletBalance) || 0) / COINS_PER_RUPEE,
      freeMessagesRemaining: sender.freeMessagesRemaining,
      coinsPerRupee: COINS_PER_RUPEE
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.markMessagesRead = async (req, res) => {
  try {

      const { userId, senderId } = req.body;

      if (!userId || !senderId) {
        return res.status(400).json({ message: "userId and senderId required" });
      }

      const result = await Message.updateMany(
          {
              senderId,
              receiverId: userId,
              isRead: false,
              groupId: null,
              liveSessionId: null,
          },
          {
              $set: {
                  isRead: true,
                  readAt: new Date()
              }
          }
      );

      return res.json({
          success: true,
          markedCount: result.modifiedCount,
      });

  } catch (err) {
      return res.status(500).json({
          message: err.message
      });
  }
};

exports.editMessage = async (req, res) => {
  const { messageId, newMessage, userId } = req.body;

  try {
    if (!messageId || !newMessage) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Find the message
    const msg = await Message.findById(messageId);

    if (!msg) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check permission: only sender can edit
    if (userId && String(msg.senderId) !== String(userId)) {
      return res.status(403).json({ message: "You do not have permission to edit this message." });
    }

    // Optionally, restrict editing to recent messages or within a time window

    msg.message = newMessage;
    msg.edited = true;
    msg.editedAt = new Date();

    await msg.save();

    res.json({
      message: "Message edited successfully",
      data: msg
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Controller to fetch wallet amount of user by userId (GET /api/wallet/:userId)
exports.getWalletAmount = async (req, res) => {
  try {

    const userId = req.user?.sub || req.user?.id || req.user?._id;

    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const user = await User.findById(userId).select("walletBalance totalEarning totalWithdraw ");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [walletSummary, hostRows] = await Promise.all([
      Wallet.aggregate([
        {
          $match: {
            userId: userObjectId,
            type: { $in: CHAT_COIN_TYPES },
          },
        },
        {
          $group: {
            _id: "$direction",
            total: { $sum: "$amount" },
          },
        },
      ]),
      Wallet.aggregate([
        {
          $match: {
            userId: userObjectId,
            type: { $in: HOST_EARN_TYPES },
            direction: "credit",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const byDirection = Object.fromEntries(
      walletSummary.map((row) => [row._id, Number(row.total) || 0])
    );
    const coins = Number(user.walletBalance) || 0;

    return res.json({
      walletAvailableBalance: coins,
      walletBalance: coins,
      hostCoins: Number(hostRows[0]?.total) || 0,
      coinsAdded: byDirection.credit || 0,
      coinsSpent: byDirection.debit || 0,
      walletBalanceRupees: coins / COINS_PER_RUPEE,
      coinsPerRupee: COINS_PER_RUPEE,
      walletSummary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// GET /api/chat/wallet/:userId/transactions
exports.getWalletTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const txs = await Wallet.find({
      userId,
      type: { $in: CHAT_COIN_TYPES },
    })
      .sort({ createdAt: -1 })
      .limit(limit);
    return res.json({ transactions: txs });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/chat/wallet/topup  body: { userId, rupees }
exports.topupWallet = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, rupees } = req.body || {};
    const r = Number(rupees);
    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "userId is required" });
    }
    if (!Number.isFinite(r) || r <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "rupees must be a positive number" });
    }

    const coins = Math.round(r * COINS_PER_RUPEE);
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    user.walletBalance = (Number(user.walletBalance) || 0) + coins;
    await user.save({ session });

    await Wallet.create([{
      userId,
      amount: coins,
      direction: "credit",
      type: "TOPUP",
      description: `topup ₹${r} @ ${COINS_PER_RUPEE} coins/₹`,
    }], { session });

    await session.commitTransaction();
    return res.json({
      ok: true,
      rupees: r,
      coinsAdded: coins,
      walletBalance: user.walletBalance,
      walletBalanceRupees: (Number(user.walletBalance) || 0) / COINS_PER_RUPEE,
      coinsPerRupee: COINS_PER_RUPEE,
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: error.message });
  } finally {
    try { await session.endSession(); } catch { }
  }
};

function buildPrivateConversationId(a, b) {
  return [String(a), String(b)].sort().join("_");
}

/** GET — whether opening a DM with peer will incur the new-DM coin fee (no conversation / no prior messages). */
exports.getDmPreview = async (req, res) => {
  try {
    const { userId, peerId } = req.params;
    if (!userId?.trim?.() || !peerId?.trim?.()) {
      return res.status(400).json({ message: "userId and peerId required" });
    }
    if (String(userId) === String(peerId)) {
      return res.status(400).json({ message: "Invalid peer" });
    }

    const conversationId = buildPrivateConversationId(userId, peerId);
    const [existing, priorDmCount, user] = await Promise.all([
      Conversation.findOne({ conversationId, isGroup: false }).select("_id"),
      Message.countDocuments({
        $or: [
          { senderId: userId, receiverId: peerId, groupId: null, liveSessionId: null },
          { senderId: peerId, receiverId: userId, groupId: null, liveSessionId: null },
        ],
      }),
      User.findById(userId).select("walletBalance"),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hasThread = Boolean(existing) || priorDmCount > 0;

    return res.json({
      isNewDm: !hasThread,
      newDmCost: NEW_DM_START_COST,
      walletBalance: Number(user.walletBalance) || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/** POST — deduct new-DM coins and create conversation so the first message is not charged again. */
exports.startDirectMessage = async (req, res) => {
  try {
    const { userId, peerId } = req.body || {};
    if (!userId || !peerId) {
      return res.status(400).json({ message: "userId and peerId required" });
    }
    if (String(userId) === String(peerId)) {
      return res.status(400).json({ message: "Invalid peer" });
    }

    const conversationId = buildPrivateConversationId(userId, peerId);
    const existing = await Conversation.findOne({ conversationId, isGroup: false });
    const priorDmCount = await Message.countDocuments({
      $or: [
        { senderId: userId, receiverId: peerId, groupId: null, liveSessionId: null },
        { senderId: peerId, receiverId: userId, groupId: null, liveSessionId: null },
      ],
    });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (existing || priorDmCount > 0) {
      return res.json({
        ok: true,
        alreadyStarted: true,
        remainingBalance: Number(user.walletBalance) || 0,
        conversationId,
      });
    }

    const cost = NEW_DM_START_COST;
    const balance = Number(user.walletBalance) || 0;
    if (balance < cost) {
      return res.status(400).json({
        message: "Insufficient balance",
        requiredCoins: cost,
        walletBalance: balance,
      });
    }

    user.walletBalance = balance - cost;
    await user.save();

    await Wallet.create({
      userId,
      fromUserId: peerId,
      amount: cost,
      direction: "debit",
      type: "CHAT_SPEND",
      description: "new_dm_start",
    });

    await Conversation.create({
      conversationId,
      isGroup: false,
      participants: [userId, peerId],
      lastMessage: "",
      lastMessageType: "system",
      lastSenderId: userId,
      lastMessageTime: new Date(),
    });

    return res.json({
      ok: true,
      alreadyStarted: false,
      deducted: cost,
      remainingBalance: user.walletBalance,
      conversationId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};


exports.searchUsersAndGroups = async (req, res) => {
  try {
    const { search } = req.query
    const UserId = req.user?.sub || req.user?.id || req.user?._id;
    const user = await User.findById(UserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!search) {
      return res.status(400).json({ success: false, message: 'search text required' });
    }

    const users =
      await User.find({ name: { $regex: search, $options: 'i' } })
        .select('_id name profileImage')
        .limit(10)
        .lean();

    const groups = await Group.find({ name: { $regex: search, $options: 'i' } })
      .select('_id name groupImage members')
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        users, groups
      }

    });

  } catch (error) {
    return res.status(500).json({
      success: true,
      message: error.message

    });

  }





}

