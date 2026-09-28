// utils/api.js
// 包装 wx.request，替代 wx.cloud.callFunction
// - 自动从 storage 注入 JWT
// - 统一处理响应: success → resolve(data), fail → reject(Error)
// - 401 / 403 都视为鉴权失效, 清掉 token 并触发上层重新登录
//   (修复: 某个接口 403 后, 同一过期 token 会让其他接口连锁失败)

const BASE_URL = 'https://gfit.l2ee.top';

console.log('[api] BASE_URL =', BASE_URL);

// ---- 鉴权失效 → 触发静默登录 (只触发一次, 防抖) ----
let _loginInFlight = false;
function triggerSilentLogin() {
  if (_loginInFlight) return;
  _loginInFlight = true;
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && typeof app.doSilentLogin === 'function') {
      app.doSilentLogin();
    }
  } catch (e) {
    console.warn('[api] triggerSilentLogin failed', e);
  }
  // 1.5s 后解锁, 让下次真正需要重登时还能再触发
  setTimeout(() => { _loginInFlight = false; }, 1500);
}

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
        // 401 / 403 都视为鉴权失效: 清 token, 触发重新登录,
        // 防止某个接口鉴权失败后, 后续接口因同一 token 全部失败
        if (res.statusCode === 401 || res.statusCode === 403) {
          setToken('');
          triggerSilentLogin();
          reject(new Error(res.statusCode === 401 ? '未登录或 token 过期' : '未授权'));
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
