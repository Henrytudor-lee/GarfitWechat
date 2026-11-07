// pages/share/index.js — 训练分享页
//
// B 点开 A 的分享卡片后进到这里(path: /pages/share/index?token=xxx)。
// 数据走 share.view —— 这是**公开接口**, 不需要登录, 凭 token 精确查。
// (B 可能压根没登录过小程序, 更没有 A 的身份 —— 训练数据全按 _openid 归属校验,
//  只有 token 这一条路能读。)
const app = getApp();
const api = require('../../utils/api.js');
const {
  BODY_PART_MAP, BODY_PART_MAP_ZH, EQUIP_MAP, EQUIP_MAP_ZH,
} = require('../../utils/maps.js');

/** 计量方式 → 展示标签(与动作库页 buildModeLabel 同一口径) */
function modeLabel(exerciseType, t) {
  const raw = (exerciseType || 'weight_reps');
  if (raw === 'duration') return t.MODE_TIMED || 'TIMED';
  if (raw === 'distance_duration') return t.MODE_DISTANCE || 'DISTANCE';
  return t.REPS || 'REPS';
}

/** 逗号分隔的 id 串 → 名称数组(肌群是 "19,1" 这种多值) */
function idsToNames(raw, map, mapZh, isZh) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (isZh ? (mapZh[id] || map[id]) : (map[id] || mapZh[id])))
    .filter(Boolean);
}

/** 时长(秒) → "H:MM" / "M:SS"(与会话详情弹框同一口径) */
function formatDuration(sec) {
  const total = Math.floor(Number(sec) || 0);
  if (total <= 0) return '--:--';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** ISO → 本地日期时间文本 */
function formatDateTime(iso, isZh) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return isZh ? `${ymd} ${hm}` : `${ymd} ${hm}`;
}

Page({
  data: {
    loading: true,
    error: '',
    errorCode: '',

    token: '',
    training: null,
    owner: null,
    groups: [],

    // 动作详情弹层
    detailOpen: false,
    detail: null,

    imgPrefix: '',
    vidPrefix: '',
    locale: 'zh',
    theme: 'night',
    t: {},
  },

  onLoad(query) {
    const token = (query && query.token) || '';
    this.setData({
      token,
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
    });
    if (!token) {
      this.setData({ loading: false, errorCode: 'NOT_FOUND', error: this._t('SHARE_NOT_FOUND') });
      return;
    }
    this.loadShare(token);
  },

  onShow() {
    // 主题/语言可能在设置里改过
    this.setData({
      locale: app.globalData.language || 'zh',
      theme: app.globalData.theme || 'night',
      t: app.globalData.t || {},
      imgPrefix: app.globalData.imagePrefix || '',
      vidPrefix: app.globalData.videoPrefix || '',
    });
  },

  _t(key, fallback) {
    const dict = this.data.t || {};
    return dict[key] || fallback || key;
  },

  async loadShare(token) {
    this.setData({ loading: true, error: '', errorCode: '' });
    try {
      const res = await api.callCloud('share.view', { token });
      const body = res.result || {};
      const t = this.data.t || {};
      const isZh = (this.data.locale || 'zh') === 'zh';

      const groups = (body.groups || []).map((g) => ({
        ...g,
        // ⚠️ totalVolume / totalCalories 由**后端**算好(用的是分享者 A 的体重)。
        //    前端要是自己用 app.globalData.userWeight 算, 算的是**浏览者 B**的体重,
        //    每组卡路里会跟总卡路里对不上。所以这里直接用后端给的, 不重算。
        modeLabel: modeLabel(g.exercise_type, t),
        muscleNames: idsToNames(g.body_part_id, BODY_PART_MAP, BODY_PART_MAP_ZH, isZh),
        equipmentNames: idsToNames(g.equipment_id, EQUIP_MAP, EQUIP_MAP_ZH, isZh),
      }));

      this.setData({
        loading: false,
        training: {
          ...(body.training || {}),
          durationStr: formatDuration(body.training && body.training.duration),
          dateText: formatDateTime(body.training && body.training.start_time, isZh),
        },
        owner: body.owner || null,
        groups,
      });
    } catch (err) {
      // 失效原因要分清楚: 过期 / 被撤销 / 不存在 / 网络错
      const msg = String(err && err.message || '');
      let code = 'LOAD_FAILED';
      if (/过期/.test(msg)) code = 'EXPIRED';
      else if (/取消/.test(msg)) code = 'REVOKED';
      else if (/无效|不存在|删除/.test(msg)) code = 'NOT_FOUND';
      this.setData({
        loading: false,
        errorCode: code,
        error: this._t(
          code === 'EXPIRED' ? 'SHARE_EXPIRED'
            : code === 'REVOKED' ? 'SHARE_REVOKED'
            : code === 'NOT_FOUND' ? 'SHARE_NOT_FOUND'
            : 'SHARE_LOAD_FAILED',
        ),
      });
    }
  },

  onRetry() {
    this.loadShare(this.data.token);
  },

  // No-op: 给 .sheet-mask 的 catchtouchmove 用 ——
  // 只拦 touchmove 不拦 touch 的话, 在弹层上滑动会带动背景页面滚动(滚动穿透)。
  noop() {},

  // ── 动作详情 ──
  onExerciseTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const g = this.data.groups[index];
    if (!g) return;
    const isZh = (this.data.locale || 'zh') === 'zh';
    this.setData({
      detailOpen: true,
      detail: {
        ...g,
        nameText: isZh ? (g.name_zh || g.name_en) : (g.name_en || g.name_zh),
        muscleNames: idsToNames(g.body_part_id, BODY_PART_MAP, BODY_PART_MAP_ZH, isZh),
        equipmentNames: idsToNames(g.equipment_id, EQUIP_MAP, EQUIP_MAP_ZH, isZh),
        modeLabel: modeLabel(g.exercise_type, this.data.t || {}),
      },
    });
  },

  closeDetail() {
    this.setData({ detailOpen: false, detail: null });
  },

  onDetailMaskTap(e) {
    if (e.target === e.currentTarget) this.closeDetail();
  },

  onDetailSheetTap() {
    // 阻止冒泡到遮罩
  },

  // ── 去练自己的 ──
  goStartWorkout() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
