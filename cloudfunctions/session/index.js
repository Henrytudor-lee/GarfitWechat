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
  const { action } = event;

  if (!openid) return { success: false, error: '未登录' };

  try {
    if (action === 'create') {
      const [running] = await getPool().query(
        "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
        [openid]);
      if (running.length > 0) return { success: true, session: running[0], resumed: true };

      const [result] = await getPool().query(
        "INSERT INTO sessions (_openid, start_time, status) VALUES (?, NOW(), 'active')",
        [openid]);
      const [newSess] = await getPool().query('SELECT * FROM sessions WHERE id = ?', [result.insertId]);
      return { success: true, sessionId: result.insertId, session: newSess[0], resumed: false };

    } else if (action === 'getRunning') {
      const [rows] = await getPool().query(
        "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
        [openid]);
      return { success: true, session: rows[0] || null };

    } else if (action === 'finish') {
      const { id } = event;
      if (!id) return { success: false, error: '缺少 id' };

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
      const { date } = event; // YYYY-MM-DD filter

      let sql = 'SELECT * FROM sessions WHERE _openid = ?';
      const params = [openid];

      if (date) {
        // Match sessions where start_time falls on the given date (local date)
        sql += " AND DATE(start_time) = ?";
        params.push(date);
      }

      sql += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
      params.push(pageSize, offset);

      const [rows] = await getPool().query(sql, params);
      return { success: true, sessions: rows, page, pageSize };

    } else if (action === 'getById') {
      const { id } = event;
      if (!id) return { success: false, error: '缺少 id' };
      const [rows] = await getPool().query(
        'SELECT * FROM sessions WHERE id = ? AND _openid = ? LIMIT 1',
        [id, openid]);
      return { success: true, session: rows[0] || null };

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
