// 云函数: loginByWx — 微信标准登录流程
// 1. 前端 wx.login() 获取 code
// 2. 云函数调 auth.code2Session 换 openid + session_key
// 3. 操作 MySQL 记录用户
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

// 调微信 auth.code2Session 接口换 openid
function wxCode2Session(code) {
  return new Promise((resolve, reject) => {
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errcode) {
            reject(new Error(`auth.code2Session 失败: ${json.errmsg}`));
          } else {
            resolve(json); // { openid, session_key, unionid }
          }
        } catch (e) {
          reject(new Error('解析微信响应失败: ' + data));
        }
      });
    }).on('error', reject);
  });
}

exports.main = async (event, context) => {
  const { code, nickname, avatar, phoneNumber } = event;

  // 前端必须传 code
  if (!code) {
    return { success: false, error: '缺少登录凭证 code，请先调用 wx.login()' };
  }

  try {
    // 1. 用 code 换 openid
    const wechatRes = await wxCode2Session(code);
    const { openid, session_key } = wechatRes;

    // 2. 查老用户
    const [rows] = await getPool().query(
      'SELECT * FROM users WHERE _openid = ? LIMIT 1',
      [openid]
    );

    if (rows.length > 0) {
      // 老用户：更新资料
      const updates = ['updated_at = NOW()'];
      const vals = [];
      if (nickname) { updates.push('name = ?'); vals.push(nickname); }
      if (avatar) { updates.push('avatar = ?'); vals.push(avatar); }
      if (phoneNumber) { updates.push('phone = ?'); vals.push(phoneNumber); }
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

    // 3. 新用户注册
    const phone = phoneNumber ? phoneNumber.trim() : '';
    if (!phone || phone.length !== 11) {
      return { success: false, error: '请输入有效的11位手机号' };
    }

    const [result] = await getPool().query(
      'INSERT INTO users (_openid, name, avatar, phone, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [openid, nickname || '', avatar || '', phone, 'user', 1]
    );

    return {
      success: true,
      userId: result.insertId,
      openid,
      phoneNumber: phone,
      isNew: true,
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
};
