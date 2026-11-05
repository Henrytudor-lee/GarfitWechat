-- ============================================================================
-- 数据库迁移脚本  2026-11-04  (Phase 3 — 需求① 用户 × 动作 关联表)  [v2]
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 配套文档: docs/schema_design_20261022.html  §2
-- 状态: ⬜ 未执行
--
-- 【v3 瘦身】2026-11-04 用户质疑"数据库改动怎么会这么大":
--   去掉 4 个派生统计列(practice_count / last_practiced_at / best_weight / best_reps)。
--   理由: 全部能从 exercises 明细实时聚合, 冗余存一份 = 双份事实来源 + 同步问题。
--   这张表的职责就一件事: 回答"哪些动作被收藏/练过"。
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【v2 重大修正】2026-11-04 用户质疑: "动作库名字重复又如何呢?id唯一不就可以了么"
--
--   v1 方案里我给关联表加了一列 canonical_id, 把同名动作"归组",
--   理由是"用户练了 101 个 id 但实际只练过 92 个动作, 标记会不亮"。
--   → 实测证明这个理由站不住:
--
--     · "Lever Chest Press" 3 个 id(204/205/3516)共 93 条训练记录,
--       分布在 24 场不同的 session 里 —— 是"24 场训练分别选了 3 个条目",
--       不是"一次训练被切碎"。用户在不同变体之间切换, 标记只亮选过的那个,
--       完全正确, 不是 bug。
--     · 整个库 212 场训练里, 同一个 session 内出现同名多 id 的只有 **4 场(1.9%)**,
--       且那 4 场用户可能是真要练两个变体。
--     · 993 组同名条目: 图片全为空的 0 组, 视频全为 NULL 的 0 组,
--       954 组各有多个不同图片 —— 每条都是独立、有自己资源的动作条目。
--
--   → 结论: **id 唯一就够了, 名字重复不是数据模型问题。**
--     同名不同 id 是合法数据(不同握法/角度/器械的变体),
--     强行归组反而会误标 —— 用户练了 3 个变体, 不该把 13 个全标成"练过"。
--
--   → v2 去掉 canonical_id, 关联表回归最简形态:
--       exercise_id 就是 exercises_library.id, 一个动作一条记录,
--       标记 = "练了哪条就哪条亮", 语义精确, 无任何假设。
--
--   名字重复真正留下的问题(与本表无关, 单独处理):
--     · 列表可读性: 11 个"引体向上"(name_zh 相同, name 不同) → UI 补英文名
--     · 翻译错位: id=2081 name_zh='引体向上' 但 name='Mountain Climber' → 人工核对
--
-- ⚠️ 执行前必做
--   1) 全量备份:
--        mysqldump -h47.108.200.98 -P3306 -ugfit -p gfit > backup_$(date +%F).sql
--   2) 确认 Phase 1 已执行(本脚本不依赖 count_mode, 但建议先跑 Phase 1)
--   3) 确认线上无残留云函数在连同一个库
-- ============================================================================


