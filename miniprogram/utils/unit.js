// utils/unit.js — 重量单位换算
// 项目约定: 重量字段统一使用 weight_unit 字段 (camelCase: 'kg' | 'lb')
// 训练总重 (totalVolume) 内部统一以 kg 为单位存储和显示

const KG_PER_LB = 0.4536;

/**
 * 将任意单位的重量转换为 kg。
 * @param {number|string} weight 重量数值
 * @param {string} unit 'kg' | 'lb'，缺省视为 kg
 * @returns {number} 换算后的 kg 数值；非数字输入返回 0
 */
function toKg(weight, unit) {
  const w = Number(weight);
  if (!isFinite(w)) return 0;
  if (unit === 'lb') return w * KG_PER_LB;
  return w;
}

module.exports = {
  KG_PER_LB,
  toKg,
};
