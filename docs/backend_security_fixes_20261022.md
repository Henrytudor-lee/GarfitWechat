# 后端安全修复交付说明

- 日期：2026-10-22
- 仓库：`/Volumes/world/program/gfit-backend`（NestJS 10 + MySQL）
- 改动：16 个文件 +411 / -83，新增 1 个 service + 3 个测试脚本
- 验证：57 项断言全绿（41 项服务层 + 16 项 HTTP 层），全部基于**真实生产数据**
- 生产库零写入（CSV 测试用事务 ROLLBACK，越权路径在 INSERT 前就抛错）

---

## 一、修复清单

### P0 严重 —— 越权与鉴权绕过

**① `exercises.list` 越权读取任意用户的训练明细**

```ts
// 修复前: 形参叫 _openid (下划线前缀 = 声明了不用), SQL 只按 session_id 过滤
'SELECT * FROM exercises WHERE session_id = ? ORDER BY create_time ASC'

// 修复后
'SELECT * FROM exercises WHERE session_id = ? AND _openid = ? ORDER BY create_time ASC'
```

`session_id` 是自增 int，极易枚举。实测反证：不加 `_openid` 条件会泄露 **51 条**他人训练明细，加上后返回 **0 条**。

选 `_openid` 直接过滤而不是 JOIN `sessions`：已实测线上 `exercises._openid` 与 session 归属**零漂移**（1746 行全部一致，无空值、无孤儿），所以这一列可信，且省掉一次 JOIN。

**② `exercises.add` 越权写入他人会话**

```ts
// 修复前: 不校验归属, INSERT 时照抄目标 session 的 _openid
'SELECT _openid, user_id FROM sessions WHERE id = ? LIMIT 1'
// → INSERT 用 sess._openid  ← 攻击者的记录被标成受害者的

// 修复后
'SELECT id, _openid, user_id FROM sessions WHERE id = ? AND _openid = ? LIMIT 1'
// 查不到 → throw NotFoundException('会话不存在或无权访问')
// INSERT 用 JWT 里的 openid, 不再照抄 session 的
```

错误信息**故意不区分**"不存在"和"不属于你"，避免探测他人 session_id。

**③ `JWT_SECRET` 硬编码兜底 + `loadEnv()` 死代码**

4 处 `process.env.JWT_SECRET || 'dev-secret-change-me'` 全部改为**缺失即启动失败**：

```
[FATAL] JWT_SECRET 未配置。拒绝启动 —— 若退回到默认值, 任何人都能伪造 token 冒充任意 openid。
```

`config/env.config.ts` 以前**全项目无人 import**，`loadEnv()` 从未执行，所以那个必填校验形同虚设。现在 `main.ts` 显式调用。

> ⚠️ 改这个之前我先用伪造 token 探测了生产服务器：用 `dev-secret-change-me` 签的 token 被拒（401），确认生产用的是自定义 secret，所以这项收紧**不会**导致生产启动失败。

**④ 开发后门 `__dev:` / `__nodb:`**

原来靠 `process.env.NODE_ENV === 'development'` 判断，而 `NODE_ENV` 的**默认值就是 `'development'`** —— 生产机漏配一个环境变量，这两个能冒充任意 openid 的后门就完全敞开。

改为显式开关 `ALLOW_DEV_LOGIN=true`，且 `NODE_ENV=production` 时开着会**直接启动失败**。

**⑤ `upsertUserAndSign` 竞态**

`users._openid` 加上 UNIQUE 索引后，原来非原子的 "SELECT 没查到 → INSERT" 会撞 `ER_DUP_ENTRY`。改成原子 upsert：

```sql
INSERT INTO users (_openid, role, status) VALUES (?, 'user', 1)
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
```

并发时后到的那条拿到先到那条的 id，不报错也不产生重复行。

### P1 高 —— 信息泄露与越权删除

**⑥ 异常过滤器泛化错误消息**

生产环境下所有非 `HttpException` 的错误统一返回 `Internal server error`，真实原因只进服务端日志。以前会把 MySQL 原始消息回显给客户端，例如：

```
ER_DUP_ENTRY: Duplicate entry 'wx123' for key 'users.uk_users_openid'   ← 泄露表名+索引名
ER_DATA_TOO_LONG: Data too long for column 'name' at row 1             ← 泄露列名
```

**⑦ 上传文件类型白名单（防存储型 XSS）**

