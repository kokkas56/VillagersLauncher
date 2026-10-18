import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import SkinPreview from '../components/SkinPreview.jsx';
import SkinFlat from '../components/SkinFlat.jsx';
import { Empty } from '../components/ui.jsx';
import { defaultSkinDataUrl } from '../editor/templates.js';

export default function Skins({ openEditor, skin, refreshSkin, openAccounts }) {
  const { t, account, toast } = useApp();
  const [wardrobe, setWardrobe] = useState([]);
  const [ely, setEly] = useState(null);
  const [elyCape, setElyCape] = useState(null);
  const [current, setCurrent] = useState(null);
  const [fallback] = useState(() => defaultSkinDataUrl());

  const load = async () => {
    try { setWardrobe(await call('wardrobe:list')); } catch (_) {}
    try { setCurrent(await call('skin:current')); } catch (_) {}
    if (account && account.type === 'ely') {
      try { setEly(await call('skin:ely', account.name)); } catch (_) {}
      try { setElyCape(await call('skin:elyCape', account.name)); } catch (_) {}
    } else { setEly(null); setElyCape(null); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [account]);

  const shown = current || (ely ? { skin: ely.dataUrl, slim: ely.slim, cape: elyCape } : null);

  const wear = async (w) => {
    await call('skin:apply', { skin: w.skin, cape: w.cape, slim: w.slim, name: w.name });
    toast(t('Скин надет! В запущенной игре он сменится сам.'), 'ok');
    await load();
    refreshSkin();
  };
  const unwear = async () => {
    await call('skin:clear');
    toast(account && account.type === 'ely' ? t('Скин снят — в игре будет скин с Ely.by') : t('Скин снят'), 'ok');
    await load();
    refreshSkin();
  };
  // Ely.by открывается в браузере по умолчанию (там ты уже вошёл); вернулся в лаунчер — скин перечитан
  const openEly = async (url) => {
    await call('shell:open', url);
    const back = async () => { window.removeEventListener('focus', back); await load(); refreshSkin(); };
    window.addEventListener('focus', back);
  };
  const reloadAfterEly = () => openEly('https://ely.by/skins');

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="shirt" size={22} /> {t('Скины')}</h2>
        <div className="grow" />
        <button className="btn primary" onClick={() => openEditor({ name: account ? account.name : '' })}><Icon name="brush" /> {t('Новый скин')}</button>
      </div>

      <div className="skins-layout">
        <section className="card skin-stage">
          <SkinPreview skin={(shown && shown.skin) || fallback} cape={shown && shown.cape} slim={shown && shown.slim} width={300} height={420} rotate walk zoom={0.8} nameTag={account ? account.name : null} />
          <div className="skin-stage-info">
            <div className="pill-row">
              {current ? <span className="pill green"><Icon name="check" size={12} /> {t('Скин из лаунчера')}{current.name ? ': ' + current.name : ''}</span>
                : ely ? <span className="pill">Ely.by</span> : <span className="pill">{t('Скин не выбран')}</span>}
            </div>
            <div className="col-btns">
              <button className="btn" disabled={!shown} onClick={() => openEditor({ skin: shown.skin, cape: shown.cape, slim: shown.slim, name: (current && current.name) || (account && account.name) })}><Icon name="pencil" /> {t('Редактировать этот')}</button>
              {current && <button className="btn ghost" onClick={unwear}><Icon name="close" /> {t('Снять скин лаунчера')}</button>}
            </div>
          </div>
        </section>

        <div className="skins-right">
          <section className="card ely-card">
            <div className="card-head"><Icon name="globe" /><h3>Ely.by</h3></div>
            {account && account.type === 'ely' ? (
              <>
                <p className="muted">{t('Каталог Ely.by: тысячи готовых скинов. Каталог откроется в твоём браузере — выбранный там скин сразу станет твоим на Ely.by.')}</p>
                <div className="row">
                  <button className="btn" onClick={reloadAfterEly}><Icon name="link" /> {t('Открыть каталог скинов')}</button>
                  <button className="btn ghost" onClick={() => { if (account && account.profileLink) openEly(account.profileLink); else { toast(t('Чтобы открывался именно твой профиль, войди в Ely.by через браузер (Аккаунты → Ely.by)'), 'info', 7000); openEly('https://ely.by/'); } }}>{t('Мой профиль Ely.by')}</button>
                </div>
                {ely && <div className="ely-row"><img className="pix" src={ely.dataUrl} alt="" /><span className="muted">{t('Текущий скин на Ely.by')}</span>
                  <button className="btn sm" onClick={() => openEditor({ skin: ely.dataUrl, slim: ely.slim, cape: elyCape, name: account.name })}>{t('Изменить в редакторе')}</button></div>}
              </>
            ) : (
              <>
                <p className="muted">{t('Войди через Ely.by, чтобы выбирать скины из каталога. С офлайн-ником скин надевается через редактор лаунчера.')}</p>
                <button className="btn" onClick={openAccounts}><Icon name="user" /> {t('Войти через Ely.by')}</button>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head"><Icon name="layers" /><h3>{t('Гардероб')}</h3><div className="grow" /><span className="muted small">{t('в игре: клавиша K')}</span></div>
            {wardrobe.length === 0 ? (
              <Empty icon="shirt">{t('Тут будут твои скины. Нарисуй в редакторе и нажми «В гардероб» или «Надеть в игре».')}</Empty>
            ) : (
              <div className="wardrobe">
                {wardrobe.map((w) => (
                  <div key={w.id} className={'wd' + (current && current.name === w.name ? ' on' : '')}>
                    <SkinFlat skin={w.skin} slim={w.slim} scale={5} />
                    <b title={w.name}>{w.name}</b>
                    <div className="wd-btns">
                      <button className="btn sm primary" onClick={() => wear(w)}>{t('Надеть')}</button>
                      <button className="btn icon-btn sm" title={t('Редактировать')} onClick={() => openEditor({ skin: w.skin, cape: w.cape, slim: w.slim, name: w.name })}><Icon name="pencil" size={12} /></button>
                      <button className="btn icon-btn sm danger" title={t('Удалить')} onClick={async () => { await call('wardrobe:remove', w.id); load(); }}><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
