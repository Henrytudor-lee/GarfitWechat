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
    // i18n 文案表 —— 放在 data 而不是直接用 property:
    // property 不能被 setData 修改, 兜底 setData({ t: ... }) 是无效的
    _t: {},
    display: '00:00',
    seconds: 0,
    // input 绑的字符串字段(见 utils/numberInput.js 的约定:
    // 数值字段用于算术/提交, 字符串字段用于 input.value)
    secondsStr: '0',
    running: false,
    quickSeconds: QUICK_SECONDS,
    _base: 0,        // 已累计毫秒(暂停时结算进来的)
    _startedAt: 0,   // 本次运行起点(ms 时间戳)
    _handle: null,
  },

  observers: {
    // 父组件传了 t → 同步到 _t(供 wxml 用)
    't': function (t) {
      this.setData({ _t: t || {} });
    },
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
        // 父组件没传 t → 从 app.globalData 兜底
        // ⚠️ 必须写进 data 的 _t, 不能 setData 到 property 上(property 不可被 setData 修改)
        try {
          const app = getApp();
          if (app && app.globalData && app.globalData.t) {
            this.setData({ _t: app.globalData.t });
          }
        } catch (e) { /* 忽略 */ }
      } else {
        this.setData({ _t: this.data.t });
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
      // 程序化改动(外部 value / chip / ±) → 数值和输入框字符串一起刷新
      this.setData({
        seconds: clamped,
        secondsStr: String(clamped),
        display: formatDuration(clamped * 1000),
      });
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
      this.setData({ running: false, _base: 0, _startedAt: 0, seconds: 0, secondsStr: '0', display: '00:00' });
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
        // 计时中输入框是 disabled 的, 但仍要同步字符串,
        // 否则输入框会停留在手动输入时的旧值
        this.setData({ seconds: sec, secondsStr: String(sec), display: formatDuration(ms) });
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
     * 输入框绑的是字符串字段 secondsStr, 数值用 parseInt 同步到 seconds:
     *  - 清空输入框 → seconds / display / 父组件 durationSec 一起归零,
     *    不会再出现"输入框是空的, 但大号显示还停在 00:45、父组件还是 45 秒"
     *  - 输入过程中不回写父组件, 光标不会跳位(input.value 绑的是 secondsStr 而不是 seconds)
     */
    onManualInput(e) {
      // 计时中不允许改输入(此时输入框也是 disabled 的)
      if (this.data.running) return;
      const raw = e.detail.value == null ? '' : String(e.detail.value);
      if (raw === '') {
        // 清空输入框 → 秒数归零, 否则输入框空了但计时显示还停在旧值
        this._clearTick();
        this.setData({
          running: false, _base: 0, _startedAt: 0,
          seconds: 0, secondsStr: '', display: '00:00',
        });
        this._emit(0);
        return;
      }
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(0, Math.min(parsed, this.data.max));
      this._clearTick();
      this.setData({
        running: false, _base: 0, _startedAt: 0,
        seconds: clamped,
        // 超出上限时输入框也改写成上限值, 避免输入框与内部状态不一致
        secondsStr: clamped === parsed ? raw : String(clamped),
        display: formatDuration(clamped * 1000),
      });
      this._emit(clamped);
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
