import React, { useEffect, useRef } from 'react';
import VillageScene from './VillageScene.jsx';
import { GAMES } from '../games/index.js';
import * as music from '../lib/music.js';

// Фоны лаунчера: деревня + каждая мини-игра в спокойном режиме (жизнь идёт своим чередом).
export const SCENES = [{ id: 'village', title: 'Деревня' }, ...GAMES.map((g) => ({ id: g.id, title: g.sceneTitle || g.title, game: g }))];
export const sceneById = (id) => SCENES.find((s) => s.id === id) || SCENES[0];

export function darkness(h) {
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h > 17.5 && h < 21) return (h - 17.5) / 3.5;
  if (h >= 21 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 3;
}

// Живая игра-фон: один экземпляр на сцену, режим меняется на лету (idle | play | over).
function LiveGame({ game, mode, paused, animations, hourOverride, best, onOver }) {
  const ref = useRef(null);
  const live = useRef({});
  live.current = { mode, paused, animations, hourOverride, best, onOver };
  useEffect(() => {
    const canvas = ref.current;
    let destroy = null;
    const api = {
      mode: () => live.current.mode,
      paused: () => !!live.current.paused || document.hidden,
      env: () => {
        const L = live.current;
        const d = new Date();
        const h = L.hourOverride != null ? L.hourOverride : d.getHours() + d.getMinutes() / 60;
        return { dark: darkness(h), animations: L.animations !== false };
      },
      sfx: (n) => { if (live.current.mode === 'play') music.sfx(n); },
      over: (score) => { if (live.current.mode === 'play' && live.current.onOver) live.current.onOver(score); },
      get best() { return live.current.best || 0; }
    };
    try { destroy = game.mount(canvas, api); } catch (e) { console.error('game mount', game.id, e); }
    return () => { try { destroy && destroy(); } catch (_) {} };
  }, [game]);
  useEffect(() => { if (mode === 'play' && ref.current) ref.current.focus(); }, [mode]);
  return <canvas ref={ref} className="village-scene live-game" width="320" height="180" tabIndex={-1} />;
}

export default function SceneHost({ sceneId, mode, paused, animations, hourOverride, best, onOver }) {
  const scene = sceneById(sceneId);
  if (!scene.game) return <VillageScene paused={paused} animations={animations} hourOverride={hourOverride} />;
  return <LiveGame key={scene.id} game={scene.game} mode={mode} paused={paused} animations={animations} hourOverride={hourOverride} best={best} onOver={onOver} />;
}
