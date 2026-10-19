// Вкладка (и отдельное окно) «Схемы»: список схем слева, граф «событие → условие → действие» в центре,
// свойства узла справа. Живая трасса: игра шлёт {t:'trace', scheme, node, ok, ctx} — узлы подсвечиваются по шагам
// (как отладка блюпринтов UE). «Запустить событие» — {t:'schemeFire'}; «Прогнать без игры» — то же на выдуманном мире.
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { call, on } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import Graph from './Graph.jsx';
import { useDocEditor, DocList, IssuesMini, SAVE_TEXT, IssueRows } from './docs.jsx';
import { CondList, ActionList, SpeakerPicker, RefSelect, ZoneField, VarPicker, ValueInput } from './logic.jsx';
import { FieldRow, BoolRow } from './DialogTab.jsx';
import { NumInput } from './fields.jsx';
import { freshWorld } from './dialog.js';
import { slug, uniqueId } from './model.js';
import { ERR, OPS } from './validate.js';
import {
  validateScheme, defaultScheme, schemeSetOut, schemeGetOut, schemeOutputs, EVENT_KINDS, EVENT_LABEL, TIME_AT, ZONE_ON, QUEST_ON, ITEM_ON, BLOCK_ON, SCHEME_LIMITS
} from './scheme.js';
import { SCHEME_DEFS, SCHEME_KIT_BASE, EVENT_HINT, newSchemeNode, nextSchemeId, schemeLayout, dryRun, CAT_COLOR, schemePalette } from './schemeKit.js';

