// Макет «Анимации» Студии Кокка: слева «Библиотека» (встроенные, проекта, перекрытые), в центре — модель (игрок со своим
// скином и деталями персонажа, житель, житель долины) с выбором кости и гизмо, справа — кости и их значения с ◇ ключами,
// настройки анимации, события, проверка; внизу — таймлайн (ключи, кривые, рамка, копия/вставка, длина, по кругу).
// «▶ В игре» играет анимацию на тебе или на том, на кого смотришь (через связь Студии), правки идут в игру сразу.
// Файлы — studio/projects/<проект>/anims/<id>.json; «Собрать» кладёт их в config/skinkokk/anims/ (их играет SkinKokk).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, on } from '../../lib/api.js';
import { StudioCtx, lsGet, lsSet } from '../c4d/core.jsx';
import I from '../c4d/icons.jsx';
import { Modal } from '../c4d/StudioApp.jsx';
import { Num, ARow, KeyBtn, Sec, Check, Text, Select } from '../c4d/Attributes.jsx';
import { useMenu, MenuView } from '../c4d/Menus.jsx';
import { learnMark } from '../learn/index.jsx';
import { slug, uniqueId } from '../model.js';
import {
  playerRig, villagerRig, solvePose, rotKeyFromWorld, eulerZYX, mul3, tr3, DEG, r3, boneRu, BONE_HINT, TARGETS, CATS, MODES, CHANNELS,
  CHANNEL_RU, CHANNEL_UNIT, SPRING_FIELDS, SPRING_DEF, EVENT_KINDS, newAnim, normalizeAnim, cleanAnim, validateAnim, animValues, blendWeight,
  RIG_BONES, springStep, app3, fmtT, boneMode
} from './animCore.js';
import { ANIM_LIBRARY, builtinAnim, BUILTIN_IDS } from './animLib.js';
import {
  setKey, setKeyComp, valueAt, keyState, deleteKeys, copyKeys, pasteKeys, keyBone, mirrorAll, mirrorPoseAt, retime, clearBone, hasKey
} from './animOps.js';
import AnimView, { defaultPlayerTexture, defaultVillagerTexture } from './AnimView.jsx';
import AnimTimeline, { evKind } from './AnimTimeline.jsx';
import './anim.css';

// персонаж трека A (src/lib/characterRig.js) — если он есть; без него — просто скин
let charRig = null;
try {
  const mods = typeof import.meta !== 'undefined' && import.meta.glob ? import.meta.glob('../../lib/characterRig.js', { eager: true }) : {};
  charRig = Object.values(mods)[0] || null;
} catch (_) { charRig = null; }

