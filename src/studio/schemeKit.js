// «Схемы» в окне Студии: виды узлов (цвета по категориям, подсказки), размеры карточек для Graph.jsx,
// палитра, раскладка, короткие подписи и «прогон без игры» (ход по схеме на выдуманном мире, для подсветки).
import {
  SCHEME_NODE_LABEL, EVENT_KINDS, EVENT_LABEL, schemeOutputs, schemeGetOut, schemeHasInput, schemeCondKind, schemeActionKind,
  SCHEME_COND_EXTRA, SCHEME_ACTION_EXTRA, SCHEME_LIMITS
} from './scheme.js';
import { condText, actionText, wrap, clip, docTitle, speakerName, evalCond } from './dialog.js';
import { HEAD, NW } from './dialog.js';

export const CAT_COLOR = { event: '#e5534b', cond: '#e6c13c', action: '#4f9cf5', flow: '#a3a8b0', note: '#9a9a78' };
export const SCHEME_DEFS = {
  event: { label: 'Событие', color: CAT_COLOR.event, cat: 'event', hint: 'С него всё начинается: «когда наступила ночь», «когда игрок вошёл в зону», «когда закончилась сцена». У события нет входа — только выход.' },
  cond: { label: 'Условие', color: CAT_COLOR.cond, cat: 'cond', hint: 'Развилка: если всё в списке выполняется — дальше по «да», иначе по «нет» (или стоп).' },
  action: { label: 'Действие', color: CAT_COLOR.action, cat: 'action', hint: 'Что сделать: сообщение, предмет, переменная, моб, блок, постройка, эффект, сцена, задание… Выполняются сверху вниз.' },
  wait: { label: 'Подождать', color: CAT_COLOR.flow, cat: 'flow', hint: 'Пауза перед следующим шагом (в тиках, 20 = 1 секунда). Схема не «зависает»: игра ждёт сама.' },
  sequence: { label: 'По очереди', color: CAT_COLOR.flow, cat: 'flow', hint: 'Выполнить несколько веток одну за другой: выход 1, потом 2, потом 3… Тяни от «+», чтобы добавить выход.' },
  random: { label: 'Случайно', color: CAT_COLOR.flow, cat: 'flow', hint: 'Пойти по одной из веток наугад. Вес — насколько часто: 1 и 3 — вторая выпадает втрое чаще.' },
  loop: { label: 'Повторить', color: CAT_COLOR.flow, cat: 'flow', hint: 'Выполнить ветку «каждый раз» N раз (до 1000), потом идти по «потом».' },
  gate: { label: 'Ворота', color: CAT_COLOR.flow, cat: 'flow', hint: 'Пропускают дальше, только когда открыты. Открывает и закрывает действие «Открыть/закрыть ворота». Состояние помнится между перезапусками.' },
  once: { label: 'Один раз', color: CAT_COLOR.flow, cat: 'flow', hint: 'Пропускает только в первый раз (за всю игру мира). Дальше — никогда.' },
  comment: { label: 'Комментарий', color: CAT_COLOR.note, cat: 'note', hint: 'Заметка на схеме для тебя — игра её не читает. Тяни уголок, чтобы изменить размер.' }
};
export const EVENT_HINT = {
  start: 'Сразу при запуске сервера (и когда схему включили). Удобно для подготовки мира.',
  time: 'Когда в мире наступает рассвет, день, закат, ночь или точный тик суток.',
  timer: 'Каждые N тиков, пока сервер работает (20 тиков = 1 секунда).',
  zone: 'Игрок вошёл в зону, вышел из неё или находится внутри (раз в секунду).',
  talk: 'Игрок заговорил (ПКМ) с персонажем.',
  dialog_end: 'Закончился диалог (можно уточнить узел, на котором он закончился).',
  quest: 'Задание началось, перешло на шаг, выполнено или провалено.',
  scene_end: 'Катсцена закончилась (или её пропустили).',
  var: 'Переменная сюжета поменялась (или стала равна значению).',
  item: 'Игрок подобрал, использовал или скрафтил предмет.',
  block: 'Игрок сломал, поставил или нажал блок (можно ограничить зоной).',
  kill: 'Игрок убил моба этого вида (можно ограничить зоной).',
  death: 'Игрок умер.',
  login: 'Игрок зашёл на сервер.',
  chat: 'Кто-то написал в чат сообщение с этим текстом — для твоих проверок.',
  signal: 'Другая схема (или эта) подала сигнал с этим именем — действие «Подать сигнал».'
};
const AT_RU = { dawn: 'на рассвете', day: 'днём (полдень)', dusk: 'на закате', night: 'ночью' };
const ON_RU = { enter: 'вошёл в', leave: 'вышел из', inside: 'внутри' };
const QON_RU = { start: 'начато', step: 'шаг', done: 'сделано', fail: 'провалено' };
const ION_RU = { pickup: 'подобрал', use: 'использовал', craft: 'скрафтил' };
const BON_RU = { break: 'сломал', place: 'поставил', use: 'нажал' };
const short = (id) => String(id || '?').replace(/^minecraft:/, '');
const sec = (t) => (Math.round((t || 0) / 2) / 10) + ' с';
const zoneTxt = (z) => (!z ? 'зона?' : Array.isArray(z.from) ? 'коробка ' + z.from.join(' ') + '…' + (z.to || []).join(' ') : (Array.isArray(z.pos) ? z.pos.map((v) => Math.round(v)).join(' ') : '?') + ', r ' + (z.radius || '?'));
const posTxt = (p) => (p === 'player' ? 'у игрока' : p === 'event' ? 'где событие' : Array.isArray(p) ? p.map((v) => Math.round(v * 10) / 10).join(' ') : '?');
const whoTxt = (s, refs) => (typeof s !== 'string' ? '?' : s.startsWith('actor:') ? speakerName(s, refs) : s.startsWith('entity:') ? short(s.slice(7)) : '«' + s + '»');

