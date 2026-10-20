// Менеджер атрибутов (как в C4D): вкладки, числовые поля с перетаскиванием (тяни подпись влево-вправо),
// ромб ◇ рядом с каждым анимируемым свойством: щелчок — ключ в момент бегунка (◆ — ключ есть, ◇ жёлтый — анимировано).
// Ctrl+щелчок по подписи — вернуть значение по умолчанию.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './core.jsx';
import I, { TypeIcon, KeyDiamond } from './icons.jsx';
import { TYPE_HINT } from './actions.js';
import {
  objById, propsAt, chanGet, defaultProps, OBJ_LABEL, CHANNEL_LABEL, isAnimated, keyAt, clonerOutput, clonerInputs,
  INTERP_LABEL, childrenOf, actorPosAt, CHANNELS, linkableChannels, splitRef, withLinks, ticksToHM, hmToTicks, WEATHER_RU, DAY, mapLink
} from '../scene3d.js';
import EntityAttrs from './EntityAttrs.jsx';
import { CLONER_MODES, CLONER_MODE_LABEL, EFFECTOR_KINDS, EFFECTOR_LABEL, MAX_SEND } from '../mograph.js';
import { patchObj, setChan, toggleKeys, keyState, setKeyField, stageSet, stageRemove } from './ops.js';
import { ACTOR_FIELDS, SCENE_FIELDS, VERB_DEFS, TRACKS } from '../schema.js';
import { Field, selToPos } from '../fields.jsx';
import { getItem, getPath, setPath, kindOfKey, fmtTicks, renameActor } from '../model.js';
import { isActorId, ERR } from '../validate.js';

const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------- базовые кирпичики ----------
export function KeyBtn({ state, onClick, hint }) {
  if (!state) return <span className="c4-key blank" />;
  return (
    <button className={'c4-key ' + state} onClick={onClick} title={hint || (state === 'key' ? 'Ключ в этот момент. Щёлкни — убрать ключ' : state === 'anim' ? 'Свойство анимировано, но в этот момент ключа нет. Щёлкни — поставить ключ' : 'Щёлкни — поставить ключ в момент бегунка (свойство станет анимированным)')}>
      <KeyDiamond state={state} size={11} />
    </button>
  );
}

// числовое поле в стиле C4D: ввод, стрелки, перетаскивание по ▲▼ или по подписи
export function Num({ value, onChange, onScrubStart, onScrubEnd, step = 1, min, max, int, unit, ax, className, disabled }) {
  const [txt, setTxt] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(fmt(value)); }, [value]);
  const clamp = (n) => { if (min !== undefined) n = Math.max(min, n); if (max !== undefined) n = Math.min(max, n); return int ? Math.round(n) : r3(n); };
  const commit = (s) => { const n = Number(String(s).replace(',', '.')); if (s.trim() !== '' && isFinite(n)) onChange(clamp(n)); };
  const scrub = useScrub({ value, onChange: (n) => onChange(clamp(n)), step, onStart: onScrubStart, onEnd: onScrubEnd });
  return (
    <div className={'c4-num ' + (className || '')}>
      {ax && <span className="ax" style={{ color: ax === 'X' ? 'var(--c-x)' : ax === 'Y' ? 'var(--c-y)' : 'var(--c-z)' }} onMouseDown={scrub} title={'Тяни влево-вправо — менять ' + ax}>{ax}</span>}
      <input value={txt} disabled={disabled} onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={(e) => { focused.current = false; commit(e.target.value); setTxt(fmt(value)); }}
        onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value.replace(',', '.')); if (e.target.value.trim() !== '' && isFinite(n)) onChange(clamp(n)); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp((Number(value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))); }
          e.stopPropagation();
        }} />
      {unit && <span className="unit">{unit}</span>}
      <span className="spin" onMouseDown={scrub} title="Тяни вверх-вниз или влево-вправо — менять значение (Shift — быстрее, Ctrl — точнее)"><i>▲</i><i>▼</i></span>
    </div>
  );
}
function fmt(v) { return v == null || v === '' ? '' : typeof v === 'number' ? String(r3(v)).replace('.', ',') : String(v); }

// перетаскивание мышью: dx/dy → value; Shift ×10, Ctrl ×0.1
export function useScrub({ value, onChange, step, onStart, onEnd }) {
  return (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, v0 = Number(value) || 0;
    let moved = false;
    const mv = (ev) => {
      const d = (ev.clientX - x0) - (ev.clientY - y0);
      if (!moved && Math.abs(d) < 2) return;
      if (!moved) { moved = true; onStart && onStart(); document.body.style.cursor = 'ew-resize'; }
      const k = ev.shiftKey ? 10 : ev.ctrlKey ? 0.1 : 1;
      onChange(v0 + Math.round(d / 2) * step * k);
    };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; if (moved) onEnd && onEnd(); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };
}

