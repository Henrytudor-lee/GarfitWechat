// app.js
const i18n = require('./utils/i18n.js');
const theme = require('./utils/theme.js');
const api = require('./utils/api.js');

App({
  globalData: {
    // ---- 后端地址（开发期 = 本机后端）----
    apiBaseUrl: api.BASE_URL,
    // ---- 静态资源 CDN (服务器根 URL, 子目录由调用方拼接) ----
    imagePrefix: 'https://gfit.l2ee.top',
    videoPrefix: 'https://gfit.l2ee.top',

    // ---- 用户信息（从 storage 恢复）----
    userInfo: null,
    userId: null,
    openid: null,

    // ---- 国际化 ----
    language: 'zh',
    t: {},

    // ---- 用户身体数据 (卡路里计算用) ----
    userWeight: 60,
    userHeight: 170,

    // ---- 日夜间主题 ----
    theme: 'night',
    themeVars: {},

    // ---- 新用户 ----
    // isNewUser: 本次登录后端判定为"新注册用户"
    // ⚠️ 这个字段的用法收在 app 层(见 openGuideOnce),
    //    页面不直接读它 —— 首页已经没有跟 is_new 相关的逻辑了。
    isNewUser: false,
    // showingGuide: 5 步引导页当前是否在展示(防止重复 navigateTo)
    showingGuide: false,

    // ---- 新用户默认资料 ----
    // 首次进入不再弹框收集信息, 直接给这一套默认值, 用户之后自己去 profile 页改。
    // 单一事实来源: profile 页的兜底、profile-modal 的初始值都读这里。
    defaultProfile: {
      height: 170,   // cm
      weight: 60,    // kg
      purpose: 1,    // 1 - 塑形; 2 - 减肥; 3 - 养生
    },
  },

  onLaunch: async function () {
    // ---- 初始化国际化 ----
    const lang = i18n.initLang();
    this.globalData.language = lang;
    this.globalData.t = i18n.getTranslations();

    // ---- 初始化主题 ----
    const currentTheme = theme.initTheme();
    this.globalData.theme = currentTheme;
    this.globalData.themeVars = theme.getThemeVars();

    // ---- 从 storage 恢复登录状态 ----
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    if (userId) this.globalData.userId = userId;
    if (openid) this.globalData.openid = openid;
    this.globalData.favorExercises = wx.getStorageSync('favorExercises') || [];
    this.globalData.practicedExercises = wx.getStorageSync('practicedExercises') || [];
    this.globalData.userWeight = wx.getStorageSync('userWeight') || 60;
    this.globalData.userHeight = wx.getStorageSync('userHeight') || 170;

    // ---- 静默登录 ----
    this.globalData.loginPromise = this.doSilentLogin();
  },

  onShow: function () {
    // 空: 旧代码是 cloud re-init, 现在没云环境就不需要
  },

  // ---- 国际化 ----
  setLanguage(lang) {
    i18n.setLang(lang);
    this.globalData.language = lang;
    this.globalData.t = i18n.getTranslations();
  },

  getLanguage() {
    return this.globalData.language;
  },

  // ---- 主题 ----
  setTheme(themeName) {
    theme.setTheme(themeName);
    this.globalData.theme = themeName;
    this.globalData.themeVars = theme.getThemeVars();
  },

  toggleTheme() {
    theme.toggleTheme();
    this.globalData.theme = theme.getTheme();
    this.globalData.themeVars = theme.getThemeVars();
  },

  getTheme() {
    return this.globalData.theme;
  },

  getThemeVars() {
    return this.globalData.themeVars;
  },

  // ---- 全局 running session ----
  // 单一事实来源: 任何页面创建/结束 session 都必须写这里,
  // 否则各页 local 状态与 global 脱节, onShow 同步时会误判成"session 被结束"而清空 UI.
  setRunningSession(session) {
    this.globalData.runningSession = session || null;
  },

  // 拉一次 running session 并写入 global.
  // 被 library / stats / profile 三个页面的 onLoad 用来点亮 orb 状态.
  async loadRunningSession() {
    try {
      const res = await api.call('session.getRunning');
      const session = (res && res.session) || null;
      this.setRunningSession(session);
      return session;
    } catch (e) {
      console.error('loadRunningSession failed:', e);
      return null;
    }
  },

  // ---- 鉴权就绪门闩 ----
  // 页面不要再用 setTimeout 轮询 globalData.openid ——
  // 那样既没法取消, 也没法区分"还在登录"和"登录失败"。
  // 这里直接复用 onLaunch 里已经建好的 loginPromise。
  // @param {number} timeoutMs 兜底超时, 避免 promise 永不 settle 时页面永远空白
  // @returns {Promise<string|null>} resolve 出 openid; 登录失败/超时则 resolve(null)
  whenAuthReady(timeoutMs = 15000) {
    if (this.globalData.openid) return Promise.resolve(this.globalData.openid);
    const pending = this.globalData.loginPromise || Promise.resolve();
    return Promise.race([
      pending.then(() => this.globalData.openid || null),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  },

  /**
   * 拿到 (或创建) running session。
   *
   * ⚠️ 必须做 **in-flight 去重**: 后端 session.create 是 check-then-insert
   *    (SELECT 无 running → INSERT), 没有事务也没有唯一约束。
   *    并发调两次 → 两条 status='active' 记录 → 用户的动作被拆到两条 session,
   *    另一条永远不 finish, 长期以"训练中"状态存在。
   *    触发路径: 用户连点悬浮球 / 页面 onShow 与 orb 点击同时进来。
   */
  ensureRunningSession() {
    if (this._ensurePromise) return this._ensurePromise;
    this._ensurePromise = this._ensureRunningSessionInner().finally(() => {
      this._ensurePromise = null;
    });
    return this._ensurePromise;
  },

  async _ensureRunningSessionInner() {
    let session = null;
    try {
      const runRes = await api.call('session.getRunning');
      session = (runRes && runRes.session) || null;
    } catch (e) {
      console.error('ensureRunningSession: getRunning failed', e);
    }

    if (session && session.start_time) {
      this.setRunningSession(session);
      return session;
    }

    wx.showLoading({ title: 'STARTING...', mask: true });
    try {
      const res = await api.call('session.create');
      if (res && res.success) {
        const s = res.session || { id: res.sessionId, start_time: new Date().toISOString() };
        this.setRunningSession(s);
        return s;
      }
      wx.showToast({ title: 'START FAILED', icon: 'none' });
      return null;
    } catch (e) {
      console.error('ensureRunningSession: create failed', e);
      wx.showToast({ title: 'START FAILED', icon: 'none' });
      return null;
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 新用户首次进入 → 展示一次 5 步引导页。
   *
   * ⚠️ 为什么放在 app 层:
   *    原来首页直接读 app.globalData.isNewUser 来决定要不要弹引导页,
   *    把后端的 is_new 字段和首页耦合在了一起。
   *    现在 is_new 的判断只留在这一层, 首页只管"到点了就调一下"。
   *
   * 引导页是纯教程、可以跳过, 不收集任何信息 ——
   * 真正过不了审核的是"首次进入强制收集个人信息"(原来的 welcome-modal)。
   *
   * ⚠️ 必须在页面生命周期里调用(App.onLaunch 里调会因为页面栈还是空的而失败)。
   *
   * @returns {boolean} 是否发起了跳转
   */
  openGuideOnce() {
    if (!this.globalData.isNewUser) return false;
    if (this.globalData.showingGuide) return false;
    // 打标用 storage: 保证引导页只出现一次, 无论后端 is_new 怎么算
    if (wx.getStorageSync('guideShown')) return false;

    this.globalData.showingGuide = true;
    wx.navigateTo({
      url: '/pages/guide/index',
      success: () => {
        wx.setStorageSync('guideShown', 1);
      },
      fail: () => {
        this.globalData.showingGuide = false;
      },
    });
    return true;
  },

  /**
   * 给新用户落一份默认资料(身高 / 体重 / 运动目的)。
   *
   * ⚠️ 2026-11-09 背景:
   *    原来新用户首次进入会弹 welcome-modal 收集姓名/头像/身高/体重/生日/性别/目的,
   *    属于"首次进入强制收集个人信息" → 微信小程序审核不通过。
   *    现在改成"首次进入直接给默认资料, 用户之后自己去 profile 页改"。
   *
   * 后端 users 表的 height/weight/purpose 本来就有 DEFAULT (170/60/1),
   * 这里再显式写一次, 是为了兜住"后端 INSERT 显式传了 NULL"的情况 ——
   * 否则后端拿到的就是 NULL, 而不是一份可用的基线值。
   *
   * 幂等: 用 storage 打标, 一次安装只写一次; 写失败不落标, 下次启动会重试。
   */
  seedDefaultProfile() {
    if (this._seedPromise) return this._seedPromise;
    if (wx.getStorageSync('defaultProfileSeeded')) return Promise.resolve();

    const d = this.globalData.defaultProfile;
    this._seedPromise = api.call('profile.updateFull', {
      height: d.height,
      weight: d.weight,
      purpose: d.purpose,
    })
      .then(() => {
        wx.setStorageSync('defaultProfileSeeded', 1);
      })
      .catch((e) => {
        console.error('[app] seedDefaultProfile failed', e);
      })
      .finally(() => {
        this._seedPromise = null;
      });
    return this._seedPromise;
  },

  /**
   * 更新"收藏/练过"的本地缓存。
   *
   * 后端在 markPracticed / toggleFavorite 之后会返回**完整的最新列表**,
   * 这里统一落到 globalData + storage, 各页面就不用各自再拉一次。
   *
   * ⚠️ 之前的问题是: globalData.practicedExercises 只在启动/登录时更新,
   *    加完动作后没人刷它 → "已训练"筛选用的还是旧列表, 刚练过的动作筛不出来。
   *
   * @param {object} payload { favor_exercises?: number[], practiced_exercises?: number[] }
   */
  applyExerciseFlags(payload) {
    if (!payload) return;
    const gd = this.globalData;

    if (Array.isArray(payload.favor_exercises)) {
      gd.favorExercises = payload.favor_exercises;
      wx.setStorageSync('favorExercises', payload.favor_exercises);
    }
    if (Array.isArray(payload.practiced_exercises)) {
      gd.practicedExercises = payload.practiced_exercises;
      wx.setStorageSync('practicedExercises', payload.practiced_exercises);
    }
  },

  doSilentLogin: function () {
    return new Promise((resolve) => {
      wx.login({
        success: async (loginRes) => {
          if (!loginRes.code) { resolve(); return; }
          try {
            const res = await api.call('login.code', { code: loginRes.code });
            if (res && res.openid) {
              const { openid, userId, favor_exercises, practiced_exercises, is_new, token } = res;
              if (token) api.setToken(token);
              this.globalData.openid = openid;
              this.globalData.userId = userId;
              this.globalData.favorExercises = favor_exercises || [];
              this.globalData.practicedExercises = practiced_exercises || [];
              this.globalData.isNewUser = is_new === true;
              // 新用户: 落一份默认资料(身高/体重/运动目的)。
              // 首次进入已经不再弹"资料录入"弹框, 这套默认值就是用户看到的初始状态。
              if (is_new === true) {
                this.seedDefaultProfile();
              }
              wx.setStorageSync('openid', openid);
              wx.setStorageSync('userId', userId);
              wx.setStorageSync('favorExercises', favor_exercises || []);
              wx.setStorageSync('practicedExercises', practiced_exercises || []);
            }
          } catch (e) {
            console.error('doSilentLogin failed:', e);
          }
          resolve();
        },
        fail: () => { resolve(); },
      });
    });
  },
});
