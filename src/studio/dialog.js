// Диалоги Студии: виды узлов, размеры для графа, авто-раскладка, короткие подписи условий/действий
// и «прочитать как игрок» — проверка диалога без игры на выдуманных переменных.
import { nodeOutputs, getOut, isEndRef, condKind, actionKind, varDefault } from './validate.js';

export const NODE_DEFS = {
  line: { label: 'Реплика', color: '#6ee7a0', hint: 'Фраза персонажа (или самого игрока). Игрок читает и жмёт «дальше». В тексте можно {player} — имя игрока и {var:имя} — значение переменной.' },
  choice: { label: 'Выбор', color: '#e6b65c', hint: 'Игрок выбирает ответ. У каждого варианта своя стрелка. Вариант с условием показывается серым (или прячется), если условие не выполнено.' },
  cond: { label: 'Условие', color: '#7cc4f5', hint: 'Развилка без участия игрока: если всё в списке выполняется — идём по стрелке «да», иначе по «нет». Например: «уже знакомы?»' },
  action: { label: 'Действие', color: '#c59cf0', hint: 'Что-то меняется в мире: записать переменную, дать или забрать предмет, начать задание, добавить доверие, опыт, звук. Игрок этого узла не видит.' },
  scene: { label: 'Сцена', color: '#e8a070', hint: 'Проиграть катсцену из вкладки «Сцены». Можно дождаться её конца и продолжить разговор.' },
  jump: { label: 'Переход', color: '#e9dcc6', hint: 'Продолжить другим диалогом (или другим узлом). Удобно для общих кусков, которые повторяются в разных разговорах.' },
  end: { label: 'Конец', color: '#ff8a7a', hint: 'Разговор заканчивается, окно закрывается. Стрелку можно вести сюда из любого узла.' }
};
export const PALETTE = ['line', 'choice', 'cond', 'action', 'scene', 'jump', 'end'];

export function newNode(type, refs) {
  const firstVar = (refs && refs.vars && refs.vars[0]) || null;
  switch (type) {
    case 'line': return { type, who: 'speaker', text: '' };
    case 'choice': return { type, text: '', options: [{ text: 'Да' }, { text: 'Нет' }] };
    case 'cond': return { type, if: [firstVar ? { var: firstVar.name, op: '==', value: firstVar.init != null ? firstVar.init : varDefault(firstVar.type) } : { time: 'night' }] };
    case 'action': return { type, do: [firstVar ? { set: firstVar.name, value: firstVar.type === 'bool' ? true : varDefault(firstVar.type) } : { xp: 5 }] };
    case 'scene': return { type, scene: (refs && refs.scenes && refs.scenes[0] && refs.scenes[0].id) || '', wait: true };
    case 'jump': return { type, dialog: '', node: '' };
    default: return { type: 'end' };
  }
}

// ---------- размеры узла (SVG) ----------
export const NW = 224;
export const END_W = 124;
export const HEAD = 26;
const ROW = 22;
const LH = 15;
const CPL = 33; // примерно букв в строке
export function wrap(text, cpl, max) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= cpl) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > cpl) { lines.push(cur.slice(0, cpl - 1) + '-'); cur = cur.slice(cpl - 1); }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) { const l = lines.slice(0, max); l[max - 1] = l[max - 1].slice(0, cpl - 1) + '…'; return l; }
  return lines;
}
export function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; }

