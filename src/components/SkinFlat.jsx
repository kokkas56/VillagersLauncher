import React, { useEffect, useRef } from 'react';

// Плоский вид спереди (без WebGL) — для миниатюр гардероба и шаблонов.
export default function SkinFlat({ skin, slim, scale = 6, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!skin) return;
    const img = new Image();
    img.onload = () => {
      const S = scale;
      const aw = slim ? 3 : 4;
      const ox = 0;
      const d = (sx, sy, w, h, dx, dy) => ctx.drawImage(img, sx, sy, w, h, Math.round(dx * S + ox), Math.round(dy * S), w * S, h * S);
      ctx.clearRect(0, 0, c.width, c.height);
      d(8, 8, 8, 8, 4, 0); d(40, 8, 8, 8, 4, 0); // голова
      d(20, 20, 8, 12, 4, 8); d(20, 36, 8, 12, 4, 8); // тело
      d(44, 20, aw, 12, 4 - aw, 8); d(44, 36, aw, 12, 4 - aw, 8); // правая рука
      d(36, 52, aw, 12, 12, 8); d(52, 52, aw, 12, 12, 8); // левая рука
      d(4, 20, 4, 12, 4, 20); d(4, 36, 4, 12, 4, 20); // правая нога
      d(20, 52, 4, 12, 8, 20); d(4, 52, 4, 12, 8, 20); // левая нога
    };
    img.src = skin;
  }, [skin, slim, scale]);
  return <canvas ref={ref} width={16 * scale} height={32 * scale} className={'skin-flat ' + className} />;
}
