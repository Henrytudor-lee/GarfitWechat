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
  const openid = event.openid;
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

    } else if (action === 'getStreak') {
      const [streakDays] = await getPool().query(
        "SELECT DATE(start_time) as day FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(start_time) ORDER BY day DESC",
        [openid]);
      let streak = 0;
      if (streakDays.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = new Date(streakDays[0].day);
        const daysSinceLast = (new Date(today) - lastDate) / 86400000;
        if (daysSinceLast <= 1) {
          let prevDate = null;
          for (const row of streakDays) {
            const d = new Date(row.day);
            if (!prevDate) { streak = 1; }
            else {
              const diff = (prevDate - d) / 86400000;
              if (diff === 1) { streak++; }
              else { break; }
            }
            prevDate = d;
          }
        }
      }
      return { success: true, streak };

    } else if (action === 'getLevel') {
      const [[row]] = await getPool().query(
        "SELECT COUNT(*) as cnt FROM sessions WHERE _openid = ? AND status = 'finished'",
        [openid]);
      const cnt = row ? row.cnt : 0;
      let lv = 1, label = 'ROOKIE', score = cnt;
      if (cnt >= 361) { lv = 6; label = 'ELITE'; }
      else if (cnt >= 121) { lv = 5; label = 'EXPERT'; }
      else if (cnt >= 61) { lv = 4; label = 'ADVANCED'; }
      else if (cnt >= 31) { lv = 3; label = 'INTERMEDIATE'; }
      else if (cnt >= 8) { lv = 2; label = 'BEGINNER'; }
      return { success: true, data: { lv, label, score } };

    } else if (action === 'updateAvatar') {
      const { avatarUrl } = event;
      if (!avatarUrl) return { success: false, error: '缺少 avatarUrl' };
      await getPool().query('UPDATE users SET avatar = ? WHERE _openid = ?', [avatarUrl, openid]);
      return { success: true };

    } else {
      return { success: false, error: '未知 action' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
