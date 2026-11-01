const User = require("../models/User");
const Wallet = require("../models/wallet");
const CoinWithdrawal = require("../models/CoinWithdrawal");

const MIN_COIN_WITHDRAW = 500;

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

async function pendingReserved(userId) {
  const pending = await CoinWithdrawal.find({ userId, status: "pending" }).select("amount");
  return pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

exports.myCoinWithdrawals = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId).select("walletBalance withdrawStopped profileMode");
    if (!user) return res.status(404).json({ message: "User not found" });
    if ((user.profileMode || "user") !== "host") {
      return res.status(403).json({ message: "Coin withdrawal is only available for host profiles" });
    }

    const reserved = await pendingReserved(userId);
    const balance = Number(user.walletBalance) || 0;
    const list = await CoinWithdrawal.find({ userId }).sort({ createdAt: -1 });

    return res.json({
      balance,
      pending: reserved,
      available: Math.max(0, balance - reserved),
      minimum: MIN_COIN_WITHDRAW,
      withdrawStopped: Boolean(user.withdrawStopped),
      data: list,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.createCoinWithdrawal = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const amount = Math.floor(Number(req.body.amount));
    const payoutAddress = String(req.body.payoutAddress || req.body.upiId || "").trim();

    if (!Number.isInteger(amount) || amount < MIN_COIN_WITHDRAW) {
      return res.status(400).json({ message: `Minimum withdrawal is ${MIN_COIN_WITHDRAW} coins` });
    }
    if (!payoutAddress) {
      return res.status(400).json({ message: "UPI or USDT address is required" });
    }

    const user = await User.findById(userId).select("walletBalance withdrawStopped profileMode");
    if (!user) return res.status(404).json({ message: "User not found" });
    if ((user.profileMode || "user") !== "host") {
      return res.status(403).json({ message: "Coin withdrawal is only available for host profiles" });
    }
    if (user.withdrawStopped) {
      return res.status(403).json({ message: "Withdrawal is stopped for your account. Please contact admin." });
    }

    const reserved = await pendingReserved(userId);
    const available = (Number(user.walletBalance) || 0) - reserved;
    if (available < amount) {
      return res.status(400).json({ message: "Not enough coins" });
    }

    const request = await CoinWithdrawal.create({
      userId,
      amount,
      payoutAddress,
      status: "pending",
    });

    return res.status(201).json({
      message: "Withdrawal request sent. Admin will accept or reject it.",
      data: request,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.listCoinWithdrawals = async (req, res) => {
  try {
    const list = await CoinWithdrawal.find()
      .populate("userId", "name nickname phone email walletBalance")
      .sort({ createdAt: -1 });
    return res.json({ data: list });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updateCoinWithdrawalStatus = async (req, res) => {
  try {
    const status = String(req.body.status || "").toLowerCase();
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    const claim = {
      status,
      reviewedAt: new Date(),
    };
    if (req.body.adminNote !== undefined) claim.adminNote = String(req.body.adminNote);

    const request = await CoinWithdrawal.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { $set: claim },
      { new: true }
    );
    if (!request) {
      const existing = await CoinWithdrawal.findById(req.params.id).select("status");
      if (!existing) return res.status(404).json({ message: "Request not found" });
      return res.status(400).json({ message: `This request is already ${existing.status}` });
    }

    if (status === "approved") {
      const updated = await User.findOneAndUpdate(
        { _id: request.userId, walletBalance: { $gte: request.amount } },
        { $inc: { walletBalance: -request.amount } },
        { new: true }
      );
      if (!updated) {
        await CoinWithdrawal.updateOne(
          { _id: request._id },
          { $set: { status: "pending", reviewedAt: null } }
        );
        return res.status(400).json({ message: "User does not have enough coins" });
      }

      try {
        await Wallet.create({
          userId: request.userId,
          amount: request.amount,
          direction: "debit",
          type: "WITHDRAW",
          description: `Coin withdrawal to ${request.payoutAddress}`,
          transactionId: `CWD-${request._id}`,
          status: "SUCCESS",
        });
      } catch (ledgerErr) {
        await User.updateOne(
          { _id: request.userId },
          { $inc: { walletBalance: request.amount } }
        );
        await CoinWithdrawal.updateOne(
          { _id: request._id },
          { $set: { status: "pending", reviewedAt: null } }
        );
        throw ledgerErr;
      }
    }

    return res.json({
      message: status === "approved" ? "Withdrawal approved" : "Withdrawal rejected",
      data: request,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
