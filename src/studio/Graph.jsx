// Граф диалога или схемы (SVG): узлы-карточки, стрелки от выходов к узлам.
// Тяни карточку — двигать; тяни от кружка справа — провести стрелку; колесо — масштаб; тяни фон — сдвиг;
// правый клик по фону — добавить узел; правый клик по узлу — меню узла.
// kit — что за граф (виды узлов, размеры, выходы): по умолчанию диалог; «Схемы» передают свой (schemeKit.js).
// trace — { id узла: { ok, n } }: подсветка узлов, которые только что выполнила игра (как отладка блюпринтов UE).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { NODE_DEFS, PALETTE, nodeBox, HEAD, isEndRef, nodeOutputs, getOut } from './dialog.js';

const GRID = 10;
export const DIALOG_KIT = {
  NODE_DEFS, nodeBox, isEndRef, nodeOutputs, getOut,
  hasInput: () => true, isComment: () => false,
  palette: () => PALETTE.map((t) => ({ type: t, label: NODE_DEFS[t].label, color: NODE_DEFS[t].color, hint: NODE_DEFS[t].hint })),
  nodeMenu: null, empty: 'Пусто. Правый клик — добавить первый узел.', what: 'диалог'
};

export default function Graph({ dialog, refs, sel, onSelect, edit, gesture, hp, issueNodes, onAdd, onLink, onDelete, onDuplicate, onStart, onLayout, onReadFrom, focus, kit, trace, bar }) {
  const K = kit || DIALOG_KIT;
  const KN = K.NODE_DEFS;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [link, setLink] = useState(null); // { from, key, x, y } — тянем стрелку
  const [menu, setMenu] = useState(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const nodes = dialog.nodes || {};

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(150, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxes = useMemo(() => {
    const m = {};
    for (const [id, n] of Object.entries(nodes)) m[id] = K.nodeBox(n, refs);
    return m;
  }, [nodes, refs, K]);

  const latest = useRef(null);
  latest.current = { nodes, boxes, size };
  const fit = (all) => {
    const { nodes, boxes, size } = latest.current; // eslint-disable-line no-shadow
    const ids = Object.keys(nodes);
    if (!ids.length) { setView({ x: 40, y: 40, k: 1 }); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const n = nodes[id], b = boxes[id];
      x0 = Math.min(x0, n.x || 0); y0 = Math.min(y0, (n.y || 0) - 18);
      x1 = Math.max(x1, (n.x || 0) + b.w); y1 = Math.max(y1, (n.y || 0) + b.h);
    }
    // «Всё видно» — целиком; при открытии — не мельче 55%, чтобы читалось (тогда видно начало слева)
    const k = Math.max(all ? 0.25 : 0.55, Math.min(1.1, (size.w - 50) / (x1 - x0 || 1), (size.h - 40) / (y1 - y0 || 1)));
    const fx = (size.w - (x1 - x0) * k) / 2, fy = (size.h - (y1 - y0) * k) / 2;
    setView({ k, x: Math.max(20, fx) - x0 * k, y: Math.max(20, fy) - y0 * k });
  };
  const fitKey = dialog.id + ':' + (size.w > 300 ? 1 : 0);
  useEffect(() => { fit(); }, [fitKey]); // eslint-disable-line
  useEffect(() => {
    if (!focus || !nodes[focus.id]) return;
    const n = nodes[focus.id], b = boxes[focus.id];
    const k = Math.max(viewRef.current.k, 0.8);
    setView({ k, x: size.w / 2 - ((n.x || 0) + b.w / 2) * k, y: size.h / 2 - ((n.y || 0) + b.h / 2) * k });
  }, [focus]); // eslint-disable-line

  // колесо: масштаб вокруг курсора
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const v = viewRef.current;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { setView({ ...v, x: v.x - (e.deltaX || e.deltaY), y: v.y }); return; }
      const k2 = Math.min(2, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.0015)));
      setView({ k: k2, x: mx - ((mx - v.x) / v.k) * k2, y: my - ((my - v.y) / v.k) * k2 });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const dragWin = (move, up) => {
    const mv = (e) => move(e);
    const u = (e) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', u); up && up(e); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', u);
  };

  const startBg = (e) => {
    if (e.button !== 0) return;
    setMenu(null);
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    let moved = false;
    dragWin((ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setView({ ...v0, x: v0.x + dx, y: v0.y + dy });
    }, () => { if (!moved) onSelect(null); });
  };
  const startNode = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    onSelect({ node: id });
    const sx = e.clientX, sy = e.clientY;
    const n0 = nodes[id];
    const x0 = n0.x || 0, y0 = n0.y || 0, k = viewRef.current.k;
    let moved = false;
    dragWin((ev) => {
      const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (!moved && Math.hypot(dx * k, dy * k) < 3) return;
      if (!moved) { moved = true; gesture(); }
      const sn = (v) => (ev.shiftKey ? Math.round(v) : Math.round(v / GRID) * GRID);
      edit((d) => ({ ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], x: sn(x0 + dx), y: sn(y0 + dy) } } }), { silent: true });
    });
  };
  const startResize = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const n0 = nodes[id];
    const w0 = n0.w || 220, h0 = n0.h || 80, k = viewRef.current.k;
    let moved = false;
    dragWin((ev) => {
      if (!moved) { moved = true; gesture(); }
      const w = Math.max(120, Math.round((w0 + (ev.clientX - sx) / k) / GRID) * GRID), h = Math.max(50, Math.round((h0 + (ev.clientY - sy) / k) / GRID) * GRID);
      edit((d) => ({ ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], w, h } } }), { silent: true });
    });
  };
  const startPort = (e, from, key) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    const p = toWorld(e.clientX, e.clientY);
    setLink({ from, key, x: p.x, y: p.y });
    dragWin((ev) => { const q = toWorld(ev.clientX, ev.clientY); setLink((l) => l && { ...l, x: q.x, y: q.y }); }, (ev) => {
      setLink(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const g = el && el.closest && el.closest('[data-node]');
      if (g) { onLink(from, key, g.getAttribute('data-node')); return; }
      if (el && el.closest && el.closest('.gr-svg')) {
        const w = toWorld(ev.clientX, ev.clientY);
        openMenu(ev.clientX, ev.clientY, paletteItems({ x: w.x, y: w.y - HEAD / 2 }, { from, key }), 'Куда ведёт стрелка — новый узел');
      }
    });
  };
  const openMenu = (cx, cy, items, title) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = Math.min(cx - r.left, r.width - 236);
    const y = Math.min(cy - r.top, r.height - Math.min(330, 40 + items.length * 34));
    setMenu({ x: Math.max(4, x), y: Math.max(4, y), items, title });
  };
  const paletteItems = (pos, from) => K.palette(from).map((it) => (it.head ? it : { label: it.label, color: it.color, hint: it.hint, run: () => onAdd(it.type, pos, from, it.preset) }));
  const onCtx = (e) => {
    e.preventDefault();
    const g = e.target.closest && e.target.closest('[data-node]');
    if (g) {
      const id = g.getAttribute('data-node');
      onSelect({ node: id });
      openMenu(e.clientX, e.clientY, K.nodeMenu ? K.nodeMenu(id, nodes[id]) : [
        { label: 'Сделать стартом', hint: 'Диалог начнётся с этого узла.', disabled: dialog.start === id || nodes[id].type === 'end', run: () => onStart(id) },
        { label: 'Прочитать отсюда', hint: 'Открыть «Прочитать как игрок» с этого узла.', run: () => onReadFrom(id) },
        { label: 'Копия рядом', hint: 'Сделать копию узла (стрелки не копируются). Ctrl+D', run: () => onDuplicate(id) },
        { label: 'Удалить', hint: 'Удалить узел и стрелки, ведущие в него. Delete', run: () => onDelete(id) }
      ], (KN[nodes[id].type] || {}).label + ' «' + id + '»');
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    openMenu(e.clientX, e.clientY, paletteItems({ x: w.x, y: w.y }), 'Добавить узел');
  };
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!e.target.closest || !e.target.closest('.tl-menu')) setMenu(null); };
    const esc = (e) => e.key === 'Escape' && setMenu(null);
    setTimeout(() => window.addEventListener('pointerdown', close), 0);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);

  // ---------- стрелки ----------
  const edges = [];
  for (const [id, n] of Object.entries(nodes)) {
    const b = boxes[id];
    for (const o of K.nodeOutputs(n)) {
      const t = K.getOut(n, o.key);
      if (!t) continue;
      const py = b.single != null ? b.single : (b.rows.find((r) => r.key === o.key) || {}).y;
      const x1 = (n.x || 0) + b.w, y1 = (n.y || 0) + py;
      let x2, y2, stub = false, broken = false;
      if (nodes[t]) { x2 = nodes[t].x || 0; y2 = (nodes[t].y || 0) + (nodes[t].type === 'end' ? 15 : HEAD / 2); } else if (K.isEndRef(t, nodes)) { x2 = x1 + 46; y2 = y1; stub = true; } else { x2 = x1 + 46; y2 = y1; broken = true; }
      const hotE = trace && trace[id] && trace[t] && trace[t].n > trace[id].n;
      edges.push({ id: id + '>' + o.key, from: id, key: o.key, x1, y1, x2, y2, stub, broken, color: (KN[n.type] || {}).color, label: o.label, t, traced: hotE });
    }
  }
  const curve = (x1, y1, x2, y2) => {
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
    if (x2 < x1 + 20) { // назад: петля
      const dy = Math.max(60, Math.abs(y2 - y1) / 2);
      const midY = y2 >= y1 ? Math.max(y1, y2) + dy * 0.35 : Math.min(y1, y2) - dy * 0.35;
      return `M${x1},${y1} C${x1 + 70},${y1} ${x1 + 70},${midY} ${(x1 + x2) / 2},${midY} S${x2 - 70},${y2} ${x2},${y2}`;
    }
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };
  const selEdge = sel && sel.edge;
  const selNode = sel && sel.node;

  return (
    <div className="gr">
      <div className="tl-bar">
        <button className="btn sm primary" onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); const c = toWorld(svgRef.current.getBoundingClientRect().left + size.w / 2, svgRef.current.getBoundingClientRect().top + size.h / 2); openMenu(b.left, b.bottom + 4, paletteItems({ x: c.x - 110, y: c.y - 30 }), 'Добавить узел'); }} {...hp('Добавить узел в середину экрана. Быстрее: правый клик по пустому месту — узел встанет прямо туда; или тяни стрелку от кружка в пустоту.')}>
          <Icon name="plus" size={11} /> Узел
        </button>
        <button className="btn sm" onClick={() => { onLayout(); setTimeout(fit, 30); }} {...hp('Разложить узлы аккуратно слева направо: от ' + (K.what === 'схема' ? 'событий' : 'старта') + ' по стрелкам. Отменяется Ctrl+Z.')}><Icon name="grid" size={11} /> Разложить</button>
        {bar}
        <div className="grow" />
        <span className="muted small tl-tip">тяни от ● — стрелка · правый клик — меню · колесо — масштаб</span>
        <button className="btn sm ghost icon-btn" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.25), x: size.w / 2 - (size.w / 2 - v.x) / 1.25, y: size.h / 2 - (size.h / 2 - v.y) / 1.25 }))} {...hp('Отдалить (или колесо мыши вниз).')}>−</button>
        <span className="gr-zoom mono small" {...hp('Масштаб графа.')}>{Math.round(view.k * 100)}%</span>
        <button className="btn sm ghost icon-btn" onClick={() => setView((v) => ({ ...v, k: Math.min(2, v.k * 1.25), x: size.w / 2 - (size.w / 2 - v.x) * 1.25, y: size.h / 2 - (size.h / 2 - v.y) * 1.25 }))} {...hp('Приблизить (или колесо мыши вверх).')}>+</button>
        <button className="btn sm ghost" onClick={() => fit(true)} {...hp('Показать ' + (K.what === 'схема' ? 'всю схему' : 'весь диалог') + ' целиком.')}>Всё видно</button>
      </div>
      <div className="gr-wrap" ref={wrapRef}>
        <svg ref={svgRef} className="gr-svg" width={size.w} height={size.h} onPointerDown={startBg} onContextMenu={onCtx}>
          <defs>
            <pattern id="gr-dots" width={20 * view.k} height={20 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1} cy={1} r={1} className="gr-dot" />
            </pattern>
            <marker id="gr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="gr-arrowhead" /></marker>
            <marker id="gr-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#fff" /></marker>
          </defs>
          <rect x={0} y={0} width={size.w} height={size.h} fill="url(#gr-dots)" />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {edges.map((ed) => {
              const isSel = selEdge && selEdge.from === ed.from && selEdge.key === ed.key;
              const hot = selNode && (selNode === ed.from || selNode === ed.t);
              const d = curve(ed.x1, ed.y1, ed.x2, ed.y2);
              return (
                <g key={ed.id} className={'gr-edge' + (isSel ? ' sel' : '') + (hot ? ' hot' : '') + (ed.broken ? ' broken' : '') + (ed.traced ? ' traced' : '')}
                  onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); onSelect({ edge: { from: ed.from, key: ed.key } }); }}
                  onMouseEnter={hp('Стрелка «' + ed.label + '» → ' + ed.t + '. Щёлкни, чтобы выбрать; Delete — убрать стрелку. Перетяни кружок заново — переведётся на другой узел.').onMouseEnter}>
                  <path d={d} className="gr-hit" />
                  <path d={d} className="gr-line" style={{ stroke: isSel ? '#fff' : ed.color }} markerEnd={isSel ? 'url(#gr-arrow-sel)' : 'url(#gr-arrow)'} />
                  {ed.stub && <text x={ed.x2 + 4} y={ed.y2 + 4} className="gr-stub">конец</text>}
                  {ed.broken && <text x={ed.x2 + 4} y={ed.y2 + 4} className="gr-stub bad">«{ed.t}»?</text>}
                </g>
              );
            })}
            {link && (() => {
              const n = nodes[link.from], b = boxes[link.from];
              const py = b.single != null ? b.single : (b.rows.find((r) => r.key === link.key) || {}).y;
              return <path d={curve((n.x || 0) + b.w, (n.y || 0) + py, link.x, link.y)} className="gr-temp" />;
            })()}
            {Object.entries(nodes).sort((a, b) => (K.isComment(b[1]) ? 1 : 0) - (K.isComment(a[1]) ? 1 : 0)).map(([id, n]) => (
              <Node key={id} id={id} n={n} b={boxes[id]} start={dialog.start === id} sel={selNode === id} bad={issueNodes && issueNodes[id]}
                onDown={startNode} onPort={startPort} hp={hp} linking={!!link && link.from !== id} K={K} tr={trace && trace[id]}
                onResize={K.isComment(n) ? (e) => startResize(e, id) : null} />
            ))}
          </g>
        </svg>
        {!Object.keys(nodes).length && <div className="gr-empty muted">{K.empty}</div>}
        {menu && (
          <div className="tl-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.title && <div className="tl-menu-title">{menu.title}</div>}
            <div className="tl-menu-list">
              {menu.items.map((it, i) => (it.head ? <div key={i} className="tl-menu-head">{it.head}</div> : (
                <button key={i} className="tl-menu-item gr-menu-item" disabled={it.disabled} {...hp(it.hint)} onClick={() => { setMenu(null); it.run(); }}>
                  <span className="row">{it.color && <span className="tl-dot" style={{ background: it.color, marginTop: 0 }} />}{it.label}</span>
                </button>
              )))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Node = React.memo(function Node({ id, n, b, start, sel, bad, onDown, onPort, hp, linking, K, tr, onResize }) {
  const def = (K || DIALOG_KIT).NODE_DEFS[n.type] || { label: n.type, color: '#999', hint: '' };
  const x = n.x || 0, y = n.y || 0;
  const cls = 'gn t-' + n.type + (sel ? ' sel' : '') + (bad ? ' bad-' + (bad === 'ошибка' ? 'e' : 'w') : '') + (linking ? ' drop' : '') + (tr ? ' traced ' + (tr.ok === false ? 'tr-no' : 'tr-ok') + (tr.last ? ' tr-last' : '') : '');
  const tip = (b.title || def.label) + ' «' + id + '» — ' + (b.hint || def.hint) + (bad ? ' (есть ' + bad + ' — смотри справа)' : '');
  if (K && K.isComment(n)) {
    return (
      <g transform={`translate(${x},${y})`} data-node={id} className={cls + ' gn-comment'} onPointerDown={(e) => onDown(e, id)} onMouseEnter={hp(tip).onMouseEnter}>
        <rect width={b.w} height={b.h} rx={6} className="gn-cbox" />
        <text x={10} y={16} className="gn-ctitle">✎ Комментарий</text>
        {b.lines.map((l, i) => <text key={i} x={10} y={34 + i * 15} className="gn-ctxt">{l.t}</text>)}
        <path d={`M${b.w - 12},${b.h - 3} L${b.w - 3},${b.h - 12} M${b.w - 7},${b.h - 3} L${b.w - 3},${b.h - 7}`} className="gn-grip" onPointerDown={onResize} />
        <rect x={b.w - 14} y={b.h - 14} width={14} height={14} fill="transparent" style={{ cursor: 'nwse-resize' }} onPointerDown={onResize}><title>Тяни — изменить размер</title></rect>
      </g>
    );
  }
  const hasIn = !K || K.hasInput(n);
  if (n.type === 'end') {
    return (
      <g transform={`translate(${x},${y})`} data-node={id} className={cls} onPointerDown={(e) => onDown(e, id)} onMouseEnter={hp(tip).onMouseEnter}>
        <rect width={b.w} height={b.h} rx={15} className="gn-box" style={{ stroke: def.color }} />
        <rect x={12} y={11} width={8} height={8} rx={1.5} fill={def.color} />
        <text x={28} y={19.5} className="gn-type">Конец</text>
        <text x={b.w - 10} y={19.5} textAnchor="end" className="gn-id">{id}</text>
        <circle cx={0} cy={15} r={4.5} className="gn-in" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`} data-node={id} className={cls} onPointerDown={(e) => onDown(e, id)} onMouseEnter={hp(tip).onMouseEnter}>
      {start && (
        <g className="gn-start"><rect x={0} y={-17} width={52} height={15} rx={4} /><text x={26} y={-6} textAnchor="middle">СТАРТ</text></g>
      )}
      <rect width={b.w} height={b.h} rx={9} className="gn-box" />
      {tr && <rect x={-4} y={-4} width={b.w + 8} height={b.h + 8} rx={12} className="gn-glow" />}
      <path d={`M0,9 a9,9 0 0 1 9,-9 h${b.w - 18} a9,9 0 0 1 9,9 v${HEAD - 9} h-${b.w} z`} style={{ fill: def.color }} className="gn-head" />
      <text x={11} y={17.5} className="gn-type" style={{ fill: def.color }}>{b.title || def.label}</text>
      <text x={b.w - (b.single != null ? 16 : 10)} y={17.5} textAnchor="end" className="gn-id">{id}</text>
      {b.lines.map((l, i) => <text key={i} x={11} y={HEAD + 4 + (i + 1) * 15 - 3} className={'gn-txt ' + l.cls}>{l.t}</text>)}
      {b.rows.map((r, i) => (
        <g key={r.key} className="gn-row">
          <line x1={8} x2={b.w - 8} y1={r.y - 11} y2={r.y - 11} className="gn-sep" />
          {n.type === 'choice' && <text x={11} y={r.y + 4} className="gn-num">{i + 1}.</text>}
          {r.cond && <g><circle cx={b.w - 22} cy={r.y} r={6} className="gn-qc" /><text x={b.w - 22} y={r.y + 3.5} textAnchor="middle" className="gn-q">?</text><title>У варианта есть условие</title></g>}
          {r.act && <g><circle cx={b.w - (r.cond ? 37 : 22)} cy={r.y} r={6} className="gn-ac" /><text x={b.w - (r.cond ? 37 : 22)} y={r.y + 3.5} textAnchor="middle" className="gn-a">⚙</text><title>При выборе выполняются действия</title></g>}
          <text x={n.type === 'choice' ? 26 : 11} y={r.y + 4} className={'gn-opt' + (n.type === 'cond' ? (r.key === 'then' ? ' yes' : ' no') : '') + (r.add ? ' add' : '')}>{n.type === 'cond' ? (r.key === 'then' ? '✓ да' : '✕ нет') : r.label}</text>
          {r.extra && <text x={b.w - 14} y={r.y + 4} textAnchor="end" className="gn-id">{r.extra}</text>}
          <circle cx={b.w} cy={r.y} r={r.add ? 4.5 : 5.5} className={'gn-port' + (r.add ? ' add' : '')} data-port={r.key} onPointerDown={(e) => onPort(e, id, r.key)} style={{ fill: r.add ? 'transparent' : def.color, stroke: r.add ? def.color : undefined }}>
            <title>{r.add ? 'Тяни отсюда — новый выход' : 'Тяни отсюда стрелку к следующему узлу'}</title>
          </circle>
        </g>
      ))}
      {b.single != null && (
        <circle cx={b.w} cy={b.single} r={5.5} className="gn-port" onPointerDown={(e) => onPort(e, id, 'next')} style={{ fill: def.color }}>
          <title>Тяни отсюда стрелку к следующему узлу</title>
        </circle>
      )}
      {hasIn && <circle cx={0} cy={HEAD / 2} r={4.5} className="gn-in" />}
    </g>
  );
});