const MODELS = [
  ['player', 'Игрок (мой скин)', 'Твой скин из лаунчера (широкие или тонкие руки — как у скина) и детали «Персонажа».'],
  ['alex', 'Игрок — тонкие руки', 'Модель с руками в 3 пикселя (как Алекс).'],
  ['villager', 'Житель', 'Житель Villagers, Kokk: руки скрещены, пока анимация не двигает правую или левую руку.'],
  ['valley', 'Житель долины', 'Жители долины Kokk Story — модель как у игрока.']
];
const VIEWS = [['front', 'Спереди', 0, 0.12], ['side', 'Сбоку', Math.PI / 2, 0.08], ['back', 'Сзади', Math.PI, 0.12], ['top', 'Сверху', 0.3, 1.3], ['persp', '¾', 0.6, 0.32]];
const DEF_CAM = { yaw: 0.6, pitch: 0.28, dist: 118, target: [0, 17, 0], fov: 32 };
const loadImg = (src) => new Promise((res) => { if (!src) { res(null); return; } const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

export default function AnimTab() {
  const core = React.useContext(StudioCtx);
  const { hp, toast } = core;
  const [proj, setProj] = useState(null); // анимации проекта
  const [cur, setCur] = useState(null); // { anim, source: 'project'|'builtin' }
  const curRef = useRef(null); curRef.current = cur;
  const hist = useRef({ past: [], future: [] });
  const [, bump] = useState(0);
  const [time, setTimeState] = useState(0);
  const timeRef = useRef(0);
  const setTime = useCallback((t) => { timeRef.current = t; setTimeState(t); }, []);
  const [playing, setPlaying] = useState(false);
  const [loopPreview, setLoopPreview] = useState(() => lsGet('anim.loopPrev', true));
  const [selBone, setSelBone] = useState(null);
  const [selKeys, setSelKeys] = useState([]);
  const [selEv, setSelEv] = useState(null);
  const [tool, setToolS] = useState(() => lsGet('anim.tool', 'rotate'));
  const setTool = (t) => { setToolS(t); lsSet('anim.tool', t); };
  const [model, setModelS] = useState(() => lsGet('anim.model', 'player'));
  const setModel = (m) => { setModelS(m); lsSet('anim.model', m); };
  const [walk, setWalk] = useState(false);
  const [showChar, setShowChar] = useState(() => lsGet('anim.char', true));
  const [cam, setCamS] = useState(() => lsGet('anim.cam', DEF_CAM));
  const camT = useRef(null);
  const setCam = (c) => { setCamS(c); clearTimeout(camT.current); camT.current = setTimeout(() => lsSet('anim.cam', c), 400); };
  const [tlH, setTlH] = useState(() => lsGet('anim.tlH', 230));
  const [rtab, setRtab] = useState('bone');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [skin, setSkin] = useState(null); // { img, slim }
  const [character, setCharacter] = useState(null);
  const [live, setLive] = useState(() => lsGet('anim.live', { target: 'self', follow: true }));
  const [liveOn, setLiveOn] = useState(false);
  const clip = useRef(null);
  const saveT = useRef(null);
  const liveT = useRef(null);
  const [menu, openMenu, closeMenu] = useMenu();
  const connected = !!core.link.connected;
  const hasProject = !!core.hasProject;

  // ---------- загрузка ----------
  const reload = useCallback(() => call('studio:animLoad').then((r) => setProj(r ? r.anims : [])).catch((e) => { setProj([]); toast(e.message, 'error'); }), []); // eslint-disable-line
  useEffect(() => { reload(); }, [reload, core.projectId]);
  useEffect(() => {
    call('studio:animCharacter').then(async (r) => {
      if (!r) return;
      const img = await loadImg(r.skin);
      setSkin(img ? { img, slim: !!r.slim } : null);
      setCharacter(r.character || null);
    }).catch(() => {});
  }, []);
  const tex = useMemo(() => ({
    player: (skin && skin.img) || defaultPlayerTexture('player'),
    valley: defaultPlayerTexture('valley'),
    villager: defaultVillagerTexture()
  }), [skin]);
  const rig = useMemo(() => (model === 'villager' ? villagerRig() : playerRig(model === 'alex' || (model === 'player' && skin && skin.slim))), [model, skin]);
  const extra = useMemo(() => {
    if (!charRig || !character || !showChar || (model !== 'player' && model !== 'alex')) return { bones: [], tex: null };
    try {
      const bones = (charRig.characterBones && charRig.characterBones(character, skin && skin.img)) || [];
      const t = charRig.characterTexture ? charRig.characterTexture(character, skin && skin.img) : null;
      return { bones: Array.isArray(bones) ? bones : [], tex: t || null };
    } catch (e) { return { bones: [], tex: null }; }
  }, [character, skin, showChar, model]);

  // ---------- правки, история, сохранение ----------
  const projIds = useMemo(() => new Set((proj || []).map((a) => a.id)), [proj]);
  const saveNow = useCallback(async () => {
    clearTimeout(saveT.current);
    const c = curRef.current;
    if (!c || !c.dirty || c.source !== 'project') return;
    try {
      await call('studio:animSave', cleanAnim(c.anim));
      setCur((x) => (x && x.anim.id === c.anim.id ? { ...x, dirty: false } : x));
      setProj((p) => { const l = (p || []).filter((a) => a.id !== c.anim.id); l.push(normalizeAnim(c.anim)); return l.sort((a, b) => a.id.localeCompare(b.id)); });
    } catch (e) { toast('Не сохранилось: ' + e.message, 'error', 6000); }
  }, []); // eslint-disable-line
  const scheduleSave = () => { clearTimeout(saveT.current); saveT.current = setTimeout(saveNow, 700); };
  useEffect(() => () => { saveNow(); }, []); // eslint-disable-line
  const toProject = (c) => {
    if (c.source === 'project') return c;
    if (!hasProject) return c;
    toast('Встроенная «' + (c.anim.name || c.anim.id) + '» теперь перекрыта в проекте: правки идут в anims/' + c.anim.id + '.json. «Вернуть встроенную» — отменить.', 'ok', 6000);
    return { ...c, source: 'project' };
  };
  const gesture = useCallback(() => {
    const c = curRef.current;
    if (!c) return;
    hist.current.past.push(c.anim); if (hist.current.past.length > 200) hist.current.past.shift();
    hist.current.future = [];
  }, []);
  const edit = (fn, opts) => {
    const c = curRef.current;
    if (!c) return;
    const next = fn(c.anim);
    if (!next || next === c.anim) return;
    if (!(opts && opts.silent)) gesture();
    const nc = { ...toProject(c), anim: next, dirty: true };
    curRef.current = nc;
    setCur(nc);
    scheduleSave();
    pushLive(next);
  };
  const undo = () => { const h = hist.current, c = curRef.current; if (!c || !h.past.length) return; h.future.push(c.anim); const a = h.past.pop(); const nc = { ...c, anim: a, dirty: true }; curRef.current = nc; setCur(nc); scheduleSave(); bump((n) => n + 1); };
  const redo = () => { const h = hist.current, c = curRef.current; if (!c || !h.future.length) return; h.past.push(c.anim); const a = h.future.pop(); const nc = { ...c, anim: a, dirty: true }; curRef.current = nc; setCur(nc); scheduleSave(); bump((n) => n + 1); };

  const open = async (id, source) => {
    await saveNow();
    const fromProj = (proj || []).find((a) => a.id === id);
    const a = source === 'builtin' || !fromProj ? builtinAnim(id) : JSON.parse(JSON.stringify(fromProj));
    if (!a) return;
    hist.current = { past: [], future: [] };
    const nc = { anim: normalizeAnim(a), source: source === 'builtin' || !fromProj ? 'builtin' : 'project', dirty: false };
    curRef.current = nc;
    setCur(nc);
    setSelKeys([]); setSelEv(null);
    setTime(0);
    if (a.target === 'villager' && model !== 'villager') setModel('villager');
    if (a.target === 'player' && model === 'villager') setModel('player');
    lsSet('anim.last', { id, source: nc.source });
    learnMark('an-open');
  };
  useEffect(() => { if (!cur && proj) { const l = lsGet('anim.last', null); if (l && (l.source === 'builtin' ? BUILTIN_IDS.includes(l.id) : (proj || []).some((a) => a.id === l.id))) open(l.id, l.source); } }, [proj]); // eslint-disable-line

  const createNew = async (name, base) => {
    if (!hasProject) { toast('Сначала открой проект', 'error'); return; }
    await saveNow();
    const taken = [...(proj || []).map((a) => a.id), ...BUILTIN_IDS];
    const id = uniqueId(slug(name, 'anim'), taken);
    const a = base ? { ...normalizeAnim(JSON.parse(JSON.stringify(base))), id, name, builtin: false } : { ...newAnim(id, name), tracks: { right_arm: { rot: [{ t: 0, v: [0, 0, 0] }] } } };
    delete a.builtin;
    try {
      await call('studio:animSave', cleanAnim(a));
      setProj((p) => [...(p || []), normalizeAnim(a)].sort((x, y) => x.id.localeCompare(y.id)));
      hist.current = { past: [], future: [] };
      const nc = { anim: normalizeAnim(a), source: 'project', dirty: false };
      curRef.current = nc; setCur(nc); setTime(0); setSelBone(base ? null : 'right_arm');
      lsSet('anim.last', { id, source: 'project' });
      learnMark(base ? 'an-copy' : 'an-new');
      toast('Анимация «' + name + '» (anims/' + id + '.json)', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  };
  const removeCur = async () => {
    const c = curRef.current;
    if (!c || c.source !== 'project') return;
    const isOverride = BUILTIN_IDS.includes(c.anim.id);
    try {
      clearTimeout(saveT.current);
      await call('studio:animDelete', c.anim.id);
      setProj((p) => (p || []).filter((a) => a.id !== c.anim.id));
      if (isOverride) { const nc = { anim: normalizeAnim(builtinAnim(c.anim.id)), source: 'builtin', dirty: false }; curRef.current = nc; setCur(nc); toast('Вернулась встроенная «' + nc.anim.name + '»', 'ok'); }
      else { curRef.current = null; setCur(null); toast('Анимация удалена', 'ok'); }
    } catch (e) { toast(e.message, 'error'); }
  };
  const renameCur = async (to) => {
    const c = curRef.current;
    if (!c) return;
    const id = String(to || '').trim();
    if (!/^[a-z0-9_.-]{1,64}$/.test(id)) { toast('id: маленькие латинские буквы, цифры, _ . -', 'error'); return; }
    if (id === c.anim.id) return;
    if ((proj || []).some((a) => a.id === id)) { toast('Анимация «' + id + '» уже есть', 'error'); return; }
    if (c.source !== 'project') { await createNew(c.anim.name, { ...c.anim, id }); return; }
    await saveNow();
    try {
      await call('studio:animRename', { from: c.anim.id, to: id });
      setProj((p) => (p || []).map((a) => (a.id === c.anim.id ? { ...a, id } : a)));
      const nc = { ...c, anim: { ...c.anim, id } }; curRef.current = nc; setCur(nc);
      if (BUILTIN_IDS.includes(id)) toast('Теперь это перекрытие встроенной «' + id + '»', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  };

  // ---------- проигрывание в Студии ----------
  const anim = cur ? cur.anim : null;
  useEffect(() => {
    if (!playing || !anim) return undefined;
    let last = performance.now(), acc = timeRef.current;
    let raf;
    const step = (now) => {
      acc += ((now - last) / 50) * (anim.speed || 1);
      last = now;
      let t = acc;
      if (t > anim.length) { if (loopPreview || anim.loop) { acc = t = t % Math.max(1, anim.length); } else { setTime(anim.length); setPlaying(false); return; } }
      setTime(Math.round(t * 100) / 100);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, anim && anim.id, anim && anim.length, loopPreview]); // eslint-disable-line
  const walkPhase = useRef(0);
  useEffect(() => { if (!walk) return undefined; const t = setInterval(() => { walkPhase.current += 1; bump((n) => n + 1); }, 50); return () => clearInterval(t); }, [walk]);
  const tInt = Math.round(time);

  // пружины деталей персонажа (только предпросмотр)
  const springs = useRef({ st: {}, lastT: null, prevP: {} });
  const springBones = extra.bones.filter((b) => b.spring || (anim && anim.springs && anim.springs[b.name]));
  const solved = useMemo(() => {
    const sv = {};
    if (springBones.length) for (const b of springBones) { const s = springs.current.st[b.name]; if (s) sv[b.name] = [s.x, 0, s.z]; }
    return solvePose(rig, anim, time, { walk: walk ? { phase: walkPhase.current, amount: 0.7 } : null, extra: extra.bones, springs: sv });
  }, [rig, anim, time, walk, extra, walkPhase.current]); // eslint-disable-line
  useEffect(() => {
    if (!springBones.length) return;
    const S = springs.current;
    for (const b of springBones) {
      const s = solved.bones[b.name];
      if (!s) continue;
      const prev = S.prevP[b.name];
      const vel = prev ? [s.P[0] - prev.P[0], s.P[1] - prev.P[1], s.P[2] - prev.P[2]] : [0, 0, 0];
      const pv = prev && prev.vel ? prev.vel : [0, 0, 0];
      const acc = app3(tr3(s.parentM), [vel[0] - pv[0], vel[1] - pv[1], vel[2] - pv[2]]);
      const down = app3(tr3(s.parentM), [0, 1, 0]);
      const p = { ...SPRING_DEF, ...(b.spring || {}), ...((anim && anim.springs && anim.springs[b.name]) || {}) };
      const drive = [acc[2] * 0.08 + down[2] * p.gravity * 0.05, -acc[0] * 0.08 - down[0] * p.gravity * 0.05];
      S.st[b.name] = springStep(S.st[b.name], p, drive);
      S.prevP[b.name] = { P: s.P, vel };
    }
  }, [solved]); // eslint-disable-line

  // ---------- игра ----------
  const liveRef = useRef(live); liveRef.current = live;
  function pushLive(a) {
    if (!liveOnRef.current || !liveRef.current.follow) return;
    clearTimeout(liveT.current);
    liveT.current = setTimeout(() => core.send({ t: 'anim', op: 'update', anim: cleanAnim(a), target: liveRef.current.target }), 220);
  }
  const liveOnRef = useRef(false); liveOnRef.current = liveOn;
  const playInGame = () => {
    if (!anim) return;
    if (!connected) { toast('Нет связи с игрой — запусти игру в режиме разработчика', 'error'); return; }
    core.send({ t: 'anim', op: 'play', anim: cleanAnim(anim), target: live.target, loop: !!(anim.loop || loopPreview) });
    setLiveOn(true);
    learnMark('an-game');
  };
  const stopInGame = () => { core.send({ t: 'anim', op: 'stop', target: live.target }); setLiveOn(false); };
  // бегунок → поза в игре (если включено «Следить» и анимация показана в игре, а в Студии она не играет)
  const holdT = useRef(0);
  useEffect(() => {
    if (!liveOn || !live.follow || playing || !anim) return;
    const now = Date.now();
    if (now - holdT.current < 90) return;
    holdT.current = now;
    core.send({ t: 'anim', op: 'hold', id: anim.id, time: tInt, target: live.target });
  }, [tInt]); // eslint-disable-line
  useEffect(() => on('studio-link', (d) => {
    const m = d && d.msg;
    if (!m || m.t !== 'anim') return;
    if (m.ok === false) toast('Анимация в игре: ' + (m.error || 'не вышло'), 'error', 6000);
    else if (m.op === 'play') toast('В игре: «' + (m.id || '') + '» на ' + (m.who || 'тебе'), 'ok', 2500);
  }), []); // eslint-disable-line
  useEffect(() => () => { if (liveOnRef.current) core.send({ t: 'anim', op: 'stop', target: live.target }); }, []); // eslint-disable-line

  // ---------- действия с ключами ----------
  const act = {
    keyBone: (bone, t, chs) => { if (!bone) return; let all = true; try { all = localStorage.getItem('an-key-all') !== '0'; } catch (_) { /* как по умолчанию */ } edit((a) => keyBone(a, bone, t, chs, all)); learnMark('an-key'); },
    copy: (keys) => { const k = keys || selKeys; clip.current = anim ? copyKeys(anim, k) : null; if (clip.current) toast('Скопировано ключей: ' + clip.current.items.length, 'ok', 1500); },
    paste: () => { if (!clip.current || !anim) return; const r = pasteKeys(anim, clip.current, tInt, selBone); edit(() => r.anim); setSelKeys(r.keys); },
    del: (keys) => { const k = keys || selKeys; if (!k.length) return; edit((a) => deleteKeys(a, k)); setSelKeys([]); },
    mirrorAt: (t) => { edit((a) => mirrorPoseAt(a, t == null ? tInt : t)); learnMark('an-mirror'); },
    clearBone: (bone, ch) => edit((a) => clearBone(a, bone, ch)),
    addEvent: (kind, t) => {
      const ev = { t, [kind]: kind === 'sound' ? 'minecraft:entity.villager.yes' : kind === 'particle' ? 'minecraft:heart' : kind === 'face' ? 'smile' : 'my_signal' };
      if (kind === 'sound') { ev.vol = 1; ev.pitch = 1; }
      if (kind === 'particle') { ev.bone = 'head'; ev.count = 3; ev.spread = 0.3; }
      let idx = 0;
      edit((a) => { const evs = [...(a.events || []), ev].sort((x, y) => x.t - y.t); idx = evs.indexOf(ev); return { ...a, events: evs }; });
      setSelEv(idx); setRtab('events');
    },
    delEvent: (i) => { edit((a) => ({ ...a, events: a.events.filter((_, j) => j !== i) })); setSelEv(null); }
  };

  // гизмо → ключи
  const dragBase = useRef(null);
  const onRotate = ({ phase, bone, W }) => {
    if (!anim) return;
    if (phase === 'start') { gesture(); dragBase.current = anim; return; }
    if (phase === 'end') { dragBase.current = null; learnMark('an-rotate'); return; }
    const base = dragBase.current || anim;
    let v;
    if (bone === 'root') v = eulerZYX(W).map((r) => r3(r / DEG));
    else v = rotKeyFromWorld(solved, bone, W, base);
    if (!v) return;
    edit(() => setKey(base, bone, 'rot', tInt, v), { silent: true });
  };
  const onMove = ({ phase, bone, delta, parentM }) => {
    if (!anim) return;
    if (phase === 'start') { gesture(); dragBase.current = anim; return; }
    if (phase === 'end') { dragBase.current = null; return; }
    const base = dragBase.current || anim;
    const v0 = valueAt(base, bone, 'pos', tInt);
    const d = bone === 'root' ? delta : app3(tr3(parentM || [1, 0, 0, 0, 1, 0, 0, 0, 1]), delta);
    edit(() => setKey(base, bone, 'pos', tInt, [v0[0] + d[0], v0[1] + d[1], v0[2] + d[2]]), { silent: true });
  };

  // ---------- клавиши ----------
  useEffect(() => {
    const k = (e) => {
      if (document.querySelector('.c4-modal-back, .modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.code === 'KeyZ' || e.code === 'KeyY')) { if (inField) return; e.preventDefault(); if (e.code === 'KeyY' || e.shiftKey) redo(); else undo(); return; }
      if (inField) return;
      if (ctrl && e.code === 'KeyC') { e.preventDefault(); act.copy(); return; }
      if (ctrl && e.code === 'KeyV') { e.preventDefault(); act.paste(); return; }
      if (ctrl || e.altKey) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); setPlaying((p) => !p); break;
        case 'KeyQ': setTool('select'); break;
        case 'KeyR': setTool('rotate'); break;
        case 'KeyE': case 'KeyT': setTool('move'); break;
        case 'KeyK': if (selBone) act.keyBone(selBone, tInt); break;
        case 'KeyF': setTime(Math.max(0, tInt - (e.shiftKey ? 5 : 1))); break;
        case 'KeyG': setTime(Math.min(anim ? anim.length : 0, tInt + (e.shiftKey ? 5 : 1))); break;
        case 'KeyM': act.mirrorAt(); break;
        case 'Delete': case 'Backspace': e.preventDefault(); if (selKeys.length) act.del(); else if (selEv != null) act.delEvent(selEv); break;
        case 'Escape': setSelBone(null); setSelKeys([]); break;
        case 'Home': setTime(0); break;
        case 'End': if (anim) setTime(anim.length); break;
        default:
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---------- что показывать ----------
  const bonesList = useMemo(() => {
    const base = RIG_BONES[model === 'villager' ? 'villager' : 'player'].slice();
    for (const b of extra.bones) if (!base.includes(b.name)) base.push(b.name);
    for (const b of Object.keys((anim && anim.tracks) || {})) if (!base.includes(b)) base.push(b);
    return base;
  }, [model, extra, anim]);
  const problems = useMemo(() => (anim ? validateAnim(anim, new Set(BUILTIN_IDS)) : []), [anim]);
  const splitTl = (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = tlH;
    const mv = (ev) => setTlH(Math.max(120, Math.min(window.innerHeight - 260, h0 - (ev.clientY - y0))));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTlH((h) => { lsSet('anim.tlH', h); return h; }); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };

  if (!hasProject) return <div className="c4-soon"><div className="c4-soon-card"><h3>Анимации</h3><p>Открой или создай проект — анимации живут в его папке anims/.</p></div></div>;
  const overlay = (
    <>
      <div className="an-vbar top" onMouseDown={(e) => e.stopPropagation()}>
        <div className="c4-group" data-learn="an-model">
          {MODELS.map(([id, l, h]) => <button key={id} className={'c4-ib wide' + (model === id ? ' on' : '')} onClick={() => setModel(id)} {...hp(l + ': ' + h)}>{l}</button>)}
        </div>
        {charRig && (model === 'player' || model === 'alex') && <button className={'c4-ib wide' + (showChar ? ' on' : '')} onClick={() => { setShowChar(!showChar); lsSet('anim.char', !showChar); }} {...hp('Детали «Персонажа» (уши, хвост, волосы, одежда) из лаунчера — с их пружинами.')}>Персонаж</button>}
        <div className="grow" />
        <button className={'c4-ib wide' + (walk ? ' on' : '')} onClick={() => setWalk(!walk)} {...hp('Ходьба под анимацией: так видно, как «Добавить» смешивается с обычным шагом (ноги и руки качаются).')}><I name="actor" size={13} /> Ходьба</button>
      </div>
      <div className="an-vbar left" onMouseDown={(e) => e.stopPropagation()}>
        {[['select', 'select', 'Выбор (Q): щёлкни часть тела — выберется кость.'], ['rotate', 'rotate', 'Поворот (R): кольца X / Y / Z по осям кости, внутри — свободно. Поворот сразу ставит ключ в момент бегунка.'], ['move', 'move', 'Сдвиг (E): двигать кость (или всё тело — «Всё тело»). Ставит ключ «Сдвиг».']].map(([id, ic, h]) => (
          <button key={id} data-learn={'an-tool-' + id} className={'c4-ib' + (tool === id ? ' on' : '')} onClick={() => setTool(id)} {...hp(h)}><I name={ic} size={18} /></button>
        ))}
        <div className="c4-tsep" />
        <button className={'c4-ib' + (selBone === 'root' ? ' on' : '')} onClick={() => setSelBone('root')} {...hp('Выбрать «Всё тело» (корень): присесть, подпрыгнуть, лечь, развернуться.')}><I name="group" size={18} /></button>
        <button className="c4-ib" onClick={() => act.mirrorAt()} data-learn="an-mirror" {...hp('Отразить позу в момент бегунка (M): правая рука/нога ↔ левая.')}><I name="loop" size={18} /></button>
      </div>
      <div className="an-vbar bottom" onMouseDown={(e) => e.stopPropagation()}>
        {VIEWS.map(([id, l, yaw, pitch]) => <button key={id} className="c4-ib wide" onClick={() => setCam({ ...cam, yaw, pitch, dist: Math.max(cam.dist, 100) })} {...hp('Вид: ' + l + '.')}>{l}</button>)}
        <button className="c4-ib wide" onClick={() => setCam(DEF_CAM)} {...hp('Вернуть вид по умолчанию.')}><I name="frame" size={13} /></button>
        <div className="grow" />
        <span className="an-status">{anim ? (anim.name || anim.id) + ' · ' + tInt + ' т / ' + anim.length + (anim.loop ? ' · по кругу' : '') + (selBone ? ' · ' + boneRu(selBone) : '') : ''}</span>
      </div>
    </>
  );
  return (
    <div className="an-root">
      <div className="an-main">
        <LibraryPane proj={proj} cur={cur} open={open} q={q} setQ={setQ} hp={hp} onNew={() => setModal({ kind: 'new' })} onCopy={() => anim && setModal({ kind: 'copy' })} onRemove={removeCur} projIds={projIds} />
        <div className="an-center">
          <div className="an-cmd">
            <button className="c4-ib" disabled={!hist.current.past.length} onClick={undo} {...hp('Отменить (Ctrl+Z).')}><I name="undo" size={16} /></button>
            <button className="c4-ib" disabled={!hist.current.future.length} onClick={redo} {...hp('Вернуть (Ctrl+Y).')}><I name="redo" size={16} /></button>
            <div className="c4-sep" />
            <span className="an-doc" {...hp(cur ? (cur.source === 'builtin' ? 'Встроенная анимация мода. Любая правка сохранит её перекрытием в проект (anims/' + anim.id + '.json).' : 'Файл проекта anims/' + anim.id + '.json — сохраняется сам через миг после правки.') : '')}>
              {anim ? <>{anim.icon ? anim.icon + ' ' : ''}<b>{anim.name || anim.id}</b> <span className="dim mono">{anim.id}</span> {cur.source === 'builtin' ? <span className="an-badge b">встроенная</span> : BUILTIN_IDS.includes(anim.id) ? <span className="an-badge o">перекрыта</span> : <span className="an-badge p">проекта</span>}{cur.dirty ? <span className="dim"> · сохраняю…</span> : null}</> : <span className="dim">Анимация не открыта</span>}
            </span>
            <div className="grow" />
            <div className="c4-group" data-learn="an-game">
              <select className="c4-text an-target" value={live.target} onChange={(e) => { const v = { ...live, target: e.target.value }; setLive(v); lsSet('anim.live', v); }} {...hp('На ком играть в игре: на тебе или на существе, на которое ты смотришь (или выбранном Камерой Студии).')}>
                <option value="self">на мне</option><option value="look">на том, на кого смотрю</option>
              </select>
              <button className="c4-ib wide prim" disabled={!anim || !connected} onClick={playInGame} {...hp(connected ? '▶ В игре: сыграть эту анимацию в игре сейчас (без «Собрать»). Пока она играет, правки и бегунок идут в игру сразу.' : 'Нет связи с игрой: запусти игру в режиме разработчика (studio/.dev).')}><I name="play" size={13} /> В игре</button>
              <button className="c4-ib wide" disabled={!liveOn} onClick={stopInGame} {...hp('■ Остановить анимацию в игре.')}><I name="stop" size={13} /></button>
              <button className={'c4-ib wide' + (live.follow ? ' on' : '')} onClick={() => { const v = { ...live, follow: !live.follow }; setLive(v); lsSet('anim.live', v); }} {...hp('Живые правки: пока анимация идёт в игре, каждая правка сразу уходит туда, а бегунок (на паузе) ставит в игре ту же позу.')}><I name="link" size={13} /> Живо</button>
            </div>
          </div>
          <div className="an-viewwrap">
            {anim ? (
              <AnimView rig={rig} solved={solved} extra={extra.bones} texes={{ skin: model === 'villager' ? tex.villager : model === 'valley' ? tex.valley : tex.player, extra: extra.tex }} sel={selBone} onSelect={(b) => { setSelBone(b); if (b) setRtab('bone'); }} tool={tool} onRotate={onRotate} onMove={onMove} cam={cam} setCam={setCam} hp={hp} overlay={overlay} />
            ) : (
              <div className="an-empty"><div className="c4-soon-card"><h3><I name="actor" size={18} /> Анимации</h3><p>Слева — библиотека: {ANIM_LIBRARY.length} встроенных движений (помахать, поклон, сесть, танец…) и анимации проекта. Открой любую — увидишь её ключи, поправь, сохрани как свою. Или начни с нуля.</p><div style={{ display: 'flex', gap: 6 }}><button className="c4-btn prim" onClick={() => setModal({ kind: 'new' })}><I name="plus" size={12} /> Новая анимация</button><button className="c4-btn" onClick={() => open('wave', 'builtin')}>Открыть «Помахать»</button></div></div></div>
            )}
          </div>
        </div>
        <div className="an-right">
          <div className="an-rtabs">
            {[['bone', 'Кость'], ['anim', 'Анимация'], ['events', 'События'], ['check', 'Проверка' + (problems.filter((p) => p.sev !== 'info').length ? ' · ' + problems.filter((p) => p.sev !== 'info').length : '')]].map(([id, l]) => <button key={id} data-learn={'an-rtab-' + id} className={rtab === id ? 'on' : ''} onClick={() => setRtab(id)}>{l}</button>)}
          </div>
          <div className="an-rbody">
            {!anim ? <div className="c4-tree-empty">Открой анимацию.</div>
              : rtab === 'bone' ? <BonePane anim={anim} bones={bonesList} sel={selBone} setSel={setSelBone} time={tInt} edit={edit} act={act} hp={hp} extra={extra.bones} solved={solved} />
                : rtab === 'anim' ? <AnimPane anim={anim} edit={edit} hp={hp} rename={renameCur} source={cur.source} />
                  : rtab === 'events' ? <EventsPane anim={anim} edit={edit} hp={hp} sel={selEv} setSel={setSelEv} act={act} time={tInt} setTime={setTime} />
                    : <CheckPane problems={problems} />}
          </div>
        </div>
      </div>
      <div className="c4-splitter-h" onMouseDown={splitTl} title="Тяни — высота таймлайна" />
      <AnimTimeline anim={anim} bones={bonesList} time={tInt} setTime={setTime} playing={playing} setPlaying={setPlaying} selBone={selBone} setSelBone={(b) => { setSelBone(b); setRtab('bone'); }} selKeys={selKeys} setSelKeys={setSelKeys} edit={edit} gesture={gesture} height={tlH} hp={hp} act={act} selEv={selEv} setSelEv={(i) => { setSelEv(i); setRtab('events'); }} loopPreview={loopPreview} setLoopPreview={(v) => { setLoopPreview(v); lsSet('anim.loopPrev', v); }} />
      {modal && (modal.kind === 'new' || modal.kind === 'copy') && <NewModal kind={modal.kind} base={anim} onClose={() => setModal(null)} onCreate={(name, fromId) => { setModal(null); createNew(name, modal.kind === 'copy' ? anim : fromId ? builtinAnim(fromId) : null); }} />}
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </div>
  );
}

// ---------- библиотека ----------
function LibraryPane({ proj, cur, open, q, setQ, hp, onNew, onCopy, onRemove, projIds }) {
  const [closed, setClosed] = useState(() => lsGet('anim.libClosed', {}));
  const toggle = (k) => { const c = { ...closed, [k]: !closed[k] }; setClosed(c); lsSet('anim.libClosed', c); };
  const s = q.trim().toLowerCase();
  const match = (a) => !s || (a.name || '').toLowerCase().includes(s) || a.id.includes(s) || (a.name_en || '').toLowerCase().includes(s);
  const mine = (proj || []).filter(match);
  const curId = cur && cur.anim.id, curSrc = cur && cur.source;
  const row = (a, source) => {
    const over = source === 'builtin' && projIds.has(a.id);
    const on = curId === a.id && (curSrc === source || (source === 'project' && curSrc === 'project'));
    return (
      <div key={source + a.id} className={'an-lrow' + (on ? ' on' : '')} onClick={() => open(a.id, source)} {...hp((a.name || a.id) + ' (' + a.id + ') — ' + (TARGETS.find((x) => x[0] === a.target) || [0, 'любой'])[1] + ', ' + fmtT(a.length) + (a.loop ? ', по кругу' : '') + (over ? '. Перекрыта в проекте — в игре будет версия проекта.' : '') + ' Щёлкни — открыть.')}>
        <span className="ic">{a.icon || '•'}</span><span className="nm">{a.name || a.id}</span>
        {over && <span className="an-badge o" title="Перекрыта в проекте">✎</span>}
        {source === 'project' && BUILTIN_IDS.includes(a.id) && <span className="an-badge o" title="Перекрывает встроенную">✎</span>}
        {a.loop && <span className="dim" title="По кругу">↻</span>}
        <span className="id">{a.id}</span>
      </div>
    );
  };
  return (
    <div className="an-lib c4-pane" data-learn="an-library">
      <div className="an-lib-h">
        <b>Библиотека</b><span className="grow" />
        <button className="c4-btn sm prim" data-learn="an-new" onClick={onNew} {...hp('Новая анимация в проекте (anims/<id>.json): с нуля или на основе встроенной.')}><I name="plus" size={11} /> Новая</button>
      </div>
      <div className="an-lib-tools">
        <input className="c4-text" placeholder="Поиск: имя или id" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} {...hp('Поиск по названию (ru/en) и id.')} />
        <button className="c4-ib" disabled={!cur} onClick={onCopy} data-learn="an-copy" {...hp('Сохранить как новую: копия открытой анимации под своим именем.')}><I name="copy" size={14} /></button>
        <button className="c4-ib" disabled={!cur || curSrc !== 'project'} onClick={onRemove} {...hp(cur && BUILTIN_IDS.includes(cur.anim.id) && curSrc === 'project' ? 'Вернуть встроенную: удалить перекрытие из проекта.' : 'Удалить анимацию проекта.')}><I name="trash" size={14} /></button>
      </div>
      <div className="an-lib-list">
        <div className="an-lgrp" onClick={() => toggle('proj')} {...hp('Анимации этого проекта: свои и перекрытые встроенные. «Собрать» отдаст их игрокам.')}>{closed.proj ? '▸' : '▾'} Проекта <span className="dim">{(proj || []).length}</span></div>
        {!closed.proj && (mine.length ? mine.map((a) => row(a, 'project')) : <div className="c4-tree-empty" style={{ padding: '4px 14px' }}>{proj && proj.length ? 'Ничего не нашлось' : 'Пока нет — «+ Новая» или правь встроенную.'}</div>)}
        {CATS.map(([cat, label]) => {
          const list = ANIM_LIBRARY.filter((a) => a.cat === cat && match(a));
          if (!list.length) return null;
          return (
            <React.Fragment key={cat}>
              <div className="an-lgrp" onClick={() => toggle(cat)} {...hp('Встроенные: ' + label + '. Они есть у всех игроков в моде SkinKokk.')}>{closed[cat] ? '▸' : '▾'} {label} <span className="dim">{list.length}</span></div>
              {!closed[cat] && list.map((a) => row(a, 'builtin'))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function NewModal({ kind, base, onClose, onCreate }) {
  const [name, setName] = useState(kind === 'copy' && base ? (base.name || base.id) + ' (своя)' : '');
  const [from, setFrom] = useState('');
  const ok = name.trim().length > 0;
  return (
    <Modal title={kind === 'copy' ? 'Сохранить как новую' : 'Новая анимация'} onClose={onClose} footer={<><button className="c4-btn" onClick={onClose}>Отмена</button><button className="c4-btn prim" disabled={!ok} onClick={() => onCreate(name.trim(), from)}>Создать</button></>}>
      <p className="dim">{kind === 'copy' ? 'Копия «' + (base.name || base.id) + '» под своим именем — встроенная останется как есть.' : 'Имя файла придумается из названия латиницей (его можно поменять во вкладке «Анимация»).'}</p>
      <input className="c4-text" style={{ height: 26, width: '100%' }} autoFocus placeholder="Например: Поклон Аларика" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && ok) onCreate(name.trim(), from); }} />
      {kind === 'new' && <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}><span className="dim">Начать с</span><select className="c4-text" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">пустой (одна кость)</option>{ANIM_LIBRARY.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</select></div>}
    </Modal>
  );
}

// ---------- кость ----------
function BonePane({ anim, bones, sel, setSel, time, edit, act, hp, extra, solved }) {
  const extraNames = new Set((extra || []).map((b) => b.name));
  return (
    <>
      <div className="an-bones" data-learn="an-bones">
        {bones.map((b) => {
          const has = !!anim.tracks[b];
          const depth = ['head', 'right_arm', 'left_arm', 'arms', 'hat'].includes(b) ? 2 : b === 'root' ? 0 : b === 'nose' ? 3 : extraNames.has(b) ? 2 : 1;
          return <div key={b} className={'an-brow' + (sel === b ? ' on' : '')} style={{ paddingLeft: 6 + depth * 12 }} onClick={() => setSel(b)} {...hp((BONE_HINT[b] || boneRu(b)) + (extraNames.has(b) ? ' (деталь персонажа)' : ''))}><span className={'an-bdot' + (has ? ' on' : '')} />{boneRu(b)}{extraNames.has(b) && <span className="an-badge p">перс.</span>}{has && <span className="dim" style={{ marginLeft: 'auto' }}>{Object.values(anim.tracks[b]).reduce((n, k) => n + k.length, 0)}◆</span>}</div>;
        })}
      </div>
      {sel ? <BoneAttrs anim={anim} bone={sel} time={time} edit={edit} act={act} hp={hp} isExtra={extraNames.has(sel)} extraDef={(extra || []).find((x) => x.name === sel)} solved={solved} /> : <div className="c4-tree-empty">Выбери кость — щелчком по модели или в списке.</div>}
    </>
  );
}
function KeyAllToggle({ hp }) {
  const read = () => { try { return localStorage.getItem('an-key-all') !== '0'; } catch (_) { return true; } };
  const [on, setOn] = useState(read);
  return (
    <label className="an-chk" {...hp('Все каналы: ключ (кнопка ◇ на панели времени и K) ставится сразу на поворот, сдвиг и размер по X, Y, Z. Выключи — ключ только на поворот (сдвиг и размер — если уже анимированы).')}>
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); try { localStorage.setItem('an-key-all', e.target.checked ? '1' : '0'); } catch (_) { /* не запомнится */ } }} /> Все каналы
    </label>
  );
}
function BoneAttrs({ anim, bone, time, edit, act, hp, isExtra, extraDef }) {
  const modeOv = anim.modes && anim.modes[bone];
  const row = (ch) => {
    const v = valueAt(anim, bone, ch, time);
    const st = keyState(anim, bone, ch, time);
    const toggle = () => edit((a) => (hasKey(a, bone, ch, time) ? deleteKeys(a, [{ bone, ch, t: time }]) : setKey(a, bone, ch, time, valueAt(a, bone, ch, time))));
    const step = ch === 'rot' ? 1 : ch === 'pos' ? 0.25 : 0.01;
    return (
      <ARow key={ch} label={CHANNEL_RU[ch]} hint={ch === 'rot' ? 'Градусы по осям X / Y / Z (как у ModelPart). Правка ставит ключ в момент бегунка.' : ch === 'pos' ? 'Сдвиг от обычного места в пикселях (1/16 блока). Y + — вниз.' : 'Размер: 1 — как есть, 2 — вдвое больше.'}
        keyBtn={<KeyBtn state={st} onClick={toggle} hint={st === 'key' ? 'Ключ в этот момент — щёлкни, чтобы убрать' : 'Поставить ключ: «' + CHANNEL_RU[ch] + '» в момент бегунка'} />}>
        <div className="an-xyz">
          {[0, 1, 2].map((c) => <Num key={c} ax={'XYZ'[c]} value={r3(v[c])} step={step} className={st === 'key' ? 'keyed' : st === 'anim' ? 'animated' : ''} onChange={(n) => edit((a) => setKeyComp(a, bone, ch, time, c, n), { silent: false })} />)}
        </div>
      </ARow>
    );
  };
  const sp = (anim.springs && anim.springs[bone]) || {};
  const spDef = { ...SPRING_DEF, ...((extraDef && extraDef.spring) || {}) };
  return (
    <div className="an-attrs">
      <Sec title={boneRu(bone)}>
        <div className="an-hint">{BONE_HINT[bone] || (isExtra ? 'Деталь персонажа (трек «Персонаж»). Её ключи складываются с пружиной.' : 'Кость.')}</div>
        {CHANNELS.map(row)}
        <ARow label="Режим" hint="Добавить — поза прибавляется к обычной (ходьба, взгляд живые). Заменить — только поза анимации.">
          <Select value={modeOv || ''} onChange={(v) => edit((a) => { const m = { ...(a.modes || {}) }; if (v) m[bone] = v; else delete m[bone]; return { ...a, modes: m }; })} options={[['', 'как у анимации (' + (anim.mode === 'replace' ? 'заменить' : 'добавить') + ')'], ...MODES.map(([k, l]) => [k, l])]} />
        </ARow>
        <div className="c4-btnrow">
          <button className="c4-btn sm" onClick={() => act.keyBone(bone, time)} {...hp('Ключ на кость (K): поворот, сдвиг и размер по всем осям сразу (галочка «Все каналы»).')}><I name="key" size={11} /> Ключ</button>
          <KeyAllToggle hp={hp} />
          <button className="c4-btn sm" onClick={() => edit((a) => setKey(a, bone, 'rot', time, [0, 0, 0]))} {...hp('Поворот этой кости в момент бегунка — в ноль (как стоит обычно).')}>Сбросить поворот</button>
          <button className="c4-btn sm" onClick={() => act.clearBone(bone)} {...hp('Удалить все ключи кости.')}><I name="trash" size={11} /></button>
        </div>
      </Sec>
      {(isExtra || Object.keys(sp).length > 0 || /^(chest_|ear_|tail_|hair_|cape|x_)/.test(bone)) && (
        <Sec title="Пружина («вес»)">
          <div className="an-hint">Модели Minecraft — кубики, их нельзя «гнуть» весами по вершинам. Здесь вес — это насколько деталь отстаёт и раскачивается за родителем (пружина). Значения ниже — только на время этой анимации; пусто — как у персонажа.</div>
          {SPRING_FIELDS.map(([k, l, mn, mx, st, h]) => (
            <ARow key={k} label={l} hint={h} onReset={() => edit((a) => { const s = { ...(a.springs || {}) }; const b = { ...(s[bone] || {}) }; delete b[k]; if (Object.keys(b).length) s[bone] = b; else delete s[bone]; return { ...a, springs: s }; })}>
              <Num value={sp[k] != null ? sp[k] : spDef[k]} min={mn} max={mx} step={st} className={sp[k] != null ? 'keyed' : ''} onChange={(n) => edit((a) => ({ ...a, springs: { ...(a.springs || {}), [bone]: { ...((a.springs || {})[bone] || {}), [k]: n } } }))} />
            </ARow>
          ))}
        </Sec>
      )}
    </div>
  );
}

// ---------- настройки анимации ----------
function AnimPane({ anim, edit, hp, rename, source }) {
  const [idTxt, setIdTxt] = useState(anim.id);
  const [stretch, setStretch] = useState(false);
  useEffect(() => setIdTxt(anim.id), [anim.id]);
  const set = (k) => (v) => edit((a) => ({ ...a, [k]: v }));
  return (
    <div className="an-attrs">
      <Sec title="Анимация">
        <ARow label="Название" hint="Как анимация называется в списках и в колесе эмоций."><Text value={anim.name} onChange={set('name')} /></ARow>
        <ARow label="Name (en)" hint="Название для игроков с английским языком."><Text value={anim.name_en} onChange={set('name_en')} /></ARow>
        <ARow label="id (файл)" hint="Имя файла латиницей. Его пишут в сценах ({do:'anim', name}), схемах и командах (/skinkokk anim play <id>). Совпадает со встроенной — перекрывает её.">
          <input className="c4-text mono" value={idTxt} onChange={(e) => setIdTxt(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename(idTxt); }} onBlur={() => idTxt !== anim.id && rename(idTxt)} />
        </ARow>
        <ARow label="Значок" hint="Эмодзи в библиотеке и в колесе эмоций."><Text value={anim.icon} onChange={set('icon')} /></ARow>
        <ARow label="Группа" hint="Раздел в библиотеке и в колесе эмоций."><Select value={anim.cat} onChange={set('cat')} options={CATS} /></ARow>
        <ARow label="Для кого" hint={TARGETS.map((t) => t[1] + ' — ' + t[2]).join(' ')}><Select value={anim.target} onChange={set('target')} options={TARGETS.map(([k, l]) => [k, l])} /></ARow>
      </Sec>
      <Sec title="Время">
        <ARow label="Длина, тики" hint={'20 тиков = 1 секунда. Сейчас ' + fmtT(anim.length) + '. С «Растянуть» ключи сдвигаются пропорционально.'}>
          <Num value={anim.length} min={1} max={6000} int step={1} onChange={(n) => edit((a) => (stretch ? retime(a, n) : { ...a, length: n }))} />
          <span className="an-mini" {...hp('Растянуть: менять длину вместе с ключами (быстрее/медленнее).')}><Check value={stretch} onChange={setStretch} /> растянуть</span>
        </ARow>
        <ARow label="По кругу" hint="Повторяется, пока её не остановят (танец, плач, разговор)."><Check value={anim.loop} onChange={set('loop')} /></ARow>
        <ARow label="Остаться в конце" hint="Не по кругу: после конца поза держится, пока анимацию не остановят (сесть, упасть, встать на колено)."><Check value={!!anim.stay} onChange={set('stay')} /></ARow>
        <ARow label="Скорость" hint="Множитель скорости: 0,5 — вдвое медленнее, 2 — вдвое быстрее."><Num value={anim.speed} min={0.05} max={10} step={0.05} onChange={set('speed')} /></ARow>
        <ARow label="Вход, тики" hint="Сколько тиков обычная поза плавно переходит в анимацию."><Num value={anim.blendIn} min={0} max={200} int onChange={set('blendIn')} /></ARow>
        <ARow label="Выход, тики" hint="Сколько тиков анимация плавно уходит в обычную позу в конце или при остановке."><Num value={anim.blendOut} min={0} max={200} int onChange={set('blendOut')} /></ARow>
      </Sec>
      <Sec title="Как смешивать">
        <ARow label="Режим" hint={MODES.map((m) => m[1] + ': ' + m[2]).join(' ')}><Select value={anim.mode} onChange={set('mode')} options={MODES.map(([k, l]) => [k, l])} /></ARow>
        <ARow label="Ноги не ходят" hint="Пока идёт анимация, ноги не качаются от шага (сидеть, стоять на колене, танец)."><Check value={!!anim.lockLegs} onChange={set('lockLegs')} /></ARow>
        <ARow label="В колесе эмоций" hint="Игроки могут включить её из колеса эмоций (клавиша в SkinKokk)."><Check value={anim.emote !== false} onChange={set('emote')} /></ARow>
</Sec>
      <Sec title="Целиком" open={false}>
        <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
          <button className="c4-btn sm" onClick={() => edit(mirrorAll)} {...hp('Отразить всю анимацию: правое ↔ левое (машет левой вместо правой).')}><I name="loop" size={11} /> Отразить всю</button>
        </div>
        <div className="an-hint">{source === 'builtin' ? 'Это встроенная анимация мода: правки сохранятся перекрытием в проект.' : 'Файл проекта: anims/' + anim.id + '.json. «Собрать» положит его в config/skinkokk/anims/.'}</div>
      </Sec>
    </div>
  );
}

// ---------- события ----------
function EventsPane({ anim, edit, hp, sel, setSel, act, time, setTime }) {
  const evs = anim.events || [];
  const e = sel != null ? evs[sel] : null;
  const setE = (patch) => edit((a) => ({ ...a, events: a.events.map((x, j) => (j === sel ? { ...x, ...patch } : x)) }));
  return (
    <div className="an-attrs">
      <Sec title={'События · ' + evs.length}>
        <div className="c4-btnrow" style={{ paddingLeft: 8 }}>
          {EVENT_KINDS.map(([k, l, h]) => <button key={k} className="c4-btn sm" onClick={() => act.addEvent(k, time)} {...hp(l + ' в момент бегунка: ' + h)}>+ {l}</button>)}
        </div>
        {evs.map((x, i) => { const k = evKind(x); return <div key={i} className={'an-evrow' + (sel === i ? ' on' : '')} onClick={() => { setSel(i); setTime(x.t); }}><b>{x.t} т</b> {(EVENT_KINDS.find((q) => q[0] === k) || [0, k])[1]}: <span className="mono">{String(x[k])}</span></div>; })}
        {!evs.length && <div className="c4-tree-empty">Событий нет. Добавь кнопкой выше или правым кликом по дорожке «События».</div>}
      </Sec>
      {e && (() => {
        const k = evKind(e);
        return (
          <Sec title="Событие">
            <ARow label="Момент, тики" hint="Когда сработает (каждый круг, если анимация по кругу)."><Num value={e.t} min={0} max={anim.length} int onChange={(n) => setE({ t: n })} /></ARow>
            {k === 'sound' && <>
              <ARow label="Звук" hint="id звука: minecraft:entity.villager.yes, minecraft:block.bell.use…"><Text value={e.sound} list="sl-sounds" onChange={(v) => setE({ sound: v })} /></ARow>
              <ARow label="Громкость" hint="0–2"><Num value={e.vol == null ? 1 : e.vol} min={0} max={2} step={0.05} onChange={(n) => setE({ vol: n })} /></ARow>
              <ARow label="Высота" hint="0,5–2: ниже или выше."><Num value={e.pitch == null ? 1 : e.pitch} min={0.5} max={2} step={0.05} onChange={(n) => setE({ pitch: n })} /></ARow>
            </>}
            {k === 'particle' && <>
              <ARow label="Частицы" hint="id частиц: minecraft:heart, minecraft:happy_villager, minecraft:falling_water…"><Text value={e.particle} onChange={(v) => setE({ particle: v })} /></ARow>
              <ARow label="У кости" hint="Где появятся: у головы, у рук… Пусто — у ног."><Select value={e.bone || ''} onChange={(v) => setE({ bone: v || undefined })} options={[['', 'у ног'], ['head', 'голова'], ['body', 'туловище'], ['right_arm', 'правая рука'], ['left_arm', 'левая рука']]} /></ARow>
              <ARow label="Сколько" hint="Число частиц."><Num value={e.count || 1} min={1} max={64} int onChange={(n) => setE({ count: n })} /></ARow>
              <ARow label="Разброс" hint="Блоки."><Num value={e.spread == null ? 0.3 : e.spread} min={0} max={4} step={0.05} onChange={(n) => setE({ spread: n })} /></ARow>
            </>}
            {k === 'face' && <ARow label="Лицо" hint="neutral, smile, sad, surprise, wary, worried, tired, focus, grumble…"><Text value={e.face} onChange={(v) => setE({ face: v })} /></ARow>}
            {k === 'signal' && <ARow label="Сигнал" hint="Имя сигнала для схем Kokk Story (событие «Сигнал»)."><Text value={e.signal} onChange={(v) => setE({ signal: v })} /></ARow>}
            <div className="c4-btnrow"><button className="c4-btn sm danger" onClick={() => act.delEvent(sel)}><I name="trash" size={11} /> Удалить</button></div>
          </Sec>
        );
      })()}
    </div>
  );
}
function CheckPane({ problems }) {
  if (!problems.length) return <div className="c4-tree-empty"><I name="check" size={13} color="#63c34a" /> Ошибок нет — анимацию можно собирать.</div>;
  return <div className="an-attrs">{problems.map((p, i) => <div key={i} className="c4-issrow"><span className="sv" style={{ background: p.sev === 'error' ? '#e0504a' : p.sev === 'warn' ? '#e0a030' : '#5a6cf0' }} />{p.msg}</div>)}</div>;
}
export { blendWeight, animValues, boneMode, mul3 };
