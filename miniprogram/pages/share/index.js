// pages/share/index.js — 训练分享页
//
// B 点开 A 的分享卡片后进到这里(path: /pages/share/index?token=xxx)。
// 数据走 share.view —— 这是**公开接口**, 不需要登录, 凭 token 精确查。
// (B 可能压根没登录过小程序, 更没有 A 的身份 —— 训练数据全按 _openid 归属校验,
//  只有 token 这一条路能读。)
const app = getApp();
const api = require('../../utils/api.js');
// 动作元信息的口径统一收口到 utils/exerciseMeta.js
// (动作库页 / 训练分享页 / 动作分享页三处共用, 别再各写一份)
const { modeLabel } = require('../../utils/exerciseMeta.js');

/** 时长(秒) → "H:MM" / "M:SS"(与会话详情弹框同一口径) */
function formatDuration(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (total <= 0) return '--:--';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** ISO → 本地日期时间文本 */
function formatDateTime(iso, isZh) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return isZh ? `${ymd} ${hm}` : `${ymd} ${hm}`;
}

Page({
  data: {
    loading: true,
    error: '',
    errorCode: '',

    token: '',
    training: null,
    owner: null,
    groups: [],

    // 动作详情弹层
    detailOpen: false,
    detail: null,

    // 收藏: 动作级收藏(存在 user_exercise_stats), 与训练/会话无关,
    // 所以**分享页也能收藏**。状态从 app.globalData 读 —— 全局唯一事实来源。
    favorExercises: [],

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
      favorExercises: this._favorIds(),
    });
    if (!token) {
      this.setData({ loading: false, errorCode: 'NOT_FOUND', error: this._t('SHARE_NOT_FOUND') });
      return;
    }
    this.loadShare(token);
  },

  onShow() {
    // 主题/语言可能在设置里改过;
    // 收藏列表也要刷新 —— 静默登录是异步的, 用户可能在页面停留期间才登录完成。
    this.setData({
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
      favorExercises: this._favorIds(),
    });
    this._refreshDetailFav();
  },

  /** 全局收藏 id 列表(number[]) —— app.globalData 是唯一事实来源 */
  _favorIds() {
    const list = app.globalData.favorExercises;
    return Array.isArray(list) ? list.map(Number) : [];
  },

  /** 某个动作当前是否已收藏 */
  _isFav(id) {
    return this._favorIds().includes(Number(id));
  },

  /** 详情弹层打开/收藏变化后, 刷新弹层里的收藏态 */
  _refreshDetailFav() {
    const d = this.data.detail;
    if (!d || !d.exercise_id) return;
    const isFav = this._isFav(d.exercise_id);
    if (d.is_favorite === isFav) return;
    this.setData({ 'detail.is_favorite': isFav });
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
      const t = this.data.t || {};
      const isZh = (this.data.locale || 'zh') === 'zh';

      const groups = (body.groups || []).map((g) => ({
        ...g,
        // ⚠️ totalVolume / totalCalories 由**后端**算好(用的是分享者 A 的体重)。
        //    前端要是自己用 app.globalData.userWeight 算, 算的是**浏览者 B**的体重,
        //    每组卡路里会跟总卡路里对不上。所以这里直接用后端给的, 不重算。
        modeLabel: modeLabel(g.exercise_type, t),
      }));

      this.setData({
        loading: false,
        training: {
          ...(body.training || {}),
          durationStr: formatDuration(body.training && body.training.duration),
          dateText: formatDateTime(body.training && body.training.start_time, isZh),
        },
        owner: body.owner || null,
        groups,
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

  // No-op: 给 .sheet-mask 的 catchtouchmove 用 ——
  // 只拦 touchmove 不拦 touch 的话, 在弹层上滑动会带动背景页面滚动(滚动穿透)。
  noop() {},

  // ── 动作详情 ──
  onExerciseTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const g = this.data.groups[index];
    if (!g) return;
    // 标题/英文名/器械/肌群/计量方式都由 exercise-detail 组件按统一口径算,
    // 这里只补上组件算不了的: 收藏态 + 组列表
    this.setData({
      detailOpen: true,
      detail: {
        ...g,
        is_favorite: this._isFav(g.exercise_id),
      },
    });
  },

  closeDetail() {
    this.setData({ detailOpen: false, detail: null });
  },

  /**
   * 收藏 / 取消收藏 当前详情弹层里的动作
   *
   * 动作收藏是**动作级**的(存在 user_exercise_stats), 跟训练/会话无关,
   * 所以在分享页也能收藏 —— 看到别人的动作不错, 直接收藏进自己的库。
   *
   * 跟动作库页同一套逻辑: 乐观更新 → 调接口 → 用服务端返回的完整列表覆盖
   * (applyExerciseFlags 会同步写 globalData + storage, 各页面状态一致) → 失败回滚。
   */
  async onToggleFavorite() {
    const detail = this.data.detail;
    const id = Number(detail && detail.exercise_id);
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
    this.setData({ favorExercises: nextFav, 'detail.is_favorite': !isFav });

    try {
      const res = await api.callCloud('exercise.toggleFavorite', { exercise_id: id });
      const list = res && res.result && res.result.favor_exercises;
      if (Array.isArray(list)) {
        // 用服务端返回的完整列表覆盖 globalData + storage
        app.applyExerciseFlags({ favor_exercises: list });
        this.setData({ favorExercises: list.map(Number) });
        this._refreshDetailFav();
      }
      wx.showToast({
        title: this._t(isFav ? 'FAV_REMOVED' : 'FAV_ADDED'),
        icon: 'none',
      });
    } catch (err) {
      // 回滚成请求前的样子
      this.setData({ favorExercises: prevFavor });
      this._refreshDetailFav();
      console.error('[share] toggleFavorite failed:', err);
      wx.showToast({ title: this._t('LOAD_FAILED'), icon: 'none' });
    } finally {
      this._favBusy = false;
    }
  },

  onDetailMaskTap(e) {
    if (e.target === e.currentTarget) this.closeDetail();
  },

  onDetailSheetTap() {
    // 阻止冒泡到遮罩
  },

  // ── 去练自己的 ──
  goStartWorkout() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
