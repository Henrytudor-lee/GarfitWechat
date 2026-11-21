#!/usr/bin/env node
/**
 * GFit 动作库「缺视频 × 同义兄弟」分析  v2
 *
 * 只读脚本: 不写库、不删数据。产出候选清单(JSON) + HTML 报告, 人工确认后再执行删除。
 *
 * 相似度分级:
 *   A  完全同名   : trim + 小写后一致
 *   B  归一化同名 : 去标点/连字符/空格, &→and, 复数折叠 后一致
 *
 * 「同义」判定(比名字严格得多, 因为同名 ≠ 同一动作):
 *   1. 候选自己无视频(SQL NULL), 组内存在有视频的兄弟
 *   2. 候选从未被使用(exercises / user_exercise_stats / session_shares 均无引用)
 *   3. 候选不是精选动作
 *   4. 器械/部位不能冲突: 双方都非空且**完全不相交** → 判为不同动作
 *   5. 中文名不能冲突: 双方都有中文名且**没有任何共同汉字** → 判为不同动作
 *   6. 守护者不能比候选"更残缺": 候选取长(有图/有中文名/有器械/有部位)而守护者缺 → 删了是净损失
 *
 * 用法: node gfit_dup_analysis.js
 */
const path = require('path');
const fs = require('fs');

const BACKEND = '/Volumes/world/program/gfit-backend';
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env') });
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));

const OUT_DIR = '/Volumes/world/program/fitness_wechat/docs';

