const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  /** Optional at signup. Sparse so users with no nickname do not collide on null. */
  nickname: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  about: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true,
    default: null
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true
  },
  sex: {
    type: String,
    trim: true,
    default: null
  },
  age: {
    type: Number,
    min: 18,
    max: 99,
    default: null
  },
  city: {
    type: String,
    trim: true,
    default: ""
  },
  /** Admin can disable login without deleting the account. */
  isDisabled: {
    type: Boolean,
    default: false
  },

  profilePhoto: {
    type: String,
    default: ""
  },
  gallery: [
    {
      type: String
    }
  ],
  phone: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  /** Empty until the user sets one. Until then it matches the login password. */
  transactionPassword: {
    type: String,
    select: false,
    default: ""
  },
  referralCode: {
    type: String,
    trim: true,
    uppercase: true,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  directs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  activeDirectCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: ['BASIC', 'STANDARD', 'PREMIUM', 'INVEST'],
    default: null
  },
  role: {
    type: String,
    enum: ['USER', 'ADMIN'],
    default: "USER"
  },
  poolRank: {
    type: String
  },
  bonusRank: {
    type: String
  },

  totalReferrals: {
    type: Number,
    default: 0,
    min: 0
  },
  walletBalance: {
    type: Number,
    default: 150
  },
  diamondBalance: {
    type: Number,
    default: 0
  },
  totalEarning: {
    type: Number,
    default: 0
  },
  teamBusiness: {
    type: Number,
    default: 0
  },
  totalWithdraw: {
    type: Number,
    default: 0
  },
  freeMessagesRemaining: {
    type: Number,
    default: 50,
    min: 0
  },
  /** "user" = DM + join live only. "host" = groups + start live + DM. */
  profileMode: {
    type: String,
    enum: ["user", "host"],
    default: "user"
  },
  /** After admin verifies host payment, user may switch user/host freely. */
  hostApproved: {
    type: Boolean,
    default: false
  },

  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  blockedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  pushSubscriptions: [
    {
      endpoint: { type: String, required: true },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
      }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
