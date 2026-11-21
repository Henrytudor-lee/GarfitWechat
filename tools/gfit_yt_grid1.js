#!/usr/bin/env node
/** 单帧对比图 (tile 滤镜): node gfit_yt_grid1.js <每行几个> <文件...> */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const W = 300, H = 300;

const perRow = Number(process.argv[2] || 6);
const files = process.argv.slice(3).filter((f) => fs.existsSync(f));

// 清掉旧帧
for (const f of fs.readdirSync(OUT)) if (/^g1_\d+\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));

files.forEach((f, i) => {
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
  const t = Math.max(0.5, +(dur * 0.5).toFixed(2));
  const out = path.join(OUT, `g1_${String(i).padStart(2, '0')}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', f, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, out]);
});

const rows = Math.ceil(files.length / perRow);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, 'g1_%02d.png'),
  '-vf', `tile=${perRow}x${rows}:padding=6:color=0x101319`, '-frames:v', '1', '-update', '1',
  path.join(OUT, 'grid1.png')], { stdio: 'inherit' });
console.log('grid1.png 已生成  (' + rows + ' 行 × ' + perRow + ' 列)');
files.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));
