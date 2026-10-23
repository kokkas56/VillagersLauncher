// «Анимации»: правки файла анимации — чистые функции (старый объект не меняется).
import { CHANNELS, CHANNEL_DEF, sampleKeys, r3, mirrorTracks, mirrorBones, customBones, CUSTOM_MAX } from './animCore.js';

const clone = (a) => JSON.parse(JSON.stringify(a));
const sortK = (keys) => keys.sort((x, y) => x.t - y.t);

/** Ключ кости/канала в момент t (заменяет, если уже есть; плавность ключа сохраняется). */
export function setKey(anim, bone, ch, t, v, extra) {
  const a = clone(anim);
  const tr = a.tracks[bone] || (a.tracks[bone] = {});
  const keys = tr[ch] || (tr[ch] = []);
  const i = keys.findIndex((k) => k.t === t);
  const val = v.map((x) => r3(x));
  if (i >= 0) keys[i] = { ...keys[i], v: val, ...(extra || {}) };
  else keys.push({ t, v: val, ...(extra || {}) });
  sortK(keys);
  return a;
}
/** Одна компонента ключа (x/y/z); если ключа нет — берёт текущее значение кривой. */
export function setKeyComp(anim, bone, ch, t, c, val) {
  const cur = valueAt(anim, bone, ch, t);
  cur[c] = val;
  return setKey(anim, bone, ch, t, cur);
}
export function valueAt(anim, bone, ch, t) {
  const tr = anim.tracks[bone];
  const v = tr && sampleKeys(tr[ch], t);
  return v || CHANNEL_DEF[ch].slice();
}
export function hasKey(anim, bone, ch, t) { const tr = anim.tracks[bone]; return !!(tr && tr[ch] && tr[ch].some((k) => k.t === t)); }
export function isAnimated(anim, bone, ch) { const tr = anim.tracks[bone]; return !!(tr && tr[ch] && tr[ch].length); }
/** Состояние ◇: key — ключ сейчас, anim — анимировано, none — нет ключей. */
export function keyState(anim, bone, ch, t) { return hasKey(anim, bone, ch, t) ? 'key' : isAnimated(anim, bone, ch) ? 'anim' : 'none'; }

