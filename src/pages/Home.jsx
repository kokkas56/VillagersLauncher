import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtBytes, fmtDate, fmtDuration } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Progress } from '../components/ui.jsx';
import SkinPreview from '../components/SkinPreview.jsx';
import { defaultSkinDataUrl } from '../editor/templates.js';

export default function Home({ go, openAccounts, openDonate, skin }) {
  const { t, lang, settings, account, pack, progress, gameState, busyState, toast, refreshAccounts, checkUpdates, checking } = useApp();
  const [servers, setServers] = useState([]);
  const [fallbackSkin] = useState(() => defaultSkinDataUrl());

  const running = gameState.state === 'running' || gameState.state === 'starting';
  const otherWork = busyState && busyState.busy && busyState.what !== 'play'; // заливка сборки, проверка файлов
  const preparing = gameState.state === 'preparing' || otherWork;

  useEffect(() => {
    const list = [...(settings.servers || []), ...((pack && pack.latest && pack.latest.servers) || [])].slice(0, 3);
    Promise.all(list.map(async (s) => ({ ...s, status: await call('servers:ping', s.address).catch(() => ({ online: false })) }))).then(setServers);
  }, [settings.servers, pack]);

  const play = async (quickPlay, how) => {
    if (!account) { openAccounts(); return; }
    if (pack && pack.dir && pack.dir.lost) { toast(t('Сначала укажи, где папка игры — баннер сверху'), 'warn', 7000); return; }
    try {
      await call('game:play', { ...(quickPlay ? { quickPlay } : {}), ...(how || {}) });
    } catch (e) {
      toast(e.message, 'error', 8000);
      if (e.relogin) { await refreshAccounts(); openAccounts(); }
    }
  };

  const latest = pack && pack.latest;
  const state = pack && pack.state;
  const needUpdate = latest && state && state.version && state.version !== latest.version && !pack.authorHome && !settings.pinnedPackVersion;
  const news = (latest && latest.changelog) || [];

  let playLabel = t('Играть');
  if (running) playLabel = gameState.state === 'starting' ? t('Запускается…') : t('В игре');
  else if (otherWork) playLabel = busyState.what === 'publish' ? t('Идёт заливка…') : t('Проверяю файлы…');
  else if (preparing) playLabel = t('Подготовка…');
  else if (!state || !state.version) playLabel = pack && pack.authorHome ? t('Играть') : t('Установить и играть');
  else if (needUpdate) playLabel = t('Обновить и играть');

  return (
    <div className="home">
      <div className="home-hero">
        <div className="hero-text">
          <div className="hero-kicker"><Icon name="emerald" size={14} /> MineVillagers · {latest ? `${t('сборка')} #${latest.version}` : 'NeoForge 1.21.1'}</div>
          <h1 className="hero-title">
            <span>Villagers</span>
            <span className="gold">Launcher</span>
          </h1>
          <p className="hero-sub">{t('Авторская сборка Кокка: живые деревни, сезоны, ночи и свои моды. Один клик — и ты в игре.')}</p>

          <div className="play-row">
            <button className={'play-btn' + (running ? ' running' : '') + (preparing ? ' busy' : '')} disabled={preparing || running} title={otherWork && busyState.what === 'publish' ? t('Играть можно будет, когда сборка зальётся') : undefined} onClick={() => play(undefined, needUpdate ? { update: true } : undefined)}>
              <span className="play-glow" />
              <Icon name={running ? 'check' : 'play'} size={22} />
              <span>{playLabel}</span>
            </button>
            {running && <button className="btn danger" onClick={() => call('game:kill')}>{t('Закрыть игру')}</button>}
            {!running && !preparing && needUpdate && <button className="btn ghost" title={t('Не скачивать новую сборку — играть на той, что стоит')} onClick={() => play(undefined, { noUpdate: true })}>{t('Играть на')} #{state.version}</button>}
            <button className="btn ghost" title={t('Папка игры')} onClick={() => call('shell:openPath', '').catch((e) => toast(e.message, 'error'))}><Icon name="folder" size={14} /> {t('Папка')}</button>
            {!running && <button className="btn ghost" disabled={checking} onClick={checkUpdates} title={t('Проверить обновления лаунчера и сборки')}><Icon name="refresh" size={14} /> {checking ? t('Проверяю…') : t('Обновления')}</button>}
          </div>
          <div className="play-progress">
            {progress && preparing ? <Progress p={progress} /> : (
              <div className="play-meta">
                {pack && pack.authorHome && <span className="pill gold"><Icon name="crown" size={12} /> {t('Режим автора: игра с твоими локальными файлами')}</span>}
                {needUpdate && <span className="pill green"><Icon name="download" size={12} /> {t('Доступна сборка')} #{latest.version}</span>}
                {pack && pack.latestEarly && <span className="pill gold" title={t('Эта версия пока только для поддержавших сборку')}><Icon name="star" size={12} /> {t('ранний доступ')}</span>}
                {latest && !needUpdate && state && state.version === latest.version && <span className="pill"><Icon name="check" size={12} /> {t('Сборка актуальна')}</span>}
                {latest && (!state || !state.version) && !pack.authorHome && <span className="pill">{t('Будет скачано')} ~{fmtBytes(latest.size)}</span>}
                {pack && pack.error && <span className="pill warn">{t('Нет связи с сервером сборки')}</span>}
                {settings.playTimeMs ? <span className="pill"><Icon name="star" size={12} /> {t('Наиграно')} {fmtDuration(settings.playTimeMs, lang)}</span> : null}
              </div>
            )}
          </div>
        </div>
        <div className="hero-skin" onClick={() => go('skins')} title={t('Скины')}>
          <div className="skin-pedestal" />
          <SkinPreview skin={(skin && skin.skin) || fallbackSkin} cape={skin && skin.cape} slim={skin && skin.slim} width={230} height={330} rotate={false} walk={false} zoom={0.82} controls={false} nameTag={account ? account.name : null} />
        </div>
      </div>

      <div className="home-grid">
        <section className="card news-card" onClick={() => go('news')}>
          <div className="card-head"><Icon name="news" /><h3>{t('Что нового')}</h3><div className="grow" /><span className="link">{t('Все новости')} →</span></div>
          {news.length === 0 && <p className="muted">{t('Новостей пока нет. Они появятся, когда автор зальёт сборку.')}</p>}
          {news.slice(0, 2).map((n) => (
            <div key={n.version} className="news-mini">
              <div className="news-mini-head"><b>#{n.version} · {n.title}</b><span className="muted">{fmtDate(n.date, lang)}</span></div>
              {n.text && <p>{n.text.slice(0, 220)}{n.text.length > 220 ? '…' : ''}</p>}
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head"><Icon name="globe" /><h3>{t('Сервера')}</h3><div className="grow" /><span className="link" onClick={() => go('servers')}>{t('Все')} →</span></div>
          {servers.length === 0 && <p className="muted">{t('Добавь сервер или адрес e4mc/Radmin друга во вкладке «Сервера».')}</p>}
          {servers.map((s) => (
            <div key={s.address} className="server-mini">
              <span className={'dot ' + (s.status && s.status.online ? 'on' : 'off')} />
              <div className="grow">
                <b>{s.name || s.address}</b>
                <small className="muted">{s.status && s.status.online ? `${s.status.players ? s.status.players.online + '/' + s.status.players.max : ''} · ${s.status.ping} ms` : t('не в сети')}</small>
              </div>
              <button className="btn sm" disabled={!s.status || !s.status.online || running || preparing} onClick={() => play(s.address)}>{t('Зайти')}</button>
            </div>
          ))}
        </section>

        <section className="card donate-card" onClick={openDonate}>
          <div className="donate-art"><Icon name="heart" size={26} /></div>
          <div>
            <h3>{t('Поддержать автора')}</h3>
            <p className="muted">{t('Сборка и моды делаются вручную. Любая поддержка на Boosty помогает выпускать обновления чаще.')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
