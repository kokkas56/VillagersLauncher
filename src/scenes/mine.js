// Сцена «Шахта»: подземный разрез — пласты породы, штрек с рельсами и вагонеткой (катается туда-обратно),
// шахтёры с кирками (удар + искры), мерцающие рудные жилы (изумруд, золото, железо), деревянная крепь
// с фонарями, капли воды, пыль в свете фонарей, световой колодец (день/ночь по `dark`).

let C = null;
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const STRATA = ['#4a4038', '#3f3832', '#52463a', '#3a3534', '#473d33', '#3d3630'];
const P = {
  speckHi: '#5e5246', speckDk: '#2c2724', back: '#2b2624', backDk: '#211d1c', backHi: '#352f2b', edge: '#5a4c3e', edgeDk: '#1a1716',
  floor: '#4a3e32', floorHi: '#5a4b3c', floorDk: '#382f27', face: '#5d5044', faceDk: '#463c33',
  wood: '#7a5634', woodDk: '#553a22', woodHi: '#946a42', rail: '#8a8c94', railDk: '#55575e',
  cart: '#6b6e76', cartDk: '#4a4c53', cartHi: '#8d9098', wheel: '#2a2a2e', wheelHi: '#5a5a62',
  skin: '#c9966e', eye: '#1c1618', leg: '#3a2c24', cap: '#6e4a2c', cap2: '#5a3c22', beard: '#7a6a5a',
  robeA: '#6a625a', robeA2: '#55504a', robeB: '#5a6a7a', robeB2: '#4a5866', robeC: '#7a5a40', robeC2: '#634832',
  handle: '#8a6238', pick: '#a4a8b0', pickDk: '#70747c', sack: '#a08a62', sack2: '#86724e',
  lantern: '#3a3238', flame: '#ffcf5a', flame3: '#fff0b0',
  glowA: 'rgba(255,165,70,0.08)', glowB: 'rgba(255,175,85,0.10)', glowC: 'rgba(255,195,110,0.14)',
  spark: '#ffe27a', spark2: '#ff9a3a', chip: '#6a5a4a', drop: '#8fb4d8', dropHi: '#c7dcf0', puddle: 'rgba(120,160,200,0.22)',
  dust: 'rgba(255,220,170,0.28)', glint: '#ffffff', glint2: 'rgba(255,255,255,0.45)'
};
const ORE = [
  { c: '#3fd07a', d: '#1f8a4a' }, // изумруд
  { c: '#f2cc4a', d: '#b08a24' }, // золото
  { c: '#d8b8a0', d: '#9a7a66' }  // железо
];
const VIG = [];
for (let i = 0; i < 24; i++) VIG.push('rgba(6,4,4,' + (0.1 * (24 - i) / 24).toFixed(3) + ')');

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

