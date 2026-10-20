// «Студия Кокка», фаза 5: сущности мира (точечные сущности как в Valve Hammer) и их «Выходы» (I/O).
// Файл проекта entities.json: [{ id, type, name, pos, rot, props, outputs:[{ on, target, input, param, delay, once }] }]
// Этот файл попадает и в главный процесс (scripts/sync-studio.cjs → electron/studio-validate.cjs): проверка одна.
//
// Цель выхода (target) — как в игре (docs/studio.md, «Фаза 5»):
//   "<id объекта>" — другой объект мира проекта (id объектов из Студии начинаются с «e_»)
//   "scene:<id>", "quest:<id>", "scheme:<id>", "dialog:<id>", "signal:<имя>"
//   "player" (или "!activator") — игрок, который начал цепочку
// Вход (input) и выход (on) — машинные id игры; у сцены-точки выход метки — "mark:<имя>".
// Встроенный каталог ниже — запасной: когда игра на связи, её {t:'entityTypes'} перекрывает его (mergeGameTypes).
import { ERR, WARN } from './validate.js';
import { FX_LIB, checkFxEvent } from './fxlib.js';

const isNum = (v) => typeof v === 'number' && isFinite(v);
const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);
const RES = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const DOC = /^[a-z0-9_.-]{1,64}$/;

// param: { kind: 'text'|'number'|'pos'|'dialog'|'scene'|'quest'|'var'|'anim'|'effect'|'item'|'target', label, required?, hint }
const P = {
  text: (label, hint, required) => ({ kind: 'text', label, hint, required: !!required }),
  num: (label, hint, required) => ({ kind: 'number', label, hint, required: !!required }),
  pos: (label, hint) => ({ kind: 'pos', label, hint }),
  ref: (kind, label, hint, required) => ({ kind, label, hint, required: !!required })
};

