// components/profile-modal/index.js
//
// 个人资料编辑器。
//
// ⚠️ 2026-11-09 改造说明:
//    这个组件原来叫 welcome-modal, 是"新用户首次进入强制收集个人信息"的弹框
//    (姓名 / 头像 / 身高 / 体重 / 生日 / 性别 / 运动目的)
//    → 属于微信小程序审核明令不通过的场景(首次进入强制收集个人信息)。
//
//    现在的分工:
//      · 首次进入: 不弹这个框, 新用户直接用默认资料 (app.globalData.defaultProfile)
//      · 这个组件: 改成 profile 页里的"资料编辑器", 用户想改随时打开
//
//    所以标题从"欢迎来到 G-FIT"改成了"编辑个人信息", 表单回填用户当前的值。
const app = getApp();
const i18n = require('../../utils/i18n.js');
const { compressToLimit } = require('../../utils/image.js');
const api = require('../../utils/api.js');
const { syncDecimalValue, formatNumberForInput } = require('../../utils/numberInput.js');

// 初始文案(attached 时会按当前语言再刷新一次) —— 全部取自 locales 字典
const t0 = i18n.getTranslations();

// 身高/体重合法区间 —— 和 profile 页原来的"个人资料"弹框保持一致
const HEIGHT_MIN = 50;
const HEIGHT_MAX = 250;
const WEIGHT_MIN = 20;
const WEIGHT_MAX = 300;

// 后端 birthday 是 timestamp, picker 需要 'YYYY-MM-DD'
function normalizeDate(raw) {
  if (!raw) return '';
  const matched = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false,
    },
    // 打开时回填用的当前资料:
    // { name, avatar, height, weight, gender, birthday, purpose }
    // avatar 传"可直接显示的完整 URL"(调用方用 normalizeAvatar 处理过)
    profile: {
      type: Object,
      value: null,
    },
  },

  data: {
    // 语言相关
    currentLang: 'zh',
    t: {},   // i18n 字典(打开弹框时从 app.globalData.t 刷新, 见 isOpen observer)
    imgPrefix: '',

    // 表单数据
    name: '',
    avatarPath: '',   // 预览用(本地临时路径 或 已有的服务器地址)
    avatarUrl: '',    // 新上传成功的服务器地址 —— 只有它才会写进后端
    uploading: false, // 头像上传中: 禁用"确认", 防止把本地临时路径提交上去
    submitting: false,// 提交中: 防连点
    birthday: '',
    gender: '',  // '' | 'male' | 'female' | 'other'
    purpose: 0,  // 0 | 1 | 2 | 3
    height: 170,
    heightStr: '170',
    weight: 60,
    weightStr: '60',

    // 翻译文本(全部来自 locales 字典)
    titleText: t0.EDIT_PERSONAL_INFO,
    subtitleText: t0.EDIT_PROFILE_HINT,
    cancelText: t0.CANCEL,
    confirmText: t0.CONFIRM,
    invalidText: t0.INVALID_BODY_DATA,
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
        // 每次打开都按当前资料回填 —— 用户改过什么, 下次打开还是那个值
        this._prefill();
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
        titleText: t.EDIT_PERSONAL_INFO,
        subtitleText: t.EDIT_PROFILE_HINT,
        cancelText: t.CANCEL,
        confirmText: t.CONFIRM,
        invalidText: t.INVALID_BODY_DATA,
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

    /**
     * 回填当前资料。
     *
     * 缺值时退回 app.globalData.defaultProfile —— 和新用户首次进入看到的默认值一致,
     * 不会出现"编辑器里是 170/60, 但用户实际是别的数"的错位。
     */
    _prefill() {
      const p = this.data.profile || {};
      const d = (app.globalData && app.globalData.defaultProfile) || { height: 170, weight: 60 };
      const height = Number(p.height) || app.globalData.userHeight || d.height;
      const weight = Number(p.weight) || app.globalData.userWeight || d.weight;

      this.setData({
        name: p.name || '',
        // avatarPath 只用于显示; avatarUrl 故意留空 ——
        // 只有用户重新选了头像, 才把新地址写回后端, 不动用户已有的那一个
        avatarPath: p.avatar || '',
        avatarUrl: '',
        uploading: false,
        submitting: false,
        birthday: normalizeDate(p.birthday),
        gender: p.gender || '',
        purpose: Number(p.purpose) || 0,
        height,
        heightStr: formatNumberForInput(height),
        weight,
        weightStr: formatNumberForInput(weight),
      });
    },

    onMaskTap() {
      // 资料弹框是"填资料"表单: 误点遮罩不应该把用户填了一半的内容清空
      // → 遮罩点击什么都不做, 只有点"取消"或提交成功才会关闭
    },

    onSheetTap() {
      // 空实现: catchtap 用来阻止点击冒泡到遮罩
    },

    closeModal() {
      this.triggerEvent('close');
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
            console.warn('[profile-modal] compress failed, use original', e);
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
      // 身高/体重区间校验 —— 和 profile 页原来的"个人资料"弹框一致
      const { height, weight } = this.data;
      if (height < HEIGHT_MIN || height > HEIGHT_MAX || weight < WEIGHT_MIN || weight > WEIGHT_MAX) {
        wx.showToast({ title: this.data.invalidText, icon: 'none' });
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
          // 通知外层刷新展示(头像/身高/体重等)
          this.triggerEvent('saved', payload);
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
