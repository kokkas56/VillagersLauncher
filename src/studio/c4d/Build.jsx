// Макет «Строительство»: палитра блоков слева (поиск, избранное, цвета, перетаскивание), внизу — док:
// «Выделение» (два угла, заполнить/заменить/очистить/копировать/вставить/повернуть/отразить, сохранить шаблоном, отмена),
// «Кисть» (шар/куб/цилиндр в игре), «Постройки» (библиотека шаблонов с картинками) и «Таймлайн».
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import { useStudio, lsGet, lsSet, REGION_RU } from './core.jsx';
import I from './icons.jsx';
import { Num, ARow } from './Attributes.jsx';
import { selToPos } from '../fields.jsx';
import { DEFAULT_BLOCKS, blockFlags, rgbToLab } from '../voxel.js';
import { slug, uniqueId } from '../model.js';
import { useMenu, MenuView } from './Menus.jsx';

const BuildCtx = createContext(null);
export const useBuild = () => useContext(BuildCtx);

// общее для палитры, кисти и действий: текущий блок, второй блок (что заменить), избранное
export function BuildProvider({ children }) {
  const [block, setBlockS] = useState(() => lsGet('bBlock', 'minecraft:stone_bricks'));
  const [what, setWhatS] = useState(() => lsGet('bWhat', ''));
  const [favs, setFavsS] = useState(() => lsGet('bFavs', ['minecraft:stone_bricks', 'minecraft:oak_planks', 'minecraft:spruce_log', 'minecraft:cobblestone', 'minecraft:white_wool']));
  const [vox, setVox] = useState(false);
  const v = useMemo(() => ({
    block, setBlock: (b) => { setBlockS(b); lsSet('bBlock', b); },
    what, setWhat: (b) => { setWhatS(b); lsSet('bWhat', b); },
    favs, toggleFav: (b) => setFavsS((f) => { const n = f.includes(b) ? f.filter((x) => x !== b) : [...f, b]; lsSet('bFavs', n); return n; }),
    vox, setVox
  }), [block, what, favs, vox]);
  return <BuildCtx.Provider value={v}>{children}</BuildCtx.Provider>;
}

const short = (id) => String(id || '').replace(/^minecraft:/, '');
const hex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
function hueOf(rgb) { const l = rgbToLab(rgb[0], rgb[1], rgb[2]); const c = Math.hypot(l[1], l[2]); return c < 9 ? 1000 + (100 - l[0]) : ((Math.atan2(l[2], l[1]) * 180) / Math.PI + 360 + 30) % 360; }

// поле блока: можно вписать, выбрать из палитры или бросить блок из палитры
export function BlockField({ value, onChange, placeholder, title }) {
  const core = useStudio();
  const blocks = core.gameBlocks || DEFAULT_BLOCKS;
  const b = blocks.find((x) => x.id === value);
  const [over, setOver] = useState(false);
  return (
    <div className={'bd-bfield' + (over ? ' over' : '')} title={title || 'Блок: впиши id, щёлкни блок в палитре слева или перетащи его сюда'}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/c4block')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { const id = e.dataTransfer.getData('text/c4block'); setOver(false); if (id) { e.preventDefault(); onChange(id); } }}>
      <span className="sw" style={{ background: b ? hex(b.rgb) : 'repeating-linear-gradient(45deg,#444 0 4px,#333 4px 8px)' }} />
      <input className="c4-text mono" list="sl-blocks" value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim())} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}

