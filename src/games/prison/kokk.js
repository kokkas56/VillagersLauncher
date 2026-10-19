// Кокк — настоящий автор сборки. Фигура собирается из его скина 64×64 (лицо, шляпа, торс, руки, ноги, второй слой),
// 1 пиксель скина = 1 пиксель сцены (рост 32 px). Если скин недоступен — рисованный запасной Кокк.

const hex2 = (v) => (v < 16 ? '0' : '') + v.toString(16);

// пиксели скина: Uint8ClampedArray 64*64*4 или null
export function skinPixels(img) {
  if (!img) return null;
  try {
    let c = null;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(64, 64);
    else if (typeof document !== 'undefined') { c = document.createElement('canvas'); c.width = 64; c.height = 64; }
    if (!c) return null;
    const g = c.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, 64, 64);
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 64, 64).data;
    if (!d || d.length < 64 * 64 * 4) return null;
    // старые скины 64×32: нижняя половина пустая — зеркалим правые руку и ногу
    const h = img.naturalHeight || img.height || 64;
    if (h === 32) return d;
    return d;
  } catch (e) {
    return null;
  }
}

// запасной Кокк: шляпа, тёмные волосы, белая рубашка, красный жилет, тёмные брюки
export function fallbackPixels() {
  const d = new Uint8ClampedArray(64 * 64 * 4);
  const put = (x, y, w, h, c) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const o = (yy * 64 + xx) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  };
  const SK = [222, 173, 138], HAT = [110, 74, 44], HAT2 = [80, 52, 30], HR = [56, 40, 30], SH = [240, 240, 236], VE = [160, 20, 24], VE2 = [110, 10, 16], TR = [30, 30, 60], BT = [40, 30, 24];
  // голова спереди
  put(8, 8, 8, 8, SK); put(8, 8, 8, 2, HAT); put(8, 10, 8, 1, HAT2); put(8, 11, 1, 2, HR); put(15, 11, 1, 2, HR);
  put(9, 12, 2, 1, [255, 255, 255]); put(10, 12, 1, 1, [40, 60, 90]); put(13, 12, 2, 1, [255, 255, 255]); put(13, 12, 1, 1, [40, 60, 90]);
  put(11, 14, 2, 1, [150, 90, 70]);
  // поля шляпы — второй слой
  put(40, 8, 8, 1, HAT2); put(40, 9, 8, 1, HAT);
  // торс: рубашка и жилет
  put(20, 20, 8, 12, SH); put(20, 20, 3, 12, VE); put(25, 20, 3, 12, VE); put(20, 29, 8, 1, VE2); put(23, 21, 2, 1, [200, 200, 196]);
  // руки
  put(44, 20, 4, 12, VE); put(44, 28, 4, 4, SK); put(36, 52, 4, 12, VE); put(36, 60, 4, 4, SK);
  // ноги
  put(4, 20, 4, 12, TR); put(4, 29, 4, 3, BT); put(20, 52, 4, 12, TR); put(20, 61, 4, 3, BT);
  return d;
}

// часть фигуры: список [color, x, y, w]; base + overlay
function part(px, bx, by, ox, oy, w, h, transpose) {
  const out = [];
  const W = transpose ? h : w;
  const Hh = transpose ? w : h;
  for (let yy = 0; yy < Hh; yy++) {
    let run = null;
    for (let xx = 0; xx <= W; xx++) {
      let col = null;
      if (xx < W) {
        const sx = transpose ? yy : xx;
        const sy = transpose === 2 ? xx : transpose ? W - 1 - xx : yy;
        let o = ((oy + sy) * 64 + (ox + sx)) * 4;
        if (ox >= 0 && px[o + 3] > 40) col = '#' + hex2(px[o]) + hex2(px[o + 1]) + hex2(px[o + 2]);
        else {
          o = ((by + sy) * 64 + (bx + sx)) * 4;
          if (px[o + 3] > 40) col = '#' + hex2(px[o]) + hex2(px[o + 1]) + hex2(px[o + 2]);
        }
      }
      if (run && run[0] === col) { run[3]++; continue; }
      if (run && run[0]) out.push(run[0], run[1], run[2], run[3]);
      run = col ? [col, xx, yy, 1] : [null, xx, yy, 0];
    }
  }
  return out;
}

