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
      // 老用户：只更新资料
      const updates = ['updated_at = NOW()'];
      const vals = [];
      if (event.nickname) { updates.push('name = ?'); vals.push(event.nickname); }
      if (event.avatar) { updates.push('avatar = ?'); vals.push(event.avatar); }
      if (event.phoneNumber) { updates.push('phone = ?'); vals.push(event.phoneNumber); }
      if (vals.length > 0) {
        vals.push(rows[0].id);
        await getPool().query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals);
      }
      return {
        success: true,
        userId: rows[0].id,
        openid,
        phoneNumber: rows[0].phone || null,
        isNew: false,
      };
    }

    // 新用户：必须有手机号
    const phoneNumber = event.phoneNumber ? event.phoneNumber.trim() : '';
    if (!phoneNumber || phoneNumber.length !== 11) {
      return { success: false, error: '请输入有效的11位手机号' };
    }

    const [result] = await getPool().query(
      'INSERT INTO users (_openid, name, avatar, phone, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [openid, event.nickname || '', event.avatar || '', phoneNumber, 'user', 1]
    );
    return { success: true, userId: result.insertId, openid, phoneNumber, isNew: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
};