// ---------- палитра блоков (левая колонка) ----------
export function BlockPalette() {
  const core = useStudio();
  const bc = useBuild();
  const { hp } = core;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(() => lsGet('bTab', 'all'));
  const [sort, setSort] = useState(() => lsGet('bSort', 'color'));
  const [busy, setBusy] = useState(false);
  const [menu, openMenu, closeMenu] = useMenu();
  const blocks = core.gameBlocks || DEFAULT_BLOCKS;
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    let l = blocks.filter((b) => (!f || b.id.includes(f.replace(/\s+/g, '_'))) && (tab !== 'fav' || bc.favs.includes(b.id)) && (tab !== 'full' || !blockFlags(b)));
    if (sort === 'color') l = l.slice().sort((a, b) => hueOf(a.rgb) - hueOf(b.rgb));
    else l = l.slice().sort((a, b) => a.id.localeCompare(b.id));
    return l;
  }, [blocks, q, tab, sort, bc.favs]);
  const load = async () => {
    if (!core.link.connected) { core.toast('Нет связи с игрой — пока встроенный список блоков', 'warn'); return; }
    setBusy(true);
    try { const r = await call('studio:blocks'); if (r && r.colors) core.setHint('Палитра обновлена: ' + Object.keys(r.colors).length + ' блоков из игры'); } catch (e) { core.toast(e.message, 'error'); }
    setBusy(false);
  };
  const cur = blocks.find((b) => b.id === bc.block);
  const setT = (t) => { setTab(t); lsSet('bTab', t); };
  return (
    <div className="c4-pane bd-pal">
      <div className="c4-ptabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setT('all')} {...hp('Все блоки: из игры (кнопка ⟳) или встроенный список ванильных.')}>Блоки<small>{blocks.length}</small></button>
        <button className={tab === 'fav' ? 'on' : ''} onClick={() => setT('fav')} {...hp('Избранное: звёздочка у блока (или правый клик).')}>★<small>{bc.favs.length}</small></button>
        <button className={tab === 'full' ? 'on' : ''} onClick={() => setT('full')} {...hp('Только полные «простые» блоки: без прозрачных, падающих (песок, гравий) и блоков-сущностей (сундуки, бочки).')}>Простые</button>
        <div className="r"><button className={'c4-ib' + (busy ? ' on' : '')} onClick={load} {...hp('Загрузить палитру из игры: все блоки сборки с цветами их текстур (игра считает их один раз и запоминает).')}><I name="loop" size={13} /></button></div>
      </div>
      <div className="bd-cur" {...hp('Текущий блок — им рисует кисть и заполняет «Заполнить». Тяни его (или любой блок ниже) на поле, клонер или блок в дереве объектов.')}
        draggable onDragStart={(e) => { e.dataTransfer.setData('text/c4block', bc.block); e.dataTransfer.effectAllowed = 'copy'; }}>
        <span className="sw big" style={{ background: cur ? hex(cur.rgb) : '#555' }} />
        <div className="grow"><b className="mono">{short(bc.block)}</b><div className="dim">{cur ? 'цвет ' + hex(cur.rgb) + (blockFlags(cur) ? ' · ' + flagRu(blockFlags(cur)) : '') : 'нет в палитре'}</div></div>
        <button className={'bd-star' + (bc.favs.includes(bc.block) ? ' on' : '')} onClick={() => bc.toggleFav(bc.block)} title="В избранное">★</button>
      </div>
      <div className="c4-pmenu">
        <input className="c4-search" style={{ width: '100%' }} placeholder="Найти блок…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} {...hp('Поиск по id: oak, brick, wool…')} />
        <div className="r"><button className="c4-ib" onClick={() => { const n = sort === 'color' ? 'name' : 'color'; setSort(n); lsSet('bSort', n); }} {...hp(sort === 'color' ? 'Сейчас — по цвету (радугой). Щёлкни — по имени.' : 'Сейчас — по имени. Щёлкни — по цвету.')}><I name={sort === 'color' ? 'shaders' : 'filter'} size={13} /></button></div>
      </div>
      <div className="bd-grid">
        {shown.map((b) => (
          <div key={b.id} className={'bd-b' + (b.id === bc.block ? ' on' : '')} draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/c4block', b.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={(e) => { if (e.shiftKey || e.altKey) bc.setWhat(b.id); else bc.setBlock(b.id); }}
            onContextMenu={(e) => openMenu(e, [
              { label: 'Рисовать этим', icon: 'brush', run: () => bc.setBlock(b.id) },
              { label: 'Заменять этот (что)', icon: 'loop', hint: 'Для «Заменить»: какой блок менять на текущий.', run: () => bc.setWhat(b.id) },
              { label: bc.favs.includes(b.id) ? 'Убрать из избранного' : 'В избранное', run: () => bc.toggleFav(b.id) },
              { sep: true }, { head: b.id }
            ])}
            onMouseEnter={() => core.setHint(b.id + ' — щёлкни: рисовать им; Shift+щелчок: «что заменять»; тяни — на поле, клонер или блок в дереве. ' + (blockFlags(b) ? '(' + flagRu(blockFlags(b)) + ')' : ''))}>
            <span className="sw" style={{ background: hex(b.rgb) }} />
            <span className="nm">{short(b.id)}</span>
            {bc.favs.includes(b.id) && <span className="fv">★</span>}
            {blockFlags(b) && <span className="fl" title={flagRu(blockFlags(b))}>{blockFlags(b)}</span>}
          </div>
        ))}
        {!shown.length && <div className="c4-tree-empty">{tab === 'fav' ? 'Избранного нет — правый клик по блоку → «В избранное».' : 'Ничего не нашлось.'}</div>}
      </div>
      <div className="bd-src dim">{core.gameBlocks ? 'палитра из игры' : 'встроенный список · ⟳ — из игры'}</div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </div>
  );
}
function flagRu(f) { return [f.includes('t') && 'прозрачный', f.includes('g') && 'падает', f.includes('e') && 'блок-сущность'].filter(Boolean).join(', '); }

