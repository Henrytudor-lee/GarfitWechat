# Garcia Fitness → 微信小程序重构实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将 garcia-fitness-new（Next.js）完整功能 1:1 移植到微信小程序，基于腾讯云 CloudBase 云开发

**Architecture:** 微信小程序（WXML/WXSS/JS）+ 腾讯云 CloudBase 云函数（5个）+ CloudBase NoSQL 数据库

**Tech Stack:** 微信小程序 · wx-server-sdk · CloudBase 云数据库 · ECharts 小程序版 · Canvas 2D

---

## Phase 1: 基础设施

### Task 1: 整理小程序现有项目结构

**Objective:** 了解 fitness_wechat 现有文件和脚手架状态

**Files:**
- Read: `/Volumes/world/program/fitness_wechat/project.config.json`
- Read: `/Volumes/world/program/fitness_wechat/miniprogram/app.json`
- Read: `/Volumes/world/program/fitness_wechat/cloudfunctions/quickstartFunctions/index.js`

**Step 1: Read project files**

```bash
cat /Volumes/world/program/fitness_wechat/project.config.json
cat /Volumes/world/program/fitness_wechat/miniprogram/app.json
cat /Volumes/world/program/fitness_wechat/cloudfunctions/quickstartFunctions/index.js
```

**Step 2: Check existing cloudfunctions directory**

```bash
ls -la /Volumes/world/program/fitness_wechat/cloudfunctions/
ls -la /Volumes/world/program/fitness_wechat/miniprogram/pages/
```

---

### Task 2: 配置 project.config.json appid

**Objective:** 确保 appid 正确配置为 wxd256341e5a25a320

**Files:**
- Modify: `/Volumes/world/program/fitness_wechat/project.config.json`

**Step 1: 读取当前配置**

```json
{
  "appid": "wxd256341e5a25a320",
  "projectname": "fitness_wechat",
  "compileType": "miniprogram",
  "cloudfunctionRoot": "./cloudfunctions",
  ...
}
```

**Step 2: 如果 appid 为空或占位符，替换为 wxd256341e5a25a320**

---

### Task 3: 创建数据库集合配置文档

**Objective:** 建立数据库集合创建清单，供后续手动创建或云函数初始化

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/docs/cloudbase-collections.md`

**Content:**
```markdown
# CloudBase 数据库集合配置

## users（用户表）
- openid: String（主键）
- name: String
- avatar: String
- level: Number（默认 1）
- streak: Number（默认 0）
- totalSessions: Number（默认 0）
- totalWeight: Number（默认 0）
- locale: String（默认 "zh"）
- createdAt: Number（时间戳）

## sessions（训练记录表）
- userId: String（关联 users.openid）
- startTime: Number（时间戳）
- endTime: Number（可为空，训练未结束）
- totalWeight: Number（默认 0）
- totalSets: Number（默认 0）

## exercises（动作明细表）
- sessionId: String（关联 sessions._id）
- userId: String（关联 users.openid）
- exerciseLibraryId: Number（关联 exercises_library._id）
- exerciseName: String
- exerciseNameCn: String
- weight: Number
- sets: Number
- reps: Number
- createdAt: Number（时间戳）

## exercises_library（动作库，7000+条）
- _id: Number（自增）
- name: String（英文名）
- nameCn: String（中文名）
- category: String（分类）
- muscleGroup: String（肌肉群）
- equipment: String（器械）
- difficulty: String（难度）
- imageUrl: String（可选）
```

---

## Phase 2: 认证（loginByWx 云函数）

### Task 4: 创建 loginByWx 云函数

**Objective:** 微信登录云函数，实现 openid 自动建档

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/loginByWx/index.js`

