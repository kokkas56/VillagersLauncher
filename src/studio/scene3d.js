// «Студия Кокка», фаза 3: сцена как дерево объектов (как в Cinema 4D) с анимацией по свойствам.
// Чистые функции без зависимостей, кроме mograph.js. Этот файл попадает и в главный процесс
// (electron/studio-validate.cjs собирается scripts/sync-studio.cjs) — сборка и «Проиграть» используют один компилятор.
//
// Сцена (файл studio/scenes/<id>.json) дополнительно хранит:
//   objects: [{ id, type, name, parent, enabled, visible, props:{…}, anim:{ "<канал>": [{ t, v, interp, in?, out? }] } }]
//   stage:   [{ t0, t1, cam }]  — «Монтаж»: какая камера активна с t0 по t1 (как Stage в C4D)
// Игра (фаза 1) понимает только старый формат, поэтому compileScene() делает из объектов дорожку камеры
// (ключи берутся у активной по «Монтажу» камеры) и события света/звука/клонеров. Сгенерированное помечено gen:true.
import { clonerPlacements } from './mograph.js';

export const OBJ_TYPES = ['camera', 'actor', 'light', 'sound', 'marker', 'path', 'group', 'cloner', 'effector', 'block', 'template'];
export const OBJ_LABEL = {
  camera: 'Камера', actor: 'Актёр', light: 'Свет', sound: 'Звук', marker: 'Метка', path: 'Путь', group: 'Группа',
  cloner: 'Клонер', effector: 'Эффектор', block: 'Блок', template: 'Шаблон'
};
export const INTERPS = ['bezier', 'linear', 'step'];
export const INTERP_LABEL = { bezier: 'Безье (плавно)', linear: 'Линейно', step: 'Ступенька' };

// анимируемые каналы по видам объектов
export const CHANNELS = {
  camera: ['pos.x', 'pos.y', 'pos.z', 'yaw', 'pitch', 'roll', 'fov', 'shake'],
  light: ['pos.x', 'pos.y', 'pos.z', 'on', 'level'],
  sound: ['pos.x', 'pos.y', 'pos.z', 'play', 'vol'],
  marker: ['pos.x', 'pos.y', 'pos.z'],
  path: ['pos.x', 'pos.y', 'pos.z'],
  group: ['pos.x', 'pos.y', 'pos.z'],
  cloner: ['pos.x', 'pos.y', 'pos.z'],
  effector: ['strength'],
  actor: [], block: [], template: []
};
// каналы-«переключатели»: всегда ступенькой
export const STEP_CHANNELS = ['on', 'level', 'play', 'look'];
export const CHANNEL_LABEL = {
  'pos.x': 'Позиция X', 'pos.y': 'Позиция Y', 'pos.z': 'Позиция Z', yaw: 'Поворот (H)', pitch: 'Наклон (P)', roll: 'Крен (B)',
  fov: 'Угол обзора', shake: 'Дрожание', on: 'Включён', level: 'Яркость', play: 'Играть', vol: 'Громкость', strength: 'Сила', look: 'Смотреть на'
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);
const clone = (o) => JSON.parse(JSON.stringify(o));

export function defaultProps(type) {
  switch (type) {
    case 'camera': return { pos: [0, 70, 0], yaw: 0, pitch: 0, roll: 0, fov: 70, shake: 0, look: null };
    case 'actor': return {};
    case 'light': return { pos: [0, 65, 0], points: [], level: 15, on: true };
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
    default: return {};
  }
}

export function makeObject(type, id, name, extra) {
  const e = extra || {};
  return { id, type, name: name || OBJ_LABEL[type] || type, parent: null, enabled: true, visible: true, anim: {}, ...e, props: { ...defaultProps(type), ...(e.props || {}) } };
}

export function uniqueObjId(scene, base) {
  const taken = new Set((scene.objects || []).map((o) => o.id));
  let n = 1;
  while (taken.has(base + n)) n++;
  return base + n;
}

// ---------------- каналы ----------------
export function chanGet(props, ch) {
  if (!props) return undefined;
  if (ch.startsWith('pos.')) { const p = props.pos; return Array.isArray(p) ? p['xyz'.indexOf(ch[4])] : undefined; }
  return props[ch];
}
export function chanSet(props, ch, v) {
  const c = { ...props };
  if (ch.startsWith('pos.')) { const p = Array.isArray(c.pos) ? c.pos.slice() : [0, 0, 0]; p['xyz'.indexOf(ch[4])] = v; c.pos = p; } else c[ch] = v;
  return c;
}
export function isStepChannel(ch) { return STEP_CHANNELS.includes(ch); }

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
export function keySlopes(keys, i) {
  const k = keys[i];
  const auto = autoSlope(keys, i);
  return { in: isNum(k.in) ? k.in : auto, out: isNum(k.out) ? k.out : (isNum(k.in) ? k.in : auto) };
}

