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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;

  if (!openid) return { success: false, error: '未登录' };

  try {
    if (action === 'add') {
      const { session_id, exercise_id, name, weight, reps } = event;
      if (!session_id || !exercise_id || !name) return { success: false, error: '缺少必填字段' };
      const [result] = await getPool().query(
        'INSERT INTO exercises (session_id, exercise_id, name, weight, reps, weight_unit, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [session_id, exercise_id, name, parseFloat(weight) || 0, parseInt(reps) || 0, 'kg']);
      return { success: true, exerciseId: result.insertId };

    } else if (action === 'list') {
      const { session_id } = event;
      if (!session_id) return { success: false, error: '缺少 session_id' };
      const [rows] = await getPool().query(
        'SELECT * FROM exercises WHERE session_id = ? ORDER BY created_at ASC',
        [session_id]);
      return { success: true, exercises: rows };

    } else if (action === 'update') {
      const { id, session_id, weight, reps } = event;
      if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
      await getPool().query(
        'UPDATE exercises SET weight = ?, reps = ? WHERE id = ? AND session_id = ?',
        [parseFloat(weight) || 0, parseInt(reps) || 0, id, session_id]);
      return { success: true };

    } else if (action === 'delete') {
      const { id, session_id } = event;
      if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
      await getPool().query('DELETE FROM exercises WHERE id = ? AND session_id = ?', [id, session_id]);
      return { success: true };

    } else {
      return { success: false, error: '未知 action' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
