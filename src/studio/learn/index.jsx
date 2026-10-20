// Движок «Обучения» и «Справочник» Студии Кокка.
// Урок — данные (learn/tutorials.js); движок подсвечивает кнопку (data-learn="…") пульсирующей рамкой со стрелкой,
// показывает карточку «что делаем / зачем / подробнее» рядом с ней (её можно тащить и сворачивать), сам замечает,
// что шаг сделан, помнит прогресс по каждому уроку и шлёт в игру метку {t:'learnHint', …} — где смотреть.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '../c4d/core.jsx';
import I from '../c4d/icons.jsx';
import { TUTORIALS, TOPICS, LEVEL_RU, tutorialById } from './tutorials.js';
import { buildArticles, articleForLearn, searchArticles, CATS } from './reference.js';
import { ENT_TYPES } from '../entities.js';
import { TYPE_COLOR } from '../c4d/icons.jsx';

// отметить действие автора для проверок уроков (F5, «Собрать», «Сцена в игре»…)
export function learnMark(name) { try { window.dispatchEvent(new CustomEvent('c4-learn', { detail: name })); } catch (_) {} }

export function useLearn(core, { setLayout, layout, modal }) {
  const [prog, setProg] = useState(() => lsGet('learn.progress', {})); // { id: { step, done, at, best } }
  const [active, setActive] = useState(() => lsGet('learn.active', null)); // { id, step } | null
  const [collapsed, setCollapsed] = useState(false);
  const [, force] = useState(0);
  const events = useRef(new Set());
  useEffect(() => {
    const f = (e) => { events.current.add(e.detail); force((n) => n + 1); };
    window.addEventListener('c4-learn', f);
    return () => window.removeEventListener('c4-learn', f);
  }, []);
  const save = (p) => { setProg(p); lsSet('learn.progress', p); };
  const setAct = (a) => { setActive(a); lsSet('learn.active', a); };
  const tut = active ? tutorialById(active.id) : null;
  const step = tut ? tut.steps[Math.min(active.step, tut.steps.length - 1)] : null;
  const ctx = { core, layout, modal, events: events.current };
  let doneNow = false;
  try { doneNow = !!(step && step.done && step.done(ctx)); } catch (_) { doneNow = false; }

  const go = useCallback((id, n) => {
    const t = tutorialById(id);
    if (!t) return;
    const k = Math.max(0, Math.min(t.steps.length - 1, n));
    setAct({ id, step: k });
    setCollapsed(false);
    setProg((p) => { const c = { ...p, [id]: { ...(p[id] || {}), step: k, at: Date.now(), best: Math.max(k, (p[id] && p[id].best) || 0) } }; lsSet('learn.progress', c); return c; });
    const s = t.steps[k];
    if (s.layout && core.hasProject && setLayout) setLayout(s.layout);
  }, [core.hasProject, setLayout]);
  const start = useCallback((id, restart) => { const p = prog[id]; go(id, restart || !p || p.done ? 0 : p.step || 0); }, [prog, go]);
  const finish = () => { if (!tut) return; save({ ...prog, [tut.id]: { ...(prog[tut.id] || {}), done: true, step: 0, at: Date.now() } }); setAct(null); core.toast('Урок «' + tut.title + '» пройден!', 'ok', 4000); };
  const next = () => { if (!tut) return; if (active.step >= tut.steps.length - 1) finish(); else go(tut.id, active.step + 1); };
  const back = () => { if (tut && active.step > 0) go(tut.id, active.step - 1); };
  const stop = () => setAct(null);
  const reset = (id) => { const c = { ...prog }; delete c[id]; save(c); };

  // сделано → через миг следующий шаг (только если шаг сделали при нас)
  const wasDone = useRef(false);
  const key = active ? active.id + ':' + active.step : '';
  useEffect(() => { wasDone.current = doneNow; }, [key]); // eslint-disable-line
  useEffect(() => {
    if (!step || !doneNow || wasDone.current) return undefined;
    wasDone.current = true;
    const t = setTimeout(() => next(), 1600);
    return () => clearTimeout(t);
  }, [doneNow, key]); // eslint-disable-line

  // метка в игре: {t:'learnHint', id, pos?, entity?, text, arrow:true} / {t:'learnHint', clear:true}
  const hintSent = useRef(false);
  useEffect(() => {
    if (!core.link.connected) { hintSent.current = false; return; }
    const g = step && step.game;
    // прошлая метка урока уходит (у игры их не больше 4, тот же id заменяет)
    if (hintSent.current && hintSent.current !== key) { core.send({ t: 'learnHint', id: hintSent.current, clear: true }); hintSent.current = false; }
    if (!g) return;
    const msg = { t: 'learnHint', id: key, text: g.text || step.title, arrow: true, title: step.title };
    try { const p = g.at && g.at(ctx); if (Array.isArray(p)) msg.pos = p; } catch (_) {}
    try { const e = g.entity && g.entity(ctx); if (e) msg.entity = e; } catch (_) {}
    core.send(msg);
    hintSent.current = key;
  }, [key, core.link.connected, !!(step && step.game)]); // eslint-disable-line
  useEffect(() => () => { if (hintSent.current) core.send({ t: 'learnHint', id: hintSent.current, clear: true }); }, []); // eslint-disable-line

  return { prog, active, tut, step, doneNow, collapsed, setCollapsed, start, go, next, back, stop, finish, reset, ctx };
}

