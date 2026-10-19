// Мини-игра «Ярмарочный тир» (фон «Ярмарка»).
// Покой: ярмарочная площадь — лавки, гирлянды, жители гуляют, жонглёр, бард, ночью салют;
// иногда житель-герой подходит к тиру и пускает стрелу в щит.
// Вступление: герой подбегает к тиру, хозяин подаёт лук, камера «въезжает» в тир.
// Игра: мишени выскакивают и едут по трём полкам; золотые дороже, мелкие быстрые,
// по фанерным жителям стрелять нельзя. Стрел мало — попадания возвращают стрелы. Комбо-множитель.
// Финал/выход: камера отъезжает, хозяин вручает розетку (или машет), герой снова гуляет.

import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

const W = 320;
const H = 180;
const ROUND = 75; // секунд на раунд
const START_ARROWS = 20;
const MAX_ARROWS = 25;
const LIVES = 3;

let C = null;
let GA = 1; // общая прозрачность слоя тира (при наезде камеры)
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ---------- палитра площади (из сцены «Ярмарка») ----------
const NIGHT = [18, 16, 30];
const PAL = {
  wallA: [214, 190, 150], wallB: [190, 160, 120], wallC: [170, 150, 130], beam: [96, 64, 40],
  roofA: [150, 62, 46], roofB: [104, 70, 52], roofC: [72, 92, 112], roofDk: [70, 40, 34],
  win: [120, 156, 186], door: [96, 62, 38],
  cob: [150, 140, 126], cob2: [132, 122, 110], cobDk: [104, 96, 88], grass: [96, 150, 70],
  wood: [130, 88, 52], woodDk: [96, 62, 36], woodHi: [160, 116, 72],
  aw0: [200, 60, 56], aw1: [60, 110, 180], aw2: [70, 150, 80], aw3: [210, 160, 50], aw4: [150, 80, 160], white: [236, 230, 214],
  apple: [200, 50, 40], apple2: [120, 170, 60], bread: [196, 140, 72], pot: [70, 110, 170], pot2: [190, 110, 70], cloth: [150, 80, 160], cheese: [230, 196, 90], fish: [150, 170, 180],
  skin: [230, 188, 148], skin2: [196, 146, 108], skin3: [150, 102, 72], eye: [40, 30, 30], leg: [70, 52, 40],
  r0: [120, 80, 50], r1: [70, 90, 140], r2: [150, 60, 60], r3: [80, 120, 70], r4: [140, 120, 80], r5: [110, 70, 120], r6: [190, 170, 120],
  jA: [200, 50, 60], jB: [230, 190, 60], bardR: [60, 120, 110], lute: [150, 96, 50], luteDk: [96, 60, 30],
  barrel: [120, 80, 46], hoop: [80, 80, 86], pole: [90, 64, 44], string: [60, 50, 50],
  f0: [210, 60, 60], f1: [240, 200, 70], f2: [70, 130, 210], f3: [80, 170, 90], f4: [230, 120, 180],
  bulbOff: [210, 200, 170], basket: [170, 120, 60],
  // тир
  plank: [150, 104, 62], plank2: [136, 92, 54], plankDk: [92, 60, 34], plankHi: [178, 130, 80],
  felt: [70, 96, 70], felt2: [58, 82, 60], curtain: [150, 40, 46], curtain2: [118, 30, 38],
  bowW: [140, 90, 44], bowDk: [92, 56, 26], strg: [230, 224, 200]
};
const ROBES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
const GOODS = [['apple', 'apple2'], ['bread', 'cheese'], ['pot', 'pot2'], ['cloth', 'aw3'], ['fish', 'white']];
const FLAGS = ['f0', 'f1', 'f2', 'f3', 'f4'];
const BULB = ['#ffd860', '#ff8a5a', '#9cf08a', '#8ac8ff', '#ff9ad8'];
const BULB_GLOW = ['rgba(255,216,96,0.16)', 'rgba(255,138,90,0.16)', 'rgba(156,240,138,0.14)', 'rgba(138,200,255,0.14)', 'rgba(255,154,216,0.14)'];
const FIRE = ['#ffd860', '#ff7a5a', '#9cf0ff', '#b4ff8a', '#ff9ad8', '#ffffff'];
const SKY_DAY = [[104, 168, 232], [196, 226, 246]];
const SKY_EVE = [[84, 70, 140], [246, 150, 96]];
const SKY_NIGHT = [[14, 14, 40], [52, 38, 74]];
const VIG = [];
for (let i = 0; i < 24; i++) VIG.push('rgba(10,7,5,' + (0.1 * (24 - i) / 24).toFixed(3) + ')');
const COS = [], SIN = [];
for (let i = 0; i < 14; i++) { COS.push(Math.cos(i / 14 * Math.PI * 2)); SIN.push(Math.sin(i / 14 * Math.PI * 2)); }
const RIBBON = ['#4a7ad8', '#d84a4a', '#f2c230'];
const RIBBON2 = ['#2a4a98', '#982a2a', '#b08a14'];

// ---------- спрайты мишеней ----------
function sprite(pal, rows) {
  const r = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch !== '.' && pal[ch]) {
        let e = x;
        while (e < row.length && row[e] === ch) e++;
        r.push(pal[ch], x, y, e - x);
        x = e;
      } else x++;
    }
  }
  return { w: rows[0].length, h: rows.length, r };
}
// круглая мишень: цвета колец от центра наружу
function ringTarget(rad, cols) {
  const pal = {}, rows = [], n = cols.length, d0 = rad + 0.5;
  for (let i = 0; i < n; i++) pal[String.fromCharCode(97 + i)] = cols[i];
  for (let y = -rad; y <= rad; y++) {
    let row = '';
    for (let x = -rad; x <= rad; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > d0) { row += '.'; continue; }
      row += String.fromCharCode(97 + Math.min(n - 1, F(d / d0 * n)));
    }
    rows.push(row);
  }
  return sprite(pal, rows);
}
// спрайт, обрезанный снизу (мишень прячется за полкой)
function drawSpr(sp, x, y, clipY, sc = 1) {
  const r = sp.r;
  for (let j = 0; j < r.length; j += 4) {
    const yy = y + r[j + 2] * sc;
    if (yy >= clipY) continue;
    C.fillStyle = r[j];
    C.fillRect(x + r[j + 1] * sc, yy, r[j + 3] * sc, Math.min(sc, clipY - yy));
  }
}

// виды мишеней: спрайт, очки, стрелы за попадание
const KINDS = [
  { sp: ringTarget(8, ['#f2d14a', '#d83a3a', '#f4ecdc', '#d83a3a', '#f4ecdc', '#d83a3a', '#f4ecdc', '#6a4424']), pts: 10, refill: 1, rad: 9 },  // 0 обычная
  { sp: ringTarget(4, ['#d83a3a', '#f4ecdc', '#d83a3a', '#2a4a8a']), pts: 25, refill: 2, rad: 5 },                                   // 1 мелкая быстрая
  { sp: ringTarget(6, ['#fff6b0', '#f2c230', '#c08a10', '#f2c230', '#ffe070', '#8a5e14']), pts: 50, refill: 3, rad: 7 },              // 2 золотая
  { sp: sprite({ a: '#6a4424', s: '#e0b08a', n: '#c08060', e: '#2a2020', r: '#7a5a9a', k: '#5a3e78', h: '#4a3020' }, [
    '..hhhhh..',
    '.ahhhhha.',
    '.asssssa.',
    '.asesesa.',
    '.assnssa.',
    '.assnssa.',
    '..asssa..',
    '.arrrrra.',
    'arrrrrrra',
    'arrkkkrra',
    'arrrrrrra',
    'arrrrrrra',
    'arrkkkrra',
    '.arrrrra.',
    '.arr.rra.',
    '.aa...aa.'
  ]), pts: 0, refill: 0, rad: 0, sc: 2 },                                                                                         // 3 «не стреляй» житель
  null // 4 выскочка (как обычная, стоит на месте) — заполняется ниже
];
KINDS[4] = { sp: KINDS[0].sp, pts: 15, refill: 1, rad: 9 };
const ARROW_ICON = sprite({ a: '#e8e2d4', b: '#8a5a32', c: '#d84a4a' }, ['c.....a.', '.cbbbbba', 'c.....a.']);

// полки тира в режиме игры
const ROWS = [54, 90, 126];
const COUNTER_Y = 150;

function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch (e) { /* нет офскрина — рисуем напрямую */ }
  return null;
}
function cached(ctx, s, key, ver, w, h, x, y, paint) {
  let L = s.layers[key];
  if (L === undefined) {
    const cv = makeCanvas(w, h);
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    L = s.layers[key] = g ? { cv, g, ver: null } : null;
  }
  if (!L) { ctx.save(); ctx.translate(x, y); paint(s); ctx.restore(); return; }
  if (L.ver !== ver) { L.ver = ver; L.g.clearRect(0, 0, w, h); const prev = C; C = L.g; paint(s); C = prev; }
  ctx.drawImage(L.cv, x, y);
}

