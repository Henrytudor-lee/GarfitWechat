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
const { normalizeAvatar } = require('../../utils/avatar.js');
// 海报绘制(canvas 2d 手绘) —— 为什么不用"截图": 小程序截不了 WXML
const poster = require('../../utils/poster.js');
// 相册是隐私接口 —— 后台没声明隐私类型会直接 errno 112, 调用前先过授权
const privacy = require('../../utils/privacy.js');

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

    // 离屏画布的 CSS 尺寸(兜底路径用; 主路径走 wx.createOffscreenCanvas)
    posterW: 375,
    posterH: 667,
  },

  onLoad(query) {
    // ⚠️ 小程序码扫码进来时 token 走 query.scene
    //    (微信把 getUnlimited 的 scene 当 query 参数传给页面),
    //    直接分享卡片进来才是 query.token。
    const token = (query && (query.token || query.scene)) || '';
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

  /**
   * 分享者头像归一化
   *
   * ⚠️ 库里的原始值可能是老的 cloud:// 格式, 直接给 <image> 用不了,
   *    海报 canvas 更必须绝对地址 —— 统一过一道 normalizeAvatar。
   */
  _normalizeOwner(owner) {
    if (!owner) return null;
    return { ...owner, avatar: normalizeAvatar(owner.avatar, this.data.imgPrefix) };
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
        owner: this._normalizeOwner(body.owner || null),
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

  // ── 保存海报到相册 ──
  /**
   * 生成海报并保存到相册
   *
   * 为什么前端画而不是后端出整张图:
   *   小程序**截不了 WXML**(canvas.drawImage 画不了 DOM 节点),
   *   后端渲染要装 headless Chromium, 跟现有部署链路冲突。
   *   所以后端只出小程序码, 排版在前端 canvas 画 —— 数据现成, 零新增数据接口。
   */
  async onSavePoster() {
    if (this._posterBusy) return;
    if (!this.data.training || !this.data.groups.length) {
      wx.showToast({ title: this._t('POSTER_NO_DATA'), icon: 'none' });
      return;
    }
    this._posterBusy = true;
    // 隐私授权要先拿到 —— 否则海报画十几秒, 最后一步才被拦, 白等
    try {
      await privacy.ensurePrivacyAuthorized();
    } catch (e) {
      this._posterBusy = false;
      wx.showModal({
        title: this._t('PRIVACY_TITLE'),
        content: this._t('PRIVACY_DENIED'),
        showCancel: false,
      });
      return;
    }
    wx.showLoading({ title: this._t('POSTER_GENERATING'), mask: true });
    try {
      const filePath = await this._buildPoster();
      await this._saveToAlbum(filePath);
      wx.hideLoading();
      wx.showToast({ title: this._t('POSTER_SAVED'), icon: 'success' });
    } catch (err) {
      console.error('[share] save poster failed:', err);
      wx.hideLoading();
      const reason = String((err && (err.errMsg || err.message)) || err || '');
      // 相册权限被拒时 _saveToAlbum 已经弹过"去设置"了, 别再叠一个弹框
      if (reason !== 'album auth denied' && reason !== 'privacy scope not declared') {
        // 把**真实原因**显示出来 —— 只弹个"生成失败"的 toast 根本没法排查
        wx.showModal({
          title: this._t('POSTER_FAILED'),
          content: reason || this._t('POSTER_FAILED'),
          showCancel: false,
        });
      }
    } finally {
      this._posterBusy = false;
    }
  },

  /**
   * 画海报 → 临时文件路径
   *
   * 两条路, 主备关系:
   *   1) wx.createOffscreenCanvas —— 离屏画布**没有 CSS 尺寸**,
   *      导出区域跟像素尺寸完全一致, 不存在"逻辑像素 / 物理像素"的歧义,
   *      也不会因为元素被隐藏(iOS 不栅格化不可见画布)而导出失败。
   *   2) DOM 里的 canvas —— 兜底(老基础库没有 createOffscreenCanvas),
   *      这条路 CSS 尺寸必须跟像素尺寸设成一样大, 否则老基础库按 CSS 尺寸
   *      算导出区域, 出来的图会被压扁 / 少一截。
   */
  async _buildPoster() {
    const model = this._posterModel();
    const plan = poster.planPoster(model);
    try {
      const canvas = this._offscreenCanvas(plan);
      const assets = await this._posterAssets(canvas);
      return await poster.renderPoster({ canvas, plan, assets });
    } catch (e1) {
      console.warn('[share] offscreen canvas failed, fallback to dom canvas:', e1);
      const canvas = await this._domPosterCanvas(plan);
      const assets = await this._posterAssets(canvas);
      return await poster.renderPoster({ canvas, plan, assets });
    }
  },

  /** 离屏画布(基础库 2.16.1+) —— 没有 CSS 尺寸, 导出最稳 */
  _offscreenCanvas(plan) {
    if (typeof wx.createOffscreenCanvas !== 'function') {
      throw new Error('createOffscreenCanvas unsupported');
    }
    const canvas = wx.createOffscreenCanvas({ type: '2d', width: plan.pxW, height: plan.pxH });
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('createOffscreenCanvas unavailable');
    }
    return canvas;
  },

  /** 兜底: DOM 里的 canvas 节点(CSS 尺寸跟像素尺寸保持一致) */
  async _domPosterCanvas(plan) {
    await new Promise((resolve) => {
      this.setData({ posterW: plan.pxW, posterH: plan.pxH }, resolve);
    });
    await new Promise((resolve) => wx.nextTick(resolve));
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#posterCanvas').node((res) => {
        if (res && res.node) resolve(res.node);
        else reject(new Error('poster canvas not ready'));
      }).exec();
    });
  },

  /**
   * 当前小程序版本环境(develop / trial / release)
   *
   * ⚠️ 小程序码必须指向**当前这个版本**才扫得开 ——
   *    开发者工具里生成的码如果指到正式版, 正式版可能还没有这个页面。
   */
  _miniProgramEnv() {
    try {
      const info = wx.getAccountInfoSync();
      return (info && info.miniProgram && info.miniProgram.envVersion) || 'release';
    } catch (e) {
      return 'release';
    }
  },

  /** 海报要画的内容 —— 跟页面共用同一份数据, 不额外请求接口 */
  _posterModel() {
    const d = this.data;
    const t = d.t || {};
    const isZh = (d.locale || 'zh') === 'zh';
    const owner = d.owner || {};
    const training = d.training || {};
    const groups = (d.groups || []).map((g) => ({
      key: String(g.exercise_id),
      name: isZh ? (g.name_zh || g.name_en) : (g.name_en || g.name_zh),
      sub: g.sets.length + ' ' + (g.sets.length === 1 ? (t.SET || '组') : (t.SETS || '组')) + ' · ' + g.modeLabel,
      calories: g.totalCalories + ' ' + (t.CAL_UNIT_SHORT || '大卡'),
      sets: (g.sets || []).map((s, i) => ({ num: i + 1, text: poster.setText(s, t) })),
    }));
    return {
      ownerName: owner.name || (isZh ? 'GFIT 用户' : 'GFIT User'),
      ownerLabel: (t.SHARE_BY || '来自') + ' ' + (t.SHARE_TRAINING || '分享的训练'),
      dateText: training.dateText || '',
      durationText: training.durationStr || '--:--',
      exerciseCount: training.exercise_count || groups.length,
      calories: training.calories || 0,
      groups,
      moreTemplate: isZh ? '等 {n} 个动作' : '+{n} more exercises',
      footerHint: isZh ? '扫码查看完整训练' : 'Scan to view the full workout',
      t,
    };
  },

  /**
   * 准备海报要用的图
   *
   * ⚠️ 网络图必须先换成本地路径才能画到 canvas —— 直接 drawImage 网络图
   *    会污染画布, 导致 canvasToTempFilePath 导出失败。
   */
  async _posterAssets(canvas) {
    const d = this.data;

    // 小程序码 —— 拉不到就退化成"海报不带码", 不阻断整个保存
    let qrFile = '';
    try {
      const res = await api.callCloud('share.qrcode', { token: d.token, env_version: this._miniProgramEnv() });
      const base64 = res && res.result && res.result.qrcode;
      if (base64) qrFile = poster.writeBase64File(base64, 'poster-qr.jpg');
    } catch (err) {
      console.warn('[share] qrcode unavailable:', err);
    }

    const assets = { avatar: null, qrcode: null, thumbs: {} };
    const jobs = [];

    // 头像
    const avatarSrc = (d.owner && d.owner.avatar) || '';
    if (avatarSrc) {
      jobs.push(poster.loadImage(canvas, avatarSrc).then((img) => { assets.avatar = img; }));
    }

    // 动作缩略图 —— 并发加载(loadImage 内部先试本地路径, 拿不到再试网络地址)
    for (const g of d.groups || []) {
      if (!g.image_name) continue;
      const src = d.imgPrefix + '/exer_images/' + g.image_name;
      jobs.push(poster.loadImage(canvas, src).then((img) => {
        if (img) assets.thumbs[String(g.exercise_id)] = img;
      }));
    }

    // 小程序码(本地文件)
    if (qrFile) {
      jobs.push(poster.loadImage(canvas, qrFile).then((img) => { assets.qrcode = img; }));
    }

    await Promise.all(jobs);
    return assets;
  },

  /** 存相册 —— 用户拒了相册权限就引导去设置里开 */
  _saveToAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: (err) => {
          const msg = String((err && err.errMsg) || '');
          // 后台《用户隐私保护指引》没声明相册(仅写入) → errno 112
          // 这不是用户权限问题, 弹"去设置"没用, 得让开发者去后台补声明
          if (privacy.isPrivacyScopeError(err)) {
            wx.showModal({
              title: this._t('POSTER_FAILED'),
              content: this._t('PRIVACY_NOT_DECLARED'),
              showCancel: false,
            });
            reject(new Error('privacy scope not declared'));
            return;
          }
          if (/auth deny|authorize|deny/i.test(msg)) {
            wx.showModal({
              title: this._t('POSTER_SAVE_TIP'),
              content: this._t('POSTER_SAVE_AUTH'),
              confirmText: this._t('GO_SETTINGS'),
              success: (r) => { if (r.confirm) wx.openSetting({}); },
            });
            reject(new Error('album auth denied'));
            return;
          }
          reject(new Error(msg || 'save failed'));
        },
      });
    });
  },
});
