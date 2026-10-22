const express = require("express");
const router = express.Router();

const adminAuthController = require("../controllers/adminAuthController");
const adminDataController = require("../controllers/adminDataController");
const stickerController = require("../controllers/stickerController");
const bankController = require('../controllers/bankController');
const paymentHistoryController = require('../controllers/paymentHistoryController');
const hostRequestController = require("../controllers/hostRequestController");
const planRequestController = require("../controllers/planRequestController");
const withdrawalController = require("../controllers/withdrawalController");

const { requireAdmin } = require("../middleware/adminAuth");
const upload = require("../middleware/upload");

// 🔓 Public
router.post("/auth/login", adminAuthController.login);

// 🔒 Protected
router.use(requireAdmin);

// Admin Data
router.get("/users", adminDataController.listAllUsers);
router.get("/groups", adminDataController.listAllGroups);
router.patch("/users/:id/status", adminDataController.setUserDisabled);
router.patch("/users/:id", adminDataController.updateUserByAdmin);
router.delete("/users/:id", adminDataController.deleteUserCompletely);

// Stickers
router.get("/stickers", stickerController.listStickers);

// ✅ Upload image + create sticker
router.post(
  "/stickers",
  upload.single("image"), // field name must match frontend
  stickerController.createSticker
);

router.delete("/stickers/:id", stickerController.deleteSticker);

router.post(
  '/bank',
  upload.single('qrCode'), // field name 'qrCode' must match frontend
  bankController.addBankDetail
);

// Get all bank/payment details (optionally filter by isActive query param)
router.get('/bank', bankController.getBankDetails);

// Payment history (must be before /:id routes)
router.get('/payment-history', paymentHistoryController.getAllPaymentHistories);
router.get('/payment-history/approved', paymentHistoryController.getApprovedPayments);
router.patch('/payment-history/:id/status', paymentHistoryController.updatePaymentStatus);
router.post('/payment-history/:id/add-fund', paymentHistoryController.addFundFromPayment);

router.get("/host-requests", hostRequestController.listHostRequests);
router.patch(
  "/host-requests/:id/status",
  hostRequestController.updateHostRequestStatus
);

router.get("/withdrawals", withdrawalController.listWithdrawals);
router.patch("/withdrawals/:id/status", withdrawalController.updateWithdrawalStatus);

router.get("/plan-requests", planRequestController.listPlanRequests);
router.patch(
  "/plan-requests/:id/status",
  planRequestController.updatePlanRequestStatus
);

// Delete a bank/payment detail by id
router.delete('/:id', bankController.deleteBankDetail);

// Set a bank detail as active/inactive
router.patch('/:id/status', bankController.setBankDetailStatus);

module.exports = router;