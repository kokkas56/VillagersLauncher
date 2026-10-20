// Таймлайн в духе C4D: кнопки проигрывания, линейка, дорожка «Монтаж (Stage)», ключи выбранных объектов (ромбы,
// тянуть — сдвинуть по времени), дорожки событий актёров и сцены, режим «Кривые» (F-кривые с касательными).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from './core.jsx';
import I, { TypeIcon, TYPE_COLOR } from './icons.jsx';
import { useMenu, MenuView } from './Menus.jsx';
import { objById, allKeyTimes, isAnimated, CHANNEL_LABEL, CHANNELS, evalKeys, keySlopes, INTERP_LABEL, isStepChannel, activeCamera } from '../scene3d.js';
import { retimeKey, retimeAllKeys, stageSet, stageCutAt, setKeyField, keyAllSelected, patchObj } from './ops.js';
import { TRACKS, VERB_DEFS, summary } from '../schema.js';
import { fmtTicks, newEvent } from '../model.js';

const ROW = 20;
const STAGE_H = 24;
const PAD_L = 10;
const STEPS = [1, 2, 5, 10, 20, 40, 100, 200, 400, 600, 1200, 2400, 6000];
const CH_COLOR = { 'pos.x': '#e05050', 'pos.y': '#63c34a', 'pos.z': '#4f86ee', 'rot.h': '#e8913a', 'rot.p': '#c66bd6', 'rot.b': '#5bc8c8', fov: '#e6c23c', shake: '#a0a0a0', on: '#f2d76b', level: '#f2d76b', play: '#7cc4f5', vol: '#7cc4f5', strength: '#b38cf0' };
const trKey = (tr) => (tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind);