// ---------- нижний док ----------
export function BuildDock({ height, timeline }) {
  const core = useStudio();
  const { hp } = core;
  const [tab, setTab] = useState(() => lsGet('bDock', 'sel'));
  const setT = (t) => { setTab(t); lsSet('bDock', t); };
  useEffect(() => { const f = (e) => e.detail && setTab(e.detail); window.addEventListener('c4-dock', f); return () => window.removeEventListener('c4-dock', f); }, []);
  return (
    <div className="c4-pane bd-dock" style={{ height }}>
      <div className="c4-ptabs">
        <button className={tab === 'sel' ? 'on' : ''} onClick={() => setT('sel')} {...hp('Выделение области в мире и действия над ней: заполнить, заменить, очистить, копировать, вставить, повернуть, отразить, сохранить как шаблон.')}>Выделение и действия</button>
        <button className={tab === 'brush' ? 'on' : ''} onClick={() => setT('brush')} {...hp('Кисть: рисовать блоками прямо в игре (ЛКМ в Камере Студии).')}>Кисть{core.brushOn ? <small style={{ color: '#7fd36b' }}>вкл</small> : null}</button>
        <button className={tab === 'lib' ? 'on' : ''} onClick={() => setT('lib')} {...hp('Библиотека построек (studio/structures): поставить в сцену, призраком в игру или в мир.')}>Постройки<small>{core.structures.length}</small></button>
        <button className={tab === 'tl' ? 'on' : ''} onClick={() => setT('tl')} {...hp('Таймлайн сцены: когда клонеры и постройки появляются.')}>Таймлайн</button>
        <div className="r"><BuildUndo /></div>
      </div>
      {tab === 'sel' && <SelectionPanel />}
      {tab === 'brush' && <BrushPanel />}
      {tab === 'lib' && <StructLibrary />}
      {tab === 'tl' && <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{timeline}</div>}
    </div>
  );
}

function BuildUndo() {
  const core = useStudio();
  const [menu, openMenu, closeMenu] = useMenu();
  const ops = core.buildOps;
  return (
    <>
      <button className="c4-btn sm" disabled={!ops.length || !core.link.connected} onMouseDown={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(e, ops.slice().reverse().map((o) => ({ label: (REGION_RU[o.op] || (o.op === 'brush' ? 'Кисть' : o.op === 'bake' ? 'Запекание' : o.op)) + (o.n ? ' · ' + o.n + ' бл.' : '') + ' · ' + new Date(o.at).toLocaleTimeString('ru-RU'), icon: 'unbake', hint: 'Вернуть блоки, как были до этого действия.', run: () => core.undoBuild(o.undoId) })), { x: r.right - 260, y: r.bottom }); }}
        {...core.hp('Отменить действие в мире (заполнение, замену, кисть, запекание): игра вернёт блоки как были. Последние ' + ops.length + '.')}><I name="unbake" size={12} /> Отменить в мире{ops.length ? ' (' + ops.length + ')' : ''}</button>
      <MenuView menu={menu} close={closeMenu} hp={core.hp} />
    </>
  );
}

function Corner({ label, value, onChange, hint }) {
  const core = useStudio();
  const v = Array.isArray(value) ? value : null;
  const grab = async () => { try { const p = selToPos(await core.api.getSel(), true); if (!p) throw new Error('В игре прицел ни на что не наведён'); onChange(p); } catch (e) { core.toast(e.message, 'error'); } };
  return (
    <ARow label={label} hint={hint}>
      {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} int value={v ? v[i] : null} step={1} onChange={(n) => { const c = v ? v.slice() : [0, 64, 0]; c[i] = n; onChange(c); }} />)}
      <button className="c4-ib" style={{ width: 22, height: 19 }} disabled={!core.link.connected} onClick={grab} title="Взять блок под прицелом в игре"><I name="look" size={12} /></button>
    </ARow>
  );
}

