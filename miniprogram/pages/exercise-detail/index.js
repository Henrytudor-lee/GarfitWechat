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

    // Fetch exercise detail
    const res = await wx.cloud.callFunction({
      name: 'exerciseLibrary',
      data: { action: 'get', id },
    });

    // Check favorite status
    const favRes = await wx.cloud.callFunction({
      name: 'favorites',
      data: { action: 'check', exerciseId: id },
    });

    wx.hideLoading();

    if (res.result && res.result.success) {
      this.setData({
        exercise: res.result.exercise,
        isFavorite: (favRes.result && favRes.result.isFavorite) || false,
      });
      wx.setNavigationBarTitle({ title: res.result.exercise.name_zh || name || 'EXERCISE' });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  async toggleFavorite() {
    const exercise = this.data.exercise;
    if (!exercise || !exercise._id) return;

    await wx.cloud.callFunction({
      name: 'favorites',
      data: {
        action: this.data.isFavorite ? 'remove' : 'add',
        exerciseId: exercise._id,
      },
    });

    this.setData({ isFavorite: !this.data.isFavorite });
    wx.showToast({
      title: this.data.isFavorite ? 'ADDED TO FAVORITES' : 'REMOVED',
      icon: 'success',
    });
  },

  async addToWorkout() {
    const exercise = this.data.exercise;
    if (!exercise || !exercise._id) return;

    let userId = app.globalData.userId;
    if (!userId) {
      const loginRes = await wx.cloud.callFunction({ name: 'loginByWx' });
      if (loginRes.result && loginRes.result.success) userId = loginRes.result && loginRes.result.userId;
    }
    if (!userId) return;

    // Get or create running session
    const runRes = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'getRunning', userId },
    });

    let sessionId;
    if (!runRes.result || !runRes.result.session) {
      const createRes = await wx.cloud.callFunction({
        name: 'session',
        data: { action: 'create', userId },
      });
      if (!createRes.result || !createRes.result.success) return;
      sessionId = createRes.result && (createRes.result.sessionId || (createRes.result.session && createRes.result.session._id));
    } else {
      sessionId = runRes.result.session._id;
    }

    await wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'add',
        sessionId,
        userId,
        exercise_id: exercise._id,
        name: exercise.name_zh || exercise.name,
        weight: 0,
        reps: 0,
      },
    });

    wx.showToast({ title: 'ADDED TO WORKOUT', icon: 'success' });
  },
});
