const express = require("express");
const router = express.Router();
const stickerController = require("../controllers/stickerController");



router.get("/stickers", stickerController.listStickers);


module.exports = router;