function blob(x, y, r) {
  x = F(x); y = F(y);
  const e1 = Math.round(r * 0.45), e2 = Math.round(r * 0.75), w0 = Math.round(r * 0.5), w1 = Math.round(r * 0.82);
  R(x - w0, y - r, w0 * 2 + 1, r - e2);
  R(x - w1, y - e2, w1 * 2 + 1, e2 - e1);
  R(x - r, y - e1, r * 2 + 1, e1 * 2 + 1);
  R(x - w1, y + e1 + 1, w1 * 2 + 1, e2 - e1);
  R(x - w0, y + e2 + 1, w0 * 2 + 1, r - e2);
}
function pool(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '', g: 0, k: 0 });
  return a;
}
function spawnP(a, x, y, vx, vy, max, c, g, k) {
  for (let i = 0; i < a.length; i++) {
    const q = a[i];
    if (q.on) continue;
    q.on = 1; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = 0; q.max = max; q.c = c; q.g = g; q.k = k || 0;
    return q;
  }
  return null;
}

function villager(p, x, fy, dir, step, robe, skin, hat, carry) {
  const y = fy - 12;
  C.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 3, fy, 7, 1);
  C.fillStyle = p.leg;
  R(x - 1 + (step ? 1 : 0), y + 10, 1, 2);
  R(x + 1 - (step ? 1 : 0), y + 10, 1, 2);
  C.fillStyle = p[robe]; R(x - 2, y + 4, 5, 7);
  C.fillStyle = p.roofDk; R(x - 2, y + 7, 5, 1);
  C.fillStyle = p[skin];
  R(x + (dir > 0 ? 2 : -2), y + 6 + (step ? 1 : 0), 1, 2);
  R(x - 1, y, 4, 4);
  C.fillStyle = p.eye; R(dir > 0 ? x + 2 : x - 1, y + 1, 1, 1);
  if (hat) { C.fillStyle = p[hat]; R(x - 2, y - 1, 6, 1); R(x - 1, y - 2, 4, 1); }
  if (carry) { C.fillStyle = p.basket; R(x + (dir > 0 ? 3 : -4), y + 6, 2, 2); }
}

function buildPal(s, dark) {
  const q = Math.round(dark * 16);
  if (s.pq === q) return s.p;
  s.pq = q;
  const t = q / 16, p = s.p;
  for (const k in PAL) { const c = PAL[k]; p[k] = css(mix(c, NIGHT, t * 0.64)); }
  // тир освещён фонарями — темнеет слабее
  for (const k of ['plank', 'plank2', 'plankDk', 'plankHi', 'felt', 'felt2', 'curtain', 'curtain2']) p['g_' + k] = css(mix(PAL[k], NIGHT, t * 0.4));
  let top, bot;
  if (t < 0.5) { top = mix(SKY_DAY[0], SKY_EVE[0], t * 2); bot = mix(SKY_DAY[1], SKY_EVE[1], t * 2); }
  else { top = mix(SKY_EVE[0], SKY_NIGHT[0], (t - 0.5) * 2); bot = mix(SKY_EVE[1], SKY_NIGHT[1], (t - 0.5) * 2); }
  for (let i = 0; i < 10; i++) s.sky[i] = css(mix(top, bot, i / 9));
  p.lit = t > 0.35;
  s.cloudC = `rgba(${css(mix([255, 255, 255], [90, 70, 110], t)).slice(4, -1)},0.8)`;
  return p;
}

// ---------- статичные слои ----------
function paintBg(s) {
  const p = s.p, gy = s.backY;
  for (let i = 0; i < 10; i++) { C.fillStyle = s.sky[i]; R(0, i * 12, W, 12); }
  for (let i = 0; i < s.houses.length; i++) {
    const h = s.houses[i], y = gy - h.h;
    C.fillStyle = p[h.wall]; R(h.x, y, h.w, h.h);
    C.fillStyle = p.beam;
    R(h.x, y, h.w, 1); R(h.x, y + F(h.h / 2), h.w, 1); R(h.x, y, 1, h.h); R(h.x + h.w - 1, y, 1, h.h);
    for (let x = h.x + 7; x < h.x + h.w - 4; x += 8) R(x, y, 1, h.h);
    const rh = F(h.w / 2.6);
    for (let k = 0; k < rh; k++) {
      const ins = F(k * (h.w / 2 + 2) / rh);
      C.fillStyle = k % 3 === 0 ? p.roofDk : p[h.roof];
      R(h.x - 2 + ins, y - k, h.w + 4 - ins * 2, 1);
    }
    for (let k = 0; k < h.wins; k++) {
      const wx = h.x + 3 + k * 8;
      if (wx + 4 > h.x + h.w - 2) break;
      C.fillStyle = p.lit && h.lit[k] ? '#ffc65a' : p.win;
      R(wx, y + 3, 4, 4);
      if (h.h > 26) R(wx, y + F(h.h / 2) + 3, 4, 4);
    }
  }
  C.fillStyle = p.cob2; R(0, gy, W, H - gy);
  C.fillStyle = p.cob;
  for (let row = 0, y = gy + 1; y < H; row++, y += 4) {
    for (let x = row % 2 ? -3 : 0; x < W; x += 7) R(x, y, 6, 3);
  }
  C.fillStyle = p.cobDk; R(0, gy, W, 1);
  C.fillStyle = p.pole;
  for (let i = 0; i < s.poles.length; i++) { const x = s.poles[i]; R(x, s.lineY - 2, 2, gy - s.lineY + 2); R(x - 1, s.lineY - 3, 4, 1); }
  C.fillStyle = p.string;
  for (let i = 0; i < s.line.length; i++) R(i * 2, s.line[i], 2, 1);
}

// задник тира (режим игры): навес, дощатая стена, кулисы
function paintGallery(s) {
  const p = s.p;
  for (let x = 0; x < W; x += 8) {
    C.fillStyle = (x >> 3) % 2 ? p.g_plank : p.g_plank2; R(x, 14, 8, COUNTER_Y - 14);
    C.fillStyle = p.g_plankDk; R(x, 14, 1, COUNTER_Y - 14);
  }
  C.fillStyle = p.g_plankDk;
  for (let i = 0; i < 60; i++) R((i * 53) % W, 20 + (i * 37) % 120, 1, 1);
  // нарисованные на стене звёзды и подковы
  for (let i = 0; i < 9; i++) {
    const x = 34 + i * 32, y = i % 2 ? 30 : 106;
    C.fillStyle = 'rgba(255,230,160,0.13)';
    R(x - 1, y - 3, 3, 7); R(x - 3, y - 1, 7, 3); R(x - 2, y - 2, 5, 5);
  }
  for (let i = 0; i < 4; i++) {
    const x = 50 + i * 70, y = 72;
    C.fillStyle = 'rgba(60,40,30,0.25)';
    R(x - 3, y, 1, 4); R(x + 3, y, 1, 4); R(x - 2, y + 4, 5, 1);
  }
  // тени под полками
  for (let i = 0; i < ROWS.length; i++) {
    C.fillStyle = 'rgba(30,18,10,0.35)'; R(0, ROWS[i] + 17, W, 3);
  }
  // навес
  for (let x = 0; x < W; x += 10) {
    C.fillStyle = (x / 10) % 2 ? p.white : p.aw0;
    R(x, 0, 10, 12); R(x + 2, 12, 6, 2); R(x + 3, 14, 4, 1);
  }
  C.fillStyle = 'rgba(0,0,0,0.2)'; R(0, 11, W, 1);
  C.fillStyle = p.string; R(14, 18, W - 28, 1);
  for (let x = 18, k = 0; x < W - 20; x += 12, k++) {
    C.fillStyle = p[FLAGS[k % 5]];
    R(x, 19, 5, 1); R(x + 1, 20, 3, 1); R(x + 2, 21, 1, 1);
  }
  // кулисы
  for (let k = 0; k < 2; k++) {
    const x0 = k ? W - 14 : 0;
    for (let x = 0; x < 14; x += 3) {
      C.fillStyle = (x / 3) % 2 ? p.g_curtain2 : p.g_curtain;
      R(x0 + x, 12, 3, COUNTER_Y - 12);
    }
    C.fillStyle = p.aw3; R(x0 + (k ? 0 : 10), 70, 4, 2);
  }
}
// передний план тира: полки и прилавок (прозрачный слой)
function paintGalleryFront(s) {
  const p = s.p;
  for (let i = 0; i < ROWS.length; i++) {
    const y = ROWS[i] + 10;
    C.fillStyle = p.g_plankDk; R(14, y, W - 28, 7);
    C.fillStyle = p.g_plankHi; R(14, y, W - 28, 1);
    C.fillStyle = p.g_felt; R(14, y + 2, W - 28, 4);
    C.fillStyle = p.g_felt2; R(14, y + 5, W - 28, 1);
    C.fillStyle = p.g_plankDk;
    for (let x = 30; x < W - 20; x += 36) R(x, y + 2, 1, 4);
  }
  // прилавок
  C.fillStyle = p.g_plank; R(0, COUNTER_Y, W, H - COUNTER_Y);
  C.fillStyle = p.g_plankHi; R(0, COUNTER_Y, W, 2);
  C.fillStyle = p.g_plankDk;
  for (let y = COUNTER_Y + 6; y < H; y += 6) R(0, y, W, 1);
  for (let x = 40; x < W; x += 60) R(x, COUNTER_Y + 2, 1, H - COUNTER_Y);
  // колчан слева
  C.fillStyle = p.g_plankDk; R(16, COUNTER_Y - 12, 9, 16);
  C.fillStyle = p.r0; R(17, COUNTER_Y - 11, 7, 14);
  C.fillStyle = p.g_plankDk; R(17, COUNTER_Y - 7, 7, 1);
  // розетки-призы справа
  for (let k = 0; k < 3; k++) {
    const x = 262 + k * 8, y = 20 + (k % 2) * 3;
    C.fillStyle = RIBBON2[k]; R(x, y + 4, 1, 6); R(x + 3, y + 4, 1, 6);
    C.fillStyle = RIBBON[k]; R(x, y, 5, 5); R(x - 1, y + 1, 7, 3);
    C.fillStyle = '#fff6b0'; R(x + 2, y + 2, 1, 1);
  }
}

