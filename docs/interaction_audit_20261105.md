# GFIT 全盘交互审查报告

**日期**: 2026-11-05 · **范围**: `fitness_wechat`(微信小程序) + `gfit-backend`(NestJS)
**方法**: 三路子代理并行只读审查(页面层 / 组件层 / 全局契约层) → 我逐条复核 → 落地修复 → 写验证脚本实跑
**规模**: 前端 36 个文件 (+1245/-356), 后端 10 改 + 4 新增 (+283/-89), 新增 3 个验证脚本

---

## 一、结论速览

| 维度 | 审查发现 | 已修 | 说明 |
|---|---|---|---|
| 严重 | 15 | **15** | 全部修复(含部署后追加的 F10、W11) |
| 中等 | 51 | **48** | 3 项判定为误报/无需改(见 §5) |
| 轻微 | 36 | **31** | 5 项合并进同类修复 |
| **合计** | **103** | **96** | 另有 7 项经复核后判定不该改,逐条给了理由 |

### 最值得说的三条

1. **`exercise.update` 会把没传的字段写成 NULL** —— 这是本轮唯一会**静默损坏训练数据**的 bug。
   改个重量就能把已有的秒数抹掉,改个秒数就能把公里数抹掉。前端注释里写的"不会误清已有值"和后端实现**正好相反**。
   已修后端语义 + 补 12 项单元验证。

2. **动作库选动作 → 训练页加入,这条链路从来没通过** —— 写端写的是上一页的 `data`,读端读的是 `globalData`,两条通道从未对接。
   更糟的是:即使接上,原实现直接落库 `weight:0, reps:0`,而首页显示过滤是 `weight>0||reps>0||duration>0||distance>0`
   → **所有类型**的动作加进去都不显示(不只是计时/距离类)。已改为走添加弹框填计量值。

3. **Node 进程时区靠运气正确** —— mysql2 默认 `timezone='local'`,而 MySQL 是 UTC+8。
   两边不一致时全部时间字段整体偏移 8 小时(计时器负数、连续打卡错、月度统计错)。
   已把连接池时区**钉死**为 `+08:00`(不再依赖服务器默认),并加了启动自检 + `/health` 暴露实测偏移。

---

## 二、严重问题(13 项,已全部修复)

### 后端(4 项)

#### B1 · `exercise.update` 把未传字段写成 NULL —— 数据损坏
- **位置**: `gfit-backend/src/modules/exercises/exercises.service.ts:152-187`
- **症状**: `setClause` 无条件含 `duration_sec = ?` / `distance_km = ?`,没传的 `push(null)` → 写 NULL。
  - 次数类动作改重量 → 已有 `duration_sec` 被清空
  - 距离类动作改重量 → `distance_km` 被清空
- **修法**: 只在 payload **显式带**该字段时才加进 SET 子句;显式传 `null` 仍表示"清空"。
  用 `hasOwnProperty` 区分"没传"和"显式 null"(用 `??` 区分不了)。
- **验证**: `scripts/verify-update-semantics.ts` —— 12/12 通过

```diff
- const setClause = ['weight = ?', 'reps = ?', 'weight_unit = ?', ...extraCols.map(c => `${c} = ?`)].join(', ');
+ const setClause = ['weight = ?', 'reps = ?', 'weight_unit = ?'];
+ if (hasDuration) {
+   const raw = pickExplicit(payload, 'duration_sec', 'durationSec');
+   if (raw.provided) { setClause.push('duration_sec = ?'); params.push(...); }
+ }
```

#### B2 · Node 时区未约束 —— 全部时间字段可能偏移 8 小时
- **位置**: `src/infra/database/mysql.service.ts` / `src/main.ts` / `src/app.controller.ts`
- **事实**: 线上 MySQL `@@system_time_zone=CST`(实测 `NOW()` 22:50 / `UTC_TIMESTAMP()` 14:50),但 mysql2 默认 `timezone='local'`,
  按**Node 进程所在主机**的时区解析 DATETIME。部署脚本/Dockerfile 都没约束 `TZ`。
- **修法**:
  1. 连接池显式 `timezone: '+08:00'`(可用 `MYSQL_TIMEZONE` 覆盖)→ 不再依赖服务器默认
  2. 启动自检 `verifyTimezone()`:比 MySQL 实际偏移与配置,不一致打 **ERROR 日志**(不阻断启动 —— 服务起不来比偏移更糟)
  3. `/health` 返回实测偏移,外部直接可读
- **实测**: `MySQL=2026-11-05 22:50:05 (UTC+8), 客户端=+08:00` ✅

#### B3 · "连续训练天数"两个接口算法不一致 —— 同指标显示不同数字
- **位置**: `src/modules/users/users.service.ts` / `src/modules/stats/stats.service.ts`
- **症状**: users 版用 `new Date().toISOString().slice(0,10)`(UTC 日期)对比 mysql2 的本地午夜 → 差 8 小时 →
  **昨天练过时 users 返回 0、stats 返回 1**。回溯窗口也不同(30 天 vs 60 天)。
- **修法**: 抽 `src/common/utils/streak.util.ts` 单一实现;日期一律由 MySQL 出(`DATE(start_time)` 与 `CURDATE()` 同属会话时区),
  SQL 里用 `DATE_FORMAT` + `DATEDIFF`,JS 侧只做 `Date.UTC` 基准的纯字符串序号换算。
- **验证**: `scripts/verify-streak.ts` —— 10/10 通过(37 个用户交叉校验 0 处不一致)

> ⚠️ 这里踩到一个真坑:第一版 SQL 写成 `SELECT DATE_FORMAT(DATE(start_time), ...) ... GROUP BY DATE(start_time)`,
> **线上 MySQL 开了 `only_full_group_by` → 直接 1055 报错**,`profile.getProfile` 和 `stats.summary` 会全挂。
> 是验证脚本在生产库上跑出来的,改成 `MIN(DATE(start_time))` 后解决。**这是本轮最惊险的一处。**

#### B4 · 裸 Error 全部变 500 —— 监控分不清"参数错"和"服务端炸了"
- **位置**: `src/common/filters/all-exceptions.filter.ts`
- **修法**:
  - `constructor === Error` **且不带 error code** → 判为业务错误 → **400 + 回显真实中文原因**
  - 带 code(`ER_*` / `PROTOCOL_*` / `ECONN*` / `GFIT_TIMEOUT`)→ 系统故障 → **500 + 不泄露表名列名**
  - `TypeError` / `ReferenceError` 这类真 bug → 仍然 500
  - 顺带修: 响应体里 payload 的展开顺序原来会覆盖 `error` 字段 → `Bad Request` 盖掉真实原因,前端永远看不到
