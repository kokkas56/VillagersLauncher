import React, { useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import { Modal } from './ui.jsx';
import { REWARDS, GAME_NAMES, KIND_NAMES, badgeSvg, capeDataUrl, LOBBY_BGS, THEMES } from '../games/rewards.js';
import { condProgress } from '../games/cosmetics.js';

// Все награды мини-игр: что уже получено (и что надето), что ещё закрыто и как это получить.
export default function RewardsModal({ profile, onClose, onScene }) {
  const { t, account, toast, settings } = useApp();
  const [busy, setBusy] = useState(null);
  const got = profile.rewards || {};
  const equip = profile.equip || {};
  const total = REWARDS.length;
  const have = REWARDS.filter((r) => got[r.id]).length;

  const slot = (r) => (r.kind === 'scene' ? null : r.kind);
  const isOn = (r) => {
    if (r.kind === 'badge' || r.kind === 'title') return equip[r.kind] === r.id;
    if (r.kind === 'theme') return equip.theme === r.theme;
    if (r.kind === 'frame') return equip.frame === r.frame;
    if (r.kind === 'music') return equip.music === r.track;
    if (r.kind === 'cape') return equip.cape === r.cape;
    if (r.kind === 'lobby') return equip.lobby === r.lobby;
    if (r.kind === 'decor') return equip.decor === r.decor;
    return false;
  };
  const toggle = async (r) => {
    const on = isOn(r);
    let value = null;
    if (!on) value = r.kind === 'badge' || r.kind === 'title' ? r.id : r.kind === 'theme' ? r.theme : r.kind === 'frame' ? r.frame : r.kind === 'music' ? r.track : r.kind === 'lobby' ? r.lobby : r.kind === 'decor' ? r.decor : r.cape;
    setBusy(r.id);
    try {
      await call('games:equip', { kind: slot(r), value, cape: r.kind === 'cape' && value ? capeDataUrl(r.cape) : null });
      if (r.kind === 'cape' && value) toast(t('Плащ надет — он будет виден в игре (мод SkinKokk)'), 'ok');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(null);
  };

  const games = Object.keys(GAME_NAMES);
  return (
    <Modal title={t('Награды мини-игр') + ` · ${have}/${total}`} onClose={onClose} wide>
      {settings && settings.authorMode && have < total && (
        <div className="hint-box small row">
          <span className="grow">{t('Режим автора: можно забрать все награды разом, чтобы проверить их. Очки и прогресс в играх не меняются.')}</span>
          <button className="btn sm primary" onClick={async () => { try { await call('games:grantAll', REWARDS.map((r) => r.id)); toast(t('Все награды получены'), 'ok'); } catch (e) { toast(e.message, 'error'); } }}>{t('Получить все')}</button>
        </div>
      )}
      {!account && <div className="hint-box small">{t('Войди в аккаунт: награды и прогресс привязываются к нику и переносятся на другой компьютер.')}</div>}
      <div className="rewards">
        {games.map((g) => (
          <section key={g} className="rw-game">
            <h4>{t(GAME_NAMES[g])} <span className="muted small">{REWARDS.filter((r) => r.game === g && got[r.id]).length}/{REWARDS.filter((r) => r.game === g).length}</span></h4>
            <div className="rw-list">
              {REWARDS.filter((r) => r.game === g).map((r) => {
                const open = !!got[r.id];
                return (
                  <div key={r.id} className={'rw-card' + (open ? ' open' : ' locked') + (isOn(r) ? ' on' : '')}>
                    <div className="rw-icon">
                      {r.kind === 'badge' ? <img src={badgeSvg(r, 22)} width="22" height="22" alt="" /> : r.kind === 'cape' && open ? <CapePreview id={r.cape} />
                        : r.kind === 'lobby' ? <LobbySwatch id={r.lobby} /> : r.kind === 'theme' && THEMES[r.theme] ? <span className="rw-swatch" style={{ background: `linear-gradient(135deg, ${THEMES[r.theme]['--gold']}, ${THEMES[r.theme]['--emerald']})` }} />
                          : r.kind === 'frame' ? <span className={'avatar-frame frame-' + r.frame}><span className="fp-frame-dot" /></span>
                            : <span>{({ title: '❝', scene: '▣', music: '♪', theme: '◐', frame: '▢', cape: '⚑', decor: '✦' })[r.kind]}</span>}
                    </div>
                    <div className="rw-text">
                      <b>{open ? t(r.name) : '???'}</b>
                      <span className="muted small">{t(KIND_NAMES[r.kind])} · {t(r.how)}{!open && r.cond ? progressText(condProgress(r.cond, profile)) : ''}</span>
                    </div>
                    {open && (r.kind === 'scene'
                      ? <button className="btn sm" onClick={() => { onScene && onScene(r.game + '@' + r.variant); onClose(); }}>{t('Фоном')}</button>
                      : <button className={'btn sm' + (isOn(r) ? ' primary' : '')} disabled={busy === r.id} onClick={() => toggle(r)}>{isOn(r) ? t('Снять') : t('Надеть')}</button>)}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

const progressText = (pr) => (pr && pr[1] > 1 ? ` (${pr[0]}/${pr[1]})` : '');
function LobbySwatch({ id }) {
  const b = LOBBY_BGS.find((x) => x.id === id);
  return <span className="rw-swatch" style={b ? { background: `linear-gradient(180deg, ${b.sky[0]}, ${b.sky[1]} 68%, ${b.ground} 68%)` } : undefined} />;
}
function CapePreview({ id }) {
  const url = capeDataUrl(id);
  if (!url) return null;
  // показываем «перед» плаща 10×16 из развёртки 64×32
  return <span className="cape-prev" style={{ backgroundImage: `url(${url})` }} />;
}