// значение канала в момент t (ключи отсортированы по t)
export function evalKeys(keys, t, ch) {
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
export function propsAt(obj, t) {
  let p = obj.props || {};
  const anim = obj.anim || {};
  for (const ch of Object.keys(anim)) {
    const v = evalKeys(anim[ch], t, ch);
    if (v !== undefined) p = chanSet(p, ch, v);
  }
  return p;
}
export function isAnimated(obj, ch) { return !!(obj && obj.anim && Array.isArray(obj.anim[ch]) && obj.anim[ch].length); }
export function keyAt(obj, ch, t) { return isAnimated(obj, ch) ? obj.anim[ch].findIndex((k) => k.t === t) : -1; }

// поставить ключ (значение берётся текущее, если v не задано)
export function setKey(obj, ch, t, v, interp) {
  const cur = v !== undefined ? v : chanGet(propsAt(obj, t), ch);
  const keys = isAnimated(obj, ch) ? obj.anim[ch].slice() : [];
  const i = keys.findIndex((k) => k.t === t);
  const def = isStepChannel(ch) || !isNum(cur) ? 'step' : 'bezier';
  if (i >= 0) keys[i] = { ...keys[i], v: cur, ...(interp ? { interp } : {}) };
  else { keys.push({ t, v: cur, interp: interp || def }); keys.sort((a, b) => a.t - b.t); }
  return { ...obj, anim: { ...(obj.anim || {}), [ch]: keys } };
}
export function removeKey(obj, ch, t) {
  if (!isAnimated(obj, ch)) return obj;
  const keys = obj.anim[ch].filter((k) => k.t !== t);
  const anim = { ...obj.anim };
  if (keys.length) anim[ch] = keys; else delete anim[ch];
  // последний ключ ушёл — значение остаётся в props (как в C4D)
  const props = keys.length ? obj.props : chanSet(obj.props, ch, chanGet(propsAt(obj, t), ch));
  return { ...obj, anim, props };
}
// правка значения: если канал анимирован (или включена автозапись) — ключ в момент t, иначе просто значение
export function setChannel(obj, ch, t, v, autoKey) {
  if (isAnimated(obj, ch) || autoKey) return setKey(obj, ch, t, v);
  return { ...obj, props: chanSet(obj.props || {}, ch, v) };
}
export function moveKeys(obj, ch, fromT, toT) {
  if (!isAnimated(obj, ch) || fromT === toT) return obj;
  let keys = obj.anim[ch].filter((k) => k.t !== toT || k.t === fromT).map((k) => (k.t === fromT ? { ...k, t: toT } : k));
  keys = keys.sort((a, b) => a.t - b.t);
  return { ...obj, anim: { ...obj.anim, [ch]: keys } };
}
export function allKeyTimes(obj) {
  const s = new Set();
  for (const ch of Object.keys((obj && obj.anim) || {})) for (const k of obj.anim[ch]) s.add(k.t);
  return [...s].sort((a, b) => a - b);
}

// ---------------- иерархия ----------------
export function objById(scene, id) { return (scene.objects || []).find((o) => o.id === id) || null; }
export function childrenOf(scene, id) { return (scene.objects || []).filter((o) => (o.parent || null) === (id || null)); }
export function ancestors(scene, obj) {
  const out = [];
  let p = obj && obj.parent;
  const seen = new Set();
  while (p && !seen.has(p)) { seen.add(p); const o = objById(scene, p); if (!o) break; out.push(o); p = o.parent; }
  return out;
}
export function isDescendant(scene, id, maybeAncestor) {
  const o = objById(scene, id);
  return !!o && ancestors(scene, o).some((a) => a.id === maybeAncestor);
}
// выключен сам или кто-то из родителей
export function isActive(scene, obj) { return obj.enabled !== false && ancestors(scene, obj).every((a) => a.enabled !== false); }
// смещение от групп-родителей (только перенос, без поворота — для блоков так и надо)
export function parentOffset(scene, obj, t) {
  const off = [0, 0, 0];
  for (const a of ancestors(scene, obj)) {
    if (a.type !== 'group') continue;
    const p = propsAt(a, t).pos;
    if (isP3(p)) for (let i = 0; i < 3; i++) off[i] += p[i];
  }
  return off;
}
export function worldPos(scene, obj, t) {
  const p = propsAt(obj, t).pos;
  if (!isP3(p)) return null;
  const o = parentOffset(scene, obj, t);
  return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
}

// ---------------- «Монтаж» ----------------
export function stageAt(scene, t) {
  const st = Array.isArray(scene.stage) ? scene.stage : [];
  let hit = null;
  for (const b of st) if (t >= b.t0 && t < b.t1) hit = b;
  if (!hit && st.length) { // в «дырке» держим последнюю камеру до этого момента
    const prev = st.filter((b) => b.t0 <= t).sort((a, b) => b.t0 - a.t0)[0];
    hit = prev || st.slice().sort((a, b) => a.t0 - b.t0)[0];
  }
  return hit;
}
export function activeCamera(scene, t) {
  const b = stageAt(scene, t);
  const c = b && objById(scene, b.cam);
  if (c && c.type === 'camera') return c;
  return (scene.objects || []).find((o) => o.type === 'camera') || null;
}
export function cameraPose(scene, cam, t) {
  const p = propsAt(cam, t);
  const pos = worldPos(scene, cam, t) || [0, 64, 0];
  return { pos: pos.map((n) => r3(n)), yaw: r3(p.yaw || 0), pitch: r3(p.pitch || 0), roll: r3(p.roll || 0), fov: r3(p.fov || 70), shake: r3(p.shake || 0), look: p.look == null ? null : p.look };
}

// ---------------- старая сцена → объекты ----------------
const EASE2INTERP = { smooth: 'bezier', linear: 'linear', in: 'bezier', out: 'bezier' };
export function hasObjects(scene) { return !!scene && Array.isArray(scene.objects); }

// Открыть сцену в новой Студии: старые сцены превращаются в объекты (камера-дорожка → объект «Камера 1» + «Монтаж»).
export function toObjectScene(raw) {
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
    s.objects = [];
    const camTr = s.tracks.find((tr) => tr.kind === 'camera');
    const keys = (camTr && Array.isArray(camTr.keys) ? camTr.keys : []).filter((k) => k && isNum(k.t)).slice().sort((a, b) => a.t - b.t);
    s.stage = [];
    // без ключей камеры сцена шла глазами игрока — так и оставляем (камеры нет)
    if (keys.length) {
    const cam = makeObject('camera', 'cam1', 'Камера 1');
    const k0 = keys.find((k) => isP3(k.pos)) || keys[0];
    if (k0) cam.props = { ...cam.props, pos: isP3(k0.pos) ? k0.pos.slice() : cam.props.pos, yaw: k0.yaw || 0, pitch: k0.pitch || 0, roll: k0.roll || 0, fov: k0.fov || 70, shake: k0.shake || 0, look: k0.look == null ? null : k0.look };
    if (keys.length > 1) {
      const anim = {};
      const put = (ch, k, v) => { (anim[ch] = anim[ch] || []).push({ t: Math.round(k.t), v, interp: EASE2INTERP[k.ease] || 'bezier' }); };
      for (const k of keys) {
        if (isP3(k.pos)) { put('pos.x', k, k.pos[0]); put('pos.y', k, k.pos[1]); put('pos.z', k, k.pos[2]); }
        put('yaw', k, k.yaw || 0); put('pitch', k, k.pitch || 0); put('roll', k, k.roll || 0); put('fov', k, k.fov || 70); put('shake', k, k.shake || 0);
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
export function compileCamera(scene, opts) {
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
  for (const q of Array.isArray(p.points) ? p.points : []) if (isP3(q)) out.push(q.map((v, i) => Math.floor(v + off[i])));
  return out;
}
export function compileLights(scene) {
  const len = Math.max(1, Math.round(scene.length || 1));
  const ev = [];
  for (const o of (scene.objects || []).filter((x) => x.type === 'light' && isActive(scene, x))) {
    const times = new Set([0]);
    for (const ch of ['on', 'level']) for (const k of (o.anim && o.anim[ch]) || []) if (k.t >= 0 && k.t < len) times.add(Math.round(k.t));
    let was = null; // { on, level, at: [поз] }
    for (const t of [...times].sort((a, b) => a - b)) {
      const p = propsAt(o, t);
      const on = !!p.on && (p.level == null || p.level > 0);
      const level = Math.max(0, Math.min(15, Math.round(isNum(p.level) ? p.level : 15)));
      const at = lightPositions(scene, o, t);
      const key = on ? level + '|' + JSON.stringify(at) : 'off';
      if (was && was.key === key) continue;
      if (was && was.on) for (const q of was.at) if (!on || !at.some((x) => x.join() === q.join())) ev.push({ t, do: 'block', pos: q, state: 'minecraft:air', gen: true, src: o.id });
      if (on) for (const q of at) ev.push({ t, do: 'block', pos: q, state: 'minecraft:light[level=' + level + ']', gen: true, src: o.id });
      was = { on, at, key };
    }
    // убрать свет к концу сцены (игра фазы 1 сама блоки не возвращает)
    if (was && was.on) for (const q of was.at) ev.push({ t: Math.max(0, len - 1), do: 'block', pos: q, state: 'minecraft:air', gen: true, src: o.id });
  }
  return ev;
}
export function compileSounds(scene) {
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
// клонер «появляется в момент t»: блоки ставятся событиями «Блок» (до 2000 на клонер)
export const SCENE_CLONE_MAX = 2000;
export function compileCloners(scene) {
  const len = Math.max(1, Math.round(scene.length || 1));
  const ev = [];
  for (const o of (scene.objects || []).filter((x) => x.type === 'cloner' && isActive(scene, x))) {
    const at = o.props && o.props.appearAt;
    if (!isNum(at) || at < 0) continue;
    const pl = clonerOutput(scene, o, at).filter((p) => p.block).slice(0, SCENE_CLONE_MAX);
    for (const p of pl) ev.push({ t: Math.round(at), do: 'block', pos: p.pos, state: p.block, gen: true, src: o.id });
    if (o.props.removeAtEnd !== false) for (const p of pl) ev.push({ t: Math.max(0, len - 1), do: 'block', pos: p.pos, state: 'minecraft:air', gen: true, src: o.id });
  }
  return ev;
}

// что клонирует клонер: дети-источники (блок / шаблон / актёр / свет) и эффекторы (дети + список props.effectors)
export function clonerInputs(scene, cl) {
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
export function clonerOutput(scene, cl, t) {
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

// Главное: сцена с объектами → сцена фазы 1 (objects/stage убираются, дорожки дописываются).
export function compileScene(scene) {
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
  addEv('world', [...compileLights(s), ...compileCloners(s)]);
  addEv('sound', compileSounds(s));
  out.tracks = tracks;
  return out;
}

// Для сохранения на диск: объекты + сгенерированные дорожки (чтобы игра в режиме разработчика читала файл напрямую).
export function sceneForDisk(scene) {
  if (!hasObjects(scene)) return scene;
  const s = toObjectScene(scene);
  const c = compileScene(s);
  return { ...c, objects: s.objects, stage: s.stage };
}

// ---------------- для игры: объекты в момент t (живая связь {t:'objects'}) ----------------
export function objectsSnapshot(scene, t, selIds) {
  const sel = new Set(selIds || []);
  const out = [];
  for (const o of scene.objects || []) {
    if (o.visible === false || !isActive(scene, o)) continue;
    const p = propsAt(o, t);
    const it = { id: o.id, type: o.type, name: o.name, selected: sel.has(o.id) };
    const wp = worldPos(scene, o, t);
    if (wp) it.pos = wp.map(r3);
    if (o.type === 'camera') { Object.assign(it, { yaw: r3(p.yaw || 0), pitch: r3(p.pitch || 0), roll: r3(p.roll || 0), fov: r3(p.fov || 70) }); it.active = (activeCamera(scene, t) || {}).id === o.id; }
    else if (o.type === 'light') { it.level = p.level; it.on = !!p.on; it.points = lightPositions(scene, o, t); }
    else if (o.type === 'path') { const off = parentOffset(scene, o, t); const pp = p.pos || [0, 0, 0]; it.points = (p.points || []).filter(isP3).map((q) => q.map((v, i) => r3(v + pp[i] + off[i]))); it.closed = !!p.closed; }
    else if (o.type === 'marker') it.label = p.label || o.name;
    else if (o.type === 'sound') { it.sound = p.id; if (!wp) delete it.pos; }
    else if (o.type === 'cloner') { it.mode = p.mode; }
    else if (o.type === 'actor') {
      const a = (scene.actors || []).find((x) => x.id === o.actor);
      const ap = a && actorPosAt(scene, a.id, t);
      if (ap) { it.pos = ap.pos; it.yaw = ap.yaw; }
      it.actor = o.actor;
    }
    out.push(it);
  }
  return out;
}

// где актёр в момент t: старт → «Идти» по пути (примерно по скорости) → «Переместить»
export function actorPosAt(scene, actorId, t) {
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
export function validateObjects(scene, add, E, W) {
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
      if (!isP3(p.pos) && !(p.points || []).length) add(E, 'Свет ' + nm + ': не задано, где он стоит', sel);
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
