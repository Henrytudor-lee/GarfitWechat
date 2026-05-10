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
  const openid = event.openid;
  const { action } = event;

  if (!openid) return { success: false, error: '未登录' };

  try {
    // ── Default action: full stats summary ──────────────────────────────
    if (!action || action === 'summary') {
      // Total finished sessions
      const [[totalRow]] = await getPool().query(
        "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished'",
        [openid]);
      const totalSessions = totalRow ? totalRow.n : 0;

      // Total volume (sum of weight * reps for finished sessions)
      const [[volumeRow]] = await getPool().query(
        "SELECT COALESCE(SUM(e.weight * e.reps), 0) as total FROM exercises e JOIN sessions s ON e.session_id = s.id WHERE s._openid = ? AND s.status = 'finished'",
        [openid]);
      const totalVolume = Number(volumeRow ? volumeRow.total : 0);

      // Week workouts count (last 7 days)
      const [[weekRow]] = await getPool().query(
        "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
        [openid]);
      const weekWorkouts = weekRow ? weekRow.n : 0;

      // Current streak: consecutive days with finished sessions in last 30 days
      const [streakDays] = await getPool().query(
        "SELECT DATE(start_time) as day FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(start_time) ORDER BY day DESC",
        [openid]);
      let currentStreak = 0;
      if (streakDays.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = new Date(streakDays[0].day);
        const daysSinceLast = (new Date(today) - lastDate) / 86400000;
        if (daysSinceLast <= 1) {
          let streak = 0;
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
          currentStreak = streak;
        }
      }

      // Exercise history: all exercises with records grouped by exercise_id
      const [histRows] = await getPool().query(
        `SELECT e.exercise_id, e.name,
                JSON_ARRAYAGG(JSON_OBJECT('weight', e.weight, 'reps', e.reps, 'weight_unit', e.weight_unit, 'create_time', e.create_time)) as records
         FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND s.status = 'finished'
         GROUP BY e.exercise_id, e.name
         ORDER BY e.exercise_id`,
        [openid]);

      // Parse JSON records — mysql2 returns JSON as strings
      const historyExercises = (histRows || []).map(row => {
        let records = [];
        try {
          records = typeof row.records === 'string' ? JSON.parse(row.records) : (row.records || []);
        } catch (e) {}
        return {
          exercise_id: row.exercise_id,
          name: row.name,
          records,
        };
      });

      // Weekly volume — last 8 weeks grouped by week
      const [weeklyVolume] = await getPool().query(
        `SELECT
           YEARWEEK(s.start_time, 1) as yrweek,
           DATE_FORMAT(s.start_time, '%Y-%m-%d') as day,
           COALESCE(SUM(e.weight * e.reps), 0) as volume
         FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND s.status = 'finished'
           AND s.start_time >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
         GROUP BY yrweek, day
         ORDER BY day ASC`,
        [openid]);

      // Recent sessions (last 30)
      const [recentSessions] = await getPool().query(
        "SELECT * FROM sessions WHERE _openid = ? ORDER BY start_time DESC LIMIT 30",
        [openid]);

      return {
        success: true,
        data: {
          totalSessions,
          totalVolume,
          weekWorkouts,
          currentStreak,
          historyExercises,
          weeklyVolume,
          recentSessions,
        },
      };
    }

    // ── exerciseMax: max weight record for a specific exercise ───────
    if (action === 'exerciseMax') {
      const { exercise_id } = event;
      if (!exercise_id) return { success: false, error: '缺少 exercise_id' };

      const [rows] = await getPool().query(
        `SELECT e.weight, e.reps, e.weight_unit, e.create_time
         FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND e.exercise_id = ? AND s.status = 'finished' AND e.weight > 0
         ORDER BY e.weight DESC, e.reps DESC
         LIMIT 1`,
        [openid, exercise_id]);

      if (rows.length === 0) {
        return { success: true, maxRecord: null };
      }

      const max = rows[0];
      const [[countRow]] = await getPool().query(
        `SELECT COUNT(*) as totalSets FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND e.exercise_id = ? AND s.status = 'finished'`,
        [openid, exercise_id]);

      return {
        success: true,
        maxRecord: {
          weight: max.weight,
          reps: max.reps,
          weight_unit: max.weight_unit || 'kg',
          totalSets: countRow ? countRow.totalSets : 0,
        },
      };
    }

    // ── exerciseList: all exercise options for selector ──────────────
    if (action === 'exerciseList') {
      const [rows] = await getPool().query(
        `SELECT DISTINCT e.exercise_id, e.name
         FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND s.status = 'finished'
         ORDER BY e.name`,
        [openid]);
      return { success: true, exercises: rows || [] };
    }

    // ── exerciseRecords: weight records for a specific exercise ──────
    if (action === 'exerciseRecords') {
      const { exercise_id } = event;
      if (!exercise_id) return { success: false, error: '缺少 exercise_id' };

      const [rows] = await getPool().query(
        `SELECT e.weight, e.reps, e.weight_unit, e.create_time
         FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE s._openid = ? AND e.exercise_id = ? AND s.status = 'finished'
         ORDER BY e.create_time ASC`,
        [openid, exercise_id]);

      return { success: true, records: rows || [] };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
