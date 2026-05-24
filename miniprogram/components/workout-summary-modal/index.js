// components/workout-summary-modal/index.js
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
    _stats: {
      exerciseCount: 0,
      durationStr: '0 min',
      totalVolume: 0,
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
      }
    },
    'isOpen, session': function(isOpen, session) {
      if (isOpen && session) {
        this._computeStats(session);
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
      this.triggerEvent('close');
    },

    _computeStats(session) {
      const exerciseList = session.exercises || [];
      const durationMs = session.duration || 0;
      const totalMinutes = Math.round(durationMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

      let totalVolume = 0;
      for (const ex of exerciseList) {
        if (ex.sets) {
          for (const s of ex.sets) {
            totalVolume += (s.weight || 0) * (s.reps || 0);
          }
        }
      }

      this.setData({
        exerciseList,
        _stats: {
          exerciseCount: exerciseList.length,
          durationStr,
          totalVolume: Math.round(totalVolume),
        },
      });
    },

    getGroupVolume(item) {
      if (!item || !item.sets) return 0;
      let vol = 0;
      for (const s of item.sets) {
        vol += (s.weight || 0) * (s.reps || 0);
      }
      return Math.round(vol);
    },

    getDateStr() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    },
  },
});