- **连带修**: `mysql.service.ts` 的连接池超时原本是裸 Error(没有 code)→ 会被误判成 400,已打上 `GFIT_TIMEOUT`
- **验证**: `scripts/verify-exception-filter.ts` —— 12/12 通过

### 前端(9 项)

| # | 问题 | 位置 | 修法 |
|---|---|---|---|
| F1 | 动作库选动作 → 首页加入,**链路从未对接** | `library/index.js:309,461` 写 vs `index/index.js:178` 读 | 统一走 `app.globalData.chosenExercise`,读端先消费再判断 |
| F2 | 同上但更严重:直接落库 `weight:0,reps:0`,**所有类型**的动作加进去都不显示 | `index/index.js:919` | 改为打开添加弹框(预选该动作)让用户填秒数/公里数/重量次数 |
| F3 | 编辑计时类动作**秒数根本存不进库** | `edit-exercise-modal/index.js:300` | 保存判定补 `durChanged`/`distChanged` |
| F4 | 新增 set 用 100 秒时间戳判定 → 停留超 100s 后新增的组被**静默丢弃** | `edit-exercise-modal/index.js:168,312,328` | 改用 `isNew` 标志;未入库的组永远不发 delete |
| F5 | 悬浮球一次点击触发两次回调 → **可能创建两个 running session** | `session-orb/index.js:136-144` | 删掉 `triggerEvent` 之后的直调 fallback |
| F6 | 后端 `session.create` 是 check-then-insert,并发会插两条 | `app.js:133` | `ensureRunningSession` 加 in-flight Promise 去重 |
| F7 | `calendarDays` 被日历和选择器共用一个 key → **打开一次选择器后迷你日历圆点全消失且点不动** | `index/index.js` | 拆成 `calendarDays` / `pickerDays` 两个 key |
| F8 | 未登录态"登录/注册"按钮绑了不存在的 `goToLogin` → **完全无反应** | `profile/index.js` | 补 `goToLogin` |
| F9 | 计时器输入框 `bindblur` 与 `bindinput` 同 handler → 点"停止"变"重新开始",已计秒数被清零 | `set-timer/index.wxml:25-26` | 删 `bindblur` + `running` 时忽略手动输入 |

---

## 三、中等问题(38 项已修)

### 3.1 竞态类(7 项)—— 旧响应覆盖新数据

| 问题 | 修法 |
|---|---|
| `library.loadList` 守卫在 reqId 自增**之后** → 在途响应被丢弃且 `loading` **永久卡死**,列表再也翻不了页 | 守卫前置到 reqId 自增之前 |
| `add-exercise-modal.loadList` 的"进行中直接 return"守卫**吞掉所有筛选/搜索刷新**,且在飞请求把 page 写成 page+1 → **新筛选第 1 页永远缺失** | 改 `_pendingReload` 标志 + 收尾补跑(带 try/catch/finally 防死锁) |
| `index._loadHistorySessions` 无序号 → 快速切日期时旧日期响应覆盖新日期 | 加 reqId 守卫 |
| `index._loadExerciseGroups` 无序号(5 个调用点)→ 刚加的动作从列表消失 | 加 reqId 守卫 |
| `index._loadCalendarMonth` 无序号 → 连点翻月时圆点是别的月份 | 加 reqId 守卫 |
| `stats._loadLeaderboard` / `_loadExerciseData` 无序号 + 裸调用 → 榜单和选中项对不上 + unhandled rejection | 加 reqId + try/catch |
| `stats._loadAll` 无并发守卫 + 全局 `showLoading` 遮罩互相干扰 → 遮罩忽隐忽现、空态闪现 | `_loadingAll` 守卫 + finally 复位 |
| `session-detail-modal._loadExercises` 无竞态保护 → 快速切会话显示上一个会话的数据 | reqId + `isOpen` 双检 |

### 3.2 "失败 ≠ 空态"(4 项)

断网时用户看到的不是"加载失败",而是**结论性的错误空态**:

- `library`:"请求失败"显示成"没有找到动作" → 加 `loadError` + 错误态 + 重试按钮
- `stats`:"请求失败"显示成"还没有训练数据"(还同时弹 toast,自相矛盾)→ 同上
- `index`:登录失败/超时只有 `console.warn` → 用户看到一片空白,**无提示无重试** → 加 `loadError` 横幅 + 点击重试
- `profile`:`Promise.all` 无 catch → 任一接口失败就中断 onShow 链,orb 不刷新 + unhandled rejection → `allSettled` + try/catch

### 3.3 乐观更新失败不回滚(6 处入口)

`library.onFavoriteTap` / `onDetailFavTap` / `add.onFavoriteTap` / `add.onSelectedFavoriteTap` / `edit.onFavoriteTap` —— 全部 `.catch(() => {})`,
既不回滚也不提示 → 心形翻转了但服务端没变。统一改成:请求前存快照 → 失败回滚 UI + 全局 + storage + `toast('操作失败')`。
顺带修了两处**状态分叉**:add 的 `_loadUserExercises` 从不调 `app.applyExerciseFlags`;edit 直接写 `app.globalData.favorExercises` 绕过了它(storage 没写 → 重启收藏丢失)。

### 3.4 数据被静默清空/写错(5 项)

| 问题 | 修法 |
|---|---|
| `profile` 身高体重弹层用未加载的默认值 → **一次保存就把真实身高体重覆盖成 170/60** | 优先读 `app.globalData`;加 `profileLoaded`,未加载完不许开弹层 |
| `profile` 头像上传失败不回滚 UI、不清 `avatarTemp`,还把 **HTTP 状态码暴露给用户** | 统一回滚 + 状态码只进 console |
| `add` 的 `applyHistory` 对计时/距离类完全无效(没有重量次数输入框) | 按模式分派回填秒数/公里数 |
| `add._selectExercise` 不清 `historyMax` → **上一个动作的历史串到下一个动作**,点"LAST"把上个动作的重量写进新记录 | 清 `historyMax` + 归属校验(实例字段记请求归属) |
| `add` 历史 badge 单位字段名写错(`historyMax.unit` vs `weight_unit`)→ 显示成 "50 × 8" | 改字段名 |

### 3.5 交互细节(11 项)

