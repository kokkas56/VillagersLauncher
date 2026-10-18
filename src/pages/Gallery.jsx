import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtBytes, fmtDate } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Empty, Modal } from '../components/ui.jsx';

export default function Gallery() {
  const { t, lang, toast } = useApp();
  const [tab, setTab] = useState('shots');
  const [shots, setShots] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [backups, setBackups] = useState([]);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try { setShots(await call('shots:list')); } catch (_) {}
    try { setWorlds(await call('worlds:list')); } catch (_) {}
    try { setBackups(await call('worlds:backups')); } catch (_) {}
  };
  useEffect(() => { load(); }, []);

  const backup = async (w) => {
    setBusy(w.name);
    try {
      const r = await call('worlds:backup', w.name);
      toast(t('Копия мира сохранена') + ` (${fmtBytes(r.size)})`, 'ok');
      setBackups(await call('worlds:backups'));
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const restore = async (b) => {
    try {
      const name = await call('worlds:restore', b.file);
      toast(t('Мир восстановлен как') + ' «' + name + '»', 'ok');
      setWorlds(await call('worlds:list'));
    } catch (e) { toast(e.message, 'error'); }
  };

  const idx = view ? shots.findIndex((s) => s.file === view.file) : -1;

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="image" size={22} /> {t('Миры и скриншоты')}</h2>
        <div className="grow" />
        <div className="seg">
          <button className={tab === 'shots' ? 'on' : ''} onClick={() => setTab('shots')}>{t('Скриншоты')} <small>{shots.length}</small></button>
          <button className={tab === 'worlds' ? 'on' : ''} onClick={() => setTab('worlds')}>{t('Миры')} <small>{worlds.length}</small></button>
          <button className={tab === 'backups' ? 'on' : ''} onClick={() => setTab('backups')}>{t('Резервные копии')} <small>{backups.length}</small></button>
        </div>
        <button className="btn ghost" onClick={() => call('shell:openPath', tab === 'shots' ? 'screenshots' : tab === 'worlds' ? 'saves' : 'backups')}><Icon name="folder" /></button>
      </div>

      {tab === 'shots' && (shots.length === 0 ? <Empty icon="image">{t('Скриншотов пока нет. В игре нажми F2.')}</Empty> : (
        <div className="shots">
          {shots.map((s) => (
            <button key={s.file} className="shot" onClick={() => setView(s)}>
              <img src={s.url} alt="" loading="lazy" />
              <span>{fmtDate(s.mtime, lang)}</span>
            </button>
          ))}
        </div>
      ))}

      {tab === 'worlds' && (worlds.length === 0 ? <Empty icon="globe">{t('Миров пока нет.')}</Empty> : (
        <div className="worlds">
          {worlds.map((w) => (
            <div key={w.name} className="world card">
              <div className="world-icon">{w.icon ? <img src={w.icon} alt="" /> : <Icon name="globe" size={30} />}</div>
              <div className="grow">
                <b>{w.name}</b>
                <small className="muted">{t('Последняя игра')}: {fmtDate(w.mtime, lang)}</small>
              </div>
              <button className="btn" disabled={busy === w.name} onClick={() => backup(w)}><Icon name="save" /> {busy === w.name ? t('Сохраняю…') : t('Резервная копия')}</button>
              <button className="btn icon-btn ghost" onClick={() => call('shell:openPath', 'saves/' + w.name)}><Icon name="folder" /></button>
            </div>
          ))}
        </div>
      ))}

      {tab === 'backups' && (backups.length === 0 ? <Empty icon="save">{t('Копий пока нет. Сделай копию мира во вкладке «Миры».')}</Empty> : (
        <div className="worlds">
          {backups.map((b) => (
            <div key={b.file} className="world card">
              <div className="world-icon"><Icon name="save" size={26} /></div>
              <div className="grow">
                <b>{b.file}</b>
                <small className="muted">{fmtBytes(b.size)} · {fmtDate(b.mtime, lang)}</small>
              </div>
              <button className="btn" onClick={() => restore(b)}><Icon name="refresh" /> {t('Восстановить')}</button>
            </div>
          ))}
        </div>
      ))}

      {view && (
        <Modal title={view.file} onClose={() => setView(null)} wide
          footer={<>
            <button className="btn" disabled={idx <= 0} onClick={() => setView(shots[idx - 1])}>←</button>
            <button className="btn" disabled={idx >= shots.length - 1} onClick={() => setView(shots[idx + 1])}>→</button>
            <div className="grow" />
            <button className="btn" onClick={async () => { await call('shots:copy', view.file); toast(t('Скопировано в буфер обмена'), 'ok'); }}><Icon name="copy" /> {t('Копировать')}</button>
            <button className="btn danger" onClick={async () => { await call('shots:delete', view.file); setView(null); load(); }}><Icon name="trash" /> {t('В корзину')}</button>
          </>}>
          <img className="shot-full" src={view.url} alt="" />
        </Modal>
      )}
    </div>
  );
}
