// utils/calories.js — 卡路里计算 v1(与后端 src/common/utils/calories.ts 逻辑同步)
//
// ⚠️ 这份和后端那份必须保持一致 —— 前端做实时展示, 后端在 session.finish 时落库,
//    两边算出来不一样的话, 训练结束弹窗的数字会跳变。
//    改算法时两边一起改。
//
// 2026-11-04 新建。原来只有 utils/unit.js 里的 volumeToCalories 一个公式
// (volume_kg × 体重 × 0.0011), 整个 session 一个公式, 不区分动作类型 ——
// 于是计时类(平板支撑)和距离类(跑步)的卡路里恒为 0。

const { toKg } = require('./unit.js');

/**
 * v1 系数表 —— 后续按动作类型优化时, 只改这里
 * (与后端 CALORIE_CONFIG 一一对应)
 */
const CALORIE_CONFIG = {
  // 体积法: kcal = 训练量(kg) × 体重(kg) × volumeFactor
  volumeFactor: 0.0011,
  // 各计量方式的默认 MET(代谢当量), 1 MET ≈ 1 kcal/kg/小时
  defaultMet: {
    weight_reps: 6,
    duration: 5,
    distance_duration: 8,
  },
  // 距离法: kcal = 体重(kg) × 距离(km) × distanceFactor
  distanceFactor: 0.9,
};

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * 把库的 exercise_type 值规范成 CountMode; 未知值一律按 weight_reps
 */
function normalizeCountMode(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === 'duration') return 'duration';
  if (s === 'distance_duration') return 'distance_duration';
  return 'weight_reps';
}

/** MET 法: kcal = MET × 体重(kg) × 时长(小时) */
function metCalories(met, userWeightKg, durationSec) {
  if (durationSec <= 0) return 0;
  return (met * userWeightKg * durationSec) / 3600;
}

/**
 * 计算单个 set 的卡路里
 * @param {Object} set { countMode, volumeKg, durationSec, distanceKm, metOverride }
 * @param {number} userWeightKg 用户体重(kg)
 * @returns {number} 卡路里(小数, 汇总后再取整)
 */
function calcSetCalories(set, userWeightKg) {
  const weight = num(userWeightKg) || 60;
  const mode = normalizeCountMode(set && set.countMode);
  const volumeKg = num(set && set.volumeKg);
  const durationSec = num(set && set.durationSec);
  const distanceKm = num(set && set.distanceKm);
  const met = num(set && set.metOverride) || CALORIE_CONFIG.defaultMet[mode];

  if (mode === 'duration') {
    if (durationSec > 0) return metCalories(met, weight, durationSec);
    if (volumeKg > 0) return volumeKg * weight * CALORIE_CONFIG.volumeFactor;
    return 0;
  }

  if (mode === 'distance_duration') {
    if (distanceKm > 0) return weight * distanceKm * CALORIE_CONFIG.distanceFactor;
    if (durationSec > 0) return metCalories(met, weight, durationSec);
    if (volumeKg > 0) return volumeKg * weight * CALORIE_CONFIG.volumeFactor;
    return 0;
  }

  // weight_reps —— 沿用现有体积法(保证历史数据一致)
  if (volumeKg > 0) return volumeKg * weight * CALORIE_CONFIG.volumeFactor;
  if (durationSec > 0) return metCalories(met, weight, durationSec);
  return 0;
}

/**
 * 汇总一组 set 的卡路里
 * @param {Array} sets
 * @param {number} userWeightKg
 * @returns {number} 已取整
 */
function calcSetsCalories(sets, userWeightKg) {
  if (!Array.isArray(sets) || !sets.length) return 0;
  const total = sets.reduce((sum, s) => sum + calcSetCalories(s, userWeightKg), 0);
  return Math.round(total);
}

/**
 * 汇总整个 session 的卡路里
 * @param {Array} groups [{ countMode, sets: [...] }] —— 一个动作一组
 * @param {number} userWeightKg
 * @returns {number} 已取整
 */
function calcSessionCalories(groups, userWeightKg) {
  if (!Array.isArray(groups) || !groups.length) return 0;
  const total = groups.reduce((sum, g) => {
    const mode = normalizeCountMode(g && g.countMode);
    const sets = ((g && g.sets) || []).map((s) => ({
      ...s,
      countMode: (s && s.countMode) || mode,
    }));
    return sum + calcSetsCalories(sets, userWeightKg);
  }, 0);
  return Math.round(total);
}

/**
 * 从一个 set 行(数据库 exercises 行)算出它的训练量(kg)
 * —— 复用 unit.js 的 toKg 做 lb→kg 换算
 * @param {Object} row { weight, weight_unit, reps }
 */
function rowVolumeKg(row) {
  if (!row) return 0;
  const reps = num(row.reps);
  return toKg(num(row.weight), row.weight_unit || 'kg') * reps;
}

module.exports = {
  CALORIE_CONFIG,
  normalizeCountMode,
  calcSetCalories,
  calcSetsCalories,
  calcSessionCalories,
  rowVolumeKg,
};