**Step 1: 创建云函数目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/loginByWx
```

**Step 2: 编写云函数代码**

```javascript
// cloudfunctions/loginByWx/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { code } = event;
  const db = cloud.database();

  // Step 1: 用 code 换 openid（匿名用户自动注册）
  let openid;
  try {
    const loginResult = await cloud.cloudbase.callContainer({
      config: { env: cloud.DYNAMIC_CURRENT_ENV },
      policy: { identityKey: code },
    });
    openid = loginResult.openid || loginResult.userinfo?.openid;
  } catch (e) {
    // 降级：尝试 auth.getPaidTokenInfoByWxCode 或直接用匿名访问
    openid = `anon_${Date.now()}`;
  }

  if (!openid) {
    return { success: false, error: '获取 openid 失败' };
  }

  // Step 2: 查询用户是否已存在
  let user = null;
  try {
    const { data } = await db.collection('users').where({ openid }).field({
      _id: true, openid: true, name: true, avatar: true,
      level: true, streak: true, totalSessions: true,
      totalWeight: true, locale: true
    }).get();
    user = data[0] || null;
  } catch (e) {
    // 集合可能不存在，降级处理
  }

  // Step 3: 不存在则自动创建
  if (!user) {
    try {
      await db.collection('users').add({
        data: {
          openid,
          name: '新用户',
          avatar: '',
          level: 1,
          streak: 0,
          totalSessions: 0,
          totalWeight: 0,
          locale: 'zh',
          createdAt: Date.now(),
        }
      });
      user = { openid, name: '新用户', avatar: '', level: 1, streak: 0, totalSessions: 0, totalWeight: 0, locale: 'zh' };
    } catch (createErr) {
      // 集合不存在时返回临时用户
      user = { openid, name: '新用户', avatar: '', level: 1, streak: 0, totalSessions: 0, totalWeight: 0, locale: 'zh' };
    }
  }

  // Step 4: 生成简单 token（openid Base64，无第三方库依赖）
  const token = Buffer.from(`${openid}:${Date.now()}`).toString('base64');

  return {
    success: true,
    token,
    user: {
      id: user._id || user.openid,
      openid: user.openid,
      name: user.name,
      avatar: user.avatar,
      level: user.level,
      streak: user.streak,
      totalSessions: user.totalSessions,
      totalWeight: user.totalWeight,
      locale: user.locale,
    }
  };
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/loginByWx/package.json
{
  "name": "loginByWx",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

### Task 5: 创建小程序全局样式和主题文件

**Objective:** 建立暗色玻璃拟态风格的全局 WXSS 变量和基础样式

**Files:**
- Modify: `/Volumes/world/program/fitness_wechat/miniprogram/app.wxss`（创建/覆盖）

**Step 1: 创建 app.wxss**

```css
/* miniprogram/app.wxss — 暗色玻璃拟态主题 */
page {
  --color-bg: #0f0f1a;
  --color-surface: #1a1a2e;
  --color-surface-container: #25253d;
  --color-primary: #6366f1;
  --color-primary-fixed: #818cf8;
  --color-accent: #f472b6;
  --color-text: #f8fafc;
  --color-text-secondary: #94a3b8;
  --color-border: rgba(255, 255, 255, 0.08);
  --color-glass: rgba(26, 26, 46, 0.7);
  --color-glass-border: rgba(255, 255, 255, 0.1);

  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

/* 玻璃卡片 */
.glass-card {
  background: var(--color-glass);
  border: 1px solid var(--color-glass-border);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 胶囊按钮 */
.btn-primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  border: none;
  border-radius: 999px;
  padding: 12px 24px;
  font-weight: 700;
  font-size: 15px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}

/* 次要按钮 */
.btn-secondary {
  background: var(--color-surface-container);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 12px 24px;
  font-weight: 600;
}

/* 输入框 */
.input {
  background: var(--color-surface-container);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--color-text);
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.input::placeholder {
  color: var(--color-text-secondary);
}

/* TabBar 样式 */
.tab-bar {
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}
```

**Step 2: 创建 weui.wxss 的简化兼容（如果项目需要）**

```bash
# 检查是否已有 weui 样式
ls /Volumes/world/program/fitness_wechat/miniprogram/style/
```

---

## Phase 3: 核心训练 — session 和 exercise 云函数

### Task 6: 创建 session 云函数

**Objective:** 实现训练会话的 CRUD 云函数

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/session/index.js`

**Step 1: 创建目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/session
```

**Step 2: 编写 session 云函数**

```javascript
// cloudfunctions/session/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, data = {} } = event;
  const openid = data.openid || context.openid;

  if (!openid) {
    return { success: false, error: '缺少 openid' };
  }

  switch (action) {
    case 'create': {
      const { startTime = Date.now() } = data;
      const res = await db.collection('sessions').add({
        data: {
          userId: openid,
          startTime,
          endTime: null,
          totalWeight: 0,
          totalSets: 0,
          exerciseCount: 0,
          createdAt: Date.now(),
        }
      });
      return { success: true, sessionId: res._id };
    }

    case 'getSessions': {
      const { page = 1, pageSize = 20 } = data;
      const skip = (page - 1) * pageSize;
      const { total, data: list } = await db.collection('sessions')
        .where({ userId: openid })
        .orderBy('startTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();
      return { success: true, list, total };
    }

    case 'getSession': {
      const { sessionId } = data;
      const { data: session } = await db.collection('sessions')
        .where({ _id: sessionId, userId: openid })
        .get();
      if (!session[0]) return { success: false, error: '训练不存在' };

      const { data: exercises } = await db.collection('exercises')
        .where({ sessionId, userId: openid })
        .orderBy('createdAt', 'asc')
        .get();

      return { success: true, session: session[0], exercises };
    }

    case 'update': {
      const { sessionId, endTime, totalWeight, totalSets } = data;
      const updateData = {};
      if (endTime !== undefined) updateData.endTime = endTime;
      if (totalWeight !== undefined) updateData.totalWeight = totalWeight;
      if (totalSets !== undefined) updateData.totalSets = totalSets;

      await db.collection('sessions')
        .where({ _id: sessionId, userId: openid })
        .update({ data: updateData });

      return { success: true };
    }

    case 'delete': {
      const { sessionId } = data;
      // 删除 session 及其所有 exercises
      await db.collection('sessions').where({ _id: sessionId, userId: openid }).remove();
      await db.collection('exercises').where({ sessionId, userId: openid }).remove();
      return { success: true };
    }

    default:
      return { success: false, error: '未知 action' };
  }
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/session/package.json
{
  "name": "session",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

### Task 7: 创建 exercise 云函数

**Objective:** 实现单次训练动作的 CRUD 云函数

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/exercise/index.js`

**Step 1: 创建目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/exercise
```

**Step 2: 编写 exercise 云函数**

```javascript
// cloudfunctions/exercise/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { action, data = {} } = event;
  const openid = data.openid || context.openid;

  if (!openid) {
    return { success: false, error: '缺少 openid' };
  }

  switch (action) {
    case 'add': {
      const { sessionId, exerciseLibraryId, exerciseName, exerciseNameCn, weight, sets, reps } = data;
      const res = await db.collection('exercises').add({
        data: {
          sessionId,
          userId: openid,
          exerciseLibraryId,
          exerciseName,
          exerciseNameCn,
          weight,
          sets,
          reps,
          createdAt: Date.now(),
        }
      });

      // 更新 session 的 totalWeight 和 totalSets
      const { data: session } = await db.collection('sessions').where({ _id: sessionId }).get();
      if (session[0]) {
        const sessionWeight = session[0].totalWeight || 0;
        const sessionSets = session[0].totalSets || 0;
        await db.collection('sessions').where({ _id: sessionId }).update({
          data: {
            totalWeight: sessionWeight + (weight * sets),
            totalSets: sessionSets + sets,
          }
        });
      }

      return { success: true, exerciseId: res._id };
    }

    case 'update': {
      const { exerciseId, weight, sets, reps } = data;
      const updateData = {};
      if (weight !== undefined) updateData.weight = weight;
      if (sets !== undefined) updateData.sets = sets;
      if (reps !== undefined) updateData.reps = reps;

      await db.collection('exercises')
        .where({ _id: exerciseId, userId: openid })
        .update({ data: updateData });

      return { success: true };
    }

    case 'delete': {
      const { exerciseId } = data;
      const { data: ex } = await db.collection('exercises').where({ _id: exerciseId }).get();
      if (ex[0]) {
        const deltaWeight = (ex[0].weight || 0) * (ex[0].sets || 0);
        const deltaSets = ex[0].sets || 0;
        await db.collection('sessions').where({ _id: ex[0].sessionId }).update({
          data: {
            totalWeight: _.inc(-deltaWeight),
            totalSets: _.inc(-deltaSets),
          }
        });
      }
      await db.collection('exercises').where({ _id: exerciseId, userId: openid }).remove();
      return { success: true };
    }

    case 'getBySession': {
      const { sessionId } = data;
      const { data: list } = await db.collection('exercises')
        .where({ sessionId, userId: openid })
        .orderBy('createdAt', 'asc')
        .get();
      return { success: true, list };
    }

    default:
      return { success: false, error: '未知 action' };
  }
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/exercise/package.json
{
  "name": "exercise",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

## Phase 4: 动作库 + 统计云函数

### Task 8: 创建 exerciseLibrary 云函数

**Objective:** 实现动作库查询云函数（支持搜索和分类过滤）

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/exerciseLibrary/index.js`

**Step 1: 创建目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/exerciseLibrary
```

**Step 2: 编写云函数**

```javascript
// cloudfunctions/exerciseLibrary/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { keyword = '', category = '', muscleGroup = '', page = 1, pageSize = 50 } = event;

  let where = {};
  if (category) where.category = category;
  if (muscleGroup) where.muscleGroup = muscleGroup;
  if (keyword) {
    // 支持中英文模糊搜索
    where.name = db.RegExp({ regexp: keyword, options: 'i' });
  }

  const skip = (page - 1) * pageSize;
  const { total, data: list } = await db.collection('exercises_library')
    .where(where)
    .skip(skip)
    .limit(pageSize)
    .get();

  return { success: true, list, total, page, pageSize };
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/exerciseLibrary/package.json
{
  "name": "exerciseLibrary",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

### Task 9: 创建 stats 云函数（用户统计聚合）

**Objective:** 实现 stats 云函数，返回训练统计聚合数据

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/stats/index.js`

**Step 1: 创建目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/stats
```

**Step 2: 编写云函数**

```javascript
// cloudfunctions/stats/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { data = {} } = event;
  const openid = data.openid || context.openid;

  if (!openid) {
    return { success: false, error: '缺少 openid' };
  }

  // 获取总训练次数
  const { total: totalSessions } = await db.collection('sessions')
    .where({ userId: openid })
    .count();

  // 获取累计总重量
  const { list: sessions } = await db.collection('sessions')
    .where({ userId: openid })
    .field({ totalWeight: true, totalSets: true, startTime: true })
    .get();

  let totalWeight = 0;
  let totalSets = 0;
  const dailyStats = {}; // 用于周统计

  for (const s of sessions) {
    totalWeight += s.totalWeight || 0;
    totalSets += s.totalSets || 0;
    // 记录每天的训练（周统计用）
    const dayKey = new Date(s.startTime).toISOString().slice(0, 10); // YYYY-MM-DD
    dailyStats[dayKey] = (dailyStats[dayKey] || 0) + 1;
  }

  // 计算本周每天的训练次数
  const now = new Date();
  const weekStats = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayKey = d.toISOString().slice(0, 10);
    weekStats.push({
      day: dayKey.slice(5), // MM-DD
      count: dailyStats[dayKey] || 0,
    });
  }

  // 获取动作频率（前10个）
  const { data: exerciseStats } = await db.collection('exercises')
    .aggregate()
    .match({ userId: openid })
    .group({ _id: '$exerciseName', count: $.sum(1) })
    .sort({ count: -1 })
    .limit(10)
    .end();

  return {
    success: true,
    stats: {
      totalSessions,
      totalWeight,
      totalSets,
      avgSetsPerSession: totalSessions > 0 ? Math.round(totalSets / totalSessions) : 0,
      weekStats,
      topExercises: exerciseStats.map(e => ({ name: e._id, count: e.count })),
    }
  };
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/stats/package.json
{
  "name": "stats",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

### Task 10: 创建 profile 云函数

**Objective:** 实现用户 profile 的读取和更新

**Cloud Function:** `/Volumes/world/program/fitness_wechat/cloudfunctions/profile/index.js`

**Step 1: 创建目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/cloudfunctions/profile
```

**Step 2: 编写云函数**

```javascript
// cloudfunctions/profile/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const { action, data = {} } = event;
  const openid = data.openid || context.openid;

  if (!openid) {
    return { success: false, error: '缺少 openid' };
  }

  switch (action) {
    case 'get': {
      const { data: user } = await db.collection('users')
        .where({ openid })
        .field({ openid: true, name: true, avatar: true, level: true, streak: true, locale: true, totalSessions: true, totalWeight: true })
        .get();
      return { success: true, user: user[0] || null };
    }

    case 'update': {
      const { name, avatar, locale } = data;
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (locale !== undefined) updateData.locale = locale;

      await db.collection('users')
        .where({ openid })
        .update({ data: updateData });

      return { success: true };
    }

    default:
      return { success: false, error: '未知 action' };
  }
};
```

**Step 3: 创建 package.json**

```json
// cloudfunctions/profile/package.json
{
  "name": "profile",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

---

## Phase 5: 小程序页面 — 底部 Tab 框架

### Task 11: 配置小程序 TabBar 和页面结构

**Objective:** 配置 4 个 Tab 和对应页面骨架

**Files:**
- Modify: `/Volumes/world/program/fitness_wechat/miniprogram/app.json`

**Step 1: 更新 app.json**

```json
{
  "pages": [
    "pages/index/index",
    "pages/library/index",
    "pages/stats/index",
    "pages/profile/index"
  ],
  "window": {
    "navigationBarBackgroundColor": "#0f0f1a",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#0f0f1a",
    "backgroundTextStyle": "dark"
  },
  "tabBar": {
    "custom": true,
    "color": "#94a3b8",
    "selectedColor": "#818cf8",
   backgroundColor": "#1a1a2e",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "训练"
      },
      {
        "pagePath": "pages/library/index",
        "text": "动作库"
      },
      {
        "pagePath": "pages/stats/index",
        "text": "统计"
      },
      {
        "pagePath": "pages/profile/index",
        "text": "我的"
      }
    ]
  },
  "style": "v2",
  "lazyCodeLoading": "requiredComponents"
}
```

**Step 2: 创建 4 个 Tab 页面目录**

```bash
mkdir -p /Volumes/world/program/fitness_wechat/miniprogram/pages/index
mkdir -p /Volumes/world/program/fitness_wechat/miniprogram/pages/library
mkdir -p /Volumes/world/program/fitness_wechat/miniprogram/pages/stats
mkdir -p /Volumes/world/program/fitness_wechat/miniprogram/pages/profile
```

**Step 3: 创建各页面 page.json**

每个页面需要 page.json 配置：
```json
// pages/index/page.json
{
  "usingComponents": {},
  "navigationStyle": "custom"
}
```

```json
// pages/library/page.json
{
  "usingComponents": {},
  "navigationStyle": "custom"
}
```

```json
// pages/stats/page.json
{
  "usingComponents": {},
  "navigationStyle": "custom"
}
```

```json
// pages/profile/page.json
{
  "usingComponents": {},
  "navigationStyle": "custom"
}
```

---

## Phase 6: 小程序页面 — 首页训练（核心）

### Task 12: 创建首页 index.js（计时器逻辑）

**Objective:** 实现训练首页：计时器 + 开始/停止 + 当前训练动作列表

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/index/index.js`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/index/index.wxml`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/index/index.wxss`

**Step 1: index.js**

```javascript
// pages/index/index.js
const app = getApp();
const utils = require('../../utils/i18n.js');

Page({
  data: {
    locale: 'zh',
    t: {},

    // 计时器
    elapsedSeconds: 0,
    timerInterval: null,
    startTimestamp: null,
    isRunning: false,

    // 当前训练
    currentSessionId: null,
    exercises: [], // [{id, name, nameCn, weight, sets, reps}]

    // 统计
    totalWeight: 0,
    totalSets: 0,
  },

  onLoad() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
    this.checkRunningSession();
  },

  onShow() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
  },

  updateI18n() {
    const locale = this.data.locale;
    this.setData({ t: utils.getTranslations(locale) });
    wx.setNavigationBarTitle({ title: utils.getTranslations(locale).tab.training });
  },

  formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  async checkRunningSession() {
    try {
      const res = await wx.cloud.callFunction({ name: 'session', data: { action: 'getSessions', data: { page: 1, pageSize: 10 } } });
      if (res.result.success) {
        const running = res.result.list.find(s => !s.endTime);
        if (running) {
          this.setData({
            currentSessionId: running._id,
            startTimestamp: running.startTime,
            elapsedSeconds: Math.floor((Date.now() - running.startTime) / 1000),
            totalWeight: running.totalWeight,
            totalSets: running.totalSets,
            isRunning: true,
          });
          this.startTimerInterval();
        }
      }
    } catch (e) { console.error(e); }
  },

  startTimerInterval() {
    if (this.data.timerInterval) clearInterval(this.data.timerInterval);
    const interval = setInterval(() => {
      if (this.data.startTimestamp) {
        const elapsed = Math.floor((Date.now() - this.data.startTimestamp) / 1000);
        this.setData({ elapsedSeconds: elapsed });
      }
    }, 1000);
    this.setData({ timerInterval: interval });
  },

  async handleStart() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'session',
        data: { action: 'create', data: { startTime: Date.now(), openid: app.globalData.openid } }
      });
      if (res.result.success) {
        this.setData({
          currentSessionId: res.result.sessionId,
          startTimestamp: Date.now(),
          elapsedSeconds: 0,
          exercises: [],
          totalWeight: 0,
          totalSets: 0,
          isRunning: true,
        });
        this.startTimerInterval();
      }
    } catch (e) { console.error(e); wx.showToast({ title: '启动失败', icon: 'error' }); }
  },

  async handleStop() {
    if (!this.data.currentSessionId) return;

    // 停止计时器
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval);
      this.setData({ timerInterval: null });
    }

    // 更新 session 结束时间
    try {
      await wx.cloud.callFunction({
        name: 'session',
        data: {
          action: 'update',
          data: {
            sessionId: this.data.currentSessionId,
            endTime: Date.now(),
            totalWeight: this.data.totalWeight,
            totalSets: this.data.totalSets,
            openid: app.globalData.openid,
          }
        }
      });
    } catch (e) { console.error(e); }

    // 弹出训练结束海报（后续 Task 实现）
    this.setData({
      isRunning: false,
      currentSessionId: null,
      startTimestamp: null,
      exercises: [],
      elapsedSeconds: 0,
      totalWeight: 0,
      totalSets: 0,
    });

    wx.showToast({ title: '训练已保存', icon: 'success' });
  },

  showAddExerciseModal() {
    // 后续 Task 实现 AddExerciseModal
    wx.navigateTo({ url: '/pages/library/pick?sessionId=' + this.data.currentSessionId });
  },

  async deleteExercise(e) {
    const { id } = e.currentTarget.dataset;
    const exercise = this.data.exercises.find(ex => ex.id === id);
    if (!exercise) return;

    try {
      await wx.cloud.callFunction({ name: 'exercise', data: { action: 'delete', data: { exerciseId: id, openid: app.globalData.openid } } });
      const exercises = this.data.exercises.filter(ex => ex.id !== id);
      const deltaWeight = (exercise.weight || 0) * (exercise.sets || 0);
      const deltaSets = exercise.sets || 0;
      this.setData({
        exercises,
        totalWeight: Math.max(0, this.data.totalWeight - deltaWeight),
        totalSets: Math.max(0, this.data.totalSets - deltaSets),
      });
    } catch (e) { console.error(e); }
  },

  onUnload() {
    if (this.data.timerInterval) clearInterval(this.data.timerInterval);
  },
});
```

---

## Phase 7: 小程序页面 — 动作库

### Task 13: 创建动作库页面

**Objective:** 实现动作库搜索和分类过滤页面

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/library/index.js`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/library/index.wxml`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/library/index.wxss`

