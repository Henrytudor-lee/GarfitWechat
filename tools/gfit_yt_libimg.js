const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const OUT = '/tmp/gfit_yt/20261121';

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const ids = [46, 106, 294, 320, 329, 410, 424, 434, 1471, 1534];
  const ph = ids.map(() => '?').join(',');
  const rows = (await c.query(`SELECT id,name,name_zh,image_name FROM exercises_library WHERE id IN (${ph})`, ids))[0];
  await c.end();

  const lines = [];
  for (const r of rows) {
    const out = path.join(OUT, `lib_${r.id}.png`);
    execFileSync('curl', ['-sL', '--max-time', '25', '-o', out, `https://gfit.l2ee.top/exer_images/${r.image_name}`]);
    const isPng = fs.readFileSync(out).slice(1, 4).toString('latin1') === 'PNG';
    console.log(`${r.id} | ${isPng ? '图OK' : '图失败'} | ${r.image_name}`);
    lines.push(`${r.id}|${r.image_name}`);
  }
  fs.writeFileSync(path.join(OUT, 'real_names.txt'), lines.join('\n'));
  console.log('\n→', path.join(OUT, 'real_names.txt'));
})().catch((e) => { console.error(e); process.exit(1); });
