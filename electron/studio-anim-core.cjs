// АВТОГЕНЕРАЦИЯ из src/studio/anim/animCore.js и animLib.js (node scripts/sync-anims.cjs) — не править руками.
'use strict';
// «Анимации» Студии Кокка — общее ядро: формат анимации, вычисление позы, кости и модели, пружины («веса»), проверка.
// Без import: scripts/sync-anims.cjs делает из этого файла (и animLib.js) electron/studio-anim-core.cjs для «Собрать».
// Тот же расчёт — в игре (SkinKokk, ru.kokk.skinkokk.anim): оси, углы, плавность, наклон туловища от пояса.
//
// Пространство модели — как у ModelPart в Minecraft: пиксели (1/16 блока), Y вниз, лицо смотрит в −Z, правая сторона
// модели — −X. Углы в файле — градусы, поворот Rz·Ry·Rx (как ModelPart.translateAndRotate).

const ANIM_V = 1;
const TICKS = 20;
const SAFE_ID = /^[a-z0-9_.-]{1,64}$/;
const DEG = Math.PI / 180;

const BONE_RU = {
  root: 'Всё тело', body: 'Туловище', head: 'Голова', hat: 'Шапка (слой головы)', right_arm: 'Правая рука', left_arm: 'Левая рука',
  right_leg: 'Правая нога', left_leg: 'Левая нога', arms: 'Руки скрещены', nose: 'Нос',
  chest_l: 'Грудь (лев.)', chest_r: 'Грудь (прав.)', ear_l: 'Ухо (лев.)', ear_r: 'Ухо (прав.)', cape: 'Плащ'
};
function boneRu(b) {
  if (BONE_RU[b]) return BONE_RU[b];
  let m = /^tail_(\d+)$/.exec(b); if (m) return 'Хвост ' + m[1];
  m = /^hair_(?:([a-z]+)_)?(\d+)$/.exec(b); if (m) return 'Волосы ' + (m[1] ? m[1] + ' ' : '') + m[2];
  m = /^x_(.+)$/.exec(b); if (m) return 'Деталь ' + m[1];
  return b;
}
const BONE_HINT = {
  root: 'Вся модель целиком: сдвиг (присесть, подпрыгнуть, лечь) и поворот вокруг ступней. Для «лечь» — поворот X −90.',
  body: 'Туловище. Наклоняется от пояса и несёт с собой голову и руки (поклон, присед). Ноги остаются на месте.',
  head: 'Голова: X — кивок (+ вниз, − вверх), Y — повернуть (+ влево от модели), Z — склонить к плечу.',
  hat: 'Слой головы (шапка, волосы скина). Обычно двигается вместе с головой — трогать не нужно.',
  right_arm: 'Правая рука от плеча: X − вперёд/вверх (−90 — вперёд, −180 — вверх), Z + в сторону.',
  left_arm: 'Левая рука от плеча: X − вперёд/вверх (−90 — вперёд, −180 — вверх), Z − в сторону.',
  right_leg: 'Правая нога от бедра: X − вперёд (шаг, сесть), + назад.',
  left_leg: 'Левая нога от бедра: X − вперёд (шаг, сесть), + назад.',
  arms: 'У жителей руки скрещены одной деталью. Ключи на «Правой/Левой руке» сами раскрестят их.',
  nose: 'Нос жителя (двигается с головой).'
};
const TARGETS = [
  ['any_humanoid', 'Любой человечек', 'Игроки, жители, жители долины, зомби и все, у кого модель как у человека.'],
  ['player', 'Игрок', 'Только игроки (эмоции, позы).'],
  ['villager', 'Житель', 'Жители и горожане Villagers, Kokk: руки раскрещиваются сами, если анимация двигает руки.'],
  ['valley', 'Житель долины', 'Жители долины Kokk Story (модель игрока со своими скинами).']
];
const CATS = [
  ['greet', 'Приветствия'], ['talk', 'Разговор'], ['emotion', 'Чувства'], ['work', 'Работа'], ['combat', 'Бой'],
  ['rest', 'Отдых и позы'], ['dance', 'Танцы'], ['misc', 'Разное']
];
const EASES = [
  ['smooth', 'Плавно', 'Мягкий разгон и торможение (по умолчанию).'],
  ['linear', 'Ровно', 'Одна скорость до следующего ключа.'],
  ['step', 'Ступенька', 'Держит позу, потом мгновенно прыгает в следующую.'],
  ['in', 'Разгон', 'Медленно начинает, быстро приходит — удар, падение.'],
  ['out', 'Торможение', 'Быстро начинает, мягко приходит — взмах, подъём руки.'],
  ['back', 'С перелётом', 'Чуть проскакивает дальше и возвращается — живо и упруго.'],
  ['bounce', 'Отскок', 'Приходит и пару раз отскакивает — приземление, падение.'],
  ['bezier', 'Своя кривая', 'Кривая Безье по четырём числам (как в CSS cubic-bezier).']
];
const EASE_RU = Object.fromEntries(EASES.map(([k, l]) => [k, l]));
const MODES = [['add', 'Добавить', 'Поза прибавляется к обычной: ходьба, взгляд и взмах руки остаются живыми.'], ['replace', 'Заменить', 'Поза полностью заменяет обычную у этой кости.']];
const CHANNELS = ['rot', 'pos', 'scale'];
const CHANNEL_RU = { rot: 'Поворот', pos: 'Сдвиг', scale: 'Размер' };
const CHANNEL_UNIT = { rot: '°', pos: 'пикс.', scale: '×' };
const CHANNEL_DEF = { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] };
const SPRING_DEF = { stiffness: 0.35, damping: 0.3, gravity: 0.3, limit: 35, inherit: 1, strength: 1 };
const SPRING_FIELDS = [
  ['stiffness', 'Упругость', 0, 1, 0.01, 'Как быстро кость возвращается на место: 0 — болтается, 1 — жёсткая.'],
  ['damping', 'Затухание', 0, 1, 0.01, 'Как быстро стихает раскачка: 0 — качается долго, 1 — без перелёта.'],
  ['gravity', 'Тяжесть', 0, 1, 0.01, 'Насколько кость свисает вниз, когда тело наклоняется.'],
  ['limit', 'Предел, °', 0, 120, 1, 'Наибольший отклон от покоя в градусах.'],
  ['inherit', 'Цепь', 0, 1, 0.01, 'Сколько раскачки берёт от предыдущего звена (хвост, волосы).'],
  ['strength', 'Сила', 0, 2, 0.01, 'Общий множитель (у игрока ещё и настройка «физика»).']
];
const EVENT_KINDS = [
  ['sound', 'Звук', 'Звук у существа: id звука, громкость, высота.'],
  ['particle', 'Частицы', 'Частицы у кости или у ног: id частиц, сколько, разброс.'],
  ['face', 'Лицо', 'Лицо жителя долины (Kokk Story): smile, sad, surprise… Срабатывает на сервере.'],
  ['signal', 'Сигнал', 'Сигнал схемам Kokk Story (событие «Сигнал», в нём — кто играл анимацию). Срабатывает на сервере.']
];

// ---------- математика ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const r3 = (n) => Math.round(n * 1000) / 1000;

