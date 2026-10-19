// Сцена «Тюрьма»: подземелье в разрезе — кирпичная кладка, ряд камер с решётками, факелы с дрожащим светом,
// стражник с фонарём ходит по коридору, один заключённый тайком копает (и прячет подкоп, когда стражник рядом),
// другой спит (Zz), третий меряет камеру шагами; бегает крыса, с потолка капает вода.

let C = null;
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const P = {
  mortar: '#1c1920', brick: ['#38343e', '#332f39', '#3d3943', '#36323c'], brickHi: '#45414c', brickDk: '#2a2730',
  moss: '#3d4a36', moss2: '#4a5a40', ceil: '#24212a', ceilDk: '#17151b',
  floor: '#3a3540', floorHi: '#46414c', floorDk: '#2b2730', lintel: '#55505a', lintelDk: '#3a3640',
  pillar: '#4f4a55', pillarDk: '#3b3741', pillarHi: '#5d5863', cellShade: 'rgba(8,6,12,0.4)', scratch: 'rgba(200,190,170,0.35)', straw: '#8a7440', straw2: '#6e5c34',
  bar: '#5f636d', barHi: '#80848e', barDk: '#3c3f47', lock: '#8c7a3c',
  skin: '#c79a78', skinDk: '#a57c5e', eye: '#1c1618', leg: '#3a2c24',
  rags: '#7d7468', rags2: '#655e54', ragsB: '#6a6a7a', ragsB2: '#555566', ragsR: '#7a5a50',
  gTunic: '#6a3a32', gTunic2: '#4f2a25', helm: '#8a8e98', helmDk: '#666a74', belt: '#3a2a1c', spearW: '#6a4a2c',
  lantern: '#3a3238', flame: '#ffcf5a', flame2: '#ff8a2a', flame3: '#fff0b0', torchStick: '#5a3f28',
  glowA: 'rgba(255,150,60,0.09)', glowB: 'rgba(255,165,75,0.11)', glowC: 'rgba(255,190,100,0.15)',
  bed: '#5a3f28', bedDk: '#402c1c', blanket: '#8a3b3b', blanket2: '#6e2e30', pillow: '#c8c4b8',
  dirt: '#5e4630', dirt2: '#4a3626', hole: '#120e10', cloth: '#6d6a72', cloth2: '#57545c',
  z: '#cfd6ea', drop: '#8fb4d8', dropHi: '#c7dcf0', puddle: 'rgba(120,160,200,0.25)',
  rat: '#5a5056', ratDk: '#3e363c', ratTail: '#a07c80', chain: '#4b4e56', chainHi: '#666a72',
  winFrame: '#2b2830', note: '#e8d8a0'
};
const VIG = [];
for (let i = 0; i < 8; i++) VIG.push('rgba(6,4,8,' + (0.1 * (8 - i) / 8).toFixed(3) + ')');

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

// мягкое пятно света: восьмиугольник из 5 полос без наложений
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
  for (let i = 0; i < n; i++) a.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '', sz: 1, g: 0, k: 0 });
  return a;
}
function spawnP(a, x, y, vx, vy, max, c, sz, g, k) {
  for (let i = 0; i < a.length; i++) {
    const q = a[i];
    if (q.on) continue;
    q.on = 1; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = 0; q.max = max; q.c = c; q.sz = sz; q.g = g; q.k = k || 0;
    return q;
  }
  return null;
}

function person(x, fy, dir, step, robe, robe2, hat, hat2) {
  const y = fy - 12;
  C.fillStyle = 'rgba(0,0,0,0.25)'; R(x - 3, fy, 7, 1);
  C.fillStyle = P.leg;
  R(x - 1 + (step ? 1 : 0), y + 10, 1, 2);
  R(x + 1 - (step ? 1 : 0), y + 10, 1, 2);
  C.fillStyle = robe; R(x - 2, y + 4, 5, 7);
  C.fillStyle = robe2; R(x - 2, y + 7, 5, 1);
  C.fillStyle = P.skin;
  R(x + (dir > 0 ? 2 : -2), y + 6 + (step ? 1 : 0), 1, 2);
  R(x - 1, y, 4, 4);
  C.fillStyle = P.eye; R(dir > 0 ? x + 2 : x - 1, y + 1, 1, 1);
  if (hat) {
    C.fillStyle = hat; R(x - 2, y - 1, 6, 2); R(x - 1, y - 2, 4, 1);
    if (hat2) { C.fillStyle = hat2; R(x - 2, y, 6, 1); }
  }
}

