const path = require('path');
const fs = require('fs');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const EQUIP_WORDS = new Set(['barbell', 'dumbbell', 'cable', 'ez', 'ezbar', 'smith', 'machine', 'lever', 'band', 'kettlebell', 'bodyweight', 'rope', 'battle', 'bosu', 'medicine', 'ab', 'stick', 'suspension', 'trap', 'hammer', 'sled', 'olympic', 'stability', 'swiss', 'roll']);
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'with', 'for', 'at', 'from']);
const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w && !STOP.has(w));
const core = (s) => toks(s).filter((w) => !EQUIP_WORDS.has(w)).join(' ');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const rows = (await conn.query('SELECT id,name,name_zh,equipment_id,body_part_id FROM exercises_library'))[0];
  await conn.end();
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const j = JSON.parse(fs.readFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_new_dup_after_video_2026-11-21.json', 'utf8'));

  const trueDup = [], variant = [];
  for (const x of j.clean) {
    const c = byId.get(x.id), k = byId.get(x.keeperId);
    const ct = toks(c.name), kt = new Set(toks(k.name));
    const extra = ct.filter((w) => !kt.has(w));
    const onlyEquip = extra.every((w) => EQUIP_WORDS.has(w));
    const sameEq = String(c.equipment_id) === String(k.equipment_id);
    const sameBp = String(c.body_part_id) === String(k.body_part_id);
    (onlyEquip && sameEq && sameBp ? trueDup : variant).push({ ...x, extra, sameEq, sameBp });
  }

  console.log(`候选 36 条 → 判定为「真重复(只差器材词, 且器械/部位相同)」: ${trueDup.length} 条`);
  for (const x of trueDup) console.log(`   ${x.id} ${x.name}  →  守护 ${x.keeperId} ${x.keeperName}   [多出的词: ${x.extra.join(',') || '无'}]`);
  console.log(`\n判定为「不同动作(多出的是变体词, 或器械/部位不同)」: ${variant.length} 条`);
  for (const x of variant.slice(0, 20)) console.log(`   ${x.id} ${x.name}  →  ${x.keeperId} ${x.keeperName}   [多出的词: ${x.extra.join(',') || '无'}${x.sameEq ? '' : ', 器械不同'}${x.sameBp ? '' : ', 部位不同'}]`);
  fs.writeFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_new_dup_classified_2026-11-21.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), trueDup, variant }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
