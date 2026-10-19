// Пиксельные иконки предметов, артефактов и мелкие помощники рисования для «Побега».
// Всё заранее разобрано в отрезки — в кадре только fillRect.

export const AN = 16;
export const alphaTable = (r, g, b, maxA) => {
  const t = [];
  for (let i = 0; i < AN; i++) t.push(`rgba(${r},${g},${b},${((maxA * i) / (AN - 1)).toFixed(3)})`);
  return t;
};
export const pickA = (tbl, k) => tbl[Math.max(0, Math.min(AN - 1, Math.round(k * (AN - 1))))];
export const mixC = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
export const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a — основной, b — светлый, c — тёмный цвет артефакта
const SHAPES = {
  key: ['.aaa...', 'a...a..', 'a...a..', '.aba...', '..a....', '..aa...', '..a.aa.'],
  horseshoe: ['.aaaaa.', 'ab...ba', 'ac...ca', 'ab...ba', 'ac...ca', 'cc...cc', 'cc...cc'],
  coin: ['..aaa..', '.abbba.', 'abaaaca', 'abacaca', 'abaaaca', '.accca.', '..ccc..'],
  arrow: ['......b', '....bba', '...baa.', '..cac..', '.c.c...', 'c......', '.......'],
  ring: ['..ccc..', '.cbbbc.', '.a...a.', 'a.....a', 'a.....a', '.a...a.', '..aaa..'],
  collar: ['.aaaaa.', 'a.....a', 'a.....a', 'a.....a', '.aa.aa.', '...b...', '..bbb..'],
  tooth: ['.aaaa..', 'abbbba.', 'abbbba.', '.abba..', '.aba...', '.aa....', '.c.....'],
  pearl: ['.......', '..aaa..', '.abbaa.', '.abaaa.', '.aaaac.', '..acc..', '.......'],
  idol: ['.aaaaa.', 'abcacba', 'aaaaaaa', '.acaca.', '.aaaaa.', '..a.a..', '.cc.cc.'],
  beetle: ['..c.c..', '.aaaaa.', 'aabbbaa', 'aabcbaa', 'aaacaaa', '.aacaa.', 'c.c.c.c'],
  hourglass: ['ccccccc', '.abbba.', '..aba..', '...a...', '..aba..', '.abbba.', 'ccccccc'],
  stinger: ['.....aa', '....a.b', '....a..', '...a...', '..aa...', '.aac...', 'cc.....'],
  crystal: ['...b...', '..aba..', '.aabaa.', '.aabac.', '.aaacc.', '..acc..', '...c...'],
  flake: ['...b...', '.b.a.b.', '..aaa..', 'baaaaab', '..aaa..', '.b.a.b.', '...b...'],
  compass: ['..aaa..', '.abbba.', 'abbcbba', 'abccbba', 'abbbbba', '.abbba.', '..aaa..'],
  bottle: ['...c...', '...a...', '..aaa..', '.abbba.', '.abbba.', '.aaaaa.', '..ccc..'],
  pick: ['.aaaaa.', 'a..c..a', '...c...', '...c...', '...c...', '...c...', '.......'],
  nugget: ['.......', '..aab..', '.aabba.', 'aaaaab.', '.aacaa.', '..ccc..', '.......'],
  rune: ['.aaaaa.', 'aabbbaa', 'aabaaaa', 'aabbaaa', 'aabaaaa', 'aabbbaa', '.ccccc.'],
  scroll: ['cc.....', 'caaaaa.', '.abbba.', '.aaaaa.', '.abbba.', '.aaaaac', '.....cc'],
  orb: ['..ccc..', '.caaac.', 'caabaac', 'cabbbac', 'caabaac', '.caaac.', '..ccc..'],
  candle: ['...b...', '..bab..', '...b...', '..aaa..', '..aaa..', '..aaa..', '.ccccc.'],
  feather: ['.....bb', '....aab', '...aab.', '..aab..', '.aab...', '.ab....', 'c......'],
  shard: ['....b..', '...ab..', '..aab..', '.aaab..', '.aaa...', '..ac...', '..c....'],
  crown: ['a..a..a', 'aa.a.aa', 'aaaaaaa', 'abcbcba', 'aaaaaaa', '.......', '.......'],
  seal: ['..aaa..', '.aaaaa.', 'aabbbaa', 'aabaaaa', 'aabbbaa', '.aaaaa.', '..ccc..'],
  quill: ['......b', '.....bb', '....ab.', '...aa..', '..aa...', '.c.....', 'c......']
};

