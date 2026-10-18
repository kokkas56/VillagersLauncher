import React, { useEffect, useRef, useState } from 'react';
import { rgbToHsv, hsvToRgb, toHex, fromHex, css, PALETTES } from './color.js';

function useDrag(onPoint) {
  const ref = useRef(null);
  const handler = (e) => {
    const el = ref.current;
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      onPoint(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return [ref, handler];
}

export default function ColorPicker({ color, onChange, recent = [], t = (s) => s, extraPalette }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(color[0], color[1], color[2]));
  const [hexText, setHexText] = useState(toHex(color));
  const last = useRef(color);

  useEffect(() => {
    const c = last.current;
    if (c[0] !== color[0] || c[1] !== color[1] || c[2] !== color[2]) {
      const n = rgbToHsv(color[0], color[1], color[2]);
      setHsv((old) => [n[1] === 0 ? old[0] : n[0], n[1], n[2]]);
    }
    setHexText(toHex(color));
    last.current = color;
  }, [color]);

  const emit = (h, s, v, a = color[3]) => {
    setHsv([h, s, v]);
    const rgb = hsvToRgb(h, s, v);
    const c = [rgb[0], rgb[1], rgb[2], a];
    last.current = c;
    onChange(c);
  };

  const [svRef, svDown] = useDrag((x, y) => emit(hsv[0], x, 1 - y));
  const [hRef, hDown] = useDrag((x) => emit(Math.min(359.9, x * 360), hsv[1], hsv[2]));
  const [aRef, aDown] = useDrag((x) => onChange([color[0], color[1], color[2], Math.round(x * 255)]));

  const hueColor = toHex(hsvToRgb(hsv[0], 1, 1));
  return (
    <div className="cp">
      <div className="cp-sv" ref={svRef} onPointerDown={svDown} style={{ background: hueColor }}>
        <div className="cp-sv-w" />
        <div className="cp-sv-b" />
        <div className="cp-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: toHex(color) }} />
      </div>
      <div className="cp-strip cp-hue" ref={hRef} onPointerDown={hDown}>
        <div className="cp-bar" style={{ left: `${(hsv[0] / 360) * 100}%` }} />
      </div>
      <div className="cp-strip cp-alpha checker" ref={aRef} onPointerDown={aDown}>
        <div className="cp-alpha-fill" style={{ background: `linear-gradient(90deg, transparent, ${toHex(color)})` }} />
        <div className="cp-bar" style={{ left: `${((color[3] ?? 255) / 255) * 100}%` }} />
      </div>
      <div className="cp-row">
        <div className="cp-swatch checker"><div style={{ background: css(color) }} /></div>
        <input className="input mono" value={hexText} onChange={(e) => {
          setHexText(e.target.value);
          const c = fromHex(e.target.value);
          if (c) onChange(c[3] === 255 && e.target.value.replace('#', '').length === 6 ? [c[0], c[1], c[2], color[3]] : c);
        }} />
        <span className="cp-alpha-txt">{Math.round(((color[3] ?? 255) / 255) * 100)}%</span>
      </div>
      {recent.length > 0 && (
        <>
          <div className="cp-label">{t('Недавние')}</div>
          <div className="cp-swatches">
            {recent.map((c, i) => (
              <button key={i} className="cp-sw checker" title={toHex(c)} onClick={() => onChange(c)}><span style={{ background: css(c) }} /></button>
            ))}
          </div>
        </>
      )}
      {extraPalette && extraPalette.length > 0 && (
        <>
          <div className="cp-label">{t('Цвета скина')}</div>
          <div className="cp-swatches">
            {extraPalette.map((c, i) => (
              <button key={i} className="cp-sw" title={toHex(c)} onClick={() => onChange(c)}><span style={{ background: css(c) }} /></button>
            ))}
          </div>
        </>
      )}
      {Object.entries(PALETTES).map(([name, list]) => (
        <div key={name}>
          <div className="cp-label">{t(name)}</div>
          <div className="cp-swatches">
            {list.map((h) => {
              const c = fromHex(h);
              return <button key={h} className="cp-sw" title={h} onClick={() => onChange(c)}><span style={{ background: h }} /></button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
