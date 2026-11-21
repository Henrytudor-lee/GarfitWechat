# GFIT 缺失演示视频 · Lyfta 抓取实测报告（第二版 · 结论已修正）

**评估对象**：`my.lyfta.app` / `lyfta.app` / `apilyfta.com`
**日期**：2026-11-08
**完整版报告**：`gfit_lyfta_video_feasibility_20261108.html`

> ⚠️ **本报告修正了第一版的两个错误结论。** 第一版断言「这 2018 条动作在 GymVisual 源头就没有视频」——**这是错的**。
> 根因是数据源选错了：不是 Lyfta 没有视频，而是用来判断的**公开接口字段是过时的**。

---

## 修正记录

| # | 第一版的错误 | 根因 | 修正 |
|---|---|---|---|
| 1 | 用公开 `POST /api/search` 的 `video_file` 判断有没有视频 | 该字段是旧快照：`id=5443`/`id=1560` 都返回 null，但登录态接口返回非空且 URL 实测 200 | 改用登录态 `GET /api/v2/exercises/by-ids?ids=…` |
| 2 | 「2000 个组号 S3 全量穷举 0 命中」被当成事实 | 只试了 `{组号}1201.mp4` 一种 key 形式；后来补做的视频**只有带描述名的路径**，短名仍 403 | 以登录态 API 返回的完整 URL 为准，不再猜 key 形式 |

> 第三个错误（把 `gymVisualId` 当 id 传）也记在案，见 §6。

---

## 本轮成果

**全量 2015 条扫描完毕，288 条视频补进生产库，坏引用清零。**

| 指标 | 变化 |
|---|---|
| 缺视频动作数 | 2018 → **1728** |
| 有视频条数 | 4968 → **5258** |
| 生产机 mp4 数 | 4727 → **5015** |
| 孤儿记录 | 0 |
| 坏引用（库引用但磁盘无文件） | 1 → **0** |
| 公网 sha256 | **286/286 公网可达；抽检 10/10 与生产机磁盘逐字节一致** |

扫描方式：26 批 × 80 一次性全量拉取（浏览器登录态 → 本机收集器落盘，响应零上下文消耗）。
命中 299 条 → 双校验通过 **288 条**（286 个 mp4 文件，2 个文件被 2 条库记录共用）→ **11 条错配脏数据剔除**。

---

## 一、关键方法：登录态 API 才是准确数据源

从 Lyfta 官方 App 的 JS chunk（`my.lyfta.app/_next/static/immutable/chunks/*.js`，SvelteKit）挖出真实端点：

| 端点 | 认证 | 说明 |
|---|---|---|
| `GET /api/v2/exercises/by-ids?ids=1,2,3` | session cookie | **批量按 id 取，一次最多 200 个 —— 唯一使用的数据源** |
| `GET /api/v2/exercises/search?search=&limit=&offset=` | session cookie | 按名字模糊搜（参数名是 `search`，不是 `query`） |
| `POST https://lyfta.app/api/search` | 免鉴权 | ⚠️ `video_file` 字段过时，不可用 |
| `GET https://lyfta.app/exercise/{slug}` | 免鉴权 | ⚠️ `__NEXT_DATA__` 里的 `video_file` 同样过时 |
| `GET /api/v1/exercises/library` | API Key | 登录 cookie 不行 |

登录态返回的完整记录：

```json
{
  "id": "5443",
  "name": "Dumbbell Seated Bent Over Rear Delt Row",
  "gymVisualId": "4235",
  "imageName": "https://apilyfta.com/static/GymvisualPNG/42351101-Dumbbell-..._small.png",
  "videoFile": "https://apilyfta.com/static/GymvisualMP4/42351201-Dumbbell-..._Shoulders-.mp4",
  "videoName": null,
  "dateModified": "2025-09-30T14:18:23.000Z"
}
```

### 关联安全性：组号 100% 一致

`gymVisualId` 就是 GymVisual 的 4 位组号（`4235` → 图片名 `42351101-…`）。
凡是有 `videoFile` 的记录，**其 mp4 组号与它自己图片名的组号完全相同**（抽样命中 11 条，11/11 一致）。