function prune(a) {
  for (const b of Object.keys(a.tracks)) {
    for (const ch of CHANNELS) if (a.tracks[b][ch] && !a.tracks[b][ch].length) delete a.tracks[b][ch];
    if (!Object.keys(a.tracks[b]).length) delete a.tracks[b];
  }
  return a;
}
const kid = (k) => k.bone + '\u0000' + k.ch + '\u0000' + k.t;
/** Выбор ключей «кость в момент t» → все каналы. */
export function expandBoneKeys(anim, bone, t) {
  const tr = anim.tracks[bone] || {};
  return CHANNELS.filter((ch) => (tr[ch] || []).some((k) => k.t === t)).map((ch) => ({ bone, ch, t }));
}
export function allKeys(anim) {
  const out = [];
  for (const [b, tr] of Object.entries(anim.tracks)) for (const ch of CHANNELS) for (const k of tr[ch] || []) out.push({ bone: b, ch, t: k.t });
  return out;
}
export function deleteKeys(anim, sel) {
  const a = clone(anim);
  const s = new Set(sel.map(kid));
  for (const [b, tr] of Object.entries(a.tracks)) for (const ch of CHANNELS) if (tr[ch]) tr[ch] = tr[ch].filter((k) => !s.has(kid({ bone: b, ch, t: k.t })));
  return prune(a);
}
/** Сдвинуть выбранные ключи на dt (не раньше 0); ключи, на которые наехали, заменяются. */
export function shiftKeys(anim, sel, dt, dv) {
  const a = clone(anim);
  const s = new Set(sel.map(kid));
  for (const [b, tr] of Object.entries(a.tracks)) for (const ch of CHANNELS) {
    if (!tr[ch]) continue;
    const moving = [], stay = [];
    for (const k of tr[ch]) (s.has(kid({ bone: b, ch, t: k.t })) ? moving : stay).push(k);
    if (!moving.length) continue;
    const moved = moving.map((k) => ({ ...k, t: Math.max(0, k.t + dt), v: dv ? k.v.map((x, c) => r3(x + (dv[c] || 0))) : k.v }));
    const times = new Set(moved.map((k) => k.t));
    tr[ch] = sortK([...stay.filter((k) => !times.has(k.t)), ...moved]);
  }
  return a;
}
export function setEase(anim, sel, ease, bz) {
  const a = clone(anim);
  const s = new Set(sel.map(kid));
  for (const [b, tr] of Object.entries(a.tracks)) for (const ch of CHANNELS) for (const k of tr[ch] || []) {
    if (!s.has(kid({ bone: b, ch, t: k.t }))) continue;
    if (!ease || ease === 'smooth') delete k.ease; else k.ease = ease;
    if (ease === 'bezier') k.bz = bz || k.bz || [0.42, 0, 0.58, 1]; else delete k.bz;
  }
  return a;
}
/** Копия ключей: { t0, items:[{ bone, ch, dt, key }] } */
export function copyKeys(anim, sel) {
  if (!sel.length) return null;
  const t0 = Math.min(...sel.map((k) => k.t));
  const items = [];
  for (const k of sel) { const key = ((anim.tracks[k.bone] || {})[k.ch] || []).find((x) => x.t === k.t); if (key) items.push({ bone: k.bone, ch: k.ch, dt: k.t - t0, key: clone(key) }); }
  return { t0, items, bones: [...new Set(items.map((x) => x.bone))] };
}
/** Вставить с момента t. Если скопирована одна кость, а выбрана другая — на выбранную. */
export function pasteKeys(anim, clip, t, toBone) {
  if (!clip || !clip.items.length) return { anim, keys: [] };
  let a = clone(anim);
  const one = clip.bones.length === 1 && toBone && toBone !== clip.bones[0];
  const keys = [];
  for (const it of clip.items) {
    const bone = one ? toBone : it.bone;
    const tt = t + it.dt;
    const tr = a.tracks[bone] || (a.tracks[bone] = {});
    const ks = tr[it.ch] || (tr[it.ch] = []);
    const i = ks.findIndex((k) => k.t === tt);
    const nk = { ...clone(it.key), t: tt };
    if (i >= 0) ks[i] = nk; else ks.push(nk);
    sortK(ks);
    keys.push({ bone, ch: it.ch, t: tt });
  }
  return { anim: a, keys };
}
/** Ключ на кость по текущей позе. all (по умолчанию) — сразу поворот, сдвиг и размер по всем осям;
 *  false — поворот всегда, сдвиг/размер — только если они уже анимированы. */
