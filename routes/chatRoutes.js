const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const liveController = require("../controllers/liveController");
const Token = require("../middleware/frontAuthMiddleware");
const upload = require ("../middleware/upload");
const bankController = require('../controllers/bankController');
const paymentHistoryController = require('../controllers/paymentHistoryController');


router.get("/users", chatController.getUsers);
router.get("/users-not-blocked-me", Token.Validate, chatController.getUsersNotBlockedMe);
router.post("/add-group-members", chatController.addGroupMembers);
router.get("/potential-members", chatController.getUsersNotInGroupAndNotBlockedMe);


router.post("/live/start", liveController.startLive);
router.post("/live/:sessionId/end", liveController.endLive);
router.get("/live/active", liveController.listActiveLives);
router.post("/live/:sessionId/join", liveController.joinLive);
router.get("/live/:sessionId/messages", liveController.getLiveMessages);

router.get("/messages/stats/:userId/:peerId", chatController.getMessageStats);
router.get("/messages/:user1/:user2", chatController.getMessages);
router.get("/unread-counts/:userId", chatController.getUnreadCounts);

router.post("/send-message", chatController.sendMessage);

router.put("/messages/read", chatController.markMessagesRead);

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
router.patch("/edit-message", chatController.editMessage);

router.post("/create-group", chatController.createGroup);

router.get("/group-messages/:groupId", chatController.getGroupMessages);

router.get("/user-groups", Token.Validate, chatController.getUserGroups);

router.get("/groups", Token.Validate, chatController.getGroups);


router.get("/conversations/:userId", chatController.getConversations);
router.delete(
  "/conversation/:peerId",
  Token.Validate,
  chatController.deleteDirectChat
);
router.get("/dm-preview/:userId/:peerId", chatController.getDmPreview);
router.post("/start-dm", chatController.startDirectMessage);
router.get("/wallet", Token.Validate, chatController.getWalletAmount);
router.get("/wallet/:userId/transactions", chatController.getWalletTransactions);
router.post("/wallet/topup", chatController.topupWallet);

router.get("/search",Token.Validate, chatController.searchUsersAndGroups);

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
