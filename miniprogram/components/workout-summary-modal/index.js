// components/workout-summary-modal/index.js
const app = getApp();

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    session: {
      type: Object,
      value: null,
    },
    sessionId: {
      type: String,
      value: null,
    },
    locale: {
      type: String,
      value: 'en',
    },
  },

  data: {
    imgPrefix: '',
    exerciseList: [],
    _locale: 'en',
    _stats: {
      exerciseCount: 0,
      durationStr: '0 min',
      totalVolume: 0,
    },
  },

  observers: {
    'isOpen': function(isOpen) {
      if (isOpen) {
        const locale = app.globalData.language || 'en';
        const theme = app.globalData.theme || 'night';
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          _locale: locale,
          _theme: theme,
        });
      }
    },
    'isOpen, session': function(isOpen, session) {
      if (isOpen && session) {
        this._computeStats(session);
      }
    },
  },

  lifetimes: {
    attached() {
      // Enable share
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  pageLifetimes: {
    show() {
      wx.showShareMenu({ withShareTicket: true });
    },
  },

  methods: {
    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    closeModal() {
      this.triggerEvent('close');
    },

    _computeStats(session) {
      const exerciseList = session.exercises || [];
      const durationMs = session.duration || 0;
      const totalMinutes = Math.round(durationMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const locale = app.globalData.language || 'en';
      const durationStr = hours > 0
        ? (locale === 'zh' ? `${hours}小时${mins}分钟` : `${hours}h ${mins}m`)
        : (locale === 'zh' ? `${mins}分钟` : `${mins} min`);

      let totalVolume = 0;
      for (const ex of exerciseList) {
        if (ex.sets) {
          for (const s of ex.sets) {
            totalVolume += (s.weight || 0) * (s.reps || 0);
          }
        }
      }

      this.setData({
        exerciseList,
        _stats: {
          exerciseCount: exerciseList.length,
          durationStr,
          totalVolume: Math.round(totalVolume),
        },
      });
    },

    getGroupVolume(item) {
      if (!item || !item.sets) return 0;
      let vol = 0;
      for (const s of item.sets) {
        vol += (s.weight || 0) * (s.reps || 0);
      }
      return Math.round(vol);
    },

    getDateStr() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    },
    async downloadStats() {
      const {_stats} = this.data;
      const locale = app.globalData.language || 'en';

      const W = 600;
      const H = 800;

      this.setData({ canvasW: W, canvasH: H });

      const canvas = wx.createCanvasContext('stats-canvas', this);

      const drawText = (text, x, y, opts = {}) => {
        if (opts.font) canvas.font = opts.font;
        if (opts.fillStyle) canvas.setFillStyle(opts.fillStyle);
        if (opts.textAlign) canvas.setTextAlign(opts.textAlign);
        canvas.fillText(text, x, y);
      };

      // Background
      canvas.setFillStyle('#1a1a2e');
      canvas.fillRect(0, 0, W, H);

      // Title
      canvas.font = 'bold 36px sans-serif';
      canvas.setFillStyle('#ccf200');
      canvas.setTextAlign('center');
      canvas.fillText('GFIT', W / 2, 60);

      canvas.font = 'bold 28px sans-serif';
      canvas.setFillStyle('rgba(255,255,255,0.7)');
      canvas.fillText(locale === 'zh' ? '训练完成' : 'WORKOUT COMPLETE', W / 2, 110);

      // Stats
      const statsY = 180;
      const statW = W / 3;
      canvas.font = 'bold 40px sans-serif';
      canvas.setFillStyle('#fff');
      canvas.fillText(String(_stats.exerciseCount), statW, statsY);
      canvas.fillText(_stats.durationStr, statW * 2, statsY);
      canvas.fillText(`${_stats.totalVolume} kg`, statW * 3, statsY);

      canvas.font = '22px sans-serif';
      canvas.setFillStyle('rgba(255,255,255,0.4)');
      canvas.fillText(locale === 'zh' ? '动作数' : 'EXERCISES', statW, statsY + 30);
      canvas.fillText(locale === 'zh' ? '时长' : 'DURATION', statW * 2, statsY + 30);
      canvas.fillText(locale === 'zh' ? '总量' : 'VOLUME', statW * 3, statsY + 30);

      // Divider
      canvas.setStrokeStyle('rgba(255,255,255,0.1)');
      canvas.beginPath();
      canvas.moveTo(40, 240);
      canvas.lineTo(W - 40, 240);
      canvas.stroke();

      // Exercise breakdown
      let y = 280;
      canvas.font = 'bold 20px sans-serif';
      canvas.setFillStyle('rgba(255,255,255,0.3)');
      canvas.setTextAlign('left');
      canvas.fillText(locale === 'zh' ? '动作明细' : 'EXERCISE SUMMARY', 40, y);
      y += 30;

      for (const item of this.data.exerciseList) {
        if (y > H - 100) break;
        const name = locale === 'zh' ? (item.name_zh || item.name) : (item.name || item.name_zh);
        canvas.font = 'bold 26px sans-serif';
        canvas.setFillStyle('#fff');
        canvas.fillText(name, 40, y);
        canvas.font = '24px sans-serif';
        canvas.setFillStyle('#ccf200');
        canvas.setTextAlign('right');
        canvas.fillText(`${this.getGroupVolume(item)} kg`, W - 40, y);
        canvas.setTextAlign('left');
        y += 35;

        for (let i = 0; i < item.sets.length && i < 4; i++) {
          const s = item.sets[i];
          canvas.font = '20px sans-serif';
          canvas.setFillStyle('rgba(255,255,255,0.5)');
          canvas.fillText(`${i + 1}. ${s.weight || 0} ${s.weight_unit || 'kg'} × ${s.reps || 0} reps`, 50, y);
          y += 28;
        }
        y += 10;
      }

      // Date footer
      canvas.font = '20px sans-serif';
      canvas.setFillStyle('rgba(255,255,255,0.25)');
      canvas.setTextAlign('center');
      canvas.fillText(this.getDateStr(), W / 2, H - 40);

      canvas.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'stats-canvas',
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({ title: locale === 'zh' ? '已保存到相册' : 'Saved!', icon: 'success' });
              },
              fail: () => {
                wx.showToast({ title: locale === 'zh' ? '保存失败' : 'Save failed', icon: 'none' });
              },
            });
          },
          fail: () => {
            wx.showToast({ title: locale === 'zh' ? '生成图片失败' : 'Failed', icon: 'none' });
          },
        });
      });
    },

    onShareAppMessage() {
      const {_stats} = this.data;
      return {
        title: app.globalData.language === 'zh'
          ? `刚完成了 ${_stats.exerciseCount} 个动作，训练 ${_stats.durationStr}，总量 ${_stats.totalVolume} kg 💪`
          : `Just finished ${_stats.exerciseCount} exercises, ${_stats.durationStr} workout, ${_stats.totalVolume} kg 💪`,
        path: '/pages/index/index',
      };
    },
  },
});
