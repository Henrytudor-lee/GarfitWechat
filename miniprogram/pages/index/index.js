// pages/index/index.js — garcia-fitness-new style with bento stats, date picker, rest timer
const app = getApp();
const api = require('../../utils/api.js');
const { setVolume, formatCalories, toKg } = require('../../utils/unit.js');
const { calcSetsCalories, rowVolumeKg } = require('../../utils/calories.js');

const DAY_NAMES_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES_ZH = ['一', '二', '三', '四', '五', '六', '日'];
// 把本地时区的 Date 转成 YYYY-MM-DD 字符串 (避免 toISOString() 跨日)
function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


const MONTH_NAMES_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

Page({
  data: {
    runningSession: null,
    elapsedTime: '00:00:00',
    totalVolume: 0,
    totalCaloriesStr: '0',
    exerciseCount: 0,
    restTime: '--:--',
    exerciseGroups: [],
    recentSessions: [],
    imgPrefix: '',

    // i18n + theme
    locale: 'en',
    theme: 'night',

    // History / Bento
    historyDate: '',        // ISO date string YYYY-MM-DD
    displayDate: '',         // formatted display string
    historySessions: [],     // sessions for historyDate
    tappedDayDateStr: '',    // 当前脉冲高亮的日期 (动画触发)
    showDatePicker: false,
    pickerYear: new Date().getFullYear(),
    pickerMonth: new Date().getMonth(),  // 0-indexed
    pickerYearLabel: '',
    calendarDays: [],   // 迷你日历(结构含 worked/today/dateStr)
    pickerDays: [],     // 日期选择器(结构含 empty/isSelected/isToday) —— 与迷你日历**必须分开**

    dayNames: DAY_NAMES_EN,

    // Calendar mini
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),  // 0-indexed
    calendarWorkedDays: [],  // String[] like ['2026-05-03','2026-05-07']
    calMonthLabelEN: '',
    calMonthLabelZH: '',
    weekdays: DAY_NAMES_EN,

    // Bento data
    todayDay: '',
    todayMonth: '',
    todayProgress: 0,
    todayVolume: 0,
    todayCaloriesStr: '0',
    yesterdayDay: '',
    yesterdayMonth: '',
    yesterdayProgress: 0,
    yesterdayVolume: 0,
    yesterdayCaloriesStr: '0',
    monthlyCaloriesStr: '0',

    // Modal state
    showEditModal: false,
    editingGroup: null,
    showSessionDetailModal: false,
    viewingSession: null,
    viewingSessionId: null,
    showWorkoutSummary: false,
    workoutSummarySession: null,
    currentSessionId: null,
    showAddModal: false,
    preselectedExercise: null,   // 从动作库带回来的预选动作(打开添加弹框时带上)

    // 加载失败态: 与"今天还没训练"区分开(否则用户看到的是一片空白 + 无提示)
    loadError: false,

    // End confirm modal
    showEndConfirm: false,
  },

  onLoad: async function() {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t,  // 注入 i18n 字典, WXML 用 {{t.KEY}}
    });
    const today = new Date();
    const iso = localYmd(today);
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      pickerYear: today.getFullYear(),
      pickerMonth: today.getMonth(),
      pickerYearLabel: this._getPickerYearLabel(today.getFullYear(), today.getMonth()),
      todayDay: String(today.getDate()),
      todayMonth: this._monthName(today.getMonth()),
      weekdays: this.data.locale === 'zh' ? DAY_NAMES_ZH : DAY_NAMES_EN,
    });
    this._initCalendar();
    const yesterday = new Date(Date.now() - 86400000);
    this.setData({
      yesterdayDay: String(yesterday.getDate()),
      yesterdayMonth: this._monthName(yesterday.getMonth()),
    });

    // 单一加载入口: 等鉴权就绪后拉数据。
    // 原来是 setTimeout 轮询 globalData.openid —— 不可取消、openid 永不到达就永远空转,
    // 而且 onLoad 和 onShow 各写了一份。
    this._bootstrap();
  },

  /**
   * 等鉴权就绪 → 拉数据。onLoad / onShow-from-background 共用这一条路径。
   * - _booting: 防止 onLoad 和 onShow 同时触发两次加载
   * - _dataLoaded: 真正的"数据已就绪"标记（修复前它在 onLoad 里被立刻置 true，语义是假的）
   */
  async _bootstrap() {
    if (this._booting) return;
    this._booting = true;
    try {
      const openid = await app.whenAuthReady();
      if (this._unloaded) return;                 // 页面已卸载, 别再 setData
      if (!openid) {
        // 登录失败: 显式进入错误态 —— 原来只写日志, 用户看到的是一片空白,
        // 既不像"没有训练数据", 也没有任何重试入口。
        console.warn('[index] auth not ready');
        this._dataLoaded = false;
        this.setData({ loadError: true });
        return;
      }
      await this._loadData();
      if (this._unloaded) return;
      this._dataLoaded = true;
      this.setData({ loadError: false });
      // 鉴权就绪后再补一次日历圆点 (onLoad 时可能还没登录)
      this._initCalendar();
      // 新用户 → 展示一次 5 步引导页(纯教程, 可跳过)
      // is_new 的判断在 app 层(app.openGuideOnce), 首页不碰这个字段
      app.openGuideOnce();
    } catch (err) {
      console.error('[index] _bootstrap failed:', err);
      this._dataLoaded = false;
      this.setData({ loadError: true });
    } finally {
      this._booting = false;
    }
  },

  onHide() {
    // 切后台 / 跳走。回来时数据可能已过期, onShow 据此决定重新拉取
    this._wasHidden = true;
  },

  onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'zh';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
      // 切语言: 重新计算依赖 locale 的日期显示
      const t = new Date();
      const y = new Date(Date.now() - 86400000);
      this.setData({
        todayMonth: this._monthName(t.getMonth()),
        yesterdayMonth: this._monthName(y.getMonth()),
        weekdays: locale === 'zh' ? DAY_NAMES_ZH : DAY_NAMES_EN,
        pickerYearLabel: this._getPickerYearLabel(this.data.pickerYear, this.data.pickerMonth),
        displayDate: this._formatDisplayDate(this.data.historyDate),
      });
    }

    const chosen = getApp().globalData.chosenExercise;
    if (chosen) {
      // 先消费掉, 避免脏值挂到下一次 onShow 才被误消费
      getApp().globalData.chosenExercise = null;
      if (!this.data.runningSession) {
        wx.showToast({ title: this._t('NO_SESSION_HINT') || '请先开始训练', icon: 'none' });
        return;
      }
      this.addExerciseToSession(chosen);
      return;
    }

    // 从其他页面点 orb 创建 session 后, globalData 已更新; 同步到本页
    this._syncRunningSessionFromGlobal();

    // 从后台切回来 → 一定要重新拉一次。
    // 修复前这里被 `if (this.data._dataLoaded) return` 直接挡掉, 而那个标记在 onLoad
    // 里就被置成了 true, 于是切后台回来既不刷新、又被 _syncRunningSessionFromGlobal
    // 清空 UI → 一片空白。
    if (this._wasHidden) {
      this._wasHidden = false;
      this._bootstrap();
      return;
    }

    if (this._dataLoaded) return;

    // 首次进入且还没加载完 → 继续走同一条加载路径
    this._bootstrap();
  },

  onUnload() {
    this._unloaded = true;
    // timer 句柄在实例属性上, 直接清; 不再走 setData
    this._stopTimers();
    // 定时器也要清 —— 原来这个 setTimeout 没清:
    //   · onDayTap 的 400ms 脉冲清除 → 页面卸载后还在 setData
    if (this._pulseTimer) { clearTimeout(this._pulseTimer); this._pulseTimer = null; }
  },

  // No-op: 给 .picker-overlay 的 catchtouchmove 用 ——
  // 光有 catchtap 拦不住 touchmove, 在弹层上滑动会带动背景页面滚动(滚动穿透)。
  noop() {},

  async _loadData() {
    wx.showLoading({ title: 'LOADING...', mask: true });

    // 修复: 用 allSettled 避免单个接口失败导致整个流程中断.
    // (比如某个接口 401/403, 之前 Promise.all 会立刻 throw,
    //  runningSession / exerciseGroups / recentSessions 全部丢失, 页面停在初始状态.)
    const results = await Promise.allSettled([
      api.callCloud('session.getRunning'),
      api.callCloud('session.list', { page: 1, pageSize: 5 }),
      api.callCloud('session.monthlyStats'),
    ]);

    const runRes = results[0].status === 'fulfilled' ? results[0].value : null;
    const recentRes = results[1].status === 'fulfilled' ? results[1].value : null;
    const monthRes = results[2].status === 'fulfilled' ? results[2].value : null;

    // 请求期间页面可能已卸载（切 tab 走 reLaunch 会销毁页面实例）。
    // 此时若继续往下走, _startTimer 会重新挂上定时器而 onUnload 已经清过一次 → 泄漏。
    if (this._unloaded) return;

    try {
      if (runRes && runRes.result && runRes.result.session) {
        const session = runRes.result.session;
        const sessionId = session._id || session.id;
        // 回写 global —— 不回写会让 global 与 local 脱节,
        // 之后每次 onShow 的 _syncRunningSessionFromGlobal 都会误判成"外部结束 session"
        app.setRunningSession(session);
        this.setData({ runningSession: session, currentSessionId: sessionId });
        this._startTimer(session.start_time);
        // 不在这里调 _startRestTimer: rest timer 由 _loadExerciseGroups
        // 根据最新 create_time 计算, 这样切 tab / 切后台回来后
        // timer 仍能反映真实休息时长
        this._loadExerciseGroups(sessionId);
      } else if (runRes) {
        // ── 请求成功, 确实没有 running session → 两边一起清空, 保持一致 ──
        app.setRunningSession(null);
        this.setData({ runningSession: null, currentSessionId: null, exerciseGroups: [], restTime: '--:--' });
        this._stopTimers();
      } else {
        // ★★★ 请求**失败**(401/网络错误) —— 绝不能清空!
        //   2026-11-04 修复: 原来"失败"和"没有 session"都走 else 分支,
        //   于是切后台回来只要 getRunning 恰好失败, 就把 runningSession 和
        //   exerciseGroups 全清掉 → 页面变成初始化状态, 训练动作全没了。
        //   失败时保留现有 UI, 等重试成功再更新。
        console.warn('[index] session.getRunning failed, keep current UI (不当作"没有 session")');
      }

      if (recentRes && recentRes.result && recentRes.result.sessions) {
        const sessions = recentRes.result.sessions.map(s => {
          const d = new Date(s.start_time);
          const dateStr = `${d.getMonth()+1}/${d.getDate()}`;
          const secs = Number(s.duration) || 0;
          // 不足 1 分钟原来显示 "0 MIN", 看着像没数据
          const mins = Math.floor(secs / 60);
          const durationStr = secs < 60 ? '<1 MIN' : `${mins} MIN`;
          return { ...s, dateStr, durationStr };
        });
        this.setData({ recentSessions: sessions });
      }

      // Bento: 月度数据 (todayProgress, yesterdayProgress, monthlyVolume, todayVolume, yesterdayVolume)
      if (monthRes && monthRes.result && monthRes.result.success) {
        this._applyMonthlyStats(monthRes.result);
      }

      // 即使上面某个接口失败, history 也独立加载 (不再被前面 reject 阻断)
      this._loadHistorySessions();
    } catch (err) {
      console.error('_loadData failed:', err);
    } finally {
      wx.hideLoading();
    }
  },

  async _loadMonthlyStats() {
    try {
      const res = await api.callCloud('session.monthlyStats');
      if (res.result && res.result.success) this._applyMonthlyStats(res.result);
    } catch (err) {
      // 失败只记日志 —— 绝不能把异常抛给调用方(原来这里会变成 unhandled rejection)
      console.warn('[index] _loadMonthlyStats failed:', err);
    }
  },

  _applyMonthlyStats(stats) {
    const todayVol = stats.todayVolume || 0;
    const yesterdayVol = stats.yesterdayVolume || 0;
    const monthlyKg = stats.totalKg || 0;
    this.setData({
      todayProgress: stats.todayProgress || 0,
      yesterdayProgress: stats.yesterdayProgress || 0,
      // 卡路里 v1: 用后端给的真实值(按 session.calories 聚合),
      // 不再从体积反推 —— 计时/距离动作的卡路里不在体积里。
      todayCaloriesStr: formatCalories(stats.todayCalories || 0),
      yesterdayCaloriesStr: formatCalories(stats.yesterdayCalories || 0),
      monthlyCaloriesStr: formatCalories(stats.monthlyCalories || 0),
      todayVolume: todayVol,
      yesterdayVolume: yesterdayVol,
    });
  },

  async _loadExerciseGroups(sessionId) {
    // 请求序号守卫 —— 5 个调用点(切后台/外部建 session/弹框保存/加动作/库页选择)
    // 可能并发, 旧响应后到会覆盖新数据(刚加的动作从列表里消失)。
    const reqId = (this._groupsReqId || 0) + 1;
    this._groupsReqId = reqId;
    let res;
    try {
      res = await api.callCloud('exercise.list', { session_id: sessionId });
    } catch (err) {
      // 请求失败 → 保留现有 groups, 不清空(训练动作不能因为一次失败就没了)
      console.warn('[index] _loadExerciseGroups failed:', err);
      return;
    }
    if (reqId !== this._groupsReqId) return;      // 已有更新的请求, 丢弃这次响应
    if (this._unloaded) return;
    if (res.result && res.result.success) {
      if (this._exerciseOrderSessionId !== sessionId) {
        this._exerciseOrderSessionId = sessionId;
        this._exerciseOrder = null;
      }
      const map = {};
      for (const ex of res.result.exercises || []) {
        if (!map[ex.exercise_id]) {
          map[ex.exercise_id] = { ...ex, sets: [], totalVolume: 0, _latestTime: 0, _latestId: 0, _latestSetId: 0 };
        }
        const t = ex.create_time ? new Date(ex.create_time).getTime() : 0;
        if (t > map[ex.exercise_id]._latestTime) {
          map[ex.exercise_id]._latestTime = t;
        }
        if (ex.id != null && ex.id > map[ex.exercise_id]._latestId) {
          map[ex.exercise_id]._latestId = ex.id;
        }
        // 计时类/距离类动作: weight=0 且 reps=0, 只有 duration_sec / distance_km
        // —— 必须放行, 否则平板支撑、跑步这类记录会整组不显示。
        const isDurationSet = Number(ex.duration_sec) > 0;
        const isDistanceSet = Number(ex.distance_km) > 0;
        if (ex.weight > 0 || ex.reps > 0 || isDurationSet || isDistanceSet) {
          if (ex.id != null && ex.id > map[ex.exercise_id]._latestSetId) {
            map[ex.exercise_id]._latestSetId = ex.id;
          }
          const vol = setVolume(ex);
          map[ex.exercise_id].sets.push({
            id: ex.id,
            weight: ex.weight,
            weight_unit: ex.weight_unit,
            // 该 set 记录的重量(kg, 已换算):
            //   次数类 → 举起的重量
            //   计时/距离类 → 额外负重(手握哑铃 / 背负重物) → 卡路里按等效体重折算
            weightKg: toKg(ex.weight, ex.weight_unit),
            reps: ex.reps,
            duration_sec: isDurationSet ? Number(ex.duration_sec) : 0,
            distance_km: isDistanceSet ? Number(ex.distance_km) : 0,
            // 计量方式 —— 卡路里按这个分档算(见 utils/calories.js)
            countMode: ex.count_mode || 'weight_reps',
            volumeKg: rowVolumeKg(ex),
          });
          map[ex.exercise_id].totalVolume += vol;
        }
      }
      const userWeight = app.globalData.userWeight || 60;
      const groups = Object.values(map).map((g) => {
        // 剔除下划线开头的内部字段(_latestTime/_latestId/_latestSetId) ——
        // 它们只是构造过程中的中间量, 留在 setData 载荷里纯属浪费(每个动作一份)。
        const { _latestTime, _latestId, _latestSetId, ...rest } = g;
        return {
          ...rest,
          countMode: g.count_mode || 'weight_reps',
          totalVolume: Math.round(g.totalVolume),
          // 卡路里 v1: 按组的计量方式算, 不再是整个 session 一个公式
          totalCalories: calcSetsCalories(g.sets, userWeight),
          latestTime: _latestTime || 0,  // 该组最后一次 set 的 create_time 戳
          latestId: _latestId,
          latestSetId: _latestSetId,
        };
      });
      const latestSetId = groups.reduce((latest, group) => Math.max(latest, group.latestSetId || 0), 0);
      groups.forEach(group => {
        group.isLatestAdded = latestSetId > 0 && group.latestSetId === latestSetId;
      });
      const existingOrder = this._exerciseOrder || [];
      const addedExerciseId = this._pendingAddedExerciseId;
      if (addedExerciseId != null) {
        this._exerciseOrder = [
          Number(addedExerciseId),
          ...existingOrder.filter(id => Number(id) !== Number(addedExerciseId)),
        ];
        this._pendingAddedExerciseId = null;
      } else if (!this._exerciseOrder) {
        // Fresh page load (e.g. custom-tabbar 用 wx.reLaunch 切 tab 时 Page 实例被销毁,
        // _exerciseOrder 被清空). 此时不能直接用 groups.map(...) — 因为 API 返回顺序是
        // create_time ASC, Object.values(map) 顺序 = 首次出现的顺序 = 最早的动作在前.
        // groups[0] 一旦不是最新动作, 配合下面 groups[0].isLatestAdded = true,
        // "最新动作" 高亮就会同时打在两个 group 上 (forEach 标的最新 set + groups[0]).
        // 用 latestTime DESC 兜底, 保证 groups[0] === 最新动作.
        this._exerciseOrder = groups
          .slice()
          .sort((a, b) => b.latestTime - a.latestTime)
          .map(g => g.exercise_id);
      }
      const orderIndex = new Map(this._exerciseOrder.map((id, index) => [Number(id), index]));
      groups.sort((a, b) => {
        const aIndex = orderIndex.has(Number(a.exercise_id)) ? orderIndex.get(Number(a.exercise_id)) : Number.MAX_SAFE_INTEGER;
        const bIndex = orderIndex.has(Number(b.exercise_id)) ? orderIndex.get(Number(b.exercise_id)) : Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
      if (groups.length > 0) groups[0].isLatestAdded = true;
      // 全局 totalVolume 从各 group.totalVolume 求和 (避免重复 reduce 算 set 体积)
      const volume = groups.reduce((sum, g) => sum + g.totalVolume, 0);
      // 卡路里 v1: 各组按自己的计量方式算完再求和
      const totalCal = groups.reduce((sum, g) => sum + (g.totalCalories || 0), 0);
      this.setData({
        exerciseGroups: groups,
        exerciseCount: groups.length,
        totalVolume: volume,
        totalCaloriesStr: formatCalories(totalCal),
      });
      // 用最新一条 set 的 create_time 作为休息时间起点.
      // 这样: 切 tab / 切后台回来后, timer 仍能从 create_time 正确计时.
      // 没有 sets 时, _updateRestTimer 内部回退到 session.start_time.
      const latestSetTime = groups.reduce((m, g) => Math.max(m, g.latestTime || 0), 0);
      this._updateRestTimer(latestSetTime);
    }
  },

  _startTimer(startTime) {
    if (this._timer) clearInterval(this._timer);
    const startMs = new Date(startTime).getTime();
    this._sessionStartMs = startMs;
    const update = () => {
      const diff = Math.floor((Date.now() - startMs) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      this.setData({
        elapsedTime: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      });
    };
    update();
    // timer 句柄存实例属性而不是 data: 它不参与渲染,
    // 放 data 里每次读写都要跨逻辑层→视图层序列化, 纯属浪费
    this._timer = setInterval(update, 500);
  },

  _updateRestTimer(latestTime) {
    // 决定休息计时起点:
    //   1. latestTime > 0 -> 最新一条 set 的 create_time (DB 写入时间)
    //   2. 否则          -> 当前 session 的 start_time
    //   3. 否则          -> 当前时间 (兜底)
    // 关键: 不再用 Date.now(), 否则切 tab / 切后台回来后 timer 会被重置.
    let startMs = 0;
    if (latestTime && latestTime > 0) {
      startMs = latestTime;
    } else if (this.data.runningSession && this.data.runningSession.start_time) {
      startMs = new Date(this.data.runningSession.start_time).getTime();
    } else {
      startMs = Date.now();
    }

    // 起点没变 + timer 已在跑 -> 跳过, 避免无谓重置
    if (this._restTimer && this._restStartMs === startMs) return;

    if (this._restTimer) clearInterval(this._restTimer);
    this._restStartMs = startMs;
    const update = () => {
      const diff = Math.floor((Date.now() - startMs) / 1000);
      if (diff < 0) return;  // 时钟回拨保护
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      this.setData({
        restTime: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      });
    };
    update();
    this._restTimer = setInterval(update, 500);
  },

  _stopTimers() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._restTimer) { clearInterval(this._restTimer); this._restTimer = null; }
  },

  // i18n 取值: data.t 在 onLoad 注入, 语言切换后由 app 统一刷新
  _t(key, fallback) {
    const dict = this.data.t || {};
    return dict[key] || fallback || key;
  },

  // ---- Date picker helpers ----
  _monthName(idx) {
    const isZh = (this.data.locale || 'zh') === 'zh';
    return isZh ? MONTH_NAMES_ZH[idx] : MONTH_NAMES_EN[idx];
  },

  _formatDisplayDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    const isZh = (this.data.locale || 'zh') === 'zh';
    if (isZh) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${MONTH_NAMES_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },

  _getPickerYearLabel(year, month) {
    const isZh = (this.data.locale || 'zh') === 'zh';
    if (isZh) {
      return `${year}年${month + 1}月`;
    }
    return `${MONTH_NAMES_EN[month]} ${year}`;
  },

  _getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    // k 是唯一 key —— 原来用 wx:key="index", 但 wx:for-item 里根本没有 index 字段
    // (wx:for-item 改名后 index 不再自动注入), key 恒为 undefined → 微信告警。
    for (let i = 0; i < firstDay; i++) days.push({ empty: true, k: `e${i}` });
    const today = localYmd(new Date());
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = localYmd(new Date(year, month, i));
      days.push({
        day: i,
        k: `d${i}`,
        empty: false,
        isSelected: dateStr === this.data.historyDate,
        isToday: dateStr === today,
      });
    }
    return days;
  },

  openDatePicker() {
    const { pickerYear, pickerMonth } = this.data;
    this.setData({
      showDatePicker: true,
      pickerDays: this._getCalendarDays(pickerYear, pickerMonth),
      pickerYearLabel: this._getPickerYearLabel(pickerYear, pickerMonth),
    });
  },

  closeDatePicker() {
    this.setData({ showDatePicker: false });
    // ★ 恢复迷你日历的数据结构。
    //   之前两个组件共用 calendarDays 这个 key, 但结构完全不同:
    //     迷你日历   需要 item.worked / item.today / item.dateStr
    //     日期选择器 需要 item.empty / item.isSelected / item.isToday
    //   打开一次选择器就把 calendarDays 换成了选择器结构 →
    //   迷你日历的"练过"圆点全消失, 而且 onDayTap 因为 !dayObj.worked 直接 return → 点不动。
    this._buildCalendarDays();
  },

  // No-op: 仅用于让 .picker-modal 上的 catchtap 注册成功,
  // 阻止内部点击事件穿透到 overlay 的 bindtap="closeDatePicker"
  onPickerModalTap() {},


  prevMonth() {
    let { pickerYear, pickerMonth } = this.data;
    if (pickerMonth === 0) { pickerMonth = 11; pickerYear -= 1; }
    else pickerMonth -= 1;
    this.setData({
      pickerYear,
      pickerMonth,
      pickerDays: this._getCalendarDays(pickerYear, pickerMonth),
      pickerYearLabel: this._getPickerYearLabel(pickerYear, pickerMonth),
    });
  },

  nextMonth() {
    let { pickerYear, pickerMonth } = this.data;
    if (pickerMonth === 11) { pickerMonth = 0; pickerYear += 1; }
    else pickerMonth += 1;
    this.setData({
      pickerYear,
      pickerMonth,
      pickerDays: this._getCalendarDays(pickerYear, pickerMonth),
      pickerYearLabel: this._getPickerYearLabel(pickerYear, pickerMonth),
    });
  },

  selectDay(e) {
    const day = e.currentTarget.dataset.day;
    if (!day) return;
    const { pickerYear, pickerMonth } = this.data;
    const d = new Date(pickerYear, pickerMonth, day);
    const iso = localYmd(d);
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      showDatePicker: false,
      pickerDays: this._getCalendarDays(pickerYear, pickerMonth),
    });
    this._loadHistorySessions();
  },

  goToToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const iso = localYmd(today);
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      showDatePicker: false,
      pickerYear: year,
      pickerMonth: month,
      pickerYearLabel: this._getPickerYearLabel(year, month),
      pickerDays: this._getCalendarDays(year, month),
    });
    this._loadHistorySessions();
  },

  _initCalendar() {
    const { calendarYear, calendarMonth } = this.data;
    const calMonthLabelEN = `${MONTH_NAMES_EN[calendarMonth]} ${calendarYear}`;
    const calMonthLabelZH = `${calendarYear}年${MONTH_NAMES_ZH[calendarMonth]}`;
    this.setData({ calMonthLabelEN, calMonthLabelZH });
    // 日历格子是纯本地计算, 随时可画; 但"哪天练过"的圆点要调接口,
    // 必须等鉴权就绪 —— 否则冷启动未登录时会发一个注定 401 的请求.
    if (app.globalData.openid) this._loadCalendarMonth(calendarYear, calendarMonth);
    this._buildCalendarDays();
  },

  async _loadCalendarMonth(year, month) {
    // 请求序号守卫 —— 快速翻月时, 先发的请求后到会把圆点换成别的月份
    const reqId = (this._calReqId || 0) + 1;
    this._calReqId = reqId;
    try {
      const res = await api.callCloud('stats.monthDates', { year, month: month + 1 });
      if (reqId !== this._calReqId) return;
      if (this._unloaded) return;
      if (res.result && res.result.dates && Array.isArray(res.result.dates)) {
        this.setData({ calendarWorkedDays: res.result.dates });
        this._buildCalendarDays();
      }
    } catch (err) {
      // 静默失败: 日历圆点只是锦上添花, 不该让整页报错
      console.warn('[index] _loadCalendarMonth failed:', err);
    }
  },

  _buildCalendarDays() {
    const { calendarYear, calendarMonth, calendarWorkedDays } = this.data;
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    const todayD = today.getDate();
    const days = [];
    // Add empty cells for days before month starts (week starts Monday)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startOffset; i++) days.push({ empty: true });
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        dateStr,
        empty: false,
        worked: calendarWorkedDays.includes(dateStr),
        today: i === todayD && calendarMonth === todayM && calendarYear === todayY,
      });
    }
    this.setData({ calendarDays: days });
  },

  _prevMonth() {
    let { calendarYear, calendarMonth } = this.data;
    if (calendarMonth === 0) { calendarMonth = 11; calendarYear -= 1; }
    else calendarMonth -= 1;
    this.setData({
      calendarYear,
      calendarMonth,
      calMonthLabelEN: `${MONTH_NAMES_EN[calendarMonth]} ${calendarYear}`,
      calMonthLabelZH: `${calendarYear}年${MONTH_NAMES_ZH[calendarMonth]}`,
    });
    if (app.globalData.openid) this._loadCalendarMonth(calendarYear, calendarMonth);
    this._buildCalendarDays();
  },

  _nextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    if (calendarMonth === 11) { calendarMonth = 0; calendarYear += 1; }
    else calendarMonth += 1;
    this.setData({
      calendarYear,
      calendarMonth,
      calMonthLabelEN: `${MONTH_NAMES_EN[calendarMonth]} ${calendarYear}`,
      calMonthLabelZH: `${calendarYear}年${MONTH_NAMES_ZH[calendarMonth]}`,
    });
    if (app.globalData.openid) this._loadCalendarMonth(calendarYear, calendarMonth);
    this._buildCalendarDays();
  },

  onDayTap(e) {
    const dayObj = e.currentTarget.dataset.day;
    if (!dayObj || dayObj.empty) return;
    if (!dayObj.worked) return;
    const iso = dayObj.dateStr;
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      tappedDayDateStr: iso,  // 触发脉冲动画
    });
    this._loadHistorySessions();
    // 400ms 后清掉, 让动画可以再次触发
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._pulseTimer = setTimeout(() => {
      this._pulseTimer = null;
      if (this._unloaded) return;
      this.setData({ tappedDayDateStr: '' });
    }, 400);
  },

  async _loadHistorySessions() {
    const { historyDate } = this.data;
    if (!historyDate) return;
    // 请求序号守卫 —— 快速切日期时, 旧日期的响应后到会把列表覆盖成别的日期
    const reqId = (this._historyReqId || 0) + 1;
    this._historyReqId = reqId;
    try {
      // Fetch sessions for the given date
      const res = await api.callCloud('session.list', { date: historyDate });
      if (reqId !== this._historyReqId) return;  // 已有更新的请求
      if (this._unloaded) return;
      if (res.result && res.result.sessions) {
        const sessions = res.result.sessions.map(s => {
          const d = new Date(s.start_time);
          const timeStr = d.toLocaleTimeString(this.data.locale === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
          const secs = Number(s.duration) || 0;
          // 不足 1 分钟的训练原来显示 "0 MIN" / "0分钟" —— 看起来像没数据
          const mins = Math.floor(secs / 60);
          const durationStr = this.data.locale === 'zh'
            ? (secs < 60 ? '不足1分钟' : `${mins}分钟`)
            : (secs < 60 ? '<1 MIN' : `${mins} MIN`);
          return { ...s, timeStr, durationStr };
        });
        this.setData({ historySessions: sessions });
      } else {
        this.setData({ historySessions: [] });
      }
    } catch (err) {
      // 请求失败 ≠ 那天没有训练 → 保留现有列表, 不清空
      console.warn('[index] _loadHistorySessions failed:', err);
    }
  },

  // ---- Workout controls ----
  async startWorkout() {
    const session = await app.ensureRunningSession();
    if (!session) return;
    const sessionId = session._id || session.id;
    this.setData({ runningSession: session, currentSessionId: sessionId, exerciseGroups: [], exerciseCount: 0, totalVolume: 0, totalCaloriesStr: '0' });
    this._startTimer(session.start_time || new Date().toISOString());
    // 没有 sets: 用 session.start_time 作为休息时间起点 (兜底)
    this._updateRestTimer(0);
  },

  // 从其他页面 (library/profile/stats) 点 orb 创建 session 后, globalData.runningSession 已更新,
  // onShow 时同步到本页, 避免 reload 整个 _loadData
  _syncRunningSessionFromGlobal() {
    const g = app.globalData.runningSession;
    const l = this.data.runningSession;
    const gId = g ? (g._id || g.id) : null;
    const lId = l ? (l._id || l.id) : null;
    if (gId === lId) return;

    if (gId) {
      // global 有 session 且与本地不同 → global 是权威来源(其他页面刚创建/切换过)
      this.setData({ runningSession: g, currentSessionId: gId, exerciseGroups: [], exerciseCount: 0, totalVolume: 0, totalCaloriesStr: '0' });
      if (g.start_time) this._startTimer(g.start_time);
      this._loadExerciseGroups(gId);  // rest timer 由 _loadExerciseGroups 基于最新 create_time 设置
      return;
    }

    if (lId) {
      // global 空、本地有 → 绝不能当成"session 被外部结束"而清空 UI。
      // 这正是切后台回来变空白的根因: _loadData 以前从不回写 global,
      // 导致每次 onShow 都判定"global 空 / local 有" = 外部结束, 于是清空并停表。
      // 正确处理: 把本地状态回写 global, 让两边重新一致。
      app.setRunningSession(l);
    }
  },

  async requestStopWorkout() {
    this.setData({ showEndConfirm: true });
  },

  onEndConfirmCancel() {
    this.setData({ showEndConfirm: false });
  },

  async stopWorkout() {
    // 防重复提交 —— 原来没有这个守卫, 在"结束训练"确认弹窗上快速双击"确认":
    // 第二次调用时 sessionId 已经是 null → 后端抛"缺少 sessionId" →
    // 用户明明已经成功结束训练,却又看到一个"结束失败"的提示。
    if (this._finishing) return;
    this._finishing = true;
    this.setData({ showEndConfirm: false });
    const sessionId = this.data.currentSessionId || (this.data.runningSession ? (this.data.runningSession._id || this.data.runningSession.id) : null);
    const locale = app.globalData.language || 'zh';
    wx.showLoading({ title: locale === 'zh' ? '结束中...' : 'ENDING...', mask: true });
    // Gather summary data first
    const totalVolume = this.data.totalVolume;
    const exerciseCount = this.data.exerciseCount;
    let elapsedMs = 0;
    if (this.data.runningSession && this.data.runningSession.start_time) {
      elapsedMs = Date.now() - new Date(this.data.runningSession.start_time).getTime();
    }

    // try/finally: finish 失败时也必须解除 mask, 否则页面被全屏遮罩锁死
    let r = null;
    try {
      r = await api.callCloud('session.finish', { session_id: sessionId });
    } catch (err) {
      console.error('[index] stopWorkout failed:', err);
      wx.showToast({ title: this._t('FINISH_FAILED') || 'Failed', icon: 'none' });
      return;
    } finally {
      wx.hideLoading();
      this._finishing = false;
    }

    if (r.result && r.result.success) {
      app.setRunningSession(null);  // 关键: 清掉全局, 否则后续 orb tap 会拿到过期数据
      this._stopTimers();
      // Show workout summary modal
      // ⚠️ session.duration 的语义是**秒**(后端 TIMESTAMPDIFF(SECOND, ...)),
      //    而 workout-summary-modal 内部也是按秒换算成分钟 —— 这里传秒, 别传毫秒。
      this.setData({
        showWorkoutSummary: true,
        workoutSummarySession: {
          ...this.data.runningSession,
          duration: Math.max(0, Math.round(elapsedMs / 1000)),
          totalVolume,
          exerciseCount,
          exercises: this.data.exerciseGroups,
          calories: r.result.calories || 0,
        },
        // 只传一份 —— 原来同一个 exerciseGroups 数组同时塞进
        // workoutSummarySession.exercises 和 workoutSummaryExercises, 载荷翻倍。
        // 总结弹框自己从 session.exercises 取数据, 不需要第二个副本。
        runningSession: null,
        currentSessionId: null,
        exerciseGroups: [],
        exerciseCount: 0,
        totalCaloriesStr: '0',
        totalVolume: 0,
        elapsedTime: '00:00:00',
        restTime: '--:--',
      });
      // 刷新当日训练列表 + 月度统计 (DB 已写入 end_time/duration, 但内存 historySessions 还是旧的)
      // 否则点进 session-detail-modal 会看到 '--:--' 因为 session.duration/end_time 不存在
      this._loadHistorySessions();
      this._loadMonthlyStats().catch((err) => {
        console.warn('[index] _loadMonthlyStats failed:', err);
      });
    }
  },

  goToLibrary() {
    wx.navigateTo({ url: '/pages/library/index?select=true' });
  },

  onExerciseTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    // Open edit modal for this exercise group
    this.setData({
      showEditModal: true,
      editingGroup: item,
      currentSessionId: this.data.runningSession ? (this.data.runningSession._id || this.data.runningSession.id) : null,
    });
  },

  onEditModalClose() {
    this.setData({ showEditModal: false, editingGroup: null });
  },

  onEditModalSaved(e) {
    this.setData({ showEditModal: false, editingGroup: null });
    const addedExerciseId = e && e.detail && e.detail.addedExerciseId;
    if (addedExerciseId != null) this._pendingAddedExerciseId = addedExerciseId;
    const sessionId = this.data.currentSessionId || (this.data.runningSession && (this.data.runningSession._id || this.data.runningSession.id));
    if (sessionId) {
      this._loadExerciseGroups(sessionId);  // rest timer 会在 _loadExerciseGroups 内基于最新 create_time 设置
    }
  },

  onHistorySessionTap(e) {
    const session = e.currentTarget.dataset.session;
    if (!session) return;
    // Open session detail modal
    this.setData({
      showSessionDetailModal: true,
      viewingSession: session,
      viewingSessionId: session._id || session.id,
    });
  },

  onSessionDetailClose() {
    this.setData({ showSessionDetailModal: false, viewingSession: null, viewingSessionId: null });
  },

  onWorkoutSummaryClose() {
    this.setData({ showWorkoutSummary: false, workoutSummarySession: null });
  },

  openAddModal() {
    this.setData({ showAddModal: true });
  },

  onAddModalClose() {
    this.setData({ showAddModal: false, preselectedExercise: null });
  },

  onAddModalExerciseAdded(e) {
    this.setData({ showAddModal: false, preselectedExercise: null });
    const addedExerciseId = e && e.detail && e.detail.addedExerciseId;
    if (addedExerciseId != null) this._pendingAddedExerciseId = addedExerciseId;
    const sessionId = this.data.currentSessionId || (this.data.runningSession && (this.data.runningSession._id || this.data.runningSession.id));
    if (sessionId) {
      this._loadExerciseGroups(sessionId);  // rest timer 会在 _loadExerciseGroups 内基于最新 create_time 设置
    }
  },

  onOrbTap() {
    // 若有 running session, 滚到顶部 (timer card 在顶部)
    if (this.data.runningSession) {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } else {
      // 无 session, 启动
      this.startWorkout();
    }
  },

  /**
   * 从动作库选了一个动作 → 打开"添加动作"弹框(预选该动作), 让用户填计量值。
   *
   * ⚠️ 原来这里是直接 `exercise.add({weight:0, reps:0})` —— 而首页的显示过滤是
   *    `weight>0 || reps>0 || duration>0 || distance>0`,
   *    所以这条空 set **整组不显示** → 用户"选完动作什么都没发生"。
   *    (不只计时/距离类, 次数类也一样: weight=0 reps=0 同样被过滤掉。)
   *    而且更糟的是这条空记录已经写进库了, 训练量/卡路里口径也跟着脏。
   *
   *    现在改成走添加弹框: 预选该动作 → 用户填重量/次数/秒数/公里数 → 正常入库。
   *    这与动作库页自己的"加入训练"按钮是同一条路径, 行为一致。
   */
  addExerciseToSession(item) {
    if (!item) return;
    if (!this.data.runningSession) return;
    this.setData({
      showAddModal: true,
      preselectedExercise: item,
    });
  },
});
