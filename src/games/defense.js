// Мини-игра «Защита деревни» и живой фон «Нашествие».
// Вид сбоку: деревня за частоколом справа, слева поле и дорога с внешними воротами.
// Фон (idle): сумерки/ночь по реальным часам, жители ходят, болтают, носят ящики, копаются
// в огороде, окна гаснут и зажигаются, дым из трубы, светлячки, падающие звёзды; часовой на
// помосте. Изредка одинокий зомби бредёт к внешним воротам и застревает — часовой его снимает.
// Облик деревни растёт вместе с улучшениями игрока (каменный частокол, башня, флаги, ловушки).
// Вступление: орда сбегается к внешним воротам, жители прячутся, ворота ломаются — волна.
// Игра — бесконечные волны с рубежами каждые 5 волн (следующий забег начинается с рубежа),
// 9 видов зомби и 3 босса (каждые 10 волн), улучшения деревни за изумруды (навсегда), альбом,
// 3 задания дня, награды лаунчера. Клик по зомби — удар мечом; между волнами — лавка.
// Выход: бьёт колокол, стражник и жители с факелами выходят, зомби бегут, ворота чинят — покой.
// Поражение: ворота частокола выбиты, зомби замирают у пролома (спокойная сцена под карточкой).
// Счёт = волна * 20 + убийства за забег. Всё рисуется целочисленными fillRect, цвета из кэша.

import { drawText, drawIcon, rgbStr, rgbMix, drawLabel, labelWidth, drawInt, intWidth } from './pixfont.js';
import {
  TYPES, TYPE_IDS, MOB_IDS, bossMul, bossFor, bossFirstWave, waveCount, waveWindow, hpMul, spdMul, dmgMul, gemMul, typeWeight,
  UPGRADES, villageLevel, wallMax, archerCount, arrowDmg, arrowCd, fenceCount, spikeDps, clickDmg, bellHeal, ckptOf
} from './defense/data.js';
import { createProgress, upgradePrice } from './defense/progress.js';

const W = 320;
const H = 180;
const GROUND = 136;
const LANE_TOP = 142;
const LANE_H = 26;
const WALL_X = 248; // передняя грань частокола
const MAX_SLOTS = 6;
const FENCE_X = [206, 166, 126];
const GUARD_SLOTS = [262, 271, 280, 289, 298, 307];
const PLATFORM_Y = 106;
const OUTER_X = 116; // внешние ворота на дороге
const GATE_Y0 = 136;
const GATE_Y1 = 166;
const GIN_X = 264, GOUT_X = 238, GATE_Y = 151;
const DOORS_X = [274, 305];
const DOOR_Y = 142;
const CRATE_X = 313, CRATE_Y = 165;
const OFF_R = 326;
const SHOP_T = 15;

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

const FLAG = sprite({ a: '#7a4e2a', b: '#e04848', c: '#ff8a8a' }, ['abbb.', 'acbbb', 'abbb.', 'a....', 'a....', 'a....']);
const NEXT = sprite({ a: '#ffffff' }, ['a...a....', 'aa..aa...', 'aaa.aaa..', 'aaaaaaaa.', 'aaa.aaa..', 'aa..aa...', 'a...a....']);
const BOOK = sprite({ a: '#8a4a2a', b: '#e8dcc0', c: '#5a2a18' }, ['aaaaaaa', 'abbcbba', 'abbcbba', 'abbcbba', 'abbcbba', 'aaaaaaa']);
const CHECK = sprite({ a: '#60e070' }, ['....a', '...a.', 'a.a..', '.a...']);
const LOCK = sprite({ a: '#8a8070', b: '#5a5048' }, ['.aa.', 'a..a', 'bbbb', 'bbbb']);
const UPG_ICON = [
  sprite({ a: '#b0804a', b: '#6a4424', c: '#9aa0a8' }, ['a.a.a.a', 'aaaaaaa', 'abababa', 'aaaaaaa', 'abababa', 'ccccccc']),
  sprite({ a: '#a8723e', b: '#e8e2d4', c: '#c8d0dc', d: '#7a4e2a' }, ['..ab...', '.a.b...', 'a..b...', 'dcccccc', 'a..b...', '.a.b...', '..ab...']),
  sprite({ a: '#e8e2d4', b: '#c8d0dc', c: '#e04848' }, ['......b', '.....ab', '....a..', '...a...', '..a....', 'ca.....', 'cc.....']),
  sprite({ a: '#b0804a', b: '#c8d0dc' }, ['.b.b.b.', '.b.b.b.', 'aaaaaaa', '.a.a.a.', 'aaaaaaa', '.a.a.a.']),
  sprite({ a: '#e8eef4', b: '#9aa8b8', c: '#7a4e2a', d: '#e0b84a' }, ['......a', '.....ab', '....ab.', '.d.ab..', '..db...', '.cdd...', 'c......']),
  sprite({ a: '#c8a040', b: '#8a6420', c: '#5a3a20' }, ['..c..', '.aaa.', '.aaa.', 'aaaaa', 'bbbbb', '..b..'])
];
const HEAL_ICON = 'heart';
// иконки заданий дня
const D_ICON = [
  sprite({ a: '#e8e2d4', b: '#2a2420' }, ['.aaa.', 'abab.', 'aaaa.', '.a.a.']),
  sprite({ a: '#5f8a4e', b: '#c02020' }, ['aaa.', 'aba.', 'aaa.', '.a..']),
  sprite({ a: '#7a4e2a', b: '#e04848' }, ['abbb', 'abb.', 'a...', 'a...']),
  sprite({ a: '#9aa4b0', b: '#ffffff' }, ['aaaaa', 'abbba', '.aba.', '..a..']),
  sprite({ a: '#ffd34a', b: '#c8901e' }, ['a.a.a', 'aaaaa', 'abbba', 'aaaaa']),
  sprite({ a: '#2fd36a', b: '#b8ffd0' }, ['.a.', 'aba', 'aaa', '.a.']),
  sprite({ a: '#e8eef4', b: '#7a4e2a' }, ['...a', '..a.', 'ba..', 'b...'])
];

const D_LABEL = ['ЗОМБИ', '', 'ВОЛНЫ', 'БЕЗ УРОНА', 'БОСС', 'ИЗУМРУДЫ', 'МЕЧОМ'];
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
const STONE0 = [140, 140, 136], STONE1 = [40, 40, 48];
const GATEW0 = [112, 78, 46];
const IRON = [90, 92, 100];
const PUMPKIN = [220, 120, 40], LEAF = [70, 120, 50];
const Z_LEG = [42, 52, 80], Z_SHIRT = [74, 106, 138], Z_SHIRTD = [46, 62, 90], Z_SKIN = [95, 138, 78], Z_SKIND = [75, 110, 61], Z_FSHIRT = [84, 110, 140];
const Z_BROWN = [110, 80, 50], Z_BROWND = [80, 56, 36];
const Z_PALE = [200, 220, 230], Z_PALED = [150, 176, 196], Z_PALES = [170, 200, 210];
const Z_ROBE = [60, 40, 80], Z_ROBED = [40, 26, 56];
const Z_WITCH = [110, 50, 120], Z_WITCHD = [70, 30, 80];
const Z_GSKIN = [80, 120, 70], Z_GSKIND = [60, 96, 52];
const Z_RED = [192, 32, 32];
const PLATE = [150, 156, 168], PLATED = [100, 106, 118];
const BARREL = [130, 84, 44], BARRELD = [70, 44, 24];
const SHIELDC = [150, 108, 66], SHIELDD = [96, 66, 40];
const GOLD = [230, 190, 60];
const POTION = [80, 220, 120];
const G_LEG = [60, 44, 34], G_BODY = [120, 80, 50], G_BELT = [90, 60, 40], SKIN = [232, 190, 150], EYE = [40, 30, 30], HELM = [150, 156, 168], BOWC = [168, 114, 62];
const NOSE = [200, 150, 116];
const ROBES = [[140, 100, 60], [222, 214, 196], [70, 70, 80], [130, 80, 150], [120, 80, 50]];
const ROBED = [[110, 76, 44], [180, 170, 150], [50, 50, 58], [100, 60, 118], [90, 60, 40]];
const HATS = [[214, 180, 96], [200, 196, 180], [40, 40, 44], [110, 62, 130], [150, 156, 168]];
const CRATE0 = [168, 120, 70], CRATE1 = [110, 76, 44];
const SPEAR = [200, 206, 216];
const BELL = [200, 160, 60];
const BANNER = [190, 50, 50];

// окна лавки / альбома
const CARD_Y = 72, CARD_W = 36, CARD_H = 76;
const cardX = (i) => 12 + i * 37;
const BOOK_X = 80, BOOK_Y = 14;
const AX = 12, AY = 22, AW = 296, AH = 140;
const START_X = AX + AW - 70, START_Y = AY + AH - 21;

