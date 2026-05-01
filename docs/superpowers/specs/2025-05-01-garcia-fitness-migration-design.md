# Garcia Fitness → 微信小程序重构设计方案

> **Spec Version:** 1.0
> **Date:** 2025-05-01
> **Status:** Approved
> **Goal:** 将 garcia-fitness-new（Next.js）完整功能 1:1 移植到微信小程序（腾讯云 CloudBase）

---

## 1. 整体架构

```
微信小程序 (fitness_wechat)
├── 4 Tab 页面
│   ├── Tab 1: 首页训练 (pages/index/)
│   ├── Tab 2: 动作库 (pages/library/)
│   ├── Tab 3: 统计 (pages/stats/)
│   └── Tab 4: 我的 (pages/profile/)
├── 组件 (components/)
│   ├── AddExerciseModal/    添加动作弹窗
│   ├── EditExerciseModal/   编辑动作弹窗
│   └── WorkoutSummaryModal/ 训练结束海报
├── 云函数 (cloudfunctions/)
│   ├── loginByWx/           微信登录认证
│   ├── session/             训练会话 CRUD
│   ├── exercise/            动作记录 CRUD
│   ├── profile/             用户信息
│   └── exerciseLibrary/      动作库查询
└── i18n/                    国际化（中/英）
        └── index.js
            ├── en.js
            └── zh.js

腾讯云 CloudBase
├── 云数据库
│   ├── users                用户表
│   ├── sessions             训练记录表
│   ├── exercises            动作明细表
│   └── exercises_library     动作库（7000+条）
└── 云存储（COS）            头像等静态资源
```

**技术栈：**
- 前端：微信小程序原生开发（WXML + WXSS + JavaScript/TypeScript）
- 云函数：Node.js + wx-server-sdk（腾讯云官方）
- 数据库：CloudBase 云数据库（NoSQL）+ 云存储
- 认证：微信 openid 体系（wx.login）

---

## 2. 云函数设计

### loginByWx
- **输入:** `{ code }` — `wx.login()` 获取的临时 code
- **输出:** `{ token, user: { id, openid, name, avatar, level, streak, locale } }`
- **逻辑:** code → 腾讯接口换 openid → 查 users → 无则自动创建 → 返回 token
- **注:** 废弃原邮箱密码体系，openid 即用户唯一标识

### session（云函数名称：session）
- `createSession(data)` — 新建训练，返回 sessionId
- `getSessions({ page, pageSize })` — 分页查询历史训练
- `getSession({ sessionId })` — 查询单次训练含 exercises
- `updateSession({ sessionId, endTime, totalWeight, totalSets })` — 更新/结束训练
- `deleteSession({ sessionId })` — 删除训练

### exercise（云函数名称：exercise）
- `addExercise({ sessionId, exerciseLibraryId, weight, sets, reps })` — 添加动作
- `updateExercise({ exerciseId, weight, sets, reps })` — 更新动作
- `deleteExercise({ exerciseId })` — 删除动作
- `getExercises({ sessionId })` — 查询某次训练所有动作

### profile（云函数名称：profile）
- `getProfile()` — 获取当前用户信息（streak、level、偏好）
- `updateProfile({ name, avatar, locale })` — 更新名字/头像/语言

### exerciseLibrary（云函数名称：exerciseLibrary）
- `getLibrary({ keyword, category, muscleGroup, page, pageSize })` — 搜索/过滤动作库

---

## 3. 数据库集合设计

### users
```json
{
  "_id": "openid_xxx",
  "openid": "微信openid",
  "name": "用户昵称",
  "avatar": "头像URL",
  "level": 1,
  "streak": 0,
  "totalSessions": 0,
  "totalWeight": 0,
  "locale": "zh",
  "createdAt": 1714502400000
}
```

### sessions
```json
{
  "_id": "自动生成",
  "userId": "openid_xxx",
  "startTime": 1714502400000,
  "endTime": null,
  "totalWeight": 0,
  "totalSets": 0,
  "exercises": []
}
```

### exercises
```json
{
  "_id": "自动生成",
  "sessionId": "session_id",
  "userId": "openid_xxx",
  "exerciseLibraryId": 123,
  "exerciseName": "Bench Press",
  "weight": 60,
  "sets": 3,
  "reps": 10,
  "createdAt": 1714502400000
}
```

