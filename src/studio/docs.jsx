// Общее для диалогов и заданий: открыть / сохранить сам / отменить правку, и список файлов слева.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { isDocId } from './validate.js';
import { slug, uniqueId } from './model.js';

// kind: 'dialogs' | 'quests'
export function useDocEditor(kind, { toast, prepare, onSaved }) {
  const [doc, setDocState] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [, force] = useState(0);
  const docRef = useRef(null);
  const hist = useRef({ past: [], future: [], key: null, at: 0 });
  const dirty = useRef(false);
  const timer = useRef(null);
  const savedCb = useRef(onSaved);
  savedCb.current = onSaved;
  const setDoc = (d) => { docRef.current = d; setDocState(d); };

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const d = docRef.current;
    if (!d || !dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await call('studio:docSave', { kind, doc: d });
      setSaveState(dirty.current ? 'dirty' : 'saved');
      if (savedCb.current) savedCb.current(d);
    } catch (e) { dirty.current = true; setSaveState('error'); toast('Не сохранилось: ' + e.message, 'error', 8000); }
  }, [kind, toast]);
  const markDirty = () => {
    dirty.current = true;
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };
  // opt.key — слить подряд идущие правки одного поля; opt.silent — без истории (перетаскивание)
  const edit = useCallback((fn, opt = {}) => {
    const prev = docRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (!next || next === prev) return;
    const h = hist.current;
    if (!opt.silent) {
      const now = Date.now();
      if (!(opt.key && opt.key === h.key && now - h.at < 1500)) { h.past.push(prev); if (h.past.length > 300) h.past.shift(); }
      h.key = opt.key || null; h.at = now; h.future = [];
    }
    setDoc(next);
    markDirty();
  }, []); // eslint-disable-line
  const gesture = useCallback(() => { const h = hist.current; h.past.push(docRef.current); h.future = []; h.key = null; }, []);
  const undo = () => { const h = hist.current; if (!h.past.length) return; h.future.push(docRef.current); setDoc(h.past.pop()); h.key = null; markDirty(); force((n) => n + 1); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; h.past.push(docRef.current); setDoc(h.future.pop()); h.key = null; markDirty(); force((n) => n + 1); };

  const open = useCallback(async (id) => {
    await flush();
    try {
      const raw = await call('studio:docRead', { kind, id });
      hist.current = { past: [], future: [], key: null, at: 0 };
      setDoc(prepare ? prepare(raw, id) : raw);
      return true;
    } catch (e) { toast(e.message, 'error', 8000); return false; }
  }, [flush, kind, toast, prepare]);
  const close = () => { setDoc(null); dirty.current = false; };

  useEffect(() => () => { flush(); }, []); // eslint-disable-line
  return { doc, docRef, edit, gesture, undo, redo, canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0, flush, open, close, saveState };
}

export const SAVE_TEXT = { saved: 'Сохранено', dirty: 'Есть правки…', saving: 'Сохраняю…', error: 'Не сохранилось!' };

