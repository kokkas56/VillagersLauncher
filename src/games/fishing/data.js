// «Рыбалка»: данные прогресса — озёра, места, виды рыб (28 = 24 обычных + 4 легендарных), снасти, задания дня.
// Спрайты рыб генерируются один раз при загрузке модуля (без выделений в кадре).

// ---------- спрайты ----------
export function sprite(pal, rows) {
  const r = [];
  let w = 0;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    if (row.length > w) w = row.length;
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
export function drawSprite(ctx, sp, x, y, s = 1, flip = false) {
  x = Math.round(x);
  y = Math.round(y);
  const r = sp.r;
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = r[j];
    const px = flip ? sp.w - r[j + 1] - r[j + 3] : r[j + 1];
    ctx.fillRect(x + px * s, y + r[j + 2] * s, r[j + 3] * s, s);
  }
}
// силуэт (для неизвестных рыб в альбоме)
export function drawSilhouette(ctx, sp, x, y, s, color) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  const r = sp.r;
  for (let j = 0; j < r.length; j += 4) ctx.fillRect(x + r[j + 1] * s, y + r[j + 2] * s, r[j + 3] * s, s);
}

// Рыба смотрит вправо (голова справа). o: { L, H, back, body, belly, fin, eye, pat, pc, tail: 'f' | 'r', big (высокий спинной), nose }
function fishSprite(o) {
  const L = o.L, H = o.H;
  const rows = [];
  const HH = H + 2; // плавники сверху/снизу
  for (let y = 0; y < HH; y++) rows.push(new Array(L).fill('.'));
  const cy = (H - 1) / 2 + 1;
  const set = (x, y, c) => { if (x >= 0 && x < L && y >= 0 && y < HH) rows[y][x] = c; };
  const get = (x, y) => (x >= 0 && x < L && y >= 0 && y < HH ? rows[y][x] : '.');
  // тело
  for (let x = 3; x < L; x++) {
    const t = (x - 3) / Math.max(1, L - 4);
    let sh = Math.pow(Math.sin(Math.PI * (0.18 + 0.8 * t)), 0.65);
    if (o.nose && t > 0.85) sh *= 0.6;
    const half = Math.max(0.5, (H / 2) * sh);
    const y0 = Math.round(cy - half + 0.3), y1 = Math.round(cy + half - 0.3);
    for (let y = y0; y <= y1; y++) {
      const k = (y - y0) / Math.max(1, y1 - y0);
      set(x, y, k < 0.3 ? 'a' : k > 0.72 ? 'c' : 'b');
    }
  }
  // хвост
  const c0 = Math.round(cy);
  if (o.tail === 'r') {
    for (let y = c0 - 2; y <= c0 + 2; y++) set(0, y, 'f');
    for (let y = c0 - 2; y <= c0 + 2; y++) set(1, y, 'f');
    for (let y = c0 - 1; y <= c0 + 1; y++) set(2, y, 'f');
  } else {
    set(0, c0 - 2, 'f'); set(0, c0 - 3, 'f'); set(0, c0 + 2, 'f'); set(0, c0 + 3, 'f');
    set(1, c0 - 2, 'f'); set(1, c0 - 1, 'f'); set(1, c0 + 1, 'f'); set(1, c0 + 2, 'f');
    set(2, c0 - 1, 'f'); set(2, c0, 'f'); set(2, c0 + 1, 'f');
  }
  // спинной и брюшной плавники
  const d0 = Math.floor(L * 0.38), d1 = Math.floor(L * (o.big ? 0.75 : 0.6));
  for (let x = d0; x <= d1; x++) {
    let top = 0;
    while (top < HH && get(x, top) === '.') top++;
    if (top > 0 && top < HH) set(x, top - 1, 'f');
    if (o.big && top > 1 && x < d1 - 1) set(x, top - 2, 'f');
  }
  const v = Math.floor(L * 0.5);
  {
    let bot = HH - 1;
    while (bot >= 0 && get(v, bot) === '.') bot--;
    if (bot >= 0 && bot < HH - 1) { set(v, bot + 1, 'f'); set(v + 1, bot + 1, 'f'); }
  }
  // узор
  if (o.pat === 'stripes') {
    for (let x = 5; x < L - 3; x += 3) for (let y = 0; y < HH; y++) if (get(x, y) === 'a' || get(x, y) === 'b') set(x, y, 'p');
  } else if (o.pat === 'spots') {
    for (let x = 4; x < L - 3; x++) for (let y = 0; y < HH; y++) if (get(x, y) === 'b' && ((x * 7 + y * 5) % 5 === 0)) set(x, y, 'p');
  } else if (o.pat === 'line') {
    for (let x = 3; x < L - 2; x++) if (get(x, c0) === 'b') set(x, c0, 'p');
  } else if (o.pat === 'scales') {
    for (let x = 4; x < L - 3; x += 2) for (let y = 0; y < HH; y++) if (get(x, y) === 'b' && (x + y) % 4 === 0) set(x, y, 'p');
  }
  // глаз и рот
  const ex = L - 3;
  let ey = 0;
  while (ey < HH && get(ex, ey) === '.') ey++;
  set(ex, ey + 1, 'e');
  if (o.whisk) { set(L - 1, c0 + 1, 'f'); set(L - 2, c0 + 2, 'f'); }
  const pal = { a: o.back, b: o.body, c: o.belly, f: o.fin, e: o.eye || '#141010', p: o.pc || o.back };
  return sprite(pal, rows.map((r) => r.join('')));
}

