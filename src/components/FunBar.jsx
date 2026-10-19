import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import Icon from './Icon.jsx';
import { SCENES } from './SceneHost.jsx';
import * as music from '../lib/music.js';

// Нижняя полоска главного экрана: фон (◀ имя ▶, случайный), музыка (нота + громкость), «Играть» — фон превращается в игру.
// Музыка по настройкам; молчит, пока запущен Minecraft.
export function useMusic(settingsIn, gameRunning) {
  const settings = settingsIn || {};
  useEffect(() => {
    music.setVolume(settings.musicVol != null ? settings.musicVol : 0.25);
    music.setSfxVolume(settings.sfxVol != null ? settings.sfxVol : 0.35);
    if (settings.musicOn && !gameRunning) music.play(); else music.stop();
  }, [settings.musicOn, settings.musicVol, settings.sfxVol, gameRunning]);
}

export default function FunBar({ sceneId, onScene, onPlay }) {
  const { t, settings, saveSettings } = useApp();
  const [volOpen, setVolOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const idx = Math.max(0, SCENES.findIndex((s) => s.id === sceneId));
  const scene = SCENES[idx];
  const isRandom = (settings.bgScene || 'random') === 'random';
  const setScene = (i) => onScene(SCENES[(i + SCENES.length) % SCENES.length].id);
  const vol = settings.musicVol != null ? settings.musicVol : 0.25;
  const games = SCENES.filter((s) => s.game);
  return (
    <div className="fun-bar">
      <div className="fun-group" title={t('Фон лаунчера')}>
        <button className="fun-btn" onClick={() => setScene(idx - 1)}>◀</button>
        <span className="fun-name">{t(scene.title)}</span>
        <button className="fun-btn" onClick={() => setScene(idx + 1)}>▶</button>
        <button className={'fun-btn' + (isRandom ? ' on' : '')} title={t('Случайный фон при каждом запуске')} onClick={() => onScene(isRandom ? scene.id : 'random')}>🎲</button>
      </div>
      <div className="fun-group music" onMouseLeave={() => setVolOpen(false)}
        onWheel={(e) => saveSettings({ musicVol: Math.max(0, Math.min(1, Math.round((vol - Math.sign(e.deltaY) * 0.05) * 100) / 100)) })}>
        <button className={'fun-btn' + (settings.musicOn ? ' on' : '')} title={settings.musicOn ? t('Выключить музыку') : t('Включить музыку')}
          onClick={() => saveSettings({ musicOn: !settings.musicOn })} onMouseEnter={() => setVolOpen(true)}>♪</button>
        {volOpen && (
          <input className="fun-vol" type="range" min="0" max="100" value={Math.round(vol * 100)} title={t('Громкость') + ' ' + Math.round(vol * 100) + '%'}
            onChange={(e) => saveSettings({ musicVol: +e.target.value / 100 })} />
        )}
      </div>
      <div className="fun-group play">
        <button className="fun-play" title={scene.game ? t(scene.game.desc) : t('Выбрать игру')}
          onClick={() => { if (scene.game) { setPick(false); onPlay(scene.id); } else setPick(!pick); }}>
          <Icon name="star" size={12} /> {scene.game ? t('Играть') + ': ' + t(scene.game.title) : t('Поиграть')}
        </button>
        <button className={'fun-btn' + (pick ? ' on' : '')} title={t('Другие игры')} onClick={() => setPick(!pick)}>▾</button>
      </div>
      {pick && (
        <div className="fun-games">
          {games.map((g) => (
            <button key={g.id} className="fun-game" title={t(g.game.desc)} onClick={() => { setPick(false); onPlay(g.id); }}>
              <b>{t(g.game.title)}</b>
              <span className="muted">★ {(settings.gameBest || {})[g.id] || 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
