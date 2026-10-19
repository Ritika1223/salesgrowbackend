const User = require("../models/User");
const Wallet = require("../models/wallet");
const Withdrawal = require("../models/Withdrawal");
const { passwordMatches } = require("./authController");
const { INVESTMENT } = require("../helper/rules");

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

function indiaHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(date);
  const n = Number(hour);
  return n === 24 ? 0 : n;
}

exports.createWithdrawal = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const hour = indiaHour();
    if (hour >= 10) {
      return res.status(400).json({ message: "Withdrawal request time is 12 AM to 10 AM" });
    }

    const amount = Number(req.body.amount);
    const upiId = String(req.body.upiId || "").trim();
    const transactionPassword = String(req.body.transactionPassword || "");

    if (!Number.isFinite(amount) || amount < INVESTMENT.minWithdraw) {
      return res.status(400).json({ message: `Minimum withdrawal is ${INVESTMENT.minWithdraw}` });
    }
    if (!upiId) return res.status(400).json({ message: "UPI ID is required" });

    const user = await User.findById(userId).select("+password +transactionPassword walletBalance");
    if (!user) return res.status(404).json({ message: "User not found" });

    const currentTx = String(user.transactionPassword || "").trim()
      ? user.transactionPassword
      : user.password;
    const ok = await passwordMatches(currentTx, transactionPassword);
    if (!ok) return res.status(400).json({ message: "Wrong transaction password" });

    const pending = await Withdrawal.find({ userId, status: "pending" });
    const reserved = pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (Number(user.walletBalance || 0) - reserved < amount) {
      return res.status(400).json({ message: "Not enough wallet balance" });
    }

    const deduction = Math.round(amount * INVESTMENT.withdrawDeductionPercent) / 100;
    const request = await Withdrawal.create({
      userId,
      amount,
      deduction,
      payout: Math.round((amount - deduction) * 100) / 100,
      upiId,
      status: "pending",
    });

    return res.status(201).json({
      message: "Withdrawal request sent to admin",
      data: request,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.myWithdrawals = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const list = await Withdrawal.find({ userId }).sort({ createdAt: -1 });
    return res.json({ data: list });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.listWithdrawals = async (req, res) => {
  try {
    const list = await Withdrawal.find()
      .populate("userId", "name email phone referralCode")
      .sort({ createdAt: -1 });
    return res.json({ data: list });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const status = String(req.body.status || "").toLowerCase();
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    const request = await Withdrawal.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `This request is already ${request.status}` });
    }

    if (status === "approved") {
      const user = await User.findOneAndUpdate(
        { _id: request.userId, walletBalance: { $gte: request.amount } },
        { $inc: { walletBalance: -request.amount, totalWithdraw: request.amount } },
        { new: true }
      );
      if (!user) {
        return res.status(400).json({ message: "User does not have enough balance" });
      }
      await Wallet.create({
        userId: request.userId,
        amount: request.amount,
        direction: "debit",
        type: "WITHDRAW",
        description: `Withdrawal to ${request.upiId}. Payout ${request.payout} after ${request.deduction} deduction`,
        transactionId: `WD-${request._id}`,
      });
    }

    request.status = status;
    request.reviewedAt = new Date();
    if (req.body.adminNote !== undefined) request.adminNote = String(req.body.adminNote);
    await request.save();

    return res.json({
      message: status === "approved" ? "Withdrawal approved" : "Withdrawal rejected",
      data: request,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
