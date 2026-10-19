// Вкладка «Задания»: шаги-карточки (тяни за ⋮⋮, чтобы поменять порядок), цель шага с полями,
// «Взять из игры» для мест, награда; проверка и управление заданием в игре через живую связь.
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { PosField, NumInput } from './fields.jsx';
import { useDocEditor, DocList, IssuesMini, SAVE_TEXT, IssueRows } from './docs.jsx';
import { CondList, ActionList, SpeakerPicker, RefSelect } from './logic.jsx';
import { FieldRow, BoolRow } from './DialogTab.jsx';
import { actionText, condText, speakerName, docTitle } from './dialog.js';
import { validateQuest, defaultQuest, describeGoal, GOAL_TYPES, GOAL_LABEL, ERR } from './validate.js';
import { slug, uniqueId } from './model.js';

const lsGet = (k, d) => { try { const v = localStorage.getItem('studio.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('studio.' + k, JSON.stringify(v)); } catch (_) {} };

export const GOAL_DEFS = {
  item: { icon: 'emerald', hint: 'Принести предметы: шаг выполнится, когда у игрока в инвентаре будет нужное количество (при сдаче их можно забрать).', def: { item: 'minecraft:bread', count: 3, consume: true } },
  talk: { icon: 'user', hint: 'Поговорить с персонажем. Можно указать особый диалог — он откроется при разговоре, и шаг засчитается в конце.', def: { speaker: '', dialog: null } },
  reach: { icon: 'globe', hint: 'Дойти до места: шаг засчитается, когда игрок окажется ближе радиуса к точке. Точку проще всего «Взять из игры».', def: { pos: null, radius: 4 } },
  kill: { icon: 'sword', hint: 'Победить мобов определённого вида — сколько штук.', def: { entity: 'minecraft:zombie', count: 5 } },
  wait: { icon: 'moon', hint: 'Дождаться ночи, дня или просто подождать сколько-то времени.', def: { until: 'night', ticks: 0 } },
  var: { icon: 'check', hint: 'Шаг засчитается сам, когда выполнится условие (переменные, другое задание, доверие…). Удобно, когда переменную ставит сцена или диалог.', def: { cond: [] } },
  scene: { icon: 'film', hint: 'Посмотреть сцену: шаг засчитается, когда катсцена доиграет до конца (или её пропустят).', def: { scene: '' } },
  none: { icon: 'lock', hint: 'Без цели: шаг сам не засчитается — его продвинет действие «Задание → продвинуть» из диалога, сцены или другого задания. Для сюжетных шагов «жди, пока Мирон позовёт».', def: {} }
};

function prepareQuest(raw, id) {
  const d = defaultQuest(id);
  return { ...d, ...raw, id: raw.id || id, start: { ...d.start, ...(raw.start || {}) }, steps: Array.isArray(raw.steps) ? raw.steps : [], rewards: Array.isArray(raw.rewards) ? raw.rewards : [] };
}
function newStepId(steps) { let n = steps.length + 1; while (steps.some((s) => s && s.id === 's' + n)) n++; return 's' + n; }
function goalDefault(type, refs) {
  const g = { type, ...JSON.parse(JSON.stringify(GOAL_DEFS[type].def)) };
  if (type === 'talk') { const a = (refs.actors || [])[0]; g.speaker = a ? 'actor:' + a.id : 'name:'; }
  if (type === 'scene') g.scene = ((refs.scenes || [])[0] || {}).id || '';
  if (type === 'var') { const v = (refs.vars || [])[0]; g.cond = [v ? { var: v.name, op: '==', value: v.type === 'bool' ? true : v.init } : { time: 'night' }]; }
  return g;
}
const STEP_TITLES = { item: 'Принеси …', talk: 'Поговори с …', reach: 'Дойди до …', kill: 'Победи …', wait: 'Дождись ночи', var: 'Сделай …', scene: 'Посмотри, что случится', none: 'Жди…' };

export default function QuestTab({ shared, goto }) {
  const { tabs, linkCard, hintBox, buildBtn, toast, hp, link, project, lists, reloadList, patchList, baseRefs, addLog, api, questStates } = shared;
  const list = lists.quests;
  const ed = useDocEditor('quests', {
    toast, prepare: prepareQuest,
    onSaved: (q) => patchList('quests', { id: q.id, title: q.title, steps: (q.steps || []).map((s) => ({ id: s && s.id, title: s && s.title })) })
  });
  const { doc, edit } = ed;
  const [sel, setSel] = useState(null); // { step: i } | { head: true } | { rewards: true }
  const [check, setCheck] = useState(false);
  const [drag, setDrag] = useState(null); // { from, over }
  const [addOpen, setAddOpen] = useState(false);
  const cardsRef = useRef([]);
  const scrollRef = useRef(null);

  const open = useCallback(async (id) => { if (await ed.open(id)) { setSel(null); lsSet('lastQuest', id); } }, [ed.open]); // eslint-disable-line
  useEffect(() => {
    if (goto && goto.kind === 'quest') return;
    const last = lsGet('lastQuest', null);
    const pick = list.find((x) => x.id === last) || list[0];
    if (pick) open(pick.id);
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!goto || goto.kind !== 'quest') return;
    (async () => {
      if (!ed.docRef.current || ed.docRef.current.id !== goto.id) await open(goto.id);
      setSel(goto.sel || null);
    })();
  }, [goto]); // eslint-disable-line

  const refs = baseRefs;
  const lazy = useDeferredValue(doc);
  const issues = useMemo(() => (lazy ? validateQuest(lazy, { project, ids: list.map((x) => x.id), dialogs: lists.dialogs, scenes: lists.scenes.map((x) => x.id), quests: list }) : []), [lazy, project, list, lists.dialogs, lists.scenes]);
  const nErr = issues.filter((x) => x.sev === ERR).length;
  const stepIssues = (i) => issues.filter((x) => x.sel && x.sel.step === i);

  const setStep = (i, fn, key) => edit((q) => ({ ...q, steps: q.steps.map((s, j) => (j === i ? (typeof fn === 'function' ? fn(s) : { ...s, ...fn }) : s)) }), key ? { key: 'st:' + i + ':' + key } : {});
  const addStep = (type) => {
    const q = ed.docRef.current;
    const st = { id: newStepId(q.steps), title: STEP_TITLES[type], goal: goalDefault(type, refs), marker: null, onDone: [] };
    edit((x) => ({ ...x, steps: [...x.steps, st] }));
    setSel({ step: q.steps.length });
    setAddOpen(false);
    setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, 50);
  };
  const delStep = (i) => { edit((q) => ({ ...q, steps: q.steps.filter((_, j) => j !== i) })); setSel(null); };
  const dupStep = (i) => {
    const q = ed.docRef.current;
    const st = { ...JSON.parse(JSON.stringify(q.steps[i])), id: newStepId(q.steps) };
    edit((x) => { const s = x.steps.slice(); s.splice(i + 1, 0, st); return { ...x, steps: s }; });
    setSel({ step: i + 1 });
  };
  const moveStep = (from, to) => {
    if (from === to || to < 0) return;
    edit((q) => { const s = q.steps.slice(); const [x] = s.splice(from, 1); s.splice(to > from ? to - 1 : to, 0, x); return { ...q, steps: s }; });
    setSel({ step: to > from ? to - 1 : to });
  };

  // перетаскивание карточек за ⋮⋮
  const startDrag = (e, i) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ from: i, over: i });
    const overAt = (y) => {
      const els = cardsRef.current.filter(Boolean);
      for (let k = 0; k < els.length; k++) { const r = els[k].getBoundingClientRect(); if (y < r.top + r.height / 2) return k; }
      return els.length;
    };
    const mv = (ev) => {
      const el = scrollRef.current;
      if (el) { const r = el.getBoundingClientRect(); if (ev.clientY < r.top + 30) el.scrollTop -= 12; else if (ev.clientY > r.bottom - 30) el.scrollTop += 12; }
      setDrag({ from: i, over: overAt(ev.clientY) });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      moveStep(i, overAt(ev.clientY));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const k = (e) => {
      if (!ed.docRef.current || document.querySelector('.modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); if (inField) e.target.blur(); if (e.code === 'KeyY' || e.shiftKey) ed.redo(); else ed.undo(); } else if (ctrl && e.code === 'KeyS') { e.preventDefault(); ed.flush(); } else if (!inField && ctrl && e.code === 'KeyD' && sel && sel.step != null) { e.preventDefault(); dupStep(sel.step); } else if (!inField && e.key === 'Delete' && sel && sel.step != null) { e.preventDefault(); delStep(sel.step); } else if (!inField && e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const create = async (title) => {
    const id = uniqueId(slug(title, 'quest'), list.map((x) => x.id));
    try {
      await call('studio:docSave', { kind: 'quests', doc: defaultQuest(id, title) });
      await reloadList('quests');
      await open(id);
    } catch (e) { toast(e.message, 'error'); }
  };
  const inGame = async (op, step) => {
    if (!link.connected) { toast('Нет связи с игрой — запусти игру с режимом разработчика', 'warn', 6000); return; }
    if (nErr && (op === 'start' || op === 'advance')) { toast('В задании есть ошибки — сначала «Проверить»', 'warn', 5000); setCheck(true); return; }
    try {
      await ed.flush();
      await call('studio:quest', { op, id: doc.id, step: step || undefined, quest: doc });
      const ru = { start: 'начать', advance: 'перейти на шаг ' + step, complete: 'завершить', fail: 'провалить', reset: 'сбросить', status: 'узнать статус' }[op];
      addLog('info', 'Задание «' + doc.id + '»: ' + ru + ' (отправлено в игру)');
    } catch (e) { toast(e.message, 'error'); }
  };

  const top = (
    <div className="st-top">
      {tabs}
      {doc ? (
        <>
          <input className="input sm st-title" value={doc.title || ''} placeholder="Название задания" onChange={(e) => edit((q) => ({ ...q, title: e.target.value }), { key: 'title' })} {...hp('Название задания — его видит игрок в журнале и над целью. Файл: ' + doc.id + '.json')} />
          <button className="btn sm ghost icon-btn" disabled={!ed.canUndo} onClick={ed.undo} {...hp('Отменить (Ctrl+Z).')}><Icon name="undo" size={13} /></button>
          <button className="btn sm ghost icon-btn" disabled={!ed.canRedo} onClick={ed.redo} {...hp('Вернуть (Ctrl+Y).')}><Icon name="redo" size={13} /></button>
          <span className={'st-save ' + ed.saveState} {...hp('Задание сохраняется само. Ctrl+S — сразу.')}>{SAVE_TEXT[ed.saveState]}</span>
          <div className="grow" />
          <button className={'btn sm' + (nErr ? ' danger' : '')} onClick={() => setCheck(true)} {...hp('Проверить задание: пустые цели, повторяющиеся id шагов, несуществующие диалоги/сцены/переменные, неверные id предметов.')}>
            <Icon name="check" size={12} /> Проверить{issues.length ? <span className={'st-badge' + (nErr ? ' e' : '')}>{nErr || issues.length}</span> : null}
          </button>
        </>
      ) : <div className="grow" />}
      {buildBtn}
    </div>
  );

  return (
    <>
      {top}
      <aside className="st-left">
        {linkCard}
        <DocList kind="quests" list={list} cur={doc && doc.id} open={open} create={create} reload={() => reloadList('quests')} flush={ed.flush} hp={hp} toast={toast}
          onRenamed={(id) => { reloadList('dialogs'); open(id); }} onDeleted={(id) => { if (doc && doc.id === id) ed.close(); }}
          sub={(x) => x.id + ' · шагов: ' + ((x.steps || []).length)}
          L={{ title: 'Задания', add: 'Задание', placeholder: 'Название, например «Хлеб для Мирона»', empty: 'Заданий пока нет — нажми «+ Задание».', hint: 'Все задания проекта: studio/quests/<id>.json. Щёлкни, чтобы открыть.', addHint: 'Создать задание с одним шагом «Принеси 3 хлеба» — дальше поменяешь.' }} />
      </aside>
      <section className="st-center">
        {doc ? (
          <div className="qe" ref={scrollRef} onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
            <div className={'qe-head' + (sel && sel.head ? ' on' : '') + (issues.some((x) => !x.sel || x.sel.head) ? ' bad' : '')} onClick={() => setSel({ head: true })} {...hp('Общие настройки задания: описание, кто даёт, как начинается. Щёлкни — откроются справа.')}>
              <div className="qe-title">{doc.title || 'Без названия'}</div>
              <div className="qe-desc">{doc.desc || <span className="muted">Описание для журнала не написано — щёлкни, чтобы добавить.</span>}</div>
              <div className="qe-chips">
                <span className="qe-chip">{doc.giver ? 'даёт: ' + speakerName(doc.giver, refs) : 'без квестодателя'}</span>
                <span className="qe-chip">{doc.start && doc.start.auto ? 'начнётся само' + ((doc.start.when || []).length ? ' при условии' : '') : 'начнётся из диалога/действия'}</span>
                {doc.repeatable && <span className="qe-chip">повторяемое</span>}
                {doc.journal === false && <span className="qe-chip">не в журнале</span>}
              </div>
            </div>
            <QuestLive st={questStates && questStates[doc.id]} doc={doc} link={link} hp={hp} inGame={inGame} />
            {doc.steps.map((s, i) => {
              const g = s.goal || {};
              const gd = GOAL_DEFS[g.type];
              const si = stepIssues(i);
              const bad = si.some((x) => x.sev === ERR) ? ' bad-e' : si.length ? ' bad-w' : '';
              return (
                <React.Fragment key={i}>
                  {drag && drag.over === i && drag.from !== i && drag.from !== i - 1 && <div className="qe-drop" />}
                  <div ref={(el) => { cardsRef.current[i] = el; }} className={'qe-step' + (sel && sel.step === i ? ' on' : '') + (drag && drag.from === i ? ' dragging' : '') + bad} onClick={() => setSel({ step: i })}
                    {...hp((GOAL_LABEL[g.type] || 'Шаг') + ': ' + (gd ? gd.hint : 'выбери вид цели') + ' Тяни за ⋮⋮ слева, чтобы поменять порядок.')}>
                    <div className="qe-grip" onPointerDown={(e) => startDrag(e, i)} title="Тяни, чтобы поменять порядок шагов">⋮⋮</div>
                    <div className="qe-n">{i + 1}</div>
                    <div className="qe-body">
                      <div className="qe-stitle">{s.title || <span className="muted">без текста цели</span>}</div>
                      <div className="qe-goal"><Icon name={gd ? gd.icon : 'info'} size={11} /> <b>{GOAL_LABEL[g.type] || '?'}</b> · {describeGoal(g)}</div>
                      <div className="qe-chips">
                        <span className="qe-chip mono">{s.id}</span>
                        {s.marker && <span className="qe-chip">метка</span>}
                        {s.dialog && <span className="qe-chip">диалог: {docTitle(refs.dialogs, s.dialog)}</span>}
                        {(s.onDone || []).length > 0 && <span className="qe-chip" title={(s.onDone || []).map((a) => actionText(a, refs)).join('\n')}>потом: {(s.onDone || []).length} действ.</span>}
                        {g.type === 'var' && (g.cond || []).length > 0 && <span className="qe-chip">{condText(g.cond[0], refs)}</span>}
                      </div>
                    </div>
                    <div className="qe-act" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm ghost icon-btn" disabled={!link.connected} title="В игре: перевести задание на этот шаг" onClick={() => inGame('advance', s.id)}><Icon name="rocket" size={10} /></button>
                      <button className="btn sm ghost icon-btn" title="Копия шага (Ctrl+D)" onClick={() => dupStep(i)}><Icon name="copy" size={10} /></button>
                      <button className="btn sm ghost icon-btn" title="Удалить шаг (Delete)" onClick={() => delStep(i)}><Icon name="trash" size={10} /></button>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {drag && drag.over === doc.steps.length && drag.from !== doc.steps.length - 1 && <div className="qe-drop" />}
            {addOpen ? (
              <div className="qe-add">
                <div className="small muted">Какая цель у нового шага?</div>
                <div className="qe-goals">
                  {GOAL_TYPES.map((t) => <button key={t} className="qe-gbtn" onClick={() => addStep(t)} {...hp(GOAL_LABEL[t] + ' — ' + GOAL_DEFS[t].hint)}><Icon name={GOAL_DEFS[t].icon} size={13} /> {GOAL_LABEL[t]}</button>)}
                </div>
                <button className="btn sm ghost" onClick={() => setAddOpen(false)}>Отмена</button>
              </div>
            ) : (
              <button className="btn sm qe-addbtn" onClick={() => setAddOpen(true)} {...hp('Добавить шаг в конец. Шаги идут по порядку: следующий открывается, когда сделан предыдущий.')}><Icon name="plus" size={11} /> Шаг</button>
            )}
            <div className={'qe-rew' + (sel && sel.rewards ? ' on' : '') + (issues.some((x) => x.sel && x.sel.rewards) ? ' bad' : '')} onClick={() => setSel({ rewards: true })} {...hp('Награда — что получит игрок, когда сделает все шаги. Щёлкни — правится справа.')}>
              <Icon name="star" size={13} /> <b>Награда</b>
              <span className="muted small">{(doc.rewards || []).length ? (doc.rewards || []).map((a) => actionText(a, refs)).join(' · ') : 'нет — щёлкни, чтобы добавить'}</span>
            </div>
          </div>
        ) : (
          <div className="st-empty card"><Icon name="star" size={30} /><b>Задание не выбрано</b><p className="muted small">Создай задание слева («+ Задание») или выбери из списка.</p></div>
        )}
      </section>
      <aside className="st-right">
        <div className="st-insp-wrap">
          {!doc ? <div className="muted small" style={{ padding: 14 }}>Здесь будут свойства шага.</div>
            : sel && sel.step != null && doc.steps[sel.step] ? <StepInspector i={sel.step} s={doc.steps[sel.step]} doc={doc} refs={refs} hp={hp} api={api} setStep={setStep} issues={stepIssues(sel.step)} onDelete={() => delStep(sel.step)} onDup={() => dupStep(sel.step)} />
              : sel && sel.rewards ? <RewardsInspector doc={doc} edit={edit} refs={refs} hp={hp} issues={issues.filter((x) => x.sel && x.sel.rewards)} />
                : <QuestInspector doc={doc} edit={edit} refs={refs} hp={hp} issues={issues.filter((x) => !x.sel || x.sel.head)} />}
        </div>
        {hintBox}
      </aside>
      {check && doc && (
        <Modal title="Проверка задания" onClose={() => setCheck(false)} footer={<button className="btn primary" onClick={() => setCheck(false)}>Понятно</button>}>
          <IssueRows issues={issues} onPick={(x) => { setCheck(false); setSel(x.sel || null); }} />
        </Modal>
      )}
    </>
  );
}

const QSTATE_RU = { not_started: 'не начато', active: 'идёт', done: 'сделано', failed: 'провалено' };
// маленькая панель «в игре»: состояние у автора + кнопки, которые шлют {t:'quest'} с текущим (даже несохранённым) заданием
function QuestLive({ st, doc, link, hp, inGame }) {
  const [step, setStep] = useState('');
  const on = link.connected;
  const n = doc.steps.length;
  return (
    <div className={'qe-live' + (on ? '' : ' off')} {...hp('Задание у тебя в игре. Кнопки отправляют в игру текущее задание прямо из редактора (даже несохранённое) — можно сразу проверить. Нужна связь с игрой.')}>
      <div className="qe-live-state">
        <span className="small muted">В игре:</span>
        {!on ? <span className="small muted">нет связи</span> : !st ? <span className="small muted">неизвестно — нажми «Статус»</span> : (
          <>
            <span className={'qe-st s-' + st.state}>{QSTATE_RU[st.state] || st.state}</span>
            {st.step && <span className="small">шаг <b>{st.step}</b>{st.stepIndex != null ? ' (' + (st.stepIndex + 1) + '/' + n + ')' : ''}</span>}
            {st.need ? <span className="small muted">{st.progress || 0}/{st.need}</span> : null}
            {st.times ? <span className="small muted">пройдено раз: {st.times}</span> : null}
            {st.text && <span className="small muted qe-st-text" title={st.text}>{st.text}</span>}
          </>
        )}
      </div>
      <div className="qe-live-btns">
        <button className="btn sm primary" disabled={!on} onClick={() => inGame('start')} title="Начать задание у себя в игре"><Icon name="play" size={10} /> Начать</button>
        <select className="input sm" disabled={!on} value={step} onChange={(e) => { setStep(''); if (e.target.value) inGame('advance', e.target.value); }} title="Перевести задание на выбранный шаг">
          <option value="">На шаг…</option>
          {doc.steps.map((s, i) => <option key={i} value={s.id}>{i + 1}. {s.title || s.id}</option>)}
        </select>
        <button className="btn sm" disabled={!on} onClick={() => inGame('complete')} title="Завершить задание (выдать награду)">Завершить</button>
        <button className="btn sm ghost" disabled={!on} onClick={() => inGame('fail')} title="Провалить задание">Провалить</button>
        <button className="btn sm ghost icon-btn" disabled={!on} onClick={() => inGame('reset')} title="Сбросить — как будто не брали"><Icon name="refresh" size={10} /></button>
        <button className="btn sm ghost" disabled={!on} onClick={() => inGame('status')} title="Спросить у игры состояние">Статус</button>
      </div>
    </div>
  );
}

function Head({ icon, title, sub, hp, hint, children }) {
  return (
    <div className="st-insp-head" {...hp(hint || '')}>
      <Icon name={icon} size={16} />
      <div className="grow"><b>{title}</b><div className="muted small">{sub}</div></div>
      {children}
    </div>
  );
}

function StepId({ value, onChange, toast }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const commit = () => { const n = v.trim(); if (!n || n === value) { setV(value || ''); return; } if (!/^[A-Za-z0-9_-]{1,40}$/.test(n)) { toast('id шага — латиница, цифры, _ и -', 'error'); setV(value || ''); return; } onChange(n); };
  return <input className="input sm mono" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

function StepInspector({ i, s, doc, refs, hp, api, setStep, issues, onDelete, onDup }) {
  const g = s.goal || {};
  const setG = (patch) => setStep(i, (x) => ({ ...x, goal: { ...(x.goal || {}), ...patch } }), 'g' + Object.keys(patch).join());
  const setF = (k, v) => setStep(i, (x) => { const c = { ...x }; if (v === null || v === undefined || v === '') delete c[k]; else c[k] = v; return c; }, k);
  return (
    <div className="st-insp">
      <Head icon={(GOAL_DEFS[g.type] || {}).icon || 'info'} title={'Шаг ' + (i + 1)} sub={(GOAL_LABEL[g.type] || 'цель не выбрана') + ' · id ' + s.id} hp={hp} hint={(GOAL_DEFS[g.type] || {}).hint}>
        <button className="btn sm ghost icon-btn" title="Копия шага (Ctrl+D)" onClick={onDup}><Icon name="copy" size={12} /></button>
        <button className="btn sm danger icon-btn" title="Удалить шаг (Delete)" onClick={onDelete}><Icon name="trash" size={12} /></button>
      </Head>
      <IssuesMini list={issues} />
      <div className="st-fields">
        <FieldRow label="Текст цели" hp={hp} hint="Что видит игрок на экране и в журнале, например «Принеси Мирону 3 хлеба». Коротко и понятно." wide>
          <input className="input sm" value={s.title || ''} onChange={(e) => setF('title', e.target.value)} />
        </FieldRow>
        <FieldRow label="id шага" hp={hp} hint="Короткое имя шага латиницей (s1, s2…). На него ссылаются условия и действия в диалогах («задание идёт, шаг s2») — меняй осторожно.">
          <StepId value={s.id} onChange={(v) => setF('id', v)} toast={api.toast} />
        </FieldRow>
        <div className="st-field wide" {...hp('Вид цели: что должен сделать игрок, чтобы шаг засчитался. При смене вида поля цели заменятся.')}>
          <div className="st-flabel">Цель <span className="st-q">?</span></div>
          <div className="qe-goals sm">
            {GOAL_TYPES.map((t) => (
              <button key={t} className={'qe-gbtn' + (g.type === t ? ' on' : '')} onClick={() => g.type !== t && setStep(i, (x) => ({ ...x, goal: goalDefault(t, refs) }))} {...hp(GOAL_LABEL[t] + ' — ' + GOAL_DEFS[t].hint)}>
                <Icon name={GOAL_DEFS[t].icon} size={11} /> {GOAL_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        {g.type === 'item' && (<>
          <FieldRow label="Предмет" hp={hp} hint="id предмета, например minecraft:bread. Список подсказок выпадает при вводе."><input className="input sm mono" list="sl-items" value={g.item || ''} onChange={(e) => setG({ item: e.target.value.trim() })} /></FieldRow>
          <FieldRow label="Сколько" hp={hp} hint="Сколько штук нужно."><NumInput value={g.count} int min={1} onChange={(n) => setG({ count: n || 1 })} /></FieldRow>
          <BoolRow label="Забрать при сдаче" hp={hp} hint="Да — предметы исчезнут из инвентаря, когда шаг засчитается (отдал Мирону). Нет — только проверить, что они есть." value={g.consume} onChange={(v) => setG({ consume: v })} />
        </>)}
        {g.type === 'talk' && (<>
          <FieldRow label="С кем" hp={hp} hint="С кем поговорить: персонаж проекта, житель долины по номеру или сущность по имени." wide><SpeakerPicker value={g.speaker} onChange={(v) => setG({ speaker: v })} refs={refs} allowAny={false} /></FieldRow>
          <FieldRow label="Диалог" hp={hp} hint="Какой диалог откроется при разговоре. Шаг засчитается, когда он закончится. Пусто — засчитается при любом разговоре с ним." wide>
            <RefSelect list={refs.dialogs} value={g.dialog} allowNone noneLabel="— любой разговор —" onChange={(v) => setG({ dialog: v || null })} />
          </FieldRow>
        </>)}
        {g.type === 'reach' && (<>
          <FieldRow label="Место" hp={hp} hint="Куда дойти: x y z. «Взять из игры» — блок, на который ты смотришь в игре. «Телепорт туда» — проверить место." wide>
            <PosField value={g.pos} onChange={(p) => setG({ pos: p })} api={api} f={{ source: 'sel' }} />
          </FieldRow>
          <FieldRow label="Радиус" hp={hp} hint="Насколько близко подойти, в блоках. Пусто — 4. 3–8 обычно хорошо."><NumInput value={g.radius} step={1} min={1} max={200} placeholder="4" onChange={(n) => setG({ radius: n == null ? undefined : n })} /></FieldRow>
          <FieldRow label="Измерение" hp={hp} hint="В каком мире точка: обычный, Незер, Край. Пусто — в любом (обычно обычный мир)."><input className="input sm mono" list="sl-dims" value={g.dim || ''} placeholder="любое" onChange={(e) => setG({ dim: e.target.value.trim() || undefined })} /></FieldRow>
        </>)}
        {g.type === 'kill' && (<>
          <FieldRow label="Кого" hp={hp} hint="id моба, например minecraft:zombie."><input className="input sm mono" list="sl-entities" value={g.entity || ''} onChange={(e) => setG({ entity: e.target.value.trim() })} /></FieldRow>
          <FieldRow label="Сколько" hp={hp} hint="Сколько победить."><NumInput value={g.count} int min={1} onChange={(n) => setG({ count: n || 1 })} /></FieldRow>
        </>)}
        {g.type === 'wait' && (<>
          <FieldRow label="Чего ждать" hp={hp} hint="Ночь — шаг засчитается, когда стемнеет; день — когда рассветёт; время — через сколько-то секунд.">
            <select className="input sm" value={g.until || 'night'} onChange={(e) => setG({ until: e.target.value })}><option value="night">ночи</option><option value="day">дня</option><option value="ticks">время</option></select>
          </FieldRow>
          {g.until === 'ticks' && <FieldRow label="Сколько" hp={hp} hint="Сколько ждать, в тиках (20 тиков = 1 секунда, 1200 = минута)."><div className="row st-ticks"><NumInput value={g.ticks} int min={1} step={20} onChange={(n) => setG({ ticks: n || 1 })} /><span className="muted small">{Math.round((g.ticks || 0) / 2) / 10} с</span></div></FieldRow>}
        </>)}
        {g.type === 'var' && (
          <FieldRow label="Когда" hp={hp} hint="Шаг засчитается, как только всё это выполнится." wide><CondList value={g.cond || []} onChange={(l) => setG({ cond: l })} refs={refs} hp={hp} /></FieldRow>
        )}
        {g.type === 'none' && <p className="muted small">Шаг ждёт, пока его продвинет действие «Задание → продвинуть» (в диалоге, награде другого задания или командой).</p>}
        {g.type === 'scene' && (
          <FieldRow label="Сцена" hp={hp} hint="Какую сцену посмотреть. Её можно запустить действием в диалоге или событием в мире." wide><RefSelect list={refs.scenes} value={g.scene} onChange={(v) => setG({ scene: v || '' })} /></FieldRow>
        )}
        <div className="qe-sep" />
        <BoolRow label="Метка в мире" hp={hp} hint="Показать игроку маячок/частицы в точке — куда идти на этом шаге." value={!!s.marker} onChange={(v) => setF('marker', v ? { pos: g.type === 'reach' && Array.isArray(g.pos) ? g.pos.slice() : null } : null)} />
        {s.marker && (
          <FieldRow label="Где метка" hp={hp} hint="Точка маячка. «Взять из игры» — блок, на который смотришь." wide>
            <div className="st-col">
              <PosField value={s.marker.pos} onChange={(p) => setF('marker', { ...s.marker, pos: p })} api={api} f={{ source: 'sel' }} />
              {g.type === 'reach' && Array.isArray(g.pos) && <button className="link-btn small" onClick={() => setF('marker', { ...s.marker, pos: g.pos.slice() })}>= место цели</button>}
            </div>
          </FieldRow>
        )}
        <FieldRow label="Диалог в конце" hp={hp} hint="Необязательно: диалог, который откроется, когда шаг сделан (например Мирон благодарит)." wide>
          <RefSelect list={refs.dialogs} value={s.dialog} allowNone noneLabel="— нет —" onChange={(v) => setF('dialog', v)} />
        </FieldRow>
        <FieldRow label="Когда сделан" hp={hp} hint="Что произойдёт сразу, как шаг засчитается: записать переменную, дать предмет, доверие, звук…" wide>
          <ActionList value={s.onDone || []} onChange={(l) => setF('onDone', l.length ? l : [])} refs={refs} hp={hp} emptyText="Ничего — просто следующий шаг." />
        </FieldRow>
      </div>
    </div>
  );
}

function QuestInspector({ doc, edit, refs, hp, issues }) {
  const set = (k, v) => edit((q) => ({ ...q, [k]: v }), { key: 'q:' + k });
  const st = doc.start || {};
  return (
    <div className="st-insp">
      <Head icon="star" title="Задание" sub={doc.id + '.json · шагов: ' + doc.steps.length} hp={hp} hint="Общие настройки задания. Щёлкни по шагу — справа появятся его свойства." />
      <p className="st-insp-hint">Это настройки всего задания. Шаги — карточки в центре: щёлкни, чтобы править; тяни за ⋮⋮, чтобы поменять порядок.</p>
      <IssuesMini list={issues} />
      <div className="st-fields">
        <FieldRow label="Название" hp={hp} hint="Видит игрок: в журнале и над целью."><input className="input sm" value={doc.title || ''} onChange={(e) => set('title', e.target.value)} /></FieldRow>
        <FieldRow label="Описание" hp={hp} hint="Пара строк для журнала заданий: о чём история." wide><textarea className="input sm" rows={3} value={doc.desc || ''} onChange={(e) => set('desc', e.target.value)} /></FieldRow>
        <BoolRow label="Есть квестодатель" hp={hp} hint="Кто даёт задание — над ним появится значок, и в журнале будет написано, к кому идти." value={!!doc.giver} onChange={(v) => set('giver', v ? 'actor:' + (((refs.actors || [])[0] || {}).id || '') : null)} />
        {doc.giver && <FieldRow label="Кто даёт" hp={hp} hint="Персонаж проекта, житель долины по номеру или сущность по имени." wide><SpeakerPicker value={doc.giver} onChange={(v) => set('giver', v)} refs={refs} allowAny={false} /></FieldRow>}
        <BoolRow label="Начинается само" hp={hp} hint="Да — задание начнётся у игрока само, когда выполнятся условия старта. Нет — его начнёт диалог или сцена действием «Задание → начать»." value={st.auto} onChange={(v) => set('start', { ...st, auto: v })} />
        {st.auto && (
          <FieldRow label="Условия старта" hp={hp} hint="Когда задание начнётся само: например переменная met_miron = да." wide>
            <CondList value={st.when || []} onChange={(l) => set('start', { ...st, when: l })} refs={refs} hp={hp} emptyText="Без условий — начнётся сразу у всех!" />
          </FieldRow>
        )}
        <BoolRow label="Можно повторять" hp={hp} hint="После завершения задание можно взять снова (например ежедневное)." value={doc.repeatable} onChange={(v) => set('repeatable', v)} />
        <BoolRow label="Показывать в журнале" hp={hp} hint="Задание видно в журнале заданий (клавиша J). Выключи для скрытых заданий-счётчиков." value={doc.journal !== false} onChange={(v) => set('journal', v)} />
      </div>
    </div>
  );
}

function RewardsInspector({ doc, edit, refs, hp, issues }) {
  return (
    <div className="st-insp">
      <Head icon="star" title="Награда" sub="когда сделаны все шаги" hp={hp} hint="Что получит игрок в конце задания." />
      <p className="st-insp-hint">Выполняется один раз, когда задание завершено: опыт, предметы, доверие, переменные, следующее задание…</p>
      <IssuesMini list={issues} />
      <ActionList value={doc.rewards || []} onChange={(l) => edit((q) => ({ ...q, rewards: l }))} refs={refs} hp={hp} addLabel="+ награда" emptyText="Без награды." />
    </div>
  );
}
