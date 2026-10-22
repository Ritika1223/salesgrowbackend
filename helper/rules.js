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

const TEAM_LEVELS = [
  { from: 1, to: 1, percent: 20 },
  { from: 2, to: 2, percent: 10 },
  { from: 3, to: 3, percent: 5 },
  { from: 4, to: 10, percent: 3 },
  { from: 15, to: 21, percent: 2 },
];

/** Monthly salary. Self is the user's own active investment. Each of 3 legs must reach the team amount. */
const SALARY_SLABS = [
  { self: 100, leg: 1000, legs: 3, monthly: 50 },
  { self: 250, leg: 2500, legs: 3, monthly: 100 },
  { self: 500, leg: 5000, legs: 3, monthly: 200 },
  { self: 1000, leg: 10000, legs: 3, monthly: 500 },
];

function percentForLevel(table, level) {
  const row = table.find((item) => level >= item.from && level <= item.to);
  return row ? row.percent : 0;
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
  percentForLevel,
  investmentAmountError,
  salaryForQualification,
};