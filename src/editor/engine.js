// Движок редактора: документ со слоями и операции рисования.
import { pixelMap, mirrorPixel, capeMask, sameFace, SIZE, CAPE_W, CAPE_H } from './layout.js';

let uid = 1;
export const newId = () => 'l' + Date.now().toString(36) + (uid++);

export const BLENDS = [
  ['source-over', 'Обычный'],
  ['multiply', 'Умножение'],
  ['screen', 'Осветление'],
  ['overlay', 'Перекрытие'],
  ['soft-light', 'Мягкий свет'],
  ['color', 'Цветность'],
  ['luminosity', 'Яркость']
];

export function makeLayer(name, w, h, data) {
  return { id: newId(), name, visible: true, opacity: 1, blend: 'source-over', locked: false, lockAlpha: false, data: data ? new Uint8ClampedArray(data) : new Uint8ClampedArray(w * h * 4) };
}

export function makeDoc(kind, layers, slim = false) {
  const w = kind === 'cape' ? CAPE_W : SIZE;
  const h = kind === 'cape' ? CAPE_H : SIZE;
  const ls = layers.map((l) => makeLayer(l.name, w, h, l.data));
  return { kind, w, h, slim, layers: ls, active: ls[ls.length - 1].id };
}

export function cloneLayers(layers) {
  return layers.map((l) => ({ ...l, data: new Uint8ClampedArray(l.data) }));
}

// ---------- композиция ----------
const scratch = new Map();
function scratchCanvas(w, h) {
  const k = w + 'x' + h;
  if (!scratch.has(k)) { const c = document.createElement('canvas'); c.width = w; c.height = h; scratch.set(k, c); }
  return scratch.get(k);
}

