// miniprogram/utils/set-model.js — set(组) 的构造与"显示模式"标记
//
// ⚠️ 为什么要抽成独立模块(2026-11-07 用户截图发现的问题):
//   编辑弹框点"+"新增的行, 标签显示成「负重」(应该按动作类型显示「重量」),
//   而且缺了「次数」列、输入框还变宽了。
//   根因: buildSets 给**已有**的 set 加了 isDuration/isDistance/isRepsMode 标记,
//   但 addSet 构造**新** set 时忘了加 → 新增行的三个条件全是 undefined。
//
//   这已经是 set 结构第三次出问题(前两次是 WXML 的 wx:if/wx:else 配对)。
//   两条构造路径各写一遍标记, 迟早还会漏 —— 所以统一收口到这里,
//   并且 tools/check-count-mode-ui.js 直接 require 这个模块做断言,
//   以后谁改了这里、忘了加标记, 脚本立刻报出来。
//
// 术语: 一个"动作"在训练里有若干"组"(set), 每组有自己的计量参数。

const { formatNumberForInput } = require('./numberInput.js');

/**
 * 补上"显示模式"标记 —— WXML 靠这三个标记决定显示哪几列:
 *   isDuration → 显示「时长」
 *   isDistance → 显示「距离」
 *   isRepsMode → 显示「次数」(且重量标签用「重量」而不是「负重」)
 *
 * ⚠️ 这三个标记**必须**每条 set 都有 —— 缺一个就会出现
 *   "标签走错分支 / 该显示的列不显示 / 输入框宽度错乱"。
 *
 * @param {object} set          set 数据
 * @param {string} fallbackMode 该动作的计量方式(countMode 缺失时的兜底)
 */
function withModeFlags(set, fallbackMode) {
  const mode = (set && set.countMode) || fallbackMode || 'weight_reps';
  return {
    ...set,
    countMode: mode,
    isDuration: mode === 'duration',
    isDistance: mode === 'distance_duration',
    // 次数类 = 既不是计时类也不是距离类
    isRepsMode: mode !== 'duration' && mode !== 'distance_duration',
  };
}

/**
 * 组装可编辑的 set 列表(从后端返回的 group.sets 来)
 *
 * - weightStr: 重量输入框的字符串(带格式)
 * - repsStr: 次数输入框的字符串(用户清空时不能被回写成 0)
 * - durationStr / distanceStr: 时长/距离输入框的字符串
 *   (input 的 value 必须是字符串, 数字会丢小数位且无法正常编辑)
 */
function buildSets(rawSets, countMode) {
  return (rawSets || []).map((s) => {
    const mode = s.countMode || countMode || 'weight_reps';
    const reps = Number(s.reps) || 0;
    return withModeFlags({
      ...s,
      weightStr: formatNumberForInput(s.weight),
      repsStr: s.reps != null ? String(s.reps) : '',
      durationStr: s.duration_sec != null ? String(s.duration_sec) : '',
      distanceStr: s.distance_km != null ? String(s.distance_km) : '',
    }, mode);
  });
}

/**
 * 构造一个新增的 set(点"+"加出来的那组)
 *
 * 新 set 继承上一组的值:
 *   次数类 → 继承重量和次数
 *   计时类 → 重量为 0, 继承时长
 *   距离类 → 重量为 0, 继承距离
 *
 * @param {object} last      上一组 set(没有则传 null)
 * @param {string} mode      该动作的计量方式
 * @param {number} index     新 set 在列表里的序号
 * @param {number} tempId    临时 id(真实 id 要等入库才有)
 */
function newSetFrom(last, mode, index, tempId) {
  const m = mode || 'weight_reps';
  const isWeight = m === 'weight_reps';
  const w = isWeight ? (last && last.weight) || 0 : 0;
  const reps = isWeight ? (last && last.reps) || 0 : 0;
  return withModeFlags({
    id: tempId,
    // 临时 id 用 Date.now(), 但"是不是新增的"用显式标志判断。
    // 原来靠 `s.id > Date.now() - 100000` 猜 → 用户加完组停留超过 100 秒
    // 再保存, 新组会被静默丢弃; 删除时还会拿临时 id 去调 delete → 报 500。
    isNew: true,
    weight: w,
    weightStr: formatNumberForInput(w),
    reps,
    repsStr: String(reps),
    weight_unit: (last && last.weight_unit) || 'kg',
    // 计时/距离类的新 set 要带上对应的初值(否则存回去是 0/null)
    duration_sec: m === 'duration' ? (last && last.duration_sec) || 0 : 0,
    durationStr: m === 'duration' ? String((last && last.duration_sec) || 0) : '',
    distance_km: m === 'distance_duration' ? (last && last.distance_km) || 0 : 0,
    distanceStr: m === 'distance_duration' ? String((last && last.distance_km) || 0) : '',
    countMode: m,
    sequence: index,
  }, m);
}

module.exports = {
  withModeFlags,
  buildSets,
  newSetFrom,
};
