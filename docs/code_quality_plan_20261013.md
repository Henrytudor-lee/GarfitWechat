# 代码质量优化方案与待办清单

- 生成日期：2026-10-13
- 范围：`fitness_wechat`（小程序前端）+ `gfit-backend`（NestJS 后端，只读审查）
- 配套：`db_migration_20261013.sql`（数据库 DDL，由人工执行）

---

## 一、本次已完成（2026-10-13 批次）

| # | 项目 | 状态 |
|---|---|---|
| 1 | 删除死代码 `cloudfunctions/`（936 行），清理 `project.config.json` | ✅ |
| 2 | library 页筛选竞态导致列表静默空白 | ✅ |
| 3 | 4 处 `showLoading` 无 `try/finally` 导致 mask 卡死 | ✅ |
| 4 | 头像上传"假成功"toast | ✅ |
| 5 | openid 就绪机制重构 + 切后台回来空白（**核心 bug**） | ✅ |
| 7/8 | timer 等非渲染数据移出 `data`，降为实例属性 | ✅ |
| 9 | `stats.summary` 无分页 | ⏸️ 用户决定暂缓 |

---

## 二、#5 根因分析与修复说明（重点）

### 现象

切换到其他应用再切回微信，打开小程序一片空白，看不到刚才的数据。

### 根因（三个缺陷叠加，缺一不可）

**缺陷 1：`_loadData` 从不回写 global**

`pages/index/index.js` 的 `_loadData()` 只 `setData` 到页面本地，从不写
`app.globalData.runningSession`。于是全局和本地长期脱节：
全局永远是 `undefined`，本地却持有一个正在进行的 session。

**缺陷 2：`_syncRunningSessionFromGlobal` 把"全局为空"误判为"外部结束了 session"**

原逻辑：

```js
if (gId === lId) return;
if (g) { /* 加载 */ } else { /* 清空 UI + 停表 */ }   // ← 问题在这
```

当 `gId = null`（全局空）、`lId = 123`（本地有）时，落到 `else` 分支，
**无条件清空 `exerciseGroups` 并停掉计时器**。

**缺陷 3：`_dataLoaded` 是个假标记，且挡住了唯一的补救路径**

```js
onLoad() { this.setData({ _dataLoaded: true, ... }); }  // ← 立刻置 true，语义是假的
onShow()  { ...
            this._syncRunningSessionFromGlobal();          // 先清空 UI
            if (this.data._dataLoaded) return;            // 再直接 return，不重新加载
          }
```

### 完整触发链路

```
冷启动（本地有进行中的 session #123）
  1. onLoad  → _dataLoaded = true，_loadData() 异步开始
  2. onShow  → 此时 load 未完成，本地/全局都是空 → 无操作
  3. load 完成 → 本地 = session #123，界面正常，全局仍是 undefined
  4. 用户切到其他应用
  5. 用户切回微信 → 只触发 onShow（onLoad 不会重跑）
       → _syncRunningSessionFromGlobal：全局空 / 本地有 → 清空 UI + 停表
       → _dataLoaded 为 true → 直接 return，不重新加载
       → ★ 一片空白 ★
```

### 修复方案（双层防护）

**第一层 —— 消除状态脱节**

- `_loadData()` 在拿到 session 后调用 `app.setRunningSession(session)` 回写全局
- `app.setRunningSession()` 成为写入全局 session 的唯一入口（含
  `ensureRunningSession` / `loadRunningSession` / `stopWorkout` 全部改为走它）

**第二层 —— 修正同步语义 + 允许刷新**

- `_syncRunningSessionFromGlobal()` 的 `else` 分支改为**非破坏性**：
  全局空而本地有时，把本地状态回写全局，而不是清空 UI
- 新增 `onHide()` 标记 `_wasHidden`；`onShow` 检测到该标记就强制重新拉数据
- `_dataLoaded` 移出 `data`（改为实例属性 `_dataLoaded`），且**只在 `_loadData`
  真正成功后**才置 true

**第三层 —— 用 Promise 取代轮询**

