#!/usr/bin/env node
/**
 * 裁剪 + 二次压缩 + 覆盖上传
 *
 * 目标规格对齐库内存量视频: 960x540 / h264 / ≤1MB / 无音轨
 * 命名不变(还是 自己的图片名 1101→1201), 所以库里 video_name 不用改, 只换磁盘文件
 *
 * 流程: 裁剪 → 两遍 ABR 编码(精确控体积) → 校验体积/分辨率/时长 → 抽帧确认内容 → scp 覆盖 → 公网 206 + sha256
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const LOCAL = '/tmp/gfit_yt/20261121';
const ENC = path.join(LOCAL, 'enc');
fs.mkdirSync(ENC, { recursive: true });
const REMOTE_HOST = 'admin@47.108.200.98';
const REMOTE_DIR = '/media/gfit/exer_videos/';
const CDN = 'https://gfit.l2ee.top/exer_videos/';
const TARGET_BYTES = 950 * 1024;      // 目标 ≤950KB, 留余量到 1MB
const W = 960, H = 540;

// id → { 源文件, 裁剪起, 裁剪止, youtubeId, 标题 }
const ITEMS = [
  { id: 46,   src: 'rf_46_wiq7946sfpQ.mp4',   from: 1.0,  to: 22.5, yt: 'wiq7946sfpQ', title: 'Barbell Standing Reverse Grip Curls' },
  { id: 106,  src: 'yt_106_1nH_6L4OnMw.mp4',  from: 2.0,  to: 36.0, yt: '1nH_6L4OnMw', title: 'Exercise 163 - Cable Supine Reverse Fly (TITAN T1)' },
  { id: 294,  src: 'yt_294_ZQr2g84lHwQ.mp4',  from: 4.0,  to: 37.0, yt: 'ZQr2g84lHwQ', title: 'Shoulders - Standing Barbell Military Press' },
  { id: 320,  src: 'rf_320_Kxt_5D2Rpgg.mp4',  from: 3.0,  to: 45.0, yt: 'Kxt_5D2Rpgg', title: 'Decline Barbell Bench Press - Chest Exercise' },
  { id: 329,  src: 'rf_329_BwPXZRWzBhQ.mp4',  from: 0.5,  to: 10.3, yt: 'BwPXZRWzBhQ', title: 'Smith Machine Wide Grip Bench Press' },
  { id: 410,  src: 'rf_410_GmQFOUh5pJ0.mp4',  from: 0.5,  to: 12.5, yt: 'GmQFOUh5pJ0', title: 'Seated Cable Concentration Curls' },
  { id: 424,  src: 'yt_424_EPN2D-CwlqE.mp4',  from: 0.5,  to: 20.0, yt: 'EPN2D-CwlqE', title: 'Barbell Reverse Grip Skullcrusher' },
  { id: 434,  src: 'rf_434_Rd5AsxOGqss.mp4',  from: 0.5,  to: 15.0, yt: 'Rd5AsxOGqss', title: 'How To Do Dumbbell Upright Rows' },
  { id: 1471, src: 'rf_1471_Lx5ykCjizpk.mp4', from: 17.0, to: 31.0, yt: 'Lx5ykCjizpk', title: 'How to use a Therapy in Motion Balance Wobble Board' },
  { id: 1534, src: 'yt_1534_FDA03FaUqc4.mp4', from: 12.0, to: 45.0, yt: 'FDA03FaUqc4', title: 'Barbell Rollout from Bench - Exercise Videos & Guides' },
];

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const probe = (f) => {
  const o = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', f]);
  return JSON.parse(o.toString());
};

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const ids = ITEMS.map((i) => i.id);
  const ph = ids.map(() => '?').join(',');
  const rows = (await conn.query(`SELECT id,name,name_zh,image_name,video_name FROM exercises_library WHERE id IN (${ph})`, ids))[0];
  await conn.end();
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const remoteList = sh('ssh', ['-n', '-i', process.env.HOME + '/.ssh/gfit_ci_deploy', REMOTE_HOST, `ls ${REMOTE_DIR}`]).toString().split('\n').filter(Boolean);
  const remoteSet = new Set(remoteList);

  const plan = [];
  for (const it of ITEMS) {
    const src = path.join(LOCAL, it.src);
    if (!fs.existsSync(src)) throw new Error(`源文件缺失 ${src}`);
    const row = byId.get(it.id);
    if (!row) throw new Error(`库里没有 id=${it.id}`);
    const target = String(row.image_name).replace(/^(\d{4})1101/, (_, g) => g + '1201').replace(/_small\.png$/, '.mp4');
    if (!remoteSet.has(target)) throw new Error(`生产机没有目标文件(应先存在): ${target}`);
    if (row.video_name !== target) throw new Error(`库里 video_name 与目标文件名不一致 id=${it.id}: ${row.video_name} vs ${target}`);

    const dur = it.to - it.from;
    // 两遍 ABR: 精确控体积
    const kbps = Math.floor((TARGET_BYTES * 8) / dur / 1024);   // ⚠️ 算出来已经是 kbit/s, 别再拼 'k'
    const out = path.join(ENC, target);
    const passlog = path.join(ENC, `${it.id}.log`);
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-iw)/2,fps=25`;
    sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(it.from), '-to', String(it.to), '-i', src,
      '-vf', vf, '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-b:v', `${kbps}k`,
      '-maxrate', `${Math.floor(kbps * 1.15)}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p',
      '-pass', '1', '-passlogfile', passlog, '-an', '-f', 'mp4', '/dev/null']);
    sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(it.from), '-to', String(it.to), '-i', src,
      '-vf', vf, '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-b:v', `${kbps}k`,
      '-maxrate', `${Math.floor(kbps * 1.15)}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p',
      '-pass', '2', '-passlogfile', passlog, '-an', '-movflags', '+faststart', out]);

    const size = fs.statSync(out).size;
    const pr = probe(out);
    const v = (pr.streams || []).find((s) => s.codec_type === 'video');
    const odur = Number(pr.format.duration);
    if (size > 1024 * 1024) throw new Error(`${it.id} 编码后仍超过 1MB: ${(size / 1048576).toFixed(2)}MB`);
    if (!v || v.width !== W || v.height !== H) throw new Error(`${it.id} 分辨率不对: ${v && v.width}x${v && v.height}`);
    if (Math.abs(odur - dur) > 1.5) throw new Error(`${it.id} 时长偏差大: 期望${dur.toFixed(1)} 实际${odur.toFixed(1)}`);
    plan.push({ ...it, target, out, size, dur: odur, sha256: sha(out), kbps });
    console.log(`  ✓ id=${String(it.id).padEnd(5)} ${target}`);
    console.log(`      ${(size / 1024).toFixed(0)}KB  ${odur.toFixed(1)}s  ${W}x${H}  ${kbps}kbps`);
  }

  // 抽帧确认裁剪后仍是有效画面(黑帧检测)
  for (const p of plan) {
    const st = sh('ffmpeg', ['-v', 'error', '-i', p.out, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']).toString();
    const ys = [...st.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
    p.yavg = Number(avg.toFixed(1));
    if (avg < 12) throw new Error(`id=${p.id} 裁剪后画面几乎全黑(YAVG=${avg.toFixed(1)}), 片段选错了`);
    console.log(`  🎞  id=${p.id} 全片平均亮度 ${p.yavg}`);
  }

  console.log('\n──── 上传 ────');
  for (const p of plan) {
    sh('scp', ['-i', process.env.HOME + '/.ssh/gfit_ci_deploy', '-o', 'StrictHostKeyChecking=no',
      p.out, `${REMOTE_HOST}:${REMOTE_DIR}${p.target}`]);
    const rs = sh('ssh', ['-n', '-i', process.env.HOME + '/.ssh/gfit_ci_deploy', REMOTE_HOST,
      `sha256sum '${REMOTE_DIR}${p.target}'`]).toString().split(/\s+/)[0];
    if (rs !== p.sha256) throw new Error(`生产机 sha256 不一致: ${p.target}`);
    const res = await fetch(CDN + encodeURIComponent(p.target), { headers: { Range: 'bytes=0-1023' } });
    if (res.status !== 200 && res.status !== 206) throw new Error(`公网取不到 ${p.target}: ${res.status}`);
    const len = res.headers.get('content-length');
    console.log(`  ✓ ${p.target}  公网${res.status} ${res.headers.get('content-type')} len=${len}  sha256一致`);
  }

  const total = plan.reduce((s, p) => s + p.size, 0);
  console.log(`\n合计 ${(total / 1048576).toFixed(2)}MB / ${plan.length} 条, 单条最大 ${(Math.max(...plan.map((p) => p.size)) / 1024).toFixed(0)}KB`);

  fs.writeFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_youtube_video_reencoded_2026-11-21.json', JSON.stringify({
    appliedAt: new Date().toISOString(),
    spec: `${W}x${H} h264 ≤1MB 无音轨 faststart`,
    items: plan.map((p) => ({ id: p.id, name: byId.get(p.id).name, nameZh: byId.get(p.id).name_zh, youtubeId: p.yt, title: p.title, trim: `${p.from}-${p.to}s`, duration: p.dur, sizeKB: +(p.size / 1024).toFixed(0), file: p.target, sha256: p.sha256, url: CDN + p.target })),
  }, null, 2));
  console.log('记录已写: docs/gfit_youtube_video_reencoded_2026-11-21.json');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