// ---------- виды сущностей ----------
// outputs / inputs: [id, подпись, подсказка, param?]
export const ENT_TYPES = {
  player_start: {
    label: 'Старт игрока', icon: 'ent_start', color: '#6cd06c', point: true, one: true, noCommon: true,
    hint: 'Где появляется игрок, когда жмёшь ▶ Играть (F5). Стрелка — куда он смотрит. В проекте один.',
    outputs: [['start', 'Старт', 'Сработает, когда началась игра (F5); у игроков — при первом входе в мир проекта.']],
    inputs: [],
    props: {}
  },
  trigger_zone: {
    label: 'Зона', icon: 'ent_zone', color: '#e0a040',
    hint: 'Невидимая коробка в мире: срабатывает, когда в неё входят, выходят или пока внутри. Позиция — центр низа коробки.',
    outputs: [['enter', 'Вошёл', 'Кто-то из фильтра вошёл в зону.'], ['leave', 'Вышел', 'Вышел из зоны.'], ['inside', 'Внутри', 'Пока внутри — раз в «Внутри: каждые, тиков».']],
    inputs: [],
    props: { size: [4, 3, 4], filter: 'player', every: 5, insideEvery: 20 }
  },
  actor: {
    label: 'Актёр', icon: 'ent_actor', color: '#e8a05a',
    hint: 'Персонаж в мире: житель долины, персонаж проекта или любое существо. Входы: говорить, идти, смотреть, анимация, исчезнуть, появиться, начать диалог.',
    outputs: [['used', 'Кликнули', 'Игрок нажал ПКМ по актёру.']],
    inputs: [
      ['say', 'Говорить', 'Реплика над головой.', P.text('Текст', 'Что сказать.', true)],
      ['walk_to', 'Идти к', 'Идёт к точке или к объекту мира.', P.ref('target', 'Куда', 'x y z или id объекта (например e_zone1).', true)],
      ['look_at', 'Смотреть на', 'Поворачивает голову.', P.ref('target', 'На что', 'player, x y z или id объекта.', true)],
      ['anim', 'Анимация', 'Жест жителя (wave, sit, point…).', P.ref('anim', 'Жест', 'Имя жеста.', true)],
      ['hide', 'Исчезнуть', 'Убрать актёра из мира.'],
      ['show', 'Появиться', 'Поставить актёра на его место.'],
      ['dialog', 'Начать диалог', 'Открыть диалог с этим актёром у игрока (пусто — диалог из свойств).', P.ref('dialog', 'Диалог', 'id диалога.')]
    ],
    props: { kind: 'valley', who: 0, actor: '', type: 'minecraft:villager', name: '', ai: false, spawn: true, speed: 0.6, dialog: '' }
  },
  button: {
    label: 'Кнопка', icon: 'ent_button', color: '#c9b37a', block: true,
    hint: 'Настоящая кнопка на месте объекта. Нажали — сработал выход.',
    outputs: [['pressed', 'Нажата', 'Игрок нажал кнопку.']],
    inputs: [['press', 'Нажать', 'Нажать кнопку самой логикой.']],
    props: {}
  },
  lever: {
    label: 'Рычаг', icon: 'ent_lever', color: '#c9b37a', block: true,
    hint: 'Настоящий рычаг на месте объекта.',
    outputs: [['on', 'Включён', 'Рычаг повернули во «вкл».'], ['off', 'Выключен', 'Рычаг повернули в «выкл».']],
    inputs: [['set_on', 'Перевести вкл', ''], ['set_off', 'Перевести выкл', ''], ['flip', 'Перещёлкнуть', '']],
    props: {}
  },
  pressure_plate: {
    label: 'Нажимная плита', icon: 'ent_plate', color: '#c9b37a', block: true,
    hint: 'Настоящая нажимная плита на месте объекта.',
    outputs: [['pressed', 'Нажата', 'На плиту наступили.'], ['released', 'Отпущена', 'С плиты сошли.']],
    inputs: [],
    props: {}
  },
  scene_point: {
    label: 'Сцена-точка', icon: 'ent_scene', color: '#9fb0ff',
    hint: 'Катсцена, поставленная в мир. Вход «Запустить» проигрывает сцену; выходы — началась, закончилась, на метке (событие «Метка» на дорожке «Мир» сцены).',
    outputs: [['started', 'Началась', ''], ['ended', 'Закончилась', 'Досмотрена или пропущена.'], ['mark', 'На метке «…»', 'Когда сцена дошла до события «Метка» с этим именем.', P.text('Метка', 'Имя метки из сцены.', true)]],
    inputs: [['start', 'Запустить', 'Проиграть сцену.'], ['stop', 'Стоп', 'Остановить сцену.']],
    props: { scene: '', who: 'activator', radius: 64 }
  },
  timer: {
    label: 'Таймер', icon: 'ent_timer', color: '#7cc4f5',
    hint: 'Срабатывает через заданное время (и снова, если «Повторять»).',
    outputs: [['fired', 'Сработал', '']],
    inputs: [['start', 'Старт', ''], ['stop', 'Стоп', ''], ['reset', 'Сброс', 'Начать отсчёт заново.']],
    props: { interval: 5, repeat: true, autostart: false }
  },
  relay: {
    label: 'Реле', icon: 'ent_relay', color: '#b0b0b0',
    hint: 'Узел-переходник: «Сработать» передаёт дальше, если реле включено. Удобно собирать и выключать цепочки.',
    outputs: [['fired', 'Сработал', '']],
    inputs: [['trigger', 'Сработать', '']],
    props: {}
  },
  counter: {
    label: 'Счётчик', icon: 'ent_counter', color: '#b38cf0',
    hint: 'Число от минимума до максимума: «собери 3 ключа» и подобное.',
    outputs: [['max', 'Достиг максимума', ''], ['min', 'Достиг минимума', ''], ['changed', 'Изменился', 'Параметр — новое число.']],
    inputs: [['add', 'Добавить', '', P.num('Сколько', 'По умолчанию 1.')], ['subtract', 'Вычесть', '', P.num('Сколько', 'По умолчанию 1.')], ['set', 'Задать', '', P.num('Значение', '', true)]],
    props: { start: 0, min: 0, max: 10 }
  },
  teleport: {
    label: 'Телепорт', icon: 'ent_teleport', color: '#d070e0',
    hint: 'Переносит игрока в точку назначения (можно в другое измерение). Может быть переходом: пока играет видео сцены, место грузится за кадром.',
    outputs: [['done', 'Перенёс', '']],
    inputs: [['teleport', 'Телепорт игрока', '']],
    props: { dest: [0, 64, 0], dim: 'minecraft:overworld', yaw: 0, pitch: 0, scene: '', video: '', transition: false, loadWhile: true, maxWait: 15 }
  },
  fx: {
    label: 'Эффект', icon: 'rocket', color: '#c59cf0',
    hint: 'Эффект из библиотеки в точке объекта: салют, молния, взрыв, частицы, обломки, цвет экрана… Вход «Запустить».',
    outputs: [],
    inputs: [['play', 'Запустить', '', P.text('Другой эффект', 'Необязательно: id эффекта библиотеки вместо выбранного.')]],
    props: { fx: 'fireworks', count: 3, shape: 'large_ball', colors: ['#ff5040', '#ffd040', '#40a0ff'], to: 'near', radius: 48 }
  },
  sound: {
    label: 'Звук', icon: 'sound', color: '#7cc4f5',
    hint: 'Звук в точке мира.',
    outputs: [],
    inputs: [['play', 'Играть', ''], ['stop', 'Остановить', '']],
    props: { sound: 'minecraft:block.bell.use', vol: 1, pitch: 1, radius: 16, every: 0 }
  },
  light: {
    label: 'Свет', icon: 'light', color: '#f2d76b',
    hint: 'Невидимый блок света (minecraft:light): горит, пока объект включён. «Включить/Выключить» — зажечь и погасить.',
    outputs: [],
    inputs: [['set_level', 'Яркость', '', P.num('Яркость 0–15', '', true)]],
    props: { level: 15 }
  },
  particles: {
    label: 'Частицы', icon: 'ent_particles', color: '#f0a0c0',
    hint: 'Частицы в точке: дым, искры, сердечки… Сыплются, пока объект включён (каждые N тиков).',
    outputs: [],
    inputs: [['burst', 'Вспышка', 'Один раз.']],
    props: { particle: 'minecraft:flame', count: 10, spread: [0.5, 0.5, 0.5], speed: 0.02, every: 10 }
  },
  message: {
    label: 'Сообщение', icon: 'ent_message', color: '#e0e0e0',
    hint: 'Титр, строка над хотбаром или сообщение в чат.',
    outputs: [],
    inputs: [['show', 'Показать', '', P.text('Текст', 'Пусто — текст из свойств.')]],
    props: { text: 'Глава 1', style: 'title', sub: '', ticks: 60, to: 'activator', radius: 32 }
  },
  structure: {
    label: 'Постройка', icon: 'structure', color: '#e7a96a',
    hint: 'Постройка из библиотеки: «Поставить» и «Убрать» во время игры.',
    outputs: [['placed', 'Поставлена', '']],
    inputs: [['place', 'Поставить', ''], ['remove', 'Убрать', 'Вернуть, что было до неё.']],
    props: { structure: '', rot: 0, mirror: false, anchor: 'corner', air: true }
  },
  quest_giver: {
    label: 'Выдача задания', icon: 'quest', color: '#e6c23c',
    hint: 'Начинает или завершает задание игроку.',
    outputs: [],
    inputs: [['start', 'Начать задание', ''], ['complete', 'Завершить задание', '']],
    props: { quest: '' }
  },
  var_set: {
    label: 'Переменная', icon: 'vars', color: '#9ed2ff',
    hint: 'Записывает или прибавляет переменную проекта.',
    outputs: [],
    inputs: [['set', 'Задать', '', P.text('Значение', 'Пусто — значение из свойств.')]],
    props: { name: '', value: true, op: 'set' }
  }
};
// у всех видов, кроме «Старта игрока», есть ещё «Включить», «Выключить», «Переключить»
export const COMMON_INPUTS = [['enable', 'Включить', 'Объект снова работает и слушает входы.'], ['disable', 'Выключить', 'Объект не срабатывает и не слушает входы (кроме «Включить»).'], ['toggle', 'Переключить', 'Включить ↔ выключить.']];
export function entInputs(type) { const d = ENT_TYPES[type]; if (!d) return []; return d.noCommon ? d.inputs : [...d.inputs, ...COMMON_INPUTS.filter((c) => !d.inputs.some((x) => x[0] === c[0]))]; }
// каталог из игры ({t:'entityTypes'}) главнее встроенного: подписи, подсказки, входы и выходы берутся оттуда
const PK = { text: 'text', number: 'number', pos: 'pos', anim: 'anim', dialog: 'dialog', value: 'text' };
function fromGameIO(list, old) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.id).map((x) => {
    const was = (old || []).find((o) => o[0] === x.id);
    const pd = !x.param || x.param === 'none' ? undefined : was && was[3] && was[3].kind === (PK[x.param] || 'text') ? was[3] : { kind: PK[x.param] || 'text', label: x.paramRu || 'Параметр', hint: x.paramHint || '', required: !!x.required };
    return [x.id, x.ru || x.id, x.hint || (was ? was[2] : ''), pd];
  });
}
export function mergeGameTypes(msg) {
  let n = 0;
  for (const t of (msg && msg.types) || []) {
    if (!t || !t.id) continue;
    const d = ENT_TYPES[t.id] || (ENT_TYPES[t.id] = { label: t.ru || t.id, icon: 'info', color: t.color || '#ccc', inputs: [], outputs: [], props: {} });
    if (t.ru) d.label = t.ru;
    if (t.hint) d.hint = t.hint;
    if (Array.isArray(t.outputs)) d.outputs = fromGameIO(t.outputs.map((o) => (o && o.id === 'mark:<имя>' ? { ...o, id: 'mark' } : o)), d.outputs);
    if (Array.isArray(t.inputs)) { const own = t.inputs.filter((x) => x && !COMMON_INPUTS.some((c) => c[0] === x.id)); d.inputs = fromGameIO(own, d.inputs); }
    if (t.props && typeof t.props === 'object') d.props = { ...t.props };
    n++;
  }
  for (const t of (msg && msg.targets) || []) {
    const k = String(t && t.id || '').replace(/:$/, '');
    if (!k) continue;
    const d = TARGET_KINDS[k] || (TARGET_KINDS[k] = { label: t.ru || k, inputs: [] });
    if (Array.isArray(t.inputs)) d.inputs = fromGameIO(t.inputs, d.inputs);
  }
  return n;
}
// жители долины по номеру who (как в моде Villagers)
export const VALLEY_NAMES = ['Мирон', 'Таисия', 'Марта', 'Леван', 'Броня', 'Аглая', 'Егор', 'Глеб', 'Неля', 'Рада', 'Ярина', 'Данила', 'Савелий', 'Тим', 'Маг'];
export const ENT_TOOL_ORDER = ['player_start', 'trigger_zone', 'actor', 'button', 'lever', 'pressure_plate', 'scene_point', 'timer', 'relay', 'counter', 'teleport', 'sound', 'light', 'particles', 'fx', 'message', 'structure', 'quest_giver', 'var_set'];

