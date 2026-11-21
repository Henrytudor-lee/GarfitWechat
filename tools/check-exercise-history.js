/**
 * 校验「动作历史配置」模块
 *
 * 覆盖三层:
 *   1) 纯函数层: utils/exercise-history.js 的日期/组文本/分组结果
 *   2) 结构层: WXML 是否"没历史就不渲染" + wx:if/wx:elif/wx:else 配对是否正确
 *   3) 接线层: JS 是否调了 exercise.getHistory / 切换动作时是否重置 / i18n 词条是否齐
 *
 * ⚠️ 为什么要写这个脚本:
 *   这个模块的核心要求是「用户历史没训练过这个动作 → **整个模块不显示**」。
 *   这类"空态要藏起来"的逻辑, 一旦 wx:if 写错就会变成
 *   "没历史也显示一个空的历史配置标题", 肉眼看截图不一定立刻发现。
 *   还有日期格式化 —— 用 `new Date('2026-10-02')` 会被解析成 UTC 零点,
 *   在 UTC-8 的机器上日期整体前移一天, 必须在纯函数层锁死。
 *
 * 用法: node tools/check-exercise-history.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');

let pass = 0;
let fail = 0;
const ck = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? '  ' + extra : ''}`); }
};

const hist = require(path.join(MINI, 'utils/exercise-history.js'));
const zh = require(path.join(MINI, 'locales/zh.js'));
const en = require(path.join(MINI, 'locales/en.js'));
const wxml = fs.readFileSync(path.join(MINI, 'components/add-exercise-modal/index.wxml'), 'utf8');
const wjs = fs.readFileSync(path.join(MINI, 'components/add-exercise-modal/index.js'), 'utf8');

const T = { DURATION_UNIT: '秒', KM: '公里', REPS: '次' };

console.log('\n════ 1) 日期格式化(不经过 Date, 不受时区影响) ════');
ck('中文 → 2026年10月2日', hist.formatHistoryDate('2026-10-02', true) === '2026年10月2日',
  hist.formatHistoryDate('2026-10-02', true));
ck('英文 → Oct 2, 2026', hist.formatHistoryDate('2026-10-02', false) === 'Oct 2, 2026',
  hist.formatHistoryDate('2026-10-02', false));
ck('个位月不补零(2026年1月5日)', hist.formatHistoryDate('2026-01-05', true) === '2026年1月5日',
  hist.formatHistoryDate('2026-01-05', true));
ck('12月 → 12月', hist.formatHistoryDate('2026-12-31', true) === '2026年12月31日',
  hist.formatHistoryDate('2026-12-31', true));
ck('非法输入原样返回', hist.formatHistoryDate('not-a-date', true) === 'not-a-date');
// 注释里会写到 "new Date('2026-10-02')" 这个反例, 所以先剥掉注释再查代码
const histSrc = fs.readFileSync(path.join(MINI, 'utils/exercise-history.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
ck('**不依赖 Date 解析**(代码里没有 new Date)', !/new\s+Date\s*\(/.test(histSrc));

console.log('\n════ 2) 单组文本(按数据本身决定, 不按当前动作模式猜) ════');
ck('次数类 → 50kg × 10(与 LAST 徽章同口径, 不带"次")',
  hist.formatSetText({ weight: 50, weight_unit: 'kg', reps: 10 }, { t: T }) === '50kg × 10',
  hist.formatSetText({ weight: 50, weight_unit: 'kg', reps: 10 }, { t: T }));
ck('磅 → 110lb × 10',
  hist.formatSetText({ weight: 110, weight_unit: 'lb', reps: 10 }, { t: T }) === '110lb × 10',
  hist.formatSetText({ weight: 110, weight_unit: 'lb', reps: 10 }, { t: T }));
ck('计时类 → 90秒', hist.formatSetText({ duration_sec: 90, weight: 0, reps: 0 }, { t: T }) === '90秒',
  hist.formatSetText({ duration_sec: 90, weight: 0, reps: 0 }, { t: T }));
ck('计时类带负重 → 90秒 · 12kg',
  hist.formatSetText({ duration_sec: 90, weight: 12, weight_unit: 'kg' }, { t: T }) === '90秒 · 12kg',
  hist.formatSetText({ duration_sec: 90, weight: 12, weight_unit: 'kg' }, { t: T }));
ck('距离类 → 5.2公里',
  hist.formatSetText({ distance_km: 5.2, weight: 0, reps: 0 }, { t: T }) === '5.2公里',
  hist.formatSetText({ distance_km: 5.2, weight: 0, reps: 0 }, { t: T }));
ck('距离+时长+负重 → 5.2公里 · 90秒 · 12kg',
  hist.formatSetText({ distance_km: 5.2, duration_sec: 90, weight: 12, weight_unit: 'kg' }, { t: T }) === '5.2公里 · 90秒 · 12kg',
  hist.formatSetText({ distance_km: 5.2, duration_sec: 90, weight: 12, weight_unit: 'kg' }, { t: T }));
ck('老数据(次数类记录, 现在动作改成计时类)仍按数据渲染',
  hist.formatSetText({ weight: 50, weight_unit: 'kg', reps: 10, duration_sec: null }, { t: T }) === '50kg × 10');

console.log('\n════ 3) 分组结构 ════');
const payload = {
  dates: [
    { date: '2026-11-20', sets: [{ weight: 50, weight_unit: 'kg', reps: 5 }], total_sets: 1 },
    { date: '2026-11-16', sets: [{ weight: 40, weight_unit: 'kg', reps: 10 }, { weight: 45, weight_unit: 'kg', reps: 8 }], total_sets: 14 },
  ],
  total_days: 30, shown_days: 2, truncated: true,
};
const g = hist.buildHistoryGroups(payload, { isZh: true, t: { ...T, EXERCISE_HISTORY_MORE_SETS: '还有 {n} 组' } });
ck('分成 2 组', g.length === 2, `groups=${g.length}`);
ck('日期文本已本地化', g[0].dateText === '2026年11月20日', g[0].dateText);
ck('每组 sets 带 idx(给 wx:key 用)', g[1].sets[1].idx === 1, JSON.stringify(g[1].sets));
ck('组文本已生成', g[1].sets[0].text === '40kg × 10', g[1].sets[0].text);
ck('封顶的组数如实上报', g[1].totalSets === 14, `totalSets=${g[1].totalSets}`);
ck('还有几组没显示 → moreSets=12', g[1].moreSets === 12, `moreSets=${g[1].moreSets}`);
ck('moreText 已填好数字', g[1].moreText === '还有 12 组', g[1].moreText);
ck('没封顶的组 moreSets=0 且 moreText 为空', g[0].moreSets === 0 && g[0].moreText === '');
ck('空数组 → 空分组(整个模块不渲染)', hist.buildHistoryGroups({ dates: [] }, { isZh: true, t: T }).length === 0);
ck('payload 缺失 → 空分组', hist.buildHistoryGroups(null, { isZh: true, t: T }).length === 0);
ck('某天 sets 为空 → 该天被跳过', hist.buildHistoryGroups({ dates: [{ date: '2026-01-01', sets: [], total_sets: 0 }] }, { isZh: true, t: T }).length === 0);

console.log('\n════ 4) 底部封顶说明 ════');
const footT = { EXERCISE_HISTORY_DAYS: '共 {n} 天 · 仅显示最近 {m} 天' };
ck('封顶时给出真实总数', hist.buildHistoryFootText(payload, footT) === '共 30 天 · 仅显示最近 2 天',
  hist.buildHistoryFootText(payload, footT));
ck('没封顶 → 空(不显示这行)', hist.buildHistoryFootText({ truncated: false, total_days: 3 }, footT) === '');

console.log('\n════ 5) WXML: 没历史就不渲染 ════');
const panelMatch = wxml.match(/<view wx:if="\{\{historyGroups\.length > 0\}\}" class="history-panel">/);
ck('历史面板有 wx:if="historyGroups.length > 0" 的守卫', !!panelMatch);
ck('面板标题用 i18n 词条', wxml.includes('{{t.EXERCISE_HISTORY}}'));
ck('日期用预格式化文本(不在 WXML 里拼日期)', wxml.includes('{{d.dateText}}'));
ck('每组文本已预生成(WXML 只输出 {{s.text}})', wxml.includes('{{s.text}}'));
ck('组 chip 用 wx:key="idx"', wxml.includes('wx:key="idx"'));
ck('还有几组 → 显示 moreText', wxml.includes('{{d.moreText}}'));
ck('底部封顶说明 → 显示 historyFootText', wxml.includes('{{historyFootText}}'));
ck('面板在 scroll-view 内(跟着配置区一起滚)',
  /history-panel[\s\S]*?<\/view>\s*\n\s*<\/scroll-view>/.test(wxml));

console.log('\n════ 6) WXML: wx:if / wx:elif / wx:else 兄弟链 ════');
{
  const src = wxml.replace(/<!--[\s\S]*?-->/g, '');
  const stack = []; const els = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, close, tag, attrs, selfc] = m;
    const line = src.slice(0, m.index).split('\n').length;
    if (close) { if (stack.length && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const parent = stack.length ? stack[stack.length - 1].idx : null;
    const idx = els.length;
    els.push({ tag, attrs, line, parent });
    if (!selfc) stack.push({ tag, idx });
  }
  const sibs = new Map();
  els.forEach((e, i) => { if (!sibs.has(e.parent)) sibs.set(e.parent, []); sibs.get(e.parent).push(i); });
  let bad = 0;
  els.forEach((e, i) => {
    if (!/wx:else\b/.test(e.attrs) || /wx:elif/.test(e.attrs)) return;
    const list = sibs.get(e.parent);
    const k = list.indexOf(i);
    const prev = k > 0 ? els[list[k - 1]] : null;
    const ok = prev && (/wx:elif/.test(prev.attrs) || (/wx:if/.test(prev.attrs) && !/wx:elif/.test(prev.attrs)));
    if (!ok) { console.log(`  ❌ 第${e.line}行 wx:else 前一个兄弟不合法`); bad++; }
  });
  ck('所有 wx:else 都紧跟 wx:if / wx:elif', bad === 0, `问题 ${bad} 处`);
}

console.log('\n════ 7) JS 接线 ════');
ck('调用了 exercise.getHistory', wjs.includes("api.callCloud('exercise.getHistory'"));
ck('传参是 exercise_id', /getHistory',\s*\{\s*exercise_id:/.test(wjs));
ck('历史有归属校验(动作换了就丢弃回包)', /_historyReqId.*!==.*reqId/.test(wjs));
ck('选中动作时清空历史', /historyGroups: \[\]/.test(wjs));
ck('重置处至少 4 处(初始/打开弹层/返回上一步/选中动作)',
  (wjs.match(/historyGroups: \[\]/g) || []).length >= 4, `实际 ${(wjs.match(/historyGroups: \[\]/g) || []).length} 处`);
ck('拉不到历史不影响主流程(只 console.error, 不抛)', /catch \(err\)[\s\S]{0,200}console\.error/.test(wjs));
ck('用了纯函数模块而不是自己拼', wjs.includes("require('../../utils/exercise-history.js')"));

console.log('\n════ 8) i18n 词条 ════');
['EXERCISE_HISTORY', 'EXERCISE_HISTORY_MORE_SETS', 'EXERCISE_HISTORY_DAYS'].forEach((k) => {
  ck(`zh 有 ${k}`, typeof zh[k] === 'string' && zh[k].length > 0, zh[k]);
  ck(`en 有 ${k}`, typeof en[k] === 'string' && en[k].length > 0, en[k]);
});
const zhKeys = Object.keys(zh).sort();
const enKeys = Object.keys(en).sort();
ck('zh / en 词条完全对齐', JSON.stringify(zhKeys) === JSON.stringify(enKeys),
  `zh=${zhKeys.length} en=${enKeys.length}`);
ck('**没有复用已占用的 HISTORY 词条**(它=当日训练)',
  zh.HISTORY === '当日训练' && en.HISTORY === "TODAY'S SESSIONS", `HISTORY=${zh.HISTORY}`);

console.log(`\n════ 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ════\n`);
process.exit(fail === 0 ? 0 : 1);