export default function Timeline({ act, height }) {
  const core = useStudio();
  const { scene, time, setTime, hp, edit, gesture, sel, setSel, selKeys, setSelKeys, playing, setPlaying, autoKey, setAutoKey } = core;
  const [mode, setMode] = useState('keys'); // keys | curves
  const [open, setOpen] = useState({}); // раскрытые объекты (каналы)
  const [onlySel, setOnlySel] = useState(false);
  const [view, setView] = useState({ s: 2, x0: 0 });
  const [W, setW] = useState(800);
  const [menu, openMenu, closeMenu] = useMenu();
  const lanesRef = useRef(null);
  const headsRef = useRef(null);
  const rulerRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const len = (scene && scene.length) || 200;

  useLayoutEffect(() => {
    const el = rulerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, [mode, !!scene]); // eslint-disable-line
  const fit = () => setView({ s: Math.max(0.05, (W - PAD_L - 30) / Math.max(len, 40)), x0: 0 });
  useEffect(() => { fit(); }, [scene && scene.id, W > 200]); // eslint-disable-line
  const X = (t) => (t - view.x0) * view.s + PAD_L;
  const T = (x) => (x - PAD_L) / view.s + view.x0;

  // колесо: масштаб вокруг курсора, Shift — прокрутка
  useEffect(() => {
    const els = [lanesRef.current, rulerRef.current].filter(Boolean);
    const onWheel = (e) => {
      if (mode === 'curves' && e.currentTarget === lanesRef.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const v = viewRef.current;
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { setView({ ...v, x0: Math.max(-20 / v.s, v.x0 + (e.deltaX || e.deltaY) / v.s) }); return; }
      const s2 = Math.min(40, Math.max(0.05, v.s * Math.exp(-e.deltaY * 0.0015)));
      const tc = (mx - PAD_L) / v.s + v.x0;
      setView({ s: s2, x0: Math.max(-20 / s2, tc - (mx - PAD_L) / s2) });
    };
    els.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, [mode, !!scene]); // eslint-disable-line

  // строки
  const rows = useMemo(() => {
    if (!scene) return [];
    const r = [{ kind: 'stage', h: STAGE_H }];
    const selSet = new Set(sel.objs);
    const objs = scene.objects.filter((o) => selSet.has(o.id) || (!onlySel && Object.keys(o.anim || {}).some((ch) => isAnimated(o, ch))));
    r.push({ kind: 'grp', label: 'Объекты', hint: 'Ключи выбранных и всех анимированных объектов. ▸ — раскрыть по свойствам.', h: ROW });
    if (!objs.length) r.push({ kind: 'note', label: 'нет ключей — выбери объект и нажми ◇ или F9', h: ROW });
    for (const o of objs) {
      if (o.type === 'actor') continue;
      r.push({ kind: 'obj', o, h: ROW });
      if (open[o.id]) {
        const chs = selSet.has(o.id) ? (CHANNELS[o.type] || []).concat(isAnimated(o, 'look') ? ['look'] : []) : Object.keys(o.anim || {}).filter((ch) => isAnimated(o, ch));
        for (const ch of chs) r.push({ kind: 'ch', o, ch, h: ROW });
      }
    }
    r.push({ kind: 'grp', label: 'События', hint: 'Что происходит в сцене: действия актёров, эффекты, звук, субтитры, мир. Правый клик по дорожке — добавить событие.', h: ROW });
    for (const a of scene.actors || []) r.push({ kind: 'ev', key: 'actor:' + a.id, label: a.name || a.id, track: 'actor', h: ROW });
    for (const k of ['fx', 'sound', 'subtitles', 'world']) r.push({ kind: 'ev', key: k, label: TRACKS[k].label, track: k, h: ROW });
    let y = 0;
    for (const row of r) { row.y = y; y += row.h; }
    return r;
  }, [scene, sel.objs, open, onlySel]);
  const totalH = rows.reduce((a, r) => a + r.h, 0);

  if (!scene) return <div className="c4-tl" style={{ height }}><div className="c4-tree-empty" style={{ padding: 18 }}>Сцена не открыта. Таймлайн нужен катсценам: двойной щелчок по сцене в «Объектах» → «Сцены» или «+» вверху. Сущности мира (слева) работают и без сцены.</div></div>;

  // ---------- перетаскивание ----------
  const drag = (e, { onMove, onEnd, cursor = 'ew-resize' }) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 3) return;
      if (!moved) { moved = true; gesture(); document.body.style.cursor = cursor; }
      onMove(ev.clientX - x0, ev.clientY - y0, ev);
    };
    const up = (ev) => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; onEnd && onEnd(moved, ev); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };
  const scrubRuler = (e) => {
    const r = rulerRef.current.getBoundingClientRect();
    const set = (cx) => setTime(Math.min(len, Math.max(0, Math.round(T(cx - r.left)))));
    set(e.clientX);
    setPlaying(false);
    const mv = (ev) => set(ev.clientX);
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };
  const isKeySel = (oid, ch, t) => selKeys.some((k) => k.obj === oid && (ch == null || k.ch === ch) && k.t === t);
  const pickKeys = (e, keys) => {
    if (e.shiftKey || e.ctrlKey) setSelKeys((cur) => [...cur.filter((k) => !keys.some((x) => x.obj === k.obj && x.ch === k.ch && x.t === k.t)), ...keys]);
    else setSelKeys(keys);
  };
  const keyDrag = (e, o, ch, t) => {
    const keys = ch ? [{ obj: o.id, ch, t }] : Object.keys(o.anim || {}).filter((c) => (o.anim[c] || []).some((k) => k.t === t)).map((c) => ({ obj: o.id, ch: c, t }));
    pickKeys(e, keys);
    setTime(t);
    let cur = t;
    drag(e, {
      onMove: (dx) => {
        const nt = Math.max(0, Math.round(t + dx / view.s));
        if (nt === cur) return;
        edit((s) => (ch ? retimeKey(s, o.id, ch, cur, nt) : retimeAllKeys(s, o.id, cur, nt)), { silent: true });
        cur = nt;
        setTime(nt);
        setSelKeys(keys.map((k) => ({ ...k, t: nt })));
      }
    });
  };
  const keyMenu = (e, o, ch, t) => {
    const chs = ch ? [ch] : Object.keys(o.anim || {}).filter((c) => (o.anim[c] || []).some((k) => k.t === t));
    openMenu(e, [
      { head: 'Ключ ' + t + ' т' },
      ...Object.entries(INTERP_LABEL).map(([v, l]) => ({ label: l, hint: v === 'bezier' ? 'Плавный разгон и торможение (как в C4D по умолчанию).' : v === 'linear' ? 'Ровная скорость до следующего ключа.' : 'Значение держится до следующего ключа, потом прыгает.', run: () => edit((s) => chs.reduce((acc, c) => setKeyField(acc, o.id, c, t, { interp: v }), s)) })),
      { label: 'Авто-касательные', hint: 'Сбросить ручные наклоны кривой у ключа.', run: () => edit((s) => chs.reduce((acc, c) => setKeyField(acc, o.id, c, t, { in: undefined, out: undefined }), s)) },
      { sep: true },
      { label: 'Удалить ключ', icon: 'trash', kb: 'Del', run: () => { setSelKeys(chs.map((c) => ({ obj: o.id, ch: c, t }))); setTimeout(() => act.deleteKeys(), 0); } }
    ]);
  };
  // события
  const evDur = (kind, ev) => { const d = (VERB_DEFS[kind] || {})[kind === 'subtitles' ? 'line' : ev.do]; return Math.max(6, (d && d.dur ? d.dur(ev) : ev.ticks) || 20); };
  const evDrag = (e, key, i, ev) => {
    setSel({ objs: sel.objs, ev: { track: key, i } });
    let cur = ev.t || 0;
    drag(e, {
      onMove: (dx) => {
        const nt = Math.max(0, Math.round((ev.t || 0) + dx / view.s));
        if (nt === cur) return;
        cur = nt;
        edit((s) => ({ ...s, tracks: s.tracks.map((tr) => (trKey(tr) === key ? { ...tr, events: tr.events.map((x, j) => (j === i ? { ...x, t: nt } : x)) } : tr)) }), { silent: true });
      },
      onEnd: (moved) => {
        if (!moved) { setTime(ev.t || 0); return; }
        // отсортировать и сохранить выделение
        const s = core.sceneRef.current;
        const tr = s.tracks.find((x) => trKey(x) === key);
        if (!tr) return;
        const obj = tr.events[i];
        const sorted = tr.events.slice().sort((a, b) => a.t - b.t);
        edit((sc) => ({ ...sc, tracks: sc.tracks.map((x) => (trKey(x) === key ? { ...x, events: sorted } : x)) }), { silent: true });
        setSel({ objs: sel.objs, ev: { track: key, i: sorted.indexOf(obj) } });
      }
    });
  };
  const addEvent = (key, verb, t) => {
    const obj = newEvent(key, verb, t);
    let idx = 0;
    edit((s) => {
      const has = s.tracks.some((tr) => trKey(tr) === key);
      const tracks = has ? s.tracks.slice() : [...s.tracks, key.startsWith('actor:') ? { kind: 'actor', actor: key.slice(6), events: [] } : { kind: key, events: [] }];
      return { ...s, tracks: tracks.map((tr) => { if (trKey(tr) !== key) return tr; const evs = [...(tr.events || []), obj].sort((a, b) => a.t - b.t); idx = evs.indexOf(obj); return { ...tr, events: evs }; }) };
    });
    setSel({ objs: sel.objs, ev: { track: key, i: idx } });
  };
  const laneMenu = (e, row, tOv) => {
    const r = lanesRef.current ? lanesRef.current.getBoundingClientRect() : { left: 0 };
    const t = tOv != null ? tOv : Math.max(0, Math.round(T(e.clientX - r.left)));
    if (row.kind === 'stage') {
      const cams = scene.objects.filter((o) => o.type === 'camera');
      openMenu(e, [{ head: 'С ' + t + ' т снимает…' }, ...cams.map((c) => ({ label: c.name, icon: 'camera', hint: 'С этого момента сцену снимает «' + c.name + '».', run: () => edit((s) => stageCutAt(s, c.id, t)) })), !cams.length && { label: 'Камер нет — создай: Создать → Камера', disabled: true }]);
      return;
    }
    if (row.kind === 'ev') {
      const kind = row.track;
      const defs = VERB_DEFS[kind] || {};
      openMenu(e, [{ head: 'Добавить в ' + t + ' т' }, ...Object.entries(defs).filter(([v]) => v !== 'bake').map(([v, d]) => ({ label: d.label, hint: d.hint, run: () => addEvent(row.key, v, t) }))]);
      return;
    }
    if (row.kind === 'obj' || row.kind === 'ch') {
      openMenu(e, [{ label: 'Ключ здесь (' + t + ' т)', icon: 'key', run: () => { setTime(t); edit((s) => keyAllSelected(s, [row.o.id], t)); } }]);
    }
  };

  // ---------- линейка ----------
  const step = STEPS.find((s) => s * view.s >= 46) || 6000;
  const t0 = Math.max(0, Math.floor(view.x0 / step) * step);
  const ticks = [];
  for (let t = t0; X(t) < W + 40 && ticks.length < 500; t += step) ticks.push(t);
  const minor = STEPS[Math.max(0, STEPS.indexOf(step) - 1)] || step;
  const fmtT = (t) => (step >= 20 ? fmtTicks(t) : t + ' т');

  // ---------- кнопки ----------
  const sel1 = sel.objs.map((id) => objById(scene, id)).filter(Boolean);
  const keyTimesSel = [...new Set(sel1.flatMap((o) => allKeyTimes(o)))].sort((a, b) => a - b);
  const prevKey = () => { const k = keyTimesSel.filter((t) => t < time).pop(); if (k != null) setTime(k); };
  const nextKey = () => { const k = keyTimesSel.find((t) => t > time); if (k != null) setTime(k); };
  const cam = activeCamera(scene, time);
  return (
    <div className="c4-tl" style={{ height }}>
      <div className="c4-transport">
        <button className="c4-ib" data-learn="tl-key" onClick={() => core.gameCmd.keyAll()} {...hp('Ключ на все свойства выбранных объектов в момент бегунка (F9, как «Записать» в C4D).')}><I name="key" size={16} color="#e6c23c" /></button>
        <div className="c4-sep" />
        <button className="c4-ib" onClick={() => setTime(0)} {...hp('В начало сцены.')}><I name="first" size={15} /></button>
        <button className="c4-ib" onClick={prevKey} disabled={!keyTimesSel.length} {...hp('К предыдущему ключу выбранных объектов.')}><I name="prevkey" size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(Math.max(0, time - 1))} {...hp('На тик назад (F).')}><I name="prevframe" size={15} /></button>
        <button className={'c4-ib' + (playing ? ' on' : '')} data-learn="tl-play" onClick={() => setPlaying(!playing)} {...hp('Проиграть в Студии: бегунок едет, игра показывает позы камер и актёров (и небо). Сыграть сцену целиком как у игрока — «▶ Сцена в игре».')}><I name={playing ? 'pause' : 'play'} size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(Math.min(len, time + 1))} {...hp('На тик вперёд (G).')}><I name="nextframe" size={15} /></button>
        <button className="c4-ib" onClick={nextKey} disabled={!keyTimesSel.length} {...hp('К следующему ключу выбранных объектов.')}><I name="nextkey" size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(len)} {...hp('В конец сцены.')}><I name="last" size={15} /></button>
        <input className="c4-frame" value={time + ' т'} onChange={(e) => { const n = parseInt(e.target.value, 10); if (isFinite(n)) setTime(Math.min(len, Math.max(0, n))); }} onKeyDown={(e) => e.stopPropagation()} {...hp('Текущий момент в тиках (20 тиков = 1 секунда).')} />
        <span className="dim" style={{ minWidth: 52 }}>{fmtTicks(time)}</span>
        <div className="c4-sep" />
        <button data-learn="tl-record" className={'c4-ib c4-rec' + (autoKey ? ' on' : '')} onClick={() => setAutoKey(!autoKey)} {...hp('Автозапись ключей: пока включена, любая правка (в Атрибутах или гизмо в игре) сама ставит ключ в момент бегунка. Как «Автоключ» в C4D.')}><I name="record" size={15} color={autoKey ? '#fff' : '#e0504a'} fill={autoKey ? '#e0504a' : 'none'} /></button>
        <div className="c4-sep" />
        <div className="c4-group">
          <button className={'c4-ib wide' + (mode === 'keys' ? ' on' : '')} onClick={() => setMode('keys')} {...hp('Ключи: ромбы по времени, тяни — сдвинуть.')}><I name="key" size={13} /> Ключи</button>
          <button data-learn="tl-curves" className={'c4-ib wide' + (mode === 'curves' ? ' on' : '')} onClick={() => setMode('curves')} {...hp('Кривые (F-кривые): как меняется значение между ключами. Тяни ключи и ручки наклона; правый клик — безье/линейно/ступенька.')}><I name="curves" size={13} /> Кривые</button>
        </div>
        <button className="c4-ib wide" disabled={!selKeys.length} onClick={() => act.setInterp('bezier')} {...hp('Выбранные ключи — безье (плавно).')}>Безье</button>
        <button className="c4-ib wide" disabled={!selKeys.length} onClick={() => act.setInterp('linear')} {...hp('Выбранные ключи — линейно.')}>Линейно</button>
        <button className="c4-ib wide" disabled={!selKeys.length} onClick={() => act.setInterp('step')} {...hp('Выбранные ключи — ступенькой.')}>Ступенька</button>
        <div className="c4-sep" />
        <button className="c4-ib wide c4-play" data-learn="tl-scene-play" disabled={!core.link.connected} onClick={() => core.playInGame(false)} {...hp('▶ Сцена в игре: сыграть только эту сцену целиком, как увидит игрок (без F5 и логики проекта).')}><I name="play" size={13} /> Сцена в игре</button>
        <div className="grow" />
        <span className="dim" {...hp('Какая камера снимает в момент бегунка (по «Монтажу»).')}>{cam ? <>снимает: <b style={{ color: '#cfd6ff' }}>{cam.name}</b></> : 'камер нет'}</span>
        <div className="c4-sep" />
        <button className={'c4-ib wide' + (onlySel ? ' on' : '')} onClick={() => setOnlySel(!onlySel)} {...hp('Показывать ключи только выбранных объектов (иначе — всех анимированных).')}>Только выбранные</button>
        <button className="c4-ib" onClick={fit} {...hp('Вся сцена в ширину таймлайна.')}><I name="frame" size={15} /></button>
      </div>
      <div className="c4-tl-body">
        <div className="c4-tl-heads">
          <div className="c4-ruler-h">{mode === 'curves' ? 'Каналы' : 'Дорожки'}<span className="grow" /><span title="Длина сцены">{fmtTicks(len)}</span></div>
          {mode === 'keys' ? (
            <div className="c4-tl-heads-scroll" ref={headsRef}>
              {rows.map((row, i) => <RowHead key={i} row={row} open={open} setOpen={setOpen} act={act} laneMenu={laneMenu} />)}
            </div>
          ) : <CurveHeads />}
        </div>
        <div className="c4-tl-lanes">
          <div className="c4-ruler" data-learn="tl-ruler" ref={rulerRef} onMouseDown={scrubRuler} {...hp('Линейка времени: щёлкни или тяни — переставить бегунок. Колесо — масштаб, Shift+колесо — прокрутка. Золотой флажок — конец сцены (тяни).')}>
            <svg width={W} height={22}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={X(t)} x2={X(t)} y1={11} y2={22} stroke="#5a5a5a" />
                  <text x={X(t) + 3} y={13} fill="#a8a8a8" fontSize="10.5">{fmtT(t)}</text>
                  {minor < step && [1, 2, 3, 4].map((k) => { const tt = t + (step / 5) * k; return <line key={k} x1={X(tt)} x2={X(tt)} y1={17} y2={22} stroke="#444" />; })}
                </g>
              ))}
              <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={22} fill="rgba(0,0,0,0.28)" />
              <g style={{ cursor: 'ew-resize' }} onMouseDown={(e) => drag(e, { onMove: (dx) => edit((s) => ({ ...s, length: Math.max(1, Math.round(len + dx / view.s)) }), { silent: true }) })}>
                <line x1={X(len)} x2={X(len)} y1={0} y2={22} stroke="#e6b65c" strokeWidth="2" />
                <path d={`M${X(len)} 0 h9 l-3 4 l3 4 h-9z`} fill="#e6b65c" />
              </g>
              <g>
                <rect x={X(time) - 15} y={1} width={30} height={13} rx={2} fill="#5a6cf0" />
                <text x={X(time)} y={11} fill="#fff" fontSize="10" textAnchor="middle">{time}</text>
              </g>
            </svg>
          </div>
          {mode === 'keys' ? (
            <div className="c4-lanes" data-learn="tl-lanes" ref={lanesRef} onScroll={(e) => { if (headsRef.current) headsRef.current.scrollTop = e.currentTarget.scrollTop; }}
              onMouseDown={(e) => { if (e.button === 0 && e.target.tagName === 'svg') { setSelKeys([]); } }}>
              <svg width={W} height={Math.max(totalH, 40)}>
                <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={Math.max(totalH, 40)} fill="rgba(0,0,0,0.22)" />
                {ticks.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={totalH} stroke="#383838" />)}
                {rows.map((row, i) => <Lane key={i} row={row} X={X} W={W} view={view} len={len} keyDrag={keyDrag} keyMenu={keyMenu} isKeySel={isKeySel} evDrag={evDrag} evDur={evDur} laneMenu={laneMenu} drag={drag} />)}
                <line x1={X(time)} x2={X(time)} y1={0} y2={totalH} stroke="#7c8bff" strokeWidth="1.5" pointerEvents="none" />
              </svg>
            </div>
          ) : (
            <Curves X={X} T={T} W={W} view={view} len={len} drag={drag} keyMenu={keyMenu} lanesRef={lanesRef} />
          )}
        </div>
      </div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </div>
  );
}