// ---------- карточка урока поверх окна ----------
export function LearnOverlay({ learn }) {
  const { tut, step, active, doneNow, collapsed } = learn;
  const [rect, setRect] = useState(null);
  const [drag, setDrag] = useState(null); // { x, y } — свой угол карточки после перетаскивания
  const [more, setMore] = useState(false);
  const cardRef = useRef(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 220 });
  const key = active ? active.id + ':' + active.step : '';
  useEffect(() => { setMore(false); }, [key]);
  useEffect(() => {
    if (!step) return undefined;
    const find = () => {
      let el = null;
      try { for (const sel of String(step.target || '').split(',')) { el = document.querySelector(sel.trim()); if (el && el.getBoundingClientRect().width) break; } } catch (_) { el = null; }
      const r = el ? el.getBoundingClientRect() : null;
      setRect((old) => (r && r.width ? (old && Math.abs(old.x - r.x) + Math.abs(old.y - r.y) + Math.abs(old.width - r.width) + Math.abs(old.height - r.height) < 1 ? old : { x: r.x, y: r.y, width: r.width, height: r.height }) : null));
    };
    find();
    const t = setInterval(find, 300);
    return () => clearInterval(t);
  }, [step]);
  useLayoutEffect(() => { const el = cardRef.current; if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight }); }, [key, more, collapsed, rect && rect.x]);
  if (!tut || !step) return null;
  const n = active.step, total = tut.steps.length;
  if (collapsed) {
    return (
      <button className="c4-learn-pill" onClick={() => learn.setCollapsed(false)} title="Развернуть урок">
        <I name="tutor" size={14} /> {tut.title}: шаг {n + 1}/{total}{doneNow ? ' ✓' : ''}
      </button>
    );
  }
  // место карточки: справа от цели, иначе слева, снизу, сверху; в пределах окна
  const W = window.innerWidth, H = window.innerHeight;
  let pos;
  let arrow = null;
  if (drag) pos = drag;
  else if (rect) {
    const gap = 18;
    const cands = [
      { x: rect.x + rect.width + gap, y: rect.y + rect.height / 2 - cardSize.h / 2, side: 'left' },
      { x: rect.x - cardSize.w - gap, y: rect.y + rect.height / 2 - cardSize.h / 2, side: 'right' },
      { x: rect.x + rect.width / 2 - cardSize.w / 2, y: rect.y + rect.height + gap, side: 'top' },
      { x: rect.x + rect.width / 2 - cardSize.w / 2, y: rect.y - cardSize.h - gap, side: 'bottom' }
    ];
    const fits = (c) => c.x >= 6 && c.y >= 34 && c.x + cardSize.w <= W - 6 && c.y + cardSize.h <= H - 26;
    const c = cands.find(fits) || cands[0];
    pos = { x: Math.max(6, Math.min(W - cardSize.w - 6, c.x)), y: Math.max(34, Math.min(H - cardSize.h - 26, c.y)) };
    arrow = c.side;
  } else pos = { x: W - cardSize.w - 16, y: H - cardSize.h - 36 };
  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const x0 = e.clientX - pos.x, y0 = e.clientY - pos.y;
    const mv = (ev) => setDrag({ x: Math.max(0, Math.min(W - 80, ev.clientX - x0)), y: Math.max(30, Math.min(H - 40, ev.clientY - y0)) });
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  // стрелка от карточки к цели
  let arr = null;
  if (rect) {
    const cx = pos.x + cardSize.w / 2, cy = pos.y + cardSize.h / 2;
    const tx = Math.max(rect.x, Math.min(rect.x + rect.width, cx)), ty = Math.max(rect.y, Math.min(rect.y + rect.height, cy));
    const ex = Math.max(pos.x, Math.min(pos.x + cardSize.w, tx)), ey = Math.max(pos.y, Math.min(pos.y + cardSize.h, ty));
    const len = Math.hypot(tx - ex, ty - ey);
    if (len > 8) arr = { x1: ex, y1: ey, x2: tx, y2: ty };
  }
  void arrow;
  return (
    <>
      {rect && <div className="c4-learn-hl" style={{ left: rect.x - 4, top: rect.y - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      {arr && (
        <svg className="c4-learn-arrow" width={W} height={H}>
          <defs><marker id="c4la" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="#ffd84a" /></marker></defs>
          <line x1={arr.x1} y1={arr.y1} x2={arr.x2} y2={arr.y2} stroke="#ffd84a" strokeWidth="2.2" strokeDasharray="6 4" markerEnd="url(#c4la)" />
        </svg>
      )}
      <div ref={cardRef} className={'c4-learn-card' + (doneNow ? ' done' : '')} style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="h" onMouseDown={startDrag} title="Тяни, чтобы подвинуть">
          <I name="tutor" size={14} color="#9fb0ff" />
          <span className="t">{tut.title}</span>
          <span className="n">{n + 1} / {total}</span>
          <button onClick={() => learn.setCollapsed(true)} title="Свернуть (урок продолжится)"><I name="min" size={12} /></button>
          <button onClick={learn.stop} title="Закрыть урок (прогресс запомнится)"><I name="close" size={12} /></button>
        </div>
        <div className="prog"><i style={{ width: ((n + (doneNow ? 1 : 0)) / total * 100) + '%' }} /></div>
        <div className="b">
          <h4>{doneNow ? '✓ ' : ''}{step.title}</h4>
          <p className="what"><b>Что делаем.</b> {step.text}</p>
          {step.why && <p className="why"><b>Зачем.</b> {step.why}</p>}
          {step.game && <p className="game"><I name="look" size={11} /> В игре: {step.game.text}</p>}
          {!rect && step.target && <p className="dim small">Кнопки сейчас не видно{step.layout ? ' — она в макете «' + step.layout + '»' : ''}.</p>}
          {step.more && <button className="c4-learn-more" onClick={() => setMore(!more)}>{more ? '▾' : '▸'} Подробнее</button>}
          {more && step.more && <div className="moreb">{step.more.svg && <Illus look={step.more.svg} />}{step.more.text && <p>{step.more.text}</p>}</div>}
        </div>
        <div className="f">
          <button className="c4-btn sm" disabled={n === 0} onClick={learn.back}>← Назад</button>
          <span className="grow" />
          {!step.done && <button className="c4-btn sm prim" onClick={learn.next}>{n === total - 1 ? 'Готово ✓' : 'Готово →'}</button>}
          {step.done && (doneNow
            ? <button className="c4-btn sm prim" onClick={learn.next}>{n === total - 1 ? 'Завершить ✓' : 'Дальше →'}</button>
            : <><span className="wait dim">жду, когда сделаешь…</span><button className="c4-btn sm" onClick={learn.next} title="Пропустить шаг">Пропустить</button></>)}
        </div>
      </div>
    </>
  );
}

// ---------- каталог «Обучение» ----------
export function LearnCatalog({ Modal, learn, onClose, openRef }) {
  return (
    <Modal title="Обучение" wide onClose={onClose} footer={<><button className="c4-btn" onClick={() => { onClose(); openRef(null); }}><I name="info" size={12} /> Справочник (F1)</button><button className="c4-btn prim" onClick={onClose}>Закрыть</button></>}>
      <div className="c4-cat" data-learn="learn-catalog">
        <p className="dim" style={{ marginTop: 0 }}>Уроки идут прямо в твоём проекте: карточка подсвечивает нужную кнопку, объясняет «что» и «зачем» и сама замечает, когда шаг сделан. В игре появится метка — куда смотреть. Прогресс запоминается.</p>
        {TOPICS.map(([tid, label, icon, soon]) => {
          const list = TUTORIALS.filter((t) => t.topic === tid);
          return (
            <section key={tid} className={'c4-cat-sec' + (soon ? ' soon' : '')}>
              <h3><I name={icon} size={15} />{label}{soon && <em>скоро</em>}</h3>
              {soon && <div className="c4-cat-soon">Уроки появятся вместе с этой частью Студии.</div>}
              <div className="c4-cat-grid">
                {list.map((t) => {
                  const p = learn.prog[t.id];
                  const st = p && p.done ? 'done' : p ? 'go' : 'new';
                  const cur = learn.active && learn.active.id === t.id;
                  return (
                    <div key={t.id} className={'c4-tcard ' + st + (cur ? ' cur' : '')}>
                      <div className="top"><b>{t.title}</b><span className={'st ' + st}>{st === 'done' ? '✓ пройден' : st === 'go' ? 'шаг ' + ((p.step || 0) + 1) + ' из ' + t.steps.length : 'не начат'}</span></div>
                      <p>{t.desc}</p>
                      <div className="meta">
                        <span className="lvl" title={'Сложность: ' + LEVEL_RU[t.level]}>{[1, 2, 3].map((k) => <i key={k} className={k <= t.level ? 'on' : ''} />)} {LEVEL_RU[t.level]}</span>
                        <span>~{t.minutes} мин</span><span>{t.steps.length} шагов</span>
                        <span className="grow" />
                        {st === 'done' && <button className="c4-btn sm" onClick={() => { learn.start(t.id, true); onClose(); }}>Заново</button>}
                        <button className="c4-btn sm prim" onClick={() => { learn.start(t.id); onClose(); }}>{st === 'go' ? 'Продолжить' : st === 'done' ? 'Открыть' : 'Начать'}</button>
                      </div>
                      {st === 'go' && <div className="bar"><i style={{ width: (((p.step || 0)) / t.steps.length * 100) + '%' }} /></div>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------- «Справочник» ----------
let ART_CACHE = null;
export function allArticles() { if (!ART_CACHE) ART_CACHE = buildArticles(); return ART_CACHE; }
export function ReferenceModal({ Modal, start, learn, onClose }) {
  const arts = allArticles();
  const first = useMemo(() => {
    if (!start) return null;
    if (start.startsWith('learn:')) return articleForLearn(arts, start.slice(6));
    return arts.find((a) => a.id === start) || null;
  }, [start]); // eslint-disable-line
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(first ? first.cat : null);
  const [cur, setCur] = useState(first ? first.id : 'tool:play');
  const list = useMemo(() => searchArticles(arts, q).filter((a) => !cat || q || a.cat === cat), [q, cat]); // eslint-disable-line
  const a = arts.find((x) => x.id === cur) || list[0];
  return (
    <Modal title="Справочник" wide onClose={onClose}>
      <div className="c4-ref" data-learn="reference">
        <div className="side">
          <input className="c4-text" autoFocus placeholder="Найти: зона, выход, время, F5…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <div className="cats">
            <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>Всё</button>
            {CATS.map(([id, l]) => <button key={id} className={cat === id ? 'on' : ''} onClick={() => setCat(id)}>{l}</button>)}
          </div>
          <div className="list">
            {list.slice(0, 400).map((x) => <button key={x.id} className={x.id === (a && a.id) ? 'on' : ''} onClick={() => setCur(x.id)}><ArtIcon a={x} />{x.title}</button>)}
            {!list.length && <div className="dim" style={{ padding: 8 }}>Ничего не нашлось.</div>}
          </div>
        </div>
        {a && (
          <div className="art">
            <h2><ArtIcon a={a} size={20} />{a.title}</h2>
            <div className="dim small">{(CATS.find((c) => c[0] === a.cat) || [])[1]}{a.machine ? ' · в файле: ' + a.machine : ''}</div>
            <h4>Что это</h4><p>{a.what || '—'}</p>
            {a.why && <><h4>Зачем</h4><p>{a.why}</p></>}
            <h4>Как выглядит в игре</h4>
            <Illus look={a.look} a={a} />
            {a.example && <><h4>Пример</h4><p className="ex">{a.example}</p></>}
            {(a.tutorials || []).length > 0 && <><h4>Уроки</h4><div className="tuts">{a.tutorials.map((id) => { const t = tutorialById(id); return t ? <button key={id} className="c4-btn sm" onClick={() => { learn.start(id); onClose(); }}><I name="tutor" size={12} /> {t.title}</button> : null; })}</div></>}
          </div>
        )}
      </div>
    </Modal>
  );
}
function ArtIcon({ a, size = 13 }) {
  if (a.icon) return <I name={a.icon} size={size} color={a.color || '#aab4c8'} />;
  if (a.objType) return <I name={a.objType} size={size} color={TYPE_COLOR[a.objType] || '#aab4c8'} />;
  const m = { tool: 'move', entity: 'world', io: 'io', object: 'cube3', attr: 'key', track: 'film', scheme: 'scheme', logic: 'scheme', ui: 'info' };
  return <I name={m[a.cat] || 'info'} size={size} color={a.color || '#8a93a8'} />;
}

// F1: статья про то, что под мышкой (ближайший data-learn)
export function useF1(open) {
  const last = useRef(null);
  useEffect(() => {
    const over = (e) => { last.current = e.target; };
    const key = (e) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      const el = last.current && last.current.closest ? last.current.closest('[data-learn]') : null;
      open(el ? el.getAttribute('data-learn') : null);
    };
    window.addEventListener('mouseover', over, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mouseover', over, true); window.removeEventListener('keydown', key); };
  }, [open]);
}

// ---------- картинки «как выглядит» (маленькие схемы SVG) ----------
export function Illus({ look, a }) {
  const W = 300, H = 130;
  const ground = <><rect x="0" y="0" width={W} height={H} fill="#2a3442" /><rect x="0" y="92" width={W} height="38" fill="#3c5a2c" /><rect x="0" y="92" width={W} height="5" fill="#5b8a3a" /></>;
  const icon = (name, x, y, color, s = 22) => <g transform={'translate(' + x + ' ' + y + ')'}><rect x="-4" y="-4" width={s + 8} height={s + 8} rx="5" fill="#1d1f24" stroke={color} strokeWidth="1.5" /><I name={name} size={s} color={color} sw={1.8} /></g>;
  let body;
  switch (look) {
    case 'entity': {
      const t = (a && a.entType) || 'trigger_zone';
      const d = ENT_TYPES[t] || {};
      body = <>{ground}
        {t === 'trigger_zone' && <g><path d="M90 92 L150 104 L210 92 L150 80z" fill="rgba(224,160,64,0.18)" stroke="#e0a040" /><path d="M90 92 V48 L150 36 L210 48 V92 M150 80 V36 M90 48 L150 60 L210 48 M150 60 V104" fill="rgba(224,160,64,0.08)" stroke="#e0a040" strokeDasharray="4 3" /></g>}
        {t === 'player_start' && <g stroke="#6cd06c" strokeWidth="2.5" fill="none"><circle cx="150" cy="52" r="6" /><path d="M150 58v20M140 66h20M150 78l-8 14M150 78l8 14M162 86h26M182 80l7 6-7 6" /></g>}
        {icon(d.icon || 'info', 138, 14, d.color || '#ccc')}
        <text x="150" y="9" fill="#e8e8e8" fontSize="10" textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke="#000" strokeWidth="2">{d.label}</text>
        <text x="8" y="124" fill="#cde" fontSize="10">в редакторе — значок{t === 'trigger_zone' ? ' и коробка' : ''}; при F5 не видно</text></>;
      break;
    }
    case 'io':
      body = <><rect width={W} height={H} fill="#262a30" />
        {[[14, 'Зона', '#e0a040', 'ent_zone'], [112, 'Сцена', '#9fb0ff', 'film'], [210, 'Сообщ.', '#e0e0e0', 'ent_message']].map(([x, l, c, ic]) => <g key={l}><rect x={x} y="38" width="76" height="46" rx="5" fill="#1d1f24" stroke={c} /><g transform={'translate(' + (x + 6) + ' 46)'}><I name={ic} size={16} color={c} /></g><text x={x + 28} y="59" fill="#ddd" fontSize="11">{l}</text></g>)}
        <path d="M90 61h20M188 61h20" stroke="#ffd84a" strokeWidth="2" markerEnd="url(#ia)" />
        <defs><marker id="ia" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 8 4 0 8z" fill="#ffd84a" /></marker></defs>
        <text x="96" y="30" fill="#ffd84a" fontSize="9.5">Вошёл → Запустить</text><text x="186" y="104" fill="#ffd84a" fontSize="9.5">Закончилась → Показать</text></>;
      break;
    case 'keys': case 'curves':
      body = <><rect width={W} height={H} fill="#2b2b2b" /><path d="M10 26h280" stroke="#555" />{[0, 1, 2, 3, 4, 5].map((k) => <text key={k} x={12 + k * 54} y="20" fill="#999" fontSize="9">{k * 2} с</text>)}
        <path d="M20 100 C70 100 80 50 130 50 S210 90 270 40" fill="none" stroke="#e05050" strokeWidth="2" />
        {[[20, 100], [130, 50], [270, 40]].map(([x, y], i) => <g key={i}><path d={`M${x} ${y - 6} l6 6 -6 6 -6 -6z`} fill="#e6c23c" /><path d={`M${x} 32 l5 5 -5 5 -5 -5z`} fill="#e6c23c" /></g>)}
        <line x1="160" x2="160" y1="26" y2={H} stroke="#7c8bff" /><text x="164" y="124" fill="#9fb0ff" fontSize="9">бегунок</text></>;
      break;
    case 'sky': {
      body = <><defs><linearGradient id="skyg" x1="0" x2="1"><stop offset="0" stopColor="#0d1530" /><stop offset="0.25" stopColor="#f2a65a" /><stop offset="0.5" stopColor="#6fb4ff" /><stop offset="0.75" stopColor="#f08a4b" /><stop offset="1" stopColor="#0d1530" /></linearGradient></defs>
        <rect width={W} height={H} fill="url(#skyg)" opacity="0.85" /><path d="M10 110 Q150 -30 290 110" fill="none" stroke="#fff" strokeOpacity="0.6" strokeDasharray="3 3" />
        <circle cx="220" cy="48" r="10" fill="#ffd84a" /><circle cx="40" cy="96" r="7" fill="#e8e8ff" />
        {[['00:00', 10], ['06:00', 75], ['12:00', 150], ['18:00', 225], ['00:00', 278]].map(([l, x], i) => <text key={i} x={x} y="126" fill="#fff" fontSize="9.5" textAnchor="middle">{l}</text>)}
        <text x="150" y="16" fill="#fff" fontSize="10" textAnchor="middle">18:00 → 06:00: время идёт вперёд, через ночь</text></>;
      break;
    }
    case 'link':
      body = <><rect width={W} height={H} fill="#262a30" /><text x="16" y="24" fill="#ffc861" fontSize="11">Небо.Время</text><text x="190" y="24" fill="#f2d76b" fontSize="11">Свет.Яркость</text>
        <path d="M30 100 L120 100 L170 40 L270 40" fill="none" stroke="#9fd0ff" strokeWidth="2" />
        <text x="110" y="116" fill="#bbb" fontSize="9">18:00 → 0</text><text x="166" y="34" fill="#bbb" fontSize="9">20:00 → 15</text></>;
      break;
    case 'camera':
      body = <>{ground}<path d="M70 60 L210 30 L210 96z" fill="rgba(124,139,255,0.15)" stroke="#a6b4c8" />{icon('camera', 50, 48, '#a6b4c8')}<text x="10" y="124" fill="#cde" fontSize="10">в редакторе: пирамида обзора с именем; в сцене — вид игрока</text></>;
      break;
    case 'scheme':
      body = <><rect width={W} height={H} fill="#262a30" />{[[12, 'Событие', '#e5534b'], [110, 'Условие', '#e6c13c'], [208, 'Действие', '#4f9cf5']].map(([x, l, c]) => <g key={l}><rect x={x} y="44" width="80" height="40" rx="4" fill="#1d1f24" stroke={c} /><rect x={x} y="44" width="80" height="12" rx="4" fill={c} /><text x={x + 6} y="76" fill="#ddd" fontSize="10.5">{l}</text></g>)}<path d="M92 64h16M190 64h16" stroke="#aaa" strokeWidth="2" /></>;
      break;
    case 'build':
      body = <>{ground}{[[110, 70], [134, 70], [158, 70], [122, 52], [146, 52]].map(([x, y], i) => <g key={i}><path d={`M${x} ${y} l12 -7 l12 7 l-12 7z`} fill="#9c7a4a" /><path d={`M${x} ${y} v18 l12 7 v-18z`} fill="#7a5c34" /><path d={`M${x + 24} ${y} v18 l-12 7 v-18z`} fill="#5f4728" /></g>)}<rect x="96" y="30" width="96" height="72" fill="none" stroke="#ff9a3c" strokeDasharray="5 3" /><text x="10" y="124" fill="#cde" fontSize="10">рамка — оранжевая, призрак — прозрачный голубой</text></>;
      break;
    case 'play':
      body = <><rect width={W} height={H} fill="#262a30" /><g transform="translate(30 40)"><path d="M0 0v40l32-20z" fill="#6cc04a" /></g><text x="76" y="56" fill="#ddd" fontSize="11">F5 — играть: мир размораживается,</text><text x="76" y="72" fill="#ddd" fontSize="11">игрок на «Старте игрока»</text><path d="M60 100 a40 14 0 1 0 0 -1" fill="none" stroke="#e8c070" strokeDasharray="4 3" /><text x="110" y="112" fill="#e8c070" fontSize="10">Стоп — всё как было</text></>;
      break;
    case 'project':
      body = <><rect width={W} height={H} fill="#262a30" /><g transform="translate(30 30)"><I name="project" size={60} color="#9fb0ff" sw={1.2} /></g><text x="110" y="52" fill="#ddd" fontSize="11">studio/projects/&lt;проект&gt;</text><text x="110" y="70" fill="#ddd" fontSize="11">+ свой мир в saves/</text><text x="110" y="88" fill="#999" fontSize="10">открыт только один</text></>;
      break;
    case 'gizmo':
      body = <>{ground}<g><path d="M150 70 h60" stroke="#e05050" strokeWidth="3" /><path d="M150 70 v-50" stroke="#63c34a" strokeWidth="3" /><path d="M150 70 l-40 24" stroke="#4f86ee" strokeWidth="3" /></g><text x="214" y="74" fill="#e05050" fontSize="11">X</text><text x="146" y="16" fill="#63c34a" fontSize="11">Y</text><text x="98" y="104" fill="#4f86ee" fontSize="11">Z</text></>;
      break;
    default:
      body = <><rect width={W} height={H} fill="#2b2b2b" /><rect x="20" y="20" width="260" height="90" rx="4" fill="#323232" stroke="#444" /><g transform="translate(36 40)">{a ? <ArtIcon a={a} size={40} /> : <I name="info" size={40} />}</g><text x="96" y="66" fill="#ccc" fontSize="11">{a ? a.title : 'Студия'}</text></>;
  }
  return <svg className="c4-illus" viewBox={'0 0 ' + W + ' ' + H} width={W} height={H}>{body}</svg>;
}
