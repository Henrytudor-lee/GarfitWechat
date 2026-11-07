-- ============================================================================
-- 关联表同步脚本  2026-11-05
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 状态: ⬜ 待执行
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【为什么需要这一步】
--
--   2026-11-04 Phase 3 回填后, 关联表和 users 的两个 CSV 列是一致的(52 行)。
--   但 2026-11-05 用户在真机上继续训练 + 手动取消/新增了几个"练过"标记,
--   而**线上后端还是旧版**(只改 CSV 不写关联表)→ 两边出现了漂移:
--
--     CSV 里已取消(关联表还标着): 1942, 3052, 3673, 46920, 47757
--     CSV 里新增(关联表还没有): 28155, 1940
--
--   如果直接部署新后端(读关联表优先), 那 5 个已被取消的标记会**重新出现**。
--
-- 【同步方向】
--   **以 users 的 CSV 列为准** —— 它是当前唯一真相源(用户刚在真机上操作过),
--   关联表是派生的。
--
-- 【安全】
--   · 只动 user_exercise_stats, 不动 users / exercises / sessions
--   · 幂等, 可重复执行
--   · 全程可回滚: 执行前先备份关联表
--
-- ⚠️ 执行前必做
--   CREATE TABLE user_exercise_stats_bak_20261105 AS SELECT * FROM user_exercise_stats;
-- ============================================================================


-- ############################################################################
-- 【STEP 1】把关联表里"CSV 中已不存在"的标记清零
--
-- 注意: is_favor 和 is_practiced 是**两个独立标记**, 分别处理。
--       一个动作可能只取消"练过"但保留"收藏", 不能整行删。
-- ############################################################################
UPDATE `user_exercise_stats` s
  JOIN `users` u ON u.id = s.user_id
   SET s.is_practiced = 0
 WHERE s.is_practiced = 1
   AND FIND_IN_SET(s.exercise_id, COALESCE(u.practiced_exercises, '')) = 0;

UPDATE `user_exercise_stats` s
  JOIN `users` u ON u.id = s.user_id
   SET s.is_favor = 0
 WHERE s.is_favor = 1
   AND FIND_IN_SET(s.exercise_id, COALESCE(u.favor_exercises, '')) = 0;


-- ############################################################################
-- 【STEP 2】从 CSV 回填(补上 CSV 有但关联表没有的)
--
-- 与 Phase 3 STEP 2 相同的语句, 幂等 upsert。
-- 段提取用 "前后补逗号 + n+1" 的写法(见 Phase 3 脚本里的坑说明)。
-- 递归上限默认 1000 > 需要的 100, 不需要 SET SESSION。
-- ############################################################################

-- ---- 2a. 收藏 ----
INSERT INTO `user_exercise_stats`
  (`user_id`, `exercise_id`, `is_favor`, `is_practiced`)
WITH RECURSIVE nums AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM nums WHERE n < 100),
segs AS (
  SELECT u.id AS user_id,
         CAST(NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(CONCAT(',', u.favor_exercises, ','), ',', nums.n + 1), ',', -1)), '') AS UNSIGNED) AS ex_id
    FROM users u
    JOIN nums ON nums.n <= 1 + (CHAR_LENGTH(u.favor_exercises) - CHAR_LENGTH(REPLACE(u.favor_exercises, ',', '')))
   WHERE COALESCE(u.favor_exercises, '') <> ''
)
SELECT s.user_id, s.ex_id, 1, 0
  FROM segs s
 WHERE s.ex_id > 0
ON DUPLICATE KEY UPDATE `is_favor` = 1;

-- ---- 2b. 练过 ----
INSERT INTO `user_exercise_stats`
  (`user_id`, `exercise_id`, `is_favor`, `is_practiced`)
WITH RECURSIVE nums AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM nums WHERE n < 100),
segs AS (
  SELECT u.id AS user_id,
         CAST(NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(CONCAT(',', u.practiced_exercises, ','), ',', nums.n + 1), ',', -1)), '') AS UNSIGNED) AS ex_id
    FROM users u
    JOIN nums ON nums.n <= 1 + (CHAR_LENGTH(u.practiced_exercises) - CHAR_LENGTH(REPLACE(u.practiced_exercises, ',', '')))
   WHERE COALESCE(u.practiced_exercises, '') <> ''
)
SELECT s.user_id, s.ex_id, 0, 1
  FROM segs s
 WHERE s.ex_id > 0
ON DUPLICATE KEY UPDATE `is_practiced` = 1;


-- ############################################################################
-- 【STEP 3】验证 —— 必须全部一致才算同步成功
-- ############################################################################
-- 3.1 ★ 核心: 逐用户比对, 两个标记都要对得上
-- SELECT u.id,
--        u.practiced_exercises AS csv_practiced,
--        (SELECT GROUP_CONCAT(exercise_id ORDER BY exercise_id) FROM user_exercise_stats s
--          WHERE s.user_id=u.id AND s.is_practiced=1) AS tbl_practiced,
--        u.favor_exercises AS csv_favor,
--        (SELECT GROUP_CONCAT(exercise_id ORDER BY exercise_id) FROM user_exercise_stats s
--          WHERE s.user_id=u.id AND s.is_favor=1) AS tbl_favor
--   FROM users u
--  WHERE COALESCE(u.practiced_exercises,'')<>'' OR COALESCE(u.favor_exercises,'')<>'';
--     → 每个用户的 csv 列和 tbl 列必须完全相同
--
-- 3.2 反向检查: 关联表标了但 CSV 没有的行数, 必须是 0
-- SELECT COUNT(*) AS stale_rows FROM user_exercise_stats s
--   JOIN users u ON u.id = s.user_id
--  WHERE (s.is_practiced=1 AND FIND_IN_SET(s.exercise_id, COALESCE(u.practiced_exercises,''))=0)
--     OR (s.is_favor=1    AND FIND_IN_SET(s.exercise_id, COALESCE(u.favor_exercises,''))=0);
--
-- 3.3 完整性
-- SELECT COUNT(*) total_rows, SUM(is_favor) favor_rows, SUM(is_practiced) practiced_rows
--   FROM user_exercise_stats;
-- SELECT COUNT(*) AS orphan_ex FROM user_exercise_stats s
--   LEFT JOIN exercises_library l ON l.id=s.exercise_id WHERE l.id IS NULL;
-- SELECT COUNT(*) AS dup FROM (SELECT user_id,exercise_id FROM user_exercise_stats
--   GROUP BY user_id,exercise_id HAVING COUNT(*)>1) t;


-- ############################################################################
-- 回滚
--
-- 把关联表恢复成备份:
--   DELETE FROM user_exercise_stats;
--   INSERT INTO user_exercise_stats SELECT * FROM user_exercise_stats_bak_20261105;
--
-- 或者直接删表退回旧逻辑(后端探测不到表 → 自动走旧 CSV 列):
--   DROP TABLE user_exercise_stats;
-- ############################################################################