function cubicBezier(x1, y1, x2, y2, x) {
  // y по x на кривой (0,0)-(x1,y1)-(x2,y2)-(1,1): Ньютон + деление пополам
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const e = fx(t) - x;
    if (Math.abs(e) < 1e-5) break;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= e / d;
  }
  if (t < 0 || t > 1 || Math.abs(fx(t) - x) > 1e-3) {
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = fx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
  }
  return ((ay * t + by) * t + cy) * t;
}
/** u 0..1 → 0..1 по плавности ключа. Одинаково в игре (Ease.java). */
function ease(name, u, bz) {
  u = clamp(u, 0, 1);
  switch (name) {
    case 'linear': return u;
    case 'step': return u >= 1 ? 1 : 0;
    case 'in': return u * u * u;
    case 'out': { const v = 1 - u; return 1 - v * v * v; }
    case 'back': { const c1 = 1.70158, c3 = c1 + 1; const v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
    case 'bounce': {
      const n1 = 7.5625, d1 = 2.75;
      let x = u;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
      if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
      x -= 2.625 / d1; return n1 * x * x + 0.984375;
    }
    case 'bezier': {
      const b = Array.isArray(bz) && bz.length === 4 ? bz : [0.42, 0, 0.58, 1];
      return cubicBezier(clamp(b[0], 0, 1), b[1], clamp(b[2], 0, 1), b[3], u);
    }
    default: return u * u * (3 - 2 * u); // smooth
  }
}

/** Значение дорожки (ключи [{t, v:[x,y,z], ease, bz}]) в момент t; null — ключей нет. */
function sampleKeys(keys, t) {
  if (!Array.isArray(keys) || !keys.length) return null;
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0;
  while (i < n - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v.slice();
  const e = ease(a.ease || 'smooth', (t - a.t) / span, a.bz);
  return [0, 1, 2].map((c) => num(a.v[c], 0) + (num(b.v[c], 0) - num(a.v[c], 0)) * e);
}

/** Вес анимации в момент t (вход/выход), как в игре. Для зацикленной — только вход. */
function blendWeight(anim, t, playedTicks) {
  const bi = Math.max(0, num(anim.blendIn, 0)), bo = Math.max(0, num(anim.blendOut, 0));
  let w = 1;
  const p = playedTicks == null ? t : playedTicks;
  if (bi > 0 && p < bi) w = ease('smooth', p / bi);
  if (!anim.loop && !anim.stay && bo > 0) { const left = anim.length - t; if (left < bo) w = Math.min(w, ease('smooth', Math.max(0, left) / bo)); }
  return w;
}

// матрицы 3×3 построчно
function rotZYX(x, y, z) {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx
  ];
}
function eulerZYX(m) {
  const sy = -m[6];
  if (Math.abs(sy) < 0.99999) return [Math.atan2(m[7], m[8]), Math.asin(clamp(sy, -1, 1)), Math.atan2(m[3], m[0])];
  return [Math.atan2(-m[5], m[4]), sy > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
}
function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const tr3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const app3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function axisAngle(ax, a) {
  const [x, y, z] = ax, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// ---------- модели (кости, кубы, развёртка как в ванильных моделях) ----------
// cube: { from:[x,y,z], size:[w,h,d], uv:[u,v], inflate, mirror }
const C = (from, size, uv, inflate, mirror) => ({ from, size, uv, inflate: inflate || 0, mirror: !!mirror });
const WAIST = [0, 12, 0];
const FEET = [0, 24, 0];

function playerRig(slim) {
  const aw = slim ? 3 : 4;
  const ay = slim ? 2.5 : 2;
  return {
    kind: 'player', tex: 64, slim: !!slim,
    bones: [
      { name: 'head', pivot: [0, 0, 0], cubes: [C([-4, -8, -4], [8, 8, 8], [0, 0])], carried: true },
      { name: 'hat', parent: 'head', follows: 'head', pivot: [0, 0, 0], cubes: [C([-4, -8, -4], [8, 8, 8], [32, 0], 0.5)], overlay: true, carried: true },
      { name: 'body', pivot: [0, 0, 0], cubes: [C([-4, 0, -2], [8, 12, 4], [16, 16]), C([-4, 0, -2], [8, 12, 4], [16, 32], 0.25)] },
      { name: 'right_arm', pivot: [-5, ay, 0], cubes: [C([slim ? -2 : -3, -2, -2], [aw, 12, 4], [40, 16]), C([slim ? -2 : -3, -2, -2], [aw, 12, 4], [40, 32], 0.25)], carried: true },
      { name: 'left_arm', pivot: [5, ay, 0], cubes: [C([-1, -2, -2], [aw, 12, 4], [32, 48]), C([-1, -2, -2], [aw, 12, 4], [48, 48], 0.25)], carried: true },
      { name: 'right_leg', pivot: [-1.9, 12, 0], cubes: [C([-2, 0, -2], [4, 12, 4], [0, 16]), C([-2, 0, -2], [4, 12, 4], [0, 32], 0.25)] },
      { name: 'left_leg', pivot: [1.9, 12, 0], cubes: [C([-2, 0, -2], [4, 12, 4], [16, 48]), C([-2, 0, -2], [4, 12, 4], [0, 48], 0.25)] }
    ]
  };
}
function villagerRig() {
  return {
    kind: 'villager', tex: 64,
    bones: [
      { name: 'head', pivot: [0, 0, 0], cubes: [C([-4, -10, -4], [8, 10, 8], [0, 0])], carried: true },
      { name: 'hat', parent: 'head', follows: 'head', pivot: [0, 0, 0], cubes: [C([-4, -10, -4], [8, 10, 8], [32, 0], 0.51)], overlay: true, carried: true },
      { name: 'nose', parent: 'head', pivot: [0, -2, 0], cubes: [C([-1, -1, -6], [2, 4, 2], [24, 0])], carried: true },
      { name: 'body', pivot: [0, 0, 0], cubes: [C([-4, 0, -3], [8, 12, 6], [16, 20]), C([-4, 0, -3], [8, 20, 6], [0, 38], 0.5)] },
      { name: 'arms', pivot: [0, 3, -1], rest: [-42.97, 0, 0], cubes: [C([-4, 2, -2], [8, 4, 4], [40, 38]), C([-8, -2, -2], [4, 8, 4], [44, 22]), C([4, -2, -2], [4, 8, 4], [44, 22], 0, true)], carried: true, crossed: true },
      { name: 'right_arm', pivot: [-6, 2, 0], scale: [1, 1.45, 1], cubes: [C([-2, -2, -2], [4, 8, 4], [44, 22])], carried: true, free: true },
      { name: 'left_arm', pivot: [6, 2, 0], scale: [1, 1.45, 1], cubes: [C([-2, -2, -2], [4, 8, 4], [44, 22], 0, true)], carried: true, free: true },
      { name: 'right_leg', pivot: [-2, 12, 0], cubes: [C([-2, 0, -2], [4, 12, 4], [0, 22])] },
      { name: 'left_leg', pivot: [2, 12, 0], cubes: [C([-2, 0, -2], [4, 12, 4], [0, 22], 0, true)] }
    ]
  };
}
const RIG_BONES = { player: ['root', 'body', 'head', 'hat', 'right_arm', 'left_arm', 'right_leg', 'left_leg'], villager: ['root', 'body', 'head', 'nose', 'arms', 'right_arm', 'left_arm', 'right_leg', 'left_leg'] };

/** Обычная поза «стоит» или «идёт» (ванильная ходьба: размах рук и ног). phase — тики ходьбы. */
function vanillaPose(rig, walk) {
  const out = {};
  for (const b of rig.bones) out[b.name] = { rot: (b.rest || [0, 0, 0]).map((d) => d * DEG), pos: b.pivot.slice(), scale: (b.scale || [1, 1, 1]).slice() };
  if (walk && walk.amount > 0) {
    const p = walk.phase * 0.6662, a = walk.amount;
    const sw = Math.cos(p) * a;
    if (rig.kind === 'player') {
      out.right_arm.rot[0] += Math.cos(p + Math.PI) * 2 * a * 0.5;
      out.left_arm.rot[0] += sw * 2 * 0.5;
    }
    out.right_leg.rot[0] += sw * 1.4;
    out.left_leg.rot[0] += Math.cos(p + Math.PI) * 1.4 * a;
  }
  return out;
}

/** Нужна ли жителю «свободные руки»: анимация двигает правую или левую руку. */
function usesFreeArms(anim) {
  const tr = (anim && anim.tracks) || {};
  return ['right_arm', 'left_arm'].some((b) => tr[b] && CHANNELS.some((c) => Array.isArray(tr[b][c]) && tr[b][c].length));
}
function boneMode(anim, bone) { return (anim.modes && anim.modes[bone]) || anim.mode || 'add'; }

/** Значения анимации в момент t по костям: { bone: { rot:[°], pos:[px], scale:[×] } } (только то, что есть в дорожках). */
function animValues(anim, t) {
  const out = {};
  for (const [bone, tr] of Object.entries((anim && anim.tracks) || {})) {
    if (!tr) continue;
    const o = {};
    for (const ch of CHANNELS) { const v = sampleKeys(tr[ch], t); if (v) o[ch] = v; }
    if (Object.keys(o).length) out[bone] = o;
  }
  return out;
}

/**
 * Поза модели: локальные позы костей + мировые матрицы. Как AnimApply.java:
 * 1) обычная поза (vanillaPose), 2) по каждой кости — «добавить» или «заменить» с весом w,
 * 3) наклон туловища вокруг пояса (0,12,0) несёт голову, шапку, нос и руки, 4) корень — вокруг ступней.
 * extra: доп. кости персонажа [{name,parent,pivot,rot,cubes}] — висят на своих родителях.
 * Возврат: { bones: { name: { M:[9], P:[3], local:[9], parentM:[9], rot:[рад], pos, scale, visible } }, freeArms }
 */
function solvePose(rig, anim, t, opts) {
  const o = opts || {};
  const w = o.weight == null ? 1 : o.weight;
  const vals = o.values || (anim ? animValues(anim, t) : {});
  const base = vanillaPose(rig, o.walk);
  const pose = {};
  for (const b of rig.bones) pose[b.name] = { rot: base[b.name].rot.slice(), pos: base[b.name].pos.slice(), scale: base[b.name].scale.slice(), restRot: base[b.name].rot.slice() };
  const freeArms = rig.kind === 'villager' && (o.freeArms != null ? o.freeArms : usesFreeArms(anim));
  const applyBone = (name, p, v) => {
    if (!v) return;
    const mode = anim ? boneMode(anim, name) : 'add';
    if (v.rot) for (let c = 0; c < 3; c++) p.rot[c] = mode === 'replace' ? p.rot[c] + (v.rot[c] * DEG - p.rot[c]) * w : p.rot[c] + v.rot[c] * DEG * w;
    if (v.pos) for (let c = 0; c < 3; c++) p.pos[c] += v.pos[c] * w;
    if (v.scale) for (let c = 0; c < 3; c++) p.scale[c] *= 1 + (v.scale[c] - 1) * w;
  };
  for (const b of rig.bones) applyBone(b.name, pose[b.name], vals[b.name]);
  // шапка — копия головы плюс свои ключи
  if (pose.hat && pose.head) { const hv = vals.hat; pose.hat.rot = pose.head.rot.slice(); pose.hat.pos = pose.head.pos.slice(); pose.hat.scale = pose.head.scale.slice(); if (hv) applyBone('hat', pose.hat, hv); }
  // наклон туловища от пояса
  const body = pose.body;
  const D = body ? mul3(rotZYX(body.rot[0], body.rot[1], body.rot[2]), tr3(rotZYX(body.restRot[0], body.restRot[1], body.restRot[2]))) : I3;
  // сдвиг туловища тоже несёт голову и руки (присесть — «Туловище» Y +3)
  const bodyDelta = body ? sub3(body.pos, base.body.pos) : [0, 0, 0];
  const carry = (p) => { p.pos = add3(add3(WAIST, app3(D, sub3(p.pos, WAIST))), bodyDelta); };
  if (body) body.pos = add3(add3(WAIST, app3(D, sub3(base.body.pos, WAIST))), bodyDelta);
  // корень
  const rv = vals.root || {};
  const rootR = rv.rot ? rotZYX(rv.rot[0] * DEG * w, rv.rot[1] * DEG * w, rv.rot[2] * DEG * w) : I3;
  const rootS = rv.scale ? rv.scale.map((s) => 1 + (s - 1) * w) : [1, 1, 1];
  const rootP = rv.pos ? rv.pos.map((s) => s * w) : [0, 0, 0];
  const rootM = mul3(rootR, [rootS[0], 0, 0, 0, rootS[1], 0, 0, 0, rootS[2]]);
  const rootApply = (pt) => add3(add3(FEET, app3(rootM, sub3(pt, FEET))), rootP);
  const out = { bones: {}, freeArms, root: { M: rootM, R: rootR, P: rootP, S: rootS }, D };
  const byName = Object.fromEntries(rig.bones.map((b) => [b.name, b]));
  const solveOne = (b) => {
    if (out.bones[b.name]) return out.bones[b.name];
    const p = pose[b.name];
    const local = rotZYX(p.rot[0], p.rot[1], p.rot[2]);
    let M, P, parentM;
    const S = [p.scale[0], 0, 0, 0, p.scale[1], 0, 0, 0, p.scale[2]];
    if (b.parent && !b.follows && byName[b.parent]) {
      const par = solveOne(byName[b.parent]);
      parentM = par.R;
      P = add3(par.P, app3(par.M, p.pos));
      M = mul3(mul3(par.R, local), S);
      const R = mul3(par.R, local);
      out.bones[b.name] = { M, P, R, local, parentM, rot: p.rot, pos: p.pos, scale: p.scale, restRot: p.restRot };
      return out.bones[b.name];
    }
    const Dc = b.carried || b.name === 'body' ? (b.name === 'body' ? I3 : D) : I3;
    if (b.carried && b.name !== 'body') carry(p);
    parentM = mul3(rootR, Dc);
    const R = mul3(parentM, local);
    P = rootApply(p.pos);
    M = mul3(mul3(rootM, mul3(Dc, local)), S);
    out.bones[b.name] = { M, P, R, local, parentM, rot: p.rot, pos: p.pos, scale: p.scale, restRot: p.restRot };
    return out.bones[b.name];
  };
  for (const b of rig.bones) solveOne(b);
  for (const b of rig.bones) {
    const x = out.bones[b.name];
    x.visible = !(b.crossed && freeArms) && !(b.free && !freeArms);
  }
  // доп. кости персонажа
  for (const e of o.extra || []) {
    const par = out.bones[e.parent] || out.bones.body;
    if (!par) continue;
    const v = vals[e.name] || {};
    const sp = (o.springs && o.springs[e.name]) || [0, 0, 0];
    const r0 = (e.rot || [0, 0, 0]).map((d) => d * DEG);
    const mode = anim ? boneMode(anim, e.name) : 'add';
    const rot = r0.map((r, c) => (v.rot ? (mode === 'replace' ? r + (v.rot[c] * DEG - r) * w : r + v.rot[c] * DEG * w) : r) + sp[c]);
    const pos = (e.pivot || [0, 0, 0]).map((q, c) => q + (v.pos ? v.pos[c] * w : 0));
    const sc = v.scale ? v.scale.map((s) => 1 + (s - 1) * w) : [1, 1, 1];
    const local = rotZYX(rot[0], rot[1], rot[2]);
    const P = add3(par.P, app3(par.M, pos));
    const R = mul3(par.R, local);
    out.bones[e.name] = { M: mul3(mul3(mul3(par.M, local), [sc[0], 0, 0, 0, sc[1], 0, 0, 0, sc[2]]), I3), P, R, local, parentM: par.R, rot, pos, scale: sc, restRot: r0, extra: true, visible: true };
  }
  return out;
}

/** Для гизмо: новая мировая ориентация кости W → значение ключа rot (°) с учётом режима. */
function rotKeyFromWorld(solved, bone, W, anim) {
  const s = solved.bones[bone];
  if (!s) return null;
  const local = mul3(tr3(s.parentM), W);
  const e = eulerZYX(local);
  const mode = anim ? boneMode(anim, bone) : 'add';
  return e.map((r, c) => r3((mode === 'replace' ? r : r - s.restRot[c]) / DEG));
}

// ---------- пружины («веса») ----------
/** Состояние одной кости-пружины. drive — [x,z] (рад/тик²) от движения родителя; как Spring.java. */
function springStep(st, p, drive) {
  const q = { ...SPRING_DEF, ...(p || {}) };
  const k = 0.05 + 0.6 * clamp(q.stiffness, 0, 1), d = 0.05 + 0.5 * clamp(q.damping, 0, 1);
  const lim = clamp(q.limit, 0, 180) * DEG;
  const s = st || { x: 0, z: 0, vx: 0, vz: 0, px: 0, pz: 0 };
  s.px = s.x; s.pz = s.z;
  const str = clamp(num(q.strength, 1), 0, 2);
  const ax = -k * s.x - d * s.vx + (drive ? drive[0] : 0) * (1 - q.stiffness) * str;
  const az = -k * s.z - d * s.vz + (drive ? drive[1] : 0) * (1 - q.stiffness) * str;
  s.vx += ax; s.vz += az;
  s.x = clamp(s.x + s.vx, -lim, lim); s.z = clamp(s.z + s.vz, -lim, lim);
  if (Math.abs(s.x) >= lim) s.vx *= -0.3;
  if (Math.abs(s.z) >= lim) s.vz *= -0.3;
  return s;
}

// ---------- файл анимации ----------
function newAnim(id, name) {
  return { v: ANIM_V, id, name: name || id, name_en: '', cat: 'misc', target: 'any_humanoid', length: 40, loop: false, stay: false, speed: 1, blendIn: 4, blendOut: 6, mode: 'add', modes: {}, tracks: {}, springs: {}, events: [], lockLegs: false, emote: true, icon: '' };
}
function cleanKeys(keys, ch) {
  if (!Array.isArray(keys)) return [];
  const def = CHANNEL_DEF[ch];
  const out = [];
  for (const k of keys) {
    if (!k || typeof k !== 'object') continue;
    const t = Math.max(0, Math.round(num(k.t, 0)));
    const v = Array.isArray(k.v) ? [0, 1, 2].map((c) => r3(num(k.v[c], def[c]))) : def.slice();
    const o = { t, v };
    if (k.ease && k.ease !== 'smooth') o.ease = String(k.ease);
    if (o.ease === 'bezier' && Array.isArray(k.bz) && k.bz.length === 4) o.bz = k.bz.map((x) => r3(num(x, 0)));
    const i = out.findIndex((x) => x.t === t);
    if (i >= 0) out[i] = o; else out.push(o);
  }
  return out.sort((a, b) => a.t - b.t);
}
/** Привести файл в порядок (старые поля, типы, сортировка ключей). */
function normalizeAnim(raw, idHint) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const o = newAnim(String(a.id || idHint || 'anim'), a.name || a.id || idHint);
  o.name_en = typeof a.name_en === 'string' ? a.name_en : '';
  o.cat = CATS.some((c) => c[0] === a.cat) ? a.cat : 'misc';
  o.target = TARGETS.some((x) => x[0] === a.target) ? a.target : 'any_humanoid';
  o.length = Math.max(1, Math.round(num(a.length, 40)));
  o.loop = !!a.loop; o.stay = !!a.stay;
  o.speed = clamp(num(a.speed, 1), 0.05, 10);
  o.blendIn = Math.max(0, Math.round(num(a.blendIn, 4)));
  o.blendOut = Math.max(0, Math.round(num(a.blendOut, 6)));
  o.mode = a.mode === 'replace' ? 'replace' : 'add';
  o.modes = {};
  for (const [b, m] of Object.entries(a.modes || {})) if (m === 'add' || m === 'replace') o.modes[b] = m;
  o.tracks = {};
  for (const [b, tr] of Object.entries(a.tracks || {})) {
    if (!tr || typeof tr !== 'object') continue;
    const t2 = {};
    for (const ch of CHANNELS) { const k = cleanKeys(tr[ch], ch); if (k.length) t2[ch] = k; }
    if (Object.keys(t2).length) o.tracks[b] = t2;
  }
  o.springs = {};
  for (const [b, s] of Object.entries(a.springs || {})) if (s && typeof s === 'object') { const x = {}; for (const [k] of SPRING_FIELDS) if (typeof s[k] === 'number') x[k] = r3(s[k]); if (Object.keys(x).length) o.springs[b] = x; }
  o.events = (Array.isArray(a.events) ? a.events : []).filter((e) => e && typeof e === 'object').map((e) => ({ ...e, t: Math.max(0, Math.round(num(e.t, 0))) })).sort((x, y) => x.t - y.t);
  o.lockLegs = !!a.lockLegs; o.emote = a.emote !== false;
  o.icon = typeof a.icon === 'string' ? a.icon : '';
  if (a.builtin) o.builtin = true;
  return o;
}
/** Что пишется в файл: без пустого и служебного. */
function cleanAnim(a) {
  const o = normalizeAnim(a);
  delete o.builtin;
  if (!o.name_en) delete o.name_en;
  if (!Object.keys(o.modes).length) delete o.modes;
  if (!Object.keys(o.springs).length) delete o.springs;
  if (!o.events.length) delete o.events;
  if (!o.icon) delete o.icon;
  if (!o.stay) delete o.stay;
  if (!o.lockLegs) delete o.lockLegs;
  return o;
}
const ANIM_ERR = 'error', ANIM_WARN = 'warn';
/** Проблемы анимации по-русски: [{ sev, msg }]. */
function validateAnim(a, known) {
  const out = [];
  const err = (msg) => out.push({ sev: ANIM_ERR, msg }), warn = (msg) => out.push({ sev: ANIM_WARN, msg });
  if (!a || typeof a !== 'object') { err('Файл анимации не читается'); return out; }
  if (!SAFE_ID.test(String(a.id || ''))) err('Имя файла (id) — только маленькие латинские буквы, цифры, _ . - (например my_wave)');
  if (!a.name) warn('Нет названия по-русски — в списках будет id');
  if (!(a.length >= 1)) err('Длина должна быть хотя бы 1 тик');
  if (a.length > 20 * 60 * 5) warn('Анимация длиннее 5 минут — точно так задумано?');
  const bones = Object.keys(a.tracks || {});
  if (!bones.length) warn('В анимации нет ни одного ключа');
  const okBone = (b) => RIG_BONES.player.includes(b) || RIG_BONES.villager.includes(b) || /^(chest_[lr]|ear_[lr]|tail_\d+|hair_([a-z]+_)?\d+|cape|x_[a-z0-9_]+)$/.test(b);
  for (const b of bones) {
    if (!okBone(b)) warn('Кость «' + b + '» неизвестна — в игре её ключи пропустятся');
    for (const ch of CHANNELS) for (const k of (a.tracks[b][ch] || [])) {
      if (k.t > a.length) { warn(boneRu(b) + ': ключ ' + k.t + ' т за концом анимации (' + a.length + ' т)'); break; }
    }
    const sc = (a.tracks[b].scale || []);
    if (sc.some((k) => k.v.some((x) => x <= 0 || x > 4))) warn(boneRu(b) + ': размер вне 0–4 — в игре он будет ограничен');
    const ps = (a.tracks[b].pos || []);
    if (ps.some((k) => k.v.some((x) => Math.abs(x) > 64))) warn(boneRu(b) + ': сдвиг больше 64 пикселей (4 блока) — в игре он будет ограничен');
  }
  if (a.target === 'villager' && (a.tracks.hat)) warn('У жителя шапка — часть головы, отдельные ключи шапки игра пропустит');
  for (const e of a.events || []) {
    if (e.t > a.length) warn('Событие на ' + e.t + ' т — за концом анимации');
    if (e.sound != null && !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(String(e.sound))) err('Звук «' + e.sound + '»: нужен id вида minecraft:entity.villager.yes');
    if (e.particle != null && !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(String(e.particle))) err('Частицы «' + e.particle + '»: нужен id вида minecraft:heart');
  }
  if (known && a.id && known.has(a.id) && !a.builtin) out.push({ sev: 'info', msg: 'Перекрывает встроенную анимацию «' + a.id + '»' });
  return out;
}

/** Зеркало позы: правое ↔ левое (ключи костей меняются местами, Y и Z поворота — с минусом). */
function mirrorTracks(tracks) {
  const sw = (b) => b.replace(/^right_/, '\u0001').replace(/^left_/, 'right_').replace('\u0001', 'left_').replace(/_l$/, '\u0002').replace(/_r$/, '_l').replace('\u0002', '_r');
  const out = {};
  for (const [b, tr] of Object.entries(tracks || {})) {
    const nb = sw(b);
    const t2 = {};
    for (const ch of CHANNELS) {
      if (!tr[ch]) continue;
      t2[ch] = tr[ch].map((k) => ({ ...k, v: ch === 'rot' ? [k.v[0], -k.v[1], -k.v[2]] : ch === 'pos' ? [-k.v[0], k.v[1], k.v[2]] : k.v.slice() }));
    }
    out[nb] = t2;
  }
  return out;
}

/** Все времена ключей кости (или всех костей). */
function keyTimes(anim, bone) {
  const s = new Set();
  for (const [b, tr] of Object.entries((anim && anim.tracks) || {})) {
    if (bone && b !== bone) continue;
    for (const ch of CHANNELS) for (const k of tr[ch] || []) s.add(k.t);
  }
  return [...s].sort((x, y) => x - y);
}
function fmtT(t) { const s = t / TICKS; return (Math.round(s * 100) / 100).toString().replace('.', ',') + ' с'; }

// «Анимации» Студии Кокка — встроенная библиотека. Источник правды: отсюда scripts/sync-anims.cjs пишет
// skinkokk/src/main/resources/assets/skinkokk/anims/<id>.json (+ index.json) — их играет мод у всех игроков.
// Без import. Углы — градусы, оси как у ModelPart: рука X −90 — вперёд, −180 — вверх; правая рука Z + — в сторону,
// левая Z − — в сторону; голова X + — вниз; туловище X + — наклон вперёд (от пояса); корень Y + — ниже, Z + — назад.
// Ключ: k(t, x, y, z, ease) — ease у ключа = как идти К СЛЕДУЮЩЕМУ ключу (smooth по умолчанию).

const k = (t, x, y, z, ease) => (ease ? { t, v: [x, y, z], ease } : { t, v: [x, y, z] });
const A = (o) => ({ v: 1, target: 'any_humanoid', loop: false, speed: 1, blendIn: 4, blendOut: 6, mode: 'add', emote: true, ...o, builtin: true });
// ключи «дрожи»: от t0 до t1 с шагом step значение колеблется вокруг base по компоненте c на ±amp
const tremble = (t0, t1, step, base, c, amp) => { const out = []; let s = 1; for (let t = t0; t <= t1; t += step) { const v = base.slice(); v[c] += amp * s; s = -s; out.push({ t, v, ease: 'linear' }); } return out; };
const mirror = (keys) => keys.map((q) => ({ ...q, v: [q.v[0], -q.v[1], -q.v[2]] }));

const ANIM_LIBRARY = [
  // ---------- приветствия ----------
  A({ id: 'wave', name: 'Помахать', name_en: 'Wave', cat: 'greet', icon: '👋', length: 40, blendOut: 8, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 5, 'out'), k(7, -12, -5, 152), k(13, -12, -5, 126), k(19, -12, -5, 156), k(25, -12, -5, 126), k(31, -12, -5, 150), k(40, 0, 0, 5)] },
    head: { rot: [k(0, 0, 0, 0), k(7, -6, 0, -6), k(33, -6, 0, -6), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(7, 0, 0, -3), k(33, 0, 0, -3), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(7, 0, 0, -6), k(33, 0, 0, -6), k(40, 0, 0, 0)] } } }),
  A({ id: 'nod', name: 'Кивнуть', name_en: 'Nod', cat: 'greet', icon: '🙂', length: 22, blendIn: 2, blendOut: 3, tracks: {
    head: { rot: [k(0, 0, 0, 0, 'out'), k(5, 18, 0, 0), k(10, -4, 0, 0), k(15, 14, 0, 0, 'out'), k(22, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(5, 3, 0, 0), k(10, 0, 0, 0), k(15, 2, 0, 0), k(22, 0, 0, 0)] } } }),
  A({ id: 'shake_head', name: 'Покачать головой', name_en: 'Shake head', cat: 'talk', icon: '🙅', length: 28, blendIn: 2, blendOut: 3, tracks: {
    head: { rot: [k(0, 0, 0, 0), k(5, 4, -28, 0), k(11, 4, 26, 0), k(17, 4, -22, 0), k(23, 4, 14, 0, 'out'), k(28, 0, 0, 0)] } } }),
  A({ id: 'bow', name: 'Поклониться', name_en: 'Bow', cat: 'greet', icon: '🙇', length: 40, blendOut: 4, modes: { right_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 0, 0, 0, 'out'), k(10, 42, 0, 0), k(26, 42, 0, 0), k(38, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(10, 12, 0, 0), k(26, 12, 0, 0), k(38, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(10, -52, -32, 0), k(26, -52, -32, 0), k(38, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(10, 10, 0, -2), k(26, 10, 0, -2), k(38, 0, 0, 0)] } } }),
  A({ id: 'salute', name: 'Отдать честь', name_en: 'Salute', cat: 'greet', icon: '🫡', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, lockLegs: true, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'back'), k(8, -142, -38, 12), k(30, -142, -38, 12), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, -2), k(40, 0, 0, -2)] },
    head: { rot: [k(0, 0, 0, 0), k(8, -4, 0, 0), k(30, -4, 0, 0), k(40, 0, 0, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0)] }, left_leg: { rot: [k(0, 0, 0, 0)] } } }),
  A({ id: 'beckon', name: 'Подозвать', name_en: 'Beckon', cat: 'greet', icon: '🫴', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -78, 10, 10), k(11, -122, 10, 10), k(16, -78, 10, 10), k(21, -122, 10, 10), k(26, -78, 10, 10), k(31, -118, 10, 10), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 0, -4, 6), k(31, 0, -4, 6), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 0, -8, 0), k(31, 0, -8, 0), k(40, 0, 0, 0)] } } }),

  // ---------- разговор ----------
  A({ id: 'talk', name: 'Жестикулировать', name_en: 'Talk', cat: 'talk', icon: '💬', length: 40, loop: true, blendIn: 6, tracks: {
    right_arm: { rot: [k(0, -25, 0, 8), k(10, -42, -10, 14), k(20, -20, 0, 6), k(30, -38, 8, 12), k(40, -25, 0, 8)] },
    left_arm: { rot: [k(0, -10, 0, -4), k(13, -22, 0, -8), k(26, -8, 0, -4), k(40, -10, 0, -4)] },
    head: { rot: [k(0, 0, 0, 0), k(8, 4, 6, 2), k(18, -2, -4, 0), k(28, 5, 3, -2), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(10, 0, -4, 0), k(30, 0, 4, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'talk_explain', name: 'Объяснять', name_en: 'Explain', cat: 'talk', icon: '🗣', length: 48, loop: true, blendIn: 6, tracks: {
    right_arm: { rot: [k(0, -40, 0, 20), k(12, -56, -15, 32), k(24, -36, 0, 18), k(36, -52, 10, 28), k(48, -40, 0, 20)] },
    left_arm: { rot: mirror([k(0, -36, 0, 18), k(12, -30, 0, 14), k(24, -54, -14, 30), k(36, -40, 6, 22), k(48, -36, 0, 18)]) },
    head: { rot: [k(0, 0, 0, 0), k(12, 6, -6, 0), k(24, -2, 4, 0), k(36, 6, 6, 0), k(48, 0, 0, 0)] },
    body: { rot: [k(0, 3, 0, 0), k(24, 5, 0, 0), k(48, 3, 0, 0)] } } }),
  A({ id: 'point', name: 'Показать рукой', name_en: 'Point', cat: 'talk', icon: '👉', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'back'), k(6, -88, -6, 0), k(34, -88, -6, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 0, -8, 0), k(34, 0, -8, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, -2, -6, 0), k(34, -2, -6, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, 6, 0, -4), k(34, 6, 0, -4), k(40, 0, 0, 0)] } } }),
  A({ id: 'think', name: 'Задуматься', name_en: 'Think', cat: 'talk', icon: '🤔', length: 60, loop: true, blendIn: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -112, -30, 0), k(30, -108, -28, 2), k(60, -112, -30, 0)] },
    left_arm: { rot: [k(0, -50, 38, -10), k(60, -50, 38, -10)] },
    head: { rot: [k(0, -6, 0, 8), k(30, -10, 10, 6), k(60, -6, 0, 8)] },
    body: { rot: [k(0, 4, 0, 0), k(60, 4, 0, 0)] } } }),
  A({ id: 'shrug', name: 'Пожать плечами', name_en: 'Shrug', cat: 'talk', icon: '🤷', length: 30, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(8, -35, 20, 38), k(20, -35, 20, 38), k(30, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(8, -35, -20, -38), k(20, -35, -20, -38), k(30, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(8, -4, 0, 12), k(20, -4, 0, 12), k(30, 0, 0, 0)] },
    body: { pos: [k(0, 0, 0, 0), k(8, 0, -1, 0), k(20, 0, -1, 0), k(30, 0, 0, 0)] } } }),

  // ---------- чувства ----------
  A({ id: 'cheer', name: 'Обрадоваться', name_en: 'Cheer', cat: 'emotion', icon: '🙌', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, 165), k(12, -10, 0, 145), k(18, -10, 0, 165), k(24, -10, 0, 145), k(32, -10, 0, 160), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, -165), k(12, -10, 0, -145), k(18, -10, 0, -165), k(24, -10, 0, -145), k(32, -10, 0, -160), k(40, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(5, 0, -5, 0, 'in'), k(10, 0, 0, 0, 'out'), k(15, 0, -5, 0, 'in'), k(20, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, -12, 0, 0), k(32, -12, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'celebrate_jump', name: 'Прыжок радости', name_en: 'Jump for joy', cat: 'emotion', icon: '🎉', length: 30, lockLegs: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0), k(4, 0, 2, 0, 'out'), k(9, 0, -10, 0, 'in'), k(15, 0, 0, 0, 'bounce'), k(20, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(4, 20, 0, 20, 'out'), k(9, -10, 0, 165), k(15, -10, 0, 150), k(30, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(4, 20, 0, -20, 'out'), k(9, -10, 0, -165), k(15, -10, 0, -150), k(30, 0, 0, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0), k(4, -8, 0, 0), k(9, -14, 0, 4), k(15, 0, 0, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0), k(4, -8, 0, 0), k(9, 10, 0, -4), k(15, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(4, 12, 0, 0), k(9, -6, 0, 0), k(15, 4, 0, 0), k(22, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(9, -15, 0, 0), k(22, 0, 0, 0)] } },
    events: [{ t: 9, particle: 'minecraft:happy_villager', bone: 'head', count: 6, spread: 0.5 }] }),
  A({ id: 'laugh', name: 'Смеяться', name_en: 'Laugh', cat: 'emotion', icon: '😂', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    head: { rot: [k(0, 0, 0, 0, 'out'), k(4, -22, 0, 0, 'linear'), ...tremble(7, 28, 3, [-20, 0, 0], 0, 3).slice(1), k(32, -18, 0, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(4, -6, 0, 0, 'linear'), ...tremble(7, 28, 3, [-5, 0, 0], 0, 2).slice(1), k(32, -4, 0, 0), k(40, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(6, -35, -22, 0), k(32, -35, -22, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -35, 22, 0), k(32, -35, 22, 0), k(40, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), ...tremble(6, 30, 3, [0, -0.5, 0], 1, 0.5), k(34, 0, 0, 0)] } } }),
  A({ id: 'cry', name: 'Заплакать', name_en: 'Cry', cat: 'emotion', icon: '😢', length: 40, loop: true, blendIn: 8, blendOut: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    head: { rot: [k(0, 28, 0, 0), k(10, 32, 0, 3), k(20, 28, 0, 0), k(30, 32, 0, -3), k(40, 28, 0, 0)] },
    right_arm: { rot: [k(0, -120, -22, 0), k(5, -124, -22, 0), k(10, -120, -22, 0), k(25, -124, -22, 0), k(30, -120, -22, 0), k(40, -120, -22, 0)] },
    left_arm: { rot: [k(0, -120, 22, 0), k(5, -124, 22, 0), k(10, -120, 22, 0), k(25, -124, 22, 0), k(30, -120, 22, 0), k(40, -120, 22, 0)] },
    body: { rot: [k(0, 10, 0, 0), k(5, 13, 0, 0), k(10, 10, 0, 0), k(25, 13, 0, 0), k(30, 10, 0, 0), k(40, 10, 0, 0)] } },
    events: [{ t: 5, particle: 'minecraft:falling_water', bone: 'head', count: 2, spread: 0.2 }, { t: 25, particle: 'minecraft:falling_water', bone: 'head', count: 2, spread: 0.2 }] }),
  A({ id: 'facepalm', name: 'Рука-лицо', name_en: 'Facepalm', cat: 'emotion', icon: '🤦', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'in'), k(8, -118, -28, 0), k(30, -118, -28, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(8, 24, 0, 0), k(14, 24, -8, 0), k(20, 24, 8, 0), k(26, 24, -6, 0), k(30, 24, 0, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(8, 8, 0, 0), k(30, 8, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'angry', name: 'Злиться', name_en: 'Angry', cat: 'emotion', icon: '😠', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -150, 0, 20, 'linear'), ...tremble(10, 30, 4, [-140, 0, 20], 0, 10), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -12, 0, -30), k(32, -12, 0, -30), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 10, 0, 0, 'linear'), ...tremble(8, 30, 2, [10, 0, 0], 2, 2), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 6, 0, 0), k(32, 6, 0, 0), k(40, 0, 0, 0)] },
    root: { pos: [k(6, 0, 0, 0, 'in'), k(8, 0, -2, 0, 'bounce'), k(11, 0, 0, 0)] } },
    events: [{ t: 8, particle: 'minecraft:angry_villager', bone: 'head', count: 2, spread: 0.3 }] }),
  A({ id: 'scared', name: 'Испугаться', name_en: 'Scared', cat: 'emotion', icon: '😱', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(6, 0, 0, 4), k(34, 0, 0, 4), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, 0), k(34, -10, 0, 0), k(40, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -100, -24, 10, 'linear'), ...tremble(8, 32, 2, [-100, -24, 10], 0, 3), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -100, 24, -10, 'linear'), ...tremble(8, 32, 2, [-100, 24, -10], 0, 3), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0, 'out'), k(6, 12, 0, 0, 'linear'), ...tremble(8, 32, 2, [12, 0, 0], 1, 3), k(40, 0, 0, 0)] } } }),
  A({ id: 'yawn', name: 'Зевнуть', name_en: 'Yawn', cat: 'emotion', icon: '🥱', length: 50, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0), k(15, -20, 0, 155), k(30, -20, 0, 155), k(42, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(15, -20, 0, -155), k(30, -20, 0, -155), k(42, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(15, -24, 0, 0), k(30, -24, 0, 0), k(42, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(15, -6, 0, 0), k(30, -6, 0, 0), k(42, 0, 0, 0)] } } }),

  // ---------- работа и действия ----------
  A({ id: 'pick_up', name: 'Поднять с земли', name_en: 'Pick up', cat: 'work', icon: '🫳', length: 40, modes: { right_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 0, 0, 0), k(12, 70, 0, 0), k(20, 70, 0, 0), k(32, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), k(12, 0, 2, 0), k(20, 0, 2, 0), k(32, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -40, 0, 0), k(20, -36, 0, 0), k(32, -45, 0, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(12, -20, 0, -6), k(32, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -25, 0, 0), k(32, 0, 0, 0)] } } }),
  A({ id: 'give', name: 'Протянуть', name_en: 'Give', cat: 'work', icon: '🤲', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(10, -75, -10, 0), k(26, -75, -10, 0), k(34, -68, -10, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(10, 8, 0, 0), k(30, 8, 0, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(10, 10, 0, 0), k(30, 10, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'hammer', name: 'Стучать молотком', name_en: 'Hammer', cat: 'work', icon: '🔨', length: 20, loop: true, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -145, 0, 10, 'in'), k(5, -40, 0, 2, 'out'), k(12, -150, 0, 10), k(20, -145, 0, 10)] },
    body: { rot: [k(0, 2, 0, 0, 'in'), k(5, 14, 0, 0, 'out'), k(12, 2, 0, 0), k(20, 2, 0, 0)] },
    head: { rot: [k(0, 8, 0, 0), k(5, 16, 0, 0), k(12, 8, 0, 0), k(20, 8, 0, 0)] } },
    events: [{ t: 5, sound: 'minecraft:block.wood.hit', vol: 0.6, pitch: 1 }] }),
  A({ id: 'sweep', name: 'Мести пол', name_en: 'Sweep', cat: 'work', icon: '🧹', length: 30, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 14, -18, 0), k(15, 14, 18, 0), k(30, 14, -18, 0)] },
    right_arm: { rot: [k(0, -35, -30, 0), k(15, -45, 10, 0), k(30, -35, -30, 0)] },
    left_arm: { rot: [k(0, -30, 20, 0), k(15, -40, 40, 0), k(30, -30, 20, 0)] },
    head: { rot: [k(0, 10, 10, 0), k(15, 10, -10, 0), k(30, 10, 10, 0)] } } }),
  A({ id: 'warm_hands', name: 'Греть руки', name_en: 'Warm hands', cat: 'work', icon: '🔥', length: 32, loop: true, blendIn: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -62, -26, 0), k(4, -62, -22, 0), k(8, -62, -26, 0), k(12, -62, -22, 0), k(16, -62, -26, 0), k(24, -58, -26, 0), k(32, -62, -26, 0)] },
    left_arm: { rot: [k(0, -62, 26, 0), k(4, -62, 22, 0), k(8, -62, 26, 0), k(12, -62, 22, 0), k(16, -62, 26, 0), k(24, -58, 26, 0), k(32, -62, 26, 0)] },
    body: { rot: [k(0, 10, 0, 0), k(32, 10, 0, 0)], pos: [k(0, 0, 1, 0), k(32, 0, 1, 0)] },
    head: { rot: [k(0, 12, 0, 0), k(16, 14, 0, 0), k(32, 12, 0, 0)] } } }),
  A({ id: 'clap', name: 'Хлопать', name_en: 'Clap', cat: 'emotion', icon: '👏', length: 16, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -72, -6, 0, 'in'), k(4, -72, -28, 0, 'out'), k(8, -72, -6, 0, 'in'), k(12, -72, -28, 0, 'out'), k(16, -72, -6, 0)] },
    left_arm: { rot: [k(0, -72, 6, 0, 'in'), k(4, -72, 28, 0, 'out'), k(8, -72, 6, 0, 'in'), k(12, -72, 28, 0, 'out'), k(16, -72, 6, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(4, 4, 0, 0), k(8, 0, 0, 0), k(12, 4, 0, 0), k(16, 0, 0, 0)] } },
    events: [{ t: 4, sound: 'minecraft:block.wool.place', vol: 0.7, pitch: 1.6 }, { t: 12, sound: 'minecraft:block.wool.place', vol: 0.7, pitch: 1.5 }] }),

  // ---------- бой ----------
  A({ id: 'attack', name: 'Ударить', name_en: 'Attack', cat: 'combat', icon: '⚔', length: 16, blendIn: 2, blendOut: 3, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(5, -165, 0, 15, 'in'), k(9, -30, 0, -5), k(16, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(5, 0, -20, 0, 'in'), k(9, 6, 25, 0), k(16, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(5, 0, 15, 0), k(9, 0, -15, 0), k(16, 0, 0, 0)] } } }),
  A({ id: 'die', name: 'Упасть', name_en: 'Fall down', cat: 'combat', icon: '💀', length: 30, stay: true, blendIn: 2, lockLegs: true, emote: false, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace' }, tracks: {
    root: { rot: [k(0, 0, 0, 0), k(6, 8, 0, 4), k(10, 8, 0, 4, 'bounce'), k(22, -90, 0, 0)], pos: [k(10, 0, 0, 0, 'bounce'), k(22, 0, -3, -2)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(6, -60, -30, 0), k(10, -60, -30, 0), k(22, -10, 0, 70)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -60, 30, 0), k(10, -60, 30, 0), k(22, -10, 0, -70)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 14, 0, 0), k(10, 14, 0, 0), k(22, -10, 20, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0), k(22, 0, 0, 8)] }, left_leg: { rot: [k(0, 0, 0, 0), k(22, 0, 0, -8)] } } }),

  // ---------- отдых и позы ----------
  A({ id: 'sit', name: 'Сесть на землю', name_en: 'Sit', cat: 'rest', icon: '🪑', length: 16, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(14, 0, 10, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -88, 4, 3)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -88, -4, -3)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(14, -12, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, 30, 0, 12)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, 30, 0, -12)] },
    head: { rot: [k(0, 0, 0, 0), k(14, 8, 0, 0)] } } }),
  A({ id: 'sit_ground', name: 'Сидеть по-турецки', name_en: 'Sit cross-legged', cat: 'rest', icon: '🧘', length: 16, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(14, 0, 10, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -90, -50, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -90, 50, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, -40, -10, 8)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, -40, 10, -8)] },
    body: { rot: [k(0, 0, 0, 0), k(14, 6, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(14, -4, 0, 0)] } } }),
  A({ id: 'kneel', name: 'Встать на колено', name_en: 'Kneel', cat: 'rest', icon: '🧎', length: 14, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(12, 0, 6, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(12, -86, 0, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(12, 60, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, 6, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -40, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -4, 0, 0)] } } }),
  A({ id: 'sleep', name: 'Уснуть', name_en: 'Sleep', cat: 'rest', icon: '😴', length: 60, loop: true, blendIn: 14, blendOut: 10, lockLegs: true, emote: true, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace', head: 'replace' }, tracks: {
    root: { rot: [k(0, -90, 0, 0), k(60, -90, 0, 0)], pos: [k(0, 0, -3, -14), k(60, 0, -3, -14)] },
    body: { rot: [k(0, 0, 0, 0), k(30, -1.5, 0, 0), k(60, 0, 0, 0)] },
    head: { rot: [k(0, 0, 10, 0), k(30, -2, 12, 0), k(60, 0, 10, 0)] },
    right_arm: { rot: [k(0, 0, 0, 4), k(60, 0, 0, 4)] }, left_arm: { rot: [k(0, 0, 0, -4), k(60, 0, 0, -4)] },
    right_leg: { rot: [k(0, 0, 0, 2), k(60, 0, 0, 2)] }, left_leg: { rot: [k(0, 0, 0, -2), k(60, 0, 0, -2)] } },
    events: [{ t: 20, particle: 'minecraft:note', bone: 'head', count: 1, spread: 0.2 }] }),
  A({ id: 'crouch_idle', name: 'Присесть и ждать', name_en: 'Crouch', cat: 'rest', icon: '🫣', length: 40, loop: true, blendIn: 4, tracks: {
    body: { rot: [k(0, 26, 0, 0), k(20, 28, 0, 0), k(40, 26, 0, 0)], pos: [k(0, 0, 2.5, 0), k(40, 0, 2.5, 0)] },
    head: { rot: [k(0, -22, 0, 0), k(20, -24, 0, 0), k(40, -22, 0, 0)] },
    right_arm: { rot: [k(0, -15, 0, 0), k(40, -15, 0, 0)] }, left_arm: { rot: [k(0, -15, 0, 0), k(40, -15, 0, 0)] } } }),
  A({ id: 'arms_crossed', name: 'Скрестить руки', name_en: 'Arms crossed', cat: 'rest', icon: '🙎', length: 60, loop: true, blendIn: 6, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -55, -38, -12), k(60, -55, -38, -12)] },
    left_arm: { rot: [k(0, -50, 40, 12), k(60, -50, 40, 12)] },
    head: { rot: [k(0, 0, 0, 0), k(30, 2, 4, 0), k(60, 0, 0, 0)] },
    body: { pos: [k(0, 0, 0, 0), k(30, 0, -0.3, 0), k(60, 0, 0, 0)] } } }),
  A({ id: 'look_around', name: 'Оглядеться', name_en: 'Look around', cat: 'misc', icon: '👀', length: 60, tracks: {
    head: { rot: [k(0, 0, 0, 0), k(12, -5, -55, 0), k(24, -5, -55, 0), k(36, -3, 50, 0), k(48, -3, 50, 0), k(60, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, 0, -12, 0), k(24, 0, -12, 0), k(36, 0, 10, 0), k(48, 0, 10, 0), k(60, 0, 0, 0)] } } }),
  A({ id: 'stretch', name: 'Потянуться', name_en: 'Stretch', cat: 'misc', icon: '🙆', length: 60, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -175, 0, 8), k(48, -175, 0, 8), k(60, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(12, -175, 0, -8), k(48, -175, 0, -8), k(60, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, -4, 0, 0), k(24, -4, 0, -12), k(36, -4, 0, 12), k(48, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), k(12, 0, -1, 0), k(48, 0, -1, 0), k(60, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -14, 0, 0), k(48, -14, 0, 0), k(60, 0, 0, 0)] } } }),

  // ---------- танцы ----------
  A({ id: 'dance', name: 'Танцевать', name_en: 'Dance', cat: 'dance', icon: '💃', length: 20, loop: true, lockLegs: true, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -20, 0, 150), k(10, -20, 0, 30), k(20, -20, 0, 150)] },
    left_arm: { rot: [k(0, -20, 0, -30), k(10, -20, 0, -150), k(20, -20, 0, -30)] },
    body: { rot: [k(0, 0, 0, -6), k(10, 0, 0, 6), k(20, 0, 0, -6)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(5, 0, -1.5, 0, 'in'), k(10, 0, 0, 0, 'out'), k(15, 0, -1.5, 0, 'in'), k(20, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 6), k(10, 0, 0, -6), k(20, 0, 0, 6)] },
    right_leg: { rot: [k(0, -20, 0, 0), k(10, 5, 0, 0), k(20, -20, 0, 0)] },
    left_leg: { rot: [k(0, 5, 0, 0), k(10, -20, 0, 0), k(20, 5, 0, 0)] } } }),
  A({ id: 'dance_robot', name: 'Танец робота', name_en: 'Robot dance', cat: 'dance', icon: '🤖', length: 32, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -90, 0, 0, 'linear'), k(6, -90, 0, 0, 'linear'), k(8, 0, 0, 90, 'linear'), k(14, 0, 0, 90, 'linear'), k(16, -90, 0, 0, 'linear'), k(22, -90, 0, 0, 'linear'), k(24, -180, 0, 0, 'linear'), k(30, -180, 0, 0, 'linear'), k(32, -90, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, -90, 'linear'), k(6, 0, 0, -90, 'linear'), k(8, -90, 0, 0, 'linear'), k(14, -90, 0, 0, 'linear'), k(16, -180, 0, 0, 'linear'), k(22, -180, 0, 0, 'linear'), k(24, -90, 0, 0, 'linear'), k(30, -90, 0, 0, 'linear'), k(32, 0, 0, -90)] },
    head: { rot: [k(0, 0, 0, 0, 'linear'), k(6, 0, 0, 0, 'linear'), k(8, 0, 30, 0, 'linear'), k(14, 0, 30, 0, 'linear'), k(16, 0, 0, 0, 'linear'), k(22, 0, 0, 0, 'linear'), k(24, 0, -30, 0, 'linear'), k(30, 0, -30, 0, 'linear'), k(32, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'linear'), k(6, 0, 0, 0, 'linear'), k(8, 0, 10, 0, 'linear'), k(14, 0, 10, 0, 'linear'), k(16, 0, 0, 0, 'linear'), k(22, 0, 0, 0, 'linear'), k(24, 0, -10, 0, 'linear'), k(30, 0, -10, 0, 'linear'), k(32, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(2, 0, -1, 0, 'in'), k(4, 0, 0, 0), k(8, 0, 0, 0, 'out'), k(10, 0, -1, 0, 'in'), k(12, 0, 0, 0), k(16, 0, 0, 0, 'out'), k(18, 0, -1, 0, 'in'), k(20, 0, 0, 0), k(24, 0, 0, 0, 'out'), k(26, 0, -1, 0, 'in'), k(28, 0, 0, 0)] } } })
];

/** Встроенная по id (копия — её можно править). */
function builtinAnim(id) { const a = ANIM_LIBRARY.find((x) => x.id === id); return a ? JSON.parse(JSON.stringify(a)) : null; }
const BUILTIN_IDS = ANIM_LIBRARY.map((a) => a.id);

module.exports = { ANIM_V, TICKS, SAFE_ID, DEG, BONE_RU, boneRu, BONE_HINT, TARGETS, CATS, EASES, EASE_RU, MODES, CHANNELS, CHANNEL_RU, CHANNEL_UNIT, CHANNEL_DEF, SPRING_DEF, SPRING_FIELDS, EVENT_KINDS, r3, cubicBezier, ease, sampleKeys, blendWeight, rotZYX, eulerZYX, mul3, tr3, app3, I3, axisAngle, WAIST, FEET, playerRig, villagerRig, RIG_BONES, vanillaPose, usesFreeArms, boneMode, animValues, solvePose, rotKeyFromWorld, springStep, newAnim, normalizeAnim, cleanAnim, ANIM_ERR, validateAnim, mirrorTracks, keyTimes, fmtT, ANIM_LIBRARY, builtinAnim, BUILTIN_IDS, ANIM_WARN };
