# 建议清单摘要

> 生成时间: 2026-11-04 &nbsp;|&nbsp; 规则: `gfit-backend/src/modules/library/typing-rules.ts`
> 完整逐条清单: `typing_suggestions.csv`(1221 条)

## 判定规则（两层）

1. **同名组多数票优先** —— 同一个英文名下已有多种 type 时,取严格多数派统一;
   平票(1:1)**不给建议**,列进 `ambiguous` 让人工裁决(宁可待核实也不猜)。
2. **关键词 + body_part_id 规则** —— 组内本来就一致时,判断"这一整组是不是整体标错了"。

> ⚠️ 归组键是**英文名**,不是中文名 —— 实测 702 个中文名重复组里 230 个混着不同英文动作
> (如 "跳绳" 组里混着英文为 "Lever Horizontal One leg Press" 的卧推)。

## 建议汇总

| 建议类型 / 置信度 | 条数 | 依据 |
|---|---|---|
| duration/high | 573 | 静态保持/等长收缩: 靠时间计量 |
| weight_reps/medium | 281 | 部位=爆发/功能(13)且名称无强信号: 按次数计 |
| weight_reps/high | 251 | 负重类动作: 重量×次数 |
| weight_reps/low | 99 | 默认: 按重量×次数 |
| distance_duration/high | 13 | 位移类有氧(跑步/走路/骑行): 按距离计 |
| distance_duration/medium | 2 | 部位=有氧(10)且名称是位移类: 按距离计 |
| duration/medium | 2 | 部位=瑜伽/静态(16): 该类动作整体是保持式 |

## 需人工裁决(平票,无严格多数)

共 58 组。接口里是 `ambiguous` 字段。

| 动作名 | ids | 各 type 数量 |
|---|---|---|
| 波比跳 | 293, 4032 | {"duration":1,"weight_reps":1} |
| 对抗绳 | 1579, 3803 | {"weight_reps":1,"duration":1} |
| 臀部踢 | 1597, 4275 | {"weight_reps":1,"duration":1} |
| 动态胸部拉伸 | 1892, 2595 | {"duration":1,"weight_reps":1} |
| 跳绳 | 1962, 3850 | {"duration":1,"weight_reps":1} |
| 混合握距引体向上 | 2077, 5486 | {"duration":1,"weight_reps":1} |
| 后肩部拉伸 | 2120, 5499 | {"duration":1,"weight_reps":1} |
| 侧腕拉伸 | 2172, 5506 | {"duration":1,"weight_reps":1} |
| 分腿跳 | 2231, 4351 | {"duration":1,"weight_reps":1} |
| 站姿侧向拉伸 | 2245, 5518 | {"duration":1,"weight_reps":1} |
| 小腿拉伸 | 2388, 5695 | {"duration":1,"weight_reps":1} |
| 股四头肌仰卧拉伸 | 2390, 5497 | {"duration":1,"weight_reps":1} |
| 股四头肌拉伸 | 2391, 5498 | {"duration":1,"weight_reps":1} |
| 动态胸部拉伸 | 1892, 2595 | {"duration":1,"weight_reps":1} |
| 跪姿背阔肌拉伸 | 2723, 5496 | {"duration":1,"weight_reps":1} |
| 脊柱拉伸 | 2734, 5511 | {"weight_reps":1,"duration":1} |
| 背部胸肌拉伸 | 2768, 5700 | {"duration":1,"weight_reps":1} |
| 侧平板 | 2812, 2813 | {"weight_reps":1,"duration":1} |
| 侧平板 | 2812, 2813 | {"weight_reps":1,"duration":1} |
| 过头顶胸部拉伸 | 3064, 5699 | {"weight_reps":1,"duration":1} |
| 坐姿弯腰背部拉伸 | 3092, 5509 | {"duration":1,"weight_reps":1} |
| 仰卧腿卷曲髋部拉伸 | 3217, 4702 | {"weight_reps":1,"duration":1} |
| 波浪机行走 | 3403, 4855 | {"weight_reps":1,"distance_duration":1} |
| 椭圆机行走 | 3404, 4854 | {"weight_reps":1,"distance_duration":1} |
| 对抗绳 | 1579, 3803 | {"weight_reps":1,"duration":1} |
| 窄距俯卧撑 | 1962, 3850 | {"duration":1,"weight_reps":1} |
| 波比跳 | 293, 4032 | {"duration":1,"weight_reps":1} |
| 向前脊柱伸展 | 4111, 5513 | {"duration":1,"weight_reps":1} |
| 臀部踢 | 1597, 4275 | {"weight_reps":1,"duration":1} |
| 分腿开合跳 | 2231, 4351 | {"duration":1,"weight_reps":1} |
| 仰卧下背部拉伸 | 4473, 4474 | {"duration":1,"weight_reps":1} |
| 仰卧下背部拉伸 | 4473, 4474 | {"duration":1,"weight_reps":1} |
| 仰卧腿收髋拉伸 | 3217, 4702 | {"weight_reps":1,"duration":1} |
| 步行椭圆机 | 3404, 4854 | {"weight_reps":1,"distance_duration":1} |
| 步行波浪机 | 3403, 4855 | {"weight_reps":1,"distance_duration":1} |
| 高跳跳绳 | 4908, 47709 | {"duration":1,"distance_duration":1} |
| 中背拉伸 | 2077, 5486 | {"duration":1,"weight_reps":1} |
| 跪姿斜方肌拉伸 | 2723, 5496 | {"duration":1,"weight_reps":1} |
| 仰卧股四头肌拉伸 | 2390, 5497 | {"duration":1,"weight_reps":1} |
| 股四头肌拉伸 | 2391, 5498 | {"duration":1,"weight_reps":1} |
| 后三角肌拉伸 | 2120, 5499 | {"duration":1,"weight_reps":1} |
| 侧腕拉伸 | 2172, 5506 | {"duration":1,"weight_reps":1} |
| 坐姿弯腰背拉伸 | 3092, 5509 | {"duration":1,"weight_reps":1} |
| 脊柱拉伸 | 2734, 5511 | {"weight_reps":1,"duration":1} |
| 前向脊柱拉伸 | 4111, 5513 | {"duration":1,"weight_reps":1} |
| 站立侧向拉伸 | 2245, 5518 | {"duration":1,"weight_reps":1} |
| 小腿拉伸 | 2388, 5695 | {"duration":1,"weight_reps":1} |
| 头顶胸部拉伸 | 3064, 5699 | {"weight_reps":1,"duration":1} |
| 背部胸肌拉伸 | 2768, 5700 | {"duration":1,"weight_reps":1} |
| 低位弓步扭转 | 46740, 48199 | {"weight_reps":1,"duration":1} |
| 侧身深蹲 | 46951, 47192 | {"weight_reps":1,"duration":1} |
| 芭蕾足点内收 | 47041, 47243 | {"weight_reps":1,"duration":1} |
| 侧身站立下蹲 | 46951, 47192 | {"weight_reps":1,"duration":1} |
| 芭蕾足点内收 | 47041, 47243 | {"weight_reps":1,"duration":1} |
| 登山者和动态平板 | 47545, 47763 | {"weight_reps":1,"duration":1} |
| 高跳绳 | 4908, 47709 | {"duration":1,"distance_duration":1} |
| 登山者和动态平板支撑 | 47545, 47763 | {"weight_reps":1,"duration":1} |
| 低弓步扭转 | 46740, 48199 | {"weight_reps":1,"duration":1} |
