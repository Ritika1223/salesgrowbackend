const LEVEL_RULES = [
  { level: 1, percent: 15, minDirects: 1 },
  { level: 2, percent: 5, minDirects: 2 },
  { level: 3, percent: 3, minDirects: 3 },
  { level: 4, percent: 2, minDirects: 4 },
  { level: 5, percent: 2, minDirects: 5 },

  { level: 6, percent: 2, minDirects: 7 },
  { level: 7, percent: 2, minDirects: 7 },
  { level: 8, percent: 2.5, minDirects: 7 },
  { level: 9, percent: 2.5, minDirects: 7 },
  { level: 10, percent: 2.5, minDirects: 7 },

  { level: 11, percent: 2.5, minDirects: 9 },
  { level: 12, percent: 3, minDirects: 9 },
  { level: 13, percent: 3, minDirects: 9 },
  { level: 14, percent: 3, minDirects: 9 },
];

const PLANS = {
  BASIC: {
    price: 590,
    coins: 5500
  },
  STANDARD: {
    price: 1180,
    coins: 11800
  },
  PREMIUM: {
    price: 5900,
    coins: 65000
  }
};


const SUBSCRIPTION_INCOME = {
  SELF: 36,
  DIRECT: 12,
  POOL: 12,
  RANK: 4,
  VIP: 9,
};

/** All investment figures are US dollars. */
const INVESTMENT = {
  currency: "USD",
  min: 50,
  step: 50,
  roiPercent: 1,
  durationDays: 365,
  roiDays: "Monday to Saturday",
  dailyCap: 100000,
  minWithdraw: 5,
  withdrawDeductionPercent: 10,
  withdrawCreditHours: 24,
};

const DIRECT_LEVELS = [
  { from: 1, to: 1, percent: 5 },
  { from: 2, to: 2, percent: 2 },
  { from: 3, to: 3, percent: 1 },
];

/** Percent of a downline member's daily ROI paid up the team (ROI to ROI). */
const TEAM_LEVELS = [
  { from: 1, to: 1, percent: 20 },
  { from: 2, to: 2, percent: 10 },
  { from: 3, to: 3, percent: 5 },
  { from: 4, to: 4, percent: 5 },
  { from: 5, to: 11, percent: 3 },
  { from: 12, to: 21, percent: 2 },
];

/** Monthly salary. Self is the user's own active investment. Each of 3 legs must reach the team amount. */
const SALARY_SLABS = [
  { self: 100, leg: 1000, legs: 3, monthly: 50 },
  { self: 250, leg: 2500, legs: 3, monthly: 100 },
  { self: 500, leg: 5000, legs: 3, monthly: 200 },
  { self: 1000, leg: 10000, legs: 3, monthly: 500 },
];

function roiToRoiMatch(extra = {}) {
  return {
    direction: "credit",
    ...extra,
    $or: [
      { type: "ROI_TO_ROI" },
      { type: "LEVEL_INCOME", description: { $regex: "^ROI to ROI", $options: "i" } },
    ],
  };
}

/** Level 1 of a new fund. Older rows say "Direct Referral Income" and have no level. */
function directIncomeMatch(extra = {}) {
  return {
    direction: "credit",
    type: "DIRECT_INCOME",
    ...extra,
    $nor: [
      { level: { $gte: 2 } },
      { description: { $regex: "level\\s*([2-9]|1\\d)", $options: "i" } },
      { description: { $regex: "^ROI to ROI", $options: "i" } },
      { description: { $regex: "level income", $options: "i" } },
    ],
  };
}

/** Team levels below the direct sponsor, including older rows saved as direct income. */
function levelIncomeMatch(extra = {}) {
  return {
    direction: "credit",
    ...extra,
    $or: [
      {
        type: "LEVEL_INCOME",
        description: { $not: { $regex: "^ROI to ROI", $options: "i" } },
      },
      {
        type: "DIRECT_INCOME",
        level: { $gte: 2 },
      },
      {
        type: "DIRECT_INCOME",
        description: { $regex: "level\\s*([2-9]|1\\d)", $options: "i" },
      },
    ],
  };
}

function percentForLevel(table, level) {
  const row = table.find((item) => level >= item.from && level <= item.to);
  return row ? row.percent : 0;
}

/** Coins added when a user buys or receives a USDT fund. 50 → 500. 1000 → 1000. Every other amount uses the same 10 coins per USDT as the 50 fund. */
function coinsForUsdt(amount) {
  const paid = Number(amount);
  if (!Number.isFinite(paid) || paid <= 0) return 0;
  if (Math.abs(paid - 1000) < 0.001) return 1000;
  return Math.round(paid * 10);
}

function investmentAmountError(amount) {
  const paid = Number(amount);
  if (!Number.isFinite(paid) || paid < INVESTMENT.min) {
    return `Minimum investment is $${INVESTMENT.min}`;
  }
  if (Math.round(paid * 100) % Math.round(INVESTMENT.step * 100) !== 0) {
    return `Investment must be a multiple of $${INVESTMENT.step}`;
  }
  return "";
}

/** Crown from the user's active investment. $50–$249.99, $250–$999.99, $1000+. */
function crownForInvestment(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 50) return null;
  if (value < 250) return { level: 1, label: "1st Crown" };
  if (value < 1000) return { level: 2, label: "2nd Crown" };
  return { level: 3, label: "3rd Crown" };
}

function salaryForQualification(selfAmount, legAmounts) {
  const self = Number(selfAmount) || 0;
  const legs = Array.isArray(legAmounts) ? legAmounts.map((n) => Number(n) || 0) : [];
  let monthly = 0;
  for (const slab of SALARY_SLABS) {
    const qualified = legs.filter((amount) => amount >= slab.leg).length;
    if (self >= slab.self && qualified >= slab.legs) monthly = slab.monthly;
  }
  return monthly;
}

module.exports = {
  LEVEL_RULES,
  PLANS,
  SUBSCRIPTION_INCOME,
  INVESTMENT,
  DIRECT_LEVELS,
  TEAM_LEVELS,
  SALARY_SLABS,
  roiToRoiMatch,
  directIncomeMatch,
  levelIncomeMatch,
  percentForLevel,
  investmentAmountError,
  salaryForQualification,
  coinsForUsdt,
  crownForInvestment,
};