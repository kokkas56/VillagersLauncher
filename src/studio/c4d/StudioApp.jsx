// Окно «Студия Кокка» в духе Cinema 4D: заголовок с макетами, меню, командная строка, палитра инструментов,
// видовое окно (игра), менеджеры объектов и атрибутов, таймлайн, строка состояния, горячие клавиши C4D.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call, on, win } from '../../lib/api.js';
import { Toasts } from '../../components/ui.jsx';
import { useStudioCore, StudioProvider, StudioCtx, lsGet, lsSet, DEFAULT_HINT } from './core.jsx';
import I from './icons.jsx';
import { MenuBar, PopMenu, useHoldGame } from './Menus.jsx';
import { makeActions, createItems, TYPE_HINT } from './actions.js';
import ObjectsPane from './Objects.jsx';
import AttributesPane from './Attributes.jsx';
import Timeline from './Timeline.jsx';
import Viewport from './Viewport.jsx';
import { Datalists } from '../fields.jsx';
import DialogTab from '../DialogTab.jsx';
import QuestTab from '../QuestTab.jsx';
import VarsTab from '../VarsTab.jsx';
import SchemeTab from '../SchemeTab.jsx';
import { BuildProvider, BlockPalette, BuildDock, useBuild } from './Build.jsx';
import Voxelizer from './Voxelizer.jsx';
import StartTab from './Start.jsx';
import { ProjectPicker, NewProjectModal, OpenProjectModal, ProjectPropsModal, openProject } from './Projects.jsx';
import { EntDatalists, EntIcon } from './EntityAttrs.jsx';
import { ENT_TYPES, ENT_TOOL_ORDER } from '../entities.js';
import { useLearn, LearnOverlay, LearnCatalog, ReferenceModal, useF1, learnMark } from '../learn/index.jsx';
import { LinkCard, ProjectActors } from '../../pages/Studio.jsx';
import { fmtTicks } from '../model.js';
import { ERR } from '../validate.js';
import './c4d.css';
import '../studio.css';

export const LAYOUTS = [
  ['start', 'Старт', 'С чего начать: проект, тестовый мир и запуск игры, связь с игрой, как всё устроено, сюжетный режим Kokk Story.'],
  ['scene', 'Сцена', 'Катсцена: камеры, актёры, свет, «Монтаж» и ключи на таймлайне. В центре — игра.'],
  ['build', 'Строительство', 'Блоки и постройки: палитра блоков, рамка (заполнить, заменить, копировать, повернуть), кисть, библиотека построек, 3D-модели → блоки, клонеры. Призраком в игре, запекание в мир.'],
  ['dialogs', 'Диалоги', 'Разговоры с ветками: граф из реплик, выборов, условий и действий.'],
  ['quests', 'Задания', 'Задания по шагам и награды.'],
  ['vars', 'Переменные', 'Память сюжета: что игрок уже сделал.'],
  ['schemes', 'Схемы', 'Логика мира узлами: «событие → условие → действие» (как блюпринты). Живая трасса из игры.']
];
const TOOLS = [
  ['select', 'select', 'Выбор', 'Выбор (щёлкни объект в игре или на схеме). Пробел — прошлый инструмент.'],
  ['move', 'move', 'Перемещение (E)', 'Перемещение (E): тяни стрелки гизмо в игре или объект на схеме. Красная — X, зелёная — Y, синяя — Z.'],
  ['rotate', 'rotate', 'Поворот (R)', 'Поворот (R): крути объект за кольца гизмо в игре (камеру — и на схеме).'],
  ['scale', 'scale', 'Масштаб (T)', 'Масштаб (T): пока работает как перемещение (гизмо масштаба в игре — позже).']
];
const CREATE_TOOLS = [
  ['camera', 'Камера'], ['path', 'Путь'], ['actor', 'Актёр'], ['light', 'Свет'], ['sound', 'Звук'], ['marker', 'Метка'], ['cloner', 'Клонер'], ['effector', 'Эффектор'], ['sky', 'Небо и солнце']
];
// сущности мира слева (как точечные сущности в Hammer): щелчок — поставить в точку под прицелом в игре
const ENT_TOOLS = ['player_start', 'trigger_zone', 'actor', 'button', 'scene_point', 'timer', 'relay', 'counter', 'teleport', 'sound', 'light', 'particles', 'message', 'structure'];
const KEYS = [
  ['E / R / T', 'Перемещение / Поворот / Масштаб'], ['Пробел', 'прошлый инструмент'], ['Ctrl+Z, Ctrl+Y', 'отменить / вернуть'],
  ['Del', 'удалить выбранное (объект, ключи, событие)'], ['Ctrl+D', 'клонировать объект'], ['Alt+G', 'сгруппировать'], ['Ctrl+A', 'выбрать всё'],
  ['H', 'показать выбранное в игре'], ['F9', 'ключ на всё выбранное'], ['F / G', 'тик назад / вперёд'], ['F8', 'проиграть/стоп в Студии'],
  ['Ctrl+S', 'сохранить всё сейчас'], ['Esc', 'снять выделение'], ['F5', '▶ Играть от старта игрока (ещё раз — стоп)'], ['Shift+F5', '▶ Играть с Камеры Студии'], ['F1', 'Справочник: статья о том, что под мышкой'],
  ['— в игре —', ''], ['F6', 'Камера Студии вкл/выкл (Esc — выйти)'], ['ПКМ + WASD / Q E', 'полёт (Shift — быстрее, колесо — скорость)'],
  ['Alt+ЛКМ', 'вращать вокруг точки'], ['Alt+СКМ / СКМ', 'двигать вид'], ['Alt+ПКМ / колесо', 'приближать'], ['ЛКМ / Shift+ЛКМ', 'выбрать / добавить к выбору'],
  ['Ctrl+ЛКМ', 'точка пути на блоке'], ['X / Y / Z', 'закрыть ось'], ['P', 'перенести игрока к камере'], ['F8 / F10', 'ключ камеры из вида / проиграть сцену']
];

export default function StudioApp() {
  return <BuildProvider><StudioMain /></BuildProvider>;
}

