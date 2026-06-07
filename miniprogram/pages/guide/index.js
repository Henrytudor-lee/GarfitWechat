// pages/guide/index.js
const app = getApp();

const CARDS = [
  {
    icon: '▶',
    title: 'Start Your\nFirst Workout',
    desc: 'Tap the green orb or + button at bottom-right to begin. Pick exercises from the library and set your weight & reps.',
    title_zh: '开始你的\n第一次训练',
    desc_zh: '点击右下角的绿色圆球或 + 号开始。从动作库选择动作，设置重量和次数。',
  },
  {
    icon: '🏋️',
    title: 'Exercise\nLibrary',
    desc: 'Browse 7000+ exercises. Filter by muscle group or equipment. Search by name and watch demo videos.',
    title_zh: '动作库',
    desc_zh: '浏览 7000+ 专业动作。按肌群或器材筛选，搜索动作名称，查看演示视频。',
  },
  {
    icon: '📊',
    title: 'Track Your\nProgress',
    desc: 'View weekly volume, muscle distribution heatmap, weight progression charts, and your training streak.',
    title_zh: '追踪你的\n训练数据',
    desc_zh: '查看每周训练量、肌群分布热力图、重量进步曲线和连续训练天数。',
  },
  {
    icon: '🚀',
    title: "You're All\nSet!",
    desc: 'Switch themes, change language, and check your AI Coach insights. Let\'s get fit! 💪',
    title_zh: '准备就绪！',
    desc_zh: '切换主题、修改语言、查看 AI 教练建议。一起变强吧！💪',
  },
];

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
    wx.setStorageSync('guide_done', true);
    app.globalData.showingGuide = false;
    // 切换到 training 页 (tab)
    wx.switchTab({ url: '/pages/index/index' });
  },
});
