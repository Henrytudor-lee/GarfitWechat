// components/session-detail-modal/index.js
const app = getApp();
const api = require('../../utils/api.js');
const { setVolume } = require('../../utils/unit.js');
const { calcSetsCalories, rowVolumeKg } = require('../../utils/calories.js');

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    session: {
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
  },

  data: {
    imgPrefix: '',
    exerciseList: [],
    loading: false,
    _durationDisplay: '--:--',
    _dateDisplay: '',
    _calories: 0,
    totalSets: 0,
    t: app.globalData.t,  // 注入 i18n 字典
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
      }
    },
    'isOpen, sessionId': function(isOpen, sessionId) {
      if (isOpen && sessionId) {
        this._loadExercises();
      }
    },
    'session': function(session) {
      if (session && this.data.isOpen) {
        if (session.exercises) {
          this.setData({ exerciseList: session.exercises });
        }
        this.setData({ _calories: session.calories || 0 });
        this._computeDate(session);
        this._computeDuration(session);
      }
    },
    'exerciseList': function(list) {
      const total = (list || []).reduce(
        (acc, ex) => acc + (ex.sets ? ex.sets.length : 0),
        0
      );
      this.setData({ totalSets: total });
    },
  },

  methods: {
    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    closeModal() {
      this.setData({ exerciseList: [] });
      this.triggerEvent('close');
    },

    async _loadExercises() {
      if (!this.data.sessionId) return;

      this.setData({ loading: true });

      let res;
      try {
        res = await api.callCloud('exercise.list', { session_id: this.data.sessionId });
      } catch (err) {
        // 请求失败 → 保留现有列表, 不清空; loading 也要收掉(否则一直转圈)
        console.warn('[session-detail] _loadExercises failed:', err);
        this.setData({ loading: false });
        return;
      }

      this.setData({ loading: false });

      if (res.result && res.result.success) {
        const map = {};
        for (const ex of res.result.exercises) {
          if (!map[ex.exercise_id]) {
            map[ex.exercise_id] = {
              _id: ex._id,
              name_en: ex.name_en,
              name_zh: ex.name_zh || ex.name_en,
              image_name: ex.image_name,
              exercise_id: ex.exercise_id,
              sets: [],
              totalCalories: 0,
            };
          }
          // 计时类/距离类动作: weight=0 且 reps=0, 只有 duration_sec / distance_km
          // —— 必须放行, 否则平板支撑、跑步这类记录会整组不显示。
          const isDurationSet = Number(ex.duration_sec) > 0;
          const isDistanceSet = Number(ex.distance_km) > 0;
          if (ex.weight > 0 || ex.reps > 0 || isDurationSet || isDistanceSet) {
            map[ex.exercise_id].sets.push({
              id: ex.id || ex._id,
              weight: ex.weight,
              reps: ex.reps,
              weight_unit: ex.weight_unit || 'kg',
              duration_sec: isDurationSet ? Number(ex.duration_sec) : 0,
              distance_km: isDistanceSet ? Number(ex.distance_km) : 0,
              // 计量方式 —— 卡路里按这个分档算(见 utils/calories.js)
              countMode: ex.count_mode || 'weight_reps',
              volumeKg: rowVolumeKg(ex),
            });
          }
        }
        const userWeight = app.globalData.userWeight || 60;
        const list = Object.values(map).map(g => ({
          ...g,
          countMode: g.count_mode || 'weight_reps',
          // 卡路里 v1: 按组的计量方式算, 不再是整个 session 一个公式
          totalCalories: calcSetsCalories(g.sets, userWeight),
        }));
        this.setData({ exerciseList: list });
      }
    },

    _computeDate(session) {
      // Prefer a pre-formatted dateStr if backend provides one
      if (session.dateStr) {
        this.setData({ _dateDisplay: session.dateStr });
        return;
      }
      const raw = session.start_time;
      if (!raw) {
        this.setData({ _dateDisplay: '' });
        return;
      }
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        this.setData({ _dateDisplay: String(raw) });
        return;
      }
      const locale = this.data.locale || 'zh';
      const formatted = d.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      this.setData({ _dateDisplay: formatted });
    },

    _computeDuration(session) {
      // Use pre-formatted duration if available
      if (session.duration_formatted) {
        this.setData({ _durationDisplay: session.duration_formatted });
        return;
      }
      // Compute from duration field (seconds) — most reliable, format H:MM or MM:SS
      if (session.duration && session.duration > 0) {
        const totalSeconds = Math.floor(session.duration);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (n) => String(n).padStart(2, '0');
        const durationStr = hours > 0
          ? `${pad(hours)}:${pad(minutes)}`
          : `${pad(minutes)}:${pad(seconds)}`;
        this.setData({ _durationDisplay: durationStr });
        return;
      }
      // Fallback: compute from start_time and end_time, format H:MM or MM:SS
      if (session.start_time && session.end_time) {
        const start = new Date(session.start_time);
        const end = new Date(session.end_time);
        const diffMs = end - start;
        if (diffMs > 0) {
          const totalSeconds = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          const pad = (n) => String(n).padStart(2, '0');
          const durationStr = hours > 0
            ? `${pad(hours)}:${pad(minutes)}`
            : `${pad(minutes)}:${pad(seconds)}`;
          this.setData({ _durationDisplay: durationStr });
          return;
        }
      }
      this.setData({ _durationDisplay: '--:--' });
    },
  },
});
