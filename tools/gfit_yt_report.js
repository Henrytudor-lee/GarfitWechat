#!/usr/bin/env node
/**
 * 验收报告: 每条动作的「库内原图」 vs 「检索到的视频关键帧」 并排, 供人工判断检索质量
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOCS = '/Volumes/world/program/fitness_wechat/docs';
const LOCAL = '/tmp/gfit_yt/20261121';
const OUT = path.join(DOCS, `gfit_youtube_sample_report_${new Date().toISOString().slice(0, 10)}.html`);

const applied = JSON.parse(fs.readFileSync(
  fs.readdirSync(DOCS).filter((f) => f.startsWith('gfit_youtube_video_applied_')).sort().pop().replace(/^/, DOCS + '/'), 'utf8'));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 每条抽 2 帧
const frames = applied.items.map((it, i) => {
  const src = path.join(LOCAL, it.id === 46 ? 'rf_46_wiq7946sfpQ.mp4'
    : it.id === 320 ? 'rf_320_Kxt_5D2Rpgg.mp4'
    : it.id === 410 ? 'rf_410_4tqc6FQSHn8.mp4'
    : it.id === 1471 ? 'rf_1471_Lx5ykCjizpk.mp4'
    : `yt_${it.id}_${it.youtubeId}.mp4`);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim());
  const outs = [];
  [0.3, 0.65].forEach((pct, k) => {
    const t = Math.max(0.5, +(dur * pct).toFixed(2));
    const o = path.join(LOCAL, `rep_${i}_${k}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1',
      '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2', o]);
    outs.push(o);
  });
  const img = path.join(LOCAL, `lib_${it.id}.png`);
  const img64 = fs.existsSync(img) ? fs.readFileSync(img).toString('base64') : '';
  return { it, outs, img64, dur };
});

const cards = frames.map((f, i) => `
<div class="card">
  <div class="hd">
    <span class="num">${i + 1}</span>
    <div>
      <div class="nm">${esc(f.it.name)} <span class="zh">${esc(f.it.nameZh || '')}</span></div>
      <div class="sub">库 id ${f.it.id} · ${f.dur}s · ${(f.it.size / 1048576).toFixed(1)}MB · <a href="https://www.youtube.com/watch?v=${f.it.youtubeId}" target="_blank">${esc(f.it.title)}</a></div>
    </div>
  </div>
  <div class="row">
    <div class="cell"><img src="data:image/png;base64,${f.img64}"><div class="cap">库内原图（基准）</div></div>
    <div class="cell"><img src="${f.outs[0]}"><div class="cap">视频 30% 处</div></div>
    <div class="cell"><img src="${f.outs[1]}"><div class="cap">视频 65% 处</div></div>
  </div>
  <div class="fn">${esc(f.it.file)}</div>
</div>`).join('\n');

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>GFit YouTube 检索补视频 · 10 条验收</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--line:#262b36;--fg:#e8eaf0;--dim:#9aa3b2;--ok:#3fb950;--acc:#58a6ff}
*{box-sizing:border-box}body{margin:0;padding:28px;background:var(--bg);color:var(--fg);
font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--dim);font-size:13px;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.hd{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
.num{flex:0 0 26px;height:26px;border-radius:50%;background:var(--acc);color:#0b1020;font-weight:700;
display:flex;align-items:center;justify-content:center;font-size:13px}
.nm{font-weight:600;font-size:15px}.zh{color:var(--dim);font-weight:400;font-size:13px}
.sub2,.sub{font-size:12px;color:var(--dim)}
.row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.cell{background:#0c0e12;border-radius:8px;overflow:hidden}
.cell img{width:100%;display:block;aspect-ratio:16/9;object-fit:contain;background:#000}
.cell img:first-child{aspect-ratio:1/1;object-fit:contain;background:#fff}
.cap{font-size:11px;color:var(--dim);text-align:center;padding:4px 0}
.fn{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6b7482;margin-top:8px;word-break:break-all}
a{color:var(--acc)}
</style></head><body>
<h1>GFit · 从 YouTube 检索补视频 · 10 条验收</h1>
<div class="sub">生成时间 ${new Date().toLocaleString('zh-CN')} · 左列=库内原图（判定基准），右两列=检索到的视频关键帧</div>
<div class="grid">${cards}</div>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log('报告已写:', OUT);
console.log('帧图在:', LOCAL + '/rep_*.png  (HTML 引用同目录相对路径, 需一起拷贝)');
