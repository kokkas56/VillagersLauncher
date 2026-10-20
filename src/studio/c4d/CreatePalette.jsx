// Палитра «Создать» справа, рядом с «Объектами»: вкладки (камеры, актёры, свет и небо, клонеры, эффекторы,
// постройки, сущности мира) с крупными значками и подписями. Щелчок — создать (в точку под прицелом в игре),
// перетаскивание — на схему в видовом окне или в дерево «Объектов».
import React, { useEffect, useState } from 'react';
import { useStudio, lsGet, lsSet } from './core.jsx';
import I, { TYPE_COLOR } from './icons.jsx';
import { TYPE_HINT } from './actions.js';
import { CLONER_MODES, CLONER_MODE_LABEL, EFFECTOR_KINDS, EFFECTOR_LABEL } from '../mograph.js';
import { ENT_TYPES, ENT_TOOL_ORDER } from '../entities.js';
import { EntIcon } from './EntityAttrs.jsx';
import { uniqueId } from '../model.js';
import { useBuild } from './Build.jsx';
import { learnMark } from '../learn/index.jsx';
import { FxPalette } from './Cine.jsx'; // фаза 6: вкладка «Эффекты»

export const CREATE_TABS = [
  ['cams', 'Камеры', 'camera', 'Камеры, пути, метки и группы — всё для съёмки сцены.'],
  ['actors', 'Актёры', 'actor', 'Персонажи сцены: герои проекта, жители долины, любые существа, сам игрок.'],
  ['light', 'Свет и небо', 'sky', 'Свет, звук и «Небо и солнце» (время суток, погода, туман).'],
  ['cloners', 'Клонеры', 'cloner', 'Клонеры раскладывают копии блоков, построек и актёров: линией, сеткой, по кругу, по пути, случайно.'],
  ['effectors', 'Эффекторы', 'effector', 'Эффекторы меняют копии клонера: сдвиг, шаг, случайность, шум, маска.'],
  ['build', 'Постройки', 'structure', 'Постройки из библиотеки «Строительства» и 3D-модели, превращённые в блоки.'],
  ['fx', 'Эффекты', 'rocket', 'Эффекты и действия для таймлайна: экран, мир, существа, жесты актёров, звук. Перетащи на дорожку или щёлкни — встанет в момент бегунка.'],
  ['world', 'Мир', 'world', 'Сущности мира проекта (работают и без сцены): старт игрока, зоны, кнопки, таймеры… Их «Выходы» связывают логику.']
];

