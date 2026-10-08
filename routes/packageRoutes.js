const express = require("express");
const router = express.Router();
const packageController = require("../controllers/packageController");
const planRequestController = require("../controllers/planRequestController");
const Token = require("../middleware/frontAuthMiddleware");
const upload = require("../middleware/upload");

router.get("/", packageController.getPlans);

router.post("/buyPlan", Token.Validate, packageController.buyPlan);
router.post(
  "/plan-request",
  Token.Validate,
  upload.single("attachment"),
  planRequestController.createPlanRequest
);
router.get("/plan-request/me", Token.Validate, planRequestController.getMyPlanRequest);
router.get("/getReportStats", Token.Validate, packageController.getReportStats);
router.get("/getPoolReport", packageController.getPoolReport);
router.get("/getIncomeReport", Token.Validate, packageController.getIncomeReport);
router.get("/top-leaders", packageController.getTopLeaders);
router.get("/getWalletTransactions", Token.Validate, packageController.getWalletTransactions);
router.post("/to-diamond", Token.Validate, packageController.convertToDiamond);

module.exports = router;
