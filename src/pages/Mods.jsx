import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtBytes } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';

export default function Mods() {
  const { t, pack, toast } = useApp();
  const [mods, setMods] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const optional = new Set((pack && pack.latest && pack.latest.optional) || []);
  const authorHome = pack && pack.authorHome;

  const load = async () => { try { setMods(await call('mods:list')); } catch (e) { setMods([]); toast(e.message, 'error'); } };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const list = useMemo(() => (mods || []).filter((m) => {
    if (filter === 'kokk' && !m.kokk) return false;
    if (filter === 'off' && m.enabled) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (m.name || '').toLowerCase().includes(s) || (m.id || '').toLowerCase().includes(s) || (m.description || '').toLowerCase().includes(s);
  }), [mods, q, filter]);

  const toggle = async (m) => {
    try {
      await call('mods:toggle', { path: m.path, enabled: !m.enabled });
      await load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="mods" size={22} /> {t('Моды')}</h2>
        <span className="muted">{mods ? `${mods.length} ${t('шт.')}` : ''}</span>
        <div className="grow" />
        <input className="input search" placeholder={t('Поиск мода…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg sm">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('Все')}</button>
          <button className={filter === 'kokk' ? 'on' : ''} onClick={() => setFilter('kokk')}>{t('Моды Кокка')}</button>
          <button className={filter === 'off' ? 'on' : ''} onClick={() => setFilter('off')}>{t('Выключенные')}</button>
        </div>
        <button className="btn ghost" onClick={() => call('shell:openPath', 'mods')}><Icon name="folder" /> {t('Папка')}</button>
      </div>
      {mods && mods.length === 0 && <Empty icon="mods">{t('Модов пока нет — они скачаются при первом запуске.')}</Empty>}
      <div className="mod-grid">
        {list.map((m) => {
          const canToggle = authorHome || optional.has(m.path) || !m.enabled;
          return (
            <div key={m.file} className={'mod' + (m.enabled ? '' : ' off') + (m.kokk ? ' kokk' : '')}>
              <div className="mod-icon">{m.icon ? <img src={m.icon} alt="" /> : <Icon name={m.kokk ? 'emerald' : 'cube'} size={26} />}</div>
              <div className="mod-body">
                <div className="mod-title">
                  <b>{m.name}</b>
                  {m.kokk && <span className="pill gold sm">Kokk</span>}
                  {optional.has(m.path) && <span className="pill sm">{t('по желанию')}</span>}
                </div>
                <small className="muted">{m.version || ''} · {fmtBytes(m.size)}</small>
                {m.description && <p>{m.description}</p>}
              </div>
              <label className={'switch' + (canToggle ? '' : ' disabled')} title={canToggle ? '' : t('Обязательный мод сборки')}>
                <input type="checkbox" checked={m.enabled} disabled={!canToggle} onChange={() => toggle(m)} />
                <span />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
