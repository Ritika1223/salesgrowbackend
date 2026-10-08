const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "" },
    status: { type: String, enum: ["active", "ended"], default: "active" },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

liveSessionSchema.index({ status: 1, createdAt: -1 });
liveSessionSchema.index({ hostId: 1, status: 1 });

module.exports = mongoose.model("LiveSession", liveSessionSchema);
