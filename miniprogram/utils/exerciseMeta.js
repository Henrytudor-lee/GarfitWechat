// utils/exerciseMeta.js — 动作元信息的**统一口径**
//
// 同一个动作要在三个地方显示"中文名 / 英文名 / 器械 / 肌群 / 计量方式":
//   · pages/library        动作库详情弹层
//   · pages/share          训练分享页里的动作详情弹层
//   · pages/exercise-share 动作分享详情页(2026-11-10 新增)
//
// 以前 share 页和 library 页各写了一份 modeLabel / idsToNames,
// 改一处漏一处 → 同一个动作在两个页面上标签对不上。
// 现在统一收口到这里, 组件 exercise-detail 也只认这里的口径。

const {
  BODY_PART_MAP, BODY_PART_MAP_ZH, EQUIP_MAP, EQUIP_MAP_ZH,
} = require('./maps.js');

/**
 * 计量方式 → 显示文案
 *
 * 数据源: exercises_library.exercise_type (字段本来就有)
 * 旧值 'Strength' 是历史遗留默认值(线上 0 行), 按次数类显示。
 */
function modeLabel(exerciseType, t) {
  const raw = exerciseType || 'weight_reps';
  const dict = t || {};
  if (raw === 'duration') return dict.MODE_TIMED || 'TIMED';
  if (raw === 'distance_duration') return dict.MODE_DISTANCE || 'DISTANCE';
  return dict.REPS || 'REPS';
}

/** 逗号分隔的 id 串 → 名称数组(肌群是 "19,1" 这种多值) */
function idsToNames(raw, map, mapZh, isZh) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (isZh ? (mapZh[id] || map[id]) : (map[id] || mapZh[id])))
    .filter(Boolean);
}

/** 器械名(可能是多值) */
function equipmentNames(exercise, isZh) {
  return idsToNames(exercise && exercise.equipment_id, EQUIP_MAP, EQUIP_MAP_ZH, isZh);
}

/** 肌群名(可能是多值) */
function muscleNames(exercise, isZh) {
  return idsToNames(exercise && exercise.body_part_id, BODY_PART_MAP, BODY_PART_MAP_ZH, isZh);
}

/**
 * 主标题
 *
 * ⚠️ 两种数据源的字段名不一样, 这里统一兜住:
 *   · 动作库:  name = 英文名, name_zh = 中文名
 *   · 训练/分享里的 group: name_en = 英文名, name_zh = 中文名(没有 name)
 */
function titleOf(exercise, isZh) {
  const ex = exercise || {};
  if (isZh) return ex.name_zh || ex.name_en || ex.name || '';
  return ex.name_en || ex.name || ex.name_zh || '';
}

/** 英文名(动作库里 name 本身就是英文名) */
function enNameOf(exercise) {
  const ex = exercise || {};
  return ex.name_en || ex.name || '';
}

/**
 * 标签数组: 器械(中性) + 肌群(强调) + 计量方式(中性)
 *
 * kind 决定配色 —— 三个页面的配色约定一致:
 *   器械 / 计量方式 → chip-neutral(灰)
 *   肌群            → chip(绿)
 */
function buildTags(exercise, t, isZh) {
  const tags = [];
  const push = (text, kind) => tags.push({ key: `${kind}-${tags.length}`, text, kind });
  equipmentNames(exercise, isZh).forEach((text) => push(text, 'neutral'));
  muscleNames(exercise, isZh).forEach((text) => push(text, 'accent'));
  push(modeLabel(exercise && exercise.exercise_type, t), 'neutral');
  return tags;
}

module.exports = {
  modeLabel,
  idsToNames,
  equipmentNames,
  muscleNames,
  titleOf,
  enNameOf,
  buildTags,
};
