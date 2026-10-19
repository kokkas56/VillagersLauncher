// Мини-игра «Вагонетка» (фон «Шахта»).
// Покой: штрек — шахтёры бьют кирками руду (искры), носильщик таскает мешки, вагонетка катается,
// капли, пыль в свете фонарей, мерцание руды, иногда пролетает летучая мышь.
// Вступление: носильщик запрыгивает в вагонетку, она разгоняется — и камера едет за ней.
// Игра: бесконечный спуск по рельсам вверх-вниз: прыгай через провалы и разбитые рельсы,
// пригибайся под низкими балками и летучими мышами, собирай руду. Скорость растёт.
// Финал/выход: вагонетка с искрами тормозит у станции, шахтёр вылезает и берёт кирку.

import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

const W = 320;
const H = 180;
const RAIL = 145;     // уровень рельсов на станции
const FLOOR = 152;
const STATION = 120;  // где вагонетка останавливается (в координатах сцены)
const CAM_LEAD = 70;  // где вагонетка на экране во время поездки
const STEP = 8;       // шаг трассы
const N = 96;         // кольцевой буфер трассы
const GRAV = 480;
const JUMP_V = 168;

let C = null;
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const STRATA = ['#4a4038', '#3f3832', '#52463a', '#3a3534', '#473d33', '#3d3630'];
const P = {
  speckHi: '#5e5246', speckDk: '#2c2724', back: '#2b2624', backDk: '#211d1c', backHi: '#352f2b', edge: '#5a4c3e', edgeDk: '#1a1716',
  floor: '#4a3e32', floorHi: '#5a4b3c', floorDk: '#382f27', face: '#5d5044', faceDk: '#463c33', pit: '#120f0e', pit2: '#1c1816',
  wood: '#7a5634', woodDk: '#553a22', woodHi: '#946a42', rail: '#8a8c94', railDk: '#55575e',
  cart: '#6b6e76', cartDk: '#4a4c53', cartHi: '#8d9098', wheel: '#2a2a2e', wheelHi: '#5a5a62',
  skin: '#c9966e', eye: '#1c1618', leg: '#3a2c24', cap: '#6e4a2c', cap2: '#5a3c22', beard: '#7a6a5a',
  robeA: '#6a625a', robeA2: '#55504a', robeB: '#5a6a7a', robeB2: '#4a5866', robeC: '#7a5a40', robeC2: '#634832',
  handle: '#8a6238', pick: '#a4a8b0', pickDk: '#70747c', sack: '#a08a62', sack2: '#86724e',
  lantern: '#3a3238', flame: '#ffcf5a', flame3: '#fff0b0',
  glowA: 'rgba(255,165,70,0.08)', glowB: 'rgba(255,175,85,0.10)', glowC: 'rgba(255,195,110,0.14)',
  spark: '#ffe27a', spark2: '#ff9a3a', chip: '#6a5a4a', drop: '#8fb4d8', dropHi: '#c7dcf0', puddle: 'rgba(120,160,200,0.22)',
  dust: 'rgba(255,220,170,0.28)', glint: '#ffffff', glint2: 'rgba(255,255,255,0.45)',
  bat: '#2a2030', bat2: '#4a3a52', batEye: '#ff6a5a', chain: '#5a5a62', warn: '#c84a3a'
};
const ORE = [
  { c: '#d8b8a0', d: '#9a7a66', pts: 10 }, // железо
  { c: '#f2cc4a', d: '#b08a24', pts: 25 }, // золото
  { c: '#3fd07a', d: '#1f8a4a', pts: 60 }  // изумруд
];
const VIG = [];
for (let i = 0; i < 24; i++) VIG.push('rgba(6,4,4,' + (0.1 * (24 - i) / 24).toFixed(3) + ')');
const TAU = Math.PI * 2;

function lcg(seed) {
  let v = seed >>> 0;
  return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}
function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch (e) { /* нет офскрина — рисуем напрямую */ }
  return null;
}
function cached(ctx, s, key, w, h, x, y, paint) {
  let L = s.layers[key];
  if (L === undefined) {
    const cv = makeCanvas(w, h);
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    L = s.layers[key] = g ? { cv, g, done: false } : null;
  }
  if (!L) { ctx.save(); ctx.translate(x, y); paint(s); ctx.restore(); return; }
  if (!L.done) { L.done = true; const prev = C; C = L.g; paint(s); C = prev; }
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
  for (let i = 0; i < n; i++) a.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '', g: 0 });
  return a;
}
function spawnP(a, x, y, vx, vy, max, c, g) {
  for (let i = 0; i < a.length; i++) {
    const q = a[i];
    if (q.on) continue;
    q.on = 1; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = 0; q.max = max; q.c = c; q.g = g;
    return q;
  }
  return null;
}
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
function drawSpr(sp, x, y) {
  const r = sp.r;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < r.length; j += 4) { C.fillStyle = r[j]; C.fillRect(x + r[j + 1], y + r[j + 2], r[j + 3], 1); }
}
// самородки для HUD и трассы
const NUG = ORE.map((o) => sprite({ a: o.c, b: o.d, w: '#ffffff' }, ['.aa..', 'awab.', 'aaabb', '.abb.']));

// ---------- пласты породы (бесшовные по 320 px) ----------
function bandsOf(rand) {
  const b = [];
  let y = 12;
  for (let k = 0; k < 6; k++) { b.push({ y, a: 2 + rand() * 4, k: 1 + F(rand() * 3), ph: rand() * 6 }); y += 22 + rand() * 12; }
  return b;
}
function paintStrata(bands, rand) {
  for (let x = 0; x < W; x += 2) {
    let y0 = 0;
    for (let k = 0; k < bands.length; k++) {
      const b = bands[k];
      const y1 = k === bands.length - 1 ? H : F(b.y + b.a * Math.sin(x / W * TAU * b.k + b.ph) + 2 * Math.sin(x / W * TAU * 7 + k));
      C.fillStyle = STRATA[k % STRATA.length];
      R(x, y0, 2, y1 - y0);
      y0 = y1;
    }
  }
  for (let i = 0; i < W * 1.4; i++) {
    C.fillStyle = rand() > 0.5 ? P.speckHi : P.speckDk;
    R(rand() * W, rand() * H, rand() > 0.8 ? 2 : 1, 1);
  }
}
function paintRock(s) { paintStrata(s.bands, lcg(s.seed + 7)); }

function timberPost(x, top, bot) {
  C.fillStyle = P.woodDk; R(x - 1, top, 4, bot - top);
  C.fillStyle = P.wood; R(x, top, 2, bot - top);
  C.fillStyle = P.woodHi; R(x, top, 1, bot - top);
}

