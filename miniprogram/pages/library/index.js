// pages/library/index.js — garcia-fitness-new style
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

// 部位ID到名称的映射
const BODY_PART_MAP = {
  '1': 'Chest', '2': 'Back', '3': 'Shoulders',
  '4': 'Arms', '5': 'Legs', '6': 'Core', '7': 'Full Body', '8': 'Cardio',
};
const EQUIP_MAP = {
  '1': 'Barbell', '2': 'Dumbbell', '3': 'Machine',
  '4': 'Cable', '5': 'Bodyweight', '6': 'Kettlebell', '7': 'Band', '8': 'Other',
};

Page({
  data: {
    keyword: '',
    selectedEquipment: null,
    selectedMuscle: null,
    equipmentList: EQUIPMENT_LIST,
    muscleList: MUSCLE_LIST,
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
    imgPrefix: '',
    vidPrefix: '',
    selectedExercise: null,
    isSelectMode: false,
  },

  onLoad(opts) {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      vidPrefix: app.globalData.videoPrefix,
      isSelectMode: opts.select === 'true',
    });
    this.loadList(true);
  },

  async loadList(reset = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const page = reset ? 1 : this.data.page;
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

    this.setData({ loading: false });

    if (res.result && res.result.success) {
      let items = (res.result.list || []).map(item => ({
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

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.setData({ page: 1, list: [] });
    this.loadList(true);
  },

  onEquipmentTap(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedEquipment) return;
    this.setData({ selectedEquipment: id, page: 1, list: [] });
    this.loadList(true);
  },

  onMuscleTap(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.selectedMuscle) return;
    this.setData({ selectedMuscle: id, page: 1, list: [] });
    this.loadList(true);
  },

  loadMore() {
    if (this.data.hasMore) this.loadList(false);
  },

  onExerciseTap(e) {
    const item = e.currentTarget.dataset.item;
    if (this.data.isSelectMode) {
      // Return selected exercise to previous page
      const pages = getCurrentPages();
      const prev = pages[pages.length - 2];
      if (prev) prev.setData({ chosenExercise: item });
      wx.navigateBack();
    } else {
      // Open detail sheet
      this.setData({ selectedExercise: item });
    }
  },

  openDetail(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({ selectedExercise: item });
  },

  closeSheet() {
    this.setData({ selectedExercise: null });
  },

  async addToWorkout(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({ selectedExercise: null });

    // Check if session running
    const app = getApp();
    const userId = app.globalData.userId;
    if (!userId) return;

    const runRes = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'getRunning', openid: app.globalData.openid },
    });

    let sessionId;
    if (!runRes.result || !runRes.result.session) {
      // Start session first
      const createRes = await wx.cloud.callFunction({
        name: 'session',
        data: { action: 'create', openid: app.globalData.openid },
      });
      if (!createRes.result || !createRes.result.success) return;
      sessionId = (createRes.result && (createRes.result.sessionId || (createRes.result.session && createRes.result.session._id)));
    } else {
      sessionId = runRes.result.session._id;
    }

    // Save exercise to session
    await wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'add',
        session_id: sessionId,
        openid: app.globalData.openid,
        exercise_id: item._id,
        name: item.name_zh || item.name,
        weight: 0,
        reps: 0,
      },
    });

    wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
  },

  doSelect(e) {
    const item = e.currentTarget.dataset.item;
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev) prev.setData({ chosenExercise: item });
    this.setData({ selectedExercise: null });
    wx.navigateBack();
  },
});
