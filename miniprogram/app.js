// app.js
App({
  globalData: {
    env: 'cloudbase-d9gwy4qvodf85fe69',
    // 云存储资源前缀（cloud:// 格式，微信 image/video 标签直接使用）
    imagePrefix: 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036/media/images',
    videoPrefix: 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036/media/videos',
    userInfo: null,
    userId: null,
    openid: null,
  },
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // 静默自动登录：优先从 storage 恢复，若无则调 wx.login + loginByWx 云函数
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    if (userId) this.globalData.userId = userId;
    if (openid) this.globalData.openid = openid;

    if (!openid) {
      this.doSilentLogin();
    }
  },

  doSilentLogin: function () {
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) return;
        wx.cloud.callFunction({
          name: 'loginByWx',
          data: { code: loginRes.code },
          success: (res) => {
            if (res.result && res.result.openid) {
              const { openid, userId } = res.result;
              this.globalData.openid = openid;
              this.globalData.userId = userId;
              wx.setStorageSync('openid', openid);
              wx.setStorageSync('userId', userId);
            }
          },
          fail: () => {
            // 静默失败，不弹窗
          },
        });
      },
    });
  },
});
