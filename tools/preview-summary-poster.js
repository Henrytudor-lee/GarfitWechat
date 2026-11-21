/**
 * 生成训练完成弹框「生成分享海报」的排版预览 (自包含 HTML, 浏览器直接打开)
 *
 * 为什么要有它:
 *   海报是 canvas 2d 手绘的, 小程序里没法截图回归 —— 改一版排版就得
 *   重新编译上真机, 太慢。这里**直接加载组件的真实代码**, 跑一遍
 *   _posterModel() → poster.planPoster() → poster.paint(), 把绘制指令
 *   转成 SVG 渲染到 HTML。
 *
 * ⚠️ 重点价值: 走的是组件**真实的数据流**(snake_case → 驼峰 的字段转换),
 *    所以能提前发现"reps 画成 0"这类字段名对不上的 bug —— 那正是
 *    setText 的坑(它只认 durationSec/distanceKm/weightUnit)。
 *
 * 用法: node tools/preview-summary-poster.js
 * 输出: docs/preview/poster-summary.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/preview/poster-summary.html');
const poster = require(path.join(ROOT, 'miniprogram/utils/poster.js'));
// 复用分享海报预览的 SVG 渲染器(真实绘制代码, 不是另写一遍排版)
const { svgCtx } = require('./preview-poster.js');

const IMG_PREFIX = 'https://gfit.l2ee.top';
const AVATAR = 'https://gfit.l2ee.top/avatars/1788094426314-fb5gog.png';
const QR = path.join(__dirname, '..', 'docs/preview/poster-qr.jpg');

const T = {
  DURATION: '时长', EXERCISES: '动作', CAL_UNIT: '卡路里',
  SET: '组', SETS: '组', REPS: '次数', KM: '公里',
  DURATION_UNIT: '秒', CAL_UNIT_SHORT: '大卡',
  MODE_TIMED: '计时', MODE_DISTANCE: '距离',
  WORKOUT_SUMMARY_LABEL: '本次训练',
};

// ── mock 小程序环境, 把组件真实代码跑起来 ──
let CAPTURED = null;
global.Component = (opts) => { CAPTURED = opts; };
global.getApp = () => ({
  globalData: {
    language: 'zh', theme: 'night', imagePrefix: IMG_PREFIX,
    t: T, userWeight: 60,
  },
  getSharerInfo: () => ({ nickname: '小李', avatarUrl: AVATAR }),
});
global.wx = {
  nextTick: (fn) => fn(),
  getStorageSync: () => '',
  showToast() {}, showModal() {}, showLoading() {}, hideLoading() {},
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
  createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, node() { return this; }, exec() {} }),
};
require(path.join(ROOT, 'miniprogram/components/workout-summary-modal/index.js'));

// 模拟一次刚结束的训练(三种计量方式都带上, 覆盖 setText 的三个分支)
const SESSION_EXERCISES = [
  {
    id: 22771101, name_zh: '胸部推举', name: 'Lever Chest Press',
    image_name: '22771101-Lever-Chest-Press-(VERSION-4)_Chest_small.png',
    countMode: 'weight_reps', totalCalories: 100,
    sets: [
      { weight: 70, weight_unit: 'lb', reps: 8, duration_sec: 0, distance_km: 0 },
      { weight: 70, weight_unit: 'lb', reps: 8, duration_sec: 0, distance_km: 0 },
      { weight: 70, weight_unit: 'lb', reps: 10, duration_sec: 0, distance_km: 0 },
    ],
  },
  {
    id: 33112233, name_zh: '平板支撑', name: 'Plank',
    image_name: '00251101-Barbell-Bench-Press_Chest-FIX_small.png',
    countMode: 'duration', totalCalories: 60,
    sets: [
      { weight: 0, weight_unit: 'kg', reps: 0, duration_sec: 60, distance_sec: 0, distance_km: 0 },
    ],
  },
  {
    id: 44556677, name_zh: '跑步机快走', name: 'Treadmill Walk',
    image_name: '00261101-Barbell-Bench-Squat_Hips_small.png',
    countMode: 'distance_duration', totalCalories: 185,
    sets: [
      { weight: 0, weight_unit: 'kg', reps: 0, duration_sec: 600, distance_km: 3 },
    ],
  },
];

const fakeThis = {
  data: {
    t: T,
    _locale: 'zh',
    _dateStr: '2026-11-21',
    imgPrefix: IMG_PREFIX,
    _stats: { exerciseCount: 3, durationStr: '12分钟', totalCalories: 345 },
    exerciseList: SESSION_EXERCISES,
    _shareToken: 'tk_preview',
  },
  setData() {},
  properties: {},
};
Object.keys(CAPTURED.methods).forEach((k) => { fakeThis[k] = CAPTURED.methods[k]; });

const model = fakeThis._posterModel();

// ── 渲染 ──
const plan = poster.planPoster(model);
const layout = plan.layout;

const assets = { avatar: { href: AVATAR }, qrcode: null, thumbs: {} };
SESSION_EXERCISES.forEach((g) => {
  assets.thumbs[String(g.id)] = { href: `${IMG_PREFIX}/exer_images/${g.image_name}` };
});
if (fs.existsSync(QR)) assets.qrcode = { href: path.basename(QR) };

const out = { body: [], defs: [] };
poster.paint(svgCtx(out), layout, assets);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${poster.DESIGN_W}" height="${layout.height}" viewBox="0 0 ${poster.DESIGN_W} ${layout.height}" style="font-family:'PingFang SC','Helvetica Neue',sans-serif">`
  + (out.defs.length ? `<defs>${out.defs.join('')}</defs>` : '')
  + out.body.join('')
  + '</svg>';

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>训练完成弹框 · 分享海报排版预览</title>
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
  <h1>训练完成弹框 · 分享海报排版预览</h1>
  <p>走组件<b>真实</b>的 _posterModel() 数据流, 导出 ${plan.pxW}×${plan.pxH}px (渲染倍率 ${plan.scale}x)。字体宽度是估算的, 省略号截断时机可能差一两个字。</p>
  <div class="frame"><div>${svg}</div></div>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('poster height =', plan.cssH, 'css px  scale =', plan.scale + 'x  ->', plan.pxW + 'x' + plan.pxH, 'px');
console.log('written:', path.relative(ROOT, OUT));

// 组明细文本也打出来, 方便直接核对字段有没有画错
console.log('\n组明细:');
model.groups.forEach((g) => {
  console.log(`  ${g.name}  [${g.sub}]  ${g.calories}`);
  g.sets.forEach((s) => console.log(`     #${s.num}  ${s.text}`));
});
const bad = model.groups.flatMap((g) => g.sets).filter((s) => /×\s*0\s*reps/.test(s.text));
console.log(bad.length === 0 ? '\n✅ 没有 "× 0 reps" 的坏数据' : '\n❌ 存在坏数据: ' + JSON.stringify(bad));
