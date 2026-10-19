// «Студия Кокка»: клонеры и эффекторы (как MoGraph в Cinema 4D), только для мира из блоков.
// Чистые функции без зависимостей (попадает и в главный процесс через scripts/sync-studio.cjs).
//
// Клонер раскладывает копии (линия / сетка / круг / по пути / случайно), эффекторы двигают, крутят, масштабируют
// и прячут копии по номеру. На выходе — список «размещений» для игры:
//   { pos:[x,y,z], rot:0, block:'minecraft:oak_log[axis=x]' }       — блок (поворот уже применён к состоянию, поэтому rot 0)
//   { pos, rot:0|90|180|270, template:'id' }                          — шаблон постройки, поворот в градусах
//   { pos, yaw, scale, actor:{ kind, type, who, ref, name } }        — актёр/сущность
//   { pos, light: 0..15 }                                             — блок света
// Повороты блоков — только по 90° вокруг Y.

export const CLONER_MODES = ['linear', 'grid', 'radial', 'spline', 'random'];
export const CLONER_MODE_LABEL = { linear: 'Линия', grid: 'Сетка', radial: 'По кругу', spline: 'По пути', random: 'Случайно' };
export const EFFECTOR_KINDS = ['random', 'step', 'plain', 'noise', 'mask'];
export const EFFECTOR_LABEL = { random: 'Случайность', step: 'Шаг', plain: 'Сдвиг', noise: 'Шум (рельеф)', mask: 'Маска' };
export const MAX_CLONES = 200000; // сколько копий вообще считаем (в игру уходит не больше 20000)
export const MAX_SEND = 20000;

const isNum = (v) => typeof v === 'number' && isFinite(v);
const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);
const num = (v, d) => (isNum(v) ? v : d);
const v3 = (p, d) => (isP3(p) ? p : d);
const rint = (v) => Math.round(v) + 0; // + 0 убирает «-0»
const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));

// детерминированный «случайный» [0,1) по семени и номерам
export function hash01(seed, a, b) {
  let h = (Math.imul(num(seed, 1) | 0, 0x9e3779b1) ^ Math.imul((a | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rnd11 = (seed, i, k) => hash01(seed, i, k) * 2 - 1;

// гладкий шум по x,z (значения −1..1)
export function noise2(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => hash01(seed, a, b) * 2 - 1;
  const top = g(xi, zi) + (g(xi + 1, zi) - g(xi, zi)) * s(fx);
  const bot = g(xi, zi + 1) + (g(xi + 1, zi + 1) - g(xi, zi + 1)) * s(fx);
  return top + (bot - top) * s(fz);
}

// --- путь: ломаная (по желанию сглаженная Катмуллом — Ромом), равномерная разбивка ---
export function smoothPath(pts, per) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
export function samplePath(pts, opts) {
  const o = opts || {};
  const line = o.smooth === false ? pts.map((p) => p.slice()) : smoothPath(pts, 10);
  if (line.length < 2) return line.map((p) => ({ p, dir: [1, 0, 0] }));
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]));
  const L = cum[cum.length - 1];
  const at = (d) => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < d) i++;
    const a = line[i - 1], b = line[i];
    const seg = cum[i] - cum[i - 1];
    const u = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i - 1]) / seg)) : 0;
    return { p: [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u), dir: [b[0] - a[0], b[1] - a[1], b[2] - a[2]] };
  };
  const ds = [];
  if (num(o.stepLen, 0) > 0) { for (let d = 0; d <= L + 1e-6 && ds.length < MAX_CLONES; d += o.stepLen) ds.push(d); } else {
    const n = clampInt(o.count, 1, MAX_CLONES, 8);
    for (let i = 0; i < n; i++) ds.push(n === 1 ? 0 : (L * i) / (n - 1));
  }
  return ds.map(at);
}

