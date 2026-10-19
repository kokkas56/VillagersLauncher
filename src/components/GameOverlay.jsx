import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';

// Поверх игры-фона во время игры: «◀ Меню», во весь экран, подсказка; после проигрыша — счёт, рекорд и таблица игроков сборки.
export default function GameOverlay({ game, mode, result, onExit, onRetry }) {
  const { t, account } = useApp();
  const [board, setBoard] = useState({});
  const [full, setFull] = useState(!!document.fullscreenElement);

  useEffect(() => {
    call('games:board').then((b) => b && setBoard(b)).catch(() => {});
    const off = on('scores', (b) => setBoard(b || {}));
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => { off && off(); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const top = (board[game.id] || []).slice(0, 8);
  const me = account ? account.name : null;

  return (
    <div className="game-ui">
      <div className="game-top">
        <button className="game-back" onClick={onExit}>◀ {t('Меню')} <span className="muted">Esc</span></button>
        <button className="game-back" title={full ? t('Выйти из полноэкранного режима') : t('Во весь экран')} onClick={toggleFull}>{full ? '⤡' : '⤢'}</button>
        <b className="game-title">{t(game.title)}</b>
        <span className="muted small game-hint">{t(game.controls)}</span>
      </div>
      {mode === 'over' && result && (
        <div className="game-result">
          <div className="game-score">{result.score}</div>
          <div className="small">{result.isBest ? '★ ' + t('Новый рекорд!') : t('Рекорд') + ': ' + result.best}</div>
          <div className="game-board">
            <div className="small muted">{t('Лучшие игроки сборки')}</div>
            {top.length === 0 && <div className="small muted">{t('Пока пусто — будь первым')}</div>}
            {top.map((r, i) => (
              <div key={r.nick + i} className={'board-row' + (me && r.nick === me ? ' me' : '')}><span>{i + 1}.</span><span className="grow">{r.nick}</span><b>{r.score}</b></div>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" autoFocus onClick={onRetry}>{t('Ещё раз')}</button>
            <button className="btn ghost" onClick={onExit}>{t('В меню')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
