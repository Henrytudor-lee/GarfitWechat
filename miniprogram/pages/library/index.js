// pages/library/index.js — garcia-fitness-new style
const app = getApp();
const api = require('../../utils/api.js');

/**
 * 归一化筛选 chip 的 id
 *
 * 本页的"全部" chip 用 data-id="{{null}}" 表示, 渲染出来是空串(或字符串 "null")。
 * 具体动作的 chip 是数字 id, 但 dataset 取出来可能是字符串。
 *
 *   '' / 'null' / null / undefined → null   (表示"全部")
 *   '0' / '2' / 2                → 数字    (具体的肌群/器械 id)
 *
 * 两个坑, 都踩过:
 *   1. 不归一化 → 字符串 '0' 是 truthy, 前端 `selectedMuscle ? ... : ''` 判成"要筛选"
 *      → 后端 FIND_IN_SET('0', body_part_id) → 动作列表全空
 *   2. 直接 Number() → Number('') = 0, Number('null') = NaN,
 *      而本页的高亮判断是 `=== null` → 点"全部"反而不高亮
 */
function normalizeFilterId(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '' || s === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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
    iconSearchUrl: (app.globalData.imagePrefix || 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036/media/images') + '/icons/icon-search.png',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
    loadError: false,   // 请求失败态: 与"真的没有动作"区分开
    imgPrefix: '',
    vidPrefix: '',
    selectedExercise: null,
    isSelectMode: false,
    // 动作分享 token —— 必须在**点分享之前**就准备好(见 onShareAppMessage 的注释)
    shareToken: '',
    shareFailed: false,
    favorExercises: [],
    practicedExercises: [],
    filterFavor: false,
    filterPracticed: false,
    // Add to workout modal state
    showAddModal: false,
    currentSessionId: null,
    preselectedExercise: null,
    addingToWorkout: false,
    // Session orb (floating running-session indicator)
    orbSession: null,
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
    // Refresh session orb (running session indicator)
    this._loadOrbSession();
    // 收藏/练过标记: openid 可能在 onLoad 时还没就绪, 这里再兜一次
    this._loadUserExercises();
    // 允许从右上角菜单分享(动作详情弹层里的分享按钮也依赖这个开关)
    wx.showShareMenu({ withShareTicket: true });
  },

  async _loadOrbSession() {
    const session = await app.loadRunningSession();
    this.setData({ orbSession: session });
  },

  async onOrbTap() {
    // 无 session: 先创建一个, 再跳到 training 页
    if (!this.data.orbSession) {
      const session = await app.ensureRunningSession();
      if (!session) return;
      this.setData({ orbSession: session });  // orb 立即变 active
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  async _loadUserExercises() {
    // 防止 onLoad/onShow 重复请求: 标记位比"数组非空"更准
    // (用户真的一个收藏都没有时数组也是空, 用非空判断会每次 onShow 都再拉一次)
    if (this._userExercisesFetched) return;
    if (this.data.favorExercises.length > 0 || this.data.practicedExercises.length > 0) return;

    // ⚠️ 原来直接读 app.globalData.openid 判断, 登录还没完成时就 return,
    //    而 onLoad 之后没有再拉的机会 → 收藏/练过标记永远是空,
    //    "♥ 收藏" / "☑ 已练过" 两个筛选恒返回空列表。
    //    改成等鉴权就绪 (app.whenAuthReady 内部复用 onLaunch 的 loginPromise, 不会轮询)。
    const openid = await app.whenAuthReady();
    if (!openid) return;

    try {
      const res = await api.callCloud('exercise.getUserExercises');
      if (res.result && res.result.success) {
        this._userExercisesFetched = true;
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
    // ---- 并发策略 ----
    // 1) 请求序号 _listReqId：快速连点筛选时, 只有最后一次请求的结果会被采纳,
    //    早到的旧响应被丢弃, 避免"选了新筛选却显示旧数据".
    // 2) loading 只用于挡住 loadMore 的重复触发; 筛选(reset=true)必须能打断正在飞的请求,
    //    否则入口处"先清空 list 再 loadList"会因为 loading 而被静默吞掉 → 白屏.
    // ⚠️ 守卫必须在**序号自增之前**:
    //   反过来的话, 被守卫挡掉的那次调用已经把序号顶掉了,
    //   在途请求回来时 reqId !== this._listReqId → 结果被丢弃,
    //   finally 里的 loading:false 也因同一判断不执行 → **loading 永久卡在 true**,
    //   此后所有 loadMore 都被守卫挡掉 → 列表永远翻不到下一页。
    if (!reset && this.data.loading) return;
    const reqId = (this._listReqId || 0) + 1;
    this._listReqId = reqId;
    // 重试/新筛选开始 → 先把上一次的失败态清掉
    this.setData({ loading: true, loadError: false });

    const page = reset ? 1 : this.data.page;
    const { keyword, selectedEquipment, selectedMuscle, filterFavor, filterPracticed, favorExercises, practicedExercises } = this.data;

    try {
      const res = await api.callCloud('library.list', { keyword,
          equipmentId: selectedEquipment || '',
          bodyPart: selectedMuscle || '',
          page,
          pageSize: this.data.pageSize,
          isFavor: filterFavor,
          isPracticed: filterPracticed,
          favorExerIds: favorExercises,
          practicedExerIds: practicedExercises });

      // 已有更新的请求在飞 → 本次结果作废
      if (reqId !== this._listReqId) return;

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
    } catch (err) {
      // 失败时不要留下"空列表 + 正在加载"的假象
      if (reqId === this._listReqId) {
        console.error('[library] loadList failed:', err);
        const dict = this.data.t || {};
        wx.showToast({ title: dict.LOAD_FAILED || 'Load failed', icon: 'none' });
        // ⚠️ 失败 ≠ 空列表: 不置 loadError 的话, wxml 会显示"没有找到动作",
        //    用户以为库里真没有这个动作, 而不是加载失败。
        this.setData({ loadError: true });
      }
    } finally {
      if (reqId === this._listReqId) this.setData({ loading: false });
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
    const id = normalizeFilterId(e.currentTarget.dataset.id);
    if (id === this.data.selectedEquipment) return;
    this.setData({ selectedEquipment: id, page: 1, list: [] });
    this.loadList(true);
  },

  onMuscleTap(e) {
    const id = normalizeFilterId(e.currentTarget.dataset.id);
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
      // ⚠️ 必须写 globalData —— 上一页(index)读的是 app.globalData.chosenExercise,
      //    原来这里写的是 prev.setData({chosenExercise}), 两条通道从未对接上,
      //    导致"从动作库选一个动作加进训练"完全失效(点了没反应)。
      getApp().globalData.chosenExercise = item;
      this.setData({ selectedExercise: null }); // 清理，防止 navigateBack 失败时 sheet 卡住
      wx.navigateBack();
    } else {
      // Open detail sheet
      this.setData({ selectedExercise: item });
      // 打开弹层就把分享链接备好 —— 见 _prepareShareToken 的注释
      this._prepareShareToken(item);
    }
  },

  closeSheet() {
    this.setData({ selectedExercise: null, shareToken: '' });
  },

  /**
   * 预取动作分享 token
   *
   * ⚠️ **必须提前取**, 因为 onShareAppMessage 是**同步**回调 ——
   *    微信要求它同步返回 {title, path, imageUrl}, 没有 await 的余地。
   *    分享按钮又是 open-type="share"(点一下直接调起分享面板), 点完再取来不及。
   *    所以在弹层打开时就先把 token 备好 —— 跟训练分享的 workout-summary-modal 同一套。
   */
  async _prepareShareToken(item) {
    const exerciseId = Number(item && item.id) || 0;
    this.setData({ shareToken: '', shareFailed: false });
    if (!exerciseId) return;
    try {
      const res = await api.callCloud('share.create', { exercise_id: exerciseId });
      const token = res && res.result && res.result.share && res.result.share.token;
      if (token) {
        this.setData({ shareToken: token });
      } else {
        this.setData({ shareFailed: true });
      }
    } catch (err) {
      console.warn('[library] 动作分享链接预取失败:', err);
      this.setData({ shareFailed: true });
    }
  },

  /**
   * 分享当前打开的动作
   *
   * 分享出去的卡片 → /pages/exercise-share/index?token=xxx
   * B 点开就能看到这个动作的详情(媒体/器械/肌群/计量方式), 跟训练分享一个套路。
   */
  onShareAppMessage() {
    const isZh = (this.data.locale || 'zh') === 'zh';
    const ex = this.data.selectedExercise;

    // 弹层没开(用户从右上角菜单分享) → 分享动作库本身
    if (!ex) {
      return {
        title: isZh ? 'GFIT 动作库 · 7000+ 专业动作' : 'GFIT Library · 7000+ professional exercises',
        path: '/pages/library/index',
      };
    }

    const name = isZh ? (ex.name_zh || ex.name) : (ex.name || ex.name_zh);
    const title = isZh ? `这个动作很赞：${name} 💪` : `Great exercise: ${name} 💪`;
    const token = this.data.shareToken;

    // 预取失败 → 别发一个点开什么都看不到的卡片
    if (!token) {
      wx.showToast({ title: isZh ? '分享链接生成失败' : 'Failed to create share link', icon: 'none' });
      return { title, path: '/pages/library/index' };
    }

    // 记录"用户真的分享了" —— "我的分享"只列真正发出去的链接
    // ⚠️ onShareAppMessage 只能同步返回, 这里只能发出去不等结果。
    //    用户点完分享面板又取消的情况也会记上, 属于可接受的误差(宁可多列也别漏列)。
    api.callCloud('share.markShared', { token }).catch((err) => {
      console.warn('[library] markShared failed:', err);
    });

    return {
      title,
      path: `/pages/exercise-share/index?token=${token}`,
      imageUrl: ex.image_name ? `${this.data.imgPrefix}/exer_images/${ex.image_name}` : '',
    };
  },

  onFavoriteTap(e) {
    // ⚠️ 同 add-exercise-modal: dataset 是字符串, favorExercises 是 number[]
    //    不转数字 → includes(id) 永远 false → 收藏状态判断和乐观更新全错
    const id = Number(e.currentTarget.dataset.id);
    const { favorExercises } = this.data;
    const isFav = favorExercises.includes(id);

    // 快照: 请求失败时要能把 UI 恢复成请求前的样子
    const prevFavor = favorExercises;

    // Optimistic update
    const newFav = isFav ? favorExercises.filter(fid => fid !== id) : [...favorExercises, id];
    this.setData({ favorExercises: newFav });

    const list = this.data.list.map(item => {
      if (item.id === id) return { ...item, is_favorite: !isFav };
      return item;
    });
    this.setData({ list });

    api.callCloud('exercise.toggleFavorite', { exercise_id: id })
      .then((r) => {
        const list = r && r.result && r.result.favor_exercises;
        if (Array.isArray(list)) {
          app.applyExerciseFlags({ favor_exercises: list });
          this.setData({ favorExercises: list });
        }
      })
      .catch((err) => {
        // 乐观更新必须回滚: 否则心形变了但服务端没变, 下次进页面又跳回去
        console.error('[library] toggleFavorite failed:', err);
        this.setData({
          favorExercises: prevFavor,
          list: this.data.list.map(item => (
            item.id === id ? { ...item, is_favorite: isFav } : item
          )),
        });
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  },

  onDetailFavTap() {
    const ex = this.data.selectedExercise;
    if (!ex || !ex.id) return;
    const id = ex.id;
    const { favorExercises } = this.data;
    const wasFav = favorExercises.includes(id);

    // 快照: 请求失败时要能把 UI + 全局状态恢复成请求前的样子
    const prevFavor = favorExercises;
    const prevSelected = ex;

    // Optimistic update: sync global + page state
    const newFav = wasFav ? favorExercises.filter(fid => fid !== id) : [...favorExercises, id];
    this.setData({
      favorExercises: newFav,
      selectedExercise: { ...ex, is_favorite: !wasFav },
    });
    if (app.globalData) {
      app.globalData.favorExercises = newFav;
    }

    // Sync the underlying list card (in case it's the same item)
    const list = this.data.list.map(item => {
      if (item.id === id) return { ...item, is_favorite: !wasFav };
      return item;
    });
    this.setData({ list });

    // Toast
    const t = this.data.t || {};
    wx.showToast({
      title: t[wasFav ? 'FAV_REMOVED' : 'FAV_ADDED'] || (wasFav ? 'Unfavorited' : 'Favorited'),
      icon: 'none',
      duration: 1200,
    });

    api.callCloud('exercise.toggleFavorite', { exercise_id: id })
      .then((r) => {
        const list = r && r.result && r.result.favor_exercises;
        if (Array.isArray(list)) {
          app.applyExerciseFlags({ favor_exercises: list });
          this.setData({ favorExercises: list });
        }
      })
      .catch((err) => {
        // 乐观更新必须回滚: 弹层心形 / 列表心形 / 全局收藏都要还原, 并给用户提示
        console.error('[library] toggleFavorite failed:', err);
        this.setData({
          favorExercises: prevFavor,
          selectedExercise: { ...prevSelected, is_favorite: wasFav },
          list: this.data.list.map(item => (
            item.id === id ? { ...item, is_favorite: wasFav } : item
          )),
        });
        if (app.globalData) {
          app.globalData.favorExercises = prevFavor;
        }
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  },

  // 空事件处理器: wxml 里 catchtouchmove="noop" / catchtap="noop" 需要它存在,
  // 否则每次触摸遮罩都会抛 "noop is not a function"
  noop() {},

  async addToWorkout(e) {
    const item = e.currentTarget.dataset.item;

    if (this.data.addingToWorkout) return;  // 防重复点击

    // ⚠️ 原来是"先关弹层, 再判断登录状态, 不满足就静默 return" ——
    //    弹层消失后用户完全没有反馈, 也不知道点"加入训练"到底生效没有。
    //    改成: 等鉴权就绪 → 不满足就提示并且**保留弹层**, 满足才关弹层。
    const openid = await app.whenAuthReady();
    if (!openid || !app.globalData.userId) {
      wx.showToast({ title: '登录中，请稍后重试', icon: 'none' });
      return;
    }

    this.setData({ selectedExercise: null });

    this.setData({ addingToWorkout: true });
    wx.showLoading({ title: 'LOADING...', mask: true });

    try {
      // 1. 查 running session
      const runRes = await api.callCloud('session.getRunning');
      let sessionId;
      if (!runRes.result || !runRes.result.session) {
        // 没有就创建
        const createRes = await api.callCloud('session.create');
        if (!createRes.result || !createRes.result.success) {
          throw new Error('create session failed');
        }
        sessionId = createRes.result.sessionId
          || (createRes.result.session && (createRes.result.session._id || createRes.result.session.id));
      } else {
        sessionId = runRes.result.session._id || runRes.result.session.id;
      }

      // 2. 弹 add-exercise-modal, 预选这个 exercise
      //    分两次 setData: 先传 preselectedExercise 让 modal observer 跑, 再开 modal
      this.setData({
        currentSessionId: sessionId,
        preselectedExercise: item,
      });
      // 下一帧再开 modal, 确保 modal observer 先处理完 preselectedExercise
      this.setData({ showAddModal: true });
    } catch (err) {
      console.error('addToWorkout failed:', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ addingToWorkout: false });
    }
  },

  onAddModalClose() {
    this.setData({
      showAddModal: false,
      preselectedExercise: null,
    });
  },

  onAddModalExerciseAdded() {
    this.setData({
      showAddModal: false,
      preselectedExercise: null,
    });
    wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
  },

  doSelect(e) {
    const item = e.currentTarget.dataset.item;
    // ⚠️ 同上: 读端是 app.globalData.chosenExercise, 写端必须一致
    getApp().globalData.chosenExercise = item;
    this.setData({ selectedExercise: null });
    wx.navigateBack();
  },
});
