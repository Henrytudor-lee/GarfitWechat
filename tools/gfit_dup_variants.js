const path = require('path');
const fs = require('fs');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const q = async (s) => (await c.query(s))[0];
  const rows = await q('SELECT id,name,image_name,video_name FROM exercises_library');
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const del = JSON.parse(fs.readFileSync('/Volumes/world/program/fitness_wechat/docs/gfit_dup_deletable_20261113.json', 'utf8'));

  let female = 0, version = 0, other = 0;
  const otherSamples = [];
  let grpMatch = 0, grpDiff = 0;
  const grpSamples = [];
  for (const r of del.rows) {
    const a = byId.get(r.id), b = byId.get(r.keeperId);
    if (!a || !b) continue;
    const img = String(a.image_name || '');
    if (/female/i.test(img)) female++;
    else if (/version|\-ii\b|_ii_/i.test(img)) version++;
    else { other++; if (otherSamples.length < 10) otherSamples.push(`${a.id} ${img}`); }

    // 组号: 图片名前 4 位 vs 视频名前 4 位
    const gi = (img.match(/^(\d{4})/) || [])[1];
    const gv = (String(b.video_name || '').match(/^(\d{4})/) || [])[1];
    if (gi && gv && gi === gv) grpMatch++;
    else { grpDiff++; if (grpSamples.length < 6) grpSamples.push(`候选图组号 ${gi} / 兄弟视频组号 ${gv}  (${a.id} vs ${b.id})`); }
  }
  console.log(`候选图片名里的变体标记:  (female) ${female} 条 / VERSION-II 类 ${version} 条 / 其他 ${other} 条`);
  for (const s of otherSamples) console.log('   其他:', s);

  console.log(`\n组号一致性(图片4位组号 vs 兄弟视频4位组号): 相同 ${grpMatch} / 不同 ${grpDiff}`);
  for (const s of grpSamples) console.log('   ', s);

  // 借用视频后, 候选行的 video_name 与自己 image_name 组号是否一致
  console.log(`\n若把兄弟的 video_name 直接写到候选行: 资产组号会不匹配(与库内"图/视频同组号"的不变量冲突)`);

  // 文件是否存在: 兄弟的 video_name 在生产机磁盘上是否存在? 由磁盘检查另做, 这里只列文件名
  console.log('\n借用方案样例(前 5 条):');
  for (const r of del.rows.slice(0, 5)) {
    const a = byId.get(r.id), b = byId.get(r.keeperId);
    console.log(`   ${a.id} ${a.name}`);
    console.log(`      图: ${a.image_name}`);
    console.log(`      → 借 ${b.id} 的视频: ${b.video_name}`);
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