// --- раскладка клонера: [{ i, p:[x,y,z], rot (градусы), scale, src, hidden }] ---
export function clonerLayout(c, ctx) {
  const props = c || {};
  const origin = v3(props.origin || props.pos, [0, 0, 0]);
  const out = [];
  const push = (p, rot) => out.push({ i: out.length, p: [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]], rot: rot || 0, scale: 1, hidden: false });
  switch (props.mode || 'linear') {
    case 'linear': {
      const n = clampInt(props.count, 0, MAX_CLONES, 8);
      const st = v3(props.step, [1, 0, 0]);
      for (let i = 0; i < n; i++) push([st[0] * i, st[1] * i, st[2] * i]);
      break;
    }
    case 'grid': {
      const cn = v3(props.counts, [3, 1, 3]).map((v) => clampInt(v, 1, 1000, 1));
      const sp = v3(props.spacing, [2, 2, 2]);
      if (cn[0] * cn[1] * cn[2] > MAX_CLONES) throw new Error('слишком много копий в сетке (' + cn[0] * cn[1] * cn[2] + ')');
      for (let y = 0; y < cn[1]; y++) for (let z = 0; z < cn[2]; z++) for (let x = 0; x < cn[0]; x++) push([x * sp[0], y * sp[1], z * sp[2]]);
      break;
    }
    case 'radial': {
      const n = clampInt(props.count, 0, MAX_CLONES, 8);
      const r = num(props.radius, 8);
      const a0 = num(props.a0, 0), a1 = num(props.a1, 360);
      const full = Math.abs(a1 - a0) >= 359.999;
      for (let i = 0; i < n; i++) {
        const deg = a0 + (a1 - a0) * (n === 1 ? 0 : i / (full ? n : n - 1));
        const a = (deg * Math.PI) / 180;
        const u = Math.cos(a) * r, w = Math.sin(a) * r;
        const p = props.plane === 'xy' ? [u, w, 0] : props.plane === 'zy' ? [0, w, u] : [u, 0, w];
        // «смотреть от центра»: поворот вокруг Y (только для плоскости xz)
        push(p, props.align !== false && (props.plane || 'xz') === 'xz' ? -deg : 0);
      }
      break;
    }
    case 'spline': {
      const pts = ctx && Array.isArray(ctx.path) ? ctx.path.filter(isP3) : [];
      if (pts.length < 2) break;
      for (const s of samplePath(pts, { count: props.count, stepLen: props.stepLen, smooth: ctx.smooth })) {
        const yaw = Math.atan2(s.dir[2], s.dir[0]) * 180 / Math.PI;
        push(s.p, props.align !== false ? -yaw : 0);
      }
      break;
    }
    case 'random': {
      const n = clampInt(props.count, 0, MAX_CLONES, 20);
      const size = v3(props.size, [16, 4, 16]);
      const seed = num(props.seed, 1);
      for (let i = 0; i < n; i++) {
        let p;
        if (props.volume === 'sphere') {
          // равномерно в шаре (отбор)
          let k = 0;
          do { p = [rnd11(seed, i, 3 * k), rnd11(seed, i, 3 * k + 1), rnd11(seed, i, 3 * k + 2)]; k++; } while (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > 1 && k < 12);
          p = p.map((v, j) => (v * size[j]) / 2);
        } else p = [0, 1, 2].map((j) => hash01(seed, i, j) * size[j]);
        push(p);
      }
      break;
    }
    default: throw new Error('неизвестный режим клонера «' + props.mode + '»');
  }
  return out;
}

// --- эффекторы ---
export function applyEffector(clones, e) {
  const s = num(e.strength, 1);
  if (!s && e.kind !== 'mask') return clones;
  const pos = v3(e.pos, [0, 0, 0]);
  const rot = num(e.rot, 0), sc = num(e.scale, 0);
  const n = clones.length;
  const seed = num(e.seed, 1);
  switch (e.kind) {
    case 'plain':
      return clones.map((c) => ({ ...c, p: c.p.map((v, j) => v + pos[j] * s), rot: c.rot + rot * s, scale: c.scale + sc * s }));
    case 'step':
      return clones.map((c, k) => { const f = n > 1 ? k / (n - 1) : 0; return { ...c, p: c.p.map((v, j) => v + pos[j] * f * s), rot: c.rot + rot * f * s, scale: c.scale + sc * f * s }; });
    case 'random':
      return clones.map((c) => ({
        ...c,
        p: c.p.map((v, j) => v + pos[j] * rnd11(seed, c.i, j) * s),
        rot: c.rot + rot * rnd11(seed, c.i, 7) * s,
        scale: c.scale + sc * rnd11(seed, c.i, 8) * s
      }));
    case 'noise': {
      const amp = num(e.amp, 3), f = num(e.freq, 0.1) || 0.1;
      return clones.map((c) => ({ ...c, p: [c.p[0], c.p[1] + amp * s * noise2(c.p[0] * f, c.p[2] * f, seed), c.p[2]] }));
    }
    case 'mask': {
      const every = clampInt(e.every, 1, 100000, 1);
      const chance = Math.max(0, Math.min(1, num(e.chance, 0) * (s || 0)));
      return clones.map((c, k) => {
        let drop = (every > 1 && k % every !== 0) || (chance > 0 && hash01(seed, c.i, 11) < chance);
        if (e.invert) drop = !drop;
        return drop ? { ...c, hidden: true } : c;
      });
    }
    default: return clones;
  }
}

