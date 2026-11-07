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
    // 分享 token —— 必须在**点分享之前**就准备好(见 onShareAppMessage 的注释)
    _shareToken: '',
    _shareFailed: false,
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
        // 预取分享 token
        this._prepareShareToken(session);
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
      // ⚠️ set 的字段命名有两套, 别混用:
      //    · 下划线(duration_sec / distance_km / weight_unit)—— 数据库列名直出,
      //      首页 / 会话详情 / 这个弹框走的是这一套;
      //    · 驼峰(durationSec / distanceKm / weightUnit)—— 卡路里算法(前后端共用)的契约,
      //      utils/set-model.js 和分享页走的是这一套。
      //    如果以后要把**分享页**的数据喂进这个弹框, 得先做一次字段转换。
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

    /**
     * 预取分享 token。
     *
     * ⚠️ **必须提前取**, 因为 onShareAppMessage 是**同步**回调 ——
     *    微信要求它同步返回 {title, path, imageUrl}, 没有 await 的余地。
     *    分享按钮又是 open-type="share"(点一下直接调起分享面板), 点完再取来不及。
     *    所以在弹框打开时就先把 token 备好。
     */
    async _prepareShareToken(session) {
      const sessionId = Number(session && (session.id || session._id)) || Number(this.data.sessionId) || 0;
      if (!sessionId) return;
      this.setData({ _shareToken: '', _shareFailed: false });
      try {
        const api = require('../../utils/api.js');
        const res = await api.callCloud('share.create', { session_id: sessionId });
        const token = res && res.result && res.result.share && res.result.share.token;
        if (token) {
          this.setData({ _shareToken: token });
        } else {
          this.setData({ _shareFailed: true });
        }
      } catch (err) {
        console.warn('[summary] 分享链接预取失败:', err);
        this.setData({ _shareFailed: true });
      }
    },

    onShareAppMessage() {
      const {_stats, _shareToken} = this.data;
      const isZh = app.globalData.language === 'zh';
      const title = isZh
        ? `刚完成了 ${_stats.exerciseCount} 个动作，训练 ${_stats.durationStr}，消耗 ${_stats.totalCalories} 大卡 💪`
        : `Just finished ${_stats.exerciseCount} exercises, ${_stats.durationStr} workout, ${_stats.totalCalories} kcal 💪`;
      // 拿到 token → 分享卡片直接进分享页(B 点开就能看到这场训练)
      // 没拿到 → 降级回首页, 并提示用户(不能静默发一个看不到内容的卡片)
      if (_shareToken) {
        return {
          title,
          path: `/pages/share/index?token=${_shareToken}`,
          imageUrl: '',
        };
      }
      wx.showToast({ title: isZh ? '分享链接生成失败' : 'Failed to create share link', icon: 'none' });
      return { title, path: '/pages/index/index' };
    },
  },
});