function lcg(seed) {
  let v = seed >>> 0;
  return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}

function paintBg(s) {
  const W = s.LW, rand = lcg(s.seed);
  // кладка
  C.fillStyle = P.mortar; R(0, 0, W, 180);
  for (let row = 0, y = 10; y < 150; row++, y += 5) {
    const off = row % 2 ? 4 : 0;
    for (let x = -off; x < W; x += 9) {
      const r = rand();
      C.fillStyle = P.brick[F(r * 4)];
      R(x, y, 8, 4);
      if (r > 0.8) { C.fillStyle = P.brickHi; R(x, y, 8, 1); }
      else if (r < 0.06) { C.fillStyle = P.brickDk; R(x + 2, y + 2, 3, 1); }
      if (r > 0.55 && r < 0.6 && y > 100) { C.fillStyle = P.moss; R(x, y + 3, 5, 1); C.fillStyle = P.moss2; R(x + 1, y + 4, 3, 1); }
    }
  }
  // потолок — тяжёлые блоки
  C.fillStyle = P.ceilDk; R(0, 0, W, 11);
  C.fillStyle = P.ceil;
  for (let x = 0; x < W; x += 17) R(x, 1, 16, 8);
  // пол коридора — плиты
  C.fillStyle = P.floorDk; R(0, 150, W, 30);
  for (let row = 0, y = 151; y < 180; row++, y += 7) {
    for (let x = row % 2 ? -7 : 0; x < W; x += 14) {
      C.fillStyle = rand() > 0.5 ? P.floor : P.floorHi; R(x, y, 13, 6);
    }
  }
  C.fillStyle = P.floorHi; R(0, 150, W, 1);
  // цепи с потолка
  for (let k = 0; k < s.chains.length; k++) {
    const c = s.chains[k];
    for (let y = 11; y < 11 + c.len; y += 3) { C.fillStyle = P.chain; R(c.x, y, 1, 2); C.fillStyle = P.chainHi; R(c.x - 1, y + 2, 3, 1); }
    C.fillStyle = P.chainHi; R(c.x - 2, 11 + c.len, 5, 2); R(c.x - 2, 13 + c.len, 1, 2); R(c.x + 2, 13 + c.len, 1, 2);
  }
  // окошко под потолком
  const wx = s.winX + 8, wy = 30;
  C.fillStyle = P.winFrame; R(wx - 2, wy - 2, 16, 15);
  C.fillStyle = '#0d0b10'; R(wx, wy, 12, 11);
}