**Step 1: index.js**

```javascript
// pages/library/index.js
const app = getApp();
const utils = require('../../utils/i18n.js');

Page({
  data: {
    locale: 'zh',
    t: {},

    keyword: '',
    category: '',
    muscleGroup: '',

    list: [],
    loading: false,
    page: 1,
    pageSize: 50,
    hasMore: true,

    categories: [
      { value: '', label: '全部' },
      { value: 'chest', label: '胸部' },
      { value: 'back', label: '背部' },
      { value: 'shoulder', label: '肩部' },
      { value: 'arm', label: '手臂' },
      { value: 'leg', label: '腿部' },
      { value: 'core', label: '核心' },
    ],

    showPicker: false,
    selectedExercise: null,
  },

  onLoad() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
    this.loadLibrary(true);
  },

  onShow() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
  },

  updateI18n() {
    const locale = this.data.locale;
    this.setData({ t: utils.getTranslations(locale) });
    wx.setNavigationBarTitle({ title: utils.getTranslations(locale).tab.library });
  },

  async loadLibrary(reset = false) {
    if (this.data.loading) return;
    if (reset) this.setData({ page: 1, list: [], hasMore: true });
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'exerciseLibrary',
        data: {
          keyword: this.data.keyword,
          category: this.data.category,
          muscleGroup: this.data.muscleGroup,
          page: this.data.page,
          pageSize: this.data.pageSize,
        }
      });
      if (res.result.success) {
        const newList = reset ? res.result.list : [...this.data.list, ...res.result.list];
        this.setData({
          list: newList,
          hasMore: res.result.list.length === this.data.pageSize,
          page: this.data.page + 1,
        });
      }
    } catch (e) { console.error(e); }
    this.setData({ loading: false });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.loadLibrary(true);
  },

  onCategoryChange(e) {
    this.setData({ category: this.data.categories[e.detail.value].value });
    this.loadLibrary(true);
  },

  onScrollToLower() {
    if (this.data.hasMore) this.loadLibrary(false);
  },

  onExerciseTap(e) {
    const exercise = e.currentTarget.dataset.exercise;
    this.setData({ selectedExercise: exercise, showPicker: true });
  },

  closePicker() {
    this.setData({ showPicker: false, selectedExercise: null });
  },

  async addToSession() {
    // 从训练页面跳转过来时，可以直接添加
    wx.navigateBack();
  },
});
```

