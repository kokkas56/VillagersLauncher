import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Progress, Toggle, Empty } from '../components/ui.jsx';

function NetworkCard({ net, st, owned, onLeave, onDelete, t, toast }) {
  const [members, setMembers] = useState(null);
  const local = (st.networks || []).find((n) => n.id === net.networkId || n.nwid === net.networkId);
  const status = local ? local.status : 'NOT_JOINED';
  const ips = (local && local.assignedAddresses || []).map((a) => a.split('/')[0]);

  const load = async () => { try { setMembers(await call('net:members', net.networkId)); } catch (_) { setMembers(null); } };
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [net.networkId]);

  const statusText = {
    OK: t('Подключено'), REQUESTING_CONFIGURATION: t('Подключаюсь…'), ACCESS_DENIED: t('Ждёт одобрения автора сети'),
    NOT_FOUND: t('Сеть не найдена'), PORT_ERROR: t('Ошибка порта'), NOT_JOINED: t('Не подключено')
  }[status] || status;

  const pending = (members || []).filter((m) => !m.authorized);
  const approved = (members || []).filter((m) => m.authorized);

  return (
    <div className="card net-card">
      <div className="card-head">
        <Icon name="link" />
        <h3>{net.name}</h3>
        <span className={'pill sm ' + (status === 'OK' ? 'green' : status === 'ACCESS_DENIED' ? 'warn' : '')}>{statusText}</span>
        <div className="grow" />
        {owned ? <button className="btn sm danger" onClick={() => onDelete(net)}><Icon name="trash" size={12} /> {t('Удалить сеть')}</button>
          : <button className="btn sm ghost" onClick={() => onLeave(net)}>{t('Выйти')}</button>}
      </div>
      {ips.length > 0 && <p className="muted small">{t('Мой адрес в сети')}: <b className="mono">{ips.join(', ')}</b></p>}
      {owned && pending.length > 0 && (
        <div className="net-requests">
          <b>{t('Заявки')}</b>
          {pending.map((m) => (
            <div key={m.nodeId} className="net-member req">
              <span className="dot off" />
              <span className="grow">{m.name} <small className="muted mono">{m.nodeId}</small></span>
              <button className="btn sm primary" onClick={async () => { await call('net:authorize', { networkId: net.networkId, nodeId: m.nodeId, allow: true }); toast(t('Пущен:') + ' ' + m.name, 'ok'); load(); }}>{t('Пустить')}</button>
              <button className="btn sm danger" onClick={async () => { await call('net:authorize', { networkId: net.networkId, nodeId: m.nodeId, allow: false }); load(); }}>{t('Отклонить')}</button>
            </div>
          ))}
        </div>
      )}
      {members && (
        <div className="net-members">
          {approved.map((m) => (
            <div key={m.nodeId} className="net-member">
              <span className={'dot ' + (m.online ? 'on' : 'off')} />
              <span className="grow">{m.name}</span>
              <span className="mono small muted">{m.ips.join(', ')}</span>
            </div>
          ))}
          {approved.length === 0 && <span className="muted small">{t('Пока никого')}</span>}
        </div>
      )}
    </div>
  );
}

