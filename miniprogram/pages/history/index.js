// pages/history/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    list: [],
    grouped: [],
    exerciseList: [],
    selectedName: '',
    loading: false,
    // i18n + theme
    locale: 'en',
    theme: 'night',
    // session detail modal
    showSessionDetail: false,
    detailSession: null,
    detailSessionId: null,
    detailExercises: [],
  },

  async onShow() {
    // Refresh theme and locale from global app state
    const theme = app.getTheme ? app.getTheme() : (app.globalData.theme || 'night');
    const locale = app.globalData.language || 'en';
    if (this.data.theme !== theme || this.data.locale !== locale) {
      this.setData({ theme, locale });
    }
    await this._loadData();
  },

  async _loadData() {
    this.setData({ loading: true });

    const res = await wx.cloud.callFunction({
      name: 'api',
      data: { action: 'session.list', page: 1, pageSize: 100, openid: app.globalData.openid },
    });

    this.setData({ loading: false });

    if (res.result && res.result.success) {
      const sessions = (res.result.sessions || []).map(s => {
        const d = new Date(s.start_time);
        const totalSeconds = Math.floor(s.duration || 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const pad = (n) => String(n).padStart(2, '0');
        const durationStr = hours > 0
          ? `${pad(hours)}h ${pad(minutes)}m`
          : `${pad(minutes)} min`;
        return {
          ...s,
          dateStr: `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
          durationStr,
        };
      });

      this.setData({ list: sessions });
      this._groupByMonth(sessions);
    }
  },

  _groupByMonth(records) {
    const groups = {};
    for (const r of records) {
      const d = new Date(r.start_time);
      const key = `${d.getFullYear()}-${d.getMonth()+1}`;
      const label = `${d.getFullYear()} ${d.toLocaleString('en', { month: 'short' }).toUpperCase()}`;
      if (!groups[key]) groups[key] = { month: label, records: [] };
      groups[key].records.push(r);
    }
    const grouped = Object.values(groups);
    this.setData({ grouped });
  },

  onRecordTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    this.setData({
      showSessionDetail: true,
      detailSession: item,
      detailSessionId: item.id || item._id,
      detailExercises: [],
    });
    this._loadSessionExercises(item.id || item._id);
  },

  async _loadSessionExercises(sessionId) {
    if (!sessionId) return;
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'exercise.list',
        session_id: sessionId,
        openid: app.globalData.openid,
      },
    });
    if (res.result && res.result.success) {
      const map = {};
      for (const ex of res.result.exercises || []) {
        if (!map[ex.exercise_id]) {
          map[ex.exercise_id] = {
            _id: ex._id,
            name: ex.name,
            name_zh: ex.name_zh || ex.name,
            image_name: ex.image_name,
            exercise_id: ex.exercise_id,
            sets: [],
          };
        }
        if (ex.weight > 0 || ex.reps > 0) {
          map[ex.exercise_id].sets.push({
            id: ex.id || ex._id,
            weight: ex.weight,
            reps: ex.reps,
            weight_unit: ex.weight_unit || 'kg',
          });
        }
      }
      this.setData({ detailExercises: Object.values(map) });
    }
  },

  onDetailClose() {
    this.setData({ showSessionDetail: false, detailSession: null, detailSessionId: null, detailExercises: [] });
  },
});
