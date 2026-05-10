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
  },

  data: {
    imgPrefix: '',
    exerciseList: [],
    loading: false,
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
        if (this.data.sessionId) {
          this._loadExercises();
        }
      }
    },
    'session': function(session) {
      if (session && this.data.isOpen && session.exercises) {
        this.setData({ exerciseList: session.exercises });
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
        name: 'exercise',
        data: {
          action: 'list',
          sessionId: this.data.sessionId,
          userId: app.globalData.userId,
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
  },
});
