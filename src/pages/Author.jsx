import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on, fmtBytes, fmtDate } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Section, Progress, Toggle } from '../components/ui.jsx';

function FileRow({ f, kind, optional, onOptional }) {
  const isMod = f.path.startsWith('mods/');
  return (
    <div className={'frow ' + kind}>
      <span className="fk">{kind === 'add' ? '+' : kind === 'chg' ? '~' : '−'}</span>
      <span className="fp mono">{f.path}</span>
      <span className="muted small">{fmtBytes(f.size)}</span>
      {isMod && kind !== 'del' && onOptional && (
        <label className="check small" title="Игроки смогут выключить этот мод"><input type="checkbox" checked={optional} onChange={(e) => onOptional(e.target.checked)} /> по желанию</label>
      )}
    </div>
  );
}

// один выпуск: сделать у всех, скрыть у игроков, переименовать, удалить
function ReleaseRow({ r, t, lang, toast, reload }) {
  const [sure, setSure] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(r.name.replace(/^#\d+\s*/, ''));
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok, 'ok'); reload(); } catch (e) { toast(e.message, 'error', 8000); } };
  return (
    <div className={'rel' + (r.latest ? ' on' : '') + (r.hidden ? ' hidden-rel' : '')}>
      <b>#{r.version}</b>
      {edit ? (
        <form className="row grow" onSubmit={(e) => { e.preventDefault(); setEdit(false); act(() => call('pack:renameRelease', { id: r.id, name: `#${r.version} ${name}`.trim() }), t('Переименовано')); }}>
          <input className="input sm grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn sm primary">{t('Сохранить')}</button>
        </form>
      ) : <span className="grow">{r.name.replace(/^#\d+\s*/, '')}</span>}
      <span className="muted small">{fmtDate(r.date, lang)}</span>
      {r.latest && <span className="pill green sm">{t('у всех')}</span>}
      {r.hidden && <span className="pill sm">{t('скрыт')}</span>}
      <div className="rel-actions">
        {!r.latest && !r.hidden && <button className="btn sm" title={t('Эта версия станет у всех основной')} onClick={() => act(() => call('pack:makeLatest', r.id), t('Теперь у всех сборка') + ' #' + r.version)}>{t('Сделать у всех')}</button>}
        {!r.latest && <button className="btn sm ghost" title={r.hidden ? t('Снова показать игрокам в выборе версий') : t('Убрать из выбора версий у игроков, не удаляя')} onClick={() => act(() => call('pack:hideRelease', { id: r.id, hidden: !r.hidden }), r.hidden ? t('Выпуск снова виден игрокам') : t('Выпуск скрыт у игроков'))}><Icon name={r.hidden ? 'eye' : 'eyeOff'} size={12} /></button>}
        <button className="btn sm ghost" title={t('Переименовать')} onClick={() => setEdit(!edit)}><Icon name="pencil" size={12} /></button>
        {!r.latest && (sure
          ? <button className="btn sm danger" onClick={() => { setSure(false); act(() => call('pack:deleteRelease', r.id), t('Выпуск удалён') + ' #' + r.version); }}>{t('Точно удалить?')}</button>
          : <button className="btn sm danger" title={t('Удалить выпуск для всех')} onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}><Icon name="trash" size={12} /></button>)}
      </div>
    </div>
  );
}

// одна новость: скрыть у всех, исправить, удалить
function NewsRow({ n, t, lang, toast, reload }) {
  const [sure, setSure] = useState(false);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(n.title || '');
  const [text, setText] = useState(n.text || '');
  const act = async (d, ok) => { try { await call('pack:setNews', { version: n.version, ...d }); if (ok) toast(ok, 'ok'); reload(); } catch (e) { toast(e.message, 'error', 8000); } };
  return (
    <div className={'rel news-row' + (n.hidden ? ' hidden-rel' : '')}>
      <b>#{n.version}</b>
      {edit ? (
        <form className="form grow" onSubmit={(e) => { e.preventDefault(); setEdit(false); act({ title: title.trim(), text: text.trim() }, t('Новость исправлена')); }}>
          <input className="input sm" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className="input sm" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row"><button className="btn sm primary">{t('Сохранить')}</button><button type="button" className="btn sm ghost" onClick={() => setEdit(false)}>{t('Отмена')}</button></div>
        </form>
      ) : (
        <span className="grow" title={n.text || ''}>{n.title || t('Обновление')}{n.text ? <span className="muted small"> — {n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text}</span> : null}</span>
      )}
      {!edit && <span className="muted small">{fmtDate(n.date, lang)}</span>}
      {n.hidden && <span className="pill sm">{t('скрыта')}</span>}
      {!edit && (
        <div className="rel-actions">
          <button className="btn sm ghost" title={n.hidden ? t('Показать новость всем') : t('Скрыть новость (можно вернуть)')} onClick={() => act({ hidden: !n.hidden }, n.hidden ? t('Новость снова видна') : t('Новость скрыта'))}><Icon name={n.hidden ? 'eye' : 'eyeOff'} size={12} /></button>
          <button className="btn sm ghost" title={t('Исправить текст')} onClick={() => setEdit(true)}><Icon name="pencil" size={12} /></button>
          {sure
            ? <button className="btn sm danger" onClick={() => { setSure(false); act({ deleted: true }, t('Новость удалена') + ' #' + n.version); }}>{t('Точно удалить?')}</button>
            : <button className="btn sm danger" title={t('Удалить новость (сборка останется)')} onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}><Icon name="trash" size={12} /></button>}
        </div>
      )}
    </div>
  );
}

