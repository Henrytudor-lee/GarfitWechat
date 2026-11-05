-- ============================================================================
-- 数据库迁移脚本  2026-11-04  (Phase 1 — 需求② 计时字段)  [v2 瘦身版]
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 配套文档: docs/schema_design_20261022.html  §3
-- 状态: ⬜ 未执行
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【v2 瘦身】2026-11-04 用户质疑: "数据库改动怎么会这么大?
--             不是只需要 exercises 表新增 duration 等字段就可以了么"
--
--   → 质疑成立。v1 里塞进了三样用户没要求的东西, 现在全部去掉:
--
--     ✂ 改名 exercise_type → count_mode
--        用户从没要求改名。它带来的连锁成本:后端 2 个 service 各 ~30 行列探测、
--        前端 normalizeCountMode 兼容两套字段名、值域回填脚本、文档大改。
--        收益只是"名字更自解释" —— 不足以支撑这个成本。
--        → 不改。exercises_library 一个字节都不动。
--
--     ✂ 值域回填 (把 'Strength'/'Time' 等映射成规范值)
--        线上实测: 需要回填的行数 = 0 (exercise_type 只有 weight_reps/duration/
--        distance_duration 三个值, 'Strength' 是列默认值但 0 行使用)。
--        → 纯多余, 整个步骤删掉。
--
--     ✂ distance_m 字段
--        用户只提了"平板支撑计时, 引体向上计数"。distance_duration 那 61 条
--        (跑步/划船/椭圆机) 需要"距离+时长"两个维度, 但距离的录入交互还没定
--        (单位 m 还是 km、要不要算配速)。用户没要求, 不擅自加。
--        → 留成下方注释掉的 OPTIONAL 段, 等方案定了再开。
--
--   【本脚本实际改了什么】库结构改动 = 1 列
--     ALTER TABLE exercises ADD COLUMN duration_sec int DEFAULT NULL ...
--
--   为什么只需要这 1 列:
--     · exercises_library.exercise_type —— 已经存在, 而且已经有真实数据
--       (weight_reps 6522 / duration 1058 / distance_duration 61),
--       标注也是对的(平板支撑=duration, 引体向上=weight_reps)。不用加。
--     · exercises.duration_sec —— 真正缺的: 计时动作的秒数没地方存,
--       现在被硬塞进 reps(实测 27 条 duration 记录 reps 值是 1~10, 不是秒数)。
--     · 改完这一列, 前端按 exercise_type 分支显示/录入即可, 后端读写两个字段。
--
-- ⚠️ 执行前必做
--   1) 全量备份:
--        mysqldump -h47.108.200.98 -P3306 -ugfit -p gfit > backup_$(date +%F).sql
--   2) 确认当前结构:
--        SHOW CREATE TABLE exercises\G
-- ============================================================================


