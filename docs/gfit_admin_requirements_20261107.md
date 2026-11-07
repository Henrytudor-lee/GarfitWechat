# GFit 后台管理项目 · 需求评估报告

> 评估日期：2026-11-07
> 评估方式：只读盘点生产库 + 生产机文件系统 + 后端源码 + 小程序端调用链
> 范围：`gfit-backend`（NestJS）+ `fitness_wechat`（微信小程序）+ MySQL 生产库 `47.108.200.98/gfit` + 媒体目录 `/media/gfit`

---

## 0. 结论速览

| 项目 | 结论 |
|---|---|
| 可行性 | ✅ 高。现有后端无任何写接口，但基础设施（MySQL 连接、媒体存储、文件白名单）齐全，后台管理是**增量开发**而非重建 |
| 核心技术风险 | ⚠️ 1 个高危（生产 3000 端口公网裸奔）、1 个中危（现有 `library.typingApply` 无角色校验） |
| 建议形态 | 独立前端仓库 `gfit-admin`（Vue3 + Element Plus），后端在 `gfit-backend` 新增 `admin` 模块 |
| 建议鉴权 | **不放在生产服务器上跑**，本机运行 + 一个写操作走 SSH 隧道的窄通道（见 §4.2） |
| 预计工作量 | 后端 admin 模块 ~2 天，前端 CRUD 页 ~3 天，素材上传链路 ~1 天，联调与安全验收 ~1 天 |
| 建议首版范围 | 动作库 CRUD（新建 / 编辑 / 删除 / 批量）+ 素材上传 + 用户与训练数据只读查看 |

---

## 1. 现状盘点（实测）

### 1.1 数据规模（2026-11-07 生产库实测）

| 表 | 行数 | 说明 |
|---|---|---|
| `exercises_library` | **7,641** | 动作库，唯一的"大表" |
| `exercises` | 2,064 | 训练动作明细 |
| `sessions` | 231 | 训练场次 |
| `users` | 37 | 注册用户（9 个有训练记录） |
| `user_exercise_stats` | 132 | 用户×动作关联表（Phase 3 已建） |

`exercises_library.id` **不是自增**（`EXTRA=''`），最大 id 48277，实际只有 7641 行 —— 存在 40636 个 id 空洞。**新增动作必须显式分配 id**，这是后台管理第一个必须处理的实现细节。

### 1.2 动作库字段（表结构实测）

```
id            int NOT NULL PRIMARY KEY     ← 非自增
name          varchar(128) NOT NULL        英文名
name_zh       varchar(64)  DEFAULT NULL    中文名
image_name    varchar(255) DEFAULT ''      图片文件名（裸名，无目录）
video_name    varchar(512) DEFAULT NULL    视频文件名（裸名，无目录）
equipment_id  varchar(255) NOT NULL        器械，可为 "6,19" 多值
body_part_id  varchar(64)  DEFAULT ''      部位，可为 "17,5" 多值
exercise_type varchar(32)  DEFAULT 'Strength'
is_favorite   smallint     DEFAULT 0       全局运营精选标记
created_at / updated_at
```

### 1.3 素材链路（已跑通，无需改造）

```
DB 存裸文件名        "00251101-Barbell-Bench-Press_Chest-FIX_small.png"
        ↓ 小程序拼 URL
imgPrefix            https://gfit.l2ee.top   (app.js:11)
        ↓
https://gfit.l2ee.top/exer_images/{image_name}
        ↓ Nginx: location / { alias /media/gfit/; }
生产磁盘              /media/gfit/exer_images/  (6852 个 png, 330M)
                      /media/gfit/exer_videos/  (4726 个 mp4, 1.9G)
```

实测验证：`GET /exer_images/NULL` → **404**，正常文件名 → **200**。

**素材交叉核对结果（DB 引用 vs 磁盘文件）：**

| 项 | 数量 | 样例 |
|---|---|---|
| 图片引用但磁盘缺失 | 2 | `66431201-Side-to-Side-Bicep-Curl-(female)_Plyometrics__GREEN.png` |
| 视频引用但磁盘缺失 | 1 | `80021201-Resistance-Band-Wide-Stance-Anti-Rotation-Chop-(ma).mp4` |
| 磁盘有但无人引用 | 2 | 同上（文件名尾部括号被截断，属同一批导入问题） |

即：**素材链路基本健康，损坏率约 0.03%，且损坏集中于文件名尾括号被截断这一类**。

### 1.4 现有后端 API 能力盘点

