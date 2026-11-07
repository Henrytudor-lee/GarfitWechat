/**
 * 生成分享页「动作详情弹层」的排版预览 (自包含 HTML, 浏览器直接打开)
 *
 * 为什么要有它:
 *   小程序样式没法用普通方式截图回归, 组列表这种「一行几条」的排版改动
 *   靠肉眼在真机上试太慢。这里把**真实的 index.wxss** 内联进 HTML,
 *   配上 mock DOM, 浏览器里看到的就是真机排版。
 *
 * ⚠️ 唯一偏差: wxss 里的 rpx 在小程序里按屏幕宽换算(750rpx = 屏宽),
 *    HTML 里无法知道屏宽, 这里按 375px 宽折算(1rpx = 0.5px)。
 *    所以在 375px 宽的浏览器窗口里看 = 1:1 还原。
 *
 * 用法: node tools/preview-share-sheet.js
 * 输出: docs/preview/share-sheet-2col.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WXSS = path.join(ROOT, 'miniprogram/pages/share/index.wxss');
const OUT = path.join(ROOT, 'docs/preview/share-sheet-2col.html');

/** rpx → px(375 基准) */
const rpx2px = (css) => css.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => `${parseFloat(n) * 0.5}px`);

const CASES = [
  {
    label: 'A · 奇数 3 条',
    note: '首行 2 条, 最后一条独占整行(不留半格空白)',
    sets: [
      { id: 1, weight: 20, weightUnit: 'kg', reps: 12 },
      { id: 2, weight: 20, weightUnit: 'kg', reps: 12 },
      { id: 3, weight: 20, weightUnit: 'kg', reps: 12 },
    ],
  },
  {
    label: 'B · 偶数 4 条',
    note: '标准 2 × 2',
    sets: [
      { id: 1, weight: 20, weightUnit: 'kg', reps: 12 },
      { id: 2, weight: 25, weightUnit: 'kg', reps: 10 },
      { id: 3, weight: 25, weightUnit: 'kg', reps: 8 },
      { id: 4, weight: 20, weightUnit: 'kg', reps: 6 },
    ],
  },
  {
    label: 'C · 只有 1 条',
    note: '单条独占整行',
    sets: [{ id: 1, weight: 20, weightUnit: 'kg', reps: 12 }],
  },
  {
    label: 'D · 长内容(距离 + 时长 + 负重)',
    note: '最长的一组文案, 验证不会横向溢出',
    sets: [
      { id: 1, distanceKm: 5.2, durationSec: 3600, weight: 12, weightUnit: 'kg' },
      { id: 2, durationSec: 90, weight: 12, weightUnit: 'kg' },
    ],
  },
];

const T = { SETS: '组', KM: '公里', DURATION_UNIT: '秒', REPS: '次数' };

/** 按 WXML 的 wx:if / wx:elif / wx:else 三分支复刻组内容 */
function setBody(s) {
  if (s.distanceKm > 0) {
    return (
      `<text>${s.distanceKm} ${T.KM}</text>` +
      (s.durationSec > 0 ? `<text> · ${s.durationSec} ${T.DURATION_UNIT}</text>` : '') +
      (s.weight > 0 ? `<text> · ${s.weight} ${s.weightUnit || 'kg'}</text>` : '')
    );
  }
  if (s.durationSec > 0) {
    return (
      `<text>${s.durationSec} ${T.DURATION_UNIT}</text>` +
      (s.weight > 0 ? `<text> · ${s.weight} ${s.weightUnit || 'kg'}</text>` : '')
    );
  }
  return `<text>${s.weight} ${s.weightUnit || 'kg'} × ${s.reps} ${T.REPS}</text>`;
}

function setRow(s, i, total) {
  const wide = i === total - 1 && total % 2 === 1 ? ' wide' : '';
  return `<view class="sheet-set-row${wide}">
      <text class="sheet-set-num">${i + 1}</text>
      <view class="sheet-set-text">${setBody(s)}</view>
    </view>`;
}

function sheet(c) {
  const rows = c.sets.map((s, i) => setRow(s, i, c.sets.length)).join('\n');
  return `<section class="case">
    <h3>${c.label} <em>${c.note}</em></h3>
    <view class="sheet">
      <view class="sheet-body">
        <view class="sheet-title">PVC过顶深蹲</view>
        <view class="sheet-en">PVC Overhead Squat</view>
        <view class="sheet-tags">
          <text class="chip chip-neutral">自重</text><text class="chip">股四头肌</text>
          <text class="chip">大腿</text><text class="chip chip-neutral">次数</text>
        </view>
        <view class="sheet-sets">
          <view class="sheet-sets-title">${T.SETS}</view>
          <view class="sheet-sets-grid">
${rows}
          </view>
        </view>
      </view>
    </view>
  </section>`;
}

const css = fs.readFileSync(WXSS, 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>分享页 · 动作详情弹层 · 组列表排版预览</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0d0d0d; color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  }
  /* 小程序语义: view = block, text = inline */
  view { display: block; }
  text { display: inline; }
  .page { max-width: 375px; margin: 0 auto; padding: 16px 0 40px; }
  .page-head { padding: 0 16px 18px; border-bottom: 1px solid rgba(255,255,255,.08); margin-bottom: 8px; }
  .page-head h1 { font-size: 15px; margin: 0 0 6px; color: #f2f2f2; }
  .page-head p { font-size: 12px; line-height: 1.7; color: #8a8a8a; margin: 0; }
  .case { margin: 18px 0 0; }
  .case h3 { font-size: 12px; color: #8a8a8a; margin: 0 0 6px 16px; font-weight: 600; }
  .case h3 em { font-style: normal; color: #666; margin-left: 6px; }
  .sheet {
    width: 100%; background: #1a1a1a; border-radius: 16px 16px 0 0;
    overflow: hidden; display: flex; flex-direction: column;
  }
  .sheet-scroll { flex: 1; min-height: 0; }
  /* ── 以下为 miniprogram/pages/share/index.wxss 的真实内容 (rpx 已按 375 折算) ── */
${rpx2px(css)}
</style>
</head>
<body>
<div class="page">
  <div class="page-head">
    <h1>分享页 · 动作详情弹层 · 组列表排版预览</h1>
    <p>
      组列表改为<b>一行两条</b>; 奇数条时最后一条独占整行, 不留半格空白。<br>
      样式直接内联自 <code>miniprogram/pages/share/index.wxss</code>(真实文件, 非手抄)。<br>
      ⚠️ rpx 按 375px 宽折算 → 请用 375px 宽的窗口看, 1:1 还原真机。<br>
      本页是<b>快照</b>: 改完 wxss 后跑 <code>node tools/preview-share-sheet.js</code> 重新生成。
    </p>
  </div>
${CASES.map(sheet).join('\n')}
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✅ 预览已生成 → ${OUT}`);
