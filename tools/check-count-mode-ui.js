/**
 * 校验「三种计量方式各显示哪些录入字段」
 *
 * ⚠️ 为什么要写这个脚本(2026-11-07 用户截图发现的问题):
 *   edit-exercise-modal 的 set 行原来写成
 *       wx:if="{{item.countMode === 'duration'}}"        →  时长
 *       wx:if="{{item.countMode === 'distance_duration'}}"  →  距离
 *       wx:else                                          →  重量 + 单位 + 次数
 *   而 WXML 的 **wx:else 配对的是紧邻的上一个 if**(也就是 distance 那个),
 *   于是 duration 模式下"距离 if 为 false → 走 else" → 重量/单位/次数被一起渲染,
 *   计时类动作显示成四段。
 *   这种 bug 肉眼极难发现, 所以这里把 WXML 解析成树, 按真实规则求值,
 *   断言"每种模式该显示哪几段"。以后谁再改坏条件, 脚本立刻报出来。
 *
 * 判据(用户定的口径):
 *   weight_reps       → 重量 + 单位 + 次数
 *   duration          → 时长 + 重量(负重) + 单位
 *   distance_duration → 距离 + 重量(负重) + 单位
 *
 * 用法: node tools/check-count-mode-ui.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');

let pass = 0;
let fail = 0;
const ck = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? '  ' + extra : ''}`); }
};

// ────────────────────────────── WXML 解析 ──────────────────────────────

/** 去掉注释, 切成标签/文本 */
function tokenize(src) {
  const noComment = src.replace(/<!--[\s\S]*?-->/g, '');
  const tokens = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(noComment)) !== null) {
    if (m[4] !== undefined) {
      const text = m[4].trim();
      if (text) tokens.push({ type: 'text', text });
      continue;
    }
    const closing = m[0].startsWith('</');
    const tag = m[1];
    const attrRaw = m[2] || '';
    const selfClosed = m[3] === '/';
    const attrs = {};
    // ⚠️ 必须支持**无值**的布尔属性 —— wx:else 就是这种(写成 <block wx:else>)
    //    原来只匹配 `name="value"`, 导致 wx:else 根本没被解析出来
    //    → else 分支被当成普通节点 → 判定成"可见" → 断言一直在空转/误报。
    const attrRe = /([\w:.-]+)(?:\s*=\s*"([^"]*)")?/g;
    let a;
    while ((a = attrRe.exec(attrRaw)) !== null) {
      attrs[a[1]] = a[2] !== undefined ? a[2] : '';
    }
    tokens.push({ type: closing ? 'close' : 'open', tag, attrs, selfClosed });
  }
  return tokens;
}

/** 建树 */
function parse(src) {
  const tokens = tokenize(src);
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  for (const tk of tokens) {
    if (tk.type === 'text') {
      stack[stack.length - 1].children.push(tk);
      continue;
    }
    if (tk.type === 'open') {
      const node = { tag: tk.tag, attrs: tk.attrs, children: [], parent: stack[stack.length - 1] };
      stack[stack.length - 1].children.push(node);
      if (!tk.selfClosed) stack.push(node);
      continue;
    }
    // close
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].tag === tk.tag) { stack.length = i; break; }
    }
  }
  return root;
}

/** 收集某节点子树里的文本 */
function textOf(node) {
  let out = '';
  for (const c of node.children) {
    if (c.type === 'text') out += c.text;
    else out += textOf(c);
  }
  return out;
}

/** class 里是否含某个类名 */
function hasClass(node, cls) {
  const c = node.attrs && node.attrs.class;
  return !!c && c.split(/\s+/).includes(cls);
}

// ───────────────────────────── 表达式求值 ─────────────────────────────

