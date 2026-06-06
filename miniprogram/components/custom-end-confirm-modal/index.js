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
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'zh';
        const theme = app.globalData.theme || 'night';
        this.setData({ _locale: locale, _theme: theme });
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