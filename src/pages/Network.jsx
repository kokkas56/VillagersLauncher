import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Progress } from '../components/ui.jsx';
import { joinByKey } from '../lib/joinServer.js';
import RadminInfo from '../components/RadminInfo.jsx';

// Игра с друзьями: своя «локальная сеть» через лаунчер (Windows и Mac вместе, без VPN и аккаунтов) и сервер сборки.

const STATUS = {
  starting: 'Открываю комнату…', open: 'Комната открыта', offline: 'Нет связи с брокерами, пробую ещё',
  searching: 'Ищу комнату…', found: 'Комната найдена, соединяюсь…', connecting: 'Соединяюсь…',
  connected: 'Подключено', reconnecting: 'Переподключаюсь…', error: 'Не получилось'
};
const ROUTE = { direct: 'напрямую', lan: 'по локальной сети', relay: 'через ретранслятор', tcp: 'через проброс порта' };
const fmt = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ');

// поле пароля с «глазом»
function PasswordInput({ value, onChange, t, autoFocus, onCopy, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="row pw-row">
      <input className="input" type={show ? 'text' : 'password'} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
      <button type="button" className="btn sm ghost icon-btn" title={show ? t('Скрыть пароль') : t('Показать пароль')} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={14} /></button>
      {onCopy && <button type="button" className="btn sm ghost icon-btn" title={t('Скопировать пароль')} disabled={!value} onClick={onCopy}><Icon name="copy" size={14} /></button>}
    </div>
  );
}