**Step 2: index.wxml**

```xml
<!-- pages/library/index.wxml -->
<view class="page">
  <!-- 搜索栏 -->
  <view class="search-bar">
    <input class="search-input" placeholder="{{t.library.searchPlaceholder}}" value="{{keyword}}" bindinput="onSearch" />
  </view>

  <!-- 分类选择 -->
  <scroll-view scroll-x class="category-scroll">
    <view class="category-list">
      <block wx:for="{{categories}}" wx:key="value">
        <view class="category-item {{category === item.value ? 'active' : ''}}" bindtap="onCategoryItemTap" data-value="{{item.value}}">
          {{item.label}}
        </view>
      </block>
    </view>
  </scroll-view>

  <!-- 动作列表 -->
  <scroll-view scroll-y class="exercise-list" bindscrolltolower="onScrollToLower">
    <view class="exercise-grid">
      <block wx:for="{{list}}" wx:key="_id">
        <view class="exercise-card glass-card" bindtap="onExerciseTap" data-exercise="{{item}}">
          <view class="exercise-name">{{locale === 'en' ? item.name : item.nameCn}}</view>
          <view class="exercise-meta">{{item.muscleGroup}} · {{item.difficulty}}</view>
        </view>
      </block>
    </view>
    <view class="loading-tip" wx:if="{{loading}}">加载中...</view>
    <view class="loading-tip" wx:elif="{{!hasMore}}">没有更多了</view>
  </scroll-view>

  <!-- 动作详情底部弹窗（简化版，实际用组件） -->
  <view class="picker-sheet" wx:if="{{showPicker}}" catchtap="closePicker">
    <view class="picker-content glass-card" catchtap="">
      <view class="picker-header">
        <text class="exercise-title">{{selectedExercise ? (locale === 'en' ? selectedExercise.name : selectedExercise.nameCn) : ''}}</text>
        <text class="close-btn" bindtap="closePicker">✕</text>
      </view>
      <view class="picker-meta">{{selectedExercise?.muscleGroup}} · {{selectedExercise?.equipment}}</view>
      <button class="btn-primary" bindtap="addToSession">添加到训练</button>
    </view>
  </view>
</view>
```