// пустой ли регион (у скина может не быть левых конечностей)
function emptyRegion(px, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (px[(yy * 64 + xx) * 4 + 3] > 40) return false;
  return true;
}

export function buildKokk(px) {
  if (!px) px = fallbackPixels();
  const lowEmpty = emptyRegion(px, 36, 52, 4, 12) && emptyRegion(px, 20, 52, 4, 12);
  const head = part(px, 8, 8, 40, 8, 8, 8);
  const body = part(px, 20, 20, 20, 36, 8, 12);
  const armR = part(px, 44, 20, 44, 36, 4, 12);
  const armL = lowEmpty ? armR : part(px, 36, 52, 52, 52, 4, 12);
  const legR = part(px, 4, 20, 4, 36, 4, 12);
  const legL = lowEmpty ? legR : part(px, 20, 52, 4, 52, 4, 12);
  const armUp = part(px, 44, 20, 44, 36, 4, 12, 1); // вытянутая влево рука (12×4)
  const armUpR = lowEmpty ? part(px, 44, 20, 44, 36, 4, 12, 2) : part(px, 36, 52, 52, 52, 4, 12, 2); // вправо
  // цвет шляпы для мелких деталей (вершина головы)
  let hat = '#6e4a2c';
  const o = (8 * 64 + 11) * 4;
  if (px[o + 3] > 40) hat = '#' + hex2(px[o]) + hex2(px[o + 1]) + hex2(px[o + 2]);
  return { head, body, armR, armL, legR, legL, armUp, armUpR, hat };
}

function drawPart(ctx, r, x, y) {
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = r[j];
    ctx.fillRect(x + r[j + 1], y + r[j + 2], r[j + 3], 1);
  }
}

// x — центр, y — линия ног. walk — фаза шага (0/1/-1), reach — протягивает руку (1 вправо, -1 влево), wave — машет
export function drawKokk(ctx, k, x, y, walk, reach, wave, clk) {
  if (!k) return;
  x = Math.round(x) - 8;
  y = Math.round(y) - 32;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 1, y + 31, 14, 2);
  const lw = walk ? 1 : 0;
  drawPart(ctx, k.legR, x + 4, y + 20 - (walk > 0 ? lw : 0));
  drawPart(ctx, k.legL, x + 8, y + 20 - (walk < 0 ? lw : 0));
  drawPart(ctx, k.body, x + 4, y + 8);
  // руки
  if (reach < 0) drawPart(ctx, k.armUp, x - 8, y + 8);
  else if (wave) {
    const up = Math.floor(clk * 5) & 1;
    // поднятая рука: рисуем руку выше плеча
    drawPart(ctx, k.armR, x, y - 2 - up);
  } else drawPart(ctx, k.armR, x, y + 8 + (walk > 0 ? 1 : 0));
  if (reach > 0) drawPart(ctx, k.armUpR, x + 12, y + 8);
  else drawPart(ctx, k.armL, x + 12, y + 8 + (walk < 0 ? 1 : 0));
  drawPart(ctx, k.head, x + 4, y);
}

// голова и плечи (над перилами балкона)
export function drawKokkBust(ctx, k, x, y, look) {
  if (!k) return;
  x = Math.round(x) - 8;
  y = Math.round(y);
  drawPart(ctx, k.body, x + 4, y + 8);
  drawPart(ctx, k.armR, x, y + 8);
  drawPart(ctx, k.armL, x + 12, y + 8);
  drawPart(ctx, k.head, x + 4 + (look || 0), y);
}
