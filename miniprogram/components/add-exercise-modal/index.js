// components/add-exercise-modal/index.js
const app = getApp();
const { BODY_PART_MAP, BODY_PART_MAP_ZH, MUSCLE_ICON_MAP, EQUIP_MAP, EQUIP_MAP_ZH, EQUIP_ICON_MAP } = require('../../utils/maps.js');

const EQUIPMENT_LIST = [
  { id: 1, icon: 'barbell.png' },
  { id: 2, icon: 'bodyweight.png' },
  { id: 3, icon: 'cable.png' },
  { id: 4, icon: 'dumbell.png' },
  { id: 5, icon: 'ez_barbell.png' },
  { id: 6, icon: 'leverage_machine.png' },
  { id: 7, icon: 'sled_machine.png' },
  { id: 8, icon: 'smith_machine.png' },
  { id: 9, icon: 'weighted.png' },
  { id: 10, icon: 'A.png' },
  { id: 11, icon: 'band.png' },
  { id: 12, icon: 'battling_rope.png' },
  { id: 13, icon: 'bosu_ball.png' },
  { id: 14, icon: 'H.png' },
  { id: 15, icon: 'kettlebell.png' },
  { id: 16, icon: 'medicine_ball.png' },
  { id: 17, icon: 'barbell.png' },
  { id: 18, icon: 'power_sled.png' },
  { id: 19, icon: 'resistance_band.png' },
  { id: 20, icon: 'roll.png' },
  { id: 21, icon: 'rollball.png' },
  { id: 22, icon: 'rope.png' },
  { id: 23, icon: 'stability_ball.png' },
  { id: 24, icon: 'ST.png' },
  { id: 25, icon: 'suspension.png' },
  { id: 26, icon: 'trap_bar.png' },
  { id: 27, icon: 'VP.png' },
  { id: 28, icon: 'wheel_roller.png' },
];

const MUSCLE_LIST = [
  { id: 1, icon: 'quadriceps.png' },
  { id: 2, icon: 'chest.png' },
  { id: 3, icon: 'hips.png' },
  { id: 4, icon: 'back.png' },
  { id: 5, icon: 'shoulders.png' },
  { id: 6, icon: 'shoulders.png' },
  { id: 7, icon: 'forearms.png' },
  { id: 8, icon: 'calves.png' },
  { id: 9, icon: 'neck.png' },
  { id: 10, icon: 'cardio.png' },
  { id: 12, icon: 'waist.png' },
  { id: 17, icon: 'biceps.png' },
  { id: 18, icon: 'triceps.png' },
  { id: 19, icon: 'quadriceps.png' },
  { id: 20, icon: 'hamstrings.png' },
];

