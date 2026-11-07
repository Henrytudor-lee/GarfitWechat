// utils/avatar.js
// 处理用户头像 URL:
// - 旧 cloud://.../avatars/xxx.jpg → 提取文件名, 拼成 http://<server>/avatars/xxx.jpg
// - 新上传返回的 http URL → 直接返回
// - null / 空 / 非法 → 返回 null (让调用方用默认图)

function normalizeAvatar(rawUrl, imagePrefix) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  // 已经是 http(s) URL, 直接用
  if (/^https?:\/\//.test(rawUrl)) return rawUrl;

  // 老 cloud:// 格式, 提取最后一段文件名
  if (rawUrl.startsWith('cloud://')) {
    const filename = rawUrl.split('/').pop();
    if (!filename) return null;
    const prefix = imagePrefix || (typeof getApp !== 'undefined' && getApp().globalData.imagePrefix) || '';
    return `${prefix}/avatars/${filename}`;
  }

  // 已经是裸文件名 (罕见), 当成在 avatars/ 下
  if (!rawUrl.includes('/')) {
    const prefix = imagePrefix || (typeof getApp !== 'undefined' && getApp().globalData.imagePrefix) || '';
    return `${prefix}/avatars/${rawUrl}`;
  }

  // 其他格式 (相对路径等), 原样返回
  return rawUrl;
}

module.exports = { normalizeAvatar };