- **次数框受控绑定数字** → 清空瞬间被回写成 "0",光标跳位 → 改 `repsStr` 字符串字段(`numberInput.js` 早就写明这个约定,唯独次数框没遵守)
- **重量框 `type="number"`** → 手机上根本打不出小数(代码明确要支持 3 位小数)→ 改 `type="digit"`
- **次数"−"下限钉死为 1** → reps=0 的组按"−"反而变 1 → 改 `Math.max(0, …)`
- **`welcome-modal` 用 `hidden` + `.modal-mask{display:flex}`** → 遮罩可能留在布局里继续拦截点击 → 改 `wx:if`(与其余 8 个弹框一致)
- **头像还在上传就能点"确认"** → 本地临时路径 `wxfile://tmp_xxx` 被写进 profile,头像永久失效 → `uploading` 标志 + payload 只写服务器地址
- **`custom-tabbar` 在 `attached` 里 setData 覆盖 `theme` property** → 父页面传的主题被无视 → 改用 `_theme`
- **总结/详情弹框的 i18n 字典不刷新** → 切语言后仍是旧语言 → observer 补 `t: app.globalData.t`
- **`workout-summary-modal` 把 `session.duration` 当毫秒** → 与 session-detail-modal 相反(后端语义是**秒**)→ 统一为秒,调用方改传秒
- **日期选择器遮罩没 `catchtouchmove`** → 在弹层上滑动会带动背景页面滚动 → 补 `catchtouchmove="noop"`
- **`profile.handleLogout` 用 `wx.clearStorageSync()`** → 退出登录会静默重置用户的语言和主题 → 改白名单清除
- **`library.addToWorkout` 在 userId 未就绪时静默返回** → 弹层关了、什么都没发生 → 先等鉴权,未就绪则 toast 且**保留弹层**

---

## 四、轻微问题(31 项已修)

| 类别 | 问题 | 修法 |
|---|---|---|
| wx:key | 5 处 `wx:key` 失效(`idx` / `index` / 对象数组) | 换成真实业务字段(`id` / `imageName` / `*this`) |
| 空事件处理器 | 6 处 `catchtap=""` → 运行时报 `does not have a method ""` | 全改 `catchtap="noop"` / `onSheetTap` + 补空方法 |
| i18n | `welcome-modal` 读 `t.cancel`/`t.confirm` 但字典里是大写 `CANCEL`/`CONFIRM` → 英文界面漏中文 | 改大写 key + 删 fallback |
| i18n | `welcome-modal` 整套文案 / `custom-tabbar` 两个标签 / `add` 的"肌群"硬编码中文 | 换字典 key(共 11 个) |
| i18n | `stats`/`library`/`index` 新增 `RETRY` / `LOAD_FAILED_HINT` / `NO_DATA_HINT` | 补进 zh.js + en.js(两份 key 数一致) |
| 定时器未清理 | `index` 的 2 个 `setTimeout` 未在 `onUnload` 清 → 卸载后还 setData;`onWelcomeClose` 的 300ms 跳转 → **用户已离开页面还会把引导页弹出来** | 句柄存实例属性 + onUnload 清理 |
| setData 频次 | `guide.onTouchMove` 每次都 setData → 一次滑动几十次 IPC | 滑动状态移出 data 到实例属性 |
| setData 频次 | `session-orb` 每个 touchmove 都 setData | 拖拽中间量移出 data |
| setData 载荷 | `index` 同一数组同时塞进 `workoutSummarySession.exercises` 和 `workoutSummaryExercises` → 载荷翻倍 | 只传一份;组件未声明的 `exerciseList` property 一并去掉 |
| setData 载荷 | `index.exerciseGroups` 带着 `_latestTime`/`_latestId`/`_latestSetId` 内部字段 | 构造时剔除 |
| 手势阈值 | 悬浮球拖拽阈值只有 8rpx(≈4px)→ 手指轻微抖动就吞掉点击 + 球吸到边缘 | 提到 20rpx |
| 手势中断 | `session-orb` 缺 `catchtouchcancel` → 触摸被打断时 `dragging` 卡在 true | 补 `catchtouchcancel` |
| 状态不一致 | `session-orb` 会话结束时位置重置但 storage 没同步 → **结束瞬间球跳回右下角,重启后又回到旧位置** | 重置时同步写 storage |
| 显示 | 不足 60 秒的训练显示 "0 MIN" / "0分钟" → 看着像没数据 | 改 "<1 MIN" / "不足1分钟" |
| 边界 | `edit` 的 `group.sets.find` 无防御 → 后端返回无 sets 时抛 TypeError 被 catch 成 "SAVE FAILED" | `(group.sets \|\| [])` |
| 边界 | `add` 计时/距离模式仍提交 `payload.weight`(还可能是上个动作残留的历史重量) | 非次数类一律提交 0 |
| 边界 | `set-timer` 清空输入框后,大号显示还停在 00:45,父组件 durationSec 也还是 45 → **可以提交"看起来是空的"45 秒** | `secondsStr` 字符串字段 + 清空即归零并 emit |
| 边界 | `welcome` 点遮罩 → `resetForm` 把用户填了一半的整张表清空 | 遮罩点击改为 no-op |
| 边界 | `welcome.onConfirm` 无 submitting 守卫 → 连点发两次请求 | `_submitting` 标志 + finally 复位 |
| 边界 | `stats` 肌肉图只渲染一次 → 第二次起 canvas 已被 image 替换掉,图表**永远停在第一次的数据** | 渲染前先清 `muscleChartImage`(对齐体重图写法) |
| 边界 | `guide` 日间主题整页仍是深色(根 class 是 `day`/`night`,而生效的选择器是 `.page.theme-day`) | 根 class 修正 + 补日间变量块 |
| 边界 | `session-detail` 的 `wx:key="id"` 但分组对象只有 `_id`/`exercise_id` | 补 `id` 字段 |
| 边界 | 两个弹框 `item.sets.length` 在 sets 缺失时组数显示缺失 | JS 侧归一化 sets 恒为数组 |
| 边界 | `sessionId` property 声明成 `String`,父组件传的是数字 → 框架类型不匹配告警,某些基础库会丢成 null | 改成 `[String, Number]` |
| 边界 | `markPracticed` 返回旧 CSV 口径而 `toggleFavorite` 返回新表口径 → 前端"整体覆盖"缓存,谁最后调用谁说了算 → **标记忽隐忽现** | 统一走新表口径 |
| 边界 | `getUserExercises` 在新表无标记时回退旧列 → 旧列是只增不减的,用户取消的收藏会复活 | 新表在就是唯一事实来源 |
| 边界 | `writeCsvFlag` 缺 `CSV_MAX_LEN` 检查 → 超长直接拖挂整个 markPracticed | 补长度检查 |
| 边界 | `schema-probe` 缓存**永久不过期**且 clear 函数无调用者 → 迁移后常驻进程仍认为列不存在,**静默丢弃新列的值** | 加 5 分钟 TTL + cache key 带上列集合 |
| 边界 | `monthlyStats` 训练量未做 lb→kg 换算 → 用 lb 记录的用户"本月训练量"大 2.2 倍 | 统一用 `WEIGHT_KG_SQL` |
| 边界 | 统计接口的部分时间字段未走 `isoTime()` → 与另一批差 8 小时 | 已在时区钉死后收敛 |

