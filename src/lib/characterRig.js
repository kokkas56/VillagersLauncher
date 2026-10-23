// «Персонаж» (SkinKokk): каталог частей, проверка персонажа, текстура частей и кости в формате общей оснастки
// (kokk_rig.md §2.2), плюс 3D-части для превью на skinview3d. Каталог — тот же файл, что внутри мода:
// skinkokk/src/main/resources/assets/skinkokk/character/parts.json (генерирует skinkokk/tools/gen_parts.py).
// Рисование текстуры — та же математика, что в моде (CharPaint.java), поэтому превью совпадает с игрой.
import CATALOG from '../../skinkokk/src/main/resources/assets/skinkokk/character/parts.json';

export { CATALOG };
export const KINDS = ['ears', 'tail', 'hair', 'clothes'];
export const BODIES = ['normal', 'strong', 'slim', 'short', 'tall'];
export const PATTERNS = Object.keys(CATALOG.patterns);
export const PATTERN_HINTS = {
  none: 'Один цвет', stripes: 'Горизонтальные полосы', vstripes: 'Полосы поперёк (на хвосте — кольца)', checker: 'Шахматная клетка',
  dots: 'Мелкий горошек', spots: 'Случайные пятна', zigzag: 'Зигзаг', tip: 'Кончики (уши, хвост, концы прядей) — цвет узора',
  belly: 'Низ — цвет узора (брюшко дракона)'
};
export const MAX_JSON = 16384;

export const DEFAULT_CHARACTER = Object.freeze({
  v: 1, on: true, gender: 'male', body: 'normal', height: 1, arms: 'auto', chest: { size: 0.45, phys: 0.6 }, phys: 1, parts: []
});

const HEX = /^#?[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9_]{1,24}$/;
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const col = (s, d) => (typeof s === 'string' && HEX.test(s) ? '#' + s.replace('#', '').toLowerCase() : d);

export function partDef(kind, id) { return (CATALOG.parts[kind] || {})[id] || null; }
export function hasSprings(kind, id) { const p = partDef(kind, id); return !!(p && p.bones.some((b) => b.spring)); }

/** Проверка и нормализация — как CharacterData.parse в моде. */
export function cleanCharacter(c) {
  if (!c || typeof c !== 'object') return { ...DEFAULT_CHARACTER, parts: [] };
  const female = c.gender === 'female';
  const out = {
    v: 1, on: c.on !== false, gender: female ? 'female' : 'male', body: BODIES.includes(c.body) ? c.body : 'normal',
    height: clamp(c.height, 0.9, 1.08, 1), arms: ['slim', 'wide'].includes(c.arms) ? c.arms : 'auto',
    chest: { size: clamp(c.chest && c.chest.size, 0, 1, 0.45), phys: clamp(c.chest && c.chest.phys, 0, 1, 0.6) },
    phys: clamp(c.phys, 0, 1, 1), parts: []
  };
  const single = new Set(); const clothes = new Set();
  for (const p of Array.isArray(c.parts) ? c.parts : []) {
    if (out.parts.length >= 12) break;
    if (!p || !KINDS.includes(p.k) || !ID.test(p.id || '') || !partDef(p.k, p.id)) continue;
    if (p.k === 'clothes' ? clothes.has(p.id) : single.has(p.k)) continue;
    (p.k === 'clothes' ? clothes : single).add(p.k === 'clothes' ? p.id : p.k);
    const d = partDef(p.k, p.id).def;
    const cc = p.c || {};
    out.parts.push({ k: p.k, id: p.id, c: { b: col(cc.b, d.b), p: PATTERNS.includes(cc.p) ? cc.p : d.p, pc: col(cc.pc, d.pc) }, phys: clamp(p.phys, 0, 1, 0.6) });
  }
  return out;
}

export function getPart(c, kind, id) { return (c.parts || []).find((p) => p.k === kind && (id === undefined || p.id === id)) || null; }