以前只限大小不限类型，而文件会被 `express.static` 直接对外 serve —— 上传 `.html` 或 `.svg` 就能当脚本执行。

三层防护：
- `FileTypeValidator` 按**魔术字节**判断（NestJS 内部用 `file-type` 包读 buffer，比看 mimetype 字符串强得多）
- `upload.service.ts` 再加扩展名白名单 + MIME 交叉校验（防改扩展名和改 MIME 两种绕过）
- `express.static` 加 `X-Content-Type-Options: nosniff`

**⑧ `DELETE /upload` 归属校验**

原来 objectName 完全由客户端控制且无任何归属校验，任意登录用户可删他人头像（排行榜泄露的 avatar URL 就能反推 objectName）。根因是库里没有上传记录表。

采用**免建表方案**：objectName 加 ownerHash 段。

```
上传: avatars/{sha256(openid)前16位}/{ts}-{rand}.{ext}
删除: 校验第 2 段 == 当前用户的 hash, 不匹配 → ForbiddenException
```

顺带修了 `local-storage.service.ts` 的 `deleteObject`：原来的 `.replace(/^\/+$/, '')` 正则匹配的是"全斜杠结尾"（和 uploadBuffer 的 `/^\/+/` 意图完全不同，基本等于没生效），且**缺少 `startsWith(mediaRoot)` 校验**（uploadBuffer 有，deleteObject 没有）。

### P2 中 —— 功能失效与健壮性

**⑨ `markPracticed` 空实现 → "已训练"筛选恒为空**

```ts
// 修复前
async markPracticed(_openid: string, _payload: any) {
  return { success: true };      // 从不写库
}
```

前端确实在调用（`add-exercise-modal/index.js:522`），但后端没实现 → `users.practiced_exercises` 永远是空 → **"已训练"筛选恒为空、"练过的动作排前面"从未生效**。

线上有 3 个用户存着历史 `practiced_exercises` 数据，证明这功能在旧云函数时代是好的，**迁到 NestJS 时丢了**。

**⑩ 收藏/练过 CSV 改原子 SQL**

原来是 "SELECT 读整串 → JS 里改 → UPDATE 写整串"，弱网下并发连点会丢更新。改成单条原子 SQL（`FIND_IN_SET` 判存在 + `CONCAT`/`REPLACE` 增删），MySQL 行锁保证不丢写。

CSV 增删的 7 种边界情况全部实测覆盖（加/重复加/删中间/删首项/删空/空列表加/NULL 加），全部正确。

另外加了**写入前**长度检查（上限 950，列是 varchar(1000)）——超了明确报错，而不是撞 `ER_DATA_TOO_LONG` 或被静默截断丢收藏。

**⑪ `users.status` 参与鉴权**

以前 `status` 只被排行榜查询读，从不用于拦截请求 —— 把用户 status 置 0 拦不住他继续读写，泄露的 token 30 天内也没法撤销。

新增 `UserStatusService`（60s TTL 缓存）。缓存是必须的：远程 MySQL 单次 RTT ≈ 18ms，每个请求都查一次会让**所有接口延迟直接翻倍**。缓存换来"封禁最多 60 秒生效"。

**⑫ `toggleLibraryFavorite` 下线**

它改的是 `exercises_library.is_favorite` —— 一张**全局共享目录表**上的单一布尔位，没有 user_id 维度。任一普通用户调一次，全体用户看到的收藏标记同步翻转。

已确认前端**从未调用**（grep 三个 action 全无命中），是死接口，直接移除而不是"加个鉴权"：它的问题不是"没校验身份"，而是"数据模型本身没有用户维度"。用户收藏走 `exercise.toggleFavorite`。

**⑬ 分页参数钳制 + id 数组钳制**

`pageSize=10000000` 会拉爆内存；`favorExerIds` 传几十万个 id 会生成同等数量的占位符拖垮 prepared statement。都已钳制（pageSize ≤ 100，id 数组 ≤ 500）。

---

## 二、回归测试

新增 3 个脚本（已挂进 `package.json`）：

```bash
cd /Volumes/world/program/gfit-backend
npm run build
npm run test:security    # 41 项断言
npm run test:http        # 16 项断言 (需先起本地实例)
```

### `test:security`（41 项）

直连生产库但**零写入**，用真实数据验证归属校验：