/** 求值一个 WXML 表达式(支持 =/!=/>/</>=/<=、&&/||/!、括号、数字、字符串、true/false) */
function evalExpr(expr, scope) {
  let e = String(expr || '').trim();
  if (!e) return true;

  // 属性值是 "{{...}}" 形式 —— 先剥掉 mustache 括号
  if (e.startsWith('{{') && e.endsWith('}}')) e = e.slice(2, -2).trim();
  if (!e) return true;

  // ⚠️ 去掉最外层括号后必须**重新走一遍** ——
  //    (a || b) 这种, 括号里才是完整的 || 表达式。
  //    之前先拆 || 再剥括号, 导致 "(isDuration || isDistance)" 剥完没人再拆,
  //    被当成一个变量名去 resolve → 永远 undefined → 求值为 false。
  if (e.startsWith('(') && e.endsWith(')') && balanced(e.slice(1, -1))) {
    return evalExpr(e.slice(1, -1), scope);
  }

  // 顶层按 || 切
  const orParts = splitTop(e, '||');
  if (orParts.length > 1) return orParts.some((p) => evalExpr(p, scope));

  // 再按 && 切
  const andParts = splitTop(e, '&&');
  if (andParts.length > 1) return andParts.every((p) => evalExpr(p, scope));

  if (e.startsWith('!')) return !evalExpr(e.slice(1), scope);

  const cmp = /^([\w.]+)\s*(===|!==|>=|<=|==|!=|>|<)\s*(.+)$/.exec(e);
  if (cmp) {
    const [, lhs, op, rhsRaw] = cmp;
    const l = resolve(lhs, scope);
    const r = resolve(rhsRaw, scope);
    switch (op) {
      case '===': case '==': return l === r;
      case '!==': case '!=': return l !== r;
      case '>': return Number(l) > Number(r);
      case '<': return Number(l) < Number(r);
      case '>=': return Number(l) >= Number(r);
      case '<=': return Number(l) <= Number(r);
    }
  }
  return !!resolve(e, scope);
}

