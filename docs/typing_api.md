# 动作计量方式(type)核对 / 修正接口

## 为什么需要它

`exercises_library.exercise_type` 是从多个数据源合并来的,**同一类动作被拆成几批、随机标了不同的 type**:

| 现象 | 实测 |
|---|---|
| 同名同动作、不同 id、标注不同 | "跳箱" id=1960=`weight_reps` vs id=27327=`duration` |
| body_part=13(爆发跳跃) | 630 行里 **507 个 duration** / 123 个 weight_reps |
| body_part=16(瑜伽姿势) | 206 行里 **193 个 duration** / 13 个 weight_reps |
| 中文名重复组里混着不同英文动作 | 702 组中 **230 组**("跳绳"组里混着英文为 `Lever Horizontal One leg Press` 的卧推) |

后果:新功能上线后,**同一个动作在不同 id 上表现不一致** —— 用户加"深蹲"弹出计时器、加"平板支撑"却只给次数框。

## 接口

后端统一走单入口 `POST /api` + `action` 字段(和项目其它 action 一个风格),需要 JWT。

### ① 查建议(只读)

```bash
curl -s -X POST https://gfit.l2ee.top/api \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"library.typingSuggestions"}'
```

参数(可选):

| 参数 | 默认 | 说明 |
|---|---|---|
| `onlyConflicting` | `false` | 只看"同名组内标注不一致"的 |
| `minConfidence` | `"low"` | 最低置信度 `high` / `medium` / `low` |
| `limit` | 5000 | 最多返回多少条 |

返回:

```jsonc
{
  "success": true,
  "total": 1221,
  "by_category": { "A_group_unify": 3, "B_rule_based": 1218 },
  "summary": { "duration/high": 565, "weight_reps/medium": 281, ... },
  "conflicting_groups": 3,
  "ambiguous_groups": 58,          // 平票组 —— 不自动改, 要人工裁决
  "ambiguous": [
    { "name_zh": "波比跳", "ids": [293, 4032], "type_counts": {"duration":1,"weight_reps":1} }
  ],
  "suggestions": [
    {
      "id": 2081,
      "name": "Pull-up",
      "name_zh": "引体向上",
      "current_type": "duration",
      "suggested_type": "weight_reps",
      "category": "B_rule_based",   // A/B 分档
      "body_part_id": "4",
      "body_part_label": "背部",
      "rule_id": "R6-loaded-movement",
      "reason": "负重类动作: 重量×次数",
      "confidence": "high",
      "in_conflicting_group": false,
      "sibling_count": 11,
      "group_key": "pull-up"
    }
  ]
}
```

### ★ A / B 两档 —— 决定该不该直接采信

| 档 | `category` | 含义 | 条数 | 风险 | 建议 |
|---|---|---|---|---|---|
| **A** | `A_group_unify` | 同名组内统一(严格多数票) | 3 | 极低 | **可直接改** |
| **B** | `B_rule_based` | 按关键词+部位规则判定整组 | 1218 | 中 | 人工抽检后**分批改** |

B 档里的大头(改的是整组,量大自然要抽检):

| 规则 | 条数 | 内容 |
|---|---|---|
| `R5-stretch-yoga` | 308 | 拉伸/瑜伽 → duration |
| `R6b-explosive-body-part` | 281 | 部位=13 爆发跳跃 → weight_reps |
| `R4-static-hold` | 263 | 静态保持 → duration |
| `R6-loaded-movement` | 202 | 负重动作 → weight_reps |

### ② 批量改(默认 dryRun)

```bash
# 先看会改什么(不改库)
curl -s -X POST https://gfit.l2ee.top/api \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"library.typingApply","ids":[2081,2812],"to":"weight_reps","dryRun":true}'

# 确认无误后真改
curl -s -X POST https://gfit.l2ee.top/api \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"library.typingApply","ids":[2081,2812],"to":"weight_reps","dryRun":false}'
```

> `dryRun` **默认是 true** —— 不显式传 `false` 就不会改库。

## 判定逻辑(两层)

### 第一层:同名组多数票(**优先**)

同一个**英文名**(小写去空格)下已经有多种 type 时,说明标注本身不一致。
此时**不逐条按关键词判**,而是取**严格多数**派,把少数派改过来。

> 平票(比如 1:1)**不给建议**,列进 `ambiguous` 让人工裁决 —— 宁可待核实也不猜。

### 第二层:关键词 + body_part_id 规则

组内本来就一致时,判断"这一整组是不是整体标错了"。

规则表在 `gfit-backend/src/modules/library/typing-rules.ts`,**数据驱动,改文件即可调**,不用动引擎。

每条规则带 `excludePatterns`(排除词)—— 这是为了避免三类常见误判:

| 误判 | 例 | 怎么处理 |
|---|---|---|
| 位移词出现在负重动作里 | "Walking Lunge" 行走弓步 | `R2-weighted-load` 负重规则排在位移规则**前面** |
| 负重行走 | "Farmer's Walk" 农夫行走 | 同上 + 排除词兜底 |
| 划船歧义 | "Rowing" 既是划船机(距离)又是划船动作(负重) | `R3c` 排除 Cable/Dumbbell/Barbell/Inverted/Bent Over 等负重划船 |

规则顺序(强信号在前):

| 规则 | 目标 | 置信度 |
|---|---|---|
| `R1-machine-cardio` | distance_duration | high |
| `R2-weighted-load` | weight_reps | high |
| `R3-locomotion` | distance_duration | high |
| `R3b-locomotion-cardio-part` | distance_duration | medium |
| `R3c-rowing-machine-like` | distance_duration | medium |
| `R4-static-hold` | duration | high |
| `R5-stretch-yoga` | duration | high |
| `R6-loaded-movement` | weight_reps | high |
| `R6b-explosive-body-part`(部位=13) | weight_reps | medium |
| `R6c-barbell-body-part`(部位=14) | weight_reps | high |
| `R7-default` | weight_reps | low |

## 归组键为什么用英文名

**不能用中文名。** 实测 702 个中文名重复组里,**230 个组内混着不同英文动作**:

```
"跳绳"   → id=1962 "Jump Rope"  + id=3849 "Lever Horizontal One leg Press"(卧推)
"仰卧"   → id=2063 "Lunge"      + id=2487/2596 "Lying"
```

按中文名归组会把完全不同的动作凑一起,统一 type 就成了误标。英文名同源,相同即同一动作(只差尾随空格)。

## 配套工具

| 脚本 | 作用 |
|---|---|
| `gfit-backend/scripts/typing-check.ts` | 干跑,看建议分布和规则命中情况(只读) |
| `gfit-backend/scripts/typing-export.ts` | 导出完整建议清单 CSV + 摘要 |
| `gfit-backend/scripts/verify-migration.js` | 迁移后核对(回填行数、孤儿、重复) |

```bash
cd /Volumes/world/program/gfit-backend
npx ts-node scripts/typing-check.ts      # 看分布
npx ts-node scripts/typing-export.ts      # 导出 CSV
```

产出文件:
- `fitness_wechat/docs/typing_suggestions.csv` —— 逐条建议(含依据、置信度、是否混标组)
- `fitness_wechat/docs/typing_suggestions_summary.md` —— 汇总 + 需人工裁决的平票组
