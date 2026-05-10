// 云函数: stats — 腾讯云 MySQL
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
  if (!openid) return { success: false, error: '未登录' };

  try {
    const [[user]] = await getPool().query('SELECT id FROM users WHERE _openid = ? LIMIT 1', [openid]);
    if (!user) return { success: false, error: '用户不存在' };
    const uid = user.id;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [[[totalSessions]], [[totalExercises]], [[streakRow]], [[levelRow]], [recent]] = await Promise.all([
      getPool().query('SELECT COUNT(*) as n FROM sessions WHERE user_id = ? AND is_done = 1', [uid]),
      getPool().query('SELECT COUNT(*) as n FROM exercises WHERE user_id = ?', [uid]),
      getPool().query('SELECT streak FROM user_streaks WHERE user_id = ?', [uid]),
      getPool().query('SELECT level, label, score FROM user_levels WHERE user_id = ?', [uid]),
      getPool().query('SELECT * FROM sessions WHERE user_id = ? AND is_done = 1 ORDER BY start_time DESC LIMIT 7', [uid]),
    ]);

    const [[[weekCount]]] = await getPool().query(
      'SELECT COUNT(*) as n FROM sessions WHERE user_id = ? AND is_done = 1 AND start_time >= ?', [uid, weekStart]);

    return {
      success: true,
      stats: {
        totalWorkouts: totalSessions ? totalSessions.n : 0,
        totalExercises: totalExercises ? totalExercises.n : 0,
        currentStreak: streakRow ? streakRow.streak : 0,
        level: levelRow ? levelRow.level : 1,
        label: levelRow ? levelRow.label : 'ROOKIE',
        score: levelRow ? levelRow.score : 0,
        weekWorkouts: weekCount ? weekCount.n : 0,
        recentSessions: recent ? recent.map(s => ({
          id: s.id, date: s.start_time, duration: s.duration || 0,
        })) : [],
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
