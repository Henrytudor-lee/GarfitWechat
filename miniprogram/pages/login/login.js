// pages/login/login.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    phoneNumber: '',
    hasPhone: false,
    canLogin: false,
    loading: false,
  },

  onLoad() {
    const phone = wx.getStorageSync('phoneNumber');
    if (phone) {
      this.setData({ phoneNumber: phone, hasPhone: true });
      this._updateCanLogin();
    }
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
    this.setData({ nickname: e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ phoneNumber: e.detail.value });
    this._updateCanLogin();
  },

  _updateCanLogin() {
    const { avatarUrl, nickname, phoneNumber, hasPhone } = this.data;
    const hasPhoneAuth = hasPhone || (phoneNumber && phoneNumber.length === 11);
    this.setData({ canLogin: !!avatarUrl && !!nickname.trim() && !!hasPhoneAuth });
  },

  async handleLogin() {
    if (!this.data.canLogin || this.data.loading) return;
    this.setData({ loading: true });

    wx.showLoading({ title: '登录中...', mask: true });

    try {
      const { avatarUrl, nickname, phoneNumber: inputPhone } = this.data;

      const loginRes = await wx.cloud.callFunction({
        name: 'loginByWx',
        data: {
          nickname: nickname.trim(),
          avatar: avatarUrl,
          phoneNumber: inputPhone.trim(),
        },
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

      const { userId, openid, phoneNumber } = loginRes.result;
      app.globalData.userId = userId;
      app.globalData.openid = openid;
      app.globalData.userInfo = { nickname: nickname.trim(), avatar: avatarUrl };
      wx.setStorageSync('userId', userId);
      wx.setStorageSync('openid', openid);
      if (phoneNumber) {
        wx.setStorageSync('phoneNumber', phoneNumber);
      }

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