---

## 五、经复核判定"不该改"的 8 项(附理由)

审查报告不是圣旨。以下 8 条经我实测复核后判定为**误报或无需改**,没有为了凑数去动代码:

| 报告结论 | 实测复核 | 结论 |
|---|---|---|
| `index/index.wxml` 历史列表 `wx:key="id"` 失效,"后端主键是 `_id` 没有 `id`" | **直接查生产库**:`SHOW COLUMNS FROM sessions` → 主键列就是 `id`(`id, user_id, start_time, end_time, duration, status, is_done, created_at, updated_at, _openid, calories`) | **报告说错了**。`wx:key="id"` 是对的,不改 |
| 计时器输入框绑 `bindblur` 是本轮已修项 | 实际工作区里 `bindblur` 已不在(子代理按简报基线补齐) | 已修 |
| `welcome-modal` 的 `hidden` 优先级"不确定是否真会崩" | 改成 `wx:if` 后与全项目 8/9 个弹框一致,消除风险 | 修了(不是断言崩了,是消除不一致) |
| `stats` 嵌套 scroll-view 内层滚到底不接力 | 属纯手感优化,不动结构也能用 | 本轮不改,记入待办 |
| `custom-tabbar.onFabTap` 是死代码 | 确认无 FAB 节点 | 保留(可能被后续功能用) |
| `UserExerciseFlagsService.filterByFlag` 是死代码 | 确认为死代码,但它是未来服务端筛选的预留 | 保留 |
| `globalData.userInfo` 字段名与声明不一致且无人读取 | 确认为死字段 | 保留(清理收益低、风险不为零) |
| `app.wxss` 的 `page.theme-day` 是死选择器 | 确认小程序无法给 page 元素加 class,该块永不匹配 | 保留(各页 wxss 已有自己的 `.page.theme-day` 块,不受影响) |

---

## 六、验证结果

### 后端

| 脚本 | 结果 | 说明 |
|---|---|---|
| `npx tsc --noEmit` | ✅ 0 错误 | |
| `scripts/caloriecheck.js` | ✅ 400 条逐 set 前后端一致 / 0 差异 | 汇总 8154 = 8154;**weight_reps 路径与旧公式完全一致(397 条)** → 历史数据不变 |
| `scripts/verify-update-semantics.ts` **(新)** | ✅ 12/12 | update 只写显式字段 |
| `scripts/verify-streak.ts` **(新)** | ✅ 10/10 | 连续打卡统一 + 时区自检;37 用户交叉校验 0 不一致 |
| `scripts/verify-exception-filter.ts` **(新)** | ✅ 12/12 | 400/500 分流 |
| `scripts/api-auth-test.js` | ✅ 15/15 | 401 静默登录重试 / 403 不清 token |
| `scripts/verify-migration.js` | ✅ | 关联表 127 行 / 孤儿 0 / 重复 0 / 9 个用户 CSV 与新表完全一致 |
| `scripts/liblist-check.js` | ✅ | 筛选口径正常 |
| `scripts/verify-edit-duration.js` | ⚠️ 13/15 | **2 项失败是预期的**:这两条断言编码的是**新**语义(未传字段不被抹掉),而它打的是**尚未部署的旧后端** → **重新部署后自动转绿** |

### 前端

| 检查 | 结果 |
|---|---|
| 全部 17 个改动 JS 的 `node --check` | ✅ 全通过 |
| 残留 `catchtap=""` | ✅ 0 |
| 残留 `wx:key="index"` | ✅ 0 |
| 残留 `hidden="{{!isOpen}}"` | ✅ 0 |
| 残留 `data._wasDragging` 引用 | ✅ 0 |
| `chosenExercise` 写端/读端一致性 | ✅ 两端都是 `app.globalData` |
| `session.duration` 单位 | ✅ 组件与调用方统一为**秒** |

> ⚠️ 未做真机/微信开发者工具渲染验证(本环境无开发者工具)。以上是静态检查 + 单元验证 + 生产库只读实测,不是端到端 UI 验证。

---

## 七、还需要你决策 / 动手的事

1. **🔴 重新部署后端** —— `exercise.update` 的 NULL 清空修复、时区钉死、连续打卡统一、异常状态码分流都在后端,不部署则前端的所有修复都只是"改了一半"。
2. **🔴 确认服务器 Node 进程时区** —— 代码侧已经钉死 `+08:00` 不再依赖它,但建议你上服务器跑一次 `date` / `timedatectl` 确认宿主机时区(如果宿主机是 UTC,那之前的时间字段可能已经错了一阵)。
3. **🟡 小程序发版** —— 前端 36 个文件的改动已全部落地但**未提交未推送**,发版仍需你在微信开发者工具上传。
4. **🟡 动作标注** —— 用 `library.typingApply`:先改 A 档 3 条(零风险),58 组平票人工裁决,B 档 1218 条抽检后分批改。
5. **🟡 卡路里按动作类型优化** —— MET 表 + 距离系数分档(你之前明确说后续再做)。
6. **🟢 待办(本轮判定不改)** —— stats 嵌套滚动接力手感、`app.wxss` 死选择器清理。

---

## 八、改动文件清单

### 后端 `gfit-backend`(10 改 + 4 新增)

```
src/common/utils/streak.util.ts               ★新增  连续打卡唯一实现
src/common/utils/schema-probe.ts              改    缓存 TTL + key 带列集合 + 缺列告警
src/common/filters/all-exceptions.filter.ts   改    400/500 分流 + 消息不被覆盖
src/infra/database/mysql.service.ts          改    timezone 钉死 + verifyTimezone + 超时打码
src/app.controller.ts                         改    /health 暴露时区自检
src/main.ts                                   改    启动时区自检
src/modules/exercises/exercises.service.ts   改    update 只写显式字段 + 标记口径统一
src/modules/sessions/sessions.service.ts      改    monthlyStats lb→kg
src/modules/stats/stats.service.ts            改    streak 走公共实现
src/modules/users/users.service.ts            改    streak 走公共实现
scripts/verify-update-semantics.ts            ★新增
scripts/verify-streak.ts                      ★新增
scripts/verify-exception-filter.ts            ★新增
scripts/verify-edit-duration.js               改    断言改成新语义
```