const ART_RUNS = {};
for (const k in SHAPES) {
  const rows = SHAPES[k];
  const list = []; // [colorIndex, x, y, w]
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    let x = 0;
    while (x < r.length) {
      const ch = r[x];
      const ci = ch === 'a' ? 0 : ch === 'b' ? 1 : ch === 'c' ? 2 : -1;
      if (ci >= 0) {
        let e = x;
        while (e < r.length && r[e] === ch) e++;
        list.push(ci, x, y, e - x);
        x = e;
      } else x++;
    }
  }
  ART_RUNS[k] = list;
}

// cols = [a, b, c]; silhouette — нарисовать тенью
export function drawArt(ctx, shape, cols, x, y, s, silhouette) {
  const r = ART_RUNS[shape];
  if (!r) return;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = silhouette ? silhouette : cols[r[j]];
    ctx.fillRect(x + r[j + 1] * s, y + r[j + 2] * s, r[j + 3] * s, s);
  }
}

// иконки предметов и интерфейса
const ICONS = {
  bone: { pal: { a: '#ece4d0', b: '#b8ae96' }, rows: ['aa.....', 'aaa....', '.bab...', '..bab..', '...bab.', '....aaa', '.....aa'] },
  bottle: { pal: { a: '#3a8a4a', b: '#9ae0a0', c: '#7a4e2a' }, rows: ['...c...', '...a...', '..aaa..', '.aabaa.', '.aabaa.', '.aaaaa.', '..aaa..'] },
  cloak: { pal: { a: '#5a3a8a', b: '#9a7ad0', c: '#e0c040' }, rows: ['..aaa..', '.abcba.', '.aaaaa.', 'aabaaaa', 'aabaaaa', 'aaaaaba', 'a.a.a.a'] },
  flask: { pal: { a: '#8a6a44', b: '#5ab0e0', c: '#c8e8ff' }, rows: ['..aa...', '..aa...', '.aaaa..', 'abbbba.', 'abcbba.', 'abbbba.', '.aaaa..'] },
  prop: { pal: { a: '#a87a44', b: '#6a4a2a' }, rows: ['aaaaaaa', 'bbbbbbb', '.a...a.', '.a...a.', '.a...a.', '.a...a.', '.b...b.'] },
  fav: { pal: { a: '#ffd34a', b: '#fff4b0', c: '#c8901e' }, rows: ['...a...', '..aba..', 'aaabaaa', '.aaaac.', '..aac..', '.ac.ac.', '.c...c.'] },
  book: { pal: { a: '#8a3a2a', b: '#e8d8b0', c: '#5a2218' }, rows: ['.aaaaa.', 'abbbbba', 'abaaaba', 'abbbbba', 'abaaaba', 'abbbbba', '.ccccc.'] },
  lock: { pal: { a: '#9aa4b0', b: '#ffd34a', c: '#5a6470' }, rows: ['..aaa..', '.a...a.', '.a...a.', 'bbbbbbb', 'bbbcbbb', 'bbbcbbb', 'bbbbbbb'] },
  check: { pal: { a: '#7dffaa' }, rows: ['......a', '.....aa', 'a...aa.', 'aa.aa..', '.aaa...', '..a....', '.......'] },
  sun: { pal: { a: '#ffd060', b: '#fff4b0' }, rows: ['a..a..a', '.aaaaa.', '.abbba.', 'aabbbaa', '.abbba.', '.aaaaa.', 'a..a..a'] },
  cape: { pal: { a: '#3a3a44', b: '#ffd34a', c: '#2a2a33' }, rows: ['bbbbbbb', 'baaaaab', 'bacbcab', 'baabaab', 'bacacab', 'baaaaab', 'bbbbbbb'] }
};
const ICON_RUNS = {};
for (const name in ICONS) {
  const ic = ICONS[name];
  const list = [];
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
  ICON_RUNS[name] = list;
}
export function drawIco(ctx, name, x, y, s = 1) {
  const r = ICON_RUNS[name];
  if (!r) return;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < r.length; j += 4) {
    ctx.fillStyle = r[j];
    ctx.fillRect(x + r[j + 1] * s, y + r[j + 2] * s, r[j + 3] * s, s);
  }
}
