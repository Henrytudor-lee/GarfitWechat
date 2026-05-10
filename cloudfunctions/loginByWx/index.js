// 云函数: loginByWx — 腾讯云 MySQL
const mysql = require('mysql2/promise');
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

function wxGet(url, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getAccessToken() {
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_APPSECRET;
  if (!appid || !secret) throw new Error('未配置 WX_APPID/WX_APPSECRET');
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const res = await wxGet(url);
  if (!res.access_token) throw new Error('获取 access_token 失败');
  return res.access_token;
}

// 用 code 换取手机号（code 只能用一次）
async function getPhoneNumber(code) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`;
  const res = await wxGet(url, { code });
  if (res.errcode !== 0) throw new Error('获取手机号失败: ' + (res.errmsg || res.errcode));
  return res.phone_info && res.phone_info.phoneNumber;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '无法获取 openid' };

  try {
    const [rows] = await getPool().query('SELECT * FROM users WHERE _openid = ? LIMIT 1', [openid]);

    if (rows.length > 0) {
      // 老用户：只更新资料，不强制要求手机号
      const updates = ['updated_at = NOW()'];
      const vals = [];
      if (event.nickname) { updates.push('name = ?'); vals.push(event.nickname); }
      if (event.avatar) { updates.push('avatar = ?'); vals.push(event.avatar); }
      if (event.phoneNumber) { updates.push('phone = ?'); vals.push(event.phoneNumber); }
      if (vals.length > 0) {
        vals.push(rows[0].id);
        await getPool().query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals);
      }
      return {
        success: true,
        userId: rows[0].id,
        openid,
        phoneNumber: rows[0].phone || null,
        isNew: false,
      };
    }

    // 新用户：必须有手机号
    let phoneNumber = event.phoneNumber || null;
    if (!phoneNumber && event.phoneCode) {
      try {
        phoneNumber = await getPhoneNumber(event.phoneCode);
      } catch (phoneErr) {
        console.error('获取手机号失败:', phoneErr.message);
      }
    }
    if (!phoneNumber) {
      return { success: false, error: '请先授权手机号' };
    }

    const [result] = await getPool().query(
      'INSERT INTO users (_openid, name, avatar, phone, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [openid, event.nickname || '', event.avatar || '', phoneNumber, 'user', 1]
    );
    return { success: true, userId: result.insertId, openid, phoneNumber, isNew: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
};
