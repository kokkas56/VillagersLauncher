// Мини-игра «Рыбалка» и живой фон «Озеро».
// Фон (idle): причал на текущем озере игрока, старый рыбак сам спокойно рыбачит — забрасывает, ждёт,
// иногда вытаскивает рыбку и кидает в корзину. Утки, стрекозы (ночью — светлячки), дождь/облака,
// день/закат/ночь по реальным часам (api.env().dark).
// Вступление: игрок приходит по причалу, старик отдаёт удочку и садится на ящик.
// Игра — бесконечная: забросы без лимита, забег кончается, когда иссякают силы (термос ~3–5 мин).
// Прогресс (api.load/api.save): уровень рыболова, 4 озера × 3 места, 28 видов (4 легенды с особым
// вываживанием), альбом, снасти за монеты, 3 задания дня, награды лаунчера.
// Выход: игрок отдаёт удочку и улов старику, уходит; старик садится и рыбачит дальше.
// Всё рисуется целочисленными fillRect, цвета из кэша — без выделений памяти в кадре.

import { drawText, textWidth, drawIcon, rgbStr, rgbMix, drawLabel, labelWidth, drawInt, intWidth } from './pixfont.js';
import {
  sprite, drawSprite, drawSilhouette, SPECIES, LAKES, TIERS, SPOT_NAMES, BOOT, CHEST, MINNOW, UPGRADES, xpNeed, ALBUM_TOTAL, MAX_LVL
} from './fishing/data.js';
import { createProgress, albumCount, upgradePrice } from './fishing/progress.js';
import { createMeta } from './fishing/meta.js';
import { seasonOf, eventItem, eventGoal } from './fishing/season.js';
import { GAME_NAMES, rewardById } from './rewards.js';
const rewardName = (id) => { const r = rewardById(id); return r ? r.name : id; };

const W = 320;
const H = 180;
const HORIZON = 92;

const PIER_X = 232;
const DECK_Y = 118;
const SPOT_X = 246; // место рыбака (табурет)
const SEAT_X = 292; // ящик, где старик сидит, пока играешь ты
const BASKET_X = 300; // корзина старика
const BUCKET_X = 268; // ведро игрока
const EXIT_X = 336; // за правым краем
const MAN_Y = DECK_Y - 12;

const FAT_MAX = 100;
const FAT_CAST = 4;
const FAT_SEC = 0.15;
const CLOCK_SPEED = 0.01; // смена времени суток в игре: полный круг ~400 с

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- мелкие иконки HUD ----------
const IC = {
  book: sprite({ a: '#8a4a2a', b: '#e8dcc0', c: '#5a2a18' }, ['aaaaaaa', 'abbcbba', 'abbcbba', 'abbcbba', 'abbcbba', 'aaaaaaa']),
  bag: sprite({ a: '#a8723e', b: '#7a4e2a', c: '#ffd34a' }, ['..b.b..', '.b...b.', 'aaaaaaa', 'aaacaaa', 'aaaaaaa', '.aaaaa.']),
  map: sprite({ a: '#d8c890', b: '#5ab0e0', c: '#7a6a40', d: '#e04848' }, ['aaaaaaa', 'abbaaca', 'abbbada', 'aabbaaa', 'aaabbaa', 'aaaaaaa']),
  coin: sprite({ a: '#ffd34a', b: '#fff2a8', c: '#c8901e' }, ['.aaa.', 'abaac', 'abaac', 'aaaac', '.ccc.']),
  fish: sprite({ a: '#9ad0f0', b: '#5a90c0' }, ['.aaa.b', 'aaaaab', '.aaa.b']),
  star: sprite({ a: '#c070ff', b: '#f0d0ff' }, ['..a..', '.aba.', 'aaaaa', '.a.a.', 'a...a']),
  chain: sprite({ a: '#c0c8d0' }, ['aa.aa', 'a.a.a', 'aa.aa']),
  moon: sprite({ a: '#e8ecf8', b: '#9aa4c0' }, ['.aa.', 'aa..', 'aa..', 'aab.', '.aa.']),
  sun: sprite({ a: '#ffe070', b: '#ffb030' }, ['..a..', '.bab.', 'aabaa', '.bab.', '..a..']),
  dusk: sprite({ a: '#ff9a50', b: '#c05a50' }, ['.....', '.aaa.', 'aaaaa', 'bbbbb', '.....']),
  cloud: sprite({ a: '#d8dce4', b: '#a0a8b8' }, ['.aa..', 'aaaa.', 'aaaaa', 'bbbbb']),
  rain: sprite({ a: '#a0a8b8', b: '#7ab0e0' }, ['.aa..', 'aaaaa', 'b.b.b', '.b.b.']),
  pin: sprite({ a: '#5ab0e0' }, ['.a.', 'aaa', '.a.']),
  check: sprite({ a: '#60e070' }, ['....a', '...a.', 'a.a..', '.a...']),
  lock: sprite({ a: '#8a8070', b: '#5a5048' }, ['.aa.', 'a..a', 'bbbb', 'bbbb']),
  flask: sprite({ a: '#c0c8d0', b: '#e05a40' }, ['.aa.', 'abba', 'abba', 'abba', '.aa.']),
  gold: sprite({ a: '#ffd34a', b: '#c8901e' }, ['.a.', 'aab', '.b.']),
  ev: sprite({ a: '#c8a0ff', b: '#ffffff', c: '#7a50c0' }, ['..a..', '.aba.', 'aabaa', '.cac.', 'c...c'])
};
// поплавки мастерства: каждые 5 уровней — новый цвет (на забег выбирается случайный из открытых)
const BOB_COLS = ['#e04040', '#3a8ae0', '#40c060', '#c060e0', '#ff9a2a', '#f0f0f0'];
const BAND_GOLD = [230, 190, 60];
// опыт мастерства за улов по редкости (× множитель озера)
const XP_TIER = [2, 4, 10, 25, 150];
const UPG_ICON = [
  sprite({ a: '#a8723e', b: '#7a4e2a' }, ['......a', '.....a.', '....a..', '...a...', '..a....', '.b.....', 'b......']),
  sprite({ a: '#e8e8f0', b: '#9aa0b0' }, ['.aaa.', 'a...a', 'a.b.a', 'a...a', '.aaa.']),
  sprite({ a: '#9aa4b2', b: '#5e6878', c: '#2a2e36' }, ['.aaa.', 'abbba', 'abcba', 'abbba', '.aaa.']),
  sprite({ a: '#e0a060', b: '#a06030' }, ['..a..', '.aba.', 'aabaa', '.aba.', '..a..']),
  IC.flask
];
// подсказки снастей в две строки
const HINTS = UPGRADES.map((u) => { const i = u.hint.indexOf(' '); return i > 0 ? [u.hint.slice(0, i), u.hint.slice(i + 1)] : [u.hint, '']; });
const DIGIT_RE = /^(Digit|Numpad)[0-9]$/;
const PANELS = ['album', 'shop', 'map', 'event'];
const DAILY_LABEL = ['РЫБЫ', '', 'РЕДКИЕ', 'МОНЕТЫ', 'ПОДРЯД', 'НОЧЬЮ', ''];
const DAILY_ICON = [IC.fish, IC.fish, IC.star, IC.coin, IC.chain, IC.moon, IC.pin];

// палитры неба: день -> закат -> ночь (s = 0..2)
const DAY = { top: [96, 158, 226], bot: [196, 226, 246], sun: [255, 238, 170] };
const SET = { top: [74, 62, 132], bot: [250, 150, 90], sun: [255, 170, 90] };
const NIGHT = { top: [12, 16, 40], bot: [40, 40, 84], sun: [214, 222, 250] };
// облик озёр: вода, глубина, лес (день / закат / ночь)
const LOOKS = [
  { water: [[62, 120, 168], [92, 82, 120], [26, 34, 66]], deep: [[34, 76, 120], [40, 36, 70], [10, 14, 34]], hill: [[86, 128, 92], [52, 44, 66], [16, 20, 34]], trees: 'round' },
  { water: [[52, 112, 120], [74, 78, 100], [20, 34, 50]], deep: [[24, 66, 72], [32, 36, 56], [8, 16, 26]], hill: [[46, 92, 62], [38, 40, 52], [10, 18, 24]], trees: 'pine' },
  { water: [[70, 150, 190], [96, 100, 140], [24, 40, 72]], deep: [[30, 90, 140], [44, 46, 84], [8, 18, 40]], hill: [[70, 110, 96], [56, 50, 76], [16, 22, 38]], trees: 'mount' },
  { water: [[70, 100, 104], [84, 78, 96], [22, 30, 42]], deep: [[34, 56, 60], [40, 36, 56], [10, 14, 22]], hill: [[72, 104, 80], [52, 50, 62], [16, 22, 28]], trees: 'willow' }
];
const MTN_C = [[120, 136, 160], [96, 80, 110], [30, 34, 56]];

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SHADE = [30, 20, 40];
const GREY = [110, 116, 130];
const CLOUD_SET = [250, 190, 170];
const CLOUD_NIGHT = [70, 76, 110];
const PAD_C = [70, 140, 70], PAD_D = [40, 50, 50];
const FLOW_C = [240, 200, 220], FLOW_D = [160, 120, 140];
const REED_C = [96, 130, 60], REED_D = [40, 44, 40];
const CAT_C = [110, 70, 40], CAT_D = [40, 30, 30];
const WOOD_C = [150, 108, 66], WOOD_D = [70, 50, 50];
const ROD_C = [110, 76, 40], ROD_D = [50, 36, 30];
const BUCK_C = [120, 120, 130], BUCK_D = [60, 60, 70];
const BUCK2_C = [80, 80, 90], BUCK2_D = [40, 40, 50];
const WICK_C = [176, 128, 70], WICK_D = [70, 50, 40];
const LEG_C = [60, 44, 34];
const SKIN_C = [232, 190, 150];
const EYE_C = [40, 30, 30];
const OLD_SHIRT = [80, 110, 70], OLD_BELT = [60, 84, 52];
const YOU_SHIRT = [70, 100, 170], YOU_BELT = [50, 70, 128];
const HAT_C = [214, 180, 96], BAND_C = [160, 60, 50];
const HAIR_C = [96, 60, 34];
const DUCK_BODY = [150, 110, 70], DUCK_HEAD = [40, 110, 60], DUCK_WHITE = [230, 226, 210], DUCKLING = [240, 214, 90];
const DUCK_BEAK = [240, 150, 40];
const RUB_Y = [255, 216, 74];
const DRAGON = [60, 150, 220];
const ROCK_C = [110, 112, 120], ROCK_D = [40, 42, 52];
const SNAG_C = [80, 60, 44], SNAG_D = [30, 24, 24];
const CAPE_OLD = [190, 160, 60], CAPE_YOU = [60, 70, 90];
const FOG_C = [220, 226, 230];
const RGB_RB = [[255, 96, 96], [255, 176, 80], [255, 232, 96], [112, 224, 112], [96, 168, 255], [160, 112, 240]];

// панели
const PX = 16, PY = 16, PW = 288, PH = 150;
const BTN_Y = 165;
const BTN_X = [4, 19, 34, 49];

