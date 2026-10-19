const mongoose = require("mongoose");

const InvestmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlanRequest",
    },
    amount: { type: Number, required: true },
    principal: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    lastRoiOn: { type: String, default: "" },
    lastSalaryOn: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Investment", InvestmentSchema);
