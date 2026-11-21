/**
 * 生成「动作配置 · 历史配置模块」的排版预览 (自包含 HTML, 浏览器直接打开)
 *
 * 为什么要有它:
 *   小程序样式没法用普通方式截图回归, 历史配置这种"日期 + 组 chip"的排版
 *   靠真机试太慢。这里把**真实的 add-exercise-modal/index.wxss** 内联进 HTML,
 *   配上 mock DOM, 浏览器里看到的就是真机排版。
 *
 * ⚠️ 唯一偏差: wxss 里的 rpx 在小程序里按屏幕宽换算(750rpx = 屏宽),
 *    HTML 里无法知道屏宽, 这里按 375px 宽折算(1rpx = 0.5px)。
 *    所以在 375px 宽的浏览器窗口里看 = 1:1 还原。
 *
 * 用法: node tools/preview-exercise-history.js
 * 输出: docs/preview/exercise-history.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WXSS = path.join(ROOT, 'miniprogram/components/add-exercise-modal/index.wxss');
const OUT = path.join(ROOT, 'docs/preview/exercise-history.html');

/** rpx → px(375 基准) */
const rpx2px = (css) => css.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => `${parseFloat(n) * 0.5}px`);

/**
 * mock 数据 —— 照生产库真实分布:
 *   杠杆仰卧胸推 练了 30 天 / 125 组, 单日 4 组, 单日最多 35 组(异常值)
 */
const DAYS = [
  { date: '2026年11月20日', sets: ['50kg × 5', '40kg × 10', '40kg × 10', '40kg × 10'] },
  { date: '2026年11月13日', sets: ['50kg × 10', '50kg × 10', '50kg × 10', '50kg × 10'] },
  { date: '2026年11月7日', sets: ['60kg × 10', '60kg × 8', '60kg × 8', '60kg × 6'] },
  { date: '2026年10月26日', sets: ['40kg × 10', '60kg × 12', '70kg × 8', '70kg × 8'] },
  { date: '2026年10月13日', sets: ['60kg × 10', '60kg × 8', '60kg × 8', '40kg × 10'] },
  { date: '2026年9月20日', sets: ['60kg × 10', '60kg × 10', '60kg × 8', '60kg × 8'] },
];

/** 计时类 / 距离类的组文本长这样 */
const MIXED = [
  { date: '2026年11月18日', sets: ['90秒 · 12kg', '90秒 · 12kg', '60秒 · 10kg'] },
  { date: '2026年11月11日', sets: ['5.2公里 · 90秒 · 12kg', '5公里 · 1800秒'] },
];

function panel(days, opts) {
  const chips = days.map((d) => `        <view class="history-day">
          <view class="history-day-date">${d.date}</view>
          <view class="history-day-sets">
${d.sets.map((s) => `            <view class="history-set-chip">${s}</view>`).join('\n')}
          </view>${d.moreText ? `
          <view class="history-day-more">${d.moreText}</view>` : ''}
        </view>`).join('\n');

  const foot = opts.foot ? `
      <view class="history-panel-foot">${opts.foot}</view>` : '';

  return `      <view class="history-panel">
        <view class="history-panel-title">历史配置</view>
${chips}${foot}
      </view>`;
}

/** 单日组数超上限的样子(封顶 12 组) */
const OVERFLOW = [{
  date: '2026年11月8日',
  sets: Array.from({ length: 12 }, (_, i) => `${40 + i * 5}kg × 10`),
  moreText: '还有 23 组',
}];

