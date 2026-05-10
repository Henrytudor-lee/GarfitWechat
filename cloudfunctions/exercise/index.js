// 云函数: exercise — 腾讯云 MySQL
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
  const {{ action, exerciseId, sessionId }} = event;

  if (!openid) return {{ success: false, error: '未登录' }};

  const [[user]] = await getPool().query('SELECT id FROM users WHERE openid = ? LIMIT 1', [openid]);
  if (!user) return {{ success: false, error: '用户不存在' }};
  const uid = user.id;

  try {{
    if (action === 'add') {{
      const {{ exercise_id, name, weight, weight_unit, reps, sequence }} = event;
      if (!exercise_id || !name) return {{ success: false, error: '缺少必填字段' }};
      const [result] = await getPool().query(
        'INSERT INTO exercises (session_id, user_id, exercise_id, name, sequence, weight, weight_unit, reps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sessionId || null, uid, exercise_id, name, parseInt(sequence) || 0, parseFloat(weight) || 0, weight_unit || 'kg', parseInt(reps) || 0]);
      return {{ success: true, exerciseId: result.insertId }};

    }} else if (action === 'update') {{
      if (!exerciseId) return {{ success: false, error: '缺少 exerciseId' }};
      const {{ weight, weight_unit, reps, sequence }} = event;
      const fields = []; const vals = [];
      if (weight !== undefined) {{ fields.push('weight = ?'); vals.push(parseFloat(weight)); }}
      if (weight_unit !== undefined) {{ fields.push('weight_unit = ?'); vals.push(weight_unit); }}
      if (reps !== undefined) {{ fields.push('reps = ?'); vals.push(parseInt(reps)); }}
      if (sequence !== undefined) {{ fields.push('sequence = ?'); vals.push(parseInt(sequence)); }}
      fields.push('update_time = NOW()');
      vals.push(exerciseId);
      await getPool().query(`UPDATE exercises SET ${{fields.join(', ')}} WHERE id = ?`, vals);
      return {{ success: true }};

    }} else if (action === 'delete') {{
      if (!exerciseId) return {{ success: false, error: '缺少 exerciseId' }};
      await getPool().query('DELETE FROM exercises WHERE id = ?', [exerciseId]);
      return {{ success: true }};

    }} else if (action === 'list') {{
      if (!sessionId) return {{ success: false, error: '缺少 sessionId' }};
      const [rows] = await getPool().query(
        'SELECT * FROM exercises WHERE session_id = ? AND user_id = ? ORDER BY sequence ASC',
        [sessionId, uid]);
      return {{ success: true, exercises: rows }};
    }}

    return {{ success: false, error: '未知 action' }};
  }} catch (err) {{
    return {{ success: false, error: err.message }};
  }}
}};