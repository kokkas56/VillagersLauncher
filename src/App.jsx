import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './lib/app.jsx';
import { call, on } from './lib/api.js';
import SceneHost, { SCENES, scenesFor, sceneById } from './components/SceneHost.jsx';
import { rewardById, THEMES } from './games/rewards.js';
import { weekInfo } from './games/events.js';
import RewardsModal from './components/RewardsModal.jsx';
import { Badge } from './components/Badge.jsx';
import { useMusic } from './components/FunBar.jsx';
import { renderTrackWav } from './lib/music.js';
import GameOverlay from './components/GameOverlay.jsx';
import Icon from './components/Icon.jsx';
import Head from './components/Head.jsx';
import { TitleBar, Toasts, Modal } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Skins from './pages/Skins.jsx';
import Mods from './pages/Mods.jsx';
import News from './pages/News.jsx';
import Gallery from './pages/Gallery.jsx';
import Servers from './pages/Servers.jsx';
import Settings from './pages/Settings.jsx';
import Author from './pages/Author.jsx';
import Studio from './pages/Studio.jsx';
import Accounts from './pages/Accounts.jsx';
import Donate from './pages/Donate.jsx';
import Network from './pages/Network.jsx';
import Friends from './pages/Friends.jsx';
import FriendNotices from './components/FriendNotices.jsx';
import { useFriends } from './lib/friends.js';
import SkinEditor from './editor/SkinEditor.jsx';

const NAV = [
  { id: 'home', icon: 'home', label: 'Главная' },
  { id: 'skins', icon: 'shirt', label: 'Скины' },
  { id: 'news', icon: 'news', label: 'Новости' },
  { id: 'mods', icon: 'mods', label: 'Моды' },
  { id: 'gallery', icon: 'image', label: 'Миры и скрины' },
  { id: 'servers', icon: 'globe', label: 'Сервера' },
  { id: 'network', icon: 'globe', label: 'С друзьями' },
  { id: 'friends', icon: 'friends', label: 'Друзья' },
  { id: 'settings', icon: 'gear', label: 'Настройки' }
];

