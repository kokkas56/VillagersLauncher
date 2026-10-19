// Мини-игра «Защита деревни»: вид сбоку, деревня с частоколом справа, зомби идут слева волнами.
// Кликай по зомби (2–4 удара), получай изумруды, между волнами — лавка: стрелок, забор, лечение.
// Счёт = убийства + волна * 20. Всё рисуется целочисленными fillRect.

import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

const W = 320;
const H = 180;
const GROUND = 136;
const LANE_TOP = 142;
const LANE_H = 26;
const WALL_X = 248; // передняя грань частокола
const MAX_HP = 100;
const MAX_GUARDS = 4;
const MAX_FENCES = 3;
const FENCE_X = [206, 166, 126];
const GUARD_SLOTS = [262, 274, 286, 298];
const PLATFORM_Y = 106;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function sprite(pal, rows) {
  const r = [];
  let w = 0;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    w = Math.max(w, row.length);
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
  return { w, h: rows.length, r };
}
function drawSprite(ctx, sp, x, y, s = 1) {
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < sp.r.length; j += 4) {
    ctx.fillStyle = sp.r[j];
    ctx.fillRect(x + sp.r[j + 1] * s, y + sp.r[j + 2] * s, sp.r[j + 3] * s, s);
  }
}

const BOW = sprite({ a: '#a8723e', b: '#e8e2d4', c: '#c8d0dc', d: '#7a4e2a' }, [
  '..ab...', '.a.b...', 'a..b...', 'dcccccc', 'a..b...', '.a.b...', '..ab...'
]);
const FENCE = sprite({ a: '#b0804a', b: '#6a4424' }, [
  'a..a..a', 'a..a..a', 'bbbbbbb', 'a..a..a', 'bbbbbbb', 'a..a..a'
]);
const FLAG = sprite({ a: '#7a4e2a', b: '#e04848', c: '#ff8a8a' }, [
  'abbb.', 'acbbb', 'abbb.', 'a....', 'a....', 'a....'
]);
const NEXT = sprite({ a: '#ffffff' }, [
  'a...a....', 'aa..aa...', 'aaa.aaa..', 'aaaaaaaa.', 'aaa.aaa..', 'aa..aa...', 'a...a....'
]);

// типы зомби
const TYPES = {
  normal: { hp: 3, spd: 10, dps: 4, gem: 2, s: 1 },
  fast: { hp: 2, spd: 21, dps: 3, gem: 2, s: 1 },
  big: { hp: 4, spd: 6, dps: 8, gem: 4, s: 2 }
};
// габариты (относительно ног: x — центр, y — уровень ног)
const BOX = {
  normal: { l: -2, r: 5, t: -13 },
  fast: { l: -2, r: 4, t: -10 },
  big: { l: -4, r: 10, t: -25 }
};
const PAD = 3; // щедрость попадания мышью

