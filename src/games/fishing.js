// Мини-игра «Рыбалка»: причал на озере, день постепенно сменяется закатом.
// Заброс (держи — дальность), ждёшь поклёвку, подсекаешь, вываживаешь рыбу,
// удерживая её в зелёной зоне. 10 забросов, очки = сумма улова.
// Всё рисуется целочисленными fillRect, без картинок.

import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

const W = 320;
const H = 180;
const HORIZON = 92;
const CASTS = 10;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- спрайты улова ----------
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
  let w = 0;
  for (const row of rows) w = Math.max(w, row.length);
  return { w, h: rows.length, r };
}
function drawSprite(ctx, sp, x, y, s = 1, flip = false) {
  x = Math.round(x);
  y = Math.round(y);
  const r = sp.r;
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = r[j];
    const px = flip ? sp.w - r[j + 1] - r[j + 3] : r[j + 1];
    ctx.fillRect(x + px * s, y + r[j + 2] * s, r[j + 3] * s, s);
  }
}

// типы улова: очки, поведение рыбы в шкале, размер зоны, скорость наполнения
const KINDS = {
  boot: {
    pts: 2, speed: 0.22, jumpy: 0.25, zone: 0.36, gain: 0.34, drain: 0.16, dip: 1, sfx: 'click',
    sp: sprite({ a: '#6b4a2e', b: '#c8b080', c: '#3a2a1e', d: '#8a6440' }, [
      '.aaa....', '.aba....', '.ada....', '.aaa....', '.aaaaa..', 'aaaaaaaa', 'cccccccc'
    ])
  },
  small: {
    pts: 10, speed: 0.55, jumpy: 0.6, zone: 0.32, gain: 0.3, drain: 0.18, dip: 2, sfx: 'coin',
    sp: sprite({ a: '#c9a640', b: '#efe0a0', c: '#6b5a20', e: '#1a1410', t: '#d9763a' }, [
      '...aaa....', '.aacacaa.t', 'eaacacaatt', '.aabbbaa.t', '...bbb....'
    ])
  },
  large: {
    pts: 25, speed: 0.8, jumpy: 0.9, zone: 0.27, gain: 0.25, drain: 0.2, dip: 3, sfx: 'coin',
    sp: sprite({ a: '#5f8a5a', b: '#c8d8a8', c: '#2f5a32', e: '#141a10', t: '#4a7a46' }, [
      '....aaaaaa....', '.aaacacaacaa.t', 'eaaaaaaaaaaatt', '.abbbbbbbbba.t', '....bbbbbb....'
    ])
  },
  chest: {
    pts: 40, speed: 0.45, jumpy: 0.5, zone: 0.25, gain: 0.22, drain: 0.2, dip: 3, sfx: 'win',
    sp: sprite({ a: '#5a3a1e', b: '#9a6a34', c: '#3a2a18', g: '#f0c040', h: '#fff2a0' }, [
      '.aaaaaaaa.', 'abbbbbbbba', 'cccccccccc', 'abbbgbbbba', 'abbbhbbbba', 'abbbbbbbba', 'aaaaaaaaaa'
    ])
  },
  golden: {
    pts: 75, speed: 1.25, jumpy: 1.5, zone: 0.24, gain: 0.24, drain: 0.22, dip: 4, sfx: 'win',
    sp: sprite({ a: '#f2c230', s: '#fff6b0', c: '#c08a10', b: '#ffe070', t: '#e0a020', e: '#3a2a00' }, [
      '...sss....', '.ascaasa.t', 'eaaaaaaatt', '.aabbbaa.t', '...bbb....'
    ])
  }
};

function pickKind(d, rand) {
  // d = дальность заброса 0..1: дальше — больше шанс на редкое
  const w = [
    ['boot', 18 - 12 * d],
    ['small', 50 - 22 * d],
    ['large', 22 + 12 * d],
    ['chest', 5 + 9 * d],
    ['golden', 2 + 9 * d]
  ];
  let sum = 0;
  for (const e of w) sum += e[1];
  let v = rand() * sum;
  for (const e of w) {
    v -= e[1];
    if (v <= 0) return e[0];
  }
  return 'small';
}

