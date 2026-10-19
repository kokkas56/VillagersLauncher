import React, { useEffect, useRef } from 'react';
import VillageScene from './VillageScene.jsx';
import { GAMES } from '../games/index.js';
import * as music from '../lib/music.js';
import { call } from '../lib/api.js';
import { REWARDS, AUTHOR_NICK } from '../games/rewards.js';
import { KOKK_SKIN } from '../games/kokkSkin.js';
import { currentEvent, weekInfo, levelOf, xpFor } from '../games/events.js';

// Фоны лаунчера: деревня + каждая мини-игра в спокойном режиме (жизнь идёт своим чередом)
// + фоны-награды (отдельные сцены из игр, только спокойная жизнь).
export const SCENES = [{ id: 'village', title: 'Деревня' }, ...GAMES.map((g) => ({ id: g.id, title: g.sceneTitle || g.title, game: g }))];
export function scenesFor(profile) {
  const got = (profile && profile.rewards) || {};
  const extra = REWARDS.filter((r) => r.kind === 'scene' && got[r.id]).map((r) => {
    const game = GAMES.find((g) => g.id === r.game);
    return game ? { id: r.game + '@' + r.variant, title: r.name.replace(/^Фон «(.*)»$/, '$1'), game, variant: r.variant, decor: true } : null;
  }).filter(Boolean);
  return [...SCENES, ...extra];
}
export const sceneById = (id, list = SCENES) => list.find((s) => s.id === id) || list[0];

const skinCache = {};
function loadSkin(nick) {
  if (!nick) return Promise.resolve(null);
  if (!skinCache[nick]) {
    const src = nick === AUTHOR_NICK ? Promise.resolve({ dataUrl: KOKK_SKIN }) : call('skin:ely', nick);
    skinCache[nick] = src.then((e) => new Promise((res) => {
      if (!e || !e.dataUrl) return res(null);
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = e.dataUrl;
    })).catch(() => null);
  }
  return skinCache[nick];
}
const today = () => {
  const d = new Date();
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return { key, seed: h };
};

export function darkness(h) {
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h > 17.5 && h < 21) return (h - 17.5) / 3.5;
  if (h >= 21 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 3;
}

// Живая игра-фон: один экземпляр на сцену, режим меняется на лету (idle | play | over).
function LiveGame({ game, variant, mode, paused, animations, hourOverride, best, onOver, profile, author, nick, onSave, onReward, onXp }) {
  const ref = useRef(null);
  const live = useRef({});
  live.current = { mode: variant ? 'idle' : mode, paused, animations, hourOverride, best, onOver, profile, author, nick, onSave, onReward, onXp };
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
      get best() { return live.current.best || 0; },
      // прогресс и награды (по нику игрока)
      load: () => {
        if (variant) return {};
        const g = live.current.profile && live.current.profile.games && live.current.profile.games[game.id];
        return g && g.d ? JSON.parse(JSON.stringify(g.d)) : {};
      },
      save: (obj) => { if (!variant && live.current.onSave) live.current.onSave(game.id, obj); },
      reward: (id) => { if (!variant && !live.current.author && live.current.onReward) live.current.onReward(id); },
      hasReward: (id) => !!(live.current.profile && live.current.profile.rewards && live.current.profile.rewards[id]),
      get author() { return !!live.current.author; },
      get nick() { return live.current.nick || null; },
      authorNick: AUTHOR_NICK,
      variant: variant || 0,
      day: today,
      skin: loadSkin,
      // событие месяца, турнир недели, мастерство
      event: () => currentEvent(),
      week: () => { const w = weekInfo(); return { ...w, isThisGame: w.game === game.id }; },
      xp: (n) => { if (!variant && !live.current.author && live.current.onXp) live.current.onXp(game.id, n); },
      mastery: () => {
        const xp = (live.current.profile && live.current.profile.mastery && live.current.profile.mastery[game.id]) || 0;
        const level = levelOf(xp);
        return { xp, level, next: xpFor(level + 1), prev: xpFor(level) };
      }
    };
    try { destroy = game.mount(canvas, api); } catch (e) { console.error('game mount', game.id, e); }
    return () => { try { destroy && destroy(); } catch (_) {} };
  }, [game]);
  useEffect(() => { if (mode === 'play' && ref.current) ref.current.focus(); }, [mode]);
  return <canvas ref={ref} className="village-scene live-game" width="320" height="180" tabIndex={-1} />;
}

export default function SceneHost({ scene, ...rest }) {
  if (!scene || !scene.game) return <VillageScene paused={rest.paused} animations={rest.animations} hourOverride={rest.hourOverride} />;
  return <LiveGame key={scene.id} game={scene.game} variant={scene.variant || 0} {...rest} />;
}
