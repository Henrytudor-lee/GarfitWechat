// components/set-timer/index.js
/**
 * 单组计时器 —— 用于 duration 类动作(平板支撑 / 波比跳 / 开合跳 …)
 *
 * 设计要点:
 *  1. 用 Date.now() 时间基准, 不累加 counter
 *     → 小程序切后台再回来, 计时不会漂移/丢秒(项目里踩过切后台的坑)
 *  2. 暂停时把已跑时长累加到 _base, 继续时重设 _startedAt
 *     → 暂停/继续的累计值精确, 不会累积误差
 *  3. 组件卸载 / 页面隐藏时清掉 interval, 不留后台空转
 *  4. 既能当纯计时器用, 也能当纯输入框用(快速 chips + 手动输入)
 */

// 快速时长 (秒) —— 覆盖常见组息 / 平板支撑时长
const QUICK_SECONDS = [30, 45, 60, 90, 120];

Component({
  properties: {
    // 当前秒数(受控)。父组件改它会同步到显示
    value: {
      type: Number,
      value: 0,
    },
    // 上限(秒), 默认 1 小时
    max: {
      type: Number,
      value: 3600,
    },
    // 组件挂载后是否自动开始
    autoStart: {
      type: Boolean,
      value: false,
    },
    // 显示手动输入框
    allowManual: {
      type: Boolean,
      value: true,
    },
    // i18n 文案表(父组件传入, 组件本身不依赖 app.js)
    t: {
      type: Object,
      value: null,
    },
  },

  data: {
    display: '00:00',
    seconds: 0,
    running: false,
    quickSeconds: QUICK_SECONDS,
    _base: 0,        // 已累计毫秒(暂停时结算进来的)
    _startedAt: 0,   // 本次运行起点(ms 时间戳)
    _handle: null,
  },

  observers: {
    // 父组件改了 value → 同步内部状态(用户手动输入 / 编辑已有 set 时)
    'value': function (v) {
      const sec = Number(v) || 0;
      // 正在跑的时候不要被外部值覆盖, 否则会打断计时
      if (this.data.running) return;
      if (sec === this.data.seconds) return;
      this._applySeconds(sec);
    },
  },

  lifetimes: {
    attached() {
      // 文案兜底: 父组件没传 t 时从 app.globalData 取,
      // 否则 t.TIMER_START 这类表达式取不到值, 按钮会显示空白
      if (!this.data.t) {
        try {
          const app = getApp();
          if (app && app.globalData && app.globalData.t) {
            this.setData({ t: app.globalData.t });
          }
        } catch (e) { /* 忽略 */ }
      }
      this._applySeconds(Number(this.data.value) || 0);
      if (this.data.autoStart) {
        this._start();
      }
    },
    detached() {
      this._clearTick();
    },
  },

  pageLifetimes: {
    hide() {
      // 页面隐藏: 暂停并结算, 回来时不会凭空多出时间
      if (this.data.running) {
        this._pause();
      }
    },
  },

  methods: {
    // ---------- 内部 ----------

    _applySeconds(sec) {
      const clamped = Math.max(0, Math.min(Math.round(sec), this.data.max));
      this.setData({ seconds: clamped, display: formatDuration(clamped * 1000) });
      this._emit(clamped);
    },

    _elapsedMs() {
      const { _base, _startedAt, running } = this.data;
      return _base + (running ? Date.now() - _startedAt : 0);
    },

    _start() {
      if (this.data.running) return;
      this.setData({ _startedAt: Date.now(), running: true });
      this._clearTick();
      const handle = setInterval(() => this._tick(), 250);
      this.setData({ _handle: handle });
      this._tick();
    },

    _pause() {
      if (!this.data.running) return;
      const base = this.data._base + (Date.now() - this.data._startedAt);
      this._clearTick();
      this.setData({ running: false, _base: base, _startedAt: 0 });
      this._tick();
    },

    _reset() {
      this._clearTick();
      this.setData({ running: false, _base: 0, _startedAt: 0, seconds: 0, display: '00:00' });
      this._emit(0);
    },

    _clearTick() {
      const h = this.data._handle;
      if (h) {
        clearInterval(h);
        this.setData({ _handle: null });
      }
    },

    _tick() {
      const ms = this._elapsedMs();
      const sec = Math.floor(ms / 1000);
      if (sec >= this.data.max) {
        // 到上限自动停
        this._pause();
        this._applySeconds(this.data.max);
        this.triggerEvent('finish', { seconds: this.data.max });
        return;
      }
      if (sec !== this.data.seconds) {
        this.setData({ seconds: sec, display: formatDuration(ms) });
        this._emit(sec);
      }
    },

    _emit(sec) {
      this.triggerEvent('change', { seconds: sec });
    },

    // ---------- 交互 ----------

    onToggle() {
      if (this.data.running) {
        this._pause();
      } else {
        this._start();
      }
    },

    onReset() {
      this._reset();
    },

    onQuickTap(e) {
      const sec = Number(e.currentTarget.dataset.val) || 0;
      // 点 chips = 直接设定一个时长, 不启动计时
      this._clearTick();
      this.setData({ running: false, _base: 0, _startedAt: 0 });
      this._applySeconds(sec);
    },

    /**
     * 手动输入秒数
     *
     * 输入框是受控的: 输入 → setData(seconds) → emit change →
     * 父组件 setData(durationSec) → 传回 value → observers 收到
     * (值相同就直接 return, 不会打断)
     */
    onManualInput(e) {
      const raw = e.detail.value;
      // 输入框还没输入完时 value 是 '' —— 这时候不要把 0 回写给父组件,
      // 否则用户打 "45" 的过程中父组件会被 0 覆盖, 光标跳位。
      if (raw === '' || raw === null || raw === undefined) return;
      const sec = Number(raw);
      if (!Number.isFinite(sec)) return;
      this._clearTick();
      this.setData({ running: false, _base: 0, _startedAt: 0 });
      this._applySeconds(sec);
    },

    onInc() {
      this._applySeconds(this.data.seconds + 5);
    },

    onDec() {
      this._applySeconds(this.data.seconds - 5);
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
