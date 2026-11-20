/**
 * 生成训练分享「海报」的排版预览 (自包含 HTML, 浏览器直接打开)
 *
 * 为什么要有它:
 *   海报是 canvas 2d 手绘的, 小程序里没法截图回归 —— 改一版排版就得
 *   重新编译上真机, 太慢。这里用 **真实的 utils/poster.js 排版代码**
 *   跑一遍, 把绘制指令转成 SVG 渲染到 HTML, 浏览器里看到的就是海报长什么样。
 *
 *   ⚠️ 唯一偏差: 字体宽度是估算的(CJK 按 1em, 拉丁按 0.55em),
 *      真机是系统字体。所以「文本被截断成省略号」的时机可能差一两个字,
 *      位置/尺寸/颜色是准的。
 *
 * 用法: node tools/preview-poster.js
 * 输出: docs/preview/poster.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/preview/poster.html');
const poster = require(path.join(ROOT, 'miniprogram/utils/poster.js'));

const IMG_PREFIX = 'https://gfit.l2ee.top';
const AVATAR = 'https://gfit.l2ee.top/avatars/1788094426314-fb5gog.png';
const QR = path.join(__dirname, '..', 'docs/preview/poster-qr.jpg');

const T = {
  DURATION: '时长', EXERCISES: '动作', CAL_UNIT: '卡路里',
  SET: '组', SETS: '组', REPS: '次数', KM: '公里',
  DURATION_UNIT: '秒', CAL_UNIT_SHORT: '大卡',
  SHARE_BY: '来自', SHARE_TRAINING: '分享的训练',
};

/** 真实 session 373(小李 · 47:11 · 728 大卡)的数据, 按动作分组 */
const RAW = [
  ['胸部推举', 'Lever Chest Press ', '22771101-Lever-Chest-Press-(VERSION-4)_Chest_small.png', 3516, [[70, 8], [70, 8], [70, 10], [70, 10]], 100],
  ['上斜哑铃卧推', 'Dumbbell Incline Bench Press', '03141101-Dumbbell-Incline-Bench-Press_Chest-FIX_small.png', 1765, [[20, 8], [20, 6]], 29],
  ['站立飞鸟', 'Standing Fly', '02271101-Cable-Standing-Fly_Chest_small.png', 100, [[35, 10], [35, 10], [35, 10], [40, 10]], 200],
  ['杠杆仰卧胸推', 'Lever Lying Chest Press', '10411101-Lever-Lying-Chest-Press-(plate-loaded)_Chest_small.png', 286, [[40, 10], [40, 10], [40, 10], [50, 5]], 133],
  ['哑铃卧推', 'Dumbbell Bench Press', '02891101-Dumbbell-Bench-Press_Chest-FIX_small.png', 117, [[20, 10], [20, 12]], 45],
];

function buildModel() {
  return {
    ownerName: '小李',
    ownerLabel: '来自 分享的训练',
    dateText: '2026-11-19 12:20',
    durationText: '47:11',
    exerciseCount: 5,
    calories: 728,
    groups: RAW.map(([nameZh, nameEn, img, id, sets, cal]) => ({
      key: String(id),
      name: nameZh,
      sub: sets.length + ' ' + (sets.length === 1 ? T.SET : T.SETS) + ' · 次数',
      calories: cal + ' ' + T.CAL_UNIT_SHORT,
      sets: sets.map(([w, r], i) => ({
        num: i + 1,
        text: w + ' kg × ' + r + ' ' + T.REPS,
      })),
      image: `${IMG_PREFIX}/exer_images/${img}`,
    })),
    moreTemplate: '等 {n} 个动作',
    footerHint: '扫码查看完整训练',
    t: T,
  };
}

