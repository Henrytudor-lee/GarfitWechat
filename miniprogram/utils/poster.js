// utils/poster.js — 训练分享海报(Canvas 2D 手绘)
//
// 为什么自己画而不是"截图":
//   小程序**没有截取 WXML 的 API** —— canvas.drawImage 画不了 DOM 节点,
//   wx.canvasToTempFilePath 只能导出 canvas 自己的内容。
//   后端渲染(Puppeteer / 服务端出图)要额外装 headless Chromium,
//   跟现有 "npm ci && npm run build && pm2 restart" 的部署链路冲突, 小 VPS 内存也扛不住。
//   所以走 canvas 2d 手写排版: 数据现成(分享页已有 training + groups), 零新增数据接口。
//
// 画布尺寸上限(为什么有 dpr 降级):
//   iOS 上 canvas 单边约 4096 设备像素, 超了 wx.canvasToTempFilePath 会直接失败。
//   所以按内容高度自适应降 dpr(3 → 2 → 1), 还超高就截断动作 + 标「等 N 个动作」。
//
// 版式跟分享页视觉对齐(深色底 + 荧光绿主色), 宽度按 750rpx 折算成 375 CSS px。

const DESIGN_W = 375;        // 750rpx → CSS px
const MAX_EDGE_PX = 4096;    // 画布单边上限(设备像素)
const MAX_DPR = 3;
/** dpr 下限 —— 低于 2 倍图就明显糊了, 宁可截断几个动作也不出糊图 */
const MIN_DPR = 2;

/** 画布配色 —— 跟 pages/share/index.wxss 一个口径 */
const C = {
  bg: '#131313',
  card: '#1f1f1f',
  cardBorder: '#262626',
  chip: '#252525',
  text: '#f2f2f2',
  textSub: '#8a8a8a',
  textDim: '#6a6a6a',
  setText: '#d8d8d8',
  accent: '#ccf200',
  black: '#000000',
  white: '#ffffff',
};

/** 版式常量 */
const PAD = 16;            // 页面左右留白
const CARD_PAD = 10;       // 动作卡内边距
const THUMB = 44;          // 动作缩略图边长
const CHIP_H = 20;         // 每组明细条高度
const CHIP_GAP = 6;        // 组明细之间的间距
const GROUP_GAP = 10;      // 动作卡之间的间距
const QR_IMG = 76;         // 小程序码边长
const QR_PAD = 6;          // 小程序码白边
const QR_BOX = QR_IMG + QR_PAD * 2;
/** 页脚固定高度(分隔线 + 码 + 底部留白) —— 截断动作卡时要用它留出预算 */
const FOOTER_H = 4 + 1 + 14 + QR_BOX + 20;