// { w, h, lines:[{t, cls}], rows:[{key,label,y,cls}], single: y порта «дальше» }
export function nodeBox(n, refs) {
  if (!n || n.type === 'end') return { w: END_W, h: 30, lines: [], rows: [], single: null };
  const lines = [];
  const rows = [];
  let single = null;
  switch (n.type) {
    case 'line': {
      lines.push({ t: whoName(n.who, refs) + ':', cls: 'who' });
      const tl = wrap(n.text || '…пусто', CPL, 3);
      tl.forEach((t) => lines.push({ t, cls: n.text ? '' : 'empty' }));
      break;
    }
    case 'choice': {
      if (n.text) wrap(n.text, CPL, 2).forEach((t) => lines.push({ t, cls: 'dim' }));
      (n.options || []).forEach((o, i) => rows.push({ key: 'opt:' + i, label: clip((o && o.text) || 'вариант ' + (i + 1), 25), cond: !!(o && Array.isArray(o.when) && o.when.length), act: !!(o && Array.isArray(o.do) && o.do.length) }));
      break;
    }
    case 'cond': {
      const list = (n.if || []).map((c) => condText(c, refs));
      if (!list.length) lines.push({ t: 'что проверять?', cls: 'empty' });
      list.slice(0, 3).forEach((t, i) => lines.push({ t: clip((i ? 'и ' : 'если ') + t, CPL + 2), cls: '' }));
      if (list.length > 3) lines.push({ t: '…и ещё ' + (list.length - 3), cls: 'dim' });
      rows.push({ key: 'then', label: 'да' }, { key: 'else', label: 'нет' });
      break;
    }
    case 'action': {
      const list = (n.do || []).map((a) => actionText(a, refs));
      if (!list.length) lines.push({ t: 'пусто — добавь действие', cls: 'empty' });
      list.slice(0, 4).forEach((t) => lines.push({ t: clip('• ' + t, CPL + 2), cls: '' }));
      if (list.length > 4) lines.push({ t: '…и ещё ' + (list.length - 4), cls: 'dim' });
      break;
    }
    case 'scene':
      lines.push({ t: clip('▶ ' + (docTitle(refs && refs.scenes, n.scene) || 'сцена не выбрана'), CPL + 2), cls: n.scene ? '' : 'empty' });
      lines.push({ t: n.wait ? 'ждём конца сцены' : 'не ждём, сразу дальше', cls: 'dim' });
      break;
    case 'jump':
      lines.push({ t: clip('↪ ' + (docTitle(refs && refs.dialogs, n.dialog) || 'диалог не выбран'), CPL + 2), cls: n.dialog ? '' : 'empty' });
      lines.push({ t: n.node ? 'с узла ' + n.node : 'с начала', cls: 'dim' });
      break;
    default: lines.push({ t: 'неизвестный узел «' + n.type + '»', cls: 'empty' });
  }
  let h = HEAD + 6 + lines.length * LH;
  if (rows.length) {
    h += 4;
    rows.forEach((r) => { r.y = h + ROW / 2; h += ROW; });
    h += 4;
  } else {
    h += 8;
    if (n.type !== 'jump') single = HEAD / 2;
  }
  return { w: NW, h: Math.max(h, 44), lines, rows, single };
}
// где выход (порт) в координатах узла
export function portY(n, key, refs) {
  const b = nodeBox(n, refs);
  if (b.single != null) return b.single;
  const r = b.rows.find((x) => x.key === key);
  return r ? r.y : b.h / 2;
}

