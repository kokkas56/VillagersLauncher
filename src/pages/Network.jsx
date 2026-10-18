import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Progress } from '../components/ui.jsx';

// Игра с друзьями: своя «локальная сеть» через лаунчер (Windows и Mac вместе, без VPN и аккаунтов) и сервер сборки.

const STATUS = {
  starting: 'Открываю комнату…', open: 'Комната открыта', offline: 'Нет связи с брокерами, пробую ещё',
  searching: 'Ищу комнату…', found: 'Комната найдена, соединяюсь…', connecting: 'Соединяюсь…',
  connected: 'Подключено', reconnecting: 'Переподключаюсь…', error: 'Не получилось'
};
const ROUTE = { direct: 'напрямую', lan: 'по локальной сети', relay: 'через ретранслятор', tcp: 'через проброс порта' };
const fmt = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ');

function RoomCard({ st, t, toast, account, openAccounts, roomId, reload }) {
  const host = st.role === 'host';
  const leave = async () => { await call('net:leave'); reload(); };
  const remove = async () => { if (roomId) await call('net:removeRoom', roomId); else await call('net:leave'); reload(); };
  const play = async () => {
    if (!account) { openAccounts && openAccounts(); return; }
    try { await call('game:play', { quickPlay: '127.0.0.1:' + st.port }); } catch (e) { toast(e.message, 'error', 8000); }
  };
  return (
    <div className="card net-card">
      <div className="card-head">
        <Icon name="globe" />
        <h3>{st.name}</h3>
        <span className={'pill sm ' + (st.status === 'connected' || st.status === 'open' ? 'green' : st.status === 'error' ? 'warn' : '')}>{t(STATUS[st.status] || st.status)}</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={leave} title={t('Сеть выключится, комната останется в списке')}>{t('Выключить')}</button>
        <button className="btn sm danger" onClick={remove} title={t('Выключить и убрать из списка')}><Icon name="trash" size={12} /></button>
      </div>
      {st.error && <p className="warn-text small">{t(st.error)}</p>}
      {st.notice && <p className="warn-text small">⚠ {t(st.notice)}</p>}
      {host ? (
        <>
          <p className="muted small">{t('Что открыто')}: <b>{st.target}</b></p>
          {st.direct ? <p className="muted small">{t('Запасной путь')}: <b>{t('порт на роутере открыт')}</b></p>
            : st.directWhy ? <p className="muted small">{t('Запасной путь (проброс порта)')}: {t(st.directWhy)}</p> : null}
          {st.mode === 'world' && <ol className="net-steps">
            <li>{t('Запусти игру и зайди в свой мир.')}</li>
            <li>{t('Esc → «Открыть для сети» → «Открыть мир».')}</li>
            <li>{t('Друзья в своём лаунчере жмут «Войти к другу» с тем же именем и паролем — и сразу «Играть».')}</li>
          </ol>}
          <div className="net-members">
            {(st.peers || []).filter((p) => p.state !== 'closed').length === 0 && <p className="muted small">{t('Пока никого. Скажи друзьям имя комнаты и пароль.')}</p>}
            {(st.peers || []).filter((p) => p.state !== 'closed').map((p) => (
              <div key={p.id} className="net-member">
                <span className={'dot ' + (p.state === 'connected' ? 'on' : 'off')} />
                <b>{p.nick}</b>
                <span className="muted small">{p.state === 'connected' ? t(ROUTE[p.route && p.route.kind] || 'подключён') + (p.route && p.route.rtt != null ? ` · ${p.route.rtt} мс` : '') : p.state === 'failed' ? t('не соединился') : t('соединяется…')}</span>
                <div className="grow" />
                {p.conns > 0 && <span className="pill sm green">{t('в игре')}</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {st.host && <p className="muted small">{t('Хозяин')}: <b>{st.host.nick}</b> · {st.host.mode === 'server' ? t('сервер сборки') : t('свой мир')}{st.host.ready === false ? ' · ' + t('мир ещё не открыт для сети') : ''}</p>}
          {st.status === 'connected' && (
            <>
              <p className="muted small">{t('Связь')}: <b>{t(ROUTE[st.route && st.route.kind] || 'есть')}</b>{st.route && st.route.rtt != null ? ` · ${t('пинг')} ${st.route.rtt} мс` : ''}</p>
              <div className="row wrap">
                <button className="btn primary" onClick={play}><Icon name="play" /> {t('Играть у друга')}</button>
                <button className="btn ghost" onClick={() => { navigator.clipboard.writeText('127.0.0.1:' + st.port); toast(t('Адрес скопирован'), 'ok'); }}><Icon name="copy" size={12} /> 127.0.0.1:{st.port}</button>
              </div>
              <small className="muted">{t('Если игра уже открыта: «Сетевая игра» — мир друга появится внизу списка сам.')}</small>
            </>
          )}
        </>
      )}
      <p className="muted small">↑ {fmt(st.stats ? st.stats.up : 0)} · ↓ {fmt(st.stats ? st.stats.down : 0)} · {t('брокеры')} {st.brokers}/{st.brokersTotal}</p>
      {st.log && st.log.length > 0 && <pre className="console-body net-log">{st.log.slice(-12).join('\n')}</pre>}
    </div>
  );
}

function ServerCard({ t, toast, settings, saveSettings, progress }) {
  const [st, setSt] = useState(null);
  const [lines, setLines] = useState([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const load = async () => { try { const s = await call('server:status'); setSt(s); setLines(s.tail || []); } catch (_) {} };
  useEffect(() => {
    load();
    const offs = [
      on('server-state', (s) => { setSt((o) => ({ ...(o || {}), ...s })); if (s.crashed) toast(s.hint || t('Сервер остановился с ошибкой — смотри консоль'), 'error', 10000); }),
      on('server-log', (l) => setLines((o) => { const n = o.concat(l); return n.length > 600 ? n.slice(-500) : n; }))
    ];
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines]);
  if (!st) return null;
  const running = st.state === 'running' || st.state === 'starting' || st.state === 'stopping';
  const start = async () => {
    setBusy(true);
    try { await call('server:start'); } catch (e) { toast(e.message, 'error', 9000); } finally { setBusy(false); load(); }
  };
  const label = { stopped: 'остановлен', installing: 'ставится', starting: 'запускается…', running: 'работает', stopping: 'останавливается…' }[st.state] || st.state;
  return (
    <Section title={t('Сервер сборки')} icon="crown" right={<span className={'pill sm ' + (st.state === 'running' ? 'green' : '')}><span className={'dot ' + (st.state === 'running' ? 'on' : 'off')} /> {t(label)}</span>}>
      <p className="muted small">{t('Отдельный сервер с модами сборки прямо на твоём компьютере: мир живёт, даже если ты вышел из игры. Друзья заходят через комнату (режим «Сервер сборки»), ты сам — кнопкой «Играть на своём сервере».')}</p>
      {progress && progress.stage === 'server' && <Progress p={progress} />}
      <label className="check-row">
        <input type="checkbox" checked={!!settings.serverEulaAccepted} onChange={(e) => saveSettings({ serverEulaAccepted: e.target.checked })} />
        <span>{t('Я принимаю лицензию Minecraft (EULA)')} — <a href="#" onClick={(e) => { e.preventDefault(); call('shell:open', 'https://aka.ms/MinecraftEULA'); }}>aka.ms/MinecraftEULA</a></span>
      </label>
      <div className="row wrap">
        {!running
          ? <button className="btn primary" disabled={busy || !settings.serverEulaAccepted} onClick={start}><Icon name="play" /> {busy ? t('Готовлю…') : t('Запустить сервер')}</button>
          : <button className="btn danger" disabled={st.state === 'stopping'} onClick={() => call('server:stop')}>{t('Остановить')}</button>}
        {st.state === 'running' && <button className="btn" onClick={() => call('game:play', { quickPlay: '127.0.0.1:' + (settings.serverPort || 25565) }).catch((e) => toast(e.message, 'error'))}><Icon name="play" size={12} /> {t('Играть на своём сервере')}</button>}
        <button className="btn ghost" onClick={() => call('server:openDir')}><Icon name="folder" size={12} /> {t('Папка сервера')}</button>
      </div>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <label className="small">{t('Порт')} <input className="input num" type="number" value={settings.serverPort || 25565} onChange={(e) => saveSettings({ serverPort: Number(e.target.value) || 25565 })} /></label>
        <label className="small">{t('Память, МБ')} <input className="input num" type="number" step="512" value={settings.serverMemoryMb || 4096} onChange={(e) => saveSettings({ serverMemoryMb: Number(e.target.value) || 4096 })} /></label>
        <label className="small">{t('Игроков')} <input className="input num" type="number" value={settings.serverMaxPlayers || 10} onChange={(e) => saveSettings({ serverMaxPlayers: Number(e.target.value) || 10 })} /></label>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">{t('Не брать на сервер (моды только для клиента)')}</summary>
        <textarea className="input mono" rows={3} value={(settings.serverExcludeMods || []).join(', ')}
          onChange={(e) => saveSettings({ serverExcludeMods: e.target.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) })} />
        <small className="muted">{t('Часть имени файла мода. Если сервер падает из-за клиентского мода — допиши его сюда.')}</small>
      </details>
      {lines.length > 0 && (
        <>
          <pre ref={logRef} className="console-body net-log server-log">{lines.slice(-300).join('\n')}</pre>
          {st.state === 'running' && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) { call('server:command', cmd); setCmd(''); } }}>
              <input className="input mono" placeholder={t('команда сервера, например: op Ник')} value={cmd} onChange={(e) => setCmd(e.target.value)} />
              <button className="btn">{t('Отправить')}</button>
            </form>
          )}
        </>
      )}
    </Section>
  );
}

export default function Network({ openAccounts }) {
  const { t, toast, settings, saveSettings, account, progress } = useApp();
  const [st, setSt] = useState({ active: false });
  const [tab, setTab] = useState('join');
  const [name, setName] = useState(settings.roomName || '');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('world');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState({ rooms: [], active: null });
  const reload = () => call('net:rooms').then((r) => r && setRooms(r)).catch(() => {});

  useEffect(() => {
    call('net:state').then((s) => s && setSt(s)).catch(() => {});
    reload();
    return on('tunnel-state', (s) => { setSt(s || { active: false }); reload(); });
  }, []);

  const go = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try { await call(tab === 'host' ? 'net:host' : 'net:join', { name, password, mode }); setPassword(''); reload(); } catch (err) { toast(err.message, 'error', 8000); } finally { setBusy(false); }
  };
  const startRoom = async (id) => { setBusy(true); try { await call('net:start', id); reload(); } catch (err) { toast(err.message, 'error', 8000); } finally { setBusy(false); } };
  const removeRoom = async (r) => { await call('net:removeRoom', r.id); reload(); toast(t('Комната удалена'), 'ok'); };
  const savedRooms = (rooms.rooms || []).filter((r) => !(st.active && rooms.active === r.id));

  const turnText = (settings.turnServers || []).map((x) => [x.urls, x.username, x.credential].filter(Boolean).join(' ')).join('\n');

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="globe" size={22} /> {t('Игра с друзьями')}</h2>
        <div className="grow" />
        <span className="pill">{t('Windows и Mac вместе · без VPN и регистрации')}</span>
      </div>

      <div className="net-grid">
        <div>
          {st.active && <RoomCard st={st} t={t} toast={toast} account={account} openAccounts={openAccounts} roomId={rooms.active} reload={reload} />}
          {savedRooms.length > 0 && (
            <Section title={t('Мои комнаты')} icon="star">
              <div className="net-members">
                {savedRooms.map((r) => (
                  <div key={r.id} className="net-member">
                    <span className="dot off" />
                    <b>{r.name}</b>
                    <span className="muted small">{r.role === 'host' ? (r.mode === 'server' ? t('моя · сервер сборки') : t('моя · мой мир')) : t('у друга')}</span>
                    <div className="grow" />
                    <button className="btn sm primary" disabled={busy} onClick={() => startRoom(r.id)}>{r.role === 'host' ? t('Включить') : t('Подключиться')}</button>
                    <button className="btn sm danger" title={t('Удалить')} onClick={() => removeRoom(r)}><Icon name="trash" size={12} /></button>
                  </div>
                ))}
              </div>
              {st.active && <small className="muted">{t('Включить другую комнату — текущая выключится.')}</small>}
            </Section>
          )}
          {!st.active && (
            <Section title={t('Комната')} icon="lock">
              <div className="seg full">
                <button className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>{t('Войти к другу')}</button>
                <button className={tab === 'host' ? 'on' : ''} onClick={() => setTab('host')}>{t('Создать комнату')}</button>
              </div>
              <form className="form" onSubmit={go}>
                <p className="muted small">{tab === 'host'
                  ? t('Придумай имя комнаты и пароль и скажи их друзьям. Лаунчер соединит вас напрямую, как в локальной сети — ничего ставить не нужно.')
                  : t('Введи имя комнаты и пароль, которые дал друг. Его мир появится у тебя в игре в «Сетевой игре».')}</p>
                <label>{t('Имя комнаты')}<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('например: деревня-кокка')} autoFocus /></label>
                <label>{t('Пароль')}<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                {tab === 'host' && (
                  <div className="seg">
                    <button type="button" className={mode === 'world' ? 'on' : ''} onClick={() => setMode('world')}>{t('Мой мир')}</button>
                    <button type="button" className={mode === 'server' ? 'on' : ''} onClick={() => setMode('server')}>{t('Сервер сборки')}</button>
                  </div>
                )}
                {tab === 'host' && <small className="muted">{mode === 'world' ? t('Ты играешь в своём мире и открываешь его для сети — друзья заходят к тебе.') : t('Друзья заходят на сервер сборки, запущенный ниже. Мир живёт без тебя.')}</small>}
                <button className="btn primary" disabled={busy || !name.trim() || !password}>{tab === 'host' ? t('Открыть комнату') : t('Войти')}</button>
                <small className="muted">{t('Комната запомнится — потом включается одной кнопкой.')}</small>
              </form>
            </Section>
          )}

          <Section title={t('Если не соединяется')} icon="gear">
            <p className="muted small">{t('Обычно связь идёт напрямую. Если у кого-то очень строгий интернет (мобильный, общежитие), можно добавить TURN-сервер — по одному в строке: адрес логин пароль.')}</p>
            <textarea className="input mono" rows={2} defaultValue={turnText} placeholder="turn:example.com:3478 user pass"
              onBlur={(e) => saveSettings({ turnServers: e.target.value.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p[0]).map(([urls, username, credential]) => ({ urls, username, credential })) })} />
            <details>
              <summary className="small muted">{t('Брокеры для поиска комнат')}</summary>
              <textarea className="input mono" rows={3} defaultValue={(settings.tunnelBrokers || []).join('\n')}
                onBlur={(e) => saveSettings({ tunnelBrokers: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </details>
          </Section>
        </div>
        <div>
          <ServerCard t={t} toast={toast} settings={settings} saveSettings={saveSettings} progress={progress} />
        </div>
      </div>
    </div>
  );
}
