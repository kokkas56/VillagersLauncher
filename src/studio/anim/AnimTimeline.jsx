// «Анимации»: таймлайн — как у сцен: линейка, ромбы ключей по костям (▸ — по каналам), рамка выбора, перетаскивание
// выбранных ключей, Ctrl+C / Ctrl+V, Del, правый клик — плавность; режим «Кривые» (X/Y/Z канала выбранной кости);
// дорожка «События» (звук, частицы, предмет, сигнал); золотой флажок — длина анимации.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import I from '../c4d/icons.jsx';
import { useMenu, MenuView } from '../c4d/Menus.jsx';
import { CHANNELS, CHANNEL_RU, EASES, EASE_RU, boneRu, sampleKeys, keyTimes, fmtT, EVENT_KINDS } from './animCore.js';
import { keyId, expandBoneKeys, shiftKeys, setEase, valueAt, setKeyComp } from './animOps.js';

const ROW = 20;
const PAD_L = 10;
const STEPS = [1, 2, 5, 10, 20, 40, 100, 200, 400, 1200];
const CH_COLOR = { rot: '#e8913a', pos: '#63c34a', scale: '#5bc8c8' };
const COMP_COLOR = ['#e05050', '#63c34a', '#4f86ee'];
const EV_COLOR = { sound: '#7cc4f5', particle: '#b38cf0', item: '#e6c23c', face: '#f08080', signal: '#e5534b' };
export const evKind = (e) => EVENT_KINDS.map((x) => x[0]).find((k) => e[k] !== undefined) || 'signal';

