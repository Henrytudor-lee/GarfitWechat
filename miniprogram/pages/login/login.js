// pages/login/login.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    canLogin: false,
    loading: false,
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
    this._updateCanLogin();
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onNicknameBlur(e) {
    // 微信 input type=nickname 弹的是键盘，blur 时 value 才是最终值
    this.setData({ nickname: e.detail.value });
    this._updateCanLogin();
  },

  _updateCanLogin() {
    const { avatarUrl, nickname } = this.data;
    this.setData({ canLogin: !!avatarUrl && !!nickname.trim() });
  },

  async handleLogin() {
    if (!this.data.canLogin || this.data.loading) return;
    this.setData({ loading: true });

    wx.showLoading({ title: '登录中...', mask: true });

    try {
      const { avatarUrl, nickname } = this.data;

      const loginRes = await wx.cloud.callFunction({
        name: 'loginByWx',
        data: { nickname: nickname.trim(), avatar: avatarUrl },
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
      app.globalData.userInfo = { nickname: nickname.trim(), avatar: avatarUrl };
      wx.setStorageSync('userId', loginRes.result.userId);
      wx.setStorageSync('openid', loginRes.result.openid);

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

  handleGuest() {
    const guestId = 'guest_' + Date.now();
    app.globalData.userId = guestId;
    wx.setStorageSync('userId', guestId);
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
