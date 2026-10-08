const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-JWT_SECRET";

let io = null;
const userSockets = new Map();

function addSocket(userId, socketId) {
  const key = String(userId);
  if (!userSockets.has(key)) userSockets.set(key, new Set());
  userSockets.get(key).add(socketId);
}

function removeSocket(userId, socketId) {
  const key = String(userId);
  const set = userSockets.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(key);
}

function isUserOnline(userId) {
  if (!userId) return false;
  const set = userSockets.get(String(userId));
  return Boolean(set && set.size > 0);
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const raw =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        "";
      const token = String(raw).startsWith("Bearer ")
        ? String(raw).slice(7)
        : String(raw);
      if (!token) {
        return next(new Error("Token not provided"));
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.sub || decoded.id || decoded._id;
      if (!userId) {
        return next(new Error("Invalid token"));
      }
      socket.userId = String(userId);
      return next();
    } catch (err) {
      return next(new Error("TOKEN IS INVALID"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);
    addSocket(userId, socket.id);

    socket.on("disconnect", () => {
      removeSocket(userId, socket.id);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  isUserOnline,
};