export function composite(doc, target, { onlyVisible = true } = {}) {
  target.width = doc.w;
  target.height = doc.h;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, doc.w, doc.h);
  const tmp = scratchCanvas(doc.w, doc.h);
  const tctx = tmp.getContext('2d');
  for (const l of doc.layers) {
    if (onlyVisible && !l.visible) continue;
    tctx.clearRect(0, 0, doc.w, doc.h);
    tctx.putImageData(new ImageData(l.data, doc.w, doc.h), 0, 0);
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend || 'source-over';
    ctx.drawImage(tmp, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return target;
}

export function compositeData(doc) {
  const c = document.createElement('canvas');
  composite(doc, c);
  return c.getContext('2d').getImageData(0, 0, doc.w, doc.h).data;
}

// ---------- маски ----------
export function maskFn(doc, hidden) {
  if (doc.kind === 'cape') {
    const m = capeMask();
    return (x, y) => !!m[y * doc.w + x];
  }
  const map = pixelMap(doc.slim);
  return (x, y) => {
    const p = map[y * SIZE + x];
    if (!p) return false;
    if (hidden && (hidden[p.part] || hidden[p.layer])) return false;
    return true;
  };
}

export function mirrorFn(doc) {
  if (doc.kind === 'cape') {
    const mask = capeMask();
    return (x, y) => {
      const m = mask[y * doc.w + x];
      if (!m || (m.face !== 'front' && m.face !== 'back' && m.face !== 'top' && m.face !== 'bottom')) return null;
      const w = m.part === 'cape' ? 10 : 10;
      const nx = x - m.lx + (w - 1 - m.lx);
      return nx === x ? null : [nx, y];
    };
  }
  return (x, y) => mirrorPixel(x, y, doc.slim);
}

// ---------- пиксели ----------
function blendOver(d, i, c, a) {
  const sa = (c[3] / 255) * a;
  if (sa <= 0) return;
  const da = d[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) { d[i + 3] = 0; return; }
  d[i] = (c[0] * sa + d[i] * da * (1 - sa)) / oa;
  d[i + 1] = (c[1] * sa + d[i + 1] * da * (1 - sa)) / oa;
  d[i + 2] = (c[2] * sa + d[i + 2] * da * (1 - sa)) / oa;
  d[i + 3] = oa * 255;
}

// Возвращает функцию, применяющую инструмент к одному пикселю слоя
export function pixelOp(tool, opts, layer, doc, srcComposite) {
  const d = layer.data;
  const w = doc.w;
  const { color, strength = 1, noise = 0.15 } = opts;
  switch (tool) {
    case 'pencil':
      return (x, y) => {
        const i = (y * w + x) * 4;
        if (layer.lockAlpha && d[i + 3] === 0) return;
        if (layer.lockAlpha) { const a = d[i + 3]; d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = a; return; }
        d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = color[3];
      };
    case 'brush':
      return (x, y, k = 1) => {
        const i = (y * w + x) * 4;
        if (layer.lockAlpha) {
          if (d[i + 3] === 0) return;
          const a = d[i + 3];
          const s = strength * k * (color[3] / 255);
          d[i] += (color[0] - d[i]) * s; d[i + 1] += (color[1] - d[i + 1]) * s; d[i + 2] += (color[2] - d[i + 2]) * s; d[i + 3] = a;
          return;
        }
        blendOver(d, i, color, strength * k);
      };
    case 'eraser':
      return (x, y, k = 1) => {
        const i = (y * w + x) * 4;
        d[i + 3] = Math.max(0, d[i + 3] - 255 * strength * k);
      };
    case 'dither':
      return (x, y) => {
        const i = (y * w + x) * 4;
        if (layer.lockAlpha && d[i + 3] === 0) return;
        const f = 1 + (Math.random() * 2 - 1) * noise;
        d[i] = color[0] * f; d[i + 1] = color[1] * f; d[i + 2] = color[2] * f;
        d[i + 3] = layer.lockAlpha ? d[i + 3] : color[3];
      };
    case 'checker':
      return (x, y) => {
        if ((x + y) % 2) return;
        const i = (y * w + x) * 4;
        if (layer.lockAlpha && d[i + 3] === 0) return;
        d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = layer.lockAlpha ? d[i + 3] : color[3];
      };
    case 'lighten':
    case 'darken':
      return (x, y, k = 1) => {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) return;
        const f = tool === 'lighten' ? 1 + 0.18 * strength * k : 1 - 0.18 * strength * k;
        d[i] = Math.min(255, d[i] * f + (tool === 'lighten' ? 3 : 0));
        d[i + 1] = Math.min(255, d[i + 1] * f + (tool === 'lighten' ? 3 : 0));
        d[i + 2] = Math.min(255, d[i + 2] * f + (tool === 'lighten' ? 3 : 0));
      };
    case 'blend':
      return (x, y, k = 1) => {
        // смешивание: тянем пиксель к среднему соседей (только видимые пиксели)
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) return;
        let r = 0, g = 0, b = 0, n = 0;
        const src = srcComposite || d;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= doc.h) continue;
          const j = (yy * w + xx) * 4;
          if (src[j + 3] === 0) continue;
          r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
        }
        if (!n) return;
        const s = 0.5 * strength * k;
        d[i] += (r / n - d[i]) * s; d[i + 1] += (g / n - d[i + 1]) * s; d[i + 2] += (b / n - d[i + 2]) * s;
      };
    default:
      return () => {};
  }
}

// Применяет мазок кистью размера size в точке (x,y)
export function stamp(doc, layer, x, y, { size = 1, shape = 'square', soft = false }, op, canPaint, mirror) {
  const r = (size - 1) / 2;
  const touched = new Set();
  const apply = (px, py, k) => {
    if (px < 0 || py < 0 || px >= doc.w || py >= doc.h) return;
    const key = py * doc.w + px;
    if (touched.has(key)) return;
    if (!canPaint(px, py)) return;
    touched.add(key);
    op(px, py, k);
  };
  const x0 = Math.floor(x - r), y0 = Math.floor(y - r);
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    const ox = dx - r, oy = dy - r;
    const dist = Math.sqrt(ox * ox + oy * oy);
    if (shape === 'circle' && size > 2 && dist > r + 0.35) continue;
    const k = soft && size > 1 ? Math.max(0.15, 1 - dist / (r + 1)) : 1;
    const px = x0 + dx, py = y0 + dy;
    apply(px, py, k);
    if (mirror) {
      const m = mirror(px, py);
      if (m) apply(m[0], m[1], k);
    }
  }
}

export function linePoints(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

export function rectPoints(x0, y0, x1, y1, filled) {
  const pts = [];
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (filled || y === ay || y === by || x === ax || x === bx) pts.push([x, y]);
  }
  return pts;
}

function colorDist(d, i, c) {
  return Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]), Math.abs(d[i + 3] - c[3]));
}

