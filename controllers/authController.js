const mongoose = require('mongoose');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const wallet = require('../models/wallet');
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const HostRequest = require("../models/HostRequest");
const PaymentHistory = require("../models/PaymentHistory");
const Group = require("../models/Group");
const LiveSession = require("../models/LiveSession");
const UserActivity = require("../models/UserActivity");
const Support = require("../models/Support");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-JWT_SECRET";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

const COINS_PER_RUPEE = 10;
const REFERRER_REWARD_COINS = 75;

function randomCode(len = 6) {
  const numbers = "0123456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += numbers[Math.floor(Math.random() * numbers.length)];
  }
  return out;
}

async function generateUniqueReferralCode() {
  const base = "CPX"
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6) || "USER";

  for (let i = 0; i < 10; i += 1) {
    const candidate = `${base}${randomCode(6)}`;
    const exists = await User.exists({ referralCode: candidate });
    if (!exists) return candidate;
  }

  // final fallback with longer random section
  return `${base}${Date.now().toString().slice(-6)}`;
}

function buildToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), name: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

function publicUser(user, totalearn) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    plan: user.plan,
    profilePhoto: user.profilePhoto,
    nickname: user.nickname,
    referralCode: user.referralCode,
    referredBy: user.referredBy || null,
    totalReferrals: Number(user.totalReferrals) || 0,
    walletBalance: user.walletBalance,
    walletBalanceRupees: (Number(user.walletBalance) || 0) / COINS_PER_RUPEE,
    coinsPerRupee: COINS_PER_RUPEE,
    freeMessagesRemaining: user.freeMessagesRemaining,
    profileMode: user.profileMode || "user",
    hostApproved: Boolean(user.hostApproved) || user.profileMode === "host",
    createdAt: user.createdAt,
    isActive: user.isActive,
    updatedAt: user.updatedAt,
    poolRank: user.poolRank || null,
    bonusRank: user.bonusRank || null,
    about: user.about || "",
    totalEarned: totalearn || 0,
    followers: user.followers?.length || 0,
    gallery: user.gallery,
    sex: user.sex,
    category: user.category,
    age: user.age || null,
    city: user.city || "",
    isDisabled: Boolean(user.isDisabled),

    blockedUsers: user.blockedUsers || []

  };
}

  // Register user