export function eventText(n, refs) {
  switch (n.event) {
    case 'start': return 'при запуске сервера';
    case 'time': return n.at === 'tick' ? 'в тик суток ' + (n.tick || 0) : AT_RU[n.at] || '?';
    case 'timer': return 'каждые ' + sec(n.every) + ' (' + (n.every || 0) + ' т)';
    case 'zone': return (n.who === 'any_player' ? 'любой игрок ' : 'игрок ') + (ON_RU[n.on || 'enter'] || '') + ' зону ' + zoneTxt(n);
    case 'talk': return 'разговор с: ' + speakerName(n.speaker, refs);
    case 'dialog_end': return 'конец диалога «' + docTitle(refs && refs.dialogs, n.dialog) + '»' + (n.node ? ' на ' + n.node : '');
    case 'quest': return 'задание «' + docTitle(refs && refs.quests, n.quest) + '»: ' + (QON_RU[n.on || 'start'] || '') + (n.step ? ' ' + n.step : '');
    case 'scene_end': return 'конец сцены «' + docTitle(refs && refs.scenes, n.scene) + '»';
    case 'var': return 'переменная ' + (n.name || '?') + (n.op ? ' ' + n.op + ' ' + JSON.stringify(n.value) : ' поменялась');
    case 'item': return (ION_RU[n.on || 'pickup'] || '') + ' ' + short(n.item);
    case 'block': return (BON_RU[n.on || 'break'] || '') + ' ' + short(n.block) + (n.zone ? ' в зоне' : '');
    case 'kill': return 'убил ' + short(n.entity) + (n.zone ? ' в зоне' : '');
    case 'death': return 'игрок умер';
    case 'login': return 'игрок зашёл';
    case 'chat': return 'в чате: «' + (n.text || '') + '»';
    case 'signal': return 'сигнал «' + (n.name || '?') + '»';
    default: return 'какое событие?';
  }
}
export function sCondText(c, refs) {
  const k = schemeCondKind(c);
  switch (k) {
    case 'zone': return (c.who === 'any_player' ? 'любой игрок' : 'игрок') + ' в зоне ' + zoneTxt(c.zone);
    case 'players_online': return 'игроков онлайн ' + String(c.players_online).replace('>=', '≥ ').replace('<=', '≤ ');
    case 'weather': return 'погода: ' + ({ clear: 'ясно', rain: 'дождь', thunder: 'гроза' }[c.weather] || '?');
    case 'dim': return 'измерение ' + short(c.dim);
    case 'random': return 'шанс ' + Math.round((c.random || 0) * 100) + '%';
    case 'not': return 'НЕ (' + sCondText(c.not, refs) + ')';
    case 'any': return 'любое из: ' + (c.any || []).map((x) => sCondText(x, refs)).join(' | ');
    case 'all': return 'все из: ' + (c.all || []).map((x) => sCondText(x, refs)).join(' и ');
    default: return k ? condText(c, refs) : '?';
  }
}
export function sActionText(a, refs) {
  const k = schemeActionKind(a);
  switch (k) {
    case 'spawn': return 'создать ' + whoTxt(a.spawn, refs) + ' ' + posTxt(a.pos) + (a.as ? ' как «' + a.as + '»' : '');
    case 'despawn': return 'убрать ' + whoTxt(a.despawn, refs);
    case 'move': return whoTxt(a.move, refs) + ' идёт ' + posTxt(a.to);
    case 'say': return whoTxt(a.say, refs) + ': «' + (a.text || '') + '»';
    case 'block': return 'блок ' + short(a.state) + ' ' + posTxt(a.block);
    case 'structure': return 'постройка «' + (((refs && refs.structures) || []).find((x) => x.id === a.structure) || {}).name || a.structure || '?') + '» ' + posTxt(a.pos) + (a.rot ? ' ↻' + a.rot : '');
    case 'fx': return 'эффект: ' + ({ fade_in: 'из темноты', fade_out: 'в темноту', flash: 'вспышка', shake: 'тряска', particles: 'частицы ' + short(a.name), story_fx: a.name || '?', title: '«' + (a.text || '') + '»' }[a.fx] || a.fx);
    case 'message': return (a.to === 'all' ? 'всем' : 'игроку') + ': «' + (a.message || '') + '»';
    case 'tp': return 'перенести игрока в ' + posTxt(a.tp);
    case 'effect': return short(a.effect) + ' ' + (a.level || 1) + ' на ' + (a.seconds || 0) + ' с';
    case 'weather': return 'погода: ' + ({ clear: 'ясно', rain: 'дождь', thunder: 'гроза' }[a.weather] || '?');
    case 'time': return 'время суток ' + a.time;
    case 'signal': return 'сигнал «' + (a.signal || '?') + '»';
    case 'scheme': return (a.enable === false ? 'выключить' : 'включить') + ' схему «' + docTitle(refs && refs.schemes, a.scheme) + '»';
    case 'gate': return (a.open === 'toggle' ? 'переключить' : a.open ? 'открыть' : 'закрыть') + ' ворота ' + (a.gate || '?');
    default: return k ? actionText(a, refs) : '?';
  }
}

