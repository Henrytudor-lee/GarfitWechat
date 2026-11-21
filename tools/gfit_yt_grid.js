#!/usr/bin/env node
/** 用法: node gfit_yt_grid.js <每行几张> <文件1> <文件2> ...  → /tmp/gfit_yt/20261121/grid.png */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const W = 340, H = 191;

const perRow = Number(process.argv[2] || 3);
const files = process.argv.slice(3).filter((f) => fs.existsSync(f));

const cells = [];
files.forEach((f) => {
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
  [0.35, 0.7].forEach((pct) => {
    const t = Math.max(0.5, +(dur * pct).toFixed(2));
    const out = path.join(OUT, `cell_${cells.length}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', f, '-frames:v', '1',
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, out]);
    cells.push({ file: f, png: out });
  });
});

const args = [];
cells.forEach((c) => args.push('-i', c.png));
const rows = [];
for (let i = 0; i < cells.length; i += perRow * 2) {
  const idx = cells.slice(i, i + perRow * 2).map((_, k) => `[${i + k}:v]`).join('');
  rows.push(`${idx}hstack=inputs=${perRow * 2}:shortest=1[r${i}]`);
}
const chain = `${rows.join(';')};${rows.map((_, i) => `[r${i * perRow * 2}]`).join('')}vstack=inputs=${rows.length}[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', chain, '-map', '[out]', '-frames:v', '1', '-update', '1', path.join(OUT, 'grid.png')], { stdio: 'inherit' });

console.log('grid.png 已生成');
console.log('每行 = ' + perRow + ' 个视频, 每个视频 2 帧(35% / 70%)');
files.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));
