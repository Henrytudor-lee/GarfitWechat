#!/usr/bin/env node
/**
 * 重检索：对不合格的条目换检索词，把前 N 个候选全下下来（只下载，不上传不写库）
 * 用法: node gfit_yt_refetch.js '<id>:<query>;<id>:<query>' [每条候选数]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROXY = 'http://127.0.0.1:7890';
const OUT = '/tmp/gfit_yt/20261121';

const TASKS = (process.argv[2] || '').split(';').filter(Boolean).map((s) => {
  const [id, ...q] = s.split(':');
  return { id: Number(id), query: q.join(':') };
});
const TOPN = Number(process.argv[3] || 3);

const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const BAD_TITLE = /(full body workout|complete workout|15 min|20 min|30 min|45 min|60 min|playlist|mashup|music|remix|song|gameplay|intro|outro|warm ?up|cooldown|editing|compilation|all exercises|every exercise|\d+ exercises)/i;

function ytsearch(query, n) {
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const out = execFileSync('yt-dlp', ['--proxy', PROXY, '--socket-timeout', '20', '--no-warnings',
        `ytsearch${n}:${query}`, '--flat-playlist', '--dump-json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch (e) {
      last = e;
      console.log(`    (搜索第 ${attempt} 次失败: ${String(e.stderr || e.message).split('\n')[0].slice(0, 90)} → 重试)`);
      execFileSync('sleep', ['2']);
    }
  }
  throw last;
}

function download(url, outBase) {
  execFileSync('yt-dlp', ['--proxy', PROXY, '--socket-timeout', '25', '--no-warnings',
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4',
    '-o', `${outBase}.%(ext)s`, url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'] });
  return `${outBase}.mp4`;
}
const isMp4 = (f) => { const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd); return b.slice(4, 8).toString('latin1') === 'ftyp'; };

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const ph = TASKS.map(() => '?').join(',');
  const rows = (await conn.query(
    `SELECT id,name,name_zh,image_name,equipment_id FROM exercises_library WHERE id IN (${ph})`, TASKS.map((t) => t.id)))[0];
  await conn.end();
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const out = [];
  for (const t of TASKS) {
    const r = byId.get(t.id);
    if (!r) { console.log(`\n=== id ${t.id} 不在库里, 跳过`); continue; }
    console.log(`\n=== id ${t.id} ${r.name} | 新检索词: ${t.query}`);
    let cands = [];
    try { cands = ytsearch(t.query, 14).filter((c) => !BAD_TITLE.test(c.title || '')); }
    catch (e) { console.log('  搜索彻底失败, 跳过该条'); continue; }
    console.log(`  候选标题:`);
    cands.slice(0, 8).forEach((c, i) => console.log(`    ${i + 1}. [${c.duration}s] ${(c.title || '').slice(0, 85)}`));

    const got = [];
    for (const c of cands.slice(0, TOPN)) {
      const base = path.join(OUT, `rf_${t.id}_${c.id}`);
      try {
        const f = download(`https://www.youtube.com/watch?v=${c.id}`, base);
        if (!fs.existsSync(f) || !isMp4(f)) { console.log(`    ✗ ${c.id} 魔数失败`); continue; }
        got.push({ id: t.id, name: r.name, youtubeId: c.id, title: c.title, channel: c.channel || c.uploader || '',
          duration: c.duration, views: c.view_count, localFile: f, size: fs.statSync(f).size,
          targetFileName: r.image_name.replace(/1101/, '1201').replace(/_small\.png$/, '.mp4') });
        console.log(`    ✓ ${c.id} "${(c.title || '').slice(0, 60)}"`);
      } catch (e) { console.log(`    ✗ ${c.id} 下载失败`); }
    }
    out.push(...got);
  }
  fs.writeFileSync(path.join(OUT, 'refetch.json'), JSON.stringify(out, null, 2));
  console.log(`\n共 ${out.length} 个候选 → ${path.join(OUT, 'refetch.json')}`);
})().catch((e) => { console.error(e); process.exit(1); });