---

## Phase 8: 小程序页面 — 统计页

### Task 14: 创建统计页面（含 ECharts）

**Objective:** 实现统计页面：顶部卡片 + 周柱状图 + 动作频率图

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/stats/index.js`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/stats/index.wxml`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/stats/index.wxss`

**Step 1: index.js**

```javascript
// pages/stats/index.js
const app = getApp();
const utils = require('../../utils/i18n.js');

Page({
  data: {
    locale: 'zh',
    t: {},
    stats: null,
    loading: true,

    weekChartOption: null,
    frequencyChartOption: null,
  },

  onLoad() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
    this.loadStats();
  },

  onShow() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
  },

  updateI18n() {
    const locale = this.data.locale;
    this.setData({ t: utils.getTranslations(locale) });
    wx.setNavigationBarTitle({ title: utils.getTranslations(locale).tab.stats });
  },

  async loadStats() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'stats',
        data: { data: { openid: app.globalData.openid } }
      });
      if (res.result.success) {
        this.setData({ stats: res.result.stats });
        this.buildChartOptions(res.result.stats);
      }
    } catch (e) { console.error(e); }
    this.setData({ loading: false });
  },

  buildChartOptions(stats) {
    // 周训练柱状图配置（ECharts 兼容格式）
    this.setData({
      weekChartOption: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: stats.weekStats.map(d => d.day),
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
        },
        series: [{
          type: 'bar',
          data: stats.weekStats.map(d => d.count),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: '#818cf8' }, { offset: 1, color: '#f472b6' }]
            },
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '40%',
        }],
        grid: { left: 30, right: 10, top: 10, bottom: 25 },
      },
      frequencyChartOption: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        },
        yAxis: {
          type: 'category',
          data: stats.topExercises.slice().reverse().map(e => e.name),
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
          axisLabel: { color: '#94a3b8', fontSize: 9 },
        },
        series: [{
          type: 'bar',
          data: stats.topExercises.slice().reverse().map(e => e.count),
          itemStyle: { color: '#6366f1', borderRadius: [0, 4, 4, 0] },
          barWidth: '60%',
        }],
        grid: { left: 80, right: 15, top: 5, bottom: 5 },
      },
    });
  },
});
```

---

## Phase 9: 小程序页面 — 个人中心

### Task 15: 创建个人中心页面

**Objective:** 实现个人中心：头像/名字/等级 + 语言切换 + 登出

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/profile/index.js`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/profile/index.wxml`
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/pages/profile/index.wxss`