// входы целей, которые не сущности
export const TARGET_KINDS = {
  scene: { label: 'Сцена', inputs: [['start', 'Запустить', 'Проиграть сцену.'], ['stop', 'Стоп', 'Остановить сцену.']] },
  quest: { label: 'Задание', inputs: [['start', 'Начать', ''], ['advance', 'Продвинуть', '', P.text('Шаг', 'id шага (пусто — текущий).')], ['complete', 'Завершить', ''], ['fail', 'Провалить', ''], ['reset', 'Сбросить', '']] },
  scheme: { label: 'Схема', inputs: [['enable', 'Включить', ''], ['disable', 'Выключить', ''], ['fire', 'Запустить', 'Как кнопка «Запустить событие» в Схемах.', P.text('Узел', 'id узла (пусто — все события).')]] },
  dialog: { label: 'Диалог', inputs: [['open', 'Открыть', 'Открыть диалог у игрока.']] },
  signal: { label: 'Сигнал', inputs: [['raise', 'Поднять', 'Событие «Сигнал» во всех схемах.']] },
  player: { label: 'Игрок', inputs: [
    ['message', 'Сообщение', 'Строка в чат.', P.text('Текст', '', true)],
    ['teleport', 'Перенести', '', P.pos('Куда', 'x y z')],
    ['give', 'Дать предмет', '', P.ref('item', 'Предмет', 'minecraft:bread 3', true)],
    ['effect', 'Эффект', '', P.ref('effect', 'Эффект', 'minecraft:speed 10 1', true)],
    ['heal', 'Вылечить', '']
  ] }
};
export const OUT_ACTION_RU = { enter: 'Вошёл', leave: 'Вышел' };