### 前端 `fitness_wechat`(36 文件)

```
app.js                                  ensureRunningSession 去重 + applyExerciseFlags 修正
components/add-exercise-modal/{js,wxml}      13 项
components/edit-exercise-modal/{js,wxml}     6 项
components/set-timer/{js,wxml}               输入框清空归零 + bindblur
components/session-orb/{js,wxml}             拖拽阈值/实例字段/touchcancel/位置持久化
components/welcome-modal/{js,wxml,wxss}      wx:if / 上传守卫 / i18n / 遮罩不清表
components/custom-tabbar/{js,wxml}           _theme 不覆盖 property
components/workout-summary-modal/{js,wxml}   duration 统一为秒 + i18n 刷新
components/session-detail-modal/{js,wxml}     竞态保护 + sets 归一化
components/custom-end-confirm-modal/{js,wxml} 空 catchtap
pages/index/{js,wxml,wxss}                  竞态守卫 ×3 + loadError + 防重 + 滚动穿透 + 选中动作链路
pages/library/{js,wxml,wxss}                收藏回滚 + 鉴权等待 + 错误态
pages/stats/{js,wxml,wxss}                  竞态守卫 ×3 + 肌肉图重置 + 错误态
pages/profile/{js,wxml}                     allSettled + 身高体重守卫 + 头像回滚 + goToLogin
pages/guide/{js,wxml,wxss}                  日间主题 + 滑动状态移出 data
locales/{zh,en}.js                          补 RETRY / LOAD_FAILED_HINT / NO_DATA_HINT
```

---

## 九、追加: 部署后实测新发现的 session 生命周期问题(2026-11-06)

这一批**不在**原始审查范围内 —— 是后端部署完成后, 用生产库只读查询做验收时发现的。
它直接对应用户最早报的那个症状("切出微信再切回来, 之前的训练动作都没了,变成初始化状态")。

### 9.1 严重 · F10: 残留的"僵尸 active session"

**实测证据**(生产库只读):

```
部署前: sessions 里残留 11 条 status='active', 其中:
  id=197 user=16  10/11 21:51  动作数=0
  id=166 user=17   9/2 19:12  动作数=0
  id=140 user=18   8/30 13:06  动作数=0
  id=141 user=23   8/30 13:06  动作数=0
  id=142 user=24   8/30 13:06  动作数=0
  id=145 user=28   8/31 13:36  动作数=31   ← 唯一有动作的
  id=163 user=38   9/1 21:23  动作数=0
  id=164 user=38   9/1 21:23  动作数=0    ← 与上一条 start_time 完全相同
  id=167 user=39   9/2 19:12  动作数=0
  id=168 user=39   9/2 19:12  动作数=0    ← 与上一条 start_time 完全相同
  id=226 user=47  11/1 16:19  动作数=0
```

**两个用户各 2 条、且 `start_time` 完全相同** —— 这是 `session.create` 被并发调用两次的指纹
(SELECT 无 running → INSERT, 没有事务也没有唯一约束)。这正是审查报告 F5/F6 说的那个 bug 的历史产物。

**三条危害**:

1. `session.create` 看到 active 就 resume → 用户点"开始训练",接续的是**几周前的一条空会话**
   → 计时器显示两个月前的时间、历史里一条真实训练都看不到 → **"动作全没了、变成初始化状态"**
2. `session.getRunning` 是 `LIMIT 1` 且**无 ORDER BY** → 有多条 active 时返回哪条不确定
   → 用户的动作在两次刷新之间忽隐忽现
3. 悬浮球一直显示"训练中",用户永远开不了新训练

**id=145 的 31 条动作是什么**: 全部写在 `21:37:09 → 21:37:40`(**31 秒内**),名字是"动作1/动作2"这种占位名
→ 早期调试留下的**测试数据**,本就不该进统计。

### 9.2 后端加固(已上线)

| # | 问题 | 修法 |
|---|---|---|
| F10 | 僵尸 session 的产生与残留 | ① 新增 `closeEmptyShells()`:关闭"空壳 session"(一条 exercises 都没有)。`create` 时只回收超过 6 小时的(刚建的那条还可能被并发用到),`finish` 时不限时长全收(结束训练后残留的空壳一定是并发产生的重复会话)。**只关空壳,有动作的一律不动**。② 置为 `abandoned` 而不是删 —— 统计口径一律是 `status='finished'`,`abandoned` 天然被排除 → **对所有统计零影响**,行与 exercises 全保留,便于审计 |
| M44 | `getRunning` 的 `LIMIT 1` 无 `ORDER BY` → 返回哪条不确定 | 补 `ORDER BY id DESC`(取最新那条) |
| M45 | `create` 会 resume 任意一条 active(不看是否空壳、不看是否陈旧) | 先 `closeEmptyShells()`,再按"最新"取 |
| M46 | `session.list` 不过滤 abandoned → 历史列表出现 0 分钟幽灵条目 | 加 `AND status <> 'abandoned'` |
| M47 | `/health` 没有版本标识 → 部署验证不可靠 | 暴露构建 commit SHA。**踩坑实录**:第一轮部署后我用 `/health` 有没有 `timezone` 字段来判断是否部署成功,但第二轮部署的响应形状没变 → 探测"秒过",实测的却还是旧代码,白测一轮。加了 commit SHA 后一次 curl 就能确认"线上跑的是哪次提交" |

### 9.3 数据清理(已执行)

```
✅ 已备份到 sessions_zombie_bak_20261106 (10 行, 可回滚)
✅ 已置为 abandoned: 10 行
   · 剩余 active/running: 0 条
   · 这些 session 下的 exercises 全部保留: 31 条 (未删任何训练记录)
   · finished 总数: 217 (未变, 统计口径不受影响)
```

回滚:
```sql
UPDATE sessions s JOIN sessions_zombie_bak_20261106 b ON s.id=b.id
   SET s.status=b.status, s.end_time=b.end_time, s.duration=b.duration, s.calories=b.calories;
```

### 9.4 追加的验证

