// Вкладка «Диалоги»: список диалогов слева, граф в центре, свойства узла справа,
// «Прочитать как игрок» (без игры) и «Открыть в игре» (живая связь).
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import Graph from './Graph.jsx';
import Simulator from './Simulator.jsx';
import { useDocEditor, DocList, IssuesMini, SAVE_TEXT, IssueRows } from './docs.jsx';
import { CondList, ActionList, SpeakerPicker, RefSelect, condDefault } from './logic.jsx';
import { NODE_DEFS, newNode, nextNodeId, autoLayout, speakerName, clip } from './dialog.js';
import { validateDialog, defaultDialog, setOut, getOut, nodeOutputs, ERR, TEXT_MAX } from './validate.js';
import { slug, uniqueId } from './model.js';

const lsGet = (k, d) => { try { const v = localStorage.getItem('studio.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('studio.' + k, JSON.stringify(v)); } catch (_) {} };

const TRIGGER_OPTS = [
  ['talk', 'Разговор с жителем (ПКМ)', 'Откроется, когда игрок щёлкнет правой кнопкой по говорящему — если условия выполнены и важность выше обычных разговоров.'],
  ['scene', 'Из сцены', 'Откроется только событием «Открыть диалог» в катсцене.'],
  ['quest', 'Из задания', 'Откроется шагом задания («Поговорить» или «диалог по завершении»).'],
  ['command', 'Только командой / из других диалогов', 'Сам не откроется: только /vkokk studio dialog <id>, переход из другого диалога или из Студии.']
];

function prepareDialog(raw, id) {
  const d = { ...defaultDialog(id), ...raw, id: raw.id || id };
  d.trigger = { on: 'talk', when: [], once: false, priority: 10, ...(raw.trigger || {}) };
  d.nodes = raw.nodes && typeof raw.nodes === 'object' ? { ...raw.nodes } : {};
  // узлы без координат — разложить
  const missing = Object.values(d.nodes).some((n) => n && (typeof n.x !== 'number' || typeof n.y !== 'number'));
  return missing ? autoLayout(d) : d;
}

export function FieldRow({ label, hint, hp, wide, children }) {
  return (
    <div className={'st-field' + (wide ? ' wide' : '')} {...hp(label + ' — ' + hint)}>
      <div className="st-flabel" title={hint}>{label}<span className="st-q">?</span></div>
      <div className="st-finput">{children}</div>
    </div>
  );
}
export function BoolRow({ label, hint, hp, value, onChange }) {
  return (
    <div className="st-field bool" {...hp(label + ' — ' + hint)}>
      <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
      <span className="st-q" title={hint}>?</span>
    </div>
  );
}

function NextSelect({ nodes, value, onChange, self }) {
  const ids = Object.keys(nodes);
  const has = !value || nodes[value] || value === 'end';
  return (
    <select className="input sm" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— никуда (разговор кончится) —</option>
      {!nodes.end && <option value="end">Конец диалога</option>}
      {ids.filter((id) => id !== self).map((id) => {
        const n = nodes[id];
        const t = n.type === 'line' ? ': ' + clip(n.text || '', 26) : n.type === 'choice' ? ': ' + clip(n.text || (n.options || []).map((o) => o.text).join(' / '), 26) : '';
        return <option key={id} value={id}>{id} · {(NODE_DEFS[n.type] || {}).label || n.type}{t}</option>;
      })}
      {!has && <option value={value}>{value} (нет такого!)</option>}
    </select>
  );
}

export default function DialogTab({ shared, goto }) {
  const { tabs, linkCard, hintBox, buildBtn, actorsCard, toast, hp, link, project, saveProject, lists, reloadList, patchList, baseRefs, addLog } = shared;
  const list = lists.dialogs;
  const ed = useDocEditor('dialogs', {
    toast, prepare: prepareDialog,
    onSaved: (d) => patchList('dialogs', { id: d.id, title: d.title, nodes: Object.keys(d.nodes || {}), speaker: d.speaker })
  });
  const { doc, edit } = ed;
  const [sel, setSel] = useState(null);
  const [sim, setSim] = useState(null); // { from }
  const [check, setCheck] = useState(false);
  const [focus, setFocus] = useState(null);

  const open = useCallback(async (id) => { if (await ed.open(id)) { setSel(null); lsSet('lastDialog', id); } }, [ed.open]); // eslint-disable-line
  useEffect(() => {
    if (goto && goto.kind === 'dialog') return;
    const last = lsGet('lastDialog', null);
    const pick = list.find((x) => x.id === last) || list[0];
    if (pick) open(pick.id);
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!goto || goto.kind !== 'dialog') return;
    (async () => {
      if (!ed.docRef.current || ed.docRef.current.id !== goto.id) await open(goto.id);
      if (goto.sel && goto.sel.node) { setSel({ node: goto.sel.node }); setFocus({ id: goto.sel.node, n: Date.now() }); } else setSel(null);
    })();
  }, [goto]); // eslint-disable-line

  const refs = useMemo(() => ({ ...baseRefs, speakerName: doc ? speakerName(doc.speaker, baseRefs) : 'Хозяин' }), [baseRefs, doc && doc.speaker]); // eslint-disable-line
  const lazy = useDeferredValue(doc);
  const issues = useMemo(() => {
    if (!lazy) return [];
    const dl = list.map((x) => (x.id === lazy.id ? { id: x.id, nodes: Object.keys(lazy.nodes || {}) } : x));
    if (!dl.some((x) => x.id === lazy.id)) dl.push({ id: lazy.id, nodes: Object.keys(lazy.nodes || {}) });
    return validateDialog(lazy, { project, ids: list.map((x) => x.id), dialogs: dl, scenes: lists.scenes.map((x) => x.id), quests: lists.quests });
  }, [lazy, project, list, lists.scenes, lists.quests]);
  const nErr = issues.filter((x) => x.sev === ERR).length;
  const issueNodes = useMemo(() => {
    const m = {};
    for (const x of issues) if (x.sel && x.sel.node) { if (m[x.sel.node] !== ERR) m[x.sel.node] = x.sev; }
    return m;
  }, [issues]);

  // ---------- правки графа ----------
  const setNode = (id, fn, key) => edit((d) => ({ ...d, nodes: { ...d.nodes, [id]: typeof fn === 'function' ? fn(d.nodes[id]) : { ...d.nodes[id], ...fn } } }), key ? { key: 'n:' + id + ':' + key } : {});
  const addNode = (type, pos, from) => {
    const d0 = ed.docRef.current;
    const id = type === 'end' && !d0.nodes.end ? 'end' : nextNodeId(d0.nodes);
    const n = { ...newNode(type, refs), x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10 };
    edit((d) => {
      const nodes = { ...d.nodes, [id]: n };
      if (from && nodes[from.from]) nodes[from.from] = setOut(nodes[from.from], from.key, id);
      return { ...d, nodes, start: d.start && d.nodes[d.start] ? d.start : (type === 'end' ? d.start : id) };
    });
    setSel({ node: id });
  };
  const linkTo = (from, key, target) => {
    if (from === target && ed.docRef.current.nodes[from].type !== 'choice') { toast('Стрелка в тот же узел — замкнутый круг. Веди к другому узлу.', 'warn'); return; }
    edit((d) => ({ ...d, nodes: { ...d.nodes, [from]: setOut(d.nodes[from], key, target) } }));
    setSel({ node: target });
  };
  const delNode = (id) => {
    edit((d) => {
      const nodes = {};
      for (const [k, n] of Object.entries(d.nodes)) {
        if (k === id) continue;
        let c = n;
        for (const o of nodeOutputs(n)) if (getOut(c, o.key) === id) c = setOut(c, o.key, null);
        nodes[k] = c;
      }
      const start = d.start === id ? (Object.keys(nodes).find((k) => nodes[k].type !== 'end') || '') : d.start;
      return { ...d, nodes, start };
    });
    setSel(null);
  };
  const dupNode = (id) => {
    const d0 = ed.docRef.current;
    const n = JSON.parse(JSON.stringify(d0.nodes[id]));
    if (n.type === 'end') return;
    delete n.next; delete n.then; delete n.else;
    if (n.options) n.options = n.options.map((o) => { const c = { ...o }; delete c.next; return c; });
    const nid = nextNodeId(d0.nodes);
    edit((d) => ({ ...d, nodes: { ...d.nodes, [nid]: { ...n, x: (n.x || 0) + 30, y: (n.y || 0) + 40 } } }));
    setSel({ node: nid });
  };
  const unlink = (e) => edit((d) => ({ ...d, nodes: { ...d.nodes, [e.from]: setOut(d.nodes[e.from], e.key, null) } }));

  // клавиши
  useEffect(() => {
    const k = (e) => {
      if (!ed.docRef.current || document.querySelector('.modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); if (inField) e.target.blur(); if (e.code === 'KeyY' || e.shiftKey) ed.redo(); else ed.undo(); } else if (ctrl && e.code === 'KeyS') { e.preventDefault(); ed.flush(); } else if (!inField && ctrl && e.code === 'KeyD' && sel && sel.node) { e.preventDefault(); dupNode(sel.node); } else if (!inField && (e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); if (sel.node) delNode(sel.node); else if (sel.edge) { unlink(sel.edge); setSel(null); } } else if (!inField && e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const create = async (title) => {
    const id = uniqueId(slug(title, 'dialog'), list.map((x) => x.id));
    try {
      await call('studio:docSave', { kind: 'dialogs', doc: defaultDialog(id, title) });
      await reloadList('dialogs');
      await open(id);
    } catch (e) { toast(e.message, 'error'); }
  };
  const playInGame = async () => {
    if (!link.connected) { toast('Нет связи с игрой — запусти игру с режимом разработчика', 'warn', 6000); return; }
    if (nErr) { setCheck('play'); return; }
    sendToGame();
  };
  const sendToGame = async () => {
    setCheck(false);
    try { await ed.flush(); await call('studio:dialog', doc); addLog('info', 'Открыл в игре диалог: ' + doc.id); toast('Диалог открыт в игре — переключись в окно игры', 'ok'); } catch (e) { toast(e.message, 'error'); }
  };

  const top = (
    <div className="st-top">
      {tabs}
      {doc ? (
        <>
          <input className="input sm st-title" value={doc.title || ''} placeholder="Название диалога" onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), { key: 'title' })} {...hp('Название диалога — только для тебя. Файл называется по id: ' + doc.id + '.json')} />
          <button className="btn sm ghost icon-btn" disabled={!ed.canUndo} onClick={ed.undo} {...hp('Отменить (Ctrl+Z).')}><Icon name="undo" size={13} /></button>
          <button className="btn sm ghost icon-btn" disabled={!ed.canRedo} onClick={ed.redo} {...hp('Вернуть (Ctrl+Y).')}><Icon name="redo" size={13} /></button>
          <span className={'st-save ' + ed.saveState} {...hp('Диалог сохраняется сам через секунду после правки. Ctrl+S — сразу.')}>{SAVE_TEXT[ed.saveState]}</span>
          <div className="grow" />
          <button className="btn sm primary" onClick={() => setSim({ from: null })} {...hp('Прочитать диалог так, как его увидит игрок — прямо тут, без игры. Справа можно менять переменные, задания и предметы и смотреть, куда поведёт разговор.')}><Icon name="play" size={12} /> Прочитать<span className="lbl-wide"> как игрок</span></button>
          <button className="btn sm" onClick={playInGame} {...hp('Открыть этот диалог в игре у тебя — как есть сейчас, даже без «Собрать». Нужна связь с игрой.')}><Icon name="rocket" size={12} /> <span className="lbl-wide">Открыть </span>в игре</button>
          <button className={'btn sm' + (nErr ? ' danger' : '')} onClick={() => setCheck('check')} {...hp('Проверить диалог: стрелки в никуда, пустые реплики, выбор без продолжения, недостижимые узлы, неизвестные переменные. Щёлкни по ошибке — выберется узел.')}>
            <Icon name="check" size={12} /> Проверить{issues.length ? <span className={'st-badge' + (nErr ? ' e' : '')}>{nErr || issues.length}</span> : null}
          </button>
        </>
      ) : <div className="grow" />}
      {buildBtn}
    </div>
  );

  const node = doc && sel && sel.node ? doc.nodes[sel.node] : null;
  return (
    <>
      {top}
      <aside className="st-left">
        {linkCard}
        <DocList kind="dialogs" list={list} cur={doc && doc.id} open={open} create={create} reload={() => reloadList('dialogs')} flush={ed.flush} hp={hp} toast={toast}
          onRenamed={(id) => { reloadList('scenes'); reloadList('quests'); open(id); }} onDeleted={(id) => { if (doc && doc.id === id) ed.close(); }}
          sub={(x) => x.id + ' · ' + speakerName(x.speaker, baseRefs) + ' · ' + ((x.nodes || []).length) + ' уз.'}
          L={{ title: 'Диалоги', add: 'Диалог', placeholder: 'Название, например «Мирон: знакомство»', empty: 'Диалогов пока нет — нажми «+ Диалог».', hint: 'Все диалоги проекта: studio/dialogs/<id>.json. Щёлкни, чтобы открыть.', addHint: 'Создать новый диалог: реплика, выбор из двух ответов и конец — дальше дорисуешь.' }} />
        {actorsCard}
      </aside>
      <section className="st-center">
        {doc ? (
          <Graph dialog={doc} refs={refs} sel={sel} onSelect={setSel} edit={edit} gesture={ed.gesture} hp={hp} issueNodes={issueNodes}
            onAdd={addNode} onLink={linkTo} onDelete={delNode} onDuplicate={dupNode} onStart={(id) => edit((d) => ({ ...d, start: id }))}
            onLayout={() => edit((d) => autoLayout(d, refs))} onReadFrom={(id) => setSim({ from: id })} focus={focus} />
        ) : (
          <div className="st-empty card"><Icon name="news" size={30} /><b>Диалог не выбран</b><p className="muted small">Создай диалог слева («+ Диалог») или выбери из списка.</p></div>
        )}
      </section>
      <aside className="st-right">
        <div className="st-insp-wrap">
          {!doc ? <div className="muted small" style={{ padding: 14 }}>Здесь будут свойства узла.</div>
            : node ? <NodeInspector id={sel.node} n={node} doc={doc} refs={refs} hp={hp} setNode={setNode} issues={issues.filter((x) => x.sel && x.sel.node === sel.node)}
              onDelete={() => delNode(sel.node)} onDup={() => dupNode(sel.node)} onStart={() => edit((d) => ({ ...d, start: sel.node }))} onRead={() => setSim({ from: sel.node })} />
              : sel && sel.edge && doc.nodes[sel.edge.from] ? <EdgeInspector e={sel.edge} doc={doc} hp={hp} onUnlink={() => { unlink(sel.edge); setSel(null); }} onPick={(id) => { setSel({ node: id }); setFocus({ id, n: Date.now() }); }} />
                : <DialogInspector doc={doc} edit={edit} refs={refs} hp={hp} issues={issues.filter((x) => !x.sel)} />}
        </div>
        {hintBox}
      </aside>
      {sim && doc && (
        <Simulator dialog={doc} from={sim.from} refs={refs} project={project} lists={lists} onClose={() => setSim(null)}
          onGoto={(id) => { setSim(null); setSel({ node: id }); setFocus({ id, n: Date.now() }); }} />
      )}
      {check && doc && (
        <Modal title={check === 'play' ? 'В диалоге есть ошибки' : 'Проверка диалога'} onClose={() => setCheck(false)}
          footer={<>{check === 'play' && <button className="btn" onClick={sendToGame}>Всё равно открыть</button>}<button className="btn primary" onClick={() => setCheck(false)}>Понятно</button></>}>
          <IssueRows issues={issues} onPick={(x) => { setCheck(false); if (x.sel && x.sel.node) { setSel({ node: x.sel.node }); setFocus({ id: x.sel.node, n: Date.now() }); } else setSel(null); }} />
        </Modal>
      )}
    </>
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

function NodeInspector({ id, n, doc, refs, hp, setNode, issues, onDelete, onDup, onStart, onRead }) {
  const def = NODE_DEFS[n.type] || { label: n.type, color: '#999', hint: '' };
  const set = (k, v) => setNode(id, (x) => { const c = { ...x }; if (v === undefined || v === null || v === '') delete c[k]; else c[k] = v; return c; }, k);
  const nodes = doc.nodes;
  return (
    <div className="st-insp">
      <InspHead color={def.color} title={def.label} sub={'узел ' + id + (doc.start === id ? ' · СТАРТ' : '')} hp={hp} hint={def.hint}>
        {n.type !== 'end' && <button className="btn sm ghost icon-btn" title="Прочитать отсюда как игрок" onClick={onRead}><Icon name="play" size={11} /></button>}
        {n.type !== 'end' && <button className="btn sm ghost icon-btn" title="Копия рядом (Ctrl+D)" onClick={onDup}><Icon name="copy" size={12} /></button>}
        <button className="btn sm danger icon-btn" title="Удалить узел (Delete)" onClick={onDelete}><Icon name="trash" size={12} /></button>
      </InspHead>
      <p className="st-insp-hint">{def.hint}</p>
      <IssuesMini list={issues} />
      {doc.start !== id && n.type !== 'end' && <button className="btn sm ghost st-self-start" onClick={onStart} {...hp('Сделать этот узел первым: разговор начнётся с него.')}>Сделать стартом</button>}
      <div className="st-fields">
        {n.type === 'line' && (<>
          <FieldRow label="Кто говорит" hp={hp} hint="Хозяин диалога — тот, с кем разговор (задаётся в настройках диалога). Игрок — реплика самого игрока. Или любой персонаж проекта." wide>
            <SpeakerPicker value={n.who || 'speaker'} onChange={(v) => set('who', v === 'speaker' ? undefined : v)} refs={refs} allowAny={false} allowSpeaker allowPlayer />
          </FieldRow>
          <FieldRow label="Текст" hp={hp} hint={'Что говорит. {player} — имя игрока, {var:имя} — значение переменной. До ' + TEXT_MAX + ' знаков — иначе раздели на две реплики.'} wide>
            <div className="st-col">
              <textarea className="input sm" rows={4} value={n.text || ''} onChange={(e) => set('text', e.target.value)} placeholder="Привет, {player}!" />
              <div className="row dl-subst">
                <button className="link-btn small" onClick={() => set('text', (n.text || '') + '{player}')} title="Вставить имя игрока">+ {'{player}'}</button>
                {(refs.vars || []).slice(0, 3).map((v) => <button key={v.name} className="link-btn small" onClick={() => set('text', (n.text || '') + '{var:' + v.name + '}')} title={'Вставить значение переменной ' + v.name}>+ {v.name}</button>)}
                <span className={'grow small st-count' + ((n.text || '').length > TEXT_MAX ? ' over' : '')}>{(n.text || '').length} / {TEXT_MAX}</span>
              </div>
            </div>
          </FieldRow>
          <FieldRow label="Текст (англ.)" hp={hp} hint="Необязательно: перевод для английского языка игры. Пусто — везде русский." wide>
            <input className="input sm" value={n.text_en || ''} onChange={(e) => set('text_en', e.target.value)} placeholder="необязательно" />
          </FieldRow>
          <FieldRow label="Лицо" hp={hp} hint="Выражение лица говорящего на этой реплике: smile — улыбка, sad — грусть, angry — злость. Пусто — как было.">
            <input className="input sm" list="sl-faces" value={n.face || ''} onChange={(e) => set('face', e.target.value.trim())} placeholder="как было" />
          </FieldRow>
          <FieldRow label="Движение" hp={hp} hint="Анимация на этой реплике: wave — помахать, nod — кивнуть, bow — поклон. Пусто — без движения.">
            <input className="input sm" list="sl-anims" value={n.anim || ''} onChange={(e) => set('anim', e.target.value.trim())} placeholder="нет" />
          </FieldRow>
          <FieldRow label="Дальше" hp={hp} hint="Какой узел после этой реплики. Проще — тянуть стрелку от кружка справа на карточке." wide>
            <NextSelect nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} />
          </FieldRow>
        </>)}
        {n.type === 'choice' && (<>
          <FieldRow label="Реплика перед выбором" hp={hp} hint="Необязательно: что говорит хозяин диалога над вариантами ответа (например вопрос). Пусто — сразу варианты." wide>
            <textarea className="input sm" rows={2} value={n.text || ''} onChange={(e) => set('text', e.target.value)} placeholder="необязательно" />
          </FieldRow>
          <Options n={n} id={id} nodes={nodes} refs={refs} hp={hp} setNode={setNode} />
        </>)}
        {n.type === 'cond' && (<>
          <FieldRow label="Если" hp={hp} hint="Что проверить. Все условия списка должны выполняться одновременно; для «или» добавь условие «Любое из»." wide>
            <CondList value={n.if} onChange={(l) => setNode(id, { if: l })} refs={refs} hp={hp} />
          </FieldRow>
          <FieldRow label="Если да →" hp={hp} hint="Куда идти, если всё выполняется (стрелка «да» на карточке)." wide><NextSelect nodes={nodes} value={n.then} self={id} onChange={(v) => set('then', v)} /></FieldRow>
          <FieldRow label="Если нет →" hp={hp} hint="Куда идти, если не выполняется (стрелка «нет»). Пусто — разговор закончится." wide><NextSelect nodes={nodes} value={n.else} self={id} onChange={(v) => set('else', v)} /></FieldRow>
        </>)}
        {n.type === 'action' && (<>
          <FieldRow label="Сделать" hp={hp} hint="Действия по порядку сверху вниз. Игрок их не видит — только результат (предмет в инвентаре, задание в журнале…)." wide>
            <ActionList value={n.do} onChange={(l) => setNode(id, { do: l })} refs={refs} hp={hp} />
          </FieldRow>
          <FieldRow label="Дальше" hp={hp} hint="Какой узел после действий." wide><NextSelect nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'scene' && (<>
          <FieldRow label="Сцена" hp={hp} hint="Какую катсцену проиграть (из вкладки «Сцены»)." wide><RefSelect list={refs.scenes} value={n.scene} onChange={(v) => set('scene', v)} /></FieldRow>
          <BoolRow label="Ждать конца сцены" hp={hp} hint="Да — разговор продолжится, когда сцена закончится. Нет — сразу дальше, сцена идёт фоном." value={n.wait} onChange={(v) => setNode(id, { wait: v })} />
          <FieldRow label="Дальше" hp={hp} hint="Какой узел после сцены. Пусто — разговор закончится." wide><NextSelect nodes={nodes} value={n.next} self={id} onChange={(v) => set('next', v)} /></FieldRow>
        </>)}
        {n.type === 'jump' && (<>
          <FieldRow label="Диалог" hp={hp} hint="В какой диалог перейти. Можно и в этот же — тогда выбери узел." wide><RefSelect list={refs.dialogs} value={n.dialog} onChange={(v) => setNode(id, { dialog: v || '', node: '' })} /></FieldRow>
          <FieldRow label="С какого узла" hp={hp} hint="С какого узла того диалога продолжить. Пусто — с его старта." wide>
            {(() => {
              const tgt = n.dialog === doc.id ? Object.keys(doc.nodes) : (((refs.dialogs || []).find((x) => x.id === n.dialog) || {}).nodes || []);
              return (
                <select className="input sm" value={n.node || ''} onChange={(e) => set('node', e.target.value)}>
                  <option value="">со старта</option>
                  {tgt.map((x) => <option key={x} value={x}>{x}</option>)}
                  {n.node && !tgt.includes(n.node) && <option value={n.node}>{n.node} (нет такого!)</option>}
                </select>
              );
            })()}
          </FieldRow>
        </>)}
        {n.type === 'end' && <p className="muted small">У конца нет настроек: сюда сходятся стрелки, и разговор закрывается.</p>}
      </div>
    </div>
  );
}

function Options({ n, id, nodes, refs, hp, setNode }) {
  const opts = n.options || [];
  const [openC, setOpenC] = useState({});
  const setOpt = (i, patch) => setNode(id, (x) => ({ ...x, options: (x.options || []).map((o, j) => (j === i ? (typeof patch === 'function' ? patch(o) : { ...o, ...patch }) : o)) }), 'o' + i + Object.keys(typeof patch === 'object' ? patch : {}).join());
  const move = (i, d) => setNode(id, (x) => { const c = (x.options || []).slice(); const j = i + d; if (j < 0 || j >= c.length) return x; [c[i], c[j]] = [c[j], c[i]]; return { ...x, options: c }; });
  return (
    <div className="dl-opts" {...hp('Варианты ответа игрока. У каждого — своя стрелка (кружок справа на карточке). Можно поставить условие: тогда вариант будет серым, пока условие не выполнено.')}>
      <div className="st-flabel">Варианты ответа <span className="st-q">?</span></div>
      {opts.map((o, i) => {
        const hasC = Array.isArray(o.when) && o.when.length > 0;
        const showC = openC[i] || hasC;
        const hasA = Array.isArray(o.do) && o.do.length > 0;
        return (
          <div key={i} className="dl-opt">
            <div className="row dl-opt-head">
              <span className="lg-num">{i + 1}</span>
              <input className="input sm grow" value={o.text || ''} placeholder="Что отвечает игрок" onChange={(e) => setOpt(i, { text: e.target.value })} />
              <button className="btn sm ghost icon-btn" title="Выше" disabled={!i} onClick={() => move(i, -1)}><Icon name="up" size={9} /></button>
              <button className="btn sm ghost icon-btn" title="Удалить вариант" onClick={() => setNode(id, (x) => ({ ...x, options: x.options.filter((_, j) => j !== i) }))}><Icon name="close" size={9} /></button>
            </div>
            <div className="dl-opt-row"><span className="small muted">→</span><NextSelect nodes={nodes} value={o.next} self={id} onChange={(v) => setOpt(i, (x) => { const c = { ...x }; if (v) c.next = v; else delete c.next; return c; })} /></div>
            {showC ? (
              <>
                <CondList value={o.when || []} onChange={(l) => setOpt(i, (x) => { const c = { ...x }; if (l.length) c.when = l; else delete c.when; return c; })} refs={refs} hp={hp} addLabel="+ условие варианта" />
                <input className="input sm" value={o.hint || ''} placeholder="подсказка (без неё вариант скрыт)" onChange={(e) => setOpt(i, (x) => { const c = { ...x }; if (e.target.value) c.hint = e.target.value; else delete c.hint; return c; })} {...hp('Когда условие не выполнено: если подсказка есть — вариант виден серым с этим текстом (например «Нужно 3 хлеба»); если подсказки нет — вариант в игре просто скрыт.')} />
              </>
            ) : <button className="link-btn small dl-more" onClick={() => { setOpenC({ ...openC, [i]: true }); setOpt(i, { when: [condDefault((refs.vars || []).length ? 'var' : 'item', refs)] }); }} {...hp('Показывать вариант доступным только при условии (например, есть хлеб в инвентаре).')}>+ условие, когда можно выбрать</button>}
            {hasA
              ? <div {...hp('Что произойдёт сразу, как игрок выбрал этот ответ — до перехода по стрелке. Например, забрать хлеб и записать bread_given.')}><div className="small muted">при выборе:</div><ActionList value={o.do} onChange={(l) => setOpt(i, (x) => { const c = { ...x }; if (l.length) c.do = l; else delete c.do; return c; })} refs={refs} hp={hp} /></div>
              : <button className="link-btn small dl-more" onClick={() => setOpt(i, { do: [{ xp: 5 }] })} {...hp('Действия сразу при выборе этого ответа: забрать предмет, записать переменную, начать задание…')}>+ действие при выборе</button>}
          </div>
        );
      })}
      <button className="btn sm ghost lg-add" onClick={() => setNode(id, (x) => ({ ...x, options: [...(x.options || []), { text: '' }] }))}>+ вариант ответа</button>
    </div>
  );
}

function EdgeInspector({ e, doc, hp, onUnlink, onPick }) {
  const n = doc.nodes[e.from];
  const out = nodeOutputs(n).find((o) => o.key === e.key);
  const t = getOut(n, e.key);
  return (
    <div className="st-insp">
      <InspHead color="#e9dcc6" title="Стрелка" sub={e.from + ' → ' + (t || '?')} hp={hp} hint="Стрелка показывает, куда идёт разговор дальше.">
        <button className="btn sm danger icon-btn" title="Убрать стрелку (Delete)" onClick={onUnlink}><Icon name="trash" size={12} /></button>
      </InspHead>
      <p className="st-insp-hint">Из «{(NODE_DEFS[n.type] || {}).label}» {e.from}{out ? ' (выход «' + out.label + '»)' : ''} в {t}. Чтобы перевести стрелку — потяни заново от кружка на карточке к другому узлу.</p>
      <div className="st-btns">
        <button className="btn sm" onClick={() => onPick(e.from)}>К началу стрелки</button>
        {doc.nodes[t] && <button className="btn sm" onClick={() => onPick(t)}>К концу стрелки</button>}
      </div>
    </div>
  );
}

function DialogInspector({ doc, edit, refs, hp, issues }) {
  const tr = doc.trigger || {};
  const setT = (k, v) => edit((d) => ({ ...d, trigger: { ...(d.trigger || {}), [k]: v } }), { key: 'tr:' + k });
  return (
    <div className="st-insp">
      <InspHead color="#e6b65c" title="Диалог" sub={doc.id + '.json · ' + Object.keys(doc.nodes || {}).length + ' узлов'} hp={hp} hint="Настройки всего диалога. Щёлкни по узлу в графе — здесь появятся его свойства." />
      <p className="st-insp-hint">Ничего не выбрано — это настройки всего диалога: кто говорит и когда разговор открывается.</p>
      <IssuesMini list={issues} />
      <div className="st-fields">
        <FieldRow label="Название" hp={hp} hint="Для тебя: так диалог виден в списке. Игроки не видят."><input className="input sm" value={doc.title || ''} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), { key: 'title' })} /></FieldRow>
        <FieldRow label="Кто говорит" hp={hp} hint="Хозяин диалога: персонаж проекта, житель долины по номеру, сущность с таким именем — или «любой житель» (тогда обязательно поставь условие запуска)." wide>
          <SpeakerPicker value={doc.speaker} onChange={(v) => edit((d) => ({ ...d, speaker: v }), { key: 'speaker' })} refs={refs} allowAny />
        </FieldRow>
        <FieldRow label="Когда открывается" hp={hp} hint={TRIGGER_OPTS.map((x) => x[1] + ' — ' + x[2]).join(' ')} wide>
          <select className="input sm" value={tr.on || 'talk'} onChange={(e) => setT('on', e.target.value)}>{TRIGGER_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </FieldRow>
        <FieldRow label="Условия запуска" hp={hp} hint="Диалог откроется, только если всё это выполняется. Например: задание «Хлеб» идёт, или met_miron = нет. Пусто — всегда." wide>
          <CondList value={tr.when || []} onChange={(l) => setT('when', l)} refs={refs} hp={hp} emptyText="Нет условий — откроется всегда." />
        </FieldRow>
        {(tr.on || 'talk') === 'talk' && (
          <FieldRow label="Тема" hp={hp} hint={'Короткая тема в разговоре с жителем, например «Про мельницу». Если важность диалога не выше важности обычных разговоров (в проекте: ' + (refs.talkPriority || 0) + '), диалог не перебивает их, а появляется темой в списке.'} wide>
            <input className="input sm" value={tr.topic || ''} placeholder="например: Про мельницу" onChange={(e) => setT('topic', e.target.value || undefined)} />
          </FieldRow>
        )}
        <BoolRow label="Только один раз" hp={hp} hint="После первого прочтения этот диалог у игрока больше не откроется сам (из сцены и командой — можно)." value={tr.once} onChange={(v) => setT('once', v)} />
        <FieldRow label="Важность" hp={hp} hint={'Если у жителя подходит несколько разговоров — откроется самый важный. Важнее обычных разговоров жителей (в проекте: ' + (refs.talkPriority || 0) + ', меняется во вкладке «Переменные» → «Проект») — диалог откроется сразу; не важнее — станет темой в списке.'}>
          <input className="input sm st-num" type="number" value={tr.priority == null ? 10 : tr.priority} onChange={(e) => setT('priority', Math.round(Number(e.target.value) || 0))} />
        </FieldRow>
        <FieldRow label="Старт" hp={hp} hint="С какого узла начинается разговор. Его карточка помечена «СТАРТ»." wide>
          <select className="input sm" value={doc.start || ''} onChange={(e) => edit((d) => ({ ...d, start: e.target.value }))}>
            {!doc.start && <option value="">— выбери —</option>}
            {Object.keys(doc.nodes || {}).filter((k) => doc.nodes[k].type !== 'end').map((k) => <option key={k} value={k}>{k} · {(NODE_DEFS[doc.nodes[k].type] || {}).label}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Заметка" hp={hp} hint="Любой комментарий для себя." wide><textarea className="input sm" rows={2} value={doc.note || ''} onChange={(e) => edit((d) => ({ ...d, note: e.target.value }), { key: 'note' })} /></FieldRow>
      </div>
      <p className="muted small">Где используется: сцены событием «Открыть диалог», задания шагом «Поговорить», другие диалоги «Переходом», команда <span className="mono">/vkokk studio dialog {doc.id}</span>.</p>
    </div>
  );
}
