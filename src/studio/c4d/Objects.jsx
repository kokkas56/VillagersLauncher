// Менеджер объектов (как в C4D): дерево сцены, перетаскивание для вложения, галочки «включён» и точки видимости,
// переименование двойным щелчком, правый клик — меню. Вкладка «Сцены» — список файлов сцен проекта.
import React, { useMemo, useState } from 'react';
import { useStudio } from './core.jsx';
import I, { TypeIcon, TYPE_COLOR } from './icons.jsx';
import { useMenu, MenuView } from './Menus.jsx';
import { createItems, TYPE_HINT, hasAnim } from './actions.js';
import { childrenOf, objById, OBJ_LABEL, activeCamera } from '../scene3d.js';
import { moveInTree } from './ops.js';
import { CLONER_MODE_LABEL, EFFECTOR_LABEL } from '../mograph.js';
import { fmtTicks, slug, uniqueId } from '../model.js';
import { call } from '../../lib/api.js';
import { isSceneId } from '../validate.js';

export default function ObjectsPane({ act }) {
  const core = useStudio();
  const [tab, setTab] = useState('objects');
  const { hp } = core;
  return (
    <div className="c4-pane" style={{ flex: 1, minHeight: 0 }}>
      <div className="c4-ptabs">
        <button className={tab === 'objects' ? 'on' : ''} onClick={() => setTab('objects')} {...hp('Объекты сцены деревом: камеры, актёры, свет, клонеры… Перетаскивай, чтобы вложить один в другой.')}>Объекты</button>
        <button className={tab === 'scenes' ? 'on' : ''} onClick={() => setTab('scenes')} {...hp('Все сцены проекта (файлы studio/scenes/*.json). Щёлкни — откроется.')}>Сцены<small>{core.list.length}</small></button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')} {...hp('Журнал игры: что сыграло, что не нашлось, что запеклось.')}>Журнал{core.logs.length ? <small>{core.logs.length}</small> : null}</button>
      </div>
      {tab === 'objects' && <Tree act={act} />}
      {tab === 'scenes' && <SceneList />}
      {tab === 'log' && (
        <div className="c4-log">
          {!core.logs.length && <div className="dim">Пока пусто. Сюда пишет игра.</div>}
          {core.logs.slice().reverse().map((l, i) => <div key={i} className={l.level}><span className="dim">{new Date(l.at).toLocaleTimeString('ru-RU')}</span> {l.text}</div>)}
        </div>
      )}
    </div>
  );
}

