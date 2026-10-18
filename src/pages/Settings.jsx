import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtDate } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Toggle, Progress } from '../components/ui.jsx';

const RES = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440]];

export default function Settings() {
  const { t, lang, settings, saveSettings, info, toast, progress, pack, refreshPack, checkUpdates, checking: checkingUpd } = useApp();
  const [javas, setJavas] = useState(null);
  const [releases, setReleases] = useState(null);
  const [checking, setChecking] = useState(false);
  const s = settings;
  const total = (info && info.totalMb) || 8192;
  const set = (patch) => saveSettings(patch);

  const detect = async () => { setJavas(null); try { setJavas(await call('java:detect')); } catch (e) { setJavas([]); toast(e.message, 'error'); } };
  useEffect(() => { detect(); call('pack:releases').then(setReleases).catch(() => setReleases([])); /* eslint-disable-next-line */ }, []);

  const verify = async () => {
    setChecking(true);
    try { await call('game:verify'); toast(t('Папка проверена: всё на месте'), 'ok'); refreshPack(); }
    catch (e) { toast(e.message, 'error', 8000); } finally { setChecking(false); }
  };
  const pickDir = async () => {
    const d = await call('dialog:pickFolder', s.gameDir);
    if (d) { await set({ gameDir: d }); refreshPack(); }
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
        <Toggle checked={s.autoUpdatePack} onChange={(v) => set({ autoUpdatePack: v })} label={t('Обновлять сборку при запуске')} hint={t('Если выключить, обновление скачается только по кнопке «Проверить папку».')} />
        <div className="field">
          <span>{t('Версия сборки')}</span>
          <select className="input" value={s.pinnedPackVersion || ''} onChange={(e) => set({ pinnedPackVersion: e.target.value || null })}>
            <option value="">{t('Всегда последняя')}{pack && pack.latest ? ` (#${pack.latest.version})` : ''}</option>
            {(releases || []).map((r) => <option key={r.tag} value={r.tag}>#{r.version} — {r.name.replace(/^#\d+\s*/, '')} ({fmtDate(r.date, lang)})</option>)}
          </select>
          <small className="muted">{t('Можно откатиться на прошлую версию, если в новой что-то сломалось.')}</small>
        </div>
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
        <Toggle checked={s.showConsole} onChange={(v) => set({ showConsole: v })} label={t('Показывать консоль игры при запуске')} />
        <div className="field">
          <span>{t('Потоков загрузки')}: <b>{s.downloadThreads}</b></span>
          <input type="range" min="2" max="24" value={s.downloadThreads} onChange={(e) => set({ downloadThreads: +e.target.value })} />
        </div>
        <Toggle checked={s.authorMode} onChange={(v) => set({ authorMode: v })} label={t('Режим автора')} hint={t('Для Кокка: вкладка «Автор» с кнопкой «Залить сборку»')} />
        <div className="row">
          <button className="btn ghost" onClick={() => call('shell:openPath', '@data')}><Icon name="folder" /> {t('Папка лаунчера')}</button>
          <button className="btn ghost" disabled={checkingUpd} onClick={checkUpdates}><Icon name="refresh" /> {checkingUpd ? t('Проверяю…') : t('Проверить обновления')}</button>
          <span className="muted small">VillagersLauncher {info && info.version}</span>
        </div>
      </Section>
    </div>
  );
}
