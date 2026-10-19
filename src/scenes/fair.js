// Сцена «Ярмарка»: деревенская площадь днём или вечером (по `dark`) — лавки с полосатыми навесами,
// гирлянды флажков и фонариков, жители бродят между лавками, жонглёр, бард с лютней (летят ноты),
// ночью изредка небольшой салют.

let C = null;
const F = Math.floor;
const R = (x, y, w, h) => C.fillRect(F(x), F(y), F(w), F(h));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

const NIGHT = [18, 16, 30];
// базовые (дневные) цвета; ночью смешиваются к NIGHT на 0.72 (или своё значение 4-м элементом)
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
  bulbOff: [210, 200, 170], basket: [170, 120, 60]
};
const ROBES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
const AWN = ['aw0', 'aw1', 'aw2', 'aw3', 'aw4'];
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

function buildPal(s, dark) {
  const q = Math.round(dark * 16);
  if (s.pq === q) return s.p;
  s.pq = q;
  const t = q / 16, p = s.p;
  for (const k in PAL) { const c = PAL[k]; p[k] = css(mix(c, NIGHT, t * 0.64)); }
  // небо: день → закат → ночь
  let top, bot;
  if (t < 0.5) { top = mix(SKY_DAY[0], SKY_EVE[0], t * 2); bot = mix(SKY_DAY[1], SKY_EVE[1], t * 2); }
  else { top = mix(SKY_EVE[0], SKY_NIGHT[0], (t - 0.5) * 2); bot = mix(SKY_EVE[1], SKY_NIGHT[1], (t - 0.5) * 2); }
  for (let i = 0; i < 10; i++) s.sky[i] = css(mix(top, bot, i / 9));
  p.lit = t > 0.35;
  s.cloudC = `rgba(${css(mix([255, 255, 255], [90, 70, 110], t)).slice(4, -1)},0.8)`;
  return p;
}

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