| 分类 | 现有 action | 能否支撑后台 |
|---|---|---|
| `library` | `list` / `detail` / `favorites` / `count` | ⚠️ 只读，且 `list` 无 `name_zh` 排序/总数返回、不支持按 id 批量取 |
| `library.typing` | `typingSuggestions` / `typingApply` | ✅ **可直接复用**做批量改 type（带 dryRun），但无鉴权（见 §4.1） |
| `exercise` | `add` / `list` / `update` / `delete` / `toggleFavorite` … | ⚠️ 全部绑定 `_openid`，是**用户维度**动作记录，不是动作库管理 |
| `upload` | `POST /upload` / `DELETE /upload` | ⚠️ 白名单齐全，但 objectName 强制带 ownerHash 段、落 `media/` 前缀，与 `exer_images/` 约定冲突 |
| `stats` | `summary` / `exerciseList` / `leaderboard` … | ✅ 大部分可复用做只读统计 |

**结论：动作库的写接口（增/删/改）目前为零。** `exercises_library` 表只有 `library.list/detail/favorites/count` 四个只读方法，`toggleLibraryFavorite` 已下线。这正是用户说的"动作暂时不存在于动作库中"的根因。

### 1.5 现有后端已有的可复用资产

| 资产 | 位置 | 复用价值 |
|---|---|---|
| `TypingService` | `src/modules/library/typing.service.ts` | 批量改 type 的建议引擎（关键词规则 + 同名组多数票 + 歧义不猜），**后台"一键规范化"直接接上** |
| `MysqlService` | `src/infra/database/mysql.service.ts` | 连接池 + 时区自检 |
| `LocalStorageService` | `src/infra/storage/local-storage.service.ts` | 路径穿越防护（`../` 剥离 + `startsWith` 校验） |
| `AllExceptionsFilter` | `src/common/filters/` | 生产环境错误泛化 |
| 部署流水线 | `.github/workflows/deploy.yml` + `scripts/deploy.sh` | push main 自动部署 + 两阶段 preflight + 备份 |
| 安全回归测试 | `scripts/security-regression*.test.js` | 49 项断言，可扩展覆盖 admin 模块 |

---

## 2. 需求拆解

### 2.1 功能矩阵

#### A. 动作库 CRUD（用户明确的核心，最高优先级）

| 功能 | 细节 | 依赖的后端能力 |
|---|---|---|
| 列表 + 筛选 | 按 name / name_zh 搜索，按 equipment / body_part / exercise_type 筛选，按 id 精确查询；分页；显示图片缩略图 | 新增 `admin.library.list`（支持 `FIND_IN_SET` 多值匹配 + 排序白名单 + 返回 total） |
| 详情 | 单条全字段 + 被引用次数（训练记录数 / 用户数 / 收藏数） | 新增 `admin.library.detail` |
| **新建** | 填 name / name_zh / 器械 / 部位 / type，**上传图片 + 演示视频** | 新增 `admin.library.create` + `admin.upload` |
| **编辑** | 改任一字段；改图/改视频；素材替换；实时预览 | 新增 `admin.library.update` |
| **删除** | **硬删除并同步清理训练记录引用**（用户已决策） | 新增 `admin.library.delete`（级联清 `exercises` + `user_exercise_stats`） |
| 批量操作 | 多选批量改 type / 改部位 / 改器械 / 批量删除 | 复用 `TypingService` + 新增批量接口 |
| 运营精选 | 开关 `is_favorite`（这就是 `favorites()` 读的那个全局字段） | 新增 `admin.library.feature` |
| 字典管理 | 器械 / 部位 / 类型的可选值维护 | 新增字典表（见 §3.2） |

#### B. 素材上传（用户明确要求）

| 功能 | 细节 |
|---|---|
| 图片上传 | png/jpg/webp，写入 `/media/gfit/exer_images/`，返回裸文件名 |
| 视频上传 | mp4，写入 `/media/gfit/exer_videos/`，返回裸文件名 |
| 大文件 | 现有 `upload` 限 5MB，生产视频最大 3.7MB，够用；后台可放宽到 20MB |
| 文件名策略 | 沿用现有 `{序号}{部位码}{器械码}-{Name}_{部位}_small.png` 风格，**或**简化为 `{slug}_{timestamp}.{ext}` —— 需与用户确认（见 §6） |
| 校验 | 复用现有 MIME 白名单 + 魔术字节 + `../` 路径防护 |

#### C. 用户数据查看（只读）

- 用户列表：昵称 / 性别 / 年龄 / 身高体重 / 目的 / 注册时间 / 训练场次 / 训练动作数
- 用户详情：训练历史（按 session 展开）、收藏动作、已练动作
- 敏感字段脱敏：`_openid` 只展示前 8 位、`phone` 中间四位打码

