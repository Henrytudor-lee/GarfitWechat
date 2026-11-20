// utils/privacy.js — 微信隐私接口(相册 / 摄像头)统一入口
//
// 背景: 从基础库 2.32.3 起, 这类接口受《用户隐私保护指引》约束。
//   小程序后台「服务内容声明 → 用户隐私保护指引」里没勾选对应隐私类型时,
//   调用会直接被拒, 报 errno 112:
//     saveImageToPhotosAlbum:fail api scope is not declared in the privacy agreement
//
// ⚠️ 这不是代码能绕过去的 —— 后台必须声明隐私类型。
//    代码这边能做的:
//      1. 调用前先走 wx.requirePrivacyAuthorize, 把官方隐私弹窗拉起来,
//         用户点同意之后接口才放行(而不是直接 fail)
//      2. 老基础库没有这个 API 时直接放行, 不影响老版本用户
//      3. 统一识别"没声明"这类错误, 让页面能给出能看懂的提示
//
// 用到的隐私接口:
//   wx.saveImageToPhotosAlbum → 相册(仅写入)
//   wx.chooseImage            → 相册(仅读取) + 摄像头(可拍照时)

/**
 * 是不是"隐私协议没声明"导致的失败(errno 112)
 * @param {*} err 微信回调的 err 对象 / Error
 * @returns {boolean}
 */
function isPrivacyScopeError(err) {
  if (!err) return false;
  // 微信把"后台没声明隐私类型"归成 errno 112
  if (err.errno === 112) return true;
  const msg = String(err.errMsg || err.message || '');
  // "A:fail api scope is not declared in the privacy agreement"
  return /privacy/i.test(msg) || /not\s*declared/i.test(msg);
}

/**
 * 确保已获得隐私授权
 *
 * - 基础库没有 requirePrivacyAuthorize → 直接 resolve(老版本不拦隐私)
 * - 用户已在隐私弹窗里同意过 → 框架直接 success
 * - 需要用户同意 → 弹出官方隐私弹窗, 同意后 resolve
 * - 用户拒绝 → reject
 *
 * @returns {Promise<void>}
 */
function ensurePrivacyAuthorized() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve();
      return;
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => {
        const msg = String((err && err.errMsg) || '');
        // 用户点了"拒绝" —— 跟"后台没声明"是两回事, 页面提示要分开写
        reject(new Error('privacy denied: ' + (msg || 'unknown')));
      },
    });
  });
}

module.exports = {
  ensurePrivacyAuthorized,
  isPrivacyScopeError,
};
