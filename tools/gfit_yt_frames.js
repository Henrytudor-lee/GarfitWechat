const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/gfit_yt/20261121';
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

manifest.forEach((m, i) => {
  const n = i + 1;
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', m.localFile], { encoding: 'utf8' }).trim());
  const t = Math.max(0.5, Math.round(dur * 0.45 * 100) / 100);
  const out = path.join(OUT, `fr_${n}.png`);
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', m.localFile, '-frames:v', '1', '-vf', 'scale=400:225:force_original_aspect_ratio=decrease,pad=400:225:(ow-iw)/2:(oh-ih)/2', out], { stdio: 'inherit' });
    // 关键帧是否真的截到了画面(纯黑帧说明截到了转场/黑场)
    const stat = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    const yavg = (stat.match(/YAVG=([\d.]+)/) || [])[1];
    console.log(`#${n} id=${m.id} t=${t}s/${dur}s 亮度YAVG=${yavg || '?'}  ${m.name}`);
  } catch (e) {
    console.log(`#${n} id=${m.id} 抽帧失败: ${e.message.slice(0, 100)}`);
  }
});

// 拼 5x2 联络表
const N = manifest.length;
const half = Math.ceil(N / 2);
const inputs = manifest.map((m, i) => ['-i', path.join(OUT, `fr_${i + 1}.png`)]);
const row = (from, to) => `${manifest.slice(from, to).map((m, k) => `[${from + k}:v]`).join('')}hstack=inputs=${to - from}:shortest=1`;
const chain = `${row(0, half)}[r1];${row(half, N)}[r2];[r1][r2]vstack=inputs=2[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chain, '-map', '[out]', path.join(OUT, 'contact.png')], { stdio: 'inherit' });
console.log('\n联络表已生成 (前5条 + 后5条各一行)');