// ---------- авто-раскладка: колонки слева направо от старта ----------
export function autoLayout(d, refs) {
  const nodes = d.nodes || {};
  const ids = Object.keys(nodes);
  if (!ids.length) return d;
  const succ = (id) => nodeOutputs(nodes[id]).map((o) => getOut(nodes[id], o.key)).filter((t) => t && nodes[t]);
  // обход в глубину: обратные стрелки (циклы) не влияют на колонки
  const order = [];
  const state = {};
  const back = new Set();
  const dfs = (id) => {
    state[id] = 1;
    order.push(id);
    for (const t of succ(id)) {
      if (state[t] === 1) back.add(id + '>' + t);
      else if (!state[t]) dfs(t);
    }
    state[id] = 2;
  };
  if (d.start && nodes[d.start]) dfs(d.start);
  const reached = order.length;
  for (const id of ids) if (!state[id]) dfs(id);
  // самый длинный путь по рёбрам без циклов
  const depth = {};
  ids.forEach((id) => { depth[id] = 0; });
  for (let pass = 0; pass < ids.length; pass++) {
    let ch = false;
    for (const id of order) for (const t of succ(id)) if (!back.has(id + '>' + t) && depth[t] < depth[id] + 1) { depth[t] = depth[id] + 1; ch = true; }
    if (!ch) break;
  }
  // недостижимые — отдельно, правее
  const maxD = Math.max(0, ...order.slice(0, reached).map((id) => depth[id]));
  order.slice(reached).forEach((id) => { depth[id] += maxD + 1; });
  const cols = {};
  order.forEach((id) => { (cols[depth[id]] = cols[depth[id]] || []).push(id); });
  const pos = {};
  const GAPX = 86, GAPY = 26;
  Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((c) => {
    const col = cols[c];
    const want = {};
    const has = {};
    col.forEach((id, i) => {
      const ys = [];
      for (const s of ids) {
        if (!pos[s]) continue;
        nodeOutputs(nodes[s]).forEach((o) => { if (getOut(nodes[s], o.key) === id) ys.push(pos[s].y + portY(nodes[s], o.key, refs)); });
      }
      has[id] = ys.length > 0;
      want[id] = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1e6 + i;
    });
    col.sort((a, b) => want[a] - want[b]);
    let y = 40;
    col.forEach((id) => {
      const b = nodeBox(nodes[id], refs);
      const top = has[id] ? want[id] - Math.min(b.h / 2, 22) : y;
      pos[id] = { x: 40 + c * (NW + GAPX) + (b.w < NW ? 20 : 0), y: Math.round(Math.max(y, top)) };
      y = pos[id].y + b.h + GAPY;
    });
  });
  const out = {};
  for (const id of ids) out[id] = { ...nodes[id], x: pos[id].x, y: pos[id].y };
  return { ...d, nodes: out };
}

export function nextNodeId(nodes) {
  let n = 1;
  while (nodes['n' + n]) n++;
  return 'n' + n;
}

