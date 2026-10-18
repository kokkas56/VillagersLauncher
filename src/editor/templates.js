// Встроенные шаблоны скинов — нарисованы кодом, свои персонажи.
import { SIZE, getBoxes, PARTS } from './layout.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function shade(c, k) { return [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k)), c[3] ?? 255]; }

function painter(slim, seed = 1) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const boxes = getBoxes(slim);
  const r = rng(seed);
  const set = (x, y, c) => {
    if (!c) return;
    const i = (y * SIZE + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] ?? 255;
  };
  // fn(face, lx, ly, fw, fh) -> цвет или null; noise — лёгкая фактура
  const paint = (part, layer, fn, noise = 0.06) => {
    for (const [face, [fx, fy, fw, fh]] of Object.entries(boxes[part][layer])) {
      for (let ly = 0; ly < fh; ly++) for (let lx = 0; lx < fw; lx++) {
        const c = fn(face, lx, ly, fw, fh);
        if (c) set(fx + lx, fy + ly, noise ? shade(c, 1 - noise + r() * noise * 2) : c);
      }
    }
  };
  return { data, paint, set, boxes };
}

function face(p, part, opts) {
  const { skin, eye, hair, mouth = shade(skin, 0.7), beard } = opts;
  p.paint('head', 'base', (f, x, y, w) => {
    if (f === 'top') return hair;
    if (f === 'bottom') return shade(skin, 0.85);
    if (f === 'back') return y < 7 ? hair : shade(skin, 0.9);
    if (f === 'right' || f === 'left') return y < 3 || (f === 'right' ? x < 2 : x > 5) && y < 6 ? hair : skin;
    // лицо
    if (y < 2) return hair;
    if (y === 2 && (x === 0 || x === 7)) return hair;
    if (y === 4 && (x === 1 || x === 6)) return [245, 245, 245, 255];
    if (y === 4 && (x === 2 || x === 5)) return eye;
    if (y === 3 && x >= 1 && x <= 2) return shade(hair, 0.8);
    if (y === 3 && x >= 5 && x <= 6) return shade(hair, 0.8);
    if (y === 5 && (x === 3 || x === 4)) return shade(skin, 0.82);
    if (beard && y >= 6) return beard;
    if (y === 6 && x >= 3 && x <= 4) return mouth;
    return skin;
  }, 0.03);
}

function limbs(p, { arm, armShade = 0.85, hand, leg, boot, slim }) {
  for (const part of ['rightArm', 'leftArm']) {
    p.paint(part, 'base', (f, x, y) => {
      if (f === 'bottom') return hand;
      if (f === 'top') return arm;
      if (y >= 10) return hand;
      return f === 'back' ? shade(arm, armShade) : arm;
    });
  }
  for (const part of ['rightLeg', 'leftLeg']) {
    p.paint(part, 'base', (f, x, y) => {
      if (f === 'bottom' || y >= 10) return boot;
      if (f === 'top') return leg;
      return f === 'back' ? shade(leg, 0.85) : leg;
    });
  }
}

function blank(slim) { return painter(slim).data; }