// статичный слой станции (координаты сцены 0..W)
function paintScene(s) {
  const rand = lcg(s.seed), fl = FLOOR;
  paintStrata(s.bands, rand);
  for (let x = 0; x < W; x += 2) {
    const cy = s.ceil[x >> 1];
    C.fillStyle = P.edgeDk; R(x, cy - 2, 2, 2);
    C.fillStyle = P.edge; R(x, cy - 1, 2, 1);
    C.fillStyle = P.back; R(x, cy, 2, fl - cy);
    C.fillStyle = P.backDk; R(x, cy, 2, 3);
  }
  for (let i = 0; i < W / 3; i++) {
    const x = F(rand() * W), y = s.ceil[x >> 1] + 4 + rand() * (fl - s.ceil[x >> 1] - 8);
    C.fillStyle = rand() > 0.4 ? P.backHi : P.backDk;
    R(x, y, rand() > 0.6 ? 2 : 1, rand() > 0.7 ? 2 : 1);
  }
  // пол
  C.fillStyle = P.floor; R(0, fl - 8, W, 10);
  C.fillStyle = P.floorHi; R(0, fl - 8, W, 1);
  C.fillStyle = P.floorDk;
  for (let i = 0; i < W / 4; i++) R(rand() * W, fl - 6 + rand() * 7, rand() > 0.5 ? 2 : 1, 1);
  // рудные гнёзда
  for (let i = 0; i < s.ores.length; i++) {
    const o = s.ores[i], c = ORE[o.k];
    C.fillStyle = c.d; R(o.x - 1, o.y - 1, 4, 4);
    C.fillStyle = c.c; R(o.x, o.y, 2, 2);
    C.fillStyle = c.d; R(o.x + 3, o.y + 2, 2, 2); R(o.x - 3, o.y + 1, 2, 1);
    C.fillStyle = c.c; R(o.x + 3, o.y + 2, 1, 1);
  }
  // колодец с лестницей
  const sx = s.shaftX, cy = s.ceil[sx >> 1];
  C.fillStyle = P.backDk; R(sx, 0, 14, cy + 2);
  C.fillStyle = P.edgeDk; R(sx - 1, 0, 1, cy); R(sx + 14, 0, 1, cy);
  C.fillStyle = P.woodDk; R(sx + 3, 0, 1, fl - 6); R(sx + 10, 0, 1, fl - 6);
  C.fillStyle = P.wood; for (let y = 4; y < fl - 6; y += 5) R(sx + 3, y, 8, 1);
  // крепь
  for (let i = 0; i < s.props.length; i++) {
    const x = s.props[i], cy2 = s.ceil[x >> 1];
    timberPost(x, cy2 - 2, fl - 6);
    C.fillStyle = P.woodDk; R(x - 5, cy2 - 3, 12, 4);
    C.fillStyle = P.wood; R(x - 5, cy2 - 3, 12, 3);
    C.fillStyle = P.woodDk;
    for (let k = 0; k < 5; k++) { R(x + 2 + k, cy2 + 1 + k, 1, 1); R(x - 1 - k, cy2 + 1 + k, 1, 1); }
  }
  // ящики и бочка
  for (let i = 0; i < s.props.length; i++) {
    const x = s.props[i] + (i % 2 ? -16 : 8), y = RAIL - 8;
    if (i % 2) {
      C.fillStyle = P.woodDk; R(x, y, 7, 8);
      C.fillStyle = P.wood; R(x + 1, y + 1, 5, 6);
      C.fillStyle = P.woodDk; R(x + 1, y + 3, 5, 1); R(x, y + 2, 7, 1); R(x, y + 5, 7, 1);
    } else {
      C.fillStyle = P.woodDk; R(x, y - 1, 9, 9);
      C.fillStyle = P.wood; R(x + 1, y, 7, 7);
      C.fillStyle = P.woodDk;
      for (let k = 0; k < 7; k++) { R(x + 1 + k, y + k, 1, 1); R(x + 7 - k, y + k, 1, 1); }
    }
  }
  // кучка руды у станции
  for (let k = 0; k < 4; k++) { C.fillStyle = k % 2 ? P.face : P.faceDk; R(STATION - 40 + k * 2, RAIL - 1 - k, 12 - k * 2, 1); }
  C.fillStyle = ORE[1].c; R(STATION - 36, RAIL - 3, 1, 1); C.fillStyle = ORE[0].c; R(STATION - 33, RAIL - 2, 1, 1);
  // рельсы
  C.fillStyle = P.woodDk;
  for (let x = 0; x < W; x += 8) R(x, RAIL + 1, 5, 2);
  C.fillStyle = P.rail; R(0, RAIL, W, 1);
  C.fillStyle = P.railDk; R(0, RAIL + 1, W, 1);
  // толстые стойки по краям (стык со штреком)
  for (let k = 0; k < 2; k++) {
    const x = k ? W - 4 : 1, cy3 = s.ceil[x >> 1];
    timberPost(x, cy3 - 4, fl - 4);
    C.fillStyle = P.woodDk; R(x - 4, cy3 - 5, 10, 4);
    C.fillStyle = P.wood; R(x - 4, cy3 - 5, 10, 3);
  }
}

function miner(x, fy, dir, step, robe, robe2) {
  const y = fy - 12;
  C.fillStyle = 'rgba(0,0,0,0.25)'; R(x - 3, fy, 7, 1);
  C.fillStyle = P.leg; R(x - 1 + (step ? 1 : 0), y + 10, 1, 2); R(x + 1 - (step ? 1 : 0), y + 10, 1, 2);
  C.fillStyle = robe; R(x - 2, y + 4, 5, 7);
  C.fillStyle = robe2; R(x - 2, y + 8, 5, 1);
  C.fillStyle = P.skin; R(x - 1, y, 4, 4);
  C.fillStyle = P.beard; R(dir > 0 ? x + 1 : x - 1, y + 3, 3, 2);
  C.fillStyle = P.eye; R(dir > 0 ? x + 2 : x - 1, y + 1, 1, 1);
  C.fillStyle = P.cap; R(x - 2, y - 1, 6, 2); R(dir > 0 ? x + 3 : x - 3, y, 2, 1);
  C.fillStyle = P.cap2; R(x - 1, y - 2, 4, 1);
}
function pick(x, fy, dir, fr) {
  const px = (dx, dy, c) => { C.fillStyle = c; R(x + dx * dir, fy + dy, 1, 1); };
  if (fr === 0) {
    for (let k = 0; k < 5; k++) px(-1, -15 + k, P.handle);
    px(-3, -16, P.pick); px(-2, -16, P.pick); px(-1, -16, P.pickDk); px(0, -16, P.pick); px(1, -15, P.pick); px(-4, -15, P.pick);
    px(0, -11, P.skin);
  } else if (fr === 1) {
    px(1, -10, P.skin); px(2, -11, P.handle); px(3, -12, P.handle); px(4, -13, P.handle); px(5, -14, P.handle);
    px(4, -15, P.pick); px(5, -15, P.pickDk); px(6, -14, P.pick); px(7, -13, P.pick); px(3, -16, P.pick);
  } else {
    px(2, -7, P.skin); px(3, -7, P.handle); px(4, -7, P.handle); px(5, -7, P.handle); px(6, -7, P.handle);
    px(7, -9, P.pick); px(7, -8, P.pick); px(7, -7, P.pickDk); px(7, -6, P.pick); px(6, -10, P.pick); px(6, -5, P.pick);
  }
}

function createScene() {
  const rand = Math.random;
  const s = {
    seed: F(rand() * 1e9), layers: {}, shaftX: 30, bands: [], ceil: [], ores: [], props: [], lamps: [],
    miners: [], drips: [], dust: [], beamQ: -1, beam: '', beam2: '', skyC: ''
  };
  s.bands = bandsOf(rand);
  for (let x = 0; x < W + 4; x += 2) s.ceil.push(F(84 + 2.5 * Math.sin(x / 13) + 2 * Math.sin(x / 5.3 + 1) + rand() * 1.5));
  s.props.push(92 + F(rand() * 10), 204 + F(rand() * 10));
  for (let i = 0; i < s.props.length; i++) s.lamps.push({ x: s.props[i] + 4, ph: rand() * 10, wall: 0 });
  s.lamps.push({ x: 296, ph: rand() * 10, wall: 1 });
  for (let i = 0, n = 17; i < n; i++) {
    const x = F(6 + rand() * (W - 12));
    const above = rand() > 0.25;
    const yy = above ? F(10 + rand() * 62) : F(160 + rand() * 14);
    s.ores.push({ x, y: yy, k: F(rand() * 3), ph: rand() * 20 });
  }
  // жилы, которые рубят шахтёры
  s.ores.push({ x: 282, y: 132, k: 1, ph: 3 }, { x: 285, y: 127, k: 1, ph: 9 });
  s.ores.push({ x: 162, y: 138, k: 2, ph: 1 }, { x: 159, y: 133, k: 2, ph: 7 });
  s.miners.push({ x: 274, dir: 1, robe: P.robeA, robe2: P.robeA2, ph: 0, per: 0.95, fr: 0, mode: 0 });
  s.miners.push({ x: 174, dir: -1, robe: P.robeB, robe2: P.robeB2, ph: 0.4, per: 1.1, fr: 0, mode: 0 });
  // носильщик — он же гонщик
  s.carrier = { x: 70, dir: 1, robe: P.robeC, robe2: P.robeC2, ph: 0, mode: 1, from: 52, to: 146, pause: 1, hidden: 0, run: 0 };
  s.miners.push(s.carrier);
  for (let i = 0; i < 3; i++) s.drips.push({ x: F(70 + rand() * 220), t: rand() * 3, period: 2.5 + rand() * 3.5, y: 0, vy: 0, falling: 0 });
  for (let i = 0; i < 26; i++) s.dust.push({ x: rand() * W, y: 90 + rand() * 56, v: 1 + rand() * 2, ph: rand() * 10 });
  return s;
}

