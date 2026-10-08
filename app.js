const express = require('express');
const cors = require('cors');
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ serve images properly
app.use("/uploads", express.static(path.join(__dirname, "utils/uploads")));

app.get('/', (req, res) => {
  res.send('API Running');
});

module.exports = app;