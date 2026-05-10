// pages/profile/index.js — garcia-fitness-new style
const app = getApp();

const I18N = {
  en: {
    profile: {
      title: 'PROFILE',
      login_required: 'NOT LOGGED IN',
      login_hint: 'Sign in to track your fitness journey',
      login_btn: 'LOGIN / REGISTER',
      active_streak: 'ACTIVE STREAK',
      days: 'days',
      level: 'LEVEL',
      lv: 'LV.',
      language: 'LANGUAGE',
      theme: 'THEME',
      dark: 'Dark',
      light: 'Light',
      ai_coach: 'AI COACH',
      soon: 'COMING SOON',
      ai_subtitle: 'PERSONALIZED GUIDANCE',
      settings: 'SETTINGS',
      settings_sub: 'APP PREFERENCES',
      logout: 'LOG OUT',
      logout_sub: 'SIGN OUT OF YOUR ACCOUNT',
      version: 'GARCIAL FITNESS V1.0.2 - STABLE',
    }
  },
  zh: {
    profile: {
      title: '个人资料',
      login_required: '未登录',
      login_hint: '登录以开始健身之旅',
      login_btn: '登录 / 注册',
      active_streak: '连续训练',
      days: '天',
      level: '等级',
      lv: 'LV.',
      language: '语言',
      theme: '主题',
      dark: '深色',
      light: '浅色',
      ai_coach: 'AI 教练',
      soon: '即将推出',
      ai_subtitle: '个性化指导',
      settings: '设置',
      settings_sub: '应用偏好',
      logout: '退出登录',
      logout_sub: '退出当前账户',
      version: 'GARCIAL FITNESS V1.0.2 - 稳定版',
    }
  }
};

function t(key, locale) {
  const dict = I18N[locale] || I18N.en;
  const keys = key.split('.');
  let val = dict;
  for (const k of keys) val = val[k];
  return val || key;
}

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
  },

  onLoad() {
    const locale = wx.getStorageSync('locale') || 'en';
    const theme = wx.getStorageSync('theme') || 'dark';
    this.setData({ imgPrefix: app.globalData.imagePrefix, locale, theme });
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

    const locale = wx.getStorageSync('locale') || 'en';
    const theme = wx.getStorageSync('theme') || 'dark';

    this.setData({ isLoggedIn: true, locale, theme });

    const [streakRes, levelRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'profile', data: { action: 'getStreak' } }),
      wx.cloud.callFunction({ name: 'profile', data: { action: 'getLevel' } }),
    ]);

    wx.hideLoading();

    const streak = (streakRes.result && streakRes.result.streak) || 0;
    const levelData = (levelRes.result && levelRes.result.data) || { label: 'ROOKIE', lv: 1, score: 0 };

    this.setData({
      streak,
      levelInfo: levelData,
      flameColor: getFlameColor(streak),
      trophyColor: getTrophyColor(levelData.lv),
    });
  },

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  // Change avatar via album picker
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
                name: 'profile',
                data: { action: 'updateAvatar', userId, avatarUrl },
              });
              wx.setStorageSync('avatarUrl', avatarUrl);
            },
          });
        }
        wx.showToast({ title: 'AVATAR UPDATED', icon: 'success' });
      },
    });
  },

  // Toggle language EN <-> CN
  toggleLanguage() {
    const current = wx.getStorageSync('locale') || 'en';
    const next = current === 'en' ? 'zh' : 'en';
    wx.setStorageSync('locale', next);
    this.setData({ locale: next });
    wx.showToast({ title: next === 'en' ? 'Language: EN' : '语言: 中文', icon: 'none' });
  },

  // Toggle theme dark <-> light
  toggleTheme() {
    const current = wx.getStorageSync('theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    wx.setStorageSync('theme', next);
    this.setData({ theme: next });
    wx.showToast({ title: next === 'dark' ? 'Theme: Dark' : 'Theme: Light', icon: 'none' });
  },

  // Handle logout
  handleLogout() {
    wx.showModal({
      title: 'LOG OUT',
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
});
