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

    // ---- 新用户欢迎弹框 ----
    isNewUser: false,
    showWelcome: false,
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

  closeWelcomeModal() {
    this.globalData.showWelcome = false;
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
              this.globalData.showWelcome = is_new === true;
              const pages = getCurrentPages();
              if (pages.length > 0) {
                const indexPage = pages[pages.length - 1];
                if (indexPage.onWelcomeLoginReady) {
                  indexPage.onWelcomeLoginReady();
                }
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
