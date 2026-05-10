// pages/workout/index.js
const app = getApp();

Page({
  data: {
    session: null,
    isFinished: false,
    elapsedTime: '00:00',
    exerciseList: [],
    timer: null,
    showAddSetModal: false,
    selectedExercise: null,
    selectedIndex: -1,
    inputWeight: '',
    inputReps: '',
    weightUnit: 'kg',
  },

  onLoad() {
    this._checkSession();
  },

  onShow() {
    // 从动作库选完动作返回时，带回了 chosenExercise
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current.data.chosenExercise) {
      this.addExercise(current.data.chosenExercise);
      current.data.chosenExercise = null;
    }
    if (this.data.session && !this.data.isFinished) {
      this._loadExercises();
      this._startTimer();
    }
  },

  onUnload() {
    if (this.data.timer) clearInterval(this.data.timer);
  },

  async _checkSession() {
    wx.showLoading({ title: '加载中...' });
    const res = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'getRunning', openid: app.globalData.openid },
    });
    wx.hideLoading();

    if (res.result && res.result.session) {
      this.setData({
        session: res.result.session,
        isFinished: false,
      });
      this._loadExercises();
      this._startTimer();
    } else {
      this.setData({ session: null, isFinished: true });
    }
  },

  _startTimer() {
    if (this.data.timer) clearInterval(this.data.timer);
    const update = () => {
      const session = this.data.session;
      if (!session) return;
      const start = new Date(session.start_time);
      const now = new Date();
      const diff = Math.floor((now - start) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const t = h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      this.setData({ elapsedTime: t });
    };
    update();
    const timer = setInterval(update, 1000);
    this.setData({ timer });
  },

  async _loadExercises() {
    if (!this.data.session) return;
    const res = await wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'list',
        session_id: this.data.session._id,
        openid: app.globalData.openid,
      },
    });
    if (res.result && res.result.success) {
      // 按 exercise_id 分组合并
      const map = {};
      for (const ex of res.result.exercises) {
        if (!map[ex.exercise_id]) {
          map[ex.exercise_id] = {
            ...ex,
            _id: ex._id,
            name: ex.name,
            name_zh: ex.name_zh || ex.name,
            exercise_id: ex.exercise_id,
            sets: [],
          };
        }
        if (ex.weight > 0 || ex.reps > 0) {
          map[ex.exercise_id].sets.push({
            weight: ex.weight,
            unit: ex.weight_unit,
            reps: ex.reps,
          });
        }
      }
      const list = Object.values(map);
      this.setData({ exerciseList: list });
    }
  },

  async startWorkout() {
    wx.showLoading({ title: '创建训练...' });
    const res = await wx.cloud.callFunction({
      name: 'session',
      data: { action: 'create', openid: app.globalData.openid },
    });
    wx.hideLoading();

    if (res.result && res.result.success) {
      const session = res.result.session || { _id: res.result.sessionId };
      this.setData({ session, isFinished: false, exerciseList: [] });
      this._startTimer();
      wx.showToast({ title: res.result.resumed ? '继续训练' : '开始训练', icon: 'none' });
    } else {
      wx.showToast({ title: (res.result && res.result.error) || '创建失败', icon: 'none' });
    }
  },

  goToLibrary() {
    // 跳到动作库，用户选完动作通过 onShow 带回
    wx.navigateTo({ url: '/pages/library/index?mode=pick' });
  },

  addExercise(exercise) {
    if (!exercise || !exercise._id) return;
    // 已有则跳过
    const exists = this.data.exerciseList.some(e => e.exercise_id === exercise._id);
    if (exists) {
      wx.showToast({ title: '该动作已添加', icon: 'none' });
      return;
    }
    const newItem = {
      _id: exercise._id + '_' + Date.now(),
      exercise_id: exercise._id,
      name: exercise.name,
      name_zh: exercise.name_zh || exercise.name,
      sets: [],
    };
    this.setData({ exerciseList: [...this.data.exerciseList, newItem] });
  },

  openAddSet(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.exerciseList[index];
    this.setData({
      showAddSetModal: true,
      selectedExercise: item,
      selectedIndex: index,
      inputWeight: '',
      inputReps: '',
      weightUnit: 'kg',
    });
  },

  closeAddSetModal() {
    this.setData({ showAddSetModal: false });
  },

  onWeightInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },

  onRepsInput(e) {
    this.setData({ inputReps: e.detail.value });
  },

  async confirmAddSet() {
    const { selectedExercise, inputWeight, inputReps, selectedIndex } = this.data;
    if (!inputWeight && !inputReps) {
      wx.showToast({ title: '请输入重量或次数', icon: 'none' });
      return;
    }

    // 写入数据库
    const res = await wx.cloud.callFunction({
      name: 'exercise',
      data: {
        action: 'add',
        session_id: this.data.session._id,
        openid: app.globalData.openid,
        exercise_id: selectedExercise.exercise_id,
        name: selectedExercise.name,
        weight: inputWeight || 0,
        weight_unit: this.data.weightUnit,
        reps: parseInt(inputReps) || 0,
      },
    });

    if (res.result && res.result.success) {
      const newSet = {
        weight: parseFloat(inputWeight) || 0,
        unit: this.data.weightUnit,
        reps: parseInt(inputReps) || 0,
      };
      const list = [...this.data.exerciseList];
      list[selectedIndex].sets = [...(list[selectedIndex].sets || []), newSet];
      this.setData({ exerciseList: list, showAddSetModal: false });
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async finishWorkout() {
    wx.showModal({
      title: '确认结束',
      content: '确定要结束本次训练吗？',
      confirmColor: '#E94560',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '结束训练...' });
          const r = await wx.cloud.callFunction({
            name: 'session',
            data: { action: 'finish', session_id: this.data.session._id, openid: app.globalData.openid },
          });
          wx.hideLoading();
          if (r.result && r.result.success) {
            if (this.data.timer) clearInterval(this.data.timer);
            this.setData({ isFinished: true, session: null });
            wx.showToast({ title: '训练完成！', icon: 'success' });
          }
        }
      },
    });
  },
});
