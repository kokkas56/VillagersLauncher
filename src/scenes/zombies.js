// Сцена «Нашествие»: ночь, луна и звёзды, частокол с воротами и факелами справа, домики за стеной,
// зомби ковыляют волнами слева, стражник на вышке стреляет из лука, жители выглядывают из окон,
// изредка мягкая вспышка молнии. Только целочисленные fillRect, без картинок.

let C = null;
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// [ночь (dark=1), сумерки (dark=0)] — сцена всегда ночная, днём чуть светлее
const PAL = {
  skyTop: [[8, 10, 30], [30, 36, 82]],
  skyBot: [[34, 34, 70], [92, 80, 128]],
  cloud: [[26, 28, 54], [66, 66, 108]],
  far: [[24, 28, 54], [50, 56, 98]],
  near: [[18, 26, 30], [36, 52, 56]],
  grass: [[24, 38, 28], [44, 66, 46]],
  grassHi: [[32, 50, 34], [56, 84, 56]],
  path: [[40, 36, 36], [72, 64, 58]],
  pathHi: [[50, 46, 44], [86, 78, 70]],
  mound: [[28, 36, 30], [48, 60, 46]],
  log: [[72, 52, 34], [106, 78, 50]],
  log2: [[60, 43, 29], [90, 66, 43]],
  logGap: [[24, 17, 13], [38, 27, 21]],
  band: [[42, 40, 42], [64, 62, 64]],
  gate: [[54, 35, 22], [82, 55, 35]],
  gateDk: [[34, 22, 14], [54, 37, 25]],
  iron: [[62, 64, 70], [94, 96, 104]],
  wallA: [[74, 66, 64], [124, 110, 96]],
  wallB: [[60, 54, 54], [104, 92, 84]],
  roof: [[56, 30, 32], [96, 54, 48]],
  roofDk: [[40, 22, 26], [72, 40, 40]],
  winDk: [[22, 24, 34], [40, 44, 60]],
  door: [[44, 30, 22], [70, 48, 32]],
  tomb: [[56, 58, 66], [94, 98, 108]],
  tombDk: [[38, 40, 48], [66, 70, 80]],
  twig: [[30, 26, 28], [52, 46, 46]],
  skin: [[160, 124, 100], [214, 170, 136]],
  eye: [[16, 12, 14], [28, 22, 22]],
  leg: [[40, 30, 26], [62, 46, 36]],
  zSkin: [[62, 92, 52], [95, 138, 78]],
  zSkin2: [[50, 74, 42], [75, 110, 61]],
  zShirt: [[46, 70, 102], [70, 104, 146]],
  zShirt2: [[34, 52, 78], [52, 80, 114]],
  zPants: [[38, 38, 58], [60, 58, 88]],
  gRobe: [[56, 66, 56], [88, 102, 84]],
  gRobe2: [[42, 50, 42], [68, 80, 64]],
  helm: [[96, 100, 110], [146, 150, 160]],
  bow: [[96, 64, 32], [136, 92, 50]],
  string: [[150, 150, 150], [200, 200, 200]],
  arrow: [[120, 92, 60], [160, 124, 84]],
  tip: [[170, 174, 184], [210, 214, 222]],
  r0: [[96, 60, 40], [140, 92, 60]],
  r1: [[56, 70, 110], [86, 104, 150]],
  r2: [[110, 46, 50], [156, 70, 70]],
  r3: [[70, 96, 60], [100, 132, 84]]
};
const ROBES = ['r0', 'r1', 'r2', 'r3'];
const LIGHT = {
  win: '#ffc55a', win2: '#ffe08e', glow: 'rgba(255,170,70,0.09)', glow2: 'rgba(255,170,70,0.07)',
  flame: '#ff8a2a', flame2: '#ffd85a', flame3: '#fff2b0', moon: '#eaeefa', moonDk: '#bfc6dc',
  moonGlow: 'rgba(210,222,255,0.045)', star: '#fffbe6', star2: 'rgba(255,250,230,0.55)', star3: 'rgba(255,250,230,0.25)',
  smoke: '#9a9aa4', smoke2: '#c8c8d0', bolt: '#eef2ff', boltGlow: 'rgba(200,215,255,0.35)', flash: '#c8d4ff', black: '#000'
};

