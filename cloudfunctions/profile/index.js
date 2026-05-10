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

exports.main = async (event, context) => {{
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return {{ success: false, error: '未登录' }};

  try {{
    const [[user]] = await getPool().query('SELECT * FROM users WHERE openid = ? LIMIT 1', [openid]);
    if (!user) return {{ success: false, error: '用户不存在' }};

    if (event.action === 'get') {{
      const [[streak]] = await getPool().query('SELECT streak FROM user_streaks WHERE user_id = ?', [user.id]);
      const [[level]] = await getPool().query('SELECT level, label, score FROM user_levels WHERE user_id = ?', [user.id]);
      return {{ success: true, profile: {{
        id: user.id, name: user.name, avatar: user.avatar, role: user.role,
        streak: streak ? streak.streak : 0,
        level: level ? level.level : 1, label: level ? level.label : 'ROOKIE', score: level ? level.score : 0,
      }}}};
    }}

    if (event.action === 'update') {{
      const {{ nickname, avatar }} = event;
      if (nickname !== undefined || avatar !== undefined) {{
        const fields = []; const vals = [];
        if (nickname !== undefined) {{ fields.push('name = ?'); vals.push(nickname); }}
        if (avatar !== undefined) {{ fields.push('avatar = ?'); vals.push(avatar); }}
        fields.push('updated_at = NOW()');
        vals.push(user.id);
        await getPool().query(`UPDATE users SET ${{fields.join(', ')}} WHERE id = ?`, vals);
      }}
      return {{ success: true }};
    }}

    return {{ success: false, error: '未知 action' }};
  }} catch (err) {{
    return {{ success: false, error: err.message }};
  }}
}};