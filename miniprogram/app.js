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
    language: 'en',
    t: {},

    // ---- 日夜间主题 ----
    theme: 'night',
    themeVars: {},
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
    // 应用主题到 window 背景色（initTheme 内部已调用 applyTheme，此处不再重复调用）

    // 静默自动登录：优先从 storage 恢复，若无则调 wx.login + loginByWx 云函数
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    if (userId) this.globalData.userId = userId;
    if (openid) this.globalData.openid = openid;
    this.globalData.favorExercises = wx.getStorageSync('favorExercises') || [];
    this.globalData.practicedExercises = wx.getStorageSync('practicedExercises') || [];

    if (!openid) {
      await this.doSilentLogin();
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

  doSilentLogin: function () {
    return new Promise((resolve) => {
      wx.login({
        success: (loginRes) => {
          if (!loginRes.code) { resolve(); return; }
          wx.cloud.callFunction({
            name: 'loginByWx',
            data: { code: loginRes.code },
            success: (res) => {
              if (res.result && res.result.openid) {
                const { openid, userId, favor_exercises, practiced_exercises } = res.result;
                this.globalData.openid = openid;
                this.globalData.userId = userId;
                this.globalData.favorExercises = favor_exercises || [];
                this.globalData.practicedExercises = practiced_exercises || [];
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
