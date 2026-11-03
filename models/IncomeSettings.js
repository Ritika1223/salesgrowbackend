const mongoose = require("mongoose");

const bandSchema = new mongoose.Schema(
  {
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    percent: { type: Number, required: true },
  },
  { _id: false }
);

const salarySchema = new mongoose.Schema(
  {
    self: { type: Number, required: true },
    leg: { type: Number, required: true },
    legs: { type: Number, required: true },
    monthly: { type: Number, required: true },
  },
  { _id: false }
);

const incomeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    roiPercent: { type: Number, default: 1 },
    levels: { type: [bandSchema], default: [] },
    roiToRoi: { type: [bandSchema], default: [] },
    salary: { type: [salarySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IncomeSettings", incomeSettingsSchema);