// все плитки вкладки: { key, label, icon|ent, color, hint, item, learn, disabled }
function tilesOf(tab, core) {
  const s = core.scene;
  const has = (t) => !!(s && (s.objects || []).some((o) => o.type === t));
  const obj = (type, label, extra = {}) => ({ key: type + (extra.sfx || ''), label, icon: extra.icon || type, color: TYPE_COLOR[extra.icon || type], hint: extra.hint || TYPE_HINT[type] || '', item: { kind: 'obj', type, props: extra.props, name: extra.name }, learn: extra.learn === undefined ? 'create-' + type : extra.learn, needScene: true, disabled: extra.disabled });
  switch (tab) {
    case 'cams': return [obj('camera', 'Камера'), obj('path', 'Путь (сплайн)'), obj('marker', 'Метка'), obj('group', 'Группа', { hint: TYPE_HINT.group + ' Alt+G — сгруппировать выбранное.' })];
    case 'actors': {
      const proj = (core.project && core.project.actors) || [];
      const taken = s ? (s.actors || []).map((x) => x.id) : [];
      return [
        { key: 'valley', label: 'Житель долины', icon: 'actor', color: TYPE_COLOR.actor, learn: 'create-actor', needScene: true, hint: 'Готовый житель долины из мода Villagers — номер задашь в «Атрибутах».', item: { kind: 'actor', actor: { id: uniqueId('valley', taken), kind: 'valley', who: 0, name: 'Житель' } } },
        { key: 'mob', label: 'Любое существо', icon: 'actor', color: '#d9b48a', needScene: true, hint: 'Кот, голем, зомби — любой моб по id.', item: { kind: 'actor', actor: { id: uniqueId('mob', taken), kind: 'entity', type: 'minecraft:cat', name: 'Существо' } } },
        { key: 'player', label: 'Игрок', icon: 'actor', color: '#9fd0ff', needScene: true, disabled: !!(s && (s.actors || []).some((x) => x.kind === 'player')), hint: 'Тот, кто смотрит сцену: повернуть голову, переместить, посадить. В сцене один.', item: { kind: 'actor', actor: { id: uniqueId('player', taken), kind: 'player', name: 'Игрок', spawn: undefined } } },
        ...proj.map((pa) => ({ key: 'p:' + pa.id, label: pa.name || pa.id, icon: 'actor', color: '#e8c070', needScene: true, disabled: taken.includes(pa.id), hint: 'Персонаж проекта «' + (pa.name || pa.id) + '». В сцене — один раз.', item: { kind: 'actor', actor: { id: pa.id, kind: 'story', ref: pa.id, name: pa.name || pa.id } } }))
      ];
    }
    case 'light': return [obj('light', 'Свет'), obj('sound', 'Звук'), obj('sky', 'Небо и солнце', { disabled: has('sky'), hint: TYPE_HINT.sky + (has('sky') ? ' Небо в сцене уже есть.' : '') })];
    case 'cloners': return [
      ...CLONER_MODES.map((m, i) => obj('cloner', CLONER_MODE_LABEL[m], { sfx: ':' + m, props: { mode: m }, learn: i === 0 ? 'create-cloner' : null })),
      obj('block', 'Блок (в клонер)', { hint: TYPE_HINT.block + ' Выбери клонер — блок ляжет в него.' }),
      obj('template', 'Шаблон (в клонер)', { hint: TYPE_HINT.template })
    ];
    case 'effectors': return EFFECTOR_KINDS.map((k, i) => obj('effector', EFFECTOR_LABEL[k], { sfx: ':' + k, props: { kind: k }, name: EFFECTOR_LABEL[k], learn: i === 0 ? 'create-effector' : null }));
    case 'build': return [
      { key: 'vox', label: '3D-модель → блоки', icon: 'cube3', color: '#9fd0ff', learn: 'tool-vox', hint: 'Открыть OBJ, glTF или GLB и превратить модель в постройку из блоков: превью, призрак в игре, запекание, шаблон в библиотеку.', item: { kind: 'vox' }, noDrag: true },
      ...(core.structures || []).map((st) => ({ key: 's:' + st.id, label: st.name || st.id, icon: 'structure', color: TYPE_COLOR.structure, needScene: true, learn: null, hint: 'Постройка из библиотеки' + (st.size ? ' ' + st.size.join('×') : '') + ': ставится целиком, призраком в игре; «Появляется в сцене» — посреди катсцены.', item: { kind: 'obj', type: 'structure', props: { structure: st.id }, name: st.name || st.id } })),
      ...(!(core.structures || []).length ? [{ key: 'none', label: 'Библиотека пуста', icon: 'info', color: '#888', disabled: true, hint: 'Сохрани постройку рамкой: «Строительство» → «Рамка» → «Сохранить как шаблон».', item: null }] : [])
    ];
    case 'world': return ENT_TOOL_ORDER.map((t) => { const d = ENT_TYPES[t]; return { key: 'e:' + t, label: d.label, ent: t, color: d.color, learn: 'ent-' + t, has: d.one && core.ents.some((e) => e.type === t), hint: 'Сущность мира «' + d.label + '»: ' + d.hint, item: { kind: 'ent', type: t } }; });
    default: return [];
  }
}

// выполнить плитку: at — точка мира (бросили на схему), иначе под прицел в игре
export async function runCreate(core, act, bc, item, at) {
  if (!item) return;
  if (item.kind === 'vox') { bc.setVox(true); learnMark('vox'); return; }
  if (item.kind === 'ent') { core.placeEntity(item.type, at ? { pos: at } : {}); return; }
  if (!core.sceneRef.current) { core.toast('Сначала открой или создай сцену (двойной щелчок в «Объектах» → «Сцены»)', 'warn', 4000); return; }
  if (item.kind === 'actor') { act.createActor(item.actor, at); return; }
  if (item.type === 'sky') { const sk = core.sceneRef.current.objects.find((o) => o.type === 'sky'); if (sk) { core.setSel({ objs: [sk.id] }); core.toast('Небо в сцене одно — выбрал его', 'warn'); return; } }
  act.create(item.type, { props: item.props, name: item.name, ...(at ? { at } : {}) });
}

