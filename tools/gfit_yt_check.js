const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const pick = (process.argv[2] || '2,4,9,10').split(',').map(Number);
const pcts = [0.15, 0.35, 0.6, 0.85];

const files = [];
for (const n of pick) {
  const x = manifest[n - 1];
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', x.localFile], { encoding: 'utf8' }).trim());
  for (const pct of pcts) {
    const t = Math.max(0.5, +(dur * pct).toFixed(2));
    const out = path.join(OUT, `chk_${n}_${Math.round(pct * 100)}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', x.localFile, '-frames:v', '1',
      '-vf', 'scale=360:202:force_original_aspect_ratio=decrease,pad=360:202:(ow-iw)/2:(oh-ih)/2', out]);
    files.push(out);
  }
}
const args = [];
files.forEach((f) => args.push('-i', f));
const rows = [];
for (let i = 0; i < files.length; i += pcts.length) {
  const idx = files.slice(i, i + pcts.length).map((_, k) => `[${i + k}:v]`).join('');
  rows.push(`${idx}hstack=inputs=${pcts.length}:shortest=1[r${i}]`);
}
const chain = `${rows.join(';')};${rows.map((_, i) => `[r${i * pcts.length}]`).join('')}vstack=inputs=${rows.length}[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', chain, '-map', '[out]', '-frames:v', '1', '-update', '1', path.join(OUT, 'check.png')], { stdio: 'inherit' });
console.log('检查表已生成: ' + path.join(OUT, 'check.png'));
console.log('行顺序: ' + pick.map((n) => `#${n} ${manifest[n - 1].name}`).join(' / '));
console.log('每行 4 个时间点: 15% / 35% / 60% / 85%');