const CPL = 33, LH = 15, ROW = 22;
// { w, h, lines, rows, single, title, hint } — как nodeBox диалога
export function schemeNodeBox(n, refs) {
  if (!n) return { w: NW, h: 44, lines: [], rows: [], single: null };
  if (n.type === 'comment') {
    const w = Math.max(120, n.w || 240), h = Math.max(50, n.h || 80);
    return { w, h, lines: wrap(n.text || '…', Math.max(10, Math.floor((w - 20) / 6.4)), Math.max(1, Math.floor((h - 30) / 15))).map((t) => ({ t })), rows: [], single: null };
  }
  const lines = [];
  const rows = [];
  let single = null;
  let title = null, hint = null;
  switch (n.type) {
    case 'event':
      title = 'Событие · ' + (EVENT_LABEL[n.event] || '?');
      hint = EVENT_HINT[n.event] || SCHEME_DEFS.event.hint;
      wrap(eventText(n, refs), CPL, 2).forEach((t) => lines.push({ t, cls: EVENT_KINDS.includes(n.event) ? '' : 'empty' }));
      break;
    case 'cond': {
      const list = (n.if || []).map((c) => sCondText(c, refs));
      if (!list.length) lines.push({ t: 'что проверять?', cls: 'empty' });
      list.slice(0, 3).forEach((t, i) => lines.push({ t: clip((i ? 'и ' : 'если ') + t, CPL + 2), cls: '' }));
      if (list.length > 3) lines.push({ t: '…и ещё ' + (list.length - 3), cls: 'dim' });
      rows.push({ key: 'then', label: 'да' }, { key: 'else', label: 'нет' });
      break;
    }
    case 'action': {
      const list = (n.do || []).map((a) => sActionText(a, refs));
      if (!list.length) lines.push({ t: 'пусто — добавь действие', cls: 'empty' });
      list.slice(0, 4).forEach((t) => lines.push({ t: clip('• ' + t, CPL + 2), cls: '' }));
      if (list.length > 4) lines.push({ t: '…и ещё ' + (list.length - 4), cls: 'dim' });
      break;
    }
    case 'wait': lines.push({ t: 'ждать ' + sec(n.ticks) + ' (' + (n.ticks || 0) + ' т)', cls: n.ticks > 0 ? '' : 'empty' }); break;
    case 'sequence': case 'random': {
      lines.push({ t: n.type === 'sequence' ? 'все выходы по очереди' : 'один выход наугад (по весу)', cls: 'dim' });
      const outs = Array.isArray(n.outs) ? n.outs : [];
      const ws = Array.isArray(n.weights) ? n.weights : [];
      const sum = outs.reduce((s, _, i) => s + (typeof ws[i] === 'number' ? ws[i] : 1), 0) || 1;
      outs.forEach((t, i) => rows.push({ key: 'out:' + i, label: (n.type === 'random' ? 'вариант ' : 'шаг ') + (i + 1), extra: n.type === 'random' ? Math.round(((typeof ws[i] === 'number' ? ws[i] : 1) / sum) * 100) + '%' : null }));
      rows.push({ key: 'out:' + outs.length, label: '+ выход', add: true });
      break;
    }
    case 'loop':
      lines.push({ t: 'повторить ' + (n.times || '?') + ' раз', cls: n.times > 0 ? '' : 'empty' });
      rows.push({ key: 'body', label: 'каждый раз' }, { key: 'next', label: 'потом' });
      break;
    case 'gate': lines.push({ t: n.open === false ? 'в начале закрыты' : 'в начале открыты', cls: '' }); break;
    case 'once': lines.push({ t: 'только в первый раз', cls: '' }); break;
    default: lines.push({ t: 'неизвестный узел «' + n.type + '»', cls: 'empty' });
  }
  let h = HEAD + 6 + lines.length * LH;
  if (rows.length) { h += 4; rows.forEach((r) => { r.y = h + ROW / 2; h += ROW; }); h += 4; } else { h += 8; single = HEAD / 2; }
  return { w: NW, h: Math.max(h, 44), lines, rows, single, title, hint };
}

