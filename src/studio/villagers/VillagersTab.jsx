// Макет «Жители» (фаза 6, трек B): ИИ жителей Villagers, Kokk в Студии.
//   «Наблюдение» — жители рядом, у выбранного: потребности, круг распорядка, план, «Почему так решил» (кандидаты с разбором
//   веса), лента решений, неудачи; «Параметры» — веса и пороги (для всех, по профессии, по характеру);
//   «Поведение» — новые дела и реакции жителей из шагов; «Реплики» — строки жителей ru + en.
// Всё лежит в проекте (ai/), «Собрать» кладёт в config/villagerskokk/. Живая связь — сообщения citizens / watch / aiParams…
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, on } from '../../lib/api.js';
import { StudioCtx, lsGet, lsSet } from '../c4d/core.jsx';
import I from '../c4d/icons.jsx';
import { learnMark } from '../learn/index.jsx';
import { mergeCatalog, PHASES, PHASE_RU, mcClock, MODE_RU, STATUS_RU, fmtNum } from './aiModel.js';
import ParamsPane from './AiParamsPane.jsx';
import BehaviourPane from './AiBehaviourPane.jsx';
import LinesPane from './AiLinesPane.jsx';
import './villagers.css';

const SUBTABS = [
  ['watch', 'Наблюдение', 'eye', 'Жители рядом с тобой в игре. Выбери жителя — увидишь, что ему нужно, что он делает и почему выбрал именно это.'],
  ['params', 'Параметры', 'gear', 'Веса и пороги ИИ: когда есть, когда бежать, как ценить своё ремесло… Для всех, для профессии или для характера.'],
  ['behave', 'Поведение', 'scheme', 'Новые дела и реакции жителей: «кто», «когда», «насколько хочет», «шаги». Без Java — из готовых действий.'],
  ['lines', 'Реплики', 'dialog', 'Что жители говорят: свои строки поверх обычных или вместо них — по-русски и по-английски.']
];