`app.js` 新增 `whenAuthReady(timeoutMs)`，复用 `onLaunch` 里早已存在却从无人使用的
`globalData.loginPromise`，带 15s 超时兜底。删掉了 `onLoad` 和 `onShow` 中两份
不可取消的 `setTimeout` 轮询，统一走 `_bootstrap()` 单一入口。

### 修复后行为推演

| 场景 | 结果 |
|---|---|
| 切后台再切回 | 全局已同步 → `_syncRunningSessionFromGlobal` 直接 return；`_wasHidden` 触发重新拉取 ✅ |
| 切 tab（reLaunch，页面重建） | onLoad 重新走 `_bootstrap()` ✅ |
| 别的页面点 orb 创建 session | 全局有值且与本地不同 → 从全局加载 ✅ |
| 正常结束训练 | `stopWorkout` 同时清全局和本地 → 两边一致 ✅ |
| 登录失败 / 超时 | `_bootstrap` 记录空态并告警，不再伪装成"没有训练数据" ✅ |

### 顺带修掉的隐藏依赖

`_initCalendar()` 原先**无条件**调用 `_loadCalendarMonth()`，冷启动未登录时会发出
注定 401 的请求。旧代码靠"在 openid 就绪后再重复调用一次 `_initCalendar`"意外兜住。
轮询删除后补上了显式守卫 + 错误捕获。

---

## 三、数据库变更方案（v2 — 按真实数据量重新标级）

> **2026-10-21 更新**：初版把 8 个 STEP 都列为"建议执行"，属于未量数据量就开方案。
> 拿到真实规模后重新评估：**真正必要的只有 2 项**，其余降级为"带触发条件的待办"。
>
> **2026-10-22 更新**：已直连生产库（47.108.200.98/gfit）实测并执行。
> 实际行数比 dump 估算大得多，**索引结论因此调整**。执行结果见下。

### ✅ 执行结果（2026-10-22，已落地生产库）

| 变更 | 状态 | 实测收益（EXPLAIN ANALYZE 服务端耗时，7 次中位） |
|---|---|---|
| `users._openid` 收窄 varchar(64) + UNIQUE | ✅ 已执行 | 登录路径 0.018ms → **0.000ms**（`type=ALL` → `type=const`） |
| `users.favor/practiced` 扩容 varchar(255)→1000 | ✅ 已执行 | 消除 `ER_DATA_TOO_LONG` 风险（迁移前 practiced 已达 253/255） |
| 4 张表 utf8mb3 → utf8mb4 | ✅ 已执行 | emoji 写入从报错 → 正常（往返实测 4 字节完整保留） |
| `exercises_library` 覆盖索引 `(name_zh, id)` | ✅ 已执行 | library 首页 2.880ms → **0.086ms（33x）**，深翻页无回归 |
| `sessions` / `exercises` 索引 | ⏸️ 未做 | 实测 0.138ms / 0.722ms，加了无收益 |
| `status` 默认值 / CSV→关联表 / media_files 表 | ⏸️ 未做 | 见下方待办 |

**独立验证结果**：

- 行数零变化：users 36 / sessions 207 / exercises 1746 / exercises_library 7641
- users **逐字段比对差异 = 0**（351 个字段全等）
- UNIQUE 约束实测生效：重复 openid 插入被拒 `ER_DUP_ENTRY ... for key 'users.uk_users_openid'`
- emoji 写入实测成功（事务内回滚验证）
- 零残留：无测试行、无临时索引、无临时表

**备份与恢复**：`/Volumes/world/program/.gfit-db-backup-20261022/`
（含全量 JSON 快照 + `restore_all.sql`，恢复脚本已做往返实测：351 字段零差异）

### 实测数据量（直连生产库，非 dump 估算）

| 表 | dump 估算 | **实测** | 差异 |
|---|---|---|---|
| `users` | ≈ 11 | **36** | 3x |
| `sessions` | ≈ 92 | **207** | 2x |
| `exercises` | ≈ 66 | **1746** | **26x** |
| `exercises_library` | 800–1500 | **7641** | **5–9x** |

> ⚠️ **`db/*.sql` 里的 `AUTO_INCREMENT` 是 2026-05/06 的旧快照，严重过时**
> （它显示 exercises 只有 66 行，实际 1746）。评估性能前必须先查真实行数。

