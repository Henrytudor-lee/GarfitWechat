-- ============================================================================
-- 数据库迁移脚本  2026-11-04  (Phase 0 — 动作库归一)
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 配套文档: docs/schema_design_20261022.html  §0.5 / §4
-- 状态: 🚫 本方案已于 2026-11-04 作废 —— 用户决策"暂不动库"
--       归组关系改放进 Phase 3 的 user_exercise_stats.canonical_id 列,
--       exercises_library 一行不改。脚本保留备查, 万一日后改主意可直接用。
--       (另: 本脚本 STEP 3 的 count_mode 组内多数票对齐, 已并入 Phase 1 的说明)
--
-- ────────────────────────────────────────────────────────────────────────────
-- 本脚本目标: 给 exercises_library 加一个 canonical_id 归组标记,
--            把 993 组"同名重复"归到各自的代表行上。
--
-- 【关键: canonical_id 的语义】
--   它是"同名动作的归组",不是"同一动作的别名"。
--   同名 ≠ 同一动作 —— 所以 GROUP BY 规则必须由业务确认(见 STEP 2 三种规则)。
--   993 组里有 742 组(74.7%)的 type+equipment+body 完全一致,强烈支持"同一动作不同资源";
--   (2026-11-04 实测, 三个维度有重叠, 不能用减法推算)
--   剩下 162 组 body_part_id 不一致的才是真正需要人工看的(见 STEP 4.2)。
--
-- 【本脚本不做什么】
--   × 不删除任何行        → 954 张图 / 852 个视频一个都不会丢
--   × 不修改 exercises 表 → 1,972 条历史训练记录零影响
--   × 不改任何接口        → 前端 8 处 includes(id) 一行都不用动
--
-- 【为什么 Phase 0 必须最先做】
--   重复组名下的训练记录高度集中 (2026-11-04 实测):
--     Cable Standing Single Delt Row   113 条  (拆成 2 个 id)
--     Lever Lateral Raise              106 条  (拆成 3 个 id)
--     Lever Chest Press                 93 条  (拆成 3 个 id)
--     Pulldown                          38 条  (拆成 2 个 id)
--   → 量化: 用户练过的 101 个 exercise_id 里,
--       48 个落在重复组内, 其中 25 个"有同组兄弟"(同一动作的另一个分身)。
--       按 name 归组后 101 → 92, 即用户实际练过 92 个不同动作,
--       但当前 UI 会把这 92 个显示成 101 个, 且只有 92 个会亮 ☑。
--     这正是需求① 的实际痛点, 也是 Phase 3 关联表粒度正确的前提。
--
-- ⚠️ 执行前必做
--   1) 全量备份:
--        mysqldump -h47.108.200.98 -P3306 -ugfit -p gfit > backup_$(date +%F).sql
--   2) 确认当前结构:
--        SHOW CREATE TABLE exercises_library\G
--   3) 跑 STEP 4 的只读核对清单, 确认选用的 GROUP BY 规则
-- ============================================================================