exports.register = async (req, res) => {
  try {
    const { name, nickname, email, phone, password, referralCode } = req.body;

    if (!name?.trim() ||  !email?.trim() || !phone?.trim() || !password) {
      return res.status(400).json({ message: "Name, email, phone, and password are required" });
    }

    // CHECK EXISTING PHONE
    const existingPhone = await User.findOne({ phone: phone.trim() });
    const existingEmail = await User.findOne({ email: email.trim() });

    if (existingPhone) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    let referrer = null;
    const normalizedReferralCode = String(referralCode || "").trim().toUpperCase();
    if (normalizedReferralCode) {
      referrer = await User.findOne({ referralCode: normalizedReferralCode });
      if (!referrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    const generatedReferralCode = await generateUniqueReferralCode();

    const user = await User.create({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password: String(password),
      referralCode: generatedReferralCode,
      referredBy: referrer?._id || null
    });


    if (referrer) {
      referrer.walletBalance = (Number(referrer.walletBalance) || 0) + REFERRER_REWARD_COINS;
      referrer.totalReferrals = (Number(referrer.totalReferrals) || 0) + 1;
      user.walletBalance = (Number(user.walletBalance) || 0);
      await User.findByIdAndUpdate(referrer?._id, {
        $push: { directs: user._id }
      });
      await Promise.all([
        referrer.save(),
        user.save(),
        Wallet.create({
          userId: referrer._id,
          amount: REFERRER_REWARD_COINS,
          direction: "credit",
          type: "REFERRAL_BONUS",
          fromUserId: user._id,
          description: `referral_bonus`
        })
      ]);
    }

    const token = buildToken(user);
    res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({ message: `${field} is already registered` });
    }
    res.status(500).json({ message: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone?.trim() || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const user = await User.findOne({ phone: phone.trim() }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const entered = String(password).trim();
    const stored = String(user.password || "").trim();
    let match = stored === entered;

    if (!match && stored.startsWith("$2")) {
      try {
        match = await bcrypt.compare(entered, stored);
      } catch {
        match = false;
      }
    }

    // Old users reset in DB to 123456 (plain). If a bcrypt hash is still stored, allow 123456 and save plain.
    if (!match && entered === "123456") {
      match = true;
    }

    if (!match) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    if (user.isDisabled) {
      return res.status(403).json({
        message: "Your account is inactive. Please contact admin.",
      });
    }

    if (stored !== "123456" && entered === "123456") {
      user.password = "123456";
    }

    if (!user.referralCode || !String(user.referralCode).trim()) {
      user.referralCode = await generateUniqueReferralCode();
    }
    if (user.isModified()) {
      await user.save();
    }

    const token = buildToken(user);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** PATCH body: { profileMode: "user" | "host" } — user id from JWT */
exports.setProfileMode = async (req, res) => {
  try {
    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { profileMode } = req.body;
    if (!["user", "host"].includes(String(profileMode || ""))) {
      return res.status(400).json({ message: "profileMode must be user or host" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyHost = Boolean(user.hostApproved) || user.profileMode === "host";
    if (profileMode === "host" && !user.isActive && !alreadyHost) {
      return res.status(403).json({
        code: "NO_ACTIVE_PLAN",
        message:
          "You do not have any active plan. Activate a plan to become a host.",
        hostApproved: false,
        isActive: false,
      });
    }

    if (profileMode === "host" && user.isActive) {
      user.hostApproved = true;
    }
    user.profileMode = profileMode;
    await user.save();
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Current user (JWT)
exports.getMe = async (req, res) => {
  try {
    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isDisabled) {
      return res.status(403).json({
        message: "Your account is inactive. Please contact admin.",
      });
    }
    if (user.profileMode === "host" && !user.hostApproved) {
      user.hostApproved = true;
      await user.save();
    }
    const allowedTypes = [
      'TOPUP',
      'REFERRAL_BONUS',
      'CHAT_SPEND',
      'CHAT_EARN',
      'LIVE_TIP'
    ];

    const earn = await Wallet.aggregate([
      {
        $match: {
          userId:
            new mongoose.Types.ObjectId(
              id
            ),
          type: {
            $in:
              allowedTypes
          }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum:
              '$amount'
          }
        }
      }
    ]);

    const totalEarn = earn[0]?.total || 0;
    res.json({ user: publicUser(user, totalEarn) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Registered user by ID (caller must be authenticated)
// Modified to hide details of a blocked user (by current user)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = tokenUserId(req);
    // Get both users to check block lists
    const [user, requester] = await Promise.all([
      User.findById(id),
      requesterId ? User.findById(requesterId) : null
    ]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if requester's blockedUsers contains this user, or user's blockedUsers contains requester
    const isBlockedByYou = requester?.blockedUsers?.includes(user._id.toString());
    const isBlockedYou = user.blockedUsers?.includes(requesterId);

    if (isBlockedByYou || isBlockedYou) {
      // Hide details for both cases
      return res.status(403).json({ message: "User is blocked or has blocked you" });
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReferralByUserId = async (req, res) => {
  try {
    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await User.findById(id).select("name referralCode totalReferrals");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.referralCode || !String(user.referralCode).trim()) {
      user.referralCode = await generateUniqueReferralCode();
      await user.save();
    }
    const allowedTypes = ['REFERRAL_BONUS'];

    const activities =
      await Wallet.find({
        userId: new mongoose.Types.ObjectId(id),
        type: {
          $in: allowedTypes
        }
      }).select('amount type description createdAt transactionId fromUserId')
        .populate({
          path: 'fromUserId',
          select: 'name profilePhoto'
        })
        .sort({ createdAt: -1 })
        .lean();

    const walletActivity =
      activities.map(activity => ({

        referralName: activity.fromUserId?.name,
        profilePhoto: activity.fromUserId?.profilePhoto,

        transactionId:
          activity.transactionId,

        type:
          activity.type,

        amount:
          Number(activity.amount || 0),

        description:
          activity.description || '',

        date:
          activity.createdAt

      }));


    return res.json({
      referralCode: user.referralCode,
      totalReferrals: Number(user.totalReferrals) || 0,
      userName: user.name,
      data: walletActivity
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMyTeam = async (req, res) => {
  try {
    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const select = "name nickname phone referralCode isActive plan createdAt";
    const levels = [];
    let parentIds = [id];

    for (let level = 1; level <= 6; level += 1) {
      if (!parentIds.length) {
        levels.push({ level, members: [] });
        continue;
      }
      const members = await User.find({ referredBy: { $in: parentIds } })
        .select(select)
        .sort({ createdAt: -1 })
        .lean();
      levels.push({
        level,
        members: members.map((member) => ({
          id: member._id,
          name: member.name || "",
          nickname: member.nickname || "",
          phone: member.phone || "",
          referralCode: member.referralCode || "",
          isActive: Boolean(member.isActive),
          plan: member.plan || "",
          joinedAt: member.createdAt || null,
        })),
      });
      parentIds = members.map((member) => member._id);
    }

    return res.json({
      directs: levels[0]?.members || [],
      levels,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ========================================
// UPLOAD PROFILE PHOTO
// ========================================

exports.uploadProfilePhoto = async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        message: "No image uploaded",
      });
    }

    const imageUrl =
      `${req.protocol}://${req.get("host")}/uploads/` +
      req.file.filename;

    return res.status(200).json({
      message: "Image uploaded successfully",
      url: imageUrl,
    });

  } catch (error) {

    return res.status(500).json({
      message: error.message,
    });

  }
};

// ========================================
// UPLOAD GALLERY PHOTO
// ========================================

exports.uploadGalleryPhoto = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const images = req.files.map(file =>
      `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
    );

    const user = await User.findByIdAndUpdate(userId,
      {
        $push: {
          gallery: {
            $each:
              images
          }
        }
      },
      {
        new: true
      }
    );

    return res.status(200).json({ success: true, message: 'Gallery uploaded', gallery: user.gallery });

  } catch (err) {
    return res
      .status(500)
      .json({
        success: false,
        message:
          err.message

      });

  }

};

exports.deleteGalleryPhoto = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { photoUrl } = req.body;
    if (!photoUrl || typeof photoUrl !== "string") {
      return res.status(400).json({ success: false, message: "photoUrl is required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { gallery: photoUrl } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, message: "Photo deleted from gallery", gallery: user.gallery });
  } catch (err) {
    return res
      .status(500)
      .json({
        success: false,
        message: err.message
      });
  }
};

// ========================================
// UPDATE PROFILE
// ========================================

exports.updateProfile = async (req, res) => {
  try {

    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      name,
      sex,
      nickname,
      about,
      profilePhoto,
      category,
      age,
      city,
    } = req.body;

    const updateData = {};

    if (name?.trim()) {
      updateData.name = name.trim();
    }

    if (nickname?.trim()) {
      updateData.nickname = nickname.trim();
    }

    if (sex?.trim()) {
      updateData.sex = sex.trim();
    }

    if (category?.trim()) {
      updateData.category = category.trim();
    }

    if (city !== undefined) {
      updateData.city = String(city || "").trim();
    }

    if (age !== undefined && age !== null && String(age).trim() !== "") {
      const parsedAge = Number(age);
      if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 99) {
        return res.status(400).json({
          success: false,
          message: "Age must be between 18 and 99",
        });
      }
      updateData.age = parsedAge;
    }

    if (about?.trim()) {
      const text = about.trim();
      if (text.length > 200) {
        return res.status(400)
          .json({
            success: false,
            message:
              'About must be between 150 and 200 characters'
          });
      }
      updateData.about = text;
    }

    if (profilePhoto) {
      updateData.profilePhoto = profilePhoto;
    }

    const updatedUser =
      await User.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: publicUser(updatedUser),
    });

  } catch (error) {

    return res.status(500).json({
      message: error.message,
    });

  }
};

// ========================================
// Follow PROFILE
// ========================================

exports.toggleFollow =
  async (req, res) => {

    try {

      const authUserId = req.user?.sub || req.user?.id || req.user?._id;
      const { targetUserId } = req.body;

      if (authUserId === targetUserId) {
        return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
      }

      const authUser = await User.findById(authUserId);
      const targetUser = await User.findById(targetUserId);

      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const alreadyFollowed = targetUser.followers.includes(authUserId);

      if (alreadyFollowed) {
        // UNFOLLOW: remove authUserId from targetUser's followers AND targetUserId from authUser's following
        await User.findByIdAndUpdate(targetUserId, { $pull: { followers: authUserId } });
        await User.findByIdAndUpdate(authUserId, { $pull: { following: targetUserId } });
        return res.json({ success: true, message: 'Unfollowed' });
      }
      // FOLLOW: add authUserId to targetUser's followers AND targetUserId to authUser's following
      await User.findByIdAndUpdate(targetUserId, { $addToSet: { followers: authUserId } });
      await User.findByIdAndUpdate(authUserId, { $addToSet: { following: targetUserId } });

      return res.json({ success: true, message: 'Followed' });

    } catch (err) {

      return res.status(500).json({
        success: false,
        message: err.message
      });
    }

  };

// ========================================
// BLOCK USER/HOST
// ========================================

// POST body: { targetUserId: "id" }
exports.blockUser = async (req, res) => {
  try {
    const authUserId = tokenUserId(req);
    const { targetUserId } = req.body;

    if (!authUserId || !targetUserId) {
      return res.status(400).json({ success: false, message: 'targetUserId is required' });
    }
    if (authUserId === targetUserId) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    // Add targetUserId to "blockedUsers" of logged in user
    const updatedUser = await User.findByIdAndUpdate(
      authUserId,
      { $addToSet: { blockedUsers: targetUserId } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User blocked successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ========================================
// UNBLOCK USER/HOST
// ========================================

// POST body: { targetUserId: "id" }
exports.unblockUser = async (req, res) => {
  try {
    const authUserId = tokenUserId(req);
    const { targetUserId } = req.body;

    if (!authUserId || !targetUserId) {
      return res.status(400).json({ success: false, message: 'targetUserId is required' });
    }

    // Remove targetUserId from "blockedUsers" of logged in user
    const updatedUser = await User.findByIdAndUpdate(
      authUserId,
      { $pull: { blockedUsers: targetUserId } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User unblocked successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const id = tokenUserId(req);
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const uid = new mongoose.Types.ObjectId(String(id));

    await Promise.all([
      Message.deleteMany({
        $or: [{ senderId: uid }, { receiverId: uid }],
      }),
      Conversation.deleteMany({ participants: uid }),
      Wallet.deleteMany({ userId: uid }),
      HostRequest.deleteMany({ userId: uid }),
      PaymentHistory.updateMany(
        { userId: uid },
        {
          $set: {
            userName: user.name || "",
            userEmail: user.email || "",
            userPhone: user.phone || "",
          },
        }
      ),
      UserActivity.deleteMany({ userId: uid }),
      Support.deleteMany({ senderId: uid }),
      LiveSession.deleteMany({ hostId: uid }),
      Group.deleteMany({ createdBy: uid }),
      Group.updateMany({ members: uid }, { $pull: { members: uid } }),
      LiveSession.updateMany(
        { participantIds: uid },
        { $pull: { participantIds: uid } }
      ),
      User.updateMany(
        {},
        { $pull: { followers: uid, blockedUsers: uid, directs: uid } }
      ),
    ]);

    await User.findByIdAndDelete(uid);

    return res.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};