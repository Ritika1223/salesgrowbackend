const LiveSession = require("../models/LiveSession");
const Message = require("../models/Message");
const User = require("../models/User");

/** POST body: { userId, title? } */
exports.startLive = async (req, res) => {
  try {
    const { userId, title } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    const host = await User.findById(userId).select("_id name profileMode");
    if (!host) {
      return res.status(404).json({ message: "User not found" });
    }
    if ((host.profileMode || "user") !== "host") {
      return res.status(403).json({
        message: "Switch to host profile in Chat to start a live",
      });
    }

    const endingSessions = await LiveSession.find({
      hostId: userId,
      status: "active",
    })
      .select("_id")
      .lean();
    const endingIds = endingSessions.map((s) => s._id);
    if (endingIds.length) {
      await Message.deleteMany({ liveSessionId: { $in: endingIds } });
    }
    await LiveSession.updateMany(
      { hostId: userId, status: "active" },
      { $set: { status: "ended", endedAt: new Date() } },
    );

    const session = await LiveSession.create({
      hostId: userId,
      title: String(title || "").trim() || `${host.name || "Host"}'s live`,
      status: "active",
      participantIds: [userId],
    });

    const populated = await LiveSession.findById(session._id)
      .populate("hostId", "name profilePhoto gallery")
      .lean();

    return res.json({
      session: populated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/** POST body: { userId } — only host */
exports.endLive = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    const session = await LiveSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    if (String(session.hostId) !== String(userId)) {
      return res.status(403).json({ message: "Only the host can end this live" });
    }
    session.status = "ended";
    session.endedAt = new Date();
    await session.save();
    await Message.deleteMany({ liveSessionId: session._id });
    return res.json({ ok: true, session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/** GET — list active sessions */
exports.listActiveLives = async (req, res) => {
  try {
    const sessions = await LiveSession.find({ status: "active" })
      .sort({ createdAt: -1 })
      .populate("hostId", "name profilePhoto gallery")
      .lean();

    const out = sessions.map((s) => ({
      ...s,
      participantCount: Array.isArray(s.participantIds) ? s.participantIds.length : 0,
    }));

    return res.json({ sessions: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/** POST body: { userId } */
exports.joinLive = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    const session = await LiveSession.findById(sessionId);
    if (!session || session.status !== "active") {
      return res.status(400).json({ message: "Live session is not available" });
    }
    const uid = String(userId);
    const has = (session.participantIds || []).some((id) => String(id) === uid);
    if (!has) {
      session.participantIds = [...(session.participantIds || []), userId];
      await session.save();
    }
    const populated = await LiveSession.findById(session._id)
      .populate("hostId", "name profilePhoto gallery")
      .lean();
    return res.json({
      session: populated,
      participantCount: populated.participantIds?.length || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.getLiveMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await LiveSession.findById(sessionId)
      .populate("hostId", "name profilePhoto gallery")
      .lean();
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const rows = await Message.find({ liveSessionId: sessionId })
      .sort({ createdAt: 1 })
      .limit(300)
      .populate("senderId", "name")
      .lean();

    const messages = rows.map((row) => {
      const m = { ...row };
      m.type = m.messageType || m.type;
      if (m.senderId && typeof m.senderId === "object") {
        m.senderName = m.senderId.name;
        m.senderId = m.senderId._id;
      }
      return m;
    });

    return res.json({ messages, session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