// ранний доступ: настройки, список доступа, ранние выпуски
function EarlyAccess({ t, toast, refreshPack }) {
  const [cfg, setCfg] = useState(null);
  const [list, setList] = useState(null);
  const [rels, setRels] = useState([]);
  const [dirty, setDirty] = useState(false);
  const load = async () => {
    try { setCfg(await call('early:config')); } catch (e) { setCfg({}); }
    try { setList(await call('early:access')); } catch (e) { setList([]); }
    try { setRels(await call('early:authorReleases')); } catch (e) { setRels([]); }
  };
  useEffect(() => { load(); }, []);
  if (!cfg) return <span className="muted">{t('Загружаю…')}</span>;
  const saveCfg = async () => { try { await call('early:setConfig', { worker: (cfg.worker || '').trim(), repo: (cfg.repo || '').trim(), boosty: (cfg.boosty || '').trim() }); toast(t('Сохранено'), 'ok'); load(); } catch (e) { toast(e.message, 'error', 8000); } };
  const saveList = async () => { try { setList(await call('early:setAccess', list)); setDirty(false); toast(t('Список доступа сохранён'), 'ok'); } catch (e) { toast(e.message, 'error', 8000); } };
  const edit = (i, patch) => { const n = list.slice(); n[i] = { ...n[i], ...patch }; setList(n); setDirty(true); };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="form">
      <p className="muted small">{t('Новые сборки можно сначала выпускать только для поддержавших. Они лежат в закрытом репозитории, а лаунчер получает их через твой воркер Cloudflare — только для ников Ely.by из списка ниже. В назначенный день (или по кнопке) выпуск открывается всем.')}</p>
      <label>{t('Адрес воркера')}<input className="input mono" placeholder="https://villagers-early.<имя>.workers.dev" value={cfg.worker || ''} onChange={(e) => setCfg({ ...cfg, worker: e.target.value })} /></label>
      <label>{t('Закрытый репозиторий')}<input className="input mono" placeholder="kokkas56/MineVillagers-early" value={cfg.repo || ''} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} /></label>
      <label>{t('Ссылка на Boosty')}<input className="input mono" placeholder="https://boosty.to/…" value={cfg.boosty || ''} onChange={(e) => setCfg({ ...cfg, boosty: e.target.value })} /></label>
      <button className="btn sm" onClick={saveCfg}>{t('Сохранить настройки')}</button>
      {cfg.repo && list && (
        <>
          <h4>{t('Кому открыт доступ')}</h4>
          <div className="rel-list">
            {list.map((x, i) => {
              const live = x.friend || !x.until || x.until >= today;
              return (
                <div key={i} className={'rel' + (live ? '' : ' hidden-rel')}>
                  <input className="input sm mono" style={{ width: 140 }} placeholder={t('ник Ely.by')} value={x.nick} onChange={(e) => edit(i, { nick: e.target.value })} />
                  <label className="check small"><input type="checkbox" checked={!!x.friend} onChange={(e) => edit(i, { friend: e.target.checked })} /> {t('друг (бессрочно)')}</label>
                  {!x.friend && <input className="input sm" type="date" value={x.until || ''} onChange={(e) => edit(i, { until: e.target.value || null })} title={t('До какого дня')} />}
                  <input className="input sm grow" placeholder={t('заметка (Boosty-ник…)')} value={x.note || ''} onChange={(e) => edit(i, { note: e.target.value })} />
                  {!live && <span className="pill sm">{t('истёк')}</span>}
                  <button className="btn sm danger" onClick={() => { setList(list.filter((_, j) => j !== i)); setDirty(true); }}><Icon name="trash" size={12} /></button>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => { const d = new Date(Date.now() + 31 * 864e5).toISOString().slice(0, 10); setList([...list, { nick: '', until: d, friend: false, note: '' }]); setDirty(true); }}><Icon name="plus" size={12} /> {t('Добавить')}</button>
            <button className="btn sm primary" disabled={!dirty} onClick={saveList}>{t('Сохранить список')}</button>
          </div>
          <h4>{t('Ранние выпуски')}</h4>
          {rels.length === 0 && <span className="muted small">{t('Пока нет. Отметь «Ранний доступ» при заливке сборки.')}</span>}
          <div className="rel-list">
            {rels.sort((a, b) => b.version - a.version).map((r) => (
              <div key={r.tag} className={'rel' + (r.hidden ? ' hidden-rel' : '')}>
                <b>#{r.version}</b>
                <span className="grow">{(r.name || '').replace(/^#\d+\s*/, '')}</span>
                {r.hidden ? <span className="pill sm green">{t('открыт всем')}</span> : (
                  <>
                    <input className="input sm" type="date" value={r.freeAt || ''} title={t('Когда открыть всем')} onChange={async (e) => { try { await call('early:freeAt', { tag: r.tag, freeAt: e.target.value || null }); load(); } catch (er) { toast(er.message, 'error'); } }} />
                    <button className="btn sm" onClick={async () => { try { await call('early:open', r.tag); toast(t('Выпуск открыт для всех') + ' #' + r.version, 'ok'); load(); refreshPack(); } catch (e) { toast(e.message, 'error', 10000); } }}>{t('Открыть всем')}</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Author() {
  const { t, lang, settings, saveSettings, progress, toast, refreshPack } = useApp();
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState('');
  const [changes, setChanges] = useState(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [noNews, setNoNews] = useState(false);
  const [earlyOn, setEarlyOn] = useState(false);
  const [freeAt, setFreeAt] = useState(new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  const [news, setNews] = useState([]);
  const [releases, setReleases] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [scanP, setScanP] = useState(null);
  useEffect(() => on('scan-progress', setScanP), []);
  const optional = new Set(settings.authorOptional || []);

  const loadReleases = () => call('pack:releases').then(setReleases).catch(() => {});
  const loadNews = () => call('pack:news').then(setNews).catch(() => {});
  const scan = async () => {
    setLoading(true);
    try { setChanges(await call('pack:changes')); } catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  };
  useEffect(() => {
    call('pack:hasToken').then(setHasToken);
    scan();
    loadReleases();
    loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToken = async () => {
    try {
      await call('pack:setToken', token.trim());
      setHasToken(true);
      setToken('');
      toast(t('Токен проверен и сохранён'), 'ok');
    } catch (e) { toast(e.message, 'error', 8000); }
  };

  const setOptional = (p, v) => {
    const s = new Set(optional);
    if (v) s.add(p); else s.delete(p);
    saveSettings({ authorOptional: [...s] });
  };

  const publish = async () => {
    if (!noNews && !title.trim()) { toast(t('Напиши заголовок обновления'), 'warn'); return; }
    if (noNews && !n && !optChanged) { toast(t('Нечего заливать: изменений нет, а новость выключена'), 'warn'); return; }
    setPublishing(true);
    try {
      const r = await call('pack:publish', { title: title.trim(), text: text.trim(), noNews, early: earlyOn, freeAt: earlyOn ? freeAt : null });
      if (r.newsWarn) toast(r.newsWarn, 'warn', 10000);
      toast(`${t('Сборка')} #${r.version} ${t('залита!')} ${t('Загружено файлов')}: ${r.uploaded}, ${t('с Modrinth')}: ${r.fromModrinth}`, 'ok', 9000);
      setTitle(''); setText('');
      await scan();
      loadReleases();
      loadNews();
      refreshPack();
    } catch (e) { toast(e.message, 'error', 10000); } finally { setPublishing(false); }
  };

  const n = changes ? changes.added.length + changes.changed.length + changes.removed.length : 0;
  const optChanged = changes && changes.manifest && (changes.manifest.files || []).some((f) => !!f.optional !== optional.has(f.path));

  return (
    <div className="page">
      <div className="page-head">
        <h2><Icon name="crown" size={22} /> {t('Автор сборки')}</h2>
        <div className="grow" />
        <button className="btn ghost" onClick={scan} disabled={loading}><Icon name="refresh" /> {loading ? t('Сканирую…') : t('Пересканировать')}</button>
      </div>
      {(progress || scanP) && <Progress p={progress || scanP} />}

      <div className="author-grid">
        <Section title={t('Локальные изменения')} icon="layers" right={changes && <span className="muted small">{changes.files.length} {t('файлов')}, {fmtBytes(changes.totalSize)}</span>}>
          <p className="muted small">{t('Ты меняешь моды и конфиги прямо в папке игры и играешь с ними — у остальных ничего не меняется, пока не нажмёшь «Залить сборку».')}</p>
          {changes && n === 0 && !optChanged && <div className="ok-box"><Icon name="check" /> {t('Всё уже залито: у игроков та же сборка, что у тебя.')}</div>}
          {changes && n > 0 && (
            <div className="flist">
              {[...changes.added.map((f) => ['add', f]), ...changes.changed.map((f) => ['chg', f]), ...changes.removed.map((f) => ['del', f])]
                .slice(0, showAll ? 2000 : 60)
                .map(([k, f]) => <FileRow key={k + f.path} f={f} kind={k} optional={optional.has(f.path)} onOptional={(v) => setOptional(f.path, v)} />)}
              {n > 60 && !showAll && <button className="link-btn" onClick={() => setShowAll(true)}>{t('показать все')} ({n})</button>}
            </div>
          )}
          {!changes && <span className="muted">{t('Сканирую папку…')}</span>}
        </Section>

        <div className="author-right">
          <Section title={t('Залить сборку')} icon="upload">
            {!hasToken ? (
              <div className="form">
                <p className="muted small">{t('Нужен токен GitHub с правом записи в репозиторий сборки. Создай его один раз: GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: только')} <b>{settings.packRepo}</b>, Permissions → Contents: Read and write.</p>
                <button type="button" className="btn ghost sm" onClick={() => call('shell:open', 'https://github.com/settings/personal-access-tokens/new')}><Icon name="link" size={12} /> {t('Открыть страницу токенов')}</button>
                <input className="input mono" type="password" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
                <button className="btn primary" disabled={!token.trim()} onClick={saveToken}>{t('Проверить и сохранить')}</button>
              </div>
            ) : (
              <div className="form">
                <label className="check"><input type="checkbox" checked={noNews} onChange={(e) => setNoNews(e.target.checked)} /> {t('Без новости (тихое обновление)')}</label>
                <label className="check"><input type="checkbox" checked={earlyOn} onChange={(e) => setEarlyOn(e.target.checked)} /> {t('Ранний доступ (сначала только для поддержавших)')}</label>
                {earlyOn && <label>{t('Открыть всем')}<input className="input" type="date" value={freeAt} onChange={(e) => setFreeAt(e.target.value)} /></label>}
                <label>{t('Заголовок')}<input className="input" placeholder={noNews ? t('Необязательно — увидишь только ты') : t('Например: Жители строят теплицы')} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                {!noNews && <label>{t('Что нового (увидят все в новостях)')}<textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Коротко опиши изменения…')} /></label>}
                {noNews && <small className="muted">{t('Сборка обновится у всех, но в новостях записи не будет. Потом её можно показать в списке «Новости» ниже.')}</small>}
                <button className={'btn primary big' + (publishing ? ' busy' : '')} disabled={publishing || !changes} onClick={publish}>
                  <Icon name="rocket" /> {publishing ? t('Заливаю…') : n || optChanged ? `${t('Залить сборку')} (${n})${noNews ? ' ' + t('без новости') : ''}` : t('Опубликовать только новость')}
                </button>
                <small className="muted">{t('Моды, найденные на Modrinth, игроки скачают оттуда; остальное загрузится в GitHub Releases.')}</small>
                <button className="link-btn small" onClick={async () => { await call('pack:setToken', null); setHasToken(false); }}>{t('Сменить токен')}</button>
              </div>
            )}
          </Section>

          <Section title={t('Настройки сборки')} icon="gear">
            <div className="field"><span>{t('Папка-источник (твоя игра)')}</span>
              <div className="row">
                <input className="input mono grow" value={settings.authorSourceDir} onChange={(e) => saveSettings({ authorSourceDir: e.target.value })} />
                <button className="btn" onClick={async () => { const d = await call('dialog:pickFolder', settings.authorSourceDir); if (d) saveSettings({ authorSourceDir: d }); }}>{t('Выбрать')}</button>
              </div>
            </div>
            <div className="field"><span>{t('Репозиторий сборки')}</span><input className="input mono" value={settings.packRepo} onChange={(e) => saveSettings({ packRepo: e.target.value })} /></div>
            <div className="field"><span>{t('Папки в сборке')}</span><input className="input mono" value={settings.syncDirs.join(', ')} onChange={(e) => saveSettings({ syncDirs: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
            <div className="field"><span>{t('Не отправлять (маски)')}</span><textarea className="input mono" rows={4} value={settings.ignore.join('\n')} onChange={(e) => saveSettings({ ignore: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></div>
            <div className="row">
              <div className="field"><span>Minecraft</span><input className="input mono" value={settings.minecraftVersion} onChange={(e) => saveSettings({ minecraftVersion: e.target.value })} /></div>
              <div className="field"><span>NeoForge</span><input className="input mono" value={settings.neoforgeVersion} onChange={(e) => saveSettings({ neoforgeVersion: e.target.value })} /></div>
            </div>
            <div className="field"><span>{t('Сервера для всех (адрес на строку, «Имя = адрес»)')}</span>
              <textarea className="input mono" rows={2} value={(settings.publishServers || []).map((s) => (s.name && s.name !== s.address ? `${s.name} = ${s.address}` : s.address)).join('\n')}
                onChange={(e) => saveSettings({ publishServers: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b] = l.split('=').map((x) => x.trim()); return b ? { name: a, address: b } : { name: a, address: a }; }) })} />
            </div>
          </Section>

          <Section title={t('Выпуски')} icon="news">
            {releases.length === 0 && <span className="muted">{t('Ещё ничего не залито.')}</span>}
            <div className="rel-list">
              {releases.map((r) => <ReleaseRow key={r.id} r={r} t={t} lang={lang} toast={toast} reload={() => { loadReleases(); refreshPack(); }} />)}
            </div>
          </Section>

          <Section title={t('Ранний доступ')} icon="star">
            <EarlyAccess t={t} toast={toast} refreshPack={refreshPack} />
          </Section>

          <Section title={t('Новости')} icon="news" right={<button className="btn sm ghost" onClick={loadNews}><Icon name="refresh" size={12} /></button>}>
            <p className="muted small">{t('Скрыть, исправить или удалить запись в новостях. Сама сборка при этом не меняется.')}</p>
            {news.filter((x) => !x.deleted).length === 0 && <span className="muted">{t('Новостей нет.')}</span>}
            <div className="rel-list">
              {news.filter((x) => !x.deleted).map((x) => <NewsRow key={x.version} n={x} t={t} lang={lang} toast={toast} reload={() => { loadNews(); refreshPack(); }} />)}
            </div>
            {news.some((x) => x.deleted) && (
              <button className="link-btn small" onClick={async () => { try { await call('pack:setNews', { restoreAll: true }); toast(t('Удалённые новости возвращены'), 'ok'); loadNews(); refreshPack(); } catch (e) { toast(e.message, 'error'); } }}>
                {t('Вернуть удалённые')} ({news.filter((x) => x.deleted).length})
              </button>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