### exercises_library
```json
{
  "_id": 1,
  "name": "Bench Press",
  "nameCn": "杠铃卧推",
  "category": "chest",
  "muscleGroup": "胸肌",
  "equipment": "barbell",
  "difficulty": "intermediate",
  "imageUrl": "https://..."
}
```

---

## 4. 页面与组件映射

| 原 Next.js 页面 | 微信小程序页面 | 职责 |
|----------------|--------------|------|
| `app/(main)/page.tsx` | `pages/index/index` | 训练计时器、开始/停止、FAB添加动作、结束海报 |
| `app/(main)/library/page.tsx` | `pages/library/index` | 动作库搜索、分类筛选、动作详情 |
| `app/(main)/stats/page.tsx` | `pages/stats/index` | 统计卡片、周训练图、动作频率图 |
| `app/(main)/profile/page.tsx` | `pages/profile/index` | 用户信息、语言切换、设置、登出 |
| `app/(auth)/login` | (省略) | 微信自动登录，无需页面 |
| `app/(auth)/register` | (省略) | openid自动建档，无需页面 |

**共享组件（小程序 components/ 目录）：**
- `AddExerciseModal/` — 底部弹窗，从动作库选动作
- `EditExerciseModal/` — 底部弹窗，编辑重量/组数/次数
- `WorkoutSummaryModal/` — 训练结束 Canvas 海报

---

## 5. 数据迁移方案

### exercises_library（7000+ 条）
1. 从 Supabase 导出：`SELECT * FROM exercises_library` → CSV 或 JSON
2. 通过腾讯云控制台上传，或写一次性云函数批量导入
3. 批量插入（每批 500 条，避免超时）

### 存量训练记录（sessions + exercises）
1. 从 Supabase 导出历史 sessions + exercises 为 JSON
2. 开发完成后，写迁移脚本调用 `batchCreateSessions` 云函数
3. 建议一次性迁移，原项目数据保持不动

### 用户信息
- name/avatar：首次微信登录时自动取微信昵称头像，或用户手动设置
- streak/level：可迁移或在新系统重置

---

## 6. 技术风险与应对

| 风险 | 说明 | 应对 |
|------|------|------|
| 计时器精确度 | 小程序 setInterval 息屏/切后台时不准 | start 时记录 `timestamp`，stop 时用 `Date.now()` 差值计算 |
| 图表库 | 小程序没有 Recharts | 使用 **ECharts 小程序版**（echarts-for-weixin），API 与 Web 版相近 |
| 动画性能 | 小程序动画框架有限 | 使用 `wx.createAnimation()`，避免复杂 CSS 动画 |
| 国际化 | 小程序无 React Context | `i18n/index.js` 单例 + `wx.getStorageSync('locale')`，各页 `setData({locale})` |
| Canvas 海报 | 训练结束海报 | 使用 **Canvas 2D API**，提前在原型设计好布局 |

---

## 7. 开发阶段（Phase 1-5）

- **Phase 1:** 基础设施 — 云函数框架 + 数据库集合创建
- **Phase 2:** 认证 — loginByWx 云函数 + 小程序启动页
- **Phase 3:** 核心训练 — session/exercise 云函数 + 首页训练
- **Phase 4:** 动作库 + 统计 — exerciseLibrary + stats 云函数 + ECharts
- **Phase 5:** 个人中心 + 收尾 — profile 云函数 + i18n + 数据迁移

---

## 8. 设计决策汇总

| 决策项 | 选择 |
|--------|------|
| 功能范围 | A — 完整功能 1:1 移植 |
| 界面风格 | A — 保持原暗色玻璃拟态风格 |
| 数据库 | A — 腾讯云 CloudBase NoSQL |
| 动作库存储 | A — 云数据库存储（全部7000+条） |
| 存量历史 | A — 全部迁移 |
| 国际化 | A — 保留中英双语 |
| Tab 架构 | A — 4 Tab（首页/动作库/统计/我的） |
| 实现路径 | 路径 1 — 并行开发，新项目隔离 |