// ---------- сцена площади ----------
function createWorld() {
  const rand = Math.random;
  const s = {
    backY: 124, base: 146, lineY: 38, p: {}, pq: -1, sky: new Array(10).fill('#000'), layers: {},
    houses: [], stalls: [], poles: [], line: [], actors: [], stars: [], birds: [], clouds: [],
    parts: pool(70), fw: 3 + rand() * 3, noteT: 0
  };
  for (let x = -6 + rand() * 6; x < W + 4;) {
    const w = 20 + F(rand() * 16), h = 20 + F(rand() * 18);
    const wins = F((w - 4) / 8);
    const lit = []; for (let k = 0; k < 4; k++) lit.push(rand() > 0.3);
    s.houses.push({ x: F(x), w, h, wall: ['wallA', 'wallB', 'wallC'][F(rand() * 3)], roof: ['roofA', 'roofB', 'roofC'][F(rand() * 3)], wins, lit });
    x += w + 2 + rand() * 6;
  }
  s.poles.push(4, 160, 314);
  for (let x = 0; x < W; x += 2) {
    let k = 0; while (k < s.poles.length - 2 && x > s.poles[k + 1]) k++;
    const a = s.poles[k], b = s.poles[k + 1], u = clamp((x - a) / (b - a), 0, 1);
    s.line.push(F(s.lineY + 14 * 4 * u * (1 - u)));
  }
  const xs = [34, 104];
  for (let i = 0; i < xs.length; i++) {
    const w = 36 + F(rand() * 6);
    s.stalls.push({ x: xs[i], w, awn: ['aw1', 'aw2', 'aw3'][(i + F(rand() * 3)) % 3], goods: GOODS[F(rand() * GOODS.length)], robe: ROBES[F(rand() * ROBES.length)], skin: ['skin', 'skin2', 'skin3'][F(rand() * 3)], ph: rand() * 10, hat: rand() > 0.5 });
  }
  for (let i = 0; i < 100; i++) s.stars.push({ x: rand() * W, y: rand() * 70, ph: rand() * 10, big: rand() > 0.9 });
  for (let i = 0; i < 4; i++) s.clouds.push({ x: rand() * W, y: 10 + rand() * 22, w: 22 + rand() * 30, v: 1 + rand() * 1.5 });
  for (let i = 0; i < 3; i++) s.birds.push({ x: rand() * W, y: 14 + rand() * 30, v: 10 + rand() * 8, ph: rand() * 10 });
  for (let i = 0; i < 7; i++) {
    s.actors.push({ kind: 0, x: rand() * W, fy: 150 + F(rand() * 12), dir: rand() > 0.5 ? 1 : -1, v: 6 + rand() * 6, pause: rand() * 2, ph: rand() * 10,
      robe: ROBES[F(rand() * ROBES.length)], skin: ['skin', 'skin2', 'skin3'][F(rand() * 3)], hat: rand() > 0.55 ? ROBES[F(rand() * ROBES.length)] : null, carry: rand() > 0.6 });
  }
  s.juggler = { kind: 1, x: 180, fy: 160 };
  s.bard = { kind: 2, x: 96, fy: 156 };
  // герой — тот самый житель, который пойдёт в тир
  s.hero = { kind: 3, x: 250, fy: 152, dir: -1, v: 9, pause: 1, ph: 0, st: 0, t: 0, bow: 0, ribbon: -1, ribbonT: 0, next: 12 + rand() * 14, shot: 0 };
  s.actors.push(s.juggler, s.bard, s.hero);
  s.actors.sort((a, b) => a.fy - b.fy);
  // тир
  s.gx = 206; s.gw = 94;
  s.keeper = { wave: 0, hand: 0 };
  s.boardArrow = { on: 0, t: 0, x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0 };
  return s;
}

// герой: состояния
const H_STROLL = 0, H_GO = 1, H_AIM = 2, H_RUN = 3, H_TAKE = 4, H_READY = 5, H_PRIZE = 6;

