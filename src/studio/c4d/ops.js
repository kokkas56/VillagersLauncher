// Правки сцены-из-объектов в окне Студии: всё неизменяемо (возвращает новую сцену).
import {
  makeObject, uniqueObjId, objById, childrenOf, isDescendant, setChannel, setKey, removeKey, keyAt, isAnimated,
  propsAt, chanGet, CHANNELS, moveKeys, defaultProps, OBJ_LABEL
} from '../scene3d.js';
import { uniqueId } from '../model.js';

export const ID_BASE = { camera: 'cam', light: 'light', sound: 'snd', marker: 'mark', path: 'path', group: 'grp', cloner: 'clon', effector: 'eff', block: 'blk', template: 'tpl', actor: 'a_' };
const clone = (o) => JSON.parse(JSON.stringify(o));

export function nameFor(scene, type, base) {
  const label = base || OBJ_LABEL[type] || type;
  const names = new Set((scene.objects || []).map((o) => o.name));
  if (!names.has(label) && type !== 'camera') return label;
  let n = 1;
  while (names.has(label + ' ' + n)) n++;
  return label + ' ' + n;
}

export function patchObj(scene, id, fn) {
  return { ...scene, objects: scene.objects.map((o) => (o.id === id ? (typeof fn === 'function' ? fn(o) : { ...o, ...fn }) : o)) };
}
export function patchObjs(scene, ids, fn) {
  const s = new Set(ids);
  return { ...scene, objects: scene.objects.map((o) => (s.has(o.id) ? fn(o) : o)) };
}

// создать объект; opts: { parent, props, name, actor, at:[x,y,z] }
export function addObject(scene, type, opts = {}) {
  const id = uniqueObjId(scene, ID_BASE[type] || type);
  const props = { ...defaultProps(type), ...(opts.props || {}) };
  if (opts.at && Array.isArray(props.pos)) props.pos = opts.at.slice();
  if (opts.at && type === 'path') props.points = props.points.map((p) => [p[0] + opts.at[0], opts.at[1], p[2] + opts.at[2]]);
  if (type === 'path' && opts.at) props.pos = [0, 0, 0];
  const o = makeObject(type, id, opts.name || nameFor(scene, type), { parent: opts.parent || null, props, ...(opts.actor ? { actor: opts.actor } : {}) });
  let next = { ...scene, objects: [...(scene.objects || []), o] };
  // первая камера сразу попадает в «Монтаж»
  if (type === 'camera' && !(scene.stage || []).length) next = { ...next, stage: [{ t0: 0, t1: scene.length || 200, cam: id }] };
  return { scene: next, id };
}

// актёр: и в список актёров сцены (формат фазы 1), и объектом в дерево
export function addActorObject(scene, actor, parent) {
  const ids = (scene.actors || []).map((a) => a.id);
  const a = { ...actor, id: ids.includes(actor.id) ? uniqueId(actor.id, ids) : actor.id };
  const s1 = { ...scene, actors: [...(scene.actors || []), a] };
  return addObject(s1, 'actor', { actor: a.id, name: a.name || a.id, parent });
}

// удалить объекты вместе с детьми; актёр уходит из сцены вместе с дорожкой; камеры — из «Монтажа»
export function removeObjects(scene, ids) {
  const kill = new Set();
  for (const id of ids) { kill.add(id); for (const o of scene.objects) if (isDescendant(scene, o.id, id)) kill.add(o.id); }
  const gone = scene.objects.filter((o) => kill.has(o.id));
  const actorIds = new Set(gone.filter((o) => o.type === 'actor').map((o) => o.actor));
  return {
    ...scene,
    objects: scene.objects.filter((o) => !kill.has(o.id)).map((o) => (o.type === 'cloner' && (o.props.effectors || []).some((e) => kill.has(e)) ? { ...o, props: { ...o.props, effectors: o.props.effectors.filter((e) => !kill.has(e)), path: kill.has(o.props.path) ? null : o.props.path } } : o.type === 'cloner' && kill.has(o.props.path) ? { ...o, props: { ...o.props, path: null } } : o)),
    stage: (scene.stage || []).filter((b) => !kill.has(b.cam)),
    actors: (scene.actors || []).filter((a) => !actorIds.has(a.id)),
    tracks: (scene.tracks || []).filter((tr) => !(tr.kind === 'actor' && actorIds.has(tr.actor)))
  };
}