// --- поворот состояния блока на q четвертей по часовой (как Rotation.CLOCKWISE_90 в игре) ---
const FACE = ['north', 'east', 'south', 'west'];
export function rotateBlockState(block, q) {
  q = ((q % 4) + 4) % 4;
  const m = /^([^[]+)(?:\[(.*)\])?$/.exec(block || '');
  if (!m || !q || !m[2]) return block;
  const props = m[2].split(',').map((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'facing' && FACE.includes(v)) return k + '=' + FACE[(FACE.indexOf(v) + q) % 4];
    if (k === 'axis' && (v === 'x' || v === 'z') && q % 2) return k + '=' + (v === 'x' ? 'z' : 'x');
    if (k === 'rotation' && /^\d+$/.test(v)) return k + '=' + ((Number(v) + 4 * q) % 16);
    if (['north', 'east', 'south', 'west'].includes(k)) return FACE[(FACE.indexOf(k) + q) % 4] + '=' + v;
    return kv;
  });
  return m[1] + '[' + props.join(',') + ']';
}
export function quarter(deg) { return ((Math.round(num(deg, 0) / 90) % 4) + 4) % 4; }

// главная: настройки клонера + источники + эффекторы → размещения
// cl: props клонера (+ origin), sources: [{ block } | { template } | { actor } | { light }], effectors: [props эффекторов]
export function clonerPlacements(cl, sources, effectors, ctx) {
  let clones = clonerLayout(cl, ctx || {});
  for (const e of effectors || []) clones = applyEffector(clones, e);
  const src = sources && sources.length ? sources : [{ block: 'minecraft:stone' }];
  const seed = num(cl.seed, 1);
  const out = [];
  const seen = new Map();
  const put = (pl) => {
    const key = pl.pos.join(',');
    if (pl.block !== undefined || pl.light !== undefined) { // блоки в одной клетке — побеждает последний
      if (seen.has(key)) out[seen.get(key)] = pl; else { seen.set(key, out.length); out.push(pl); }
    } else out.push(pl);
  };
  for (const c of clones) {
    if (c.hidden || c.scale <= 0.01) continue;
    const si = cl.iterate === 'random' ? Math.floor(hash01(seed, c.i, 99) * src.length) : c.i % src.length;
    const s = src[si];
    const pos = c.p.map(rint);
    const q = quarter(c.rot);
    const rd = q * 90; // игре — градусы
    if (s.block !== undefined) {
      const k = Math.max(1, Math.min(8, Math.round(c.scale)));
      const b = rotateBlockState(s.block, q);
      if (k === 1) put({ pos, rot: 0, block: b });
      else for (let y = 0; y < k; y++) for (let z = 0; z < k; z++) for (let x = 0; x < k; x++) put({ pos: [pos[0] + x, pos[1] + y, pos[2] + z], rot: 0, block: b });
    } else if (s.template !== undefined) put({ pos, rot: rd, template: s.template });
    else if (s.light !== undefined) put({ pos, light: s.light });
    else if (s.actor) put({ pos: c.p.map((v) => Math.round(v * 100) / 100), yaw: Math.round(c.rot * 10) / 10, scale: Math.round(c.scale * 100) / 100, actor: s.actor });
    if (out.length > MAX_CLONES) break;
  }
  return out;
}

// рамка размещений (для «Показать выбранное» и схемы)
export function placementsBox(pl) {
  if (!pl.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pl) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p.pos[j]); hi[j] = Math.max(hi[j], p.pos[j]); }
  return { lo, hi, center: lo.map((v, j) => (v + hi[j]) / 2), radius: Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2) };
}