// Заливка: contiguous / по грани / глобальная
export function fill(doc, layer, x, y, color, { tolerance = 0, mode = 'contiguous', canPaint, mirror }) {
  const d = layer.data;
  const w = doc.w, h = doc.h;
  const i0 = (y * w + x) * 4;
  const target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const tol = tolerance * 2.55;
  const out = [];
  const faceLimit = mode === 'face' && doc.kind === 'skin' ? sameFace(x, y, doc.slim) : null;
  if (mode === 'global') {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (canPaint(xx, yy) && colorDist(d, (yy * w + xx) * 4, target) <= tol) out.push([xx, yy]);
    }
  } else {
    const seen = new Uint8Array(w * h);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const k = cy * w + cx;
      if (seen[k]) continue;
      seen[k] = 1;
      if (!canPaint(cx, cy)) continue;
      if (faceLimit && !faceLimit(cx, cy)) continue;
      if (mode !== 'face' && colorDist(d, k * 4, target) > tol) continue;
      out.push([cx, cy]);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  const all = [...out];
  if (mirror) for (const [px, py] of out) { const m = mirror(px, py); if (m && canPaint(m[0], m[1])) all.push(m); }
  for (const [px, py] of all) {
    const i = (py * w + px) * 4;
    if (layer.lockAlpha && d[i + 3] === 0) continue;
    d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2];
    if (!layer.lockAlpha) d[i + 3] = color[3];
  }
  return all.length;
}

// Градиент между двумя цветами вдоль линии; ограничен гранью стартовой точки (или всем видимым)
export function gradient(doc, layer, x0, y0, x1, y1, c0, c1, { canPaint, faceOnly = true }) {
  const d = layer.data;
  const w = doc.w;
  const lim = faceOnly && doc.kind === 'skin' ? sameFace(x0, y0, doc.slim) : null;
  const vx = x1 - x0, vy = y1 - y0;
  const len2 = vx * vx + vy * vy || 1;
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < w; x++) {
    if (!canPaint(x, y)) continue;
    if (lim && !lim(x, y)) continue;
    let tt = ((x - x0) * vx + (y - y0) * vy) / len2;
    tt = Math.max(0, Math.min(1, tt));
    // лёгкий дизеринг для «пиксельного» градиента
    const steps = 6;
    tt = Math.round(tt * steps + ((x + y) % 2 ? 0.25 : -0.25)) / steps;
    tt = Math.max(0, Math.min(1, tt));
    const i = (y * w + x) * 4;
    if (layer.lockAlpha && d[i + 3] === 0) continue;
    d[i] = c0[0] + (c1[0] - c0[0]) * tt;
    d[i + 1] = c0[1] + (c1[1] - c0[1]) * tt;
    d[i + 2] = c0[2] + (c1[2] - c0[2]) * tt;
    if (!layer.lockAlpha) d[i + 3] = c0[3] + (c1[3] - c0[3]) * tt;
  }
}

// Уникальные цвета (для палитры «Цвета скина»)
export function extractPalette(data, max = 24) {
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue;
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const e = counts.get(k);
    if (e) e.n++; else counts.set(k, { n: 1, c: [data[i], data[i + 1], data[i + 2], 255] });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((e) => e.c);
}

// Загрузка PNG в ImageData нужного размера (с конвертацией старых скинов 64x32)
export function loadImageData(src, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      if (w === 64 && h === 64 && img.width === img.height * 2) {
        // старый формат 64x32: растягиваем и копируем левые конечности
        const k = img.width / 64;
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 64, 32);
        const flipCopy = (sx, sy, dx, dy) => {
          // копия бокса конечности 16x16 (без зеркалирования граней — достаточно для старта)
          ctx.drawImage(c, sx, sy, 16, 16, dx, dy, 16, 16);
        };
        flipCopy(0, 16, 16, 48);
        flipCopy(40, 16, 32, 48);
        void k;
      } else {
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
      }
      resolve(ctx.getImageData(0, 0, w, h).data);
    };
    img.onerror = () => reject(new Error('Не удалось открыть картинку'));
    img.src = src;
  });
}

export function layerToDataUrl(l, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(l.data), w, h), 0, 0);
  return c.toDataURL('image/png');
}

export function isEmpty(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i]) return false;
  return true;
}
