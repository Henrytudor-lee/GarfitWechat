// components/workout-summary-modal/index.js
const app = getApp();

const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
};

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
    exerciseList: {
      type: Array,
      value: [],
    },
  },

  data: {
    imgPrefix: '',
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
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

    getTotalSets() {
      return this.data.exerciseList.reduce((acc, ex) => acc + (ex.sets ? ex.sets.length : 0), 0);
    },

    getTotalReps() {
      let total = 0;
      for (const ex of this.data.exerciseList) {
        if (ex.sets) {
          for (const s of ex.sets) {
            total += s.reps || 0;
          }
        }
      }
      return total;
    },

    getTotalVolume() {
      let total = 0;
      for (const ex of this.data.exerciseList) {
        if (ex.sets) {
          for (const s of ex.sets) {
            total += (s.weight || 0) * (s.reps || 0);
          }
        }
      }
      return total.toFixed(0);
    },

    getExerciseCount() {
      return this.data.exerciseList.length;
    },

    getDurationStr() {
      const s = this.data.session;
      if (!s) return '--';
      const duration = s.duration || s.elapsedSeconds || 0;
      return formatDuration(duration);
    },

    getDateStr() {
      const s = this.data.session;
      if (!s) return '';
      const d = new Date(s.start_time || s.created_at);
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    getGroupVolume(group) {
      if (!group.sets) return 0;
      return group.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
    },
  },
});
