import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';
import { call as call2, on } from '../lib/api.js';
import { joinByKey } from '../lib/joinServer.js';

// Сервера игроков из каталога автора: описание, кто в сети, вход по кнопке (через туннель лаунчера)
function Catalog({ t, toast, account, busy }) {
  const [list, setList] = useState(null);
  const [presence, setPresence] = useState({});
  const [step, setStep] = useState({});
  const [pw, setPw] = useState({});
  useEffect(() => {
    let off = () => {};
    const load = () => call2('catalog:list').then((r) => { if (r) { setList(r.servers); setPresence(r.presence || {}); } }).catch(() => setList([]));
    load();
    off = on('servers-presence', (p) => setPresence({ ...(p || {}) }));
    const id = setInterval(load, 5 * 60e3);
    return () => { off(); clearInterval(id); };
  }, []);
  if (!list || list.length === 0) return null;
  const online = (s) => { const p = presence[s.id]; return p && p.online && Date.now() - p.at < 100e3 ? p : null; };
  const sorted = [...list].sort((a, b) => (b.ad - a.ad) || (!!online(b) - !!online(a)) || (a.order - b.order));
  const join = async (s) => {
    if (!account) { toast(t('Сначала выбери аккаунт'), 'warn'); return; }
    const k = await call2('hosting:parseKey', s.key).catch(() => null);
    if (k && k.password && pw[s.id] === undefined) { setPw({ ...pw, [s.id]: '' }); return; }
    if (k && k.password && !pw[s.id]) { toast(t('Введи пароль сервера'), 'warn'); return; }
    setStep({ ...step, [s.id]: t('Ищу сервер…') });
    try { await joinByKey(s.key, pw[s.id] || '', (x) => setStep((o) => ({ ...o, [s.id]: t(x) }))); }
    catch (e) { toast(e.message, 'error', 12000); }
    finally { setStep((o) => ({ ...o, [s.id]: null })); }
  };
  return (
    <div className="servers catalog">
      {sorted.map((s) => {
        const on_ = online(s);
        return (
          <div key={s.id} className={'server card catalog-card' + (s.ad ? ' ad' : '')}>
            {s.image ? <img className="catalog-img" src={s.image} alt="" /> : <div className="server-icon"><Icon name="globe" size={26} /></div>}
            <div className="grow">
              <div className="server-title"><b>{s.name}</b>{s.ad && <span className="pill gold sm">{t('Реклама')}</span>}{(s.tags || []).map((x) => <span key={x} className="pill sm">{x}</span>)}</div>
              {s.owner && <small className="muted">{t('Хозяин')}: {s.owner}</small>}
              {s.desc && <p className="motd catalog-desc">{s.desc}</p>}
              {pw[s.id] !== undefined && (
                <input className="input" type="password" placeholder={t('Пароль сервера')} value={pw[s.id]} onChange={(e) => setPw({ ...pw, [s.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && join(s)} autoFocus />
              )}
            </div>
            <div className="server-status">
              {on_ ? <span className="pill green"><span className="dot on" /> {on_.players}/{on_.max}</span> : <span className="pill"><span className="dot off" /> {t('не в сети')}</span>}
              {!on_ && <small className="muted">{t('откроется, когда хозяин включит')}</small>}
            </div>
            <button className="btn primary" disabled={busy || !on_ || !!step[s.id]} onClick={() => join(s)}><Icon name="play" size={14} /> {step[s.id] || t('Зайти')}</button>
          </div>
        );
      })}
    </div>
  );
}

export default function Servers() {
  const { t, settings, saveSettings, pack, gameState, progress, toast, account } = useApp();
  const [status, setStatus] = useState({});
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const fromPack = (pack && pack.latest && pack.latest.servers) || [];
  const mine = settings.servers || [];
  const all = [...fromPack.map((s) => ({ ...s, pack: true })), ...mine];
  const busy = !!progress || gameState.state === 'running' || gameState.state === 'starting';

  const pingAll = () => {
    all.forEach(async (s) => {
      setStatus((st) => ({ ...st, [s.address]: { loading: true } }));
      const r = await call('servers:ping', s.address).catch(() => ({ online: false }));
      setStatus((st) => ({ ...st, [s.address]: r }));
    });
  };
  useEffect(() => { pingAll(); const id = setInterval(pingAll, 30000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [settings.servers, pack]);

  const add = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    await saveSettings({ servers: [...mine, { name: name.trim() || address.trim(), address: address.trim() }] });
    setName(''); setAddress('');
  };
  const remove = (s) => saveSettings({ servers: mine.filter((x) => x.address !== s.address) });
  const join = async (s) => {
    if (!account) { toast(t('Сначала выбери аккаунт'), 'warn'); return; }
    try { await call('game:play', { quickPlay: s.address }); } catch (err) { toast(err.message, 'error', 7000); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="globe" size={22} /> {t('Сервера и друзья')}</h2>
        <div className="grow" />
        <button className="btn ghost" onClick={pingAll}><Icon name="refresh" /> {t('Обновить')}</button>
      </div>

      <Catalog t={t} toast={toast} account={account} busy={busy} />

      <form className="card add-server" onSubmit={add}>
        <input className="input" placeholder={t('Название (необязательно)')} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input grow" placeholder={t('Адрес: example.e4mc.link, 26.12.34.56:25565 …')} value={address} onChange={(e) => setAddress(e.target.value)} />
        <button className="btn primary"><Icon name="plus" size={14} /> {t('Добавить')}</button>
      </form>

      {all.length === 0 && <Empty icon="globe">{t('Добавь адрес, который дал друг: e4mc-ссылку или IP из Radmin VPN. Лаунчер покажет, кто онлайн, и зайдёт прямо на сервер.')}</Empty>}
      <div className="servers">
        {all.map((s) => {
          const st = status[s.address] || {};
          return (
            <div key={s.address} className="server card">
              <div className="server-icon">{st.favicon ? <img src={st.favicon} alt="" /> : <Icon name="globe" size={26} />}</div>
              <div className="grow">
                <div className="server-title"><b>{s.name || s.address}</b>{s.pack && <span className="pill gold sm">{t('от автора')}</span>}</div>
                <small className="muted">{s.address}</small>
                {st.online && st.motd && <p className="motd">{st.motd}</p>}
                {st.online && st.players && st.players.sample && st.players.sample.length > 0 && (
                  <div className="players">{st.players.sample.map((p) => <span key={p} className="pill sm"><Icon name="user" size={10} /> {p}</span>)}</div>
                )}
              </div>
              <div className="server-status">
                {st.loading ? <span className="muted">…</span> : st.online ? (
                  <>
                    <span className="pill green"><span className="dot on" /> {st.players ? `${st.players.online}/${st.players.max}` : t('онлайн')}</span>
                    <small className="muted">{st.ping} ms · {st.version}</small>
                  </>
                ) : <span className="pill"><span className="dot off" /> {t('не в сети')}</span>}
              </div>
              <button className="btn primary" disabled={busy || !st.online} onClick={() => join(s)}><Icon name="play" size={14} /> {t('Зайти')}</button>
              {!s.pack && <button className="btn icon-btn ghost danger" onClick={() => remove(s)}><Icon name="trash" size={14} /></button>}
            </div>
          );
        })}
      </div>

      <section className="card tips">
        <div className="card-head"><Icon name="info" /><h3>{t('Как играть вместе')}</h3></div>
        <ol>
          <li>{t('Хост запускает мир и в игре нажимает «Открыть для сети». Если стоит мод e4mc — в чате появится адрес вида xxx.e4mc.link: его и добавляют друзья.')}</li>
          <li>{t('Через Radmin VPN: все в одной сети Radmin, адрес — IP хоста из Radmin и порт из чата игры (например 26.12.34.56:51234).')}</li>
          <li>{t('Скины из редактора лаунчера видны всем, у кого стоит сборка (мод SkinKokk).')}</li>
        </ol>
      </section>
    </div>
  );
}