```
【A】exercises.list 跨用户 → 返回空
     (反证: 不带 _openid 条件会返回 51 条 —— 这就是修复前的漏洞)
【B】exercises.add  跨用户 → NotFoundException, 信息不泄露 session 是否存在
【C】exercises.list 本人   → 正常返回 51 条, 与直接 SQL 条数一致 (确认没误伤)
【D】add 归属查询: 本人查得到 / 他人查不到
【E】library 参数钳制: pageSize / 非法 page / 10 万个 id 数组
【F】toggleLibraryFavorite 已下线
【G】零写入校验: exercises 行数未变, 无测试残留
+ CSV 原子 SQL 7 种边界 (事务内 + ROLLBACK, 验证后数据完全还原)
+ 上传白名单 9 种组合 (含改扩展名 / 改 MIME 两种绕过)
+ 上传归属校验: 他人删被拒 / 本人可删 / 路径穿越被拒
+ sessions 分页钳制
```

### `test:http`（16 项）

起本地实例跑真实 HTTP：

```
【1】正常业务 (本人 token): profile.get / exercise.list / session.getRunning
【2】越权 (他人 token): exercise.list 空 / exercise.add 404 / 零写入
【3】无效 token: 无 token → 401 / 用硬编码默认 secret 伪造 → 401
【4】上传类型白名单: .html 拒 / .svg 拒 / 真 .png 通过 / objectName 带 ownerHash
【5】删除归属: 他人 → 403 / 本人 → 200
【6】库内零写入校验
```

### 启动冒烟测试

```
✅ Nest 启动正常, 全部 DI 依赖解析成功 (含新增的 UserStatusService 注入)
✅ GET  /health  → 200
✅ POST /api/ping → 200 (公开接口)
✅ POST /api 无 token → 401
```

---

## 三、部署风险排查（这一节是重点）

### ⚠️ 部署方式：push 到 main 会自动部署

`.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          script: /opt/gfit-backend/scripts/deploy.sh
```

**push 到 `main` = SSH 到生产服务器自动跑 `deploy.sh`**。所以"推代码"和"上线"是同一个动作。

### 🔴 部署脚本本身是坏的（已修）

```bash
# 修复前
npm ci --omit=dev    # ← @nestjs/cli 和 typescript 都在 devDependencies, 被跳过
npm run build        # ← nest build → sh: nest: command not found
```

实测反证：`npm ci --omit=dev` 后 `node_modules/.bin/nest` 不存在，`npm run build` 必然失败。

**这解释了为什么生产环境跑的是旧代码** —— 探测生产 API 发现：

- `stats.exerciseMax` 不返回 `totalSets`（提交 7b81071 加的）
- `stats.summary` 的 history 不返回 `image_name`（同一个提交加的）

也就是说**最近几次 push 的自动部署全部失败了**，生产一直在跑更早的代码。

修复：

```bash
npm ci                # 含 devDependencies, 构建需要
npm run build
npm prune --omit=dev  # 构建完再剪掉, 运行时不需要
```

`deploy.sh` 和 `setup-server.sh` 都已修。

### ✅ 已确认不会出问题的前置条件

| 项 | 结论 |
|---|---|
| 分支 | 仓库在 `main`，`deploy.sh` 拉 `origin/main` —— 一致 ✅ |
| `.env` | 在 `.gitignore` 里（`.gitignore:8`），`git reset --hard` **不会**覆盖服务器配置 ✅ |
| 生产 `JWT_SECRET` | 用伪造 token 探测过：硬编码默认值被 401 拒掉，生产用的是自定义 secret ✅ |
| 生产 `NODE_ENV` | `__nodb:` 后门探测返回微信的 "invalid code" 而非走后门分支 → 生产 `NODE_ENV` 不是 development，dev 后门本来就关着 ✅ |
| DB schema | `uk_users_openid` 等 4 项昨天已应用 ✅ |
| 前后端契约 | 26 个 action 全部匹配 ✅ |

### 🔴 差点导致"部署后头像传不了"的坑

新的上传类型白名单如果只看 `file.originalname` 的扩展名，会**直接拒掉微信的临时文件名** —— `wx.chooseImage` 返回的路径形如 `wxfile://tmp_xxx`，扩展名不可靠。

改成：**落盘扩展名由 MIME 推导，攻击者可控的文件名永远不落盘**。

```
evil.html + image/png  → 存成 .png   (文件名不落盘)
tmp_1234567890 + image/jpeg → 存成 .jpg (微信临时文件名能过)
```