export default function Network() {
  const { t, settings, progress, toast, account } = useApp();
  const [st, setSt] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [cName, setCName] = useState('');
  const [cPass, setCPass] = useState('');
  const [cAuto, setCAuto] = useState(false);
  const [apiToken, setApiToken] = useState('');

  const load = async () => { try { setSt(await call('net:status')); } catch (e) { toast(e.message, 'error'); } };
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); /* eslint-disable-next-line */ }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok, 'ok', 6000); await load(); } catch (e) { toast(e.message, 'error', 9000); } finally { setBusy(false); }
  };

  if (!st) return <div className="page"><div className="page-head"><h2><Icon name="link" size={22} /> {t('Сети')}</h2></div><Progress p={{ text: t('Проверяю ZeroTier…'), indeterminate: true }} /></div>;

  const owned = new Set((st.owned || []).map((n) => n.networkId));
  const all = [...(st.owned || []).filter((o) => !(st.joined || []).some((j) => j.networkId === o.networkId)), ...(st.joined || [])];

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="link" size={22} /> {t('Сети для игры с друзьями')}</h2>
        <div className="grow" />
        <span className={'pill ' + (st.running ? 'green' : '')}><span className={'dot ' + (st.running ? 'on' : 'off')} /> ZeroTier {st.running ? (st.address || '') : t('не запущен')}</span>
      </div>
      {progress && progress.stage === 'net' && <Progress p={progress} />}

      <div className="net-grid">
        <div>
          <Section title={t('Подключиться к сети')} icon="plus">
            <p className="muted small">{t('Как в Radmin: введи имя сети и пароль, которые дал друг. Лаунчер сам поставит ZeroTier и откроет игру в брандмауэре — Windows один раз спросит права администратора.')}</p>
            <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => call('net:join', { name, password }), t('Готово! Если сеть с одобрением — дождись, пока автор пустит.')); }}>
              <input className="input" placeholder={t('Имя сети')} value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" type="password" placeholder={t('Пароль')} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn primary" disabled={busy || !name || !password || !account}>{busy ? t('Подключаю…') : t('Подключиться')}</button>
              {!account && <small className="muted">{t('Сначала выбери аккаунт — ник увидит автор сети')}</small>}
            </form>
          </Section>

          {all.length === 0 && <Empty icon="link">{t('Ты пока не в сети. Подключись по имени и паролю или создай свою.')}</Empty>}
          {all.map((n) => (
            <NetworkCard key={n.networkId} net={n} st={st} owned={owned.has(n.networkId)} t={t} toast={toast}
              onLeave={(net) => run(() => call('net:leave', net.networkId), t('Вышел из сети'))}
              onDelete={(net) => { if (window.confirm(t('Удалить сеть') + ' «' + net.name + '»?')) run(() => call('net:delete', net.networkId), t('Сеть удалена')); }} />
          ))}
        </div>

        <div>
          <Section title={t('Как играть')} icon="info">
            <ol className="net-steps">
              <li>{t('Все подключаются к одной сети здесь.')}</li>
              <li>{t('Хост заходит в мир → Esc → «Открыть для сети».')}</li>
              <li>{t('У друзей мир появится в «Сетевая игра» внизу списка. Мод NetKokk ищет миры сразу через все сети: ZeroTier, Radmin, Hamachi и любые VPN.')}</li>
              <li>{t('Если мир не виден — хосту в чат придут адреса, их можно вставить в «Прямое подключение».')}</li>
            </ol>
            <button className="btn sm" disabled={busy} onClick={() => run(() => call('net:setup', { installZt: false, firewall: true }), t('Java открыта в брандмауэре'))}><Icon name="java" size={12} /> {t('Открыть Java в брандмауэре')}</button>
            <p className="muted small">{t('Помогает, если играешь через Radmin или другой VPN и друзья не могут подключиться.')}</p>
          </Section>

          {settings.authorMode && (
            <Section title={t('Мои сети')} icon="crown">
              {!st.hasApiToken ? (
                <div className="form">
                  <p className="muted small">{t('Нужен API-токен ZeroTier (бесплатно): my.zerotier.com → Account → API Access Tokens → New Token. Лучше заведи для игры отдельный аккаунт ZeroTier: токен в зашифрованном виде получают друзья, знающие пароль сети.')}</p>
                  <button className="btn ghost sm" type="button" onClick={() => call('shell:open', 'https://my.zerotier.com/account')}><Icon name="link" size={12} /> my.zerotier.com</button>
                  <input className="input mono" type="password" placeholder={t('API-токен ZeroTier')} value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
                  <button className="btn primary" disabled={busy || !apiToken} onClick={() => run(async () => { await call('net:setApiToken', apiToken.trim()); setApiToken(''); }, t('Токен ZeroTier сохранён'))}>{t('Проверить и сохранить')}</button>
                </div>
              ) : (
                <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('net:create', { name: cName, password: cPass, autoApprove: cAuto }); setCName(''); setCPass(''); }, t('Сеть создана — скажи друзьям имя и пароль')); }}>
                  <input className="input" placeholder={t('Имя новой сети')} value={cName} onChange={(e) => setCName(e.target.value)} />
                  <input className="input" type="password" placeholder={t('Пароль сети')} value={cPass} onChange={(e) => setCPass(e.target.value)} />
                  <Toggle checked={cAuto} onChange={setCAuto} label={t('Пускать сразу по паролю')} hint={t('Иначе каждого нужно одобрить кнопкой «Пустить»')} />
                  <button className="btn primary" disabled={busy || cName.length < 3 || cPass.length < 4}>{t('Создать сеть')}</button>
                  <button type="button" className="link-btn small" onClick={() => run(() => call('net:setApiToken', null))}>{t('Сменить токен ZeroTier')}</button>
                </form>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
