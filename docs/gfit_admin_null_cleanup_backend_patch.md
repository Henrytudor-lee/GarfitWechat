# 后端补丁：让 admin 能写出 SQL NULL（1 处改动）

**为什么需要这个补丁**

2026-11-11 已把库里 1728 条 `video_name='NULL'` + 63 条 `image_name='NULL'` 清洗成真正的 SQL NULL。
这样小程序端 `wx:if="{{item.video_name}}"` 判假 → 不再渲染坏掉的 ▶ → 不再请求 `/exer_videos/NULL` → 404 消除。

但 `admin.service.ts` 的 `cleanAssetName()` 会把**任何**空值写回字面量 `'NULL'`：

```ts
if (raw === undefined || raw === null) return 'NULL';
...
if (!s) return 'NULL';
```

所以只要在后台**编辑一个没有素材的动作**，该行立刻被写回 `'NULL'`，裂图回归。

原注释说「统一用 'NULL' 与存量保持一致, 避免同一种"没有素材"出现三种表示」——
这个论据不成立：**实测清洗前 `video_name` 的三种表示分布是 空串 0 / SQL NULL 0 / 字面量 'NULL' 1728**，
库里从来就只有一种表示，不存在"三种表示分裂"的问题。真正的目标是**让小程序正确判断有没有素材**，
而 `'NULL'` 恰好是被 `wx:if` 判真的那一种。

---

## 改动（`src/modules/admin/admin.service.ts` 第 645 行附近）

```diff
--- a/src/modules/admin/admin.service.ts
+++ b/src/modules/admin/admin.service.ts
@@ -642,20 +642,17 @@ export class AdminService {
   /**
    * 素材文件名清洗
    *
-   * 空值统一写成字面量 'NULL'。
-   *
-   * ⚠️ 为什么不用空串 / SQL NULL:
-   *    库里存量有 426 个 image_name + 2674 个 video_name 存的就是字面量 'NULL'
-   *    (导入时把空值写成了字符串, 不是 SQL NULL)。
-   *    小程序端 wx:if="{{item.image_name}}" 对 'NULL' 判为真 → 会去请求
-   *    /exer_images/NULL → 404(实测)。
-   *    统一用 'NULL' 与存量保持一致, 避免同一种"没有素材"出现三种表示。
+   * 空值写成 SQL NULL。
+   *
+   * ⚠️ 为什么不写字面量 'NULL':
+   *    小程序端 wx:if="{{item.image_name}}" / wx:if="{{item.video_name}}"
+   *    对字面量 'NULL' 判为**真** → 会去请求 /exer_images/NULL → 404(实测)。
+   *    SQL NULL 判假 → 不渲染 → 正确。
+   *
+   *    2026-11-11 已把存量 1728 条 video_name + 63 条 image_name
+   *    从字面量 'NULL' 清洗成 SQL NULL(备份见 .gfit-backup-clean-null-*.json)。
+   *    本函数同步改为写 SQL NULL, 避免"编辑一次就变回 'NULL'"。
+   *
+   *    注: 库里三种表示的分布实测是 空串 0 / SQL NULL 0 / 字面量 'NULL' 全量,
+   *    从来不存在"三种表示分裂", 原注释里的担心不成立。
    */
-  private cleanAssetName(raw: any): string {
-    if (raw === undefined || raw === null) return 'NULL';
+  private cleanAssetName(raw: any): string | null {
+    if (raw === undefined || raw === null) return null;
     const s = String(raw).trim();
-    // 空值统一写成字面量 'NULL'
-    if (!s) return 'NULL';
+    if (!s) return null;
     // 不允许带目录 —— 防越权写到别的目录
     if (s.includes('/') || s.includes('\\') || s.includes('..')) {
       throw new Error('素材文件名不能包含路径');
```

---

## 影响面检查（改之前已核实）

| 位置 | 现状 | 改成 SQL NULL 后 |
|---|---|---|
| `admin.service.ts` 的 `createLibrary` | `params.push(this.cleanAssetName(...))` 塞进 INSERT | `null` 塞进 INSERT，MySQL 正常写入 NULL ✓ |
| `admin.service.ts` 的 `updateLibrary` | `sets.push('video_name = ?')` | 传 null → 字段被置空 ✓ |
| `admin.service.ts` 的 `batchLibrary` | 同样走 `cleanAssetName` | 同上 ✓ |
| `exercises.service.ts` 的 `list` | `SELECT image_name, video_name` 原样返回，无加工 | 返回 null，小程序 `wx:if` 判假 ✓ |
| 小程序 `add-exercise-modal` | `image_name: selectedItem.image_name \|\| null` | null 透传 ✓ |
| gfit-admin 前端 `AssetUploader.hasFile` | `v !== '' && v !== 'NULL' && v !== 'null'` | null → `String(null\|\|'')` = '' → hasFile=false ✓ |

**没有其他地方依赖字面量 `'NULL'`**（已在 `src/modules/exercises/`、`src/rpc/` 全量 grep 确认）。

---

## 配套的前端改动（已在 gfit-admin 完成，无需你操作）

`gfit-admin/src/api/index.js` 的 `updateLibrary()` 提交前会剥掉值为 `null` / `''` 的素材字段：

```js
function stripEmptyAssets(payload) {
  const out = { ...payload };
  for (const k of ['imageName', 'videoName']) {
    if (out[k] === null || out[k] === undefined || out[k] === '') delete out[k];
  }
  return out;
}
```

作用：后台编辑动作的名称/中文名/部位等字段时，**不碰素材字段**，库里的 SQL NULL 得以保留。
（后端补丁合入前，这层防护就已经在生效，所以清洗后的 1791 行不会被普通编辑操作回写。）

⚠️ 唯一还需要后端补丁的场景：**用户在后台点「清除素材」**。
那条路径需要后端能写出 SQL NULL —— 前端无法绕过 `cleanAssetName`。
