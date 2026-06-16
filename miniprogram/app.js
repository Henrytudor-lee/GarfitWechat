// app.js
const i18n = require('./utils/i18n.js');
const theme = require('./utils/theme.js');

App({
  globalData: {
    env: 'cloudbase-d9gwy4qvodf85fe69',
    // 云存储资源前缀（cloud:// 格式，微信 image/video 标签直接使用）
    imagePrefix: 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036/media/images',
    videoPrefix: 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036/media/videos',
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
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // ---- 初始化国际化：从 storage 恢复语言状态 ----
    const savedLang = wx.getStorageSync('language');
    const lang = i18n.initLang();
    this.globalData.language = lang;
    this.globalData.t = i18n.getTranslations();

    // ---- 初始化日夜间主题：从 storage 恢复主题状态 ----
    const savedTheme = wx.getStorageSync('theme');
    const currentTheme = theme.initTheme();
    this.globalData.theme = currentTheme;
    this.globalData.themeVars = theme.getThemeVars();

    // 静默自动登录：优先从 storage 恢复，若无则调 wx.login + loginByWx 云函数
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    if (userId) this.globalData.userId = userId;
    if (openid) this.globalData.openid = openid;
    this.globalData.favorExercises = wx.getStorageSync('favorExercises') || [];
    this.globalData.practicedExercises = wx.getStorageSync('practicedExercises') || [];
    this.globalData.userWeight = wx.getStorageSync('userWeight') || 60;
    this.globalData.userHeight = wx.getStorageSync('userHeight') || 170;

    this.globalData.loginPromise = this.doSilentLogin();
  },

  onShow: function () {
    // 每次小程序从后台回到前台，重新初始化云环境，确保 cloud:// URL 能正常访问
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: false,
      });
    }
  },

  // ---- 国际化切换 API ----
  setLanguage(lang) {
    i18n.setLang(lang);
    this.globalData.language = lang;
    this.globalData.t = i18n.getTranslations();
  },

  getLanguage() {
    return this.globalData.language;
  },

  // ---- 主题切换 API ----
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
  // 4 个页面 (index/library/stats/profile) 通过 loadRunningSession 共享状态
  async loadRunningSession() {
    if (!this.globalData.openid) return null;
    try {
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'session.getRunning', openid: this.globalData.openid },
      });
      const session = (res && res.result && res.result.session) || null;
      this.globalData.runningSession = session;
      return session;
    } catch (e) {
      console.error('loadRunningSession failed:', e);
      return null;
    }
  },

  setRunningSession(session) {
    this.globalData.runningSession = session;
  },

  // 兜底创建: 如果没有 running session 就创建一个
  // 先查服务端确认 (避免依赖可能过期的 globalData), 没有再创建
  async ensureRunningSession() {
    if (!this.globalData.openid) return null;

    // 先查服务端, 拿到权威状态
    let session = null;
    try {
      const runRes = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'session.getRunning', openid: this.globalData.openid },
      });
      session = (runRes && runRes.result && runRes.result.session) || null;
    } catch (e) {
      console.error('ensureRunningSession: getRunning failed', e);
    }

    if (session && session.start_time) {
      this.globalData.runningSession = session;
      return session;
    }

    // 服务端没有 running session, 创建一个
    wx.showLoading({ title: 'STARTING...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'session.create', openid: this.globalData.openid },
      });
      if (res.result && res.result.success) {
        const s = res.result.session
          || { id: res.result.sessionId, start_time: new Date().toISOString(), _id: res.result.sessionId };
        this.globalData.runningSession = s;
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
  // ---- 欢迎弹框控制 ----
  closeWelcomeModal() {
    this.globalData.showWelcome = false;
  },

  doSilentLogin: function () {
    return new Promise((resolve) => {
      wx.login({
        success: (loginRes) => {
          if (!loginRes.code) { resolve(); return; }
          wx.cloud.callFunction({
            name: 'api',
            data: { action: 'login.code', code: loginRes.code },
            success: (res) => {
              if (res.result && res.result.openid) {
                const { openid, userId, favor_exercises, practiced_exercises, is_new } = res.result;
                this.globalData.openid = openid;
                this.globalData.userId = userId;
                this.globalData.favorExercises = favor_exercises || [];
                this.globalData.practicedExercises = practiced_exercises || [];
                this.globalData.isNewUser = is_new === true;
                this.globalData.showWelcome = is_new === true;
                // Notify index page to check showWelcome
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
              resolve();
            },
            fail: () => { resolve(); },
          });
        },
        fail: () => { resolve(); },
      });
    });
  },
});
