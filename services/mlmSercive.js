const bcrypt = require("bcrypt");
const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const Pool = require("../models/Pool");
const { PLANS, LEVEL_RULES, SUBSCRIPTION_INCOME } = require("../helper/rules");
const { updatePoolRank, updateBonusRank } = require("./rankService");

const POOL_PERCENT = SUBSCRIPTION_INCOME.POOL;
const POOL_LEVELS = 6;
const DIRECT_INC = SUBSCRIPTION_INCOME.DIRECT;


async function getEligiblePoolUsers(level) {

  const requirements = {
    1: 1,
    2: 20,
    3: 50,
    4: 100,
    5: 200,
    6: 500
  };
  const minDirects = requirements[level];
  if (!minDirects) return [];

  return await User.find({
    isActive: true, role: 'USER', activeDirectCount: { $gte: minDirects }
  });
}

async function getDirects(userId) {
  const user = await User.findById(userId).populate('directs');
  let b = user.directs.filter(d => d)

  return b.length;
}

async function onUserActivated(userId) {
  const user = await User.findById(userId);

  if (!user.referredBy) return;

  await User.findByIdAndUpdate(user.referredBy, {
    $inc: { activeDirectCount: 1 }
  });

}


// -------------------------------
// Distribute DIRECT INCOME
// -------------------------------

async function distributeDirectIncome(
  userId,
  amount,
  purchaseId
) {

  const user = await User.findById(userId);

  if (!user.referredBy) return { success: false, message: `No Sponsor found.` };

  const sponsor = await User.findById(
    user.referredBy
  );

  if (!sponsor) return { success: false, message: `Payment failed: No Sponsor found.` };

  // optional:
  // sponsor must be active
  if (!sponsor.isActive) return { success: false, message: `Payment failed: Sponsor is currently inactive.` };

  const directIncome =
    (amount * DIRECT_INC) / 100;

  const transactionId =
    `${purchaseId}-DIRECT-${sponsor._id}`;

  let credit = await creditWallet(
    sponsor._id,
    {
      amount: directIncome,
      type: 'DIRECT_INCOME',
      direction: 'credit',
      fromUserId: userId,
      description: 'Direct Referral Income',
      transactionId
    }
  );
  if (!credit.success) return { success: false, message: `Failed to credit Direct Income: ${directIncome}` };

  return { success: true, message: `Direct Income Paid: ${directIncome}` };

}

async function distributeSelfIncome(userId, amount, purchaseId) {
  const income = (amount * SUBSCRIPTION_INCOME.SELF) / 100;
  return creditWallet(userId, {
    amount: income,
    type: "SELF_INCOME",
    direction: "credit",
    description: "Self income from subscription",
    transactionId: `${purchaseId}-SELF-${userId}`,
  });
}

async function distributeRankIncome(userId, amount, purchaseId) {
  const user = await User.findById(userId);
  if (!user?.referredBy) return { success: true, message: "No sponsor for rank income" };

  const sponsor = await User.findById(user.referredBy);
  if (!sponsor || !sponsor.poolRank || sponsor.poolRank === "NONE") {
    return { success: true, message: "Sponsor has no rank yet" };
  }

  const income = (amount * SUBSCRIPTION_INCOME.RANK) / 100;
  return creditWallet(sponsor._id, {
    amount: income,
    type: "RANK_BONUS",
    direction: "credit",
    fromUserId: userId,
    description: "Rank income from subscription",
    transactionId: `${purchaseId}-RANK-${sponsor._id}`,
  });
}

async function distributeVipIncome(userId, amount, purchaseId) {
  const user = await User.findById(userId);
  if (!user?.referredBy) return { success: true, message: "No sponsor for VIP income" };

  const sponsor = await User.findById(user.referredBy);
  if (!sponsor || sponsor.plan !== "PREMIUM") {
    return { success: true, message: "Sponsor is not on the VIP plan" };
  }

  const income = (amount * SUBSCRIPTION_INCOME.VIP) / 100;
  return creditWallet(sponsor._id, {
    amount: income,
    type: "VIP_INCOME",
    direction: "credit",
    fromUserId: userId,
    description: "VIP income from subscription",
    transactionId: `${purchaseId}-VIP-${sponsor._id}`,
  });
}


// -------------------------------
// Distribute LEVEL INCOME
// -------------------------------