/** Всё, что вкладке нужно от игры и из проекта. */
function useAi(core) {
  const [proj, setProj] = useState(null); // { params, scripts, lines, catalog, dir }
  const [gameCat, setGameCat] = useState(null);
  const [gameParams, setGameParams] = useState(null);
  const [gameScripts, setGameScripts] = useState(null);
  const [citizens, setCitizens] = useState([]);
  const [cit, setCit] = useState(null);
  const [trace, setTrace] = useState([]);
  const [linesList, setLinesList] = useState(null);
  const [picked, setPicked] = useState(null); // житель, выбранный кликом в игре
  const catTimer = useRef(null);
  const watchId = useRef(null);
  const connected = !!core.link.connected;

  const reload = useCallback(() => call('studio:aiLoad').then(setProj).catch((e) => { core.toast(e.message, 'error'); setProj({ params: { values: {}, trades: {}, tempers: {} }, scripts: [], lines: {}, catalog: null, error: e.message }); }), []); // eslint-disable-line
  useEffect(() => { reload(); }, [reload, core.projectId]);

  const send = useCallback((m) => core.send(m), [core]);
  const cacheCatalog = (patch) => {
    clearTimeout(catTimer.current);
    catTimer.current = setTimeout(() => setProj((p) => {
      const next = { ...((p && p.catalog) || {}), ...patch };
      call('studio:aiSaveCatalog', next).catch(() => {});
      return p ? { ...p, catalog: next } : p;
    }), 600);
  };

  useEffect(() => on('studio-link', (d) => {
    const m = d && d.msg;
    if (!m) return;
    switch (m.t) {
      case 'citizens': setCitizens(Array.isArray(m.items) ? m.items : []); break;
      case 'citizen':
        if (m.stopped) break;
        if (m.id && watchId.current && m.id !== watchId.current) break;
        setCit(m);
        if (Array.isArray(m.trace)) setTrace(m.trace);
        break;
      case 'aiParams': setGameParams(m); cacheCatalog({ params: m.params, groups: m.groups, trades: m.trades, tempers: m.tempers }); break;
      case 'aiCatalog': setGameCat(m); cacheCatalog({ actions: m.actions, anims: m.anims, conds: m.conds, terms: m.terms, events: m.events, goals: m.goals }); break;
      case 'aiScripts': setGameScripts(m); break;
      case 'aiLines': if (m.op === 'list') setLinesList(m); break;
      case 'select': if (m.entity && /villager/.test(m.entity.type || '')) setPicked({ id: m.entity.id, n: Date.now() }); break;
      case 'result':
        if (m.op === 'aiTry') core.toast(m.ok ? 'Житель взялся за поведение «' + m.id + '»' : 'Не вышло: ' + (m.error || '?'), m.ok ? 'ok' : 'error', 5000);
        if (m.op === 'aiScript' && !m.ok) core.toast('Поведение «' + m.id + '»: ' + (m.error || 'ошибка'), 'error', 6000);
        if (m.op === 'watch' && !m.ok) core.toast(m.error || 'Не вышло', 'error');
        break;
      default:
    }
  }), []); // eslint-disable-line

  // со связью: каталог, параметры, поведения, реплики проекта в игру
  useEffect(() => {
    if (!connected || !proj) return;
    send({ t: 'aiReload' });
    send({ t: 'aiCatalog' });
    send({ t: 'citizens', radius: lsGet('ai.radius', 96) });
    const files = Object.values(proj.lines || {});
    send({ t: 'aiLines', data: { files, scripts: proj.scripts } });
  }, [connected, !!proj]); // eslint-disable-line

  const watch = useCallback((id) => {
    watchId.current = id || null;
    setCit(null);
    setTrace([]);
    send(id ? { t: 'watch', id, hz: 3, trace: 30 } : { t: 'unwatch' });
    if (id) learnMark('ai-watch');
  }, [send]);
  useEffect(() => () => { if (watchId.current) core.send({ t: 'unwatch' }); }, []); // eslint-disable-line

  const cat = useMemo(() => mergeCatalog(gameCat, gameParams, proj && proj.catalog), [gameCat, gameParams, proj]);
  return { proj, setProj, reload, cat, gameScripts, citizens, cit, trace, watch, watchId, send, connected, linesList, picked };
}

export default function VillagersTab() {
  const core = React.useContext(StudioCtx);
  const ai = useAi(core);
  const [sub, setSubState] = useState(() => lsGet('ai.sub', 'watch'));
  const setSub = (s) => { setSubState(s); lsSet('ai.sub', s); learnMark('ai-sub-' + s); };
  const [paramFocus, setParamFocus] = useState(null);
  // урок просит кнопку на другой подвкладке — открыть её
  useEffect(() => {
    const f = (e) => {
      const t = String(e.detail || '');
      const m = /ai-(watch|params|behave|lines)\b/.exec(t) || /ai-(?:param|scope|pf)/.exec(t) && ['', 'params'] || /ai-(?:script|who|when|score|steps|send|try|tpl)/.exec(t) && ['', 'behave'] || /ai-(?:line)/.exec(t) && ['', 'lines'] || /ai-(?:citizen|why|needs|ring|plan|timeline|fails)/.exec(t) && ['', 'watch'];
      if (m && m[1]) setSub(m[1]);
    };
    window.addEventListener('c4-learn-need', f);
    return () => window.removeEventListener('c4-learn-need', f);
  }, []); // eslint-disable-line
  useEffect(() => { if (ai.picked) { setSub('watch'); ai.watch(ai.picked.id); } }, [ai.picked]); // eslint-disable-line
  const tuneKind = (kind) => { setParamFocus({ q: 'kind.' + String(kind).toLowerCase() + '.', n: Date.now() }); setSub('params'); };
  const { hp } = core;
  return (
    <div className="vk-ai">
      <div className="vk-ai-head">
        <div className="vk-ai-tabs">
          {SUBTABS.map(([id, l, ic, h]) => (
            <button key={id} data-learn={'ai-' + id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)} {...hp(l + ' — ' + h)}><I name={ic} size={14} /> {l}</button>
          ))}
        </div>
        <div className="grow" />
        <span className={'vk-ai-link ' + (ai.connected ? 'on' : 'off')} {...hp(ai.connected ? 'Игра на связи: жители, решения и каталог — живые.' : 'Нет связи с игрой: можно править параметры, поведения и реплики (запасной каталог), но живых жителей не видно.')}>
          <span className="led" />{ai.connected ? 'ИИ жителей на связи' : 'без связи с игрой'}{ai.cat.fromGame ? '' : ' · запасной каталог'}
        </span>
      </div>
      <div className="vk-ai-body">
        {sub === 'watch' && <WatchPane ai={ai} core={core} tuneKind={tuneKind} />}
        {sub === 'params' && <ParamsPane ai={ai} core={core} focus={paramFocus} />}
        {sub === 'behave' && <BehaviourPane ai={ai} core={core} />}
        {sub === 'lines' && <LinesPane ai={ai} core={core} />}
      </div>
    </div>
  );
}

