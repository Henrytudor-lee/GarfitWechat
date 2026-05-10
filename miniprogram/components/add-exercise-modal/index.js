// components/add-exercise-modal/index.js
const app = getApp();

const EQUIPMENT_LIST = [
  { id: 1, name: 'Barbell' },
  { id: 2, name: 'Body weight' },
  { id: 3, name: 'Cable' },
  { id: 4, name: 'Dumbbell' },
  { id: 5, name: 'EZ Barbell' },
  { id: 6, name: 'Leverage machine' },
  { id: 7, name: 'Sled machine' },
  { id: 8, name: 'Smith machine' },
  { id: 9, name: 'Weighted' },
  { id: 10, name: 'Assisted' },
  { id: 11, name: 'Band' },
  { id: 12, name: 'Battling Rope' },
  { id: 13, name: 'Bosu ball' },
  { id: 14, name: 'Hammer' },
  { id: 15, name: 'Kettlebell' },
  { id: 16, name: 'Medicine Ball' },
  { id: 17, name: 'Olympic barbell' },
  { id: 18, name: 'Power Sled' },
  { id: 19, name: 'Resistance Band' },
  { id: 20, name: 'Roll' },
  { id: 21, name: 'Rollball' },
  { id: 22, name: 'Rope' },
  { id: 23, name: 'Stability ball' },
  { id: 24, name: 'Stick' },
  { id: 25, name: 'Suspension' },
  { id: 26, name: 'Trap bar' },
  { id: 27, name: 'Vibrate Plate' },
  { id: 28, name: 'Wheel roller' },
];

const MUSCLE_LIST = [
  { id: 1, name: 'Thighs' },
  { id: 2, name: 'Chest' },
  { id: 3, name: 'Hips' },
  { id: 4, name: 'Back' },
  { id: 5, name: 'Upper Arms' },
  { id: 6, name: 'Shoulders' },
  { id: 7, name: 'Forearms' },
  { id: 8, name: 'Calves' },
  { id: 9, name: 'Neck' },
  { id: 10, name: 'Cardio' },
  { id: 12, name: 'Waist' },
  { id: 17, name: 'Biceps' },
  { id: 18, name: 'Triceps' },
  { id: 19, name: 'Quadriceps' },
  { id: 20, name: 'Hamstrings' },
];

