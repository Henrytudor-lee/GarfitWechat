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
  const del = JSON.parse(fs.readFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_dup_deletable_20261113.json', 'utf8'));
  const candIds = [...new Set(del.ids)];
  const keepIds = [...new Set(del.rows.map((r) => r.keeperId))];
  const allIds = [...new Set([...candIds, ...keepIds])];
  const ph = allIds.map(() => '?').join(',');
  const rows = (await c.query(
    `SELECT id,name,name_zh,equipment_id,body_part_id,image_name,video_name,is_favorite FROM exercises_library WHERE id IN (${ph})`,
    allIds,
  ))[0];
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  console.log(`清单条数 ${del.count} / 去重后 ${candIds.length} / 查到候选 ${candIds.filter((i) => byId.has(i)).length} / 查到守护 ${keepIds.filter((i) => byId.has(i)).length}`);
  const bad = del.rows.filter((r) => !byId.get(r.id) || !byId.get(r.keeperId));
  console.log('端点缺失的条目数:', bad.length);
  console.log('\n抽查前 12 条:');
  for (const r of del.rows.slice(0, 12)) {
    const cand = byId.get(r.id), keep = byId.get(r.keeperId);
    if (!cand || !keep) { console.log('  ⚠ 缺失:', r); continue; }
    console.log(`  ${cand.id} "${cand.name}" ${cand.nameZh || '(无中文)'} | ${eqs(cand.equipment_id)} | ${pts(cand.body_part_id)} | 图:${cand.image_name ? '有' : '无'} 视频:${cand.video_name ? '有' : '无'}`);
    console.log(`    ↳ 保留 ${keep.id} "${keep.name}" ${keep.nameZh || '(无中文)'} | ${eqs(keep.equipment_id)} | ${pts(keep.body_part_id)} | 图:${keep.image_name ? '有' : '无'} 视频:${keep.video_name ? '有' : '无'}`);
  }
  // 重复 id 检查
  console.log('\n重复 id:', del.ids.length - new Set(del.ids).size);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
