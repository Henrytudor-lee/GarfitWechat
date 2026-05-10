// components/add-exercise-modal/index.js
const app = getApp();

const EQUIPMENT_LIST = [
  { id: 1, name: 'Barbell' },
  { id: 2, name: 'Dumbbell' },
  { id: 3, name: 'Machine' },
  { id: 4, name: 'Cable' },
  { id: 5, name: 'Bodyweight' },
  { id: 6, name: 'Kettlebell' },
  { id: 7, name: 'Band' },
  { id: 8, name: 'Other' },
];

const MUSCLE_LIST = [
  { id: 1, name: 'Chest' },
  { id: 2, name: 'Back' },
  { id: 3, name: 'Shoulders' },
  { id: 4, name: 'Arms' },
  { id: 5, name: 'Legs' },
  { id: 6, name: 'Core' },
  { id: 7, name: 'Full Body' },
  { id: 8, name: 'Cardio' },
];

const BODY_PART_MAP = {
  '1': 'Chest', '2': 'Back', '3': 'Shoulders',
  '4': 'Arms', '5': 'Legs', '6': 'Core', '7': 'Full Body', '8': 'Cardio',
};
const EQUIP_MAP = {
  '1': 'Barbell', '2': 'Dumbbell', '3': 'Machine',
  '4': 'Cable', '5': 'Bodyweight', '6': 'Kettlebell', '7': 'Band', '8': 'Other',
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
            userId,
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
            sessionId,
            userId,
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
