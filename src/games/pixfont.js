// Крошечный пиксельный шрифт 3x5 (цифры и пара символов) и пиксельные иконки для HUD мини-игр.
// Всё рисуется только fillRect, без сглаживания.
//
// API:
//   drawNumber(ctx, n, x, y, color, scale = 1)        -> ширина нарисованного (px)
//   drawText(ctx, str, x, y, color, scale = 1)        -> ширина (поддержаны 0-9 : + - x / . % ! ? и пробел)
//   textWidth(str, scale = 1)                         -> ширина строки без рисования
//   drawIcon(ctx, name, x, y, scale = 1)              -> ширина иконки (0, если иконки нет)
//   iconSize(name)                                    -> { w, h }
//   ICON_NAMES                                        -> список доступных иконок

const GLYPHS = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
  '.': ['0', '0', '0', '0', '1'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  'x': ['000', '101', '010', '101', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '%': ['101', '001', '010', '100', '101'],
  '!': ['1', '1', '1', '0', '1'],
  '?': ['111', '001', '011', '000', '010'],
  ' ': ['00', '00', '00', '00', '00']
};

// глиф -> список горизонтальных отрезков [x, y, w]
function runs(rows) {
  const out = [];
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    let x = 0;
    while (x < r.length) {
      if (r[x] === '1') {
        let e = x;
        while (e < r.length && r[e] === '1') e++;
        out.push(x, y, e - x);
        x = e;
      } else x++;
    }
  }
  return out;
}

const FONT = {};
for (const k in GLYPHS) FONT[k] = { w: GLYPHS[k][0].length, r: runs(GLYPHS[k]) };

export function textWidth(str, scale = 1) {
  const s = String(str);
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]];
    if (g) w += (g.w + 1) * scale;
  }
  return Math.max(0, w - scale);
}

export function drawText(ctx, str, x, y, color, scale = 1) {
  const s = String(str);
  x = Math.round(x);
  y = Math.round(y);
  if (color) ctx.fillStyle = color;
  let cx = x;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]];
    if (!g) continue;
    const r = g.r;
    for (let j = 0; j < r.length; j += 3) ctx.fillRect(cx + r[j] * scale, y + r[j + 1] * scale, r[j + 2] * scale, scale);
    cx += (g.w + 1) * scale;
  }
  return Math.max(0, cx - x - scale);
}

export function drawNumber(ctx, n, x, y, color, scale = 1) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return drawText(ctx, String(v), x, y, color, scale);
}

// Целые числа без аллокаций строк (для отрисовки каждый кадр).
// intWidth(n, scale = 1, minDigits = 1) -> ширина; drawInt(ctx, n, x, y, color, scale = 1, minDigits = 1) -> ширина
const DIGIT_GLYPHS = [];
for (let i = 0; i < 10; i++) DIGIT_GLYPHS.push(FONT[String(i)]);

function digitCount(v) {
  let d = 1;
  while (v >= 10) { v = Math.floor(v / 10); d++; }
  return d;
}

export function intWidth(n, scale = 1, minDigits = 1) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  const d = Math.max(minDigits, digitCount(v));
  return d * 4 * scale - scale;
}

export function drawInt(ctx, n, x, y, color, scale = 1, minDigits = 1) {
  let v = Math.max(0, Math.floor(Number(n) || 0));
  const d = Math.max(minDigits, digitCount(v));
  x = Math.round(x);
  y = Math.round(y);
  if (color) ctx.fillStyle = color;
  for (let k = d - 1; k >= 0; k--) {
    const g = DIGIT_GLYPHS[v % 10];
    v = Math.floor(v / 10);
    const cx = x + k * 4 * scale;
    const r = g.r;
    for (let j = 0; j < r.length; j += 3) ctx.fillRect(cx + r[j] * scale, y + r[j + 1] * scale, r[j + 2] * scale, scale);
  }
  return d * 4 * scale - scale;
}

