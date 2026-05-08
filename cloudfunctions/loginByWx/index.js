// 云函数: loginByWx
// 微信登录，自动创建或更新用户记录（PostgreSQL）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// cloud.instance 是 @cloudbase/node-sdk 的 CloudBase 实例，rdb() 直接可用
const rdb = () => cloud.instance.rdb();

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
