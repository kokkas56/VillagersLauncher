import React, { useEffect, useRef } from 'react';
import VillageScene from './VillageScene.jsx';
import zombies from '../scenes/zombies.js';
import prison from '../scenes/prison.js';
import fair from '../scenes/fair.js';
import mine from '../scenes/mine.js';

// Сцены на фоне: деревня (своя, старая) и новые модули сцен с одним контрактом (create/draw).
export const SCENES = [
  { id: 'village', title: 'Деревня' },
  zombies, prison, fair, mine
];

const H = 180;

function darkness(h) {
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h > 17.5 && h < 21) return (h - 17.5) / 3.5;
  if (h >= 21 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 3;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ModuleScene({ scene, paused, animations, hourOverride }) {
  const ref = useRef(null);
  const live = useRef({ paused, animations, hourOverride });
  live.current = { paused, animations, hourOverride };
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let W = 320;
    let state = null;
    let raf = 0;
    let last = performance.now();
    const start = last;
    let mouse = 0; let smooth = 0;
    const resize = () => {
      const ar = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      W = Math.max(240, Math.round(H * ar));
      canvas.width = W;
      canvas.height = H;
      ctx.imageSmoothingEnabled = false;
      try { state = scene.create(W, H, rng(1234)); } catch (e) { console.error('scene create', e); state = null; }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const onMove = (e) => { mouse = (e.clientX / window.innerWidth - 0.5) * 2; };
    window.addEventListener('mousemove', onMove);
    let acc = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      if (L.paused || document.hidden) return;
      acc += dt;
      if (acc < 1 / 30) return; // 30 кадров в секунду хватает пиксельной сцене
      const step = acc; acc = 0;
      smooth += (mouse - smooth) * Math.min(1, step * 3);
      const d = new Date();
      const hour = L.hourOverride != null ? L.hourOverride : d.getHours() + d.getMinutes() / 60;
      if (!state) return;
      try {
        scene.draw(ctx, state, { t: (now - start) / 1000, dt: L.animations ? step : 0, W, H, dark: darkness(hour), mx: smooth, animations: L.animations });
      } catch (e) { console.error('scene draw', e); state = null; }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('mousemove', onMove); };
  }, [scene]);
  return <canvas ref={ref} className="village-scene" />;
}

export default function SceneHost({ sceneId, paused, animations, hourOverride }) {
  const scene = SCENES.find((s) => s.id === sceneId) || SCENES[0];
  if (scene.id === 'village') return <VillageScene paused={paused} animations={animations} hourOverride={hourOverride} />;
  return <ModuleScene key={scene.id} scene={scene} paused={paused} animations={animations} hourOverride={hourOverride} />;
}