// link — «объект.свойство»: подпись можно перетащить на другое свойство (или на объект в дереве) — получится «Связь»
export function ARow({ label, hint, keyBtn, children, onReset, scrub, link, learnKey }) {
  const core = useStudio();
  const { hp } = core;
  const [over, setOver] = useState(false);
  const dropOk = (e) => link && e.dataTransfer.types.includes('text/c4link');
  return (
    <div className={'c4-arow' + (over ? ' linkover' : '')} data-learn={learnKey || (link ? 'attr-' + link.slice(link.indexOf('.') + 1) : undefined)} {...hp(label + ' — ' + (hint || '') + (link ? ' Перетащи подпись на другое свойство или на объект в дереве — свяжешь их («Связи»).' : ''))}
      onDragOver={(e) => { if (dropOk(e)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); if (!dropOk(e)) return; e.preventDefault(); const from = e.dataTransfer.getData('text/c4link'); if (from && from !== link) core.addLink && core.addLink(from, link); }}>
      <span className={'c4-alabel' + (scrub ? ' scrub' : '') + (link ? ' linkable' : '')} title={hint} draggable={!!link}
        onDragStart={(e) => { if (!link) return; e.dataTransfer.setData('text/c4link', link); e.dataTransfer.effectAllowed = 'link'; }}
        onMouseDown={(e) => { if (e.ctrlKey && onReset) { e.preventDefault(); onReset(); return; } if (scrub && !e.altKey) scrub(e); }}>
        {label}<span className="dots"> . . </span>
      </span>
      {keyBtn || <span className="c4-key blank" />}
      <div className="c4-afield">{children}</div>
    </div>
  );
}
export function Sec({ title, children, open: open0 = true }) {
  const [open, setOpen] = useState(open0);
  return (
    <div className="c4-asec">
      <div className="c4-asec-h" onClick={() => setOpen(!open)}><span className="ar">{open ? '▾' : '▸'}</span>{title}</div>
      {open && children}
    </div>
  );
}
export function Check({ value, onChange }) { return <span className={'c4-check' + (value ? ' on' : '')} onClick={() => onChange(!value)}>{value ? '✓' : ''}</span>; }
export function Text({ value, onChange, placeholder, list, mono, area }) {
  const C = area ? 'textarea' : 'input';
  return <C className={'c4-text' + (mono ? ' mono' : '')} value={value == null ? '' : value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
}
export function Select({ value, onChange, options }) {
  return (
    <select className="c4-text" value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
      {options.map(([v, l]) => <option key={String(v)} value={v}>{l}</option>)}
    </select>
  );
}

// ---------- главная ----------
export default function AttributesPane({ act }) {
  const core = useStudio();
  const { scene, sel, hp } = core;
  const [tab, setTab] = useState('attr');
  const issuesFor = (fn) => core.issues.filter(fn);
  let body = null;
  if (core.selEnt) body = <EntityAttrs key={core.selEnt} id={core.selEnt} />;
  else if (scene) {
    const objs = sel.objs.map((id) => objById(scene, id)).filter(Boolean);
    const ev = sel.ev && getItem(scene, sel.ev);
    if (ev) body = <EventAttrs ev={ev} />;
    else if (sel.stage != null && (scene.stage || [])[sel.stage]) body = <StageAttrs i={sel.stage} />;
    else if (objs.length === 1) body = <ObjAttrs key={objs[0].id} o={objs[0]} act={act} issues={issuesFor((x) => x.sel && x.sel.obj === objs[0].id)} />;
    else if (objs.length > 1) body = <MultiAttrs objs={objs} />;
    else body = <SceneAttrs issues={issuesFor((x) => !x.sel)} />;
  }
  return (
    <div className="c4-pane" style={{ flex: 1, minHeight: 0 }}>
      <div className="c4-ptabs">
        <button className={tab === 'attr' ? 'on' : ''} onClick={() => setTab('attr')} {...hp('Свойства выбранного: объекта, события, блока «Монтажа» или всей сцены.')}>Атрибуты</button>
        <button className={tab === 'issues' ? 'on' : ''} onClick={() => setTab('issues')} {...hp('Проверка сцены: ошибки (сцена не соберётся) и предупреждения. Щёлкни — выберется нужное.')}>
          Проверка{core.issues.length + core.entIssues.length ? <small style={{ color: core.nErr + core.entErr ? '#ff8f86' : '#e8c070' }}>{core.nErr + core.entErr || core.issues.length + core.entIssues.length}</small> : null}
        </button>
      </div>
      {tab === 'attr' ? <div className="c4-attr">{body || <div className="c4-tree-empty">Выбери сущность мира в «Объектах» или открой сцену (двойной щелчок) — здесь будут свойства.</div>}</div> : <IssuesList onPick={() => setTab('attr')} />}
    </div>
  );
}

function IssuesList({ onPick }) {
  const core = useStudio();
  const { issues, setSel, scene, setTime } = core;
  if (!issues.length && !core.entIssues.length) return <div className="c4-tree-empty">Ошибок нет — можно играть (F5) и собирать.</div>;
  return (
    <div className="c4-attr" style={{ padding: 4 }}>
      {core.entIssues.length > 0 && <div className="c4-ahint" style={{ margin: '2px 4px 4px' }}><b>Мир (сущности и выходы)</b></div>}
      {core.entIssues.map((x, i) => (
        <div key={'e' + i} className="c4-issrow" onClick={() => { if (x.ent) core.setSelEnt(x.ent); onPick(); }}>
          <span className="sv" style={{ background: x.sev === ERR ? '#e0504a' : '#e0a030' }} />
          <span>{x.msg}</span>
        </div>
      ))}
      {core.entIssues.length > 0 && issues.length > 0 && <div className="c4-ahint" style={{ margin: '6px 4px 4px' }}><b>Сцена «{scene && (scene.title || scene.id)}»</b></div>}
      {issues.map((x, i) => (
        <div key={i} className="c4-issrow" onClick={() => {
          const s = x.sel || {};
          if (s.obj) setSel({ objs: [s.obj] });
          else if (s.track) { setSel({ ev: s }); const ev = getItem(scene, s); if (ev) setTime(ev.t || 0); } else if (s.stage != null) setSel({ stage: s.stage });
          else if (s.actor != null) { const a = scene.actors[s.actor]; const o = a && scene.objects.find((q) => q.type === 'actor' && q.actor === a.id); setSel(o ? { objs: [o.id] } : {}); } else setSel({});
          onPick();
        }}>
          <span className="sv" style={{ background: x.sev === ERR ? '#e0504a' : '#e0a030' }} />
          <span>{x.msg}</span>
        </div>
      ))}
    </div>
  );
}

export function Issues({ list }) {
  if (!list || !list.length) return null;
  return list.slice(0, 5).map((x, i) => <div key={i} className={'c4-iss ' + (x.sev === ERR ? 'e' : 'w')}>{x.msg}</div>);
}

// ---------- объект ----------
const TABS = {
  camera: [['basic', 'Основное'], ['coord', 'Координаты'], ['object', 'Объект'], ['stage', 'Монтаж'], ['anim', 'Анимация']],
  light: [['basic', 'Основное'], ['coord', 'Координаты'], ['object', 'Свет'], ['anim', 'Анимация']],
  sound: [['basic', 'Основное'], ['object', 'Звук'], ['anim', 'Анимация']],
  marker: [['basic', 'Основное'], ['coord', 'Координаты']],
  path: [['basic', 'Основное'], ['coord', 'Координаты'], ['object', 'Точки']],
  group: [['basic', 'Основное'], ['coord', 'Координаты'], ['anim', 'Анимация']],
  cloner: [['object', 'Клонер'], ['eff', 'Эффекторы'], ['bake', 'В мир'], ['basic', 'Основное'], ['coord', 'Координаты']],
  effector: [['object', 'Эффектор'], ['basic', 'Основное'], ['anim', 'Анимация']],
  block: [['object', 'Блок'], ['basic', 'Основное']],
  template: [['object', 'Шаблон'], ['basic', 'Основное']],
  structure: [['object', 'Постройка'], ['bake', 'В мир'], ['basic', 'Основное'], ['coord', 'Координаты'], ['anim', 'Анимация']],
  actor: [['object', 'Актёр'], ['basic', 'Основное'], ['events', 'Дорожка']],
  sky: [['object', 'Небо'], ['links', 'Связи'], ['basic', 'Основное'], ['anim', 'Анимация']]
};
// «Связи» есть у всего, что можно анимировать
for (const k of Object.keys(TABS)) if ((CHANNELS[k] || []).length && !TABS[k].some((t) => t[0] === 'links')) TABS[k].push(['links', 'Связи']);

function ObjAttrs({ o, act, issues }) {
  const core = useStudio();
  const tabs = TABS[o.type] || [['basic', 'Основное']];
  const [tab, setTab] = useState(() => (tabs.some((t) => t[0] === 'object') && ['cloner', 'effector', 'block', 'template', 'actor', 'structure', 'sky'].includes(o.type) ? 'object' : tabs[0][0]));
  useEffect(() => { if (!tabs.some((t) => t[0] === tab)) setTab(tabs[0][0]); }, [o.type]); // eslint-disable-line
  const cur = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  return (
    <>
      <div className="c4-ahead" {...core.hp(TYPE_HINT[o.type])}>
        <TypeIcon type={o.type} size={17} />
        <div className="grow"><b>{OBJ_LABEL[o.type]} [{o.name}]</b><div className="dim">id: <span className="mono">{o.id}</span>{o.parent ? ' · внутри «' + ((objById(core.scene, o.parent) || {}).name || o.parent) + '»' : ''}</div></div>
      </div>
      <div className="c4-atabs">
        {tabs.map(([id, l]) => <button key={id} data-learn={'atab-' + id} className={cur === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      <Issues list={issues} />
      {cur === 'basic' && <BasicTab o={o} />}
      {cur === 'coord' && <CoordTab o={o} />}
      {cur === 'anim' && <AnimTab o={o} />}
      {cur === 'stage' && <CamStageTab o={o} act={act} />}
      {cur === 'object' && o.type === 'camera' && <CameraTab o={o} />}
      {cur === 'object' && o.type === 'light' && <LightTab o={o} />}
      {cur === 'object' && o.type === 'sound' && <SoundTab o={o} />}
      {cur === 'object' && o.type === 'path' && <PathTab o={o} />}
      {cur === 'object' && o.type === 'cloner' && <ClonerTab o={o} />}
      {cur === 'eff' && <ClonerEffTab o={o} />}
      {cur === 'bake' && <ClonerBakeTab o={o} act={act} />}
      {cur === 'object' && o.type === 'structure' && <StructureTab o={o} />}
      {cur === 'object' && o.type === 'effector' && <EffectorTab o={o} />}
      {cur === 'object' && o.type === 'block' && <BlockTab o={o} />}
      {cur === 'object' && o.type === 'template' && <TemplateTab o={o} />}
      {cur === 'object' && o.type === 'actor' && <ActorTab o={o} />}
      {cur === 'events' && <ActorEventsTab o={o} />}
      {cur === 'object' && o.type === 'sky' && <SkyTab o={o} />}
      {cur === 'links' && <LinksTab o={o} />}
    </>
  );
}

// хелперы правки
function useObjEdit(o) {
  const core = useStudio();
  const { edit, time, autoKey, gesture } = core;
  const props = propsAt(o, time);
  return {
    props,
    setProp: (k, v) => edit((s) => patchObj(s, o.id, (x) => ({ ...x, props: { ...x.props, [k]: v } })), { key: 'p:' + o.id + ':' + k }),
    setField: (k, v) => edit((s) => patchObj(s, o.id, { [k]: v }), { key: 'f:' + o.id + ':' + k }),
    setCh: (ch, v, silent) => edit((s) => setChan(s, o.id, ch, time, v, autoKey), silent ? { silent: true } : { key: 'c:' + o.id + ':' + ch }),
    keyBtn: (chs) => <KeyBtn state={keyState(o, chs, time)} onClick={() => edit((s) => toggleKeys(s, o.id, chs, time))} />,
    gesture
  };
}
function ChanNum({ o, ch, label, hint, step = 1, min, max, unit, int }) {
  const e = useObjEdit(o);
  const v = chanGet(e.props, ch);
  const st = keyState(o, [ch], useStudio().time);
  const scrub = useScrub({ value: v, step, onChange: (n) => e.setCh(ch, clampN(n, min, max, int), true), onStart: e.gesture });
  return (
    <ARow label={label || CHANNEL_LABEL[ch]} hint={hint} keyBtn={e.keyBtn([ch])} scrub={scrub} link={o.id + '.' + ch} onReset={() => e.setCh(ch, chanGet(defaultProps(o.type), ch))}>
      <Num value={v} step={step} min={min} max={max} unit={unit} int={int} className={st === 'key' ? 'keyed' : st === 'anim' ? 'animated' : ''} onChange={(n) => e.setCh(ch, n)} onScrubStart={e.gesture} />
    </ARow>
  );
}
function clampN(n, min, max, int) { if (min !== undefined) n = Math.max(min, n); if (max !== undefined) n = Math.min(max, n); return int ? Math.round(n) : r3(n); }
function VecRow({ o, base, label, hint, step = 0.5, labels = ['X', 'Y', 'Z'], comps = ['x', 'y', 'z'] }) {
  const e = useObjEdit(o);
  const { time } = useStudio();
  const chs = comps.map((c) => base + '.' + c);
  return (
    <ARow label={label} hint={hint} learnKey={'attr-' + base} keyBtn={e.keyBtn(chs)} onReset={() => chs.forEach((ch) => e.setCh(ch, chanGet(defaultProps(o.type), ch) || 0))}>
      {chs.map((ch, i) => {
        const st = keyState(o, [ch], time);
        return <Num key={ch} ax={labels[i]} value={chanGet(e.props, ch)} step={step} className={st === 'key' ? 'keyed' : st === 'anim' ? 'animated' : ''} onChange={(n) => e.setCh(ch, n)} onScrubStart={e.gesture} />;
      })}
    </ARow>
  );
}

function BasicTab({ o }) {
  const e = useObjEdit(o);
  return (
    <Sec title="Основное">
      <ARow label="Имя" hint="Как объект называется в дереве и в игре (подпись у гизмо).">
        <Text value={o.name} onChange={(v) => e.setField('name', v)} />
      </ARow>
      <ARow label="Включён" hint="Выключенный объект не попадает в сцену и в сборку (как красный крестик в C4D).">
        <Check value={o.enabled !== false} onChange={(v) => e.setField('enabled', v)} />
      </ARow>
      <ARow label="Виден в игре" hint="Показывать ли гизмо объекта в игре, пока ты редактируешь. На сцену не влияет.">
        <Check value={o.visible !== false} onChange={(v) => e.setField('visible', v)} />
      </ARow>
      <ARow label="Заметка" hint="Любой комментарий для себя.">
        <Text area value={o.note || ''} onChange={(v) => e.setField('note', v || undefined)} />
      </ARow>
    </Sec>
  );
}

function CoordTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const fromGame = async () => {
    try {
      if (o.type === 'camera') {
        const v = await core.api.getView();
        const vals = { 'pos.x': v.pos[0], 'pos.y': v.pos[1], 'pos.z': v.pos[2], 'rot.h': v.yaw || 0, 'rot.p': v.pitch || 0 };
        core.edit((s) => Object.entries(vals).reduce((acc, [ch, val]) => setChan(acc, o.id, ch, core.time, r3(val), core.autoKey), s));
        if (v.fov) core.edit((s) => setChan(s, o.id, 'fov', core.time, Math.round(v.fov), core.autoKey));
      } else {
        const p = selToPos(await core.api.getSel());
        if (!p) throw new Error('В игре прицел ни на что не наведён');
        core.edit((s) => ['x', 'y', 'z'].reduce((acc, ax, i) => setChan(acc, o.id, 'pos.' + ax, core.time, p[i], core.autoKey), s));
      }
    } catch (er) { core.toast(er.message, 'error'); }
  };
  return (
    <Sec title="Координаты">
      <VecRow o={o} base="pos" label="Позиция" hint="Где объект в мире: X — восток(+)/запад(−), Y — высота, Z — юг(+)/север(−). Тяни буквы X/Y/Z или стрелки. Внутри группы — относительно группы." />
      {o.type === 'camera' && <VecRow o={o} base="rot" comps={['h', 'p', 'b']} labels={['H', 'P', 'B']} step={1} label="Поворот" hint="H — куда смотрит (yaw: 0 юг, 90 запад, 180 север, −90 восток), P — наклон (pitch, + вниз), B — крен (roll)." />}
      <div className="c4-btnrow">
        <button className="c4-btn sm" disabled={!core.link.connected} onClick={fromGame} {...core.hp(o.type === 'camera' ? 'Записать место и взгляд из игры (как F8). При включённой автозаписи — ключом.' : 'Поставить объект на блок, на который смотришь в игре.')}><I name="look" size={12} /> {o.type === 'camera' ? 'Взять вид из игры' : 'Взять из игры'}</button>
        <button className="c4-btn sm" disabled={!core.link.connected} onClick={() => core.gameCmd.frame()} {...core.hp('Камера Студии в игре подлетит к объекту (H).')}><I name="frame" size={12} /> Показать (H)</button>
      </div>
      {e.props.pos && <div className="c4-ahint">Тяни подпись или стрелки ▲▼ — значение меняется (Shift — быстрее, Ctrl — точнее). Ctrl+щелчок по подписи — сброс.</div>}
    </Sec>
  );
}

function CameraTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const look = e.props.look;
  const actors = core.scene.actors || [];
  const mode = look == null ? 'none' : Array.isArray(look) ? 'point' : 'actor';
  return (
    <>
      <Sec title="Объектив">
        <ChanNum o={o} ch="fov" step={1} min={5} max={170} unit="°" hint="Угол обзора: 70 — как в игре, 30–50 — «телевик», 90+ — широкий угол. Анимируй — получится наезд." />
        <ChanNum o={o} ch="shake" step={0.05} min={0} hint="Тряска «съёмки с рук»: 0 — нет, 0.2 — чуть-чуть, 1 — сильно." />
      </Sec>
      <Sec title="Цель">
        <ARow label="Смотреть на" hint="Если задано — камера сама поворачивается к цели (поворот H/P не нужен). Удобно для облёта героя.">
          <select className="c4-text" value={mode === 'actor' ? look : mode} onChange={(ev) => { const m = ev.target.value; e.setProp('look', m === 'none' ? null : m === 'point' ? (Array.isArray(look) ? look : (e.props.pos || [0, 64, 0]).map((v, i) => (i === 2 ? v + 5 : v))) : m); }}>
            <option value="none">— никуда (как повёрнута)</option>
            {actors.map((a) => <option key={a.id} value={'actor:' + a.id}>Актёр: {a.name || a.id}</option>)}
            <option value="point">Точка в мире…</option>
          </select>
        </ARow>
        {mode === 'point' && (
          <ARow label="Точка" hint="Куда смотреть: x y z.">
            {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={look[i]} step={0.5} onChange={(n) => { const c = look.slice(); c[i] = n; e.setProp('look', c); }} />)}
          </ARow>
        )}
      </Sec>
      <Sec title="Камера Студии в игре">
        <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
          <button className={'c4-btn sm' + (core.game.lookThrough === o.id ? ' prim' : '')} onClick={() => core.gameCmd.lookThrough(core.game.lookThrough === o.id ? null : o.id)} {...core.hp('Смотреть в игре через эту камеру: при прокрутке таймлайна вид едет вместе с ней.')}><I name="look" size={12} /> {core.game.lookThrough === o.id ? 'Смотрю через неё' : 'Смотреть через камеру'}</button>
        </div>
      </Sec>
    </>
  );
}

function CamStageTab({ o, act }) {
  const core = useStudio();
  const st = (core.scene.stage || []).map((b, i) => ({ ...b, i })).filter((b) => b.cam === o.id);
  return (
    <Sec title="Монтаж (Stage)">
      <div className="c4-ahint">«Монтаж» решает, какая камера снимает сцену в какой момент — как Stage в C4D. Блоки видно на дорожке «Монтаж» внизу; края блоков можно тянуть.</div>
      <div className="c4-btnrow"><button className="c4-btn sm prim" onClick={() => act.stageCut(o.id)} {...core.hp('С момента бегунка сцену снимает эта камера (предыдущий блок укоротится).')}><I name="stage" size={12} /> С текущего кадра ({core.time} т)</button></div>
      {st.map((b) => (
        <div key={b.i} className="c4-aitem" style={{ margin: '3px 8px' }} onClick={() => core.setSel({ stage: b.i })}>
          <I name="film" size={12} /> <span className="grow">{fmtTicks(b.t0)} — {fmtTicks(b.t1)}</span><span className="dim">{b.t0}–{b.t1} т</span>
        </div>
      ))}
      {!st.length && <div className="c4-ahint">Эта камера пока ничего не снимает.</div>}
    </Sec>
  );
}

function AnimTab({ o }) {
  const core = useStudio();
  const chs = Object.keys(o.anim || {}).filter((ch) => isAnimated(o, ch));
  return (
    <Sec title="Анимация">
      {!chs.length && <div className="c4-ahint">Ключей нет. Нажми ◇ рядом с любым свойством — поставится ключ в момент бегунка. Или включи запись (красная кнопка внизу) — тогда любая правка ставит ключ сама.</div>}
      {chs.map((ch) => {
        const keys = o.anim[ch];
        const i = keyAt(o, ch, core.time);
        return (
          <ARow key={ch} label={CHANNEL_LABEL[ch] || ch} hint={'Ключей: ' + keys.length + '. Интерполяция ключа в момент бегунка — как кривая идёт к следующему ключу.'} keyBtn={<KeyBtn state={i >= 0 ? 'key' : 'anim'} onClick={() => core.edit((s) => toggleKeys(s, o.id, [ch], core.time))} />}>
            <span className="dim" style={{ width: 54 }}>{keys.length} кл.</span>
            {i >= 0 ? (
              <Select value={keys[i].interp || 'bezier'} options={Object.entries(INTERP_LABEL)} onChange={(v) => core.edit((s) => setKeyField(s, o.id, ch, core.time, { interp: v }))} />
            ) : <span className="dim">ключа в {core.time} т нет</span>}
          </ARow>
        );
      })}
    </Sec>
  );
}

function LightTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const pts = e.props.positions || [];
  const setPts = (p) => e.setProp('positions', p);
  return (
    <>
      <Sec title="Свет">
        <ARow label="Включён" hint="Горит ли свет. Поставь ключи (◇) — свет зажжётся и погаснет в нужные моменты (всегда ступенькой)." keyBtn={e.keyBtn(['on'])}>
          <Check value={!!e.props.on} onChange={(v) => e.setCh('on', v)} />
        </ARow>
        <ChanNum o={o} ch="level" step={1} min={0} max={15} int hint="Яркость блока света: 0–15 (15 — как факел и ярче)." />
      </Sec>
      <Sec title="Ещё места">
        <div className="c4-ahint">Один светильник может светить в нескольких блоках сразу (например, все фонари улицы). Главное место — «Позиция» во вкладке «Координаты».</div>
        {pts.map((p, i) => (
          <ARow key={i} label={'Место ' + (i + 2)} hint="Ещё один блок света: x y z.">
            {[0, 1, 2].map((k) => <Num key={k} ax={'XYZ'[k]} value={p[k]} step={1} int onChange={(n) => { const c = pts.map((q) => q.slice()); c[i][k] = n; setPts(c); }} />)}
            <button className="c4-ib" style={{ width: 20, height: 19 }} title="Убрать место" onClick={() => setPts(pts.filter((_, j) => j !== i))}><I name="close" size={11} /></button>
          </ARow>
        ))}
        <div className="c4-btnrow">
          <button className="c4-btn sm" disabled={!core.link.connected} onClick={async () => { try { const p = selToPos(await core.api.getSel(), true); if (!p) throw new Error('В игре прицел ни на что не наведён'); setPts([...pts, [p[0], p[1] + 1, p[2]]]); } catch (er) { core.toast(er.message, 'error'); } }} {...core.hp('Добавить блок над тем, на который смотришь в игре.')}><I name="plus" size={12} /> Из игры</button>
          <button className="c4-btn sm" onClick={() => setPts([...pts, (e.props.pos || [0, 64, 0]).map((v, i) => Math.floor(v) + (i === 0 ? pts.length + 1 : 0))])}>+ вручную</button>
        </div>
      </Sec>
    </>
  );
}

function SoundTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const keys = (o.anim && o.anim.play) || [];
  return (
    <Sec title="Звук">
      <ARow label="Звук" hint="id звука, например minecraft:block.bell.use.">
        <Text mono list="sl-sounds" value={e.props.id} onChange={(v) => e.setProp('id', v)} />
      </ARow>
      <ARow label="Из точки" hint="Включено — звук слышно из позиции объекта. Выключено — «в ушах» у игрока.">
        <Check value={Array.isArray(e.props.pos)} onChange={(v) => e.setProp('pos', v ? [0, 64, 0] : null)} />
      </ARow>
      {Array.isArray(e.props.pos) && <VecRow o={o} base="pos" label="Позиция" hint="Откуда звук." />}
      <ChanNum o={o} ch="vol" step={0.05} min={0} max={10} hint="Громкость: 1 — обычно." />
      <ARow label="Высота" hint="0.5 — низко, 1 — как есть, 2 — высоко.">
        <Num value={e.props.pitch} step={0.05} min={0.5} max={2} onChange={(v) => e.setProp('pitch', v)} />
      </ARow>
      <ARow label="Играть" hint="Ключ «Играть» — звук прозвучит в этот момент. Нажми ◇ у бегунка." keyBtn={<KeyBtn state={keyAt(o, 'play', core.time) >= 0 ? 'key' : keys.length ? 'anim' : 'none'} onClick={() => core.edit((s) => (keyAt(o, 'play', core.time) >= 0 ? toggleKeys(s, o.id, ['play'], core.time) : patchObj(s, o.id, (x) => ({ ...x, anim: { ...(x.anim || {}), play: [...((x.anim || {}).play || []), { t: core.time, v: 1, interp: 'step' }].sort((a, b) => a.t - b.t) } }))))} />}>
        <span className="dim">{keys.filter((k) => k.v).map((k) => fmtTicks(k.t)).join(', ') || 'ни разу'}</span>
      </ARow>
    </Sec>
  );
}

function PathTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const pts = e.props.points || [];
  const set = (p) => e.setProp('points', p);
  return (
    <Sec title="Точки пути">
      <ARow label="Замкнут" hint="Последняя точка соединяется с первой (кольцо)."><Check value={!!e.props.closed} onChange={(v) => e.setProp('closed', v)} /></ARow>
      <ARow label="Плавный" hint="Сглаживать путь между точками (как сплайн Катмулла — Рома). Выключено — ломаная."><Check value={e.props.smooth !== false} onChange={(v) => e.setProp('smooth', v)} /></ARow>
      {pts.map((p, i) => (
        <ARow key={i} label={'Точка ' + (i + 1)} hint="Точка пути: x y z (относительно позиции пути).">
          {[0, 1, 2].map((k) => <Num key={k} ax={'XYZ'[k]} value={p[k]} step={0.5} onChange={(n) => { const c = pts.map((q) => q.slice()); c[i][k] = n; set(c); }} />)}
          <button className="c4-ib" style={{ width: 20, height: 19 }} title="Удалить точку" onClick={() => set(pts.filter((_, j) => j !== i))}><I name="close" size={11} /></button>
        </ARow>
      ))}
      <div className="c4-btnrow">
        <button className="c4-btn sm" disabled={!core.link.connected} onClick={async () => { try { const p = selToPos(await core.api.getSel()); if (!p) throw new Error('В игре прицел ни на что не наведён'); const off = e.props.pos || [0, 0, 0]; set([...pts, p.map((v, i) => r3(v - off[i]))]); } catch (er) { core.toast(er.message, 'error'); } }} {...core.hp('Добавить точку там, куда смотришь в игре (то же — F9 в игре или Ctrl+ЛКМ в Камере Студии).')}><I name="plus" size={12} /> Точка из игры</button>
        <button className="c4-btn sm" onClick={() => set([...pts, pts.length ? pts[pts.length - 1].map((v, i) => (i === 0 ? v + 4 : v)) : [0, 64, 0]])}>+ вручную</button>
      </div>
    </Sec>
  );
}