// фон: небо, дома по краю площади, брусчатка
function paintBg(s) {
  const W = s.W + 16, p = s.p, gy = s.backY;
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
  C.fillStyle = p.cob2; R(0, gy, W, 180 - gy);
  C.fillStyle = p.cob;
  for (let row = 0, y = gy + 1; y < 180; row++, y += 4) {
    for (let x = row % 2 ? -3 : 0; x < W; x += 7) R(x, y, 6, 3);
  }
  C.fillStyle = p.cobDk; R(0, gy, W, 1);
  // столбы и шнуры гирлянд
  C.fillStyle = p.pole;
  for (let i = 0; i < s.poles.length; i++) { const x = s.poles[i]; R(x, s.lineY - 2, 2, gy - s.lineY + 2); R(x - 1, s.lineY - 3, 4, 1); }
  C.fillStyle = p.string;
  for (let i = 0; i < s.line.length; i++) R(i * 2, s.line[i], 2, 1);
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

export default {
  id: 'fair',
  title: 'Ярмарка',
  create(W, H, rand) {
    const s = {
      W, H, backY: 124, base: 146, lineY: 38, p: {}, pq: -1, sky: new Array(10).fill('#000'), layers: {},
      houses: [], stalls: [], poles: [], line: [], folk: [], actors: [], stars: [], birds: [],
      parts: pool(70), fw: 3 + rand() * 3, noteT: 0
    };
    // дома по краю площади
    for (let x = -6 + rand() * 6; x < W + 16; ) {
      const w = 20 + F(rand() * 16), h = 20 + F(rand() * 18);
      const wins = F((w - 4) / 8);
      const lit = []; for (let k = 0; k < 4; k++) lit.push(rand() > 0.3);
      s.houses.push({ x: F(x), w, h, wall: ['wallA', 'wallB', 'wallC'][F(rand() * 3)], roof: ['roofA', 'roofB', 'roofC'][F(rand() * 3)], wins, lit });
      x += w + 2 + rand() * 6;
    }
    // гирлянды между столбами
    const np = Math.max(3, Math.round(W / 130) + 1);
    for (let i = 0; i < np; i++) s.poles.push(F(4 + i * (W + 8) / (np - 1)));
    for (let x = 0; x < W + 16; x += 2) {
      let k = 0; while (k < s.poles.length - 2 && x > s.poles[k + 1]) k++;
      const a = s.poles[k], b = s.poles[k + 1], u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      s.line.push(F(s.lineY + 14 * 4 * u * (1 - u)));
    }
    // лавки
    const ns = Math.max(3, Math.round(W / 115));
    const slot = W / ns;
    for (let i = 0; i < ns; i++) {
      const w = 34 + F(rand() * 8);
      const x = F(i * slot + (slot - w) / 2 + (rand() - 0.5) * 8);
      const g = GOODS[F(rand() * GOODS.length)];
      s.stalls.push({ x, w, awn: AWN[(i * 2 + F(rand() * 2)) % AWN.length], goods: g, robe: ROBES[F(rand() * ROBES.length)], skin: ['skin', 'skin2', 'skin3'][F(rand() * 3)], ph: rand() * 10, hat: rand() > 0.5 });
    }
    for (let i = 0; i < F(W / 3); i++) s.stars.push({ x: rand() * W, y: rand() * 70, ph: rand() * 10, big: rand() > 0.9 });
    s.clouds = [];
    for (let i = 0; i < 4; i++) s.clouds.push({ x: rand() * W, y: 10 + rand() * 22, w: 22 + rand() * 30, v: 1 + rand() * 1.5 });
    for (let i = 0; i < 3; i++) s.birds.push({ x: rand() * W, y: 14 + rand() * 30, v: 10 + rand() * 8, ph: rand() * 10 });
    // актёры (рисуются по глубине)
    const nf = Math.max(5, F(W / 45));
    for (let i = 0; i < nf; i++) {
      s.actors.push({ kind: 0, x: rand() * W, fy: 150 + F(rand() * 12), dir: rand() > 0.5 ? 1 : -1, v: 6 + rand() * 6, pause: rand() * 2, ph: rand() * 10,
        robe: ROBES[F(rand() * ROBES.length)], skin: ['skin', 'skin2', 'skin3'][F(rand() * 3)], hat: rand() > 0.55 ? ROBES[F(rand() * ROBES.length)] : null, carry: rand() > 0.6 });
    }
    s.juggler = { kind: 1, x: F(W * 0.62), fy: 156 };
    s.bard = { kind: 2, x: F(W * 0.3), fy: 155 };
    s.actors.push(s.juggler, s.bard);
    s.actors.sort((a, b) => a.fy - b.fy);
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
    const ob = px(3) - 8, o = px(6), base = s.base;

    cached(ctx, s, 'bg', s.pq, W + 16, H, ob, 0, paintBg);

    // облака днём, звёзды ночью, птицы
    if (dark < 0.7) {
      C.fillStyle = s.cloudC;
      for (let i = 0; i < s.clouds.length; i++) {
        const c = s.clouds[i];
        c.x += c.v * dt;
        if (c.x > W + 20) c.x = -c.w - 20;
        const cx = c.x + px(2);
        R(cx, c.y, c.w, 4); R(cx + 4, c.y - 3, c.w * 0.5, 3); R(cx + c.w * 0.35, c.y - 5, c.w * 0.3, 2);
      }
    }
    if (dark > 0.55) {
      for (let i = 0; i < s.stars.length; i++) {
        const st = s.stars[i];
        const b = Math.sin(t * 1.3 + st.ph);
        if (b < -0.5) continue;
        C.fillStyle = b > 0.5 ? '#fffbe6' : 'rgba(255,250,230,0.5)';
        R(st.x + px(1), st.y, st.big ? 2 : 1, 1);
      }
    } else {
      C.fillStyle = '#2a2a34';
      for (let i = 0; i < s.birds.length; i++) {
        const b = s.birds[i];
        b.x += b.v * dt;
        if (b.x > W + 20) { b.x = -20 - Math.random() * 80; b.y = 14 + Math.random() * 30; }
        const fl = Math.sin(t * 9 + b.ph) > 0 ? 1 : 0;
        const x = F(b.x) + px(2), y = F(b.y + Math.sin(t + b.ph) * 2);
        R(x - 2, y - fl, 2, 1); R(x + 1, y - fl, 2, 1); R(x, y, 1, 1);
      }
    }

    // флажки и лампочки на гирлянде
    const line = s.line;
    for (let i = 0; i * 2 < W + 16; i += 4) {
      const lx = i * 2 + ob, ly = line[i];
      if (lx < -4 || lx > W + 4) continue;
      const k = (i >> 2) % 5;
      if ((i >> 2) % 2 === 0) {
        const sw = Math.sin(t * 2 + i * 0.3) > 0.6 ? 1 : 0;
        C.fillStyle = p[FLAGS[k]];
        R(lx, ly + 1, 5, 1); R(lx + 1, ly + 2, 3, 1); R(lx + 2 + sw, ly + 3, 1, 1);
      } else {
        const on = p.lit && Math.sin(t * 1.7 + i) > -0.6;
        if (on) {
          C.fillStyle = BULB_GLOW[k]; blob(lx + 1, ly + 2, 4);
          C.fillStyle = BULB[k];
        } else C.fillStyle = p.bulbOff;
        R(lx + 1, ly + 1, 2, 3);
      }
    }

    // лавки
    for (let i = 0; i < s.stalls.length; i++) {
      const st = s.stalls[i], x = st.x + o, w = st.w;
      // столбы
      C.fillStyle = p.woodDk; R(x + 1, 108, 2, base - 108); R(x + w - 3, 108, 2, base - 108);
      // продавец за прилавком
      const wave = Math.sin(t * 0.7 + st.ph) > 0.85;
      const vx = x + F(w / 2);
      C.fillStyle = p[st.robe]; R(vx - 3, 125, 7, 8);
      C.fillStyle = p[st.skin]; R(vx - 2, 119, 5, 5);
      if (wave) R(vx + 4, 119 + (Math.sin(t * 10) > 0 ? 0 : 1), 1, 5);
      C.fillStyle = p.eye; R(vx - 1, 121, 1, 1); R(vx + 1, 121, 1, 1);
      if (st.hat) { C.fillStyle = p.white; R(vx - 3, 118, 7, 1); R(vx - 2, 116, 5, 2); }
      // прилавок
      C.fillStyle = p.wood; R(x, 132, w, base - 132);
      C.fillStyle = p.woodDk;
      for (let yy = 135; yy < base; yy += 4) R(x, yy, w, 1);
      C.fillStyle = p.woodHi; R(x - 1, 131, w + 2, 2);
      // товары
      for (let gx = x + 2, k = 0; gx < x + w - 3; gx += 4, k++) {
        C.fillStyle = p[st.goods[k % 2]];
        R(gx, 128 + (k % 3 === 1 ? 1 : 0), 3, 3 - (k % 3 === 1 ? 1 : 0));
      }
      // навес: скат, полосы, фестоны
      C.fillStyle = p[st.awn];
      for (let k = 0; k < 4; k++) R(x - 3 + k * 2, 102 - k, w + 6 - k * 4, 1);
      for (let sx = 0; sx < w + 6; sx += 4) {
        C.fillStyle = (sx >> 2) % 2 ? p.white : p[st.awn];
        R(x - 3 + sx, 103, Math.min(4, w + 6 - sx), 7);
        R(x - 3 + sx + 1, 110, 2, 1);
      }
      // фонарь лавки — вечером светит
      const lx = x + w - 2, fl = 0.85 + 0.15 * Math.sin(t * 7 + st.ph);
      C.fillStyle = p.hoop; R(lx, 111, 1, 2);
      if (p.lit) {
        C.globalAlpha = fl * Math.min(1, (dark - 0.3) * 2);
        C.fillStyle = 'rgba(255,180,90,0.07)'; blob(lx, 118, 18);
        C.fillStyle = 'rgba(255,190,100,0.12)'; blob(lx, 116, 8);
        C.globalAlpha = 1;
        C.fillStyle = '#ffd070';
      } else C.fillStyle = p.bulbOff;
      R(lx - 1, 113, 3, 3);
    }

    // актёры по глубине
    for (let i = 0; i < s.actors.length; i++) {
      const a = s.actors[i];
      if (a.kind === 0) {
        if (an) {
          if (a.pause > 0) a.pause -= dt;
          else {
            a.x += a.dir * a.v * dt;
            if (Math.random() < dt * 0.12) a.pause = 1 + Math.random() * 3;
            if (Math.random() < dt * 0.05) a.dir *= -1;
          }
          if (a.x < -10) a.dir = 1;
          if (a.x > W + 10) a.dir = -1;
        }
        const step = an && a.pause <= 0 ? F((t * 6 + a.ph) % 2) : 0;
        villager(p, F(a.x) + o, a.fy, a.dir, step, a.robe, a.skin, a.hat, a.carry);
      } else if (a.kind === 1) {
        // жонглёр: шутовской наряд и три мяча каскадом
        const x = a.x + o, fy = a.fy, y = fy - 12;
        C.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 3, fy, 7, 1);
        const bounce = Math.sin(t * 6) > 0 ? 1 : 0;
        C.fillStyle = p.leg; R(x - 1, y + 10, 1, 2); R(x + 1, y + 10, 1, 2);
        C.fillStyle = p.jA; R(x - 2, y + 4, 3, 7);
        C.fillStyle = p.jB; R(x + 1, y + 4, 2, 7);
        C.fillStyle = p.skin; R(x - 1, y, 4, 4);
        C.fillStyle = p.eye; R(x, y + 1, 1, 1); R(x + 2, y + 1, 1, 1);
        C.fillStyle = p.jA; R(x - 2, y - 1, 3, 1); R(x - 3, y - 2 - bounce, 1, 1);
        C.fillStyle = p.jB; R(x + 1, y - 1, 3, 1); R(x + 4, y - 2 - (1 - bounce), 1, 1);
        const hy = y + 5, xl = x - 4, xr = x + 5;
        const ph = t * 1.5;
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
      } else {
        // бард на бочке с лютней
        const x = a.x + o, fy = a.fy;
        C.fillStyle = 'rgba(0,0,0,0.2)'; R(x - 4, fy, 9, 1);
        C.fillStyle = p.barrel; R(x - 3, fy - 8, 7, 8);
        C.fillStyle = p.hoop; R(x - 3, fy - 7, 7, 1); R(x - 3, fy - 2, 7, 1);
        const y = fy - 19;
        C.fillStyle = p.leg; R(x + 1, y + 10, 3, 1); R(x + 3, y + 11, 1, 2);
        C.fillStyle = p.bardR; R(x - 2, y + 4, 5, 7);
        C.fillStyle = p.skin; R(x - 1, y, 4, 4);
        C.fillStyle = p.eye; R(x + 2, y + 1, 1, 1);
        C.fillStyle = p.f0; R(x - 2, y - 1, 6, 1); R(x - 1, y - 2, 4, 1); R(x - 2, y - 3, 1, 2);
        // лютня
        C.fillStyle = p.lute; R(x + 1, y + 6, 4, 3); R(x + 2, y + 5, 2, 1);
        C.fillStyle = p.luteDk; R(x + 2, y + 7, 1, 1);
        C.fillStyle = p.luteDk; R(x + 5, y + 5, 1, 1); R(x + 6, y + 4, 1, 1); R(x + 7, y + 3, 1, 1); R(x + 8, y + 2, 2, 1);
        const strum = an && Math.sin(t * 9) > 0 ? 1 : 0;
        C.fillStyle = p.skin; R(x + 1 + strum, y + 6 + strum, 1, 1); R(x + 6, y + 4, 1, 1);
        if (an) {
          s.noteT -= dt;
          if (s.noteT <= 0) {
            s.noteT = 0.5 + Math.random() * 0.5;
            spawnP(s.parts, a.x + 3, y + 2, 3 + Math.random() * 4, -12 - Math.random() * 6, 2.2, FIRE[F(Math.random() * 5)], 0, 1);
          }
        }
      }
    }

    // салют ночью
    if (an && dark > 0.55) {
      s.fw -= dt;
      if (s.fw <= 0) {
        s.fw = 3.5 + Math.random() * 5;
        spawnP(s.parts, W * (0.15 + Math.random() * 0.7) - o, 100, (Math.random() - 0.5) * 8, -70 - Math.random() * 15, 0.8 + Math.random() * 0.3, '#ffe6a0', 30, 2);
      }
    }
    for (let i = 0; i < s.parts.length; i++) {
      const q = s.parts[i];
      if (!q.on) continue;
      if (an) {
        q.life += dt;
        if (q.life >= q.max) {
          q.on = 0;
          if (q.k === 2) {
            // взрыв ракеты
            const c = FIRE[F(Math.random() * FIRE.length)], sp = 22 + Math.random() * 10;
            for (let k = 0; k < 14; k++) spawnP(s.parts, q.x, q.y, COS[k] * sp, SIN[k] * sp, 1 + Math.random() * 0.4, c, 26, 3);
          }
          continue;
        }
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt;
        if (q.k === 1) q.x += Math.sin(q.life * 4) * dt * 6;
        if (q.k === 3) { q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5; }
        if (q.k === 2 && Math.random() < 0.5) spawnP(s.parts, q.x, q.y + 2, 0, 4, 0.35, '#ffb060', 0, 4);
      }
      const a = 1 - q.life / q.max;
      C.globalAlpha = q.k === 3 ? Math.min(1, a * 1.6) : Math.min(1, a * 1.5);
      C.fillStyle = q.c;
      const x = F(q.x) + o, y = F(q.y);
      if (q.k === 1) { R(x, y + 2, 2, 2); R(x + 1, y - 1, 1, 3); R(x + 2, y - 1, 1, 1); }
      else if (q.k === 3) { R(x, y, 1, 1); if (a > 0.6) { C.globalAlpha = 0.35; R(x - 1, y, 3, 1); } }
      else R(x, y, 1, q.k === 2 ? 2 : 1);
    }
    C.globalAlpha = 1;

    for (let i = 0; i < 24; i++) { C.fillStyle = VIG[i]; R(i * 3, 0, 3, H); }
  }
};