// ---------- подписи ----------
const OP_RU = { '==': '=', '!=': '≠', '>': '>', '<': '<', '>=': '≥', '<=': '≤' };
export function valText(v) { return v === true ? 'да' : v === false ? 'нет' : typeof v === 'string' ? '«' + v + '»' : v == null ? '?' : String(v); }
function actorNm(refs, id) { const a = ((refs && refs.actors) || []).find((x) => x.id === id); return a ? a.name || a.id : id; }
export function docTitle(list, id) { if (!id) return ''; const x = (list || []).find((d) => d.id === id); return x ? x.title || x.id : id; }
export function speakerName(s, refs) {
  if (!s || s === 'any') return 'Житель';
  if (s.startsWith('actor:')) return actorNm(refs, s.slice(6));
  if (s.startsWith('valley:')) return 'Житель №' + s.slice(7);
  if (s.startsWith('name:')) return s.slice(5);
  return s;
}
export function whoName(who, refs) {
  if (!who || who === 'speaker') return (refs && refs.speakerName) || 'Хозяин';
  if (who === 'player') return 'Игрок';
  return speakerName(who, refs);
}
const QSTATE = { not_started: 'не начато', active: 'идёт', done: 'сделано', failed: 'провалено' };
const QOP = { start: 'начать', advance: 'продвинуть', complete: 'завершить', fail: 'провалить' };
const short = (id) => String(id || '?').replace(/^minecraft:/, '');
export function condText(c, refs) {
  switch (condKind(c)) {
    case 'var': return (c.var || '?') + ' ' + (OP_RU[c.op || '=='] || c.op) + ' ' + valText(c.value === undefined ? true : c.value);
    case 'quest': return 'задание «' + docTitle(refs && refs.quests, c.quest) + '» ' + (QSTATE[c.state || 'active'] || c.state) + (c.step ? ', шаг ' + c.step : '');
    case 'item': return 'есть ' + (c.count || 1) + ' × ' + short(c.item);
    case 'trust': return 'доверие ' + actorNm(refs, c.trust) + ' ' + (OP_RU[c.op || '>='] || c.op) + ' ' + c.value;
    case 'time': return c.time === 'day' ? 'сейчас день' : 'сейчас ночь';
    case 'memory': return 'житель помнит «' + (c.memory || '?') + '»';
    case 'chance': return 'шанс ' + Math.round((c.chance || 0) * 100) + '%';
    case 'not': return 'НЕ (' + condText(c.not, refs) + ')';
    case 'any': return 'любое из: ' + (c.any || []).map((x) => condText(x, refs)).join(' | ');
    case 'all': return 'все из: ' + (c.all || []).map((x) => condText(x, refs)).join(' и ');
    default: return '?';
  }
}
export function actionText(a, refs) {
  switch (actionKind(a)) {
    case 'set': return (a.set || '?') + ' = ' + valText(a.value);
    case 'add': return (a.add || '?') + (Number(a.value) < 0 ? ' − ' + -a.value : ' + ' + a.value);
    case 'give': return 'дать ' + (a.count || 1) + ' × ' + short(a.give);
    case 'take': return 'забрать ' + (a.count || 1) + ' × ' + short(a.take);
    case 'trust': return 'доверие ' + actorNm(refs, a.trust) + (Number(a.add) < 0 ? ' ' : ' +') + a.add;
    case 'memory': return 'запомнить «' + (a.memory || '?') + '»';
    case 'quest': return (QOP[a.do] || a.do) + ' «' + docTitle(refs && refs.quests, a.quest) + '»' + (a.step ? ' → ' + a.step : '');
    case 'scene': return 'сцена ' + docTitle(refs && refs.scenes, a.scene);
    case 'dialog': return 'диалог «' + docTitle(refs && refs.dialogs, a.dialog) + '»';
    case 'sound': return 'звук ' + short(a.sound);
    case 'xp': return (a.xp > 0 ? '+' : '') + a.xp + ' опыта';
    case 'command': return a.command || '/?';
    default: return '?';
  }
}

