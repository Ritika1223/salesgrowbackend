const bcrypt = require("bcrypt");
const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const Pool = require("../models/Pool");
const { onUserActivated, distributeDirectIncome, distributeSelfIncome, distributeRankIncome, distributeVipIncome, distributeLevelIncome, addToPool, creditWallet } = require("../services/mlmSercive");
const { updatePoolRank, updateBonusRank } = require("../services/rankService");
const { PLANS, LEVEL_RULES } = require("../helper/rules");

const POOL_PERCENT = 12;
const POOL_LEVELS = 6;
const COINS_PER_RUPEE = 10;


function getPoolRank(level) {
  const ranks = {
    1: 'STARTER',
    2: 'ACTIVE',
    3: 'GROWTH',
    4: 'LEADER',
    5: 'CROWN',
    6: 'KING'
  };
  return ranks[level] || 'NONE';
}

async function activatePlanPurchase(userId, planName) {
  const plan = PLANS[planName];
  if (!plan) {
    return { success: false, message: "Invalid plan" };
  }

  const user = await User.findById(userId);
  if (!user) {
    return { success: false, message: "User not found" };
  }
  if (user.isActive) {
    return { success: false, message: "Already activated" };
  }

  const amount = plan.coins;
  const coin = plan.coins;
  const purchaseId = new mongoose.Types.ObjectId();

  const level = await distributeLevelIncome(userId, amount, purchaseId);
  if (!level.success) {
    return { success: false, message: "Failed to credit Level Income" };
  }

  const self = await distributeSelfIncome(userId, amount, purchaseId);
  if (!self.success) {
    return { success: false, message: self.message || "Failed to credit Self Income" };
  }

  if (user.referredBy) {
    const direct = await distributeDirectIncome(userId, amount, purchaseId);
    if (!direct.success && String(direct.message || "").startsWith("Failed to credit")) {
      return { success: false, message: direct.message };
    }

    await onUserActivated(userId);
    const poolrank = await updatePoolRank(user.referredBy);
    if (!poolrank.success) {
      return { success: false, message: "Failed to update rank" };
    }

    const rank = await distributeRankIncome(userId, amount, purchaseId);
    if (!rank.success) {
      return { success: false, message: rank.message || "Failed to credit Rank Income" };
    }

    const vip = await distributeVipIncome(userId, amount, purchaseId);
    if (!vip.success) {
      return { success: false, message: vip.message || "Failed to credit VIP Income" };
    }
  }

  const pool = await addToPool(amount);
  if (!pool.success) {
    return { success: false, message: "Failed to credit in pool" };
  }

  const credit = await creditWallet(userId, {
    amount: coin,
    type: "BUY_COIN",
    direction: "credit",
    description: "Plan purchase",
    transactionId: `${purchaseId}-BUY-${userId}`,
  });

  if (!credit.success) {
    return { success: false, message: `Failed to credit wallet: ${coin}` };
  }

  user.isActive = true;
  user.plan = planName;
  await user.save();

  return {
    success: true,
    message: "Plan purchased & activated successfully",
    coins: coin,
  };
}

exports.activatePlanPurchase = activatePlanPurchase;

exports.buyPlan = async (req, res) => {
  return res.status(403).json({
    success: false,
    error: "Submit payment details. Admin will verify and activate your plan.",
  });
};

exports.getPlans = async (req, res) => {
  const plans = Object.entries(PLANS).map(([name, values]) => ({
    name,
    price: values.price,
    coins: values.coins,
    hostPrivilege: true,
  }));
  return res.json({ plans });
};

