const mongoose = require('mongoose');

const BankDetailsSchema = new mongoose.Schema(
  {
    upi: {
      type: String,
      required: true,
      trim: true
    },
    qrCode: {
      type: String, // store the path or URL to the QR code image
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('BankDetails', BankDetailsSchema);