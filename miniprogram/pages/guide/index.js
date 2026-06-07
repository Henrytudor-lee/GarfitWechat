// pages/guide/index.js
const app = getApp();

const CARDS = [
  {
    icon: '',
    gifName: 'step_1.gif',
    title: '开始你的\n第一次训练',
    desc: '从首页开始训练 → 新增动作 → 编辑重量和次数 → 结束训练',
    title_zh: '开始你的\n第一次训练',
    desc_zh: '从首页开始训练 → 新增动作 → 编辑重量和次数 → 结束训练',
  },
  {
    icon: '📊',
    gifName: 'step_2.gif',
    title: '查看训练数据',
    desc: '在统计页面查看每周训练量、肌群分布、重量进步曲线。',
    title_zh: '查看训练数据',
    desc_zh: '在统计页面查看每周训练量、肌群分布、重量进步曲线。',
  },
];

// 用云存储路径: images/guide/xxx.gif
function getGifUrl(name) {
  if (!name) return '';
  const base = 'cloud://cloudbase-d9gwy4qvodf85fe69.636c-cloudbase-d9gwy4qvodf85fe69-1427916036';
  return base + '/images/guide/' + name;
}

Page({
  data: {
    currentStep: 0,
    theme: 'night',
    cards: [],
    skipText: '跳过',
    backText: '← 返回',
    nextText: '下一步 →',
    doneText: '去训练 →',
    // swipe state
    _startX: 0,
    _startY: 0,
    _moved: false,
  },

  onLoad() {
    const locale = app.globalData.language || 'zh';
    const theme = app.globalData.theme || 'night';

    // 根据语言选择文案
    const langText = locale === 'en' ? {
      skipText: 'Skip',
      backText: '← Back',
      nextText: 'Next →',
      doneText: 'Start Training →',
    } : {
      skipText: '跳过',
      backText: '← 返回',
      nextText: '下一步 →',
      doneText: '去训练 →',
    };

    // 本地化卡片内容
    const cards = CARDS.map(c => ({
      icon: c.icon,
      gifSrc: getGifUrl(c.gifName),
      title: locale === 'en' ? c.title : c.title_zh,
      desc: locale === 'en' ? c.desc : c.desc_zh,
    }));

    this.setData({
      theme,
      cards,
      ...langText,
    });
  },

  onTouchStart(e) {
    const t = e.touches[0];
    this.setData({
      _startX: t.clientX,
      _startY: t.clientY,
      _moved: false,
    });
  },

  onTouchMove(e) {
    const t = e.touches[0];
    const dx = t.clientX - this.data._startX;
    const dy = t.clientY - this.data._startY;
    if (!this.data._moved && Math.hypot(dx, dy) < 10) return;
    this.setData({ _moved: true });
  },

  onTouchEnd(e) {
    if (!this.data._moved) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.data._startX;
    const dy = t.clientY - this.data._startY;
    // 水平滑动 > 垂直滑动 才切换
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && this.data.currentStep < this.data.cards.length - 1) {
        this.nextStep();
      } else if (dx > 0 && this.data.currentStep > 0) {
        this.prevStep();
      }
    }
  },

  onNext() {
    if (this.data.currentStep < this.data.cards.length - 1) {
      this.nextStep();
    } else {
      this.goToTraining();
    }
  },

  onPrev() {
    this.prevStep();
  },

  onSkip() {
    this.goToTraining();
  },

  nextStep() {
    const step = this.data.currentStep + 1;
    this.setData({ currentStep: step });
  },

  prevStep() {
    const step = this.data.currentStep - 1;
    this.setData({ currentStep: step });
  },

  goToTraining() {
    // 标记引导完成
    app.globalData.showingGuide = false;
    // 切换到 training 页 (tab)
    wx.switchTab({ url: '/pages/index/index' });
  },
});
