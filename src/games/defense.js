// Мини-игра «Защита деревни» и живой фон «Нашествие».
// Вид сбоку: деревня за частоколом справа, слева поле и дорога с внешними воротами.
// Фон (idle): сумерки/ночь по реальным часам, жители ходят, болтают, носят ящики, копаются
// в огороде, окна гаснут и зажигаются, дым из трубы, светлячки, падающие звёзды; часовой на
// помосте. Изредка одинокий зомби бредёт к внешним воротам и застревает — часовой его снимает.
// Вступление: орда сбегается к внешним воротам, жители прячутся, ворота трещат и ломаются,
// зомби валят на поле — волна 1. Игра: клик по зомби, лавка между волнами (стрелок, забор, лечение).
// Выход: бьёт колокол, стражник и жители с факелами выходят, зомби бегут, ворота чинят — покой.
// Поражение: ворота частокола выбиты, зомби замирают у пролома (спокойная сцена под карточкой).
// Счёт = убийства + волна * 20. Всё рисуется целочисленными fillRect, цвета из кэша.

import { drawNumber, drawText, textWidth, drawIcon, rgbStr, rgbMix } from './pixfont.js';

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
const OUTER_X = 116; // внешние ворота на дороге
const GATE_Y0 = 136; // ворота частокола (по глубине)
const GATE_Y1 = 166;
const GIN_X = 264, GOUT_X = 238, GATE_Y = 151;
const DOORS_X = [274, 305];
const DOOR_Y = 142;
const CRATE_X = 313, CRATE_Y = 165;
const OFF_R = 326; // за правым краем помоста

const lerp = (a, b, t) => a + (b - a) * t;
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
const BOX = {
  normal: { l: -2, r: 5, t: -13 },
  fast: { l: -2, r: 4, t: -10 },
  big: { l: -4, r: 10, t: -25 }
};
const PAD = 3;

// цвета
const NIGHTC = [16, 18, 30];
const BLACK = [0, 0, 0];
const SKY_T0 = [90, 110, 170], SKY_T1 = [10, 12, 34];
const SKY_B0 = [240, 150, 100], SKY_B1 = [44, 34, 70];
const MOON0 = [255, 230, 170], MOON1 = [235, 238, 250];
const MOOND0 = [230, 200, 140], MOOND1 = [190, 198, 220];
const HILL0 = [86, 110, 90], HILL1 = [18, 22, 36];
const TREE0 = [60, 96, 60], TREE1 = [14, 22, 26];
const TRUNK0 = [70, 50, 36], TRUNK1 = [16, 14, 20];
const GRASS0 = [84, 150, 60], GRASS1 = [16, 26, 24];
const PATH0 = [150, 120, 80], PATH1 = [28, 24, 28];
const PATHL0 = [170, 140, 96], PATHL1 = [34, 30, 34];
const TUFT = [140, 200, 90];
const WALLC0 = [200, 168, 116], WALLC1 = [40, 34, 44];
const ROOF0 = [150, 60, 44], ROOF1 = [30, 18, 26];
const WIN0 = [120, 160, 190], WIN1 = [30, 34, 50];
const WOOD0 = [150, 108, 66], WOOD1 = [40, 30, 30];
const STAKE0 = [130, 92, 56], STAKE1 = [36, 28, 28];
const GATEW0 = [112, 78, 46];
const IRON = [90, 92, 100];
const PUMPKIN = [220, 120, 40], LEAF = [70, 120, 50];
const Z_LEG = [42, 52, 80], Z_SHIRT = [74, 106, 138], Z_SHIRTD = [46, 62, 90], Z_SKIN = [95, 138, 78], Z_SKIND = [75, 110, 61], Z_FSHIRT = [84, 110, 140];
const G_LEG = [60, 44, 34], G_BODY = [120, 80, 50], G_BELT = [90, 60, 40], SKIN = [232, 190, 150], EYE = [40, 30, 30], HELM = [150, 156, 168], BOWC = [168, 114, 62];
const NOSE = [200, 150, 116];
const ROBES = [[140, 100, 60], [222, 214, 196], [70, 70, 80], [130, 80, 150], [120, 80, 50]];
const ROBED = [[110, 76, 44], [180, 170, 150], [50, 50, 58], [100, 60, 118], [90, 60, 40]];
const HATS = [[214, 180, 96], [200, 196, 180], [40, 40, 44], [110, 62, 130], [150, 156, 168]];
const CRATE0 = [168, 120, 70], CRATE1 = [110, 76, 44];
const SPEAR = [200, 206, 216];
const BELL = [200, 160, 60];

