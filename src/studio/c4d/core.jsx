// Состояние окна «Студия Кокка»: проект, открытая сцена (дерево объектов), выделение, время, история правок,
// живая связь с игрой (сообщения фазы 3), встраивание окна игры. Одно на окно; компоненты берут его через useStudio().
import React, { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { call, on } from '../../lib/api.js';
import { useApp } from '../../lib/app.jsx';
import { validateScene, normalizeScene, defaultScene, varDefault, ERR } from '../validate.js';
import { prepareScene, slug, uniqueId, fmtTicks, getItem } from '../model.js';
import {
  toObjectScene, objById, propsAt, activeCamera, objectsSnapshot, posesAt, actorPosAt, worldPos, clonerOutput,
  isActive, CHANNELS
} from '../scene3d.js';
import { MAX_SEND, placementsBox } from '../mograph.js';
import { structurePlacements } from '../scene3d.js';
import { blocksFromGame } from '../voxel.js';

const isP3 = (p) => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && isFinite(v));
export const REGION_RU = { fill: 'Заполнить', replace: 'Заменить', clear: 'Очистить', copy: 'Копировать', cut: 'Вырезать', paste: 'Вставить', rotate: 'Повернуть', mirror: 'Отразить', capture: 'Сохранить как шаблон', structure: 'Постройка', brush: 'Кисть', bake: 'Запекание' };
import { selToPos } from '../fields.jsx';
import { addObject, patchObj, setChan, keyAllSelected } from './ops.js';

export const StudioCtx = createContext(null);
export const useStudio = () => useContext(StudioCtx);

