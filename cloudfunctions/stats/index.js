// 云函数: stats
// 用户训练统计数据
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

    // 并发查询多个统计维度
    const [
      sessionsResult,
      exercisesResult,
      streakResult,
      levelResult,
      recentSessions,
    ] = await Promise.all([
      // 总训练次数
      db.collection('sessions').where({ user_id: uid, is_done: 1 }).count(),
      // 总动作数
      db.collection('exercises').where({ user_id: uid }).count(),
      // 连续天数
      db.collection('user_streaks').doc(uid).get(),
      // 等级
      db.collection('user_levels').doc(uid).get(),
      // 最近7次训练记录
      db.collection('sessions')
        .where({ user_id: uid, is_done: 1 })
        .orderBy('start_time', 'desc')
        .limit(7)
        .get(),
    ]);

    // 计算本周训练次数
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekSessions = await db.collection('sessions')
      .where({
        user_id: uid,
        is_done: 1,
        start_time: db.command.gte(weekStart),
      })
      .count();

    // 计算总训练时长（秒）
    let totalDuration = 0;
    for (const s of recentSessions.data) {
      totalDuration += s.duration || 0;
    }

    return {
      success: true,
      stats: {
        totalWorkouts: sessionsResult.total,
        totalExercises: exercisesResult.total,
        currentStreak: streakResult.data ? streakResult.data.streak : 0,
        level: levelResult.data ? levelResult.data.level : 1,
        label: levelResult.data ? levelResult.data.label : 'ROOKIE',
        score: levelResult.data ? levelResult.data.score : 0,
        weekWorkouts: weekSessions.total,
        recentSessions: recentSessions.data.map(s => ({
          id: s._id,
          date: s.start_time,
          duration: s.duration,
          exerciseCount: 0, // 后续补充
        })),
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
