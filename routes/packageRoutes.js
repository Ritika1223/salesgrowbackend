const express = require("express");
const router = express.Router();
const packageController = require("../controllers/packageController");
const planRequestController = require("../controllers/planRequestController");
const withdrawalController = require("../controllers/withdrawalController");
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
router.get("/plan-request/history", Token.Validate, planRequestController.getMyPlanRequests);
router.get("/getReportStats", Token.Validate, packageController.getReportStats);
router.get("/getPoolReport", packageController.getPoolReport);
router.get("/getIncomeReport", Token.Validate, packageController.getIncomeReport);
router.get("/top-leaders", packageController.getTopLeaders);
router.get("/getWalletTransactions", Token.Validate, packageController.getWalletTransactions);
router.get("/fund-received", Token.Validate, packageController.getFundReceived);
router.post("/withdraw", Token.Validate, withdrawalController.createWithdrawal);
router.get("/withdraw/history", Token.Validate, withdrawalController.myWithdrawals);
router.post("/to-diamond", Token.Validate, packageController.convertToDiamond);

module.exports = router;