### 为什么索引结论调整了

`exercises_library` 实测 7641 行 —— 远超我原设的 1000 行触发线。它的
`library.list` 是 `ORDER BY name_zh ASC LIMIT ? OFFSET ?`，无索引则每翻一页
filesort 整表。

严格基准（7 次取中位数，排除网络延迟）：

| 查询 | 无索引 | 加 `idx(name_zh, id)` |
|---|---|---|
| 首页 OFFSET 0 | 2.880 ms | **0.084 ms（34x）** |
| 深翻页 OFFSET 180 | 2.260 ms | 2.140 ms（无变化） |
| 深翻页 OFFSET 1000 | 2.310 ms | 2.280 ms（无变化） |

深翻页无变化是因为 MySQL 主动不选索引（filesort 更便宜）——**没有变慢**。

`sessions` / `exercises` 仍不建索引：实测 0.138ms / 0.722ms，加了看不出差别。

### 触发条件（到点再做，别提前）

| 表 | 触发条件 | 当前 |
|---|---|---|
| `sessions` | `COUNT(*) > 5000` | 207 |
| `exercises` | `COUNT(*) > 20000` | 1746 |

### 仍未做的部分

- **STEP 6** `status` 默认值 —— 代码总显式写值，纯洁癖
- **STEP 7** CSV→关联表 —— 容量已扩到 1000，暂不急；建议先在
  `toggleFavorite` 加长度校验兜底
- **STEP 8** 上传归属 —— 建议用 objectName 前缀方案免建表



---

## 四、后端待办（gfit-backend，本次未改动任何代码）

### P0 — 安全，建议尽快处理

| 问题 | 位置 | 说明 |
|---|---|---|
| `exercises.list` 越权读取 | `exercises.service.ts:43-51` | 形参 `_openid` 声明了但函数体一次没用，SQL 只按 `session_id` 过滤。任意登录用户遍历 `sessionId=1..93` 可读全部用户训练明细 |
| `exercises.add` 越权写入 | `exercises.service.ts:17-31` | 同样不校验归属，且 INSERT 时**照抄目标 session 的 `_openid`**，可向他人会话写入伪造训练记录，污染其统计/卡路里/打卡连续天数 |
| `JWT_SECRET` 硬编码兜底 | `jwt.strategy.ts:18`、`auth.module.ts:13`、`app.module.ts:24`、`env.config.ts:51` | 4 处 `|| 'dev-secret-change-me'`。且 `env.config.ts` **是死代码——全项目无人 import**，`loadEnv()` 从未执行。生产漏配则所有人共享公开 secret，可自行签发任意 openid 的 token |
| 上传无类型白名单 | `upload.controller.ts:22-28`、`upload.service.ts:19-23` | 只限大小不限类型，`.html`/`.svg` 可落盘；叠加 `main.ts:30-33` 的 `express.static` 默认开启 → 存储型 XSS |
| `DELETE /upload` 无归属校验 | `upload.controller.ts:37-41` | objectName 客户端完全控制，可删任意用户头像（配合排行榜泄露的 avatar URL 可精确构造）。根因是库里没有上传记录表 |

### P1 — 稳定性

| 问题 | 位置 | 说明 |
|---|---|---|
| 异常信息直接回显 | `all-exceptions.filter.ts:32-47` | 所有 `Error.message` 原样返回，泄露表名/列名/索引名（如 `ER_DUP_ENTRY ... for key 'users.uk_users_openid'`）。stack 未泄露，这部分没问题 |
| 开发后门登录 | `auth.service.ts:27-44` | `NODE_ENV=development` 时 `__dev:<openid>` 可冒充任意 openid，`__nodb:` 完全跳过 DB。而 `env.config.ts:39` 的 `NODE_ENV` 默认值就是 `'development'` |
| `toggleLibraryFavorite` 授权粒度错误 | `library.service.ts:78-89` | 有鉴权但缺授权：改的是全局共享列 `exercises_library.is_favorite`，任一用户调用会让全体用户的收藏标记同步翻转 |
| 无 token 吊销 | `jwt.strategy.ts:22-24` | `validate()` 纯解码不查库；`users.status` 只被排行榜读取，从不用于拦截请求。置 status=0 无法阻止其继续读写，token 30 天不可撤销 |
| 分页参数无上限 | `library.service.ts:56`、`sessions.service.ts:125` | `pageSize` 客户端可传 10000000 |