const FILL_SHAPES = [['solid', 'Сплошь', 'Заполнить всю рамку.'], ['hollow', 'Коробка', 'Оболочка блоком, внутри воздух.'], ['walls', 'Стены', 'Только боковые стены.'], ['outline', 'Рёбра', 'Только рёбра рамки (каркас).']];
function SelectionPanel() {
  const core = useStudio();
  const bc = useBuild();
  const { hp, buildSel: s, setBuildSel } = core;
  const ok = Array.isArray(s.from) && Array.isArray(s.to);
  const size = ok ? [0, 1, 2].map((i) => Math.abs(s.to[i] - s.from[i]) + 1) : null;
  const vol = size ? size[0] * size[1] * size[2] : 0;
  const [tpl, setTpl] = useState({ name: '', ents: false, air: true });
  const [rot, setRot] = useState(90);
  const [shape, setShape] = useState('solid');
  const [target, setTarget] = useState('box');
  const live = core.link.connected;
  const capture = async () => {
    const name = tpl.name.trim() || 'Постройка';
    const id = uniqueId(slug(name, 'build'), core.structures.map((x) => x.id));
    const r = await core.regionOp('capture', { id, name, includeEntities: !!tpl.ents, ...(tpl.air ? {} : { air: false }) });
    if (r) { core.toast('Сохраняю «' + name + '» (' + id + ') — игра пришлёт ответ', 'ok', 3000); setTpl({ ...tpl, name: '' }); }
  };
  const big = vol > 200000;
  const boxHint = ok ? '' : ' Рамки в Студии нет — игра возьмёт свою рамку (B в Камере Студии).';
  return (
    <div className="bd-body">
      <div className="bd-col" style={{ width: 340 }}>
        <div className="bd-h">Рамка <span className="dim">{ok ? size.join(' × ') + ' = ' + vol.toLocaleString('ru-RU') + ' блоков' : 'не задана — берётся из игры'}</span></div>
        <Corner label="Угол 1" value={s.from} onChange={(p) => setBuildSel({ ...s, from: p })} hint="Первый угол рамки. В игре: Камера Студии → B (или Shift+ЛКМ) и тяни от блока до блока — углы придут сюда сами." />
        <Corner label="Угол 2" value={s.to} onChange={(p) => setBuildSel({ ...s, to: p })} hint="Противоположный угол рамки." />
        <div className="c4-btnrow">
          <button className="c4-btn sm" disabled={!live} onClick={() => call('studio:send', { t: 'getBox' }).catch(() => {})} {...hp('Взять рамку, выделенную в игре.')}><I name="look" size={12} /> Из игры</button>
          <button className="c4-btn sm" disabled={!ok} onClick={() => setBuildSel({ from: null, to: null })} {...hp('Снять рамку (и в игре).')}><I name="close" size={12} /> Снять</button>
        </div>
        <div className="c4-ahint">В игре: <b>B</b> — «Рамка» (ЛКМ тянуть), <b>F</b> — заполнить, <b>Del</b> — очистить, <b>Ctrl+C / X / V</b> — копия. Рамка оранжевая, видна сквозь стены.</div>
      </div>
      <div className="bd-col" style={{ width: 340 }}>
        <div className="bd-h">Блоками</div>
        <ARow label="Чем" hint="Каким блоком заполнять или на что заменять. Щелчок в палитре слева или перетащи блок сюда."><BlockField value={bc.block} onChange={bc.setBlock} /></ARow>
        <ARow label="Что заменить" hint="Для «Заменить» и «Очистить»: какой блок искать — id, id[свойства], #тег, * (всё, кроме воздуха), !… (кроме). Пусто — всё, кроме воздуха. Shift+щелчок в палитре."><BlockField value={bc.what} onChange={bc.setWhat} placeholder="всё, кроме воздуха" /></ARow>
        <ARow label="Форма" hint={FILL_SHAPES.map((x) => x[1] + ' — ' + x[2]).join(' ')}><div className="bd-seg sm">{FILL_SHAPES.map(([v, l, h]) => <button key={v} className={shape === v ? 'on' : ''} title={h} onClick={() => setShape(v)}>{l}</button>)}</div></ARow>
        <div className="c4-btnrow">
          <button className="c4-btn sm prim" disabled={!live} onClick={() => core.regionOp('fill', { block: bc.block, shape })} {...hp('Заполнить рамку блоком «Чем» выбранной формой (можно отменить).' + boxHint)}><I name="block" size={12} /> Заполнить</button>
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('replace', { block: bc.block, ...(bc.what ? { find: bc.what } : {}) })} {...hp('Заменить в рамке «Что заменить» на «Чем» (можно отменить).' + boxHint)}><I name="loop" size={12} /> Заменить</button>
          <button className="c4-btn sm danger" disabled={!live} onClick={() => core.regionOp('clear', bc.what ? { find: bc.what } : {})} {...hp('Очистить рамку — воздух (только «Что заменить», если задано). Можно отменить.' + boxHint)}><I name="trash" size={12} /> Очистить</button>
        </div>
        {big && <div className="c4-iss w">Большая рамка — игра ставит блоки по частям, несколько секунд.</div>}
      </div>
      <div className="bd-col" style={{ width: 300 }}>
        <div className="bd-h">Копия и поворот <span className="dim">{core.clipboard && core.clipboard.size ? 'в буфере ' + core.clipboard.size.join('×') : 'буфер пуст'}</span></div>
        <div className="c4-btnrow">
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('copy', {})} {...hp('Скопировать рамку в буфер (с содержимым сундуков).')}><I name="copy" size={12} /> Копировать</button>
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('copy', { cut: true })} {...hp('Вырезать: в буфер, а рамку очистить (можно отменить).')}><I name="trash" size={12} /> Вырезать</button>
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('paste', {})} {...hp('Вставить буфер под прицелом в игре (с поворотом и отражением буфера). Можно отменить.')}><I name="template" size={12} /> Вставить</button>
        </div>
        <ARow label="Что крутить" hint="Рамку — блоки на месте (с отменой); буфер — копию перед вставкой."><div className="bd-seg sm"><button className={target === 'box' ? 'on' : ''} onClick={() => setTarget('box')}>рамку</button><button className={target === 'clipboard' ? 'on' : ''} onClick={() => setTarget('clipboard')}>буфер</button></div></ARow>
        <ARow label="Повернуть" hint="Поворот вокруг вертикали (для рамки — вокруг её центра).">
          <select className="c4-text" value={rot} onChange={(e) => setRot(Number(e.target.value))}>{[90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}</select>
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('rotate', { deg: rot, target })}><I name="rotate" size={12} /></button>
        </ARow>
        <ARow label="Отразить" hint="Зеркально по оси.">
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('mirror', { axis: 'x', target })}>по X</button>
          <button className="c4-btn sm" disabled={!live} onClick={() => core.regionOp('mirror', { axis: 'z', target })}>по Z</button>
        </ARow>
      </div>
      <div className="bd-col grow">
        <div className="bd-h">Сохранить как шаблон</div>
        <ARow label="Название" hint="Как назвать постройку в библиотеке (id файла придумается сам латиницей)."><input className="c4-text" value={tpl.name} placeholder="Например: Хижина рыбака" onChange={(e) => setTpl({ ...tpl, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></ARow>
        <ARow label="С мобами" hint="Сохранить вместе с сущностями внутри (рамки, стойки, животные)."><span className={'c4-check' + (tpl.ents ? ' on' : '')} onClick={() => setTpl({ ...tpl, ents: !tpl.ents })}>{tpl.ents ? '✓' : ''}</span></ARow>
        <ARow label="С воздухом" hint="Воздух тоже часть постройки (при установке вычистит место). Выключи — на месте воздуха останется то, что было."><span className={'c4-check' + (tpl.air ? ' on' : '')} onClick={() => setTpl({ ...tpl, air: !tpl.air })}>{tpl.air ? '✓' : ''}</span></ARow>
        <div className="c4-btnrow"><button className="c4-btn sm prim" disabled={!live} onClick={capture} {...hp('Игра сохранит рамку в studio/structures/<id>.nbt (обычный шаблон Minecraft) + описание с видом сверху. Появится во вкладке «Постройки».' + boxHint)}><I name="build" size={12} /> Сохранить шаблон</button>
          <button className="c4-btn sm" onClick={() => bc.setVox(true)} {...hp('Сделать постройку из 3D-модели (OBJ, glTF, GLB): модель превратится в блоки.')}><I name="block" size={12} /> Из 3D-модели…</button></div>
        <div className="c4-ahint">Шаблоны уходят игрокам при «Собрать» (config/kokkstory/studio/structures).</div>
      </div>
    </div>
  );
}

const SHAPES = [['sphere', 'Шар'], ['cube', 'Куб'], ['cyl', 'Цилиндр']];
const MODES = [['place', 'Ставить', 'Ставит блок «Чем» в пустые места (воздух, трава).'], ['replace', 'Заменять', 'Меняет существующие блоки на «Чем» (не трогая воздух). С маской — только блоки маски.'], ['erase', 'Стирать', 'Ставит воздух.']];
function BrushPanel() {
  const core = useStudio();
  const bc = useBuild();
  const { hp } = core;
  const [b, setB] = useState(() => lsGet('brush', { shape: 'sphere', size: 5, mode: 'place', mask: '' }));
  const set = (p) => { const n = { ...b, ...p }; setB(n); lsSet('brush', n); if (core.brushOn) send(n, true, false); };
  // {t:'brush', shape, size (диаметр), block, mode, mask?, activate?} — игра включает Камеру Студии с кистью; выключаем инструментом «Выбор»
  const send = (n, on, activate) => {
    if (!on) { call('studio:send', { t: 'tool', tool: 'select' }).catch(() => {}); return; }
    const msg = { t: 'brush', shape: n.shape, size: n.size, block: bc.block, mode: n.mode };
    if (n.mask) msg.mask = n.mask;
    if (activate === false) msg.activate = false;
    call('studio:send', msg).catch((e) => core.toast(e.message, 'error'));
  };
  useEffect(() => { if (core.brushOn) send(b, true, false); }, [bc.block]); // eslint-disable-line
  useEffect(() => { if (core.brushState && core.brushState.size && core.brushState.size !== b.size) setB((x) => ({ ...x, size: core.brushState.size })); }, [core.brushState]); // eslint-disable-line
  const toggle = () => {
    if (!core.link.connected) { core.toast('Нет связи с игрой', 'warn'); return; }
    const on = !core.brushOn;
    core.setBrushOn(on);
    send(b, on, true);
  };
  return (
    <div className="bd-body">
      <div className="bd-col" style={{ width: 330 }}>
        <div className="bd-h">Кисть <span className="dim">{core.brushOn ? 'рисует в игре' : 'выключена'}</span></div>
        <div className="bd-seg">{SHAPES.map(([v, l]) => <button key={v} className={b.shape === v ? 'on' : ''} onClick={() => set({ shape: v })} {...hp('Форма кисти: ' + l.toLowerCase() + '.')}>{l}</button>)}</div>
        <ARow label="Диаметр" hint="Размер кисти в блоках (1–64). В игре: Ctrl+колесо."><Num value={b.size} int min={1} max={64} onChange={(v) => set({ size: v })} unit="бл" /></ARow>
        <div className="bd-seg">{MODES.map(([v, l, h]) => <button key={v} className={b.mode === v ? 'on' : ''} onClick={() => set({ mode: v })} {...hp(l + ': ' + h)}>{l}</button>)}</div>
        <div className="c4-btnrow"><button className={'c4-btn' + (core.brushOn ? ' danger' : ' prim')} disabled={!core.link.connected} onClick={toggle} {...hp(core.brushOn ? 'Выключить кисть в игре.' : 'Включить кисть: в Камере Студии ЛКМ рисует, Ctrl+колесо — размер. Каждый мазок можно отменить.')}><I name="brush" size={13} /> {core.brushOn ? 'Выключить кисть' : 'Рисовать в игре'}</button></div>
      </div>
      <div className="bd-col" style={{ width: 330 }}>
        <div className="bd-h">Блоки кисти</div>
        <ARow label="Чем" hint="Каким блоком рисовать — щелчок в палитре слева или перетащи сюда."><BlockField value={bc.block} onChange={bc.setBlock} /></ARow>
        <ARow label="Маска" hint="Необязательно: кисть трогает только подходящие блоки — id, #тег, !… (кроме). Например, рисовать мхом только по камню. Пусто — всё."><BlockField value={b.mask} onChange={(v) => set({ mask: v })} placeholder="без маски" /></ARow>
      </div>
      <div className="bd-col grow">
        <div className="bd-h">Как рисовать</div>
        <div className="c4-ahint" style={{ lineHeight: 1.6 }}>1. Включи кисть — игра перейдёт в Камеру Студии (там же клавиша <b>N</b>).<br />2. Контур кисти под прицелом: зелёный — ставит, жёлтый — заменяет, красный — стирает. <b>ЛКМ</b> — мазок.<br />3. <b>Ctrl+колесо</b> — размер, <b>Esc</b> — выйти.<br />Каждый мазок (от нажатия до отпускания) — одна отмена в «Отменить в мире».</div>
      </div>
    </div>
  );
}

// ---------- библиотека построек ----------
export function StructLibrary() {
  const core = useStudio();
  const bc = useBuild();
  const { hp } = core;
  const [pngs, setPngs] = useState({});
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [rename, setRename] = useState(null);
  const list = core.structures;
  useEffect(() => {
    let alive = true;
    for (const s of list) if (s.png && pngs[s.id] === undefined) call('studio:structPng', s.id).then((u) => alive && setPngs((p) => ({ ...p, [s.id]: u || null }))).catch(() => {});
    return () => { alive = false; };
  }, [list]); // eslint-disable-line
  const shown = list.filter((s) => !q.trim() || (s.name + ' ' + s.id).toLowerCase().includes(q.trim().toLowerCase()));
  const at = async () => { if (core.link.connected) { try { const p = selToPos(await core.api.getSel(), true); if (p) return [p[0], p[1] + 1, p[2]]; } catch (_) {} } return [0, 64, 0]; };
  const toScene = async (s) => {
    if (!core.scene) { core.toast('Открой сцену — постройка встанет в неё объектом', 'warn'); return; }
    const pos = await at();
    let id = null;
    core.edit((sc) => { const r = addStructure(sc, s, pos); id = r.id; return r.scene; });
    if (id) core.setSel({ objs: [id] });
  };
  const ghost = async (s) => { const pos = await at(); call('studio:ghost', { id: 'lib_' + s.id, placements: [{ pos, rot: 0, structure: s.id, anchor: 'center' }] }).then(() => core.toast('Призрак «' + s.name + '» в игре у прицела', 'ok', 2000)).catch((e) => core.toast(e.message, 'error')); };
  const bake = async (s) => {
    const pos = await at();
    try { await call('studio:send', { t: 'structure', id: s.id, pos, rot: 0, anchor: 'center' }); call('studio:ghost', { id: 'lib_' + s.id, placements: [] }).catch(() => {}); core.toast('Ставлю «' + s.name + '» в мир (можно отменить)', 'ok', 2500); } catch (e) { core.toast(e.message, 'error'); }
  };
  const cur = list.find((x) => x.id === sel);
  return (
    <div className="bd-body" style={{ flexDirection: 'column', gap: 4 }}>
      <div className="c4-btnrow" style={{ padding: '0 2px' }}>
        <input className="c4-search" style={{ width: 160 }} placeholder="Найти постройку…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button className="c4-btn sm" onClick={() => core.reloadAny('structures')} {...hp('Перечитать папку studio/structures.')}><I name="loop" size={12} /> Обновить</button>
        <button className="c4-btn sm" onClick={() => bc.setVox(true)} {...hp('Новая постройка из 3D-модели (OBJ, glTF, GLB).')}><I name="block" size={12} /> Из 3D-модели…</button>
        <button className="c4-btn sm" onClick={() => call('shell:openPath', 'studio/structures')} {...hp('Открыть папку с шаблонами (.nbt). Туда можно класть и свои шаблоны из других программ.')}><I name="folder" size={12} /> Папка</button>
        <div className="grow" />
        {cur && <>
          <span className="dim">{cur.name} · {(cur.size || []).join('×')} · {cur.blocks != null ? cur.blocks + ' бл.' : ''}</span>
          <button className="c4-btn sm prim" onClick={() => toScene(cur)} {...hp('Поставить объектом «Постройка» в открытую сцену (у прицела в игре). Дальше — двигай, крути, призрак, запекание.')}><I name="plus" size={12} /> В сцену</button>
          <button className="c4-btn sm" disabled={!core.link.connected} onClick={() => ghost(cur)} {...hp('Показать призраком в игре у прицела.')}><I name="ghost" size={12} /> Призрак</button>
          <button className="c4-btn sm" disabled={!core.link.connected} onClick={() => bake(cur)} {...hp('Поставить в мир у прицела по-настоящему (можно отменить).')}><I name="bake" size={12} /> В мир</button>
          <button className="c4-btn sm" onClick={() => setRename({ id: cur.id, name: cur.name })} title="Переименовать"><I name="gear" size={12} /></button>
          <button className="c4-btn sm danger" onClick={async () => { if (!window.confirm('Удалить постройку «' + cur.name + '»? (файлы уйдут в studio/.trash)')) return; await call('studio:structDelete', cur.id).catch((e) => core.toast(e.message, 'error')); setSel(null); core.reloadAny('structures'); }} title="Удалить"><I name="trash" size={12} /></button>
        </>}
      </div>
      {rename && (
        <form className="c4-btnrow" onSubmit={async (e) => { e.preventDefault(); await call('studio:structRename', rename).catch((er) => core.toast(er.message, 'error')); setRename(null); core.reloadAny('structures'); }}>
          <input className="c4-text" autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} style={{ maxWidth: 260 }} />
          <button className="c4-btn sm prim">OK</button><button type="button" className="c4-btn sm" onClick={() => setRename(null)}>Отмена</button>
        </form>
      )}
      <div className="bd-lib">
        {shown.map((s) => (
          <div key={s.id} className={'bd-card' + (sel === s.id ? ' on' : '')} onClick={() => setSel(s.id)} onDoubleClick={() => toScene(s)} draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/c4struct', s.id); }}
            onMouseEnter={() => core.setHint((s.name || s.id) + ' — ' + (s.size ? s.size.join('×') + ', ' : '') + (s.blocks != null ? s.blocks + ' блоков. ' : '') + 'Двойной щелчок — в сцену. ' + (s.source === 'voxel' ? 'Из 3D-модели.' : s.source === 'capture' ? 'Снято в игре.' : ''))}>
            <div className="th">{pngs[s.id] || topUrl(s) ? <img src={pngs[s.id] || topUrl(s)} alt="" draggable={false} className={pngs[s.id] ? '' : 'px'} /> : <I name="template" size={30} color="#666" />}</div>
            <div className="nm">{s.name || s.id}</div>
            <div className="sz dim">{(s.size || []).join('×') || s.id}</div>
          </div>
        ))}
        {!shown.length && <div className="c4-tree-empty" style={{ width: '100%' }}>{list.length ? 'Ничего не нашлось.' : 'Библиотека пуста. Выдели область в игре и «Сохранить шаблон» — или сделай постройку из 3D-модели.'}</div>}
      </div>
    </div>
  );
}