// ---------- клонер ----------
function ClonerTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const p = e.props;
  const paths = core.scene.objects.filter((x) => x.type === 'path');
  const count = useMemo(() => { try { return clonerOutput(core.scene, o, core.time).length; } catch (er) { return er.message; } }, [core.scene, o, core.time]);
  const vec = (k, label, hint, step = 1, int) => (
    <ARow label={label} hint={hint}>
      {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={(p[k] || [0, 0, 0])[i]} step={step} int={int} onChange={(n) => { const c = (p[k] || [0, 0, 0]).slice(); c[i] = n; e.setProp(k, c); }} />)}
    </ARow>
  );
  const num = (k, label, hint, opt = {}) => <ARow label={label} hint={hint}><Num value={p[k]} step={opt.step || 1} min={opt.min} max={opt.max} int={opt.int} unit={opt.unit} onChange={(v) => e.setProp(k, v)} /></ARow>;
  return (
    <>
      <Sec title="Клонер">
        <ARow label="Режим" hint="Как раскладывать копии: линией, сеткой, по кругу, вдоль объекта-пути или случайно в объёме.">
          <Select value={p.mode} options={CLONER_MODES.map((m) => [m, CLONER_MODE_LABEL[m]])} onChange={(v) => e.setProp('mode', v)} />
        </ARow>
        {p.mode === 'linear' && <>{num('count', 'Количество', 'Сколько копий в линии.', { min: 0, int: true })}{vec('step', 'Шаг', 'Сдвиг каждой следующей копии: x y z в блоках.', 1)}</>}
        {p.mode === 'grid' && <>{vec('counts', 'Количество', 'Сколько копий по X, Y, Z.', 1, true)}{vec('spacing', 'Расстояние', 'Шаг сетки по X, Y, Z в блоках.', 1)}</>}
        {p.mode === 'radial' && <>
          {num('count', 'Количество', 'Сколько копий по кругу.', { min: 0, int: true })}
          {num('radius', 'Радиус', 'Радиус круга в блоках.', { min: 0, step: 0.5 })}
          <ARow label="Плоскость" hint="В какой плоскости круг: XZ — лёжа на земле, XY и ZY — стоя."><Select value={p.plane || 'xz'} options={[['xz', 'XZ (на земле)'], ['xy', 'XY (стена)'], ['zy', 'ZY (стена)']]} onChange={(v) => e.setProp('plane', v)} /></ARow>
          {num('a0', 'Начало угла', 'С какого угла начинать (градусы).', { unit: '°' })}
          {num('a1', 'Конец угла', 'До какого угла (360 — полный круг; 180 — полукруг).', { unit: '°' })}
          <ARow label="Повернуть от центра" hint="Каждая копия повёрнута наружу (по 90° для блоков)."><Check value={p.align !== false} onChange={(v) => e.setProp('align', v)} /></ARow>
        </>}
        {p.mode === 'spline' && <>
          <ARow label="Путь" hint="Объект «Путь», вдоль которого раскладываются копии.">
            <Select value={p.path || ''} options={[['', '— выбери путь —'], ...paths.map((x) => [x.id, x.name])]} onChange={(v) => e.setProp('path', v || null)} />
          </ARow>
          {num('count', 'Количество', 'Сколько копий вдоль пути (если шаг 0).', { min: 0, int: true })}
          {num('stepLen', 'Шаг вдоль пути', 'Расстояние между копиями в блоках. 0 — равномерно «Количество» штук.', { min: 0, step: 0.5 })}
          <ARow label="По направлению" hint="Копии повёрнуты вдоль пути (по 90° для блоков)."><Check value={p.align !== false} onChange={(v) => e.setProp('align', v)} /></ARow>
        </>}
        {p.mode === 'random' && <>
          {num('count', 'Количество', 'Сколько копий.', { min: 0, int: true })}
          <ARow label="Объём" hint="Коробка — от позиции клонера на размер; шар — вокруг позиции клонера."><Select value={p.volume || 'box'} options={[['box', 'Коробка'], ['sphere', 'Шар']]} onChange={(v) => e.setProp('volume', v)} /></ARow>
          {vec('size', 'Размер', 'Размер объёма по X, Y, Z (для шара — диаметр).', 1)}
          {num('seed', 'Семя', 'Число, от которого зависит «случайность». Поменяй — получится другая раскладка.', { int: true })}
        </>}
        <ARow label="Перебор детей" hint="Если внутри несколько блоков: по очереди или случайно."><Select value={p.iterate || 'cycle'} options={[['cycle', 'По очереди'], ['random', 'Случайно']]} onChange={(v) => e.setProp('iterate', v)} /></ARow>
        <div className="c4-ahint">Копий: <b>{typeof count === 'number' ? count : '—'}</b>{typeof count === 'number' && count > MAX_SEND ? ' — в игру уйдут первые ' + MAX_SEND : ''}{typeof count === 'string' ? ' (' + count + ')' : ''}. Что клонировать — блоки/шаблоны/актёры внутри клонера в дереве.</div>
      </Sec>
      <Sec title="Что внутри">
        {childrenOf(core.scene, o.id).map((c) => (
          <div key={c.id} className="c4-aitem" style={{ margin: '2px 8px' }} onClick={() => core.setSel({ objs: [c.id] })}>
            <TypeIcon type={c.type} size={13} /><span className="grow">{c.name}</span><span className="dim mono" style={{ fontSize: 10.5 }}>{c.type === 'block' ? c.props.block : OBJ_LABEL[c.type]}</span>
          </div>
        ))}
      </Sec>
    </>
  );
}
function ClonerEffTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const { effectors } = clonerInputs(core.scene, o);
  const linked = o.props.effectors || [];
  const others = core.scene.objects.filter((x) => x.type === 'effector' && !effectors.some((f) => f.id === x.id));
  return (
    <Sec title="Эффекторы">
      <div className="c4-ahint">Эффекторы меняют копии по порядку сверху вниз. Те, что лежат внутри клонера, работают сами; чужие можно подключить списком.</div>
      {effectors.map((f) => (
        <div key={f.id} className="c4-aitem" style={{ margin: '2px 8px' }}>
          <TypeIcon type="effector" size={13} /><span className="grow" style={{ cursor: 'pointer' }} onClick={() => core.setSel({ objs: [f.id] })}>{f.name}</span>
          <span className="dim">{EFFECTOR_LABEL[f.props.kind]}</span>
          {linked.includes(f.id) && <button className="c4-ib" style={{ width: 20, height: 18 }} title="Отключить от клонера" onClick={() => e.setProp('effectors', linked.filter((x) => x !== f.id))}><I name="close" size={11} /></button>}
        </div>
      ))}
      {!effectors.length && <div className="c4-ahint">Эффекторов нет.</div>}
      <div className="c4-btnrow">
        {others.length > 0 && (
          <select className="c4-text" style={{ width: 160 }} value="" onChange={(ev) => ev.target.value && e.setProp('effectors', [...linked, ev.target.value])}>
            <option value="">+ подключить…</option>
            {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </div>
    </Sec>
  );
}
function ClonerBakeTab({ o, act }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const bakes = (core.scene.bakes || []).filter((b) => b.obj === o.id);
  const job = core.bakeJob;
  return (
    <>
      <Sec title="Показать в игре">
        <ARow label="Призрак в игре" hint={o.type === 'structure' ? 'Показывать постройку в игре призраком.' : 'Показывать копии в игре прозрачными блоками (до 20000). Обновляется после каждой правки.'}><Check value={!!o.props.preview} onChange={(v) => e.setProp('preview', v)} /></ARow>
      </Sec>
      <Sec title="Запечь в мир">
        <div className="c4-ahint">«Запечь» ставит блоки в мир по-настоящему (по тикам, чанки грузятся сами). Что стояло раньше, игра запоминает — «Отменить запекание» вернёт всё как было, даже после перезапуска.</div>
        <div className="c4-btnrow">
          <button className="c4-btn sm prim" disabled={!core.link.connected} onClick={() => act.bake(o.id)} {...core.hp(o.type === 'structure' ? 'Поставить постройку в мир (можно отменить).' : 'Поставить блоки клонера в мир (можно отменить).')}><I name="bake" size={12} /> Запечь в мир</button>
          <button className="c4-btn sm" disabled={!core.link.connected || !bakes.length} onClick={() => act.unbake(o.id)} {...core.hp('Вернуть блоки, как были до последнего запекания этого клонера.')}><I name="unbake" size={12} /> Отменить запекание</button>
        </div>
        {job && <div className="c4-ahint">{job.kind === 'bake' ? 'Запекаю' : 'Отменяю'}: {job.done} / {job.total}</div>}
        {bakes.length > 0 && <div className="c4-ahint">Запечено раз: {bakes.length}, последнее — {new Date(bakes[bakes.length - 1].at).toLocaleString('ru-RU')} ({bakes[bakes.length - 1].n} шт.)</div>}
      </Sec>
      <Sec title="В сцене">
        <ARow label="Появляется в сцене" hint="Клонер (или постройка) появится во время сцены в этот момент (событие «Клонер появляется»). Пусто — не появляется.">
          <Check value={typeof o.props.appearAt === 'number'} onChange={(v) => e.setProp('appearAt', v ? core.time : null)} />
          {typeof o.props.appearAt === 'number' && <Num value={o.props.appearAt} int min={0} unit="т" onChange={(v) => e.setProp('appearAt', v)} />}
        </ARow>
        {typeof o.props.appearAt === 'number' && <ARow label="Убрать в конце" hint="Когда сцена кончится (или её пропустят), всё вернётся как было."><Check value={o.props.removeAtEnd !== false} onChange={(v) => e.setProp('removeAtEnd', v)} /></ARow>}
      </Sec>
    </>
  );
}
function EffectorTab({ o }) {
  const e = useObjEdit(o);
  const p = e.props;
  const k = p.kind;
  const vec = (key, label, hint) => (
    <ARow label={label} hint={hint}>
      {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={(p[key] || [0, 0, 0])[i]} step={0.5} onChange={(n) => { const c = (p[key] || [0, 0, 0]).slice(); c[i] = n; e.setProp(key, c); }} />)}
    </ARow>
  );
  const num = (key, label, hint, opt = {}) => <ARow label={label} hint={hint}><Num value={p[key]} step={opt.step || 1} min={opt.min} max={opt.max} int={opt.int} unit={opt.unit} onChange={(v) => e.setProp(key, v)} /></ARow>;
  return (
    <Sec title="Эффектор">
      <ARow label="Вид" hint="Случайность — разброс; Шаг — плавно от первой копии к последней; Сдвиг — всем одинаково; Шум — холмы по высоте; Маска — убрать часть копий.">
        <Select value={k} options={EFFECTOR_KINDS.map((x) => [x, EFFECTOR_LABEL[x]])} onChange={(v) => e.setProp('kind', v)} />
      </ARow>
      <ChanNum o={o} ch="strength" step={0.05} hint="Сила эффектора: 0 — не действует, 1 — полностью. Можно анимировать (◇)." />
      {['random', 'step', 'plain'].includes(k) && <>
        {vec('pos', 'Сдвиг', k === 'random' ? 'Насколько копии разлетаются по X, Y, Z (±).' : k === 'step' ? 'Сдвиг последней копии (первая — 0, между — плавно).' : 'Сдвиг всех копий.')}
        {num('rot', 'Поворот', 'Поворот вокруг Y в градусах (блоки — шагами по 90°).', { unit: '°' })}
        {num('scale', 'Масштаб', 'Добавка к размеру: блок масштабом 2 — куб 2×2×2; масштаб 0 и меньше прячет копию.', { step: 0.1 })}
      </>}
      {k === 'noise' && <>
        {num('amp', 'Высота', 'Насколько блоков вверх-вниз гуляет рельеф.', { step: 0.5 })}
        {num('freq', 'Частота', 'Мелкость холмов: 0.05 — широкие, 0.3 — частые.', { step: 0.01, min: 0.001 })}
      </>}
      {k === 'mask' && <>
        {num('every', 'Каждую N-ю', 'Оставить каждую N-ю копию (1 — все).', { int: true, min: 1 })}
        {num('chance', 'Убрать с шансом', 'Доля копий, которые случайно убираются: 0.3 — треть.', { step: 0.05, min: 0, max: 1 })}
        <ARow label="Наоборот" hint="Оставить то, что маска убирала, и наоборот."><Check value={!!p.invert} onChange={(v) => e.setProp('invert', v)} /></ARow>
      </>}
      {['random', 'noise', 'mask'].includes(k) && num('seed', 'Семя', 'Число «случайности» — поменяй, будет другой разброс.', { int: true })}
    </Sec>
  );
}
function BlockTab({ o }) {
  const e = useObjEdit(o);
  return (
    <Sec title="Блок">
      <ARow label="Блок" hint="id блока, например minecraft:oak_log, minecraft:cobblestone_wall.">
        <Text mono list="c4-blocks" value={e.props.block} onChange={(v) => e.setProp('block', v.trim())} />
      </ARow>
      <ARow label="Состояние" hint="Необязательно: свойства блока через запятую, например axis=y или facing=north,half=top. Повороты клонера крутят facing/axis сами.">
        <Text mono value={e.props.state} placeholder="axis=y" onChange={(v) => e.setProp('state', v.trim())} />
      </ARow>
      <datalist id="c4-blocks">{BLOCKS.map((b) => <option key={b} value={b} />)}</datalist>
    </Sec>
  );
}
const BLOCKS = ['minecraft:stone', 'minecraft:cobblestone', 'minecraft:oak_log', 'minecraft:spruce_log', 'minecraft:oak_planks', 'minecraft:oak_fence', 'minecraft:cobblestone_wall', 'minecraft:lantern', 'minecraft:torch', 'minecraft:hay_block', 'minecraft:glass', 'minecraft:bricks', 'minecraft:stone_bricks', 'minecraft:oak_leaves', 'minecraft:grass_block', 'minecraft:dirt_path', 'minecraft:oak_stairs', 'minecraft:barrel', 'minecraft:campfire'];
function TemplateTab({ o }) {
  const e = useObjEdit(o);
  const core = useStudio();
  return (
    <Sec title="Шаблон постройки">
      <ARow label="Шаблон" hint="id шаблона структуры (structures/*.nbt), например minecraft:village/plains/houses/plains_small_house_1 или свой kokk:hut.">
        <Text mono value={e.props.template} onChange={(v) => e.setProp('template', v.trim())} />
      </ARow>
      <div className="c4-ahint">Свои постройки — вкладка «Строительство» → «Постройки». Здесь можно вписать id своей постройки или ванильной (minecraft:…).</div>
      {core.structures.length > 0 && <ARow label="Из библиотеки" hint="Выбрать свою постройку."><Select value="" options={[['', '— выбрать —'], ...core.structures.map((s) => [s.id, s.name || s.id])]} onChange={(v) => v && e.setProp('template', v)} /></ARow>}
    </Sec>
  );
}
function StructureTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const p = e.props;
  const st = core.structures.find((x) => x.id === p.structure);
  const rotOf = (r) => (r === 90 || r === 270 ? [st.size[2], st.size[1], st.size[0]] : st.size);
  return (
    <>
      <Sec title="Постройка">
        <ARow label="Постройка" hint="Какую постройку из библиотеки ставить (studio/structures). Новые — «Строительство» → «Постройки» или «Сохранить шаблон».">
          <Select value={p.structure || ''} options={[['', '— выбери —'], ...core.structures.map((s) => [s.id, (s.name || s.id) + (s.size ? ' · ' + s.size.join('×') : '')]), ...(p.structure && !st ? [[p.structure, p.structure + ' (нет в библиотеке!)']] : [])]} onChange={(v) => { e.setProp('structure', v); const s2 = core.structures.find((x) => x.id === v); if (s2 && (o.name === 'Постройка' || /^Постройка( \d+)?$/.test(o.name))) e.setField('name', s2.name || v); }} />
        </ARow>
        <ARow label="Поворот" hint="Поворот вокруг вертикали по 90° (как в игре: сначала отражение, потом поворот)."><Select value={p.rot || 0} options={[0, 90, 180, 270].map((r) => [r, r + '°'])} onChange={(v) => e.setProp('rot', Number(v))} /></ARow>
        <ARow label="Отражение" hint="Зеркально: по X (перед-зад) или по Z (лево-право)."><Select value={p.mirror === true ? 'x' : p.mirror || 'none'} options={[['none', 'нет'], ['x', 'по X'], ['z', 'по Z']]} onChange={(v) => e.setProp('mirror', v === 'none' ? false : v)} /></ARow>
        <ARow label="Позиция — это" hint="Угол — наименьшие x, y, z уже повёрнутой постройки. Центр низа — середина основания (удобно ставить по центру площади)."><Select value={p.anchor || 'corner'} options={[['corner', 'угол'], ['center', 'центр низа']]} onChange={(v) => e.setProp('anchor', v)} /></ARow>
        {st ? <div className="c4-ahint">Размер {rotOf(p.rot || 0).join(' × ')} · блоков {st.blocks != null ? st.blocks.toLocaleString('ru-RU') : '?'}{st.source === 'voxel' ? ' · из 3D-модели' : ''}.</div> : <div className="c4-ahint">Постройка не выбрана — в игре ничего не появится.</div>}
      </Sec>
      <Sec title="Показать в игре">
        <ARow label="Призрак в игре" hint="Показывать постройку в игре тёплым призраком, пока редактируешь. Следует за позицией."><Check value={!!p.preview} onChange={(v) => e.setProp('preview', v)} /></ARow>
      </Sec>
    </>
  );
}

