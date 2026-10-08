// controllers/activityController.js
const mongoose = require('mongoose');
const { updateUserActivity } = require('../services/activityService.js');
const User = require("../models/User");
const Wallet = require("../models/wallet.js");


exports.trackActivity = async (req, res) => {

    try {

        const { minutes, messageSent } = req.body;
        const userId = req.user?.sub || req.user?.id || req.user?._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }


        const activity =
            await updateUserActivity(
                userId,
                minutes || 5,
                messageSent || false
            );

        return res.status(200).json({ success: true, data: activity });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.recentActivity = async (req, res) => {
    try {

        const userId = req.user?.sub || req.user?.id || req.user?._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const allowedTypes = [
            'BUY_COIN',
            'TOPUP',
            'REFERRAL_BONUS',
            'CHAT_SPEND',
            'CHAT_EARN',
            'LIVE_TIP'
        ];

        const activities =
            await Wallet.find({
                userId: new mongoose.Types.ObjectId(userId),
                type: {
                    $in: allowedTypes
                }
            }).select('amount type description direction createdAt transactionId')
                .sort({ createdAt: -1 })
                .lean();

        const walletActivity =
            activities.map(activity => ({

                transactionId:
                    activity.transactionId,

                type:
                    activity.type,

                amount:
                    Number(activity.amount || 0),

                description:
                    activity.description || '',
                direction:
                    activity.direction || '',

                date:
                    activity.createdAt

            }));

        return res.status(200).json({
            success: true,
            totalActivities: walletActivity.length,
            data: walletActivity
        });



    } catch (error) {
        console.log('getWalletActivity Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });


    }

}