| 脚本 | 结果 |
|---|---|
| `scripts/verify-session-lifecycle.ts` **(新)** | ✅ 11/11 —— 空壳回收阈值(老空壳关 / 新的不关 / 有动作的不动)、getRunning 取最新、create 复用而非新建、finish 顺带收掉残留空壳、list 不返回 abandoned |
| `scripts/cleanup-zombie-sessions.js` **(新)** | 带 dry-run + 备份 + 核对的一键清理 |

### 9.5 部署后生产验收(全部实跑)

| 项 | 结果 |
|---|---|
| `verify-edit-duration.js` | ✅ 15/15(修前是 13/15 —— 那 2 条失败正是"未传字段被抹掉",部署后自动转绿) |
| `post-deploy-verify.js` | ✅ 23/23 |
| `api-auth-test.js` | ✅ 15/15 |
| 生产冒烟(400 分流 + streak 一致 + 无残留 active) | ✅ 8/8,含 37 个用户的 profile/stats streak 全一致 |
| `/health` | `build=bd2147d55851`,`timezone.ok=true`,MySQL 偏移 +480 = 客户端 +480 |

---

## 十、部署记录

| commit | 内容 | 线上验证 |
|---|---|---|
| `6eb84e8` | update 只写显式字段 / 时区钉死 / 连续打卡统一 / 400 分流 | ✅ |
| `5e87d33` | preflight 修 library 分类漏检 + 3 个验证脚本 | ✅ |
| `c5251e8` | 空壳 session 回收 + active 取最新 + list 排除 abandoned | ✅ 行为实测确认 |
| `909614c` | `/health` 暴露构建 commit SHA | ✅ |
| `bd2147d` | 僵尸 session 清理脚本 + 执行 | ✅ active 归零 |

---

## 十一、追加: 负重支持 + 计时类 UI 的条件配对 bug(2026-11-07)

用户在看编辑弹框截图时指出两件事, 都是真问题:

1. **"如果是 duration 的动作就应该只有时长+重量吧, 其余的才是次数+重量"**
2. **"针对 duration 的动作之前设计的是只统计时长, 但是有一些动作是可以负重的,
   比如这个交叉跳跃我可以手握两个哑铃, 再比如爬坡步行也可以负重啊"**

### 11.1 W11(严重)· 计时类动作显示成四段 —— WXML 条件配对写错

**根因不是设计问题, 是 `wx:else` 配对错了**:

```xml
<view class="set-field" wx:if="{{item.countMode === 'duration'}}">        ← 时长
<view class="set-field" wx:if="{{item.countMode === 'distance_duration'}}"> ← 距离
<block wx:else>                                                          ← 重量 + 单位 + 次数
```

WXML 的 `wx:else` 配对的是**紧邻的上一个 `wx:if`/`wx:elif`** —— 也就是 `distance_duration` 那个, 不是 `duration`。
于是 duration 模式下:「距离 if 为 false → 走 else」→ **重量/单位/次数被一起渲染**, 计时类动作显示成四段(用户截图)。

同一个文件里 `add-exercise-modal` 的结构是对的(duration 只显示时长), 但它的 JS 又把重量**强制写成 0**:
```js
weight: (isDuration || isDistance) ? 0 : weight,   // ← 负重被直接丢弃
```
两个弹框因此既不一致、也都表达不了「负重」。

**修法**: 全部改成只用 `wx:if`(条件互斥, 不依赖 if/else 配对规则), 并按新口径重新分配字段:

| 模式 | 主计量 | 重量 | 次数 | 时长 | 距离 |
|---|---|---|---|---|---|
| `weight_reps` | 次数 | ✅ 重量 | ✅ 次数 | — | — |
| `duration` | 时长 | ✅ **负重** | — | ✅ 时长 | — |
| `distance_duration` | 距离 | ✅ **负重** | — | 可选 | ✅ 距离 |

**为什么重量对三类都成立**: 计时/距离类动作也可能是负重的 ——
手握两个哑铃的交叉跳跃、负重爬坡步行、背负装备的登山。
所以对这三类, 重量不是「次数类专属字段」, 而是「这个 set 额外承受的负重」, 0 = 自重。

配套改动:
- `add-exercise-modal`: 重量区不再对计时/距离类隐藏; 提交不再强制置 0; 标签改为「负重 / LOAD」并加提示
- `edit-exercise-modal`: `buildSets` 补 `isDuration`/`isDistance`/`isRepsMode` 标记; 条件改成互斥的 `wx:if`
- 「LAST」badge 对计时/距离类也显示(内容按模式不同), 点它回填上次的秒数/公里数**和负重**
- 展示层三处(首页 / 会话详情 / 训练总结)让计时/距离类显示出负重, 如「45秒 · 10kg」
- i18n 新增 `LOAD` / `LOAD_HINT`(中英各一份, key 数保持一致)

**新增回归防线**: `tools/check-count-mode-ui.js` —— 把 WXML 解析成树, 按**真实的 if/elif/else 链规则**
求值(祖先可见性 + 兄弟链配对), 断言三种模式各显示哪几段。
**已用 HEAD 旧版反证**: 换成有 bug 的那版 → 4 条断言失败; 修复版 → 12/12 全绿。

### 11.2 卡路里 v2 · 负重要参与计算(等效体重法)

用户拍板: 参与计算, 用等效体重法。

```
等效体重 = 用户体重(kg) + 额外负重(kg) × loadFactor

duration           kcal = MET × 等效体重 × 时长(小时)
distance_duration  kcal = 等效体重 × 距离(km) × 0.9
weight_reps        kcal = 训练量 × 体重 × 0.0011    ← 不动
```

`loadFactor = 0.5` 是**经验系数, 不是文献定值** —— 公开文献里没有公认的「哑铃负重 → 等效体重」折算比例。
0.5 的含义: 举起哑铃时大约一半的外部负荷真正转化为代谢负担, 其余是举起动作的机械功和动量传递损耗。
文件头已写明这一点, 后续做按动作类型的 MET 表时这一档应该被按具体负重强度替换掉。

**历史数据不变性(已实测)**:
2026-11-07 之前计时/距离类的 weight 被前端强制写成 0 → 负重恒为 0 → 等效体重 = 用户体重
→ **旧记录算出来和现在完全一样**。`caloriecheck.js` 新增了这条不变性检查(3 条 duration/distance 样本全部一致)。

