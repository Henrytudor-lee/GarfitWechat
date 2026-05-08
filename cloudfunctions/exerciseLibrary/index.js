// 云函数: exerciseLibrary — 腾讯云 PostgreSQL RDB
// API: https://github.com/supabase/postgrest-js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const rdb = () => cloud.instance.rdb();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action, keyword, bodyPart, equipmentId, page = 1, pageSize = 20 } = event;

  try {
    if (action === 'list') {
      let q = rdb().from('exercises_library')
        .select('id,name,name_zh,image_name,video_name,video_file,equipment_id,body_part_id,exercise_type,is_favorite');

      if (keyword) {
        q = q.or(`name.ilike.%${keyword}%,name_zh.ilike.%${keyword}%`);
      }
      if (bodyPart) {
        q = q.or(`body_part_id.eq.${bodyPart},body_part_id.like.%${bodyPart}%`);
      }
      if (equipmentId) {
        q = q.or(`equipment_id.eq.${equipmentId},equipment_id.like.%${equipmentId}%`);
      }

      const offset = (page - 1) * pageSize;
      const { data, error } = await q
        .order('name_zh', { ascending: true })
        .limit(pageSize)
        .range(offset, offset + pageSize - 1);

      if (error) return { success: false, error: error.message };
      return { success: true, list: data || [], page, pageSize };

    } else if (action === 'detail') {
      const { id } = event;
      if (!id) return { success: false, error: '缺少 id' };

      const { data, error } = await rdb()
        .from('exercises_library')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, item: data || null };

    } else if (action === 'favorites') {
      const { data, error } = await rdb()
        .from('exercises_library')
        .select('id,name,name_zh,image_name,video_name,video_file,equipment_id,body_part_id,exercise_type,is_favorite')
        .eq('is_favorite', 1)
        .order('name_zh', { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, list: data || [] };

    } else if (action === 'toggleFavorite') {
      const { exerciseId } = event;
      if (!exerciseId) return { success: false, error: '缺少 exerciseId' };

      const { data, error } = await rdb()
        .from('exercises_library')
        .select('is_favorite')
        .eq('id', exerciseId)
        .limit(1)
        .maybeSingle();
      if (error || !data) return { success: false, error: error ? error.message : '动作不存在' };

      const newVal = data.is_favorite === 1 ? 0 : 1;
      const { error: err } = await rdb()
        .from('exercises_library')
        .update({ is_favorite: newVal })
        .eq('id', exerciseId);
      if (err) return { success: false, error: err.message };
      return { success: true, is_favorite: newVal };

    } else if (action === 'count') {
      const { data, error } = await rdb()
        .from('exercises_library')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (error) return { success: false, error: error.message };
      return { success: true, total: 0 };
    }

    return { success: false, error: '未知 action' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