// ---------- актёр ----------
function ActorTab({ o }) {
  const core = useStudio();
  const s = core.scene;
  const i = (s.actors || []).findIndex((a) => a.id === o.actor);
  const a = s.actors[i];
  if (!a) return <div className="c4-ahint">Актёра «{o.actor}» нет в сцене.</div>;
  const ctx = { hp: core.hp, api: core.api, actors: s.actors, projActors: core.project.actors || [], dialogs: core.dialogs };
  const onActor = (k, v) => {
    if (k === 'id') {
      if (!isActorId(v)) { core.toast('id актёра — латиница, цифры, _ и -', 'error'); return; }
      if (s.actors.some((x, j) => j !== i && x.id === v)) { core.toast('Актёр с таким id уже есть', 'error'); return; }
      core.edit((sc) => { const r = renameActor(sc, a.id, v); return { ...r, objects: r.objects.map((x) => (x.type === 'actor' && x.actor === a.id ? { ...x, actor: v } : x)) }; });
      return;
    }
    core.edit((sc) => ({ ...sc, actors: sc.actors.map((x, j) => (j === i ? setPath(x, k, v) : x)), objects: k === 'name' ? sc.objects.map((x) => (x.id === o.id ? { ...x, name: v } : x)) : sc.objects }), { key: 'a:' + i + ':' + k });
  };
  const at = actorPosAt(s, a.id, core.time);
  return (
    <Sec title="Актёр">
      <div className="st-fields">
        {ACTOR_FIELDS.filter((f) => !f.when || f.when(a)).map((f) => <Field key={f.k} f={f} value={getPath(a, f.k)} ctx={ctx} onChange={(v) => onActor(f.k, v)} />)}
      </div>
      {at && <div className="c4-ahint">В момент {fmtTicks(core.time)} актёр примерно в {at.pos.map((v) => Math.round(v * 10) / 10).join(' ')} (по «Идти» и «Переместить»).</div>}
    </Sec>
  );
}
function ActorEventsTab({ o }) {
  const core = useStudio();
  const tr = (core.scene.tracks || []).find((x) => x.kind === 'actor' && x.actor === o.actor);
  const evs = (tr && tr.events) || [];
  return (
    <Sec title="Дорожка событий">
      <div className="c4-ahint">Что делает актёр: идёт, говорит, машет… События — на его дорожке внизу таймлайна; правый клик по дорожке — добавить.</div>
      {evs.map((e, i) => (
        <div key={i} className="c4-aitem" style={{ margin: '2px 8px', cursor: 'pointer' }} onClick={() => { core.setSel({ objs: [o.id], ev: { track: 'actor:' + o.actor, i } }); core.setTime(e.t || 0); }}>
          <span className="dim mono" style={{ width: 52 }}>{fmtTicks(e.t || 0)}</span><span className="grow">{(VERB_DEFS.actor[e.do] || {}).label || e.do}</span>
        </div>
      ))}
    </Sec>
  );
}

