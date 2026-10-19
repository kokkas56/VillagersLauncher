// «Тюремная смена» — куй заказы на наковальне в ритм и тайком копай подкоп, пока стражник не смотрит.
// Одновременно живой фон лаунчера «Тюрьма»: заключённый спокойно кует, стражник бродит и зевает,
// крыса, капель. По «Играть» стражник уходит в обход, заключённый подмигивает — смена началась.
// При выходе звенит колокол, стражник возвращается, заключённый прикрывает лаз и снова кует.
import { drawText, textWidth, drawIcon, drawInt, intWidth } from './pixfont.js';

const W = 320;
const H = 180;
const FLOOR = 148; // линия пола (ноги)
const U = 2; // масштаб человечков
const ANVIL_X = 168;
const SMITH_X = 150; // где стоит заключённый у наковальни
const DIG_X = 112; // тайник с подкопом
const CROUCH_X = DIG_X + 6; // где сидит заключённый, когда копает
const CRATE_X = 214;
const VIS = 96; // дальность взгляда стражника
const SHIFT = 120; // смена, секунд
const BTN = { x: 274, y: 140, w: 42, h: 36 }; // кнопка-лопата
const INTRO_T = 1.8;
const OUTRO_T = 3.0;
const OUTRO_MAX = 3.8;

const ORDERS = [
  { icon: 'horseshoe', speed: 0.85, mult: 1 },
  { icon: 'pickaxe', speed: 1.1, mult: 1.5 },
  { icon: 'sword', speed: 1.35, mult: 2 }
];