const css = fs.readFileSync(WXSS, 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>动作配置 · 历史配置模块 · 排版预览</title>
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
  .case { margin: 20px 0 0; }
  .case > h3 { font-size: 12px; color: #8a8a8a; margin: 0 0 6px 16px; font-weight: 600; }
  /* 模拟弹层外壳: 夜间 / 日间 */
  .modal-mask { position: relative; background: rgba(0,0,0,.85); padding: 8px 0 20px; }
  .modal-mask.theme-day { background: #e9e9e9; }
  .modal-sheet { position: relative; background: #131313; border-radius: 16px 16px 0 0; padding-bottom: 8px; }
  .theme-day .modal-sheet { background: #fff; }
  /* 上面摆一个"动作配置"的头部, 让上下文完整 */
  .fake-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .theme-day .fake-header { border-bottom-color: rgba(0,0,0,.1); }
  .fake-title { font-size: 15px; font-weight: 700; color: #f2f2f2; }
  .theme-day .fake-title { color: #000; }
  .fake-btn { font-size: 13px; color: #999; }
  /* ── 以下为 miniprogram/components/add-exercise-modal/index.wxss 的真实内容 ── */
${rpx2px(css)}

  /* ── 预览专用覆盖(必须放在真样式**之后**才能生效) ──
     真机上 .modal-mask 是 position:fixed; inset:0, .modal-sheet 是
     position:absolute; bottom:0; height:85vh —— 那是"贴在屏幕底部"的弹层。
     HTML 里 5 个 case 用同一套标签, fixed + absolute 会让它们全部叠在一起,
     只剩最后一个可见。这里改成常规流, 好让 5 个 case 依次排下来。 */
  .modal-mask {
    position: relative;
    inset: auto;
    background: rgba(0, 0, 0, 0.85);
    z-index: auto;
  }
  .modal-mask.theme-day { background: #e9e9e9; }
  .modal-sheet { position: relative; height: auto; bottom: auto; }
</style>
</head>
<body>
<div class="page">
  <div class="page-head">
    <h1>动作配置 · 历史配置模块 · 排版预览</h1>
    <p>
      在「动作配置」界面的下方新增: <b>这个动作以前每次练了什么(按日期分组)</b>。<br>
      没练过这个动作 → <b>整个模块不渲染</b>, 不是显示一个空标题。<br>
      <b>点某一组 → 直接填进上面的输入框</b>(重量/次数/时长/距离 + 单位)。<br>
      样式直接内联自 <code>miniprogram/components/add-exercise-modal/index.wxss</code>(真实文件)。<br>
      ⚠️ rpx 按 375px 宽折算 → 请用 375px 宽的窗口看, 1:1 还原真机。
    </p>
  </div>

  <div class="case">
    <h3>A · 夜间主题(默认)</h3>
    <view class="modal-mask theme-night">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
${panel(DAYS, { foot: '共 30 天 · 仅显示最近 10 天' })}
      </view>
    </view>
  </div>

  <div class="case">
    <h3>B · 日间主题</h3>
    <view class="modal-mask theme-day">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
${panel(DAYS, { foot: '共 30 天 · 仅显示最近 10 天' })}
      </view>
    </view>
  </div>

  <div class="case">
    <h3>C · 计时类 / 距离类动作(组文本按数据本身走)</h3>
    <view class="modal-mask theme-night">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
${panel(MIXED, {})}
      </view>
    </view>
  </div>

  <div class="case">
    <h3>D · 单日组数超上限(封顶 12 组, 如实告诉用户还剩多少)</h3>
    <view class="modal-mask theme-night">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
${panel(OVERFLOW, {})}
      </view>
    </view>
  </div>

  <div class="case">
    <h3>E · 没练过这个动作 → 整个模块不渲染(这里只有配置区, 没有历史面板)</h3>
    <view class="modal-mask theme-night">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
        <view class="selected-exercise-card">
          <view class="selected-info">
            <view class="selected-name">杠铃深蹲</view>
          </view>
        </view>
      </view>
    </view>
  </div>
  <div class="case">
    <h3>F · chip 按下时的样子(hover-class 激活态)</h3>
    <view class="modal-mask theme-night">
      <view class="modal-sheet">
        <view class="fake-header"><view class="fake-title">动作配置</view><view class="fake-btn">✕</view></view>
        <view class="history-panel">
          <view class="history-panel-title">历史配置</view>
          <view class="history-day">
            <view class="history-day-date">2026年11月20日</view>
            <view class="history-day-sets">
              <view class="history-set-chip history-set-chip-active">50kg × 5</view>
              <view class="history-set-chip">40kg × 10</view>
              <view class="history-set-chip">40kg × 10</view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </div>
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✅ 预览已生成 → ${OUT}`);