export function entLabel(type) { return (ENT_TYPES[type] || {}).label || type; }
export function isEntId(id) { return typeof id === 'string' && /^e_[a-z0-9_]{1,60}$/.test(id); }
export function newEntityId(ents, type) {
  const base = 'e_' + ({ player_start: 'start', trigger_zone: 'zone', pressure_plate: 'plate', scene_point: 'scene', quest_giver: 'quest', var_set: 'var' }[type] || type);
  const taken = new Set((ents || []).map((e) => e && e.id));
  let n = 1;
  while (taken.has(base + n)) n++;
  return base + n;
}
export function makeEntity(ents, type, opt = {}) {
  const def = ENT_TYPES[type];
  if (!def) throw new Error('Неизвестный вид сущности: ' + type);
  const id = newEntityId(ents, type);
  const sameN = (ents || []).filter((e) => e && e.type === type).length;
  return {
    id, type, name: opt.name || (def.one ? def.label : def.label + ' ' + (sameN + 1)),
    pos: isP3(opt.pos) ? opt.pos.slice() : [0, 64, 0], rot: [isNum(opt.yaw) ? opt.yaw : 0, 0, 0],
    props: JSON.parse(JSON.stringify({ ...def.props, ...(opt.props || {}) })), outputs: []
  };
}

