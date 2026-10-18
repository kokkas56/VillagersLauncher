import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import Head from '../components/Head.jsx';
import { Modal } from '../components/ui.jsx';

export default function Accounts({ onClose }) {
  const { t, accounts, account, refreshAccounts, toast } = useApp();
  const [tab, setTab] = useState(accounts.length ? 'list' : 'ely');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [heads, setHeads] = useState({});

  useEffect(() => {
    accounts.forEach(async (a) => {
      if (a.type !== 'ely' || heads[a.id]) return;
      try { const s = await call('skin:ely', a.name); if (s) setHeads((h) => ({ ...h, [a.id]: s.dataUrl })); } catch (_) {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const doEly = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try {
      await call('accounts:loginEly', { login, password, totp: needTotp ? totp : undefined });
      await refreshAccounts();
      toast(t('Вход в Ely.by выполнен'), 'ok');
      setPassword(''); setTotp(''); setNeedTotp(false);
      setTab('list');
    } catch (err) {
      if (err.needTotp) { setNeedTotp(true); toast(t('Введи код двухфакторной защиты'), 'info'); }
      else toast(err.message, 'error', 7000);
    } finally { setBusy(false); }
  };

  const doOffline = async (e) => {
    e && e.preventDefault();
    try {
      await call('accounts:addOffline', nick.trim());
      await refreshAccounts();
      setNick('');
      setTab('list');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Modal title={t('Аккаунты')} onClose={onClose}>
      <div className="seg full">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>{t('Мои аккаунты')}</button>
        <button className={tab === 'ely' ? 'on' : ''} onClick={() => setTab('ely')}>Ely.by</button>
        <button className={tab === 'offline' ? 'on' : ''} onClick={() => setTab('offline')}>{t('Офлайн-ник')}</button>
      </div>

      {tab === 'list' && (
        <div className="acc-list">
          {accounts.length === 0 && <p className="muted">{t('Пока нет аккаунтов. Войди через Ely.by или просто придумай ник.')}</p>}
          {accounts.map((a) => (
            <div key={a.id} className={'acc' + (account && account.id === a.id ? ' on' : '')} onClick={async () => { await call('accounts:select', a.id); await refreshAccounts(); }}>
              <Head skin={heads[a.id]} size={38} />
              <div className="grow">
                <b>{a.name}</b>
                <small className="muted">{a.type === 'ely' ? 'Ely.by · ' + t('скины и вход на сервера') : t('Офлайн-ник')}</small>
              </div>
              {account && account.id === a.id && <span className="pill green"><Icon name="check" size={12} /> {t('выбран')}</span>}
              <button className="btn icon-btn sm danger" title={t('Удалить')} onClick={async (e) => { e.stopPropagation(); await call('accounts:remove', a.id); await refreshAccounts(); }}><Icon name="trash" size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === 'ely' && (
        <form className="form" onSubmit={doEly}>
          <p className="muted">{t('Ely.by — бесплатная система скинов. Твой скин с Ely.by будут видеть все игроки, а в нашей сборке ещё и скин из редактора лаунчера.')}</p>
          <label>{t('Ник или e-mail')}<input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus /></label>
          <label>{t('Пароль')}<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {needTotp && <label>{t('Код 2FA')}<input className="input mono" value={totp} onChange={(e) => setTotp(e.target.value)} autoFocus /></label>}
          <div className="row">
            <button className="btn primary" disabled={busy || !login || !password}>{busy ? t('Вход…') : t('Войти')}</button>
            <button type="button" className="btn ghost" onClick={() => call('shell:open', 'https://account.ely.by/register')}>{t('Регистрация на Ely.by')}</button>
          </div>
          <small className="muted">{t('Пароль не сохраняется: лаунчер хранит только зашифрованный токен входа.')}</small>
        </form>
      )}

      {tab === 'offline' && (
        <form className="form" onSubmit={doOffline}>
          <p className="muted">{t('Без регистрации. Подходит для одиночной игры и игры по сети с друзьями. Скин можно надеть через редактор лаунчера — его увидят все игроки нашей сборки.')}</p>
          <label>{t('Ник')}<input className="input" value={nick} maxLength={16} onChange={(e) => setNick(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} autoFocus /></label>
          <button className="btn primary" disabled={nick.length < 3}>{t('Добавить')}</button>
        </form>
      )}
    </Modal>
  );
}
