const fs = require("fs");
const path = require("path");
const ProjectPdf = require("../models/ProjectPdf");

function publicRow(row) {
  return {
    _id: row._id,
    title: row.title,
    fileUrl: row.fileUrl,
    originalName: row.originalName || "",
    size: Number(row.size || 0),
    createdAt: row.createdAt,
  };
}

exports.listProjectPdfs = async (req, res) => {
  try {
    const rows = await ProjectPdf.find().sort({ createdAt: -1 }).lean();
    return res.json({ data: rows.map(publicRow) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createProjectPdf = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Choose a PDF file" });
    }

    const row = await ProjectPdf.create({
      title,
      fileUrl: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname || "",
      size: Number(req.file.size || 0),
    });

    return res.status(201).json({
      message: "PDF uploaded",
      data: publicRow(row),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteProjectPdf = async (req, res) => {
  try {
    const row = await ProjectPdf.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ message: "PDF not found" });
    }

    const filename = path.basename(String(row.fileUrl || ""));
    if (filename) {
      const filePath = path.join(__dirname, "../utils/uploads", filename);
      fs.unlink(filePath, () => {});
    }

    await row.deleteOne();
    return res.json({ message: "PDF deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
