// utils/theme.js — 日间/夜间主题切换工具
const app = getApp();

const THEMES = {
  day: {
    bg: '#f5f5f5',
    surface: '#ffffff',
    'surface-low': '#f0f0f0',
    'surface-high': '#e8e8e8',
    'card-bg': 'rgba(0, 0, 0, 0.05)',
    'card-border': 'rgba(0, 0, 0, 0.10)',
    primary: '#ccf200',
    'primary-dim': '#b3d400',
    'text-primary': '#1a1a1a',
    'text-secondary': '#52525b',
    'text-muted': '#a1a1aa',
    divider: 'rgba(0, 0, 0, 0.10)',
    'input-bg': 'rgba(0, 0, 0, 0.05)',
    red: '#ef4444',
    // window
    windowBg: '#f5f5f5',
    navBg: '#ffffff',
    navColor: '#1a1a1a',
    tabColor: '#52525b',
    tabSelectedColor: '#ccf200',
    tabBg: '#ffffff',
  },
  night: {
    bg: '#131313',
    surface: '#1c1c1c',
    'surface-low': '#181818',
    'surface-high': '#262626',
    'card-bg': 'rgba(255, 255, 255, 0.05)',
    'card-border': 'rgba(255, 255, 255, 0.10)',
    primary: '#ccf200',
    'primary-dim': '#b3d400',
    'text-primary': '#ffffff',
    'text-secondary': '#a1a1aa',
    'text-muted': '#71717a',
    divider: 'rgba(255, 255, 255, 0.10)',
    'input-bg': 'rgba(255, 255, 255, 0.05)',
    red: '#ef4444',
    // window
    windowBg: '#131313',
    navBg: '#000000',
    navColor: '#ffffff',
    tabColor: '#52525b',
    tabSelectedColor: '#ccf200',
    tabBg: '#131313',
  },
};

let currentTheme = 'night';

/**
 * 初始化主题，从 storage 恢复
 */
function initTheme() {
  const saved = wx.getStorageSync('theme');
  currentTheme = saved === 'day' || saved === 'night' ? saved : 'night';
  applyTheme(currentTheme);
  return currentTheme;
}

/**
 * 切换主题
 * @param {string} theme - 'day' | 'night'
 */
function setTheme(theme) {
  if (theme !== 'day' && theme !== 'night') return;
  currentTheme = theme;
  wx.setStorageSync('theme', theme);
  applyTheme(theme);
  // 通知所有页面更新
  const pages = getCurrentPages();
  pages.forEach(page => {
    if (page && page.setData) {
      page.setData({ theme: currentTheme, themeVars: THEMES[currentTheme] });
    }
  });
  if (app && app.globalData) {
    app.globalData.theme = currentTheme;
    app.globalData.themeVars = THEMES[currentTheme];
  }
  // 同步原生顶部栏颜色
  const vars = THEMES[theme];
  wx.setBackgroundColor({ backgroundColor: vars.windowBg });
  wx.setNavigationBarColor({
    frontColor: theme === 'day' ? '#1a1a1a' : '#ffffff',
    backgroundColor: vars.windowBg,
  });
}

/**
 * 切换到另一种主题
 */
function toggleTheme() {
  const next = currentTheme === 'night' ? 'day' : 'night';
  setTheme(next);
  // 同步原生顶部栏颜色
  const vars = THEMES[next];
  wx.setBackgroundColor({ backgroundColor: vars.windowBg });
  wx.setNavigationBarColor({
    frontColor: next === 'day' ? '#1a1a1a' : '#ffffff',
    backgroundColor: vars.windowBg,
  });
}

/**
 * 获取当前主题
 */
function getTheme() {
  return currentTheme;
}

/**
 * 获取当前主题变量
 */
function getThemeVars() {
  return THEMES[currentTheme];
}

/**
 * 应用主题到 window 和 tabBar
 */
function applyTheme(theme) {
  const vars = THEMES[theme];
  if (!vars) return;
  wx.setBackgroundColor({ backgroundColor: vars.windowBg });
  // 更新 navigationBar 和 tabBar 颜色需要在每个页面处理
  // 这里通过 globalData 共享，页面 onShow 时自行读取
}

module.exports = {
  initTheme,
  setTheme,
  toggleTheme,
  getTheme,
  getThemeVars,
  THEMES,
};
