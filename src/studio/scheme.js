// «Студия Кокка», фаза 4: «Схемы» — графы «событие → условие → действие» (как блюпринты UE).
// Чистые функции без зависимостей, кроме validate.js (scripts/sync-studio.cjs кладёт этот файл и в главный процесс).
//
// Файл studio/schemes/<id>.json:
// { v:1, id, title, note, enabled, nodes: { <id>: { type, x, y, …поля вида…, выходы… } } }
// Выходы узлов: next | then/else | outs[i] | body (+ next у цикла). Комментарий выходов не имеет.
import { condKind, actionKind, checkConds, checkActions, isResId, isPos, isNum, isDocId, isVarName, checkSpeaker, OPS, ERR, WARN } from './validate.js';
import { FX_LIB, checkFxEvent, checkTransition } from './fxlib.js';

export const SCHEME_NODE_TYPES = ['event', 'cond', 'action', 'wait', 'sequence', 'random', 'loop', 'gate', 'once', 'comment'];
export const SCHEME_NODE_LABEL = {
  event: 'Событие', cond: 'Условие', action: 'Действие', wait: 'Подождать', sequence: 'По очереди', random: 'Случайно',
  loop: 'Повторить', gate: 'Ворота', once: 'Один раз', comment: 'Комментарий'
};
// категории для цвета и палитры: события — красные, условия — жёлтые, действия — синие, поток — серые
export const SCHEME_NODE_CAT = { event: 'event', cond: 'cond', action: 'action', wait: 'flow', sequence: 'flow', random: 'flow', loop: 'flow', gate: 'flow', once: 'flow', comment: 'note' };

export const EVENT_KINDS = ['start', 'time', 'timer', 'zone', 'talk', 'dialog_end', 'quest', 'scene_end', 'var', 'item', 'block', 'kill', 'death', 'login', 'chat', 'signal'];
export const EVENT_LABEL = {
  start: 'Запуск', time: 'Время суток', timer: 'Таймер', zone: 'Зона', talk: 'Разговор', dialog_end: 'Диалог закончен',
  quest: 'Задание', scene_end: 'Сцена закончилась', var: 'Переменная', item: 'Предмет', block: 'Блок', kill: 'Убит моб',
  death: 'Игрок умер', login: 'Игрок зашёл', chat: 'Сообщение в чат', signal: 'Сигнал'
};
export const TIME_AT = ['dawn', 'day', 'noon', 'dusk', 'night', 'midnight'];
// at: одно из TIME_AT, число 0–23999 или строка «tick N»
export function timeAtTick(at) { if (typeof at === 'number') return at; const m = /^tick\s+(\d+)$/.exec(String(at || '')); return m ? Number(m[1]) : null; }
export const ZONE_ON = ['enter', 'leave', 'inside'];
export const QUEST_ON = ['start', 'step', 'done', 'fail'];
export const ITEM_ON = ['pickup', 'use', 'craft'];
export const BLOCK_ON = ['break', 'place', 'use'];
export const WHO_ZONE = ['player', 'any_player'];

// условия схем: всё из диалогов + новые
export const SCHEME_COND_EXTRA = ['zone', 'players_online', 'weather', 'dim', 'random'];
export const SCHEME_COND_EXTRA_LABEL = { zone: 'Игрок в зоне', players_online: 'Игроков онлайн', weather: 'Погода', dim: 'Измерение', random: 'Случайно (доля)' };
// действия схем: всё из диалогов + новые (порядок важен для распознавания вида)
export const SCHEME_ACTION_EXTRA = ['transition', 'spawn', 'despawn', 'move', 'say', 'block', 'structure', 'fx', 'message', 'tp', 'effect', 'weather', 'time', 'signal', 'scheme', 'gate', 'once'];
export const SCHEME_ACTION_EXTRA_LABEL = {
  spawn: 'Создать актёра/моба', despawn: 'Убрать актёра/моба', move: 'Отправить идти', say: 'Сказать над головой', block: 'Поставить блок',
  structure: 'Поставить постройку', fx: 'Эффект', message: 'Сообщение', tp: 'Перенести игрока', effect: 'Эффект зелья', weather: 'Погода',
  time: 'Время суток', signal: 'Подать сигнал', scheme: 'Вкл/выкл схему', gate: 'Открыть/закрыть ворота', once: 'Сбросить «Один раз»',
  transition: 'Переход (перенос с видео/сценой)'
};
export const FX_BASE_KINDS = ['fade_in', 'fade_out', 'flash', 'shake', 'particles', 'story_fx', 'title'];
// фаза 6: и эффекты библиотеки (кроме существ и замедления — они только в сценах)
export const FX_KINDS = [...FX_BASE_KINDS, ...Object.keys(FX_LIB).filter((k) => FX_LIB[k].track !== 'actor' && k !== 'slowmo')];
export const MSG_STYLES = ['chat', 'title', 'actionbar'];
export const WEATHER_KINDS = ['clear', 'rain', 'thunder'];
export const ROTS = [0, 90, 180, 270];
export const MIRRORS = [false, true, 'x', 'z', 'none'];
export const GATE_SET = ['open', 'close', 'toggle'];
export const MSG_TO = ['player', 'all', 'near'];
// безопасные пределы (их же соблюдает игра)
export const SCHEME_LIMITS = { instances: 64, loop: 1000, waitMin: 1, nodes: 400 };

