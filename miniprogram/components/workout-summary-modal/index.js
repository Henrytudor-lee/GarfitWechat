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
    _stats: { exerciseCount: 0, durationStr: '--', totalVolume: 0 },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
        this._computeStats();
      }
    },
    'session': function() { this._computeStats(); },
    'exerciseList': function() { this._computeStats(); },
  },

  methods: {
    _computeStats() {
      const list = this.data.exerciseList || [];
      const s = this.data.session;
      const exerciseCount = list.reduce((acc, ex) => acc + (ex.sets ? ex.sets.length : 0), 0);
      const durationStr = s ? formatDuration(s.duration || s.elapsedSeconds || 0) : '--';
      let totalVolume = 0;
      for (const ex of list) {
        if (ex.sets) {
          for (const st of ex.sets) {
            totalVolume += (st.weight || 0) * (st.reps || 0);
          }
        }
      }
      this.setData({ _stats: { exerciseCount, durationStr, totalVolume } });
    },

    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    closeModal() {
      this.triggerEvent('close');
    },

    getExerciseCount() { 
      this.data._stats.exerciseCount;
      return this.data._stats.exerciseCount; },
    getDurationStr() { return this.data._stats.durationStr; },
    getTotalVolume() { return this.data._stats.totalVolume; },

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