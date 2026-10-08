const mongoose = require("mongoose");

const stickerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    imageUrl: { type: String, default: "" },
    cost: { type: Number, required: true, min: 0 },
    isCustom: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sticker", stickerSchema);

