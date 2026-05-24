// pages/index/index.js — garcia-fitness-new style with bento stats, date picker, rest timer
const app = getApp();

const DAY_NAMES_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    showDatePicker: false,
    pickerYear: new Date().getFullYear(),
    pickerMonth: new Date().getMonth(),  // 0-indexed
    pickerYearLabel: '',
    calendarDays: [],
    dayNames: DAY_NAMES_EN,

    // Bento data
    todayTitle: '',
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
  },

  onLoad() {
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      _dataLoaded: true,
      locale: app.globalData.language || 'en',
      theme: app.globalData.theme || 'night',
    });
    const today = new Date();
    const iso = today.toISOString().split('T')[0];
    this.setData({
      historyDate: iso,
      displayDate: this._formatDisplayDate(iso),
      todayTitle: `今日训练 - ${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`,
      pickerYear: today.getFullYear(),
      pickerMonth: today.getMonth(),
      pickerYearLabel: this._getPickerYearLabel(today.getFullYear(), today.getMonth()),
      todayDay: String(today.getDate()),
      todayMonth: MONTH_NAMES_EN[today.getMonth()],
    });
    const yesterday = new Date(Date.now() - 86400000);
    this.setData({
      yesterdayDay: String(yesterday.getDate()),
      yesterdayMonth: MONTH_NAMES_EN[yesterday.getMonth()],
    });

    // openid ready → load immediately; otherwise poll
    if (app.globalData.openid) {
      this._loadData();
    } else {
      const tryLoad = () => {
        if (app.globalData.openid) {
          this._loadData();
        } else {
          setTimeout(tryLoad, 100);
        }
      };
      tryLoad();
    }
  },

  onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'en';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }

    const chosen = getApp().globalData.chosenExercise;
    if (chosen && this.data.runningSession) {
      getApp().globalData.chosenExercise = null;
      this.addExerciseToSession(chosen);
      return;
    }

    // onLoad already loaded data, skip
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
          const vol = (ex.weight || 0) * (ex.reps || 0);
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
      const volume = groups.reduce((sum, g) =>
        sum + g.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);
      this.setData({
        exerciseGroups: groups,
        exerciseCount: groups.length,
        totalVolume: Math.round(volume),
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

  noop() {},

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
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const mins = Math.floor((s.duration || 0) / 60);
        return { ...s, timeStr, durationStr: `${mins} MIN` };
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

  async stopWorkout() {
    const sessionId = this.data.currentSessionId || (this.data.runningSession ? (this.data.runningSession._id || this.data.runningSession.id) : null);
    const locale = this.data.locale || 'en';
    wx.showModal({
      title: locale === 'zh' ? '结束训练' : 'END TRAINING',
      content: locale === 'zh' ? '确定要结束本次训练吗？' : 'Are you sure you want to end this training session?',
      confirmColor: '#ccf200',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: locale === 'zh' ? '结束中...' : 'ENDING...', mask: true });
        // Gather summary data first
        let totalVolume = this.data.totalVolume;
        let exerciseCount = this.data.exerciseCount;
        let elapsedSeconds = 0;
        if (this.data.runningSession && this.data.runningSession.start_time) {
          elapsedSeconds = Math.floor((Date.now() - new Date(this.data.runningSession.start_time).getTime()) / 1000);
        }
        const r = await wx.cloud.callFunction({
          name: 'api',
          data: { action: 'session.finish', session_id: sessionId, openid: app.globalData.openid },
        });
        wx.hideLoading();
        if (r.result && r.result.success) {
          this._stopTimers();
          // Show workout summary modal
          this.setData({
            showWorkoutSummary: true,
            workoutSummarySession: {
              ...this.data.runningSession,
              duration: elapsedSeconds,
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
    });
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
