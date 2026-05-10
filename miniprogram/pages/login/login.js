// pages/login/login.js — 极简微信登录
const app = getApp();

Page({
  data: {
    loading: false,
  },

  async handleWxLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.showLoading({ title: '登录中...', mask: true });

    try {
      // 1. wx.login 获取 code
      const loginRes = await wx.login();
      if (!loginRes.code) {
        wx.hideLoading();
        wx.showModal({ title: '登录失败', content: '获取登录凭证失败，请稍后重试', showCancel: false });
        this.setData({ loading: false });
        return;
      }

      // 2. 发给云函数，在云函数端调 auth.code2Session 换 openid
      const res = await wx.cloud.callFunction({
        name: 'loginByWx',
        data: { code: loginRes.code },
      });

      wx.hideLoading();

      if (!res.result || !res.result.success) {
        wx.showModal({
          title: '登录失败',
          content: res.result?.error || '请稍后重试',
          showCancel: false,
        });
        this.setData({ loading: false });
        return;
      }

      const { userId, openid } = res.result;
      app.globalData.userId = userId;
      app.globalData.openid = openid;
      wx.setStorageSync('userId', userId);
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('isGuest', false);

      wx.reLaunch({ url: '/pages/index/index' });

    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        wx.showModal({
          title: '登录失败',
          content: err.errMsg || '请稍后重试',
          showCancel: false,
        });
      }
    }
  },
});
