// components/edit-exercise-modal/index.js
const app = getApp();

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
  },

  data: {
    sets: [],
    saving: false,
    imgPrefix: '',
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen && this.data.group) {
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          sets: this.data.group.sets.map(s => ({ ...s })),
        });
      }
    },
    'group': function(group) {
      if (group && this.data.isOpen) {
        this.setData({
          sets: group.sets.map(s => ({ ...s })),
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

    closeModal() {
      this.setData({ sets: [] });
      this.triggerEvent('close');
    },

    updateSet(index, field, value) {
      const sets = [...this.data.sets];
      sets[index] = { ...sets[index], [field]: value };
      this.setData({ sets });
    },

    deleteSet(index) {
      const sets = [...this.data.sets];
      sets[index] = { ...sets[index], _deleted: true };
      this.setData({ sets });
    },

    addSet() {
      const last = this.data.sets[this.data.sets.length - 1];
      const newSet = {
        id: Date.now(),
        weight: last?.weight || 20,
        reps: last?.reps || 10,
        weight_unit: last?.weight_unit || 'kg',
        sequence: this.data.sets.length,
      };
      this.setData({ sets: [...this.data.sets, newSet] });
    },

    incWeight(index) {
      const s = this.data.sets[index];
      this.updateSet(index, 'weight', s.weight + 2.5);
    },

    decWeight(index) {
      const s = this.data.sets[index];
      this.updateSet(index, 'weight', Math.max(0, s.weight - 2.5));
    },

    onWeightInput(e) {
      const index = e.currentTarget.dataset.index;
      const value = parseFloat(e.detail.value) || 0;
      this.updateSet(index, 'weight', value);
    },

    incReps(index) {
      const s = this.data.sets[index];
      this.updateSet(index, 'reps', s.reps + 1);
    },

    decReps(index) {
      const s = this.data.sets[index];
      this.updateSet(index, 'reps', Math.max(1, s.reps - 1));
    },

    onRepsInput(e) {
      const index = e.currentTarget.dataset.index;
      const value = parseInt(e.detail.value) || 0;
      this.updateSet(index, 'reps', value);
    },

    setUnit(e) {
      const index = e.currentTarget.dataset.index;
      const unit = e.currentTarget.dataset.unit;
      this.updateSet(index, 'weight_unit', unit);
    },

    async saveAll() {
      if (!this.data.sessionId || this.data.saving) return;

      this.setData({ saving: true });

      try {
        const { group, sets } = this.data;

        for (let i = 0; i < sets.length; i++) {
          const s = sets[i];
          if (s._deleted) continue;

          const original = group.sets.find(os => os.id === s.id);

          if (original && (original.weight !== s.weight || original.reps !== s.reps || original.weight_unit !== s.weight_unit)) {
            await wx.cloud.callFunction({
              name: 'exercise',
              data: {
                action: 'update',
                id: s.id,
                session_id: this.data.sessionId,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
              },
            });
          }

          if (!original && s.id > Date.now() - 100000) {
            await wx.cloud.callFunction({
              name: 'exercise',
              data: {
                action: 'add',
                session_id: this.data.sessionId,
                exercise_id: group.exercise_id,
                name: group.name,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
              },
            });
          }
        }

        const toDelete = sets.filter(s => s._deleted && s.id <= Date.now() - 100000);
        for (const s of toDelete) {
          await wx.cloud.callFunction({
            name: 'exercise',
            data: {
              action: 'delete',
              id: s.id,
              session_id: this.data.sessionId,
            },
          });
        }

        this.triggerEvent('saved');
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