// цель → { kind, id }
export function parseTarget(t) {
  if (typeof t !== 'string' || !t) return { kind: null, id: null };
  if (t === 'player' || t === '!activator') return { kind: 'player', id: null };
  const m = /^(scene|quest|scheme|dialog|signal):(.+)$/.exec(t);
  if (m) return { kind: m[1], id: m[2] };
  return { kind: 'entity', id: t };
}
// какие входы есть у цели (для выпадающего списка «Что сделать»): [[id, подпись, подсказка, param?]]
export function inputsForTarget(target, ents, self) {
  const p = parseTarget(target);
  if (p.kind === 'entity') {
    const e = (ents || []).find((x) => x && x.id === p.id) || (self && self.id === p.id ? self : null);
    return e && ENT_TYPES[e.type] ? entInputs(e.type) : [];
  }
  if (p.kind && TARGET_KINDS[p.kind]) return TARGET_KINDS[p.kind].inputs;
  return [];
}
export function outputsOf(type) { return (ENT_TYPES[type] || {}).outputs || []; }
// выход «mark:<имя>» у сцены-точки — это выход «mark» с именем метки
export function outBase(on) { return typeof on === 'string' && on.startsWith('mark:') ? 'mark' : on; }
export function outputLabel(type, on) { const o = outputsOf(type).find((x) => x[0] === outBase(on)); return o ? (outBase(on) === 'mark' && on.length > 5 ? 'На метке «' + on.slice(5) + '»' : o[1]) : on; }
export function inputLabel(target, input, ents, self) { const i = inputsForTarget(target, ents, self).find((x) => x[0] === input); return i ? i[1] : input; }
export function targetLabel(target, ents, lists) {
  const p = parseTarget(target);
  if (p.kind === 'player') return 'Игрок';
  if (p.kind === 'signal') return 'Сигнал «' + p.id + '»';
  if (p.kind === 'entity') { const e = (ents || []).find((x) => x && x.id === p.id); return e ? e.name : p.id + ' (нет!)'; }
  const l = lists && lists[p.kind + 's'];
  const it = Array.isArray(l) ? l.find((x) => x.id === p.id) : null;
  return (TARGET_KINDS[p.kind] ? TARGET_KINDS[p.kind].label : p.kind) + ' «' + (it ? it.title || it.id : p.id) + '»';
}
export function newOutput(type) {
  const o = outputsOf(type)[0];
  return { on: o ? o[0] : '', target: '', input: '', param: '', delay: 0, once: false };
}
// «Входы» сущности: кто её вызывает — [{ from: сущность, i, out }]
export function incomingOf(ents, id) {
  const res = [];
  for (const e of ents || []) {
    if (!e || !Array.isArray(e.outputs)) continue;
    e.outputs.forEach((o, i) => { if (o && o.target === id) res.push({ from: e, i, out: o }); });
  }
  return res;
}

