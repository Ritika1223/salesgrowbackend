const IncomeSettings = require("../models/IncomeSettings");
const {
  INVESTMENT,
  DIRECT_LEVELS,
  TEAM_LEVELS,
  SALARY_SLABS,
} = require("./rules");

let cache = null;
let cacheAt = 0;

function copyBands(rows) {
  return rows.map((row) => ({
    from: row.from,
    to: row.to,
    percent: row.percent,
  }));
}

function copySalary(rows) {
  return rows.map((row) => ({
    self: row.self,
    leg: row.leg,
    legs: row.legs,
    monthly: row.monthly,
  }));
}

function defaults() {
  return {
    roiPercent: INVESTMENT.roiPercent,
    levels: copyBands(DIRECT_LEVELS),
    roiToRoi: copyBands(TEAM_LEVELS),
    salary: copySalary(SALARY_SLABS),
    updatedAt: null,
  };
}

function asSettings(doc) {
  const base = defaults();
  if (!doc) return base;
  const roi = Number(doc.roiPercent);
  return {
    roiPercent: Number.isFinite(roi) ? roi : base.roiPercent,
    levels: Array.isArray(doc.levels) && doc.levels.length ? copyBands(doc.levels) : base.levels,
    roiToRoi: Array.isArray(doc.roiToRoi) && doc.roiToRoi.length ? copyBands(doc.roiToRoi) : base.roiToRoi,
    salary: Array.isArray(doc.salary) && doc.salary.length ? copySalary(doc.salary) : base.salary,
    updatedAt: doc.updatedAt || null,
  };
}

function cleanPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return Math.round(number * 100) / 100;
}

function cleanMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function mergeBands(base, incoming) {
  if (!Array.isArray(incoming) || incoming.length !== base.length) return null;
  const next = [];
  for (let i = 0; i < base.length; i += 1) {
    const percent = cleanPercent(incoming[i]?.percent);
    if (percent == null) return null;
    next.push({ from: base[i].from, to: base[i].to, percent });
  }
  return next;
}

function mergeSalary(base, incoming) {
  if (!Array.isArray(incoming) || incoming.length !== base.length) return null;
  const next = [];
  for (let i = 0; i < base.length; i += 1) {
    const self = cleanMoney(incoming[i]?.self);
    const leg = cleanMoney(incoming[i]?.leg);
    const monthly = cleanMoney(incoming[i]?.monthly);
    if (self == null || leg == null || monthly == null) return null;
    next.push({ self, leg, legs: base[i].legs, monthly });
  }
  return next;
}

async function getIncomeSettings() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const doc = await IncomeSettings.findOne({ key: "default" }).lean();
  cache = asSettings(doc);
  cacheAt = Date.now();
  return cache;
}

function clearIncomeSettingsCache() {
  cache = null;
  cacheAt = 0;
}

async function saveIncomeSettings(patch) {
  const current = await getIncomeSettings();
  const next = { ...current };
  if (patch.roiPercent !== undefined) {
    const roi = cleanPercent(patch.roiPercent);
    if (roi == null) {
      return { error: "Daily ROI percent must be between 0 and 100" };
    }
    next.roiPercent = roi;
  }
  if (patch.levels !== undefined) {
    const levels = mergeBands(current.levels, patch.levels);
    if (!levels) return { error: "Each level percent must be between 0 and 100" };
    next.levels = levels;
  }
  if (patch.roiToRoi !== undefined) {
    const roiToRoi = mergeBands(current.roiToRoi, patch.roiToRoi);
    if (!roiToRoi) return { error: "Each ROI to ROI percent must be between 0 and 100" };
    next.roiToRoi = roiToRoi;
  }
  if (patch.salary !== undefined) {
    const salary = mergeSalary(current.salary, patch.salary);
    if (!salary) return { error: "Salary amounts must be 0 or more" };
    next.salary = salary;
  }

  const saved = await IncomeSettings.findOneAndUpdate(
    { key: "default" },
    {
      key: "default",
      roiPercent: next.roiPercent,
      levels: next.levels,
      roiToRoi: next.roiToRoi,
      salary: next.salary,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  clearIncomeSettingsCache();
  return { settings: asSettings(saved) };
}

module.exports = {
  getIncomeSettings,
  saveIncomeSettings,
  clearIncomeSettingsCache,
};
