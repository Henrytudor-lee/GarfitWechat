// components/welcome-modal/index.js
const app = getApp();
const i18n = require('../../utils/i18n.js');
const { compressToLimit } = require('../../utils/image.js');
const api = require('../../utils/api.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');

// 初始文案(attached 时会按当前语言再刷新一次) —— 全部取自 locales 字典
const t0 = i18n.getTranslations();

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
    t: {},   // i18n 字典(打开弹框时从 app.globalData.t 刷新, 见 isOpen observer)
    imgPrefix: '',

    // 表单数据
    name: 'GFit用户',
    avatarPath: '',   // 预览用(本地临时路径 或 上传后的服务器地址)
    avatarUrl: '',    // 上传成功后的服务器地址 —— 只有它才会写进后端
    uploading: false, // 头像上传中: 禁用"确认", 防止把本地临时路径提交上去
    submitting: false,// 提交中: 防连点
    birthday: '',
    gender: '',  // '' | 'male' | 'female'
    purpose: 0,  // 0 | 1 | 2 | 3
    height: 170,
    heightStr: '170',
    weight: 60,
    weightStr: '60',

    // 翻译文本(全部来自 locales 字典)
    welcomeText: t0.WELCOME_TO_GFIT,
    welcomeSubText: t0.START_YOUR_FITNESS_JOURNEY,
    cancelText: t0.CANCEL,
    confirmText: t0.CONFIRM,
    namePlaceholder: t0.NAME_OPTIONAL,
    heightLabel: t0.HEIGHT,
    weightLabel: t0.WEIGHT_BODY,
    birthdayPlaceholder: t0.DATE_OF_BIRTH,
    genderLabel: t0.GENDER,
    genderMale: t0.MALE,
    genderFemale: t0.FEMALE,
    genderOther: t0.OTHER,
    purposeLabel: t0.FITNESS_GOAL,
    // ⚠️ 健美/减肥/养生 在 zh.js / en.js 里都没有对应 key, 只能保留硬编码
    purposeOptions: [
      { key: 1, icon: '💪', text: '健美', textEn: 'Fitness' },
      { key: 2, icon: '🔥', text: '减肥', textEn: 'Weight Loss' },
      { key: 3, icon: '🧘‍♀️', text: '养生', textEn: 'Health' },
    ],
    uploadAvatarText: t0.UPLOAD_AVATAR,
  },

  lifetimes: {
    attached() {
      this._initLang();
    },
  },

  observers: {
    'isOpen': function (isOpen) {
      if (isOpen) {
        // i18n 字典要从 app.globalData 重新取, 否则切换语言后弹框里还是旧语言
        this.setData({
          imgPrefix: app.globalData.imagePrefix || '',
          t: app.globalData.t || {},
        });
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
      // 所有文案都走 locales 字典 key(见 locales/zh.js / en.js)
      const t = i18n.getTranslations(lang);

      this.setData({
        t,
        welcomeText: t.WELCOME_TO_GFIT,
        welcomeSubText: t.START_YOUR_FITNESS_JOURNEY,
        cancelText: t.CANCEL,
        confirmText: t.CONFIRM,
        namePlaceholder: t.NAME_OPTIONAL,
        heightLabel: t.HEIGHT,
        weightLabel: t.WEIGHT_BODY,
        birthdayPlaceholder: t.DATE_OF_BIRTH,
        genderLabel: t.GENDER,
        genderMale: t.MALE,
        genderFemale: t.FEMALE,
        genderOther: t.OTHER,
        purposeLabel: t.FITNESS_GOAL,
        uploadAvatarText: t.UPLOAD_AVATAR,
      });
    },

    onMaskTap() {
      // 欢迎弹框是"填资料"表单: 误点遮罩不应该把用户填了一半的内容清空
      // → 遮罩点击什么都不做, 只有点"取消"或提交成功才会关闭并 resetForm
    },

    onSheetTap() {
      // 空实现: catchtap 用来阻止点击冒泡到遮罩
    },

    closeModal() {
      this.resetForm();
      this.triggerEvent('close');
    },

    resetForm() {
      this.setData({
        name: 'GFit用户',
        avatarPath: '',
        avatarUrl: '',
        uploading: false,
        submitting: false,
        birthday: '',
        gender: '',
        purpose: 0,
        height: 170,
        heightStr: '170',
        weight: 60,
        weightStr: '60',
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

    onHeightInput(e) {
      const patch = syncDecimalValue('height', e.detail.value);
      if (patch) this.setData(patch);
    },

    onWeightInput(e) {
      const patch = syncDecimalValue('weight', e.detail.value);
      if (patch) this.setData(patch);
    },

    // 选择头像
    async onChooseAvatar() {
      const openid = app.globalData.openid || '';
      if (!openid) {
        wx.showToast({ title: 'openid unavailable', icon: 'none' });
        return;
      }
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const tempFilePath = res.tempFilePaths[0];
          // 立刻显示本地预览 (不等上传完成), 但标记 uploading:
          // 上传完成前不允许"确认", 否则会把本地临时路径写进后端
          this.setData({ avatarPath: tempFilePath, avatarUrl: '', uploading: true });
          // 自动压缩到 1MB 以内, 避免后端 Multer 413
          let uploadPath = tempFilePath;
          try {
            uploadPath = await compressToLimit(tempFilePath);
          } catch (e) {
            console.warn('[welcome] compress failed, use original', e);
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
                console.error('upload avatar failed', uploadRes);
                wx.showToast({ title: 'upload failed (' + uploadRes.statusCode + ')', icon: 'none' });
                this._uploadFailed();
                return;
              }
              try {
                const data = JSON.parse(uploadRes.data);
                if (!data.success || !data.url) {
                  console.error('upload avatar: bad response', data);
                  wx.showToast({ title: 'upload failed', icon: 'none' });
                  this._uploadFailed();
                  return;
                }
                // avatarUrl 才是能写进后端的服务器地址, avatarPath 只用于预览
                this.setData({ avatarPath: data.url, avatarUrl: data.url, uploading: false });
              } catch (e) {
                console.error('upload avatar: parse error', e, uploadRes.data);
                wx.showToast({ title: 'upload failed', icon: 'none' });
                this._uploadFailed();
              }
            },
            fail: (err) => {
              console.error('uploadFile failed', err);
              wx.showToast({ title: 'upload failed', icon: 'none' });
              this._uploadFailed();
            },
          });
        },
      });
    },

    // 上传失败: 回到"没有可用头像"的状态, 并解禁确认按钮
    _uploadFailed() {
      this.setData({ uploading: false, avatarPath: this.data.avatarUrl || '' });
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
      // 头像还没上传完 → 不允许提交(否则会把本地临时路径写进后端)
      if (this.data.uploading) {
        wx.showToast({ title: this.data.uploadAvatarText, icon: 'none' });
        return;
      }
      // 防连点: 上一次提交还没回来就不要再发一次
      if (this._submitting) return;
      this._submitting = true;
      this.setData({ submitting: true });

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
      // 只传上传成功的服务器地址 —— 本地临时路径(wxfile://tmp_xxx)后端存不了
      if (this.data.avatarUrl) payload.avatar = this.data.avatarUrl;
      if (purpose >= 1 && purpose <= 3) payload.purpose = purpose;
      if (this.data.height) payload.height = this.data.height;
      if (this.data.weight) payload.weight = this.data.weight;

      api.callCloud(payload.action, payload).then((res) => {
        if (res.result && res.result.success) {
          wx.showToast({
            title: this.data.confirmText + ' ✓',
            icon: 'success',
          });
          this.closeModal();
        }
      }).catch((err) => {
        wx.showToast({ title: 'Error', icon: 'none' });
        console.error('profile.updateFull failed', err);
      }).finally(() => {
        // 成功失败都要解锁, 否则按钮再也点不动
        this._submitting = false;
        this.setData({ submitting: false });
      });
    },
  },
});
