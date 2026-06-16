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

/**
 * 训练量(kg) 换算为估算卡路里(大卡)
 * 公式: volume_kg × user_weight_kg × 0.0011
 * @param {number} volumeKg 训练量(kg)
 * @param {number} [userWeightKg] 用户体重(kg)，不传则从 globalData 或 storage 读取
 * @returns {number} 估算卡路里，取整
 */
function volumeToCalories(volumeKg, userWeightKg) {
  if (!userWeightKg) {
    const app = getApp();
    userWeightKg = (app && app.globalData && app.globalData.userWeight) || 60;
    if (!userWeightKg) {
      const stored = wx.getStorageSync('userWeight');
      userWeightKg = stored || 60;
    }
  }
  return Math.round(volumeKg * userWeightKg * 0.0011);
}

/**
 * 格式化卡路里显示
 * @param {number} kcal
 * @returns {string}
 */
function formatCalories(kcal) {
  if (kcal >= 1000) return (kcal / 1000).toFixed(1) + 'K';
  return String(kcal);
}

module.exports = {
  KG_PER_LB,
  toKg,
  /**
   * 计算一个 set 的体积 (weight * reps), 自动处理 lb→kg 单位转换与脏数据。
   * @param {{weight?: number|string, weight_unit?: string, reps?: number|string}} set
   * @returns {number} 该组换算成 kg 后的体积; 无效输入返回 0
   */
  setVolume(set) {
    if (!set) return 0;
    const reps = Number(set.reps) || 0;
    return toKg(set.weight, set.weight_unit) * reps;
  },
  volumeToCalories,
  formatCalories,
};