-- ############################################################################
-- 【STEP 1】建表
--
-- 设计要点:
--   · PK (user_id, exercise_id) —— 一个动作一行, 天然幂等
--     (ON DUPLICATE KEY UPDATE 一次搞定 toggle)
--   · exercise_id 直接用 exercises_library.id, 不做任何归组/映射
--   · is_favor / is_practiced 合并 —— 粒度相同(user × exercise), 不拆表
--   · 纯关系表, 不存派生数据 —— 这张表只回答"哪些动作被收藏/练过"
--     "练过几次"(COUNT) / "最近什么时候"(MAX create_time) / "最佳重量"(MAX)
--     全部能从 exercises 明细表实时聚合出来, 不必冗余存一份。
--     存派生数据会造成双份事实来源 + 同步问题(加一组 set 还得同步更新 best_weight)。
--   · FK user_id → users(id) ON DELETE CASCADE —— 删用户自动清理
-- ############################################################################
CREATE TABLE IF NOT EXISTS `user_exercise_stats` (
  `user_id`      int NOT NULL,
  `exercise_id`  int NOT NULL COMMENT '动作 id (exercises_library.id), 不做归组',
  `is_favor`     tinyint NOT NULL DEFAULT 0 COMMENT '是否收藏',
  `is_practiced` tinyint NOT NULL DEFAULT 0 COMMENT '是否练过(至少一次)',
  `create_time`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `exercise_id`),
  KEY `idx_ues_exercise` (`exercise_id`),
  CONSTRAINT `fk_ues_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ############################################################################
-- 【STEP 2】回填 —— 从 users 的两个 CSV 列拆段灌进关联表
--
-- ⚠️⚠️ 这两步是**必须执行**的! 只建表不回填, 关联表会是 0 行 ——
--   那样后端虽然探测到"新表存在", 但读出来是空的, 会导致
--   所有用户的收藏/练过标记全部消失!
--   (2026-11-04 就发生过一次: 表建好了但回填没跑, 关联表 0 行)
--   执行完请务必跑 STEP 3 的验证, 确认回填行数 > 0。
--
-- ⚠️ 段提取必须用"前后补逗号"的标准写法:
--      SUBSTRING_INDEX(SUBSTRING_INDEX(CONCAT(',', str, ','), ',', n), ',', -1)
--    踩过的坑 1: 直接用 SUBSTRING_INDEX(str, n, 1) 取第 n 段会**偏移一位**
--      (SUBSTRING_INDEX 的 n 表示"第 n 个分隔符之前"), 导致段错位。
--      2026-11-04 初版就是踩了这个坑, 算出 72 个假悬空 id, 实际是 0。
--    踩过的坑 2: 补了逗号之后, 第 n 段要用 SUBSTRING_INDEX(..., n + 1) 而不是 n。
--      SUBSTRING_INDEX 的 n 表示"第 n 个分隔符之前", 所以 ',27819,' 取第 1 段
--      要用 n=2 才会得到 '27819'。写成 n 的话:
--        · 多段 CSV → **最后一段永远丢失**(n=1 取空, n=2 起才对应第 1 段)
--        · 单段 CSV(无逗号)→ **整条丢失**(只有 n=1, 取到空串)
--      实测影响: user2 的 '27819'、user4 的 '3715'、user1 的 '2052' 全部丢失。
--      → 用 n + 1, 且条件保持 n <= 1 + 逗号数(= 段数)。
--    踩过的坑 3: n=1 取到的是**空串**, CAST('' AS UNSIGNED) 在严格模式下直接报
--      "Truncated incorrect INTEGER value: ''" —— 整个 INSERT 失败。
--      → 必须包一层 NULLIF(..., '') 让空串变 NULL, 再由 WHERE ex_id > 0 过滤掉。
--    坑 2 和坑 3 都是 2026-11-04 用临时表实跑脚本时抓出来的 —— 只靠肉眼看 SQL 发现不了。
--
-- 数字表用递归 CTE 生成 1..100 (实测线上最长 43 段, 留足余量)
--
-- ⚠️ 不需要 SET SESSION cte_max_recursion_depth —— MySQL 默认就是 1000,
--    而这里只递归到 100。2026-11-04 实测: 有这句时, 部分客户端会把它和
--    下一条 INSERT 拼成一条语句执行, 直接报 ER_PARSE_ERROR。
-- ############################################################################

-- ---- 2a. 收藏 (favor_exercises) ----
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

-- ---- 2b. 练过 (practiced_exercises) ----
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
-- 【STEP 3】回填结果验证
-- ############################################################################
-- 3.1 ★ 核心: 关联表的 (user, id) 组合必须和原 CSV 完全一致
--     期望: 每一行的 exercise_id 都能在原 CSV 里找到, 反之亦然
-- SELECT COUNT(*) AS rows_ FROM user_exercise_stats;

-- 3.2 逐用户比对(去重后的 id 集合必须完全相等)
-- SELECT u.id,
--        u.favor_exercises,
--        (SELECT GROUP_CONCAT(exercise_id ORDER BY exercise_id)
--           FROM user_exercise_stats s WHERE s.user_id=u.id AND s.is_favor=1) AS tbl_favor,
--        u.practiced_exercises,
--        (SELECT GROUP_CONCAT(exercise_id ORDER BY exercise_id)
--           FROM user_exercise_stats s WHERE s.user_id=u.id AND s.is_practiced=1) AS tbl_practiced
--   FROM users u WHERE COALESCE(u.practiced_exercises,'')<>'' OR COALESCE(u.favor_exercises,'')<>'';

-- 3.2b ★★★ 最重要的一条: 回填行数必须 > 0
-- SELECT COUNT(*) AS backfilled_rows FROM user_exercise_stats;
--     若为 0 → 回填没执行成功, 回填 STEP 2 再跑一遍
--     期望值(2026-11-04 实测): 52 行 (favor 16 + practiced 46, 3 个用户)
--
-- 3.3 孤儿检查: exercise_id 必须存在于 exercises_library
-- SELECT COUNT(*) AS bad_ex FROM user_exercise_stats s
--   LEFT JOIN exercises_library l ON l.id = s.exercise_id WHERE l.id IS NULL;

-- 3.4 收益: 关联表比 CSV 多存了什么
-- SELECT COUNT(*) AS total_rows,
--        SUM(is_favor) AS favor_rows, SUM(is_practiced) AS practiced_rows,
--        COUNT(DISTINCT user_id) AS users
--   FROM user_exercise_stats;


-- ############################################################################
-- 【STEP 4】后端切读要用到的 SQL（供 gfit-backend 实现参考）
--
-- ✅ 核心好处: 返回给前端的 id 集合**就是原始 id**,
--    前端 8 处 includes(id) / includes(exercise_id) 一行都不用改。
--    关联表没有 canonical_id 这一层间接, 语义直通。
-- ############################################################################

-- 4.1 登录时返回 favor_exercises / practiced_exercises（格式与现在完全一致）
-- SELECT exercise_id FROM user_exercise_stats WHERE user_id = ? AND is_favor = 1;
-- SELECT exercise_id FROM user_exercise_stats WHERE user_id = ? AND is_practiced = 1;

-- 4.2 ★ library.list 的 isFavor / isPracticed 筛选
--     —— 后端自己 JOIN, 不再依赖前端回传 id 数组
--     —— 用 EXISTS 而不是 JOIN, 避免重复行
--
-- isPracticed = true:
--   SELECT l.* FROM exercises_library l
--    WHERE EXISTS (
--      SELECT 1 FROM user_exercise_stats s
--       WHERE s.user_id = ? AND s.exercise_id = l.id AND s.is_practiced = 1)
--
-- isFavor = true: 把 s.is_practiced 换成 s.is_favor

-- 4.3 toggle 收藏 / 标记练过（幂等 upsert）
--
-- 标记练过:
-- INSERT INTO user_exercise_stats (user_id, exercise_id, is_practiced, practice_count)
-- VALUES (?, ?, 1, 1)
-- ON DUPLICATE KEY UPDATE
--   is_practiced = 1,
--   practice_count = practice_count + 1,
--   last_practiced_at = NOW();
--
-- 取消标记练过:
-- UPDATE user_exercise_stats SET is_practiced = 0 WHERE user_id = ? AND exercise_id = ?;
--
-- 收藏 / 取消收藏 同理, 换 is_favor。


-- ############################################################################
-- 【STEP 5】双写期与切读（分 3 步, 每步可独立回滚）
--
-- 5.1 灰度期（本脚本执行后 ~2 周）:
--     后端 toggle 时**同时**写关联表和旧 CSV 列, 读仍走旧列。
--     好处: 出问题立刻回滚, 数据不丢。
--
-- 5.2 切读:
--     读路径改成关联表(4.1 / 4.2), 写路径保持双写。
--     此时前端**零改动** —— 返回的仍是原始 id 数组, 语义直通。
--
-- 5.3 停双写 + 删旧列:
--     ALTER TABLE users DROP COLUMN favor_exercises, DROP COLUMN practiced_exercises;
--     ⚠️ 删列前必须确认线上稳定运行 ≥ 1 个版本, 且旧 CSV 数据与关联表逐用户一致
--     (用 STEP 3.2 的比对 SQL 跑一遍, 结果必须完全相同)。
-- ############################################################################


-- ############################################################################
-- 回滚
--
-- 立即回滚（关联表是新增的，删掉即可，users 旧列未动）:
--   DROP TABLE IF EXISTS user_exercise_stats;
--
-- 回滚后状态 = 执行本脚本之前，零损失。
-- ############################################################################


-- ############################################################################
-- 【附】名字重复真正要解决的问题（与本表无关）
--
-- 1) 列表可读性 —— 702 组中文名重复(如 11 个"引体向上", 英文名分别是
--    Chin-ups / Pull up / Chin-Up / Muscle-up ...)。
--    数据上每个 id 都有独立图片(993 组里 0 组图片为空), 用户能靠图区分,
--    但只显示中文名时看着重复。→ UI 层补英文名副标题即可, 不动数据。
--
-- 2) 翻译错位 —— id=2081 name_zh='引体向上' 但 name='Mountain Climber';
--    id=2077 name_zh='混合握距引体向上' 但 name='Middle Back Stretch'。
--    中文名是后加的, 中间错位了。→ 人工核对 name_zh ↔ name 的对应关系。
--
-- ⚠️ 这两项都不要用"归组"来解决 —— 归组会误标, 且会掩盖数据问题。
-- ############################################################################