/** Надеть/снять часть (для ушей/хвоста/причёски — заменяет прежнюю). */
export function setPart(c, kind, id) {
  let parts = (c.parts || []).filter((p) => (kind === 'clothes' ? !(p.k === kind && p.id === id) : p.k !== kind));
  const had = (c.parts || []).find((p) => p.k === kind && p.id === id);
  if (id && (kind !== 'clothes' || !had)) {
    const def = partDef(kind, id);
    const prev = kind !== 'clothes' ? (c.parts || []).find((p) => p.k === kind) : null;
    parts = [...parts, { k: kind, id, c: { ...def.def }, phys: prev ? prev.phys : 0.6 }];
  }
  return { ...c, parts };
}
export function updatePart(c, kind, id, patch) {
  return { ...c, parts: c.parts.map((p) => (p.k === kind && p.id === id ? { ...p, ...patch, c: { ...p.c, ...(patch.c || {}) } } : p)) };
}

// ---------------------------------------------------------------- шаблоны и случайный персонаж
const P = (k, id, b, p, pc, phys = 0.6) => ({ k, id, c: { b, p, pc }, phys });
export const TEMPLATES = [
  { id: 'kitty', name: 'Кошечка', c: { gender: 'female', body: 'slim', arms: 'slim', chest: { size: 0.45, phys: 0.6 }, parts: [P('ears', 'cat', '#2e2a2c', 'none', '#f2e3d5'), P('tail', 'cat', '#2e2a2c', 'tip', '#f2e3d5'), P('hair', 'long', '#2e2a2c', 'none', '#c9504a'), P('clothes', 'bow', '#e0607a', 'none', '#ffffff')] } },
  { id: 'fox', name: 'Лис', c: { gender: 'male', body: 'normal', parts: [P('ears', 'fox', '#d5762a', 'tip', '#2a2020'), P('tail', 'fox', '#d5762a', 'tip', '#f4efe8'), P('hair', 'short', '#b35a20', 'none', '#c9504a'), P('clothes', 'scarf', '#2f5a3a', 'stripes', '#e9d9b0')] } },
  { id: 'elf', name: 'Эльфийка', c: { gender: 'female', body: 'tall', arms: 'slim', chest: { size: 0.35, phys: 0.5 }, parts: [P('ears', 'elf', '#e0b089', 'none', '#c48f6a'), P('hair', 'long', '#e8d27a', 'none', '#c9504a'), P('clothes', 'wreath', '#4f8a3a', 'dots', '#f08cb0'), P('clothes', 'cloak', '#2f5a3a', 'none', '#e9bc61')] } },
  { id: 'dragon', name: 'Дракон', c: { gender: 'male', body: 'strong', parts: [P('ears', 'dragon', '#3a3230', 'tip', '#c9b46a'), P('tail', 'dragon', '#3d7a3a', 'belly', '#c9b46a'), P('clothes', 'belt', '#6b4a30', 'none', '#a07850')] } },
  { id: 'bunny', name: 'Зайка', c: { gender: 'female', body: 'short', arms: 'slim', chest: { size: 0.3, phys: 0.5 }, parts: [P('ears', 'bunny', '#f1ece6', 'none', '#c9a9a0'), P('tail', 'bunny', '#f1ece6', 'none', '#c9a9a0'), P('hair', 'pigtails', '#e8b07a', 'none', '#e0607a')] } },
  { id: 'wanderer', name: 'Странник', c: { gender: 'male', body: 'normal', parts: [P('clothes', 'hood', '#4a4a3a', 'none', '#c9b46a'), P('clothes', 'cloak', '#3a3a2c', 'none', '#8a7a50'), P('clothes', 'belt', '#6b4a30', 'none', '#a07850')] } },
  { id: 'wolf', name: 'Волк', c: { gender: 'male', body: 'strong', parts: [P('ears', 'wolf', '#7c7a78', 'tip', '#3a3836'), P('tail', 'wolf', '#7c7a78', 'tip', '#3a3836'), P('hair', 'spiky', '#5a5856', 'none', '#c9504a'), P('clothes', 'bandana', '#2c3a6a', 'none', '#f4efe8')] } },
  { id: 'baker', name: 'Пекарь', c: { gender: 'female', body: 'normal', chest: { size: 0.5, phys: 0.6 }, parts: [P('hair', 'bun', '#7a4a2a', 'none', '#e0607a'), P('clothes', 'apron', '#f0ead8', 'none', '#c9504a'), P('clothes', 'bandana', '#c9504a', 'dots', '#f4efe8')] } },
  { id: 'imp', name: 'Чертёнок', c: { gender: 'male', body: 'short', parts: [P('ears', 'horns', '#2b2326', 'tip', '#b0222c'), P('tail', 'devil', '#3a1418', 'tip', '#b0222c'), P('hair', 'mohawk', '#b0222c', 'tip', '#ffcf5a')] } }
];
export function fromTemplate(t) { return cleanCharacter({ ...DEFAULT_CHARACTER, ...t.c }); }