-- ############################################################################
-- 【STEP 1】加 canonical_id 列（幂等）
--
-- 为什么用 int 而不是存 name:
--   name 是 varchar, 做 JOIN 要走字符串比较, 而且 name 还带尾随空格
--   (实测 "Crunch " / "Pull-up " 等大量带空格)。int 主键 JOIN 快且稳。
-- ############################################################################
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises_library'
     AND COLUMN_NAME = 'canonical_id'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercises_library`
     ADD COLUMN `canonical_id` int DEFAULT NULL
     COMMENT ''归组后的代表动作 id, 同名动作归组用; NULL=未归组'' AFTER `id`',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 配套索引: 归组内查询 + 支撑"按代表行取全组"
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises_library'
     AND INDEX_NAME = 'idx_lib_canonical'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE `exercises_library` ADD KEY `idx_lib_canonical` (`canonical_id`)',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ############################################################################
-- 【STEP 2】回填 canonical_id —— 三种 GROUP BY 规则, 选一条执行
--
-- ⚠️ 只能执行其中一条! 先跑 STEP 4 的核对清单再决定。
--
-- ────────────────────────────────────────────────────────────────────────────
-- 规则 A: 按 name(去空格) 归组
--   993 组 / 冗余 1,287 行 / 归一后 7,641 → 6,354
--   → 最激进。同名就是同一动作。
-- ────────────────────────────────────────────────────────────────────────────
-- 规则 C: 按 name + equipment_id + body_part_id 归组（保守, 保留变体）
--   828 组 / 冗余 1,033 行 / 归一后 7,641 → 6,608
--   → 同名但器械或部位不同 = 不同动作, 分开保留。
-- ────────────────────────────────────────────────────────────────────────────
-- 规则 D: 按 name + body_part_id 归组（忽略器械）
--   873 组 / 冗余 1,111 行 / 归一后 7,641 → 6,530
--   → 介于 A 和 C 之间。
-- ############################################################################

-- ---------- 规则 A（推荐, 若确认"同名=同一动作"）----------
-- DROP TEMPORARY TABLE IF EXISTS tmp_canon;
-- CREATE TEMPORARY TABLE tmp_canon (
--   id int NOT NULL PRIMARY KEY,
--   canon int NOT NULL
-- ) ENGINE=InnoDB;
-- INSERT INTO tmp_canon (id, canon)
-- SELECT id, MIN(id) OVER (PARTITION BY TRIM(name)) FROM exercises_library;
--
-- ---------- 规则 C（保守）----------
-- DROP TEMPORARY TABLE IF EXISTS tmp_canon;
-- CREATE TEMPORARY TABLE tmp_canon (
--   id int NOT NULL PRIMARY KEY,
--   canon int NOT NULL
-- ) ENGINE=InnoDB;
-- INSERT INTO tmp_canon (id, canon)
-- SELECT id, MIN(id) OVER (PARTITION BY TRIM(name), equipment_id, body_part_id)
--   FROM exercises_library;
--
-- ---------- 规则 D ----------
-- DROP TEMPORARY TABLE IF EXISTS tmp_canon;
-- CREATE TEMPORARY TABLE tmp_canon (
--   id int NOT NULL PRIMARY KEY,
--   canon int NOT NULL
-- ) ENGINE=InnoDB;
-- INSERT INTO tmp_canon (id, canon)
-- SELECT id, MIN(id) OVER (PARTITION BY TRIM(name), body_part_id)
--   FROM exercises_library;

-- ---------- 回填（上面三选一后执行）----------
-- UPDATE `exercises_library` e
--   JOIN tmp_canon t ON e.id = t.id
--    SET e.canonical_id = t.canon;
-- DROP TEMPORARY TABLE IF EXISTS tmp_canon;


-- ############################################################################
-- 【STEP 2b】代表行选谁?（可选, 替换上面的 MIN(id)）
--
-- 默认用 MIN(id):稳定、可重复、id 小的通常是早期导入的主条目。
--
-- 但实测 954 组内 image_name 各不相同 —— 如果代表行恰好是"没图"的那条,
-- 折叠后用户点开就是空白。所以更优的代表行选择是"资源最全":
--   image_name 非空 + video_name 非空 + 名称长度短（去掉尾随空格）
--
-- 换成"资源最全"的写法(替代上面的 INSERT):
--
-- DROP TEMPORARY TABLE IF EXISTS tmp_canon;
-- CREATE TEMPORARY TABLE tmp_canon (
--   id int NOT NULL PRIMARY KEY,
--   canon int NOT NULL
-- ) ENGINE=InnoDB;
-- INSERT INTO tmp_canon (id, canon)
-- SELECT id,
--   FIRST_VALUE(id) OVER (
--     PARTITION BY TRIM(name)
--     ORDER BY (image_name <> '' AND image_name IS NULL) ASC,
--              (video_name <> '' AND video_name IS NULL) ASC,
--              CHAR_LENGTH(TRIM(name)) ASC,
--              id ASC
--   ) AS canon
-- FROM exercises_library;
-- ############################################################################


-- ############################################################################
-- 【STEP 3】canonical 组内 count_mode 对齐（漏洞 3 的修复）
--
-- 为什么要做:
--   实测 993 组里有 32 组组内 exercise_type 不一致(3.2%)。
--   Phase 0 只做标记不合并行, 所以这 32 组在 count_mode 改名后依然各自独立 ——
--   同一组里的 "Crunch" 可能一个 weight_reps 一个 duration,
--   UI 上同一个动作出现两套行为。
--
-- 规则: 少数服从多数; 平票时取代表行(canonical)的值。
--
-- ⚠️ 依赖 STEP 2 已回填 canonical_id, 必须在其后执行。
-- ⚠️ 这一步会改写个别行的 count_mode, 执行前先跑 STEP 5 的 dry-run 看清单。
-- ############################################################################
-- -- dry-run: 先看会改哪些行
-- SELECT e.id, e.name, e.name_zh, e.canonical_id, e.exercise_type AS cur_type,
--        (SELECT e2.exercise_type FROM exercises_library e2
--          WHERE e2.canonical_id = e.canonical_id
--          GROUP BY e2.exercise_type
--          ORDER BY COUNT(*) DESC, e2.exercise_type ASC LIMIT 1) AS voted_type,
--        (SELECT COUNT(*) FROM exercises_library e3
--          WHERE e3.canonical_id = e.canonical_id) AS group_size
--   FROM exercises_library e
--   JOIN (SELECT canonical_id FROM exercises_library
--          WHERE canonical_id IS NOT NULL
--          GROUP BY canonical_id HAVING COUNT(*) > 1) g ON g.canonical_id = e.canonical_id
--  WHERE e.exercise_type <> (SELECT e2.exercise_type FROM exercises_library e2
--          WHERE e2.canonical_id = e.canonical_id
--          GROUP BY e2.exercise_type ORDER BY COUNT(*) DESC, e2.exercise_type ASC LIMIT 1);
--
-- -- 确认无误后执行(把 count_mode 改回 exercise_type, 因为 Phase 1 可能已跑)
-- UPDATE exercises_library e
--   JOIN (
--     SELECT canonical_id,
--            SUBSTRING_INDEX(GROUP_CONCAT(exercise_type ORDER BY cnt DESC, exercise_type ASC), ',', 1) AS voted
--       FROM (SELECT canonical_id, exercise_type, COUNT(*) cnt
--               FROM exercises_library WHERE canonical_id IS NOT NULL
--              GROUP BY canonical_id, exercise_type) t
--      GROUP BY canonical_id
--   ) v ON v.canonical_id = e.canonical_id
--    SET e.exercise_type = v.voted
--  WHERE e.canonical_id IS NOT NULL
--    AND e.exercise_type <> v.voted;


-- ############################################################################
-- 【STEP 4】执行前只读核对清单
-- ############################################################################
-- 4.1 各规则下的归组规模(选规则)
-- SELECT 'A: name' AS rule, COUNT(*) grp, SUM(n-1) redundant FROM (
--   SELECT TRIM(name) k, COUNT(*) n FROM exercises_library GROUP BY TRIM(name) HAVING n>1) t
-- UNION ALL
-- SELECT 'C: name+equip+body', COUNT(*), SUM(n-1) FROM (
--   SELECT TRIM(name) k, equipment_id, body_part_id, COUNT(*) n FROM exercises_library
--   GROUP BY TRIM(name), equipment_id, body_part_id HAVING n>1) t
-- UNION ALL
-- SELECT 'D: name+body', COUNT(*), SUM(n-1) FROM (
--   SELECT TRIM(name) k, body_part_id, COUNT(*) n FROM exercises_library
--   GROUP BY TRIM(name), body_part_id HAVING n>1) t;

-- 4.2 ★ 重点看这 162 组: body_part_id 不一致的, 可能是真不同动作
-- SELECT TRIM(name) k, GROUP_CONCAT(id ORDER BY id) ids,
--        GROUP_CONCAT(body_part_id) bodies, GROUP_CONCAT(exercise_type) types,
--        COUNT(DISTINCT body_part_id) db, COUNT(*) n
--   FROM exercises_library GROUP BY TRIM(name) HAVING n>1 AND db>1
--  ORDER BY n DESC LIMIT 40;

-- 4.3 组内 image/video 全为空的情况(这些组的代表行可能没资源)
-- SELECT TRIM(name) k, COUNT(*) n, GROUP_CONCAT(id ORDER BY id) ids
--   FROM exercises_library
--  WHERE TRIM(name) IN (
--    SELECT TRIM(name) FROM exercises_library GROUP BY TRIM(name) HAVING COUNT(*)>1)
--    AND COALESCE(image_name,'')='' AND COALESCE(video_name,'')=''
--  GROUP BY TRIM(name) HAVING COUNT(*) > 1 LIMIT 20;

-- 4.4 归组后, 用户的"练过"标记会命中多少个条目(收益量化)
-- SELECT COUNT(DISTINCT e.exercise_id) AS distinct_raw,
--        COUNT(DISTINCT COALESCE(el.canonical_id, e.exercise_id)) AS distinct_grouped
--   FROM exercises e LEFT JOIN exercises_library el ON el.id = e.exercise_id;


-- ############################################################################
-- 【STEP 5】执行后验证
-- ############################################################################
-- 5.1 覆盖率: 每个非空行都应该有 canonical_id, 且 canonical_id 指向存在的行
-- SELECT COUNT(*) AS total,
--        SUM(CASE WHEN canonical_id IS NULL THEN 1 ELSE 0 END) AS null_canon,
--        SUM(CASE WHEN canonical_id IS NOT NULL AND canonical_id <> id THEN 1 ELSE 0 END) AS non_representative
--   FROM exercises_library;
--
-- 5.2 孤儿检查: canonical_id 必须指向本表存在的 id
-- SELECT COUNT(*) AS orphan_canon FROM exercises_library e
--   LEFT JOIN exercises_library c ON c.id = e.canonical_id
--  WHERE e.canonical_id IS NOT NULL AND c.id IS NULL;
--
-- 5.3 归组规模
-- SELECT COUNT(*) AS groups_, SUM(n-1) AS collapsed FROM (
--   SELECT canonical_id, COUNT(*) n FROM exercises_library
--   WHERE canonical_id IS NOT NULL GROUP BY canonical_id HAVING n>1) t;
--
-- 5.4 代表行必须是该组内 id 最小的(如果用了 MIN(id) 规则)
-- SELECT COUNT(*) AS bad_rep FROM (
--   SELECT canonical_id, MIN(id) mn FROM exercises_library
--   WHERE canonical_id IS NOT NULL GROUP BY canonical_id) t
--  JOIN exercises_library e ON e.canonical_id = t.canonical_id AND e.id <> t.mn
--  WHERE e.canonical_id <> e.id;
--
-- 5.5 ★ 关键回归: 训练数据零影响
-- SELECT COUNT(*) AS exercises_total FROM exercises;              -- 应与执行前一致
-- SELECT COUNT(*) AS orphan_ex FROM exercises e
--   LEFT JOIN exercises_library l ON l.id = e.exercise_id WHERE l.id IS NULL;  -- 应为 0


-- ############################################################################
-- 回滚
--
-- ALTER TABLE `exercises_library` DROP KEY `idx_lib_canonical`,
--                                 DROP COLUMN `canonical_id`;
--
-- ⚠️ 回滚后"练过"标记会退回按原始 id 匹配(也就是当前行为), 功能不会更差,
--    只是归组收益消失。所以这个回滚是安全的、无需回滚数据。
-- ############################################################################


-- ############################################################################
-- 【备注】前端配套 (Phase 0.5) —— 决定归组后 UI 怎么呈现
--
-- 本脚本只改后端结构, UI 侧有两个选择:
--
-- (a) 列表不折叠: 13 个 "Crunch" 照旧显示, 但"练过"标记会全部命中
--     → 改动量 0, 用户体感: 标记终于对了, 但列表还是长
--
-- (b) 列表折叠: 同 canonical 的行显示成 1 条 + "N 个变体", 展开可见
--     → 需改 library 列表 + add-exercise-modal 的分组逻辑
--     → 用户体感: 列表干净了, 但加了交互复杂度
--
-- ⚠️ 关键: 无论选 (a) 还是 (b), 后端返回给前端的 practiced/favor id 集合
--    都必须**展开成原始 id**, 否则前端 8 处 includes(id) 会失配。
--    展开 SQL:
--      SELECT DISTINCT id FROM exercises_library WHERE canonical_id IN (?);
--    注意: 必须在 Phase 3 关联表上线后, 登录/筛选接口统一走这条路径。
-- ############################################################################
