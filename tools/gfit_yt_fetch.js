#!/usr/bin/env node
/**
 * 从 YouTube 为指定动作检索 + 下载演示视频（只下载，不上传、不写库）
 *
 * 命名规则: 沿用 GymVisual 约定 —— 视频名 = 该动作**自己的图片名**把 1101 换成 1201、去掉 _small
 *   例: 11621101-Barbell-Standing-Military-Press_Shoulders_small.png
 *     → 11621201-Barbell-Standing-Military-Press_Shoulders.mp4
 *   这样图/视频的 4 位组号天然一致, 不破坏库内不变量。
 *
 * 选片规则:
 *   - 器械词从库里 equipment_id 翻译出来, 塞进检索词并要求标题命中(能命中就命中)
 *   - 动作名所有实词都必须在标题里出现
 *   - 时长 15~600s; 排除歌单/健身套餐/游戏/音乐类标题
 *   - 排序: 器械命中 > 动作词全覆盖 > 有"how to/tutorial"引导 > 播放量
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROXY = 'http://127.0.0.1:7890';
const OUT = '/tmp/gfit_yt/20261121';
const IDS = [46, 106, 294, 320, 329, 410, 424, 434, 1471, 1534];

// 库里 equipment_id → 英文检索词
const EQUIP = {
  1: 'barbell', 2: 'bodyweight', 3: 'cable', 4: 'dumbbell', 5: 'ez bar', 6: 'machine',
  7: 'sled', 8: 'smith machine', 9: 'weighted', 10: 'assisted', 11: 'band', 12: 'battle rope',
  13: 'bosu ball', 14: 'hammer', 15: 'kettlebell', 16: 'medicine ball', 17: 'olympic barbell',
  18: 'sled', 19: 'resistance band', 20: 'ab wheel', 21: 'roll ball', 22: 'rope',
  23: 'stability ball', 24: 'stick', 25: 'suspension', 26: 'trap bar', 27: 'vibration plate', 28: 'wheel roller',
};
// equipment_id → 该动作视频标题里该出现的器械词(用于打分, 非强制)
const EQUIP_TITLE = {
  1: ['barbell'], 2: ['bodyweight', 'body weight', 'no equipment', 'bw'],
  3: ['cable'], 4: ['dumbbell', 'db'], 5: ['ez bar', 'ez-bar'], 6: ['machine', 'lever', 'plate loaded'],
  8: ['smith'], 11: ['band', 'resistance'], 12: ['rope', 'battle rope'], 15: ['kettlebell'],
  16: ['medicine ball'], 20: ['ab wheel', 'wheel'], 23: ['stability ball', 'swiss ball', 'bosu'],
};
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'with', 'for', 'at', 'from']);
const BAD_TITLE = /(full body workout|complete workout|15 min|20 min|30 min|45 min|60 min|playlist|mashup|music|remix|song|gameplay|intro|outro|warm ?up|cooldown|editing|compilation|all exercises|every exercise|10 exercises|5 exercises)/i;

const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w && !STOP.has(w));

function score(name, equipmentId, title, duration, views) {
  const t = title.toLowerCase();
  const nt = toks(name);
  const missing = nt.filter((w) => !t.includes(w));
  if (missing.length) return null;                 // 动作名实词必须全覆盖
  let s = 100 - missing.length * 20;
  const eqWords = EQUIP_TITLE[equipmentId] || [];
  if (eqWords.length) {
    if (eqWords.some((w) => t.includes(w))) s += 40;
    else s -= 25;                                   // 器械不符 → 大幅降权
  }
  if (/(how to|教程|tutorial|exercise|technique|form|demo|演示)/i.test(title)) s += 15;
  if (/(10 mistakes|mistakes|5 mistakes|best|worst)/i.test(title)) s -= 10;
  if (duration && duration < 25) s -= 5;
  if (duration && duration > 400) s -= 10;
  if (views) s += Math.min(12, Math.log10(views + 1) * 3);
  return s;
}

function ytsearch(query, n = 10) {
  const out = execFileSync('yt-dlp', [
    '--proxy', PROXY, '--socket-timeout', '20', '--no-warnings',
    `ytsearch${n}:${query}`, '--flat-playlist', '--dump-json',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function download(url, outBase) {
  execFileSync('yt-dlp', [
    '--proxy', PROXY, '--socket-timeout', '25', '--no-warnings',
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
    '--merge-output-format', 'mp4',
    '-o', `${outBase}.%(ext)s`, url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'] });
  return `${outBase}.mp4`;
}

function isMp4(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return buf.slice(4, 8).toString('latin1') === 'ftyp';
}

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const doneIds = new Set(manifest.map((m) => m.id));

// 从 gfit-backend 读动作信息
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const ph = IDS.map(() => '?').join(',');
  const rows = (await conn.query(
    `SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id FROM exercises_library WHERE id IN (${ph})`,
    IDS,
  ))[0];
  await conn.end();

  for (const r of rows) {
    if (doneIds.has(r.id)) { console.log(`跳过 ${r.id} (已完成)`); continue; }
    const eq = EQUIP[r.equipment_id] || '';
    const query = `${r.name} ${eq} exercise`.replace(/\s+/g, ' ').trim();
    console.log(`\n=== ${r.id} ${r.name} | 检索词: ${query}`);

    let cands = [];
    try { cands = ytsearch(query, 12); } catch (e) { console.log('  搜索失败:', e.message.slice(0, 120)); continue; }
    if (!cands.length) { console.log('  无搜索结果'); continue; }

    const scored = cands
      .filter((c) => c.duration === null || (c.duration >= 15 && c.duration <= 600))
      .filter((c) => !BAD_TITLE.test(c.title || ''))
      .map((c) => ({ c, s: score(r.name, r.equipment_id, c.title, c.duration, c.view_count) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s - a.s);

    if (!scored.length) { console.log('  无合格候选'); continue; }
    console.log(`  候选 ${scored.length} 个, 前 3:`);
    for (const x of scored.slice(0, 3)) console.log(`    ${x.s.toFixed(1)} | ${x.c.duration}s | ${(x.c.title || '').slice(0, 70)}`);

    let done = false;
    for (const x of scored.slice(0, 4)) {
      const vid = x.c.id;
      const outBase = path.join(OUT, `yt_${r.id}_${vid}`);
      try {
        download(`https://www.youtube.com/watch?v=${vid}`, outBase);
        const file = `${outBase}.mp4`;
        if (!fs.existsSync(file) || !isMp4(file)) { console.log(`    ✗ ${vid} 魔数校验失败`); continue; }
        const size = fs.statSync(file).size;
        if (size < 20000) { console.log(`    ✗ ${vid} 文件过小 ${size}`); continue; }
        // 目标文件名: 自己图片名 1101→1201, 去 _small
        const target = r.image_name.replace(/1101/, '1201').replace(/_small\.png$/, '.mp4');
        manifest.push({
          id: r.id, name: r.name, nameZh: r.name_zh, equipmentId: r.equipment_id,
          query, youtubeId: vid, title: x.c.title, channel: x.c.channel || x.c.uploader || '',
          duration: x.c.duration, views: x.c.view_count, score: Number(x.s.toFixed(1)),
          localFile: file, size, targetFileName: target, imageName: r.image_name,
        });
        console.log(`    ✓ 选中 ${vid} (${x.s.toFixed(1)}分) → ${target}`);
        done = true;
        break;
      } catch (e) {
        console.log(`    ✗ ${vid} 下载失败: ${String(e.message).slice(0, 140)}`);
      }
    }
    if (!done) console.log('  全部候选下载失败');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log(`\n完成 ${manifest.length}/${IDS.length}  → ${manifestPath}`);
})().catch((e) => { console.error(e); process.exit(1); });
