import React, { useEffect, useRef } from 'react';

// Пиксельная голова игрока (лицо + слой шапки) из PNG-скина.
export default function Head({ skin, size = 36, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 10, 10);
    if (!skin) {
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(1, 1, 8, 8);
      ctx.fillStyle = '#d8b48c';
      ctx.fillRect(2, 3, 6, 5);
      ctx.fillStyle = '#2b1d14';
      ctx.fillRect(3, 5, 1, 1);
      ctx.fillRect(6, 5, 1, 1);
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 10, 10);
      ctx.drawImage(img, 8, 8, 8, 8, 1, 1, 8, 8);
      ctx.drawImage(img, 40, 8, 8, 8, 0.5, 0.5, 9, 9);
    };
    img.src = typeof skin === 'string' ? skin : skin.toDataURL();
  }, [skin]);
  return <canvas ref={ref} width={10} height={10} className={'pixel-head ' + className} style={{ width: size, height: size }} />;
}
