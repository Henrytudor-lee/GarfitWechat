// pages/stats/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    stats: {},
    exerciseList: [],
    selectedExerciseName: '',
    maxRecord: null,
    weeklyVolume: [],        // [{label, volume, percent}]
    mostTrained: [],         // [{name, count}]
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    await this._loadAll();
  },

  async _loadAll() {
    wx.showLoading({ title: 'LOADING...', mask: true });

    const [statsRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'stats', data: {} }),
    ]);

    wx.hideLoading();

    if (statsRes.result && statsRes.result.success) {
      const stats = statsRes.result.stats;

      // Build weeklyVolume: last 7 days, fill missing days with 0
      const volumeMap = {};
      (stats.weeklyVolume || []).forEach(v => {
        volumeMap[v.day] = v.volume;
      });

      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const today = new Date();
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = d.toISOString().slice(0, 10);   // 'YYYY-MM-DD'
        last7.push({
          day: iso,
          label: dayNames[d.getDay()],
          volume: volumeMap[iso] || 0,
        });
      }

      // Percent relative to max volume in the 7-day window
      const maxVol = Math.max(...last7.map(d => d.volume), 1);
      last7.forEach(d => { d.percent = Math.round((d.volume / maxVol) * 100); });

      // Most trained: group by body_part from exercises done in last 7 days
      // stats API doesn't expose body_part, so we show a placeholder count
      const mostTrained = (stats.weeklyVolume || []).slice(-7).map((v, i) => ({
        name: last7[i] ? last7[i].label : `Day ${i + 1}`,
        count: v.volume > 0 ? Math.round(v.volume / 100) : 0,
      })).filter(d => d.count > 0);

      this.setData({
        stats,
        weeklyVolume: last7,
        mostTrained: mostTrained.length ? mostTrained : [],
      });
    }
  },

  async onExerciseChange(e) {
    const idx = e.detail.value;
    const list = this.data.exerciseList;
    if (!list || !list[idx]) return;

    const exercise = list[idx];
    this.setData({ selectedExerciseName: exercise.name });

    // Load max record for this exercise
    wx.showLoading({ title: 'LOADING...', mask: true });
    const [recRes] = await Promise.all([
      wx.cloud.callFunction({
        name: 'stats',
        data: { action: 'exerciseMax', exercise_id: exercise.id },
      }),
    ]);
    wx.hideLoading();

    if (recRes.result && recRes.result.success && recRes.result.maxRecord) {
      this.setData({ maxRecord: recRes.result.maxRecord });
    } else {
      this.setData({ maxRecord: null });
    }
  },
});
