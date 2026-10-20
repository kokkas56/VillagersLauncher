// Редакторы условий и действий (общие для диалогов и заданий), выбор говорящего, выпадающие списки ссылок.
import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { NumInput, PosField } from './fields.jsx';
import { COND_KINDS, COND_LABEL, ACTION_KINDS, ACTION_LABEL, condKind, actionKind, OPS, varDefault, isVarName } from './validate.js';
import {
  SCHEME_COND_EXTRA, SCHEME_COND_EXTRA_LABEL, SCHEME_ACTION_EXTRA, SCHEME_ACTION_EXTRA_LABEL, schemeCondKind, schemeActionKind,
  FX_KINDS, MSG_STYLES, WEATHER_KINDS, ROTS
} from './scheme.js';
import { FX_LIB, TRANSITION_DEFAULT } from './fxlib.js';
import { FxFields } from './c4d/Cine.jsx'; // фаза 6: поля эффектов библиотеки

// «Схемы» добавляют свои виды условий и действий (в диалогах и заданиях их нет — игра их там не поймёт)
const S_COND_KINDS = [...COND_KINDS, ...SCHEME_COND_EXTRA];
const S_COND_LABEL = { ...COND_LABEL, ...SCHEME_COND_EXTRA_LABEL };
const S_ACTION_KINDS = [...ACTION_KINDS, ...SCHEME_ACTION_EXTRA];
const S_ACTION_LABEL = { ...ACTION_LABEL, ...SCHEME_ACTION_EXTRA_LABEL };
const ckOf = (c, scheme) => (scheme ? schemeCondKind(c) : condKind(c));
const akOf = (a, scheme) => (scheme ? schemeActionKind(a) : actionKind(a));
export const FX_LABEL = { fade_in: 'Из темноты', fade_out: 'В темноту', flash: 'Вспышка', shake: 'Тряска', particles: 'Частицы', story_fx: 'Сюжетный эффект', title: 'Заголовок на экране' };
export const WEATHER_LABEL = { clear: 'ясно', rain: 'дождь', thunder: 'гроза' };
const STYLE_LABEL = { chat: 'в чат', title: 'заголовком', actionbar: 'над хотбаром' };

export const COND_HINT = {
  var: 'Проверить переменную сюжета: например met_miron = да или coins ≥ 5. Переменные заводятся во вкладке «Переменные».',
  quest: 'Проверить задание: не начато, идёт (можно уточнить шаг), сделано или провалено.',
  item: 'Есть ли у игрока в инвентаре столько предметов. Сам предмет не забирается — для этого действие «Забрать предмет».',
  trust: 'Доверие жителя к игроку (число). Растёт и падает действием «Доверие».',
  time: 'Сейчас день или ночь в мире.',
  memory: 'Помнит ли житель факт — например saw_fire. Факт записывается действием «Запомнить факт».',
  chance: 'Случайность: 0.3 — выполнится в 30% случаев. В «Прочитать как игрок» можно выбрать «всегда да / всегда нет».',
  not: 'Наоборот: выполняется, когда внутреннее условие НЕ выполняется.',
  any: 'Хотя бы одно из списка. (Обычный список условий — это «всё сразу».)',
  all: 'Все условия списка сразу. Нужно внутри «Любое из» или «НЕ», чтобы собрать группу: например «НЕ (ночь и нет фонаря)».',
  zone: 'Игрок, вызвавший событие (или любой игрок), сейчас внутри зоны: шар (центр и радиус) или коробка (два угла).',
  players_online: 'Сколько игроков на сервере: например ≥ 2 — только когда играют вдвоём и больше.',
  weather: 'Какая сейчас погода в мире: ясно, дождь или гроза.',
  dim: 'В каком измерении игрок: обычный мир, Незер, Энд (или измерение мода).',
  random: 'Случайность: 0.3 — пропустит дальше в 30% случаев.'
};
export const ACTION_HINT = {
  set: 'Записать значение в переменную сюжета — потом его проверят условия в диалогах и заданиях.',
  add: 'Прибавить число к переменной (минус — отнять). Например счётчик монет или встреч.',
  give: 'Положить предметы игроку в инвентарь (если места нет — упадут рядом).',
  take: 'Забрать предметы у игрока. Проверь заранее условием «Есть предмет», что они есть.',
  trust: 'Изменить доверие жителя к игроку: +2 — подружились, −5 — обиделся.',
  memory: 'Житель запомнит факт (ValleyMemory) — потом можно проверить условием «Память жителя».',
  quest: 'Начать, продвинуть (на следующий или указанный шаг), завершить или провалить задание.',
  scene: 'Проиграть катсцену из вкладки «Сцены».',
  dialog: 'Открыть игроку другой диалог (после того, как этот закроется). Удобно из шага задания или из награды.',
  sound: 'Проиграть звук у игрока. Громкость 1 — обычная, высота 0.5…2.',
  xp: 'Дать опыт (минус — забрать).',
  command: 'Выполнить команду сервера с правами оператора, например /time set day. Сильный инструмент — проверяй в игре.',
  spawn: 'Создать персонажа проекта (actor:id) или любого моба (entity:тип) в точке. «Как» — имя, по которому его потом найдут «Сказать», «Идти» и «Убрать».',
  despawn: 'Убрать созданного раньше (по имени «как») или персонажа проекта.',
  move: 'Отправить актёра или созданного моба идти к точке.',
  say: 'Фраза облачком над головой персонажа (видят все рядом).',
  block: 'Поставить один блок (minecraft:air — убрать). Можно с состоянием: minecraft:oak_door[open=true].',
  structure: 'Поставить постройку из библиотеки «Строительство» в точку, с поворотом и отражением.',
  fx: 'Эффект на экране или в мире — как в катсценах: затемнение, вспышка, тряска, частицы, заголовок.',
  message: 'Написать игроку (или всем): в чат, большим заголовком или строкой над хотбаром.',
  tp: 'Перенести игрока, вызвавшего событие, в точку.',
  effect: 'Наложить эффект зелья: скорость, сила, ночное зрение… на сколько секунд и какой уровень.',
  weather: 'Сменить погоду в мире.',
  time: 'Поставить время суток: 0 — рассвет, 6000 — полдень, 13000 — ночь, 18000 — полночь.',
  signal: 'Подать сигнал: все схемы с событием «Сигнал» с этим именем сработают. Так схемы связываются между собой.',
  scheme: 'Включить или выключить другую схему (выключенная не реагирует на события).',
  gate: 'Открыть, закрыть или переключить «Ворота» в этой схеме: закрытые ворота дальше не пускают.'
};
const OP_LABEL = { '==': '= равно', '!=': '≠ не равно', '>': '> больше', '<': '< меньше', '>=': '≥ не меньше', '<=': '≤ не больше' };
const QSTATE = [['not_started', 'не начато'], ['active', 'идёт'], ['done', 'сделано'], ['failed', 'провалено']];
const QOPS = [['start', 'начать'], ['advance', 'продвинуть'], ['complete', 'завершить'], ['fail', 'провалить']];

