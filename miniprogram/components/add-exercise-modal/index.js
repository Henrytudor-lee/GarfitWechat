// components/add-exercise-modal/index.js
const app = getApp();

const EQUIPMENT_LIST = [
  { id: 1,  name: 'Barbell',         icon: 'barbell.png' },
  { id: 2,  name: 'Body weight',     icon: 'bodyweight.png' },
  { id: 3,  name: 'Cable',           icon: 'cable.png' },
  { id: 4,  name: 'Dumbbell',        icon: 'dumbell.png' },
  { id: 5,  name: 'EZ Barbell',      icon: 'ez_barbell.png' },
  { id: 6,  name: 'Leverage machine',icon: 'leverage_machine.png' },
  { id: 7,  name: 'Sled machine',    icon: 'sled_machine.png' },
  { id: 8,  name: 'Smith machine',    icon: 'smith_machine.png' },
  { id: 9,  name: 'Weighted',        icon: 'weighted.png' },
  { id: 10, name: 'Assisted',        icon: 'A.png' },
  { id: 11, name: 'Band',            icon: 'band.png' },
  { id: 12, name: 'Battling Rope',   icon: 'battling_rope.png' },
  { id: 13, name: 'Bosu ball',       icon: 'bosu_ball.png' },
  { id: 14, name: 'Hammer',          icon: 'H.png' },
  { id: 15, name: 'Kettlebell',      icon: 'kettlebell.png' },
  { id: 16, name: 'Medicine Ball',   icon: 'medicine_ball.png' },
  { id: 17, name: 'Olympic barbell', icon: 'barbell.png' },
  { id: 18, name: 'Power Sled',     icon: 'power_sled.png' },
  { id: 19, name: 'Resistance Band', icon: 'resistance_band.png' },
  { id: 20, name: 'Roll',           icon: 'roll.png' },
  { id: 21, name: 'Rollball',       icon: 'rollball.png' },
  { id: 22, name: 'Rope',           icon: 'rope.png' },
  { id: 23, name: 'Stability ball',  icon: 'stability_ball.png' },
  { id: 24, name: 'Stick',          icon: 'ST.png' },
  { id: 25, name: 'Suspension',     icon: 'suspension.png' },
  { id: 26, name: 'Trap bar',       icon: 'trap_bar.png' },
  { id: 27, name: 'Vibrate Plate',  icon: 'VP.png' },
  { id: 28, name: 'Wheel roller',   icon: 'wheel_roller.png' },
];

const MUSCLE_LIST = [
  { id: 1,  name: 'Thighs',      icon: 'quadriceps.png' },
  { id: 2,  name: 'Chest',        icon: 'chest.png' },
  { id: 3,  name: 'Hips',         icon: 'hips.png' },
  { id: 4,  name: 'Back',         icon: 'back.png' },
  { id: 5,  name: 'Upper Arms',   icon: 'shoulders.png' },
  { id: 6,  name: 'Shoulders',    icon: 'shoulders.png' },
  { id: 7,  name: 'Forearms',     icon: 'forearms.png' },
  { id: 8,  name: 'Calves',       icon: 'calves.png' },
  { id: 9,  name: 'Neck',          icon: 'neck.png' },
  { id: 10, name: 'Cardio',       icon: 'cardio.png' },
  { id: 12, name: 'Waist',        icon: 'waist.png' },
  { id: 17, name: 'Biceps',       icon: 'biceps.png' },
  { id: 18, name: 'Triceps',       icon: 'triceps.png' },
  { id: 19, name: 'Quadriceps',    icon: 'quadriceps.png' },
  { id: 20, name: 'Hamstrings',    icon: 'hamstrings.png' },
];