// Ctrl+D: копии с детьми, рядом (+1 по X)
export function cloneObjects(scene, ids) {
  let s = scene;
  const newIds = [];
  const top = ids.filter((id) => !ids.some((p) => p !== id && isDescendant(scene, id, p)));
  for (const id of top) {
    const src = objById(s, id);
    if (!src) continue;
    const family = [src, ...s.objects.filter((o) => isDescendant(s, o.id, id))];
    const map = {};
    for (const o of family) { map[o.id] = uniqueObjId(s, ID_BASE[o.type] || o.type); s = { ...s, objects: [...s.objects, { id: map[o.id], type: '_reserve' }] }; }
    s = { ...s, objects: s.objects.filter((o) => o.type !== '_reserve') };
    const copies = family.map((o) => {
      const c = clone(o);
      c.id = map[o.id];
      c.parent = o.id === id ? o.parent : map[o.parent] || o.parent;
      if (o.id === id) { c.name = nameFor(s, o.type, o.name.replace(/ \d+$/, '')); if (Array.isArray(c.props.pos)) c.props.pos = [c.props.pos[0] + 1, c.props.pos[1], c.props.pos[2]]; }
      if (c.type === 'cloner') c.props.effectors = (c.props.effectors || []).map((e) => map[e] || e);
      return c;
    });
    // актёра нельзя просто скопировать — копия актёра в сцене
    for (const c of copies) {
      if (c.type !== 'actor') continue;
      const a = (s.actors || []).find((x) => x.id === c.actor);
      if (!a) continue;
      const nid = uniqueId(a.id, s.actors.map((x) => x.id));
      s = { ...s, actors: [...s.actors, { ...clone(a), id: nid, name: (a.name || a.id) + ' (копия)', ...(a.kind === 'story' ? { kind: 'valley', who: 0 } : {}) }] };
      c.actor = nid;
    }
    s = { ...s, objects: [...s.objects, ...copies] };
    newIds.push(map[id]);
  }
  return { scene: s, ids: newIds };
}

// Alt+G: сгруппировать выбранные (группа встаёт на место первого)
export function groupObjects(scene, ids) {
  if (!ids.length) return { scene, id: null };
  const first = objById(scene, ids[0]);
  const parent = first ? first.parent || null : null;
  const r = addObject(scene, 'group', { parent, props: { pos: [0, 0, 0] } });
  let s = r.scene;
  const top = ids.filter((id) => !ids.some((p) => p !== id && isDescendant(scene, id, p)));
  s = { ...s, objects: s.objects.map((o) => (top.includes(o.id) ? { ...o, parent: r.id } : o)) };
  // группа — сразу после первого выбранного
  const g = s.objects.find((o) => o.id === r.id);
  const rest = s.objects.filter((o) => o.id !== r.id);
  const at = rest.findIndex((o) => o.id === ids[0]);
  rest.splice(Math.max(0, at), 0, g);
  return { scene: { ...s, objects: rest }, id: r.id };
}

// «В клонер»: выбранное становится детьми нового клонера
export function intoCloner(scene, ids, mode) {
  const first = objById(scene, ids[0]);
  const at = first && Array.isArray(first.props.pos) ? first.props.pos.slice() : [0, 64, 0];
  const r = addObject(scene, 'cloner', { parent: first ? first.parent || null : null, props: { pos: at, mode: mode || 'linear' } });
  let s = r.scene;
  s = { ...s, objects: s.objects.map((o) => (ids.includes(o.id) ? { ...o, parent: r.id } : o)) };
  if (!ids.length || !s.objects.some((o) => o.parent === r.id && ['block', 'template', 'actor', 'light'].includes(o.type))) {
    s = addObject(s, 'block', { parent: r.id }).scene;
  }
  return { scene: s, id: r.id };
}

