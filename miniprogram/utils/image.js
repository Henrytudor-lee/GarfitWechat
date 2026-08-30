// utils/image.js
// 图片压缩工具: 把任意大小的图片压到 maxSize 以内再上传
// - 用 wx.compressImage (压缩质量从 80 递减)
// - 最多迭代 3 次, 仍超限就返回当前结果 (不无限压缩)
// - 已经在限制内 / 拿不到文件信息 / 压缩失败: 原样返回, 让后端兜底

const DEFAULT_MAX_SIZE = 1 * 1024 * 1024; // 1MB
const QUALITY_START = 80;
const QUALITY_MIN = 30;

function getFileSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (info) => resolve(info.size || 0),
      fail: () => resolve(0),
    });
  });
}

function compressOnce(filePath, quality) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(err),
    });
  });
}

/**
 * 把图片压缩到 maxSize 字节以内
 * @param {string} filePath - 原始文件路径 (tempFilePath)
 * @param {number} [maxSize=1MB]
 * @returns {Promise<string>} 压缩后的文件路径 (可能 = 原路径)
 */
async function compressToLimit(filePath, maxSize = DEFAULT_MAX_SIZE) {
  if (!filePath) return filePath;
  const originalSize = await getFileSize(filePath);
  if (originalSize > 0 && originalSize <= maxSize) return filePath;

  let current = filePath;
  let quality = QUALITY_START;
  for (let i = 0; i < 3; i++) {
    try {
      current = await compressOnce(current, quality);
    } catch (e) {
      console.warn('[compress] failed, return original:', e);
      return filePath;
    }
    const size = await getFileSize(current);
    console.log(`[compress] attempt ${i + 1}: quality=${quality}, size=${size}B`);
    if (size > 0 && size <= maxSize) return current;
    if (quality <= QUALITY_MIN) return current; // 已到下限, 不再压
    quality = Math.max(QUALITY_MIN, quality - 20);
  }
  return current;
}

module.exports = { compressToLimit, DEFAULT_MAX_SIZE };
