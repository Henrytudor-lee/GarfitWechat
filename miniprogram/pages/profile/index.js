// pages/profile/index.js — garcia-fitness-new style
const { normalizeAvatar } = require('../../utils/avatar.js');
const { compressToLimit } = require('../../utils/image.js');
const app = getApp();
const api = require('../../utils/api.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');

// Fire color tiers: 0=gray, 1-7=orange, 8-30=yellow, 31-60=lime, 61-120=green, 121-360=teal, 361+=blue
function getFlameColor(streak) {
  if (streak === 0) return 'color-neutral-600';
  if (streak <= 7) return 'color-orange';
  if (streak <= 30) return 'color-yellow';
  if (streak <= 60) return 'color-lime';
  if (streak <= 120) return 'color-green';
  if (streak <= 360) return 'color-teal';
  return 'color-blue';
}

// Trophy color by level: ROOKIE=gray, BEGINNER=orange, INTERMEDIATE=yellow, ADVANCED=lime, EXPERT=green, ELITE=blue
function getTrophyColor(lv) {
  if (lv <= 1) return 'color-neutral-600';
  if (lv === 2) return 'color-orange';
  if (lv === 3) return 'color-yellow';
  if (lv === 4) return 'color-lime';
  if (lv === 5) return 'color-green';
  return 'color-blue';
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    streak: 0,
    levelInfo: { label: 'ROOKIE', lv: 1, score: 0 },
    locale: 'en',
    theme: 'dark',
    flameColor: 'color-neutral-600',
    trophyColor: 'color-neutral-600',
    version: 'V1.0.2 - STABLE',
    orbSession: null,
    showEditNameModal: false,
    editNameValue: '',
    showEditBodyModal: false,
    editHeight: 170,
    editHeightStr: '170',
    editWeight: 60,
    editWeightStr: '60',
    // 资料(身高/体重)是否已从服务端加载完成: 未完成前不允许保存, 否则会拿默认值覆盖真实数据
    profileLoaded: false,
  },

  onLoad() {
    const locale = wx.getStorageSync('language') || 'zh';
    const theme = wx.getStorageSync('theme') || 'night';
    this.setData({
      imgPrefix: app.globalData.imagePrefix,
      locale,
      theme,
      t: app.globalData.t,  // 注入 i18n 字典
    });
  },

  async onShow() {
    // ⚠️ 原来直接 await this.loadData(): 任一接口失败会抛错中断整条链,
    //    后面的 loadRunningSession + setData({orbSession}) 不执行 → orb 停在旧状态,
    //    同时产生未捕获的 Promise rejection。
    try {
      await this.loadData();
    } catch (err) {
      console.error('[profile] loadData failed:', err);
    }
    // Refresh session orb (无论 loadData 成功与否都要刷新)
    const orbSession = await app.loadRunningSession();
    this.setData({ orbSession });
  },

  async loadData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ isLoggedIn: false });
      return;
    }

    const locale = wx.getStorageSync('language') || 'zh';
    const theme = wx.getStorageSync('theme') || 'night';

    const userInfo = {
      nickname: wx.getStorageSync('userName') || '',
      avatarUrl: wx.getStorageSync('avatarUrl') || '',
    };

    this.setData({ isLoggedIn: true, locale, theme, userInfo });

    // allSettled 而不是 all: 三个接口互不依赖, 任意一个失败不应该让另外两个的结果也丢掉
    const settled = await Promise.allSettled([
      api.callCloud('profile.get'),
      api.callCloud('profile.getStreak'),
      api.callCloud('profile.getLevel'),
    ]);
    const [profileRes, streakRes, levelRes] = settled.map((r) => (
      r.status === 'fulfilled' ? r.value : null
    ));

    const profileData = profileRes && profileRes.result && profileRes.result.profile;
    if (profileData) {
      wx.setStorageSync('userName', profileData.name);
      wx.setStorageSync('avatarUrl', normalizeAvatar(profileData.avatar, app.globalData.imagePrefix));
      app.globalData.userInfo = { nickname: profileData.name, avatarUrl: normalizeAvatar(profileData.avatar, app.globalData.imagePrefix) };
      const height = profileData.height || 170;
      const weight = profileData.weight || 60;
      app.globalData.userWeight = weight;
      app.globalData.userHeight = height;
      wx.setStorageSync('userWeight', weight);
      wx.setStorageSync('userHeight', height);
      this.setData({
        userInfo: { nickname: profileData.name, avatarUrl: normalizeAvatar(profileData.avatar, app.globalData.imagePrefix) },
        editHeight: height,
        editWeight: weight,
        bodyHeight: height,
        bodyWeight: weight,
        // 资料加载完成: 之前不允许打开身高/体重弹层 (见 onPersonalInfoTap)
        profileLoaded: true,
      });
    }

    const streak = (streakRes && streakRes.result && streakRes.result.streak) || 0;
    const levelData = (levelRes && levelRes.result && levelRes.result.data) || { label: 'ROOKIE', lv: 1, score: 0 };

    this.setData({
      streak,
      levelInfo: levelData,
      flameColor: getFlameColor(streak),
      trophyColor: getTrophyColor(levelData.lv),
    });
  },

  // Handle logout — clear storage and trigger silent re-login
  handleLogout() {
    wx.showModal({
      title: 'LOG OUT',
      content: 'Are you sure you want to sign out?',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          // ⚠️ 原来用 wx.clearStorageSync() —— 会把 language / theme 一并清掉,
          //    用户只点了"退出登录", 语言和主题就被静默重置回默认。
          //    改成白名单清除, 只清账号相关的。
          ['userId', 'openid', 'token', 'userName', 'avatarUrl', 'avatarTemp'].forEach((k) => {
            try { wx.removeStorageSync(k); } catch (e) { /* ignore */ }
          });
          app.globalData.userId = null;
          app.globalData.openid = null;
          app.doSilentLogin();
        }
      },
    });
  },

  /**
   * "登录/注册"按钮 —— 原来 wxml 绑的是 goToLogin, 但这个方法**根本没定义**,
   * 点按钮会抛 "goToLogin is not a function", 未登录用户的第一入口完全失效。
   * 本 app 是静默登录模式, 所以"登录"就是触发一次静默登录再刷新数据。
   */
  goToLogin() {
    wx.showLoading({ title: 'LOADING...', mask: true });
    app.doSilentLogin()
      .then(() => this.loadData())
      .catch((err) => {
        console.error('[profile] goToLogin failed:', err);
        wx.showToast({ title: (this.data.t || {}).LOGIN_FAILED || '登录失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },
  async changeAvatar() {
    wx.chooseImage({
      count: 1,
      sourceType: ['album'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        // 快照旧头像: 上传失败时要能把 UI 和 storage 一起还原
        const prevAvatar = this.data.userInfo.avatarUrl || wx.getStorageSync('avatarUrl') || '';
        // Save to local storage immediately for display
        wx.setStorageSync('avatarTemp', tempFilePath);
        this.setData({
          'userInfo.avatarUrl': tempFilePath,
        });
        // Sync to cloud
        const userId = wx.getStorageSync('userId');
        if (userId) {
          // 自动压缩到 1MB 以内, 避免后端 Multer 413
          let uploadPath = tempFilePath;
          try {
            uploadPath = await compressToLimit(tempFilePath);
          } catch (e) {
            console.warn('[profile] compress failed, use original', e);
          }
          wx.uploadFile({
            url: `${api.BASE_URL}/upload`,
            filePath: uploadPath,
            name: 'file',
            header: { Authorization: `Bearer ${api.getToken()}` },
            formData: { prefix: 'avatars' },
            success: (uploadRes) => {
              // wx.uploadFile 的 success 对 5xx 也会触发, 必须自己检查 statusCode
              // 任何 4xx/5xx 都算失败 (NestJS @Post 默认 201, 不是 200)
              if (uploadRes.statusCode >= 400) {
                // 状态码只进 console, 不给普通用户看
                this._avatarUploadFailed(prevAvatar, uploadRes);
                return;
              }
              let avatarUrl = '';
              try {
                const data = JSON.parse(uploadRes.data);
                if (!data.success || !data.url) {
                  this._avatarUploadFailed(prevAvatar, data);
                  return;
                }
                avatarUrl = data.url;
              } catch (e) {
                this._avatarUploadFailed(prevAvatar, { parseError: e, data: uploadRes.data });
                return;
              }
              api.callCloud('profile.updateAvatar', { avatarUrl });
              wx.setStorageSync('avatarUrl', avatarUrl);
              // 立刻刷新 UI 显示新头像 (不依赖下次 onShow 重载)
              this.setData({ 'userInfo.avatarUrl': avatarUrl });
              wx.removeStorageSync('avatarTemp'); // tempFilePath 微信会清理, 别再用了
              // 成功提示放在这里, 而不是 chooseImage 的 success 里 ——
              // 原来写在回调外, chooseImage 一返回就弹"上传成功", 上传还没开始;
              // 上传失败时用户会先看到成功、再看到 failed.
              wx.showToast({ title: 'AVATAR UPDATED', icon: 'success' });
            },
            fail: (err) => {
              this._avatarUploadFailed(prevAvatar, err);
            },
          });
        } else {
          // 没有 userId (登录未完成) → 根本不会发起上传, 不能报成功
          this._avatarUploadFailed(prevAvatar, 'no userId');
        }
      },
    });
  },

  /**
   * 头像上传失败统一处理:
   *   1. 回滚 UI 到旧头像 (原来只写临时路径, 失败后一直显示临时图)
   *   2. 清掉 avatarTemp (原来只有成功分支才删, 失败后残留)
   *   3. toast 只给文案, HTTP 状态码只进 console
   */
  _avatarUploadFailed(prevAvatar, detail) {
    console.error('[profile] avatar upload failed:', detail);
    this.setData({ 'userInfo.avatarUrl': prevAvatar });
    try {
      wx.removeStorageSync('avatarTemp');
    } catch (e) { /* ignore */ }
    wx.showToast({ title: '上传失败', icon: 'none' });
  },

  async onOrbTap() {
    // 无 session: 先创建一个, 再跳到 training 页
    if (!this.data.orbSession) {
      const session = await app.ensureRunningSession();
      if (!session) return;
      this.setData({ orbSession: session });  // orb 立即变 active
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  // Edit nickname
  onEditName() {
    this.setData({
      showEditNameModal: true,
      editNameValue: this.data.userInfo.nickname || '',
    });
  },

  onEditNameInput(e) {
    this.setData({ editNameValue: e.detail.value });
  },

  onNameMaskTap(e) {
    if (e.target !== e.currentTarget) return;
    this.setData({ showEditNameModal: false, editNameValue: '' });
  },

  cancelEditName() {
    this.setData({ showEditNameModal: false, editNameValue: '' });
  },

  async confirmEditName() {
    const name = this.data.editNameValue.trim();
    const regex = /^[一-龥a-zA-Z0-9_]{1,16}$/;
    if (!regex.test(name)) {
      wx.showToast({
        title: this.data.locale === 'en' ? 'Invalid nickname' : '昵称格式不正确',
        icon: 'none',
      });
      return;
    }
    try {
      const res = await api.callCloud('profile.update', { name });
      if (res.result && res.result.success === true) {
        const userInfo = { ...this.data.userInfo, nickname: name };
        this.setData({ userInfo, showEditNameModal: false });
        wx.setStorageSync('userName', name);
        wx.showToast({
          title: this.data.locale === 'en' ? 'Nickname updated' : '昵称已更新',
          icon: 'success',
        });
      } else {
        wx.showToast({
          title: this.data.locale === 'en' ? 'Update failed' : '更新失败',
          icon: 'none',
        });
      }
    } catch (err) {
      console.error('[profile] update name failed', err);
      wx.showToast({
        title: this.data.locale === 'en' ? 'Update failed' : '更新失败',
        icon: 'none',
      });
    }
  },

  // Toggle language EN <-> CN (using global app i18n system)
  toggleLanguage() {
    const current = app.getLanguage() || 'zh';
    const next = current === 'en' ? 'zh' : 'en';
    app.setLanguage(next);
    this.setData({ locale: next });
    wx.showToast({ title: next === 'en' ? 'Language: EN' : '语言: 中文', icon: 'none' });
  },

  // Toggle theme day <-> night
  toggleTheme() {
    app.toggleTheme();
    const next = app.getTheme();
    this.setData({ theme: next });
    wx.showToast({ title: next === 'day' ? 'Theme: Day' : 'Theme: Night', icon: 'none' });
  },

  // ---- Personal Info (body data) ----
  onPersonalInfoTap() {
    // ⚠️ 资料还没加载完 → 不允许打开弹层。
    //    原来直接用 this.data.bodyHeight/bodyWeight, 但这两个字段只在 loadData 成功时才存在,
    //    loadData 失败(或用户手速够快)时拿到的是默认值 170/60,
    //    点一次"确认"就把真实的 178/72 覆盖成 170/60。
    if (!this.data.profileLoaded) {
      wx.showToast({ title: this.data.locale === 'en' ? 'Loading...' : '加载中', icon: 'none' });
      return;
    }
    // 优先用页面上的真实值, 其次用全局(storage 恢复过的)值, 最后才用默认值
    const h = this.data.bodyHeight || app.globalData.userHeight || 170;
    const w = this.data.bodyWeight || app.globalData.userWeight || 60;
    this.setData({
      showEditBodyModal: true,
      editHeight: h,
      editHeightStr: formatNumberForInput(h),
      editWeight: w,
      editWeightStr: formatNumberForInput(w),
    });
  },

  onHeightInput(e) {
    const patch = syncDecimalValue('editHeight', e.detail.value);
    if (patch) this.setData(patch);
  },

  onWeightInput(e) {
    const patch = syncDecimalValue('editWeight', e.detail.value);
    if (patch) this.setData(patch);
  },

  onBodyMaskTap(e) {
    if (e.target !== e.currentTarget) return;
    this.setData({ showEditBodyModal: false });
  },

  cancelEditBody() {
    this.setData({ showEditBodyModal: false });
  },

  async confirmEditBody() {
    // 资料没加载完 → 不允许写回 (否则会把默认值 170/60 写到服务端)
    if (!this.data.profileLoaded) {
      wx.showToast({ title: this.data.locale === 'en' ? 'Loading...' : '加载中', icon: 'none' });
      return;
    }
    const height = this.data.editHeight;
    const weight = this.data.editWeight;
    if (height < 50 || height > 250 || weight < 20 || weight > 300) {
      wx.showToast({ title: this.data.locale === 'en' ? 'Invalid values' : '数值不合法', icon: 'none' });
      return;
    }
    try {
      const res = await api.callCloud('profile.updateFull', { height, weight });
      if (res.result && res.result.success) {
        app.globalData.userWeight = weight;
        app.globalData.userHeight = height;
        wx.setStorageSync('userWeight', weight);
        wx.setStorageSync('userHeight', height);
        this.setData({
          bodyHeight: height,
          bodyWeight: weight,
          showEditBodyModal: false,
        });
        wx.showToast({ title: this.data.locale === 'en' ? 'Updated' : '已更新', icon: 'success' });
      } else {
        wx.showToast({ title: this.data.locale === 'en' ? 'Update failed' : '更新失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[profile] update body failed', err);
      wx.showToast({ title: this.data.locale === 'en' ? 'Update failed' : '更新失败', icon: 'none' });
    }
  },

  onHelpTap() {
    wx.navigateTo({ url: '/pages/guide/index' });
  },

  // 我的分享: 管理已分享的训练链接(可撤销)
  onMySharesTap() {
    wx.navigateTo({ url: '/pages/my-shares/index' });
  },

  // 空事件处理器: wxml 里 catchtap="noop" 需要它存在, 否则会抛 "noop is not a function"
  noop() {},
});
