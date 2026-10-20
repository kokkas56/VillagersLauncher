// «Жители» → «Параметры»: каждый вес, порог и время ИИ жителей. Область: для всех, для профессии, для характера.
// Значения лежат в проекте (ai/params.json) и сразу уходят в игру ({t:'aiParamsSet', replace:true}).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import I from '../c4d/icons.jsx';
import { lsGet, lsSet } from '../c4d/core.jsx';
import { learnMark } from '../learn/index.jsx';
import { layerValue, setLayerValue, countSet, fmtNum } from './aiModel.js';
import { aiValidateParams, AI_ERR } from './aiValidate.js';

export default function ParamsPane({ ai, core, focus }) {
  const { hp } = core;
  const cat = ai.cat;
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const [onlySet, setOnlySet] = useState(false);
  const [openG, setOpenG] = useState(() => lsGet('ai.paramGroups', { needs: true, urgent: true }));
  const [saved, setSaved] = useState('saved');
  const params = (ai.proj && ai.proj.params) || { values: {}, trades: {}, tempers: {} };
  const timer = useRef(null);
  useEffect(() => { if (focus) { setQ(focus.q); setOpenG((g) => ({ ...g, kind: true })); } }, [focus]);
  const toggleG = (g) => setOpenG((o) => { const n = { ...o, [g]: !o[g] }; lsSet('ai.paramGroups', n); return n; });

  const save = (next) => {
    ai.setProj((p) => ({ ...p, params: next }));
    setSaved('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await call('studio:aiSaveParams', next);
        ai.send({ t: 'aiParamsSet', values: next.values, trades: next.trades, tempers: next.tempers, replace: true, echo: true });
        setSaved('saved');
      } catch (e) { setSaved('error'); core.toast(e.message, 'error'); }
    }, 450);
  };
  const setVal = (id, v) => { save(setLayerValue(params, scope, id, v)); learnMark('ai-param-set'); if (scope !== 'all') learnMark('ai-param-scope'); };

  const groups = cat.groups || [];
  const qq = q.trim().toLowerCase();
  const list = useMemo(() => (cat.params || []).filter((p) => {
    if (qq && !(p.name + ' ' + p.desc + ' ' + p.id).toLowerCase().includes(qq)) return false;
    if (onlySet && layerValue(params, scope, p.id) === undefined) return false;
    return true;
  }), [cat.params, qq, onlySet, params, scope]); // eslint-disable-line
  const issues = useMemo(() => aiValidateParams(params, cat), [params, cat]);
  const scopeName = scope === 'all' ? 'для всех' : scope.startsWith('trade:') ? 'профессия «' + ((cat.trades || []).find((t) => 'trade:' + t.id === scope) || {}).name + '»' : 'характер «' + ((cat.tempers || []).find((t) => 'temper:' + t.id === scope) || {}).name + '»';
  const nScope = (sc) => (cat.params || []).filter((p) => layerValue(params, sc, p.id) !== undefined).length;

  return (
    <div className="vk-params">
      <div className="vk-tool">
        <div className="vk-search" data-learn="ai-param-search"><I name="search" size={13} /><input placeholder="Найти параметр: «сытость», «монстр», «ремесло», kind.house…" value={q} onChange={(e) => setQ(e.target.value)} {...hp('Ищет в названиях, описаниях и id. Виды целей: «kind.» и название цели.')} />{q && <button className="c4-ib" onClick={() => setQ('')}><I name="close" size={11} /></button>}</div>
        <select data-learn="ai-scope" value={scope} onChange={(e) => setScope(e.target.value)} {...hp('Для кого значение: для всех жителей, только для одной профессии или для одного характера. Профессия и характер перекрывают «для всех».')}>
          <option value="all">Для всех жителей{nScope('all') ? ' · ' + nScope('all') : ''}</option>
          <optgroup label="Профессия">{(cat.trades || []).map((t) => { const n = nScope('trade:' + t.id); return <option key={t.id} value={'trade:' + t.id}>{t.name}{n ? ' · ' + n : ''}</option>; })}</optgroup>
          <optgroup label="Характер">{(cat.tempers || []).map((t) => { const n = nScope('temper:' + t.id); return <option key={t.id} value={'temper:' + t.id}>{t.name}{n ? ' · ' + n : ''}</option>; })}</optgroup>
        </select>
        <label className="vk-chk" {...hp('Показать только параметры, которые изменены в этой области.')}><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} /> только изменённые</label>
        <div className="grow" />
        <span className={'vk-save ' + saved}>{{ saved: 'Сохранено', dirty: 'Есть правки…', error: 'Не сохранилось!' }[saved]}</span>
        <button className="c4-btn sm danger" disabled={!nScope(scope)} onClick={() => { if (window.confirm('Сбросить все параметры (' + scopeName + ') к значениям по умолчанию?')) { let p = params; for (const x of cat.params || []) p = setLayerValue(p, scope, x.id, undefined); save(p); } }} {...hp('Вернуть все параметры этой области к значениям по умолчанию.')}><I name="undo" size={11} /> Сбросить {scopeName}</button>
      </div>
      <div className="vk-pinfo">
        <span>Параметров: <b>{(cat.params || []).length}</b>, изменено в проекте: <b>{countSet(params)}</b>.</span>
        <span className="dim">Правка сразу уходит в игру{ai.connected ? '' : ' (когда будет связь)'} и сохраняется в <span className="mono">ai/params.json</span>; «Собрать» положит их игрокам в <span className="mono">config/villagerskokk/ai_params.json</span>.</span>
      </div>
      <div className="vk-plist">
        {groups.map((g) => {
          const ps = list.filter((p) => p.group === g.id);
          if (!ps.length) return null;
          const open = !!openG[g.id] || !!qq;
          const nset = ps.filter((p) => layerValue(params, scope, p.id) !== undefined).length;
          return (
            <div key={g.id} className="vk-pg">
              <div className="vk-pgh" onClick={() => toggleG(g.id)}><span className={'arr' + (open ? ' open' : '')}>▸</span> {g.name} <small>{ps.length}</small>{nset > 0 && <span className="chg">изменено {nset}</span>}
                {open && <span className="cols"><span>значение</span><span>умолч.</span><span>в игре</span></span>}</div>
              {open && ps.slice(0, g.id === 'kind' && !qq ? 60 : 400).map((p) => <ParamRow key={p.id} p={p} v={layerValue(params, scope, p.id)} base={scope === 'all' ? undefined : layerValue(params, 'all', p.id)} game={cat.gameValues && cat.gameValues[p.id]} onSet={(v) => setVal(p.id, v)} hp={hp} />)}
              {open && g.id === 'kind' && !qq && ps.length > 60 && <div className="vk-more dim">Ещё {ps.length - 60} — найди вид цели поиском (например «kind.house» или «строить»).</div>}
            </div>
          );
        })}
        {!list.length && <div className="vk-empty">Ничего не найдено.</div>}
      </div>
      {issues.length > 0 && <div className="vk-issues">{issues.slice(0, 6).map((x, i) => <div key={i} className={x.sev === AI_ERR ? 'e' : 'w'}><I name="warn" size={11} /> {x.msg}</div>)}</div>}
    </div>
  );
}