// ======================================================================================================================
// «Наблюдение»
function WatchPane({ ai, core, tuneKind }) {
  const { hp } = core;
  const [q, setQ] = useState('');
  const [trade, setTrade] = useState('');
  const [setl, setSetl] = useState('');
  const [radius, setRadiusState] = useState(() => lsGet('ai.radius', 96));
  const [adults, setAdults] = useState(false);
  const setRadius = (r) => { setRadiusState(r); lsSet('ai.radius', r); ai.send({ t: 'citizens', radius: r }); };
  useEffect(() => {
    if (!ai.connected) return undefined;
    ai.send({ t: 'citizens', radius });
    const t = setInterval(() => ai.send({ t: 'citizens', radius }), 4000);
    return () => clearInterval(t);
  }, [ai.connected, radius]); // eslint-disable-line
  const trades = [...new Set(ai.citizens.map((c) => c.tradeName).filter(Boolean))].sort();
  const setls = [...new Set(ai.citizens.map((c) => c.settlementName).filter(Boolean))].sort();
  const list = ai.citizens.filter((c) => (!q || (c.name + ' ' + (c.tradeName || '') + ' ' + c.goal).toLowerCase().includes(q.toLowerCase())) && (!trade || c.tradeName === trade) && (!setl || c.settlementName === setl) && (!adults || !c.child))
    .sort((a, b) => a.dist - b.dist);
  const selId = ai.watchId.current;
  return (
    <div className="vk-watch">
      <div className="vk-col vk-list" data-learn="ai-citizens">
        <div className="vk-colh"><I name="actor" size={14} /> Жители <small>{list.length}{list.length !== ai.citizens.length ? ' из ' + ai.citizens.length : ''}</small>
          <div className="grow" />
          <button className="c4-ib" disabled={!ai.connected} onClick={() => ai.send({ t: 'citizens', radius })} {...hp('Обновить список (он и так обновляется раз в 4 секунды).')}><I name="loop" size={14} /></button>
        </div>
        <div className="vk-filters">
          <input className="c4-text" placeholder="Поиск: имя, профессия, дело" value={q} onChange={(e) => setQ(e.target.value)} {...hp('Ищет по имени, профессии и текущему делу.')} />
          <div className="vk-frow">
            <select value={trade} onChange={(e) => setTrade(e.target.value)} {...hp('Только эта профессия.')}><option value="">все профессии</option>{trades.map((t) => <option key={t}>{t}</option>)}</select>
            <select value={setl} onChange={(e) => setSetl(e.target.value)} {...hp('Только это поселение.')}><option value="">все поселения</option>{setls.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="vk-frow">
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} {...hp('Насколько далеко от тебя в игре искать жителей. «Все» — все загруженные в этом измерении.')}>
              {[[32, 'рядом (32)'], [96, 'вокруг (96)'], [256, 'далеко (256)'], [0, 'все загруженные']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="vk-chk" {...hp('Скрыть детей.')}><input type="checkbox" checked={adults} onChange={(e) => setAdults(e.target.checked)} /> взрослые</label>
          </div>
        </div>
        <div className="vk-rows">
          {!ai.connected && <div className="vk-empty">Нет связи с игрой. Открой мир проекта — жители появятся здесь.<br /><span className="dim">Щелчок по жителю в игре (Камера Студии) тоже выбирает его.</span></div>}
          {ai.connected && !list.length && <div className="vk-empty">Рядом нет жителей поселений.<br /><span className="dim">Увеличь радиус или подойди к деревне.</span></div>}
          {list.map((c) => (
            <div key={c.id} className={'vk-crow' + (c.id === selId ? ' sel' : '')} onClick={() => ai.watch(c.id)} {...hp('Смотреть за жителем «' + c.name + '»: ' + c.goal + '.')}>
              <div className={'vk-ava' + (c.child ? ' child' : '')}>{(c.name || '?').slice(0, 1)}</div>
              <div className="vk-cmain">
                <div className="nm">{c.name}{c.sleeping && <span className="zz"> спит</span>}</div>
                <div className="sub">{c.tradeName || 'без профессии'}{c.settlementName ? ' · ' + c.settlementName : ''}</div>
                <div className="goal"><GoalDot kind={c.goalKind} /> {c.goal}</div>
              </div>
              <div className="vk-cside"><span className="dist">{Math.round(c.dist)} м</span><Mini v={c.satiety} max={20} color="#d9a441" title="сытость" /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="vk-col vk-detail">
        {!selId ? <WatchHint ai={ai} /> : <CitizenView ai={ai} core={core} tuneKind={tuneKind} />}
      </div>
    </div>
  );
}

function WatchHint({ ai }) {
  return (
    <div className="vk-hero">
      <I name="actor" size={42} color="#7c8bff" />
      <h3>Выбери жителя</h3>
      <p>Слева — жители рядом с тобой в игре. Выбери любого (или щёлкни его в игре Камерой Студии) — здесь появится:</p>
      <ul>
        <li><b>Потребности</b> — сытость, здоровье, карманы, с порогами из «Параметров»;</li>
        <li><b>Распорядок</b> — круг дня: работа, обед, вечер, сон, и где сейчас стрелка;</li>
        <li><b>План</b> — шаги текущего дела;</li>
        <li><b>Почему так решил</b> — все дела, из которых он выбирал, с разбором веса: откуда взялись числа и почему другие проиграли;</li>
        <li><b>Лента решений</b> и <b>неудачи</b> с причинами.</li>
      </ul>
      {!ai.connected && <p className="dim">Сейчас нет связи с игрой — открой мир проекта.</p>}
    </div>
  );
}

function GoalDot({ kind }) {
  const urgent = ['BURN', 'FLEE', 'ESCAPE', 'BREATHE', 'EAT', 'FIND_FOOD', 'DOWNED', 'FIGHT'].includes(kind);
  const rest = ['IDLE', 'NONE', 'SLEEP', 'GO_HOME'].includes(kind);
  return <span className={'vk-gdot ' + (urgent ? 'u' : rest ? 'r' : kind === 'SCRIPTED' ? 's' : 'w')} />;
}

function Mini({ v, max, color, title }) {
  const f = Math.max(0, Math.min(1, (Number(v) || 0) / (max || 1)));
  return <span className="vk-mini" title={title + ': ' + fmtNum(v)}><i style={{ width: f * 100 + '%', background: color }} /></span>;
}

function CitizenView({ ai, core, tuneKind }) {
  const { hp } = core;
  const c = ai.cit;
  const [decN, setDecN] = useState(null);
  const trace = ai.trace || [];
  const dec = (decN != null && trace.find((d) => d.n === decN)) || trace[0] || null;
  useEffect(() => { setDecN(null); }, [ai.watchId.current]);
  if (!c) return <div className="vk-empty big">Жду данные о жителе из игры…</div>;
  if (c.gone) return <div className="vk-empty big"><I name="warn" size={20} color="#e8c070" /> {c.error || 'Жителя не видно'}<br /><span className="dim">Подойди ближе или выбери другого.</span></div>;
  const b = c.brief || {};
  const tryScripts = (ai.proj && ai.proj.scripts) || [];
  return (
    <div className="vk-cit">
      <div className="vk-cith">
        <div className={'vk-ava big' + (b.child ? ' child' : '')}>{(c.name || '?').slice(0, 1)}</div>
        <div className="vk-cithm">
          <div className="nm">{c.name} <span className="dim">· {b.tradeName || 'без профессии'} · {b.temperName}</span></div>
          <div className="sub">{b.settlementName || 'без поселения'}{b.level ? ' · уровень ' + b.level : ''} · {(c.state && c.state.pos || []).map((x) => Math.round(x)).join(', ')}</div>
        </div>
        <div className="grow" />
        <button className="c4-btn sm" onClick={() => ai.send({ t: 'frame', pos: c.state && c.state.pos, dist: 6 })} {...hp('Показать жителя в игре (Камера Студии подлетит к нему).')}><I name="frame" size={12} /> В игре</button>
        <TryMenu scripts={tryScripts} onTry={(s) => ai.send({ t: 'aiTry', id: c.id, script: s })} hp={hp} />
        <button className="c4-btn sm" onClick={() => ai.watch(null)} {...hp('Перестать следить (запись решений у жителя выключится).')}><I name="close" size={12} /></button>
      </div>
      <div className="vk-grid">
        <Panel title="Потребности" icon="info" learn="ai-needs" hint="Сытость (0–20) с порогами «Ест, когда…», «Ищет еду…», «Голодает…» из «Параметров»; здоровье; сколько ячеек в карманах занято.">
          <Needs n={c.needs || {}} />
        </Panel>
        <Panel title="Распорядок" icon="sky" learn="ai-ring" hint="Круг дня как у жителей: утро и работа, обед, после обеда, вечер (разговоры), ночь (сон). Стрелка — сейчас в игре.">
          <ScheduleRing s={c.schedule || {}} />
        </Panel>
        <Panel title="Сейчас делает" icon="play" learn="ai-plan" hint="Текущее дело и его шаги: сделанные серые, текущий подсвечен. План строится, когда житель берётся за дело." wide>
          <Plan c={c} />
        </Panel>
        <Panel title="Почему так решил" icon="info" learn="ai-why" hint="Все дела, которые житель взвешивал в этом решении. Полоса — итоговый вес; под ней — откуда он взялся. Выигрывает самый тяжёлый из тех, что можно начать." wide tall
          extra={dec && <span className="dim small">{MODE_RU[dec.mode] || dec.mode} · {mcClock(dec.time)}</span>}>
          <Decision dec={dec} tuneKind={tuneKind} hp={hp} />
        </Panel>
        <Panel title="Лента решений" icon="film" learn="ai-timeline" hint="Последние решения жителя, новые слева. Щёлкни — разбор этого решения в «Почему так решил»." wide>
          <Timeline trace={trace} sel={dec && dec.n} onSel={(n) => { setDecN(n); learnMark('ai-decision'); }} />
        </Panel>
        <Panel title="Неудачи и перерывы" icon="warn" learn="ai-fails" hint="Что не вышло и почему (нет пути, нет вещи, нет инструмента…), и какие дела отложены и на сколько." wide>
          <Fails c={c} />
        </Panel>
      </div>
    </div>
  );
}

function TryMenu({ scripts, onTry, hp }) {
  const [open, setOpen] = useState(false);
  if (!scripts.length) return null;
  return (
    <span className="vk-try" data-learn="ai-try-cit">
      <button className="c4-btn sm" onClick={() => setOpen(!open)} {...hp('Попробовать поведение: житель сразу возьмётся за выбранное дело или реакцию из «Поведения» (вес 5000 — перебивает всё, кроме опасности).')}><I name="play" size={12} /> Попробовать…</button>
      {open && <div className="vk-pop" onMouseLeave={() => setOpen(false)}>{scripts.map((s) => <div key={s.id} className="it" onClick={() => { setOpen(false); onTry(s.id); learnMark('ai-try'); }}>{s.type === 'reaction' ? '⚡ ' : '▶ '}{s.name || s.id}</div>)}</div>}
    </span>
  );
}

function Panel({ title, icon, hint, children, wide, tall, extra, learn }) {
  const core = React.useContext(StudioCtx);
  return (
    <section className={'vk-panel' + (wide ? ' wide' : '') + (tall ? ' tall' : '')} data-learn={learn}>
      <header {...core.hp(hint)}><I name={icon} size={13} /> {title}<div className="grow" />{extra}</header>
      <div className="vk-pb">{children}</div>
    </section>
  );
}

function Needs({ n }) {
  const max = n.max || 20;
  const sat = Number(n.satiety) || 0;
  const mark = (v, l, cls) => v != null && <span className={'mk ' + cls} style={{ left: (v / max) * 100 + '%' }} title={l + ': ' + fmtNum(v)} />;
  const hf = n.maxHealth ? (n.health / n.maxHealth) : 0;
  return (
    <div className="vk-needs">
      <div className="nrow"><span className="nl">Сытость</span>
        <div className="vk-bar"><i style={{ width: (sat / max) * 100 + '%', background: sat <= n.starvingAt ? '#e2554d' : sat <= n.hungryAt ? '#e8913a' : sat <= n.eatAt ? '#d9c441' : '#6cc04a' }} />{mark(n.eatAt, 'Ест, когда ниже', 'eat')}{mark(n.hungryAt, 'Ищет еду, когда ниже', 'hungry')}{mark(n.starvingAt, 'Голодает', 'starve')}</div>
        <span className="nv">{fmtNum(sat)} / {max}</span></div>
      <div className="nlegend"><span><i className="eat" />ест</span><span><i className="hungry" />ищет еду</span><span><i className="starve" />голодает</span></div>
      <div className="nrow"><span className="nl">Здоровье</span><div className="vk-bar"><i style={{ width: hf * 100 + '%', background: hf < 0.35 ? '#e2554d' : '#d4504a' }} /></div><span className="nv">{fmtNum(n.health)} / {fmtNum(n.maxHealth)}</span></div>
      <div className="nrow"><span className="nl">Карманы</span><div className="vk-bar"><i style={{ width: ((n.pockets || 0) / (n.pocketsMax || 8)) * 100 + '%', background: '#4e8ff0' }} /></div><span className="nv">{n.pockets || 0} / {n.pocketsMax || 8}</span></div>
    </div>
  );
}

function ScheduleRing({ s }) {
  const R = 46, C = 60, W = 14;
  const ang = (t) => ((t % 24000) / 24000) * Math.PI * 2 - Math.PI / 2;
  const arc = (a0, a1) => {
    if (a1 < a0) a1 += Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, r) => [C + Math.cos(a) * r, C + Math.sin(a) * r];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R);
    return 'M' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1;
  };
  const now = Number(s.dayTime) || 0;
  const ha = ang(now);
  const flags = [[s.shop, 'часы мастерской'], [s.common, 'общая работа'], [s.holiday, 'выходной'], [s.fair, 'ярмарка'], [s.winter, 'зима'], [s.on === false, 'распорядок выключен']].filter((x) => x[0]);
  return (
    <div className="vk-ring">
      <svg viewBox="0 0 120 120" width="132" height="132">
        {PHASES.map((p) => <path key={p.id} d={arc(ang(p.from), ang(p.to))} stroke={p.color} strokeWidth={W} fill="none" opacity={s.phase === p.id ? 1 : 0.45} />)}
        {[0, 6000, 12000, 18000].map((t) => { const a = ang(t); return <text key={t} x={C + Math.cos(a) * 25} y={C + Math.sin(a) * 25 + 3} fontSize="7" fill="#8a8a8a" textAnchor="middle">{mcClock(t).slice(0, 2)}</text>; })}
        <line x1={C} y1={C} x2={C + Math.cos(ha) * (R + 8)} y2={C + Math.sin(ha) * (R + 8)} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx={C} cy={C} r="3.5" fill="#fff" />
      </svg>
      <div className="vk-ringl">
        <div className="now">{mcClock(now)} · <b>{PHASE_RU[s.phase] || s.phase || '—'}</b></div>
        {PHASES.map((p) => <div key={p.id} className={'ph' + (s.phase === p.id ? ' on' : '')}><i style={{ background: p.color }} />{p.ru} <span className="dim">{mcClock(p.from)}–{mcClock(p.to)}</span></div>)}
        {flags.length > 0 && <div className="flags">{flags.map(([, l]) => <span key={l} className="flag">{l}</span>)}</div>}
      </div>
    </div>
  );
}

function Plan({ c }) {
  const st = c.state || {};
  const plan = c.plan || [];
  return (
    <div className="vk-plan">
      <div className="pgoal"><GoalDot kind={st.goalKind} /> <b>{st.goal || 'без дела'}</b>{st.utility != null && <span className="dim"> · вес {fmtNum(st.utility)}</span>}{st.sleeping && <span className="flag">спит</span>}{st.inWater && <span className="flag warn">в воде</span>}{st.onFire && <span className="flag bad">горит</span>}</div>
      {!plan.length && <div className="dim">Шагов нет — житель отдыхает или ищет место.</div>}
      <ol>{plan.map((p) => <li key={p.i} className={p.state}><span className="n">{p.i}</span>{p.text}</li>)}</ol>
    </div>
  );
}

const TERM_COL = ['#7c8bff', '#4fb3a8', '#d9a441', '#c76ad6', '#5fa0e8', '#e08a5a', '#8fbf5a'];
function Decision({ dec, tuneKind, hp }) {
  const [open, setOpen] = useState(null);
  useEffect(() => { setOpen(null); }, [dec && dec.n]);
  if (!dec) return <div className="vk-empty">Решений пока нет. Житель решает, когда заканчивает дело — подожди немного или попроси его о чём-нибудь.</div>;
  const rank = (x) => (x.status === 'выбрано' ? 0 : x.status === 'убрано' ? 2 : 1);
  const cands = [...(dec.cands || [])].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
  const max = Math.max(1, ...cands.map((x) => Math.abs(x.score)), ...cands.map((x) => Math.abs(x.base)));
  return (
    <div className="vk-dec">
      <div className="vk-decw">
        <span className="lbl">Выбрал:</span> <b>{dec.winner || '—'}</b>{dec.note && <span className="dim"> — {dec.note}</span>}
        {dec.steps && dec.steps.length > 0 && <span className="dim"> · шагов {dec.steps.length}</span>}
      </div>
      <div className="vk-cands">
        <div className="vk-candh"><span>Дело</span><span>Вес и откуда он</span><span>Итог</span><span>Почему</span></div>
        {cands.map((x, i) => {
          const win = x.status === 'выбрано';
          const gone = x.status === 'убрано';
          const isOpen = open === i;
          return (
            <React.Fragment key={i}>
              <div className={'vk-cand' + (win ? ' win' : '') + (gone ? ' gone' : '')} onClick={() => setOpen(isOpen ? null : i)} {...hp('Щёлкни — разбор веса по шагам. «' + x.text + '»: основа ' + fmtNum(x.base) + ' (' + x.source + ')' + (x.terms || []).map((t) => ', ' + t.name + ' ' + (t.delta > 0 ? '+' : '') + fmtNum(t.delta)).join('') + ' = ' + fmtNum(x.score) + '.')}>
                <span className="cn"><GoalDot kind={x.kind} /> {x.text}</span>
                <span className="cb"><Waterfall x={x} max={max} /></span>
                <span className="cs">{fmtNum(x.score)}</span>
                <span className={'cw st-' + (STATUS_RU[x.status] ? x.status.replace(/\s/g, '_') : 'x')}>{STATUS_RU[x.status] || x.status}{x.why ? ': ' + x.why : ''}</span>
              </div>
              {isOpen && (
                <div className="vk-cando">
                  <div className="terms">
                    <span className="term base">основа <b>{fmtNum(x.base)}</b> <em>{x.source}</em></span>
                    {(x.terms || []).map((t, j) => <span key={j} className={'term ' + (t.delta >= 0 ? 'plus' : 'minus')}><i style={{ background: TERM_COL[j % TERM_COL.length] }} />{t.name} <b>{t.delta > 0 ? '+' : ''}{fmtNum(t.delta)}</b></span>)}
                    <span className="term eq">= <b>{fmtNum(x.score)}</b></span>
                  </div>
                  {x.kind !== 'IDLE' && <button className="c4-btn sm" data-learn="ai-tune-kind" onClick={() => tuneKind(x.kind)} {...hp('Открыть «Параметры» на множителе и прибавке этого вида цели — сделать его важнее или реже.')}><I name="gear" size={11} /> Настроить вес «{x.name}»</button>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {dec.steps && dec.steps.length > 0 && <div className="vk-decsteps"><span className="lbl">Шаги выбранного:</span> {dec.steps.slice(0, 8).map((s, i) => <span key={i} className="chip">{i + 1}. {s}</span>)}</div>}
    </div>
  );
}

/** Вес как «водопад»: основа, затем каждое слагаемое (+ вправо, − влево), отметка итога. */
function Waterfall({ x, max }) {
  const W = 100;
  const sc = (v) => (v / max) * W * 0.5;
  const segs = [];
  let at = 0;
  const push = (from, to, color, neg) => segs.push({ l: 50 + Math.min(sc(from), sc(to)), w: Math.max(0.6, Math.abs(sc(to) - sc(from))), color, neg });
  push(0, x.base, '#5d6178');
  at = x.base;
  (x.terms || []).forEach((t, j) => { push(at, at + t.delta, t.delta >= 0 ? TERM_COL[j % TERM_COL.length] : '#e2554d', t.delta < 0); at += t.delta; });
  // вычеты рисуются поверх (полосой снизу), чтобы их не закрыли надбавки после них
  segs.sort((a, b) => (a.neg ? 1 : 0) - (b.neg ? 1 : 0));
  return (
    <span className="vk-wf">
      <span className="axis" />
      {segs.map((s, i) => <i key={i} className={s.neg ? 'neg' : ''} style={{ left: s.l + '%', width: s.w + '%', background: s.color }} />)}
      <span className="fin" style={{ left: 50 + sc(x.score) + '%' }} />
    </span>
  );
}

function Timeline({ trace, sel, onSel }) {
  if (!trace.length) return <div className="dim">Пока пусто.</div>;
  return (
    <div className="vk-tl">
      {trace.map((d) => (
        <div key={d.n} className={'vk-tli' + (d.n === sel ? ' sel' : '') + ' m-' + (d.mode || '')} onClick={() => onSel(d.n)} title={(MODE_RU[d.mode] || d.mode) + ' в ' + mcClock(d.time) + ': ' + d.winner}>
          <span className="t">{mcClock(d.time)}</span>
          <span className="m">{MODE_RU[d.mode] || d.mode}</span>
          <span className="w"><GoalDot kind={d.winnerKind} /> {d.winner || '—'}</span>
          <span className="c">{(d.cands || []).length} дел</span>
        </div>
      ))}
    </div>
  );
}

function Fails({ c }) {
  const fails = c.fails || [];
  const bl = c.blocked || [];
  if (!fails.length && !bl.length) return <div className="dim">Неудач нет, все дела доступны.</div>;
  return (
    <div className="vk-fails">
      {bl.map((x, i) => <div key={'b' + i} className="fr bl"><I name="pause" size={12} /> <b>{x.goal}</b> отложено: {x.reason} <span className="dim">· ещё {Math.round(x.left / 20)} с</span></div>)}
      {fails.map((f, i) => <div key={'f' + i} className="fr"><I name="warn" size={12} color="#e8913a" /> <b>{f.goal}</b>, шаг {f.step}{f.stepText ? ' («' + f.stepText + '»)' : ''}: {f.failure}{f.where ? <span className="dim"> у {f.where.join(', ')}</span> : null}</div>)}
    </div>
  );
}