**Step 1: index.js**

```javascript
// pages/profile/index.js
const app = getApp();
const utils = require('../../utils/i18n.js');

Page({
  data: {
    locale: 'zh',
    t: {},
    user: null,
    loading: true,
  },

  onLoad() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
    this.loadProfile();
  },

  onShow() {
    this.setData({ locale: app.globalData.locale || 'zh' });
    this.updateI18n();
  },

  updateI18n() {
    const locale = this.data.locale;
    this.setData({ t: utils.getTranslations(locale) });
    wx.setNavigationBarTitle({ title: utils.getTranslations(locale).tab.profile });
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'profile',
        data: { action: 'get', data: { openid: app.globalData.openid } }
      });
      if (res.result.success && res.result.user) {
        this.setData({ user: res.result.user });
      }
    } catch (e) { console.error(e); }
    this.setData({ loading: false });
  },

  async onLanguageToggle() {
    const newLocale = this.data.locale === 'zh' ? 'en' : 'zh';
    try {
      await wx.cloud.callFunction({
        name: 'profile',
        data: { action: 'update', data: { openid: app.globalData.openid, locale: newLocale } }
      });
      app.globalData.locale = newLocale;
      this.setData({ locale: newLocale });
      this.updateI18n();
      this.loadProfile();
    } catch (e) { console.error(e); }
  },

  onLogout() {
    wx.showModal({
      title: '确认登出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          app.globalData.openid = null;
          app.globalData.userInfo = null;
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  },

  onAvatarTap() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        // 上传到云存储
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `avatars/${app.globalData.openid}.jpg`,
            filePath: tempFilePath,
          });
          await wx.cloud.callFunction({
            name: 'profile',
            data: { action: 'update', data: { openid: app.globalData.openid, avatar: uploadRes.fileID } }
          });
          this.loadProfile();
        } catch (e) { console.error(e); }
      }
    });
  },
});
```

