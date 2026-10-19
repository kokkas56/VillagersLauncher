import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';
import Icon from './Icon.jsx';
import * as music from '../lib/music.js';
import runner from '../games/runner.js';
import prison from '../games/prison.js';
import fishing from '../games/fishing.js';
import defense from '../games/defense.js';

export const GAMES = [runner, prison, fishing, defense];

// Мини-игры прямо в лаунчере: выбор игры, сама игра (canvas 320×180, пиксели), итог с рекордом и таблицей игроков сборки.
export default function GamesPanel({ onClose }) {
  const { t, settings, saveSettings, account } = useApp();
  const [game, setGame] = useState(null);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState({});
  const canvas = useRef(null);
  const paused = useRef(false);

  useEffect(() => {
    call('games:board').then((b) => b && setBoard(b)).catch(() => {});
    return on('scores', (b) => setBoard(b || {}));
  }, []);

  useEffect(() => {
    const onVis = () => { paused.current = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e) => { if (e.key === 'Escape') { if (game) { setGame(null); setResult(null); } else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('keydown', onKey); };
  }, [game, onClose]);

  useEffect(() => {
    if (!game || !canvas.current) return undefined;
    setResult(null);
    let done = false;
    let destroy = null;
    try {
      destroy = game.mount(canvas.current, {
        sfx: (n) => music.sfx(n),
        best: (settings.gameBest || {})[game.id] || 0,
        paused: () => paused.current,
        over: async (score) => {
          if (done) return;
          done = true;
          const sc = Math.max(0, Math.floor(score || 0));
          let r = { best: sc, isBest: false };
          try { r = await call('games:submit', { game: game.id, score: sc }); } catch (_) {}
          saveSettings({ gameBest: { ...(settings.gameBest || {}), [game.id]: r.best } });
          setResult({ score: sc, ...r });
        }
      });
    } catch (e) { console.error('game mount', e); }
    return () => { try { destroy && destroy(); } catch (_) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, run]);

  const top = (id) => (board[id] || []).slice(0, 10);
  const me = account ? account.name : null;

  return (
    <div className="games-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="games-panel">
        <div className="games-head">
          {game ? <button className="btn sm ghost" onClick={() => { setGame(null); setResult(null); }}>◀ {t('Игры')}</button> : <b><Icon name="star" size={14} /> {t('Поиграть')}</b>}
          <span className="grow">{game ? <b>{t(game.title)}</b> : null}</span>
          <button className="btn sm ghost" title={t('Закрыть (Esc)')} onClick={onClose}><Icon name="close" size={12} /></button>
        </div>
        {!game && (
          <div className="games-list">
            {GAMES.map((g) => (
              <button key={g.id} className="game-card" onClick={() => { setGame(g); setRun((n) => n + 1); }}>
                <b>{t(g.title)}</b>
                <span className="muted small">{t(g.desc)}</span>
                <span className="small">{t('Рекорд')}: {(settings.gameBest || {})[g.id] || 0}</span>
              </button>
            ))}
            <label className="check small games-share">
              <input type="checkbox" checked={settings.gameShareScores !== false} onChange={(e) => saveSettings({ gameShareScores: e.target.checked })} />
              {t('Отправлять мои рекорды в общую таблицу (с ником аккаунта)')}
            </label>
          </div>
        )}
        {game && (
          <div className="game-stage">
            <canvas ref={canvas} className="game-canvas" width="320" height="180" tabIndex={0} />
            <div className="muted small game-hint">{t(game.controls)}</div>
            {result && (
              <div className="game-result">
                <div className="game-score">{result.score}</div>
                <div className="small">{result.isBest ? '★ ' + t('Новый рекорд!') : t('Рекорд') + ': ' + result.best}</div>
                <div className="game-board">
                  <div className="small muted">{t('Лучшие игроки сборки')}</div>
                  {top(game.id).length === 0 && <div className="small muted">{t('Пока пусто — будь первым')}</div>}
                  {top(game.id).map((r, i) => (
                    <div key={r.nick + i} className={'board-row' + (me && r.nick === me ? ' me' : '')}><span>{i + 1}.</span><span className="grow">{r.nick}</span><b>{r.score}</b></div>
                  ))}
                </div>
                <div className="row">
                  <button className="btn primary" autoFocus onClick={() => setRun((n) => n + 1)}>{t('Ещё раз')}</button>
                  <button className="btn ghost" onClick={() => { setGame(null); setResult(null); }}>{t('Другая игра')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
