const mongoose = require('mongoose');

const userActivitySchema =
    new mongoose.Schema({

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        date: {
            type: String // YYYY-MM-DD
        },

        totalMinutes: {
            type: Number,
            default: 0
        },

        messageCount: {
            type: Number,
            default: 0
        },

        isQualified: {
            type: Boolean,
            default: false
        }

    }, { timestamps: true });

module.exports =mongoose.model('UserActivity',userActivitySchema);