#### D. 动作数据查看（只读）

- 动作被使用排行：按训练次数 / 引用用户数排序（当前 Top1 = Bench Press，142 次）
- 孤立动作检测：从未被任何用户练过的动作（7641 个里绝大多数）
- 同名重复检测：993 组同名，2280 行 —— 用于人工归并判断
- 资源缺失检测：素材为字面量 `"NULL"` 的动作（图片 426 个 / 视频 2674 个）

---

## 3. 关键设计决策

### 3.1 硬删除的级联语义（用户已选硬删除）

用户决策：**硬删除并同步清理训练记录引用**。实测外键现状：

```
exercises.exercise_id  → exercises_library.id   ❌ 无外键（只有 session_id / user_id 有 FK）
user_exercise_stats.exercise_id → exercises_library.id  ❌ 无外键（只有 user_id 有 FK）
```

**无外键保护 = 删库行不会自动清引用，会产生孤儿记录**（当前孤儿数 0，是项目一直维护的不变量）。因此后台的删除必须**显式在一个事务里**做三件事：

```sql
START TRANSACTION;
DELETE FROM exercises           WHERE exercise_id = ?;   -- 训练明细
DELETE FROM user_exercise_stats WHERE exercise_id = ?;   -- 收藏/练过标记
DELETE FROM exercises_library   WHERE id = ?;            -- 库行本体
COMMIT;
```

⚠️ **删除前必须提示影响面**：当前被训练记录引用的动作共 107 个，Top1（Bench Press, id=2）牵涉 142 条训练记录、多个用户。后台删除弹窗必须显示"将同时删除 N 条训练记录 / 影响 M 个用户"，并要求二次确认。

⚠️ **建议**：删除动作时**不删媒体文件**（`/media/gift/exer_images/` 里的物理文件）。同一张图片可能被多个 id 复用（生产上有 6853 个引用对 6852 个文件），物理文件先留着，后续用"素材体检"功能统一清理孤儿文件更安全。

### 3.2 新增动作的 id 分配

`exercises_library.id` 非自增且有 40636 个空洞。三个方案：

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 改表加 AUTO_INCREMENT | `ALTER TABLE ... MODIFY id INT AUTO_INCREMENT` | ⚠️ 会重排 id 语义，但线上 id 已无自增痕迹；改动风险中等 |
| B. 应用层取 MAX(id)+1 | 事务内 `SELECT MAX(id) FOR UPDATE` 后插入 | ✅ **推荐**，零 schema 改动。后台单人操作，锁竞争可忽略 |
| C. 独立自增列 | 加 `seq_id AUTO_INCREMENT` 做代理键 | 改动大，且前端全部逻辑用的是 `id`，收益低 |

**推荐 B**，并在应用层强制 `id` 唯一性校验。

### 3.3 字典体系（发现一个现存缺口）

动作库的 `equipment_id` / `body_part_id` 是**逗号分隔的多值字符串**，且字典散落在前端硬编码：

- 小程序 `pages/library/index.js` 硬编码 28 个器械 + 16 个肌群
- 后端 `typing-rules.ts` 只有 `BODY_PART_LABEL`（20 项），**没有 equipment 标签表**

实测数据覆盖：

| 维度 | 库里实际用到的值 | 前端字典覆盖 |
|---|---|---|
| equipment_id | 1–28 全覆盖，另有 19 条是多值（如 `"4,23"`） | 28 项全覆盖 ✅ |
| body_part_id | 1–21（**21 个值**） | 只有 16 项，**缺 11/13/14/15/16/21** |

**缺口影响**：库里有 **945 个动作**（body_part 命中 11/13/14/15/16/21）用到了前端没有的部位 id —— 这些动作在小程序里**无法被部位筛选命中**，用户按"爆发/功能""杠铃力量""瑜伽姿势"筛选时是空的。后台上线后应能把这类值可视化出来并批量校正。

### 3.4 多值字段的筛选语义

`body_part_id` 用 `FIND_IN_SET` 匹配（后端已这么做，正确）。但 `equipment_id` 后端用的是**精确匹配** `equipment_id = ?` —— 对那 19 条多值记录（`"4,23"`）永远匹配不到。后台管理列表应统一用 `FIND_IN_SET` 语义，与小程序筛选行为对齐。

### 3.5 素材命名策略

现有文件名形如 `00251101-Barbell-Bench-Press_Chest-FIX_small.png`，编码来源不明（`00251101` 疑似"素材序号+部位码+器械码"）。后台新建动作时：

