// pages/my-shares/index.js — 我的分享(管理已分享出去的训练链接)
//
// 分享出去的是**别人的数据**了 —— 所以必须能撤销。
// 后端 share.list 返回我分享过的链接, share.revoke 只能撤自己的。
const app = getApp();
const api = require('../../utils/api.js');

/** 秒 → "H:MM" / "M:SS" */
function formatDuration(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (total <= 0) return '--:--';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
}

Page({
  data: {
    loading: true,
    items: [],
    revoking: '',
    locale: 'zh',
    theme: 'night',
    t: {},
  },

  onLoad() {
    this.setData({
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
    });
    this.load();
  },

  onShow() {
    this.setData({
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
    });
    if (this.data.items.length) this.load();   // 从别的页返回时刷新(撤销后状态要更新)
  },

  _t(key, fallback) {
    const dict = this.data.t || {};
    return dict[key] || fallback || key;
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await api.callCloud('share.list', {});
      const items = (res.result && res.result.items) || [];
      const now = Date.now();
      this.setData({
        loading: false,
        items: items.map((it) => {
          const expired = !!it.expires_at && new Date(it.expires_at).getTime() < now;
          let status = 'ACTIVE';
          if (it.revoked) status = 'REVOKED';
          else if (expired) status = 'EXPIRED';
          else if (it.session_id == null) status = 'DELETED';
          return {
            ...it,
            status,
            durationStr: formatDuration(it.duration),
            dateText: it.start_time
              ? new Date(it.start_time).toLocaleString(this.data.locale === 'zh' ? 'zh-CN' : 'en-US',
                { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '',
          };
        }),
      });
    } catch (err) {
      console.error('[my-shares] load failed', err);
      this.setData({ loading: false });
      wx.showToast({ title: this._t('SHARE_LOAD_FAILED'), icon: 'none' });
    }
  },

  /**
   * 点整行 → 打开那次分享的详情页
   *
   * 分享出去后, 别人看到的就是 pages/share/index?token=xxx 这个页面。
   * 分享者自己也能看 —— share.view 本来就是公开接口(凭 token 精确查),
   * 只是之前没给入口。点开就能预览"对方看到的样子", 顺带验证分享效果。
   */
  onItemTap(e) {
    const token = e.currentTarget.dataset.token;
    if (!token) return;
    wx.navigateTo({ url: `/pages/share/index?token=${token}` });
  },

  onRevoke(e) {
    const token = e.currentTarget.dataset.token;
    if (!token) return;
    if (this.data.revoking) return;

    const isZh = (this.data.locale || 'zh') === 'zh';
    wx.showModal({
      title: isZh ? '取消分享' : 'Revoke share',
      content: isZh
        ? '取消后, 拿到这个链接的人就看不到了'
        : 'After revoking, anyone with this link can no longer view it',
      confirmText: isZh ? '取消分享' : 'Revoke',
      cancelText: isZh ? '返回' : 'Cancel',
      confirmColor: '#ccf200',
      success: (res) => {
        if (!res.confirm) return;
        this.revoke(token);
      },
    });
  },

  async revoke(token) {
    this.setData({ revoking: token });
    try {
      await api.callCloud('share.revoke', { token });
      wx.showToast({ title: this._t('SHARE_REVOKED_TOAST'), icon: 'success' });
      await this.load();
    } catch (err) {
      console.error('[my-shares] revoke failed', err);
      wx.showToast({ title: this._t('SHARE_LOAD_FAILED'), icon: 'none' });
    } finally {
      this.setData({ revoking: '' });
    }
  },
});
