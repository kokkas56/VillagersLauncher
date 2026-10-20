// Фаза 6 (трек A) в окне Студии: «Запекание и видео» и «Переход» в атрибутах сцены, палитра «Эффекты» (вкладка «Создать»),
// «▶ Показать в игре» у эффекта, список «Видео проекта», запекание перед «Собрать».
// Сообщения игры: {t:'sceneBake', id, state:'loading'|'done'|'error', …}, {t:'video', id, state:'start'|'progress'|'done'|'error'|'cancelled', …},
// {t:'videoServer', state:'error', error}, {t:'result', op:'fxPreview'|'videoPlay'|'transitionTest', ok, error?}.
import React, { useEffect, useMemo, useState } from 'react';
import { call, on } from '../../lib/api.js';
import { useStudio } from './core.jsx';
import I from './icons.jsx';
import { Sec, ARow, Check, Select, Num } from './Attributes.jsx';
import { normalizeScene } from '../validate.js';
import { Field, selToPos } from '../fields.jsx';
import {
  FX_LIB, FX_GROUPS, GESTURES, GESTURE_HINT, ANIM_NAMES, fxNewEvent, sceneBakeHash, videoOpts, videoEstimate, fmtSize, VIDEO_QUALITIES, VIDEO_FPS,
  TRANSITION_DEFAULT
} from '../fxlib.js';
import { fmtTicks } from '../model.js';
import { learnMark } from '../learn/index.jsx';
import './cine.css';

// ---------------- общее состояние (одно на окно) ----------------
const store = { info: null, bake: {}, rec: null, waits: [], subs: new Set(), hooked: false };
const emit = () => store.subs.forEach((f) => f());
function hook() {
  if (store.hooked) return;
  store.hooked = true;
  on('studio-link', (d) => {
    const m = d && d.msg;
    if (!m || typeof m !== 'object') return;
    if (m.t === 'sceneBake') {
      store.bake = { ...store.bake, [m.id]: { ...m, at: Date.now() } };
      if (m.state === 'done' && m.bake && !m.file) call('studio:bakeSave', { id: m.id, bake: m.bake }).then(refreshInfo).catch(() => {});
      else if (m.state !== 'loading') refreshInfo();
    } else if (m.t === 'video') {
      store.rec = { ...(store.rec || {}), ...m, at: Date.now() };
      if (m.state === 'done' || m.state === 'error' || m.state === 'cancelled') refreshInfo();
    } else if (m.t === 'videoServer' && m.state === 'error') {
      store.rec = { ...(store.rec || {}), state: 'error', error: m.error, at: Date.now() };
    } else return;
    const w = store.waits.filter((x) => x.pred(m));
    store.waits = store.waits.filter((x) => !x.pred(m));
    w.forEach((x) => { clearTimeout(x.timer); x.resolve(m); });
    emit();
  });
}
export function refreshInfo() {
  return call('studio:cineInfo').then((i) => { store.info = i; emit(); return i; }).catch(() => null);
}
function waitFor(pred, ms) {
  return new Promise((resolve, reject) => {
    const w = { pred, resolve };
    w.timer = setTimeout(() => { store.waits = store.waits.filter((x) => x !== w); reject(new Error('Игра не ответила за ' + Math.round(ms / 1000) + ' с')); }, ms);
    store.waits.push(w);
  });
}
export function useCine() {
  const [, force] = useState(0);
  useEffect(() => {
    hook();
    const f = () => force((n) => n + 1);
    store.subs.add(f);
    if (!store.info) refreshInfo();
    return () => store.subs.delete(f);
  }, []);
  return store;
}

// запечь сцену (сцена — как в редакторе): ждём ответ игры до 60 с (игра сначала грузит чанки)
export async function bakeScene(core, scene) {
  hook();
  const s = normalizeScene(scene);
  store.bake = { ...store.bake, [s.id]: { state: 'sent', at: Date.now() } };
  emit();
  const p = waitFor((m) => m.t === 'sceneBake' && m.id === s.id && m.state !== 'loading', 60000);
  await call('studio:send', { t: 'sceneBake', id: s.id, scene: s });
  const r = await p;
  if (r.state === 'error' || r.ok === false) throw new Error(r.error || 'не запеклось');
  return r;
}

// записать видео сцены (открытой — как в редакторе, иначе — с диска); настройки — options.video сцены
export async function recordScene(core, id) {
  hook();
  const raw = core.scene && core.scene.id === id ? (await core.flush(), core.sceneRef.current) : await call('studio:read', id);
  if (!raw) throw new Error('Нет сцены «' + id + '»');
  const o = videoOpts(raw);
  store.rec = { id, state: 'sent', at: Date.now() };
  emit();
  try {
    await call('studio:send', { t: 'videoRecord', id, project: core.projectId, scene: normalizeScene({ ...raw, id }), quality: { h: o.quality, fps: o.fps, jpeg: o.jpeg } });
  } catch (e) { store.rec = null; emit(); throw e; }
  learnMark('cineRecord');
  core.addLog('info', 'Запись видео «' + id + '»: ' + o.quality + 'p, ' + o.fps + ' к/с — игра замедлит время и сыграет сцену');
}
function RecLine({ rec }) {
  const live = ['start', 'progress', 'sent'].includes(rec.state);
  const pct = rec.frames ? Math.min(100, Math.round(((rec.written || rec.frame || 0) / rec.frames) * 100)) : 0;
  return (
    <div className={'cine-rec ' + rec.state}>
      {live ? <><div className="bar"><i style={{ width: pct + '%' }} /></div><span>{rec.state === 'sent' ? 'жду игру…' : 'кадр ' + (rec.frame || 0) + ' из ' + (rec.frames || '?') + ' · ' + fmtSize(rec.bytes || 0) + (rec.waiting ? ' · жду мир/кодирование' : '')}</span></>
        : rec.state === 'done' ? <span>Записано: {rec.frames} кадров, {fmtSize(rec.bytes)}{rec.dupes ? ', повторов ' + rec.dupes : ''}{rec.upscaled ? ' · окно игры меньше кадра — растянуто' : ''}</span>
          : <span>{rec.state === 'cancelled' ? 'Запись отменена' : 'Ошибка'}{rec.error ? ': ' + rec.error : ''}</span>}
    </div>
  );
}

