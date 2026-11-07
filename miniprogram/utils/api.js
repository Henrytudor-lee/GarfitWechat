// utils/api.js
// 包装 wx.request，替代 wx.cloud.callFunction
// - 自动从 storage 注入 JWT
// - 统一处理响应: success → resolve(data), fail → reject(Error)
// - 401 → token 确实失效: 清 token + 静默登录 + **用新 token 重试原请求**
// - 403 → 权限不足: **不清 token**(token 是好的), 直接 reject
//
// 2026-11-04 修复"切后台回来页面空白":
//   原来 401/403 一起处理 → 任一接口 403 就把 token 清掉 → 后续接口全 401
//   → allSettled 虽然不 throw, 但所有请求都失败 → 一项 setData 都不执行
//   → 页面停在初始状态(空白)。
//   而且原来即使触发了静默登录, 也没有人**重试**失败的请求, 登录成功也救不回这一轮。

const BASE_URL = 'https://gfit.l2ee.top';

console.log('[api] BASE_URL =', BASE_URL);

// ---- 鉴权失效 → 静默登录 (并发共享同一个 Promise, 不会重复登录) ----
let _loginPromise = null;

function triggerSilentLogin() {
  if (_loginPromise) return _loginPromise;
  _loginPromise = (async () => {
    try {
      const app = typeof getApp === 'function' ? getApp() : null;
      if (app && typeof app.doSilentLogin === 'function') {
        await app.doSilentLogin();
      }
    } catch (e) {
      console.warn('[api] triggerSilentLogin failed', e);
    }
  })();
  // 登录完成(或失败)后解锁, 让下一次 401 还能重新触发
  _loginPromise = _loginPromise.finally(() => { _loginPromise = null; });
  return _loginPromise;
}

function getToken() {
  return wx.getStorageSync('token') || '';
}

function setToken(token) {
  if (token) wx.setStorageSync('token', token);
  else wx.removeStorageSync('token');
}

/**
 * 发一次请求
 *
 * @param action  action 名
 * @param data    参数
 * @param retried 是否已经重试过(401 只重试一次, 防止无限循环)
 */
function request(action, data, retried) {
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
        // ── 401: token 无效或过期 ──
        // 清 token, 静默登录拿到新 token 后**重试原请求**。
        // 不重试的话, 登录成功了这一轮也还是空白(切后台回来的典型症状)。
        if (res.statusCode === 401) {
          setToken('');
          if (!retried) {
            triggerSilentLogin()
              .then(() => request(action, data, true).then(resolve, reject))
              .catch(() => reject(new Error('未登录或 token 过期')));
            return;
          }
          reject(new Error('未登录或 token 过期'));
          return;
        }

        // ── 403: 权限不足, token 是好的 ──
        // 绝对不能清 token —— 否则一个接口的 403 会让整个 app 失去鉴权能力,
        // 后续接口全 401 → 页面空白。
        if (res.statusCode === 403) {
          reject(new Error((res.data && res.data.message) || '未授权'));
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

function call(action, data = {}) {
  return request(action, data, false);
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
