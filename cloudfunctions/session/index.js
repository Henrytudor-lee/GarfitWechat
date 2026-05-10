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
  const openid = event.openid;
  const { action } = event;

  if (!openid) return { success: false, error: '未登录' };

  try {
    if (action === 'create') {
      const [running] = await getPool().query(
        "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
        [openid]);
      if (running.length > 0) {
        const r = running[0];
        return { success: true, session: { ...r, start_time: new Date(r.start_time).toISOString() }, resumed: true };
      }

      // Get user_id from users table
      const [[user]] = await getPool().query('SELECT id FROM users WHERE _openid = ? LIMIT 1', [openid]);
      const userId = user ? user.id : null;

      const [result] = await getPool().query(
        "INSERT INTO sessions (_openid, user_id, start_time, status) VALUES (?, ?, UTC_TIMESTAMP(), 'active')",
        [openid, userId]);
      const [newSess] = await getPool().query('SELECT * FROM sessions WHERE id = ?', [result.insertId]);
      // Convert to UTC ISO 8601 string for frontend compatibility
      const startTimeISO = new Date(newSess[0].start_time).toISOString();
      return { success: true, sessionId: result.insertId, session: { ...newSess[0], start_time: startTimeISO }, resumed: false };

    } else if (action === 'getRunning') {
      const [rows] = await getPool().query(
        "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
        [openid]);
      const session = rows[0] ? { ...rows[0], start_time: new Date(rows[0].start_time).toISOString() } : null;
      return { success: true, session };

    } else if (action === 'finish') {
      const { sessionId, session_id } = event;
      const id = sessionId || session_id;
      if (!id) return { success: false, error: '缺少 sessionId 或 session_id' };

      const [sessions] = await getPool().query(
        'SELECT * FROM sessions WHERE id = ? AND _openid = ? LIMIT 1',
        [id, openid]);
      if (sessions.length === 0) return { success: false, error: '会话不存在' };

      await getPool().query(
        "UPDATE sessions SET status = 'finished', end_time = NOW(), duration = TIMESTAMPDIFF(SECOND, start_time, NOW()) WHERE id = ? AND _openid = ?",
        [id, openid]);
      return { success: true };

    } else if (action === 'list') {
      const page = parseInt(event.page || 1);
      const pageSize = parseInt(event.pageSize || 20);
      const offset = (page - 1) * pageSize;
      const { date } = event;

      let sql = 'SELECT * FROM sessions WHERE _openid = ?';
      const params = [openid];

      if (date) {
        sql += " AND DATE(start_time) = ?";
        params.push(date);
      }

      sql += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
      params.push(pageSize, offset);

      const [rows] = await getPool().query(sql, params);
      const sessions = rows.map(s => ({ ...s, start_time: new Date(s.start_time).toISOString() }));
      return { success: true, sessions, page, pageSize };

    } else if (action === 'getById') {
      const { id } = event;
      if (!id) return { success: false, error: '缺少 id' };
      const [rows] = await getPool().query(
        'SELECT * FROM sessions WHERE id = ? AND _openid = ? LIMIT 1',
        [id, openid]);
      const session = rows[0] ? { ...rows[0], start_time: new Date(rows[0].start_time).toISOString() } : null;
      return { success: true, session };

    } else if (action === 'delete') {
      const { id } = event;
      if (!id) return { success: false, error: '缺少 id' };
      await getPool().query('DELETE FROM sessions WHERE id = ? AND _openid = ?', [id, openid]);
      return { success: true };

    } else {
      return { success: false, error: '未知 action' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};