function RowHead({ row, open, setOpen, act, laneMenu }) {
  const core = useStudio();
  const { hp, sel, setSel } = core;
  if (row.kind === 'stage') return <div className="c4-lhead obj" data-learn="tl-stage" style={{ height: row.h }} {...hp('«Монтаж» (Stage в C4D): какая камера снимает сцену в какой момент. Правый клик по дорожке — «с этого места снимает Камера N». Края блоков тянутся.')}><I name="stage" size={13} color="#9fb0ff" /><span className="nm">Монтаж (Stage)</span></div>;
  if (row.kind === 'grp') return <div className="c4-lhead grp" style={{ height: row.h }} {...hp(row.hint)}>{row.label}</div>;
  if (row.kind === 'note') return <div className="c4-lhead" style={{ height: row.h, color: '#777', fontStyle: 'italic' }}>—</div>;
  if (row.kind === 'obj') {
    const o = row.o;
    return (
      <div className={'c4-lhead obj' + (sel.objs.includes(o.id) ? ' sel' : '')} style={{ height: row.h }} onClick={() => setSel({ objs: [o.id] })}>
        <span className="tw" onClick={(e) => { e.stopPropagation(); setOpen((c) => ({ ...c, [o.id]: !c[o.id] })); }}>{open[o.id] ? '▾' : '▸'}</span>
        <TypeIcon type={o.type} size={12} /><span className="nm">{o.name}</span>
      </div>
    );
  }
  if (row.kind === 'ch') {
    const st = isAnimated(row.o, row.ch);
    return (
      <div className="c4-lhead ch" style={{ height: row.h }} {...hp(CHANNEL_LABEL[row.ch] + ': ' + (st ? row.o.anim[row.ch].length + ' ключ(ей)' : 'не анимирован — ◇ в Атрибутах ставит ключ'))}>
        <span className="sw" style={{ background: CH_COLOR[row.ch] || '#888' }} /><span className="nm">{CHANNEL_LABEL[row.ch] || row.ch}</span>
      </div>
    );
  }
  const color = (TRACKS[row.track] || {}).color;
  const actor = row.track === 'actor' ? core.scene.objects.find((o) => o.type === 'actor' && 'actor:' + o.actor === row.key) : null;
  return (
    <div className={'c4-lhead' + (actor && sel.objs.includes(actor.id) ? ' sel' : '')} style={{ height: row.h }} onClick={() => actor && setSel({ objs: [actor.id] })} {...hp((TRACKS[row.track] || {}).hint)}>
      <span className="sw" style={{ background: color }} /><span className="nm">{row.label}</span>
      <span className="add" title="Добавить событие в момент бегунка" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); laneMenu({ clientX: r.left, clientY: r.bottom, preventDefault() {}, stopPropagation() {} }, row, core.time); }}>+</span>
    </div>
  );
}