export default function CreatePalette({ act, layout }) {
  const core = useStudio();
  const bc = useBuild();
  const { hp } = core;
  const [tab, setTabState] = useState(() => lsGet('createTab', 'cams'));
  const [open, setOpenState] = useState(() => lsGet('createOpen.' + layout, layout !== 'build'));
  useEffect(() => { setOpenState(lsGet('createOpen.' + layout, layout !== 'build')); }, [layout]);
  const setTab = (t) => { setTabState(t); lsSet('createTab', t); };
  const setOpen = (v) => { setOpenState(v); lsSet('createOpen.' + layout, v); };
  // урок ищет кнопку, которой не видно (в другой вкладке или палитра свёрнута) — открыть нужную вкладку
  useEffect(() => {
    const f = (e) => {
      const sels = String(e.detail || '');
      for (const [id] of CREATE_TABS) {
        const hit = tilesOf(id, core).some((t) => t.learn && sels.includes('"' + t.learn + '"'));
        if (hit) { setOpen(true); setTab(id); return; }
      }
      if (sels.includes('"create-palette"')) setOpen(true);
    };
    window.addEventListener('c4-learn-need', f);
    return () => window.removeEventListener('c4-learn-need', f);
  }); // eslint-disable-line
  if (!open) {
    return (
      <div className="c4-create closed" data-learn="create-palette" onClick={() => setOpen(true)} {...hp('Палитра «Создать»: камеры, актёры, свет, небо, клонеры, эффекторы, постройки, сущности мира. Щёлкни — развернуть.')}>
        <I name="plus" size={16} />
        <span className="vt">Создать</span>
        {CREATE_TABS.map(([id, , icon]) => <button key={id} className="c4-ib" onClick={(e) => { e.stopPropagation(); setTab(id); setOpen(true); }}><I name={icon} size={16} color={TYPE_COLOR[icon]} /></button>)}
      </div>
    );
  }
  const tiles = tilesOf(tab, core);
  const tabInfo = CREATE_TABS.find((t) => t[0] === tab) || CREATE_TABS[0];
  return (
    <div className="c4-create" data-learn="create-palette">
      <div className="c4-create-h">
        <I name="plus" size={14} color="#9fb0ff" /><b>Создать</b>
        <span className="grow" />
        <button className="c4-ib" style={{ width: 22, height: 22 }} onClick={() => setOpen(false)} {...hp('Свернуть палитру «Создать» (видовому окну станет шире).')}><I name="restore" size={12} /></button>
      </div>
      <div className="c4-create-tabs">
        {CREATE_TABS.map(([id, l, icon, h]) => (
          <button key={id} data-learn={'ctab-' + id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} {...hp(l + ': ' + h)}><I name={icon} size={13} color={tab === id ? '#fff' : TYPE_COLOR[icon] || '#aab4c8'} />{l}</button>
        ))}
      </div>
      {tab === 'fx' ? <FxPalette /> : <>
      <div className="c4-create-sub dim">{tabInfo[3]}</div>
      <div className="c4-create-grid">
        {tiles.map((t) => (
          <button key={t.key} className={'c4-tile' + (t.has ? ' has' : '')} data-learn={t.learn || undefined} disabled={t.disabled || (t.needScene && !core.scene)}
            draggable={!t.disabled && !t.noDrag && !!t.item}
            onDragStart={(e) => { e.dataTransfer.setData('text/c4create', JSON.stringify(t.item)); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => runCreate(core, act, bc, t.item)}
            {...hp(t.label + ': ' + t.hint + (t.item && !t.noDrag ? ' Щёлкни — создать в точке под прицелом в игре; или перетащи на схему / в «Объекты».' : '') + (t.needScene && !core.scene ? ' (Сначала открой сцену.)' : ''))}>
            <span className="ic">{t.ent ? <EntIcon type={t.ent} size={24} /> : <I name={t.icon} size={24} color={t.color} sw={1.7} />}</span>
            <span className="l">{t.label}</span>
          </button>
        ))}
      </div>
      </>}
    </div>
  );
}
