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
        <button className="btn sm ghost" title={t('Сделать снова ранним доступом: скачать смогут только с кодом, у кого уже скачано — играют')} onClick={() => { if (window.confirm(t('Закрыть') + ' #' + r.version + ' ' + t('в ранний доступ? Файлы этой версии зашифруются, открытая версия пропадёт из списка (её файлы останутся для новых версий). У кого она уже скачана — продолжат играть. Чтобы без кода нельзя было скачать и старые версии — включи «Закрыть открытые версии» в разделе «Ранний доступ».'))) act(() => call('pack:closeToEarly', r.tag), t('Версия') + ' #' + r.version + ' ' + t('теперь в раннем доступе')); }}><Icon name="lock" size={12} /> {t('В ранний доступ')}</button>
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
  const act = async (d, ok) => { try { await call('pack:setNews', { version: n.version, post: n.post || undefined, ...d }); if (ok) toast(ok, 'ok'); reload(); } catch (e) { toast(e.message, 'error', 8000); } };
  return (
    <div className={'rel news-row' + (n.hidden ? ' hidden-rel' : '')}>
      {n.post ? <span className="pill sm" title={t('Новость без новой версии сборки')}>{t('новость')}</span> : <b>#{n.version}</b>}
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
            ? <button className="btn sm danger" onClick={() => { setSure(false); act({ deleted: true }, t('Новость удалена') + (n.post ? '' : ' #' + n.version)); }}>{t('Точно удалить?')}</button>
            : <button className="btn sm danger" title={t('Удалить новость (сборка останется)')} onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}><Icon name="trash" size={12} /></button>}
        </div>
      )}
    </div>
  );
}