// перетаскивание в дереве: mode = 'into' | 'before' | 'after'
export function moveInTree(scene, id, targetId, mode) {
  if (id === targetId) return scene;
  if (targetId && isDescendant(scene, targetId, id)) return scene; // нельзя в собственного потомка
  const o = objById(scene, id);
  if (!o) return scene;
  const t = targetId ? objById(scene, targetId) : null;
  const parent = mode === 'into' ? (t ? t.id : null) : t ? t.parent || null : null;
  const rest = scene.objects.filter((x) => x.id !== id);
  const moved = { ...o, parent };
  let idx = rest.length;
  if (t && mode !== 'into') { idx = rest.findIndex((x) => x.id === t.id); if (mode === 'after') { idx++; while (idx < rest.length && isDescendant({ objects: rest }, rest[idx].id, t.id)) idx++; } }
  rest.splice(idx, 0, moved);
  return { ...scene, objects: rest };
}

// правка канала с учётом автоключа
export function setChan(scene, id, ch, t, v, autoKey) { return patchObj(scene, id, (o) => setChannel(o, ch, t, v, autoKey)); }
export function setProp(scene, id, k, v) { return patchObj(scene, id, (o) => ({ ...o, props: { ...o.props, [k]: v } })); }

// ◇: есть ключ в этот момент на всех каналах → убрать, иначе поставить
export function toggleKeys(scene, id, chs, t) {
  const o = objById(scene, id);
  if (!o) return scene;
  const all = chs.every((ch) => keyAt(o, ch, t) >= 0);
  return patchObj(scene, id, (x) => chs.reduce((acc, ch) => (all ? removeKey(acc, ch, t) : setKey(acc, ch, t)), x));
}
export function keyState(o, chs, t) {
  if (!o) return 'none';
  const at = chs.filter((ch) => keyAt(o, ch, t) >= 0).length;
  if (at && at === chs.length) return 'key';
  if (at) return 'part';
  return chs.some((ch) => isAnimated(o, ch)) ? 'anim' : 'none';
}
// F9: ключ на все анимируемые каналы выбранных
export function keyAllSelected(scene, ids, t) {
  return patchObjs(scene, ids, (o) => (CHANNELS[o.type] || []).filter((ch) => ch !== 'play' && chanGet(propsAt(o, t), ch) !== undefined).reduce((acc, ch) => setKey(acc, ch, t), o));
}
export function retimeKey(scene, id, ch, from, to) { return patchObj(scene, id, (o) => moveKeys(o, ch, from, to)); }
export function retimeAllKeys(scene, id, from, to) { return patchObj(scene, id, (o) => Object.keys(o.anim || {}).reduce((acc, ch) => moveKeys(acc, ch, from, to), o)); }
export function deleteKeysAt(scene, id, chs, t) { return patchObj(scene, id, (o) => chs.reduce((acc, ch) => removeKey(acc, ch, t), o)); }
export function setKeyField(scene, id, ch, t, patch) {
  return patchObj(scene, id, (o) => {
    if (!isAnimated(o, ch)) return o;
    return { ...o, anim: { ...o.anim, [ch]: o.anim[ch].map((k) => (k.t === t ? { ...k, ...patch } : k)) } };
  });
}

// «Монтаж»
export function stageSet(scene, i, patch) { return { ...scene, stage: (scene.stage || []).map((b, j) => (j === i ? { ...b, ...patch } : b)) }; }
export function stageAdd(scene, cam, t0, t1) {
  const st = (scene.stage || []).slice();
  st.push({ t0, t1, cam });
  st.sort((a, b) => a.t0 - b.t0);
  return { ...scene, stage: st };
}
export function stageRemove(scene, i) { return { ...scene, stage: (scene.stage || []).filter((_, j) => j !== i) }; }
// камера встаёт с момента t до конца следующего блока: предыдущий блок укорачивается
export function stageCutAt(scene, cam, t) {
  const len = scene.length || 200;
  let st = (scene.stage || []).map((b) => ({ ...b }));
  const hit = st.find((b) => t >= b.t0 && t < b.t1);
  if (hit) {
    const end = hit.t1;
    if (t <= hit.t0) { hit.cam = cam; return { ...scene, stage: st }; }
    hit.t1 = t;
    st.push({ t0: t, t1: end, cam });
  } else {
    const next = st.filter((b) => b.t0 > t).sort((a, b) => a.t0 - b.t0)[0];
    st.push({ t0: t, t1: next ? next.t0 : len, cam });
  }
  st = st.sort((a, b) => a.t0 - b.t0);
  return { ...scene, stage: st };
}
