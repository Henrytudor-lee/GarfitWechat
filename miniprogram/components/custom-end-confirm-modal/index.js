// components/custom-end-confirm-modal/index.js
const app = getApp();

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    locale: {
      type: String,
      value: 'en',
    },
    theme: {
      type: String,
      value: 'night',
    },
  },

  data: {
    _locale: 'en',
    _theme: 'night',
    t: app.globalData.t,  // 注入 i18n 字典
  },

  lifetimes: {
    attached() {
      // 组件挂载时同步最新 t (可能在语言切换后才挂载)
      if (app.globalData.t) this.setData({ t: app.globalData.t });
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'zh';
        const theme = app.globalData.theme || 'night';
        const t = app.globalData.t || {};
        this.setData({ _locale: locale, _theme: theme, t });
      }
    },
  },

  methods: {
    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.cancelConfirm();
      }
    },

    confirmEnd() {
      this.triggerEvent('confirm');
    },

    cancelConfirm() {
      this.triggerEvent('cancel');
    },

    getLocale() {
      return this.data._locale;
    },
  },
});