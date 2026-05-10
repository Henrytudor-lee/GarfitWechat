// 云函数: exerciseLibrary — 腾讯云 MySQL
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
  const { action, keyword, bodyPart, equipmentId, id, exerciseId, page = 1, pageSize = 20 } = event;

  try {
    if (action === 'list') {
      let sql = 'SELECT id,name,name_zh,image_name,video_name,video_file,equipment_id,body_part_id,exercise_type,is_favorite FROM exercises_library WHERE 1=1';
      const params = [];

      if (keyword) {
        sql += ' AND (name LIKE ? OR name_zh LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (bodyPart) {
        sql += ' AND (body_part_id = ? OR body_part_id LIKE ? OR body_part_id LIKE ? OR body_part_id LIKE ?)';
        params.push(bodyPart, `${bodyPart},%`, `%,${bodyPart},%`, `%,${bodyPart}`);
      }
      if (equipmentId) {
        sql += ' AND (equipment_id = ? OR equipment_id LIKE ? OR equipment_id LIKE ? OR equipment_id LIKE ?)';
        params.push(equipmentId, `${equipmentId},%`, `%,${equipmentId},%`, `%,${equipmentId}`);
      }

      sql += ' ORDER BY name_zh ASC LIMIT ? OFFSET ?';
      params.push(pageSize, (page - 1) * pageSize);

      const [rows] = await getPool().query(sql, params);
      return { success: true, list: rows, page, pageSize };

    } else if (action === 'detail') {
      if (!id) return { success: false, error: '缺少 id' };
      const [rows] = await getPool().query(
        'SELECT * FROM exercises_library WHERE id = ? LIMIT 1',
        [id]
      );
      return { success: true, item: rows[0] || null };

    } else if (action === 'favorites') {
      const [rows] = await getPool().query(
        'SELECT id,name,name_zh,image_name,video_name,video_file,equipment_id,body_part_id,exercise_type,is_favorite FROM exercises_library WHERE is_favorite = 1 ORDER BY name_zh ASC'
      );
      return { success: true, list: rows };

    } else if (action === 'toggleFavorite') {
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };
      const [existing] = await getPool().query(
        'SELECT is_favorite FROM exercises_library WHERE id = ? LIMIT 1',
        [exerciseId]
      );
      if (!existing || existing.length === 0) return { success: false, error: '动作不存在' };

      const newVal = existing[0].is_favorite === 1 ? 0 : 1;
      await getPool().query(
        'UPDATE exercises_library SET is_favorite = ? WHERE id = ?',
        [newVal, exerciseId]
      );
      return { success: true, is_favorite: newVal };

    } else if (action === 'count') {
      const [rows] = await getPool().query(
        'SELECT COUNT(*) as total FROM exercises_library'
      );
      return { success: true, total: rows[0].total };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
