// pages/exercise-detail/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    exercise: {},
    isFavorite: false,
    imgPrefix: '',
    vidPrefix: '',
  },

  onLoad(opts) {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      vidPrefix: app.globalData.videoPrefix,
    });
    if (opts.id) {
      this._loadExercise(opts.id, opts.name);
    }
  },

  async _loadExercise(id, name) {
    wx.showLoading({ title: 'LOADING...', mask: true });

    const res = await wx.cloud.callFunction({
      name: 'exerciseLibrary',
      data: { action: 'detail', id: parseInt(id) },
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
      name: 'session',
      data: { action: 'getRunning', openid: app.globalData.openid },
    });

    let sessionId;
    if (!runRes.result || !runRes.result.session) {
      const createRes = await wx.cloud.callFunction({
        name: 'session',
        data: { action: 'create', openid: app.globalData.openid },
      });
      if (!createRes.result || !createRes.result.success) return;
      sessionId = createRes.result.sessionId || (createRes.result.session && createRes.result.session.id);
    } else {
      sessionId = runRes.result.session.id;
    }

    await wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'add',
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
