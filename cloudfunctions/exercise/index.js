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
  const { action } = event;
  const openid = event.openid;

  try {
    if (action === 'add') {
      const { session_id, exercise_id, name_zh, name_en, image_name, video_name, weight, reps, weight_unit } = event;
      if (!session_id || !exercise_id || !name_zh) return { success: false, error: '缺少必填字段' };
      // Get _openid and user_id from the session
      const [sessions] = await getPool().query('SELECT _openid, user_id FROM sessions WHERE id = ?', [session_id]);
      const _openid = sessions.length > 0 ? sessions[0]._openid : null;
      const userId = sessions.length > 0 ? sessions[0].user_id : null;

      const [result] = await getPool().query(
        'INSERT INTO exercises (session_id, _openid, user_id, exercise_id, name_zh, name_en, image_name, video_name, weight, reps, weight_unit, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [session_id, _openid, userId, exercise_id, name_zh, name_en || null, image_name || null, video_name || null, parseFloat(weight) || 0, parseInt(reps) || 0, (weight_unit || 'kg')]);
      return { success: true, exerciseId: result.insertId };

    } else if (action === 'list') {
      const { session_id } = event;
      if (!session_id) return { success: false, error: '缺少 session_id' };
      const [rows] = await getPool().query(
        'SELECT * FROM exercises WHERE session_id = ? ORDER BY create_time ASC',
        [session_id]);
      return { success: true, exercises: rows };

    } else if (action === 'getMaxWeight') {
      // 前端传 exercise_id 或 exerciseId
      const exercise_id = event.exercise_id || event.exerciseId;
      if (!exercise_id) return { success: false, error: '缺少 exercise_id' };
      const [rows] = await getPool().query(
        `SELECT weight, reps, weight_unit, create_time
         FROM exercises
         WHERE _openid = ? AND exercise_id = ?
         ORDER BY weight DESC, create_time DESC
         LIMIT 1`,
        [openid, exercise_id]);
      return { success: true, data: rows[0] || null };

    } else if (action === 'update') {
      const { id, session_id, weight, reps, openid: callerOpenid, weight_unit } = event;
      if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
      await getPool().query(
        'UPDATE exercises SET weight = ?, reps = ?, weight_unit = ? WHERE id = ? AND session_id = ? AND _openid = ?',
        [parseFloat(weight) || 0, parseInt(reps) || 0, (weight_unit || 'kg'), id, session_id, callerOpenid]);
      return { success: true };

    } else if (action === 'delete') {
      const { id, session_id, openid: callerOpenid } = event;
      if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
      await getPool().query('DELETE FROM exercises WHERE id = ? AND session_id = ? AND _openid = ?', [id, session_id, callerOpenid]);
      return { success: true };

    } else {
      return { success: false, error: '未知 action' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
};