// объект «Постройка» в сцене
export function addStructure(scene, s, pos) {
  const ids = new Set((scene.objects || []).map((o) => o.id));
  let n = 1;
  while (ids.has('str' + n)) n++;
  const id = 'str' + n;
  const names = new Set((scene.objects || []).map((o) => o.name));
  let name = s.name || s.id;
  for (let k = 2; names.has(name); k++) name = (s.name || s.id) + ' ' + k;
  const o = { id, type: 'structure', name, parent: null, enabled: true, visible: true, anim: {}, props: { pos: pos.slice(), structure: s.id, rot: 0, mirror: false, preview: true, appearAt: null, removeAtEnd: true } };
  return { scene: { ...scene, objects: [...(scene.objects || []), o] }, id };
}

// вид сверху из описания постройки (игра пишет preview:{ w, d, y:[высота], rgb:"rrggbb…" по строкам z, внутри по x}) → картинка
const topCache = new Map();
export function topUrl(meta) {
  const p = meta && meta.preview;
  if (!p || !(p.w > 0) || !(p.d > 0) || typeof p.rgb !== 'string' || p.rgb.length < p.w * p.d * 6) return null;
  const key = meta.id + ':' + (meta.mtime || '') + ':' + p.rgb.length;
  if (topCache.has(key)) return topCache.get(key);
  let url = null;
  try {
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.d;
    const g = c.getContext('2d');
    const img = g.createImageData(p.w, p.d);
    const ys = Array.isArray(p.y) ? p.y : null;
    const lo = ys ? Math.min(...ys.filter((v) => v >= 0)) : 0, hi = ys ? Math.max(...ys) : 1;
    for (let i = 0; i < p.w * p.d; i++) {
      const top = Array.isArray(p.top) ? p.top[i] : 0;
      const h = p.rgb.substr(i * 6, 6);
      const sh = ys && hi > lo ? 0.7 + 0.3 * ((ys[i] - lo) / (hi - lo)) : 1;
      img.data[i * 4] = parseInt(h.slice(0, 2), 16) * sh; img.data[i * 4 + 1] = parseInt(h.slice(2, 4), 16) * sh; img.data[i * 4 + 2] = parseInt(h.slice(4, 6), 16) * sh;
      img.data[i * 4 + 3] = top === -1 ? 0 : 255;
    }
    g.putImageData(img, 0, 0);
    url = c.toDataURL('image/png');
  } catch (_) {}
  topCache.set(key, url);
  return url;
}