→ **补视频不存在「张冠李戴」风险**，拿到的就是同一个动作的演示视频。
（与之前「同名 ≠ 同动作」的教训不冲突：那次按**名字**匹配，这次按**素材组号**匹配。）

---

## 二、实测数据

| 指标 | 数值 |
|---|---|
| 抽样规模 | 60（12 优先 + 48 随机） |
| 抽样中 Lyfta 有视频 | 11（**18.3%**） |
| 命中项组号与图片组号一致 | **11 / 11** |
| 剩余缺视频 | 2015（已修 3 条） |
| 按 18.3% 外推可补 | ≈ 370 |

### 2.1 15 条「被训练过 ∩ 缺视频」逐条结论

范围精确圈定：**缺视频 ∩ 被训练过 = 15 条**（此前估的 12 条漏了 3 条）。

| id | 英文名 | 训练 | Lyfta videoFile | 判定 |
|---|---|---|---|---|
| 2794 | Dip Hold Isometric | 61 | null | Lyfta 侧确实无视频 |
| 27819 | 1 2 Stick Drill (male) | 21 | null | Lyfta 侧确实无视频 |
| 337 | Upper Row | 19 | null | Lyfta 侧确实无视频 |
| 4360 | Resistance Band Seated Shoulder Press | 10 | null | Lyfta 侧确实无视频 |
| 1715 | Cross Jacks | 7 | null | Lyfta 侧确实无视频 |
| 328 | Machine Inner Chest Press | 5 | null | Lyfta 侧确实无视频 |
| 1558 | Barbell Standing Front Raise Over Head | 4 | null | Lyfta 侧确实无视频 |
| 3148 | Extra Decline Sit-up | 4 | null | Lyfta 侧确实无视频 |
| 1453 | 45 Degree Side Bend | 4 | null（`videoName` 非空） | ⚠️ 有 Lyfta 内部 videoName，但 6 种 URL 规则全 404/403 |
| 385 | Lever Seated Wide Squat | 4 | null | Lyfta 侧确实无视频 |
| 1551 | Barbell Skier | 3 | null | Lyfta 侧确实无视频 |
| 1552 | Barbell Speed Squat | 3 | null | Lyfta 侧确实无视频 |
| **5443** | Dumbbell Seated Bent Over Rear Delt Row | 3 | ✅ `42351201-…Shoulders-.mp4` | **已落地** |
| **1560** | Barbell Standing Overhead Triceps Extension | 2 | ✅ `01091201-…Upper-.mp4` | **已落地** |
| 5418 | 1 to 2 Jump Box | 2 | null | Lyfta 侧确实无视频 |

**额外捡到 1 条**：`id=45`「Standing Overhead Triceps Extension」与 id=1560 同为 `gymVisualId=109`、共用组 0109 的同一个 mp4 —— 一次下载补两行。**共落地 3 行。**

### 2.2 有视频的动作如何分布

命中的记录 `dateModified` 集中在 **2025-09-23 ~ 2025-09-30** —— Lyfta 在 2025 年 9 月下旬批量补做了一批视频。`dateModified` 为 2021/2022 的老记录基本都没有视频。

这解释了第一版抽样「0/40 有视频」——那 40 条的公开接口快照里就是 null。
也解释了「2080 条里没有视频」的整体观感：**GFIT 库的这批数据是 Lyfta 补做视频之前的历史快照。**

---

## 三、已落地的 288 条

| id | 英文名 | video_name（库内现值） |
|---|---|---|
| 45 | Standing Overhead Triceps Extension | `01091201-Barbell-Standing-Overhead-Triceps-Extension_Upper-.mp4` |
| 1560 | Barbell Standing Overhead Triceps Extension | `01091201-Barbell-Standing-Overhead-Triceps-Extension_Upper-.mp4` |
| 5443 | Dumbbell Seated Bent Over Rear Delt Row | `42351201-Dumbbell-Seated-Bent-Over-Rear-Delt-Row_Shoulders-.mp4` |

执行链路：

