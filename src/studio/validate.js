// Проверка и нормализация сцен «Студии». Чистые функции без зависимостей.
// Этот же код работает в главном процессе («Собрать для игроков»): electron/studio-validate.cjs
// генерируется из этого файла командой `node scripts/sync-studio.cjs` (её же вызывает scripts/check.cjs).
// Здесь нельзя использовать import — только `export function` / `export const`.

export const ERR = 'ошибка';
export const WARN = 'предупреждение';

export const TRACK_KINDS = ['camera', 'actor', 'fx', 'sound', 'subtitles', 'world'];
export const ACTOR_KINDS = ['story', 'valley', 'entity', 'player'];
export const EASES = ['smooth', 'linear', 'in', 'out'];
export const WEATHERS = ['clear', 'rain', 'thunder'];
export const END_MODES = ['stay', 'tp', 'back'];
export const SUB_MAX = 140;

// глаголы дорожек: какие поля обязательны (subtitles — без глагола, одна реплика)
export const VERBS = {
  actor: {
    walk: { need: ['path'] }, anim: { need: ['name'] }, face: { need: ['name'] }, look: { need: ['at'] },
    say: { need: ['text'] }, hold: { need: [] }, tp: { need: ['pos'] }, sit: { need: [] }, stand: { need: [] }, pose: { need: ['name'] }
  },
  fx: {
    fade_in: { need: [] }, fade_out: { need: [] }, flash: { need: [] }, shake: { need: [] },
    particles: { need: ['name', 'pos'] }, story_fx: { need: ['name'] }, title: { need: ['text'] }
  },
  sound: { sound: { need: ['id'] }, music: { need: ['id'] }, music_fade: { need: [] } },
  world: { time: { need: ['value'] }, weather: { need: ['value'] }, block: { need: ['pos', 'state'] }, var: { need: ['name'] } }
};

export const TRACK_LABEL = { camera: 'Камера', actor: 'Актёр', fx: 'Эффекты', sound: 'Звук', subtitles: 'Субтитры', world: 'Мир' };
export const VERB_LABEL = {
  key: 'Ключ камеры', line: 'Реплика',
  walk: 'Идти', anim: 'Анимация', face: 'Лицо', look: 'Смотреть', say: 'Сказать', hold: 'Взять в руки', tp: 'Переместить',
  sit: 'Сесть', stand: 'Встать', pose: 'Поза',
  fade_in: 'Из темноты', fade_out: 'В темноту', flash: 'Вспышка', shake: 'Тряска', particles: 'Частицы', story_fx: 'Сюжетный эффект', title: 'Заголовок',
  sound: 'Звук', music: 'Музыка', music_fade: 'Музыка затихает',
  time: 'Время суток', weather: 'Погода', block: 'Блок', var: 'Переменная'
};
export const FIELD_LABEL = {
  path: 'путь', name: 'название', at: 'на кого смотреть', text: 'текст', pos: 'место', id: 'звук', value: 'значение', state: 'блок'
};

const RL = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const SCENE_ID = /^[a-z0-9_-]{1,64}$/;
const ACTOR_ID = /^[a-z0-9_-]{1,48}$/;
const VAR_NAME = /^[a-zA-Z0-9_.-]{1,64}$/;

export function isResId(s) { return typeof s === 'string' && RL.test(s); }
export function isSceneId(s) { return typeof s === 'string' && SCENE_ID.test(s); }
export function isActorId(s) { return typeof s === 'string' && ACTOR_ID.test(s); }
export function isPos(p) { return Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && isFinite(v)); }
export function isNum(v) { return typeof v === 'number' && isFinite(v); }
export function trackKeyOf(tr) { return tr && tr.kind === 'actor' ? 'actor:' + tr.actor : (tr ? tr.kind : ''); }
export function itemsOfTrack(tr) { return !tr ? [] : tr.kind === 'camera' ? (tr.keys || []) : (tr.events || []); }
export function verbOf(kind, ev) { return kind === 'camera' ? 'key' : kind === 'subtitles' ? 'line' : (ev && ev.do); }

// «player» | «actor:id» | [x,y,z] | null
export function isTarget(v, actorIds) {
  if (v === null || v === undefined || v === 'player') return true;
  if (isPos(v)) return true;
  if (typeof v === 'string' && v.startsWith('actor:')) return !actorIds || actorIds.includes(v.slice(6));
  return false;
}

function tsec(t) { return isNum(t) ? (Math.round(t / 2) / 10) + ' с' : '?'; }

// Проверка одной сцены. ctx: { project, ids: [все id сцен проекта] }
export function validateScene(scene, ctx) {
  ctx = ctx || {};
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
        if (empty) add(ERR, where + ': не заполнено поле «' + (FIELD_LABEL[f] || f) + '»', sel);
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
        default:
      }
    });
  });
  if (!camKeys) add(WARN, 'Нет ни одного ключа камеры — сцена пойдёт глазами игрока. Поставь ключ: F8 в игре или правый клик по дорожке «Камера»');
  else if (camKeys === 1) add(WARN, 'Всего один ключ камеры — камера будет стоять на месте. Для пролёта нужно 2 и больше');
  return out;
}

export function validateProject(project, scenes) {
  const out = [];
  const add = (sev, msg, scene) => out.push({ sev, msg, sel: null, scene: scene || null });
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
  const sids = (scenes || []).map((s) => s && s.id);
  for (const s of scenes || []) out.push(...validateScene(s, { project, ids: sids }));
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
export function cleanScene(scene) { return strip(scene); }
export function cleanProject(p) { return strip(p); }

export function defaultProject() { return { v: 1, name: 'Мой сюжет', actors: [], vars: [], templates: [] }; }

export function defaultScene(id, title) {
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
export function normalizeScene(scene) {
  const s = strip(scene);
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

export function normalizeProject(p) {
  const s = strip(p || {});
  return { v: 1, name: s.name || 'Сюжет', actors: s.actors || [], vars: s.vars || [], templates: s.templates || [] };
}