// ранний доступ: зашифрованные выпуски на GitHub и коды (месяц / версия / друг)
function EarlyAccess({ t, toast, refreshPack }) {
  const [cfg, setCfg] = useState(null);
  const [au, setAu] = useState(null);
  const [rels, setRels] = useState([]);
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const [imp, setImp] = useState('');
  const [sure, setSure] = useState(false);
  const [delSure, setDelSure] = useState(null);
  const err = (e) => toast(e.message, 'error', 9000);
  const copy = (code, what) => { if (!code) return; navigator.clipboard.writeText(code); toast(what + ' ' + t('скопирован'), 'ok'); };
  const [loadErr, setLoadErr] = useState(null);
  const load = async () => {
    setLoadErr(null);
    try { setCfg(await call('early:config')); } catch (e) { setCfg({}); setLoadErr(e.message); }
    try { setAu(await call('early:author')); } catch (e) { setAu({ hasMaster: false, masters: [] }); setLoadErr(e.message); }
    try { setRels(await call('early:authorReleases')); } catch (_) { setRels([]); }
  };
  useEffect(() => { load(); }, []);
  if (!cfg || !au) return <span className="muted">{t('Загружаю…')}</span>;
  return (
    <div className="form">
      {loadErr && <div className="row"><span className="muted small grow">{t('Не всё загрузилось')}: {loadErr}</span><button className="btn sm ghost" onClick={load}><Icon name="refresh" size={12} /></button></div>}
      <p className="muted small">{t('Ранние версии лежат на GitHub зашифрованными — открыть их можно только кодом. Код месяца даёт все ранние версии, вышедшие в этом месяце (остаются навсегда), код версии — одну версию, код друга — всё. Коды кладёшь в закрытые посты Boosty или отдаёшь друзьям; игрок вводит код в «Настройки → Сборка».')}</p>
      <label>{t('Ссылка на Boosty')}<input className="input mono" placeholder="https://boosty.to/…" value={cfg.boosty || ''} onChange={(e) => setCfg({ ...cfg, boosty: e.target.value })} /></label>
      <button className="btn sm" onClick={async () => { try { await call('early:setConfig', { boosty: (cfg.boosty || '').trim(), enabled: true }); toast(t('Сохранено'), 'ok'); } catch (e) { err(e); } }}>{t('Сохранить')}</button>

      <label className="check-row">
        <input type="checkbox" checked={!!cfg.publicClosed} onChange={async (e) => {
          const v = e.target.checked;
          if (v && !window.confirm(t('Закрыть открытые версии? Новые игроки не смогут скачать сборку без кода раннего доступа. У кого сборка уже скачана — продолжат играть своей версией.'))) return;
          try { await call('early:setConfig', { publicClosed: v }); setCfg({ ...cfg, publicClosed: v }); toast(v ? t('Открытые версии закрыты: скачать можно только с ранним доступом') : t('Открытые версии снова доступны всем'), 'ok', 7000); } catch (er) { err(er); }
        }} />
        <span><b>{t('Закрыть открытые версии')}</b> — {t('без раннего доступа сборку не скачать и не обновить; у кого уже скачано — играют как есть. Лаунчеры заметят в течение 5 минут.')}</span>
      </label>

      <h4>{t('Мастер-ключ')}</h4>
      {!au.hasMaster ? (
        <>
          <p className="muted small">{t('Мастер-ключ создаётся один раз. Им шифруются ранние версии, из него получаются коды. Храни его копию (это и есть «код друга») — без него не открыть ранние версии на другом компьютере.')}</p>
          <button className="btn sm primary" onClick={async () => { try { await call('early:newMaster'); load(); } catch (e) { err(e); } }}>{t('Создать мастер-ключ')}</button>
        </>
      ) : (
        <div className="row wrap">
          <span className="pill sm green">{t('есть')} · {au.masterId}</span>
          <button className="btn sm" onClick={async () => copy(await call('early:friendCode'), t('Код друга'))}><Icon name="copy" size={12} /> {t('Код друга (всё, навсегда)')}</button>
          {sure
            ? <button className="btn sm danger" onClick={async () => { setSure(false); try { await call('early:newMaster'); toast(t('Новый мастер-ключ: следующие версии — только по новым кодам. Старые коды друзей открывают только старые версии.'), 'ok', 12000); load(); } catch (e) { err(e); } }}>{t('Точно сменить?')}</button>
            : <button className="btn sm ghost" title={t('Если код друга утёк: следующие версии будут под новым ключом')} onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}>{t('Сменить (утёк)')}</button>}
        </div>
      )}
      <div className="row">
        <input className="input sm mono grow" placeholder={t('VKF-… — мастер-ключ с другого компьютера')} value={imp} onChange={(e) => setImp(e.target.value)} />
        <button className="btn sm" disabled={!imp.trim()} onClick={async () => { try { await call('early:importMaster', imp.trim()); setImp(''); toast(t('Мастер-ключ добавлен'), 'ok'); load(); } catch (e) { err(e); } }}>{t('Добавить')}</button>
      </div>

      {au.hasMaster && (
        <>
          <h4>{t('Коды')}</h4>
          <div className="row wrap">
            <input className="input sm" type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
            <button className="btn sm primary" onClick={async () => copy(await call('early:monthCode', ym), t('Код месяца'))}><Icon name="copy" size={12} /> {t('Код месяца (подписка)')}</button>
          </div>
          <small className="muted">{t('Код месяца открывает все ранние версии, выпущенные в этом месяце. Клади его в закрытый пост подписочного уровня в начале месяца.')}</small>
        </>
      )}

      <h4>{t('Ранние выпуски')}</h4>
      {rels.length === 0 && <span className="muted small">{t('Пока нет. Отметь «Ранний доступ» при заливке сборки.')}</span>}
      <div className="rel-list">
        {rels.sort((a, b) => b.version - a.version).map((r) => (
          <div key={r.tag} className={'rel' + (r.hidden ? ' hidden-rel' : '')}>
            <b>#{r.version}</b>
            <span className="grow">{r.title || ''} <span className="muted small">{r.month}</span></span>
            {r.hidden ? <span className="pill sm green">{t('открыт всем')}</span> : (
              <>
                <button className="btn sm ghost" title={t('Код этой версии (разовый донат)')} onClick={async () => copy(await call('early:versionCode', r.tag), t('Код версии'))}><Icon name="copy" size={12} /> {t('код версии')}</button>
                <input className="input sm" type="date" value={r.freeAt || ''} title={t('Когда открыть всем')} onChange={async (e) => { try { await call('early:freeAt', { tag: r.tag, freeAt: e.target.value || null }); load(); } catch (er) { err(er); } }} />
                <button className="btn sm" onClick={async () => { try { await call('early:open', r.tag); toast(t('Выпуск открыт для всех') + ' #' + r.version, 'ok'); load(); refreshPack(); } catch (e) { err(e); } }}>{t('Открыть всем')}</button>
                {delSure === r.tag
                  ? <button className="btn sm danger" onClick={async () => { setDelSure(null); try { await call('early:delete', r.tag); toast(t('Ранний выпуск удалён') + ' #' + r.version, 'ok'); load(); refreshPack(); } catch (e) { err(e); } }}>{t('Точно удалить?')}</button>
                  : <button className="btn sm danger" title={t('Отменить ранний выпуск (удалить)')} onClick={() => { setDelSure(r.tag); setTimeout(() => setDelSure(null), 4000); }}><Icon name="trash" size={12} /></button>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Каталог серверов: автор вставляет ключ сервера игрока — сервер появляется у всех во вкладке «Сервера»
function ServerCatalog({ t, toast }) {
  const [list, setList] = useState(null);
  const empty = { key: '', name: '', desc: '', image: '', tags: '', owner: '', ad: false, hidden: false, order: 0 };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const load = () => call('catalog:author').then(setList).catch((e) => { setList([]); toast(e.message, 'error'); });
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const onKey = async (v) => {
    setForm((f) => ({ ...f, key: v }));
    try { const k = await call('hosting:parseKey', v); setForm((f) => ({ ...f, name: f.name || k.name })); } catch (_) {}
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = { ...form, tags: String(form.tags || '').split(',').map((x) => x.trim()).filter(Boolean), order: Number(form.order) || 0 };
      setList(await call('catalog:save', entry));
      setForm(empty);
      toast(t('Сохранено — сервер виден у всех во вкладке «Сервера» (через минуту)'), 'ok');
    } catch (err) { toast(err.message, 'error', 8000); } finally { setBusy(false); }
  };
  const edit = (x) => setForm({ ...x, tags: (x.tags || []).join(', ') });
  const remove = async (x) => { if (!window.confirm(t('Убрать сервер из каталога?'))) return; try { setList(await call('catalog:remove', x.id)); } catch (err) { toast(err.message, 'error'); } };
  const toggle = async (x, k) => { try { setList(await call('catalog:save', { ...x, [k]: !x[k] })); } catch (err) { toast(err.message, 'error'); } };
  return (
    <>
      <p className="muted small">{t('Игрок открывает «Мой сервер» в своём лаунчере и присылает тебе ключ (VKS1-…). Вставь его здесь — сервер появится у всех во вкладке «Сервера» с описанием и статусом «в сети». Работает, пока сервер включён у хозяина.')}</p>
      <div className="rel-list">
        {list && list.length === 0 && <span className="muted">{t('В каталоге пока нет серверов.')}</span>}
        {(list || []).map((x) => (
          <div key={x.id} className="rel-row">
            <div className="grow"><b>{x.name}</b> {x.ad && <span className="pill gold sm">{t('Реклама')}</span>} {x.hidden && <span className="pill sm">{t('скрыт')}</span>}<br /><small className="muted">{x.owner ? x.owner + ' · ' : ''}{(x.desc || '').slice(0, 90)}</small></div>
            <button className="btn sm ghost" onClick={() => toggle(x, 'ad')}>{x.ad ? t('Не реклама') : t('Реклама')}</button>
            <button className="btn sm ghost" onClick={() => toggle(x, 'hidden')}>{x.hidden ? t('Показать') : t('Скрыть')}</button>
            <button className="btn sm ghost" onClick={() => edit(x)}><Icon name="pencil" size={12} /></button>
            <button className="btn sm danger" onClick={() => remove(x)}><Icon name="trash" size={12} /></button>
          </div>
        ))}
      </div>
      <form className="form" onSubmit={save} style={{ marginTop: 10 }}>
        <label>{t('Ключ сервера')}<input className="input mono" placeholder="VKS1-…" value={form.key} onChange={(e) => onKey(e.target.value)} /></label>
        <div className="row wrap">
          <label className="grow">{t('Название')}<input className="input" value={form.name} onChange={set('name')} /></label>
          <label>{t('Хозяин')}<input className="input" value={form.owner} onChange={set('owner')} /></label>
        </div>
        <label>{t('Описание')}<textarea className="input" rows={3} value={form.desc} onChange={set('desc')} /></label>
        <div className="row wrap">
          <label className="grow">{t('Картинка (ссылка)')}<input className="input" placeholder="https://…png" value={form.image} onChange={set('image')} /></label>
          <label>{t('Метки через запятую')}<input className="input" placeholder={t('выживание, без гриферов')} value={form.tags} onChange={set('tags')} /></label>
          <label>{t('Порядок')}<input className="input num" type="number" value={form.order} onChange={set('order')} /></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={!!form.ad} onChange={set('ad')} /> <span>{t('Реклама — показывать первым с пометкой')}</span></label>
        <button className="btn primary" disabled={busy || !form.key}>{busy ? t('Сохраняю…') : t('Сохранить в каталог')}</button>
      </form>
    </>
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
  const [earlyTarget, setEarlyTarget] = useState('');
  const [earlyOpen, setEarlyOpen] = useState([]);
  useEffect(() => { if (earlyOn) call('early:authorReleases').then((l) => setEarlyOpen((l || []).filter((r) => !r.hidden).sort((a, b) => b.version - a.version))).catch(() => {}); }, [earlyOn]);
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
    if (noNews && !n && !optChanged && !earlyOn) { toast(t('Нечего заливать: изменений нет, а новость выключена'), 'warn'); return; }
    setPublishing(true);
    try {
      const r = await call('pack:publish', { title: title.trim(), text: text.trim(), noNews, early: earlyOn, freeAt: earlyOn ? freeAt : null, replaceTag: earlyOn && earlyTarget ? earlyTarget : null });
      if (r.newsOnly) {
        toast(t(r.message || 'Изменений в файлах нет — новость опубликована без новой версии'), 'ok', 9000);
        setTitle(''); setText('');
        loadNews();
        refreshPack();
        return;
      }
      if (r.newsWarn) toast(r.newsWarn, 'warn', 10000);
      toast(`${t('Сборка')} #${r.version} ${t('залита!')} ${t('Загружено файлов')}: ${r.uploaded}, ${t('с Modrinth')}: ${r.fromModrinth}` + (r.healed ? ` · ${t('восстановлено пропавших')}: ${r.healed}` : ''), 'ok', 9000);
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
        <div>
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

        {changes && changes.topLevel && (settings.packMode || 'full') === 'full' && (
          <Section title={t('Что уходит в сборку')} icon="folder" right={<span className="muted small">{t('вся папка игры, кроме личного')}</span>}>
            <p className="muted small">{t('Игроки получают всё, что отмечено. Сняв галочку, папка или файл перестанут уходить в сборку. Minecraft, NeoForge и Java лаунчер ставит сам, поэтому versions, libraries и assets не нужны. Клавиши и графика (options.txt и т.п.) кладутся новичку один раз и дальше у каждого свои.')}</p>
            <div className="pack-top">
              {changes.topLevel.map((d) => {
                const pat = d.name;
                const excl = settings.packExclude || [];
                const on = d.included;
                const toggle = () => {
                  const next = on ? [...excl, pat] : excl.filter((x) => x !== pat && x !== pat.replace(/\/$/, ''));
                  saveSettings({ packExclude: next }).then(scan);
                };
                return (
                  <label key={d.name} className={'pack-top-row' + (on ? '' : ' off')} title={!on && d.excludedBy === 'ignore' ? t('Скрыто масками «Не отправлять»') : ''}>
                    <input type="checkbox" checked={on} disabled={!on && d.excludedBy === 'ignore'} onChange={toggle} />
                    <Icon name={d.dir ? 'folder' : 'news'} size={12} />
                    <span className="mono grow">{d.name}</span>
                    <span className="muted small">{on ? `${d.files} · ${fmtBytes(d.size)}` : t('не уходит')}</span>
                  </label>
                );
              })}
            </div>
          </Section>
        )}
        </div>

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
                {earlyOn && earlyOpen.length > 0 && (
                  <label>{t('Куда')}
                    <select className="input" value={earlyTarget} onChange={(e) => setEarlyTarget(e.target.value)}>
                      <option value="">{t('Новый ранний выпуск')}</option>
                      {earlyOpen.map((r) => <option key={r.tag} value={r.tag}>{t('Дополнить ранний')} #{r.version}{r.title ? ' — ' + r.title : ''}</option>)}
                    </select>
                  </label>
                )}
                {earlyOn && earlyTarget && <small className="muted">{t('Изменения добавятся в этот же выпуск: тот же номер, те же коды. У поддержавших он просто обновится.')}</small>}
                {earlyOn && <label>{t('Открыть всем')}<input className="input" type="date" value={freeAt} onChange={(e) => setFreeAt(e.target.value)} /></label>}
                <label>{t('Заголовок')}<input className="input" placeholder={noNews ? t('Необязательно — увидишь только ты') : t('Например: Жители строят теплицы')} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                {!noNews && <label>{t('Что нового (увидят все в новостях)')}<textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Коротко опиши изменения…')} /></label>}
                {noNews && <small className="muted">{t('Сборка обновится у всех, но в новостях записи не будет. Потом её можно показать в списке «Новости» ниже.')}</small>}
                {changes && !n && !optChanged && !earlyOn && !noNews && <small className="muted">{t('Изменений в файлах нет — уйдёт только новость, новой версии сборки не будет (игрокам ничего не скачивать).')}</small>}
                <button className={'btn primary big' + (publishing ? ' busy' : '')} disabled={publishing || !changes} onClick={publish}>
                  <Icon name="rocket" /> {publishing ? t('Заливаю…') : n || optChanged || earlyOn ? `${t('Залить сборку')} (${n})${noNews ? ' ' + t('без новости') : ''}` : t('Опубликовать только новость')}
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
            <div className="field"><span>{t('Что заливать')}</span>
              <div className="seg">
                <button className={(settings.packMode || 'full') === 'full' ? 'on' : ''} onClick={() => saveSettings({ packMode: 'full' }).then(scan)}>{t('Всю папку игры')}</button>
                <button className={settings.packMode === 'dirs' ? 'on' : ''} onClick={() => saveSettings({ packMode: 'dirs' }).then(scan)}>{t('Только выбранные папки')}</button>
              </div>
            </div>
            {settings.packMode === 'dirs' && <div className="field"><span>{t('Папки в сборке')}</span><input className="input mono" value={settings.syncDirs.join(', ')} onChange={(e) => saveSettings({ syncDirs: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>}
            <div className="field"><span>{t('Личные настройки (новичку один раз, потом у каждого свои)')}</span><textarea className="input mono" rows={3} value={(settings.seedFiles || []).join('\n')} onChange={(e) => saveSettings({ seedFiles: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></div>
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

          <Section title={t('Сервера игроков в лаунчере')} icon="globe">
            <ServerCatalog t={t} toast={toast} />
          </Section>

          <Section title={t('Новости')} icon="news" right={<button className="btn sm ghost" onClick={loadNews}><Icon name="refresh" size={12} /></button>}>
            <p className="muted small">{t('Скрыть, исправить или удалить запись в новостях. Сама сборка при этом не меняется.')}</p>
            {news.filter((x) => !x.deleted).length === 0 && <span className="muted">{t('Новостей нет.')}</span>}
            <div className="rel-list">
              {news.filter((x) => !x.deleted).map((x) => <NewsRow key={x.post || x.version} n={x} t={t} lang={lang} toast={toast} reload={() => { loadNews(); refreshPack(); }} />)}
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
