// АВТОГЕНЕРАЦИЯ из src/studio/mograph.js, scene3d.js, validate.js, scheme.js (node scripts/sync-studio.cjs) — не править руками.
'use strict';

// ===== mograph.js =====
const __mograph = (function () {
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

const CLONER_MODES = ['linear', 'grid', 'radial', 'spline', 'random'];
const CLONER_MODE_LABEL = { linear: 'Линия', grid: 'Сетка', radial: 'По кругу', spline: 'По пути', random: 'Случайно' };
const EFFECTOR_KINDS = ['random', 'step', 'plain', 'noise', 'mask'];
const EFFECTOR_LABEL = { random: 'Случайность', step: 'Шаг', plain: 'Сдвиг', noise: 'Шум (рельеф)', mask: 'Маска' };
const MAX_CLONES = 200000; // сколько копий вообще считаем (в игру уходит не больше 20000)
const MAX_SEND = 20000;

const isNum = (v) => typeof v === 'number' && isFinite(v);
const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);
const num = (v, d) => (isNum(v) ? v : d);
const v3 = (p, d) => (isP3(p) ? p : d);
const rint = (v) => Math.round(v) + 0; // + 0 убирает «-0»
const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));

// детерминированный «случайный» [0,1) по семени и номерам
function hash01(seed, a, b) {
  let h = (Math.imul(num(seed, 1) | 0, 0x9e3779b1) ^ Math.imul((a | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rnd11 = (seed, i, k) => hash01(seed, i, k) * 2 - 1;

// гладкий шум по x,z (значения −1..1)
function noise2(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => hash01(seed, a, b) * 2 - 1;
  const top = g(xi, zi) + (g(xi + 1, zi) - g(xi, zi)) * s(fx);
  const bot = g(xi, zi + 1) + (g(xi + 1, zi + 1) - g(xi, zi + 1)) * s(fx);
  return top + (bot - top) * s(fz);
}

// --- путь: ломаная (по желанию сглаженная Катмуллом — Ромом), равномерная разбивка ---
function smoothPath(pts, per) {
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
function samplePath(pts, opts) {
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
function clonerLayout(c, ctx) {
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
function applyEffector(clones, e) {
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
function rotateBlockState(block, q) {
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
function quarter(deg) { return ((Math.round(num(deg, 0) / 90) % 4) + 4) % 4; }

// главная: настройки клонера + источники + эффекторы → размещения
// cl: props клонера (+ origin), sources: [{ block } | { template } | { actor } | { light }], effectors: [props эффекторов]
function clonerPlacements(cl, sources, effectors, ctx) {
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
function placementsBox(pl) {
  if (!pl.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pl) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p.pos[j]); hi[j] = Math.max(hi[j], p.pos[j]); }
  return { lo, hi, center: lo.map((v, j) => (v + hi[j]) / 2), radius: Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2) };
}

return { CLONER_MODES, CLONER_MODE_LABEL, EFFECTOR_KINDS, EFFECTOR_LABEL, MAX_CLONES, MAX_SEND, hash01, noise2, smoothPath, samplePath, clonerLayout, applyEffector, rotateBlockState, quarter, clonerPlacements, placementsBox };
})();
const { CLONER_MODES, CLONER_MODE_LABEL, EFFECTOR_KINDS, EFFECTOR_LABEL, MAX_CLONES, MAX_SEND, hash01, noise2, smoothPath, samplePath, clonerLayout, applyEffector, rotateBlockState, quarter, clonerPlacements, placementsBox } = __mograph;

// ===== scene3d.js =====
const __scene3d = (function () {
// «Студия Кокка», фаза 3: сцена как дерево объектов (как в Cinema 4D) с анимацией по свойствам.
// Чистые функции без зависимостей, кроме mograph.js. Этот файл попадает и в главный процесс
// (electron/studio-validate.cjs собирается scripts/sync-studio.cjs) — сборка и «Проиграть» используют один компилятор.
//
// Сцена (файл studio/scenes/<id>.json) дополнительно хранит:
//   objects: [{ id, type, name, parent, enabled, visible, props:{…}, anim:{ "<канал>": [{ t, v, interp, in?, out? }] } }]
//   stage:   [{ t0, t1, cam }]  — «Монтаж»: какая камера активна с t0 по t1 (как Stage в C4D)
// Игра (фаза 1) понимает только старый формат, поэтому compileScene() делает из объектов дорожку камеры
// (ключи берутся у активной по «Монтажу» камеры) и события света/звука/клонеров. Сгенерированное помечено gen:true.

const OBJ_TYPES = ['camera', 'actor', 'light', 'sound', 'marker', 'path', 'group', 'cloner', 'effector', 'block', 'template', 'structure'];
const OBJ_LABEL = {
  camera: 'Камера', actor: 'Актёр', light: 'Свет', sound: 'Звук', marker: 'Метка', path: 'Путь', group: 'Группа',
  cloner: 'Клонер', effector: 'Эффектор', block: 'Блок', template: 'Шаблон', structure: 'Постройка'
};
const INTERPS = ['bezier', 'linear', 'step'];
const INTERP_LABEL = { bezier: 'Безье (плавно)', linear: 'Линейно', step: 'Ступенька' };

// анимируемые каналы по видам объектов
const CHANNELS = {
  camera: ['pos.x', 'pos.y', 'pos.z', 'rot.h', 'rot.p', 'rot.b', 'fov', 'shake'],
  light: ['pos.x', 'pos.y', 'pos.z', 'on', 'level'],
  sound: ['pos.x', 'pos.y', 'pos.z', 'play', 'vol'],
  marker: ['pos.x', 'pos.y', 'pos.z'],
  path: ['pos.x', 'pos.y', 'pos.z'],
  group: ['pos.x', 'pos.y', 'pos.z'],
  cloner: ['pos.x', 'pos.y', 'pos.z'],
  effector: ['strength'],
  structure: ['pos.x', 'pos.y', 'pos.z'],
  actor: [], block: [], template: []
};
// каналы-«переключатели»: всегда ступенькой
const STEP_CHANNELS = ['on', 'level', 'play', 'look'];
const CHANNEL_LABEL = {
  'pos.x': 'Позиция X', 'pos.y': 'Позиция Y', 'pos.z': 'Позиция Z', 'rot.h': 'Поворот H (yaw)', 'rot.p': 'Наклон P (pitch)', 'rot.b': 'Крен B (roll)',
  fov: 'Угол обзора', shake: 'Дрожание', on: 'Включён', level: 'Яркость', play: 'Играть', vol: 'Громкость', strength: 'Сила', look: 'Смотреть на'
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);
const clone = (o) => JSON.parse(JSON.stringify(o));

function defaultProps(type) {
  switch (type) {
    case 'camera': return { pos: [0, 70, 0], rot: [0, 0, 0], fov: 70, shake: 0, look: null };
    case 'actor': return {};
    case 'light': return { pos: [0, 65, 0], positions: [], level: 15, on: true };
    case 'sound': return { pos: null, id: 'minecraft:block.bell.use', vol: 1, pitch: 1, play: 0 };
    case 'marker': return { pos: [0, 64, 0], label: '' };
    case 'path': return { pos: [0, 0, 0], points: [[0, 64, 0], [8, 64, 0]], closed: false, smooth: true };
    case 'group': return { pos: [0, 0, 0] };
    case 'cloner': return {
      pos: [0, 64, 0], mode: 'linear', count: 8, step: [2, 0, 0], counts: [4, 1, 4], spacing: [2, 2, 2], radius: 8, plane: 'xz',
      a0: 0, a1: 360, align: true, path: null, stepLen: 0, volume: 'box', size: [16, 4, 16], seed: 1, iterate: 'cycle',
      effectors: [], preview: true, appearAt: null, removeAtEnd: true
    };
    case 'effector': return { kind: 'random', strength: 1, pos: [0, 0, 0], rot: 0, scale: 0, seed: 1, every: 2, chance: 0.5, invert: false, amp: 3, freq: 0.1 };
    case 'block': return { block: 'minecraft:oak_log', state: '' };
    case 'template': return { template: '' };
    // постройка из библиотеки (studio/structures/<id>.nbt): ставится целиком, поворот по 90°, отражение по X
    case 'structure': return { pos: [0, 64, 0], structure: '', rot: 0, mirror: false, anchor: 'corner', preview: true, appearAt: null, removeAtEnd: true };
    default: return {};
  }
}

function makeObject(type, id, name, extra) {
  const e = extra || {};
  return { id, type, name: name || OBJ_LABEL[type] || type, parent: null, enabled: true, visible: true, anim: {}, ...e, props: { ...defaultProps(type), ...(e.props || {}) } };
}

function uniqueObjId(scene, base) {
  const taken = new Set((scene.objects || []).map((o) => o.id));
  let n = 1;
  while (taken.has(base + n)) n++;
  return base + n;
}

// ---------------- каналы ----------------
function chanGet(props, ch) {
  if (!props) return undefined;
  if (ch.startsWith('pos.')) { const p = props.pos; return Array.isArray(p) ? p['xyz'.indexOf(ch[4])] : undefined; }
  if (ch.startsWith('rot.')) { const p = props.rot; return Array.isArray(p) ? p['hpb'.indexOf(ch[4])] : undefined; }
  return props[ch];
}
function chanSet(props, ch, v) {
  const c = { ...props };
  if (ch.startsWith('pos.')) { const p = Array.isArray(c.pos) ? c.pos.slice() : [0, 0, 0]; p['xyz'.indexOf(ch[4])] = v; c.pos = p; } else if (ch.startsWith('rot.')) { const p = Array.isArray(c.rot) ? c.rot.slice() : [0, 0, 0]; p['hpb'.indexOf(ch[4])] = v; c.rot = p; } else c[ch] = v;
  return c;
}
function isStepChannel(ch) { return STEP_CHANNELS.includes(ch); }

function autoSlope(keys, i) {
  const k = keys[i];
  const a = keys[i - 1], b = keys[i + 1];
  if (!a || !b) return 0; // концы — мягко (как «авто» в C4D)
  if (!isNum(a.v) || !isNum(b.v) || !isNum(k.v)) return 0;
  if ((k.v - a.v) * (b.v - k.v) <= 0) return 0; // вершина — без перелёта
  const s = (b.v - a.v) / Math.max(1e-6, b.t - a.t);
  // ограничение, чтобы кривая не вылетала за соседние значения
  const m1 = (k.v - a.v) / Math.max(1e-6, k.t - a.t), m2 = (b.v - k.v) / Math.max(1e-6, b.t - k.t);
  const lim = 3 * Math.min(Math.abs(m1), Math.abs(m2));
  return Math.sign(s) * Math.min(Math.abs(s), lim);
}
function keySlopes(keys, i) {
  const k = keys[i];
  const auto = autoSlope(keys, i);
  return { in: isNum(k.in) ? k.in : auto, out: isNum(k.out) ? k.out : (isNum(k.in) ? k.in : auto) };
}

// значение канала в момент t (ключи отсортированы по t)
function evalKeys(keys, t, ch) {
  if (!Array.isArray(keys) || !keys.length) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const interp = ch && isStepChannel(ch) ? 'step' : a.interp || 'bezier';
  if (!isNum(a.v) || !isNum(b.v) || interp === 'step') return a.v;
  const dt = b.t - a.t;
  if (dt <= 0) return b.v;
  const u = (t - a.t) / dt;
  if (interp === 'linear') return a.v + (b.v - a.v) * u;
  const m0 = keySlopes(keys, i).out * dt, m1 = keySlopes(keys, i + 1).in * dt;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a.v + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b.v + (u3 - u2) * m1;
}

// свойства объекта в момент t (с анимацией)
function propsAt(obj, t) {
  let p = obj.props || {};
  const anim = obj.anim || {};
  for (const ch of Object.keys(anim)) {
    const v = evalKeys(anim[ch], t, ch);
    if (v !== undefined) p = chanSet(p, ch, v);
  }
  return p;
}
function isAnimated(obj, ch) { return !!(obj && obj.anim && Array.isArray(obj.anim[ch]) && obj.anim[ch].length); }
function keyAt(obj, ch, t) { return isAnimated(obj, ch) ? obj.anim[ch].findIndex((k) => k.t === t) : -1; }

// поставить ключ (значение берётся текущее, если v не задано)
function setKey(obj, ch, t, v, interp) {
  const cur = v !== undefined ? v : chanGet(propsAt(obj, t), ch);
  const keys = isAnimated(obj, ch) ? obj.anim[ch].slice() : [];
  const i = keys.findIndex((k) => k.t === t);
  const def = isStepChannel(ch) || !isNum(cur) ? 'step' : 'bezier';
  if (i >= 0) keys[i] = { ...keys[i], v: cur, ...(interp ? { interp } : {}) };
  else { keys.push({ t, v: cur, interp: interp || def }); keys.sort((a, b) => a.t - b.t); }
  return { ...obj, anim: { ...(obj.anim || {}), [ch]: keys } };
}
function removeKey(obj, ch, t) {
  if (!isAnimated(obj, ch)) return obj;
  const keys = obj.anim[ch].filter((k) => k.t !== t);
  const anim = { ...obj.anim };
  if (keys.length) anim[ch] = keys; else delete anim[ch];
  // последний ключ ушёл — значение остаётся в props (как в C4D)
  const props = keys.length ? obj.props : chanSet(obj.props, ch, chanGet(propsAt(obj, t), ch));
  return { ...obj, anim, props };
}
// правка значения: если канал анимирован (или включена автозапись) — ключ в момент t, иначе просто значение
function setChannel(obj, ch, t, v, autoKey) {
  if (isAnimated(obj, ch) || autoKey) return setKey(obj, ch, t, v);
  return { ...obj, props: chanSet(obj.props || {}, ch, v) };
}
function moveKeys(obj, ch, fromT, toT) {
  if (!isAnimated(obj, ch) || fromT === toT) return obj;
  let keys = obj.anim[ch].filter((k) => k.t !== toT || k.t === fromT).map((k) => (k.t === fromT ? { ...k, t: toT } : k));
  keys = keys.sort((a, b) => a.t - b.t);
  return { ...obj, anim: { ...obj.anim, [ch]: keys } };
}
function allKeyTimes(obj) {
  const s = new Set();
  for (const ch of Object.keys((obj && obj.anim) || {})) for (const k of obj.anim[ch]) s.add(k.t);
  return [...s].sort((a, b) => a - b);
}

// ---------------- иерархия ----------------
function objById(scene, id) { return (scene.objects || []).find((o) => o.id === id) || null; }
function childrenOf(scene, id) { return (scene.objects || []).filter((o) => (o.parent || null) === (id || null)); }
function ancestors(scene, obj) {
  const out = [];
  let p = obj && obj.parent;
  const seen = new Set();
  while (p && !seen.has(p)) { seen.add(p); const o = objById(scene, p); if (!o) break; out.push(o); p = o.parent; }
  return out;
}
function isDescendant(scene, id, maybeAncestor) {
  const o = objById(scene, id);
  return !!o && ancestors(scene, o).some((a) => a.id === maybeAncestor);
}
// выключен сам или кто-то из родителей
function isActive(scene, obj) { return obj.enabled !== false && ancestors(scene, obj).every((a) => a.enabled !== false); }
// смещение от групп-родителей (только перенос, без поворота — для блоков так и надо)
function parentOffset(scene, obj, t) {
  const off = [0, 0, 0];
  for (const a of ancestors(scene, obj)) {
    if (a.type !== 'group') continue;
    const p = propsAt(a, t).pos;
    if (isP3(p)) for (let i = 0; i < 3; i++) off[i] += p[i];
  }
  return off;
}
function worldPos(scene, obj, t) {
  const p = propsAt(obj, t).pos;
  if (!isP3(p)) return null;
  const o = parentOffset(scene, obj, t);
  return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
}

// ---------------- «Монтаж» ----------------
function stageAt(scene, t) {
  const st = Array.isArray(scene.stage) ? scene.stage : [];
  let hit = null;
  for (const b of st) if (t >= b.t0 && t < b.t1) hit = b;
  if (!hit && st.length) { // в «дырке» держим последнюю камеру до этого момента
    const prev = st.filter((b) => b.t0 <= t).sort((a, b) => b.t0 - a.t0)[0];
    hit = prev || st.slice().sort((a, b) => a.t0 - b.t0)[0];
  }
  return hit;
}
function activeCamera(scene, t) {
  const b = stageAt(scene, t);
  const c = b && objById(scene, b.cam);
  if (c && c.type === 'camera') return c;
  return (scene.objects || []).find((o) => o.type === 'camera') || null;
}
function cameraPose(scene, cam, t) {
  const p = propsAt(cam, t);
  const pos = worldPos(scene, cam, t) || [0, 64, 0];
  const rot = Array.isArray(p.rot) ? p.rot : [0, 0, 0];
  return { pos: pos.map((n) => r3(n)), yaw: r3(rot[0] || 0), pitch: r3(rot[1] || 0), roll: r3(rot[2] || 0), fov: r3(p.fov || 70), shake: r3(p.shake || 0), look: p.look == null ? null : p.look };
}

// ---------------- старая сцена → объекты ----------------
const EASE2INTERP = { smooth: 'bezier', linear: 'linear', in: 'bezier', out: 'bezier' };
// сцена редактора: есть и objects, и stage (у собранной для игры stage нет, а objects — только светильники)
function hasObjects(scene) { return !!scene && Array.isArray(scene.objects) && Array.isArray(scene.stage); }

// Открыть сцену в новой Студии: старые сцены превращаются в объекты (камера-дорожка → объект «Камера 1» + «Монтаж»).
function toObjectScene(raw) {
  const s = clone(raw || {});
  s.tracks = (Array.isArray(s.tracks) ? s.tracks : []).map((tr) => {
    if (!tr) return tr;
    if (tr.gen) return null;
    if (Array.isArray(tr.events)) return { ...tr, events: tr.events.filter((e) => !(e && e.gen)) };
    if (Array.isArray(tr.keys) && tr.kind === 'camera') return { ...tr, keys: tr.keys.filter((k) => !(k && k.gen)) };
    return tr;
  }).filter(Boolean);
  if (!Array.isArray(s.actors)) s.actors = [];
  const len = isNum(s.length) && s.length > 0 ? s.length : 200;
  if (!hasObjects(s)) {
    const keep = Array.isArray(s.objects) ? s.objects.filter((o) => o && o.type === 'light') : [];
    s.objects = keep;
    const camTr = s.tracks.find((tr) => tr.kind === 'camera');
    const keys = (camTr && Array.isArray(camTr.keys) ? camTr.keys : []).filter((k) => k && isNum(k.t)).slice().sort((a, b) => a.t - b.t);
    s.stage = [];
    // без ключей камеры сцена шла глазами игрока — так и оставляем (камеры нет)
    if (keys.length) {
    const cam = makeObject('camera', 'cam1', 'Камера 1');
    const k0 = keys.find((k) => isP3(k.pos)) || keys[0];
    if (k0) cam.props = { ...cam.props, pos: isP3(k0.pos) ? k0.pos.slice() : cam.props.pos, rot: [k0.yaw || 0, k0.pitch || 0, k0.roll || 0], fov: k0.fov || 70, shake: k0.shake || 0, look: k0.look == null ? null : k0.look };
    if (keys.length > 1) {
      const anim = {};
      const put = (ch, k, v) => { (anim[ch] = anim[ch] || []).push({ t: Math.round(k.t), v, interp: EASE2INTERP[k.ease] || 'bezier' }); };
      for (const k of keys) {
        if (isP3(k.pos)) { put('pos.x', k, k.pos[0]); put('pos.y', k, k.pos[1]); put('pos.z', k, k.pos[2]); }
        put('rot.h', k, k.yaw || 0); put('rot.p', k, k.pitch || 0); put('rot.b', k, k.roll || 0); put('fov', k, k.fov || 70); put('shake', k, k.shake || 0);
      }
      // ease ключа в старом формате — «как подлетаем к ключу»: переносим на исходящий предыдущего
      for (const ch of Object.keys(anim)) {
        const a = anim[ch];
        for (let i = 0; i < a.length - 1; i++) a[i].interp = a[i + 1].interp;
        // каналы без изменений — не анимируем
        if (a.every((k) => k.v === a[0].v)) delete anim[ch];
      }
      const looks = keys.map((k) => (k.look == null ? null : k.look));
      if (looks.some((l) => JSON.stringify(l) !== JSON.stringify(looks[0]))) anim.look = keys.map((k, i) => ({ t: Math.round(k.t), v: looks[i], interp: 'step' }));
      cam.anim = anim;
    }
    s.objects.push(cam);
    s.stage = [{ t0: 0, t1: len, cam: 'cam1' }];
    }
    s.actors.forEach((a) => { if (a && a.id) s.objects.push(makeObject('actor', 'a_' + a.id, a.name || a.id, { actor: a.id })); });
    s.tracks = s.tracks.filter((tr) => tr.kind !== 'camera');
  } else {
    if (!Array.isArray(s.stage)) s.stage = [];
    s.tracks = s.tracks.filter((tr) => tr.kind !== 'camera');
    s.objects = s.objects.filter((o) => o && o.id && OBJ_TYPES.includes(o.type)).map((o) => ({ parent: null, enabled: true, visible: true, anim: {}, ...o, props: { ...defaultProps(o.type), ...(o.props || {}) } }));
    // актёр без объекта — дописать, объект без актёра — убрать
    const have = new Set(s.objects.filter((o) => o.type === 'actor').map((o) => o.actor));
    s.actors.forEach((a) => { if (a && a.id && !have.has(a.id)) s.objects.push(makeObject('actor', uniqueObjId(s, 'a_' + a.id + '_'), a.name || a.id, { actor: a.id })); });
    const ids = new Set(s.actors.map((a) => a && a.id));
    s.objects = s.objects.filter((o) => o.type !== 'actor' || ids.has(o.actor));
  }
  return s;
}

// ---------------- компиляция для игры (формат фазы 1) ----------------
// opts.sample — шаг выборки камеры в тиках (по умолчанию 4)
function compileCamera(scene, opts) {
  const step = Math.max(1, (opts && opts.sample) || 4);
  const len = Math.max(1, Math.round(scene.length || 1));
  const cams = (scene.objects || []).filter((o) => o.type === 'camera' && isActive(scene, o));
  if (!cams.length) return [];
  let stage = (Array.isArray(scene.stage) ? scene.stage : []).filter((b) => b && cams.some((c) => c.id === b.cam) && isNum(b.t0) && isNum(b.t1) && b.t1 > b.t0)
    .map((b) => ({ t0: Math.max(0, Math.round(b.t0)), t1: Math.min(len, Math.round(b.t1)), cam: b.cam })).filter((b) => b.t1 > b.t0).sort((a, b) => a.t0 - b.t0);
  if (!stage.length) stage = [{ t0: 0, t1: len, cam: cams[0].id }];
  // дырки: держим предыдущую камеру; до первого блока — первая камера
  const blocks = [];
  let cur = 0;
  stage.forEach((b, i) => {
    const t0 = i === 0 ? 0 : Math.max(cur, b.t0);
    const t1 = i === stage.length - 1 ? len : Math.max(t0, stage[i + 1].t0);
    if (t1 > t0) blocks.push({ t0, t1, cam: b.cam });
    cur = t1;
  });
  const keys = [];
  const add = (t, cam, ease) => {
    const p = cameraPose(scene, cam, t);
    const k = { t, pos: p.pos, yaw: p.yaw, pitch: p.pitch, fov: p.fov, ease: ease || 'linear', gen: true };
    if (p.roll) k.roll = p.roll;
    if (p.shake) k.shake = p.shake;
    if (p.look != null) k.look = p.look;
    if (keys.length && keys[keys.length - 1].t === t) keys[keys.length - 1] = k; else keys.push(k);
  };
  blocks.forEach((b, bi) => {
    const cam = cams.find((c) => c.id === b.cam);
    const animated = Object.keys(cam.anim || {}).length > 0 || ancestors(scene, cam).some((a) => Object.keys(a.anim || {}).length);
    const times = new Set([b.t0, b.t1]);
    if (animated) {
      for (let t = b.t0; t < b.t1; t += step) times.add(t);
      for (const t of allKeyTimes(cam)) if (t > b.t0 && t < b.t1) times.add(t);
    }
    const last = bi === blocks.length - 1;
    [...times].sort((x, y) => x - y).forEach((t) => { if (t < b.t1 || last) add(t, cam); });
    if (!last) add(b.t1 - 1, cam);
  });
  // один ключ (сцена из одной точки) — игре нужен хотя бы один
  return keys.filter((k, i) => i === 0 || k.t > keys[i - 1].t);
}

function lightPositions(scene, o, t) {
  const p = propsAt(o, t);
  const off = parentOffset(scene, o, t);
  const out = [];
  if (isP3(p.pos)) out.push(p.pos.map((v, i) => Math.floor(v + off[i])));
  for (const q of Array.isArray(p.positions) ? p.positions : []) if (isP3(q)) out.push(q.map((v, i) => Math.floor(v + off[i])));
  return out;
}
// Свет в сцене: игра (фаза 3) сама ставит minecraft:light у объектов-светильников и всё возвращает в конце сцены.
// Отдаём ей объекты света в её формате: мировые позиции (с учётом групп), level/on и их анимация (ступенькой).
function lightObjects(scene) {
  const out = [];
  for (const o of (scene.objects || []).filter((x) => x.type === 'light' && isActive(scene, x))) {
    const p = propsAt(o, 0);
    const at = lightPositions(scene, o, 0);
    if (!at.length) continue;
    const anim = {};
    for (const ch of ['on', 'level']) if (o.anim && Array.isArray(o.anim[ch]) && o.anim[ch].length) anim[ch] = o.anim[ch].map((k) => ({ t: Math.round(k.t), v: ch === 'on' ? !!k.v : Math.max(0, Math.min(15, Math.round(Number(k.v) || 0))), interp: 'step' }));
    out.push({ id: o.id, type: 'light', name: o.name, enabled: true, visible: true, props: { pos: at[0], positions: at.slice(1), level: Math.max(0, Math.min(15, Math.round(isNum(p.level) ? p.level : 15))), on: p.on !== false }, anim });
  }
  return out;
}
function compileSounds(scene) {
  const ev = [];
  for (const o of (scene.objects || []).filter((x) => x.type === 'sound' && isActive(scene, x))) {
    const keys = ((o.anim && o.anim.play) || []).filter((k) => k.v);
    for (const k of keys) {
      const p = propsAt(o, k.t);
      const pos = isP3(p.pos) ? worldPos(scene, o, k.t) : null;
      const e = { t: Math.round(k.t), do: 'sound', id: p.id, pos, gen: true, src: o.id };
      if (isNum(p.vol) && p.vol !== 1) e.vol = p.vol;
      if (isNum(p.pitch) && p.pitch !== 1) e.pitch = p.pitch;
      ev.push(e);
    }
  }
  return ev;
}
// клонер «появляется в момент t»: событие мира «bake» (игра ставит блоки сама, по тикам; removeAtEnd — вернуть в конце)
const SCENE_CLONE_MAX = 20000;
// постройка-объект → одно размещение (формат игры): { pos, structure, rot, mirror?, anchor? }
// pos — наименьший угол уже повёрнутой постройки (или центр низа при anchor:'center'); сначала отражение, потом поворот
function structurePlacements(scene, o, t) {
  const p = propsAt(o, t || 0);
  if (!p.structure) return [];
  const wp = worldPos(scene, o, t || 0) || [0, 64, 0];
  const pl = { pos: wp.map((v) => Math.floor(v)), structure: p.structure, rot: [0, 90, 180, 270].includes(p.rot) ? p.rot : 0 };
  if (p.mirror && p.mirror !== 'none') pl.mirror = p.mirror === true ? 'x' : p.mirror;
  if (p.anchor === 'center') pl.anchor = 'center';
  return [pl];
}
function compileCloners(scene) {
  const ev = [];
  for (const o of (scene.objects || []).filter((x) => x.type === 'structure' && isActive(scene, x))) {
    const at = o.props && o.props.appearAt;
    if (!isNum(at) || at < 0) continue;
    const pl = structurePlacements(scene, o, at);
    if (pl.length) ev.push({ t: Math.round(at), do: 'bake', id: o.id, placements: pl, removeAtEnd: o.props.removeAtEnd !== false, gen: true, src: o.id });
  }
  for (const o of (scene.objects || []).filter((x) => x.type === 'cloner' && isActive(scene, x))) {
    const at = o.props && o.props.appearAt;
    if (!isNum(at) || at < 0) continue;
    const pl = clonerOutput(scene, o, at).slice(0, SCENE_CLONE_MAX);
    if (!pl.length) continue;
    ev.push({ t: Math.round(at), do: 'bake', id: o.id, placements: pl, removeAtEnd: o.props.removeAtEnd !== false, gen: true, src: o.id });
  }
  return ev;
}

// что клонирует клонер: дети-источники (блок / шаблон / актёр / свет) и эффекторы (дети + список props.effectors)
function clonerInputs(scene, cl) {
  const kids = childrenOf(scene, cl.id).filter((o) => o.enabled !== false);
  const sources = kids.filter((o) => ['block', 'template', 'actor', 'light'].includes(o.type)).map((o) => {
    if (o.type === 'block') return { block: (o.props.block || 'minecraft:stone') + (o.props.state ? '[' + String(o.props.state).replace(/^\[|\]$/g, '') + ']' : '') };
    if (o.type === 'template') return { template: o.props.template || '' };
    if (o.type === 'light') return { light: Math.max(1, Math.min(15, Math.round(o.props.level || 15))) };
    const a = (scene.actors || []).find((x) => x.id === o.actor) || {};
    return { actor: { kind: a.kind || 'entity', type: a.type || 'minecraft:villager', who: a.who, ref: a.ref, name: a.name || o.name } };
  });
  const ids = [...kids.filter((o) => o.type === 'effector').map((o) => o.id), ...((cl.props && cl.props.effectors) || [])];
  const effectors = [...new Set(ids)].map((id) => objById(scene, id)).filter((e) => e && e.type === 'effector' && e.enabled !== false);
  return { sources, effectors };
}
function clonerOutput(scene, cl, t) {
  const { sources, effectors } = clonerInputs(scene, cl);
  const props = propsAt(cl, t || 0);
  const origin = worldPos(scene, cl, t || 0) || [0, 0, 0];
  const pathObj = props.path ? objById(scene, props.path) : null;
  let pathPts = null;
  if (pathObj && pathObj.type === 'path') {
    const pp = propsAt(pathObj, t || 0);
    const off = worldPos(scene, pathObj, t || 0) || [0, 0, 0];
    pathPts = (pp.points || []).filter(isP3).map((q) => [q[0] + off[0], q[1] + off[1], q[2] + off[2]]);
    if (pp.closed && pathPts.length > 2) pathPts.push(pathPts[0].slice());
  }
  return clonerPlacements({ ...props, origin: props.mode === 'spline' ? [0, 0, 0] : origin }, sources.length ? sources : [{ block: 'minecraft:stone' }],
    effectors.map((e) => ({ ...propsAt(e, t || 0), id: e.id })), { path: pathPts, smooth: pathObj ? propsAt(pathObj, 0).smooth !== false : true });
}

// Главное: сцена с объектами → сцена для игры: дорожка камеры по «Монтажу», звуки и «bake» клонеров в событиях,
// из объектов остаются только светильники (их игра обрабатывает сама), stage убирается.
function compileScene(scene) {
  if (!hasObjects(scene)) return scene;
  const s = toObjectScene(scene); // снять старые gen-события, привести объекты
  const out = { ...s };
  delete out.objects;
  delete out.stage;
  const tracks = (s.tracks || []).filter((tr) => tr && tr.kind !== 'camera').map((tr) => ({ ...tr }));
  const cam = compileCamera(s);
  if (cam.length) tracks.unshift({ kind: 'camera', gen: true, keys: cam });
  const addEv = (kind, evs) => {
    if (!evs.length) return;
    let tr = tracks.find((x) => x.kind === kind);
    if (!tr) { tr = { kind, events: [] }; tracks.push(tr); }
    tr.events = [...(tr.events || []), ...evs].sort((a, b) => a.t - b.t);
  };
  addEv('world', compileCloners(s));
  addEv('sound', compileSounds(s));
  out.tracks = tracks;
  const lights = lightObjects(s);
  if (lights.length) out.objects = lights;
  return out;
}

// Для сохранения на диск: объекты + сгенерированные дорожки (чтобы игра в режиме разработчика читала файл напрямую).
function sceneForDisk(scene) {
  if (!hasObjects(scene)) return scene;
  const s = toObjectScene(scene);
  const c = compileScene(s);
  return { ...c, objects: s.objects, stage: s.stage };
}

// ---------------- для игры: объекты в момент t (живая связь {t:'objects'}) ----------------
// Формат игры: { id, type, name, parent, enabled, visible, props:{…}, anim:{} } — все pos МИРОВЫЕ (группы учтены здесь),
// rot = [yaw, pitch, roll]. Анимацию не шлём: в момент t игра получает готовые позы ({t:'time', poses}).
function lookPoint(scene, look, t) {
  if (isP3(look)) return look;
  if (typeof look === 'string' && look.startsWith('actor:')) { const ap = actorPosAt(scene, look.slice(6), t); return ap ? [ap.pos[0], ap.pos[1] + 1.6, ap.pos[2]] : null; }
  return null;
}
function gameObject(scene, o, t, selected) {
  const p = propsAt(o, t);
  const props = {};
  const wp = worldPos(scene, o, t);
  if (wp) props.pos = wp.map(r3);
  switch (o.type) {
    case 'camera': {
      props.rot = (Array.isArray(p.rot) ? p.rot : [0, 0, 0]).map((v) => r3(v || 0));
      props.fov = r3(p.fov || 70);
      const lp = lookPoint(scene, p.look, t);
      if (lp) props.look = lp.map(r3);
      break;
    }
    case 'light': { const at = lightPositions(scene, o, t); props.pos = at[0] || props.pos; props.positions = at.slice(1); props.level = p.level; props.on = p.on !== false; break; }
    case 'path': { const off = wp || [0, 0, 0]; props.points = (p.points || []).filter(isP3).map((q) => q.map((v, i) => r3(v + off[i]))); props.closed = !!p.closed; delete props.pos; break; }
    case 'marker': props.label = p.label || o.name; break;
    case 'sound': props.sound = p.id; if (!isP3(p.pos)) delete props.pos; break;
    case 'cloner': props.mode = p.mode; break;
    case 'structure': props.structure = p.structure || ''; props.rot = p.rot || 0; props.mirror = p.mirror === true ? 'x' : p.mirror || false; if (p.anchor === 'center') props.anchor = 'center'; if (props.pos) props.pos = props.pos.map((v) => Math.floor(v)); break;
    case 'effector': props.kind = p.kind; { const cl = o.parent && objById(scene, o.parent); const cp = cl && worldPos(scene, cl, t); if (!props.pos && cp) props.pos = cp.map(r3); } break;
    case 'actor': {
      const ap = actorPosAt(scene, o.actor, t);
      if (ap) { props.pos = ap.pos; props.rot = [ap.yaw, 0, 0]; }
      props.actor = o.actor;
      break;
    }
    default:
  }
  return { id: o.id, type: o.type, name: o.name, parent: o.parent || null, enabled: isActive(scene, o), visible: o.visible !== false, selected: !!selected, props, anim: {} };
}
function objectsSnapshot(scene, t, selIds) {
  const sel = new Set(selIds || []);
  return (scene.objects || []).filter((o) => !['block', 'template'].includes(o.type)).map((o) => gameObject(scene, o, t, sel.has(o.id)));
}
// позы для {t:'time', poses}: камеры, актёры и всё, что анимировано (само или через группу)
function posesAt(scene, t) {
  const poses = {};
  for (const o of scene.objects || []) {
    if (!isActive(scene, o)) continue;
    const moving = o.type === 'camera' || o.type === 'actor' || Object.keys(o.anim || {}).length || ancestors(scene, o).some((a) => Object.keys(a.anim || {}).length);
    if (!moving) continue;
    const g = gameObject(scene, o, t, false).props;
    if (!g.pos) continue;
    const ps = { pos: g.pos };
    if (g.rot) ps.rot = g.rot;
    if (g.fov) ps.fov = g.fov;
    if (g.look) ps.look = g.look;
    poses[o.id] = ps;
  }
  return poses;
}

// где актёр в момент t: старт → «Идти» по пути (примерно по скорости) → «Переместить»
function actorPosAt(scene, actorId, t) {
  const a = (scene.actors || []).find((x) => x.id === actorId);
  if (!a) return null;
  let pos = a.spawn && isP3(a.spawn.pos) ? a.spawn.pos.slice() : null;
  let yaw = (a.spawn && a.spawn.yaw) || 0;
  const tr = (scene.tracks || []).find((x) => x.kind === 'actor' && x.actor === actorId);
  const evs = tr && Array.isArray(tr.events) ? tr.events.slice().sort((x, y) => x.t - y.t) : [];
  for (const e of evs) {
    if (e.t > t) break;
    if (e.do === 'tp' && isP3(e.pos)) { pos = e.pos.slice(); if (isNum(e.yaw)) yaw = e.yaw; }
    if (e.do === 'walk' && Array.isArray(e.path) && e.path.filter(isP3).length >= 2) {
      const pts = e.path.filter(isP3);
      const speed = isNum(e.speed) && e.speed > 0 ? e.speed : 0.6;
      const bps = 4.3 * speed / 20; // блоков за тик (примерно как ходит житель)
      let left = (t - e.t) * bps;
      pos = pts[0].slice();
      for (let i = 1; i < pts.length; i++) {
        const a0 = pts[i - 1], b0 = pts[i];
        const d = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]);
        yaw = Math.atan2(-(b0[0] - a0[0]), b0[2] - a0[2]) * 180 / Math.PI;
        if (left <= d) { const u = d > 0 ? left / d : 1; pos = [0, 1, 2].map((k) => a0[k] + (b0[k] - a0[k]) * u); left = -1; break; }
        left -= d;
        pos = b0.slice();
      }
    }
  }
  return pos ? { pos: pos.map(r3), yaw: r3(yaw) } : null;
}

// ---------------- проверка объектов ----------------
function validateObjects(scene, add, E, W) {
  const objs = Array.isArray(scene.objects) ? scene.objects : [];
  const ids = new Set();
  const len = scene.length;
  for (const o of objs) {
    const sel = { obj: o && o.id };
    const nm = '«' + ((o && (o.name || o.id)) || '?') + '»';
    if (!o || typeof o !== 'object' || !o.id) { add(E, 'Объект без id — файл сцены повреждён'); continue; }
    if (ids.has(o.id)) add(E, 'Объект ' + nm + ': id «' + o.id + '» повторяется', sel);
    ids.add(o.id);
    if (!OBJ_TYPES.includes(o.type)) { add(E, 'Объект ' + nm + ': неизвестный вид «' + o.type + '»', sel); continue; }
    if (o.parent && !objs.some((x) => x && x.id === o.parent)) add(W, 'Объект ' + nm + ': родителя «' + o.parent + '» нет — встанет в корень', sel);
    if (o.parent && isDescendant(scene, o.parent, o.id)) add(E, 'Объект ' + nm + ': вложен сам в себя (кольцо в иерархии)', sel);
    const p = o.props || {};
    if (p.pos !== undefined && p.pos !== null && !isP3(p.pos)) add(E, 'Объект ' + nm + ': позиция — три числа x y z', sel);
    for (const ch of Object.keys(o.anim || {})) {
      const keys = o.anim[ch];
      if (!Array.isArray(keys)) { add(E, 'Объект ' + nm + ': анимация «' + ch + '» повреждена', sel); continue; }
      if (!(CHANNELS[o.type] || []).includes(ch) && ch !== 'look') add(W, 'Объект ' + nm + ': канал «' + ch + '» у этого вида не анимируется — не сыграет', sel);
      let prev = -Infinity;
      for (const k of keys) {
        if (!k || !isNum(k.t)) { add(E, 'Объект ' + nm + ': ключ «' + (CHANNEL_LABEL[ch] || ch) + '» без времени', sel); continue; }
        if (k.t < prev) add(W, 'Объект ' + nm + ': ключи «' + (CHANNEL_LABEL[ch] || ch) + '» не по порядку', sel);
        if (k.t === prev) add(W, 'Объект ' + nm + ': два ключа «' + (CHANNEL_LABEL[ch] || ch) + '» в один тик', sel);
        prev = k.t;
        if (isNum(len) && k.t > len) add(W, 'Объект ' + nm + ': ключ «' + (CHANNEL_LABEL[ch] || ch) + '» после конца сцены (' + k.t + ' т)', sel);
        if (k.interp && !INTERPS.includes(k.interp)) add(W, 'Объект ' + nm + ': неизвестная интерполяция «' + k.interp + '»', sel);
        if (ch !== 'look' && !isNum(k.v) && typeof k.v !== 'boolean') add(E, 'Объект ' + nm + ': значение ключа «' + (CHANNEL_LABEL[ch] || ch) + '» — не число', sel);
      }
    }
    if (o.type === 'camera') {
      const fov = propsAt(o, 0).fov;
      if (isNum(fov) && (fov < 5 || fov > 170)) add(W, 'Камера ' + nm + ': угол обзора лучше от 5 до 170', sel);
    }
    if (o.type === 'light') {
      const lv = p.level;
      if (lv !== undefined && (!isNum(lv) || lv < 0 || lv > 15)) add(E, 'Свет ' + nm + ': яркость — от 0 до 15', sel);
      if (!isP3(p.pos) && !(p.positions || []).length) add(E, 'Свет ' + nm + ': не задано, где он стоит', sel);
    }
    if (o.type === 'sound') {
      if (!p.id || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(p.id)) add(E, 'Звук ' + nm + ': id звука пиши вида minecraft:block.bell.use', sel);
      if (!((o.anim && o.anim.play) || []).some((k) => k.v)) add(W, 'Звук ' + nm + ': нет ни одного ключа «Играть» — не прозвучит', sel);
    }
    if (o.type === 'path' && (!Array.isArray(p.points) || p.points.filter(isP3).length < 2)) add(E, 'Путь ' + nm + ': нужно минимум 2 точки', sel);
    if (o.type === 'actor' && !(scene.actors || []).some((a) => a && a.id === o.actor)) add(E, 'Объект ' + nm + ': актёра «' + o.actor + '» нет в сцене', sel);
    if (o.type === 'block') {
      if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(p.block || '')) add(E, 'Блок ' + nm + ': id блока пиши вида minecraft:oak_log', sel);
      if (p.state && !/^\[?[a-z0-9_]+=[a-z0-9_]+(,[a-z0-9_]+=[a-z0-9_]+)*\]?$/.test(p.state)) add(E, 'Блок ' + nm + ': состояние пиши вида axis=y,waterlogged=false', sel);
    }
    if ((o.type === 'block' || o.type === 'template' || o.type === 'effector') && !(o.parent && (objById(scene, o.parent) || {}).type === 'cloner')) {
      const linked = o.type === 'effector' && objs.some((c) => c && c.type === 'cloner' && ((c.props || {}).effectors || []).includes(o.id));
      if (!linked) add(W, OBJ_LABEL[o.type] + ' ' + nm + ': работает только внутри клонера — перетащи его в клонер', sel);
    }
    if (o.type === 'structure') {
      if (!p.structure) add(W, 'Постройка ' + nm + ': не выбрана постройка из библиотеки — ничего не появится', sel);
      else if (!/^[a-z0-9_-]{1,64}$/.test(p.structure) && !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(p.structure)) add(E, 'Постройка ' + nm + ': id постройки — латиница, цифры, _ и -', sel);
      if (p.rot !== undefined && ![0, 90, 180, 270].includes(p.rot)) add(E, 'Постройка ' + nm + ': поворот — 0, 90, 180 или 270', sel);
      if (p.mirror !== undefined && ![false, true, 'x', 'z', 'none'].includes(p.mirror)) add(E, 'Постройка ' + nm + ': отражение — нет, по X или по Z', sel);
      if (isNum(p.appearAt) && isNum(len) && p.appearAt > len) add(W, 'Постройка ' + nm + ': появляется после конца сцены', sel);
    }
    if (o.type === 'cloner') {
      const m = p.mode;
      if (!['linear', 'grid', 'radial', 'spline', 'random'].includes(m)) add(E, 'Клонер ' + nm + ': неизвестный режим «' + m + '»', sel);
      if (m === 'spline') {
        const po = p.path && objById(scene, p.path);
        if (!po || po.type !== 'path') add(E, 'Клонер ' + nm + ': в режиме «По пути» выбери объект-путь', sel);
      }
      const { sources } = clonerInputs(scene, o);
      if (!sources.length) add(W, 'Клонер ' + nm + ': внутри нет блока/шаблона/актёра — будет камень', sel);
      if (isNum(p.appearAt) && isNum(len) && p.appearAt > len) add(W, 'Клонер ' + nm + ': появляется после конца сцены', sel);
      try {
        const n = clonerOutput(scene, o, 0).length;
        if (n > 20000) add(W, 'Клонер ' + nm + ': ' + n + ' копий — в игре покажутся и запекутся только первые 20000', sel);
        if (isNum(p.appearAt) && n > SCENE_CLONE_MAX) add(W, 'Клонер ' + nm + ': в сцене появятся только первые ' + SCENE_CLONE_MAX + ' блоков из ' + n, sel);
      } catch (e) { add(E, 'Клонер ' + nm + ': не считается — ' + e.message, sel); }
    }
  }
  const st = Array.isArray(scene.stage) ? scene.stage : [];
  const cams = objs.filter((o) => o && o.type === 'camera');
  if (!cams.length) add(W, 'В сцене нет ни одной камеры — сцена пойдёт глазами игрока. Создай камеру: Создать → Камера');
  st.forEach((b, i) => {
    const sel = { stage: i };
    if (!b || !isNum(b.t0) || !isNum(b.t1) || b.t1 <= b.t0) { add(E, '«Монтаж»: блок №' + (i + 1) + ' — конец должен быть позже начала', sel); return; }
    const c = objById(scene, b.cam);
    if (!c || c.type !== 'camera') add(E, '«Монтаж»: блок №' + (i + 1) + ' — нет камеры «' + b.cam + '»', sel);
    else if (!isActive(scene, c)) add(W, '«Монтаж»: камера «' + (c.name || c.id) + '» выключена — блок пропустится', sel);
    const o = st.find((x, j) => j !== i && x && isNum(x.t0) && x.t0 < b.t1 && x.t1 > b.t0);
    if (o) add(W, '«Монтаж»: блоки камер перекрываются — сыграет более поздний', sel);
  });
  if (cams.length > 1 && !st.length) add(W, 'Камер несколько, а «Монтаж» пуст — будет первая камера. Перетащи камеры на дорожку «Монтаж»');
}

return { OBJ_TYPES, OBJ_LABEL, INTERPS, INTERP_LABEL, CHANNELS, STEP_CHANNELS, CHANNEL_LABEL, defaultProps, makeObject, uniqueObjId, chanGet, chanSet, isStepChannel, keySlopes, evalKeys, propsAt, isAnimated, keyAt, setKey, removeKey, setChannel, moveKeys, allKeyTimes, objById, childrenOf, ancestors, isDescendant, isActive, parentOffset, worldPos, stageAt, activeCamera, cameraPose, hasObjects, toObjectScene, compileCamera, lightObjects, compileSounds, SCENE_CLONE_MAX, structurePlacements, compileCloners, clonerInputs, clonerOutput, compileScene, sceneForDisk, gameObject, objectsSnapshot, posesAt, actorPosAt, validateObjects };
})();
const { OBJ_TYPES, OBJ_LABEL, INTERPS, INTERP_LABEL, CHANNELS, STEP_CHANNELS, CHANNEL_LABEL, defaultProps, makeObject, uniqueObjId, chanGet, chanSet, isStepChannel, keySlopes, evalKeys, propsAt, isAnimated, keyAt, setKey, removeKey, setChannel, moveKeys, allKeyTimes, objById, childrenOf, ancestors, isDescendant, isActive, parentOffset, worldPos, stageAt, activeCamera, cameraPose, hasObjects, toObjectScene, compileCamera, lightObjects, compileSounds, SCENE_CLONE_MAX, structurePlacements, compileCloners, clonerInputs, clonerOutput, compileScene, sceneForDisk, gameObject, objectsSnapshot, posesAt, actorPosAt, validateObjects } = __scene3d;

// ===== validate.js =====
const __validate = (function () {
// Проверка и нормализация сцен «Студии». Чистые функции без зависимостей.
// Этот же код работает в главном процессе («Собрать для игроков»): electron/studio-validate.cjs
// генерируется из этого файла командой `node scripts/sync-studio.cjs` (её же вызывает scripts/check.cjs).
// Импорт разрешён только из scene3d.js и mograph.js (sync-studio.cjs склеивает их в один файл).


const ERR = 'ошибка';
const WARN = 'предупреждение';

const TRACK_KINDS = ['camera', 'actor', 'fx', 'sound', 'subtitles', 'world'];
const ACTOR_KINDS = ['story', 'valley', 'entity', 'player'];
const EASES = ['smooth', 'linear', 'in', 'out'];
const WEATHERS = ['clear', 'rain', 'thunder'];
const END_MODES = ['stay', 'tp', 'back'];
const SUB_MAX = 140;

// глаголы дорожек: какие поля обязательны (subtitles — без глагола, одна реплика)
const VERBS = {
  actor: {
    walk: { need: ['path'] }, anim: { need: ['name'] }, face: { need: ['name'] }, look: { need: ['at'] },
    say: { need: ['text'] }, hold: { need: [] }, tp: { need: ['pos'] }, sit: { need: [] }, stand: { need: [] }, pose: { need: ['name'] }
  },
  fx: {
    fade_in: { need: [] }, fade_out: { need: [] }, flash: { need: [] }, shake: { need: [] },
    particles: { need: ['name', 'pos'] }, story_fx: { need: ['name'] }, title: { need: ['text'] }
  },
  sound: { sound: { need: ['id'] }, music: { need: ['id'] }, music_fade: { need: [] } },
  world: { time: { need: ['value'] }, weather: { need: ['value'] }, block: { need: ['pos', 'state'] }, var: { need: ['name'] }, dialog: { need: ['id'] }, bake: { need: ['placements'] } }
};

const TRACK_LABEL = { camera: 'Камера', actor: 'Актёр', fx: 'Эффекты', sound: 'Звук', subtitles: 'Субтитры', world: 'Мир' };
const VERB_LABEL = {
  key: 'Ключ камеры', line: 'Реплика',
  walk: 'Идти', anim: 'Анимация', face: 'Лицо', look: 'Смотреть', say: 'Сказать', hold: 'Взять в руки', tp: 'Переместить',
  sit: 'Сесть', stand: 'Встать', pose: 'Поза',
  fade_in: 'Из темноты', fade_out: 'В темноту', flash: 'Вспышка', shake: 'Тряска', particles: 'Частицы', story_fx: 'Сюжетный эффект', title: 'Заголовок',
  sound: 'Звук', music: 'Музыка', music_fade: 'Музыка затихает',
  time: 'Время суток', weather: 'Погода', block: 'Блок', var: 'Переменная', dialog: 'Открыть диалог', bake: 'Клонер появляется'
};
const FIELD_LABEL = {
  path: 'путь', name: 'название', at: 'на кого смотреть', text: 'текст', pos: 'место', id: 'звук', value: 'значение', state: 'блок'
};

const RL = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const SCENE_ID = /^[a-z0-9_-]{1,64}$/;
const ACTOR_ID = /^[a-z0-9_-]{1,48}$/;
const VAR_NAME = /^[a-zA-Z0-9_.-]{1,64}$/;

function isResId(s) { return typeof s === 'string' && RL.test(s); }
function isSceneId(s) { return typeof s === 'string' && SCENE_ID.test(s); }
function isActorId(s) { return typeof s === 'string' && ACTOR_ID.test(s); }
function isPos(p) { return Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && isFinite(v)); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function trackKeyOf(tr) { return tr && tr.kind === 'actor' ? 'actor:' + tr.actor : (tr ? tr.kind : ''); }
function itemsOfTrack(tr) { return !tr ? [] : tr.kind === 'camera' ? (tr.keys || []) : (tr.events || []); }
function verbOf(kind, ev) { return kind === 'camera' ? 'key' : kind === 'subtitles' ? 'line' : (ev && ev.do); }

// «player» | «actor:id» | [x,y,z] | null
function isTarget(v, actorIds) {
  if (v === null || v === undefined || v === 'player') return true;
  if (isPos(v)) return true;
  if (typeof v === 'string' && v.startsWith('actor:')) return !actorIds || actorIds.includes(v.slice(6));
  return false;
}

function tsec(t) { return isNum(t) ? (Math.round(t / 2) / 10) + ' с' : '?'; }

// Проверка одной сцены. ctx: { project, ids: [все id сцен проекта] }
function validateScene(scene, ctx) {
  ctx = ctx || {};
  // фаза 3: сцена из объектов — проверить объекты и то, что из них соберётся для игры
  if (hasObjects(scene)) {
    const res = [];
    validateObjects(scene, (sev, msg, sel) => res.push({ sev, msg, sel: sel || null, scene: scene.id || null }), ERR, WARN);
    let comp;
    try { comp = compileScene(scene); } catch (e) { res.push({ sev: ERR, msg: 'Сцена не собирается из объектов: ' + e.message, sel: null, scene: scene.id || null }); return res; }
    const compNoObj = { ...comp };
    delete compNoObj.objects;
    for (const x of validateScene(compNoObj, ctx)) {
      if (x.sel && x.sel.track === 'camera') continue; // ключи камеры сгенерированы — ошибки уже у объектов
      if (!x.sel && /ключ(а|ей)? камеры/.test(x.msg)) continue;
      if (x.sel && x.sel.track) {
        const tr = (comp.tracks || []).find((t) => trackKeyOf(t) === x.sel.track);
        const items = itemsOfTrack(tr);
        const it = items[x.sel.i];
        if (it && it.gen) { res.push({ ...x, sel: it.src ? { obj: it.src } : null }); continue; }
        const i = items.slice(0, x.sel.i).filter((e) => !(e && e.gen)).length;
        res.push({ ...x, sel: { ...x.sel, i } });
        continue;
      }
      res.push(x);
    }
    return res;
  }
  const out = [];
  const sid = scene && scene.id;
  const add = (sev, msg, sel) => out.push({ sev, msg, sel: sel || null, scene: sid || null });
  if (!scene || typeof scene !== 'object') { add(ERR, 'Сцена пустая или повреждена'); return out; }
  if (!isSceneId(scene.id)) add(ERR, 'Имя файла сцены (id) — только маленькие латинские буквы, цифры, _ и -, например alaric_arrival');
  if (ctx.ids && ctx.ids.filter((x) => x === scene.id).length > 1) add(ERR, 'Сцена с именем «' + scene.id + '» уже есть — имена не должны повторяться');
  if (!scene.title || !String(scene.title).trim()) add(WARN, 'У сцены нет названия — его видно только тебе, но так легче искать');
  const len = scene.length;
  if (!isNum(len) || len <= 0) add(ERR, 'Длина сцены должна быть больше нуля (в тиках, 20 тиков = 1 секунда)');
  else if (len > 20 * 60 * 10) add(WARN, 'Сцена длиннее 10 минут — точно так задумано?');
  const w = scene.world || {};
  if (w.dim && !isResId(w.dim)) add(ERR, 'Измерение записано неправильно: нужно вида minecraft:overworld');
  const opt = scene.options || {};
  if (opt.music && !isResId(opt.music)) add(ERR, 'Музыка сцены: id звука нужно писать вида мод:имя, например minecraft:music.game');
  const ep = opt.endPlayer || {};
  if (ep.mode && !END_MODES.includes(ep.mode)) add(ERR, 'Конец сцены: непонятно, что делать с игроком («' + ep.mode + '»)');
  if (ep.mode === 'tp' && !isPos(ep.pos)) add(ERR, 'Конец сцены: выбран перенос игрока, но не задано место (x y z)');
  const pre = scene.preload || {};
  if (pre.radius !== undefined && (!isNum(pre.radius) || pre.radius < 0 || pre.radius > 12)) add(WARN, 'Подгрузка чанков: радиус лучше от 0 до 12');

  // актёры
  const actors = Array.isArray(scene.actors) ? scene.actors : [];
  const actorIds = [];
  const projActors = ctx.project && Array.isArray(ctx.project.actors) ? ctx.project.actors : null;
  actors.forEach((a, i) => {
    const sel = { actor: i };
    const nm = '«' + ((a && (a.name || a.id)) || ('актёр ' + (i + 1))) + '»';
    if (!a || typeof a !== 'object') { add(ERR, 'Актёр №' + (i + 1) + ' повреждён', sel); return; }
    if (!isActorId(a.id)) add(ERR, 'Актёр ' + nm + ': id — только латиница, цифры, _ и -', sel);
    else if (actorIds.includes(a.id)) add(ERR, 'Актёр ' + nm + ': id «' + a.id + '» повторяется в сцене', sel);
    actorIds.push(a.id);
    if (!ACTOR_KINDS.includes(a.kind)) add(ERR, 'Актёр ' + nm + ': неизвестный вид «' + a.kind + '»', sel);
    if (a.kind === 'story') {
      if (!a.ref) add(ERR, 'Актёр ' + nm + ': не выбран персонаж проекта', sel);
      else if (projActors && !projActors.some((p) => p && p.id === a.ref)) add(ERR, 'Актёр ' + nm + ': в проекте нет персонажа «' + a.ref + '»', sel);
    }
    if (a.kind === 'valley' && (!Number.isInteger(a.who) || a.who < 0)) add(ERR, 'Актёр ' + nm + ': нужен номер жителя долины (who) — целое число от 0', sel);
    if (a.kind === 'entity' && !isResId(a.type)) add(ERR, 'Актёр ' + nm + ': тип сущности нужно писать вида minecraft:villager', sel);
    if (a.kind !== 'player' && !a.existing) {
      if (!a.spawn || !isPos(a.spawn.pos)) add(ERR, 'Актёр ' + nm + ': не задано, где он появится (место x y z)', sel);
    }
    if (a.existing && a.kind === 'entity') add(WARN, 'Актёр ' + nm + ': «уже есть в мире» для любой сущности ищет ближайшую такого типа — проверь, что найдётся нужная', sel);
  });

  // дорожки
  const tracks = Array.isArray(scene.tracks) ? scene.tracks : [];
  const seen = {};
  let camKeys = 0;
  tracks.forEach((tr, ti) => {
    if (!tr || !TRACK_KINDS.includes(tr.kind)) { add(ERR, 'Дорожка №' + (ti + 1) + ': неизвестный вид «' + (tr && tr.kind) + '»'); return; }
    const key = trackKeyOf(tr);
    if (seen[key]) add(WARN, 'Дорожка «' + key + '» встречается дважды — при открытии в Студии они сольются');
    seen[key] = true;
    let tname = TRACK_LABEL[tr.kind];
    if (tr.kind === 'actor') {
      const a = actors.find((x) => x && x.id === tr.actor);
      tname = 'Актёр «' + ((a && (a.name || a.id)) || tr.actor) + '»';
      if (!a) add(ERR, 'Дорожка актёра «' + tr.actor + '»: такого актёра нет в сцене — добавь его или удали дорожку');
    }
    const items = itemsOfTrack(tr);
    if (!Array.isArray(items)) { add(ERR, tname + ': список событий повреждён'); return; }
    let prevT = -Infinity;
    items.forEach((ev, i) => {
      const sel = { track: key, i };
      const verb = verbOf(tr.kind, ev);
      const vname = VERB_LABEL[verb] || verb;
      const where = tname + ' → «' + vname + '» (' + tsec(ev && ev.t) + ')';
      if (!ev || typeof ev !== 'object') { add(ERR, tname + ': событие №' + (i + 1) + ' повреждено', sel); return; }
      if (!isNum(ev.t) || ev.t < 0) add(ERR, where + ': время должно быть числом от 0', sel);
      else {
        if (isNum(len) && ev.t > len) add(WARN, where + ': стоит после конца сцены — не сыграет', sel);
        if (ev.t < prevT) add(WARN, where + ': идёт раньше предыдущего — при сборке порядок исправится сам', sel);
        prevT = ev.t;
      }
      if (tr.kind === 'camera') {
        camKeys++;
        if (!isPos(ev.pos)) add(ERR, where + ': не задано место камеры (x y z) — нажми «Взять вид из игры» или F8 в игре', sel);
        if (ev.fov !== undefined && ev.fov !== null && (!isNum(ev.fov) || ev.fov < 5 || ev.fov > 170)) add(WARN, where + ': угол обзора лучше от 5 до 170 (обычный — 70)', sel);
        if (ev.ease && !EASES.includes(ev.ease)) add(WARN, where + ': неизвестная плавность «' + ev.ease + '» — будет «плавно»', sel);
        if (!isTarget(ev.look, actorIds)) add(ERR, where + ': «смотреть на» — нет такого актёра или неверная точка', sel);
        if (ev.shake !== undefined && (!isNum(ev.shake) || ev.shake < 0)) add(WARN, where + ': дрожание — число от 0', sel);
        return;
      }
      if (tr.kind === 'subtitles') {
        if (!ev.text || !String(ev.text).trim()) add(ERR, where + ': пустой текст реплики', sel);
        else if (String(ev.text).length > SUB_MAX) add(WARN, where + ': длинная реплика (' + String(ev.text).length + ' знаков, лучше до ' + SUB_MAX + ') — разбей на две', sel);
        if (ev.ticks !== undefined && (!isNum(ev.ticks) || ev.ticks <= 0)) add(ERR, where + ': сколько показывать — число тиков больше нуля', sel);
        return;
      }
      const spec = VERBS[tr.kind][ev.do];
      if (!spec) { add(ERR, tname + ' (' + tsec(ev.t) + '): неизвестное действие «' + ev.do + '»', sel); return; }
      for (const f of spec.need) {
        const v = ev[f];
        const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
        if (empty) add(ERR, where + ': не заполнено поле «' + (ev.do === 'dialog' ? 'диалог' : (FIELD_LABEL[f] || f)) + '»', sel);
      }
      if (ev.ticks !== undefined && ev.ticks !== null && (!isNum(ev.ticks) || ev.ticks <= 0)) add(ERR, where + ': длительность — число тиков больше нуля', sel);
      if (isNum(ev.t) && isNum(ev.ticks) && isNum(len) && ev.t + ev.ticks > len + 1) add(WARN, where + ': заканчивается после конца сцены — обрежется', sel);
      if (ev.pos !== undefined && ev.pos !== null && !isPos(ev.pos)) add(ERR, where + ': место должно быть тремя числами x y z', sel);
      switch (ev.do) {
        case 'walk': {
          const p = Array.isArray(ev.path) ? ev.path : [];
          if (p.length && p.length < 2) add(ERR, where + ': в пути нужно минимум 2 точки — откуда и куда', sel);
          if (p.some((pt) => !isPos(pt))) add(ERR, where + ': точка пути должна быть тремя числами x y z', sel);
          if (ev.speed !== undefined && (!isNum(ev.speed) || ev.speed <= 0 || ev.speed > 3)) add(WARN, where + ': скорость лучше от 0.2 до 1.5', sel);
          const a = actors.find((x) => x && x.id === tr.actor);
          if (a && a.kind === 'player') add(WARN, where + ': игрок не умеет ходить по пути в сцене — используй «Переместить»', sel);
          break;
        }
        case 'say':
          if (ev.text && String(ev.text).length > SUB_MAX) add(WARN, where + ': длинная фраза (' + String(ev.text).length + ' знаков, лучше до ' + SUB_MAX + ')', sel);
          break;
        case 'look':
          if (!isTarget(ev.at, actorIds)) add(ERR, where + ': «на кого смотреть» — нет такого актёра или неверная точка', sel);
          break;
        case 'hold':
          if (ev.main && !isResId(ev.main)) add(ERR, where + ': предмет в правой руке пиши вида minecraft:lantern', sel);
          if (ev.off && !isResId(ev.off)) add(ERR, where + ': предмет в левой руке пиши вида minecraft:torch', sel);
          break;
        case 'particles':
          if (ev.name && !isResId(ev.name)) add(ERR, where + ': частицы пиши вида minecraft:flame', sel);
          if (ev.count !== undefined && (!Number.isInteger(ev.count) || ev.count < 1 || ev.count > 2000)) add(WARN, where + ': количество частиц лучше от 1 до 2000', sel);
          if (ev.spread !== undefined && ev.spread !== null && !isPos(ev.spread)) add(ERR, where + ': разброс — три числа x y z', sel);
          break;
        case 'sound':
        case 'music':
          if (ev.id && !isResId(ev.id)) add(ERR, where + ': id звука пиши вида minecraft:block.bell.use', sel);
          if (ev.vol !== undefined && (!isNum(ev.vol) || ev.vol < 0 || ev.vol > 10)) add(WARN, where + ': громкость лучше от 0 до 2', sel);
          if (ev.pitch !== undefined && (!isNum(ev.pitch) || ev.pitch < 0.5 || ev.pitch > 2)) add(WARN, where + ': высота звука в игре бывает от 0.5 до 2', sel);
          break;
        case 'shake':
          if (ev.power !== undefined && (!isNum(ev.power) || ev.power < 0 || ev.power > 5)) add(WARN, where + ': сила тряски лучше от 0 до 2', sel);
          break;
        case 'time':
          if (!isNum(ev.value) || ev.value < 0 || ev.value > 24000) add(ERR, where + ': время суток — число от 0 до 24000 (6000 — полдень, 13000 — ночь)', sel);
          break;
        case 'weather':
          if (!WEATHERS.includes(ev.value)) add(ERR, where + ': погода — ясно, дождь или гроза', sel);
          break;
        case 'block':
          if (ev.state && !/^[a-z0-9_.-]+:[a-z0-9_./-]+(\[[a-z0-9_=,]*\])?$/.test(ev.state)) add(ERR, where + ': блок пиши вида minecraft:oak_door[open=true] или minecraft:air', sel);
          break;
        case 'var':
          if (ev.name && !VAR_NAME.test(ev.name)) add(ERR, where + ': имя переменной — латиница, цифры, _ . -', sel);
          break;
        case 'dialog':
          if (ev.id && ctx.dialogIds && !ctx.dialogIds.includes(ev.id)) add(ERR, where + ': в проекте нет диалога «' + ev.id + '»', sel);
          if (ev.actor && !actorIds.includes(ev.actor)) add(ERR, where + ': говорящий «' + ev.actor + '» — такого актёра нет в сцене', sel);
          break;
        default:
      }
    });
  });
  if (!camKeys) add(WARN, 'Нет ни одного ключа камеры — сцена пойдёт глазами игрока. Поставь ключ: F8 в игре или правый клик по дорожке «Камера»');
  else if (camKeys === 1) add(WARN, 'Всего один ключ камеры — камера будет стоять на месте. Для пролёта нужно 2 и больше');
  return out;
}

// extra: { dialogs: [диалоги целиком], quests: [задания целиком] } — для «Собрать для игроков»
function validateProject(project, scenes, extra) {
  extra = extra || {};
  const out = [];
  const add = (sev, msg, scene) => out.push({ sev, msg, sel: null, scene: scene || null, kind: 'project' });
  const pa = project && Array.isArray(project.actors) ? project.actors : [];
  const ids = [];
  pa.forEach((a, i) => {
    const nm = '«' + ((a && (a.name || a.id)) || i + 1) + '»';
    if (!a || !isActorId(a.id)) add(ERR, 'Персонаж проекта ' + nm + ': id — только латиница, цифры, _ и -');
    else if (ids.includes(a.id)) add(ERR, 'Персонаж проекта ' + nm + ': id «' + a.id + '» повторяется');
    if (a) ids.push(a.id);
    if (a && a.base === 'valley' && (!Number.isInteger(a.who) || a.who < 0)) add(ERR, 'Персонаж проекта ' + nm + ': нужен номер жителя долины (who)');
    if (a && a.base === 'entity' && !isResId(a.type)) add(ERR, 'Персонаж проекта ' + nm + ': тип сущности пиши вида minecraft:villager');
  });
  out.push(...validateVars(project));
  const dialogs = (extra.dialogs || []).filter(Boolean);
  const quests = (extra.quests || []).filter(Boolean);
  const sids = (scenes || []).map((s) => s && s.id);
  const dctx = dialogs.map((d) => ({ id: d.id, nodes: d.nodes && typeof d.nodes === 'object' ? Object.keys(d.nodes) : [] }));
  const qctx = quests.map((q) => ({ id: q.id, steps: Array.isArray(q.steps) ? q.steps.map((st) => st && st.id) : [] }));
  const dialogIds = extra.dialogs ? dctx.map((d) => d.id) : null;
  for (const s of scenes || []) out.push(...validateScene(s, { project, ids: sids, dialogIds }).map((x) => ({ ...x, kind: 'scene', doc: x.scene })));
  const ctx = { project, scenes: sids, dialogs: dctx, quests: qctx };
  for (const d of dialogs) out.push(...validateDialog(d, { ...ctx, ids: dctx.map((x) => x.id) }));
  for (const q of quests) out.push(...validateQuest(q, { ...ctx, ids: qctx.map((x) => x.id) }));
  return out;
}

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (k[0] !== '_' && v[k] !== undefined) o[k] = strip(v[k]);
    return o;
  }
  return v;
}
// убрать служебные поля редактора (начинаются с _), ничего не меняя по смыслу — так сцена сохраняется в проект
// сохранение: для сцен из объектов рядом пишутся и сгенерированные дорожки (игра в режиме разработчика читает файл как есть)
function cleanScene(scene) { return strip(hasObjects(scene) ? sceneForDisk(scene) : scene); }
function cleanProject(p) { return strip(p); }

const DEFAULT_UI = { hud: true, markers: true, chat: false };
function defaultProject() { return { v: 1, name: 'Мой сюжет', actors: [], vars: [], templates: [], talkPriority: 0, ui: { ...DEFAULT_UI } }; }

function defaultScene(id, title) {
  return {
    v: 1, id, title: title || id, note: '',
    world: { dim: 'minecraft:overworld', anchor: null },
    preload: { radius: 3, alongCamera: true, extra: [] },
    options: { letterbox: true, hideHud: true, lockInput: true, skippable: true, music: null, endPlayer: { mode: 'back' } },
    actors: [], length: 200,
    tracks: [{ kind: 'camera', keys: [] }]
  };
}

// Нормализация для игроков: целые тики, события по порядку, без пустых дорожек и служебных полей.
function dropGen(v) {
  if (Array.isArray(v)) return v.map(dropGen);
  if (v && typeof v === 'object') { const o = { ...v }; if (o.gen === true) { delete o.gen; delete o.src; } return o; }
  return v;
}
function normalizeScene(scene) {
  const s = strip(hasObjects(scene) ? compileScene(scene) : scene);
  if (Array.isArray(s.tracks)) s.tracks = s.tracks.map((tr) => { const c = dropGen(tr); if (Array.isArray(c.keys)) c.keys = c.keys.map(dropGen); if (Array.isArray(c.events)) c.events = c.events.map(dropGen); return c; });
  const d = defaultScene(s.id, s.title);
  const out = {
    v: 1, id: s.id, title: s.title || s.id,
    world: { ...d.world, ...(s.world || {}) },
    preload: { ...d.preload, ...(s.preload || {}) },
    options: { ...d.options, ...(s.options || {}), endPlayer: { ...d.options.endPlayer, ...((s.options || {}).endPlayer || {}) } },
    actors: (s.actors || []).map((a) => ({ despawnAtEnd: true, existing: false, ...a })),
    length: Math.max(1, Math.round(s.length || 1)),
    tracks: []
  };
  if (s.note) out.note = s.note;
  // фаза 3: светильники (игра ставит блоки света сама и возвращает всё в конце сцены)
  if (Array.isArray(s.objects) && s.objects.length) out.objects = s.objects.map(dropGen);
  const merged = {};
  for (const tr of s.tracks || []) {
    if (!tr || !TRACK_KINDS.includes(tr.kind)) continue;
    const key = trackKeyOf(tr);
    if (!merged[key]) { merged[key] = { ...tr }; delete merged[key].keys; delete merged[key].events; merged[key]._items = []; out.tracks.push(merged[key]); }
    merged[key]._items.push(...itemsOfTrack(tr));
  }
  out.tracks = out.tracks.map((tr) => {
    const items = tr._items.map((e) => ({ ...e, t: Math.max(0, Math.round(e.t || 0)) }));
    items.sort((a, b) => a.t - b.t);
    const o = { ...tr };
    delete o._items;
    if (tr.kind === 'camera') o.keys = items; else o.events = items;
    return o;
  }).filter((tr) => itemsOfTrack(tr).length);
  return out;
}

function normalizeProject(p) {
  const s = strip(p || {});
  return { v: 1, name: s.name || 'Сюжет', actors: s.actors || [], vars: (s.vars || []).map((v) => ({ scope: 'world', ...v })), templates: s.templates || [], talkPriority: isNum(s.talkPriority) ? s.talkPriority : 0, ui: { ...DEFAULT_UI, ...(s.ui || {}) } };
}

// ======================= Фаза 2: диалоги, задания, переменные =======================

const VAR_TYPES = ['bool', 'int', 'text'];
const OPS = ['==', '!=', '>', '<', '>=', '<='];
const NODE_TYPES = ['line', 'choice', 'cond', 'action', 'scene', 'jump', 'end'];
const NODE_LABEL = { line: 'Реплика', choice: 'Выбор', cond: 'Условие', action: 'Действие', scene: 'Сцена', jump: 'Переход', end: 'Конец' };
const TRIGGERS = ['talk', 'scene', 'quest', 'command'];
const COND_KINDS = ['var', 'quest', 'item', 'trust', 'time', 'memory', 'chance', 'not', 'any', 'all'];
const COND_LABEL = { var: 'Переменная', quest: 'Задание', item: 'Есть предмет', trust: 'Доверие', time: 'Время суток', memory: 'Память жителя', chance: 'Случайно', not: 'НЕ (наоборот)', any: 'Любое из', all: 'Все из' };
// порядок важен: { trust, add } — это доверие, а не «прибавить к переменной»
const ACTION_KINDS = ['trust', 'set', 'add', 'give', 'take', 'memory', 'quest', 'scene', 'dialog', 'sound', 'xp', 'command'];
const ACTION_LABEL = { set: 'Записать переменную', add: 'Прибавить к переменной', give: 'Дать предмет', take: 'Забрать предмет', trust: 'Доверие', memory: 'Запомнить факт', quest: 'Задание', scene: 'Сцена', dialog: 'Открыть диалог', sound: 'Звук', xp: 'Опыт', command: 'Команда' };
const QUEST_STATES = ['not_started', 'active', 'done', 'failed'];
const QUEST_OPS = ['start', 'advance', 'complete', 'fail'];
const GOAL_TYPES = ['item', 'talk', 'reach', 'kill', 'wait', 'var', 'scene', 'none'];
const GOAL_LABEL = { item: 'Принести предмет', talk: 'Поговорить', reach: 'Дойти до места', kill: 'Победить мобов', wait: 'Дождаться', var: 'Условие', scene: 'Посмотреть сцену', none: 'Без цели' };
const VAR_SCOPES = ['world', 'player'];
const TEXT_MAX = 300;
const DOC_ID = /^[a-z0-9_-]{1,64}$/;
const NODE_ID = /^[A-Za-z0-9_-]{1,40}$/;

function isDocId(s) { return typeof s === 'string' && DOC_ID.test(s); }
function isVarName(s) { return typeof s === 'string' && VAR_NAME.test(s); }
function condKind(c) { if (!c || typeof c !== 'object' || Array.isArray(c)) return null; for (const k of COND_KINDS) if (k in c) return k; return null; }
function actionKind(a) { if (!a || typeof a !== 'object' || Array.isArray(a)) return null; for (const k of ACTION_KINDS) if (k in a) return k; return null; }
// выходы узла диалога: [{ key, label }] — key: 'next' | 'then' | 'else' | 'opt:<i>'
function nodeOutputs(n) {
  if (!n) return [];
  switch (n.type) {
    case 'line': case 'action': case 'scene': return [{ key: 'next', label: 'дальше' }];
    case 'cond': return [{ key: 'then', label: 'да' }, { key: 'else', label: 'нет' }];
    case 'choice': return (Array.isArray(n.options) ? n.options : []).map((o, i) => ({ key: 'opt:' + i, label: (o && o.text) || 'вариант ' + (i + 1) }));
    default: return [];
  }
}
function getOut(n, key) {
  if (!n) return null;
  if (key.startsWith('opt:')) { const o = (n.options || [])[Number(key.slice(4))]; return o ? o.next || null : null; }
  return n[key] || null;
}
function setOut(n, key, target) {
  const c = { ...n };
  if (key.startsWith('opt:')) {
    const i = Number(key.slice(4));
    c.options = (c.options || []).map((o, j) => { if (j !== i) return o; const x = { ...o }; if (target) x.next = target; else delete x.next; return x; });
  } else if (target) c[key] = target; else delete c[key];
  return c;
}
// «end» в next — конец диалога, даже если узла с таким id нет
function isEndRef(id, nodes) { return id === 'end' && !(nodes && nodes.end && nodes.end.type !== 'end'); }

function refsOf(ctx) {
  ctx = ctx || {};
  const p = ctx.project || null;
  const pick = (arr, f) => (Array.isArray(arr) ? arr.map((x) => (typeof x === 'string' ? { id: x } : x)).filter((x) => x && x.id) : null);
  const dl = pick(ctx.dialogs);
  const ql = pick(ctx.quests);
  const vars = p && Array.isArray(p.vars) ? {} : null;
  if (vars) for (const v of p.vars) if (v && v.name) vars[v.name] = v.type || 'text';
  return {
    actors: p && Array.isArray(p.actors) ? p.actors.map((a) => a && a.id) : null,
    vars,
    scenes: Array.isArray(ctx.scenes) ? ctx.scenes.map((x) => (typeof x === 'string' ? x : x && x.id)) : null,
    dialogs: dl ? Object.fromEntries(dl.map((d) => [d.id, Array.isArray(d.nodes) ? d.nodes : null])) : null,
    quests: ql ? Object.fromEntries(ql.map((q) => [q.id, Array.isArray(q.steps) ? q.steps.map((x) => (typeof x === 'string' ? x : x && x.id)) : null])) : null
  };
}
function typeOfValue(v) { return typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'int' : 'text'; }
const TYPE_RU = { bool: 'да/нет', int: 'число', text: 'текст' };

function checkSpeaker(s, R, allowAny) {
  if (s === 'any') return allowAny ? null : 'тут нужен конкретный персонаж, а не «любой»';
  if (typeof s !== 'string' || !s) return 'не выбран';
  if (s.startsWith('actor:')) return R.actors && !R.actors.includes(s.slice(6)) ? 'в проекте нет персонажа «' + s.slice(6) + '»' : null;
  if (/^valley:\d+$/.test(s)) return null;
  if (/^name:.+/.test(s)) return null;
  return 'непонятно, кто это («' + s + '») — нужно actor:id, valley:номер, name:Имя или any';
}

function checkCond(c, where, add, R, sel) {
  const k = condKind(c);
  const w = where + ' → условие «' + (COND_LABEL[k] || '?') + '»';
  switch (k) {
    case null: add(ERR, where + ': непонятное условие', sel); return;
    case 'var':
      if (!isVarName(c.var)) { add(ERR, w + ': имя переменной — латиница, цифры, _ . -', sel); return; }
      if (c.op !== undefined && !OPS.includes(c.op)) add(ERR, w + ': сравнение «' + c.op + '» — бывает ==, !=, >, <, >=, <=', sel);
      if (c.value === null || c.value === '') add(ERR, w + ' «' + c.var + '»: не задано, с чем сравнивать', sel);
      if (R.vars) {
        const t = R.vars[c.var];
        if (!t) add(WARN, w + ': переменная «' + c.var + '» не заведена во вкладке «Переменные»', sel);
        else if (c.value === undefined && t !== 'bool') add(WARN, w + ' «' + c.var + '»: без значения проверяется «= да», а переменная — ' + TYPE_RU[t], sel);
        else if (c.value !== undefined && c.value !== null && typeOfValue(c.value) !== t) add(WARN, w + ' «' + c.var + '»: переменная — ' + TYPE_RU[t] + ', а сравнивается с ' + TYPE_RU[typeOfValue(c.value)], sel);
        else if (t !== 'int' && ['>', '<', '>=', '<='].includes(c.op)) add(WARN, w + ' «' + c.var + '»: больше/меньше имеет смысл только для чисел', sel);
      }
      return;
    case 'quest':
      if (!isDocId(c.quest)) { add(ERR, w + ': не выбрано задание', sel); return; }
      if (R.quests && !(c.quest in R.quests)) add(ERR, w + ': в проекте нет задания «' + c.quest + '»', sel);
      if (c.state !== undefined && !QUEST_STATES.includes(c.state)) add(ERR, w + ': состояние «' + c.state + '» — бывает не начато / идёт / сделано / провалено', sel);
      if (c.step && R.quests && R.quests[c.quest] && !R.quests[c.quest].includes(c.step)) add(ERR, w + ': в задании «' + c.quest + '» нет шага «' + c.step + '»', sel);
      return;
    case 'item':
      if (!isResId(c.item)) add(ERR, w + ': предмет пиши вида minecraft:bread', sel);
      if (c.count !== undefined && (!Number.isInteger(c.count) || c.count < 1)) add(ERR, w + ': количество — целое число от 1', sel);
      return;
    case 'trust':
      if (!c.trust) add(ERR, w + ': не выбран персонаж', sel);
      else if (R.actors && !R.actors.includes(c.trust)) add(WARN, w + ': в проекте нет персонажа «' + c.trust + '»', sel);
      if (c.op !== undefined && !OPS.includes(c.op)) add(ERR, w + ': неизвестное сравнение «' + c.op + '»', sel);
      if (!isNum(c.value)) add(ERR, w + ': доверие сравнивается с числом', sel);
      return;
    case 'time': if (!['day', 'night'].includes(c.time)) add(ERR, w + ': время — день или ночь', sel); return;
    case 'memory': if (!c.memory || !String(c.memory).trim()) add(ERR, w + ': не написан факт памяти', sel); return;
    case 'chance': if (!isNum(c.chance) || c.chance < 0 || c.chance > 1) add(ERR, w + ': шанс — число от 0 до 1 (0.3 = 30%)', sel); return;
    case 'not': if (!c.not || typeof c.not !== 'object') add(ERR, w + ': внутри пусто', sel); else checkCond(c.not, where + ' → НЕ', add, R, sel); return;
    case 'any':
      if (!Array.isArray(c.any) || !c.any.length) add(ERR, w + ': список пуст', sel);
      else c.any.forEach((x) => checkCond(x, where + ' → любое из', add, R, sel));
      return;
    case 'all':
      if (!Array.isArray(c.all) || !c.all.length) add(ERR, w + ': список пуст', sel);
      else c.all.forEach((x) => checkCond(x, where + ' → все из', add, R, sel));
      return;
    default:
  }
}
function checkConds(list, where, add, R, sel) {
  if (list === undefined || list === null) return;
  if (!Array.isArray(list)) { add(ERR, where + ': список условий повреждён', sel); return; }
  list.forEach((c) => checkCond(c, where, add, R, sel));
}
function checkAction(a, where, add, R, sel) {
  const k = actionKind(a);
  const w = where + ' → «' + (ACTION_LABEL[k] || '?') + '»';
  switch (k) {
    case null: add(ERR, where + ': непонятное действие', sel); return;
    case 'set': case 'add': {
      const name = a[k];
      if (!isVarName(name)) { add(ERR, w + ': имя переменной — латиница, цифры, _ . -', sel); return; }
      if (a.value === undefined || a.value === null || a.value === '') add(ERR, w + ' «' + name + '»: не задано значение', sel);
      if (k === 'add' && a.value !== undefined && !isNum(a.value)) add(ERR, w + ' «' + name + '»: прибавлять можно только число', sel);
      if (R.vars) {
        const t = R.vars[name];
        if (!t) add(WARN, w + ': переменная «' + name + '» не заведена во вкладке «Переменные»', sel);
        else if (k === 'add' && t !== 'int') add(WARN, w + ' «' + name + '»: прибавлять можно к числу, а переменная — ' + TYPE_RU[t], sel);
        else if (k === 'set' && a.value !== undefined && a.value !== null && typeOfValue(a.value) !== t) add(WARN, w + ' «' + name + '»: переменная — ' + TYPE_RU[t] + ', а записывается ' + TYPE_RU[typeOfValue(a.value)], sel);
      }
      return;
    }
    case 'give': case 'take':
      if (!isResId(a[k])) add(ERR, w + ': предмет пиши вида minecraft:bread', sel);
      if (a.count !== undefined && (!Number.isInteger(a.count) || a.count < 1 || a.count > 6400)) add(ERR, w + ': количество — целое число от 1', sel);
      return;
    case 'trust':
      if (!a.trust) add(ERR, w + ': не выбран персонаж', sel);
      else if (R.actors && !R.actors.includes(a.trust)) add(WARN, w + ': в проекте нет персонажа «' + a.trust + '»', sel);
      if (!isNum(a.add)) add(ERR, w + ': сколько прибавить — число (можно минус)', sel);
      return;
    case 'memory': if (!a.memory || !String(a.memory).trim()) add(ERR, w + ': не написан факт', sel); return;
    case 'quest':
      if (!isDocId(a.quest)) { add(ERR, w + ': не выбрано задание', sel); return; }
      if (R.quests && !(a.quest in R.quests)) add(ERR, w + ': в проекте нет задания «' + a.quest + '»', sel);
      if (!QUEST_OPS.includes(a.do)) add(ERR, w + ': что сделать с заданием — начать / продвинуть / завершить / провалить', sel);
      if (a.step && R.quests && R.quests[a.quest] && !R.quests[a.quest].includes(a.step)) add(ERR, w + ': в задании «' + a.quest + '» нет шага «' + a.step + '»', sel);
      return;
    case 'scene':
      if (!isDocId(a.scene)) add(ERR, w + ': не выбрана сцена', sel);
      else if (R.scenes && !R.scenes.includes(a.scene)) add(ERR, w + ': в проекте нет сцены «' + a.scene + '»', sel);
      return;
    case 'dialog':
      if (!isDocId(a.dialog)) add(ERR, w + ': не выбран диалог', sel);
      else if (R.dialogs && !(a.dialog in R.dialogs)) add(ERR, w + ': в проекте нет диалога «' + a.dialog + '»', sel);
      return;
    case 'sound':
      if (!isResId(a.sound)) add(ERR, w + ': id звука пиши вида minecraft:entity.player.levelup', sel);
      if (a.vol !== undefined && (!isNum(a.vol) || a.vol < 0 || a.vol > 10)) add(WARN, w + ': громкость лучше от 0 до 2', sel);
      if (a.pitch !== undefined && (!isNum(a.pitch) || a.pitch < 0.5 || a.pitch > 2)) add(WARN, w + ': высота звука бывает от 0.5 до 2', sel);
      return;
    case 'xp': if (!Number.isInteger(a.xp) || a.xp === 0) add(ERR, w + ': опыт — целое число (можно минус)', sel); return;
    case 'command':
      if (!a.command || !String(a.command).trim()) add(ERR, w + ': команда пустая', sel);
      else add(WARN, w + ': команда сервера выполнится с правами оператора — проверь её в игре', sel);
      return;
    default:
  }
}
function checkActions(list, where, add, R, sel) {
  if (list === undefined || list === null) return;
  if (!Array.isArray(list)) { add(ERR, where + ': список действий повреждён', sel); return; }
  list.forEach((a) => checkAction(a, where, add, R, sel));
}
function checkText(t, where, add, R, sel, required) {
  const s = t == null ? '' : String(t);
  if (!s.trim()) { if (required) add(ERR, where + ': пустой текст', sel); return; }
  if (s.length > TEXT_MAX) add(WARN, where + ': длинный текст (' + s.length + ' знаков, лучше до ' + TEXT_MAX + ') — раздели на две реплики', sel);
  for (const m of s.matchAll(/\{([^}]*)\}/g)) {
    const inner = m[1];
    if (inner === 'player') continue;
    if (inner.startsWith('var:')) { const n = inner.slice(4); if (R.vars && !(n in R.vars)) add(WARN, where + ': в тексте {var:' + n + '} — такой переменной нет', sel); continue; }
    add(WARN, where + ': непонятная подстановка {' + inner + '} — бывает {player} и {var:имя}', sel);
  }
}

// Проверка диалога. ctx: { project, ids: [id диалогов], dialogs: [{id, nodes:[id узлов]}], scenes: [id], quests: [{id, steps:[id]}] }
function validateDialog(d, ctx) {
  ctx = ctx || {};
  const out = [];
  const did = d && d.id;
  const add = (sev, msg, sel) => out.push({ sev, msg, sel: sel || null, kind: 'dialog', doc: did || null });
  if (!d || typeof d !== 'object') { add(ERR, 'Диалог пустой или повреждён'); return out; }
  const R = refsOf(ctx);
  if (!isDocId(d.id)) add(ERR, 'Имя файла диалога (id) — маленькие латинские буквы, цифры, _ и -');
  if (ctx.ids && ctx.ids.filter((x) => x === d.id).length > 1) add(ERR, 'Диалог с именем «' + d.id + '» уже есть');
  if (!d.title || !String(d.title).trim()) add(WARN, 'У диалога нет названия — так его трудно искать');
  const sp = checkSpeaker(d.speaker, R, true);
  if (sp) add(ERR, 'Кто говорит: ' + sp);
  const tr = d.trigger || {};
  if (tr.on !== undefined && !TRIGGERS.includes(tr.on)) add(ERR, 'Запуск: непонятно когда («' + tr.on + '»)');
  if (tr.priority !== undefined && !isNum(tr.priority)) add(ERR, 'Запуск: важность — число');
  checkConds(tr.when, 'Условия запуска', add, R, null);
  if (tr.topic !== undefined && tr.topic !== null && typeof tr.topic !== 'string') add(ERR, 'Тема в разговоре — текст');
  if (tr.topic && String(tr.topic).length > 40) add(WARN, 'Тема в разговоре длинная (' + String(tr.topic).length + ' знаков) — в списке тем лучше до 40');
  if (tr.on === 'talk' && d.speaker === 'any' && !(Array.isArray(tr.when) && tr.when.length)) add(WARN, 'Диалог откроется у ЛЮБОГО жителя при разговоре — добавь условие запуска или выбери, кто говорит');
  const nodes = d.nodes && typeof d.nodes === 'object' && !Array.isArray(d.nodes) ? d.nodes : null;
  if (!nodes || !Object.keys(nodes).length) { add(ERR, 'В диалоге нет ни одного узла'); return out; }
  if (!d.start) add(ERR, 'Не выбран первый узел (старт)');
  else if (!nodes[d.start]) add(ERR, 'Старт указывает на узел «' + d.start + '», которого нет');
  const link = (id, where, sel, need) => {
    if (id === undefined || id === null || id === '') { if (need) add(need === 'warn' ? WARN : ERR, where + ': никуда не ведёт' + (need === 'warn' ? ' — тут диалог закончится (соедини с «Концом», если так задумано)' : ' — протяни стрелку к следующему узлу'), sel); return; }
    if (isEndRef(id, nodes)) return;
    if (!nodes[id]) add(ERR, where + ': ведёт к узлу «' + id + '», которого нет', sel);
  };
  for (const [id, n] of Object.entries(nodes)) {
    const sel = { node: id };
    if (!n || typeof n !== 'object') { add(ERR, 'Узел «' + id + '» повреждён', sel); continue; }
    const where = (NODE_LABEL[n.type] || 'Узел') + ' «' + id + '»';
    if (!NODE_ID.test(id)) add(ERR, where + ': id узла — латиница, цифры, _ и -', sel);
    switch (n.type) {
      case 'line':
        checkText(n.text, where, add, R, sel, true);
        if (n.who && n.who !== 'speaker' && n.who !== 'player') { const e = checkSpeaker(n.who, R, false); if (e) add(ERR, where + ': кто говорит — ' + e, sel); }
        link(n.next, where, sel, 'warn');
        break;
      case 'choice': {
        if (n.text) checkText(n.text, where, add, R, sel, false);
        const opts = Array.isArray(n.options) ? n.options : [];
        if (!opts.length) add(ERR, where + ': нет ни одного варианта ответа', sel);
        if (opts.length > 6) add(WARN, where + ': ' + opts.length + ' вариантов — в окне поместится 6, лучше разбить', sel);
        opts.forEach((o, i) => {
          const w = where + ', вариант ' + (i + 1);
          if (!o || typeof o !== 'object') { add(ERR, w + ': повреждён', sel); return; }
          checkText(o.text, w, add, R, sel, true);
          checkConds(o.when, w, add, R, sel);
          checkActions(o.do, w + ' → при выборе', add, R, sel);
          link(o.next, w, sel, 'err');
        });
        if (opts.length && opts.every((o) => o && Array.isArray(o.when) && o.when.length)) add(WARN, where + ': у всех вариантов есть условия — может случиться, что выбрать нечего', sel);
        break;
      }
      case 'cond':
        if (!Array.isArray(n.if) || !n.if.length) add(ERR, where + ': не задано, что проверять', sel);
        checkConds(n.if, where, add, R, sel);
        link(n.then, where + ' → «да»', sel, 'err');
        link(n.else, where + ' → «нет»', sel, 'warn');
        break;
      case 'action':
        if (!Array.isArray(n.do) || !n.do.length) add(ERR, where + ': нет ни одного действия', sel);
        checkActions(n.do, where, add, R, sel);
        link(n.next, where, sel, 'warn');
        break;
      case 'scene':
        if (!isDocId(n.scene)) add(ERR, where + ': не выбрана сцена', sel);
        else if (R.scenes && !R.scenes.includes(n.scene)) add(ERR, where + ': в проекте нет сцены «' + n.scene + '»', sel);
        link(n.next, where, sel, null);
        break;
      case 'jump':
        if (!isDocId(n.dialog)) add(ERR, where + ': не выбран диалог, куда перейти', sel);
        else if (R.dialogs && !(n.dialog in R.dialogs)) add(ERR, where + ': в проекте нет диалога «' + n.dialog + '»', sel);
        else if (n.node && R.dialogs && R.dialogs[n.dialog] && !R.dialogs[n.dialog].includes(n.node)) add(ERR, where + ': в диалоге «' + n.dialog + '» нет узла «' + n.node + '»', sel);
        if (n.dialog === d.id && (!n.node || n.node === d.start)) add(WARN, where + ': переход в начало этого же диалога — проверь, что это не бесконечный круг', sel);
        break;
      case 'end': break;
      default: add(ERR, 'Узел «' + id + '»: неизвестный вид «' + n.type + '»', sel);
    }
  }
  // недостижимые узлы
  if (d.start && nodes[d.start]) {
    const seen = new Set([d.start]);
    const q = [d.start];
    while (q.length) {
      const n = nodes[q.shift()];
      for (const o of nodeOutputs(n)) { const t = getOut(n, o.key); if (t && nodes[t] && !seen.has(t)) { seen.add(t); q.push(t); } }
    }
    for (const id of Object.keys(nodes)) if (!seen.has(id)) add(WARN, (NODE_LABEL[nodes[id] && nodes[id].type] || 'Узел') + ' «' + id + '»: до него не дойти от старта — в игре его не увидят', { node: id });
  }
  return out;
}

function describeGoal(g) {
  if (!g || typeof g !== 'object') return '?';
  switch (g.type) {
    case 'item': return 'принести ' + (g.count || 1) + ' × ' + String(g.item || '?').replace(/^minecraft:/, '');
    case 'talk': return 'поговорить: ' + String(g.speaker || '?').replace(/^(actor|name|valley):/, '');
    case 'reach': return 'дойти до ' + (isPos(g.pos) ? g.pos.map((n) => Math.round(n)).join(' ') : '?');
    case 'kill': return 'победить ' + (g.count || 1) + ' × ' + String(g.entity || '?').replace(/^minecraft:/, '');
    case 'wait': return g.until === 'ticks' ? 'подождать ' + (Math.round((g.ticks || 0) / 2) / 10) + ' с' : 'дождаться ' + (g.until === 'day' ? 'дня' : 'ночи');
    case 'var': return 'условие (' + ((g.cond || []).length) + ')';
    case 'scene': return 'сцена ' + (g.scene || '?');
    case 'none': return 'засчитывается действием «Задание → продвинуть»';
    default: return '?';
  }
}

// Проверка задания. ctx — как у диалога (ids — id заданий)
function validateQuest(q, ctx) {
  ctx = ctx || {};
  const out = [];
  const qid = q && q.id;
  const add = (sev, msg, sel) => out.push({ sev, msg, sel: sel || null, kind: 'quest', doc: qid || null });
  if (!q || typeof q !== 'object') { add(ERR, 'Задание пустое или повреждено'); return out; }
  const R = refsOf(ctx);
  if (R.quests && isDocId(q.id) && Array.isArray(q.steps)) R.quests[q.id] = q.steps.map((s) => s && s.id); // свои шаги — всегда свежие
  if (!isDocId(q.id)) add(ERR, 'Имя файла задания (id) — маленькие латинские буквы, цифры, _ и -');
  if (ctx.ids && ctx.ids.filter((x) => x === q.id).length > 1) add(ERR, 'Задание с именем «' + q.id + '» уже есть');
  if (!q.title || !String(q.title).trim()) add(ERR, 'У задания нет названия — его видит игрок в журнале');
  if (q.giver) { const e = checkSpeaker(q.giver, R, false); if (e) add(ERR, 'Кто даёт задание: ' + e); }
  const st = q.start || {};
  checkConds(st.when, 'Условия старта', add, R, { head: true });
  if (st.auto && !(Array.isArray(st.when) && st.when.length)) add(WARN, 'Задание начнётся само сразу у всех игроков — добавь условие старта, если так не задумано', { head: true });
  const steps = Array.isArray(q.steps) ? q.steps : [];
  if (!steps.length) add(ERR, 'В задании нет ни одного шага');
  const ids = [];
  steps.forEach((s, i) => {
    const sel = { step: i };
    if (!s || typeof s !== 'object') { add(ERR, 'Шаг ' + (i + 1) + ' повреждён', sel); return; }
    const where = 'Шаг ' + (i + 1) + (s.title ? ' «' + s.title + '»' : '');
    if (!s.id || !NODE_ID.test(s.id)) add(ERR, where + ': id шага — латиница, цифры, _ и -', sel);
    else if (ids.includes(s.id)) add(ERR, where + ': id «' + s.id + '» повторяется — у шагов должны быть разные id', sel);
    ids.push(s.id);
    if (!s.title || !String(s.title).trim()) add(ERR, where + ': нет текста цели — его видит игрок', sel);
    const g = s.goal || {};
    const gw = where + ' (' + (GOAL_LABEL[g.type] || 'цель') + ')';
    switch (g.type) {
      case 'item':
        if (!isResId(g.item)) add(ERR, gw + ': предмет пиши вида minecraft:bread', sel);
        if (!Number.isInteger(g.count) || g.count < 1) add(ERR, gw + ': сколько — целое число от 1', sel);
        break;
      case 'talk': {
        const e = checkSpeaker(g.speaker, R, false);
        if (e) add(ERR, gw + ': с кем — ' + e, sel);
        if (g.dialog && R.dialogs && !(g.dialog in R.dialogs)) add(ERR, gw + ': в проекте нет диалога «' + g.dialog + '»', sel);
        break;
      }
      case 'reach':
        if (!isPos(g.pos)) add(ERR, gw + ': не задано место (x y z) — «Взять из игры»', sel);
        if (g.dim && !isResId(g.dim)) add(ERR, gw + ': измерение пиши вида minecraft:overworld', sel);
        if (g.radius !== undefined && (!isNum(g.radius) || g.radius <= 0)) add(ERR, gw + ': радиус — число больше нуля (без него — 4)', sel);
        break;
      case 'kill':
        if (!isResId(g.entity)) add(ERR, gw + ': моба пиши вида minecraft:zombie', sel);
        if (!Number.isInteger(g.count) || g.count < 1) add(ERR, gw + ': сколько — целое число от 1', sel);
        break;
      case 'wait':
        if (!['day', 'night', 'ticks'].includes(g.until)) add(ERR, gw + ': чего ждать — день, ночь или время', sel);
        if (g.until === 'ticks' && (!Number.isInteger(g.ticks) || g.ticks <= 0)) add(ERR, gw + ': сколько ждать — тики больше нуля (20 = 1 с)', sel);
        break;
      case 'var':
        if (!Array.isArray(g.cond) || !g.cond.length) add(ERR, gw + ': не задано условие', sel);
        checkConds(g.cond, gw, add, R, sel);
        break;
      case 'scene':
        if (!isDocId(g.scene)) add(ERR, gw + ': не выбрана сцена', sel);
        else if (R.scenes && !R.scenes.includes(g.scene)) add(ERR, gw + ': в проекте нет сцены «' + g.scene + '»', sel);
        break;
      case 'none': break;
      default: add(ERR, where + ': не выбран вид цели', sel);
    }
    if (s.marker && !isPos(s.marker.pos)) add(ERR, where + ': метка на месте без координат', sel);
    if (s.dialog && R.dialogs && !(s.dialog in R.dialogs)) add(ERR, where + ': диалог по завершении «' + s.dialog + '» не найден', sel);
    checkActions(s.onDone, where + ' → по завершении', add, R, sel);
  });
  checkActions(q.rewards, 'Награда', add, R, { rewards: true });
  return out;
}

function validateVars(project) {
  const out = [];
  const add = (sev, msg, i) => out.push({ sev, msg, sel: i == null ? null : { v: i }, kind: 'vars', doc: null });
  const vars = project && Array.isArray(project.vars) ? project.vars : [];
  if (project && project.talkPriority !== undefined && !isNum(project.talkPriority)) out.push({ sev: ERR, msg: 'Проект: важность обычных разговоров — число', sel: null, kind: 'vars', doc: null });
  const seen = [];
  vars.forEach((v, i) => {
    if (!v || typeof v !== 'object') { add(ERR, 'Переменная №' + (i + 1) + ' повреждена', i); return; }
    const nm = '«' + (v.name || '№' + (i + 1)) + '»';
    if (!isVarName(v.name)) add(ERR, 'Переменная ' + nm + ': имя — латиница, цифры, _ . -', i);
    else if (seen.includes(v.name)) add(ERR, 'Переменная ' + nm + ' заведена дважды', i);
    seen.push(v.name);
    if (v.scope !== undefined && !VAR_SCOPES.includes(v.scope)) add(ERR, 'Переменная ' + nm + ': чья — «мира» или «игрока»', i);
    if (!VAR_TYPES.includes(v.type)) add(ERR, 'Переменная ' + nm + ': тип — да/нет, число или текст', i);
    else if (v.init !== undefined && v.init !== null && typeOfValue(v.init) !== v.type) add(ERR, 'Переменная ' + nm + ': начальное значение не того типа (нужно ' + TYPE_RU[v.type] + ')', i);
    else if (v.type === 'int' && !Number.isInteger(v.init)) add(WARN, 'Переменная ' + nm + ': число лучше целое', i);
  });
  return out;
}
function varDefault(type) { return type === 'bool' ? false : type === 'int' ? 0 : ''; }

function defaultDialog(id, title) {
  return {
    v: 1, id, title: title || id, note: '', speaker: 'any',
    trigger: { on: 'talk', when: [], once: false, priority: 10 },
    start: 'n1',
    nodes: {
      n1: { type: 'line', who: 'speaker', text: 'Привет, {player}!', next: 'n2', x: 40, y: 60 },
      n2: { type: 'choice', text: '', options: [{ text: 'Привет!', next: 'end' }, { text: 'Пока.', next: 'end' }], x: 320, y: 60 },
      end: { type: 'end', x: 600, y: 80 }
    }
  };
}
function defaultQuest(id, title) {
  return {
    v: 1, id, title: title || id, desc: '', giver: null, start: { auto: false, when: [] },
    steps: [{ id: 's1', title: 'Принеси 3 хлеба', goal: { type: 'item', item: 'minecraft:bread', count: 3, consume: true }, marker: null, onDone: [] }],
    rewards: [{ xp: 10 }], repeatable: false, journal: true
  };
}
function cleanDoc(d) { return strip(d); }
// для игроков: без служебных полей, координаты узлов округлены (игра их не читает — только Студия)
function normalizeDialog(d) {
  const s = strip(d);
  const nodes = {};
  for (const [id, n] of Object.entries(s.nodes || {})) {
    if (!n || typeof n !== 'object') continue;
    const c = { ...n };
    if (isNum(c.x)) c.x = Math.round(c.x); if (isNum(c.y)) c.y = Math.round(c.y);
    nodes[id] = c;
  }
  return { v: 1, id: s.id, title: s.title || s.id, speaker: s.speaker || 'any', trigger: { on: 'talk', when: [], once: false, priority: 10, ...(s.trigger || {}) }, start: s.start, nodes };
}
function normalizeQuest(q) {
  const s = strip(q);
  return {
    v: 1, id: s.id, title: s.title || s.id, desc: s.desc || '', giver: s.giver || null,
    start: { auto: false, when: [], ...(s.start || {}) },
    steps: (s.steps || []).map((st) => ({ onDone: [], marker: null, ...st })),
    rewards: s.rewards || [], repeatable: !!s.repeatable, journal: s.journal !== false
  };
}

return { ERR, WARN, TRACK_KINDS, ACTOR_KINDS, EASES, WEATHERS, END_MODES, SUB_MAX, VERBS, TRACK_LABEL, VERB_LABEL, FIELD_LABEL, isResId, isSceneId, isActorId, isPos, isNum, trackKeyOf, itemsOfTrack, verbOf, isTarget, validateScene, validateProject, cleanScene, cleanProject, DEFAULT_UI, defaultProject, defaultScene, normalizeScene, normalizeProject, VAR_TYPES, OPS, NODE_TYPES, NODE_LABEL, TRIGGERS, COND_KINDS, COND_LABEL, ACTION_KINDS, ACTION_LABEL, QUEST_STATES, QUEST_OPS, GOAL_TYPES, GOAL_LABEL, VAR_SCOPES, TEXT_MAX, isDocId, isVarName, condKind, actionKind, nodeOutputs, getOut, setOut, isEndRef, checkSpeaker, checkConds, checkActions, validateDialog, describeGoal, validateQuest, validateVars, varDefault, defaultDialog, defaultQuest, cleanDoc, normalizeDialog, normalizeQuest };
})();
const { ERR, WARN, TRACK_KINDS, ACTOR_KINDS, EASES, WEATHERS, END_MODES, SUB_MAX, VERBS, TRACK_LABEL, VERB_LABEL, FIELD_LABEL, isResId, isSceneId, isActorId, isPos, isNum, trackKeyOf, itemsOfTrack, verbOf, isTarget, validateScene, validateProject, cleanScene, cleanProject, DEFAULT_UI, defaultProject, defaultScene, normalizeScene, normalizeProject, VAR_TYPES, OPS, NODE_TYPES, NODE_LABEL, TRIGGERS, COND_KINDS, COND_LABEL, ACTION_KINDS, ACTION_LABEL, QUEST_STATES, QUEST_OPS, GOAL_TYPES, GOAL_LABEL, VAR_SCOPES, TEXT_MAX, isDocId, isVarName, condKind, actionKind, nodeOutputs, getOut, setOut, isEndRef, checkSpeaker, checkConds, checkActions, validateDialog, describeGoal, validateQuest, validateVars, varDefault, defaultDialog, defaultQuest, cleanDoc, normalizeDialog, normalizeQuest } = __validate;

