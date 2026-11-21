const fs = require('fs');
const path = require('path');
const DOCS = '/Volumes/world/program/fitness_wechat/docs';

const htmlPath = path.join(DOCS, 'gfit_dup_report_20261113.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const execBlock = `
<h2 style="color:var(--ok)">✅ 执行结果（2026-11-13 21:22 已执行）</h2>
<div class="note" style="border-left-color:var(--ok)">
用户确认后已删除 <b>161 条</b>「同名 + 同器械 + 同部位 + 中文名有交集 + 从未被使用 + 非精选」的缺视频重复行，
每条都在组内保留了<b>带图带视频的兄弟行</b>。<br>
<b>复核链路</b>：临删前 161/161 通过 → 备份 <code>gfit_backup_dupdelete-1794619332971.json</code> →
走 <code>POST /admin/library/delete</code>（事务内级联 + 写审计）→ 删后复核全绿。<br>
<b>终态</b>：库 6923 → <b>6762</b>（-161）· 残留 0 · 守护者 160/160 仍在库且仍有视频 ·
孤儿 exercises 0 / user_exercise_stats 0 · 缺视频 1728 → <b>1567</b> ·
删除接口 <code>deleted=161 removedExerciseRows=0 affectedUsers=0</code>（<b>零训练数据被毁</b>）·
审计 <code>admin_operation_log #459 library.delete affected=161</code>。<br>
<b>磁盘影响</b>：删掉的行不带视频，所以只产生 <b>160 个图片孤儿文件</b>（物理文件未删，磁盘图片 6852 个不变）。
连同历史遗留，磁盘当前共 <b>438 张孤儿图片 + 64 个孤儿视频</b>没人引用 —— 后台「数据体检」只扫描不清理，需手动处理。<br>
<b>另发现 2 条既有坏引用</b>（与本次删除无关，删行只会减少引用不会制造坏引用）：
<code>47382 Side to Side Bicep Curl</code> 与 <code>48277 Resistance Band Wide Stance Anti Rotation Chop</code>
指向的 png 在生产机上不存在。
</div>
`;

html = html.replace(
  '<h2>说明</h2>',
  execBlock + '\n<h2>说明</h2>',
);
html = html.replace(
  '生成时间 ' + new Date().toLocaleString('zh-CN') + ' · 只读分析，未改动任何数据',
  '生成时间 2026-11-13 21:27 · 结论已执行（见下方「执行结果」）',
);
fs.writeFileSync(htmlPath, html);
console.log('已更新报告:', htmlPath, fs.statSync(htmlPath).size, 'bytes');
