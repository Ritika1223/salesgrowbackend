const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-JWT_SECRET";

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }
    req.admin = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin session" });
  }
}

module.exports = { requireAdmin };
