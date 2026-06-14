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
        const sets = this.data.group.sets.map(s => ({ ...s }));
        // 同步 favor 状态
        const favorExercises = app.globalData.favorExercises || [];
        const isFavorite = favorExercises.includes(this.data.group.exercise_id);
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          locale: app.globalData.language || 'zh',
          t: app.globalData.t || {},
          sets,
          activeSetsCount: sets.filter(s => !s.deleted).length,
          isFavorite,
        });
      }
    },
    'group': function(group) {
      if (group && this.data.isOpen) {
        const sets = group.sets.map(s => ({ ...s }));
        const favorExercises = app.globalData.favorExercises || [];
        const isFavorite = favorExercises.includes(group.exercise_id);
        this.setData({
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
      wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'exercise.toggleFavorite',
          exercise_id: id,
          openid: app.globalData.openid,
        },
      });
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
      const newSet = {
        id: Date.now(),
        weight: last?.weight || 0,
        reps: last?.reps || 0,
        weight_unit: last?.weight_unit || 'kg',
        sequence: this.data.sets.length,
      };
      const sets = [...this.data.sets, newSet];
      this.setData({ sets, activeSetsCount: sets.filter(s => !s.deleted).length });
    },

    incWeight(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      this.updateSet(index, 'weight', s.weight + 2.5);
    },

    decWeight(e) {
      const index = e.currentTarget.dataset.index;
      const s = this.data.sets[index];
      this.updateSet(index, 'weight', Math.max(0, s.weight - 2.5));
    },

    onWeightInput(e) {
      const index = e.currentTarget.dataset.index;
      const value = parseFloat(e.detail.value) || 0;
      this.updateSet(index, 'weight', value);
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

        for (let i = 0; i < sets.length; i++) {
          const s = sets[i];
          if (s.deleted) continue;

          const original = group.sets.find(os => os.id === s.id);

          if (original && (original.weight !== s.weight || original.reps !== s.reps || original.weight_unit !== s.weight_unit)) {
            await wx.cloud.callFunction({
              name: 'api',
              data: {
                action: 'exercise.update',
                id: s.id,
                session_id: this.data.sessionId,
                openid: app.globalData.openid,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
              },
            });
          }

          if (!original && s.id > Date.now() - 100000) {
            await wx.cloud.callFunction({
              name: 'api',
              data: {
                action: 'exercise.add',
                session_id: this.data.sessionId,
                openid: app.globalData.openid,
                exercise_id: group.exercise_id,
                name_zh: group.name_zh,
                name_en: group.name_en || null,
                image_name: group.image_name || null,
                video_name: group.video_name || null,
                weight: s.weight,
                reps: s.reps,
                weight_unit: s.weight_unit,
              },
            });
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
          await wx.cloud.callFunction({
            name: 'api',
            data: {
              action: 'exercise.delete',
              id: s.id,
              session_id: this.data.sessionId,
              openid: app.globalData.openid,
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