export default {
  id: 'fair',
  title: 'Ярмарочный тир',
  sceneTitle: 'Ярмарка',
  desc: 'Стреляй по мишеням в ярмарочном тире: мелкие быстрые, золотые дороже, а по фанерным жителям — ни-ни!',
  controls: 'Мышь: целься и кликай · Стрелки — прицел, Пробел — выстрел',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    C = ctx;
    const prevTouch = canvas.style.touchAction;
    const prevCursor = canvas.style.cursor;
    canvas.style.touchAction = 'none';
    const rand = Math.random;
    const s = createWorld();
    const hero = s.hero, keeper = s.keeper;
    const HX = s.gx + 14; // где герой стоит у прилавка

    // ---------- состояние игры ----------
    const targets = [];
    for (let i = 0; i < 10; i++) targets.push({ on: 0, kind: 0, row: 0, x: 0, vx: 0, pop: 0, st: 0, t: 0, life: 0, ax: 0, ay: 0, hasArrow: 0, shake: 0 });
    const flights = [];
    for (let i = 0; i < 4; i++) flights.push({ on: 0, t: 0, x0: 0, y0: 0, x1: 0, y1: 0, ux: 0, uy: 0 });
    const stuck = [];
    for (let i = 0; i < 8; i++) stuck.push({ on: 0, x: 0, y: 0, t: 0 });
    const pops = [];
    for (let i = 0; i < 6; i++) pops.push({ on: 0, x: 0, y: 0, t: 0, v: 0, neg: 0 });
    const gparts = pool(48);
    const g = {
      score: 0, lives: LIVES, arrows: START_ARROWS, time: ROUND, combo: 0, mult: 1, spawnT: 0.6, elapsed: 0,
      cx: 160, cy: 92, bowKick: 0, best: 0, endWin: false
    };

    // фазы: idle → intro → play → end → wait(over) → outro → idle
    let phase = 'idle', pt = 0, idleT = 0, overSent = false, sawOver = false;
    let z = 0; // 0 — площадь, 1 — тир во весь экран
    let lastPrize = -1;

    const resetRun = () => {
      g.score = 0; g.lives = LIVES; g.arrows = START_ARROWS; g.time = ROUND; g.combo = 0; g.mult = 1;
      g.spawnT = 0.5; g.elapsed = 0; g.cx = 160; g.cy = 92; g.bowKick = 0;
      g.best = Math.max(0, Math.floor(api.best || 0));
      for (const t of targets) t.on = 0;
      for (const f of flights) f.on = 0;
      for (const a of stuck) a.on = 0;
      for (const q of pops) q.on = 0;
      for (const q of gparts) q.on = 0;
      overSent = false; sawOver = false;
    };
    const setCursor = () => { canvas.style.cursor = phase === 'play' ? 'none' : prevCursor; };
    const startIntro = () => {
      resetRun();
      phase = 'intro'; pt = 0;
      if (z < 0.01) { hero.st = H_RUN; hero.bow = 0; hero.shot = 0; hero.pause = 0; s.boardArrow.on = 0; }
      setCursor();
    };
    const startOutro = () => {
      if (z <= 0 && hero.st !== H_READY) {
        // ещё не дошли до тира — просто гуляем дальше
        hero.st = H_STROLL; hero.bow = 0; hero.pause = 0.3;
        phase = 'idle'; pt = 0; idleT = 2; setCursor();
        return;
      }
      phase = 'outro'; pt = 0;
      lastPrize = g.score >= 4000 ? 2 : g.score >= 1500 ? 1 : g.score > 0 ? 0 : -1;
      if (hero.st !== H_READY) { hero.st = H_READY; hero.x = HX; hero.dir = 1; }
      setCursor();
    };
    const startEnd = (win) => {
      phase = 'end'; pt = 0; g.endWin = win;
      for (const t of targets) if (t.on && t.st < 2) { t.st = 2; }
      api.sfx(win ? 'win' : 'lose');
      setCursor();
    };

    // ---------- ввод ----------
    const keys = { l: 0, r: 0, u: 0, d: 0 };
    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      g.cx = clamp((e.clientX - r.left) / Math.max(1, r.width) * W, 2, W - 3);
      g.cy = clamp((e.clientY - r.top) / Math.max(1, r.height) * H, 14, H - 3);
    };
    const onMove = (e) => { if (phase === 'play') toCanvas(e); };
    const onDown = (e) => {
      if (phase !== 'play') return;
      if (e.preventDefault) e.preventDefault();
      toCanvas(e);
      shoot();
    };
    const onKeyDown = (e) => {
      if (phase !== 'play') return;
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') keys.l = 1;
      else if (c === 'ArrowRight' || c === 'KeyD') keys.r = 1;
      else if (c === 'ArrowUp' || c === 'KeyW') keys.u = 1;
      else if (c === 'ArrowDown' || c === 'KeyS') keys.d = 1;
      else if (c === 'Space' || c === 'Enter') { if (!e.repeat) shoot(); }
      else return;
      if (e.preventDefault) e.preventDefault();
    };
    const onKeyUp = (e) => {
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') keys.l = 0;
      else if (c === 'ArrowRight' || c === 'KeyD') keys.r = 0;
      else if (c === 'ArrowUp' || c === 'KeyW') keys.u = 0;
      else if (c === 'ArrowDown' || c === 'KeyS') keys.d = 0;
    };
    const onBlur = () => { keys.l = keys.r = keys.u = keys.d = 0; };
    const onCtx = (e) => { if (e.preventDefault) e.preventDefault(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('contextmenu', onCtx);

    // ---------- стрельба ----------
    const targetY = (t) => ROWS[t.row] - (t.kind === 3 ? 8 : 0) + (1 - t.pop) * (t.kind === 3 ? 36 : 26);
    const hitTest = (t, x, y) => {
      if (!t.on || t.st >= 2 || t.pop < 0.6) return false;
      const sp = KINDS[t.kind].sp, cy = targetY(t);
      if (t.kind === 3) return x >= t.x - 9 && x <= t.x + 9 && y >= cy - 16 && y <= cy + 15;
      const rr = KINDS[t.kind].rad, dx = x - t.x, dy = y - cy;
      return dx * dx + dy * dy <= rr * rr && sp;
    };
    const popup = (x, y, v, neg) => {
      for (const q of pops) if (!q.on) { q.on = 1; q.x = x; q.y = y; q.t = 0; q.v = v; q.neg = neg; return; }
    };
    const shoot = () => {
      if (g.arrows <= 0) return;
      g.arrows--;
      g.bowKick = 0.15;
      const bx = 160 + (g.cx - 160) * 0.2, by = 158;
      for (const f of flights) if (!f.on) {
        f.on = 1; f.t = 0; f.x0 = bx; f.y0 = by; f.x1 = g.cx; f.y1 = g.cy;
        const dx = g.cx - bx, dy = g.cy - by, l = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        f.ux = dx / l; f.uy = dy / l;
        break;
      }
      // ищем мишень (ближайшую к центру)
      let best = null, bd = 1e9;
      for (const t of targets) {
        if (!hitTest(t, g.cx, g.cy)) continue;
        const dx = g.cx - t.x, dy = g.cy - targetY(t), d = dx * dx + dy * dy - (t.kind === 3 ? 0 : 20);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) {
        const k = KINDS[best.kind];
        best.st = 2; best.shake = 0.3; best.hasArrow = 1;
        best.ax = Math.round(g.cx - best.x); best.ay = Math.round(g.cy - targetY(best));
        const ty = targetY(best);
        if (best.kind === 3) {
          g.lives--; g.combo = 0; g.mult = 1;
          popup(best.x, ty - 12, 0, 1);
          api.sfx('hit');
          for (let i = 0; i < 6; i++) spawnP(gparts, g.cx, g.cy, (rand() - 0.5) * 60, -20 - rand() * 30, 0.6, '#8a5a32', 140, 0);
          if (g.lives <= 0) startEnd(false);
        } else {
          g.combo++;
          g.mult = Math.min(5, 1 + F(g.combo / 3));
          // точность: в центр — бонус
          const dx = g.cx - best.x, dy = g.cy - ty;
          const bull = dx * dx + dy * dy <= 2 ? 2 : 1;
          const v = k.pts * g.mult * bull;
          g.score += v;
          g.arrows = Math.min(MAX_ARROWS, g.arrows + k.refill + (bull > 1 ? 1 : 0));
          popup(best.x, ty - 10, v, 0);
          api.sfx(best.kind === 2 || bull > 1 ? 'win' : 'coin');
          if (best.kind === 2) keeper.wave = 1.2;
          const n = best.kind === 2 ? 10 : 5;
          for (let i = 0; i < n; i++) spawnP(gparts, best.x, ty, (rand() - 0.5) * 70, -20 - rand() * 40, 0.5 + rand() * 0.4, best.kind === 2 ? (i % 2 ? '#fff6b0' : '#f2c230') : (i % 2 ? '#f4ecdc' : '#d83a3a'), 160, 0);
        }
      } else {
        g.combo = 0; g.mult = 1;
        api.sfx('click');
        for (const a of stuck) if (!a.on) { a.on = 1; a.x = Math.round(g.cx); a.y = Math.round(g.cy); a.t = 0; break; }
        for (let i = 0; i < 3; i++) spawnP(gparts, g.cx, g.cy, (rand() - 0.5) * 40, -10 - rand() * 20, 0.4, '#5a3a20', 160, 0);
      }
    };

    const spawnTarget = () => {
      let t = null;
      let active = 0;
      for (const q of targets) { if (q.on) active++; else if (!t) t = q; }
      const d = clamp(g.elapsed / ROUND, 0, 1);
      if (!t || active >= 3 + F(d * 4)) return;
      const r = rand();
      let kind;
      if (r < 0.15 + 0.07 * d) kind = 3;
      else if (r < 0.24 + 0.07 * d) kind = 2;
      else if (r < 0.42 + 0.12 * d) kind = 1;
      else if (r < 0.6 + 0.08 * d) kind = 4;
      else kind = 0;
      t.on = 1; t.kind = kind; t.row = F(rand() * 3); t.pop = 0; t.st = 0; t.t = 0; t.hasArrow = 0; t.shake = 0;
      const dir = rand() < 0.5 ? -1 : 1;
      const sp = (kind === 1 ? 70 + rand() * 35 : kind === 2 ? 48 + rand() * 18 : kind === 3 ? 22 + rand() * 20 : 26 + rand() * 20) * (1 + d * 0.6);
      if (kind === 4) { t.vx = 0; t.x = 34 + rand() * (W - 68); t.life = 1.6 - d * 0.6; }
      else { t.vx = sp * dir; t.x = dir > 0 ? 24 + rand() * 60 : W - 24 - rand() * 60; t.life = 99; }
      // не ставим поверх соседа в том же ряду
      for (const q of targets) {
        if (q !== t && q.on && q.row === t.row && Math.abs(q.x - t.x) < 18) { t.row = (t.row + 1) % 3; break; }
      }
    };

    // ---------- обновление игры ----------
    const updateGame = (dt) => {
      const playing = phase === 'play';
      if (playing) {
        g.elapsed += dt;
        g.time -= dt;
        const kx = keys.r - keys.l, ky = keys.d - keys.u;
        if (kx || ky) { g.cx = clamp(g.cx + kx * 150 * dt, 2, W - 3); g.cy = clamp(g.cy + ky * 150 * dt, 14, H - 3); }
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          spawnTarget();
          const d = clamp(g.elapsed / ROUND, 0, 1);
          g.spawnT = (1.05 - 0.55 * d) * (0.7 + rand() * 0.6);
        }
      }
      if (g.bowKick > 0) g.bowKick -= dt;
      if (keeper.wave > 0) keeper.wave -= dt;
      for (const t of targets) {
        if (!t.on) continue;
        t.t += dt;
        if (t.shake > 0) t.shake -= dt;
        if (t.st === 0) { t.pop = Math.min(1, t.pop + dt * 5); if (t.pop >= 1) t.st = 1; }
        if (t.st <= 1) {
          t.x += t.vx * dt;
          t.life -= dt;
          if (t.x < 18 || t.x > W - 18 || t.life <= 0) t.st = 3;
        }
        if (t.st >= 2) {
          // 2 — сбита (падает назад с дрожью), 3 — уходит сама
          if (t.st === 3 || t.shake <= 0) t.pop -= dt * (t.st === 2 ? 4 : 5);
          if (t.pop <= 0) t.on = 0;
        }
      }
      for (const f of flights) if (f.on) { f.t += dt / 0.09; if (f.t >= 1) f.on = 0; }
      for (const a of stuck) if (a.on) { a.t += dt; if (a.t > 4) a.on = 0; }
      for (const q of pops) if (q.on) { q.t += dt; q.y -= dt * 14; if (q.t > 0.9) q.on = 0; }
      for (const q of gparts) {
        if (!q.on) continue;
        q.life += dt;
        if (q.life >= q.max) { q.on = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
      }
      if (playing) {
        let flying = 0;
        for (const f of flights) flying += f.on;
        if (g.time <= 0) { g.time = 0; startEnd(true); }
        else if (g.arrows <= 0 && !flying) startEnd(g.score > 0);
      }
    };

    // ---------- герой и хозяин на площади ----------
    const updateHero = (dt) => {
      const h = hero;
      h.t += dt;
      if (h.ribbonT > 0) { h.ribbonT -= dt; if (h.ribbonT <= 0) h.ribbon = -1; }
      if (h.st === H_STROLL) {
        if (h.pause > 0) h.pause -= dt;
        else {
          h.x += h.dir * h.v * dt;
          if (rand() < dt * 0.15) h.pause = 1 + rand() * 3;
          if (rand() < dt * 0.06) h.dir *= -1;
        }
        if (h.x < 168) h.dir = 1;
        if (h.x > 304) h.dir = -1;
        h.next -= dt;
        if (h.next <= 0 && phase === 'idle') { h.st = H_GO; h.next = 22 + rand() * 20; }
      } else if (h.st === H_GO || h.st === H_RUN) {
        const sp = h.st === H_RUN ? 75 : 14;
        h.dir = HX > h.x ? 1 : -1;
        h.x += h.dir * sp * dt;
        if ((h.dir > 0 && h.x >= HX) || (h.dir < 0 && h.x <= HX)) {
          h.x = HX; h.dir = 1; h.t = 0;
          h.st = h.st === H_RUN ? H_TAKE : H_AIM;
          keeper.hand = 0.5;
        }
      } else if (h.st === H_AIM) {
        // тихая сценка: житель сам пускает стрелу в щит
        if (h.t > 0.4) h.bow = 1;
        if (h.t > 1.0 && !h.shot) {
          h.shot = 1;
          const b = s.boardArrow, tk = F(rand() * 3);
          b.on = 1; b.t = 0; b.fx = h.x + 4; b.fy = h.fy - 8;
          b.tx = s.gx + 22 + tk * 26 + F(rand() * 5 - 2); b.ty = (tk === 1 ? 114 : 118) + F(rand() * 5 - 2);
          api.sfx('click');
        }
        if (h.t > 1.5 && h.shot === 1) { h.shot = 2; keeper.wave = 1; }
        if (h.t > 2.6) { h.st = H_STROLL; h.bow = 0; h.shot = 0; h.dir = -1; h.pause = 0.5; }
      } else if (h.st === H_TAKE) {
        if (h.t > 0.35) h.bow = 1;
        if (h.t > 0.5) h.st = H_READY;
      } else if (h.st === H_PRIZE) {
        if (h.t > 1.3) { h.st = H_STROLL; h.dir = -1; h.pause = 0.3; h.next = 25 + rand() * 20; }
      }
      if (keeper.hand > 0) keeper.hand -= dt;
      const b = s.boardArrow;
      if (b.on) { b.t += dt; if (b.t > 7) b.on = 0; }
    };

    // ---------- рисование площади ----------
    const drawSquare = (t, dt, an) => {
      const p = s.p, base = s.base;
      cached(ctx, s, 'bg', s.pq, W, H, 0, 0, paintBg);
      const dark = envDark;
      if (dark < 0.7) {
        C.fillStyle = s.cloudC;
        for (let i = 0; i < s.clouds.length; i++) {
          const c = s.clouds[i];
          c.x += c.v * dt;
          if (c.x > W + 20) c.x = -c.w - 20;
          R(c.x, c.y, c.w, 4); R(c.x + 4, c.y - 3, c.w * 0.5, 3); R(c.x + c.w * 0.35, c.y - 5, c.w * 0.3, 2);
        }
      }
      if (dark > 0.55) {
        for (let i = 0; i < s.stars.length; i++) {
          const st = s.stars[i];
          const b = Math.sin(t * 1.3 + st.ph);
          if (b < -0.5) continue;
          C.fillStyle = b > 0.5 ? '#fffbe6' : 'rgba(255,250,230,0.5)';
          R(st.x, st.y, st.big ? 2 : 1, 1);
        }
      } else {
        C.fillStyle = '#2a2a34';
        for (let i = 0; i < s.birds.length; i++) {
          const b = s.birds[i];
          b.x += b.v * dt;
          if (b.x > W + 20) { b.x = -20 - rand() * 80; b.y = 14 + rand() * 30; }
          const fl = Math.sin(t * 9 + b.ph) > 0 ? 1 : 0;
          const x = F(b.x), y = F(b.y + Math.sin(t + b.ph) * 2);
          R(x - 2, y - fl, 2, 1); R(x + 1, y - fl, 2, 1); R(x, y, 1, 1);
        }
      }
      // флажки и лампочки
      const line = s.line;
      for (let i = 0; i < line.length; i += 4) {
        const lx = i * 2, ly = line[i];
        const k = (i >> 2) % 5;
        if ((i >> 2) % 2 === 0) {
          const sw = Math.sin(t * 2 + i * 0.3) > 0.6 ? 1 : 0;
          C.fillStyle = p[FLAGS[k]];
          R(lx, ly + 1, 5, 1); R(lx + 1, ly + 2, 3, 1); R(lx + 2 + sw, ly + 3, 1, 1);
        } else {
          const on = p.lit && Math.sin(t * 1.7 + i) > -0.6;
          if (on) { C.fillStyle = BULB_GLOW[k]; blob(lx + 1, ly + 2, 4); C.fillStyle = BULB[k]; } else C.fillStyle = p.bulbOff;
          R(lx + 1, ly + 1, 2, 3);
        }
      }
      // обычные лавки
      for (let i = 0; i < s.stalls.length; i++) {
        const st = s.stalls[i], x = st.x, w = st.w;
        C.fillStyle = p.woodDk; R(x + 1, 108, 2, base - 108); R(x + w - 3, 108, 2, base - 108);
        const wave = Math.sin(t * 0.7 + st.ph) > 0.85;
        const vx = x + F(w / 2);
        C.fillStyle = p[st.robe]; R(vx - 3, 125, 7, 8);
        C.fillStyle = p[st.skin]; R(vx - 2, 119, 5, 5);
        if (wave) R(vx + 4, 119 + (Math.sin(t * 10) > 0 ? 0 : 1), 1, 5);
        C.fillStyle = p.eye; R(vx - 1, 121, 1, 1); R(vx + 1, 121, 1, 1);
        if (st.hat) { C.fillStyle = p.white; R(vx - 3, 118, 7, 1); R(vx - 2, 116, 5, 2); }
        C.fillStyle = p.wood; R(x, 132, w, base - 132);
        C.fillStyle = p.woodDk;
        for (let yy = 135; yy < base; yy += 4) R(x, yy, w, 1);
        C.fillStyle = p.woodHi; R(x - 1, 131, w + 2, 2);
        for (let gx = x + 2, k = 0; gx < x + w - 3; gx += 4, k++) {
          C.fillStyle = p[st.goods[k % 2]];
          R(gx, 128 + (k % 3 === 1 ? 1 : 0), 3, 3 - (k % 3 === 1 ? 1 : 0));
        }
        C.fillStyle = p[st.awn];
        for (let k = 0; k < 4; k++) R(x - 3 + k * 2, 102 - k, w + 6 - k * 4, 1);
        for (let sx = 0; sx < w + 6; sx += 4) {
          C.fillStyle = (sx >> 2) % 2 ? p.white : p[st.awn];
          R(x - 3 + sx, 103, Math.min(4, w + 6 - sx), 7);
          R(x - 3 + sx + 1, 110, 2, 1);
        }
        lantern(p, x + w - 2, t, st.ph);
      }
      drawGalleryStall(p, t);
      // актёры по глубине
      for (let i = 0; i < s.actors.length; i++) {
        const a = s.actors[i];
        if (a.kind === 0) {
          if (dt > 0) {
            if (a.pause > 0) a.pause -= dt;
            else {
              a.x += a.dir * a.v * dt;
              if (rand() < dt * 0.12) a.pause = 1 + rand() * 3;
              if (rand() < dt * 0.05) a.dir *= -1;
            }
            if (a.x < -10) a.dir = 1;
            if (a.x > W + 10) a.dir = -1;
          }
          const step = an && a.pause <= 0 ? F((t * 6 + a.ph) % 2) : 0;
          villager(p, F(a.x), a.fy, a.dir, step, a.robe, a.skin, a.hat, a.carry);
        } else if (a.kind === 1) drawJuggler(p, a, t);
        else if (a.kind === 2) drawBard(p, a, t, dt);
        else drawHero(p, t, an);
      }
      // стрела жителя в щит
      const b = s.boardArrow;
      if (b.on) {
        const u = Math.min(1, b.t / 0.15);
        const x = b.fx + (b.tx - b.fx) * u, y = b.fy + (b.ty - b.fy) * u;
        C.fillStyle = '#e8e2d4'; R(x - 3, y, 3, 1);
        C.fillStyle = '#d84a4a'; R(x - 4, y - 1, 1, 1); R(x - 4, y + 1, 1, 1);
      }
      // салют ночью и ноты барда
      if (dt > 0 && dark > 0.55) {
        s.fw -= dt;
        if (s.fw <= 0) {
          s.fw = 3.5 + rand() * 5;
          spawnP(s.parts, W * (0.35 + rand() * 0.55), 100, (rand() - 0.5) * 8, -70 - rand() * 15, 0.8 + rand() * 0.3, '#ffe6a0', 30, 2);
        }
      }
      for (let i = 0; i < s.parts.length; i++) {
        const q = s.parts[i];
        if (!q.on) continue;
        if (dt > 0) {
          q.life += dt;
          if (q.life >= q.max) {
            q.on = 0;
            if (q.k === 2) {
              const c = FIRE[F(rand() * FIRE.length)], sp = 22 + rand() * 10;
              for (let k = 0; k < 14; k++) spawnP(s.parts, q.x, q.y, COS[k] * sp, SIN[k] * sp, 1 + rand() * 0.4, c, 26, 3);
              api.sfx('splash');
            }
            continue;
          }
          q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
          if (q.k === 1) q.x += Math.sin(q.life * 4) * dt * 6;
          if (q.k === 3) { q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5; }
          if (q.k === 2 && rand() < 0.5) spawnP(s.parts, q.x, q.y + 2, 0, 4, 0.35, '#ffb060', 0, 4);
        }
        const al = 1 - q.life / q.max;
        C.globalAlpha = Math.min(1, al * (q.k === 3 ? 1.6 : 1.5));
        C.fillStyle = q.c;
        const x = F(q.x), y = F(q.y);
        if (q.k === 1) { R(x, y + 2, 2, 2); R(x + 1, y - 1, 1, 3); R(x + 2, y - 1, 1, 1); }
        else if (q.k === 3) { R(x, y, 1, 1); if (al > 0.6) { C.globalAlpha = 0.35; R(x - 1, y, 3, 1); } }
        else R(x, y, 1, q.k === 2 ? 2 : 1);
      }
      C.globalAlpha = 1;
      for (let i = 0; i < 24; i++) { C.fillStyle = VIG[i]; R(i * 3, 0, 3, H); }
    };

    const lantern = (p, lx, t, ph) => {
      const fl = 0.85 + 0.15 * Math.sin(t * 7 + ph);
      C.fillStyle = p.hoop; R(lx, 111, 1, 2);
      if (p.lit) {
        C.globalAlpha = fl * Math.min(1, (envDark - 0.3) * 2);
        C.fillStyle = 'rgba(255,180,90,0.07)'; blob(lx, 118, 18);
        C.fillStyle = 'rgba(255,190,100,0.12)'; blob(lx, 116, 8);
        C.globalAlpha = 1;
        C.fillStyle = '#ffd070';
      } else C.fillStyle = p.bulbOff;
      R(lx - 1, 113, 3, 3);
    };

    // лавка-тир на площади
    const drawGalleryStall = (p, t) => {
      const x = s.gx, w = s.gw, base = s.base;
      C.fillStyle = p.woodDk; R(x + 1, 106, 2, base - 106); R(x + w - 3, 106, 2, base - 106);
      // задник со щитами-мишенями
      C.fillStyle = p.plank2; R(x + 3, 108, w - 6, 24);
      C.fillStyle = p.plankDk;
      for (let k = x + 9; k < x + w - 4; k += 8) R(k, 108, 1, 24);
      for (let k = 0; k < 3; k++) {
        const cx = x + 22 + k * 26, cy = k === 1 ? 114 : 118;
        C.fillStyle = '#f4ecdc'; R(cx - 3, cy - 2, 7, 5); R(cx - 2, cy - 3, 5, 7);
        C.fillStyle = '#d83a3a'; R(cx - 2, cy - 1, 5, 3); R(cx - 1, cy - 2, 3, 5);
        C.fillStyle = '#f4ecdc'; R(cx - 1, cy - 1, 3, 3);
        C.fillStyle = '#d83a3a'; R(cx, cy, 1, 1);
      }
      // хозяин тира
      const kx = x + w - 16;
      const wave = keeper.wave > 0, hand = keeper.hand > 0;
      C.fillStyle = p.r2; R(kx - 3, 125, 7, 8);
      C.fillStyle = p.skin2; R(kx - 2, 119, 5, 5);
      C.fillStyle = p.eye; R(kx - 1, 121, 1, 1); R(kx + 1, 121, 1, 1);
      C.fillStyle = p.beam; R(kx - 2, 123, 5, 1); // усы
      C.fillStyle = p.aw3; R(kx - 3, 118, 7, 1); R(kx - 2, 115, 5, 3);
      C.fillStyle = p.skin2;
      if (wave) R(kx + 4, 117 + (Math.sin(t * 12) > 0 ? 0 : 1), 1, 5);
      else if (hand) R(kx - 6, 127, 3, 1);
      // прилавок
      C.fillStyle = p.wood; R(x, 132, w, base - 132);
      C.fillStyle = p.woodDk;
      for (let yy = 135; yy < base; yy += 4) R(x, yy, w, 1);
      C.fillStyle = p.woodHi; R(x - 1, 131, w + 2, 2);
      // лук на прилавке
      if (!hero.bow) {
        C.fillStyle = p.bowW; R(x + 8, 129, 10, 1); R(x + 7, 130, 1, 1); R(x + 18, 130, 1, 1);
        C.fillStyle = p.strg; R(x + 8, 130, 10, 1);
      }
      // стрелы в стакане
      C.fillStyle = p.woodDk; R(x + 26, 127, 4, 5);
      C.fillStyle = '#e8e2d4'; R(x + 26, 124, 1, 3); R(x + 28, 123, 1, 4);
      C.fillStyle = '#d84a4a'; R(x + 26, 123, 1, 1); R(x + 28, 122, 1, 1);
      // навес: красно-белый, с вывеской-мишенью
      for (let k = 0; k < 5; k++) { C.fillStyle = p.aw0; R(x - 3 + k * 2, 100 - k, w + 6 - k * 4, 1); }
      for (let sx = 0; sx < w + 6; sx += 5) {
        C.fillStyle = (sx / 5) % 2 ? p.white : p.aw0;
        R(x - 3 + sx, 101, Math.min(5, w + 6 - sx), 7);
        R(x - 3 + sx + 1, 108, 3, 1);
      }
      const sx = x + F(w / 2);
      C.fillStyle = p.woodDk; R(sx - 6, 86, 13, 11);
      C.fillStyle = '#f4ecdc'; R(sx - 4, 88, 9, 7);
      C.fillStyle = '#d83a3a'; R(sx - 3, 89, 7, 5);
      C.fillStyle = '#f4ecdc'; R(sx - 1, 90, 3, 3);
      C.fillStyle = '#d83a3a'; R(sx, 91, 1, 1);
      lantern(p, x + 2, t, 1.3);
      lantern(p, x + w - 2, t, 4.1);
    };

    const drawHero = (p, t, an) => {
      const h = hero;
      const moving = an && (h.st === H_GO || h.st === H_RUN || (h.st === H_STROLL && h.pause <= 0));
      const step = moving ? F((t * (h.st === H_RUN ? 12 : 6)) % 2) : 0;
      const x = F(h.x), fy = h.fy, y = fy - 12;
      villager(p, x, fy, h.dir, step, 'r1', 'skin', 'r3', 0);
      if (h.ribbon >= 0) {
        C.fillStyle = RIBBON[h.ribbon]; R(x + (h.dir > 0 ? 0 : -1), y + 5, 2, 2);
        C.fillStyle = RIBBON2[h.ribbon]; R(x + (h.dir > 0 ? 0 : -1), y + 7, 1, 2);
      }
      if (h.bow) {
        // лук в вытянутой руке
        const aim = h.st === H_AIM && h.t > 0.6 && h.t < 1.05;
        const bx = x + (h.dir > 0 ? 4 : -5);
        C.fillStyle = p.bowW; R(bx, y + 1, 1, 1); R(bx + h.dir, y + 2, 1, 6); R(bx, y + 8, 1, 1);
        C.fillStyle = p.strg; R(bx - (aim ? h.dir : 0), y + 2, 1, 6);
        C.fillStyle = p.skin; R(x + (h.dir > 0 ? 2 : -3), y + 5, 2, 1);
      }
    };

    const drawJuggler = (p, a, t) => {
      const x = a.x, fy = a.fy, y = fy - 12;
      C.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 3, fy, 7, 1);
      const bounce = Math.sin(t * 6) > 0 ? 1 : 0;
      C.fillStyle = p.leg; R(x - 1, y + 10, 1, 2); R(x + 1, y + 10, 1, 2);
      C.fillStyle = p.jA; R(x - 2, y + 4, 3, 7);
      C.fillStyle = p.jB; R(x + 1, y + 4, 2, 7);
      C.fillStyle = p.skin; R(x - 1, y, 4, 4);
      C.fillStyle = p.eye; R(x, y + 1, 1, 1); R(x + 2, y + 1, 1, 1);
      C.fillStyle = p.jA; R(x - 2, y - 1, 3, 1); R(x - 3, y - 2 - bounce, 1, 1);
      C.fillStyle = p.jB; R(x + 1, y - 1, 3, 1); R(x + 4, y - 2 - (1 - bounce), 1, 1);
      const hy = y + 5, xl = x - 4, xr = x + 5, ph = t * 1.5;
      const lu = (ph % 1) < 0.5 ? 1 : 0;
      C.fillStyle = p.skin; R(xl, hy + lu, 1, 2); R(xr, hy + (1 - lu), 1, 2);
      for (let k = 0; k < 3; k++) {
        const u = (ph + k * 2 / 3) % 2;
        const v = u % 1, toR = u < 1;
        const bx = toR ? xl + (xr - xl) * v : xr + (xl - xr) * v;
        const by = hy - 18 * 4 * v * (1 - v);
        C.fillStyle = p[FLAGS[k]];
        R(bx, by - 1, 2, 2);
      }
    };

    const drawBard = (p, a, t, dt) => {
      const x = a.x, fy = a.fy;
      C.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 4, fy, 9, 1);
      C.fillStyle = p.barrel; R(x - 3, fy - 8, 7, 8);
      C.fillStyle = p.hoop; R(x - 3, fy - 7, 7, 1); R(x - 3, fy - 2, 7, 1);
      const y = fy - 19;
      C.fillStyle = p.leg; R(x + 1, y + 10, 3, 1); R(x + 3, y + 11, 1, 2);
      C.fillStyle = p.bardR; R(x - 2, y + 4, 5, 7);
      C.fillStyle = p.skin; R(x - 1, y, 4, 4);
      C.fillStyle = p.eye; R(x + 2, y + 1, 1, 1);
      C.fillStyle = p.f0; R(x - 2, y - 1, 6, 1); R(x - 1, y - 2, 4, 1); R(x - 2, y - 3, 1, 2);
      C.fillStyle = p.lute; R(x + 1, y + 6, 4, 3); R(x + 2, y + 5, 2, 1);
      C.fillStyle = p.luteDk; R(x + 2, y + 7, 1, 1);
      R(x + 5, y + 5, 1, 1); R(x + 6, y + 4, 1, 1); R(x + 7, y + 3, 1, 1); R(x + 8, y + 2, 2, 1);
      const strum = dt > 0 && Math.sin(t * 9) > 0 ? 1 : 0;
      C.fillStyle = p.skin; R(x + 1 + strum, y + 6 + strum, 1, 1); R(x + 6, y + 4, 1, 1);
      if (dt > 0) {
        s.noteT -= dt;
        if (s.noteT <= 0) {
          s.noteT = 0.5 + rand() * 0.5;
          spawnP(s.parts, a.x + 3, y + 2, 3 + rand() * 4, -12 - rand() * 6, 2.2, FIRE[F(rand() * 5)], 0, 1);
        }
      }
    };

    // ---------- рисование тира (режим игры) ----------
    const drawGallery = (t) => {
      const p = s.p;
      cached(ctx, s, 'gal', s.pq, W, H, 0, 0, paintGallery);
      // фонари тира
      const lit = envDark > 0.25;
      for (let k = 0; k < 2; k++) {
        const lx = k ? 250 : 70;
        C.fillStyle = p.hoop; R(lx, 14, 1, 6);
        if (lit) {
          C.globalAlpha = GA * (0.85 + 0.15 * Math.sin(t * 6 + k * 2));
          C.fillStyle = 'rgba(255,190,100,0.08)'; blob(lx, 30, 34);
          C.fillStyle = 'rgba(255,200,110,0.12)'; blob(lx, 24, 10);
          C.globalAlpha = GA;
        }
        C.fillStyle = lit ? '#ffd070' : p.bulbOff; R(lx - 1, 20, 3, 4);
        C.fillStyle = p.hoop; R(lx - 2, 19, 5, 1); R(lx - 2, 24, 5, 1);
      }
      // промахи — стрелы в стене
      for (const a of stuck) {
        if (!a.on) continue;
        C.globalAlpha = GA * (a.t > 3.5 ? (4 - a.t) * 2 : 1);
        C.fillStyle = '#3a2414'; R(a.x, a.y, 1, 1);
        C.fillStyle = '#e8e2d4'; R(a.x - 1, a.y - 1, 1, 1); R(a.x + 1, a.y - 1, 1, 1);
        C.fillStyle = '#d84a4a'; R(a.x - 1, a.y + 1, 1, 1); R(a.x + 1, a.y + 1, 1, 1);
      }
      C.globalAlpha = GA;
      // мишени
      for (const tg of targets) {
        if (!tg.on) continue;
        const k = KINDS[tg.kind], sp = k.sp;
        const clipY = ROWS[tg.row] + 10;
        const cy = targetY(tg);
        const sh = tg.shake > 0 ? (Math.sin(tg.t * 60) > 0 ? 1 : -1) : 0;
        const sc = k.sc || 1;
        const x0 = Math.round(tg.x - (sp.w * sc >> 1)) + sh, y0 = Math.round(cy - (sp.h * sc >> 1));
        // палка
        C.fillStyle = s.p.g_plankDk;
        const sy = y0 + sp.h * sc;
        if (sy < clipY) R(Math.round(tg.x) + sh - 1, sy, 2, clipY - sy);
        drawSpr(sp, x0, y0, clipY, sc);
        if (tg.kind === 2 && Math.sin(tg.t * 9) > 0.7 && y0 < clipY - 4) { C.fillStyle = '#ffffff'; R(x0 + 2, y0 + 2, 1, 1); R(x0 + 1, y0 + 2, 3, 0 + 1); }
        if (tg.hasArrow) {
          const ax = Math.round(tg.x) + tg.ax + sh, ay = Math.round(cy) + tg.ay;
          if (ay < clipY) {
            C.fillStyle = '#3a2414'; R(ax, ay, 1, 1);
            C.fillStyle = '#e8e2d4'; R(ax - 1, ay - 1, 1, 1); R(ax + 1, ay - 1, 1, 1);
            C.fillStyle = '#d84a4a'; R(ax - 1, ay + 1, 1, 1); R(ax + 1, ay + 1, 1, 1);
          }
        }
      }
      cached(ctx, s, 'galf', s.pq, W, H, 0, 0, paintGalleryFront);
      // стрелы в колчане (сколько осталось, до 8 видно)
      const nShow = Math.min(8, g.arrows);
      for (let i = 0; i < nShow; i++) {
        C.fillStyle = '#e8e2d4'; R(17 + i, COUNTER_Y - 15 - (i % 2), 1, 4);
        C.fillStyle = '#d84a4a'; R(17 + i, COUNTER_Y - 16 - (i % 2), 1, 1);
      }
      // хозяин тира справа за прилавком
      const kx = 290;
      const happy = keeper.wave > 0;
      C.fillStyle = p.r2; R(kx - 5, COUNTER_Y - 14, 11, 14);
      C.fillStyle = p.skin2; R(kx - 4, COUNTER_Y - 23, 8, 8);
      C.fillStyle = p.eye; R(kx - 2, COUNTER_Y - 20, 1, 1); R(kx + 1, COUNTER_Y - 20, 1, 1);
      C.fillStyle = p.beam; R(kx - 3, COUNTER_Y - 17, 7, 1);
      C.fillStyle = p.aw3; R(kx - 5, COUNTER_Y - 24, 11, 2); R(kx - 3, COUNTER_Y - 28, 7, 4);
      C.fillStyle = p.skin2;
      if (happy || phase === 'end' || phase === 'wait') {
        const up = Math.sin(t * 10) > 0 ? 0 : 2;
        R(kx - 8, COUNTER_Y - 22 + up, 2, 7); R(kx + 7, COUNTER_Y - 22 + (2 - up), 2, 7);
      } else { R(kx - 7, COUNTER_Y - 4, 3, 2); R(kx + 5, COUNTER_Y - 4, 3, 2); }
      // летящие стрелы
      for (const f of flights) {
        if (!f.on) continue;
        const e = f.t, x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e;
        const L = 6 * (1 - e * 0.6);
        C.fillStyle = '#e8e2d4';
        for (let k = 0; k < 4; k++) R(x - f.ux * L * k / 4, y - f.uy * L * k / 4, 1, 1);
        C.fillStyle = '#d84a4a'; R(x - f.ux * L, y - f.uy * L, 2, 1);
      }
      // частицы
      for (const q of gparts) {
        if (!q.on) continue;
        C.globalAlpha = GA * (Math.min(1, (1 - q.life / q.max) * 1.5));
        C.fillStyle = q.c; R(q.x, q.y, 1, 1);
      }
      C.globalAlpha = GA;
      // лук героя внизу
      const bx = Math.round(160 + (g.cx - 160) * 0.2), by = H + 2 + (g.bowKick > 0 ? 2 : 0);
      C.fillStyle = p.r1; R(bx - 14, by - 10, 9, 12); R(bx + 6, by - 12, 8, 14);
      C.fillStyle = p.skin; R(bx - 4, by - 18, 4, 4); R(bx + 4, by - 15, 3, 3);
      C.fillStyle = p.bowDk;
      for (let k = 0; k < BOW.length; k++) R(bx + BOW[k], by - 34 + k, 1, 1);
      C.fillStyle = p.bowW;
      for (let k = 2; k < BOW.length - 2; k++) R(bx + BOW[k] + 1, by - 34 + k, 1, 1);
      C.fillStyle = p.strg;
      const pull = phase === 'play' && g.bowKick <= 0 && g.arrows > 0 ? 3 : 0;
      R(bx + 4 + pull, by - 33, 1, 15); R(bx + 4 + pull, by - 18, 1, 14);
      if (pull) { C.fillStyle = '#e8e2d4'; R(bx - 1, by - 18, 7, 1); C.fillStyle = '#c8ccd4'; R(bx - 2, by - 18, 1, 1); }
      // прицел
      if (phase === 'play') {
        const cx = Math.round(g.cx), cy = Math.round(g.cy);
        let bad = false;
        for (const tg of targets) if (tg.kind === 3 && hitTest(tg, cx, cy)) { bad = true; break; }
        C.fillStyle = 'rgba(20,12,8,0.7)';
        R(cx - 5, cy - 1, 3, 3); R(cx + 3, cy - 1, 3, 3); R(cx - 1, cy - 5, 3, 3); R(cx - 1, cy + 3, 3, 3);
        C.fillStyle = bad ? '#ff5050' : '#ffffff';
        R(cx - 5, cy, 3, 1); R(cx + 3, cy, 3, 1); R(cx, cy - 5, 1, 3); R(cx, cy + 3, 1, 3);
        R(cx, cy, 1, 1);
      }
      // всплывающие очки
      for (const q of pops) {
        if (!q.on) continue;
        C.globalAlpha = GA * (q.t > 0.6 ? (0.9 - q.t) / 0.3 : 1);
        if (q.neg) drawIcon(ctx, 'skull', q.x - 3, q.y);
        else {
          const w = textWidth('+' + q.v);
          drawText(ctx, '+' + q.v, q.x - w / 2 + 1, q.y + 1, '#2a1a10');
          drawText(ctx, '+' + q.v, q.x - w / 2, q.y, '#fff2a0');
        }
      }
      C.globalAlpha = GA;
      drawHud(t);
    };

    const drawHud = (t) => {
      C.fillStyle = 'rgba(24,14,10,0.5)'; R(0, 0, W, 11);
      for (let i = 0; i < LIVES; i++) drawIcon(ctx, i < g.lives ? 'heart' : 'heartEmpty', 4 + i * 9, 3);
      const ax = 34;
      drawSpr(ARROW_ICON, ax, 4, 99);
      drawNumber(ctx, g.arrows, ax + 11, 3, g.arrows <= 3 && Math.sin(t * 10) > 0 ? '#ff7a6a' : '#ffffff');
      const secs = Math.ceil(Math.max(0, g.time));
      drawIcon(ctx, 'clock', 140, 2);
      drawNumber(ctx, secs, 150, 3, secs <= 10 ? '#ff9a6a' : '#ffffff');
      const sc = String(Math.round(g.score));
      const sw = textWidth(sc, 2);
      drawText(ctx, sc, W - 5 - sw + 1, 3, 'rgba(20,14,10,0.7)', 2);
      drawText(ctx, sc, W - 5 - sw, 2, '#ffffff', 2);
      if (g.mult > 1) {
        const ms = 'x' + g.mult;
        drawText(ctx, ms, W - 10 - sw - textWidth(ms), 3, '#ffe070');
      }
      const best = String(g.best);
      const bw = textWidth(best);
      drawNumber(ctx, g.best, W - 5 - bw, 14, '#ffe070');
      drawIcon(ctx, 'trophy', W - 5 - bw - 9, 13);
    };

    // ---------- цикл ----------
    let envDark = 0;
    let raf = 0, last = performance.now(), alive = true, tAcc = 0;
    const FOCUS_X = s.gx + s.gw / 2, FOCUS_Y = 118, ZOOM = 2.6;
    const step = (dt) => {
      const m = api.mode ? api.mode() : 'play';
      pt += dt;
      if (phase === 'idle') {
        idleT += dt;
        if (m === 'play' && idleT > 1.2) startIntro();
      } else if (phase === 'intro') {
        if (m === 'idle') startOutro();
        else if (hero.st === H_READY) {
          z = Math.min(1, z + dt / 0.9);
          if (z >= 1) { phase = 'play'; pt = 0; setCursor(); }
        }
      } else if (phase === 'play') {
        if (m === 'idle') startOutro();
      } else if (phase === 'end') {
        if (m === 'idle') startOutro();
        else if (pt > 1.1) {
          phase = 'wait'; pt = 0;
          if (!overSent) { overSent = true; api.over(Math.round(g.score)); }
        }
      } else if (phase === 'wait') {
        const m2 = api.mode ? api.mode() : 'over';
        if (m2 === 'over') sawOver = true;
        if (m2 === 'idle') startOutro();
        else if (m2 === 'play' && (sawOver || pt > 3)) startIntro();
      } else if (phase === 'outro') {
        const sp = m === 'play' ? 3 : 1;
        if (z > 0) z = Math.max(0, z - dt * sp / 1.0);
        else if (hero.st === H_READY) {
          hero.st = H_PRIZE; hero.t = 0; hero.bow = 0;
          if (lastPrize >= 0) { keeper.hand = 0.8; } else keeper.wave = 1.2;
        } else if (hero.st === H_PRIZE) {
          if (lastPrize >= 0 && hero.t > 0.5 && hero.ribbon !== lastPrize) { hero.ribbon = lastPrize; hero.ribbonT = 40; api.sfx('coin'); }
          if (hero.t > 0.9 / sp || sp > 1) { phase = 'idle'; pt = 0; idleT = 2; setCursor(); }
        } else { phase = 'idle'; pt = 0; idleT = 2; setCursor(); }
      }
      if (z > 0) updateGame(dt);
    };

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      C = ctx;
      const env = api.env ? api.env() : null;
      envDark = env && env.dark > 0 ? Math.min(1, env.dark) : 0;
      const anim = !env || env.animations !== false;
      const paused = api.paused && api.paused();
      if (paused) dt = 0;
      if (dt > 0) step(dt);
      if (api._dbg) api._dbg.phase = phase;
      // покой без анимаций — стоп-кадр
      const sdt = phase === 'idle' && !anim ? 0 : dt;
      if (sdt > 0) { tAcc += sdt; if (z < 1) updateHero(sdt); }
      buildPal(s, envDark);
      drawFrame(tAcc, z < 1 ? sdt : 0, sdt > 0 || phase !== 'idle');
    };

    const drawFrame = (t, sdt, an) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (z < 1) {
        if (z > 0) {
          const e = smooth(z), sc = 1 + (ZOOM - 1) * e;
          const cx = FOCUS_X + (160 - FOCUS_X) * e, cy = FOCUS_Y + (96 - FOCUS_Y) * e;
          ctx.setTransform(sc, 0, 0, sc, cx - FOCUS_X * sc, cy - FOCUS_Y * sc);
        }
        drawSquare(t, sdt, an);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (z > 0) {
        const a = smooth((z - 0.4) / 0.6);
        if (a > 0) {
          GA = a;
          ctx.globalAlpha = a;
          drawGallery(t);
          ctx.globalAlpha = 1;
          GA = 1;
        }
      }
    };

    if (api._dbg) {
      // тестовый крючок для автотестов: координаты подходящей мишени
      api._dbg.aim = () => {
        for (const t of targets) if (t.on && t.st === 1 && t.kind !== 3) return [t.x + t.vx * 0.02, targetY(t)];
        return null;
      };
    }
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.style.touchAction = prevTouch;
      canvas.style.cursor = prevCursor;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    };
  }
};

// дуга лука (смещения по x сверху вниз)
const BOW = [];
for (let k = 0; k < 30; k++) { const u = (k - 14.5) / 14.5; BOW.push(Math.round(4 - 7 * (1 - u * u))); }
