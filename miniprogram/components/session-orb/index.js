// components/session-orb/index.js
const app = getApp();
const { toKg, setVolume } = require('../../utils/unit.js');

const ORB_SIZE = 112;       // rpx
const STORAGE_KEY = 'orb_position';
// 默认位置: 右下角, 偏上 (fab 放在 orb 下面约 120rpx 处)
const sysInfo = wx.getSystemInfoSync();
const DEFAULT_X = sysInfo.windowWidth - ORB_SIZE - 32;
// windowHeight 是 px, 1rpx = (750 / windowWidth) px
// 想要 distance from bottom = 320rpx, 转换为 top = windowHeight - 320 * windowWidth / 750 - ORB_SIZE
const _rpx2px = sysInfo.windowWidth / 750;
const DEFAULT_Y = sysInfo.windowHeight - (320 * _rpx2px) - (ORB_SIZE * _rpx2px);

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
    positionX: 0,
    positionY: 0,
    // drag state
    dragging: false,
    _dragStartX: 0,
    _dragStartY: 0,
    _originX: 0,
    _originY: 0,
  },

  observers: {
    'session': function (session) {
      this._applySession(session);
    },
  },

  lifetimes: {
    attached() {
      // 从 storage 读取位置
      let pos = wx.getStorageSync(STORAGE_KEY);
      if (!pos || typeof pos.x !== 'number') {
        pos = { x: DEFAULT_X, y: DEFAULT_Y };
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
      } else {
        this._stopTick();
        this.setData({ durationDisplay: '00:00' });
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
      // 拖拽时不触发 tap
      if (this.data._wasDragging) return;
      this.triggerEvent('tap', { hasSession: this.data.hasSession });
    },

    onTouchStart(e) {
      const t = e.touches[0];
      this.setData({
        _dragStartX: t.clientX,
        _dragStartY: t.clientY,
        _originX: this.data.positionX,
        _originY: this.data.positionY,
        _wasDragging: false,
        dragging: true,
      });
    },

    onTouchMove(e) {
      const t = e.touches[0];
      const dx = t.clientX - this.data._dragStartX;
      const dy = t.clientY - this.data._dragStartY;
      // 阈值 6rpx (约 3px): 超过才认为是 drag
      if (!this.data._wasDragging && Math.hypot(dx, dy) < 6) return;
      this.setData({ _wasDragging: true });
      const newX = this.data._originX + dx;
      const newY = this.data._originY + dy;
      // 限制在屏幕内
      const maxX = wx.getSystemInfoSync().windowWidth - ORB_SIZE;
      const maxY = wx.getSystemInfoSync().windowHeight - ORB_SIZE - 100;  // 100 留给 tabbar
      this.setData({
        positionX: Math.max(0, Math.min(maxX, newX)),
        positionY: Math.max(0, Math.min(maxY, newY)),
      });
    },

    onTouchEnd() {
      this.setData({ dragging: false });
      if (this.data._wasDragging) {
        // 持久化
        wx.setStorageSync(STORAGE_KEY, {
          x: this.data.positionX,
          y: this.data.positionY,
        });
        // 重置 _wasDragging 标志, 避免 onTap 在下一帧误触
        // (用 setTimeout 延后, 避免 touchend 后立刻 tap)
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
