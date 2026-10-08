const express = require("express");
const router = express.Router();
const ActivityController = require("../controllers/activityController");
const Token = require("../middleware/frontAuthMiddleware");


router.post("/activity/ping", Token.Validate, ActivityController.trackActivity);
router.get("/activity", Token.Validate, ActivityController.recentActivity);


module.exports = router;
