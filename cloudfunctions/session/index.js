// 云函数: session
// 训练会话管理 — create / getRunning / finish / list
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, sessionId, userId } = event;

  // 获取 userId（兼容 userId 参数直接传入）
  let uid = userId;
  if (!uid && openid) {
    const { data } = await db.collection('users').where({ openid }).limit(1).get();
    if (!data || data.length === 0) return { success: false, error: '用户未找到' };
    uid = data[0]._id;
  }

  try {
    if (action === 'create') {
      // 检查是否有正在进行的训练
      const { data: running } = await db.collection('sessions')
        .where({ user_id: uid, is_done: 0, status: 'running' })
        .limit(1)
        .get();

      if (running && running.length > 0) {
        return { success: true, session: running[0], resumed: true };
      }

      // 创建新会话
      const res = await db.collection('sessions').add({
        data: {
          user_id: uid,
          start_time: db.serverDate(),
          end_time: null,
          duration: 0,
          status: 'running',
          is_done: 0,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
        },
      });

      return { success: true, sessionId: res._id, resumed: false };

    } else if (action === 'getRunning') {
      const { data } = await db.collection('sessions')
        .where({ user_id: uid, is_done: 0, status: 'running' })
        .limit(1)
        .get();
      return { success: true, session: data && data.length > 0 ? data[0] : null };

    } else if (action === 'finish') {
      if (!sessionId) return { success: false, error: '缺少 sessionId' };
      const now = db.serverDate();
      const session = await db.collection('sessions').doc(sessionId).get();
      if (!session.data) return { success: false, error: '会话不存在' };

      const start = new Date(session.data.start_time);
      const end = new Date(now);
      const duration = Math.floor((end - start) / 1000);

      await db.collection('sessions').doc(sessionId).update({
        data: {
          end_time: now,
          duration,
          status: 'completed',
          is_done: 1,
          updated_at: now,
        },
      });

      // 更新连续训练天数
      await _updateStreak(uid);

      return { success: true };

    } else if (action === 'list') {
      const { page = 1, pageSize = 20 } = event;
      const { data } = await db.collection('sessions')
        .where({ user_id: uid, is_done: 1 })
        .orderBy('start_time', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return { success: true, sessions: data, page, pageSize };
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

  const { data: streak } = await db.collection('user_streaks').doc(uid).get();

  if (!streak || !streak.last_date) {
    // 第一天
    await db.collection('user_streaks').doc(uid).set({
      data: { streak: 1, last_date: todayStr, updated_at: db.serverDate() },
    });
  } else {
    const lastDate = new Date(streak.last_date);
    lastDate.setHours(0, 0, 0, 0);
    const diff = (today - lastDate) / (1000 * 60 * 60 * 24);

    let newStreak = streak.streak;
    if (diff === 1) {
      newStreak += 1; // 连续
    } else if (diff === 0) {
      // 同一天，不变
    } else {
      newStreak = 1; // 断了，重新计
    }

    await db.collection('user_streaks').doc(uid).update({
      data: { streak: newStreak, last_date: todayStr, updated_at: db.serverDate() },
    });
  }
}
