// Мини-игра «Рыбалка» и живой фон «Озеро».
// Фон (idle): причал на озере, старый рыбак сам спокойно рыбачит — забрасывает, ждёт, иногда
// вытаскивает рыбку и кидает в корзину, иногда ничего. Утки, стрекозы (ночью — светлячки),
// всплески рыбы, облака; день/закат/ночь по реальным часам (api.env().dark).
// Вступление: игрок приходит по причалу, старик сматывает леску, отдаёт удочку и садится
// на ящик у корзины смотреть. Игра: 10 забросов (держи — сила, клик — подсечка, держи — подмотка).
// Выход: игрок отдаёт удочку и улов старику, уходит; старик садится и рыбачит дальше.
// Всё рисуется целочисленными fillRect, цвета из кэша — без выделений памяти в кадре.

import { drawNumber, drawText, textWidth, drawIcon, rgbStr, rgbMix } from './pixfont.js';

const W = 320;
const H = 180;
const HORIZON = 92;
const CASTS = 10;

const PIER_X = 232;
const DECK_Y = 118;
const SPOT_X = 246; // место рыбака (табурет)
const SEAT_X = 292; // ящик, где старик сидит, пока играешь ты
const BASKET_X = 300; // корзина старика
const BUCKET_X = 268; // ведро игрока
const EXIT_X = 336; // за правым краем
const MAN_Y = DECK_Y - 12;

const lerp = (a, b, t) => a + (b - a) * t;
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
  for (let i1 = 0; i1 < rows.length; i1++) { const row = rows[i1]; w = Math.max(w, row.length); }
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
// маленькая рыбка для всплесков
const MINNOW = sprite({ a: '#9ab0b8', b: '#d8e4e8', t: '#7a9098' }, ['.aaa.t', 'abbbaa', '.aaa.t']);

function pickKind(d, rand) {
  // d = дальность заброса 0..1: дальше — больше шанс на редкое
  const w0 = 18 - 12 * d, w1 = 50 - 22 * d, w2 = 22 + 12 * d, w3 = 5 + 9 * d, w4 = 2 + 9 * d;
  let v = rand() * (w0 + w1 + w2 + w3 + w4);
  if ((v -= w0) <= 0) return 'boot';
  if ((v -= w1) <= 0) return 'small';
  if ((v -= w2) <= 0) return 'large';
  if ((v -= w3) <= 0) return 'chest';
  return 'golden';
}
// улов старика в фоне: в основном мелочь, редко — золотая
function npcKind(rand) {
  const v = rand();
  if (v < 0.16) return 'boot';
  if (v < 0.78) return 'small';
  if (v < 0.97) return 'large';
  return 'golden';
}

// палитры: день -> закат -> ночь (s = 0..2)
const DAY = { top: [96, 158, 226], bot: [196, 226, 246], water: [62, 120, 168], deep: [34, 76, 120], hill: [86, 128, 92], sun: [255, 238, 170] };
const SET = { top: [74, 62, 132], bot: [250, 150, 90], water: [92, 82, 120], deep: [40, 36, 70], hill: [52, 44, 66], sun: [255, 170, 90] };
const NIGHT = { top: [12, 16, 40], bot: [40, 40, 84], water: [26, 34, 66], deep: [10, 14, 34], hill: [16, 20, 34], sun: [214, 222, 250] };
const PKEYS = ['top', 'bot', 'water', 'deep', 'hill', 'sun'];

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SHADE = [30, 20, 40];
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
const DRAGON = [60, 150, 220];

