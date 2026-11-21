#!/usr/bin/env node
/**
 * 指定时间点采样: node gfit_yt_at.js <前缀> <文件> <t1,t2,t3,...>
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const W = 300, H = 169;

const prefix = process.argv[2];
const file = process.argv[3];
const times = process.argv[4].split(',').map(Number);

for (const f of fs.readdirSync(OUT)) if (new RegExp(`^${prefix}_\\d+\\.png$`).test(f)) fs.unlinkSync(path.join(OUT, f));

const cells = [];
times.forEach((t, i) => {
  const out = path.join(OUT, `${prefix}_${String(i).padStart(2, '0')}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, out]);
  cells.push(out);
});
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, `${prefix}_%02d.png`),
  '-vf', `tile=${cells.length}x1:padding=4:color=0x101319`, '-frames:v', '1', '-update', '1',
  path.join(OUT, `${prefix}.png`)], { stdio: 'inherit' });
console.log(`${prefix}.png 已生成  时间点: ${times.join('s, ')}s`);