function varOf(refs, name) { return ((refs && refs.vars) || []).find((v) => v && v.name === name) || null; }
function typeOfVal(v) { return typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'int' : 'text'; }

export function condDefault(k, refs) {
  const v = (refs.vars || [])[0];
  const a = (refs.actors || [])[0];
  const q = (refs.quests || [])[0];
  switch (k) {
    case 'var': return v ? { var: v.name, op: '==', value: v.type === 'bool' ? true : varDefault(v.type) } : { var: '', op: '==', value: true };
    case 'quest': return { quest: q ? q.id : '', state: 'active' };
    case 'item': return { item: 'minecraft:bread', count: 1 };
    case 'trust': return { trust: a ? a.id : '', op: '>=', value: 10 };
    case 'time': return { time: 'night' };
    case 'memory': return { memory: '' };
    case 'chance': return { chance: 0.5 };
    case 'not': return { not: { time: 'night' } };
    case 'all': return { all: [{ time: 'night' }, { item: 'minecraft:torch', count: 1 }] };
    case 'zone': return { zone: { pos: [0, 64, 0], radius: 16 }, who: 'player' };
    case 'players_online': return { players_online: '>=2' };
    case 'weather': return { weather: 'rain' };
    case 'dim': return { dim: 'minecraft:overworld' };
    case 'random': return { random: 0.5 };
    default: return { any: [{ time: 'day' }, { time: 'night' }] };
  }
}
export function actionDefault(k, refs) {
  const v = (refs.vars || [])[0];
  const a = (refs.actors || [])[0];
  const q = (refs.quests || [])[0];
  const s = (refs.scenes || [])[0];
  switch (k) {
    case 'set': return v ? { set: v.name, value: v.type === 'bool' ? true : varDefault(v.type) } : { set: '', value: true };
    case 'add': { const iv = (refs.vars || []).find((x) => x.type === 'int'); return { add: iv ? iv.name : '', value: 1 }; }
    case 'give': return { give: 'minecraft:bread', count: 1 };
    case 'take': return { take: 'minecraft:emerald', count: 1 };
    case 'trust': return { trust: a ? a.id : '', add: 2 };
    case 'memory': return { memory: '' };
    case 'quest': return { quest: q ? q.id : '', do: 'start' };
    case 'scene': return { scene: s ? s.id : '' };
    case 'dialog': return { dialog: ((refs.dialogs || [])[0] || {}).id || '' };
    case 'sound': return { sound: 'minecraft:entity.player.levelup', vol: 1, pitch: 1 };
    case 'xp': return { xp: 10 };
    case 'spawn': return { spawn: a ? 'actor:' + a.id : 'entity:minecraft:zombie', pos: 'player', as: 'mob1' };
    case 'despawn': return { despawn: 'mob1' };
    case 'move': return { move: 'mob1', to: 'player', speed: 1 };
    case 'say': return { say: a ? 'actor:' + a.id : 'mob1', text: 'Привет!' };
    case 'block': return { block: [0, 64, 0], state: 'minecraft:air' };
    case 'structure': return { structure: ((refs.structures || [])[0] || {}).id || '', pos: 'player', rot: 0, mirror: false };
    case 'fx': return { fx: 'flash' };
    case 'transition': return { transition: { video: s ? s.id : '', scene: s ? s.id : '', to: { ...TRANSITION_DEFAULT.to, pos: [0, 64, 0] }, loadWhile: true, maxWait: 15, fadeIn: 20 } };
    case 'message': return { message: 'Привет, {player}!', to: 'player', style: 'chat' };
    case 'tp': return { tp: [0, 70, 0] };
    case 'effect': return { effect: 'minecraft:speed', seconds: 10, level: 1 };
    case 'weather': return { weather: 'clear' };
    case 'time': return { time: 13000 };
    case 'signal': return { signal: (refs.signals || [])[0] || 'my_signal' };
    case 'scheme': return { scheme: ((refs.schemes || [])[0] || {}).id || '', enable: true };
    case 'gate': return { gate: (refs.gates || [])[0] || '', set: 'open' };
    case 'once': return { once: (refs.onces || [])[0] || '', reset: true };
    default: return { command: '/time set day' };
  }
}

// значение по типу переменной: да/нет — список, число — число, текст — строка
export function ValueInput({ type, value, onChange }) {
  if (type === 'bool') {
    return (
      <select className="input sm" value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === 'true')}>
        {typeof value !== 'boolean' && <option value="">—</option>}
        <option value="true">да</option><option value="false">нет</option>
      </select>
    );
  }
  if (type === 'int') return <NumInput value={typeof value === 'number' ? value : null} step={1} onChange={(n) => onChange(n == null ? 0 : n)} />;
  if (type === 'text') return <input className="input sm" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
  return <input className="input sm" value={value == null ? '' : String(value)} placeholder="да / нет / число / текст" onChange={(e) => {
    const t = e.target.value.trim();
    onChange(t === 'да' || t === 'true' ? true : t === 'нет' || t === 'false' ? false : t !== '' && isFinite(Number(t)) ? Number(t) : e.target.value);
  }} />;
}

