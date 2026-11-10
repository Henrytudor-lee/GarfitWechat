// pages/exercise-share/index.js — 动作分享详情页
//
// B 点开 A 分享的**动作**卡片后进这里(path: /pages/exercise-share/index?exercise_id=xxx)。
//
// 为什么是"带 id 直查", 而不是训练分享那种"分享链接表":
//   动作在 exercises_library 里是**全局公共目录数据** —— 同一份数据所有人看到都一样,
//   所以不需要 token 防枚举(能猜到 id 也只是看到动作库里本来就有的动作),
//   也不需要存 per-share 状态(这次分享没有任何业务属性), 更不需要撤销/限期
//   (内容一直在, 撤一个链接等于撤一个公开页面)。
//   接收方拿 id 走**已有的** library.detail 查就行, 后端零改动。
//
//   训练分享不同: 训练数据按 _openid 归属校验, 必须有一条"凭 token 精确查"的
//   公开只读通道, 那个场景确实要存状态、要建表。
//
// 数据来源: library.detail(SELECT * FROM exercises_library WHERE id = ?)
//   ⚠️ 该接口要 JWT —— 小程序打开时会自动静默登录, 这里 await app.whenAuthReady() 等它完成。
//
// 分享者信息(n=昵称 a=头像)直接**放在 URL 里**:
//   分享者身份只存在分享者本机(storage 的 userName/avatarUrl), 不入库;
//   接收方看到昵称头像, 看不到 openid —— 跟训练分享一个口径。
//   两个参数都可选: 没有就把"分享者"那一行整行隐藏, 不显示占位假信息。
const app = getApp();
const api = require('../../utils/api.js');

/**
 * URL 参数解码
 *
 * ⚠️ 微信各基础库对 onLoad 的 query 是否已经解码过不一致, 这里统一再解一次。
 *    已经解过的再解可能抛 URIError(比如昵称里带 "%"), 所以必须 try/catch 兜底,
 *    失败就用原值 —— 宁可多一个百分号, 也别整个页面打不开。
 */
function safeDecode(raw) {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch (e) {
    return raw;
  }
}