function Lane({ row, X, W, view, len, keyDrag, keyMenu, isKeySel, evDrag, evDur, laneMenu, drag }) {
  const core = useStudio();
  const { scene, sel, setSel, edit, hp } = core;
  const y = row.y, h = row.h, cy = y + h / 2;
  const bg = <rect x={0} y={y} width={W} height={h} fill={row.kind === 'grp' ? '#282828' : row.kind === 'stage' ? '#2c2c34' : 'transparent'} onContextMenu={(e) => laneMenu(e, row)} />;
  const border = <line x1={0} x2={W} y1={y + h - 0.5} y2={y + h - 0.5} stroke="#303030" pointerEvents="none" />;
  const diamond = (x, on, part, key) => <path key={key} d={`M${x} ${cy - 6} L${x + 6} ${cy} L${x} ${cy + 6} L${x - 6} ${cy}z`} fill={on ? '#ffe680' : part ? '#a8862a' : '#d9b232'} stroke={on ? '#fff' : '#1a1a1a'} strokeWidth="1" />;
  if (row.kind === 'stage') {
    const st = scene.stage || [];
    return (
      <g>
        {bg}
        {st.map((b, i) => {
          const c = objById(scene, b.cam);
          const x1 = X(b.t0), x2 = X(b.t1);
          const on = sel.stage === i;
          const hue = (228 + scene.objects.filter((o) => o.type === 'camera').findIndex((o) => o.id === b.cam) * 67) % 360;
          const move = (e, edge) => drag(e, { onMove: (dx) => { const d = Math.round(dx / view.s); const nb = edge === 'l' ? { t0: Math.max(0, Math.min(b.t1 - 1, b.t0 + d)) } : edge === 'r' ? { t1: Math.max(b.t0 + 1, b.t1 + d) } : { t0: Math.max(0, b.t0 + d), t1: Math.max(0, b.t0 + d) + (b.t1 - b.t0) }; edit((s) => stageSet(s, i, nb), { silent: true }); } });
          return (
            <g key={i} onContextMenu={(e) => laneMenu(e, row)}>
              <rect x={x1 + 1} y={y + 3} width={Math.max(2, x2 - x1 - 2)} height={h - 6} rx={3} fill={`hsl(${hue} 32% ${on ? 46 : 34}%)`} stroke={on ? '#c8d0ff' : '#1c1c1c'} style={{ cursor: 'grab' }}
                onMouseDown={(e) => { if (e.button !== 0) return; setSel({ stage: i }); move(e, 'm'); }} {...hp('Блок «Монтажа»: «' + (c ? c.name : b.cam) + '» снимает с ' + b.t0 + ' по ' + b.t1 + ' т. Тяни — сдвинуть, края — изменить.')} />
              <clipPath id={'stc' + i}><rect x={x1 + 4} y={y} width={Math.max(0, x2 - x1 - 8)} height={h} /></clipPath>
              <text x={x1 + 8} y={cy + 4} fill="#eef" fontSize="11" clipPath={`url(#stc${i})`} pointerEvents="none">🎥 {c ? c.name : '(нет камеры ' + b.cam + ')'}</text>
              <rect x={x1} y={y + 3} width={5} height={h - 6} fill="transparent" style={{ cursor: 'ew-resize' }} onMouseDown={(e) => { setSel({ stage: i }); move(e, 'l'); }} />
              <rect x={x2 - 5} y={y + 3} width={5} height={h - 6} fill="transparent" style={{ cursor: 'ew-resize' }} onMouseDown={(e) => { setSel({ stage: i }); move(e, 'r'); }} />
            </g>
          );
        })}
        {!st.length && <text x={14} y={cy + 4} fill="#777" fontSize="11" pointerEvents="none">правый клик — какая камера снимает с этого места</text>}
        {border}
      </g>
    );
  }
  if (row.kind === 'grp' || row.kind === 'note') return <g>{bg}{border}</g>;
  if (row.kind === 'obj') {
    const o = row.o;
    const times = allKeyTimes(o);
    return (
      <g>
        {bg}
        {times.length > 1 && <line x1={X(times[0])} x2={X(times[times.length - 1])} y1={cy} y2={cy} stroke={TYPE_COLOR[o.type] || '#888'} strokeOpacity="0.35" strokeWidth="3" pointerEvents="none" />}
        {times.map((t) => {
          const chs = Object.keys(o.anim || {}).filter((c) => (o.anim[c] || []).some((k) => k.t === t));
          const all = chs.length === Object.keys(o.anim || {}).filter((c) => isAnimated(o, c)).length;
          return <g key={t} style={{ cursor: 'ew-resize' }} onMouseDown={(e) => e.button === 0 && keyDrag(e, o, null, t)} onContextMenu={(e) => keyMenu(e, o, null, t)}>
            {diamond(X(t), isKeySel(o.id, null, t), !all, t)}
            <title>{o.name}: ключ {t} т ({chs.map((c) => CHANNEL_LABEL[c] || c).join(', ')})</title>
          </g>;
        })}
        {border}
      </g>
    );
  }
  if (row.kind === 'ch') {
    const keys = isAnimated(row.o, row.ch) ? row.o.anim[row.ch] : [];
    return (
      <g>
        {bg}
        {keys.map((k) => (
          <g key={k.t} style={{ cursor: 'ew-resize' }} onMouseDown={(e) => e.button === 0 && keyDrag(e, row.o, row.ch, k.t)} onContextMenu={(e) => keyMenu(e, row.o, row.ch, k.t)}>
            {diamond(X(k.t), isKeySel(row.o.id, row.ch, k.t), false, k.t)}
            <title>{CHANNEL_LABEL[row.ch]}: {String(k.v)} в {k.t} т · {INTERP_LABEL[k.interp || 'bezier']}</title>
          </g>
        ))}
        {border}
      </g>
    );
  }
  // события
  const tr = (scene.tracks || []).find((x) => trKey(x) === row.key);
  const evs = (tr && tr.events) || [];
  const color = (TRACKS[row.track] || {}).color || '#888';
  const actorsList = scene.actors || [];
  return (
    <g>
      {bg}
      {evs.map((ev, i) => {
        const x1 = X(ev.t || 0), w = Math.max(10, evDur(row.track, ev) * view.s);
        const on = sel.ev && sel.ev.track === row.key && sel.ev.i === i;
        const label = summary(row.track, ev, actorsList);
        return (
          <g key={i} style={{ cursor: 'grab' }} onMouseDown={(e) => e.button === 0 && evDrag(e, row.key, i, ev)} onContextMenu={(e) => laneMenu(e, row)}>
            <rect x={x1} y={y + 3} width={w} height={h - 6} rx={2} fill={color} fillOpacity={on ? 0.75 : 0.38} stroke={on ? '#fff' : color} strokeOpacity={on ? 1 : 0.6} />
            <clipPath id={'ec' + row.key.replace(/[^a-z0-9]/gi, '') + i}><rect x={x1 + 2} y={y} width={Math.max(0, w - 4)} height={h} /></clipPath>
            <text x={x1 + 4} y={cy + 4} fill="#f2f2f2" fontSize="10.5" clipPath={`url(#ec${row.key.replace(/[^a-z0-9]/gi, '')}${i})`} pointerEvents="none">{label}</text>
            <title>{label} · {fmtTicks(ev.t || 0)}</title>
          </g>
        );
      })}
      {border}
    </g>
  );
}