const T = {
  villager(slim) {
    const p = painter(slim, 11);
    const skin = hex('#d9a982'), robe = hex('#7a5232'), belt = hex('#3b2a1c');
    face(p, 'head', { skin, eye: hex('#3d6b3a'), hair: hex('#5a3a22') });
    p.paint('body', 'base', (f, x, y) => (y === 7 ? belt : f === 'front' && x >= 3 && x <= 4 && y < 6 ? shade(robe, 0.8) : robe));
    limbs(p, { arm: robe, hand: skin, leg: robe, boot: hex('#3a2a1f'), slim });
    const o = painter(slim, 12);
    o.paint('body', 'overlay', (f, x, y) => (f === 'front' && y > 7 ? shade(robe, 0.9) : null));
    return [{ name: 'Основа', data: p.data }, { name: 'Детали', data: o.data }];
  },
  farmer(slim) {
    const p = painter(slim, 21);
    const skin = hex('#e2b48e'), shirt = hex('#c8b26a'), overall = hex('#3f6aa0');
    face(p, 'head', { skin, eye: hex('#5b3c1e'), hair: hex('#c9963d') });
    p.paint('body', 'base', (f, x, y) => (y < 4 && (x < 2 || x > 5) && f === 'front' ? shirt : y < 3 ? shirt : overall));
    limbs(p, { arm: shirt, hand: skin, leg: overall, boot: hex('#5a3a22'), slim });
    const o = painter(slim, 22);
    const straw = hex('#e3c46a');
    o.paint('head', 'overlay', (f, x, y) => (f === 'top' ? straw : y <= 1 && f !== 'bottom' ? (y === 1 ? hex('#a0402e') : straw) : null));
    return [{ name: 'Основа', data: p.data }, { name: 'Шляпа', data: o.data }];
  },
  smith(slim) {
    const p = painter(slim, 31);
    const skin = hex('#b9835e'), shirt = hex('#5d4b42'), apron = hex('#2e2a28');
    face(p, 'head', { skin, eye: hex('#2c2c2c'), hair: hex('#24201c'), beard: hex('#3a2a20') });
    p.paint('body', 'base', (f, x, y) => (f === 'front' && x > 0 && x < 7 && y > 1 ? apron : shirt));
    limbs(p, { arm: shirt, hand: skin, leg: hex('#3c3530'), boot: hex('#1c1a18'), slim });
    const o = painter(slim, 32);
    o.paint('rightArm', 'overlay', (f, x, y) => (y >= 8 && y < 11 ? hex('#6b4a2f') : null));
    o.paint('leftArm', 'overlay', (f, x, y) => (y >= 8 && y < 11 ? hex('#6b4a2f') : null));
    return [{ name: 'Основа', data: p.data }, { name: 'Перчатки', data: o.data }];
  },
  wanderer(slim) {
    const p = painter(slim, 41);
    const skin = hex('#f0c8a4'), cloak = hex('#2f4a3c'), inner = hex('#8a7a5a');
    face(p, 'head', { skin, eye: hex('#5aa0c8'), hair: hex('#d8d0c0') });
    p.paint('body', 'base', (f, x, y) => (f === 'front' && x >= 2 && x <= 5 ? inner : cloak));
    limbs(p, { arm: cloak, hand: skin, leg: hex('#4a3e30'), boot: hex('#2a2018'), slim });
    const o = painter(slim, 42);
    o.paint('head', 'overlay', (f, x, y) => (f === 'front' ? (y < 2 || x === 0 || x === 7 ? cloak : null) : f === 'bottom' ? null : cloak));
    o.paint('body', 'overlay', (f, x, y) => (f === 'front' ? (x < 2 || x > 5 ? shade(cloak, 1.1) : null) : f === 'back' ? shade(cloak, 1.1) : null));
    return [{ name: 'Основа', data: p.data }, { name: 'Капюшон', data: o.data }];
  },
  knight(slim) {
    const p = painter(slim, 51);
    const skin = hex('#e0b090'), steel = hex('#a9b0b8'), dark = hex('#6c737c'), cloth = hex('#8c2a2a');
    face(p, 'head', { skin, eye: hex('#3a5a8a'), hair: hex('#7a4a2a') });
    p.paint('body', 'base', (f, x, y) => (f === 'front' && (x === 3 || x === 4) && y > 1 ? cloth : y === 0 ? dark : steel), 0.1);
    limbs(p, { arm: steel, hand: dark, leg: steel, boot: dark, slim });
    const o = painter(slim, 52);
    o.paint('head', 'overlay', (f, x, y) => (f === 'bottom' ? null : f === 'front' ? (y < 3 || (y === 3 && (x < 2 || x > 5)) || x === 0 || x === 7 ? steel : null) : steel), 0.1);
    return [{ name: 'Основа', data: p.data }, { name: 'Шлем', data: o.data }];
  },
  base(slim) {
    const p = painter(slim, 61);
    const skin = hex('#e6b993');
    face(p, 'head', { skin, eye: hex('#4a6aa0'), hair: hex('#4a3020') });
    p.paint('body', 'base', () => hex('#4a8c6a'));
    limbs(p, { arm: hex('#4a8c6a'), hand: skin, leg: hex('#384a6a'), boot: hex('#2a2a2a'), slim });
    return [{ name: 'Основа', data: p.data }];
  }
};

export const BUILTIN_TEMPLATES = [
  { id: 'empty', name: 'Пустой холст', make: (slim) => [{ name: 'Слой 1', data: blank(slim) }] },
  { id: 'base', name: 'Простой игрок', make: T.base },
  { id: 'villager', name: 'Деревенский житель', make: T.villager },
  { id: 'farmer', name: 'Фермер', make: T.farmer },
  { id: 'smith', name: 'Кузнец', make: T.smith },
  { id: 'wanderer', name: 'Странник', make: T.wanderer },
  { id: 'knight', name: 'Рыцарь', make: T.knight }
];

// Скин по умолчанию для аккаунтов без своего скина
export function defaultSkinDataUrl() {
  const layers = T.villager(false);
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  for (const l of layers) {
    const tmp = document.createElement('canvas');
    tmp.width = SIZE; tmp.height = SIZE;
    tmp.getContext('2d').putImageData(new ImageData(l.data, SIZE, SIZE), 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }
  return c.toDataURL('image/png');
}

export function blankCape() {
  const data = new Uint8ClampedArray(64 * 32 * 4);
  return data;
}

export function defaultCape() {
  // простой изумрудный плащ с золотой каймой
  const data = new Uint8ClampedArray(64 * 32 * 4);
  const set = (x, y, c) => { const i = (y * 64 + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  const r = rng(7);
  for (let y = 0; y < 17; y++) for (let x = 0; x < 22; x++) {
    const edge = y === 1 || y === 16 || x === 1 || x === 10 || x === 11 || x === 20;
    const c = edge ? [214, 168, 70] : [30 + r() * 10, 120 + r() * 20, 72 + r() * 10];
    set(x, y, c);
  }
  return data;
}

export { PARTS };