const NODE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const SIGNAL = /^[a-zA-Z0-9_.-]{1,64}$/;
const BLOCK_STATE = /^[a-z0-9_.-]+:[a-z0-9_./-]+(\[[a-z0-9_=,]*\])?$/;

export function schemeCondKind(c) {
  const k = condKind(c);
  if (k) return k;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  for (const x of SCHEME_COND_EXTRA) if (x in c) return x;
  return null;
}
export function schemeActionKind(a) {
  // { gate, set } и { once, reset } — раньше «set» (переменная) и «scheme»
  if (a && typeof a === 'object' && !Array.isArray(a)) { if ('gate' in a) return 'gate'; if ('once' in a) return 'once'; if (typeof a.fx === 'string' && FX_LIB[a.fx]) return 'fx'; if ('transition' in a) return 'transition'; }
  const k = actionKind(a);
  if (k) return k;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  for (const x of SCHEME_ACTION_EXTRA) if (x in a) return x;
  return null;
}

// ---------- выходы узлов ----------
export function schemeOutputs(n) {
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
export function schemeGetOut(n, key) {
  if (!n) return null;
  if (key.startsWith('out:')) { const v = (n.outs || [])[Number(key.slice(4))]; return v || null; }
  return n[key] || null;
}
// out:<длина> — добавить новый выход в конец
export function schemeSetOut(n, key, target) {
  const c = { ...n };
  if (key.startsWith('out:')) {
    const i = Number(key.slice(4));
    const outs = (c.outs || []).slice();
    if (i >= outs.length) { if (target) { outs.push(target); if (c.type === 'random') c.weights = [...(c.weights || outs.slice(0, -1).map(() => 1)), 1]; } } else outs[i] = target || null;
    c.outs = outs;
  } else if (target) c[key] = target; else delete c[key];
  return c;
}
export function schemeHasInput(n) { return !!n && n.type !== 'event' && n.type !== 'comment'; }

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
    case 'transition': checkTransition(a.transition, w, (sev, msg) => add(sev, msg, sel), ERR, WARN, { scenes: R.scenes }); if (a.to !== undefined && !MSG_TO.includes(a.to)) add(ERR, w + ': кого — игрока, всех или рядом', sel); return;
    case 'fx':
      if (FX_LIB[a.fx]) { checkFxEvent(a.fx, a, w, add, sel, ERR, WARN, { structures: R.structures, ctxPos: true }); return; }
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
    case 'tp': pe(a.tp, false); if (a.dim !== undefined && a.dim !== null && a.dim !== '' && !isResId(a.dim)) add(ERR, w + ': измерение пиши вида minecraft:the_nether', sel); return;
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
export function validateScheme(d, ctx) {
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
export function schemeSignals(d) {
  const raised = [], listened = [];
  const walkA = (a) => { if (a && typeof a.signal === 'string' && schemeActionKind(a) === 'signal') raised.push(a.signal); };
  for (const n of Object.values((d && d.nodes) || {})) {
    if (!n) continue;
    if (n.type === 'event' && n.event === 'signal' && n.name) listened.push(n.name);
    if (n.type === 'action') (n.do || []).forEach(walkA);
  }
  return { raised, listened };
}

export function defaultScheme(id, title) {
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
export function normalizeScheme(d) {
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