export default function App() {
  const app = useApp();
  const { t, settings, account, gameState, logs, update } = app;
  const [page, setPage] = useState('home');
  const [editor, setEditor] = useState(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [crash, setCrash] = useState(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  // фон: деревня или живая игра; «Играть» превращает фон в игру, выход — обратно
  const [randomScene] = useState(() => SCENES[Math.floor(Math.random() * SCENES.length)].id);
  const [sceneOverride, setSceneOverride] = useState(null);
  const [gmode, setGmode] = useState('idle'); // idle | play | over
  const [gresult, setGresult] = useState(null);
  const playing = gmode !== 'idle';
  // прогресс мини-игр и награды (по нику), обновляются из главного процесса
  const [profile, setProfile] = useState({ games: {}, rewards: {}, equip: {} });
  const [rewardsOpen, setRewardsOpen] = useState(false);
  useEffect(() => {
    call('games:profile').then((p) => p && setProfile(p)).catch(() => {});
    return on('profile', (p) => p && setProfile(p));
  }, [account && account.id]);
  const scenes = scenesFor(profile);
  const bg = settings ? (settings.bgScene || 'random') : 'random';
  const sceneId = sceneOverride || (bg === 'random' ? randomScene : bg);
  const scene = sceneById(sceneId, scenes);
  const onGameSave = useCallback((game, data) => {
    setProfile((p) => ({ ...p, games: { ...p.games, [game]: { t: Date.now(), d: data } } }));
    call('games:save', { game, data }).catch(() => {});
  }, []);
  // турнир недели: место в прошлой неделе → значок/титул (проверяем по общей таблице)
  useEffect(() => {
    if (!account) return undefined;
    const check = (b) => {
      const w = weekInfo();
      const list = (b && b['wk_' + w.prevKey]) || [];
      const i = list.findIndex((r) => r.nick === account.name);
      if (i === 0) onReward('week_champion');
      if (i >= 0 && i < 3) onReward('week_podium');
    };
    call('games:board').then(check).catch(() => {});
    return on('scores', check);
    // eslint-disable-next-line
  }, [account && account.name]);
  const onXp = useCallback(async (game, amount) => {
    let r = null;
    try { r = await call('games:xp', { game, amount }); } catch (_) {}
    if (r && r.up) app.toast(t('Мастерство') + ': ' + t('уровень') + ' ' + r.level, 'ok', 5000);
  }, []);
  const onReward = useCallback(async (id) => {
    let granted = false;
    try { granted = await call('games:reward', id); } catch (_) {}
    const r = rewardById(id);
    if (granted && r) app.toast(t('Награда') + ': ' + r.name + ' — ' + t('надень во вкладке «Награды»'), 'ok', 9000);
  }, []);
  const exitGame = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setGmode('idle'); setGresult(null);
  }, []);
  const onGameOver = useCallback(async (score) => {
    setGmode('over');
    const sc = Math.max(0, Math.floor(score || 0));
    let r = { best: sc, isBest: true };
    const gid = scene.game ? scene.game.id : scene.id;
    const wk = weekInfo();
    try { r = await call('games:submit', { game: gid, score: sc, week: wk.game === gid && !settings.authorMode ? wk.key : null }); } catch (_) {}
    app.refreshSettings && app.refreshSettings();
    setGresult({ score: sc, ...r });
  }, [scene.id, scene.game, settings && settings.authorMode]);
  const playGame = (id) => { if (id && id.includes('@')) id = id.split('@')[0];
     if (id && id !== sceneId) setSceneOverride(id); setGresult(null); setGmode('play'); };
  const chooseScene = (id) => { setSceneOverride(null); app.saveSettings({ bgScene: id }); };
  useMusic(settings, gameState.state === 'running' || gameState.state === 'starting', profile.equip.music);
  // музыка лобби в игре: каждый открытый трек один раз записывается в файл (игра играет его в главном меню)
  const musicRendering = useRef(false);
  const rewardsKey = Object.keys(profile.rewards || {}).filter((k) => k.includes('_music_')).sort().join(',');
  useEffect(() => {
    if (musicRendering.current) return;
    musicRendering.current = true;
    const tm = setTimeout(async () => {
      try {
        const r = await call('friends:musicNeed');
        for (const id of (r && r.need) || []) {
          const data = await renderTrackWav(id, { seconds: 120 });
          await call('friends:musicSave', { id, data });
        }
      } catch (e) { console.warn('музыка лобби: ' + e.message); }
      musicRendering.current = false;
    }, 4000);
    return () => { clearTimeout(tm); musicRendering.current = false; };
  }, [rewardsKey, settings && settings.gameDir]);
  // друзья: счётчик у вкладки, приглашения поверх любой вкладки; мини-игра в лаунчере видна друзьям как статус
  const fs = useFriends();
  const friendsCount = fs ? fs.incoming.length + (fs.invites || []).length + fs.notes.filter((n) => !n.read).length : 0;
  const playingTitle = playing && scene.game ? scene.game.title : '';
  useEffect(() => {
    call('friends:activity', playingTitle ? 'Играет в «' + playingTitle + '» в лаунчере' : '').catch(() => {});
  }, [playingTitle]);
  const [skin, setSkin] = useState(null);
  const [skinTick, setSkinTick] = useState(0);

  // окно «Игра закрылась с ошибкой» — один раз на каждый вылет (не при любой смене настроек)
  const crashShown = useRef(null);
  useEffect(() => {
    if (gameState.state === 'stopped' && gameState.crashed && crashShown.current !== gameState) { crashShown.current = gameState; setCrash(gameState); }
  }, [gameState]);
  useEffect(() => {
    if (gameState.state === 'starting' && settings && settings.showConsole) setConsoleOpen(true);
  }, [gameState]); // eslint-disable-line

  useEffect(() => {
    let alive = true;
    (async () => {
      let s = null;
      try { s = await call('skin:current'); } catch (_) {}
      if (!s && account && account.type === 'ely') { try { const e = await call('skin:ely', account.name); if (e) s = { skin: e.dataUrl, slim: e.slim }; } catch (_) {} }
      if (alive) setSkin(s);
    })();
    return () => { alive = false; };
  }, [account, editor, skinTick]);

  if (!settings) return <div className="boot"><div className="boot-logo">VillagersLauncher</div></div>;

  const nav = settings.authorMode ? [...NAV.slice(0, -1), { id: 'author', icon: 'crown', label: 'Автор' }, { id: 'studio', icon: 'film', label: 'Студия' }, NAV[NAV.length - 1]] : NAV;
  const go = (p) => { setPage(p); };
  const openEditor = (initial) => setEditor(initial || {});

  const pageProps = { go, openEditor, openAccounts: () => setAccountsOpen(true), openDonate: () => setDonateOpen(true), playGame, sceneId: scene.id, scenes, chooseScene, openRewards: () => setRewardsOpen(true), skin, refreshSkin: () => setSkinTick((n) => n + 1) };

  return (
    <div className={'app' + (settings.animations === false ? ' no-anim' : '') + (playing ? ' playing' : '')} style={profile.equip.theme && THEMES[profile.equip.theme] ? THEMES[profile.equip.theme] : undefined}>
      <SceneHost scene={scene} profile={profile} author={!!settings.authorMode} nick={account ? account.name : null} onSave={onGameSave} onReward={onReward} onXp={onXp} mode={editor ? 'idle' : gmode} best={(settings.gameBest || {})[scene.game ? scene.game.id : ''] || 0} onOver={onGameOver} paused={gameState.state === 'running' || !!editor} animations={settings.animations !== false} hourOverride={settings.theme === 'day' ? 12 : settings.theme === 'night' ? 23 : settings.theme === 'evening' ? 19.2 : null} />
      <TitleBar />
      {rewardsOpen && <RewardsModal profile={profile} onScene={chooseScene} onClose={() => setRewardsOpen(false)} />}
      {playing && scene.game && !editor && <GameOverlay game={scene.game} mode={gmode} result={gresult} onExit={exitGame} onRetry={() => { setGresult(null); setGmode('play'); }} />}
      {editor ? (
        <SkinEditor initial={editor} onClose={() => setEditor(null)} />
      ) : (
        <div className="shell">
          <aside className="sidebar">
            <div className="brand" onClick={() => go('home')}>
              <img src="./icon.png" alt="" />
              <div>
                <div className="brand-name">Villagers</div>
                <div className="brand-sub">Launcher</div>
              </div>
            </div>
            <nav>
              {nav.map((n) => (
                <button key={n.id} className={'nav' + (page === n.id ? ' on' : '')} onClick={() => go(n.id)}>
                  <Icon name={n.icon} size={18} />
                  <span>{t(n.label)}</span>
                  {n.id === 'friends' && friendsCount > 0 && <span className="nav-count">{friendsCount}</span>}
                </button>
              ))}
            </nav>
            <div className="grow" />
            <button className="site-link" onClick={() => call('shell:open', 'https://kokkas56.github.io/VillagersLauncher/')}>
              <Icon name="globe" size={14} />
              <span>{t('Сайт сборки')}</span>
            </button>
            <button className="donate-mini" onClick={() => setDonateOpen(true)}>
              <Icon name="heart" size={16} />
              <span>{t('Поддержать')}</span>
            </button>
            <button className="account-chip" onClick={() => setAccountsOpen(true)}>
              <span className={'avatar-frame' + (profile.equip.frame ? ' frame-' + profile.equip.frame : '')}><Head skin={skin && skin.skin} size={34} /></span>
              <div className="ac-text">
                <b>{account ? account.name : t('Войти')} <Badge id={profile.equip.badge} /></b>
                <small>{profile.equip.title ? <span className="ac-title">{rewardById(profile.equip.title) ? rewardById(profile.equip.title).name : ''}</span> : account ? (account.type === 'ely' ? 'Ely.by' : t('Офлайн')) : t('Выбери аккаунт')}</small>
              </div>
            </button>
          </aside>
          <main className={'content' + (page === 'studio' ? ' studio-host' : '')} key={page}>
            {page === 'home' && <Home {...pageProps} />}
            {page === 'skins' && <Skins {...pageProps} />}
            {page === 'news' && <News {...pageProps} />}
            {page === 'mods' && <Mods {...pageProps} />}
            {page === 'gallery' && <Gallery {...pageProps} />}
            {page === 'servers' && <Servers {...pageProps} />}
            {page === 'network' && <Network {...pageProps} />}
            {page === 'friends' && <Friends {...pageProps} />}
            {page === 'settings' && <Settings {...pageProps} />}
            {page === 'author' && <Author {...pageProps} />}
            {page === 'studio' && settings.authorMode && <Studio {...pageProps} />}
          </main>
        </div>
      )}

      {app.pack && app.pack.dir && app.pack.dir.lost && (
        <div className="update-banner warn">
          <Icon name="folder" />
          <span>{t('Сборка не найдена в папке')} <b className="mono">{app.pack.dir.path}</b> — {t('её переименовали или перенесли?')}</span>
          {app.pack.dir.candidates.map((c) => (
            <button key={c} className="btn sm primary" onClick={async () => { try { await call('game:useDir', c); await app.refreshSettings(); app.refreshPack(); app.toast(t('Нашлась! Качать заново не нужно'), 'ok'); } catch (e) { app.toast(e.message, 'error'); } }}>
              {t('Это она:')} {c.split(/[\\/]/).pop()}
            </button>
          ))}
          <button className="btn sm" onClick={async () => { const d = await call('dialog:pickFolder', app.pack.dir.path); if (!d) return; try { const r = await call('game:useDir', d); await app.refreshSettings(); app.refreshPack(); app.toast(r.hasPack ? t('Нашлась! Качать заново не нужно') : t('В этой папке сборки нет — она скачается туда'), r.hasPack ? 'ok' : 'warn'); } catch (e) { app.toast(e.message, 'error'); } }}>{t('Указать папку')}</button>
          <button className="btn sm ghost" onClick={async () => { await call('game:freshDir'); app.refreshPack(); }}>{t('Скачать заново')}</button>
        </div>
      )}
      {update && update.state === 'manual' && (
        <div className="update-banner">
          <span>{t('Вышла новая версия лаунчера')} {update.version}</span>
          <button className="btn sm primary" onClick={() => call('shell:open', update.url)}>{t('Скачать')}</button>
        </div>
      )}
      {update && update.state === 'installing' && (
        <div className="update-banner">
          <Icon name="rocket" />
          <span>{t('Обновляю лаунчер до')} {update.version} — {t('сейчас перезапустится сам')}</span>
        </div>
      )}
      {update && update.state === 'ready' && (
        <div className="update-banner">
          <Icon name="rocket" />
          <span>{t('Готово обновление лаунчера')} {update.version} — {t('поставится само, когда закроешь игру')}</span>
          <button className="btn sm primary" onClick={() => call('app:installUpdate')}>{t('Перезапустить')}</button>
        </div>
      )}

      {(gameState.state === 'running' || gameState.state === 'starting') && !editor && (
        <button className="console-fab" onClick={() => setConsoleOpen(!consoleOpen)} title={t('Консоль игры')}><Icon name="terminal" /></button>
      )}
      {consoleOpen && (
        <div className="console">
          <div className="console-head">
            <b>{t('Консоль игры')}</b>
            <div className="grow" />
            <button className="btn sm" onClick={() => call('shell:openPath', 'logs')}>{t('Папка логов')}</button>
            {gameState.state !== 'stopped' && gameState.state !== 'idle' && <button className="btn sm danger" onClick={() => call('game:kill')}>{t('Закрыть игру')}</button>}
            <button className="btn icon-btn sm" onClick={() => setConsoleOpen(false)}><Icon name="close" size={12} /></button>
          </div>
          <pre className="console-body">{logs.slice(-400).join('\n')}</pre>
        </div>
      )}

      {accountsOpen && <Accounts onClose={() => setAccountsOpen(false)} />}
      {donateOpen && <Donate onClose={() => setDonateOpen(false)} />}
      {crash && (
        <Modal title={t('Игра закрылась с ошибкой')} onClose={() => setCrash(null)} wide
          footer={<>
            <button className="btn" onClick={() => call('shell:openPath', 'crash-reports')}>{t('Отчёты о вылетах')}</button>
            <button className="btn" onClick={() => call('shell:openPath', 'logs')}>{t('Логи')}</button>
            <button className="btn primary" onClick={() => setCrash(null)}>{t('Понятно')}</button>
          </>}>
          <p className="muted">{t('Код выхода')}: {String(crash.code)}. {t('Последние строки лога:')}</p>
          <pre className="crash-log">{(crash.tail || []).join('\n')}</pre>
        </Modal>
      )}
      {!editor && page !== 'friends' && <FriendNotices fs={fs} onOpen={() => go('friends')} />}
      {!editor && page === 'friends' && fs && fs.invites && fs.invites.length > 0 && <FriendNotices fs={{ ...fs, prompt: null }} />}
      <Toasts />
    </div>
  );
}