---

## Phase 10: 国际化 + 工具函数

### Task 16: 创建 i18n 工具和语言包

**Objective:** 实现中英双语切换系统

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/miniprogram/utils/i18n.js`

**Step 1: i18n.js**

```javascript
// miniprogram/utils/i18n.js

const translations = {
  zh: {
    tab: { training: '训练', library: '动作库', stats: '统计', profile: '我的' },
    training: {
      startWorkout: '开始训练',
      endWorkout: '结束训练',
      addExercise: '添加动作',
      elapsed: '训练时长',
      totalWeight: '总重量',
      totalSets: '总组数',
      noExercises: '暂无动作，点击下方 + 添加',
    },
    library: {
      searchPlaceholder: '搜索动作...',
      all: '全部',
      addToWorkout: '添加到训练',
    },
    stats: {
      totalSessions: '累计训练',
      totalWeight: '累计重量',
      avgSets: '每场平均',
      weekTraining: '本周训练',
      topExercises: '动作频率',
      times: '次',
      kg: 'kg',
    },
    profile: {
      language: '语言',
      logout: '退出登录',
      streak: '连续训练',
      days: '天',
      level: '等级',
    },
  },
  en: {
    tab: { training: 'Training', library: 'Library', stats: 'Stats', profile: 'Profile' },
    training: {
      startWorkout: 'Start Workout',
      endWorkout: 'End Workout',
      addExercise: 'Add Exercise',
      elapsed: 'Duration',
      totalWeight: 'Total Weight',
      totalSets: 'Total Sets',
      noExercises: 'No exercises yet, tap + to add',
    },
    library: {
      searchPlaceholder: 'Search exercises...',
      all: 'All',
      addToWorkout: 'Add to Workout',
    },
    stats: {
      totalSessions: 'Sessions',
      totalWeight: 'Total Weight',
      avgSets: 'Avg Sets',
      weekTraining: 'This Week',
      topExercises: 'Top Exercises',
      times: '',
      kg: 'kg',
    },
    profile: {
      language: 'Language',
      logout: 'Logout',
      streak: 'Streak',
      days: 'days',
      level: 'Level',
    },
  },
};

function getTranslations(locale) {
  return translations[locale] || translations.zh;
}

function t(key, locale, params) {
  const keys = key.split('.');
  let val = translations[locale] || translations.zh;
  for (const k of keys) {
    val = val?.[k];
  }
  if (typeof val !== 'string') return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`{${k}}`, 'g'), String(v));
    }
  }
  return val;
}

