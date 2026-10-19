// Работа со сценой в редакторе: неизменяемые правки, дорожки, кривая камеры.
import { trackKeyOf, itemsOfTrack, defaultScene } from './validate.js';
import { VERB_DEFS } from './schema.js';

export { trackKeyOf, itemsOfTrack };

export const SNAP = 5;
export const FIXED_ROWS = ['fx', 'sound', 'subtitles', 'world'];

export function kindOfKey(key) { return key.startsWith('actor:') ? 'actor' : key; }

// при открытии: значения по умолчанию, дорожки-дубли сливаются
export function prepareScene(raw, id) {
  const d = defaultScene(id || raw.id, raw.title);
  const s = { ...d, ...raw, id: raw.id || id };
  s.world = { ...d.world, ...(raw.world || {}) };
  s.preload = { ...d.preload, ...(raw.preload || {}) };
  s.options = { ...d.options, ...(raw.options || {}), endPlayer: { ...d.options.endPlayer, ...((raw.options || {}).endPlayer || {}) } };
  s.actors = Array.isArray(raw.actors) ? raw.actors : [];
  const tracks = [];
  const by = {};
  for (const tr of Array.isArray(raw.tracks) ? raw.tracks : []) {
    if (!tr || !tr.kind) continue;
    const k = trackKeyOf(tr);
    const items = itemsOfTrack(tr);
    if (by[k]) { const t0 = by[k]; const f = t0.kind === 'camera' ? 'keys' : 'events'; t0[f] = [...t0[f], ...(Array.isArray(items) ? items : [])]; continue; }
    const c = { ...tr };
    if (c.kind === 'camera') c.keys = Array.isArray(items) ? items : []; else c.events = Array.isArray(items) ? items : [];
    by[k] = c;
    tracks.push(c);
  }
  // по времени (стабильно), чтобы порядок в файле не мешал
  for (const tr of tracks) { const f = tr.kind === 'camera' ? 'keys' : 'events'; tr[f] = tr[f].filter((e) => e && typeof e === 'object').slice().sort((a, b) => (a.t || 0) - (b.t || 0)); }
  s.actors = s.actors.map((a) => (a && a.kind !== 'player' ? { existing: false, despawnAtEnd: true, ...a } : a));
  if (!by.camera) tracks.unshift({ kind: 'camera', keys: [] });
  s.tracks = tracks;
  return s;
}

export function findTrack(scene, key) { return scene.tracks.findIndex((t) => trackKeyOf(t) === key); }
export function getItems(scene, key) { const i = findTrack(scene, key); return i < 0 ? [] : itemsOfTrack(scene.tracks[i]); }
export function getItem(scene, sel) { if (!sel || sel.track == null) return null; return getItems(scene, sel.track)[sel.i] || null; }

// заменить список событий дорожки (дорожка создаётся при надобности)
export function setItems(scene, key, fn) {
  let i = findTrack(scene, key);
  const tracks = scene.tracks.slice();
  if (i < 0) {
    const kind = kindOfKey(key);
    const tr = kind === 'actor' ? { kind, actor: key.slice(6), events: [] } : kind === 'camera' ? { kind, keys: [] } : { kind, events: [] };
    tracks.push(tr);
    i = tracks.length - 1;
  }
  const tr = { ...tracks[i] };
  const f = tr.kind === 'camera' ? 'keys' : 'events';
  tr[f] = fn((tr[f] || []).slice());
  tracks[i] = tr;
  return { ...scene, tracks };
}
export function patchItem(scene, sel, patch) {
  return setItems(scene, sel.track, (arr) => { arr[sel.i] = typeof patch === 'function' ? patch(arr[sel.i]) : { ...arr[sel.i], ...patch }; return arr; });
}
export function removeItem(scene, sel) { return setItems(scene, sel.track, (arr) => { arr.splice(sel.i, 1); return arr; }); }

