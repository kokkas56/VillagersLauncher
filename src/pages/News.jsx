import React, { useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { fmtDate } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';

function short(p) { return p.replace(/^mods\//, '').replace(/^config\//, '⚙ '); }

export default function News() {
  const { t, lang, pack, refreshPack } = useApp();
  const [open, setOpen] = useState({});
  const list = (pack && pack.latest && pack.latest.changelog) || [];
  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="news" size={22} /> {t('Новости сборки')}</h2>
        <div className="grow" />
        <button className="btn ghost" onClick={refreshPack}><Icon name="refresh" /> {t('Обновить')}</button>
      </div>
      {list.length === 0 && <Empty icon="news">{t('Новостей пока нет. Когда автор нажмёт «Залить сборку», здесь появится запись с описанием.')}</Empty>}
      <div className="timeline">
        {list.map((n, i) => (
          <article key={n.version} className={'tl-item' + (i === 0 ? ' first' : '')}>
            <div className="tl-dot"><Icon name={i === 0 ? 'star' : 'emerald'} size={12} /></div>
            <div className="card tl-card">
              <div className="tl-head">
                <span className="tl-ver">#{n.version}</span>
                <h3>{n.title}</h3>
                <div className="grow" />
                <span className="muted">{fmtDate(n.date, lang)}</span>
              </div>
              {n.text && <p className="tl-text">{n.text}</p>}
              {(n.added || n.changed || n.removed) && (
                <div className="tl-stats">
                  {n.added && n.added.length > 0 && <span className="pill green">+{n.added.length}</span>}
                  {n.changed && n.changed.length > 0 && <span className="pill gold">~{n.changed.length}</span>}
                  {n.removed && n.removed.length > 0 && <span className="pill warn">−{n.removed.length}</span>}
                  <button className="link-btn" onClick={() => setOpen({ ...open, [n.version]: !open[n.version] })}>{open[n.version] ? t('скрыть файлы') : t('какие файлы')}</button>
                </div>
              )}
              {open[n.version] && (
                <div className="tl-files">
                  {(n.added || []).map((f) => <div key={'a' + f} className="f add">+ {short(f)}</div>)}
                  {(n.changed || []).map((f) => <div key={'c' + f} className="f chg">~ {short(f)}</div>)}
                  {(n.removed || []).map((f) => <div key={'r' + f} className="f del">− {short(f)}</div>)}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
