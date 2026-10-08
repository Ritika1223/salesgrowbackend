const mongoose = require("mongoose");
const PaymentHistory = require("../models/PaymentHistory");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const { findCoinOffer } = require("../helper/coinOffers");

const COINS_PER_RUPEE = 10;

/**
 * Create a new payment history entry (user submits payment proof)
*/

exports.createPaymentHistory = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id || req.body.userId;
    const { amount, transactionNo, offerId } = req.body;

    if (!userId || !transactionNo) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const offer = findCoinOffer(offerId);
    if (!offer) {
      return res.status(400).json({ message: "Select a coin offer pack." });
    }

    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }
    if (Math.abs(Number(offer.amount) - rupees) > 0.001) {
      return res.status(400).json({
        message: `Amount must be ₹${offer.amount} for this offer.`,
      });
    }

    const screenshot = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.screenshot || "";

    const payer = await User.findById(userId).select("name email phone");

    const payment = new PaymentHistory({
      userId,
      userName: payer?.name || "",
      userEmail: payer?.email || "",
      userPhone: payer?.phone || "",
      amount: offer.amount,
      coins: offer.coins,
      offerId: offer.id,
      transactionNo: String(transactionNo).trim(),
      screenshot,
      status: "pending",
    });

    await payment.save();
    res.status(201).json({ message: "Payment submitted successfully", data: payment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get all payment histories (admin)
 */
exports.getAllPaymentHistories = async (req, res) => {
  try {
    const payments = await PaymentHistory.find()
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 });
    res.status(200).json({ data: payments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get payment history by ID
 */
exports.getPaymentHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await PaymentHistory.findById(id).populate(
      "userId",
      "name email phone walletBalance"
    );
    if (!payment) {
      return res.status(404).json({ message: "Payment history not found" });
    }
    res.status(200).json({ data: payment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get payment histories by user ID
 */
exports.getPaymentHistoriesByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const payments = await PaymentHistory.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ data: payments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Approve or decline a payment (admin)
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!["approved", "declined"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or declined." });
    }

    const payment = await PaymentHistory.findById(id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.status === "completed") {
      return res.status(400).json({ message: "Payment already completed." });
    }

    if (payment.status === "declined" && status === "approved") {
      // allow re-approval after decline
    } else if (payment.status !== "pending" && status !== payment.status) {
      return res.status(400).json({
        message: `Cannot change status from ${payment.status} to ${status}.`,
      });
    }

    payment.status = status;
    if (adminNote !== undefined) payment.adminNote = adminNote;
    await payment.save();

    const populated = await PaymentHistory.findById(id).populate(
      "userId",
      "name email phone"
    );

    res.status(200).json({
      message: `Payment ${status}`,
      data: populated,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Add fund (coins) to user based on an approved payment (admin)
 */

exports.addFundFromPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const payment = await PaymentHistory.findById(id).session(session);

    if (!payment) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.status !== "approved") {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Only approved payments can be credited.",
      });
    }

    const user = await User.findById(payment.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const rupees = Number(payment.amount);
    const offer = findCoinOffer(payment.offerId);
    const coins = Number(payment.coins) || offer?.coins || Math.round(rupees * COINS_PER_RUPEE);

    user.walletBalance = (Number(user.walletBalance) || 0) + coins;
    await user.save({ session });

    await Wallet.create(
      [
        {
          userId: payment.userId,
          amount: coins,
          direction: "credit",
          type: "BUY_COIN",
          description: `Fund added ₹${rupees} → ${coins} coins (UTR: ${payment.transactionNo})`,
          transactionId: `payment-${payment._id}`,
        },
      ],
      { session }
    );

    payment.status = "completed";
    payment.coinsAdded = coins;
    await payment.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: "Fund added successfully",
      data: {
        payment,
        coinsAdded: coins,
        walletBalance: user.walletBalance,
        coinsPerRupee: COINS_PER_RUPEE,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    try {
      await session.endSession();
    } catch {
      /* ignore */
    }
  }
};

/**
 * Get approved payments ready for fund addition (admin)
 */

exports.getApprovedPayments = async (req, res) => {
  try {
    const payments = await PaymentHistory.find({ status: "approved" })
      .populate("userId", "name email phone walletBalance")
      .sort({ createdAt: -1 });
    res.status(200).json({ data: payments, coinsPerRupee: COINS_PER_RUPEE });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};