export default function AnimTimeline({ anim, bones, time, setTime, playing, setPlaying, selBone, setSelBone, selKeys, setSelKeys, edit, gesture, height, hp, act, selEv, setSelEv, loopPreview, setLoopPreview }) {
  const [mode, setMode] = useState('keys');
  const [open, setOpen] = useState({});
  const [box, setBox] = useState(null);
  const [view, setView] = useState({ s: 8, x0: 0 });
  const [W, setW] = useState(800);
  const [curveCh, setCurveCh] = useState('rot');
  const [menu, openMenu, closeMenu] = useMenu();
  const lanesRef = useRef(null), headsRef = useRef(null), rulerRef = useRef(null);
  const viewRef = useRef(view); viewRef.current = view;
  const len = anim ? anim.length : 40;

  useLayoutEffect(() => {
    const el = rulerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el); setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, [mode, !!anim]); // eslint-disable-line
  const fit = () => setView({ s: Math.max(0.2, (W - PAD_L - 30) / Math.max(len, 10)), x0: 0 });
  useEffect(() => { fit(); }, [anim && anim.id, W > 200]); // eslint-disable-line
  const X = (t) => (t - view.x0) * view.s + PAD_L;
  const T = (x) => (x - PAD_L) / view.s + view.x0;
  useEffect(() => {
    const els = [lanesRef.current, rulerRef.current].filter(Boolean);
    const onWheel = (e) => {
      if (mode === 'curves' && e.currentTarget === lanesRef.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - r.left, v = viewRef.current;
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { setView({ ...v, x0: Math.max(-20 / v.s, v.x0 + (e.deltaX || e.deltaY) / v.s) }); return; }
      const s2 = Math.min(60, Math.max(0.2, v.s * Math.exp(-e.deltaY * 0.0015)));
      const tc = (mx - PAD_L) / v.s + v.x0;
      setView({ s: s2, x0: Math.max(-20 / s2, tc - (mx - PAD_L) / s2) });
    };
    els.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, [mode, !!anim]); // eslint-disable-line

  if (!anim) return <div className="c4-tl" style={{ height }}><div className="c4-tree-empty" style={{ padding: 18 }}>Анимация не открыта. Выбери её слева в «Библиотеке» или нажми «+ Новая».</div></div>;

  // строки
  const rows = [];
  rows.push({ kind: 'grp', label: 'Кости', hint: 'Ключи по костям. ▸ — раскрыть по каналам (поворот, сдвиг, размер). Щёлкни строку — выбрать кость.' });
  for (const b of bones) {
    rows.push({ kind: 'bone', bone: b });
    if (open[b]) for (const ch of CHANNELS) if ((anim.tracks[b] && anim.tracks[b][ch]) || b === selBone) rows.push({ kind: 'ch', bone: b, ch });
  }
  rows.push({ kind: 'grp', label: 'События', hint: 'Звук, частицы, предмет в руке, лицо, сигнал — в нужный момент. Правый клик по дорожке — добавить.' });
  rows.push({ kind: 'ev' });
  let yy = 0;
  for (const r of rows) { r.y = yy; r.h = ROW; yy += ROW; }
  const totalH = yy;

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
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const scrubRuler = (e) => {
    const r = rulerRef.current.getBoundingClientRect();
    const set = (cx) => setTime(Math.min(len, Math.max(0, Math.round(T(cx - r.left)))));
    set(e.clientX); setPlaying(false);
    const mv = (ev) => set(ev.clientX);
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const isSel = (bone, ch, t) => selKeys.some((k) => k.bone === bone && (ch == null || k.ch === ch) && k.t === t);
  const pickKeys = (e, keys, cur0) => {
    const cur = cur0 || selKeys;
    if (e.ctrlKey || e.metaKey) {
      const all = keys.every((k) => cur.some((x) => keyId(x) === keyId(k)));
      return all ? cur.filter((x) => !keys.some((k) => keyId(k) === keyId(x))) : [...cur.filter((x) => !keys.some((k) => keyId(k) === keyId(x))), ...keys];
    }
    if (e.shiftKey) return [...cur.filter((x) => !keys.some((k) => keyId(k) === keyId(x))), ...keys];
    return keys;
  };
  const dragKeys = (e, clicked, t) => {
    const already = clicked.length && clicked.every((k) => isSel(k.bone, k.ch, k.t));
    const next = already && !e.shiftKey && !e.ctrlKey && !e.metaKey ? selKeys : pickKeys(e, clicked);
    setSelKeys(next);
    if ((e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); return; }
    const a0 = anim;
    const tMin = Math.min(...next.map((k) => k.t));
    let curD = 0;
    drag(e, {
      onMove: (dx) => {
        const d = Math.max(-tMin, Math.round(dx / view.s));
        if (d === curD) return;
        curD = d;
        edit(() => shiftKeys(a0, next, d), { silent: true });
        setSelKeys(next.map((k) => ({ ...k, t: k.t + d })));
        setTime(t + d);
      },
      onEnd: (moved) => { if (!moved) setTime(t); }
    });
  };
  const keysInRows = () => {
    const out = [];
    for (const row of rows) {
      const cy = row.y + ROW / 2;
      const tr = row.bone && anim.tracks[row.bone];
      if (!tr) continue;
      if (row.kind === 'bone') for (const ch of CHANNELS) for (const k of tr[ch] || []) out.push({ bone: row.bone, ch, t: k.t, x: X(k.t), y: cy });
      if (row.kind === 'ch') for (const k of tr[row.ch] || []) out.push({ bone: row.bone, ch: row.ch, t: k.t, x: X(k.t), y: cy });
    }
    return out;
  };
  const marquee = (e) => {
    if (e.button !== 0) return;
    const el = lanesRef.current;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const at = (ev) => ({ x: ev.clientX - r.left, y: ev.clientY - r.top + el.scrollTop });
    const p0 = at(e);
    const base = selKeys;
    const mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey };
    let moved = false;
    const calc = (p1) => {
      const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
      const seen = new Set(), uniq = [];
      for (const k of keysInRows()) if (k.x >= x0 - 5 && k.x <= x1 + 5 && k.y >= y0 - 6 && k.y <= y1 + 6) { const q = { bone: k.bone, ch: k.ch, t: k.t }; const id = keyId(q); if (!seen.has(id)) { seen.add(id); uniq.push(q); } }
      return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, keys: pickKeys(mods, uniq, base) };
    };
    const mv = (ev) => { const p1 = at(ev); if (!moved && Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) < 4) return; moved = true; const c = calc(p1); setBox(c.rect); setSelKeys(c.keys); };
    const up = (ev) => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      setBox(null);
      if (!moved) { if (!mods.shiftKey && !mods.ctrlKey) setSelKeys([]); const t = Math.max(0, Math.min(len, Math.round(T(p0.x)))); setTime(t); return; }
      setSelKeys(calc(at(ev)).keys);
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const easeItems = (target) => EASES.map(([v, l, h]) => ({ label: l, hint: h, run: () => edit((a) => setEase(a, target, v)) }));
  const keyMenu = (e, bone, ch, t) => {
    const here = ch ? [{ bone, ch, t }] : expandBoneKeys(anim, bone, t);
    const many = here.every((k) => isSel(k.bone, k.ch, k.t)) && selKeys.length > here.length;
    const target = many ? selKeys : here;
    if (!many) setSelKeys(here);
    openMenu(e, [
      { head: many ? 'Выбрано ключей: ' + selKeys.length : boneRu(bone) + ' · ключ ' + t + ' т' },
      { label: 'Плавность к следующему', icon: 'curves', sub: easeItems(target) },
      { sep: true },
      { label: 'Копировать', icon: 'copy', kb: 'Ctrl+C', run: () => { setSelKeys(target); setTimeout(() => act.copy(target), 0); } },
      { label: 'Вставить с бегунка', icon: 'plus', kb: 'Ctrl+V', run: () => act.paste() },
      { label: 'Отразить позу (лево ↔ право)', icon: 'loop', hint: 'Поза в этот момент: правая рука/нога ↔ левая, повороты Y и Z — с обратным знаком.', run: () => act.mirrorAt(t) },
      { label: many ? 'Удалить выбранные' : 'Удалить ключ', icon: 'trash', kb: 'Del', run: () => act.del(target) }
    ]);
  };
  const laneMenu = (e, row) => {
    const r = lanesRef.current ? lanesRef.current.getBoundingClientRect() : { left: 0 };
    const t = Math.max(0, Math.min(len, Math.round(T(e.clientX - r.left))));
    if (row.kind === 'ev') {
      openMenu(e, [{ head: 'Событие в ' + t + ' т' }, ...EVENT_KINDS.map(([k, l, h]) => ({ label: l, hint: h, run: () => act.addEvent(k, t) }))]);
      return;
    }
    if (row.bone) openMenu(e, [{ head: boneRu(row.bone) + ' · ' + t + ' т' }, { label: 'Ключ здесь (поза как сейчас)', icon: 'key', run: () => { setTime(t); act.keyBone(row.bone, t, row.ch ? [row.ch] : null); } }, { label: 'Очистить дорожку кости', icon: 'trash', hint: 'Удалить все ключи этой кости' + (row.ch ? ' в канале «' + CHANNEL_RU[row.ch] + '»' : '') + '.', run: () => act.clearBone(row.bone, row.ch) }]);
  };
  const evDrag = (e, i, ev) => {
    setSelEv(i);
    let cur = ev.t;
    drag(e, {
      onMove: (dx) => { const nt = Math.max(0, Math.min(len, Math.round(ev.t + dx / view.s))); if (nt === cur) return; cur = nt; edit((a) => ({ ...a, events: a.events.map((x, j) => (j === i ? { ...x, t: nt } : x)) }), { silent: true }); },
      onEnd: (moved) => { if (!moved) setTime(ev.t); }
    });
  };

  const step = STEPS.find((s) => s * view.s >= 46) || 1200;
  const t0 = Math.max(0, Math.floor(view.x0 / step) * step);
  const ticks = [];
  for (let t = t0; X(t) < W + 40 && ticks.length < 500; t += step) ticks.push(t);
  const fmtR = (t) => (step >= 20 ? fmtT(t) : t + ' т');
  const kts = keyTimes(anim, selBone || null);
  const prevKey = () => { const k = kts.filter((t) => t < time).pop(); if (k != null) setTime(k); };
  const nextKey = () => { const k = kts.find((t) => t > time); if (k != null) setTime(k); };
  const diamond = (x, cy, on, color, key) => <path key={key} d={`M${x} ${cy - 6} L${x + 6} ${cy} L${x} ${cy + 6} L${x - 6} ${cy}z`} fill={on ? '#ffe680' : color || '#d9b232'} stroke={on ? '#fff' : '#1a1a1a'} strokeWidth="1" />;

  return (
    <div className="c4-tl an-tl" style={{ height }}>
      <div className="c4-transport">
        <button className="c4-ib" data-learn="an-key" disabled={!selBone} onClick={() => act.keyBone(selBone, time)} {...hp('Ключ на выбранную кость в момент бегунка (K): сразу поворот, сдвиг и размер по всем осям X, Y, Z (настройка «Все каналы» — у кости справа).')}><I name="key" size={16} color="#e6c23c" /></button>
        <div className="c4-sep" />
        <button className="c4-ib" onClick={() => setTime(0)} {...hp('В начало.')}><I name="first" size={15} /></button>
        <button className="c4-ib" onClick={prevKey} disabled={!kts.length} {...hp('К предыдущему ключу' + (selBone ? ' кости' : '') + '.')}><I name="prevkey" size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(Math.max(0, time - 1))} {...hp('Тик назад (F).')}><I name="prevframe" size={15} /></button>
        <button className={'c4-ib' + (playing ? ' on' : '')} data-learn="an-play" onClick={() => setPlaying(!playing)} {...hp('Проиграть в Студии (Пробел).')}><I name={playing ? 'pause' : 'play'} size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(Math.min(len, time + 1))} {...hp('Тик вперёд (G).')}><I name="nextframe" size={15} /></button>
        <button className="c4-ib" onClick={nextKey} disabled={!kts.length} {...hp('К следующему ключу.')}><I name="nextkey" size={15} /></button>
        <button className="c4-ib" onClick={() => setTime(len)} {...hp('В конец.')}><I name="last" size={15} /></button>
        <input className="c4-frame" value={time + ' т'} onChange={(e) => { const n = parseInt(e.target.value, 10); if (isFinite(n)) setTime(Math.min(len, Math.max(0, n))); }} onKeyDown={(e) => e.stopPropagation()} {...hp('Момент в тиках (20 тиков = 1 секунда).')} />
        <span className="dim" style={{ minWidth: 50 }}>{fmtT(time)}</span>
        <button className={'c4-ib' + (loopPreview ? ' on' : '')} onClick={() => setLoopPreview(!loopPreview)} {...hp('Крутить по кругу в Студии (не меняет саму анимацию — это «По кругу» в настройках).')}><I name="loop" size={14} /></button>
        <div className="c4-sep" />
        <div className="c4-group">
          <button className={'c4-ib wide' + (mode === 'keys' ? ' on' : '')} onClick={() => setMode('keys')} {...hp('Ключи ромбами: тяни — сдвинуть, рамка по пустому месту — выбрать.')}><I name="key" size={13} /> Ключи</button>
          <button className={'c4-ib wide' + (mode === 'curves' ? ' on' : '')} data-learn="an-curves" onClick={() => setMode('curves')} {...hp('Кривые выбранной кости: X (красная), Y (зелёная), Z (синяя). Тяни ключ вверх-вниз — значение, вбок — время (Alt — только время).')}><I name="curves" size={13} /> Кривые</button>
        </div>
        {mode === 'curves' && <div className="c4-group">{CHANNELS.map((ch) => <button key={ch} className={'c4-ib wide' + (curveCh === ch ? ' on' : '')} onClick={() => setCurveCh(ch)} {...hp('Кривые канала «' + CHANNEL_RU[ch] + '».')}>{CHANNEL_RU[ch]}</button>)}</div>}
        {selKeys.length > 0 && <span className="c4-ksel" {...hp('Выбрано ключей. Тяни любой — поедут все; Del — удалить; Ctrl+C / Ctrl+V — копия с бегунка; правый клик — плавность.')}>◆ {selKeys.length}</span>}
        <button className="c4-ib wide" disabled={!selKeys.length} onClick={(e) => openMenu(e, easeItems(selKeys))} {...hp('Плавность выбранных ключей: плавно, ровно, ступенька, разгон, торможение, с перелётом, отскок, своя кривая.')}><I name="curves" size={13} /> Плавность</button>
        <div className="grow" />
        <button className="c4-ib" onClick={fit} {...hp('Вся анимация в ширину.')}><I name="frame" size={15} /></button>
      </div>
      <div className="c4-tl-body">
        <div className="c4-tl-heads">
          <div className="c4-ruler-h">{mode === 'curves' ? 'Кривые: ' + (selBone ? boneRu(selBone) : '—') : 'Кости'}<span className="grow" /><span title="Длина">{fmtT(len)}</span></div>
          {mode === 'keys' ? (
            <div className="c4-tl-heads-scroll" ref={headsRef}>
              {rows.map((row, i) => {
                if (row.kind === 'grp') return <div key={i} className="c4-lhead grp" {...hp(row.hint)}>{row.label}</div>;
                if (row.kind === 'ev') return <div key={i} className="c4-lhead" {...hp('События: правый клик по дорожке — добавить; тяни — сдвинуть; щёлкни — свойства справа.')}><span className="sw" style={{ background: '#7cc4f5' }} /><span className="nm">События</span><span className="add" title="Добавить событие в момент бегунка" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu({ clientX: r.left, clientY: r.bottom, preventDefault() {}, stopPropagation() {} }, EVENT_KINDS.map(([k, l, h]) => ({ label: l, hint: h, run: () => act.addEvent(k, time) }))); }}>+</span></div>;
                if (row.kind === 'ch') return <div key={i} className="c4-lhead ch" {...hp(CHANNEL_RU[row.ch] + ' кости «' + boneRu(row.bone) + '».')}><span className="sw" style={{ background: CH_COLOR[row.ch] }} /><span className="nm">{CHANNEL_RU[row.ch]}</span></div>;
                const has = !!anim.tracks[row.bone];
                return (
                  <div key={i} className={'c4-lhead obj' + (selBone === row.bone ? ' sel' : '')} onClick={() => setSelBone(row.bone)} {...hp(boneRu(row.bone) + (has ? ' — есть ключи.' : ' — ключей нет.') + ' ▸ — каналы.')}>
                    <span className="tw" onClick={(e) => { e.stopPropagation(); setOpen((c) => ({ ...c, [row.bone]: !c[row.bone] })); }}>{open[row.bone] ? '▾' : '▸'}</span>
                    <span className={'an-bdot' + (has ? ' on' : '')} /><span className="nm">{boneRu(row.bone)}</span>
                  </div>
                );
              })}
            </div>
          ) : <div className="c4-tree-empty">{selBone ? <>Канал «{CHANNEL_RU[curveCh]}»: <b style={{ color: COMP_COLOR[0] }}>X</b> <b style={{ color: COMP_COLOR[1] }}>Y</b> <b style={{ color: COMP_COLOR[2] }}>Z</b>. Тяни ключи; правый клик — плавность.</> : 'Выбери кость — здесь будут её кривые.'}</div>}
        </div>
        <div className="c4-tl-lanes">
          <div className="c4-ruler" data-learn="an-ruler" ref={rulerRef} onMouseDown={scrubRuler} {...hp('Линейка: щёлкни или тяни — бегунок. Колесо — масштаб, Shift+колесо — прокрутка. Золотой флажок — длина анимации (тяни).')}>
            <svg width={W} height={22}>
              {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={11} y2={22} stroke="#5a5a5a" /><text x={X(t) + 3} y={13} fill="#a8a8a8" fontSize="10.5">{fmtR(t)}</text></g>)}
              <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={22} fill="rgba(0,0,0,0.28)" />
              <g style={{ cursor: 'ew-resize' }} onMouseDown={(e) => drag(e, { onMove: (dx) => edit((a) => ({ ...a, length: Math.max(1, Math.round(len + dx / view.s)) }), { silent: true }) })}>
                <line x1={X(len)} x2={X(len)} y1={0} y2={22} stroke="#e6b65c" strokeWidth="2" />
                <path d={`M${X(len)} 0 h9 l-3 4 l3 4 h-9z`} fill="#e6b65c" />
              </g>
              <g><rect x={X(time) - 15} y={1} width={30} height={13} rx={2} fill="#5a6cf0" /><text x={X(time)} y={11} fill="#fff" fontSize="10" textAnchor="middle">{time}</text></g>
            </svg>
          </div>
          {mode === 'keys' ? (
            <div className="c4-lanes" data-learn="an-lanes" ref={lanesRef} onScroll={(e) => { if (headsRef.current) headsRef.current.scrollTop = e.currentTarget.scrollTop; }}
              onMouseDown={(e) => { if (e.button === 0 && (e.target.tagName === 'svg' || (e.target.getAttribute && e.target.getAttribute('data-bg')))) marquee(e); }}
              {...hp('Дорожки: тяни по пустому месту — рамка выбора (Shift — добавить, Ctrl — переключить). Тяни ключ — едут все выбранные. Правый клик — меню.')}>
              <svg width={W} height={Math.max(totalH, 40)}>
                <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={Math.max(totalH, 40)} fill="rgba(0,0,0,0.22)" pointerEvents="none" />
                {ticks.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={totalH} stroke="#383838" pointerEvents="none" />)}
                {rows.map((row, i) => {
                  const cy = row.y + ROW / 2;
                  const bg = <rect data-bg="1" x={0} y={row.y} width={W} height={ROW} fill={row.kind === 'grp' ? '#282828' : row.bone && row.bone === selBone && row.kind === 'bone' ? 'rgba(90,108,240,0.10)' : 'transparent'} onContextMenu={(e) => laneMenu(e, row)} />;
                  const border = <line x1={0} x2={W} y1={row.y + ROW - 0.5} y2={row.y + ROW - 0.5} stroke="#303030" pointerEvents="none" />;
                  if (row.kind === 'grp') return <g key={i}>{bg}{border}</g>;
                  if (row.kind === 'ev') {
                    return (
                      <g key={i}>{bg}
                        {(anim.events || []).map((ev, j) => {
                          const kind = evKind(ev);
                          const x = X(ev.t);
                          const on = selEv === j;
                          return (
                            <g key={j} style={{ cursor: 'grab' }} onMouseDown={(e) => e.button === 0 && evDrag(e, j, ev)} onContextMenu={(e) => openMenu(e, [{ head: 'Событие ' + ev.t + ' т' }, { label: 'Удалить', icon: 'trash', run: () => act.delEvent(j) }])}>
                              <rect x={x - 3} y={row.y + 3} width={Math.max(46, 6)} height={ROW - 6} rx={2} fill={EV_COLOR[kind]} fillOpacity={on ? 0.8 : 0.4} stroke={on ? '#fff' : EV_COLOR[kind]} />
                              <text x={x + 2} y={cy + 4} fill="#f2f2f2" fontSize="10" pointerEvents="none">{String(ev[kind] == null ? kind : ev[kind]).replace(/^minecraft:/, '').slice(0, 9)}</text>
                            </g>
                          );
                        })}
                        {border}
                      </g>
                    );
                  }
                  const tr = anim.tracks[row.bone] || {};
                  if (row.kind === 'bone') {
                    const times = keyTimes(anim, row.bone);
                    return (
                      <g key={i}>{bg}
                        {times.length > 1 && <line x1={X(times[0])} x2={X(times[times.length - 1])} y1={cy} y2={cy} stroke="#e8913a" strokeOpacity="0.3" strokeWidth="3" pointerEvents="none" />}
                        {times.map((t) => {
                          const ks = expandBoneKeys(anim, row.bone, t);
                          const on = ks.every((k) => isSel(k.bone, k.ch, k.t));
                          return <g key={t} style={{ cursor: 'ew-resize' }} onMouseDown={(e) => { if (e.button !== 0) return; setSelBone(row.bone); dragKeys(e, ks, t); }} onContextMenu={(e) => keyMenu(e, row.bone, null, t)}>{diamond(X(t), cy, on, null, t)}<title>{boneRu(row.bone)}: ключ {t} т</title></g>;
                        })}
                        {border}
                      </g>
                    );
                  }
                  return (
                    <g key={i}>{bg}
                      {(tr[row.ch] || []).map((k) => (
                        <g key={k.t} style={{ cursor: 'ew-resize' }} onMouseDown={(e) => { if (e.button !== 0) return; dragKeys(e, [{ bone: row.bone, ch: row.ch, t: k.t }], k.t); }} onContextMenu={(e) => keyMenu(e, row.bone, row.ch, k.t)}>
                          {diamond(X(k.t), cy, isSel(row.bone, row.ch, k.t), CH_COLOR[row.ch], k.t)}
                          <title>{CHANNEL_RU[row.ch]}: {k.v.join(' / ')} в {k.t} т · {EASE_RU[k.ease || 'smooth']}</title>
                        </g>
                      ))}
                      {border}
                    </g>
                  );
                })}
                <line x1={X(time)} x2={X(time)} y1={0} y2={totalH} stroke="#7c8bff" strokeWidth="1.5" pointerEvents="none" />
                {box && <rect className="c4-marquee" x={box.x} y={box.y} width={box.w} height={box.h} pointerEvents="none" />}
              </svg>
            </div>
          ) : (
            <Curves anim={anim} bone={selBone} ch={curveCh} X={X} T={T} W={W} len={len} time={time} setTime={setTime} edit={edit} gesture={gesture} selKeys={selKeys} setSelKeys={setSelKeys} pickKeys={pickKeys} keyMenu={keyMenu} lanesRef={lanesRef} hp={hp} />
          )}
        </div>
      </div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </div>
  );
}

