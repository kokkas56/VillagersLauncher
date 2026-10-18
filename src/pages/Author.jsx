import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, fmtBytes, fmtDate } from '../lib/api.js';
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

export default function Author() {
  const { t, lang, settings, saveSettings, progress, toast, refreshPack } = useApp();
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState('');
  const [changes, setChanges] = useState(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [releases, setReleases] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const optional = new Set(settings.authorOptional || []);

  const loadReleases = () => call('pack:releases').then(setReleases).catch(() => {});
  const scan = async () => {
    setLoading(true);
    try { setChanges(await call('pack:changes')); } catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  };
  useEffect(() => {
    call('pack:hasToken').then(setHasToken);
    scan();
    loadReleases();
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
    if (!title.trim()) { toast(t('Напиши заголовок обновления'), 'warn'); return; }
    setPublishing(true);
    try {
      const r = await call('pack:publish', { title: title.trim(), text: text.trim() });
      toast(`${t('Сборка')} #${r.version} ${t('залита!')} ${t('Загружено файлов')}: ${r.uploaded}, ${t('с Modrinth')}: ${r.fromModrinth}`, 'ok', 9000);
      setTitle(''); setText('');
      await scan();
      loadReleases();
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
      {progress && <Progress p={progress} />}

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
                <label>{t('Заголовок')}<input className="input" placeholder={t('Например: Жители строят теплицы')} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                <label>{t('Что нового (увидят все в новостях)')}<textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Коротко опиши изменения…')} /></label>
                <button className={'btn primary big' + (publishing ? ' busy' : '')} disabled={publishing || !changes} onClick={publish}>
                  <Icon name="rocket" /> {publishing ? t('Заливаю…') : n || optChanged ? `${t('Залить сборку')} (${n})` : t('Опубликовать только новость')}
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
              {releases.map((r) => (
                <div key={r.id} className={'rel' + (r.latest ? ' on' : '')}>
                  <b>#{r.version}</b>
                  <span className="grow">{r.name.replace(/^#\d+\s*/, '')}</span>
                  <span className="muted small">{fmtDate(r.date, lang)}</span>
                  {r.latest ? <span className="pill green sm">{t('у всех')}</span> : (
                    <button className="btn sm" onClick={async () => { await call('pack:makeLatest', r.id); toast(t('Теперь у всех сборка') + ' #' + r.version, 'ok'); loadReleases(); refreshPack(); }}>{t('Откатить всех сюда')}</button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