export default {
  id: 'mine',
  title: 'Вагонетка',
  sceneTitle: 'Шахта',
  desc: 'Мчись на вагонетке по шахте: прыгай через провалы, пригибайся под балками и собирай руду.',
  controls: '↑ / Пробел / клик сверху — прыжок · ↓ / клик снизу — пригнуться',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    C = ctx;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const rand = Math.random;
    const s = createScene();
    const carrier = s.carrier;
    const parts = pool(56);

    // ---------- мир ----------
    let sceneX = 0, camX = 0;
    const cart = { x: 110, y: RAIL, vy: 0, ground: 1, v: 0, duck: 0, tip: 0, load: 1, target: 230, pause: 1.5, rider: 0, crash: 0, sparkT: 0 };
    // всадник вне вагонетки: 0 в вагонетке, 1 летит, 2 сидит, 3 идёт/прыгает обратно
    const rider = { m: 0, x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 0.6 };
    // трасса
    const ys = new Float32Array(N), ts = new Uint8Array(N);
    const tr = { start: 0, i: 0, y: RAIL, ty: RAIL, hill: 0, gap: 0, broken: 0, cool: 0, calm: 0, flatFrom: 1e12 };
    // препятствия и руда
    const objs = [];
    for (let i = 0; i < 28; i++) objs.push({ on: 0, k: 0, x: 0, y: 0, ore: 0, ph: 0, flee: 0, hit: 0 });
    const pops = [];
    for (let i = 0; i < 6; i++) pops.push({ on: 0, x: 0, y: 0, t: 0, v: 0 });
    const g = { score: 0, dist: 0, runT: 0, ores: [0, 0, 0], best: 0, crashK: 0 };
    // фоновая летучая мышь в покое
    const idleBat = { on: 0, x: 0, y: 0, t: 0, next: 14 + rand() * 20 };

    const trackY = (x) => {
      if (x < tr.start || x >= tr.flatFrom) return RAIL;
      const f = (x - tr.start) / STEP, i0 = F(f);
      if (i0 + 1 >= tr.i) return tr.i > 0 ? ys[(tr.i - 1) % N] : RAIL;
      if (tr.i - i0 > N - 1) return ys[(tr.i - N + 1) % N];
      const a = ys[i0 % N], b = ys[(i0 + 1) % N];
      return a + (b - a) * (f - i0);
    };
    const trackT = (x) => {
      if (x < tr.start || x >= tr.flatFrom) return 0;
      const i0 = F((x - tr.start) / STEP);
      if (i0 >= tr.i || tr.i - i0 > N - 1) return 0;
      return ts[i0 % N];
    };
    const addObj = (k, x, y, ore) => {
      for (const o of objs) if (!o.on) { o.on = 1; o.k = k; o.x = x; o.y = y; o.ore = ore; o.ph = rand() * 6; o.flee = 0; o.hit = 0; return o; }
      return null;
    };
    const resetTrack = () => {
      tr.start = sceneX + W; tr.i = 0; tr.y = RAIL; tr.ty = RAIL; tr.hill = 4; tr.gap = 0; tr.broken = 0; tr.cool = 240; tr.calm = 0; tr.flatFrom = 1e12;
      for (const o of objs) o.on = 0;
    };
    // генерация трассы на шаг вперёд
    const genOne = () => {
      const x = tr.start + tr.i * STEP, j = tr.i % N;
      let type = 0;
      if (tr.gap > 0) { type = 1; tr.gap--; }
      else if (tr.broken > 0) { type = 2; tr.broken--; }
      else {
        if (tr.calm) tr.ty = RAIL;
        else if (tr.hill <= 0) {
          tr.ty = rand() < 0.3 ? tr.y : 112 + rand() * 46;
          tr.hill = 6 + F(rand() * 10);
        }
        tr.hill--;
        const d = clamp(tr.ty - tr.y, -2.6, 2.6);
        tr.y += d;
        tr.cool -= STEP;
        if (!tr.calm && tr.cool <= 0) {
          const v = cart.v > 60 ? cart.v : 90, dif = clamp(g.runT / 150, 0, 1);
          const r = rand();
          let space = v * (1.25 - 0.45 * dif) + rand() * v * 0.7;
          if (r < 0.26) {
            // провал
            tr.gap = clamp(Math.round(v * (0.26 + 0.1 * dif) / STEP + rand()), 2, 6);
            if (rand() < 0.5) addObj(2, x + STEP * (tr.gap + 1) / 2, tr.y - 30, rand() < 0.25 ? 2 : 1);
            space += tr.gap * STEP;
            tr.hill = Math.max(tr.hill, 2); tr.ty = tr.y;
          } else if (r < 0.42) {
            tr.broken = rand() < 0.5 ? 2 : 3;
            space += tr.broken * STEP;
          } else if (r < 0.62) {
            addObj(0, x + 4, 0, 0); // низкая балка
            tr.ty = tr.y; tr.hill = 4;
          } else if (r < 0.78) {
            addObj(1, x + 40, 0, 0); // летучая мышь
          } else {
            // россыпь руды
            const n = 3 + F(rand() * 3), k = rand() < 0.15 ? 2 : rand() < 0.45 ? 1 : 0;
            for (let q = 0; q < n; q++) addObj(2, x + q * 14, -8, k);
            space *= 0.6;
          }
          tr.cool = space;
        }
      }
      if (tr.calm && x + STEP >= tr.flatFrom) tr.y = RAIL;
      ys[j] = tr.y; ts[j] = type;
      tr.i++;
    };
    const genAhead = (toX) => {
      let n = 0;
      while (tr.start + tr.i * STEP < toX && tr.start + tr.i * STEP < tr.flatFrom + STEP && n < 64) { genOne(); n++; }
    };

    // ---------- фазы ----------
    let phase = 'idle', pt = 0, idleT = 0, overSent = false, sawOver = false;
    let introK = 0, outroK = 0, fast = 1;
    const resetRun = () => {
      g.score = 0; g.dist = 0; g.runT = 0; g.ores[0] = g.ores[1] = g.ores[2] = 0;
      g.best = Math.max(0, Math.floor(api.best || 0));
      for (const q of pops) q.on = 0;
      overSent = false; sawOver = false;
      keys.up = keys.down = 0; ptrDuck = 0;
    };
    const startIntro = () => {
      resetRun();
      resetTrack();
      phase = 'intro'; pt = 0; introK = 0;
      cart.pause = 0; cart.v = 0; cart.duck = 0; cart.tip = 0; cart.crash = 0; cart.ground = 1; cart.vy = 0; cart.y = RAIL;
      carrier.hidden = 0; carrier.run = 1;
    };
    const startOutro = () => {
      phase = 'outro'; pt = 0;
      if (!cart.rider) {
        // ещё не сел в вагонетку — просто возвращается к работе
        carrier.hidden = 0; carrier.run = 0; carrier.pause = 0.5;
        cart.v = 0; cart.pause = 1; cart.target = cart.x - sceneX < 150 ? 230 : 60;
        toIdle();
        return;
      }
      if (cart.crash) { outroK = 0; startFix(); } else beginCalm();
    };
    // поднять вагонетку и поставить её к шахтёру (после аварии)
    const startFix = () => {
      cart.fixX = cart.x; cart.fixY = cart.y; cart.dstX = rider.x - 2; cart.v = 0;
      if (rider.m !== 2) { rider.m = 2; rider.x = rider.tx; rider.y = rider.ty; }
      rider.t = 0; cart.fixT = 0;
      for (const o of objs) if (o.on && o.k === 0 && Math.abs(o.x - cart.x) < 60) { o.on = 0; for (let i = 0; i < 6; i++) spawnP(parts, o.x, trackY(o.x) - 18, (rand() - 0.5) * 50, -10 - rand() * 20, 0.6, P.chip, 160); }
    };
    const startRetry = () => {
      resetRun();
      phase = 'intro'; pt = 0; introK = 3;
      tr.cool = Math.max(tr.cool, 160);
      startFix();
    };
    // шаг подъёма вагонетки; true — готово
    const stepFix = (dt) => {
      cart.fixT += dt;
      const u = clamp(cart.fixT / 0.8, 0, 1), e = u * u * (3 - 2 * u);
      const ty = trackY(cart.dstX);
      cart.x = cart.fixX + (cart.dstX - cart.fixX) * e;
      cart.y = cart.fixY + (ty - cart.fixY) * e - Math.sin(u * Math.PI) * 10;
      cart.tip = 1 - e;
      if (u < 1) return false;
      cart.x = cart.dstX; cart.y = ty; cart.ground = 1; cart.vy = 0; cart.tip = 0; cart.crash = 0;
      rider.m = 0; cart.rider = 1;
      api.sfx('step');
      return true;
    };
    const beginCalm = () => {
      outroK = 1;
      tr.calm = 1;
      tr.flatFrom = tr.start + tr.i * STEP + STEP * 6;
      for (const o of objs) if (o.on && o.k === 1) o.flee = 1;
      cart.v = Math.max(cart.v, 175);
      cart.crash = 0; cart.tip = 0; rider.m = 0;
    };
    const toIdle = () => {
      phase = 'idle'; pt = 0; idleT = 2;
      if (cart.rider) {
        cart.rider = 0;
      }
    };
    const crash = (k) => {
      if (cart.crash) return;
      cart.crash = 1; g.crashK = k; cart.v = Math.min(cart.v, k === 0 ? 70 : 45);
      phase = 'crash'; pt = 0;
      api.sfx('hit');
      // всадник вылетает вперёд
      rider.m = 1; rider.t = 0; rider.dur = 0.6;
      rider.fx = cart.x; rider.fy = cart.y - 14;
      let tx = cart.x + 26;
      let guard = 0;
      while (trackT(tx) !== 0 && guard++ < 20) tx += STEP;
      rider.tx = tx; rider.ty = trackY(tx);
      rider.x = rider.fx; rider.y = rider.fy;
      for (let i = 0; i < 10; i++) spawnP(parts, cart.x, cart.y - 6, (rand() - 0.3) * 80, -30 - rand() * 50, 0.4 + rand() * 0.4, i % 2 ? P.spark : P.spark2, 260);
      for (const o of objs) if (o.on && o.k === 1) o.flee = 1;
    };

    // ---------- ввод ----------
    const keys = { up: 0, down: 0 };
    let ptrDuck = 0, jumpQ = 0;
    const jump = () => { if (phase === 'play') jumpQ = 0.12; };
    const onKeyDown = (e) => {
      const c = e.code;
      const isJ = c === 'ArrowUp' || c === 'KeyW' || c === 'Space';
      const isD = c === 'ArrowDown' || c === 'KeyS';
      if (!isJ && !isD) return;
      if (phase !== 'play') return;
      if (e.preventDefault) e.preventDefault();
      if (isJ && !e.repeat) jump();
      if (isD) keys.down = 1;
    };
    const onKeyUp = (e) => {
      const c = e.code;
      if (c === 'ArrowDown' || c === 'KeyS') keys.down = 0;
    };
    const onDown = (e) => {
      if (phase !== 'play') return;
      if (e.preventDefault) e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const y = (e.clientY - r.top) / Math.max(1, r.height) * H;
      if (y < H * 0.5) jump(); else ptrDuck = 1;
      if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ } }
    };
    const onUp = () => { ptrDuck = 0; };
    const onBlur = () => { keys.down = 0; ptrDuck = 0; };
    const onCtx = (e) => { if (e.preventDefault) e.preventDefault(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('contextmenu', onCtx);

    // ---------- обновление ----------
    const popup = (x, y, v) => { for (const q of pops) if (!q.on) { q.on = 1; q.x = x; q.y = y; q.t = 0; q.v = v; return; } };

    const physics = (dt, auto) => {
      // auto: автопилот (выезд к станции) — сам прыгает и пригибается
      const cx = cart.x;
      if (auto) {
        let danger = 0;
        const look = cart.v * 0.16 + 10;
        for (let dx = 4; dx < look; dx += 4) if (trackT(cx + dx) !== 0) { danger = 1; break; }
        if (danger && cart.ground) jumpQ = 0.1;
        let low = 0;
        for (const o of objs) if (o.on && o.k === 0 && o.x - cx < 50 && o.x - cx > -14) low = 1;
        cart.duck = low;
      } else cart.duck = keys.down || ptrDuck ? 1 : 0;
      if (jumpQ > 0) {
        jumpQ -= dt;
        if (cart.ground) { cart.ground = 0; cart.vy = -JUMP_V; jumpQ = 0; if (!auto) api.sfx('jump'); }
      }
      cart.x += cart.v * dt;
      const ty = trackY(cart.x), tt = trackT(cart.x);
      if (cart.ground) {
        if (tt !== 0) { cart.ground = 0; cart.vy = 10; }
        else cart.y = ty;
      } else {
        cart.vy += GRAV * dt;
        cart.y += cart.vy * dt;
        if (cart.vy > 0 && cart.y >= ty && trackT(cart.x) === 0 && trackT(cart.x - 6) === 0) {
          if (cart.y - ty < 9) {
            cart.y = ty; cart.ground = 1;
            if (cart.vy > 120) for (let i = 0; i < 4; i++) spawnP(parts, cart.x - 6 + i * 4, ty, (rand() - 0.5) * 40, -10 - rand() * 20, 0.3, P.spark, 200);
            cart.vy = 0;
          }
        }
        if (cart.y > ty + 14 && !auto) crash(0);
        if (auto && cart.y > ty + 10 && !cart.ground) { cart.y = ty; cart.vy = 0; cart.ground = 1; }
      }
    };

    const collide = () => {
      const cx = cart.x, cy = cart.y;
      const top = cy - (cart.duck ? 12 : 19);
      for (const o of objs) {
        if (!o.on || o.hit) continue;
        if (o.k === 0) {
          const by = trackY(o.x) - 15;
          if (cx + 7 > o.x - 10 && cx - 7 < o.x + 10 && top < by) { crash(1); return; }
        } else if (o.k === 1) {
          if (o.flee) continue;
          if (Math.abs(o.x - cx) < 6 && o.y + 2 > top && o.y - 2 < cy - 9) { crash(2); return; }
        } else {
          const oy = o.y < 0 ? trackY(o.x) + o.y : o.y;
          if (Math.abs(o.x - cx) < 10 && oy > top - 4 && oy < cy) {
            o.hit = 1; o.on = 0;
            if (phase === 'play') {
              const v = ORE[o.ore].pts;
              g.score += v; g.ores[o.ore]++;
              popup(o.x - camX, oy - 8, v);
              api.sfx('coin');
            }
            for (let i = 0; i < 5; i++) spawnP(parts, o.x, oy, (rand() - 0.5) * 50, -20 - rand() * 30, 0.4, ORE[o.ore].c, 200);
          }
        }
      }
    };

    const updateObjs = (dt, t) => {
      for (const o of objs) {
        if (!o.on) continue;
        if (o.x < camX - 40) { o.on = 0; continue; }
        if (o.k === 1) {
          if (o.flee) { o.x += 30 * dt; o.y -= 50 * dt; if (o.y < 40) o.on = 0; }
          else { o.x -= 22 * dt; o.y = trackY(o.x) - 17 + Math.sin(t * 3 + o.ph) * 2; }
        }
      }
    };

    const updateRide = (dt, t) => {
      const m = api.mode ? api.mode() : 'play';
      if (phase === 'intro') {
        if (introK === 0) {
          // носильщик бежит к вагонетке, вагонетка катится навстречу
          const mx = sceneX + carrier.x;
          const dx = cart.x - mx;
          carrier.dir = dx > 0 ? 1 : -1;
          carrier.x += carrier.dir * 70 * dt;
          if (Math.abs(dx) > 8) cart.x -= Math.sign(dx) * 36 * dt;
          if (Math.abs(cart.x - (sceneX + carrier.x)) < 5) {
            introK = 1; pt = 0;
            rider.fx = sceneX + carrier.x; rider.fy = FLOOR - 1; rider.t = 0;
            carrier.hidden = 1;
            api.sfx('jump');
          }
        } else if (introK === 1) {
          rider.t += dt;
          if (rider.t >= 0.35) { introK = 2; pt = 0; cart.rider = 1; rider.m = 0; cart.load = 0; api.sfx('step'); }
        } else if (introK === 3) {
          if (stepFix(dt)) { introK = 2; pt = 0; }
        } else {
          cart.v = Math.min(95, cart.v + 120 * dt);
          physics(dt, true);
          if (pt > 0.9) { phase = 'play'; pt = 0; }
        }
      } else if (phase === 'play') {
        g.runT += dt;
        cart.v = Math.min(190, 95 + g.runT * 0.55);
        physics(dt, false);
        if (!cart.crash) collide();
        g.dist += cart.v * dt;
        g.score += cart.v * dt / 10;
        if (cart.duck && cart.ground && rand() < dt * 8) spawnP(parts, cart.x - 6, cart.y - 1, -20, -8, 0.2, P.spark2, 100);
      } else if (phase === 'crash' || phase === 'wait') {
        // вагонетка тормозит и опрокидывается, всадник сидит
        if (cart.v > 0) {
          cart.v = Math.max(0, cart.v - 260 * dt);
          cart.x += cart.v * dt;
          if (rand() < 0.6) spawnP(parts, cart.x, cart.y, -30 * rand(), -20 * rand(), 0.25, P.spark, 200);
        }
        const ty = trackY(cart.x);
        if (g.crashK === 0) { cart.vy += GRAV * dt; cart.y = Math.min(ty + 40, cart.y + cart.vy * dt); }
        else { cart.tip = Math.min(1, cart.tip + dt * 3); cart.y = ty; }
        updRider(dt);
        if (phase === 'crash' && pt > 1.1) {
          phase = 'wait'; pt = 0;
          if (!overSent) { overSent = true; api.over(Math.round(g.score)); }
        }
      } else if (phase === 'outro') {
        fast = m === 'play' ? 2.5 : 1;
        if (outroK === 0) {
          if (stepFix(dt * fast)) beginCalm();
        } else if (outroK === 1) {
          const stop = sceneX2() + STATION;
          const left = stop - cart.x;
          if (left < 110) {
            cart.v = Math.max(18, Math.min(cart.v, Math.sqrt(Math.max(0, left) * 2 * 150)));
            if (rand() < 0.8) { spawnP(parts, cart.x - 5, cart.y, -10 - rand() * 40, -15 - rand() * 25, 0.3, P.spark, 220); spawnP(parts, cart.x + 4, cart.y, -10 - rand() * 40, -15 - rand() * 25, 0.3, P.spark2, 220); }
            if (rand() < dt * 6) api.sfx('step');
          }
          physics(dt * fast, true);
          if (cart.x >= stop - 0.5) {
            cart.x = stop; cart.v = 0; cart.y = RAIL; cart.ground = 1; cart.duck = 0;
            sceneX = tr.flatFrom;
            outroK = 2; rider.t = 0; cart.rider = 0;
            carrier.x = STATION; carrier.hidden = 1;
          }
        } else {
          // шахтёр вылезает и берёт кирку
          rider.t += dt * fast;
          if (rider.t >= 0.5) {
            carrier.hidden = 0; carrier.run = 0; carrier.x = STATION - 14; carrier.dir = -1; carrier.pause = 1.2;
            cart.pause = 2; cart.target = 230; cart.load = 0;
            resetIdleAfterRide();
            toIdle();
          }
        }
      }
      // камера
      if (phase === 'intro' || phase === 'play' || phase === 'crash' || phase === 'wait' || phase === 'outro') {
        const want = Math.max(cart.x - CAM_LEAD, sceneX);
        let target = want;
        if (phase === 'outro' && outroK >= 1 && tr.calm) target = Math.min(want, tr.flatFrom);
        if (phase === 'crash' || phase === 'wait') target = camX; // стоим
        if ((phase === 'outro' && outroK === 0) || (phase === 'intro' && introK === 3)) target = camX;
        camX = target > camX ? target : camX + (target - camX) * Math.min(1, dt * 4);
        if (phase !== 'outro' || outroK !== 2) genAhead(camX + W + 24);
      }
    };
    const sceneX2 = () => (tr.calm ? tr.flatFrom : sceneX);
    const resetIdleAfterRide = () => { camX = sceneX; for (const o of objs) o.on = 0; tr.calm = 0; tr.start = sceneX + W; tr.i = 0; tr.flatFrom = 1e12; };

    const updRider = (dt) => {
      if (rider.m === 1) {
        rider.t += dt;
        const u = clamp(rider.t / rider.dur, 0, 1);
        rider.x = rider.fx + (rider.tx - rider.fx) * u;
        rider.y = rider.fy + (rider.ty - rider.fy) * u - Math.sin(u * Math.PI) * 18;
        if (u >= 1) { rider.m = 2; rider.t = 0; rider.y = rider.ty; for (let i = 0; i < 5; i++) spawnP(parts, rider.x, rider.y, (rand() - 0.5) * 30, -8 - rand() * 10, 0.6, P.chip, 120); }
      } else if (rider.m === 2) rider.t += dt;
    };

    // ---------- покой ----------
    const updateIdle = (dt, t) => {
      // вагонетка катается сама
      if (phase === 'idle' || (phase === 'outro' && !cart.rider && outroK !== 2)) {
        if (cart.pause > 0) cart.pause -= dt;
        else {
          const tx = sceneX + cart.target, d = tx - cart.x, dist = Math.abs(d);
          const v = 26 * Math.min(1, dist / 14 + 0.15);
          cart.x += Math.sign(d) * Math.min(dist, v * dt);
          if (dist < 0.5) {
            cart.pause = 2 + rand() * 3;
            cart.target = cart.target > 150 ? 60 : 230;
            cart.load = cart.target < 150 ? 1 : 0;
          }
        }
        cart.y = RAIL;
      }
      if (camX !== sceneX && phase === 'idle') camX = sceneX;
      // носильщик
      const m = carrier;
      if (!m.hidden && !m.run) {
        if (m.pause > 0) m.pause -= dt;
        else {
          m.x += m.dir * 11 * dt;
          if (m.x > m.to) { m.x = m.to; m.dir = -1; m.pause = 1.5 + rand() * 2; }
          if (m.x < m.from) { m.x = m.from; m.dir = 1; m.pause = 2 + rand() * 2; }
        }
      }
      // мышь в покое
      const b = idleBat;
      if (b.on) {
        b.t += dt; b.x -= 38 * dt; b.y = 100 + Math.sin(b.t * 2.2) * 8;
        if (b.x < -10) { b.on = 0; b.next = 18 + rand() * 30; }
      } else if (phase === 'idle') {
        b.next -= dt;
        if (b.next <= 0) { b.on = 1; b.t = 0; b.x = W + 8; }
      }
    };

    // ---------- рисование ----------
    const glowLamp = (lx, ly, ph, t, wall) => {
      const flk = 0.8 + 0.2 * Math.sin(t * 8 + ph) * Math.sin(t * 2.9 + ph);
      C.globalAlpha = flk;
      C.fillStyle = P.glowA; blob(lx, ly + 6, 34);
      C.fillStyle = P.glowB; blob(lx, ly + 3, 20);
      C.fillStyle = P.glowC; blob(lx, ly, 9);
      C.globalAlpha = 1;
      C.fillStyle = P.lantern;
      if (!wall) R(lx, ly - 7, 1, 5); else R(lx - 3, ly + 3, 4, 1);
      R(lx - 1, ly - 2, 3, 1); R(lx - 1, ly + 2, 3, 1);
      C.fillStyle = flk > 0.92 ? P.flame3 : P.flame; R(lx - 1, ly - 1, 3, 3);
    };

    const drawSceneLife = (o, t, dt, envDark) => {
      // свет из колодца
      const bq = Math.round(envDark * 8);
      if (s.beamQ !== bq) {
        s.beamQ = bq;
        const c = mix([255, 238, 196], [140, 165, 230], bq / 8);
        s.beam = rgba(c, 0.10 - 0.04 * bq / 8);
        s.beam2 = rgba(c, 0.06 - 0.025 * bq / 8);
        s.skyC = rgba(mix([150, 200, 240], [30, 34, 70], bq / 8), 1);
      }
      const sx = s.shaftX + o, cy0 = s.ceil[s.shaftX >> 1];
      C.fillStyle = s.skyC; R(sx + 1, 0, 12, 2);
      C.fillStyle = s.beam; R(sx + 1, 0, 12, FLOOR - 6);
      C.fillStyle = s.beam2; R(sx - 3, cy0, 20, FLOOR - 6 - cy0);
      for (let i = 0; i < s.lamps.length; i++) {
        const l = s.lamps[i], lx = l.x + o;
        if (lx < -40 || lx > W + 40) continue;
        glowLamp(lx, l.wall ? 112 : s.ceil[l.x >> 1] + 9, l.ph, t, l.wall);
      }
      for (let i = 0; i < s.ores.length; i++) {
        const r = s.ores[i];
        const v = Math.sin(t * 0.8 + r.ph * 3.1);
        if (v < 0.93) continue;
        const x = r.x + o + 1, y = r.y;
        C.fillStyle = P.glint; R(x, y, 1, 1);
        if (v > 0.975) { C.fillStyle = P.glint2; R(x - 1, y, 3, 1); R(x, y - 1, 1, 3); R(x - 2, y, 1, 1); R(x + 2, y, 1, 1); R(x, y - 2, 1, 1); R(x, y + 2, 1, 1); }
      }
      // шахтёры
      for (let i = 0; i < s.miners.length; i++) {
        const m = s.miners[i];
        if (m.mode === 0) {
          const u = dt > 0 || t > 0 ? ((t / m.per + m.ph) % 1) : 0.2;
          const fr = u < 0.5 ? 0 : u < 0.62 ? 1 : 2;
          const x = m.x + o;
          if (x < -20 || x > W + 20) { m.fr = fr; continue; }
          miner(x, FLOOR + 1, m.dir, 0, m.robe, m.robe2);
          pick(x, FLOOR + 1, m.dir, fr);
          if (dt > 0 && fr === 2 && m.fr !== 2) {
            const hx = m.x + 8 * m.dir + o, hy = FLOOR + 1 - 8;
            for (let k = 0; k < 4; k++) spawnP(parts, hx + camX, hy, -m.dir * (10 + rand() * 30), -10 - rand() * 25, 0.25 + rand() * 0.25, k % 2 ? P.spark : P.spark2, 80);
            if (rand() < 0.6) spawnP(parts, hx + camX, hy, -m.dir * (6 + rand() * 10), -8, 0.7, P.chip, 120);
          }
          m.fr = fr;
        } else if (!m.hidden) {
          const moving = dt > 0 && (m.run || m.pause <= 0);
          const x = F(m.x) + o;
          miner(x, FLOOR + 1, m.dir, moving ? F((t * (m.run ? 12 : 6)) % 2) : 0, m.robe, m.robe2);
          if (m.dir < 0 && !m.run) {
            C.fillStyle = P.sack; R(x + 1, FLOOR - 13, 4, 5);
            C.fillStyle = P.sack2; R(x + 1, FLOOR - 9, 4, 1);
          }
          C.fillStyle = P.handle; R(x - m.dir * 3, FLOOR - 12, 1, 7);
          C.fillStyle = P.pick; R(x - m.dir * 3 - 1, FLOOR - 13, 3, 1);
        }
      }
      // капли
      for (let i = 0; i < s.drips.length; i++) {
        const d = s.drips[i];
        const x = d.x + o, cy = s.ceil[d.x >> 1];
        C.fillStyle = P.puddle; R(x - 3, FLOOR - 2, 7, 1);
        if (dt > 0) {
          if (!d.falling) {
            d.t += dt;
            if (d.t > d.period) { d.falling = 1; d.y = cy; d.vy = 0; d.t = 0; }
          } else {
            d.vy += 220 * dt; d.y += d.vy * dt;
            if (d.y >= FLOOR - 2) {
              d.falling = 0;
              for (let k = 0; k < 3; k++) spawnP(parts, d.x + o + camX, FLOOR - 3, (k - 1) * 14, -16 - rand() * 10, 0.35, P.dropHi, 160);
            }
          }
        }
        C.fillStyle = P.drop;
        if (d.falling) R(x, d.y, 1, 2);
        else if (d.t > d.period * 0.5) R(x, cy, 1, d.t > d.period * 0.8 ? 2 : 1);
      }
    };

    // штрек поездки: колонки по 4 px
    const drawRide = (t, scrL, scrR) => {
      // порода с параллаксом
      const off = -(((camX * 0.5) % W) + W) % W;
      cached(ctx, s, 'rock', W, H, F(off), 0, paintRock);
      cached(ctx, s, 'rock', W, H, F(off) + W, 0, paintRock);
      const x0 = camX - (camX % 4 + 4) % 4;
      for (let wx = x0; wx < camX + W; wx += 4) {
        const sx = wx - camX;
        if (sx >= scrL && sx < scrR) continue;
        const ty = trackY(wx + 2), type = trackT(wx + 2);
        const cy = F(ty - 58 + 3 * Math.sin(wx / 23) + 2 * Math.sin(wx / 7.7));
        C.fillStyle = P.edgeDk; R(sx, cy - 2, 4, 2);
        C.fillStyle = P.edge; R(sx, cy - 1, 4, 1);
        C.fillStyle = P.back; R(sx, cy, 4, ty - cy + 7);
        C.fillStyle = P.backDk; R(sx, cy, 4, 3);
        if (type === 1) {
          C.fillStyle = P.pit2; R(sx, ty + 2, 4, 8);
          C.fillStyle = P.pit; R(sx, ty + 10, 4, H - ty - 10);
        } else {
          C.fillStyle = P.floor; R(sx, ty + 2, 4, 9);
          C.fillStyle = P.floorDk; R(sx, ty + 11, 4, H - ty - 11);
          C.fillStyle = P.woodDk; if ((wx & 7) === 0) R(sx, ty + 1, 5, 2);
          if (type === 0) {
            C.fillStyle = P.rail; R(sx, ty, 4, 1);
            C.fillStyle = P.railDk; R(sx, ty + 1, 4, 1);
          } else if ((wx & 4) === 0) {
            // обломки рельса
            C.fillStyle = P.railDk; R(sx, ty + 1 + ((wx >> 3) & 1), 3, 1);
          }
        }
      }
      // крепь и фонари вдоль пути
      const k0 = F((camX - 20) / 160), k1 = F((camX + W + 20) / 160);
      for (let k = k0; k <= k1; k++) {
        const wx = k * 160 + 40, sx = wx - camX;
        if (sx >= scrL - 8 && sx < scrR + 8) continue;
        if (trackT(wx) !== 0) continue;
        const ty = trackY(wx), cy = F(ty - 58 + 3 * Math.sin(wx / 23) + 2 * Math.sin(wx / 7.7));
        timberPost(sx, cy - 2, ty - 1);
        C.fillStyle = P.woodDk; R(sx - 5, cy - 3, 12, 4);
        C.fillStyle = P.wood; R(sx - 5, cy - 3, 12, 3);
        if (k % 2 === 0) glowLamp(sx + 5, cy + 9, k, t, 0);
      }
    };

    const drawCart = (x, y, tip, load) => {
      x = Math.round(x); y = Math.round(y);
      if (tip > 0.5) {
        // на боку
        C.fillStyle = P.cartDk; R(x - 4, y - 16, 8, 16);
        C.fillStyle = P.cart; R(x - 3, y - 15, 6, 14);
        C.fillStyle = P.cartHi; R(x + 3, y - 16, 1, 16);
        C.fillStyle = P.wheel; R(x - 7, y - 14, 3, 4); R(x - 7, y - 5, 3, 4);
        return;
      }
      const yy = y - 10;
      if (load) {
        C.fillStyle = '#5a4c40'; R(x - 6, yy - 2, 12, 3);
        C.fillStyle = ORE[2].c; R(x - 4, yy - 2, 2, 2);
        C.fillStyle = ORE[1].c; R(x, yy - 3, 2, 2);
        C.fillStyle = ORE[0].c; R(x + 3, yy - 2, 2, 1);
      }
      C.fillStyle = P.cartDk; R(x - 8, yy, 16, 8);
      C.fillStyle = P.cart; R(x - 7, yy + 1, 14, 6);
      C.fillStyle = P.cartHi; R(x - 8, yy, 16, 1);
      C.fillStyle = P.cartDk; R(x - 3, yy + 1, 1, 6); R(x + 2, yy + 1, 1, 6);
      const spin = F(cart.x / 2) & 1;
      for (let k = 0; k < 2; k++) {
        const wx = x - 6 + k * 9;
        C.fillStyle = P.wheel; R(wx, yy + 7, 4, 3);
        C.fillStyle = P.wheelHi; R(wx + 1 + spin, yy + 8, 1, 1);
      }
    };
    // шахтёр в вагонетке
    const drawRiderIn = (x, y, duck, t) => {
      x = Math.round(x); y = Math.round(y);
      const top = y - 10 - (duck ? 3 : 9);
      C.fillStyle = P.robeC; R(x - 2, top + 4, 5, 6);
      C.fillStyle = P.skin; R(x - 1, top, 4, 4);
      C.fillStyle = P.beard; R(x + 1, top + 3, 3, 1);
      C.fillStyle = P.eye; R(x + 2, top + 1, 1, 1);
      C.fillStyle = P.cap; R(x - 2, top - 1, 6, 2); R(x + 3, top, 2, 1);
      C.fillStyle = P.cap2; R(x - 1, top - 2, 4, 1);
      // налобный фонарь
      C.fillStyle = P.flame; R(x + 3, top - 1, 1, 1);
      C.fillStyle = 'rgba(255,220,140,0.07)'; R(x + 5, top - 4, 14, 7); R(x + 19, top - 6, 16, 11);
      if (!duck) { C.fillStyle = P.skin; R(x + 3, top + 5 + (Math.sin(t * 10) > 0 ? 0 : 1), 2, 1); }
    };
    const drawBat = (x, y, t, ph) => {
      x = Math.round(x); y = Math.round(y);
      const up = Math.sin(t * 18 + ph) > 0;
      C.fillStyle = P.bat; R(x - 1, y - 1, 3, 3);
      C.fillStyle = P.bat2;
      if (up) { R(x - 4, y - 3, 3, 1); R(x - 2, y - 2, 1, 1); R(x + 2, y - 3, 3, 1); R(x + 2, y - 2, 1, 1); }
      else { R(x - 4, y, 3, 1); R(x - 2, y, 1, 1); R(x + 2, y, 3, 1); }
      C.fillStyle = P.batEye; R(x - 1, y, 1, 1);
    };
    const drawObjs = (t) => {
      for (const o of objs) {
        if (!o.on) continue;
        const sx = o.x - camX;
        if (sx < -30 || sx > W + 30) continue;
        if (o.k === 0) {
          const ty = trackY(o.x), by = ty - 15;
          const cy = F(ty - 58 + 3 * Math.sin(o.x / 23) + 2 * Math.sin(o.x / 7.7));
          C.fillStyle = P.chain; R(sx - 8, cy, 1, by - 4 - cy); R(sx + 8, cy, 1, by - 4 - cy);
          C.fillStyle = P.woodDk; R(sx - 11, by - 5, 22, 5);
          C.fillStyle = P.wood; R(sx - 11, by - 5, 22, 3);
          C.fillStyle = P.woodHi; R(sx - 11, by - 5, 22, 1);
          C.fillStyle = P.warn; R(sx - 9, by - 4, 3, 1); R(sx - 1, by - 4, 3, 1); R(sx + 7, by - 4, 3, 1);
        } else if (o.k === 1) drawBat(sx, o.y, t, o.ph);
        else {
          const oy = o.y < 0 ? trackY(o.x) + o.y : o.y;
          const bob = Math.sin(t * 4 + o.ph) > 0 ? 1 : 0;
          drawSpr(NUG[o.ore], sx - 2, oy - 2 - bob);
          if (Math.sin(t * 5 + o.ph * 3) > 0.85) { C.fillStyle = P.glint; R(sx - 1, oy - 4 - bob, 1, 1); }
        }
      }
    };

    const drawHud = () => {
      C.fillStyle = 'rgba(10,8,8,0.45)'; R(0, 0, W, 12);
      let x = 5;
      for (let k = 0; k < 3; k++) {
        drawSpr(NUG[k], x, 4);
        x += 7;
        x += drawNumber(ctx, g.ores[k], x, 3, '#ffffff') + 7;
      }
      const sc = String(Math.round(g.score));
      const sw = textWidth(sc, 2);
      drawText(ctx, sc, W - 5 - sw + 1, 3, 'rgba(0,0,0,0.7)', 2);
      drawText(ctx, sc, W - 5 - sw, 2, '#ffffff', 2);
      const bw = textWidth(String(g.best));
      drawNumber(ctx, g.best, W - 5 - bw, 15, '#ffe070');
      drawIcon(ctx, 'trophy', W - 5 - bw - 9, 14);
      // скорость — стрелка и число
      drawIcon(ctx, 'right', 150, 3);
      drawNumber(ctx, Math.round(cart.v / 10), 157, 3, '#c8d0dc');
    };

    const drawFrame = (t, dt, envDark) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const o = Math.round(sceneX - camX);
      const showScene = o > -W && o < W;
      const scrL = showScene ? Math.max(0, o) : 0, scrR = showScene ? Math.min(W, o + W) : 0;
      if (!showScene || o > 0 || o + W < W) drawRide(t, scrL, scrR);
      if (showScene) {
        cached(ctx, s, 'scene', W, H, o, 0, paintScene);
        drawSceneLife(o, t, dt, envDark);
      }
      // станция на выезде (новое место сцены рисуем заранее)
      if (tr.calm && phase === 'outro') {
        const o2 = Math.round(tr.flatFrom - camX);
        if (o2 < W && o2 !== o) {
          cached(ctx, s, 'scene', W, H, o2, 0, paintScene);
          drawSceneLife(o2, t, 0, envDark);
        }
      }
      if (phase !== 'idle') drawObjs(t);
      // вагонетка и всадник
      const cx = cart.x - camX;
      if (introK === 1 && phase === 'intro') {
        const u = clamp(rider.t / 0.35, 0, 1);
        const rx = rider.fx + (cart.x - rider.fx) * u - camX, ry = rider.fy - 2 - Math.sin(u * Math.PI) * 12 + (cart.y - 2 - rider.fy) * u;
        miner(Math.round(rx), Math.round(ry), 1, 1, P.robeC, P.robeC2);
      }
      if (cart.rider && rider.m === 0) drawRiderIn(cx, cart.y, cart.duck, t);
      drawCart(cx, cart.y, cart.tip, cart.load && !cart.rider);
      if (phase === 'outro' && outroK === 2) {
        const u = clamp(rider.t / 0.5, 0, 1);
        miner(Math.round(cx - 14 * u), Math.round(FLOOR + 1 - Math.sin(u * Math.PI) * 10 - (1 - u) * 6), -1, 1, P.robeC, P.robeC2);
      }
      if (rider.m === 1 || rider.m === 3) {
        miner(Math.round(rider.x - camX), Math.round(rider.y + 12), 1, F(t * 8) & 1, P.robeC, P.robeC2);
      } else if (rider.m === 2) {
        // сидит, оглушён
        const x = Math.round(rider.x - camX), y = Math.round(rider.y);
        C.fillStyle = 'rgba(0,0,0,0.25)'; R(x - 4, y, 9, 1);
        C.fillStyle = P.leg; R(x + 1, y - 2, 4, 2);
        C.fillStyle = P.robeC; R(x - 2, y - 8, 5, 7);
        C.fillStyle = P.skin; R(x - 1, y - 12, 4, 4);
        C.fillStyle = P.beard; R(x + 1, y - 9, 3, 2);
        C.fillStyle = P.eye; R(x + 2, y - 11, 1, 1);
        C.fillStyle = P.skin; R(x - 2, y - 13 + (Math.sin(t * 2) > 0 ? 0 : 1), 1, 3);
        if (rider.t < 6) {
          for (let k = 0; k < 3; k++) {
            const a = t * 3 + k * 2.1;
            C.fillStyle = k === 1 ? '#fff0b0' : P.spark;
            R(x + 1 + Math.cos(a) * 5, y - 16 + Math.sin(a) * 1.5, 1, 1);
          }
        }
      }
      // мышь в покое
      if (idleBat.on) drawBat(idleBat.x, idleBat.y, t, 0);
      // частицы (мировые координаты)
      for (const q of parts) {
        if (!q.on) continue;
        if (dt > 0) {
          q.life += dt;
          if (q.life >= q.max) { q.on = 0; continue; }
          q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
          if (q.y > FLOOR + 20) q.on = 0;
        }
        C.globalAlpha = Math.max(0, 1 - q.life / q.max);
        C.fillStyle = q.c; R(q.x - camX, q.y, 1, 1);
      }
      C.globalAlpha = 1;
      // пыль
      C.fillStyle = P.dust;
      for (let i = 0; i < s.dust.length; i++) {
        const d = s.dust[i];
        if (dt > 0) {
          d.x += d.v * dt; d.y += Math.sin(t * 0.5 + d.ph) * dt * 1.5;
          if (d.x > W + 4) d.x = -4;
        }
        if (Math.sin(t * 0.7 + d.ph * 2) > -0.2) R(d.x, d.y, 1, 1);
      }
      // всплывающие очки
      for (const q of pops) {
        if (!q.on) continue;
        if (dt > 0) { q.t += dt; q.y -= dt * 16; if (q.t > 0.8) { q.on = 0; continue; } }
        const str = '+' + q.v, w = textWidth(str);
        drawText(ctx, str, q.x - w / 2 + 1, q.y + 1, '#1a1010');
        drawText(ctx, str, q.x - w / 2, q.y, '#fff2a0');
      }
      for (let i = 0; i < 24; i++) { C.fillStyle = VIG[i]; R(i * 3, 0, 3, H); }
      // HUD и подсказка
      if (phase === 'play' || phase === 'crash' || phase === 'wait' || (phase === 'intro' && introK === 2)) drawHud();
      if (phase === 'intro' && introK === 2 || (phase === 'play' && g.runT < 2.5)) {
        if (F(t * 3) % 2 === 0) {
          drawIcon(ctx, 'up', cx - 12, cart.y - 36);
          drawIcon(ctx, 'down', cx + 6, cart.y - 36);
        }
      }
    };

    // ---------- цикл ----------
    let raf = 0, last = performance.now(), alive = true, tAcc = 0;
    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      C = ctx;
      const env = api.env ? api.env() : null;
      const envDark = env && env.dark > 0 ? Math.min(1, env.dark) : 0;
      const anim = !env || env.animations !== false;
      if (api.paused && api.paused()) dt = 0;
      if (dt > 0) {
        const m = api.mode ? api.mode() : 'play';
        pt += dt;
        if (phase === 'idle') {
          idleT += dt;
          if (m === 'play' && idleT > 1.2) startIntro();
        } else if (phase === 'intro' || phase === 'play') {
          if (m === 'idle') startOutro();
        } else if (phase === 'crash') {
          if (m === 'idle') startOutro();
        } else if (phase === 'wait') {
          if (m === 'over') sawOver = true;
          if (m === 'idle') startOutro();
          else if (m === 'play' && (sawOver || pt > 3)) startRetry(); // повтор: вагонетку ставят на рельсы прямо здесь
        }
        if (phase !== 'idle') updateRide(dt, tAcc);
      }
      if (api._dbg) api._dbg.phase = phase;
      const sdt = phase === 'idle' && !anim ? 0 : dt;
      if (sdt > 0) {
        tAcc += sdt;
        updateIdle(sdt, tAcc);
        updateObjs(sdt, tAcc);
      }
      drawFrame(tAcc, sdt, envDark);
    };

    if (api._dbg) {
      // тестовый автопилот: 1 — прыгнуть, 2 — пригнуться, 0 — отпустить
      api._dbg.auto = () => {
        const cx = cart.x;
        for (let dx = 4; dx < cart.v * 0.16 + 12; dx += 4) if (trackT(cx + dx) !== 0) return 1;
        for (const o of objs) if (o.on && (o.k === 0 || (o.k === 1 && !o.flee)) && o.x - cx < 40 && o.x - cx > -14) return 2;
        return 0;
      };
    }
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.style.touchAction = prevTouch;
      ctx.globalAlpha = 1;
    };
  }
};