// ---------- событие дорожки ----------
function EventAttrs({ ev }) {
  const core = useStudio();
  const { sel, scene } = core;
  const kind = kindOfKey(sel.ev.track);
  const verb = kind === 'subtitles' ? 'line' : ev.do;
  const vd = (VERB_DEFS[kind] || {})[verb];
  const ctx = { hp: core.hp, api: core.api, actors: scene.actors, projActors: core.project.actors || [], dialogs: core.dialogs };
  const list = core.issues.filter((x) => x.sel && x.sel.track === sel.ev.track && x.sel.i === sel.ev.i);
  const onEvent = (k, v) => {
    const cur = sel.ev;
    core.edit((s) => ({ ...s, tracks: s.tracks.map((tr) => (trKey(tr) === cur.track ? { ...tr, events: tr.events.map((e, i) => (i === cur.i ? setPath(e, k, v) : e)) } : tr)) }), { key: 'e:' + cur.track + ':' + cur.i + ':' + k });
  };
  const name = kind === 'actor' ? 'Актёр «' + (((scene.actors || []).find((a) => 'actor:' + a.id === sel.ev.track) || {}).name || sel.ev.track.slice(6)) + '»' : (TRACKS[kind] || {}).label;
  return (
    <>
      <div className="c4-ahead"><span style={{ width: 10, height: 10, borderRadius: 2, background: (TRACKS[kind] || {}).color }} /><div className="grow"><b>{vd ? vd.label : verb}</b><div className="dim">{name} · {fmtTicks(ev.t || 0)}</div></div>
        <button className="c4-ib" title="Удалить событие (Del)" onClick={() => { core.edit((s) => ({ ...s, tracks: s.tracks.map((tr) => (trKey(tr) === sel.ev.track ? { ...tr, events: tr.events.filter((_, i) => i !== sel.ev.i) } : tr)) })); core.setSel({ objs: sel.objs }); }}><I name="trash" size={14} /></button>
      </div>
      {vd && <div className="c4-ahint">{vd.hint}</div>}
      <Issues list={list} />
      <div className="st-fields">
        {(vd ? vd.fields : []).map((f) => <Field key={f.k} f={f} value={ev[f.k]} ctx={ctx} onChange={(v) => onEvent(f.k, v)} />)}
      </div>
    </>
  );
}
function trKey(tr) { return tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind; }

function StageAttrs({ i }) {
  const core = useStudio();
  const b = core.scene.stage[i];
  const cams = core.scene.objects.filter((o) => o.type === 'camera');
  return (
    <>
      <div className="c4-ahead"><I name="stage" size={16} color="#9fb0ff" /><div className="grow"><b>Монтаж: блок {i + 1}</b><div className="dim">какая камера снимает с {b.t0} по {b.t1} т</div></div>
        <button className="c4-ib" title="Удалить блок" onClick={() => { core.edit((s) => stageRemove(s, i)); core.setSel({}); }}><I name="trash" size={14} /></button>
      </div>
      <Sec title="Блок «Монтажа»">
        <ARow label="Камера" hint="Какая камера снимает в этом промежутке.">
          <Select value={b.cam} options={cams.map((c) => [c.id, c.name])} onChange={(v) => core.edit((s) => stageSet(s, i, { cam: v }))} />
        </ARow>
        <ARow label="С (тик)" hint="Начало блока, в тиках (20 = 1 с)."><Num value={b.t0} int min={0} unit="т" onChange={(v) => core.edit((s) => stageSet(s, i, { t0: v }), { key: 'st0' + i })} /></ARow>
        <ARow label="По (тик)" hint="Конец блока, в тиках."><Num value={b.t1} int min={1} unit="т" onChange={(v) => core.edit((s) => stageSet(s, i, { t1: v }), { key: 'st1' + i })} /></ARow>
      </Sec>
    </>
  );
}

function MultiAttrs({ objs }) {
  const core = useStudio();
  return (
    <>
      <div className="c4-ahead"><I name="layers" size={16} /><div className="grow"><b>Выбрано: {objs.length}</b><div className="dim">{[...new Set(objs.map((o) => OBJ_LABEL[o.type]))].join(', ')}</div></div></div>
      <Sec title="Всем выбранным">
        <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
          <button className="c4-btn sm" onClick={() => core.gameCmd.keyAll()} {...core.hp('Ключ на все свойства выбранных в момент бегунка (F9).')}><I name="key" size={12} /> Ключ всем (F9)</button>
          <button className="c4-btn sm" onClick={() => core.edit((s) => ({ ...s, objects: s.objects.map((o) => (objs.some((x) => x.id === o.id) ? { ...o, enabled: true } : o)) }))}>Включить</button>
          <button className="c4-btn sm" onClick={() => core.edit((s) => ({ ...s, objects: s.objects.map((o) => (objs.some((x) => x.id === o.id) ? { ...o, enabled: false } : o)) }))}>Выключить</button>
        </div>
      </Sec>
    </>
  );
}

function SceneAttrs({ issues }) {
  const core = useStudio();
  const s = core.scene;
  const [tab, setTab] = useState('scene');
  const ctx = { hp: core.hp, api: core.api, actors: s.actors, projActors: core.project.actors || [], dialogs: core.dialogs };
  return (
    <>
      <div className="c4-ahead"><TypeIcon type="scene" size={17} /><div className="grow"><b>Сцена [{s.title || s.id}]</b><div className="dim mono">{s.id}.json · {fmtTicks(s.length || 0)}</div></div></div>
      <div className="c4-atabs"><button className={tab === 'scene' ? 'on' : ''} onClick={() => setTab('scene')}>Сцена</button><button className={tab === 'links' ? 'on' : ''} onClick={() => setTab('links')} {...core.hp('Все «Связи» сцены: какое свойство ведёт какое.')}>Связи{(s.links || []).length ? <small>{s.links.length}</small> : null}</button></div>
      <Issues list={issues} />
      {tab === 'links' ? <LinksTab o={null} /> : <div className="st-fields">
        {SCENE_FIELDS.filter((f) => !f.when || f.when(s)).map((f) => (
          <Field key={f.k} f={f} value={getPath(s, f.k)} ctx={ctx} onChange={(v) => core.edit((sc) => setPath(sc, f.k, v), { key: 's:' + f.k })} />
        ))}
      </div>}
    </>
  );
}

