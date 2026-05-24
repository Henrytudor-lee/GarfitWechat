// pages/exercise-detail/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    exercise: {},
    isFavorite: false,
    imgPrefix: '',
    vidPrefix: '',
    // i18n + theme
    locale: 'en',
    theme: 'night',
  },

  onLoad(opts) {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      vidPrefix: app.globalData.videoPrefix,
      locale: app.globalData.language || 'en',
      theme: app.globalData.theme || 'night',
    });
    if (opts.id) {
      this._loadExercise(opts.id, opts.name);
    }
  },

  onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'en';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }
  },

  async _loadExercise(id, name) {
    wx.showLoading({ title: 'LOADING...', mask: true });

    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'library.detail', id: parseInt(id) },
    });

    wx.hideLoading();

    if (res.result && res.result.success) {
      this.setData({ exercise: res.result.item || {} });
      wx.setNavigationBarTitle({ title: res.result.item.name_zh || name || 'EXERCISE' });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  async addToWorkout() {
    const exercise = this.data.exercise;
    const userId = app.globalData.userId;
    if (!exercise || !exercise.id || !userId) return;

    // Get or create running session
    const runRes = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'session.getRunning', openid: app.globalData.openid },
    });

    let sessionId;
    if (!runRes.result || !runRes.result.session) {
      const createRes = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'session.create', openid: app.globalData.openid },
      });
      if (!createRes.result || !createRes.result.success) return;
      sessionId = createRes.result.sessionId || (createRes.result.session && createRes.result.session.id);
    } else {
      sessionId = runRes.result.session.id;
    }

    await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'exercise.add',
        session_id: sessionId,
        openid: app.globalData.openid,
        exercise_id: exercise.id,
        name_zh: exercise.name_zh || exercise.name,
        name_en: exercise.name || null,
        image_name: exercise.image_name || null,
        video_name: exercise.video_name || null,
        weight: 0,
        reps: 0,
      },
    });

    wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
  },
});
