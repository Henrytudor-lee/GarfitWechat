// pages/exercise-share/index.js — 动作分享详情页
//
// B 点开 A 分享的**动作**卡片后进这里(path: /pages/exercise-share/index?token=xxx)。
// 数据走 share.view —— 这是**公开接口**, 不需要登录, 凭 token 精确查。
// (B 可能压根没登录过小程序, 更没有 A 的身份 —— 训练数据全按 _openid 归属校验,
//  只有 token 这一条路能读。动作虽然是全局公共目录, 但分享者身份一样要靠 token 认。)
//
// ⚠️ 后端 share.view 对"训练分享"和"动作分享"返回同一个结构,
//    用 kind 字段区分:
//      'training' → 转到训练分享页(防呆: 老的链接被塞到这个页也要能看)
//      'exercise' → 本页渲染
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    error: '',
    errorCode: '',

    token: '',
    owner: null,
    exercise: null,

    // 收藏: 动作级收藏(存在 user_exercise_stats), 与训练/会话无关,
    // 所以**分享页也能收藏**。状态从 app.globalData 读 —— 全局唯一事实来源。
    isFavorite: false,

    imgPrefix: '',
    vidPrefix: '',
    locale: 'zh',
    theme: 'night',
    t: {},
  },

  onLoad(query) {
    const token = (query && query.token) || '';
    this.setData({
      token,
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
    });
    if (!token) {
      this.setData({ loading: false, errorCode: 'NOT_FOUND', error: this._t('SHARE_NOT_FOUND') });
      return;
    }
    this.loadShare(token);
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

  async loadShare(token) {
    this.setData({ loading: true, error: '', errorCode: '' });
    try {
      const res = await api.callCloud('share.view', { token });
      const body = res.result || {};

      // 防呆: 训练分享的 token 落到这个页面 → 转去训练分享页, 别显示错内容
      if (body.kind === 'training') {
        wx.redirectTo({ url: `/pages/share/index?token=${token}` });
        return;
      }

      const exercise = body.exercise || null;
      this.setData({
        loading: false,
        owner: body.owner || null,
        exercise,
        isFavorite: exercise ? this._favorIds().includes(Number(exercise.id)) : false,
      });
    } catch (err) {
      // 失效原因要分清楚: 过期 / 被撤销 / 不存在 / 网络错
      const msg = String(err && err.message || '');
      let code = 'LOAD_FAILED';
      if (/过期/.test(msg)) code = 'EXPIRED';
      else if (/取消/.test(msg)) code = 'REVOKED';
      else if (/无效|不存在|删除/.test(msg)) code = 'NOT_FOUND';
      this.setData({
        loading: false,
        errorCode: code,
        error: this._t(
          code === 'EXPIRED' ? 'SHARE_EXPIRED'
            : code === 'REVOKED' ? 'SHARE_REVOKED'
            : code === 'NOT_FOUND' ? 'SHARE_NOT_FOUND'
            : 'SHARE_LOAD_FAILED',
        ),
      });
    }
  },

  onRetry() {
    this.loadShare(this.data.token);
  },

  /**
   * 收藏 / 取消收藏 这个动作
   *
   * 动作收藏是**动作级**的(存在 user_exercise_stats), 跟训练/会话无关,
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
   * 分享这个动作(接收方可以再转发)
   *
   * token 就是当前页面 URL 里的那个 —— 同一个动作同一个分享者,
   * 后端会复用同一个 token, 所以直接透传即可。
   */
  onShareAppMessage() {
    const isZh = (this.data.locale || 'zh') === 'zh';
    const ex = this.data.exercise;
    const name = isZh
      ? ((ex && (ex.name_zh || ex.name)) || '')
      : ((ex && (ex.name || ex.name_zh)) || '');
    return {
      title: isZh ? `推荐这个动作：${name} 💪` : `Great exercise: ${name} 💪`,
      path: `/pages/exercise-share/index?token=${this.data.token}`,
      imageUrl: ex && ex.image_name ? `${this.data.imgPrefix}/exer_images/${ex.image_name}` : '',
    };
  },
});
