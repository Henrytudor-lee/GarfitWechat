// 云函数: stats
// 用户训练统计数据（PostgreSQL）
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
      .select('id')
      .eq('openid', openid)
      .limit(1);
    if (err0) return { success: false, error: err0.message };
    if (!user || user.length === 0) return { success: false, error: '用户不存在' };
    const uid = user[0].id;

    // 计算本周开始时间
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // 并发查询多个统计维度
    const [sessionsResult, exercisesResult, streakResult, levelResult, recentSessions, weekSessions] = await Promise.all([
      // 总训练次数
      rdb().from('sessions').select('id').eq('user_id', uid).eq('is_done', 1),
      // 总动作数
      rdb().from('exercises').select('id').eq('user_id', uid),
      // 连续天数
      rdb().from('user_streaks').select('*').eq('user_id', uid).limit(1),
      // 等级
      rdb().from('user_levels').select('*').eq('user_id', uid).limit(1),
      // 最近7次训练记录
      rdb().from('sessions')
        .select('*')
        .eq('user_id', uid)
        .eq('is_done', 1)
        .order('start_time', { ascending: false })
        .range(0, 6),
      // 本周训练次数
      rdb().from('sessions')
        .select('id')
        .eq('user_id', uid)
        .eq('is_done', 1)
        .gte('start_time', weekStart.toISOString()),
    ]);

    // 计算总训练时长
    let totalDuration = 0;
    for (const s of (recentSessions.data || [])) {
      totalDuration += s.duration || 0;
    }

    const sessionsData = sessionsResult.data || [];
    const exercisesData = exercisesResult.data || [];
    const streakData = streakResult.data || [];
    const levelData = levelResult.data || [];
    const weekData = weekSessions.data || [];

    return {
      success: true,
      stats: {
        totalWorkouts: sessionsData.length,
        totalExercises: exercisesData.length,
        currentStreak: streakData.length > 0 ? streakData[0].streak : 0,
        level: levelData.length > 0 ? levelData[0].level : 1,
        label: levelData.length > 0 ? levelData[0].label : 'ROOKIE',
        score: levelData.length > 0 ? levelData[0].score : 0,
        weekWorkouts: weekData.length,
        recentSessions: (recentSessions.data || []).map(s => ({
          id: s.id,
          date: s.start_time,
          duration: s.duration,
          exerciseCount: 0,
        })),
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
