// pages/profile/index.js — garcia-fitness-new style
const app = getApp();

const LEVEL_THRESHOLDS = [
  { level: 1, name: 'ROOKIE', xp: 0 },
  { level: 2, name: 'WARRIOR', xp: 100 },
  { level: 3, name: 'FIGHTER', xp: 300 },
  { level: 4, name: 'ATHLETE', xp: 600 },
  { level: 5, name: 'CHAMPION', xp: 1000 },
];

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    stats: {},
    levelInfo: {},
    memberSince: '',
    xpPercent: 0,
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ isLoggedIn: false });
      wx.hideLoading();
      return;
    }

    this.setData({ isLoggedIn: true });

    const [profileRes, statsRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'profile', data: { action: 'get' } }),
      wx.cloud.callFunction({ name: 'stats', data: {} }),
    ]);

    wx.hideLoading();

    const profile = (profileRes.result && profileRes.result.profile) || {};
    const stats = (statsRes.result && statsRes.result.stats) || {};

    // Build level info
    const level = profile.level || 1;
    const score = profile.score || 0;
    const current = LEVEL_THRESHOLDS.find(l => l.level === level) || LEVEL_THRESHOLDS[0];
    const next = LEVEL_THRESHOLDS.find(l => l.level === level + 1);
    const xpPercent = next ? Math.min(100, Math.round(((score - current.xp) / (next.xp - current.xp)) * 100)) : 100;

    this.setData({
      userInfo: {
        nickname: profile.name || 'ATHLETE',
        avatarUrl: profile.avatar || '',
      },
      stats,
      levelInfo: {
        level,
        name: current.name,
        currentXp: score,
        nextXp: next ? next.xp : score,
      },
      memberSince: profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
        : '—',
      xpPercent,
    });
  },

  goToFavorites() {
    wx.navigateTo({ url: '/pages/favorites/index' });
  },

  goToHistory() {
    wx.navigateTo({ url: '/pages/history/index' });
  },

  onShareTap() {
    wx.showShareMenu({ withShareTicket: true });
    wx.showToast({ title: 'SHARE VIA ...', icon: 'none' });
  },

  onAboutTap() {
    wx.showModal({
      title: 'ABOUT',
      content: 'GARCIAL FITNESS v1.0\nBuilt with 💪',
      showCancel: false,
    });
  },

  onSignOut() {
    wx.showModal({
      title: 'SIGN OUT',
      content: 'Are you sure you want to sign out?',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
