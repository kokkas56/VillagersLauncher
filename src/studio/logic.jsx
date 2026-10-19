// Редакторы условий и действий (общие для диалогов и заданий), выбор говорящего, выпадающие списки ссылок.
import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { NumInput } from './fields.jsx';
import { COND_KINDS, COND_LABEL, ACTION_KINDS, ACTION_LABEL, condKind, actionKind, OPS, varDefault, isVarName } from './validate.js';

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
  all: 'Все условия списка сразу. Нужно внутри «Любое из» или «НЕ», чтобы собрать группу: например «НЕ (ночь и нет фонаря)».'
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
  command: 'Выполнить команду сервера с правами оператора, например /time set day. Сильный инструмент — проверяй в игре.'
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

function Row({ label, children, hint, hp }) {
  return <div className="lg-f" {...(hp && hint ? hp(hint) : {})}><span>{label}</span>{children}</div>;
}

function CondFields({ c, set, refs, hp, depth }) {
  const k = condKind(c);
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
      <select className="input sm" value={c.time} onChange={(e) => set({ time: e.target.value })}><option value="day">сейчас день</option><option value="night">сейчас ночь</option></select>
    );
    case 'memory': return <input className="input sm mono" placeholder="факт латиницей, например saw_fire" value={c.memory || ''} onChange={(e) => set({ memory: e.target.value })} />;
    case 'chance': return (
      <div className="row lg-inline">
        <NumInput value={c.chance} step={0.05} min={0} max={1} onChange={(n) => set({ chance: n == null ? 0 : n })} />
        <span className="small muted">= {Math.round((c.chance || 0) * 100)}% случаев</span>
      </div>
    );
    case 'not': return <CondList value={c.not ? [c.not] : []} onChange={(l) => set({ not: l[0] || { time: 'night' } })} refs={refs} hp={hp} depth={depth + 1} max={1} />;
    case 'any': return <CondList value={c.any || []} onChange={(l) => set({ any: l })} refs={refs} hp={hp} depth={depth + 1} addLabel="+ ещё вариант" />;
    case 'all': return <CondList value={c.all || []} onChange={(l) => set({ all: l })} refs={refs} hp={hp} depth={depth + 1} joiner="и" addLabel="+ ещё условие" />;
    default: return <span className="small muted">Непонятное условие: {JSON.stringify(c)}</span>;
  }
}

// список условий (все должны выполняться)
export function CondList({ value, onChange, refs, hp, depth = 0, max, addLabel = '+ условие', emptyText, joiner }) {
  const list = Array.isArray(value) ? value : [];
  const setAt = (i, c) => onChange(list.map((x, j) => (j === i ? c : x)));
  return (
    <div className={'lg-list' + (depth ? ' nested' : '')}>
      {list.length === 0 && emptyText && <div className="muted small">{emptyText}</div>}
      {list.map((c, i) => {
        const k = condKind(c);
        return (
          <div key={i} className="lg-item" {...hp(COND_HINT[k] || '')}>
            <div className="lg-head">
              {i > 0 && depth === 0 && <span className="lg-and">и</span>}
              {i > 0 && depth > 0 && max !== 1 && <span className="lg-and">{joiner || 'или'}</span>}
              <select className="input sm lg-kind" value={k || ''} onChange={(e) => setAt(i, condDefault(e.target.value, refs))}>
                {COND_KINDS.filter((x) => depth < 2 || (x !== 'not' && x !== 'any' && x !== 'all')).map((x) => <option key={x} value={x}>{COND_LABEL[x]}</option>)}
              </select>
              {max !== 1 && <button className="btn sm ghost icon-btn" title="Убрать условие" onClick={() => onChange(list.filter((_, j) => j !== i))}><Icon name="close" size={9} /></button>}
            </div>
            <div className="lg-body"><CondFields c={c} set={(n) => setAt(i, n)} refs={refs} hp={hp} depth={depth} /></div>
          </div>
        );
      })}
      {(!max || list.length < max) && (
        <button className="btn sm ghost lg-add" onClick={() => onChange([...list, condDefault(list.length ? 'var' : ((refs.vars || []).length ? 'var' : 'time'), refs)])} {...hp('Добавить ещё одно условие. Все условия списка должны выполняться одновременно.')}>{addLabel}</button>
      )}
    </div>
  );
}

function ActionFields({ a, set, refs, hp }) {
  const k = actionKind(a);
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
    default: return <span className="small muted">Непонятное действие: {JSON.stringify(a)}</span>;
  }
}

// список действий по порядку
export function ActionList({ value, onChange, refs, hp, addLabel = '+ действие', emptyText }) {
  const list = Array.isArray(value) ? value : [];
  const setAt = (i, a) => onChange(list.map((x, j) => (j === i ? a : x)));
  const move = (i, d) => { const c = list.slice(); const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  return (
    <div className="lg-list">
      {list.length === 0 && emptyText && <div className="muted small">{emptyText}</div>}
      {list.map((a, i) => {
        const k = actionKind(a);
        return (
          <div key={i} className="lg-item act" {...hp(ACTION_HINT[k] || '')}>
            <div className="lg-head">
              <span className="lg-num">{i + 1}</span>
              <select className="input sm lg-kind" value={k || ''} onChange={(e) => setAt(i, actionDefault(e.target.value, refs))}>
                {ACTION_KINDS.map((x) => <option key={x} value={x}>{ACTION_LABEL[x]}</option>)}
              </select>
              <button className="btn sm ghost icon-btn" title="Выше" disabled={!i} onClick={() => move(i, -1)}><Icon name="up" size={9} /></button>
              <button className="btn sm ghost icon-btn" title="Убрать действие" onClick={() => onChange(list.filter((_, j) => j !== i))}><Icon name="close" size={9} /></button>
            </div>
            <div className="lg-body"><ActionFields a={a} set={(n) => setAt(i, n)} refs={refs} hp={hp} /></div>
          </div>
        );
      })}
      <button className="btn sm ghost lg-add" onClick={() => onChange([...list, actionDefault((refs.vars || []).length ? 'set' : 'give', refs)])} {...hp('Добавить действие. Выполняются по порядку сверху вниз.')}>{addLabel}</button>
    </div>
  );
}