// ── 字体宽度估算(canvas 的 measureText 在 node 里没有, 只能估) ──
const CJK = /[⺀-鿿＀-￯]/;
function measure(text, size) {
  let w = 0;
  for (const ch of String(text)) w += CJK.test(ch) ? size : size * 0.55;
  return w;
}
function parseFont(font) {
  const m = /(\d+)px/.exec(font || '');
  const size = m ? +m[1] : 10;
  return { size, weight: /bold/.test(font || '') ? 'bold' : 'normal' };
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 假 canvas 2d 上下文 —— 把绘制指令记成 SVG
 *
 * 只实现 poster.js 用到的那几个方法, 画法一一对应, 所以预览走的是
 * **真实的绘制代码**, 不是另写一遍排版。
 */
function svgCtx(out) {
  const st = { fill: '#000', stroke: '#000', lw: 1, font: '10px sans-serif', align: 'left', clip: null };
  const stack = [];
  let path = [];
  let cur = { x: 0, y: 0 };
  let clipSeq = 0;

  const d = () => path.join(' ');
  function pushPt(p) { path.push(`${p.cmd}${p.x} ${p.y}`); cur = { x: p.x, y: p.y }; }

  return {
    set fillStyle(v) { st.fill = v; }, get fillStyle() { return st.fill; },
    set strokeStyle(v) { st.stroke = v; }, get strokeStyle() { return st.stroke; },
    set lineWidth(v) { st.lw = v; }, get lineWidth() { return st.lw; },
    set font(v) { st.font = v; }, get font() { return st.font; },
    set textAlign(v) { st.align = v; }, get textAlign() { return st.align; },
    textBaseline: 'alphabetic',
    measureText(t) { return { width: measure(t, parseFont(st.font).size) }; },
    beginPath() { path = []; cur = { x: 0, y: 0 }; },
    moveTo(x, y) { pushPt({ cmd: 'M', x, y }); },
    lineTo(x, y) { pushPt({ cmd: 'L', x, y }); },
    arcTo(x1, y1, x2, y2, r) {
      // 真正的圆角: 从当前点沿角点方向退 r, 再沿出边方向退 r, 画圆弧
      const d1 = Math.hypot(cur.x - x1, cur.y - y1) || 1;
      const d2 = Math.hypot(x2 - x1, y2 - y1) || 1;
      const rr = Math.min(r, d1 / 2, d2 / 2);
      const a = { x: x1 + (cur.x - x1) * (rr / d1), y: y1 + (cur.y - y1) * (rr / d1) };
      const b = { x: x1 + (x2 - x1) * (rr / d2), y: y1 + (y2 - y1) * (rr / d2) };
      path.push(`L${a.x} ${a.y}`);
      path.push(`A${rr} ${rr} 0 0 1 ${b.x} ${b.y}`);
      cur = b;
    },
    arc(cx, cy, r) { path.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`); cur = { x: cx, y: cy }; },
    closePath() { path.push('Z'); },
    fill() { out.body.push(`<path d="${d()}" fill="${st.fill}"/>`); },
    stroke() { out.body.push(`<path d="${d()}" fill="none" stroke="${st.stroke}" stroke-width="${st.lw}"/>`); },
    clip() {
      const id = `c${++clipSeq}`;
      out.defs.push(`<clipPath id="${id}"><path d="${d()}"/></clipPath>`);
      st.clip = id;
    },
    save() { stack.push({ ...st }); },
    restore() { const s = stack.pop(); if (s) Object.assign(st, s); },
    scale() {},
    fillRect(x, y, w, h) { out.body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${st.fill}"/>`); },
    fillText(t, x, y) {
      const { size, weight } = parseFont(st.font);
      const anchor = st.align === 'center' ? 'middle' : st.align === 'right' ? 'end' : 'start';
      const clip = st.clip ? ` clip-path="url(#${st.clip})"` : '';
      out.body.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${st.fill}" text-anchor="${anchor}"${clip}>${esc(t)}</text>`);
    },
    drawImage(img, x, y, w, h) {
      const clip = st.clip ? ` clip-path="url(#${st.clip})"` : '';
      out.body.push(`<image href="${img.href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${clip}/>`);
    },
  };
}

function render() {
  const model = buildModel();
  // 跟小程序里走同一套规划(排版 + 倍率 + 像素尺寸)
  const plan = poster.planPoster(model);
  const layout = plan.layout;

  const assets = { avatar: { href: AVATAR }, qrcode: null, thumbs: {} };
  model.groups.forEach((g) => { assets.thumbs[g.key] = { href: g.image }; });
  if (fs.existsSync(QR)) assets.qrcode = { href: path.basename(QR) };

  const out = { body: [], defs: [] };
  poster.paint(svgCtx(out), layout, assets);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${poster.DESIGN_W}" height="${layout.height}" viewBox="0 0 ${poster.DESIGN_W} ${layout.height}" style="font-family:'PingFang SC','Helvetica Neue',sans-serif">`
    + (out.defs.length ? `<defs>${out.defs.join('')}</defs>` : '')
    + out.body.join('')
    + '</svg>';

  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>训练分享海报 · 排版预览</title>
<style>
  body { margin:0; background:#0a0a0a; color:#8a8a8a;
         font:13px/1.6 -apple-system,'PingFang SC',sans-serif; padding:28px; }
  h1 { font-size:15px; color:#f2f2f2; margin:0 0 6px; }
  p { margin:0 0 20px; }
  .frame { width:${poster.DESIGN_W * 2}px; margin:0 auto; }
  .frame > div { transform:scale(2); transform-origin:top left; }
  .frame img { display:block; }
</style></head>
<body>
  <h1>训练分享海报 · 排版预览</h1>
  <p>真实 utils/poster.js 排版结果, 2 倍放大显示(实际导出 ${plan.pxW}×${plan.pxH}px, 渲染倍率 ${plan.scale}x)。字体宽度是估算的, 省略号截断时机可能差一两个字。</p>
  <div class="frame"><div>${svg}</div></div>
</body></html>`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  console.log('poster height =', plan.cssH, 'css px  scale =', plan.scale + 'x  ->', plan.pxW + 'x' + plan.pxH, 'px');
  console.log('written:', path.relative(ROOT, OUT));
}

render();
