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

    // 读取登录状态，不强制的登录跳转，让用户自由访问首页
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');
    if (userId) {
      this.globalData.userId = userId;
      this.globalData.openid = openid || null;
    }
  },
});
