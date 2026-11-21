const path = require('path');
const fs = require('fs');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const EQUIP = { 1: '杠铃', 2: '自重', 3: '钢索', 4: '哑铃', 5: 'EZ杠', 6: '器械', 7: '雪橇机', 8: '史密斯', 9: '负重', 10: '辅助', 11: '弹力带', 12: '战绳', 13: 'Bosu球', 14: '锤式', 15: '壶铃', 16: '药球', 17: '奥杠', 18: '动力雪橇', 19: '阻力带', 20: '滚轮', 21: '滚球', 22: '绳索', 23: '稳定球', 24: '短棍', 25: '悬吊', 26: 'Trap bar', 27: '震动板', 28: '轮滑滚筒' };
const PART = { 1: '大腿', 2: '胸部', 3: '髋部', 4: '背部', 5: '上臂', 6: '肩膀', 7: '前臂', 8: '小腿', 9: '颈部', 10: '有氧', 11: '身体图示', 12: '腰部', 13: '爆发/功能', 14: '杠铃力量', 15: '瑜伽姿势', 16: '瑜伽/静态', 17: '肱二头肌', 18: '肱三头肌', 19: '股四头肌', 20: '腘绳肌' };
const eqs = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => EQUIP[x] || x).join('+');
const pts = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => PART[x] || x).join('+');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await c.query(s))[0];
  const isNullish = (v) => v === null || v === undefined || v === '' || v === 'NULL';

  const rows = await q('SELECT id,name,name_zh,image_name,video_name,equipment_id,body_part_id,is_favorite FROM exercises_library ORDER BY id');
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const cand = JSON.parse(fs.readFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_dup_candidates_20261113.json', 'utf8'));

  // ① 候选 vs 守护者 图片是否同一文件
  let sameImg = 0, diffImg = 0;
  const diffSamples = [];
  for (const r of cand.rows.filter((x) => !x.blocked.length)) {
    const a = byId.get(r.candidateId), b = byId.get(r.keeperId);
    if (!a || !b) continue;
    if (a.image_name && a.image_name === b.image_name) sameImg++;
    else { diffImg++; if (diffSamples.length < 10) diffSamples.push({ c: a, k: b }); }
  }
  console.log(`① 候选与守护者 图片同一文件: ${sameImg}   图片不同(删掉会少一份图): ${diffImg}`);
  for (const s of diffSamples) {
    console.log(`   ${s.c.id} ${s.c.name} [${s.c.image_name || '无图'}]  vs  ${s.k.id} [${s.k.image_name || '无图'}]`);
  }

  // ② 阻塞原因分布
  const reasonCount = {};
  for (const r of cand.rows.filter((x) => x.blocked.length)) {
    for (const b of r.blocked) {
      const key = b.replace(/\(.*\)/, '(…)');
      reasonCount[key] = (reasonCount[key] || 0) + 1;
    }
  }
  console.log('\n② 需人工判断的 48 条, 阻塞原因分布:');
  for (const [k, v] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) console.log(`   ${v}  ${k}`);

  // ③ 同名组里「全部无视频」的重复组
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'with', 'and', 'or']);
  const tok = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const sing = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  const tight = (s) => { const t = tok(s).filter((w) => !STOP.has(w)); return (t.length ? t : tok(s)).map(sing).join(''); };
  const g = new Map();
  for (const r of rows) { const k = tight(r.name); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  let allNoVideoGroups = 0, allNoVideoRows = 0, allNoVideoExtra = 0;
  const samples = [];
  for (const arr of g.values()) {
    if (arr.length < 2) continue;
    if (arr.every((x) => isNullish(x.video_name))) {
      allNoVideoGroups++;
      allNoVideoRows += arr.length;
      allNoVideoExtra += arr.length - 1;   // 每组保留 1 条
      if (samples.length < 8) samples.push(arr.map((x) => `${x.id}:${x.name}`));
    }
  }
  console.log(`\n③ 同名组里「一条视频都没有」的纯重复: ${allNoVideoGroups} 组, 共 ${allNoVideoRows} 行, 每组留 1 条可省 ${allNoVideoExtra} 行`);
  for (const s of samples) console.log('   ', s.join(' | '));

  // ④ 全库统计：还有多少缺视频行完全没有任何同义兄弟
  const inGroup = new Set();
  for (const arr of g.values()) if (arr.length > 1) for (const x of arr) inGroup.add(Number(x.id));
  const noVideo = rows.filter((r) => isNullish(r.video_name));
  const lonely = noVideo.filter((r) => !inGroup.has(Number(r.id)));
  console.log(`\n④ 缺视频 ${noVideo.length} 行中, 完全没有任何同名/近同名兄弟的: ${lonely.length} 行(这批没法靠去重解决)`);
  console.log(`   缺视频行里处在某个同名组内的: ${noVideo.length - lonely.length}`);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
