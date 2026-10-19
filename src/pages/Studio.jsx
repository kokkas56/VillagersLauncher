// «Студия» — редактор сюжета для мода Kokk Story (только в режиме автора): сцены, диалоги, задания, переменные.
// Всё — JSON в <игра>/studio/{scenes,dialogs,quests}, живая связь с игрой через главный процесс (studio:*).
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call, on } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal, Toggle } from '../components/ui.jsx';
import Timeline from '../studio/Timeline.jsx';
import Inspector from '../studio/Inspector.jsx';
import { Datalists, selToPos } from '../studio/fields.jsx';
import { validateScene, normalizeScene, defaultScene, isActorId, isSceneId, varDefault, ERR } from '../studio/validate.js';
import DialogTab from '../studio/DialogTab.jsx';
import QuestTab from '../studio/QuestTab.jsx';
import VarsTab from '../studio/VarsTab.jsx';
import { IssueRows } from '../studio/docs.jsx';
import { ONBOARDING } from '../studio/schema.js';
import {
  prepareScene, getItem, getItems, setItems, patchItem, removeItem, sortTrack, newEvent, setPath, renameActor,
  slug, uniqueId, fmtTicks, gizmosOf
} from '../studio/model.js';
import '../studio/studio.css';

const DEFAULT_HINT = 'Наведи мышку на любую кнопку, поле или дорожку — здесь появится объяснение, что это и зачем.';
const QSTATE_RU = { not_started: 'не начато', active: 'идёт', done: 'сделано', failed: 'провалено' };
const OP_RU = { dialog: 'Диалог', start: 'Начать', advance: 'Продвинуть', complete: 'Завершить', fail: 'Провалить', reset: 'Сбросить', status: 'Статус', setVar: 'Переменная', play: 'Сцена' };
const SUBTABS = [
  ['scenes', 'Сцены', 'Катсцены: камера, актёры, эффекты, звук — на таймлайне.'],
  ['dialogs', 'Диалоги', 'Разговоры с ветками: реплики, выбор ответа, условия и действия — граф из узлов.'],
  ['quests', 'Задания', 'Задания по шагам: принести, поговорить, дойти, победить… и награда.'],
  ['vars', 'Переменные', 'Память сюжета: что игрок уже сделал. Её пишут сцены, диалоги и задания, а проверяют условия.']
];
const lsGet = (k, d) => { try { const v = localStorage.getItem('studio.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('studio.' + k, JSON.stringify(v)); } catch (_) {} };

export default function Studio() {
  const { toast } = useApp();
  const [boot, setBoot] = useState(null);
  const [bootErr, setBootErr] = useState(null);
  const [project, setProject] = useState({ actors: [] });
  const [list, setList] = useState([]);
  const [scene, setSceneState] = useState(null);
  const [sel, setSel] = useState(null);
  const [actorSel, setActorSel] = useState(null);
  const [playhead, setPlayheadState] = useState(0);
  const [link, setLink] = useState({ connected: false });
  const [logs, setLogs] = useState([]);
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [tab, setTab] = useState('hint');
  const [saveState, setSaveState] = useState('saved');
  const [issuesOpen, setIssuesOpen] = useState(null); // null | 'check' | 'play'
  const [report, setReport] = useState(null);
  const [building, setBuilding] = useState(false);
  const [gizmosOn, setGizmosOn] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => lsGet('help', true));
  const [camStep, setCamStep] = useState(() => lsGet('camStep', 40));
  const [playing, setPlaying] = useState(false);
  const [, force] = useState(0);
  const [sub, setSubState] = useState(() => lsGet('sub', 'scenes'));
  const [dialogs, setDialogs] = useState([]);
  const [quests, setQuests] = useState([]);
  const [gameVars, setGameVarsState] = useState(null);
  const [questStates, setQuestStates] = useState({});
  const [goto, setGoto] = useState(null);
  const subRef = useRef(sub);
  subRef.current = sub;
  const projectRef = useRef(project);
  projectRef.current = project;

  const sceneRef = useRef(null);
  const selRef = useRef(null);
  const phRef = useRef(0);
  const linkRef = useRef(link);
  const hist = useRef({ past: [], future: [], key: null, at: 0 });
  const dirty = useRef(false);
  const saveTimer = useRef(null);
  selRef.current = sel;
  linkRef.current = link;
  const setPlayhead = useCallback((t) => { phRef.current = t; setPlayheadState(t); }, []);

  const hp = useCallback((text) => (text ? { title: text, onMouseEnter: () => setHint(text) } : {}), []);
  const api = useMemo(() => ({
    connected: !!link.connected,
    toast,
    getView: async () => { const v = await call('studio:getView'); if (!v || !Array.isArray(v.pos)) throw new Error('Игра не прислала вид'); return v; },
    getSel: () => call('studio:getSel'),
    tp: (p) => call('studio:tp', p).catch((e) => toast(e.message, 'error'))
  }), [link.connected, toast]);

  // ---------- сохранение и история ----------
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const s = sceneRef.current;
    if (!s || !dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await call('studio:save', s);
      setSaveState(dirty.current ? 'dirty' : 'saved');
      setList((l) => l.map((x) => (x.id === s.id ? { ...x, title: s.title, length: s.length } : x)));
    } catch (e) { dirty.current = true; setSaveState('error'); toast('Не сохранилось: ' + e.message, 'error', 8000); }
  }, [toast]);
  const markDirty = () => {
    dirty.current = true;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 800);
  };
  const setScene = (s) => { sceneRef.current = s; setSceneState(s); };
  // правка сцены: opt.key — слить с предыдущей правкой того же поля (ввод текста), opt.silent — без истории (перетаскивание)
  const edit = useCallback((fn, opt = {}) => {
    const prev = sceneRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (!next || next === prev) return;
    const h = hist.current;
    if (!opt.silent) {
      const now = Date.now();
      if (!(opt.key && opt.key === h.key && now - h.at < 1500)) { h.past.push(prev); if (h.past.length > 300) h.past.shift(); }
      h.key = opt.key || null; h.at = now; h.future = [];
    }
    setScene(next);
    markDirty();
  }, []); // eslint-disable-line
  const gesture = useCallback(() => { const h = hist.current; h.past.push(sceneRef.current); h.future = []; h.key = null; }, []);
  const undo = () => { const h = hist.current; if (!h.past.length) return; h.future.push(sceneRef.current); setScene(h.past.pop()); h.key = null; fixSel(); markDirty(); force((n) => n + 1); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; h.past.push(sceneRef.current); setScene(h.future.pop()); h.key = null; fixSel(); markDirty(); force((n) => n + 1); };
  const fixSel = () => { const s = sceneRef.current; if (selRef.current && !getItem(s, selRef.current)) setSel(null); setActorSel((a) => (a != null && s.actors[a] ? a : null)); };

  // ---------- загрузка ----------
  const openScene = useCallback(async (id) => {
    await flush();
    try {
      const raw = await call('studio:read', id);
      const s = prepareScene(raw, id);
      hist.current = { past: [], future: [], key: null, at: 0 };
      setScene(s); setSel(null); setActorSel(null); setPlayhead(0);
      lsSet('last', id);
    } catch (e) { toast(e.message, 'error', 8000); }
  }, [flush, toast, setPlayhead]);

  const reloadList = async () => { const l = await call('studio:list'); setList(l || []); return l || []; };
  // вернулись во вкладку «Сцены», а сцена ещё не открыта — открыть последнюю
  useEffect(() => {
    if (sub !== 'scenes' || !boot || sceneRef.current) return;
    const last = lsGet('last', null);
    const pick = list.find((x) => x.id === last) || list[0];
    if (pick) openScene(pick.id);
  }, [sub, boot]); // eslint-disable-line

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await call('studio:open');
        if (!alive) return;
        setBoot(b); setProject(b.project || { actors: [] }); setList(b.scenes || []); setDialogs(b.dialogs || []); setQuests(b.quests || []);
        if (b.link) setLink(b.link);
      } catch (e) { setBootErr(e.message); }
      call('studio:link', true).then((st) => st && alive && setLink(st)).catch(() => {});
    })();
    return () => { alive = false; flush(); call('studio:link', false).catch(() => {}); };
  }, []); // eslint-disable-line

  // ---------- связь с игрой ----------
  // ответ игры на {t:'vars'}: { data: {имя: значение}, quests: {id: состояние} }
  const setGameVars = (m) => {
    if (!m) { setGameVarsState(null); return; }
    setGameVarsState({ vars: m.data && typeof m.data === 'object' ? m.data : {}, quests: m.quests || null, at: Date.now() });
    if (m.quests && typeof m.quests === 'object') setQuestStates((q) => ({ ...q, ...Object.fromEntries(Object.entries(m.quests).map(([id, st]) => [id, { ...st, id }])) }));
  };
  const setGameVarsRef = useRef(setGameVars);
  setGameVarsRef.current = setGameVars;
  const addLog = (level, text) => setLogs((l) => [...l.slice(-199), { at: Date.now(), level, text }]);
  const onKeyRef = useRef(null);
  onKeyRef.current = async (msg) => {
    const s = sceneRef.current;
    if (!s) { toast('Открой сцену в Студии, чтобы ставить ключи из игры', 'warn'); return; }
    if (msg.name === 'camKey') {
      let v = msg.view;
      try { if (!v || !Array.isArray(v.pos)) v = await api.getView(); } catch (e) { toast(e.message, 'error'); return; }
      const t = phRef.current;
      const patch = { pos: v.pos.map((n) => Math.round(n * 100) / 100), yaw: Math.round((v.yaw || 0) * 10) / 10, pitch: Math.round((v.pitch || 0) * 10) / 10, fov: Math.round(v.fov || 70) };
      const keys = getItems(s, 'camera');
      const same = keys.findIndex((k) => k.t === t);
      if (same >= 0) {
        edit((sc) => patchItem(sc, { track: 'camera', i: same }, patch));
        setSel({ track: 'camera', i: same }); setActorSel(null);
      } else {
        const obj = { ...newEvent('camera', 'key', t), ...patch };
        const r = sortTrack(setItems(s, 'camera', (a) => [...a, obj]), 'camera', obj);
        edit(() => r.scene);
        setSel({ track: 'camera', i: r.index }); setActorSel(null);
      }
      toast('Ключ камеры: ' + fmtTicks(t), 'ok', 2000);
      if (camStep > 0) setPlayhead(t + camStep);
    } else if (msg.name === 'pathPoint') {
      const cur = selRef.current;
      const ev = getItem(s, cur);
      if (!ev || ev.do !== 'walk') { toast('Выбери на таймлайне событие «Идти» — F9 добавляет точки в него', 'warn', 6000); return; }
      let p = Array.isArray(msg.pos) ? msg.pos : msg.sel ? selToPos(msg.sel) : null;
      if (!p) { try { p = selToPos(await api.getSel()); } catch (e) { toast(e.message, 'error'); return; } }
      if (!p) { toast('В игре прицел ни на что не наведён', 'warn'); return; }
      edit((sc) => patchItem(sc, cur, (e) => ({ ...e, path: [...(e.path || []), p] })));
      toast('Точка пути ' + ((ev.path || []).length + 1), 'ok', 2000);
    } else addLog('info', 'Клавиша в игре: ' + msg.name);
  };
  useEffect(() => on('studio-link', (d) => {
    if (!d) return;
    if (d.type === 'state') {
      setLink((old) => {
        if (old.connected !== d.connected) addLog(d.connected ? 'ok' : 'warn', d.connected ? 'Игра на связи' : 'Связь с игрой пропала');
        return { connected: d.connected, info: d.info, port: d.port };
      });
      return;
    }
    const m = d.msg || {};
    if (m.t === 'log') addLog(m.level || 'info', m.text || '');
    else if (m.t === 'hello') addLog('ok', 'Игра: ' + [m.world, m.dim, m.ver && 'версия ' + m.ver].filter(Boolean).join(' · '));
    else if (m.t === 'played') {
      addLog(m.ok ? 'ok' : 'error', (m.ok ? 'Сыграно: ' : 'Не сыграло: ') + (m.scene || '') + (m.error ? ' — ' + m.error : ''));
      if (!m.ok) { setPlaying(false); toast('Игра: ' + (m.error || 'сцена не сыграла'), 'error', 8000); }
    } else if (m.t === 'key') { if (subRef.current === 'scenes') onKeyRef.current(m); else addLog('info', 'Клавиша в игре: ' + m.name + ' (работает во вкладке «Сцены»)'); } else if (m.t === 'vars') setGameVarsRef.current(m);
    else if (m.t === 'questState') {
      setQuestStates((q) => ({ ...q, [m.id]: m }));
      addLog('info', 'Задание «' + m.id + '»: ' + (QSTATE_RU[m.state] || m.state) + (m.step ? ', шаг ' + m.step : '') + (m.text ? ' — ' + m.text : ''));
    } else if (m.t === 'result') {
      addLog(m.ok ? 'ok' : 'error', (OP_RU[m.op] || m.op || 'Команда') + (m.id ? ' «' + m.id + '»' : '') + ': ' + (m.ok ? 'готово' : 'не вышло — ' + (m.error || '?')));
      if (!m.ok) toast('Игра: ' + (m.error || 'не получилось'), 'error', 8000);
    }
  }), []); // eslint-disable-line

  // проигрывание: бегунок едет вместе с игрой (20 тиков в секунду)
  useEffect(() => {
    if (!playing) return undefined;
    const start = performance.now();
    let raf;
    const len = (sceneRef.current && sceneRef.current.length) || 0;
    const step = () => {
      const t = Math.round(((performance.now() - start) / 1000) * 20);
      if (t >= len) { setPlayhead(len); setPlaying(false); return; }
      setPlayhead(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlayhead]);

  // ---------- проверка ----------
  const lazyScene = useDeferredValue(scene); // проверка не тормозит перетаскивание
  const issues = useMemo(() => (lazyScene ? validateScene(lazyScene, { project, ids: list.map((x) => x.id), dialogIds: dialogs.map((x) => x.id) }) : []), [lazyScene, project, list, dialogs]);
  const nErr = issues.filter((x) => x.sev === ERR).length;
  const issueMap = useMemo(() => {
    const m = {};
    for (const x of issues) if (x.sel && x.sel.track) { const k = x.sel.track + '#' + x.sel.i; if (m[k] !== ERR) m[k] = x.sev; }
    return m;
  }, [issues]);
  const goIssue = (x) => {
    if (x.sel && x.sel.track) { setSel(x.sel); setActorSel(null); setPlayhead((getItem(sceneRef.current, x.sel) || {}).t || 0); } else if (x.sel && x.sel.actor != null) { setSel(null); setActorSel(x.sel.actor); } else { setSel(null); setActorSel(null); }
  };

  const play = async (forceIt) => {
    if (!scene) return;
    if (!link.connected) { toast('Нет связи с игрой — запусти игру с режимом разработчика', 'warn', 6000); return; }
    if (nErr && !forceIt) { setIssuesOpen('play'); return; }
    setIssuesOpen(null);
    try { await call('studio:play', normalizeScene(scene)); setPlayhead(0); setPlaying(true); addLog('info', 'Отправил в игру: ' + scene.id); } catch (e) { toast(e.message, 'error'); }
  };
  const stop = async () => { setPlaying(false); try { await call('studio:stop'); } catch (e) { toast(e.message, 'error'); } };

  // показ в мире: при включённом — обновляется сам после правок
  useEffect(() => {
    if (!gizmosOn || !link.connected || !scene) return undefined;
    const tm = setTimeout(() => call('studio:gizmos', gizmosOf(scene)).catch(() => {}), 400);
    return () => clearTimeout(tm);
  }, [gizmosOn, link.connected, scene]);
  const toggleGizmos = () => {
    if (!link.connected) { toast('Нет связи с игрой', 'warn'); return; }
    const v = !gizmosOn;
    setGizmosOn(v);
    if (!v) call('studio:gizmos', null).catch(() => {});
  };

  const build = async () => {
    setBuilding(true);
    try { await flush(); setReport(await call('studio:build')); } catch (e) { toast(e.message, 'error', 8000); }
    setBuilding(false);
  };

  // ---------- события ----------
  const addEvent = (key, verb, t) => {
    const s = sceneRef.current;
    const obj = newEvent(key, verb, t);
    const r = sortTrack(setItems(s, key, (a) => [...a, obj]), key, obj);
    edit(() => r.scene);
    setSel({ track: key, i: r.index }); setActorSel(null);
  };
  const onDragEnd = (key) => {
    const s = sceneRef.current;
    const cur = selRef.current;
    const obj = cur && cur.track === key ? getItem(s, cur) : null;
    const r = sortTrack(s, key, obj);
    if (r.scene !== s) { setScene(r.scene); markDirty(); }
    if (obj) setSel({ track: key, i: r.index });
  };
  const onEvent = (k, v) => {
    const cur = selRef.current;
    if (!cur) return;
    edit((s) => patchItem(s, cur, (e) => setPath(e, k, v)), { key: 'e:' + cur.track + ':' + cur.i + ':' + k });
    if (k === 't') {
      const s = sceneRef.current;
      const obj = getItem(s, cur);
      const r = sortTrack(s, cur.track, obj);
      if (r.scene !== s) { setScene(r.scene); setSel({ track: cur.track, i: r.index }); }
    }
  };
  const onEventMany = (patch) => { const cur = selRef.current; if (cur) edit((s) => patchItem(s, cur, patch)); };
  const delEvent = () => { const cur = selRef.current; if (!cur) return; edit((s) => removeItem(s, cur)); setSel(null); };
  const dupEvent = () => {
    const cur = selRef.current;
    const s = sceneRef.current;
    const ev = getItem(s, cur);
    if (!ev) return;
    const obj = { ...JSON.parse(JSON.stringify(ev)), t: ev.t + 10 };
    const r = sortTrack(setItems(s, cur.track, (a) => [...a, obj]), cur.track, obj);
    edit(() => r.scene);
    setSel({ track: cur.track, i: r.index });
  };
  const onActor = (k, v) => {
    const i = actorSel;
    const s = sceneRef.current;
    const a = s.actors[i];
    if (!a) return;
    if (k === 'id') {
      if (!isActorId(v)) { toast('id актёра — латиница, цифры, _ и -', 'error'); return; }
      if (s.actors.some((x, j) => j !== i && x.id === v)) { toast('Актёр с таким id уже есть', 'error'); return; }
      edit((sc) => renameActor(sc, a.id, v));
      if (sel && sel.track === 'actor:' + a.id) setSel({ ...sel, track: 'actor:' + v });
      return;
    }
    edit((sc) => ({ ...sc, actors: sc.actors.map((x, j) => (j === i ? setPath(x, k, v) : x)) }), { key: 'a:' + i + ':' + k });
  };
  const onScene = (k, v) => edit((s) => setPath(s, k, v), { key: 's:' + k });
  const addActor = (a) => {
    edit((s) => ({ ...s, actors: [...s.actors, a] }));
    setSel(null); setActorSel(sceneRef.current.actors.length - 1);
  };
  const removeActor = () => {
    const s = sceneRef.current;
    const a = s.actors[actorSel];
    if (!a) return;
    const n = getItems(s, 'actor:' + a.id).length;
    if (n && !window.confirm('Убрать «' + (a.name || a.id) + '» из сцены вместе с его событиями (' + n + ')?')) return;
    edit((sc) => ({ ...sc, actors: sc.actors.filter((_, j) => j !== actorSel), tracks: sc.tracks.filter((tr) => !(tr.kind === 'actor' && tr.actor === a.id)) }));
    setActorSel(null);
  };

  // клавиши: Ctrl+Z / Ctrl+Y / Delete / Ctrl+D / Ctrl+S
  useEffect(() => {
    const k = (e) => {
      if (subRef.current !== 'scenes' || !sceneRef.current || document.querySelector('.modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      const code = e.code;
      if (ctrl && (code === 'KeyZ' || code === 'KeyY')) {
        e.preventDefault();
        if (inField) e.target.blur();
        if (code === 'KeyY' || e.shiftKey) redo(); else undo();
      } else if (ctrl && code === 'KeyS') { e.preventDefault(); flush(); } else if (!inField && ctrl && code === 'KeyD') { e.preventDefault(); dupEvent(); } else if (!inField && (e.key === 'Delete' || e.key === 'Backspace') && selRef.current) { e.preventDefault(); delEvent(); } else if (!inField && e.key === 'Escape') { setSel(null); setActorSel(null); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---------- сцены и проект ----------
  const createScene = async (title) => {
    const id = uniqueId(slug(title), list.map((x) => x.id));
    const s = defaultScene(id, title);
    try {
      await call('studio:save', s);
      await reloadList();
      await openScene(id);
    } catch (e) { toast(e.message, 'error'); }
  };
  const saveProject = async (p) => {
    setProject(p);
    projectRef.current = p;
    try { setProject(await call('studio:project', p)); } catch (e) { toast('Проект не сохранился: ' + e.message, 'error'); }
  };
  // ---------- вкладки и общие списки ----------
  const setSub = async (t) => { if (t === subRef.current) return; await flush(); setSubState(t); lsSet('sub', t); };
  const reloadAny = useCallback(async (kind) => {
    if (kind === 'scenes') return reloadList();
    const l = (await call('studio:docList', kind)) || [];
    if (kind === 'dialogs') setDialogs(l); else setQuests(l);
    return l;
  }, []); // eslint-disable-line
  const patchList = useCallback((kind, item) => {
    const f = (l) => (l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...l, item]);
    if (kind === 'dialogs') setDialogs(f); else setQuests(f);
  }, []);
  const addVar = useCallback((name, type) => {
    const p = projectRef.current;
    if ((p.vars || []).some((v) => v.name === name)) return;
    saveProject({ ...p, vars: [...(p.vars || []), { name, type: type || 'bool', init: varDefault(type || 'bool'), note: '' }] });
    toast('Переменная «' + name + '» заведена (вкладка «Переменные»)', 'ok', 3000);
  }, []); // eslint-disable-line
  const baseRefs = useMemo(() => ({ actors: project.actors || [], vars: project.vars || [], scenes: list, dialogs, quests, addVar, talkPriority: project.talkPriority || 0 }), [project, list, dialogs, quests, addVar]);
  const openDoc = async (kind, id) => {
    if (kind === 'scenes') { await setSub('scenes'); openScene(id); return; }
    setGoto({ kind: kind === 'dialogs' ? 'dialog' : 'quest', id, n: Date.now() });
    await setSub(kind);
  };
  const pickIssue = async (x) => {
    setReport(null);
    const k = x.kind || 'scene';
    if (k === 'dialog' || k === 'quest') { setGoto({ kind: k, id: x.doc, sel: x.sel, n: Date.now() }); await setSub(k === 'dialog' ? 'dialogs' : 'quests'); return; }
    if (k === 'vars') { setGoto({ kind: 'vars', sel: x.sel, n: Date.now() }); await setSub('vars'); return; }
    if (k === 'project') { await setSub('scenes'); return; }
    await setSub('scenes');
    const sid = x.doc || x.scene;
    if (sid && (!sceneRef.current || sceneRef.current.id !== sid)) await openScene(sid);
    setTimeout(() => goIssue(x), 50);
  };
  const actorMenu = useMemo(() => {
    if (!scene) return [];
    const ids = scene.actors.map((a) => a.id);
    const base = { spawn: { pos: null, yaw: 0 }, existing: false, despawnAtEnd: true };
    const items = (project.actors || []).map((pa) => ({
      label: pa.name || pa.id, sub: pa.base === 'entity' ? pa.type : 'житель №' + pa.who, disabled: ids.includes(pa.id),
      hint: 'Персонаж проекта «' + (pa.name || pa.id) + '». Одного персонажа можно поставить в сцену один раз.',
      run: () => addActor({ id: pa.id, kind: 'story', ref: pa.id, name: pa.name || pa.id, ...base })
    }));
    if (!items.length) items.push({ label: 'Персонажей проекта пока нет', hint: 'Создай их слева, в «Актёры проекта».', disabled: true, run: () => {} });
    items.push({ head: 'Без персонажа проекта' });
    items.push({ label: 'Житель долины по номеру', hint: 'Готовый житель долины из мода Villagers — укажешь его номер (who).', run: () => addActor({ id: uniqueId('valley', ids), kind: 'valley', who: 0, name: 'Житель', ...base }) });
    items.push({ label: 'Любая сущность', hint: 'Кот, голем, зомби, лошадь — любой моб по id.', run: () => addActor({ id: uniqueId('mob', ids), kind: 'entity', type: 'minecraft:cat', name: 'Сущность', ...base }) });
    items.push({ label: 'Игрок', hint: 'Тот, кто смотрит сцену: можно повернуть голову, переместить, посадить.', disabled: scene.actors.some((a) => a.kind === 'player'), run: () => addActor({ id: uniqueId('player', ids), kind: 'player', name: 'Игрок' }) });
    return items;
  }, [scene, project]); // eslint-disable-line

  if (bootErr) return <div className="studio-err card"><b>Студия не открылась</b><p className="muted">{bootErr}</p></div>;
  if (!boot) return <div className="muted" style={{ padding: 20 }}>Открываю Студию…</div>;

  const saveText = { saved: 'Сохранено', dirty: 'Есть правки…', saving: 'Сохраняю…', error: 'Не сохранилось!' }[saveState];
  const tabsEl = (
    <div className="seg sm st-tabs">
      {SUBTABS.map(([id, label, hint]) => (
        <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)} {...hp(label + ' — ' + hint)}>
          {label}{id === 'dialogs' && dialogs.length ? <small> {dialogs.length}</small> : id === 'quests' && quests.length ? <small> {quests.length}</small> : null}
        </button>
      ))}
    </div>
  );
  const buildBtn = <button className={'btn sm' + (building ? ' busy' : '')} onClick={build} {...hp('Проверить все сцены, диалоги и задания и положить готовые в config/kokkstory/studio — оттуда их получат игроки со следующей публикацией сборки. С ошибками не собирается.')}><Icon name="rocket" size={12} /> Собрать<span className="lbl-wide"> для игроков</span></button>;
  const linkCardEl = <LinkCard link={link} boot={boot} setBoot={setBoot} hp={hp} toast={toast} setLink={setLink} />;
  const hintBoxEl = (
    <div className="st-hint">
      <div className="seg sm">
        <button className={tab === 'hint' ? 'on' : ''} onClick={() => setTab('hint')}>Подсказка</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Журнал игры{logs.length ? <small> {logs.length}</small> : null}</button>
      </div>
      {tab === 'hint'
        ? <div className="st-hint-text">{hint}</div>
        : (
          <div className="st-log">
            {logs.length === 0 && <div className="muted small">Пока пусто. Сюда пишет игра: что сыграло, чего не нашлось.</div>}
            {logs.slice().reverse().map((l, i) => <div key={i} className={'st-log-row ' + l.level}><span className="muted">{new Date(l.at).toLocaleTimeString('ru-RU')}</span> {l.text}</div>)}
          </div>
        )}
    </div>
  );
  const reportEl = report && (
    <Modal title={report.ok ? 'Собрано для игроков' : 'Не собрано — есть ошибки'} onClose={() => setReport(null)} wide
      footer={<>
        {report.ok && <button className="btn" onClick={() => call('shell:openPath', 'config/kokkstory/studio')}><Icon name="folder" size={12} /> Открыть папку</button>}
        <button className="btn primary" onClick={() => setReport(null)}>Понятно</button>
      </>}>
      {report.ok
        ? <p>Собрано: сцен <b>{report.count}</b>, диалогов <b>{report.dialogs || 0}</b>, заданий <b>{report.quests || 0}</b>{report.removed ? <> · убрано старых: {report.removed}</> : null}. Они лежат в <span className="mono small">{report.dir}</span> и уйдут игрокам со следующей публикацией сборки (вкладка «Автор»).</p>
        : <p>Ошибок: <b>{report.errors}</b>. Пока они есть, ничего не записано — исправь и собери снова.</p>}
      <IssueRows issues={report.issues || []} showDoc onPick={pickIssue} />
    </Modal>
  );
  const actorsEl = <ProjectActors project={project} save={saveProject} hp={hp} toast={toast} sceneIds={null} addToScene={() => {}} />;

  if (sub !== 'scenes') {
    const shared = {
      tabs: tabsEl, linkCard: linkCardEl, hintBox: hintBoxEl, buildBtn, actorsCard: actorsEl, toast, hp, api, link, project, saveProject,
      lists: { scenes: list, dialogs, quests }, reloadList: reloadAny, patchList, baseRefs, addLog, gameVars, setGameVars, setGameVarsState, questStates, openDoc
    };
    return (
      <div className="studio">
        <Datalists />
        <datalist id="sl-vars">{(project.vars || []).map((v) => <option key={v.name} value={v.name} />)}</datalist>
        {sub === 'dialogs' && <DialogTab shared={shared} goto={goto} />}
        {sub === 'quests' && <QuestTab shared={shared} goto={goto} />}
        {sub === 'vars' && <VarsTab shared={shared} goto={goto} />}
        {reportEl}
      </div>
    );
  }

  return (
    <div className="studio">
      <Datalists />
      {/* верхняя панель */}
      <div className="st-top">
        {tabsEl}
        {scene ? (
          <>
            <input className="input sm st-title" value={scene.title || ''} placeholder="Название сцены" onChange={(e) => onScene('title', e.target.value)} {...hp('Название сцены — только для тебя, игроки его не видят. Файл сцены называется по id: ' + scene.id + '.json')} />
            <button className="btn sm ghost icon-btn" disabled={!hist.current.past.length} onClick={undo} {...hp('Отменить последнюю правку (Ctrl+Z).')}><Icon name="undo" size={13} /></button>
            <button className="btn sm ghost icon-btn" disabled={!hist.current.future.length} onClick={redo} {...hp('Вернуть отменённое (Ctrl+Y).')}><Icon name="redo" size={13} /></button>
            <span className={'st-save ' + saveState} {...hp('Сцена сохраняется сама через секунду после любой правки. Ctrl+S — сохранить сразу.')}>{saveText}</span>
            <div className="grow" />
            {playing
              ? <button className="btn sm danger" onClick={stop} {...hp('Остановить сцену в игре.')}><Icon name="stop" size={12} /> Стоп</button>
              : <button className="btn sm primary" onClick={() => play(false)} {...hp('Сыграть сцену в игре прямо сейчас — как она есть в Студии, даже несохранённая. Нужна связь с игрой.')}><Icon name="play" size={12} /> Проиграть в игре</button>}
            {!playing && <button className="btn sm ghost icon-btn" disabled={!link.connected} onClick={stop} {...hp('Остановить сцену в игре.')}><Icon name="stop" size={12} /></button>}
            <button className={'btn sm' + (gizmosOn ? ' st-on' : '')} onClick={toggleGizmos} {...hp('Показать в игре полёт камеры, ключи, пути актёров и метки — пока включено, обновляется после каждой правки. Видно только тебе.')}><Icon name="eye" size={12} /><span className="lbl-wide"> {gizmosOn ? 'Видно в мире' : 'Показать в мире'}</span></button>
            <button className={'btn sm' + (nErr ? ' danger' : '')} onClick={() => setIssuesOpen('check')} {...hp('Проверить сцену на ошибки: пустые поля, неверные id, события после конца. Щёлкни по ошибке — выберется нужное событие.')}>
              <Icon name="check" size={12} /> Проверить{issues.length ? <span className={'st-badge' + (nErr ? ' e' : '')}>{nErr || issues.length}</span> : null}
            </button>
          </>
        ) : <div className="grow" />}
        {buildBtn}
      </div>

      {/* левая колонка */}
      <aside className="st-left">
        {linkCardEl}
        <SceneList list={list} cur={scene && scene.id} open={openScene} create={createScene} hp={hp} toast={toast}
          flush={flush} reload={reloadList} onRenamed={(id) => { openScene(id); reloadAny('dialogs'); reloadAny('quests'); }} onDeleted={(id) => { if (scene && scene.id === id) { setScene(null); dirty.current = false; } }} />
        <ProjectActors project={project} save={saveProject} hp={hp} toast={toast} sceneIds={scene ? scene.actors.map((a) => a.id) : null}
          addToScene={(pa) => addActor({ id: pa.id, kind: 'story', ref: pa.id, name: pa.name || pa.id, spawn: { pos: null, yaw: 0 }, existing: false, despawnAtEnd: true })} />
      </aside>

      {/* центр */}
      <section className="st-center">
        <Onboarding open={helpOpen} setOpen={(v) => { setHelpOpen(v); lsSet('help', v); }} hp={hp} />
        {scene ? (
          <Timeline scene={scene} sel={sel} actorSel={actorSel} issueMap={issueMap} playhead={playhead} setPlayhead={setPlayhead}
            onSelect={(s) => { setSel(s); setActorSel(null); }} onSelectActor={(i) => { setSel(null); setActorSel(i); }}
            edit={edit} gesture={gesture} onDragEnd={onDragEnd} onAdd={addEvent} actorMenu={actorMenu} hp={hp} />
        ) : (
          <div className="st-empty card">
            <Icon name="film" size={30} />
            <b>Сцена не выбрана</b>
            <p className="muted small">Создай сцену слева («+ Сцена») или выбери из списка.</p>
          </div>
        )}
        {scene && (
          <div className="st-under" {...hp('После F8 в игре бегунок сам сдвигается на столько тиков — чтобы следующий ключ камеры встал дальше. 0 — не сдвигать.')}>
            <span className="muted small">F8 — ключ камеры у бегунка, потом сдвиг на</span>
            <input className="input sm st-num" value={camStep} onChange={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); setCamStep(n); lsSet('camStep', n); }} />
            <span className="muted small">т · F9 — точка пути в «Идти»</span>
          </div>
        )}
      </section>

      {/* правая колонка */}
      <aside className="st-right">
        <div className="st-insp-wrap">
          {scene ? (
            <Inspector scene={scene} sel={sel} actorSel={actorSel} project={project} api={api} hp={hp} issues={issues} dialogs={dialogs}
              onEvent={onEvent} onEventMany={onEventMany} onActor={onActor} onScene={onScene} onDelete={delEvent} onDuplicate={dupEvent} onRemoveActor={removeActor} />
          ) : <div className="muted small" style={{ padding: 14 }}>Здесь будут свойства выбранного события.</div>}
        </div>
        {hintBoxEl}
      </aside>

      {issuesOpen && scene && (
        <Modal title={issuesOpen === 'play' ? 'В сцене есть ошибки' : 'Проверка сцены'} onClose={() => setIssuesOpen(null)}
          footer={<>
            {issuesOpen === 'play' && <button className="btn" onClick={() => play(true)}>Всё равно проиграть</button>}
            <button className="btn primary" onClick={() => setIssuesOpen(null)}>Понятно</button>
          </>}>
          <IssueRows issues={issues} onPick={(x) => { goIssue(x); setIssuesOpen(null); }} />
        </Modal>
      )}
      {reportEl}
    </div>
  );
}

function LinkCard({ link, boot, setBoot, hp, toast, setLink }) {
  const [port, setPort] = useState(null);
  const info = link.info || {};
  return (
    <div className="st-card">
      <div className={'st-link ' + (link.connected ? 'on' : 'off')} {...hp(link.connected ? 'Студия и игра слышат друг друга: можно проигрывать сцены, брать вид камеры и точки из игры.' : 'Студия ищет игру каждые 3 секунды. Включи «Режим разработчика в игре» ниже и запусти игру через лаунчер.')}>
        <span className="st-led" />
        <span>{link.connected ? 'Игра на связи' : 'Нет связи — запусти игру с режимом разработчика'}</span>
      </div>
      {link.connected && (info.world || info.dim) && <div className="muted small st-world">{[info.world, info.dim].filter(Boolean).join(' · ')}</div>}
      <div {...hp('Создаёт файл studio/.dev рядом с игрой. С ним мод Kokk Story у тебя (и только у тебя — в сборку файл не попадает) читает сцены прямо из Студии, открывает связь с лаунчером и включает клавиши F8/F9/F10. Нужен перезапуск игры.')}>
        <Toggle checked={boot.dev} label="Режим разработчика в игре" hint="нужен перезапуск игры"
          onChange={async (v) => { try { const d = await call('studio:devMode', v); setBoot({ ...boot, dev: d }); toast(d ? 'Режим разработчика включён — перезапусти игру' : 'Режим разработчика выключен', 'ok'); } catch (e) { toast(e.message, 'error'); } }} />
      </div>
      <div className="row st-link-btns">
        <button className="btn sm ghost" disabled={!link.connected} onClick={() => call('studio:reload').then(() => toast('Игра перечитывает сцены', 'ok')).catch((e) => toast(e.message, 'error'))} {...hp('Попросить игру перечитать все сцены с диска (как /vkokk studio reload).')}><Icon name="refresh" size={11} /> Перечитать</button>
        <button className="btn sm ghost icon-btn" onClick={() => call('shell:openPath', 'studio')} {...hp('Открыть папку проекта Студии: project.json и scenes/*.json.')}><Icon name="folder" size={11} /></button>
        <button className="btn sm ghost icon-btn" onClick={() => setPort(port == null ? String(link.port || 47311) : null)} {...hp('Порт связи с игрой (обычно 47311). Меняй, только если поменял его в конфиге мода.')}><Icon name="gear" size={11} /></button>
      </div>
      {port != null && (
        <form className="row" onSubmit={async (e) => { e.preventDefault(); try { setLink(await call('studio:setPort', Number(port))); setPort(null); toast('Порт сохранён', 'ok'); } catch (er) { toast(er.message, 'error'); } }}>
          <span className="small muted">Порт</span><input className="input sm st-num" value={port} onChange={(e) => setPort(e.target.value)} /><button className="btn sm">OK</button>
        </form>
      )}
    </div>
  );
}

function SceneList({ list, cur, open, create, hp, toast, flush, reload, onRenamed, onDeleted }) {
  const [adding, setAdding] = useState(null);
  const [edit, setEdit] = useState(null); // { mode: 'rename'|'dup', id, title, newId }
  const [sure, setSure] = useState(null);
  const submitEdit = async (e) => {
    e.preventDefault();
    const { mode, id, title, newId } = edit;
    if (!isSceneId(newId)) { toast('id сцены — маленькие латинские буквы, цифры, _ и -', 'error'); return; }
    try {
      await flush();
      if (mode === 'rename') {
        if (newId !== id) await call('studio:rename', { from: id, to: newId, title });
        else { const s = await call('studio:read', id); await call('studio:save', { ...s, title }); }
      } else await call('studio:duplicate', { from: id, to: newId, title });
      setEdit(null);
      await reload();
      onRenamed(mode === 'rename' ? newId : newId);
    } catch (er) { toast(er.message, 'error'); }
  };
  return (
    <div className="st-card st-grow">
      <div className="st-card-head" {...hp('Все сцены проекта. Каждая — отдельный файл studio/scenes/<id>.json. Щёлкни, чтобы открыть.')}>
        <b>Сцены</b><span className="muted small">{list.length}</span><div className="grow" />
        <button className="btn sm ghost" onClick={() => setAdding(adding == null ? '' : null)} {...hp('Создать новую сцену. Имя файла (id) придумается из названия латиницей.')}><Icon name="plus" size={11} /> Сцена</button>
      </div>
      {adding != null && (
        <form className="st-mini-form" onSubmit={(e) => { e.preventDefault(); if (!adding.trim()) return; create(adding.trim()); setAdding(null); }}>
          <input className="input sm" autoFocus placeholder="Название, например «Аларик приходит»" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <div className="row"><span className="muted small mono grow">{adding.trim() ? slug(adding) + '.json' : ''}</span><button className="btn sm primary">Создать</button></div>
        </form>
      )}
      <div className="st-list">
        {list.length === 0 && adding == null && <div className="muted small st-pad">Сцен пока нет — нажми «+ Сцена».</div>}
        {list.map((x) => edit && edit.id === x.id ? (
          <form key={x.id} className="st-mini-form" onSubmit={submitEdit}>
            <span className="small muted">{edit.mode === 'rename' ? 'Переименовать' : 'Копия сцены'}</span>
            <input className="input sm" autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} title="Название" />
            <input className="input sm mono" value={edit.newId} onChange={(e) => setEdit({ ...edit, newId: e.target.value.toLowerCase() })} title="id — имя файла: латиница, цифры, _ и -" />
            <div className="row"><button className="btn sm primary">OK</button><button type="button" className="btn sm ghost" onClick={() => setEdit(null)}>Отмена</button></div>
          </form>
        ) : (
          <div key={x.id} className={'st-item' + (cur === x.id ? ' on' : '') + (x.broken ? ' broken' : '')} onClick={() => cur !== x.id && open(x.id)} title={x.broken ? 'Файл не читается: ' + x.broken : x.id + '.json'}>
            <div className="st-item-text">
              <span className="st-item-title">{x.title || x.id}</span>
              <span className="muted small mono">{x.id} · {fmtTicks(x.length || 0)}</span>
            </div>
            <div className="st-item-act" onClick={(e) => e.stopPropagation()}>
              <button className="btn sm ghost icon-btn" title="Переименовать" onClick={() => setEdit({ mode: 'rename', id: x.id, title: x.title, newId: x.id })}><Icon name="pencil" size={10} /></button>
              <button className="btn sm ghost icon-btn" title="Сделать копию" onClick={() => setEdit({ mode: 'dup', id: x.id, title: (x.title || x.id) + ' (копия)', newId: uniqueId(x.id + '_copy', list.map((l) => l.id)) })}><Icon name="copy" size={10} /></button>
              {sure === x.id
                ? <button className="btn sm danger" onClick={async () => { setSure(null); try { await call('studio:delete', x.id); onDeleted(x.id); await reload(); toast('Сцена удалена (копия лежит в studio/.trash)', 'ok'); } catch (e) { toast(e.message, 'error'); } }}>Точно?</button>
                : <button className="btn sm ghost icon-btn" title="Удалить (файл уйдёт в studio/.trash)" onClick={() => { setSure(x.id); setTimeout(() => setSure((s) => (s === x.id ? null : s)), 4000); }}><Icon name="trash" size={10} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectActors({ project, save, hp, toast, sceneIds, addToScene }) {
  const [form, setForm] = useState(null); // { orig, name, id, base, who, type }
  const actors = project.actors || [];
  const submit = (e) => {
    e.preventDefault();
    const f = form;
    const id = (f.id || slug(f.name, 'actor')).trim();
    if (!f.name.trim()) { toast('Напиши имя персонажа', 'error'); return; }
    if (!isActorId(id)) { toast('id — латиница, цифры, _ и -', 'error'); return; }
    if (actors.some((a) => a.id === id && a.id !== f.orig)) { toast('Персонаж с таким id уже есть', 'error'); return; }
    const a = { id, name: f.name.trim(), base: f.base };
    if (f.base === 'valley') a.who = Math.max(0, Math.round(Number(f.who) || 0)); else a.type = (f.type || '').trim();
    const old = f.orig ? actors.find((x) => x.id === f.orig) : null;
    const merged = old ? { ...old, ...a } : a;
    if (merged.base === 'valley') delete merged.type; else delete merged.who;
    save({ ...project, actors: f.orig ? actors.map((x) => (x.id === f.orig ? merged : x)) : [...actors, merged] });
    setForm(null);
  };
  return (
    <div className="st-card">
      <div className="st-card-head" {...hp('Персонажи всего сюжета (project.json). Заведи один раз — и ставь в любые сцены. Основа: житель долины по номеру или любая сущность.')}>
        <b>Актёры проекта</b><span className="muted small">{actors.length}</span><div className="grow" />
        <button className="btn sm ghost" onClick={() => setForm(form ? null : { orig: null, name: '', id: '', base: 'valley', who: 0, type: 'minecraft:villager' })} {...hp('Создать персонажа проекта.')}><Icon name="plus" size={11} /></button>
      </div>
      {form && (
        <form className="st-mini-form" onSubmit={submit}>
          <input className="input sm" autoFocus placeholder="Имя, например Аларик" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} {...hp('Имя персонажа — видно в Студии и в субтитрах.')} />
          <input className="input sm mono" placeholder={'id: ' + slug(form.name || 'actor', 'actor')} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} {...hp('id — короткое имя латиницей. Пусто — придумается из имени.')} />
          <select className="input sm" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} {...hp('Основа персонажа: житель из долины (готовый житель мода по номеру) или любая сущность (кот, голем…).')}>
            <option value="valley">Житель из долины</option>
            <option value="entity">Любая сущность</option>
          </select>
          {form.base === 'valley'
            ? <label className="row small" {...hp('Номер жителя долины (who) — тот же, что в моде Villagers.')}>номер<input className="input sm st-num" value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} /></label>
            : <input className="input sm mono" list="sl-entities" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} {...hp('id сущности, например minecraft:cat.')} />}
          <div className="row"><button className="btn sm primary">{form.orig ? 'Сохранить' : 'Создать'}</button><button type="button" className="btn sm ghost" onClick={() => setForm(null)}>Отмена</button></div>
        </form>
      )}
      <div className="st-list short">
        {actors.length === 0 && !form && <div className="muted small st-pad">Пока никого. «+» — создать.</div>}
        {actors.map((a) => (
          <div key={a.id} className="st-item">
            <div className="st-item-text">
              <span className="st-item-title">{a.name || a.id}</span>
              <span className="muted small mono">{a.base === 'entity' ? a.type : 'житель №' + a.who}</span>
            </div>
            <div className="st-item-act">
              {sceneIds && <button className="btn sm ghost icon-btn" disabled={sceneIds.includes(a.id)} title={sceneIds.includes(a.id) ? 'Уже в сцене' : 'Добавить в открытую сцену'} onClick={() => addToScene(a)}><Icon name="plus" size={10} /></button>}
              <button className="btn sm ghost icon-btn" title="Изменить" onClick={() => setForm({ orig: a.id, name: a.name || '', id: a.id, base: a.base || 'valley', who: a.who || 0, type: a.type || '' })}><Icon name="pencil" size={10} /></button>
              <button className="btn sm ghost icon-btn" title="Удалить из проекта" onClick={() => { if (window.confirm('Удалить персонажа «' + (a.name || a.id) + '» из проекта? В сценах, где он стоит, появится ошибка.')) save({ ...project, actors: actors.filter((x) => x.id !== a.id) }); }}><Icon name="trash" size={10} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Onboarding({ open, setOpen, hp }) {
  return (
    <div className={'st-help' + (open ? ' open' : '')}>
      <button className="st-help-head" onClick={() => setOpen(!open)} {...hp('Короткая инструкция: как сделать первую сцену за 5 шагов. Можно свернуть.')}>
        <Icon name="info" size={13} /> <b>Как сделать первую сцену</b><div className="grow" /><span className="muted small">{open ? 'свернуть' : 'развернуть'}</span>
      </button>
      {open && (
        <ol className="st-help-steps">
          {ONBOARDING.map(([h, t], i) => <li key={i}><b>{h}.</b> <span>{t}</span></li>)}
        </ol>
      )}
    </div>
  );
}