/** 圆角矩形路径 —— ctx.roundRect 老基础库没有, 自己用 arcTo 拼 */
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** 文本超宽时截断加省略号 */
function fitText(ctx, text, maxWidth) {
  const str = String(text == null ? '' : text);
  if (!maxWidth || ctx.measureText(str).width <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

/**
 * 一组明细的文案
 *
 * 口径跟页面 .set-item 完全一致:
 *   距离类 → 距离必显, 时长/负重可选
 *   计时类 → 时长必显, 负重可选
 *   次数类 → 负重 × 次数
 */
function setText(s, t) {
  const dict = t || {};
  const unit = s.weightUnit || 'kg';
  const km = Number(s.distanceKm) || 0;
  const sec = Number(s.durationSec) || 0;
  const kg = Number(s.weight) || 0;
  if (km > 0) {
    let out = km + ' ' + (dict.KM || 'km');
    if (sec > 0) out += ' · ' + sec + ' ' + (dict.DURATION_UNIT || 's');
    if (kg > 0) out += ' · ' + kg + ' ' + unit;
    return out;
  }
  if (sec > 0) {
    let out = sec + ' ' + (dict.DURATION_UNIT || 's');
    if (kg > 0) out += ' · ' + kg + ' ' + unit;
    return out;
  }
  return kg + ' ' + unit + ' × ' + (Number(s.reps) || 0) + ' ' + (dict.REPS || 'reps');
}

/**
 * 排版: 把海报内容算成一串绘制指令
 *
 * 先算再画是有意的 —— 画布高度得**先知道**才能设 canvas.height,
 * 而 wx.canvasToTempFilePath 导出的就是 canvas 本身。
 */
function buildLayout(model, maxHeight) {
  const ops = [];
  const t = model.t || {};
  let y = 0;

  const push = (op) => ops.push(op);
  const text = (x, yy, str, font, color, align, maxWidth) => {
    push({ k: 'text', x, y: yy, text: str, font, color, align: align || 'left', maxWidth: maxWidth || 0 });
  };

  // ── 分享者 ──
  const AVATAR = 38;
  const headTop = 16;
  push({
    k: 'img', x: PAD, y: headTop, w: AVATAR, h: AVATAR, r: AVATAR / 2, src: 'avatar',
    fallbackBg: '#2a2a2a', fallbackFg: C.accent,
    fallbackText: String(model.ownerName || 'G').charAt(0).toUpperCase(),
  });
  text(PAD + AVATAR + 12, headTop + 15, model.ownerName, 'bold 15px sans-serif', C.text, 'left', 210);
  text(PAD + AVATAR + 12, headTop + 32, model.ownerLabel, '10px sans-serif', C.textSub, 'left', 210);
  y = headTop + AVATAR + 16;

  // ── 摘要三卡(时长 / 动作 / 卡路里) ──
  const cardsTop = y;
  const cardH = 54;
  const gap = 8;
  const cardW = (DESIGN_W - PAD * 2 - gap * 2) / 3;
  const cards = [
    { v: model.durationText, l: t.DURATION || '时长' },
    { v: model.exerciseCount, l: t.EXERCISES || '动作' },
    { v: model.calories, l: t.CAL_UNIT || '卡路里' },
  ];
  cards.forEach((it, i) => {
    const x = PAD + i * (cardW + gap);
    push({ k: 'rect', x, y: cardsTop, w: cardW, h: cardH, r: 10, fill: C.card, stroke: C.cardBorder, lw: 1 });
    text(x + cardW / 2, cardsTop + 26, it.v, 'bold 19px sans-serif', C.accent, 'center');
    text(x + cardW / 2, cardsTop + 43, it.l, '10px sans-serif', C.textSub, 'center');
  });
  y = cardsTop + cardH + 12;

  // ── 日期 ──
  text(PAD, y + 10, model.dateText, '10px monospace', C.textDim, 'left');
  y += 26;

  // ── 动作卡 ──
  // 预算: 高度上限减去固定的头/摘要/页脚, 超了就把后面的动作截掉
  const groupsTop = y;
  const groupBudget = Math.max(0, (maxHeight || 0) - groupsTop - FOOTER_H);
  const innerW = DESIGN_W - PAD * 2 - CARD_PAD * 2;
  const chipW = (innerW - CHIP_GAP) / 2;
  let shown = 0;

  for (const g of model.groups || []) {
    const sets = g.sets || [];
    const rows = Math.ceil(sets.length / 2);
    const setsH = rows ? rows * CHIP_H + (rows - 1) * CHIP_GAP : 0;
    const cardH = CARD_PAD + THUMB + 8 + setsH + CARD_PAD;
    // 装不下了就停 —— 剩下的用「等 N 个动作」带过
    if (groupBudget && y - groupsTop + cardH > groupBudget && shown > 0) break;

    const top = y;
    push({ k: 'rect', x: PAD, y: top, w: DESIGN_W - PAD * 2, h: cardH, r: 11, fill: C.card, stroke: C.cardBorder, lw: 1 });
    push({ k: 'img', x: PAD + CARD_PAD, y: top + CARD_PAD, w: THUMB, h: THUMB, r: 8, src: 'thumb:' + g.key });
    const nameX = PAD + CARD_PAD + THUMB + 10;
    const calRight = DESIGN_W - PAD - CARD_PAD;
    const nameMax = calRight - 16 - nameX;
    text(nameX, top + CARD_PAD + 15, g.name, 'bold 14px sans-serif', C.text, 'left', nameMax);
    text(nameX, top + CARD_PAD + 32, g.sub, '10px sans-serif', C.textSub, 'left', nameMax);
    text(calRight, top + CARD_PAD + 15, g.calories, 'bold 13px sans-serif', C.accent, 'right');

    // 每组明细: 一行两条, 跟页面 .sets-grid 一个口径
    const setsTop = top + CARD_PAD + THUMB + 8;
    sets.forEach((s, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = PAD + CARD_PAD + col * (chipW + CHIP_GAP);
      const cy = setsTop + row * (CHIP_H + CHIP_GAP);
      push({ k: 'rect', x: cx, y: cy, w: chipW, h: CHIP_H, r: 6, fill: C.chip });
      push({ k: 'circle', x: cx + 12, y: cy + CHIP_H / 2, r: 8, fill: C.accent });
      text(cx + 12, cy + CHIP_H / 2 + 3.4, String(s.num), 'bold 8px sans-serif', C.black, 'center');
      text(cx + 24, cy + CHIP_H / 2 + 3.6, s.text, '10px sans-serif', C.setText, 'left', chipW - 30);
    });

    y = top + cardH + GROUP_GAP;
    shown++;
  }

  if (shown > 0) y -= GROUP_GAP;
  const more = (model.groups || []).length - shown;
  if (more > 0) {
    text(PAD, y + 12, String(model.moreTemplate || '… +{n}').replace('{n}', more), '10px sans-serif', C.textDim, 'left');
    y += 24;
  }

  // ── 页脚: 品牌 + 小程序码 ──
  y += 4;
  push({ k: 'line', x1: PAD, y1: y, x2: DESIGN_W - PAD, y2: y, color: '#2a2a2a', lw: 1 });
  y += 14;
  const qrY = y;
  push({ k: 'rect', x: DESIGN_W - PAD - QR_BOX, y: qrY, w: QR_BOX, h: QR_BOX, r: 10, fill: C.white });
  push({ k: 'img', x: DESIGN_W - PAD - QR_BOX + QR_PAD, y: qrY + QR_PAD, w: QR_IMG, h: QR_IMG, r: 4, src: 'qrcode' });
  text(PAD, qrY + 30, 'GFIT', 'bold 15px sans-serif', C.accent, 'left');
  text(PAD, qrY + 48, model.footerHint, '10px sans-serif', C.textSub, 'left');
  y = qrY + QR_BOX + 20;

  return { ops, height: Math.round(y) };
}

/** 把排版指令画到画布上 */
function paint(ctx, layout, assets) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, DESIGN_W, layout.height);
  ctx.textBaseline = 'alphabetic';

  for (const op of layout.ops) {
    if (op.k === 'rect') {
      roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r);
      ctx.fillStyle = op.fill;
      ctx.fill();
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.lw || 1;
        ctx.stroke();
      }
    } else if (op.k === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fillStyle = op.fill;
      ctx.fill();
    } else if (op.k === 'line') {
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.lw || 1;
      ctx.stroke();
    } else if (op.k === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align || 'left';
      ctx.fillText(op.maxWidth ? fitText(ctx, op.text, op.maxWidth) : op.text, op.x, op.y);
    } else if (op.k === 'img') {
      const img = op.src.indexOf('thumb:') === 0
        ? (assets.thumbs || {})[op.src.slice(6)]
        : assets[op.src];
      // ⚠️ 加载失败的图**绝对不能画** —— 画失败图会污染画布,
      //    导致 canvasToTempFilePath 导出成白图或直接失败。
      if (!img) {
        // 画个占位块, 别在海报上留个空洞
        roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r);
        ctx.fillStyle = op.fallbackBg || '#232323';
        ctx.fill();
        if (op.fallbackText) {
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = op.fallbackFg || C.textDim;
          ctx.textAlign = 'center';
          ctx.fillText(op.fallbackText, op.x + op.w / 2, op.y + op.h / 2 + 4);
        }
        continue;
      }
      ctx.save();
      roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r);
      ctx.clip();
      ctx.drawImage(img, op.x, op.y, op.w, op.h);
      ctx.restore();
    }
  }
}

