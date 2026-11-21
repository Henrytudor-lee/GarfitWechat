#!/usr/bin/env node
/**
 * 「补视频 → 产生新重复项」的连锁分析
 *
 * 上次去重时, 某行只有在「同组里存在带视频的兄弟」时才算可删候选。
 * 现在给 10 条补上视频后, 又多了一批「无视频行 vs 带视频行」的新同义对。
 *
 * 这里用比上次更宽的同义判定: 名字 token 去掉器材词后相同 (Barbell/Dumbbell/Cable 等),
 * 再叠加器械/部位/中文名一致性校验。
 */
const path = require('path');
const fs = require('fs');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'ez', 'ezbar', 'ez-bar', 'smith', 'machine', 'lever', 'band', 'resistance', 'kettlebell', 'bodyweight', 'body', 'weight', 'plate', 'loaded', 'rope', 'battle', 'bosu', 'ball', 'medicine', 'ab', 'wheel', 'roll', 'stick', 'suspension', 'trap', 'vibration', 'hammer', 'sled', 'weighted', 'assisted', 'olympic', 'gym', 'stable', 'stability', 'swiss']);
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'with', 'for', 'at', 'from']);
const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w && !STOP.has(w));
const core = (s) => toks(s).filter((w) => !EQUIP_WORDS.has(w)).join(' ');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await c2.query(s))[0];
  const c2 = conn;
  const rows = (await conn.query(
    'SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id,is_favorite FROM exercises_library'))[0];

  const usedEx = new Set((await conn.query('SELECT DISTINCT exercise_id FROM exercises'))[0].map((r) => Number(r.exercise_id)));
  const usedSt = new Set((await conn.query('SELECT DISTINCT exercise_id FROM user_exercise_stats'))[0].map((r) => Number(r.exercise_id)));

  const items = rows.map((r) => ({
    id: Number(r.id), name: r.name, nameZh: r.name_zh || '',
    hasVideo: !(r.video_name === null || r.video_name === undefined || r.video_name === '' || r.video_name === 'NULL'),
    hasImage: !(r.image_name === null || r.image_name === undefined || r.image_name === '' || r.image_name === 'NULL'),
    isFavorite: Number(r.is_favorite || 0) === 1,
    eq: String(r.equipment_id || '').split(',').map((s) => s.trim()).filter(Boolean),
    bp: String(r.body_part_id || '').split(',').map((s) => s.trim()).filter(Boolean),
    used: usedEx.has(Number(r.id)), flagged: usedSt.has(Number(r.id)),
    core: core(r.name),
  }));

  const groups = new Map();
  for (const it of items) {
    if (!it.core) continue;
    if (!groups.has(it.core)) groups.set(it.core, []);
    groups.get(it.core).push(it);
  }

  const intersect = (a, b) => a.some((x) => b.includes(x));
  const zhOverlap = (a, b) => {
    const ca = new Set(String(a).replace(/[^一-鿿]/g, '').split(''));
    return String(b).replace(/[^一-鿿]/g, '').split('').some((ch) => ca.has(ch));
  };

  const clean = [], blocked = [];
  for (const arr of groups.values()) {
    const keepers = arr.filter((x) => x.hasVideo);
    const cands = arr.filter((x) => !x.hasVideo);
    if (!keepers.length || !cands.length) continue;
    for (const c of cands) {
      // 严格口径: 器械/部位必须「相等」(不是相交) —— 相交会把「Resistance Band Full Squat」
      // 和「Full Squat」判成同一个动作, 那是两个动作
      const sameEq = (x) => !c.eq.length || !x.eq.length || (c.eq.length === x.eq.length && c.eq.every((v) => x.eq.includes(v)));
      const sameBp = (x) => !c.bp.length || !x.bp.length || (c.bp.length === x.bp.length && c.bp.every((v) => x.bp.includes(v)));
      const k = keepers.find((x) => sameEq(x) && sameBp(x) && (!c.nameZh || !x.nameZh || zhOverlap(c.nameZh, x.nameZh)));
      if (!k) { blocked.push({ c, why: '同核心名但器械/部位/中文名不兼容' }); continue; }
      const b = [];
      if (c.used) b.push('有训练记录');
      if (c.flagged) b.push('有收藏/练过标记');
      if (c.isFavorite) b.push('精选');
      if (c.hasImage && !k.hasImage) b.push('候选有图但守护者缺图');
      if (c.nameZh && !k.nameZh) b.push('候选有中文名但守护者没有');
      (b.length ? blocked : clean).push({ c, k, why: b.join(' / ') });
    }
  }

  console.log('════ 补视频后的新同义对 ════');
  console.log(`核心名分组(去掉器材词后同名) : ${groups.size}`);
  console.log(`✅ 无视频行, 但已有带视频同义兄弟 : ${clean.length}`);
  console.log(`⚠️ 同核心名但不兼容/有使用     : ${blocked.length}`);
  console.log('\n前 25 条可删:');
  for (const x of clean.slice(0, 25))
    console.log(`  ${String(x.c.id).padEnd(6)} ${x.c.name.padEnd(44)} → 守护 ${String(x.k.id).padEnd(6)} ${x.k.name}`);
  if (clean.length > 25) console.log(`  ... 还有 ${clean.length - 25} 条`);

  const out = path.join('/Volumes/world/program/fitness_wechat/docs', `gfit_new_dup_after_video_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    clean: clean.map((x) => ({ id: x.c.id, name: x.c.name, nameZh: x.c.nameZh, keeperId: x.k.id, keeperName: x.k.name })),
    blocked: blocked.map((x) => ({ id: x.c.id, name: x.c.name, why: x.why })),
  }, null, 2));
  console.log('\n→', out);
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