// ---------- проверка ----------
// ctx: { scenes:[id], quests:[id], schemes:[id], dialogs:[id], structures:[id], vars:[name] }
// issues: { sev, ent, out?, msg } — out: номер выхода
export function validateEntities(ents, ctx) {
  const c = ctx || {};
  const issues = [];
  const add = (sev, msg, ent, out) => issues.push({ sev, kind: 'entity', ent: ent || null, out: out == null ? null : out, msg });
  if (!Array.isArray(ents)) { add(ERR, 'entities.json: должен быть список сущностей'); return issues; }
  const ids = new Set();
  const has = (list, id) => !Array.isArray(list) || list.includes(id);
  let starts = 0;
  for (const e of ents) {
    if (!e || typeof e !== 'object') { add(ERR, 'Сущность без данных — файл повреждён'); continue; }
    const nm = '«' + (e.name || e.id || '?') + '»';
    if (!isEntId(e.id)) add(ERR, 'Сущность ' + nm + ': id «' + e.id + '» — e_ и латиница/цифры/_', e.id);
    if (ids.has(e.id)) add(ERR, 'Сущность ' + nm + ': id «' + e.id + '» повторяется', e.id);
    ids.add(e.id);
    const def = ENT_TYPES[e.type];
    if (!def) { add(ERR, 'Сущность ' + nm + ': неизвестный вид «' + e.type + '»', e.id); continue; }
    if (e.type === 'player_start') starts++;
    if (!isP3(e.pos)) add(ERR, def.label + ' ' + nm + ': позиция — три числа x y z', e.id);
    const p = e.props || {};
    switch (e.type) {
      case 'trigger_zone':
        if (!isP3(p.size) || p.size.some((v) => v <= 0)) add(ERR, 'Зона ' + nm + ': размер — три числа больше нуля', e.id);
        if (!['player', 'mob', 'villager', 'any'].includes(p.filter || 'player')) add(ERR, 'Зона ' + nm + ': фильтр — игрок, моб, житель или любой', e.id);
        if ((e.outputs || []).some((o) => o && o.on === 'inside') && p.insideEvery !== undefined && !(isNum(p.insideEvery) && p.insideEvery >= 1)) add(ERR, 'Зона ' + nm + ': «Внутри: каждые, тиков» — от 1', e.id);
        break;
      case 'actor':
        if (p.kind === 'entity' && !RES.test(p.type || '')) add(ERR, 'Актёр ' + nm + ': id существа пиши вида minecraft:villager', e.id);
        if (p.kind === 'valley' && !(Number.isInteger(p.who) && p.who >= 0 && p.who <= 14)) add(ERR, 'Актёр ' + nm + ': номер жителя долины — от 0 до 14', e.id);
        if (p.kind === 'story' && !p.actor) add(ERR, 'Актёр ' + nm + ': выбери персонажа проекта', e.id);
        break;
      case 'scene_point':
        if (!p.scene) add(WARN, 'Сцена-точка ' + nm + ': не выбрана сцена', e.id);
        else if (!has(c.scenes, p.scene)) add(ERR, 'Сцена-точка ' + nm + ': сцены «' + p.scene + '» нет в проекте', e.id);
        break;
      case 'timer':
        if (!(isNum(p.interval) && p.interval > 0)) add(ERR, 'Таймер ' + nm + ': время — больше 0 секунд', e.id);
        break;
      case 'counter':
        if (!(isNum(p.min) && isNum(p.max) && p.max > p.min)) add(ERR, 'Счётчик ' + nm + ': максимум должен быть больше минимума', e.id);
        break;
      case 'teleport':
        if (!isP3(p.dest)) add(ERR, 'Телепорт ' + nm + ': куда — три числа x y z', e.id);
        if (p.dim && !RES.test(p.dim)) add(ERR, 'Телепорт ' + nm + ': измерение пиши вида minecraft:the_nether', e.id);
        if (p.scene && !has(c.scenes, p.scene)) add(WARN, 'Телепорт ' + nm + ': сцены «' + p.scene + '» нет', e.id);
        if (p.video && !has(c.scenes, p.video)) add(ERR, 'Телепорт ' + nm + ': видео записывается со сцены, а сцены «' + p.video + '» нет', e.id);
        if (p.maxWait !== undefined && !(isNum(p.maxWait) && p.maxWait >= 1 && p.maxWait <= 120)) add(ERR, 'Телепорт ' + nm + ': ждать мир — от 1 до 120 секунд', e.id);
        break;
      case 'fx':
        if (!FX_LIB[p.fx] || FX_LIB[p.fx].track === 'actor' || p.fx === 'slowmo') add(ERR, 'Эффект ' + nm + ': выбери эффект библиотеки (экран, мир или звук)', e.id);
        else checkFxEvent(p.fx, { ...p, pos: p.pos || e.pos }, 'Эффект ' + nm, (sev, msg) => add(sev, msg, e.id), null, ERR, WARN, { structures: c.structures });
        break;
      case 'sound':
        if (!RES.test(p.sound || '')) add(ERR, 'Звук ' + nm + ': id звука пиши вида minecraft:block.bell.use', e.id);
        break;
      case 'light':
        if (p.level !== undefined && !(Number.isInteger(p.level) && p.level >= 0 && p.level <= 15)) add(ERR, 'Свет ' + nm + ': яркость — от 0 до 15', e.id);
        break;
      case 'particles':
        if (!RES.test(p.particle || '')) add(ERR, 'Частицы ' + nm + ': id частиц пиши вида minecraft:flame', e.id);
        break;
      case 'message':
        if (!['title', 'actionbar', 'chat'].includes(p.style || 'title')) add(ERR, 'Сообщение ' + nm + ': вид — титр, над хотбаром или чат', e.id);
        break;
      case 'structure':
        if (!p.structure) add(WARN, 'Постройка ' + nm + ': не выбрана постройка', e.id);
        else if (!has(c.structures, p.structure)) add(ERR, 'Постройка ' + nm + ': постройки «' + p.structure + '» нет в библиотеке', e.id);
        break;
      case 'quest_giver':
        if (!p.quest) add(WARN, 'Выдача задания ' + nm + ': не выбрано задание', e.id);
        else if (!has(c.quests, p.quest)) add(ERR, 'Выдача задания ' + nm + ': задания «' + p.quest + '» нет', e.id);
        break;
      case 'var_set':
        if (!p.name) add(ERR, 'Переменная ' + nm + ': не выбрана переменная', e.id);
        else if (Array.isArray(c.vars) && !c.vars.includes(p.name)) add(WARN, 'Переменная ' + nm + ': «' + p.name + '» нет в списке переменных проекта', e.id);
        break;
      default:
    }
    validateOutputs(e, ents, c, (sev, msg, i) => add(sev, msg, e.id, i));
  }
  if (starts > 1) add(ERR, 'Старт игрока поставлен ' + starts + ' раза — нужен один');
  if (!starts && ents.length) add(WARN, 'Нет «Старта игрока» — ▶ Играть (F5) начнётся с того места, где стоит игрок');
  return issues;
}

