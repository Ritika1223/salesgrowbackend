const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadPath = path.join(__dirname, "../utils/uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-project.pdf`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (file.mimetype === "application/pdf" || ext === ".pdf") {
    cb(null, true);
    return;
  }
  cb(new Error("Only PDF files are allowed"));
};

const uploadPdf = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function uploadProjectPdf(req, res, next) {
  uploadPdf.single("file")(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "PDF must be 20 MB or smaller"
      : err.message || "Could not upload PDF";
    return res.status(400).json({ message });
  });
}

module.exports = { uploadProjectPdf };
