// «Прочитать как игрок»: диалог читается без игры. Слева — разговор, справа — выдуманный мир
// (переменные, задания, предметы, доверие, память, время суток). Поменял мир — разговор сам переигрывается
// с теми же ответами, так сразу видно, куда поведёт другая ветка.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/ui.jsx';
import { NumInput } from './fields.jsx';
import { ValueInput } from './logic.jsx';
import { freshWorld, evalCond, evalConds, applyAction, substitute, whoName, speakerName, condText, docTitle, isEndRef, valText, NODE_DEFS } from './dialog.js';

const LS = 'studio.simWorld';
const loadWorld = (project) => { try { return freshWorld(project, JSON.parse(localStorage.getItem(LS) || 'null')); } catch (_) { return freshWorld(project, null); } };
const saveWorld = (w) => { try { const { _rng, ...rest } = w; localStorage.setItem(LS, JSON.stringify(rest)); } catch (_) {} };

function rng(seed) { // mulberry32 — чтобы «случайно» повторялось при переигрывании
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function evalW(c, w) { // evalCond, но шанс — из повторяемого генератора
  if (c && 'chance' in c && w.chance === 'random') return w._rng() < (c.chance || 0);
  if (c && c.not) return !evalW(c.not, w);
  if (c && Array.isArray(c.any)) return c.any.some((x) => evalW(x, w));
  return evalCond(c, w);
}
const evalAll = (list, w) => (list || []).every((c) => evalW(c, w));

async function runFrom(d0, id0, w0, ctx) {
  let d = d0, id = id0, w = w0;
  const out = [];
  for (let guard = 0; ; guard++) {
    if (guard > 200) { out.push({ k: 'err', t: 'Больше 200 шагов подряд без игрока — похоже на бесконечный круг.' }); return { out, wait: 'end', d, w }; }
    if (!id) { out.push({ k: 'end', t: 'Стрелки дальше нет — разговор закончился.' }); return { out, wait: 'end', d, w }; }
    const n = d.nodes[id];
    if (!n) {
      if (isEndRef(id, d.nodes)) { out.push({ k: 'end' }); return { out, wait: 'end', d, w }; }
      out.push({ k: 'err', t: 'Стрелка ведёт к узлу «' + id + '», которого нет.' });
      return { out, wait: 'end', d, w };
    }
    const at = { node: id, dlg: d.id };
    const spk = speakerName(d.speaker, ctx.refs);
    switch (n.type) {
      case 'line':
        out.push({ k: 'line', ...at, who: n.who === 'player' ? w.player : whoName(n.who, { ...ctx.refs, speakerName: spk }), me: n.who === 'player', text: substitute(n.text, w), face: n.face, anim: n.anim });
        return { out, wait: 'next', next: n.next || null, d, w };
      case 'choice': {
        if (n.text) out.push({ k: 'line', ...at, who: spk, text: substitute(n.text, w) });
        const opts = (n.options || []).map((o) => ({ text: substitute(o.text, w), ok: evalAll(o.when, w), hint: o.hint, why: (o.when || []).filter((c) => !evalW(c, { ...w, _rng: rng(1) })).map((c) => condText(c, ctx.refs)), next: o.next || null }));
        if (!opts.some((o) => o.ok)) out.push({ k: 'err', ...at, t: 'Ни один вариант не доступен — в игре игрок тут застрянет!' });
        return { out, wait: 'choice', opts, node: id, d, w };
      }
      case 'cond': {
        const ok = evalAll(n.if, w);
        out.push({ k: 'sys', ...at, t: 'Условие «' + (n.if || []).map((c) => condText(c, ctx.refs)).join(' и ') + '» → ' + (ok ? 'да' : 'нет') });
        id = ok ? n.then : n.else;
        continue;
      }
      case 'action':
        for (const a of n.do || []) { const [w2, t] = applyAction(a, w, ctx.refs); w = w2; out.push({ k: 'act', ...at, t }); }
        id = n.next;
        continue;
      case 'scene':
        out.push({ k: 'sys', ...at, t: '▶ Сцена «' + (docTitle(ctx.refs.scenes, n.scene) || '?') + '»' + (n.wait ? ' — разговор ждёт её конца' : ' — разговор идёт дальше сразу') });
        id = n.next;
        continue;
      case 'jump': {
        let d2 = n.dialog === d.id ? d : ctx.cache[n.dialog];
        if (!d2 && n.dialog) { try { d2 = await call('studio:docRead', { kind: 'dialogs', id: n.dialog }); ctx.cache[n.dialog] = d2; } catch (_) { d2 = null; } }
        if (!d2 || !d2.nodes) { out.push({ k: 'err', ...at, t: 'Переход: диалог «' + (n.dialog || '?') + '» не найден.' }); return { out, wait: 'end', d, w }; }
        out.push({ k: 'sys', ...at, t: '↪ Переход в диалог «' + (d2.title || d2.id) + '»' + (n.node ? ', узел ' + n.node : '') });
        d = d2;
        id = n.node || d2.start;
        continue;
      }
      case 'end': out.push({ k: 'end', ...at }); return { out, wait: 'end', d, w };
      default: out.push({ k: 'err', ...at, t: 'Неизвестный узел «' + n.type + '».' }); return { out, wait: 'end', d, w };
    }
  }
}

async function replay(dialog, from, world0, picks, seed, ctx) {
  let r = await runFrom(dialog, from || dialog.start, { ...world0, _rng: rng(seed) }, ctx);
  const entries = [...r.out];
  let used = 0;
  while (r.wait !== 'end' && used < picks.length) {
    const p = picks[used];
    if (r.wait === 'next') r = await runFrom(r.d, r.next, r.w, ctx);
    else {
      const o = r.opts[p];
      if (!o || !o.ok) break;
      entries.push({ k: 'pick', text: o.text, node: r.node, dlg: r.d.id });
      r = await runFrom(r.d, o.next, r.w, ctx);
    }
    used++;
    entries.push(...r.out);
  }
  return { entries, r, used };
}

export default function Simulator({ dialog, from, refs, project, lists, onClose, onGoto }) {
  const [start, setStart] = useState(() => loadWorld(project));
  const [picks, setPicks] = useState([]);
  const [seed, setSeed] = useState(() => Date.now() & 0xffff);
  const [res, setRes] = useState(null);
  const [side, setSide] = useState('start');
  const cache = useRef({});
  const logRef = useRef(null);
  const ctx = useMemo(() => ({ refs, cache: cache.current }), [refs]);

  useEffect(() => {
    let alive = true;
    replay(dialog, from, start, picks, seed, ctx).then((r) => {
      if (!alive) return;
      setRes(r);
      if (r.used < picks.length) setPicks(picks.slice(0, r.used)); // ветка изменилась — лишние ответы отбросить
    });
    return () => { alive = false; };
  }, [dialog, from, start, picks, seed, ctx]);
  useEffect(() => { saveWorld(start); }, [start]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [res]);

  const r = res && res.r;
  const pick = (i) => setPicks((p) => [...p, i]);
  useEffect(() => {
    const k = (e) => {
      if (!r || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (r.wait === 'next' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(0); }
      if (r.wait === 'choice' && /^[1-9]$/.test(e.key)) { const i = Number(e.key) - 1; if (r.opts[i] && r.opts[i].ok) pick(i); }
      if (e.key === 'Backspace') { e.preventDefault(); setPicks((p) => p.slice(0, -1)); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const trig = dialog.trigger || {};
  const trigOk = evalConds((trig.when || []).filter((c) => !('chance' in c)), start);
  const now = r ? r.w : start;
  const setW = (patch) => setStart((w) => ({ ...w, ...patch }));
  const varsList = [...((project && project.vars) || []).filter((v) => v && v.name)];
  for (const k of Object.keys(now.vars || {})) if (!varsList.some((v) => v.name === k)) varsList.push({ name: k, type: null, extra: true });

  return (
    <Modal wide title={'Прочитать как игрок — ' + (dialog.title || dialog.id)} onClose={onClose}
      footer={<>
        <span className="muted small grow">Enter — дальше · 1…9 — ответ · Backspace — шаг назад. Мир справа сохраняется до следующего раза.</span>
        <button className="btn" onClick={() => setPicks((p) => p.slice(0, -1))} disabled={!picks.length}><Icon name="undo" size={12} /> Шаг назад</button>
        <button className="btn" onClick={() => { setPicks([]); setSeed((s) => (s * 7 + 13) & 0xffff); }}><Icon name="refresh" size={12} /> Сначала</button>
        <button className="btn primary" onClick={onClose}>Закрыть</button>
      </>}>
      <div className="sim">
        <div className="sim-main">
          <div className={'sim-trig ' + (trigOk ? 'ok' : 'no')}>
            {(trig.when || []).length
              ? (trigOk ? '✓ Условия запуска выполнены — в игре диалог откроется' : '✕ Условия запуска НЕ выполнены — в игре этот диалог сейчас не откроется (читаем всё равно)')
              : 'Условий запуска нет — откроется всегда'}
            {from && from !== dialog.start ? <span className="muted"> · читаем с узла {from}</span> : null}
          </div>
          <div className="sim-log" ref={logRef}>
            {!res && <div className="muted small">Читаю…</div>}
            {res && res.entries.map((e, i) => <Entry key={i} e={e} onGoto={e.dlg === dialog.id ? onGoto : null} />)}
          </div>
          <div className="sim-act">
            {r && r.wait === 'next' && <button className="btn primary" autoFocus onClick={() => pick(0)}>Дальше ▸</button>}
            {r && r.wait === 'choice' && (
              <div className="sim-opts">
                {r.opts.map((o, i) => (
                  <button key={i} className={'sim-opt' + (o.ok ? '' : ' off')} disabled={!o.ok} onClick={() => pick(i)}
                    title={o.ok ? 'Выбрать (клавиша ' + (i + 1) + ')' : 'Недоступно: ' + o.why.join(', ')}>
                    <span className="sim-n">{i + 1}</span>
                    <span className="grow">{o.text || '…'}{!o.next && <em className="muted"> (никуда не ведёт)</em>}</span>
                    {!o.ok && <small>{o.hint || 'нужно: ' + o.why.join(', ')}</small>}
                  </button>
                ))}
              </div>
            )}
            {r && r.wait === 'end' && <button className="btn" onClick={() => { setPicks([]); setSeed((s) => (s * 7 + 13) & 0xffff); }}><Icon name="refresh" size={12} /> Прочитать снова</button>}
          </div>
        </div>
        <div className="sim-side">
          <div className="seg sm">
            <button className={side === 'start' ? 'on' : ''} onClick={() => setSide('start')} title="Каким был мир до разговора — меняй, и разговор переиграется">Мир до разговора</button>
            <button className={side === 'now' ? 'on' : ''} onClick={() => setSide('now')} title="Что стало после действий диалога">Сейчас</button>
          </div>
          {side === 'now' ? <WorldNow w={now} w0={start} refs={refs} /> : (
            <div className="sim-world">
              <div className="sim-row"><span>Игрок</span><input className="input sm" value={start.player} onChange={(e) => setW({ player: e.target.value })} title="Имя для {player}" /></div>
              <div className="sim-row"><span>Время</span>
                <select className="input sm" value={start.time} onChange={(e) => setW({ time: e.target.value })}><option value="day">день</option><option value="night">ночь</option></select></div>
              <div className="sim-row"><span>Случайность</span>
                <select className="input sm" value={start.chance} onChange={(e) => setW({ chance: e.target.value })} title="Как считать условия «Случайно»"><option value="random">как в игре</option><option value="yes">всегда да</option><option value="no">всегда нет</option></select></div>
              <div className="sim-h">Переменные</div>
              {varsList.length === 0 && <div className="muted small">Нет — заведи во вкладке «Переменные».</div>}
              {varsList.map((v) => (
                <div key={v.name} className="sim-row"><span className="mono" title={v.note || v.name}>{v.name}</span>
                  <ValueInput type={v.type} value={start.vars[v.name]} onChange={(val) => setW({ vars: { ...start.vars, [v.name]: val } })} /></div>
              ))}
              {(lists.quests || []).length > 0 && <div className="sim-h">Задания</div>}
              {(lists.quests || []).map((q) => {
                const st = start.quests[q.id] || { state: 'not_started' };
                const setQ = (p) => setW({ quests: { ...start.quests, [q.id]: { ...st, ...p } } });
                return (
                  <div key={q.id} className="sim-row q"><span title={q.id}>{q.title || q.id}</span>
                    <div className="sim-q">
                      <select className="input sm" value={st.state} onChange={(e) => setQ({ state: e.target.value })}>
                        <option value="not_started">не начато</option><option value="active">идёт</option><option value="done">сделано</option><option value="failed">провалено</option>
                      </select>
                      {st.state === 'active' && (
                        <select className="input sm" value={st.step || ''} onChange={(e) => setQ({ step: e.target.value || null })}>
                          <option value="">шаг?</option>
                          {(q.steps || []).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="sim-h">Предметы у игрока</div>
              <Items items={start.items} onChange={(items) => setW({ items })} />
              {(refs.actors || []).length > 0 && <div className="sim-h">Доверие жителей</div>}
              {(refs.actors || []).map((a) => (
                <div key={a.id} className="sim-row"><span>{a.name || a.id}</span><NumInput value={Number(start.trust[a.id]) || 0} step={1} onChange={(n) => setW({ trust: { ...start.trust, [a.id]: n || 0 } })} /></div>
              ))}
              <div className="sim-h">Память жителей</div>
              <Memory list={start.memory} onChange={(memory) => setW({ memory })} />
              <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setStart(freshWorld(project, null))} title="Вернуть начальные значения переменных из проекта, очистить предметы, задания, доверие и память">Сбросить мир</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Entry({ e, onGoto }) {
  const go = onGoto && e.node ? <button className="sim-node" title="Показать этот узел в графе" onClick={() => onGoto(e.node)}>{e.node}</button> : null;
  if (e.k === 'line') {
    return (
      <div className={'sim-line' + (e.me ? ' me' : '')}>
        <div className="sim-who">{e.who}{e.face || e.anim ? <span className="muted"> · {[e.face, e.anim].filter(Boolean).join(', ')}</span> : null} {go}</div>
        <div className="sim-bubble">{e.text || <em className="muted">пустая реплика</em>}</div>
      </div>
    );
  }
  if (e.k === 'pick') return <div className="sim-line me"><div className="sim-bubble pick">{e.text}</div></div>;
  if (e.k === 'act') return <div className="sim-sys act"><Icon name="gear" size={10} /> {e.t} {go}</div>;
  if (e.k === 'err') return <div className="sim-sys err">⚠ {e.t} {go}</div>;
  if (e.k === 'end') return <div className="sim-end">— конец разговора — {e.t && <span className="muted small">{e.t}</span>}</div>;
  return <div className="sim-sys">{e.t} {go}</div>;
}

function WorldNow({ w, w0, refs }) {
  const rows = [];
  const diff = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  for (const [k, v] of Object.entries(w.vars || {})) rows.push([k, valText(v), diff(v, (w0.vars || {})[k])]);
  const q = Object.entries(w.quests || {}).map(([k, v]) => [docTitle(refs.quests, k), (v.state || '') + (v.step ? ' · ' + v.step : ''), diff(v, (w0.quests || {})[k])]);
  const it = Object.entries(w.items || {}).filter(([, n]) => n).map(([k, n]) => [k.replace(/^minecraft:/, ''), n, n !== (w0.items || {})[k]]);
  const tr = Object.entries(w.trust || {}).map(([k, n]) => [k, n, n !== (w0.trust || {})[k]]);
  const Sec = ({ title, list }) => (list.length ? <><div className="sim-h">{title}</div>{list.map(([a, b, ch]) => <div key={a} className={'sim-row now' + (ch ? ' ch' : '')}><span className="mono">{a}</span><b>{String(b)}</b></div>)}</> : null);
  return (
    <div className="sim-world">
      <p className="muted small" style={{ margin: '4px 0' }}>Так стало после действий диалога. Жёлтым — что изменилось.</p>
      <Sec title="Переменные" list={rows} />
      <Sec title="Задания" list={q} />
      <Sec title="Предметы" list={it} />
      <Sec title="Доверие" list={tr} />
      {(w.memory || []).length > 0 && <><div className="sim-h">Память</div><div className="sim-chips">{w.memory.map((m) => <span key={m} className={'sim-chip' + ((w0.memory || []).includes(m) ? '' : ' ch')}>{m}</span>)}</div></>}
    </div>
  );
}

function Items({ items, onChange }) {
  const [id, setId] = useState('minecraft:bread');
  const list = Object.entries(items || {});
  return (
    <>
      {list.map(([k, n]) => (
        <div key={k} className="sim-row"><span className="mono" title={k}>{k.replace(/^minecraft:/, '')}</span>
          <div className="sim-q"><NumInput value={n} int min={0} onChange={(v) => onChange({ ...items, [k]: v || 0 })} /><button className="btn sm ghost icon-btn" onClick={() => { const c = { ...items }; delete c[k]; onChange(c); }}><Icon name="close" size={9} /></button></div></div>
      ))}
      <form className="sim-row" onSubmit={(e) => { e.preventDefault(); if (id.trim()) onChange({ ...items, [id.trim()]: (Number(items[id.trim()]) || 0) + 1 }); }}>
        <input className="input sm mono" list="sl-items" value={id} onChange={(e) => setId(e.target.value)} /><button className="btn sm">+1</button>
      </form>
    </>
  );
}
function Memory({ list, onChange }) {
  const [t, setT] = useState('');
  return (
    <>
      <div className="sim-chips">{list.map((m) => <span key={m} className="sim-chip">{m} <button onClick={() => onChange(list.filter((x) => x !== m))}>×</button></span>)}</div>
      <form className="sim-row" onSubmit={(e) => { e.preventDefault(); if (t.trim() && !list.includes(t.trim())) onChange([...list, t.trim()]); setT(''); }}>
        <input className="input sm mono" placeholder="факт, например saw_fire" value={t} onChange={(e) => setT(e.target.value)} /><button className="btn sm">+</button>
      </form>
    </>
  );
}
export { NODE_DEFS };