// переменная проекта; можно вписать новую и сразу завести её
export function VarPicker({ value, onChange, refs, wantType, valueForType }) {
  const vars = (refs.vars || []).filter(Boolean);
  const known = vars.some((v) => v.name === value);
  const [typing, setTyping] = useState(!vars.length || (value && !known));
  if (typing || !vars.length) {
    return (
      <div className="lg-var">
        <input className={'input sm mono' + (value && !known ? ' lg-unknown' : '')} value={value || ''} placeholder="имя_латиницей" spellCheck={false}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, '_'))} list="sl-vars" />
        {value && !known && isVarName(value) && refs.addVar && (
          <button className="btn sm ghost" title="Завести эту переменную в проекте (вкладка «Переменные»)" onClick={() => { refs.addVar(value, wantType || typeOfVal(valueForType)); setTyping(false); }}>завести</button>
        )}
        {vars.length > 0 && <button className="btn sm ghost icon-btn" title="Выбрать из списка" onClick={() => { setTyping(false); if (!known) onChange(vars[0].name); }}><Icon name="down" size={9} /></button>}
      </div>
    );
  }
  return (
    <select className="input sm mono" value={value || ''} onChange={(e) => { if (e.target.value === '\u0000') { setTyping(true); onChange(''); } else onChange(e.target.value); }}>
      {!value && <option value="">— выбери —</option>}
      {vars.map((v) => <option key={v.name} value={v.name}>{v.name}{v.note ? ' — ' + v.note.slice(0, 24) : ''}</option>)}
      <option value={'\u0000'}>＋ другая (вписать)…</option>
    </select>
  );
}

export function RefSelect({ list, value, onChange, empty = '— выбери —', allowNone, noneLabel = '— нет —', label = (x) => x.title || x.id }) {
  const has = (list || []).some((x) => x.id === value);
  return (
    <select className="input sm" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      {(allowNone || !value) && <option value="">{allowNone ? noneLabel : empty}</option>}
      {(list || []).map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
      {value && !has && <option value={value}>{value} (не найдено!)</option>}
    </select>
  );
}
export function ActorSelect({ refs, value, onChange }) {
  return <RefSelect list={refs.actors} value={value} onChange={onChange} label={(a) => a.name || a.id} empty="— персонаж —" />;
}
function StepSelect({ refs, quest, value, onChange, none = 'любой шаг' }) {
  const q = (refs.quests || []).find((x) => x.id === quest);
  const steps = q && Array.isArray(q.steps) ? q.steps.map((s) => (typeof s === 'string' ? { id: s } : s)).filter((s) => s && s.id) : [];
  return <RefSelect list={steps} value={value} onChange={onChange} allowNone noneLabel={none} label={(s) => s.id + (s.title ? ' · ' + s.title : '')} />;
}

// кто говорит: любой житель / персонаж проекта / житель долины №N / по имени
export function SpeakerPicker({ value, onChange, refs, allowAny = true, allowSpeaker, allowPlayer }) {
  const v = value || (allowAny ? 'any' : '');
  const mode = v === 'any' ? 'any' : v === 'speaker' ? 'speaker' : v === 'player' ? 'player' : v.startsWith('actor:') ? 'actor' : v.startsWith('valley:') ? 'valley' : v.startsWith('name:') ? 'name' : '';
  const set = (m) => {
    if (m === 'any' || m === 'speaker' || m === 'player') onChange(m);
    else if (m === 'actor') onChange('actor:' + (((refs.actors || [])[0] || {}).id || ''));
    else if (m === 'valley') onChange('valley:0');
    else if (m === 'name') onChange('name:');
  };
  return (
    <div className="st-col">
      <select className="input sm" value={mode} onChange={(e) => set(e.target.value)}>
        {!mode && <option value="">— выбери —</option>}
        {allowSpeaker && <option value="speaker">Хозяин диалога</option>}
        {allowPlayer && <option value="player">Игрок</option>}
        {allowAny && <option value="any">Любой житель</option>}
        <option value="actor">Персонаж проекта…</option>
        <option value="valley">Житель долины по номеру…</option>
        <option value="name">Сущность по имени…</option>
      </select>
      {mode === 'actor' && <ActorSelect refs={refs} value={v.slice(6)} onChange={(id) => onChange('actor:' + (id || ''))} />}
      {mode === 'valley' && <div className="row lg-inline"><span className="small muted">номер</span><NumInput value={Number(v.slice(7)) || 0} int min={0} onChange={(n) => onChange('valley:' + Math.max(0, n || 0))} /></div>}
      {mode === 'name' && <input className="input sm" placeholder="Имя над головой, например Мирон" value={v.slice(5)} onChange={(e) => onChange('name:' + e.target.value)} />}
    </div>
  );
}

function Row({ label, children, hint, hp }) { // eslint-disable-line
  return <div className="lg-f" {...(hp && hint ? hp(hint) : {})}><span>{label}</span>{children}</div>;
}

// место в схеме: точка / у игрока (кто вызвал событие) / там, где случилось событие
export function SchemePos({ value, onChange, refs, nullable }) {
  const off = value && typeof value === 'object' && !Array.isArray(value) && value.of !== undefined;
  const base = off ? value.of : value;
  const mode = Array.isArray(base) ? 'point' : ['player', 'event', 'entity'].includes(base) ? base : typeof base === 'string' && base ? 'named' : nullable ? 'none' : 'point';
  const api = refs.api || { connected: false, toast: () => {}, tp: () => {} };
  const setBase = (b) => onChange(off ? { ...value, of: b } : b);
  return (
    <div className="st-col">
      <select className="input sm" value={mode} onChange={(e) => { const m = e.target.value; setBase(m === 'point' ? (Array.isArray(base) ? base : [0, 64, 0]) : m === 'none' ? null : m === 'named' ? 'actor:' + (((refs.actors || [])[0] || {}).id || '') : m); }} title="Где: точка мира, у игрока события, где событие случилось, у существа события, у персонажа или созданного раньше (по имени «как»)">
        {nullable && <option value="none">— не задано —</option>}
        <option value="player">у игрока</option>
        <option value="event">где случилось событие</option>
        <option value="entity">у существа события</option>
        <option value="named">у персонажа / созданного…</option>
        <option value="point">точка x y z…</option>
      </select>
      {mode === 'point' && <PosField value={base} onChange={setBase} api={api} f={{ source: 'sel' }} />}
      {mode === 'named' && <input className="input sm mono" value={base} placeholder="actor:miron или имя из «как»" onChange={(e) => setBase(e.target.value.replace(/[^a-zA-Z0-9_:-]/g, ''))} />}
      {mode !== 'none' && (
        <label className="check small" title="Сдвинуть от этого места на dx dy dz блоков">
          <input type="checkbox" checked={off} onChange={(e) => onChange(e.target.checked ? { of: base, offset: [0, 0, 3] } : base)} /><span>со сдвигом</span>
        </label>
      )}
      {off && <div className="row lg-inline">{[0, 1, 2].map((i) => <NumInput key={i} value={(value.offset || [0, 0, 0])[i]} step={1} title={'d' + 'xyz'[i]} onChange={(n) => { const o = (value.offset || [0, 0, 0]).slice(); o[i] = n || 0; onChange({ ...value, offset: o }); }} />)}</div>}
    </div>
  );
}
// зона: шар (центр + радиус) или коробка (два угла)
export function ZoneField({ value, onChange, refs }) {
  const z = value && typeof value === 'object' ? value : { pos: [0, 64, 0], radius: 16 };
  const box = Array.isArray(z.from) || Array.isArray(z.to);
  const api = refs.api || { connected: false, toast: () => {}, tp: () => {} };
  return (
    <div className="st-col">
      <select className="input sm" value={box ? 'box' : 'ball'} onChange={(e) => onChange(e.target.value === 'box' ? { from: (z.pos || [0, 64, 0]).map((v) => v - 8), to: (z.pos || [0, 64, 0]).map((v) => v + 8) } : { pos: z.from || [0, 64, 0], radius: 16 })} title="Шар — центр и радиус; коробка — два противоположных угла">
        <option value="ball">шар: центр и радиус</option><option value="box">коробка: от угла до угла</option>
      </select>
      {box ? (<>
        <span className="small muted">от</span><PosField value={z.from} onChange={(p) => onChange({ ...z, from: p })} api={api} f={{ source: 'sel', exact: true }} />
        <span className="small muted">до</span><PosField value={z.to} onChange={(p) => onChange({ ...z, to: p })} api={api} f={{ source: 'sel', exact: true }} />
      </>) : (<>
        <PosField value={z.pos} onChange={(p) => onChange({ ...z, pos: p })} api={api} f={{ source: 'sel' }} />
        <div className="row lg-inline"><span className="small muted">радиус</span><NumInput value={z.radius} step={1} min={0.5} max={512} onChange={(n) => onChange({ ...z, radius: n == null ? 16 : n })} /><span className="small muted">блоков</span></div>
      </>)}
    </div>
  );
}
// цель: персонаж проекта, моб по типу или имя созданного раньше
function TargetPick({ value, onChange, refs, allowTmp }) {
  const v = value || '';
  const mode = v.startsWith('actor:') ? 'actor' : v.startsWith('entity:') ? 'entity' : 'tmp';
  return (
    <div className="st-col">
      <select className="input sm" value={allowTmp || mode !== 'tmp' ? mode : 'actor'} onChange={(e) => { const m = e.target.value; onChange(m === 'actor' ? 'actor:' + (((refs.actors || [])[0] || {}).id || '') : m === 'entity' ? 'entity:minecraft:zombie' : 'mob1'); }}>
        <option value="actor">персонаж проекта</option>
        <option value="entity">моб по типу</option>
        {allowTmp && <option value="tmp">созданный раньше (по имени)</option>}
      </select>
      {mode === 'actor' && <ActorSelect refs={refs} value={v.slice(6)} onChange={(id) => onChange('actor:' + (id || ''))} />}
      {mode === 'entity' && <input className="input sm mono" list="sl-entities" value={v.slice(7)} placeholder="minecraft:zombie" onChange={(e) => onChange('entity:' + e.target.value.trim())} />}
      {mode === 'tmp' && allowTmp && <input className="input sm mono" value={v} placeholder="имя, как в «Создать … как»" onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} />}
    </div>
  );
}

