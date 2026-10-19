const User = require("../models/User");
const Wallet = require("../models/wallet");
const Investment = require("../models/Investment");
const { creditWallet } = require("./mlmSercive");
const {
  INVESTMENT,
  DIRECT_LEVELS,
  TEAM_LEVELS,
  percentForLevel,
  salaryForBusiness,
} = require("../helper/rules");

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function isRoiDay(date) {
  const day = new Date(date).getDay();
  return day >= 1 && day <= 6;
}

async function creditedToday(userId, date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await Wallet.find({
    userId,
    direction: "credit",
    createdAt: { $gte: start, $lt: end },
    type: { $in: ["SELF_INCOME", "DIRECT_INCOME", "LEVEL_INCOME", "SALARY_INCOME"] },
  }).select("amount");
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function creditCapped(userId, payload, date) {
  const already = await creditedToday(userId, date);
  const room = INVESTMENT.dailyCap - already;
  if (room <= 0) return { success: true, skipped: true };
  const amount = roundMoney(Math.min(payload.amount, room));
  if (amount <= 0) return { success: true, skipped: true };
  return creditWallet(userId, { ...payload, amount });
}

async function acceptInvestment(userId, amount, requestId) {
  const paid = Number(amount);
  if (!Number.isFinite(paid) || paid < INVESTMENT.min || paid > INVESTMENT.max) {
    return { success: false, message: `Investment must be ${INVESTMENT.min} to ${INVESTMENT.max}` };
  }

  const user = await User.findById(userId);
  if (!user) return { success: false, message: "User not found" };

  const active = await Investment.findOne({ userId, status: "active", endsAt: { $gt: new Date() } });
  if (active) {
    return { success: false, message: "This user already has an active 365 day investment" };
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt);
  endsAt.setDate(endsAt.getDate() + INVESTMENT.durationDays);

  const investment = await Investment.create({
    userId,
    requestId,
    amount: paid,
    principal: paid,
    startedAt,
    endsAt,
    status: "active",
  });

  user.isActive = true;
  user.plan = "INVEST";
  user.teamBusiness = Number(user.teamBusiness || 0) + paid;
  await user.save();

  await creditWallet(userId, {
    amount: paid,
    type: "TOPUP",
    direction: "credit",
    description: "Investment amount",
    transactionId: `${investment._id}-AMOUNT`,
  });

  let sponsorId = user.referredBy;
  for (let level = 1; level <= 7 && sponsorId; level += 1) {
    const sponsor = await User.findById(sponsorId);
    if (!sponsor) break;
    sponsor.teamBusiness = Number(sponsor.teamBusiness || 0) + paid;
    await sponsor.save();

    const directPercent = percentForLevel(DIRECT_LEVELS, level);
    if (directPercent) {
      await creditCapped(sponsor._id, {
        amount: roundMoney((paid * directPercent) / 100),
        type: "DIRECT_INCOME",
        direction: "credit",
        fromUserId: userId,
        level,
        description: `Direct income level ${level}`,
        transactionId: `${investment._id}-DIRECT-${level}-${sponsor._id}`,
      }, startedAt);
    }
    sponsorId = sponsor.referredBy;
  }

  for (let level = 8; level <= 23 && sponsorId; level += 1) {
    const sponsor = await User.findById(sponsorId);
    if (!sponsor) break;
    sponsor.teamBusiness = Number(sponsor.teamBusiness || 0) + paid;
    await sponsor.save();
    sponsorId = sponsor.referredBy;
  }

  if (isRoiDay(startedAt)) {
    await payDailyRoi(investment, startedAt);
  }

  return { success: true, investment };
}

async function payTeamOnRoi(investorId, roi, investmentId, key, date) {
  const investor = await User.findById(investorId).select("referredBy");
  let sponsorId = investor?.referredBy;
  for (let level = 1; level <= 23 && sponsorId; level += 1) {
    const sponsor = await User.findById(sponsorId).select("referredBy");
    if (!sponsor) break;
    const teamPercent = percentForLevel(TEAM_LEVELS, level);
    if (teamPercent) {
      await creditCapped(sponsor._id, {
        amount: roundMoney((roi * teamPercent) / 100),
        type: "LEVEL_INCOME",
        direction: "credit",
        fromUserId: investorId,
        level,
        description: `Team income ${teamPercent}% of ROI`,
        transactionId: `${investmentId}-TEAM-${level}-${key}`,
      }, date);
    }
    sponsorId = sponsor.referredBy;
  }
}

async function payDailyRoi(row, now) {
  const key = dayKey(now);
  if (row.lastRoiOn === key) return;
  const roi = roundMoney((Number(row.amount) * INVESTMENT.roiPercent) / 100);
  const credit = await creditCapped(row.userId, {
    amount: roi,
    type: "SELF_INCOME",
    direction: "credit",
    description: "1% daily ROI",
    transactionId: `${row._id}-ROI-${key}`,
  }, now);
  if (credit.success && !credit.skipped) {
    await payTeamOnRoi(row.userId, roi, row._id, key, now);
    row.lastRoiOn = key;
    await row.save();
  }
}

async function runDailyInvestmentIncome(now = new Date()) {
  if (!isRoiDay(now)) return { success: true, skipped: true };
  const key = dayKey(now);
  const rows = await Investment.find({ status: "active", endsAt: { $gt: now } });

  for (const row of rows) {
    if (row.lastRoiOn !== key) {
      await payDailyRoi(row, now);
    }

    if (row.lastSalaryOn !== key) {
      const user = await User.findById(row.userId).select("teamBusiness");
      const salary = salaryForBusiness(user?.teamBusiness);
      if (salary > 0) {
        await creditCapped(row.userId, {
          amount: salary,
          type: "SALARY_INCOME",
          direction: "credit",
          description: "Salary income",
          transactionId: `${row._id}-SALARY-${key}`,
        }, now);
      }
      row.lastSalaryOn = key;
    }

    await row.save();
  }

  await Investment.updateMany(
    { status: "active", endsAt: { $lte: now } },
    { $set: { status: "closed" } }
  );

  return { success: true };
}

module.exports = { acceptInvestment, runDailyInvestmentIncome };