// ---------- озёра и места ----------
export const SPOT_NAMES = ['Мостки', 'Камыши', 'Омут'];
export const LAKES = [
  { id: 0, name: 'Тихий пруд', lvl: 1, spots: [1, 2, 4], rain: 0.18, xp: 1, coin: 1 },
  { id: 1, name: 'Лесное озеро', lvl: 6, spots: [6, 7, 9], rain: 0.24, xp: 1.5, coin: 1.6 },
  { id: 2, name: 'Горное озеро', lvl: 12, spots: [12, 13, 15], rain: 0.16, xp: 2.1, coin: 2.3 },
  { id: 3, name: 'Туманная старица', lvl: 18, spots: [18, 19, 21], rain: 0.34, xp: 2.8, coin: 3.1 }
];

// ---------- виды ----------
// tier: 0 обычная, 1 необычная, 2 редкая, 3 эпическая, 4 легенда
export const TIERS = [
  { name: 'Обычная', w: 100, xp: 4, coin: 3, col: '#c8c0b0', speed: 0.5, jumpy: 0.6, zone: 0.32, gain: 0.3, drain: 0.17 },
  { name: 'Необычная', w: 34, xp: 10, coin: 8, col: '#70d070', speed: 0.72, jumpy: 0.9, zone: 0.28, gain: 0.27, drain: 0.19 },
  { name: 'Редкая', w: 8, xp: 26, coin: 22, col: '#60a8ff', speed: 0.95, jumpy: 1.15, zone: 0.25, gain: 0.24, drain: 0.21 },
  { name: 'Эпическая', w: 1.6, xp: 60, coin: 60, col: '#c070ff', speed: 1.15, jumpy: 1.45, zone: 0.22, gain: 0.22, drain: 0.23 },
  { name: 'Легенда', w: 0.32, xp: 300, coin: 400, col: '#ffc830', speed: 1.3, jumpy: 1.7, zone: 0.2, gain: 0.2, drain: 0.24 }
];
// tod: веса [день, сумерки, ночь]; wx: [ясно, облачно, дождь]; sp: [мостки, камыши, омут]
// legend: need = { tod, wx, spot } — без этого не клюёт вовсе
const D = (o) => o;
export const SPECIES = [
  // Тихий пруд
  D({ id: 'karas', name: 'Карась', lake: 0, tier: 0, len: [10, 28], f: { L: 10, H: 6, back: '#7a6a30', body: '#c9a640', belly: '#efe0a0', fin: '#a07a30' }, sp: [1.4, 1, 0.5] }),
  D({ id: 'plotva', name: 'Плотва', lake: 0, tier: 0, len: [10, 30], f: { L: 10, H: 4, back: '#5a6a78', body: '#b8c4cc', belly: '#eef2f4', fin: '#d04a3a', eye: '#c02020' }, sp: [1.2, 1.2, 0.6] }),
  D({ id: 'okun', name: 'Окунь', lake: 0, tier: 1, len: [12, 36], f: { L: 11, H: 5, back: '#3e6a32', body: '#8aaa48', belly: '#e0d890', fin: '#e05a30', pat: 'stripes', pc: '#2a3e20' }, sp: [1, 1.2, 1], tod: [1.3, 1, 0.5] }),
  D({ id: 'lin', name: 'Линь', lake: 0, tier: 1, len: [15, 40], f: { L: 12, H: 5, back: '#3a4a20', body: '#6a7a30', belly: '#b0a860', fin: '#3a4a20', eye: '#d04020', tail: 'r' }, sp: [0.6, 1.5, 1], tod: [0.7, 1.6, 1] }),
  D({ id: 'karp', name: 'Карп', lake: 0, tier: 2, len: [30, 70], f: { L: 14, H: 6, back: '#6a4a20', body: '#b08038', belly: '#e8c880', fin: '#8a5a28', pat: 'scales', pc: '#d8a850' }, sp: [0.4, 1, 1.8] }),
  D({ id: 'zerkal', name: 'Зеркальный карп', lake: 0, tier: 3, len: [40, 90], f: { L: 15, H: 7, back: '#8a6420', body: '#d8b048', belly: '#fff0b0', fin: '#a87a30', pat: 'spots', pc: '#fff8d0' }, sp: [0.2, 0.6, 2], tod: [0.6, 1, 1.6] }),
  D({ id: 'zolotoy', name: 'Золотой карась', lake: 0, tier: 4, len: [30, 45], beh: 'blink', need: { tod: 1, spot: 1 }, f: { L: 12, H: 7, back: '#e0a020', body: '#ffd84a', belly: '#fff6b0', fin: '#ff9a20', eye: '#802000', pat: 'scales', pc: '#fffad0', big: 1 } }),
  // Лесное озеро
  D({ id: 'krasnoper', name: 'Краснопёрка', lake: 1, tier: 0, len: [12, 30], f: { L: 10, H: 5, back: '#6a6a3a', body: '#c0b880', belly: '#f0e8c0', fin: '#e03a2a' }, sp: [1.2, 1.3, 0.5] }),
  D({ id: 'lesch', name: 'Лещ', lake: 1, tier: 0, len: [20, 55], f: { L: 12, H: 7, back: '#4a4a3a', body: '#9a9070', belly: '#d8d0b0', fin: '#5a5040' }, sp: [0.8, 1, 1.4] }),
  D({ id: 'schuka', name: 'Щука', lake: 1, tier: 1, len: [35, 100], f: { L: 16, H: 4, back: '#2e4a28', body: '#6a8a48', belly: '#d8e0b0', fin: '#a07040', pat: 'spots', pc: '#c8d890', nose: 1 }, sp: [0.7, 1.6, 0.9] }),
  D({ id: 'sudak', name: 'Судак', lake: 1, tier: 1, len: [30, 80], f: { L: 14, H: 4, back: '#4a5a58', body: '#a0b0a8', belly: '#e8f0e8', fin: '#7a8a80', pat: 'stripes', pc: '#3a4a48', big: 1 }, sp: [0.6, 0.8, 1.6], tod: [0.5, 1.4, 1.5] }),
  D({ id: 'nalim', name: 'Налим', lake: 1, tier: 2, len: [30, 80], f: { L: 14, H: 4, back: '#3a3420', body: '#7a6a40', belly: '#c8b880', fin: '#5a4a30', pat: 'spots', pc: '#2a2410', tail: 'r', whisk: 1 }, sp: [0.4, 0.8, 1.8], tod: [0.15, 0.8, 2.4] }),
  D({ id: 'ugor', name: 'Угорь', lake: 1, tier: 3, len: [50, 120], f: { L: 18, H: 3, back: '#2a2a20', body: '#5a5a3a', belly: '#b0a878', fin: '#4a4a30', tail: 'r' }, sp: [0.3, 1, 1.6], tod: [0.2, 0.8, 2.2], wx: [0.8, 1, 1.8] }),
  D({ id: 'carica', name: 'Щука-царица', lake: 1, tier: 4, len: [110, 160], beh: 'dash', need: { wx: 2, spot: 2 }, f: { L: 18, H: 5, back: '#14402a', body: '#30a060', belly: '#d0f0b0', fin: '#e0c040', eye: '#ffe040', pat: 'spots', pc: '#a0f0a0', nose: 1, big: 1 } }),
  // Горное озеро
  D({ id: 'harius', name: 'Хариус', lake: 2, tier: 0, len: [15, 40], f: { L: 11, H: 5, back: '#4a5068', body: '#9aa0b8', belly: '#e0e4ee', fin: '#7a5aa0', big: 1 }, sp: [1.2, 1, 0.8] }),
  D({ id: 'forel', name: 'Форель', lake: 2, tier: 0, len: [18, 50], f: { L: 12, H: 5, back: '#4a6a4a', body: '#b0b890', belly: '#f0e8e0', fin: '#a08060', pat: 'line', pc: '#e08a90' }, sp: [1, 1.2, 1] }),
  D({ id: 'golec', name: 'Голец', lake: 2, tier: 1, len: [20, 55], f: { L: 12, H: 5, back: '#3a4a5a', body: '#7a90a0', belly: '#f0a060', fin: '#e07040', pat: 'spots', pc: '#f0d8b0' }, sp: [0.8, 1, 1.4], tod: [0.8, 1.3, 1] }),
  D({ id: 'sig', name: 'Сиг', lake: 2, tier: 1, len: [25, 60], f: { L: 13, H: 5, back: '#5a6a80', body: '#c8d4e0', belly: '#f4f8fc', fin: '#8a9aaa' }, sp: [1, 1, 1.2], wx: [0.8, 1.5, 1] }),
  D({ id: 'lenok', name: 'Ленок', lake: 2, tier: 2, len: [30, 70], f: { L: 14, H: 5, back: '#5a4030', body: '#a07850', belly: '#e8c8a0', fin: '#c05030', pat: 'spots', pc: '#3a2010' }, sp: [0.5, 0.8, 1.7] }),
  D({ id: 'taimen', name: 'Таймень', lake: 2, tier: 3, len: [60, 150], f: { L: 18, H: 6, back: '#5a2a28', body: '#a85040', belly: '#e8b090', fin: '#c03a28', pat: 'spots', pc: '#3a1410' }, sp: [0.2, 0.7, 2], tod: [0.6, 1.5, 1.2] }),
  D({ id: 'icetaimen', name: 'Ледяной таймень', lake: 2, tier: 4, len: [120, 180], beh: 'ghost', need: { tod: 2, wx: 0 }, f: { L: 18, H: 6, back: '#3a7ab0', body: '#9ad8f8', belly: '#f0fcff', fin: '#d0f4ff', eye: '#204060', pat: 'spots', pc: '#ffffff', big: 1 } }),
  // Туманная старица
  D({ id: 'golavl', name: 'Голавль', lake: 3, tier: 0, len: [20, 55], f: { L: 12, H: 5, back: '#3a3a30', body: '#9a9a80', belly: '#e0dcc8', fin: '#c05040', pat: 'scales', pc: '#5a5a48' }, sp: [1.2, 1, 0.8] }),
  D({ id: 'zhereh', name: 'Жерех', lake: 3, tier: 0, len: [25, 70], f: { L: 13, H: 5, back: '#3a4a5a', body: '#b0bcc8', belly: '#f0f4f8', fin: '#8a6a80' }, sp: [1, 1.2, 1], tod: [1.3, 1, 0.6] }),
  D({ id: 'som', name: 'Сом', lake: 3, tier: 1, len: [60, 160], f: { L: 16, H: 5, back: '#1e2420', body: '#4a5448', belly: '#a8a898', fin: '#2a302a', tail: 'r', whisk: 1 }, sp: [0.4, 0.9, 1.8], tod: [0.4, 1, 2] }),
  D({ id: 'sterlyad', name: 'Стерлядь', lake: 3, tier: 1, len: [40, 90], f: { L: 16, H: 4, back: '#4a4a48', body: '#8a8a80', belly: '#e0dcc0', fin: '#6a6a60', pat: 'line', pc: '#d8d4c0', nose: 1, whisk: 1 }, sp: [0.6, 1, 1.4] }),
  D({ id: 'osetr', name: 'Осётр', lake: 3, tier: 2, len: [80, 180], f: { L: 17, H: 5, back: '#3a3a3a', body: '#707068', belly: '#d8d8c8', fin: '#505048', pat: 'line', pc: '#e8e8d8', nose: 1, whisk: 1 }, sp: [0.3, 0.8, 1.8], wx: [0.8, 1, 1.5] }),
  D({ id: 'beluga', name: 'Белуга', lake: 3, tier: 3, len: [150, 300], f: { L: 18, H: 7, back: '#5a6064', body: '#a8b0b4', belly: '#f0f2f2', fin: '#7a8084', nose: 1, whisk: 1 }, sp: [0.1, 0.6, 2.2], tod: [0.7, 1, 1.5] }),
  D({ id: 'drevsom', name: 'Древний сом', lake: 3, tier: 4, len: [250, 400], beh: 'heavy', need: { tod: 2, wx: 2, spot: 2 }, f: { L: 18, H: 7, back: '#10140e', body: '#2a3424', belly: '#6a7a58', fin: '#1a2016', eye: '#ff4020', tail: 'r', whisk: 1, pat: 'spots', pc: '#4a5a3a' } })
];
for (let i = 0; i < SPECIES.length; i++) {
  const s = SPECIES[i];
  s.idx = i;
  s.sp = s.sp || [1, 1, 1];
  s.tod = s.tod || [1, 1, 1];
  s.wx = s.wx || [1, 1, 1];
  s.spr = fishSprite(s.f);
}
export const SPECIES_BY_ID = {};
for (let i = 0; i < SPECIES.length; i++) SPECIES_BY_ID[SPECIES[i].id] = SPECIES[i];
export const LEGENDS = SPECIES.filter((s) => s.tier === 4).map((s) => s.id);
export const ALBUM_TOTAL = SPECIES.length;

