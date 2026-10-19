import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { REWARDS } from '../games/rewards.js';
import { call, fmtDate } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Toggle, Progress } from '../components/ui.jsx';

const RES = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440]];

// выбор lofi-трека: обычный + открытые наградами мини-игр
function MusicTrack({ t }) {
  const [p, setP] = React.useState(null);
  React.useEffect(() => { call('games:profile').then(setP).catch(() => {}); }, []);
  if (!p) return null;
  const tracks = REWARDS.filter((r) => r.kind === 'music');
  const cur = (p.equip && p.equip.music) || '';
  return (
    <div className="field">
      <span>{t('Трек')}</span>
      <select className="input" value={cur} onChange={async (e) => { const np = await call('games:equip', { kind: 'music', value: e.target.value || null }); setP(np); }}>
        <option value="">{t('Обычный lofi')}</option>
        {tracks.map((r) => <option key={r.id} value={r.track} disabled={!p.rewards[r.id]}>{r.name.replace(/^Трек /, '')}{p.rewards[r.id] ? '' : ' — 🔒 ' + t(r.how)}</option>)}
      </select>
    </div>
  );
}

export default function Settings() {
  const { t, lang, settings, saveSettings, refreshSettings, info, toast, progress, pack, refreshPack, checkUpdates, checking: checkingUpd } = useApp();
  const [javas, setJavas] = useState(null);
  const [releases, setReleases] = useState(null);
  const [earlyRels, setEarlyRels] = useState([]);
  const [code, setCode] = useState('');
  const [authorAsk, setAuthorAsk] = useState(false);
  const [authorToken, setAuthorToken] = useState('');
  const [checking, setChecking] = useState(false);
  const s = settings;
  const total = (info && info.totalMb) || 8192;
  const set = (patch) => saveSettings(patch);

  const detect = async () => { setJavas(null); try { setJavas(await call('java:detect')); } catch (e) { setJavas([]); toast(e.message, 'error'); } };
  useEffect(() => { detect(); call('pack:releases').then(setReleases).catch(() => setReleases([])); call('early:releases').then(setEarlyRels).catch(() => {}); /* eslint-disable-next-line */ }, []);

  const verify = async () => {
    setChecking(true);
    try { await call('game:verify'); toast(t('Папка проверена: всё на месте'), 'ok'); refreshPack(); }
    catch (e) { toast(e.message, 'error', 8000); } finally { setChecking(false); }
  };
  const pickDir = async () => {
    const d = await call('dialog:pickFolder', s.gameDir);
    if (!d) return;
    try { const r = await call('game:useDir', d); await refreshSettings(); refreshPack(); toast(r.hasPack ? t('Папка выбрана — сборка в ней найдена') : t('Папка выбрана — сборка скачается туда при запуске'), 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const [dirName, setDirName] = useState(null);
  const renameDir = async () => {
    try { await call('game:renameDir', dirName); setDirName(null); await refreshSettings(); refreshPack(); toast(t('Папка переименована, качать заново ничего не нужно'), 'ok'); }
    catch (e) { toast(e.message, 'error', 9000); }
  };
  const moveDir = async () => {
    const d = await call('dialog:pickFolder', s.gameDir);
    if (!d) return;
    try { await call('game:moveDir', d); await refreshSettings(); refreshPack(); toast(t('Папка перенесена'), 'ok'); }
    catch (e) { toast(e.message, 'error', 9000); }
  };
  const pickJava = async () => {
    const p = await call('dialog:pickJava');
    if (!p) return;
    const info2 = await call('java:probe', p);
    if (!info2) { toast(t('Это не похоже на Java'), 'error'); return; }
    await set({ javaMode: 'custom', javaPath: p });
    detect();
  };
  const installJava = async () => {
    try { await call('java:install', 21); toast(t('Java 21 установлена'), 'ok'); detect(); } catch (e) { toast(e.message, 'error'); }
  };

  const memMax = Math.max(2048, Math.floor((total - 1024) / 512) * 512);

  return (
    <div className="page settings">
      <div className="page-head"><h2><Icon name="gear" size={22} /> {t('Настройки')}</h2></div>
      {progress && <Progress p={progress} />}

      <Section title={t('Игра')} icon="folder">
        <div className="field">
          <span>{t('Папка игры')}</span>
          <div className="row">
            <input className="input mono grow" value={s.gameDir} onChange={(e) => set({ gameDir: e.target.value })} />
            <button className="btn" onClick={pickDir}>{t('Выбрать')}</button>
            <button className="btn ghost" onClick={() => call('shell:openPath', '')}><Icon name="folder" /></button>
          </div>
        </div>
        <div className="field">
          <span>{t('Название папки')}</span>
          <div className="row">
            <input className="input mono grow" value={dirName != null ? dirName : (s.gameDir || '').split(/[\\/]/).filter(Boolean).pop() || ''} onChange={(e) => setDirName(e.target.value)} />
            <button className="btn" disabled={dirName == null || !dirName.trim()} onClick={renameDir}><Icon name="pencil" size={12} /> {t('Переименовать')}</button>
            <button className="btn ghost" onClick={moveDir}>{t('Перенести…')}</button>
          </div>
          <small className="muted">{t('Переименовывай и переноси папку здесь, а не в Проводнике — тогда лаунчер её не потеряет и не станет качать сборку заново.')}</small>
        </div>
        <div className="row">
          <button className="btn" disabled={checking} onClick={verify}><Icon name="check" /> {checking ? t('Проверяю…') : t('Проверить папку')}</button>
          <span className="muted small">{t('Перепроверит Minecraft, NeoForge, Java и файлы сборки по контрольным суммам и докачает повреждённые.')}</span>
        </div>
      </Section>

      <Section title={t('Память и окно')} icon="cube">
        <div className="field">
          <span>{t('Оперативная память для игры')}: <b>{(s.memoryMaxMb / 1024).toFixed(1)} {t('ГБ')}</b> <small className="muted">({t('всего')} {(total / 1024).toFixed(1)} {t('ГБ')})</small></span>
          <input type="range" min="2048" max={memMax} step="512" value={s.memoryMaxMb} onChange={(e) => set({ memoryMaxMb: +e.target.value })} />
          <div className="ticks"><span>2 {t('ГБ')}</span><span>{t('рекомендуем 6–8 ГБ')}</span><span>{(memMax / 1024).toFixed(0)} {t('ГБ')}</span></div>
        </div>
        <div className="field">
          <span>{t('Разрешение окна игры')}</span>
          <div className="row wrap">
            {RES.map(([w, h]) => (
              <button key={w} className={'chip' + (s.width === w && s.height === h && !s.fullscreen ? ' on' : '')} onClick={() => set({ width: w, height: h, fullscreen: false })}>{w}×{h}</button>
            ))}
            <input className="input num" type="number" value={s.width} onChange={(e) => set({ width: +e.target.value || 854 })} />
            <span>×</span>
            <input className="input num" type="number" value={s.height} onChange={(e) => set({ height: +e.target.value || 480 })} />
          </div>
          <Toggle checked={s.fullscreen} onChange={(v) => set({ fullscreen: v })} label={t('Полноэкранный режим')} />
        </div>
      </Section>

      <Section title="Java" icon="java" right={<button className="btn sm ghost" onClick={detect}><Icon name="refresh" size={12} /> {t('Искать')}</button>}>
        <div className="seg">
          <button className={s.javaMode === 'auto' ? 'on' : ''} onClick={() => set({ javaMode: 'auto' })}>{t('Автоматически (рекомендуем)')}</button>
          <button className={s.javaMode === 'custom' ? 'on' : ''} onClick={() => set({ javaMode: 'custom' })}>{t('Выбрать вручную')}</button>
        </div>
        {s.javaMode === 'auto' && <p className="muted">{t('Лаунчер сам скачает и будет обновлять Java 21 (Eclipse Temurin) — ничего ставить не нужно.')}</p>}
        <div className="java-list">
          {javas === null && <span className="muted">{t('Ищу установленные Java…')}</span>}
          {javas && javas.length === 0 && <span className="muted">{t('Java не найдена — лаунчер скачает её сам.')}</span>}
          {javas && javas.map((j) => (
            <label key={j.path} className={'java' + (s.javaMode === 'custom' && s.javaPath === j.path ? ' on' : '') + (j.major < 21 ? ' bad' : '')}>
              <input type="radio" name="java" disabled={j.major < 21} checked={s.javaMode === 'custom' && s.javaPath === j.path} onChange={() => set({ javaMode: 'custom', javaPath: j.path })} />
              <b>Java {j.major}</b>
              <span className="muted small">{j.version} · {j.vendor || ''} {j.managed ? '· ' + t('от лаунчера') : ''}</span>
              <span className="mono small path">{j.path}</span>
              {j.major < 21 && <span className="pill warn sm">{t('нужна 21+')}</span>}
            </label>
          ))}
        </div>
        <div className="row">
          <button className="btn" onClick={pickJava}><Icon name="folder" /> {t('Указать javaw.exe')}</button>
          <button className="btn" onClick={installJava}><Icon name="download" /> {t('Скачать / обновить Java 21')}</button>
        </div>
        <div className="field">
          <span>{t('Аргументы JVM')}</span>
          <input className="input mono" value={s.jvmArgs} onChange={(e) => set({ jvmArgs: e.target.value })} />
        </div>
      </Section>

      <Section title={t('Сборка')} icon="emerald">
        <Toggle checked={s.customSplash !== false} onChange={(v) => set({ customSplash: v })} label={t('Свой экран загрузки')} hint={t('Тёмный экран загрузки с логотипом MineVillagers вместо красного экрана NeoForge.')} />
        <Toggle checked={s.autoUpdatePack} onChange={(v) => set({ autoUpdatePack: v })} label={t('Обновлять сборку при запуске')} hint={t('Если выключить, новая сборка не скачается сама: на главной будет выбор «Обновить и играть» или «Играть на своей версии».')} />
        <Toggle checked={!!s.keepOwnMods} onChange={(v) => set({ keepOwnMods: v })} label={t('Не трогать мои моды')} hint={t('Моды, которые ты сам положил в mods, лаунчер не будет убирать. Если игра начнёт вылетать — выключи.')} />
        <div className="field">
          <span>{t('Версия сборки')}</span>
          <select className="input" value={(s.pinnedEarly ? 'early:' : '') + (s.pinnedPackVersion || '')} onChange={(e) => { const v = e.target.value; set(v.startsWith('early:') ? { pinnedPackVersion: v.slice(6), pinnedEarly: true } : { pinnedPackVersion: v || null, pinnedEarly: false }); }}>
            <option value="">{t('Всегда последняя')}{pack && pack.latest ? ` (#${pack.latest.version}${pack.latestEarly ? ' · ' + t('ранний доступ') : ''})` : ''}</option>
            {(earlyRels || []).map((r) => <option key={'e' + r.tag} value={'early:' + r.tag}>#{r.version} ★ {t('ранний доступ')} — {(r.name || '').replace(/^#\d+\s*/, '')}</option>)}
            {(releases || []).filter((r) => !r.hidden).map((r) => <option key={r.tag} value={r.tag}>#{r.version} — {r.name.replace(/^#\d+\s*/, '')} ({fmtDate(r.date, lang)})</option>)}
          </select>
          <small className="muted">{t('Можно откатиться на прошлую версию, если в новой что-то сломалось.')}</small>
        </div>
        {pack && pack.early && pack.early.enabled && (
          <div className="field">
            <span>{t('Ранний доступ')}</span>
            {pack.early.access
              ? <div className="ok-box"><Icon name="star" /> {t('Доступны ранние версии')}: {pack.early.available.map((v) => '#' + v).join(', ')}</div>
              : <span className="muted small">{t('Новые версии сначала выходят для тех, кто поддерживает сборку, потом — для всех бесплатно. Код можно получить на Boosty.')}</span>}
            {(pack.early.codes || []).length > 0 && <small className="muted">{t('Твои коды')}: {pack.early.codes.map((c) => c.kind === 'month' ? t('месяц') + ' ' + c.ym : c.kind === 'version' ? t('версия') + ' #' + c.version : t('друг')).join(' · ')}</small>}
            {pack.early.access && <Toggle checked={s.useEarly !== false} onChange={(v) => set({ useEarly: v })} label={t('Получать ранние версии')} hint={t('Если выключить — будешь на общих версиях.')} />}
            <div className="row">
              <input className="input sm mono grow" placeholder={t('Код (VKM-… / VKV-… / VKF-…)')} value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn sm primary" disabled={!code.trim()} onClick={async () => { try { const r = await call('early:redeem', code.trim()); toast(r.what || t('Код принят'), 'ok', 9000); setCode(''); await call('early:status'); refreshPack(); call('early:releases').then(setEarlyRels).catch(() => {}); } catch (e) { toast(e.message, 'error', 8000); } }}>{t('Активировать')}</button>
              {pack.early.boosty && <button className="btn sm" onClick={() => call('shell:open', pack.early.boosty)}>Boosty</button>}
            </div>
          </div>
        )}
      </Section>

      <Section title={t('Лаунчер')} icon="gear">
        <div className="field">
          <span>{t('Язык')}</span>
          <div className="seg">
            <button className={s.language === 'ru' ? 'on' : ''} onClick={() => set({ language: 'ru' })}>Русский</button>
            <button className={s.language === 'en' ? 'on' : ''} onClick={() => set({ language: 'en' })}>English</button>
          </div>
        </div>
        <div className="field">
          <span>{t('После запуска игры')}</span>
          <select className="input" value={s.afterLaunch} onChange={(e) => set({ afterLaunch: e.target.value })}>
            <option value="minimize">{t('Свернуть лаунчер')}</option>
            <option value="hide">{t('Спрятать (вернётся после игры)')}</option>
            <option value="keep">{t('Оставить открытым')}</option>
            <option value="close">{t('Закрыть лаунчер')}</option>
          </select>
        </div>
        <div className="field">
          <span>{t('Фон')}</span>
          <div className="seg">
            <button className={s.theme === 'auto' ? 'on' : ''} onClick={() => set({ theme: 'auto' })}>{t('По времени суток')}</button>
            <button className={s.theme === 'day' ? 'on' : ''} onClick={() => set({ theme: 'day' })}>{t('День')}</button>
            <button className={s.theme === 'evening' ? 'on' : ''} onClick={() => set({ theme: 'evening' })}>{t('Закат')}</button>
            <button className={s.theme === 'night' ? 'on' : ''} onClick={() => set({ theme: 'night' })}>{t('Ночь')}</button>
          </div>
        </div>
        <Toggle checked={s.animations !== false} onChange={(v) => set({ animations: v })} label={t('Анимации')} hint={t('Бродящие жители, дым, снег и листопад на фоне')} />
        <Toggle checked={!!s.musicOn} onChange={(v) => set({ musicOn: v })} label={t('Музыка в лаунчере')} hint={t('Тихий пиксельный lofi. Также кнопка ♪ внизу главного экрана')} />
        <MusicTrack t={t} />
        <div className="field">
          <span>{t('Громкость музыки')}: <b>{Math.round((s.musicVol != null ? s.musicVol : 0.25) * 100)}%</b></span>
          <input type="range" min="0" max="100" value={Math.round((s.musicVol != null ? s.musicVol : 0.25) * 100)} onChange={(e) => set({ musicVol: +e.target.value / 100 })} />
        </div>
        <div className="field">
          <span>{t('Звуки мини-игр')}: <b>{Math.round((s.sfxVol != null ? s.sfxVol : 0.35) * 100)}%</b></span>
          <input type="range" min="0" max="100" value={Math.round((s.sfxVol != null ? s.sfxVol : 0.35) * 100)} onChange={(e) => set({ sfxVol: +e.target.value / 100 })} />
        </div>
        <Toggle checked={s.gameShareScores !== false} onChange={(v) => set({ gameShareScores: v })} label={t('Делиться рекордами мини-игр')} hint={t('Твой лучший результат с ником аккаунта попадёт в общую таблицу игроков сборки')} />
        <Toggle checked={s.showConsole}onChange={(v) => set({ showConsole: v })} label={t('Показывать консоль игры при запуске')} />
        <div className="field">
          <span>{t('Потоков загрузки')}: <b>{s.downloadThreads}</b></span>
          <input type="range" min="2" max="24" value={s.downloadThreads} onChange={(e) => set({ downloadThreads: +e.target.value })} />
        </div>
        {s.authorMode ? (
          <Toggle checked={s.authorMode} onChange={(v) => set({ authorMode: v })} label={t('Режим автора')} hint={t('Вкладка «Автор»: заливка сборки, новости, ранний доступ. Выключи, чтобы посмотреть лаунчер глазами игрока (вернуть — ссылка «Я автор сборки» внизу). Перед игрой в режиме игрока смени папку игры, иначе лаунчер приведёт твою папку к опубликованной сборке.')} />
        ) : authorAsk ? (
          <div className="field">
            <span>{t('Режим автора')}</span>
            <small className="muted">{t('Только для автора сборки: нужен его токен GitHub с правом записи в репозиторий сборки. Без него вкладка «Автор» не откроется.')}</small>
            <div className="row">
              <input className="input sm mono grow" type="password" placeholder="github_pat_…" value={authorToken} onChange={(e) => setAuthorToken(e.target.value)} />
              <button className="btn sm" disabled={!authorToken.trim()} onClick={async () => { try { await call('pack:setToken', authorToken.trim()); setAuthorToken(''); setAuthorAsk(false); set({ authorMode: true }); toast(t('Режим автора включён'), 'ok'); } catch (e) { toast(e.message, 'error', 8000); } }}>{t('Проверить')}</button>
              <button className="btn sm ghost" onClick={() => setAuthorAsk(false)}>{t('Отмена')}</button>
            </div>
          </div>
        ) : null}
        <div className="row">
          <button className="btn ghost" onClick={() => call('shell:openPath', '@data')}><Icon name="folder" /> {t('Папка лаунчера')}</button>
          <button className="btn ghost" disabled={checkingUpd} onClick={checkUpdates}><Icon name="refresh" /> {checkingUpd ? t('Проверяю…') : t('Проверить обновления')}</button>
          {!s.authorMode && !authorAsk && <button className="link-btn small muted" onClick={async () => { if (await call('pack:hasToken')) { set({ authorMode: true }); toast(t('Режим автора включён'), 'ok'); } else setAuthorAsk(true); }}>{t('Я автор сборки')}</button>}
          <span className="muted small">VillagersLauncher {info && info.version}</span>
        </div>
      </Section>
    </div>
  );
}
