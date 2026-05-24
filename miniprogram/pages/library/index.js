// pages/library/index.js — garcia-fitness-new style
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

// 部位ID到名称的映射（与原项目 constants.ts 一致）
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
const BODY_PART_MAP = {
  '1': 'Thighs', '2': 'Chest', '3': 'Hips', '4': 'Back',
  '5': 'Upper Arms', '6': 'Shoulders', '7': 'Forearms', '8': 'Calves',
  '9': 'Neck', '10': 'Cardio', '12': 'Waist',
  '17': 'Biceps', '18': 'Triceps', '19': 'Quadriceps', '20': 'Hamstrings',
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
    favorExercises: [],
    practicedExercises: [],
    filterFavor: false,
    filterPracticed: false,
    // i18n + theme
    locale: 'en',
    theme: 'night',
  },

  onLoad(opts) {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      vidPrefix: app.globalData.videoPrefix,
      isSelectMode: opts.select === 'true',
      locale: app.globalData.language || 'en',
      theme: app.globalData.theme || 'night',
    });
    this._loadUserExercises();
    this.loadList(true);
  },

  onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'en';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }
  },

  async _loadUserExercises() {
    if (!app.globalData.openid) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'exercise',
        data: { action: 'getUserExercises', openid: app.globalData.openid },
      });
      if (res.result && res.result.success) {
        this.setData({
          favorExercises: res.result.favor_exercises || [],
          practicedExercises: res.result.practiced_exercises || [],
        });
      }
    } catch (err) {
      console.error('_loadUserExercises failed', err);
    }
  },

  async loadList(reset = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const page = reset ? 1 : this.data.page;
    const { keyword, selectedEquipment, selectedMuscle, filterFavor, filterPracticed, favorExercises, practicedExercises } = this.data;

    const res = await wx.cloud.callFunction({
      name: 'exerciseLibrary',
      data: {
        action: 'list',
        keyword,
        equipmentId: selectedEquipment || '',
        bodyPart: selectedMuscle || '',
        page,
        pageSize: this.data.pageSize,
        isFavor: filterFavor,
        isPracticed: filterPracticed,
        favorExerIds: favorExercises,
        practicedExerIds: practicedExercises,
      },
    });

    this.setData({ loading: false });

    if (res.result && res.result.success) {
      const { favorExercises, practicedExercises } = this.data;
      let items = (res.result.list || []).map(item => {
        const id = item.id;
        return {
          ...item,
          equipment_name: EQUIP_MAP[String(item.equipment_id)] || 'Other',
          equipment_icon: EQUIP_ICON_MAP[String(item.equipment_id)] || '',
          muscle_name: BODY_PART_MAP[String(item.body_part_id)] || '',
          is_favorite: favorExercises.includes(id),
          is_practiced: practicedExercises.includes(id),
        };
      });

      // Sort: practiced first, then favorited, then rest
      const sorted = items.sort((a, b) => {
        if (b.is_practiced !== a.is_practiced) return b.is_practiced ? 1 : -1;
        if (b.is_favorite !== a.is_favorite) return b.is_favorite ? 1 : -1;
        return 0;
      });

      this.setData({
        list: reset ? sorted : [...this.data.list, ...sorted],
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

  onFavorFilterTap() {
    const newVal = !this.data.filterFavor;
    this.setData({ filterFavor: newVal, page: 1, list: [] });
    this.loadList(true);
  },

  onPracticedFilterTap() {
    const newVal = !this.data.filterPracticed;
    this.setData({ filterPracticed: newVal, page: 1, list: [] });
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
      this.setData({ selectedExercise: null }); // 清理，防止 navigateBack 失败时 sheet 卡住
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

  noop() {},

  onFavoriteTap(e) {
    const id = e.currentTarget.dataset.id;
    const { favorExercises } = this.data;
    const isFav = favorExercises.includes(id);

    // Optimistic update
    const newFav = isFav ? favorExercises.filter(fid => fid !== id) : [...favorExercises, id];
    this.setData({ favorExercises: newFav });

    const list = this.data.list.map(item => {
      if (item.id === id) return { ...item, is_favorite: !isFav };
      return item;
    });
    this.setData({ list });

    wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'toggleFavorite',
        exercise_id: id,
        openid: app.globalData.openid,
      },
    });
  },

  onVideoTap(e) {
    // 阻止事件冒泡到 sheet 和 mask，不关闭弹框
    e.stopPropagation();
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
        exercise_id: item.id,
        name_zh: item.name_zh || item.name,
        name_en: item.name || null,
        image_name: item.image_name || null,
        video_name: item.video_name || null,
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
