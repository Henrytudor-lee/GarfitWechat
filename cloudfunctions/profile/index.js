// 云函数: profile
// 用户资料读写 / 等级信息（PostgreSQL）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const rdb = () => cloud.instance.rdb();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, error: '未登录' };

  try {
    const { data: user, error: err0 } = await rdb()
      .from('users')
      .select('*')
      .eq('openid', openid)
      .limit(1);
    if (err0) return { success: false, error: err0.message };
    if (!user || user.length === 0) return { success: false, error: '用户不存在' };
    const uid = user[0].id;

    if (event.action === 'get') {
      // 合并用户信息 + 等级 + 连续天数
      const [{ data: streak }, { data: level }] = await Promise.all([
        rdb().from('user_streaks').select('*').eq('user_id', uid).limit(1),
        rdb().from('user_levels').select('*').eq('user_id', uid).limit(1),
      ]);

      return {
        success: true,
        profile: {
          ...user[0],
          streak: streak && streak.length > 0 ? streak[0].streak : 0,
          level: level && level.length > 0 ? level[0].level : 1,
          label: level && level.length > 0 ? level[0].label : 'ROOKIE',
          score: level && level.length > 0 ? level[0].score : 0,
        },
      };
    }

    if (event.action === 'update') {
      const { nickname, avatar } = event;
      const updateData = {};
      if (nickname !== undefined) updateData.name = nickname;
      if (avatar !== undefined) updateData.avatar = avatar;
      updateData.updated_at = new Date().toISOString();

      const { error: err } = await rdb()
        .from('users')
        .update(updateData)
        .eq('id', uid);
      if (err) return { success: false, error: err.message };
      return { success: true };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