// Список файлов (диалогов / заданий) с созданием, переименованием, копией и удалением.
export function DocList({ kind, list, cur, open, create, reload, flush, onRenamed, onDeleted, hp, toast, L, sub }) {
  const [adding, setAdding] = useState(null);
  const [ed, setEd] = useState(null);
  const [sure, setSure] = useState(null);
  const [q, setQ] = useState('');
  const submitEdit = async (e) => {
    e.preventDefault();
    const { mode, id, title, newId } = ed;
    if (!isDocId(newId)) { toast('id — маленькие латинские буквы, цифры, _ и -', 'error'); return; }
    try {
      await flush();
      if (mode === 'rename') {
        if (newId !== id) {
          const r = await call('studio:docRename', { kind, from: id, to: newId, title });
          if (r && r.refs) toast('Ссылки поправлены в файлах: ' + r.refs, 'ok', 4000);
        } else {
          const d = await call('studio:docRead', { kind, id });
          await call('studio:docSave', { kind, doc: { ...d, title } });
        }
      } else await call('studio:docDuplicate', { kind, from: id, to: newId, title });
      setEd(null);
      await reload();
      onRenamed(newId);
    } catch (er) { toast(er.message, 'error'); }
  };
  const shown = q.trim() ? list.filter((x) => (x.title + ' ' + x.id).toLowerCase().includes(q.trim().toLowerCase())) : list;
  return (
    <div className="st-card st-grow">
      <div className="st-card-head" {...hp(L.hint)}>
        <b>{L.title}</b><span className="muted small">{list.length}</span><div className="grow" />
        <button className="btn sm ghost" onClick={() => setAdding(adding == null ? '' : null)} {...hp(L.addHint)}><Icon name="plus" size={11} /> {L.add}</button>
      </div>
      {adding != null && (
        <form className="st-mini-form" onSubmit={(e) => { e.preventDefault(); if (!adding.trim()) return; create(adding.trim()); setAdding(null); }}>
          <input className="input sm" autoFocus placeholder={L.placeholder} value={adding} onChange={(e) => setAdding(e.target.value)} />
          <div className="row"><span className="muted small mono grow">{adding.trim() ? uniqueId(slug(adding, kind === 'quests' ? 'quest' : 'dialog'), list.map((x) => x.id)) + '.json' : ''}</span><button className="btn sm primary">Создать</button></div>
        </form>
      )}
      {list.length > 7 && <input className="input sm" placeholder="Найти…" value={q} onChange={(e) => setQ(e.target.value)} {...hp('Поиск по названию и id.')} />}
      <div className="st-list">
        {list.length === 0 && adding == null && <div className="muted small st-pad">{L.empty}</div>}
        {shown.map((x) => ed && ed.id === x.id ? (
          <form key={x.id} className="st-mini-form" onSubmit={submitEdit}>
            <span className="small muted">{ed.mode === 'rename' ? 'Переименовать' : 'Копия'}</span>
            <input className="input sm" autoFocus value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} title="Название" />
            <input className="input sm mono" value={ed.newId} onChange={(e) => setEd({ ...ed, newId: e.target.value.toLowerCase() })} title="id — имя файла: латиница, цифры, _ и -. Ссылки на него в других файлах поправятся сами." />
            <div className="row"><button className="btn sm primary">OK</button><button type="button" className="btn sm ghost" onClick={() => setEd(null)}>Отмена</button></div>
          </form>
        ) : (
          <div key={x.id} className={'st-item' + (cur === x.id ? ' on' : '') + (x.broken ? ' broken' : '')} onClick={() => cur !== x.id && open(x.id)} title={x.broken ? 'Файл не читается: ' + x.broken : x.id + '.json'}>
            <div className="st-item-text">
              <span className="st-item-title">{x.title || x.id}</span>
              <span className="muted small mono">{sub(x)}</span>
            </div>
            <div className="st-item-act" onClick={(e) => e.stopPropagation()}>
              <button className="btn sm ghost icon-btn" title="Переименовать" onClick={() => setEd({ mode: 'rename', id: x.id, title: x.title, newId: x.id })}><Icon name="pencil" size={10} /></button>
              <button className="btn sm ghost icon-btn" title="Сделать копию" onClick={() => setEd({ mode: 'dup', id: x.id, title: (x.title || x.id) + ' (копия)', newId: uniqueId(x.id + '_copy', list.map((l) => l.id)) })}><Icon name="copy" size={10} /></button>
              {sure === x.id
                ? <button className="btn sm danger" onClick={async () => { setSure(null); try { await call('studio:docDelete', { kind, id: x.id }); onDeleted(x.id); await reload(); toast('Удалено (копия лежит в studio/.trash)', 'ok'); } catch (e) { toast(e.message, 'error'); } }}>Точно?</button>
                : <button className="btn sm ghost icon-btn" title="Удалить (файл уйдёт в studio/.trash)" onClick={() => { setSure(x.id); setTimeout(() => setSure((s) => (s === x.id ? null : s)), 4000); }}><Icon name="trash" size={10} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IssuesMini({ list, max = 4 }) {
  if (!list || !list.length) return null;
  return (
    <div className="st-issues-mini">
      {list.slice(0, max).map((x, i) => <div key={i} className={'st-iss ' + (x.sev === 'ошибка' ? 'e' : 'w')}>{x.msg}</div>)}
      {list.length > max && <div className="muted small">…и ещё {list.length - max}</div>}
    </div>
  );
}

const KIND_RU = { scene: 'сцена', dialog: 'диалог', quest: 'задание', vars: 'переменные', project: 'проект' };
// список ошибок/предупреждений; щёлкнешь — выберется место
export function IssueRows({ issues, onPick, showDoc }) {
  if (!issues.length) return <p className="muted"><Icon name="check" size={12} /> Ошибок и предупреждений нет.</p>;
  const sorted = issues.slice().sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'ошибка' ? -1 : 1));
  return (
    <div className="st-issues">
      {sorted.map((x, i) => (
        <button key={i} className={'st-iss-row ' + (x.sev === 'ошибка' ? 'e' : 'w')} onClick={() => onPick(x)} title="Щёлкни — выберется место ошибки">
          <span className="st-sev">{x.sev}</span>
          {showDoc && (x.doc || x.scene || x.kind) && <span className="mono small muted st-iss-doc">{KIND_RU[x.kind || 'scene'] || ''}{(x.doc || x.scene) ? ' ' + (x.doc || x.scene) : ''}</span>}
          <span className="grow">{x.msg}</span>
        </button>
      ))}
    </div>
  );
}
