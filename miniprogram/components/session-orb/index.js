// components/session-orb/index.js
const app = getApp();

const STORAGE_KEY = 'orb_position';
const ORB_SIZE_RPX = 112;
const MARGIN_RPX = 16;  // 距屏幕边缘 24rpx (更美观)
const FAB_BOTTOM_RPX = 200;
const FAB_SIZE_RPX = 112;
const FAB_GAP_RPX = 20;  // orb 移到 fab 上方时, 留 20rpx 间距

// 屏宽高 (rpx)
const sysInfo = wx.getSystemInfoSync();
const SCREEN_WIDTH_RPX = 750;  // 设计稿基准
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
// orb bottom = fab top - gap = fab_y_start - gap
const ABOVE_FAB_Y = FAB_Y_START - FAB_GAP_RPX - ORB_SIZE_RPX;

// idle: 屏幕底部 (tabbar 上方, 留足间距)
// 注: 实际 Y 在 attached() 根据 bottomOffset 动态计算
const IDLE_Y_BASE = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 220;
// active: 默认放 fab 上方 (有 overlap 时会再调整)
const ACTIVE_Y = ABOVE_FAB_Y;

// px -> rpx 转换系数
const PX2RPX = 750 / sysInfo.windowWidth;

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
    // 把 orb 整体往上挪 offset rpx, 用于 stats 页面避开底部 canvas 图表
    // (WeChat 原生 canvas 总在 webview 之上, 无论 z-index 多高都盖住 orb)
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
    positionY: IDLE_Y_BASE,  // attached() 会按 bottomOffset 重算
    // drag state (全部 rpx)
    dragging: false,
    _dragStartX: 0,
    _dragStartY: 0,
    _originX: 0,
    _originY: 0,
    _wasDragging: false,
  },

  observers: {
    'session': function (session) {
      this._applySession(session);
    },
  },

  lifetimes: {
    attached() {
      const idleY = this._getIdleY();
      // 从 storage 读取位置 (单位 rpx)
      let pos = wx.getStorageSync(STORAGE_KEY);
      if (!pos || typeof pos.x !== 'number') {
        pos = { x: DEFAULT_X, y: idleY };
      }
      this.setData({ positionX: pos.x, positionY: pos.y });
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

    _applySession(session) {
      const hasSession = !!(session && session.start_time);
      this.setData({ hasSession });
      if (hasSession) {
        this._tick();
        this._startTick();
        // active: 保持当前 X, 智能调整 Y
        // 1) 如果用户拖到 fab 右侧 (默认 X), 移到 fab 上方
        // 2) 否则 Y 不变 (orb 在左侧或屏幕中间, fab 不冲突)
        let newY = this.data.positionY;
        if (collidesWithFab(this.data.positionX, newY)) {
          newY = ABOVE_FAB_Y;
        }
        this.setData({ positionY: newY });
      } else {
        this._stopTick();
        this.setData({ durationDisplay: '00:00' });
        // idle → 回到右下角默认位置
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
      if (this.data._wasDragging) return;
      this.triggerEvent('orb-tap', { hasSession: this.data.hasSession });
      // fallback: 如果事件没穿透, 直接调页面方法
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && typeof page.onOrbTap === 'function') {
        page.onOrbTap({ hasSession: this.data.hasSession });
      }
    },

    onTouchStart(e) {
      const t = e.touches[0];
      this.setData({
        _dragStartX: t.clientX * PX2RPX,
        _dragStartY: t.clientY * PX2RPX,
        _originX: this.data.positionX,
        _originY: this.data.positionY,
        _wasDragging: false,
        dragging: true,
      });
    },

    onTouchMove(e) {
      const t = e.touches[0];
      // 全部用 rpx 计算
      const currentX = t.clientX * PX2RPX;
      const currentY = t.clientY * PX2RPX;
      const dx = currentX - this.data._dragStartX;
      const dy = currentY - this.data._dragStartY;
      // 阈值 8rpx (~4px) 才视为 drag
      if (!this.data._wasDragging && Math.hypot(dx, dy) < 8) return;
      this.setData({ _wasDragging: true });
      const newX = this.data._originX + dx;
      const newY = this.data._originY + dy;
      // 边界限制: X 只能在 [margin, screenWidth - orbSize - margin] (左右两侧, 留边距)
      // Y 在 0 ~ maxY (上面)
      const minX = MARGIN_RPX;
      const maxX = SCREEN_WIDTH_RPX - ORB_SIZE_RPX - MARGIN_RPX;
      const maxY = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 100;  // 100 留给 tabbar
      this.setData({
        positionX: Math.max(minX, Math.min(maxX, newX)),
        positionY: Math.max(0, Math.min(maxY, newY)),
      });
    },

    onTouchEnd() {
      this.setData({ dragging: false });
      if (this.data._wasDragging) {
        // 吸附到最近的边 (X 方向, 留 24rpx 边距)
        const x = this.data.positionX;
        const halfScreen = SCREEN_WIDTH_RPX / 2;
        const snapX = x + ORB_SIZE_RPX / 2 < halfScreen
          ? MARGIN_RPX
          : SCREEN_WIDTH_RPX - ORB_SIZE_RPX - MARGIN_RPX;
        this.setData({ positionX: snapX });
        // 持久化 (rpx)
        wx.setStorageSync(STORAGE_KEY, {
          x: snapX,
          y: this.data.positionY,
        });
        // 屏蔽 tap 50ms
        setTimeout(() => {
          this.setData({ _wasDragging: false });
        }, 50);
      } else {
        // 没拖拽 — 视为 tap (不依赖 bindtap, 直接在 touchend 触发)
        this.onTap();
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
