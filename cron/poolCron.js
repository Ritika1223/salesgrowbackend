const cron = require('node-cron');
const { distributeDailyPool } = require('../services/mlmSercive');
const { updateBonusRank } = require('../services/rankService');
const User = require('../models/User');

exports.startCron = async () => {

    // DAILY POOL DISTRIBUTION
    cron.schedule('59 23 * * *', async () => {
        // cron.schedule('*/1 * * * *', async () => {
        try {
            console.log('Running Daily Pool Distribution');
            const result = await distributeDailyPool();
            console.log(result);

        } catch (err) {
            console.log('Pool Cron Error:', err.message);
        }
    });

    // DAILY POOL DISTRIBUTION
    // cron.schedule('59 23 * * *', async () => {
    cron.schedule('*/1 * * * *', async () => {
        try {
            console.log('Running Bonus Rank Cron');

            // const users = await User.find({ isActive: true, role: 'USER', profileMode: 'host' });
            const users = await User.find({ isActive: true, role: 'USER' });
            
            for(let user of users){
                const result = await updateBonusRank(user._id);
                // console.log(result);
            }

        } catch (err) {
            console.log('Bonus Rank Cron Error', err.message);
        }
    });
};


