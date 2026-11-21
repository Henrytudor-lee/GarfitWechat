#!/usr/bin/env node
/**
 * 删除 161 条「完全同义」的缺视频重复行
 *
 * 流程: 临删前逐条复核 → 全量备份 → 走 admin API 批量删除(事务级联+审计) → 复核终态
 * 任一条复核不过就整体中止, 不做部分删除。
 */
const path = require('path');
const fs = require('fs');

const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const DOCS = '/Volumes/world/program/fitness_wechat/docs';
const LIST = path.join(DOCS, 'gfit_dup_deletable_20261113.json');
const API = 'http://127.0.0.1:3000/admin/library/delete';

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await c.query(s))[0];

  const plan = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const ids = plan.ids;
  const keeperOf = new Map(plan.rows.map((r) => [r.id, r.keeperId]));
  console.log(`待删清单: ${ids.length} 条`);

  // ── 1. 临删前复核 ──
  const ph = ids.map(() => '?').join(',');
  const cands = (await c.query(
    `SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id,exercise_type,is_favorite
       FROM exercises_library WHERE id IN (${ph})`, ids))[0];
  const byId = new Map(cands.map((r) => [Number(r.id), r]));

  const exRows = (await c.query(
    `SELECT exercise_id, COUNT(*) n FROM exercises WHERE exercise_id IN (${ph}) GROUP BY exercise_id`, ids))[0];
  const stRows = (await c.query(
    `SELECT exercise_id, COUNT(*) n FROM user_exercise_stats WHERE exercise_id IN (${ph}) GROUP BY exercise_id`, ids))[0];
  const exCnt = new Map(exRows.map((r) => [Number(r.exercise_id), Number(r.n)]));
  const stCnt = new Map(stRows.map((r) => [Number(r.exercise_id), Number(r.n)]));

  const violations = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) { violations.push({ id, why: '行已不存在' }); continue; }
    if (r.video_name !== null && r.video_name !== undefined) violations.push({ id, name: r.name, why: '已经有视频' });
    if ((exCnt.get(id) || 0) > 0) violations.push({ id, name: r.name, why: `有 ${exCnt.get(id)} 条训练记录` });
    if ((stCnt.get(id) || 0) > 0) violations.push({ id, name: r.name, why: `有 ${stCnt.get(id)} 条收藏/练过标记` });
    if (Number(r.is_favorite || 0) === 1) violations.push({ id, name: r.name, why: '是精选动作' });
    const kid = keeperOf.get(id);
    const keep = kid ? byId.get(kid) : null;
    if (kid && !keep) {
      // 守护者不在候选集里, 单独查
      const k = (await c.query('SELECT id,name,video_name FROM exercises_library WHERE id=?', [kid]))[0][0];
      if (!k) violations.push({ id, name: r.name, why: `守护者 ${kid} 不存在` });
      else if (!k.video_name) violations.push({ id, name: r.name, why: `守护者 ${kid} 现在也没视频` });
    }
  }

  if (violations.length) {
    console.log(`\n❌ 复核不通过 ${violations.length} 条, 已中止, 未删除任何数据:`);
    for (const v of violations.slice(0, 30)) console.log('   ', v.id, v.name || '', '→', v.why);
    await c.end();
    process.exit(2);
  }
  console.log(`✅ 临删前复核通过: ${ids.length} 条全部满足「无视频 + 零使用 + 非精选 + 守护者仍带视频」`);

  // ── 2. 备份 ──
  const keepIds = [...new Set(plan.rows.map((r) => r.keeperId))];
  const kph = keepIds.map(() => '?').join(',');
  const keepers = (await c.query(
    `SELECT id,name,name_zh,image_name,video_name FROM exercises_library WHERE id IN (${kph})`, keepIds))[0];
  const before = await q('SELECT COUNT(*) c FROM exercises_library');
  const stamp = Date.now();
  const bak = path.join(DOCS, `gfit_backup_dupdelete-${stamp}.json`);
  fs.writeFileSync(bak, JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: '删除完全同义的缺视频重复行(同名+同器械+同部位+零使用), 保留带视频的兄弟行',
    count: ids.length,
    libraryCountBefore: before[0].c,
    deletedRows: cands,
    keptKeeperRows: keepers,
  }, null, 2));
  console.log(`📦 备份已写: ${bak}`);

  // ── 3. 调用 admin API 删除 ──
  const secret = process.env.ADMIN_SECRET;
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('❌ 删除接口报错:', res.status, JSON.stringify(body).slice(0, 600));
    await c.end();
    process.exit(3);
  }
  console.log(`🗑️  删除接口返回: deleted=${body.deleted} removedExerciseRows=${body.removedExerciseRows} affectedUsers=${body.affectedUsers}`);

  // ── 4. 复核终态 ──
  const after = await q('SELECT COUNT(*) c FROM exercises_library');
  const left = (await c.query(`SELECT COUNT(*) c FROM exercises_library WHERE id IN (${ph})`, ids))[0][0].c;
  const orphanEx = (await q('SELECT COUNT(*) c FROM exercises e LEFT JOIN exercises_library l ON l.id=e.exercise_id WHERE l.id IS NULL'))[0].c;
  const orphanSt = (await q('SELECT COUNT(*) c FROM user_exercise_stats s LEFT JOIN exercises_library l ON l.id=s.exercise_id WHERE l.id IS NULL'))[0].c;
  const noVideo = (await q('SELECT COUNT(*) c FROM exercises_library WHERE video_name IS NULL'))[0].c;
  const keeperAlive = (await c.query(`SELECT COUNT(*) c FROM exercises_library WHERE id IN (${kph})`, keepIds))[0][0].c;
  const keeperNoVideo = (await c.query(
    `SELECT COUNT(*) c FROM exercises_library WHERE id IN (${kph}) AND (video_name IS NULL OR video_name='')`, keepIds))[0][0].c;

  console.log('\n════ 删除后复核 ════');
  console.log(`库总数            : ${before[0].c} → ${after[0].c}  (预期 ${before[0].c - ids.length})`);
  console.log(`161 条残留        : ${left}  (预期 0)`);
  console.log(`守护者仍在库      : ${keeperAlive}/${keepIds.length}  其中失去视频: ${keeperNoVideo} (预期 0)`);
  console.log(`孤儿 exercises    : ${orphanEx}  (预期 0)`);
  console.log(`孤儿 user_stats   : ${orphanSt}  (预期 0)`);
  console.log(`缺视频总数        : ${noVideo}  (预期 ${1728 - ids.length})`);

  // 审计
  const audit = (await q(
    `SELECT id, op, target_ids, affected_rows, create_time FROM admin_operation_log ORDER BY id DESC LIMIT 1`))[0];
  console.log(`审计记录          : #${audit.id} ${audit.op} affected=${audit.affected_rows} @ ${audit.create_time.toISOString()}`);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
