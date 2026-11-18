const mongoose = require("mongoose");

const ProjectPdfSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true },
    originalName: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProjectPdf", ProjectPdfSchema);
