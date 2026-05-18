// pages/stats/index.js — garcia-fitness-new style with F2 charts
const app = getApp();

Page({
  data: {
    imgPrefix: '',
    // Summary
    totalSessions: 0,
    currentStreak: 0,
    weekWorkouts: 0,
    totalVolume: 0,
    // Exercise selector
    exerciseList: [],
    selectedExerciseId: null,
    selectedExerciseName: '',
    // Max record
    maxRecord: null,
    // Chart data
    weeklyVolume: [],   // [{label, volume, percent}]
    muscleDistribution: [],
    mostTrained: [],
    // Weight records for selected exercise
    weightRecords: [],
    // UI state
    loading: false,
    hasData: false,
  },

  onLoad() {
    this.setData({ imgPrefix: app.globalData.imagePrefix });
  },

  async onShow() {
    await this._loadAll();
  },

  async _loadAll() {
    wx.showLoading({ title: 'LOADING...', mask: true });
    this.setData({ loading: true });

    const [statsRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'stats', data: { action: 'summary', openid: app.globalData.openid } }),
    ]);

    wx.hideLoading();
    this.setData({ loading: false });

    if (!statsRes.result || !statsRes.result.success) {
      console.error('Stats load failed:', statsRes.result);
      return;
    }

    const d = statsRes.result.data;
    const historyExercises = d.historyExercises || [];

    // Build weekly volume — last 8 weeks
    const weekMap = {};
    (d.weeklyVolume || []).forEach(v => {
      const key = v.yrweek;
      if (!weekMap[key]) weekMap[key] = 0;
      weekMap[key] += Number(v.volume);
    });

    const now = new Date();
    const weeklyVolume = [];
    for (let i = 7; i >= 0; i--) {
      const wd = new Date(now);
      wd.setDate(now.getDate() - i * 7);
      const iso = wd.toISOString().slice(0, 10);
      const label = wd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyVolume.push({ label, volume: weekMap[iso] || 0, iso });
    }

    // Percent relative to max
    const maxVol = Math.max(...weeklyVolume.map(w => w.volume), 1);
    weeklyVolume.forEach(w => { w.percent = Math.round((w.volume / maxVol) * 100); });

    // Muscle distribution (derived from exercise names)
    const muscleMap = {};
    historyExercises.forEach(ex => {
      const total = ex.records.reduce((s, r) => s + (r.weight || 0) * (r.reps || 0), 0);
      if (total === 0) return;
      const name = (ex.name || '').toLowerCase();
      let muscle = 'Other';
      if (name.includes('chest') || name.includes('bench') || name.includes('fly')) muscle = 'Chest';
      else if (name.includes('back') || name.includes('row') || name.includes('lat')) muscle = 'Back';
      else if (name.includes('squat') || name.includes('leg') || name.includes('quad') || name.includes('ham') || name.includes('calf')) muscle = 'Legs';
      else if (name.includes('shoulder') || name.includes('press') || name.includes('lateral')) muscle = 'Shoulders';
      else if (name.includes('bicep') || name.includes('curl') || name.includes('tricep')) muscle = 'Arms';
      else if (name.includes('core') || name.includes('plank') || name.includes('ab')) muscle = 'Core';
      muscleMap[muscle] = (muscleMap[muscle] || 0) + total;
    });
    const muscleDistribution = Object.entries(muscleMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Most trained exercises
    const mostTrained = historyExercises
      .map(ex => ({ name: ex.name, count: ex.records.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Exercise list for selector
    const exerciseList = historyExercises.map(ex => ({
      id: ex.exercise_id,
      name: ex.name,
    }));

    const hasData = historyExercises.length > 0 || d.totalSessions > 0;

    this.setData({
      totalSessions: d.totalSessions || 0,
      currentStreak: d.currentStreak || 0,
      weekWorkouts: d.weekWorkouts || 0,
      totalVolume: d.totalVolume || 0,
      exerciseList,
      weeklyVolume,
      muscleDistribution,
      mostTrained,
      hasData,
    });
  },

  async onExerciseChange(e) {
    const idx = e.detail.value;
    const list = this.data.exerciseList;
    if (!list || !list[idx]) return;

    const exercise = list[idx];
    this.setData({
      selectedExerciseId: exercise.id,
      selectedExerciseName: exercise.name,
    });

    wx.showLoading({ title: 'LOADING...', mask: true });
    const [recRes, recordsRes] = await Promise.all([
      wx.cloud.callFunction({
        name: 'stats',
        data: { action: 'exerciseMax', exercise_id: exercise.id, openid: app.globalData.openid },
      }),
      wx.cloud.callFunction({
        name: 'stats',
        data: { action: 'exerciseRecords', exercise_id: exercise.id, openid: app.globalData.openid },
      }),
    ]);
    wx.hideLoading();

    if (recRes.result && recRes.result.success) {
      this.setData({ maxRecord: recRes.result.maxRecord || null });
    }

    if (recordsRes.result && recordsRes.result.success) {
      const records = recordsRes.result.records || [];
      this.setData({ weightRecords: records });
      this._renderWeightChart(records);
    }
  },

  _renderWeightChart(records) {
    if (!records || records.length === 0) {
      this._hideChart();
      return;
    }

    const chartData = records.map((r, i) => ({
      index: i + 1,
      weight: Number(r.weight) || 0,
      reps: Number(r.reps) || 0,
    }));

    // Use F2 canvas chart via wx-charts compatible approach
    const query = wx.createSelectorQuery().in(this);
    query.select('#weightChart').node((res) => {
      const canvas = res.node;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = res.width * dpr;
      canvas.height = res.height * dpr;
      ctx.scale(dpr, dpr);

      // Draw a simple bar chart manually on canvas
      this._drawBarChart(ctx, chartData, res.width, res.height);
    }).exec();
  },

  _drawBarChart(ctx, data, width, height) {
    if (!data || data.length === 0) return;

    const padding = { top: 16, right: 16, bottom: 32, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxWeight = Math.max(...data.map(d => d.weight), 1);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Y axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxWeight * (1 - i / 4));
      const y = padding.top + (chartH / 4) * i + 4;
      ctx.fillText(`${val}kg`, padding.left - 4, y);
    }

    // X axis labels
    ctx.textAlign = 'center';
    const barWidth = Math.max(4, Math.min(20, chartW / data.length - 4));
    data.forEach((d, i) => {
      const x = padding.left + (chartW / data.length) * i + (chartW / data.length - barWidth) / 2;
      const barH = (d.weight / maxWeight) * chartH;
      const y = padding.top + chartH - barH;

      // Bar gradient
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#ccf200');
      grad.addColorStop(1, 'rgba(204,242,0,0.3)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [3, 3, 0, 0]);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px sans-serif';
      ctx.fillText(`#${d.index}`, x + barWidth / 2, height - padding.bottom + 12);
    });
  },

  _hideChart() {
    this.setData({ weightRecords: [] });
  },
});
