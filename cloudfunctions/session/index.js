// 云函数: session — 腾讯云 MySQL
const mysql = require('mysql2/promise');

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, sessionId } = event;

  if (!openid) return { success: false, error: '未登录' };

  const [[user]] = await getPool().query('SELECT id FROM users WHERE openid = ? LIMIT 1', [openid]);
  if (!user) return { success: false, error: '用户不存在' };
  const uid = user.id;

  try {
    if (action === 'create') {
      const [running] = await getPool().query(
        'SELECT * FROM sessions WHERE user_id = ? AND is_done = 0 LIMIT 1', [uid]);
      if (running.length > 0) return { success: true, session: running[0], resumed: true };

      const [result] = await getPool().query(
        'INSERT INTO sessions (user_id, start_time, status, is_done) VALUES (?, NOW(), ?, 0)',
        [uid, 'running']);
      const [newSess] = await getPool().query('SELECT * FROM sessions WHERE id = ?', [result.insertId]);
      return { success: true, sessionId: result.insertId, session: newSess[0], resumed: false };

    } else if (action === 'getRunning') {
      const [rows] = await getPool().query(
        'SELECT * FROM sessions WHERE user_id = ? AND is_done = 0 LIMIT 1', [uid]);
      return { success: true, session: rows[0] || null };

    } else if (action === 'finish') {
      if (!sessionId) return { success: false, error: '缺少 sessionId' };
      const [sessions] = await getPool().query('SELECT * FROM sessions WHERE id = ?', [sessionId]);
      if (sessions.length === 0) return { success: false, error: '会话不存在' };

      const start = new Date(sessions[0].start_time);
      const duration = Math.floor((Date.now() - start) / 1000);
      await getPool().query(
        'UPDATE sessions SET end_time = NOW(), duration = ?, status = ?, is_done = 1 WHERE id = ?',
        [duration, 'completed', sessionId]);

      const today = new Date().toISOString().slice(0, 10);
      const [[streak]] = await getPool().query('SELECT * FROM user_streaks WHERE user_id = ?', [uid]);
      if (!streak) {
        await getPool().query('INSERT INTO user_streaks (user_id, streak, last_date) VALUES (?, 1, ?)', [uid, today]);
      } else {
        const last = new Date(streak.last_date);
        const diff = (new Date(today) - last) / 86400000;
        let newStreak = streak.streak;
        if (diff === 1) newStreak += 1;
        else if (diff !== 0) newStreak = 1;
        await getPool().query('UPDATE user_streaks SET streak = ?, last_date = ? WHERE user_id = ?', [newStreak, today, uid]);
      }
      return { success: true };

    } else if (action === 'list') {
      const page = parseInt(event.page || 1);
      const pageSize = parseInt(event.pageSize || 20);
      const [rows] = await getPool().query(
        'SELECT * FROM sessions WHERE user_id = ? AND is_done = 1 ORDER BY start_time DESC LIMIT ? OFFSET ?',
        [uid, pageSize, (page - 1) * pageSize]);
      return { success: true, sessions: rows, page, pageSize };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
