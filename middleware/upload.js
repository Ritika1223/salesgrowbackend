const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ ensure upload folder exists
const uploadPath = path.join(__dirname, "../utils/uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .toLowerCase();

    const uniqueName = `${Date.now()}-${name}${ext}`;
    cb(null, uniqueName);
  }
});

// ✅ allow only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB: Increased file size limit to help avoid entity errors
  }
});

module.exports = upload;