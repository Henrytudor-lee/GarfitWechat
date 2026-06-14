// components/session-orb/index.js — cover-view 版本
// 注: 拖拽功能被砍掉了, 因为 <cover-view> 不支持 catchtouchstart/move/end.
// 用户只能 tap 触发 orb-tap 事件跳转. orb 位置由组件根据 bottomOffset 自动算.
const app = getApp();

const ORB_SIZE_RPX = 112;
const MARGIN_RPX = 16;
const FAB_BOTTOM_RPX = 200;
const FAB_SIZE_RPX = 112;
const FAB_GAP_RPX = 20;

// 屏宽高 (rpx)
const sysInfo = wx.getSystemInfoSync();
const SCREEN_WIDTH_RPX = 750;
const SCREEN_HEIGHT_RPX = sysInfo.windowHeight * (750 / sysInfo.windowWidth);

// 默认位置 (贴右边距 24rpx)
const DEFAULT_X = SCREEN_WIDTH_RPX - ORB_SIZE_RPX - MARGIN_RPX;

// fab 位置: x=[screenWidth-fabSize-margin, screenWidth-margin], y=[screenHeight-fabBottom-fabSize, screenHeight-fabBottom]
const FAB_X_START = SCREEN_WIDTH_RPX - FAB_SIZE_RPX - MARGIN_RPX;
const FAB_X_END = SCREEN_WIDTH_RPX - MARGIN_RPX;
const FAB_Y_START = SCREEN_HEIGHT_RPX - FAB_BOTTOM_RPX - FAB_SIZE_RPX;
const FAB_Y_END = SCREEN_HEIGHT_RPX - FAB_BOTTOM_RPX;

// 检查 orb 是否与 fab 区域重叠
function collidesWithFab(orbX, orbY) {
  const orbXEnd = orbX + ORB_SIZE_RPX;
  const orbYEnd = orbY + ORB_SIZE_RPX;
  return !(orbXEnd < FAB_X_START || orbX > FAB_X_END || orbYEnd < FAB_Y_START || orbY > FAB_Y_END);
}

// orb 在 fab 上方 (留 FAB_GAP_RPX 间距) 的 Y 位置
const ABOVE_FAB_Y = FAB_Y_START - FAB_GAP_RPX - ORB_SIZE_RPX;

// idle: 屏幕底部 (tabbar 上方, 留足间距), 实际 Y 跟 bottomOffset 走
const IDLE_Y_BASE = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 220;

Component({
  properties: {
    session: {
      type: Object,
      value: null,
    },
    theme: {
      type: String,
      value: 'night',
    },
    // 把 orb 整体往上挪 offset rpx, 用来避开页面底部的 native 组件
    // (canvas / video / live-player 总在 webview 之上, cover-view 才能压住)
    bottomOffset: {
      type: Number,
      value: 0,
    },
  },

  data: {
    durationDisplay: '00:00',
    hasSession: false,
    _tickHandle: null,
    positionX: DEFAULT_X,
    positionY: IDLE_Y_BASE,
  },

  observers: {
    'session': function (session) {
      this._applySession(session);
    },
  },

  lifetimes: {
    attached() {
      this._applySession(this.data.session);
    },
    detached() {
      this._stopTick();
    },
  },

  methods: {
    _getIdleY() {
      return IDLE_Y_BASE - (this.data.bottomOffset || 0);
    },

    _getActiveY() {
      return ABOVE_FAB_Y - (this.data.bottomOffset || 0);
    },

    _applySession(session) {
      const hasSession = !!(session && session.start_time);
      this.setData({ hasSession });
      if (hasSession) {
        this._tick();
        this._startTick();
        // active: 保持当前 X, 智能调整 Y (active 状态要避让 FAB)
        const newY = collidesWithFab(this.data.positionX, this.data.positionY)
          ? this._getActiveY()
          : this.data.positionY;
        this.setData({ positionY: newY });
      } else {
        this._stopTick();
        this.setData({ durationDisplay: '00:00' });
        this.setData({ positionX: DEFAULT_X, positionY: this._getIdleY() });
      }
    },

    _startTick() {
      this._stopTick();
      const handle = setInterval(() => this._tick(), 1000);
      this.setData({ _tickHandle: handle });
    },

    _stopTick() {
      const h = this.data._tickHandle;
      if (h) {
        clearInterval(h);
        this.setData({ _tickHandle: null });
      }
    },

    _tick() {
      const session = this.data.session;
      if (!session || !session.start_time) return;
      const ms = Date.now() - new Date(session.start_time).getTime();
      this.setData({ durationDisplay: formatDuration(ms) });
    },

    onTap() {
      this.triggerEvent('orb-tap', { hasSession: this.data.hasSession });
      // fallback: 如果事件没穿透, 直接调页面方法
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && typeof page.onOrbTap === 'function') {
        page.onOrbTap({ hasSession: this.data.hasSession });
      }
    },
  },
});

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