// статичный слой: пласты, руда, штрек, забой, колодец с лестницей, крепь, рельсы. Координаты слоя = экран + 8.
function paintBg(s) {
  const W = s.W + 16, rand = lcg(s.seed), K = 8;
  // пласты
  for (let x = 0; x < W; x += 2) {
    let y0 = 0;
    for (let k = 0; k < s.bands.length; k++) {
      const b = s.bands[k];
      const y1 = k === s.bands.length - 1 ? 180 : F(b.y + b.a * Math.sin(x / b.f + b.ph) + 2 * Math.sin(x / 7 + k));
      C.fillStyle = STRATA[k % STRATA.length];
      R(x, y0, 2, y1 - y0);
      y0 = y1;
    }
  }
  for (let i = 0; i < W * 1.4; i++) {
    C.fillStyle = rand() > 0.5 ? P.speckHi : P.speckDk;
    R(rand() * W, rand() * 180, rand() > 0.8 ? 2 : 1, 1);
  }
  // штрек
  const fl = s.floorY;
  for (let x = 0; x < W; x += 2) {
    const sx = x - K;
    if (sx > s.endX + 1) continue;
    const cy = s.ceil[x >> 1];
    C.fillStyle = P.edgeDk; R(x, cy - 2, 2, 2);
    C.fillStyle = P.edge; R(x, cy - 1, 2, 1);
    C.fillStyle = P.back; R(x, cy, 2, fl - cy);
    C.fillStyle = P.backDk; R(x, cy, 2, 3);
  }
  for (let i = 0; i < W / 3; i++) {
    const x = F(rand() * Math.min(W, s.endX + K)), y = s.ceil[x >> 1] + 4 + rand() * (fl - s.ceil[x >> 1] - 8);
    C.fillStyle = rand() > 0.4 ? P.backHi : P.backDk;
    R(x, y, rand() > 0.6 ? 2 : 1, rand() > 0.7 ? 2 : 1);
  }
  // забой справа
  const ex = s.endX + K;
  for (let y = 70; y < fl; y += 3) {
    const j = F(Math.sin(y * 0.9) * 2 + Math.sin(y * 0.37) * 2);
    C.fillStyle = P.face; R(ex + j, y, W - ex - j, 3);
    C.fillStyle = P.faceDk; R(ex + j, y, 1, 3);
  }
  // пол
  C.fillStyle = P.floor; R(0, fl - 8, Math.min(W, ex + 6), 10);
  C.fillStyle = P.floorHi; R(0, fl - 8, Math.min(W, ex + 6), 1);
  C.fillStyle = P.floorDk;
  for (let i = 0; i < W / 4; i++) R(rand() * Math.min(W, ex), fl - 6 + rand() * 7, rand() > 0.5 ? 2 : 1, 1);
  // рудные гнёзда
  for (let i = 0; i < s.ores.length; i++) {
    const o = s.ores[i], c = ORE[o.k];
    C.fillStyle = c.d; R(o.x + K - 1, o.y - 1, 4, 4);
    C.fillStyle = c.c; R(o.x + K, o.y, 2, 2);
    C.fillStyle = c.d; R(o.x + K + 3, o.y + 2, 2, 2); R(o.x + K - 3, o.y + 1, 2, 1);
    C.fillStyle = c.c; R(o.x + K + 3, o.y + 2, 1, 1);
  }
  // колодец с лестницей
  const sx = s.shaftX + K, cy = s.ceil[(s.shaftX + K) >> 1];
  C.fillStyle = P.backDk; R(sx, 0, 14, cy + 2);
  C.fillStyle = P.edgeDk; R(sx - 1, 0, 1, cy); R(sx + 14, 0, 1, cy);
  C.fillStyle = P.woodDk; R(sx + 3, 0, 1, fl - 6); R(sx + 10, 0, 1, fl - 6);
  C.fillStyle = P.wood; for (let y = 4; y < fl - 6; y += 5) R(sx + 3, y, 8, 1);
  // крепь
  for (let i = 0; i < s.props.length; i++) {
    const x = s.props[i] + K, cy2 = s.ceil[x >> 1];
    C.fillStyle = P.woodDk; R(x - 1, cy2 - 2, 3, fl - cy2 - 4);
    C.fillStyle = P.wood; R(x, cy2 - 2, 2, fl - cy2 - 4);
    C.fillStyle = P.woodHi; R(x, cy2 - 2, 1, fl - cy2 - 4);
    C.fillStyle = P.woodDk; R(x - 5, cy2 - 3, 12, 4);
    C.fillStyle = P.wood; R(x - 5, cy2 - 3, 12, 3);
    C.fillStyle = P.woodDk;
    for (let k = 0; k < 5; k++) { R(x + 2 + k, cy2 + 1 + k, 1, 1); R(x - 1 - k, cy2 + 1 + k, 1, 1); }
  }
  // ящики, бочка, завал у забоя
  for (let i = 0; i < s.props.length; i++) {
    const x = s.props[i] + K + (i % 2 ? -16 : 8), y = s.railY - 8;
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
  for (let k = 0; k < 5; k++) { C.fillStyle = k % 2 ? P.face : P.faceDk; R(ex - 14 + k * 2, s.railY - 1 - k, 14 - k * 2, 1); }
  // рельсы
  C.fillStyle = P.woodDk;
  for (let x = 0; x < ex - 4; x += 5) R(x, s.railY + 1, 4, 2);
  C.fillStyle = P.rail; R(0, s.railY, ex - 4, 1);
  C.fillStyle = P.railDk; R(0, s.railY + 1, ex - 4, 1);
  C.fillStyle = P.wood; R(ex - 8, s.railY - 5, 2, 6); R(ex - 10, s.railY - 4, 6, 2);
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
// кирка: 0 — замах, 1 — середина, 2 — удар
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

export default {
  id: 'mine',
  title: 'Шахта',
  create(W, H, rand) {
    const floorY = 152;
    const s = {
      W, H, floorY, railY: 145, seed: F(rand() * 1e9), layers: {},
      shaftX: F(W * 0.1), endX: W - 22, bands: [], ceil: [], ores: [], props: [], lamps: [],
      miners: [], drips: [], dust: [], parts: pool(48), beamQ: -1,
      cart: { a: 0, b: 0, u: 0, dir: 1, pause: 1, load: 1, x: 0 }
    };
    let y = 12;
    for (let k = 0; k < 6; k++) { s.bands.push({ y, a: 2 + rand() * 4, f: 18 + rand() * 30, ph: rand() * 6 }); y += 22 + rand() * 12; }
    for (let x = 0; x < W + 16; x += 2) s.ceil.push(F(84 + 2.5 * Math.sin(x / 13) + 2 * Math.sin(x / 5.3 + 1) + rand() * 1.5));
    for (let x = s.shaftX + 50 + rand() * 30; x < s.endX - 30; x += 90 + rand() * 40) s.props.push(F(x));
    for (let i = 0; i < s.props.length; i++) s.lamps.push({ x: s.props[i] + 4, ph: rand() * 10 });
    s.lamps.push({ x: s.endX - 16, ph: rand() * 10, wall: 1 });
    // руда в породе над и под штреком
    for (let i = 0, n = F(W / 19); i < n; i++) {
      const x = F(6 + rand() * (W - 12));
      const above = rand() > 0.25;
      const yy = above ? F(10 + rand() * 62) : F(160 + rand() * 14);
      s.ores.push({ x, y: yy, k: F(rand() * 3), ph: rand() * 20 });
    }
    // шахтёры
    s.miners.push({ x: s.endX - 9, dir: 1, robe: P.robeA, robe2: P.robeA2, ph: 0, per: 0.95, fr: 0, mode: 0 });
    const bx = F(s.shaftX + (s.endX - s.shaftX) * 0.48);
    s.ores.push({ x: bx - 12, y: 138, k: 0, ph: 1 }, { x: bx - 15, y: 133, k: 0, ph: 7 });
    s.miners.push({ x: bx, dir: -1, robe: P.robeB, robe2: P.robeB2, ph: 0.4, per: 1.1, fr: 0, mode: 0 });
    s.miners.push({ x: s.shaftX + 24, dir: 1, robe: P.robeC, robe2: P.robeC2, ph: 0, mode: 1, from: s.shaftX + 22, to: bx - 26, pause: 1 });
    for (let i = 0; i < 3; i++) s.drips.push({ x: F(s.shaftX + 30 + rand() * (s.endX - s.shaftX - 50)), t: rand() * 3, period: 2.5 + rand() * 3.5, y: 0, vy: 0, falling: 0 });
    for (let i = 0; i < 26; i++) s.dust.push({ x: rand() * W, y: 90 + rand() * 56, v: 1 + rand() * 2, ph: rand() * 10 });
    const c = s.cart;
    c.a = s.shaftX + 24; c.b = s.endX - 34; c.x = c.a + (c.b - c.a) * 0.3; c.u = 0.3;
    return s;
  },

  draw(ctx, s, f) {
    C = ctx;
    const an = !!f.animations;
    const dt = an ? Math.min(0.1, f.dt || 0) : 0;
    const t = an ? f.t : 0;
    const W = s.W, H = s.H, dark = f.dark || 0;
    const mx = f.mx || 0;
    const o = Math.round(-mx * 3);
    const fl = s.floorY;

    cached(ctx, s, 'bg', W + 16, H, o - 8, 0, paintBg);

    // свет из колодца: днём тёплый, ночью лунный
    const bq = Math.round(dark * 8);
    if (s.beamQ !== bq) {
      s.beamQ = bq;
      const c = mix([255, 238, 196], [140, 165, 230], bq / 8);
      s.beam = rgba(c, 0.10 - 0.04 * bq / 8);
      s.beam2 = rgba(c, 0.06 - 0.025 * bq / 8);
      s.skyC = rgba(mix([150, 200, 240], [30, 34, 70], bq / 8), 1);
    }
    const sx = s.shaftX + o;
    C.fillStyle = s.skyC; R(sx + 1, 0, 12, 2);
    C.fillStyle = s.beam; R(sx + 1, 0, 12, fl - 6);
    C.fillStyle = s.beam2; R(sx - 3, s.ceil[(s.shaftX + 8) >> 1], 20, fl - 6 - s.ceil[(s.shaftX + 8) >> 1]);

    // фонари крепи
    for (let i = 0; i < s.lamps.length; i++) {
      const l = s.lamps[i], lx = l.x + o, ly = l.wall ? 112 : s.ceil[(l.x + 8) >> 1] + 9;
      const flk = 0.8 + 0.2 * Math.sin(t * 8 + l.ph) * Math.sin(t * 2.9 + l.ph);
      C.globalAlpha = flk;
      C.fillStyle = P.glowA; blob(lx, ly + 6, 34);
      C.fillStyle = P.glowB; blob(lx, ly + 3, 20);
      C.fillStyle = P.glowC; blob(lx, ly, 9);
      C.globalAlpha = 1;
      C.fillStyle = P.lantern;
      if (!l.wall) R(lx, ly - 7, 1, 5); else R(lx - 3, ly + 3, 4, 1);
      R(lx - 1, ly - 2, 3, 1); R(lx - 1, ly + 2, 3, 1);
      C.fillStyle = flk > 0.92 ? P.flame3 : P.flame; R(lx - 1, ly - 1, 3, 3);
    }

    // мерцание руды
    for (let i = 0; i < s.ores.length; i++) {
      const r = s.ores[i];
      const v = Math.sin(t * 0.8 + r.ph * 3.1);
      if (v < 0.93) continue;
      const x = r.x + o + 1, y = r.y;
      C.fillStyle = P.glint; R(x, y, 1, 1);
      if (v > 0.975) { C.fillStyle = P.glint2; R(x - 1, y, 3, 1); R(x, y - 1, 1, 3); R(x - 2, y, 1, 1); R(x + 2, y, 1, 1); R(x, y - 2, 1, 1); R(x, y + 2, 1, 1); }
    }

    // вагонетка
    const c = s.cart;
    if (an) {
      if (c.pause > 0) {
        c.pause -= dt;
      } else {
        const dist = c.b - c.a;
        c.u += dt * 24 / dist;
        if (c.u >= 1) {
          c.u = 0; c.pause = 2 + Math.random() * 2; c.dir = -c.dir;
          c.load = c.dir < 0 ? 1 : 0;
        }
      }
      const e = c.u * c.u * (3 - 2 * c.u);
      c.x = c.dir > 0 ? c.a + (c.b - c.a) * e : c.b - (c.b - c.a) * e;
    }
    {
      const x = F(c.x) + o, y = s.railY - 10;
      if (c.load) {
        C.fillStyle = '#5a4c40'; R(x + 2, y - 2, 12, 3);
        C.fillStyle = ORE[0].c; R(x + 4, y - 2, 2, 2);
        C.fillStyle = ORE[1].c; R(x + 8, y - 3, 2, 2);
        C.fillStyle = ORE[2].c; R(x + 11, y - 2, 2, 1);
      }
      C.fillStyle = P.cartDk; R(x, y, 16, 8);
      C.fillStyle = P.cart; R(x + 1, y + 1, 14, 6);
      C.fillStyle = P.cartHi; R(x, y, 16, 1);
      C.fillStyle = P.cartDk; R(x + 5, y + 1, 1, 6); R(x + 10, y + 1, 1, 6);
      const spin = F(c.x / 2) % 2;
      for (let k = 0; k < 2; k++) {
        const wx = x + 2 + k * 9;
        C.fillStyle = P.wheel; R(wx, y + 7, 4, 3);
        C.fillStyle = P.wheelHi; R(wx + 1 + spin, y + 8, 1, 1);
      }
    }

    // шахтёры
    for (let i = 0; i < s.miners.length; i++) {
      const m = s.miners[i];
      if (m.mode === 0) {
        const u = an ? ((t / m.per + m.ph) % 1) : 0.2;
        const fr = u < 0.5 ? 0 : u < 0.62 ? 1 : 2;
        const x = m.x + o;
        miner(x, fl + 1, m.dir, 0, m.robe, m.robe2);
        pick(x, fl + 1, m.dir, fr);
        if (an && fr === 2 && m.fr !== 2) {
          const hx = m.x + 8 * m.dir, hy = fl + 1 - 8;
          for (let k = 0; k < 4; k++) spawnP(s.parts, hx, hy, -m.dir * (10 + Math.random() * 30), -10 - Math.random() * 25, 0.25 + Math.random() * 0.25, k % 2 ? P.spark : P.spark2, 80);
          if (Math.random() < 0.6) spawnP(s.parts, hx, hy, -m.dir * (6 + Math.random() * 10), -8, 0.7, P.chip, 120);
        }
        m.fr = fr;
      } else {
        // носильщик с мешком
        let moving = false;
        if (an) {
          if (m.pause > 0) m.pause -= dt;
          else {
            m.x += m.dir * 11 * dt; moving = true;
            if (m.x > m.to) { m.x = m.to; m.dir = -1; m.pause = 1.5 + Math.random() * 2; }
            if (m.x < m.from) { m.x = m.from; m.dir = 1; m.pause = 2 + Math.random() * 2; }
          }
        }
        const x = F(m.x) + o;
        miner(x, fl + 1, m.dir, moving ? F((t * 6) % 2) : 0, m.robe, m.robe2);
        if (m.dir < 0) {
          C.fillStyle = P.sack; R(x + 1, fl - 13, 4, 5);
          C.fillStyle = P.sack2; R(x + 1, fl - 9, 4, 1);
        }
        C.fillStyle = P.handle; R(x - m.dir * 3, fl - 12, 1, 7);
        C.fillStyle = P.pick; R(x - m.dir * 3 - 1, fl - 13, 3, 1);
      }
    }

    // капли
    for (let i = 0; i < s.drips.length; i++) {
      const d = s.drips[i];
      const x = d.x + o, cy = s.ceil[(d.x + 8) >> 1];
      C.fillStyle = P.puddle; R(x - 3, fl - 2, 7, 1);
      if (an) {
        if (!d.falling) {
          d.t += dt;
          if (d.t > d.period) { d.falling = 1; d.y = cy; d.vy = 0; d.t = 0; }
        } else {
          d.vy += 220 * dt; d.y += d.vy * dt;
          if (d.y >= fl - 2) {
            d.falling = 0;
            for (let k = 0; k < 3; k++) spawnP(s.parts, d.x, fl - 3, (k - 1) * 14, -16 - Math.random() * 10, 0.35, P.dropHi, 160);
          }
        }
      }
      C.fillStyle = P.drop;
      if (d.falling) R(x, d.y, 1, 2);
      else if (d.t > d.period * 0.5) R(x, cy, 1, d.t > d.period * 0.8 ? 2 : 1);
    }

    // искры, крошка, брызги
    for (let i = 0; i < s.parts.length; i++) {
      const q = s.parts[i];
      if (!q.on) continue;
      if (an) {
        q.life += dt;
        if (q.life >= q.max) { q.on = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
        if (q.y > fl) { q.y = fl; q.vy = 0; q.vx *= 0.5; }
      }
      C.globalAlpha = Math.max(0, 1 - q.life / q.max);
      C.fillStyle = q.c; R(q.x + o, q.y, 1, 1);
    }
    // пыль
    C.globalAlpha = 1;
    C.fillStyle = P.dust;
    for (let i = 0; i < s.dust.length; i++) {
      const d = s.dust[i];
      d.x += d.v * dt; d.y += Math.sin(t * 0.5 + d.ph) * dt * 1.5;
      if (d.x > W + 4) d.x = -4;
      if (Math.sin(t * 0.7 + d.ph * 2) > -0.2) R(d.x + o, d.y, 1, 1);
    }

    for (let i = 0; i < 24; i++) { C.fillStyle = VIG[i]; R(i * 3, 0, 3, H); }
  }
};