真正的安全边界是 controller 里的魔术字节校验（NestJS `FileTypeValidator` 用 `file-type` 读 buffer）+ 落盘扩展名由 MIME 决定，两者都不来自文件名。

### 部署前检查脚本

```bash
cd /opt/gfit-backend
node scripts/preflight-check.js
```

检查 26 项：环境变量 / 构建产物 / DB schema 前置依赖 / 前后端 action 契约 / 关键响应字段。
**任何一项失败都会以非 0 退出码阻止部署。**

---

## 四、部署步骤

### 方式 A：走 CI（推荐，push 即部署）

```bash
cd /Volumes/world/program/gfit-backend
git push origin main
```

GitHub Actions 会 SSH 到服务器跑 `deploy.sh`（已修好）。部署完确认：

```bash
# 看部署日志
# (GitHub Actions 页面, 或服务器上)
pm2 logs gfit-backend --lines 50
```

### 方式 B：手动部署

```bash
# 服务器上
cd /opt/gfit-backend
git pull origin main
node scripts/preflight-check.js    # 先检查
npm ci && npm run build && npm prune --omit=dev
pm2 restart gfit-backend
pm2 logs gfit-backend --lines 50
curl -s http://127.0.0.1:3000/health
```

### 部署后建议验证

```bash
# 1. 生产版本是否已是新代码
curl -s -X POST https://gfit.l2ee.top/api \
  -H "Authorization: Bearer <你的token>" \
  -H 'Content-Type: application/json' \
  -d '{"action":"stats.exerciseMax","exercise_id":1}'
# 期望: maxRecord 里有 totalSets

# 2. 健康检查
curl -s https://gfit.l2ee.top/health
```

### ⚠️ 部署后的已知一次性影响

**老头像无法删除**。2026-10-22 之前上传的文件没有 ownerHash 段，新代码的 `DELETE /upload` 会返回 403。
这是有意的（否则等于重新打开越权删除）。用户重新上传一次头像即可。

### 部署后建议关注

| 项 | 说明 |
|---|---|
| `users.status` 封禁拦截 | 每个请求会查一次库（60s 缓存）。首次请求某用户时会多一次远程往返（≈18ms） |
| `SERVE_MEDIA` | 默认值**没改**（仍是 true）。无法确认生产是否靠 `express.static` 出图（前端 `imagePrefix` 指向 `gfit.l2ee.top`）。如果 Nginx 已经反代了 `/var/www/gfit-media`，可以设 `SERVE_MEDIA=false` 彻底关掉 |
| `npm run lint` / `format` | **仍然是坏的** —— 仓库既没有 eslint/prettier 配置也没装这两个包（`package.json` 有 script 但没对应 devDependency）。既有问题，未在本次范围 |
| `ALLOW_DEV_LOGIN` | 默认关闭。如果本地联调需要，`.env` 里显式设 `ALLOW_DEV_LOGIN=true` |
| `EXPOSE_ERROR_DETAILS` | 默认关闭（安全）。本地联调想看原始报错，`.env` 里设 `EXPOSE_ERROR_DETAILS=true` |

---

## 四、刻意没做的事

| 项 | 原因 |
|---|---|
| `library.list` 的收藏/练过过滤改服务端自取 | 前端对收藏是**乐观更新**（先本地改状态，再 fire-and-forget 提交）。改成服务端自取会让"刚收藏完立刻点筛选"因服务端还没提交而筛出空列表 —— 这是我引入的 UX 回归。改为保留客户端传 id + 长度钳制（真正的风险是占位符炸弹，不是"客户端能指定 id"，因为动作目录是公开的） |
| `SERVE_MEDIA` 默认值改 false | 无法确认生产是否依赖它，改了可能让头像全挂 |
| `users.role` / `phone` 等死列的删除 | 需要配套改 schema 文档和潜在的外部依赖 |
| `stats.summary` 分页 | 你说暂缓 |
| `exercises_library` 的 `FIND_IN_SET` / `LIKE '%kw%'` 改造 | 需要拆关联表或上 FULLTEXT，属范式变更 |
| 上传记录表 `media_files` | 用 ownerHash 前缀方案免掉了建表和归属表维护成本 |
| JWT token 吊销 / 滑动过期 | 需要 Redis 黑名单，是独立的一轮工作 |