// перед «Собрать»: запечь устаревшие сцены (флаг «Запекать при сборке»), если игра на связи
export async function cinePrebuild(core) {
  const info = await refreshInfo();
  const res = { baked: [], failed: [], skipped: [], offline: false };
  if (!info) return res;
  const need = info.scenes.filter((x) => !x.broken && x.bakeOnBuild && !x.anchored && !(x.bake && x.bake.fresh));
  if (!need.length) return res;
  if (!core.link.connected) { res.offline = true; res.skipped = need.map((x) => x.id); return res; }
  for (const x of need) {
    try {
      const raw = core.scene && core.scene.id === x.id ? core.sceneRef.current : await call('studio:read', x.id);
      core.addLog('info', 'Собрать: запекаю сцену «' + (x.title || x.id) + '»…');
      await bakeScene(core, { ...raw, id: x.id });
      res.baked.push(x.id);
    } catch (e) { res.failed.push({ id: x.id, error: e.message }); }
  }
  await refreshInfo();
  return res;
}

export function CineReport({ report }) {
  const pre = report && report.pre;
  const c = report && report.cine;
  if (!pre && !c) return null;
  return (
    <div className="cine-report">
      {pre && pre.baked.length > 0 && <p><I name="bake" size={12} /> Запечено перед сборкой: <b>{pre.baked.length}</b> ({pre.baked.join(', ')}).</p>}
      {pre && pre.offline && <p className="dim">Запекание пропущено — нет связи с игрой. Эти сцены сыграют вживую: {pre.skipped.join(', ')}.</p>}
      {pre && pre.failed.map((f) => <p key={f.id} className="warn">Сцена «{f.id}» не запеклась: {f.error}</p>)}
      {c && <p><I name="film" size={12} /> Запеканий в сборке: <b>{c.bakes}</b>; видео для игроков: <b>{c.videos}</b>{c.videos ? ' (' + fmtSize(c.videoBytes) + ')' : ''}.</p>}
    </div>
  );
}