export function newSchemeNode(type, preset, refs) {
  const v = (refs && refs.vars && refs.vars[0]) || null;
  switch (type) {
    case 'event': {
      const ev = (preset && preset.event) || 'start';
      const base = { type, event: ev };
      if (ev === 'time') return { ...base, at: 'night' };
      if (ev === 'timer') return { ...base, every: 200 };
      if (ev === 'zone') return { ...base, pos: [0, 64, 0], radius: 8, on: 'enter', who: 'player' };
      if (ev === 'talk') return { ...base, speaker: 'actor:' + (((refs && refs.actors) || [])[0] || {}).id };
      if (ev === 'dialog_end') return { ...base, dialog: (((refs && refs.dialogs) || [])[0] || {}).id || '' };
      if (ev === 'quest') return { ...base, quest: (((refs && refs.quests) || [])[0] || {}).id || '', on: 'done' };
      if (ev === 'scene_end') return { ...base, scene: (((refs && refs.scenes) || [])[0] || {}).id || '' };
      if (ev === 'var') return { ...base, name: v ? v.name : '' };
      if (ev === 'item') return { ...base, on: 'pickup', item: 'minecraft:emerald' };
      if (ev === 'block') return { ...base, on: 'break', block: 'minecraft:oak_log' };
      if (ev === 'kill') return { ...base, entity: 'minecraft:zombie' };
      if (ev === 'chat') return { ...base, text: '!тест' };
      if (ev === 'signal') return { ...base, name: ((refs && refs.signals) || [])[0] || 'my_signal' };
      return base;
    }
    case 'cond': return { type, if: [preset && preset.if ? preset.if : { time: 'night' }] };
    case 'action': return { type, do: [preset && preset.do ? preset.do : { message: 'Привет, {player}!', to: 'player', style: 'chat' }] };
    case 'wait': return { type, ticks: 100 };
    case 'sequence': return { type, outs: [] };
    case 'random': return { type, outs: [], weights: [] };
    case 'loop': return { type, times: 3 };
    case 'gate': return { type, open: true };
    case 'once': return { type };
    default: return { type: 'comment', text: 'Заметка', w: 240, h: 80 };
  }
}

