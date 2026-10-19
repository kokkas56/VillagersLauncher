// «Тюремная смена» — куй заказы на наковальне в ритм и тайком копай подкоп, пока стражник не смотрит.
import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

const W = 320;
const H = 180;
const FLOOR = 148; // линия пола (ноги)
const U = 2; // масштаб человечков
const ANVIL_X = 168;
const SMITH_X = 150; // где стоит заключённый у наковальни
const DIG_X = 112; // тайник с подкопом
const VIS = 96; // дальность взгляда стражника
const SHIFT = 120; // смена, секунд
const BTN = { x: 274, y: 140, w: 42, h: 36 }; // кнопка-лопата

const ORDERS = [
  { icon: 'horseshoe', speed: 0.85, mult: 1 },
  { icon: 'pickaxe', speed: 1.1, mult: 1.5 },
  { icon: 'sword', speed: 1.35, mult: 2 }
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'prison',
  title: 'Тюремная смена',
  desc: 'Куй заказы в ритм на наковальне и тайком копай подкоп, пока стражник не смотрит.',
  controls: 'Пробел/↑/клик — удар молотом · держи ↓ или кнопку-лопату — копать',

  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const rand = rng((Date.now() ^ 0xa11e) >>> 0);
    const best = Math.max(0, Math.floor(Number(api && api.best) || 0));
    const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (e) { /* звук не обязателен */ } };

    // ---- фон: кирпичи считаем один раз ----
    const bricks = [];
    for (let row = 0; row * 9 < FLOOR; row++) {
      const off = row & 1 ? 9 : 0;
      for (let x = -off; x < W; x += 18) {
        const r = rand();
        if (r < 0.28) bricks.push(x + 1, row * 9 + 1, 17, 8, r < 0.12 ? 0 : 1);
      }
    }
    const stones = [];
    for (let i = 0; i < 40; i++) stones.push(Math.floor(rand() * W), FLOOR + 6 + Math.floor(rand() * 26), 2 + Math.floor(rand() * 3));

    // ---- состояние ----
    let mode = 'ready'; // ready | run | end | over
    let clock = 0;
    let time = 0;
    let endT = 0;
    let scoreV = 0;
    let lives = 3;
    // ковка
    let order = null;
    let orderGap = 0;
    let marker = 0;
    let mdir = 1;
    let zoneC = 0.5;
    let hitCd = 0;
    let swing = 0;
    let lastQ = -1; // качество последнего удара для подсветки
    let lastQT = 0;
    let combo = 0;
    let done = 0;
    // подкоп
    let digHoldKey = false;
    let digHoldPtr = false;
    let digging = false;
    let segs = 0;
    let prog = 0;
    let digSnd = 0;
    let seenT = 0;
    // стражник
    const guard = { x: 236, dir: 1, state: 'walk', t: 0, look: 0 };

    const parts = [];
    for (let i = 0; i < 40; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff', g: 1 });
    const spark = (x, y, n, c, spd, g = 1) => {
      for (const p of parts) {
        if (n <= 0) break;
        if (p.on) continue;
        p.on = true;
        p.x = x; p.y = y;
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
        const v = spd * (0.4 + rand() * 0.8);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
        p.life = 0.3 + rand() * 0.4;
        p.c = c; p.g = g;
        n--;
      }
    };
    const pops = [];
    for (let i = 0; i < 6; i++) pops.push({ on: false, x: 0, y: 0, s: '', c: '#fff', life: 0 });
    const pop = (x, y, s, c) => {
      let p = pops.find((q) => !q.on) || pops[0];
      p.on = true; p.x = x; p.y = y; p.s = s; p.c = c; p.life = 1;
    };

    const timeLeft = () => Math.max(0, SHIFT - time);
    const guardSpeed = () => 20 + 26 * Math.min(1, time / SHIFT);
    const zoneW = () => 0.15 - 0.05 * Math.min(1, time / SHIFT);
    const segTime = () => 4.5 + segs * 0.9;

    const newOrder = () => {
      const tier = time < 25 ? 1 : time < 60 ? 2 : 3;
      const o = ORDERS[Math.floor(rand() * tier)];
      const pat = 11 - 3.5 * Math.min(1, time / SHIFT);
      order = { o, hits: [], pat, max: pat };
      zoneC = 0.2 + rand() * 0.6;
      marker = 0; mdir = 1;
    };

    const start = () => {
      if (mode !== 'ready') return;
      mode = 'run';
      sfx('click');
      newOrder();
    };

    const finish = () => {
      if (mode !== 'run') return;
      mode = 'end';
      endT = 0;
      digging = false;
      sfx(lives > 0 ? 'win' : 'lose');
    };

    // ---- удар молотом ----
    const hit = () => {
      if (mode === 'ready') { start(); return; }
      if (mode !== 'run' || !order || orderGap > 0) return;
      if (hitCd > 0 || digging) return;
      const half = zoneW() / 2;
      const d = Math.abs(marker - zoneC);
      let q = 0;
      if (d <= half) q = 2;
      else if (d <= half + 0.11) q = 1;
      swing = 0.16;
      hitCd = q === 0 ? 0.45 : 0.28;
      lastQ = q; lastQT = 0.5;
      order.hits.push(q);
      const m = order.o.mult;
      const ax = ANVIL_X + 2, ay = FLOOR - 22;
      if (q === 2) {
        combo++;
        const pts = Math.round(10 * m) + Math.min(10, combo);
        scoreV += pts;
        pop(ax, ay - 14, '+' + pts, '#7dffaa');
        spark(ax, ay, 9, '#ffd060', 70);
        sfx('coin');
      } else if (q === 1) {
        combo = 0;
        const pts = Math.round(4 * m);
        scoreV += pts;
        pop(ax, ay - 14, '+' + pts, '#ffe08a');
        spark(ax, ay, 4, '#ff9a40', 50);
        sfx('click');
      } else {
        combo = 0;
        pop(ax, ay - 14, 'x', '#ff7070');
        spark(ax, ay, 2, '#a0a0a0', 30);
        sfx('hit');
      }
      zoneC = 0.15 + rand() * 0.7;
      if (order.hits.length >= 3) {
        const perfect = order.hits.every((h) => h === 2);
        const good = order.hits.filter((h) => h > 0).length;
        let bonus = good >= 2 ? Math.round(10 * m) : 0;
        if (perfect) bonus += Math.round(15 * m);
        if (bonus > 0) {
          scoreV += bonus;
          pop(40, 60, '+' + bonus, perfect ? '#7dffaa' : '#ffe08a');
          if (perfect) spark(ax, ay - 6, 12, '#7dffaa', 80);
          done++;
        }
        orderGap = 0.7;
      }
    };

    // ---- ввод ----
    const KEYS_HIT = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1 };
    const KEYS_DIG = { ArrowDown: 1, KeyS: 1 };
    const isAuto = () => typeof api.auto === 'function' && !!api.auto();
    const onKeyDown = (e) => {
      if (isAuto()) return;
      if (KEYS_HIT[e.code]) {
        e.preventDefault();
        if (e.repeat) return;
        hit();
      } else if (KEYS_DIG[e.code]) {
        e.preventDefault();
        if (e.repeat) return; // после поимки надо отпустить и нажать заново
        if (mode === 'ready') { start(); return; }
        digHoldKey = true;
      }
    };
    const onKeyUp = (e) => {
      if (KEYS_DIG[e.code]) { e.preventDefault(); digHoldKey = false; }
      else if (KEYS_HIT[e.code]) e.preventDefault();
    };
    const onBlur = () => { digHoldKey = false; digHoldPtr = false; };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H };
    };
    let digPtrId = null;
    const onDown = (e) => {
      e.preventDefault();
      if (isAuto()) return;
      if (mode === 'ready') { start(); return; }
      const p = toLocal(e);
      if (p.x >= BTN.x - 4 && p.y >= BTN.y - 4) {
        digHoldPtr = true;
        digPtrId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
      } else hit();
    };
    const onUp = (e) => {
      if (e.pointerId === digPtrId) { digHoldPtr = false; digPtrId = null; }
    };
    const onCtx = (e) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', onCtx);

    // ---- стражник ----
    const looksAtDig = () => {
      const dx = DIG_X - guard.x;
      if (guard.state === 'alert') return false;
      if (Math.abs(dx) < 10) return true;
      return dx * guard.dir > 0 && Math.abs(dx) <= VIS;
    };
    const updateGuard = (dt) => {
      const g = guard;
      g.t += dt;
      if (g.state === 'walk') {
        g.x += g.dir * guardSpeed() * dt;
        if (g.x < 26) { g.x = 26; g.state = 'endpause'; g.t = 0; }
        else if (g.x > 296) { g.x = 296; g.state = 'endpause'; g.t = 0; }
        else {
          const p = 0.1 + 0.22 * Math.min(1, time / SHIFT);
          if (g.t > 1.5 && rand() < p * dt) { g.state = 'suspect'; g.t = 0; }
        }
      } else if (g.state === 'endpause') {
        if (g.t > 0.7) { g.dir = -g.dir; g.state = 'walk'; g.t = 0; }
      } else if (g.state === 'suspect') {
        // «?» над головой — предупреждение, затем оглядывается назад
        if (g.t > 0.65) { g.dir = -g.dir; g.state = 'look'; g.t = 0; g.look = 0.9 + rand() * 0.8; }
      } else if (g.state === 'look') {
        if (g.t > g.look) { g.dir = -g.dir; g.state = 'walk'; g.t = 0; }
      } else if (g.state === 'alert') {
        g.dir = DIG_X < g.x ? -1 : 1;
        if (g.t > 1.8) { g.state = 'walk'; g.t = 0; }
      }
    };

    const caught = () => {
      lives--;
      seenT = 0;
      prog *= 0.4;
      combo = 0;
      guard.state = 'alert';
      guard.t = 0;
      digHoldKey = false; // надо отпустить и нажать заново
      digHoldPtr = false;
      sfx('hit');
      pop(DIG_X, FLOOR - 40, '-1', '#ff7070');
      if (lives <= 0 || isAuto()) { if (isAuto()) lives = 0; finish(); }
    };

    // автоигра: пару раз бьёт по наковальне, потом лезет копать — стражник замечает и идёт к нему
    let autoT = -1;
    let autoDig = false;
    const autoPilot = (dt) => {
      if (mode !== 'run') return;
      if (autoT < 0) { autoT = 0; digHoldKey = false; digHoldPtr = false; }
      autoT += dt;
      if (autoT < 2.4) {
        if (order && orderGap <= 0 && hitCd <= 0 && Math.abs(marker - zoneC) < zoneW() / 2 * 0.8) hit();
        return;
      }
      autoDig = true;
      if (autoT > 3.4 && guard.state !== 'alert') {
        guard.dir = DIG_X < guard.x ? -1 : 1;
        if (guard.state !== 'walk') { guard.state = 'walk'; guard.t = 0; }
        if (Math.abs(guard.x - DIG_X) <= VIS) { guard.state = 'look'; guard.t = 0; guard.look = 3; }
      }
      if (autoT > 7.5) { lives = 0; finish(); }
    };

    // ---- обновление ----
    const update = (dt) => {
      clock += dt;
      for (const p of parts) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * p.g * dt;
      }
      for (const p of pops) {
        if (!p.on) continue;
        p.life -= dt * 0.9;
        p.y -= dt * 14;
        if (p.life <= 0) p.on = false;
      }
      if (mode === 'end') {
        endT += dt;
        if (endT > 1.2) {
          mode = 'over';
          try { api.over(Math.floor(scoreV)); } catch (e) { /* хост */ }
        }
        return;
      }
      if (mode !== 'run') return;
      time += dt;
      if (time >= SHIFT) { finish(); return; }
      if (hitCd > 0) hitCd -= dt;
      if (swing > 0) swing -= dt;
      if (lastQT > 0) lastQT -= dt;

      // ковка
      if (orderGap > 0) {
        orderGap -= dt;
        if (orderGap <= 0) newOrder();
      } else if (order) {
        const sp = order.o.speed * (1 + time / 200);
        marker += mdir * sp * dt;
        if (marker > 1) { marker = 2 - marker; mdir = -1; }
        if (marker < 0) { marker = -marker; mdir = 1; }
        order.pat -= dt;
        if (order.pat <= 0) {
          pop(40, 60, 'x', '#ff7070');
          sfx('lose');
          combo = 0;
          orderGap = 0.8;
        }
      }

      // подкоп
      if (isAuto()) autoPilot(dt);
      if (mode !== 'run') return;
      const want = (digHoldKey || digHoldPtr || autoDig) && guard.state !== 'alert';
      digging = want;
      if (digging) {
        prog += dt / segTime();
        digSnd -= dt;
        if (digSnd <= 0) { sfx('step'); digSnd = 0.35; spark(DIG_X + 4, FLOOR - 2, 2, '#8a6440', 40, 1.2); }
        if (prog >= 1) {
          prog = 0;
          segs++;
          const bonus = 100 + 25 * (segs - 1);
          scoreV += bonus;
          pop(DIG_X - 10, FLOOR - 36, '+' + bonus, '#ffd34a');
          sfx('win');
        }
      }
      updateGuard(dt);
      if (digging && looksAtDig()) {
        seenT += dt;
        if (seenT > 0.22) caught();
      } else seenT = Math.max(0, seenT - dt * 2);
    };

    // ---- рисование ----
    // статичная часть фона рисуется один раз в отдельный холст (если он доступен)
    let bg = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') bg = new OffscreenCanvas(W, H);
      else if (typeof document !== 'undefined') { bg = document.createElement('canvas'); bg.width = W; bg.height = H; }
    } catch (e) { bg = null; }
    let bgReady = false;
    const drawRoom = () => {
      if (bg && !bgReady) {
        const bctx = bg.getContext('2d');
        if (bctx) { drawStatic(bctx); bgReady = true; } else bg = null;
      }
      if (bgReady) ctx.drawImage(bg, 0, 0);
      else drawStatic(ctx);
      drawLive();
    };
    const drawStatic = (ctx) => {
      // стена
      ctx.fillStyle = '#3a3640';
      ctx.fillRect(0, 0, W, FLOOR);
      ctx.fillStyle = '#2a2730';
      for (let y = 0; y < FLOOR; y += 9) ctx.fillRect(0, y, W, 1);
      for (let row = 0; row * 9 < FLOOR; row++) {
        const off = row & 1 ? 9 : 0;
        for (let x = -off; x < W; x += 18) ctx.fillRect(x, row * 9, 1, 9);
      }
      for (let i = 0; i < bricks.length; i += 5) {
        ctx.fillStyle = bricks[i + 4] ? '#43404a' : '#322f38';
        ctx.fillRect(bricks[i], bricks[i + 1], bricks[i + 2], bricks[i + 3]);
      }
      // окно с решёткой и лунным светом
      ctx.fillStyle = '#1a1a2c'; ctx.fillRect(236, 16, 30, 22);
      ctx.fillStyle = '#2c3456'; ctx.fillRect(238, 18, 26, 18);
      ctx.fillStyle = '#e8ecf4'; ctx.fillRect(255, 21, 4, 4);
      ctx.fillStyle = '#5a5866';
      for (let x = 241; x < 264; x += 6) ctx.fillRect(x, 16, 2, 22);
      ctx.fillStyle = 'rgba(170,190,255,0.06)';
      for (let i = 0; i < 6; i++) ctx.fillRect(232 - i * 6, 38 + i * 18, 34 + i * 4, 18);
      ctx.fillStyle = '#2a2428'; ctx.fillRect(18, 40, 46, 10); ctx.fillRect(28, 0, 26, 40);
      // пол и земля в разрезе
      ctx.fillStyle = '#4a4450'; ctx.fillRect(0, FLOOR, W, 4);
      ctx.fillStyle = '#5c5662';
      for (let x = 0; x < W; x += 16) ctx.fillRect(x, FLOOR, 15, 1);
      ctx.fillStyle = '#3e2c20'; ctx.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
      ctx.fillStyle = '#4a3626';
      for (let i = 0; i < stones.length; i += 3) ctx.fillRect(stones[i], stones[i + 1], stones[i + 2], 2);
    };
    const drawLive = () => {
      // горн слева
      const fl = 0.75 + 0.25 * Math.sin(clock * 11) * Math.sin(clock * 4.3);
      ctx.fillStyle = `rgba(255,140,60,${0.12 * fl + 0.05})`;
      ctx.fillRect(0, 70, 96, FLOOR - 70);
      ctx.fillStyle = `rgba(255,160,70,${0.1 * fl})`;
      ctx.fillRect(10, 90, 70, FLOOR - 90);
      ctx.fillStyle = '#4a4248'; ctx.fillRect(16, 112, 50, FLOOR - 112);
      ctx.fillStyle = '#5a5258'; ctx.fillRect(16, 112, 50, 3);
      ctx.fillStyle = '#1c1416'; ctx.fillRect(22, 118, 38, 14);
      ctx.fillStyle = fl > 0.8 ? '#ffb040' : '#ff8a30'; ctx.fillRect(24, 124, 34, 8);
      ctx.fillStyle = '#ffe080'; ctx.fillRect(28 + Math.round(fl * 6), 126, 4, 3); ctx.fillRect(44 - Math.round(fl * 4), 125, 5, 3);
      ctx.fillStyle = '#c04020'; ctx.fillRect(24, 130, 34, 2);
      // факел у окна
      const tf = 0.7 + 0.3 * Math.sin(clock * 13 + 2);
      ctx.fillStyle = `rgba(255,170,70,${0.1 * tf})`; ctx.fillRect(196, 40, 34, 40);
      ctx.fillStyle = '#4a3020'; ctx.fillRect(212, 58, 2, 10);
      ctx.fillStyle = '#ffb040'; ctx.fillRect(211, 54, 4, 4);
      ctx.fillStyle = '#ffe080'; ctx.fillRect(212, 53 - Math.round(tf), 2, 2);
      // ящик готовых изделий
      ctx.fillStyle = '#5a3c22'; ctx.fillRect(214, FLOOR - 16, 26, 16);
      ctx.fillStyle = '#7a5430'; ctx.fillRect(214, FLOOR - 16, 26, 2); ctx.fillRect(214, FLOOR - 9, 26, 1);
      ctx.fillStyle = '#9aa4b2';
      const shown = Math.min(done, 6);
      for (let i = 0; i < shown; i++) ctx.fillRect(217 + i * 3, FLOOR - 19 - (i & 1), 2, 3);
    };

    const drawTunnel = () => {
      // вертикальный лаз под тайником + горизонтальные сегменты влево
      const top = FLOOR + 4;
      const ty = FLOOR + 16;
      const shaft = segs > 0 ? 1 : prog;
      if (shaft > 0) {
        ctx.fillStyle = '#140c0c';
        ctx.fillRect(DIG_X, top, 10, Math.max(1, Math.round((ty + 10 - top) * shaft)));
      }
      const full = segs > 0 ? segs - 1 : 0;
      let x = DIG_X;
      ctx.fillStyle = '#140c0c';
      for (let i = 0; i < full && x > -30; i++) { ctx.fillRect(x - 30, ty, 30, 10); x -= 30; }
      if (segs > 0) {
        const w = Math.round(30 * prog);
        ctx.fillRect(x - w, ty, w, 10);
        // крепь
        ctx.fillStyle = '#6a4a2c';
        for (let xx = DIG_X - 30; xx > x - w; xx -= 30) { ctx.fillRect(xx, ty - 1, 2, 12); ctx.fillRect(xx, ty - 1, 6, 2); }
      }
      if (segs > 0) {
        drawIcon(ctx, 'shovel', DIG_X + 14, ty + 1, 1);
        drawText(ctx, 'x' + segs, DIG_X + 23, ty + 2, '#ffd34a', 1);
      }
      // плитка-тайник
      ctx.fillStyle = '#5c5662';
      if (digging) ctx.fillRect(DIG_X - 14, FLOOR - 2, 12, 3);
      else ctx.fillRect(DIG_X - 1, FLOOR, 12, 2);
      // кучка земли (спрятана под мешком)
      if (segs > 0 || prog > 0.1) {
        ctx.fillStyle = '#b8a070'; ctx.fillRect(DIG_X + 14, FLOOR - 6, 10, 6);
        ctx.fillStyle = '#9a8458'; ctx.fillRect(DIG_X + 15, FLOOR - 7, 8, 1); ctx.fillRect(DIG_X + 18, FLOOR - 8, 2, 1);
      }
    };

    const drawCone = () => {
      const g = guard;
      const ex = Math.round(g.x) + g.dir * 4;
      const ey = FLOOR - 22;
      const alarm = seenT > 0 && digging;
      ctx.fillStyle = alarm ? 'rgba(255,60,50,0.26)' : g.state === 'alert' ? 'rgba(255,90,60,0.18)' : 'rgba(255,220,120,0.16)';
      for (let d = 0; d < VIS; d += 3) {
        const hh = 3 + Math.round(d * 0.32);
        const x = g.dir > 0 ? ex + d : ex - d - 3;
        ctx.fillRect(x, ey - (hh >> 2), 3, hh);
      }
      // пунктирная кромка конуса
      ctx.fillStyle = alarm ? 'rgba(255,90,80,0.55)' : 'rgba(255,230,150,0.35)';
      for (let d = 0; d < VIS; d += 6) {
        const hh = 3 + Math.round(d * 0.32);
        const x = g.dir > 0 ? ex + d : ex - d - 3;
        ctx.fillRect(x, ey - (hh >> 2), 3, 1);
        ctx.fillRect(x, ey - (hh >> 2) + hh - 1, 3, 1);
      }
    };

    const drawGuard = () => {
      const g = guard;
      const x = Math.round(g.x);
      const y = FLOOR;
      const walking = g.state === 'walk' && mode === 'run';
      const step = walking ? Math.floor(clock * 6) & 1 : 0;
      const d = g.dir;
      const u = U;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
      ctx.fillStyle = '#2a2228';
      ctx.fillRect(x - u + (step ? u : 0), y - 4 * u, u, 4 * u);
      ctx.fillRect(x + u - (step ? u : 0), y - 4 * u, u, 4 * u);
      ctx.fillStyle = '#7a2a2e'; ctx.fillRect(x - 2 * u, y - 11 * u, 5 * u, 8 * u);
      ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x - 2 * u, y - 11 * u, 5 * u, 2 * u); // наплечник
      ctx.fillStyle = '#5a1e22'; ctx.fillRect(x - 2 * u, y - 6 * u, 5 * u, u);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(x, y - 6 * u, u, u);
      // голова и шлем
      ctx.fillStyle = '#d8b08a'; ctx.fillRect(x - u, y - 15 * u, 4 * u, 4 * u);
      ctx.fillStyle = '#2a1e1e'; ctx.fillRect(d > 0 ? x + 2 * u : x - u, y - 14 * u, u, u);
      ctx.fillStyle = '#8a94a2'; ctx.fillRect(x - 2 * u, y - 16 * u, 6 * u, 2 * u);
      ctx.fillStyle = '#b8c2ce'; ctx.fillRect(x - u, y - 17 * u, 4 * u, u);
      // рука с фонарём
      const lx = d > 0 ? x + 3 * u : x - 3 * u;
      ctx.fillStyle = '#7a2a2e'; ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, y - 10 * u, u, 3 * u);
      ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, y - 8 * u, 3 * u, u);
      const lf = 0.8 + 0.2 * Math.sin(clock * 10);
      ctx.fillStyle = `rgba(255,200,90,${0.18 * lf})`; ctx.fillRect(lx - 6 * u, y - 13 * u, 13 * u, 11 * u);
      ctx.fillStyle = '#ffd060'; ctx.fillRect(lx - u + 1, y - 7 * u, 2 * u, 2 * u);
      ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, y - 5 * u, 3 * u, u);
      // копьё
      ctx.fillStyle = '#6a4a2c'; ctx.fillRect(d > 0 ? x - 3 * u : x + 4 * u, y - 20 * u, u, 19 * u);
      ctx.fillStyle = '#c8d0dc'; ctx.fillRect(d > 0 ? x - 3 * u : x + 4 * u, y - 22 * u, u, 2 * u);
      // значки
      if (g.state === 'suspect') drawText(ctx, '?', x - 1, y - 52, '#ffe08a', 2);
      else if (g.state === 'alert' && (Math.floor(clock * 8) & 1)) drawText(ctx, '!', x, y - 52, '#ff5050', 2);
    };

    const drawAnvil = () => {
      const x = ANVIL_X;
      const y = FLOOR;
      ctx.fillStyle = '#4a3020'; ctx.fillRect(x - 8, y - 10, 18, 10); // пень
      ctx.fillStyle = '#5c3c26'; ctx.fillRect(x - 8, y - 10, 18, 2);
      ctx.fillStyle = '#2e3038'; ctx.fillRect(x - 4, y - 16, 10, 6);
      ctx.fillStyle = '#3e4250'; ctx.fillRect(x - 9, y - 22, 22, 6); ctx.fillRect(x - 14, y - 21, 5, 3);
      ctx.fillStyle = '#5a6070'; ctx.fillRect(x - 9, y - 22, 22, 1);
      // заготовка
      if (order && orderGap <= 0) {
        const heat = 1 - order.hits.length / 3;
        ctx.fillStyle = heat > 0.5 ? '#ffb040' : heat > 0.1 ? '#e07030' : '#b0b8c4';
        const ic = order.o.icon;
        if (ic === 'sword') ctx.fillRect(x - 6, y - 24, 16, 2);
        else if (ic === 'pickaxe') { ctx.fillRect(x - 4, y - 24, 12, 2); ctx.fillRect(x - 5, y - 25, 2, 1); ctx.fillRect(x + 7, y - 25, 2, 1); }
        else { ctx.fillRect(x - 2, y - 24, 8, 2); ctx.fillRect(x - 3, y - 25, 2, 1); ctx.fillRect(x + 5, y - 25, 2, 1); }
      }
    };

    const drawPrisoner = () => {
      const u = U;
      const y = FLOOR;
      const robe = '#c8c4b8', stripe = '#5a5660', skin = '#e8be96', hair = '#3a2a1e';
      if (digging || (mode === 'run' && guard.state === 'alert' && guard.t < 0.4)) {
        // присел у тайника, копает
        const x = DIG_X + 6;
        const dig = Math.floor(clock * 6) & 1;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
        ctx.fillStyle = robe; ctx.fillRect(x - 2 * u, y - 7 * u, 6 * u, 5 * u);
        ctx.fillStyle = stripe; ctx.fillRect(x - 2 * u, y - 6 * u, 6 * u, u); ctx.fillRect(x - 2 * u, y - 4 * u, 6 * u, u);
        ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 2 * u, y - 2 * u, 2 * u, 2 * u); ctx.fillRect(x + 2 * u, y - 2 * u, 2 * u, 2 * u);
        ctx.fillStyle = skin; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, 4 * u);
        ctx.fillStyle = hair; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, u);
        ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x - 3 * u, y - 8 * u, u, u);
        // лопата
        ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 4 * u, y - (8 - dig) * u, u, 6 * u);
        ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x - 5 * u, y - (3 - dig) * u, 3 * u, 2 * u);
        if (seenT > 0) drawIcon(ctx, 'eye', x - 7, y - 34, 2);
        return;
      }
      const x = SMITH_X;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
      ctx.fillStyle = '#2a2228'; ctx.fillRect(x - u, y - 3 * u, u, 3 * u); ctx.fillRect(x + u, y - 3 * u, u, 3 * u);
      ctx.fillStyle = robe; ctx.fillRect(x - 2 * u, y - 10 * u, 5 * u, 7 * u);
      ctx.fillStyle = stripe;
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 2 * u, y - (9 - i * 2) * u, 5 * u, u);
      ctx.fillStyle = skin; ctx.fillRect(x - u, y - 14 * u, 4 * u, 4 * u);
      ctx.fillStyle = hair; ctx.fillRect(x - u, y - 14 * u, 4 * u, u); ctx.fillRect(x - u, y - 13 * u, u, u);
      ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x + 2 * u, y - 13 * u, u, u);
      // рука с молотом
      const down = swing > 0;
      ctx.fillStyle = skin;
      if (down) {
        ctx.fillRect(x + 3 * u, y - 9 * u, 3 * u, u);
        ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 6 * u, y - 10 * u, u, 3 * u);
        ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + 6 * u - 2, y - 13 * u + 2, 3 * u, 3 * u - 2);
      } else {
        ctx.fillRect(x + 2 * u, y - 13 * u, u, 4 * u);
        ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 2 * u, y - 17 * u, u, 4 * u);
        ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + u, y - 19 * u, 4 * u, 2 * u);
      }
    };

    const drawBar = () => {
      const bx = 100, by = 64, bw = 120, bh = 8;
      ctx.fillStyle = '#1a1418'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(bx, by, bw, bh);
      if (!order || orderGap > 0) {
        ctx.fillStyle = '#3a3036'; ctx.fillRect(bx, by, bw, bh);
        return;
      }
      const half = zoneW() / 2;
      const y0 = Math.max(0, zoneC - half - 0.11), y1 = Math.min(1, zoneC + half + 0.11);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(bx + Math.round(y0 * bw), by, Math.round((y1 - y0) * bw), bh);
      ctx.fillStyle = '#3ec060'; ctx.fillRect(bx + Math.round((zoneC - half) * bw), by, Math.round(half * 2 * bw), bh);
      ctx.fillStyle = '#7dffaa'; ctx.fillRect(bx + Math.round((zoneC - half) * bw), by, Math.round(half * 2 * bw), 1);
      // маркер
      const mx = bx + Math.round(marker * bw);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1, by - 3, 2, bh + 6);
      ctx.fillRect(mx - 2, by - 4, 4, 1); ctx.fillRect(mx - 2, by + bh + 3, 4, 1);
      // вспышка оценки
      if (lastQT > 0) {
        ctx.fillStyle = lastQ === 2 ? 'rgba(125,255,170,0.5)' : lastQ === 1 ? 'rgba(255,224,138,0.45)' : 'rgba(255,90,90,0.45)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, 1); ctx.fillRect(bx - 2, by + bh + 1, bw + 4, 1);
      }
      // иконки молота по бокам
      drawIcon(ctx, 'hammer', bx - 14, by, 1);
      // три удара
      for (let i = 0; i < 3; i++) {
        const q = order.hits[i];
        ctx.fillStyle = q == null ? '#3a3036' : q === 2 ? '#3ec060' : q === 1 ? '#c8a040' : '#a03030';
        ctx.fillRect(bx + bw / 2 - 13 + i * 9, by + bh + 5, 7, 3);
      }
    };

    const drawHUD = () => {
      // жизни
      for (let i = 0; i < 3; i++) drawIcon(ctx, i < lives ? 'heart' : 'heartEmpty', 4 + i * 16, 4, 2);
      // часы
      const tl = Math.ceil(timeLeft());
      const str = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
      const tw = textWidth(str, 2) + 18;
      const tx = Math.round(W / 2 - tw / 2);
      ctx.fillStyle = 'rgba(20,14,18,0.6)'; ctx.fillRect(tx - 3, 3, tw + 6, 16);
      drawIcon(ctx, 'clock', tx, 4, 2);
      drawText(ctx, str, tx + 18, 6, tl <= 10 && (Math.floor(clock * 4) & 1) ? '#ff7070' : '#f4ecdc', 2);
      // счёт
      const sc = Math.floor(scoreV);
      const sw = textWidth(String(sc), 2);
      ctx.fillStyle = 'rgba(20,14,18,0.6)'; ctx.fillRect(W - sw - 10, 3, sw + 7, 14);
      drawNumber(ctx, sc, W - sw - 5, 7, '#1a0e08', 2);
      drawNumber(ctx, sc, W - sw - 6, 6, '#fff2d0', 2);
      const b = Math.max(best, sc);
      const bw = textWidth(String(b), 1);
      drawIcon(ctx, 'trophy', W - bw - 15, 19, 1);
      drawNumber(ctx, b, W - bw - 5, 20, '#ffd34a', 1);
      // заказ
      if (order && mode !== 'ready') {
        ctx.fillStyle = '#d8c8a0'; ctx.fillRect(4, 24, 30, 34);
        ctx.fillStyle = '#b8a47a'; ctx.fillRect(4, 56, 30, 2); ctx.fillRect(32, 24, 2, 34);
        ctx.fillStyle = '#7a2a2a'; ctx.fillRect(17, 22, 4, 4);
        drawIcon(ctx, order.o.icon, 9, 29, 3);
        if (orderGap <= 0) {
          const k = Math.max(0, order.pat / order.max);
          ctx.fillStyle = '#3a2a20'; ctx.fillRect(6, 52, 26, 3);
          ctx.fillStyle = k > 0.35 ? '#3ec060' : (Math.floor(clock * 6) & 1) ? '#ff5050' : '#c03030';
          ctx.fillRect(6, 52, Math.round(26 * k), 3);
        }
        if (combo >= 2) { drawText(ctx, 'x' + combo, 38, 27, '#7dffaa', 1); }
      }
      // кнопка-лопата
      const pressed = digging;
      ctx.fillStyle = pressed ? '#2a1e14' : '#1a120e';
      ctx.fillRect(BTN.x - 1, BTN.y - 1, BTN.w + 2, BTN.h + 2);
      ctx.fillStyle = pressed ? '#6a4a2c' : '#8a6440';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, BTN.h);
      ctx.fillStyle = pressed ? '#5a3c22' : '#a87c50';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, 2);
      drawIcon(ctx, 'shovel', BTN.x + 11, BTN.y + 4 + (pressed ? 1 : 0), 3);
      // прогресс сегмента
      ctx.fillStyle = '#2a1e14'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, BTN.w - 6, 4);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, Math.round((BTN.w - 6) * prog), 4);
      // всплывающие очки
      for (const p of pops) {
        if (!p.on) continue;
        const w = textWidth(p.s, 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2) + 1, Math.round(p.y) + 1, '#1a0e08', 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2), Math.round(p.y), p.c, 2);
      }
    };

    const drawReady = () => {
      ctx.fillStyle = 'rgba(16,10,20,0.55)';
      ctx.fillRect(0, 0, W, H);
      // подсказки иконками
      drawIcon(ctx, 'hammer', 120, 84, 3);
      drawIcon(ctx, 'up', 146, 86, 3);
      drawIcon(ctx, 'down', BTN.x + 14, BTN.y - 22, 3);
      drawIcon(ctx, 'eye', Math.round(guard.x) - 7, FLOOR - 58, 2);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a0e08';
      ctx.fillText('Нажми, чтобы начать', W / 2 + 1, 47);
      ctx.fillStyle = (Math.floor(clock * 2) & 1) ? '#ffe7a8' : '#ffd060';
      ctx.fillText('Нажми, чтобы начать', W / 2, 46);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };

    const draw = () => {
      drawRoom();
      drawTunnel();
      drawCone();
      drawGuard();
      drawAnvil();
      drawPrisoner();
      for (const p of parts) {
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      drawBar();
      drawHUD();
      if (mode === 'ready') drawReady();
      if (mode === 'end' || mode === 'over') {
        ctx.fillStyle = `rgba(10,6,10,${Math.min(0.45, endT * 0.4)})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    // ---- цикл ----
    let raf = 0;
    let last = performance.now();
    let alive = true;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.05);
      const paused = typeof api.paused === 'function' && api.paused();
      if (!paused && mode !== 'over') {
        if (mode === 'ready') clock += dt;
        else update(dt);
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    start(); // сразу в смену, без экрана «Нажми, чтобы начать»
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.style.touchAction = prevTouch;
    };
  }
};
