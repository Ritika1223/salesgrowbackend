const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const Token = require("../middleware/frontAuthMiddleware");
const upload = require ("../middleware/upload");
const bankController = require('../controllers/bankController');
const paymentHistoryController = require('../controllers/paymentHistoryController');


router.post(
    "/upload",
    upload.single("file"),
    async (req, res) => {
      res.json({
        success: true,
        file: {
          fileName: req.file.originalname,
          fileUrl: `/uploads/${req.file.filename}`,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
        },
      });
    }
  );
router.get("/wallet", Token.Validate, chatController.getWalletAmount);
router.get("/wallet/:userId/transactions", chatController.getWalletTransactions);
router.post("/wallet/topup", chatController.topupWallet);

router.get('/bank', bankController.getActiveBankDetail);

router.post(
  "/payment-history",
  Token.Validate,
  upload.single("screenshot"),
  paymentHistoryController.createPaymentHistory
);
router.get(
  "/payment-history/user/:userId",
  Token.Validate,
  paymentHistoryController.getPaymentHistoriesByUserId
);

module.exports = router;

