import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtDuration } from '../lib/api.js';
import { STATUS_TEXT, ago } from '../lib/friends.js';
import Icon from './Icon.jsx';
import Head from './Head.jsx';
import SkinPreview from './SkinPreview.jsx';
import { Badge } from './Badge.jsx';
import { defaultSkinDataUrl } from '../editor/templates.js';
import { REWARDS, rewardById, badgeSvg, capeDataUrl, THEMES, THEME_NAMES, FRAMES, LOBBY_BGS, DECOR, GAME_NAMES, KIND_NAMES } from '../games/rewards.js';
import { MG_GAMES, MG_NAMES } from '../games/cosmetics.js';

const xpForLevel = (l) => l * l * 120;

// Профиль игрока (свой или друга): 3D-скин с плащом, уровень и мастерство, награды и значки, рамка, тема, рекорды,
// время в игре, недавние награды, «о себе» и витрина (свою витрину и «о себе» правишь здесь же).
export default function FriendProfile({ nick, fs, onBack }) {
  const { t, toast, lang } = useApp();
  const [p, setP] = useState(null);
  const [about, setAbout] = useState(null);
  const [picking, setPicking] = useState(false);
  const [fallback] = useState(() => defaultSkinDataUrl());

  const load = () => call('friends:profile', nick).then(setP).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [nick]);
  // профиль друга приходит с брокера не сразу — перечитываем при каждом обновлении «Друзей»
  useEffect(() => { if (fs) load(); /* eslint-disable-next-line */ }, [fs]);

  if (!p) return <div className="fp"><button className="btn ghost" onClick={onBack}>← {t('Назад')}</button><p className="muted">{t('Загружаю профиль…')}</p></div>;

  const theme = p.equip.theme && THEMES[p.equip.theme];
  const heroStyle = theme ? { '--fp-a': theme['--emerald-d'], '--fp-b': theme['--gold'], '--fp-c': theme['--emerald'] } : undefined;
  const owned = new Set(p.rewards);
  const show = (p.showcase || []).map(rewardById).filter(Boolean);
  const recent = (p.recent || []).map((r) => ({ ...r, r: rewardById(r.id) })).filter((x) => x.r);
  const badges = p.rewards.map(rewardById).filter((r) => r && r.kind === 'badge');
  const records = Object.entries(p.records || {}).filter(([g, v]) => GAME_NAMES[g] && v > 0);
  const act = async (ch, arg, ok) => { try { await call(ch, arg); if (ok) toast(t(ok), 'ok'); load(); } catch (e) { toast(e.message, 'error', 6000); } };
  const saveAbout = async () => { await act('friends:prefs', { about }, 'Сохранено'); setAbout(null); };
  const toggleShow = (id) => {
    const cur = p.showcase || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-6);
    setP({ ...p, showcase: next });
    call('friends:prefs', { showcase: next }).catch(() => {});
  };

  return (
    <div className="fp">
      <div className="page-head">
        <button className="btn ghost" onClick={onBack}>← {t('Друзья')}</button>
        <div className="grow" />
        {!p.loaded && !p.me && <span className="pill warn">{t('Профиль ещё не пришёл — друг должен хоть раз открыть лаунчер')}</span>}
      </div>

      <section className={'card fp-hero' + (theme ? ' themed' : '')} style={heroStyle}>
        <div className="fp-skin">
          <SkinPreview skin={p.skin || fallback} cape={p.cape} slim={p.slim} width={230} height={300} rotate walk zoom={0.85} />
        </div>
        <div className="fp-head">
          <div className="fp-name">
            <span className={'avatar-frame' + (p.equip.frame ? ' frame-' + p.equip.frame : '')}><Head skin={p.skin} size={46} /></span>
            <div>
              <h2>{p.nick} <Badge id={p.equip.badge} size={18} /></h2>
              {p.title && <div className="ac-title">{p.title}</div>}
            </div>
          </div>
          {p.status && <div className={'fp-status st-' + p.status}><i className={'fr-dot st-' + p.status} /> {p.status === 'offline' ? t('Не в сети') : p.doing || t(STATUS_TEXT[p.status])}</div>}
          {p.me && <div className="muted small">{t('Так тебя видят друзья. Скин и плащ — во вкладке «Скины», рамка, значок и тема — в «Наградах».')}</div>}
          {!p.verified && p.friend && <div className="fr-warn small"><Icon name="lock" size={10} /> {t('Профиль подписан другим ключом — не тот, что был при дружбе')}</div>}
          <div className="fp-stats">
            <Stat n={p.level} label={t('уровень')} gold />
            <Stat n={p.playMs ? fmtDuration(p.playMs, lang) : '—'} label={t('в Minecraft')} />
            <Stat n={p.party} label={t('игр отрядом')} />
            <Stat n={p.friends} label={t('друзей')} />
            <Stat n={p.rewards.length} label={t('наград')} />
          </div>
          <div className="row fp-actions">
            {p.me ? null : p.friend ? (
              <>
                <button className="btn primary" disabled={p.status === 'offline'} onClick={() => act('friends:invite', p.nick, 'Приглашение отправлено')}><Icon name="plus" size={14} /> {t('Позвать в отряд')}</button>
                <button className="btn ghost" onClick={() => { if (window.confirm(t('Убрать') + ' ' + p.nick + ' ' + t('из друзей?'))) act('friends:remove', p.key, 'Убран из друзей'); }}>{t('Удалить из друзей')}</button>
              </>
            ) : p.incoming ? <button className="btn primary" onClick={() => act('friends:accept', p.key, 'Теперь вы друзья')}><Icon name="check" size={14} /> {t('Принять заявку')}</button>
              : p.outgoing ? <span className="pill">{t('Заявка отправлена')}</span>
                : !p.blocked && <button className="btn primary" onClick={() => act('friends:add', p.nick, 'Заявка отправлена')}><Icon name="plus" size={14} /> {t('Добавить в друзья')}</button>}
            {p.since && <span className="muted small">{t('друзья с')} {new Date(p.since).toLocaleDateString('ru-RU')}</span>}
          </div>
        </div>
      </section>

      <div className="fp-grid">
        <section className="card">
          <div className="card-head"><Icon name="pencil" /><h3>{t('О себе')}</h3><div className="grow" />
            {p.me && about === null && <button className="btn sm ghost" onClick={() => setAbout(p.about || '')}>{t('Изменить')}</button>}
          </div>
          {about !== null ? (
            <>
              <textarea className="input" rows={4} maxLength={300} value={about} placeholder={t('Пара слов о себе: во что любишь играть, когда бываешь онлайн…')} onChange={(e) => setAbout(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}><span className="muted small grow">{about.length}/300</span><button className="btn sm ghost" onClick={() => setAbout(null)}>{t('Отмена')}</button><button className="btn sm primary" onClick={saveAbout}>{t('Сохранить')}</button></div>
            </>
          ) : <p className={'fp-about' + (p.about ? '' : ' muted')}>{p.about || (p.me ? t('Расскажи о себе — друзья увидят это в твоём профиле.') : t('Пока ничего не написал.'))}</p>}
        </section>

        <section className="card">
          <div className="card-head"><Icon name="star" /><h3>{t('Витрина')}</h3><span className="muted small">{show.length}/6</span><div className="grow" />
            {p.me && <button className={'btn sm' + (picking ? ' primary' : ' ghost')} onClick={() => setPicking(!picking)}>{picking ? t('Готово') : t('Выбрать')}</button>}
          </div>
          {picking ? (
            <>
              <small className="muted hint-line">{t('Отметь до шести наград — их увидят первыми.')}</small>
              <div className="fp-tiles pick">
                {p.rewards.map(rewardById).filter(Boolean).map((r) => <RewardTile key={r.id} r={r} on={(p.showcase || []).includes(r.id)} onClick={() => toggleShow(r.id)} />)}
                {p.rewards.length === 0 && <p className="muted small">{t('Наград пока нет — они выдаются в мини-играх лаунчера и за игру с друзьями.')}</p>}
              </div>
            </>
          ) : show.length ? <div className="fp-tiles">{show.map((r) => <RewardTile key={r.id} r={r} big />)}</div>
            : <p className="muted small">{p.me ? t('Выбери любимые награды — они встанут сюда.') : t('Витрина пуста.')}</p>}
        </section>

        <section className="card">
          <div className="card-head"><Icon name="crown" /><h3>{t('Мастерство')}</h3></div>
          <div className="fp-mastery">
            {MG_GAMES.map((g) => {
              const l = Number(p.mastery[g]) || 0;
              return (
                <div key={g} className="fp-m">
                  <span className="grow">{t(MG_NAMES[g])}</span>
                  <span className="fp-bar"><i style={{ width: Math.min(100, l * 10) + '%' }} /></span>
                  <b>{l}</b>
                </div>
              );
            })}
          </div>
          <small className="muted hint-line">{t('Уровень игрока = 1 + сумма уровней мастерства. Следующий уровень игры — через')} {xpForLevel(1)}, {xpForLevel(2)}, {xpForLevel(3)}… {t('очков опыта')}</small>
        </section>

        <section className="card">
          <div className="card-head"><Icon name="emerald" /><h3>{t('Рекорды мини-игр')}</h3></div>
          {records.length ? (
            <div className="fp-records">{records.map(([g, v]) => <div key={g} className="row"><span className="grow">{t(GAME_NAMES[g])}</span><b>{Number(v).toLocaleString('ru-RU')}</b></div>)}</div>
          ) : <p className="muted small">{t('Ещё нет рекордов.')}</p>}
        </section>

        <section className="card">
          <div className="card-head"><Icon name="rocket" /><h3>{t('Недавние награды')}</h3></div>
          {recent.length ? recent.map(({ r, t: at }) => (
            <div key={r.id} className="fp-recent"><RewardIcon r={r} /><span className="grow">{r.name}<br /><small className="muted">{t(KIND_NAMES[r.kind])} · {t(r.how)}</small></span><small className="muted">{ago(at)}</small></div>
          )) : <p className="muted small">{t('Пока пусто.')}</p>}
        </section>

        <section className="card">
          <div className="card-head"><Icon name="shirt" /><h3>{t('Оформление')}</h3></div>
          <div className="fp-look">
            <Look label={t('Рамка')} v={p.equip.frame && FRAMES[p.equip.frame] ? FRAMES[p.equip.frame].name : null} />
            <Look label={t('Тема')} v={p.equip.theme ? THEME_NAMES[p.equip.theme] || p.equip.theme : null} swatch={theme && theme['--gold']} />
            <Look label={t('Плащ')} v={p.cape ? (p.equip.cape ? capeName(p.equip.cape) : t('свой')) : null} />
            <Look label={t('Декорация меню')} v={p.equip.decor ? DECOR[p.equip.decor] : null} />
            <Look label={t('Фон лобби')} v={p.equip.lobby ? (LOBBY_BGS.find((b) => b.id === p.equip.lobby) || {}).name : null} />
          </div>
          {badges.length > 0 && (
            <div className="fp-badges">{badges.map((r) => <img key={r.id} src={badgeSvg(r, 22)} width="22" height="22" alt="" title={r.name} className={owned.has(r.id) ? '' : 'off'} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ n, label, gold }) { return <div className={'fp-stat' + (gold ? ' gold' : '')}><b>{n}</b><small>{label}</small></div>; }
function Look({ label, v, swatch }) { return <div className="fp-look-row"><span className="muted">{label}</span><span className="grow" />{swatch && <i className="fp-swatch" style={{ background: swatch }} />}<b>{v || '—'}</b></div>; }
function capeName(id) { const r = REWARDS.find((x) => x.kind === 'cape' && x.cape === id); return r ? r.name : id; }

function RewardIcon({ r }) {
  if (r.kind === 'badge') return <span className="rw-icon"><img src={badgeSvg(r, 22)} width="22" height="22" alt="" /></span>;
  if (r.kind === 'cape') { const u = capeDataUrl(r.cape); return <span className="rw-icon">{u ? <span className="cape-prev" style={{ backgroundImage: `url(${u})` }} /> : '⚑'}</span>; }
  if (r.kind === 'frame') return <span className="rw-icon"><span className={'avatar-frame frame-' + r.frame}><span className="fp-frame-dot" /></span></span>;
  if (r.kind === 'theme') { const th = THEMES[r.theme]; return <span className="rw-icon"><i className="fp-swatch big" style={{ background: th ? `linear-gradient(135deg, ${th['--gold']}, ${th['--emerald']})` : '' }} /></span>; }
  if (r.kind === 'lobby') { const b = LOBBY_BGS.find((x) => x.id === r.lobby); return <span className="rw-icon"><i className="fp-swatch big" style={{ background: b ? `linear-gradient(180deg, ${b.sky[0]}, ${b.sky[1]} 70%, ${b.ground} 70%)` : '' }} /></span>; }
  return <span className="rw-icon">{({ title: '❝', scene: '▣', music: '♪', decor: '✦' })[r.kind] || '★'}</span>;
}
function RewardTile({ r, on, onClick, big }) {
  return (
    <button type="button" className={'fp-tile' + (on ? ' on' : '') + (big ? ' big' : '')} onClick={onClick} disabled={!onClick} title={r.how}>
      <RewardIcon r={r} />
      <span>{r.name.replace(/^(Фон|Тема|Рамка|Лобби|Декорация|Трек) «(.*)»$/, '$2')}</span>
    </button>
  );
}
