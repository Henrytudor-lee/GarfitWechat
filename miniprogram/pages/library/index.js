// pages/library/index.js — garcia-fitness-new style
const app = getApp();

const EQUIPMENT_LIST = [
  { id: 1,  name: 'Barbell',         name_zh: '杠铃',        icon: 'barbell.png' },
  { id: 2,  name: 'Body weight',     name_zh: '自重',        icon: 'bodyweight.png' },
  { id: 3,  name: 'Cable',           name_zh: '钢索',        icon: 'cable.png' },
  { id: 4,  name: 'Dumbbell',        name_zh: '哑铃',        icon: 'dumbell.png' },
  { id: 5,  name: 'EZ Barbell',      name_zh: 'EZ杠铃',     icon: 'ez_barbell.png' },
  { id: 6,  name: 'Leverage machine',name_zh: '器械',        icon: 'leverage_machine.png' },
  { id: 7,  name: 'Sled machine',    name_zh: '雪橇机',      icon: 'sled_machine.png' },
  { id: 8,  name: 'Smith machine',   name_zh: '史密斯机',   icon: 'smith_machine.png' },
  { id: 9,  name: 'Weighted',        name_zh: '负重',        icon: 'weighted.png' },
  { id: 10, name: 'Assisted',        name_zh: '辅助',         icon: 'A.png' },
  { id: 11, name: 'Band',            name_zh: '弹力带',       icon: 'band.png' },
  { id: 12, name: 'Battling Rope',   name_zh: '战绳',        icon: 'battling_rope.png' },
  { id: 13, name: 'Bosu ball',       name_zh: 'Bosu球',      icon: 'bosu_ball.png' },
  { id: 14, name: 'Hammer',          name_zh: '锤式',         icon: 'H.png' },
  { id: 15, name: 'Kettlebell',      name_zh: '壶铃',         icon: 'kettlebell.png' },
  { id: 16, name: 'Medicine Ball',   name_zh: '药球',         icon: 'medicine_ball.png' },
  { id: 17, name: 'Olympic barbell', name_zh: '奥林匹克杠铃',icon: 'barbell.png' },
  { id: 18, name: 'Power Sled',      name_zh: '动力雪橇',    icon: 'power_sled.png' },
  { id: 19, name: 'Resistance Band',name_zh: '阻力带',      icon: 'resistance_band.png' },
  { id: 20, name: 'Roll',            name_zh: '滚轮',         icon: 'roll.png' },
  { id: 21, name: 'Rollball',        name_zh: '滚球',         icon: 'rollball.png' },
  { id: 22, name: 'Rope',            name_zh: '绳索',         icon: 'rope.png' },
  { id: 23, name: 'Stability ball',  name_zh: '稳定球',      icon: 'stability_ball.png' },
  { id: 24, name: 'Stick',           name_zh: '短棍',         icon: 'ST.png' },
  { id: 25, name: 'Suspension',      name_zh: '悬吊',         icon: 'suspension.png' },
  { id: 26, name: 'Trap bar',        name_zh: 'Trap bar',     icon: 'trap_bar.png' },
  { id: 27, name: 'Vibrate Plate',   name_zh: '震动板',      icon: 'VP.png' },
  { id: 28, name: 'Wheel roller',    name_zh: '轮滑滚筒',    icon: 'wheel_roller.png' },
];