function Curves({ anim, bone, ch, X, T, W, len, time, setTime, edit, gesture, selKeys, setSelKeys, pickKeys, keyMenu, lanesRef, hp }) {
  const boxRef = useRef(null);
  const frozen = useRef(null);
  const [H, setH] = useState(120);
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setH(Math.max(40, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const keys = (bone && anim.tracks[bone] && anim.tracks[bone][ch]) || [];
  let lo = Infinity, hi = -Infinity;
  for (const k of keys) for (const v of k.v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isFinite(lo)) { lo = ch === 'scale' ? 0 : -90; hi = ch === 'scale' ? 2 : 90; }
  if (hi - lo < 1e-6) { lo -= ch === 'scale' ? 0.5 : 10; hi += ch === 'scale' ? 0.5 : 10; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  if (frozen.current) { lo = frozen.current[0]; hi = frozen.current[1]; }
  const Y = (v) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  const isSel = (t) => selKeys.some((k) => k.bone === bone && k.ch === ch && k.t === t);
  const keyDown = (e, k, c) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const pick = { bone, ch, t: k.t };
    const next = isSel(k.t) && !e.shiftKey && !e.ctrlKey ? selKeys.filter((x) => x.bone === bone && x.ch === ch) : pickKeys(e, [pick]);
    setSelKeys(next);
    setTime(k.t);
    const a0 = anim;
    const vs = Y(0) - Y(1);
    frozen.current = [lo, hi];
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const tMin = Math.min(...next.map((q) => q.t));
    const mv = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved) { moved = true; gesture(); }
      const d = Math.max(-tMin, Math.round(dx / (X(1) - X(0))));
      const dv = ev.altKey ? 0 : Math.round((-dy / vs) * 100) / 100;
      const delta = [0, 0, 0]; delta[c] = dv;
      edit(() => shiftKeys(a0, next, d, delta), { silent: true });
      setSelKeys(next.map((q) => ({ ...q, t: q.t + d })));
      setTime(k.t + d);
    };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); frozen.current = null; };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const marquee = (e) => {
    if (e.button !== 0) return;
    const r = boxRef.current.getBoundingClientRect();
    const at = (ev) => ({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    const p0 = at(e);
    const base = selKeys, mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey };
    let moved = false;
    const calc = (p1) => {
      const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
      const inside = [];
      for (const k of keys) if (k.v.some((v) => { const x = X(k.t), y = Y(v); return x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4; })) inside.push({ bone, ch, t: k.t });
      return { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, keys: pickKeys(mods, inside, base) };
    };
    const mv = (ev) => { const p1 = at(ev); if (!moved && Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) < 4) return; moved = true; const c = calc(p1); setBox(c.rect); setSelKeys(c.keys); };
    const up = (ev) => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setBox(null); if (!moved) { if (!mods.shiftKey && !mods.ctrlKey) setSelKeys([]); setTime(Math.max(0, Math.min(len, Math.round(T(p0.x))))); return; } setSelKeys(calc(at(ev)).keys); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const stepT = Math.max(0.25, 2 / (X(1) - X(0)));
  return (
    <div className="c4-lanes" ref={(el) => { boxRef.current = el; lanesRef.current = el; }} style={{ overflow: 'hidden' }}
      onMouseDown={(e) => { if (e.target.tagName === 'svg' || (e.target.getAttribute && e.target.getAttribute('data-bg'))) marquee(e); }}
      {...hp('Кривые: по горизонтали время, по вертикали значение. Тяни ключ (точку X, Y или Z) — меняется эта ось; вбок — время (Alt — только время). Рамка по пустому месту — выбор. Правый клик — плавность.')}>
      <svg width={W} height={H}>
        <rect data-bg="1" x={0} y={0} width={W} height={H} fill="transparent" />
        <rect x={X(len)} y={0} width={Math.max(0, W - X(len))} height={H} fill="rgba(0,0,0,0.22)" pointerEvents="none" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f} pointerEvents="none"><line x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="#383838" /><text x={4} y={Y(v) - 2} fill="#777" fontSize="10">{Math.round(v * 10) / 10}</text></g>; })}
        {!keys.length && <text x={W / 2} y={H / 2} fill="#777" fontSize="12" textAnchor="middle">{bone ? 'У кости нет ключей в этом канале — поставь ◆ (K) или поверни кость' : 'Выбери кость'}</text>}
        {keys.length > 0 && [0, 1, 2].map((c) => {
          const pts = [];
          const a = Math.max(0, T(0)), b = Math.min(Math.max(len, keys[keys.length - 1].t), T(W));
          for (let t = a; t <= b; t += stepT) { const v = sampleKeys(keys, t); pts.push(X(t) + ',' + Y(v[c])); }
          return <polyline key={c} points={pts.join(' ')} fill="none" stroke={COMP_COLOR[c]} strokeWidth="1.6" pointerEvents="none" />;
        })}
        {keys.map((k) => [0, 1, 2].map((c) => (
          <rect key={k.t + ':' + c} x={X(k.t) - 4} y={Y(k.v[c]) - 4} width={8} height={8} fill={isSel(k.t) ? '#fff' : COMP_COLOR[c]} stroke="#111" style={{ cursor: 'move' }}
            onMouseDown={(e) => keyDown(e, k, c)} onContextMenu={(e) => keyMenu(e, bone, ch, k.t)}>
            <title>{'XYZ'[c]}: {k.v[c]} в {k.t} т · {EASE_RU[k.ease || 'smooth']}</title>
          </rect>
        )))}
        <line x1={X(time)} x2={X(time)} y1={0} y2={H} stroke="#7c8bff" strokeWidth="1.5" pointerEvents="none" />
        {box && <rect className="c4-marquee" x={box.x} y={box.y} width={box.w} height={box.h} pointerEvents="none" />}
      </svg>
    </div>
  );
}
export { valueAt, setKeyComp };
