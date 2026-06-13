// pages/guide/index.js
const app = getApp();

const CARDS = [
  {
    icon: '',
    imageName: '1.png',
    title: 'Start Training',
    desc: 'Tap "Start Training" on the home page to begin a new session.',
    title_zh: '开始训练',
    desc_zh: '在首页点击"开始训练"按钮，即可创建一次新的训练会话。',
  },
  {
    icon: '',
    imageName: '2.png',
    title: 'Add Exercise',
    desc: 'Tap "+ Add Exercise" to browse or search the library and add a movement.',
    title_zh: '新增动作',
    desc_zh: '点击"+ 添加动作"，从动作库中浏览或搜索动作加入训练。',
  },
  {
    icon: '',
    imageName: '3.png',
    title: 'Filter Exercise',
    desc: 'Filter by body part or equipment, or use ♥ favorites / ☑ practiced to find what you need.',
    title_zh: '筛选动作',
    desc_zh: '通过左侧肌群、右侧器材筛选，或用 ♥ 收藏 / ☑ 练习过的动作快速定位。',
  },
  {
    icon: '',
    imageName: '4.png',
    title: 'Enter Data',
    desc: 'Set weight and reps for each exercise, then save to record your set.',
    title_zh: '录入动作数据',
    desc_zh: '为每个动作设置重量和次数，点击保存即可记入本次训练。',
  },
  {
    icon: '',
    imageName: '5.png',
    title: 'Edit Exercise',
    desc: 'Tap or long-press a card to edit weight, reps, or delete the set.',
    title_zh: '编辑动作',
    desc_zh: '点击或长按动作卡片，可调整重量、次数或删除该组。',
  },
];

Page({
  data: {
    currentStep: 0,
    theme: 'night',
    imgPrefix: '',
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
    const imgPrefix = app.globalData.imagePrefix || '';

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
      imageName: c.imageName,
      title: locale === 'en' ? c.title : c.title_zh,
      desc: locale === 'en' ? c.desc : c.desc_zh,
    }));

    this.setData({
      theme,
      imgPrefix,
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
