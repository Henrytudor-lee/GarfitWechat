// utils/numberInput.js — 小程序 input 数字输入辅助
// 用于处理重量/身高等可输入小数的字段, 避免受控 input 重新渲染时丢失小数点。
//
// 用法:
//   - data 中维护两个字段: `<key>`(number, 用于比较/算术/提交) 和 `<key>Str`(string, 用于 input.value)
//   - bindinput 调用 syncDecimalValue(key, raw) 同步两个字段
//   - 程序化修改(增减、chip、history)调用 formatNumberForInput(num) 同时更新两个字段

// 限制最多 3 位小数, 避免输入 "1e10" 等科学计数法
const DECIMAL_RE = /^\d*\.?\d{0,3}$/;

function isValidDecimalString(str) {
  return str === '' || DECIMAL_RE.test(str);
}

/**
 * 把任意数值格式化为不带多余 0 的字符串, 例如 2.5 / 2.50 / 0.25
 * 用于 chip/inc/dec 等程序化更新后的 input 显示
 */
function formatNumberForInput(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  const num = Number(n);
  if (!isFinite(num)) return '';
  return String(parseFloat(num.toFixed(3)));
}

/**
 * 同步字符串与数字字段。返回适合 setData 的部分对象:
 *   { [key]: number, [key + 'Str']: str }
 * 如果原始字符串无效(包含非法字符), 返回 null, 调用方应忽略。
 */
function syncDecimalValue(key, rawStr) {
  const str = String(rawStr == null ? '' : rawStr);
  if (!isValidDecimalString(str)) return null;
  const num = str === '' ? 0 : parseFloat(str);
  const out = {};
  out[key] = isFinite(num) ? num : 0;
  out[key + 'Str'] = str;
  return out;
}

module.exports = {
  isValidDecimalString,
  formatNumberForInput,
  syncDecimalValue,
};
