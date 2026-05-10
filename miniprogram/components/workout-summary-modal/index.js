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
  },
});