const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'with', 'and', 'or']);
const normExact = (s) => String(s || '').trim().toLowerCase();
const normTokens = (s) =>
  String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const normTight = (s) => {
  const t = normTokens(s).filter((w) => !STOP.has(w));
  return (t.length ? t : normTokens(s)).map(singular).join('');
};

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const intersects = (a, b) => a.some((x) => b.includes(x));
const zhChars = (s) => new Set(String(s || '').replace(/[^一-鿿]/g, '').split(''));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  const q = async (sql) => (await conn.query(sql))[0];

  const rows = await q(
    `SELECT id, name, name_zh, image_name, video_name, equipment_id, body_part_id, exercise_type, is_favorite
       FROM exercises_library ORDER BY id`,
  );

  const usedEx = new Set((await q('SELECT DISTINCT exercise_id FROM exercises')).map((r) => Number(r.exercise_id)));
  const usedStat = new Set((await q('SELECT DISTINCT exercise_id FROM user_exercise_stats')).map((r) => Number(r.exercise_id)));
  let shareRef = new Set();
  try {
    const sc = await q('SHOW COLUMNS FROM session_shares');
    const col = sc.map((r) => r.Field).find((f) => /exercise/i.test(f));
    if (col) (await q(`SELECT DISTINCT ${col} AS e FROM session_shares WHERE ${col} IS NOT NULL`)).forEach((r) => shareRef.add(Number(r.e)));
  } catch { /* 无该表 */ }

  const isNullish = (v) => v === null || v === undefined || v === '' || v === 'NULL';
  const items = rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name || ''),
    nameZh: String(r.name_zh || ''),
    hasVideo: !isNullish(r.video_name),
    hasImage: !isNullish(r.image_name),
    isFavorite: Number(r.is_favorite || 0) === 1,
    equipmentIds: String(r.equipment_id || '').split(',').map((s) => s.trim()).filter(Boolean),
    bodyPartIds: String(r.body_part_id || '').split(',').map((s) => s.trim()).filter(Boolean),
    type: r.exercise_type,
    used: usedEx.has(Number(r.id)),
    flagged: usedStat.has(Number(r.id)),
    shared: shareRef.has(Number(r.id)),
    exact: normExact(r.name),
    tight: normTight(r.name),
  }));

  // ── 分组 ──
  const gA = new Map(), gB = new Map();
  for (const it of items) {
    if (it.exact) { if (!gA.has(it.exact)) gA.set(it.exact, []); gA.get(it.exact).push(it); }
    if (it.tight) { if (!gB.has(it.tight)) gB.set(it.tight, []); gB.get(it.tight).push(it); }
  }
  const sig = (arr) => arr.map((x) => x.id).sort((a, b) => a - b).join(',');
  const seenB = new Set();
  for (const arr of gA.values()) seenB.add(sig(arr));

  const groups = [];
  for (const arr of gA.values()) if (arr.length > 1) groups.push({ tier: 'A', arr });
  for (const arr of gB.values()) if (arr.length > 1 && !seenB.has(sig(arr))) groups.push({ tier: 'B', arr });

  // ── 评估 ──
  const results = [];
  for (const g of groups) {
    const keepers = g.arr.filter((x) => x.hasVideo);
    const cands = g.arr.filter((x) => !x.hasVideo);
    if (!keepers.length || !cands.length) continue;

    // 守护者: 有视频且"最完整"
    const score = (x) =>
      (x.hasVideo ? 8 : 0) + (x.hasImage ? 4 : 0) + (x.nameZh ? 2 : 0) +
      (x.equipmentIds.length ? 1 : 0) + (x.bodyPartIds.length ? 1 : 0);
    const keeper = [...keepers].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];

    for (const c of cands) {
      const blocked = [];
      if (c.used) blocked.push('有训练记录');
      if (c.flagged) blocked.push('有收藏/练过标记');
      if (c.shared) blocked.push('被分享引用');
      if (c.isFavorite) blocked.push('精选动作');

      if (c.equipmentIds.length && keeper.equipmentIds.length && !intersects(c.equipmentIds, keeper.equipmentIds))
        blocked.push(`器械不一致(${c.equipmentIds.join('/')} vs ${keeper.equipmentIds.join('/')})`);
      if (c.bodyPartIds.length && keeper.bodyPartIds.length && !intersects(c.bodyPartIds, keeper.bodyPartIds))
        blocked.push(`部位不一致(${c.bodyPartIds.join('/')} vs ${keeper.bodyPartIds.join('/')})`);

      if (c.nameZh && keeper.nameZh) {
        const a = zhChars(c.nameZh), b = zhChars(keeper.nameZh);
        const common = [...a].some((ch) => b.has(ch));
        if (!common) blocked.push(`中文名无交集(${c.nameZh} vs ${keeper.nameZh})`);
      }

      // 候选比守护者更完整 → 删了是净损失
      if (c.hasImage && !keeper.hasImage) blocked.push('候选有图片但守护者缺图');
      if (c.nameZh && !keeper.nameZh) blocked.push('候选有中文名但守护者没有');
      if (c.equipmentIds.length && !keeper.equipmentIds.length) blocked.push('候选有器械但守护者没有');
      if (c.bodyPartIds.length && !keeper.bodyPartIds.length) blocked.push('候选有部位但守护者没有');

      results.push({
        tier: g.tier,
        groupSize: g.arr.length,
        group: g.arr.map((x) => ({ id: x.id, name: x.name, nameZh: x.nameZh, hasVideo: x.hasVideo, hasImage: x.hasImage })),
        candidate: { id: c.id, name: c.name, nameZh: c.nameZh, hasImage: c.hasImage, equipmentIds: c.equipmentIds, bodyPartIds: c.bodyPartIds },
        keeper: { id: keeper.id, name: keeper.name, nameZh: keeper.nameZh, hasImage: keeper.hasImage, equipmentIds: keeper.equipmentIds, bodyPartIds: keeper.bodyPartIds },
        blocked,
      });
    }
  }

  // 同一行可能同时落进 A 组和 B 组 → 按 candidate id 去重, 保留层级更靠前的(A)
  const dedupMap = new Map();
  for (const r of results) {
    const prev = dedupMap.get(r.candidate.id);
    if (!prev || (prev.tier === 'B' && r.tier === 'A')) dedupMap.set(r.candidate.id, r);
  }
  const allResults = [...dedupMap.values()];
  const clean = allResults.filter((r) => r.blocked.length === 0);
  const blocked = allResults.filter((r) => r.blocked.length > 0);
  const noVideoTotal = items.filter((x) => !x.hasVideo).length;
  const noVideoNeverUsed = items.filter((x) => !x.hasVideo && !x.used && !x.flagged && !x.shared).length;

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const jsonPath = path.join(OUT_DIR, `gfit_dup_candidates_${stamp}.json`);
  const delPath = path.join(OUT_DIR, `gfit_dup_deletable_${stamp}.json`);
  const htmlPath = path.join(OUT_DIR, `gfit_dup_report_${stamp}.html`);

  const detail = (r) => ({
    tier: r.tier,
    candidateId: r.candidate.id,
    candidateName: r.candidate.name,
    candidateNameZh: r.candidate.nameZh,
    candidateHasImage: r.candidate.hasImage,
    keeperId: r.keeper.id,
    keeperName: r.keeper.name,
    keeperNameZh: r.keeper.nameZh,
    keeperHasImage: r.keeper.hasImage,
    blocked: r.blocked,
  });

  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    libraryTotal: items.length, noVideo: noVideoTotal, noVideoNeverUsed,
    summary: { groups: groups.length, clean: clean.length, blocked: blocked.length },
    rows: allResults.map(detail),
  }, null, 2));

  fs.writeFileSync(delPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: clean.length,
    ids: clean.map((r) => r.candidate.id),
    rows: clean.map((r) => ({
      id: r.candidate.id, name: r.candidate.name, nameZh: r.candidate.nameZh,
      keeperId: r.keeper.id, keeperName: r.keeper.name, tier: r.tier,
    })),
  }, null, 2));

  // ── HTML 报告 ──
  const tbl = (list, cls) => `
  <table class="${cls}">
    <thead><tr>
      <th>层级</th><th>待删 id</th><th>待删名称</th><th>中文名</th><th>待删有图</th>
      <th>保留 id</th><th>保留名称</th><th>保留中文名</th><th>保留有图</th><th>阻塞原因</th>
    </tr></thead>
    <tbody>${list.map((r) => `<tr>
      <td><span class="tag t${r.tier}">${r.tier}</span></td>
      <td class="num">${r.candidate.id}</td>
      <td>${esc(r.candidate.name)}</td><td>${esc(r.candidate.nameZh)}</td>
      <td>${r.candidate.hasImage ? '✓' : '—'}</td>
      <td class="num">${r.keeper.id}</td>
      <td>${esc(r.keeper.name)}</td><td>${esc(r.keeper.nameZh)}</td>
      <td>${r.keeper.hasImage ? '✓' : '—'}</td>
      <td class="bad">${r.blocked.map(esc).join(' / ') || '—'}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>GFit 动作库 · 缺视频重复项分析 ${stamp}</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--line:#262b36;--fg:#e8eaf0;--dim:#9aa3b2;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#58a6ff}
