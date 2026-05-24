// 云函数统一入口: api — 合并 session/profile/exercise/exerciseLibrary/stats
const mysql = require('mysql2/promise');
const https = require('https');

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ── Shared pool (singleton) ──────────────────────────────────────────
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

// ── Helper: ISO timestamp ─────────────────────────────────────────────
function isoTime(val) {
  return val ? new Date(val).toISOString() : null;
}

// ── Entry point ──────────────────────────────────────────────────────
exports.main = async (event, context) => {
  const { action } = event;

  // Parse "category.sub"
  let category = '', sub = '';
  if (typeof action === 'string' && action.includes('.')) {
    const idx = action.indexOf('.');
    category = action.slice(0, idx);
    sub = action.slice(idx + 1);
  } else {
    // fallback: allow plain sub-action for direct usage
    category = event.category || '';
    sub = action;
  }

  try {
    // ══════════════════════════════════════════════════════════
    // LOGIN
    // ══════════════════════════════════════════════════════════
    if (action === 'login.code') {
      const { code } = event;
      if (!code) return { success: false, error: '缺少登录凭证 code' };

      const appid = process.env.WX_APPID;
      const secret = process.env.WX_APPSECRET;
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

      const wxRes = await new Promise((resolve, reject) => {
        https.get(wxUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { resolve({ errcode: -1, errmsg: '解析微信响应失败' }); }
          });
        }).on('error', reject);
      });

      if (wxRes.errcode) return { success: false, error: wxRes.errmsg || '微信登录失败' };

      const openid = wxRes.openid;
      const [[existingUser]] = await getPool().query(
        'SELECT id, favor_exercises, practiced_exercises FROM users WHERE _openid = ? LIMIT 1',
        [openid]);

      if (existingUser) {
        const favor = existingUser.favor_exercises
          ? existingUser.favor_exercises.split(',').filter(Boolean).map(Number)
          : [];
        const practiced = existingUser.practiced_exercises
          ? existingUser.practiced_exercises.split(',').filter(Boolean).map(Number)
          : [];
        return { success: true, userId: existingUser.id, openid, favor_exercises: favor, practiced_exercises: practiced };
      }

      const [result] = await getPool().query(
        "INSERT INTO users (_openid, role, status) VALUES (?, 'user', 1)",
        [openid]);
      return { success: true, userId: result.insertId, openid, favor_exercises: [], practiced_exercises: [] };
    }

    // ══════════════════════════════════════════════════════════
    // SESSION
    // ══════════════════════════════════════════════════════════
    if (category === 'session') {
      const openid = event.openid;
      if (!openid) return { success: false, error: '未登录' };

      if (sub === 'create') {
        const [running] = await getPool().query(
          "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
          [openid]);
        if (running.length > 0) {
          const r = running[0];
          return { success: true, session: { ...r, start_time: isoTime(r.start_time) }, resumed: true };
        }

        const [[user]] = await getPool().query('SELECT id FROM users WHERE _openid = ? LIMIT 1', [openid]);
        const userId = user ? user.id : null;

        const [result] = await getPool().query(
          "INSERT INTO sessions (_openid, user_id, start_time, status) VALUES (?, ?, UTC_TIMESTAMP(), 'active')",
          [openid, userId]);
        const [newSess] = await getPool().query('SELECT * FROM sessions WHERE id = ?', [result.insertId]);
        return { success: true, sessionId: result.insertId, session: { ...newSess[0], start_time: isoTime(newSess[0].start_time) }, resumed: false };

      } else if (sub === 'getRunning') {
        const [rows] = await getPool().query(
          "SELECT * FROM sessions WHERE _openid = ? AND status = 'active' LIMIT 1",
          [openid]);
        const session = rows[0] ? { ...rows[0], start_time: isoTime(rows[0].start_time) } : null;
        return { success: true, session };

      } else if (sub === 'finish') {
        const { sessionId, session_id } = event;
        const id = sessionId || session_id;
        if (!id) return { success: false, error: '缺少 sessionId 或 session_id' };

        const [sessions] = await getPool().query(
          'SELECT * FROM sessions WHERE id = ? AND _openid = ? LIMIT 1',
          [id, openid]);
        if (sessions.length === 0) return { success: false, error: '会话不存在' };

        await getPool().query(
          "UPDATE sessions SET status = 'finished', end_time = NOW(), duration = TIMESTAMPDIFF(SECOND, start_time, NOW()) WHERE id = ? AND _openid = ?",
          [id, openid]);
        return { success: true };

      } else if (sub === 'list') {
        const page = parseInt(event.page || 1);
        const pageSize = parseInt(event.pageSize || 20);
        const offset = (page - 1) * pageSize;
        const { date } = event;

        let sql = 'SELECT * FROM sessions WHERE _openid = ?';
        const params = [openid];
        if (date) {
          sql += " AND DATE(start_time) = ?";
          params.push(date);
        }
        sql += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
        params.push(pageSize, offset);

        const [rows] = await getPool().query(sql, params);
        const sessions = rows.map(s => ({ ...s, start_time: isoTime(s.start_time) }));
        return { success: true, sessions, page, pageSize };

      } else if (sub === 'getById') {
        const { id } = event;
        if (!id) return { success: false, error: '缺少 id' };
        const [rows] = await getPool().query(
          'SELECT * FROM sessions WHERE id = ? AND _openid = ? LIMIT 1',
          [id, openid]);
        const session = rows[0] ? { ...rows[0], start_time: isoTime(rows[0].start_time) } : null;
        return { success: true, session };

      } else if (sub === 'delete') {
        const { id } = event;
        if (!id) return { success: false, error: '缺少 id' };
        await getPool().query('DELETE FROM sessions WHERE id = ? AND _openid = ?', [id, openid]);
        return { success: true };

      } else {
        return { success: false, error: '未知 action' };
      }
    }

    // ══════════════════════════════════════════════════════════
    // PROFILE
    // ══════════════════════════════════════════════════════════
    if (category === 'profile') {
      const openid = event.openid;
      if (!openid) return { success: false, error: '未登录' };

      if (sub === 'get') {
        const [[user]] = await getPool().query(
          'SELECT name, avatar, phone, created_at FROM users WHERE _openid = ? LIMIT 1',
          [openid]);
        if (!user) return { success: false, error: '用户不存在' };
        return {
          success: true,
          profile: {
            name: user.name,
            avatar: user.avatar,
            phone: user.phone,
            created_at: user.created_at,
          },
        };

      } else if (sub === 'update') {
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

      } else if (sub === 'getStreak') {
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

      } else if (sub === 'getLevel') {
        const [[row]] = await getPool().query(
          "SELECT COUNT(*) as cnt FROM sessions WHERE _openid = ? AND status = 'finished'",
          [openid]);
        const cnt = row ? row.cnt : 0;
        let lv = 1, label = 'ROOKIE', label_zh = '新手', score = cnt;
        if (cnt >= 361) { lv = 6; label = 'ELITE'; label_zh = '精英'; }
        else if (cnt >= 121) { lv = 5; label = 'EXPERT'; label_zh = '专家'; }
        else if (cnt >= 61) { lv = 4; label = 'ADVANCED'; label_zh = '高级'; }
        else if (cnt >= 31) { lv = 3; label = 'INTERMEDIATE'; label_zh = '进阶'; }
        else if (cnt >= 8) { lv = 2; label = 'BEGINNER'; label_zh = '入门'; }
        return { success: true, data: { lv, label, label_zh, score } };

      } else if (sub === 'updateAvatar') {
        const { avatarUrl } = event;
        if (!avatarUrl) return { success: false, error: '缺少 avatarUrl' };
        await getPool().query('UPDATE users SET avatar = ? WHERE _openid = ?', [avatarUrl, openid]);
        return { success: true };

      } else {
        return { success: false, error: '未知 action' };
      }
    }

    // ══════════════════════════════════════════════════════════
    // EXERCISE
    // ══════════════════════════════════════════════════════════
    if (category === 'exercise') {
      const openid = event.openid;

      if (sub === 'add') {
        const { session_id, exercise_id, name_zh, name_en, image_name, video_name, weight, reps, weight_unit } = event;
        if (!session_id || !exercise_id || !name_zh) return { success: false, error: '缺少必填字段' };
        const [sessions] = await getPool().query('SELECT _openid, user_id FROM sessions WHERE id = ?', [session_id]);
        const _openid = sessions.length > 0 ? sessions[0]._openid : null;
        const userId = sessions.length > 0 ? sessions[0].user_id : null;

        const [result] = await getPool().query(
          'INSERT INTO exercises (session_id, _openid, user_id, exercise_id, name_zh, name_en, image_name, video_name, weight, reps, weight_unit, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [session_id, _openid, userId, exercise_id, name_zh, name_en || null, image_name || null, video_name || null, parseFloat(weight) || 0, parseInt(reps) || 0, (weight_unit || 'kg')]);
        return { success: true, exerciseId: result.insertId };

      } else if (sub === 'list') {
        const { session_id } = event;
        if (!session_id) return { success: false, error: '缺少 session_id' };
        const [rows] = await getPool().query(
          'SELECT * FROM exercises WHERE session_id = ? ORDER BY create_time ASC',
          [session_id]);
        return { success: true, exercises: rows };

      } else if (sub === 'getMaxWeight') {
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

      } else if (sub === 'update') {
        const { id, session_id, weight, reps, openid: callerOpenid, weight_unit } = event;
        if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
        await getPool().query(
          'UPDATE exercises SET weight = ?, reps = ?, weight_unit = ? WHERE id = ? AND session_id = ? AND _openid = ?',
          [parseFloat(weight) || 0, parseInt(reps) || 0, (weight_unit || 'kg'), id, session_id, callerOpenid]);
        return { success: true };

      } else if (sub === 'delete') {
        const { id, session_id, openid: callerOpenid } = event;
        if (!id || !session_id) return { success: false, error: '缺少 id 或 session_id' };
        await getPool().query('DELETE FROM exercises WHERE id = ? AND session_id = ? AND _openid = ?', [id, session_id, callerOpenid]);
        return { success: true };

      } else if (sub === 'toggleFavorite') {
        const { exercise_id } = event;
        if (!exercise_id) return { success: false, error: '缺少 exercise_id' };
        if (!openid) return { success: false, error: '缺少 openid' };

        const [users] = await getPool().query('SELECT favor_exercises FROM users WHERE _openid = ?', [openid]);
        const raw = users.length > 0 ? (users[0].favor_exercises || '') : '';
        const current = raw ? raw.split(',').filter(Boolean).map(Number) : [];

        let updated;
        if (current.includes(Number(exercise_id))) {
          updated = current.filter(id => id !== Number(exercise_id));
        } else {
          updated = [...current, Number(exercise_id)];
        }

        await getPool().query(
          'UPDATE users SET favor_exercises = ? WHERE _openid = ?',
          [updated.join(','), openid]
        );
        return { success: true, favor_exercises: updated };

      } else if (sub === 'markPracticed') {
        const { exercise_id } = event;
        if (!exercise_id || !openid) return { success: false };
        try {
          const [users] = await getPool().query('SELECT practiced_exercises FROM users WHERE _openid = ?', [openid]);
          const raw = users.length > 0 ? (users[0].practiced_exercises || '') : '';
          const current = raw ? raw.split(',').filter(Boolean).map(Number) : [];
          const arr = Array.isArray(current) ? current : [];
          if (!arr.includes(Number(exercise_id))) {
            arr.push(Number(exercise_id));
            await getPool().query(
              'UPDATE users SET practiced_exercises = ? WHERE _openid = ?',
              [arr.join(','), openid]
            );
          }
        } catch (err) {
          console.error('markPracticed error:', err.message);
        }
        return { success: true };

      } else if (sub === 'getUserExercises') {
        if (!openid) return { success: false, error: '缺少 openid' };
        const [users] = await getPool().query('SELECT favor_exercises, practiced_exercises FROM users WHERE _openid = ?', [openid]);
        if (users.length === 0) return { success: true, favor_exercises: [], practiced_exercises: [] };
        const favorRaw = users[0].favor_exercises || '';
        const practicedRaw = users[0].practiced_exercises || '';
        const favor = favorRaw ? favorRaw.split(',').filter(Boolean).map(Number) : [];
        const practiced = practicedRaw ? practicedRaw.split(',').filter(Boolean).map(Number) : [];
        return { success: true, favor_exercises: favor, practiced_exercises: practiced };

      } else {
        return { success: false, error: '未知 action' };
      }
    }

    // ══════════════════════════════════════════════════════════
    // EXERCISE LIBRARY (no openid required)
    // ══════════════════════════════════════════════════════════
    if (category === 'library') {
      const { keyword, bodyPart, equipmentId, id, exerciseId, page = 1, pageSize = 20, isFavor, isPracticed, favorExerIds, practicedExerIds } = event;

      if (sub === 'list') {
        let sql = 'SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id,exercise_type,is_favorite FROM exercises_library WHERE 1=1';
        const params = [];

        if (keyword) {
          sql += ' AND (name LIKE ? OR name_zh LIKE ?)';
          params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (bodyPart && Number(bodyPart) !== 0) {
          sql += ' AND (body_part_id = ? OR body_part_id LIKE ? OR body_part_id LIKE ? OR body_part_id LIKE ?)';
          params.push(bodyPart, `${bodyPart},%`, `%,${bodyPart},%`, `%,${bodyPart}`);
        }
        if (equipmentId && Number(equipmentId) !== 0) {
          sql += ' AND (equipment_id = ? OR equipment_id LIKE ? OR equipment_id LIKE ? OR equipment_id LIKE ?)';
          params.push(equipmentId, `${equipmentId},%`, `%,${equipmentId},%`, `%,${equipmentId}`);
        }

        if (isFavor && isPracticed) {
          if (favorExerIds && favorExerIds.length > 0 && practicedExerIds && practicedExerIds.length > 0) {
            const intersection = favorExerIds.filter(id => practicedExerIds.includes(id));
            if (intersection.length > 0) {
              sql += ` AND id IN (${intersection.map(() => '?').join(',')})`;
              params.push(...intersection);
            } else {
              sql += ' AND 1=0';
            }
          } else {
            sql += ' AND 1=0';
          }
        } else if (isFavor) {
          if (favorExerIds && favorExerIds.length > 0) {
            sql += ` AND id IN (${favorExerIds.map(() => '?').join(',')})`;
            params.push(...favorExerIds);
          } else {
            sql += ' AND 1=0';
          }
        } else if (isPracticed) {
          if (practicedExerIds && practicedExerIds.length > 0) {
            sql += ` AND id IN (${practicedExerIds.map(() => '?').join(',')})`;
            params.push(...practicedExerIds);
          } else {
            sql += ' AND 1=0';
          }
        }

        sql += ' ORDER BY name_zh ASC LIMIT ? OFFSET ?';
        params.push(pageSize, (page - 1) * pageSize);

        const [rows] = await getPool().query(sql, params);
        return { success: true, list: rows, page, pageSize };

      } else if (sub === 'detail') {
        if (!id) return { success: false, error: '缺少 id' };
        const [rows] = await getPool().query(
          'SELECT * FROM exercises_library WHERE id = ? LIMIT 1',
          [id]
        );
        return { success: true, item: rows[0] || null };

      } else if (sub === 'favorites') {
        const [rows] = await getPool().query(
          'SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id,exercise_type,is_favorite FROM exercises_library WHERE is_favorite = 1 ORDER BY name_zh ASC'
        );
        return { success: true, list: rows };

      } else if (sub === 'toggleLibraryFavorite') {
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

      } else if (sub === 'count') {
        const [rows] = await getPool().query(
          'SELECT COUNT(*) as total FROM exercises_library'
        );
        return { success: true, total: rows[0].total };

      } else {
        return { success: false, error: '未知 action' };
      }
    }

    // ══════════════════════════════════════════════════════════
    // STATS
    // ══════════════════════════════════════════════════════════
    if (category === 'stats') {
      const openid = event.openid;
      if (!openid) return { success: false, error: '未登录' };

      if (sub === 'summary' || !sub) {
        // Total finished sessions
        const [[totalRow]] = await getPool().query(
          "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished'",
          [openid]);
        const totalSessions = totalRow ? totalRow.n : 0;

        // Total volume
        const [[volumeRow]] = await getPool().query(
          "SELECT COALESCE(SUM(e.weight * e.reps), 0) as total FROM exercises e JOIN sessions s ON e.session_id = s.id WHERE s._openid = ? AND s.status = 'finished'",
          [openid]);
        const totalVolume = Number(volumeRow ? volumeRow.total : 0);

        // Week workouts
        const [[weekRow]] = await getPool().query(
          "SELECT COUNT(*) as n FROM sessions WHERE _openid = ? AND status = 'finished' AND start_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
          [openid]);
        const weekWorkouts = weekRow ? weekRow.n : 0;

        // Current streak
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

        // Exercise history
        const [histRows] = await getPool().query(
          `SELECT e.exercise_id, el.name_zh, el.name as name_en,
                  el.body_part_id as body_part_ids,
                  JSON_ARRAYAGG(JSON_OBJECT('weight', e.weight, 'reps', e.reps, 'weight_unit', e.weight_unit, 'create_time', e.create_time)) as records
           FROM exercises e
           JOIN sessions s ON e.session_id = s.id
           JOIN exercises_library el ON e.exercise_id = el.id
           WHERE s._openid = ? AND s.status = 'finished'
           GROUP BY e.exercise_id, el.name_zh, el.name, el.body_part_id
           ORDER BY e.exercise_id`,
          [openid]);

        const historyExercises = (histRows || []).map(row => {
          let records = [];
          try {
            records = typeof row.records === 'string' ? JSON.parse(row.records) : (row.records || []);
          } catch (e) {}
          return {
            exercise_id: row.exercise_id,
            name_zh: row.name_zh,
            name_en: row.name_en,
            body_part_ids: row.body_part_ids,
            records,
          };
        });

        // Weekly volume
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

        // Recent sessions
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

      } else if (sub === 'exerciseMax') {
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

      } else if (sub === 'exerciseList') {
        const [rows] = await getPool().query(
          `SELECT DISTINCT e.exercise_id, e.name_zh
           FROM exercises e
           JOIN sessions s ON e.session_id = s.id
           WHERE s._openid = ? AND s.status = 'finished'
           ORDER BY e.name_zh`,
          [openid]);
        return { success: true, exercises: rows || [] };

      } else if (sub === 'exerciseRecords') {
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

      } else if (sub === 'monthDates') {
        const { year, month } = event;
        if (!year || !month) return { success: false, error: '缺少 year 或 month' };

        const [rows] = await getPool().query(
          `SELECT DATE(start_time) as day FROM sessions
           WHERE _openid = ? AND status = 'finished'
             AND YEAR(start_time) = ? AND MONTH(start_time) = ?
           GROUP BY DATE(start_time)
           ORDER BY day ASC`,
          [openid, year, month]);

        const dates = (rows || []).map(r => {
          const d = r.day;
          if (d instanceof Date) {
            return d.toISOString().slice(0, 10);
          }
          return String(d).slice(0, 10);
        });
        return { success: true, dates };

      } else {
        return { success: false, error: '未知 action' };
      }
    }

    // ── Unknown category ──────────────────────────────────────────
    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};