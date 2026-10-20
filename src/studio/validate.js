// Проверка и нормализация сцен «Студии». Чистые функции без зависимостей.
// Этот же код работает в главном процессе («Собрать для игроков»): electron/studio-validate.cjs
// генерируется из этого файла командой `node scripts/sync-studio.cjs` (её же вызывает scripts/check.cjs).
// Импорт разрешён только из scene3d.js и mograph.js (sync-studio.cjs склеивает их в один файл).

import { compileScene, sceneForDisk, validateObjects, hasObjects } from './scene3d.js';

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
  world: { time: { need: ['value'] }, weather: { need: ['value'] }, block: { need: ['pos', 'state'] }, var: { need: ['name'] }, dialog: { need: ['id'] }, bake: { need: ['placements'] }, mark: { need: ['name'] } }
};

export const TRACK_LABEL = { camera: 'Камера', actor: 'Актёр', fx: 'Эффекты', sound: 'Звук', subtitles: 'Субтитры', world: 'Мир' };
export const VERB_LABEL = {
  key: 'Ключ камеры', line: 'Реплика',
  walk: 'Идти', anim: 'Анимация', face: 'Лицо', look: 'Смотреть', say: 'Сказать', hold: 'Взять в руки', tp: 'Переместить',
  sit: 'Сесть', stand: 'Встать', pose: 'Поза',
  fade_in: 'Из темноты', fade_out: 'В темноту', flash: 'Вспышка', shake: 'Тряска', particles: 'Частицы', story_fx: 'Сюжетный эффект', title: 'Заголовок',
  sound: 'Звук', music: 'Музыка', music_fade: 'Музыка затихает',
  time: 'Время суток', weather: 'Погода', block: 'Блок', var: 'Переменная', dialog: 'Открыть диалог', bake: 'Клонер появляется'
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
  if (opt.letterbox !== undefined && typeof opt.letterbox !== 'boolean') {
    const lb = opt.letterbox;
    if (!lb || typeof lb !== 'object') add(ERR, 'Кинорамка: настройки повреждены');
    else {
      if (lb.aspect !== undefined && !(isNum(lb.aspect) && lb.aspect >= 0 && lb.aspect <= 5)) add(ERR, 'Кинорамка: пропорция кадра — число от 1 до 5 (например 2,39)');
      else if (lb.on && isNum(lb.aspect) && lb.aspect > 0 && lb.aspect <= 16 / 9 + 0.01) add(WARN, 'Кинорамка: при 16:9 и уже полос на обычном экране не будет');
      if (lb.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(lb.color))) add(ERR, 'Кинорамка: цвет пиши вида #000000');
      if (lb.opacity !== undefined && !(isNum(lb.opacity) && lb.opacity >= 0 && lb.opacity <= 1)) add(ERR, 'Кинорамка: непрозрачность — от 0 до 1');
      for (const k of ['inTicks', 'outTicks']) if (lb[k] !== undefined && !(isNum(lb[k]) && lb[k] >= 0)) add(ERR, 'Кинорамка: время появления и ухода — тики, 0 и больше');
    }
  }
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
export function validateProject(project, scenes, extra) {
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
export function cleanScene(scene) { return strip(hasObjects(scene) ? sceneForDisk(scene) : scene); }
export function cleanProject(p) { return strip(p); }

export const DEFAULT_UI = { hud: true, markers: true, chat: false };
export function defaultProject() { return { v: 1, name: 'Мой сюжет', actors: [], vars: [], templates: [], talkPriority: 0, ui: { ...DEFAULT_UI } }; }

// «Кинорамка» (чёрные полосы) — options.letterbox: { on, aspect, color, opacity, inTicks, outTicks }.
// aspect — ширина к высоте кадра (2.39 → 2,39:1); 0 или 16/9 и меньше — полос нет. Старое true/false: true → 2,39:1.
// Новые сцены — без рамки. Рамка не трогает угол обзора камеры: она просто закрывает верх и низ экрана.
export const LETTERBOX_DEFAULT = { on: false, aspect: 2.39, color: '#000000', opacity: 1, inTicks: 20, outTicks: 20 };
export const LETTERBOX_ASPECTS = [[2.39, '2,39:1 — широкий кинокадр'], [2, '2:1 — Univisium'], [1.85, '1,85:1 — кино'], [1.7778, '16:9 — без полос']];
export function letterboxOf(v) {
  if (v === true) return { ...LETTERBOX_DEFAULT, on: true };
  if (!v || typeof v !== 'object') return { ...LETTERBOX_DEFAULT, on: false };
  const n = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  return {
    on: v.on !== false && v.on !== undefined ? true : false,
    aspect: Math.max(0, n(v.aspect, LETTERBOX_DEFAULT.aspect)),
    color: /^#[0-9a-fA-F]{6}$/.test(String(v.color || '')) ? String(v.color).toLowerCase() : LETTERBOX_DEFAULT.color,
    opacity: Math.max(0, Math.min(1, n(v.opacity, 1))),
    inTicks: Math.max(0, Math.round(n(v.inTicks, LETTERBOX_DEFAULT.inTicks))),
    outTicks: Math.max(0, Math.round(n(v.outTicks, LETTERBOX_DEFAULT.outTicks)))
  };
}
// доля высоты кадра под каждую полосу (сверху и снизу) в окне w×h; 0 — полос нет
export function letterboxBar(lb, w, h) {
  const a = Number(lb && lb.aspect) || 0;
  if (!lb || !lb.on || a <= 0 || !w || !h || w / h >= a) return 0;
  return Math.max(0, (h - w / a) / 2 / h);
}

export function defaultScene(id, title) {
  return {
    v: 1, id, title: title || id, note: '',
    world: { dim: 'minecraft:overworld', anchor: null },
    preload: { radius: 3, alongCamera: true, extra: [] },
    options: { letterbox: { ...LETTERBOX_DEFAULT }, hideHud: true, lockInput: true, skippable: true, music: null, endPlayer: { mode: 'back' } },
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
export function normalizeScene(scene) {
  const s = strip(hasObjects(scene) ? compileScene(scene) : scene);
  if (Array.isArray(s.tracks)) s.tracks = s.tracks.map((tr) => { const c = dropGen(tr); if (Array.isArray(c.keys)) c.keys = c.keys.map(dropGen); if (Array.isArray(c.events)) c.events = c.events.map(dropGen); return c; });
  const d = defaultScene(s.id, s.title);
  const out = {
    v: 1, id: s.id, title: s.title || s.id,
    world: { ...d.world, ...(s.world || {}) },
    preload: { ...d.preload, ...(s.preload || {}) },
    options: { ...d.options, ...(s.options || {}), letterbox: letterboxOf((s.options || {}).letterbox === undefined ? d.options.letterbox : s.options.letterbox), endPlayer: { ...d.options.endPlayer, ...((s.options || {}).endPlayer || {}) } },
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

export function normalizeProject(p) {
  const s = strip(p || {});
  const out = { v: s.v === 2 ? 2 : 1, name: s.name || 'Сюжет', actors: s.actors || [], vars: (s.vars || []).map((v) => ({ scope: 'world', ...v })), templates: s.templates || [], talkPriority: isNum(s.talkPriority) ? s.talkPriority : 0, ui: { ...DEFAULT_UI, ...(s.ui || {}) } };
  // фаза 4: пределы схем; фаза 5: проект-карта — id, мир (папка saves или "*" — любой), старт, настройки игры (F5)
  if (s.schemes && typeof s.schemes === 'object') out.schemes = s.schemes;
  if (s.v === 2) {
    out.id = s.id;
    out.world = s.world || null;
    out.worlds = Array.isArray(s.worlds) ? s.worlds : s.world ? [s.world] : [];
    if (s.start) out.start = s.start;
    if (s.play && typeof s.play === 'object') out.play = s.play;
  }
  return out;
}

// ======================= Фаза 2: диалоги, задания, переменные =======================

export const VAR_TYPES = ['bool', 'int', 'text'];
export const OPS = ['==', '!=', '>', '<', '>=', '<='];
export const NODE_TYPES = ['line', 'choice', 'cond', 'action', 'scene', 'jump', 'end'];
export const NODE_LABEL = { line: 'Реплика', choice: 'Выбор', cond: 'Условие', action: 'Действие', scene: 'Сцена', jump: 'Переход', end: 'Конец' };
export const TRIGGERS = ['talk', 'scene', 'quest', 'command'];
export const COND_KINDS = ['var', 'quest', 'item', 'trust', 'time', 'memory', 'chance', 'not', 'any', 'all'];
export const COND_LABEL = { var: 'Переменная', quest: 'Задание', item: 'Есть предмет', trust: 'Доверие', time: 'Время суток', memory: 'Память жителя', chance: 'Случайно', not: 'НЕ (наоборот)', any: 'Любое из', all: 'Все из' };
// порядок важен: { trust, add } — это доверие, а не «прибавить к переменной»
export const ACTION_KINDS = ['trust', 'set', 'add', 'give', 'take', 'memory', 'quest', 'scene', 'dialog', 'sound', 'xp', 'command'];
export const ACTION_LABEL = { set: 'Записать переменную', add: 'Прибавить к переменной', give: 'Дать предмет', take: 'Забрать предмет', trust: 'Доверие', memory: 'Запомнить факт', quest: 'Задание', scene: 'Сцена', dialog: 'Открыть диалог', sound: 'Звук', xp: 'Опыт', command: 'Команда' };
export const QUEST_STATES = ['not_started', 'active', 'done', 'failed'];
export const QUEST_OPS = ['start', 'advance', 'complete', 'fail'];
export const GOAL_TYPES = ['item', 'talk', 'reach', 'kill', 'wait', 'var', 'scene', 'none'];
export const GOAL_LABEL = { item: 'Принести предмет', talk: 'Поговорить', reach: 'Дойти до места', kill: 'Победить мобов', wait: 'Дождаться', var: 'Условие', scene: 'Посмотреть сцену', none: 'Без цели' };
export const VAR_SCOPES = ['world', 'player'];
export const TEXT_MAX = 300;
const DOC_ID = /^[a-z0-9_-]{1,64}$/;
const NODE_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function isDocId(s) { return typeof s === 'string' && DOC_ID.test(s); }
export function isVarName(s) { return typeof s === 'string' && VAR_NAME.test(s); }
export function condKind(c) { if (!c || typeof c !== 'object' || Array.isArray(c)) return null; for (const k of COND_KINDS) if (k in c) return k; return null; }
export function actionKind(a) { if (!a || typeof a !== 'object' || Array.isArray(a)) return null; for (const k of ACTION_KINDS) if (k in a) return k; return null; }
// выходы узла диалога: [{ key, label }] — key: 'next' | 'then' | 'else' | 'opt:<i>'
export function nodeOutputs(n) {
  if (!n) return [];
  switch (n.type) {
    case 'line': case 'action': case 'scene': return [{ key: 'next', label: 'дальше' }];
    case 'cond': return [{ key: 'then', label: 'да' }, { key: 'else', label: 'нет' }];
    case 'choice': return (Array.isArray(n.options) ? n.options : []).map((o, i) => ({ key: 'opt:' + i, label: (o && o.text) || 'вариант ' + (i + 1) }));
    default: return [];
  }
}
export function getOut(n, key) {
  if (!n) return null;
  if (key.startsWith('opt:')) { const o = (n.options || [])[Number(key.slice(4))]; return o ? o.next || null : null; }
  return n[key] || null;
}
export function setOut(n, key, target) {
  const c = { ...n };
  if (key.startsWith('opt:')) {
    const i = Number(key.slice(4));
    c.options = (c.options || []).map((o, j) => { if (j !== i) return o; const x = { ...o }; if (target) x.next = target; else delete x.next; return x; });
  } else if (target) c[key] = target; else delete c[key];
  return c;
}
// «end» в next — конец диалога, даже если узла с таким id нет
export function isEndRef(id, nodes) { return id === 'end' && !(nodes && nodes.end && nodes.end.type !== 'end'); }

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

export function checkSpeaker(s, R, allowAny) {
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
export function checkConds(list, where, add, R, sel) {
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
export function checkActions(list, where, add, R, sel) {
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
export function validateDialog(d, ctx) {
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

export function describeGoal(g) {
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
export function validateQuest(q, ctx) {
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

export function validateVars(project) {
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
export function varDefault(type) { return type === 'bool' ? false : type === 'int' ? 0 : ''; }

export function defaultDialog(id, title) {
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
export function defaultQuest(id, title) {
  return {
    v: 1, id, title: title || id, desc: '', giver: null, start: { auto: false, when: [] },
    steps: [{ id: 's1', title: 'Принеси 3 хлеба', goal: { type: 'item', item: 'minecraft:bread', count: 3, consume: true }, marker: null, onDone: [] }],
    rewards: [{ xp: 10 }], repeatable: false, journal: true
  };
}
export function cleanDoc(d) { return strip(d); }
// для игроков: без служебных полей, координаты узлов округлены (игра их не читает — только Студия)
export function normalizeDialog(d) {
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
export function normalizeQuest(q) {
  const s = strip(q);
  return {
    v: 1, id: s.id, title: s.title || s.id, desc: s.desc || '', giver: s.giver || null,
    start: { auto: false, when: [], ...(s.start || {}) },
    steps: (s.steps || []).map((st) => ({ onDone: [], marker: null, ...st })),
    rewards: s.rewards || [], repeatable: !!s.repeatable, journal: s.journal !== false
  };
}