*{box-sizing:border-box}body{margin:0;padding:32px;background:var(--bg);color:var(--fg);
font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.sub{color:var(--dim);font-size:13px;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .n{font-size:26px;font-weight:600;letter-spacing:-.5px}
.card .l{color:var(--dim);font-size:12px;margin-top:2px}
.card.hl .n{color:var(--ok)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13px}
th{background:#1e222b;text-align:left;padding:9px 10px;color:var(--dim);font-weight:600;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #20242e;vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1c2029}
.num{font-variant-numeric:tabular-nums;color:var(--acc)}
.bad{color:var(--warn);font-size:12px}
.tag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:600}
.tA{background:#12331f;color:var(--ok)}.tB{background:#12324a;color:var(--acc)}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:8px;padding:12px 16px;color:var(--dim);font-size:13px}
.note b{color:var(--fg)}
ul{color:var(--dim);font-size:13px}li{margin:3px 0}
code{background:#20242e;padding:1px 5px;border-radius:4px;font-size:12px}
</style></head><body>
<h1>GFit 动作库 · 缺视频重复项分析</h1>
<div class="sub">生成时间 ${new Date().toLocaleString('zh-CN')} · 只读分析，未改动任何数据</div>

<div class="cards">
  <div class="card"><div class="n">${items.length}</div><div class="l">动作库总数</div></div>
  <div class="card"><div class="n">${noVideoTotal}</div><div class="l">缺视频</div></div>
  <div class="card"><div class="n">${noVideoNeverUsed}</div><div class="l">缺视频且从未被用过</div></div>
  <div class="card"><div class="n">${groups.length}</div><div class="l">相似组数</div></div>
  <div class="card hl"><div class="n">${clean.length}</div><div class="l">✅ 可删候选</div></div>
  <div class="card"><div class="n" style="color:var(--warn)">${blocked.length}</div><div class="l">⚠️ 需人工判断</div></div>
</div>

<h2>判定规则</h2>
<div class="note">
<b>A 级</b> = 英文名 trim+小写后完全一致；<b>B 级</b> = 归一化（去标点/连字符/空格、&→and、复数折叠）后一致。<br>
只有同时满足以下条件才列为可删：① 自己无视频；② 组内有<b>有视频</b>的兄弟；③ 从未被用户训练/收藏/分享引用；④ 不是精选；
⑤ 器械与部位不冲突（双方非空且完全不相交即判为不同动作）；⑥ 中文名有共同汉字；⑦ 守护者不比候选取长（候选取长而守护者缺 → 删了是净损失）。
</div>

<h2>✅ 可删候选（${clean.length} 条）</h2>
${clean.length ? tbl(clean, 'ok') : '<div class="note">无</div>'}

${blocked.length ? `<h2>⚠️ 需人工判断（${blocked.length} 条，本次不删）</h2>${tbl(blocked, 'warn')}` : ''}

<h2>说明</h2>
<ul>
<li>本报告<b>没有执行任何删除</b>。可删 id 清单另存于 <code>gfit_dup_deletable_${stamp}.json</code>，确认后再走 <code>POST /admin/library/delete</code>（事务内级联删 exercises / user_exercise_stats，并写 admin_operation_log 审计）。</li>
<li>删库行<b>不会删物理媒体文件</b>（文件可能被其他 id 复用），需另行按「数据体检」清理磁盘孤儿。</li>
<li>缺视频总数 ${noVideoTotal} 里，只有 ${clean.length} 条能用这个方式消掉；其余是库内独一份、别处没有对应动作的条目。</li>
</ul>
</body></html>`;
  fs.writeFileSync(htmlPath, html);

  console.log('════════ 缺视频 × 同义兄弟 分析 ════════');
  console.log(`库内动作总数        : ${items.length}`);
  console.log(`缺视频              : ${noVideoTotal}  (从未被用过: ${noVideoNeverUsed})`);
  console.log(`相似组(同名/归一化)  : ${groups.length}`);
  console.log(`→ ✅ 可删候选        : ${clean.length}`);
  console.log(`→ ⚠️ 需人工判断      : ${blocked.length}`);
  console.log('');
  console.log('HTML 报告 :', htmlPath);
  console.log('候选 JSON :', jsonPath);
  console.log('可删清单  :', delPath);
  console.log('\n--- 阻塞样本(前 12) ---');
  for (const r of blocked.slice(0, 12))
    console.log(`  ${r.candidate.id} ${r.candidate.name} → 守护 ${r.keeper.id} ${r.keeper.name}  ⚠ ${r.blocked.join(' / ')}`);
  console.log('\n--- 可删样本(前 12) ---');
  for (const r of clean.slice(0, 12))
    console.log(`  ${r.candidate.id} ${r.candidate.name} → 守护 ${r.keeper.id} ${r.keeper.name}`);

  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