function CondFields({ c, set, refs, hp, depth, scheme }) {
  const k = ckOf(c, scheme);
  switch (k) {
    case 'var': {
      const vd = varOf(refs, c.var);
      return (<>
        <Row label="переменная" hp={hp} hint={COND_HINT.var}><VarPicker value={c.var} refs={refs} valueForType={c.value} onChange={(n) => set({ ...c, var: n })} /></Row>
        <div className="lg-two">
          <select className="input sm" value={c.op || '=='} onChange={(e) => set({ ...c, op: e.target.value })} title="Как сравнивать">
            {OPS.filter((o) => !vd || vd.type === 'int' || o === '==' || o === '!=').map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
          </select>
          <ValueInput type={vd ? vd.type : null} value={c.value} onChange={(val) => set({ ...c, value: val })} />
        </div>
      </>);
    }
    case 'quest': return (<>
      <Row label="задание"><RefSelect list={refs.quests} value={c.quest} onChange={(id) => set({ quest: id || '', state: c.state || 'active' })} /></Row>
      <div className="lg-two">
        <select className="input sm" value={c.state || 'active'} onChange={(e) => { const n = { ...c, state: e.target.value }; if (e.target.value !== 'active') delete n.step; set(n); }} title="В каком состоянии">
          {QSTATE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {(c.state || 'active') === 'active' ? <StepSelect refs={refs} quest={c.quest} value={c.step} onChange={(s) => { const n = { ...c }; if (s) n.step = s; else delete n.step; set(n); }} /> : <span />}
      </div>
    </>);
    case 'item': return (
      <div className="lg-two wide-first">
        <input className="input sm mono" list="sl-items" value={c.item || ''} onChange={(e) => set({ ...c, item: e.target.value.trim() })} title="id предмета, например minecraft:bread" />
        <NumInput value={c.count || 1} int min={1} onChange={(n) => set({ ...c, count: n || 1 })} title="Сколько штук" />
      </div>
    );
    case 'trust': return (<>
      <Row label="житель"><ActorSelect refs={refs} value={c.trust} onChange={(id) => set({ ...c, trust: id || '' })} /></Row>
      <div className="lg-two">
        <select className="input sm" value={c.op || '>='} onChange={(e) => set({ ...c, op: e.target.value })}>{OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select>
        <NumInput value={c.value} step={1} onChange={(n) => set({ ...c, value: n == null ? 0 : n })} />
      </div>
    </>);
    case 'time': return (
      <select className="input sm" value={c.time} onChange={(e) => set({ time: e.target.value })}><option value="day">сейчас день</option><option value="night">сейчас ночь</option>{scheme && <option value="dawn">сейчас рассвет</option>}{scheme && <option value="dusk">сейчас закат</option>}</select>
    );
    case 'memory': return <input className="input sm mono" placeholder="факт латиницей, например saw_fire" value={c.memory || ''} onChange={(e) => set({ memory: e.target.value })} />;
    case 'chance': return (
      <div className="row lg-inline">
        <NumInput value={c.chance} step={0.05} min={0} max={1} onChange={(n) => set({ chance: n == null ? 0 : n })} />
        <span className="small muted">= {Math.round((c.chance || 0) * 100)}% случаев</span>
      </div>
    );
    case 'not': return <CondList value={c.not ? [c.not] : []} onChange={(l) => set({ not: l[0] || { time: 'night' } })} refs={refs} hp={hp} depth={depth + 1} max={1} scheme={scheme} />;
    case 'any': return <CondList value={c.any || []} onChange={(l) => set({ any: l })} refs={refs} hp={hp} depth={depth + 1} addLabel="+ ещё вариант" scheme={scheme} />;
    case 'all': return <CondList value={c.all || []} onChange={(l) => set({ all: l })} refs={refs} hp={hp} depth={depth + 1} joiner="и" addLabel="+ ещё условие" scheme={scheme} />;
    case 'zone': return (<>
      <ZoneField value={c.zone} onChange={(z) => set({ ...c, zone: z })} refs={refs} />
      <select className="input sm" value={c.who || 'player'} onChange={(e) => set({ ...c, who: e.target.value })} title="Кто должен быть в зоне"><option value="player">игрок, вызвавший событие</option><option value="any_player">любой игрок</option></select>
    </>);
    case 'players_online': {
      const m = /^(==|!=|>=|<=|>|<)?\s*(\d+)$/.exec(String(c.players_online || '>=1')) || [];
      const op = m[1] || '>=', nn = Number(m[2] || 1);
      return (
        <div className="lg-two">
          <select className="input sm" value={op} onChange={(e) => set({ players_online: e.target.value + nn })}>{OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select>
          <NumInput value={nn} int min={0} max={200} onChange={(n) => set({ players_online: op + Math.max(0, n || 0) })} />
        </div>
      );
    }
    case 'weather': return <select className="input sm" value={c.weather} onChange={(e) => set({ weather: e.target.value })}>{WEATHER_KINDS.map((w) => <option key={w} value={w}>{WEATHER_LABEL[w]}</option>)}</select>;
    case 'dim': return <input className="input sm mono" list="sl-dims" value={c.dim || ''} onChange={(e) => set({ dim: e.target.value.trim() })} placeholder="minecraft:overworld" />;
    case 'random': return (
      <div className="row lg-inline">
        <NumInput value={c.random} step={0.05} min={0} max={1} onChange={(n) => set({ random: n == null ? 0 : n })} />
        <span className="small muted">= {Math.round((c.random || 0) * 100)}% случаев</span>
      </div>
    );
    default: return <span className="small muted">Непонятное условие: {JSON.stringify(c)}</span>;
  }
}

// список условий (все должны выполняться)
export function CondList({ value, onChange, refs, hp, depth = 0, max, addLabel = '+ условие', emptyText, joiner, scheme }) {
  const list = Array.isArray(value) ? value : [];
  const setAt = (i, c) => onChange(list.map((x, j) => (j === i ? c : x)));
  const KINDS = scheme ? S_COND_KINDS : COND_KINDS;
  const LABEL = scheme ? S_COND_LABEL : COND_LABEL;
  return (
    <div className={'lg-list' + (depth ? ' nested' : '')}>
      {list.length === 0 && emptyText && <div className="muted small">{emptyText}</div>}
      {list.map((c, i) => {
        const k = ckOf(c, scheme);
        return (
          <div key={i} className="lg-item" {...hp(COND_HINT[k] || '')}>
            <div className="lg-head">
              {i > 0 && depth === 0 && <span className="lg-and">и</span>}
              {i > 0 && depth > 0 && max !== 1 && <span className="lg-and">{joiner || 'или'}</span>}
              <select className="input sm lg-kind" value={k || ''} onChange={(e) => setAt(i, condDefault(e.target.value, refs))}>
                {KINDS.filter((x) => depth < 2 || (x !== 'not' && x !== 'any' && x !== 'all')).map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}
              </select>
              {max !== 1 && <button className="btn sm ghost icon-btn" title="Убрать условие" onClick={() => onChange(list.filter((_, j) => j !== i))}><Icon name="close" size={9} /></button>}
            </div>
            <div className="lg-body"><CondFields c={c} set={(n) => setAt(i, n)} refs={refs} hp={hp} depth={depth} scheme={scheme} /></div>
          </div>
        );
      })}
      {(!max || list.length < max) && (
        <button className="btn sm ghost lg-add" onClick={() => onChange([...list, condDefault(list.length ? 'var' : ((refs.vars || []).length ? 'var' : 'time'), refs)])} {...hp('Добавить ещё одно условие. Все условия списка должны выполняться одновременно.')}>{addLabel}</button>
      )}
    </div>
  );
}

function ActionFields({ a, set, refs, hp, scheme }) {
  const k = akOf(a, scheme);
  switch (k) {
    case 'set': {
      const vd = varOf(refs, a.set);
      return (<>
        <Row label="переменная"><VarPicker value={a.set} refs={refs} valueForType={a.value} onChange={(n) => set({ ...a, set: n })} /></Row>
        <Row label="значение"><ValueInput type={vd ? vd.type : null} value={a.value} onChange={(v) => set({ ...a, value: v })} /></Row>
      </>);
    }
    case 'add': return (<>
      <Row label="переменная"><VarPicker value={a.add} refs={{ ...refs, vars: (refs.vars || []).filter((v) => v.type === 'int') }} wantType="int" onChange={(n) => set({ ...a, add: n })} /></Row>
      <Row label="прибавить"><NumInput value={a.value} step={1} onChange={(n) => set({ ...a, value: n == null ? 0 : n })} /></Row>
    </>);
    case 'give': case 'take': return (
      <div className="lg-two wide-first">
        <input className="input sm mono" list="sl-items" value={a[k] || ''} onChange={(e) => set({ ...a, [k]: e.target.value.trim() })} title="id предмета, например minecraft:bread" />
        <NumInput value={a.count || 1} int min={1} onChange={(n) => set({ ...a, count: n || 1 })} title="Сколько штук" />
      </div>
    );
    case 'trust': return (
      <div className="lg-two wide-first">
        <ActorSelect refs={refs} value={a.trust} onChange={(id) => set({ ...a, trust: id || '' })} />
        <NumInput value={a.add} step={1} onChange={(n) => set({ ...a, add: n == null ? 0 : n })} title="Сколько прибавить (минус — отнять)" />
      </div>
    );
    case 'memory': return <input className="input sm mono" placeholder="факт латиницей, например met_player" value={a.memory || ''} onChange={(e) => set({ memory: e.target.value })} />;
    case 'quest': return (<>
      <Row label="задание"><RefSelect list={refs.quests} value={a.quest} onChange={(id) => set({ quest: id || '', do: a.do || 'start' })} /></Row>
      <div className="lg-two">
        <select className="input sm" value={a.do || 'start'} onChange={(e) => set({ ...a, do: e.target.value })}>{QOPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {(a.do === 'start' || a.do === 'advance' || !a.do) ? <StepSelect refs={refs} quest={a.quest} value={a.step} none={a.do === 'advance' ? 'на следующий' : 'с первого'} onChange={(s) => { const n = { ...a }; if (s) n.step = s; else delete n.step; set(n); }} /> : <span />}
      </div>
    </>);
    case 'scene': return <RefSelect list={refs.scenes} value={a.scene} onChange={(id) => set({ scene: id || '' })} />;
    case 'dialog': return <RefSelect list={refs.dialogs} value={a.dialog} onChange={(id) => set({ dialog: id || '' })} />;
    case 'sound': return (<>
      <input className="input sm mono" list="sl-sounds" value={a.sound || ''} onChange={(e) => set({ ...a, sound: e.target.value.trim() })} />
      <div className="lg-two">
        <Row label="громк."><NumInput value={a.vol == null ? 1 : a.vol} step={0.1} min={0} max={10} onChange={(n) => set({ ...a, vol: n == null ? 1 : n })} /></Row>
        <Row label="высота"><NumInput value={a.pitch == null ? 1 : a.pitch} step={0.05} min={0.5} max={2} onChange={(n) => set({ ...a, pitch: n == null ? 1 : n })} /></Row>
      </div>
    </>);
    case 'xp': return <NumInput value={a.xp} int step={1} onChange={(n) => set({ xp: n || 0 })} />;
    case 'command': return <input className="input sm mono" value={a.command || ''} placeholder="/time set day" onChange={(e) => set({ command: e.target.value })} />;
    case 'spawn': return (<>
      <TargetPick value={a.spawn} refs={refs} onChange={(v) => set({ ...a, spawn: v })} />
      <Row label="где"><SchemePos value={a.pos} refs={refs} onChange={(p) => set({ ...a, pos: p })} /></Row>
      <Row label="как" hint="Имя, по которому этого актёра найдут другие действия (Сказать, Идти, Убрать). Латиница." hp={hp}><input className="input sm mono" value={a.as || ''} placeholder="mob1" onChange={(e) => set({ ...a, as: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') || undefined })} /></Row>
    </>);
    case 'despawn': return <TargetPick value={a.despawn} refs={refs} allowTmp onChange={(v) => set({ despawn: v })} />;
    case 'move': return (<>
      <TargetPick value={a.move} refs={refs} allowTmp onChange={(v) => set({ ...a, move: v })} />
      <Row label="куда"><SchemePos value={a.to} refs={refs} onChange={(p) => set({ ...a, to: p })} /></Row>
      <Row label="скорость"><NumInput value={a.speed == null ? 1 : a.speed} step={0.1} min={0.1} max={3} onChange={(n) => set({ ...a, speed: n == null ? 1 : n })} /></Row>
    </>);
    case 'say': return (<>
      <TargetPick value={a.say} refs={refs} allowTmp onChange={(v) => set({ ...a, say: v })} />
      <textarea className="input sm" rows={2} value={a.text || ''} placeholder="Что сказать. {player} — имя игрока" onChange={(e) => set({ ...a, text: e.target.value })} />
    </>);
    case 'block': return (<>
      <Row label="где"><SchemePos value={a.block} refs={refs} onChange={(p) => set({ ...a, block: p })} /></Row>
      <input className="input sm mono" list="sl-blocks" value={a.state || ''} placeholder="minecraft:air" onChange={(e) => set({ ...a, state: e.target.value.trim() })} title="Какой блок, можно с состоянием: minecraft:oak_door[open=true]" />
    </>);
    case 'structure': return (<>
      <RefSelect list={(refs.structures || []).map((x) => ({ id: x.id, title: (x.name || x.id) + (x.size ? ' · ' + x.size.join('×') : '') }))} value={a.structure} onChange={(id) => set({ ...a, structure: id || '' })} empty="— постройка из библиотеки —" />
      <Row label="где"><SchemePos value={a.pos} refs={refs} onChange={(p) => set({ ...a, pos: p })} /></Row>
      <div className="lg-two">
        <select className="input sm" value={a.rot || 0} onChange={(e) => set({ ...a, rot: Number(e.target.value) })} title="Поворот вокруг вертикали">{ROTS.map((r) => <option key={r} value={r}>поворот {r}°</option>)}</select>
        <select className="input sm" value={a.mirror === true ? 'x' : a.mirror || 'none'} onChange={(e) => set({ ...a, mirror: e.target.value === 'none' ? false : e.target.value })} title="Отражение (сначала отражение, потом поворот — как в игре)"><option value="none">без отражения</option><option value="x">отразить по X</option><option value="z">отразить по Z</option></select>
      </div>
      <select className="input sm" value={a.anchor || 'corner'} onChange={(e) => set({ ...a, anchor: e.target.value === 'corner' ? undefined : e.target.value })} title="Точка — наименьший угол постройки (уже повёрнутой) или центр её низа"><option value="corner">точка — угол постройки</option><option value="center">точка — центр низа</option></select>
    </>);
    case 'fx': return (<>
      <select className="input sm" value={a.fx} onChange={(e) => set({ fx: e.target.value, ...(FX_LIB[e.target.value] ? JSON.parse(JSON.stringify(FX_LIB[e.target.value].def)) : {}), ...(FX_LIB[e.target.value] && FX_LIB[e.target.value].def.pos !== undefined ? { pos: 'event' } : {}), ...(e.target.value === 'title' ? { text: 'Глава 1' } : e.target.value === 'particles' ? { name: 'minecraft:flame', pos: 'player', count: 20 } : e.target.value === 'shake' ? { power: 0.6, ticks: 30 } : {}) })}>{FX_KINDS.map((f) => <option key={f} value={f}>{FX_LABEL[f] || (FX_LIB[f] ? FX_LIB[f].label + ' (библиотека)' : f)}</option>)}</select>
      {FX_LIB[a.fx] && <>{FX_LIB[a.fx].fields.some((f) => f.k === 'pos') && <Row label="где"><SchemePos value={a.pos} refs={refs} onChange={(p) => set({ ...a, pos: p })} /></Row>}<FxFields a={a} set={set} refs={refs} hp={hp} api={refs.api} /></>}
      {a.fx === 'particles' && <><input className="input sm mono" list="sl-particles" value={a.name || ''} onChange={(e) => set({ ...a, name: e.target.value.trim() })} /><Row label="где"><SchemePos value={a.pos} refs={refs} onChange={(p) => set({ ...a, pos: p })} /></Row><Row label="сколько"><NumInput value={a.count || 20} int min={1} max={2000} onChange={(n) => set({ ...a, count: n || 1 })} /></Row></>}
      {a.fx === 'story_fx' && <input className="input sm mono" list="sl-storyFx" value={a.name || ''} placeholder="vortex" onChange={(e) => set({ ...a, name: e.target.value.trim() })} />}
      {a.fx === 'title' && <><input className="input sm" value={a.text || ''} placeholder="Заголовок" onChange={(e) => set({ ...a, text: e.target.value })} /><input className="input sm" value={a.sub || ''} placeholder="подзаголовок (необязательно)" onChange={(e) => set({ ...a, sub: e.target.value || undefined })} /></>}
      {a.fx === 'shake' && <Row label="сила"><NumInput value={a.power == null ? 0.6 : a.power} step={0.1} min={0} max={5} onChange={(n) => set({ ...a, power: n == null ? 0.6 : n })} /></Row>}
      {['fade_in', 'fade_out', 'shake'].includes(a.fx) && <Row label="тиков"><NumInput value={a.ticks || 20} int min={1} onChange={(n) => set({ ...a, ticks: n || 20 })} /></Row>}
    </>);
    case 'message': return (<>
      <textarea className="input sm" rows={2} value={a.message || ''} placeholder="Текст. {player} — имя игрока, {var:имя} — переменная" onChange={(e) => set({ ...a, message: e.target.value })} />
      <div className="lg-two">
        <select className="input sm" value={a.to || 'player'} onChange={(e) => set({ ...a, to: e.target.value })}><option value="player">игроку</option><option value="all">всем</option><option value="near">всем рядом</option></select>
        <select className="input sm" value={a.style || 'chat'} onChange={(e) => set({ ...a, style: e.target.value })}>{MSG_STYLES.map((m) => <option key={m} value={m}>{STYLE_LABEL[m]}</option>)}</select>
      </div>
    </>);
    case 'tp': return (<>
      <PosField value={Array.isArray(a.tp) ? a.tp : null} onChange={(p) => set({ ...a, tp: p || [0, 64, 0] })} api={refs.api || { connected: false, toast: () => {}, tp: () => {} }} f={{ source: 'sel' }} />
      <select className="input sm" value={a.dim || ''} onChange={(e) => set({ ...a, dim: e.target.value || undefined })} title="Измерение назначения (фаза 6): пусто — то же, где игрок"><option value="">то же измерение</option><option value="minecraft:overworld">обычный мир</option><option value="minecraft:the_nether">Незер</option><option value="minecraft:the_end">Край</option>{a.dim && !['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'].includes(a.dim) && <option value={a.dim}>{a.dim}</option>}</select>
    </>);
    case 'transition': { const tr = { ...TRANSITION_DEFAULT, ...(a.transition || {}) }; const to = tr.to || {}; const setTr = (patch) => set({ ...a, transition: { ...tr, ...patch } }); return (<>
      <Row label="видео" hint="Видео какой сцены играть, пока грузится место (если у игрока оно есть)." hp={hp}><select className="input sm" value={tr.video || ''} onChange={(e) => setTr({ video: e.target.value || undefined })}><option value="">— без видео —</option>{(refs.scenes || []).map((x) => <option key={x.id} value={x.id}>{x.title || x.id}</option>)}</select></Row>
      <Row label="сцена" hint="Если видео у игрока нет — сыграть эту сцену вживую, потом перенести (экран «загрузка»)." hp={hp}><select className="input sm" value={tr.scene || ''} onChange={(e) => setTr({ scene: e.target.value || undefined })}><option value="">— без сцены —</option>{(refs.scenes || []).map((x) => <option key={x.id} value={x.id}>{x.title || x.id}</option>)}</select></Row>
      <Row label="куда"><PosField value={Array.isArray(to.pos) ? to.pos : null} onChange={(p) => setTr({ to: { ...to, pos: p || [0, 64, 0] } })} api={refs.api || { connected: false, toast: () => {}, tp: () => {} }} f={{ source: 'sel' }} /></Row>
      <div className="lg-two">
        <select className="input sm" value={to.dim || 'minecraft:overworld'} onChange={(e) => setTr({ to: { ...to, dim: e.target.value } })} title="Измерение назначения"><option value="minecraft:overworld">обычный мир</option><option value="minecraft:the_nether">Незер</option><option value="minecraft:the_end">Край</option></select>
        <label className="check small" title="Переносить сразу, пока идёт видео (мир грузится за кадром)"><input type="checkbox" checked={tr.loadWhile !== false} onChange={(e) => setTr({ loadWhile: e.target.checked })} /> грузить во время</label>
      </div>
      <div className="lg-two">
        <Row label="ждать, с"><NumInput value={tr.maxWait == null ? 15 : tr.maxWait} min={1} max={120} onChange={(n) => setTr({ maxWait: n || 15 })} /></Row>
        <Row label="проявл., т"><NumInput value={tr.fadeIn == null ? 20 : tr.fadeIn} int min={0} max={200} onChange={(n) => setTr({ fadeIn: n == null ? 20 : n })} /></Row>
      </div>
    </>); }
    case 'effect': return (<>
      <input className="input sm mono" list="sl-effects" value={a.effect || ''} onChange={(e) => set({ ...a, effect: e.target.value.trim() })} placeholder="minecraft:speed" />
      <div className="lg-two">
        <Row label="секунд"><NumInput value={a.seconds || 10} min={1} max={3600} onChange={(n) => set({ ...a, seconds: n || 1 })} /></Row>
        <Row label="уровень"><NumInput value={a.level || 1} int min={1} max={10} onChange={(n) => set({ ...a, level: n || 1 })} /></Row>
      </div>
    </>);
    case 'weather': return <select className="input sm" value={a.weather} onChange={(e) => set({ weather: e.target.value })}>{WEATHER_KINDS.map((w) => <option key={w} value={w}>{WEATHER_LABEL[w]}</option>)}</select>;
    case 'time': return (
      <div className="lg-two">
        <NumInput value={a.time} int min={0} max={24000} onChange={(n) => set({ time: n == null ? 0 : n })} />
        <select className="input sm" value="" onChange={(e) => e.target.value && set({ time: Number(e.target.value) })}><option value="">быстро…</option><option value="0">рассвет</option><option value="6000">полдень</option><option value="12000">закат</option><option value="13000">ночь</option><option value="18000">полночь</option></select>
      </div>
    );
    case 'signal': return <input className="input sm mono" list="sl-signals" value={a.signal || ''} placeholder="raid_started" onChange={(e) => set({ signal: e.target.value.replace(/\s+/g, '_') })} />;
    case 'scheme': return (
      <div className="lg-two wide-first">
        <RefSelect list={refs.schemes} value={a.scheme} onChange={(id) => set({ ...a, scheme: id || '' })} />
        <select className="input sm" value={a.enable === false ? 'off' : 'on'} onChange={(e) => set({ ...a, enable: e.target.value === 'on' })}><option value="on">включить</option><option value="off">выключить</option></select>
      </div>
    );
    case 'gate': return (
      <div className="lg-two">
        <select className="input sm mono" value={a.gate || ''} onChange={(e) => set({ ...a, gate: e.target.value })}>{!a.gate && <option value="">— ворота —</option>}{(refs.gates || []).map((g) => <option key={g} value={g}>{g}</option>)}{a.gate && !(refs.gates || []).includes(a.gate) && <option value={a.gate}>{a.gate} (нет!)</option>}</select>
        <select className="input sm" value={a.set || 'open'} onChange={(e) => set({ ...a, set: e.target.value })}><option value="open">открыть</option><option value="close">закрыть</option><option value="toggle">переключить</option></select>
      </div>
    );
    case 'once': return (
      <select className="input sm mono" value={a.once || ''} onChange={(e) => set({ once: e.target.value, reset: true })}>{!a.once && <option value="">— узел «Один раз» —</option>}{(refs.onces || []).map((g) => <option key={g} value={g}>{g}</option>)}{a.once && !(refs.onces || []).includes(a.once) && <option value={a.once}>{a.once} (нет!)</option>}</select>
    );
    default: return <span className="small muted">Непонятное действие: {JSON.stringify(a)}</span>;
  }
}

// список действий по порядку
export function ActionList({ value, onChange, refs, hp, addLabel = '+ действие', emptyText, scheme }) {
  const list = Array.isArray(value) ? value : [];
  const KINDS = scheme ? S_ACTION_KINDS : ACTION_KINDS;
  const LABEL = scheme ? S_ACTION_LABEL : ACTION_LABEL;
  const setAt = (i, a) => onChange(list.map((x, j) => (j === i ? a : x)));
  const move = (i, d) => { const c = list.slice(); const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  return (
    <div className="lg-list">
      {list.length === 0 && emptyText && <div className="muted small">{emptyText}</div>}
      {list.map((a, i) => {
        const k = akOf(a, scheme);
        return (
          <div key={i} className="lg-item act" {...hp(ACTION_HINT[k] || '')}>
            <div className="lg-head">
              <span className="lg-num">{i + 1}</span>
              <select className="input sm lg-kind" value={k || ''} onChange={(e) => setAt(i, actionDefault(e.target.value, refs))}>
                {KINDS.map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}
              </select>
              <button className="btn sm ghost icon-btn" title="Выше" disabled={!i} onClick={() => move(i, -1)}><Icon name="up" size={9} /></button>
              <button className="btn sm ghost icon-btn" title="Убрать действие" onClick={() => onChange(list.filter((_, j) => j !== i))}><Icon name="close" size={9} /></button>
            </div>
            <div className="lg-body"><ActionFields a={a} set={(n) => setAt(i, n)} refs={refs} hp={hp} scheme={scheme} /></div>
          </div>
        );
      })}
      <button className="btn sm ghost lg-add" onClick={() => onChange([...list, actionDefault((refs.vars || []).length ? 'set' : 'give', refs)])} {...hp('Добавить действие. Выполняются по порядку сверху вниз.')}>{addLabel}</button>
    </div>
  );
}
