const mongoose = require("mongoose");
const PaymentHistory = require("../models/PaymentHistory");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const { findCoinOffer } = require("../helper/coinOffers");
const { coinsForUsdt } = require("../helper/rules");

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
      coins: coinsForUsdt(offer.amount),
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
      .populate("userId", "name email phone referralCode")
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
      "name email phone walletBalance referralCode"
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

async function creditCoinsForPayment(paymentId, adminNote) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payment = await PaymentHistory.findById(paymentId).session(session);
    if (!payment) {
      await session.abortTransaction();
      return { status: 404, message: "Payment not found" };
    }
    if (payment.status === "completed" || Number(payment.coinsAdded) > 0) {
      await session.abortTransaction();
      return { status: 400, message: "Coins are already credited for this payment." };
    }
    if (!["pending", "approved", "declined"].includes(payment.status)) {
      await session.abortTransaction();
      return { status: 400, message: `Cannot credit a ${payment.status} payment.` };
    }

    const user = await User.findById(payment.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return { status: 404, message: "User not found" };
    }

    const rupees = Number(payment.amount);
    const coins = coinsForUsdt(rupees);
    if (!coins) {
      await session.abortTransaction();
      return { status: 400, message: "This payment has no coins to credit." };
    }

    const transactionId = `payment-${payment._id}`;
    const alreadyCredited = await Wallet.findOne({ transactionId }).session(session);
    if (!alreadyCredited) {
      user.walletBalance = (Number(user.walletBalance) || 0) + coins;
      await user.save({ session });
      await Wallet.create(
        [
          {
            userId: payment.userId,
            amount: coins,
            credit: coins,
            direction: "credit",
            type: "BUY_COIN",
            description: `Fund added ₹${rupees} → ${coins} coins (UTR: ${payment.transactionNo})`,
            transactionId,
          },
        ],
        { session }
      );
    }

    payment.status = "completed";
    payment.coins = coins;
    payment.coinsAdded = coins;
    if (adminNote !== undefined) payment.adminNote = adminNote;
    await payment.save({ session });
    await session.commitTransaction();

    return {
      status: 200,
      message: `Payment approved. ${coins} coins credited.`,
      data: {
        payment,
        coinsAdded: coins,
        walletBalance: user.walletBalance,
        coinsPerRupee: COINS_PER_RUPEE,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    try {
      await session.endSession();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Approve or decline a payment (admin).
 * Approving credits the coins immediately.
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!["approved", "declined"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or declined." });
    }

    if (status === "approved") {
      const result = await creditCoinsForPayment(id, adminNote);
      return res.status(result.status).json({
        message: result.message,
        data: result.data,
      });
    }

    const payment = await PaymentHistory.findById(id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    if (payment.status === "completed" || Number(payment.coinsAdded) > 0) {
      return res.status(400).json({ message: "Coins are already credited for this payment." });
    }
    if (payment.status === "declined") {
      return res.status(400).json({ message: "Payment is already declined." });
    }

    payment.status = "declined";
    if (adminNote !== undefined) payment.adminNote = adminNote;
    await payment.save();

    const populated = await PaymentHistory.findById(id).populate(
      "userId",
      "name email phone referralCode"
    );

    return res.status(200).json({
      message: "Payment declined",
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Credit coins for a payment that was approved before automatic credit.
 */
exports.addFundFromPayment = async (req, res) => {
  try {
    const result = await creditCoinsForPayment(req.params.id);
    return res.status(result.status).json({
      message: result.status === 200 ? "Fund added successfully" : result.message,
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get approved payments ready for fund addition (admin)
 */

exports.getApprovedPayments = async (req, res) => {
  try {
    const payments = await PaymentHistory.find({ status: "approved" })
      .populate("userId", "name email phone walletBalance referralCode")
      .sort({ createdAt: -1 });
    res.status(200).json({ data: payments, coinsPerRupee: COINS_PER_RUPEE });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};