export default {
  id: 'defense',
  title: 'Защита деревни',
  desc: 'Отбивайся от волн зомби кликами, нанимай стрелков и строй заборы.',
  controls: 'Мышь: клик по зомби · в лавке: клик / 1 2 3, Пробел — следующая волна',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rand = Math.random;
    const prevCursor = canvas.style.cursor;
    const prevTouch = canvas.style.touchAction;
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';

    // ---------- мир ----------
    const stars = [];
    for (let i = 0; i < 46; i++) stars.push({ x: Math.floor(rand() * W), y: Math.floor(rand() * 90), p: rand() * 6, big: rand() > 0.9 });
    const hills = [];
    for (let x = 0; x < W; x += 4) hills.push(Math.floor(118 - 10 * Math.sin(x / 41) - 6 * Math.sin(x / 15 + 1) - rand() * 2));
    const trees = [];
    for (let x = 4; x < 236; x += 10 + Math.floor(rand() * 18)) trees.push({ x, h: 8 + Math.floor(rand() * 10), w: 5 + Math.floor(rand() * 5) });
    const tufts = [];
    for (let i = 0; i < 40; i++) tufts.push({ x: Math.floor(rand() * 244), y: GROUND + 3 + Math.floor(rand() * 40) });

    // пулы
    const zombies = [];
    for (let i = 0; i < 48; i++) zombies.push({ on: false, type: 'normal', x: 0, y: 0, hp: 0, max: 0, spd: 0, flash: 0, kb: 0, atk: false, phase: 0 });
    const parts = [];
    for (let i = 0; i < 110; i++) parts.push({ on: false, gem: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff' });
    const arrows = [];
    for (let i = 0; i < 30; i++) arrows.push({ on: false, x: 0, y: 0, vx: 0, vy: 0 });
    const slashes = [];
    for (let i = 0; i < 6; i++) slashes.push({ on: false, x: 0, y: 0, life: 0, d: 1 });
    const order = []; // для сортировки по глубине (переиспользуемый)

    const g = {
      mode: 'start', // start | play | shop | over
      t: 0,
      hp: MAX_HP, gems: 0, kills: 0, wave: 0,
      toSpawn: 0, spawnT: 0, spawnInt: 2, spdMul: 1,
      shopT: 0, banner: 0, shake: 0, hurtSnd: 0, hurtFlash: 0,
      guards: [], fences: 0,
      overSent: false
    };
    const score = () => g.kills + g.wave * 20;

    const priceGuard = () => 25 + g.guards.length * 20;
    const priceFence = () => 12 + g.fences * 10;
    const priceHeal = () => 10 + g.wave * 3;

    const addPart = (x, y, vx, vy, life, c, gem = false) => {
      for (const p of parts) {
        if (p.on) continue;
        p.on = true; p.gem = gem; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.c = c;
        return;
      }
    };
    const burst = (x, y, n, colors, sp = 30) => {
      for (let i = 0; i < n; i++) addPart(x, y, (rand() - 0.5) * sp * 2, -rand() * sp - 10, 0.35 + rand() * 0.4, colors[i % colors.length]);
    };

    const startWave = () => {
      g.wave++;
      g.mode = 'play';
      g.toSpawn = 3 + 5 * g.wave;
      g.spawnInt = Math.max(7, 19 - 1.7 * g.wave) / g.toSpawn;
      g.spawnT = 1.2;
      g.spdMul = 1 + 0.15 * (g.wave - 1);
      g.banner = 1.8;
      api.sfx('click');
    };

    const spawn = () => {
      const n = g.wave;
      const pFast = Math.min(0.4, 0.1 * (n - 1));
      const pBig = n >= 3 ? Math.min(0.35, 0.09 * (n - 2)) : 0;
      const r = rand();
      const type = r < pBig ? 'big' : r < pBig + pFast ? 'fast' : 'normal';
      for (const z of zombies) {
        if (z.on) continue;
        const T = TYPES[type];
        z.on = true; z.type = type;
        z.x = -12 - rand() * 6;
        z.y = LANE_TOP + Math.floor(rand() * LANE_H);
        z.hp = T.hp; z.max = T.hp;
        z.spd = T.spd * g.spdMul * (0.9 + rand() * 0.2);
        z.flash = 0; z.kb = 0; z.atk = false; z.phase = rand() * 6;
        return;
      }
    };

    const killZombie = (z) => {
      z.on = false;
      g.kills++;
      const T = TYPES[z.type];
      g.gems += T.gem;
      const cy = z.y - 6 * T.s;
      burst(z.x + 1, cy, 10, ['#9aa0a0', '#c8cccc', '#5f8a4e', '#6a6e70'], 26);
      for (let i = 0; i < T.gem; i++) addPart(z.x + 1, cy, (rand() - 0.5) * 40, -30 - rand() * 20, 1.4, '#2fd36a', true);
      api.sfx('coin');
    };

    const damage = (z, amount, kb) => {
      z.hp -= amount;
      z.flash = 0.1;
      z.kb = kb / TYPES[z.type].s;
      const T = TYPES[z.type];
      burst(z.x + 1, z.y - 7 * T.s, 3, ['#5f8a4e', '#4b6e3d', '#8bb070'], 18);
      if (z.hp <= 0) killZombie(z);
    };

    const hitTest = (x, y, pad) => {
      let best = null;
      for (const z of zombies) {
        if (!z.on) continue;
        const b = BOX[z.type];
        if (x >= z.x + b.l - pad && x <= z.x + b.r + pad && y >= z.y + b.t - pad && y <= z.y + 1 + pad) {
          if (!best || z.x > best.x) best = z;
        }
      }
      return best;
    };

    // ---------- лавка ----------
    const CARD_Y = 62, CARD_W = 40, CARD_H = 52;
    const cardX = (i) => 70 + i * 46;
    const canBuy = (i) => {
      if (i === 0) return g.guards.length < MAX_GUARDS && g.gems >= priceGuard();
      if (i === 1) return g.fences < MAX_FENCES && g.gems >= priceFence();
      if (i === 2) return g.hp < MAX_HP && g.gems >= priceHeal();
      return true;
    };
    const buy = (i) => {
      if (g.mode !== 'shop') return;
      if (i === 3) { startWave(); return; }
      if (!canBuy(i)) { api.sfx('hit'); return; }
      if (i === 0) {
        g.gems -= priceGuard();
        g.guards.push({ x: GUARD_SLOTS[g.guards.length], cd: 0.6 + rand() * 0.6, rec: 0 });
      } else if (i === 1) {
        g.gems -= priceFence();
        g.fences++;
      } else if (i === 2) {
        g.gems -= priceHeal();
        g.hp = Math.min(MAX_HP, g.hp + 20);
      }
      api.sfx('coin');
    };

    // ---------- ввод ----------
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * W, y: ((e.clientY - r.top) / Math.max(1, r.height)) * H };
    };
    const onPointerDown = (e) => {
      e.preventDefault();
      if (api.paused && api.paused()) return;
      const p = toLocal(e);
      if (g.mode === 'start') { startWave(); return; }
      if (g.mode === 'shop') {
        for (let i = 0; i < 4; i++) {
          const x = cardX(i);
          if (p.x >= x && p.x <= x + CARD_W && p.y >= CARD_Y && p.y <= CARD_Y + CARD_H) { buy(i); return; }
        }
        return;
      }
      if (g.mode !== 'play') return;
      for (const s of slashes) {
        if (s.on) continue;
        s.on = true; s.x = Math.round(p.x); s.y = Math.round(p.y); s.life = 0.14; s.d = rand() > 0.5 ? 1 : -1;
        break;
      }
      const z = hitTest(p.x, p.y, PAD);
      if (z) {
        damage(z, 1, 5);
        if (z.on) api.sfx('hit');
      } else {
        burst(p.x, p.y, 2, ['#c8b890'], 10);
      }
    };
    const onCtx = (e) => e.preventDefault();
    const onKeyDown = (e) => {
      const c = e.code;
      if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        if (g.mode === 'start') startWave();
        else if (g.mode === 'shop') startWave();
      } else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3' || c === 'Numpad1' || c === 'Numpad2' || c === 'Numpad3') {
        e.preventDefault();
        if (e.repeat) return;
        buy(Number(c[c.length - 1]) - 1);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKeyDown);

    // ---------- обновление ----------
    const update = (dt) => {
      g.t += dt;
      if (g.banner > 0) g.banner -= dt;
      if (g.shake > 0) g.shake -= dt;
      if (g.hurtSnd > 0) g.hurtSnd -= dt;
      if (g.hurtFlash > 0) g.hurtFlash -= dt;

      // частицы
      for (const p of parts) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.gem) {
          // изумруд: подпрыгнул, потом летит к счётчику
          if (p.life > 1.0) {
            p.vy += 160 * dt;
          } else {
            const tx = 62, ty = 6;
            p.vx = (tx - p.x) * 6;
            p.vy = (ty - p.y) * 6;
            if (Math.abs(tx - p.x) < 4 && Math.abs(ty - p.y) < 4) p.life = 0;
          }
        } else p.vy += 140 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) p.on = false;
      }
      for (const s of slashes) if (s.on && (s.life -= dt) <= 0) s.on = false;

      if (g.mode === 'shop') {
        g.shopT -= dt;
        if (g.shopT <= 0) startWave();
        return;
      }
      if (g.mode !== 'play') return;

      // спавн
      if (g.toSpawn > 0) {
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          spawn();
          g.toSpawn--;
          if (g.wave >= 3 && g.toSpawn > 0 && rand() < Math.min(0.45, 0.05 * g.wave + 0.1)) { spawn(); g.toSpawn--; }
          g.spawnT = g.spawnInt * (0.7 + rand() * 0.6);
        }
      }

      // зомби
      let alive = 0;
      let dmg = 0;
      for (const z of zombies) {
        if (!z.on) continue;
        alive++;
        const T = TYPES[z.type];
        if (z.flash > 0) z.flash -= dt;
        if (z.kb > 0) {
          z.x -= z.kb * 14 * dt;
          z.kb -= dt * 30;
          if (z.kb < 0) z.kb = 0;
        }
        const front = BOX[z.type].r;
        if (z.x + front >= WALL_X) {
          z.x = WALL_X - front;
          z.atk = true;
          dmg += T.dps * dt;
        } else {
          z.atk = false;
          let v = z.spd;
          for (let i = 0; i < g.fences; i++) if (Math.abs(z.x + 1 - FENCE_X[i]) < 8) v *= 0.5;
          if (z.kb <= 0) z.x += v * dt;
        }
      }
      if (dmg > 0) {
        g.hp -= dmg;
        g.shake = 0.15;
        g.hurtFlash = 0.2;
        if (g.hurtSnd <= 0) {
          g.hurtSnd = 0.7;
          api.sfx('hit');
          burst(WALL_X, LANE_TOP + rand() * LANE_H - 8, 3, ['#a8723e', '#7a4e2a'], 20);
        }
        if (g.hp <= 0) {
          g.hp = 0;
          g.mode = 'over';
          if (!g.overSent) {
            g.overSent = true;
            api.sfx('lose');
            api.over(score());
          }
          return;
        }
      }

      // стрелки
      for (const gd of g.guards) {
        if (gd.rec > 0) gd.rec -= dt;
        gd.cd -= dt;
        if (gd.cd > 0) continue;
        let target = null;
        for (const z of zombies) if (z.on && z.x > 4 && (!target || z.x > target.x)) target = z;
        if (!target) { gd.cd = 0.2; continue; }
        gd.cd = 2.2;
        gd.rec = 0.2;
        const sx = gd.x - 3, sy = PLATFORM_Y - 7;
        const T = TYPES[target.type];
        const dist = Math.abs(target.x - sx);
        const ft = clamp(dist / 150, 0.35, 1.3);
        const tx = target.atk ? target.x : target.x + target.spd * ft;
        const ty = target.y - 6 * T.s;
        for (const a of arrows) {
          if (a.on) continue;
          a.on = true; a.x = sx; a.y = sy;
          a.vx = (tx - sx) / ft;
          a.vy = (ty - sy) / ft - 0.5 * 140 * ft;
          break;
        }
      }
      for (const a of arrows) {
        if (!a.on) continue;
        a.vy += 140 * dt;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        if (a.y > H || a.x < -8) { a.on = false; continue; }
        const z = hitTest(a.x, a.y, 1);
        if (z) {
          a.on = false;
          damage(z, 1, 3);
        } else if (a.y > LANE_TOP + LANE_H + 2) {
          a.on = false;
          burst(a.x, a.y, 2, ['#8a6a40'], 8);
        }
      }

      // конец волны
      if (g.toSpawn <= 0 && alive === 0) {
        const bonus = 4 + g.wave;
        g.gems += bonus;
        g.mode = 'shop';
        g.shopT = 12;
        api.sfx('win');
      }
    };

    // ---------- отрисовка ----------
    const drawZombie = (z, dark) => {
      const T = TYPES[z.type];
      const s = T.s;
      const x = Math.round(z.x);
      const y = Math.round(z.y);
      const fl = z.flash > 0;
      const sh = (c) => (fl ? '#ffffff' : rgb(mix(c, [16, 18, 30], dark * 0.45)));
      const walk = !z.atk && z.kb <= 0;
      const step = walk ? Math.floor((g.t * (z.type === 'fast' ? 9 : 4) + z.phase) % 2) : 0;
      const bob = z.atk ? Math.round(Math.sin(g.t * 10 + z.phase)) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (z.type === 'fast') {
        // мелкий быстрый: голова 3x3, тело 3x5
        const y0 = y - 10;
        ctx.fillRect(x - 2, y + 1, 6, 1);
        ctx.fillStyle = sh([42, 52, 80]);
        ctx.fillRect(x - 1 + step, y - 2, 1, 2);
        ctx.fillRect(x + 1 - step, y - 2, 1, 2);
        ctx.fillStyle = sh([84, 110, 140]);
        ctx.fillRect(x - 1, y0 + 3, 3, 5);
        ctx.fillStyle = sh([95, 138, 78]);
        ctx.fillRect(x - 1, y0, 3, 3);
        ctx.fillRect(x + 2, y0 + 4 + bob, 2, 1);
        ctx.fillStyle = sh([75, 110, 61]);
        ctx.fillRect(x, y0 + 6, 1, 1);
        ctx.fillStyle = fl ? '#ffffff' : '#c02020';
        ctx.fillRect(x + 1, y0 + 1, 1, 1);
      } else {
        const y0 = y - 12 * s;
        ctx.fillRect(x - 3 * s, y + 1, 8 * s, 1);
        // ноги
        ctx.fillStyle = sh([42, 52, 80]);
        ctx.fillRect(x - s + (step ? s : 0), y0 + 10 * s, s, 2 * s);
        ctx.fillRect(x + s - (step ? s : 0), y0 + 10 * s, s, 2 * s);
        // рваная рубаха
        ctx.fillStyle = sh([74, 106, 138]);
        ctx.fillRect(x - 2 * s, y0 + 4 * s, 5 * s, 7 * s);
        ctx.fillStyle = sh([46, 62, 90]);
        ctx.fillRect(x - 2 * s, y0 + 9 * s, 5 * s, 2 * s);
        ctx.fillStyle = sh([95, 138, 78]);
        ctx.fillRect(x - s, y0 + 6 * s, s, s); // дыра — кожа
        ctx.fillRect(x + s, y0 + 8 * s, s, s);
        ctx.fillRect(x - 2 * s, y0 + 10 * s, s, s); // рваный край
        // руки вперёд
        ctx.fillRect(x + 2 * s, y0 + 5 * s + bob * s, 3 * s, s);
        ctx.fillStyle = sh([75, 110, 61]);
        ctx.fillRect(x + 2 * s, y0 + 6 * s + bob * s, 2 * s, s);
        // голова
        ctx.fillStyle = sh([95, 138, 78]);
        ctx.fillRect(x - s, y0, 4 * s, 4 * s);
        ctx.fillStyle = sh([75, 110, 61]);
        ctx.fillRect(x - s, y0 + 3 * s, 4 * s, s);
        ctx.fillRect(x - s, y0, s, s);
        ctx.fillStyle = fl ? '#ffffff' : '#c02020';
        ctx.fillRect(x + 2 * s, y0 + s, s, s);
      }
      // полоска здоровья, если ранен
      if (z.hp < z.max) {
        const bw = z.max * 2 + 1;
        const bx = x - Math.floor(bw / 2) + 1;
        const by = y + BOX[z.type].t - 3;
        ctx.fillStyle = 'rgba(20,10,10,0.8)';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#e04848';
        for (let i = 0; i < z.hp; i++) ctx.fillRect(bx + 1 + i * 2, by + 1, 1, 1);
      }
    };

    const drawGuard = (gd, dark) => {
      const x = gd.x, y = PLATFORM_Y - 12;
      const sh = (c) => rgb(mix(c, [16, 18, 30], dark * 0.4));
      ctx.fillStyle = sh([60, 44, 34]);
      ctx.fillRect(x - 1, y + 10, 1, 2);
      ctx.fillRect(x + 1, y + 10, 1, 2);
      ctx.fillStyle = sh([120, 80, 50]);
      ctx.fillRect(x - 2, y + 4, 5, 7);
      ctx.fillStyle = sh([90, 60, 40]);
      ctx.fillRect(x - 2, y + 7, 5, 1);
      ctx.fillStyle = sh([232, 190, 150]);
      ctx.fillRect(x - 1, y, 4, 4);
      ctx.fillStyle = sh([40, 30, 30]);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      // шлем
      ctx.fillStyle = sh([150, 156, 168]);
      ctx.fillRect(x - 2, y - 1, 6, 1);
      ctx.fillRect(x - 1, y - 2, 4, 1);
      // лук влево
      const rc = gd.rec > 0 ? 1 : 0;
      ctx.fillStyle = sh([168, 114, 62]);
      ctx.fillRect(x - 4 + rc, y + 3, 1, 1);
      ctx.fillRect(x - 5 + rc, y + 4, 1, 3);
      ctx.fillRect(x - 4 + rc, y + 7, 1, 1);
      ctx.fillStyle = 'rgba(232,226,212,0.8)';
      ctx.fillRect(x - 3 + rc, y + 4, 1, 3);
      ctx.fillStyle = sh([232, 190, 150]);
      ctx.fillRect(x - 3, y + 5, 2, 1);
    };

    const draw = () => {
      const dark = clamp(0.2 + 0.1 * (Math.max(1, g.wave) - 1), 0.2, 0.85);
      const top = mix([90, 110, 170], [10, 12, 34], dark);
      const bot = mix([240, 150, 100], [44, 34, 70], dark);
      const sx = g.shake > 0 ? Math.round((rand() - 0.5) * 2) : 0;
      ctx.save();
      ctx.translate(sx, 0);
      for (let y = 0; y < GROUND; y += 4) {
        ctx.fillStyle = rgb(mix(top, bot, y / GROUND));
        ctx.fillRect(-2, y, W + 4, 4);
      }
      // звёзды и луна
      if (dark > 0.3) {
        for (const s of stars) {
          const a = (dark - 0.3) * (0.5 + 0.5 * Math.sin(g.t * 1.5 + s.p));
          ctx.fillStyle = `rgba(255,250,230,${a})`;
          ctx.fillRect(s.x, s.y, s.big ? 2 : 1, 1);
        }
      }
      ctx.fillStyle = rgb(mix([255, 230, 170], [235, 238, 250], dark), 0.25);
      ctx.fillRect(52, 18, 16, 16);
      ctx.fillStyle = rgb(mix([255, 230, 170], [235, 238, 250], dark));
      ctx.fillRect(55, 21, 10, 10);
      ctx.fillStyle = rgb(mix([230, 200, 140], [190, 198, 220], dark));
      ctx.fillRect(58, 23, 3, 2);
      ctx.fillRect(61, 27, 2, 2);
      // холмы и деревья
      const hill = mix([86, 110, 90], [18, 22, 36], dark);
      ctx.fillStyle = rgb(hill);
      for (let i = 0; i < hills.length; i++) ctx.fillRect(i * 4, hills[i], 4, GROUND - hills[i]);
      const tree = mix([60, 96, 60], [14, 22, 26], dark);
      for (const tr of trees) {
        ctx.fillStyle = rgb(mix([70, 50, 36], [16, 14, 20], dark));
        ctx.fillRect(tr.x + Math.floor(tr.w / 2), GROUND - 4, 1, 4);
        ctx.fillStyle = rgb(tree);
        ctx.fillRect(tr.x, GROUND - 3 - tr.h, tr.w, tr.h);
        ctx.fillRect(tr.x + 1, GROUND - 5 - tr.h, tr.w - 2, 2);
      }
      // земля
      const grass = mix([84, 150, 60], [16, 26, 24], dark * 0.85);
      ctx.fillStyle = rgb(grass);
      ctx.fillRect(-2, GROUND, W + 4, H - GROUND);
      ctx.fillStyle = rgb(mix(grass, [0, 0, 0], 0.15));
      for (let x = 0; x < W; x += 6) ctx.fillRect(x, GROUND, 3, 1);
      ctx.fillStyle = rgb(mix([150, 120, 80], [28, 24, 28], dark * 0.85));
      ctx.fillRect(-2, LANE_TOP + 4, W + 4, LANE_H - 6);
      ctx.fillStyle = rgb(mix([170, 140, 96], [34, 30, 34], dark * 0.85));
      for (let x = 3; x < W; x += 9) ctx.fillRect(x, LANE_TOP + 8 + (x % 3) * 5, 3, 1);
      ctx.fillStyle = rgb(mix(grass, [140, 200, 90], 0.25));
      for (const tf of tufts) ctx.fillRect(tf.x, tf.y, 1, 2);

      // дома за частоколом
      const houses = [[262, 26, 28], [292, 28, 36]];
      for (const [hx, hw, hh] of houses) {
        const base = GROUND + 4;
        const y = base - hh;
        const wall = mix([200, 168, 116], [40, 34, 44], dark * 0.75);
        const roof = mix([150, 60, 44], [30, 18, 26], dark * 0.7);
        ctx.fillStyle = rgb(wall);
        ctx.fillRect(hx, y, hw, hh);
        ctx.fillStyle = rgb(mix(wall, [0, 0, 0], 0.12));
        for (let yy = y + 4; yy < base; yy += 4) ctx.fillRect(hx, yy, hw, 1);
        const rh = Math.floor(hw / 2.4);
        for (let i = 0; i < rh; i++) {
          const inset = Math.floor(i * (hw / 2 + 2) / rh);
          ctx.fillStyle = rgb(i % 3 === 0 ? mix(roof, [0, 0, 0], 0.18) : roof);
          ctx.fillRect(hx - 3 + inset, y - i, hw + 6 - inset * 2, 1);
        }
        const fl = 0.85 + 0.15 * Math.sin(g.t * 7 + hx);
        ctx.fillStyle = dark > 0.3 ? `rgb(255,${(200 * fl) | 0},${(90 * fl) | 0})` : rgb(mix([120, 160, 190], [30, 34, 50], dark));
        ctx.fillRect(hx + 4, y + 6, 4, 4);
        ctx.fillRect(hx + hw - 8, y + 6, 4, 4);
        if (dark > 0.3) {
          ctx.fillStyle = `rgba(255,190,90,${0.15 * dark})`;
          ctx.fillRect(hx + 1, y + 3, 10, 10);
          ctx.fillRect(hx + hw - 11, y + 3, 10, 10);
        }
      }
      // помост стрелков
      const wood = mix([150, 108, 66], [40, 30, 30], dark * 0.7);
      const woodD = mix(wood, [0, 0, 0], 0.3);
      ctx.fillStyle = rgb(woodD);
      for (let x = 258; x < 314; x += 14) ctx.fillRect(x, PLATFORM_Y + 2, 2, GROUND + 4 - PLATFORM_Y);
      ctx.fillStyle = rgb(wood);
      ctx.fillRect(254, PLATFORM_Y, 62, 3);
      ctx.fillStyle = rgb(woodD);
      ctx.fillRect(254, PLATFORM_Y + 3, 62, 1);
      for (const gd of g.guards) drawGuard(gd, dark);

      // заборы
      for (let i = 0; i < g.fences; i++) {
        const fx = FENCE_X[i];
        for (let row = 0; row < 3; row++) {
          const by = LANE_TOP + 6 + row * 9;
          ctx.fillStyle = rgb(woodD);
          ctx.fillRect(fx - 5, by - 3, 11, 1);
          ctx.fillRect(fx - 5, by - 6, 11, 1);
          ctx.fillStyle = rgb(wood);
          ctx.fillRect(fx - 5, by - 8, 2, 9);
          ctx.fillRect(fx, by - 9, 2, 10);
          ctx.fillRect(fx + 5, by - 8, 2, 9);
        }
      }

      // зомби — по глубине
      order.length = 0;
      for (const z of zombies) if (z.on) order.push(z);
      order.sort((a, b) => a.y - b.y);
      for (const z of order) drawZombie(z, dark);

      // частокол
      const stake = mix([130, 92, 56], [36, 28, 28], dark * 0.7);
      for (let x = WALL_X; x < WALL_X + 10; x += 3) {
        ctx.fillStyle = rgb(x % 2 ? stake : mix(stake, [0, 0, 0], 0.15));
        ctx.fillRect(x, 100, 3, H - 100);
        ctx.fillRect(x + 1, 98, 1, 2);
      }
      ctx.fillStyle = rgb(mix(stake, [0, 0, 0], 0.35));
      ctx.fillRect(WALL_X, 112, 10, 1);
      ctx.fillRect(WALL_X, 150, 10, 1);
      // факел у ворот
      const tf = 0.75 + 0.25 * Math.sin(g.t * 11) * Math.sin(g.t * 4.3);
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(WALL_X - 2, 120, 1, 6);
      ctx.fillStyle = `rgb(255,${(180 * tf) | 0},60)`;
      ctx.fillRect(WALL_X - 3, 117, 3, 3);
      ctx.fillStyle = `rgba(255,170,70,${0.12 + 0.12 * dark * tf})`;
      ctx.fillRect(WALL_X - 12, 108, 20, 20);

      // стрелы
      ctx.fillStyle = '#e8e2d4';
      for (const a of arrows) {
        if (!a.on) continue;
        const sp = Math.hypot(a.vx, a.vy) || 1;
        const ux = a.vx / sp, uy = a.vy / sp;
        for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(a.x - ux * k), Math.round(a.y - uy * k), 1, 1);
      }
      // частицы
      for (const p of parts) {
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        if (p.gem) {
          ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
        } else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      // взмахи
      for (const s of slashes) {
        if (!s.on) continue;
        ctx.fillStyle = `rgba(255,255,255,${clamp(s.life / 0.14, 0, 1)})`;
        for (let k = -3; k <= 3; k++) ctx.fillRect(s.x + k, s.y + k * s.d, 1, 1);
        ctx.fillRect(s.x - 1, s.y, 3, 1);
      }
      ctx.restore();

      if (g.hurtFlash > 0) {
        ctx.fillStyle = `rgba(200,30,30,${0.12 * (g.hurtFlash / 0.2)})`;
        ctx.fillRect(W - 80, 0, 80, H);
      }

      // ---------- HUD ----------
      ctx.fillStyle = 'rgba(16,10,8,0.55)';
      ctx.fillRect(2, 2, 148, 11);
      drawIcon(ctx, 'heart', 4, 4);
      ctx.fillStyle = '#2a1414';
      ctx.fillRect(13, 5, 42, 5);
      const hpw = Math.round(40 * g.hp / MAX_HP);
      ctx.fillStyle = g.hp < 30 ? (Math.floor(g.t * 6) % 2 ? '#ff5050' : '#b02a2a') : '#e04848';
      ctx.fillRect(14, 6, hpw, 3);
      drawIcon(ctx, 'emerald', 60, 3);
      drawNumber(ctx, g.gems, 67, 5, '#8af0a8');
      drawIcon(ctx, 'skull', 88, 4);
      drawNumber(ctx, g.kills, 97, 5, '#e8e2d4');
      drawSprite(ctx, FLAG, 120, 4);
      drawNumber(ctx, g.wave, 127, 5, '#ffb0a0');

      const sc = String(score());
      const sw = textWidth(sc, 2);
      drawText(ctx, sc, W - 6 - sw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawText(ctx, sc, W - 6 - sw, 5, '#ffffff', 2);
      const best = String(Math.max(0, Math.floor(api.best || 0)));
      const bw = textWidth(best, 1);
      drawNumber(ctx, best, W - 6 - bw, 18, '#ffe070');
      drawIcon(ctx, 'trophy', W - 6 - bw - 10, 17);

      // баннер волны
      if (g.mode === 'play' && g.banner > 0) {
        const a = Math.min(1, g.banner * 2);
        ctx.fillStyle = `rgba(16,10,8,${0.5 * a})`;
        ctx.fillRect(110, 50, 100, 26);
        drawSprite(ctx, FLAG, 128, 55, 3);
        drawNumber(ctx, g.wave, 150, 55, '#ffb0a0', 3);
      }

      // лавка
      if (g.mode === 'shop') {
        ctx.fillStyle = 'rgba(16,10,8,0.72)';
        ctx.fillRect(62, 40, 196, 82);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(62, 40, 196, 1);
        ctx.fillRect(62, 121, 196, 1);
        // таймер
        drawIcon(ctx, 'clock', 66, 45);
        drawNumber(ctx, Math.ceil(g.shopT), 75, 46, '#e8e2d4');
        // бонус за волну
        drawIcon(ctx, 'emerald', 238, 44);
        drawNumber(ctx, g.gems, 245, 46, '#8af0a8');
        for (let i = 0; i < 4; i++) {
          const x = cardX(i), y = CARD_Y;
          const ok = canBuy(i);
          const maxed = (i === 0 && g.guards.length >= MAX_GUARDS) || (i === 1 && g.fences >= MAX_FENCES) || (i === 2 && g.hp >= MAX_HP);
          ctx.fillStyle = i === 3 ? 'rgba(60,110,60,0.9)' : ok ? 'rgba(90,64,40,0.95)' : 'rgba(50,40,36,0.9)';
          ctx.fillRect(x, y, CARD_W, CARD_H);
          ctx.fillStyle = ok ? '#c8a060' : '#5a4a40';
          ctx.fillRect(x, y, CARD_W, 1);
          ctx.fillRect(x, y + CARD_H - 1, CARD_W, 1);
          // номер клавиши
          if (i < 3) drawNumber(ctx, i + 1, x + 2, y + 2, 'rgba(255,255,255,0.5)');
          const ix = x + CARD_W / 2;
          if (i === 0) drawSprite(ctx, BOW, ix - 7, y + 8, 2);
          else if (i === 1) drawSprite(ctx, FENCE, ix - 7, y + 9, 2);
          else if (i === 2) { drawIcon(ctx, 'heart', ix - 7, y + 9, 2); drawText(ctx, '+20', ix - 5, y + 24, '#ffb0b0'); }
          else drawSprite(ctx, NEXT, ix - 9, y + 12, 2);
          // счётчики купленного
          if (i === 0) for (let k = 0; k < MAX_GUARDS; k++) { ctx.fillStyle = k < g.guards.length ? '#ffe070' : '#3a2e28'; ctx.fillRect(x + 8 + k * 7, y + 26, 4, 2); }
          if (i === 1) for (let k = 0; k < MAX_FENCES; k++) { ctx.fillStyle = k < g.fences ? '#ffe070' : '#3a2e28'; ctx.fillRect(x + 11 + k * 7, y + 26, 4, 2); }
          // цена
          if (i < 3) {
            if (maxed) drawText(ctx, i === 2 ? '100%' : 'x', ix - textWidth(i === 2 ? '100%' : 'x') / 2, y + 40, '#8a7a70');
            else {
              const pr = i === 0 ? priceGuard() : i === 1 ? priceFence() : priceHeal();
              const pw = textWidth(String(pr)) + 7;
              drawIcon(ctx, 'emerald', ix - pw / 2, y + 38);
              drawNumber(ctx, pr, ix - pw / 2 + 7, y + 40, ok ? '#8af0a8' : '#c06060');
            }
          } else {
            drawSprite(ctx, FLAG, ix - 8, y + 37);
            drawNumber(ctx, g.wave + 1, ix - 1, y + 38, '#ffffff');
          }
        }
      }

      if (g.mode === 'start') {
        ctx.fillStyle = 'rgba(16,10,8,0.55)';
        ctx.fillRect(0, 0, W, H);
        drawIcon(ctx, 'sword', 138, 60, 3);
        drawIcon(ctx, 'heart', 166, 63, 3);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#2a1a10';
        ctx.fillText('Нажми, чтобы начать', W / 2 + 1, 99);
        ctx.fillStyle = Math.floor(g.t * 2) % 2 === 0 ? '#ffe070' : '#ffffff';
        ctx.fillText('Нажми, чтобы начать', W / 2, 98);
      }
      if (g.mode === 'over') {
        ctx.fillStyle = 'rgba(40,6,6,0.45)';
        ctx.fillRect(0, 0, W, H);
        drawIcon(ctx, 'skull', 146, 70, 4);
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
      if (!paused && g.mode !== 'over') update(dt);
      else if (!paused && g.mode === 'over') g.t += dt;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = prevCursor;
      canvas.style.touchAction = prevTouch;
    };
  }
};