function StudioMain() {
  const core = useStudioCore({ withScene: true, who: 'window' });
  const bc = useBuild();
  const act = useMemo(() => makeActions(core), [core]); // eslint-disable-line
  const actRef = useRef(act);
  actRef.current = act;
  const [layout, setLayoutState] = useState(() => lsGet('layout', 'start'));
  const [rightW, setRightW] = useState(() => lsGet('rightW', 380));
  const [tlH, setTlH] = useState(() => lsGet('tlH', 230));
  const [objH, setObjH] = useState(() => lsGet('objH', 0.42));
  const [modal, setModal] = useState(null); // help | issues | report | newScene | about | newProject | openProject | props | learn | ref
  const [report, setReport] = useState(null);
  const [goto, setGoto] = useState(null);
  const [max, setMax] = useState(false);
  const setLayout = (l) => { setLayoutState(l); lsSet('layout', l); };
  useEffect(() => on('win-state', (s) => setMax(!!s.maximized)), []);
  const { scene, hp, sel, link, toast } = core;
  const projName = core.hasProject ? core.project.name || core.projectId : null;
  useEffect(() => { document.body.classList.add('c4d-body'); document.title = projName ? 'Студия Кокка — ' + projName : 'Студия Кокка'; }, [projName]);
  const [refArt, setRefArt] = useState(null);
  const openRef = (id) => { setRefArt(id || null); setModal('ref'); };
  const learn = useLearn(core, { setLayout: (l) => setLayout(l), layout, openModal: setModal, modal });
  useF1((key) => openRef(key ? 'learn:' + key : null));
  // для вложенных панелей: открыть сцену в макете «Сцена», окно новой сцены
  core.openSceneTab = (id) => { setLayout('scene'); core.openScene(id); };
  core.newSceneModal = () => setModal('newScene');
  core.openLearn = () => setModal('learn');
  core.openRef = openRef;
  const popped = (id) => core.pops.includes(id);

  // ---------- команды ----------
  const play = async (force) => {
    const r = await core.playInGame(force);
    if (r === 'issues') setModal('issues');
  };
  // ▶ Играть (F5) / с камеры (Shift+F5); идёт игра — Стоп. Ошибки в сущностях — сначала показать
  const playtest = (from, force) => {
    const ps = core.playState.state;
    if (ps === 'playing' || ps === 'starting') { core.stopPlaytest(); return; }
    if (core.entErr && !force) { setModal('entIssues'); return; }
    core.playtest(from);
  };
  const openProjectWorld = async () => {
    try {
      await core.flush();
      const r = await call('studio:openProjectWorld');
      if (r && r.sent) { toast('Игра уходит в меню и открывает мир проекта…', 'ok', 4000); return; }
      if (r && r.world) {
        if (!(core.boot && core.boot.dev)) { const d = await call('studio:devMode', true); core.setBoot({ ...core.boot, dev: d }); }
        await call('game:play', { quickPlayWorld: r.world });
        toast('Запускаю игру сразу в мире проекта «' + r.world + '»…', 'ok', 6000);
      }
    } catch (e) { toast(e.message, 'error', 8000); }
  };
  core.openProjectWorld = openProjectWorld;
  const build = async () => {
    try { await core.flush(); await core.flushEnts(); const r = await call('studio:build'); setReport(r); setModal('report'); if (r && r.ok) learnMark('build'); } catch (e) { toast(e.message, 'error', 8000); }
  };
  const popOut = (tab) => call('studio:popout', tab).catch((e) => toast(e.message, 'error'));
  const run = {
    undo: () => core.undo(), redo: () => core.redo(), delete: () => (core.selEnt ? core.removeEnt(core.selEnt) : act.del()), clone: () => (core.selEnt ? core.dupEnt(core.selEnt) : act.dup()), group: () => act.group(),
    save: () => { core.flush(); core.flushEnts(); toast('Всё сохранено', 'ok', 1200); }, keyAll: () => core.gameCmd.keyAll()
  };
  core.keyActionRef.current = (name) => { const f = run[name]; if (f) f(); };

  // ---------- клавиши как в C4D ----------
  useEffect(() => {
    const k = (e) => {
      if (document.querySelector('.c4-modal-back, .modal-back')) return;
      const inField = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      const code = e.code;
      if (ctrl && code === 'KeyS') { e.preventDefault(); run.save(); return; }
      if (code === 'F5' && core.hasProject) { e.preventDefault(); playtest(e.shiftKey ? 'camera' : 'start'); return; }
      if (!['scene', 'build'].includes(layout)) return;
      if (ctrl && (code === 'KeyZ' || code === 'KeyY')) { e.preventDefault(); if (inField) e.target.blur(); if (code === 'KeyY' || e.shiftKey) core.redo(); else core.undo(); return; }
      if (inField) return;
      if (ctrl && code === 'KeyD') { e.preventDefault(); run.clone(); return; }
      if (ctrl && code === 'KeyA') { e.preventDefault(); act.selectAll(); return; }
      if (e.altKey && code === 'KeyG') { e.preventDefault(); act.group(); return; }
      if (ctrl || e.altKey) return;
      switch (code) {
        case 'KeyE': core.setTool('move'); break;
        case 'KeyR': core.setTool('rotate'); break;
        case 'KeyT': core.setTool('scale'); break;
        case 'Space': e.preventDefault(); core.toggleLastTool(); break;
        case 'KeyH': core.gameCmd.frame(); break;
        case 'F9': e.preventDefault(); core.gameCmd.keyAll(); break;
        case 'F8': e.preventDefault(); core.setPlaying(!core.playing); break;
        case 'KeyF': core.setTime(Math.max(0, core.timeRef.current - (e.shiftKey ? 10 : 1))); break;
        case 'KeyG': core.setTime(Math.min((scene && scene.length) || 0, core.timeRef.current + (e.shiftKey ? 10 : 1))); break;
        case 'Delete': case 'Backspace': e.preventDefault(); run.delete(); break;
        case 'Escape': core.setSel({}); core.setSelKeys([]); break;
        default:
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---------- меню ----------
  const sceneItems = core.list.map((x) => ({ label: x.title || x.id, icon: 'film', checked: scene && scene.id === x.id, hint: x.id + '.json · ' + fmtTicks(x.length || 0), run: () => core.openScene(x.id) }));
  const menus = [
    { id: 'file', label: 'Файл', learn: 'menu-file', hint: 'Проекты (как карты в Hammer) и сцены: новый, открыть, недавние, сохранить, собрать, свойства, закрыть.', items: () => [
      { label: 'Новый проект…', icon: 'project', learn: 'mi-new-project', hint: 'Новый проект: свой мир (плоский, обычный, пустота или копия) и свои файлы.', run: () => setModal('newProject') },
      { label: 'Открыть проект…', icon: 'folder', learn: 'mi-open-project', hint: 'Список проектов с картинками миров. Открыт всегда только один.', run: () => setModal('openProject') },
      { label: 'Недавние', icon: 'loop', sub: (() => { const b = core.boot || {}; const l = (b.recent || []).map((id) => (b.projects || []).find((x) => x.id === id)).filter(Boolean); return l.length ? l.map((x) => ({ label: x.name, icon: 'project', checked: x.id === core.projectId, hint: x.world ? 'мир ' + x.world : 'без мира', run: () => openProject(core, x.id) })) : [{ label: 'Пока пусто', disabled: true }]; })() },
      { sep: true },
      { label: 'Новая сцена…', icon: 'plus', disabled: !core.hasProject, hint: 'Создать сцену с камерой и «Монтажом».', run: () => setModal('newScene') },
      { label: 'Открыть сцену', icon: 'film', disabled: !core.hasProject, sub: sceneItems.length ? sceneItems : [{ label: 'Сцен пока нет', disabled: true }] },
      { label: 'Сохранить всё', icon: 'check', kb: 'Ctrl+S', disabled: !core.hasProject, hint: 'Всё и так сохраняется само через секунду после правки — это просто записать прямо сейчас.', run: run.save },
      { sep: true },
      { label: 'Проверить', icon: 'warn', disabled: !core.hasProject, hint: 'Ошибки сцены и сущностей мира — во вкладке «Проверка» справа.', run: () => setModal(core.entIssues.length && !core.issues.length ? 'entIssues' : 'issues') },
      { label: 'Собрать проект', icon: 'build', learn: 'mi-build', disabled: !core.hasProject, hint: 'Проверить всё и положить готовый проект в config/kokkstory/studio/<проект>/ — игроки получат его со следующей публикацией сборки.', run: build },
      { label: 'Свойства проекта…', icon: 'gear', disabled: !core.hasProject, hint: 'Название, «Мир» при игре (время, погода, правила), заметка.', run: () => setModal('props') },
      { label: 'Открыть мир проекта', icon: 'world', disabled: !core.hasProject || !(core.project && core.project.world), hint: 'Игра уйдёт в меню и откроет мир проекта; если игра не запущена — лаунчер запустит её сразу в этом мире.', run: openProjectWorld },
      { label: 'Открыть папку проекта', icon: 'folder', disabled: !core.hasProject, run: () => call('shell:openPath', 'studio/projects/' + (core.projectId || '')) },
      { sep: true },
      { label: 'Закрыть проект', icon: 'close', disabled: !core.hasProject, hint: 'Закрыть проект (всё сохранено) и вернуться к выбору проектов.', run: async () => { await core.flush(); call('studio:projectClose').catch((e) => toast(e.message, 'error')); } },
      { label: 'Закрыть Студию', icon: 'close', run: () => win.close() }
    ] },
    { id: 'edit', label: 'Правка', hint: 'Отмена, копирование, удаление, группы.', items: () => [
      { label: 'Отменить', icon: 'undo', kb: 'Ctrl+Z', disabled: !core.canUndo, run: core.undo },
      { label: 'Вернуть', icon: 'redo', kb: 'Ctrl+Y', disabled: !core.canRedo, run: core.redo },
      { sep: true },
      { label: 'Клонировать', icon: 'copy', kb: 'Ctrl+D', disabled: !sel.objs.length, run: act.dup },
      { label: 'Удалить', icon: 'trash', kb: 'Del', disabled: !sel.objs.length && !sel.ev && sel.stage == null && !core.selKeys.length, run: act.del },
      { label: 'Сгруппировать', icon: 'group', kb: 'Alt+G', disabled: !sel.objs.length, run: act.group },
      { label: 'В клонер', icon: 'cloner', disabled: !sel.objs.length, hint: 'Положить выбранное в новый клонер.', run: () => act.toCloner('linear') },
      { sep: true },
      { label: 'Выбрать всё', kb: 'Ctrl+A', run: act.selectAll },
      { label: 'Снять выделение', kb: 'Esc', run: () => core.setSel({}) }
    ] },
    { id: 'create', label: 'Создать', hint: 'Новые объекты сцены: камера, актёр, свет, звук, метка, путь, группа, клонер, эффектор.', items: () => createItems(core, act) },
    { id: 'tools', label: 'Инструменты', hint: 'Инструменты, оси, привязка, Камера Студии в игре.', items: () => [
      ...TOOLS.map(([id, ic, l, h]) => ({ label: l, icon: ic, checked: core.tool === id, hint: h, run: () => core.setTool(id) })),
      { sep: true },
      ...['x', 'y', 'z'].map((ax) => ({ label: 'Ось ' + ax.toUpperCase() + (core.axes[ax] ? '' : ' (закрыта)'), checked: core.axes[ax], hint: 'Закрытая ось не двигается гизмо (X — в игре тоже).', run: () => core.setAxes({ ...core.axes, [ax]: !core.axes[ax] }) })),
      { label: core.space === 'world' ? 'Оси: мировые' : 'Оси: объекта', icon: core.space === 'world' ? 'world' : 'object', hint: 'Гизмо по осям мира или по повороту объекта.', run: () => core.setSpace(core.space === 'world' ? 'object' : 'world') },
      { label: 'Привязка (0,5 блока / 15°)', icon: 'snap', checked: core.snap, run: () => core.setSnap(!core.snap) },
      { sep: true },
      { label: 'Камера Студии в игре', icon: 'gamecam', kb: 'F6 в игре', checked: core.game.editorCam, run: () => core.gameCmd.editorCam(!core.game.editorCam) },
      { sep: true },
      { label: '3D-модель → блоки…', icon: 'cube3', hint: 'Открыть OBJ, glTF или GLB и превратить модель в блоки: превью, призрак в игре, запекание, шаблон в библиотеку.', run: () => bc.setVox(true) },
      { label: 'Кисть', icon: 'brush', hint: 'Рисовать блоками в игре: макет «Строительство» → «Кисть».', run: () => openDock('brush') },
      { label: 'Рамка и действия', icon: 'frame', hint: 'Выделить область в мире и заполнить, заменить, скопировать, повернуть, сохранить шаблоном.', run: () => openDock('sel') },
      { label: 'Показать выбранное', icon: 'frame', kb: 'H', run: core.gameCmd.frame }
    ] },
    { id: 'anim', label: 'Анимация', hint: 'Проигрывание, ключи, интерполяция.', items: () => [
      { label: 'Проиграть в игре', icon: 'play', disabled: !link.connected, hint: 'Сыграть сцену в игре целиком, как увидит игрок.', run: () => play(false) },
      { label: 'Стоп', icon: 'stop', run: core.stopInGame },
      { label: core.playing ? 'Пауза в Студии' : 'Проиграть в Студии', icon: core.playing ? 'pause' : 'play', kb: 'F8', run: () => core.setPlaying(!core.playing) },
      { sep: true },
      { label: 'Ключ на всё выбранное', icon: 'key', kb: 'F9', run: core.gameCmd.keyAll },
      { label: 'Автозапись ключей', icon: 'record', checked: core.autoKey, hint: 'Любая правка ставит ключ в момент бегунка.', run: () => core.setAutoKey(!core.autoKey) },
      { label: 'Интерполяция ключей', icon: 'curves', sub: [['bezier', 'Безье (плавно)'], ['linear', 'Линейно'], ['step', 'Ступенька']].map(([v, l]) => ({ label: l, disabled: !core.selKeys.length, run: () => act.setInterp(v) })) },
      { sep: true },
      { label: 'В начало', icon: 'first', run: () => core.setTime(0) },
      { label: 'В конец', icon: 'last', run: () => core.setTime((scene && scene.length) || 0) }
    ] },
    { id: 'window', label: 'Окно', hint: 'Макеты, отдельные окна редакторов, окно игры.', items: () => [
      ...LAYOUTS.map(([id, l, h]) => ({ label: l, checked: layout === id, hint: h, run: () => setLayout(id) })),
      { sep: true },
      { label: 'Открыть в отдельном окне', icon: 'popout', sub: LAYOUTS.filter(([id]) => ['dialogs', 'quests', 'vars', 'schemes'].includes(id)).map(([id, l]) => ({ label: l, checked: popped(id), hint: 'Редактор «' + l + '» в своём окне — удобно на втором мониторе.', run: () => popOut(id) })) },
      { sep: true },
      { label: 'Встроить окно игры', icon: 'embed', run: () => core.embedCmd('embed') },
      { label: 'Разместить рядом', icon: 'side', run: () => core.embedCmd('side') },
      { label: 'Отстыковать окно игры', icon: 'undock', disabled: core.embed.mode !== 'embedded', run: () => core.embedCmd('undock') }
    ] },
    { id: 'help', label: 'Справка', learn: 'menu-help', hint: 'Обучение, справочник, горячие клавиши.', items: () => [
      { label: 'Обучение…', icon: 'tutor', learn: 'mi-learn', hint: 'Пошаговые уроки: первая сцена за 5 минут, камера, логика, диалоги, строительство и другое.', run: () => setModal('learn') },
      { label: 'Первая сцена за 5 минут', icon: 'play', hint: 'Начать (или продолжить) главный урок.', run: () => learn.start('first_scene') },
      { label: 'Справочник', icon: 'info', kb: 'F1', learn: 'mi-ref', hint: 'Статьи про каждый инструмент, объект, сущность, вход/выход, узел схемы. F1 над кнопкой — её статья.', run: () => openRef(null) },
      { sep: true },
      { label: 'Горячие клавиши и мышь', icon: 'mouse', run: () => setModal('help') },
      { label: 'О Студии', icon: 'info', run: () => setModal('about') }
    ] }
  ];

  // ---------- общие пропсы для редакторов фазы 2 ----------
  const shared = {
    tabs: null,
    linkCard: <LinkCard link={core.link} boot={core.boot || {}} setBoot={core.setBoot} hp={hp} toast={toast} setLink={core.setLink} />,
    hintBox: <div className="st-card" style={{ minHeight: 70 }}><b style={{ fontSize: 12 }}>Подсказка</b><div className="muted small" style={{ lineHeight: 1.45 }}>{core.hint}</div></div>,
    buildBtn: <button className="btn sm" onClick={build} {...hp('Проверить всё и собрать для игроков.')}>Собрать</button>,
    actorsCard: <ProjectActors project={core.project} save={core.saveProject} hp={hp} toast={toast} sceneIds={null} addToScene={() => {}} />,
    toast, hp, api: core.api, link: core.link, project: core.project, saveProject: core.saveProject,
    lists: { scenes: core.list, dialogs: core.dialogs, quests: core.quests, schemes: core.schemes, structures: core.structures }, reloadList: core.reloadAny, patchList: core.patchList, baseRefs: core.baseRefs,
    addLog: core.addLog, gameVars: core.gameVars, setGameVars: core.setGameVars, setGameVarsState: core.setGameVarsState, questStates: core.questStates,
    openDoc: async (kind, id) => { if (kind === 'scenes') { setLayout('scene'); core.openScene(id); return; } setGoto({ kind: kind === 'dialogs' ? 'dialog' : kind === 'schemes' ? 'scheme' : 'quest', id, n: Date.now() }); setLayout(kind); }
  };

  const openDock = (tab) => { lsSet('bDock', tab); setLayout('build'); window.dispatchEvent(new CustomEvent('c4-dock', { detail: tab })); };
  const splitV = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = rightW;
    const mv = (ev) => setRightW(Math.max(300, Math.min(720, w0 - (ev.clientX - x0))));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setRightW((w) => { lsSet('rightW', w); return w; }); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const splitH = (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = tlH;
    const mv = (ev) => setTlH(Math.max(110, Math.min(window.innerHeight - 260, h0 - (ev.clientY - y0))));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTlH((h) => { lsSet('tlH', h); return h; }); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const splitObj = (e) => {
    e.preventDefault();
    const col = e.currentTarget.parentElement.getBoundingClientRect();
    const mv = (ev) => setObjH(Math.max(0.18, Math.min(0.8, (ev.clientY - col.top) / col.height)));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setObjH((h) => { lsSet('objH', h); return h; }); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };

  if (core.bootErr) return <div className="c4d"><TitleBar max={max} title="Студия Кокка" /><div className="c4-soon"><div className="c4-soon-card"><h3>Студия не открылась</h3><p>{core.bootErr}</p></div></div></div>;
  const commonModals = (
    <>
      {modal === 'newProject' && <NewProjectModal Modal={Modal} onClose={() => setModal(null)} />}
      {modal === 'openProject' && <OpenProjectModal Modal={Modal} onClose={() => setModal(null)} onNew={() => setModal('newProject')} />}
      {modal === 'props' && core.hasProject && <ProjectPropsModal Modal={Modal} onClose={() => setModal(null)} />}
      {modal === 'learn' && <LearnCatalog Modal={Modal} learn={learn} onClose={() => setModal(null)} openRef={openRef} />}
      {modal === 'ref' && <ReferenceModal Modal={Modal} start={refArt} learn={learn} onClose={() => setModal(null)} />}
      {modal === 'help' && <Modal title="Горячие клавиши и мышь" onClose={() => setModal(null)}>
        <div className="c4-keys">{KEYS.map(([k, v], i) => (v ? <React.Fragment key={i}><kbd>{k}</kbd><span>{v}</span></React.Fragment> : <b key={i} style={{ gridColumn: '1 / 3', color: '#9fb0ff', marginTop: 6 }}>{k.replace(/—/g, '').trim()}</b>))}</div>
      </Modal>}
      <LearnOverlay learn={learn} />
    </>
  );
  // без открытого проекта — выбор проекта (как стартовое окно C4D / Hammer)
  if (core.boot && !core.hasProject) {
    return (
      <StudioProvider value={core}>
        <div className="c4d">
          <div className="c4-title">
            <div className="c4-logo nd"><i>K</i>Студия Кокка</div>
            <div className="c4-drag" />
            <div className="c4-winbtns nd">
              <button onClick={win.minimize} title="Свернуть"><I name="min" size={13} /></button>
              <button onClick={win.maximize} title={max ? 'Восстановить' : 'Развернуть'}><I name={max ? 'restore' : 'max'} size={12} /></button>
              <button className="close" onClick={win.close} title="Закрыть Студию"><I name="close" size={13} /></button>
            </div>
          </div>
          <MenuBar menus={menus.filter((m) => ['file', 'help'].includes(m.id))} hp={hp} right={<LinkBadge />} />
          <ProjectPicker onNew={() => setModal('newProject')} onLearn={() => setModal('learn')} />
          <StatusBar layout="start" />
          {commonModals}
          <Toasts />
        </div>
      </StudioProvider>
    );
  }
  const is3d = layout === 'scene' || layout === 'build';
  const issuesN = core.issues.length;
  const ctx = core;
  return (
    <StudioProvider value={ctx}>
      <div className="c4d">
        <Datalists />
        <EntDatalists />
        <datalist id="sl-vars">{(core.project.vars || []).map((v) => <option key={v.name} value={v.name} />)}</datalist>
        {/* заголовок */}
        <div className="c4-title">
          <div className="c4-logo nd" {...hp('Студия Кокка — редактор сюжета MineVillagers в духе Cinema 4D.')}><i>K</i>Студия Кокка</div>
          <button className="c4-tbtn nd" disabled={!core.canUndo} onClick={core.undo} {...hp('Отменить (Ctrl+Z).')}><I name="undo" size={15} /></button>
          <button className="c4-tbtn nd" disabled={!core.canRedo} onClick={core.redo} {...hp('Вернуть (Ctrl+Y).')}><I name="redo" size={15} /></button>
          <button className="c4-proj nd" data-learn="title-project" onClick={() => setModal('openProject')} {...hp('Открытый проект «' + (projName || '') + '»' + (core.project.world ? ' — мир saves/' + core.project.world : '') + '. Щёлкни — открыть другой проект.')}><I name="project" size={13} color="#9fb0ff" /><span>{projName}</span></button>
          <div className="c4-doc nd" {...hp(scene ? 'Открытая сцена: ' + scene.id + '.json. Другие — двойной щелчок в «Объектах» → «Сцены».' : 'Сцена не открыта: двойной щелчок по сцене в «Объектах».')}>
            <span>{scene ? (scene.title || scene.id) + (core.saveState === 'saved' ? '' : ' *') : 'Нет сцены'}</span>
          </div>
          <button className="c4-tbtn c4-plus nd" data-learn="new-scene" onClick={() => setModal('newScene')} {...hp('Новая сцена.')}><I name="plus" size={14} /></button>
          <div className="c4-drag" />
          <div className="c4-layouts nd">
            {LAYOUTS.map(([id, l, h]) => (
              <button key={id} data-learn={'layout-' + id} className={(layout === id ? 'on' : '') + (popped(id) ? ' pop' : '')} onClick={() => setLayout(id)} onDoubleClick={() => ['dialogs', 'quests', 'vars', 'schemes'].includes(id) && popOut(id)} {...hp(l + ' — ' + h + (['dialogs', 'quests', 'vars', 'schemes'].includes(id) ? ' Двойной щелчок — открыть в отдельном окне.' : ''))}>
                {l}{id === 'dialogs' && core.dialogs.length ? <small>{core.dialogs.length}</small> : id === 'quests' && core.quests.length ? <small>{core.quests.length}</small> : null}
              </button>
            ))}
          </div>
          <div className="c4-winbtns nd">
            <button onClick={win.minimize} title="Свернуть"><I name="min" size={13} /></button>
            <button onClick={win.maximize} title={max ? 'Восстановить' : 'Развернуть'}><I name={max ? 'restore' : 'max'} size={12} /></button>
            <button className="close" onClick={win.close} title="Закрыть Студию"><I name="close" size={13} /></button>
          </div>
        </div>
        <MenuBar menus={menus} hp={hp} right={<LinkBadge />} />
        <WorldBar openProjectWorld={openProjectWorld} />
        {is3d && <CommandBar play={play} playtest={playtest} build={build} openIssues={() => setModal('issues')} issuesN={issuesN} />}
        {is3d ? (
          <>
            <div className="c4-main">
              <ToolPalette act={act} openDock={openDock} />
              {layout === 'build' && <BlockPalette />}
              <div className="c4-center">
                <Viewport visible={is3d} />
              </div>
              <div className="c4-splitter-v" onMouseDown={splitV} title="Тяни — ширина панелей" />
              <div className="c4-right" style={{ width: rightW }}>
                <div style={{ height: (objH * 100) + '%', display: 'flex', minHeight: 0 }} data-learn="objects"><ObjectsPane act={act} openDoc={shared.openDoc} /></div>
                <div className="c4-splitter-h" onMouseDown={splitObj} />
                <div style={{ flex: 1, display: 'flex', minHeight: 0 }} data-learn="attributes"><AttributesPane act={act} /></div>
              </div>
            </div>
            <div className="c4-splitter-h" onMouseDown={splitH} title={layout === 'build' ? 'Тяни — высота нижней панели' : 'Тяни — высота таймлайна'} />
            {layout === 'build' ? <BuildDock height={Math.max(200, tlH)} timeline={<Timeline act={act} height={Math.max(200, tlH) - 27} />} /> : <Timeline act={act} height={tlH} />}
          </>
        ) : layout === 'start' ? (
          <StartTab setLayout={setLayout} openDock={openDock} build={build} openLearn={() => setModal('learn')} newProject={() => setModal('newProject')} openProjectWorld={openProjectWorld} playtest={playtest} />
        ) : (
          <DocLayout layout={layout} shared={shared} goto={goto} popped={popped(layout)} popOut={popOut} />
        )}
        <StatusBar layout={layout} />
        {commonModals}
        {modal === 'entIssues' && <Modal title={'Сущности мира — ошибок: ' + core.entErr} wide onClose={() => setModal(null)} footer={<>
          {core.entErr > 0 && <button className="c4-btn" onClick={() => { setModal(null); playtest('start', true); }}>Всё равно играть</button>}
          <button className="c4-btn prim" onClick={() => setModal(null)}>Понятно</button>
        </>}>
          {!core.entIssues.length && <p>Ошибок нет.</p>}
          {core.entIssues.map((x, i) => <div key={i} className="c4-issrow" onClick={() => { if (x.ent) core.setSelEnt(x.ent); setModal(null); }}><span className="sv" style={{ background: x.sev === ERR ? '#e0504a' : '#e0a030' }} />{x.msg}</div>)}
        </Modal>}
        {modal === 'about' && <Modal title="О Студии" onClose={() => setModal(null)}>
          <p>Студия Кокка — редактор сюжета сборки MineVillagers: катсцены, диалоги, задания, переменные, клонеры. Всё хранится в JSON в папке игры <span className="mono">studio/</span>; «Собрать» кладёт готовое для игроков в <span className="mono">config/kokkstory/studio</span>.</p>
          <p className="dim">Окно игры встраивается в видовое окно (Windows). Камера Студии в игре — F6.</p>
        </Modal>}
        {modal === 'issues' && <Modal title={'Проверка сцены' + (core.nErr ? ' — ошибок: ' + core.nErr : '')} wide onClose={() => setModal(null)} footer={<>
          {core.nErr > 0 && <button className="c4-btn" onClick={() => { setModal(null); play(true); }}>Всё равно проиграть</button>}
          <button className="c4-btn prim" onClick={() => setModal(null)}>Понятно</button>
        </>}>
          {!core.issues.length && <p>Ошибок нет.</p>}
          {core.issues.map((x, i) => <div key={i} className="c4-issrow" onClick={() => { if (x.sel && x.sel.obj) core.setSel({ objs: [x.sel.obj] }); else if (x.sel && x.sel.track) core.setSel({ ev: x.sel }); setModal(null); }}><span className="sv" style={{ background: x.sev === ERR ? '#e0504a' : '#e0a030' }} />{x.msg}</div>)}
        </Modal>}
        {modal === 'report' && report && <Modal title={report.ok ? 'Собрано для игроков' : 'Не собрано — есть ошибки'} wide onClose={() => setModal(null)} footer={<>
          {report.ok && <button className="c4-btn" onClick={() => call('shell:openPath', 'config/kokkstory/studio/' + (report.project || ''))}>Открыть папку</button>}
          <button className="c4-btn prim" onClick={() => setModal(null)}>Понятно</button>
        </>}>
          {report.ok ? <p>Проект собран: сцен <b>{report.count}</b>, диалогов <b>{report.dialogs || 0}</b>, заданий <b>{report.quests || 0}</b>, схем <b>{report.schemes || 0}</b>, построек <b>{report.structures || 0}</b>, сущностей <b>{report.entities || 0}</b>. Лежат в <span className="mono">{report.dir}</span> и уйдут игрокам со следующей публикацией сборки.</p> : <p>Ошибок: <b>{report.errors}</b>. Пока они есть, ничего не записано.</p>}
          {(report.issues || []).slice(0, 80).map((x, i) => <div key={i} className="c4-issrow"><span className="sv" style={{ background: x.sev === ERR ? '#e0504a' : '#e0a030' }} />{(x.doc || x.scene) ? <b className="mono" style={{ fontSize: 11 }}>{x.doc || x.scene}</b> : null} {x.msg}</div>)}
        </Modal>}
        {modal === 'newScene' && <NewSceneModal onClose={() => setModal(null)} />}
        {bc.vox && <Voxelizer onClose={() => bc.setVox(false)} />}
        <Toasts />
      </div>
    </StudioProvider>
  );
}

export function TitleBar({ max, title }) {
  return (
    <div className="c4-title">
      <div className="c4-logo nd"><i>K</i>{title}</div>
      <div className="c4-drag" />
      <div className="c4-winbtns nd">
        <button onClick={win.minimize} title="Свернуть"><I name="min" size={13} /></button>
        <button onClick={win.maximize} title="Развернуть"><I name={max ? 'restore' : 'max'} size={12} /></button>
        <button className="close" onClick={win.close} title="Закрыть"><I name="close" size={13} /></button>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose, footer, wide }) {
  useHoldGame(true);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="c4-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'c4-modal' + (wide ? ' wide' : '')}>
        <div className="c4-modal-h"><span className="grow">{title}</span><button className="c4-ib" style={{ width: 24, height: 24 }} onClick={onClose}><I name="close" size={13} /></button></div>
        <div className="c4-modal-b">{children}</div>
        {footer && <div className="c4-modal-f">{footer}</div>}
      </div>
    </div>
  );
}

function NewSceneModal({ onClose }) {
  const core = useStudioCtx();
  const [v, setV] = useState('');
  return (
    <Modal title="Новая сцена" onClose={onClose} footer={<><button className="c4-btn" onClick={onClose}>Отмена</button><button className="c4-btn prim" disabled={!v.trim()} onClick={() => { core.createScene(v.trim()); onClose(); }}>Создать</button></>}>
      <p className="dim">Сцена создастся сразу с камерой «Камера 1» и «Монтажом». Имя файла придумается из названия латиницей.</p>
      <input className="c4-text" style={{ height: 26 }} autoFocus placeholder="Например: Аларик приходит" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && v.trim()) { core.createScene(v.trim()); onClose(); } }} />
    </Modal>
  );
}
function useStudioCtx() { return React.useContext(StudioCtx); }

// связь с игрой справа в строке меню: точная причина, если её нет, и «Переподключить»
function LinkBadge() {
  const core = React.useContext(StudioCtx);
  const { link, hp } = core;
  const hb = link.connected && link.heartbeat === 'old';
  return (
    <span className="c4-linkbadge" data-learn="link">
      <span className={'c4-led ' + (link.connected ? (hb ? 'off' : 'on') : 'bad')} />
      <span className="t" {...hp(link.connected ? 'Живая связь с игрой есть' + (link.host ? ' (' + link.host + ':' + link.port + ')' : '') + (hb ? '. Игра не шлёт пульс — старая версия мода.' : '.') : 'Нет связи: ' + (link.text || 'Студия ищет игру каждые 2 секунды') + '. Все попытки — во вкладке «Журнал».')}>
        {link.connected ? 'Игра на связи' + (link.info && link.info.world ? ' · ' + link.info.world : '') : link.text || 'Нет связи с игрой'}
      </span>
      {!link.connected && <button className="c4-btn sm" onClick={() => call('studio:reconnect').then((st) => st && core.setLink((o) => ({ ...o, ...st }))).catch((e) => core.toast(e.message, 'error'))} {...hp('Переподключить: сразу попробовать снова (127.0.0.1 и localhost, порт из studio/.link).')}><I name="reconnect" size={11} /> Переподключить</button>}
    </span>
  );
}
// полоска «игра в другом мире»: проект = свой мир, предлагаем открыть его
function WorldBar({ openProjectWorld }) {
  const core = React.useContext(StudioCtx);
  const w = core.worldMatch;
  const p = core.project;
  if (!p || !p.world || !w || w.match !== false || !core.link.connected) return null;
  return (
    <div className="c4-worldbar">
      <I name="warn" size={13} color="#e8c070" />
      <span>Игра сейчас {w.game && w.game.inWorld === false ? 'в меню' : 'в другом мире' + (w.game && w.game.world ? ' («' + w.game.world + '»)' : '')}, а у проекта свой мир — «{w.worldName || p.world}». Сущности и логика проекта работают только в нём.</span>
      <button className="c4-btn sm prim" onClick={openProjectWorld} {...core.hp('Игра выйдет в меню (мир сохранится) и откроет мир проекта.')}><I name="world" size={11} /> Открыть мир проекта</button>
    </div>
  );
}
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function PlayControls({ playtest }) {
  const core = React.useContext(StudioCtx);
  const { hp, playState, link } = core;
  const [, tick] = useState(0);
  const on = playState.state === 'playing' || playState.state === 'starting' || playState.state === 'stopping';
  useEffect(() => { if (!on) return undefined; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [on]);
  return (
    <div className="c4-playc">
      {on
        ? <button className="c4-ib wide c4-stop" data-learn="stop" onClick={() => core.stopPlaytest()} {...hp('■ Стоп (F5): игра кончается, мир откатывается как был до ▶, снова режим редактора.')}><I name="stop" size={13} /> Стоп</button>
        : <>
          <button className="c4-ib wide c4-playbig" data-learn="play" disabled={!link.connected} onClick={() => playtest('start')} {...hp('▶ Играть (F5): сохранить точку отката, убрать значки редактора, разморозить мир и поставить игрока на «Старт игрока». Вся логика проекта идёт с начала. F5 ещё раз — стоп и откат.')}><I name="play" size={14} /> Играть <kbd>F5</kbd></button>
          <button className="c4-ib wide" data-learn="play-cam" disabled={!link.connected} onClick={() => playtest('camera')} {...hp('▶ с камеры (Shift+F5): то же, но игрок появляется там, где сейчас Камера Студии.')}><I name="play" size={12} /> с камеры</button>
        </>}
      {on && <span className={'c4-playst ' + playState.state} {...hp('Идёт проверка игрой. Всё, что изменится в мире, вернётся по «Стоп».')}>{playState.state === 'starting' ? 'ЗАПУСК…' : playState.state === 'stopping' ? 'ОТКАТ…' : 'ИДЁТ ИГРА · ' + fmtClock(Date.now() - (playState.at || Date.now()))}</span>}
      {!on && <button className={'c4-ib wide' + (core.editorOn ? ' on' : '')} data-learn="editor" disabled={!link.connected} onClick={() => core.setEditorOn(!core.editorOn)} {...hp('Режим редактора в игре: мир заморожен, сюжет не идёт, сущности видны значками, игрок неуязвим и летает. Выключи — увидишь мир как есть.')}><I name="gear" size={12} /> Редактор</button>}
    </div>
  );
}

function CommandBar({ play, playtest, build, openIssues, issuesN }) {
  const core = React.useContext(StudioCtx);
  const { hp, axes, setAxes, space, setSpace, snap, setSnap, game, gameCmd, link, playing } = core;
  return (
    <div className="c4-cmd">
      <button className="c4-ib" disabled={!core.canUndo} onClick={core.undo} {...hp('Отменить (Ctrl+Z).')}><I name="undo" size={17} /></button>
      <button className="c4-ib" disabled={!core.canRedo} onClick={core.redo} {...hp('Вернуть (Ctrl+Y).')}><I name="redo" size={17} /></button>
      <div className="c4-sep" />
      {['x', 'y', 'z'].map((ax) => (
        <button key={ax} className={'c4-ib ax ' + ax + (axes[ax] ? '' : ' locked')} onClick={() => setAxes({ ...axes, [ax]: !axes[ax] })} {...hp('Ось ' + ax.toUpperCase() + ': ' + (axes[ax] ? 'открыта' : 'закрыта') + '. Закрытая ось не двигается гизмо в игре и на схеме (X/Y/Z в игре — то же).')}>{ax.toUpperCase()}</button>
      ))}
      <button className="c4-ib" onClick={() => setSpace(space === 'world' ? 'object' : 'world')} {...hp(space === 'world' ? 'Оси гизмо — мировые. Щёлкни — оси объекта.' : 'Оси гизмо — по повороту объекта. Щёлкни — мировые.')}><I name={space === 'world' ? 'world' : 'object'} size={17} /></button>
      <div className="c4-sep" />
      <button className={'c4-ib' + (snap ? ' on' : '')} onClick={() => setSnap(!snap)} {...hp('Привязка: двигать по 0,5–1 блоку и крутить по 15°. Shift при перетаскивании — наоборот.')}><I name="snap" size={17} /></button>
      <div className="c4-sep" />
      <div className="c4-group">
        <button className={'c4-ib' + (game.editorCam ? ' on' : '')} onClick={() => gameCmd.editorCam(!game.editorCam)} {...hp('Камера Студии в игре: камера отделяется от игрока. ПКМ+WASD/QE — полёт (Shift быстрее), Alt+ЛКМ — вращать, Alt+СКМ — двигать, Alt+ПКМ/колесо — приближать. F6/Esc в игре — выйти.')}><I name="gamecam" size={17} /></button>
        <button data-learn="look-through" className={'c4-ib' + (game.lookThrough ? ' on' : '')} onClick={() => { const c = core.sel.objs.map((id) => core.scene && core.scene.objects.find((o) => o.id === id)).find((o) => o && o.type === 'camera'); gameCmd.lookThrough(game.lookThrough ? null : c ? c.id : (core.scene && core.scene.objects.find((o) => o.type === 'camera') || {}).id || null); }} {...hp('Смотреть через камеру: вид в игре встаёт на место выбранной камеры и едет с ней по таймлайну.')}><I name="look" size={17} /></button>
        <button className={'c4-ib' + (game.shaders ? ' on' : '')} disabled={game.shadersAvail === false} onClick={() => gameCmd.shaders(!game.shaders)} {...hp(game.shadersAvail === false ? 'В игре нет Iris — шейдеры недоступны.' : 'Шейдеры Iris в игре: включить/выключить.')}><I name="shaders" size={17} /></button>
        <button className={'c4-ib' + (game.lights ? ' on' : '')} onClick={() => gameCmd.lights(!game.lights)} {...hp('Свет сцены в мире: поставить блоки света у объектов «Свет», чтобы видеть освещение (выключишь — уберутся).')}><I name="light" size={17} /></button>
        <button className={'c4-ib' + (game.hud ? ' on' : '')} onClick={() => gameCmd.hud(!game.hud)} {...hp('Скрыть интерфейс игры (хотбар, сердечки), пока включена Камера Студии.')}><I name="hud" size={17} /></button>
      </div>
      <div className="c4-sep" />
      <button className="c4-ib" onClick={gameCmd.frame} {...hp('Показать выбранное в игре (H).')}><I name="frame" size={17} /></button>
      <div className="grow" />
      <PlayControls playtest={playtest} />
      <div className="c4-sep" />
      <button className="c4-ib wide" data-learn="check" onClick={openIssues} {...hp('Проверить сцену: ошибки и предупреждения.')}><I name={core.nErr ? 'warn' : 'check'} size={15} color={core.nErr ? '#ff8f86' : undefined} /> Проверить{issuesN ? <span className={'badge' + (core.nErr ? '' : ' w')}>{core.nErr || issuesN}</span> : null}</button>
      <button className="c4-ib wide prim" data-learn="build" onClick={build} {...hp('Собрать проект для игроков: проверить всё и положить в config/kokkstory/studio/<проект>.')}><I name="build" size={15} /> Собрать</button>
    </div>
  );
}

function ToolPalette({ act, openDock }) {
  const core = React.useContext(StudioCtx);
  const bc = useBuild();
  const { hp, tool, setTool } = core;
  const [sub, setSub] = useState(null);
  return (
    <div className="c4-tools two">
      {TOOLS.map(([id, ic, l, h]) => (
        <button key={id} data-learn={'tool-' + id} className={'c4-ib' + (tool === id ? ' on' : '')} onClick={() => setTool(id)} {...hp(h)}><I name={ic} size={17} /></button>
      ))}
      <div className="c4-tsep" title="Сущности мира" />
      {ENT_TOOLS.map((t) => {
        const d = ENT_TYPES[t];
        const has = d.one && core.ents.some((e) => e.type === t);
        return (
          <button key={t} data-learn={'ent-' + t} className={'c4-ib ent' + (has ? ' has' : '')} onClick={() => core.placeEntity(t)} {...hp('Сущность мира «' + d.label + '»: ' + d.hint + ' Щёлкни — поставить в точку под прицелом в игре (или в центр схемы).')}>
            <EntIcon type={t} size={17} />
          </button>
        );
      })}
      <div className="c4-tsep" title="Объекты сцены" />
      {CREATE_TOOLS.map(([type, l]) => (
        <button key={type} data-learn={'create-' + type} className="c4-ib" onClick={(e) => {
          if (type === 'actor' || type === 'cloner' || type === 'effector') { const r = e.currentTarget.getBoundingClientRect(); setSub({ type, x: r.right + 2, y: r.top }); return; }
          if (type === 'sky' && core.scene && core.scene.objects.some((o) => o.type === 'sky')) { const sk = core.scene.objects.find((o) => o.type === 'sky'); core.setSel({ objs: [sk.id] }); core.toast('Небо в сцене одно — выбрал его', 'warn'); return; }
          act.create(type);
        }} {...hp(l + ' (объект сцены): ' + (TYPE_HINT[type] || ''))}>
          <I name={type} size={17} color={type === 'cloner' ? '#7fd36b' : type === 'effector' ? '#b38cf0' : type === 'light' ? '#f2d76b' : type === 'sky' ? '#ffc861' : undefined} />
          {(type === 'actor' || type === 'cloner' || type === 'effector') && <span className="corner" />}
        </button>
      ))}
      <div className="c4-tsep" />
      <button data-learn="tool-brush" className={'c4-ib' + (core.brushOn ? ' on' : '')} onClick={() => openDock('brush')} {...hp('Блок-кисть: рисовать блоками прямо в игре (шар, куб, цилиндр; ставить, заменять, стирать). Открывает «Строительство» → «Кисть».')}><I name="brush" size={17} /></button>
      <button data-learn="tool-box" className="c4-ib" onClick={() => openDock('sel')} {...hp('Рамка: выделить область в мире и заполнить, заменить, очистить, скопировать, повернуть, сохранить шаблоном.')}><I name="frame" size={17} /></button>
      <button data-learn="tool-vox" className="c4-ib" onClick={() => { bc.setVox(true); learnMark('vox'); }} {...hp('3D-модель → блоки: открыть OBJ / glTF / GLB и превратить в постройку.')}><I name="cube3" size={17} /></button>
      {sub && <SubMenu sub={sub} act={act} close={() => setSub(null)} />}
    </div>
  );
}
function SubMenu({ sub, act, close }) {
  const core = React.useContext(StudioCtx);
  useEffect(() => { const c = () => close(); window.addEventListener('mousedown', c); return () => window.removeEventListener('mousedown', c); }, [close]);
  const all = createItems(core, act);
  const it = all.find((x) => x.icon === sub.type);
  return <PopMenu x={sub.x} y={sub.y} items={(it && it.sub) || []} onClose={close} hp={core.hp} />;
}

function DocLayout({ layout, shared, goto, popped, popOut }) {
  if (popped) {
    return (
      <div className="c4-soon">
        <div className="c4-soon-card">
          <h3><I name="popout" size={20} /> Открыто в отдельном окне</h3>
          <p>Редактор «{(LAYOUTS.find((l) => l[0] === layout) || [])[1]}» сейчас в своём окне.</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="c4-btn prim" onClick={() => call('studio:popFocus', layout)}>Перейти к окну</button>
            <button className="c4-btn" onClick={() => call('studio:popClose', layout)}>Вернуть сюда</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="c4-docwrap" data-learn="doc-area">
      <div className="studio" style={{ flex: 1 }}>
        {layout === 'dialogs' && <DialogTab shared={shared} goto={goto} />}
        {layout === 'quests' && <QuestTab shared={shared} goto={goto} />}
        {layout === 'vars' && <VarsTab shared={shared} goto={goto} />}
        {layout === 'schemes' && <SchemeTab shared={shared} goto={goto} />}
      </div>
    </div>
  );
}

const REASON_SHORT = { 'no-game': 'игра не запущена', 'no-dev': 'игра без режима разработчика', 'dev-late': 'режим включён после запуска', refused: 'отказ соединения', busy: 'порт занят', 'old-mod': 'старая версия мода?', dead: 'игра не отвечает', timeout: 'порт не отвечает (брандмауэр?)', closed: 'игра закрыла связь', connecting: 'ищу игру…', idle: 'не нужна' };
function shortReason(link) { return REASON_SHORT[link.reason] || 'ищу игру…'; }
function StatusBar({ layout }) {
  const core = React.useContext(StudioCtx);
  const { hint, link, embed, time, scene, saveState, game } = core;
  if (!scene && saveState === 'saved' && !core.hasProject) return <div className="c4-status"><I name="info" size={13} color="#8a8a8a" /><span className="hint">{hint || DEFAULT_HINT}</span><span className="seg2" title={link.text || ''}><span className={'c4-led ' + (link.connected ? 'on' : 'bad')} />{link.connected ? 'связь есть' : 'нет связи: ' + shortReason(link)}</span></div>;
  const saveText = { saved: 'Сохранено', dirty: 'Есть правки…', saving: 'Сохраняю…', error: 'Не сохранилось!' }[saveState];
  return (
    <div className="c4-status">
      <I name="info" size={13} color="#8a8a8a" />
      <span className="hint">{hint || DEFAULT_HINT}</span>
      {game.editorCam && <span className="seg2" title="Управление Камерой Студии в игре">🎥 ПКМ+WASD/QE — полёт · Alt+мышь — орбита/сдвиг/зум · E/R/T</span>}
      {core.playState && ['playing', 'starting', 'stopping'].includes(core.playState.state) && <span className="seg2 playing">▶ идёт игра — F5 или ■ Стоп вернут мир</span>}
      <span className="seg2" title={link.text || ''}><span className={'c4-led ' + (link.connected ? (link.heartbeat === 'old' ? 'off' : 'on') : 'bad')} />{link.connected ? 'связь есть' + (link.heartbeat === 'ok' ? ' · пульс' : '') : 'нет связи: ' + shortReason(link)}{embed.mode === 'embedded' ? ' · игра встроена' : embed.mode === 'side' ? ' · окна рядом' : ''}</span>
      {['scene', 'build'].includes(layout) && scene && <span className="seg2">20 тиков/с · {time} т · {fmtTicks(time)} / {fmtTicks(scene.length || 0)}</span>}
      {(scene || core.hasProject) && <span className={'seg2 save ' + saveState}>{saveText}</span>}
    </div>
  );
}
