// Менеджер объектов (как в C4D), фаза 5 — дерево всего проекта:
//   «Мир» — сущности мира (entities.json: старт игрока, зоны, актёры, кнопки…),
//   «Сцены» — файлы сцен; открытая сцена раскрыта деревом своих объектов (камеры, свет, небо, клонеры…),
//   «Диалоги», «Задания», «Схемы» — папки документов (двойной щелчок — открыть в своём макете).
// В дереве сцены: перетаскивание для вложения, галочки «включён», точки видимости, переименование, правый клик — меню.
import React, { useMemo, useState } from 'react';
import { useStudio } from './core.jsx';
import I, { TypeIcon, TYPE_COLOR } from './icons.jsx';
import { useMenu, MenuView } from './Menus.jsx';
import { createItems, TYPE_HINT, hasAnim } from './actions.js';
import { childrenOf, objById, OBJ_LABEL, activeCamera, linkableChannels, CHANNEL_LABEL } from '../scene3d.js';
import { moveInTree } from './ops.js';
import { CLONER_MODE_LABEL, EFFECTOR_LABEL } from '../mograph.js';
import { fmtTicks, slug, uniqueId } from '../model.js';
import { call } from '../../lib/api.js';
import { isSceneId, ERR } from '../validate.js';
import { ENT_TYPES, ENT_TOOL_ORDER } from '../entities.js';
import { EntIcon } from './EntityAttrs.jsx';

export default function ObjectsPane({ act, openDoc }) {
  const core = useStudio();
  const [tab, setTab] = useState('objects');
  const { hp } = core;
  return (
    <div className="c4-pane" style={{ flex: 1, minHeight: 0 }}>
      <div className="c4-ptabs">
        <button className={tab === 'objects' ? 'on' : ''} onClick={() => setTab('objects')} {...hp('Всё в проекте деревом: «Мир» (сущности), «Сцены» (открытая — с объектами), «Диалоги», «Задания», «Схемы». Двойной щелчок по сцене — открыть.')}>Объекты</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')} {...hp('Журнал: связь с игрой (каждая попытка), что сыграло, что не нашлось, что запеклось.')}>Журнал{core.logs.length ? <small>{core.logs.length}</small> : null}</button>
      </div>
      {tab === 'objects' && <ProjectTree act={act} openDoc={openDoc} />}
      {tab === 'log' && (
        <div className="c4-log">
          {!core.logs.length && <div className="dim">Пока пусто. Сюда пишут игра и связь с ней.</div>}
          {core.logs.slice().reverse().map((l, i) => <div key={i} className={l.level}><span className="dim">{new Date(l.at).toLocaleTimeString('ru-RU')}</span> {l.text}{l.n > 1 ? <span className="c4-logn"> ×{l.n}</span> : null}</div>)}
        </div>
      )}
    </div>
  );
}

const GROUPS = [
  ['world', 'Мир', 'world', 'Сущности мира — как точечные сущности в Hammer: старт игрока, зоны, актёры, кнопки, таймеры… Ставятся кнопками слева (в точку под прицелом в игре). Их «Выходы» связывают всё в логику.'],
  ['scenes', 'Сцены', 'film', 'Катсцены проекта. Двойной щелчок — открыть на таймлайне (загружена только она). ▶ на таймлайне — посмотреть её в игре.'],
  ['dialogs', 'Диалоги', 'dialog', 'Разговоры с ветками. Двойной щелчок — открыть в макете «Диалоги».'],
  ['quests', 'Задания', 'quest', 'Задания по шагам. Двойной щелчок — открыть в макете «Задания».'],
  ['schemes', 'Схемы', 'scheme', 'Логика узлами «событие → условие → действие». Сложное — здесь, простое — «Выходами» сущностей. Двойной щелчок — открыть.']
];