function Tree({ act }) {
  const core = useStudio();
  const { scene, sel, setSel, hp, edit } = core;
  const [closed, setClosed] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [drop, setDrop] = useState(null); // { id, mode }
  const [filter, setFilter] = useState('');
  const [menu, openMenu, closeMenu] = useMenu();
  const rows = useMemo(() => {
    if (!scene) return [];
    const out = [];
    const f = filter.trim().toLowerCase();
    const walk = (pid, depth) => {
      for (const o of childrenOf(scene, pid)) {
        const kids = childrenOf(scene, o.id);
        const match = !f || (o.name || '').toLowerCase().includes(f) || (OBJ_LABEL[o.type] || '').toLowerCase().includes(f);
        if (match) out.push({ o, depth, kids: kids.length });
        if (kids.length && (f || !closed[o.id])) walk(o.id, f ? depth : depth + 1);
      }
    };
    walk(null, 1);
    // объекты с потерянным родителем — в корень
    for (const o of scene.objects) if (o.parent && !objById(scene, o.parent)) out.push({ o, depth: 1, kids: 0 });
    return out;
  }, [scene, closed, filter]);

  if (!scene) return <div className="c4-tree-empty">Сцена не открыта. Вкладка «Сцены» — открой или создай новую.</div>;
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
    const items = o ? [
      { label: 'Создать дочерний', icon: 'plus', sub: createItems(core, act).filter((x) => !x.sep).map((it) => (it.sub ? it : { ...it, run: () => act.create(guessType(it.icon), { parent: o.id, props: it.icon === 'effector' ? undefined : undefined }) })) },
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
      o.type === 'cloner' && { sep: true },
      o.type === 'cloner' && { label: 'Запечь в мир', icon: 'bake', hint: 'Поставить блоки клонера в мир по-настоящему (можно отменить).', disabled: !core.link.connected, run: () => act.bake(o.id) },
      o.type === 'cloner' && { label: 'Отменить запекание', icon: 'unbake', disabled: !core.link.connected || !(scene.bakes || []).some((b) => b.obj === o.id), run: () => act.unbake(o.id) }
    ] : createItems(core, act);
    openMenu(e, items);
  };
  const onDragOver = (e, o) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop({ id: o ? o.id : null, mode: !o ? 'root' : y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into' });
  };
  const onDrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/c4obj');
    const d = drop;
    setDrop(null);
    if (!id || !d) return;
    const ids = selSet.has(id) ? sel.objs : [id];
    edit((s) => ids.reduce((acc, x) => (d.mode === 'root' ? moveInTree(acc, x, null, 'into') : moveInTree(acc, x, d.id, d.mode)), s));
  };
  return (
    <>
      <div className="c4-pmenu">
        <button onMouseDown={(e) => { e.stopPropagation(); openMenu(e, createItems(core, act), { x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom }); }} {...hp('Создать объект в сцене (то же, что меню «Создать»).')}>Создать</button>
        <button onMouseDown={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(e, [
          { label: 'Клонировать', kb: 'Ctrl+D', run: () => act.dup(), disabled: !sel.objs.length },
          { label: 'Удалить', kb: 'Del', run: () => act.del(), disabled: !sel.objs.length },
          { label: 'Сгруппировать', kb: 'Alt+G', run: () => act.group(), disabled: !sel.objs.length },
          { label: 'В клонер', run: () => act.toCloner('linear'), disabled: !sel.objs.length },
          { sep: true },
          { label: 'Выделить всё', kb: 'Ctrl+A', run: () => act.selectAll() },
          { label: 'Развернуть всё', run: () => setClosed({}) },
          { label: 'Свернуть всё', run: () => setClosed(Object.fromEntries(scene.objects.map((o) => [o.id, true]))) }
        ], { x: r.left, y: r.bottom }); }} {...hp('Правка выбранных объектов.')}>Правка</button>
        <div className="r">
          <input className="c4-search" placeholder="Найти…" value={filter} onChange={(e) => setFilter(e.target.value)} {...hp('Показать только объекты, в имени которых есть эти буквы.')} />
        </div>
      </div>
      <div className="c4-tree" onContextMenu={(e) => ctx(e, null)} onDragOver={(e) => { if (e.target === e.currentTarget) onDragOver(e, null); }} onDrop={onDrop}
        onMouseDown={(e) => { if (e.target === e.currentTarget) setSel({}); }}>
        <div className={'c4-row scene-root' + (!sel.objs.length && !sel.ev && sel.stage == null ? ' sel' : '')} onClick={() => setSel({})} {...hp('Сама сцена: длина, музыка, что с игроком в конце. Щёлкни — настройки в «Атрибутах».')}>
          <span className="tw" />
          <span className="oi"><TypeIcon type="scene" /></span>
          <span className="nm">{scene.title || scene.id}</span>
          <span className="dim" style={{ fontSize: 10.5, marginRight: 4 }}>{fmtTicks(scene.length || 0)}</span>
        </div>
        {rows.map(({ o, depth, kids }) => {
          const on = o.enabled !== false;
          const vis = o.visible !== false;
          const d = drop && drop.id === o.id ? ' drop-' + drop.mode : '';
          return (
            <div key={o.id} className={'c4-row' + (selSet.has(o.id) ? ' sel' : '') + (on ? '' : ' off') + d} style={{ paddingLeft: depth * 14 - 8 }}
              draggable={renaming !== o.id}
              onDragStart={(e) => { e.dataTransfer.setData('text/c4obj', o.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => onDragOver(e, o)} onDragLeave={() => setDrop(null)} onDrop={onDrop}
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
        {!rows.length && <div className="c4-tree-empty">Объектов нет. Правый клик здесь или меню «Создать» → Камера, Свет, Клонер…</div>}
      </div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </>
  );
}

function guessType(icon) { return ['camera', 'light', 'sound', 'marker', 'path', 'group', 'block', 'template'].includes(icon) ? icon : icon; }

function SceneList() {
  const core = useStudio();
  const { list, scene, openScene, createScene, hp, toast, reloadList, flush } = core;
  const [adding, setAdding] = useState(null);
  const [edit, setEdit] = useState(null);
  const submit = async (e) => {
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
      await reloadList();
      openScene(newId);
    } catch (er) { toast(er.message, 'error'); }
  };
  return (
    <div className="c4-tree" style={{ padding: 4 }}>
      <div style={{ display: 'flex', gap: 4, padding: '2px 2px 6px' }}>
        <button className="c4-btn sm prim" onClick={() => setAdding(adding == null ? '' : null)} {...hp('Новая сцена: сразу с камерой и «Монтажом».')}><I name="plus" size={12} /> Сцена</button>
        <button className="c4-btn sm" onClick={() => call('shell:openPath', 'studio')} {...hp('Открыть папку проекта Студии.')}><I name="folder" size={12} /> Папка</button>
      </div>
      {adding != null && (
        <form onSubmit={(e) => { e.preventDefault(); if (adding.trim()) { createScene(adding.trim()); setAdding(null); } }} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4 }}>
          <input className="c4-text" autoFocus placeholder="Название, например «Аларик приходит»" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <div style={{ display: 'flex', gap: 4 }}><span className="dim mono grow" style={{ fontSize: 10.5 }}>{adding.trim() ? slug(adding) + '.json' : ''}</span><button className="c4-btn sm prim">Создать</button></div>
        </form>
      )}
      {list.map((x) => (edit && edit.id === x.id ? (
        <form key={x.id} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4, background: '#292929' }}>
          <span className="dim">{edit.mode === 'rename' ? 'Переименовать' : 'Копия сцены'}</span>
          <input className="c4-text" autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <input className="c4-text mono" value={edit.newId} onChange={(e) => setEdit({ ...edit, newId: e.target.value.toLowerCase() })} />
          <div style={{ display: 'flex', gap: 4 }}><button className="c4-btn sm prim">OK</button><button type="button" className="c4-btn sm" onClick={() => setEdit(null)}>Отмена</button></div>
        </form>
      ) : (
        <div key={x.id} className={'c4-row' + (scene && scene.id === x.id ? ' sel' : '')} style={{ paddingLeft: 4 }} onClick={() => (!scene || scene.id !== x.id) && openScene(x.id)} title={x.broken ? 'Файл не читается: ' + x.broken : x.id + '.json'}>
          <span className="oi"><I name="film" size={14} color="#aaa" /></span>
          <span className="nm">{x.title || x.id} <span className="dim mono" style={{ fontSize: 10 }}>{x.id}</span></span>
          <span className="dim" style={{ fontSize: 10.5, marginRight: 6 }}>{fmtTicks(x.length || 0)}</span>
          <button className="c4-ib" style={{ width: 20, height: 18 }} title="Переименовать" onClick={(e) => { e.stopPropagation(); setEdit({ mode: 'rename', id: x.id, title: x.title, newId: x.id }); }}><I name="gear" size={12} /></button>
          <button className="c4-ib" style={{ width: 20, height: 18 }} title="Копия" onClick={(e) => { e.stopPropagation(); setEdit({ mode: 'dup', id: x.id, title: (x.title || x.id) + ' (копия)', newId: uniqueId(x.id + '_copy', list.map((l) => l.id)) }); }}><I name="copy" size={12} /></button>
        </div>
      )))}
      {!list.length && adding == null && <div className="c4-tree-empty">Сцен пока нет — «+ Сцена».</div>}
    </div>
  );
}