export default {
  id: 'fishing',
  title: 'Рыбалка',
  sceneTitle: 'Озеро',
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

    const getMode = () => {
      if (typeof api.mode === 'function') return api.mode();
      if (typeof api.auto === 'function') return api.auto() ? 'idle' : 'play';
      return 'play';
    };
    const getEnv = () => (typeof api.env === 'function' ? api.env() : null);

    // ---------- мир ----------
    const treeline = [];
    for (let x = 0; x < W; x += 3) treeline.push(HORIZON - 4 - Math.floor(4 + 4 * Math.sin(x / 23) + 3 * Math.sin(x / 7 + 1) + rand() * 3));
    const ripples = [];
    for (let i = 0; i < 26; i++) ripples.push({ rp: 1, x: rand() * W, y: HORIZON + 3 + rand() * (H - HORIZON - 6), w: 3 + Math.floor(rand() * 7), v: 2 + rand() * 4, p: rand() * 6 });
    const reeds = [];
    for (let i = 0; i < 9; i++) reeds.push({ x: 2 + Math.floor(rand() * 34), h: 10 + Math.floor(rand() * 14), p: rand() * 6 });
    // вторая куртина камыша у причала (видна из-под интерфейса)
    for (let i = 0; i < 6; i++) reeds.push({ x: 212 + Math.floor(rand() * 16), h: 8 + Math.floor(rand() * 10), p: rand() * 6 });
    const pads = [];
    for (let i = 0; i < 4; i++) pads.push({ x: 20 + Math.floor(rand() * 140), y: 150 + Math.floor(rand() * 22) });
    pads.push({ x: 178, y: 138 }, { x: 196, y: 160 });
    const clouds = [];
    for (let i = 0; i < 4; i++) clouds.push({ cl: 1, x: rand() * W, y: 10 + rand() * 40, w: 22 + rand() * 30, v: 1 + rand() * 2 });
    const stars = [];
    for (let i = 0; i < 40; i++) stars.push({ x: Math.floor(rand() * W), y: Math.floor(rand() * (HORIZON - 14)), p: rand() * 6, big: rand() > 0.9 });

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
    for (let i = 0; i < 8; i++) flyers.push({ ff: 1, on: false, kind: 'small', mini: false, x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5, h: 0.5, t: 0.5, dur: 1.5, delay: 0.5, dest: 0, flip: false });
    const toss = (kind, x0, y0, x1, y1, h, dur, dest, delay = 0, mini = false) => {
      for (let i3 = 0; i3 < flyers.length; i3++) { const f = flyers[i3];
        if (f.on) continue;
        f.on = true; f.kind = kind; f.mini = mini; f.x0 = x0; f.y0 = y0; f.x1 = x1; f.y1 = y1; f.h = h; f.t = 0; f.dur = dur; f.dest = dest; f.delay = delay; f.flip = x1 > x0;
        return;
      }
    };
    // утки
    const duck = { dk: 1, on: false, x: 0.5, y: 0.5, dir: 1, spd: 6.5, n: 0, dive: 0.5, next: 6 + rand() * 10 };
    // стрекозы / светлячки
    const flies = [];
    for (let i = 0; i < 3; i++) flies.push({ fl: 1, x: 150 + rand() * 70, y: 100 + rand() * 30, tx: 0.5, ty: 0.5, hover: rand() * 2, p: rand() * 6 });
    for (let i4 = 0; i4 < flies.length; i4++) { const f = flies[i4]; f.tx = f.x; f.ty = f.y; }

    // ---------- персонажи ----------
    // old — старый рыбак (соломенная шляпа), you — игрок (синяя рубаха)
    const old = { pa: 1, x: SPOT_X, dir: -1, tx: SPOT_X, spd: 46, sit: true, emote: 0, emoteT: 0, look: 0, step: 0 };
    const you = { pa: 1, x: EXIT_X, dir: -1, tx: EXIT_X, spd: 72, sit: false, emote: 0, emoteT: 0, look: 0, step: 0 };
    let holder = old; // у кого удочка
    let passT = -1; // анимация передачи удочки 0..1
    let passTo = you;
    let basketN = 2; // рыбы в корзине старика (для вида)

    // ---------- состояние ----------
    const g = {
      phase: 'idle', // idle | intro | play | finish | wait | outro
      pt: 0, // время в фазе
      hold: 1.3, // показать спокойный вид при старте сразу в 'play'
      sawOver: false,
      t: 0, st: 'rest', timer: 2 + rand() * 2,
      cast: 0, score: 0,
      power: 0, powDir: 1, npcPow: 0.5, npcReact: 0, npcHook: true,
      bob: { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0 },
      dist: 0, kind: 'small', nibble: 0, spooked: 0, spookCount: 0,
      fish: 0.5, fishT: 0.5, fishTimer: 0,
      zone: 0.1, zv: 0, prog: 0.3, thrash: 0,
      caught: [], showKind: null, showPts: 0, overSent: false,
      sky: 0, sky0: 0, hud: 0, still: false, jumpT: 5 + rand() * 8
    };
    {
      const env = getEnv();
      g.sky = env ? clamp((env.dark || 0) * 2, 0, 2) : 0.3;
    }
    let held = false;
    let pressedEdge = false;

    const playing = () => g.phase === 'play';
    const press = () => {
      if (!playing()) return;
      if (!held) pressedEdge = true;
      held = true;
    };
    const release = () => { held = false; };

    const KEYS = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1, NumpadEnter: 1 };
    const onKeyDown = (e) => {
      if (!KEYS[e.code] || !playing()) return;
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
    // смотать леску (поплавок летит обратно к кончику)
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
    // 1 '!', 2 радость (руки вверх), 3 качает головой, 4 хлопает, 5 болтает (...), 6 зевает/потягивается

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
            g.kind = npcKind(rand);
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
              // в корзину через плечо (ботинок — обратно в воду)
              puff(g.bob.tx, g.bob.ty, 8, '#e8f4ff', 22);
              if (g.kind === 'boot') toss('boot', g.bob.tx, g.bob.ty - 4, g.bob.tx - 18, g.bob.ty + 6, 26, 0.9, 1);
              else toss(g.kind, g.bob.tx, g.bob.ty - 4, BASKET_X - 2, DECK_Y - 9, 52, 1.3, 0);
              g.st = 'show';
              g.timer = 1.4;
              emote(old, g.kind === 'golden' ? 2 : g.kind === 'boot' ? 3 : 0, g.kind === 'golden' ? 2.2 : 1.0);
              api.sfx(g.kind === 'boot' ? 'click' : 'coin');
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
    const nextCast = () => {
      g.cast++;
      if (g.cast >= CASTS) {
        g.st = 'rest';
        g.phase = 'finish';
        g.pt = 0;
        emote(old, 4, 1.6);
        api.sfx('win');
      } else {
        g.st = 'ready';
      }
    };

    const startReel = () => {
      const k = KINDS[g.kind];
      g.st = 'reel';
      g.fish = 0.4 + rand() * 0.3;
      g.fishT = g.fish;
      g.fishTimer = 0.4;
      g.zone = clamp(g.fish - k.zone / 2, 0, 1 - k.zone);
      g.zv = 0;
      g.prog = 0.3;
      g.thrash = 1;
    };

    const playUpdate = (dt) => {
      const press1 = pressedEdge;
      pressedEdge = false;
      switch (g.st) {
        case 'rest':
        case 'ready':
          g.st = 'ready';
          if (press1) { g.st = 'charge'; g.power = 0; g.powDir = 1; }
          break;
        case 'charge': {
          g.power += g.powDir * dt / 1.1;
          if (g.power >= 1) { g.power = 1; g.powDir = -1; }
          if (g.power <= 0.05 && g.powDir < 0) { g.power = 0.05; g.powDir = 1; }
          if (!held) launch(clamp(g.power, 0.08, 1));
          break;
        }
        case 'fly':
          stepFly(dt, 1.2, 3.2);
          break;
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
            g.st = 'bite';
            g.timer = 1.0;
            puff(g.bob.tx, g.bob.ty, 5, '#e8f4ff', 16);
            api.sfx('splash');
          }
          break;
        case 'bite':
          g.timer -= dt;
          if (press1) { startReel(); api.sfx('jump'); }
          else if (g.timer <= 0) { g.st = 'miss'; g.timer = 1.2; api.sfx('hit'); emote(old, 3, 1.0); }
          break;
        case 'reel': {
          const k = KINDS[g.kind];
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
            g.st = 'show';
            g.timer = 1.7;
            puff(g.bob.tx, g.bob.ty, 10, '#e8f4ff', 26);
            api.sfx(k.sfx);
            emote(old, 2, 1.2);
          } else if (g.prog <= 0) {
            g.st = 'miss';
            g.timer = 1.2;
            api.sfx('hit');
            emote(old, 3, 1.0);
          }
          break;
        }
        case 'show':
        case 'miss':
          g.timer -= dt;
          if (g.timer <= 0 || (press1 && g.timer < 1.0)) nextCast();
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
      const n = Math.min(3, g.caught.length);
      for (let i = 0; i < n; i++) toss(g.caught[g.caught.length - 1 - i], BUCKET_X + 1, DECK_Y - 9, BASKET_X - 2, DECK_Y - 9, 14, 0.6, 0, i * 0.22);
      g.caught.length = 0;
    };

    // ---------- переходы ----------
    const startIntro = () => {
      const from = g.phase;
      g.phase = 'intro';
      g.pt = 0;
      held = false;
      pressedEdge = false;
      g.showKind = null;
      if (from === 'wait' || from === 'finish') handOverCatch();
      if (holder === old) {
        if (lineOut()) startRetrieve();
        else if (g.st !== 'retrieve') g.st = 'rest';
        if (you.x > W + 2) you.x = EXIT_X;
        you.tx = SPOT_X + 12;
        old.tx = old.x; // ждёт с удочкой
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
      g.cast = 0;
      g.score = 0;
      g.caught.length = 0;
      g.st = 'ready';
      g.sky0 = g.sky;
      g.overSent = false;
      g.sawOver = false;
      held = false;
      pressedEdge = false;
      api.sfx('click');
    };
    const startOutro = () => {
      g.phase = 'outro';
      g.pt = 0;
      held = false;
      pressedEdge = false;
      g.showKind = null;
      if (lineOut() && g.st !== 'retrieve') startRetrieve();
      else if (g.st !== 'retrieve') g.st = 'rest';
      if (g.caught.length) handOverCatch();
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
      for (let i5 = 0; i5 < clouds.length; i5++) { const c = clouds[i5];
        c.x += c.v * dt;
        if (c.x > W + 10) c.x = -c.w - 10;
      }
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
      // стрекозы
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
      // прыгнула рыбка
      g.jumpT -= dt;
      if (g.jumpT <= 0) {
        g.jumpT = 7 + rand() * 14;
        const x = 110 + rand() * 110, y = 110 + rand() * 50;
        const d = rand() < 0.5 ? -1 : 1;
        puff(x, y, 3, '#e8f4ff', 10);
        toss('small', x, y, x + d * 10, y, 9, 0.55, 1, 0, true);
      }
    };

    const update = (dt) => {
      g.t += dt;
      g.pt += dt;
      updateWorld(dt);

      // цель неба: в фоне — по реальным часам, в игре — вечереет с каждым забросом
      const env = getEnv();
      const envSky = env ? clamp((env.dark || 0) * 2, 0, 2) : 0.3;
      let skyT = envSky;
      if (g.phase === 'play' || g.phase === 'finish' || g.phase === 'wait') skyT = Math.min(2, g.sky0 + g.cast * 0.07);
      const sr = (g.phase === 'idle' || g.phase === 'outro' ? 0.05 : 0.12) * dt;
      g.sky += clamp(skyT - g.sky, -sr, sr);
      const hudT = g.phase === 'play' || g.phase === 'finish' || g.phase === 'wait' || (g.phase === 'intro' && holder === you) ? 1 : 0;
      g.hud += clamp(hudT - g.hud, -dt * 3, dt * 3);

      // передача удочки
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
        if (g.pt > 4) { // страховка
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
        if (g.pt > 3.8) { // страховка
          passT = -1; holder = old; old.x = old.tx = SPOT_X; old.sit = true; you.tx = EXIT_X; g.st = 'rest'; g.timer = 1;
          g.phase = 'idle'; g.pt = 0;
        }
      } else if (g.phase === 'idle') {
        if (holder === old && atSpot(old)) {
          if (!old.sit) old.sit = true;
          npcUpdate(dt);
        }
      }

      moveActor(old, dt);
      moveActor(you, dt);
      // старик садится на ящик / табурет
      if (arrived(old) && (Math.abs(old.x - SEAT_X) < 0.5 || (Math.abs(old.x - SPOT_X) < 0.5 && g.phase !== 'intro'))) old.sit = true;
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

    // зеркальный прямоугольник персонажа: смотрит влево (dir -1) как в оригинале
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
      // ноги
      ctx.fillStyle = rgbMix(LEG_C, SHADE, sd);
      if (sit) {
        vr(-5, yy + 9, 4, 2);
        vr(-5, yy + 11, 1, DECK_Y - yy - 11 > 0 ? DECK_Y - yy - 11 : 1);
      } else {
        const st = walking ? Math.floor(a.step / 3) % 2 : 0;
        vr(-1 - st, yy + 10, 1, 2);
        vr(1 + st, yy + 10, 1, 2);
      }
      // рубаха
      ctx.fillStyle = rgbMix(isOld ? OLD_SHIRT : YOU_SHIRT, SHADE, sd);
      vr(-2, yy + 4, 5, sit ? 6 : 7);
      ctx.fillStyle = rgbMix(isOld ? OLD_BELT : YOU_BELT, SHADE, sd);
      vr(-2, yy + 7, 5, 1);
      // голова
      const shake = em === 3 ? Math.round(Math.sin(g.t * 16)) : 0;
      ctx.fillStyle = rgbMix(SKIN_C, SHADE, sd);
      vr(-1 + shake, yy, 4, 4);
      // руки
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
      if (em === 6) vr(-1 + shake, yy + 3, 2, 1); // зевок
      if (isOld) {
        ctx.fillStyle = rgbMix(HAT_C, SHADE, sd);
        vr(-3 + shake, yy - 1, 8, 1);
        vr(-1 + shake, yy - 3, 4, 2);
        ctx.fillStyle = rgbMix(BAND_C, SHADE, sd);
        vr(-1 + shake, yy - 2, 4, 1);
      } else {
        ctx.fillStyle = rgbMix(HAIR_C, SHADE, sd);
        vr(-1 + shake, yy - 1, 4, 1);
        vr(2 + shake, yy, 1, 2);
      }
      // эмоции над головой
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
      ctx.fillStyle = '#e04040';
      ctx.fillRect(x - 1, y, 3, 2);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(x, y - 3, 1, 1);
    };

    const P = { top: [0, 0, 0], bot: [0, 0, 0], water: [0, 0, 0], deep: [0, 0, 0], hill: [0, 0, 0], sun: [0, 0, 0] };
    const blendPal = (s) => {
      const A = s <= 1 ? DAY : SET, B = s <= 1 ? SET : NIGHT, k = s <= 1 ? s : s - 1;
      for (let i = 0; i < PKEYS.length; i++) {
        const key = PKEYS[i], o = P[key], a = A[key], b = B[key];
        o[0] = lerp(a[0], b[0], k); o[1] = lerp(a[1], b[1], k); o[2] = lerp(a[2], b[2], k);
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
      // след
      ctx.fillStyle = 'rgba(230,245,255,0.35)';
      ctx.fillRect(x - d * 8, y + 2, 3, 1);
      ctx.fillRect(x - d * 12, y + 3, 3, 1);
      if (duck.dive > 0 && duck.dive < 1.4) {
        // ныряет: только хвостик
        ctx.fillStyle = rgbMix(DUCK_BODY, SHADE, sd);
        ctx.fillRect(x - 1, y - 1 + bob, 3, 2);
        ctx.fillStyle = rgbMix(DUCK_WHITE, SHADE, sd);
        ctx.fillRect(x, y - 2 + bob, 1, 1);
      } else {
        ctx.fillStyle = rgbMix(DUCK_BODY, SHADE, sd);
        ctx.fillRect(x - 3, y - 1 + bob, 7, 3);
        ctx.fillStyle = rgbMix(DUCK_WHITE, SHADE, sd);
        ctx.fillRect(x - 3 + (d > 0 ? 0 : 5), y - 1 + bob, 2, 1);
        ctx.fillStyle = rgbMix(DUCK_HEAD, SHADE, sd);
        ctx.fillRect(x + d * 3 - (d > 0 ? 0 : 1), y - 4 + bob, 2, 3);
        ctx.fillStyle = rgbMix(DUCK_BEAK, SHADE, sd);
        ctx.fillRect(x + d * 5 - (d > 0 ? 0 : 0), y - 3 + bob, 1, 1);
      }
      ctx.fillStyle = rgbMix(DUCKLING, SHADE, sd);
      for (let i = 1; i <= duck.n; i++) {
        const dx = x - d * (8 + i * 6);
        const b2 = Math.round(Math.sin(g.t * 3 + i) * 0.6);
        ctx.fillRect(dx - 1, y + b2, 3, 2);
        ctx.fillRect(dx + (d > 0 ? 1 : -1), y - 1 + b2, 1, 1);
      }
    };

    const draw = () => {
      const s = Math.round(clamp(g.sky, 0, 2) * 128) / 128;
      blendPal(s);
      const dusk = Math.min(1, s * 0.6);
      const night = clamp((s - 1.15) / 0.6, 0, 1);
      // небо полосами
      for (let y = 0; y < HORIZON; y += 4) {
        ctx.fillStyle = rgbMix(P.top, P.bot, y / HORIZON);
        ctx.fillRect(0, y, W, 4);
      }
      // звёзды
      if (night > 0) {
        for (let i9 = 0; i9 < stars.length; i9++) { const st = stars[i9];
          const a = night * (0.45 + 0.45 * Math.sin(g.t * 1.4 + st.p));
          ctx.fillStyle = rgbStr(255, 250, 230, a);
          ctx.fillRect(st.x, st.y, st.big ? 2 : 1, 1);
        }
      }
      // солнце: садится к горизонту; ночью — луна
      const sunX = 120;
      const sunY = Math.round(lerp(26, HORIZON + 10, clamp(s / 1.12, 0, 1)));
      if (s < 1.12) {
        disc(sunX, sunY, 12, rgbStr(P.sun[0], P.sun[1], P.sun[2], 0.15));
        disc(sunX, sunY, 8, rgbStr(P.sun[0], P.sun[1], P.sun[2], 0.35));
        disc(sunX, sunY, 6, rgbMix(P.sun, WHITE, 0.4));
      }
      const moonX = 196;
      const moonY = Math.round(lerp(HORIZON + 8, 22, clamp((s - 1) / 0.6, 0, 1)));
      if (s > 1) {
        disc(moonX, moonY, 9, rgbStr(220, 228, 255, 0.12));
        disc(moonX, moonY, 5, '#e8ecf8');
        ctx.fillStyle = '#c4cadc';
        if (moonY + 1 < HORIZON - 1) ctx.fillRect(moonX - 2, moonY - 1, 2, 2);
        if (moonY + 2 < HORIZON - 1) ctx.fillRect(moonX + 1, moonY + 1, 1, 1);
      }
      // облака
      for (let i10 = 0; i10 < clouds.length; i10++) { const c = clouds[i10];
        ctx.fillStyle = s <= 1 ? rgbMix(WHITE, CLOUD_SET, s, 0.7) : rgbMix(CLOUD_SET, CLOUD_NIGHT, s - 1, 0.7);
        const cx = Math.floor(c.x), cy = Math.floor(c.y);
        ctx.fillRect(cx, cy, Math.floor(c.w), 4);
        ctx.fillRect(cx + 4, cy - 2, Math.floor(c.w * 0.5), 2);
      }
      // дальний лес
      ctx.fillStyle = rgbStr(P.hill[0], P.hill[1], P.hill[2]);
      for (let i = 0; i < treeline.length; i++) ctx.fillRect(i * 3, treeline[i], 3, HORIZON - treeline[i]);
      ctx.fillStyle = rgbMix(P.hill, BLACK, 0.2);
      ctx.fillRect(0, HORIZON - 2, W, 2);
      // вода полосами
      for (let y = HORIZON; y < H; y += 2) {
        ctx.fillStyle = rgbMix(P.water, P.deep, (y - HORIZON) / (H - HORIZON));
        ctx.fillRect(0, y, W, 2);
      }
      // отражение солнца / луны
      const refX = s < 1.12 ? sunX : moonX;
      const refA = s < 1.12 ? 1 - clamp((s - 0.9) / 0.22, 0, 1) * 0.7 : clamp((s - 1.1) / 0.4, 0, 1) * 0.7;
      for (let y = HORIZON + 1; y < H; y += 3) {
        const w = Math.round(3 + (y - HORIZON) * 0.25 + Math.sin(g.t * 2 + y) * 2);
        ctx.fillStyle = rgbStr(P.sun[0], P.sun[1], P.sun[2], Math.max(0, (0.35 - (y - HORIZON) / 360) * refA));
        ctx.fillRect(refX - w, y, w * 2, 1);
      }
      // блики
      ctx.fillStyle = rgbMix(P.water, WHITE, 0.35, 0.6);
      for (let i11 = 0; i11 < ripples.length; i11++) { const r = ripples[i11];
        const x = Math.floor((r.x + g.t * r.v) % (W + 20)) - 10;
        const w = Math.max(1, Math.round(r.w * (0.6 + 0.4 * Math.sin(g.t + r.p))));
        ctx.fillRect(x, Math.floor(r.y), w, 1);
      }
      // кувшинки
      for (let i12 = 0; i12 < pads.length; i12++) { const p = pads[i12];
        ctx.fillStyle = rgbMix(PAD_C, PAD_D, dusk);
        ctx.fillRect(p.x, p.y, 7, 2);
        ctx.fillRect(p.x + 1, p.y - 1, 4, 1);
        ctx.fillStyle = rgbMix(FLOW_C, FLOW_D, dusk);
        ctx.fillRect(p.x + 2, p.y - 2, 2, 1);
      }
      drawDuck(dusk);
      // камыш
      for (let i13 = 0; i13 < reeds.length; i13++) { const r = reeds[i13];
        const sway = Math.round(Math.sin(g.t * 1.3 + r.p));
        ctx.fillStyle = rgbMix(REED_C, REED_D, dusk);
        ctx.fillRect(r.x, H - r.h, 1, r.h);
        ctx.fillRect(r.x + sway, H - r.h - 2, 1, 2);
        ctx.fillStyle = rgbMix(CAT_C, CAT_D, dusk);
        ctx.fillRect(r.x + sway, H - r.h - 6, 2, 4);
      }
      // стрекозы днём, светлячки ночью
      for (let i14 = 0; i14 < flies.length; i14++) { const f = flies[i14];
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
        ctx.fillStyle = rgbMix(P.water, WHITE, 0.3, 0.5);
        ctx.fillRect(x - 2, DECK_Y + 30 + Math.round(Math.sin(g.t * 2 + x)), 7, 1);
      }
      ctx.fillStyle = woodS;
      ctx.fillRect(PIER_X, DECK_Y, W - PIER_X, 4);
      ctx.fillStyle = woodDS;
      for (let x = PIER_X + 5; x < W; x += 6) ctx.fillRect(x, DECK_Y, 1, 4);
      ctx.fillRect(PIER_X, DECK_Y + 4, W - PIER_X, 1);
      // табурет и ящик
      ctx.fillStyle = woodDS;
      ctx.fillRect(SPOT_X - 1, DECK_Y - 3, 5, 1);
      ctx.fillRect(SPOT_X - 1, DECK_Y - 2, 1, 2);
      ctx.fillRect(SPOT_X + 3, DECK_Y - 2, 1, 2);
      ctx.fillStyle = woodS;
      ctx.fillRect(SEAT_X - 2, DECK_Y - 4, 7, 4);
      ctx.fillStyle = woodDS;
      ctx.fillRect(SEAT_X - 2, DECK_Y - 2, 7, 1);
      // корзина старика с уловом
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
      // ведро игрока
      ctx.fillStyle = rgbMix(BUCK_C, BUCK_D, dusk);
      ctx.fillRect(BUCKET_X, DECK_Y - 7, 8, 7);
      ctx.fillStyle = rgbMix(BUCK2_C, BUCK2_D, dusk);
      ctx.fillRect(BUCKET_X, DECK_Y - 7, 8, 1);
      if (g.caught.length) {
        ctx.fillStyle = '#c9a640';
        ctx.fillRect(BUCKET_X + 2, DECK_Y - 9, 3, 2);
      }
      if (g.caught.length > 3) {
        ctx.fillStyle = '#5f8a5a';
        ctx.fillRect(BUCKET_X + 4, DECK_Y - 10, 3, 3);
      }

      // люди: дальний — раньше
      if (old.x >= you.x) { drawPerson(old, true, dusk); drawPerson(you, false, dusk); }
      else { drawPerson(you, false, dusk); drawPerson(old, true, dusk); }
      // удочка
      const tip = rodTip();
      const tx = tip.x, ty = tip.y;
      const base = rodBase();
      line(base.x, base.y, tx, ty, rgbMix(ROD_C, ROD_D, dusk));

      // леска и поплавок
      const lineC = 'rgba(240,240,240,0.7)';
      if (g.st === 'fly' || g.st === 'retrieve') {
        sagLine(tx, ty, g.bob.x, g.bob.y, 2, lineC);
        drawBobber(g.bob.x, g.bob.y);
      } else if (g.st === 'wait' || g.st === 'bite' || g.st === 'reel') {
        let by = g.bob.ty;
        let bx = g.bob.tx;
        if (g.st === 'wait') by += g.nibble > 0 ? 1 : Math.round(Math.sin(g.t * 2.5) * 0.6);
        if (g.st === 'bite') by += KINDS[g.kind].dip + (Math.floor(g.t * 12) % 2);
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

      // летящий улов
      for (let i15 = 0; i15 < flyers.length; i15++) { const f = flyers[i15];
        if (!f.on || f.delay > 0) continue;
        const k = f.t;
        const x = lerp(f.x0, f.x1, k);
        const y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * f.h;
        const sp = f.mini ? MINNOW : KINDS[f.kind].sp;
        drawSprite(ctx, sp, x - (sp.w >> 1), y - (sp.h >> 1), 1, f.flip);
      }
      // частицы
      for (let i16 = 0; i16 < parts.length; i16++) { const p = parts[i16];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }

      const hud = clamp(g.hud, 0, 1);
      if (hud <= 0.01) return;
      ctx.globalAlpha = hud;
      const inPlay = g.phase === 'play';

      // шкала заряда
      if (inPlay && g.st === 'charge') {
        const bx = 196, by = DECK_Y - 40, bw = 44;
        ctx.fillStyle = 'rgba(20,14,10,0.8)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
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

      // мини-игра вываживания
      if (inPlay && g.st === 'reel') {
        const k = KINDS[g.kind];
        const px = 282, py = 16, ph = 132;
        ctx.fillStyle = 'rgba(24,16,10,0.85)';
        ctx.fillRect(px - 4, py - 4, 34, ph + 8);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(px - 4, py - 4, 34, 1);
        ctx.fillRect(px - 4, py + ph + 3, 34, 1);
        ctx.fillStyle = rgbMix(P.water, P.deep, 0.5);
        ctx.fillRect(px, py, 14, ph);
        const zh = Math.round(k.zone * ph);
        const zy = Math.round(py + ph - (g.zone * ph) - zh);
        const inside = g.fish >= g.zone && g.fish <= g.zone + k.zone;
        ctx.fillStyle = inside ? '#5fd36a' : '#3e9a4a';
        ctx.fillRect(px + 1, zy, 12, zh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 1, zy, 12, 1);
        ctx.fillRect(px + 1, zy + zh - 1, 12, 1);
        const fy = Math.round(py + ph - g.fish * ph) - 2;
        const fc = g.kind === 'golden' ? '#ffd34a' : g.kind === 'chest' ? '#b07a3a' : g.kind === 'boot' ? '#7a5a3a' : g.kind === 'large' ? '#7ab070' : '#e0c050';
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(px + 3, fy - 1, 9, 6);
        ctx.fillStyle = fc;
        ctx.fillRect(px + 4, fy, 5, 4);
        ctx.fillRect(px + 9, fy + 1, 2, 2);
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(px + 5, fy + 1, 1, 1);
        const prh = Math.round(clamp(g.prog, 0, 1) * ph);
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(px + 18, py, 6, ph);
        ctx.fillStyle = g.prog < 0.25 ? '#e05040' : g.prog < 0.6 ? '#f0c040' : '#60d870';
        ctx.fillRect(px + 19, py + ph - prh, 4, prh);
        const blink = Math.floor(g.t * 3) % 2 === 0;
        drawIcon(ctx, 'up', px + 4, py + ph + 6);
        if (held && blink) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(px, py, 14, ph);
        }
      }

      // показ улова
      if (inPlay && g.st === 'show' && g.showKind) {
        const sp = KINDS[g.showKind].sp;
        const sc = 3;
        const age = 1.7 - g.timer;
        const pop = Math.min(1, age * 5);
        const cx = 150, cy = 44 - Math.round((1 - pop) * 10);
        ctx.fillStyle = 'rgba(20,14,10,0.6)';
        ctx.fillRect(cx - 34, cy - 14, 68, 46);
        ctx.fillStyle = 'rgba(255,230,150,0.25)';
        ctx.fillRect(cx - 34, cy - 14, 68, 1);
        drawSprite(ctx, sp, cx - Math.round(sp.w * sc / 2), cy - 8 + Math.round(Math.sin(age * 6) * 1), sc);
        if (g.showKind === 'golden' || g.showKind === 'chest') {
          ctx.fillStyle = '#fff6b0';
          const kk = Math.floor(age * 10) % 4;
          ctx.fillRect(cx - 24 + kk * 14, cy - 10 + (kk % 2) * 20, 1, 3);
          ctx.fillRect(cx - 25 + kk * 14, cy - 9 + (kk % 2) * 20, 3, 1);
        }
        const str = g.showPts === 2 ? '+2' : g.showPts === 10 ? '+10' : g.showPts === 25 ? '+25' : g.showPts === 40 ? '+40' : '+75';
        const tw = textWidth(str, 2);
        drawText(ctx, str, cx - tw / 2 + 1, cy + 18, '#2a1a10', 2);
        drawText(ctx, str, cx - tw / 2, cy + 17, '#ffe070', 2);
      }
      if (inPlay && g.st === 'miss') {
        const bx = g.bob.tx, by = g.bob.ty;
        drawText(ctx, 'x', bx - 3, by - 16, '#2a1a10', 2);
        drawText(ctx, 'x', bx - 3, by - 17, '#ff7060', 2);
      }

      // ---------- HUD ----------
      for (let i = 0; i < CASTS; i++) {
        const x = 5 + i * 6, y = 5;
        const used = g.phase !== 'intro' && (i < g.cast || (i === g.cast && g.st !== 'ready' && g.st !== 'charge' && g.st !== 'rest'));
        ctx.fillStyle = used ? 'rgba(40,30,30,0.5)' : '#f4f0e8';
        ctx.fillRect(x, y, 3, 2);
        ctx.fillStyle = used ? 'rgba(40,30,30,0.5)' : '#e04040';
        ctx.fillRect(x, y + 2, 3, 2);
      }
      let ix = 5;
      for (let i = 0; i < g.caught.length; i++) {
        const sp = KINDS[g.caught[i]].sp;
        drawSprite(ctx, sp, ix, 13);
        ix += sp.w + 2;
      }
      const scoreV = g.phase === 'intro' ? 0 : Math.round(g.score);
      const sw = textWidth(scoreV < 10 ? '0' : scoreV < 100 ? '00' : '000', 2);
      drawNumber(ctx, scoreV, W - 6 - sw + 1, 6, 'rgba(20,14,10,0.6)', 2);
      drawNumber(ctx, scoreV, W - 6 - sw, 5, '#ffffff', 2);
      const best = Math.max(0, Math.floor(api.best || 0));
      const bw2 = textWidth(best < 10 ? '0' : best < 100 ? '00' : best < 1000 ? '000' : '0000', 1);
      drawNumber(ctx, best, W - 6 - bw2, 18, '#ffe070', 1);
      drawIcon(ctx, 'trophy', W - 6 - bw2 - 10, 17);

      // подсказка: держи
      if ((inPlay && g.st === 'ready') || (g.phase === 'intro' && holder === you && passT < 0)) {
        if (Math.floor(g.t * 2) % 2 === 0) drawIcon(ctx, 'down', SPOT_X - 2, DECK_Y - 26);
      }
      ctx.globalAlpha = 1;
    };

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
      if (g.phase !== shownPhase) { shownPhase = g.phase; if (canvas.dataset) canvas.dataset.gamePhase = shownPhase; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
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