const lsGet = (k, d) => { try { const v = localStorage.getItem('studio.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('studio.' + k, JSON.stringify(v)); } catch (_) {} };
const TRACE_MS = 4500; // сколько держится подсветка узла после шага

function prepareScheme(raw, id) {
  const d = { ...defaultScheme(id), ...raw, id: raw.id || id };
  d.nodes = raw.nodes && typeof raw.nodes === 'object' ? { ...raw.nodes } : {};
  const missing = Object.values(d.nodes).some((n) => n && (typeof n.x !== 'number' || typeof n.y !== 'number'));
  return missing ? schemeLayout(d) : d;
}

export default function SchemeTab({ shared, goto }) {
  const { tabs, linkCard, hintBox, buildBtn, toast, hp, link, project, lists, reloadList, patchList, baseRefs, addLog } = shared;
  const list = lists.schemes || [];
  const ed = useDocEditor('schemes', {
    toast, prepare: prepareScheme,
    onSaved: (d) => patchList('schemes', { id: d.id, title: d.title, nodes: Object.keys(d.nodes || {}), enabled: d.enabled !== false, events: Object.values(d.nodes || {}).filter((n) => n && n.type === 'event').map((n) => n.event) })
  });
  const { doc, edit } = ed;
  const docRef = ed.docRef;
  const [sel, setSel] = useState(null);
  const [check, setCheck] = useState(false);
  const [focus, setFocus] = useState(null);
  const [trace, setTrace] = useState({}); // id → { ok, n, at, last }
  const [tlog, setTlog] = useState([]); // [{ at, node, ok, note, src }]
  const [follow, setFollow] = useState(() => lsGet('schemeTrace', true));
  const [, tick] = useState(0);
  const seq = useRef(0);
  const dryTimers = useRef([]);

  const open = useCallback(async (id) => { if (await ed.open(id)) { setSel(null); setTrace({}); setTlog([]); lsSet('lastScheme', id); } }, [ed.open]); // eslint-disable-line
  useEffect(() => {
    if (goto && goto.kind === 'scheme') return;
    const last = lsGet('lastScheme', null);
    const pick = list.find((x) => x.id === last) || list[0];
    if (pick) open(pick.id);
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!goto || goto.kind !== 'scheme') return;
    (async () => { if (!docRef.current || docRef.current.id !== goto.id) await open(goto.id); if (goto.sel && goto.sel.node) { setSel({ node: goto.sel.node }); setFocus({ id: goto.sel.node, n: Date.now() }); } })();
  }, [goto]); // eslint-disable-line

  // ---------- трасса ----------
  const pushTrace = useCallback((node, ok, note, src) => {
    const n = ++seq.current;
    const at = Date.now();
    setTrace((t) => {
      const c = {};
      for (const [k, v] of Object.entries(t)) if (at - v.at < TRACE_MS) c[k] = { ...v, last: false };
      c[node] = { ok, n, at, last: true };
      return c;
    });
    setTlog((l) => [...l.slice(-199), { at, node, ok, note, src }]);
  }, []);
  useEffect(() => on('studio-link', (d) => {
    const m = d && d.msg;
    if (!m || m.t !== 'trace' || !docRef.current || m.scheme !== docRef.current.id || !m.node) return;
    const ctx = m.ctx && typeof m.ctx === 'object' ? m.ctx : null;
    pushTrace(m.node, m.ok !== false, ctx ? [ctx.player && 'игрок ' + ctx.player, Array.isArray(ctx.pos) && 'в ' + ctx.pos.map((v) => Math.round(v)).join(' '), ctx.error].filter(Boolean).join(', ') : '', 'игра');
  }), [pushTrace, docRef]);
  // гасить подсветку со временем
  useEffect(() => { if (!Object.keys(trace).length) return undefined; const t = setInterval(() => { tick((x) => x + 1); setTrace((tr) => { const now = Date.now(); const c = {}; let ch = false; for (const [k, v] of Object.entries(tr)) { if (now - v.at < TRACE_MS) c[k] = v; else ch = true; } return ch ? c : tr; }); }, 500); return () => clearInterval(t); }, [trace]);
  // включить трассу в игре, пока открыта схема
  useEffect(() => {
    if (!link.connected || !doc) return undefined;
    call('studio:schemeTrace', { on: follow, id: doc.id }).catch(() => {});
    return () => { if (follow) call('studio:schemeTrace', { on: false, id: doc.id }).catch(() => {}); };
  }, [link.connected, doc && doc.id, follow]); // eslint-disable-line
  useEffect(() => () => dryTimers.current.forEach(clearTimeout), []);

  const refs = useMemo(() => {
    const nodes = (doc && doc.nodes) || {};
    const sigs = new Set();
    for (const s of list) { (s.raised || []).forEach((x) => sigs.add(x)); (s.listened || []).forEach((x) => sigs.add(x)); }
    for (const n of Object.values(nodes)) { if (n && n.type === 'event' && n.event === 'signal' && n.name) sigs.add(n.name); if (n && n.type === 'action') (n.do || []).forEach((a) => a && typeof a.signal === 'string' && sigs.add(a.signal)); }
    return { ...baseRefs, schemes: list, structures: lists.structures || [], gates: Object.keys(nodes).filter((k) => nodes[k].type === 'gate'), signals: [...sigs], api: shared.api };
  }, [baseRefs, list, lists.structures, doc, shared.api]);
  const lazy = useDeferredValue(doc);
  const issues = useMemo(() => {
    if (!lazy) return [];
    return validateScheme(lazy, { project, ids: list.map((x) => x.id), scenes: lists.scenes.map((x) => x.id), dialogs: lists.dialogs, quests: lists.quests, schemes: list.map((x) => x.id).concat(list.some((x) => x.id === lazy.id) ? [] : [lazy.id]), structures: (lists.structures || []).map((x) => x.id) });
  }, [lazy, project, list, lists.scenes, lists.dialogs, lists.quests, lists.structures]);
  const nErr = issues.filter((x) => x.sev === ERR).length;
  const issueNodes = useMemo(() => { const m = {}; for (const x of issues) if (x.sel && x.sel.node && m[x.sel.node] !== ERR) m[x.sel.node] = x.sev; return m; }, [issues]);

  // ---------- правки графа ----------
  const setNode = (id, fn, key) => edit((d) => ({ ...d, nodes: { ...d.nodes, [id]: typeof fn === 'function' ? fn(d.nodes[id]) : { ...d.nodes[id], ...fn } } }), key ? { key: 'n:' + id + ':' + key } : {});
  const addNode = (type, pos, from, preset) => {
    const d0 = docRef.current;
    const id = nextSchemeId(d0.nodes, type);
    const n = { ...newSchemeNode(type, preset, refs), x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10 };
    edit((d) => {
      const nodes = { ...d.nodes, [id]: n };
      if (from && nodes[from.from]) nodes[from.from] = schemeSetOut(nodes[from.from], from.key, id);
      return { ...d, nodes };
    });
    setSel({ node: id });
  };
  const linkTo = (from, key, target) => {
    const t = docRef.current.nodes[target];
    if (from === target) { toast('Стрелка в тот же узел — замкнутый круг. Для повтора есть «Повторить».', 'warn'); return; }
    if (t && t.type === 'event') { toast('В «Событие» входить нельзя — оно только запускает схему', 'warn'); return; }
    if (t && t.type === 'comment') return;
    edit((d) => ({ ...d, nodes: { ...d.nodes, [from]: schemeSetOut(d.nodes[from], key, target) } }));
  };
  const unlinkAll = (n, id) => {
    let c = n;
    for (const o of schemeOutputs(n)) if (schemeGetOut(c, o.key) === id) c = schemeSetOut(c, o.key, null);
    if (Array.isArray(c.outs) && c.outs.some((x) => !x)) { const keep = c.outs.map((x, i) => (x ? i : -1)).filter((i) => i >= 0); c = { ...c, outs: keep.map((i) => c.outs[i]), ...(c.weights ? { weights: keep.map((i) => (c.weights[i] === undefined ? 1 : c.weights[i])) } : {}) }; }
    return c;
  };
  const delNode = (id) => {
    edit((d) => { const nodes = {}; for (const [k, n] of Object.entries(d.nodes)) if (k !== id) nodes[k] = unlinkAll(n, id); return { ...d, nodes }; });
    setSel(null);
  };
  const dupNode = (id) => {
    const d0 = docRef.current;
    const n = JSON.parse(JSON.stringify(d0.nodes[id]));
    delete n.next; delete n.then; delete n.else; delete n.body;
    if (Array.isArray(n.outs)) { n.outs = []; if (n.weights) n.weights = []; }
    const nid = nextSchemeId(d0.nodes, n.type);
    edit((d) => ({ ...d, nodes: { ...d.nodes, [nid]: { ...n, x: (n.x || 0) + 30, y: (n.y || 0) + 40 } } }));
    setSel({ node: nid });
  };
  const unlink = (e) => edit((d) => {
    let n = schemeSetOut(d.nodes[e.from], e.key, null);
    if (e.key.startsWith('out:')) { const i = Number(e.key.slice(4)); n = { ...n, outs: (n.outs || []).filter((_, j) => j !== i), ...(n.weights ? { weights: n.weights.filter((_, j) => j !== i) } : {}) }; }
    return { ...d, nodes: { ...d.nodes, [e.from]: n } };
  });

  // ---------- игра ----------
  const loadToGame = async (quiet) => {
    if (!link.connected) { toast('Нет связи с игрой — запусти игру с режимом разработчика', 'warn', 6000); return false; }
    try { await ed.flush(); await call('studio:scheme', docRef.current); if (!quiet) { addLog('info', 'Схема загружена в игру: ' + docRef.current.id); toast('Схема загружена в игру — работает сразу, без «Собрать»', 'ok'); } return true; } catch (e) { toast(e.message, 'error'); return false; }
  };
  const fire = async (nodeId) => {
    const d = docRef.current;
    const evId = nodeId || (sel && sel.node && d.nodes[sel.node] && d.nodes[sel.node].type === 'event' ? sel.node : Object.keys(d.nodes).find((k) => d.nodes[k].type === 'event'));
    if (!evId) { toast('В схеме нет события — запускать нечего', 'warn'); return; }
    if (!link.connected) { toast('Нет связи с игрой — нажми «Прогнать без игры», чтобы посмотреть путь по схеме', 'warn', 6000); return; }
    if (nErr) { setCheck({ mode: 'fire', node: evId }); return; }
    doFire(evId);
  };
  const doFire = async (evId) => {
    setCheck(false);
    if (!(await loadToGame(true))) return;
    if (!follow) { setFollow(true); lsSet('schemeTrace', true); }
    try { await call('studio:schemeTrace', { on: true, id: docRef.current.id }); await call('studio:schemeFire', { id: docRef.current.id, node: evId, ctx: { from: 'studio' } }); addLog('info', 'Запущено событие «' + evId + '» схемы ' + docRef.current.id); toast('Событие запущено в игре — смотри подсветку', 'ok', 2500); } catch (e) { toast(e.message, 'error'); }
  };
  const dry = (nodeId) => {
    const d = docRef.current;
    const evId = nodeId || (sel && sel.node && d.nodes[sel.node] && d.nodes[sel.node].type === 'event' ? sel.node : Object.keys(d.nodes).find((k) => d.nodes[k].type === 'event'));
    if (!evId) { toast('В схеме нет события', 'warn'); return; }
    dryTimers.current.forEach(clearTimeout);
    const steps = dryRun(d, evId, freshWorld(project, lsGet('simWorld', null)), {});
    setTrace({});
    steps.forEach((s, i) => dryTimers.current.push(setTimeout(() => pushTrace(s.node, s.ok, s.note, 'без игры'), i * 320)));
    if (!steps.length) toast('Событие никуда не ведёт', 'warn');
  };

  // клавиши
  useEffect(() => {
    const k = (e) => {
      if (!docRef.current || document.querySelector('.modal-back, .c4-modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); if (inField) e.target.blur(); if (e.code === 'KeyY' || e.shiftKey) ed.redo(); else ed.undo(); } else if (ctrl && e.code === 'KeyS') { e.preventDefault(); ed.flush(); } else if (!inField && ctrl && e.code === 'KeyD' && sel && sel.node) { e.preventDefault(); dupNode(sel.node); } else if (!inField && (e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); if (sel.node) delNode(sel.node); else if (sel.edge) { unlink(sel.edge); setSel(null); } } else if (!inField && e.key === 'Escape') setSel(null); else if (!inField && e.code === 'F5') { e.preventDefault(); fire(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const create = async (title) => {
    const id = uniqueId(slug(title, 'scheme'), list.map((x) => x.id));
    try { await call('studio:docSave', { kind: 'schemes', doc: defaultScheme(id, title) }); await reloadList('schemes'); await open(id); } catch (e) { toast(e.message, 'error'); }
  };

  const kit = useMemo(() => ({
    ...SCHEME_KIT_BASE,
    nodeMenu: (id, n) => [
      ...(n.type === 'event' ? [
        { label: '▶ Запустить событие в игре', hint: 'Загрузить схему в игру и вызвать это событие прямо сейчас (F5). Узлы подсветятся по шагам.', disabled: !link.connected, run: () => fire(id) },
        { label: 'Прогнать без игры', hint: 'Пройти по схеме от этого события на выдуманном мире (переменные — как в «Прочитать как игрок»).', run: () => dry(id) }
      ] : []),
      { label: 'Копия рядом', hint: 'Копия узла без стрелок. Ctrl+D', disabled: n.type === 'comment' && false, run: () => dupNode(id) },
      { label: 'Удалить', hint: 'Удалить узел и стрелки в него. Delete', run: () => delNode(id) }
    ]
  }), [link.connected, nErr, follow, sel]); // eslint-disable-line

  const traceOn = Object.keys(trace).length > 0;
  const top = (
    <div className="st-top">
      {tabs}
      {doc ? (
        <>
          <input className="input sm st-title" value={doc.title || ''} placeholder="Название схемы" onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), { key: 'title' })} {...hp('Название схемы — для тебя. Файл: studio/schemes/' + doc.id + '.json')} />
          <button className="btn sm ghost icon-btn" disabled={!ed.canUndo} onClick={ed.undo} {...hp('Отменить (Ctrl+Z).')}><Icon name="undo" size={13} /></button>
          <button className="btn sm ghost icon-btn" disabled={!ed.canRedo} onClick={ed.redo} {...hp('Вернуть (Ctrl+Y).')}><Icon name="redo" size={13} /></button>
          <span className={'st-save ' + ed.saveState} {...hp('Схема сохраняется сама через секунду после правки. Ctrl+S — сразу.')}>{SAVE_TEXT[ed.saveState]}</span>
          <label className={'sc-onoff' + (doc.enabled === false ? ' off' : '')} {...hp('Включена — схема работает в игре. Выключена — лежит в проекте, но ни на что не реагирует (можно включить действием другой схемы).')}>
            <input type="checkbox" checked={doc.enabled !== false} onChange={(e) => edit((d) => ({ ...d, enabled: e.target.checked }))} /> {doc.enabled === false ? 'выключена' : 'включена'}
          </label>
          <div className="grow" />
          <button className="btn sm" onClick={() => dry()} {...hp('Прогнать без игры: пройти по схеме от выбранного (или первого) события на выдуманном мире и подсветить путь. Действия в мире не выполняются.')}><Icon name="play" size={12} /> Прогнать<span className="lbl-wide"> без игры</span></button>
          <button className="btn sm primary" onClick={() => fire()} disabled={!link.connected} {...hp('Запустить событие в игре (F5): схема загрузится в игру как есть, событие сработает сразу, а узлы будут подсвечиваться по мере выполнения. Выбери событие на графе — запустится оно.')}><Icon name="rocket" size={12} /> Запустить событие</button>
          <button className={'btn sm' + (follow ? ' on-glow' : '')} disabled={!link.connected} onClick={() => { const v = !follow; setFollow(v); lsSet('schemeTrace', v); }} {...hp('Следить за схемой: игра присылает каждый шаг этой схемы, и узел вспыхивает (зелёный — прошёл, красный — условие не выполнено). Как отладка блюпринтов.')}><span className={'sc-led' + (follow && link.connected ? ' on' : '')} /> Трасса</button>
          <button className="btn sm" onClick={() => loadToGame(false)} disabled={!link.connected} {...hp('Загрузить эту схему в игру сейчас (заменит старую версию). Работает сразу, без «Собрать».')}><Icon name="download" size={12} /><span className="lbl-wide"> В игру</span></button>
          <button className={'btn sm' + (nErr ? ' danger' : '')} onClick={() => setCheck({ mode: 'check' })} {...hp('Проверить схему: стрелки в никуда, пустые условия и действия, неизвестные сцены/диалоги/постройки, недостижимые узлы, круги без «Подождать».')}>
            <Icon name="check" size={12} /> Проверить{issues.length ? <span className={'st-badge' + (nErr ? ' e' : '')}>{nErr || issues.length}</span> : null}
          </button>
        </>
      ) : <div className="grow" />}
      {buildBtn}
    </div>
  );

  const node = doc && sel && sel.node ? doc.nodes[sel.node] : null;
  const bar = doc ? <span className="sc-legend" {...hp('Цвета узлов: события — красные, условия — жёлтые, действия — синие, поток (ждать, по очереди, случайно, повтор, ворота, один раз) — серые.')}>
    {[['event', 'события'], ['cond', 'условия'], ['action', 'действия'], ['flow', 'поток']].map(([c, l]) => <span key={c}><i style={{ background: CAT_COLOR[c] }} />{l}</span>)}
  </span> : null;
  return (
    <>
      {top}
      <aside className="st-left">
        {linkCard}
        <DocList kind="schemes" list={list} cur={doc && doc.id} open={open} create={create} reload={() => reloadList('schemes')} flush={ed.flush} hp={hp} toast={toast}
          onRenamed={(id) => { reloadList('schemes'); open(id); }} onDeleted={(id) => { if (doc && doc.id === id) ed.close(); }}
          sub={(x) => x.id + (x.enabled === false ? ' · выкл' : '') + ' · ' + (x.events && x.events.length ? x.events.map((e) => EVENT_LABEL[e] || e).slice(0, 2).join(', ') : 'нет событий')}
          L={{ title: 'Схемы', add: 'Схема', placeholder: 'Название, например «Ночной набег»', empty: 'Схем пока нет — нажми «+ Схема».', hint: 'Все схемы проекта: studio/schemes/<id>.json. Схема — логика мира: «когда … если … то …».', addHint: 'Создать схему: событие «ночь» → условие → действие. Дальше дорисуешь.' }} />
        {doc && <Palette hp={hp} onAdd={(it) => addNode(it.type, { x: 80 + Math.random() * 40, y: 80 + Math.random() * 40 }, null, it.preset)} />}
      </aside>
      <section className="st-center">
        {doc ? (
          <Graph dialog={doc} refs={refs} sel={sel} onSelect={setSel} edit={edit} gesture={ed.gesture} hp={hp} issueNodes={issueNodes} kit={kit} trace={trace} bar={bar}
            onAdd={addNode} onLink={linkTo} onDelete={delNode} onDuplicate={dupNode} onStart={() => {}} onReadFrom={() => {}}
            onLayout={() => edit((d) => schemeLayout(d, refs))} focus={focus} />
        ) : (
          <div className="st-empty card"><Icon name="grid" size={30} /><b>Схема не выбрана</b><p className="muted small">Создай схему слева («+ Схема») или выбери из списка. Схема — это логика мира: «когда наступила ночь → если игрок в деревне → начать набег».</p></div>
        )}
      </section>
      <aside className="st-right">
        <div className="st-insp-wrap">
          {!doc ? <div className="muted small" style={{ padding: 14 }}>Здесь будут свойства узла.</div>
            : node ? <NodeInsp id={sel.node} n={node} doc={doc} refs={refs} hp={hp} setNode={setNode} issues={issues.filter((x) => x.sel && x.sel.node === sel.node)}
              onDelete={() => delNode(sel.node)} onDup={() => dupNode(sel.node)} onFire={() => fire(sel.node)} onDry={() => dry(sel.node)} connected={link.connected} tr={trace[sel.node]} />
              : sel && sel.edge && doc.nodes[sel.edge.from] ? <EdgeInsp e={sel.edge} doc={doc} hp={hp} onUnlink={() => { unlink(sel.edge); setSel(null); }} onPick={(id) => { setSel({ node: id }); setFocus({ id, n: Date.now() }); }} />
                : <SchemeInsp doc={doc} edit={edit} hp={hp} issues={issues.filter((x) => !x.sel)} />}
        </div>
        <TraceLog log={tlog} doc={doc} hp={hp} onPick={(id) => { setSel({ node: id }); setFocus({ id, n: Date.now() }); }} onClear={() => { setTlog([]); setTrace({}); }} live={traceOn} />
        {hintBox}
      </aside>
      {check && doc && (
        <Modal title={check.mode === 'fire' ? 'В схеме есть ошибки' : 'Проверка схемы'} onClose={() => setCheck(false)}
          footer={<>{check.mode === 'fire' && <button className="btn" onClick={() => doFire(check.node)}>Всё равно запустить</button>}<button className="btn primary" onClick={() => setCheck(false)}>Понятно</button></>}>
          <IssueRows issues={issues} onPick={(x) => { setCheck(false); if (x.sel && x.sel.node) { setSel({ node: x.sel.node }); setFocus({ id: x.sel.node, n: Date.now() }); } else setSel(null); }} />
        </Modal>
      )}
    </>
  );
}

// палитра узлов слева: щёлкни — узел появится на схеме (или правый клик по пустому месту графа)
function Palette({ hp, onAdd }) {
  const [q, setQ] = useState('');
  const items = schemePalette(null);
  const f = q.trim().toLowerCase();
  return (
    <div className="st-card sc-pal">
      <div className="st-card-head" {...hp('Все виды узлов. Щёлкни — узел появится на схеме. Быстрее: правый клик по пустому месту графа или тяни стрелку от кружка в пустоту.')}><b>Палитра</b><div className="grow" /><input className="input sm" style={{ width: 96 }} placeholder="найти…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="sc-pal-list">
        {items.map((it, i) => (it.head ? (!f && <div key={i} className="sc-pal-h">{it.head}</div>) : (!f || it.label.toLowerCase().includes(f) || (it.hint || '').toLowerCase().includes(f)) && (
          <button key={i} className="sc-pal-it" onClick={() => onAdd(it)} {...hp(it.label + ' — ' + it.hint)}><i style={{ background: it.color }} />{it.label}</button>
        )))}
      </div>
    </div>
  );
}

function TraceLog({ log, doc, hp, onPick, onClear, live }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  return (
    <div className="st-card sc-trace">
      <div className="st-card-head" {...hp('Шаги схемы по порядку: что выполнилось, какие условия не прошли. Из игры (при включённой «Трассе») или «Прогнать без игры». Щёлкни строку — выберется узел.')}>
        <b>Трасса</b>{live && <span className="sc-led on" />}<span className="muted small">{log.length}</span><div className="grow" />
        {log.length > 0 && <button className="btn sm ghost" onClick={onClear}>очистить</button>}
      </div>
      <div className="sc-trace-list" ref={ref}>
        {!log.length && <div className="muted small">Пусто. Нажми «Запустить событие» (в игре) или «Прогнать без игры».</div>}
        {log.map((l, i) => {
          const n = doc && doc.nodes[l.node];
          return (
            <div key={i} className={'sc-tr ' + (l.ok ? 'ok' : 'no')} onClick={() => onPick(l.node)}>
              <span className="mono dim">{new Date(l.at).toLocaleTimeString('ru-RU')}</span>
              <span className="sc-tr-dot" style={{ background: n ? (SCHEME_DEFS[n.type] || {}).color : '#777' }} />
              <b className="mono">{l.node}</b>
              <span className="grow">{l.note || (n ? (SCHEME_DEFS[n.type] || {}).label : '')}</span>
              <span className="dim small">{l.src}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InspHead({ color, title, sub, hp, hint, children }) {
  return (
    <div className="st-insp-head" {...hp(hint || '')}>
      <span className="tl-dot" style={{ background: color }} />
      <div className="grow"><b>{title}</b><div className="muted small">{sub}</div></div>
      {children}
    </div>
  );
}

function NextSel({ nodes, value, onChange, self, none = '— стоп (дальше ничего) —' }) {
  const ids = Object.keys(nodes).filter((id) => id !== self && !['event', 'comment'].includes(nodes[id].type));
  const has = !value || nodes[value];
  return (
    <select className="input sm" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{none}</option>
      {ids.map((id) => <option key={id} value={id}>{id} · {(SCHEME_DEFS[nodes[id].type] || {}).label}</option>)}
      {!has && <option value={value}>{value} (нет такого!)</option>}
    </select>
  );
}

const AT_LABEL = { dawn: 'рассвет (0)', day: 'день (6000)', dusk: 'закат (12000)', night: 'ночь (13000)', tick: 'точный тик…' };
const ZONE_ON_L = { enter: 'вошёл', leave: 'вышел', inside: 'находится внутри' };
const QUEST_ON_L = { start: 'начато', step: 'перешло на шаг', done: 'выполнено', fail: 'провалено' };
const ITEM_ON_L = { pickup: 'подобрал', use: 'использовал', craft: 'скрафтил' };
const BLOCK_ON_L = { break: 'сломал', place: 'поставил', use: 'нажал (ПКМ)' };

function NodeInsp({ id, n, doc, refs, hp, setNode, issues, onDelete, onDup, onFire, onDry, connected, tr }) {
  const def = SCHEME_DEFS[n.type] || { label: n.type, color: '#999', hint: '' };
  const set = (k, v) => setNode(id, (x) => { const c = { ...x }; if (v === undefined || v === null || v === '') delete c[k]; else c[k] = v; return c; }, k);
  const nodes = doc.nodes;
  const ev = n.type === 'event' ? n.event : null;
  return (
    <div className="st-insp">
      <InspHead color={def.color} title={def.label + (ev ? ' · ' + (EVENT_LABEL[ev] || '?') : '')} sub={'узел ' + id + (tr ? (tr.ok ? ' · только что выполнен' : ' · не прошёл') : '')} hp={hp} hint={ev ? EVENT_HINT[ev] : def.hint}>
        {n.type !== 'comment' && <button className="btn sm ghost icon-btn" title="Копия рядом (Ctrl+D)" onClick={onDup}><Icon name="copy" size={12} /></button>}
        <button className="btn sm danger icon-btn" title="Удалить узел (Delete)" onClick={onDelete}><Icon name="trash" size={12} /></button>
      </InspHead>
      <p className="st-insp-hint">{ev ? EVENT_HINT[ev] : def.hint}</p>
      <IssuesMini list={issues} />
      {n.type === 'event' && (
        <div className="st-btns sc-fire">
          <button className="btn sm primary" disabled={!connected} onClick={onFire} {...hp('Загрузить схему в игру и вызвать это событие прямо сейчас (F5). Узлы будут вспыхивать по мере выполнения.')}><Icon name="rocket" size={11} /> Запустить событие</button>
          <button className="btn sm" onClick={onDry} {...hp('Пройти по схеме от этого события без игры — на выдуманном мире.')}><Icon name="play" size={11} /> Без игры</button>
        </div>
      )}
      <div className="st-fields">
        {n.type === 'event' && (<>
          <FieldRow label="Когда" hp={hp} hint="Какое событие запускает схему." wide>
            <select className="input sm" value={ev || ''} onChange={(e) => setNode(id, (x) => ({ ...newSchemeNode('event', { event: e.target.value }, refs), x: x.x, y: x.y, next: x.next }))}>
              {EVENT_KINDS.map((k) => <option key={k} value={k}>{EVENT_LABEL[k]}</option>)}
            </select>
          </FieldRow>
          {ev === 'time' && (<>
            <FieldRow label="Время суток" hp={hp} hint="Когда сработать: на рассвете (0), днём (6000), на закате (12000), ночью (13000) или в точный тик (0–23999)." wide>
              <select className="input sm" value={n.at || 'night'} onChange={(e) => set('at', e.target.value)}>{TIME_AT.map((a) => <option key={a} value={a}>{AT_LABEL[a]}</option>)}</select>
            </FieldRow>
            {n.at === 'tick' && <FieldRow label="Тик суток" hp={hp} hint="0 — рассвет, 6000 — полдень, 13000 — ночь, 18000 — полночь."><NumInput value={n.tick || 0} int min={0} max={23999} onChange={(v) => set('tick', v || 0)} /></FieldRow>}
          </>)}
          {ev === 'timer' && <FieldRow label="Каждые" hp={hp} hint={'Как часто, в тиках (20 = 1 секунда). Сейчас: раз в ' + (Math.round((n.every || 0) / 2) / 10) + ' с.'}><NumInput value={n.every} int min={1} onChange={(v) => set('every', v || 1)} /></FieldRow>}
          {ev === 'zone' && (<>
            <FieldRow label="Зона" hp={hp} hint="Где: шар (центр и радиус) или коробка (два угла). «Взять из игры» — блок под прицелом." wide>
              <ZoneField value={Array.isArray(n.from) ? { from: n.from, to: n.to } : { pos: n.pos, radius: n.radius }} refs={refs} onChange={(z) => setNode(id, (x) => { const c = { ...x }; delete c.pos; delete c.radius; delete c.from; delete c.to; return { ...c, ...z }; })} />
            </FieldRow>
            <FieldRow label="Игрок" hp={hp} hint="Вошёл — один раз при входе; вышел — при выходе; внутри — каждую секунду, пока там." wide>
              <div className="lg-two"><select className="input sm" value={n.on || 'enter'} onChange={(e) => set('on', e.target.value)}>{ZONE_ON.map((o) => <option key={o} value={o}>{ZONE_ON_L[o]}</option>)}</select>
                <select className="input sm" value={n.who || 'player'} onChange={(e) => set('who', e.target.value)}><option value="player">каждый игрок сам</option><option value="any_player">любой (один раз на всех)</option></select></div>
            </FieldRow>
          </>)}
          {ev === 'talk' && <FieldRow label="С кем" hp={hp} hint="Разговор (ПКМ) с этим персонажем." wide><SpeakerPicker value={n.speaker} onChange={(v) => set('speaker', v)} refs={refs} allowAny /></FieldRow>}
          {ev === 'dialog_end' && (<>
            <FieldRow label="Диалог" hp={hp} hint="Какой диалог закончился." wide><RefSelect list={refs.dialogs} value={n.dialog} onChange={(v) => setNode(id, (x) => ({ ...x, dialog: v || '', node: undefined }))} /></FieldRow>
            <FieldRow label="На узле" hp={hp} hint="Необязательно: только если диалог закончился на этом узле (например, игрок выбрал «Помогу»)." wide>
              <select className="input sm" value={n.node || ''} onChange={(e) => set('node', e.target.value)}><option value="">на любом</option>{(((refs.dialogs || []).find((x) => x.id === n.dialog) || {}).nodes || []).map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </FieldRow>
          </>)}
          {ev === 'quest' && (<>
            <FieldRow label="Задание" hp={hp} hint="Какое задание." wide><RefSelect list={refs.quests} value={n.quest} onChange={(v) => set('quest', v)} /></FieldRow>
            <FieldRow label="Что случилось" hp={hp} hint="Задание началось, перешло на шаг (можно указать какой), выполнено или провалено." wide>
              <select className="input sm" value={n.on || 'start'} onChange={(e) => set('on', e.target.value)}>{QUEST_ON.map((o) => <option key={o} value={o}>{QUEST_ON_L[o]}</option>)}</select>
            </FieldRow>
            {n.on === 'step' && <FieldRow label="Шаг" hp={hp} hint="На какой шаг. Пусто — на любой." wide><RefSelect list={((((refs.quests || []).find((x) => x.id === n.quest) || {}).steps) || []).map((s) => (typeof s === 'string' ? { id: s } : s))} value={n.step} allowNone noneLabel="любой" onChange={(v) => set('step', v)} label={(s) => s.id + (s.title ? ' · ' + s.title : '')} /></FieldRow>}
          </>)}
          {ev === 'scene_end' && <FieldRow label="Сцена" hp={hp} hint="Какая катсцена закончилась (или её пропустили)." wide><RefSelect list={refs.scenes} value={n.scene} onChange={(v) => set('scene', v)} /></FieldRow>}
          {ev === 'var' && (<>
            <FieldRow label="Переменная" hp={hp} hint="Какая переменная сюжета поменялась." wide><VarPicker value={n.name} refs={refs} onChange={(v) => set('name', v)} /></FieldRow>
            <FieldRow label="Только если" hp={hp} hint="Необязательно: сработать, только когда новое значение такое (например coins ≥ 10). Пусто — при любом изменении." wide>
              <div className="lg-two">
                <select className="input sm" value={n.op || ''} onChange={(e) => setNode(id, (x) => { const c = { ...x }; if (e.target.value) { c.op = e.target.value; if (c.value === undefined) c.value = true; } else { delete c.op; delete c.value; } return c; })}><option value="">любое изменение</option>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                {n.op ? <ValueInput type={((refs.vars || []).find((v) => v.name === n.name) || {}).type} value={n.value} onChange={(v) => set('value', v)} /> : <span />}
              </div>
            </FieldRow>
          </>)}
          {ev === 'item' && (<>
            <FieldRow label="Игрок" hp={hp} hint="Что сделал с предметом." wide><select className="input sm" value={n.on || 'pickup'} onChange={(e) => set('on', e.target.value)}>{ITEM_ON.map((o) => <option key={o} value={o}>{ITEM_ON_L[o]}</option>)}</select></FieldRow>
            <FieldRow label="Предмет" hp={hp} hint="id предмета, например minecraft:emerald." wide><input className="input sm mono" list="sl-items" value={n.item || ''} onChange={(e) => set('item', e.target.value.trim())} /></FieldRow>
          </>)}
          {ev === 'block' && (<>
            <FieldRow label="Игрок" hp={hp} hint="Что сделал с блоком." wide><select className="input sm" value={n.on || 'break'} onChange={(e) => set('on', e.target.value)}>{BLOCK_ON.map((o) => <option key={o} value={o}>{BLOCK_ON_L[o]}</option>)}</select></FieldRow>
            <FieldRow label="Блок" hp={hp} hint="id блока, например minecraft:oak_log." wide><input className="input sm mono" list="sl-blocks" value={n.block || ''} onChange={(e) => set('block', e.target.value.trim())} /></FieldRow>
            <BoolRow label="Только в зоне" hp={hp} hint="Считать только блоки внутри зоны (например, в деревне)." value={!!n.zone} onChange={(v) => set('zone', v ? { pos: [0, 64, 0], radius: 32 } : undefined)} />
            {n.zone && <FieldRow label="Зона" hp={hp} hint="Где считать." wide><ZoneField value={n.zone} refs={refs} onChange={(z) => set('zone', z)} /></FieldRow>}
          </>)}
          {ev === 'kill' && (<>
            <FieldRow label="Моб" hp={hp} hint="id моба, например minecraft:zombie." wide><input className="input sm mono" list="sl-entities" value={n.entity || ''} onChange={(e) => set('entity', e.target.value.trim())} /></FieldRow>
            <BoolRow label="Только в зоне" hp={hp} hint="Считать только мобов, убитых в зоне." value={!!n.zone} onChange={(v) => set('zone', v ? { pos: [0, 64, 0], radius: 32 } : undefined)} />
            {n.zone && <FieldRow label="Зона" hp={hp} hint="Где." wide><ZoneField value={n.zone} refs={refs} onChange={(z) => set('zone', z)} /></FieldRow>}
          </>)}
          {ev === 'chat' && <FieldRow label="Текст" hp={hp} hint="Сработает, если сообщение в чате содержит этот текст. Для твоих проверок: например «!набег»." wide><input className="input sm" value={n.text || ''} onChange={(e) => set('text', e.target.value)} /></FieldRow>}
          {ev === 'signal' && <FieldRow label="Сигнал" hp={hp} hint="Имя сигнала (латиница). Его подаёт действие «Подать сигнал» в любой схеме." wide><input className="input sm mono" list="sl-signals" value={n.name || ''} onChange={(e) => set('name', e.target.value.replace(/\s+/g, '_'))} /></FieldRow>}
          <FieldRow label="Дальше" hp={hp} hint="Что выполнить, когда событие случилось. Проще — тянуть стрелку от кружка." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'cond' && (<>
          <FieldRow label="Если" hp={hp} hint="Все условия списка сразу. Для «или» — условие «Любое из». Проверяется для игрока, который вызвал событие." wide>
            <CondList value={n.if} onChange={(l) => setNode(id, { if: l })} refs={refs} hp={hp} scheme />
          </FieldRow>
          <FieldRow label="Да →" hp={hp} hint="Куда, если всё выполняется." wide><NextSel nodes={nodes} value={n.then} self={id} onChange={(v) => set('then', v)} /></FieldRow>
          <FieldRow label="Нет →" hp={hp} hint="Куда, если не выполняется. Пусто — схема на этом останавливается." wide><NextSel nodes={nodes} value={n.else} self={id} onChange={(v) => set('else', v)} /></FieldRow>
        </>)}
        {n.type === 'action' && (<>
          <FieldRow label="Сделать" hp={hp} hint="Действия по порядку сверху вниз. «У игрока» — у того, кто вызвал событие." wide>
            <ActionList value={n.do} onChange={(l) => setNode(id, { do: l })} refs={refs} hp={hp} scheme />
          </FieldRow>
          <FieldRow label="Дальше" hp={hp} hint="Что потом. Пусто — схема на этом заканчивается." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'wait' && (<>
          <FieldRow label="Ждать" hp={hp} hint={'Сколько тиков (20 = 1 секунда). Сейчас: ' + (Math.round((n.ticks || 0) / 2) / 10) + ' с.'}>
            <div className="row lg-inline"><NumInput value={n.ticks} int min={1} onChange={(v) => set('ticks', Math.max(1, v || 1))} /><span className="small muted">т = {Math.round((n.ticks || 0) / 2) / 10} с</span></div>
          </FieldRow>
          <FieldRow label="Потом" hp={hp} hint="Что выполнить после паузы." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {(n.type === 'sequence' || n.type === 'random') && <OutsEditor id={id} n={n} nodes={nodes} hp={hp} setNode={setNode} />}
        {n.type === 'loop' && (<>
          <FieldRow label="Сколько раз" hp={hp} hint={'От 1 до ' + SCHEME_LIMITS.loop + '. Между повторами можно поставить «Подождать» внутри ветки.'}><NumInput value={n.times} int min={1} max={SCHEME_LIMITS.loop} onChange={(v) => set('times', Math.max(1, Math.min(SCHEME_LIMITS.loop, v || 1)))} /></FieldRow>
          <FieldRow label="Каждый раз →" hp={hp} hint="Ветка, которая повторяется." wide><NextSel nodes={nodes} value={n.body} self={id} onChange={(v) => set('body', v)} /></FieldRow>
          <FieldRow label="Потом →" hp={hp} hint="Куда после всех повторов." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'gate' && (<>
          <BoolRow label="Открыты в начале" hp={hp} hint="Какими ворота будут при первом запуске. Дальше их открывает и закрывает действие «Открыть/закрыть ворота» (состояние помнится)." value={n.open !== false} onChange={(v) => setNode(id, { open: v })} />
          <FieldRow label="Дальше" hp={hp} hint="Куда, если ворота открыты." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'once' && <FieldRow label="Дальше" hp={hp} hint="Куда — только в самый первый раз." wide><NextSel nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>}
        {n.type === 'comment' && <FieldRow label="Текст" hp={hp} hint="Заметка на схеме. Игра её не читает." wide><textarea className="input sm" rows={5} value={n.text || ''} onChange={(e) => set('text', e.target.value)} /></FieldRow>}
      </div>
    </div>
  );
}

function OutsEditor({ id, n, nodes, hp, setNode }) {
  const outs = Array.isArray(n.outs) ? n.outs : [];
  const ws = Array.isArray(n.weights) ? n.weights : [];
  const rnd = n.type === 'random';
  const sum = outs.reduce((s, _, i) => s + (typeof ws[i] === 'number' ? ws[i] : 1), 0) || 1;
  const setOuts = (o, w) => setNode(id, (x) => ({ ...x, outs: o, ...(rnd ? { weights: w } : {}) }));
  const W = outs.map((_, i) => (typeof ws[i] === 'number' ? ws[i] : 1));
  return (
    <div className="dl-opts" {...hp(rnd ? 'Варианты: выпадет один, чаще — у кого вес больше.' : 'Шаги по очереди: сначала ветка 1, потом 2…')}>
      <div className="st-flabel">{rnd ? 'Варианты и веса' : 'Шаги по очереди'} <span className="st-q">?</span></div>
      {outs.map((t, i) => (
        <div key={i} className="row sc-out">
          <span className="lg-num">{i + 1}</span>
          <div className="grow"><NextSel nodes={nodes} value={t} self={id} none="— никуда —" onChange={(v) => { const o = outs.slice(); o[i] = v; setOuts(o, W); }} /></div>
          {rnd && <NumInput value={W[i]} min={0} step={1} onChange={(v) => { const w = W.slice(); w[i] = Math.max(0, v == null ? 1 : v); setOuts(outs, w); }} title="Вес" />}
          {rnd && <span className="small muted" style={{ width: 34 }}>{Math.round((W[i] / sum) * 100)}%</span>}
          <button className="btn sm ghost icon-btn" title="Убрать" onClick={() => setOuts(outs.filter((_, j) => j !== i), W.filter((_, j) => j !== i))}><Icon name="close" size={9} /></button>
        </div>
      ))}
      <button className="btn sm ghost lg-add" onClick={() => setOuts([...outs, null], [...W, 1])}>+ выход</button>
    </div>
  );
}

function EdgeInsp({ e, doc, hp, onUnlink, onPick }) {
  const n = doc.nodes[e.from];
  const out = schemeOutputs(n).find((o) => o.key === e.key);
  const t = schemeGetOut(n, e.key);
  return (
    <div className="st-insp">
      <InspHead color="#bbb" title="Стрелка" sub={e.from + ' → ' + (t || '?')} hp={hp} hint="Куда идёт выполнение дальше.">
        <button className="btn sm danger icon-btn" title="Убрать стрелку (Delete)" onClick={onUnlink}><Icon name="trash" size={12} /></button>
      </InspHead>
      <p className="st-insp-hint">Из «{(SCHEME_DEFS[n.type] || {}).label}» {e.from}{out ? ' (выход «' + out.label + '»)' : ''} в {t}. Чтобы перевести — потяни заново от кружка.</p>
      <div className="st-btns"><button className="btn sm" onClick={() => onPick(e.from)}>К началу</button>{doc.nodes[t] && <button className="btn sm" onClick={() => onPick(t)}>К концу</button>}</div>
    </div>
  );
}

function SchemeInsp({ doc, edit, hp, issues }) {
  const nodes = Object.values(doc.nodes || {});
  const evs = nodes.filter((n) => n.type === 'event');
  return (
    <div className="st-insp">
      <InspHead color={CAT_COLOR.event} title="Схема" sub={doc.id + '.json · ' + nodes.length + ' узлов'} hp={hp} hint="Настройки всей схемы. Щёлкни узел — здесь появятся его свойства." />
      <p className="st-insp-hint">Схема — логика мира: <b>событие</b> (когда) → <b>условие</b> (если) → <b>действие</b> (что сделать). Ничего не выбрано — это настройки всей схемы.</p>
      <IssuesMini list={issues} />
      <div className="st-fields">
        <FieldRow label="Название" hp={hp} hint="Для тебя: так схема видна в списке."><input className="input sm" value={doc.title || ''} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), { key: 'title' })} /></FieldRow>
        <BoolRow label="Включена" hp={hp} hint="Выключенная схема ни на что не реагирует. Её может включить действие «Вкл/выкл схему»." value={doc.enabled !== false} onChange={(v) => edit((d) => ({ ...d, enabled: v }))} />
        <FieldRow label="Заметка" hp={hp} hint="Любой комментарий для себя." wide><textarea className="input sm" rows={2} value={doc.note || ''} onChange={(e) => edit((d) => ({ ...d, note: e.target.value }), { key: 'note' })} /></FieldRow>
      </div>
      <div className="small muted">События: {evs.length ? evs.map((e) => EVENT_LABEL[e.event] || e.event).join(', ') : 'нет — схема не запустится'}.</div>
      <p className="muted small">Пределы в игре: до {SCHEME_LIMITS.instances} одновременных запусков схемы, повтор — до {SCHEME_LIMITS.loop}, «Подождать» — от 1 тика. Команды: <span className="mono">/vkokk studio scheme list|enable|disable|fire|trace</span>.</p>
    </div>
  );
}
