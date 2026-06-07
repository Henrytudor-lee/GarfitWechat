// components/session-orb/index.js
const app = getApp();
const { toKg, setVolume } = require('../../utils/unit.js');

Component({
  properties: {
    // 运行的 session, null 表示没有
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
      this.triggerEvent('tap', { hasSession: this.data.hasSession });
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
