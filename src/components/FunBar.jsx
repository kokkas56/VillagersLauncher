import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import Icon from './Icon.jsx';
import { SCENES } from './SceneHost.jsx';
import * as music from '../lib/music.js';

// Нижняя полоска главного экрана: сцена на фоне (◀ имя ▶, автосмена), музыка (нота + громкость), «Поиграть».
// Музыка по настройкам; молчит, пока запущен Minecraft.
export function useMusic(settingsIn, gameRunning) {
  const settings = settingsIn || {};
  useEffect(() => {
    music.setVolume(settings.musicVol != null ? settings.musicVol : 0.25);
    music.setSfxVolume(settings.sfxVol != null ? settings.sfxVol : 0.35);
    if (settings.musicOn && !gameRunning) music.play(); else music.stop();
  }, [settings.musicOn, settings.musicVol, settings.sfxVol, gameRunning]);
}

export default function FunBar({ onGames }) {
  const { t, settings, saveSettings } = useApp();
  const [volOpen, setVolOpen] = useState(false);
  const idx = Math.max(0, SCENES.findIndex((s) => s.id === (settings.scene || 'village')));
  const setScene = (i) => saveSettings({ scene: SCENES[(i + SCENES.length) % SCENES.length].id });

  // автосмена сцен раз в 3 минуты
  useEffect(() => {
    if (!settings.sceneAuto) return undefined;
    const id = setInterval(() => setScene(idx + 1), 3 * 60e3);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sceneAuto, idx]);

  const vol = settings.musicVol != null ? settings.musicVol : 0.25;
  return (
    <div className="fun-bar">
      <div className="fun-group" title={t('Сцена на фоне')}>
        <button className="fun-btn" onClick={() => setScene(idx - 1)}>◀</button>
        <span className="fun-name">{t(SCENES[idx].title)}</span>
        <button className="fun-btn" onClick={() => setScene(idx + 1)}>▶</button>
        <button className={'fun-btn' + (settings.sceneAuto ? ' on' : '')} title={t('Менять сцены сами')} onClick={() => saveSettings({ sceneAuto: !settings.sceneAuto })}>⟳</button>
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
      <button className="fun-play" onClick={onGames}><Icon name="star" size={12} /> {t('Поиграть')}</button>
    </div>
  );
}