// полупрозрачные заливки — заранее, чтобы не собирать строки каждый кадр
const AN = 16;
const alphaTable = (r, g, b, maxA) => {
  const t = [];
  for (let i = 0; i < AN; i++) t.push(`rgba(${r},${g},${b},${((maxA * i) / (AN - 1)).toFixed(3)})`);
  return t;
};
const pickA = (tbl, k) => tbl[Math.max(0, Math.min(AN - 1, Math.round(k * (AN - 1))))];
const FORGE1 = alphaTable(255, 140, 60, 0.17);
const FORGE2 = alphaTable(255, 160, 70, 0.1);
const TORCH = alphaTable(255, 170, 70, 0.1);
const LANT = alphaTable(255, 200, 90, 0.18);
const DIM = alphaTable(10, 6, 10, 0.45);
const MOONBEAM = alphaTable(170, 190, 255, 0.07);
const SUNBEAM = alphaTable(255, 220, 150, 0.09);
const mixC = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const PANE = [];
for (let i = 0; i < 8; i++) PANE.push(mixC([138, 180, 226], [44, 52, 86], i / 7));

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
  sceneTitle: 'Тюрьма',
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
    const readBest = () => Math.max(0, Math.floor(Number(api && api.best) || 0));
    let best = readBest();
    const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (e) { /* звук не обязателен */ } };
    const getMode = () => {
      try { return typeof api.mode === 'function' ? api.mode() : 'play'; } catch (e) { return 'idle'; }
    };

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

    // ---- фазы: idle | intro | play | end (до over) | wait (карточка) | outro ----
    let phase = 'idle';
    let pt = 0;
    let age = 0;
    let sawOver = false;
    let fl1 = false;
    let endWin = false; // смена отработана (а не поймали)

    // ---- состояние смены ----
    let clock = 0;
    let time = 0;
    let scoreV = 0;
    let lastScore = 0;
    let lives = 3;
    // ковка
    let order = null;
    let orderGap = 0;
    let marker = 0;
    let mdir = 1;
    let zoneC = 0.5;
    let hitCd = 0;
    let swing = 0;
    let lastQ = -1;
    let lastQT = 0;
    let combo = 0;
    // подкоп
    let digHoldKey = false;
    let digHoldPtr = false;
    let digging = false;
    let segs = 0;
    let prog = 0;
    let digSnd = 0;
    let seenT = 0;
    // подача
    let hudA = 0; // HUD смены
    let coneA = 0; // конус взгляда
    let tunA = 0; // видимость лаза в разрезе
    let pileA = 0; // кучка земли у тайника
    let tileOpen = 0; // плитка-тайник отодвинута 0..1
    let bellT = 0; // колокол качается
    let dimA = 0;
    let crateN = 2; // изделий в ящике
    // заключённый (вне смены)
    const pr = { x: SMITH_X, tx: SMITH_X, spd: 40, pose: 'forge', face: 1, st: 'forge', t: 0, hitT: 0.6, hits: 0, need: 6, icon: 'horseshoe', wink: 0 };
    let tGlance = 8 + Math.random() * 8;
    // стражник
    const guard = { x: 236, dir: 1, state: 'iwalk', t: 0, look: 0, tx: 270, spd: 14, after: '', len: 1, moving: false, stir: 0 };
    // крыса и капель
    const rat = { on: false, x: 304, dir: -1, st: 0, t: 0, tx: 250 };
    let tRat = 10 + Math.random() * 10;
    const drops = [];
    for (let i = 0; i < 3; i++) drops.push({ on: false, x: 0, y: 0, vy: 0, t: 0 });
    let tDrop = 2;
    // окружение
    let dark = 1;
    let anim = true;
    let envT = 0;
    const pollEnv = () => {
      try {
        const e = typeof api.env === 'function' ? api.env() : null;
        if (e) { dark = Math.max(0, Math.min(1, Number(e.dark) || 0)); anim = e.animations !== false; }
      } catch (err) { /* по умолчанию */ }
    };
    pollEnv();

    const parts = [];
    for (let i = 0; i < 48; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff', g: 1 });
    const spark = (x, y, n, c, spd, g = 1) => {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
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
      let p = pops[0];
      for (let i = 0; i < pops.length; i++) if (!pops[i].on) { p = pops[i]; break; }
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

    function setPhase(p) {
      phase = p; pt = 0; fl1 = false;
      if (typeof api._phase === 'function') { try { api._phase(p); } catch (e) { /* отладка */ } }
    }

    const finish = () => {
      if (phase !== 'play') return;
      endWin = lives > 0;
      setPhase('end');
      digging = false;
      lastScore = Math.floor(scoreV);
      sfx(endWin ? 'win' : 'lose');
      if (endWin) { bellT = 1.4; guard.state = 'iwalk'; guard.tx = CRATE_X + 16; guard.after = 'stand'; guard.spd = 30; }
      else {
        pr.x = CROUCH_X; pr.tx = CROUCH_X; pr.pose = 'handsup';
        guard.state = 'grab'; guard.t = 0;
      }
    };

    // ---- удар молотом ----
    const hit = () => {
      if (phase !== 'play' || !order || orderGap > 0) return;
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
        let good = 0, perfect = true;
        for (let i = 0; i < order.hits.length; i++) { if (order.hits[i] > 0) good++; if (order.hits[i] !== 2) perfect = false; }
        let bonus = good >= 2 ? Math.round(10 * m) : 0;
        if (perfect) bonus += Math.round(15 * m);
        if (bonus > 0) {
          scoreV += bonus;
          pop(40, 60, '+' + bonus, perfect ? '#7dffaa' : '#ffe08a');
          if (perfect) spark(ax, ay - 6, 12, '#7dffaa', 80);
          crateN = Math.min(6, crateN + 1);
        }
        orderGap = 0.7;
      }
    };

    // ---- ввод (только в смене) ----
    const KEYS_HIT = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1 };
    const KEYS_DIG = { ArrowDown: 1, KeyS: 1 };
    const onKeyDown = (e) => {
      if (phase !== 'play') return; // в покое клавиши принадлежат лаунчеру
      if (KEYS_HIT[e.code]) {
        e.preventDefault();
        if (e.repeat) return;
        hit();
      } else if (KEYS_DIG[e.code]) {
        e.preventDefault();
        if (e.repeat) return; // после поимки надо отпустить и нажать заново
        digHoldKey = true;
      }
    };
    const onKeyUp = (e) => {
      if (KEYS_DIG[e.code]) { digHoldKey = false; if (phase === 'play') e.preventDefault(); }
      else if (KEYS_HIT[e.code] && phase === 'play') e.preventDefault();
    };
    const onBlur = () => { digHoldKey = false; digHoldPtr = false; };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H };
    };
    let digPtrId = null;
    const onDown = (e) => {
      if (phase !== 'play') return;
      e.preventDefault();
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
    const onCtx = (e) => { if (phase === 'play') e.preventDefault(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', onCtx);

    // ---- стражник в смене ----
    const looksAtDig = () => {
      const dx = DIG_X - guard.x;
      if (guard.state === 'alert') return false;
      if (Math.abs(dx) < 10) return true;
      return dx * guard.dir > 0 && Math.abs(dx) <= VIS;
    };
    const updateGuardPlay = (dt) => {
      const g = guard;
      g.t += dt;
      g.moving = false;
      if (g.state === 'walk') {
        g.moving = true;
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
      } else {
        // пришёл из покоя/вступления — просто начинает обход
        g.state = 'walk'; g.t = 0;
      }
    };

    // ---- стражник вне смены: бродит, зевает, дремлет, забирает изделия ----
    const guardGo = (tx, spd, after) => {
      const g = guard;
      g.state = 'iwalk'; g.tx = tx; g.spd = spd; g.after = after; g.t = 0;
    };
    const updateGuardIdle = (dt) => {
      const g = guard;
      g.t += dt;
      g.moving = false;
      if (g.stir > 0) g.stir -= dt;
      if (g.state === 'iwalk') {
        const d = g.tx - g.x;
        if (Math.abs(d) <= g.spd * dt + 0.1) {
          g.x = g.tx;
          g.state = g.after || 'ipause'; g.t = 0; g.len = 0.8 + rand() * 1.6;
          if (g.state === 'doze') { g.len = 9 + rand() * 6; g.dir = -1; }
          if (g.state === 'collect') g.len = 1.8;
          if (g.state === 'yawn') g.len = 2.2;
        } else { g.dir = d > 0 ? 1 : -1; g.x += g.dir * g.spd * dt; g.moving = true; }
      } else if (g.state === 'ipause' || g.state === 'stand') {
        if (g.t > g.len) {
          const r = rand();
          if (crateN >= 5 && r < 0.6) guardGo(CRATE_X + 18, 14, 'collect');
          else if (r < 0.2) { g.state = 'yawn'; g.t = 0; g.len = 2.2; }
          else if (r < 0.36) guardGo(286, 14, 'doze');
          else guardGo(rand() < 0.8 ? 236 + rand() * 60 : 74 + rand() * 46, 12 + rand() * 6, 'ipause');
        }
      } else if (g.state === 'yawn') {
        if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 0.6; }
      } else if (g.state === 'doze') {
        if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 1.2; g.stir = 0.6; }
      } else if (g.state === 'collect') {
        if (g.t > 0.9 && crateN > 0) crateN = 0;
        if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 0.8; }
      } else {
        // из смены (walk/look/alert/grab...) — спокойно в обход
        guardGo(236 + rand() * 50, 14, 'ipause');
      }
    };

    // ---- заключённый вне смены ----
    const prMove = (dt) => {
      const d = pr.tx - pr.x;
      if (Math.abs(d) <= pr.spd * dt + 0.1) { pr.x = pr.tx; return true; }
      pr.face = d > 0 ? 1 : -1;
      pr.x += pr.face * pr.spd * dt;
      return false;
    };
    const newPiece = () => { pr.hits = 0; pr.need = 5 + Math.floor(rand() * 4); pr.icon = ORDERS[Math.floor(rand() * 3)].icon; };
    const updPrisonerIdle = (dt) => {
      pr.t += dt;
      if (pr.st === 'forge') {
        pr.pose = 'forge'; pr.face = 1;
        if (Math.abs(pr.x - SMITH_X) > 0.5) { pr.tx = SMITH_X; pr.spd = 40; pr.st = 'back'; return; }
        tGlance -= dt;
        if (tGlance <= 0) {
          tGlance = 10 + rand() * 12;
          if (guard.state === 'doze' && guard.t < guard.len - 5) { pr.st = 'sneak'; pr.tx = CROUCH_X; pr.spd = 22; pr.t = 0; }
          else { pr.st = 'glance'; pr.t = 0; }
          return;
        }
        pr.hitT -= dt;
        if (pr.hitT <= 0) {
          pr.hitT = 0.7 + rand() * 0.25;
          swing = 0.16;
          pr.hits++;
          spark(ANVIL_X + 2, FLOOR - 22, 4 + Math.floor(rand() * 4), rand() < 0.5 ? '#ffd060' : '#ff9a40', 60);
          sfx('click');
          if (pr.hits >= pr.need) { pr.st = 'tocrate'; pr.tx = CRATE_X - 6; pr.spd = 30; pr.hitT = 0.9; }
        }
      } else if (pr.st === 'glance') {
        // косится на тайник
        pr.pose = 'stand'; pr.face = -1;
        if (pr.t > 1.6) { pr.st = 'forge'; pr.t = 0; }
      } else if (pr.st === 'sneak') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'peek'; pr.t = 0; }
      } else if (pr.st === 'peek') {
        pr.pose = 'crouch';
        tileOpen = Math.min(0.6, tileOpen + dt * 1.5);
        if (pr.t > 1.4) { guard.stir = 0.9; pr.st = 'hurry'; pr.tx = SMITH_X; pr.spd = 75; pr.t = 0; }
      } else if (pr.st === 'hurry') {
        tileOpen = Math.max(0, tileOpen - dt * 4);
        pr.pose = tileOpen > 0 ? 'crouch' : 'walk';
        if (tileOpen <= 0 && prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.t = 0; }
      } else if (pr.st === 'tocrate') {
        pr.pose = 'carry';
        if (prMove(dt)) {
          pr.face = 1;
          crateN = Math.min(6, crateN + 1);
          pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 30;
          newPiece();
        }
      } else if (pr.st === 'back') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.t = 0; }
      } else {
        pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 40;
      }
    };

    // ---- переходы ----
    const startIntro = () => {
      setPhase('intro');
      best = readBest();
      digHoldKey = false; digHoldPtr = false; digging = false;
      // стражник уходит в обход, просыпается, если дремал
      if (guard.state === 'doze') guard.stir = 0.5;
      guardGo(Math.min(296, Math.max(guard.x + 40, 250)), 45, 'ipause');
      time = 0; scoreV = 0; lives = 3; combo = 0; order = null;
      pr.tx = SMITH_X; pr.spd = 70;
    };
    const beginPlay = () => {
      setPhase('play');
      time = 0; scoreV = 0; lives = 3; combo = 0; hitCd = 0; swing = 0; lastQT = 0;
      segs = 0; prog = 0; seenT = 0; digSnd = 0; tunA = 1; pileA = 0; tileOpen = 0;
      orderGap = 0;
      pr.x = SMITH_X; pr.tx = SMITH_X;
      guard.state = 'walk'; guard.dir = guard.x < 160 ? 1 : -1; guard.t = 0;
      newOrder();
    };
    const startOutro = () => {
      setPhase('outro');
      bellT = 1.4;
      sfx('coin');
      digging = false; digHoldKey = false; digHoldPtr = false;
      const needCover = segs > 0 || prog > 0.05 || tileOpen > 0 || Math.abs(pr.x - CROUCH_X) < 4;
      pr.st = needCover ? 'cover' : 'back';
      pr.tx = needCover ? CROUCH_X : SMITH_X;
      pr.spd = 80; pr.t = 0;
      guardGo(240 + rand() * 40, 30, 'ipause');
    };
    const handleMode = (m) => {
      if (m === 'play') {
        if (phase === 'idle') { if (age >= 1.2) startIntro(); }
        else if (phase === 'outro') startIntro();
        else if (phase === 'wait' && (sawOver || pt > 5)) startIntro();
      } else if (m === 'idle') {
        if (phase === 'intro' || phase === 'play' || phase === 'end' || phase === 'wait') startOutro();
      } else if (m === 'over') {
        if (phase === 'wait') sawOver = true;
      }
    };

    // ---- обновление по фазам ----
    const updIntro = (dt) => {
      updateGuardIdle(dt);
      // остатки прошлого лаза засыпаются
      tunA = Math.max(0, tunA - dt * 2.5);
      pileA = Math.max(0, pileA - dt * 2.5);
      tileOpen = Math.max(0, tileOpen - dt * 3);
      const there = prMove(dt);
      if (!there) pr.pose = 'walk';
      else if (pt > 0.45 && pt < 1.25) {
        pr.pose = 'front';
        if (pt > 0.7 && pt < 1.05) { if (!fl1) { fl1 = true; sfx('click'); spark(SMITH_X + 6, FLOOR - 28, 3, '#fff2a8', 30, 0.2); } pr.wink = 1; } else pr.wink = 0;
      } else { pr.pose = 'forge'; pr.face = 1; pr.wink = 0; }
      if (pt >= INTRO_T) beginPlay();
    };

    const updPlay = (dt) => {
      time += dt;
      if (time >= SHIFT) { finish(); return; }
      if (hitCd > 0) hitCd -= dt;
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
      const want = (digHoldKey || digHoldPtr) && guard.state !== 'alert';
      digging = want;
      pr.x = digging || (guard.state === 'alert' && guard.t < 0.4 && pr.x === CROUCH_X) ? CROUCH_X : SMITH_X;
      pr.tx = pr.x;
      tileOpen = digging ? 1 : 0;
      if (segs > 0 || prog > 0.1) pileA = 1;
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
      updateGuardPlay(dt);
      if (digging && looksAtDig()) {
        seenT += dt;
        if (seenT > 0.22) caught();
      } else seenT = Math.max(0, seenT - dt * 2);
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
      if (lives <= 0) finish();
    };

    // поймали / смена кончилась: стражник подходит, потом карточка результата
    const updEndWait = (dt) => {
      const g = guard;
      g.t += dt;
      g.moving = false;
      if (endWin) {
        if (g.state === 'iwalk') updateGuardIdle(dt);
        else { g.state = 'stand'; g.dir = -1; }
        pr.pose = 'front'; pr.wink = 0;
        if (Math.abs(pr.x - SMITH_X) > 0.5) { pr.tx = SMITH_X; pr.spd = 50; if (!prMove(dt)) pr.pose = 'walk'; }
      } else {
        // стражник быстро подходит и встаёт рядом
        const tx = pr.x + 18;
        const d = tx - g.x;
        if (Math.abs(d) > 1) { g.dir = d > 0 ? 1 : -1; g.x += g.dir * Math.min(Math.abs(d), 70 * dt); g.moving = true; }
        else g.dir = -1;
        g.state = 'grab';
        pr.pose = 'handsup'; pr.face = 1;
      }
      if (phase === 'end' && pt > 1.2) {
        setPhase('wait');
        sawOver = false;
        try { api.over(lastScore); } catch (e) { /* хост */ }
      }
    };

    const updOutro = (dt) => {
      updateGuardIdle(dt);
      pr.t += dt;
      if (pr.st === 'cover') {
        if (prMove(dt)) {
          pr.pose = 'crouch';
          // задвигает плитку и прячет землю
          tileOpen = Math.max(0, tileOpen - dt * 2);
          pileA = Math.max(0, pileA - dt * 2);
          if (!fl1) { fl1 = true; pr.t = 0; }
          if (pr.t > 0.7 && tileOpen <= 0) { pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 70; sfx('step'); }
        } else pr.pose = 'walk';
      } else if (pr.st === 'back') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.hitT = 0.4; pr.t = 0; }
      } else {
        pr.pose = 'forge';
      }
      tunA = Math.max(0, tunA - dt * 1.2);
      if (tunA <= 0) { segs = 0; prog = 0; }
      if ((pt >= OUTRO_T && pr.st === 'forge') || pt >= OUTRO_MAX) {
        setPhase('idle');
        if (pr.st !== 'forge') { pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 60; }
        tileOpen = 0; pileA = 0; tunA = 0; segs = 0; prog = 0;
        tGlance = 8 + rand() * 8;
      }
    };

    // ---- мелкая жизнь: крыса, капель ----
    const updLife = (dt) => {
      if (phase === 'idle' || phase === 'outro') {
        tRat -= dt;
        if (tRat <= 0 && !rat.on) { tRat = 16 + rand() * 18; rat.on = true; rat.x = 306; rat.dir = -1; rat.st = 0; rat.t = 0; rat.tx = 236 + rand() * 40; }
      }
      if (rat.on) {
        rat.t += dt;
        if (rat.st === 0) { rat.x -= 34 * dt; if (rat.x <= rat.tx) { rat.st = 1; rat.t = 0; } }
        else if (rat.st === 1) { if (rat.t > 1.2 + (rat.tx % 1)) { rat.st = 2; rat.dir = 1; } }
        else { rat.x += 44 * dt; if (rat.x > 308) rat.on = false; }
      }
      tDrop -= dt;
      if (tDrop <= 0) {
        tDrop = 2.5 + rand() * 4;
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          if (d.on) continue;
          d.on = true; d.x = 120 + Math.floor(rand() * 170); d.y = 1; d.vy = 0; d.t = 0;
          break;
        }
      }
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.on) continue;
        d.t += dt;
        if (d.t < 0.8) continue; // набухает
        d.vy += 260 * dt;
        d.y += d.vy * dt;
        if (d.y >= FLOOR) { d.on = false; spark(d.x, FLOOR - 1, 2, '#8aa0c0', 18, 0.6); }
      }
    };

    const update = (dt) => {
      clock += dt; age += dt; pt += dt;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * p.g * dt;
      }
      for (let i = 0; i < pops.length; i++) {
        const p = pops[i];
        if (!p.on) continue;
        p.life -= dt * 0.9;
        p.y -= dt * 14;
        if (p.life <= 0) p.on = false;
      }
      if (swing > 0) swing -= dt;
      if (bellT > 0) bellT -= dt;
      if (phase === 'idle') { updateGuardIdle(dt); updPrisonerIdle(dt); }
      else if (phase === 'intro') updIntro(dt);
      else if (phase === 'play') updPlay(dt);
      else if (phase === 'end' || phase === 'wait') updEndWait(dt);
      else updOutro(dt);
      updLife(dt);
      const inGame = phase === 'play' || phase === 'end' || phase === 'wait';
      const hudT = inGame || (phase === 'intro' && pt > 0.9) ? 1 : 0;
      hudA += (hudT - hudA) * Math.min(1, dt * 4);
      const coneT = phase === 'play' || (phase === 'intro' && pt > 1.2) ? 1 : 0;
      coneA += (coneT - coneA) * Math.min(1, dt * 4);
      const dimT = phase === 'end' ? Math.min(1, pt) : phase === 'wait' ? 0.6 : 0;
      dimA += (dimT - dimA) * Math.min(1, dt * 3);
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
      // окно с решёткой (стекло и луч рисуются вживую — день/ночь)
      ctx.fillStyle = '#1a1a2c'; ctx.fillRect(236, 16, 30, 22);
      ctx.fillStyle = '#2a2428'; ctx.fillRect(18, 40, 46, 10); ctx.fillRect(28, 0, 26, 40);
      // крюк колокола
      ctx.fillStyle = '#4a4248'; ctx.fillRect(186, 6, 14, 2); ctx.fillRect(192, 8, 2, 3);
      // крысиная нора
      ctx.fillStyle = '#16121a'; ctx.fillRect(302, FLOOR - 5, 8, 5); ctx.fillRect(303, FLOOR - 6, 6, 1);
      // пол и земля в разрезе
      ctx.fillStyle = '#4a4450'; ctx.fillRect(0, FLOOR, W, 4);
      ctx.fillStyle = '#5c5662';
      for (let x = 0; x < W; x += 16) ctx.fillRect(x, FLOOR, 15, 1);
      ctx.fillStyle = '#3e2c20'; ctx.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
      ctx.fillStyle = '#4a3626';
      for (let i = 0; i < stones.length; i += 3) ctx.fillRect(stones[i], stones[i + 1], stones[i + 2], 2);
    };
    const drawLive = () => {
      // окно: днём голубое небо и тёплый луч, ночью луна
      ctx.fillStyle = PANE[Math.round(dark * 7)]; ctx.fillRect(238, 18, 26, 18);
      if (dark > 0.5) { ctx.fillStyle = '#e8ecf4'; ctx.fillRect(255, 21, 4, 4); }
      else { ctx.fillStyle = '#e8f0ff'; ctx.fillRect(242, 24, 7, 2); ctx.fillRect(244, 23, 3, 1); }
      ctx.fillStyle = '#5a5866';
      for (let x = 241; x < 264; x += 6) ctx.fillRect(x, 16, 2, 22);
      ctx.fillStyle = dark > 0.5 ? pickA(MOONBEAM, 0.85) : pickA(SUNBEAM, 1 - dark);
      for (let i = 0; i < 6; i++) ctx.fillRect(232 - i * 6, 38 + i * 18, 34 + i * 4, 18);
      // колокол
      const bs = bellT > 0 ? Math.round(Math.sin(clock * 22) * 2) : 0;
      ctx.fillStyle = '#c8a040'; ctx.fillRect(189 + bs, 11, 8, 6); ctx.fillRect(188 + bs, 16, 10, 2);
      ctx.fillStyle = '#e8c860'; ctx.fillRect(190 + bs, 11, 2, 5);
      ctx.fillStyle = '#6a5020'; ctx.fillRect(192 + bs * 2, 18, 2, 2);
      if (bellT > 0 && ((clock * 8) | 0) & 1) {
        ctx.fillStyle = '#ffe8a0';
        ctx.fillRect(181, 10, 3, 1); ctx.fillRect(180, 14, 3, 1); ctx.fillRect(202, 10, 3, 1); ctx.fillRect(203, 14, 3, 1);
      }
      // горн слева
      const fl = 0.75 + 0.25 * Math.sin(clock * 11) * Math.sin(clock * 4.3);
      ctx.fillStyle = pickA(FORGE1, (0.12 * fl + 0.05) / 0.17);
      ctx.fillRect(0, 70, 96, FLOOR - 70);
      ctx.fillStyle = pickA(FORGE2, fl);
      ctx.fillRect(10, 90, 70, FLOOR - 90);
      ctx.fillStyle = '#4a4248'; ctx.fillRect(16, 112, 50, FLOOR - 112);
      ctx.fillStyle = '#5a5258'; ctx.fillRect(16, 112, 50, 3);
      ctx.fillStyle = '#1c1416'; ctx.fillRect(22, 118, 38, 14);
      ctx.fillStyle = fl > 0.8 ? '#ffb040' : '#ff8a30'; ctx.fillRect(24, 124, 34, 8);
      ctx.fillStyle = '#ffe080'; ctx.fillRect(28 + Math.round(fl * 6), 126, 4, 3); ctx.fillRect(44 - Math.round(fl * 4), 125, 5, 3);
      ctx.fillStyle = '#c04020'; ctx.fillRect(24, 130, 34, 2);
      // факел у окна
      const tf = 0.7 + 0.3 * Math.sin(clock * 13 + 2);
      ctx.fillStyle = pickA(TORCH, tf); ctx.fillRect(196, 40, 34, 40);
      ctx.fillStyle = '#4a3020'; ctx.fillRect(212, 58, 2, 10);
      ctx.fillStyle = '#ffb040'; ctx.fillRect(211, 54, 4, 4);
      ctx.fillStyle = '#ffe080'; ctx.fillRect(212, 53 - Math.round(tf), 2, 2);
      // ящик готовых изделий
      ctx.fillStyle = '#5a3c22'; ctx.fillRect(CRATE_X, FLOOR - 16, 26, 16);
      ctx.fillStyle = '#7a5430'; ctx.fillRect(CRATE_X, FLOOR - 16, 26, 2); ctx.fillRect(CRATE_X, FLOOR - 9, 26, 1);
      ctx.fillStyle = '#9aa4b2';
      for (let i = 0; i < crateN; i++) ctx.fillRect(CRATE_X + 3 + i * 3, FLOOR - 19 - (i & 1), 2, 3);
      // капель
      ctx.fillStyle = '#8aa0c0';
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.on) continue;
        if (d.t < 0.8) ctx.fillRect(d.x, 0, 1, 1 + (d.t > 0.4 ? 1 : 0));
        else ctx.fillRect(d.x, Math.round(d.y), 1, 2);
      }
      // крыса
      if (rat.on) {
        const x = Math.round(rat.x), y = FLOOR;
        const sn = rat.st === 1 && ((clock * 6) | 0) & 1;
        ctx.fillStyle = '#5a5258'; ctx.fillRect(x - 3, y - 3, 7, 3);
        ctx.fillStyle = '#6a6268'; ctx.fillRect(x - 2, y - 4, 4, 1);
        const hx = rat.dir < 0 ? x - 5 : x + 4;
        ctx.fillRect(hx, y - 3 + (sn ? 1 : 0), 2, 2);
        ctx.fillStyle = '#c89aa0'; ctx.fillRect(rat.dir < 0 ? x + 4 : x - 7, y - 1, 3, 1); // хвост
        ctx.fillStyle = '#1a1418'; ctx.fillRect(hx + (rat.dir < 0 ? 0 : 1), y - 3, 1, 1);
      }
    };

    const drawTunnel = () => {
      // вертикальный лаз под тайником + горизонтальные сегменты влево
      if (tunA > 0.01 && (segs > 0 || prog > 0)) {
        if (tunA < 1) ctx.globalAlpha = tunA;
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
          drawIcon(ctx, 'shovel', DIG_X + 14, ty + 1, 1);
          drawText(ctx, 'x', DIG_X + 23, ty + 2, '#ffd34a', 1);
          drawInt(ctx, segs, DIG_X + 27, ty + 2, '#ffd34a', 1);
        }
        ctx.globalAlpha = 1;
      }
      // плитка-тайник (сдвигается вбок)
      ctx.fillStyle = '#5c5662';
      if (tileOpen > 0.02) {
        ctx.fillStyle = '#140c0c'; ctx.fillRect(DIG_X - 1, FLOOR, 12, 2);
        ctx.fillStyle = '#5c5662'; ctx.fillRect(DIG_X - 1 - Math.round(13 * tileOpen), FLOOR - 2 * (tileOpen > 0.5 ? 1 : 0), 12, tileOpen > 0.5 ? 3 : 2);
      } else ctx.fillRect(DIG_X - 1, FLOOR, 12, 2);
      // кучка земли (спрятана под мешком)
      if (pileA > 0.01) {
        if (pileA < 1) ctx.globalAlpha = pileA;
        ctx.fillStyle = '#b8a070'; ctx.fillRect(DIG_X + 14, FLOOR - 6, 10, 6);
        ctx.fillStyle = '#9a8458'; ctx.fillRect(DIG_X + 15, FLOOR - 7, 8, 1); ctx.fillRect(DIG_X + 18, FLOOR - 8, 2, 1);
        ctx.globalAlpha = 1;
      }
    };

    const drawCone = () => {
      if (coneA < 0.02) return;
      ctx.globalAlpha = coneA;
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
      ctx.globalAlpha = 1;
    };

    const drawZ = (x, y) => { ctx.fillRect(x, y, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x, y + 2, 3, 1); };

    const drawGuard = () => {
      const g = guard;
      const x = Math.round(g.x);
      const u = U;
      const bend = g.state === 'collect' && g.t > 0.4 && g.t < 1.4 ? 2 * u : 0;
      const doze = g.state === 'doze';
      const y = FLOOR;
      const yb = y + bend; // верх тела опускается, когда наклоняется
      const step = g.moving ? Math.floor(clock * 6) & 1 : 0;
      const d = g.dir;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
      ctx.fillStyle = '#2a2228';
      ctx.fillRect(x - u + (step ? u : 0), y - 4 * u, u, 4 * u);
      ctx.fillRect(x + u - (step ? u : 0), y - 4 * u, u, 4 * u);
      ctx.fillStyle = '#7a2a2e'; ctx.fillRect(x - 2 * u, yb - 11 * u, 5 * u, 8 * u - bend);
      ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x - 2 * u, yb - 11 * u, 5 * u, 2 * u); // наплечник
      ctx.fillStyle = '#5a1e22'; ctx.fillRect(x - 2 * u, yb - 6 * u, 5 * u, u);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(x, yb - 6 * u, u, u);
      // голова и шлем
      const hy = yb + (doze ? u : 0);
      ctx.fillStyle = '#d8b08a'; ctx.fillRect(x - u, hy - 15 * u, 4 * u, 4 * u);
      ctx.fillStyle = '#2a1e1e';
      if (doze) ctx.fillRect(d > 0 ? x + u : x - u, hy - 13 * u, 2 * u, 1);
      else ctx.fillRect(d > 0 ? x + 2 * u : x - u, hy - 14 * u, u, u);
      if (g.state === 'yawn' && g.t > 0.3 && g.t < 1.9) { ctx.fillStyle = '#5a1e22'; ctx.fillRect(d > 0 ? x + u : x, hy - 12 * u, u, u + 1); }
      ctx.fillStyle = '#8a94a2'; ctx.fillRect(x - 2 * u, hy - 16 * u, 6 * u, 2 * u);
      ctx.fillStyle = '#b8c2ce'; ctx.fillRect(x - u, hy - 17 * u, 4 * u, u);
      // рука с фонарём (зевает — потягивается свободной рукой)
      if (g.state === 'yawn' && g.t > 0.3 && g.t < 1.9) {
        ctx.fillStyle = '#7a2a2e'; ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, yb - 15 * u, u, 4 * u);
        ctx.fillStyle = '#d8b08a'; ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, yb - 16 * u, u, u);
      }
      const lx = d > 0 ? x + 3 * u : x - 3 * u;
      ctx.fillStyle = '#7a2a2e'; ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, yb - 10 * u, u, 3 * u);
      ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, yb - 8 * u, 3 * u, u);
      const lf = 0.8 + 0.2 * Math.sin(clock * 10);
      ctx.fillStyle = pickA(LANT, lf); ctx.fillRect(lx - 6 * u, yb - 13 * u, 13 * u, 11 * u);
      ctx.fillStyle = '#ffd060'; ctx.fillRect(lx - u + 1, yb - 7 * u, 2 * u, 2 * u);
      ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, yb - 5 * u, 3 * u, u);
      // копьё (у пойманного постукивает древком)
      const tap = g.state === 'grab' && phase === 'wait' && (((clock * 3) | 0) & 1) ? u : 0;
      ctx.fillStyle = '#6a4a2c'; ctx.fillRect(d > 0 ? x - 3 * u : x + 4 * u, y - 20 * u - tap, u, 19 * u);
      ctx.fillStyle = '#c8d0dc'; ctx.fillRect(d > 0 ? x - 3 * u : x + 4 * u, y - 22 * u - tap, u, 2 * u);
      // значки
      if (g.state === 'suspect' || g.stir > 0) drawText(ctx, '?', x - 1, y - 52, '#ffe08a', 2);
      else if ((g.state === 'alert' || (g.state === 'grab' && phase === 'end')) && (Math.floor(clock * 8) & 1)) drawText(ctx, '!', x, y - 52, '#ff5050', 2);
      else if (doze) {
        ctx.fillStyle = '#d8d8f0';
        const zt = (clock * 0.7) % 1;
        drawZ(x + 6 + Math.round(zt * 4), y - 38 - Math.round(zt * 10));
        drawZ(x + 10 + Math.round(((zt + 0.5) % 1) * 4), y - 38 - Math.round(((zt + 0.5) % 1) * 10));
      }
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
      let ic = null, heat = 0;
      if (phase === 'play' || phase === 'end' || phase === 'wait') {
        if (order && orderGap <= 0) { ic = order.o.icon; heat = 1 - order.hits.length / 3; }
      } else if (pr.st !== 'tocrate') { ic = pr.icon; heat = 1 - pr.hits / pr.need; }
      if (ic) {
        ctx.fillStyle = heat > 0.5 ? '#ffb040' : heat > 0.1 ? '#e07030' : '#b0b8c4';
        if (ic === 'sword') ctx.fillRect(x - 6, y - 24, 16, 2);
        else if (ic === 'pickaxe') { ctx.fillRect(x - 4, y - 24, 12, 2); ctx.fillRect(x - 5, y - 25, 2, 1); ctx.fillRect(x + 7, y - 25, 2, 1); }
        else { ctx.fillRect(x - 2, y - 24, 8, 2); ctx.fillRect(x - 3, y - 25, 2, 1); ctx.fillRect(x + 5, y - 25, 2, 1); }
      }
    };

    const ROBE = '#c8c4b8', STRIPE = '#5a5660', SKIN = '#e8be96', HAIR = '#3a2a1e';
    const drawPrisoner = () => {
      const u = U;
      const y = FLOOR;
      const inGame = phase === 'play';
      const pose = inGame ? (pr.x === CROUCH_X ? 'crouch' : 'forge') : pr.pose;
      const x0 = inGame ? (pose === 'crouch' ? CROUCH_X : SMITH_X) : Math.round(pr.x);
      if (pose === 'crouch') {
        // присел у тайника
        const x = x0;
        const dig = (digging || pr.st === 'peek' || pr.st === 'cover') ? Math.floor(clock * 6) & 1 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
        ctx.fillStyle = ROBE; ctx.fillRect(x - 2 * u, y - 7 * u, 6 * u, 5 * u);
        ctx.fillStyle = STRIPE; ctx.fillRect(x - 2 * u, y - 6 * u, 6 * u, u); ctx.fillRect(x - 2 * u, y - 4 * u, 6 * u, u);
        ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 2 * u, y - 2 * u, 2 * u, 2 * u); ctx.fillRect(x + 2 * u, y - 2 * u, 2 * u, 2 * u);
        ctx.fillStyle = SKIN; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, 4 * u);
        ctx.fillStyle = HAIR; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, u);
        ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x - 3 * u, y - 8 * u, u, u);
        if (inGame || pr.st === 'cover') {
          // лопата
          ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 4 * u, y - (8 - dig) * u, u, 6 * u);
          ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x - 5 * u, y - (3 - dig) * u, 3 * u, 2 * u);
        } else {
          ctx.fillStyle = SKIN; ctx.fillRect(x - 4 * u, y - (4 - dig) * u, u, 2 * u);
        }
        if (inGame && seenT > 0) drawIcon(ctx, 'eye', x - 7, y - 34, 2);
        return;
      }
      const x = x0;
      const moving = pose === 'walk' || pose === 'carry';
      const st = moving ? ((clock * 8) | 0) & 1 : 0;
      const face = pose === 'forge' ? 1 : pr.face;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
      ctx.fillStyle = '#2a2228'; ctx.fillRect(x - u + (st ? u : 0), y - 3 * u, u, 3 * u); ctx.fillRect(x + u - (st ? u : 0), y - 3 * u, u, 3 * u);
      ctx.fillStyle = ROBE; ctx.fillRect(x - 2 * u, y - 10 * u, 5 * u, 7 * u);
      ctx.fillStyle = STRIPE;
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 2 * u, y - (9 - i * 2) * u, 5 * u, u);
      const sheep = pose === 'handsup' && phase === 'wait' && ((clock * 0.5) % 2) < 0.8 ? u : 0; // виновато опускает голову
      ctx.fillStyle = SKIN; ctx.fillRect(x - u, y - 14 * u + sheep, 4 * u, 4 * u);
      ctx.fillStyle = HAIR;
      ctx.fillRect(x - u, y - 14 * u + sheep, 4 * u, u);
      if (pose === 'front') {
        ctx.fillStyle = '#2a1e1e';
        ctx.fillRect(x, y - 12 * u, u, u);
        if (pr.wink) ctx.fillRect(x + 2 * u - 1, y - 12 * u + 1, u + 1, 1); else ctx.fillRect(x + 2 * u - 1, y - 12 * u, u, u);
        ctx.fillStyle = '#a8644a'; ctx.fillRect(x, y - 11 * u + 1, 3 * u - 1, 1);
      } else {
        ctx.fillRect(face > 0 ? x - u : x + 2 * u, y - 13 * u + sheep, u, u);
        ctx.fillStyle = '#2a1e1e'; ctx.fillRect(face > 0 ? x + 2 * u : x - u, y - 13 * u + sheep, u, u);
      }
      // руки
      ctx.fillStyle = SKIN;
      if (pose === 'forge') {
        if (swing > 0) {
          ctx.fillRect(x + 3 * u, y - 9 * u, 3 * u, u);
          ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 6 * u, y - 10 * u, u, 3 * u);
          ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + 6 * u - 2, y - 13 * u + 2, 3 * u, 3 * u - 2);
        } else {
          ctx.fillRect(x + 2 * u, y - 13 * u, u, 4 * u);
          ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 2 * u, y - 17 * u, u, 4 * u);
          ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + u, y - 19 * u, 4 * u, 2 * u);
        }
      } else if (pose === 'handsup') {
        ctx.fillRect(x - 3 * u, y - 16 * u, u, 5 * u); ctx.fillRect(x + 3 * u, y - 16 * u, u, 5 * u);
      } else if (pose === 'carry') {
        const hx = face > 0 ? x + 3 * u : x - 4 * u;
        ctx.fillRect(hx, y - 9 * u, 2 * u, u);
        ctx.fillStyle = '#9aa4b2'; ctx.fillRect(face > 0 ? hx + u : hx - u, y - 10 * u, 2 * u, u);
      } else {
        // опущенная рука с молотом
        const hx = face > 0 ? x + 3 * u : x - 2 * u;
        ctx.fillRect(hx, y - 9 * u, u, 3 * u);
        ctx.fillStyle = '#7a4e2a'; ctx.fillRect(hx, y - 6 * u, u, 2 * u);
        ctx.fillStyle = '#7e8a9a'; ctx.fillRect(hx - u, y - 4 * u, 3 * u, u);
      }
    };

    const drawBar = () => {
      const bx = 100, by = 64, bw = 120, bh = 8;
      ctx.fillStyle = '#1a1418'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(bx, by, bw, bh);
      if (!order || orderGap > 0 || phase !== 'play') {
        ctx.fillStyle = '#3a3036'; ctx.fillRect(bx, by, bw, bh);
        drawIcon(ctx, 'hammer', bx - 14, by, 1);
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
      drawIcon(ctx, 'hammer', bx - 14, by, 1);
      // три удара
      for (let i = 0; i < 3; i++) {
        const q = order.hits[i];
        ctx.fillStyle = q == null ? '#3a3036' : q === 2 ? '#3ec060' : q === 1 ? '#c8a040' : '#a03030';
        ctx.fillRect(bx + bw / 2 - 13 + i * 9, by + bh + 5, 7, 3);
      }
    };

    const drawHUD = () => {
      if (hudA < 0.02) return;
      const slide = Math.round((1 - hudA) * 30);
      ctx.globalAlpha = hudA;
      ctx.save();
      ctx.translate(0, -slide);
      // жизни
      for (let i = 0; i < 3; i++) drawIcon(ctx, i < lives ? 'heart' : 'heartEmpty', 4 + i * 16, 4, 2);
      // часы
      const tl = phase === 'play' ? Math.ceil(timeLeft()) : phase === 'intro' ? SHIFT : Math.ceil(timeLeft());
      const mins = Math.floor(tl / 60), secs = tl % 60;
      const tw = intWidth(mins, 2) + 2 + textWidth(':', 2) + 2 + intWidth(secs, 2, 2) + 18;
      const tx = Math.round(W / 2 - tw / 2);
      ctx.fillStyle = 'rgba(20,14,18,0.6)'; ctx.fillRect(tx - 3, 3, tw + 6, 16);
      drawIcon(ctx, 'clock', tx, 4, 2);
      const tc = tl <= 10 && (Math.floor(clock * 4) & 1) ? '#ff7070' : '#f4ecdc';
      let cx = tx + 18;
      cx += drawInt(ctx, mins, cx, 6, tc, 2) + 2;
      cx += drawText(ctx, ':', cx, 6, tc, 2) + 2;
      drawInt(ctx, secs, cx, 6, tc, 2, 2);
      // счёт
      const sc = Math.floor(scoreV);
      const sw = intWidth(sc, 2);
      ctx.fillStyle = 'rgba(20,14,18,0.6)'; ctx.fillRect(W - sw - 10, 3, sw + 7, 14);
      drawInt(ctx, sc, W - sw - 5, 7, '#1a0e08', 2);
      drawInt(ctx, sc, W - sw - 6, 6, '#fff2d0', 2);
      const b = Math.max(best, sc);
      const bw = intWidth(b, 1);
      drawIcon(ctx, 'trophy', W - bw - 15, 19, 1);
      drawInt(ctx, b, W - bw - 5, 20, '#ffd34a', 1);
      // заказ
      const o = order && phase !== 'intro' ? order.o : ORDERS[0];
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(4, 24, 30, 34);
      ctx.fillStyle = '#b8a47a'; ctx.fillRect(4, 56, 30, 2); ctx.fillRect(32, 24, 2, 34);
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(17, 22, 4, 4);
      drawIcon(ctx, o.icon, 9, 29, 3);
      if (order && orderGap <= 0 && phase === 'play') {
        const k = Math.max(0, order.pat / order.max);
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(6, 52, 26, 3);
        ctx.fillStyle = k > 0.35 ? '#3ec060' : (Math.floor(clock * 6) & 1) ? '#ff5050' : '#c03030';
        ctx.fillRect(6, 52, Math.round(26 * k), 3);
      }
      if (combo >= 2 && phase === 'play') { const w = drawText(ctx, 'x', 38, 27, '#7dffaa', 1); drawInt(ctx, combo, 39 + w, 27, '#7dffaa', 1); }
      drawBar();
      ctx.restore();
      // кнопка-лопата выезжает снизу
      ctx.save();
      ctx.translate(0, slide * 2);
      const pressed = digging;
      ctx.fillStyle = pressed ? '#2a1e14' : '#1a120e';
      ctx.fillRect(BTN.x - 1, BTN.y - 1, BTN.w + 2, BTN.h + 2);
      ctx.fillStyle = pressed ? '#6a4a2c' : '#8a6440';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, BTN.h);
      ctx.fillStyle = pressed ? '#5a3c22' : '#a87c50';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, 2);
      drawIcon(ctx, 'shovel', BTN.x + 11, BTN.y + 4 + (pressed ? 1 : 0), 3);
      ctx.fillStyle = '#2a1e14'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, BTN.w - 6, 4);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, Math.round((BTN.w - 6) * prog), 4);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawPops = () => {
      for (let i = 0; i < pops.length; i++) {
        const p = pops[i];
        if (!p.on) continue;
        const w = textWidth(p.s, 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2) + 1, Math.round(p.y) + 1, '#1a0e08', 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2), Math.round(p.y), p.c, 2);
      }
    };

    const draw = () => {
      drawRoom();
      drawTunnel();
      drawCone();
      drawGuard();
      drawAnvil();
      drawPrisoner();
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      if (dimA > 0.01) { ctx.fillStyle = pickA(DIM, dimA); ctx.fillRect(0, 0, W, H); }
      drawHUD();
      drawPops();
    };

    // ---- цикл ----
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let stillT = 0;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.05);
      envT -= dt;
      if (envT <= 0) { envT = 0.5; pollEnv(); }
      const m = getMode();
      const paused = typeof api.paused === 'function' && !!api.paused();
      const still = !anim && phase === 'idle' && m !== 'play';
      if (!paused && !still) {
        handleMode(m);
        update(dt);
        stillT = 0;
        draw();
      } else {
        // пауза или «без анимаций» — неподвижный кадр, перерисовываем изредка
        if (!paused && m === 'play') handleMode(m);
        stillT -= dt;
        if (stillT <= 0) { stillT = 0.5; draw(); }
      }
      raf = requestAnimationFrame(loop);
    };
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
