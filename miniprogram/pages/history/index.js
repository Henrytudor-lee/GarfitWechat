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

    const res = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'list', page: 1, pageSize: 100, openid: app.globalData.openid },
    });

    this.setData({ loading: false });

    if (res.result && res.result.success) {
      const sessions = (res.result.sessions || []).map(s => {
        const d = new Date(s.start_time);
        return {
          ...s,
          dateStr: `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`,
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
    wx.navigateTo({
      url: `/pages/exercise-detail/index?id=${item.exercise_id || item.id}&name=${encodeURIComponent(item.name || '')}`,
    });
  },
});
