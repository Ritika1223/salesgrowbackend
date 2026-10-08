const mongoose = require('mongoose');
const UserActivity = require("../models/UserActivity");


async function updateUserActivity( userId,minutes,messageSent = false) {

    const today =
        new Date().toLocaleDateString(
            'en-CA',
            {
                timeZone: 'Asia/Kolkata'
            }
        );

    const update = {
        $inc: {
            totalMinutes: minutes
        }
    };

    if (messageSent) {
        update.$inc.messageCount = 1;
    }

    const activity =
        await UserActivity.findOneAndUpdate(

            {
                userId,
                date: today
            },

            update,

            {
                upsert: true,
                returnDocument: 'after'
            }
        );

    // DAILY QUALIFICATION
    if (
        activity.totalMinutes >= 240 &&
        activity.messageCount > 0
    ) {

        activity.isQualified = true;

        await activity.save();
    }

    return activity;
}



module.exports = { updateUserActivity };