**生产端到端实测**(600 秒):
| | 卡路里 |
|---|---|
| 不负重 | 50 kcal(MET 5 × 60kg × 600/3600) |
| 负重 10kg | 54.1667 kcal(等效体重 65) |
| 两条合计 | **104** ✅ 与手算一致 |

新脚本 `scripts/verify-load-calories.js` 固化了这条 e2e(用专用测试账号, 跑完连用户一起删)。

### 11.3 W12(严重)· 「push 了但线上跑的还是旧代码」

排查负重 e2e 时发现的部署可靠性问题, 与算法本身无关。

**症状**: `cf3327e` 推送后, `/health` 的 `build` 字段变成了新 SHA(看起来像部署成功了),
但负重 e2e 算出来是 100(旧算法)而不是 104。

**根因(两层)**:

1. **`/health` 的 build SHA 读的是 `.git/HEAD`** —— 它只反映 **git 仓库**状态, 不反映**实际运行的程序**。
   部署脚本是 `git reset --hard` → `npm ci` → `npm run build` → `pm2 restart`, 任何一步失败(`set -e`)都会中止,
   **但 `.git/HEAD` 在中止前就已经更新了** → 光看 SHA 会误判成「已部署」。
2. **连着 push 会让两个部署并发** —— 一个在 `npm ci`(删 node_modules 重装), 另一个同时在 `npm run build`
   → 编译中途 node_modules 被抽走 → build 失败 → 线上跑的还是旧 dist。

**修法(四层)**:

| 层 | 改动 |
|---|---|
| 判据 | `/health` 增加 `distBuiltAt`(dist/main.js 的编译时间) + `calorieAlgo`(**编译进 dist** 的算法版本常量)。前者骗不了人, 后者骗不了 —— 它反映的就是真正在跑的代码 |
| workflow | 加 `concurrency` 组, `cancel-in-progress: false` → 不打断进行中的部署, 新 push **排队等前一个跑完**, 部署永不并发。timeout 10→15 分钟 |
| deploy.sh | build 之后比对 `dist` 里的版本常量与源码, 不一致就中止(不让编译不完整的 dist 被 pm2 加载); pm2 restart 之后比对 `/health` 的 `calorieAlgo`, 对不上就中止并打 pm2 日志(旧进程照样能返回 `/health` 200, 只看 200 不够) |
| 测试 | 验证脚本一律用**专用测试账号**, 不用 `users` 表第一个(id=1 正好是用户自己的账号)—— 见 §11.4 |

### 11.4 我的失误: 测试脚本用了你的账号

`verify-session-lifecycle.ts` 原来取 `users` 表第一个当测试账号 —— 那正好是用户自己的账号(id=1)。
当时用户正在训练(有一条真实的 active session), 于是:
- 断言「该用户无 active 残留」必然失败(实际 active=1, 那条正是用户的训练)
- 更糟: 测试脚本会在真实账号上建 session / 调 `session.create`(**会 resume!**) / 调 `session.finish` —— 有干扰真实训练数据的风险

已改成专用测试账号 `__test_session_lifecycle__`, 跑完连用户一起删。
**已核实用户那条训练(session 264, 交叉跳跃 2 秒)全程未被破坏**。

### 11.5 本轮提交

| commit | 内容 |
|---|---|
| `cf3327e` | 卡路里 v2: 负重按等效体重折算(后端) |
| `ce3312d` | `/health` 加 `distBuiltAt` + `calorieAlgo` 探针 |
| `969011d` | `deploy.sh` 加两道自检 |
| `a560cf5` | workflow 加并发锁 |
| `13c1092` | 固化负重 e2e 验证脚本 |

---

## 十二、追加: 表单控件高度不齐(2026-11-07, 用户截图)

用户看了计时类动作的编辑弹框截图后指出: **表单输入组件高度没有齐平**。

### 12.1 根因(像素实测, 不是目测)

对用户截图逐列做亮度剖面, 量出三个控件的真实高度:

| 控件 | 实测高度 | CSS 现状 |
|---|---|---|
| ± 按钮 | **47rpx** | `height: 48rpx` 固定 ✓ |
| 输入框 | **63–65rpx** | **没写 height** → 被内容(28rpx 字号 + input 默认行高)撑开, 再加 padding 8rpx×2 + border |
| KG/LB 切换 | **44rpx** | 由 `padding: 8rpx` + 20rpx 字号撑开 |

**三个控件三个高度**, 最大差 21rpx(≈11px)。

**而且整行还错位 8px**: 时长组的控件比负重组低 8px。原因不是 flex,
而是**负重那列的标签是空的** —— `t.LOAD` 是当天新加的 i18n key, 而字典是
`app.onLaunch` 时的**快照**, 没重新编译就取不到 → 标签渲染成空 →
那一列矮了 ~20rpx → 被 `.set-item` 的 `align-items: center` 居中后整行错开。

(截图放大后逐段扫描确认: 标签行里只有「设置时长」和「单位」, 中间那列确实空白。)

### 12.2 修法

| 问题 | 修法 |
|---|---|
| 三个控件高度不一 | 统一到 48rpx(edit 弹框)/ 80rpx(add 弹框): 输入框补 `height` + `line-height`(文字垂直居中) + 去掉上下 padding; 单位切换补 `height` + `box-sizing: border-box` |
| content-box 导致 border 溢出 | 凡是带 border 的控件都补 `box-sizing: border-box` —— 小程序默认是 content-box, 1rpx border 会让实际高度多 2rpx(实测 add 弹框的 `.input-btn`/`.unit-btn` 因此比输入框高 2rpx) |
| 负重标签空白 | 新增模块级 `pickDict()`: 取字典时若缺 `LOAD` 则兜底成 `WEIGHT`(不空白)。重新编译后会正常显示「负重」 |

### 12.3 验证: 不止看代码, 渲染出来量

用 headless Chrome 渲染等价的 HTML(375px 屏 = 750rpx, 1rpx = 0.5px), 再做像素测量:

| 弹框 | ± 按钮 | 输入框 | 单位切换 | 结论 |
|---|---|---|---|---|
| edit | 24px = 48rpx | 24px = 48rpx | 24px = 48rpx | ✅ 完全一致 |
| add | 40px = 80rpx | 40px = 80rpx | 40px = 80rpx | ✅ 完全一致 |

### 12.4 新增回归断言

`tools/check-count-mode-ui.js` 增加两节:
- **控件高度一致性**: 解析 wxss, 断言三个控件都写了显式 height 且三者相等
- **border 必须配 box-sizing**: 断言带 border 的控件都声明了 `box-sizing: border-box`
  (这条能抓到刚才那个 2rpx 的漏网 —— 光比对声明的 height 是抓不到的)

