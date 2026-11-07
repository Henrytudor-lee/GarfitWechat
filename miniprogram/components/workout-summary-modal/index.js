// components/workout-summary-modal/index.js
const app = getApp();
const { setVolume } = require('../../utils/unit.js');
const { calcSetsCalories } = require('../../utils/calories.js');

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
      // ⚠️ 父组件传进来的是**数字**(session id 是 int 自增主键),
      //    属性却声明成 String → 微信框架类型不匹配会报警告,
      //    某些基础库版本会直接丢成默认值 null → session_id 传不上去。
      //    两个类型都声明, 兼容数字和字符串。
      type: [String, Number],
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
          // i18n 字典要从 app.globalData 重新取, 否则切换语言后弹框里还是旧语言
          t: app.globalData.t || {},
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

    onSheetTap() {
      // 空实现: catchtap 用来阻止点击冒泡到遮罩
    },

    closeModal() {
      this.triggerEvent('close');
    },

    _computeStats(session) {
      const exerciseList = session.exercises || [];
      // ⚠️ session.duration 的单位是**秒**(后端 TIMESTAMPDIFF(SECOND, ...)),
      //    调用方负责传秒(客户端毫秒 / 1000), 这里按秒换算分钟, 不要按毫秒
      const durationSec = Number(session.duration) || 0;
      const totalMinutes = Math.round(durationSec / 60);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const locale = app.globalData.language || 'zh';
      const durationStr = hours > 0
        ? (locale === 'zh' ? `${hours}小时${mins}分钟` : `${hours}h ${mins}m`)
        : (locale === 'zh' ? `${mins}分钟` : `${mins} min`);

      let totalCalories = session.calories || 0;
      const userWeight = app.globalData.userWeight || 60;
      // 为每个动作预计算 totalCalories (WXML 不支持方法调用, 必须在 data 字段里)
      // 卡路里 v1: 按该组的计量方式算 —— 计时类走 MET 法, 距离类走距离法
      const groups = exerciseList.map((ex) => {
        const cal = calcSetsCalories(ex.sets || [], userWeight);
        return {
          ...ex,
          // sets 恒为数组, 否则 wxml 里 item.sets.length 会报错
          sets: Array.isArray(ex.sets) ? ex.sets : [],
          // id 用动作 id, 保证 wx:key 唯一
          id: ex.exercise_id || ex.id,
          totalCalories: cal,
        };
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