const PAL = {
  fur: ['#2e2a2c', '#3b3434', '#7c7a78', '#d5762a', '#f1ece6', '#6b4a30', '#e8d27a', '#9a6a40', '#c9c4bc', '#4a3a30'],
  hair: ['#2e2a2c', '#5a3a22', '#7a4a2a', '#b35a20', '#e8d27a', '#e8b07a', '#c9c4bc', '#b0222c', '#3a5aa0', '#e07aa0', '#5a5856'],
  cloth: ['#b0303a', '#2c3a6a', '#2f5a3a', '#4a4a3a', '#e8e0d0', '#6b4a30', '#e0607a', '#7a3a8a', '#d0a030', '#1e1e22'],
  accent: ['#f4efe8', '#2a2020', '#e9bc61', '#c9504a', '#f08cb0', '#8fd0ff', '#55aa55', '#ffcf5a']
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function randomCharacter() {
  const female = Math.random() < 0.5;
  let c = { ...DEFAULT_CHARACTER, gender: female ? 'female' : 'male', body: pick(BODIES), height: 1, arms: female && Math.random() < 0.7 ? 'slim' : 'auto', chest: { size: Math.round((0.2 + Math.random() * 0.6) * 100) / 100, phys: 0.6 }, parts: [] };
  const furC = pick(PAL.fur);
  const one = (kind, chance, pal) => {
    if (Math.random() > chance) return;
    const ids = Object.keys(CATALOG.parts[kind]);
    const id = pick(ids);
    c = setPart(c, kind, id);
    const def = partDef(kind, id).def;
    c = updatePart(c, kind, id, { c: { b: pal === 'fur' ? furC : pick(PAL[pal]), p: Math.random() < 0.6 ? def.p : pick(PATTERNS), pc: pick(PAL.accent) } });
  };
  one('ears', 0.6, 'fur');
  one('tail', 0.5, 'fur');
  one('hair', 0.85, 'hair');
  const n = Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) one('clothes', 1, 'cloth');
  return cleanCharacter(c);
}