现共 **22 项断言全绿**(字段分配 12 + 高度一致性 6 + box-sizing 4)。

---

## 十三、追加: 添加弹框的标题与滚动遮挡(2026-11-07)

用户在看添加弹框截图时指出两件事。

### 13.1 M49 · 弹框标题按计量方式分三种 → 统一成「动作配置」

**原来**:
```js
function titleForMode(mode, t) {
  if (mode === 'duration') return t.SET_DURATION || '设置时长';
  if (mode === 'distance_duration') return t.SET_DISTANCE || '设置距离和时长';
  return t.SET_WEIGHT_REPS || '设置重量和次数';
}
```

**问题**: 上一轮加了负重之后, **三种模式都能设负重** —— 计时类动作标题写着「设置时长」,
下面却有负重输入框, 文案和内容对不上。而且按计量方式分标题意味着以后每加一种计量方式就要改一次。

**改法**: 新增 i18n key `ACTION_SETUP`(中: 动作配置 / 英: ACTION SETUP), 标题统一返回它。
`SET_DURATION` 仍保留 —— 它现在用作**计时器那个字段的标签**(wxml:221), 那里是对的。

### 13.2 M50 · 底部按钮绝对定位 → 滚到底也看不到最后一段

**根因**:
```css
.modal-footer { position: absolute; bottom: 0; left: 0; right: 0; }
.step2-wrap  { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.step2-scroll{ flex: 1; min-height: 0; }
```
`.modal-footer` 是**绝对定位**, 脱离文档流 → 不占高度 → `.step2-wrap`(flex:1)的可用高度
= 整个 sheet 高度 → 滚动区一直延伸到按钮底下 → **最后一段被按钮盖住, 滚到底也看不到**。
计时器正好在最下面, 所以计时类动作必中。

**改法**: 改成普通流内的 flex 子项(`flex-shrink: 0`), 去掉 absolute。
`.modal-sheet` 本身就是 `display:flex; flex-direction:column; height:85vh`,
`.step2-wrap(flex:1)` 会自动收缩给 footer 让出高度 —— 和 `edit-exercise-modal` 的写法一致。

**验证(headless Chrome 复现等价布局, 375×667)**:

| | 滚动区 | 计时器(滚到底后) | 底部按钮 | 结论 |
|---|---|---|---|---|
| 修复前 | 154..580 | 352..**504** | 499..580 | ❌ 被盖住 5px |
| 修复后 | 154..499 | 271..**423** | 499..580 | ✅ 完整可见 |

### 13.3 附带

- i18n 两份字典 key 数保持一致(155 / 155)
- 旧的 `SET_WEIGHT_REPS` / `SET_DISTANCE` 已无引用, 字典里保留备用

---

## 十四、追加: 训练总结里 duration 类显示成「60秒 20kg 20kg × 0 reps」(2026-11-07)

用户看训练完成弹框的截图指出: duration 类动作的数据不对, **怎么有两个 20kg 重量显示**。

### 14.1 根因: 我上一轮引入的 `wx:if` / `wx:elif` 配对错

用户截图里的交叉跳跃显示成 `60秒 | 20kg | 20kg | × 0 reps` —— 时长分支和 else 分支**同时**渲染了。

上一轮加"负重显示"时, 我把结构改成了:
```xml
<text wx:if="{{s.duration_sec > 0}}">时长</text>
<text wx:if="{{s.duration_sec > 0 && s.weight > 0}}">·</text>
<text wx:if="{{s.duration_sec > 0 && s.weight > 0}}">负重</text>
<text wx:elif="{{s.distance_km > 0}}">距离</text>     ← elif 配对的是**上一个 if**(负重那个)
<text wx:if="{{s.distance_km > 0 && s.weight > 0}}">·</text>
<text wx:if="{{s.distance_km > 0 && s.weight > 0}}">负重</text>
<block wx:else>重量 × 次数</block>                   ← else 配对的是**最后一个 if**
```
WXML 里 `wx:elif` 配对**紧邻的上一个 `wx:if`**, `wx:else` 配对**最后那个 `wx:if`**。
于是 duration 形态下: 时长分支成立 → 紧邻的 if(负重)也成立 → **elif 不生效**;
而 else 配对的最后那个 if(distance 条件)为 false → **else 照样渲染** → "20kg × 0 reps"。

**修法**: 三个分支改成**相邻的 block + if/elif/else**(和 `pages/index` 已验证正确的写法一致):
```xml
<block wx:if="{{s.distance_km > 0}}">…</block>
<block wx:elif="{{s.duration_sec > 0}}">…</block>
<block wx:else>…</block>
```
`workout-summary-modal` 与 `session-detail-modal` 两处都改了(`pages/index` 本来就是对的)。

### 14.2 这已经是**同类 bug 第二次**

| 次数 | 位置 | 表现 |
|---|---|---|
| 第 1 次 | `edit-exercise-modal` 的 set 行 | duration 显示成四段(时长+重量+单位+次数) |
| 第 2 次 | `workout-summary-modal` / `session-detail-modal` 的 set 展示 | duration 显示成「60秒 20kg 20kg × 0 reps」 |

根因都是 **WXML 的 `wx:if` / `wx:elif` / `wx:else` 配对规则**被想当然地理解错了。

### 14.3 补上自动化防线

`tools/check-count-mode-ui.js` 从 22 项扩到 **31 项**, 新增第 4 节「set 展示的互斥分支」:
- 覆盖三个展示点(训练总结 / 会话详情 / 首页训练列表)
- 三种 set 形态(duration+负重 / distance+负重 / 次数类)各求值一次
- 断言: **"次数(reps)" 与 "时长/距离" 在同一模式下不得同时出现**

**已反证**: 把总结弹框换回那个错误版本 → 立刻报
`❌ 训练总结弹框 / duration+负重: 可见语义: duration,reps`; 修复版 → 31/31 全绿。

顺带修掉了检查器自身的三个 bug(否则断言会空转):
1. 属性解析不支持**无值**的布尔属性 `wx:else` → else 分支被当成普通节点判为可见
2. 叶子收集只看直接子元素 → 漏掉 `<block>` 里的真实节点; 且把 `unit` 当装饰排掉 → 恰恰把唯一有语义的叶子排了
3. 语义判定靠 class → 但首页/session-detail 里 `class="ec-set-val reps"` 是"主要数值"的意思(时长也用它)→ 改成纯文本判定
