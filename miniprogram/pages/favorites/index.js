// pages/favorites/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    list: [],
    imgPrefix: '',
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    wx.showLoading({ title: 'LOADING...', mask: true });
    const res = await wx.cloud.callFunction({
      name: 'favorites',
      data: { action: 'list' },
    });
    wx.hideLoading();

    if (res.result && res.result.success) {
      const items = (res.result.list || []).map(item => ({
        ...item,
        equipment_name: item.equipment_name || 'Other',
      }));
      this.setData({ list: items });
    }
  },

  onExerciseTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/exercise-detail/index?id=${item._id || item.exercise_id}&name=${encodeURIComponent(item.name_zh || item.name)}`,
    });
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;
    await wx.cloud.callFunction({
      name: 'favorites',
      data: { action: 'remove', exerciseId: id },
    });
    this.setData({ list: this.data.list.filter(item => item._id !== id) });
    wx.showToast({ title: 'REMOVED', icon: 'success' });
  },
});