/** 按顶层分隔符切(跳过引号和括号内的分隔符) */
function splitTop(str, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && str.startsWith(sep, i)) {
      out.push(cur); cur = ''; i += sep.length - 1; continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function balanced(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === '(') d++;
    else if (ch === ')') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

/** 取变量值: 支持 a.b.c */
function resolve(token, scope) {
  const t = String(token).trim();
  if (/^'.*'$/.test(t)) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split('.');
  let cur = scope;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// ────────────────────── if / elif / else 链求值 ──────────────────────

/**
 * 给一组兄弟节点算出"谁该显示"。
 * WXML 规则: wx:else 配对**紧邻的上一个** wx:if / wx:elif;
 * 遇到一个新的 wx:if 就重新开一条链。
 */
function siblingVisibility(children, scope) {
  const show = new Map();
  let chain = null;   // { decided: bool, passed: bool }

  for (const child of children) {
    if (!child.tag || child.type === 'text') continue;
    const a = child.attrs || {};
    let visible;
    if (a['wx:if'] !== undefined) {
      visible = evalExpr(a['wx:if'], scope);
      chain = { decided: true, passed: visible };
    } else if (a['wx:elif'] !== undefined) {
      visible = chain && !chain.passed ? evalExpr(a['wx:elif'], scope) : false;
      if (chain) { chain.passed = chain.passed || visible; chain.decided = true; }
    } else if (a['wx:else'] !== undefined) {
      visible = chain && !chain.passed ? true : false;
      if (chain) { chain.passed = true; chain.decided = true; }
    } else {
      visible = true;
      chain = null;   // 普通节点会打断 if/else 链
    }
    show.set(child, visible);
  }
  return show;
}

/** 深度优先: 算出每个节点的"最终是否渲染"(祖先全可见 + 自己可见) */
function computeVisibility(root, scope) {
  const result = new Map();
  (function walk(node, ancestorVisible) {
    const sib = siblingVisibility(node.children, scope);
    for (const child of node.children) {
      if (!child.tag || child.type === 'text') continue;
      const visible = ancestorVisible && (sib.get(child) !== false);
      result.set(child, visible);
      walk(child, visible);
    }
  })(root, true);
  return result;
}

/**
 * 从块里取"字段标签"。
 *
 * 要处理两种写法:
 *   {{t.WEIGHT}}                        → 直接取
 *   {{item.isRepsMode ? t.WEIGHT : t.LOAD}}  → 三元, 按当前模式求值选一个
 *   (块里可能还有别的 {{t.XXX}}, 比如提示文字 LOAD_HINT —— 取第一个"像标签"的)
 */
function extractLabel(text, scope) {
  const exprs = text.match(/\{\{[^}]*\}\}/g) || [];
  for (const raw of exprs) {
    const e = raw.replace(/^\{\{/, '').replace(/\}\}$/, '').trim();

    // 纯 t.KEY
    const plain = /^t\.([A-Z_]+)$/.exec(e);
    if (plain) return plain[1];

    // 三元: cond ? t.A : t.B
    const tern = /^([\s\S]+?)\s*\?\s*t\.([A-Z_]+)\s*:\s*t\.([A-Z_]+)$/.exec(e);
    if (tern) {
      const [, cond, a, b] = tern;
      try {
        return evalExpr(cond, scope) ? a : b;
      } catch {
        return a;
      }
    }
  }
  return null;
}

/** 找出所有"录入字段块", 返回 { label, visible } */
function findFieldBlocks(root, visibility, classNames, scope) {
  const out = [];
  (function walk(node) {
    for (const child of node.children) {
      if (!child.tag || child.type === 'text') continue;
      const matched = classNames.some((c) => hasClass(child, c));
      if (matched) {
        out.push({
          label: extractLabel(textOf(child), scope),
          visible: visibility.get(child) === true,
          cls: child.attrs.class || '',
          tag: child.tag,
        });
      }
      walk(child);
    }
  })(root);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────

const MODES = [
  { key: 'weight_reps', flags: { isDuration: false, isDistance: false, isRepsMode: true } },
  { key: 'duration', flags: { isDuration: true, isDistance: false, isRepsMode: false } },
  { key: 'distance_duration', flags: { isDuration: false, isDistance: true, isRepsMode: false } },
];

function scopeFor(m) {
  const s = { ...m.flags };
  s.item = { ...m.flags };          // item.xxx 形式(set 级标记)
  s.group = { count_mode: m.key, sets: [] };
  s.selectedItem = { id: 1, name_zh: 'x', exercise_id: 1 };
  s.sets = [];
  s.list = [];
  s.loading = false;
  s.step = 'set';                   // 添加弹框的录入区在 step === 'set' 分支里
  s.isOpen = true;                  // 弹框根节点是 wx:if="{{isOpen && group}}"
  s.locale = 'zh';
  s.theme = 'night';
  s.t = {};                         // t.XXX 只用来取 label, 不参与条件求值
  return s;
}

console.log('\n════ 1) edit-exercise-modal · set 行字段分配 ════');
{
  const file = path.join(ROOT, 'components/edit-exercise-modal/index.wxml');
  const root = parse(fs.readFileSync(file, 'utf8'));
  for (const m of MODES) {
    const scope = scopeFor(m);
    const vis = computeVisibility(root, scope);
    const blocks = findFieldBlocks(root, vis, ['set-field', 'unit-toggle'], scope);
    const shown = blocks.filter((b) => b.visible && b.label).map((b) => b.label);
    // 单位段没有 t.XXX 标签(只有 unit-toggle 这个 class), 所以断言按"标签或类名"命中
    const classes = blocks.filter((b) => b.visible).map((b) => b.cls).join(' ').toLowerCase();
    const has = (k) => shown.includes(k) || classes.includes(k.toLowerCase());
    console.log(`  ${m.key.padEnd(19)} -> ${shown.join(', ') || '(none)'}`);
    if (m.key === 'weight_reps') {
      ck('weight_reps: 重量 + 单位 + 次数', ['WEIGHT', 'UNIT', 'REPS'].every(has), shown.join(','));
      ck('weight_reps: 不显示 时长/距离', !has('SET_DURATION') && !has('DISTANCE'), shown.join(','));
    }
    if (m.key === 'duration') {
      ck('duration: 时长 + 负重 + 单位', has('SET_DURATION') && has('UNIT') && (has('WEIGHT') || has('LOAD')), shown.join(','));
      ck('duration: **不显示 次数**', !has('REPS'), shown.join(','));
    }
    if (m.key === 'distance_duration') {
      ck('distance: 距离 + 负重 + 单位', has('DISTANCE') && has('UNIT') && (has('WEIGHT') || has('LOAD')), shown.join(','));
      ck('distance: **不显示 次数**', !has('REPS'), shown.join(','));
    }
  }
}

console.log('\n════ 2) add-exercise-modal · 录入字段分配 ════');
{
  const file = path.join(ROOT, 'components/add-exercise-modal/index.wxml');
  const root = parse(fs.readFileSync(file, 'utf8'));
  for (const m of MODES) {
    const scope = scopeFor(m);
    const vis = computeVisibility(root, scope);
    const blocks = findFieldBlocks(root, vis, ['input-section', 'unit-toggle'], scope);
    const shown = blocks.filter((b) => b.visible && b.label).map((b) => b.label);
    const classes = blocks.filter((b) => b.visible).map((b) => b.cls).join(' ').toLowerCase();
    const has = (k) => shown.includes(k) || classes.includes(k.toLowerCase());
    console.log(`  ${m.key.padEnd(19)} -> ${shown.join(', ') || '(none)'}`);
    if (m.key === 'weight_reps') {
      ck('weight_reps: 重量 + 单位 + 次数', ['WEIGHT', 'UNIT', 'REPS'].every(has), shown.join(','));
      ck('weight_reps: 不显示 时长/距离', !has('SET_DURATION') && !has('DISTANCE'), shown.join(','));
    }
    if (m.key === 'duration') {
      ck('duration: 时长 + 负重 + 单位', has('SET_DURATION') && has('UNIT') && (has('WEIGHT') || has('LOAD')), shown.join(','));
      ck('duration: **不显示 次数**', !has('REPS'), shown.join(','));
    }
    if (m.key === 'distance_duration') {
      ck('distance: 距离 + 负重 + 单位', has('DISTANCE') && has('UNIT') && (has('WEIGHT') || has('LOAD')), shown.join(','));
      ck('distance: **不显示 次数**', !has('REPS'), shown.join(','));
    }
  }
}


console.log('\n════ 3) 表单控件高度一致性 ════');
{
  // 同一行里的控件(± 按钮 / 输入框 / 单位切换)高度不一致 → 一行参差不齐。
  // 2026-11-07 实测(用户截图 + 像素测量):
  //   .field-btn   48rpx 固定
  //   .field-input 没写 height → 被内容撑到 ~65rpx  ← 高 17rpx
  //   .unit-btn    由 padding 撑出 ~44rpx           ← 矮 4rpx
  const CSS_CASES = [
    {
      file: 'components/edit-exercise-modal/index.wxss',
      sels: ['.field-btn', '.field-input', '.unit-toggle'],
      label: 'edit 弹框',
    },
    {
      file: 'components/add-exercise-modal/index.wxss',
      sels: ['.input-btn', '.input-field', '.unit-btn'],
      label: 'add 弹框',
    },
  ];
  for (const c of CSS_CASES) {
    const css = fs.readFileSync(path.join(ROOT, c.file), 'utf8');
    const heights = c.sels.map((sel) => {
      // 注意: 只转义点号, 别多写一个反斜杠(否则变成"匹配字面反斜杠")
      const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}');
      const m = re.exec(css);
      if (!m) return null;
      // 用 (?:^|[;{ \s]) 前缀, 避免把 line-height 也当成 height
      const h = /(?:^|[;{ \s])height:\s*(\d+)rpx/.exec(m[1]);
      return h ? Number(h[1]) : null;
    });
    ck(`${c.label}: 三个控件都写了显式 height`,
      heights.every((h) => h != null), `${c.sels.join(' / ')} → ${heights.join(' / ')}`);
    const uniq = [...new Set(heights.filter((h) => h != null))];
    ck(`${c.label}: 三个控件高度一致`,
      uniq.length === 1 && heights.every((h) => h != null),
      `${heights.join(' / ')} rpx`);

    // ⚠️ 光看声明的 height 不够 —— 小程序默认是 content-box,
    //    带 1rpx border 的控件实际高度 = height + 2rpx, 比没 border 的高一截。
    //    (2026-11-07 实测: add 弹框的 .input-btn/.unit-btn 因此比 .input-field 高 2rpx)
    for (const sel of c.sels) {
      const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}');
      const m = re.exec(css);
      const body = m ? m[1] : '';
      const hasBorder = /border:\s*(?!none)[^;]*\d/.test(body.replace(/border-radius[^;]*;/g, ''));
      const hasBorderBox = /box-sizing:\s*border-box/.test(body);
      ck(`${c.label}: ${sel}${hasBorder ? '(有 border)' : ''} 配了 box-sizing:border-box`,
        !hasBorder || hasBorderBox,
        hasBorder && !hasBorderBox ? 'content-box → 实际高度多 2rpx' : '');
    }
  }
}


console.log('\n════ 4) set 展示的互斥分支 ════');
{
  // 三个展示点都要查: 训练总结弹框 / 会话详情弹框 / 首页训练列表。
  //
  // ⚠️ 2026-11-07 用户截图: 交叉跳跃(duration 类)在训练总结里显示成
  //    "60秒  20kg  20kg  × 0 reps" —— 时长分支和 else 分支**同时**渲染了。
  //    根因: 写成 "if / if / if / elif / if / if / else" 时,
  //    wx:elif 配对的是**紧邻的上一个 if**, wx:else 配对的是**最后那个 if**,
  //    于是 duration 分支成立时, else 分支也跟着成立。
  //
  // 规则: 同一个 set 的展示里, "次数(reps)" 和 "时长/距离" 是**互斥**的,
  //       任何模式下都不能同时出现。
  const SHOW_CASES = [
    { file: 'components/workout-summary-modal/index.wxml', label: '训练总结弹框', extra: { isOpen: true } },
    { file: 'components/session-detail-modal/index.wxml', label: '会话详情弹框', extra: { isOpen: true, session: {} } },
    {
      file: 'pages/index/index.wxml',
      label: '首页训练列表',
      // exerciseGroups 的长度决定了 set 列表整段渲不渲染, 缺了它整棵树都不可见
      extra: { runningSession: {}, viewingSession: {}, exerciseGroups: [{ sets: [] }] },
    },
  ];

  // 三种 set 形态
  const SET_FORMS = [
    { key: 'duration+负重', s: { duration_sec: 60, distance_km: 0, weight: 10, reps: 0, weight_unit: 'kg' } },
    { key: 'distance+负重', s: { duration_sec: 0, distance_km: 5, weight: 10, reps: 0, weight_unit: 'kg' } },
    { key: '次数类', s: { duration_sec: 0, distance_km: 0, weight: 20, reps: 12, weight_unit: 'kg' } },
  ];

  /** 在解析树里找 wx:for 指向 item.sets 的节点 */
  function findSetsContainer(node) {
    for (const c of node.children || []) {
      if (!c.tag || c.type === 'text') continue;
      const f = c.attrs['wx:for'] || '';
      if (f.indexOf('item.sets') >= 0) return c;
      const hit = findSetsContainer(c);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * 收集容器里**真正会渲染的叶子节点**。
   *
   * ⚠️ 不能只看直接子元素 —— <block> 不产生节点, 真正显示的是它里面的叶子。
   *    也不能只看文本 —— 一个 <block> 的 textOf 会把整个分支的文本都算进来
   *    (distance 分支里也含 DURATION_UNIT, 会被误判成 duration)。
   */
  function collectLeaves(node, vis, out, parentCls) {
    out = out || [];
    for (const c of node.children || []) {
      if (!c.tag || c.type === 'text') continue;
      if (vis.get(c) !== true) continue;
      const cls = (c.attrs && c.attrs.class) || '';
      const kids = (c.children || []).filter((k) => k.tag && k.type !== 'text' && vis.get(k) === true);
      if (kids.length === 0) out.push({ node: c, parentCls: parentCls || '' });
      else collectLeaves(c, vis, out, cls);
    }
    return out;
  }

  /**
   * 给一个可见叶子元素打语义标记。
   *
   * ⚠️ reps 标记常在**父元素**的 class 上(首页: <view class="ec-set-val reps">),
   *    而叶子本身是它里面的 <text class="ec-set-unit">{{t.REPS_UNIT}}</text>。
   *    所以要看一层祖先的 class。
   * ⚠️ 但**不能**把祖先的文本也累积进来 —— 距离分支里也含 DURATION_UNIT
   *    (距离类可选记录时长), 累积会把 distance 误判成 duration。
   *    所以: class 看一层祖先, 文本只看自己。
   */
  function semantics(leaf) {
    const txt = textOf(leaf.node);
    // ⚠️ 只能看**文本**, 不能看 class —— 首页/session-detail 里
    //    <view class="ec-set-val reps"> 是"主要数值"的意思, 时长也用它。
    //    靠 class 判会把时长误判成次数。
    if (txt.indexOf('REPS_UNIT') >= 0 || txt.indexOf('t.REPS') >= 0 || /(^|[^A-Z_])reps([^A-Z_]|$)/.test(txt)) return 'reps';
    if (txt.indexOf('DURATION_UNIT') >= 0) return 'duration';
    if (txt.indexOf('t.KM') >= 0) return 'distance';
    return 'other';
  }

  for (const c of SHOW_CASES) {
    const root = parse(fs.readFileSync(path.join(ROOT, c.file), 'utf8'));
    const container = findSetsContainer(root);
    if (!container) {
      ck(`${c.label}: 找到 set 展示容器`, false, c.file);
      continue;
    }
    for (const form of SET_FORMS) {
      const scope = {
        ...form.s,
        ...c.extra,
        item: { ...form.s },
        s: { ...form.s },
        group: { ...form.s },
        index: 0,
        t: {},
        locale: 'zh',
        theme: 'night',
      };
      const vis = computeVisibility(root, scope);
      const leaves = collectLeaves(container, vis).filter((l) => {
        const cls = ((l.node.attrs && l.node.attrs.class) || '') + ' ' + (l.parentCls || '');
        // 只排掉"序号"这类装饰元素。
        // ⚠️ 别把 unit 也排掉 —— <view class="ec-set-unit">{{t.DURATION_UNIT}}</view>
        //    是单位文本, 恰恰是**唯一**带语义的叶子, 排掉就什么都收集不到了。
        return !/num/.test(cls);
      });
      const marks = new Set(leaves.map(semantics).filter((m) => m !== 'other'));
      const hasReps = marks.has('reps');
      const hasTime = marks.has('duration') || marks.has('distance');
      ck(`${c.label} / ${form.key}: 次数与时长/距离不同时出现`,
        !(hasReps && hasTime),
        `可见语义: ${[...marks].join(',') || '(无)'}`);
    }
  }
}

console.log(`\n════ 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ════\n`);
process.exit(fail === 0 ? 0 : 1);
