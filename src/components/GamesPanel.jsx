import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';
import * as music from '../lib/music.js';
import runner from '../games/runner.js';
import prison from '../games/prison.js';
import fishing from '../games/fishing.js';
import defense from '../games/defense.js';

export const GAMES = [runner, prison, fishing, defense];

// Игра вместо фона лаунчера. active=true — играешь ты (кнопки лаунчера плавно спрятаны);
// active=false — кнопки вернулись, а игра доигрывает сама (api.auto) и плавно растворяется в обычной сцене.
export default function GameStage({ gameId, active, onExit, onDone }) {
  const { t, settings, saveSettings, account } = useApp();
  const game = GAMES.find((g) => g.id === gameId) || GAMES[0];
  const [run, setRun] = useState(0);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState({});
  const [fading, setFading] = useState(false);
  const [full, setFull] = useState(!!document.fullscreenElement);
  const canvas = useRef(null);
  const paused = useRef(false);
  const auto = useRef(!active);
  const ended = useRef(false);
  const best = useRef(settings.gameBest || {});
  best.current = settings.gameBest || {};

  // уход в меню: игра доигрывает сама, затем растворяется
  useEffect(() => {
    if (active) return undefined;
    auto.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const fade = () => { setFading(true); setTimeout(onDone, 900); };
    if (ended.current) { const id = setTimeout(fade, 300); return () => clearTimeout(id); }
    const id = setTimeout(fade, 11000); // страховка, если игра не закончилась сама
    const check = setInterval(() => { if (ended.current) { clearInterval(check); clearTimeout(id); setTimeout(fade, 1200); } }, 200);
    return () => { clearTimeout(id); clearInterval(check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    call('games:board').then((b) => b && setBoard(b)).catch(() => {});
    const offScores = on('scores', (b) => setBoard(b || {}));
    const onVis = () => { paused.current = document.hidden; };
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => { offScores && offScores(); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onExit]);

  useEffect(() => {
    if (!canvas.current) return undefined;
    setResult(null);
    ended.current = false;
    let done = false;
    let destroy = null;
    try {
      destroy = game.mount(canvas.current, {
        sfx: (n) => { if (!auto.current) music.sfx(n); },
        best: best.current[game.id] || 0,
        paused: () => paused.current,
        auto: () => auto.current,
        over: async (score) => {
          if (done) return;
          done = true;
          ended.current = true;
          if (auto.current) return; // доигрывал сам — в рекорды не идёт
          const sc = Math.max(0, Math.floor(score || 0));
          let r = { best: Math.max(sc, best.current[game.id] || 0), isBest: sc > (best.current[game.id] || 0) };
          try { r = await call('games:submit', { game: game.id, score: sc }); } catch (_) {}
          saveSettings({ gameBest: { ...best.current, [game.id]: r.best } });
          setTimeout(() => { if (!auto.current) setResult({ score: sc, ...r }); }, 600);
        }
      });
    } catch (e) { console.error('game mount', e); ended.current = true; }
    if (active) canvas.current.focus();
    return () => { try { destroy && destroy(); } catch (_) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, run]);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const top = (board[game.id] || []).slice(0, 8);
  const me = account ? account.name : null;

  return (
    <div className={'game-layer' + (active ? ' active' : ' auto') + (fading ? ' fading' : '')}>
      <canvas ref={canvas} className="game-canvas" width="320" height="180" tabIndex={0} />
      {active && (
        <div className="game-top">
          <button className="game-back" onClick={onExit}>◀ {t('Меню')} <span className="muted">Esc</span></button>
          <button className="game-back" title={full ? t('Выйти из полноэкранного режима') : t('Во весь экран')} onClick={toggleFull}>{full ? '⤡' : '⤢'}</button>
          <b className="game-title">{t(game.title)}</b>
          <span className="muted small game-hint">{t(game.controls)}</span>
        </div>
      )}
      {active && result && (
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
            <button className="btn primary" autoFocus onClick={() => setRun((n) => n + 1)}>{t('Ещё раз')}</button>
            <button className="btn ghost" onClick={onExit}>{t('В меню')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
