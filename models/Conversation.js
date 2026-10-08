const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    unique: true,
    index: true
  },

  isGroup: {
    type: Boolean,
    default: false
  },

  participants: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  ],

  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    default: null
  },

  lastMessage: String,
  lastMessageType: String,

  lastSenderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  lastMessageTime: Date

}, { timestamps: true });

// 🔥 indexes for performance
conversationSchema.index({ conversationId: 1 });
conversationSchema.index({ participants: 1 });
conversationSchema.index({ groupId: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);