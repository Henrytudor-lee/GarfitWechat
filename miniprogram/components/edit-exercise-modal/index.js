// components/edit-exercise-modal/index.js
const app = getApp();
const api = require('../../utils/api.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');
// set 的构造与'显示模式'标记统一收口到这里 ——
// 两条路径(buildSets 已有组 / newSetFrom 新增组)各写一遍标记, 迟早还会漏
// (2026-11-07 实测: 新增组漏了标记 → 标签走成「负重」+ 缺「次数」列)。
const { buildSets, newSetFrom } = require('../../utils/set-model.js');

/**
 * 取 i18n 字典, 并补齐可能缺失的 key。
 *
 * ⚠️ i18n 字典是**启动时的快照**(app.onLaunch 里取的)——
 *    开发者新增 key 后如果没重新编译就取不到, 标签会渲染成**空白**。
 *    实测(2026-11-07): "负重"标签空白 → 那一列比旁边矮一截 →
 *    被 .set-item 的 align-items:center 居中后, 时长组比负重组低 8px, 整行错位。
 *    这里兜底成 WEIGHT, 至少不空白(重新编译后正常显示"负重")。
 *
 * 用模块级函数而不是实例方法 —— data 的初始值可能在 methods 挂载前求值。
 */
function pickDict() {
  const dict = { ...(app.globalData.t || {}) };
  if (!dict.LOAD) dict.LOAD = dict.WEIGHT;
  return dict;
}


/**
 * 取这组动作的计量方式
 *
 * group 来自训练页的 exerciseGroups, 里面:
 *   group.count_mode          动作的计量方式(后端 JOIN library 带出)
 *   group.sets[i].countMode   每组 set 自己的计量方式
 */
