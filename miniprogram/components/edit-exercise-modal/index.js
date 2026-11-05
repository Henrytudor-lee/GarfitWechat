// components/edit-exercise-modal/index.js
const app = getApp();
const api = require('../../utils/api.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');

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

/**
 * 组装可编辑的 set 列表
 * - weightStr: 重量输入框的字符串(带格式)
 * - durationStr / distanceStr: 时长/距离输入框的字符串
 *   (input 的 value 必须是字符串, 数字会丢小数位且无法正常编辑)
 */
function buildSets(rawSets, countMode) {
  return (rawSets || []).map((s) => ({
    ...s,
    countMode: s.countMode || countMode || 'weight_reps',
    weightStr: formatNumberForInput(s.weight),
    durationStr: s.duration_sec != null ? String(s.duration_sec) : '',
    distanceStr: s.distance_km != null ? String(s.distance_km) : '',
  }));
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
      type: String,
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
          t: app.globalData.t || {},
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
      const newFav = wasFav
        ? favorExercises.filter(fid => fid !== id)
        : [...favorExercises, id];
      app.globalData.favorExercises = newFav;
      // cloud call
      api.callCloud('exercise.toggleFavorite', { exercise_id: id })
        .then((r) => {
          const list = r && r.result && r.result.favor_exercises;
          if (Array.isArray(list)) {
            app.applyExerciseFlags({ favor_exercises: list });
            this.setData({ favorExercises: list });
          }
        })
        .catch(() => {});
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
      const isWeight = mode === 'weight_reps';
      const w = isWeight ? (last?.weight || 0) : 0;
      const newSet = {
        id: Date.now(),
        weight: w,
        weightStr: formatNumberForInput(w),
        reps: isWeight ? (last?.reps || 0) : 0,
        weight_unit: last?.weight_unit || 'kg',
        // 计时/距离类的新 set 要带上对应的初值(否则存回去是 0/null)
        duration_sec: mode === 'duration' ? (last?.duration_sec || 0) : 0,
        durationStr: mode === 'duration' ? String(last?.duration_sec || 0) : '',
        distance_km: mode === 'distance_duration' ? (last?.distance_km || 0) : 0,
        distanceStr: mode === 'distance_duration' ? String(last?.distance_km || 0) : '',
        countMode: mode,
        sequence: this.data.sets.length,
      };
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
      this.updateSet(index, 'reps', s.reps + 1);
    },

    decReps(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      this.updateSet(index, 'reps', Math.max(1, s.reps - 1));
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
      const value = parseInt(e.detail.value) || 0;
      this.updateSet(index, 'reps', value);
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

          const original = group.sets.find(os => os.id === s.id);

          if (original && (original.weight !== s.weight || original.reps !== s.reps || original.weight_unit !== s.weight_unit)) {
            await api.callCloud('exercise.update', { id: s.id,
                session_id: this.data.sessionId,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
                // 计时/距离类的 set 要带上对应字段; 不适用时传 undefined,
                // JSON 序列化会省略该 key → 后端写 NULL(不会误清已有值)
                duration_sec: s.countMode === 'duration' ? s.duration_sec : undefined,
                distance_km: s.countMode === 'distance_duration' ? s.distance_km : undefined });
          }

          if (!original && s.id > Date.now() - 100000) {
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
          // DB records have small integer ids — always delete
          if (s.id < 1e12) return true;
          // Client-side temporary ids (Date.now()) — only delete if older than 100s
          return s.id <= Date.now() - 100000;
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