// ---------------------------------------------------------------- текстура (как CharPaint.java)
export function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h & 0x7fffffff;
}
export function patternW(p, x, y) {
  switch (p) {
    case 'stripes': return (y >> 1) & 1;
    case 'vstripes': return (x >> 1) & 1;
    case 'checker': return ((x >> 1) + (y >> 1)) & 1;
    case 'dots': return x % 4 === 1 && y % 4 === 1 ? 1 : 0;
    case 'spots': return hash(x >> 1, y >> 1) % 5 === 0 ? 1 : 0;
    case 'zigzag': return (y + Math.abs((x % 6) - 3)) % 6 < 2 ? 1 : 0;
    default: return 0;
  }
}
function styleK(s, x, y) {
  switch (s) {
    case 'fur': return 1 + ((hash(x, y) % 9) - 4) * 0.018;
    case 'hair': return 1 + ((hash(x, 7) % 7) - 3) * 0.03 + ((hash(x, y) % 3) - 1) * 0.015;
    case 'cloth': return 1 + (((x + y) & 1) === 0 ? 0.025 : -0.025);
    case 'leather': return 1 + ((hash(x, y) % 5) - 2) * 0.012;
    case 'scale': return 1 + ((x + (y >> 1) * 2) % 4 === 0 ? -0.08 : (y & 1) === 0 ? 0.03 : 0);
    case 'leaf': return 1 + ((hash(x, y) % 7) - 3) * 0.04;
    case 'smooth': return 1 + ((hash(x, y) % 3) - 1) * 0.01;
    default: return 1;
  }
}
const rgb = (h) => parseInt(h.slice(1), 16);
const mixC = (a, b, t) => {
  const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | bl;
};
const shadeC = (c, k) => {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function slotC(slot, c) {
  const b = rgb(c.b);
  switch (slot) {
    case 'pc': return rgb(c.pc);
    case 'inner': return mixC(b, 0xf0a8b0, 0.55);
    case 'light': return mixC(b, 0xffffff, 0.45);
    case 'dark': return shadeC(b, 0.6);
    case 'white': return 0xf4f1ec;
    case 'black': return 0x1c1a1c;
    case 'gold': return 0xe9bc61;
    default: return b;
  }
}
const FACE = { top: 0, bottom: 1, right: 2, front: 3, left: 4, back: 5 };
function pixelC(c, style, slot, tip, face, px, py, fx, fy, fw, fh) {
  let v;
  if (slot && slot !== 'base') v = slotC(slot, c);
  else if (c.p === 'tip' && tip) v = rgb(c.pc);
  else if (c.p === 'belly' && face === FACE.bottom) v = rgb(c.pc);
  else v = mixC(rgb(c.b), rgb(c.pc), patternW(c.p, px, py));
  let k = styleK(style, px, py);
  if (style !== 'skin' && fw >= 3 && fh >= 3 && (fx === 0 || fy === 0 || fx === fw - 1 || fy === fh - 1)) k *= 0.93;
  return shadeC(v, k);
}

/** Маленькая картинка узора (для кнопок выбора), dataURL. */
const swatchCache = new Map();
export function patternSwatch(c, style = 'smooth', size = 8, scale = 3) {
  const key = [c.b, c.p, c.pc, style, size, scale].join('|');
  if (swatchCache.has(key)) return swatchCache.get(key);
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * scale;
  const g = cv.getContext('2d');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tip = c.p === 'tip' && y < 2;
    const v = pixelC(c, style, 'base', tip, y >= size - 2 ? FACE.bottom : FACE.front, x + 64, y + 64, x, y, size, size);
    g.fillStyle = '#' + v.toString(16).padStart(6, '0');
    g.fillRect(x * scale, y * scale, scale, scale);
  }
  const url = cv.toDataURL();
  if (swatchCache.size > 400) swatchCache.clear();
  swatchCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------- кости + атлас
const ATLAS_W = 128, ATLAS_MAX_H = 256;

/**
 * Кости персонажа в формате оснастки (§2.2) + атлас. Кубы: uv — texOffs в атласе (развёртка Minecraft) или, при
 * tex: 'skin', в скине игрока; color — запасной сплошной цвет; grow — раздувание по осям.
 */
export function buildCharacter(character) {
  const c = cleanCharacter(character);
  const bones = [];
  const names = new Set();
  const paints = [];
  let sx = 0, sy = 0, sh = 0, usedH = 0;
  c.parts.forEach((part) => {
    const def = partDef(part.k, part.id);
    if (!def) return;
    for (const b of def.bones) {
      if (names.has(b.name)) continue;
      names.add(b.name);
      const cubes = [];
      for (const cu of b.cubes) {
        const g = Array.isArray(cu.grow) ? cu.grow : [cu.grow || 0, cu.grow || 0, cu.grow || 0];
        const color = '#' + slotC(cu.slot || 'base', part.c).toString(16).padStart(6, '0');
        if (cu.tex === 'skin') { cubes.push({ from: cu.from, size: cu.size, uv: cu.uv || [0, 8], tex: 'skin', grow: g, mirror: !!cu.mirror, color: '#e0b089' }); continue; }
        const w = Math.round(cu.size[0]), h = Math.round(cu.size[1]), d = Math.round(cu.size[2]);
        const rw = Math.max(1, 2 * d + 2 * w), rh = Math.max(1, d + h);
        if (rw > ATLAS_W) continue;
        if (sx + rw > ATLAS_W) { sx = 0; sy += sh; sh = 0; }
        if (sy + rh > ATLAS_MAX_H) continue;
        const u = sx, v = sy;
        sx += rw; sh = Math.max(sh, rh); usedH = Math.max(usedH, v + rh);
        paints.push({ u, v, w, h, d, cube: cu, col: part.c, style: def.style });
        cubes.push({ from: cu.from, size: cu.size, uv: [u, v], grow: g, color });
      }
      const bone = { name: b.name, parent: b.parent, pivot: b.pivot, rot: b.rot, cubes, kind: part.k, hideWith: def.hideWith || null };
      if (b.spring) bone.spring = { ...b.spring, strength: c.phys * part.phys };
      bones.push(bone);
    }
  });
  if (c.gender === 'female' && c.chest.size > 0.01) {
    const s = c.chest.size;
    const dep = 0.6 + 2.6 * s, gz = (dep + 0.3) / 2, zc = (-dep + 1.2) / 2, gy = 0.1 * s;
    [['chest_r', -2, 19, 4], ['chest_l', 2, 23, -4]].forEach(([name, px, u, ry]) => {
      bones.push({
        name, parent: 'body', pivot: [px, 1, -2], rot: [-(4 + 12 * s), ry, 0], kind: 'chest',
        cubes: [
          { from: [-2, 0, zc - 0.5], size: [4, 4, 1], uv: [u, 20], tex: 'skin', grow: [0.02, gy, gz], color: '#d8a888' },
          { from: [-2, 0, zc - 0.5], size: [4, 4, 1], uv: [u, 36], tex: 'skin', grow: [0.27, gy + 0.25, gz + 0.25], layer: 'jacket' }
        ],
        spring: { ...CATALOG.chest.spring, strength: c.chest.phys }
      });
    });
  }
  let texH = 16;
  while (texH < usedH) texH *= 2;
  return { character: c, bones, atlas: { w: ATLAS_W, h: texH, paints } };
}

/** Холст атласа (128 × N) для этого персонажа. */
export function characterTexture(character, built) {
  const b = built || buildCharacter(character);
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = b.atlas.w; cv.height = b.atlas.h;
  const g = cv.getContext('2d');
  const img = g.createImageData(cv.width, cv.height);
  const put = (x, y, v) => {
    if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
    const i = (y * cv.width + x) * 4;
    img.data[i] = (v >> 16) & 255; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255; img.data[i + 3] = 255;
  };
  for (const p of b.atlas.paints) {
    const { u, v, w, h, d, cube, col: cc, style } = p;
    const ox = Math.floor(cube.from[0]) + 64, oy = Math.floor(cube.from[1]) + 64, oz = Math.floor(cube.from[2]) + 64;
    const face = (x0, y0, fw, fh, f, ax, ay) => {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) put(x0 + x, y0 + y, pixelC(cc, style, cube.slot, !!cube.tip, f, ax + x, ay + y, x, y, fw, fh));
    };
    face(u + d, v, w, d, FACE.top, ox, oz);
    face(u + d + w, v, w, d, FACE.bottom, ox, oz);
    face(u, v + d, d, h, FACE.right, oz, oy);
    face(u + d, v + d, w, h, FACE.front, ox, oy);
    face(u + d + w, v + d, d, h, FACE.left, oz, oy);
    face(u + 2 * d + w, v + d, w, h, FACE.back, ox, oy);
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Для превью «Анимаций» в Студии (kokk_rig.md §4.4). */
export function characterBones(character) { return buildCharacter(character).bones; }

// ---------------------------------------------------------------- телосложение
export function bodyScales(character) {
  const c = cleanCharacter(character);
  const b = CATALOG.bodies[c.body] || {};
  const f = c.gender === 'female' ? CATALOG.female : {};
  const m = (a, x) => (a || x ? [0, 1, 2].map((i) => Math.max(0.8, Math.min(1.25, (a ? a[i] : 1) * (x ? x[i] : 1)))) : null);
  const root = Math.max(0.85, Math.min(1.12, (b.root || 1) * c.height));
  return { root, head: m(b.head, null), body: m(b.body, f.body), arms: m(b.arms, f.arms), legs: m(b.legs, f.legs) };
}

// ---------------------------------------------------------------- пружины (как CharSpring/CharPhysics в моде)
function dirOf(bone) {
  const cu = bone.cubes[0];
  if (!cu) return [0, 1, 0];
  let x = cu.from[0] + cu.size[0] / 2, y = cu.from[1] + cu.size[1] / 2, z = cu.from[2] + cu.size[2] / 2;
  const [sx, sy, sz] = cu.size;
  if (sx >= sy && sx >= sz) x += Math.sign(x) * sx; else if (sy >= sz) y += Math.sign(y || 1) * sy; else z += Math.sign(z || 1) * sz;
  // поворот ZYX (как JOML rotationZYX): сначала X, потом Y, потом Z
  const r = bone.rot.map((a) => (a * Math.PI) / 180);
  let [a, b2, c2] = [x, y, z];
  [b2, c2] = [b2 * Math.cos(r[0]) - c2 * Math.sin(r[0]), b2 * Math.sin(r[0]) + c2 * Math.cos(r[0])];
  [a, c2] = [a * Math.cos(r[1]) + c2 * Math.sin(r[1]), -a * Math.sin(r[1]) + c2 * Math.cos(r[1])];
  [a, b2] = [a * Math.cos(r[2]) - b2 * Math.sin(r[2]), a * Math.sin(r[2]) + b2 * Math.cos(r[2])];
  const l = Math.hypot(a, b2, c2) || 1;
  return [a / l, b2 / l, c2 / l];
}
export function springStep(st, p, driveX, driveS) {
  st.px = st.x; st.ps = st.s;
  const k = 0.05 + 0.6 * p.stiffness, d = 0.05 + 0.5 * p.damping;
  st.vx += -k * st.x - d * st.vx + driveX;
  st.vs += -k * st.s - d * st.vs + driveS;
  st.x += st.vx; st.s += st.vs;
  const lim = p.limit;
  if (st.x > lim) { st.x = lim; st.vx = Math.min(0, st.vx); }
  if (st.x < -lim) { st.x = -lim; st.vx = Math.max(0, st.vx); }
  if (st.s > lim) { st.s = lim; st.vs = Math.min(0, st.vs); }
  if (st.s < -lim) { st.s = -lim; st.vs = Math.max(0, st.vs); }
  if (!Number.isFinite(st.x) || !Number.isFinite(st.s)) Object.assign(st, { x: 0, s: 0, vx: 0, vs: 0, px: 0, ps: 0 });
}
/** Один тик физики для набора костей; mo — движение (как CharPhysics.Motion). */
export function physicsTick(bones, states, mo, viewer = 1) {
  for (const b of bones) {
    const sp = b.spring;
    if (!sp) continue;
    const st = states[b.name] || (states[b.name] = { x: 0, s: 0, vx: 0, vs: 0, px: 0, ps: 0, dir: dirOf(b) });
    const strength = (sp.strength ?? 1) * viewer;
    if (strength <= 0.001) { springStep(st, sp, 0, 0); continue; }
    const [bx, by, bz] = st.dir;
    const k = 0.05 + 0.6 * sp.stiffness;
    const big = (1 - sp.stiffness) * 120 * strength;
    const head = rootGroup(bones, b) === 'head';
    const dx = -mo.al + (head ? mo.headYawRate : mo.yawRate) * 0.004;
    let dy = mo.ay;
    const dz = mo.af;
    if (mo.walkSpeed > 0.01) dy += Math.sin(mo.walkPos * 0.6662 * 2) * mo.walkSpeed * (b.kind === 'chest' ? 0.06 : 0.025);
    const tx = dy * -bz + dz * by;
    const hang = Math.abs(by) >= Math.abs(bz);
    const ts = hang ? dx * -by + dy * bx : dx * bz - dz * bx;
    let driveX = tx * big, driveS = ts * big;
    const g = Math.min(1, strength);
    driveX += k * (-(sp.gravity || 0) * (head ? mo.headPitch : mo.bodyTilt) * Math.abs(by)) * g;
    if (sp.wind) driveX += k * sp.wind * Math.min(70, Math.max(0, mo.forward * 150)) * Math.sign(by) * g;
    const ps = states[b.parent];
    if (ps) { driveX += (sp.inherit ?? 1) * ps.x * k * 0.5; driveS += (sp.inherit ?? 1) * ps.s * k * 0.5; }
    springStep(st, sp, Math.max(-20, Math.min(20, driveX)), Math.max(-20, Math.min(20, driveS)));
  }
}
function rootGroup(bones, b) {
  let cur = b; let guard = 0;
  while (cur && guard++ < 20) {
    if (['head', 'body', 'right_arm', 'left_arm', 'right_leg', 'left_leg'].includes(cur.parent)) return cur.parent;
    const p = cur.parent; cur = bones.find((x) => x.name === p);
  }
  return 'body';
}

// ---------------------------------------------------------------- three.js: части на модели skinview3d
// В skinview3d модель смотрит на +Z, Y вверх; модель Minecraft — на −Z, Y вниз. Части строятся прямо в координатах
// Minecraft внутри группы со scale(1, −1, −1) (поворот на 180° вокруг X, без зеркала), прикреплённой к кости skinview3d.
const SV_PARTS = { head: 'head', body: 'body', right_arm: 'rightArm', left_arm: 'leftArm', right_leg: 'rightLeg', left_leg: 'leftLeg' };
const MC_PIVOT = { head: [0, 0, 0], body: [0, 0, 0], right_arm: [-5, 2, 0], left_arm: [5, 2, 0], right_leg: [-1.9, 12, 0], left_leg: [1.9, 12, 0] };

function boxUV(geo, cube, texW, texH) {
  const [w, h, d] = cube.size.map((v) => Math.round(v));
  const [u0, v0] = cube.uv;
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const rx = (bb.max.x - bb.min.x) || 1, ry = (bb.max.y - bb.min.y) || 1, rz = (bb.max.z - bb.min.z) || 1;
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - bb.min.x) / rx, y = (pos.getY(i) - bb.min.y) / ry, z = (pos.getZ(i) - bb.min.z) / rz;
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    let u, v;
    let mx = cube.mirror ? 1 - x : x;
    if (ny < -0.5) { u = u0 + d + w * mx; v = v0 + d * (1 - z); } // верх
    else if (ny > 0.5) { u = u0 + d + w + w * mx; v = v0 + d * (1 - z); } // низ
    else if (nz < -0.5) { u = u0 + d + w * mx; v = v0 + d + h * y; } // перед
    else if (nz > 0.5) { u = u0 + 2 * d + w + w * (1 - mx); v = v0 + d + h * y; } // спина
    else if ((nx < -0.5) !== !!cube.mirror) { u = u0 + d * (1 - z); v = v0 + d + h * y; } // правый бок (−X)
    else { u = u0 + d + w + d * z; v = v0 + d + h * y; } // левый бок (+X)
    uv.setXY(i, u / texW, 1 - v / texH);
  }
  uv.needsUpdate = true;
}

