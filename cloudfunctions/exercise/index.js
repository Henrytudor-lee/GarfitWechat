// 云函数: exercise
// 训练动作记录 CRUD — add / update / delete / list（PostgreSQL）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const rdb = () => cloud.instance.rdb();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, exerciseId, sessionId, userId } = event;

  // 解析 userId
  let uid = userId;
  if (!uid && openid) {
    const { data, error } = await rdb()
      .from('users')
      .select('id')
      .eq('openid', openid)
      .limit(1);
    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) return { success: false, error: '用户未找到' };
    uid = data[0].id;
  }

  try {
    if (action === 'add') {
      const { exercise_id, name, weight, weight_unit, reps, sequence } = event;
      if (!exercise_id || !name) return { success: false, error: '缺少必填字段' };

      const { data: newData, error: err } = await rdb()
        .from('exercises')
        .insert({
          session_id: sessionId || null,
          user_id: uid,
          exercise_id,
          name,
          sequence: sequence || 0,
          weight: parseFloat(weight) || 0,
          weight_unit: weight_unit || 'kg',
          reps: parseInt(reps) || 0,
        })
        .select();
      if (err) return { success: false, error: err.message };
      const newId = newData && newData.length > 0 ? newData[0].id : null;
      return { success: true, exerciseId: newId };

    } else if (action === 'update') {
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };
      const { weight, weight_unit, reps, sequence } = event;
      const updateData = {};
      if (weight !== undefined) updateData.weight = parseFloat(weight);
      if (weight_unit !== undefined) updateData.weight_unit = weight_unit;
      if (reps !== undefined) updateData.reps = parseInt(reps);
      if (sequence !== undefined) updateData.sequence = parseInt(sequence);
      updateData.update_time = new Date().toISOString();

      const { error: err } = await rdb()
        .from('exercises')
        .update(updateData)
        .eq('id', exerciseId);
      if (err) return { success: false, error: err.message };
      return { success: true };

    } else if (action === 'delete') {
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };
      const { error: err } = await rdb()
        .from('exercises')
        .delete()
        .eq('id', exerciseId);
      if (err) return { success: false, error: err.message };
      return { success: true };

    } else if (action === 'list') {
      if (!sessionId) return { success: false, error: '缺少 sessionId' };
      const { data, error: err } = await rdb()
        .from('exercises')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', uid)
        .order('sequence', { ascending: true });
      if (err) return { success: false, error: err.message };
      return { success: true, exercises: data || [] };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