// ---------- «прочитать как игрок» ----------
// Выдуманный мир для проверки: переменные, задания, предметы, доверие, память, время суток, шанс.
export function freshWorld(project, saved) {
  const vars = {};
  for (const v of (project && project.vars) || []) if (v && v.name) vars[v.name] = v.init !== undefined && v.init !== null ? v.init : varDefault(v.type);
  const w = { player: 'Кокк', time: 'day', chance: 'random', vars, quests: {}, items: {}, trust: {}, memory: [] };
  if (saved && typeof saved === 'object') {
    for (const k of ['player', 'time', 'chance']) if (saved[k] != null) w[k] = saved[k];
    for (const k of ['quests', 'items', 'trust']) if (saved[k] && typeof saved[k] === 'object') w[k] = { ...saved[k] };
    if (Array.isArray(saved.memory)) w.memory = saved.memory.slice();
    if (saved.vars && typeof saved.vars === 'object') w.vars = { ...vars, ...saved.vars };
  }
  return w;
}
function cmp(a, op, b) {
  switch (op || '==') {
    case '==': return a === b || (a != null && b != null && String(a) === String(b));
    case '!=': return !(a === b || (a != null && b != null && String(a) === String(b)));
    case '>': return Number(a) > Number(b);
    case '<': return Number(a) < Number(b);
    case '>=': return Number(a) >= Number(b);
    case '<=': return Number(a) <= Number(b);
    default: return false;
  }
}
export function evalCond(c, w) {
  switch (condKind(c)) {
    case 'var': return cmp(w.vars[c.var] === undefined ? null : w.vars[c.var], c.op, c.value === undefined ? true : c.value);
    case 'quest': {
      const q = w.quests[c.quest] || { state: 'not_started' };
      if ((c.state || 'active') !== (q.state || 'not_started')) return false;
      return c.step ? q.step === c.step : true;
    }
    case 'item': return (Number(w.items[c.item]) || 0) >= (c.count || 1);
    case 'trust': return cmp(Number(w.trust[c.trust]) || 0, c.op || '>=', Number(c.value) || 0);
    case 'time': return w.time === c.time;
    case 'memory': return w.memory.includes(c.memory);
    case 'chance': return w.chance === 'yes' ? true : w.chance === 'no' ? false : Math.random() < (c.chance || 0);
    case 'not': return !evalCond(c.not, w);
    case 'any': return (c.any || []).some((x) => evalCond(x, w));
    case 'all': return (c.all || []).every((x) => evalCond(x, w));
    default: return false;
  }
}
export function evalConds(list, w) { return (list || []).every((c) => evalCond(c, w)); }
// выполнить действие на копии мира; вернуть [мир, что случилось]
export function applyAction(a, w0, refs) {
  const w = { ...w0, vars: { ...w0.vars }, quests: { ...w0.quests }, items: { ...w0.items }, trust: { ...w0.trust }, memory: w0.memory.slice() };
  const k = actionKind(a);
  let text = actionText(a, refs);
  switch (k) {
    case 'set': w.vars[a.set] = a.value; break;
    case 'add': w.vars[a.add] = (Number(w.vars[a.add]) || 0) + (Number(a.value) || 0); text += ' → ' + w.vars[a.add]; break;
    case 'give': w.items[a.give] = (Number(w.items[a.give]) || 0) + (a.count || 1); break;
    case 'take': {
      const have = Number(w.items[a.take]) || 0;
      if (have < (a.count || 1)) text += ' — у игрока только ' + have + '! (в игре заберётся сколько есть)';
      w.items[a.take] = Math.max(0, have - (a.count || 1));
      break;
    }
    case 'trust': w.trust[a.trust] = (Number(w.trust[a.trust]) || 0) + (Number(a.add) || 0); text += ' → ' + w.trust[a.trust]; break;
    case 'memory': if (!w.memory.includes(a.memory)) w.memory.push(a.memory); break;
    case 'quest': {
      const q = { ...(w.quests[a.quest] || { state: 'not_started' }) };
      const steps = ((refs && refs.quests) || []).find((x) => x.id === a.quest);
      const ids = steps && Array.isArray(steps.steps) ? steps.steps.map((s) => (typeof s === 'string' ? s : s.id)) : [];
      if (a.do === 'start') { q.state = 'active'; q.step = a.step || ids[0] || null; }
      if (a.do === 'advance') { q.state = 'active'; const i = ids.indexOf(q.step); q.step = a.step || ids[i + 1] || q.step; }
      if (a.do === 'complete') { q.state = 'done'; q.step = null; }
      if (a.do === 'fail') { q.state = 'failed'; }
      w.quests[a.quest] = q;
      text += ' → ' + (QSTATE[q.state] || q.state) + (q.step ? ', шаг ' + q.step : '');
      break;
    }
    case 'scene': text += ' (в игре проиграется катсцена)'; break;
    case 'dialog': text = 'откроется диалог «' + docTitle(refs && refs.dialogs, a.dialog) + '» (после этого)'; break;
    case 'sound': text += ' (в игре прозвучит)'; break;
    case 'xp': text += ' (в игре)'; break;
    case 'command': text = 'команда ' + a.command + ' (выполнится только в игре)'; break;
    default:
  }
  return [w, text];
}
export function substitute(text, w) {
  return String(text || '').replace(/\{player\}/g, w.player || 'Игрок').replace(/\{var:([^}]+)\}/g, (_, n) => (w.vars[n] === undefined ? '{' + n + '?}' : valText(w.vars[n]).replace(/^«|»$/g, '')));
}
export { isEndRef, nodeOutputs, getOut };