// ===== scheme.js =====
const __scheme = (function () {
// «Студия Кокка», фаза 4: «Схемы» — графы «событие → условие → действие» (как блюпринты UE).
// Чистые функции без зависимостей, кроме validate.js (scripts/sync-studio.cjs кладёт этот файл и в главный процесс).
//
// Файл studio/schemes/<id>.json:
// { v:1, id, title, note, enabled, nodes: { <id>: { type, x, y, …поля вида…, выходы… } } }
// Выходы узлов: next | then/else | outs[i] | body (+ next у цикла). Комментарий выходов не имеет.

const SCHEME_NODE_TYPES = ['event', 'cond', 'action', 'wait', 'sequence', 'random', 'loop', 'gate', 'once', 'comment'];
const SCHEME_NODE_LABEL = {
  event: 'Событие', cond: 'Условие', action: 'Действие', wait: 'Подождать', sequence: 'По очереди', random: 'Случайно',
  loop: 'Повторить', gate: 'Ворота', once: 'Один раз', comment: 'Комментарий'
};
// категории для цвета и палитры: события — красные, условия — жёлтые, действия — синие, поток — серые
const SCHEME_NODE_CAT = { event: 'event', cond: 'cond', action: 'action', wait: 'flow', sequence: 'flow', random: 'flow', loop: 'flow', gate: 'flow', once: 'flow', comment: 'note' };

const EVENT_KINDS = ['start', 'time', 'timer', 'zone', 'talk', 'dialog_end', 'quest', 'scene_end', 'var', 'item', 'block', 'kill', 'death', 'login', 'chat', 'signal'];
const EVENT_LABEL = {
  start: 'Запуск', time: 'Время суток', timer: 'Таймер', zone: 'Зона', talk: 'Разговор', dialog_end: 'Диалог закончен',
  quest: 'Задание', scene_end: 'Сцена закончилась', var: 'Переменная', item: 'Предмет', block: 'Блок', kill: 'Убит моб',
  death: 'Игрок умер', login: 'Игрок зашёл', chat: 'Сообщение в чат', signal: 'Сигнал'
};
const TIME_AT = ['dawn', 'day', 'noon', 'dusk', 'night', 'midnight'];
// at: одно из TIME_AT, число 0–23999 или строка «tick N»
function timeAtTick(at) { if (typeof at === 'number') return at; const m = /^tick\s+(\d+)$/.exec(String(at || '')); return m ? Number(m[1]) : null; }
const ZONE_ON = ['enter', 'leave', 'inside'];
const QUEST_ON = ['start', 'step', 'done', 'fail'];
const ITEM_ON = ['pickup', 'use', 'craft'];
const BLOCK_ON = ['break', 'place', 'use'];
const WHO_ZONE = ['player', 'any_player'];

// условия схем: всё из диалогов + новые
const SCHEME_COND_EXTRA = ['zone', 'players_online', 'weather', 'dim', 'random'];
const SCHEME_COND_EXTRA_LABEL = { zone: 'Игрок в зоне', players_online: 'Игроков онлайн', weather: 'Погода', dim: 'Измерение', random: 'Случайно (доля)' };
// действия схем: всё из диалогов + новые (порядок важен для распознавания вида)
const SCHEME_ACTION_EXTRA = ['spawn', 'despawn', 'move', 'say', 'block', 'structure', 'fx', 'message', 'tp', 'effect', 'weather', 'time', 'signal', 'scheme', 'gate', 'once'];
const SCHEME_ACTION_EXTRA_LABEL = {
  spawn: 'Создать актёра/моба', despawn: 'Убрать актёра/моба', move: 'Отправить идти', say: 'Сказать над головой', block: 'Поставить блок',
  structure: 'Поставить постройку', fx: 'Эффект', message: 'Сообщение', tp: 'Перенести игрока', effect: 'Эффект зелья', weather: 'Погода',
  time: 'Время суток', signal: 'Подать сигнал', scheme: 'Вкл/выкл схему', gate: 'Открыть/закрыть ворота', once: 'Сбросить «Один раз»'
};
const FX_KINDS = ['fade_in', 'fade_out', 'flash', 'shake', 'particles', 'story_fx', 'title'];
const MSG_STYLES = ['chat', 'title', 'actionbar'];
const WEATHER_KINDS = ['clear', 'rain', 'thunder'];
const ROTS = [0, 90, 180, 270];
const MIRRORS = [false, true, 'x', 'z', 'none'];
const GATE_SET = ['open', 'close', 'toggle'];
const MSG_TO = ['player', 'all', 'near'];
// безопасные пределы (их же соблюдает игра)
const SCHEME_LIMITS = { instances: 64, loop: 1000, waitMin: 1, nodes: 400 };

const NODE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const SIGNAL = /^[a-zA-Z0-9_.-]{1,64}$/;
const BLOCK_STATE = /^[a-z0-9_.-]+:[a-z0-9_./-]+(\[[a-z0-9_=,]*\])?$/;

function schemeCondKind(c) {
  const k = condKind(c);
  if (k) return k;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  for (const x of SCHEME_COND_EXTRA) if (x in c) return x;
  return null;
}
function schemeActionKind(a) {
  // { gate, set } и { once, reset } — раньше «set» (переменная) и «scheme»
  if (a && typeof a === 'object' && !Array.isArray(a)) { if ('gate' in a) return 'gate'; if ('once' in a) return 'once'; }
  const k = actionKind(a);
  if (k) return k;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  for (const x of SCHEME_ACTION_EXTRA) if (x in a) return x;
  return null;
}

// ---------- выходы узлов ----------
function schemeOutputs(n) {
  if (!n) return [];
  switch (n.type) {
    case 'event': case 'action': case 'wait': case 'gate': case 'once': return [{ key: 'next', label: 'дальше' }];
    case 'cond': return [{ key: 'then', label: 'да' }, { key: 'else', label: 'нет' }];
    case 'loop': return [{ key: 'body', label: 'каждый раз' }, { key: 'next', label: 'потом' }];
    case 'sequence': return [...(Array.isArray(n.outs) ? n.outs : []).map((_, i) => ({ key: 'out:' + i, label: 'шаг ' + (i + 1) })), { key: 'next', label: 'потом' }];
    case 'random': return (Array.isArray(n.outs) ? n.outs : []).map((_, i) => ({ key: 'out:' + i, label: 'вариант ' + (i + 1) }));
    default: return [];
  }
}
function schemeGetOut(n, key) {
  if (!n) return null;
  if (key.startsWith('out:')) { const v = (n.outs || [])[Number(key.slice(4))]; return v || null; }
  return n[key] || null;
}
// out:<длина> — добавить новый выход в конец
function schemeSetOut(n, key, target) {
  const c = { ...n };
  if (key.startsWith('out:')) {
    const i = Number(key.slice(4));
    const outs = (c.outs || []).slice();
    if (i >= outs.length) { if (target) { outs.push(target); if (c.type === 'random') c.weights = [...(c.weights || outs.slice(0, -1).map(() => 1)), 1]; } } else outs[i] = target || null;
    c.outs = outs;
  } else if (target) c[key] = target; else delete c[key];
  return c;
}
function schemeHasInput(n) { return !!n && n.type !== 'event' && n.type !== 'comment'; }

// ---------- проверка ----------
function schemeRefs(ctx) {
  ctx = ctx || {};
  const p = ctx.project || null;
  const ids = (arr) => (Array.isArray(arr) ? arr.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean) : null);
  const vars = p && Array.isArray(p.vars) ? {} : null;
  if (vars) for (const v of p.vars) if (v && v.name) vars[v.name] = v.type || 'text';
  return {
    actors: p && Array.isArray(p.actors) ? p.actors.map((a) => a && a.id) : null,
    vars, scenes: ids(ctx.scenes), dialogs: ids(ctx.dialogs), quests: ids(ctx.quests), schemes: ids(ctx.schemes), structures: ids(ctx.structures)
  };
}
function zoneErr(z) {
  if (!z || typeof z !== 'object') return 'зона не задана';
  if (isPos(z.from) || isPos(z.to)) return isPos(z.from) && isPos(z.to) ? null : 'у коробки нужны оба угла (от и до)';
  if (!isPos(z.pos)) return 'не задан центр зоны (x y z)';
  if (!isNum(z.radius) || z.radius <= 0 || z.radius > 512) return 'радиус зоны — число от 0 до 512';
  return null;
}
// место: [x,y,z] | 'player' | 'event' | 'entity' | 'actor:id' | имя из spawn.as | { of: место, offset:[dx,dy,dz] }
function posErr(p, allowCtx) {
  if (isPos(p)) return null;
  if (allowCtx) {
    if (p === 'player' || p === 'event' || p === 'entity') return null;
    if (typeof p === 'string' && /^(actor:)?[a-zA-Z0-9_-]{1,48}$/.test(p)) return null;
    if (p && typeof p === 'object' && !Array.isArray(p) && p.of !== undefined) { if (p.offset !== undefined && !isPos(p.offset)) return 'сдвиг — три числа dx dy dz'; return posErr(p.of, true); }
  }
  return allowCtx ? 'место — три числа x y z, «player» (у игрока), «event» (где случилось событие), «entity», actor:id или имя созданного' : 'место — три числа x y z';
}
function targetErr(s, R, allowTmp) {
  if (typeof s !== 'string' || !s) return 'не выбрано, кто';
  if (s.startsWith('actor:')) return R.actors && !R.actors.includes(s.slice(6)) ? 'в проекте нет персонажа «' + s.slice(6) + '»' : null;
  if (s.startsWith('entity:')) return isResId(s.slice(7)) ? null : 'тип сущности пиши вида entity:minecraft:zombie';
  if (allowTmp && /^[a-zA-Z0-9_-]{1,40}$/.test(s)) return null;
  return 'нужно actor:id' + (allowTmp ? ', entity:тип или имя созданного («как»)' : ' или entity:тип');
}

function checkSchemeCond(c, where, add, R, sel) {
  const k = schemeCondKind(c);
  if (k === 'time') { if (!['day', 'night', 'dawn', 'dusk'].includes(c.time)) add(ERR, where + ' → условие «Время суток»: день, ночь, рассвет или закат', sel); return; }
  if (!SCHEME_COND_EXTRA.includes(k) && !['not', 'any', 'all'].includes(k)) { checkConds([c], where, add, { ...R, quests: R.questsMap, dialogs: R.dialogsMap }, sel); return; }
  const w = where + ' → условие «' + (SCHEME_COND_EXTRA_LABEL[k] || k) + '»';
  switch (k) {
    case 'not': if (!c.not || typeof c.not !== 'object') add(ERR, w + ': внутри пусто', sel); else checkSchemeCond(c.not, where + ' → НЕ', add, R, sel); return;
    case 'any': case 'all':
      if (!Array.isArray(c[k]) || !c[k].length) add(ERR, where + ': список «' + (k === 'any' ? 'любое из' : 'все из') + '» пуст', sel);
      else c[k].forEach((x) => checkSchemeCond(x, where + (k === 'any' ? ' → любое из' : ' → все из'), add, R, sel));
      return;
    case 'zone': { const e = zoneErr(c.zone); if (e) add(ERR, w + ': ' + e, sel); if (c.who !== undefined && !WHO_ZONE.includes(c.who)) add(ERR, w + ': кто — «игрок» или «любой игрок»', sel); return; }
    case 'players_online': if (!/^(==|!=|>=|<=|>|<)?\s*\d{1,3}$/.test(String(c.players_online))) add(ERR, w + ': пиши вида >=2 (сравнение и число)', sel); return;
    case 'weather': if (!WEATHER_KINDS.includes(c.weather)) add(ERR, w + ': погода — ясно, дождь или гроза', sel); return;
    case 'dim': if (!isResId(c.dim)) add(ERR, w + ': измерение пиши вида minecraft:the_nether', sel); return;
    case 'random': if (!isNum(c.random) || c.random < 0 || c.random > 1) add(ERR, w + ': доля — число от 0 до 1 (0.3 = 30%)', sel); return;
    default:
  }
}
function checkSchemeAction(a, where, add, R, sel, info) {
  const k = schemeActionKind(a);
  if (!SCHEME_ACTION_EXTRA.includes(k)) { checkActions([a], where, add, { ...R, quests: R.questsMap, dialogs: R.dialogsMap }, sel); return; }
  const w = where + ' → «' + SCHEME_ACTION_EXTRA_LABEL[k] + '»';
  const pe = (p, allowCtx, what) => { const e = posErr(p, allowCtx); if (e) add(ERR, w + ': ' + (what || '') + e, sel); };
  switch (k) {
    case 'spawn':
      { const e = targetErr(a.spawn, R, false); if (e) add(ERR, w + ': ' + e, sel); }
      pe(a.pos, true);
      if (a.as !== undefined && a.as !== null && a.as !== '' && !/^[a-zA-Z0-9_-]{1,40}$/.test(a.as)) add(ERR, w + ': имя «как» — латиница, цифры, _ и -', sel);
      if (a.as) info.spawned.add(a.as);
      return;
    case 'despawn': { const e = targetErr(a.despawn, R, true); if (e) add(ERR, w + ': ' + e, sel); return; }
    case 'move':
      { const e = targetErr(a.move, R, true); if (e) add(ERR, w + ': ' + e, sel); }
      pe(a.to, true, 'куда — ');
      if (a.speed !== undefined && (!isNum(a.speed) || a.speed <= 0 || a.speed > 3)) add(WARN, w + ': скорость лучше от 0.2 до 1.5', sel);
      return;
    case 'say':
      { const e = targetErr(a.say, R, true); if (e) add(ERR, w + ': ' + e, sel); }
      if (!a.text || !String(a.text).trim()) add(ERR, w + ': пустой текст', sel);
      else if (String(a.text).length > 140) add(WARN, w + ': длинная фраза (' + String(a.text).length + ' знаков, лучше до 140)', sel);
      return;
    case 'block':
      pe(a.block, true);
      if (!BLOCK_STATE.test(String(a.state || ''))) add(ERR, w + ': блок пиши вида minecraft:oak_door[open=true] или minecraft:air', sel);
      return;
    case 'structure':
      if (!isDocId(a.structure)) add(ERR, w + ': не выбрана постройка', sel);
      else if (R.structures && !R.structures.includes(a.structure)) add(ERR, w + ': в библиотеке нет постройки «' + a.structure + '»', sel);
      pe(a.pos, true);
      if (a.rot !== undefined && !ROTS.includes(a.rot)) add(ERR, w + ': поворот — 0, 90, 180 или 270', sel);
      if (a.mirror !== undefined && !MIRRORS.includes(a.mirror)) add(ERR, w + ': отражение — нет, по X или по Z', sel);
      if (a.anchor !== undefined && !['corner', 'center'].includes(a.anchor)) add(ERR, w + ': точка — угол или центр низа', sel);
      return;
    case 'fx':
      if (!FX_KINDS.includes(a.fx)) { add(ERR, w + ': неизвестный эффект «' + a.fx + '»', sel); return; }
      if (a.fx === 'particles') { if (!isResId(a.name)) add(ERR, w + ': частицы пиши вида minecraft:flame', sel); pe(a.pos, true); }
      if (a.fx === 'story_fx' && !a.name) add(ERR, w + ': не выбран сюжетный эффект', sel);
      if (a.fx === 'title' && (!a.text || !String(a.text).trim())) add(ERR, w + ': пустой заголовок', sel);
      if (a.ticks !== undefined && (!isNum(a.ticks) || a.ticks <= 0)) add(ERR, w + ': длительность — тики больше нуля', sel);
      return;
    case 'message':
      if (!a.message || !String(a.message).trim()) add(ERR, w + ': пустой текст', sel);
      if (a.to !== undefined && !MSG_TO.includes(a.to)) add(ERR, w + ': кому — игроку, всем или рядом', sel);
      if (a.to === 'near' && a.radius !== undefined && (!isNum(a.radius) || a.radius <= 0)) add(ERR, w + ': радиус «рядом» — число больше нуля', sel);
      if (a.style !== undefined && !MSG_STYLES.includes(a.style)) add(ERR, w + ': вид — чат, заголовок или над хотбаром', sel);
      return;
    case 'tp': pe(a.tp, false); return;
    case 'effect':
      if (!isResId(a.effect)) add(ERR, w + ': эффект пиши вида minecraft:speed', sel);
      if (!isNum(a.seconds) || a.seconds <= 0 || a.seconds > 3600) add(ERR, w + ': сколько секунд — от 1 до 3600', sel);
      if (a.level !== undefined && (!Number.isInteger(a.level) || a.level < 1 || a.level > 10)) add(ERR, w + ': уровень — целое от 1 до 10', sel);
      return;
    case 'weather': if (!WEATHER_KINDS.includes(a.weather)) add(ERR, w + ': погода — ясно, дождь или гроза', sel); return;
    case 'time': if (!isNum(a.time) || a.time < 0 || a.time > 24000) add(ERR, w + ': время — от 0 до 24000 (6000 — полдень, 13000 — ночь)', sel); return;
    case 'signal': if (!SIGNAL.test(String(a.signal || ''))) add(ERR, w + ': имя сигнала — латиница, цифры, _ . -', sel); else info.raised.add(a.signal); return;
    case 'scheme':
      if (!isDocId(a.scheme)) add(ERR, w + ': не выбрана схема', sel);
      else if (R.schemes && !R.schemes.includes(a.scheme)) add(ERR, w + ': в проекте нет схемы «' + a.scheme + '»', sel);
      if (typeof a.enable !== 'boolean') add(ERR, w + ': включить или выключить — да/нет', sel);
      return;
    case 'gate':
      if (!a.scheme && (!info.nodes[a.gate] || info.nodes[a.gate].type !== 'gate')) add(ERR, w + ': в этой схеме нет ворот «' + a.gate + '»', sel);
      if (!GATE_SET.includes(a.set)) add(ERR, w + ': открыть, закрыть или переключить', sel);
      return;
    case 'once':
      if (!a.scheme && (!info.nodes[a.once] || info.nodes[a.once].type !== 'once')) add(ERR, w + ': в этой схеме нет узла «Один раз» «' + a.once + '»', sel);
      return;
    default:
  }
}

function checkEvent(n, where, add, R, sel, info) {
  const k = n.event;
  if (!EVENT_KINDS.includes(k)) { add(ERR, where + ': не выбрано, какое событие', sel); return; }
  const w = where + ' («' + EVENT_LABEL[k] + '»)';
  switch (k) {
    case 'time': {
      if (TIME_AT.includes(n.at)) return;
      const t = timeAtTick(n.at);
      if (t === null) add(ERR, w + ': когда — рассвет, день, полдень, закат, ночь, полночь или тик суток', sel);
      else if (!Number.isInteger(t) || t < 0 || t >= 24000) add(ERR, w + ': тик суток — целое от 0 до 23999', sel);
      return;
    }
    case 'timer': if (!Number.isInteger(n.every) || n.every < 1) add(ERR, w + ': «каждые» — целое число тиков от 1 (20 = 1 с)', sel); else if (n.every < 20) add(WARN, w + ': чаще раза в секунду — проверь, что так задумано', sel); return;
    case 'zone': {
      const e = zoneErr(n); if (e) add(ERR, w + ': ' + e, sel);
      if (n.on !== undefined && !ZONE_ON.includes(n.on)) add(ERR, w + ': вошёл, вышел или находится внутри', sel);
      if (n.who !== undefined && !WHO_ZONE.includes(n.who)) add(ERR, w + ': кто — игрок или любой игрок', sel);
      if (n.on === 'inside') add(WARN, w + ': «внутри» срабатывает каждую секунду, пока игрок там — поставь «Один раз» или условие', sel);
      return;
    }
    case 'talk': { const e = checkSpeaker(n.speaker, { actors: R.actors }, true); if (e) add(ERR, w + ': с кем — ' + e, sel); return; }
    case 'dialog_end':
      if (!isDocId(n.dialog)) add(ERR, w + ': не выбран диалог', sel);
      else if (R.dialogs && !R.dialogs.includes(n.dialog)) add(ERR, w + ': в проекте нет диалога «' + n.dialog + '»', sel);
      else if (n.node && R.dialogsMap && R.dialogsMap[n.dialog] && !R.dialogsMap[n.dialog].includes(n.node)) add(ERR, w + ': в диалоге «' + n.dialog + '» нет узла «' + n.node + '»', sel);
      return;
    case 'quest':
      if (!isDocId(n.quest)) add(ERR, w + ': не выбрано задание', sel);
      else if (R.quests && !R.quests.includes(n.quest)) add(ERR, w + ': в проекте нет задания «' + n.quest + '»', sel);
      if (n.on !== undefined && !QUEST_ON.includes(n.on)) add(ERR, w + ': когда — начато, шаг, сделано или провалено', sel);
      if (n.step && R.questsMap && R.questsMap[n.quest] && !R.questsMap[n.quest].includes(n.step)) add(ERR, w + ': в задании нет шага «' + n.step + '»', sel);
      return;
    case 'scene_end':
      if (!isDocId(n.scene)) add(ERR, w + ': не выбрана сцена', sel);
      else if (R.scenes && !R.scenes.includes(n.scene)) add(ERR, w + ': в проекте нет сцены «' + n.scene + '»', sel);
      return;
    case 'var':
      if (!isVarName(n.name)) add(ERR, w + ': имя переменной — латиница, цифры, _ . -', sel);
      else if (R.vars && !R.vars[n.name]) add(WARN, w + ': переменная «' + n.name + '» не заведена во вкладке «Переменные»', sel);
      if (n.op !== undefined && n.op !== null && !OPS.includes(n.op)) add(ERR, w + ': неизвестное сравнение «' + n.op + '»', sel);
      return;
    case 'item':
      if (!isResId(n.item)) add(ERR, w + ': предмет пиши вида minecraft:bread', sel);
      if (n.on !== undefined && !ITEM_ON.includes(n.on)) add(ERR, w + ': подобрал, использовал или скрафтил', sel);
      return;
    case 'block':
      if (!isResId(n.block)) add(ERR, w + ': блок пиши вида minecraft:oak_log', sel);
      if (n.on !== undefined && !BLOCK_ON.includes(n.on)) add(ERR, w + ': сломал, поставил или нажал', sel);
      if (n.zone) { const e = zoneErr(n.zone); if (e) add(ERR, w + ': ' + e, sel); }
      return;
    case 'kill':
      if (!isResId(n.entity)) add(ERR, w + ': моба пиши вида minecraft:zombie', sel);
      if (n.zone) { const e = zoneErr(n.zone); if (e) add(ERR, w + ': ' + e, sel); }
      return;
    case 'chat': if (!n.text || !String(n.text).trim()) add(ERR, w + ': какой текст ловить', sel); else add(WARN, w + ': событие для проверок автора — игроки тоже могут его вызвать', sel); return;
    case 'signal': if (!SIGNAL.test(String(n.name || ''))) add(ERR, w + ': имя сигнала — латиница, цифры, _ . -', sel); else info.listened.add(n.name); return;
    default:
  }
}

// Проверка схемы. ctx: { project, ids:[id схем], scenes, dialogs:[{id,nodes}], quests:[{id,steps}], schemes, structures, signals:{ raised:Set|[], listened:Set|[] } }
function validateScheme(d, ctx) {
  ctx = ctx || {};
  const out = [];
  const sid = d && d.id;
  const add = (sev, msg, sel) => out.push({ sev, msg, sel: sel || null, kind: 'scheme', doc: sid || null });
  if (!d || typeof d !== 'object') { add(ERR, 'Схема пустая или повреждена'); return out; }
  const R0 = schemeRefs(ctx);
  const dmap = Array.isArray(ctx.dialogs) ? Object.fromEntries(ctx.dialogs.filter((x) => x && x.id).map((x) => [x.id, Array.isArray(x.nodes) ? x.nodes : null])) : null;
  const qmap = Array.isArray(ctx.quests) ? Object.fromEntries(ctx.quests.filter((x) => x && x.id).map((x) => [x.id, Array.isArray(x.steps) ? x.steps.map((s) => (typeof s === 'string' ? s : s && s.id)) : null])) : null;
  const R = { ...R0, dialogsMap: dmap, questsMap: qmap };
  if (!isDocId(d.id)) add(ERR, 'Имя файла схемы (id) — маленькие латинские буквы, цифры, _ и -');
  if (ctx.ids && ctx.ids.filter((x) => x === d.id).length > 1) add(ERR, 'Схема с именем «' + d.id + '» уже есть');
  if (!d.title || !String(d.title).trim()) add(WARN, 'У схемы нет названия — так её трудно искать');
  const nodes = d.nodes && typeof d.nodes === 'object' && !Array.isArray(d.nodes) ? d.nodes : null;
  if (!nodes || !Object.keys(nodes).length) { add(ERR, 'В схеме нет ни одного узла'); return out; }
  const ids = Object.keys(nodes);
  if (ids.length > SCHEME_LIMITS.nodes) add(WARN, 'В схеме ' + ids.length + ' узлов — разбей на несколько схем и связывай сигналами');
  const info = { nodes, raised: new Set(), listened: new Set(), spawned: new Set() };
  const events = ids.filter((id) => nodes[id] && nodes[id].type === 'event');
  if (!events.length) add(ERR, 'В схеме нет ни одного события — она никогда не запустится. Добавь узел «Событие»');
  const link = (t, where, sel, need) => {
    if (t === undefined || t === null || t === '') { if (need) add(need === 'err' ? ERR : WARN, where + ': никуда не ведёт' + (need === 'err' ? ' — протяни стрелку' : ''), sel); return; }
    if (!nodes[t]) add(ERR, where + ': ведёт к узлу «' + t + '», которого нет', sel);
    else if (nodes[t].type === 'event') add(ERR, where + ': стрелка в «Событие» — событие только запускает, в него входить нельзя', sel);
    else if (nodes[t].type === 'comment') add(ERR, where + ': стрелка в комментарий', sel);
  };
  for (const id of ids) {
    const n = nodes[id];
    const sel = { node: id };
    if (!n || typeof n !== 'object') { add(ERR, 'Узел «' + id + '» повреждён', sel); continue; }
    const where = (SCHEME_NODE_LABEL[n.type] || 'Узел') + ' «' + id + '»';
    if (!NODE_ID.test(id)) add(ERR, where + ': id узла — латиница, цифры, _ и -', sel);
    switch (n.type) {
      case 'event': checkEvent(n, where, add, R, sel, info); link(n.next, where, sel, 'warn'); break;
      case 'cond':
        if (!Array.isArray(n.if) || !n.if.length) add(ERR, where + ': не задано, что проверять', sel);
        else n.if.forEach((c) => { if (!schemeCondKind(c)) add(ERR, where + ': непонятное условие', sel); else checkSchemeCond(c, where, add, R, sel); });
        link(n.then, where + ' → «да»', sel, 'err');
        link(n.else, where + ' → «нет»', sel, null);
        break;
      case 'action':
        if (!Array.isArray(n.do) || !n.do.length) add(ERR, where + ': нет ни одного действия', sel);
        else n.do.forEach((a) => { if (!schemeActionKind(a)) add(ERR, where + ': непонятное действие', sel); else checkSchemeAction(a, where, add, R, sel, info); });
        link(n.next, where, sel, null);
        break;
      case 'wait':
        if (!Number.isInteger(n.ticks) || n.ticks < SCHEME_LIMITS.waitMin) add(ERR, where + ': сколько ждать — целое число тиков от 1 (20 = 1 с)', sel);
        link(n.next, where, sel, 'warn');
        break;
      case 'sequence': case 'random': {
        const outs = Array.isArray(n.outs) ? n.outs : [];
        if (!outs.filter(Boolean).length) add(ERR, where + ': нет ни одного выхода — протяни стрелки из «+»', sel);
        outs.forEach((t, i) => link(t, where + ', выход ' + (i + 1), sel, 'warn'));
        if (n.type === 'sequence') link(n.next, where + ' → «потом»', sel, null);
        if (n.type === 'random') {
          const ws = Array.isArray(n.weights) ? n.weights : [];
          if (ws.length && ws.length !== outs.length) add(WARN, where + ': весов ' + ws.length + ', а выходов ' + outs.length + ' — недостающие считаются 1', sel);
          if (ws.some((x) => !isNum(x) || x < 0)) add(ERR, where + ': вес — число от 0', sel);
          if (ws.length && ws.every((x) => !x)) add(ERR, where + ': все веса нулевые — ни один вариант не выпадет', sel);
        }
        break;
      }
      case 'loop':
        if (!Number.isInteger(n.times) || n.times < 1 || n.times > SCHEME_LIMITS.loop) add(ERR, where + ': сколько раз — целое от 1 до ' + SCHEME_LIMITS.loop, sel);
        link(n.body, where + ' → «каждый раз»', sel, 'err');
        link(n.next, where + ' → «потом»', sel, null);
        break;
      case 'gate': if (n.open !== undefined && typeof n.open !== 'boolean') add(ERR, where + ': «открыты в начале» — да/нет', sel); link(n.next, where, sel, 'warn'); break;
      case 'once': if (n.per !== undefined && !['world', 'player'].includes(n.per)) add(ERR, where + ': «один раз» — для всего мира или для каждого игрока', sel); link(n.next, where, sel, 'warn'); break;
      case 'comment': if (n.text && String(n.text).length > 2000) add(WARN, where + ': очень длинный комментарий', sel); break;
      default: add(ERR, 'Узел «' + id + '»: неизвестный вид «' + n.type + '»', sel);
    }
  }
  // недостижимые узлы (от событий)
  const seen = new Set();
  const q = events.slice();
  events.forEach((e) => seen.add(e));
  while (q.length) {
    const n = nodes[q.shift()];
    for (const o of schemeOutputs(n)) { const t = schemeGetOut(n, o.key); if (t && nodes[t] && !seen.has(t)) { seen.add(t); q.push(t); } }
  }
  for (const id of ids) {
    const n = nodes[id];
    if (!n || n.type === 'comment' || seen.has(id) || !events.length) continue;
    add(WARN, (SCHEME_NODE_LABEL[n.type] || 'Узел') + ' «' + id + '»: до него не дойти ни от одного события — он не сработает', { node: id });
  }
  // круг без «Подождать» — игра оборвёт его по пределу действий за тик
  const loopNode = findInstantCycle(nodes);
  if (loopNode) add(WARN, 'Узел «' + loopNode + '»: стрелки замыкаются в круг без «Подождать» — игра оборвёт круг (не больше ' + SCHEME_LIMITS.loop + ' шагов за тик). Вставь «Подождать» или «Повторить»', { node: loopNode });
  // сигналы
  const sig = ctx.signals || null;
  if (sig) {
    const has = (s, x) => (s instanceof Set ? s.has(x) : Array.isArray(s) && s.includes(x));
    for (const s of info.raised) if (!has(sig.listened, s) && !info.listened.has(s)) add(WARN, 'Сигнал «' + s + '» подаётся, но ни одна схема его не ловит (событие «Сигнал»)');
    for (const s of info.listened) if (!has(sig.raised, s) && !info.raised.has(s)) add(WARN, 'Событие «Сигнал» ждёт «' + s + '», но его никто не подаёт (действие «Подать сигнал») — сработает только командой или из Студии');
  }
  return out;
}
function findInstantCycle(nodes) {
  const state = {};
  let hit = null;
  const succ = (id) => {
    const n = nodes[id];
    if (!n || n.type === 'wait' || n.type === 'loop') return []; // «Подождать» и «Повторить» круг разрывают
    return schemeOutputs(n).map((o) => schemeGetOut(n, o.key)).filter((t) => t && nodes[t]);
  };
  const dfs = (id) => {
    state[id] = 1;
    for (const t of succ(id)) {
      if (hit) return;
      if (state[t] === 1) { hit = t; return; }
      if (!state[t]) dfs(t);
    }
    state[id] = 2;
  };
  for (const id of Object.keys(nodes)) if (!state[id] && !hit) dfs(id);
  return hit;
}
// какие сигналы схема подаёт и ловит (для проверки всего проекта)
function schemeSignals(d) {
  const raised = [], listened = [];
  const walkA = (a) => { if (a && typeof a.signal === 'string' && schemeActionKind(a) === 'signal') raised.push(a.signal); };
  for (const n of Object.values((d && d.nodes) || {})) {
    if (!n) continue;
    if (n.type === 'event' && n.event === 'signal' && n.name) listened.push(n.name);
    if (n.type === 'action') (n.do || []).forEach(walkA);
  }
  return { raised, listened };
}

function defaultScheme(id, title) {
  return {
    v: 1, id, title: title || id, note: '', enabled: true,
    nodes: {
      e1: { type: 'event', event: 'time', at: 'night', x: 40, y: 60, next: 'c1' },
      c1: { type: 'cond', if: [{ weather: 'clear' }], then: 'a1', x: 330, y: 60 },
      a1: { type: 'action', do: [{ message: 'Наступила ночь. Будь осторожен!', to: 'all', style: 'title' }], x: 620, y: 60 },
      cm1: { type: 'comment', text: 'Ночью при ясной погоде всем приходит заголовок. Поменяй под себя.', x: 40, y: 220, w: 300, h: 70 }
    }
  };
}
// для игроков: без служебных полей, координаты узлов округлены
function normalizeScheme(d) {
  const s = JSON.parse(JSON.stringify(d || {}));
  const nodes = {};
  for (const [id, n] of Object.entries(s.nodes || {})) {
    if (!n || typeof n !== 'object') continue;
    const c = {};
    for (const k of Object.keys(n)) if (k[0] !== '_' && n[k] !== undefined) c[k] = n[k];
    for (const k of ['x', 'y', 'w', 'h']) if (isNum(c[k])) c[k] = Math.round(c[k]);
    if (Array.isArray(c.outs)) c.outs = c.outs.map((x) => x || null);
    nodes[id] = c;
  }
  return { v: 1, id: s.id, title: s.title || s.id, enabled: s.enabled !== false, nodes };
}

return { SCHEME_NODE_TYPES, SCHEME_NODE_LABEL, SCHEME_NODE_CAT, EVENT_KINDS, EVENT_LABEL, TIME_AT, timeAtTick, ZONE_ON, QUEST_ON, ITEM_ON, BLOCK_ON, WHO_ZONE, SCHEME_COND_EXTRA, SCHEME_COND_EXTRA_LABEL, SCHEME_ACTION_EXTRA, SCHEME_ACTION_EXTRA_LABEL, FX_KINDS, MSG_STYLES, WEATHER_KINDS, ROTS, MIRRORS, GATE_SET, MSG_TO, SCHEME_LIMITS, schemeCondKind, schemeActionKind, schemeOutputs, schemeGetOut, schemeSetOut, schemeHasInput, validateScheme, schemeSignals, defaultScheme, normalizeScheme };
})();
const { SCHEME_NODE_TYPES, SCHEME_NODE_LABEL, SCHEME_NODE_CAT, EVENT_KINDS, EVENT_LABEL, TIME_AT, timeAtTick, ZONE_ON, QUEST_ON, ITEM_ON, BLOCK_ON, WHO_ZONE, SCHEME_COND_EXTRA, SCHEME_COND_EXTRA_LABEL, SCHEME_ACTION_EXTRA, SCHEME_ACTION_EXTRA_LABEL, FX_KINDS, MSG_STYLES, WEATHER_KINDS, ROTS, MIRRORS, GATE_SET, MSG_TO, SCHEME_LIMITS, schemeCondKind, schemeActionKind, schemeOutputs, schemeGetOut, schemeSetOut, schemeHasInput, validateScheme, schemeSignals, defaultScheme, normalizeScheme } = __scheme;

