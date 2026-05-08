// 云函数: loginByWx
// 微信登录，自动创建或更新用户记录
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取 openid' };
  }

  try {
    // 查询是否已有用户记录
    const { data: existing } = await db.collection('users')
      .where({ openid })
      .limit(1)
      .get();

    let user;

    if (existing && existing.length > 0) {
      // 更新登录信息
      user = existing[0];
      await db.collection('users').doc(user._id).update({
        data: {
          updated_at: db.serverDate(),
        },
      });
    } else {
      // 新用户注册
      const res = await db.collection('users').add({
        data: {
          openid,
          name: event.nickname || '',
          avatar: event.avatar || '',
          role: 'user',
          status: 1,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
        },
      });
      user = { _id: res._id, openid, is_new: true };
    }

    return {
      success: true,
      openid,
      userId: user._id,
      isNew: user.isNew || false,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
