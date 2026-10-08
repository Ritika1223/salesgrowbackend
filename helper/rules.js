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

module.exports = { LEVEL_RULES, PLANS, SUBSCRIPTION_INCOME };