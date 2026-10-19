// Поля инспектора Студии: числа, текст, координаты с кнопками «Взять из игры» / «Телепорт туда», путь, цель взгляда.
import React, { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { SUGGEST } from './schema.js';
import { fmtTicks } from './model.js';

export function Datalists() {
  return (
    <>
      {Object.entries(SUGGEST).map(([k, list]) => (
        <datalist key={k} id={'sl-' + k}>{list.map((v) => <option key={v} value={v} />)}</datalist>
      ))}
    </>
  );
}

// число, которое можно спокойно набирать («-», «0.»), а в сцену уходит только готовое
export function NumInput({ value, onChange, step, min, max, int, className = '', placeholder, title }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => { if (Number(txt) !== value || (value == null && txt !== '')) setTxt(value == null ? '' : String(value)); }, [value]); // eslint-disable-line
  return (
    <input className={'input sm st-num ' + className} value={txt} placeholder={placeholder} title={title} inputMode="decimal"
      onChange={(e) => {
        const s = e.target.value.replace(',', '.');
        setTxt(s);
        if (s.trim() === '') return onChange(null);
        let n = Number(s);
        if (!isFinite(n)) return;
        if (int) n = Math.round(n);
        onChange(n);
      }}
      onBlur={() => {
        if (txt.trim() === '' || !isFinite(Number(txt))) return;
        let n = Number(txt);
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        if (int) n = Math.round(n);
        if (n !== value) onChange(n);
        setTxt(String(n));
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const st = (step || 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        let n = Math.round(((value || 0) + st) * 1000) / 1000;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }} />
  );
}

function Vec3({ value, onChange, placeholder }) {
  const v = Array.isArray(value) ? value : [null, null, null];
  const set = (i, n) => {
    const c = v.slice();
    c[i] = n;
    onChange(c.every((x) => x == null) ? null : c.map((x) => (x == null ? 0 : x)));
  };
  return (
    <div className="st-vec">
      {['x', 'y', 'z'].map((a, i) => <NumInput key={a} value={v[i]} step={0.5} placeholder={placeholder ? a : ''} title={a} onChange={(n) => set(i, n)} />)}
    </div>
  );
}

// цель взгляда: никто / игрок / актёр / точка
function Target({ value, onChange, actors, api, f }) {
  const mode = value == null ? 'none' : value === 'player' ? 'player' : Array.isArray(value) ? 'point' : 'actor';
  return (
    <div className="st-col">
      <select className="input sm" value={mode === 'actor' ? value : mode} onChange={(e) => {
        const m = e.target.value;
        onChange(m === 'none' ? null : m === 'player' ? 'player' : m === 'point' ? (Array.isArray(value) ? value : [0, 64, 0]) : m);
      }}>
        <option value="none">— никуда (как задано)</option>
        <option value="player">Игрок</option>
        {actors.map((a) => <option key={a.id} value={'actor:' + a.id}>Актёр: {a.name || a.id}</option>)}
        {mode === 'actor' && !actors.some((a) => 'actor:' + a.id === value) && <option value={value}>{value} (нет в сцене)</option>}
        <option value="point">Точка в мире…</option>
      </select>
      {mode === 'point' && <PosField value={value} onChange={onChange} api={api} f={{ ...f, source: 'sel' }} />}
    </div>
  );
}

export function selToPos(sel, exact) {
  if (!sel) return null;
  if (!exact && sel.entity && Array.isArray(sel.entity.pos)) return sel.entity.pos.map((n) => Math.round(n * 100) / 100);
  if (Array.isArray(sel.block)) return exact ? sel.block.slice() : [sel.block[0] + 0.5, sel.block[1] + 1, sel.block[2] + 0.5];
  return null;
}

export function PosField({ value, onChange, api, f, onView }) {
  const [busy, setBusy] = useState(false);
  const grab = async () => {
    setBusy(true);
    try {
      if (f.source === 'view') {
        const v = await api.getView();
        if (onView) onView(v); else onChange(v.pos.map((n) => Math.round(n * 100) / 100));
      } else {
        const s = await api.getSel();
        const p = selToPos(s, f.exact);
        if (!p) throw new Error('В игре ты ни на что не смотришь — наведи прицел на блок');
        onChange(p);
      }
    } catch (e) { api.toast(e.message, 'error'); }
    setBusy(false);
  };
  const has = Array.isArray(value);
  return (
    <div className="st-col">
      <Vec3 value={value} onChange={onChange} placeholder />
      <div className="st-btns">
        <button className={'btn sm' + (busy ? ' busy' : '')} disabled={!api.connected} onClick={grab}
          title={f.source === 'view' ? 'Записать место и взгляд твоего персонажа в игре (как будто ты оператор)' : 'Записать блок, на который ты сейчас смотришь в игре'}>
          <Icon name="download" size={11} /> {f.source === 'view' ? 'Взять вид из игры' : 'Взять из игры'}
        </button>
        <button className="btn sm ghost" disabled={!api.connected || !has} onClick={() => api.tp(value)} title="Перенести твоего персонажа в игре в эту точку — посмотреть, как там">
          <Icon name="rocket" size={11} /> Телепорт туда
        </button>
        {f.nullable && has && <button className="btn sm ghost icon-btn" title="Очистить" onClick={() => onChange(null)}><Icon name="close" size={10} /></button>}
      </div>
    </div>
  );
}

function PathField({ value, onChange, api }) {
  const pts = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(false);
  const set = (i, p) => { const c = pts.slice(); c[i] = p; onChange(c); };
  const fromGame = async () => {
    setBusy(true);
    try {
      const p = selToPos(await api.getSel(), false);
      if (!p) throw new Error('В игре ты ни на что не смотришь — наведи прицел на блок');
      onChange([...pts, p]);
    } catch (e) { api.toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="st-col">
      {pts.length === 0 && <div className="muted small">Точек нет. Добавь из игры (или F9 в игре).</div>}
      {pts.map((p, i) => (
        <div key={i} className="st-pt">
          <span className="st-pt-n">{i + 1}</span>
          <Vec3 value={p} onChange={(v) => set(i, v || [0, 0, 0])} />
          <button className="btn sm ghost icon-btn" disabled={!api.connected} title="Телепорт к точке" onClick={() => api.tp(p)}><Icon name="rocket" size={10} /></button>
          <button className="btn sm ghost icon-btn" title="Поднять выше в списке" disabled={!i} onClick={() => { const c = pts.slice(); [c[i - 1], c[i]] = [c[i], c[i - 1]]; onChange(c); }}><Icon name="up" size={10} /></button>
          <button className="btn sm ghost icon-btn" title="Удалить точку" onClick={() => onChange(pts.filter((_, j) => j !== i))}><Icon name="close" size={10} /></button>
        </div>
      ))}
      <div className="st-btns">
        <button className={'btn sm' + (busy ? ' busy' : '')} disabled={!api.connected} onClick={fromGame} title="Добавить блок, на который ты смотришь в игре (то же делает F9 в игре)"><Icon name="plus" size={11} /> Добавить точку из игры</button>
        <button className="btn sm ghost" onClick={() => onChange([...pts, pts.length ? pts[pts.length - 1].slice() : [0, 64, 0]])} title="Добавить точку и вписать числа руками">+ вручную</button>
      </div>
    </div>
  );
}

function parseAny(s) {
  const t = String(s).trim();
  if (t === 'true' || t === 'да') return true;
  if (t === 'false' || t === 'нет') return false;
  if (t !== '' && isFinite(Number(t))) return Number(t);
  return s;
}

// id актёра: применяем по Enter/уходу с поля, чтобы дорожка не переименовывалась на каждой букве
function CommitText({ value, onChange }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  const commit = () => { const n = v.trim().toLowerCase(); if (n && n !== value) onChange(n); else setV(value || ''); };
  return <input className="input sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

export function Field({ f, value, onChange, ctx }) {
  const { hp, api, actors, projActors } = ctx;
  let input;
  switch (f.type) {
    case 'ticks':
      input = (
        <div className="row st-ticks">
          <NumInput value={value} int min={f.min !== undefined ? f.min : 0} step={5} onChange={onChange} />
          <span className="muted small">{value != null ? fmtTicks(value) : ''}</span>
        </div>
      );
      break;
    case 'int': input = <NumInput value={value} int min={f.min} max={f.max} onChange={onChange} />; break;
    case 'num': input = <NumInput value={value} step={f.step} min={f.min} max={f.max} onChange={onChange} />; break;
    case 'bool': input = <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> <span className="small">{value ? 'да' : 'нет'}</span></label>; break;
    case 'select':
      input = (
        <select className="input sm" value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)}>
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {value != null && !f.options.some(([v]) => v === value) && <option value={value}>{String(value)}</option>}
        </select>
      );
      break;
    case 'area':
      input = (
        <div className="st-col">
          <textarea className="input sm" rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />
          {f.max && <span className={'small st-count' + ((value || '').length > f.max ? ' over' : '')}>{(value || '').length} / {f.max}</span>}
        </div>
      );
      break;
    case 'id':
    case 'text':
      input = <input className="input sm" list={f.list ? 'sl-' + f.list : undefined} value={value == null ? '' : value} spellCheck={false}
        onChange={(e) => onChange(f.nullable && !e.target.value.trim() ? null : e.target.value)} placeholder={f.nullable ? 'пусто' : ''} />;
      break;
    case 'any': input = <input className="input sm" value={value == null ? '' : String(value)} onChange={(e) => onChange(parseAny(e.target.value))} />; break;
    case 'actorId': input = <CommitText value={value} onChange={onChange} />; break;
    case 'projActor':
      input = (
        <select className="input sm" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— выбери —</option>
          {projActors.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
        </select>
      );
      break;
    case 'pos': input = <PosField value={value} onChange={onChange} api={api} f={f} onView={ctx.onView} />; break;
    case 'vec3': input = <Vec3 value={value} onChange={onChange} />; break;
    case 'target': input = <Target value={value} onChange={onChange} actors={actors} api={api} f={f} />; break;
    case 'path': input = <PathField value={value} onChange={onChange} api={api} />; break;
    default: input = <span className="muted small">?</span>;
  }
  if (f.type === 'bool') {
    return (
      <div className="st-field bool" {...hp(f.label + ' — ' + f.hint)}>
        <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /><span>{f.label}</span></label>
        <span className="st-q" title={f.hint}>?</span>
      </div>
    );
  }
  const wide = ['pos', 'path', 'area', 'target'].includes(f.type);
  return (
    <div className={'st-field' + (wide ? ' wide' : '')} {...hp(f.label + ' — ' + f.hint)}>
      <div className="st-flabel" title={f.hint}>{f.label}<span className="st-q">?</span></div>
      <div className="st-finput">{input}</div>
    </div>
  );
}
