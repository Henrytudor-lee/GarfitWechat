// components/workout-summary-modal/index.js
const app = getApp();
const api = require('../../utils/api.js');
const { setVolume } = require('../../utils/unit.js');
const { calcSetsCalories } = require('../../utils/calories.js');
// 计量方式口径(次数/计时/距离)统一走 exerciseMeta —— 跟动作库、分享页保持一致
// 海报绘制(canvas 2d 手绘) —— 为什么不用"截图": 小程序截不了 WXML
const poster = require('../../utils/poster.js');
// 相册是隐私接口 —— 后台没声明隐私类型会直接 errno 112, 调用前先过授权
const privacy = require('../../utils/privacy.js');

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    session: {
      type: Object,
      value: null,
    },
    sessionId: {
      // ⚠️ 父组件传进来的是**数字**(session id 是 int 自增主键),
      //    属性却声明成 String → 微信框架类型不匹配会报警告,
      //    某些基础库版本会直接丢成默认值 null → session_id 传不上去。
      //    两个类型都声明, 兼容数字和字符串。
      type: [String, Number],
      value: null,
    },
    locale: {
      type: String,
      value: 'en',
    },
  },

  data: {
    // ⚠️ 初始就给上 —— 弹框是 wx:if 渲染的, 第一次打开时 observer 里的
    //    setData 可能晚一帧, imgPrefix 为空会让图标/缩略图 src 变成相对路径
    //    (小程序里会渲染成裂图)。
    imgPrefix: app.globalData.imagePrefix || '',
    exerciseList: [],
    _locale: 'en',
    _dateStr: '',
    // 海报画布尺寸(兜底路径用; 主路径走 wx.createOffscreenCanvas)
    posterW: 375,
    posterH: 667,
    // 海报生成中 —— 防连点
    _posterBusy: false,
    t: app.globalData.t,  // 注入 i18n 字典
    // 分享 token —— 必须在**点分享之前**就准备好(见 onShareAppMessage 的注释)
    _shareToken: '',
    _shareFailed: false,
    _stats: {
      exerciseCount: 0,
      durationStr: '0 min',
      totalCalories: 0,
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'zh';
        const theme = app.globalData.theme || 'night';
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          _locale: locale,
          _theme: theme,
          _dateStr: this._computeDateStr(),
          // i18n 字典要从 app.globalData 重新取, 否则切换语言后弹框里还是旧语言
          t: app.globalData.t || {},
        });
      }
    },
    'isOpen, session': function(isOpen, session) {
      if (isOpen && session) {
        this._computeStats(session);
        // 预取分享 token
        this._prepareShareToken(session);
      }
    },
  },

  lifetimes: {
    attached() {
      // Enable share
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  pageLifetimes: {
    show() {
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  methods: {
    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    onSheetTap() {
      // 空实现: catchtap 用来阻止点击冒泡到遮罩
    },

    closeModal() {
      this.triggerEvent('close');
    },

    _computeStats(session) {
      // ⚠️ set 的字段命名有两套, 别混用:
      //    · 下划线(duration_sec / distance_km / weight_unit)—— 数据库列名直出,
      //      首页 / 会话详情 / 这个弹框走的是这一套;
      //    · 驼峰(durationSec / distanceKm / weightUnit)—— 卡路里算法(前后端共用)的契约,
      //      utils/set-model.js 和分享页走的是这一套。
      //    如果以后要把**分享页**的数据喂进这个弹框, 得先做一次字段转换。
      const exerciseList = session.exercises || [];
      // ⚠️ session.duration 的单位是**秒**(后端 TIMESTAMPDIFF(SECOND, ...)),
      //    调用方负责传秒(客户端毫秒 / 1000), 这里按秒换算分钟, 不要按毫秒
      const durationSec = Number(session.duration) || 0;
      const totalMinutes = Math.round(durationSec / 60);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const locale = app.globalData.language || 'zh';
      const durationStr = hours > 0
        ? (locale === 'zh' ? `${hours}小时${mins}分钟` : `${hours}h ${mins}m`)
        : (locale === 'zh' ? `${mins}分钟` : `${mins} min`);

      let totalCalories = session.calories || 0;
      const userWeight = app.globalData.userWeight || 60;
      // 为每个动作预计算 totalCalories (WXML 不支持方法调用, 必须在 data 字段里)
      // 卡路里 v1: 按该组的计量方式算 —— 计时类走 MET 法, 距离类走距离法
      const groups = exerciseList.map((ex) => {
        const cal = calcSetsCalories(ex.sets || [], userWeight);
        return {
          ...ex,
          // sets 恒为数组, 否则 wxml 里 item.sets.length 会报错
          sets: Array.isArray(ex.sets) ? ex.sets : [],
          // id 用动作 id, 保证 wx:key 唯一
          id: ex.exercise_id || ex.id,
          totalCalories: cal,
        };
      });
      // 如果没有已存储的 calories, 从各组的 calories 求和
      if (!totalCalories) {
        totalCalories = groups.reduce((sum, g) => sum + g.totalCalories, 0);
      }

      this.setData({
        exerciseList: groups,
        _stats: {
          exerciseCount: groups.length,
          durationStr,
          totalCalories,
        },
      });
    },

    _computeDateStr() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    },

    /**
     * 预取分享 token。
     *
     * ⚠️ **必须提前取**, 因为 onShareAppMessage 是**同步**回调 ——
     *    微信要求它同步返回 {title, path, imageUrl}, 没有 await 的余地。
     *    分享按钮又是 open-type="share"(点一下直接调起分享面板), 点完再取来不及。
     *    所以在弹框打开时就先把 token 备好。
     */
    async _prepareShareToken(session) {
      const sessionId = Number(session && (session.id || session._id)) || Number(this.data.sessionId) || 0;
      if (!sessionId) return;
      this.setData({ _shareToken: '', _shareFailed: false });
      try {
        const res = await api.callCloud('share.create', { session_id: sessionId });
        const token = res && res.result && res.result.share && res.result.share.token;
        if (token) {
          this.setData({ _shareToken: token });
        } else {
          this.setData({ _shareFailed: true });
        }
      } catch (err) {
        console.warn('[summary] 分享链接预取失败:', err);
        this.setData({ _shareFailed: true });
      }
    },

    /**
     * 右上角关闭按钮 —— 跟原来左下角"已完成"是同一个行为
     */
    onCloseTap() {
      this.closeModal();
    },

    // ── 生成分享海报(跟 pages/share 的"保存海报"同一套实现) ──
    /**
     * 生成海报并保存到相册
     *
     * 为什么前端画而不是后端出整张图:
     *   小程序**截不了 WXML**(canvas.drawImage 画不了 DOM 节点),
     *   后端渲染要装 headless Chromium, 跟现有部署链路冲突。
     *   所以排版在前端 canvas 画 —— 数据现成(就是弹框里这份 session), 零新增接口。
     */
    async onSavePoster() {
      if (this._posterBusy) return;
      if (!this.data.exerciseList || !this.data.exerciseList.length) {
        wx.showToast({ title: this._t('POSTER_NO_DATA'), icon: 'none' });
        return;
      }
      this._posterBusy = true;
      this.setData({ _posterBusy: true });
      // 隐私授权要先拿到 —— 否则海报画十几秒, 最后一步才被拦, 白等
      try {
        await privacy.ensurePrivacyAuthorized();
      } catch (e) {
        this._posterBusy = false;
        this.setData({ _posterBusy: false });
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
        console.error('[summary] save poster failed:', err);
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
        this.setData({ _posterBusy: false });
      }
    },

    /** i18n 取值 */
    _t(key, fallback) {
      const dict = this.data.t || {};
      return dict[key] || fallback || key;
    },

    /**
     * 画海报 → 临时文件路径
     *
     * 两条路, 主备关系:
     *   1) wx.createOffscreenCanvas —— 离屏画布**没有 CSS 尺寸**,
     *      导出区域跟像素尺寸完全一致, 不存在"逻辑像素 / 物理像素"的歧义。
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
        console.warn('[summary] offscreen canvas failed, fallback to dom canvas:', e1);
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
     * 海报要画的内容 —— 直接用弹框里这份 session, 不额外请求接口
     */
    _posterModel() {
      const d = this.data;
      const t = d.t || {};
      const isZh = (d._locale || 'zh') === 'zh';
      const sharer = typeof app.getSharerInfo === 'function' ? app.getSharerInfo() : {};
      const groups = (d.exerciseList || []).map((g) => ({
        key: String(g.id),
        name: isZh ? (g.name_zh || g.name) : (g.name || g.name_zh),
        calories: (g.totalCalories || 0) + ' ' + (t.CAL_UNIT_SHORT || '大卡'),
        // setText 内部自己认两套字段名(duration_sec / durationSec), 不用再转一道
        sets: (g.sets || []).map((s, i) => ({ num: i + 1, text: poster.setText(s, t) })),
      }));
      return {
        ownerName: sharer.nickname || (isZh ? 'GFIT 用户' : 'GFIT User'),
        ownerLabel: t.WORKOUT_SUMMARY_LABEL || (isZh ? '本次训练' : "TODAY'S WORKOUT"),
        dateText: d._dateStr || '',
        durationText: d._stats.durationStr || '--:--',
        exerciseCount: d._stats.exerciseCount || 0,
        calories: d._stats.totalCalories || 0,
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
        const token = await this._ensureShareToken();
        if (token) {
          const res = await api.callCloud('share.qrcode', {
            token,
            env_version: this._miniProgramEnv(),
          });
          const base64 = res && res.result && res.result.qrcode;
          if (base64) qrFile = poster.writeBase64File(base64, 'poster-qr.jpg');
        }
      } catch (err) {
        console.warn('[summary] qrcode unavailable:', err);
      }

      const assets = { avatar: null, qrcode: null, thumbs: {} };
      const jobs = [];

      // 头像
      const sharer = typeof app.getSharerInfo === 'function' ? app.getSharerInfo() : {};
      const avatarSrc = sharer.avatarUrl || '';
      if (avatarSrc) {
        jobs.push(poster.loadImage(canvas, avatarSrc).then((img) => { assets.avatar = img; }));
      }

      // 动作缩略图 —— 并发加载(loadImage 内部先试本地路径, 拿不到再试网络地址)
      for (const g of d.exerciseList || []) {
        if (!g.image_name) continue;
        const src = (d.imgPrefix || '') + '/exer_images/' + g.image_name;
        jobs.push(poster.loadImage(canvas, src).then((img) => {
          if (img) assets.thumbs[String(g.id)] = img;
        }));
      }

      // 小程序码(本地文件)
      if (qrFile) {
        jobs.push(poster.loadImage(canvas, qrFile).then((img) => { assets.qrcode = img; }));
      }

      await Promise.all(jobs);
      return assets;
    },

    /** 弹框打开时预取的 token 可能还没到 / 失败过, 这里兜底再取一次 */
    async _ensureShareToken() {
      if (this.data._shareToken) return this.data._shareToken;
      await this._prepareShareToken(this.data.session);
      return this.data._shareToken;
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

    onShareAppMessage() {
      const {_stats, _shareToken} = this.data;
      const isZh = app.globalData.language === 'zh';
      const title = isZh
        ? `刚完成了 ${_stats.exerciseCount} 个动作，训练 ${_stats.durationStr}，消耗 ${_stats.totalCalories} 大卡 💪`
        : `Just finished ${_stats.exerciseCount} exercises, ${_stats.durationStr} workout, ${_stats.totalCalories} kcal 💪`;
      // 拿到 token → 分享卡片直接进分享页(B 点开就能看到这场训练)
      // 没拿到 → 降级回首页, 并提示用户(不能静默发一个看不到内容的卡片)
      if (_shareToken) {
        return {
          title,
          path: `/pages/share/index?token=${_shareToken}`,
          imageUrl: '',
        };
      }
      wx.showToast({ title: isZh ? '分享链接生成失败' : 'Failed to create share link', icon: 'none' });
      return { title, path: '/pages/index/index' };
    },
  },
});
