// components/session-detail-modal/index.js
const app = getApp();
const { toKg } = require('../../utils/unit.js');

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
    totalSets: 0,
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

      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'exercise.list',
          session_id: this.data.sessionId,
          openid: app.globalData.openid,
        },
      });

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
              totalVolume: 0,
            };
          }
          if (ex.weight > 0 || ex.reps > 0) {
            map[ex.exercise_id].sets.push({
              id: ex.id || ex._id,
              weight: ex.weight,
              reps: ex.reps,
              weight_unit: ex.weight_unit || 'kg',
            });
            map[ex.exercise_id].totalVolume += toKg(ex.weight, ex.weight_unit) * (Number(ex.reps) || 0);
          }
        }
        this.setData({ exerciseList: Object.values(map) });
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