// ---------- «Небо и солнце» (фаза 5) ----------
// время показывается как ЧЧ:ММ (0 тиков = 06:00); ключи времени идут только вперёд — 18:00 → 06:00 проходит через ночь
function TimeHM({ value, onChange, onScrubStart, className }) {
  const [txt, setTxt] = useState(ticksToHM(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(ticksToHM(value)); }, [value]);
  const scrub = useScrub({ value, step: 1000 / 60 * 5, onChange: (n) => onChange(Math.round(((n % DAY) + DAY) % DAY)), onStart: onScrubStart });
  return (
    <div className={'c4-num hm ' + (className || '')}>
      <input value={txt} onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={(e) => { focused.current = false; const t = hmToTicks(e.target.value); if (t != null) onChange(t); setTxt(ticksToHM(value)); }}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.round((((Number(value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1000 : 250)) % DAY + DAY) % DAY)); } e.stopPropagation(); }} />
      <span className="unit">{Math.round(value || 0)} т</span>
      <span className="spin" onMouseDown={scrub} title="Тяни — двигать время (по 5 минут; Shift — по часу)"><i>▲</i><i>▼</i></span>
    </div>
  );
}
function SkyTab({ o }) {
  const core = useStudio();
  const e = useObjEdit(o);
  const p = e.props;
  const st = (ch) => { const k = keyState(o, [ch], core.time); return k === 'key' ? 'keyed' : k === 'anim' ? 'animated' : ''; };
  const row = (ch, label, hint, field) => <ARow label={label} hint={hint} keyBtn={e.keyBtn([ch])} link={o.id + '.' + ch} onReset={() => e.setCh(ch, defaultProps('sky')[ch])}>{field}</ARow>;
  const presets = [['06:00', 0], ['12:00', 6000], ['18:00', 12000], ['20:00', 14000], ['00:00', 18000]];
  return (
    <>
      <Sec title="Время суток">
        {row('time', 'Время', 'Время суток в игре. Ставь ключи (◇) — солнце поедет. Между ключами время идёт только вперёд: 18:00 → 06:00 — через ночь. Прокрутка таймлайна показывает время в игре сразу.',
          <TimeHM value={p.time} className={st('time')} onChange={(v) => e.setCh('time', v)} onScrubStart={e.gesture} />)}
        <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
          {presets.map(([l, v]) => <button key={l} className="c4-btn sm" onClick={() => e.setCh('time', v)} {...core.hp('Поставить время ' + l + ' (' + v + ' тиков).')}>{l}</button>)}
        </div>
        <ChanNum o={o} ch="sunAngle" step={1} min={-90} max={90} unit="°" hint="Наклон солнца и луны на небе (только картинка у игрока, на время не влияет). 0 — как в игре." />
        {row('moonPhase', 'Фаза луны', 'Какая луна ночью: 0 — полная … 4 — новолуние. Меняется ступенькой.',
          <Select value={Math.round(p.moonPhase || 0)} options={['полная', 'убывающая (3/4)', 'последняя четверть', 'убывающий серп', 'новолуние', 'растущий серп', 'первая четверть', 'растущая (3/4)'].map((l, i) => [i, i + ' — ' + l])} onChange={(v) => e.setCh('moonPhase', Number(v))} />)}
      </Sec>
      <Sec title="Погода">
        {row('weather', 'Погода', 'Ясно, дождь или гроза. Ключи погоды — ступенькой (переключается в момент ключа).',
          <Select value={Math.round(p.weather || 0)} options={WEATHER_RU.map((l, i) => [i, l])} onChange={(v) => e.setCh('weather', Number(v))} />)}
        <ChanNum o={o} ch="rain" step={0.05} min={0} max={1} hint="Сила дождя на экране игрока: 0 — нет, 1 — ливень. Плавные ключи — дождь нарастает." />
      </Sec>
      <Sec title="Туман и цвет неба">
        <ARow label="Туман" hint="Свой туман сцены (у игрока). Выключено — как в игре."><Check value={!!p.fogOn} onChange={(v) => e.setProp('fogOn', v)} /></ARow>
        {p.fogOn && <>
          <ChanNum o={o} ch="fogStart" step={1} min={0} unit="бл" hint="С какого расстояния начинается туман (в блоках)." />
          <ChanNum o={o} ch="fogEnd" step={1} min={1} unit="бл" hint="Где туман становится сплошным." />
          {row('fogColor', 'Цвет тумана', 'Цвет тумана. Ключи цвета смешиваются плавно.', <ColorField value={p.fogColor} className={st('fogColor')} onChange={(v) => e.setCh('fogColor', v)} />)}
        </>}
        {row('skyColor', 'Оттенок неба', 'Цвет, которым подкрашивается небо (например закатный). Сила — ниже.', <ColorField value={p.skyColor} className={st('skyColor')} onChange={(v) => e.setCh('skyColor', v)} />)}
        <ChanNum o={o} ch="skyMix" step={0.05} min={0} max={1} hint="Насколько сильно подкрашивать небо: 0 — нет, 1 — полностью." />
      </Sec>
      <Sec title="После сцены">
        <ARow label="Вернуть в конце" hint="Когда сцена кончится (или её пропустят), время и погода вернутся как были до сцены."><Check value={p.restoreAtEnd !== false} onChange={(v) => e.setProp('restoreAtEnd', v)} /></ARow>
        <ARow label="Показывать в игре" hint="В редакторе: прокрутка таймлайна сразу двигает солнце и погоду в игре (живой показ)."><Check value={p.live !== false} onChange={(v) => e.setProp('live', v)} /></ARow>
        <div className="c4-ahint">Сейчас в {core.time} т: <b>{ticksToHM(p.time)}</b>, {WEATHER_RU[Math.round(p.weather || 0)]}{p.rain ? ', дождь ' + Math.round(p.rain * 100) + '%' : ''}.</div>
      </Sec>
    </>
  );
}
function ColorField({ value, onChange, className }) {
  return (
    <div className={'c4-color ' + (className || '')}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      <input className="c4-text mono" value={value || ''} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}

// ---------- «Связи»: свойство ведёт свойство (таблица соответствий) ----------
export function LinksTab({ o }) {
  const core = useStudio();
  const s = core.scene;
  const all = (s.links || []).map((l, i) => ({ l, i }));
  const mine = o ? all.filter(({ l }) => splitRef(l.from).obj === o.id || splitRef(l.to).obj === o.id) : all;
  const add = () => {
    const src = o ? (o.type === 'sky' ? o.id + '.time' : o.id + '.' + (linkableChannels(o)[0] || '')) : '';
    const sky = s.objects.find((x) => x.type === 'sky');
    const from = o && o.type !== 'sky' && sky ? sky.id + '.time' : src;
    const to = o && o.type !== 'sky' ? o.id + '.' + (linkableChannels(o)[0] || '') : '';
    core.addLink(from, to, true);
  };
  return (
    <Sec title={o ? 'Связи «' + o.name + '»' : 'Связи сцены'}>
      <div className="c4-ahint">Связь — одно свойство ведёт другое (как XPresso в C4D, но проще): <i>Небо.Время → Свет.Яркость</i> по таблице. Работает и при прокрутке таймлайна, и в игре. Быстро: перетащи подпись свойства (с точками) на другое свойство или на объект в дереве.</div>
      {mine.map(({ l, i }) => <LinkCard key={i} l={l} i={i} />)}
      {!mine.length && <div className="c4-ahint">Связей нет.</div>}
      <div className="c4-btnrow"><button className="c4-btn sm prim" onClick={add} {...core.hp('Новая связь: откуда → куда, таблица значений.')}><I name="links" size={12} /> Связь</button></div>
    </Sec>
  );
}
function refOptions(scene) {
  const out = [];
  for (const x of scene.objects || []) for (const ch of CHANNELS[x.type] || []) if (ch !== 'play') out.push([x.id + '.' + ch, x.name + ' · ' + (CHANNEL_LABEL[ch] || ch)]);
  return out;
}
function LinkCard({ l, i }) {
  const core = useStudio();
  const s = core.scene;
  const set = (patch, key) => core.edit((sc) => ({ ...sc, links: (sc.links || []).map((x, j) => (j === i ? { ...x, ...patch } : x)) }), key ? { key: 'lk' + i + key } : {});
  const del = () => core.edit((sc) => ({ ...sc, links: (sc.links || []).filter((_, j) => j !== i) }));
  const opts = refOptions(s);
  const toOpts = opts.filter(([v]) => { const r = splitRef(v); const ob = objById(s, r.obj); return ob && linkableChannels(ob).includes(r.ch); });
  const map = Array.isArray(l.map) ? l.map : [];
  const f = splitRef(l.from);
  const fo = objById(s, f.obj);
  const srcNow = fo ? chanGet(propsAt(withLinks(s).objects.find((x) => x.id === fo.id), core.time), f.ch) : undefined;
  const outNow = mapLink(l, srcNow, splitRef(l.to).ch);
  const fmtV = (ch, v) => (ch === 'time' && typeof v === 'number' ? ticksToHM(v) + ' (' + Math.round(v) + ')' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
  const iss = core.issues.filter((x) => x.sel && x.sel.link === i);
  return (
    <div className={'c4-link' + (l.on === false ? ' off' : '')}>
      <div className="c4-link-h">
        <Check value={l.on !== false} onChange={(v) => set({ on: v ? undefined : false })} />
        <select className="c4-text" value={l.from || ''} onChange={(e) => set({ from: e.target.value })} {...core.hp('Откуда: свойство-источник.')}><option value="">— откуда —</option>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <span className="arr">→</span>
        <select className="c4-text" value={l.to || ''} onChange={(e) => set({ to: e.target.value })} {...core.hp('Куда: какое свойство вести. Его ключи перестанут действовать.')}><option value="">— куда —</option>{toOpts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <button className="c4-ib" title="Удалить связь" onClick={del}><I name="trash" size={12} /></button>
      </div>
      <div className="c4-link-map">
        <span className="dim" {...core.hp('Таблица: значение источника → значение цели. Между строками — по прямой. Пусто — как есть.')}>Таблица</span>
        {map.map((r, k) => (
          <span key={k} className="c4-link-row">
            {f.ch === 'time' ? <TimeHM value={r[0]} onChange={(v) => set({ map: map.map((x, j) => (j === k ? [v, x[1]] : x)) }, 'm' + k + 'a')} /> : <Num value={r[0]} step={1} onChange={(v) => set({ map: map.map((x, j) => (j === k ? [v, x[1]] : x)) }, 'm' + k + 'a')} />}
            <span className="arr">→</span>
            <Num value={r[1]} step={1} onChange={(v) => set({ map: map.map((x, j) => (j === k ? [x[0], v] : x)) }, 'm' + k + 'b')} />
            <button className="c4-ib" title="Убрать строку" onClick={() => set({ map: map.filter((_, j) => j !== k) })}><I name="close" size={10} /></button>
          </span>
        ))}
        <button className="c4-btn sm" onClick={() => set({ map: [...map, map.length ? [map[map.length - 1][0] + (f.ch === 'time' ? 1000 : 1), map[map.length - 1][1]] : [typeof srcNow === 'number' ? Math.round(srcNow) : 0, typeof outNow === 'number' ? outNow : 0]] })} {...core.hp('Добавить строку таблицы (по умолчанию — текущее значение источника).')}>+ строка</button>
      </div>
      <div className="c4-link-opts">
        <label {...core.hp('Не выходить за края таблицы (иначе крайние отрезки продолжаются).')}><Check value={l.clamp !== false} onChange={(v) => set({ clamp: v })} /> в пределах</label>
        <label {...core.hp('Наоборот: результат отражается в диапазоне таблицы (без таблицы — 1 − x).')}><Check value={!!l.invert} onChange={(v) => set({ invert: v || undefined })} /> наоборот</label>
        <span {...core.hp('Умножить результат.')}>×</span><Num value={l.mul == null ? 1 : l.mul} step={0.1} onChange={(v) => set({ mul: v === 1 ? undefined : v }, 'mul')} />
        <span {...core.hp('Прибавить к результату.')}>+</span><Num value={l.add == null ? 0 : l.add} step={1} onChange={(v) => set({ add: v === 0 ? undefined : v }, 'add')} />
      </div>
      <div className="c4-ahint" style={{ margin: '2px 0 0' }}>Сейчас ({core.time} т): {srcNow === undefined ? '—' : fmtV(f.ch, srcNow)} → <b>{outNow === undefined ? '—' : fmtV(splitRef(l.to).ch, outNow)}</b></div>
      <Issues list={iss} />
    </div>
  );
}
