// components/welcome-modal/index.js
const app = getApp();
const i18n = require('../../utils/i18n.js');

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    // 语言相关
    currentLang: 'zh',
    t: {},
    imgPrefix: '',

    // 表单数据
    name: 'GFit用户',
    avatarPath: '',
    birthday: '',
    gender: '',  // '' | 'male' | 'female'
    purpose: 0,  // 0 | 1 | 2 | 3

    // 翻译文本
    welcomeText: '欢迎来到 G-FIT',
    welcomeSubText: '开始你的体能蜕变之旅',
    cancelText: '取消',
    confirmText: '确认',
    namePlaceholder: '姓名（选填）',
    birthdayPlaceholder: '出生年月日',
    genderLabel: '性别',
    genderMale: '男',
    genderFemale: '女',
    purposeLabel: '运动目的',
    purposeOptions: [
      { key: 1, icon: '💪', text: '健美', textEn: 'Fitness' },
      { key: 2, icon: '🔥', text: '减肥', textEn: 'Weight Loss' },
      { key: 3, icon: '🧘‍♀️', text: '养生', textEn: 'Health' },
    ],
    uploadAvatarText: '上传头像',
  },

  lifetimes: {
    attached() {
      this._initLang();
    },
  },

  observers: {
    'isOpen': function (isOpen) {
      if (isOpen) {
        this.setData({ imgPrefix: app.globalData.imagePrefix || '' });
        this._initLang();
      }
    },
  },

  methods: {
    _initLang() {
      const lang = app.getLanguage ? app.getLanguage() : 'zh';
      this.setData({ currentLang: lang });
      this._updateTranslations();
    },

    _updateTranslations() {
      const lang = this.data.currentLang;
      const t = i18n.getTranslations(lang);

      this.setData({
        welcomeText: lang === 'zh' ? '欢迎来到 G-FIT' : 'Welcome to G-FIT',
        welcomeSubText: lang === 'zh' ? '开始你的体能蜕变之旅' : 'Start Your Fitness Journey',
        cancelText: t.cancel || '取消',
        confirmText: t.confirm || '确认',
        namePlaceholder: lang === 'zh' ? '姓名（选填）' : 'Name (optional)',
        birthdayPlaceholder: lang === 'zh' ? '出生年月日' : 'Date of birth',
        genderLabel: lang === 'zh' ? '性别' : 'Gender',
        genderMale: lang === 'zh' ? '男' : 'Male',
        genderFemale: lang === 'zh' ? '女' : 'Female',
        genderOther: lang === 'zh' ? '其他' : 'Other',
        purposeLabel: lang === 'zh' ? '运动目的' : 'Fitness Goal',
        uploadAvatarText: lang === 'zh' ? '上传头像' : 'Upload Avatar',
      });
    },

    onMaskTap(e) {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    },

    closeModal() {
      this.resetForm();
      this.triggerEvent('close');
    },

    resetForm() {
      this.setData({
        name: 'GFit用户',
        avatarPath: '',
        birthday: '',
        gender: '',
        purpose: 0,
      });
    },

    // 切换语言
    switchLanguage() {
      const newLang = this.data.currentLang === 'zh' ? 'en' : 'zh';
      if (app.setLanguage) {
        app.setLanguage(newLang);
      }
      this.setData({ currentLang: newLang });
      this._updateTranslations();
    },

    // 名称输入
    onNameInput(e) {
      this.setData({ name: e.detail.value });
    },

    // 选择头像
    onChooseAvatar() {
      const openid = app.globalData.openid || '';
      if (!openid) {
        wx.showToast({ title: 'openid unavailable', icon: 'none' });
        return;
      }
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFilePath = res.tempFilePaths[0];
          wx.cloud.uploadFile({
            cloudPath: `avatars/${openid}.jpg`,
            filePath: tempFilePath,
            success: (uploadRes) => {
              this.setData({ avatarPath: uploadRes.fileID });
            },
            fail: (err) => {
              console.error('uploadFile failed', err);
              wx.showToast({ title: 'upload failed', icon: 'none' });
            },
          });
        },
      });
    },

    // 选择生日
    onBirthdayChange(e) {
      this.setData({ birthday: e.detail.value });
    },

    // 性别选择
    onGenderChange(e) {
      const value = e.currentTarget.dataset.value;
      this.setData({ gender: this.data.gender === value ? '' : value });
    },

    // 目的选择
    onPurposeSelect(e) {
      const purpose = parseInt(e.currentTarget.dataset.key, 10);
      this.setData({ purpose: this.data.purpose === purpose ? 0 : purpose });
    },

    // 取消
    onCancel() {
      this.closeModal();
    },

    // 确认
    onConfirm() {
      const { name, birthday, gender, purpose } = this.data;
      const openid = app.globalData.openid || '';

      // 只传非空字段，purpose 为 0 时不传
      const payload = {
        action: 'profile.updateFull',
        openid,
      };
      if (name) payload.name = name;
      if (birthday) payload.birthday = birthday;
      if (gender) payload.gender = gender;
      if (this.data.avatarPath) payload.avatar = this.data.avatarPath;
      if (purpose >= 1 && purpose <= 3) payload.purpose = purpose;

      wx.cloud.callFunction({
        name: 'api',
        data: payload,
        success: (res) => {
          if (res.result && res.result.success) {
            wx.showToast({
              title: this.data.confirmText + ' ✓',
              icon: 'success',
            });
            this.closeModal();
          }
        },
        fail: (err) => {
          wx.showToast({ title: 'Error', icon: 'none' });
          console.error('profile.updateFull failed', err);
        },
      });
    },
  },
});