exports.getReportStats = async (req, res) => {
  try {

    const authUserId = req.user?.sub || req.user?.id || req.user?._id;
    const user = await User.findById(authUserId)
    if (!user) return res.status(404).json({ sucess: false, message: "Not Found" })

    const levelIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'LEVEL_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalLeveIncome = levelIncome[0].total || 0;

    const poolIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'POOL_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalPoolIncome = poolIncome[0].total || 0;

    let currentlevel = 0;
    for (const rule of LEVEL_RULES) {
      if (user.activeDirectCount >= rule.minDirects) {
        currentlevel = rule.level;
      }
    }
    const pooltragets = [10, 20, 50, 100, 200, 500];
    let nextTragets = null;
    for (const targets of pooltragets) {
      if (user.activeDirectCount < targets) {
        nextTragets = targets;
        break;
      }
    }

    return res.status(200).json({
      sucess: true,
      data: {
        levelIncomeReport: {
          currentActiveLevel: currentlevel,
          totalDirectReferrals: user.activeDirectCount,
          totalLevelIncome: totalLeveIncome
        },
        poolIncomeReport: {
          currentPool: user.poolRank,
          totalPoolBonus: totalPoolIncome,
          directReferrals: user.activeDirectCount,
          nextTarget: nextTragets
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPoolReport = async (req, res) => {
  try {
    // Get latest pool date
    const latestPool = await Pool.findOne()
      .sort({ date: -1 });

    if (!latestPool) {
      return res.status(404).json({
        success: false,
        message: "No Data Found"
      });
    }

    // Get all pools for latest date
    const pools = await Pool.find({
      date: latestPool.date
    }).sort({ level: 1 });

    const poolData = pools.map(pool => ({
      level: pool.level,
      rank: getPoolRank(pool.level),
      amount: Number(pool.amount).toFixed(2),
      date: pool.date
    }));

    const totalPoolAmount = poolData.reduce(
      (sum, pool) => sum + Number(pool.amount),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        totalPools: poolData.length,
        totalPoolAmount,
        poolData
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


exports.getIncomeReport = async (req, res) => {
  try {
    const authUserId = req.user?.sub || req.user?.id || req.user?._id;
    const requestedUserId = req.body?.userId ?? req.query?.userId;
    if (
      requestedUserId != null &&
      String(requestedUserId).trim() !== "" &&
      String(requestedUserId) !== String(authUserId)
    ) {
      return res.status(404).json({ success: false, message: 'Invalid Request' });
    }
    const user = await User.findById(authUserId)
    if (!user) return res.status(404).json({ sucess: false, message: "Not Found" })

    const levelIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'LEVEL_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalLeveIncome = levelIncome[0]?.total || 0;

    const poolIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'POOL_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalPoolIncome = poolIncome[0]?.total || 0;


    const selfIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'SELF_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalSelfIncome = selfIncome[0]?.total || 0;

    const directIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'DIRECT_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalDirectIncome = directIncome[0]?.total || 0;

    const RankIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'RANK_BONUS'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalRankIncome = RankIncome[0]?.total || 0;

    const salaryIncome = await Wallet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(
            authUserId
          ),
          type: 'SALARY_INCOME'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    let totalSalaryIncome = salaryIncome[0]?.total || 0;


    return res.status(200).json({
      sucess: true,
      data: {
        SelfIncome: totalSelfIncome,
        SalaryIncome: totalSalaryIncome,
        DirectIncome: totalDirectIncome,
        LevelIncome: totalLeveIncome,
        PoolIncome: totalPoolIncome,
        RankIncome: totalRankIncome,
        TotalEarn: user.totalEarning,
        TotalWithdraw: user.totalWithdraw
      }

    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.getTopLeaders = async (req, res) => {

  try {
    const leaders = await User.find({
      isActive: true
    }).select('name totalEarning poolRank bonusRank profilePhoto ')
      .sort({ totalEarning: -1 })
      .limit(10)
      .lean();

    const leaderboard = leaders.map((user, index) => ({
      rankPosition: index + 1,
      name: user.name,
      photo: user.profilePhoto,
      totalEarning: user?.totalEarning,
      poolRank: user?.poolRank,
      bonusRank: user?.bonusRank
    }));

    return res.status(200).json({ success: true, total: leaderboard.length, data: leaderboard });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });

  }
}

exports.getFundReceived = async (req, res) => {
  try {
    const id = req.user?.sub || req.user?.id || req.user?._id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const kind = String(req.query.kind || "fund");
    const types = kind === "referral"
      ? ["REFERRAL_BONUS"]
      : ["BUY_COIN", "TOPUP", "ADMIN_ADJUST"];

    const rows = await Wallet.find({
      userId: new mongoose.Types.ObjectId(id),
      direction: "credit",
      type: { $in: types },
    })
      .populate({
        path: "fromUserId",
        select: "name referralCode nickname",
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWalletTransactions = async (req, res) => {

  try {

    const id = req.user?.sub || req.user?.id || req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }


    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 20;

    const skip = (page - 1) * limit;

    const filter = { userId: new mongoose.Types.ObjectId(id) };

    let startDate = new Date();
    
    switch (filter) {
      case 'today': startDate.setHours(0, 0, 0, 0);
        break;
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days': startDate.setDate(startDate.getDate() - 30);
        break;
      case 'year': startDate = new Date(new Date().getFullYear(), 0, 1); break;
      default:
        startDate = new Date(0);
    }
    
    if (startDate) {
      filter.createdAt = { $gte: startDate };
    }

    if (req.query.type === "SELF_INCOME") {
      filter.direction = "credit";
      filter.type = {
        $in: [
          'BUY_COIN',
          'TOPUP',
          'REFERRAL_BONUS',
          'CHAT_SPEND',
          'CHAT_EARN',
          'LIVE_TIP'
        ]
      }
    } else {
      filter.type = req.query.type;
      filter.direction = "credit";
    }

    const transactions = await Wallet.find(filter)
      .populate({
        path: 'fromUserId',
        select: 'name profilePhoto referralCode nickname'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Wallet.countDocuments(filter);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data: transactions

    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

};

exports.convertToDiamond = async (req, res) => {

  try {
    const { coin } = req.body;

    const userId = req.user?.sub || req.user?.id || req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ sucess: false, message: 'Unauthorized' })
    }

    const user = await User.findById(userId);

    if (coin > user.totalEarning) {
      return res.status(401).json({ sucess: false, message: `Invalid ${coin}` });
    }

    let diamond = coin / 10;

    const updatedUser = await User.findByIdAndUpdate(userId, {
      $inc: {
        totalEarning: - coin,
        diamondBalance: diamond

      }
    }, { new: true })

    if (!updatedUser) {
      return res.status(404).json({ sucess: false, message: "User not found" });
    }

    return res.status(200).json({ sucess: true, message: "updated successfully", user: updatedUser, });


  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });

  }
}


exports.getWalletHistory = async (req, res) => {
 try {
    const userId = req.user.id;

    const { filter } = req.query;


    let startDate = new Date();


    switch (filter) {

      case 'today': startDate
        .setHours(0, 0, 0, 0);
        break;


      case '7days':

        startDate.setDate(startDate.getDate() - 7);
        break;


      case '30days': startDate.setDate(startDate.getDate() - 30);
        break;


      case 'year':

        startDate = new Date(new Date().getFullYear(), 0, 1); break;
      default:

        startDate = new Date(0);

    }


    const data = await Wallet.find({ userId, createdAt: { $gte: startDate } })
      .sort({ createdAt: -1 });


    return res.json({ success: true, data });

  } catch (err) {

    return res.status(500).json({ success: false, message: err.message });
 }

};
