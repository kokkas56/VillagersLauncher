// Таймлайн сцены: линейка (тики и секунды), дорожки, события-блоки и ключи-ромбы.
// Колесо — масштаб, перетаскивание пустого места — прокрутка, правый клик — добавить событие.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { TRACKS, VERB_DEFS, summary } from './schema.js';
import { SNAP, FIXED_ROWS, fmtTicks, itemsOfTrack, trackKeyOf, patchItem } from './model.js';

const HEAD_W = 132;
const RULER_H = 28;
const LANE_H = 20;
const PAD_Y = 7;
const PAD_L = 12;
const MAX_LANES = 3;
const STEPS = [1, 2, 5, 10, 20, 40, 100, 200, 400, 600, 1200, 2400, 6000, 12000];

function charW(n) { return n * 6.4; }
function clip(s, n) { return n < 4 ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s; }

export default function Timeline({ scene, sel, actorSel, issueMap, playhead, setPlayhead, onSelect, onSelectActor, edit, gesture, onDragEnd, onAdd, actorMenu, hp }) {
  const wrapRef = useRef(null);
  const lanesRef = useRef(null);
  const [W, setW] = useState(600);
  const [view, setView] = useState({ s: 2, x0: 0 });
  const [menu, setMenu] = useState(null); // { x, y, items }
  const viewRef = useRef(view);
  viewRef.current = view;
  const len = scene.length || 200;

  useLayoutEffect(() => {
    const el = lanesRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const fit = () => setView({ s: Math.max(0.05, (W - PAD_L - 40) / Math.max(len, 40)), x0: 0 });
  useEffect(() => { fit(); }, [scene.id, W > 200]); // eslint-disable-line

  const X = (t) => (t - view.x0) * view.s + PAD_L;
  const T = (x) => (x - PAD_L) / view.s + view.x0;
  const snap = (t, free) => Math.max(0, free ? Math.round(t) : Math.round(t / SNAP) * SNAP);

  // колесо: масштаб вокруг курсора (Shift / горизонтальная прокрутка — сдвиг)
  useEffect(() => {
    const els = [lanesRef.current, wrapRef.current && wrapRef.current.querySelector('.tl-ruler')].filter(Boolean);
    const onWheel = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const v = viewRef.current;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const d = (e.deltaX || e.deltaY) / v.s;
        setView({ ...v, x0: Math.max(-40 / v.s, v.x0 + d) });
        return;
      }
      e.preventDefault();
      const s2 = Math.min(40, Math.max(0.05, v.s * Math.exp(-e.deltaY * 0.0015)));
      const tc = (mx - PAD_L) / v.s + v.x0;
      setView({ s: s2, x0: Math.max(-40 / s2, tc - (mx - PAD_L) / s2) });
    };
    els.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, []);

  // строки: камера, актёры, «+ актёр», эффекты, звук, субтитры, мир
  const rows = useMemo(() => {
    const r = [{ key: 'camera', kind: 'camera', label: 'Камера' }];
    scene.actors.forEach((a, i) => r.push({ key: 'actor:' + a.id, kind: 'actor', label: a.name || a.id, actorIndex: i }));
    for (const tr of scene.tracks) if (tr.kind === 'actor' && !scene.actors.some((a) => a.id === tr.actor)) r.push({ key: 'actor:' + tr.actor, kind: 'actor', label: tr.actor, orphan: true });
    r.push({ key: '+actor', kind: 'addActor' });
    FIXED_ROWS.forEach((k) => r.push({ key: k, kind: k, label: TRACKS[k].label }));
    const byKey = {};
    scene.tracks.forEach((tr) => { byKey[trackKeyOf(tr)] = tr; });
    let y = 0;
    for (const row of r) {
      row.y = y;
      if (row.kind === 'addActor') { row.h = 26; y += row.h; continue; }
      const tr = byKey[row.key];
      const items = tr ? itemsOfTrack(tr) : [];
      const kind = row.kind;
      const vdefs = VERB_DEFS[kind] || {};
      // раскладка по полосам, чтобы события не налезали
      const ends = [];
      row.items = items.map((ev, i) => {
        const vd = kind === 'camera' ? vdefs.key : kind === 'subtitles' ? vdefs.line : vdefs[ev.do];
        const dur = vd && vd.dur ? vd.dur(ev) : 0;
        const x = (ev.t - view.x0) * view.s + PAD_L;
        const w = dur ? Math.max(8, dur * view.s) : 0;
        const label = summary(kind, ev, scene.actors);
        const inside = dur && w > 34;
        const lw = label ? Math.min(charW(label.length), 220) : 0;
        const x1 = dur ? x : x - 7;
        const x2 = dur ? x + Math.max(w, inside ? 0 : w + 6 + lw) : x + 9 + lw;
        const shapeEnd = dur ? x + w : x + 8;
        let lane = ends.findIndex((e) => e <= x1 - 2);
        let forced = false;
        if (lane < 0) {
          if (ends.length < MAX_LANES) lane = ends.length;
          else { lane = ends.indexOf(Math.min(...ends)); forced = true; }
        }
        ends[lane] = forced ? Math.max(ends[lane], shapeEnd) : x2;
        return { ev, i, x, w, dur, label, inside, lane, vd, x1, maxCh: 34 };
      });
      // подпись не должна залезать на следующее событие той же полосы
      const byLane = {};
      row.items.forEach((it) => { (byLane[it.lane] = byLane[it.lane] || []).push(it); });
      Object.values(byLane).forEach((arr) => {
        arr.sort((a, b) => a.x1 - b.x1);
        arr.forEach((it, k) => {
          if (it.inside) return;
          const next = arr[k + 1];
          const start = it.dur ? it.x + it.w + 5 : it.x + 10;
          const avail = next ? next.x1 - start - 4 : 1e9;
          it.maxCh = Math.min(34, Math.floor(avail / 6.4));
        });
      });
      const lanes = Math.max(1, ends.length);
      row.h = PAD_Y * 2 + lanes * LANE_H;
      y += row.h;
    }
    r.total = y;
    return r;
  }, [scene, view]);

  // --- мышь ---
  const dragWin = (move, up) => {
    const mv = (e) => move(e);
    const u = (e) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', u); up && up(e); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', u);
  };
  const startEvent = (e, row, it) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    const s0 = { track: row.key, i: it.i };
    onSelect(s0);
    const sx = e.clientX, t0 = it.ev.t, sc = view.s;
    let moved = false;
    dragWin((ev) => {
      const dx = ev.clientX - sx;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; gesture(); }
      const t = snap(t0 + dx / sc, ev.shiftKey);
      edit((s) => patchItem(s, s0, { t }), { silent: true });
    }, () => { if (moved) onDragEnd(row.key, it.i); });
  };
  const startBg = (e) => {
    if (e.button !== 0) return;
    setMenu(null);
    const sx = e.clientX, v0 = view;
    let moved = false;
    const r = e.currentTarget.getBoundingClientRect();
    dragWin((ev) => {
      const dx = ev.clientX - sx;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      setView({ ...v0, x0: Math.max(-40 / v0.s, v0.x0 - dx / v0.s) });
    }, (ev) => {
      if (moved) return;
      setPlayhead(snap(T(ev.clientX - r.left), ev.shiftKey));
      onSelect(null);
    });
  };
  const startRuler = (e) => {
    if (e.button !== 0) return;
    setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    if (Math.abs(mx - X(len)) < 8) { // флажок длины сцены
      let moved = false;
      dragWin((ev) => {
        if (!moved) { moved = true; gesture(); }
        const l = Math.max(SNAP, snap(T(ev.clientX - r.left), ev.shiftKey));
        edit((s) => ({ ...s, length: l }), { silent: true });
      });
      return;
    }
    setPlayhead(snap(T(mx), e.shiftKey));
    dragWin((ev) => setPlayhead(snap(T(ev.clientX - r.left), ev.shiftKey)));
  };
  const rowAt = (y) => rows.find((r) => y >= r.y && y < r.y + r.h);
  const menuFor = (row, t) => {
    if (row.kind === 'addActor') return actorMenu;
    const kind = row.kind;
    return Object.entries(VERB_DEFS[kind] || {}).map(([verb, d]) => ({ label: d.label, hint: d.hint, run: () => onAdd(row.key, verb, t) }));
  };
  const openMenu = (clientX, clientY, items, title) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = Math.min(clientX - r.left, r.width - 230);
    const y = Math.min(clientY - r.top, r.height - Math.min(320, 34 + items.length * 30));
    setMenu({ x: Math.max(4, x), y: Math.max(4, y), items, title });
  };
  const onCtx = (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const row = rowAt(e.clientY - r.top);
    if (!row) return;
    const t = snap(T(e.clientX - r.left), e.shiftKey);
    openMenu(e.clientX, e.clientY, menuFor(row, t), row.kind === 'addActor' ? 'Добавить актёра' : (row.label || '') + ' · ' + fmtTicks(t));
  };
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!e.target.closest || !e.target.closest('.tl-menu')) setMenu(null); };
    const esc = (e) => e.key === 'Escape' && setMenu(null);
    setTimeout(() => window.addEventListener('pointerdown', close), 0);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);
  const allMenu = (e) => {
    const items = [];
    rows.forEach((row) => {
      if (row.kind === 'addActor') return;
      items.push({ head: row.label });
      items.push(...menuFor(row, playhead));
    });
    const b = e.currentTarget.getBoundingClientRect();
    openMenu(b.left, b.bottom + 4, items, 'Добавить в ' + fmtTicks(playhead));
  };

  // --- линейка ---
  let step = STEPS.find((st) => st * view.s >= 64) || STEPS[STEPS.length - 1];
  const minor = step >= 10 ? step / (step % 4 === 0 ? 4 : 5) : 0;
  const t0 = Math.max(0, Math.floor(view.x0 / step) * step);
  const t1 = view.x0 + (W - PAD_L) / view.s;
  const ticks = [];
  for (let t = t0; t <= t1 && ticks.length < 400; t += step) ticks.push(t);
  const minors = [];
  if (minor && minor * view.s >= 7) for (let t = Math.max(0, Math.floor(view.x0 / minor) * minor); t <= t1 && minors.length < 800; t += minor) if (t % step) minors.push(t);
  const xl = X(len), xp = X(playhead);
  const H = rows.total;

  return (
    <div className="tl" ref={wrapRef}>
      <div className="tl-bar">
        <button className="btn sm primary" onClick={allMenu} {...hp('Добавить событие в месте бегунка. Ещё быстрее: правый клик прямо по нужной дорожке.')}><Icon name="plus" size={11} /> Событие</button>
        <span className="tl-time mono" {...hp('Где сейчас бегунок: секунды и тики (20 тиков = 1 секунда). Ключи камеры по F8 ставятся сюда.')}>{fmtTicks(playhead)} · {playhead} т</span>
        <div className="grow" />
        <span className="muted small tl-tip">колесо — масштаб · тяни фон — сдвиг · Shift — без привязки</span>
        <button className="btn sm ghost icon-btn" onClick={() => setView((v) => ({ ...v, s: Math.max(0.05, v.s / 1.4) }))} {...hp('Отдалить таймлайн (или колесо мыши вниз).')}>−</button>
        <button className="btn sm ghost icon-btn" onClick={() => setView((v) => ({ ...v, s: Math.min(40, v.s * 1.4) }))} {...hp('Приблизить таймлайн (или колесо мыши вверх).')}>+</button>
        <button className="btn sm ghost" onClick={fit} {...hp('Показать всю сцену целиком.')}>Вся сцена</button>
      </div>
      <div className="tl-ruler-row">
        <div className="tl-corner" {...hp('Линейка: сверху секунды, тонкие риски — тики. Щёлкни или тяни по линейке — двигается бегунок. Золотой флажок — конец сцены, его можно тянуть.')}>
          <span className="muted small">длина {fmtTicks(len)}</span>
        </div>
        <svg className="tl-ruler" width={W} height={RULER_H} onPointerDown={startRuler} style={{ cursor: 'pointer' }}>
          <rect x={Math.max(0, xl)} y={0} width={Math.max(0, W - Math.max(0, xl))} height={RULER_H} className="tl-after" />
          {minors.map((t) => <line key={'m' + t} x1={X(t)} x2={X(t)} y1={RULER_H - 5} y2={RULER_H} className="tl-minor" />)}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={RULER_H - 11} y2={RULER_H} className="tl-major" />
              <text x={X(t) + 3} y={12} className="tl-rlabel">{fmtTicks(t)}</text>
              <text x={X(t) + 3} y={22} className="tl-rsub">{t}</text>
            </g>
          ))}
          <g className="tl-len" transform={`translate(${xl},0)`}>
            <line y1={0} y2={RULER_H} />
            <path d="M0,0 L10,0 L10,10 L0,14 Z" />
          </g>
          <path d={`M${xp - 6},0 L${xp + 6},0 L${xp + 6},8 L${xp},14 L${xp - 6},8 Z`} className="tl-ph-head" />
        </svg>
      </div>
      <div className="tl-body">
        <div className="tl-inner" style={{ height: H }}>
          <div className="tl-heads">
            {rows.map((row) => {
              if (row.kind === 'addActor') {
                return (
                  <div key={row.key} className="tl-head add" style={{ height: row.h }}>
                    <button className="link-btn" onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); openMenu(b.left, b.bottom + 2, actorMenu, 'Добавить актёра'); }} {...hp('Добавить в сцену персонажа проекта, жителя долины, любую сущность или самого игрока. У каждого актёра своя дорожка.')}>+ Актёр в сцену</button>
                  </div>
                );
              }
              const on = row.kind === 'actor' && actorSel === row.actorIndex;
              const tip = row.orphan ? 'Дорожка актёра «' + row.label + '», которого нет в сцене. Добавь актёра с таким id или удали события.' : TRACKS[row.kind].hint;
              return (
                <div key={row.key} className={'tl-head k-' + row.kind + (on ? ' on' : '') + (row.orphan ? ' orphan' : '')} style={{ height: row.h }} {...hp(tip)}
                  onClick={() => row.kind === 'actor' && row.actorIndex !== undefined && onSelectActor(row.actorIndex)}>
                  <span className="tl-dot" style={{ background: TRACKS[row.kind].color }} />
                  <span className="tl-hname">{row.label}</span>
                  <button className="tl-plus" title="Добавить событие в месте бегунка" onClick={(e) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, menuFor(row, playhead), row.label + ' · ' + fmtTicks(playhead)); }}>+</button>
                </div>
              );
            })}
          </div>
          <div className="tl-lanes" ref={lanesRef}>
            <svg width={W} height={H} onPointerDown={startBg} onContextMenu={onCtx} className="tl-svg">
              {rows.map((row, ri) => <rect key={row.key} x={0} y={row.y} width={W} height={row.h} className={'tl-row' + (ri % 2 ? ' odd' : '') + (row.kind === 'addActor' ? ' add' : '')} />)}
              {ticks.map((t) => <line key={'g' + t} x1={X(t)} x2={X(t)} y1={0} y2={H} className="tl-grid" />)}
              <rect x={Math.max(0, xl)} y={0} width={Math.max(0, W - Math.max(0, xl))} height={H} className="tl-after" />
              <line x1={xl} x2={xl} y1={0} y2={H} className="tl-lenline" />
              {rows.map((row) => row.items && <RowItems key={row.key} row={row} W={W} sel={sel} issueMap={issueMap} onDown={startEvent} hp={hp} />)}
              <line x1={xp} x2={xp} y1={0} y2={H} className="tl-ph" />
            </svg>
          </div>
        </div>
      </div>
      {menu && (
        <div className="tl-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.title && <div className="tl-menu-title">{menu.title}</div>}
          <div className="tl-menu-list">
            {menu.items.length === 0 && <div className="muted small" style={{ padding: 8 }}>Пусто</div>}
            {menu.items.map((it, i) => it.head
              ? <div key={i} className="tl-menu-head">{it.head}</div>
              : <button key={i} className="tl-menu-item" disabled={it.disabled} {...hp(it.hint)} onClick={() => { setMenu(null); it.run(); }}>{it.label}{it.sub && <small>{it.sub}</small>}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

const RowItems = React.memo(function RowItems({ row, W, sel, issueMap, onDown, hp }) {
  const color = TRACKS[row.kind].color;
  const out = [];
  // линия между ключами камеры
  if (row.kind === 'camera' && row.items.length > 1) {
    const pts = row.items.slice().sort((a, b) => a.ev.t - b.ev.t);
    const yc = row.y + PAD_Y + LANE_H / 2;
    out.push(<line key="cl" x1={pts[0].x} x2={pts[pts.length - 1].x} y1={yc} y2={yc} className="tl-camline" />);
  }
  for (const it of row.items) {
    const right = it.dur ? it.x + it.w : it.x + 8;
    if (right + 240 < 0 || it.x - 10 > W) continue; // вне экрана
    const y = row.y + PAD_Y + it.lane * LANE_H;
    const isSel = sel && sel.track === row.key && sel.i === it.i;
    const bad = issueMap && issueMap[row.key + '#' + it.i];
    const cls = 'tl-ev' + (isSel ? ' sel' : '') + (bad ? ' bad-' + (bad === 'ошибка' ? 'e' : 'w') : '');
    const tip = (it.vd ? it.vd.label + ' — ' + it.vd.hint : '') + (bad ? ' (есть ' + bad + ' — нажми «Проверить»)' : '');
    if (it.dur) {
      const maxCh = Math.floor((it.w - 10) / 6.4);
      const txt = it.inside ? (it.label.length > maxCh ? it.label.slice(0, Math.max(1, maxCh - 1)) + '…' : it.label) : clip(it.label, it.maxCh);
      out.push(
        <g key={it.i} className={cls} onPointerDown={(e) => onDown(e, row, it)} onMouseEnter={hp(tip).onMouseEnter}>
          <title>{tip}</title>
          <rect x={it.x} y={y + 2} width={it.w} height={LANE_H - 4} rx={4} style={{ fill: color }} className="tl-block" />
          <text x={it.inside ? it.x + 5 : it.x + it.w + 5} y={y + LANE_H / 2 + 4} className={it.inside ? 'tl-btxt' : 'tl-otxt'}>{txt}</text>
        </g>
      );
    } else {
      const cy = y + LANE_H / 2;
      out.push(
        <g key={it.i} className={cls} onPointerDown={(e) => onDown(e, row, it)} onMouseEnter={hp(tip).onMouseEnter}>
          <title>{tip}</title>
          <rect x={it.x - 8} y={cy - 9} width={16} height={18} fill="transparent" />
          <path d={`M${it.x},${cy - 7} L${it.x + 7},${cy} L${it.x},${cy + 7} L${it.x - 7},${cy} Z`} style={{ fill: color }} className="tl-dia" />
          {it.label && it.maxCh >= 4 && <text x={it.x + 10} y={cy + 4} className="tl-otxt">{clip(it.label, it.maxCh)}</text>}
        </g>
      );
    }
  }
  return <g>{out}</g>;
});
