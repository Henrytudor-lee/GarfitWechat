#!/usr/bin/env node
/**
 * translate_exercises.js
 * 读取 exercises_library_migrated.sql，批量翻译英文名称→中文，
 * 生成带 name_zh 的 exercises_library_translated.sql
 *
 * 用法: node scripts/translate_exercises.js
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ──────────────────────────────────────────────
const INPUT_SQL  = path.join(__dirname, '../docs/exercises_library_migrated.sql');
const OUTPUT_SQL = path.join(__dirname, '../docs/exercises_library_translated.sql');
const BATCH_SIZE = 80;        // 每批翻译的词条数（qwen-turbo 上下文大，80 条/批可接受）
const API_URL    = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const API_KEY    = process.env.DASHSCOPE_KEY || 'sk-c2fb186c0752414fade804671ea89b42';
const MODEL      = 'qwen-turbo';   // 便宜快速，适合批量翻译
const MAX_RETRIES = 3;
// ─────────────────────────────────────────────────────

// 解析 INSERT INTO 语句，提取每行的 (id, name, ...)
// 格式：每行一个 (id, 'name', 'url', 'NULL', ...), 以 ); 结尾
function parseSqlToRows(sql) {
  const lines = sql.split('\n');
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '') continue;
    // 跳过 INSERT 行
    if (trimmed.startsWith('INSERT')) continue;
    // 跳过注释和头部行
    if (trimmed.startsWith('--')) continue;
    // 遇到结尾标志停止
    if (trimmed === ');') break;

    // 去掉尾部逗号
    const clean = trimmed.replace(/,\s*$/, '').replace(/^\(|\)$/g, '');
    if (!clean) continue;

    const fields = splitFields(clean);
    if (fields.length < 9) continue;

    // fields[0]=id, fields[1]=name, fields[2]=image_name,
    // fields[3]=video_name, fields[4]=video_file,
    // fields[5]=equipment_id, fields[6]=body_part_id,
    // fields[7]=exercise_type, fields[8]=is_favorite
    const id   = fields[0].trim();
    const name = unquote(fields[1].trim());

    if (!name || name.toLowerCase() === 'null') continue;

    // rest = image_name ~ is_favorite
    const rest = fields.slice(2).map(f => f.trim());
    rows.push({ id, name, rest });
  }
  return rows;
}

// 智能分割字段，处理引号内可能含逗号的情况
function splitFields(line) {
  const fields = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && !inQuote) {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (ch === ',' && !inQuote) {
      fields.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function requote(s) {
  // 转义单引号，用 '' 符合 SQL 规范
  return "'" + s.replace(/'/g, "''") + "'";
}

// 调用 DashScope 批量翻译
async function translateBatch(names, retries = MAX_RETRIES) {
  const prompt = `你是一个健身动作翻译助手。将以下${names.length}个健身动作的英文名称翻译成中文，返回 JSON 数组，格式：[{"en":"英文","zh":"中文"},{"en":"英文","zh":"中文"},...]。只返回 JSON，不要解释：

${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)```/) ||
                        content.match(/(\[[\s\S]+\])/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      return JSON.parse(jsonStr);
    } catch (err) {
      console.error(`  翻译批次失败（尝试 ${attempt + 1}/${retries}）: ${err.message}`);
      if (attempt < retries - 1) {
        const wait = (attempt + 1) * 1000;
        console.log(`  ${wait}ms 后重试...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

// 批量处理所有行
async function main() {
  console.log('📖 读取 SQL 文件...');
  const sql = fs.readFileSync(INPUT_SQL, 'utf-8');

  console.log('🔍 解析数据行...');
  const rows = parseSqlToRows(sql);
  console.log(`   共 ${rows.length} 条有效记录`);

  const nameMap = {};  // id -> name_zh

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    process.stderr.write(
      `\r   翻译进度 ${i + batch.length}/${rows.length} (${batchNum}/${totalBatches} 批) `
    );

    try {
      const results = await translateBatch(batch.map(r => r.name));

      if (Array.isArray(results)) {
        results.forEach(item => {
          if (item.en && item.zh) {
            // 找到对应的 id（按顺序匹配）
            const idx = results.indexOf(item);
            if (batch[idx]) {
              nameMap[batch[idx].id] = item.zh.trim();
            }
          }
        });
      } else {
        console.error(`\n   批次 ${batchNum} 返回格式异常:`, JSON.stringify(results).slice(0, 100));
      }
    } catch (err) {
      console.error(`\n   批次 ${batchNum} 失败: ${err.message}`);
      throw err;
    }

    // 控制请求速率，避免触发限流
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('\n✅ 翻译完成');

  // 生成新 SQL
  console.log('📝 生成带 name_zh 的 SQL...');

  // 重新构建 INSERT 语句
  // 旧字段顺序: id, name, image_name, video_name, video_file, equipment_id, body_part_id, exercise_type, is_favorite
  // 新字段顺序: id, name, name_zh, image_name, video_name, video_file, equipment_id, body_part_id, exercise_type, is_favorite
  const newRows = rows.map(r => {
    const name_zh = nameMap[r.id] || '';
    return `(${r.id}, ${requote(r.name)}, ${requote(name_zh)}, ${r.rest.join(', ')})`;
  });

  const header = `-- exercises_library translated (English → Chinese)
-- Translated at: ${new Date().toISOString()}
-- Total rows: ${rows.length}
-- Model: ${MODEL}

`;
  const insertHeader = `INSERT INTO exercises_library (id, name, name_zh, image_name, video_name, video_file, equipment_id, body_part_id, exercise_type, is_favorite) VALUES
`;
  const insertFooter = ';';

  // 按每批 200 行分段落，避免单行超长
  const CHUNK = 200;
  const parts = [];
  for (let i = 0; i < newRows.length; i += CHUNK) {
    const chunk = newRows.slice(i, i + CHUNK);
    parts.push(chunk.join(',\n'));
  }

  const output = header + insertHeader + parts.join(',\n\n') + insertFooter + '\n';

  fs.writeFileSync(OUTPUT_SQL, output, 'utf-8');
  const stat = fs.statSync(OUTPUT_SQL);
  console.log(`   输出: ${OUTPUT_SQL} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   共翻译 ${Object.keys(nameMap).length}/${rows.length} 条`);
}

main().catch(err => {
  console.error('\n❌ 翻译失败:', err.message);
  process.exit(1);
});