### P2 — 本次记录，后续逐一处理

| # | 项目 | 备注 |
|---|---|---|
| P2-1 | **前端**头像上传逻辑重复 | ~50 行在 `pages/profile/index.js` 和 `components/welcome-modal/index.js` 各一份，且已漂移（`sourceType`/`sizeType`/是否落库不同）。抽 `utils/upload.js` |
| P2-2 | **前端**i18n 漏网 | `library/index.js` "添加失败"、`welcome-modal/index.js:148,251` 硬编码中文/英文，绕过 i18n 字典 |
| P2-3 | **前端**README 是模板 | 仍是微信云开发 quickstart 全文，没描述这个项目。应重写：架构、构建、action 契约、后端仓库位置 |
| P2-4 | **前端**无 lint / 无测试 / 无 CI | 两端都是。建议至少上 ESLint + Prettier；后端补 Jest 越权回归用例 |
| P2-5 | **前端**`theme.js:2` / `i18n.js:2` 模块顶层 `getApp()` | app.js 在 `App()` 注册前就 require 了这两个模块，`app` 永远是 `undefined`，被 `if (app && ...)` 掩盖成静默死代码。改为在函数内调用 |
| P2-6 | **后端**CSV 存 ID 列表反模式 | `favor_exercises` / `practiced_exercises` varchar(255)，容量上限约 63 个动作，超了要么请求失败要么静默截断；toggleFavorite 是无事务读-改-写，弱网并发丢收藏。对应 DDL STEP 7 |
| P2-7 | **后端**`markPracticed` 是空实现 | `exercises.service.ts:116-118` 直接 `return { success: true }`，从不落库。而前端确实调用了它 → **"已训练"筛选恒为空、练过的动作排前面也从未生效**。这是个功能级静默失效 |
| P2-8 | **后端**死列清理 | `sessions.is_done`、`exercises.sequence`、`exercises.update_time`、`users.role` 均 0 引用；`exercises.user_id` 只写不读；`users.phone` 只读不写（永远返回 null） |
| P2-9 | **后端**`FIND_IN_SET` / `LIKE '%kw%'` 不可索引 | `library.service.ts:30` 走 `FIND_IN_SET(?, body_part_id)`，`library.service.ts:17-18` 走 `LIKE '%kw%'`。结构性不可索引，需拆 `exercises_library_body_part` 关联表或上 FULLTEXT |
| P2-10 | **后端**业务错误该用 HttpException | 现在 service 全抛裸 `Error` → 全是 500，前端无法区分"参数错"和"服务端炸了"。改 `BadRequestException` / `NotFoundException` |
| P2-11 | **后端**`pageSize` 兜底 | 见 P1 表最后一行 |
| P2-12 | **前后端**`stats.summary` 无分页 | 用户决定暂缓。`JSON_ARRAYAGG` 聚合全部历史无 LIMIT，payload 随使用时长无界增长 |
| P2-13 | **前端**`_loadHistorySessions` 单日超 20 条会静默截断 | `session.list` 不传 page 时默认 pageSize=20 |

---

## 五、本次未验证 / 风险

1. **线上真实 DDL 可能与 `db/*.sql` 漂移** —— 未连库，dump 导出于 2026-05/06。执行索引前请先 `SHOW INDEX FROM ...` 核对。
2. **索引收益未跑 EXPLAIN** —— 基于查询形态推导。落地前建议对 `stats.summary` 的三条查询取基线。
3. **未审查 `scripts/` 与 `docker-compose.yml`** —— 凭据传递方式未验证。
4. **前端改动未经真机/模拟器验证** —— 全部改动只做了 `node --check` 静态语法检查和逻辑推演。建议重点回归：冷启动、切后台回来、切 tab、结束训练、弱网重试。
5. **`.env` 未纳入审查** —— 已在 gitignore，确认版本库内无真实凭据。
