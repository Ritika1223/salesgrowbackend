const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: true
  },

  amount: {
    type: Number,
    default: 0
  },

  distributed: {
    type: Boolean,
    default: false
  },

  date: {
    type: String, // YYYY-MM-DD
    required: true
  }

}, { timestamps: true });

module.exports = mongoose.model('Pool', poolSchema);