const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  liveSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LiveSession",
    default: null,
  },

  message: String,
  messageType: {
    type: String,
    enum: ["text", "sticker", "file"],
    default: "text"
  },

  file: {
    type: String,
    default: null,
  },
  

  stickerId: { type: mongoose.Schema.Types.ObjectId, ref: "Sticker", default: null },
  stickerSlug: { type: String, default: "" },

  cost: Number,

    // NEW
    isRead: {
      type: Boolean,
      default: false
    },
  
    readAt: {
      type: Date,
      default: null
    }

}, { timestamps: true });

messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, isRead: 1, groupId: 1, liveSessionId: 1 });
messageSchema.index({ groupId: 1 });
messageSchema.index({ liveSessionId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);