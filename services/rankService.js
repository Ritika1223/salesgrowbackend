const User = require('../models/User');
const UserActivity = require('../models/UserActivity');

async function updatePoolRank(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: "User not found" };
    }

    const directs = user.activeDirectCount;

    let rank = 'NONE';

    if (directs >= 500) rank = 'KING';
    else if (directs >= 200) rank = 'CROWN';
    else if (directs >= 100) rank = 'LEADER';
    else if (directs >= 50) rank = 'GROWTH';
    else if (directs >= 20) rank = 'ACTIVE';
    else if (directs >= 10) rank = 'STARTER';

    if (rank !== user.poolRank) {
      await User.findByIdAndUpdate(userId, { poolRank: rank }, { returnDocument: 'after' });

      console.log(`Rank Updated: ${rank}`);

      return { success: true, message: 'Rank updated', currentRank: rank };
    }
    return { success: true, message: 'Rank unchanged', currentRank: user.poolRank };
  } catch (error) {
    console.error("Rank Update Error:", error);
    return { success: false, message: "Error during rank update" };

  }
}

async function updateBonusRank(userId) {
  try {

    const user = await User.findById(userId);
  
    if (!user.isActive) return { success: false, message: 'User is inactive' };
    
    const activities = await UserActivity.find({ userId, isQualified: true }).sort({ date: -1 }).lean();
    
    let streak = 0;
    
    const today = new Date();
    
    for (let i = 0; i < activities.length; i++) {
      
      const activityDate = new Date(activities[i].date);
      const expectedDate = new Date();
      expectedDate.setDate(today.getDate() - i);
      
      const a = activityDate.toISOString().split('T')[0];
      const b = expectedDate.toISOString().split('T')[0];
      
      if (a == b) {
        streak++;
      } else {
        break;
      }
    }
    
    let rank = 'NONE';
    // console.log(streak);
    
    if (streak >= 25)
      rank = 'SUPER_CHAT_PRO_X';

    else if (streak >= 20)
      rank = 'CHAT_PRO_X';

    else if (streak >= 10)
      rank = 'CHAT_PRO';

    else if (streak >= 5)
      rank = 'GO_CHAT';

    if (rank !== user.bonusRank) {
      await User.findByIdAndUpdate(
        userId,
        {
          bonusRank: rank
        },
        {
          returnDocument: 'after'
        }
      );
      console.log(
        `Bonus Rank Updated: ${rank}`
      );
    }

    return {

      success: true,
      message: 'Bonus rank updated successfully',
      data: {
        streak,
        bonusRank: rank
      }
    };

  } catch (error) {
    console.log('updateBonusRank Error:', error);

    return { success: false, message: error.message };
  }

}


module.exports = {
  updatePoolRank,
  updateBonusRank
};