export default {
  id: 'defense',
  title: 'Защита деревни',
  sceneTitle: 'Нашествие',
  desc: 'Бесконечные волны зомби с рубежами, боссы, улучшения деревни, альбом и задания дня.',
  controls: 'Мышь: клик по зомби · в лавке: клик / 1–8, Пробел — следующая волна · Tab — альбом',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rand = Math.random;
    const prevCursor = canvas.style.cursor;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const variant = typeof api.variant === 'number' && api.variant > 0 ? api.variant : 0;

    const getMode = () => {
      if (variant) return 'idle';
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

    // ---------- прогресс ----------
    const P = createProgress(api);
    P.load();
    const UP = () => P.p.up;

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
    for (let i = 0; i < 64; i++) zombies.push({ zz: 1, on: false, isZ: true, type: 'normal', T: TYPES.normal, mode: 'play', x: 0.5, y: 0.5, hp: 0.5, max: 0.5, spd: 0.5, flash: 0.5, kb: 0.5, atk: false, phase: 0.5, dir: 1, hx: 0.5, hs: 0.5, give: 0.5, act: 0.5, act2: 0.5, hop: 0.5, ghost: false, stopX: 0.5, summon: false });
    const parts = [];
    for (let i = 0; i < 140; i++) parts.push({ dp: 1, on: false, gem: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, life: 0.5, c: '#fff' });
    const arrows = [];
    for (let i = 0; i < 40; i++) arrows.push({ da: 1, on: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, dmg: 1 });
    const bolts = []; // зелья ведьм
    for (let i = 0; i < 10; i++) bolts.push({ db: 1, on: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, dmg: 1 });
    const slashes = [];
    for (let i = 0; i < 6; i++) slashes.push({ ds: 1, on: false, x: 0, y: 0, life: 0.5, d: 1 });
    const smoke = [];
    for (let i = 0; i < 12; i++) smoke.push({ dm: 1, on: false, x: 0.5, y: 0.5, life: 0.5 });
    const order = [];
    const guards = [];
    for (let i = 0; i < MAX_SLOTS; i++) guards.push({ gd: 1, on: false, x: OFF_R + 0.5, tx: GUARD_SLOTS[i], cd: 1.5, rec: 0.5, leave: false, step: 0.5 });

    // ---------- жители ----------
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
      hp: 100, maxHp: 100, kills: 0, wave: 0, startWave: 1, cleared: 0, perfect: true,
      toSpawn: 0, spawnT: 0, spawnInt: 2, spdMul: 1, hpMul: 1, dmgMul: 1, bossDue: null, bossAt: 0, boss: null,
      shopT: 0, banner: 0, shake: 0, hurtSnd: 0, hurtFlash: 0,
      overSent: false,
      dark: idleDark(), hud: 0,
      gate: 0, gateReq: false, gdmg: 0, gbroken: false,
      og: 1, bell: 0, lone: 8 + rand() * 10,
      ssT: 12 + rand() * 20, ssX: 0, ssY: 0, ssA: -1,
      smokeT: 0, lit: [true, true, false, true], litT: 4,
      doorT: [0, 0], introTp: 1.6, introOg: true, hordeN: 0, ev: 0,
      panel: null, sel: 0, toast: null, toastT: 0, spikeT: 0
    };
    const score = () => g.kills + g.wave * 20;
    const priceHeal = () => 10 + g.wave * 3;
    const healAmt = () => Math.round(g.maxHp * 0.2);

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
    const C_FIRE = ['#ffe070', '#ff9030', '#e04020', '#5a5050'];
    const C_POT = ['#60e080', '#b0ffc0', '#40a060'];
    const C_GHOST = ['#d0e8f0', '#a0c0d8'];
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
      z.on = true; z.type = type; z.T = T; z.mode = mode;
      z.x = x; z.y = y;
      z.hp = T.hp; z.max = T.hp;
      z.spd = T.spd * (0.9 + rand() * 0.2);
      z.flash = 0; z.kb = 0; z.atk = false; z.phase = rand() * 6; z.dir = 1; z.give = 999; z.hx = x; z.hs = 0;
      z.act = 1 + rand() * 2; z.act2 = 2 + rand() * 2; z.hop = 0; z.ghost = false; z.stopX = 140 + rand() * 50; z.summon = false;
    };

    const startWave = () => {
      g.wave++;
      g.mode = 'play';
      g.panel = null;
      const w = g.wave;
      const boss = bossFor(w);
      g.toSpawn = boss ? Math.round(waveCount(w) * 0.6) : waveCount(w);
      g.spawnInt = waveWindow(g.toSpawn) / Math.max(1, g.toSpawn);
      g.spawnT = 1.2;
      g.spdMul = spdMul(w);
      g.hpMul = hpMul(w);
      g.dmgMul = dmgMul(w);
      g.bossDue = boss;
      g.bossAt = Math.floor(g.toSpawn / 2);
      g.perfect = true;
      g.banner = boss ? 2.6 : 1.8;
      P.reachWave(w);
      api.sfx('click');
    };

    const pickType = () => {
      const w = g.wave;
      let sum = 0;
      for (let i = 0; i < MOB_IDS.length; i++) sum += typeWeight(MOB_IDS[i], w);
      let r = rand() * sum;
      for (let i = 0; i < MOB_IDS.length; i++) { r -= typeWeight(MOB_IDS[i], w); if (r <= 0) return MOB_IDS[i]; }
      return 'normal';
    };
    const spawnAs = (type, x, y) => {
      const z = zFree();
      if (!z) return null;
      zInit(z, type, x, y, 'play');
      z.hp = z.max = TYPES[type].hp * g.hpMul;
      z.spd = TYPES[type].spd * g.spdMul * (0.9 + rand() * 0.2);
      return z;
    };
    const spawn = () => spawnAs(pickType(), -12 - rand() * 6, LANE_TOP + Math.floor(rand() * LANE_H));
    const spawnBoss = (id) => {
      const z = spawnAs(id, -24, LANE_TOP + 10 + Math.floor(rand() * 8));
      if (!z) return;
      // боссы крепнут с каждым кругом
      const lap = Math.floor((g.wave - bossFirstWave(id)) / 30);
      z.hp = z.max = TYPES[id].hp * bossMul(g.wave) * (1 + lap * 0.5);
      z.spd = TYPES[id].spd * (1 + Math.min(0.3, lap * 0.1));
      g.boss = z;
      g.banner = 2.6;
      g.shake = 0.3;
      api.sfx('lose');
    };

    const killZombie = (z, sword) => {
      z.on = false;
      const T = z.T;
      const cy = z.y - 6 * T.s;
      burst(z.x + 1, cy, 10 + T.s * 4, z.type === 'ghost' ? C_GHOST : C_SMOKE, 26);
      if (z === g.boss) g.boss = null;
      if (z.type === 'bomber') explode(z, false);
      if (g.phase === 'play') {
        g.kills++;
        const gems = Math.max(1, Math.round(T.gem * gemMul(g.wave))) * P.mul();
        P.kill(z.type, sword, gems);
        if (P.author) { P.p.kills += AUTH_KILL_EXTRA; }
        const n = Math.min(6, T.gem);
        for (let i = 0; i < n; i++) addPart(z.x + 1, cy, (rand() - 0.5) * 40, -30 - rand() * 20, 1.4, '#2fd36a', true);
        api.sfx('coin');
      }
    };
    const AUTH_KILL_EXTRA = 39; // автор: в 40 раз быстрее копятся убийства (для плаща)

    // бочка взрывается: у стены — урон стене, в поле — урон соседям
    const explode = (z, atWall) => {
      burst(z.x + 2, z.y - 10, 18, C_FIRE, 46);
      g.shake = 0.3;
      api.sfx('hit');
      if (atWall) {
        if (g.phase === 'play') hurtWall(25 * g.dmgMul);
      } else {
        const dmg = 8 * g.hpMul * 0.5;
        for (let i = 0; i < zombies.length; i++) { const o = zombies[i];
          if (!o.on || o === z || o.mode !== 'play') continue;
          if (Math.abs(o.x - z.x) < 22 && Math.abs(o.y - z.y) < 14) { o.hp -= dmg; o.flash = 0.1; if (o.hp <= 0) killZombie(o, false); }
        }
      }
    };

    const damage = (z, amount, kb, sword) => {
      if (z.ghost) { burst(z.x + 1, z.y - 8, 2, C_GHOST, 10); return; }
      z.hp -= amount;
      z.flash = 0.1;
      z.kb = z.T.boss ? 0 : kb / z.T.s;
      burst(z.x + 1, z.y - 7 * z.T.s, 3, C_GREEN, 18);
      if (z.hp <= 0) killZombie(z, sword);
    };

    const hitTest = (x, y, pad, forArrow) => {
      let best = null;
      for (let i3 = 0; i3 < zombies.length; i3++) { const z = zombies[i3];
        if (!z.on) continue;
        if (forArrow && z.ghost) continue;
        const b = z.T.box;
        const l = z.dir > 0 ? b.l : -b.r, r = z.dir > 0 ? b.r : -b.l;
        const zy = z.y - z.hop;
        if (x >= z.x + l - pad && x <= z.x + r + pad && y >= zy + b.t - pad && y <= zy + 1 + pad) {
          if (!best || z.x > best.x) best = z;
        }
      }
      return best;
    };

    const shoot = (sx, sy, target, dmg) => {
      const T = target.T;
      const dist = Math.abs(target.x - sx);
      const ft = clamp(dist / 150, 0.35, 1.3);
      const moving = target.mode === 'play' ? !target.atk : target.mode === 'walk' || target.mode === 'flee' || target.mode === 'leave';
      const tx = moving ? target.x + target.spd * target.dir * ft : target.x;
      const ty = target.y - 6 * T.s;
      for (let i4 = 0; i4 < arrows.length; i4++) { const a = arrows[i4];
        if (a.on) continue;
        a.on = true; a.x = sx; a.y = sy; a.dmg = dmg;
        a.vx = (tx - sx) / ft;
        a.vy = (ty - sy) / ft - 0.5 * 140 * ft;
        return;
      }
    };
    const throwPotion = (z) => {
      for (let i = 0; i < bolts.length; i++) { const b = bolts[i];
        if (b.on) continue;
        const ft = clamp((WALL_X - z.x) / 110, 0.6, 1.6);
        b.on = true; b.x = z.x + 3; b.y = z.y - 12; b.dmg = 6 * g.dmgMul;
        b.vx = (WALL_X - 1 - b.x) / ft;
        b.vy = (z.y - 10 - b.y) / ft - 0.5 * 140 * ft;
        return;
      }
    };
    const hurtWall = (amt) => {
      g.hp -= amt;
      g.perfect = false;
      g.shake = Math.max(g.shake, 0.15);
      g.hurtFlash = 0.2;
    };

    // ---------- лавка ----------
    const canBuy = (i) => {
      if (i < 6) { const pr = upgradePrice(P.p, i); return pr >= 0 && P.p.em >= pr; }
      if (i === 6) return g.hp < g.maxHp && P.p.em >= priceHeal();
      return true;
    };
    const buy = (i) => {
      if (g.phase !== 'play' || g.mode !== 'shop') return;
      if (i === 7) { startWave(); return; }
      if (!canBuy(i)) { api.sfx('hit'); return; }
      if (i < 6) {
        P.buy(i);
        applyUpgrades(true);
      } else if (i === 6) {
        P.p.em -= priceHeal();
        g.hp = Math.min(g.maxHp, g.hp + healAmt());
        P.save();
      }
      api.sfx('coin');
    };
    const applyUpgrades = (live) => {
      const up = UP();
      const m = wallMax(up);
      if (live && m > g.maxHp) g.hp += m - g.maxHp;
      g.maxHp = m;
      if (live) callArchers();
    };
    const callArchers = () => {
      const n = archerCount(UP());
      for (let i = 0; i < MAX_SLOTS; i++) {
        const gd = guards[i];
        if (i < n && (!gd.on || gd.leave)) {
          if (!gd.on) { gd.x = OFF_R + i * 6 + 0.5; gd.on = true; }
          gd.leave = false; gd.tx = GUARD_SLOTS[i]; gd.cd = 0.6 + rand() * 0.6; gd.rec = 0; gd.step = 0;
        }
      }
    };

    // ---------- ввод ----------
    const PT = { pt: 1, x: 0.5, y: 0.5 };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      PT.x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
      PT.y = ((e.clientY - r.top) / Math.max(1, r.height)) * H;
      return PT;
    };
    const inR = (p, x, y, w, h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
    const togglePanel = () => {
      if (g.phase !== 'play') return;
      g.panel = g.panel ? null : 'album';
      api.sfx('click');
    };
    const onPointerDown = (e) => {
      if (g.phase !== 'play') return;
      e.preventDefault();
      if (api.paused && api.paused()) return;
      const p = toLocal(e);
      if (inR(p, BOOK_X - 1, BOOK_Y - 1, 13, 12)) { togglePanel(); return; }
      if (g.panel) {
        if (inR(p, AX + AW - 12, AY + 2, 10, 10) || !inR(p, AX, AY, AW, AH)) { g.panel = null; api.sfx('click'); return; }
        for (let i = 0; i < TYPE_IDS.length; i++) if (inR(p, AX + 6 + (i % 6) * 48, AY + 15 + Math.floor(i / 6) * 52, 46, 50)) { g.sel = i; api.sfx('click'); return; }
        if (inR(p, START_X + 25, START_Y, 12, 15)) { api.sfx(P.setStart(-1) ? 'click' : 'hit'); return; }
        if (inR(p, START_X + 52, START_Y, 12, 15)) { api.sfx(P.setStart(1) ? 'click' : 'hit'); return; }
        return;
      }
      if (g.mode === 'shop') {
        for (let i = 0; i < 8; i++) if (inR(p, cardX(i), CARD_Y, CARD_W, CARD_H)) { buy(i); return; }
        return;
      }
      for (let i6 = 0; i6 < slashes.length; i6++) { const s = slashes[i6];
        if (s.on) continue;
        s.on = true; s.x = Math.round(p.x); s.y = Math.round(p.y); s.life = 0.14; s.d = rand() > 0.5 ? 1 : -1;
        break;
      }
      const z = hitTest(p.x, p.y, PAD, false);
      if (z) {
        damage(z, clickDmg(UP()), 5, true);
        if (z.on) api.sfx('hit');
      } else {
        burst(p.x, p.y, 2, C_DIRT, 10);
      }
    };
    const onCtx = (e) => { if (g.phase === 'play') e.preventDefault(); };
    const onKeyDown = (e) => {
      if (g.phase !== 'play') return;
      const c = e.code;
      if (c === 'Tab' || c === 'KeyI') { e.preventDefault(); if (!e.repeat) togglePanel(); return; }
      if (P.author && (c === 'BracketRight' || c === 'BracketLeft')) {
        e.preventDefault();
        if (!e.repeat) authorSkip(c === 'BracketRight' ? 1 : -1);
        return;
      }
      if (g.panel) {
        if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' || c === 'ArrowDown') {
          e.preventDefault();
          const d = c === 'ArrowLeft' ? -1 : c === 'ArrowRight' ? 1 : c === 'ArrowUp' ? -6 : 6;
          g.sel = (g.sel + d + TYPE_IDS.length) % TYPE_IDS.length;
        } else if (c === 'Space' || c === 'Enter' || c === 'Backspace') { e.preventDefault(); g.panel = null; }
        else if (c === 'Minus' || c === 'NumpadSubtract' || c === 'Equal' || c === 'NumpadAdd') { e.preventDefault(); api.sfx(P.setStart(c === 'Minus' || c === 'NumpadSubtract' ? -1 : 1) ? 'click' : 'hit'); }
        return;
      }
      if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        if (g.mode === 'shop') startWave();
      } else if ((c.startsWith('Digit') || c.startsWith('Numpad')) && c.length >= 6) {
        const n = c.charCodeAt(c.length - 1) - 49;
        if (n < 0 || n > 7) return;
        e.preventDefault();
        if (e.repeat) return;
        buy(n);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKeyDown);

    // автор: перескок на следующий / предыдущий рубеж
    const authorSkip = (dir) => {
      for (let i = 0; i < zombies.length; i++) { const z = zombies[i]; if (z.on && z.mode === 'play') { burst(z.x, z.y - 6, 4, C_SMOKE, 20); z.on = false; } }
      g.boss = null;
      const cur = Math.max(1, g.wave);
      const target = dir > 0 ? ckptOf(cur) + 5 : Math.max(1, ckptOf(cur) - 5);
      g.wave = target - 1;
      if (target > P.p.ckpt) P.p.ckpt = ckptOf(target);
      startWave();
      P.save();
      g.toast = { text: 'A: волна ' + target, color: '#ff9ad0', kind: 2 };
      g.toastT = 1.6;
    };

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
    const emote = (a, k, t) => { a.emote = k; a.emoteT = t; };
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

    const updateSentry = (dt) => {
      if (!sentry.on) return;
      if (sentry.rec > 0) sentry.rec -= dt;
      if (sentry.emoteT > 0) sentry.emoteT -= dt;
      const leaving = sentry.state === 'leave';
      let target = null;
      if (!leaving && g.phase === 'idle') {
        for (let i9 = 0; i9 < zombies.length; i9++) { const z = zombies[i9]; if (z.on && (z.mode === 'walk' || z.mode === 'rattle') && z.x > OUTER_X - 46 && (!target || z.x > target.x)) target = z; }
      }
      const dx = sentry.timer - sentry.x;
      if (target) {
        sentry.dir = -1;
        sentry.cd -= dt;
        if (sentry.cd <= 0) {
          sentry.cd = 1.7 + rand() * 0.5;
          sentry.rec = 0.2;
          shoot(sentry.x - 3, PLATFORM_Y - 7, target, 1);
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

    // лучники деревни (по уровню улучшения)
    const updateGuards = (dt, canShoot) => {
      const up = UP();
      for (let i = 0; i < MAX_SLOTS; i++) {
        const gd = guards[i];
        if (!gd.on) continue;
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
        if (gd.leave) { gd.on = false; continue; }
        if (!canShoot) continue;
        gd.cd -= dt;
        if (gd.cd > 0) continue;
        let target = null;
        for (let i10 = 0; i10 < zombies.length; i10++) { const z = zombies[i10]; if (z.on && z.mode === 'play' && z.x > 4 && !z.ghost && (!target || z.x > target.x)) target = z; }
        if (!target) { gd.cd = 0.2; continue; }
        gd.cd = arrowCd(up) * (0.9 + rand() * 0.2);
        gd.rec = 0.2;
        shoot(gd.x - 3, PLATFORM_Y - 7, target, arrowDmg(up));
      }
    };
    const guardsLeave = () => { for (let i = 0; i < MAX_SLOTS; i++) { const gd = guards[i]; if (gd.on) { gd.leave = true; gd.tx = OFF_R + i * 4; } } };

    // ---------- переходы ----------
    const startIntro = () => {
      const from = g.phase;
      g.phase = 'intro';
      g.pt = 0;
      g.ev = 0;
      g.mode = 'play';
      g.bell = 0;
      g.panel = null;
      if (from === 'idle') P.load();
      for (let i12 = 0; i12 < actors.length; i12++) { const a = actors[i12];
        a.partner = null;
        a.carry = 0;
        if (a.on) setPath(a, DOORS_X[a.home], DOOR_Y, 'in', 52);
      }
      gardener = null;
      if (sentry.on) { emote(sentry, 1, 1.0); sentry.state = 'leave'; sentry.timer = OFF_R; }
      guardsLeave();
      g.introOg = g.og > 0.05;
      g.introTp = g.introOg ? 1.6 : 1.1;
      let n = 0;
      for (let i13 = 0; i13 < zombies.length; i13++) { const z = zombies[i13];
        if (!z.on) continue;
        if (n >= 6 || z.T.boss || z.type === 'witch') { z.mode = 'flee'; z.dir = -1; z.spd = 80; continue; }
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
      applyUpgrades(false);
      g.hp = g.maxHp;
      g.kills = 0;
      g.startWave = Math.min(P.p.start, P.p.ckpt);
      g.cleared = 0;
      g.wave = g.startWave - 1;
      g.overSent = false;
      g.sawOver = false;
      g.gdmg = 0;
      g.gbroken = false;
      g.boss = null;
      if (P.checkDay()) P.save();
      startWave();
      g.toSpawn = Math.max(0, g.toSpawn - g.hordeN);
      g.spawnT = 2.5;
      for (let i14 = 0; i14 < zombies.length; i14++) { const z = zombies[i14];
        if (!z.on || z.mode === 'flee') continue;
        z.mode = 'play';
        z.dir = 1;
        z.hp = z.max = z.T.hp * g.hpMul * 0.5;
        z.spd = z.T.spd * g.spdMul * (0.9 + rand() * 0.2);
      }
      callArchers();
    };

    const startOutro = () => {
      if (g.phase === 'play') P.endRun(score(), g.cleared);
      g.phase = 'outro';
      g.pt = 0;
      g.ev = 0;
      g.bell = 1.8;
      g.mode = 'play';
      g.panel = null;
      g.boss = null;
      api.sfx('click');
      for (let i = 0; i < bolts.length; i++) bolts[i].on = false;
      for (let i15 = 0; i15 < zombies.length; i15++) { const z = zombies[i15];
        if (!z.on) continue;
        z.mode = 'scared';
        z.atk = false;
        z.ghost = false;
        z.hop = 0;
        z.give = 0.3 + rand() * 0.4;
      }
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
      if (z.flash > 0) z.flash -= dt;
      if (z.kb > 0) {
        z.x -= z.kb * 14 * dt * (z.dir > 0 ? 1 : -1);
        z.kb -= dt * 30;
        if (z.kb < 0) z.kb = 0;
      }
      if (z.hop > 0 && z.mode !== 'play') z.hop = Math.max(0, z.hop - dt * 20);
      switch (z.mode) {
        case 'walk': {
          z.give -= dt;
          if (z.give <= 0) { z.mode = 'leave'; z.dir = -1; z.spd *= 0.8; break; }
          if (g.og > 0.3 && z.x + z.T.box.r >= OUTER_X - 3) { z.x = OUTER_X - 3 - z.T.box.r; z.mode = 'rattle'; z.atk = true; break; }
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
          if (z.x < -30) { z.on = false; if (z === g.boss) g.boss = null; }
          break;
        case 'scared':
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
          z.atk = false;
          z.give -= dt;
          if (z.give <= 0) {
            z.give = 2 + rand() * 4;
            z.hx = clamp(z.x + (rand() - 0.6) * 8, 60, WALL_X - z.T.box.r);
          }
          if (Math.abs(z.hx - z.x) > 0.5) { z.dir = z.hx > z.x ? 1 : -1; z.x += z.dir * 4 * dt; } else z.dir = 1;
          break;
        default: break;
      }
    };

    // поведение зомби в бою (особые типы)
    const playZombie = (z, dt) => {
      const T = z.T;
      if (z.flash > 0) z.flash -= dt;
      if (z.kb > 0) {
        z.x -= z.kb * 14 * dt;
        z.kb -= dt * 30;
        if (z.kb < 0) z.kb = 0;
      }
      let v = z.spd;
      const front = T.box.r;
      // особые
      if (z.type === 'ghost') {
        z.act -= dt;
        if (z.act <= 0) { z.ghost = !z.ghost; z.act = z.ghost ? 1.4 : 2.6 + rand(); if (z.ghost) burst(z.x + 1, z.y - 8, 3, C_GHOST, 12); }
      } else if (z.type === 'jumper') {
        z.act += dt * (z.atk ? 0 : 2.2);
        z.hop = z.atk ? 0 : Math.abs(Math.sin(z.act * Math.PI)) * 7;
      } else if (z.type === 'witch') {
        if (z.x >= z.stopX) {
          z.atk = false;
          z.act -= dt;
          if (z.act <= 0) { z.act = 3.2 + rand() * 0.8; throwPotion(z); api.sfx('jump'); }
          z.act2 -= dt;
          if (z.act2 <= 0) {
            z.act2 = 5;
            for (let i = 0; i < zombies.length; i++) { const o = zombies[i];
              if (!o.on || o === z || o.mode !== 'play' || o.T.boss) continue;
              if (Math.abs(o.x - z.x) < 36 && o.hp < o.max) { o.hp = Math.min(o.max, o.hp + o.max * 0.25); burst(o.x + 1, o.y - 10, 3, C_POT, 12); }
            }
          }
          return 0;
        }
      } else if (z.type === 'necro') {
        z.act -= dt;
        if (z.act <= 0 && g.phase === 'play') {
          z.act = 6;
          for (let k = 0; k < 2; k++) {
            const m = spawnAs('normal', z.x - 8 - k * 8, clamp(z.y + (k ? 6 : -6), LANE_TOP, LANE_TOP + LANE_H - 1));
            if (m) { m.summon = true; burst(m.x, m.y - 6, 6, C_POT, 18); }
          }
          api.sfx('hit');
        }
      } else if (z.type === 'ram') {
        z.act -= dt;
        if (z.act <= 0) { z.act = 4.5; z.act2 = 1.1; }
        if (z.act2 > 0) { z.act2 -= dt; v *= 2.5; if (Math.floor(g.t * 20) % 3 === 0) addPart(z.x - 4, z.y, -20, -10, 0.3, '#c8b890'); }
      }
      if (z.x + front >= WALL_X) {
        z.x = WALL_X - front;
        if (z.type === 'bomber') { z.on = false; explode(z, true); return 0; }
        z.atk = true;
        z.hop = 0;
        return T.dps * g.dmgMul;
      }
      z.atk = false;
      const jump = z.type === 'jumper' || z.type === 'ghost';
      const nf = fenceCount(UP());
      if (!jump) for (let i = 0; i < nf; i++) if (Math.abs(z.x + 1 - FENCE_X[i]) < 8) v *= T.boss ? 0.7 : 0.5;
      if (z.kb <= 0) z.x += v * dt;
      return 0;
    };

    const updatePlay = (dt) => {
      if (g.panel) return; // альбом открыт — пауза боя
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
          if (g.bossDue && g.toSpawn <= g.bossAt) { spawnBoss(g.bossDue); g.bossDue = null; }
          if (g.wave >= 3 && g.toSpawn > 0 && rand() < Math.min(0.45, 0.05 * g.wave + 0.1)) { spawn(); g.toSpawn--; }
          g.spawnT = g.spawnInt * (0.7 + rand() * 0.6);
        }
      }
      let alive = 0;
      let dmg = 0;
      // шипы ловушек
      const sp = spikeDps(UP());
      g.spikeT -= dt;
      const spikeTick = sp > 0 && g.spikeT <= 0;
      if (spikeTick) g.spikeT = 0.5;
      const nf = fenceCount(UP());
      for (let i17 = 0; i17 < zombies.length; i17++) { const z = zombies[i17];
        if (!z.on) continue;
        if (z.mode !== 'play') { updateZombie(z, dt); continue; }
        alive++;
        dmg += playZombie(z, dt);
        if (spikeTick && z.on && z.type !== 'jumper' && !z.ghost) {
          for (let i = 0; i < nf; i++) if (Math.abs(z.x + 1 - FENCE_X[i]) < 8) { z.hp -= sp * 0.5 * g.hpMul * 0.35; z.flash = 0.05; if (z.hp <= 0) { killZombie(z, false); break; } }
        }
      }
      if (g.bossDue && alive === 0 && g.toSpawn <= 0) { spawnBoss(g.bossDue); g.bossDue = null; alive++; }
      if (dmg > 0) {
        hurtWall(dmg * dt);
        g.shake = 0.15;
        if (g.hurtSnd <= 0) {
          g.hurtSnd = 0.7;
          api.sfx('hit');
          burst(WALL_X, LANE_TOP + rand() * LANE_H - 8, 3, C_WOOD, 20);
        }
      }
      if (g.hp <= 0) {
        g.hp = 0;
        g.phase = 'lose';
        g.pt = 0;
        g.gbroken = true;
        g.shake = 0.45;
        burst(WALL_X + 4, 150, 16, C_PLANK, 40);
        api.sfx('lose');
        for (let i = 0; i < bolts.length; i++) bolts[i].on = false;
        for (let i18 = 0; i18 < zombies.length; i18++) { const z = zombies[i18]; if (z.on) { z.mode = 'stand'; z.give = 1 + rand() * 2; z.hx = z.x; z.ghost = false; z.hop = 0; } }
        P.endRun(score(), g.cleared);
        return;
      }
      g.gdmg = 1 - g.hp / g.maxHp;
      updateGuards(dt, true);
      if (g.toSpawn <= 0 && alive === 0 && !g.bossDue) {
        const bonus = (2 + (g.wave >> 1)) * P.mul();
        P.addGems(bonus);
        g.hp = Math.min(g.maxHp, g.hp + g.maxHp * bellHeal(UP()));
        g.cleared++;
        P.waveCleared(g.wave, g.perfect);
        g.mode = 'shop';
        g.shopT = SHOP_T;
        api.sfx('win');
      }
    };

    const updateIntro = (dt) => {
      const t = g.pt;
      const tp = g.introTp;
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
      if (t >= 1.5) g.gateReq = false;
      if (t >= 1.7) {
        for (let i19 = 0; i19 < actors.length; i19++) { const a = actors[i19]; if (a.on && a.state === 'walk' && a.next === 'in' && (isOut(a.x) || a.x < 262)) { a.on = false; a.state = 'in'; a.timer = 5; } }
      }
      if (t >= Math.max(2.0, tp + 0.4)) beginPlay();
    };

    const updateOutro = (dt) => {
      const t = g.pt;
      updateGuards(dt, false);
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
          zInit(z, r < 0.12 ? 'big' : r < 0.3 ? 'fast' : r < 0.4 && P.p.bestW >= 6 ? 'armor' : 'normal', -12, LANE_TOP + 3 + Math.floor(rand() * (LANE_H - 6)), 'walk');
          z.spd *= 0.6;
          z.give = rand() < 0.3 ? 6 + rand() * 8 : 999;
        }
      }
      g.litT -= dt;
      if (g.litT <= 0) {
        g.litT = 4 + rand() * 10;
        const i = Math.floor(rand() * 4);
        g.lit[i] = !g.lit[i];
      }
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
      // всплывающие сообщения
      if (g.toastT > 0) g.toastT -= dt;
      else if (P.events.length && (g.phase === 'play' || g.phase === 'lose' || g.phase === 'wait')) {
        g.toast = P.events.shift();
        g.toastT = 2.2;
        if (g.toast.kind >= 3) api.sfx('win');
      }

      const ph = g.phase;
      const tgt = ph === 'play' || ph === 'lose' || ph === 'wait'
        ? clamp(Math.max(0.2 + 0.1 * (Math.max(1, g.wave) - g.startWave), idleDark() * 0.85), 0.2, 0.9)
        : ph === 'intro' ? Math.min(0.95, idleDark() + 0.08) : idleDark();
      const dr = 0.2 * dt;
      g.dark += clamp(tgt - g.dark, -dr, dr);
      const hudT = ph === 'play' || ph === 'lose' || ph === 'wait' ? 1 : 0;
      g.hud += clamp(hudT - g.hud, -dt * 3, dt * 3);

      const frozen = ph === 'play' && g.panel;
      if (!frozen) {
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
      }
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

      if (!frozen) {
        for (let i26 = 0; i26 < arrows.length; i26++) { const a = arrows[i26];
          if (!a.on) continue;
          a.vy += 140 * dt;
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          if (a.y > H || a.x < -8) { a.on = false; continue; }
          const z = hitTest(a.x, a.y, 1, true);
          if (z) {
            a.on = false;
            if (z.T.shield && z.mode === 'play') { burst(a.x, a.y, 3, C_WOOD, 14); continue; }
            damage(z, a.dmg * (z.T.armor || 1), 3, false);
          } else if (a.y > LANE_TOP + LANE_H + 2) {
            a.on = false;
            burst(a.x, a.y, 2, C_ARROWHIT, 8);
          }
        }
        for (let i = 0; i < bolts.length; i++) { const b = bolts[i];
          if (!b.on) continue;
          b.vy += 140 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x >= WALL_X - 1) {
            b.on = false;
            burst(WALL_X, b.y, 8, C_POT, 22);
            if (g.phase === 'play') hurtWall(b.dmg);
          } else if (b.y > H) b.on = false;
        }
      }

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
        else if (ph === 'wait' && (g.sawOver || g.pt > 1.5)) startIntro(); // хост мог сразу перезапустить
      } else if (m === 'idle') {
        if (ph === 'intro' || ph === 'play' || ph === 'lose' || ph === 'wait') startOutro();
      }
    };

    // ---------- отрисовка ----------
    let ZX = 0, ZD = 1;
    const zr = (ox, y, w, h) => ctx.fillRect(ZD > 0 ? ZX + ox : ZX - ox - w + 1, y, w, h);

    let shK = 0, shFl = false, silh = false;
    const zc = (c) => (silh ? '#120c08' : shFl ? '#ffffff' : rgbMix(c, NIGHTC, shK));

    const drawZombie = (z, dark) => {
      const T = z.T;
      const s = T.s;
      ZX = Math.round(z.x);
      ZD = z.dir;
      const y = Math.round(z.y - z.hop);
      shFl = z.flash > 0;
      shK = dark * 0.45;
      const ga = ctx.globalAlpha;
      if (z.type === 'ghost' && !silh) ctx.globalAlpha = ga * (z.ghost ? 0.35 : 0.85);
      const moving = !z.atk && z.kb <= 0 && z.mode !== 'scared' && !(z.mode === 'stand' && Math.abs(z.hx - z.x) <= 0.5) && !(z.mode === 'horde' && Math.abs(z.hx - z.x) <= 0.6 && g.pt < g.introTp) && !(z.type === 'witch' && z.mode === 'play' && z.x >= z.stopX);
      const step = moving ? Math.floor((g.t * (z.type === 'fast' || z.mode === 'flee' ? 9 : 4) + z.phase) % 2) : 0;
      const bob = z.atk ? Math.round(Math.sin(g.t * 10 + z.phase)) : z.mode === 'stand' ? Math.round(Math.sin(g.t * 1.5 + z.phase) * 0.6) : 0;
      const armsUp = z.mode === 'scared' || z.mode === 'flee';
      if (!silh) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(ZX - 3 * s, Math.round(z.y) + 1, 8 * s, 1);
      }
      if (z.type === 'fast') {
        const y0 = y - 10;
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
        ctx.fillStyle = silh ? '#120c08' : shFl ? '#ffffff' : '#c02020';
        zr(1, y0 + 1, 1, 1);
      } else if (z.type === 'witch') {
        const y0 = y - 12;
        ctx.fillStyle = zc(Z_WITCHD);
        zr(-2, y0 + 5, 6, 7);
        ctx.fillStyle = zc(Z_WITCH);
        zr(-2, y0 + 4, 5, 6);
        ctx.fillStyle = zc(Z_SKIN);
        zr(-1, y0, 4, 4);
        ctx.fillStyle = zc(Z_ROBED);
        zr(-3, y0 - 1, 7, 1);
        zr(-1, y0 - 3, 4, 2);
        zr(0, y0 - 5, 2, 2);
        // зелье в руке
        const lift = z.mode === 'play' && z.x >= z.stopX && z.act < 0.5 ? -3 : 0;
        ctx.fillStyle = zc(Z_SKIN);
        zr(3, y0 + 5 + lift, 2, 1);
        ctx.fillStyle = zc(POTION);
        zr(4, y0 + 3 + lift, 2, 2);
        ctx.fillStyle = silh ? '#120c08' : shFl ? '#ffffff' : '#ffe040';
        zr(2, y0 + 1, 1, 1);
      } else {
        const big = s > 1;
        const y0 = y - 12 * s;
        let shirt = Z_SHIRT, shirtD = Z_SHIRTD, skin = Z_SKIN, skinD = Z_SKIND;
        if (z.type === 'ghost') { shirt = Z_PALES; shirtD = Z_PALED; skin = Z_PALE; skinD = Z_PALED; }
        else if (z.type === 'bomber' || z.type === 'giant') { shirt = Z_BROWN; shirtD = Z_BROWND; }
        else if (z.type === 'necro') { shirt = Z_ROBE; shirtD = Z_ROBED; }
        else if (z.type === 'jumper') shirt = Z_FSHIRT;
        if (z.type === 'giant') { skin = Z_GSKIN; skinD = Z_GSKIND; }
        ctx.fillStyle = zc(z.type === 'necro' ? Z_ROBED : Z_LEG);
        const lb = z.type === 'jumper' && z.hop > 1 ? 1 : 0;
        zr(-s + (step ? s : 0), y0 + 10 * s, s, 2 * s - lb);
        zr(s - (step ? s : 0), y0 + 10 * s, s, 2 * s - lb);
        ctx.fillStyle = zc(shirt);
        zr(-2 * s, y0 + 4 * s, 5 * s, 7 * s);
        ctx.fillStyle = zc(shirtD);
        zr(-2 * s, y0 + 9 * s, 5 * s, 2 * s);
        ctx.fillStyle = zc(skin);
        if (z.type !== 'necro') {
          zr(-s, y0 + 6 * s, s, s);
          zr(s, y0 + 8 * s, s, s);
        }
        if (armsUp) {
          zr(2 * s, y0 + s, s, 3 * s);
          zr(-2 * s, y0 + s, s, 3 * s);
        } else if (z.type !== 'bomber') {
          zr(2 * s, y0 + 5 * s + bob * s, 3 * s, s);
          ctx.fillStyle = zc(skinD);
          zr(2 * s, y0 + 6 * s + bob * s, 2 * s, s);
        }
        ctx.fillStyle = zc(skin);
        zr(-s, y0, 4 * s, 4 * s);
        ctx.fillStyle = zc(skinD);
        zr(-s, y0 + 3 * s, 4 * s, s);
        zr(-s, y0, s, s);
        ctx.fillStyle = silh ? '#120c08' : shFl ? '#ffffff' : z.type === 'ghost' ? '#4080c0' : '#c02020';
        zr(2 * s, y0 + s, s, s);
        // снаряжение
        if (z.type === 'armor' || z.type === 'ram') {
          ctx.fillStyle = zc(PLATE);
          zr(-s - (big ? 1 : 0), y0 - s, 5 * s, s);
          zr(-s, y0, s, 2 * s);
          zr(-2 * s, y0 + 4 * s, 5 * s, 3 * s);
          ctx.fillStyle = zc(PLATED);
          zr(-2 * s, y0 + 6 * s, 5 * s, s);
        }
        if (z.type === 'bomber') {
          // бочка над головой
          ctx.fillStyle = zc(Z_SKIN);
          zr(-2, y0 - 2, 1, 3);
          zr(3, y0 - 2, 1, 3);
          ctx.fillStyle = zc(BARREL);
          zr(-2, y0 - 7, 6, 5);
          ctx.fillStyle = zc(BARRELD);
          zr(-2, y0 - 6, 6, 1);
          zr(-2, y0 - 4, 6, 1);
          if (!silh && Math.floor(g.t * 10 + z.phase) % 2) { ctx.fillStyle = '#ffd040'; zr(1, y0 - 9, 1, 2); }
        }
        if (z.type === 'shield') {
          ctx.fillStyle = zc(SHIELDD);
          zr(4, y0 + 3, 3, 9);
          ctx.fillStyle = zc(SHIELDC);
          zr(5, y0 + 4, 2, 7);
          ctx.fillStyle = zc(PLATE);
          zr(5, y0 + 7, 2, 1);
        }
        if (z.type === 'giant') {
          // дубина
          ctx.fillStyle = zc(BARRELD);
          const up = z.atk ? Math.round(Math.sin(g.t * 6) * 3) : 0;
          zr(5 * s, y0 + 2 * s - up, 2, 4 * s);
          zr(5 * s - 1, y0 + s - up, 4, 4);
        }
        if (z.type === 'necro') {
          ctx.fillStyle = zc(GOLD);
          zr(-s, y0 - s, 4 * s, s);
          zr(-s, y0 - 2 * s, 1, s);
          zr(s, y0 - 2 * s, 1, s);
          zr(3 * s - 1, y0 - 2 * s, 1, s);
          ctx.fillStyle = zc(BARRELD);
          zr(5 * s, y0 - 2 * s, 1, 14 * s);
          ctx.fillStyle = silh ? '#120c08' : rgbStr(90, 230, 130, 0.7 + 0.3 * Math.sin(g.t * 5));
          zr(5 * s - 1, y0 - 4 * s, 3, 3);
        }
        if (z.type === 'ram') {
          // таран-бревно
          ctx.fillStyle = zc(BARREL);
          zr(3 * s, y0 + 5 * s, 9 * s, 2 * s);
          ctx.fillStyle = zc(IRON);
          zr(12 * s - 2, y0 + 5 * s, 2, 2 * s);
        }
      }
      ctx.globalAlpha = ga;
      if (!silh && z.hp < z.max && z.mode === 'play' && !z.T.boss) {
        const bw = 12;
        const bx = ZX - 5;
        const by = y + T.box.t - 3;
        ctx.fillStyle = 'rgba(20,10,10,0.8)';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#e04848';
        ctx.fillRect(bx + 1, by + 1, Math.max(1, Math.round((bw - 2) * clamp(z.hp / z.max, 0, 1))), 1);
      }
    };

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
      if (a.robe === 2) { ctx.fillStyle = rgbMix(G_LEG, NIGHTC, k); vr(-2, yy + 6, 2, 4); }
      ctx.fillStyle = rgbMix(SKIN, NIGHTC, k);
      vr(-1, yy, 4, 4);
      if (a.kind === 0) { ctx.fillStyle = rgbMix(NOSE, NIGHTC, k); vr(-2, yy + 2, 1, 2); }
      ctx.fillStyle = rgbMix(EYE, NIGHTC, k);
      vr(-1, yy + 1, 1, 1);
      if (a.emoteT > 0 && a.emote === 3) vr(-1, yy + 3, 2, 1);
      ctx.fillStyle = rgbMix(HATS[a.robe], NIGHTC, k);
      if (a.robe === 0) { vr(-3, yy - 1, 8, 1); vr(-1, yy - 2, 4, 1); }
      else if (a.robe === 3) { vr(-1, yy - 1, 4, 1); vr(2, yy, 1, 3); }
      else if (a.robe === 2) vr(-1, yy - 1, 4, 1);
      else if (a.kind === 1) { vr(-2, yy - 1, 6, 1); vr(-1, yy - 2, 4, 1); }
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

    const OG_TOP = 124, OG_BOT = 171;
    const drawOuterGate = (wood, woodD, dark) => {
      const x = OUTER_X;
      const sh = g.phase === 'intro' && g.og > 0 && g.pt > 0.9 && g.pt < g.introTp ? Math.round(Math.sin(g.t * 45)) : 0;
      ctx.fillStyle = woodD;
      ctx.fillRect(x - 5, OG_TOP - 8, 2, OG_BOT - OG_TOP + 8);
      ctx.fillRect(x - 5, OG_TOP - 8, 5, 1);
      const f = 0.8 + 0.2 * Math.sin(g.t * 6);
      ctx.fillStyle = rgbStr(255, 200 * f, 90);
      ctx.fillRect(x - 2, OG_TOP - 6, 2, 3);
      ctx.fillStyle = rgbStr(255, 190, 90, 0.06 + 0.12 * dark);
      ctx.fillRect(x - 8, OG_TOP - 12, 13, 13);
      const full = OG_BOT - OG_TOP;
      const hgt = Math.round(full * clamp(g.og, 0, 1));
      for (let i = 0; i < 3; i++) {
        const px = x - 2 + i * 2 + sh;
        const jag = g.og < 0.99 ? (i === 1 ? 3 : i === 2 ? -2 : 0) : 0;
        const ph = clamp(hgt + jag, 0, full);
        const top = OG_BOT - ph;
        ctx.fillStyle = i === 1 ? woodD : wood;
        if (ph > 0) ctx.fillRect(px, top, 2, ph);
        if (g.og >= 0.99) ctx.fillRect(px, top - 1, 1, 1);
      }
      if (hgt > 6) {
        ctx.fillStyle = rgbMix(IRON, NIGHTC, dark * 0.5);
        const b1 = OG_BOT - 8, b2 = OG_BOT - Math.round(full * 0.7);
        ctx.fillRect(x - 3 + sh, b1, 8, 1);
        if (OG_BOT - hgt < b2) ctx.fillRect(x - 3 + sh, b2, 8, 1);
      }
      if (g.og < 0.99 && hgt > 4) {
        ctx.fillStyle = 'rgba(20,12,8,0.85)';
        ctx.fillRect(x - 1 + sh, OG_BOT - hgt + 2, 1, 4);
        ctx.fillRect(x + 2 + sh, OG_BOT - hgt + 5, 1, 3);
      }
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
      const up = UP();
      const vl = villageLevel(up);
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
      const mx = 196, my = 16;
      ctx.fillStyle = rgbMix(MOON0, MOON1, dark, 0.25);
      ctx.fillRect(mx - 3, my - 3, 16, 16);
      ctx.fillStyle = rgbMix(MOON0, MOON1, dark);
      ctx.fillRect(mx, my, 10, 10);
      ctx.fillStyle = rgbMix(MOOND0, MOOND1, dark);
      ctx.fillRect(mx + 3, my + 2, 3, 2);
      ctx.fillRect(mx + 6, my + 6, 2, 2);
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
          ctx.fillRect(311, y - 12, 4, 8);
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
        // флажки на крышах — по уровню деревни
        if (vl >= 3 + h * 3) {
          ctx.fillStyle = rgbMix(WOOD0, NIGHTC, dark * 0.6);
          ctx.fillRect(hx + (hw >> 1), y - rh - 6, 1, 6);
          ctx.fillStyle = rgbMix(BANNER, NIGHTC, dark * 0.5);
          const fl = Math.floor(g.t * 3 + h) % 2;
          ctx.fillRect(hx + (hw >> 1) + 1, y - rh - 6, 4 - fl, 2);
          ctx.fillRect(hx + (hw >> 1) + 1, y - rh - 4, 3 + fl, 1);
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
        const dx = DOORS_X[h];
        ctx.fillStyle = g.doorT[h] > 0 && dark > 0.3 ? rgbStr(255, 190, 90, 0.9) : rgbMix(WOOD0, NIGHTC, 0.3 + dark * 0.5);
        ctx.fillRect(dx - 2, base - 8, 4, 8);
      }
      for (let i33 = 0; i33 < smoke.length; i33++) { const s = smoke[i33];
        if (!s.on) continue;
        ctx.fillStyle = rgbStr(150, 150, 160, 0.35 * (1 - s.life / 6));
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 2 + (s.life > 3 ? 1 : 0), 2);
      }
      ctx.fillStyle = rgbMix(CRATE0, NIGHTC, dark * 0.6);
      ctx.fillRect(CRATE_X - 2, CRATE_Y - 5, 6, 5);
      ctx.fillRect(CRATE_X + 4, CRATE_Y - 4, 5, 4);
      ctx.fillStyle = rgbMix(CRATE1, NIGHTC, dark * 0.6);
      ctx.fillRect(CRATE_X - 2, CRATE_Y - 3, 6, 1);
      ctx.fillRect(CRATE_X + 4, CRATE_Y - 2, 5, 1);

      // помост, колокол, лучники
      const woodC = rgbMix(WOOD0, WOOD1, dark * 0.7);
      const woodDC = rgbStr(lerp(WOOD0[0], WOOD1[0], dark * 0.7) * 0.7, lerp(WOOD0[1], WOOD1[1], dark * 0.7) * 0.7, lerp(WOOD0[2], WOOD1[2], dark * 0.7) * 0.7);
      ctx.fillStyle = woodDC;
      for (let x = 258; x < 314; x += 14) ctx.fillRect(x, PLATFORM_Y + 2, 2, GROUND + 4 - PLATFORM_Y);
      ctx.fillRect(316, PLATFORM_Y - 16, 1, 16);
      ctx.fillRect(311, PLATFORM_Y - 16, 6, 1);
      // навес-башня над помостом при 3+ лучниках
      if (up[1] >= 3) {
        ctx.fillStyle = woodDC;
        ctx.fillRect(256, PLATFORM_Y - 22, 1, 22);
        ctx.fillStyle = rgbMix(ROOF0, ROOF1, dark * 0.7);
        for (let i = 0; i < 4; i++) ctx.fillRect(253 + i * 2, PLATFORM_Y - 24 - i, 58 - i * 4, 1);
      }
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
      for (let i34 = 0; i34 < MAX_SLOTS; i34++) { const gd = guards[i34]; if (gd.on) drawGuard(gd.x, gd.rec, gd.step, dark); }
      if (sentry.on) {
        drawGuard(sentry.x, sentry.rec, sentry.step, dark);
        if (sentry.emoteT > 0 && sentry.emote === 1) {
          ctx.fillStyle = 'rgba(42,26,16,0.85)';
          ctx.fillRect(Math.round(sentry.x) - 3, PLATFORM_Y - 24, 8, 8);
          drawText(ctx, '!', Math.round(sentry.x), PLATFORM_Y - 22, '#ffe070');
        }
      }

      // заборы и шипы (улучшение «Ловушки»)
      const nf = fenceCount(up);
      const spikes = spikeDps(up) > 0;
      for (let i = 0; i < nf; i++) {
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
          if (spikes) {
            ctx.fillStyle = rgbMix(SPEAR, NIGHTC, dark * 0.5);
            ctx.fillRect(fx - 7, by - 1, 1, 2);
            ctx.fillRect(fx - 9, by, 1, 1);
            ctx.fillRect(fx + 8, by - 1, 1, 2);
          }
        }
      }
      drawOuterGate(woodC, woodDC, dark);

      if (dark > 0.45 && g.phase !== 'play') {
        for (let i35 = 0; i35 < ffl.length; i35++) { const f = ffl[i35];
          const b = 0.5 + 0.5 * Math.sin(g.t * f.v * 2 + f.p * 3);
          const fx = Math.round(f.x + Math.sin(g.t * 0.4 * f.v + f.p) * 10), fy = Math.round(f.y + Math.sin(g.t * 0.7 + f.p) * 4);
          ctx.fillStyle = rgbStr(255, 240, 120, (dark - 0.45) * 1.6 * b);
          ctx.fillRect(fx, fy, 1, 1);
        }
      }

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

      // частокол с воротами (каменное основание при прокачке)
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
      if (up[0] >= 3) {
        const stn = rgbMix(STONE0, STONE1, sk);
        const stnD = rgbMix(STONE0, BLACK, 0.3 + sk * 0.5);
        ctx.fillStyle = stn;
        ctx.fillRect(WALL_X - 1, GATE_Y1, 12, H - GATE_Y1);
        ctx.fillRect(WALL_X - 1, 120, 12, GATE_Y0 - 120);
        ctx.fillStyle = stnD;
        for (let yy = 122; yy < GATE_Y0; yy += 4) ctx.fillRect(WALL_X - 1 + ((yy >> 2) % 2) * 3, yy, 12 - 3, 1);
        for (let yy = GATE_Y1 + 2; yy < H; yy += 4) ctx.fillRect(WALL_X - 1, yy, 12, 1);
      }
      ctx.fillStyle = stD;
      ctx.fillRect(WALL_X, 112, 10, 1);
      if (up[0] >= 6) {
        ctx.fillStyle = rgbMix(IRON, NIGHTC, dark * 0.5);
        ctx.fillRect(WALL_X, 104, 10, 1);
        ctx.fillRect(WALL_X, 116, 10, 1);
      }
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
        if (up[0] >= 6) ctx.fillRect(WALL_X, gy0 + 13, 10, 1);
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
      const tf = 0.75 + 0.25 * Math.sin(g.t * 11) * Math.sin(g.t * 4.3);
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(WALL_X - 2, 120, 1, 6);
      ctx.fillStyle = rgbStr(255, 180 * tf, 60);
      ctx.fillRect(WALL_X - 3, 117, 3, 3);
      ctx.fillStyle = rgbStr(255, 170, 70, 0.12 + 0.12 * dark * tf);
      ctx.fillRect(WALL_X - 12, 108, 20, 20);

      ctx.fillStyle = '#e8e2d4';
      for (let i38 = 0; i38 < arrows.length; i38++) { const a = arrows[i38];
        if (!a.on) continue;
        const sp = Math.hypot(a.vx, a.vy) || 1;
        const ux = a.vx / sp, uy = a.vy / sp;
        for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(a.x - ux * k), Math.round(a.y - uy * k), 1, 1);
      }
      for (let i = 0; i < bolts.length; i++) { const b = bolts[i];
        if (!b.on) continue;
        ctx.fillStyle = '#60e080';
        ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
        ctx.fillStyle = '#e8f8e8';
        ctx.fillRect(Math.round(b.x), Math.round(b.y) - 2, 1, 1);
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

      const hud = clamp(g.hud, 0, 1);
      if (hud <= 0.01) return;
      ctx.globalAlpha = hud;
      drawHud();
      ctx.globalAlpha = 1;
    };

    // ---------- HUD ----------
    const box = (x, y, w, h, a) => { ctx.fillStyle = rgbStr(16, 10, 8, a); ctx.fillRect(x, y, w, h); };
    const drawHud = () => {
      const pr = P.p;
      const up = pr.up;
      box(2, 2, 160, 11, 0.55);
      drawIcon(ctx, 'heart', 4, 4);
      ctx.fillStyle = '#2a1414';
      ctx.fillRect(13, 5, 42, 5);
      const hpw = Math.round(40 * clamp(g.hp / g.maxHp, 0, 1));
      ctx.fillStyle = g.hp < g.maxHp * 0.3 ? (Math.floor(g.t * 6) % 2 ? '#ff5050' : '#b02a2a') : '#e04848';
      ctx.fillRect(14, 6, hpw, 3);
      drawIcon(ctx, 'emerald', 60, 3);
      drawInt(ctx, pr.em, 67, 5, '#8af0a8');
      const ex = 67 + intWidth(pr.em) + 5;
      drawIcon(ctx, 'skull', ex, 4);
      drawInt(ctx, g.kills, ex + 9, 5, '#e8e2d4');
      const fx = ex + 9 + intWidth(g.kills) + 5;
      drawSprite(ctx, FLAG, fx, 4);
      drawInt(ctx, g.wave, fx + 7, 5, '#ffb0a0');
      if (P.author) {
        ctx.fillStyle = '#ff6ab0';
        ctx.fillRect(fx + 9 + intWidth(g.wave), 3, 9, 8);
        drawLabel(ctx, 'A', fx + 11 + intWidth(g.wave), 5, '#ffffff');
      }
      // рубеж и уровень деревни
      box(2, 14, 74, 9, 0.4);
      drawLabel(ctx, 'РУБЕЖ', 4, 16, '#8fb0c8');
      drawInt(ctx, pr.ckpt, 30, 16, '#cfe8ff');
      drawLabel(ctx, 'СЕЛО', 44, 16, '#c8b890');
      drawInt(ctx, villageLevel(up), 64, 16, '#ffe070');

      const sc = score();
      const scw = intWidth(sc, 2);
      drawInt(ctx, sc, W - 6 - scw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawInt(ctx, sc, W - 6 - scw, 5, '#ffffff', 2);
      const best = Math.max(0, Math.floor(api.best || 0));
      const bw = intWidth(best);
      drawInt(ctx, best, W - 6 - bw, 18, '#ffe070');
      drawIcon(ctx, 'trophy', W - 6 - bw - 10, 17);

      // задания дня
      if (pr.d) {
        const d = pr.d;
        const x0 = W - 104;
        box(x0 - 2, 27, 104, 26, 0.5);
        for (let i = 0; i < 3; i++) {
          const tk = d.l[i];
          if (!tk) continue;
          const y = 29 + i * 8;
          const done = d.c[i];
          drawSprite(ctx, D_ICON[tk[0]] || D_ICON[0], x0, y);
          let x = x0 + 8;
          if (done) { drawSprite(ctx, CHECK, x, y + 1); x += 7; }
          else {
            x += drawInt(ctx, tk[3], x, y, '#e8e2d4') + 1;
            x += drawText(ctx, '/', x, y, '#8a7a70') + 1;
            x += drawInt(ctx, tk[2], x, y, '#c8b890') + 4;
          }
          const lbl = tk[0] === 1 ? (TYPES[MOB_IDS[tk[1]]] ? TYPES[MOB_IDS[tk[1]]].name : '') : D_LABEL[tk[0]];
          drawLabel(ctx, lbl, x, y, done ? '#60e070' : '#c8b8a8');
        }
      }

      // босс
      if (g.boss && g.boss.on && g.phase === 'play') {
        const b = g.boss;
        box(100, 26, 120, 12, 0.6);
        const nm = b.T.name;
        drawLabel(ctx, nm, 160 - (labelWidth(nm) >> 1), 27, '#ffb0a0');
        ctx.fillStyle = '#2a1414';
        ctx.fillRect(104, 33, 112, 3);
        ctx.fillStyle = '#e04848';
        ctx.fillRect(104, 33, Math.round(112 * clamp(b.hp / b.max, 0, 1)), 3);
      }

      if (g.phase === 'play' && g.mode === 'play' && g.banner > 0 && !g.panel) {
        const a = Math.min(1, g.banner * 2);
        box(110, 50, 100, g.bossDue || (g.boss && g.boss.on) || bossFor(g.wave) ? 34 : 26, 0.5 * a);
        drawSprite(ctx, FLAG, 128, 55, 3);
        drawInt(ctx, g.wave, 150, 55, '#ffb0a0', 3);
        if (bossFor(g.wave)) {
          const nm = TYPES[bossFor(g.wave)].name;
          drawLabel(ctx, 'БОСС: ', 124, 76, '#ff8070');
          drawLabel(ctx, nm, 124 + labelWidth('БОСС: '), 76, '#ffe070');
        }
      }

      if (g.phase === 'play' && g.mode === 'shop' && !g.panel) drawShop();
      // книга
      if (g.phase === 'play') {
        box(BOOK_X - 1, BOOK_Y - 1, 13, 11, g.panel ? 0.9 : 0.55);
        drawSprite(ctx, BOOK, BOOK_X + 2, BOOK_Y + 1);
      }
      if (g.toast && g.toastT > 0) {
        const a = clamp(g.toastT * 3, 0, 1) * clamp((2.2 - g.toastT) * 5, 0, 1);
        const tw = labelWidth(g.toast.text);
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * a;
        box(160 - (tw >> 1) - 4, 166, tw + 8, 11, 0.8);
        drawLabel(ctx, g.toast.text, 160 - (tw >> 1), 169, g.toast.color);
        ctx.globalAlpha = ga;
      }
      if (g.phase === 'play' && g.panel) drawAlbum();
    };

    const drawShop = () => {
      const pr = P.p;
      box(8, 56, 304, 98, 0.8);
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(8, 56, 304, 1);
      ctx.fillRect(8, 153, 304, 1);
      drawIcon(ctx, 'clock', 12, 60);
      drawInt(ctx, Math.ceil(g.shopT), 21, 61, '#e8e2d4');
      drawLabel(ctx, 'ЛАВКА ДЕРЕВНИ', 34, 61, '#ffe070');
      drawIcon(ctx, 'emerald', 250, 59);
      drawInt(ctx, pr.em, 257, 61, '#8af0a8');
      for (let i = 0; i < 8; i++) {
        const x = cardX(i), y = CARD_Y;
        const ok = canBuy(i);
        ctx.fillStyle = i === 7 ? 'rgba(60,110,60,0.9)' : ok ? 'rgba(90,64,40,0.95)' : 'rgba(50,40,36,0.9)';
        ctx.fillRect(x, y, CARD_W, CARD_H);
        ctx.fillStyle = ok ? '#c8a060' : '#5a4a40';
        ctx.fillRect(x, y, CARD_W, 1);
        ctx.fillRect(x, y + CARD_H - 1, CARD_W, 1);
        drawInt(ctx, i + 1, x + 2, y + 2, 'rgba(255,255,255,0.5)');
        const cx = x + (CARD_W >> 1);
        if (i < 6) {
          const u = UPGRADES[i];
          drawSprite(ctx, UPG_ICON[i], cx - 7, y + 8, 2);
          const nw = labelWidth(u.name);
          drawLabel(ctx, u.name, cx - (nw >> 1), y + 26, '#e8e2d4');
          let lx = cx - ((intWidth(pr.up[i]) + intWidth(u.max) + 5) >> 1);
          lx += drawInt(ctx, pr.up[i], lx, y + 35, '#ffe070') + 1;
          lx += drawText(ctx, '/', lx, y + 35, '#8a7a70') + 1;
          drawInt(ctx, u.max, lx, y + 35, '#8a7a70');
          const pr2 = upgradePrice(pr, i);
          if (pr2 < 0) drawLabel(ctx, 'МАКС', cx - (labelWidth('МАКС') >> 1), y + 62, '#8a7a70');
          else {
            const pw = intWidth(pr2) + 7;
            drawIcon(ctx, 'emerald', cx - (pw >> 1), y + 60);
            drawInt(ctx, pr2, cx - (pw >> 1) + 7, y + 62, ok ? '#8af0a8' : '#c06060');
          }
        } else if (i === 6) {
          drawIcon(ctx, HEAL_ICON, cx - 7, y + 9, 2);
          drawLabel(ctx, 'ЛЕЧИТЬ', cx - (labelWidth('ЛЕЧИТЬ') >> 1), y + 26, '#e8e2d4');
          drawText(ctx, '+', cx - 8, y + 35, '#ffb0b0');
          drawInt(ctx, healAmt(), cx - 4, y + 35, '#ffb0b0');
          if (g.hp >= g.maxHp) drawText(ctx, '100%', cx - 7, y + 62, '#8a7a70');
          else {
            const p3 = priceHeal();
            const pw = intWidth(p3) + 7;
            drawIcon(ctx, 'emerald', cx - (pw >> 1), y + 60);
            drawInt(ctx, p3, cx - (pw >> 1) + 7, y + 62, ok ? '#8af0a8' : '#c06060');
          }
        } else {
          drawSprite(ctx, NEXT, cx - 9, y + 10, 2);
          drawLabel(ctx, 'ВОЛНА', cx - (labelWidth('ВОЛНА') >> 1), y + 30, '#e8e2d4');
          drawSprite(ctx, FLAG, cx - 8, y + 42);
          drawInt(ctx, g.wave + 1, cx - 1, y + 43, '#ffffff');
          if (bossFor(g.wave + 1)) drawLabel(ctx, 'БОСС', cx - (labelWidth('БОСС') >> 1), y + 62, '#ff8070');
        }
      }
    };

    const ALB_Z = { zz: 1, on: true, isZ: true, type: 'normal', T: TYPES.normal, mode: 'stand', x: 0, y: 0, hp: 1, max: 1, spd: 0, flash: 0, kb: 0, atk: false, phase: 0, dir: 1, hx: 0, hs: 0, give: 9, act: 1, act2: 1, hop: 0, ghost: false, stopX: 999, summon: false };
    const drawAlbum = () => {
      const pr = P.p;
      box(AX, AY, AW, AH, 0.92);
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(AX, AY, AW, 1);
      ctx.fillRect(AX, AY + AH - 1, AW, 1);
      drawLabel(ctx, 'АЛЬБОМ ВРАГОВ', AX + 6, AY + 5, '#ffe070');
      let seen = 0;
      for (let i = 0; i < TYPE_IDS.length; i++) if (pr.alb[TYPE_IDS[i]]) seen++;
      let x = AX + 70;
      x += drawInt(ctx, seen, x, AY + 5, '#ffffff') + 1;
      x += drawText(ctx, '/', x, AY + 5, '#8a7a70') + 1;
      drawInt(ctx, TYPE_IDS.length, x, AY + 5, '#c8b890');
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(AX + AW - 12, AY + 3, 9, 8);
      drawText(ctx, 'x', AX + AW - 10, AY + 4, '#ffffff');
      for (let i = 0; i < TYPE_IDS.length; i++) {
        const id = TYPE_IDS[i];
        const T = TYPES[id];
        const cx = AX + 6 + (i % 6) * 48, cy = AY + 15 + Math.floor(i / 6) * 52;
        const n = pr.alb[id] || 0;
        ctx.fillStyle = i === g.sel ? 'rgba(120,90,50,0.9)' : T.boss ? 'rgba(70,30,26,0.85)' : 'rgba(46,36,28,0.85)';
        ctx.fillRect(cx, cy, 46, 50);
        ALB_Z.type = id; ALB_Z.T = T; ALB_Z.x = cx + 20 - (T.s > 2 ? 4 : 0); ALB_Z.y = cy + 40; ALB_Z.hp = ALB_Z.max = 1;
        silh = n === 0;
        drawZombie(ALB_Z, 0.1);
        silh = false;
        if (n) drawInt(ctx, n, cx + 2, cy + 43, '#c8b890');
        else if (!T.boss && T.from > pr.bestW) { drawLabel(ctx, 'В', cx + 2, cy + 43, '#6a5a50'); drawInt(ctx, T.from, cx + 8, cy + 43, '#6a5a50'); }
        else if (T.boss) { drawLabel(ctx, 'В', cx + 2, cy + 43, '#6a5a50'); drawInt(ctx, bossFirstWave(id), cx + 8, cy + 43, '#6a5a50'); }
      }
      // описание и итоги
      const id = TYPE_IDS[g.sel];
      const T = TYPES[id];
      const y = AY + AH - 19;
      if (pr.alb[id]) {
        let x2 = AX + 6;
        x2 += drawLabel(ctx, T.name, x2, y, T.boss ? '#ffb0a0' : '#e8e2d4') + 6;
        x2 += drawText(ctx, 'x', x2, y, '#8a7a70') + 2;
        drawInt(ctx, pr.alb[id], x2, y, '#ffffff');
      } else drawLabel(ctx, '???', AX + 6, y, '#8a7a70');
      // выбор стартовой волны
      ctx.fillStyle = 'rgba(90,64,40,0.95)';
      ctx.fillRect(START_X, y - 2, 64, 17);
      drawLabel(ctx, 'СТАРТ', START_X + 4, y + 4, '#c8b890');
      ctx.fillStyle = pr.start > 1 ? '#c8a060' : '#5a4a40';
      ctx.fillRect(START_X + 27, y + 1, 8, 11);
      drawText(ctx, '-', START_X + 29, y + 4, '#2a1a10');
      drawInt(ctx, pr.start, START_X + 38, y + 4, '#ffffff');
      ctx.fillStyle = pr.start < pr.ckpt ? '#c8a060' : '#5a4a40';
      ctx.fillRect(START_X + 54, y + 1, 8, 11);
      drawText(ctx, '+', START_X + 56, y + 4, '#2a1a10');
      let x3 = AX + 6;
      x3 += drawLabel(ctx, 'ВСЕГО', x3, y + 8, '#8a7a70') + 3;
      x3 += drawInt(ctx, pr.kills, x3, y + 8, '#e8e2d4') + 8;
      x3 += drawLabel(ctx, 'ЛУЧШАЯ ВОЛНА', x3, y + 8, '#8a7a70') + 3;
      drawInt(ctx, pr.bestW, x3, y + 8, '#ffb0a0');
    };

    // ---------- цикл ----------
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let shownPhase = '';
    let cursorOn = false;
    if (typeof api._debug === 'function') { try { api._debug({ g, P, zombies }); } catch (e) { /* тесты */ } }
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
      if (g.phase !== shownPhase) {
        shownPhase = g.phase;
        if (canvas.dataset) canvas.dataset.gamePhase = shownPhase;
        if (typeof api._phase === 'function') { try { api._phase(shownPhase); } catch (e) { /* отладка */ } }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (g.phase === 'play') P.save();
      if (canvas.dataset) delete canvas.dataset.gamePhase;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = prevCursor;
      canvas.style.touchAction = prevTouch;
    };
  }
};