// выходы одной сущности: add(sev, msg, номер выхода)
export function validateOutputs(e, ents, ctx, add) {
  const c = ctx || {};
  const outs = Array.isArray(e.outputs) ? e.outputs : [];
  const nm = '«' + (e.name || e.id) + '»';
  const defOuts = outputsOf(e.type);
  outs.forEach((o, i) => {
    const w = nm + ', выход ' + (i + 1) + ': ';
    if (!o || typeof o !== 'object') { add(ERR, w + 'пустой', i); return; }
    const od = defOuts.find((x) => x[0] === outBase(o.on));
    if (!o.on) add(ERR, w + 'не выбрано «Когда»', i);
    else if (!od) add(ERR, w + 'у вида «' + entLabel(e.type) + '» нет выхода «' + o.on + '»', i);
    else if (od[3] && od[3].required && outBase(o.on) === 'mark' && !(o.on.length > 5)) add(ERR, w + '«' + od[1] + '» — укажи ' + od[3].label.toLowerCase(), i);
    if (!o.target) { add(ERR, w + 'не выбрано «Кому»', i); return; }
    const t = parseTarget(o.target);
    if (t.kind === 'entity') {
      if (!(ents || []).some((x) => x && x.id === t.id)) { add(ERR, w + 'цели «' + t.id + '» нет — её удалили?', i); return; }
    } else if (t.kind === 'scene' && !(!Array.isArray(c.scenes) || c.scenes.includes(t.id))) { add(ERR, w + 'сцены «' + t.id + '» нет', i); return; }
    else if (t.kind === 'quest' && !(!Array.isArray(c.quests) || c.quests.includes(t.id))) { add(ERR, w + 'задания «' + t.id + '» нет', i); return; }
    else if (t.kind === 'scheme' && !(!Array.isArray(c.schemes) || c.schemes.includes(t.id))) { add(ERR, w + 'схемы «' + t.id + '» нет', i); return; }
    else if (t.kind === 'dialog' && !(!Array.isArray(c.dialogs) || c.dialogs.includes(t.id))) { add(ERR, w + 'диалога «' + t.id + '» нет', i); return; }
    if (t.kind && t.kind !== 'entity' && t.kind !== 'signal' && t.id !== null && !DOC.test(t.id)) add(ERR, w + 'неверное имя цели «' + t.id + '»', i);
    const ins = inputsForTarget(o.target, ents, e);
    if (!o.input) { add(ERR, w + 'не выбрано «Что сделать»', i); return; }
    const inp = ins.find((x) => x[0] === o.input);
    if (!inp) { add(ERR, w + 'цель «' + targetLabel(o.target, ents) + '» не умеет «' + o.input + '»' + (ins.length ? ' (умеет: ' + ins.map((x) => x[1]).join(', ') + ')' : ' — у неё нет входов'), i); return; }
    const pd = inp[3];
    const empty = o.param === undefined || o.param === null || o.param === '';
    if (pd && pd.required && empty) add(ERR, w + '«' + inp[1] + '» — нужен параметр «' + pd.label + '»', i);
    if (pd && !empty) {
      if (pd.kind === 'number' && !isFinite(Number(o.param))) add(ERR, w + 'параметр «' + pd.label + '» — число', i);
      if (pd.kind === 'pos' && !parsePos(o.param)) add(ERR, w + 'параметр «' + pd.label + '» — три числа x y z', i);
      if (pd.kind === 'dialog' && Array.isArray(c.dialogs) && !c.dialogs.includes(String(o.param))) add(ERR, w + 'диалога «' + o.param + '» нет', i);
      if (pd.kind === 'target') { const s = String(o.param); if (s !== 'player' && !parsePos(s) && !(ents || []).some((x) => x && x.id === s)) add(WARN, w + '«' + pd.label + '»: ни точка, ни сущность — «' + s + '»', i); }
    }
    if (o.delay !== undefined && o.delay !== null && o.delay !== '' && !(isNum(Number(o.delay)) && Number(o.delay) >= 0)) add(ERR, w + 'задержка — число секунд, не меньше 0', i);
    if (Number(o.delay) > 3600) add(WARN, w + 'задержка больше часа', i);
  });
}
export function parsePos(v) {
  if (isP3(v)) return v;
  const a = String(v == null ? '' : v).trim().split(/[\s,;]+/).map(Number);
  return a.length === 3 && a.every(isNum) ? a : null;
}