// ---------- F-кривые ----------
// время суток (идёт по кругу) и цвета на кривых не показываем — их правят ключами
const NO_CURVE = ['time', 'fogColor', 'skyColor'];
function CurveHeads() {
  const core = useStudio();
  const objs = core.sel.objs.map((id) => objById(core.scene, id)).filter(Boolean);
  if (!objs.length) return <div className="c4-tree-empty">Выбери объект — здесь будут его кривые.</div>;
  return (
    <div className="c4-tl-heads-scroll" style={{ overflowY: 'auto' }}>
      {objs.map((o) => (
        <React.Fragment key={o.id}>
          <div className="c4-lhead obj"><TypeIcon type={o.type} size={12} /><span className="nm">{o.name}</span></div>
          {Object.keys(o.anim || {}).filter((ch) => isAnimated(o, ch) && !isStepChannel(ch) && !NO_CURVE.includes(ch)).map((ch) => (
            <div key={ch} className="c4-lhead ch"><span className="sw" style={{ background: CH_COLOR[ch] || '#888' }} /><span className="nm">{CHANNEL_LABEL[ch] || ch}</span><span className="dim">{o.anim[ch].length}</span></div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function Curves({ X, T, W, len, drag, keyMenu, lanesRef }) {
  const core = useStudio();
  const { scene, sel, time, edit, selKeys, setSelKeys, hp } = core;
  const boxRef = useRef(null);
  const [H, setH] = useState(120);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setH(Math.max(40, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const curves = [];
  for (const id of sel.objs) {
    const o = objById(scene, id);
    if (!o) continue;
    for (const ch of Object.keys(o.anim || {})) if (isAnimated(o, ch) && !isStepChannel(ch) && !NO_CURVE.includes(ch) && o.anim[ch].every((k) => typeof k.v === 'number')) curves.push({ o, ch, keys: o.anim[ch] });
  }
  // диапазон значений
  let lo = Infinity, hi = -Infinity;
  for (const c of curves) for (const k of c.keys) { lo = Math.min(lo, k.v); hi = Math.max(hi, k.v); }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const Y = (v) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  const V = (y) => lo + ((H - 8 - y) / (H - 16)) * (hi - lo);
  const isSel = (c, t) => selKeys.some((k) => k.obj === c.o.id && k.ch === c.ch && k.t === t);
  const keyDown = (e, c, k) => {
    if (e.button !== 0) return;
    const pick = { obj: c.o.id, ch: c.ch, t: k.t };
    setSelKeys(e.shiftKey ? [...selKeys, pick] : [pick]);
    core.setTime(k.t);
    let curT = k.t;
    drag(e, {
      cursor: 'move',
      onMove: (dx, dy) => {
        const nt = Math.max(0, Math.round(k.t + dx / (X(1) - X(0))));
        const nv = Math.round(V(Y(k.v) + dy) * 1000) / 1000;
        edit((s) => patchObj(s, c.o.id, (o) => {
          let keys = o.anim[c.ch].filter((q) => q.t !== nt || q.t === curT).map((q) => (q.t === curT ? { ...q, t: nt, v: nv } : q)).sort((a, b) => a.t - b.t);
          return { ...o, anim: { ...o.anim, [c.ch]: keys } };
        }), { silent: true });
        curT = nt;
        setSelKeys([{ ...pick, t: nt }]);
      }
    });
  };
  const handleDown = (e, c, k, side) => {
    const dt = Math.max(4, ((c.keys[c.keys.indexOf(k) + (side === 'out' ? 1 : -1)] || {}).t - k.t || 20) / 3);
    drag(e, {
      cursor: 'move',
      onMove: (dx, dy, ev) => {
        const r = boxRef.current.getBoundingClientRect();
        const hx = ev.clientX - r.left, hy = ev.clientY - r.top;
        const ht = T(hx) - k.t;
        if (Math.abs(ht) < 0.5) return;
        const slope = (V(hy) - k.v) / ht;
        const patch = ev.altKey ? { [side]: slope } : { in: slope, out: slope, interp: k.interp === 'step' ? 'bezier' : k.interp };
        edit((s) => setKeyField(s, c.o.id, c.ch, k.t, patch), { silent: true });
      }
    });
    void dt;
  };
  const step = Math.max(1, Math.round(3 / (X(1) - X(0))));
  return (
    <div className="c4-lanes" ref={(el) => { boxRef.current = el; lanesRef.current = el; }} style={{ overflow: 'hidden' }} onMouseDown={(e) => { if (e.target.tagName === 'svg') setSelKeys([]); }}
      {...hp('Кривые: по горизонтали время, по вертикали значение. Тяни ключи (квадраты); у выбранного ключа — ручки наклона (Alt — только одна сторона). Правый клик — безье/линейно/ступенька.')}>
      <svg width={W} height={H}>
        <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={H} fill="rgba(0,0,0,0.22)" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="#383838" /><text x={4} y={Y(v) - 2} fill="#777" fontSize="10">{Math.round(v * 100) / 100}</text></g>; })}
        {!curves.length && <text x={W / 2} y={H / 2} fill="#777" fontSize="12" textAnchor="middle">{sel.objs.length ? 'У выбранного нет числовых ключей — поставь ◇ в «Атрибутах»' : 'Выбери анимированный объект'}</text>}
        {curves.map((c) => {
          const pts = [];
          const a = Math.max(0, Math.floor(T(0))), b = Math.min(Math.max(len, c.keys[c.keys.length - 1].t), Math.ceil(T(W)));
          for (let t = a; t <= b; t += step) pts.push(X(t) + ',' + Y(evalKeys(c.keys, t, c.ch)));
          return (
            <g key={c.o.id + c.ch}>
              <polyline points={pts.join(' ')} fill="none" stroke={CH_COLOR[c.ch] || '#aaa'} strokeWidth="1.6" />
              {c.keys.map((k, i) => {
                const on = isSel(c, k.t);
                const sl = keySlopes(c.keys, i);
                const span = 18 / (X(1) - X(0));
                return (
                  <g key={k.t}>
                    {on && (k.interp || 'bezier') === 'bezier' && <>
                      <line x1={X(k.t - span)} y1={Y(k.v - sl.in * span)} x2={X(k.t + span)} y2={Y(k.v + sl.out * span)} stroke="#bbb" strokeDasharray="2 2" />
                      <circle cx={X(k.t - span)} cy={Y(k.v - sl.in * span)} r={3.5} fill="#ddd" style={{ cursor: 'move' }} onMouseDown={(e) => handleDown(e, c, k, 'in')} />
                      <circle cx={X(k.t + span)} cy={Y(k.v + sl.out * span)} r={3.5} fill="#ddd" style={{ cursor: 'move' }} onMouseDown={(e) => handleDown(e, c, k, 'out')} />
                    </>}
                    <rect x={X(k.t) - 4} y={Y(k.v) - 4} width={8} height={8} fill={on ? '#fff' : CH_COLOR[c.ch] || '#aaa'} stroke="#111" style={{ cursor: 'move' }}
                      onMouseDown={(e) => keyDown(e, c, k)} onContextMenu={(e) => keyMenu(e, c.o, c.ch, k.t)}>
                      <title>{CHANNEL_LABEL[c.ch]}: {k.v} в {k.t} т</title>
                    </rect>
                  </g>
                );
              })}
            </g>
          );
        })}
        <line x1={X(time)} x2={X(time)} y1={0} y2={H} stroke="#7c8bff" strokeWidth="1.5" pointerEvents="none" />
      </svg>
    </div>
  );
}
