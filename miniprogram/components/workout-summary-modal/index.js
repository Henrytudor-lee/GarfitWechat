// components/workout-summary-modal/index.js
const app = getApp();
const { toKg } = require('../../utils/unit.js');

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
    _stats: {
      exerciseCount: 0,
      durationStr: '0 min',
      totalVolume: 0,
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'en';
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
      const locale = app.globalData.language || 'en';
      const durationStr = hours > 0
        ? (locale === 'zh' ? `${hours}小时${mins}分钟` : `${hours}h ${mins}m`)
        : (locale === 'zh' ? `${mins}分钟` : `${mins} min`);

      let totalVolume = 0;
      // 为每个动作预计算 totalVolume (WXML 不支持方法调用, 必须在 data 字段里)
      const groups = exerciseList.map((ex) => {
        let vol = 0;
        if (ex.sets) {
          for (const s of ex.sets) {
            vol += toKg(s.weight, s.weight_unit) * (Number(s.reps) || 0);
          }
        }
        return { ...ex, totalVolume: Math.round(vol) };
      });
      for (const ex of groups) {
        totalVolume += ex.totalVolume;
      }

      this.setData({
        exerciseList: groups,
        _stats: {
          exerciseCount: groups.length,
          durationStr,
          totalVolume: Math.round(totalVolume),
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
          ? `刚完成了 ${_stats.exerciseCount} 个动作，训练 ${_stats.durationStr}，总量 ${_stats.totalVolume} kg 💪`
          : `Just finished ${_stats.exerciseCount} exercises, ${_stats.durationStr} workout, ${_stats.totalVolume} kg 💪`,
        path: '/pages/index/index',
      };
    },
  },
});