const BODY_PART_MAP = {
  '1': 'Thighs', '2': 'Chest', '3': 'Hips', '4': 'Back',
  '5': 'Upper Arms', '6': 'Shoulders', '7': 'Forearms', '8': 'Calves',
  '9': 'Neck', '10': 'Cardio', '12': 'Waist',
  '17': 'Biceps', '18': 'Triceps', '19': 'Quadriceps', '20': 'Hamstrings',
};
const MUSCLE_ICON_MAP = {
  '1': 'quadriceps.png', '2': 'chest.png', '3': 'hips.png', '4': 'back.png',
  '5': 'shoulders.png', '6': 'shoulders.png', '7': 'forearms.png', '8': 'calves.png',
  '9': 'neck.png', '10': 'cardio.png', '12': 'waist.png',
  '17': 'biceps.png', '18': 'triceps.png', '19': 'quadriceps.png', '20': 'hamstrings.png',
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
const EQUIP_ICON_MAP = {
  '1': 'barbell.png', '2': 'bodyweight.png', '3': 'cable.png', '4': 'dumbell.png',
  '5': 'ez_barbell.png', '6': 'leverage_machine.png', '7': 'sled_machine.png',
  '8': 'smith_machine.png', '9': 'weighted.png', '10': 'A.png',
  '11': 'band.png', '12': 'battling_rope.png', '13': 'bosu_ball.png', '14': 'H.png',
  '15': 'kettlebell.png', '16': 'medicine_ball.png', '17': 'barbell.png',
  '18': 'power_sled.png', '19': 'resistance_band.png', '20': 'roll.png',
  '21': 'rollball.png', '22': 'rope.png', '23': 'stability_ball.png', '24': 'ST.png',
  '25': 'suspension.png', '26': 'trap_bar.png', '27': 'VP.png', '28': 'wheel_roller.png',
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
    weight_unit: 'kg',
    historyMax: null,
    submitting: false,
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const imgPrefix = app.globalData.imagePrefix || '';
        const vidPrefix = app.globalData.videoPrefix || '';
        this._reset(imgPrefix, vidPrefix);
        if (!this._listLoaded) {
          this._listLoaded = true;
          this.loadList(true);
        }

        // If preselected, go directly to set step
        if (this.data.preselectedExercise) {
          this._selectExercise(this.data.preselectedExercise);
        }
      } else {
        this._listLoaded = false;
      }
    },
    'preselectedExercise': function(ex) {
      if (ex && this.data.isOpen) {
        this._selectExercise(ex);
      }
    },
  },

  methods: {
    _reset(imgPrefix, vidPrefix) {
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
        weight_unit: 'kg',
        historyMax: null,
        submitting: false,
        imgPrefix: imgPrefix || '',
        vidPrefix: vidPrefix || '',
        muscleIcon: imgPrefix ? `${imgPrefix}/icons/all.png` : '',
        muscleLabel: 'Muscles',
      });
    },

    closeModal() {
      this._reset(this.data.imgPrefix, this.data.vidPrefix);
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
      const muscleItem = MUSCLE_LIST.find(m => m.id === id);
      const imgPrefix = app.globalData.imagePrefix || '';
      this.setData({
        selectedMuscle: id,
        selectedMuscleOpen: false,
        page: 1,
        list: [],
        muscleIcon: id === 0 ? `${imgPrefix}/icons/all.png` : (muscleItem ? `${imgPrefix}/body-icons/${muscleItem.icon}` : ''),
        muscleLabel: id === 0 ? 'Muscles' : (muscleItem ? muscleItem.name : ''),
      });
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
          equipment_icon: EQUIP_ICON_MAP[String(item.equipment_id)] || '',
          muscle_name: BODY_PART_MAP[String(item.body_part_id)] || '',
          muscle_icon: MUSCLE_ICON_MAP[String(item.body_part_id)] || '',
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
            historyMax: { weight: d.weight, reps: d.reps, weight_unit: d.weight_unit || 'kg' },
            weight: d.weight,
            reps: d.reps || 0,
            weight_unit: d.weight_unit || 'kg',
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
      const u = e.currentTarget.dataset.weight_unit;
      this.setData({ weight_unit: u });
    },

    async confirmAdd() {
      const { selectedItem, weight, reps, weight_unit, submitting } = this.data;
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
            name_zh: selectedItem.name_zh || selectedItem.name,
            name_en: selectedItem.name || null,
            image_name: selectedItem.image_name || null,
            video_name: selectedItem.video_name || null,
            weight,
            reps,
            weight_unit: weight_unit,
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
