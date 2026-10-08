require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

const chatRoutes = require("./routes/chatRoutes");
const authRoutes = require("./routes/authRoutes");
const stickerRoutes = require("./routes/stickerRoutes");
const packageRoutes = require("./routes/packageRoutes");
const activityRoutes = require("./routes/activityRoute");
const adminRoutes = require("./routes/adminRoutes")
const {startCron} = require("./cron/poolCron");

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api", stickerRoutes);
app.use("/api/plans", packageRoutes);
app.use("/api/", activityRoutes);
app.use("/api/admin", adminRoutes);

startCron();

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
