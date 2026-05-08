// 云函数: exercise
// 训练动作记录 CRUD — add / update / delete / list
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, exerciseId, sessionId, userId } = event;

  // 解析 userId
  let uid = userId;
  if (!uid && openid) {
    const { data } = await db.collection('users').where({ openid }).limit(1).get();
    if (!data || data.length === 0) return { success: false, error: '用户未找到' };
    uid = data[0]._id;
  }

  try {
    if (action === 'add') {
      const { exercise_id, name, weight, weight_unit, reps, sequence } = event;
      if (!exercise_id || !name) return { success: false, error: '缺少必填字段' };

      const res = await db.collection('exercises').add({
        data: {
          session_id: sessionId || '',
          user_id: uid,
          exercise_id,
          name,
          sequence: sequence || 0,
          weight: parseFloat(weight) || 0,
          weight_unit: weight_unit || 'kg',
          reps: parseInt(reps) || 0,
          create_time: db.serverDate(),
          update_time: db.serverDate(),
        },
      });
      return { success: true, exerciseId: res._id };

    } else if (action === 'update') {
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };
      const { weight, weight_unit, reps, sequence } = event;
      const updateData = { update_time: db.serverDate() };
      if (weight !== undefined) updateData.weight = parseFloat(weight);
      if (weight_unit !== undefined) updateData.weight_unit = weight_unit;
      if (reps !== undefined) updateData.reps = parseInt(reps);
      if (sequence !== undefined) updateData.sequence = parseInt(sequence);

      await db.collection('exercises').doc(exerciseId).update({ data: updateData });
      return { success: true };

    } else if (action === 'delete') {
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };
      await db.collection('exercises').doc(exerciseId).delete();
      return { success: true };

    } else if (action === 'list') {
      if (!sessionId) return { success: false, error: '缺少 sessionId' };
      const { data } = await db.collection('exercises')
        .where({ session_id: sessionId, user_id: uid })
        .orderBy('sequence', 'asc')
        .get();
      return { success: true, exercises: data };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
