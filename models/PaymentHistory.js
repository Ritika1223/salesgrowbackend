const mongoose = require('mongoose');

const PaymentHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    transactionNo: {
      type: String,
      required: true,
      trim: true,
    },
    screenshot: {
      type: String,
    },
    userName: {
      type: String,
      default: "",
    },
    userEmail: {
      type: String,
      default: "",
    },
    userPhone: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'completed'],
      default: 'pending',
    },
    coinsAdded: {
      type: Number,
      default: 0,
    },
    coins: {
      type: Number,
      default: 0,
    },
    offerId: {
      type: String,
      default: "",
    },
    adminNote: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);


module.exports = mongoose.model('PaymentHistory', PaymentHistorySchema);