const BODY_PART_MAP = {
  '1': 'Thighs', '2': 'Chest', '3': 'Hips', '4': 'Back',
  '5': 'Upper Arms', '6': 'Shoulders', '7': 'Forearms', '8': 'Calves',
  '9': 'Neck', '10': 'Cardio', '12': 'Waist',
  '17': 'Biceps', '18': 'Triceps', '19': 'Quadriceps', '20': 'Hamstrings',
};
const EQUIP_MAP = {
  '1': 'Barbell', '2': 'Body weight', '3': 'Cable', '4': 'Dumbbell',
  '5': 'EZ Barbell', '6': 'Leverage machine', '7': 'Sled machine',
  '8': 'Smith machine', '9': 'Weighted', '10': 'Assisted',
  '11': 'Band', '12': 'Battling Rope', '13': 'Bosu ball', '14': 'Hammer',
  '15': 'Kettlebell', '16': 'Medicine Ball', '17': 'Olympic barbell',
  '18': 'Power Sled', '19': 'Resistance Band', '20': 'Roll',
  '21': 'Rollball', '22': 'Rope', '23': 'Stability ball', '24': 'Stick',
  '25': 'Suspension', '26': 'Trap bar', '27': 'Vibrate Plate', '28': 'Wheel roller',
};

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    sessionId: {
      type: String,
      value: null,
    },
    preselectedExercise: {
      type: Object,
      value: null,
    },
  },

  data: {
    step: 'pick', // 'pick' | 'set'
    selectedMuscleOpen: false,
    selectedMuscle: 0,
    selectedEquipment: 0,
    keyword: '',
    list: [],
    page: 1,
    pageSize: 30,
    hasMore: false,
    loading: false,
    loadingMore: false,
    imgPrefix: '',
    vidPrefix: '',
    equipmentList: EQUIPMENT_LIST,
    muscleList: MUSCLE_LIST,
    selectedItem: null,
    weight: 0,
    reps: 0,
    unit: 'kg',
    historyMax: null,
    submitting: false,
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        this._reset();
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          vidPrefix: app.globalData.videoPrefix || '',
        });
        this.loadList(true);

        // If preselected, go directly to set step
        if (this.data.preselectedExercise) {
          this._selectExercise(this.data.preselectedExercise);
        }
      }
    },
    'preselectedExercise': function(ex) {
      if (ex && this.data.isOpen) {
        this._selectExercise(ex);
      }
    },
  },

  methods: {
    _reset() {
      this.setData({
        step: 'pick',
        selectedMuscleOpen: false,
        selectedMuscle: 0,
        selectedEquipment: 0,
        keyword: '',
        list: [],
        page: 1,
        hasMore: false,
        loading: false,
        loadingMore: false,
        selectedItem: null,
        weight: 0,
        reps: 0,
        unit: 'kg',
        historyMax: null,
        submitting: false,
      });
    },

    closeModal() {
      this._reset();
      this.triggerEvent('close');
    },

    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    goBack() {
      this.setData({
        step: 'pick',
        selectedItem: null,
        weight: 0,
        reps: 0,
        historyMax: null,
      });
    },

    toggleMuscleMenu() {
      this.setData({ selectedMuscleOpen: !this.data.selectedMuscleOpen });
    },

    closeMuscleMenu() {
      this.setData({ selectedMuscleOpen: false });
    },

    selectMuscle(e) {
      const id = e.currentTarget.dataset.id;
      this.setData({ selectedMuscle: id, selectedMuscleOpen: false, page: 1, list: [] });
      this.loadList(true);
    },

    selectEquipment(e) {
      const id = e.currentTarget.dataset.id;
      if (id === this.data.selectedEquipment) return;
      this.setData({ selectedEquipment: id, page: 1, list: [] });
      this.loadList(true);
    },

    onSearchInput(e) {
      this.setData({ keyword: e.detail.value });
    },

    onSearch() {
      this.setData({ page: 1, list: [] });
      this.loadList(true);
    },

    async loadList(reset = false) {
      if (this.data.loading || this.data.loadingMore) return;

      const page = reset ? 1 : this.data.page;
      if (!reset && !this.data.hasMore) return;

      this.setData({ loading: reset, loadingMore: !reset });

      const { keyword, selectedEquipment, selectedMuscle } = this.data;

      const res = await wx.cloud.callFunction({
        name: 'exerciseLibrary',
        data: {
          action: 'list',
          keyword,
          equipmentId: selectedEquipment || '',
          bodyPart: selectedMuscle || '',
          page,
          pageSize: this.data.pageSize,
        },
      });

      this.setData({ loading: false, loadingMore: false });

      if (res.result && res.result.success) {
        const items = (res.result.list || []).map(item => ({
          ...item,
          equipment_name: EQUIP_MAP[String(item.equipment_id)] || 'Other',
          muscle_name: BODY_PART_MAP[String(item.body_part_id)] || '',
        }));

        this.setData({
          list: reset ? items : [...this.data.list, ...items],
          hasMore: items.length >= this.data.pageSize,
          page: page + 1,
        });
      }
    },

    loadMore() {
      if (this.data.hasMore) this.loadList(false);
    },

    onExerciseTap(e) {
      const item = e.currentTarget.dataset.item;
      this._selectExercise(item);
    },

    _selectExercise(item) {
      this.setData({ selectedItem: item, step: 'set', weight: 0, reps: 0 });
      this._loadHistoryMax(item);
    },

    async _loadHistoryMax(item) {
      const userId = app.globalData.userId;
      if (!userId || !item) return;

      try {
        const res = await wx.cloud.callFunction({
        name: 'exercise',
        data: {
          action: 'getMaxWeight',
          exerciseId: item._id || item.id,
          openid: app.globalData.openid,
        },
      });

        if (res.result && res.result.success && res.result.data) {
          const d = res.result.data;
          this.setData({
            historyMax: { weight: d.weight, reps: d.reps, unit: d.weight_unit || 'kg' },
            weight: d.weight,
            reps: d.reps || 0,
            unit: d.weight_unit || 'kg',
          });
        }
      } catch (err) {
        console.error('Failed to load history max', err);
      }
    },

    applyHistory() {
      const h = this.data.historyMax;
      if (h) {
        this.setData({ weight: h.weight, reps: h.reps });
      }
    },

    onWeightInput(e) {
      this.setData({ weight: Number(e.detail.value) || 0 });
    },

    onRepsInput(e) {
      this.setData({ reps: Number(e.detail.value) || 0 });
    },

    incWeight() {
      this.setData({ weight: this.data.weight + 2.5 });
    },

    decWeight() {
      this.setData({ weight: Math.max(0, this.data.weight - 2.5) });
    },

    incReps() {
      this.setData({ reps: this.data.reps + 1 });
    },

    decReps() {
      this.setData({ reps: Math.max(0, this.data.reps - 1) });
    },

    setUnit(e) {
      const u = e.currentTarget.dataset.unit;
      this.setData({ unit: u });
    },

    async confirmAdd() {
      const { selectedItem, weight, reps, unit, submitting } = this.data;
      if (!selectedItem || weight < 0 || reps <= 0 || submitting) return;

      this.setData({ submitting: true });

      try {
        const userId = app.globalData.userId;
        const sessionId = this.data.sessionId;

        const res = await wx.cloud.callFunction({
          name: 'exercise',
          data: {
            action: 'add',
            session_id: sessionId,
            openid: app.globalData.openid,
            exercise_id: selectedItem._id || selectedItem.id,
            name: selectedItem.name_zh || selectedItem.name,
            weight,
            reps,
            weight_unit: unit,
          },
        });

        if (res.result && res.result.success) {
          wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
          this.triggerEvent('exerciseadded');
          this.closeModal();
        } else {
          wx.showToast({ title: (res.result && res.result.error) || 'FAILED', icon: 'none' });
        }
      } catch (err) {
        console.error('Failed to add exercise', err);
        wx.showToast({ title: 'FAILED', icon: 'none' });
      } finally {
        this.setData({ submitting: false });
      }
    },
  },
});
