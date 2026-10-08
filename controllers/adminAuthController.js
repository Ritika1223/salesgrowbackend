const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-JWT_SECRET";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

const HARDCODED_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const HARDCODED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

exports.login = async (req, res) => {
  try {
    const { adminUsername, adminPassword } = req.body;

    if (!adminUsername?.trim() || adminPassword === undefined || adminPassword === "") {
      return res.status(400).json({ message: "adminUsername and adminPassword are required" });
    }

    const ok =
      adminUsername.trim() === HARDCODED_ADMIN_USERNAME &&
      adminPassword === HARDCODED_ADMIN_PASSWORD;

    if (!ok) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    const token = jwt.sign(
      { role: "admin", sub: "admin-panel" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.json({
      token,
      admin: { adminUsername: HARDCODED_ADMIN_USERNAME }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
