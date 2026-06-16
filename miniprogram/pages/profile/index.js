// pages/profile/index.js — garcia-fitness-new style
const app = getApp();

// Fire color tiers: 0=gray, 1-7=orange, 8-30=yellow, 31-60=lime, 61-120=green, 121-360=teal, 361+=blue
function getFlameColor(streak) {
  if (streak === 0) return 'color-neutral-600';
  if (streak <= 7) return 'color-orange';
  if (streak <= 30) return 'color-yellow';
  if (streak <= 60) return 'color-lime';
  if (streak <= 120) return 'color-green';
  if (streak <= 360) return 'color-teal';
  return 'color-blue';
}

// Trophy color by level: ROOKIE=gray, BEGINNER=orange, INTERMEDIATE=yellow, ADVANCED=lime, EXPERT=green, ELITE=blue
function getTrophyColor(lv) {
  if (lv <= 1) return 'color-neutral-600';
  if (lv === 2) return 'color-orange';
  if (lv === 3) return 'color-yellow';
  if (lv === 4) return 'color-lime';
  if (lv === 5) return 'color-green';
  return 'color-blue';
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    streak: 0,
    levelInfo: { label: 'ROOKIE', lv: 1, score: 0 },
    locale: 'en',
    theme: 'dark',
    flameColor: 'color-neutral-600',
    trophyColor: 'color-neutral-600',
    version: 'V1.0.2 - STABLE',
    orbSession: null,
    showEditNameModal: false,
    editNameValue: '',
    showEditBodyModal: false,
    editHeight: 170,
    editWeight: 60,
  },

  onLoad() {
    const locale = wx.getStorageSync('language') || 'zh';
    const theme = wx.getStorageSync('theme') || 'night';
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      locale,
      theme,
      t: app.globalData.t,  // 注入 i18n 字典
    });
  },

  async onShow() {
    await this.loadData();
    // Refresh session orb
    const orbSession = await app.loadRunningSession();
    this.setData({ orbSession });
  },

  async loadData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ isLoggedIn: false });
      wx.hideLoading();
      return;
    }

    const locale = wx.getStorageSync('language') || 'zh';
    const theme = wx.getStorageSync('theme') || 'night';

    const userInfo = {
      nickname: wx.getStorageSync('userName') || '',
      avatarUrl: wx.getStorageSync('avatarUrl') || '',
    };

    this.setData({ isLoggedIn: true, locale, theme, userInfo });

    const [profileRes, streakRes, levelRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'api', data: { action: 'profile.get', openid: app.globalData.openid } }),
      wx.cloud.callFunction({ name: 'api', data: { action: 'profile.getStreak', openid: app.globalData.openid } }),
      wx.cloud.callFunction({ name: 'api', data: { action: 'profile.getLevel', openid: app.globalData.openid } }),
    ]);

    wx.hideLoading();

    const profileData = profileRes.result && profileRes.result.profile;
    if (profileData) {
      wx.setStorageSync('userName', profileData.name);
      wx.setStorageSync('avatarUrl', profileData.avatar);
      app.globalData.userInfo = { nickname: profileData.name, avatarUrl: profileData.avatar };
      const height = profileData.height || 170;
      const weight = profileData.weight || 60;
      app.globalData.userWeight = weight;
      app.globalData.userHeight = height;
      wx.setStorageSync('userWeight', weight);
      wx.setStorageSync('userHeight', height);
      this.setData({
        userInfo: { nickname: profileData.name, avatarUrl: profileData.avatar },
        editHeight: height,
        editWeight: weight,
        bodyHeight: height,
        bodyWeight: weight,
      });
    }

    const streak = (streakRes.result && streakRes.result.streak) || 0;
    const levelData = (levelRes.result && levelRes.result.data) || { label: 'ROOKIE', lv: 1, score: 0 };

    this.setData({
      streak,
      levelInfo: levelData,
      flameColor: getFlameColor(streak),
      trophyColor: getTrophyColor(levelData.lv),
    });
  },

  // Handle logout — clear storage and trigger silent re-login
  handleLogout() {
    wx.showModal({
      title: 'LOG OUT',
      content: 'Are you sure you want to sign out?',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          app.globalData.userId = null;
          app.globalData.openid = null;
          app.doSilentLogin();
        }
      },
    });
  },
  changeAvatar() {
    wx.chooseImage({
      count: 1,
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        // Save to local storage immediately for display
        wx.setStorageSync('avatarTemp', tempFilePath);
        this.setData({
          'userInfo.avatarUrl': tempFilePath,
        });
        // Sync to cloud
        const userId = wx.getStorageSync('userId');
        if (userId) {
          wx.cloud.uploadFile({
            cloudPath: `avatars/${userId}_${Date.now()}.jpg`,
            filePath: tempFilePath,
            success: (uploadRes) => {
              const avatarUrl = uploadRes.fileID;
              wx.cloud.callFunction({
                name: 'api',
                data: { action: 'profile.updateAvatar', openid: app.globalData.openid, avatarUrl },
              });
              wx.setStorageSync('avatarUrl', avatarUrl);
            },
          });
        }
        wx.showToast({ title: 'AVATAR UPDATED', icon: 'success' });
      },
    });
  },

  async onOrbTap() {
    // 无 session: 先创建一个, 再跳到 training 页
    if (!this.data.orbSession) {
      const session = await app.ensureRunningSession();
      if (!session) return;
      this.setData({ orbSession: session });  // orb 立即变 active
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  // Edit nickname
  onEditName() {
    this.setData({
      showEditNameModal: true,
      editNameValue: this.data.userInfo.nickname || '',
    });
  },

  onEditNameInput(e) {
    this.setData({ editNameValue: e.detail.value });
  },

  onNameMaskTap(e) {
    if (e.target !== e.currentTarget) return;
    this.setData({ showEditNameModal: false, editNameValue: '' });
  },

  cancelEditName() {
    this.setData({ showEditNameModal: false, editNameValue: '' });
  },

  confirmEditName() {
    const name = this.data.editNameValue.trim();
    const regex = /^[一-龥a-zA-Z0-9_]{1,16}$/;
    if (!regex.test(name)) {
      wx.showToast({
        title: this.data.locale === 'en' ? 'Invalid nickname' : '昵称格式不正确',
        icon: 'none',
      });
      return;
    }
    wx.cloud.callFunction({
      name: 'api',
      data: { action: 'profile.update', openid: app.globalData.openid, name },
      success: (res) => {
        if (res.result && res.result.success === true) {
          const userInfo = { ...this.data.userInfo, nickname: name };
          this.setData({ userInfo, showEditNameModal: false });
          wx.setStorageSync('userName', name);
          wx.showToast({
            title: this.data.locale === 'en' ? 'Nickname updated' : '昵称已更新',
            icon: 'success',
          });
        } else {
          wx.showToast({
            title: this.data.locale === 'en' ? 'Update failed' : '更新失败',
            icon: 'none',
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: this.data.locale === 'en' ? 'Update failed' : '更新失败',
          icon: 'none',
        });
      },
    });
  },

  // Toggle language EN <-> CN (using global app i18n system)
  toggleLanguage() {
    const current = app.getLanguage() || 'zh';
    const next = current === 'en' ? 'zh' : 'en';
    app.setLanguage(next);
    this.setData({ locale: next });
    wx.showToast({ title: next === 'en' ? 'Language: EN' : '语言: 中文', icon: 'none' });
  },

  // Toggle theme day <-> night
  toggleTheme() {
    app.toggleTheme();
    const next = app.getTheme();
    this.setData({ theme: next });
    wx.showToast({ title: next === 'day' ? 'Theme: Day' : 'Theme: Night', icon: 'none' });
  },

  // ---- Personal Info (body data) ----
  onPersonalInfoTap() {
    this.setData({
      showEditBodyModal: true,
      editHeight: this.data.bodyHeight || 170,
      editWeight: this.data.bodyWeight || 60,
    });
  },

  onHeightInput(e) {
    this.setData({ editHeight: Number(e.detail.value) || 0 });
  },

  onWeightInput(e) {
    this.setData({ editWeight: Number(e.detail.value) || 0 });
  },

  onBodyMaskTap(e) {
    if (e.target !== e.currentTarget) return;
    this.setData({ showEditBodyModal: false });
  },

  cancelEditBody() {
    this.setData({ showEditBodyModal: false });
  },

  confirmEditBody() {
    const height = this.data.editHeight;
    const weight = this.data.editWeight;
    if (height < 50 || height > 250 || weight < 20 || weight > 300) {
      wx.showToast({ title: this.data.locale === 'en' ? 'Invalid values' : '数值不合法', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'api',
      data: { action: 'profile.updateFull', openid: app.globalData.openid, height, weight },
      success: (res) => {
        if (res.result && res.result.success) {
          app.globalData.userWeight = weight;
          app.globalData.userHeight = height;
          wx.setStorageSync('userWeight', weight);
          wx.setStorageSync('userHeight', height);
          this.setData({
            bodyHeight: height,
            bodyWeight: weight,
            showEditBodyModal: false,
          });
          wx.showToast({ title: this.data.locale === 'en' ? 'Updated' : '已更新', icon: 'success' });
        }
      },
      fail: () => {
        wx.showToast({ title: this.data.locale === 'en' ? 'Update failed' : '更新失败', icon: 'none' });
      },
    });
  },

  onHelpTap() {
    wx.navigateTo({ url: '/pages/guide/index' });
  },
});