export default {
  id: 'prison',
  title: 'Тюрьма',
  create(W, H, rand) {
    const n = W >= 380 ? 3 : 2;
    const pw = 12, left = 4, right = W - 4;
    const cw = F((right - left - (n + 1) * pw) / n);
    const s = {
      W, H, n, pw, cw, left, LW: W + 16, seed: F(rand() * 1e9), layers: {},
      cells: [], chains: [], drips: [], parts: pool(40), motes: [],
      winX: F(W * 0.5) - 6, beamQ: -1, beam: '', beam2: '',
      guard: { x: W * 0.3, dir: 1, v: 13, pause: 0, look: 0 },
      dig: { x: 0, prog: 0.35, mode: 0, ph: 0, lastF: 0 },
      sleeper: { zt: 0 },
      pacer: { x: 0, dir: 1, pause: 0 },
      rat: { x: -20, dir: 1, wait: 2, pause: 0, sniff: 0 }
    };
    for (let i = 0; i < n; i++) s.cells.push({ x0: left + pw + i * (cw + pw) });
    for (let i = 0; i < 3; i++) s.chains.push({ x: F(12 + rand() * (W - 24)) + 8, len: 8 + F(rand() * 14) });
    for (let i = 0; i < 3; i++) s.drips.push({ x: F(20 + rand() * (W - 40)), t: rand() * 3, period: 2.5 + rand() * 3, y: 0, vy: 0, falling: 0 });
    for (let i = 0; i < 10; i++) s.motes.push({ u: rand(), v: rand(), ph: rand() * 10 });
    const c0 = s.cells[0];
    s.dig.x = c0.x0 + 12;
    const cl = s.cells[n - 1];
    s.pacer.x = cl.x0 + F(cw / 2);
    return s;
  },

  draw(ctx, s, f) {
    C = ctx;
    const an = !!f.animations;
    const dt = an ? Math.min(0.1, f.dt || 0) : 0;
    const t = an ? f.t : 0;
    const W = s.W, H = s.H, dark = f.dark || 0;
    const mx = f.mx || 0;
    const px = (k) => Math.round(-mx * k);
    const ob = px(2) - 8, o = px(4);
    const top = 84, base = 150;

    cached(ctx, s, 'bg', s.LW, 180, ob, 0, paintBg);

    // луч из окна — днём тёплый, ночью лунный
    const bq = Math.round(dark * 8);
    if (s.beamQ !== bq) {
      s.beamQ = bq;
      const c = mix([255, 236, 190], [150, 176, 235], bq / 8);
      s.beam = rgba(c, 0.07 - 0.02 * bq / 8);
      s.beam2 = rgba(c, 0.5);
      s.winC = rgba(mix([200, 220, 240], [40, 50, 90], bq / 8), 1);
    }
    const wx = s.winX + ob + 8;
    C.fillStyle = s.winC; R(wx, 30, 12, 11);
    C.fillStyle = P.bar; R(wx + 3, 30, 1, 11); R(wx + 8, 30, 1, 11); R(wx, 35, 12, 1);
    C.fillStyle = s.beam;
    for (let y = 41; y < base; y += 2) R(wx + (y - 41) * 0.45, y, 12, 2);
    C.fillStyle = s.beam2;
    for (let i = 0; i < s.motes.length; i++) {
      const m = s.motes[i];
      const yy = 44 + ((m.v * 100 + t * 3) % 100);
      R(wx + (yy - 41) * 0.45 + m.u * 12 + Math.sin(t * 0.7 + m.ph) * 2, yy, 1, 1);
    }

    // перемычка над камерами
    C.fillStyle = P.lintelDk; R(0, top - 7, W, 7);
    C.fillStyle = P.lintel;
    for (let x = ((o % 15) + 15) % 15 - 15; x < W; x += 15) R(x, top - 6, 14, 5);

    const g = s.guard;
    // ---- камеры: тень, пол, обитатели ----
    for (let i = 0; i < s.n; i++) {
      const x0 = s.cells[i].x0 + o, cw = s.cw;
      C.fillStyle = P.cellShade; R(x0, top, cw, base - top);
      C.fillStyle = P.straw2; R(x0, base - 3, cw, 3);
      C.fillStyle = P.straw;
      for (let x = x0 + (i * 3) % 5; x < x0 + cw - 2; x += 5) R(x, base - 3, 2, 1);
      // зарубки на стене и кандалы
      C.fillStyle = P.scratch;
      const sx = x0 + cw - 22 - i * 7, sy = top + 22 + i * 4;
      for (let k = 0; k < 4 + i; k++) R(sx + k * 2, sy, 1, 5);
      R(sx - 1, sy + 2, 4 * 2 + 3, 1);
      C.fillStyle = P.chain; R(x0 + 8 + i * 9, top + 18, 1, 6); R(x0 + 14 + i * 9, top + 18, 1, 6);
      C.fillStyle = P.chainHi; R(x0 + 7 + i * 9, top + 24, 3, 2); R(x0 + 13 + i * 9, top + 24, 3, 2);
    }
    // камера 1 — копатель
    {
      const c = s.cells[0], x0 = c.x0 + o, cw = s.cw, d = s.dig;
      const near = Math.abs(g.x - (c.x0 + cw / 2)) < cw / 2 + 28;
      const holeX = x0 + 5, pileX = x0 + cw - 16;
      const digSpot = c.x0 + 14, hideSpot = c.x0 + F(cw / 2);
      const want = near ? hideSpot : digSpot;
      let moving = false;
      if (an && Math.abs(d.x - want) > 0.5) { d.x += Math.sign(want - d.x) * Math.min(Math.abs(want - d.x), 26 * dt); moving = true; }
      const digging = !near && Math.abs(d.x - digSpot) < 1;
      if (digging && an) {
        d.prog += dt / 55;
        if (d.prog > 1) d.prog = 0.25;
      }
      // яма и куча земли
      C.fillStyle = P.hole; R(holeX, base - 3, 7, 3);
      C.fillStyle = P.dirt2; R(holeX - 1, base - 3, 1, 1); R(holeX + 7, base - 3, 1, 1);
      const ph = 1 + F(d.prog * 7);
      for (let k = 0; k < ph; k++) {
        C.fillStyle = k % 2 ? P.dirt2 : P.dirt;
        R(pileX + k, base - 3 - k, 13 - k * 2, 1);
      }
      if (near) {
        // прячет: соломенный коврик на яме и тряпка на куче
        C.fillStyle = P.straw; R(holeX - 2, base - 4, 11, 2);
        C.fillStyle = P.straw2; R(holeX - 1, base - 3, 2, 1); R(holeX + 5, base - 3, 2, 1);
        for (let k = 0; k <= ph; k++) { C.fillStyle = k % 2 ? P.cloth2 : P.cloth; R(pileX - 1 + k, base - 3 - k, 15 - k * 2, 1); }
      }
      const fx = F(d.x) + o;
      const step = moving ? F((t * 8) % 2) : 0;
      person(fx, base - 2, digging ? -1 : 1, step, P.rags, P.rags2);
      if (digging) {
        const fr = F((t * 2.6) % 2);
        C.fillStyle = P.spearW;
        if (fr === 0) { R(fx - 3, base - 10, 1, 6); C.fillStyle = P.helmDk; R(fx - 4, base - 4, 2, 2); }
        else { R(fx - 2, base - 13, 1, 5); R(fx - 3, base - 14, 1, 1); C.fillStyle = P.helmDk; R(fx - 4, base - 16, 2, 2); }
        if (an && fr === 1 && d.lastF === 0) {
          for (let k = 0; k < 3; k++) spawnP(s.parts, fx - 3, base - 15, 18 + Math.random() * 14, -12 - Math.random() * 8, 0.9, k ? P.dirt : P.dirt2, 1, 70, 0);
        }
        d.lastF = fr;
      } else if (near) {
        // невинно насвистывает
        if (an && Math.random() < dt * 0.9) spawnP(s.parts, fx + 2, base - 14, 4, -8, 1.4, P.note, 1, 0, 2);
      }
    }
    // камера 2 — спящий
    {
      const c = s.cells[1], x0 = c.x0 + o, bx = x0 + 6, by = base - 9;
      C.fillStyle = P.bedDk; R(bx, by + 3, 22, 4); R(bx, by + 7, 2, 2); R(bx + 20, by + 7, 2, 2);
      C.fillStyle = P.bed; R(bx, by + 2, 22, 2); R(bx - 1, by - 2, 2, 9);
      C.fillStyle = P.pillow; R(bx + 1, by, 5, 2);
      C.fillStyle = P.skin; R(bx + 2, by - 3, 4, 4);
      C.fillStyle = P.eye; R(bx + 4, by - 2, 2, 1);
      const br = Math.sin(t * 1.6) > 0 ? 1 : 0;
      C.fillStyle = P.blanket; R(bx + 6, by - 2 - br, 15, 4 + br);
      C.fillStyle = P.blanket2; R(bx + 6, by + 1, 15, 1); R(bx + 12, by - 2 - br, 1, 3 + br);
      C.fillStyle = P.leg; R(bx + 21, by, 1, 2);
      const sl = s.sleeper;
      if (an) { sl.zt -= dt; if (sl.zt <= 0) { sl.zt = 1.3; spawnP(s.parts, bx + 4 - o, by - 7, 3, -6, 2.6, P.z, 1, 0, 1); } }
    }
    // камера 3 — ходит из угла в угол
    if (s.n > 2) {
      const c = s.cells[2], pc = s.pacer;
      const lo = c.x0 + 8, hi = c.x0 + s.cw - 8;
      if (an) {
        if (pc.pause > 0) pc.pause -= dt;
        else {
          pc.x += pc.dir * 9 * dt;
          if (pc.x > hi) { pc.x = hi; pc.dir = -1; pc.pause = 1 + Math.random() * 2; }
          if (pc.x < lo) { pc.x = lo; pc.dir = 1; pc.pause = 1 + Math.random() * 2; }
        }
      }
      // ведро и миска
      C.fillStyle = P.bedDk; R(c.x0 + o + s.cw - 9, base - 7, 5, 5);
      C.fillStyle = P.chain; R(c.x0 + o + s.cw - 9, base - 7, 5, 1);
      const step = an && pc.pause <= 0 ? F((t * 5) % 2) : 0;
      person(F(pc.x) + o, base - 2, pc.dir, step, P.ragsB, P.ragsB2);
    }

    // ---- решётки ----
    for (let i = 0; i < s.n; i++) {
      const x0 = s.cells[i].x0 + o, cw = s.cw;
      for (let x = x0 + 3; x < x0 + cw - 1; x += 7) {
        C.fillStyle = P.bar; R(x, top, 1, base - top);
        C.fillStyle = P.barDk; R(x + 1, top, 1, base - top);
      }
      C.fillStyle = P.barHi; R(x0, top + 6, cw, 1); R(x0, base - 12, cw, 1);
      C.fillStyle = P.barDk; R(x0, top + 7, cw, 1); R(x0, base - 11, cw, 1);
      const lx = x0 + cw - 10;
      C.fillStyle = P.lock; R(lx, top + 30, 3, 4);
      C.fillStyle = P.barDk; R(lx + 1, top + 32, 1, 1);
    }
    // ---- колонны с факелами ----
    for (let i = 0; i <= s.n; i++) {
      const x = s.left + i * (s.cw + s.pw) + o;
      C.fillStyle = P.pillarDk; R(x - (i === 0 ? 8 : 0), top - 7, s.pw + (i === 0 || i === s.n ? 8 : 0), base - top + 7);
      C.fillStyle = P.pillar;
      for (let y = top - 6; y < base; y += 6) R(x + 1 - (i === 0 ? 8 : 0), y, s.pw - 2 + (i === 0 || i === s.n ? 8 : 0), 5);
      C.fillStyle = P.pillarHi; R(x + 1, top - 6, 1, base - top + 6);
    }
    for (let i = 0; i <= s.n; i++) {
      const tx = s.left + i * (s.cw + s.pw) + F(s.pw / 2) + o, ty = 104;
      const fl = 0.72 + 0.28 * Math.sin(t * 10 + i * 2.1) * Math.sin(t * 3.7 + i);
      C.globalAlpha = fl;
      C.fillStyle = P.glowA; blob(tx, ty + 2, 32);
      C.fillStyle = P.glowB; blob(tx, ty + 1, 20);
      C.fillStyle = P.glowC; blob(tx, ty, 10);
      C.globalAlpha = 1;
      C.fillStyle = P.torchStick; R(tx, ty, 2, 7); R(tx - 1, ty + 6, 4, 1);
      C.fillStyle = P.barDk; R(tx - 1, ty, 4, 1);
      C.fillStyle = P.flame2; R(tx - 1, ty - 3, 4, 3); R(tx + (fl > 0.85 ? 1 : 0), ty - 5, 2, 2);
      C.fillStyle = P.flame; R(tx, ty - 3, 2, 2);
      if (fl > 0.8) { C.fillStyle = P.flame3; R(tx + (fl > 0.9 ? 1 : 0), ty - 6, 1, 1); }
    }

    // ---- крыса ----
    const rt = s.rat;
    if (an) {
      if (rt.wait > 0) {
        rt.wait -= dt;
        if (rt.wait <= 0) { rt.dir = Math.random() > 0.5 ? 1 : -1; rt.x = rt.dir > 0 ? -10 : W + 10; }
      } else if (rt.pause > 0) rt.pause -= dt;
      else {
        rt.x += rt.dir * 45 * dt;
        if (Math.random() < dt * 0.5) rt.pause = 0.4 + Math.random() * 0.9;
        if (rt.x < -14 || rt.x > W + 14) rt.wait = 5 + Math.random() * 8;
      }
    }
    if (rt.wait <= 0) {
      const x = F(rt.x) + o, y = base + 5, d = rt.dir;
      const hop = rt.pause <= 0 && an ? F((t * 14) % 2) : 0;
      C.fillStyle = P.ratTail; R(d > 0 ? x - 7 : x + 4, y + 1 + hop, 4, 1);
      C.fillStyle = P.rat; R(x - 3, y - 2 + hop, 7, 3);
      R(d > 0 ? x + 3 : x - 5, y - 1 + hop, 3, 2);
      C.fillStyle = P.ratDk; R(x - 2, y + 1, 1, 1); R(x + 2, y + 1, 1, 1);
      C.fillStyle = P.ratTail; R(d > 0 ? x + 6 : x - 6, y + (rt.pause > 0 && Math.sin(t * 20) > 0 ? -1 : 0), 1, 1);
      C.fillStyle = P.eye; R(d > 0 ? x + 4 : x - 4, y - 1 + hop, 1, 1);
    }

    // ---- стражник ----
    if (an) {
      if (g.pause > 0) g.pause -= dt;
      else {
        g.x += g.dir * g.v * dt;
        if (g.x > W - 14) { g.x = W - 14; g.dir = -1; g.pause = 1.5 + Math.random() * 1.5; }
        if (g.x < 14) { g.x = 14; g.dir = 1; g.pause = 1.5 + Math.random() * 1.5; }
        if (Math.random() < dt * 0.06) g.pause = 1 + Math.random() * 1.5;
      }
    }
    {
      const gx = F(g.x) + o, fy = base + 13, d = g.dir;
      const step = an && g.pause <= 0 ? F((t * 5) % 2) : 0;
      const lx = gx + d * 5, ly = fy - 8;
      const fl = 0.85 + 0.15 * Math.sin(t * 9);
      C.globalAlpha = fl;
      C.fillStyle = P.glowA; blob(lx, ly, 24);
      C.fillStyle = P.glowB; blob(lx, ly, 13);
      C.globalAlpha = 1;
      // копьё за спиной
      C.fillStyle = P.spearW; R(gx - d * 3, fy - 20, 1, 18);
      C.fillStyle = P.helm; R(gx - d * 3, fy - 23, 1, 3);
      person(gx, fy, d, step, P.gTunic, P.gTunic2, P.helm, P.helmDk);
      C.fillStyle = P.belt; R(gx - 2, fy - 6, 5, 1);
      C.fillStyle = P.lock; R(gx - d, fy - 6, 1, 1);
      // фонарь
      C.fillStyle = P.skin; R(gx + d * 3, fy - 7, 1, 1);
      C.fillStyle = P.lantern; R(lx - 1, ly - 2, 3, 1); R(lx - 1, ly + 2, 3, 1); R(lx, ly - 3, 1, 1);
      C.fillStyle = fl > 0.93 ? P.flame3 : P.flame; R(lx - 1, ly - 1, 3, 3);
    }

    // ---- капли ----
    for (let i = 0; i < s.drips.length; i++) {
      const dp = s.drips[i];
      const x = dp.x + o;
      const floorY = base + 10 + (i % 3) * 3;
      C.fillStyle = P.puddle; R(x - 3, floorY, 7, 1);
      if (an) {
        if (!dp.falling) {
          dp.t += dt;
          if (dp.t > dp.period) { dp.falling = 1; dp.y = 12; dp.vy = 0; dp.t = 0; }
        } else {
          dp.vy += 220 * dt; dp.y += dp.vy * dt;
          if (dp.y >= floorY) {
            dp.falling = 0;
            for (let k = 0; k < 3; k++) spawnP(s.parts, x, floorY - 1, (k - 1) * 14, -18 - Math.random() * 10, 0.35, P.dropHi, 1, 160, 0);
          }
        }
      }
      C.fillStyle = P.drop;
      if (dp.falling) { R(x, dp.y, 1, 2); }
      else if (dp.t > dp.period * 0.5) { R(x, 11, 1, dp.t > dp.period * 0.8 ? 2 : 1); }
    }

    // ---- частицы: земля, Zz, ноты, брызги ----
    for (let i = 0; i < s.parts.length; i++) {
      const q = s.parts[i];
      if (!q.on) continue;
      if (an) {
        q.life += dt;
        if (q.life >= q.max) { q.on = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
        if (q.k === 1) q.x += Math.sin(q.life * 3) * dt * 4;
      }
      C.globalAlpha = Math.max(0, 1 - q.life / q.max);
      C.fillStyle = q.c;
      const x = F(q.x) + (q.k === 1 ? o : 0), y = F(q.y);
      if (q.k === 1) {
        // Z
        R(x, y, 3, 1); R(x + 1, y + 1, 1, 1); R(x, y + 2, 3, 1);
      } else if (q.k === 2) {
        R(x, y + 2, 2, 2); R(x + 1, y - 1, 1, 3); R(x + 2, y - 1, 1, 1);
      } else R(x, y, q.sz, q.sz);
    }
    C.globalAlpha = 1;

    for (let i = 0; i < 8; i++) { C.fillStyle = VIG[i]; R(i * W / 24, 0, W / 24 + 1, H); }
  }
};
