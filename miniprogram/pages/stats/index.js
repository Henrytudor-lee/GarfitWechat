// pages/stats/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    stats: {},
    exerciseList: [],
    selectedExerciseName: '',
    maxRecord: null,
    weeklyVolume: [],
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    await this._loadAll();
  },

  async _loadAll() {
    wx.showLoading({ title: 'LOADING...', mask: true });

    const [statsRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'stats', data: {} }),
    ]);

    wx.hideLoading();

    if (statsRes.result && statsRes.result.success) {
      this.setData({ stats: statsRes.result.stats });
    }
  },
});
