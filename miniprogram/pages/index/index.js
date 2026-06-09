// pages/index/index.js — garcia-fitness-new style with bento stats, date picker, rest timer
const app = getApp();
const { setVolume } = require('../../utils/unit.js');

const DAY_NAMES_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_NAMES_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

Page({
  data: {
    runningSession: null,
    elapsedTime: '00:00:00',
    totalVolume: 0,
    exerciseCount: 0,
    restTime: '--:--',
    exerciseGroups: [],
    recentSessions: [],
    imgPrefix: '',
    timer: null,
    restTimer: null,
    sessionStartMs: 0,
    restStartMs: 0,
    _dataLoaded: false,   // guard: prevent duplicate _loadData from onLoad + onShow

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
    calendarDays: [],
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
    yesterdayDay: '',
    yesterdayMonth: '',

    // Modal state
    showEditModal: false,
    editingGroup: null,
    showSessionDetailModal: false,
    viewingSession: null,
    viewingSessionId: null,
    showWorkoutSummary: false,
    workoutSummarySession: null,
    workoutSummaryExercises: [],
    currentSessionId: null,
    showAddModal: false,
    showWelcome: false,

    // End confirm modal
    showEndConfirm: false,
  },

  onLoad: async function() {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      _dataLoaded: true,
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t,  // 注入 i18n 字典, WXML 用 {{t.KEY}}
    });
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      pickerYear: today.getFullYear(),
      pickerMonth: today.getMonth(),
      pickerYearLabel: this._getPickerYearLabel(today.getFullYear(), today.getMonth()),
      todayDay: String(today.getDate()),
      todayMonth: MONTH_NAMES_EN[today.getMonth()],
      weekdays: this.data.locale === 'zh' ? DAY_NAMES_ZH : DAY_NAMES_EN,
    });
    this._initCalendar();
    const yesterday = new Date(Date.now() - 86400000);
    this.setData({
      yesterdayDay: String(yesterday.getDate()),
      yesterdayMonth: MONTH_NAMES_EN[yesterday.getMonth()],
    });

    // openid ready → load immediately; otherwise poll
    if (app.globalData.openid) {
      this._loadData();
      this._initCalendar();  // safe: openid is available
    } else {
      const tryLoad = () => {
        if (app.globalData.openid) {
          this._loadData();
          this._initCalendar();  // safe: openid is now available
        } else {
          setTimeout(tryLoad, 100);
        }
      };
      tryLoad();
    }
  },

  onShow() {
    // Show welcome modal for new users — ALWAYS check first (before _dataLoaded guard)
    if (app.globalData.showWelcome && !this.data.showWelcome) {
      this.setData({ showWelcome: true });
      // Don't return — still allow chosenExercise and other logic below
    }

    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'zh';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }

    const chosen = getApp().globalData.chosenExercise;
    if (chosen && this.data.runningSession) {
      getApp().globalData.chosenExercise = null;
      this.addExerciseToSession(chosen);
      return;
    }

    // onLoad already loaded data, skip — showWelcome check ran above
    if (this.data._dataLoaded) return;

    // openid not ready yet — poll until ready
    const tryLoad = () => {
      if (app.globalData.openid) {
        this._loadData();
      } else {
        setTimeout(tryLoad, 100);
      }
    };
    tryLoad();
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
    if (this.data.restTimer) clearInterval(this.data.restTimer);
  },

  async _loadData() {
    wx.showLoading({ title: 'LOADING...', mask: true });

    const [runRes, recentRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'api', data: { action: 'session.getRunning', openid: app.globalData.openid } }),
      wx.cloud.callFunction({ name: 'api', data: { action: 'session.list', page: 1, pageSize: 5, openid: app.globalData.openid } }),
    ]);

    wx.hideLoading();

    if (runRes.result && runRes.result.session) {
      const session = runRes.result.session;
      const sessionId = session._id || session.id;
      this.setData({ runningSession: session, currentSessionId: sessionId });
      this._startTimer(session.start_time);
      this._startRestTimer();  // start rest countdown
      this._loadExerciseGroups(sessionId);
    } else {
      this.setData({ runningSession: null, currentSessionId: null, exerciseGroups: [], restTime: '--:--' });
      this._stopTimers();
    }

    if (recentRes.result && recentRes.result.sessions) {
      const sessions = recentRes.result.sessions.map(s => {
        const d = new Date(s.start_time);
        const dateStr = `${d.getMonth()+1}/${d.getDate()}`;
        const mins = Math.floor((s.duration || 0) / 60);
        return { ...s, dateStr, durationStr: `${mins} MIN` };
      });
      this.setData({ recentSessions: sessions });
    }

    // Load history sessions for selected date
    this._loadHistorySessions();
  },

  async _loadExerciseGroups(sessionId) {
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'exercise.list', session_id: sessionId, openid: app.globalData.openid },
    });
    if (res.result && res.result.success) {
      const map = {};
      for (const ex of res.result.exercises || []) {
        if (!map[ex.exercise_id]) {
          map[ex.exercise_id] = { ...ex, sets: [], totalVolume: 0 };
        }
        if (ex.weight > 0 || ex.reps > 0) {
          const vol = setVolume(ex);
          map[ex.exercise_id].sets.push({
            id: ex.id,
            weight: ex.weight,
            weight_unit: ex.weight_unit,
            reps: ex.reps,
          });
          map[ex.exercise_id].totalVolume += vol;
        }
      }
      const groups = Object.values(map).map(g => ({
        ...g,
        totalVolume: Math.round(g.totalVolume),
      }));
      // 全局 totalVolume 从各 group.totalVolume 求和 (避免重复 reduce 算 set 体积)
      const volume = groups.reduce((sum, g) => sum + g.totalVolume, 0);
      this.setData({
        exerciseGroups: groups,
        exerciseCount: groups.length,
        totalVolume: volume,
      });
    }
  },

  _startTimer(startTime) {
    if (this.data.timer) clearInterval(this.data.timer);
    const startMs = new Date(startTime).getTime();
    this.setData({ sessionStartMs: startMs });
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
    const timer = setInterval(update, 500);
    this.setData({ timer });
  },

  _startRestTimer() {
    if (this.data.restTimer) clearInterval(this.data.restTimer);
    const startMs = Date.now();
    this.setData({ restStartMs: startMs });
    const update = () => {
      const diff = Math.floor((Date.now() - startMs) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      this.setData({
        restTime: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      });
    };
    update();
    const restTimer = setInterval(update, 500);
    this.setData({ restTimer });
  },

  _resetRestTimer() {
    // Reset rest countdown from now (called when exercise is added)
    const startMs = Date.now();
    this.setData({ restStartMs: startMs });
    const update = () => {
      const diff = Math.floor((Date.now() - startMs) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      this.setData({
        restTime: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      });
    };
    // Clear existing and restart
    if (this.data.restTimer) clearInterval(this.data.restTimer);
    update();
    const restTimer = setInterval(update, 500);
    this.setData({ restTimer });
  },

  _stopTimers() {
    if (this.data.timer) { clearInterval(this.data.timer); this.setData({ timer: null }); }
    if (this.data.restTimer) { clearInterval(this.data.restTimer); this.setData({ restTimer: null }); }
  },

  // ---- Date picker helpers ----
  _formatDisplayDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return `${MONTH_NAMES_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },

  _getPickerYearLabel(year, month) {
    return `${MONTH_NAMES_EN[month]} ${year}`;
  },

  _getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ empty: true });
    const today = new Date().toISOString().split('T')[0];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = new Date(year, month, i).toISOString().split('T')[0];
      days.push({
        day: i,
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
      calendarDays: this._getCalendarDays(pickerYear, pickerMonth),
      pickerYearLabel: this._getPickerYearLabel(pickerYear, pickerMonth),
    });
  },

  closeDatePicker() {
    this.setData({ showDatePicker: false });
  },


  prevMonth() {
    let { pickerYear, pickerMonth } = this.data;
    if (pickerMonth === 0) { pickerMonth = 11; pickerYear -= 1; }
    else pickerMonth -= 1;
    this.setData({
      pickerYear,
      pickerMonth,
      calendarDays: this._getCalendarDays(pickerYear, pickerMonth),
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
      calendarDays: this._getCalendarDays(pickerYear, pickerMonth),
      pickerYearLabel: this._getPickerYearLabel(pickerYear, pickerMonth),
    });
  },

  selectDay(e) {
    const day = e.currentTarget.dataset.day;
    if (!day) return;
    const { pickerYear, pickerMonth } = this.data;
    const d = new Date(pickerYear, pickerMonth, day);
    const iso = d.toISOString().split('T')[0];
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      showDatePicker: false,
      calendarDays: this._getCalendarDays(pickerYear, pickerMonth),
    });
    this._loadHistorySessions();
  },

  goToToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const iso = today.toISOString().split('T')[0];
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      showDatePicker: false,
      pickerYear: year,
      pickerMonth: month,
      pickerYearLabel: this._getPickerYearLabel(year, month),
      calendarDays: this._getCalendarDays(year, month),
    });
    this._loadHistorySessions();
  },

  _initCalendar() {
    const { calendarYear, calendarMonth } = this.data;
    const calMonthLabelEN = `${MONTH_NAMES_EN[calendarMonth]} ${calendarYear}`;
    const calMonthLabelZH = `${calendarYear}年${MONTH_NAMES_ZH[calendarMonth]}`;
    this.setData({ calMonthLabelEN, calMonthLabelZH });
    this._loadCalendarMonth(calendarYear, calendarMonth);
    this._buildCalendarDays();
  },

  async _loadCalendarMonth(year, month) {
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'stats.monthDates', openid: app.globalData.openid, year, month: month + 1 },
    });
    if (res.result && res.result.dates && Array.isArray(res.result.dates)) {
      this.setData({ calendarWorkedDays: res.result.dates });
      this._buildCalendarDays();
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
    // 600ms 后清掉, 让动画可以再次触发
    setTimeout(() => {
      this.setData({ tappedDayDateStr: '' });
    }, 700);
  },

  async _loadHistorySessions() {
    const { historyDate } = this.data;
    if (!historyDate) return;
    // Fetch sessions for the given date
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'session.list', date: historyDate, openid: app.globalData.openid },
    });
    if (res.result && res.result.sessions) {
      const sessions = res.result.sessions.map(s => {
        const d = new Date(s.start_time);
        const timeStr = d.toLocaleTimeString(this.data.locale === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        const mins = Math.floor((s.duration || 0) / 60);
        const durationStr = this.data.locale === 'zh' ? `${mins}分钟` : `${mins} MIN`;
        return { ...s, timeStr, durationStr };
      });
      this.setData({ historySessions: sessions });
    } else {
      this.setData({ historySessions: [] });
    }
  },

  // ---- Workout controls ----
  async startWorkout() {
    wx.showLoading({ title: 'STARTING...', mask: true });
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'session.create', openid: app.globalData.openid },
    });
    wx.hideLoading();
    if (res.result && res.result.success) {
      const session = res.result.session || { id: res.result.sessionId, start_time: new Date().toISOString(), _id: res.result.sessionId };
      const sessionId = session._id || session.id;
      this.setData({ runningSession: session, currentSessionId: sessionId, exerciseGroups: [], exerciseCount: 0, totalVolume: 0 });
      this._startTimer(session.start_time || new Date().toISOString());
      this._startRestTimer();
    }
  },

  async requestStopWorkout() {
    this.setData({ showEndConfirm: true });
  },

  onEndConfirmCancel() {
    this.setData({ showEndConfirm: false });
  },

  async stopWorkout() {
    this.setData({ showEndConfirm: false });
    const sessionId = this.data.currentSessionId || (this.data.runningSession ? (this.data.runningSession._id || this.data.runningSession.id) : null);
    const locale = app.globalData.language || 'zh';
    wx.showLoading({ title: locale === 'zh' ? '结束中...' : 'ENDING...', mask: true });
    // Gather summary data first
    let totalVolume = this.data.totalVolume;
    let exerciseCount = this.data.exerciseCount;
    let elapsedMs = 0;
    if (this.data.runningSession && this.data.runningSession.start_time) {
      elapsedMs = Date.now() - new Date(this.data.runningSession.start_time).getTime();
    }
    const r = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'session.finish', session_id: sessionId, openid: app.globalData.openid },
    });
    wx.hideLoading();
    if (r.result && r.result.success) {
      this._stopTimers();
      // Show workout summary modal — duration in ms for _computeStats
      this.setData({
        showWorkoutSummary: true,
        workoutSummarySession: {
          ...this.data.runningSession,
          duration: elapsedMs,
          totalVolume,
          exerciseCount,
          exercises: this.data.exerciseGroups,
        },
        workoutSummaryExercises: this.data.exerciseGroups,
        runningSession: null,
        currentSessionId: null,
        exerciseGroups: [],
        exerciseCount: 0,
        totalVolume: 0,
        elapsedTime: '00:00:00',
        restTime: '--:--',
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

  onEditModalSaved() {
    this.setData({ showEditModal: false, editingGroup: null });
    const sessionId = this.data.currentSessionId || (this.data.runningSession && (this.data.runningSession._id || this.data.runningSession.id));
    if (sessionId) {
      this._loadExerciseGroups(sessionId);
      this._resetRestTimer();  // reset rest timer after editing/saving sets
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
    this.setData({ showWorkoutSummary: false, workoutSummarySession: null, workoutSummaryExercises: [] });
  },

  openAddModal() {
    this.setData({ showAddModal: true });
  },

  onAddModalClose() {
    this.setData({ showAddModal: false });
  },

  onAddModalExerciseAdded() {
    this.setData({ showAddModal: false });
    const sessionId = this.data.currentSessionId || (this.data.runningSession && (this.data.runningSession._id || this.data.runningSession.id));
    if (sessionId) {
      this._loadExerciseGroups(sessionId);
      this._resetRestTimer();  // reset rest timer on exercise add
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

  onWelcomeClose() {
    this.setData({ showWelcome: false });
    if (app.closeWelcomeModal) {
      app.closeWelcomeModal();
    }
  },

  // Called by app.doSilentLogin when login completes — check showWelcome
  onWelcomeLoginReady() {
    if (app.globalData.showWelcome && !this.data.showWelcome) {
      this.setData({ showWelcome: true });
    }
  },

  async addExerciseToSession(item) {
    if (!this.data.runningSession) return;
    const sessionId = this.data.currentSessionId || this.data.runningSession.id || this.data.runningSession._id;
    wx.showLoading({ title: 'ADDING...', mask: true });
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'exercise.add',
        session_id: sessionId,
        openid: app.globalData.openid,
        exercise_id: item._id || item.id,
        name_zh: item.name_zh || item.name,
        name_en: item.name || null,
        image_name: item.image_name || null,
        video_name: item.video_name || null,
        weight: 0,
        reps: 0,
      },
    });
    wx.hideLoading();
    if (res.result && res.result.success) {
      this._loadExerciseGroups(sessionId);
      this._resetRestTimer();  // reset rest timer on exercise add
    }
  },
});