// меню «добавить узел»: по категориям; события — только если не тянем стрелку (в событие входить нельзя)
export function schemePalette(from) {
  const it = (type, label, hint, preset) => ({ type, label, color: SCHEME_DEFS[type].color, hint, preset });
  const out = [];
  if (!from) {
    out.push({ head: 'События' });
    for (const k of ['start', 'time', 'timer', 'zone', 'talk', 'dialog_end', 'quest', 'scene_end', 'var', 'item', 'block', 'kill', 'death', 'login', 'chat', 'signal']) out.push(it('event', EVENT_LABEL[k], EVENT_HINT[k], { event: k }));
  }
  out.push({ head: 'Условия и действия' });
  out.push(it('cond', 'Условие', SCHEME_DEFS.cond.hint));
  out.push(it('action', 'Действие', SCHEME_DEFS.action.hint));
  out.push({ head: 'Поток' });
  for (const t of ['wait', 'sequence', 'random', 'loop', 'gate', 'once']) out.push(it(t, SCHEME_DEFS[t].label, SCHEME_DEFS[t].hint));
  if (!from) { out.push({ head: 'Заметки' }); out.push(it('comment', 'Комментарий', SCHEME_DEFS.comment.hint)); }
  return out;
}

export function nextSchemeId(nodes, type) {
  const p = { event: 'e', cond: 'c', action: 'a', wait: 'w', sequence: 's', random: 'r', loop: 'l', gate: 'g', once: 'o', comment: 'cm' }[type] || 'n';
  let n = 1;
  while (nodes[p + n]) n++;
  return p + n;
}