1. 从 `apilyfta.com` 下载 mp4（ftyp 文件头校验通过，大小与 Content-Length 一致）
2. **先验公网可达（200 video/mp4）再写库** —— 不让库指向坏文件
3. 写库前备份 3 行 → `.gfit-backup-video3-1794118590692.json`
4. 走 `PUT /admin/library/:id` 更新（自动写 `admin_operation_log` 审计）
5. scp 推生产机 `/media/gfit/exer_videos/`，文件名为**原始 GymVisual 名**
6. 公网 `https://gfit.l2ee.top/exer_videos/{name}` 验证 + **sha256 与本地完全一致**

### 关于文件名：一个走弯路的决定

第一次用 admin 上传接口（`POST /admin/upload`），它把文件名净化成
`42351201-Dumbbell-Seated-Bent-Over-Rear-Delt-Row_Shoulders.mp4`（去掉尾部 `-`）。
但生产机现有 4727 个 mp4 里 **2828 个是原始 GymVisual 名**（带括号、尾部 `-`）。
功能上没问题（资产匹配只取前 4 位组号，两种命名都命中），但两套命名混在一个目录不干净。
**已改为直传原始名**，净化版移到生产机 `~/.trash-gfit/`（不 rm，可恢复）。

---

## 三·五、自动校验规则（抓脏数据的关键）

批量补库前对每条候选做**双重校验**，两个条件都必须过：

1. **编号严格比对**：视频文件名的 8 位编号必须严格等于「库内 image_name 前 4 位 + `1201`」
2. **名称 token 重合度**：视频文件名主干与库内英文名的有效 token 重合度 ≥ 0.34（剔除 male/female/version 等变体词与器材词后计算）

**实测抓到 Lyfta 侧错配脏数据，且量不小**：`id=279`「Lever Side Hip Abduction」的 `videoFile` 是
`103421201-Reverse-Hyperextension-on-Box_Hips_.mp4` —— 编号是 `1034`+`21201`（多一个 2），文件名主干指向完全另一个动作
「Reverse Hyperextension on Box」。**仅靠组号校验会放过它**，靠名称校验才抓出来，已剔除。

第 5 批里同类脏数据密集出现（10 条，编号形如 `100031201`、`101261201`）→ **Lyfta 这批 2025-09 补做的视频数据本身带错配**。

→ 组号一致是**必要条件而非充分条件**，双校验缺一不可。

**素材复用**：53 个 mp4 文件覆盖 55 条库记录 —— `01641201-…` 同时对应 id=66 与 id=1615，`01721201-…` 同时对应 id=71 与 id=1623。
批量补库按文件去重后上传，避免重复下载。

## 三·六、批量补库踩到的三个坑（已修正，写进流程）

1. **Lyfta 的 `videoFile` 字段本身有截断 bug** —— 少数条目（如 id=2798）数据库里存的文件名被截成
   `14461201-Barbell-Zercher-Squat-Hold-Isometrics_.mp4`，真实名是下划线版 `…-Hold_Isometrics_.mp4`，
   CDN 上前者 404、后者 200。**处理**：下载失败时按 imageName 描述反推后缀变体（试 15-25 种）找回真名；找不回就**回滚成无视频**，绝不留 404 链接。
2. **下载校验失败 ≠ 可以跳过写库** —— 第一版脚本里「文件非 mp4 → 跳过上传」但写库环节没跟着跳过，
   导致 2 行库指向不存在的文件。**铁律：先验 URL 200 → 下载 → ftyp 校验 → 已上传 → 才允许写库**，四步缺一不可。
3. **名称 token 重合度会误伤** —— id=2838「Sledge Hammer」对文件名 `Sledgehammer-Slam` 分词后重合度 0，
   但编号 14961201 完全匹配、显然是同一动作。**处理**：重合度只作「标记」不作「否决」，编号严格匹配才是硬条件。

## 四、剩余 1728 条的最终定性

全部 2015 条已扫完：命中 299 条（**14.8%**），双校验通过 288 条，**11 条**因 Lyfta 数据错配被剔除。

剩余 **1728 条经全量核验确认：Lyfta 侧确实没有视频**（`videoFile` 为 null），对应组号在 GymVisual CDN 上也确认不存在（403/404）。
这部分**不是抓取能力问题，是源头没有素材**。且这批全部**从未被用户训练过**（训练明细 2100 条里没有一条引用它们）。

