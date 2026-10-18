import React, { useEffect, useState } from 'react';
import { useApp } from './lib/app.jsx';
import { call } from './lib/api.js';
import VillageScene from './components/VillageScene.jsx';
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
import Accounts from './pages/Accounts.jsx';
import Donate from './pages/Donate.jsx';
import Network from './pages/Network.jsx';
import SkinEditor from './editor/SkinEditor.jsx';

const NAV = [
  { id: 'home', icon: 'home', label: 'Главная' },
  { id: 'skins', icon: 'shirt', label: 'Скины' },
  { id: 'news', icon: 'news', label: 'Новости' },
  { id: 'mods', icon: 'mods', label: 'Моды' },
  { id: 'gallery', icon: 'image', label: 'Миры и скрины' },
  { id: 'servers', icon: 'globe', label: 'Сервера' },
  { id: 'network', icon: 'globe', label: 'С друзьями' },
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
  const [skin, setSkin] = useState(null);
  const [skinTick, setSkinTick] = useState(0);

  useEffect(() => {
    if (gameState.state === 'stopped' && gameState.crashed) setCrash(gameState);
    if (gameState.state === 'starting' && settings && settings.showConsole) setConsoleOpen(true);
  }, [gameState, settings]);

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

  const nav = settings.authorMode ? [...NAV.slice(0, 7), { id: 'author', icon: 'crown', label: 'Автор' }, NAV[7]] : NAV;
  const go = (p) => { setPage(p); };
  const openEditor = (initial) => setEditor(initial || {});

  const pageProps = { go, openEditor, openAccounts: () => setAccountsOpen(true), openDonate: () => setDonateOpen(true), skin, refreshSkin: () => setSkinTick((n) => n + 1) };

  return (
    <div className={'app' + (settings.animations === false ? ' no-anim' : '')}>
      <VillageScene paused={gameState.state === 'running' || !!editor} animations={settings.animations !== false} hourOverride={settings.theme === 'day' ? 12 : settings.theme === 'night' ? 23 : settings.theme === 'evening' ? 19.2 : null} />
      <TitleBar />
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
              <Head skin={skin && skin.skin} size={34} />
              <div className="ac-text">
                <b>{account ? account.name : t('Войти')}</b>
                <small>{account ? (account.type === 'ely' ? 'Ely.by' : t('Офлайн')) : t('Выбери аккаунт')}</small>
              </div>
            </button>
          </aside>
          <main className="content" key={page}>
            {page === 'home' && <Home {...pageProps} />}
            {page === 'skins' && <Skins {...pageProps} />}
            {page === 'news' && <News {...pageProps} />}
            {page === 'mods' && <Mods {...pageProps} />}
            {page === 'gallery' && <Gallery {...pageProps} />}
            {page === 'servers' && <Servers {...pageProps} />}
            {page === 'network' && <Network {...pageProps} />}
            {page === 'settings' && <Settings {...pageProps} />}
            {page === 'author' && <Author {...pageProps} />}
          </main>
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
      <Toasts />
    </div>
  );
}