export function keyBone(anim, bone, t, chs, all = true) {
  let a = anim;
  const list = chs || CHANNELS.filter((ch) => all || ch === 'rot' || isAnimated(anim, bone, ch));
  for (const ch of list) a = setKey(a, bone, ch, t, valueAt(a, bone, ch, t));
  return a;
}
/** Отразить: всю анимацию (лево ↔ право) или только позу в момент t. */
export function mirrorAll(anim) { const a = clone(anim); a.tracks = mirrorTracks(a.tracks); if (Array.isArray(a.bones) && a.bones.length) a.bones = mirrorBones(a.bones); return a; }
export function mirrorPoseAt(anim, t, bones) {
  let a = anim;
  const pairs = [['right_arm', 'left_arm'], ['right_leg', 'left_leg'], ['ear_r', 'ear_l'], ['chest_r', 'chest_l']];
  const vals = {};
  for (const [r, l] of pairs) for (const b of [r, l]) for (const ch of CHANNELS) vals[b + '.' + ch] = valueAt(anim, b, ch, t);
  for (const [r, l] of pairs) {
    if (bones && !bones.includes(r) && !bones.includes(l)) continue;
    for (const ch of CHANNELS) {
      if (!isAnimated(anim, r, ch) && !isAnimated(anim, l, ch)) continue;
      const m = (v) => (ch === 'rot' ? [v[0], -v[1], -v[2]] : ch === 'pos' ? [-v[0], v[1], v[2]] : v.slice());
      a = setKey(a, r, ch, t, m(vals[l + '.' + ch]));
      a = setKey(a, l, ch, t, m(vals[r + '.' + ch]));
    }
  }
  for (const b of ['body', 'head', 'root']) {
    if (bones && !bones.includes(b)) continue;
    if (isAnimated(anim, b, 'rot')) { const v = valueAt(anim, b, 'rot', t); a = setKey(a, b, 'rot', t, [v[0], -v[1], -v[2]]); }
  }
  return a;
}
/** Растянуть/сжать всю анимацию до новой длины (ключи и события пропорционально). */
export function retime(anim, len) {
  const a = clone(anim);
  const f = len / Math.max(1, a.length);
  for (const tr of Object.values(a.tracks)) for (const ch of CHANNELS) if (tr[ch]) {
    const seen = new Map();
    for (const k of tr[ch]) seen.set(Math.round(k.t * f), { ...k, t: Math.round(k.t * f) });
    tr[ch] = sortK([...seen.values()]);
  }
  a.events = (a.events || []).map((e) => ({ ...e, t: Math.round(e.t * f) }));
  a.length = Math.max(1, Math.round(len));
  return a;
}
/** Удалить всю дорожку кости (или канал). */
export function clearBone(anim, bone, ch) {
  const a = clone(anim);
  if (!a.tracks[bone]) return a;
  if (ch) delete a.tracks[bone][ch]; else delete a.tracks[bone];
  return prune(a);
}

// ---------- свои кости (группа, предмет, кубик) ----------
/** Свободный id x_<основа><n>. */
export function customId(anim, base) {
  const taken = new Set([...customBones(anim).map((b) => b.id), ...Object.keys(anim.tracks || {})]);
  for (let i = 1; i < 1000; i++) { const id = 'x_' + base + i; if (!taken.has(id)) return id; }
  return 'x_' + base + Date.now();
}
/** Добавить свою кость (null — больше нельзя). */
export function addCustomBone(anim, bone) {
  if (customBones(anim).length >= CUSTOM_MAX) return null;
  const a = clone(anim);
  a.bones = [...(a.bones || []), clone(bone)];
  return a;
}
export function updateCustomBone(anim, id, patch) {
  const a = clone(anim);
  a.bones = (a.bones || []).map((b) => (b.id === id ? { ...b, ...clone(patch) } : b));
  return a;
}
/** Потомки своей кости (свои кости, что висят на ней прямо или через других). */
export function customDescendants(anim, id) {
  const out = new Set([id]);
  let grow = true;
  while (grow) { grow = false; for (const b of customBones(anim)) if (!out.has(b.id) && out.has(b.parent)) { out.add(b.id); grow = true; } }
  out.delete(id);
  return out;
}
/** Удалить свою кость вместе с её ключами; её дети переходят к её родителю, кости тела из группы — на место. */
export function removeCustomBone(anim, id) {
  const a = clone(anim);
  const me = (a.bones || []).find((b) => b.id === id);
  if (!me) return anim;
  a.bones = a.bones.filter((b) => b.id !== id).map((b) => (b.parent === id ? { ...b, parent: me.parent } : b));
  delete a.tracks[id];
  if (a.modes) delete a.modes[id];
  if (a.springs) delete a.springs[id];
  return a;
}
/** Положить кость тела в группу или вынуть (из других групп она уходит сама). */
export function setGroupChild(anim, gid, bone, on) {
  const a = clone(anim);
  a.bones = (a.bones || []).map((b) => {
    if (b.kind !== 'group') return b;
    const ch = (b.children || []).filter((c) => c !== bone);
    if (b.id === gid && on) ch.push(bone);
    return { ...b, children: ch };
  });
  return a;
}

export { kid as keyId };