-- ############################################################################
-- 【STEP 1】加 duration_sec 列（幂等）
--
-- 为什么 DEFAULT NULL 而不是 NOT NULL DEFAULT 0:
--   NULL = 该动作不适用计时维度; 0 = 适用但值为 0。语义明确不混淆。
--   也避免给 1,972 行历史数据批量写 0, 以及统计时把 NULL 当 0 算。
-- ############################################################################
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'duration_sec'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercises`
     ADD COLUMN `duration_sec` int DEFAULT NULL COMMENT ''计时动作持续秒数'' AFTER `reps`',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ############################################################################
-- 【STEP 1b】distance_km —— 距离录入(2026-11-04 用户拍板)
--
-- 用户原话:"距离录入方案就只录入距离就行了"
--   → 不做配速、不做"配速+时长反推距离", 距离就是一个独立输入框。
--   → 时长仍然用 set-timer 录, 但**可选** —— 只填距离也能提交。
--
-- 单位为什么是 km (2026-11-04 实测 distance_duration 全部 61 行 / 47 个中文名):
--     跑步 3 / 快走 2 / 步行 2 / 行走 2 / 长跑 / 突击跑 / 短步跑步 / 冲刺
--     跑步机 4 / 固定自行车 4 / 户外骑自行车 / 划船 2 / 椭圆机 4
--     踏步机 2 / 登山者 4 / 跳绳 2 / 波比跳类 2 / 壶铃抱瓶原地行进
--   → 全是公里级有氧, 只有"冲刺"是米级(用 km 表达为 0.1)。
--   → 字段名直接带单位: distance_km, 避免"存的是 m 还是 km"的歧义。
--
-- ⚠️ 库里的字段名和单位绑定, 以后要改单位得 ALTER + 数据换算 —— 所以这里一次定死。
-- ############################################################################
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'distance_km'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `exercises`
     ADD COLUMN `distance_km` float DEFAULT NULL COMMENT ''距离动作公里数 (km)'' AFTER `duration_sec`',
  'DO 0'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


-- ############################################################################
-- 【STEP 2】历史数据 —— 不回填, 而且**根本不需要回填**
--
-- 2026-11-04 复核(初版误以为"有 27 条历史计时记录要补秒数", 实测后整个删掉这一步):
--
--   推导链: exercise_type='duration' 的动作 1058 个
--            → 其中被训练过的 6 个
--            → 这 6 个动作在 exercises 表里的 27 条训练记录
--
--   但这 27 条的形态是:
--     reps>0 且 weight>0 的: 24 条   ← 负重次数训练, 不是计时记录!
--     只有 reps 的:         1 条
--     全 0 的:              2 条
--   对照组 weight_reps 全部 1945 条: reps+weight 1755 / 只有 reps 190 / 全 0 0
--
--   → 形态几乎一样, 说明这 24 条**本来就不是计时记录**, 是动作库的
--     exercise_type 标注错了:
--       · "1 2 棒训练" 21 条(reps 恒 10, weight 10~40lb) = 1-2-3 负重训练体系
--       · "侧步杰克拳击" weight=11kg / "反向箭步蹲" weight=10kg reps=8
--         "后撤腿击球" weight=10kg reps=8  —— 都带负重
--   → 只有 3 条像真计时: 仰卧小腿拉伸 ×2(全 0)、平板支撑 ×1(reps=1)
--
--   秒数**从来没有被采集过**(字段不存在), 所以没有"丢失的秒数"要补。
--   把 reps 写进 duration_sec 等于把"10 次负重"固化成"10 秒"。
--
-- ⚠️ 真正要处理的是动作库的标注, 见文末【标注核对清单】。
--    那是**另一件事**(改 exercises_library.exercise_type), 不要混在
--    exercises 表的字段迁移里做。
-- ############################################################################


-- ############################################################################
-- 执行后验证
-- ############################################################################
-- 1) 结构确认
-- SHOW CREATE TABLE exercises\G
--
-- 2) 新列就位
-- SELECT COUNT(*) AS rows_total,
--        SUM(CASE WHEN duration_sec IS NOT NULL THEN 1 ELSE 0 END) AS has_duration,
--        SUM(CASE WHEN distance_km IS NOT NULL THEN 1 ELSE 0 END) AS has_distance
--   FROM exercises;
--
-- 3) 关键回归 —— 原有统计查询不受影响
-- EXPLAIN SELECT * FROM exercises WHERE _openid = 'xxx' AND session_id = 1\G
-- EXPLAIN SELECT SUM(reps) FROM exercises e JOIN sessions s ON s.id = e.session_id
--   WHERE e._openid = 'xxx' AND s.status = 'finished'\G
--
-- 4) 确认没把"次数"语义改坏(权重类动作 reps 分布应保持不变)
-- SELECT l.exercise_type, COUNT(*) n, MIN(e.reps) mn, MAX(e.reps) mx
--   FROM exercises e JOIN exercises_library l ON l.id = e.exercise_id
--  GROUP BY l.exercise_type;


-- ############################################################################
-- 【标注核对清单】—— 另一件事, 需要单独做 (改 exercises_library.exercise_type)
--
-- 为什么必须处理: 新功能上线后, 前端按 exercise_type 决定走"计时器"还是"次数输入"。
--   标注错了, 用户加"深蹲"会弹出计时器, 加"平板支撑"却只给次数框。
--   这是功能正确性问题, 优先级**高于**字段迁移。
--
-- 实测规模 (2026-11-04):
--
--   A) 同类动作混标 —— 702 组中文名重复里有 30 组 duration 与 weight_reps 混标:
--        引体向上 13 个 id  → 12 weight_reps + 1 duration  (id=2081 翻译错位)
--        弹力带拉伸 5 个     → 4 + 1
--        下犬式 4 个         → 2 + 2
--        侧平板 4 个         → 3 duration + 1 weight_reps   (侧平板该是 duration)
--        桥式 4 个           → 1 + 3
--        脊柱拉伸 4 个       → 1 + 3
--      ... 共 30 组, 完整清单用下面的 SQL 导出。
--
--   B) duration 类里明显该是 weight_reps 的(按名称关键词):
--        Squat/蹲 65 + Push/Press/推/举 45 + Row/划船 14 + Curl/弯举 14
--        + Drill/棒训练 11 = 约 149 个
--      合理保留 duration 的: Stretch/拉伸 224 + Plank/平板 52 + Jack/Jump/开合 91
--
-- 核对用的只读 SQL (导出清单, 人工过一遍再改):
--
--   -- A) 混标组
--   SELECT TRIM(name_zh) zh, COUNT(*) n,
--          GROUP_CONCAT(CONCAT(id,':',exercise_type) ORDER BY id) detail
--     FROM exercises_library
--    WHERE name_zh IS NOT NULL AND TRIM(name_zh)<>''
--    GROUP BY TRIM(name_zh) HAVING n>1
--      AND SUM(exercise_type='duration')>0 AND SUM(exercise_type='weight_reps')>0
--    ORDER BY n DESC;
--
--   -- B) 关键词可疑(负重类动作被标成 duration)
--   SELECT id, name_zh, name, exercise_type, equipment_id, body_part_id
--     FROM exercises_library
--    WHERE exercise_type='duration'
--      AND (name LIKE '%Press%' OR name LIKE '%Squat%' OR name LIKE '%Row%'
--           OR name LIKE '%Curl%' OR name LIKE '%Drill%' OR name_zh LIKE '%蹲%'
--           OR name_zh LIKE '%推%' OR name_zh LIKE '%划船%' OR name_zh LIKE '%弯举%')
--    ORDER BY name_zh, id;
--
-- 改法(逐条人工确认后执行, 别整组刷):
--   UPDATE exercises_library SET exercise_type='weight_reps' WHERE id = 1234;
--
-- ⚠️ 注意: 这会改变这批动作在 UI 上的录入方式。
--    已有训练记录不受影响(exercises 表的 reps/weight 本来就记着真实数据)。
-- ############################################################################


-- ############################################################################
-- 回滚
--
-- ALTER TABLE `exercises` DROP COLUMN `duration_sec`, DROP COLUMN `distance_km`;
--
-- ⚠️ 回滚后前端必须同步回退(duration 类动作退回按 reps 显示), 前后端一起回滚。
--    库层面零数据损失 —— 这一列是新加的, 删掉即回到执行前状态。
-- ############################################################################
