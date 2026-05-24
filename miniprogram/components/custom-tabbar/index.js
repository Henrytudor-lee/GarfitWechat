// components/custom-tabbar/index.js — garcia-fitness-new bottom nav
Component({
  properties: {
    active: {
      type: String,
      value: 'training',
    },
    theme: {
      type: String,
      value: 'night',
    },
  },

  data: {
    locale: 'en',
    tabs: [
      { id: 'training', label: 'TRAINING', labelZh: '训练', url: '/pages/index/index', icon: '/images/icons/dumbbell.png', iconActive: '/images/icons/dumbbell-active.png' },
      { id: 'library',  label: 'LIBRARY',  labelZh: '动作库', url: '/pages/library/index', icon: '/images/icons/library.png', iconActive: '/images/icons/library-active.png' },
      { id: 'stats',    label: 'STATS',    labelZh: '统计', url: '/pages/stats/index', icon: '/images/icons/bar-chart.png', iconActive: '/images/icons/bar-chart-active.png' },
      { id: 'profile',  label: 'PROFILE',  labelZh: '我的', url: '/pages/profile/index', icon: '/images/icons/user.png', iconActive: '/images/icons/user-active.png' },
    ],
  },

  attached() {
    const app = getApp();
    const locale = app.globalData.language || 'en';
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    this.setData({ locale, theme });
    this._updateTabLabels(locale);
  },

  methods: {
    _updateTabLabels(locale) {
      const tabs = this.data.tabs.map(t => ({
        ...t,
        label: locale === 'zh' ? t.labelZh : t.label,
      }));
      this.setData({ tabs });
    },

    switchTab(e) {
      const { id, url } = e.currentTarget.dataset;
      if (id === this.properties.active) return;
      // Use reLaunch to switch between pages (not switchTab since tabBar is custom)
      wx.reLaunch({ url });
    },

    onFabTap() {
      wx.navigateTo({ url: '/pages/library/index?select=true' });
    },
  },
});