function ProjectTree({ act, openDoc }) {
  const core = useStudio();
  const { scene, hp } = core;
  const [closed, setClosed] = useState(() => ({ dialogs: true, quests: true, schemes: true }));
  const [filter, setFilter] = useState('');
  const [menu, openMenu, closeMenu] = useMenu();
  const [hot, setHot] = useState(null); // строка документа, выбранная одним щелчком: { kind, id }
  const [renEnt, setRenEnt] = useState(null);
  const [edit, setEdit] = useState(null); // переименование/копия сцены
  const f = filter.trim().toLowerCase();
  const match = (s) => !f || String(s || '').toLowerCase().includes(f);
  const toggle = (k) => setClosed((c) => ({ ...c, [k]: !c[k] }));
  const count = { world: core.ents.length, scenes: core.list.length, dialogs: core.dialogs.length, quests: core.quests.length, schemes: core.schemes.length };
  const entMenu = (e, x) => {
    core.setSelEnt(x.id);
    openMenu(e, [
      { label: 'Переименовать', kb: 'двойной щелчок', run: () => setRenEnt(x.id) },
      { label: 'Клонировать', icon: 'copy', kb: 'Ctrl+D', run: () => core.dupEnt(x.id) },
      { label: 'Удалить', icon: 'trash', kb: 'Del', run: () => core.removeEnt(x.id) },
      { sep: true },
      { label: 'Показать в игре', icon: 'frame', kb: 'H', disabled: !core.link.connected, run: () => core.send({ t: 'frame', id: x.id, ids: [x.id], pos: x.pos, dist: 8 }) },
      { label: (x.enabled === false ? 'Включить' : 'Выключить'), run: () => core.editEnts((l) => l.map((y) => (y.id === x.id ? { ...y, enabled: y.enabled === false ? undefined : false } : y))) }
    ]);
  };
  const addEntMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(e, [{ head: 'Поставить в мир (под прицел в игре)' }, ...ENT_TOOL_ORDER.map((t) => ({ label: ENT_TYPES[t].label, icon: ENT_TYPES[t].icon, hint: ENT_TYPES[t].hint, run: () => core.placeEntity(t) }))], { x: r.left, y: r.bottom });
  };
  const sceneMenu = (e, x) => {
    openMenu(e, [
      { label: 'Открыть', kb: 'двойной щелчок', icon: 'film', run: () => core.openScene(x.id) },
      { label: 'Переименовать…', icon: 'gear', run: () => setEdit({ mode: 'rename', id: x.id, title: x.title || x.id, newId: x.id }) },
      { label: 'Копия…', icon: 'copy', run: () => setEdit({ mode: 'dup', id: x.id, title: (x.title || x.id) + ' (копия)', newId: uniqueId(x.id + '_copy', core.list.map((l) => l.id)) }) },
      { sep: true },
      { label: 'Сцена-точка в мир', icon: 'ent_scene', hint: 'Поставить сущность «Сцена-точка» с этой сценой — её можно запускать выходами (например, из зоны).', run: () => core.placeEntity('scene_point', { props: { scene: x.id }, name: 'Сцена: ' + (x.title || x.id) }) }
    ]);
  };
  const docMenu = (e, kind, x) => openMenu(e, [{ label: 'Открыть', kb: 'двойной щелчок', run: () => openDoc(kind, x.id) }]);
  const submitScene = async (e) => {
    e.preventDefault();
    const { mode, id, title, newId } = edit;
    if (!isSceneId(newId)) { core.toast('id сцены — маленькие латинские буквы, цифры, _ и -', 'error'); return; }
    try {
      await core.flush();
      if (mode === 'rename') {
        if (newId !== id) await call('studio:rename', { from: id, to: newId, title });
        else { const s = await call('studio:read', id); await call('studio:save', { ...s, title }); }
      } else await call('studio:duplicate', { from: id, to: newId, title });
      setEdit(null);
      await core.reloadList();
      core.openScene(newId);
    } catch (er) { core.toast(er.message, 'error'); }
  };
  const entIss = (id) => core.entIssues.filter((x) => x.ent === id);

  return (
    <>
      <div className="c4-pmenu">
        <button disabled={!scene} onMouseDown={(e) => { e.stopPropagation(); if (!scene) return; openMenu(e, createItems(core, act), { x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom }); }} {...hp(scene ? 'Создать объект в открытой сцене (камера, свет, небо, клонер…).' : 'Сначала открой сцену (двойной щелчок в «Сценах»).')}>Создать</button>
        <button onMouseDown={(e) => { e.stopPropagation(); addEntMenu(e); }} {...hp('Поставить сущность мира: старт игрока, зону, актёра, кнопку… (то же — кнопки слева).')}>Сущность</button>
        <div className="r">
          <input className="c4-search" placeholder="Найти…" value={filter} onChange={(e) => setFilter(e.target.value)} {...hp('Показать только то, в имени чего есть эти буквы.')} />
        </div>
      </div>
      <div className="c4-tree" onContextMenu={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}>
        {GROUPS.map(([k, label, icon, hint]) => {
          const open = !closed[k] || !!f;
          return (
            <React.Fragment key={k}>
              <div className={'c4-row c4-grp' + (k === 'world' && !core.selEnt && !scene ? '' : '')} onClick={() => toggle(k)} {...hp(label + ': ' + hint)} onMouseEnter={() => core.setHint(label + ': ' + hint)}>
                <span className="tw">{open ? '▾' : '▸'}</span>
                <span className="oi"><I name={icon} size={14} color={k === 'world' ? '#7fd36b' : '#aab4c8'} /></span>
                <span className="nm">{label}</span>
                <span className="dim cnt">{count[k]}</span>
                {k === 'world' && <button className="c4-ib tiny" onClick={(e) => { e.stopPropagation(); addEntMenu(e); }} title="Поставить сущность"><I name="plus" size={11} /></button>}
                {k === 'scenes' && <button className="c4-ib tiny" data-learn="new-scene-tree" onClick={(e) => { e.stopPropagation(); core.newSceneModal && core.newSceneModal(); }} title="Новая сцена"><I name="plus" size={11} /></button>}
              </div>
              {open && k === 'world' && core.ents.filter((x) => match(x.name) || match((ENT_TYPES[x.type] || {}).label)).map((x) => {
                const iss = entIss(x.id);
                const bad = iss.some((q) => q.sev === ERR);
                return (
                  <div key={x.id} className={'c4-row' + (core.selEnt === x.id ? ' sel' : '') + (x.enabled === false ? ' off' : '')} style={{ paddingLeft: 20 }}
                    onClick={() => { core.setSelEnt(x.id); core.setHint((ENT_TYPES[x.type] || {}).label + ' «' + x.name + '». ' + ((ENT_TYPES[x.type] || {}).hint || '')); }}
                    onDoubleClick={() => setRenEnt(x.id)} onContextMenu={(e) => entMenu(e, x)}
                    onMouseEnter={() => core.setHint((ENT_TYPES[x.type] || {}).label + ' «' + x.name + '». ' + ((ENT_TYPES[x.type] || {}).hint || '') + (iss.length ? ' Проблемы: ' + iss.map((q) => q.msg).join('; ') : ''))}>
                    <span className="tw" />
                    <span className="oi"><EntIcon type={x.type} size={14} /></span>
                    <span className="nm">{renEnt === x.id
                      ? <input autoFocus defaultValue={x.name} onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v) core.editEnts((l) => l.map((y) => (y.id === x.id ? { ...y, name: v.slice(0, 80) } : y))); setRenEnt(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenEnt(null); e.stopPropagation(); }} />
                      : x.name}</span>
                    <span className="tags">
                      {(x.outputs || []).length > 0 && <span className="tag io" title={'Выходов: ' + x.outputs.length}>{x.outputs.length}→</span>}
                      {iss.length > 0 && <span className="tag" style={{ background: bad ? '#a03a34' : '#8a6a20' }} title={iss.map((q) => q.msg).join('\n')}>!</span>}
                    </span>
                  </div>
                );
              })}
              {open && k === 'world' && !core.ents.length && <div className="c4-tree-hint">Пусто. Поставь «Старт игрока» кнопкой слева — игрок будет появляться там по F5.</div>}
              {open && k === 'scenes' && core.list.filter((x) => match(x.title) || match(x.id) || (scene && scene.id === x.id)).map((x) => {
                const isOpen = scene && scene.id === x.id;
                if (edit && edit.id === x.id) {
                  return (
                    <form key={x.id} onSubmit={submitScene} className="c4-tree-form">
                      <span className="dim">{edit.mode === 'rename' ? 'Переименовать сцену' : 'Копия сцены'}</span>
                      <input className="c4-text" autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                      <input className="c4-text mono" value={edit.newId} onChange={(e) => setEdit({ ...edit, newId: e.target.value.toLowerCase() })} onKeyDown={(e) => e.stopPropagation()} />
                      <div style={{ display: 'flex', gap: 4 }}><button className="c4-btn sm prim">OK</button><button type="button" className="c4-btn sm" onClick={() => setEdit(null)}>Отмена</button></div>
                    </form>
                  );
                }
                return (
                  <React.Fragment key={x.id}>
                    <div className={'c4-row scene-root' + (isOpen ? ' open' : '') + (isOpen && !core.selEnt && !core.sel.objs.length && !core.sel.ev && core.sel.stage == null ? ' sel' : '') + (hot && hot.kind === 'scenes' && hot.id === x.id && !isOpen ? ' hot' : '')} style={{ paddingLeft: 20 }}
                      onClick={() => { if (isOpen) core.setSel({}); else setHot({ kind: 'scenes', id: x.id }); }}
                      onDoubleClick={() => { if (!isOpen) core.openScene(x.id); }}
                      onContextMenu={(e) => sceneMenu(e, x)}
                      title={x.broken ? 'Файл не читается: ' + x.broken : x.id + '.json'}
                      onMouseEnter={() => core.setHint(isOpen ? 'Открытая сцена «' + (x.title || x.id) + '». Щёлкни — её настройки в «Атрибутах». Внутри — её объекты.' : 'Сцена «' + (x.title || x.id) + '». Двойной щелчок — открыть на таймлайне (загружена будет только она).')}>
                      <span className="tw">{isOpen ? '▾' : ''}</span>
                      <span className="oi"><TypeIcon type="scene" /></span>
                      <span className="nm">{x.title || x.id}{!isOpen && <span className="dim mono" style={{ fontSize: 10, marginLeft: 5 }}>{x.id}</span>}</span>
                      {isOpen && <span className="tag" style={{ background: '#3e4dae' }} title="Открыта на таймлайне">открыта</span>}
                      <span className="dim" style={{ fontSize: 10.5, marginRight: 4 }}>{fmtTicks(isOpen ? scene.length || 0 : x.length || 0)}</span>
                    </div>
                    {isOpen && <SceneObjects act={act} depth0={2} filter={f} />}
                  </React.Fragment>
                );
              })}
              {open && k === 'scenes' && !core.list.length && <div className="c4-tree-hint">Сцен нет — «+» в строке «Сцены» или меню «Файл → Новая сцена».</div>}
              {open && ['dialogs', 'quests', 'schemes'].includes(k) && (k === 'dialogs' ? core.dialogs : k === 'quests' ? core.quests : core.schemes).filter((x) => match(x.title) || match(x.id)).map((x) => (
                <div key={x.id} className={'c4-row' + (hot && hot.kind === k && hot.id === x.id ? ' hot' : '')} style={{ paddingLeft: 20 }}
                  onClick={() => setHot({ kind: k, id: x.id })} onDoubleClick={() => openDoc(k, x.id)} onContextMenu={(e) => docMenu(e, k, x)}
                  onMouseEnter={() => core.setHint((k === 'dialogs' ? 'Диалог' : k === 'quests' ? 'Задание' : 'Схема') + ' «' + (x.title || x.id) + '». Двойной щелчок — открыть.')}>
                  <span className="tw" />
                  <span className="oi"><I name={k === 'dialogs' ? 'dialog' : k === 'quests' ? 'quest' : 'scheme'} size={13} color="#aab4c8" /></span>
                  <span className="nm">{x.title || x.id} <span className="dim mono" style={{ fontSize: 10 }}>{x.id}</span></span>
                  {k === 'schemes' && x.enabled === false && <span className="tag" title="Схема выключена">выкл</span>}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </>
  );
}

// дерево объектов открытой сцены (внутри строки сцены)
function SceneObjects({ act, depth0, filter }) {
  const core = useStudio();
  const { scene, sel, setSel, hp, edit } = core;
  const [closed, setClosed] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [drop, setDrop] = useState(null); // { id, mode }
  const [menu, openMenu, closeMenu] = useMenu();
  const rows = useMemo(() => {
    if (!scene) return [];
    const out = [];
    const f = filter;
    const walk = (pid, depth) => {
      for (const o of childrenOf(scene, pid)) {
        const kids = childrenOf(scene, o.id);
        const m = !f || (o.name || '').toLowerCase().includes(f) || (OBJ_LABEL[o.type] || '').toLowerCase().includes(f);
        if (m) out.push({ o, depth, kids: kids.length });
        if (kids.length && (f || !closed[o.id])) walk(o.id, f ? depth : depth + 1);
      }
    };
    walk(null, depth0);
    for (const o of scene.objects) if (o.parent && !objById(scene, o.parent)) out.push({ o, depth: depth0, kids: 0 });
    return out;
  }, [scene, closed, filter, depth0]);
  if (!scene) return null;
  const act1 = activeCamera(scene, core.time);
  const selSet = new Set(sel.objs);
  const click = (e, o) => {
    if (e.ctrlKey || e.metaKey) setSel({ objs: selSet.has(o.id) ? sel.objs.filter((x) => x !== o.id) : [...sel.objs, o.id] });
    else if (e.shiftKey && sel.objs.length) {
      const ids = rows.map((r) => r.o.id);
      const a = ids.indexOf(sel.objs[sel.objs.length - 1]), b = ids.indexOf(o.id);
      setSel({ objs: ids.slice(Math.min(a, b), Math.max(a, b) + 1) });
    } else setSel({ objs: [o.id] });
    core.setHint(TYPE_HINT[o.type] || '');
  };
  const ctx = (e, o) => {
    if (o && !selSet.has(o.id)) setSel({ objs: [o.id] });
    const isCam = o && o.type === 'camera';
    const items = [
      { label: 'Создать дочерний', icon: 'plus', sub: createItems(core, act).filter((x) => !x.sep).map((it) => (it.sub ? it : { ...it, run: () => act.create(it.icon, { parent: o.id }) })) },
      { label: 'Переименовать', kb: 'двойной щелчок', run: () => setRenaming(o.id) },
      { label: 'Клонировать', icon: 'copy', kb: 'Ctrl+D', hint: 'Копия объекта со всеми детьми и анимацией, чуть правее.', run: () => act.dup() },
      { label: 'Удалить', icon: 'trash', kb: 'Del', run: () => act.del() },
      { sep: true },
      { label: 'Сгруппировать', icon: 'group', kb: 'Alt+G', hint: 'Положить выбранное в новую группу.', run: () => act.group() },
      { label: 'В клонер', icon: 'cloner', hint: 'Положить выбранное в новый клонер — он разложит копии.', run: () => act.toCloner('linear') },
      { label: o.parent ? 'Вынуть из «' + ((objById(scene, o.parent) || {}).name || '') + '»' : 'Вынуть из родителя', disabled: !o.parent, run: () => edit((s) => moveInTree(s, o.id, o.parent, 'after')) },
      { sep: true },
      { label: 'Показать в игре', icon: 'frame', kb: 'H', hint: 'Камера Студии в игре подлетит к объекту.', run: () => core.gameCmd.frame() },
      isCam && { label: 'Смотреть через камеру', icon: 'look', checked: core.game.lookThrough === o.id, hint: 'Камера Студии в игре встанет на место этой камеры и будет ехать с ней при прокрутке таймлайна.', run: () => core.gameCmd.lookThrough(core.game.lookThrough === o.id ? null : o.id) },
      isCam && { label: 'В «Монтаж» с текущего кадра', icon: 'stage', hint: 'С момента бегунка сцену снимает эта камера (как Stage в C4D).', run: () => act.stageCut(o.id) },
      (o.type === 'cloner' || o.type === 'structure') && { sep: true },
      (o.type === 'cloner' || o.type === 'structure') && { label: 'Запечь в мир', icon: 'bake', hint: 'Поставить блоки в мир по-настоящему (можно отменить).', disabled: !core.link.connected, run: () => act.bake(o.id) },
      (o.type === 'cloner' || o.type === 'structure') && { label: 'Отменить запекание', icon: 'unbake', disabled: !core.link.connected || !(scene.bakes || []).some((b) => b.obj === o.id), run: () => act.unbake(o.id) }
    ];
    openMenu(e, items);
  };
  // «Связь»: подпись свойства из «Атрибутов» брошена на объект — выбрать, какое его свойство вести
  const linkDrop = (e, o) => {
    const from = e.dataTransfer.getData('text/c4link');
    if (!from) return;
    const chs = linkableChannels(o);
    if (!chs.length) { core.toast('У «' + o.name + '» нечего связывать', 'warn'); return; }
    openMenu(e, [{ head: from + ' → «' + o.name + '»…' }, ...chs.map((ch) => ({ label: CHANNEL_LABEL[ch] || ch, icon: 'links', run: () => core.addLink(from, o.id + '.' + ch) }))]);
  };
  const onDragOver = (e, o) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('text/c4link')) { setDrop({ id: o.id, mode: 'link' }); return; }
    if (e.dataTransfer.types.includes('text/c4block')) { setDrop(o && (o.type === 'block' || o.type === 'cloner') ? { id: o.id, mode: 'into' } : null); return; }
    if (e.dataTransfer.types.includes('text/c4struct')) { setDrop({ id: o && o.type === 'group' ? o.id : null, mode: 'root' }); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop({ id: o ? o.id : null, mode: !o ? 'root' : y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into' });
  };
  const onDrop = (e, o) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('text/c4link')) { setDrop(null); linkDrop(e, o); return; }
    const blk = e.dataTransfer.getData('text/c4block');
    if (blk) {
      const t = drop && drop.id && objById(scene, drop.id);
      setDrop(null);
      if (!t) { core.toast('Брось блок на «Блок» или на клонер в дереве', 'warn'); return; }
      const m = /^([^[]+)(?:\[(.*)\])?$/.exec(blk);
      const target = t.type === 'block' ? t : childrenOf(scene, t.id).find((c) => c.type === 'block');
      if (target) edit((s) => ({ ...s, objects: s.objects.map((x) => (x.id === target.id ? { ...x, props: { ...x.props, block: m[1], state: m[2] || '' } } : x)) }));
      else act.create('block', { parent: t.id, props: { block: m[1], state: m[2] || '' } });
      core.toast('Блок ' + blk.replace('minecraft:', '') + ' → «' + (target || t).name + '»', 'ok', 1800);
      return;
    }
    const sid = e.dataTransfer.getData('text/c4struct');
    if (sid) { setDrop(null); const st = core.structures.find((x) => x.id === sid); act.create('structure', { props: { structure: sid }, name: (st && st.name) || sid }); return; }
    const id = e.dataTransfer.getData('text/c4obj');
    const d = drop;
    setDrop(null);
    if (!id || !d) return;
    const ids = selSet.has(id) ? sel.objs : [id];
    edit((s) => ids.reduce((acc, x) => (d.mode === 'root' ? moveInTree(acc, x, null, 'into') : moveInTree(acc, x, d.id, d.mode)), s));
  };
  return (
    <>
      {rows.map(({ o, depth, kids }) => {
        const on = o.enabled !== false;
        const vis = o.visible !== false;
        const d = drop && drop.id === o.id ? ' drop-' + drop.mode : '';
        return (
          <div key={o.id} className={'c4-row' + (selSet.has(o.id) ? ' sel' : '') + (on ? '' : ' off') + d} style={{ paddingLeft: depth * 14 - 8 }}
            draggable={renaming !== o.id}
            onDragStart={(e) => { e.dataTransfer.setData('text/c4obj', o.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => onDragOver(e, o)} onDragLeave={() => setDrop(null)} onDrop={(e) => onDrop(e, o)}
            onClick={(e) => click(e, o)} onDoubleClick={() => setRenaming(o.id)} onContextMenu={(e) => ctx(e, o)}
            onMouseEnter={() => core.setHint((OBJ_LABEL[o.type] || o.type) + ' «' + o.name + '». ' + (TYPE_HINT[o.type] || ''))}>
            <span className="tw" onClick={(e) => { e.stopPropagation(); if (kids) setClosed((c) => ({ ...c, [o.id]: !c[o.id] })); }}>{kids ? (closed[o.id] ? '▸' : '▾') : ''}</span>
            <span className="oi"><TypeIcon type={o.type} /></span>
            <span className="nm">
              {renaming === o.id
                ? <input autoFocus defaultValue={o.name} onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { act.rename(o.id, e.target.value); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation(); }} />
                : o.name}
            </span>
            <span className="tags">
              {o.type === 'camera' && act1 && act1.id === o.id && <span className="tag" style={{ background: '#3e4dae' }} title="Эта камера снимает сцену в момент бегунка (по «Монтажу»)">▶</span>}
              {o.type === 'camera' && core.game.lookThrough === o.id && <span className="tag" style={{ background: '#2e7d4f' }} title="Через эту камеру смотрит камера Студии в игре">👁</span>}
              {hasAnim(o) && <span className="tag" title="Анимирован: есть ключи" style={{ color: '#e6c23c' }}>◆</span>}
              {(scene.links || []).some((l) => l && typeof l.to === 'string' && l.to.startsWith(o.id + '.')) && <span className="tag" title="Свойство ведёт «Связь»" style={{ color: '#9fd0ff' }}>⇢</span>}
              {o.type === 'cloner' && <span className="tag" style={{ background: TYPE_COLOR.cloner, color: '#1d3313' }} title={'Режим: ' + CLONER_MODE_LABEL[o.props.mode]}>{(CLONER_MODE_LABEL[o.props.mode] || '?')[0]}</span>}
              {o.type === 'effector' && <span className="tag" style={{ background: TYPE_COLOR.effector, color: '#2a1840' }} title={EFFECTOR_LABEL[o.props.kind]}>{(EFFECTOR_LABEL[o.props.kind] || '?')[0]}</span>}
              {o.type === 'cloner' && (scene.bakes || []).some((b) => b.obj === o.id) && <span className="tag" style={{ background: '#8a5a20' }} title="Запечён в мир (можно отменить)">З</span>}
            </span>
            <span className="flags">
              <span className="vis" onClick={(e) => { e.stopPropagation(); act.toggleVisible(o.id); }} title={vis ? 'Виден в игре (гизмо). Щёлкни — спрятать' : 'Спрятан в игре. Щёлкни — показать'}>
                <i className={vis ? '' : 'v-off'} /><i className={vis ? '' : 'v-off'} />
              </span>
              <span className={'chk ' + (on ? 'on' : 'no')} onClick={(e) => { e.stopPropagation(); act.toggleEnabled(o.id); }} title={on ? 'Включён. Щёлкни — выключить (не попадёт в сцену)' : 'Выключен — в сцену не попадёт. Щёлкни — включить'}>{on ? '✓' : '✕'}</span>
            </span>
          </div>
        );
      })}
      {!rows.length && <div className="c4-tree-hint" style={{ paddingLeft: depth0 * 14 }}>Объектов нет. «Создать» вверху → Камера, Небо, Свет…</div>}
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </>
  );
}

export { slug };
