// pages/stats/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    stats: {},
    exerciseList: [],
    selectedExerciseName: '',
    maxRecord: null,
    weeklyVolume: [],
    userId: null,
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    const userId = app.globalData.userId;
    if (!userId) {
      const loginRes = await wx.cloud.callFunction({ name: 'loginByWx' });
      if (loginRes.result && loginRes.result.success) {
        app.globalData.userId = loginRes.result.userId;
        this.setData({ userId: loginRes.result.userId });
        await this._loadAll();
      }
    } else {
      this.setData({ userId });
      await this._loadAll();
    }
  },

  async _loadAll() {
    wx.showLoading({ title: 'LOADING...', mask: true });
    const userId = this.data.userId;

    const [statsRes, historyRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'stats', data: {} }),
      wx.cloud.callFunction({
        name: 'exercise',
        data: { action: 'historyByUser', userId, page: 1, pageSize: 50 },
      }),
    ]);

    wx.hideLoading();

    if (statsRes.result && statsRes.result.success) {
      this.setData({ stats: statsRes.result.stats });
    }

    if (historyRes.result && historyRes.result.success) {
      const records = historyRes.result.exercises || [];
      // Group by exercise
      const byExercise = {};
      for (const r of records) {
        const key = r.exercise_id;
        if (!byExercise[key]) {
          byExercise[key] = { exercise_id: key, name: r.name || 'Unknown', sets: [] };
        }
        byExercise[key].sets.push(r);
      }
      const list = Object.values(byExercise);
      this.setData({ exerciseList: list });

      if (list.length > 0) {
        this._selectExercise(list[0]);
      }
    }

    // Build weekly volume
    this._buildWeeklyVolume(records || []);
  },

  _selectExercise(ex) {
    const sets = ex.sets || [];
    const max = sets.length > 0
      ? sets.reduce((prev, curr) => curr.weight > prev.weight ? curr : prev)
      : { weight: 0, reps: 0 };
    const totalSets = sets.length;

    this.setData({
      selectedExerciseName: ex.name,
      maxRecord: {
        weight: max.weight || 0,
        reps: max.reps || 0,
        totalSets,
      },
    });
  },

  onExerciseChange(e) {
    const idx = e.detail.value;
    const ex = this.data.exerciseList[idx];
    if (ex) this._selectExercise(ex);
  },

  _buildWeeklyVolume(records) {
    // Last 8 weeks
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const label = `${d.getMonth()+1}/${d.getDate()}`;
      weeks.push({ label, volume: 0, maxVol: 0 });
    }

    for (const r of records) {
      const d = new Date(r.create_time);
      const idx = weeks.findIndex((w, wi) => {
        const wd = new Date(now);
        wd.setDate(wd.getDate() - (7 - wi) * 7);
        const start = new Date(wd);
        start.setDate(start.getDate() - 6);
        return d >= start && d <= wd;
      });
      if (idx >= 0) {
        weeks[idx].volume += (r.weight || 0) * (r.reps || 0);
      }
    }

    const maxVol = Math.max(...weeks.map(w => w.volume), 1);
    const weeklyVolume = weeks.map(w => ({
      ...w,
      percent: Math.round((w.volume / maxVol) * 100),
      volume: Math.round(w.volume),
    }));

    this.setData({ weeklyVolume });
  },
});
