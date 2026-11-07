// utils/i18n.js — 国际化工具，支持中英文切换
const app = getApp();

const LOCALES = {
  zh: require('../locales/zh.js'),
  en: require('../locales/en.js'),
};

// 默认语言
let currentLang = 'zh';

/**
 * 初始化语言，从 storage 恢复
 */
function initLang() {
  const saved = wx.getStorageSync('language');
  currentLang = saved === 'zh' || saved === 'en' ? saved : 'zh';
  return currentLang;
}

/**
 * 设置语言
 * @param {string} lang - 'zh' | 'en'
 */
function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  wx.setStorageSync('language', lang);
  // 通知所有页面更新
  const pages = getCurrentPages();
  pages.forEach(page => {
    if (page && page.setData) {
      const t = getTranslations();
      page.setData({ t, lang: currentLang });
    }
  });
  if (app && app.globalData) {
    app.globalData.language = currentLang;
  }
}

/**
 * 获取当前语言
 */
function getLang() {
  return currentLang;
}

/**
 * 获取翻译函数
 * @param {string} lang - 可选，默认当前语言
 */
function getTranslations(lang) {
  lang = lang || currentLang;
  return LOCALES[lang] || LOCALES['en'];
}

/**
 * 翻译函数
 * @param {string} key - locales 文件中的 key
 * @param {string} lang - 可选，默认当前语言
 */
function t(key, lang) {
  lang = lang || currentLang;
  const translations = LOCALES[lang] || LOCALES['en'];
  return translations[key] || key;
}

module.exports = {
  initLang,
  setLang,
  getLang,
  t,
  getTranslations,
};
