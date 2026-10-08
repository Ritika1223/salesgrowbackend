const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Signed coin amount is stored in `amount` for backward compatibility.
  // For UI/API clarity we also store `credit` and `debit` as positive numbers.
  amount: {
    type: Number,
    required: true
  },

  direction: {
    type: String,
    enum: ['credit', 'debit'],
  },

  credit: {
    type: Number,
    default: 0
  },

  debit: {
    type: Number,
    default: 0
  },

  type: {
    type: String,
    enum: [
      'BUY_COIN',
      'TOPUP',
      'REFERRAL_BONUS',
      'CHAT_SPEND',
      'CHAT_EARN',
      'LIVE_TIP',
      'LEVEL_INCOME',
      'POOL_INCOME',
      'RANK_BONUS',
      'DIRECT_INCOME',
      'VIP_INCOME',
      'SELF_INCOME',
      'WITHDRAW',
      'ADMIN_ADJUST'
    ],
    required: true
  },

  level: {
    type: Number, // for level income (1–14)
    default: null
  },

  poolLevel: {
    type: Number, // for pool income (1–6)
    default: null
  },

  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },

  description: {
    type: String
  },

  transactionId: {
    type: String, // prevent duplicate payouts
    index: true
  }

}, { timestamps: true });

walletSchema.pre('validate', function syncCreditDebit() {
  const dir = String(this.direction || '').toLowerCase();
  const amt = Number(this.amount);
  if (!Number.isFinite(amt)) return;

  if (dir === 'credit') {
    this.amount = Math.abs(amt);
    this.credit = Math.abs(amt);
    this.debit = 0;
  } else if (dir === 'debit') {
    this.amount = Math.abs(amt);
    this.debit = Math.abs(amt);
    this.credit = 0;
  }
});

module.exports = mongoose.model('Wallet', walletSchema);