function pickCountMode(group) {
  if (!group) return 'weight_reps';
  if (group.count_mode) return group.count_mode;
  const fromSet = (group.sets || [])[0]?.countMode;
  return fromSet || 'weight_reps';
}

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    group: {
      type: Object,
      value: null,
    },
    sessionId: {
      // ⚠️ 父组件传进来的是**数字**(session id 是 int 自增主键),
      //    属性却声明成 String → 微信框架类型不匹配会报警告,
      //    某些基础库版本会直接丢成默认值 null → session_id 传不上去。
      //    两个类型都声明, 兼容数字和字符串。
      type: [String, Number],
      value: null,
    },
    locale: {
      type: String,
      value: 'en',
    },
    theme: {
      type: String,
      value: 'night',
    },
  },

  data: {
    sets: [],
    countMode: 'weight_reps',   // 计量方式: weight_reps | duration | distance_duration
    activeSetsCount: 0,
    saving: false,
    imgPrefix: '',
    locale: 'zh',
    t: {},
    isFavorite: false,
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen && this.data.group) {
        const countMode = pickCountMode(this.data.group);
        const sets = buildSets(this.data.group.sets, countMode);
        // 同步 favor 状态
        const favorExercises = app.globalData.favorExercises || [];
        const isFavorite = favorExercises.includes(this.data.group.exercise_id);
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          locale: app.globalData.language || 'zh',
          t: pickDict(),
          countMode,
          sets,
          activeSetsCount: sets.filter(s => !s.deleted).length,
          isFavorite,
        });
      }
    },
    'group': function(group) {
      if (group && this.data.isOpen) {
        const countMode = pickCountMode(group);
        const sets = buildSets(group.sets, countMode);
        const favorExercises = app.globalData.favorExercises || [];
        const isFavorite = favorExercises.includes(group.exercise_id);
        this.setData({
          countMode,
          sets,
          activeSetsCount: sets.filter(s => !s.deleted).length,
          isFavorite,
        });
      }
    },
  },

  methods: {

    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    onSheetTap() {
      // Empty — catchtap on modal-sheet stops event bubbling so child taps don't reach mask
    },

    onFavoriteTap() {
      const group = this.data.group;
      if (!group || !group.exercise_id) return;
      const id = group.exercise_id;
      const wasFav = !!this.data.isFavorite;
      // optimistic update
      this.setData({ isFavorite: !wasFav });
      // toast
      wx.showToast({
        title: (this.data.t || {})[wasFav ? 'FAV_REMOVED' : 'FAV_ADDED'] || (wasFav ? 'Unfavorited' : 'Favorited'),
        icon: 'none',
        duration: 1200
      });
      // sync global favorExercises
      const favorExercises = (app.globalData && app.globalData.favorExercises) || [];
      const oldFav = favorExercises;   // 回滚用快照
      const newFav = wasFav
        ? favorExercises.filter(fid => fid !== id)
        : [...favorExercises, id];
      // ⚠️ 之前是 app.globalData.favorExercises = newFav —— 绕过了 applyExerciseFlags,
      //    storage 没写 → 重启后收藏状态回退。统一走 applyExerciseFlags。
      app.applyExerciseFlags({ favor_exercises: newFav });
      // cloud call
      api.callCloud('exercise.toggleFavorite', { exercise_id: id })
        .then((r) => {
          const list = r && r.result && r.result.favor_exercises;
          if (Array.isArray(list)) {
            app.applyExerciseFlags({ favor_exercises: list });
            // 服务端才是事实来源 → 用服务端列表重算, 纠正乐观值
            this.setData({ isFavorite: list.includes(id) });
          }
        })
        .catch((err) => {
          console.error('toggleFavorite failed', err);
          // ⚠️ 之前是 .catch(() => {}) → 服务器拒绝后心形一直保持翻转, 既不回滚也不提示
          app.applyExerciseFlags({ favor_exercises: oldFav });
          this.setData({ isFavorite: wasFav });
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
    },

    closeModal() {
      this.setData({ sets: [] });
      this.triggerEvent('close');
    },

    updateSet(index, field, value) {
      const sets = [...this.data.sets];
      sets[index] = { ...sets[index], [field]: value };
      this.setData({ sets });
    },

    deleteSet(event) {
      const index = event.target.dataset.index;
      const sets = [...this.data.sets];
      sets[index] = { ...sets[index], deleted: true };
      this.setData({ sets, activeSetsCount: sets.filter(s => !s.deleted).length });
    },

    addSet() {
      const last = this.data.sets[this.data.sets.length - 1];
      const mode = this.data.countMode || 'weight_reps';
      const newSet = newSetFrom(last, mode, this.data.sets.length, Date.now());
      const sets = [...this.data.sets, newSet];
      this.setData({ sets, activeSetsCount: sets.filter(s => !s.deleted).length });
    },

    incWeight(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      const w = s.weight + 2.5;
      this.updateSet(index, 'weight', w);
      this.updateSet(index, 'weightStr', formatNumberForInput(w));
    },

    decWeight(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      const w = Math.max(0, s.weight - 2.5);
      this.updateSet(index, 'weight', w);
      this.updateSet(index, 'weightStr', formatNumberForInput(w));
    },

    onWeightInput(e) {
      const index = e.currentTarget.dataset.index;
      const patch = syncDecimalValue('weight', e.detail.value);
      if (patch) {
        // patch has { weight, weightStr } — apply to this set
        const sets = [...this.data.sets];
        sets[index] = { ...sets[index], ...patch };
        this.setData({ sets });
      }
    },

    incReps(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      const v = (s.reps || 0) + 1;
      this.updateSet(index, 'reps', v);
      this.updateSet(index, 'repsStr', String(v));
    },

    decReps(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      // 下限改成 0: reps=0 的组按"−"反而变成 1, 用户没法减到 0。
      // "reps 必须 > 0"应该在保存时校验, 不是用步进器夹逼。
      const v = Math.max(0, (s.reps || 0) - 1);
      this.updateSet(index, 'reps', v);
      this.updateSet(index, 'repsStr', String(v));
    },

    // ── 计时类: 秒数(步进 ±5 秒) ──
    onDurationInput(e) {
      const index = Number(e.currentTarget.dataset.index);
      const raw = e.detail.value;
      // 保留用户正在输入的原始字符串(数字会丢小数位且无法正常编辑)
      this.updateSet(index, 'durationStr', raw);
      this.updateSet(index, 'duration_sec', Number(raw) || 0);
    },

    incDuration(e) {
      const index = Number(e.currentTarget.dataset.index);
      const s = this.data.sets[index];
      const sec = (s.duration_sec || 0) + 5;
      this.updateSet(index, 'duration_sec', sec);
      this.updateSet(index, 'durationStr', String(sec));
    },

    decDuration(e) {
      const index = Number(e.currentTarget.dataset.index);
      const s = this.data.sets[index];
      const sec = Math.max(0, (s.duration_sec || 0) - 5);
      this.updateSet(index, 'duration_sec', sec);
      this.updateSet(index, 'durationStr', String(sec));
    },

    // ── 距离类: 公里(步进 ±0.5, 允许小数) ──
    onDistanceInput(e) {
      const index = Number(e.currentTarget.dataset.index);
      const raw = e.detail.value;
      this.updateSet(index, 'distanceStr', raw);
      this.updateSet(index, 'distance_km', Number(raw) || 0);
    },

    incDistance(e) {
      const index = Number(e.currentTarget.dataset.index);
      const s = this.data.sets[index];
      const km = Math.round(((s.distance_km || 0) + 0.5) * 100) / 100;
      this.updateSet(index, 'distance_km', km);
      this.updateSet(index, 'distanceStr', String(km));
    },

    decDistance(e) {
      const index = Number(e.currentTarget.dataset.index);
      const s = this.data.sets[index];
      const km = Math.max(0, Math.round(((s.distance_km || 0) - 0.5) * 100) / 100);
      this.updateSet(index, 'distance_km', km);
      this.updateSet(index, 'distanceStr', String(km));
    },

    onRepsInput(e) {
      const index = e.currentTarget.dataset.index;
      // ⚠️ input.value 必须绑字符串字段: 用户全选删除时 e.detail.value = '',
      //    直接 parseInt('')||0 → 0 → setData 把 0 写回输入框 → 框里立刻显示 "0",
      //    还得再删一次; 而且"空串"被当成 0 提交。
      const raw = e.detail.value;
      const num = parseInt(raw, 10);
      const sets = [...this.data.sets];
      sets[index] = { ...sets[index], repsStr: raw, reps: isNaN(num) ? 0 : num };
      this.setData({ sets });
    },

    setUnit(e) {
      const index = e.currentTarget.dataset.index;
      const u = e.currentTarget.dataset.weightUnit;
      this.updateSet(index, 'weight_unit', u);
    },

    async saveAll() {
      if (!this.data.sessionId || this.data.saving) return;

      this.setData({ saving: true });

      try {
        const { group, sets } = this.data;
        let addedExerciseId = null;

        for (let i = 0; i < sets.length; i++) {
          const s = sets[i];
          if (s.deleted) continue;

          const original = (group.sets || []).find(os => os.id === s.id);

          // ★ 判定"这组有没有被改过"时**必须**包含时长/距离,
          //   否则计时类(duration)/距离类(distance_duration)的 set
          //   三个字段天然不变 → 条件恒为 false → update 一次都不会发,
          //   用户改了秒数却"保存成功"但数据没变。
          const durChanged = original
            && s.countMode === 'duration'
            && (original.duration_sec || 0) !== (s.duration_sec || 0);
          const distChanged = original
            && s.countMode === 'distance_duration'
            && (original.distance_km || 0) !== (s.distance_km || 0);

          if (original && (original.weight !== s.weight || original.reps !== s.reps
                           || original.weight_unit !== s.weight_unit
                           || durChanged || distChanged)) {
            await api.callCloud('exercise.update', { id: s.id,
                session_id: this.data.sessionId,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
                // 计时/距离类的 set 要带上对应字段; 不适用时传 undefined,
                // JSON 序列化会省略该 key → 后端**不动**这一列。
                // ⚠️ 2026-11-05 修正: 原来这条注释写的是"后端写 NULL(不会误清已有值)",
                //    而后端当时的实现恰恰相反 —— 没传的字段一律 push(null) 写成 NULL,
                //    "改个重量就把已有的秒数抹掉"。后端已改成只写显式传入的字段。
                duration_sec: s.countMode === 'duration' ? s.duration_sec : undefined,
                distance_km: s.countMode === 'distance_duration' ? s.distance_km : undefined });
          }

          // 用 isNew 判断, 不用时间戳猜(见 addSet 里的说明)
          if (!original && s.isNew) {
            await api.callCloud('exercise.add', { session_id: this.data.sessionId,
                exercise_id: group.exercise_id,
                name_zh: group.name_zh,
                name_en: group.name_en || null,
                image_name: group.image_name || null,
                video_name: group.video_name || null,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
                duration_sec: s.countMode === 'duration' ? (s.duration_sec || 0) : null,
                distance_km: s.countMode === 'distance_duration' ? (s.distance_km || 0) : null });
            addedExerciseId = group.exercise_id;
          }
        }

        const toDelete = sets.filter(s => {
          if (!s.deleted) return false;
          // ★ 新增的组还没入库, 从来不需要发 delete
          //   (原来会拿临时 id 去调 delete → 后端报 500 → 整个保存中断)
          if (s.isNew) return false;
          // DB records have small integer ids — always delete
          if (s.id < 1e12) return true;
          return true;
        });
        for (const s of toDelete) {
          await api.callCloud('exercise.delete', { id: s.id,
              session_id: this.data.sessionId });
        }

        this.triggerEvent('saved', { addedExerciseId });
        this.closeModal();
      } catch (err) {
        console.error('Save failed:', err);
        wx.showToast({ title: 'SAVE FAILED', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },
  },
});
