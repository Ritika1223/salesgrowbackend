// ===============================
// ROUTES/authRoutes.js
// ===============================

const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const hostRequestController = require("../controllers/hostRequestController");
const pushController = require("../controllers/pushController");
const { Validate } = require("../middleware/frontAuthMiddleware");

const upload = require("../middleware/upload");


// AUTH
router.post("/register", authController.register);
router.get("/referral/lookup", authController.lookupReferral);

router.post("/login", authController.login);

router.post("/user/login-password", Validate, authController.changeLoginPassword);
router.post("/user/transaction-password", Validate, authController.changeTransactionPassword);


// PROFILE MODE (JWT)
router.patch(
  "/user/profile-mode",
  Validate,
  authController.setProfileMode
);

router.post(
  "/host-request",
  Validate,
  upload.single("attachment"),
  hostRequestController.createHostRequest
);

router.get(
  "/host-request/me",
  Validate,
  hostRequestController.getMyHostRequest
);


// CURRENT USER (JWT)
router.get(
  "/user/me",
  Validate,
  authController.getMe
);

router.get("/push/vapid-public-key", pushController.getVapidPublicKey);
router.post("/push/subscribe", Validate, pushController.subscribePush);
router.post("/push/unsubscribe", Validate, pushController.unsubscribePush);


// USER BY ID (JWT required — e.g. host profiles)
router.get(
  "/user/by-id/:id",
  Validate,
  authController.getUserById
);


// REFERRAL (JWT)
router.get(
  "/referral",
  Validate,
  authController.getReferralByUserId
);

router.get(
  "/team",
  Validate,
  authController.getMyTeam
);


// ========================================
// UPLOAD PROFILE PHOTO
// ========================================

router.post(
  "/user/upload-profile-photo",
  Validate,
  upload.single("file"),
  authController.uploadProfilePhoto
);


// ========================================
// UPLOAD GALLERY PHOTO
// ========================================

router.post(
  "/user/upload-Gallery-photo",
  Validate,
  upload.array('gallery',10),
  authController.uploadGalleryPhoto
);

router.post(
  "/user/delete-Gallery-photo",
  Validate,
  upload.array('gallery',10),
  authController.deleteGalleryPhoto
);

// ========================================
// UPDATE PROFILE (JWT)
// ========================================

router.put(
  "/user/update-profile",
  Validate,
  authController.updateProfile
);

router.delete(
  "/user/profile",
  Validate,
  authController.deleteProfile
);


// ========================================
// Follow PROFILE (JWT)
// ========================================

router.post(
  "/user/toggleFollow",
  Validate,
  authController.toggleFollow
);

// ========================================
// BLOCK USER/HOST (JWT)
// ========================================

router.post(
  "/user/block",
  Validate,
  authController.blockUser
);

// ========================================
// UNBLOCK USER/HOST (JWT)
// ========================================

router.post(
  "/user/unblock",
  Validate,
  authController.unblockUser
);

module.exports = router;
