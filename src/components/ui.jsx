import React, { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { win, on, fmtBytes } from '../lib/api.js';
import { useApp } from '../lib/app.jsx';

export function TitleBar() {
  const [max, setMax] = useState(false);
  useEffect(() => on('win-state', (s) => setMax(s.maximized)), []);
  return (
    <div className="titlebar">
      <div className="tb-drag">
        <img src="./icon.png" alt="" className="tb-icon" />
        <span className="tb-title">VillagersLauncher</span>
      </div>
      <div className="tb-btns">
        <button onClick={win.minimize} aria-label="minimize"><Icon name="min" size={12} /></button>
        <button onClick={win.maximize} aria-label="maximize"><Icon name={max ? 'copy' : 'max'} size={12} /></button>
        <button className="tb-close" onClick={win.close} aria-label="close"><Icon name="close" size={12} /></button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button className="btn icon-btn ghost" onClick={onClose}><Icon name="close" size={14} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'error' ? 'close' : 'info'} size={14} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ p, compact }) {
  const { t } = useApp();
  if (!p) return null;
  const pct = p.total ? Math.min(100, (p.bytes / p.total) * 100) : 0;
  const bytes = p.total && p.stage !== 'scan' && p.stage !== 'pack' ? `${fmtBytes(p.bytes)} / ${fmtBytes(p.total)}` : '';
  return (
    <div className={'progress' + (compact ? ' compact' : '')}>
      <div className="progress-text">
        <span>{t(p.text || '')}</span>
        <span className="muted">{bytes}</span>
      </div>
      <div className={'bar' + (p.indeterminate || !p.total ? ' indet' : '')}>
        <div style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-ui" />
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Section({ title, icon, children, right }) {
  return (
    <section className="card">
      <div className="card-head">
        {icon && <Icon name={icon} />}
        <h3>{title}</h3>
        <div className="grow" />
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon = 'info', children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div>{children}</div>
    </div>
  );
}