// ---------------- атрибуты сцены: «Запекание и видео», «Переход» ----------------
export function CineSceneSec() {
  const core = useStudio();
  const st = useCine();
  const s = core.scene;
  const { hp } = core;
  const gameScene = useMemo(() => { try { return normalizeScene(s); } catch (_) { return null; } }, [s]);
  const hash = useMemo(() => (gameScene ? sceneBakeHash(gameScene) : null), [gameScene]);
  const item = st.info && st.info.scenes.find((x) => x.id === s.id);
  const bk = item && item.bake;
  const bstate = st.bake[s.id];
  const anchored = !!(s.world && (s.world.anchor || s.world.origin));
  const bakeFresh = bk && bk.exists && bk.hash === hash;
  const opts = videoOpts(s);
  const est = videoEstimate(s.length, opts.quality, opts.fps, opts.jpeg);
  const vid = item && item.vid;
  const vidFresh = vid && vid.hash === hash;
  const rec = st.rec && st.rec.id === s.id ? st.rec : null;
  const recording = rec && ['start', 'progress', 'sent'].includes(rec.state);
  const setOpt = (patch, key) => core.edit((sc) => ({ ...sc, options: { ...(sc.options || {}), ...patch } }), { key });
  const setVideo = (patch) => setOpt({ video: { ...videoOpts(core.sceneRef.current), ...((core.sceneRef.current.options || {}).video || {}), ...patch } }, 'video:' + Object.keys(patch).join(','));
  const bake = async () => {
    try { await core.flush(); const r = await bakeScene(core, core.sceneRef.current); core.toast('Сцена запечена' + (r.stats ? ': камера ' + r.stats.camSamples + ' т., чанков ' + r.stats.chunks : ''), 'ok', 3500); core.addLog('ok', 'Запекание «' + s.id + '» готово' + (r.partial ? ' (не все чанки загрузились)' : '')); learnMark('cineBake'); } catch (e) { core.toast('Запекание: ' + e.message, 'error', 7000); core.addLog('error', 'Запекание «' + s.id + '»: ' + e.message); }
  };
  const record = async () => {
    if (vid && !window.confirm('У сцены уже есть видео (' + fmtSize(vid.bytes) + '). Записать заново? Старое заменится.')) return;
    try { await recordScene(core, s.id); } catch (e) { core.toast(e.message, 'error'); }
  };
  const del = async () => {
    if (!window.confirm('Удалить видео сцены «' + (s.title || s.id) + '» (' + fmtSize(vid.bytes) + ')? Игра будет играть сцену вживую.')) return;
    try { const r = await call('studio:videoDelete', s.id); core.toast('Видео удалено, освобождено ' + fmtSize(r.freed), 'ok'); refreshInfo(); } catch (e) { core.toast(e.message, 'error'); }
  };
  const tr = { ...TRANSITION_DEFAULT, ...((s.options || {}).transition || {}) };
  const setTr = (patch) => setOpt({ transition: { ...TRANSITION_DEFAULT, ...((core.sceneRef.current.options || {}).transition || {}), ...patch } }, 'tr:' + Object.keys(patch).join(','));
  // включили переход без места — подставим, куда игрок смотрит в игре (дальше поправишь)
  const trOn = async (v) => {
    setTr({ on: v });
    if (!v || (tr.to && Array.isArray(tr.to.pos)) || !core.link.connected) return;
    try { const r = await call('studio:getView'); if (r && Array.isArray(r.pos)) setTr({ on: true, to: { ...tr.to, pos: r.pos.map((x) => Math.round(x * 10) / 10), yaw: Math.round(r.yaw || 0) } }); } catch (_) {}
  };
  return (
    <>
      <Sec title="Запекание и видео">
        <div className="c4-ahint"><b>Запечь</b> — один раз рассчитать всё, что нужно сцене: путь камеры по тикам, шаги актёров по земле, чанки. Тогда сцена у игроков начинается быстрее и идёт ровно. <b>Видео</b> — записать сцену кадрами: у кого есть видео, тот видит его, остальные — живую сцену.</div>
        <ARow label="Запекание" learnKey="cine-bake" hint="Свежая — запекание совпадает со сценой. Устарела — камеру, актёров или длину меняли: сцена играет вживую, пока не запечёшь снова.">
          <div className="cine-row">
            <span className={'cine-chip ' + (anchored ? 'off' : bakeFresh ? 'ok' : bk && bk.exists ? 'warn' : 'off')}>{anchored ? 'с якорем — не запекается' : bakeFresh ? 'свежая' : bk && bk.exists ? 'устарела' : 'нет'}</span>
            <button className="c4-btn sm" data-learn="cine-bake-btn" disabled={!core.link.connected || anchored || (bstate && ['sent', 'loading'].includes(bstate.state))} onClick={bake} {...hp(core.link.connected ? 'Запечь сцену в игре: игра загрузит чанки по пути камеры и актёров, рассчитает всё и запишет scenes/' + s.id + '.bake.json.' : 'Нужна связь с игрой (мир проекта открыт).')}>
              <I name="bake" size={12} /> {bstate && bstate.state === 'loading' ? 'Гружу чанки (' + (bstate.chunks || 0) + ')…' : bstate && bstate.state === 'sent' ? 'Запекаю…' : 'Запечь'}
            </button>
          </div>
        </ARow>
        {bk && bk.exists && bk.stats && <div className="c4-ahint">{[
          'камера: ' + (bk.stats.camSamples || 0) + ' т.' + (bk.stats.camCleared ? ' (из стен вынуто ' + bk.stats.camCleared + ')' : ''),
          bk.stats.walkTicks ? 'шаги актёров: ' + bk.stats.walkTicks + ' т.' + (bk.stats.snapped ? ', на землю поставлено ' + bk.stats.snapped : '') : null,
          'чанков: ' + (bk.stats.chunks || 0),
          bk.bytes ? fmtSize(bk.bytes) : null,
          bk.partial ? 'не все чанки загрузились' : null
        ].filter(Boolean).join(' · ')}</div>}
        <ARow label="При «Собрать»" hint="Запекать сцену автоматически, когда собираешь проект (если запекание устарело и игра на связи).">
          <Check value={(s.options || {}).bakeOnBuild !== false} onChange={(v) => setOpt({ bakeOnBuild: v }, 'bakeOnBuild')} />
        </ARow>
        <div className="cine-sep">Видео</div>
        <ARow label="Качество" learnKey="cine-quality" hint="Высота кадра. Чем выше — тем чётче и тем больше файл. 720p — хороший выбор.">
          <Select value={String(opts.quality)} options={VIDEO_QUALITIES.map(([v, l]) => [String(v), l])} onChange={(v) => setVideo({ quality: Number(v) })} />
        </ARow>
        <ARow label="Кадров/с" hint="20 — как тики игры (меньше файл), 30 — плавнее.">
          <Select value={String(opts.fps)} options={VIDEO_FPS.map(([v, l]) => [String(v), l])} onChange={(v) => setVideo({ fps: Number(v) })} />
        </ARow>
        <ARow label="JPEG" hint="Качество сжатия кадров. 50 — заметные квадратики, 80 — хорошо, 95 — почти без потерь (файл в 2 раза больше).">
          <Num value={opts.jpeg} int min={50} max={95} step={5} onChange={(v) => setVideo({ jpeg: v })} />
        </ARow>
        <div className="c4-ahint cine-est" {...hp('Оценка до записи: кадров = длина × кадры/с ÷ 20. Настоящий размер зависит от сцены (трава и листва — больше, небо — меньше), обычно ±40 %.')}>
          ≈ <b>{fmtSize(est.bytes)}</b> · {est.frames} кадров {est.w}×{est.h} · ~{fmtSize(est.bytesPerFrame)} на кадр · {fmtSize(est.perMinute)} за минуту
        </div>
        <div className="c4-btnrow">
          {!recording ? <button className="c4-btn sm prim" data-learn="cine-record" disabled={!core.link.connected} onClick={record} {...hp(core.link.connected ? 'Записать видео: игра замедлит время, сыграет сцену и снимет каждый кадр (интерфейс не попадает). Субтитры, полосы и звук остаются живыми при показе.' : 'Нужна связь с игрой.')}><I name="record" size={12} /> Записать видео</button>
            : <button className="c4-btn sm" onClick={() => call('studio:send', { t: 'videoStop' }).catch(() => {})} {...hp('Остановить запись (записанное выбросится).')}><I name="stop" size={12} /> Стоп записи</button>}
          {vid && <button className="c4-btn sm" disabled={!core.link.connected} onClick={() => call('studio:send', { t: 'videoPlay', id: s.id, project: core.projectId }).catch((e) => core.toast(e.message, 'error'))} {...hp('Показать записанное видео в игре (поверх мира, со звуками и субтитрами сцены).')}><I name="play" size={12} /> Посмотреть</button>}
          {vid && <button className="c4-btn sm" onClick={async () => { try { const p = await call('studio:videoFolder', s.id); call('shell:openPath', p); } catch (e) { core.toast(e.message, 'error'); } }} {...hp('Папка видео этой сцены (kokkstory-videos — отдельно от файлов проекта).')}><I name="folder" size={12} /></button>}
          {vid && <button className="c4-btn sm" onClick={del} {...hp('Удалить видео сцены.')}><I name="trash" size={12} /></button>}
        </div>
        {rec && <RecLine rec={rec} />}
        {vid && <div className="c4-ahint">Записано: {vid.h}p · {vid.fps} к/с · {vid.frames} кадров · <b>{fmtSize(vid.bytes)}</b>{vid.made ? ' · ' + new Date(vid.made).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · <span className={vidFresh ? 'cine-ok' : 'cine-warn'}>{vidFresh ? 'совпадает со сценой' : 'устарело — сцену меняли, игра покажет её вживую'}</span></div>}
        <ARow label="Игрокам" learnKey="cine-ship" hint="«Отдавать игрокам». Видео лежит отдельно от проекта (папка kokkstory-videos). Только отмеченные видео «Собрать» кладёт в сборку — и они уедут игрокам. Без видео игрок видит сцену вживую.">
          <label className="cine-row"><Check value={opts.ship} onChange={(v) => setVideo({ ship: v })} /><span className="cine-cl" onClick={() => setVideo({ ship: !opts.ship })}>Отдавать игрокам</span></label>
        </ARow>
        <ARow label="Показ" hint="Если у игрока есть свежее видео сцены — показывать его вместо живой сцены. Выключи — всегда вживую.">
          <label className="cine-row"><Check value={opts.use} onChange={(v) => setVideo({ use: v })} /><span className="cine-cl" onClick={() => setVideo({ use: !opts.use })}>видео вместо живой сцены</span></label>
        </ARow>
        {st.info && <div className="c4-ahint">В сборку уйдёт видео: <b>{fmtSize(st.info.shipBytes)}</b> · всего записано: {fmtSize(st.info.allBytes)}. <a className="cine-link" onClick={() => core.openVideos && core.openVideos()}>Все видео проекта…</a></div>}
      </Sec>
      <Sec title="Переход" open={!!tr.on}>
        <div className="c4-ahint">Сцена-переход: пока она идёт (или её видео), игрока переносят в другое место или измерение, и мир там грузится за кадром. Переход кончается, когда место готово, потом картинка проявляется.</div>
        <ARow label="Переход" learnKey="cine-transition" hint="«Сцена — переход». Включи — эта сцена (где бы её ни запустили) переносит игрока в точку ниже. Есть видео — оно играет, пока мир грузится."><label className="cine-row"><Check value={!!tr.on} onChange={(v) => trOn(v)} /><span className="cine-cl" onClick={() => trOn(!tr.on)}>сцена — переход</span></label></ARow>
        {tr.on && <TransitionFields value={tr} onChange={setTr} hp={hp} core={core} />}
        {tr.on && <div className="c4-btnrow"><button className="c4-btn sm" disabled={!core.link.connected} onClick={() => call('studio:send', { t: 'transitionTest', transition: { scene: s.id, video: s.id, to: tr.to, loadWhile: tr.loadWhile, maxWait: tr.maxWait, fadeIn: tr.fadeIn } }).catch((e) => core.toast(e.message, 'error'))} {...hp('Проверить переход на себе: игра сыграет видео (или сцену) и перенесёт тебя.')}><I name="play" size={12} /> Проверить в игре</button></div>}
      </Sec>
    </>
  );
}

// поля перехода: куда (измерение, место, взгляд), грузить во время, ждать, проявление
export function TransitionFields({ value, onChange, hp, core, compact }) {
  const to = value.to || {};
  const setTo = (patch) => onChange({ to: { ...to, ...patch } });
  return (
    <>
      <ARow label="Измерение" hint="Куда переносить: обычный мир, Незер, Край или измерение мода.">
        <Select value={to.dim || 'minecraft:overworld'} options={[['minecraft:overworld', 'Обычный мир'], ['minecraft:the_nether', 'Незер'], ['minecraft:the_end', 'Край'], ...(to.dim && !['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'].includes(to.dim) ? [[to.dim, to.dim]] : [])]} onChange={(v) => setTo({ dim: v })} />
      </ARow>
      <ARow label="Место" hint="Точка, куда встанет игрок (x y z).">
        <div className="cine-row">{[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={(to.pos || [0, 64, 0])[i]} step={0.5} onChange={(n) => { const c = (to.pos || [0, 64, 0]).slice(); c[i] = n; setTo({ pos: c }); }} />)}</div>
      </ARow>
      {core && <div className="c4-btnrow"><button className="c4-btn sm" disabled={!core.link.connected} onClick={async () => { try { const p = selToPos(await core.api.getSel()); if (!p) throw new Error('В игре прицел ни на что не наведён'); const v = await core.api.getView().catch(() => null); setTo({ pos: p, dim: (core.link.info && core.link.info.dim) || to.dim, ...(v ? { yaw: Math.round(v.yaw) } : {}) }); } catch (e) { core.toast(e.message, 'error'); } }} {...(hp ? hp('Место — блок, на который смотришь в игре (и измерение, где ты сейчас).') : {})}><I name="look" size={12} /> Из игры</button></div>}
      {!compact && <ARow label="Смотреть" hint="Куда повёрнут игрок после переноса (yaw, градусы)."><Num value={to.yaw || 0} step={15} unit="°" onChange={(n) => setTo({ yaw: n })} /></ARow>}
      <ARow label="Грузить фоном" hint="Включено — игрока переносят сразу, пока идёт видео: мир грузится за кадром. Выключено — перенос после видео (экран «загрузка»)."><Check value={value.loadWhile !== false} onChange={(v) => onChange({ loadWhile: v })} /></ARow>
      <ARow label="Ждать мир, с" hint="Сколько секунд ждать, пока место загрузится, прежде чем показать как есть (по умолчанию 15)."><Num value={value.maxWait == null ? 15 : value.maxWait} min={1} max={120} step={1} unit="с" onChange={(n) => onChange({ maxWait: n })} /></ARow>
      <ARow label="Проявление" hint="За сколько тиков картинка проявляется в конце (20 = 1 с)."><Num value={value.fadeIn == null ? 20 : value.fadeIn} int min={0} max={200} unit="т" onChange={(n) => onChange({ fadeIn: n })} /></ARow>
    </>
  );
}

// ---------------- «▶ Показать в игре» у события ----------------
export function FxPreviewRow({ track, ev }) {
  const core = useStudio();
  const lib = FX_LIB[ev && ev.do];
  const gesture = ev && ev.do === 'anim' && ANIM_NAMES.includes(ev.name);
  if (!lib && !gesture) return null;
  return (
    <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
      <button className="c4-btn sm" data-learn="fx-preview" disabled={!core.link.connected} onClick={() => fxPreview(core, track, ev)} {...core.hp(core.link.connected ? 'Показать этот эффект в игре прямо сейчас: экранный — на экране, мировой — там, куда смотришь (или в своей точке), эффект существа — на том, на кого смотришь (или на тебе).' : 'Нужна связь с игрой.')}>
        <I name="play" size={12} /> Показать в игре
      </button>
      {lib && lib.group === 'screen' && <span className="dim small">виден только тебе</span>}
    </div>
  );
}
export function fxPreview(core, track, ev) {
  call('studio:send', { t: 'fxPreview', track, ev: JSON.parse(JSON.stringify(ev)) }).catch((e) => core.toast(e.message, 'error'));
  learnMark('fxPreview');
}

// ---------------- палитра «Эффекты» ----------------
const FX_ICON = {
  fade: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></>,
  vignette: <><rect x="3" y="5" width="18" height="14" rx="2" /><ellipse cx="12" cy="12" rx="6" ry="4" strokeDasharray="2 2" /></>,
  blur: <><path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 12c3-2 5 2 8 0s5-2 8 0M4 16c3-2 5 2 8 0s5-2 8 0" /></>,
  grade: <><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" /><path d="M9 15a3 3 0 0 0 3 3" /></>,
  desat: <><circle cx="12" cy="12" r="8" /><path d="M8 6l8 12M6 10l8 10M10 4l8 12" /></>,
  chroma: <><circle cx="10" cy="12" r="6" stroke="#ff7070" /><circle cx="14" cy="12" r="6" stroke="#70b0ff" /></>,
  grain: <><circle cx="6" cy="7" r="1" fill="currentColor" /><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="17" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="13" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="10" cy="19" r="1" fill="currentColor" /><circle cx="19" cy="18" r="1" fill="currentColor" /><circle cx="4" cy="17" r="1" fill="currentColor" /></>,
  slowmo: <><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" /></>,
  shake: <><rect x="7" y="6" width="10" height="12" rx="1" /><path d="M3 9l2 3-2 3M21 9l-2 3 2 3" /></>,
  zoom: <><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5M10 7v6M7 10h6" /></>,
  lightning: <path d="M13 2 5 13h6l-1 9 8-12h-6z" />,
  explosion: <path d="M12 2l2 6 5-3-2 6 5 1-5 3 3 5-6-2-2 6-2-6-6 2 3-5-5-3 5-1-2-6 5 3z" />,
  fireworks: <><path d="M12 22v-9" /><path d="M12 9V4M12 9l4-3M12 9l-4-3M12 9l5 1M12 9l-5 1" /><circle cx="12" cy="9" r="1.2" fill="currentColor" /></>,
  emitter: <><path d="M8 21h8l-1-5H9z" /><circle cx="12" cy="11" r="1" fill="currentColor" /><circle cx="9" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="12" cy="3" r="1" fill="currentColor" /></>,
  debris: <><rect x="4" y="13" width="6" height="6" transform="rotate(-12 7 16)" /><rect x="13" y="12" width="5" height="5" transform="rotate(18 15 14)" /><rect x="9" y="4" width="4" height="4" transform="rotate(30 11 6)" /></>,
  crack: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9 4l2 5-3 3 4 3-1 5M11 9l5-1M12 15l4 1" /></>,
  fill: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /><path d="M8 9l8 4" strokeDasharray="1.5 2" /></>,
  structure: <><path d="M4 11l8-6 8 6v9H4z" /><path d="M10 20v-5h4v5" /></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  loop: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  appear: <><circle cx="12" cy="7" r="3" /><path d="M7 21v-5a5 5 0 0 1 10 0v5" /><path d="M3 4l1.5 1.5M21 4l-1.5 1.5M3 13h2M19 13h2" /></>,
  vanish: <><circle cx="12" cy="7" r="3" strokeDasharray="2 2" /><path d="M7 21v-5a5 5 0 0 1 10 0v5" strokeDasharray="2 2" /></>,
  glow: <><circle cx="12" cy="7" r="3" /><path d="M7 21v-5a5 5 0 0 1 10 0v5" /><rect x="3" y="2" width="18" height="20" rx="4" strokeDasharray="3 2" /></>,
  invis: <><circle cx="12" cy="7" r="3" strokeDasharray="1 2" /><path d="M7 21v-5a5 5 0 0 1 10 0v5" strokeDasharray="1 2" /><path d="M4 4l16 16" /></>,
  levitate: <><circle cx="12" cy="6" r="2.5" /><path d="M8 15v-3a4 4 0 0 1 8 0v3" /><path d="M6 19c2-1 10-1 12 0M9 22c1-.6 5-.6 6 0" /></>,
  push: <><circle cx="8" cy="7" r="2.5" /><path d="M5 20v-5a3 3 0 0 1 6 0v5" /><path d="M14 12h7M18 9l3 3-3 3" /></>,
  potion: <><path d="M10 3h4M10 3v5l-5 8a3 3 0 0 0 3 5h8a3 3 0 0 0 3-5l-5-8V3" /><path d="M7 15h10" /></>,
  fire: <path d="M12 21c4 0 6-3 6-6 0-4-3-5-4-9-2 2-2 4-2 5-1-1-2-2-2-4-3 3-4 5-4 8 0 3 2 6 6 6z" />,
  emote: <><path d="M4 5h16v10H10l-4 4v-4H4z" /><path d="M12 7v4M12 13v.5" /></>,
  gesture: <><path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.4-1.8L8 13" /></>
};
export function FxIcon({ name, size = 22, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(String(name).startsWith('g:') ? GESTURE_ICON[name.slice(2)] || FX_ICON.gesture : FX_ICON[name]) || FX_ICON.emitter}</svg>;
}

// жесты — человечки: голова + поза
const H = (cx = 12, cy = 4.5) => <circle cx={cx} cy={cy} r="2.2" />;
const GESTURE_ICON = {
  wave: <>{H()}<path d="M12 7v7M12 14l-3 7M12 14l3 7M12 9l-4 3M12 9l4-3 1-4" /></>,
  point: <>{H()}<path d="M12 7v7M12 14l-3 7M12 14l3 7M12 9l-3 4M12 9h8M18 7l2 2-2 2" /></>,
  nod: <>{H(12, 6)}<path d="M12 9v6M12 15l-3 6M12 15l3 6M12 11l-3 3M12 11l3 3M17 3v5l-2-2M17 8l2-2" /></>,
  shake_head: <>{H()}<path d="M12 7v7M12 14l-3 7M12 14l3 7M12 9l-3 4M12 9l3 4M5 4l-2 1 2 1M19 4l2 1-2 1" /></>,
  bow: <><circle cx="15" cy="8" r="2.2" /><path d="M13 9.5L8 12v3M8 15l-1 6M8 15l2 6M11 11l2 4" /></>,
  kneel: <>{H(11, 5)}<path d="M11 8v6M11 14h5l1 6M11 14l-2 6h-2M11 10l-3 3M11 10l3 3" /></>,
  sit: <>{H(10, 5)}<path d="M10 8v7h6v6M10 11l4 2M6 15h4M6 15v6M18 13v8" /></>,
  sleep: <><circle cx="5" cy="16" r="2.2" /><path d="M7.5 17H21M3 20h18M14 4h4l-4 4h4M18 10h2l-2 2h2" /></>,
  cheer: <>{H()}<path d="M12 7v7M12 14l-3 6M12 14l3 6M12 9L8 4M12 9l4-5M4 9l1 1M20 9l-1 1" /></>,
  cry: <>{H()}<path d="M12 7v7M12 14l-3 7M12 14l3 7M12 9l-3 4M12 9l3 4M16 5v3M17.5 8.5v2" /></>,
  talk: <>{H(9, 5)}<path d="M9 8v7M9 15l-2 6M9 15l2 6M9 10l-3 4M9 10l4 1M15 3h6v4h-3l-2 2V7h-1z" /></>,
  look_around: <>{H()}<path d="M12 7v7M12 14l-3 7M12 14l3 7M12 9l-3 4M12 9l3 4M6 3a6 6 0 0 0-2 4M18 3a6 6 0 0 1 2 4" /></>,
  pick_up: <><circle cx="13" cy="9" r="2.2" /><path d="M12 11l-3 4v6M9 21l3-2M10 13l-1 5h3M4 18h4v3H4z" /></>,
  give: <>{H(9, 5)}<path d="M9 8v7M9 15l-2 6M9 15l2 6M9 10l6 2M16 10h4v4h-4z" /></>,
  attack: <>{H(9, 5)}<path d="M9 8v7M9 15l-3 6M9 15l3 6M9 10l5-1M14 9l6-6M18 3h2v2" /></>,
  die: <><circle cx="5" cy="18" r="2.2" /><path d="M7.5 18H17M17 18l3-2M17 18l3 2M11 18l2-3M3 22h18" /></>,
  crouch: <>{H(12, 8)}<path d="M12 10.5v5M12 15.5l-3 1 1 4M12 15.5l3 1-1 4M12 12l-3 2M12 12l3 2" /></>,
  run: <><circle cx="14" cy="4.5" r="2.2" /><path d="M13 7l-2 7M11 14l-4 2-1 4M11 14l4 2 1 5M12 9l-4 1M12 9l5 2M3 10h2M2 13h2" /></>,
  stand: <>{H()}<path d="M12 7v7M12 14l-2 7M12 14l2 7M12 9l-3 5M12 9l3 5" /></>
};

function tilesFor(group) {
  if (group === 'gestures') return GESTURES.map(([g, l]) => ({ key: 'g:' + g, label: l, icon: 'g:' + g, color: '#6ee7a0', hint: GESTURE_HINT[g] + ' Жест на дорожке актёра («Анимация»). У жителей долины — их собственные движения, у остальных существ — общий слой поз.', item: { gesture: g } }));
  return Object.entries(FX_LIB).filter(([, d]) => d.group === group).map(([k, d]) => ({ key: k, label: d.label, icon: d.icon, color: d.color, hint: d.hint, item: { verb: k } }));
}
// актёр для эффекта существа: выбранный в «Объектах» или первый в сцене
function pickActor(core) {
  const s = core.sceneRef.current;
  const objActor = core.sel.objs.map((id) => (s.objects || []).find((o) => o.id === id)).find((o) => o && o.type === 'actor');
  if (objActor) return objActor.actor;
  const evKey = core.sel.ev && core.sel.ev.track;
  if (evKey && evKey.startsWith('actor:')) return evKey.slice(6);
  const a = (s.actors || []).find((x) => x.kind !== 'player') || (s.actors || [])[0];
  return a ? a.id : null;
}
// добавить эффект на таймлайн: item {verb} или {gesture}; t — момент; actor — для эффекта существа (иначе выбранный)
export async function addFxEvent(core, item, t, actor) {
  const s = core.sceneRef.current;
  if (!s) { core.toast('Сначала открой сцену', 'warn'); return; }
  const lib = item.verb ? FX_LIB[item.verb] : null;
  const needActor = item.gesture || (lib && lib.track === 'actor');
  const who = needActor ? actor || pickActor(core) : null;
  if (needActor && !who) { core.toast('Добавь в сцену актёра («Создать» → «Актёры») — жесты и эффекты существ идут на его дорожку', 'warn', 5000); return; }
  const key = needActor ? 'actor:' + who : lib.track;
  const ev = item.gesture ? { t: Math.max(0, Math.round(t)), do: 'anim', name: item.gesture } : fxNewEvent(item.verb, t);
  let idx = 0;
  core.edit((sc) => {
    const has = sc.tracks.some((tr) => (tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind) === key);
    const tracks = has ? sc.tracks.slice() : [...sc.tracks, key.startsWith('actor:') ? { kind: 'actor', actor: key.slice(6), events: [] } : { kind: key, events: [] }];
    return { ...sc, tracks: tracks.map((tr) => { if ((tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind) !== key) return tr; const evs = [...(tr.events || []), ev].sort((a, b) => a.t - b.t); idx = evs.indexOf(ev); return { ...tr, events: evs }; }) };
  });
  core.setSel({ objs: core.sel.objs, ev: { track: key, i: idx } });
  core.setHint((lib ? lib.label : 'Жест') + ' — на дорожке «' + (needActor ? 'актёр ' + who : ({ fx: 'Эффекты', world: 'Мир', sound: 'Звук' })[key]) + '» в ' + fmtTicks(t) + '. Свойства — в «Атрибутах».');
  // место — туда, куда смотришь в игре
  const posField = lib && lib.fields.find((f) => f.type === 'pos' && (f.k === 'pos' || f.k === 'from'));
  if (posField && core.link.connected) {
    try {
      const p = selToPos(await core.api.getSel(), !!posField.exact);
      if (p) {
        const k = posField.k;
        core.edit((sc) => ({ ...sc, tracks: sc.tracks.map((tr) => ((tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind) !== key ? tr : { ...tr, events: tr.events.map((e) => (e === ev ? { ...e, [k]: p, ...(k === 'from' ? { to: p.map((v, i) => v + (i === 1 ? 2 : 3)) } : {}) } : e)) })) }), { silent: true });
      }
    } catch (_) {}
  }
}

export function FxPalette() {
  const core = useStudio();
  const { hp } = core;
  const [group, setGroup] = useState(() => { try { return JSON.parse(localStorage.getItem('studio3.fxGroup')) || 'screen'; } catch (_) { return 'screen'; } });
  const pick = (g) => { setGroup(g); try { localStorage.setItem('studio3.fxGroup', JSON.stringify(g)); } catch (_) {} };
  const g = FX_GROUPS.find((x) => x[0] === group) || FX_GROUPS[0];
  const tiles = tilesFor(group);
  return (
    <>
      <div className="cine-groups">{FX_GROUPS.map(([id, l, h]) => <button key={id} data-learn={'fxg-' + id} className={group === id ? 'on' : ''} onClick={() => pick(id)} {...hp(l + ': ' + h)}>{l}</button>)}</div>
      <div className="c4-create-sub dim">{g[2]} Щёлкни — на таймлайн в момент бегунка; перетащи — на нужную дорожку и время. ▶ — показать в игре.</div>
      <div className="c4-create-grid">
        {tiles.map((t) => (
          <div key={t.key} className="cine-tilewrap">
            <button className="c4-tile" data-learn={'fx-' + (t.item.verb || t.item.gesture)} disabled={!core.scene}
              draggable onDragStart={(e) => { e.dataTransfer.setData('text/c4fx', JSON.stringify(t.item)); e.dataTransfer.effectAllowed = 'copy'; }}
              onClick={() => addFxEvent(core, t.item, core.timeRef.current)}
              {...hp(t.label + ': ' + t.hint + (core.scene ? ' Щёлкни — на таймлайн в момент бегунка; перетащи на дорожку.' : ' (Сначала открой сцену.)'))}>
              <span className="ic"><FxIcon name={t.icon} size={24} color={t.color} /></span>
              <span className="l">{t.label}</span>
            </button>
            <button className="cine-prev" title="Показать в игре" disabled={!core.link.connected} onClick={(e) => { e.stopPropagation(); const ev = t.item.gesture ? { t: 0, do: 'anim', name: t.item.gesture } : fxNewEvent(t.item.verb, 0); fxPreview(core, t.item.gesture ? 'actor' : FX_LIB[t.item.verb].track, ev); }}><I name="play" size={10} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

// бросили эффект на таймлайн: t и строка (дорожка актёра — этот актёр)
export function dropFx(core, e, t, rowKey) {
  let item = null;
  try { item = JSON.parse(e.dataTransfer.getData('text/c4fx')); } catch (_) {}
  if (!item) return;
  e.preventDefault();
  const actor = rowKey && rowKey.startsWith('actor:') ? rowKey.slice(6) : null;
  addFxEvent(core, item, t, actor);
}

// ---------------- «Видео проекта» ----------------
export function VideosModal({ Modal, onClose }) {
  const core = useStudio();
  const st = useCine();
  useEffect(() => { refreshInfo(); }, []);
  const list = st.info ? st.info.scenes.filter((x) => x.vid) : [];
  const ship = async (x, v) => {
    if (core.scene && core.scene.id === x.id) core.edit((sc) => ({ ...sc, options: { ...(sc.options || {}), video: { ...videoOpts(sc), ...((sc.options || {}).video || {}), ship: v } } }));
    else { try { await call('studio:videoShip', { id: x.id, ship: v }); } catch (e) { core.toast(e.message, 'error'); return; } }
    setTimeout(refreshInfo, core.scene && core.scene.id === x.id ? 1200 : 0);
  };
  const del = async (x) => {
    if (!window.confirm('Удалить видео «' + (x.title || x.id) + '» (' + fmtSize(x.vid.bytes) + ')?')) return;
    try { await call('studio:videoDelete', x.id); refreshInfo(); } catch (e) { core.toast(e.message, 'error'); }
  };
  const busy = !!(st.rec && ['start', 'progress', 'sent'].includes(st.rec.state));
  const rerec = async (x) => {
    if (!window.confirm('Записать видео «' + (x.title || x.id) + '» заново? Старое (' + fmtSize(x.vid.bytes) + ') заменится.')) return;
    try { await recordScene(core, x.id); } catch (e) { core.toast(e.message, 'error'); }
  };
  return (
    <Modal title="Видео проекта" wide onClose={onClose} footer={<>
      <button className="c4-btn" onClick={async () => { try { const p = await call('studio:videoFolder', null); call('shell:openPath', p); } catch (e) { core.toast(e.message, 'error'); } }}><I name="folder" size={12} /> Папка видео</button>
      <button className="c4-btn prim" onClick={onClose}>Готово</button>
    </>}>
      <p className="dim">Видео лежат отдельно от файлов проекта: <span className="mono">{st.info ? st.info.videosDir : 'kokkstory-videos/…'}</span>. «Собрать» кладёт в сборку только отмеченные «Отдавать игрокам». У кого видео нет — видит сцену вживую.</p>
      {!list.length && <p>Видео пока нет. Открой сцену → «Атрибуты» → «Запекание и видео» → «Записать видео».</p>}
      {list.length > 0 && <table className="cine-table">
        <thead><tr><th>Сцена</th><th>Кадр</th><th>Длина</th><th>Размер</th><th>Состояние</th><th title="Отдавать игрокам">Игрокам</th><th /></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.id}>
            <td><b>{x.title}</b><div className="dim mono">{x.id}</div></td>
            <td>{x.vid.h}p · {x.vid.fps} к/с</td>
            <td>{x.vid.frames} к. · {fmtTicks(x.vid.length || 0)}</td>
            <td><b>{fmtSize(x.vid.bytes)}</b></td>
            <td className={x.vid.fresh ? 'cine-ok' : 'cine-warn'}>{x.vid.broken ? 'повреждено' : x.vid.fresh ? 'свежее' : 'устарело'}</td>
            <td><Check value={!!(x.video && x.video.ship)} onChange={(v) => ship(x, v)} /></td>
            <td className="nowrap"><div className="cine-acts">
              <button className="c4-ib" title="Открыть сцену" onClick={() => { onClose(); core.openScene(x.id); }}><I name="film" size={13} /></button>
              <button className="c4-ib" title={core.link.connected ? 'Записать заново (настройки — из сцены)' : 'Записать заново — нужна связь с игрой'} disabled={!core.link.connected || busy} onClick={() => rerec(x)}><I name="record" size={13} /></button>
              <button className="c4-ib" title="Посмотреть в игре" disabled={!core.link.connected} onClick={() => call('studio:send', { t: 'videoPlay', id: x.id, project: core.projectId }).catch(() => {})}><I name="play" size={13} /></button>
              <button className="c4-ib" title="Удалить" onClick={() => del(x)}><I name="trash" size={13} /></button>
            </div>{st.rec && st.rec.id === x.id && <RecLine rec={st.rec} />}</td>
          </tr>
        ))}</tbody>
      </table>}
      {st.info && <p>В сборку уйдёт: <b>{fmtSize(st.info.shipBytes)}</b> · всего записано: <b>{fmtSize(st.info.allBytes)}</b>.</p>}
    </Modal>
  );
}

// ---------------- поля эффекта для схем и сущности «Эффект» (компактно) ----------------
export function FxFields({ a, set, refs, hp, api, hide }) {
  const d = FX_LIB[a.fx];
  if (!d) return null;
  const ctx = { hp: hp || (() => ({})), api: api || (refs && refs.api) || { connected: false, toast: () => {} }, actors: [], projActors: [], dialogs: [], structures: (refs && refs.structures) || [] };
  return (
    <div className="st-fields cine-fxfields">
      {d.fields.filter((f) => !f.when || f.when(a)).filter((f) => f.type !== 'actorRef' && !(hide && hide.includes(f.k))).map((f) => <Field key={f.k} f={f} value={a[f.k]} ctx={ctx} onChange={(v) => set({ ...a, [f.k]: v })} />)}
    </div>
  );
}
export const SCHEME_FX = Object.entries(FX_LIB).filter(([k, d]) => d.track !== 'actor' && k !== 'slowmo').map(([k, d]) => [k, d.label]);