// имя и пароль комнаты: посмотреть, скопировать для друзей, изменить
function RoomSecrets({ roomId, room, t, toast, reload, compact }) {
  const [pw, setPw] = useState(null);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(room ? room.name : '');
  const [npw, setNpw] = useState('');
  const [mode, setMode] = useState(room ? room.mode : 'world');
  useEffect(() => { if (roomId) call('net:roomPassword', roomId).then(setPw).catch(() => {}); setName(room ? room.name : ''); setMode(room ? room.mode : 'world'); }, [roomId]);
  if (!roomId || !room) return null;
  const copy = () => { navigator.clipboard.writeText(`${t('Комната')}: ${room.name}\n${t('Пароль')}: ${pw}`); toast(t('Имя и пароль скопированы — отправь другу'), 'ok'); };
  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await call('net:updateRoom', { id: roomId, name, password: npw, mode });
      toast(r.restarted ? t('Сохранено, комната перезапущена с новыми данными') : t('Сохранено'), 'ok');
      setEdit(false); setNpw(''); reload();
    } catch (err) { toast(err.message, 'error', 7000); }
  };
  return (
    <div className={'room-secrets' + (compact ? ' compact' : '')}>
      {!edit ? (
        <div className="row wrap">
          <span className="muted small">{t('Пароль')}: <b className="mono">{pw == null ? '…' : show ? pw : '•'.repeat(Math.max(4, pw.length))}</b></span>
          <button className="btn sm ghost icon-btn" title={show ? t('Скрыть пароль') : t('Показать пароль')} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={12} /></button>
          <button className="btn sm ghost" onClick={copy}><Icon name="copy" size={12} /> {t('Скопировать для друга')}</button>
          <button className="btn sm ghost" onClick={() => setEdit(true)}><Icon name="pencil" size={12} /> {t('Изменить')}</button>
        </div>
      ) : (
        <form className="form" onSubmit={save}>
          <label>{t('Имя комнаты')}<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>{t('Новый пароль')} <small className="muted">({t('пусто — оставить прежний')})</small><PasswordInput value={npw} onChange={setNpw} t={t} /></label>
          {room.role === 'host' && (
            <div className="seg">
              <button type="button" className={mode === 'world' ? 'on' : ''} onClick={() => setMode('world')}>{t('Мой мир')}</button>
              <button type="button" className={mode === 'server' ? 'on' : ''} onClick={() => setMode('server')}>{t('Сервер сборки')}</button>
            </div>
          )}
          {room.role === 'host' && <small className="muted">{t('После смены имени или пароля скажи друзьям новые.')}</small>}
          <div className="row">
            <button className="btn sm primary">{t('Сохранить')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setEdit(false)}>{t('Отмена')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function RoomCard({ st, t, toast, account, openAccounts, roomId, room, reload }) {
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
        <h3>{String(st.name || '').startsWith('vks-') ? (host ? t('Мой сервер · вход по ключу') : t('Сервер по ключу')) : st.name}</h3>
        <span className={'pill sm ' + (st.status === 'connected' || st.status === 'open' ? 'green' : st.status === 'error' ? 'warn' : '')}>{t(STATUS[st.status] || st.status)}</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={leave} title={t('Сеть выключится, комната останется в списке')}>{t('Выключить')}</button>
        <button className="btn sm danger" onClick={remove} title={t('Выключить и убрать из списка')}><Icon name="trash" size={12} /></button>
      </div>
      {st.error && <p className="warn-text small">{t(st.error)}</p>}
      {st.notice && <p className="warn-text small">⚠ {t(st.notice)}</p>}
      <RoomSecrets roomId={roomId} room={room} t={t} toast={toast} reload={reload} />
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

// какие моды сборки на сервере: результат последней сборки + ручные списки «всегда / никогда на сервер»
function ServerMods({ t, st, settings, saveSettings, running, busy, onSync }) {
  const m = st.mods;
  const list = (v) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const [always, setAlways] = useState((settings.serverModsAlways || []).join(', '));
  const [never, setNever] = useState((settings.serverModsNever || []).join(', '));
  return (
    <details className="srv-mods">
      <summary className="small"><b>{t('Моды сервера')}</b> <span className="muted">{m ? `— ${m.mods} ${t('из')} ${m.total} ${t('модов сборки')}${m.skipped.length ? ', ' + t('только для клиента') + ': ' + m.skipped.length : ''}` : '— ' + t('соберутся при первом запуске')}</span></summary>
      <p className="muted small">{t('Лаунчер сам переносит моды сборки на сервер при каждом запуске: новые добавляет, старые убирает. Моды только для клиента (графика, интерфейс, звуки) определяются по их описанию (neoforge.mods.toml) и на сервер не идут. Мир сервера не трогается.')}</p>
      {m && m.skipped.length > 0 && (
        <div className="srv-skip">
          <span className="small">{t('Не на сервер (только клиент)')}:</span>
          {m.skipped.map((x) => <div key={x.file} className="small mono" title={x.reason}>− {x.file} <span className="muted">· {(x.ids || []).join(', ')} · {t(x.reason)}</span></div>)}
        </div>
      )}
      {m && m.kept && m.kept.length > 0 && (
        <div className="srv-skip">
          <span className="small">{t('Похожи на клиентские, но нужны серверу')}:</span>
          {m.kept.map((x) => <div key={x.file} className="small mono">+ {x.file} <span className="muted">· {t(x.reason)}</span></div>)}
        </div>
      )}
      {m && m.removed && m.removed.length > 0 && <small className="muted">{t('Убрано с сервера в прошлый раз')}: {m.removed.join(', ')} {t('(положенные вручную — в папке server/mods-removed)')}</small>}
      {m && m.own && m.own.length > 0 && <small className="muted">{t('Свои моды сервера (не из сборки, не трогаю)')}: {m.own.join(', ')}</small>}
      <div className="row wrap">
        <label className="small grow">{t('Всегда на сервер')} <small className="muted">{t('(id мода или часть имени файла, через запятую)')}</small>
          <input className="input mono" value={always} placeholder="emi, wthit" onChange={(e) => setAlways(e.target.value)} onBlur={() => saveSettings({ serverModsAlways: list(always) })} />
        </label>
        <label className="small grow">{t('Никогда на сервер')}
          <input className="input mono" value={never} placeholder="kokkhud, sodium" onChange={(e) => setNever(e.target.value)} onBlur={() => saveSettings({ serverModsNever: list(never) })} />
        </label>
      </div>
      <div className="row wrap">
        <button className="btn sm" disabled={running || busy} onClick={async () => { await saveSettings({ serverModsAlways: list(always), serverModsNever: list(never) }); onSync(); }}><Icon name="refresh" size={12} /> {t('Пересобрать моды сервера')}</button>
        {running && <small className="muted">{t('Пока сервер работает, файлы модов заняты — изменения применятся при следующем запуске.')}</small>}
      </div>
    </details>
  );
}

const GM = [['survival', 'Выживание'], ['creative', 'Творческий'], ['adventure', 'Приключение'], ['spectator', 'Наблюдатель']];
const DIFF = [['peaceful', 'Мирная'], ['easy', 'Лёгкая'], ['normal', 'Нормальная'], ['hard', 'Сложная']];
const LT = [['minecraft:normal', 'Обычный'], ['minecraft:large_biomes', 'Большие биомы'], ['minecraft:amplified', 'Расширенный (горы)'], ['minecraft:flat', 'Плоский']];
const OPL = [[1, '1 — проходить сквозь защиту спавна'], [2, '2 — команды-читы: /gamemode, /give, /tp, /time'], [3, '3 — плюс управление игроками: /kick, /ban, /op'], [4, '4 — всё, включая /stop и /save-all']];

// настройки игры на сервере: читы и операторы, режим, сложность, PvP, белый список… (server.properties / ops.json / whitelist.json)
function ServerGame({ t, toast, hp, setHp, running }) {
  const [g, setG] = useState(() => ({ ...hp.game, ops: (hp.game.ops || []).join(', '), whitelistNames: (hp.game.whitelistNames || []).join(', ') }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setG((o) => ({ ...o, [k]: v }));
  const chk = (k) => (e) => set(k, e.target.checked);
  const val = (k) => (e) => set(k, e.target.value);
  const live = <small className="muted"> · {t('сразу')}</small>;
  const later = <small className="muted"> · {t('после перезапуска')}</small>;
  const save = async () => {
    setSaving(true);
    try {
      const r = await call('hosting:game', { ...g, viewDistance: Number(g.viewDistance), simulationDistance: Number(g.simulationDistance), spawnProtection: Number(g.spawnProtection), opLevel: Number(g.opLevel) });
      setHp((o) => ({ ...o, game: r.game }));
      if (!running) toast(t('Настройки сервера сохранены — применятся при запуске'), 'ok');
      else {
        const parts = [];
        if (r.commands.length) parts.push(t('применено сразу') + ': ' + r.commands.length);
        if (r.restart.length) parts.push(t('после перезапуска сервера') + ': ' + r.restart.join(', '));
        toast(t('Сохранено') + (parts.length ? '. ' + parts.join('; ') : ''), r.restart.length ? 'warn' : 'ok', 10000);
      }
    } catch (e) { toast(e.message, 'error', 8000); } finally { setSaving(false); }
  };
  return (
    <details className="srv-game">
      <summary className="small"><b>{t('Настройки игры на сервере')}</b> <span className="muted">— {t('читы, режим, сложность, PvP, белый список')}</span></summary>
      <div className="form srv-form">
        <b className="small">{t('Читы и команды')}</b>
        <label className="check-row"><input type="checkbox" checked={!!g.opHost} onChange={chk('opHost')} /><span>{t('Сделать меня оператором')}{g.host ? ` (${g.host})` : ''}{live}<br /><small className="muted">{t('Ник берётся из выбранного аккаунта лаунчера.')}</small></span></label>
        <label className="small">{t('Операторы (ники через запятую)')}{live}<input className="input mono" value={g.ops} placeholder="Ник1, Ник2" onChange={val('ops')} /></label>
        <label className="small">{t('Что можно операторам')}{later}
          <select className="input" value={g.opLevel} onChange={val('opLevel')}>{OPL.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
        </label>
        <label className="check-row"><input type="checkbox" checked={!!g.commandBlocks} onChange={chk('commandBlocks')} /><span>{t('Командные блоки')}{later}</span></label>

        <b className="small">{t('Игра')}</b>
        <div className="row wrap">
          <label className="small">{t('Режим')}{live}<select className="input" value={g.gamemode} onChange={val('gamemode')}>{GM.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
          <label className="small">{t('Сложность')}{live}<select className="input" value={g.difficulty} onChange={val('difficulty')}>{DIFF.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={!!g.forceGamemode} onChange={chk('forceGamemode')} /><span>{t('Принудительно')}{later}<br /><small className="muted">{t('При каждом входе игроку ставится режим сервера (иначе — только новичкам).')}</small></span></label>
        <label className="check-row"><input type="checkbox" checked={!!g.pvp} onChange={chk('pvp')} /><span>{t('PvP — игроки могут бить друг друга')}{later}</span></label>
        <label className="check-row"><input type="checkbox" checked={!!g.allowFlight} onChange={chk('allowFlight')} /><span>{t('Разрешить полёты')}{later}<br /><small className="muted">{t('Включи, если игроков выкидывает с «Flying is not enabled» (заклинания, джетпаки и т. п.).')}</small></span></label>
        <div className="row wrap">
          <label className="small">{t('Прорисовка, чанков')}{later}<input className="input num" type="number" min="3" max="32" value={g.viewDistance} onChange={val('viewDistance')} /></label>
          <label className="small">{t('Симуляция, чанков')}{later}<input className="input num" type="number" min="3" max="32" value={g.simulationDistance} onChange={val('simulationDistance')} /></label>
          <label className="small">{t('Защита спавна, блоков')}{later}<input className="input num" type="number" min="0" max="256" value={g.spawnProtection} onChange={val('spawnProtection')} /></label>
        </div>
        <small className="muted">{t('Прорисовка — как далеко видно мир; симуляция — где растут посевы и ходят мобы (меньше = легче компьютеру). Защита спавна: 0 — выключена; операторов она не касается.')}</small>

        <b className="small">{t('Кто может зайти')}</b>
        <label className="check-row"><input type="checkbox" checked={!!g.whitelist} onChange={chk('whitelist')} /><span>{t('Белый список — заходят только эти ники')}{live}</span></label>
        {g.whitelist && <label className="small">{t('Ники через запятую (ты и операторы добавляются сами)')}{live}<input className="input mono" value={g.whitelistNames} placeholder="Друг1, Друг2" onChange={val('whitelistNames')} /></label>}
        <label className="small">{t('Строка в списке серверов (MOTD)')}{later}<input className="input" maxLength={120} value={g.motd} placeholder={t('пусто — название и описание сервера')} onChange={val('motd')} /></label>

        <b className="small">{t('Новый мир')}</b>
        <div className="row wrap">
          <label className="small grow">{t('Сид')}<input className="input mono" value={g.seed} placeholder={t('пусто — случайный')} onChange={val('seed')} disabled={g.worldExists} /></label>
          <label className="small">{t('Тип мира')}<select className="input" value={g.levelType} onChange={val('levelType')} disabled={g.worldExists}>{(LT.some(([v]) => v === g.levelType) ? LT : [...LT, [g.levelType, g.levelType]]).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
        </div>
        <small className="muted">{g.worldExists ? t('Мир сервера уже создан — сид и тип мира действуют только для нового мира (создай его выше).') : t('Сид и тип применятся, когда сервер впервые создаст этот мир.')}</small>
        <button className="btn sm primary" disabled={saving} onClick={save}>{saving ? t('Сохраняю…') : t('Сохранить настройки игры')}</button>
        <small className="muted">{running ? t('«Сразу» — отправится командами в консоль работающего сервера; остальное — после перезапуска.') : t('Запишется в server.properties, ops.json и whitelist.json при запуске сервера.')}</small>
      </div>
    </details>
  );
}

// «Мой сервер»: настоящий сервер сборки на этом компьютере. Мир, имя, пароль, игроки; вход — по ключу через туннель лаунчера.
function ServerCard({ t, toast, settings, saveSettings, progress, account, openAccounts }) {
  const [st, setSt] = useState(null);
  const [hp, setHp] = useState(null); // настройки сервера и ключ
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newWorld, setNewWorld] = useState('');
  const logRef = useRef(null);
  const loadHp = async () => { try { const h = await call('hosting:get'); setHp(h); setForm((f) => f || { name: h.name, desc: h.desc, maxPlayers: h.maxPlayers, radmin: h.radmin, password: h.password || '' }); } catch (_) {} };
  const load = async () => { try { const s = await call('server:status'); setSt(s); setLines(s.tail || []); } catch (_) {} };
  useEffect(() => {
    load(); loadHp();
    const offs = [
      on('server-state', (s) => setSt((o) => ({ ...(o || {}), ...s }))),
      on('server-log', (l) => setLines((o) => { const n = o.concat(l); return n.length > 600 ? n.slice(-500) : n; }))
    ];
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines]);
  if (!st || !hp || !form) return null;
  const running = st.state === 'running' || st.state === 'starting' || st.state === 'stopping';
  const start = async () => {
    setBusy(true);
    try { await saveForm(true); await call('server:start'); } catch (e) { toast(e.message, 'error', 9000); } finally { setBusy(false); load(); }
  };
  const saveForm = async (silent) => {
    const patch = { name: form.name, desc: form.desc, maxPlayers: Number(form.maxPlayers) || 10, radmin: form.radmin };
    // пустое поле пароль не стирает (для этого — «Убрать пароль»)
    if (form.password.trim() && form.password.trim() !== (hp.password || '')) patch.password = form.password.trim();
    const h = await call('hosting:update', patch);
    setHp((o) => ({ ...o, ...h })); setForm((f) => ({ ...f, password: h.password || '' }));
    if (!silent) toast(running ? t('Сохранено. Имя, описание и игроки применятся после перезапуска сервера') : t('Сохранено'), 'ok');
  };
  const removePassword = async () => { const h = await call('hosting:update', { password: null }); setHp((o) => ({ ...o, ...h })); setForm((f) => ({ ...f, password: '' })); toast(t('Пароль убран — входят по одному ключу'), 'ok'); };
  const copyPassword = () => { if (!form.password) return; navigator.clipboard.writeText(form.password); toast(t('Пароль скопирован'), 'ok'); };
  const syncMods = async () => {
    setBusy(true);
    try { const r = await call('server:syncMods'); setSt((o) => ({ ...o, mods: r })); toast(t('Моды сервера собраны заново') + `: ${r.mods} ${t('из')} ${r.total}`, 'ok', 7000); } catch (e) { toast(e.message, 'error', 8000); } finally { setBusy(false); }
  };
  const copyKey = () => { navigator.clipboard.writeText(hp.key); toast(t('Ключ скопирован — отправь другу или автору сборки'), 'ok'); };
  const resetKey = async () => {
    if (!window.confirm(t('Сделать новый ключ? Старый перестанет работать у всех, кому ты его давал.'))) return;
    const h = await call('hosting:resetKey'); setHp((o) => ({ ...o, ...h })); toast(t('Новый ключ готов'), 'ok');
  };
  const pickWorld = async (v) => {
    try {
      if (v.startsWith('s:')) { const h = await call('hosting:update', { world: v.slice(2) }); setHp((o) => ({ ...o, ...h })); }
      else if (v.startsWith('i:')) {
        const name = v.slice(2);
        const exists = hp.worlds.server.some((w) => w.name === name);
        if (exists && !window.confirm(t('На сервере уже есть этот мир. Заменить его свежей копией из одиночной игры? (старый сохранится рядом)'))) return;
        setBusy(true);
        const h = await call('hosting:importWorld', { name, overwrite: exists });
        setHp((o) => ({ ...o, ...h })); toast(t('Мир перенесён на сервер. Одиночный остался как был.'), 'ok');
      }
    } catch (e) { toast(e.message, 'error', 8000); } finally { setBusy(false); }
  };
  const makeWorld = async () => { if (!newWorld.trim()) return; const h = await call('hosting:newWorld', newWorld); setHp((o) => ({ ...o, ...h })); setNewWorld(''); toast(t('Новый мир создастся при запуске сервера'), 'ok'); };
  const label = { stopped: 'остановлен', installing: 'ставится', starting: 'запускается…', running: 'работает', stopping: 'останавливается…' }[st.state] || st.state;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const players = st.players || [];
  return (
    <Section title={t('Мой сервер')} icon="crown" right={<span className={'pill sm ' + (st.state === 'running' ? 'green' : '')}><span className={'dot ' + (st.state === 'running' ? 'on' : 'off')} /> {t(label)}{st.state === 'running' ? ` · ${players.length}/${st.maxPlayers || hp.maxPlayers}` : ''}</span>}>
      <p className="muted small">{t('Настоящий сервер с модами сборки на твоём компьютере. Работает, пока ты его не остановишь или не выключишь компьютер: крестик сворачивает лаунчер в трей. Друзья заходят по ключу — Radmin не нужен.')}</p>
      {progress && progress.stage === 'server' && <Progress p={progress} />}
      {st.crash && st.state === 'stopped' && (
        <div className="crash-box">
          <b>⚠ {t(st.crash.hint || 'Сервер упал при запуске')}</b>
          {st.crash.reason && <div className="small"><span className="muted">{t('Причина из лога')}:</span> <code className="mono">{st.crash.reason}</code></div>}
          {st.crash.lines && st.crash.lines.length > 0 && <pre className="console-body">{st.crash.lines.join('\n')}</pre>}
          <button className="btn sm ghost" onClick={() => call('server:openDir')}><Icon name="folder" size={12} /> {t('Папка сервера (logs/latest.log)')}</button>
        </div>
      )}

      <div className="form srv-form">
        <label>{t('Название')}<input className="input" value={form.name} maxLength={48} onChange={set('name')} /></label>
        <label>{t('Описание')} <small className="muted">({t('видно в каталоге и в игре')})</small><textarea className="input" rows={2} maxLength={400} value={form.desc} onChange={set('desc')} /></label>
        <div className="row wrap">
          <label className="small" title={t('Сколько человек может быть на сервере одновременно (max-players). Для игры отрядом лидер выбирает своё число в лобби игры.')}>{t('Максимум игроков')} <input className="input num" type="number" min="1" max="100" value={form.maxPlayers} onChange={set('maxPlayers')} /></label>
          <label className="small grow">{t('Пароль')} <small className="muted">{hp.hasPassword ? t('(задан; чтобы сменить — впиши новый и «Сохранить»)') : t('(необязательно)')}</small><PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} t={t} onCopy={copyPassword} placeholder={t('без пароля')} /></label>
          {hp.hasPassword && <button className="btn sm ghost" onClick={removePassword}>{t('Убрать пароль')}</button>}
        </div>
        <details>
          <summary className="small muted">{t('Запасной вход через Radmin VPN')}</summary>
          <RadminInfo t={t} />
          <label className="small">{t('Свой адрес (необязательно; если Radmin стоит — подставится сам)')}<input className="input mono" placeholder={hp.radminNow && hp.radminNow.found ? hp.radminNow.ip + ':' + (settings.serverPort || 25565) : '26.x.x.x:25565'} value={form.radmin} onChange={set('radmin')} /></label>
        </details>
        <button className="btn sm" onClick={() => saveForm(false).catch((e) => toast(e.message, 'error'))}>{t('Сохранить')}</button>
      </div>

      <div className="srv-world">
        <b className="small">{t('Мир сервера')}</b>
        <select className="input" disabled={running || busy} value={hp.world ? 's:' + hp.world : ''} onChange={(e) => pickWorld(e.target.value)}>
          {!hp.world && <option value="">{t('— обычный новый мир —')}</option>}
          {hp.world && !hp.worlds.server.some((w) => w.name === hp.world) && <option value={'s:' + hp.world}>{hp.world} ({t('создастся при запуске')})</option>}
          {hp.worlds.server.length > 0 && <optgroup label={t('Миры сервера')}>{hp.worlds.server.map((w) => <option key={w.name} value={'s:' + w.name}>{w.name}</option>)}</optgroup>}
          {hp.worlds.single.length > 0 && <optgroup label={t('Перенести из одиночной игры (копия)')}>{hp.worlds.single.map((w) => <option key={w.name} value={'i:' + w.name}>{w.name}{w.onServer ? ' — ' + t('заменить копию') : ''}</option>)}</optgroup>}
        </select>
        <div className="row">
          <input className="input" placeholder={t('или новый мир: название')} value={newWorld} disabled={running} onChange={(e) => setNewWorld(e.target.value)} />
          <button className="btn sm" disabled={running || !newWorld.trim()} onClick={makeWorld}>{t('Создать')}</button>
        </div>
        {running && <small className="muted">{t('Мир меняется, когда сервер остановлен.')}</small>}
      </div>

      <div className="srv-key">
        <b className="small">{t('Ключ для входа')}</b>
        <div className="row">
          <code className="mono key-text">{showKey ? hp.key : hp.key.slice(0, 12) + '•'.repeat(18)}</code>
          <button className="btn sm ghost icon-btn" onClick={() => setShowKey(!showKey)}><Icon name={showKey ? 'eyeOff' : 'eye'} size={12} /></button>
          <button className="btn sm" onClick={copyKey}><Icon name="copy" size={12} /> {t('Скопировать')}</button>
          <button className="btn sm ghost" onClick={resetKey}>{t('Новый ключ')}</button>
        </div>
        <small className="muted">{hp.hasPassword ? t('По ключу заходит любой, кто знает ещё и пароль.') : t('По ключу заходит любой, у кого он есть. Нужен контроль — задай пароль.')} {t('Чтобы сервер появился у всех во вкладке «Сервера», отправь ключ автору сборки.')}</small>
      </div>

      <ServerGame t={t} toast={toast} hp={hp} setHp={setHp} running={st.state === 'running'} />
      <ServerMods t={t} st={st} settings={settings} saveSettings={saveSettings} running={running} busy={busy} onSync={syncMods} />

      <label className="check-row">
        <input type="checkbox" checked={!!settings.serverEulaAccepted} onChange={(e) => saveSettings({ serverEulaAccepted: e.target.checked })} />
        <span>{t('Я принимаю лицензию Minecraft (EULA)')} — <a href="#" onClick={(e) => { e.preventDefault(); call('shell:open', 'https://aka.ms/MinecraftEULA'); }}>aka.ms/MinecraftEULA</a></span>
      </label>
      <div className="row wrap">
        {!running
          ? <button className="btn primary" disabled={busy || !settings.serverEulaAccepted} onClick={start}><Icon name="play" /> {busy ? t('Готовлю…') : t('Открыть сервер')}</button>
          : <button className="btn danger" disabled={st.state === 'stopping'} onClick={() => call('server:stop')}>{t('Остановить сервер')}</button>}
        {st.state === 'running' && <button className="btn" onClick={() => { if (!account) { openAccounts && openAccounts(); return; } call('game:play', { quickPlay: '127.0.0.1:' + (settings.serverPort || 25565) }).catch((e) => toast(e.message, 'error')); }}><Icon name="play" size={12} /> {t('Играть на своём сервере')}</button>}
        <button className="btn ghost" onClick={() => call('server:openDir')}><Icon name="folder" size={12} /> {t('Папка сервера')}</button>
      </div>
      {st.state === 'running' && (
        <div className="net-members">
          {players.length === 0 ? <p className="muted small">{t('На сервере пока никого.')}</p> : players.map((n) => <div key={n} className="net-member"><span className="dot on" /><b>{n}</b></div>)}
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">{t('Тонкие настройки')}</summary>
        <div className="row wrap">
          <label className="small">{t('Порт')} <input className="input num" type="number" value={settings.serverPort || 25565} onChange={(e) => saveSettings({ serverPort: Number(e.target.value) || 25565 })} /></label>
          <label className="small">{t('Память, МБ')} <input className="input num" type="number" step="512" value={settings.serverMemoryMb || 4096} onChange={(e) => saveSettings({ serverMemoryMb: Number(e.target.value) || 4096 })} /></label>
        </div>
      </details>
      {lines.length > 0 && (
        <details open={st.state !== 'stopped'}>
          <summary className="small muted">{t('Консоль сервера')}</summary>
          <pre ref={logRef} className="console-body net-log server-log">{lines.slice(-300).join('\n')}</pre>
          {st.state === 'running' && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) { call('server:command', cmd); setCmd(''); } }}>
              <input className="input mono" placeholder={t('команда сервера, например: op Ник')} value={cmd} onChange={(e) => setCmd(e.target.value)} />
              <button className="btn">{t('Отправить')}</button>
            </form>
          )}
        </details>
      )}
    </Section>
  );
}

// Войти на сервер друга по ключу (ключи запоминаются только у тебя)
function JoinByKey({ t, toast, settings, saveSettings, account, openAccounts }) {
  const [key, setKey] = useState('');
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState('');
  const [step, setStep] = useState(null);
  const saved = settings.friendServers || [];
  const check = async (k) => {
    setKey(k);
    if (!k.trim()) { setInfo(null); return; }
    try { setInfo(await call('hosting:parseKey', k)); } catch (e) { setInfo({ error: e.message }); }
  };
  const go = async (k, password, name) => {
    if (!account) { openAccounts && openAccounts(); return; }
    setStep(t('Ищу сервер…'));
    try {
      await joinByKey(k, password, (s) => setStep(t(s)));
      if (!saved.some((x) => x.key === k)) saveSettings({ friendServers: [{ key: k, name: name || 'Сервер' }, ...saved].slice(0, 20) });
      setKey(''); setInfo(null); setPw('');
    } catch (e) { toast(e.message, 'error', 12000); } finally { setStep(null); }
  };
  return (
    <Section title={t('Войти на сервер по ключу')} icon="lock">
      <p className="muted small">{t('Друг открыл свой сервер и скинул ключ (VKS1-…)? Вставь его сюда.')}</p>
      <RadminInfo t={t} />
      <input className="input mono" placeholder="VKS1-…" value={key} onChange={(e) => check(e.target.value)} />
      {info && info.error && <p className="warn-text small">{t(info.error)}</p>}
      {info && !info.error && (
        <div className="form">
          <p className="small">{t('Сервер')}: <b>{info.name}</b></p>
          {info.password && <label>{t('Пароль сервера')}<PasswordInput value={pw} onChange={setPw} t={t} /></label>}
          <button className="btn primary" disabled={!!step || (info.password && !pw)} onClick={() => go(info.key, pw, info.name)}><Icon name="play" /> {step || t('Подключиться и играть')}</button>
        </div>
      )}
      {saved.length > 0 && (
        <div className="net-members" style={{ marginTop: 8 }}>
          {saved.map((s) => (
            <div key={s.key} className="net-member">
              <span className="dot off" /><b>{s.name}</b><div className="grow" />
              <button className="btn sm primary" disabled={!!step} onClick={() => check(s.key)}>{t('Выбрать')}</button>
              <button className="btn sm danger" onClick={() => saveSettings({ friendServers: saved.filter((x) => x.key !== s.key) })}><Icon name="trash" size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// «Помогать друзьям соединяться»: лаунчер становится ретранслятором для игроков, которые не пробились друг к другу
function RelayHelp({ st, t, settings, saveSettings }) {
  const r = st.relay || { on: false };
  const on = !!settings.relayHelp;
  return (
    <div className="relay-help">
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => saveSettings({ relayHelp: e.target.checked })} />
        <span>{t('Помогать друзьям соединяться (ретранслятор)')}</span>
      </label>
      <small className="muted">{t('Если двое не могут соединиться напрямую, их игра пойдёт через твой лаунчер. Тратит немного твоего интернета и только тогда, когда кто-то не соединяется напрямую. Всё зашифровано: ни чужих комнат, ни паролей, ни самой игры ретранслятор не видит. Работает, пока лаунчер открыт.')}</small>
      {on && (
        <p className="muted small">
          {r.on
            ? <>{t('Сейчас помогаешь')}: <b>{r.sessions || 0}</b>{r.cap ? ` / ${r.cap}` : ''}{r.bytes > 0 ? ` · ${t('передано')} ${fmt(r.bytes)}` : ''}{r.served > 0 ? ` · ${t('пар за сеанс')}: ${r.served}` : ''}</>
            : t('Включаю ретранслятор…')}
        </p>
      )}
      {st.relays != null && <p className="muted small">{t('Ретрансляторов в сети (кроме тебя)')}: <b>{st.relays}</b></p>}
      {on && (
        <label className="small">{t('Лимит скорости, кбит/с')} <input className="input num" type="number" min="64" step="500" defaultValue={settings.relayMaxKbps || 4000}
          onBlur={(e) => { const v = Math.max(64, Number(e.target.value) || 4000); if (v !== settings.relayMaxKbps) saveSettings({ relayMaxKbps: v }); }} /></label>
      )}
    </div>
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
  const [openRoom, setOpenRoom] = useState(null);
  const reload = () => call('net:rooms').then((r) => r && setRooms(r)).catch(() => {});

  useEffect(() => {
    call('net:state').then((s) => s && setSt(s)).catch(() => {});
    reload();
    return on('tunnel-state', (s) => { setSt(s || { active: false }); reload(); });
  }, []);

  const go = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try { await call(tab === 'host' ? 'net:host' : 'net:join', { name, password, mode: 'world' }); setPassword(''); reload(); } catch (err) { toast(err.message, 'error', 8000); } finally { setBusy(false); }
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
          {st.active && <RoomCard st={st} t={t} toast={toast} account={account} openAccounts={openAccounts} roomId={rooms.active} room={(rooms.rooms || []).find((r) => r.id === rooms.active)} reload={reload} />}
          {savedRooms.length > 0 && (
            <Section title={t('Мои комнаты')} icon="star">
              <div className="net-members">
                {savedRooms.map((r) => (
                  <div key={r.id} className="saved-room">
                  <div className="net-member">
                    <span className="dot off" />
                    <b>{r.name}</b>
                    <span className="muted small">{r.role === 'host' ? (r.mode === 'server' ? t('моя · сервер сборки') : t('моя · мой мир')) : t('у друга')}</span>
                    <div className="grow" />
                    <button className="btn sm primary" disabled={busy} onClick={() => startRoom(r.id)}>{r.role === 'host' ? t('Включить') : t('Подключиться')}</button>
                    <button className="btn sm ghost" title={t('Пароль и настройки')} onClick={() => setOpenRoom(openRoom === r.id ? null : r.id)}><Icon name="gear" size={12} /></button>
                    <button className="btn sm danger" title={t('Удалить')} onClick={() => removeRoom(r)}><Icon name="trash" size={12} /></button>
                  </div>
                  {openRoom === r.id && <RoomSecrets roomId={r.id} room={r} t={t} toast={toast} reload={reload} compact />}
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
                <button className={tab === 'host' ? 'on' : ''} onClick={() => setTab('host')}>{t('Открыть свой мир')}</button>
              </div>
              <form className="form" onSubmit={go}>
                <p className="muted small">{tab === 'host'
                  ? t('Придумай имя комнаты и пароль и скажи их друзьям. Лаунчер соединит вас напрямую, как в локальной сети — ничего ставить не нужно.')
                  : t('Введи имя комнаты и пароль, которые дал друг. Его мир появится у тебя в игре в «Сетевой игре».')}</p>
                <label>{t('Имя комнаты')}<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('например: деревня-кокка')} autoFocus /></label>
                <label>{t('Пароль')}<PasswordInput value={password} onChange={setPassword} t={t} /></label>
                {tab === 'host' && <small className="muted">{t('Ты играешь в своём мире и открываешь его для сети — друзья заходят к тебе, пока ты в игре. Чтобы мир жил без тебя — открой «Мой сервер».')}</small>}
                <button className="btn primary" disabled={busy || !name.trim() || !password}>{tab === 'host' ? t('Открыть комнату') : t('Войти')}</button>
                <small className="muted">{t('Комната запомнится — потом включается одной кнопкой.')}</small>
              </form>
            </Section>
          )}

          <Section title={t('Если не соединяется')} icon="gear">
            <RelayHelp st={st} t={t} settings={settings} saveSettings={saveSettings} />
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
          <ServerCard t={t} toast={toast} settings={settings} saveSettings={saveSettings} progress={progress} account={account} openAccounts={openAccounts} />
          <JoinByKey t={t} toast={toast} settings={settings} saveSettings={saveSettings} account={account} openAccounts={openAccounts} />
        </div>
      </div>
    </div>
  );
}