const MUSCLE_LIST = [
  { id: 1,  name: 'Thighs',      name_zh: '大腿',        icon: 'quadriceps.png' },
  { id: 2,  name: 'Chest',       name_zh: '胸部',        icon: 'chest.png' },
  { id: 3,  name: 'Hips',        name_zh: '髋部',         icon: 'hips.png' },
  { id: 4,  name: 'Back',        name_zh: '背部',         icon: 'back.png' },
  { id: 5,  name: 'Upper Arms',  name_zh: '上臂',         icon: 'shoulders.png' },
  { id: 6,  name: 'Shoulders',   name_zh: '肩膀',         icon: 'shoulders.png' },
  { id: 7,  name: 'Forearms',    name_zh: '前臂',         icon: 'forearms.png' },
  { id: 8,  name: 'Calves',      name_zh: '小腿',         icon: 'calves.png' },
  { id: 9,  name: 'Neck',        name_zh: '颈部',          icon: 'neck.png' },
  { id: 10, name: 'Cardio',      name_zh: '有氧',          icon: 'cardio.png' },
  { id: 12, name: 'Waist',       name_zh: '腰部',         icon: 'waist.png' },
  { id: 17, name: 'Biceps',      name_zh: '肱二头肌',     icon: 'biceps.png' },
  { id: 18, name: 'Triceps',     name_zh: '肱三头肌',     icon: 'triceps.png' },
  { id: 19, name: 'Quadriceps',   name_zh: '股四头肌',     icon: 'quadriceps.png' },
  { id: 20, name: 'Hamstrings',  name_zh: '腘绳肌',       icon: 'hamstrings.png' },
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
const EQUIP_MAP_ZH = {
  '1': '杠铃', '2': '自重', '3': '钢索', '4': '哑铃',
  '5': 'EZ杠铃', '6': '器械', '7': '雪橇机',
  '8': '史密斯机', '9': '负重', '10': '辅助',
  '11': '弹力带', '12': '战绳', '13': 'Bosu球', '14': '锤式',
  '15': '壶铃', '16': '药球', '17': '奥林匹克杠铃',
  '18': '动力雪橇', '19': '阻力带', '20': '滚轮',
  '21': '滚球', '22': '绳索', '23': '稳定球', '24': '短棍',
  '25': '悬吊', '26': 'Trap bar', '27': '震动板', '28': '轮滑滚筒',
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
const BODY_PART_MAP_ZH = {
  '1': '大腿', '2': '胸部', '3': '髋部', '4': '背部',
  '5': '上臂', '6': '肩膀', '7': '前臂', '8': '小腿',
  '9': '颈部', '10': '有氧', '12': '腰部',
  '17': '肱二头肌', '18': '肱三头肌', '19': '股四头肌', '20': '腘绳肌',
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
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t,  // 注入 i18n 字典
    });
    this._loadUserExercises();
    this.loadList(true);
  },

  onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'zh';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }
  },

  async _loadUserExercises() {
    if (!app.globalData.openid) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'exercise.getUserExercises', openid: app.globalData.openid },
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
      name: 'api',
      data: {
        action: 'library.list',
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
      const locale = this.data.locale;
      const equipMap = locale === 'zh' ? EQUIP_MAP_ZH : EQUIP_MAP;
      const bodyPartMap = locale === 'zh' ? BODY_PART_MAP_ZH : BODY_PART_MAP;
      let items = (res.result.list || []).map(item => {
        const id = item.id;
        // Handle multi-muscle (comma-separated body_part_id)
        const bpIds = String(item.body_part_id).split(',');
        const muscleName = bpIds.map(bid => bodyPartMap[bid.trim()] || '').filter(Boolean).join(' / ');
        const muscleNameZh = bpIds.map(bid => BODY_PART_MAP_ZH[bid.trim()] || '').filter(Boolean).join(' / ');
        return {
          ...item,
          equipment_name: equipMap[String(item.equipment_id)] || 'Other',
          equipment_name_zh: EQUIP_MAP_ZH[String(item.equipment_id)] || '',
          equipment_icon: EQUIP_ICON_MAP[String(item.equipment_id)] || '',
          muscle_name: muscleName,
          muscle_name_zh: muscleNameZh,
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
      name: 'api',
      data: {
        action: 'exercise.toggleFavorite',
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
      name: 'api',
      data: { action: 'session.getRunning', openid: app.globalData.openid },
    });

    let sessionId;
    if (!runRes.result || !runRes.result.session) {
      // Start session first
      const createRes = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'session.create', openid: app.globalData.openid },
      });
      if (!createRes.result || !createRes.result.success) return;
      sessionId = (createRes.result && (createRes.result.sessionId || (createRes.result.session && createRes.result.session._id)));
    } else {
      sessionId = runRes.result.session._id;
    }

    // Save exercise to session
    await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'exercise.add',
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