// раскладка: события в первой колонке, дальше по стрелкам; комментарии не трогаем
export function schemeLayout(d, refs) {
  const nodes = d.nodes || {};
  const ids = Object.keys(nodes).filter((id) => nodes[id].type !== 'comment');
  if (!ids.length) return d;
  const succ = (id) => schemeOutputs(nodes[id]).map((o) => schemeGetOut(nodes[id], o.key)).filter((t) => t && nodes[t] && nodes[t].type !== 'comment');
  const roots = ids.filter((id) => nodes[id].type === 'event').sort((a, b) => (nodes[a].y || 0) - (nodes[b].y || 0));
  const depth = {};
  const order = [];
  const state = {};
  const back = new Set();
  const dfs = (id) => { state[id] = 1; order.push(id); for (const t of succ(id)) { if (state[t] === 1) back.add(id + '>' + t); else if (!state[t]) dfs(t); } state[id] = 2; };
  roots.forEach((r) => { if (!state[r]) dfs(r); });
  ids.forEach((id) => { if (!state[id]) dfs(id); });
  ids.forEach((id) => { depth[id] = 0; });
  for (let pass = 0; pass < ids.length; pass++) {
    let ch = false;
    for (const id of order) for (const t of succ(id)) if (!back.has(id + '>' + t) && depth[t] < depth[id] + 1) { depth[t] = depth[id] + 1; ch = true; }
    if (!ch) break;
  }
  const cols = {};
  order.forEach((id) => { (cols[depth[id]] = cols[depth[id]] || []).push(id); });
  const pos = {};
  const GAPX = 80, GAPY = 26;
  Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((c) => {
    let y = 40;
    const col = cols[c];
    const want = {};
    col.forEach((id, i) => {
      const ys = [];
      for (const s of ids) { if (!pos[s]) continue; schemeOutputs(nodes[s]).forEach((o) => { if (schemeGetOut(nodes[s], o.key) === id) { const b = schemeNodeBox(nodes[s], refs); const r = b.rows.find((x) => x.key === o.key); ys.push(pos[s].y + (b.single != null ? b.single : r ? r.y : b.h / 2)); } }); }
      want[id] = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1e6 + i;
    });
    col.sort((a, b) => want[a] - want[b]);
    col.forEach((id) => {
      const b = schemeNodeBox(nodes[id], refs);
      const top = want[id] < 1e6 ? want[id] - Math.min(b.h / 2, 22) : y;
      pos[id] = { x: 40 + c * (NW + GAPX), y: Math.round(Math.max(y, top)) };
      y = pos[id].y + b.h + GAPY;
    });
  });
  const out = {};
  for (const id of Object.keys(nodes)) out[id] = pos[id] ? { ...nodes[id], x: pos[id].x, y: pos[id].y } : nodes[id];
  return { ...d, nodes: out };
}

export const SCHEME_KIT_BASE = {
  NODE_DEFS: SCHEME_DEFS,
  nodeBox: schemeNodeBox,
  isEndRef: () => false,
  nodeOutputs: schemeOutputs,
  getOut: schemeGetOut,
  hasInput: schemeHasInput,
  isComment: (n) => !!n && n.type === 'comment',
  palette: schemePalette,
  empty: 'Схема пустая. Правый клик — добавить событие, условие или действие.',
  what: 'схема'
};