function ParamRow({ p, v, base, game, onSet, hp }) {
  const set = v !== undefined;
  const cur = set ? v : base !== undefined ? base : p.def;
  // ползунок: для огромных диапазонов — разумная часть (число можно ввести любое в пределах)
  const lo = p.group === 'kind' && p.id.endsWith('.add') ? -400 : p.min < -1000 ? Math.max(p.min, -1500) : p.min;
  const hi = p.group === 'kind' && p.id.endsWith('.mul') ? 3 : p.group === 'kind' ? 400 : p.max > 1500 ? Math.min(p.max, Math.max(1500, p.def * 2)) : p.max;
  const [txt, setTxt] = useState(null);
  const commit = (s) => {
    const n = Number(String(s).replace(',', '.'));
    setTxt(null);
    if (!Number.isFinite(n)) return;
    onSet(Math.max(p.min, Math.min(p.max, p.int ? Math.round(n) : n)));
  };
  return (
    <div className={'vk-prow' + (set ? ' set' : base !== undefined ? ' inh' : '')} data-learn={'ai-param-' + p.id} {...hp(p.name + ' (' + p.id + '): ' + p.desc + ' По умолчанию ' + fmtNum(p.def, p) + ', от ' + fmtNum(p.min, p) + ' до ' + fmtNum(p.max, p) + '.' + (!set && base !== undefined ? ' Сейчас берётся значение «для всех» — ' + fmtNum(base, p) + '.' : ''))}>
      <div className="pn"><span className="nm">{p.name} <span className="id">{p.id}</span></span><span className="ds">{p.desc}</span></div>
      {p.bool
        ? <label className="vk-toggle"><input type="checkbox" checked={cur >= 0.5} onChange={(e) => onSet(e.target.checked ? 1 : 0)} /><span>{cur >= 0.5 ? 'да' : 'нет'}</span></label>
        : <input type="range" min={lo} max={hi} step={p.step || 1} value={Math.max(lo, Math.min(hi, cur))} onChange={(e) => onSet(p.int ? Math.round(Number(e.target.value)) : Number(e.target.value))} />}
      {!p.bool && <input className="c4-text num" value={txt != null ? txt : fmtNum(cur, p)} onChange={(e) => setTxt(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(e.currentTarget.value); if (e.key === 'Escape') setTxt(null); }} />}
      <span className="def" title="По умолчанию">{fmtNum(p.def, p)}</span>
      <span className="game" title="Сейчас в игре (для всех)">{game != null ? fmtNum(game, p) : ''}</span>
      <button className="c4-ib" disabled={!set} onClick={() => onSet(undefined)} {...hp('Сбросить: взять значение по умолчанию (или «для всех», если это профессия/характер).')}><I name="undo" size={12} /></button>
    </div>
  );
}