- **选项 1**：完全沿用旧编码规则 —— 但规则不明，需要逆向推导
- **选项 2（推荐）**：新规则，如 `{slug}_{timestamp}.{ext}`，只要求唯一 + 可读，不与旧规则混用

考虑到旧规则有 2 条已因括号截断损坏，新规则能避免同类问题。

---

## 4. 安全评估（本次评估的重点）

### 4.1 🔴 高危：生产 3000 端口公网裸奔

```
$ ss -tlnp
LISTEN 0 511  0.0.0.0:3000  users:(("node /opt/gfit-..."))
$ iptables -L INPUT
Chain INPUT (policy ACCEPT)     ← 无任何过滤规则

$ curl http://47.108.200.98:3000/health
{"status":"ok","service":"gfit-backend",...}    ← 从外网直接命中
```

Nginx 虽然配了 `/api` 反代，但 **3000 端口本身对外可达**，绕过了 Nginx 的所有 location 配置。

**这对后台管理是致命的**：如果把 admin 模块按常规方式部署到生产，它会立即成为**无鉴权的公网写接口** —— 任何人都能改动作库、删训练记录。

用户已选择"不用登录，仅本机本地运行"。这恰好是正确方向，但需要落实为技术约束：

### 4.2 鉴权方案落地（三层防护）

| 层 | 措施 | 效果 |
|---|---|---|
| L1 网络 | admin 服务**不部署到生产**，本机运行（`gfit-backend` 本地 `npm run start:dev` + `ADMIN_ENABLED=true`） | 生产上根本没有 admin 路由可打 |
| L2 传输 | 本机 → 生产库的写入走 **SSH 隧道 + 只读账号**；写操作单独走一个受限通道 | 数据库层面不暴露写权限 |
| L3 应用 | admin 路由**双重校验**：① 请求必须带一个仅存在于本机环境变量的共享密钥 ② 拒绝任何非 loopback 来源 | 即使密钥泄露，从公网也打不进来 |

⚠️ **额外必做**：**修复 3000 端口暴露**。建议生产 `main.ts` 改为 `app.listen(port, '127.0.0.1')`，让 Nginx 成为唯一入口。这一条独立于后台项目，但属于同一批安全债，且改动极小、收益极高。

### 4.3 🟡 中危：`library.typingApply` 无角色校验

```typescript
// rpc.controller.ts:86-91 —— 普通用户的 JWT 就能调用
case 'library':
  if (sub.startsWith('typing')) {
    return this.typing.handle(sub, openid, data);   // openid 只用于数据隔离
  }
```

`typingApply` 能**批量修改全库 7641 个动作的 `exercise_type`**，但它走的是普通用户鉴权路径 —— 任何登录用户（37 个注册用户中任意一个）理论上都能调。

**建议**：把 `typingSuggestions` / `typingApply` 从 `/api` RPC 通道**下线**，只保留在 admin 模块下。这同时也是用户需求"批量修正动作类型"的一部分。

### 4.4 🟡 中危：`upload` 的 ownerHash 机制与动作库素材冲突

现有上传强制 objectName 形如 `{prefix}/{ownerHash}/{ts}-{rand}.{ext}`，用于归属校验（防删他人头像）。但动作库素材是**全局共享**的裸文件名（`exer_images/xxx.png`），两套约定不兼容。

admin 上传需单独实现：
- 前缀白名单改为 `exer_images` / `exer_videos`
- 不带 ownerHash（全局资源无归属概念）
- 删除动作**不删物理文件**（见 §3.1）

### 4.5 🟢 现有防护可直接继承

- `FileTypeValidator` 魔术字节白名单（防存储型 XSS）
- `LocalStorageService` 路径穿越防护
- `AllExceptionsFilter` 生产环境错误泛化
- 分页参数钳制（防拉爆内存）

---

## 5. 架构方案

### 5.1 选型（已确认）

```
gfit-admin/                       独立前端仓库 · Vue3 + Vite + Element Plus
   ├─ views/
   │   ├─ library/     动作库列表 · 详情 · 编辑器
   │   ├─ upload/      素材上传（拖拽 · 进度 · 预览）
   │   ├─ users/       用户列表 · 用户详情
   │   └─ analytics/   动作使用分析 · 数据质量体检
   ├─ api/            admin.* 路由封装
   └─ vite.config.ts  dev 代理 → http://127.0.0.1:3000

gfit-backend/                     加一个 admin 模块
   src/modules/admin/
   ├─ admin.controller.ts   REST 风格路由（不走 /api RPC 兼容层）
   ├─ admin.service.ts      动作库 CRUD · 批量操作 · 事务
   ├─ admin-upload.service.ts  动作库素材上传（exer_images / exer_videos）
   ├─ admin-metrics.service.ts  用户/动作只读统计
   └─ admin-auth.guard.ts    §4.2 的 L3 校验
```

