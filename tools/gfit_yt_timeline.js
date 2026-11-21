#!/usr/bin/env node
/**
 * 全时间轴采样: node gfit_yt_timeline.js <每个视频采样帧数> <文件...>
 * → /tmp/gfit_yt/20261121/timeline.png  (每行一个视频, 帧按时间均匀分布)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const W = 240, H = 135;

const per = Number(process.argv[2] || 8);
const files = process.argv.slice(3).filter((f) => fs.existsSync(f));

for (const f of fs.readdirSync(OUT)) if (/^tl_\d+\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));

const cells = [];
let seq = 0;
files.forEach((f, vi) => {
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
  for (let k = 0; k < per; k++) {
    const pct = (k + 0.5) / per;
    const t = Math.max(0.2, +(dur * pct).toFixed(2));
    const out = path.join(OUT, `tl_${String(seq).padStart(3, '0')}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', f, '-frames:v', '1',
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, out]);
    cells.push(out);
    seq++;
  }
  console.log(`  ${path.basename(f)}  ${dur}s`);
});

// tile 必须作用在「一个输入的多帧序列」上, 所以只喂一个序列输入
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, 'tl_%03d.png'),
  '-vf', `tile=${per}x${files.length}:padding=4:color=0x101319`,
  '-frames:v', '1', '-update', '1', path.join(OUT, 'timeline.png')], { stdio: 'inherit' });
console.log('\ntimeline.png 已生成 (' + files.length + ' 行 × ' + per + ' 帧)');
files.forEach((f, i) => console.log(`  行${i + 1}: ${path.basename(f)}`));