// чистка перед записью: только известные поля, числа — числами
export function cleanEntities(ents) {
  if (!Array.isArray(ents)) return [];
  return ents.filter((e) => e && typeof e === 'object' && e.id).map((e) => {
    const o = { id: e.id, type: e.type, name: String(e.name || e.id).slice(0, 80), pos: isP3(e.pos) ? e.pos : [0, 64, 0], rot: Array.isArray(e.rot) ? e.rot.slice(0, 3).map((v) => (isNum(v) ? v : 0)) : [0, 0, 0], props: e.props && typeof e.props === 'object' ? e.props : {} };
    if (typeof e.dim === 'string' && e.dim) o.dim = e.dim;
    if (e.note) o.note = String(e.note);
    if (e.enabled === false) o.enabled = false;
    o.outputs = (Array.isArray(e.outputs) ? e.outputs : []).filter((x) => x && typeof x === 'object').map((x) => {
      const r = { on: String(x.on || ''), target: String(x.target || ''), input: String(x.input || '') };
      if (x.param !== undefined && x.param !== null && x.param !== '') r.param = x.param;
      const d = Number(x.delay);
      r.delay = isNum(d) && d > 0 ? Math.round(d * 100) / 100 : 0;
      if (x.once) r.once = true;
      if (x.note) r.note = String(x.note);
      return r;
    });
    return o;
  });
}