/**
 * 按内容高度挑 dpr
 *
 * iOS 上 canvas 单边约 4096 设备像素, 超了 wx.canvasToTempFilePath 会失败。
 * 所以从设备 dpr 往下退(3 → 2 → 1), 找一个装得下的。
 */
function pickDpr(height) {
  let deviceDpr = MAX_DPR;
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    deviceDpr = info.pixelRatio || 2;
  } catch (e) {
    deviceDpr = 2;
  }
  const maxDpr = Math.min(MAX_DPR, Math.max(MIN_DPR, deviceDpr));
  for (let d = maxDpr; d > MIN_DPR; d--) {
    if (height * d <= MAX_EDGE_PX) return d;
  }
  return MIN_DPR;
}

/**
 * 画海报并导出临时文件路径
 *
 * @param {Object} opts
 *   canvas  canvas 节点(离屏的 type="2d")
 *   model   排版数据(见 pages/share/index.js 的 _posterModel)
 *   assets  { avatar, qrcode, thumbs: {key: img} }
 */
function renderPoster(opts) {
  const canvas = opts.canvas;
  // 高度预算按 MIN_DPR 算 —— 保证出的图至少 2 倍清晰度
  const layout = buildLayout(opts.model, Math.floor(MAX_EDGE_PX / MIN_DPR));
  const dpr = pickDpr(layout.height);

  canvas.width = Math.round(DESIGN_W * dpr);
  canvas.height = Math.round(layout.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  paint(ctx, layout, opts.assets || {});

  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'png',
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(new Error((err && err.errMsg) || 'canvas export failed')),
    });
  });
}

/**
 * 网络图 → 本地临时路径
 *
 * ⚠️ 网络图**不能直接**丢给 canvas.drawImage —— 跨域图会污染画布,
 *    导致 canvasToTempFilePath 导出失败。必须先换成本地路径。
 */
function loadLocalImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(''); return; }
    wx.getImageInfo({
      src,
      success: (res) => resolve(res.path || ''),
      fail: () => resolve(''),
    });
  });
}

/** 本地路径 → canvas 图片对象(加载失败返回 null, 调用方跳过就行) */
function toCanvasImage(canvas, localPath) {
  return new Promise((resolve) => {
    if (!localPath) { resolve(null); return; }
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = localPath;
  });
}

/** base64 图片 → 本地临时文件(canvas 对 base64 支持不稳, 落盘最保险) */
function writeBase64File(base64, name) {
  try {
    const fs = wx.getFileSystemManager();
    const filePath = wx.env.USER_DATA_PATH + '/' + name;
    fs.writeFileSync(filePath, base64, 'base64');
    return filePath;
  } catch (e) {
    return '';
  }
}

module.exports = {
  DESIGN_W,
  MAX_EDGE_PX,
  buildLayout,
  paint,
  renderPoster,
  loadLocalImage,
  toCanvasImage,
  writeBase64File,
  setText,
};