// ---------- «прогон без игры»: шаги, как их выполнит игра (без самих действий в мире) ----------
// world — как у «Прочитать как игрок» (freshWorld): переменные, задания, предметы…; extra: { weather, players, dim, inZone, gates, onceDone }
// результат: [{ node, ok, note }] по порядку (ok:false — условие не прошло / ворота закрыты / уже был «Один раз»)
export function dryRun(scheme, from, world, extra) {
  const nodes = (scheme && scheme.nodes) || {};
  const steps = [];
  const ex = { weather: 'clear', players: 1, dim: 'minecraft:overworld', inZone: true, gates: {}, onceDone: {}, ...(extra || {}) };
  const evalS = (c) => {
    const k = schemeCondKind(c);
    if (SCHEME_COND_EXTRA.includes(k)) {
      if (k === 'zone') return !!ex.inZone;
      if (k === 'weather') return ex.weather === c.weather;
      if (k === 'dim') return ex.dim === c.dim;
      if (k === 'random') return Math.random() < (c.random || 0);
      if (k === 'players_online') { const m = /^(==|!=|>=|<=|>|<)?\s*(\d+)$/.exec(String(c.players_online)) || []; const n = Number(m[2] || 0); const op = m[1] || '=='; const p = ex.players; return op === '>=' ? p >= n : op === '<=' ? p <= n : op === '>' ? p > n : op === '<' ? p < n : op === '!=' ? p !== n : p === n; }
    }
    if (k === 'not') return !evalS(c.not);
    if (k === 'any') return (c.any || []).some(evalS);
    if (k === 'all') return (c.all || []).every(evalS);
    return evalCond(c, world);
  };
  let budget = SCHEME_LIMITS.loop;
  const run = (id, depth) => {
    if (!id || !nodes[id] || budget-- <= 0 || depth > 200) return;
    const n = nodes[id];
    switch (n.type) {
      case 'event': steps.push({ node: id, ok: true, note: 'событие: ' + eventText(n, {}) }); run(n.next, depth + 1); break;
      case 'cond': { const ok = (n.if || []).every(evalS); steps.push({ node: id, ok, note: ok ? 'условие выполнено → «да»' : 'условие не выполнено → «нет»' }); run(ok ? n.then : n.else, depth + 1); break; }
      case 'action':
        steps.push({ node: id, ok: true, note: (n.do || []).length + ' действ.' });
        for (const a of n.do || []) {
          if (schemeActionKind(a) === 'gate') ex.gates[a.gate] = a.open === 'toggle' ? !(ex.gates[a.gate] !== undefined ? ex.gates[a.gate] : (nodes[a.gate] || {}).open !== false) : !!a.open;
          if (schemeActionKind(a) === 'set') world.vars[a.set] = a.value;
          if (schemeActionKind(a) === 'add') world.vars[a.add] = (Number(world.vars[a.add]) || 0) + (Number(a.value) || 0);
          if (schemeActionKind(a) === 'signal') Object.entries(nodes).filter(([, e]) => e.type === 'event' && e.event === 'signal' && e.name === a.signal).forEach(([eid]) => run(eid, depth + 1));
          void SCHEME_ACTION_EXTRA;
        }
        run(n.next, depth + 1);
        break;
      case 'wait': steps.push({ node: id, ok: true, note: 'пауза ' + sec(n.ticks) }); run(n.next, depth + 1); break;
      case 'sequence': steps.push({ node: id, ok: true, note: 'по очереди' }); (n.outs || []).forEach((t) => run(t, depth + 1)); break;
      case 'random': {
        const outs = (n.outs || []).filter(Boolean);
        const ws = (n.outs || []).map((_, i) => (typeof (n.weights || [])[i] === 'number' ? n.weights[i] : 1));
        let r = Math.random() * ws.reduce((s, w) => s + w, 0), pick = -1;
        for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) { pick = i; break; } }
        steps.push({ node: id, ok: !!outs.length, note: pick >= 0 ? 'выпал вариант ' + (pick + 1) : 'нет выходов' });
        if (pick >= 0) run(n.outs[pick], depth + 1);
        break;
      }
      case 'loop': { const k = Math.min(n.times || 0, 20); steps.push({ node: id, ok: true, note: 'повтор ×' + (n.times || 0) + (n.times > 20 ? ' (показано 20)' : '') }); for (let i = 0; i < k; i++) run(n.body, depth + 1); run(n.next, depth + 1); break; }
      case 'gate': { const open = ex.gates[id] !== undefined ? ex.gates[id] : n.open !== false; steps.push({ node: id, ok: open, note: open ? 'ворота открыты' : 'ворота закрыты — стоп' }); if (open) run(n.next, depth + 1); break; }
      case 'once': { const was = !!ex.onceDone[id]; ex.onceDone[id] = true; steps.push({ node: id, ok: !was, note: was ? 'уже было — стоп' : 'первый раз' }); if (!was) run(n.next, depth + 1); break; }
      default:
    }
  };
  run(from, 0);
  return steps;
}
