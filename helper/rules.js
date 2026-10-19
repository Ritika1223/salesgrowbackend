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

const INVESTMENT = {
  min: 50,
  max: 200,
  roiPercent: 1,
  durationDays: 365,
  dailyCap: 100000,
  minWithdraw: 200,
  withdrawDeductionPercent: 10,
};

const DIRECT_LEVELS = [
  { from: 1, to: 1, percent: 5 },
  { from: 2, to: 2, percent: 2 },
  { from: 3, to: 3, percent: 1 },
  { from: 4, to: 7, percent: 0.5 },
];

const TEAM_LEVELS = [
  { from: 1, to: 1, percent: 20 },
  { from: 2, to: 2, percent: 10 },
  { from: 3, to: 3, percent: 5 },
  { from: 4, to: 14, percent: 3 },
  { from: 15, to: 23, percent: 2 },
];

const SALARY_SLABS = [
  { min: 100000, daily: 200 },
  { min: 250000, daily: 500 },
  { min: 500000, daily: 1000 },
  { min: 1000000, daily: 2000 },
  { min: 2500000, daily: 5000 },
  { min: 5000000, daily: 10000 },
  { min: 10000000, daily: 15000 },
  { min: 25000000, daily: 30000 },
  { min: 50000000, daily: 40000 },
  { min: 100000000, daily: 50000 },
];

function percentForLevel(table, level) {
  const row = table.find((item) => level >= item.from && level <= item.to);
  return row ? row.percent : 0;
}

function salaryForBusiness(teamBusiness) {
  const amount = Number(teamBusiness) || 0;
  let daily = 0;
  for (const slab of SALARY_SLABS) {
    if (amount >= slab.min) daily = slab.daily;
  }
  return daily;
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
  salaryForBusiness,
};