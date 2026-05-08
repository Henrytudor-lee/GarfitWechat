// pages/history/index.js — garcia-fitness-new style
const app = getApp();

Page({
  data: {
    list: [],
    grouped: [],
    exerciseList: [],
    selectedName: '',
    loading: false,
  },

  async onShow() {
    await this._loadData();
  },

  async _loadData() {
    this.setData({ loading: true });

    let userId = app.globalData.userId;
    if (!userId) {
      const loginRes = await wx.cloud.callFunction({ name: 'loginByWx' });
      if (loginRes.result && loginRes.result.success) {
        userId = loginRes.result.userId;
        app.globalData.userId = userId;
      }
    }

    const res = await wx.cloud.callFunction({
      name: 'exercise',
      data: { action: 'historyByUser', userId, page: 1, pageSize: 100 },
    });

    this.setData({ loading: false });

    if (res.result && res.result.success) {
      const records = (res.result.exercises || []).map(r => {
        const d = new Date(r.create_time);
        return {
          ...r,
          dateStr: `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`,
        };
      });

      // All exercise names for picker
      const unique = {};
      for (const r of records) {
        if (!unique[r.exercise_id]) {
          unique[r.exercise_id] = r.name;
        }
      }
      const exerciseList = Object.entries(unique).map(([id, name]) => ({ id, name }));

      this.setData({ list: records, exerciseList });
      this._groupByMonth(records);
    }
  },

  onExerciseChange(e) {
    const idx = e.detail.value;
    const ex = this.data.exerciseList[idx];
    if (!ex) return;
    this.setData({ selectedName: ex.name });
    this._filterByExercise(ex.id);
  },

  _filterByExercise(exerciseId) {
    const filtered = this.data.list.filter(r => r.exercise_id === exerciseId);
    this._groupByMonth(filtered);
  },

  _groupByMonth(records) {
    const groups = {};
    for (const r of records) {
      const d = new Date(r.create_time);
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
    wx.navigateTo({
      url: `/pages/exercise-detail/index?id=${item.exercise_id}&name=${encodeURIComponent(item.name)}`,
    });
  },
});