const STORAGE_KEY = 'add_exercise_modal_filters';

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
    theme: {
      type: String,
      value: 'night',
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
    t: app.globalData.t,  // 注入 i18n 字典
    vidPrefix: '',
    equipmentList: EQUIPMENT_LIST,
    muscleList: MUSCLE_LIST,
    equipmentListWithName: [],
    muscleListWithName: [],
    selectedItem: null,
    weight: 0,
    reps: 0,
    weight_unit: 'kg',
    historyMax: null,
    submitting: false,
    weightChips: [10, 20, 30, 40, 50],
    repsChips: [4, 8, 10, 12, 15, 20],
    favorExercises: [],   // array of exercise_ids
    practicedExercises: [], // array of exercise_ids
    filterFavor: false,
    filterPracticed: false,
    locale: 'en',
  },

  observers: {
    'isOpen': function (isOpen) {
      if (isOpen) {
        const imgPrefix = app.globalData.imagePrefix || '';
        const vidPrefix = app.globalData.videoPrefix || '';
        // 仅当没有 preselected 时才 _reset, 否则 _reset 会清掉 preselectedExercise 设置的 selectedItem
        if (!this.data.preselectedExercise) {
          this._reset(imgPrefix, vidPrefix);
        } else {
          // 部分状态仍需更新 (imgPrefix, locale 等), 但保留 selectedItem/step
          this.setData({
            imgPrefix: imgPrefix || '',
            vidPrefix: vidPrefix || '',
            locale: app.globalData.language || 'zh',
            t: app.globalData.t,
          });
        }
        this._loadSavedFilters();
        this._loadUserExercises();
        this.loadList(true);
      } else {
        this._listLoaded = false;
      }
    },
    'preselectedExercise': function (ex) {
      if (ex) {
        // 直接选, 不依赖 isOpen (因 modal 可能 isOpen=false 时 parent 已经预传)
        this._selectExercise(ex);
      }
    },
  },

  methods: {
    _reset(imgPrefix, vidPrefix) {
      const app = getApp();
      const locale = app.globalData.language || 'zh';
      const equipmentListWithName = EQUIPMENT_LIST.map(item => ({
        ...item,
        _name: locale === 'zh' ? EQUIP_MAP_ZH[String(item.id)] : EQUIP_MAP[String(item.id)],
      }));
      const muscleListWithName = MUSCLE_LIST.map(item => ({
        ...item,
        _name: locale === 'zh' ? BODY_PART_MAP_ZH[String(item.id)] : BODY_PART_MAP[String(item.id)],
      }));
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
        muscleLabel: locale === 'zh' ? '肌群' : 'Muscles',
        favorExercises: app.globalData.favorExercises || [],
        practicedExercises: app.globalData.practicedExercises || [],
        locale,
        equipmentListWithName,
        muscleListWithName,
      });
    },

    _loadSavedFilters() {
      try {
        const saved = wx.getStorageSync(STORAGE_KEY);
        if (saved) {
          const muscleId = saved.selectedMuscle || 0;
          const muscleItem = MUSCLE_LIST.find(m => m.id === muscleId);
          const imgPrefix = this.data.imgPrefix || '';
          const locale = this.data.locale || 'zh';
          this.setData({
            selectedMuscle: muscleId,
            selectedEquipment: saved.selectedEquipment || 0,
            filterFavor: saved.filterFavor || false,
            filterPracticed: saved.filterPracticed || false,
            muscleIcon: muscleId == 0 ? `${imgPrefix}/icons/all.png` : (muscleItem ? `${imgPrefix}/body-icons/${muscleItem.icon}` : ''),
            muscleLabel: muscleId == 0 ? (locale === 'zh' ? '肌群' : 'Muscles') : (muscleItem ? (locale === 'zh' ? BODY_PART_MAP_ZH[String(muscleId)] : BODY_PART_MAP[String(muscleId)]) : ''),
          });
        }
      } catch (err) {
        console.error('_loadSavedFilters failed', err);
      }
    },

    _saveFilters() {
      const { selectedMuscle, selectedEquipment, filterFavor, filterPracticed } = this.data;
      try {
        wx.setStorageSync(STORAGE_KEY, {
          selectedMuscle,
          selectedEquipment,
          filterFavor,
          filterPracticed,
        });
      } catch (err) {
        console.error('_saveFilters failed', err);
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

    closeModal() {
      this._reset(this.data.imgPrefix, this.data.vidPrefix);
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.closeModal();
    },

    onSheetTap() {
      // Empty — catchtap on modal-sheet stops event bubbling so child taps don't reach mask
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
        muscleIcon: id == 0 ? `${imgPrefix}/icons/all.png` : (muscleItem ? `${imgPrefix}/body-icons/${muscleItem.icon}` : ''),
        muscleLabel: id == 0 ? (this.data.locale === 'zh' ? '肌群' : 'Muscles') : (muscleItem ? (this.data.locale === 'zh' ? BODY_PART_MAP_ZH[String(id)] : BODY_PART_MAP[String(id)]) : ''),
      });
      this._listLoaded = false;
      this.loadList(true);
      this._saveFilters();
    },

    selectEquipment(e) {
      const id = Number(e.currentTarget.dataset.id);
      if (id === this.data.selectedEquipment) return;
      this.setData({ selectedEquipment: id, page: 1, list: [] });
      this._listLoaded = false;
      this.loadList(true);
      this._saveFilters();
    },

    onSearchInput(e) {
      this.setData({ keyword: e.detail.value });
    },

    onSearch() {
      this.setData({ page: 1, list: [] });
      this.loadList(true);
    },

    onFavorFilterTap() {
      const newVal = !this.data.filterFavor;
      this.setData({ filterFavor: newVal, page: 1, list: [] });
      this.loadList(true);
      this._saveFilters();
    },

    onPracticedFilterTap() {
      const newVal = !this.data.filterPracticed;
      this.setData({ filterPracticed: newVal, page: 1, list: [] });
      this.loadList(true);
      this._saveFilters();
    },

    async loadList(reset = false) {
      if (this.data.loading || this.data.loadingMore) return;

      const page = reset ? 1 : this.data.page;
      if (!reset && !this.data.hasMore) return;

      this.setData({ loading: reset, loadingMore: !reset });

      const { keyword, selectedEquipment, selectedMuscle, favorExercises, practicedExercises, filterFavor, filterPracticed } = this.data;

      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'library.list',
          keyword,
          equipmentId: selectedEquipment ? selectedEquipment : '',
          bodyPart: selectedMuscle ? selectedMuscle : '',
          page,
          pageSize: this.data.pageSize,
          isFavor: filterFavor,
          isPracticed: filterPracticed,
          favorExerIds: favorExercises,
          practicedExerIds: practicedExercises,
        },
      });

      this.setData({ loading: false, loadingMore: false });

      if (res.result && res.result.success) {
        const items = (res.result.list || []).map(item => {
          const id = item.id;
          return {
            ...item,
            equipment_name: EQUIP_MAP[String(item.equipment_id)] || 'Other',
            equipment_icon: EQUIP_ICON_MAP[String(item.equipment_id)] || '',
            muscle_name: String(item.body_part_id || '').split(',').map(id => BODY_PART_MAP[id.trim()] || '').filter(Boolean).join(', '),
            muscle_icons: String(item.body_part_id || '').split(',').map(id => MUSCLE_ICON_MAP[id.trim()] || '').filter(Boolean).slice(0, 2),
            muscle_name_zh: String(item.body_part_id || '').split(',').map(id => BODY_PART_MAP_ZH[id.trim()] || '').filter(Boolean).join(', '),
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
          name: 'api',
          data: {
            action: 'exercise.getMaxWeight',
            exerciseId: item.id,
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

    setWeight(e) {
      this.setData({ weight: Number(e.currentTarget.dataset.val) });
    },

    setReps(e) {
      this.setData({ reps: Number(e.currentTarget.dataset.val) });
    },

    setUnit(e) {
      const u = e.currentTarget.dataset.weightUnit;
      this.setData({ weight_unit: u });
    },

    async confirmAdd() {
      const { selectedItem, weight, reps, weight_unit, submitting } = this.data;
      if (!selectedItem || weight < 0 || reps <= 0 || submitting) return;

      this.setData({ submitting: true });

      try {
        const userId = app.globalData.userId;
        const sessionId = this.data.sessionId;
        const exId = selectedItem.id;

        // Fire markPracticed asynchronously — non-blocking
        wx.cloud.callFunction({
          name: 'api',
          data: {
            action: 'exercise.markPracticed',
            exercise_id: exId,
            openid: app.globalData.openid,
          },
        });

        const res = await wx.cloud.callFunction({
          name: 'api',
          data: {
            action: 'exercise.add',
            session_id: sessionId,
            openid: app.globalData.openid,
            exercise_id: exId,
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

    onFavoriteTap(e) {
      const id = e.currentTarget.dataset.id;
      const { favorExercises } = this.data;
      const isFav = favorExercises.includes(id);

      // Optimistic update
      const newFav = isFav ? favorExercises.filter(fid => fid !== id) : [...favorExercises, id];
      this.setData({ favorExercises: newFav });

      // Update list items
      const list = this.data.list.map(item => {
        if (item.id === id) return { ...item, is_favorite: !isFav };
        return item;
      });
      this.setData({ list });

      // Call cloud function
      wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'exercise.toggleFavorite',
          exercise_id: id,
          openid: app.globalData.openid,
        },
      });
    },

    // step 2 头部右侧的 favorite 按钮: 直接切换 selectedItem 的 is_favorite
    onSelectedFavoriteTap() {
      const item = this.data.selectedItem;
      if (!item) return;
      const id = item.id;
      const wasFav = !!item.is_favorite;
      // optimistic update
      this.setData({ 'selectedItem.is_favorite': !wasFav });
      const { favorExercises } = this.data;
      const newFav = wasFav
        ? favorExercises.filter(fid => fid !== id)
        : [...favorExercises, id];
      this.setData({ favorExercises: newFav });
      // 同步 list 里对应项 (如果 step=set 时 list 还在)
      if (this.data.list && this.data.list.length > 0) {
        const list = this.data.list.map(it => it.id === id ? { ...it, is_favorite: !wasFav } : it);
        this.setData({ list });
      }
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
  },
});