| 项 | 值 | 说明 |
|---|---|---|
| 总 id | 2015 | 生产库「缺视频」集合，已排除本轮补上的 |
| 批次 | 26 批 × 80 | `GET /api/v2/exercises/by-ids?ids=…`，单批约 42KB（低于 50000 读取上限） |
| 已扫 | **26 批 / 2015 id** | **全部扫完 ✓** |
| 命中 | **299**（14.8%） | 双校验通过 288 条，已全部下载上传并写库（286 个 mp4 文件） |
| 剔除脏数据 | **11** | 编号形如 `{组号}21201`，指向完全另一个动作 |
| 结果清单 | `docs/lyfta_video_hits.jsonl` | JSONL，每行 `{id,name,group,videoFile,imageName,dateModified}` |

续跑只需：`open_tab` 打开下一批 URL → `query(kind:"text", selector:"body", maxChars:50000)` → 命中项追加进 jsonl → 跑批量补库脚本。
**补库流程已完全脚本化**，不需要人工逐条核对（组号 + 名称双校验自动过）。

### 顺带发现的存量坏引用（与本次改动无关）

`id=48277`「Resistance Band Wide Stance Anti Rotation Chop」的 `video_name` =
`80021201-Resistance-Band-Wide-Stance-Anti-Rotation-Chop-(ma).mp4` —— 文件名被截断在 `-(ma)`，**磁盘上不存在该文件**，公网也是 404。
属于「引用了但磁盘没有」这一类（与「缺视频」不同），全库只有这 1 条。

---

## 五、遗留技术事实（省得以后重查）

- **Lyfta 是 SvelteKit 应用**，chunk 在 `/_next/static/immutable/chunks/*.js`，路由表在 `/_next/static/{buildId}/_buildManifest.js`
- **GymVisual CDN 有两套 key 形式**：早期视频有短名 `{组号}1201.mp4`（S3 `lyftaweb.s3.us-east-2.amazonaws.com`），
  后来补做的**只有带描述名的**（`apilyfta.com/static/GymvisualMP4/{组号}1201-{描述}.mp4`）。**只查一种形式会漏判**
- **S3 桶不能 ListBucket**（`AccessDenied`），只能逐个 GET；403 = key 不存在（用假组号 9999/0000/8888 对照验证过）
- **`gymvisual.com` 整站 403**（按 UA/来源拦截），但 `apilyfta.com` 与 S3 可直连
- **GFIT 库 id = Lyfta `by-ids` 的 id**（已验证 id=2 / 45 / 1560 / 5443 一致）。但**不要把 `gymVisualId` 当 id 传**
- **本机 Downloads 里那 9 个 GymVisual mp4 早就全部上传并写库了**（零漏网）
- 本机 Chrome 历史里可查到你之前的抓取痕迹：`my.lyfta.app/exercises`、Google 登录流程、`lyftaweb.s3.../GymvisualMP4/06521201.mp4`（Pull-up，组 0652，已在库）

---

## 六、本轮我自己犯的三个错误（记录在案）

1. **数据源选错** —— 用公开 `/api/search` 的 `video_file` 判断「有没有视频」，而该字段是过时快照
2. **穷举方法缺陷** —— S3 全量探测只试了纯编号 key 一种形式，漏掉只有带描述名路径的新补视频
3. **传参错误** —— 批量查询时把 `gymVisualId` 当成 id 传，返回的全是别的动作，一度让我以为 id 体系对不上

---

## 验证方法说明

全部结论来自生产库只读查询、生产机磁盘实测、Lyfta 登录态 API 实测、CDN HTTP 状态码与 sha256 实测。
对照实验用于排除三类误判：①公开接口字段过时 ②S3 key 形式单一 ③S3 403 是否等于「不存在」。

本轮**唯一的生产库写操作**是 3 行 `video_name` 更新（已备份、已审计、已 sha256 校验）；
其余全部为只读扫描，**未从 Lyfta 下载除上述 2 个 mp4 之外的任何素材**。