// мусор и клад (в альбом не идут)
export const BOOT = { id: 'boot', name: 'Ботинок', tier: -1, spr: sprite({ a: '#6b4a2e', b: '#c8b080', c: '#3a2a1e', d: '#8a6440' }, ['.aaa....', '.aba....', '.ada....', '.aaa....', '.aaaaa..', 'aaaaaaaa', 'cccccccc']) };
export const CHEST = { id: 'chest', name: 'Сундучок', tier: -2, spr: sprite({ a: '#5a3a1e', b: '#9a6a34', c: '#3a2a18', g: '#f0c040', h: '#fff2a0' }, ['.aaaaaaaa.', 'abbbbbbbba', 'cccccccccc', 'abbbgbbbba', 'abbbhbbbba', 'abbbbbbbba', 'aaaaaaaaaa']) };
export const MINNOW = sprite({ a: '#9ab0b8', b: '#d8e4e8', t: '#7a9098' }, ['.aaa.t', 'abbbaa', '.aaa.t']);

// ---------- снасти ----------
export const UPGRADES = [
  { id: 'rod', name: 'Удилище', hint: 'зона шире', max: 6, base: 60, k: 1.75 },
  { id: 'line', name: 'Леска', hint: 'срыв медленнее', max: 6, base: 45, k: 1.75 },
  { id: 'reel', name: 'Катушка', hint: 'тянешь быстрее', max: 6, base: 70, k: 1.75 },
  { id: 'bait', name: 'Наживка', hint: 'редкие чаще', max: 6, base: 90, k: 1.8 },
  { id: 'flask', name: 'Термос', hint: 'дольше сил', max: 5, base: 50, k: 1.8 }
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.k, lvl) / 5) * 5;

// ---------- уровни ----------
export const xpNeed = (lvl) => Math.round(60 + 28 * Math.pow(lvl, 1.55));
export const MAX_LVL = 40;

// ---------- задания дня ----------
// type: 0 поймай N рыб, 1 поймай N <вид>, 2 редкая+ рыба, 3 монеты, 4 подряд без срыва, 5 ночью, 6 на месте «Омут»/«Камыши»
export const DAILY_TYPES = 7;