const VIG = [];
for (let i = 0; i < 24; i++) VIG.push('rgba(8,6,10,' + (0.1 * (24 - i) / 24).toFixed(3) + ')');

function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch (e) { /* нет офскрина — рисуем напрямую */ }
  return null;
}
// слой, перерисовываемый только при смене версии (палитры)
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
function paintBg(s) {
  const W = s.W + 16, H = s.H, p = s.p;
  for (let i = 0; i < 12; i++) { C.fillStyle = s.sky[i]; R(0, i * 11, W, 11); }
  C.fillStyle = s.sky[11]; R(0, 132, W, H - 132);
  C.fillStyle = p.far;
  for (let i = 0; i < s.far.length; i++) R(i * 3, s.far[i] - 2, 3, H - s.far[i] + 2);
  C.fillStyle = p.near;
  for (let i = 0; i < s.near.length; i++) R(i * 3 + 2, s.near[i], 3, H - s.near[i]);
}

function buildPal(s, dark) {
  const q = Math.round(dark * 16);
  if (s.pq === q) return s.p;
  s.pq = q;
  const t = q / 16;
  const p = s.p;
  for (const k in PAL) p[k] = css(mix(PAL[k][1], PAL[k][0], t));
  const top = mix(PAL.skyTop[1], PAL.skyTop[0], t), bot = mix(PAL.skyBot[1], PAL.skyBot[0], t);
  for (let i = 0; i < 12; i++) s.sky[i] = css(mix(top, bot, i / 11));
  return p;
}

function pool(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '', sz: 1, g: 0 });
  return a;
}
function spawnP(a, x, y, vx, vy, max, c, sz, g) {
  for (let i = 0; i < a.length; i++) {
    const q = a[i];
    if (q.on) continue;
    q.on = 1; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = 0; q.max = max; q.c = c; q.sz = sz; q.g = g;
    return q;
  }
  return null;
}

function villager(p, x, fy, dir, step, robe, hat) {
  const y = fy - 12;
  C.fillStyle = p.leg;
  R(x - 1 + (step ? 1 : 0), y + 10, 1, 2);
  R(x + 1 - (step ? 1 : 0), y + 10, 1, 2);
  C.fillStyle = p[robe];
  R(x - 2, y + 4, 5, 7);
  C.fillStyle = p.skin;
  R(x + (dir > 0 ? 2 : -2), y + 6 + (step ? 1 : 0), 1, 2);
  R(x - 1, y, 4, 4);
  C.fillStyle = p.eye;
  R(dir > 0 ? x + 2 : x - 1, y + 1, 1, 1);
  if (hat) {
    C.fillStyle = p[hat];
    R(x - 2, y - 1, 6, 1);
    R(x - 1, y - 2, 4, 1);
  }
}

function zombie(p, z, x, t) {
  const fy = z.fy, y = fy - 12, d = z.dir;
  const walking = z.state === 0;
  const step = walking ? F((t * 3 + z.ph) % 2) : 0;
  const bob = walking ? (step ? 1 : 0) : 0;
  C.fillStyle = 'rgba(0,0,0,0.25)';
  R(x - 3, fy, 7, 1);
  C.fillStyle = p.zPants;
  R(x - 1 + step, y + 10, 1, 2);
  R(x + 1 - step, y + 10, 1, 2);
  R(x - 2, y + 9, 5, 1);
  // рваная рубашка
  C.fillStyle = p.zShirt;
  R(x - 2, y + 4 + bob, 5, 5);
  C.fillStyle = p.zShirt2;
  R(x - 2, y + 8 + bob, 1, 1);
  R(x + 1, y + 8 + bob, 1, 1);
  C.fillStyle = p.zSkin2;
  R(x, y + 6 + bob, 1, 1);
  R(x + 2, y + 8 + bob, 1, 1);
  // руки вперёд (или колотит в стену)
  C.fillStyle = p.zSkin;
  const ax = d > 0 ? x + 3 : x - 5;
  if (z.state === 1) {
    const up = Math.sin(t * 7 + z.ph) > 0 ? 1 : 0;
    R(ax, y + 4 + bob - up * 2, 3, 1);
    R(ax, y + 6 + bob - (1 - up) * 2, 3, 1);
  } else {
    R(ax, y + 5 + bob, 3, 1);
    R(ax, y + 6 + bob, 2, 1);
  }
  // голова
  R(x - 1, y + bob, 4, 4);
  C.fillStyle = p.zSkin2;
  R(x - 1, y + 3 + bob, 4, 1);
  R(d > 0 ? x - 1 : x + 2, y + bob, 1, 2);
  C.fillStyle = p.eye;
  R(d > 0 ? x + 2 : x - 1, y + 1 + bob, 1, 1);
}

