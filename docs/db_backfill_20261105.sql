-- ============================================================================
-- 回填脚本  2026-11-05  (修 "已练过" 标记的历史缺口)
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 状态: ⬜ 待执行
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【为什么需要】
--
--   2026-11-05 排查"训练了交叉跳跃但'已训练'筛选里找不到"时发现:
--
--   真实训练关系(user × exercise)   126 对
--   已标记 is_practiced=1             42 对
--   缺口                              85 对
--
--   按用户:
--     user 1   训练过 94 个动作, 只标了 39   → 缺 55
--     user 28  训练过  5 个动作, 标了  0   → 缺 5
--     user 29/30/31/32 各缺 5, user 47 缺 3
--
--   两个根因:
--     ① 老版 markPracticed 是 **toggle 语义** —— 记第 2 组时把"已练过" toggle 回 0
--        (2026-11-05 已改成幂等标记, 见 exercises.service.ts)
--     ② 迁到 NestJS 那阵 markPracticed 是空壳 `return { success: true }` —— 从不写库
--
--   → 历史数据需要一次性回填, 让"已练过"和真实训练记录一致。
--
-- 【安全性】
--   · 只动 user_exercise_stats 和 users.practiced_exercises 两处
--   · exercises / sessions / exercises_library 完全不动
--   · 幂等, 可重复执行
--   · 旧列会被整体覆盖成关联表的内容 —— 关联表此时就是完整真相源
--   · users.favor_exercises 不动(收藏和"练过"是两个独立标记)
--
-- ⚠️ 执行前必做
--   CREATE TABLE user_exercise_stats_bak_20261105b AS SELECT * FROM user_exercise_stats;
--   CREATE TABLE users_bak_20261105b AS SELECT id, _openid, favor_exercises, practiced_exercises FROM users;
-- ============================================================================


-- ############################################################################
-- 【STEP 1】关联表: 把所有"真实训练过"的 (user_id, exercise_id) 标记为 practiced=1
--
-- ON DUPLICATE KEY UPDATE 保证幂等; 已有的 is_favor 不受影响。
-- 注意: 那些"只收藏、没练过"的动作(关联表有行但 exercises 表没有记录)不会被碰到。
-- ############################################################################
INSERT INTO `user_exercise_stats`
  (`user_id`, `exercise_id`, `is_favor`, `is_practiced`)
SELECT DISTINCT e.user_id, e.exercise_id, 0, 1
  FROM `exercises` e
 WHERE e.user_id IS NOT NULL
ON DUPLICATE KEY UPDATE `is_practiced` = 1;


-- ############################################################################
-- 【STEP 2】旧列 users.practiced_exercises 同步成关联表的内容
--
-- ⚠️ group_concat_max_len 默认 1024, user 1 有 94 个 id 会顶到上限 → 必须先调大。
-- ############################################################################
SET SESSION group_concat_max_len = 100000;

UPDATE `users` u
  JOIN (
    SELECT s.user_id, GROUP_CONCAT(s.exercise_id ORDER BY s.exercise_id) AS ids
      FROM `user_exercise_stats` s
     WHERE s.is_practiced = 1
     GROUP BY s.user_id
  ) x ON x.user_id = u.id
   SET u.practiced_exercises = x.ids;


-- ############################################################################
-- 【STEP 3】验证
-- ############################################################################
-- 3.1 ★ 核心: 缺口必须归零
-- SELECT COUNT(*) AS should_be_zero FROM (
--   SELECT DISTINCT e.user_id, e.exercise_id FROM exercises e
--     LEFT JOIN user_exercise_stats s ON s.user_id = e.user_id AND s.exercise_id = e.exercise_id
--    WHERE s.exercise_id IS NULL OR s.is_practiced = 0) t;
--     → 期望 0
--
-- 3.2 两边必须一致(逐用户)
-- SELECT u.id,
--        (SELECT GROUP_CONCAT(s.exercise_id ORDER BY s.exercise_id) FROM user_exercise_stats s
--          WHERE s.user_id=u.id AND s.is_practiced=1) AS tbl,
--        u.practiced_exercises AS csv
--   FROM users u WHERE u.practiced_exercises <> '';
--     → 每个用户的 tbl 和 csv 必须完全相同
--
-- 3.3 收藏标记没被动到
-- SELECT COUNT(*) AS favor_rows FROM user_exercise_stats WHERE is_favor = 1;
--     → 应与回填前一致
--
-- 3.4 计数核对
-- SELECT COUNT(*) AS total_rows,
--        SUM(is_favor) AS favor_rows,
--        SUM(is_practiced) AS practiced_rows
--   FROM user_exercise_stats;
--     → 回填前 52 行 / practiced 42; 回填后行数会涨(补进 85 对里不存在的那些)
--
-- 3.5 孤儿检查
-- SELECT COUNT(*) AS orphan_ex FROM user_exercise_stats s
--   LEFT JOIN exercises_library l ON l.id = s.exercise_id WHERE l.id IS NULL;
-- ############################################################################


-- ############################################################################
-- 回滚
--
-- ALTER TABLE users u
--   JOIN user_exercise_stats_bak_20261105b b ON b.user_id = u.id
--    SET u.practiced_exercises = b.practiced_exercises;
-- DELETE FROM user_exercise_stats
--  WHERE (user_id, exercise_id) NOT IN
--        (SELECT user_id, exercise_id FROM user_exercise_stats_bak_20261105b);
-- ############################################################################
