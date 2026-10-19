// Выпадающие меню в духе C4D: строка меню, контекстные меню, вложенные подменю.
// Пока открыто любое меню, встроенное окно игры прячется (окно другой программы всегда поверх нашего).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import I from './icons.jsx';

let holds = 0;
export function holdGame(on) {
  holds = Math.max(0, holds + (on ? 1 : -1));
  call('studio:embedHold', holds > 0).catch(() => {});
}
// для модальных окон и меню: прятать игру, пока компонент на экране
export function useHoldGame(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    holdGame(true);
    return () => holdGame(false);
  }, [active]);
}

// items: [{ label, kb, icon, run, disabled, checked, hint, sub:[…] } | { sep:true } | { head:'…' }]
export function PopMenu({ x, y, items, onClose, hp, minWidth }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState(null); // { i, x, y }
  useHoldGame(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x, ny = y;
    if (nx + r.width > window.innerWidth - 4) nx = Math.max(4, window.innerWidth - r.width - 4);
    if (ny + r.height > window.innerHeight - 4) ny = Math.max(4, window.innerHeight - r.height - 4);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [x, y]); // eslint-disable-line
  return (
    <div ref={ref} className="c4-menu" style={{ left: pos.x, top: pos.y, minWidth: minWidth || 230 }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((it, i) => {
        if (it.sep) return <div key={i} className="c4-msep" />;
        if (it.head) return <div key={i} className="c4-mhead">{it.head}</div>;
        const off = !!it.disabled;
        return (
          <div key={i} className={'c4-mi' + (off ? ' off' : '') + (it.checked ? ' checked' : '')}
            {...(hp && it.hint ? hp(it.hint) : it.hint ? { title: it.hint } : {})}
            onMouseEnter={(e) => {
              if (hp && it.hint) hp(it.hint).onMouseEnter();
              if (it.sub && !off) { const r = e.currentTarget.getBoundingClientRect(); setSub({ i, x: r.right - 2, y: r.top - 5 }); } else setSub(null);
            }}
            onClick={() => { if (off || it.sub) return; onClose(); if (it.run) it.run(); }}>
            <span className="ic">{it.icon && !it.checked ? <I name={it.icon} size={14} /> : null}</span>
            <span>{it.label}</span>
            {it.sub ? <span className="sub">▸</span> : it.kb ? <span className="kb">{it.kb}</span> : null}
          </div>
        );
      })}
      {sub && items[sub.i] && items[sub.i].sub && <PopMenu x={sub.x} y={sub.y} items={items[sub.i].sub} onClose={onClose} hp={hp} />}
    </div>
  );
}

// контекстное меню: const [menu, openMenu, closeMenu] = useMenu(); openMenu(e, items)
export function useMenu() {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const k = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', k);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', k); window.removeEventListener('blur', close); };
  }, [menu]);
  const open = (e, items, at) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const x = at ? at.x : e.clientX, y = at ? at.y : e.clientY;
    setMenu({ x, y, items });
  };
  return [menu, open, () => setMenu(null)];
}

export function MenuView({ menu, close, hp }) {
  if (!menu) return null;
  return <PopMenu x={menu.x} y={menu.y} items={menu.items} onClose={close} hp={hp} />;
}

// строка меню: menus = [{ id, label, hint, items: () => [...] }]
export function MenuBar({ menus, hp, right }) {
  const [open, setOpen] = useState(null); // { id, x, y }
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(null);
    const k = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', k);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', k); window.removeEventListener('blur', close); };
  }, [open]);
  const show = (m, el) => { const r = el.getBoundingClientRect(); setOpen({ id: m.id, x: r.left, y: r.bottom }); };
  const cur = open && menus.find((m) => m.id === open.id);
  return (
    <div className="c4-menubar">
      {menus.map((m) => (
        <button key={m.id} className={open && open.id === m.id ? 'on' : ''} {...hp(m.hint)}
          onMouseDown={(e) => { e.stopPropagation(); if (open && open.id === m.id) setOpen(null); else show(m, e.currentTarget); }}
          onMouseEnter={(e) => { hp(m.hint).onMouseEnter(); if (open && open.id !== m.id) show(m, e.currentTarget); }}>
          {m.label}
        </button>
      ))}
      <div className="c4-mb-right">{right}</div>
      {cur && <PopMenu x={open.x} y={open.y} items={cur.items()} onClose={() => setOpen(null)} hp={hp} />}
    </div>
  );
}