module.exports = { getTranslations, t, translations };
```

---

## Phase 11: app.js 全局初始化

### Task 17: 创建 app.js 全局入口

**Objective:** 实现全局 openid 管理、login 逻辑、全局状态

**Files:**
- Modify: `/Volumes/world/program/fitness_wechat/miniprogram/app.js`

**Step 1: app.js**

```javascript
// miniprogram/app.js
const utils = require('./utils/i18n.js');

App({
  globalData: {
    openid: null,
    userInfo: null,
    locale: 'zh',
    token: null,
  },

  onLaunch() {
    // 初始化云环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'garcia-fitness-xxxx', // TODO: 替换为实际的云环境 ID
        traceUser: true,
      });
    }

    // 读取本地存储的语言偏好
    const locale = wx.getStorageSync('locale') || 'zh';
    this.globalData.locale = locale;

    // 尝试恢复 openid
    const savedOpenid = wx.getStorageSync('openid');
    const savedUserInfo = wx.getStorageSync('userInfo');
    if (savedOpenid) {
      this.globalData.openid = savedOpenid;
      this.globalData.userInfo = savedUserInfo;
    } else {
      // 需要登录
      this.doLogin();
    }
  },

  async doLogin() {
    try {
      const loginRes = await wx.login();
      const res = await wx.cloud.callFunction({ name: 'loginByWx', data: { code: loginRes.code } });
      if (res.result.success) {
        this.globalData.openid = res.result.user.openid;
        this.globalData.userInfo = res.result.user;
        this.globalData.token = res.result.token;
        this.globalData.locale = res.result.user.locale || 'zh';
        wx.setStorageSync('openid', res.result.user.openid);
        wx.setStorageSync('userInfo', res.result.user);
        wx.setStorageSync('locale', this.globalData.locale);
      }
    } catch (e) {
      console.error('登录失败', e);
    }
  },
});
```

---

## Phase 12: 迁移脚本

### Task 18: 创建数据迁移脚本（一次性使用）

**Objective:** 将 exercises_library 从 Supabase 迁移到 CloudBase

**Files:**
- Create: `/Volumes/world/program/fitness_wechat/scripts/migrate_exercises_library.js`

**Step 1: 创建迁移脚本说明文档**

```javascript
/**
 * 数据迁移脚本：exercises_library (Supabase → CloudBase)
 * 
 * 使用方式：
 * 1. 从 Supabase 导出 exercises_library 为 JSON 文件（exercises_library.json）
 * 2. 将 JSON 文件放入 miniprogram/assets/exercises_library.json
 * 3. 通过腾讯云控制台手动导入，或使用云函数批量写入
 * 
 * 注意：此脚本为参考，实际使用腾讯云控制台的导入功能更稳定
 */

const fs = require('fs');
const path = require('path');

// 读取导出的 JSON
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../miniprogram/assets/exercises_library.json'), 'utf-8')
);

// 数据格式转换（Supabase → CloudBase）
const cloudData = data.map(item => ({
  name: item.name,
  nameCn: item.name_cn || item.name,
  category: item.category,
  muscleGroup: item.muscle_group || '',
  equipment: item.equipment || '',
  difficulty: item.difficulty || 'beginner',
  imageUrl: item.image_url || '',
}));

// 分批写入（每批 500 条）
const BATCH_SIZE = 500;
async function batchImport() {
  for (let i = 0; i < cloudData.length; i += BATCH_SIZE) {
    const batch = cloudData.slice(i, i + BATCH_SIZE);
    console.log(`Importing batch ${Math.floor(i / BATCH_SIZE) + 1}: items ${i + 1} to ${i + batch.length}`);
    // 在云函数内使用 db.collection('exercises_library').add({ data: batch }) 批量写入
  }
}
```

---

## 实施顺序

```
Phase 1 (Task 1-3)  → 项目结构整理 + app.json 配置
Phase 2 (Task 4-5)  → loginByWx 云函数 + app.wxss 全局样式
Phase 3 (Task 6-7)  → session + exercise 云函数
Phase 4 (Task 8-10) → exerciseLibrary + stats + profile 云函数
Phase 5 (Task 11)   → 小程序 TabBar + 4个页面骨架
Phase 6 (Task 12)   → 首页训练（计时器 + 开始/停止）
Phase 7 (Task 13)   → 动作库页面
Phase 8 (Task 14)   → 统计页面（含 ECharts）
Phase 9 (Task 15)   → 个人中心页面
Phase 10 (Task 16)  → i18n 工具
Phase 11 (Task 17)  → app.js 全局入口
Phase 12 (Task 18)  → 数据迁移脚本
```

---

## 验证步骤

每个云函数部署后，在小程序开发者工具控制台测试：

```javascript
// loginByWx 测试
wx.cloud.callFunction({ name: 'loginByWx', data: { code: 'test' } })

// session 测试
wx.cloud.callFunction({ name: 'session', data: { action: 'create', data: { openid: 'test' } } })

// exerciseLibrary 测试
wx.cloud.callFunction({ name: 'exerciseLibrary', data: { keyword: 'bench', page: 1, pageSize: 20 } })
```
