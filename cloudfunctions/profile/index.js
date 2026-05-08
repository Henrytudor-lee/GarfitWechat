// 云函数: profile
// 用户资料读写 / 等级信息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, error: '未登录' };

  try {
    const { data: user } = await db.collection('users').where({ openid }).limit(1).get();
    if (!user || user.length === 0) return { success: false, error: '用户不存在' };
    const uid = user[0]._id;

    if (event.action === 'get') {
      // 合并用户信息 + 等级 + 连续天数
      const [{ data: streak }, { data: level }] = await Promise.all([
        db.collection('user_streaks').doc(uid).get(),
        db.collection('user_levels').doc(uid).get(),
      ]);

      return {
        success: true,
        profile: {
          ...user[0],
          streak: streak ? streak.streak : 0,
          level: level ? level.level : 1,
          label: level ? level.label : 'ROOKIE',
          score: level ? level.score : 0,
        },
      };
    }

    if (event.action === 'update') {
      const { nickname, avatar } = event;
      const updateData = { updated_at: db.serverDate() };
      if (nickname !== undefined) updateData.name = nickname;
      if (avatar !== undefined) updateData.avatar = avatar;

      await db.collection('users').doc(uid).update({ data: updateData });
      return { success: true };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
