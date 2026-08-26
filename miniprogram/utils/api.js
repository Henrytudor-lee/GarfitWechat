// utils/api.js
// 包装 wx.request，替代 wx.cloud.callFunction
// - 自动从 storage 注入 JWT
// - 统一处理响应: success → resolve(data), fail → reject(Error)
// - 401 时清掉 token, 触发上层重新登录

const BASE_URL = 'https://gfit.l2ee.top';

console.log('[api] BASE_URL =', BASE_URL);

function getToken() {
  return wx.getStorageSync('token') || '';
}

function setToken(token) {
  if (token) wx.setStorageSync('token', token);
  else wx.removeStorageSync('token');
}

function call(action, data = {}) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    wx.request({
      url: `${BASE_URL}/api`,
      method: 'POST',
      data: { action, ...data },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      success: (res) => {
        if (res.statusCode === 401) {
          setToken('');
          reject(new Error('未登录或 token 过期'));
          return;
        }
        const body = res.data || {};
        if (body.success) {
          resolve(body);
        } else {
          reject(new Error(body.error || 'request failed'));
        }
      },
      fail: (err) => {
        console.error('[api] fail', action, err);
        reject(new Error(err.errMsg || 'network error'));
      },
    });
  });
}

// 兼容旧 wx.cloud.callFunction 风格 — 返回 { result: ... }
// 让 res.result.X 这种访问方式不用改, 批量迁移成本最低
function callCloud(action, data = {}) {
  return call(action, data).then((res) => ({ result: res }));
}

module.exports = {
  BASE_URL,
  call,
  callCloud,
  getToken,
  setToken,
};