function spawnZombie(s, x, rand) {
  for (let i = 0; i < s.zs.length; i++) {
    const z = s.zs[i];
    if (z.on) continue;
    z.on = 1; z.x = x; z.fy = s.ground + 1 + F(rand() * 9);
    z.v = 6 + rand() * 4; z.hp = 2 + F(rand() * 2); z.kb = 0; z.ph = rand() * 10; z.state = 0; z.dir = 1;
    z.stop = s.wallX - 5 - (i % 3) * 6 - F(rand() * 3);
    return z;
  }
  return null;
}

export default {
  id: 'zombies',
  title: 'Нашествие',
  create(W, H, rand) {
    const ground = 146;
    const wallX = Math.round(W - Math.max(100, W * 0.34));
    const s = {
      W, H, ground, wallX, moundTop: 98, wallTop: 106,
      p: {}, pq: -1, sky: new Array(12).fill('#000'), layers: {},
      stars: [], far: [], near: [], deadTrees: [], tombs: [], houses: [], moon: [],
      clouds: [], zs: [], order: [], arrows: [], parts: pool(56), runners: [],
      gateX: wallX + Math.max(22, Math.round((W - wallX) * 0.32)), gateW: 20,
      guard: { x: wallX + 5, fy: 94, cd: 1.2, pull: 0, target: -1 },
      wave: 6, lt: 12 + rand() * 20, flash: 0, bolt: []
    };
    for (let i = 0, n = F(W / 4); i < n; i++) s.stars.push({ x: rand() * W, y: rand() * 86, sp: 0.6 + rand() * 2, ph: rand() * 10, big: rand() > 0.92, vis: rand() });
    for (let x = 0; x <= W + 30; x += 3) s.far.push(112 - 10 * Math.sin(x / 41) - 7 * Math.sin(x / 17 + 1) - rand() * 2);
    for (let x = 0; x <= W + 30; x += 3) s.near.push(128 - 5 * Math.sin(x / 29 + 2) - 3 * Math.sin(x / 11) - rand());
    for (let r = -14; r <= 14; r++) s.moon.push(Math.round(Math.sqrt(Math.max(0, 196 - r * r))));
    s.moonIn = [];
    for (let r = -7; r <= 7; r++) s.moonIn.push(Math.round(Math.sqrt(49 - r * r)));
    for (let i = 0; i < 3; i++) s.clouds.push({ x: rand() * W, y: 16 + rand() * 40, w: 30 + rand() * 40, v: 1 + rand() * 1.5 });
    for (let x = 14 + rand() * 30; x < wallX - 30; x += 40 + rand() * 60) {
      if (rand() > 0.45) s.tombs.push({ x: F(x), h: 5 + F(rand() * 3), cross: rand() > 0.5 });
      else s.deadTrees.push({ x: F(x), h: 14 + F(rand() * 10), dir: rand() > 0.5 ? 1 : -1 });
    }
    // домики на холме за стеной
    let hx = wallX + 18;
    while (hx < W - 8) {
      const w = 18 + F(rand() * 8), h = 14 + F(rand() * 7);
      const wins = [];
      const nw = w > 22 ? 2 : 1;
      for (let k = 0; k < nw; k++) wins.push({ dx: nw === 1 ? 3 : (k === 0 ? 3 : w - 8), peek: 0, side: rand() > 0.5 ? 1 : -1 });
      s.houses.push({ x: F(hx), w, h, wins, fl: rand() * 10, chimney: rand() > 0.4 });
      hx += w + 8 + rand() * 14;
    }
    for (let i = 0; i < 12; i++) { s.zs.push({ on: 0, x: 0, fy: 0, v: 0, hp: 0, kb: 0, ph: 0, state: 0, dir: 1, stop: 0 }); s.order.push(i); }
    for (let i = 0; i < 6; i++) s.arrows.push({ on: 0, x: 0, y: 0, vx: 0, vy: 0, stuck: 0, life: 0, dx: 0, dy: 0 });
    for (let i = 0; i < 9; i++) s.bolt.push([0, 0]);
    const nr = s.houses.length > 1 ? 2 : 1;
    for (let i = 0; i < nr; i++) {
      const h = s.houses[i % s.houses.length], h2 = s.houses[(i + 1) % s.houses.length];
      const x0 = h.x + F(h.w / 2), tg = h2.x + F(h2.w / 2) + (h2 === h ? 14 : 0);
      s.runners.push({ x: x0 + (tg > x0 ? 4 : -4), dir: tg > x0 ? 1 : -1, v: 14 + rand() * 8, hidden: i * 2.5, target: tg, robe: ROBES[F(rand() * 4)], hat: rand() > 0.5 ? ROBES[F(rand() * 4)] : null, ph: rand() * 10 });
    }
    // первая волна уже в поле — чтобы и статичный кадр был живым
    for (let i = 0; i < 4; i++) spawnZombie(s, 20 + i * (wallX - 50) / 4 + rand() * 10, rand);
    return s;
  },

  draw(ctx, s, f) {
    C = ctx;
    const an = !!f.animations;
    const dt = an ? Math.min(0.1, f.dt || 0) : 0;
    const t = an ? f.t : 0;
    const W = s.W, H = s.H, dark = f.dark || 0;
    const p = buildPal(s, dark);
    const mx = f.mx || 0;
    const px = (k) => Math.round(-mx * k);
    const ground = s.ground, wallX = s.wallX;

    // небо и холмы — кэшированный слой
    cached(ctx, s, 'bg', s.pq, W + 16, H, px(4) - 8, 0, paintBg);
    // звёзды
    const o1 = px(1);
    const vis = 0.45 + 0.55 * dark;
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (st.vis > vis) continue;
      const b = Math.sin(t * st.sp + st.ph);
      C.fillStyle = b > 0.55 ? LIGHT.star : b > -0.4 ? LIGHT.star2 : LIGHT.star3;
      R(((st.x + o1) % W + W) % W, st.y, st.big ? 2 : 1, 1);
    }
    // луна
    const mX = F(W * 0.2) + px(2), mY = 30;
    C.fillStyle = LIGHT.moonGlow;
    for (let r = -14; r <= 14; r++) { const w = s.moon[r + 14]; R(mX - w, mY + r, w * 2 + 1, 1); }
    for (let r = -10; r <= 10; r++) { const w = s.moon[r + 14] - 4; if (w > 0) R(mX - w, mY + r, w * 2 + 1, 1); }
    C.fillStyle = LIGHT.moon;
    for (let r = -7; r <= 7; r++) { const w = s.moonIn[r + 7]; R(mX - w, mY + r, w * 2 + 1, 1); }
    C.fillStyle = LIGHT.moonDk;
    R(mX - 3, mY - 3, 3, 2); R(mX + 2, mY + 1, 2, 2); R(mX - 1, mY + 4, 2, 1);
    // облака
    C.fillStyle = p.cloud;
    for (let i = 0; i < s.clouds.length; i++) {
      const c = s.clouds[i];
      c.x += c.v * dt;
      if (c.x > W + 10) c.x = -c.w - 10;
      const cx = c.x + px(2);
      R(cx, c.y, c.w, 3);
      R(cx + 6, c.y - 2, c.w * 0.5, 2);
    }

    // ---- передний план (смещение o) ----
    const o = px(8);
    C.fillStyle = p.grass;
    R(0, ground - 4, W, H - ground + 4);
    C.fillStyle = p.grassHi;
    for (let x = ((o % 7) + 7) % 7; x < W; x += 7) R(x, ground - 4, 3, 1);
    C.fillStyle = p.path;
    R(0, ground + 12, W, 6);
    C.fillStyle = p.pathHi;
    for (let x = ((o % 11) + 11) % 11; x < W; x += 11) R(x, ground + 13, 3, 1);
    // могилки и сухие деревья
    for (let i = 0; i < s.tombs.length; i++) {
      const tb = s.tombs[i], x = tb.x + o, y = ground - 4;
      if (tb.cross) {
        C.fillStyle = p.tombDk; R(x + 1, y - tb.h - 1, 1, tb.h + 1); R(x, y - tb.h + 1, 3, 1);
      } else {
        C.fillStyle = p.tomb; R(x, y - tb.h, 4, tb.h); R(x + 1, y - tb.h - 1, 2, 1);
        C.fillStyle = p.tombDk; R(x + 1, y - tb.h + 2, 2, 1);
      }
    }
    C.fillStyle = p.twig;
    for (let i = 0; i < s.deadTrees.length; i++) {
      const d = s.deadTrees[i], x = d.x + o, y = ground - 4;
      R(x, y - d.h, 2, d.h);
      R(x + d.dir * 2, y - d.h + 3, 3, 1); R(x + d.dir * 4, y - d.h + 1, 1, 2);
      R(x - d.dir * 3, y - d.h + 6, 3, 1); R(x - d.dir * 3, y - d.h + 4, 1, 2);
      R(x + d.dir, y - d.h - 2, 1, 2);
    }

    // холм за стеной и дома
    const mt = s.moundTop;
    C.fillStyle = p.mound;
    R(wallX - 2 + o, mt + 2, W - wallX + 12, ground - mt);
    R(wallX + 4 + o, mt, W - wallX + 6, 2);
    for (let i = 0; i < s.houses.length; i++) {
      const h = s.houses[i], x = h.x + o, y = mt - h.h;
      C.fillStyle = p.wallA; R(x, y, h.w, h.h);
      C.fillStyle = p.wallB; for (let yy = y + 4; yy < mt; yy += 4) R(x, yy, h.w, 1);
      const rh = F(h.w / 2.4);
      for (let k = 0; k < rh; k++) {
        const ins = F(k * (h.w / 2 + 2) / rh);
        C.fillStyle = k % 3 === 0 ? p.roofDk : p.roof;
        R(x - 3 + ins, y - k, h.w + 6 - ins * 2, 1);
      }
      if (h.chimney) { C.fillStyle = p.band; R(x + h.w - 6, y - rh + 2, 3, rh - 2); }
      C.fillStyle = p.door; R(x + F(h.w / 2) - 2, mt - 7, 4, 7);
      const fl = 0.85 + 0.15 * Math.sin(t * 6 + h.fl);
      for (let k = 0; k < h.wins.length; k++) {
        const w = h.wins[k], wx = x + w.dx, wy = y + 4;
        if (an) {
          if (w.peek > 0) w.peek -= dt;
          else if (Math.random() < dt * 0.06) w.peek = 2 + Math.random() * 3;
        }
        C.globalAlpha = fl;
        C.fillStyle = LIGHT.glow; R(wx - 3, wy - 3, 11, 11);
        C.globalAlpha = 1;
        C.fillStyle = fl > 0.9 ? LIGHT.win2 : LIGHT.win; R(wx, wy, 5, 5);
        if (w.peek > 0) {
          // житель выглядывает: голова, сдвигается из-за рамы
          const sh = w.peek > 0.6 ? (Math.sin(t * 1.5 + k) > 0 ? 1 : 0) : 0;
          C.fillStyle = p.skin; R(wx + 1 + sh, wy + 1, 3, 4);
          C.fillStyle = p.eye; R(wx + 1 + sh + (w.side > 0 ? 2 : 0), wy + 2, 1, 1);
        }
        C.fillStyle = p.gateDk; R(wx + 2, wy, 1, 5);
      }
    }
    // бегающие жители
    let threat = 0;
    for (let i = 0; i < s.zs.length; i++) if (s.zs[i].on && s.zs[i].x > wallX - 60) threat++;
    for (let i = 0; i < s.runners.length; i++) {
      const r = s.runners[i];
      if (r.hidden > 0) {
        r.hidden -= dt;
        if (r.hidden <= 0) {
          const h = s.houses[F(Math.random() * s.houses.length)];
          r.x = h.x + F(h.w / 2);
          const h2 = s.houses[F(Math.random() * s.houses.length)];
          r.target = h2.x + F(h2.w / 2) + (h2 === h ? 14 : 0);
          r.dir = r.target > r.x ? 1 : -1;
        }
        continue;
      }
      const sp = r.v * (threat > 1 ? 1.4 : 1);
      r.x += r.dir * sp * dt;
      if ((r.dir > 0 && r.x >= r.target) || (r.dir < 0 && r.x <= r.target)) r.hidden = 1.5 + Math.random() * 4;
      if (an && r.x > W + 6) r.hidden = 1;
      const step = an ? F((t * 10 + r.ph) % 2) : 0;
      villager(p, F(r.x) + o, mt, r.dir, step, r.robe, r.hat);
    }

    // частокол
    const wt = s.wallTop;
    for (let x = wallX, i = 0; x < W + 12; x += 4, i++) {
      const tp = wt + (i % 3 === 1 ? 1 : i % 3 === 2 ? -1 : 0);
      C.fillStyle = p.logGap; R(x + o + 3, tp + 2, 1, ground + 2 - tp - 2);
      C.fillStyle = i % 2 ? p.log : p.log2; R(x + o, tp + 2, 3, ground + 2 - tp - 2);
      R(x + o + 1, tp, 1, 2);
    }
    C.fillStyle = p.band;
    R(wallX + o, wt + 8, W - wallX + 12, 2);
    R(wallX + o, ground - 10, W - wallX + 12, 2);
    // ворота
    const gx = s.gateX + o, gw = s.gateW, gtop = 118;
    C.fillStyle = p.logGap; R(gx - 2, gtop - 2, gw + 4, ground + 2 - gtop + 2);
    C.fillStyle = p.gate; R(gx, gtop + 2, gw, ground - gtop);
    R(gx + 2, gtop, gw - 4, 2); R(gx + 4, gtop - 1, gw - 8, 1);
    C.fillStyle = p.gateDk;
    for (let x = gx + 3; x < gx + gw; x += 4) R(x, gtop + 1, 1, ground + 2 - gtop - 1);
    R(gx + F(gw / 2), gtop, 1, ground + 2 - gtop);
    C.fillStyle = p.iron; R(gx, gtop + 7, gw, 1); R(gx, ground - 6, gw, 1);
    R(gx + F(gw / 2) - 2, gtop + 16, 1, 2); R(gx + F(gw / 2) + 2, gtop + 16, 1, 2);
    // факелы у ворот
    for (let k = 0; k < 2; k++) {
      const tx = k === 0 ? gx - 5 : gx + gw + 4, ty = gtop + 2;
      const fl = 0.75 + 0.25 * Math.sin(t * 11 + k * 3) * Math.sin(t * 4.3 + k);
      C.globalAlpha = fl;
      C.fillStyle = LIGHT.glow; R(tx - 14, ty - 14, 29, 30);
      C.fillStyle = LIGHT.glow2; R(tx - 8, ty - 8, 17, 18);
      C.globalAlpha = 1;
      C.fillStyle = p.log2; R(tx, ty, 1, 5);
      C.fillStyle = LIGHT.flame; R(tx - (fl > 0.85 ? 1 : 0), ty - 3, 2, 3);
      C.fillStyle = LIGHT.flame2; R(tx, ty - 2, 1, 2);
      if (fl > 0.9) { C.fillStyle = LIGHT.flame3; R(tx, ty - 4, 1, 1); }
    }

    // зомби: волны
    if (an) {
      s.wave -= dt;
      let alive = 0;
      for (let i = 0; i < s.zs.length; i++) if (s.zs[i].on) alive++;
      if (s.wave <= 0 && alive < 6) {
        const n = 2 + F(Math.random() * 3);
        for (let k = 0; k < n; k++) spawnZombie(s, -8 - k * (12 + Math.random() * 10), Math.random);
        s.wave = 9 + Math.random() * 7;
      }
    }
    for (let i = 0; i < s.zs.length; i++) {
      const z = s.zs[i];
      if (!z.on || !an) continue;
      if (z.kb < 0) {
        z.x += z.kb * dt;
        z.kb = Math.min(0, z.kb + 70 * dt);
        z.state = 0;
      } else if (z.x < z.stop) {
        z.x += z.v * (0.55 + 0.45 * Math.sin(t * 3 + z.ph)) * dt;
        z.state = 0;
      } else z.state = 1;
    }
    // порядок отрисовки по глубине (вставками, без аллокаций)
    const ord = s.order;
    for (let i = 1; i < ord.length; i++) {
      const v = ord[i]; let j = i - 1;
      while (j >= 0 && s.zs[ord[j]].fy > s.zs[v].fy) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = v;
    }
    for (let i = 0; i < ord.length; i++) {
      const z = s.zs[ord[i]];
      if (z.on) zombie(p, z, F(z.x) + o, t);
    }

    // вышка и стражник
    const tx0 = wallX - 3 + o, ty = s.guard.fy;
    C.fillStyle = p.log2;
    R(tx0, ty, 2, ground + 2 - ty); R(tx0 + 13, ty, 2, ground + 2 - ty);
    C.fillStyle = p.logGap;
    for (let k = 0; k < 13; k++) { R(tx0 + 1 + k, ty + 8 + k * 2, 1, 2); R(tx0 + 13 - k, ty + 8 + k * 2, 1, 2); }
    const g = s.guard;
    if (an) {
      g.cd -= dt;
      if (g.pull > 0) {
        g.pull -= dt;
        if (g.pull <= 0) {
          const z = g.target >= 0 ? s.zs[g.target] : null;
          if (z && z.on) {
            for (let k = 0; k < s.arrows.length; k++) {
              const a = s.arrows[k];
              if (a.on) continue;
              const sx = g.x - 5, sy = ty - 7;
              const T = Math.max(0.5, Math.min(1.4, (sx - z.x) / 110));
              const tx = z.x + (z.state === 0 && z.kb >= 0 ? z.v * 0.8 * T : 0), tyy = z.fy - 7;
              a.on = 1; a.stuck = 0; a.life = 0; a.x = sx; a.y = sy;
              a.vx = (tx - sx) / T; a.vy = (tyy - sy) / T - 0.5 * 70 * T;
              break;
            }
          }
          g.cd = 1.0 + Math.random() * 0.9;
        }
      } else if (g.cd <= 0) {
        let best = -1, bx = 6;
        for (let i = 0; i < s.zs.length; i++) { const z = s.zs[i]; if (z.on && z.x > bx) { bx = z.x; best = i; } }
        if (best >= 0) { g.target = best; g.pull = 0.45; } else g.cd = 0.5;
      }
    }
    villager(p, g.x + o, ty, -1, 0, 'gRobe', 'helm');
    C.fillStyle = p.helm; R(g.x + o - 1, ty - 13, 4, 2);
    // лук
    const pulled = g.pull > 0 ? 1 : 0;
    C.fillStyle = p.bow;
    R(g.x + o - 5, ty - 11, 1, 1); R(g.x + o - 6, ty - 10, 1, 5); R(g.x + o - 5, ty - 5, 1, 1);
    C.fillStyle = p.string; R(g.x + o - 5 + pulled * 2, ty - 10, 1, 5);
    C.fillStyle = p.skin; R(g.x + o - 4, ty - 8, 2, 1);
    // помост с перилами (поверх ног)
    C.fillStyle = p.log; R(tx0 - 1, ty, 17, 3);
    C.fillStyle = p.logGap; R(tx0 - 1, ty + 3, 17, 1);
    C.fillStyle = p.log2; R(tx0 - 1, ty - 4, 1, 4); R(tx0 + 15, ty - 4, 1, 4); R(tx0 - 1, ty - 4, 17, 1);

    // стрелы
    for (let k = 0; k < s.arrows.length; k++) {
      const a = s.arrows[k];
      if (!a.on) continue;
      if (an) {
        a.life += dt;
        if (!a.stuck) {
          a.x += a.vx * dt; a.vy += 70 * dt; a.y += a.vy * dt;
          const m = Math.hypot(a.vx, a.vy) || 1;
          a.dx = a.vx / m; a.dy = a.vy / m;
          for (let i = 0; i < s.zs.length; i++) {
            const z = s.zs[i];
            if (!z.on || Math.abs(a.x - z.x) > 3 || a.y < z.fy - 13 || a.y > z.fy) continue;
            a.on = 0; z.hp--; z.kb = -30;
            for (let q = 0; q < 3; q++) spawnP(s.parts, z.x, z.fy - 7, -10 - Math.random() * 20, -15 - Math.random() * 15, 0.5, p.zSkin2, 1, 60);
            if (z.hp <= 0) {
              z.on = 0;
              for (let q = 0; q < 10; q++) {
                const an2 = q / 10 * Math.PI * 2;
                spawnP(s.parts, z.x, z.fy - 6, Math.cos(an2) * (10 + Math.random() * 10), Math.sin(an2) * 8 - 6, 0.6 + Math.random() * 0.5, q % 3 ? LIGHT.smoke : LIGHT.smoke2, 2, -10);
              }
              spawnP(s.parts, z.x, z.fy - 8, 0, -10, 0.9, p.zShirt, 1, 40);
            }
            break;
          }
          if (a.on && a.y >= ground + 4) { a.stuck = 1; a.life = 0; }
          if (a.x < -10) a.on = 0;
        } else if (a.life > 3) a.on = 0;
      }
      if (!a.on) continue;
      const ax = F(a.x) + o, ay = F(a.y);
      C.fillStyle = p.tip; R(ax, ay, 1, 1);
      C.fillStyle = p.arrow;
      R(ax - Math.round(a.dx), ay - Math.round(a.dy), 1, 1);
      R(ax - Math.round(a.dx * 2), ay - Math.round(a.dy * 2), 1, 1);
    }
    // частицы
    for (let i = 0; i < s.parts.length; i++) {
      const q = s.parts[i];
      if (!q.on) continue;
      if (an) {
        q.life += dt;
        if (q.life >= q.max) { q.on = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.vx *= 1 - dt * 2;
      }
      C.globalAlpha = Math.max(0, 1 - q.life / q.max);
      C.fillStyle = q.c;
      R(q.x + o, q.y, q.sz, q.sz);
    }
    C.globalAlpha = 1;

    // молния — редкая и мягкая
    if (an) {
      s.lt -= dt;
      if (s.lt <= 0) {
        s.lt = 18 + Math.random() * 30;
        s.flash = 1;
        let bx = 20 + Math.random() * Math.max(20, wallX - 60);
        for (let k = 0; k < s.bolt.length; k++) {
          s.bolt[k][0] = bx; s.bolt[k][1] = k * 13;
          bx += (Math.random() - 0.5) * 12;
        }
      }
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.5);
    }
    if (s.flash > 0) {
      if (s.flash > 0.55) {
        const ob = px(3);
        for (let k = 0; k < s.bolt.length - 1; k++) {
          const a = s.bolt[k], b = s.bolt[k + 1];
          for (let y = a[1]; y < b[1]; y++) {
            const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + ob;
            C.fillStyle = LIGHT.boltGlow; R(x - 1, y, 3, 1);
            C.fillStyle = LIGHT.bolt; R(x, y, 1, 1);
          }
        }
      }
      const pulse = s.flash > 0.75 ? 1 : s.flash > 0.5 ? 0.35 : s.flash > 0.35 ? 0.7 : 0.25;
      C.globalAlpha = s.flash * pulse * 0.16;
      C.fillStyle = LIGHT.flash; R(0, 0, W, H);
      C.globalAlpha = 1;
    }

    // виньетка слева, чтобы интерфейс читался
    for (let i = 0; i < 24; i++) {
      C.fillStyle = VIG[i];
      R(i * 3, 0, 3, H);
    }
  }
};