export default {
  id: 'defense',
  title: 'Защита деревни',
  sceneTitle: 'Нашествие',
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
    canvas.style.touchAction = 'none';

    const getMode = () => {
      if (typeof api.mode === 'function') return api.mode();
      if (typeof api.auto === 'function') return api.auto() ? 'idle' : 'play';
      return 'play';
    };
    const getEnv = () => (typeof api.env === 'function' ? api.env() : null);
    const envDark = () => {
      const e = getEnv();
      return e && typeof e.dark === 'number' ? clamp(e.dark, 0, 1) : 0.5;
    };
    const idleDark = () => 0.3 + 0.6 * envDark();

    // ---------- мир ----------
    const stars = [];
    for (let i = 0; i < 46; i++) stars.push({ x: Math.floor(rand() * W), y: Math.floor(rand() * 90), p: rand() * 6, big: rand() > 0.9 });
    const hills = [];
    for (let x = 0; x < W; x += 4) hills.push(Math.floor(118 - 10 * Math.sin(x / 41) - 6 * Math.sin(x / 15 + 1) - rand() * 2));
    const trees = [];
    for (let x = 4; x < 236; x += 10 + Math.floor(rand() * 18)) trees.push({ x, h: 8 + Math.floor(rand() * 10), w: 5 + Math.floor(rand() * 5) });
    const tufts = [];
    for (let i = 0; i < 40; i++) tufts.push({ x: Math.floor(rand() * 244), y: GROUND + 3 + Math.floor(rand() * 40) });
    const garden = [];
    for (let i = 0; i < 8; i++) garden.push({ x: 216 + (i % 4) * 6 + Math.floor(rand() * 2), y: 150 + Math.floor(i / 4) * 9 + Math.floor(rand() * 2) });
    const ffl = [];
    for (let i = 0; i < 7; i++) ffl.push({ ff: 1, x: 140 + rand() * 100, y: 140 + rand() * 30, p: rand() * 6, v: 0.5 + rand() });
    const CRACKS = [[250, 140], [254, 146], [251, 152], [255, 157], [249, 160], [253, 143], [256, 151], [250, 163]];

    // пулы
    const zombies = [];
    for (let i = 0; i < 48; i++) zombies.push({ zz: 1, on: false, isZ: true, type: 'normal', mode: 'play', x: 0.5, y: 0.5, hp: 0, max: 0, spd: 0.5, flash: 0.5, kb: 0.5, atk: false, phase: 0.5, dir: 1, hx: 0.5, hs: 0.5, give: 0.5 });
    const parts = [];
    for (let i = 0; i < 110; i++) parts.push({ dp: 1, on: false, gem: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, life: 0.5, c: '#fff' });
    const arrows = [];
    for (let i = 0; i < 30; i++) arrows.push({ da: 1, on: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5 });
    const slashes = [];
    for (let i = 0; i < 6; i++) slashes.push({ ds: 1, on: false, x: 0, y: 0, life: 0.5, d: 1 });
    const smoke = [];
    for (let i = 0; i < 12; i++) smoke.push({ dm: 1, on: false, x: 0.5, y: 0.5, life: 0.5 });
    const order = [];

    // ---------- жители ----------
    // kind: 0 житель, 1 стражник с копьём (у ворот), 2 часовой с луком (на помосте)
    const mkActor = (kind, robe, home) => ({
      ac: 1, isZ: false, kind, robe, home, on: true, x: 0.5, y: 0.5, dir: -1, spd: 22.5, state: 'idle', timer: 1 + rand() * 3, next: 'idle',
      carry: 0, torch: false, step: 0.5, emote: 0, emoteT: 0.5, path: new Float32Array(6), pl: 0, pi: 0, partner: null, cd: 1.5, rec: 0.5, delay: 0.5
    });
    const vils = [mkActor(0, 0, 0), mkActor(0, 1, 1), mkActor(0, 2, 0), mkActor(0, 3, 1)];
    const gateGuard = mkActor(1, 4, 0);
    const sentry = mkActor(2, 4, 0);
    const actors = [vils[0], vils[1], vils[2], vils[3], gateGuard];
    vils[0].x = 268; vils[0].y = 150;
    vils[1].x = 296; vils[1].y = 158;
    vils[2].x = 309; vils[2].y = 147; vils[2].state = 'in'; vils[2].on = false; vils[2].timer = 3;
    vils[3].x = 286; vils[3].y = 165;
    gateGuard.x = 266; gateGuard.y = 160; gateGuard.state = 'post'; gateGuard.timer = 4;
    sentry.x = 284; sentry.y = PLATFORM_Y; sentry.spd = 12; sentry.state = 'pace'; sentry.timer = 284; sentry.delay = 2;
    let gardener = null;

    const g = {
      phase: 'idle', // idle | intro | play | lose | wait | outro
      pt: 0, hold: 1.3, sawOver: false,
      mode: 'play', // внутри игры: play | shop
      t: 0,
      hp: MAX_HP, gems: 0, kills: 0, wave: 0,
      toSpawn: 0, spawnT: 0, spawnInt: 2, spdMul: 1,
      shopT: 0, banner: 0, shake: 0, hurtSnd: 0, hurtFlash: 0,
      guards: [], fences: 0,
      overSent: false,
      dark: idleDark(), hud: 0,
      gate: 0, gateReq: false, gdmg: 0, gbroken: false,
      og: 1, bell: 0, lone: 8 + rand() * 10,
      ssT: 12 + rand() * 20, ssX: 0, ssY: 0, ssA: -1,
      smokeT: 0, lit: [true, true, false, true], litT: 4,
      doorT: [0, 0], introTp: 1.6, introOg: true, hordeN: 0, ev: 0
    };
    const score = () => g.kills + g.wave * 20;

    const priceGuard = () => 25 + g.guards.length * 20;
    const priceFence = () => 12 + g.fences * 10;
    const priceHeal = () => 10 + g.wave * 3;

    const addPart = (x, y, vx, vy, life, c, gem = false) => {
      for (let i1 = 0; i1 < parts.length; i1++) { const p = parts[i1];
        if (p.on) continue;
        p.on = true; p.gem = gem; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.c = c;
        return;
      }
    };
    const C_SMOKE = ['#9aa0a0', '#c8cccc', '#5f8a4e', '#6a6e70'];
    const C_GREEN = ['#5f8a4e', '#4b6e3d', '#8bb070'];
    const C_WOOD = ['#a8723e', '#7a4e2a'];
    const C_PLANK = ['#a8723e', '#7a4e2a', '#c8945a', '#5a3a20'];
    const C_SPARK = ['#ffe070', '#ffffff', '#ffb040'];
    const C_DIRT = ['#c8b890'];
    const C_ARROWHIT = ['#8a6a40'];
    const burst = (x, y, n, colors, sp = 30) => {
      for (let i = 0; i < n; i++) addPart(x, y, (rand() - 0.5) * sp * 2, -rand() * sp - 10, 0.35 + rand() * 0.4, colors[i % colors.length]);
    };

    // ---------- зомби ----------
    const zFree = () => {
      for (let i2 = 0; i2 < zombies.length; i2++) { const z = zombies[i2]; if (!z.on) return z; }
      return null;
    };
    const zInit = (z, type, x, y, mode) => {
      const T = TYPES[type];
      z.on = true; z.type = type; z.mode = mode;
      z.x = x; z.y = y;
      z.hp = T.hp; z.max = T.hp;
      z.spd = T.spd * (0.9 + rand() * 0.2);
      z.flash = 0; z.kb = 0; z.atk = false; z.phase = rand() * 6; z.dir = 1; z.give = 999; z.hx = x; z.hs = 0;
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
      const z = zFree();
      if (!z) return;
      zInit(z, type, -12 - rand() * 6, LANE_TOP + Math.floor(rand() * LANE_H), 'play');
      z.spd = TYPES[type].spd * g.spdMul * (0.9 + rand() * 0.2);
    };

    const killZombie = (z) => {
      z.on = false;
      const T = TYPES[z.type];
      const cy = z.y - 6 * T.s;
      burst(z.x + 1, cy, 10, C_SMOKE, 26);
      if (g.phase === 'play') {
        g.kills++;
        g.gems += T.gem;
        for (let i = 0; i < T.gem; i++) addPart(z.x + 1, cy, (rand() - 0.5) * 40, -30 - rand() * 20, 1.4, '#2fd36a', true);
        api.sfx('coin');
      }
    };

    const damage = (z, amount, kb) => {
      z.hp -= amount;
      z.flash = 0.1;
      z.kb = kb / TYPES[z.type].s;
      const T = TYPES[z.type];
      burst(z.x + 1, z.y - 7 * T.s, 3, C_GREEN, 18);
      if (z.hp <= 0) killZombie(z);
    };

    const hitTest = (x, y, pad) => {
      let best = null;
      for (let i3 = 0; i3 < zombies.length; i3++) { const z = zombies[i3];
        if (!z.on) continue;
        const b = BOX[z.type];
        const l = z.dir > 0 ? b.l : -b.r, r = z.dir > 0 ? b.r : -b.l;
        if (x >= z.x + l - pad && x <= z.x + r + pad && y >= z.y + b.t - pad && y <= z.y + 1 + pad) {
          if (!best || z.x > best.x) best = z;
        }
      }
      return best;
    };

    const shoot = (sx, sy, target) => {
      const T = TYPES[target.type];
      const dist = Math.abs(target.x - sx);
      const ft = clamp(dist / 150, 0.35, 1.3);
      const moving = target.mode === 'play' ? !target.atk : target.mode === 'walk' || target.mode === 'flee' || target.mode === 'leave';
      const tx = moving ? target.x + target.spd * target.dir * ft : target.x;
      const ty = target.y - 6 * T.s;
      for (let i4 = 0; i4 < arrows.length; i4++) { const a = arrows[i4];
        if (a.on) continue;
        a.on = true; a.x = sx; a.y = sy;
        a.vx = (tx - sx) / ft;
        a.vy = (ty - sy) / ft - 0.5 * 140 * ft;
        return;
      }
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
    const activeGuards = () => {
      let n = 0;
      for (let i5 = 0; i5 < g.guards.length; i5++) { const gd = g.guards[i5]; if (!gd.leave) n++; }
      return n;
    };
    const buy = (i) => {
      if (g.phase !== 'play' || g.mode !== 'shop') return;
      if (i === 3) { startWave(); return; }
      if (!canBuy(i)) { api.sfx('hit'); return; }
      if (i === 0) {
        g.gems -= priceGuard();
        // новый стрелок поднимается на помост справа и идёт на своё место
        g.guards.push({ gd: 1, x: OFF_R + 0.5, tx: GUARD_SLOTS[g.guards.length], cd: 0.6 + rand() * 0.6, rec: 0.5, leave: false, step: 0.5 });
      } else if (i === 1) {
        g.gems -= priceFence();
        g.fences++;
      } else if (i === 2) {
        g.gems -= priceHeal();
        g.hp = Math.min(MAX_HP, g.hp + 20);
      }
      api.sfx('coin');
    };

    // ---------- ввод (только в игре) ----------
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      PT.x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
      PT.y = ((e.clientY - r.top) / Math.max(1, r.height)) * H;
      return PT;
    };
    const PT = { pt: 1, x: 0.5, y: 0.5 };
    const onPointerDown = (e) => {
      if (g.phase !== 'play') return;
      e.preventDefault();
      if (api.paused && api.paused()) return;
      const p = toLocal(e);
      if (g.mode === 'shop') {
        for (let i = 0; i < 4; i++) {
          const x = cardX(i);
          if (p.x >= x && p.x <= x + CARD_W && p.y >= CARD_Y && p.y <= CARD_Y + CARD_H) { buy(i); return; }
        }
        return;
      }
      for (let i6 = 0; i6 < slashes.length; i6++) { const s = slashes[i6];
        if (s.on) continue;
        s.on = true; s.x = Math.round(p.x); s.y = Math.round(p.y); s.life = 0.14; s.d = rand() > 0.5 ? 1 : -1;
        break;
      }
      const z = hitTest(p.x, p.y, PAD);
      if (z) {
        damage(z, 1, 5);
        if (z.on) api.sfx('hit');
      } else {
        burst(p.x, p.y, 2, C_DIRT, 10);
      }
    };
    const onCtx = (e) => { if (g.phase === 'play') e.preventDefault(); };
    const onKeyDown = (e) => {
      if (g.phase !== 'play') return;
      const c = e.code;
      if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        if (g.mode === 'shop') startWave();
      } else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3' || c === 'Numpad1' || c === 'Numpad2' || c === 'Numpad3') {
        e.preventDefault();
        if (e.repeat) return;
        buy(c.charCodeAt(c.length - 1) - 49);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKeyDown);

    // ---------- поведение жителей ----------
    const isOut = (x) => x < 252;
    const setPath = (a, x, y, next, spd) => {
      a.pl = 0; a.pi = 0; a.next = next; a.state = 'walk';
      if (spd) a.spd = spd;
      const p = a.path;
      if (isOut(a.x) !== isOut(x)) {
        if (isOut(a.x)) { p[0] = GOUT_X; p[1] = GATE_Y; p[2] = GIN_X; p[3] = GATE_Y; }
        else { p[0] = GIN_X; p[1] = GATE_Y; p[2] = GOUT_X; p[3] = GATE_Y; }
        a.pl = 2;
      }
      p[a.pl * 2] = x; p[a.pl * 2 + 1] = y;
      a.pl++;
    };
    const emote = (a, k, t) => { a.emote = k; a.emoteT = t; }; // 1 '!', 2 болтовня, 3 зевок
    const insideX = () => 262 + rand() * 50;
    const insideY = () => 146 + rand() * 22;
    const threat = () => {
      for (let i7 = 0; i7 < zombies.length; i7++) { const z = zombies[i7]; if (z.on && (z.mode === 'walk' || z.mode === 'rattle')) return true; }
      return false;
    };
    const comeOut = (a) => {
      a.on = true;
      a.x = DOORS_X[a.home];
      a.y = DOOR_Y;
      g.doorT[a.home] = 0.4;
    };

    const think = (a) => {
      a.spd = a.kind === 1 ? 18 : 20 + rand() * 6;
      if (a.kind === 1) {
        // стражник: стоит у ворот, иногда прохаживается и зевает
        const r = rand();
        if (r < 0.4) setPath(a, 262 + rand() * 10, 152 + rand() * 12, 'post');
        else { a.state = 'post'; a.timer = 3 + rand() * 5; if (r > 0.8) emote(a, 3, 1.4); }
        return;
      }
      const r = rand();
      if (r < 0.26) setPath(a, insideX(), insideY(), 'idle');
      else if (r < 0.42) setPath(a, DOORS_X[a.home], DOOR_Y, 'in');
      else if (r < 0.6) {
        let best = null;
        for (let i8 = 0; i8 < vils.length; i8++) { const b = vils[i8]; if (b !== a && b.on && b.state === 'idle' && !isOut(b.x)) { best = b; break; } }
        if (best) {
          best.state = 'chat'; best.timer = 6; best.partner = a;
          a.partner = best;
          const side = best.x > 290 ? -7 : 7;
          setPath(a, best.x + side, best.y, 'chat');
        } else setPath(a, insideX(), insideY(), 'idle');
      } else if (r < 0.76) setPath(a, CRATE_X - 5, CRATE_Y, 'pickup');
      else if (r < 0.94 && !gardener && !threat() && g.og > 0.9) {
        gardener = a;
        setPath(a, 216 + rand() * 20, 150 + rand() * 12, 'work');
      } else setPath(a, insideX(), insideY(), 'idle');
    };

    const arrive = (a) => {
      a.step = 0;
      switch (a.next) {
        case 'in':
          a.state = 'in'; a.on = false; a.timer = 4 + rand() * 10; a.torch = false; a.carry = 0;
          g.doorT[a.home] = 0.4;
          if (gardener === a) gardener = null;
          break;
        case 'work': a.state = 'work'; a.timer = 3 + rand() * 4; a.dir = -1; break;
        case 'pickup':
          a.carry = 1;
          setPath(a, insideX(), insideY(), 'drop');
          break;
        case 'drop':
          a.carry = 0; a.state = 'idle'; a.timer = 1 + rand() * 2;
          if (gardener === a) gardener = null;
          break;
        case 'chat':
          a.state = 'chat'; a.timer = 3 + rand() * 3;
          if (a.partner) { a.partner.timer = a.timer; a.partner.state = 'chat'; }
          break;
        case 'hammer': a.state = 'hammer'; a.timer = 0.25; a.dir = -1; break;
        case 'stand': a.state = 'stand'; a.dir = -1; break;
        case 'post': a.state = 'post'; a.timer = 3 + rand() * 4; a.dir = -1; a.torch = false; break;
        default: a.state = 'idle'; a.timer = 1.5 + rand() * 3; break;
      }
    };

    const stepWalk = (a, dt) => {
      const px = a.path[a.pi * 2], py = a.path[a.pi * 2 + 1];
      const crossing = (a.x - 252) * (px - 252) < 0;
      if (crossing || (a.x > 242 && a.x < 262)) g.gateReq = true;
      if (crossing && g.gate < 0.85) { a.step = 0; return; }
      const dx = px - a.x, dy = py - a.y;
      const d = Math.abs(dx) + Math.abs(dy);
      const s = a.spd * dt;
      if (Math.abs(dx) > 0.3) a.dir = dx > 0 ? 1 : -1;
      if (d <= s) {
        a.x = px; a.y = py;
        a.pi++;
        if (a.pi >= a.pl) arrive(a);
      } else {
        a.x += dx / d * s;
        a.y += dy / d * s;
        a.step += s;
      }
    };

    const updateActor = (a, dt) => {
      if (a.emoteT > 0) a.emoteT -= dt;
      if (a.delay > 0) { a.delay -= dt; return; }
      const idle = g.phase === 'idle';
      switch (a.state) {
        case 'walk': stepWalk(a, dt); break;
        case 'in':
          if (idle) { a.timer -= dt; if (a.timer <= 0) { comeOut(a); think(a); } }
          break;
        case 'idle':
          a.timer -= dt;
          if (a.timer <= 0) { if (idle) think(a); else a.timer = 1; }
          break;
        case 'post':
          a.timer -= dt;
          if (a.timer <= 0) { if (idle) think(a); else a.timer = 1; }
          break;
        case 'chat': {
          a.timer -= dt;
          const p = a.partner;
          if (p && p.on) a.dir = p.x > a.x ? 1 : -1;
          if (a.timer <= 0) { a.partner = null; a.state = 'idle'; a.timer = 0.5 + rand(); }
          break;
        }
        case 'work':
          a.timer -= dt;
          if (threat()) { emote(a, 1, 1.0); a.carry = 0; setPath(a, insideX(), insideY(), 'drop', 34); break; }
          if (a.timer <= 0) { a.carry = 3; setPath(a, CRATE_X - 5, CRATE_Y, 'drop'); }
          break;
        case 'hammer':
          a.timer -= dt;
          if (a.timer <= 0) {
            a.timer = 0.28;
            const gx = a.x < 200 ? OUTER_X + 2 : WALL_X;
            burst(gx, a.y - 8, 2, C_SPARK, 16);
            api.sfx('click');
          }
          if (a.x < 200) { if (g.og < 1) g.og = Math.min(1, g.og + dt * 1.4); }
          else { g.gbroken = false; g.gdmg = Math.max(0, g.gdmg - dt * 1.2); }
          break;
        default: break;
      }
    };

    // часовой на помосте
    const updateSentry = (dt) => {
      if (!sentry.on) return;
      if (sentry.rec > 0) sentry.rec -= dt;
      if (sentry.emoteT > 0) sentry.emoteT -= dt;
      const leaving = sentry.state === 'leave';
      let target = null;
      if (!leaving && g.phase === 'idle') {
        for (let i9 = 0; i9 < zombies.length; i9++) { const z = zombies[i9]; if (z.on && (z.mode === 'walk' || z.mode === 'rattle') && z.x > OUTER_X - 46 && (!target || z.x > target.x)) target = z; }
      }
      const dx = sentry.timer - sentry.x; // timer хранит цель по x
      if (target) {
        sentry.dir = -1;
        sentry.cd -= dt;
        if (sentry.cd <= 0) {
          sentry.cd = 1.7 + rand() * 0.5;
          sentry.rec = 0.2;
          shoot(sentry.x - 3, PLATFORM_Y - 7, target);
        }
        return;
      }
      sentry.cd = Math.max(sentry.cd, 0.6);
      if (Math.abs(dx) > 0.5) {
        const s = Math.min(Math.abs(dx), (leaving ? 40 : sentry.spd) * dt);
        sentry.x += dx > 0 ? s : -s;
        sentry.dir = dx > 0 ? 1 : -1;
        sentry.step += s;
      } else {
        sentry.step = 0;
        if (leaving) { sentry.on = false; return; }
        sentry.dir = -1;
        sentry.delay -= dt;
        if (sentry.delay <= 0) {
          sentry.delay = 2 + rand() * 5;
          sentry.timer = 264 + rand() * 40;
          if (rand() < 0.2) emote(sentry, 3, 1.4);
        }
      }
    };

    // купленные стрелки
    const updateGuards = (dt, canShoot) => {
      for (let i = g.guards.length - 1; i >= 0; i--) {
        const gd = g.guards[i];
        if (gd.rec > 0) gd.rec -= dt;
        const dx = gd.tx - gd.x;
        if (Math.abs(dx) > 0.5) {
          const s = Math.min(Math.abs(dx), 36 * dt);
          gd.x += dx > 0 ? s : -s;
          gd.step += s;
          continue;
        }
        gd.x = gd.tx;
        gd.step = 0;
        if (gd.leave) { g.guards.splice(i, 1); continue; }
        if (!canShoot) continue;
        gd.cd -= dt;
        if (gd.cd > 0) continue;
        let target = null;
        for (let i10 = 0; i10 < zombies.length; i10++) { const z = zombies[i10]; if (z.on && z.x > 4 && (!target || z.x > target.x)) target = z; }
        if (!target) { gd.cd = 0.2; continue; }
        gd.cd = 2.2;
        gd.rec = 0.2;
        shoot(gd.x - 3, PLATFORM_Y - 7, target);
      }
    };
    const guardsLeave = () => { for (let i11 = 0; i11 < g.guards.length; i11++) { const gd = g.guards[i11]; gd.leave = true; gd.tx = OFF_R; } };

    // ---------- переходы ----------
    const startIntro = () => {
      const from = g.phase;
      g.phase = 'intro';
      g.pt = 0;
      g.ev = 0;
      g.mode = 'play';
      g.bell = 0;
      // жители — по домам, бегом
      for (let i12 = 0; i12 < actors.length; i12++) { const a = actors[i12];
        a.partner = null;
        a.carry = 0;
        if (a.on) setPath(a, DOORS_X[a.home], DOOR_Y, 'in', 52);
      }
      gardener = null;
      if (sentry.on) { emote(sentry, 1, 1.0); sentry.state = 'leave'; sentry.timer = OFF_R; }
      guardsLeave();
      // орда: уже стоящие на поле зомби становятся её частью, недостающих добавляем слева
      g.introOg = g.og > 0.05;
      g.introTp = g.introOg ? 1.6 : 1.1;
      let n = 0;
      for (let i13 = 0; i13 < zombies.length; i13++) { const z = zombies[i13];
        if (!z.on) continue;
        if (n >= 6) { z.mode = 'flee'; z.dir = -1; z.spd = 80; continue; }
        z.mode = 'horde';
        z.atk = false;
        z.kb = 0;
        z.hx = g.introOg ? OUTER_X - 8 - (n % 4) * 7 - Math.floor(n / 4) * 3 : 150 + n * 8;
        z.hs = clamp(Math.abs(z.hx - z.x) / 1.0, 30, 170);
        z.dir = z.hx >= z.x ? 1 : -1;
        n++;
      }
      while (n < 4) {
        const z = zFree();
        if (!z) break;
        const hx = g.introOg ? OUTER_X - 8 - n * 7 : 150 + n * 8;
        zInit(z, 'normal', -12 - n * 10, LANE_TOP + 2 + Math.floor(rand() * (LANE_H - 4)), 'horde');
        z.hx = hx;
        z.hs = clamp((hx - z.x) / 1.0, 30, 170);
        n++;
      }
      g.hordeN = n;
      api.sfx('hit');
      if (from === 'wait' || from === 'lose') burst(WALL_X + 4, 150, 6, C_SPARK, 20);
    };

    const beginPlay = () => {
      g.phase = 'play';
      g.pt = 0;
      g.hp = MAX_HP;
      g.gems = 0;
      g.kills = 0;
      g.wave = 0;
      g.fences = 0;
      g.overSent = false;
      g.sawOver = false;
      g.gdmg = 0;
      g.gbroken = false;
      startWave();
      g.toSpawn = Math.max(0, g.toSpawn - g.hordeN);
      g.spawnT = 2.5;
      for (let i14 = 0; i14 < zombies.length; i14++) { const z = zombies[i14];
        if (!z.on || z.mode === 'flee') continue;
        z.mode = 'play';
        z.dir = 1;
        z.spd = TYPES[z.type].spd * g.spdMul * (0.9 + rand() * 0.2);
      }
    };

    const startOutro = () => {
      g.phase = 'outro';
      g.pt = 0;
      g.ev = 0;
      g.bell = 1.8;
      g.mode = 'play';
      api.sfx('click');
      // зомби вздрагивают и бегут прочь
      for (let i15 = 0; i15 < zombies.length; i15++) { const z = zombies[i15];
        if (!z.on) continue;
        z.mode = 'scared';
        z.atk = false;
        z.give = 0.3 + rand() * 0.4;
      }
      // жители и стражник с факелами выходят
      let k = 0;
      for (let i16 = 0; i16 < actors.length; i16++) { const a = actors[i16];
        a.partner = null;
        a.carry = 0;
        a.torch = true;
        a.emoteT = 0;
        const smith = a === vils[2];
        if (!a.on) { comeOut(a); a.delay = smith ? 0.1 : 0.3 + k * 0.2; }
        let tx, ty, nx;
        if (smith) { tx = OUTER_X + 7; ty = 152; nx = 'hammer'; }
        else if (a === gateGuard) { tx = GOUT_X - 3; ty = 149; nx = g.gbroken || g.gdmg > 0 ? 'hammer' : 'stand'; }
        else { tx = 150 + k * 18; ty = 146 + (k % 3) * 7; nx = 'stand'; }
        setPath(a, tx, ty, nx, smith ? 96 : 64 + rand() * 10);
        k++;
      }
      gardener = null;
    };

    // ---------- обновление ----------
    const updateZombie = (z, dt) => {
      const T = TYPES[z.type];
      if (z.flash > 0) z.flash -= dt;
      if (z.kb > 0) {
        z.x -= z.kb * 14 * dt * (z.dir > 0 ? 1 : -1);
        z.kb -= dt * 30;
        if (z.kb < 0) z.kb = 0;
      }
      switch (z.mode) {
        case 'walk': {
          z.give -= dt;
          if (z.give <= 0) { z.mode = 'leave'; z.dir = -1; z.spd *= 0.8; break; }
          if (g.og > 0.3 && z.x + BOX[z.type].r >= OUTER_X - 3) { z.x = OUTER_X - 3 - BOX[z.type].r; z.mode = 'rattle'; z.atk = true; break; }
          if (z.kb <= 0) z.x += z.spd * dt;
          break;
        }
        case 'rattle':
          z.give -= dt;
          z.atk = true;
          if (z.give <= 0) { z.mode = 'leave'; z.atk = false; z.dir = -1; }
          else if (g.og <= 0.3) { z.mode = 'walk'; z.atk = false; }
          break;
        case 'leave':
        case 'flee':
          if (z.kb <= 0) z.x -= z.spd * dt;
          z.dir = -1;
          if (z.x < -16) z.on = false;
          break;
        case 'scared':
          // на миг замирает, потом разворачивается и бежит
          z.give -= dt;
          z.atk = false;
          if (z.give <= 0) { z.mode = 'flee'; z.dir = -1; z.spd = 55 + rand() * 30; }
          break;
        case 'horde': {
          const dx = z.hx - z.x;
          const tp = g.introTp;
          if (g.pt >= tp) {
            z.dir = 1;
            z.atk = false;
            z.x += (z.type === 'fast' ? 24 : 16) * dt;
            break;
          }
          if (Math.abs(dx) > 0.6) {
            z.dir = dx > 0 ? 1 : -1;
            z.atk = false;
            z.x += Math.sign(dx) * Math.min(Math.abs(dx), z.hs * dt);
          } else {
            z.dir = 1;
            z.atk = g.introOg;
          }
          break;
        }
        case 'stand':
          // спокойная сцена после поражения: топчутся у пролома
          z.atk = false;
          z.give -= dt;
          if (z.give <= 0) {
            z.give = 2 + rand() * 4;
            z.hx = clamp(z.x + (rand() - 0.6) * 8, 60, WALL_X - BOX[z.type].r);
          }
          if (Math.abs(z.hx - z.x) > 0.5) { z.dir = z.hx > z.x ? 1 : -1; z.x += z.dir * 4 * dt; } else z.dir = 1;
          break;
        default: break;
      }
    };

    const updatePlay = (dt) => {
      if (g.mode === 'shop') {
        g.shopT -= dt;
        if (g.shopT <= 0) startWave();
        return;
      }
      if (g.toSpawn > 0) {
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          spawn();
          g.toSpawn--;
          if (g.wave >= 3 && g.toSpawn > 0 && rand() < Math.min(0.45, 0.05 * g.wave + 0.1)) { spawn(); g.toSpawn--; }
          g.spawnT = g.spawnInt * (0.7 + rand() * 0.6);
        }
      }
      let alive = 0;
      let dmg = 0;
      for (let i17 = 0; i17 < zombies.length; i17++) { const z = zombies[i17];
        if (!z.on) continue;
        if (z.mode !== 'play') { updateZombie(z, dt); continue; }
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
          burst(WALL_X, LANE_TOP + rand() * LANE_H - 8, 3, C_WOOD, 20);
        }
        if (g.hp <= 0) {
          // поражение: ворота частокола выбиты
          g.hp = 0;
          g.phase = 'lose';
          g.pt = 0;
          g.gbroken = true;
          g.shake = 0.45;
          burst(WALL_X + 4, 150, 16, C_PLANK, 40);
          api.sfx('lose');
          for (let i18 = 0; i18 < zombies.length; i18++) { const z = zombies[i18]; if (z.on) { z.mode = 'stand'; z.give = 1 + rand() * 2; z.hx = z.x; } }
          return;
        }
      }
      g.gdmg = 1 - g.hp / MAX_HP;
      updateGuards(dt, true);
      if (g.toSpawn <= 0 && alive === 0) {
        g.gems += 4 + g.wave;
        g.mode = 'shop';
        g.shopT = 12;
        api.sfx('win');
      }
    };

    const updateIntro = (dt) => {
      const t = g.pt;
      const tp = g.introTp;
      // ремонт частокола (после поражения)
      if (g.gbroken || g.gdmg > 0) {
        g.gdmg = Math.max(0, g.gdmg - dt * 1.5);
        if (t > 0.3) g.gbroken = false;
        if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) burst(WALL_X + 3, 140 + rand() * 20, 2, C_SPARK, 14);
      }
      if (g.introOg) {
        if (g.ev === 0 && t >= 1.1) {
          g.ev = 1;
          g.og = Math.min(g.og, 0.5);
          g.shake = 0.2;
          burst(OUTER_X, 150, 8, C_PLANK, 26);
          api.sfx('hit');
        }
        if (g.ev === 1 && t >= tp) {
          g.ev = 2;
          g.og = 0;
          g.shake = 0.35;
          burst(OUTER_X, 146, 10, C_PLANK, 40);
          burst(OUTER_X, 160, 10, C_PLANK, 40);
          api.sfx('hit');
        }
      } else if (g.ev === 0 && t >= tp) g.ev = 2;
      // заборы прошлого забега топчут
      if (g.ev === 2 && t >= tp + 0.2) {
        g.ev = 3;
        for (let i = 0; i < g.fences; i++) burst(FENCE_X[i], 154, 8, C_PLANK, 30);
        if (g.fences) api.sfx('hit');
        g.fences = 0;
      }
      if (t >= 1.5) g.gateReq = false;
      if (t >= 1.7) {
        for (let i19 = 0; i19 < actors.length; i19++) { const a = actors[i19]; if (a.on && a.state === 'walk' && a.next === 'in' && (isOut(a.x) || a.x < 262)) { a.on = false; a.state = 'in'; a.timer = 5; } }
      }
      if (t >= Math.max(2.0, tp + 0.4)) beginPlay();
    };

    const updateOutro = (dt) => {
      const t = g.pt;
      updateGuards(dt, t < 2.2);
      if (g.ev === 0 && t >= 2.2) { g.ev = 1; guardsLeave(); }
      if (g.ev === 1 && t >= 2.4) {
        g.ev = 2;
        if (!sentry.on) { sentry.on = true; sentry.x = OFF_R; }
        sentry.timer = 290; sentry.state = 'pace'; sentry.delay = 2;
      }
      if (g.ev >= 1 && g.ev < 3 && (t >= 3.0 && (g.og >= 0.98 || t >= 3.3))) {
        g.ev = 3;
        g.og = 1;
        g.gdmg = 0;
        g.gbroken = false;
        for (let i20 = 0; i20 < actors.length; i20++) { const a = actors[i20];
          if (a.state === 'stand' || a.state === 'hammer' || (a.state === 'walk' && a.next !== 'in' && a.next !== 'post')) {
            if (a === gateGuard) setPath(a, 266, 160, 'post', 30);
            else setPath(a, DOORS_X[a.home], DOOR_Y, 'in', 28 + rand() * 8);
          }
        }
      }
      if (t >= 3.6) { g.phase = 'idle'; g.pt = 0; }
    };

    const updateIdle = (dt) => {
      if (!sentry.on && g.pt > 2) { sentry.on = true; sentry.x = OFF_R; sentry.timer = 290; sentry.state = 'pace'; sentry.delay = 2; }
      g.lone -= dt;
      if (g.lone <= 0) {
        let any = false;
        for (let i21 = 0; i21 < zombies.length; i21++) { const z = zombies[i21]; if (z.on) { any = true; break; } }
        g.lone = 20 + rand() * 25;
        if (!any && g.og > 0.9) {
          const z = zFree();
          const r = rand();
          zInit(z, r < 0.12 ? 'big' : r < 0.3 ? 'fast' : 'normal', -12, LANE_TOP + 3 + Math.floor(rand() * (LANE_H - 6)), 'walk');
          z.spd *= 0.6;
          z.give = rand() < 0.3 ? 6 + rand() * 8 : 999;
        }
      }
      // окна гаснут и зажигаются
      g.litT -= dt;
      if (g.litT <= 0) {
        g.litT = 4 + rand() * 10;
        const i = Math.floor(rand() * 4);
        g.lit[i] = !g.lit[i];
      }
      // падающая звезда
      g.ssT -= dt;
      if (g.ssT <= 0) {
        g.ssT = 25 + rand() * 40;
        if (g.dark > 0.55) { g.ssA = 0; g.ssX = 140 + rand() * 160; g.ssY = 8 + rand() * 30; }
      }
    };

    const tickSlashes = (dt) => {
      for (let i = 0; i < slashes.length; i++) {
        const sl = slashes[i];
        if (sl.on) { sl.life -= dt; if (sl.life <= 0) sl.on = false; }
      }
    };
    const update = (dt) => {
      g.t += dt;
      g.pt += dt;
      if (g.banner > 0) g.banner -= dt;
      if (g.shake > 0) g.shake -= dt;
      if (g.hurtSnd > 0) g.hurtSnd -= dt;
      if (g.hurtFlash > 0) g.hurtFlash -= dt;
      if (g.bell > 0) g.bell -= dt;
      for (let i = 0; i < 2; i++) if (g.doorT[i] > 0) g.doorT[i] -= dt;
      if (g.ssA >= 0) { g.ssA += dt; if (g.ssA > 0.7) g.ssA = -1; }

      // небо
      const ph = g.phase;
      const tgt = ph === 'play' || ph === 'lose' || ph === 'wait'
        ? clamp(Math.max(0.2 + 0.1 * (Math.max(1, g.wave) - 1), idleDark() * 0.85), 0.2, 0.9)
        : ph === 'intro' ? Math.min(0.95, idleDark() + 0.08) : idleDark();
      const dr = 0.2 * dt;
      g.dark += clamp(tgt - g.dark, -dr, dr);
      const hudT = ph === 'play' || ph === 'lose' || ph === 'wait' ? 1 : 0;
      g.hud += clamp(hudT - g.hud, -dt * 3, dt * 3);

      // частицы
      for (let i22 = 0; i22 < parts.length; i22++) { const p = parts[i22];
        if (!p.on) continue;
        p.life -= dt;
        if (p.gem) {
          if (p.life > 1.0) p.vy += 160 * dt;
          else {
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
      tickSlashes(dt);
      // дым из трубы
      g.smokeT -= dt;
      if (g.smokeT <= 0) {
        g.smokeT = 0.7 + rand() * 0.6;
        for (let i24 = 0; i24 < smoke.length; i24++) { const s = smoke[i24]; if (!s.on) { s.on = true; s.x = 313; s.y = 90; s.life = 0; break; } }
      }
      for (let i25 = 0; i25 < smoke.length; i25++) { const s = smoke[i25];
        if (!s.on) continue;
        s.life += dt;
        s.y -= 5 * dt;
        s.x -= (2 + s.life) * dt;
        if (s.life > 6) s.on = false;
      }

      // стрелы
      for (let i26 = 0; i26 < arrows.length; i26++) { const a = arrows[i26];
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
          burst(a.x, a.y, 2, C_ARROWHIT, 8);
        }
      }

      // фазы
      if (ph === 'play') updatePlay(dt);
      else {
        for (let i27 = 0; i27 < zombies.length; i27++) { const z = zombies[i27]; if (z.on) updateZombie(z, dt); }
        if (ph === 'intro') { updateIntro(dt); updateGuards(dt, false); }
        else if (ph === 'outro') updateOutro(dt);
        else if (ph === 'idle') { updateIdle(dt); updateGuards(dt, false); }
        else if (ph === 'lose') {
          if (g.pt >= 1.0) {
            g.phase = 'wait';
            g.pt = 0;
            if (!g.overSent) {
              g.overSent = true;
              api.over(score());
            }
          }
        }
      }

      // жители и ворота частокола
      g.gateReq = false;
      for (let i28 = 0; i28 < actors.length; i28++) { const a = actors[i28]; updateActor(a, dt); }
      updateSentry(dt);
      if (g.phase === 'intro' && g.pt >= 1.5) g.gateReq = false;
      if (g.phase === 'outro' && g.pt < 2.6) g.gateReq = true;
      if (g.phase === 'play' || g.phase === 'lose' || g.phase === 'wait') g.gateReq = false;
      const gt = g.gateReq ? 1 : 0;
      g.gate += clamp(gt - g.gate, -dt * 2.2, dt * 2.2);
      if (g.phase === 'idle' && g.pt > 0.1 && !g.gateReq && g.gate <= 0) g.gate = 0;
    };

    const checkMode = () => {
      const m = getMode();
      const ph = g.phase;
      if (m === 'over') { g.sawOver = true; return; }
      if (m === 'play') {
        if (ph === 'idle') { if (g.hold <= 0) startIntro(); }
        else if (ph === 'outro') startIntro();
        else if (ph === 'wait' && g.sawOver) startIntro();
      } else if (m === 'idle') {
        if (ph === 'intro' || ph === 'play' || ph === 'lose' || ph === 'wait') startOutro();
      }
    };

    // ---------- отрисовка ----------
    // зеркальный прямоугольник: dir 1 — как в оригинале (зомби смотрят вправо)
    let ZX = 0, ZD = 1;
    const zr = (ox, y, w, h) => ctx.fillRect(ZD > 0 ? ZX + ox : ZX - ox - w + 1, y, w, h);

    let shK = 0, shFl = false;
    const zc = (c) => (shFl ? '#ffffff' : rgbMix(c, NIGHTC, shK));

    const drawZombie = (z, dark) => {
      const T = TYPES[z.type];
      const s = T.s;
      ZX = Math.round(z.x);
      ZD = z.dir;
      const y = Math.round(z.y);
      shFl = z.flash > 0;
      shK = dark * 0.45;
      const moving = !z.atk && z.kb <= 0 && z.mode !== 'scared' && !(z.mode === 'stand' && Math.abs(z.hx - z.x) <= 0.5) && !(z.mode === 'horde' && Math.abs(z.hx - z.x) <= 0.6 && g.pt < g.introTp);
      const step = moving ? Math.floor((g.t * (z.type === 'fast' || z.mode === 'flee' ? 9 : 4) + z.phase) % 2) : 0;
      const bob = z.atk ? Math.round(Math.sin(g.t * 10 + z.phase)) : z.mode === 'stand' ? Math.round(Math.sin(g.t * 1.5 + z.phase) * 0.6) : 0;
      const armsUp = z.mode === 'scared' || z.mode === 'flee';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (z.type === 'fast') {
        const y0 = y - 10;
        zr(-2, y + 1, 6, 1);
        ctx.fillStyle = zc(Z_LEG);
        zr(-1 + step, y - 2, 1, 2);
        zr(1 - step, y - 2, 1, 2);
        ctx.fillStyle = zc(Z_FSHIRT);
        zr(-1, y0 + 3, 3, 5);
        ctx.fillStyle = zc(Z_SKIN);
        zr(-1, y0, 3, 3);
        if (armsUp) zr(1, y0 + 1, 1, 2); else zr(2, y0 + 4 + bob, 2, 1);
        ctx.fillStyle = zc(Z_SKIND);
        zr(0, y0 + 6, 1, 1);
        ctx.fillStyle = shFl ? '#ffffff' : '#c02020';
        zr(1, y0 + 1, 1, 1);
      } else {
        const y0 = y - 12 * s;
        zr(-3 * s, y + 1, 8 * s, 1);
        ctx.fillStyle = zc(Z_LEG);
        zr(-s + (step ? s : 0), y0 + 10 * s, s, 2 * s);
        zr(s - (step ? s : 0), y0 + 10 * s, s, 2 * s);
        ctx.fillStyle = zc(Z_SHIRT);
        zr(-2 * s, y0 + 4 * s, 5 * s, 7 * s);
        ctx.fillStyle = zc(Z_SHIRTD);
        zr(-2 * s, y0 + 9 * s, 5 * s, 2 * s);
        ctx.fillStyle = zc(Z_SKIN);
        zr(-s, y0 + 6 * s, s, s);
        zr(s, y0 + 8 * s, s, s);
        zr(-2 * s, y0 + 10 * s, s, s);
        if (armsUp) {
          zr(2 * s, y0 + s, s, 3 * s);
          zr(-2 * s, y0 + s, s, 3 * s);
        } else {
          zr(2 * s, y0 + 5 * s + bob * s, 3 * s, s);
          ctx.fillStyle = zc(Z_SKIND);
          zr(2 * s, y0 + 6 * s + bob * s, 2 * s, s);
        }
        ctx.fillStyle = zc(Z_SKIN);
        zr(-s, y0, 4 * s, 4 * s);
        ctx.fillStyle = zc(Z_SKIND);
        zr(-s, y0 + 3 * s, 4 * s, s);
        zr(-s, y0, s, s);
        ctx.fillStyle = shFl ? '#ffffff' : '#c02020';
        zr(2 * s, y0 + s, s, s);
      }
      if (z.hp < z.max && z.mode === 'play') {
        const bw = z.max * 2 + 1;
        const bx = ZX - Math.floor(bw / 2) + 1;
        const by = y + BOX[z.type].t - 3;
        ctx.fillStyle = 'rgba(20,10,10,0.8)';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#e04848';
        for (let i = 0; i < z.hp; i++) ctx.fillRect(bx + 1 + i * 2, by + 1, 1, 1);
      }
    };

    // стрелок на помосте (смотрит влево)
    const drawGuard = (x, rec, step, dark) => {
      x = Math.round(x);
      const y = PLATFORM_Y - 12;
      const k = dark * 0.4;
      const st = step > 0 ? Math.floor(step / 3) % 2 : 0;
      ctx.fillStyle = rgbMix(G_LEG, NIGHTC, k);
      ctx.fillRect(x - 1 - st, y + 10, 1, 2);
      ctx.fillRect(x + 1 + st, y + 10, 1, 2);
      ctx.fillStyle = rgbMix(G_BODY, NIGHTC, k);
      ctx.fillRect(x - 2, y + 4, 5, 7);
      ctx.fillStyle = rgbMix(G_BELT, NIGHTC, k);
      ctx.fillRect(x - 2, y + 7, 5, 1);
      ctx.fillStyle = rgbMix(SKIN, NIGHTC, k);
      ctx.fillRect(x - 1, y, 4, 4);
      ctx.fillStyle = rgbMix(EYE, NIGHTC, k);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillStyle = rgbMix(HELM, NIGHTC, k);
      ctx.fillRect(x - 2, y - 1, 6, 1);
      ctx.fillRect(x - 1, y - 2, 4, 1);
      const rc = rec > 0 ? 1 : 0;
      ctx.fillStyle = rgbMix(BOWC, NIGHTC, k);
      ctx.fillRect(x - 4 + rc, y + 3, 1, 1);
      ctx.fillRect(x - 5 + rc, y + 4, 1, 3);
      ctx.fillRect(x - 4 + rc, y + 7, 1, 1);
      ctx.fillStyle = 'rgba(232,226,212,0.8)';
      ctx.fillRect(x - 3 + rc, y + 4, 1, 3);
      ctx.fillStyle = rgbMix(SKIN, NIGHTC, k);
      ctx.fillRect(x - 3, y + 5, 2, 1);
    };

    // житель / стражник (смотрит влево при dir -1)
    let VX = 0, VD = -1;
    const vr = (ox, y, w, h) => ctx.fillRect(VD < 0 ? VX + ox : VX - ox - w + 1, y, w, h);
    const drawActor = (a, dark) => {
      if (!a.on || a.delay > 0) return;
      VX = Math.round(a.x);
      VD = a.dir;
      const k = dark * 0.4;
      const y = Math.round(a.y) - 12;
      const walking = a.state === 'walk' && a.step > 0;
      const st = walking ? Math.floor(a.step / 3) % 2 : 0;
      const bend = a.state === 'work' ? (Math.floor(g.t * 2 + a.robe) % 2) + 1 : 0;
      const yy = y + bend;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(VX - 3, y + 12, 8, 1);
      ctx.fillStyle = rgbMix(G_LEG, NIGHTC, k);
      vr(-1 - st, y + 10, 1, 2);
      vr(1 + st, y + 10, 1, 2);
      ctx.fillStyle = rgbMix(ROBES[a.robe], NIGHTC, k);
      vr(-2, yy + 4, 5, 7 - bend);
      ctx.fillStyle = rgbMix(ROBED[a.robe], NIGHTC, k);
      vr(-2, yy + 7, 5, 1);
      if (a.robe === 2) { ctx.fillStyle = rgbMix(G_LEG, NIGHTC, k); vr(-2, yy + 6, 2, 4); } // фартук кузнеца
      ctx.fillStyle = rgbMix(SKIN, NIGHTC, k);
      vr(-1, yy, 4, 4);
      if (a.kind === 0) { ctx.fillStyle = rgbMix(NOSE, NIGHTC, k); vr(-2, yy + 2, 1, 2); }
      ctx.fillStyle = rgbMix(EYE, NIGHTC, k);
      vr(-1, yy + 1, 1, 1);
      if (a.emoteT > 0 && a.emote === 3) vr(-1, yy + 3, 2, 1);
      // головной убор
      ctx.fillStyle = rgbMix(HATS[a.robe], NIGHTC, k);
      if (a.robe === 0) { vr(-3, yy - 1, 8, 1); vr(-1, yy - 2, 4, 1); }
      else if (a.robe === 3) { vr(-1, yy - 1, 4, 1); vr(2, yy, 1, 3); }
      else if (a.robe === 2) vr(-1, yy - 1, 4, 1);
      else if (a.kind === 1) { vr(-2, yy - 1, 6, 1); vr(-1, yy - 2, 4, 1); }
      // руки и предметы
      const skin = rgbMix(SKIN, NIGHTC, k);
      if (a.carry) {
        ctx.fillStyle = skin;
        vr(-3, yy + 1, 1, 4);
        vr(3, yy + 1, 1, 4);
        if (a.carry === 1) {
          ctx.fillStyle = rgbMix(CRATE0, NIGHTC, k);
          vr(-2, yy - 5, 6, 4);
          ctx.fillStyle = rgbMix(CRATE1, NIGHTC, k);
          vr(-2, yy - 3, 6, 1);
        } else {
          ctx.fillStyle = rgbMix(PUMPKIN, NIGHTC, k);
          vr(-1, yy - 4, 4, 3);
          ctx.fillStyle = rgbMix(LEAF, NIGHTC, k);
          vr(1, yy - 5, 1, 1);
        }
      } else if (a.state === 'hammer') {
        const up = Math.floor(g.t * 7) % 2;
        ctx.fillStyle = skin;
        vr(-3, yy + 4 - up * 2, 1, 2);
        ctx.fillStyle = rgbMix(HELM, NIGHTC, k);
        vr(-5, yy + 2 - up * 3, 3, 2);
      } else if (a.state === 'work') {
        ctx.fillStyle = skin;
        vr(-3, yy + 6, 1, 3);
      } else if (a.kind === 1 && !a.torch) {
        ctx.fillStyle = rgbMix(WOOD0, NIGHTC, k);
        vr(-3, yy - 3, 1, 14);
        ctx.fillStyle = rgbMix(SPEAR, NIGHTC, k);
        vr(-3, yy - 5, 1, 2);
        ctx.fillStyle = skin;
        vr(-2, yy + 5, 1, 1);
      } else {
        ctx.fillStyle = skin;
        vr(-3, yy + 5, 1, 3);
      }
      if (a.torch && a.state !== 'hammer') {
        const wave = a.state === 'stand' ? Math.round(Math.sin(g.t * 5 + a.robe)) : 0;
        ctx.fillStyle = '#5a3a20';
        vr(-4, yy + wave, 1, 6);
        const f = 0.75 + 0.25 * Math.sin(g.t * 11 + a.robe) * Math.sin(g.t * 4.3);
        ctx.fillStyle = rgbStr(255, 180 * f, 60);
        vr(-5, yy - 3 + wave, 3, 3);
        ctx.fillStyle = rgbStr(255, 170, 70, 0.1 + 0.1 * dark * f);
        vr(-11, yy - 8 + wave, 15, 15);
      }
      // эмоции
      if (a.emoteT > 0 && a.emote === 1) {
        ctx.fillStyle = 'rgba(42,26,16,0.85)';
        ctx.fillRect(VX - 3, yy - 11, 8, 8);
        drawText(ctx, '!', VX, yy - 9, '#ffe070');
      } else if (a.state === 'chat' && Math.floor(g.t * 0.9 + a.robe * 0.5) % 2 === 0) {
        ctx.fillStyle = 'rgba(240,236,220,0.85)';
        ctx.fillRect(VX - 3, yy - 8, 8, 5);
        ctx.fillStyle = '#3a2a20';
        const dots = Math.floor(g.t * 3) % 3 + 1;
        for (let i = 0; i < dots; i++) ctx.fillRect(VX - 2 + i * 2, yy - 6, 1, 1);
      }
    };

    // внешние ворота на дороге: дощатый заслон через дорогу, фонарь на столбе
    const OG_TOP = 124, OG_BOT = 171;
    const drawOuterGate = (wood, woodD, dark) => {
      const x = OUTER_X;
      const sh = g.phase === 'intro' && g.og > 0 && g.pt > 0.9 && g.pt < g.introTp ? Math.round(Math.sin(g.t * 45)) : 0;
      // столб с фонарём
      ctx.fillStyle = woodD;
      ctx.fillRect(x - 5, OG_TOP - 8, 2, OG_BOT - OG_TOP + 8);
      ctx.fillRect(x - 5, OG_TOP - 8, 5, 1);
      const f = 0.8 + 0.2 * Math.sin(g.t * 6);
      ctx.fillStyle = rgbStr(255, 200 * f, 90);
      ctx.fillRect(x - 2, OG_TOP - 6, 2, 3);
      ctx.fillStyle = rgbStr(255, 190, 90, 0.06 + 0.12 * dark);
      ctx.fillRect(x - 8, OG_TOP - 12, 13, 13);
      // доски: целые снизу вверх на высоту og
      const full = OG_BOT - OG_TOP;
      const hgt = Math.round(full * clamp(g.og, 0, 1));
      for (let i = 0; i < 3; i++) {
        const px = x - 2 + i * 2 + sh;
        // зубчатый верх: у сломанных досок разная высота
        const jag = g.og < 0.99 ? (i === 1 ? 3 : i === 2 ? -2 : 0) : 0;
        const ph = clamp(hgt + jag, 0, full);
        const top = OG_BOT - ph;
        ctx.fillStyle = i === 1 ? woodD : wood;
        if (ph > 0) ctx.fillRect(px, top, 2, ph);
        if (g.og >= 0.99) ctx.fillRect(px, top - 1, 1, 1); // заострённые колья
      }
      if (hgt > 6) {
        ctx.fillStyle = rgbMix(IRON, NIGHTC, dark * 0.5);
        const b1 = OG_BOT - 8, b2 = OG_BOT - Math.round(full * 0.7);
        ctx.fillRect(x - 3 + sh, b1, 8, 1);
        if (OG_BOT - hgt < b2) ctx.fillRect(x - 3 + sh, b2, 8, 1);
      }
      // трещины
      if (g.og < 0.99 && hgt > 4) {
        ctx.fillStyle = 'rgba(20,12,8,0.85)';
        ctx.fillRect(x - 1 + sh, OG_BOT - hgt + 2, 1, 4);
        ctx.fillRect(x + 2 + sh, OG_BOT - hgt + 5, 1, 3);
      }
      // обломки на земле
      if (g.og < 0.6) {
        ctx.fillStyle = woodD;
        ctx.fillRect(x - 12, 160, 6, 1);
        ctx.fillRect(x + 5, 166, 7, 1);
        ctx.fillStyle = wood;
        ctx.fillRect(x - 9, 151, 5, 1);
        ctx.fillRect(x + 7, 157, 4, 1);
      }
    };

    const drawSlashes = () => {
      for (let i = 0; i < slashes.length; i++) {
        const s = slashes[i];
        if (!s.on) continue;
        ctx.fillStyle = rgbStr(255, 255, 255, clamp(s.life / 0.14, 0, 1));
        for (let k = -3; k <= 3; k++) ctx.fillRect(s.x + k, s.y + k * s.d, 1, 1);
        ctx.fillRect(s.x - 1, s.y, 3, 1);
      }
    };

    const draw = () => {
      const dark = Math.round(clamp(g.dark, 0, 1) * 64) / 64;
      const sx = g.shake > 0 ? Math.round((rand() - 0.5) * 2) : 0;
      ctx.save();
      ctx.translate(sx, 0);
      for (let y = 0; y < GROUND; y += 4) {
        const k = y / GROUND;
        ctx.fillStyle = rgbStr(
          lerp(lerp(SKY_T0[0], SKY_T1[0], dark), lerp(SKY_B0[0], SKY_B1[0], dark), k),
          lerp(lerp(SKY_T0[1], SKY_T1[1], dark), lerp(SKY_B0[1], SKY_B1[1], dark), k),
          lerp(lerp(SKY_T0[2], SKY_T1[2], dark), lerp(SKY_B0[2], SKY_B1[2], dark), k)
        );
        ctx.fillRect(-2, y, W + 4, 4);
      }
      if (dark > 0.3) {
        for (let i29 = 0; i29 < stars.length; i29++) { const s = stars[i29];
          const a = (dark - 0.3) * (0.5 + 0.5 * Math.sin(g.t * 1.5 + s.p));
          ctx.fillStyle = rgbStr(255, 250, 230, a);
          ctx.fillRect(s.x, s.y, s.big ? 2 : 1, 1);
        }
      }
      if (g.ssA >= 0) {
        const k = g.ssA / 0.7;
        const x = Math.round(g.ssX - k * 40), y = Math.round(g.ssY + k * 16);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = rgbStr(255, 250, 230, (1 - k) * (1 - i / 5));
          ctx.fillRect(x + i * 2, y - Math.round(i * 0.8), 2, 1);
        }
      }
      // луна — справа, над деревней
      const mx = 196, my = 16;
      ctx.fillStyle = rgbMix(MOON0, MOON1, dark, 0.25);
      ctx.fillRect(mx - 3, my - 3, 16, 16);
      ctx.fillStyle = rgbMix(MOON0, MOON1, dark);
      ctx.fillRect(mx, my, 10, 10);
      ctx.fillStyle = rgbMix(MOOND0, MOOND1, dark);
      ctx.fillRect(mx + 3, my + 2, 3, 2);
      ctx.fillRect(mx + 6, my + 6, 2, 2);
      // холмы и деревья
      ctx.fillStyle = rgbMix(HILL0, HILL1, dark);
      for (let i = 0; i < hills.length; i++) ctx.fillRect(i * 4, hills[i], 4, GROUND - hills[i]);
      const treeC = rgbMix(TREE0, TREE1, dark);
      const trunkC = rgbMix(TRUNK0, TRUNK1, dark);
      for (let i30 = 0; i30 < trees.length; i30++) { const tr = trees[i30];
        ctx.fillStyle = trunkC;
        ctx.fillRect(tr.x + Math.floor(tr.w / 2), GROUND - 4, 1, 4);
        ctx.fillStyle = treeC;
        ctx.fillRect(tr.x, GROUND - 3 - tr.h, tr.w, tr.h);
        ctx.fillRect(tr.x + 1, GROUND - 5 - tr.h, tr.w - 2, 2);
      }
      // земля
      const gk = dark * 0.85;
      const gr = lerp(GRASS0[0], GRASS1[0], gk), gg = lerp(GRASS0[1], GRASS1[1], gk), gb = lerp(GRASS0[2], GRASS1[2], gk);
      ctx.fillStyle = rgbStr(gr, gg, gb);
      ctx.fillRect(-2, GROUND, W + 4, H - GROUND);
      ctx.fillStyle = rgbStr(gr * 0.85, gg * 0.85, gb * 0.85);
      for (let x = 0; x < W; x += 6) ctx.fillRect(x, GROUND, 3, 1);
      ctx.fillStyle = rgbMix(PATH0, PATH1, gk);
      ctx.fillRect(-2, LANE_TOP + 4, W + 4, LANE_H - 6);
      ctx.fillStyle = rgbMix(PATHL0, PATHL1, gk);
      for (let x = 3; x < W; x += 9) ctx.fillRect(x, LANE_TOP + 8 + (x % 3) * 5, 3, 1);
      ctx.fillStyle = rgbStr(lerp(gr, TUFT[0], 0.25), lerp(gg, TUFT[1], 0.25), lerp(gb, TUFT[2], 0.25));
      for (let i31 = 0; i31 < tufts.length; i31++) { const tf = tufts[i31]; ctx.fillRect(tf.x, tf.y, 1, 2); }
      // огород у частокола
      for (let i32 = 0; i32 < garden.length; i32++) { const p = garden[i32];
        ctx.fillStyle = rgbMix(LEAF, NIGHTC, dark * 0.5);
        ctx.fillRect(p.x - 1, p.y + 1, 4, 1);
        ctx.fillStyle = rgbMix(PUMPKIN, NIGHTC, dark * 0.5);
        ctx.fillRect(p.x, p.y - 1, 3, 2);
      }

      // дома за частоколом
      const wallC = rgbMix(WALLC0, WALLC1, dark * 0.75);
      const wallL = rgbStr(lerp(WALLC0[0], WALLC1[0], dark * 0.75) * 0.88, lerp(WALLC0[1], WALLC1[1], dark * 0.75) * 0.88, lerp(WALLC0[2], WALLC1[2], dark * 0.75) * 0.88);
      const roofC = rgbMix(ROOF0, ROOF1, dark * 0.7);
      const roofD = rgbStr(lerp(ROOF0[0], ROOF1[0], dark * 0.7) * 0.82, lerp(ROOF0[1], ROOF1[1], dark * 0.7) * 0.82, lerp(ROOF0[2], ROOF1[2], dark * 0.7) * 0.82);
      for (let h = 0; h < 2; h++) {
        const hx = h === 0 ? 262 : 292, hw = h === 0 ? 26 : 28, hh = h === 0 ? 28 : 36;
        const base = GROUND + 4;
        const y = base - hh;
        if (h === 1) {
          ctx.fillStyle = roofD;
          ctx.fillRect(311, y - 12, 4, 8); // труба
        }
        ctx.fillStyle = wallC;
        ctx.fillRect(hx, y, hw, hh);
        ctx.fillStyle = wallL;
        for (let yy = y + 4; yy < base; yy += 4) ctx.fillRect(hx, yy, hw, 1);
        const rh = Math.floor(hw / 2.4);
        for (let i = 0; i < rh; i++) {
          const inset = Math.floor(i * (hw / 2 + 2) / rh);
          ctx.fillStyle = i % 3 === 0 ? roofD : roofC;
          ctx.fillRect(hx - 3 + inset, y - i, hw + 6 - inset * 2, 1);
        }
        for (let w = 0; w < 2; w++) {
          const lit = g.lit[h * 2 + w] || g.phase !== 'idle';
          const wx = w === 0 ? hx + 4 : hx + hw - 8;
          const fl = 0.85 + 0.15 * Math.sin(g.t * 7 + hx + w);
          ctx.fillStyle = dark > 0.3 && lit ? rgbStr(255, 200 * fl, 90 * fl) : rgbMix(WIN0, WIN1, dark);
          ctx.fillRect(wx, y + 6, 4, 4);
          if (dark > 0.3 && lit) {
            ctx.fillStyle = rgbStr(255, 190, 90, 0.15 * dark);
            ctx.fillRect(wx - 3, y + 3, 10, 10);
          }
        }
        // дверь
        const dx = DOORS_X[h];
        ctx.fillStyle = g.doorT[h] > 0 && dark > 0.3 ? rgbStr(255, 190, 90, 0.9) : rgbMix(WOOD0, NIGHTC, 0.3 + dark * 0.5);
        ctx.fillRect(dx - 2, base - 8, 4, 8);
      }
      // дым
      for (let i33 = 0; i33 < smoke.length; i33++) { const s = smoke[i33];
        if (!s.on) continue;
        ctx.fillStyle = rgbStr(150, 150, 160, 0.35 * (1 - s.life / 6));
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 2 + (s.life > 3 ? 1 : 0), 2);
      }
      // ящики у дома
      ctx.fillStyle = rgbMix(CRATE0, NIGHTC, dark * 0.6);
      ctx.fillRect(CRATE_X - 2, CRATE_Y - 5, 6, 5);
      ctx.fillRect(CRATE_X + 4, CRATE_Y - 4, 5, 4);
      ctx.fillStyle = rgbMix(CRATE1, NIGHTC, dark * 0.6);
      ctx.fillRect(CRATE_X - 2, CRATE_Y - 3, 6, 1);
      ctx.fillRect(CRATE_X + 4, CRATE_Y - 2, 5, 1);

      // помост, колокол, стрелки
      const woodC = rgbMix(WOOD0, WOOD1, dark * 0.7);
      const woodDC = rgbStr(lerp(WOOD0[0], WOOD1[0], dark * 0.7) * 0.7, lerp(WOOD0[1], WOOD1[1], dark * 0.7) * 0.7, lerp(WOOD0[2], WOOD1[2], dark * 0.7) * 0.7);
      ctx.fillStyle = woodDC;
      for (let x = 258; x < 314; x += 14) ctx.fillRect(x, PLATFORM_Y + 2, 2, GROUND + 4 - PLATFORM_Y);
      ctx.fillRect(316, PLATFORM_Y - 16, 1, 16);
      ctx.fillRect(311, PLATFORM_Y - 16, 6, 1);
      const sw = g.bell > 0 ? Math.round(Math.sin(g.t * 16) * 1.5) : 0;
      ctx.fillStyle = rgbMix(BELL, NIGHTC, dark * 0.5);
      ctx.fillRect(312 + sw, PLATFORM_Y - 14, 3, 3);
      ctx.fillRect(311 + sw, PLATFORM_Y - 12, 5, 1);
      if (g.bell > 0 && Math.floor(g.t * 6) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,240,180,0.8)';
        ctx.fillRect(307, PLATFORM_Y - 16, 1, 2);
        ctx.fillRect(319, PLATFORM_Y - 16, 1, 2);
        ctx.fillRect(306, PLATFORM_Y - 12, 1, 1);
      }
      ctx.fillStyle = woodC;
      ctx.fillRect(254, PLATFORM_Y, 66, 3);
      ctx.fillStyle = woodDC;
      ctx.fillRect(254, PLATFORM_Y + 3, 66, 1);
      for (let i34 = 0; i34 < g.guards.length; i34++) { const gd = g.guards[i34]; drawGuard(gd.x, gd.rec, gd.step, dark); }
      if (sentry.on) {
        drawGuard(sentry.x, sentry.rec, sentry.step, dark);
        if (sentry.emoteT > 0 && sentry.emote === 1) {
          ctx.fillStyle = 'rgba(42,26,16,0.85)';
          ctx.fillRect(Math.round(sentry.x) - 3, PLATFORM_Y - 24, 8, 8);
          drawText(ctx, '!', Math.round(sentry.x), PLATFORM_Y - 22, '#ffe070');
        }
      }

      // заборы
      for (let i = 0; i < g.fences; i++) {
        const fx = FENCE_X[i];
        for (let row = 0; row < 3; row++) {
          const by = LANE_TOP + 6 + row * 9;
          ctx.fillStyle = woodDC;
          ctx.fillRect(fx - 5, by - 3, 11, 1);
          ctx.fillRect(fx - 5, by - 6, 11, 1);
          ctx.fillStyle = woodC;
          ctx.fillRect(fx - 5, by - 8, 2, 9);
          ctx.fillRect(fx, by - 9, 2, 10);
          ctx.fillRect(fx + 5, by - 8, 2, 9);
        }
      }
      drawOuterGate(woodC, woodDC, dark);

      // светлячки над полем
      if (dark > 0.45 && g.phase !== 'play') {
        for (let i35 = 0; i35 < ffl.length; i35++) { const f = ffl[i35];
          const b = 0.5 + 0.5 * Math.sin(g.t * f.v * 2 + f.p * 3);
          const fx = Math.round(f.x + Math.sin(g.t * 0.4 * f.v + f.p) * 10), fy = Math.round(f.y + Math.sin(g.t * 0.7 + f.p) * 4);
          ctx.fillStyle = rgbStr(255, 240, 120, (dark - 0.45) * 1.6 * b);
          ctx.fillRect(fx, fy, 1, 1);
        }
      }

      // люди и зомби — по глубине
      order.length = 0;
      for (let i36 = 0; i36 < zombies.length; i36++) { const z = zombies[i36]; if (z.on) order.push(z); }
      for (let i37 = 0; i37 < actors.length; i37++) { const a = actors[i37]; if (a.on) order.push(a); }
      for (let i = 1; i < order.length; i++) {
        const e = order[i];
        let j = i - 1;
        while (j >= 0 && order[j].y > e.y) { order[j + 1] = order[j]; j--; }
        order[j + 1] = e;
      }
      for (let i = 0; i < order.length; i++) {
        const e = order[i];
        if (e.isZ) drawZombie(e, dark); else drawActor(e, dark);
      }

      // частокол с воротами
      const sk = dark * 0.7;
      const stA = rgbMix(STAKE0, STAKE1, sk);
      const stB = rgbStr(lerp(STAKE0[0], STAKE1[0], sk) * 0.85, lerp(STAKE0[1], STAKE1[1], sk) * 0.85, lerp(STAKE0[2], STAKE1[2], sk) * 0.85);
      const stD = rgbStr(lerp(STAKE0[0], STAKE1[0], sk) * 0.65, lerp(STAKE0[1], STAKE1[1], sk) * 0.65, lerp(STAKE0[2], STAKE1[2], sk) * 0.65);
      for (let x = WALL_X; x < WALL_X + 10; x += 3) {
        ctx.fillStyle = x % 2 ? stA : stB;
        ctx.fillRect(x, 100, 3, GATE_Y0 - 100);
        ctx.fillRect(x, GATE_Y1, 3, H - GATE_Y1);
        ctx.fillRect(x + 1, 98, 1, 2);
      }
      ctx.fillStyle = stD;
      ctx.fillRect(WALL_X, 112, 10, 1);
      // створка ворот: поднимается, трещит, выбита
      if (!g.gbroken) {
        const lift = Math.round(clamp(g.gate, 0, 1) * 30);
        const gy0 = GATE_Y0 - lift, gy1 = GATE_Y1 - lift;
        const gw = rgbMix(GATEW0, STAKE1, sk);
        for (let x = WALL_X; x < WALL_X + 10; x += 3) {
          ctx.fillStyle = gw;
          ctx.fillRect(x, gy0, 3, gy1 - gy0);
        }
        ctx.fillStyle = rgbMix(IRON, NIGHTC, dark * 0.5);
        ctx.fillRect(WALL_X, gy0 + 3, 10, 1);
        ctx.fillRect(WALL_X, gy1 - 5, 10, 1);
        const nc = Math.floor(clamp(g.gdmg, 0, 1) * CRACKS.length);
        ctx.fillStyle = 'rgba(16,10,8,0.85)';
        for (let i = 0; i < nc; i++) ctx.fillRect(CRACKS[i][0], CRACKS[i][1] - lift, 1, 3);
      } else {
        ctx.fillStyle = stD;
        ctx.fillRect(WALL_X - 4, GATE_Y1 + 2, 6, 1);
        ctx.fillRect(WALL_X + 6, GATE_Y1 + 4, 5, 1);
        ctx.fillRect(WALL_X - 8, 160, 4, 1);
        ctx.fillRect(WALL_X + 1, GATE_Y0, 2, 5);
        ctx.fillRect(WALL_X + 7, GATE_Y0, 2, 3);
      }
      ctx.fillStyle = stD;
      ctx.fillRect(WALL_X, GATE_Y1 + 1, 10, 1);
      // факел у ворот
      const tf = 0.75 + 0.25 * Math.sin(g.t * 11) * Math.sin(g.t * 4.3);
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(WALL_X - 2, 120, 1, 6);
      ctx.fillStyle = rgbStr(255, 180 * tf, 60);
      ctx.fillRect(WALL_X - 3, 117, 3, 3);
      ctx.fillStyle = rgbStr(255, 170, 70, 0.12 + 0.12 * dark * tf);
      ctx.fillRect(WALL_X - 12, 108, 20, 20);

      // стрелы
      ctx.fillStyle = '#e8e2d4';
      for (let i38 = 0; i38 < arrows.length; i38++) { const a = arrows[i38];
        if (!a.on) continue;
        const sp = Math.hypot(a.vx, a.vy) || 1;
        const ux = a.vx / sp, uy = a.vy / sp;
        for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(a.x - ux * k), Math.round(a.y - uy * k), 1, 1);
      }
      for (let i39 = 0; i39 < parts.length; i39++) { const p = parts[i39];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        if (p.gem) {
          ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
        } else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      drawSlashes();
      ctx.restore();

      if (g.hurtFlash > 0 && g.phase === 'play') {
        ctx.fillStyle = rgbStr(200, 30, 30, 0.12 * (g.hurtFlash / 0.2));
        ctx.fillRect(W - 80, 0, 80, H);
      }
      if (g.phase === 'lose' || g.phase === 'wait') {
        const a = g.phase === 'lose' ? clamp(g.pt * 2, 0, 1) * 0.35 : Math.max(0.12, 0.35 - g.pt * 0.12);
        ctx.fillStyle = rgbStr(40, 6, 6, a);
        ctx.fillRect(0, 0, W, H);
        if (g.phase === 'lose') drawIcon(ctx, 'skull', 146, 70, 4);
      }

      // ---------- HUD ----------
      const hud = clamp(g.hud, 0, 1);
      if (hud <= 0.01) return;
      ctx.globalAlpha = hud;
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

      const sc = score();
      const scw = textWidth(sc < 10 ? '0' : sc < 100 ? '00' : sc < 1000 ? '000' : '0000', 2);
      drawNumber(ctx, sc, W - 6 - scw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawNumber(ctx, sc, W - 6 - scw, 5, '#ffffff', 2);
      const best = Math.max(0, Math.floor(api.best || 0));
      const bw = textWidth(best < 10 ? '0' : best < 100 ? '00' : best < 1000 ? '000' : '0000', 1);
      drawNumber(ctx, best, W - 6 - bw, 18, '#ffe070');
      drawIcon(ctx, 'trophy', W - 6 - bw - 10, 17);

      if (g.phase === 'play' && g.mode === 'play' && g.banner > 0) {
        const a = Math.min(1, g.banner * 2);
        ctx.fillStyle = rgbStr(16, 10, 8, 0.5 * a);
        ctx.fillRect(110, 50, 100, 26);
        drawSprite(ctx, FLAG, 128, 55, 3);
        drawNumber(ctx, g.wave, 150, 55, '#ffb0a0', 3);
      }

      if (g.phase === 'play' && g.mode === 'shop') {
        ctx.fillStyle = 'rgba(16,10,8,0.72)';
        ctx.fillRect(62, 40, 196, 82);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(62, 40, 196, 1);
        ctx.fillRect(62, 121, 196, 1);
        drawIcon(ctx, 'clock', 66, 45);
        drawNumber(ctx, Math.ceil(g.shopT), 75, 46, '#e8e2d4');
        drawIcon(ctx, 'emerald', 238, 44);
        drawNumber(ctx, g.gems, 245, 46, '#8af0a8');
        const ng = activeGuards();
        for (let i = 0; i < 4; i++) {
          const x = cardX(i), y = CARD_Y;
          const ok = canBuy(i);
          const maxed = (i === 0 && g.guards.length >= MAX_GUARDS) || (i === 1 && g.fences >= MAX_FENCES) || (i === 2 && g.hp >= MAX_HP);
          ctx.fillStyle = i === 3 ? 'rgba(60,110,60,0.9)' : ok ? 'rgba(90,64,40,0.95)' : 'rgba(50,40,36,0.9)';
          ctx.fillRect(x, y, CARD_W, CARD_H);
          ctx.fillStyle = ok ? '#c8a060' : '#5a4a40';
          ctx.fillRect(x, y, CARD_W, 1);
          ctx.fillRect(x, y + CARD_H - 1, CARD_W, 1);
          if (i < 3) drawNumber(ctx, i + 1, x + 2, y + 2, 'rgba(255,255,255,0.5)');
          const ix = x + CARD_W / 2;
          if (i === 0) drawSprite(ctx, BOW, ix - 7, y + 8, 2);
          else if (i === 1) drawSprite(ctx, FENCE, ix - 7, y + 9, 2);
          else if (i === 2) { drawIcon(ctx, 'heart', ix - 7, y + 9, 2); drawText(ctx, '+20', ix - 5, y + 24, '#ffb0b0'); }
          else drawSprite(ctx, NEXT, ix - 9, y + 12, 2);
          if (i === 0) for (let k = 0; k < MAX_GUARDS; k++) { ctx.fillStyle = k < ng ? '#ffe070' : '#3a2e28'; ctx.fillRect(x + 8 + k * 7, y + 26, 4, 2); }
          if (i === 1) for (let k = 0; k < MAX_FENCES; k++) { ctx.fillStyle = k < g.fences ? '#ffe070' : '#3a2e28'; ctx.fillRect(x + 11 + k * 7, y + 26, 4, 2); }
          if (i < 3) {
            if (maxed) {
              if (i === 2) drawText(ctx, '100%', ix - 7, y + 40, '#8a7a70');
              else drawText(ctx, 'x', ix - 1, y + 40, '#8a7a70');
            } else {
              const pr = i === 0 ? priceGuard() : i === 1 ? priceFence() : priceHeal();
              const pw = (pr < 10 ? 3 : pr < 100 ? 7 : 11) + 7;
              drawIcon(ctx, 'emerald', ix - pw / 2, y + 38);
              drawNumber(ctx, pr, ix - pw / 2 + 7, y + 40, ok ? '#8af0a8' : '#c06060');
            }
          } else {
            drawSprite(ctx, FLAG, ix - 8, y + 37);
            drawNumber(ctx, g.wave + 1, ix - 1, y + 38, '#ffffff');
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    // ---------- цикл ----------
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let shownPhase = '';
    let cursorOn = false;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      const paused = api.paused && api.paused();
      if (!paused) {
        if (g.hold > 0) g.hold -= dt;
        checkMode();
        let still = false;
        if (g.phase === 'idle') {
          const env = getEnv();
          still = !!env && env.animations === false;
        }
        if (!still) update(dt);
        else g.dark = idleDark();
      }
      const wantCursor = g.phase === 'play';
      if (wantCursor !== cursorOn) { cursorOn = wantCursor; canvas.style.cursor = wantCursor ? 'crosshair' : prevCursor; }
      if (g.phase !== shownPhase) { shownPhase = g.phase; if (canvas.dataset) canvas.dataset.gamePhase = shownPhase; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (canvas.dataset) delete canvas.dataset.gamePhase;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = prevCursor;
      canvas.style.touchAction = prevTouch;
    };
  }
};
