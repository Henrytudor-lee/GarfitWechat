// components/add-exercise-modal/index.js
const app = getApp();
const api = require('../../utils/api.js');
const { BODY_PART_MAP, BODY_PART_MAP_ZH, MUSCLE_ICON_MAP, EQUIP_MAP, EQUIP_MAP_ZH, EQUIP_ICON_MAP } = require('../../utils/maps.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');

/**
 * 取 i18n 字典, 并补齐可能缺失的 key。
 *
 * ⚠️ i18n 字典是**启动时的快照**(app.onLaunch 里取的)——
 *    开发者新增 key 后如果没重新编译就取不到, 标签会渲染成**空白**。
 *    实测(2026-11-07): "负重"标签空白 → 那一列比旁边矮一截 →
 *    被 .set-item 的 align-items:center 居中后, 时长组比负重组低 8px, 整行错位。
 *    这里兜底成 WEIGHT, 至少不空白(重新编译后正常显示"负重")。
 *
 * 用模块级函数而不是实例方法 —— data 的初始值可能在 methods 挂载前求值。
 */
function pickDict() {
  const dict = { ...(app.globalData.t || {}) };
  if (!dict.LOAD) dict.LOAD = dict.WEIGHT;
  return dict;
}


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
      // ⚠️ 父组件传进来的是**数字**(session id 是 int 自增主键),
      //    属性却声明成 String → 微信框架类型不匹配会报警告,
      //    某些基础库版本会直接丢成默认值 null → session_id 传不上去。
      //    两个类型都声明, 兼容数字和字符串。
      type: [String, Number],
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
    t: pickDict(),  // 注入 i18n 字典(补齐可能缺失的 key)
    vidPrefix: '',
    equipmentList: EQUIPMENT_LIST,
    muscleList: MUSCLE_LIST,
    equipmentListWithName: [],
    muscleListWithName: [],
    selectedItem: null,
    weight: 0,
    weightStr: '0',
    reps: 0,
    repsStr: '0',        // 次数输入框字符串(用户清空时不能被回写成 0)
    weight_unit: 'kg',
    // ── 计量方式 ──
    // 数据源: exercises_library.exercise_type (这个字段本来就有)
    countMode: 'weight_reps',
    setTitle: '',          // step2 标题(按计量方式变)
    isDuration: false,     // 派生: 计时类动作(必填秒数)
    isDistance: false,     // 派生: 距离类动作(必填距离, 时长可选)
    timerRequired: false,  // 派生: 计时器是否必填
    durationSec: 0,        // 计时动作秒数
    distanceKm: 0,         // 距离动作公里数
    distanceStr: '0',      // 距离输入框字符串(允许小数)
    canSubmit: false,      // 派生: 提交按钮可用性(WXML 不做复杂表达式)
    historyMax: null,
    submitting: false,
    weightChips: [10, 20, 30, 40, 50],
    repsChips: [4, 8, 10, 12, 15, 20],
    favorExercises: [],   // array of exercise_ids
    practicedExercises: [], // array of exercise_ids
    filterFavor: false,
    filterPracticed: false,
    locale: 'en',
    pickScrollTop: 0,           // scroll-view 当前位置 (用于 step2 返回时恢复)
    showScrollTopBtn: false,    // 列表往下滚超过阈值时, 显示右下角回顶按钮
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
            t: pickDict(),
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
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }

      const app = getApp();
      this._pickScrollTop = 0;
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
        weightStr: '0',
        reps: 0,
        repsStr: '0',
        weight_unit: 'kg',
        countMode: 'weight_reps',
        setTitle: titleForMode(app.globalData.t || {}),
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
        pickScrollTop: 0,
        showScrollTopBtn: false,
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
        const res = await api.callCloud('exercise.getUserExercises');
        if (res.result && res.result.success) {
          const favor = res.result.favor_exercises || [];
          const practiced = res.result.practiced_exercises || [];
          // ⚠️ 之前只写组件内的 data, app.globalData.favorExercises 还是旧值
          //    → 两份状态分叉(本组件显示已收藏, 别的页面看不到, 重启后 storage 也是旧的)。
          //    统一走 app.applyExerciseFlags → globalData + storage 一起更新。
          app.applyExerciseFlags({ favor_exercises: favor, practiced_exercises: practiced });
          this.setData({
            favorExercises: favor,
            practicedExercises: practiced,
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

    // 记录 step='pick' 时 exercise-grid 的滚动位置 (避免每次 setData 触发整页重渲染)
    // 同时按阈值切换右下角 "回顶" 按钮
    onPickScroll(e) {
      const top = e.detail.scrollTop;
      this._pickScrollTop = top;
      const shouldShow = top > 300;
      if (this.data.showScrollTopBtn !== shouldShow) {
        this.setData({ showScrollTopBtn: shouldShow });
      }
    },

    // 点击右下角回顶按钮 -> 滚动到列表顶部
    scrollToTop() {
      this._pickScrollTop = 0;
      this.setData({ pickScrollTop: 0, showScrollTopBtn: false });
    },

    goBack() {
      // 作废在飞的历史请求: 用户已返回, 回包不能把上一个动作的数据写回来
      this._historyReqId = null;
      this.setData({
        step: 'pick',
        selectedItem: null,
        weight: 0,
        reps: 0,
        repsStr: '0',
        historyMax: null,
      });
      // step 切换后 step1 视图重新挂载, scroll-view 是新的, 滚动位置归零.
      // 下一帧把之前记住的位置写回 scroll-top 属性即可恢复.
      const top = this._pickScrollTop || 0;
      if (top > 0) {
        // 先写 0 再写目标值, 绕过 WeChat "scroll-top 相同值不触发滚动" 的限制
        this.setData({ pickScrollTop: 0 });
        wx.nextTick(() => {
          this.setData({ pickScrollTop: top });
        });
      }
    },

    toggleMuscleMenu() {
      this.setData({ selectedMuscleOpen: !this.data.selectedMuscleOpen });
    },

    closeMuscleMenu() {
      this.setData({ selectedMuscleOpen: false });
    },

    selectMuscle(e) {
      // ⚠️ dataset 的值是**字符串**, 必须转数字:
      //    选"全部"时 id='0', 字符串 '0' 是 truthy → 传给后端 → FIND_IN_SET('0', body_part_id)
      //    永远匹配不到 → 列表空了。(selectEquipment 早就转了, 这里漏了)
      const id = Number(e.currentTarget.dataset.id);
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
      // 输入即过滤 (debounce 300ms): 之前只有 bindconfirm (按回车) 才刷新列表,
      // 用户清空检索字到空字符串时不会触发任何刷新, 列表停留在过滤后的状态.
      if (this._searchTimer) clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this._searchTimer = null;
        this.setData({ page: 1, list: [] });
        this.loadList(true);
      }, 300);
    },

    onSearch() {
      // 按回车: 取消 pending 的 debounce, 立即刷新
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }
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
      // ⚠️ 之前这里直接 return, 把所有过滤/搜索刷新全吞了:
      //    刷新入口(selectMuscle/selectEquipment/onSearch/onFavorFilterTap …)
      //    都会先 setData({list: []}) 再 loadList(true),
      //    此刻若有请求在飞 → 新筛选条件永远发不到后端 → 网格显示旧筛选结果,
      //    而筛选 chip 已经显示新条件; 更糟的是在飞请求返回时把 page 写成 page+1
      //    → 之后 loadMore 拉的是新筛选的第 2 页, 新筛选第 1 页永远缺失。
      //    改成"不丢弃请求": 记一个 pending, 等当前请求收尾后重跑一次。
      if (this.data.loading || this.data.loadingMore) {
        this._pendingReload = true;
        return;
      }

      const page = reset ? 1 : this.data.page;
      if (!reset && !this.data.hasMore) return;

      if (reset) {
        // 切过滤/搜索时列表刷新, 滚动位置重置到顶部
        this._pickScrollTop = 0;
        this.setData({ pickScrollTop: 0, loading: reset, loadingMore: !reset });
      } else {
        this.setData({ loading: reset, loadingMore: !reset });
      }

      const { keyword, selectedEquipment, selectedMuscle, favorExercises, practicedExercises, filterFavor, filterPracticed } = this.data;

      try {
        const res = await api.callCloud('library.list', { keyword,
            equipmentId: selectedEquipment ? selectedEquipment : '',
            bodyPart: selectedMuscle ? selectedMuscle : '',
            page,
            pageSize: this.data.pageSize,
            isFavor: filterFavor,
            isPracticed: filterPracticed,
            favorExerIds: favorExercises,
            practicedExerIds: practicedExercises });

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
          const sorted = sortByPracticedThenFavor(items);

          this.setData({
            list: reset ? sorted : [...this.data.list, ...sorted],
            hasMore: items.length >= this.data.pageSize,
            page: page + 1,
          });
        }
      } catch (err) {
        console.error('loadList failed', err);
      } finally {
        // 收尾: 先把 loading 落下, 再补跑挂起的刷新
        // (递归前先清 pending 标志 → 不会无限递归)
        this.setData({ loading: false, loadingMore: false });
        if (this._pendingReload) {
          this._pendingReload = false;
          this.loadList(true);
        }
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
      const mode = normalizeCountMode(item);
      // 归属标记: 在飞的历史请求要跟这个 id 比对, 否则会写回上一个动作的数据
      this._historyReqId = item && item.id != null ? item.id : null;
      this.setData({
        selectedItem: item,
        step: 'set',
        weight: 0,
        weightStr: '0',
        reps: 0,
        repsStr: '0',
        // ⚠️ 之前没重置 → 上一个动作的 LAST badge 会串到新动作上,
        // 点一下就把上一个动作的重量写进新动作。
        historyMax: null,
        countMode: mode,
        setTitle: titleForMode(app.globalData.t || {}),
        isDuration: isDurationMode(mode),
        isDistance: isDistanceMode(mode),
        timerRequired: isDurationMode(mode),
        durationSec: 0,
        distanceKm: 0,
        distanceStr: '0',
      });
      this._syncCanSubmit();
      this._loadHistoryMax(item);
    },

    async _loadHistoryMax(item) {
      const userId = app.globalData.userId;
      if (!userId || !item) return;

      // 记住这次请求属于哪个动作(用实例字段, 不读 this.data.selectedItem.id ——
      // 那个值可能已经被下一次选择覆盖, 拿它比对会误判)
      const reqId = item.id;

      try {
        const res = await api.callCloud('exercise.getMaxWeight', { exerciseId: item.id });

        // 归属校验: 用户可能已经选了别的动作(或点了返回),
        // 这时回包必须丢掉, 否则上一个动作的 historyMax/weight/reps 会被写回来
        if (this._historyReqId == null || Number(this._historyReqId) !== Number(reqId)) return;
        const cur = this.data.selectedItem;
        if (!cur || Number(cur.id) !== Number(reqId)) return;

        if (res.result && res.result.success && res.result.data) {
          const d = res.result.data;
          const patch = {
            historyMax: { weight: d.weight, reps: d.reps, weight_unit: d.weight_unit || 'kg' },
            weight: d.weight,
            weightStr: formatNumberForInput(d.weight),
            reps: d.reps || 0,
            repsStr: String(d.reps || 0),
            weight_unit: d.weight_unit || 'kg',
          };
          // 计时类动作: 回填历史秒数(新字段, 老数据为 null → 保持 0)
          if (d.duration_sec != null) {
            patch.durationSec = d.duration_sec || 0;
            patch.historyMax = Object.assign({}, patch.historyMax, { duration_sec: d.duration_sec });
          }
          // 距离类动作: 回填历史公里数(新字段, 老数据为 null → 保持 0)
          if (d.distance_km != null) {
            patch.distanceKm = d.distance_km;
            patch.distanceStr = formatNumberForInput(d.distance_km);
            patch.historyMax = Object.assign({}, patch.historyMax, { distance_km: d.distance_km });
          }
          this.setData(patch);
          this._syncCanSubmit();
        }
      } catch (err) {
        console.error('Failed to load history max', err);
      }
    },

    applyHistory() {
      const h = this.data.historyMax;
      if (!h) return;
      const { isDuration, isDistance } = this.data;
      if (isDuration) {
        // 计时类: 回填秒数 + 负重(上次这个动作手握了多重的哑铃)
        const patch = {};
        if (h.duration_sec != null) patch.durationSec = h.duration_sec;
        if (Number(h.weight) > 0) {
          patch.weight = h.weight;
          patch.weightStr = formatNumberForInput(h.weight);
        }
        this.setData(patch);
      } else if (isDistance) {
        // 距离类: 回填公里数 + 负重(时长可选, 不回填)
        const patch = {};
        if (h.distance_km != null) {
          patch.distanceKm = h.distance_km;
          patch.distanceStr = formatNumberForInput(h.distance_km);
        }
        if (Number(h.weight) > 0) {
          patch.weight = h.weight;
          patch.weightStr = formatNumberForInput(h.weight);
        }
        this.setData(patch);
      } else {
        // 重量次数类: 原逻辑
        this.setData({
          weight: h.weight,
          weightStr: formatNumberForInput(h.weight),
          reps: h.reps || 0,
          repsStr: String(h.reps || 0),
        });
      }
      this._syncCanSubmit();
    },

    /**
     * 同步提交按钮的可用状态。
     * 计时类要求 durationSec > 0, 次数类要求 reps > 0。
     * (不能沿用"reps <= 0 就禁用" —— 计时动作 reps 恒为 0)
     */
    _syncCanSubmit() {
      const {
        weight, reps, durationSec, distanceKm,
        isDuration, isDistance, submitting,
      } = this.data;
      // 三档校验:
      //   次数类(weight_reps)   → reps > 0
      //   计时类(duration)       → durationSec > 0
      //   距离类(distance_duration) → distanceKm > 0(时长可选)
      let metricOk;
      if (isDistance) {
        metricOk = distanceKm > 0;
      } else if (isDuration) {
        metricOk = durationSec > 0;
      } else {
        metricOk = reps > 0;
      }
      const ok = !submitting && weight >= 0 && metricOk;
      if (ok !== this.data.canSubmit) {
        this.setData({ canSubmit: ok });
      }
    },

    // ---- 距离输入 ----
    onDistanceInput(e) {
      const val = e.detail.value;
      const num = Number(val);
      this.setData({
        distanceStr: val,
        distanceKm: Number.isFinite(num) ? num : 0,
      });
      this._syncCanSubmit();
    },

    incDistance() {
      const v = Math.round((this.data.distanceKm + 0.5) * 100) / 100;
      this.setData({ distanceKm: v, distanceStr: String(v) });
      this._syncCanSubmit();
    },

    decDistance() {
      const v = Math.max(0, Math.round((this.data.distanceKm - 0.5) * 100) / 100);
      this.setData({ distanceKm: v, distanceStr: String(v) });
      this._syncCanSubmit();
    },

    onWeightInput(e) {
      const patch = syncDecimalValue('weight', e.detail.value);
      if (patch) this.setData(patch);
      this._syncCanSubmit();
    },

    onRepsInput(e) {
      // ⚠️ input.value 必须绑字符串字段: 用户全选删除时 e.detail.value = '',
      //    直接 Number('')||0 → 0 → setData 把 0 写回输入框 → 框里立刻显示 "0",
      //    还得再删一次; 而且"空串"被当成 0 提交。
      const raw = e.detail.value;
      const num = parseInt(raw, 10);
      this.setData({ repsStr: raw, reps: isNaN(num) ? 0 : num });
      this._syncCanSubmit();
    },

    incWeight() {
      const w = this.data.weight + 2.5;
      this.setData({ weight: w, weightStr: formatNumberForInput(w) });
      this._syncCanSubmit();
    },

    decWeight() {
      const w = Math.max(0, this.data.weight - 2.5);
      this.setData({ weight: w, weightStr: formatNumberForInput(w) });
      this._syncCanSubmit();
    },

    incReps() {
      const v = (this.data.reps || 0) + 1;
      this.setData({ reps: v, repsStr: String(v) });
      this._syncCanSubmit();
    },

    decReps() {
      const v = Math.max(0, (this.data.reps || 0) - 1);
      this.setData({ reps: v, repsStr: String(v) });
      this._syncCanSubmit();
    },

    setWeight(e) {
      const w = Number(e.currentTarget.dataset.val);
      this.setData({ weight: w, weightStr: formatNumberForInput(w) });
      this._syncCanSubmit();
    },

    setReps(e) {
      const v = Number(e.currentTarget.dataset.val) || 0;
      this.setData({ reps: v, repsStr: String(v) });
      this._syncCanSubmit();
    },

    setUnit(e) {
      const u = e.currentTarget.dataset.weightUnit;
      this.setData({ weight_unit: u });
    },

    // ── 计时器回调 (set-timer 组件) ──
    onTimerChange(e) {
      this.setData({ durationSec: e.detail.seconds || 0 });
      this._syncCanSubmit();
    },

    // set-timer 计到上限(3600 秒)会触发 finish 事件:
    // 父组件原来只绑了 bindchange → 到上限静默停止, 用户毫无感知 → 弹个提示
    onTimerFinish() {
      wx.showToast({ title: '已达计时上限', icon: 'none' });
    },

    async confirmAdd() {
      const {
        selectedItem, weight, reps, weight_unit, submitting,
        countMode, isDuration, isDistance, durationSec, distanceKm,
      } = this.data;
      if (!selectedItem || weight < 0 || submitting) return;

      // ── 按计量方式校验 ──
      // 次数类: reps > 0 | 计时类: durationSec > 0 | 距离类: distanceKm > 0(时长可选)
      const t = this.data.t || {};
      if (isDistance) {
        if (distanceKm <= 0) {
          wx.showToast({ title: t.SET_DISTANCE_HINT || '请先填写距离', icon: 'none' });
          return;
        }
      } else if (isDuration) {
        if (durationSec <= 0) {
          wx.showToast({ title: t.SET_DURATION_HINT || '请先设置时长', icon: 'none' });
          return;
        }
      } else if (reps <= 0) {
        return;
      }

      this.setData({ submitting: true });
      this._syncCanSubmit();

      try {
        const userId = app.globalData.userId;
        const sessionId = this.data.sessionId;
        const exId = selectedItem.id;

        // Fire markPracticed asynchronously — non-blocking
        // 后端返回完整的最新 practiced 列表 → 同步到 globalData/storage,
        // 否则本次会话里"已训练"筛选用的还是旧缓存(刚练过的动作筛不出来)
        api.callCloud('exercise.markPracticed', { exercise_id: exId })
          .then((r) => {
            const list = r && r.result && r.result.practiced_exercises;
            if (Array.isArray(list)) {
              app.applyExerciseFlags({ practiced_exercises: list });
              this.setData({ practicedExercises: list });
            }
          })
          .catch(() => {});

        const payload = {
          session_id: sessionId,
          exercise_id: exId,
          name_zh: selectedItem.name_zh || selectedItem.name,
          name_en: selectedItem.name || null,
          image_name: selectedItem.image_name || null,
          video_name: selectedItem.video_name || null,
          // ⚠️ 2026-11-07 修正: 原来对计时/距离类强制 weight = 0
          //    ("不按重量计量")。但计时/距离类动作**可以是负重的**
          //    (手握哑铃的交叉跳跃、负重爬坡步行) → 强制置 0 会把负重直接丢掉,
          //    而 UI 上还留着重量输入框, 填了也存不进去。
          //    现在三种模式都提交真实重量; 0 = 自重。
          //    reps 仍然是次数类专属: 计时类按时长、距离类按距离, 次数存 0(不适用)。
          weight,
          reps: (isDuration || isDistance) ? 0 : reps,
          weight_unit: weight_unit,
        };
        // 计时类: 秒数写 duration_sec, reps 存 0(不适用)
        if (isDuration) {
          payload.duration_sec = durationSec;
        }
        // 距离类: 距离写 distance_km, 时长可选
        if (isDistance) {
          payload.distance_km = distanceKm;
          if (durationSec > 0) payload.duration_sec = durationSec;
        }

        const res = await api.callCloud('exercise.add', payload);

        if (res.result && res.result.success) {
          wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
          this.triggerEvent('exerciseadded', { addedExerciseId: exId });
          this.closeModal();
        } else {
          wx.showToast({ title: (res.result && res.result.error) || 'FAILED', icon: 'none' });
        }
      } catch (err) {
        console.error('Failed to add exercise', err);
        wx.showToast({ title: 'FAILED', icon: 'none' });
      } finally {
        this.setData({ submitting: false });
        this._syncCanSubmit();
      }
    },

    onFavoriteTap(e) {
      // ⚠️ dataset 的值是**字符串**, 而 favorExercises 是 number[]。
      //    不转数字 → includes(id) 永远 false → isFav 恒为 false
      //    → 乐观更新永远走"添加"分支, 列表里的收藏 icon 也不刷新(item.id === id 同样永假)
      const id = Number(e.currentTarget.dataset.id);
      const { favorExercises } = this.data;
      const isFav = favorExercises.includes(id);

      // Optimistic update
      const oldFav = favorExercises;   // 回滚用快照
      const newFav = isFav ? favorExercises.filter(fid => fid !== id) : [...favorExercises, id];
      this.setData({ favorExercises: newFav });

      // Update list items
      const list = this.data.list.map(item => {
        if (item.id === id) return { ...item, is_favorite: !isFav };
        return item;
      });
      this.setData({ list: sortByPracticedThenFavor(list) });

      // Call cloud function
      api.callCloud('exercise.toggleFavorite', { exercise_id: id })
        .then((r) => {
          const list = r && r.result && r.result.favor_exercises;
          if (Array.isArray(list)) {
            app.applyExerciseFlags({ favor_exercises: list });
            this.setData({ favorExercises: list });
            // 服务端才是事实来源 → 用服务端列表重算 is_favorite 并重排
            this.setData({ list: this._applyFavorFlagsToList(list) });
          }
        })
        .catch((err) => {
          console.error('toggleFavorite failed', err);
          // ⚠️ 之前是 .catch(() => {}) → 服务器拒绝后心形一直保持翻转,
          //    既不回滚也不提示 → 回滚 + 提示
          this.setData({ favorExercises: oldFav });
          this.setData({ list: this._applyFavorFlagsToList(oldFav) });
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
    },

    // 用给定的收藏 id 列表重算列表项的 is_favorite, 并按"已练过优先→已收藏优先"重排
    _applyFavorFlagsToList(favIds) {
      const favSet = new Set((favIds || []).map(x => Number(x)));
      const items = (this.data.list || []).map(item => ({
        ...item,
        is_favorite: favSet.has(Number(item.id)),
      }));
      return sortByPracticedThenFavor(items);
    },

    // step 2 头部右侧的 favorite 按钮: 直接切换 selectedItem 的 is_favorite
    onSelectedFavoriteTap() {
      const item = this.data.selectedItem;
      if (!item) return;
      const id = item.id;
      const wasFav = !!item.is_favorite;
      const { favorExercises } = this.data;
      const oldFav = favorExercises;   // 回滚用快照
      // optimistic update
      this.setData({ 'selectedItem.is_favorite': !wasFav });
      const newFav = wasFav
        ? favorExercises.filter(fid => fid !== id)
        : [...favorExercises, id];
      this.setData({ favorExercises: newFav });
      // 同步 list 里对应项 (如果 step=set 时 list 还在)
      if (this.data.list && this.data.list.length > 0) {
        const list = this.data.list.map(it => it.id === id ? { ...it, is_favorite: !wasFav } : it);
        this.setData({ list: sortByPracticedThenFavor(list) });
      }
      // cloud call
      api.callCloud('exercise.toggleFavorite', { exercise_id: id })
        .then((r) => {
          const list = r && r.result && r.result.favor_exercises;
          if (Array.isArray(list)) {
            app.applyExerciseFlags({ favor_exercises: list });
            this.setData({ favorExercises: list });
            // 服务端才是事实来源 → 用服务端列表纠正乐观值
            this.setData({ 'selectedItem.is_favorite': list.includes(id) });
            this.setData({ list: this._applyFavorFlagsToList(list) });
          }
        })
        .catch((err) => {
          console.error('toggleFavorite failed', err);
          // 失败回滚 + 提示(心形不能一直保持翻转)
          this.setData({ favorExercises: oldFav, 'selectedItem.is_favorite': wasFav });
          this.setData({ list: this._applyFavorFlagsToList(oldFav) });
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
    },
  },
});

/**
 * 列表排序: 已练过优先 → 已收藏优先 → 其余保持原顺序。
 *
 * 提取成模块级函数, 让"收藏状态变化后重排"能复用同一套规则
 * (列表加载 / 乐观更新回滚 / 服务端纠正 都要重排)。
 */
function sortByPracticedThenFavor(items) {
  return items.sort((a, b) => {
    if (b.is_practiced !== a.is_practiced) return b.is_practiced ? 1 : -1;
    if (b.is_favorite !== a.is_favorite) return b.is_favorite ? 1 : -1;
    return 0;
  });
}

/**
 * 取动作的计量方式。
 *
 * 数据源: exercises_library.exercise_type (这个字段本来就有, 线上已有真实数据:
 *   weight_reps 6522 条 / duration 1058 条 / distance_duration 61 条)
 *
 * 'Strength' 是列的历史遗留默认值(线上 0 行), 见到它按 weight_reps 处理。
 */
function normalizeCountMode(item) {
  if (!item) return 'weight_reps';
  const raw = item.exercise_type || 'weight_reps';
  if (raw === 'Strength') return 'weight_reps';
  if (['weight_reps', 'duration', 'distance_duration'].indexOf(raw) >= 0) return raw;
  return 'weight_reps';
}

/**
 * step2 弹框标题 —— 按计量方式给不同的说法。
 *
 * 之前无论什么动作都叫"设置重量和次数", 计时类动作(平板支撑)进去
 * 显示"设置重量和次数"但下面只有一个计时器, 文案对不上。
 */
function titleForMode(t) {
  // ⚠️ 2026-11-07 改: 原来按计量方式分三种标题
  //    (设置时长 / 设置距离和时长 / 设置重量和次数),
  //    但现在**三种模式都能设负重** —— 计时类动作标题写着"设置时长",
  //    下面却有负重输入框, 文案和内容对不上。
  //    统一改成"动作配置": 对三种模式都成立, 兼容性最高,
  //    以后再加新的计量方式也不用改标题。
  return t.ACTION_SETUP || '动作配置';
}

/**
 * 是否走"计时"录入分支(计时器必填)。
 *
 * 只有 'duration' 走 —— 平板支撑/波比跳/开合跳这类, 时长是唯一计量维度。
 */
function isDurationMode(mode) {
  return mode === 'duration';
}

/**
 * 是否走"距离"录入分支(距离必填, 时长可选)。
 *
 * 'distance_duration'(跑步/骑行/划船/椭圆机/踏步机, 61 行 47 个中文名)
 * → 2026-11-04 用户拍板: "就只录入距离就行了"
 *   · 不做配速、不做"配速+时长反推距离"
 *   · 距离是独立输入框, 单位 km(实测这批动作全是公里级有氧)
 *   · 时长仍然可以用计时器记, 但不填也能提交
 */
function isDistanceMode(mode) {
  return mode === 'distance_duration';
}
