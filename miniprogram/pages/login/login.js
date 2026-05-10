// pages/login/login.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    phoneCode: '',      // 存 code，确认时一起发
    phoneNumber: '',    // 存展示用
    hasPhone: false,    // 老用户已有手机号
    canLogin: false,
    loading: false,
  },

  onGetPhoneNumber(e) {
    console.log('getphonenumber event', e)
  },

  onLoad() {
    // 检查是否已有手机号（从 storage 读）
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
    this._updateCanLogin();
  },

  onGetPhoneNumber(e) {
    console.log(e);
    // 已授权过则不再重复请求
    if (this.data.hasPhone) return;

    if (e.detail.code) {
      this.setData({
        phoneCode: e.detail.code,
        phoneNumber: '已授权',
      });
      this._updateCanLogin();
    }
  },

  _updateCanLogin() {
    const { avatarUrl, nickname, phoneCode, hasPhone } = this.data;
    // 有手机号（已存或新授权）即可
    const hasPhoneAuth = hasPhone || phoneCode;
    this.setData({ canLogin: !!avatarUrl && !!nickname.trim() && !!hasPhoneAuth });
  },

  async handleLogin() {
    if (!this.data.canLogin || this.data.loading) return;
    this.setData({ loading: true });

    wx.showLoading({ title: '登录中...', mask: true });

    try {
      const { avatarUrl, nickname, phoneCode } = this.data;

      const loginRes = await wx.cloud.callFunction({
        name: 'loginByWx',
        data: {
          nickname: nickname.trim(),
          avatar: avatarUrl,
          phoneCode,  // 新用户才有时才传
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