async function distributeLevelIncome(userId, amount, purchaseId) {
  let currentUser = await User.findById(userId);

  let level = 1;

  while (currentUser.referredBy && level <= 14) {

    const upline = await User.findById(currentUser.referredBy);
    const activeDirects = await getDirects(upline._id);

    const rule = LEVEL_RULES.find(r => r.level === level);

    if (!rule) break;

    if (activeDirects >= rule.minDirects) {
      const income = (amount * rule.percent) / 100;

      const transactionId = `${purchaseId}-L${level}-${upline._id}`;

      let credit = await creditWallet(upline._id, {
        amount: income,
        type: 'LEVEL_INCOME',
        direction: 'credit',
        level,
        fromUserId: userId,
        description: 'Distribute Level Income',
        transactionId
      });

      if (!credit.success) return { success: false, message: `Failed to credit Level Income: ${income}` };

      console.log(`Level ${level}: Paid ${income}`);
    }

    currentUser = upline;
    level++;
  }

  return { success: true, message: `Level Income distributed` };
}

// -------------------------------
// DISTRIBUTE DAILY POOL
// -------------------------------

async function distributeDailyPool() {
  try {

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const pools = await Pool.find({ date: today, distributed: false });

    for (const pool of pools) {
      const users = await getEligiblePoolUsers(pool.level);

      if (!users.length) {
        pool.distributed = true;
        pool.amount = 0;
        await pool.save();
        console.log(`No achievers for Pool ${pool.level}`);
        continue;
      }

      const share = pool.amount / users.length;

      for (const user of users) {
        try {

          const transactionId = `POOL-${today}-${pool.level}-${user._id}`;

          let credit = await creditWallet(
            user._id,
            {
              amount: share,
              type: 'POOL_INCOME',
              direction: 'credit',
              poolLevel: pool.level,
              description: 'Distribute Daily Pool',
              transactionId
            }
          );

          if (!credit.success) {
            console.log(`Pool Failed: ${user._id} ${credit.message}`);
            continue;
          }

        } catch (err) {
          console.log(`Pool Error for user ${user._id}`, err.message);
        }
      }

      pool.amount = 0;
      pool.distributed = true;
      await pool.save();
      console.log(`Pool ${pool.level} distributed`);
    }
    return {
      success: true,
      message:
        'Daily pool distributed'
    };


  } catch (err) {
    console.log('distributeDailyPool Error:', err);
    return { success: false, message: err.message };
  }
}


// -------------------------------
// UPDATE POOL BALANCE
// -------------------------------

async function addToPool(amount) {
  try {
    const totalPoolAmount = (amount * POOL_PERCENT) / 100;
    const perPool = totalPoolAmount / POOL_LEVELS;
    const today =
      new Date().toLocaleDateString(
        'en-CA',
        { timeZone: 'Asia/Kolkata' }
      );

    for (let i = 1; i <= 6; i++) {
      await Pool.findOneAndUpdate(
        {
          level: i,
          date: today,
        },
        {
          $inc: {
            amount: perPool
          },
          distributed: false
        },
        {
          upsert: true,
          returnDocument: 'after'
        }
      );
    }
    return { success: true, message: "Pool updated successfully" };
  } catch (error) {
    return { success: false, message: "Failed to update pool funds" };
  }
}


// -------------------------------
// CREDIT BALANCE
// -------------------------------

async function creditWallet(userId, data) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1. Prevent duplicate
    if (data.transactionId) {
      const exists = await Wallet.findOne({
        transactionId: data.transactionId
      });

      if (exists) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          message: 'Duplicate transaction'
        };
      }
    }

    await Wallet.create([{
      userId,
      ...data
    }], { session });


    let update = { $inc: {} };

    const earningTypes = ['LEVEL_INCOME', 'POOL_INCOME', 'RANK_BONUS', 'DIRECT_INCOME', 'SELF_INCOME', 'VIP_INCOME', 'SALARY_INCOME'];

    // MLM income stays on totalEarning. Chat coins (buy, spend, host earn) use walletBalance.
    if (earningTypes.includes(data.type)) {
      update.$inc.totalEarning = data.amount;
    } else {
      update.$inc.walletBalance = data.amount;
    }


    await User.findByIdAndUpdate(userId, update, { session });

    await session.commitTransaction();
    session.endSession();
    return {
      success: true,
      message: 'Wallet credited successfully',
    };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.log(
      'creditWallet Error:',
      err
    );
    return {
      success: false,
      message: err.message
    };
  }
}



module.exports = {
  onUserActivated,
  distributeDirectIncome,
  distributeSelfIncome,
  distributeRankIncome,
  distributeVipIncome,
  distributeLevelIncome,
  distributeDailyPool,
  addToPool,
  creditWallet,
};