// ---------- иконки ----------
// каждый символ строки — индекс в палитре иконки ('.' = прозрачно)
const ICONS = {
  heart: {
    pal: { a: '#e04848', b: '#ff8a8a', c: '#9c2a2a' },
    rows: ['.aa.aa.', 'abaaaaa', 'aaaaaaa', '.aaaaa.', '..aca..', '...c...']
  },
  heartEmpty: {
    pal: { a: '#5a3a3a', b: '#2a1c1c' },
    rows: ['.aa.aa.', 'abbabba', 'abbbbba', '.abbba.', '..aba..', '...a...']
  },
  emerald: {
    pal: { a: '#2fd36a', b: '#b8ffd0', c: '#17914a', d: '#0d5e2f' },
    rows: ['..a..', '.aba.', 'abaac', 'aaacc', 'aaccd', '.ccd.', '..d..']
  },
  trophy: {
    pal: { a: '#ffd34a', b: '#fff2a8', c: '#c8901e', d: '#8a5e14' },
    rows: ['aaaaaaa', 'abaaaca', '.aaaac.', '..aac..', '...c...', '..ccc..', '.ddddd.']
  },
  clock: {
    pal: { a: '#d8d0c0', b: '#6a5a4a', c: '#2a2420', d: '#f4ecdc' },
    rows: ['..bbb..', '.bdddb.', 'bddcddb', 'bddcddb', 'bdddccb', '.bdddb.', '..bbb..']
  },
  boot: {
    pal: { a: '#8a5a32', b: '#b8804a', c: '#4a2e18', d: '#62d8ff' },
    rows: ['.aab...', '.aab...', '.aab...', '.aab...', '.aaabb.', 'aaaaaab', 'ccccccc']
  },
  sword: {
    pal: { a: '#e8eef4', b: '#9aa8b8', c: '#7a4e2a', d: '#e0b84a' },
    rows: ['......a', '.....ab', '....ab.', '.d.ab..', '..db...', '.cdd...', 'c......']
  },
  pickaxe: {
    pal: { a: '#c8d0dc', b: '#7e8a9a', c: '#7a4e2a', d: '#a8723e' },
    rows: ['.aaaa..', 'a...ba.', '...d.b.', '..d...a', '.c.....', 'c......', '.......']
  },
  horseshoe: {
    pal: { a: '#b8c2ce', b: '#6e7a8a', c: '#2a2e36' },
    rows: ['.aaaaa.', 'ab...ba', 'ac...ca', 'ab...ba', 'ac...ca', 'bb...bb', 'bb...bb']
  },
  shovel: {
    pal: { a: '#7a4e2a', b: '#a8723e', c: '#c8d0dc', d: '#7e8a9a' },
    rows: ['....bb.', '.....a.', '....a..', '...a...', '.cc....', 'ccd....', 'cd.....']
  },
  hammer: {
    pal: { a: '#9aa4b2', b: '#5e6878', c: '#7a4e2a' },
    rows: ['.aaa...', 'aaaab..', '.abbc..', '....c..', '.....c.', '......c', '.......']
  },
  skull: {
    pal: { a: '#e8e2d4', b: '#2a2420' },
    rows: ['.aaaaa.', 'aaaaaaa', 'abbabba', 'aaaaaaa', '.aabaa.', '.a.a.a.']
  },
  eye: {
    pal: { a: '#f4ecdc', b: '#2a2420', c: '#ffd34a' },
    rows: ['..ccc..', '.aaaaa.', 'aabbbaa', '.aaaaa.', '..ccc..']
  },
  up: { pal: { a: '#ffffff' }, rows: ['..a..', '.aaa.', 'aaaaa', '..a..', '..a..'] },
  down: { pal: { a: '#ffffff' }, rows: ['..a..', '..a..', 'aaaaa', '.aaa.', '..a..'] },
  left: { pal: { a: '#ffffff' }, rows: ['..a..', '.aa..', 'aaaaa', '.aa..', '..a..'] },
  right: { pal: { a: '#ffffff' }, rows: ['..a..', '..aa.', 'aaaaa', '..aa.', '..a..'] }
};

const ICON_RUNS = {};
for (const name in ICONS) {
  const ic = ICONS[name];
  const list = []; // [color, x, y, w, ...]
  for (let y = 0; y < ic.rows.length; y++) {
    const r = ic.rows[y];
    let x = 0;
    while (x < r.length) {
      const ch = r[x];
      if (ch !== '.' && ic.pal[ch]) {
        let e = x;
        while (e < r.length && r[e] === ch) e++;
        list.push(ic.pal[ch], x, y, e - x);
        x = e;
      } else x++;
    }
  }
  ICON_RUNS[name] = { w: ic.rows[0].length, h: ic.rows.length, r: list };
}

export const ICON_NAMES = Object.keys(ICONS);

export function iconSize(name) {
  const ic = ICON_RUNS[name];
  return ic ? { w: ic.w, h: ic.h } : { w: 0, h: 0 };
}

export function drawIcon(ctx, name, x, y, scale = 1) {
  const ic = ICON_RUNS[name];
  if (!ic) return 0;
  x = Math.round(x);
  y = Math.round(y);
  const r = ic.r;
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = r[j];
    ctx.fillRect(x + r[j + 1] * scale, y + r[j + 2] * scale, r[j + 3] * scale, scale);
  }
  return ic.w * scale;
}

// ---------- кэш цветов ----------
// rgbStr(r, g, b, a) -> строка 'rgb(...)' / 'rgba(...)' из кэша: без выделений памяти в кадре.
// Альфа квантуется до 1/32. rgbMix(c1, c2, t, a) — то же для смеси двух цветов [r, g, b].
const COLOR_CACHE = new Map();
export function rgbStr(r, g, b, a = 1) {
  r = r <= 0 ? 0 : r >= 255 ? 255 : r | 0;
  g = g <= 0 ? 0 : g >= 255 ? 255 : g | 0;
  b = b <= 0 ? 0 : b >= 255 ? 255 : b | 0;
  const aq = a >= 1 ? 32 : a > 0 ? Math.round(a * 32) : 0;
  const key = ((r << 16) | (g << 8) | b) * 33 + aq;
  let s = COLOR_CACHE.get(key);
  if (s === undefined) {
    if (COLOR_CACHE.size > 40000) COLOR_CACHE.clear();
    s = aq === 32 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${aq / 32})`;
    COLOR_CACHE.set(key, s);
  }
  return s;
}
export function rgbMix(c1, c2, t, a = 1) {
  return rgbStr(c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, a);
}
