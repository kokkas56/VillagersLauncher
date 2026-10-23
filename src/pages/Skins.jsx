import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import SkinPreview from '../components/SkinPreview.jsx';
import SkinFlat from '../components/SkinFlat.jsx';
import { Empty } from '../components/ui.jsx';
import { defaultSkinDataUrl } from '../editor/templates.js';
import { REWARDS } from '../games/rewards.js';
import { capeDataUrl } from '../games/capes.js';
import CharacterEditor from '../components/CharacterEditor.jsx';

export default function Skins({ openEditor, skin, refreshSkin, openAccounts }) {
  const { t, account, toast } = useApp();
  const [wardrobe, setWardrobe] = useState([]);
  const [ely, setEly] = useState(null);
  const [elyCape, setElyCape] = useState(null);
  const [current, setCurrent] = useState(null);
  const [fallback] = useState(() => defaultSkinDataUrl());
  const [capes, setCapes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [previewCape, setPreviewCape] = useState(undefined);
  const [character, setCharacter] = useState(null); // персонаж SkinKokk — для превью на вкладке «Скины»
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('skins.tab') || 'skins'; } catch (_) { return 'skins'; } });
  const pickTab = (x) => { setTab(x); try { localStorage.setItem('skins.tab', x); } catch (_) {} if (x === 'skins') call('character:get').then((r) => setCharacter(r && r.char)).catch(() => {}); };

  const load = async () => {
    try { setWardrobe(await call('wardrobe:list')); } catch (_) {}
    try { setCurrent(await call('skin:current')); } catch (_) {}
    try { setCapes(await call('wardrobe:capes')); } catch (_) {}
    try { setProfile(await call('games:profile')); } catch (_) {}
    try { const r = await call('character:get'); setCharacter(r && r.char); } catch (_) {}
    if (account && account.type === 'ely') {
      try { setEly(await call('skin:ely', account.name)); } catch (_) {}
      try { setElyCape(await call('skin:elyCape', account.name)); } catch (_) {}
    } else { setEly(null); setElyCape(null); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [account]);

  const shown0 = current || (ely ? { skin: ely.dataUrl, slim: ely.slim, cape: elyCape } : null);
  const shown = shown0 && previewCape !== undefined ? { ...shown0, cape: previewCape } : shown0;

  // все плащи: награды мини-игр, свои (загруженные), из скинов гардероба, с Ely.by
  const got = (profile && profile.rewards) || {};
  const allCapes = [
    ...REWARDS.filter((r) => r.kind === 'cape' && got[r.id]).map((r) => ({ key: 'r:' + r.cape, name: r.name, cape: capeDataUrl(r.cape), reward: r })),
    ...capes.map((c) => ({ key: 'c:' + c.id, name: c.name, cape: c.cape, own: c.id })),
    ...wardrobe.filter((w) => w.cape).map((w) => ({ key: 'w:' + w.id, name: t('из скина') + ' ' + w.name, cape: w.cape })),
    ...(elyCape ? [{ key: 'ely', name: 'Ely.by', cape: elyCape }] : [])
  ].filter((c, i, a) => c.cape && a.findIndex((x) => x.cape === c.cape) === i);
  const curCape = current && current.cape;
  const wearCape = async (c) => {
    if (c && c.reward) await call('games:equip', { kind: 'cape', value: c.reward.cape, cape: c.cape });
    else { await call('wardrobe:wearCape', c ? c.cape : null); if (profile && profile.equip && profile.equip.cape) await call('games:equip', { kind: 'cape', value: null }); }
    toast(c ? t('Плащ надет — в игре он сменится сам') : t('Плащ снят'), 'ok');
    setPreviewCape(undefined);
    await load(); refreshSkin();
  };
  const uploadCape = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = async () => {
        if (!(img.width === img.height * 2 && img.width >= 64 && img.width <= 1024) && !(img.width === 22 && img.height === 17)) { toast(t('Плащ должен быть PNG 64×32 (или 128×64, 256×128 …)'), 'error', 7000); return; }
        try { await call('wardrobe:saveCape', { name: f.name.replace(/\.png$/i, ''), cape: r.result }); toast(t('Плащ добавлен'), 'ok'); load(); } catch (er) { toast(er.message, 'error'); }
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };

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
        <div className="seg ch-tabs">
          <button type="button" className={tab === 'skins' ? 'on' : ''} onClick={() => pickTab('skins')}><Icon name="shirt" size={12} /> {t('Скины')}</button>
          <button type="button" className={tab === 'character' ? 'on' : ''} onClick={() => pickTab('character')} title={t('Уши, хвост, причёска, одежда, телосложение — видны всем в игре (мод SkinKokk)')}><Icon name="user" size={12} /> {t('Персонаж')}</button>
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={() => openEditor({ name: account ? account.name : '' })}><Icon name="brush" /> {t('Новый скин')}</button>
      </div>

      {tab === 'character' ? (
        <CharacterEditor skin={shown && shown.skin} slim={shown && shown.slim} fallback={fallback} account={account} />
      ) : (
      <div className="skins-layout">
        <section className="card skin-stage">
          <SkinPreview skin={(shown && shown.skin) || fallback} cape={shown && shown.cape} slim={character && character.on && character.arms !== 'auto' ? character.arms === 'slim' : shown && shown.slim} width={300} height={420} rotate walk zoom={0.8} nameTag={account ? account.name : null} character={character && character.on ? character : null} />
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
          <section className="card">
            <div className="card-head"><Icon name="cape" /><h3>{t('Плащи')}</h3><div className="grow" />
              <label className="btn sm ghost"><Icon name="upload" size={12} /> {t('Загрузить PNG')}<input type="file" accept="image/png" hidden onChange={uploadCape} /></label>
            </div>
            {allCapes.length === 0 ? (
              <Empty icon="cape">{t('Плащи из наград мини-игр, свои PNG и плащи из скинов появятся здесь. Наведи — увидишь на модели, «Надеть» — и он в игре.')}</Empty>
            ) : (
              <div className="capes">
                <div className={'cape-item' + (!curCape ? ' on' : '')} onMouseEnter={() => setPreviewCape(null)} onMouseLeave={() => setPreviewCape(undefined)}>
                  <span className="cape-big none">∅</span><b>{t('Без плаща')}</b>
                  <button className="btn sm" disabled={!curCape} onClick={() => wearCape(null)}>{t('Снять')}</button>
                </div>
                {allCapes.map((c) => (
                  <div key={c.key} className={'cape-item' + (curCape === c.cape ? ' on' : '') + (c.reward ? ' reward' : '')} onMouseEnter={() => setPreviewCape(c.cape)} onMouseLeave={() => setPreviewCape(undefined)}>
                    <span className="cape-big" style={{ backgroundImage: `url(${c.cape})` }} />
                    <b title={c.name}>{c.reward ? '★ ' : ''}{c.name}</b>
                    <div className="row">
                      <button className="btn sm primary" disabled={curCape === c.cape} onClick={() => wearCape(c)}>{curCape === c.cape ? t('Надет') : t('Надеть')}</button>
                      {c.own && <button className="btn icon-btn sm danger" title={t('Удалить')} onClick={async () => { await call('wardrobe:removeCape', c.own); load(); }}><Icon name="trash" size={12} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      )}
    </div>
  );
}
