const mongoose = require("mongoose");
const User = require("../models/User");
const Group = require("../models/Group");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const Wallet = require("../models/wallet");
const LiveSession = require("../models/LiveSession");
const HostRequest = require("../models/HostRequest");
const PaymentHistory = require("../models/PaymentHistory");
const UserActivity = require("../models/UserActivity");
const Support = require("../models/Support");
const { roiToRoiMatch } = require("../helper/rules");

exports.listRoiToRoiIncome = async (req, res) => {
  try {
    const rows = await Wallet.find(roiToRoiMatch())
      .populate({ path: "userId", select: "name nickname referralCode phone" })
      .populate({ path: "fromUserId", select: "name nickname referralCode" })
      .sort({ createdAt: -1 })
      .lean();

    const amount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return res.json({ success: true, data: rows, count: rows.length, amount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("+password")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ users, count: users.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.setUserDisabled = async (req, res) => {
  try {
    const { id } = req.params;
    const isDisabled = Boolean(req.body?.isDisabled);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isDisabled },
      { new: true }
    ).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      message: isDisabled
        ? "User account inactivated. Login is blocked."
        : "User account activated. Login is allowed.",
      user,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const {
      name,
      nickname,
      email,
      phone,
      password,
      city,
      age,
      sex,
      category,
      about,
      walletBalance,
      diamondBalance,
      plan,
      isActive,
      profileMode,
    } = req.body;

    const nextName = name !== undefined ? String(name).trim() : user.name;
    const nextNickname =
      nickname !== undefined ? String(nickname).trim() : user.nickname;
    const nextEmail =
      email !== undefined ? String(email).trim().toLowerCase() : user.email;
    const nextPhone = phone !== undefined ? String(phone).trim() : user.phone;

    if (!nextName || !nextNickname || !nextEmail || !nextPhone) {
      return res.status(400).json({
        message: "Name, nickname, email and phone are required",
      });
    }

    const clash = await User.findOne({
      _id: { $ne: id },
      $or: [
        { name: nextName },
        { nickname: nextNickname },
        { email: nextEmail },
        { phone: nextPhone },
      ],
    });
    if (clash) {
      return res.status(409).json({
        message: "Name, nickname, email or phone is already used",
      });
    }

    user.name = nextName;
    user.nickname = nextNickname;
    user.email = nextEmail;
    user.phone = nextPhone;

    if (password !== undefined && String(password).trim() !== "") {
      if (String(password).trim().length < 6) {
        return res.status(400).json({
          message: "Password must be at least 6 characters",
        });
      }
      user.password = String(password).trim();
    }

    if (city !== undefined) user.city = String(city || "").trim();
    if (sex !== undefined) user.sex = String(sex || "").trim() || null;
    if (category !== undefined) {
      user.category = String(category || "").trim() || null;
    }
    if (about !== undefined) user.about = String(about || "").trim();

    if (age !== undefined && age !== null && String(age).trim() !== "") {
      const parsedAge = Number(age);
      if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 99) {
        return res.status(400).json({ message: "Age must be between 18 and 99" });
      }
      user.age = parsedAge;
    }

    if (walletBalance !== undefined && walletBalance !== "") {
      const coins = Number(walletBalance);
      if (!Number.isFinite(coins) || coins < 0) {
        return res.status(400).json({ message: "Invalid wallet balance" });
      }
      user.walletBalance = coins;
    }

    if (diamondBalance !== undefined && diamondBalance !== "") {
      const diamonds = Number(diamondBalance);
      if (!Number.isFinite(diamonds) || diamonds < 0) {
        return res.status(400).json({ message: "Invalid diamond balance" });
      }
      user.diamondBalance = diamonds;
    }

    if (plan !== undefined) {
      const nextPlan = String(plan || "").trim().toUpperCase();
      if (!nextPlan) {
        user.plan = null;
      } else if (["BASIC", "STANDARD", "PREMIUM"].includes(nextPlan)) {
        user.plan = nextPlan;
      } else {
        return res.status(400).json({ message: "Invalid plan" });
      }
    }

    if (isActive !== undefined) {
      user.isActive = Boolean(isActive);
      if (user.isActive) user.hostApproved = true;
    }

    if (profileMode !== undefined) {
      const mode = String(profileMode || "user");
      if (!["user", "host"].includes(mode)) {
        return res.status(400).json({ message: "profileMode must be user or host" });
      }
      user.profileMode = mode;
      if (mode === "host") user.hostApproved = true;
    }

    await user.save();
    const fresh = await User.findById(id).select("+password");

    return res.json({
      message: "User profile updated",
      user: fresh,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Duplicate profile field" });
    }
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteUserCompletely = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const uid = user._id;

    await Promise.all([
      Message.deleteMany({
        $or: [{ senderId: uid }, { receiverId: uid }],
      }),
      Conversation.deleteMany({ participants: uid }),
      Wallet.deleteMany({
        $or: [{ userId: uid }, { fromUserId: uid }],
      }),
      Group.deleteMany({ createdBy: uid }),
      Group.updateMany({ members: uid }, { $pull: { members: uid } }),
      LiveSession.deleteMany({ hostId: uid }),
      LiveSession.updateMany(
        { participantIds: uid },
        { $pull: { participantIds: uid } }
      ),
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
      User.updateMany(
        {},
        {
          $pull: {
            followers: uid,
            blockedUsers: uid,
            directs: uid,
          },
        }
      ),
      User.updateMany({ referredBy: uid }, { $set: { referredBy: null } }),
    ]);

    await User.deleteOne({ _id: uid });

    return res.json({
      message: "User profile deleted completely.",
      deletedId: String(uid),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listAllGroups = async (req, res) => {
  try {
    const groups = await Group.find()
      .populate("members", "name email phone profileMode")
      .populate("createdBy", "name email phone")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ groups, count: groups.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