// палитры: день -> закат
const DAY = { top: [96, 158, 226], bot: [196, 226, 246], water: [62, 120, 168], deep: [34, 76, 120], hill: [86, 128, 92], sun: [255, 238, 170] };
const SET = { top: [74, 62, 132], bot: [250, 150, 90], water: [92, 82, 120], deep: [40, 36, 70], hill: [52, 44, 66], sun: [255, 170, 90] };

export default {
  id: 'fishing',
  title: 'Рыбалка',
  desc: 'Забрось удочку, дождись поклёвки и вытащи улов — 10 забросов.',
  controls: 'Пробел / мышь: держи — сила заброса, клик — подсечка, держи — подмотка',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rand = Math.random;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    // ---------- мир ----------
    const treeline = [];
    for (let x = 0; x < W; x += 3) treeline.push(HORIZON - 4 - Math.floor(4 + 4 * Math.sin(x / 23) + 3 * Math.sin(x / 7 + 1) + rand() * 3));
    const ripples = [];
    for (let i = 0; i < 26; i++) ripples.push({ x: rand() * W, y: HORIZON + 3 + rand() * (H - HORIZON - 6), w: 3 + Math.floor(rand() * 7), v: 2 + rand() * 4, p: rand() * 6 });
    const reeds = [];
    for (let i = 0; i < 9; i++) reeds.push({ x: 2 + Math.floor(rand() * 34), h: 10 + Math.floor(rand() * 14), p: rand() * 6 });
    const pads = [];
    for (let i = 0; i < 4; i++) pads.push({ x: 20 + Math.floor(rand() * 140), y: 150 + Math.floor(rand() * 22) });
    const clouds = [];
    for (let i = 0; i < 4; i++) clouds.push({ x: rand() * W, y: 10 + rand() * 40, w: 22 + rand() * 30, v: 1 + rand() * 2 });

    const parts = [];
    for (let i = 0; i < 40; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff' });
    const puff = (x, y, n, c, sp = 20) => {
      for (const p of parts) {
        if (n <= 0) break;
        if (p.on) continue;
        p.on = true; p.x = x; p.y = y; p.vx = (rand() - 0.5) * sp * 2; p.vy = -rand() * sp - 10; p.life = 0.5 + rand() * 0.4; p.c = c;
        n--;
      }
    };

    // ---------- состояние ----------
    const PIER_X = 232, DECK_Y = 118, MAN_X = 246;
    const ROD_REST = { x: MAN_X - 12, y: DECK_Y - 26 };
    const g = {
      mode: 'start', // start | ready | charge | fly | wait | bite | reel | show | miss | end
      t: 0, timer: 0,
      cast: 0, score: 0,
      power: 0, powDir: 1,
      bob: { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0 },
      dist: 0, kind: null, nibble: 0, spooked: 0, spookCount: 0,
      fish: 0.5, fishT: 0.5, fishTimer: 0,
      zone: 0.1, zv: 0, prog: 0.3, thrash: 0,
      caught: [], showKind: null, showPts: 0, overSent: false, reelIn: 0
    };
    let held = false;
    let pressedEdge = false;

    const press = () => {
      if (!held) pressedEdge = true;
      held = true;
    };
    const release = () => { held = false; };

    const KEYS = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1, NumpadEnter: 1 };
    const onKeyDown = (e) => {
      if (!KEYS[e.code]) return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    };
    const onKeyUp = (e) => {
      if (!KEYS[e.code]) return;
      e.preventDefault();
      release();
    };
    const onPointerDown = (e) => {
      e.preventDefault();
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      press();
    };
    const onPointerUp = () => release();
    const onCtx = (e) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', onCtx);
    const onBlur = () => release();
    window.addEventListener('blur', onBlur);

    const rodTip = () => {
      if (g.mode === 'charge') {
        const k = g.power;
        return { x: MAN_X + 2 + Math.round(k * 6), y: DECK_Y - 30 - Math.round(k * 2) };
      }
      if (g.mode === 'reel') {
        const sh = Math.round(Math.sin(g.t * 20) * (held ? 1 : 0));
        return { x: MAN_X - 10, y: DECK_Y - 22 + sh + (held ? 2 : 0) };
      }
      return ROD_REST;
    };

    const nextCast = () => {
      g.cast++;
      if (g.cast >= CASTS) {
        g.mode = 'end';
        if (!g.overSent) {
          g.overSent = true;
          api.over(Math.round(g.score));
        }
      } else {
        g.mode = 'ready';
      }
    };

    const startReel = () => {
      const k = KINDS[g.kind];
      g.mode = 'reel';
      g.fish = 0.4 + rand() * 0.3;
      g.fishT = g.fish;
      g.fishTimer = 0.4;
      g.zone = clamp(g.fish - k.zone / 2, 0, 1 - k.zone);
      g.zv = 0;
      g.prog = 0.3;
      g.thrash = 1;
    };

    // ---------- обновление ----------
    const update = (dt) => {
      g.t += dt;
      const press1 = pressedEdge;
      pressedEdge = false;

      for (const c of clouds) {
        c.x += c.v * dt;
        if (c.x > W + 10) c.x = -c.w - 10;
      }
      for (const p of parts) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.vy += 120 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      switch (g.mode) {
        case 'start':
          if (press1) { g.mode = 'ready'; api.sfx('click'); }
          break;
        case 'ready':
          if (press1) { g.mode = 'charge'; g.power = 0; g.powDir = 1; }
          break;
        case 'charge': {
          g.power += g.powDir * dt / 1.1;
          if (g.power >= 1) { g.power = 1; g.powDir = -1; }
          if (g.power <= 0.05 && g.powDir < 0) { g.power = 0.05; g.powDir = 1; }
          if (!held) {
            const d = clamp(g.power, 0.08, 1);
            g.dist = d;
            const tip = rodTip();
            g.bob.sx = tip.x; g.bob.sy = tip.y;
            g.bob.tx = Math.round(214 - d * 178);
            g.bob.ty = Math.round(146 - d * 44);
            g.bob.x = tip.x; g.bob.y = tip.y;
            g.timer = 0;
            g.mode = 'fly';
            api.sfx('jump');
          }
          break;
        }
        case 'fly': {
          g.timer += dt / (0.45 + g.dist * 0.4);
          const k = Math.min(1, g.timer);
          g.bob.x = lerp(g.bob.sx, g.bob.tx, k);
          g.bob.y = lerp(g.bob.sy, g.bob.ty, k) - Math.sin(k * Math.PI) * (30 + g.dist * 30);
          if (k >= 1) {
            g.mode = 'wait';
            g.timer = 1.2 + rand() * 3.2;
            g.nibble = 0;
            g.spooked = 0;
            g.spookCount = 0;
            puff(g.bob.tx, g.bob.ty, 6, '#cfe8ff', 14);
            api.sfx('splash');
          }
          break;
        }
        case 'wait':
          g.timer -= dt;
          if (g.nibble > 0) g.nibble -= dt;
          else if (rand() < dt * 0.9) g.nibble = 0.14;
          if (g.spooked > 0) g.spooked -= dt;
          if (press1 && g.spookCount < 3) {
            // подсекать рано — спугнуть рыбу: поклёвка откладывается (не больше 3 раз за заброс)
            g.spookCount++;
            g.timer += 0.8 + rand() * 0.8;
            g.spooked = 0.8;
            puff(g.bob.tx, g.bob.ty, 3, '#cfe8ff', 10);
            api.sfx('click');
          }
          if (g.timer <= 0) {
            g.kind = pickKind(g.dist, rand);
            g.mode = 'bite';
            g.timer = 1.0;
            puff(g.bob.tx, g.bob.ty, 5, '#e8f4ff', 16);
            api.sfx('splash');
          }
          break;
        case 'bite':
          g.timer -= dt;
          if (press1) { startReel(); api.sfx('jump'); }
          else if (g.timer <= 0) { g.mode = 'miss'; g.timer = 1.2; api.sfx('hit'); }
          break;
        case 'reel': {
          const k = KINDS[g.kind];
          // рыба
          g.fishTimer -= dt;
          if (g.fishTimer <= 0) {
            const span = 0.25 + rand() * 0.6 * Math.min(1, k.jumpy);
            g.fishT = clamp(g.fish + (rand() < 0.5 ? -span : span), 0.03, 0.97);
            g.fishTimer = (0.35 + rand() * 1.1) / k.jumpy;
          }
          const step = k.speed * dt;
          g.fish += clamp(g.fishT - g.fish, -step, step);
          g.fish += Math.sin(g.t * 13) * 0.04 * k.jumpy * dt;
          g.fish = clamp(g.fish, 0.02, 0.98);
          // зона игрока
          g.zv += (held ? 2.8 : -2.4) * dt;
          g.zv = clamp(g.zv, -1.4, 1.4);
          g.zone += g.zv * dt;
          if (g.zone < 0) { g.zone = 0; g.zv = g.zv < -0.4 ? -g.zv * 0.3 : 0; }
          if (g.zone > 1 - k.zone) { g.zone = 1 - k.zone; if (g.zv > 0) g.zv = 0; }
          const inside = g.fish >= g.zone && g.fish <= g.zone + k.zone;
          g.prog += (inside ? k.gain : -k.drain) * dt;
          g.thrash -= dt;
          if (g.thrash <= 0) {
            g.thrash = 0.8 + rand() * 1.4;
            puff(g.bob.tx + Math.round((rand() - 0.5) * 6), g.bob.ty, 3, '#e8f4ff', 14);
          }
          if (g.prog >= 1) {
            g.score += k.pts;
            g.caught.push(g.kind);
            g.showKind = g.kind;
            g.showPts = k.pts;
            g.mode = 'show';
            g.timer = 1.7;
            puff(g.bob.tx, g.bob.ty, 10, '#e8f4ff', 26);
            api.sfx(k.sfx);
          } else if (g.prog <= 0) {
            g.mode = 'miss';
            g.timer = 1.2;
            api.sfx('hit');
          }
          break;
        }
        case 'show':
        case 'miss':
          g.timer -= dt;
          if (g.timer <= 0 || (press1 && g.timer < 1.0)) nextCast();
          break;
        default:
          break;
      }
    };

    // ---------- отрисовка ----------
    const line = (x0, y0, x1, y1, color) => {
      // пиксельная линия (Брезенхем), отрезками по 1px
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      ctx.fillStyle = color;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let n = 0;
      for (;;) {
        ctx.fillRect(x0, y0, 1, 1);
        if ((x0 === x1 && y0 === y1) || ++n > 600) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    const sagLine = (x0, y0, x1, y1, sag, color) => {
      // провисающая леска: несколько коротких отрезков
      const N = 8;
      let px = x0, py = y0;
      for (let i = 1; i <= N; i++) {
        const k = i / N;
        const x = lerp(x0, x1, k);
        const y = lerp(y0, y1, k) + Math.sin(k * Math.PI) * sag;
        line(px, py, x, y, color);
        px = x; py = y;
      }
    };

    const drawVillager = (x, y, dark, pose) => {
      const sh = (c) => rgb(mix(c, [30, 20, 40], dark * 0.45));
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - 3, y + 12, 8, 1);
      ctx.fillStyle = sh([60, 44, 34]);
      ctx.fillRect(x - 1, y + 10, 1, 2);
      ctx.fillRect(x + 1, y + 10, 1, 2);
      ctx.fillStyle = sh([80, 110, 70]);
      ctx.fillRect(x - 2, y + 4, 5, 7);
      ctx.fillStyle = sh([60, 84, 52]);
      ctx.fillRect(x - 2, y + 7, 5, 1);
      ctx.fillStyle = sh([232, 190, 150]);
      ctx.fillRect(x - 1, y, 4, 4);
      // руки к удочке
      ctx.fillRect(pose === 'charge' ? x + 3 : x - 3, y + 5 + (pose === 'reel' ? Math.round(Math.sin(g.t * 18)) : 0), 1, 2);
      ctx.fillStyle = sh([40, 30, 30]);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      // соломенная шляпа
      ctx.fillStyle = sh([214, 180, 96]);
      ctx.fillRect(x - 3, y - 1, 8, 1);
      ctx.fillRect(x - 1, y - 3, 4, 2);
      ctx.fillStyle = sh([160, 60, 50]);
      ctx.fillRect(x - 1, y - 2, 4, 1);
    };

    const drawBobber = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      ctx.fillStyle = '#f4f0e8';
      ctx.fillRect(x - 1, y - 2, 3, 2);
      ctx.fillStyle = '#e04040';
      ctx.fillRect(x - 1, y, 3, 2);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(x, y - 3, 1, 1);
    };

    const draw = () => {
      const day = clamp((g.cast + (g.mode === 'end' ? 1 : 0)) / CASTS, 0, 1);
      const pal = {
        top: mix(DAY.top, SET.top, day), bot: mix(DAY.bot, SET.bot, day),
        water: mix(DAY.water, SET.water, day), deep: mix(DAY.deep, SET.deep, day),
        hill: mix(DAY.hill, SET.hill, day), sun: mix(DAY.sun, SET.sun, day)
      };
      const dusk = day * 0.6;
      // небо полосами
      for (let y = 0; y < HORIZON; y += 4) {
        ctx.fillStyle = rgb(mix(pal.top, pal.bot, y / HORIZON));
        ctx.fillRect(0, y, W, 4);
      }
      // солнце опускается к горизонту с каждым забросом
      const sunX = 120;
      const sunY = Math.round(lerp(26, HORIZON - 4, day));
      const disc = (cx, cy, r, color) => {
        ctx.fillStyle = color;
        for (let yy = -r; yy <= r; yy++) {
          if (cy + yy >= HORIZON - 1) break;
          const w = Math.round(Math.sqrt(r * r - yy * yy));
          ctx.fillRect(cx - w, cy + yy, w * 2, 1);
        }
      };
      disc(sunX, sunY, 12, rgb(pal.sun, 0.15));
      disc(sunX, sunY, 8, rgb(pal.sun, 0.35));
      disc(sunX, sunY, 6, rgb(mix(pal.sun, [255, 255, 255], 0.4)));
      // облака
      for (const c of clouds) {
        ctx.fillStyle = rgb(mix([255, 255, 255], [250, 190, 170], day), 0.7);
        const cx = Math.floor(c.x), cy = Math.floor(c.y);
        ctx.fillRect(cx, cy, Math.floor(c.w), 4);
        ctx.fillRect(cx + 4, cy - 2, Math.floor(c.w * 0.5), 2);
      }
      // дальний лес
      ctx.fillStyle = rgb(pal.hill);
      for (let i = 0; i < treeline.length; i++) ctx.fillRect(i * 3, treeline[i], 3, HORIZON - treeline[i]);
      ctx.fillStyle = rgb(mix(pal.hill, [0, 0, 0], 0.2));
      ctx.fillRect(0, HORIZON - 2, W, 2);
      // вода полосами
      for (let y = HORIZON; y < H; y += 2) {
        ctx.fillStyle = rgb(mix(pal.water, pal.deep, (y - HORIZON) / (H - HORIZON)));
        ctx.fillRect(0, y, W, 2);
      }
      // отражение солнца
      for (let y = HORIZON + 1; y < H; y += 3) {
        const w = Math.round(3 + (y - HORIZON) * 0.25 + Math.sin(g.t * 2 + y) * 2);
        ctx.fillStyle = rgb(pal.sun, 0.35 - (y - HORIZON) / 360);
        ctx.fillRect(sunX - w, y, w * 2, 1);
      }
      // блики
      ctx.fillStyle = rgb(mix(pal.water, [255, 255, 255], 0.35), 0.6);
      for (const r of ripples) {
        const x = Math.floor((r.x + g.t * r.v) % (W + 20)) - 10;
        const w = Math.max(1, Math.round(r.w * (0.6 + 0.4 * Math.sin(g.t + r.p))));
        ctx.fillRect(x, Math.floor(r.y), w, 1);
      }
      // кувшинки
      for (const p of pads) {
        ctx.fillStyle = rgb(mix([70, 140, 70], [40, 50, 50], dusk));
        ctx.fillRect(p.x, p.y, 7, 2);
        ctx.fillRect(p.x + 1, p.y - 1, 4, 1);
        ctx.fillStyle = rgb(mix([240, 200, 220], [160, 120, 140], dusk));
        ctx.fillRect(p.x + 2, p.y - 2, 2, 1);
      }
      // камыш слева
      for (const r of reeds) {
        const sway = Math.round(Math.sin(g.t * 1.3 + r.p));
        ctx.fillStyle = rgb(mix([96, 130, 60], [40, 44, 40], dusk));
        ctx.fillRect(r.x, H - r.h, 1, r.h);
        ctx.fillRect(r.x + sway, H - r.h - 2, 1, 2);
        ctx.fillStyle = rgb(mix([110, 70, 40], [40, 30, 30], dusk));
        ctx.fillRect(r.x + sway - 1 + 1, H - r.h - 6, 2, 4);
      }
      // причал
      const wood = mix([150, 108, 66], [70, 50, 50], dusk);
      const woodD = mix(wood, [0, 0, 0], 0.3);
      ctx.fillStyle = rgb(woodD);
      for (let x = PIER_X + 4; x < W; x += 18) {
        ctx.fillRect(x, DECK_Y, 3, H - DECK_Y);
        ctx.fillStyle = rgb(mix(pal.water, [255, 255, 255], 0.3), 0.5);
        ctx.fillRect(x - 2, DECK_Y + 30 + Math.round(Math.sin(g.t * 2 + x) ), 7, 1);
        ctx.fillStyle = rgb(woodD);
      }
      ctx.fillStyle = rgb(wood);
      ctx.fillRect(PIER_X, DECK_Y, W - PIER_X, 4);
      ctx.fillStyle = rgb(woodD);
      for (let x = PIER_X + 5; x < W; x += 6) ctx.fillRect(x, DECK_Y, 1, 4);
      ctx.fillRect(PIER_X, DECK_Y + 4, W - PIER_X, 1);
      // ведро с уловом
      ctx.fillStyle = rgb(mix([120, 120, 130], [60, 60, 70], dusk));
      ctx.fillRect(268, DECK_Y - 7, 8, 7);
      ctx.fillStyle = rgb(mix([80, 80, 90], [40, 40, 50], dusk));
      ctx.fillRect(268, DECK_Y - 7, 8, 1);
      if (g.caught.length) {
        ctx.fillStyle = '#c9a640';
        ctx.fillRect(270, DECK_Y - 9, 3, 2);
      }
      if (g.caught.length > 3) {
        ctx.fillStyle = '#5f8a5a';
        ctx.fillRect(272, DECK_Y - 10, 3, 3);
      }
      // рыбак
      const pose = g.mode === 'charge' ? 'charge' : g.mode === 'reel' ? 'reel' : 'idle';
      drawVillager(MAN_X, DECK_Y - 12, dusk, pose);
      // удочка
      const tip = rodTip();
      line(MAN_X + (pose === 'charge' ? 3 : -3), DECK_Y - 6, tip.x, tip.y, rgb(mix([110, 76, 40], [50, 36, 30], dusk)));

      // леска и поплавок
      const lineC = 'rgba(240,240,240,0.7)';
      if (g.mode === 'fly') {
        sagLine(tip.x, tip.y, g.bob.x, g.bob.y, 2, lineC);
        drawBobber(g.bob.x, g.bob.y);
      } else if (g.mode === 'wait' || g.mode === 'bite' || g.mode === 'reel') {
        let by = g.bob.ty;
        let bx = g.bob.tx;
        if (g.mode === 'wait') by += g.nibble > 0 ? 1 : Math.round(Math.sin(g.t * 2.5) * 0.6);
        if (g.mode === 'bite') by += KINDS[g.kind].dip + (Math.floor(g.t * 12) % 2);
        if (g.mode === 'reel') { by += 2; bx += Math.round(Math.sin(g.t * 9) * 2); }
        sagLine(tip.x, tip.y, bx, by, g.mode === 'reel' ? 0 : 6, lineC);
        // круги на воде
        const rr = Math.floor((g.t * 6) % 6);
        ctx.fillStyle = 'rgba(230,245,255,0.45)';
        ctx.fillRect(bx - 3 - rr, by + 2, 2, 1);
        ctx.fillRect(bx + 2 + rr, by + 2, 2, 1);
        if (g.mode === 'reel') {
          ctx.fillStyle = 'rgba(20,30,50,0.35)';
          ctx.fillRect(bx - 4, by + 3, 9, 2);
        }
        drawBobber(bx, by);
        if (g.mode === 'bite') {
          const bl = Math.floor(g.t * 8) % 2 === 0;
          ctx.fillStyle = '#2a1a10';
          ctx.fillRect(bx - 3, by - 16, 7, 9);
          drawText(ctx, '!', bx - 1 + 1, by - 14, bl ? '#ffe060' : '#ffffff', 1);
          drawText(ctx, '!', bx - 1, by - 14, bl ? '#ffe060' : '#ffffff', 1);
        }
        if (g.mode === 'wait' && g.spooked > 0) drawText(ctx, '?', bx - 1, by - 12, '#ffffff', 1);
      }

      // частицы
      for (const p of parts) {
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }

      // шкала заряда
      if (g.mode === 'charge') {
        const bx = 196, by = DECK_Y - 40, bw = 44;
        ctx.fillStyle = 'rgba(20,14,10,0.8)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
        // градиент: близко — обычная рыба, далеко — редкая (золото)
        for (let i = 0; i < bw; i += 4) {
          ctx.fillStyle = rgb(mix([90, 170, 230], [250, 200, 50], i / bw), 0.45);
          ctx.fillRect(bx + i, by, 4, 4);
        }
        ctx.fillStyle = rgb(mix([120, 210, 255], [255, 220, 80], g.power));
        ctx.fillRect(bx, by, Math.round(bw * g.power), 4);
        drawIcon(ctx, 'trophy', bx + bw + 3, by - 2);
        // точка будущего падения
        const tx = Math.round(214 - g.power * 178), ty = Math.round(146 - g.power * 44);
        if (Math.floor(g.t * 6) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(tx - 2, ty, 1, 1);
          ctx.fillRect(tx + 2, ty, 1, 1);
          ctx.fillRect(tx, ty - 2, 1, 1);
          ctx.fillRect(tx, ty + 2, 1, 1);
        }
      }

      // мини-игра вываживания
      if (g.mode === 'reel') {
        const k = KINDS[g.kind];
        const px = 282, py = 16, ph = 132;
        ctx.fillStyle = 'rgba(24,16,10,0.85)';
        ctx.fillRect(px - 4, py - 4, 34, ph + 8);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(px - 4, py - 4, 34, 1);
        ctx.fillRect(px - 4, py + ph + 3, 34, 1);
        ctx.fillStyle = rgb(mix(pal.water, pal.deep, 0.5));
        ctx.fillRect(px, py, 14, ph);
        // зона
        const zh = Math.round(k.zone * ph);
        const zy = Math.round(py + ph - (g.zone * ph) - zh);
        const inside = g.fish >= g.zone && g.fish <= g.zone + k.zone;
        ctx.fillStyle = inside ? '#5fd36a' : '#3e9a4a';
        ctx.fillRect(px + 1, zy, 12, zh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 1, zy, 12, 1);
        ctx.fillRect(px + 1, zy + zh - 1, 12, 1);
        // рыба (мини-значок)
        const fy = Math.round(py + ph - g.fish * ph) - 2;
        const fc = g.kind === 'golden' ? '#ffd34a' : g.kind === 'chest' ? '#b07a3a' : g.kind === 'boot' ? '#7a5a3a' : g.kind === 'large' ? '#7ab070' : '#e0c050';
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(px + 3, fy - 1, 9, 6);
        ctx.fillStyle = fc;
        ctx.fillRect(px + 4, fy, 5, 4);
        ctx.fillRect(px + 9, fy + 1, 2, 2);
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(px + 5, fy + 1, 1, 1);
        // шкала прогресса
        const prh = Math.round(clamp(g.prog, 0, 1) * ph);
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(px + 18, py, 6, ph);
        ctx.fillStyle = g.prog < 0.25 ? '#e05040' : g.prog < 0.6 ? '#f0c040' : '#60d870';
        ctx.fillRect(px + 19, py + ph - prh, 4, prh);
        // подсказка: держи
        const blink = Math.floor(g.t * 3) % 2 === 0;
        drawIcon(ctx, 'up', px + 4, py + ph + 6);
        if (held && blink) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(px, py, 14, ph);
        }
      }

      // показ улова
      if (g.mode === 'show' && g.showKind) {
        const sp = KINDS[g.showKind].sp;
        const s = 3;
        const age = 1.7 - g.timer;
        const pop = Math.min(1, age * 5);
        const cx = 150, cy = 44 - Math.round((1 - pop) * 10);
        ctx.fillStyle = 'rgba(20,14,10,0.6)';
        ctx.fillRect(cx - 34, cy - 14, 68, 46);
        ctx.fillStyle = 'rgba(255,230,150,0.25)';
        ctx.fillRect(cx - 34, cy - 14, 68, 1);
        drawSprite(ctx, sp, cx - Math.round(sp.w * s / 2), cy - 8 + Math.round(Math.sin(age * 6) * 1), s);
        if (g.showKind === 'golden' || g.showKind === 'chest') {
          ctx.fillStyle = '#fff6b0';
          const k = Math.floor(age * 10) % 4;
          ctx.fillRect(cx - 24 + k * 14, cy - 10 + (k % 2) * 20, 1, 3);
          ctx.fillRect(cx - 25 + k * 14, cy - 9 + (k % 2) * 20, 3, 1);
        }
        const str = '+' + g.showPts;
        const tw = textWidth(str, 2);
        drawText(ctx, str, cx - tw / 2 + 1, cy + 18, '#2a1a10', 2);
        drawText(ctx, str, cx - tw / 2, cy + 17, '#ffe070', 2);
      }
      if (g.mode === 'miss') {
        const bx = g.bob.tx, by = g.bob.ty;
        drawText(ctx, 'x', bx - 3, by - 16, '#2a1a10', 2);
        drawText(ctx, 'x', bx - 3, by - 17, '#ff7060', 2);
      }

      // ---------- HUD ----------
      // оставшиеся забросы — поплавки
      for (let i = 0; i < CASTS; i++) {
        const x = 5 + i * 6, y = 5;
        const used = i < g.cast || (i === g.cast && g.mode !== 'start' && g.mode !== 'ready' && g.mode !== 'charge');
        ctx.fillStyle = used ? 'rgba(40,30,30,0.5)' : '#f4f0e8';
        ctx.fillRect(x, y, 3, 2);
        ctx.fillStyle = used ? 'rgba(40,30,30,0.5)' : '#e04040';
        ctx.fillRect(x, y + 2, 3, 2);
      }
      // улов — маленькие значки
      let ix = 5;
      for (const kind of g.caught) {
        const sp = KINDS[kind].sp;
        drawSprite(ctx, sp, ix, 13);
        ix += sp.w + 2;
      }
      // очки и рекорд справа
      const sc = String(Math.round(g.score));
      const sw = textWidth(sc, 2);
      drawText(ctx, sc, W - 6 - sw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawText(ctx, sc, W - 6 - sw, 5, '#ffffff', 2);
      const best = String(Math.max(0, Math.floor(api.best || 0)));
      const bw2 = textWidth(best, 1);
      drawNumber(ctx, best, W - 6 - bw2, 18, '#ffe070', 1);
      drawIcon(ctx, 'trophy', W - 6 - bw2 - 10, 17);

      // экран старта
      if (g.mode === 'start') {
        ctx.fillStyle = 'rgba(16,10,8,0.55)';
        ctx.fillRect(0, 0, W, H);
        drawSprite(ctx, KINDS.golden.sp, 140, 58, 4);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const blink = Math.floor(g.t * 2) % 2 === 0;
        ctx.fillStyle = '#2a1a10';
        ctx.fillText('Нажми, чтобы начать', W / 2 + 1, 99);
        ctx.fillStyle = blink ? '#ffe070' : '#ffffff';
        ctx.fillText('Нажми, чтобы начать', W / 2, 98);
        // мини-подсказка значками: держи -> отпусти
        drawIcon(ctx, 'down', 130, 118);
        drawText(ctx, '/', 140, 118, '#ffffff');
        drawIcon(ctx, 'up', 148, 118);
        drawIcon(ctx, 'right', 158, 118);
        drawIcon(ctx, 'trophy', 168, 117);
      }
      if (g.mode === 'ready' && Math.floor(g.t * 2) % 2 === 0) {
        drawIcon(ctx, 'down', MAN_X - 2, DECK_Y - 26);
      }
    };

    // ---------- цикл ----------
    let raf = 0;
    let last = performance.now();
    let alive = true;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      const paused = api.paused && api.paused();
      if (!paused && g.mode !== 'end') update(dt);
      else pressedEdge = false;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('blur', onBlur);
      canvas.style.touchAction = prevTouch;
    };
  }
};