export default {
  id: 'fishing',
  title: 'Рыбалка',
  sceneTitle: 'Озеро',
  desc: 'Бесконечная рыбалка: 4 озера, 28 видов рыб, альбом, снасти и задания дня.',
  controls: 'Пробел / мышь: держи — сила заброса, клик — подсечка, держи — подмотка · Tab альбом · B лавка · M карта · E событие',
  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rand = Math.random;
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

    // ---------- прогресс ----------
    const P = createProgress(api);
    P.load();
    // ---------- событие месяца, мастерство, турнир ----------
    const MT = createMeta(api, { getP: () => P.p, push: P.push, isAuthor: () => P.author, variant, mul: () => P.mul(), goal: eventGoal });
    let SEA = seasonOf(MT.id);
    let EVI = eventItem(MT.id);
    const applyMeta = () => {
      const was = SEA;
      SEA = seasonOf(MT.id);
      EVI = eventItem(MT.id);
      P.bonus = MT.coinMul();
      if (!variant) { MT.chal(); MT.checkReward(true); }
      return was !== SEA;
    };
    applyMeta();
    P.onDaily = () => MT.addXp(15);

    // ---------- мир ----------
    const treeline = new Int16Array(Math.ceil(W / 3));
    const mtn = new Int16Array(Math.ceil(W / 2));
    const ripples = [];
    for (let i = 0; i < 26; i++) ripples.push({ rp: 1, x: rand() * W, y: HORIZON + 3 + rand() * (H - HORIZON - 6), w: 3 + Math.floor(rand() * 7), v: 2 + rand() * 4, p: rand() * 6 });
    const reeds = [];
    for (let i = 0; i < 24; i++) reeds.push({ on: false, x: 0, h: 0, p: 0 });
    const pads = [];
    for (let i = 0; i < 9; i++) pads.push({ on: false, x: 0, y: 0 });
    const rocks = [];
    for (let i = 0; i < 4; i++) rocks.push({ on: false, x: 0, y: 0, w: 0 });
    const clouds = [];
    for (let i = 0; i < 5; i++) clouds.push({ cl: 1, x: rand() * W, y: 10 + rand() * 40, w: 22 + rand() * 30, v: 1 + rand() * 2 });
    const stars = [];
    for (let i = 0; i < 40; i++) stars.push({ x: Math.floor(rand() * W), y: Math.floor(rand() * (HORIZON - 14)), p: rand() * 6, big: rand() > 0.9 });
    const drops = [];
    for (let i = 0; i < 44; i++) drops.push({ x: rand() * W, y: rand() * H, v: 90 + rand() * 60, gy: HORIZON + 4 + rand() * (H - HORIZON - 6) });
    const fogs = [];
    for (let i = 0; i < 4; i++) fogs.push({ x: rand() * W, y: HORIZON - 10 + i * 9, w: 90 + rand() * 80, v: 1.5 + rand() * 2 });
    let scene = { lake: -1, spot: -1, snag: false };

    const buildScene = (lake, spot) => {
      scene.lake = lake;
      scene.spot = spot;
      const look = LOOKS[lake];
      const R = Math.random;
      for (let i = 0; i < treeline.length; i++) {
        const x = i * 3;
        let h;
        if (look.trees === 'pine') h = 6 + (i % 4 === 1 ? 6 : i % 4 === 2 ? 9 : i % 4 === 3 ? 4 : 1) + Math.floor(3 * Math.sin(x / 31) + R() * 3);
        else if (look.trees === 'mount') h = 3 + (i % 3 === 1 ? 5 : 2) + Math.floor(R() * 2);
        else if (look.trees === 'willow') h = Math.floor(9 + 6 * Math.abs(Math.sin(x / 26)) + 2 * Math.sin(x / 9) + R() * 2);
        else h = Math.floor(4 + 4 * Math.sin(x / 23) + 3 * Math.sin(x / 7 + 1) + R() * 3) + 4;
        treeline[i] = HORIZON - 4 - h;
      }
      for (let i = 0; i < mtn.length; i++) {
        const x = i * 2;
        const a = 38 - Math.abs(((x + 30) % 120) - 60) * 0.9;
        const b = 30 - Math.abs(((x + 95) % 90) - 45) * 0.95;
        mtn[i] = HORIZON - 6 - Math.max(0, Math.round(Math.max(a, b)));
      }
      // камыш и кувшинки: больше на «Камышах», меньше на «Омуте»
      const nRL = spot === 1 ? 12 : spot === 2 ? 5 : 8;
      let k = 0;
      for (let i = 0; i < reeds.length; i++) reeds[i].on = false;
      for (let i = 0; i < nRL; i++) { const r = reeds[k++]; r.on = true; r.x = 2 + Math.floor(R() * (spot === 1 ? 60 : 34)); r.h = 10 + Math.floor(R() * 14); r.p = R() * 6; }
      for (let i = 0; i < 6; i++) { const r = reeds[k++]; r.on = true; r.x = 212 + Math.floor(R() * 16); r.h = 8 + Math.floor(R() * 10); r.p = R() * 6; }
      if (spot === 1) for (let i = 0; i < 5 && k < reeds.length; i++) { const r = reeds[k++]; r.on = true; r.x = 150 + Math.floor(R() * 40); r.h = 6 + Math.floor(R() * 8); r.p = R() * 6; }
      const nP = lake === 2 ? 0 : spot === 2 ? 2 : spot === 1 ? 5 : 4;
      for (let i = 0; i < pads.length; i++) pads[i].on = false;
      for (let i = 0; i < nP; i++) { const p = pads[i]; p.on = true; p.x = 20 + Math.floor(R() * 140); p.y = 150 + Math.floor(R() * 22); }
      if (nP) { pads[nP].on = true; pads[nP].x = 178; pads[nP].y = 138; }
      for (let i = 0; i < rocks.length; i++) rocks[i].on = false;
      if (lake === 2) for (let i = 0; i < 3; i++) { const r = rocks[i]; r.on = true; r.x = 30 + Math.floor(R() * 150); r.y = 130 + Math.floor(R() * 40); r.w = 5 + Math.floor(R() * 6); }
      scene.snag = spot === 2;
    };
    buildScene(P.p.lake, P.p.spot);

    // ---------- украшения события месяца (пулы — без выделений в кадре) ----------
    const fall = [];
    for (let i = 0; i < 40; i++) fall.push({ ef: 1, x: rand() * W, y: rand() * H, v: 8 + rand() * 10, p: rand() * 6, c: i % 3 });
    const deco = []; // на воде: свечи, льдины, венки, огоньки, призрак
    for (let i = 0; i < 6; i++) deco.push({ ed: 1, x: 0.5, y: 0.5, w: 4, v: 0.5, p: rand() * 6 });
    const birds = []; // грачи / летучие мыши
    for (let i = 0; i < 5; i++) birds.push({ eb: 1, x: rand() * W, y: 10 + rand() * 40, v: 10 + rand() * 8, p: rand() * 6 });
    const meteors = [];
    for (let i = 0; i < 3; i++) meteors.push({ em: 1, on: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, t: 0.5, big: false });
    const initDecor = () => {
      const id = MT.id;
      for (let i = 0; i < deco.length; i++) {
        const d = deco[i];
        d.p = rand() * 6;
        d.x = 10 + rand() * 200;
        d.y = HORIZON + 10 + rand() * 62;
        if (id === 'thaw') { d.w = 5 + Math.floor(rand() * 9); d.v = 2 + rand() * 2; }
        else if (id === 'kupala' || id === 'yule') { d.y = 108 + rand() * 60; d.w = 5; d.v = 1 + rand() * 1.5; }
        else { d.w = 2; d.v = 3 + rand() * 4; }
      }
      for (let i = 0; i < birds.length; i++) { const b = birds[i]; b.x = rand() * W; b.y = 8 + rand() * 40; }
      for (let i = 0; i < meteors.length; i++) meteors[i].on = false;
    };
    initDecor();


    const parts = [];
    for (let i = 0; i < 48; i++) parts.push({ fp: 1, on: false, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, life: 0.5, c: '#fff' });
    const puff = (x, y, n, c, sp = 20) => {
      for (let i2 = 0; i2 < parts.length; i2++) { const p = parts[i2];
        if (n <= 0) break;
        if (p.on) continue;
        p.on = true; p.x = x; p.y = y; p.vx = (rand() - 0.5) * sp * 2; p.vy = -rand() * sp - 10; p.life = 0.5 + rand() * 0.4; p.c = c;
        n--;
      }
    };
    // летящий улов (дуга): в корзину, в воду, или прыжок рыбки
    const flyers = [];
    for (let i = 0; i < 8; i++) flyers.push({ ff: 1, on: false, spr: MINNOW, x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5, h: 0.5, t: 0.5, dur: 1.5, delay: 0.5, dest: 0, flip: false });
    const toss = (spr, x0, y0, x1, y1, h, dur, dest, delay = 0) => {
      for (let i3 = 0; i3 < flyers.length; i3++) { const f = flyers[i3];
        if (f.on) continue;
        f.on = true; f.spr = spr; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.h = h; f.t = 0; f.dur = dur; f.dest = dest; f.delay = delay; f.flip = x1 < x0;
        return;
      }
    };
    const duck = { dk: 1, on: false, x: 0.5, y: 0.5, dir: 1, spd: 6.5, n: 0, dive: 0.5, next: 6 + rand() * 10 };
    const flies = [];
    for (let i = 0; i < 3; i++) flies.push({ fl: 1, x: 150 + rand() * 70, y: 100 + rand() * 30, tx: 0.5, ty: 0.5, hover: rand() * 2, p: rand() * 6 });
    for (let i4 = 0; i4 < flies.length; i4++) { const f = flies[i4]; f.tx = f.x; f.ty = f.y; }

    // ---------- персонажи ----------
    const old = { pa: 1, x: SPOT_X, dir: -1, tx: SPOT_X, spd: 46, sit: true, emote: 0, emoteT: 0, look: 0, step: 0 };
    const you = { pa: 1, x: EXIT_X, dir: -1, tx: EXIT_X, spd: 72, sit: false, emote: 0, emoteT: 0, look: 0, step: 0 };
    let holder = old;
    let passT = -1;
    let passTo = you;
    let basketN = 2;

    // ---------- состояние ----------
    const g = {
      phase: 'idle', // idle | intro | play | finish | wait | outro
      pt: 0, hold: 1.3, sawOver: false,
      t: 0, st: 'rest', timer: 2 + rand() * 2,
      score: 0, casts: 0, fat: FAT_MAX, fatMax: FAT_MAX, streak: 0, runFish: 0,
      power: 0, powDir: 1, npcPow: 0.5, npcReact: 0, npcHook: true,
      bob: { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0 },
      dist: 0, catchSp: null, nibble: 0, spooked: 0, spookCount: 0, goldCast: false,
      fish: 0.5, fishT: 0.5, fishTimer: 0, fishVis: 1, beh: 0, behT: 0, dashT: 0,
      zone: 0.1, zv: 0, prog: 0.3, thrash: 0,
      R: { speed: 0.5, jumpy: 0.6, zone: 0.3, gain: 0.3, drain: 0.2 },
      caughtN: 0, lastSpr: null, show: null, showSize: 0, showCoins: 0, showNew: false, overSent: false,
      sky: 0, clock: 0, hud: 0, jumpT: 5 + rand() * 8,
      wx: 0, wxT: 60, cloudK: 0, rainK: 0,
      panel: null, sel: 0, msel: 0, fade: 0, fadeTo: -1, fadeSpot: 0,
      toast: null, toastT: 0,
      evRun: 0, evT: 60, bobC: BOB_COLS[0], metT: 3, boltT: 3, boltX: 100, flash: 0, rainMem: 0
    };
    {
      const env = getEnv();
      g.sky = env ? clamp((env.dark || 0) * 2, 0, 2) : 0.3;
      g.clock = g.sky;
    }
    const pickWeather = () => {
      const r = rand();
      const rain = SEA.rain != null ? Math.max(SEA.rain, LAKES[scene.lake].rain) : LAKES[scene.lake].rain;
      g.wx = r < rain ? 2 : r < rain + 0.25 ? 1 : 0;
    };
    pickWeather();
    if (g.wx === 2 && rand() < 0.5) g.wx = 1;

    let held = false;
    let pressedEdge = false;
    const playing = () => g.phase === 'play';

    // ---------- панели ----------
    const openPanel = (name) => {
      if (!playing()) return;
      if (g.panel === name) { g.panel = null; api.sfx('click'); return; }
      g.panel = name;
      held = false;
      pressedEdge = false;
      if (name === 'map') g.msel = scene.lake * 3 + scene.spot;
      api.sfx('click');
    };
    const travel = (lake, spot) => {
      if (!P.lakeOpen(lake)) { api.sfx('hit'); return; }
      if (!P.spotOpen(lake, spot)) { api.sfx('hit'); return; }
      if (lake === scene.lake && spot === scene.spot) { g.panel = null; return; }
      P.setPlace(lake, spot);
      g.fadeTo = lake; g.fadeSpot = spot; g.fade = 0.001;
      g.panel = null;
      api.sfx('step');
    };
    const shopBuy = (i) => {
      if (i < 0 || i >= UPGRADES.length) return;
      if (P.buy(i)) { api.sfx('coin'); applyUpgrades(); } else api.sfx('hit');
    };
    const applyUpgrades = () => {
      const up = P.p.up;
      const prev = g.fatMax;
      g.fatMax = FAT_MAX * (1 + 0.12 * up[4]);
      if (g.fatMax > prev) g.fat += g.fatMax - prev;
    };

    // ---------- ввод ----------
    const press = () => {
      if (!playing()) return;
      if (!held) pressedEdge = true;
      held = true;
    };
    const release = () => { held = false; };
    const PT = { x: 0, y: 0 };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: W, height: H };
      PT.x = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
      PT.y = ((e.clientY - r.top) / Math.max(1, r.height)) * H;
      return PT;
    };
    const inR = (p, x, y, w, h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

    const KEYS = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1, NumpadEnter: 1 };
    const onKeyDown = (e) => {
      if (!playing()) return;
      const c = e.code;
      if (c === 'Tab' || c === 'KeyB' || c === 'KeyM' || c === 'KeyI' || c === 'KeyE') {
        e.preventDefault();
        if (e.repeat) return;
        openPanel(c === 'Tab' || c === 'KeyI' ? 'album' : c === 'KeyB' ? 'shop' : c === 'KeyE' ? 'event' : 'map');
        return;
      }
      if (P.author && (c === 'BracketRight' || c === 'BracketLeft')) {
        e.preventDefault();
        if (e.repeat) return;
        const d = c === 'BracketRight' ? 1 : -1;
        if (P.authorSkip(d)) { g.fadeTo = P.p.lake; g.fadeSpot = 0; g.fade = 0.001; applyUpgrades(); }
        return;
      }
      if (g.panel) {
        if (DIGIT_RE.test(c)) {
          const n = c.charCodeAt(c.length - 1) - 49;
          e.preventDefault();
          if (e.repeat || n < 0 || n > 8) return;
          if (g.panel === 'shop') shopBuy(n);
          else if (g.panel === 'map' && n < LAKES.length) travel(n, P.spotOpen(n, scene.spot) ? scene.spot : 0);
          return;
        }
        if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowDown' || c === 'ArrowUp' || c === 'KeyA' || c === 'KeyD' || c === 'KeyS' || c === 'KeyW') {
          e.preventDefault();
          const dx = c === 'ArrowLeft' || c === 'KeyA' ? -1 : c === 'ArrowRight' || c === 'KeyD' ? 1 : 0;
          const dy = c === 'ArrowUp' || c === 'KeyW' ? -1 : c === 'ArrowDown' || c === 'KeyS' ? 1 : 0;
          if (g.panel === 'album') g.sel = (g.sel + dx + dy * 7 + ALBUM_TOTAL) % ALBUM_TOTAL;
          else if (g.panel === 'map') g.msel = (g.msel + dx + dy * 3 + 12) % 12;
          return;
        }
        if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter' || c === 'Backspace') {
          e.preventDefault();
          if (e.repeat) return;
          if (g.panel === 'map' && c !== 'Backspace') travel(Math.floor(g.msel / 3), g.msel % 3);
          else g.panel = null;
        }
        return;
      }
      if (!KEYS[c]) return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    };
    const onKeyUp = (e) => {
      if (!KEYS[e.code]) return;
      if (playing()) e.preventDefault();
      release();
    };
    const onPointerDown = (e) => {
      if (!playing()) return;
      e.preventDefault();
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      const p = toLocal(e);
      // кнопки HUD
      for (let i = 0; i < 4; i++) if (inR(p, BTN_X[i] - 1, BTN_Y - 1, 14, 13)) { openPanel(PANELS[i]); return; }
      if (g.panel) { panelClick(p); return; }
      press();
    };
    const panelClick = (p) => {
      if (inR(p, PX + PW - 12, PY + 2, 10, 10) || !inR(p, PX, PY, PW, PH)) { g.panel = null; api.sfx('click'); return; }
      if (g.panel === 'album') {
        for (let i = 0; i < ALBUM_TOTAL; i++) {
          const col = i % 7, row = Math.floor(i / 7);
          if (inR(p, PX + 6 + col * 39, PY + 15 + row * 28, 38, 27)) { g.sel = i; api.sfx('click'); return; }
        }
      } else if (g.panel === 'shop') {
        for (let i = 0; i < UPGRADES.length; i++) if (inR(p, PX + 6 + i * 56, PY + 16, 52, 104)) { shopBuy(i); return; }
      } else if (g.panel === 'map') {
        for (let l = 0; l < LAKES.length; l++) for (let s = 0; s < 3; s++) {
          if (inR(p, PX + 120 + s * 55, PY + 22 + l * 31, 52, 14)) { g.msel = l * 3 + s; travel(l, s); return; }
        }
      }
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

    // ---------- удочка ----------
    const atSpot = (a) => Math.abs(a.x - SPOT_X) < 0.5 && Math.abs(a.tx - SPOT_X) < 0.5;
    const fishingPose = () => passT < 0 && atSpot(holder);
    const TIP = { tp: 1, x: 0, y: 0 };
    const BASE = { tp: 1, x: 0, y: 0 };
    const carryTip = (a, out) => { out.x = Math.round(a.x + 4 * a.dir); out.y = MAN_Y - 10 + (a.sit ? 2 : 0); };
    const carryBase = (a, out) => { out.x = Math.round(a.x + 2 * a.dir); out.y = MAN_Y + 7 + (a.sit ? 2 : 0); };
    const rodTip = () => {
      if (passT >= 0) {
        const from = passTo === you ? old : you;
        carryTip(from, TIP);
        const fx = TIP.x, fy = TIP.y;
        carryTip(passTo, TIP);
        const k = clamp(passT, 0, 1);
        TIP.x = Math.round(lerp(fx, TIP.x, k));
        TIP.y = Math.round(lerp(fy, TIP.y, k)) - Math.round(Math.sin(k * Math.PI) * 3);
        return TIP;
      }
      if (!fishingPose()) { carryTip(holder, TIP); return TIP; }
      const sy = holder.sit ? 2 : 0;
      if (g.st === 'charge') {
        const k = g.power;
        TIP.x = SPOT_X + 2 + Math.round(k * 6); TIP.y = MAN_Y - 18 - Math.round(k * 2) + sy;
      } else if (g.st === 'reel') {
        const hard = holder === you ? held : true;
        const sh = Math.round(Math.sin(g.t * 20) * (hard ? 1 : 0));
        TIP.x = SPOT_X - 10; TIP.y = MAN_Y - 10 + sh + (hard ? 2 : 0) + sy;
      } else {
        TIP.x = SPOT_X - 12; TIP.y = MAN_Y - 14 + sy;
      }
      return TIP;
    };
    const rodBase = () => {
      if (passT >= 0) {
        const from = passTo === you ? old : you;
        carryBase(from, BASE);
        const fx = BASE.x, fy = BASE.y;
        carryBase(passTo, BASE);
        const k = clamp(passT, 0, 1);
        BASE.x = Math.round(lerp(fx, BASE.x, k)); BASE.y = Math.round(lerp(fy, BASE.y, k));
        return BASE;
      }
      if (!fishingPose()) { carryBase(holder, BASE); return BASE; }
      BASE.x = SPOT_X + (g.st === 'charge' ? 3 : -3);
      BASE.y = DECK_Y - 6 + (holder.sit ? 2 : 0);
      return BASE;
    };
    const lineOut = () => g.st === 'fly' || g.st === 'wait' || g.st === 'bite' || g.st === 'reel' || g.st === 'retrieve';

    const launch = (d) => {
      g.dist = d;
      const tip = rodTip();
      g.bob.sx = tip.x; g.bob.sy = tip.y;
      g.bob.tx = Math.round(214 - d * 178);
      g.bob.ty = Math.round(146 - d * 44);
      g.bob.x = tip.x; g.bob.y = tip.y;
      g.timer = 0;
      g.st = 'fly';
      api.sfx('jump');
    };
    const stepFly = (dt, waitMin, waitRnd) => {
      g.timer += dt / (0.45 + g.dist * 0.4);
      const k = Math.min(1, g.timer);
      g.bob.x = lerp(g.bob.sx, g.bob.tx, k);
      g.bob.y = lerp(g.bob.sy, g.bob.ty, k) - Math.sin(k * Math.PI) * (30 + g.dist * 30);
      if (k >= 1) {
        g.st = 'wait';
        g.timer = waitMin + rand() * waitRnd;
        g.nibble = 0;
        g.spooked = 0;
        g.spookCount = 0;
        puff(g.bob.tx, g.bob.ty, 6, '#cfe8ff', 14);
        api.sfx('splash');
      }
    };
    const startRetrieve = () => {
      if (g.st === 'fly') { g.bob.tx = Math.round(g.bob.x); g.bob.ty = Math.round(g.bob.y); }
      g.bob.sx = g.bob.tx; g.bob.sy = g.bob.ty;
      g.st = 'retrieve';
      g.timer = 0;
    };
    const stepRetrieve = (dt) => {
      g.timer += dt / 0.4;
      const k = Math.min(1, g.timer);
      const tip = rodTip();
      g.bob.x = lerp(g.bob.sx, tip.x, k);
      g.bob.y = lerp(g.bob.sy, tip.y, k) - Math.sin(k * Math.PI) * 10;
      if (k >= 1) { g.st = 'rest'; g.timer = 1 + rand() * 2; }
    };

    const emote = (a, kind, time) => { a.emote = kind; a.emoteT = time; };

    // ---------- выбор улова ----------
    const tod = () => (g.sky < 0.6 ? 0 : g.sky < 1.4 ? 1 : 2);
    const legendOk = (s, td) => {
      const n = s.need;
      if (!n) return true;
      if (n.tod != null && n.tod !== td) return false;
      if (n.wx != null && n.wx !== g.wx) return false;
      if (n.spot != null && n.spot !== scene.spot) return false;
      return true;
    };
    const pickCatch = (d) => {
      const up = P.p.up;
      // особый улов события месяца (в испытание)
      const evc = (P.author ? 0.25 : 0.05) * (SEA.night && (tod() === 2 || g.wx === 2) ? 1.6 : 1);
      if (!variant && rand() < evc) return EVI;
      const r0 = rand();
      if (r0 < 0.07 * (1 - d * 0.5)) return BOOT;
      if (r0 < 0.07 * (1 - d * 0.5) + 0.025 + d * 0.025) return CHEST;
      const td = tod();
      const auth = P.author;
      let sum = 0;
      for (let pass = 0; pass < 2; pass++) {
        let acc = 0;
        const target = pass === 1 ? rand() * sum : 0;
        for (let i = 0; i < SPECIES.length; i++) {
          const s = SPECIES[i];
          if (s.lake !== scene.lake) continue;
          const t = s.tier;
          let w = TIERS[t].w;
          if (t === 4) { if (!legendOk(s, td)) continue; } else w *= s.sp[scene.spot] * s.tod[td] * s.wx[g.wx];
          w *= t === 0 ? 1.2 - 0.5 * d : t === 1 ? 0.8 + 0.4 * d : 0.5 + d;
          if (t >= 2) w *= 1 + 0.13 * up[3];
          else if (t === 1) w *= 1 + 0.06 * up[3];
          if (g.goldCast && t >= 2) w *= 2;
          if (auth) w = t === 4 ? 30 : 30; // автор: все виды поровну, чтобы быстро проверить альбом
          acc += w;
          if (pass === 1 && acc >= target) return s;
        }
        sum = acc;
      }
      return SPECIES[0];
    };
    // улов старика в фоне: обычные виды своего озера, изредка редкая
    const npcPick = () => {
      if (rand() < 0.08) return EVI;
      const v = rand();
      if (v < 0.14) return BOOT;
      const want = v < 0.97 ? (rand() < 0.75 ? 0 : 1) : 2;
      let n = 0;
      for (let i = 0; i < SPECIES.length; i++) if (SPECIES[i].lake === scene.lake && SPECIES[i].tier === want) n++;
      let k = Math.floor(rand() * n);
      for (let i = 0; i < SPECIES.length; i++) if (SPECIES[i].lake === scene.lake && SPECIES[i].tier === want) { if (k-- === 0) return SPECIES[i]; }
      return SPECIES[0];
    };
    const tierOf = (c) => (c && c.tier != null ? c.tier : 0);

    // ---------- рыбак-автомат (фон) ----------
    const npcUpdate = (dt) => {
      switch (g.st) {
        case 'rest':
          g.timer -= dt;
          if (old.emoteT <= 0 && old.look <= 0 && rand() < dt * 0.08) {
            if (rand() < 0.5) old.look = 1.2 + rand(); else emote(old, 6, 1.4);
          }
          if (g.timer <= 0) { g.st = 'charge'; g.power = 0; g.powDir = 1; g.npcPow = 0.2 + rand() * 0.55; }
          break;
        case 'charge':
          g.power += dt / 1.1;
          if (g.power >= g.npcPow) launch(g.power);
          break;
        case 'fly':
          stepFly(dt, 4, 9);
          break;
        case 'wait':
          g.timer -= dt;
          if (g.nibble > 0) g.nibble -= dt;
          else if (rand() < dt * 0.7) g.nibble = 0.14;
          if (g.timer <= 0) {
            g.catchSp = npcPick();
            g.st = 'bite';
            g.timer = 1.0;
            g.npcReact = 0.2 + rand() * 0.6;
            g.npcHook = rand() < 0.78;
            puff(g.bob.tx, g.bob.ty, 5, '#e8f4ff', 16);
            api.sfx('splash');
          }
          break;
        case 'bite':
          g.timer -= dt;
          g.npcReact -= dt;
          if (g.npcHook && g.npcReact <= 0) { g.st = 'reel'; g.timer = 1.4 + rand() * 2.4; g.thrash = 0.3; }
          else if (g.timer <= 0) { g.st = 'miss'; g.timer = 1.0; emote(old, 3, 1.0); }
          break;
        case 'reel':
          g.timer -= dt;
          g.thrash -= dt;
          if (g.thrash <= 0) {
            g.thrash = 0.5 + rand() * 0.9;
            puff(g.bob.tx + Math.round((rand() - 0.5) * 6), g.bob.ty, 3, '#e8f4ff', 14);
          }
          if (g.timer <= 0) {
            if (rand() < 0.86) {
              const c = g.catchSp;
              puff(g.bob.tx, g.bob.ty, 8, '#e8f4ff', 22);
              if (c === BOOT) toss(BOOT.spr, g.bob.tx, g.bob.ty - 4, g.bob.tx - 18, g.bob.ty + 6, 26, 0.9, 1);
              else toss(c.spr, g.bob.tx, g.bob.ty - 4, BASKET_X - 2, DECK_Y - 9, 52, 1.3, 0);
              g.st = 'show';
              g.timer = 1.4;
              const t = tierOf(c);
              emote(old, t >= 2 ? 2 : c === BOOT ? 3 : 0, t >= 2 ? 2.2 : 1.0);
              api.sfx(c === BOOT ? 'click' : 'coin');
            } else {
              puff(g.bob.tx, g.bob.ty, 6, '#e8f4ff', 18);
              g.st = 'miss';
              g.timer = 1.0;
              emote(old, 3, 1.0);
            }
          }
          break;
        case 'show':
        case 'miss':
          g.timer -= dt;
          if (g.timer <= 0) { g.st = 'rest'; g.timer = 2.5 + rand() * 4; }
          break;
        case 'retrieve':
          stepRetrieve(dt);
          break;
        default:
          g.st = 'rest';
          break;
      }
    };

    // ---------- игра ----------
    const endCast = () => {
      if (g.fat <= 0) {
        g.fat = 0;
        g.st = 'rest';
        g.phase = 'finish';
        g.pt = 0;
        g.panel = null;
        emote(old, 4, 1.6);
        api.sfx('win');
        P.p.best = Math.max(P.p.best, Math.round(g.score));
        P.save();
        MT.flush();
      } else g.st = 'ready';
    };

    const startReel = () => {
      const c = g.catchSp;
      const t = c.ev ? 1 : c.tier < 0 ? 0 : c.tier;
      const T = TIERS[t];
      const up = P.p.up;
      const R = g.R;
      R.speed = c === BOOT ? 0.22 : c === CHEST ? 0.45 : T.speed;
      R.jumpy = c === BOOT ? 0.25 : c === CHEST ? 0.5 : T.jumpy;
      R.zone = clamp((c === BOOT ? 0.36 : T.zone) + 0.018 * up[0], 0.12, 0.5);
      R.gain = (c === BOOT ? 0.34 : T.gain) * (1 + 0.08 * up[2]);
      R.drain = (c === BOOT ? 0.16 : T.drain) * (1 - 0.07 * up[1]);
      g.beh = c.beh === 'blink' ? 1 : c.beh === 'dash' ? 2 : c.beh === 'ghost' ? 3 : c.beh === 'heavy' ? 4 : 0;
      g.behT = 1.5;
      g.dashT = 0;
      g.fishVis = 1;
      g.st = 'reel';
      g.fish = 0.4 + rand() * 0.3;
      g.fishT = g.fish;
      g.fishTimer = 0.4;
      g.zone = clamp(g.fish - R.zone / 2, 0, 1 - R.zone);
      g.zv = 0;
      g.prog = 0.3;
      g.thrash = 1;
    };

    const landCatch = () => {
      const c = g.catchSp;
      g.show = c;
      g.showNew = false;
      g.showSize = 0;
      g.showCoins = 0;
      g.streak++;
      const ctxD = DCTX;
      ctxD.tod = tod(); ctxD.spot = scene.spot; ctxD.streak = g.streak;
      if (c === BOOT) {
        g.score += 1;
        MT.addXp(0.5);
        P.daily(null, 0, ctxD);
        P.save();
      } else if (c.ev) {
        // особый улов события: монеты + шаг испытания
        const coins = Math.round(12 * LAKES[scene.lake].coin * P.bonus) * P.mul();
        g.showCoins = coins;
        g.score += coins;
        g.evRun++;
        MT.addXp(6);
        MT.count(P.mul());
        P.addCoins(coins, ctxD);
        g.lastSpr = c.spr;
      } else if (c === CHEST) {
        MT.addXp(3);
        const coins = Math.round((20 + rand() * 30) * LAKES[scene.lake].coin * P.bonus) * P.mul();
        g.showCoins = coins;
        g.score += coins;
        if (rand() < 0.35) { P.p.gold += 3; }
        P.addCoins(coins, ctxD);
      } else {
        const size = Math.round(lerp(c.len[0], c.len[1], Math.pow(rand(), 1.6 - 0.08 * P.p.up[3])));
        const r = P.addCatch(c, size, ctxD);
        MT.addXp(XP_TIER[c.tier] * LAKES[c.lake].xp + (r.isNew ? 20 : 0));
        g.showSize = size;
        g.showCoins = r.coins;
        g.showNew = r.isNew;
        g.score += r.coins;
        g.runFish++;
        g.lastSpr = c.spr;
      }
      g.caughtN++;
    };
    const DCTX = { tod: 0, spot: 0, streak: 0 };

    const playUpdate = (dt) => {
      const press1 = pressedEdge;
      pressedEdge = false;
      // время суток и погода в игре
      const am = P.author ? 4 : 1;
      g.clock = (g.clock + dt * CLOCK_SPEED * am) % 4;
      g.wxT -= dt * am;
      if (g.wxT <= 0) {
        g.wxT = 60 + rand() * 60;
        if (rand() < 0.35) pickWeather();
      }
      if (g.panel) return;
      // силы
      g.fat -= dt * FAT_SEC / (P.author ? 4 : 1);
      if (g.fat < 0) g.fat = 0;
      switch (g.st) {
        case 'rest':
        case 'ready':
          g.st = 'ready';
          if (g.fat <= 0) { endCast(); break; }
          if (press1) { g.st = 'charge'; g.power = 0; g.powDir = 1; }
          break;
        case 'charge': {
          g.power += g.powDir * dt / 1.1;
          if (g.power >= 1) { g.power = 1; g.powDir = -1; }
          if (g.power <= 0.05 && g.powDir < 0) { g.power = 0.05; g.powDir = 1; }
          if (!held) {
            g.fat -= FAT_CAST * (1 - 0.06 * P.p.up[4]) / (P.author ? 4 : 1);
            g.casts++;
            g.goldCast = false;
            if (P.p.gold > 0) { P.p.gold--; g.goldCast = true; }
            launch(clamp(g.power, 0.08, 1));
          }
          break;
        }
        case 'fly': {
          const bk = (1 - 0.045 * P.p.up[3]) * (P.author ? 0.35 : 1);
          stepFly(dt, 1.2 * bk, 3.2 * bk);
          break;
        }
        case 'wait':
          g.timer -= dt;
          if (g.nibble > 0) g.nibble -= dt;
          else if (rand() < dt * 0.9) g.nibble = 0.14;
          if (g.spooked > 0) g.spooked -= dt;
          if (press1 && g.spookCount < 3) {
            g.spookCount++;
            g.timer += 0.8 + rand() * 0.8;
            g.spooked = 0.8;
            puff(g.bob.tx, g.bob.ty, 3, '#cfe8ff', 10);
            api.sfx('click');
          }
          if (g.timer <= 0) {
            g.catchSp = pickCatch(g.dist);
            g.st = 'bite';
            g.timer = g.catchSp.tier === 4 ? 0.8 : 1.0;
            puff(g.bob.tx, g.bob.ty, 5, '#e8f4ff', 16);
            api.sfx('splash');
          }
          break;
        case 'bite':
          g.timer -= dt;
          if (press1) { startReel(); api.sfx('jump'); }
          else if (g.timer <= 0) { g.st = 'miss'; g.timer = 1.2; g.streak = 0; api.sfx('hit'); emote(old, 3, 1.0); }
          break;
        case 'reel': {
          const R = g.R;
          g.fishTimer -= dt;
          g.behT -= dt;
          let spd = R.speed;
          if (g.beh === 1 && g.behT <= 0) {
            // золотой карась: пропадает и выныривает в другом месте
            g.behT = 1.1 + rand() * 0.9;
            g.fish = clamp(g.fish + (rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 0.35), 0.04, 0.96);
            g.fishT = g.fish;
            puff(g.bob.tx, g.bob.ty, 4, '#fff6b0', 14);
          } else if (g.beh === 2) {
            // царица: долгие рывки с паузами
            if (g.behT <= 0) { g.behT = 1.4 + rand() * 1.2; g.dashT = 0.45; g.fishT = g.fish < 0.5 ? 0.85 + rand() * 0.12 : 0.03 + rand() * 0.12; }
            if (g.dashT > 0) { g.dashT -= dt; spd *= 3.4; }
          } else if (g.beh === 3) {
            // ледяной таймень: то исчезает подо льдом, то виден
            g.fishVis = Math.sin(g.t * 2.6) > -0.15 ? 1 : 0;
          }
          if (g.fishTimer <= 0) {
            const span = 0.25 + rand() * 0.6 * Math.min(1, R.jumpy);
            g.fishT = clamp(g.fish + (rand() < 0.5 ? -span : span), 0.03, 0.97);
            if (g.beh === 4 && rand() < 0.6) g.fishT = 0.04 + rand() * 0.2; // древний сом тянет ко дну
            g.fishTimer = (0.35 + rand() * 1.1) / R.jumpy;
          }
          const step = spd * dt;
          g.fish += clamp(g.fishT - g.fish, -step, step);
          g.fish += Math.sin(g.t * 13) * 0.04 * R.jumpy * dt;
          g.fish = clamp(g.fish, 0.02, 0.98);
          const grav = g.beh === 4 ? -3.6 : -2.4;
          g.zv += (held ? 2.8 : grav) * dt;
          g.zv = clamp(g.zv, -1.4, 1.4);
          g.zone += g.zv * dt;
          if (g.zone < 0) { g.zone = 0; g.zv = g.zv < -0.4 ? -g.zv * 0.3 : 0; }
          if (g.zone > 1 - R.zone) { g.zone = 1 - R.zone; if (g.zv > 0) g.zv = 0; }
          const inside = g.fish >= g.zone && g.fish <= g.zone + R.zone;
          g.prog += (inside ? R.gain * (P.author ? 2 : 1) : -R.drain) * dt;
          g.thrash -= dt;
          if (g.thrash <= 0) {
            g.thrash = 0.8 + rand() * 1.4;
            puff(g.bob.tx + Math.round((rand() - 0.5) * 6), g.bob.ty, 3, '#e8f4ff', 14);
          }
          if (g.prog >= 1) {
            landCatch();
            g.st = 'show';
            g.timer = 1.9;
            puff(g.bob.tx, g.bob.ty, 10, '#e8f4ff', 26);
            const t = tierOf(g.show);
            api.sfx(t >= 2 || g.show === CHEST || g.show.ev ? 'win' : g.show === BOOT ? 'click' : 'coin');
            emote(old, 2, 1.2);
          } else if (g.prog <= 0) {
            g.st = 'miss';
            g.timer = 1.2;
            g.streak = 0;
            api.sfx('hit');
            emote(old, 3, 1.0);
          }
          break;
        }
        case 'show':
        case 'miss':
          g.timer -= dt;
          if (g.timer <= 0 || (press1 && g.timer < 1.1) || (P.author && g.timer < 0.9)) endCast();
          break;
        case 'retrieve':
          stepRetrieve(dt);
          break;
        default:
          g.st = 'ready';
          break;
      }
    };

    // улов игрока — старику в корзину
    const handOverCatch = () => {
      const n = Math.min(3, g.caughtN);
      for (let i = 0; i < n; i++) toss(g.lastSpr || SPECIES[0].spr, BUCKET_X + 1, DECK_Y - 9, BASKET_X - 2, DECK_Y - 9, 14, 0.6, 0, i * 0.22);
      g.caughtN = 0;
    };

    // ---------- переходы ----------
    const startIntro = () => {
      const from = g.phase;
      g.phase = 'intro';
      g.pt = 0;
      held = false;
      pressedEdge = false;
      g.show = null;
      g.panel = null;
      if (from === 'idle') {
        // свежая копия прогресса (могла прийти с другого компьютера)
        P.load();
        MT.refresh();
        if (applyMeta()) initDecor();
        if (P.p.lake !== scene.lake || P.p.spot !== scene.spot) buildScene(P.p.lake, P.p.spot);
      }
      if (from === 'wait' || from === 'finish') handOverCatch();
      if (holder === old) {
        if (lineOut()) startRetrieve();
        else if (g.st !== 'retrieve') g.st = 'rest';
        if (you.x > W + 2) you.x = EXIT_X;
        you.tx = SPOT_X + 12;
        old.tx = old.x;
      } else {
        if (lineOut()) startRetrieve();
        else if (g.st !== 'retrieve') g.st = 'rest';
        you.tx = SPOT_X;
        old.tx = SEAT_X;
        if (from === 'wait' || from === 'finish') emote(old, 1, 0.8);
      }
    };
    const beginPlay = () => {
      g.phase = 'play';
      g.pt = 0;
      g.score = 0;
      g.casts = 0;
      g.streak = 0;
      g.runFish = 0;
      g.caughtN = 0;
      g.evRun = 0;
      g.bobC = BOB_COLS[Math.floor(rand() * Math.min(BOB_COLS.length, 1 + Math.floor(MT.lvl / 5)))];
      P.bonus = MT.coinMul();
      applyUpgrades();
      g.fat = g.fatMax;
      g.st = 'ready';
      g.clock = g.sky;
      g.overSent = false;
      g.sawOver = false;
      held = false;
      pressedEdge = false;
      if (P.checkDay()) P.save();
      api.sfx('click');
    };
    const startOutro = () => {
      if (g.phase === 'play' || g.phase === 'intro') { P.p.best = Math.max(P.p.best, Math.round(g.score)); P.save(); }
      MT.flush();
      g.phase = 'outro';
      g.pt = 0;
      held = false;
      pressedEdge = false;
      g.show = null;
      g.panel = null;
      if (g.fade > 0) { g.fade = 0; if (g.fadeTo >= 0) buildScene(g.fadeTo, g.fadeSpot); g.fadeTo = -1; }
      if (lineOut() && g.st !== 'retrieve') startRetrieve();
      else if (g.st !== 'retrieve') g.st = 'rest';
      if (g.caughtN) handOverCatch();
      if (holder === you) {
        old.tx = SPOT_X + 12;
        you.tx = SPOT_X;
      } else {
        old.tx = SPOT_X;
        you.tx = EXIT_X;
      }
    };
    const startPass = (to) => { passT = 0; passTo = to; };

    // ---------- обновление ----------
    const moveActor = (a, dt) => {
      const d = a.tx - a.x;
      if (Math.abs(d) > 0.5) {
        if (a.sit) { a.sit = false; return; }
        const s = Math.min(Math.abs(d), a.spd * dt);
        a.x += d > 0 ? s : -s;
        a.dir = d > 0 ? 1 : -1;
        a.step += s;
      } else {
        a.x = a.tx;
        a.dir = -1;
        a.step = 0;
      }
      if (a.emoteT > 0) a.emoteT -= dt;
      if (a.look > 0) a.look -= dt;
    };
    const arrived = (a) => Math.abs(a.tx - a.x) <= 0.5;

    const updateWorld = (dt) => {
      const cdir = MT.id === 'jest' ? -1 : 1; // «неделя шуток»: облака плывут обратно
      for (let i5 = 0; i5 < clouds.length; i5++) { const c = clouds[i5];
        c.x += c.v * dt * cdir;
        if (c.x > W + 10) c.x = -c.w - 10;
        else if (c.x < -c.w - 12) c.x = W + 8;
      }
      for (let i = 0; i < fogs.length; i++) { const f = fogs[i]; f.x += f.v * dt; if (f.x > W + 20) f.x = -f.w - 20; }
      for (let i6 = 0; i6 < parts.length; i6++) { const p = parts[i6];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.vy += 120 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i7 = 0; i7 < flyers.length; i7++) { const f = flyers[i7];
        if (!f.on) continue;
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.on = false;
          if (f.dest === 0) { basketN++; puff(f.x1, f.y1, 3, '#e8e2c8', 8); }
          else puff(f.x1, f.y1, 5, '#e8f4ff', 14);
        }
      }
      // погода: облачность и дождь плавно
      const ck = g.wx >= 1 ? 1 : 0, rk = g.wx === 2 ? 1 : 0;
      g.cloudK += clamp(ck - g.cloudK, -dt * 0.3, dt * 0.3);
      g.rainK += clamp(rk - g.rainK, -dt * 0.3, dt * 0.3);
      if (g.rainK > 0.02) {
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          d.y += d.v * dt;
          d.x -= d.v * 0.2 * dt;
          if (d.y > d.gy) {
            if (rand() < 0.25) puff(d.x, d.gy, 1, '#cfe8ff', 6);
            d.y = -4 - rand() * 30; d.x = rand() * (W + 30);
          }
        }
      }
      // утки
      if (!duck.on) {
        duck.next -= dt;
        if (duck.next <= 0) {
          duck.on = true;
          duck.dir = rand() < 0.5 ? 1 : -1;
          duck.x = duck.dir > 0 ? -30 : W + 30;
          duck.y = 112 + Math.floor(rand() * 34);
          duck.spd = 5 + rand() * 4;
          duck.n = Math.floor(rand() * 4);
          duck.dive = 0;
        }
      } else {
        duck.x += duck.dir * duck.spd * dt;
        if (duck.dive > 0) duck.dive -= dt;
        else if (rand() < dt * 0.04) duck.dive = 1.6;
        if (duck.x < -40 || duck.x > W + 40) { duck.on = false; duck.next = 10 + rand() * 25; }
      }
      for (let i8 = 0; i8 < flies.length; i8++) { const f = flies[i8];
        f.hover -= dt;
        if (f.hover <= 0) {
          f.tx = 140 + rand() * 90;
          f.ty = 98 + rand() * 40;
          f.hover = 0.8 + rand() * 2.5;
        }
        f.x += (f.tx - f.x) * Math.min(1, dt * 6);
        f.y += (f.ty - f.y) * Math.min(1, dt * 6);
      }
      g.jumpT -= dt;
      if (g.jumpT <= 0) {
        g.jumpT = 7 + rand() * 14;
        const x = 110 + rand() * 110, y = 110 + rand() * 50;
        const d = rand() < 0.5 ? -1 : 1;
        puff(x, y, 3, '#e8f4ff', 10);
        toss(MINNOW, x, y, x + d * 10, y, 9, 0.55, 1, 0);
      }
    };

    // ---------- украшения события: движение ----------
    const updateDecor = (dt) => {
      const id = MT.id;
      if (SEA.fall) {
        const snow = SEA.fall === 'snow';
        const n = snow ? fall.length : 22;
        for (let i = 0; i < n; i++) {
          const f = fall[i];
          f.y += f.v * (snow ? 1 : 0.8) * dt;
          f.x += (Math.sin(g.t * (snow ? 1.2 : 2.2) + f.p) * (snow ? 6 : 12) - (snow ? 2 : 7)) * dt;
          if (f.y > H + 2 || f.x < -4) { f.y = -2 - rand() * 10; f.x = rand() * (W + 20); }
        }
      }
      if (id === 'thaw' || id === 'kupala' || id === 'yule') {
        for (let i = 0; i < deco.length; i++) { const d = deco[i]; d.x += d.v * dt; if (d.x > 226) { d.x = -d.w - rand() * 30; d.y = (id === 'thaw' ? HORIZON + 10 : 108) + rand() * 60; } }
      }
      if (id === 'thaw' || id === 'pumpkin') {
        for (let i = 0; i < birds.length; i++) { const b = birds[i]; b.x += b.v * dt; if (b.x > W + 10) { b.x = -10 - rand() * 80; b.y = 8 + rand() * 40; } }
      }
      if (id === 'starfall') {
        g.metT -= dt;
        if (g.metT <= 0) {
          g.metT = g.sky > 0.8 ? 1.2 + rand() * 3.5 : 6 + rand() * 8;
          for (let i = 0; i < meteors.length; i++) { const m = meteors[i];
            if (m.on) continue;
            m.on = true; m.t = 0; m.big = rand() < 0.22;
            m.x = 60 + rand() * 250; m.y = 2 + rand() * 18;
            m.vx = -(50 + rand() * 50); m.vy = m.big ? 34 + rand() * 12 : 18 + rand() * 18;
            break;
          }
        }
        for (let i = 0; i < meteors.length; i++) { const m = meteors[i];
          if (!m.on) continue;
          m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.big ? m.y >= HORIZON + 8 : m.t > 0.9) {
            m.on = false;
            if (m.big && m.x > 0 && m.x < 226) { puff(m.x, m.y, 8, '#e8dcff', 20); puff(m.x, m.y, 4, '#ffffff', 12); }
          }
        }
      }
      if (id === 'storm') {
        if (g.rainK > 0.6) {
          g.rainMem = 40;
          g.boltT -= dt;
          if (g.boltT <= 0) { g.boltT = 4 + rand() * 8; g.flash = 0.3; g.boltX = 20 + Math.floor(rand() * 200); }
        } else if (g.rainK < 0.15 && g.rainMem > 0) g.rainMem -= dt;
      }
      if (g.flash > 0) g.flash -= dt;
      if (id === 'kupala' && g.sky > 0.7 && rand() < dt * 3) puff(rand() < 0.5 ? 62 : 172, HORIZON - 6, 1, '#ffc060', 8);
    };

    const update = (dt) => {
      g.t += dt;
      g.pt += dt;
      updateWorld(dt);
      updateDecor(dt);
      MT.tick(dt, g.phase === 'play' && !g.panel);

      // небо: в фоне — по реальным часам, в игре — свои сутки
      const env = getEnv();
      const envSky = env ? clamp((env.dark || 0) * 2, 0, 2) : 0.3;
      let skyT = envSky;
      if (g.phase === 'play' || g.phase === 'finish' || g.phase === 'wait') skyT = g.clock <= 2 ? g.clock : 4 - g.clock;
      const sr = (g.phase === 'idle' || g.phase === 'outro' ? 0.05 : 0.12) * dt;
      g.sky += clamp(skyT - g.sky, -sr, sr);
      const hudT = g.phase === 'play' || g.phase === 'finish' || g.phase === 'wait' || (g.phase === 'intro' && holder === you) ? 1 : 0;
      g.hud += clamp(hudT - g.hud, -dt * 3, dt * 3);
      // погода в фоне: изредка меняется
      if (g.phase === 'idle') {
        g.wxT -= dt;
        if (g.wxT <= 0) { g.wxT = 120 + rand() * 180; if (rand() < 0.4) pickWeather(); }
      }
      // переход на другое место: затемнение
      if (g.fade > 0) {
        const was = g.fade;
        g.fade += dt * 2;
        if (was < 1 && g.fade >= 1 && g.fadeTo >= 0) { buildScene(g.fadeTo, g.fadeSpot); g.fadeTo = -1; if (rand() < 0.5) pickWeather(); }
        if (g.fade >= 2) g.fade = 0;
      }
      // всплывающие сообщения
      if (g.toastT > 0) g.toastT -= dt;
      else if (P.events.length && (g.phase === 'play' || g.phase === 'finish' || g.phase === 'wait')) {
        g.toast = P.events.shift();
        g.toastT = 2.2;
        if (g.toast.kind >= 3) api.sfx('win');
      }

      if (passT >= 0) {
        passT += dt / 0.35;
        if (passT >= 1) {
          holder = passTo;
          passT = -1;
          if (g.phase === 'intro') { old.tx = SEAT_X; you.tx = SPOT_X; api.sfx('click'); }
          else if (g.phase === 'outro') { old.tx = SPOT_X; you.tx = EXIT_X; api.sfx('click'); }
        }
      }

      if (g.phase === 'intro') {
        if (g.st === 'retrieve') stepRetrieve(dt);
        if (holder === old && passT < 0 && g.st !== 'retrieve') {
          if (old.sit) old.sit = false;
          if (arrived(you) && Math.abs(you.x - (SPOT_X + 12)) < 1) startPass(you);
        }
        if (holder === you && passT < 0 && g.st !== 'retrieve' && arrived(you) && atSpot(you) && g.pt > 1.0) beginPlay();
        if (g.pt > 4) {
          passT = -1; holder = you; you.x = you.tx = SPOT_X; old.tx = SEAT_X; beginPlay();
        }
      } else if (g.phase === 'play') {
        playUpdate(dt);
      } else if (g.phase === 'finish') {
        if (g.pt >= 1.0) {
          g.phase = 'wait';
          g.pt = 0;
          if (!g.overSent) {
            g.overSent = true;
            api.over(Math.round(g.score));
          }
        }
      } else if (g.phase === 'wait') {
        if (old.emoteT <= 0 && rand() < dt * 0.25) emote(old, 5, 1.6);
      } else if (g.phase === 'outro') {
        if (g.st === 'retrieve') stepRetrieve(dt);
        if (holder === you && passT < 0 && g.st !== 'retrieve' && arrived(old) && Math.abs(old.x - (SPOT_X + 12)) < 1) startPass(old);
        if (holder === old && passT < 0 && atSpot(old)) {
          if (!old.sit) { old.sit = true; g.st = 'rest'; g.timer = 1.2 + rand(); }
          g.phase = 'idle';
          g.pt = 0;
        }
        if (g.pt > 3.8) {
          passT = -1; holder = old; old.x = old.tx = SPOT_X; old.sit = true; you.tx = EXIT_X; g.st = 'rest'; g.timer = 1;
          g.phase = 'idle'; g.pt = 0;
        }
      } else if (g.phase === 'idle') {
        // смена месяца, пока висит фон
        g.evT -= dt;
        if (g.evT <= 0) { g.evT = 60; MT.refreshEvent(); if (applyMeta()) initDecor(); }
        if (holder === old && atSpot(old)) {
          if (!old.sit) old.sit = true;
          npcUpdate(dt);
        }
      }

      moveActor(old, dt);
      moveActor(you, dt);
      if (arrived(old) && (Math.abs(old.x - SEAT_X) < 0.5 || (Math.abs(old.x - SPOT_X) < 0.5 && g.phase !== 'intro'))) old.sit = true;
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
        if (ph === 'intro' || ph === 'play' || ph === 'finish' || ph === 'wait') startOutro();
      }
    };

    // ---------- отрисовка ----------
    const line = (x0, y0, x1, y1, color) => {
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

    let VX = 0, VD = -1;
    const vr = (ox, y, w, h) => ctx.fillRect(VD < 0 ? VX + ox : VX - ox - w + 1, y, w, h);

    const drawPerson = (a, isOld, dusk) => {
      if (a.x > W + 6) return;
      VX = Math.round(a.x);
      VD = a.look > 0 ? -a.dir : a.dir;
      const walking = !arrived(a);
      const sit = a.sit && !walking;
      const fishing = holder === a && passT < 0 && fishingPose();
      const pose = fishing && g.st === 'charge' ? 1 : fishing && g.st === 'reel' ? 2 : 0;
      const y = MAN_Y + (sit ? 2 : 0);
      const sd = dusk * 0.45;
      const em = a.emoteT > 0 ? a.emote : 0;
      const hop = em === 2 ? -Math.abs(Math.round(Math.sin(g.t * 9) * 2)) : 0;
      const yy = y + hop;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(VX - 3, DECK_Y, 8, 1);
      ctx.fillStyle = rgbMix(LEG_C, SHADE, sd);
      if (sit) {
        vr(-5, yy + 9, 4, 2);
        vr(-5, yy + 11, 1, DECK_Y - yy - 11 > 0 ? DECK_Y - yy - 11 : 1);
      } else {
        const st = walking ? Math.floor(a.step / 3) % 2 : 0;
        vr(-1 - st, yy + 10, 1, 2);
        vr(1 + st, yy + 10, 1, 2);
      }
      ctx.fillStyle = rgbMix(isOld ? OLD_SHIRT : YOU_SHIRT, SHADE, sd);
      vr(-2, yy + 4, 5, sit ? 6 : 7);
      ctx.fillStyle = rgbMix(isOld ? OLD_BELT : YOU_BELT, SHADE, sd);
      vr(-2, yy + 7, 5, 1);
      const shake = em === 3 ? Math.round(Math.sin(g.t * 16)) : 0;
      ctx.fillStyle = rgbMix(SKIN_C, SHADE, sd);
      vr(-1 + shake, yy, 4, 4);
      if (em === 2 || em === 6) {
        vr(-3, yy + 1, 1, 3);
        vr(3, yy + 1, 1, 3);
      } else if (em === 4) {
        const c = Math.floor(g.t * 8) % 2;
        vr(-3 + c, yy + 4, 1, 2);
        vr(-2 - c + 1, yy + 5, 1, 1);
      } else if (holder === a || passT >= 0 && (passTo === a || (passTo === you ? old : you) === a)) {
        vr(pose === 1 ? 3 : -3, yy + 5 + (pose === 2 ? Math.round(Math.sin(g.t * 18)) : 0), 1, 2);
      } else {
        vr(-3, yy + 5, 1, 3);
      }
      ctx.fillStyle = rgbMix(EYE_C, SHADE, sd);
      vr(-1 + shake, yy + 1, 1, 1);
      if (em === 6) vr(-1 + shake, yy + 3, 2, 1);
      if (isOld) {
        ctx.fillStyle = rgbMix(HAT_C, SHADE, sd);
        vr(-3 + shake, yy - 1, 8, 1);
        vr(-1 + shake, yy - 3, 4, 2);
        ctx.fillStyle = rgbMix(MT.lvl >= 10 ? BAND_GOLD : BAND_C, SHADE, sd);
        vr(-1 + shake, yy - 2, 4, 1);
      } else {
        ctx.fillStyle = rgbMix(HAIR_C, SHADE, sd);
        vr(-1 + shake, yy - 1, 4, 1);
        vr(2 + shake, yy, 1, 2);
      }
      // в дождь — капюшон-плащ на плечах
      if (g.rainK > 0.5) {
        ctx.fillStyle = rgbMix(isOld ? CAPE_OLD : CAPE_YOU, SHADE, sd);
        vr(-2, yy + 4, 5, 1);
      }
      if (em === 1 || em === 5 || (em === 2 && isOld)) {
        const bx = VX - 3, by = yy - 13;
        ctx.fillStyle = 'rgba(42,26,16,0.85)';
        ctx.fillRect(bx, by, 9, 8);
        if (em === 5) {
          const k = Math.floor(g.t * 4) % 4;
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 3; i++) if (i < k) ctx.fillRect(bx + 2 + i * 2, by + 5, 1, 1);
        } else drawText(ctx, '!', bx + 4, by + 2, em === 2 ? '#ffe070' : '#ffffff');
      }
    };

    const drawBobber = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      ctx.fillStyle = '#f4f0e8';
      ctx.fillRect(x - 1, y - 2, 3, 2);
      ctx.fillStyle = g.goldCast && g.phase === 'play' ? '#ffd34a' : holder === you ? g.bobC : '#e04040';
      ctx.fillRect(x - 1, y, 3, 2);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(x, y - 3, 1, 1);
    };

    const P3 = { top: [0, 0, 0], bot: [0, 0, 0], sun: [0, 0, 0], water: [0, 0, 0], deep: [0, 0, 0], hill: [0, 0, 0], mtn: [0, 0, 0] };
    const mix3 = (o, arr, s) => {
      const A = s <= 1 ? arr[0] : arr[1], B = s <= 1 ? arr[1] : arr[2], k = s <= 1 ? s : s - 1;
      o[0] = lerp(A[0], B[0], k); o[1] = lerp(A[1], B[1], k); o[2] = lerp(A[2], B[2], k);
    };
    const SKY_ARR = { top: [DAY.top, SET.top, NIGHT.top], bot: [DAY.bot, SET.bot, NIGHT.bot], sun: [DAY.sun, SET.sun, NIGHT.sun] };
    const blendPal = (s) => {
      const look = LOOKS[scene.lake];
      mix3(P3.top, SKY_ARR.top, s);
      mix3(P3.bot, SKY_ARR.bot, s);
      mix3(P3.sun, SKY_ARR.sun, s);
      mix3(P3.water, look.water, s);
      mix3(P3.deep, look.deep, s);
      mix3(P3.hill, look.hill, s);
      mix3(P3.mtn, MTN_C, s);
      // облачность приглушает небо
      const ck = g.cloudK * 0.45;
      if (ck > 0) {
        for (let i = 0; i < 3; i++) {
          P3.top[i] = lerp(P3.top[i], GREY[i] * (1 - s * 0.4), ck);
          P3.bot[i] = lerp(P3.bot[i], GREY[i] * (1 - s * 0.35), ck);
          P3.water[i] = lerp(P3.water[i], P3.water[i] * 0.8, ck);
        }
      }
    };
    const disc = (cx, cy, r, color) => {
      ctx.fillStyle = color;
      for (let yy = -r; yy <= r; yy++) {
        if (cy + yy >= HORIZON - 1) break;
        const w = Math.round(Math.sqrt(r * r - yy * yy));
        ctx.fillRect(cx - w, cy + yy, w * 2, 1);
      }
    };

    const drawDuck = (dusk) => {
      if (!duck.on) return;
      const x = Math.round(duck.x), y = duck.y;
      const bob = Math.round(Math.sin(g.t * 2 + x * 0.1) * 0.5);
      const d = duck.dir;
      const sd = dusk * 0.5;
      const rub = MT.id === 'jest'; // резиновые уточки
      const DB = rub ? RUB_Y : DUCK_BODY, DH = rub ? RUB_Y : DUCK_HEAD, DW = rub ? RUB_Y : DUCK_WHITE;
      ctx.fillStyle = 'rgba(230,245,255,0.35)';
      ctx.fillRect(x - d * 8, y + 2, 3, 1);
      ctx.fillRect(x - d * 12, y + 3, 3, 1);
      if (duck.dive > 0 && duck.dive < 1.4) {
        ctx.fillStyle = rgbMix(DB, SHADE, sd);
        ctx.fillRect(x - 1, y - 1 + bob, 3, 2);
        ctx.fillStyle = rgbMix(DW, SHADE, sd);
        ctx.fillRect(x, y - 2 + bob, 1, 1);
      } else {
        ctx.fillStyle = rgbMix(DB, SHADE, sd);
        ctx.fillRect(x - 3, y - 1 + bob, 7, 3);
        ctx.fillStyle = rgbMix(DW, SHADE, sd);
        ctx.fillRect(x - 3 + (d > 0 ? 0 : 5), y - 1 + bob, 2, 1);
        ctx.fillStyle = rgbMix(DH, SHADE, sd);
        ctx.fillRect(x + d * 3 - (d > 0 ? 0 : 1), y - 4 + bob, 2, 3);
        ctx.fillStyle = rgbMix(DUCK_BEAK, SHADE, sd);
        ctx.fillRect(x + d * 5, y - 3 + bob, 1, 1);
      }
      ctx.fillStyle = rgbMix(DUCKLING, SHADE, sd);
      for (let i = 1; i <= duck.n; i++) {
        const dx = x - d * (8 + i * 6);
        const b2 = Math.round(Math.sin(g.t * 3 + i) * 0.6);
        ctx.fillRect(dx - 1, y + b2, 3, 2);
        ctx.fillRect(dx + (d > 0 ? 1 : -1), y - 1 + b2, 1, 1);
      }
    };

    const drawTrees = (s, dusk) => {
      const look = LOOKS[scene.lake];
      if (look.trees === 'mount') {
        // горы со снежными шапками
        ctx.fillStyle = rgbStr(P3.mtn[0], P3.mtn[1], P3.mtn[2]);
        for (let i = 0; i < mtn.length; i++) ctx.fillRect(i * 2, mtn[i], 2, HORIZON - mtn[i]);
        ctx.fillStyle = rgbMix(WHITE, P3.mtn, 0.15 + s * 0.3);
        for (let i = 0; i < mtn.length; i++) if (mtn[i] < HORIZON - 30) ctx.fillRect(i * 2, mtn[i], 2, Math.min(5, HORIZON - 30 - mtn[i] + 2));
      }
      ctx.fillStyle = rgbStr(P3.hill[0], P3.hill[1], P3.hill[2]);
      for (let i = 0; i < treeline.length; i++) ctx.fillRect(i * 3, treeline[i], 3, HORIZON - treeline[i]);
      if (look.trees === 'pine' || look.trees === 'mount') {
        // макушки елей
        for (let i = 1; i < treeline.length; i += 4) ctx.fillRect(i * 3 + 1, treeline[i] - 2, 1, 2);
      }
      if (look.trees === 'willow') {
        // свисающие ветви ив
        ctx.fillStyle = rgbMix(P3.hill, BLACK, 0.15);
        for (let i = 0; i < treeline.length; i += 5) {
          const sw = Math.round(Math.sin(g.t * 0.8 + i) * 0.7);
          ctx.fillRect(i * 3 + sw, treeline[i] + 2, 1, HORIZON - treeline[i] + 2);
        }
      }
      ctx.fillStyle = rgbMix(P3.hill, BLACK, 0.2);
      ctx.fillRect(0, HORIZON - 2, W, 2);
    };

    // ---------- украшения события: отрисовка ----------
    const RAINBOW = ['#ff6060', '#ffb050', '#ffe860', '#70e070', '#60a8ff', '#a070f0'];
    const flame = (x, y, k) => {
      const f = 0.7 + 0.3 * Math.sin(g.t * 11 + x) * Math.sin(g.t * 4.3 + y);
      ctx.fillStyle = rgbStr(255, 150 + 60 * f, 50);
      ctx.fillRect(x - 1, y - 2, 3, 2);
      ctx.fillStyle = rgbStr(255, 230, 120);
      ctx.fillRect(x, y - 3 - (f > 0.85 ? 1 : 0), 1, 2);
      ctx.fillStyle = rgbStr(255, 170, 70, 0.04 + 0.08 * k * f);
      ctx.fillRect(x - 3, y - 6, 7, 7);
    };
    const lantern = (x, y, k) => {
      ctx.fillStyle = rgbMix([255, 138, 42], SHADE, 0.2);
      ctx.fillRect(x, y - 4, 6, 4);
      ctx.fillRect(x + 1, y - 5, 4, 1);
      ctx.fillStyle = '#4a7a2a';
      ctx.fillRect(x + 2, y - 6, 1, 1);
      const f = 0.75 + 0.25 * Math.sin(g.t * 9 + x);
      ctx.fillStyle = rgbStr(255, 230 * f, 90);
      ctx.fillRect(x + 1, y - 3, 1, 1);
      ctx.fillRect(x + 4, y - 3, 1, 1);
      ctx.fillRect(x + 1, y - 1, 4, 1);
      if (k > 0.1) { ctx.fillStyle = rgbStr(255, 160, 60, 0.07 * k * f); ctx.fillRect(x - 2, y - 7, 10, 9); }
    };
    // небо: радуга, молния, метеоры, птицы
    const drawSkyDeco = (s, night) => {
      const id = MT.id;
      if (id === 'storm' && g.rainMem > 0 && g.rainK < 0.3 && s < 1.3) {
        const a = Math.min(1, g.rainMem / 6) * (1 - g.rainK * 3.3) * 0.45;
        if (a > 0.02) {
          for (let b = 0; b < 6; b++) {
            ctx.fillStyle = rgbMix(RGB_RB[b], WHITE, 0, a);
            const r = 74 - b * 2;
            for (let dx = -r; dx <= r; dx += 2) {
              const y = Math.round(HORIZON + 6 - Math.sqrt(r * r - dx * dx));
              if (y < HORIZON - 3) ctx.fillRect(176 + dx, y, 2, 2);
            }
          }
        }
      }
      if (id === 'storm' && g.flash > 0.12) {
        ctx.fillStyle = '#fffbe0';
        let x = g.boltX;
        for (let i = 0; i < 7; i++) {
          const y0 = 6 + i * 11;
          const nx = x + Math.round(Math.sin(g.boltX * 0.37 + i * 2.1) * 4);
          ctx.fillRect(Math.min(x, nx), y0, Math.abs(nx - x) + 1, 1);
          ctx.fillRect(nx, y0, 1, 11);
          x = nx;
        }
      }
      if (id === 'starfall') {
        for (let i = 0; i < meteors.length; i++) { const m = meteors[i];
          if (!m.on || m.y >= HORIZON - 1) continue;
          const a = m.big ? 1 : Math.max(0, 1 - m.t / 0.9);
          for (let k = 0; k < (m.big ? 9 : 6); k++) {
            const y = Math.round(m.y - m.vy * 0.012 * k);
            if (y >= HORIZON - 1) continue;
            ctx.fillStyle = rgbStr(m.big ? 255 : 240, m.big ? 210 - k * 10 : 236, m.big ? 160 : 255, a * (1 - k / 9));
            ctx.fillRect(Math.round(m.x - m.vx * 0.012 * k), y, k === 0 && m.big ? 2 : 1, 1);
          }
        }
      }
      if (id === 'thaw' || (id === 'pumpkin' && s > 0.7)) {
        const bat = id === 'pumpkin';
        ctx.fillStyle = bat ? rgbStr(30, 20, 34, clamp((s - 0.7) * 2, 0, 1)) : rgbMix([30, 30, 34], SHADE, s * 0.3);
        for (let i = 0; i < birds.length; i++) { const b = birds[i];
          if (b.x < -4 || b.x > W + 4) continue;
          const x = Math.round(b.x), y = Math.round(b.y + Math.sin(g.t * 2 + b.p) * 3);
          const up = Math.floor(g.t * (bat ? 12 : 6) + b.p) % 2;
          ctx.fillRect(x, y, 2, 1);
          ctx.fillRect(x - 2, y - up, 2, 1);
          ctx.fillRect(x + 2, y - up, 2, 1);
          if (bat) { ctx.fillRect(x - 3, y + 1 - up * 2, 1, 1); ctx.fillRect(x + 4, y + 1 - up * 2, 1, 1); }
        }
      }
    };
    // дальний берег: снег, цвет садов, чучело, костры, снопы
    const drawShoreDeco = (s, dusk, night) => {
      const id = MT.id;
      if (id === 'yule' || id === 'newyear' || id === 'maslenitsa' || id === 'thaw') {
        ctx.fillStyle = rgbMix(WHITE, SHADE, s * 0.35);
        const st = id === 'thaw' ? 4 : 1;
        for (let i = 0; i < treeline.length; i += st) ctx.fillRect(i * 3, treeline[i], id === 'thaw' ? 2 : 3, 1);
        if (id !== 'thaw') ctx.fillRect(0, HORIZON - 2, W, 1);
      } else if (id === 'bloom') {
        for (let i = 0; i < treeline.length; i += 2) {
          ctx.fillStyle = rgbMix(i % 4 ? [255, 180, 210] : WHITE, SHADE, s * 0.4);
          ctx.fillRect(i * 3 + 1, treeline[i] + 1 + (i % 3), 1, 1);
        }
      } else if (id === 'harvest') {
        for (let k = 0; k < 5; k++) {
          const x = 30 + k * 34, y = HORIZON - 2;
          ctx.fillStyle = rgbMix([230, 190, 80], SHADE, dusk);
          ctx.fillRect(x, y - 3, 5, 3);
          ctx.fillRect(x + 1, y - 5, 3, 2);
          ctx.fillRect(x + 2, y - 7, 1, 2);
          ctx.fillStyle = rgbMix([170, 120, 40], SHADE, dusk);
          ctx.fillRect(x, y - 2, 5, 1);
        }
      }
      if (id === 'maslenitsa') {
        const x = 150, y = HORIZON - 2;
        ctx.fillStyle = rgbMix([110, 76, 40], SHADE, dusk);
        ctx.fillRect(x, y - 18, 1, 18);
        ctx.fillRect(x - 4, y - 14, 9, 1);
        ctx.fillStyle = rgbMix([230, 196, 90], SHADE, dusk);
        ctx.fillRect(x - 2, y - 13, 5, 7);
        ctx.fillRect(x - 3, y - 7, 7, 3);
        ctx.fillStyle = rgbMix([240, 210, 170], SHADE, dusk);
        ctx.fillRect(x - 1, y - 17, 3, 3);
        ctx.fillStyle = rgbMix([220, 60, 60], SHADE, dusk);
        ctx.fillRect(x - 2, y - 18, 5, 1);
        ctx.fillRect(x - 2, y - 11, 5, 1);
        if (s > 0.6) { flame(x - 3, y, clamp(s - 0.6, 0, 1)); flame(x + 3, y, clamp(s - 0.6, 0, 1)); }
      } else if (id === 'kupala') {
        const k = clamp(s * 0.8, 0.2, 1);
        for (let b = 0; b < 2; b++) {
          const x = b ? 172 : 62, y = HORIZON - 2;
          ctx.fillStyle = rgbMix([90, 60, 40], SHADE, dusk);
          ctx.fillRect(x - 3, y - 1, 7, 1);
          flame(x, y - 1, k);
          flame(x - 2, y, k * 0.6);
          flame(x + 2, y, k * 0.6);
        }
        if (night > 0.2) {
          const b = 0.6 + 0.4 * Math.sin(g.t * 3);
          ctx.fillStyle = rgbStr(255, 80, 60, night * b);
          ctx.fillRect(110, HORIZON - 4, 3, 1);
          ctx.fillRect(111, HORIZON - 5, 1, 3);
          ctx.fillStyle = rgbStr(255, 120, 90, night * b * 0.2);
          ctx.fillRect(107, HORIZON - 8, 9, 8);
        }
      } else if (id === 'pumpkin') {
        const k = clamp((s - 0.6) * 1.5, 0, 1);
        lantern(36, HORIZON - 1, k);
        lantern(118, HORIZON - 1, k);
        lantern(196, HORIZON - 1, k);
      }
    };
    // вода: свечи-гадания, льдины, венки, огоньки, призрак, туман
    const drawWaterDeco = (s, dusk, night) => {
      const id = MT.id;
      if (id === 'thaw') {
        for (let i = 0; i < deco.length; i++) { const d = deco[i];
          const x = Math.round(d.x), y = Math.round(d.y);
          ctx.fillStyle = rgbMix([226, 240, 248], SHADE, s * 0.45);
          ctx.fillRect(x, y, d.w, 2);
          ctx.fillRect(x + 1, y - 1, d.w - 2, 1);
          ctx.fillStyle = rgbMix([150, 190, 220], SHADE, s * 0.45, 0.8);
          ctx.fillRect(x, y + 2, d.w, 1);
        }
      } else if (id === 'yule' || id === 'kupala') {
        const k = clamp(s * 0.8, 0.25, 1);
        for (let i = 0; i < (id === 'yule' ? 4 : 5); i++) { const d = deco[i];
          const x = Math.round(d.x), y = Math.round(d.y + Math.sin(g.t * 1.5 + d.p) * 0.6);
          if (id === 'yule') {
            ctx.fillStyle = rgbMix([120, 80, 40], SHADE, dusk);
            ctx.fillRect(x, y, 4, 2);
            ctx.fillStyle = '#f0e8d0';
            ctx.fillRect(x + 1, y - 2, 1, 2);
            flame(x + 1, y - 2, k * 0.7);
          } else {
            ctx.fillStyle = rgbMix([60, 140, 60], SHADE, dusk);
            ctx.fillRect(x, y, 5, 1);
            ctx.fillRect(x - 1, y + 1, 7, 1);
            ctx.fillStyle = rgbMix(i % 2 ? [255, 220, 70] : [230, 70, 70], SHADE, dusk);
            ctx.fillRect(x + (i % 3), y, 1, 1);
            ctx.fillRect(x + 4 - (i % 2), y + 1, 1, 1);
            ctx.fillStyle = '#f0e8d0';
            ctx.fillRect(x + 2, y - 2, 1, 2);
            flame(x + 2, y - 2, k * 0.7);
          }
        }
      } else if (id === 'fog' || id === 'pumpkin') {
        if (id === 'fog') {
          for (let i = 0; i < deco.length; i++) { const d = deco[i];
            const b = 0.5 + 0.5 * Math.sin(g.t * 1.7 + d.p * 3);
            const x = Math.round(d.x + Math.sin(g.t * 0.4 + d.p) * 12), y = Math.round(d.y + Math.sin(g.t * 0.9 + d.p) * 3) - 4;
            ctx.fillStyle = rgbStr(120, 255, 210, (0.35 + 0.5 * clamp(s, 0, 1)) * b);
            ctx.fillRect(x, y, 1, 1);
            ctx.fillStyle = rgbStr(120, 255, 210, 0.12 * b);
            ctx.fillRect(x - 2, y - 2, 5, 5);
          }
        } else if (s > 0.8) {
          // призрак над водой
          const d = deco[0];
          const a = clamp((s - 0.8) * 1.5, 0, 0.6) * (0.7 + 0.3 * Math.sin(g.t * 2));
          const x = Math.round(30 + ((g.t * 5 + d.p * 30) % 200)), y = Math.round(HORIZON + 12 + Math.sin(g.t * 1.2) * 3);
          ctx.fillStyle = rgbStr(230, 240, 255, a);
          ctx.fillRect(x, y, 5, 5);
          ctx.fillRect(x + 1, y - 1, 3, 1);
          ctx.fillRect(x + (Math.floor(g.t * 4) % 2), y + 5, 1, 1);
          ctx.fillRect(x + 3 - (Math.floor(g.t * 4) % 2), y + 5, 1, 1);
          ctx.fillStyle = rgbStr(20, 20, 40, a);
          ctx.fillRect(x + 1, y + 1, 1, 1);
          ctx.fillRect(x + 3, y + 1, 1, 1);
        }
      } else if (id === 'newyear' || id === 'maslenitsa') {
        ctx.fillStyle = rgbMix([226, 238, 246], SHADE, s * 0.4, 0.85);
        ctx.fillRect(0, HORIZON, W, 2);
        for (let x = 0; x < W; x += 14) ctx.fillRect(x, HORIZON + 2, 6 + (x % 5), 1);
      }
    };
    // причал: снег, блины, гирлянды, тыквы, ёлка...
    const drawPierDeco = (s, dusk) => {
      const id = MT.id;
      const k = clamp((s - 0.5) * 1.4, 0, 1);
      if (id === 'yule' || id === 'newyear' || id === 'maslenitsa') {
        ctx.fillStyle = rgbMix(WHITE, SHADE, s * 0.35);
        ctx.fillRect(PIER_X, DECK_Y - 1, W - PIER_X, 1);
        ctx.fillRect(SEAT_X - 2, DECK_Y - 5, 7, 1);
      }
      if (id === 'maslenitsa') {
        ctx.fillStyle = rgbMix([240, 240, 236], SHADE, dusk);
        ctx.fillRect(255, DECK_Y - 1, 8, 1);
        ctx.fillStyle = rgbMix([230, 180, 90], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 4, 6, 3);
        ctx.fillStyle = rgbMix([200, 140, 60], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 3, 6, 1);
        ctx.fillStyle = rgbMix([255, 236, 150], SHADE, dusk);
        ctx.fillRect(258, DECK_Y - 5, 2, 1);
      } else if (id === 'jest') {
        ctx.fillStyle = rgbMix(WOOD_C, WOOD_D, dusk);
        ctx.fillRect(234, DECK_Y - 28, 1, 28);
        ctx.fillRect(318, DECK_Y - 28, 1, 28);
        for (let x = 235; x < 318; x += 2) {
          const t = (x - 234) / 84;
          const y = DECK_Y - 27 + Math.round(Math.sin(t * Math.PI) * 5);
          ctx.fillStyle = 'rgba(240,240,240,0.6)';
          ctx.fillRect(x, y, 2, 1);
          if ((x - 235) % 6 === 0) {
            ctx.fillStyle = rgbMix(RGB_RB[((x - 235) / 6) % 6], SHADE, dusk);
            ctx.fillRect(x, y + 1, 3, 1);
            ctx.fillRect(x + 1, y + 2, 1, 1);
          }
        }
      } else if (id === 'bloom') {
        ctx.fillStyle = rgbMix([150, 90, 60], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 4, 5, 4);
        ctx.fillStyle = rgbMix([70, 140, 60], SHADE, dusk);
        ctx.fillRect(258, DECK_Y - 7, 1, 3);
        ctx.fillStyle = rgbMix([255, 150, 200], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 9, 2, 2);
        ctx.fillRect(259, DECK_Y - 8, 2, 2);
        ctx.fillStyle = rgbMix([255, 230, 90], SHADE, dusk);
        ctx.fillRect(257, DECK_Y - 9, 1, 1);
        if (s < 1.3) {
          ctx.fillStyle = '#ffd040';
          for (let i = 0; i < 2; i++) ctx.fillRect(Math.round(250 + Math.sin(g.t * 2.3 + i * 3) * 9), Math.round(DECK_Y - 12 + Math.sin(g.t * 4.1 + i) * 3), 1, 1);
        }
      } else if (id === 'harvest') {
        ctx.fillStyle = rgbMix(WICK_C, WICK_D, dusk);
        ctx.fillRect(255, DECK_Y - 4, 7, 4);
        ctx.fillStyle = rgbMix([216, 58, 42], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 6, 2, 2);
        ctx.fillRect(259, DECK_Y - 6, 2, 2);
        ctx.fillRect(257, DECK_Y - 7, 2, 1);
        ctx.fillStyle = rgbMix([230, 190, 80], SHADE, dusk);
        ctx.fillRect(312, DECK_Y - 5, 5, 5);
        ctx.fillRect(313, DECK_Y - 8, 3, 3);
      } else if (id === 'pumpkin') {
        lantern(234, DECK_Y, k);
        lantern(311, DECK_Y, k);
      } else if (id === 'starfall') {
        ctx.fillStyle = rgbMix([90, 70, 50], SHADE, dusk);
        ctx.fillRect(256, DECK_Y - 5, 1, 5);
        ctx.fillRect(260, DECK_Y - 5, 1, 5);
        ctx.fillRect(258, DECK_Y - 6, 1, 6);
        ctx.fillStyle = rgbMix([180, 150, 90], SHADE, dusk);
        ctx.fillRect(254, DECK_Y - 9, 7, 2);
        ctx.fillRect(253, DECK_Y - 10, 2, 1);
      } else if (id === 'fog') {
        ctx.fillStyle = rgbMix(WOOD_C, WOOD_D, dusk);
        ctx.fillRect(235, DECK_Y - 16, 1, 16);
        ctx.fillRect(235, DECK_Y - 16, 4, 1);
        ctx.fillStyle = '#2a2420';
        ctx.fillRect(237, DECK_Y - 15, 3, 4);
        ctx.fillStyle = rgbStr(255, 220, 120, 0.6 + 0.4 * k);
        ctx.fillRect(238, DECK_Y - 14, 1, 2);
        ctx.fillStyle = rgbStr(255, 210, 120, 0.06 + 0.12 * k);
        ctx.fillRect(232, DECK_Y - 20, 13, 13);
      } else if (id === 'thaw') {
        ctx.fillStyle = rgbMix([200, 230, 250], SHADE, s * 0.4);
        for (let x = PIER_X + 3; x < W; x += 7) {
          ctx.fillRect(x, DECK_Y + 5, 1, 2 + (x % 3));
          const dy = (g.t * 18 + x * 3) % 22;
          ctx.fillRect(x, DECK_Y + 8 + Math.round(dy), 1, 1);
        }
      } else if (id === 'kupala') {
        ctx.fillStyle = rgbMix([60, 140, 60], SHADE, dusk);
        ctx.fillRect(301, DECK_Y - 9, 6, 1);
        ctx.fillStyle = rgbMix([255, 220, 70], SHADE, dusk);
        ctx.fillRect(302, DECK_Y - 10, 1, 1);
        ctx.fillStyle = rgbMix([230, 70, 70], SHADE, dusk);
        ctx.fillRect(305, DECK_Y - 10, 1, 1);
      }
      if (id === 'newyear') {
        // ёлочка в конце причала с гирляндой и подарком
        const x = 313, y = DECK_Y;
        ctx.fillStyle = rgbMix([90, 60, 40], SHADE, dusk);
        ctx.fillRect(x, y - 2, 2, 2);
        ctx.fillStyle = rgbMix([40, 120, 70], SHADE, dusk * 0.8);
        for (let r = 0; r < 14; r++) { const w = 1 + ((r % 5) + Math.floor(r / 5) * 2); ctx.fillRect(x + 1 - (w >> 1), y - 16 + r, w, 1); }
        ctx.fillStyle = '#ffe060';
        ctx.fillRect(x, y - 18, 2, 2);
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = RAINBOW[(i + Math.floor(g.t * 3)) % 6];
          ctx.fillRect(x - 3 + ((i * 3) % 8), y - 13 + i * 2, 1, 1);
        }
        ctx.fillStyle = rgbMix([224, 72, 72], SHADE, dusk);
        ctx.fillRect(256, y - 5, 5, 5);
        ctx.fillStyle = rgbMix([255, 224, 96], SHADE, dusk);
        ctx.fillRect(258, y - 5, 1, 5);
        ctx.fillRect(256, y - 3, 5, 1);
        // гирлянда по столбикам
        for (let x2 = PIER_X + 2; x2 < 306; x2 += 5) {
          ctx.fillStyle = RAINBOW[(x2 + Math.floor(g.t * 2)) % 6];
          ctx.fillRect(x2, DECK_Y + 4 + ((x2 >> 2) % 2), 1, 1);
        }
      }
    };
    // поверх всего: снег, лепестки, листья, вспышка
    const drawOverDeco = () => {
      if (SEA.fall) {
        const snow = SEA.fall === 'snow';
        const n = snow ? fall.length : 22;
        const cols = SEA.fcol;
        for (let i = 0; i < n; i++) { const f = fall[i];
          ctx.fillStyle = cols[f.c % cols.length];
          ctx.fillRect(Math.round(f.x), Math.round(f.y), snow ? (i % 5 === 0 ? 2 : 1) : 2, 1);
        }
      }
      if (g.flash > 0) {
        ctx.fillStyle = rgbStr(255, 255, 240, clamp(g.flash, 0, 0.3) * 0.8);
        ctx.fillRect(0, 0, W, H);
      }
    };

    const draw = () => {
      const s = Math.round(clamp(g.sky, 0, 2) * 128) / 128;
      blendPal(s);
      const dusk = Math.min(1, s * 0.6);
      const night = clamp((s - 1.15) / 0.6, 0, 1) * (1 - g.cloudK * 0.7);
      const starA = MT.id === 'starfall' ? Math.max(night, clamp((s - 0.75) / 0.6, 0, 1) * (1 - g.cloudK * 0.7)) : night;
      for (let y = 0; y < HORIZON; y += 4) {
        ctx.fillStyle = rgbMix(P3.top, P3.bot, y / HORIZON);
        ctx.fillRect(0, y, W, 4);
      }
      if (starA > 0) {
        for (let i9 = 0; i9 < stars.length; i9++) { const st = stars[i9];
          const a = starA * (0.45 + 0.45 * Math.sin(g.t * 1.4 + st.p));
          ctx.fillStyle = rgbStr(255, 250, 230, a);
          ctx.fillRect(st.x, st.y, st.big ? 2 : 1, 1);
        }
      }
      const sunX = 120;
      const sunY = Math.round(lerp(26, HORIZON + 10, clamp(s / 1.12, 0, 1)));
      const sunA = 1 - g.cloudK * 0.75;
      if (s < 1.12) {
        disc(sunX, sunY, 12, rgbStr(P3.sun[0], P3.sun[1], P3.sun[2], 0.15 * sunA));
        disc(sunX, sunY, 8, rgbStr(P3.sun[0], P3.sun[1], P3.sun[2], 0.35 * sunA));
        disc(sunX, sunY, 6, rgbMix(P3.sun, WHITE, 0.4, sunA));
      }
      const moonX = 196;
      const moonY = Math.round(lerp(HORIZON + 8, 22, clamp((s - 1) / 0.6, 0, 1)));
      if (s > 1) {
        disc(moonX, moonY, 9, rgbStr(220, 228, 255, 0.12 * sunA));
        disc(moonX, moonY, 5, rgbStr(232, 236, 248, sunA));
        ctx.fillStyle = rgbStr(196, 202, 220, sunA);
        if (moonY + 1 < HORIZON - 1) ctx.fillRect(moonX - 2, moonY - 1, 2, 2);
        if (moonY + 2 < HORIZON - 1) ctx.fillRect(moonX + 1, moonY + 1, 1, 1);
      }
      for (let i10 = 0; i10 < clouds.length; i10++) { const c = clouds[i10];
        if (i10 >= 3 + Math.round(g.cloudK * 2)) break;
        const base = s <= 1 ? rgbMix(WHITE, CLOUD_SET, s, 0.7 + g.cloudK * 0.2) : rgbMix(CLOUD_SET, CLOUD_NIGHT, s - 1, 0.7 + g.cloudK * 0.2);
        ctx.fillStyle = base;
        const cx = Math.floor(c.x), cy = Math.floor(c.y);
        const cw = Math.floor(c.w * (1 + g.cloudK * 0.8));
        ctx.fillRect(cx, cy, cw, 4 + Math.round(g.cloudK * 3));
        ctx.fillRect(cx + 4, cy - 2, Math.floor(cw * 0.5), 2);
      }
      drawSkyDeco(s, night);
      drawTrees(s, dusk);
      drawShoreDeco(s, dusk, night);
      // вода
      for (let y = HORIZON; y < H; y += 2) {
        ctx.fillStyle = rgbMix(P3.water, P3.deep, (y - HORIZON) / (H - HORIZON));
        ctx.fillRect(0, y, W, 2);
      }
      if (scene.snag) {
        // омут: тёмное пятно глубины
        ctx.fillStyle = rgbMix(P3.deep, BLACK, 0.3, 0.45);
        ctx.fillRect(60, 112, 110, 3);
        ctx.fillRect(48, 115, 134, 6);
        ctx.fillRect(60, 121, 110, 3);
      }
      const refX = s < 1.12 ? sunX : moonX;
      const refA = (s < 1.12 ? 1 - clamp((s - 0.9) / 0.22, 0, 1) * 0.7 : clamp((s - 1.1) / 0.4, 0, 1) * 0.7) * sunA;
      for (let y = HORIZON + 1; y < H; y += 3) {
        const w = Math.round(3 + (y - HORIZON) * 0.25 + Math.sin(g.t * 2 + y) * 2);
        ctx.fillStyle = rgbStr(P3.sun[0], P3.sun[1], P3.sun[2], Math.max(0, (0.35 - (y - HORIZON) / 360) * refA));
        ctx.fillRect(refX - w, y, w * 2, 1);
      }
      ctx.fillStyle = rgbMix(P3.water, WHITE, 0.35, 0.6);
      for (let i11 = 0; i11 < ripples.length; i11++) { const r = ripples[i11];
        const x = Math.floor((r.x + g.t * r.v) % (W + 20)) - 10;
        const w = Math.max(1, Math.round(r.w * (0.6 + 0.4 * Math.sin(g.t + r.p))));
        ctx.fillRect(x, Math.floor(r.y), w, 1);
      }
      // камни (горное озеро)
      for (let i = 0; i < rocks.length; i++) { const r = rocks[i];
        if (!r.on) continue;
        ctx.fillStyle = rgbMix(ROCK_C, ROCK_D, dusk);
        ctx.fillRect(r.x, r.y - 2, r.w, 3);
        ctx.fillRect(r.x + 1, r.y - 3, r.w - 2, 1);
        ctx.fillStyle = rgbMix(P3.water, WHITE, 0.4, 0.5);
        ctx.fillRect(r.x - 1, r.y + 1, r.w + 2, 1);
      }
      if (scene.snag) {
        // коряга
        ctx.fillStyle = rgbMix(SNAG_C, SNAG_D, dusk);
        ctx.fillRect(84, 124, 14, 2);
        ctx.fillRect(95, 119, 2, 5);
        ctx.fillRect(97, 117, 3, 2);
        ctx.fillRect(86, 121, 2, 3);
      }
      for (let i12 = 0; i12 < pads.length; i12++) { const p = pads[i12];
        if (!p.on) continue;
        ctx.fillStyle = rgbMix(PAD_C, PAD_D, dusk);
        ctx.fillRect(p.x, p.y, 7, 2);
        ctx.fillRect(p.x + 1, p.y - 1, 4, 1);
        ctx.fillStyle = rgbMix(FLOW_C, FLOW_D, dusk);
        ctx.fillRect(p.x + 2, p.y - 2, 2, 1);
      }
      drawWaterDeco(s, dusk, night);
      drawDuck(dusk);
      // туман у старицы (и везде в месяц туманов)
      if (LOOKS[scene.lake].trees === 'willow' || MT.id === 'fog') {
        const fa = MT.id === 'fog' ? 0.26 : 0.16;
        for (let i = 0; i < fogs.length; i++) { const f = fogs[i];
          ctx.fillStyle = rgbMix(FOG_C, SHADE, s * 0.4, fa);
          ctx.fillRect(Math.round(f.x), Math.round(f.y), Math.round(f.w), 5);
          ctx.fillRect(Math.round(f.x) + 10, Math.round(f.y) - 2, Math.round(f.w) - 20, 2);
        }
      }
      for (let i13 = 0; i13 < reeds.length; i13++) { const r = reeds[i13];
        if (!r.on) continue;
        const sway = Math.round(Math.sin(g.t * 1.3 + r.p));
        ctx.fillStyle = rgbMix(REED_C, REED_D, dusk);
        ctx.fillRect(r.x, H - r.h, 1, r.h);
        ctx.fillRect(r.x + sway, H - r.h - 2, 1, 2);
        ctx.fillStyle = rgbMix(CAT_C, CAT_D, dusk);
        ctx.fillRect(r.x + sway, H - r.h - 6, 2, 4);
      }
      for (let i14 = 0; i14 < flies.length; i14++) { const f = flies[i14];
        if (g.rainK > 0.6) break;
        const fx = Math.round(f.x), fy = Math.round(f.y + Math.sin(g.t * 5 + f.p));
        if (night < 1) {
          ctx.fillStyle = rgbMix(DRAGON, SHADE, dusk * 0.5, 1 - night);
          ctx.fillRect(fx, fy, 4, 1);
          ctx.fillStyle = rgbStr(230, 240, 255, (Math.floor(g.t * 20 + f.p) % 2 ? 0.7 : 0.3) * (1 - night));
          ctx.fillRect(fx + 1, fy - 1, 1, 1);
          ctx.fillRect(fx + 2, fy - 1, 1, 1);
        }
        if (night > 0) {
          const b = 0.5 + 0.5 * Math.sin(g.t * 2.2 + f.p * 3);
          ctx.fillStyle = rgbStr(255, 240, 120, night * b);
          ctx.fillRect(fx, fy + 6, 1, 1);
          ctx.fillStyle = rgbStr(255, 240, 120, night * b * 0.25);
          ctx.fillRect(fx - 1, fy + 5, 3, 3);
        }
      }
      // причал
      const woodS = rgbMix(WOOD_C, WOOD_D, dusk);
      const woodDS = rgbMix(WOOD_C, BLACK, 0.3 + dusk * 0.2);
      for (let x = PIER_X + 4; x < W; x += 18) {
        ctx.fillStyle = woodDS;
        ctx.fillRect(x, DECK_Y, 3, H - DECK_Y);
        ctx.fillStyle = rgbMix(P3.water, WHITE, 0.3, 0.5);
        ctx.fillRect(x - 2, DECK_Y + 30 + Math.round(Math.sin(g.t * 2 + x)), 7, 1);
      }
      ctx.fillStyle = woodS;
      ctx.fillRect(PIER_X, DECK_Y, W - PIER_X, 4);
      ctx.fillStyle = woodDS;
      for (let x = PIER_X + 5; x < W; x += 6) ctx.fillRect(x, DECK_Y, 1, 4);
      ctx.fillRect(PIER_X, DECK_Y + 4, W - PIER_X, 1);
      ctx.fillRect(SPOT_X - 1, DECK_Y - 3, 5, 1);
      ctx.fillRect(SPOT_X - 1, DECK_Y - 2, 1, 2);
      ctx.fillRect(SPOT_X + 3, DECK_Y - 2, 1, 2);
      ctx.fillStyle = woodS;
      ctx.fillRect(SEAT_X - 2, DECK_Y - 4, 7, 4);
      ctx.fillStyle = woodDS;
      ctx.fillRect(SEAT_X - 2, DECK_Y - 2, 7, 1);
      const nb = Math.min(5, basketN);
      for (let i = 0; i < nb; i++) {
        ctx.fillStyle = i % 2 ? '#c9a640' : '#5f8a5a';
        ctx.fillRect(BASKET_X + 1 + i, DECK_Y - 9 + (i % 2), 2, 3);
      }
      ctx.fillStyle = rgbMix(WICK_C, WICK_D, dusk);
      ctx.fillRect(BASKET_X, DECK_Y - 7, 8, 7);
      ctx.fillStyle = rgbMix(WICK_C, BLACK, 0.25 + dusk * 0.3);
      ctx.fillRect(BASKET_X, DECK_Y - 5, 8, 1);
      ctx.fillRect(BASKET_X, DECK_Y - 2, 8, 1);
      ctx.fillStyle = rgbMix(BUCK_C, BUCK_D, dusk);
      ctx.fillRect(BUCKET_X, DECK_Y - 7, 8, 7);
      ctx.fillStyle = rgbMix(BUCK2_C, BUCK2_D, dusk);
      ctx.fillRect(BUCKET_X, DECK_Y - 7, 8, 1);
      if (g.caughtN) {
        ctx.fillStyle = '#c9a640';
        ctx.fillRect(BUCKET_X + 2, DECK_Y - 9, 3, 2);
      }
      if (g.caughtN > 3) {
        ctx.fillStyle = '#5f8a5a';
        ctx.fillRect(BUCKET_X + 4, DECK_Y - 10, 3, 3);
      }
      drawPierDeco(s, dusk);

      if (old.x >= you.x) { drawPerson(old, true, dusk); drawPerson(you, false, dusk); }
      else { drawPerson(you, false, dusk); drawPerson(old, true, dusk); }
      const tip = rodTip();
      const tx = tip.x, ty = tip.y;
      const base = rodBase();
      line(base.x, base.y, tx, ty, rgbMix(ROD_C, ROD_D, dusk));

      const lineC = 'rgba(240,240,240,0.7)';
      if (g.st === 'fly' || g.st === 'retrieve') {
        sagLine(tx, ty, g.bob.x, g.bob.y, 2, lineC);
        drawBobber(g.bob.x, g.bob.y);
      } else if (g.st === 'wait' || g.st === 'bite' || g.st === 'reel') {
        let by = g.bob.ty;
        let bx = g.bob.tx;
        if (g.st === 'wait') by += g.nibble > 0 ? 1 : Math.round(Math.sin(g.t * 2.5) * 0.6);
        if (g.st === 'bite') { const t = tierOf(g.catchSp); by += (t < 0 ? 1 : 1 + Math.min(3, t)) + (Math.floor(g.t * 12) % 2); }
        if (g.st === 'reel') { by += 2; bx += Math.round(Math.sin(g.t * 9) * 2); }
        sagLine(tx, ty, bx, by, g.st === 'reel' ? 0 : 6, lineC);
        const rr = Math.floor((g.t * 6) % 6);
        ctx.fillStyle = 'rgba(230,245,255,0.45)';
        ctx.fillRect(bx - 3 - rr, by + 2, 2, 1);
        ctx.fillRect(bx + 2 + rr, by + 2, 2, 1);
        if (g.st === 'reel') {
          ctx.fillStyle = 'rgba(20,30,50,0.35)';
          ctx.fillRect(bx - 4, by + 3, 9, 2);
        }
        drawBobber(bx, by);
        if (g.st === 'bite') {
          const bl = Math.floor(g.t * 8) % 2 === 0;
          ctx.fillStyle = '#2a1a10';
          ctx.fillRect(bx - 3, by - 16, 7, 9);
          drawText(ctx, '!', bx, by - 14, bl ? '#ffe060' : '#ffffff', 1);
          drawText(ctx, '!', bx - 1, by - 14, bl ? '#ffe060' : '#ffffff', 1);
        }
        if (g.st === 'wait' && g.spooked > 0) drawText(ctx, '?', bx - 1, by - 12, '#ffffff', 1);
      }

      for (let i15 = 0; i15 < flyers.length; i15++) { const f = flyers[i15];
        if (!f.on || f.delay > 0) continue;
        const k = f.t;
        const x = lerp(f.x0, f.x1, k);
        const y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * f.h;
        const sp = f.spr;
        drawSprite(ctx, sp, x - (sp.w >> 1), y - (sp.h >> 1), 1, f.flip);
      }
      for (let i16 = 0; i16 < parts.length; i16++) { const p = parts[i16];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      // дождь
      if (g.rainK > 0.02) {
        ctx.fillStyle = rgbStr(200, 220, 240, 0.45 * g.rainK);
        const n = Math.round(drops.length * g.rainK);
        for (let i = 0; i < n; i++) { const d = drops[i]; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3); }
      }
      drawOverDeco();
      // затемнение при переходе
      if (g.fade > 0) {
        ctx.fillStyle = rgbStr(10, 12, 20, g.fade < 1 ? g.fade : 2 - g.fade);
        ctx.fillRect(0, 0, W, H);
      }

      const hud = clamp(g.hud, 0, 1);
      if (hud <= 0.01) return;
      ctx.globalAlpha = hud;
      drawHud();
      ctx.globalAlpha = 1;
    };

    // ---------- HUD ----------
    const box = (x, y, w, h, a) => {
      ctx.fillStyle = rgbStr(20, 14, 10, a);
      ctx.fillRect(x, y, w, h);
    };
    const shadowLabel = (str, x, y, c, sc = 1) => {
      drawLabel(ctx, str, x + 1, y + 1, 'rgba(10,6,4,0.7)', sc);
      return drawLabel(ctx, str, x, y, c, sc);
    };
    const drawHud = () => {
      const inPlay = g.phase === 'play';
      const pr = P.p;
      // шкала заряда
      if (inPlay && g.st === 'charge' && !g.panel) {
        const bx = 196, by = DECK_Y - 40, bw = 44;
        box(bx - 1, by - 1, bw + 2, 6, 0.8);
        for (let i = 0; i < bw; i += 4) {
          ctx.fillStyle = rgbStr(lerp(90, 250, i / bw), lerp(170, 200, i / bw), lerp(230, 50, i / bw), 0.45);
          ctx.fillRect(bx + i, by, 4, 4);
        }
        ctx.fillStyle = rgbStr(lerp(120, 255, g.power), lerp(210, 220, g.power), lerp(255, 80, g.power));
        ctx.fillRect(bx, by, Math.round(bw * g.power), 4);
        drawIcon(ctx, 'trophy', bx + bw + 3, by - 2);
        const px = Math.round(214 - g.power * 178), py = Math.round(146 - g.power * 44);
        if (Math.floor(g.t * 6) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(px - 2, py, 1, 1);
          ctx.fillRect(px + 2, py, 1, 1);
          ctx.fillRect(px, py - 2, 1, 1);
          ctx.fillRect(px, py + 2, 1, 1);
        }
      }
      // вываживание
      if (inPlay && g.st === 'reel' && !g.panel) {
        const R = g.R;
        const px = 282, py = 34, ph = 118;
        box(px - 4, py - 4, 34, ph + 8, 0.85);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(px - 4, py - 4, 34, 1);
        ctx.fillRect(px - 4, py + ph + 3, 34, 1);
        ctx.fillStyle = rgbMix(P3.water, P3.deep, 0.5);
        ctx.fillRect(px, py, 14, ph);
        if (g.beh === 3) {
          ctx.fillStyle = 'rgba(220,240,255,0.18)';
          for (let y = py + 4; y < py + ph; y += 9) ctx.fillRect(px + 1, y, 12, 1);
        }
        const zh = Math.round(R.zone * ph);
        const zy = Math.round(py + ph - (g.zone * ph) - zh);
        const inside = g.fish >= g.zone && g.fish <= g.zone + R.zone;
        ctx.fillStyle = inside ? '#5fd36a' : '#3e9a4a';
        ctx.fillRect(px + 1, zy, 12, zh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 1, zy, 12, 1);
        ctx.fillRect(px + 1, zy + zh - 1, 12, 1);
        const fy = Math.round(py + ph - g.fish * ph) - 2;
        const c = g.catchSp;
        const t = tierOf(c);
        const fc = c === BOOT ? '#7a5a3a' : c === CHEST ? '#b07a3a' : c.ev ? c.col : t >= 0 ? TIERS[t].col : '#e0c050';
        if (g.fishVis > 0) {
          ctx.fillStyle = '#1a1410';
          ctx.fillRect(px + 3, fy - 1, 9, 6);
          ctx.fillStyle = fc;
          ctx.fillRect(px + 4, fy, 5, 4);
          ctx.fillRect(px + 9, fy + 1, 2, 2);
          ctx.fillStyle = '#1a1410';
          ctx.fillRect(px + 5, fy + 1, 1, 1);
        } else {
          ctx.fillStyle = 'rgba(200,240,255,0.25)';
          ctx.fillRect(px + 4, fy + 1, 5, 2);
        }
        const prh = Math.round(clamp(g.prog, 0, 1) * ph);
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(px + 18, py, 6, ph);
        ctx.fillStyle = g.prog < 0.25 ? '#e05040' : g.prog < 0.6 ? '#f0c040' : '#60d870';
        ctx.fillRect(px + 19, py + ph - prh, 4, prh);
        drawIcon(ctx, 'up', px + 4, py + ph + 6);
        if (held && Math.floor(g.t * 3) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(px, py, 14, ph);
        }
        if (t === 4) {
          ctx.fillStyle = Math.floor(g.t * 4) % 2 ? '#ffd34a' : '#fff2a8';
          ctx.fillRect(px - 4, py - 4, 34, 1);
          ctx.fillRect(px - 4, py + ph + 3, 34, 1);
        }
      }
      // показ улова
      if (inPlay && g.st === 'show' && g.show && !g.panel) {
        const c = g.show;
        const sp = c.spr;
        const sc = sp.w > 14 ? 2 : 3;
        const age = 1.9 - g.timer;
        const pop = Math.min(1, age * 5);
        const cx = 150, cy = 40 - Math.round((1 - pop) * 10);
        const t = tierOf(c);
        box(cx - 52, cy - 17, 104, 58, 0.85);
        ctx.fillStyle = c.ev ? c.col : t >= 0 ? TIERS[t].col : '#a08060';
        ctx.fillRect(cx - 52, cy - 17, 104, 1);
        ctx.fillRect(cx - 52, cy + 40, 104, 1);
        drawSprite(ctx, sp, cx - Math.round(sp.w * sc / 2), cy + 3 + Math.round(Math.sin(age * 6) * 1) - Math.round(sp.h * sc / 2), sc);
        if (t >= 2 || c === CHEST || c.ev) {
          ctx.fillStyle = '#fff6b0';
          const kk = Math.floor(age * 10) % 4;
          ctx.fillRect(cx - 34 + kk * 20, cy - 10 + (kk % 2) * 22, 1, 3);
          ctx.fillRect(cx - 35 + kk * 20, cy - 9 + (kk % 2) * 22, 3, 1);
        }
        const nw = labelWidth(c.name);
        shadowLabel(c.name, cx - (nw >> 1), cy + 18, c.ev ? c.col : t >= 0 ? TIERS[t].col : '#e0d0b0');
        if (g.showSize > 0) {
          drawInt(ctx, g.showSize, cx - 46, cy + 30, '#e8e2d4');
          drawLabel(ctx, 'СМ', cx - 46 + intWidth(g.showSize) + 3, cy + 30, '#a89a88');
        }
        if (g.showCoins > 0) {
          const cw = intWidth(g.showCoins) + 9;
          drawText(ctx, '+', cx + 44 - cw - 4, cy + 30, '#ffe070');
          drawSprite(ctx, IC.coin, cx + 44 - cw, cy + 30);
          drawInt(ctx, g.showCoins, cx + 51 - cw, cy + 30, '#ffe070');
        }
        if (g.showNew && Math.floor(age * 4) % 2 === 0) {
          const w2 = labelWidth('НОВЫЙ ВИД!');
          shadowLabel('НОВЫЙ ВИД!', cx - (w2 >> 1), cy - 14, '#ffe070');
        } else if (c.ev) {
          const ch = P.p.ev;
          let x5 = cx - 30;
          x5 += drawLabel(ctx, 'СОБЫТИЕ', x5, cy - 14, c.col) + 5;
          if (ch) { x5 += drawInt(ctx, ch.n, x5, cy - 14, '#ffffff') + 1; x5 += drawText(ctx, '/', x5, cy - 14, '#8a7a70') + 1; drawInt(ctx, MT.goal(), x5, cy - 14, '#c8b890'); }
        } else if (t >= 0) {
          const w2 = labelWidth(TIERS[t].name);
          drawLabel(ctx, TIERS[t].name, cx - (w2 >> 1), cy - 14, TIERS[t].col);
        }
      }
      if (inPlay && g.st === 'miss') {
        const bx = g.bob.tx, by = g.bob.ty;
        drawText(ctx, 'x', bx - 3, by - 16, '#2a1a10', 2);
        drawText(ctx, 'x', bx - 3, by - 17, '#ff7060', 2);
      }

      // ---- верх слева: уровень, опыт, монеты, силы ----
      box(2, 2, 104, 30, 0.55);
      drawLabel(ctx, 'УР', 5, 5, '#c8b890');
      drawInt(ctx, pr.lvl, 16, 5, '#ffffff');
      const need = xpNeed(pr.lvl);
      const xw = pr.lvl >= MAX_LVL ? 60 : Math.round(60 * clamp(pr.xp / need, 0, 1));
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(28, 6, 62, 3);
      ctx.fillStyle = '#8fd0ff';
      ctx.fillRect(29, 7, xw, 1);
      if (P.author) {
        ctx.fillStyle = '#ff6ab0';
        ctx.fillRect(94, 4, 9, 7);
        drawLabel(ctx, 'A', 96, 5, '#ffffff');
      }
      drawSprite(ctx, IC.coin, 5, 13);
      drawInt(ctx, pr.coins, 12, 13, '#ffe070');
      if (pr.gold > 0) {
        drawSprite(ctx, IC.gold, 60, 14);
        drawInt(ctx, pr.gold, 65, 13, '#ffd34a');
      }
      // силы
      drawSprite(ctx, IC.flask, 5, 21);
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(11, 22, 62, 4);
      const fw = Math.round(60 * clamp(g.fat / g.fatMax, 0, 1));
      ctx.fillStyle = g.fat < g.fatMax * 0.2 ? (Math.floor(g.t * 4) % 2 ? '#ff7050' : '#c04030') : '#f0a040';
      ctx.fillRect(12, 23, fw, 2);
      // время суток и погода
      const td = tod();
      drawSprite(ctx, td === 0 ? IC.sun : td === 1 ? IC.dusk : IC.moon, 77, 21);
      if (g.wx) drawSprite(ctx, g.wx === 2 ? IC.rain : IC.cloud, 85, 21);
      // место
      box(2, 34, labelWidth(LAKES[scene.lake].name) + 6, 15, 0.4);
      drawLabel(ctx, LAKES[scene.lake].name, 5, 36, '#cfe8ff');
      drawLabel(ctx, SPOT_NAMES[scene.spot], 5, 42, '#8fb0c8');
      // мастерство и турнир недели
      if (!variant) {
        box(2, 51, 66, 11, 0.45);
        const mx = 5 + drawLabel(ctx, 'МАСТЕР', 5, 53, '#c8a0ff') + 3;
        drawInt(ctx, MT.lvl, mx, 53, '#ffffff');
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(5, 59, 60, 1);
        ctx.fillStyle = '#c8a0ff';
        ctx.fillRect(5, 59, Math.round(60 * MT.frac), 1);
        if (MT.tourney) {
          box(2, 64, 44, 10, 0.55);
          drawIcon(ctx, 'trophy', 4, 65);
          drawLabel(ctx, 'ТУРНИР', 13, 67, Math.floor(g.t * 1.5) % 2 ? '#ffd34a' : '#fff0b0');
        }
      }

      // ---- верх справа: счёт и рекорд ----
      const scoreV = g.phase === 'intro' ? 0 : Math.round(g.score);
      const sw = intWidth(scoreV, 2);
      drawInt(ctx, scoreV, W - 6 - sw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawInt(ctx, scoreV, W - 6 - sw, 5, '#ffffff', 2);
      const best = Math.max(0, Math.floor(api.best || 0));
      const bw2 = intWidth(best);
      drawInt(ctx, best, W - 6 - bw2, 18, '#ffe070');
      drawIcon(ctx, 'trophy', W - 6 - bw2 - 10, 17);

      // ---- задания дня ----
      if (!(inPlay && g.st === 'reel') && pr.d) {
        const d = pr.d;
        const x0 = W - 104;
        box(x0 - 2, 27, 104, 26, 0.5);
        for (let i = 0; i < 3; i++) {
          const tk = d.l[i];
          if (!tk) continue;
          const y = 29 + i * 8;
          const done = d.c[i];
          drawSprite(ctx, DAILY_ICON[tk[0]] || IC.fish, x0, y + (tk[0] === 4 ? 1 : 0));
          let x = x0 + 8;
          if (done) { drawSprite(ctx, IC.check, x, y + 1); x += 7; }
          else {
            x += drawInt(ctx, tk[3], x, y, '#e8e2d4') + 1;
            x += drawText(ctx, '/', x, y, '#8a7a70') + 1;
            x += drawInt(ctx, tk[2], x, y, '#c8b890') + 4;
          }
          const ty = tk[0];
          const lbl = ty === 1 ? (SPECIES[tk[1]] ? SPECIES[tk[1]].name : '') : ty === 6 ? SPOT_NAMES[tk[1]] : DAILY_LABEL[ty];
          drawLabel(ctx, lbl, x, y, done ? '#60e070' : '#a8b8c8');
        }
      }
      // ---- событие месяца ----
      const ch = P.p.ev;
      if (!variant && ch && !(inPlay && g.st === 'reel')) {
        const x0 = W - 104;
        box(x0 - 2, 55, 104, 11, 0.5);
        const sp = EVI.spr;
        drawSprite(ctx, sp, x0 + 8 - (sp.w >> 1), 60 - (sp.h >> 1));
        let x = x0 + 18;
        if (ch.done) { drawSprite(ctx, IC.check, x, 58); x += 7; }
        else {
          x += drawInt(ctx, ch.n, x, 58, '#e8e2d4') + 1;
          x += drawText(ctx, '/', x, 58, '#8a7a70') + 1;
          x += drawInt(ctx, MT.goal(), x, 58, '#c8b890') + 4;
        }
        if (x + labelWidth(MT.ev.name) < W - 2) drawLabel(ctx, MT.ev.name, x, 58, ch.done ? '#60e070' : SEA.col);
      }
      // ---- кнопки ----
      if (inPlay) {
        for (let i = 0; i < 4; i++) {
          const on = g.panel === PANELS[i];
          box(BTN_X[i] - 1, BTN_Y - 1, 13, 11, on ? 0.9 : 0.55);
          if (on) { ctx.fillStyle = '#ffe070'; ctx.fillRect(BTN_X[i] - 1, BTN_Y + 9, 13, 1); }
          drawSprite(ctx, i === 0 ? IC.book : i === 1 ? IC.bag : i === 2 ? IC.map : IC.ev, BTN_X[i] + 2, BTN_Y + 1);
        }
      }
      // подсказка: держи
      if (((inPlay && g.st === 'ready') || (g.phase === 'intro' && holder === you && passT < 0)) && !g.panel) {
        if (Math.floor(g.t * 2) % 2 === 0) drawIcon(ctx, 'down', SPOT_X - 2, DECK_Y - 26);
      }
      // всплывашка
      if (g.toast && g.toastT > 0) {
        const a = clamp(g.toastT * 3, 0, 1) * clamp((2.2 - g.toastT) * 5, 0, 1);
        const tw = labelWidth(g.toast.text);
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * a;
        box(160 - (tw >> 1) - 4, 150, tw + 8, 11, 0.8);
        drawLabel(ctx, g.toast.text, 160 - (tw >> 1), 153, g.toast.color);
        ctx.globalAlpha = ga;
      }
      if (inPlay && g.panel) drawPanel();
    };

    // ---------- панели ----------
    const panelFrame = (title) => {
      box(PX, PY, PW, PH, 0.9);
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(PX, PY, PW, 1);
      ctx.fillRect(PX, PY + PH - 1, PW, 1);
      ctx.fillRect(PX, PY, 1, PH);
      ctx.fillRect(PX + PW - 1, PY, 1, PH);
      drawLabel(ctx, title, PX + 6, PY + 5, '#ffe070');
      // крестик
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(PX + PW - 12, PY + 3, 9, 8);
      drawText(ctx, 'x', PX + PW - 10, PY + 4, '#ffffff');
    };
    const drawPanel = () => {
      const pr = P.p;
      if (g.panel === 'album') {
        panelFrame('АЛЬБОМ');
        const n = albumCount(pr);
        let x = PX + 50;
        x += drawInt(ctx, n, x, PY + 5, '#ffffff') + 1;
        x += drawText(ctx, '/', x, PY + 5, '#8a7a70') + 1;
        drawInt(ctx, ALBUM_TOTAL, x, PY + 5, '#c8b890');
        for (let i = 0; i < SPECIES.length; i++) {
          const s = SPECIES[i];
          const col = i % 7, row = Math.floor(i / 7);
          const cx = PX + 6 + col * 39, cy = PY + 15 + row * 28;
          const a = pr.alb[s.id];
          const got = a && a[0] > 0;
          const open = P.lakeOpen(s.lake);
          ctx.fillStyle = i === g.sel ? 'rgba(120,90,50,0.9)' : s.tier === 4 ? 'rgba(70,56,20,0.8)' : 'rgba(46,36,28,0.8)';
          ctx.fillRect(cx, cy, 38, 27);
          ctx.fillStyle = TIERS[s.tier].col;
          ctx.fillRect(cx, cy + 26, 38, 1);
          const sp = s.spr;
          const sx = cx + 19 - (sp.w >> 1), sy = cy + 10 - (sp.h >> 1);
          if (got) drawSprite(ctx, sp, sx, sy);
          else drawSilhouette(ctx, sp, sx, sy, 1, open ? '#120c08' : '#2a221c');
          if (got) drawInt(ctx, a[0], cx + 2, cy + 20, '#c8b890');
          else if (!open) drawSprite(ctx, IC.lock, cx + 2, cy + 20);
        }
        // описание выбранной
        const s = SPECIES[g.sel];
        const a = pr.alb[s.id];
        const got = a && a[0] > 0;
        const y = PY + PH - 20;
        if (got) {
          let x2 = PX + 6;
          x2 += drawLabel(ctx, s.name, x2, y, TIERS[s.tier].col) + 6;
          x2 += drawLabel(ctx, TIERS[s.tier].name, x2, y, '#8a7a70') + 6;
          x2 += drawText(ctx, 'x', x2, y, '#8a7a70') + 2;
          drawInt(ctx, a[0], x2, y, '#e8e2d4');
          let x3 = PX + 6;
          x3 += drawLabel(ctx, 'РЕКОРД', x3, y + 8, '#8a7a70') + 4;
          x3 += drawInt(ctx, a[1], x3, y + 8, '#ffffff') + 3;
          drawLabel(ctx, 'СМ', x3, y + 8, '#8a7a70');
        } else {
          drawLabel(ctx, '???', PX + 6, y, '#8a7a70');
          drawLabel(ctx, P.lakeOpen(s.lake) ? LAKES[s.lake].name : 'ОЗЕРО ЗАКРЫТО', PX + 30, y, '#8fb0c8');
        }
        if (s.need) {
          // подсказка к легенде
          let x4 = PX + 150;
          const n2 = s.need;
          x4 += drawLabel(ctx, 'КЛЮЁТ:', x4, y + 8, '#ffd34a') + 4;
          if (n2.tod != null) x4 += drawLabel(ctx, n2.tod === 0 ? 'ДНЁМ' : n2.tod === 1 ? 'НА ЗАКАТЕ' : 'НОЧЬЮ', x4, y + 8, '#e8e2d4') + 4;
          if (n2.wx != null) x4 += drawLabel(ctx, n2.wx === 0 ? 'ЯСНО' : n2.wx === 1 ? 'ОБЛАЧНО' : 'ДОЖДЬ', x4, y + 8, '#e8e2d4') + 4;
          if (n2.spot != null) drawLabel(ctx, SPOT_NAMES[n2.spot], x4, y + 8, '#e8e2d4');
        }
      } else if (g.panel === 'shop') {
        panelFrame('ЛАВКА');
        drawSprite(ctx, IC.coin, PX + 60, PY + 5);
        drawInt(ctx, pr.coins, PX + 67, PY + 5, '#ffe070');
        if (pr.gold > 0) { drawSprite(ctx, IC.gold, PX + 110, PY + 6); drawInt(ctx, pr.gold, PX + 115, PY + 5, '#ffd34a'); }
        for (let i = 0; i < UPGRADES.length; i++) {
          const u = UPGRADES[i];
          const x = PX + 6 + i * 56, y = PY + 16;
          const price = upgradePrice(pr, i);
          const ok = price >= 0 && pr.coins >= price;
          ctx.fillStyle = ok ? 'rgba(90,64,40,0.95)' : 'rgba(50,40,36,0.9)';
          ctx.fillRect(x, y, 52, 104);
          ctx.fillStyle = ok ? '#c8a060' : '#5a4a40';
          ctx.fillRect(x, y, 52, 1);
          ctx.fillRect(x, y + 103, 52, 1);
          drawInt(ctx, i + 1, x + 2, y + 2, 'rgba(255,255,255,0.5)');
          const ic = UPG_ICON[i];
          drawSprite(ctx, ic, x + 26 - ic.w, y + 10, 2);
          const nw = labelWidth(u.name);
          drawLabel(ctx, u.name, x + 26 - (nw >> 1), y + 30, '#e8e2d4');
          for (let k = 0; k < u.max; k++) {
            ctx.fillStyle = k < pr.up[i] ? '#ffe070' : '#3a2e28';
            ctx.fillRect(x + 26 - u.max * 3 + k * 6, y + 40, 4, 3);
          }
          const h1 = HINTS[i][0], h2 = HINTS[i][1];
          drawLabel(ctx, h1, x + 26 - (labelWidth(h1) >> 1), y + 50, '#8a7a70');
          if (h2) drawLabel(ctx, h2, x + 26 - (labelWidth(h2) >> 1), y + 57, '#8a7a70');
          if (price < 0) drawLabel(ctx, 'МАКС', x + 26 - (labelWidth('МАКС') >> 1), y + 88, '#8a7a70');
          else {
            const pw = intWidth(price) + 7;
            drawSprite(ctx, IC.coin, x + 26 - (pw >> 1), y + 88);
            drawInt(ctx, price, x + 26 - (pw >> 1) + 7, y + 88, ok ? '#8af0a8' : '#c06060');
          }
        }
        drawLabel(ctx, 'ЗОЛОТАЯ НАЖИВКА - ЗА ВСЕ ЗАДАНИЯ ДНЯ', PX + 6, PY + PH - 12, '#8a7a70');
      } else if (g.panel === 'event') {
        drawEventPanel();
      } else if (g.panel === 'map') {
        panelFrame('КАРТА');
        for (let l = 0; l < LAKES.length; l++) {
          const L = LAKES[l];
          const y = PY + 18 + l * 31;
          const open = P.lakeOpen(l);
          ctx.fillStyle = l === scene.lake ? 'rgba(40,70,90,0.9)' : 'rgba(40,32,26,0.85)';
          ctx.fillRect(PX + 6, y, PW - 12, 28);
          // миниатюра воды
          const look = LOOKS[l];
          ctx.fillStyle = rgbStr(look.water[0][0], look.water[0][1], look.water[0][2], open ? 1 : 0.3);
          ctx.fillRect(PX + 9, y + 3, 20, 22);
          ctx.fillStyle = rgbStr(look.hill[0][0], look.hill[0][1], look.hill[0][2], open ? 1 : 0.3);
          ctx.fillRect(PX + 9, y + 3, 20, 6);
          if (!open) drawSprite(ctx, IC.lock, PX + 17, y + 12);
          drawInt(ctx, l + 1, PX + 33, y + 4, 'rgba(255,255,255,0.5)');
          drawLabel(ctx, L.name, PX + 40, y + 4, open ? '#e8e2d4' : '#6a5a50');
          // прогресс альбома этого озера
          let got = 0;
          for (let i = 0; i < SPECIES.length; i++) if (SPECIES[i].lake === l && pr.alb[SPECIES[i].id] && pr.alb[SPECIES[i].id][0] > 0) got++;
          drawSprite(ctx, IC.fish, PX + 40, y + 15);
          let x = PX + 48;
          x += drawInt(ctx, got, x, y + 14, '#c8b890') + 1;
          x += drawText(ctx, '/', x, y + 14, '#8a7a70') + 1;
          drawInt(ctx, 7, x, y + 14, '#8a7a70');
          if (!open) { drawLabel(ctx, 'УР', PX + 80, y + 14, '#c06060'); drawInt(ctx, L.lvl, PX + 92, y + 14, '#c06060'); }
          for (let s = 0; s < 3; s++) {
            const bx = PX + 120 + s * 55, by = y + 4;
            const so = P.spotOpen(l, s);
            const cur = l === scene.lake && s === scene.spot;
            const selc = g.msel === l * 3 + s;
            ctx.fillStyle = cur ? 'rgba(90,150,90,0.95)' : so ? 'rgba(90,64,40,0.95)' : 'rgba(50,40,36,0.8)';
            ctx.fillRect(bx, by, 52, 14);
            if (selc) { ctx.fillStyle = '#ffe070'; ctx.fillRect(bx, by + 13, 52, 1); }
            if (so) drawLabel(ctx, SPOT_NAMES[s], bx + 26 - (labelWidth(SPOT_NAMES[s]) >> 1), by + 5, '#e8e2d4');
            else { drawLabel(ctx, 'УР', bx + 14, by + 5, '#8a6a60'); drawInt(ctx, L.spots[s], bx + 26, by + 5, '#8a6a60'); }
          }
        }
      }
    };

    // ---------- панель события и мастерства ----------
    const TX = { lvl: -1, id: '', done: -1, coins: '', bobs: '', ok: '', todo: '' };
    const evTexts = (done) => {
      if (TX.lvl === MT.lvl && TX.id === MT.id && TX.done === done) return;
      TX.lvl = MT.lvl; TX.id = MT.id; TX.done = done;
      const rw = rewardName('ev_' + MT.id);
      TX.coins = '+' + MT.coinPct() + '% МОНЕТ';
      TX.bobs = 'ПОПЛАВКИ ' + Math.min(BOB_COLS.length, 1 + Math.floor(MT.lvl / 5)) + '/' + BOB_COLS.length;
      TX.ok = 'ВЫПОЛНЕНО! ЗНАЧОК «' + rw + '»';
      TX.todo = 'НАГРАДА: ЗНАЧОК «' + rw + '»';
    };
    const drawEventPanel = () => {
      const ev = MT.ev;
      const ch = P.p.ev;
      evTexts(ch && ch.done ? 1 : 0);
      panelFrame('СОБЫТИЕ МЕСЯЦА');
      const dl = Math.max(0, ev.daysLeft | 0);
      let xr = PX + PW - 16 - labelWidth('ДН.');
      drawLabel(ctx, 'ДН.', xr, PY + 5, '#8a7a70');
      xr -= intWidth(dl) + 3;
      drawInt(ctx, dl, xr, PY + 5, '#e8e2d4');
      drawLabel(ctx, 'ЕЩЁ', xr - 4 - labelWidth('ЕЩЁ'), PY + 5, '#8a7a70');
      drawLabel(ctx, ev.name, PX + 6, PY + 16, SEA.col, 2);
      drawLabel(ctx, ev.desc, PX + 6, PY + 29, '#a89a88');
      // испытание
      const sp = EVI.spr;
      const sc = sp.w > 12 ? 2 : 3;
      drawSprite(ctx, sp, PX + 22 - ((sp.w * sc) >> 1), PY + 50 - ((sp.h * sc) >> 1), sc);
      let x = PX + 44;
      x += drawLabel(ctx, 'ИСПЫТАНИЕ: ПОЙМАЙ', x, PY + 40, '#c8b890') + 4;
      drawLabel(ctx, EVI.name, x, PY + 40, SEA.col);
      const goal = MT.goal();
      const n = ch ? ch.n : 0;
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(PX + 44, PY + 49, 152, 5);
      ctx.fillStyle = ch && ch.done ? '#60e070' : SEA.col;
      ctx.fillRect(PX + 45, PY + 50, Math.round(150 * clamp(n / goal, 0, 1)), 3);
      let x2 = PX + 202;
      x2 += drawInt(ctx, n, x2, PY + 49, '#ffffff') + 1;
      x2 += drawText(ctx, '/', x2, PY + 49, '#8a7a70') + 1;
      drawInt(ctx, goal, x2, PY + 49, '#c8b890');
      if (ch && ch.done) drawLabel(ctx, P.author ? 'ВЫПОЛНЕНО (АВТОР: БЕЗ НАГРАДЫ)' : TX.ok, PX + 44, PY + 59, '#60e070');
      else drawLabel(ctx, TX.todo, PX + 44, PY + 59, '#8a7a70');
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(PX + 6, PY + 71, PW - 12, 1);
      // мастерство
      let xm = PX + 6 + drawLabel(ctx, 'МАСТЕРСТВО', PX + 6, PY + 79, '#c8a0ff') + 6;
      drawInt(ctx, MT.lvl, xm, PY + 76, '#ffffff', 2);
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(PX + 110, PY + 79, 120, 4);
      ctx.fillStyle = '#c8a0ff';
      ctx.fillRect(PX + 111, PY + 80, Math.round(118 * MT.frac), 2);
      const cur = Math.floor(MT.xp + MT.pend + MT.axp - MT.prevAt), need = MT.nextAt - MT.prevAt;
      let x3 = PX + 236;
      x3 += drawInt(ctx, Math.max(0, cur), x3, PY + 79, '#e8e2d4') + 1;
      x3 += drawText(ctx, '/', x3, PY + 79, '#8a7a70') + 1;
      drawInt(ctx, need, x3, PY + 79, '#8a7a70');
      let x4 = PX + 6;
      x4 += drawLabel(ctx, TX.coins, x4, PY + 92, MT.coinPct() ? '#ffe070' : '#8a7a70') + 10;
      x4 += drawLabel(ctx, TX.bobs, x4, PY + 92, '#c8d8e8') + 10;
      drawLabel(ctx, MT.lvl >= 10 ? 'ЗОЛОТАЯ ЛЕНТА СТАРИКА' : 'ЛЕНТА СТАРИКА - 10 УР.', x4, PY + 92, MT.lvl >= 10 ? '#ffd34a' : '#8a7a70');
      drawLabel(ctx, '+1% МОНЕТ ЗА КАЖДЫЕ 5 УРОВНЕЙ (ДО +20%), ОПЫТ - ЗА ИГРУ И УЛОВ', PX + 6, PY + 101, '#6a5a50');
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(PX + 6, PY + 111, PW - 12, 1);
      // турнир недели
      const wk = MT.week;
      drawIcon(ctx, 'trophy', PX + 6, PY + 117);
      let x5 = PX + 16 + drawLabel(ctx, 'ТУРНИР НЕДЕЛИ:', PX + 16, PY + 119, '#ffd34a') + 4;
      if (!wk) drawLabel(ctx, 'НЕТ СВЯЗИ', x5, PY + 119, '#8a7a70');
      else if (MT.tourney) drawLabel(ctx, 'РЫБАЛКА! СЧЁТ ЗАБЕГА ИДЁТ В ТАБЛИЦУ', x5, PY + 119, '#fff0b0');
      else drawLabel(ctx, GAME_NAMES[wk.game] || '?', x5, PY + 119, '#e8e2d4');
      if (wk) {
        let x6 = PX + 16 + drawLabel(ctx, 'ДО КОНЦА', PX + 16, PY + 129, '#8a7a70') + 4;
        x6 += drawInt(ctx, Math.max(0, wk.daysLeft | 0), x6, PY + 129, '#e8e2d4') + 3;
        drawLabel(ctx, 'ДН.', x6, PY + 129, '#8a7a70');
      }
    };

    if (typeof api._debug === 'function') { try { api._debug({ g, P, scene, MT }); } catch (e) { /* тесты */ } }

    // ---------- цикл ----------
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let shownPhase = '';
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
        const env = g.phase === 'idle' ? getEnv() : null;
        const still = g.phase === 'idle' && env && env.animations === false;
        if (!still) update(dt);
        else {
          pressedEdge = false;
          g.sky = clamp((env.dark || 0) * 2, 0, 2);
        }
      } else pressedEdge = false;
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
      if (g.phase === 'play') { P.p.best = Math.max(P.p.best, Math.round(g.score)); P.save(); }
      MT.flush();
      if (canvas.dataset) delete canvas.dataset.gamePhase;
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

