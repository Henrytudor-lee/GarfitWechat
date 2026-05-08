// 云函数: loginByWx
// 微信登录，自动创建或更新用户记录（PostgreSQL）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 直接使用 @cloudbase/node-sdk，不依赖 wx-server-sdk 的 wrapper
const { CloudBase } = require('@cloudbase/node-sdk');

// cloud.DYNAMIC_CURRENT_ENV 在云函数运行时是实际环境ID字符串（如 prod-xxx）
const envId = cloud.DYNAMIC_CURRENT_ENV;
const cloudbase = new CloudBase({ env: envId });
const rdb = () => cloudbase.rdb();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, error: '无法获取 openid' };
  }

  try {
    // 查询是否已有用户记录
    const { data, error } = await rdb()
      .from('users')
      .select('*')
      .eq('openid', openid)
      .limit(1);

    if (error) return { success: false, error: error.message };

    let user;

    if (data && data.length > 0) {
      // 更新登录信息
      user = data[0];
      const { error: err } = await rdb()
        .from('users')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (err) return { success: false, error: err.message };
    } else {
      // 新用户注册
      const { data: newData, error: err } = await rdb()
        .from('users')
        .insert({
          openid,
          name: event.nickname || '',
          avatar: event.avatar || '',
          role: 'user',
          status: 1,
        })
        .select();
      if (err) return { success: false, error: err.message };
      user = newData && newData.length > 0 ? newData[0] : { id: null, openid, is_new: true };
    }

    return {
      success: true,
      openid,
      userId: user.id,
      isNew: !data || data.length === 0,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
