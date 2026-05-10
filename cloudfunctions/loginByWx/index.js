// 云函数: loginByWx — 腾讯云 MySQL
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
  if (!openid) return { success: false, error: '无法获取 openid' };

  try {
    const [rows] = await getPool().query('SELECT * FROM users WHERE _openid = ? LIMIT 1', [openid]);

    if (rows.length > 0) {
      await getPool().query('UPDATE users SET updated_at = NOW() WHERE id = ?', [rows[0].id]);
      return { success: true, userId: rows[0].id, isNew: false };
    }

    const [result] = await getPool().query(
      'INSERT INTO users (_openid, name, avatar, role, status) VALUES (?, ?, ?, ?, ?)',
      [openid, event.nickname || '', event.avatar || '', 'user', 1]
    );
    return { success: true, userId: result.insertId, isNew: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
