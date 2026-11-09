-- ============================================================================
-- 默认资料回填脚本  2026-11-09
--
-- 目标库: gfit-backend 的 MySQL (47.108.200.98:3306 / gfit)
-- 状态: ⬜ 待执行
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【为什么需要】
--
--   2026-11-09: 小程序原来新用户首次进入会弹 welcome-modal, 强制收集
--   姓名/头像/身高/体重/生日/性别/运动目的 → 微信小程序审核不通过。
--   改成: 首次进入直接给一套默认基础信息, 用户之后自己去 profile 页改。
--
--   users 表本来就有 DEFAULT:
--     height   double DEFAULT 170
--     weight   double DEFAULT 60
--     purpose  tinyint DEFAULT 1
--   但 DEFAULT 只在"INSERT 时这一列没被显式赋值"才生效 ——
--   后端 INSERT 如果显式传了 NULL, 或者这一列是后来才加的(老用户),
--   库里就会留下 NULL。
--
--   前端已经能兜住(NULL → 170/60), 但后端落库统计、卡路里计算拿到的
--   是 NULL 而不是一份基线值。这里把历史 NULL 补成默认值, 让库里干净。
--
-- ────────────────────────────────────────────────────────────────────────────
-- 【本脚本做什么】
--
--   只动 users 表的 3 个列: height / weight / purpose
--   · 只补 NULL 的行, 已经有值的用户一个都不碰
--   · 幂等, 可重复执行
--   · users 之外的表完全不动
--
-- ⚠️ 执行前必做
--   CREATE TABLE users_bak_20261109 AS SELECT id, height, weight, purpose FROM users;
-- ============================================================================


-- ############################################################################
-- 【STEP 1】执行前先看清楚要改多少行
-- ############################################################################
-- SELECT COUNT(*) AS null_height FROM users WHERE height IS NULL;
-- SELECT COUNT(*) AS null_weight FROM users WHERE weight IS NULL;
-- SELECT COUNT(*) AS null_purpose FROM users WHERE purpose IS NULL;
-- SELECT id, _openid, name, height, weight, purpose FROM users
--  WHERE height IS NULL OR weight IS NULL OR purpose IS NULL;
-- ############################################################################


-- ############################################################################
-- 【STEP 2】回填默认值
-- ############################################################################
UPDATE `users` SET `height`  = 170 WHERE `height`  IS NULL;
UPDATE `users` SET `weight`  = 60  WHERE `weight`  IS NULL;
UPDATE `users` SET `purpose` = 1   WHERE `purpose` IS NULL;


-- ############################################################################
-- 【STEP 3】验证
-- ############################################################################
-- 3.1 ★ 三列都不该再有 NULL
-- SELECT COUNT(*) AS should_be_zero FROM users
--  WHERE height IS NULL OR weight IS NULL OR purpose IS NULL;
--     → 期望 0
--
-- 3.2 异常值体检(应该都是空 —— 真有超出区间的用户, 说明不是 NULL 造成的, 人工看)
-- SELECT id, _openid, name, height, weight FROM users
--  WHERE height < 50 OR height > 250 OR weight < 20 OR weight > 300;
--
-- 3.3 改动量核对: 只应该动到 NULL 的行
-- SELECT COUNT(*) AS changed FROM users u
--   JOIN users_bak_20261109 b ON b.id = u.id
--  WHERE NOT (u.height <=> b.height) OR NOT (u.weight <=> b.weight)
--     OR NOT (u.purpose <=> b.purpose);
-- ############################################################################


-- ############################################################################
-- 回滚
--
-- UPDATE users u
--   JOIN users_bak_20261109 b ON b.id = u.id
--    SET u.height  = b.height,
--        u.weight  = b.weight,
--        u.purpose = b.purpose
--  WHERE NOT (u.height <=> b.height) OR NOT (u.weight <=> b.weight)
--     OR NOT (u.purpose <=> b.purpose);
-- ############################################################################