### 5.2 为什么 admin 不走 `/api` RPC 兼容层

现有 `/api` 是给小程序 RPC 兼容用的，鉴权模型是"微信 openid + JWT"。后台管理的鉴权模型完全不同（共享密钥 + loopback 限定 + 操作审计）。混在一个入口里会让**鉴权分支越来越难审计**——这正是历史上 `toggleLibraryFavorite` 越权和 `typingApply` 无角色校验的成因。

独立 `/admin/*` 前缀 + 独立 Guard，能让"谁能改数据"这个问题一眼可查。

### 5.3 写操作审计

用户已选"不用登录"，但**改生产库的动作必须有审计**。建议建 `admin_operation_log`：

```
id, ts, op, target_table, target_ids, affected_rows, payload_snapshot, client_ip
```

后台每次写操作记一行。理由很直接：37 个真实用户的数据，且历史上已有过"误写生产库 20 行"的记录。

---

## 6. 待确认事项

| # | 问题 | 备选 | 建议 |
|---|---|---|---|
| 1 | 新建动作的素材文件名规则 | 沿用旧编码 / 新规则 `{slug}_{ts}.{ext}` | 新规则（旧编码规则不明且已损坏过） |
| 2 | 后台是否需要"合并同名动作" | 需要 / 不需要 | 需要。993 组同名是最大的长期数据债，合并 = 改引用 + 删一行，正是后台该做的事 |
| 3 | 删除动作时是否保留媒体文件 | 保留（推荐）/ 一并删除 | 保留，孤儿文件用独立"素材体检"功能清理 |
| 4 | 是否同期修复 3000 端口暴露 | 修 / 不修 | 修。改动 1 行，独立于本项目但同批安全债 |
| 5 | 是否同期下线 `typingApply` 的 RPC 暴露 | 下线 / 保留 | 下线，迁移到 admin 模块 |
| 6 | 后台第一个可用版本的范围 | 仅动作库 CRUD / 全量 | 动作库 CRUD + 素材上传 + 用户/动作只读查看（用户原话的三块） |

---

## 7. 建议实施顺序

```
第 1 步  安全底座
         ├─ 生产 3000 → 127.0.0.1 绑定
         ├─ admin 模块骨架 + Guard + 操作审计表
         └─ 确认 admin 路由不进生产

第 2 步  动作库读 + 素材上传
         ├─ admin.library.list/detail（含多值筛选、总数）
         ├─ admin.upload（exer_images / exer_videos）
         └─ 前端：列表 + 详情 + 上传组件

第 3 步  动作库写
         ├─ admin.library.create/update/delete（事务 + 级联）
         ├─ 删除前影响面提示
         ├─ 批量操作（复用 TypingService）
         └─ 前端：编辑器 + 批量选择 + 删除确认

第 4 步  只读数据视图
         ├─ 用户列表 / 详情（脱敏）
         ├─ 动作使用分析
         └─ 数据质量体检（同名 / 素材缺失 / 字典缺口 / 多值异常）

第 5 步  收尾
         ├─ typingApply 从 RPC 下线
         ├─ 扩展 security-regression 覆盖 admin
         └─ 945 个字典缺口动作的批量校正（需用户确认改法）
```

---

## 附录 · 本次评估的实测口径

所有数字均来自 2026-11-07 对生产库 `47.108.200.98/gfit` 的**只读**查询（`SELECT` / `SHOW`），以及生产机 `/media/gfit` 的只读列目录、源码静态阅读。**评估过程未对生产库做任何写操作**。

已核查项：
- `exercises_library` / `exercises` / `sessions` / `users` / `user_exercise_stats` 的表结构与行数
- `exercises_library` 全量 7641 行的素材字段、字典字段、名称字段分布
- DB 素材引用 ↔ `/media/gift/exer_images` + `exer_videos` 磁盘文件的交叉核对
- `exercises.exercise_id` / `user_exercise_stats.exercise_id` 的外键缺失情况
- 生产 Nginx 配置、端口监听状态、防火墙规则、`/health` 外网可达性
- 后端全部 `library` / `upload` / `auth` / `rpc` 路由的鉴权路径
- 小程序端 `imagePrefix` / `videoPrefix` 与素材 URL 拼接规则
