// pages/login/login.js
const app = getApp();

Page({
  data: {
    loading: false,
  },

  async handleLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.showLoading({ title: '登录中...', mask: true });

    try {
      // 获取微信用户信息（需用户点击授权）
      const profileRes = await wx.getUserProfile({
        desc: '用于展示您的健身资料',
      });

      const { avatarUrl, nickName } = profileRes.userInfo;

      // 调云函数登录（静默获取 openid）
      const loginRes = await wx.cloud.callFunction({
        name: 'loginByWx',
        data: { nickname: nickName, avatar: avatarUrl },
      });

      wx.hideLoading();

      if (!loginRes.result || !loginRes.result.success) {
        wx.showModal({
          title: '登录失败',
          content: loginRes.result?.error || '请稍后重试',
          showCancel: false,
        });
        this.setData({ loading: false });
        return;
      }

      // 保存到全局和本地
      app.globalData.userId = loginRes.result.userId;
      app.globalData.openid = loginRes.result.openid;
      app.globalData.userInfo = { nickname: nickName, avatar: avatarUrl };
      wx.setStorageSync('userId', loginRes.result.userId);
      wx.setStorageSync('openid', loginRes.result.openid);

      // 跳转主页
      wx.reLaunch({ url: '/pages/index/index' });

    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      // 用户拒绝授权时 err 为空，不提示
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        wx.showModal({
          title: '登录失败',
          content: err.errMsg || '请稍后重试',
          showCancel: false,
        });
      }
    }
  },

  handleGuest() {
    // 游客模式：生成临时 userId 存本地
    const guestId = 'guest_' + Date.now();
    app.globalData.userId = guestId;
    wx.setStorageSync('userId', guestId);
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
