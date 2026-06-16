// components/workout-summary-modal/index.js
const app = getApp();
const { setVolume, volumeToCalories } = require('../../utils/unit.js');

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    session: {
      type: Object,
      value: null,
    },
    sessionId: {
      type: String,
      value: null,
    },
    locale: {
      type: String,
      value: 'en',
    },
  },

  data: {
    imgPrefix: '',
    exerciseList: [],
    _locale: 'en',
    _dateStr: '',
    t: app.globalData.t,  // 注入 i18n 字典
    _stats: {
      exerciseCount: 0,
      durationStr: '0 min',
      totalCalories: 0,
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'zh';
        const theme = app.globalData.theme || 'night';
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          _locale: locale,
          _theme: theme,
          _dateStr: this._computeDateStr(),
        });
      }
    },
    'isOpen, session': function(isOpen, session) {
      if (isOpen && session) {
        this._computeStats(session);
      }
    },
  },

  lifetimes: {
    attached() {
      // Enable share
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  pageLifetimes: {
    show() {
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  methods: {
    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    closeModal() {
      this.triggerEvent('close');
    },

    _computeStats(session) {
      const exerciseList = session.exercises || [];
      const durationMs = session.duration || 0;
      const totalMinutes = Math.round(durationMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const locale = app.globalData.language || 'zh';
      const durationStr = hours > 0
        ? (locale === 'zh' ? `${hours}小时${mins}分钟` : `${hours}h ${mins}m`)
        : (locale === 'zh' ? `${mins}分钟` : `${mins} min`);

      let totalCalories = session.calories || 0;
      // 为每个动作预计算 totalCalories (WXML 不支持方法调用, 必须在 data 字段里)
      const groups = exerciseList.map((ex) => {
        let vol = 0;
        if (ex.sets) {
          for (const s of ex.sets) {
            vol += setVolume(s);
          }
        }
        const cal = volumeToCalories(Math.round(vol));
        return { ...ex, totalCalories: cal };
      });
      // 如果没有已存储的 calories, 从各组的 calories 求和
      if (!totalCalories) {
        totalCalories = groups.reduce((sum, g) => sum + g.totalCalories, 0);
      }

      this.setData({
        exerciseList: groups,
        _stats: {
          exerciseCount: groups.length,
          durationStr,
          totalCalories,
        },
      });
    },

    _computeDateStr() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    },
    onShareAppMessage() {
      const {_stats} = this.data;
      return {
        title: app.globalData.language === 'zh'
          ? `刚完成了 ${_stats.exerciseCount} 个动作，训练 ${_stats.durationStr}，消耗 ${_stats.totalCalories} 大卡 💪`
          : `Just finished ${_stats.exerciseCount} exercises, ${_stats.durationStr} workout, ${_stats.totalCalories} kcal 💪`,
        path: '/pages/index/index',
      };
    },
  },
});
