// pages/stats/index.js — garcia-fitness-new style with F2 charts
const app = getApp();
const { toKg } = require('../../utils/unit.js');

// Compute ISO yrweek key e.g. 202621 for 2026-W21
function toYrweek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const dayNum = d.getDay();
  const MonToSun = dayNum === 0 ? 6 : dayNum - 1;
  d.setDate(d.getDate() - MonToSun);
  const thu = new Date(d);
  thu.setDate(d.getDate() + 4);
  const isoYear = thu.getFullYear();
  const jan1 = new Date(isoYear, 0, 1);
  const days = Math.floor((thu - jan1) / 86400000);
  const week = Math.ceil((days + 1) / 7);
  return String(isoYear) + String(week).padStart(2, '0');
}

Page({
  data: {
    imgPrefix: '',
    locale: 'en',
    theme: 'night',
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
    const app = getApp();
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      locale: app.globalData.language,
      theme: app.globalData.theme,
    });
  },

  async onShow() {
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'zh';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }
    await this._loadAll();
  },

  async _loadAll() {
    const loadingText = (this.data.locale || 'zh') === 'zh' ? '加载中...' : 'LOADING...';
    wx.showLoading({ title: loadingText, mask: true });
    this.setData({ loading: true });

    const [statsRes] = await Promise.all([
      wx.cloud.callFunction({ name: 'api', data: { action: 'stats.summary', openid: app.globalData.openid } }),
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
      const yrweek = toYrweek(wd);
      const label = (this.data.locale || 'zh') === 'zh'
        ? wd.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
        : wd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyVolume.push({ label, volume: weekMap[yrweek] || 0, yrweek });
    }

    // Percent relative to max
    const maxVol = Math.max(...weeklyVolume.map(w => w.volume), 1);
    weeklyVolume.forEach(w => { w.percent = Math.round((w.volume / maxVol) * 100); });

    // Muscle distribution (derived from body_part_id, locale-aware)
    const muscleMap = {};
    const { BODY_PART_MAP, BODY_PART_MAP_ZH } = require('../../utils/maps.js');
    historyExercises.forEach(ex => {
      const total = ex.records.reduce((s, r) => s + toKg(r.weight, r.weight_unit) * (Number(r.reps) || 0), 0);
      if (total === 0) return;
      const partIds = String(ex.body_part_ids || '').split(',').map(id => id.trim()).filter(Boolean);
      partIds.forEach(partId => {
        const name = (this.data.locale || 'zh') === 'zh'
          ? (BODY_PART_MAP_ZH[partId] || '其他')
          : (BODY_PART_MAP[partId] || 'Other');
        muscleMap[name] = (muscleMap[name] || 0) + total;
      });
    });
    const muscleDistribution = Object.entries(muscleMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Assign colors to muscle groups
    const MUSCLE_COLORS = ['#ccf200', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8'];
    muscleDistribution.forEach((m, i) => { m.color = MUSCLE_COLORS[i % MUSCLE_COLORS.length]; });

    // Most trained exercises — use locale-aware name
    const mostTrained = historyExercises
      .map(ex => ({
        name: (this.data.locale || 'zh') === 'zh' ? (ex.name_zh || ex.name) : (ex.name_en || ex.name),
        count: ex.records.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Exercise list for selector — use locale-aware name
    const exerciseList = historyExercises.map(ex => ({
      id: ex.exercise_id,
      name: (this.data.locale || 'zh') === 'zh' ? (ex.name_zh || ex.name) : (ex.name_en || ex.name),
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

    // Auto-select first exercise and load its max record
    if (exerciseList.length > 0) {
      const first = exerciseList[0];
      this.setData({
        selectedExerciseId: first.id,
        selectedExerciseName: first.name,
      });
      this._loadExerciseData(first.id);
    }

    // Render muscle pie chart after data is set
    if (muscleDistribution.length > 0) {
      setTimeout(() => this._renderMuscleChart(), 300);
    }
  },

  async _loadExerciseData(exerciseId) {
    const loadingText = (this.data.locale || 'zh') === 'zh' ? '加载中...' : 'LOADING...';
    wx.showLoading({ title: loadingText, mask: true });
    const [recRes, recordsRes] = await Promise.all([
      wx.cloud.callFunction({
        name: 'api',
        data: { action: 'stats.exerciseMax', exercise_id: exerciseId, openid: app.globalData.openid },
      }),
      wx.cloud.callFunction({
        name: 'api',
        data: { action: 'stats.exerciseRecords', exercise_id: exerciseId, openid: app.globalData.openid },
      }),
    ]);
    wx.hideLoading();

    if (recRes.result && recRes.result.success) {
      this.setData({ maxRecord: recRes.result.maxRecord || null });
    }

    if (recordsRes.result && recordsRes.result.success) {
      const records = recordsRes.result.records || [];
      this.setData({ weightRecords: records });
      setTimeout(() => this._renderWeightChart(records), 300);
    }
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

    this._loadExerciseData(exercise.id);
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

    const theme = this.data.theme || 'night';
    const page = this;
    const drawChart = () => {
      const query = wx.createSelectorQuery().in(page);
      query.select('#weightChart').node((res) => {
        if (!res || !res.node) return;
        const canvas = res.node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio || wx.getSystemInfoSync().pixelRatio;
        const size = 200;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        page._drawCurveChart(ctx, chartData, size, size, theme);
      }).exec();
    };
    drawChart();
    setTimeout(drawChart, 300);
  },

  _drawCurveChart(ctx, data, width, height, theme) {
    if (!data || data.length === 0) return;
    if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return;

    const isDay = theme === 'day';
    const pad = { t: 12, r: 4, b: 28, l: 20 };
    const W = width - pad.l - pad.r;
    const H = height - pad.t - pad.b;
    if (W <= 0 || H <= 0) return;

    const maxW = Math.max(...data.map(d => d.weight || 0), 1);
    const lineColor = '#ccf200';
    const dimColor = isDay ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
    const labelColor = isDay ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';

    // Background
    ctx.fillStyle = isDay ? '#f5f5f5' : 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, width, height);

    // Grid — horizontal lines only, subtle
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (H / 3) * i;
      if (!isFinite(y)) continue;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + W, y);
      ctx.stroke();
    }

    // Y axis — left side, weight values in kg
    ctx.fillStyle = labelColor;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 3; i++) {
      const val = Math.round(maxW * (1 - i / 3));
      const y = pad.t + (H / 3) * i + 4;
      if (!isFinite(y)) continue;
      ctx.fillText(`${val}kg`, 0, y);
    }

    // Compute points
    const pts = data.map((d, i) => {
      const x = pad.l + (W / Math.max(data.length - 1, 1)) * i;
      const y = pad.t + H - (d.weight / maxW) * H;
      return { x: isFinite(x) ? x : pad.l, y: isFinite(y) ? y : pad.t + H, weight: d.weight };
    });

    // Filled area under the curve
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + H);
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = pts[i - 1];
        const mx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, (prev.y + p.y) / 2);
        ctx.quadraticCurveTo(mx, (prev.y + p.y) / 2, p.x, p.y);
      }
    });
    ctx.lineTo(pts[pts.length - 1].x, pad.t + H);
    ctx.lineTo(pad.l, pad.t + H);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + H);
    grad.addColorStop(0, 'rgba(204,242,0,0.15)');
    grad.addColorStop(1, 'rgba(204,242,0,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke the line
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + H);
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = pts[i - 1];
        const mx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, (prev.y + p.y) / 2);
        ctx.quadraticCurveTo(mx, (prev.y + p.y) / 2, p.x, p.y);
      }
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // X axis labels — record indices (1, 2, 3...)
    ctx.fillStyle = labelColor;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    pts.forEach((p, i) => {
      if (!isFinite(p.x)) return;
      ctx.fillText(`${i + 1}`, p.x, pad.t + H + 14);
    });
  },

  _hideChart() {
    this.setData({ weightRecords: [] });
  },

  _renderMuscleChart() {
    const muscleDistribution = this.data.muscleDistribution;
    if (!muscleDistribution || muscleDistribution.length === 0) return;

    const page = this;
    const drawChart = () => {
      const query = wx.createSelectorQuery().in(page);
      query.select('#muscleChart').node((res) => {
        if (!res || !res.node) return;
        const canvas = res.node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getWindowInfo().pixelRatio || wx.getSystemInfoSync().pixelRatio;
        const size = 120;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        page._drawPieChart(ctx, muscleDistribution, size, size);
      }).exec();
    };
    drawChart();
    setTimeout(drawChart, 300);
  },

  _drawPieChart(ctx, data, width, height) {
    if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return;
    const cx = width / 2;
    const cy = height / 2;
    const outerR = width / 2 - 2;
    const innerR = outerR * 0.55; // donut hole

    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2; // start at top
    data.forEach((d) => {
      if (!isFinite(d.value) || d.value < 0) { startAngle = startAngle; return; }
      const ratio = d.value / total;
      const endAngle = startAngle + ratio * 2 * Math.PI;
      if (!isFinite(startAngle) || !isFinite(endAngle)) return;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color || '#ccf200';
      ctx.fill();

      startAngle = endAngle;
    });
  },
});