function loadSkinCanvas(src) {
  return new Promise((res) => {
    if (!src || typeof Image === 'undefined') return res(null);
    if (typeof src !== 'string') return res(src);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      cv.getContext('2d').drawImage(img, 0, 0, 64, img.height === img.width / 2 ? 32 : 64);
      res(cv);
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

/**
 * Прикрепить части персонажа к skinview3d. Возвращает { update(), kick(), setWalking(b), dispose() }.
 * opts: { skin (dataURL/canvas), slim, physics (true/false), walking }
 */
export function attachCharacter(THREE, viewer, character, opts = {}) {
  const built = buildCharacter(character);
  const sk = viewer && viewer.playerObject && viewer.playerObject.skin;
  if (!sk || !THREE || !THREE.Group) return { update() {}, kick() {}, setWalking() {}, dispose() {} };
  const disposables = [];
  const holders = {};
  const groupsByName = {};
  const atlasCanvas = characterTexture(character, built);
  const mkTex = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    disposables.push(t);
    return t;
  };
  const atlasMat = atlasCanvas ? new THREE.MeshStandardMaterial({ map: mkTex(atlasCanvas), side: THREE.DoubleSide, alphaTest: 0.01 }) : null;
  const skinMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, alphaTest: 0.01, transparent: true });
  if (atlasMat) disposables.push(atlasMat);
  disposables.push(skinMat);
  loadSkinCanvas(opts.skin).then((cv) => { if (cv) { skinMat.map = mkTex(cv); skinMat.needsUpdate = true; } });

  for (const g of Object.keys(SV_PARTS)) {
    const part = sk[SV_PARTS[g]];
    if (!part) continue;
    const h = new THREE.Group();
    const pv = MC_PIVOT[g];
    // позиция опорной точки Minecraft в координатах кости skinview3d
    h.position.set(pv[0] - part.position.x, -pv[1] - part.position.y, -pv[2] - part.position.z);
    h.scale.set(1, -1, -1);
    part.add(h);
    holders[g] = h;
  }
  for (const b of built.bones) {
    const grp = new THREE.Group();
    grp.position.set(b.pivot[0], b.pivot[1], b.pivot[2]);
    grp.rotation.set((b.rot[0] * Math.PI) / 180, (b.rot[1] * Math.PI) / 180, (b.rot[2] * Math.PI) / 180, 'ZYX');
    grp.userData.rest = [grp.rotation.x, grp.rotation.y, grp.rotation.z];
    grp.userData.restPos = [b.pivot[0], b.pivot[1], b.pivot[2]];
    for (const cu of b.cubes) {
      const gr = cu.grow || [0, 0, 0];
      const geo = new THREE.BoxGeometry(cu.size[0] + 2 * gr[0] || 0.001, cu.size[1] + 2 * gr[1] || 0.001, cu.size[2] + 2 * gr[2] || 0.001);
      const isSkin = cu.tex === 'skin';
      boxUV(geo, cu, isSkin ? 64 : built.atlas.w, isSkin ? 64 : built.atlas.h);
      const mesh = new THREE.Mesh(geo, isSkin ? skinMat : atlasMat || new THREE.MeshStandardMaterial({ color: cu.color }));
      mesh.position.set(cu.from[0] + cu.size[0] / 2, cu.from[1] + cu.size[1] / 2, cu.from[2] + cu.size[2] / 2);
      if (cu.layer === 'jacket') mesh.renderOrder = 1;
      grp.add(mesh);
      disposables.push(geo);
    }
    groupsByName[b.name] = grp;
    const parent = holders[b.parent] || groupsByName[b.parent];
    if (parent) parent.add(grp);
  }

  // телосложение: масштабы костей skinview3d и сдвиг плеч; рост — масштаб всей фигуры
  const sc = bodyScales(character);
  const saved = [];
  const setScale = (obj, v) => { if (!obj || !v) return; saved.push([obj, obj.scale.clone(), obj.position.clone()]); obj.scale.set(v[0], v[1], v[2]); };
  setScale(sk.head, sc.head); setScale(sk.body, sc.body); setScale(sk.rightArm, sc.arms); setScale(sk.leftArm, sc.arms);
  setScale(sk.rightLeg, sc.legs); setScale(sk.leftLeg, sc.legs);
  const dx = 4 * (sc.body ? sc.body[0] : 1) + (sc.arms ? sc.arms[0] : 1) - 5;
  if (sk.rightArm && sk.leftArm && dx) {
    if (!saved.find((s) => s[0] === sk.rightArm)) saved.push([sk.rightArm, sk.rightArm.scale.clone(), sk.rightArm.position.clone()]);
    if (!saved.find((s) => s[0] === sk.leftArm)) saved.push([sk.leftArm, sk.leftArm.scale.clone(), sk.leftArm.position.clone()]);
    sk.rightArm.position.x -= dx; sk.leftArm.position.x += dx;
  }
  const po = viewer.playerObject;
  const rootSaved = po.scale.clone();
  if (sc.root !== 1) po.scale.set(sc.root, sc.root, sc.root);

  // физика превью: 20 тиков в секунду, лёгкое покачивание, шаг при ходьбе, «встряхнуть» — прыжок
  const states = {};
  let walking = !!opts.walking;
  let kickT = -1;
  let age = 0;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  const physOn = opts.physics !== false;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= 0.05) {
      acc -= 0.05;
      age++;
      const kick = kickT >= 0 && age - kickT < 12 ? [0.28, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, 0, 0, 0, 0, -0.04][age - kickT] : 0;
      const sway = Math.cos(age * 0.07) * 0.012;
      if (physOn) physicsTick(built.bones, states, { af: sway * 0.5, al: sway, ay: Math.sin(age * 0.11) * 0.006 + kick, forward: walking ? 0.13 : 0, yawRate: Math.sin(age * 0.031) * 0.6, headYawRate: Math.sin(age * 0.043) * 0.8, headPitch: 0, bodyTilt: 0, walkPos: age * 0.55, walkSpeed: walking ? 0.9 : 0.12 });
    }
    const pt = acc / 0.05;
    for (const b of built.bones) {
      const grp = groupsByName[b.name];
      if (!grp) continue;
      const st = states[b.name];
      const [rx, ry, rz] = grp.userData.rest;
      grp.rotation.set(rx, ry, rz, 'ZYX');
      if (st) {
        const x = st.px + (st.x - st.px) * pt, s = st.ps + (st.s - st.ps) * pt;
        grp.rotation.x += (x * Math.PI) / 180;
        if (Math.abs(st.dir[1]) >= Math.abs(st.dir[2])) grp.rotation.z += (s * Math.PI) / 180; else grp.rotation.y += (s * Math.PI) / 180;
      }
    }
  };
  if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop);

  return {
    built,
    kick() { kickT = age; },
    setWalking(w) { walking = !!w; },
    update() {},
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      for (const h of Object.values(holders)) if (h.parent) h.parent.remove(h);
      for (const [obj, s, p] of saved) { obj.scale.copy(s); obj.position.copy(p); }
      po.scale.copy(rootSaved);
      for (const d of disposables) { try { d.dispose(); } catch (_) {} }
    }
  };
}