Page({
  data: {
    loading: true,
    error: '',
    errorCode: '',

    exerciseId: '',
    sharerName: '',
    sharerAvatar: '',
    exercise: null,

    // 收藏: 动作级收藏(存在 users.favor_exercises), 与训练/会话无关,
    // 所以**分享页也能收藏**。状态从 app.globalData 读 —— 全局唯一事实来源。
    isFavorite: false,

    imgPrefix: '',
    vidPrefix: '',
    locale: 'zh',
    theme: 'night',
    t: {},
  },

  onLoad(query) {
    const q = query || {};
    const exerciseId = Number(safeDecode(q.exercise_id)) || 0;

    this.setData({
      exerciseId,
      sharerName: safeDecode(q.n),
      sharerAvatar: safeDecode(q.a),
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
    });

    if (!exerciseId) {
      this.setData({ loading: false, errorCode: 'NOT_FOUND', error: this._t('SHARE_NOT_FOUND') });
      return;
    }
    this.loadExercise();
  },

  onShow() {
    // 主题/语言可能在设置里改过;
    // 收藏状态也要刷新 —— 静默登录是异步的, 用户可能在页面停留期间才登录完成。
    this.setData({
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
    });
    this._refreshFav();
    // 右上角菜单也要能转发 —— 定义了 onShareAppMessage, 这里把菜单打开
    wx.showShareMenu({ withShareTicket: true });
  },

  /** 全局收藏 id 列表(number[]) —— app.globalData 是唯一事实来源 */
  _favorIds() {
    const list = app.globalData.favorExercises;
    return Array.isArray(list) ? list.map(Number) : [];
  },

  /** 刷新页面上的收藏态 */
  _refreshFav() {
    const ex = this.data.exercise;
    if (!ex || !ex.id) return;
    const isFav = this._favorIds().includes(Number(ex.id));
    if (this.data.isFavorite !== isFav) this.setData({ isFavorite: isFav });
  },

  _t(key, fallback) {
    const dict = this.data.t || {};
    return dict[key] || fallback || key;
  },

  /**
   * 按 id 拉动作详情
   *
   * library.detail 返回 exercises_library 整行(id/name/name_zh/image_name/video_name/
   * equipment_id/body_part_id/exercise_type), 正好够渲染动作卡片 + 收藏。
   */
  async loadExercise() {
    this.setData({ loading: true, error: '', errorCode: '' });
    try {
      // library.detail 要 JWT —— 小程序启动时静默登录已经在跑了, 这里等它一下
      await app.whenAuthReady();
      const res = await api.callCloud('library.detail', { id: this.data.exerciseId });
      const exercise = (res && res.result && res.result.item) || null;
      if (!exercise) {
        this.setData({
          loading: false,
          errorCode: 'NOT_FOUND',
          error: this._t('SHARE_NOT_FOUND'),
        });
        return;
      }
      this.setData({
        loading: false,
        exercise,
        isFavorite: this._favorIds().includes(Number(exercise.id)),
      });
    } catch (err) {
      console.error('[exercise-share] load failed:', err);
      this.setData({
        loading: false,
        errorCode: 'LOAD_FAILED',
        error: this._t('SHARE_LOAD_FAILED'),
      });
    }
  },

  onRetry() {
    this.loadExercise();
  },

  /**
   * 收藏 / 取消收藏 这个动作
   *
   * 动作收藏是**动作级**的(存在 users.favor_exercises), 跟训练/会话无关,
   * 所以在分享页也能收藏 —— 看到别人的动作不错, 直接收藏进自己的库。
   *
   * 跟动作库页同一套逻辑: 乐观更新 → 调接口 → 用服务端返回的完整列表覆盖
   * (applyExerciseFlags 会同步写 globalData + storage, 各页面状态一致) → 失败回滚。
   */
  async onToggleFavorite() {
    const ex = this.data.exercise;
    const id = Number(ex && ex.id);
    if (!id) return;
    if (this._favBusy) return;

    // 收藏需要身份。本 app 是**静默登录**模式, 等它完成就行, 用户不用做任何事。
    const openid = await app.whenAuthReady();
    if (!openid || !app.globalData.userId) {
      wx.showToast({ title: this._t('NOT_LOGGED_IN'), icon: 'none' });
      return;
    }
    // 静默登录刚完成 → globalData 里的收藏列表才是最新的, 重新读一次再判断
    const favorIds = this._favorIds();
    const isFav = favorIds.includes(id);
    const prevFavor = favorIds;

    this._favBusy = true;
    // 乐观更新
    const nextFav = isFav ? favorIds.filter((x) => x !== id) : [...favorIds, id];
    this.setData({ isFavorite: !isFav });

    try {
      const res = await api.callCloud('exercise.toggleFavorite', { exercise_id: id });
      const list = res && res.result && res.result.favor_exercises;
      if (Array.isArray(list)) {
        // 用服务端返回的完整列表覆盖 globalData + storage
        app.applyExerciseFlags({ favor_exercises: list });
        this._refreshFav();
      }
      wx.showToast({
        title: this._t(isFav ? 'FAV_REMOVED' : 'FAV_ADDED'),
        icon: 'none',
      });
    } catch (err) {
      // 回滚成请求前的样子
      this.setData({ isFavorite: isFav });
      console.error('[exercise-share] toggleFavorite failed:', err);
      wx.showToast({ title: this._t('LOAD_FAILED'), icon: 'none' });
    } finally {
      this._favBusy = false;
    }
  },

  // ── 去练自己的 ──
  goStartWorkout() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  /**
   * 转发这个动作(接收方可以再转发)
   *
   * 分享者信息换成**当前转发的人** —— B 转给 C, C 看到的是 B 分享的。
   * 当前用户自己没填昵称/头像时, 沿用原分享者的信息(至少页面不空)。
   */
  onShareAppMessage() {
    const isZh = (this.data.locale || 'zh') === 'zh';
    const ex = this.data.exercise;
    if (!ex) {
      return {
        title: isZh ? 'GFIT 动作库 · 7000+ 专业动作' : 'GFIT Library · 7000+ professional exercises',
        path: '/pages/library/index',
      };
    }

    const name = isZh ? (ex.name_zh || ex.name) : (ex.name || ex.name_zh);
    const sharer = app.getSharerInfo ? app.getSharerInfo() : {};
    const sharerName = sharer.nickname || this.data.sharerName;
    const sharerAvatar = sharer.avatarUrl || this.data.sharerAvatar;
    const qs = [`exercise_id=${ex.id}`];
    if (sharerName) qs.push('n=' + encodeURIComponent(sharerName));
    if (sharerAvatar) qs.push('a=' + encodeURIComponent(sharerAvatar));

    return {
      title: isZh ? `推荐这个动作：${name} 💪` : `Great exercise: ${name} 💪`,
      path: `/pages/exercise-share/index?${qs.join('&')}`,
      imageUrl: ex.image_name ? `${this.data.imgPrefix}/exer_images/${ex.image_name}` : '',
    };
  },
});
