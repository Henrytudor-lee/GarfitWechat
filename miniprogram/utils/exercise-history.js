// utils/exercise-history.js — 动作历史配置的纯函数格式化
//
// 为什么单独抽出来:
//   1) 「历史配置」模块要按日期分组、每组把 set 渲染成一句文本,
//      这段逻辑有分支(次数类/计时类/距离类)+ 日期本地化, 混在组件里不好测。
//   2) 可以被 node 脚本直接 require 跑断言(见 tools/check-exercise-history.js),
//      不依赖小程序运行时。
//
// ⚠️ 日期绝不能走 `new Date('2026-10-02')`:
//    那个字符串会被 JS 解析成 **UTC 零点**, 在 UTC-8 的机器上 getDate() 拿到的是 1 号
//    → 日期整体前移一天。这里一律**按字符串切片**解析, 与时区无关。

const MONTH_NAMES_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * 'YYYY-MM-DD' → 展示文本(不经过 Date, 不受时区影响)
 * @param {string} dateStr 例如 '2026-10-02'
 * @param {boolean} isZh
 */
function formatHistoryDate(dateStr, isZh) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return String(dateStr || '');
  const y = m[1];
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (isZh) return `${y}年${mo}月${d}日`;
  return `${MONTH_NAMES_EN[mo - 1] || mo} ${d}, ${y}`;
}

/**
 * 单个 set → 一句文本
 *
 * 按**数据本身**决定显示什么, 不按当前动作的计量方式猜:
 *   有公里数 → "5.2公里 · 90秒 · 12kg"
 *   有秒数   → "90秒 · 12kg"
 *   否则     → "50kg × 10"
 *
 * 为什么按数据判断: 动作的计量方式可能改过(老记录是次数类, 现在是计时类),
 * 按当前 mode 渲染会把老数据显示成 "0kg × 0"。
 *
 * ⚠️ 次数**不写单位**(只写 "50kg × 10"):
 *   同一个弹层上方的 LAST 徽章就是 "50kg × 8"(没有"次"),
 *   同一个模块里两种写法会让人以为是两套口径。
 *   用户要参考的也是"上次用了多少重量×多少次", 数字已经够了。
 */
function formatSetText(set, opts) {
  const t = opts.t || {};
  const unit = set.weight_unit || 'kg';
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  const duration = Number(set.duration_sec) || 0;
  const distance = Number(set.distance_km) || 0;

  const durUnit = t.DURATION_UNIT || '秒';
  const kmUnit = t.KM || 'km';

  if (distance > 0) {
    let s = `${distance}${kmUnit}`;
    if (duration > 0) s += ` · ${duration}${durUnit}`;
    if (weight > 0) s += ` · ${weight}${unit}`;
    return s;
  }
  if (duration > 0) {
    let s = `${duration}${durUnit}`;
    if (weight > 0) s += ` · ${weight}${unit}`;
    return s;
  }
  return `${weight}${unit} × ${reps}`;
}

/**
 * 模板填空: '共 {n} 天' + {n: 30} → '共 30 天'
 * (i18n 字典只是 key→字符串, 没有插值机制, 这里自己补一个)
 */
function fillTemplate(tpl, vars) {
  if (!tpl) return '';
  let s = String(tpl);
  Object.keys(vars || {}).forEach((k) => {
    s = s.split(`{${k}}`).join(String(vars[k]));
  });
  return s;
}

/**
 * 后端返回的 { dates: [...], total_days, truncated } → 前端直接可渲染的结构
 *
 * @param {object} payload 后端 data 字段
 * @param {object} opts { isZh, t }
 * @returns {Array} [{ date, dateText, sets:[{idx, text}], totalSets, moreSets, moreText }]
 */
function buildHistoryGroups(payload, opts) {
  const t = opts.t || {};
  const isZh = !!opts.isZh;
  const dates = (payload && payload.dates) || [];
  const out = [];

  dates.forEach((d) => {
    const sets = (d && d.sets) || [];
    if (!sets.length) return;
    const total = typeof d.total_sets === 'number' ? d.total_sets : sets.length;
    const moreSets = Math.max(0, total - sets.length);
    out.push({
      date: d.date,
      dateText: formatHistoryDate(d.date, isZh),
      sets: sets.map((s, i) => ({ idx: i, text: formatSetText(s, { t }) })),
      totalSets: total,
      // 该天实际组数 > 返回组数 → 还有没显示出来的(不静默丢)
      moreSets,
      moreText: moreSets > 0 ? fillTemplate(t.EXERCISE_HISTORY_MORE_SETS || '还有 {n} 组', { n: moreSets }) : '',
    });
  });

  return out;
}

/**
 * 底部说明: "共 30 天 · 仅显示最近 10 天"
 */
function buildHistoryFootText(payload, t) {
  const data = payload || {};
  if (!data.truncated) return '';
  return fillTemplate(t.EXERCISE_HISTORY_DAYS || '共 {n} 天 · 仅显示最近 {m} 天', {
    n: data.total_days || 0,
    m: data.shown_days || 0,
  });
}

module.exports = {
  formatHistoryDate,
  formatSetText,
  fillTemplate,
  buildHistoryGroups,
  buildHistoryFootText,
};
