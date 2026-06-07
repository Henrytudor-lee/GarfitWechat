// components/session-orb/index.js
const app = getApp();

const STORAGE_KEY = 'orb_position';
const ORB_SIZE_RPX = 112;
const MARGIN_RPX = 16;  // 靠右 (小边距)

// 屏宽高 (rpx)
const sysInfo = wx.getSystemInfoSync();
const SCREEN_WIDTH_RPX = 750;  // 设计稿基准
const SCREEN_HEIGHT_RPX = sysInfo.windowHeight * (750 / sysInfo.windowWidth);

// 默认位置
const DEFAULT_X = SCREEN_WIDTH_RPX - ORB_SIZE_RPX - MARGIN_RPX;

// idle：右下角 (tabbar 上方, 留足间距)
const IDLE_Y = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 220;
// active：fab 上方 (fab bottom=200rpx, fab 高=112, 间距 40rpx => orb bottom=200+112+40=352)
const ACTIVE_Y = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 352;

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
  },

  data: {
    durationDisplay: '00:00',
    hasSession: false,
    _tickHandle: null,
    positionX: DEFAULT_X,
    positionY: IDLE_Y,
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
      // 从 storage 读取位置 (单位 rpx)
      let pos = wx.getStorageSync(STORAGE_KEY);
      if (!pos || typeof pos.x !== 'number') {
        pos = { x: DEFAULT_X, y: IDLE_Y };
      }
      this.setData({ positionX: pos.x, positionY: pos.y });
      this._applySession(this.data.session);
    },
    detached() {
      this._stopTick();
    },
  },

  methods: {
    _applySession(session) {
      const hasSession = !!(session && session.start_time);
      this.setData({ hasSession });
      if (hasSession) {
        this._tick();
        this._startTick();
        // active → 移到 fab 上方
        this.setData({ positionX: DEFAULT_X, positionY: ACTIVE_Y });
      } else {
        this._stopTick();
        this.setData({ durationDisplay: '00:00' });
        // idle → 回到右下角
        this.setData({ positionX: DEFAULT_X, positionY: IDLE_Y });
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
      // 边界限制 (rpx)
      const maxX = SCREEN_WIDTH_RPX - ORB_SIZE_RPX;
      const maxY = SCREEN_HEIGHT_RPX - ORB_SIZE_RPX - 100;  // 100 留给 tabbar
      this.setData({
        positionX: Math.max(0, Math.min(maxX, newX)),
        positionY: Math.max(0, Math.min(maxY, newY)),
      });
    },

    onTouchEnd() {
      this.setData({ dragging: false });
      if (this.data._wasDragging) {
        // 持久化 (rpx)
        wx.setStorageSync(STORAGE_KEY, {
          x: this.data.positionX,
          y: this.data.positionY,
        });
        // 屏蔽 tap 50ms
        setTimeout(() => {
          this.setData({ _wasDragging: false });
        }, 50);
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
