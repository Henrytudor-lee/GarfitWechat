// components/session-detail-modal/index.js
const app = getApp();

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
        this._computeDuration(session);
      }
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
              name: ex.name,
              name_zh: ex.name_zh || ex.name,
              image_name: ex.image_name,
              exercise_id: ex.exercise_id,
              sets: [],
            };
          }
          if (ex.weight > 0 || ex.reps > 0) {
            map[ex.exercise_id].sets.push({
              id: ex.id || ex._id,
              weight: ex.weight,
              reps: ex.reps,
              weight_unit: ex.weight_unit || 'kg',
            });
          }
        }
        const list = Object.values(map);
        this.setData({ exerciseList: list });
      }
    },

    getTotalSets(list) {
      return list.reduce((acc, ex) => acc + (ex.sets ? ex.sets.length : 0), 0);
    },

    getTotalWeight(list) {
      let total = 0;
      for (const ex of list) {
        if (ex.sets) {
          for (const s of ex.sets) {
            total += (s.weight || 0) * (s.reps || 0);
          }
        }
      }
      return total.toFixed(0);
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
        const pad = (n) => String(n).padStart(2, '0');
        const durationStr = hours > 0
          ? `${pad(hours)}:${pad(minutes)}`
          : `${pad(minutes)}:${pad(0)}`;
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
          const pad = (n) => String(n).padStart(2, '0');
          const durationStr = hours > 0
            ? `${pad(hours)}:${pad(minutes)}`
            : `${pad(minutes)}:${pad(0)}`;
          this.setData({ _durationDisplay: durationStr });
          return;
        }
      }
      this.setData({ _durationDisplay: '--:--' });
    },
  },
});