module.exports = { CLONER_MODES, CLONER_MODE_LABEL, EFFECTOR_KINDS, EFFECTOR_LABEL, MAX_CLONES, MAX_SEND, hash01, noise2, smoothPath, samplePath, clonerLayout, applyEffector, rotateBlockState, quarter, clonerPlacements, placementsBox, OBJ_TYPES, OBJ_LABEL, INTERPS, INTERP_LABEL, CHANNELS, STEP_CHANNELS, CHANNEL_LABEL, defaultProps, makeObject, uniqueObjId, chanGet, chanSet, isStepChannel, keySlopes, evalKeys, propsAt, isAnimated, keyAt, setKey, removeKey, setChannel, moveKeys, allKeyTimes, objById, childrenOf, ancestors, isDescendant, isActive, parentOffset, worldPos, stageAt, activeCamera, cameraPose, hasObjects, toObjectScene, compileCamera, lightObjects, compileSounds, SCENE_CLONE_MAX, structurePlacements, compileCloners, clonerInputs, clonerOutput, compileScene, sceneForDisk, gameObject, objectsSnapshot, posesAt, actorPosAt, validateObjects, ERR, WARN, TRACK_KINDS, ACTOR_KINDS, EASES, WEATHERS, END_MODES, SUB_MAX, VERBS, TRACK_LABEL, VERB_LABEL, FIELD_LABEL, isResId, isSceneId, isActorId, isPos, isNum, trackKeyOf, itemsOfTrack, verbOf, isTarget, validateScene, validateProject, cleanScene, cleanProject, DEFAULT_UI, defaultProject, defaultScene, normalizeScene, normalizeProject, VAR_TYPES, OPS, NODE_TYPES, NODE_LABEL, TRIGGERS, COND_KINDS, COND_LABEL, ACTION_KINDS, ACTION_LABEL, QUEST_STATES, QUEST_OPS, GOAL_TYPES, GOAL_LABEL, VAR_SCOPES, TEXT_MAX, isDocId, isVarName, condKind, actionKind, nodeOutputs, getOut, setOut, isEndRef, checkSpeaker, checkConds, checkActions, validateDialog, describeGoal, validateQuest, validateVars, varDefault, defaultDialog, defaultQuest, cleanDoc, normalizeDialog, normalizeQuest, SCHEME_NODE_TYPES, SCHEME_NODE_LABEL, SCHEME_NODE_CAT, EVENT_KINDS, EVENT_LABEL, TIME_AT, timeAtTick, ZONE_ON, QUEST_ON, ITEM_ON, BLOCK_ON, WHO_ZONE, SCHEME_COND_EXTRA, SCHEME_COND_EXTRA_LABEL, SCHEME_ACTION_EXTRA, SCHEME_ACTION_EXTRA_LABEL, FX_KINDS, MSG_STYLES, WEATHER_KINDS, ROTS, MIRRORS, GATE_SET, MSG_TO, SCHEME_LIMITS, schemeCondKind, schemeActionKind, schemeOutputs, schemeGetOut, schemeSetOut, schemeHasInput, validateScheme, schemeSignals, defaultScheme, normalizeScheme };
