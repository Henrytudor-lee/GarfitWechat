// components/custom-tabbar/index.js — garcia-fitness-new bottom nav
Component({
  properties: {
    active: {
      type: String,
      value: 'training',
    },
  },

  data: {
    tabs: [
      { id: 'training', label: 'TRAINING', url: '/pages/index/index', icon: '/images/icons/dumbbell.png', iconActive: '/images/icons/dumbbell-active.png' },
      { id: 'library',  label: 'LIBRARY',  url: '/pages/library/index', icon: '/images/icons/library.png', iconActive: '/images/icons/library-active.png' },
      { id: 'stats',    label: 'STATS',    url: '/pages/stats/index', icon: '/images/icons/bar-chart.png', iconActive: '/images/icons/bar-chart-active.png' },
      { id: 'profile',  label: 'PROFILE',  url: '/pages/profile/index', icon: '/images/icons/user.png', iconActive: '/images/icons/user-active.png' },
    ],
  },

  methods: {
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
