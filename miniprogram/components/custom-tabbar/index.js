// components/custom-tabbar/index.js — garcia-fitness-new bottom nav
const app = getApp();

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
    // ⚠️ 主题写在内部字段 _theme, 不能 setData({ theme }):
    //    theme 是父组件传入的 property, setData 同名 key 会把它覆盖成 app 的主题
    _theme: 'night',
    tabs: [
      { id: 'training', label: 'TRAINING', labelZh: '训练', labelKey: '', url: '/pages/index/index', icon: '/images/icons/dumbbell.png', iconActive: '/images/icons/dumbbell-active.png' },
      { id: 'library',  label: 'LIBRARY',  labelZh: '动作库', labelKey: 'EXERCISE_LIBRARY', url: '/pages/library/index', icon: '/images/icons/library.png', iconActive: '/images/icons/library-active.png' },
      { id: 'stats',    label: 'STATS',    labelZh: '统计', labelKey: 'STATS', url: '/pages/stats/index', icon: '/images/icons/bar-chart.png', iconActive: '/images/icons/bar-chart-active.png' },
      { id: 'profile',  label: 'PROFILE',  labelZh: '我的', labelKey: '', url: '/pages/profile/index', icon: '/images/icons/user.png', iconActive: '/images/icons/user-active.png' },
    ],
  },

  attached() {
    const locale = app.globalData.language || 'zh';
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    // 主题写到 _theme, 不要覆盖 property
    this.setData({ locale, _theme: theme });
    this._updateTabLabels(locale);
  },

  methods: {
    _updateTabLabels(locale) {
      const t = app.globalData.t || {};
      const isZh = locale === 'zh';
      const tabs = this.data.tabs.map((item) => ({
        ...item,
        // 字典里有对应 key 的走字典(EXERCISE_LIBRARY / STATS);
        // 没有 key 的(训练 / 我的)保留原有文案
        labelText: item.labelKey
          ? (t[item.labelKey] || (isZh ? item.labelZh : item.label))
          : (isZh ? item.labelZh : item.label),
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
