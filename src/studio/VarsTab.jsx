// Вкладка «Переменные»: таблица переменных сюжета проекта (project.json → vars),
// где каждая используется, и живые значения из игры.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { NumInput } from './fields.jsx';
import { IssuesMini } from './docs.jsx';
import { validateVars, VAR_TYPES, varDefault, isVarName, ERR } from './validate.js';
import { valText } from './dialog.js';

const TYPE_RU = { bool: 'да / нет', int: 'число', text: 'текст' };
const TYPE_HINT = 'Да/нет — флажок (встретил Мирона?). Число — счётчик (сколько хлеба отдал, доверие). Текст — слово (имя выбранного спутника).';
const KIND_RU = { scenes: 'сцена', dialogs: 'диалог', quests: 'задание' };

function convert(v, type) {
  if (type === 'bool') return v === true || v === 'true' || v === 'да' || (typeof v === 'number' && v !== 0);
  if (type === 'int') { const n = Math.round(Number(v)); return isFinite(n) ? n : 0; }
  return v == null ? '' : typeof v === 'boolean' ? (v ? 'да' : 'нет') : String(v);
}

export default function VarsTab({ shared, goto }) {
  const { tabs, linkCard, hintBox, buildBtn, toast, hp, link, project, saveProject, reloadList, gameVars, setGameVars, openDoc } = shared;
  const [rows, setRows] = useState(() => (project.vars || []).map((v) => ({ ...v })));
  const [usage, setUsage] = useState({});
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const timer = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const loadUsage = () => call('studio:varUsage').then((u) => setUsage(u || {})).catch(() => {});
  useEffect(() => { loadUsage(); }, []);
  useEffect(() => { if (goto && goto.kind === 'vars' && goto.sel && goto.sel.v != null) setSel(goto.sel.v); }, [goto]);
  const persist = (next) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveProject({ ...project, vars: next }), 500);
  };
  useEffect(() => () => { clearTimeout(timer.current); if (JSON.stringify(rowsRef.current) !== JSON.stringify(project.vars || [])) saveProject({ ...project, vars: rowsRef.current }); }, []); // eslint-disable-line
  const update = (fn) => setRows((r) => { const n = fn(r); persist(n); return n; });
  const setRow = (i, patch) => update((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const issues = useMemo(() => validateVars({ vars: rows }), [rows]);
  const rowIssues = (i) => issues.filter((x) => x.sel && x.sel.v === i);
  const declared = new Set(rows.map((r) => r.name));
  const undeclared = Object.keys(usage).filter((n) => !declared.has(n)).sort();

  const add = (name = '', type = 'bool') => {
    let nm = name;
    if (!nm) { let k = rows.length + 1; nm = 'var_' + k; while (declared.has(nm)) nm = 'var_' + ++k; }
    update((r) => [...r, { name: nm, type, init: varDefault(type), note: '' }]);
    setSel(rows.length);
  };
  const rename = async (i, to) => {
    const from = rows[i].name;
    if (to === from) return;
    if (!isVarName(to)) { toast('Имя переменной — латиница, цифры, _ . -', 'error'); return; }
    if (rows.some((r, j) => j !== i && r.name === to)) { toast('Такая переменная уже есть', 'error'); return; }
    const used = (usage[from] || []).length;
    setRow(i, { name: to });
    if (used && window.confirm('Переменная «' + from + '» используется в ' + used + ' файл(ах). Переименовать её и там?')) {
      try {
        const r = await call('studio:renameVar', { from, to });
        toast('Переименовано, поправлено файлов: ' + (r ? r.refs : 0), 'ok');
        reloadList('dialogs'); reloadList('quests'); reloadList('scenes');
      } catch (e) { toast(e.message, 'error'); }
    }
    loadUsage();
  };
  const fromGame = async () => {
    if (!link.connected) { toast('Нет связи с игрой', 'warn'); return; }
    setBusy(true);
    try { const m = await call('studio:vars'); setGameVars(m && m.data !== undefined ? m.data : m); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const live = gameVars ? (gameVars.vars && typeof gameVars.vars === 'object' ? gameVars.vars : gameVars) : null;
  const liveQuests = gameVars && gameVars.quests && typeof gameVars.quests === 'object' ? gameVars.quests : null;
  const shown = rows.map((r, i) => [r, i]).filter(([r]) => !q.trim() || (r.name + ' ' + (r.note || '')).toLowerCase().includes(q.trim().toLowerCase()));
  const cur = sel != null ? rows[sel] : null;

  return (
    <>
      <div className="st-top">
        {tabs}
        <span className="muted small st-vars-sum">{rows.length} переменных · сохраняется само в project.json</span>
        <div className="grow" />
        <button className={'btn sm' + (busy ? ' busy' : '')} onClick={fromGame} {...hp('Спросить у игры, какие значения переменных у тебя сейчас (и на каком шаге задания). Нужна связь с игрой. Значения появятся в столбце «В игре».')}><Icon name="eye" size={12} /> Посмотреть в игре</button>
        {buildBtn}
      </div>
      <aside className="st-left">
        {linkCard}
        <div className="st-card st-grow vt-help" {...hp('Переменные — память сюжета. Их записывают сцены (событие «Переменная»), диалоги и задания (действие «Записать переменную»), а проверяют — условия.')}>
          <b>Что это</b>
          <p className="small muted">Переменные — это память сюжета для каждого игрока: «встретил Мирона», «сколько хлеба отдал», «кого выбрал в спутники».</p>
          <p className="small muted"><b>Записывают:</b> сцены (событие «Переменная»), диалоги и задания (действие «Записать / Прибавить»).</p>
          <p className="small muted"><b>Проверяют:</b> условия в диалогах и заданиях. В тексте реплики — <span className="mono">{'{var:имя}'}</span>.</p>
          <p className="small muted">Начальное значение — то, что у игрока до любых событий.</p>
        </div>
      </aside>
      <section className="st-center">
        <div className="vt card-ish">
          <div className="tl-bar">
            <button className="btn sm primary" onClick={() => add()} {...hp('Завести новую переменную. Имя — латиницей, коротко и понятно: met_miron, bread_given.')}><Icon name="plus" size={11} /> Переменная</button>
            <input className="input sm vt-find" placeholder="Найти…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="grow" />
            <span className="muted small tl-tip">Имя меняется по Enter — ссылки в файлах можно поправить сразу</span>
          </div>
          <div className="vt-scroll">
            <table className="vt-table">
              <thead>
                <tr>
                  <th {...hp('Имя латиницей: буквы, цифры, _ . - . По нему переменную находят условия и действия.')}>Имя</th>
                  <th {...hp(TYPE_HINT)}>Тип</th>
                  <th {...hp('Значение у игрока, пока сюжет его не поменял.')}>Начальное</th>
                  <th {...hp('Заметка для себя: что значит эта переменная.')}>Заметка</th>
                  <th {...hp('Сколько файлов (сцен, диалогов, заданий) пишут или читают переменную. Щёлкни по строке — список справа.')}>Где</th>
                  <th {...hp('Значение у тебя в игре сейчас — нажми «Посмотреть в игре».')}>В игре</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="muted small vt-empty">Переменных пока нет. «+ Переменная» — завести первую.</td></tr>}
                {shown.map(([r, i]) => {
                  const ri = rowIssues(i);
                  const u = usage[r.name] || [];
                  const lv = live && r.name in live ? live[r.name] : undefined;
                  return (
                    <tr key={i} className={(sel === i ? 'on ' : '') + (ri.some((x) => x.sev === ERR) ? 'bad' : '')} onClick={() => setSel(i)}>
                      <td><NameCell value={r.name} onCommit={(v) => rename(i, v)} /></td>
                      <td>
                        <select className="input sm" value={r.type} onChange={(e) => setRow(i, { type: e.target.value, init: convert(r.init, e.target.value) })} {...hp(TYPE_HINT)}>
                          {VAR_TYPES.map((t) => <option key={t} value={t}>{TYPE_RU[t]}</option>)}
                        </select>
                      </td>
                      <td>
                        {r.type === 'bool'
                          ? <select className="input sm" value={r.init ? 'true' : 'false'} onChange={(e) => setRow(i, { init: e.target.value === 'true' })}><option value="false">нет</option><option value="true">да</option></select>
                          : r.type === 'int'
                            ? <NumInput value={typeof r.init === 'number' ? r.init : 0} int onChange={(n) => setRow(i, { init: n || 0 })} />
                            : <input className="input sm" value={r.init == null ? '' : String(r.init)} onChange={(e) => setRow(i, { init: e.target.value })} />}
                      </td>
                      <td><input className="input sm" value={r.note || ''} placeholder="что это" onChange={(e) => setRow(i, { note: e.target.value })} /></td>
                      <td className="vt-use" title={u.map((x) => KIND_RU[x.kind] + ': ' + x.title).join('\n')}>{u.length ? <span className="qe-chip">{u.length}</span> : <span className="muted small">—</span>}</td>
                      <td className="vt-live">{lv === undefined ? <span className="muted small">{live ? 'нет' : '—'}</span> : <b className={lv !== r.init ? 'ch' : ''}>{valText(lv)}</b>}</td>
                      <td><button className="btn sm ghost icon-btn" title="Удалить переменную" onClick={(e) => { e.stopPropagation(); if (!u.length || window.confirm('«' + r.name + '» используется в ' + u.length + ' файл(ах) — там появятся предупреждения. Удалить?')) { update((x) => x.filter((_, j) => j !== i)); setSel(null); } }}><Icon name="trash" size={10} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {undeclared.length > 0 && (
              <div className="vt-undecl" {...hp('Эти имена встречаются в сценах, диалогах или заданиях, но в таблице их нет — значит, у них нет типа и начального значения. «Завести» — добавить в таблицу.')}>
                <b className="small">Используются, но не заведены:</b>
                {undeclared.map((n) => <span key={n} className="qe-chip"><span className="mono">{n}</span> <button className="link-btn small" onClick={() => add(n, 'bool')}>завести</button></span>)}
              </div>
            )}
          </div>
        </div>
      </section>
      <aside className="st-right">
        <div className="st-insp-wrap">
          <div className="st-insp">
            {cur ? (
              <>
                <div className="st-insp-head"><Icon name="gear" size={16} /><div className="grow"><b className="mono">{cur.name}</b><div className="muted small">{TYPE_RU[cur.type] || cur.type} · начальное {valText(cur.init)}</div></div></div>
                <IssuesMini list={rowIssues(sel)} />
                <div className="st-flabel">Где используется</div>
                {(usage[cur.name] || []).length === 0 && <p className="muted small">Пока нигде. Запиши её действием в диалоге или событием «Переменная» в сцене, проверь — условием.</p>}
                <div className="st-col">
                  {(usage[cur.name] || []).map((x) => (
                    <button key={x.kind + x.id} className="vt-ref" onClick={() => openDoc(x.kind, x.id)} title="Открыть">
                      <span className="qe-chip">{KIND_RU[x.kind]}</span> {x.title}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="st-insp-head"><Icon name="gear" size={16} /><div className="grow"><b>Переменные</b><div className="muted small">project.json</div></div></div>
                <p className="st-insp-hint">Щёлкни по строке таблицы — здесь будет видно, какие сцены, диалоги и задания её используют.</p>
                <IssuesMini list={issues} max={6} />
              </>
            )}
            {liveQuests && Object.keys(liveQuests).length > 0 && (
              <>
                <div className="st-flabel" style={{ marginTop: 10 }}>Задания в игре</div>
                {Object.entries(liveQuests).map(([id, st]) => <div key={id} className="sim-row now"><span className="mono">{id}</span><b>{typeof st === 'object' ? (st.state || '') + (st.step ? ' · ' + st.step : '') : String(st)}</b></div>)}
              </>
            )}
          </div>
        </div>
        {hintBox}
      </aside>
    </>
  );
}

function NameCell({ value, onCommit }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return <input className="input sm mono" value={v} spellCheck={false} onChange={(e) => setV(e.target.value.replace(/\s+/g, '_'))} onBlur={() => (v.trim() && v !== value ? onCommit(v.trim()) : setV(value || ''))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}
