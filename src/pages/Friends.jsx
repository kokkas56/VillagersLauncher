import React, { useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import { useFriends, STATUS_TEXT, MEMBER_TEXT, ago } from '../lib/friends.js';
import Icon from '../components/Icon.jsx';
import Head from '../components/Head.jsx';
import { Badge } from '../components/Badge.jsx';
import { Empty, Toggle } from '../components/ui.jsx';
import FriendProfile from '../components/FriendProfile.jsx';

// «Друзья», как в Steam: заявки по нику, статусы, отряд для совместной игры, уведомления, профили.
export default function Friends({ openAccounts }) {
  const { t, toast, account } = useApp();
  const fs = useFriends();
  const [nick, setNick] = useState('');
  const [view, setView] = useState(null); // ник открытого профиля
  const [menu, setMenu] = useState(null); // ключ друга с открытым меню «…»
  const [busy, setBusy] = useState(false);

  const act = async (ch, arg, ok) => {
    try { await call(ch, arg); if (ok) toast(t(ok), 'ok'); } catch (e) { toast(e.message, 'error', 6000); }
  };

  if (view) return <div className="page"><FriendProfile nick={view} fs={fs} onBack={() => setView(null)} onOpen={setView} /></div>;

  if (!account) {
    return (
      <div className="page">
        <div className="page-head"><h2><Icon name="friends" size={22} /> {t('Друзья')}</h2></div>
        <Empty icon="user">
          {t('Друзья привязаны к нику. Войди в аккаунт (Ely.by или офлайн-ник) — и добавляй друзей по нику.')}
          <div style={{ marginTop: 10 }}><button className="btn primary" onClick={openAccounts}><Icon name="user" /> {t('Войти')}</button></div>
        </Empty>
      </div>
    );
  }
  if (!fs) return <div className="page"><div className="page-head"><h2><Icon name="friends" size={22} /> {t('Друзья')}</h2></div><p className="muted">{t('Загружаю…')}</p></div>;

  const add = async (e) => {
    e && e.preventDefault();
    if (!nick.trim()) return;
    setBusy(true);
    try { await call('friends:add', nick.trim()); toast(t('Заявка отправлена') + ': ' + nick.trim(), 'ok'); setNick(''); } catch (er) { toast(er.message, 'error', 6000); }
    setBusy(false);
  };
  const groups = [['ingame', fs.friends.filter((f) => f.status === 'ingame')], ['online', fs.friends.filter((f) => f.status === 'online')], ['offline', fs.friends.filter((f) => f.status === 'offline')]];
  const unread = fs.notes.filter((n) => !n.read).length;
  const online = fs.net && fs.net.online > 0;

  return (
    <div className="page friends-page" onClick={() => menu && setMenu(null)}>
      <div className="page-head">
        <h2><Icon name="friends" size={22} /> {t('Друзья')}</h2>
        <span className={'pill' + (online ? ' green' : ' warn')} title={t('Друзья работают через те же бесплатные серверы-посредники, что и таблица рекордов. Свой сервер не нужен.')}>
          <span className="dot" style={{ background: online ? 'var(--emerald)' : 'var(--warn)' }} /> {online ? t('На связи') : t('Подключаюсь…')}
        </span>
        <div className="grow" />
        <button className="btn ghost" onClick={() => setView(fs.me.nick)}><Icon name="user" /> {t('Мой профиль')}</button>
      </div>

      <div className="friends-layout">
        <div className="friends-main">
          <section className="card">
            <div className="card-head"><Icon name="plus" /><h3>{t('Добавить друга')}</h3></div>
            <form className="row" onSubmit={add}>
              <input className="input" value={nick} maxLength={16} placeholder={t('Ник друга, как в игре')} onChange={(e) => setNick(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} />
              <button className="btn primary" disabled={busy || nick.length < 2}><Icon name="plus" size={14} /> {t('Отправить заявку')}</button>
            </form>
            <small className="muted hint-line">{t('Друг увидит заявку, даже если сейчас не в сети. Когда он примет — вы увидите статусы друг друга и сможете звать в отряд.')}</small>
          </section>

          <PartyCard fs={fs} act={act} openProfile={setView} />

          {(fs.incoming.length > 0 || fs.outgoing.length > 0) && (
            <section className="card">
              <div className="card-head"><Icon name="bell" /><h3>{t('Заявки')}</h3></div>
              {fs.incoming.map((r) => (
                <div key={r.key} className={'fr-req' + (r.suspicious ? ' sus' : '')}>
                  <Head size={32} />
                  <div className="grow">
                    <b>{r.nick}</b> {r.level ? <span className="pill sm gold">{t('ур.')} {r.level}</span> : null}
                    <div className="muted small">{t('хочет дружить')} · {ago(r.t)}{r.suspicious ? ' · ' + t('ключ не совпадает с профилем этого ника — возможно, это не он') : ''}</div>
                  </div>
                  <button className="btn sm primary" onClick={() => act('friends:accept', r.key, 'Теперь вы друзья')}><Icon name="check" size={12} /> {t('Принять')}</button>
                  <button className="btn sm" onClick={() => act('friends:decline', r.key)}>{t('Отклонить')}</button>
                  <button className="btn sm icon-btn danger" title={t('Заблокировать: заявки и приглашения от этого ника больше не придут')} onClick={() => act('friends:block', { key: r.key, nick: r.nick })}><Icon name="block" size={12} /></button>
                </div>
              ))}
              {fs.outgoing.map((r) => (
                <div key={r.key} className="fr-req out">
                  <Head size={32} />
                  <div className="grow"><b>{r.nick}</b><div className="muted small">{t('ждём ответа')} · {ago(r.t)}</div></div>
                  <button className="btn sm ghost" onClick={() => act('friends:cancel', r.key)}>{t('Отозвать')}</button>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <div className="card-head"><Icon name="friends" /><h3>{t('Друзья')} <span className="muted small">{fs.friends.length}</span></h3></div>
            {fs.friends.length === 0 ? (
              <Empty icon="friends">{t('Пока никого. Впиши ник друга сверху — как только он примет заявку, он появится здесь.')}</Empty>
            ) : groups.map(([st, list]) => list.length > 0 && (
              <div key={st} className="fr-group">
                <div className={'fr-group-head st-' + st}>{t(STATUS_TEXT[st])} <span>{list.length}</span></div>
                {list.map((f) => (
                  <FriendRow key={f.key} f={f} t={t} act={act} open={() => setView(f.nick)} menuOpen={menu === f.key} setMenu={(v) => setMenu(v ? f.key : null)} />
                ))}
              </div>
            ))}
          </section>
        </div>

        <aside className="friends-side">
          <section className="card">
            <div className="card-head"><Icon name="eye" /><h3>{t('Приватность')}</h3></div>
            <Toggle checked={fs.prefs.hide} onChange={(v) => act('friends:prefs', { hide: v }, v ? 'Друзья видят тебя «не в сети»' : 'Статус снова виден')} label={t('Скрыть мой статус')} hint={t('Друзья увидят «не в сети». Заявки и приглашения всё равно приходят.')} />
            <Toggle checked={fs.prefs.notify !== false} onChange={(v) => act('friends:prefs', { notify: v })} label={t('Всплывающие уведомления')} hint={t('Заявки, приглашения и кто зашёл в сеть.')} />
          </section>

          <section className="card">
            <div className="card-head"><Icon name="bell" /><h3>{t('Уведомления')}</h3>{unread > 0 && <span className="fr-count">{unread}</span>}<div className="grow" />
              {unread > 0 && <button className="btn sm ghost" onClick={() => act('friends:readNotes')}>{t('Прочитано')}</button>}
              {fs.notes.length > 0 && <button className="btn sm ghost icon-btn" title={t('Очистить')} onClick={() => act('friends:clearNotes')}><Icon name="trash" size={12} /></button>}
            </div>
            {fs.notes.length === 0 ? <p className="muted small">{t('Тут будут заявки, приглашения в отряд и новости друзей.')}</p> : (
              <div className="fr-notes">
                {fs.notes.slice(0, 14).map((n) => (
                  <div key={n.id} className={'fr-note k-' + n.kind + (n.read ? '' : ' unread')}>
                    <Icon name={n.kind === 'invite' || n.kind === 'party' ? 'friends' : n.kind === 'key' ? 'lock' : n.kind === 'accepted' ? 'heart' : 'bell'} size={12} />
                    <span className="grow">{n.text}</span>
                    <small className="muted">{ago(n.t)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card fr-help">
            <div className="card-head"><Icon name="info" /><h3>{t('Как играть вместе')}</h3></div>
            <ol className="small">
              <li>{t('Добавьте друг друга по нику.')}</li>
              <li>{t('Запусти игру — лобби отряда в главном меню. Позови друзей оттуда или отсюда.')}</li>
              <li>{t('Лидер выбирает мир и жмёт «Играть»: лаунчер сам поднимет «Мой сервер» и туннель.')}</li>
              <li>{t('У кого игра не запущена — придёт «Принять и запустить игру».')}</li>
            </ol>
          </section>

          {fs.blocked.length > 0 && (
            <details className="card fr-blocked">
              <summary>{t('Заблокированные')} · {fs.blocked.length}</summary>
              {fs.blocked.map((b) => (
                <div key={b.key} className="row"><span className="grow">{b.nick}</span><button className="btn sm ghost" onClick={() => act('friends:unblock', b.key)}>{t('Разблокировать')}</button></div>
              ))}
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

function FriendRow({ f, t, act, open, menuOpen, setMenu }) {
  return (
    <div className={'fr-row st-' + f.status} onDoubleClick={open}>
      <span className={'fr-ava avatar-frame' + (f.frame ? ' frame-' + f.frame.id : '')} onClick={open}>
        <Head skin={f.skin} size={38} />
        <i className={'fr-dot st-' + f.status} />
      </span>
      <div className="fr-info" onClick={open}>
        <div className="fr-name"><b>{f.nick}</b>{f.badge && <Badge id={f.badge.id} />}{f.title && <span className="ac-title small">{f.title}</span>}</div>
        <div className="fr-doing">{f.status === 'offline' ? t('Не в сети') : f.doing || t(STATUS_TEXT[f.status])}</div>
        {f.newKey && <div className="fr-warn small"><Icon name="lock" size={10} /> {t('Ключ друга сменился')} · <button className="link-btn" onClick={(e) => { e.stopPropagation(); act('friends:trustKey', f.key, 'Новый ключ принят'); }}>{t('Доверять новому ключу')}</button></div>}
      </div>
      <span className="pill sm gold" title={t('Уровень: 1 + мастерство во всех мини-играх')}>{t('ур.')} {f.level}</span>
      {f.inParty ? <span className="pill sm green">{t('в отряде')}</span>
        : <button className="btn sm" disabled={!f.invitable} title={f.invitable ? t('Позвать в отряд — друг увидит приглашение в лаунчере и в игре') : f.status !== 'offline' ? t('Отряд полон (10/10)') : t('Друг не в сети')} onClick={() => act('friends:invite', f.nick, 'Приглашение отправлено')}><Icon name="plus" size={12} /> {t('Позвать')}</button>}
      <div className="fr-menu-wrap">
        <button className="btn sm icon-btn ghost" onClick={(e) => { e.stopPropagation(); setMenu(!menuOpen); }}>⋯</button>
        {menuOpen && (
          <div className="fr-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setMenu(false); open(); }}><Icon name="user" size={12} /> {t('Профиль')}</button>
            <button onClick={() => { setMenu(false); if (window.confirm(t('Убрать') + ' ' + f.nick + ' ' + t('из друзей?'))) act('friends:remove', f.key, 'Убран из друзей'); }}><Icon name="trash" size={12} /> {t('Удалить из друзей')}</button>
            <button className="danger" onClick={() => { setMenu(false); if (window.confirm(t('Заблокировать') + ' ' + f.nick + '?')) act('friends:block', { key: f.key, nick: f.nick }, 'Заблокирован'); }}><Icon name="block" size={12} /> {t('Заблокировать')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PartyCard({ fs, act, openProfile }) {
  const { t } = useApp();
  const p = fs.party;
  if (!p) return null;
  const leader = p.leader === fs.me.nick;
  const PHASE = { lobby: 'В лобби', starting: 'Лидер запускает сервер…', live: 'Заходим в мир', ingame: 'В мире' };
  return (
    <section className={'card party-card ph-' + p.phase}>
      <div className="card-head"><Icon name="sword" /><h3>{t('Отряд')}</h3>
        <span className="pill sm">{p.solo ? t('ты один') : t(PHASE[p.phase] || p.phase)}</span>
        {!p.solo && <span className={'pill sm' + (p.full ? ' warn' : '')} title={t('В отряде не больше 10 игроков (лидер тоже). На сервер отряда могут зайти и другие — до «Максимума игроков».')}>{p.members.length}/{p.partyMax || 10}</span>}
        {p.joining && <span className="pill sm warn">{t('вступаю…')}</span>}
        <div className="grow" />
        {!p.solo && <button className="btn sm ghost" onClick={() => act('friends:leave')}>{t('Выйти из отряда')}</button>}
      </div>
      {fs.prompt && (
        <div className="party-prompt">
          <Icon name="rocket" />
          <span className="grow"><b>{fs.prompt.text}</b><br /><small className="muted">{fs.prompt.kind === 'rejoin' ? t('Игра запустится сразу на сервер отряда.') : t('Игра запустится и сразу зайдёт на сервер лидера.')}</small></span>
          <button className="btn primary" onClick={() => act('friends:launch')}><Icon name="play" size={14} /> {fs.prompt.kind === 'rejoin' ? t('Вернуться к отряду') : t('Принять и запустить игру')}</button>
          <button className="btn ghost sm" onClick={() => act('friends:dismiss')}>{t('Позже')}</button>
        </div>
      )}
      <div className="party-members">
        {p.members.map((m) => (
          <div key={m.nick} className={'pm st-' + m.state + (m.leader ? ' lead' : '')} onClick={() => openProfile(m.nick)}>
            <span className={'avatar-frame' + (m.frame ? ' frame-' + m.frame.id : '')}><Head skin={m.skin} size={44} /></span>
            <b>{m.leader && <span className="pm-crown" title={t('Лидер')}>♛</span>}{m.nick}</b>
            <small>{t(MEMBER_TEXT[m.state] || m.state)}{typeof m.progress === 'number' && m.state === 'loading' ? ' ' + Math.round(m.progress * 100) + '%' : ''}</small>
            {leader && !m.me && (
              <div className="pm-act" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm ghost" title={t('Сделать лидером')} onClick={() => act('friends:lead', m.nick)}>♛</button>
                <button className="btn sm ghost danger" title={t('Выгнать из отряда')} onClick={() => act('friends:kick', m.nick)}><Icon name="close" size={10} /></button>
              </div>
            )}
          </div>
        ))}
        {(p.invited || []).map((n) => <div key={'i' + n} className="pm invited"><span className="avatar-frame"><Head size={44} /></span><b>{n}</b><small>{t('позван…')}</small></div>)}
      </div>
      <small className="muted hint-line">
        {p.solo ? t('Позови друга кнопкой «Позвать» в списке. Само лобби — в главном меню игры: там лидер выбирает фон, мир и жмёт «Играть».')
          : leader ? t('Ты лидер: мир, фон лобби и запуск — в главном меню игры. Лаунчер сам поднимет «Мой сервер» и туннель для друзей.')
            : t('Лидер выбирает мир и запускает. Если твоя игра не открыта — лаунчер предложит запустить её сразу на сервер.')}
        {p.server && p.server.name ? ' ' + t('Сервер') + ': «' + p.server.name + '».' : ''}
      </small>
    </section>
  );
}