// отсортировать дорожку по времени; вернуть новую сцену и новый индекс выбранного
export function sortTrack(scene, key, selObj) {
  const items = getItems(scene, key);
  let sorted = true;
  for (let i = 1; i < items.length; i++) if (items[i].t < items[i - 1].t) { sorted = false; break; }
  if (sorted) return { scene, index: selObj ? items.indexOf(selObj) : -1 };
  const next = setItems(scene, key, (arr) => arr.sort((a, b) => a.t - b.t));
  return { scene: next, index: selObj ? getItems(next, key).indexOf(selObj) : -1 };
}

export function newEvent(key, verb, t) {
  const kind = kindOfKey(key);
  const def = (VERB_DEFS[kind] || {})[verb];
  const base = JSON.parse(JSON.stringify((def && def.def) || {}));
  if (kind === 'camera' || kind === 'subtitles') return { t, ...base };
  return { t, do: verb, ...base };
}

// get/set по пути «a.b.c»
export function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
export function setPath(o, p, v) {
  const ks = p.split('.');
  const rec = (obj, i) => {
    const c = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
    if (i === ks.length - 1) { if (v === undefined) delete c[ks[i]]; else c[ks[i]] = v; } else c[ks[i]] = rec(c[ks[i]], i + 1);
    return c;
  };
  return rec(o, 0);
}

export function renameActor(scene, from, to) {
  const fix = (v) => (v === 'actor:' + from ? 'actor:' + to : v);
  return {
    ...scene,
    actors: scene.actors.map((a) => (a.id === from ? { ...a, id: to } : a)),
    tracks: scene.tracks.map((tr) => {
      const c = { ...tr };
      if (c.kind === 'actor' && c.actor === from) c.actor = to;
      if (c.keys) c.keys = c.keys.map((k) => (k.look === 'actor:' + from ? { ...k, look: fix(k.look) } : k));
      if (c.events) c.events = c.events.map((e) => (e.at === 'actor:' + from ? { ...e, at: fix(e.at) } : e));
      return c;
    })
  };
}

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slug(text, fallback = 'scene') {
  const s = String(text || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return s || fallback;
}
export function uniqueId(base, taken) {
  let id = base, n = 2;
  while (taken.includes(id)) id = base + '_' + n++;
  return id;
}

export function fmtTicks(t) {
  const s = t / 20;
  if (s < 60) return (Math.round(s * 10) / 10).toString().replace('.', ',') + ' с';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// кривая Катмулла — Рома по ключам камеры (для показа в мире)
export function catmull(pts, per = 8) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out.map((p) => p.map((v) => Math.round(v * 100) / 100));
}

// что показать в мире: кривая камеры, ключи, пути, метки
export function gizmosOf(scene) {
  const isP = (p) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number');
  const cam = getItems(scene, 'camera').filter((k) => isP(k.pos)).slice().sort((a, b) => a.t - b.t);
  const name = (id) => { const a = scene.actors.find((x) => x.id === id); return a ? a.name || a.id : id; };
  const paths = [];
  const markers = [];
  scene.actors.forEach((a) => { if (a.spawn && isP(a.spawn.pos)) markers.push({ pos: a.spawn.pos, label: (a.name || a.id) + ' — старт', kind: 'actor' }); });
  for (const tr of scene.tracks) {
    if (tr.kind === 'camera') continue;
    for (const e of tr.events || []) {
      if (e.do === 'walk' && Array.isArray(e.path) && e.path.length) paths.push({ actor: tr.actor, label: name(tr.actor) + ' · ' + (Math.round(e.t / 2) / 10) + ' с', points: e.path.filter(isP) });
      else if (isP(e.pos)) markers.push({ pos: e.pos, label: (tr.kind === 'actor' ? name(tr.actor) + ': ' : '') + (e.do || '') + ' · ' + (Math.round(e.t / 2) / 10) + ' с', kind: tr.kind });
    }
  }
  // формат, который понимает игра (StudioGizmos): camera — массив ключей, paths — массивы точек, points — метки
  return {
    sceneId: scene.id,
    camera: cam.map((k) => ({ t: k.t, pos: k.pos, yaw: k.yaw || 0, pitch: k.pitch || 0, fov: k.fov || 70 })),
    paths: paths.map((p) => p.points),
    points: markers.map((m) => ({ pos: m.pos, label: m.label })),
    labels: { paths: paths.map((p) => p.label), points: markers.map((m) => m.label) }
  };
}
