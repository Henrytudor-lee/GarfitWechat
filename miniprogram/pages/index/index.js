// pages/index/index.js — garcia-fitness-new style
const app = getApp();

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
    sessionStartMs: 0,
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  onShow() {
    this._loadData();
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
  },

  async _loadData() {
    wx.showLoading({ title: 'LOADING...', mask: true });

    // Load running session + recent sessions in parallel
    const [runRes, recentRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'session', data: { action: 'getRunning' } }),
      wx.cloud.callFunction({ name: 'session', data: { action: 'list', page: 1, pageSize: 5 } }),
    ]);

    wx.hideLoading();

    if (runRes.result && runRes.result.session) {
      const session = runRes.result.session;
      this.setData({ runningSession: session });
      this._startTimer(session.start_time);
      this._loadExerciseGroups(session.id);
    } else {
      this.setData({ runningSession: null, exerciseGroups: [] });
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
  },

  async _loadExerciseGroups(sessionId) {
    const res = await wx.cloud.callFunction({
      name: 'exercise',
      data: { action: 'list', sessionId },
    });
    if (res.result && res.result.success) {
      // Group by exercise_id
      const map = {};
      for (const ex of res.result.exercises || []) {
        if (!map[ex.exercise_id]) {
          map[ex.exercise_id] = { ...ex, sets: [] };
        }
        if (ex.weight > 0 || ex.reps > 0) {
          map[ex.exercise_id].sets.push({
            weight: ex.weight,
            unit: ex.weight_unit,
            reps: ex.reps,
          });
        }
      }
      const groups = Object.values(map);
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

  async startWorkout() {
    wx.showLoading({ title: 'STARTING...', mask: true });
    const res = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'create' },
    });
    wx.hideLoading();
    if (res.result && res.result.success) {
      const session = res.result.session || { id: res.result.sessionId, start_time: new Date().toISOString() };
      this.setData({ runningSession: session, exerciseGroups: [], exerciseCount: 0, totalVolume: 0 });
      this._startTimer(session.start_time || new Date().toISOString());
    }
  },

  async stopWorkout() {
    wx.showModal({
      title: 'END TRAINING',
      content: 'Are you sure you want to end this training session?',
      confirmColor: '#ccf200',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: 'ENDING...', mask: true });
        const r = await wx.cloud.callFunction({
          name: 'session',
          data: { action: 'finish', sessionId: this.data.runningSession.id },
        });
        wx.hideLoading();
        if (r.result && r.result.success) {
          if (this.data.timer) clearInterval(this.data.timer);
          this.setData({ runningSession: null, exerciseGroups: [], exerciseCount: 0, totalVolume: 0, elapsedTime: '00:00:00' });
          wx.showToast({ title: 'TRAINING COMPLETE!', icon: 'success' });
          this._loadData();
        }
      },
    });
  },

  goToLibrary() {
    wx.navigateTo({ url: '/pages/library/index?select=true' });
  },

  onExerciseTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/exercise-detail/index?id=${item.exercise_id || item.id}&name=${encodeURIComponent(item.name_zh || item.name)}`,
    });
  },
});
