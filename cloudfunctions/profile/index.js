// 云函数: profile — 腾讯云 MySQL
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
    if (action === 'get') {
      const [[user]] = await getPool().query(
        'SELECT name, avatar, phone, level, score, created_at FROM users WHERE _openid = ? LIMIT 1',
        [openid]);
      if (!user) return { success: false, error: '用户不存在' };
      return {
        success: true,
        profile: {
          name: user.name,
          avatar: user.avatar,
          phone: user.phone,
          level: user.level,
          score: user.score,
          created_at: user.created_at,
        },
      };

    } else if (action === 'update') {
      const [[user]] = await getPool().query(
        'SELECT id FROM users WHERE _openid = ? LIMIT 1',
        [openid]);
      if (!user) return { success: false, error: '用户不存在' };

      const { name, avatar } = event;
      const fields = [];
      const vals = [];

      if (name !== undefined && name !== '') {
        fields.push('name = ?');
        vals.push(name);
      }
      if (avatar !== undefined && avatar !== '') {
        fields.push('avatar = ?');
        vals.push(avatar);
      }

      if (fields.length > 0) {
        vals.push(openid);
        await getPool().query(
          `UPDATE users SET ${fields.join(', ')} WHERE _openid = ?`,
          vals);
      }
      return { success: true };

    } else {
      return { success: false, error: '未知 action' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
