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
    // totalWorkouts: count of finished sessions
    const [[totalWorkoutsRow]] = await getPool().query(
      "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished'",
      [openid]);
    const totalWorkouts = totalWorkoutsRow ? totalWorkoutsRow.n : 0;

    // currentStreak: count of consecutive days with finished sessions in last 30 days
    const [[streakRow]] = await getPool().query(
      "SELECT DATE(start_time) as day FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(start_time) ORDER BY day DESC",
      [openid]);

    let currentStreak = 0;
    if (streakRow) {
      const today = new Date().toISOString().slice(0, 10);
      const lastDate = new Date(streakRow.day);
      const daysSinceLast = (new Date(today) - lastDate) / 86400000;
      if (daysSinceLast <= 1) {
        // Count consecutive days
        const [allDays] = await getPool().query(
          "SELECT DATE(start_time) as day FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(start_time) ORDER BY day DESC",
          [openid]);
        let streak = 0;
        let prevDate = null;
        for (const row of allDays) {
          const d = new Date(row.day);
          if (!prevDate) {
            streak = 1;
          } else {
            const diff = (prevDate - d) / 86400000;
            if (diff === 1) {
              streak++;
            } else {
              break;
            }
          }
          prevDate = d;
        }
        currentStreak = streak;
      }
    }

    // totalVolume: sum of weight * reps for finished sessions
    const [[volumeRow]] = await getPool().query(
      "SELECT COALESCE(SUM(e.weight * e.reps), 0) as total FROM exercises e JOIN sessions s ON e.session_id = s.id WHERE s._openid = ? AND s.status = 'finished'",
      [openid]);
    const totalVolume = volumeRow ? Number(volumeRow.total) : 0;

    // weekWorkouts: count of finished sessions in last 7 days
    const [[weekCountRow]] = await getPool().query(
      "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
      [openid]);
    const weekWorkouts = weekCountRow ? weekCountRow.n : 0;

    // weeklyVolume: daily volume for last 28 days
    const [weeklyVolume] = await getPool().query(
      "SELECT DATE(s.start_time) as day, COALESCE(SUM(e.weight * e.reps), 0) as volume FROM exercises e JOIN sessions s ON e.session_id = s.id WHERE s._openid = ? AND s.status = 'finished' AND s.start_time >= DATE_SUB(CURDATE(), INTERVAL 28 DAY) GROUP BY DATE(s.start_time) ORDER BY day ASC",
      [openid]);

    return {
      success: true,
      stats: {
        totalWorkouts,
        currentStreak,
        totalVolume,
        weekWorkouts,
        weeklyVolume,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
