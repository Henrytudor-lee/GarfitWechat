// 云函数: loginByWx — 极简微信登录
// 1. 前端 wx.login() 获取 code
// 2. 云函数调 auth.code2Session 换 openid
// 3. MySQL 记录用户，返回 userId
const mysql = require('mysql2/promise');
const cloud = require('wx-server-sdk');

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

exports.main = async (event, context) => {
  const { code } = event;

  if (!code) {
    return { success: false, error: '缺少登录凭证 code' };
  }

  try {
    // 1. 用 code 换 openid
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

    const wxRes = await new Promise((resolve, reject) => {
      require('https').get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('微信响应解析失败: ' + data)); }
        });
      }).on('error', reject);
    });

    if (wxRes.errcode) {
      return { success: false, error: wxRes.errmsg };
    }

    const { openid } = wxRes;

    // 2. 查老用户
    const [rows] = await getPool().query(
      'SELECT id FROM users WHERE _openid = ? LIMIT 1',
      [openid]
    );

    if (rows.length > 0) {
      return { success: true, userId: rows[0].id, openid };
    }

    // 3. 新用户注册
    const [result] = await getPool().query(
      'INSERT INTO users (_openid, role, status) VALUES (?, ?, ?)',
      [openid, 'user', 1]
    );

    return { success: true, userId: result.insertId, openid };

  } catch (err) {
    return { success: false, error: err.message };
  }
};
