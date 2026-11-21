#!/usr/bin/env node
/**
 * 把 YouTube 检索到的演示视频上传到生产机并写回库
 *
 * 命名: 视频名 = 该动作**自己的图片名**把 1101 换成 1201、去掉 _small
 *   → 图/视频 4 位组号天然一致, 不破坏库内不变量
 *
 * 流程: 备份 → 改名 → 碰撞检查 → scp 到生产机 → 公网 200 + sha256 校验 → 写库 → 复核
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const LOCAL = '/tmp/gfit_yt/20261121';
const DOCS = '/Volumes/world/program/fitness_wechat/docs';
const REMOTE_HOST = 'admin@47.108.200.98';
const REMOTE_DIR = '/media/gfit/exer_videos/';
const CDN = 'https://gfit.l2ee.top/exer_videos/';
const SECRET = process.env.ADMIN_SECRET;

// 最终选定: id → 本地文件
const PICKS = [
  { id: 46,   file: 'rf_46_wiq7946sfpQ.mp4',        yt: 'wiq7946sfpQ', title: 'Barbell Standing Reverse Grip Curls',                     dur: 24 },
  { id: 106,  file: 'yt_106_1nH_6L4OnMw.mp4',        yt: '1nH_6L4OnMw', title: 'Exercise 163 - Cable Supine Reverse Fly (TITAN T1)',           dur: 41 },
  { id: 294,  file: 'yt_294_ZQr2g84lHwQ.mp4',        yt: 'ZQr2g84lHwQ', title: 'Shoulders - Standing Barbell Military Press',                dur: 41 },
  { id: 320,  file: 'rf_320_Kxt_5D2Rpgg.mp4',        yt: 'Kxt_5D2Rpgg', title: 'Decline Barbell Bench Press - Chest Exercise',                 dur: 47 },
  { id: 329,  file: 'yt_329_6aKSiZBPvPk.mp4',        yt: '6aKSiZBPvPk', title: 'Exercise Tutorial: Wide Grip Smith Machine Bench Press',      dur: 220 },
  { id: 410,  file: 'rf_410_4tqc6FQSHn8.mp4',        yt: '4tqc6FQSHn8', title: 'Perfect Your Concentration Curl for Optimal Bicep Isolation', dur: 89 },
  { id: 424,  file: 'yt_424_EPN2D-CwlqE.mp4',        yt: 'EPN2D-CwlqE', title: 'Barbell Reverse Grip Skullcrusher',                          dur: 21 },
  { id: 434,  file: 'yt_434_K0dYqPCaO14.mp4',        yt: 'K0dYqPCaO14', title: 'How-To Perform Upright Rows - Dumbbell Exercise Tutorial',   dur: 104 },
  { id: 1471, file: 'rf_1471_Lx5ykCjizpk.mp4',       yt: 'Lx5ykCjizpk', title: 'How to use a Therapy in Motion Balance Wobble Board',        dur: 38 },
  { id: 1534, file: 'yt_1534_FDA03FaUqc4.mp4',       yt: 'FDA03FaUqc4', title: 'Barbell Rollout from Bench - Exercise Videos & Guides',      dur: 71 },
];

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const isMp4 = (f) => { const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd); return b.slice(4, 8).toString('latin1') === 'ftyp'; };

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await conn.query(s))[0];

  // ── 1. 取库行 + 备份 ──
  const ids = PICKS.map((p) => p.id);
  const ph = ids.map(() => '?').join(',');
  const rows = (await conn.query(`SELECT * FROM exercises_library WHERE id IN (${ph})`, ids))[0];
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const stamp = Date.now();
  const bak = path.join(DOCS, `gfit_backup_youtube_video-${stamp}.json`);
  fs.writeFileSync(bak, JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: '为 10 条缺视频动作补 YouTube 检索到的演示视频',
    rows: rows.map((r) => ({
      id: r.id, name: r.name, name_zh: r.name_zh, image_name: r.image_name,
      video_name: r.video_name, equipment_id: r.equipment_id, body_part_id: r.body_part_id,
      exercise_type: r.exercise_type, is_favorite: r.is_favorite,
    })),
  }, null, 2));
  console.log(`📦 备份已写 (${rows.length} 行): ${bak}`);

  // ── 2. 准备文件 + 目标名 + 碰撞检查 ──
  const remoteList = execFileSync('ssh', ['-n', '-i', process.env.HOME + '/.ssh/gfit_ci_deploy', REMOTE_HOST, `ls ${REMOTE_DIR}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const remoteSet = new Set(remoteList);

  const plan = [];
  for (const p of PICKS) {
    const src = path.join(LOCAL, p.file);
    if (!fs.existsSync(src)) throw new Error(`本地文件缺失: ${src}`);
    if (!isMp4(src)) throw new Error(`魔数校验失败(不是 mp4): ${src}`);
    const row = byId.get(p.id);
    if (!row) throw new Error(`库里没有 id=${p.id}`);
    if (row.video_name !== null && row.video_name !== undefined && row.video_name !== '') {
      throw new Error(`id=${p.id} 已经有视频(${row.video_name}), 不该覆盖`);
    }
    const target = String(row.image_name).replace(/^(\d{4})1101/, (_, g) => g + '1201').replace(/_small\.png$/, '.mp4');
    if (remoteSet.has(target)) throw new Error(`目标文件名与生产机已有文件冲突: ${target}`);
    const dupInPlan = plan.find((x) => x.target === target);
    if (dupInPlan) throw new Error(`本次计划内文件名冲突: ${target}`);
    plan.push({ ...p, src, target, size: fs.statSync(src).size, sha256: sha(src), id_: p.id });
  }
  console.log(`✅ 命名与碰撞检查通过 (${plan.length} 条, 目标名与生产机现有 ${remoteList.length} 个文件无冲突)`);

  // ── 3. scp 上传 ──
  for (const p of plan) {
    execFileSync('scp', ['-i', process.env.HOME + '/.ssh/gfit_ci_deploy', '-o', 'StrictHostKeyChecking=no',
      p.src, `${REMOTE_HOST}:${REMOTE_DIR}${p.target}`], { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`   ⬆  ${p.target}  (${(p.size / 1048576).toFixed(1)}MB)`);
  }

  // ── 4. 生产机磁盘校验 + 公网校验 ──
  const remoteSha = execFileSync('ssh', ['-n', '-i', process.env.HOME + '/.ssh/gfit_ci_deploy', REMOTE_HOST,
    `cd ${REMOTE_DIR} && sha256sum ${plan.map((p) => `'${p.target}'`).join(' ')}`], { encoding: 'utf8' });
  const remoteMap = new Map(remoteSha.split('\n').filter(Boolean).map((l) => {
    const [h, f] = l.trim().split(/\s+/); return [f, h];
  }));

  for (const p of plan) {
    const rs = remoteMap.get(p.target);
    if (rs !== p.sha256) throw new Error(`生产机文件 sha256 不一致: ${p.target}`);
    const res = await fetch(CDN + encodeURIComponent(p.target), { method: 'GET', headers: { Range: 'bytes=0-1023' } });
    if (res.status !== 200 && res.status !== 206) throw new Error(`公网取不到: ${CDN}${p.target} → ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    console.log(`   ✓ ${p.target}  公网 ${res.status} ${ct}  sha256 一致`);
  }

  // ── 5. 写库 ──
  for (const p of plan) {
    const res = await fetch(`http://127.0.0.1:3000/admin/library/${p.id}`, {
      method: 'PUT',
      headers: { 'x-admin-secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoName: p.target }),
    });
    if (!res.ok) throw new Error(`写库失败 id=${p.id}: ${res.status} ${await res.text()}`);
    console.log(`   💾 id=${p.id} → video_name=${p.target}`);
  }

  // ── 6. 复核 ──
  const after = (await conn.query(`SELECT id,name,image_name,video_name FROM exercises_library WHERE id IN (${ph})`, ids))[0];
  console.log('\n════ 复核 ════');
  for (const r of after) console.log(`  id ${r.id} | 图 ${String(r.image_name).slice(0, 46)} | 视频 ${r.video_name}`);
  const stillNull = after.filter((r) => !r.video_name).length;
  const grpOk = after.filter((r) => String(r.image_name).slice(0, 4) === String(r.video_name).slice(0, 4)).length;
  const bad = await q('SELECT COUNT(*) c FROM exercises_library WHERE video_name IS NULL');
  console.log(`\n这 10 条仍缺视频: ${stillNull} (预期 0)`);
  console.log(`图/视频 4 位组号一致: ${grpOk}/${after.length} (预期 ${after.length})`);
  console.log(`全库缺视频总数: ${bad[0].c} (预期 ${1567 - plan.length})`);
  const orphanEx = (await q('SELECT COUNT(*) c FROM exercises e LEFT JOIN exercises_library l ON l.id=e.exercise_id WHERE l.id IS NULL'))[0].c;
  console.log(`孤儿 exercises: ${orphanEx}`);

  fs.writeFileSync(path.join(DOCS, `gfit_youtube_video_applied_${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({
    appliedAt: new Date().toISOString(),
    backup: path.basename(bak),
    items: plan.map((p) => ({ id: p.id, name: byId.get(p.id).name, nameZh: byId.get(p.id).name_zh, youtubeId: p.yt, title: p.title, duration: p.dur, file: p.target, size: p.size, sha256: p.sha256, url: CDN + p.target })),
  }, null, 2));
  console.log('\n应用记录已写:', DOCS);

  await conn.end();
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
