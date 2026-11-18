const express = require("express");
const router = express.Router();
const projectPdfController = require("../controllers/projectPdfController");

router.get("/", projectPdfController.listProjectPdfs);

module.exports = router;
