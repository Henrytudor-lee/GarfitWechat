// 云函数: session
// 训练会话管理 — create / getRunning / finish / list（PostgreSQL）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const rdb = () => cloud.instance.rdb();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, sessionId, userId } = event;

  // 获取 userId（兼容 userId 参数直接传入）
  let uid = userId;
  if (!uid && openid) {
    const { data, error } = await rdb()
      .from('users')
      .select('id')
      .eq('openid', openid)
      .limit(1);
    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) return { success: false, error: '用户未找到' };
    uid = data[0].id;
  }

  try {
    if (action === 'create') {
      // 检查是否有正在进行的训练
      const { data: running, error: err1 } = await rdb()
        .from('sessions')
        .select('*')
        .eq('user_id', uid)
        .eq('is_done', 0)
        .eq('status', 'running')
        .limit(1);
      if (err1) return { success: false, error: err1.message };

      if (running && running.length > 0) {
        return { success: true, session: running[0], resumed: true };
      }

      // 创建新会话
      const { data: newData, error: err2 } = await rdb()
        .from('sessions')
        .insert({
          user_id: uid,
          start_time: new Date().toISOString(),
          status: 'running',
          is_done: 0,
        })
        .select();
      if (err2) return { success: false, error: err2.message };
      const newSession = newData && newData.length > 0 ? newData[0] : null;

      return { success: true, sessionId: newSession ? newSession.id : null, resumed: false };

    } else if (action === 'getRunning') {
      const { data, error: err } = await rdb()
        .from('sessions')
        .select('*')
        .eq('user_id', uid)
        .eq('is_done', 0)
        .eq('status', 'running')
        .limit(1);
      if (err) return { success: false, error: err.message };
      return { success: true, session: data && data.length > 0 ? data[0] : null };

    } else if (action === 'finish') {
      if (!sessionId) return { success: false, error: '缺少 sessionId' };

      const { data: session, error: err1 } = await rdb()
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .limit(1);
      if (err1) return { success: false, error: err1.message };
      if (!session || session.length === 0) return { success: false, error: '会话不存在' };

      const now = new Date();
      const start = new Date(session[0].start_time);
      const duration = Math.floor((now - start) / 1000);

      const { error: err2 } = await rdb()
        .from('sessions')
        .update({
          end_time: now.toISOString(),
          duration,
          status: 'completed',
          is_done: 1,
        })
        .eq('id', sessionId);
      if (err2) return { success: false, error: err2.message };

      // 更新连续训练天数
      await _updateStreak(uid);

      return { success: true };

    } else if (action === 'list') {
      const { page = 1, pageSize = 20 } = event;
      const offset = (page - 1) * pageSize;
      const { data, error: err } = await rdb()
        .from('sessions')
        .select('*')
        .eq('user_id', uid)
        .eq('is_done', 1)
        .order('start_time', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (err) return { success: false, error: err.message };
      return { success: true, sessions: data || [], page, pageSize };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// 更新连续训练天数
async function _updateStreak(uid) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: streak, error: err1 } = await rdb()
    .from('user_streaks')
    .select('*')
    .eq('user_id', uid)
    .limit(1);
  if (err1) return;

  if (!streak || streak.length === 0) {
    // 第一天
    await rdb().from('user_streaks').insert({
      user_id: uid,
      streak: 1,
      last_date: todayStr,
    });
  } else {
    const lastDate = new Date(streak[0].last_date);
    lastDate.setHours(0, 0, 0, 0);
    const diff = (today - lastDate) / (1000 * 60 * 60 * 24);

    let newStreak = streak[0].streak;
    if (diff === 1) {
      newStreak += 1; // 连续
    } else if (diff !== 0) {
      newStreak = 1; // 断了，重新计
    }

    await rdb()
      .from('user_streaks')
      .update({ streak: newStreak, last_date: todayStr })
      .eq('user_id', uid);
  }
}