export const lsGet = (k, d) => { try { const v = localStorage.getItem('studio3.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem('studio3.' + k, JSON.stringify(v)); } catch (_) {} };
const r2 = (n) => Math.round(n * 100) / 100;
const QSTATE_RU = { not_started: 'не начато', active: 'идёт', done: 'сделано', failed: 'провалено' };
export const DEFAULT_HINT = 'Наведи мышку на кнопку или поле — здесь будет подсказка. В игре: F6 — Камера Студии, ПКМ+WASD/QE — полёт (Shift — быстрее), Alt+ЛКМ/СКМ/ПКМ — вращать/двигать/приближать, E/R/T — инструменты.';

export function prepareObjScene(raw, id) { return toObjectScene(prepareScene(raw, id)); }

// withScene: false — для отдельных окон Диалогов/Заданий (им сцена не нужна)
export function useStudioCore({ withScene = true, who = 'window' } = {}) {
  const { toast, gameState } = useApp();
  const [boot, setBoot] = useState(null);
  const [bootErr, setBootErr] = useState(null);
  const [project, setProject] = useState({ actors: [], vars: [] });
  const [list, setList] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [quests, setQuests] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [structures, setStructures] = useState([]);
  const [gameBlocks, setGameBlocks] = useState(null); // палитра игры: [{ id, rgb, flags }] — после {t:'blocks'}
  const [buildSel, setBuildSelState] = useState(() => lsGet('buildSel', { from: null, to: null })); // выделение «Строительства»
  const [buildOps, setBuildOps] = useState(() => lsGet('buildOps', [])); // что сделано в мире (для отмены): [{ undoId, op, at, n }]
  const [scene, setSceneState] = useState(null);
  const [sel, setSelState] = useState({ objs: [], ev: null, stage: null });
  const [selKeys, setSelKeys] = useState([]); // [{ obj, ch, t }] — выбранные ключи на таймлайне / в кривых
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoKey, setAutoKey] = useState(false);
  const [tool, setToolState] = useState(() => lsGet('tool', 'move'));
  const [axes, setAxes] = useState({ x: true, y: true, z: true });
  const [space, setSpace] = useState('world');
  const [snap, setSnap] = useState(() => lsGet('snap', true));
  const [link, setLink] = useState({ connected: false });
  const [embed, setEmbed] = useState({ mode: 'off', helper: 'ok' });
  const [pops, setPops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [saveState, setSaveState] = useState('saved');
  const [game, setGame] = useState({ editorCam: false, lookThrough: null, shaders: null, shadersAvail: null, lights: false, hud: false });
  const [bakeJob, setBakeJob] = useState(null); // { kind:'bake'|'undo', undoId, id, done, total, state }
  const keyActionRef = useRef(null); // команды Студии для клавиш, нажатых в игре (ставит окно)
  const dragTr = useRef(new Set()); // объекты, которые сейчас тянут гизмо в игре (история — одна запись на жест)
  const [gameVars, setGameVarsState] = useState(null);
  const [questStates, setQuestStates] = useState({});
  const [camStep] = useState(() => lsGet('camStep', 40));
  const [brushOn, setBrushOn] = useState(false);
  const [brushState, setBrushState] = useState(null); // что сообщила игра о кисти (размер после Ctrl+колеса)
  const [clipboard, setClipboard] = useState(null); // буфер копии в игре: { size, blocks, entities }
  const [, force] = useState(0);

  const sceneRef = useRef(null);
  const selRef = useRef(sel);
  const timeRef = useRef(0);
  const linkRef = useRef(link);
  const hist = useRef({ past: [], future: [], key: null, at: 0 });
  const dirty = useRef(false);
  const saveTimer = useRef(null);
  const lastTool = useRef('move');
  const autoKeyRef = useRef(false);
  selRef.current = sel;
  linkRef.current = link;
  autoKeyRef.current = autoKey;

  const hp = useCallback((text) => (text ? { title: text, onMouseEnter: () => setHint(text) } : {}), []);
  const addLog = useCallback((level, text) => setLogs((l) => [...l.slice(-299), { at: Date.now(), level, text }]), []);
  const setTime = useCallback((t) => { const v = Math.max(0, Math.round(t)); timeRef.current = v; setTimeState(v); }, []);
  const setSel = useCallback((s) => { const v = { objs: [], ev: null, stage: null, ...s }; selRef.current = v; setSelState(v); }, []);
  const setTool = useCallback((t) => { setToolState((cur) => { if (cur !== t) lastTool.current = cur; return t; }); lsSet('tool', t); }, []);
  const toggleLastTool = useCallback(() => setTool(lastTool.current || 'move'), [setTool]);

  const send = useCallback((msg) => {
    if (!linkRef.current.connected) return Promise.resolve(false);
    return call('studio:send', msg).catch(() => false);
  }, []);
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
  const markDirty = useCallback(() => {
    dirty.current = true;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 800);
  }, [flush]);
  const setScene = (s) => { sceneRef.current = s; setSceneState(s); };
  // правка: opt.key — слить с прошлой правкой того же поля; opt.silent — без истории (перетаскивание, после gesture())
  const edit = useCallback((fn, opt = {}) => {
    const prev = sceneRef.current;
    if (!prev) return null;
    const next = fn(prev);
    if (!next || next === prev) return prev;
    const h = hist.current;
    if (!opt.silent) {
      const now = Date.now();
      if (!(opt.key && opt.key === h.key && now - h.at < 1500)) { h.past.push(prev); if (h.past.length > 300) h.past.shift(); }
      h.key = opt.key || null; h.at = now; h.future = [];
    }
    setScene(next);
    markDirty();
    return next;
  }, [markDirty]);
  const gesture = useCallback(() => { const h = hist.current; if (!sceneRef.current) return; h.past.push(sceneRef.current); h.future = []; h.key = null; }, []);
  const fixSel = () => {
    const s = sceneRef.current;
    const cur = selRef.current;
    setSel({ objs: cur.objs.filter((id) => objById(s, id)), ev: cur.ev && getItem(s, cur.ev) ? cur.ev : null, stage: cur.stage != null && (s.stage || [])[cur.stage] ? cur.stage : null });
  };
  const undo = useCallback(() => { const h = hist.current; if (!h.past.length) return; h.future.push(sceneRef.current); setScene(h.past.pop()); h.key = null; fixSel(); markDirty(); force((n) => n + 1); }, [markDirty]); // eslint-disable-line
  const redo = useCallback(() => { const h = hist.current; if (!h.future.length) return; h.past.push(sceneRef.current); setScene(h.future.pop()); h.key = null; fixSel(); markDirty(); force((n) => n + 1); }, [markDirty]); // eslint-disable-line

  // ---------- загрузка ----------
  const openScene = useCallback(async (id) => {
    await flush();
    try {
      const raw = await call('studio:read', id);
      const s = prepareObjScene(raw, id);
      hist.current = { past: [], future: [], key: null, at: 0 };
      setScene(s); setSel({}); setSelKeys([]); setTime(0); setPlaying(false);
      lsSet('last', id);
    } catch (e) { toast(e.message, 'error', 8000); }
  }, [flush, toast, setTime, setSel]);
  const reloadList = useCallback(async () => { const l = (await call('studio:list')) || []; setList(l); return l; }, []);
  const reloadAny = useCallback(async (kind) => {
    if (kind === 'scenes') return reloadList();
    if (kind === 'structures') { const s = (await call('studio:structList')) || []; setStructures(s); return s; }
    const l = (await call('studio:docList', kind)) || [];
    if (kind === 'dialogs') setDialogs(l); else if (kind === 'schemes') setSchemes(l); else setQuests(l);
    return l;
  }, [reloadList]);
  const patchList = useCallback((kind, item) => {
    const f = (l) => (l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...l, item]);
    if (kind === 'dialogs') setDialogs(f); else if (kind === 'schemes') setSchemes(f); else setQuests(f);
  }, []);
  const createScene = useCallback(async (title) => {
    const id = uniqueId(slug(title), list.map((x) => x.id));
    const base = defaultScene(id, title);
    // новая сцена сразу «по-новому»: камера + «Монтаж»
    let s = toObjectScene({ ...base, tracks: [] });
    s = addObject(s, 'camera', { name: 'Камера 1', props: { pos: [0, 70, 0] } }).scene;
    try {
      await call('studio:save', s);
      await reloadList();
      await openScene(id);
    } catch (e) { toast(e.message, 'error'); }
  }, [list, reloadList, openScene, toast]);
  const saveProject = useCallback(async (p) => {
    setProject(p);
    try { setProject(await call('studio:project', p)); } catch (e) { toast('Проект не сохранился: ' + e.message, 'error'); }
  }, [toast]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const addVar = useCallback((name, type) => {
    const p = projectRef.current;
    if ((p.vars || []).some((v) => v.name === name)) return;
    saveProject({ ...p, vars: [...(p.vars || []), { name, type: type || 'bool', init: varDefault(type || 'bool'), note: '' }] });
    toast('Переменная «' + name + '» заведена', 'ok', 3000);
  }, [saveProject, toast]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await call('studio:open');
        if (!alive) return;
        setBoot(b); setProject(b.project || { actors: [] }); setList(b.scenes || []); setDialogs(b.dialogs || []); setQuests(b.quests || []); setSchemes(b.schemes || []); setStructures(b.structures || []);
        if (b.link) setLink(b.link);
        if (withScene) {
          const last = lsGet('last', null);
          const pick = (b.scenes || []).find((x) => x.id === last) || (b.scenes || [])[0];
          if (pick) openScene(pick.id);
        }
      } catch (e) { setBootErr(e.message); }
      call('studio:link', true, who).then((st) => st && alive && setLink(st)).catch(() => {});
      call('studio:winState').then((w) => { if (!alive || !w) return; if (w.embed) setEmbed(w.embed); if (w.pops) setPops(w.pops); }).catch(() => {});
    })();
    const onUnload = () => { flush(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { alive = false; window.removeEventListener('beforeunload', onUnload); flush(); call('studio:link', false, who).catch(() => {}); };
  }, []); // eslint-disable-line

  // ---------- сообщения игры ----------
  const setGameVars = useCallback((m) => {
    if (!m) { setGameVarsState(null); return; }
    setGameVarsState({ vars: m.data && typeof m.data === 'object' ? m.data : {}, quests: m.quests || null, at: Date.now() });
    if (m.quests && typeof m.quests === 'object') setQuestStates((q) => ({ ...q, ...Object.fromEntries(Object.entries(m.quests).map(([id, st]) => [id, { ...st, id }])) }));
  }, []);
  const onMsgRef = useRef(null);
  onMsgRef.current = (m) => {
    const s = sceneRef.current;
    switch (m.t) {
      case 'log': addLog(m.level || 'info', m.text || ''); break;
      case 'hello': addLog('ok', 'Игра: ' + [m.world, m.dim, m.ver && 'версия ' + m.ver].filter(Boolean).join(' · ')); break;
      case 'played':
        addLog(m.ok ? 'ok' : 'error', (m.ok ? 'Сыграно: ' : 'Не сыграло: ') + (m.scene || '') + (m.error ? ' — ' + m.error : ''));
        if (!m.ok) { setPlaying(false); toast('Игра: ' + (m.error || 'сцена не сыграла'), 'error', 8000); }
        break;
      case 'vars': setGameVars(m); break;
      case 'questState':
        setQuestStates((q) => ({ ...q, [m.id]: m }));
        addLog('info', 'Задание «' + m.id + '»: ' + (QSTATE_RU[m.state] || m.state) + (m.step ? ', шаг ' + m.step : ''));
        break;
      case 'result':
        addLog(m.ok ? 'ok' : 'error', (m.op || 'Команда') + (m.id ? ' «' + m.id + '»' : '') + ': ' + (m.ok ? 'готово' : 'не вышло — ' + (m.error || '?')));
        break;
      case 'editorCam': setGame((g) => ({ ...g, editorCam: !!m.on, lookThrough: m.lookThrough !== undefined ? m.lookThrough || null : g.lookThrough })); break;
      case 'lookThrough': setGame((g) => ({ ...g, lookThrough: m.id || null })); if (!m.id && m.reason) addLog('info', 'Взгляд через камеру снят: камеру Студии сдвинули в игре'); break;
      case 'lights': setGame((g) => ({ ...g, lights: !!m.on })); if (m.on && m.blocked) addLog('warn', 'Свет: ' + m.blocked + ' блок(ов) не поставлено — там твёрдый блок'); break;
      case 'tool':
        if (m.tool && ['select', 'move', 'rotate', 'scale'].includes(m.tool)) setToolState(m.tool);
        if (m.axes && typeof m.axes === 'object') setAxes({ x: m.axes.x !== false, y: m.axes.y !== false, z: m.axes.z !== false });
        if (m.space === 'world' || m.space === 'object') setSpace(m.space);
        break;
      case 'ghost': if (m.cut) addLog('warn', 'Призрак «' + m.id + '»: не поместилось ' + m.cut + ' блоков (предел ' + (m.max || 20000) + ')'); break;
      case 'bake': case 'undo': {
        const kind = m.t;
        // правки «Строительства» (fill/replace/clear/cut/paste/rotate/mirror/structure/brush) приходят как bake с op
        if (kind === 'bake' && m.op && m.op !== 'bake') {
          if (m.state === 'error') { addLog('error', (REGION_RU[m.op] || m.op) + ': не вышло — ' + (m.error || '?')); toast((REGION_RU[m.op] || m.op) + ': ' + (m.error || 'не вышло'), 'error', 6000); setBakeJob(null); break; }
          if (m.state === 'progress') { setBakeJob({ kind, undoId: m.undoId, id: m.id, done: m.done || 0, total: m.total || 0, state: 'progress', op: m.op }); break; }
          if (m.state === 'done') { setBakeJob(null); if (m.undoId) noteBuildOp({ undoId: m.undoId, op: m.op, n: m.placed != null ? m.placed : m.done || m.total || 0 }); addLog('ok', (REGION_RU[m.op] || m.op) + ': ' + (m.placed != null ? m.placed : m.done || 0) + ' блоков'); }
          break;
        }
        if (m.state === 'progress') setBakeJob({ kind, undoId: m.undoId, id: m.id, done: m.done || 0, total: m.total || 0, state: 'progress' });
        else {
          setBakeJob(null);
          if (m.state === 'error') { addLog('error', (kind === 'bake' ? 'Запекание' : 'Отмена запекания') + ' не удалась: ' + (m.error || '?')); toast((kind === 'bake' ? 'Запекание' : 'Отмена') + ' не удалась: ' + (m.error || '?'), 'error', 7000); if (kind === 'bake' && m.undoId) edit((sc) => ({ ...sc, bakes: (sc.bakes || []).filter((b) => b.undoId !== m.undoId) }), { silent: true }); }
          else if (m.state === 'done') {
            const txt = kind === 'bake' ? 'Запечено в мир: ' + (m.placed != null ? m.placed : m.done || 0) + ' блоков' + (m.skipped ? ', пропущено ' + m.skipped : '') : 'Запекание отменено' + (m.restored != null ? ': возвращено ' + m.restored : '');
            addLog('ok', txt); toast(txt, 'ok', 3500);
          }
        }
        break;
      }
      case 'undoList': addLog('info', 'В игре можно отменить запечек: ' + ((m.items || []).length)); break;
      // ---- фаза 4: Строительство ----
      case 'blocks': { const b = blocksFromGame(m); if (b && b.length) { setGameBlocks(b); addLog('ok', 'Палитра блоков из игры: ' + b.length); } break; }
      // рамка в игре (B / Shift+ЛКМ в Камере Студии): {t:'box', from, to, size, volume}
      case 'box': setBuildSel({ from: isP3(m.from) ? m.from.map(Math.floor) : null, to: isP3(m.to) ? m.to.map(Math.floor) : null }, true); break;
      case 'structure':
        if (m.op !== 'saved') break;
        if (m.ok === false) { addLog('error', 'Шаблон не сохранился: ' + (m.error || '?')); toast('Шаблон не сохранился: ' + (m.error || '?'), 'error', 7000); } else { const mt = m.meta || {}; addLog('ok', 'Шаблон сохранён: ' + m.id + (Array.isArray(mt.size) ? ' (' + mt.size.join('×') + ')' : '')); toast('Шаблон «' + (mt.name || m.id) + '» сохранён в библиотеку', 'ok'); reloadAny('structures'); }
        break;
      case 'clipboard': setClipboard(m.size ? m : null); break;
      case 'brush': if (m.shape) setBrushState((b) => ({ ...b, ...m })); break;
      case 'shaders': setGame((g) => ({ ...g, shaders: m.on == null ? g.shaders : !!m.on, shadersAvail: m.available == null ? g.shadersAvail : !!m.available })); break;
      case 'baked': addLog(m.ok === false ? 'error' : 'ok', m.ok === false ? 'Запекание не удалось: ' + (m.error || '?') : 'Запечено в мир: ' + (m.count || 0) + ' блоков'); break;
      case 'undone': addLog(m.ok === false ? 'error' : 'ok', m.ok === false ? 'Отмена запекания не удалась: ' + (m.error || '?') : 'Запекание отменено'); break;
      case 'select': {
        if (!s) break;
        const ids = (Array.isArray(m.ids) ? m.ids : m.id ? [m.id] : []).filter((id) => objById(s, id));
        if (m.add) {
          const cur = selRef.current.objs;
          const next = cur.slice();
          for (const id of ids) { const i = next.indexOf(id); if (i >= 0) next.splice(i, 1); else next.push(id); }
          setSel({ objs: next });
        } else setSel({ objs: ids });
        if (!ids.length && (m.block || m.entity)) setHint('В игре выбран ' + (m.entity ? 'моб ' + (m.entity.name || m.entity.type || '') : 'блок ' + (m.blockId || '') + ' ' + (m.block || []).join(' ')) + ' — это не объект Студии');
        break;
      }
      case 'transform': {
        if (!s) break;
        applyTransform(m);
        break;
      }
      case 'key':
        if (['undo', 'redo', 'delete', 'clone', 'group', 'save', 'keyAll'].includes(m.name)) {
          if (Array.isArray(m.ids) && s) { const ids = m.ids.filter((id) => objById(s, id)); if (ids.length) setSel({ objs: ids }); }
          if (keyActionRef.current) keyActionRef.current(m.name);
          break;
        }
        if (!s) { toast('Открой сцену, чтобы ставить ключи из игры', 'warn'); break; }
        if (m.name === 'camKey') camKeyFromGame(m.view);
        else if (m.name === 'pathPoint') pathPointFromGame(m);
        else if (m.name === 'playStop') setPlaying((p) => !p);
        else addLog('info', 'Клавиша в игре: ' + m.name);
        break;
      default:
    }
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
    if (d.msg && onMsgRef.current) onMsgRef.current(d.msg);
  }), [addLog]);
  useEffect(() => on('studio-embed', (e) => { if (e) { setEmbed(e); if (e.why) addLog(e.mode === 'embedded' ? 'ok' : 'warn', e.why); } }), [addLog]);
  useEffect(() => on('studio-win', (w) => { if (w && w.type === 'pops') setPops(w.pops || []); }), []);

  // игра двигает гизмо: { id, pos:[x,y,z] (мировые), rot:[yaw,pitch,roll], point?, final } — не чаще раза в 50 мс;
  // в историю правок жест попадает одной записью (в начале), final:true — отпустили мышь
  const applyTransform = (m) => {
    const s = sceneRef.current;
    const o = objById(s, m.id);
    if (!o) return;
    const t = timeRef.current;
    const ak = autoKeyRef.current;
    if (!dragTr.current.has(o.id)) { gesture(); dragTr.current.add(o.id); }
    if (m.final) dragTr.current.delete(o.id);
    const rot = Array.isArray(m.rot) ? { h: m.rot[0], p: m.rot[1], b: m.rot[2] } : m.rot && typeof m.rot === 'object' ? { h: m.rot.yaw, p: m.rot.pitch, b: m.rot.roll } : null;
    edit((sc) => {
      let x = sc;
      const cur = objById(sc, o.id);
      if (o.type === 'actor') {
        const a = (sc.actors || []).find((q) => q.id === o.actor);
        if (!a) return sc;
        const spawn = { ...(a.spawn || {}) };
        if (Array.isArray(m.pos)) spawn.pos = m.pos.map(r2);
        if (rot && typeof rot.h === 'number') spawn.yaw = r2(rot.h);
        return { ...sc, actors: sc.actors.map((q) => (q.id === a.id ? { ...q, spawn } : q)) };
      }
      const wp = worldPos(sc, cur, t) || [0, 0, 0];
      const own = propsAt(cur, t).pos || [0, 0, 0];
      const parentOff = wp.map((v, i) => v - own[i]);
      // точка пути / дополнительная позиция света
      if (Number.isInteger(m.point) && Array.isArray(m.pos)) {
        if (cur.type === 'path') {
          const pts = (cur.props.points || []).slice();
          if (!pts[m.point]) return sc;
          pts[m.point] = m.pos.map((v, i) => r2(v - wp[i]));
          return patchObj(sc, cur.id, { props: { ...cur.props, points: pts } });
        }
        if (cur.type === 'light') {
          const ps = (cur.props.positions || []).slice();
          if (!ps[m.point]) return sc;
          ps[m.point] = m.pos.map((v, i) => Math.floor(v - parentOff[i]));
          return patchObj(sc, cur.id, { props: { ...cur.props, positions: ps } });
        }
      }
      if (Array.isArray(m.pos) && m.pos.length === 3) {
        const local = m.pos.map((v, i) => r2(v - parentOff[i]));
        ['x', 'y', 'z'].forEach((ax, i) => { if (local[i] !== own[i]) x = setChan(x, o.id, 'pos.' + ax, t, local[i], ak); });
      }
      if (rot && cur.type === 'camera') for (const k of ['h', 'p', 'b']) if (typeof rot[k] === 'number') x = setChan(x, o.id, 'rot.' + k, t, r2(rot[k]), ak);
      return x;
    }, { silent: true });
  };
  // F8 в игре: ключ выбранной (или активной) камеры из вида игрока
  const camKeyFromGame = async (view) => {
    let v = view;
    try { if (!v || !Array.isArray(v.pos)) v = await api.getView(); } catch (e) { toast(e.message, 'error'); return; }
    const s = sceneRef.current;
    const t = timeRef.current;
    let cam = selRef.current.objs.map((id) => objById(s, id)).find((o) => o && o.type === 'camera') || activeCamera(s, t);
    let next = s;
    if (!cam) { const r = addObject(s, 'camera', { props: { pos: v.pos } }); next = r.scene; cam = objById(next, r.id); }
    const vals = { 'pos.x': r2(v.pos[0]), 'pos.y': r2(v.pos[1]), 'pos.z': r2(v.pos[2]), 'rot.h': Math.round((v.yaw || 0) * 10) / 10, 'rot.p': Math.round((v.pitch || 0) * 10) / 10, fov: Math.round(v.fov || 70) };
    for (const ch of Object.keys(vals)) next = setChan(next, cam.id, ch, t, vals[ch], true);
    edit(() => next);
    setSel({ objs: [cam.id] });
    toast('Ключ камеры «' + cam.name + '»: ' + fmtTicks(t), 'ok', 2000);
    if (camStep > 0) setTime(t + camStep);
  };
  const pathPointFromGame = async (m) => {
    const s = sceneRef.current;
    let p = Array.isArray(m.pos) ? m.pos : m.sel ? selToPos(m.sel) : null;
    if (!p) { try { p = selToPos(await api.getSel()); } catch (e) { toast(e.message, 'error'); return; } }
    if (!p) { toast('В игре прицел ни на что не наведён', 'warn'); return; }
    const po = selRef.current.objs.map((id) => objById(s, id)).find((o) => o && o.type === 'path');
    if (po) {
      const off = po.props.pos || [0, 0, 0];
      edit((sc) => patchObj(sc, po.id, (o) => ({ ...o, props: { ...o.props, points: [...(o.props.points || []), p.map((v, i) => r2(v - off[i]))] } })));
      toast('Точка пути «' + po.name + '»: ' + ((po.props.points || []).length + 1), 'ok', 2000);
      return;
    }
    const ev = selRef.current.ev && getItem(s, selRef.current.ev);
    if (ev && ev.do === 'walk') {
      const cur = selRef.current.ev;
      edit((sc) => ({ ...sc, tracks: sc.tracks.map((tr) => (tr.kind === 'actor' && 'actor:' + tr.actor === cur.track ? { ...tr, events: tr.events.map((e, i) => (i === cur.i ? { ...e, path: [...(e.path || []), p] } : e)) } : tr)) }));
      toast('Точка пути актёра', 'ok', 2000);
      return;
    }
    toast('Выбери объект «Путь» или событие «Идти» — F9 добавляет точки в него', 'warn', 6000);
  };

  // ---------- проверка ----------
  // ---------- «Строительство»: выделение, кисть, операции в мире ----------
  const setBuildSel = useCallback((v, fromGame) => {
    setBuildSelState(v); lsSet('buildSel', v);
    if (!fromGame && linkRef.current.connected) call('studio:send', isP3(v.from) && isP3(v.to) ? { t: 'box', from: v.from, to: v.to } : { t: 'box', clear: true }).catch(() => {});
  }, []);
  // правка рамки: fill / replace / clear / copy / paste / rotate / mirror / capture — сообщения игры фазы 4.
  // Без углов в Студии игра берёт свою рамку. Ответ — {t:'bake', op, undoId, state…} (отмена — по undoId из ответа).
  const regionOp = useCallback(async (op, extra) => {
    const sl = buildSelRef.current;
    if (!linkRef.current.connected) { toast('Нет связи с игрой', 'warn'); return null; }
    const box = isP3(sl.from) && isP3(sl.to) ? { from: sl.from, to: sl.to } : {};
    const msg = { t: op, ...(op === 'paste' ? {} : box), ...extra };
    try {
      await call('studio:send', msg);
      addLog('info', (REGION_RU[op] || op) + ' → игра' + (op !== 'paste' && !box.from ? ' (рамка из игры)' : ''));
      return true;
    } catch (e) { toast(e.message, 'error'); return null; }
  }, [toast, addLog]);
  const undoBuild = useCallback(async (undoId) => {
    try { await call('studio:undoBake', undoId); setBuildOps((l) => { const n = l.filter((x) => x.undoId !== undoId); lsSet('buildOps', n); return n; }); toast('Отменяю — игра возвращает блоки как были', 'ok', 2500); } catch (e) { toast(e.message, 'error'); }
  }, [toast]);
  const noteBuildOp = useCallback((rec) => setBuildOps((l) => { const n = [...l.filter((x) => !rec.undoId || x.undoId !== rec.undoId), { at: Date.now(), ...rec }].slice(-30); lsSet('buildOps', n); return n; }), []);
  useEffect(() => { if (link.connected) call('studio:send', { t: 'getBox' }).catch(() => {}); }, [link.connected]);
  const buildSelRef = useRef(buildSel);
  buildSelRef.current = buildSel;

  const lazyScene = useDeferredValue(scene);
  const issues = useMemo(() => (lazyScene ? validateScene(lazyScene, { project, ids: list.map((x) => x.id), dialogIds: dialogs.map((x) => x.id) }) : []), [lazyScene, project, list, dialogs]);
  const nErr = issues.filter((x) => x.sev === ERR).length;

  // ---------- проигрывание ----------
  useEffect(() => {
    if (!playing) return undefined;
    const t0 = timeRef.current >= ((sceneRef.current && sceneRef.current.length) || 0) ? 0 : timeRef.current;
    const start = performance.now();
    let raf;
    const len = (sceneRef.current && sceneRef.current.length) || 0;
    const step = () => {
      const t = t0 + Math.round(((performance.now() - start) / 1000) * 20);
      if (t >= len) { setTime(len); setPlaying(false); return; }
      setTime(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, setTime]);
  const playInGame = useCallback(async (forceIt) => {
    const s = sceneRef.current;
    if (!s) return false;
    if (!linkRef.current.connected) { toast('Нет связи с игрой — запусти игру с режимом разработчика', 'warn', 6000); return false; }
    if (nErr && !forceIt) return 'issues';
    try { await call('studio:play', normalizeScene(s)); setTime(0); setPlaying(true); addLog('info', 'Отправил в игру: ' + s.id); return true; } catch (e) { toast(e.message, 'error'); return false; }
  }, [nErr, toast, setTime, addLog]);
  const stopInGame = useCallback(async () => { setPlaying(false); try { await call('studio:stop'); } catch (_) {} }, []);

  // ---------- живая связь: объекты, время, выделение, инструменты ----------
  const connected = !!link.connected;
  const selKey = sel.objs.join(',');
  // объекты в момент бегунка (мировые координаты); при проигрывании — только позы через {t:'time'}
  useEffect(() => {
    if (!connected || !scene || playing) return undefined;
    const tm = setTimeout(() => {
      const t = timeRef.current;
      const cam = activeCamera(scene, t);
      send({ t: 'objects', data: { scene: scene.id, time: t, length: scene.length, active: cam ? cam.id : null, objects: objectsSnapshot(scene, t, selRef.current.objs) } });
    }, 150);
    return () => clearTimeout(tm);
  }, [connected, scene, selKey, time, playing, send]);
  // время: готовые позы камер, актёров и анимированных объектов — игра берёт их вместо своего расчёта
  useEffect(() => {
    if (!connected || !scene) return undefined;
    const tm = setTimeout(() => {
      const t = timeRef.current;
      // поле «t» занято типом сообщения, поэтому время — в «time» (и «tick» на всякий случай)
      send({ t: 'time', time: t, tick: t, playing, poses: posesAt(scene, t) });
    }, playing ? 0 : 30);
    return () => clearTimeout(tm);
  }, [connected, scene, time, playing, send]);
  useEffect(() => { if (connected) send({ t: 'select', ids: sel.objs }); }, [connected, selKey, send]); // eslint-disable-line
  // snap для игры — шаг в блоках (0 — без привязки), rotSnap — шаг поворота в градусах
  useEffect(() => { if (connected) send({ t: 'tool', tool, axes, space, snap: snap ? 1 : 0, rotSnap: snap ? 15 : 0 }); }, [connected, tool, axes, space, snap, send]);
  // призраки клонеров (props.preview): обновляются после правок; выключенный клонер — убрать
  const ghostSent = useRef(new Set());
  useEffect(() => {
    if (!connected || !scene) return undefined;
    const tm = setTimeout(() => {
      const want = new Set();
      for (const o of scene.objects || []) {
        if (!['cloner', 'structure'].includes(o.type) || !o.props.preview || o.visible === false || !isActive(scene, o)) continue;
        want.add(o.id);
        let pl = [];
        try { pl = (o.type === 'structure' ? structurePlacements(scene, o, timeRef.current) : clonerOutput(scene, o, timeRef.current)).slice(0, MAX_SEND); } catch (_) {}
        call('studio:ghost', { id: o.id, placements: pl }).catch(() => {});
      }
      for (const id of ghostSent.current) if (!want.has(id)) call('studio:ghost', { id, placements: [] }).catch(() => {});
      ghostSent.current = want;
    }, 300);
    return () => clearTimeout(tm);
  }, [connected, scene]);

  // ---------- команды редактора в игре ----------
  const gameCmd = useMemo(() => ({
    editorCam: (on) => { setGame((g) => ({ ...g, editorCam: on })); send({ t: 'editorCam', on }); },
    lookThrough: (id) => {
      setGame((g) => ({ ...g, lookThrough: id, editorCam: id ? true : g.editorCam }));
      send({ t: 'lookThrough', id: id || null });
    },
    shaders: async (on) => {
      setGame((g) => ({ ...g, shaders: on }));
      try { const r = await call('studio:shaders', on); if (r) setGame((g) => ({ ...g, shaders: r.on == null ? on : !!r.on, shadersAvail: r.available !== false })); if (r && r.available === false) toast('В игре нет Iris — шейдеры не переключить', 'warn'); } catch (e) { toast(e.message, 'warn'); }
    },
    lights: (on) => { setGame((g) => ({ ...g, lights: on })); send({ t: 'lights', on }); },
    hud: (hide) => { setGame((g) => ({ ...g, hud: hide })); send({ t: 'hud', hide }); },
    frame: () => {
      const s = sceneRef.current;
      const ids = selRef.current.objs;
      if (!s || !ids.length) { toast('Выбери объект — H покажет его в игре', 'warn'); return; }
      const pts = [];
      for (const id of ids) {
        const o = objById(s, id);
        if (!o) continue;
        if (o.type === 'cloner') { try { const b = placementsBox(clonerOutput(s, o, timeRef.current)); if (b) { pts.push(b.lo, b.hi); continue; } } catch (_) {} }
        if (o.type === 'actor') { const p = actorPosAt(s, o.actor, timeRef.current); if (p) pts.push(p.pos); continue; }
        if (o.type === 'structure') { const st = structures.find((x) => x.id === o.props.structure); const wp = worldPos(s, o, timeRef.current); if (wp && st && Array.isArray(st.size)) { pts.push(wp, wp.map((v, i) => v + st.size[i])); continue; } }
        if (o.type === 'path') { const wp = worldPos(s, o, timeRef.current) || [0, 0, 0]; for (const q of o.props.points || []) pts.push(q.map((v, i) => v + wp[i])); continue; }
        const wp = worldPos(s, o, timeRef.current);
        if (wp) pts.push(wp);
      }
      if (!pts.length) { toast('У выбранного нет места в мире', 'warn'); return; }
      const b = placementsBox(pts.map((p) => ({ pos: p })));
      send({ t: 'frame', ids, id: ids[0], pos: b.center.map(r2), dist: r2(Math.max(6, b.radius * 2.5)) });
      if (!linkRef.current.connected) toast('Нет связи с игрой — показать выбранное негде', 'warn');
    },
    keyAll: () => {
      const ids = selRef.current.objs;
      if (!ids.length) { toast('Выбери объекты — F9 поставит им ключи', 'warn'); return; }
      edit((s) => keyAllSelected(s, ids, timeRef.current));
      toast('Ключи на ' + ids.length + ' объект(а): ' + fmtTicks(timeRef.current), 'ok', 1800);
    }
  }), [send, toast, edit, structures]);

  const embedCmd = useCallback(async (mode) => {
    try { const st = await call('studio:embed', mode); if (st) setEmbed(st); } catch (e) { toast(e.message, 'error', 7000); }
  }, [toast]);

  const baseRefs = useMemo(() => ({ actors: project.actors || [], vars: project.vars || [], scenes: list, dialogs, quests, schemes, structures, addVar, talkPriority: project.talkPriority || 0 }), [project, list, dialogs, quests, schemes, structures, addVar]);

  return {
    boot, setBoot, bootErr, project, saveProject, list, setList, dialogs, quests, schemes, structures, reloadList, reloadAny, patchList, baseRefs, addVar,
    gameBlocks, setGameBlocks, buildSel, setBuildSel, regionOp, buildOps, undoBuild, noteBuildOp, brushOn, setBrushOn, brushState, clipboard,
    scene, sceneRef, edit, gesture, undo, redo, canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0, flush, saveState,
    openScene, createScene, setScene: (s) => { setScene(s); }, markDirty,
    sel, setSel, selRef, selKeys, setSelKeys, time, setTime, timeRef, playing, setPlaying, autoKey, setAutoKey,
    tool, setTool, toggleLastTool, axes, setAxes, space, setSpace, snap: snap, setSnap: (v) => { setSnap(v); lsSet('snap', v); },
    link, setLink, api, send, embed, embedCmd, pops, logs, addLog, hint, setHint, hp, toast, game, gameCmd, gameState,
    issues, nErr, playInGame, stopInGame, gameVars, setGameVars, setGameVarsState, questStates, bakeJob, keyActionRef,
    channelsOf: (o) => (o ? CHANNELS[o.type] || [] : [])
  };
}

export function StudioProvider({ value, children }) { return <StudioCtx.Provider value={value}>{children}</StudioCtx.Provider>; }
