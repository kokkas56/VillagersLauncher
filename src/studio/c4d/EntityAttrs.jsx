// Атрибуты сущности мира (фаза 5): вкладки «Основное», «Свойства», «Выходы» (таблица как в Valve Hammer —
// «Когда → Кому → Что сделать → Параметр → Задержка → Один раз», в «Что сделать» только входы, которые умеет цель)
// и «Входы» (кто вызывает эту сущность, только чтение).
import React, { useMemo, useState } from 'react';
import { useStudio } from './core.jsx';
import I from './icons.jsx';
import { ARow, Num, Sec, Check, Text, Select, Issues } from './Attributes.jsx';
import {
  ENT_TYPES, TARGET_KINDS, VALLEY_NAMES, outputsOf, inputsForTarget, parseTarget, targetLabel, outputLabel, inputLabel,
  newOutput, incomingOf, validateOutputs, parsePos, entInputs, outBase
} from '../entities.js';
import { ERR } from '../validate.js';
import { selToPos } from '../fields.jsx';
import { FxFields, SCHEME_FX, fxPreview } from './Cine.jsx'; // фаза 6: сущность «Эффект», переход у «Телепорта»
import { FX_LIB } from '../fxlib.js';

const r2 = (n) => Math.round(n * 100) / 100;
export function EntIcon({ type, size = 15 }) {
  const d = ENT_TYPES[type] || {};
  return <I name={d.icon || 'info'} size={size} color={d.color || '#ccc'} sw={1.8} />;
}

export default function EntityAttrs({ id }) {
  const core = useStudio();
  const e = core.ents.find((x) => x.id === id);
  const [tab, setTab] = useState('basic');
  if (!e) return <div className="c4-tree-empty">Сущность удалена.</div>;
  const def = ENT_TYPES[e.type] || { label: e.type, outputs: [], inputs: [] };
  const inc = incomingOf(core.ents, e.id);
  const issues = core.entIssues.filter((x) => x.ent === e.id);
  const outErr = issues.filter((x) => x.out != null && x.sev === ERR).length;
  const tabs = [['basic', 'Основное'], ['props', 'Свойства'], ['out', 'Выходы'], ['in', 'Входы']];
  return (
    <>
      <div className="c4-ahead" {...core.hp(def.hint)}>
        <EntIcon type={e.type} size={17} />
        <div className="grow"><b>{def.label} [{e.name}]</b><div className="dim">id: <span className="mono">{e.id}</span> · сущность мира</div></div>
        <button className="c4-ib" disabled={!core.link.connected} onClick={() => core.send({ t: 'frame', id: e.id, ids: [e.id], pos: e.pos, dist: 8 })} {...core.hp('Показать в игре (H): Камера Студии подлетит к сущности.')}><I name="frame" size={14} /></button>
        <button className="c4-ib" onClick={() => core.dupEnt(e.id)} {...core.hp('Клонировать (Ctrl+D): копия рядом, с теми же выходами.')}><I name="copy" size={14} /></button>
        <button className="c4-ib" onClick={() => core.removeEnt(e.id)} {...core.hp('Удалить сущность (Del).')}><I name="trash" size={14} /></button>
      </div>
      <div className="c4-atabs">
        {tabs.map(([t, l]) => (
          <button key={t} data-learn={t === 'out' ? 'outputs-tab' : undefined} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} {...core.hp(t === 'out' ? 'Выходы: что эта сущность запускает, когда с ней что-то случается («Вошёл → сцена → Запустить»).' : t === 'in' ? 'Входы: кто вызывает эту сущность (выходы других сущностей).' : t === 'props' ? 'Настройки этого вида сущности.' : 'Имя, место, поворот, заметка.')}>
            {l}{t === 'out' && (e.outputs || []).length ? <small style={{ color: outErr ? '#ff8f86' : undefined }}>{e.outputs.length}</small> : null}{t === 'in' && inc.length ? <small>{inc.length}</small> : null}
          </button>
        ))}
      </div>
      <Issues list={issues.filter((x) => x.out == null)} />
      {tab === 'basic' && <EntBasic e={e} def={def} />}
      {tab === 'props' && <EntProps e={e} />}
      {tab === 'out' && <OutputsTable e={e} />}
      {tab === 'in' && <InputsTable e={e} inc={inc} />}
    </>
  );
}

function useEnt(e) {
  const core = useStudio();
  const patch = (fn, key) => core.editEnts((l) => l.map((x) => (x.id === e.id ? (typeof fn === 'function' ? fn(x) : { ...x, ...fn }) : x)), key ? { key: e.id + ':' + key } : {});
  return {
    patch,
    setField: (k, v) => patch({ [k]: v }, 'f:' + k),
    setProp: (k, v) => patch((x) => ({ ...x, props: { ...x.props, [k]: v } }), 'p:' + k)
  };
}

function EntBasic({ e, def }) {
  const core = useStudio();
  const u = useEnt(e);
  const fromGame = async () => {
    try {
      const p = selToPos(await core.api.getSel(), true);
      if (!p) throw new Error('В игре прицел ни на что не наведён');
      u.patch({ pos: def.block ? p : [p[0] + 0.5, p[1] + 1, p[2] + 0.5] }, 'pos');
    } catch (er) { core.toast(er.message, 'error'); }
  };
  const turnable = ['player_start', 'actor', 'teleport', 'scene_point'].includes(e.type);
  return (
    <Sec title="Основное">
      <ARow label="Имя" hint="Как сущность называется в дереве, в игре над значком и в выпадающих списках выходов."><Text value={e.name} onChange={(v) => u.setField('name', v)} /></ARow>
      <ARow label="Включена" hint="Выключенная сущность не работает в игре (её выходы молчат)."><Check value={e.enabled !== false} onChange={(v) => u.setField('enabled', v ? undefined : false)} /></ARow>
      <ARow label="Позиция" hint={def.block ? 'Координаты блока (кнопки, рычага, плиты) в мире — целые числа.' : 'Где сущность в мире: X восток(+)/запад(−), Y высота, Z юг(+)/север(−).'}>
        {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={e.pos[i]} step={def.block ? 1 : 0.5} int={!!def.block} onChange={(n) => u.patch((x) => { const p = x.pos.slice(); p[i] = n; return { ...x, pos: p }; }, 'pos' + i)} onScrubStart={core.entGesture} />)}
      </ARow>
      {turnable && <ARow label="Поворот" hint="Куда смотрит (yaw): 0 — юг, 90 — запад, 180 — север, −90 — восток."><Num value={(e.rot || [0])[0]} step={15} unit="°" onChange={(n) => u.patch((x) => ({ ...x, rot: [n, 0, 0] }), 'rot')} /></ARow>}
      <div className="c4-btnrow">
        <button className="c4-btn sm" disabled={!core.link.connected} onClick={fromGame} {...core.hp(def.block ? 'Взять блок, на который смотришь в игре (саму кнопку, рычаг или плиту).' : 'Поставить на блок, на который смотришь в игре.')}><I name="look" size={12} /> Взять из игры</button>
      </div>
      <ARow label="Заметка" hint="Любой комментарий для себя."><Text area value={e.note || ''} onChange={(v) => u.setField('note', v || undefined)} /></ARow>
      <div className="c4-ahint">{def.hint}</div>
    </Sec>
  );
}

function EntProps({ e }) {
  const core = useStudio();
  const u = useEnt(e);
  const p = e.props || {};
  const num = (k, label, hint, opt = {}) => <ARow label={label} hint={hint}><Num value={p[k]} step={opt.step || 1} min={opt.min} max={opt.max} int={opt.int} unit={opt.unit} onChange={(v) => u.setProp(k, v)} /></ARow>;
  const vec = (k, label, hint, step = 1) => (
    <ARow label={label} hint={hint}>{[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} value={(p[k] || [0, 0, 0])[i]} step={step} onChange={(n) => { const c = (p[k] || [0, 0, 0]).slice(); c[i] = n; u.setProp(k, c); }} />)}</ARow>
  );
  const sel = (k, label, hint, options) => <ARow label={label} hint={hint}><Select value={p[k] == null ? '' : p[k]} options={options} onChange={(v) => u.setProp(k, v)} /></ARow>;
  const chk = (k, label, hint) => <ARow label={label} hint={hint}><Check value={!!p[k]} onChange={(v) => u.setProp(k, v)} /></ARow>;
  const txt = (k, label, hint, opt = {}) => <ARow label={label} hint={hint}><Text mono={opt.mono} list={opt.list} area={opt.area} value={p[k]} placeholder={opt.ph} onChange={(v) => u.setProp(k, v)} /></ARow>;
  const docOpts = (l, none) => [['', none], ...l.map((x) => [x.id, (x.title || x.id) + ' · ' + x.id])];
  let body = null;
  switch (e.type) {
    case 'player_start': body = <div className="c4-ahint">Игрок появится здесь, когда нажмёшь ▶ Играть (F5), и будет смотреть по стрелке (поворот — во вкладке «Основное»). «▶ с камеры» (Shift+F5) ставит игрока туда, где сейчас Камера Студии.</div>; break;
    case 'trigger_zone': body = <>
      {vec('size', 'Размер', 'Ширина (X), высота (Y), глубина (Z) коробки в блоках. Позиция — центр низа коробки.')}
      {sel('filter', 'Кто срабатывает', 'Кого замечает зона.', [['player', 'Игрок'], ['mob', 'Любой моб'], ['villager', 'Житель'], ['any', 'Кто угодно']])}
      {num('every', 'Проверять, тиков', 'Как часто зона смотрит, кто внутри (5 — четыре раза в секунду).', { min: 1, int: true, unit: 'т' })}
      {num('insideEvery', 'Внутри: каждые, тиков', 'Для выхода «Внутри»: как часто срабатывать, пока кто-то внутри (20 тиков = 1 с).', { min: 1, int: true, unit: 'т' })}
      <div className="c4-ahint">Выключить зону с начала — галочка «Включена» во вкладке «Основное»; включить потом — входом «Включить».</div>
    </>; break;
    case 'actor': body = <>
      {sel('kind', 'Кто это', 'Житель долины по номеру, любое существо или персонаж проекта.', [['valley', 'Житель долины'], ['entity', 'Существо'], ['story', 'Персонаж проекта']])}
      {p.kind === 'valley' && <ARow label="Житель" hint="Житель долины (номер who в моде Villagers)."><Select value={p.who || 0} options={VALLEY_NAMES.map((n, i) => [i, i + ' — ' + n])} onChange={(v) => u.setProp('who', Number(v))} /></ARow>}
      {p.kind === 'entity' && txt('type', 'Существо', 'id существа: minecraft:villager, minecraft:cat…', { mono: true, ph: 'minecraft:villager' })}
      {p.kind === 'story' && sel('actor', 'Персонаж', 'Персонаж из списка актёров проекта.', [['', '— выбери —'], ...(core.project.actors || []).map((a) => [a.id, a.name || a.id])])}
      {txt('name', 'Имя над головой', 'Необязательно: подпись над актёром в игре.')}
      <ARow label="Стоит с начала" hint="Выключи — актёр появится только по входу «Появиться»."><Check value={p.spawn !== false} onChange={(v) => u.setProp('spawn', v)} /></ARow>
      {chk('ai', 'Свой ИИ', 'Включено — актёр живёт своей жизнью (ходит, работает); выключено — стоит и ждёт команд.')}
      {num('speed', 'Скорость', '0.6 — шагом, 1 — бегом (для «Идти к»).', { step: 0.05, min: 0.1, max: 3 })}
      {sel('dialog', 'Диалог по клику', 'Какой диалог открыть входом «Начать диалог» без параметра.', docOpts(core.dialogs, '— нет —'))}
    </>; break;
    case 'button': case 'lever': case 'pressure_plate': body = <div className="c4-ahint">Позиция этой сущности — блок {e.type === 'button' ? 'кнопки' : e.type === 'lever' ? 'рычага' : 'нажимной плиты'} в мире. Поставь его в игре, наведи прицел и нажми «Взять из игры» во вкладке «Основное». Выходы сработают, когда игрок его тронет.</div>; break;
    case 'scene_point': body = <>
      {sel('scene', 'Сцена', 'Какую катсцену запускает эта точка (входом «Запустить»).', docOpts(core.list, '— выбери сцену —'))}
      {sel('who', 'Кому показать', 'Тому, кто начал цепочку, всем или всем рядом.', [['activator', 'Тому, кто вызвал'], ['all', 'Всем'], ['near', 'Всем рядом']])}
      {p.who === 'near' && num('radius', 'Радиус', 'В блоках.', { min: 1, int: true })}
      {p.scene && <div className="c4-btnrow"><button className="c4-btn sm" onClick={() => core.openSceneTab && core.openSceneTab(p.scene)} {...core.hp('Открыть эту сцену на таймлайне.')}><I name="film" size={12} /> Открыть сцену</button></div>}
    </>; break;
    case 'timer': body = <>
      {num('interval', 'Через, секунд', 'Сколько ждать до «Сработал».', { min: 0.05, step: 0.5, unit: 'с' })}
      {chk('repeat', 'Повторять', 'Срабатывать снова и снова, пока не остановят.')}
      {chk('autostart', 'Сам с начала', 'Запускаться сам, когда началась игра (иначе — входом «Старт»).')}
    </>; break;
    case 'relay': body = <div className="c4-ahint">Выключенное реле (галочка «Включена» или вход «Выключить») не передаёт «Сработать» дальше.</div>; break;
    case 'counter': body = <>{num('min', 'Минимум', '')}{num('max', 'Максимум', 'Когда дойдёт сюда — выход «Достиг максимума».')}{num('start', 'Начало', 'С какого числа начинать.')}</>; break;
    case 'teleport': body = <>
      {vec('dest', 'Куда', 'Точка назначения: x y z.', 0.5)}
      <div className="c4-btnrow"><button className="c4-btn sm" disabled={!core.link.connected} onClick={async () => { try { const pp = selToPos(await core.api.getSel()); if (!pp) throw new Error('В игре прицел ни на что не наведён'); u.setProp('dest', pp); } catch (er) { core.toast(er.message, 'error'); } }} {...core.hp('Точка назначения — блок, на который смотришь в игре.')}><I name="look" size={12} /> Куда — из игры</button></div>
      {sel('dim', 'Измерение', 'В каком измерении точка назначения.', [['minecraft:overworld', 'Обычный мир'], ['minecraft:the_nether', 'Незер'], ['minecraft:the_end', 'Край']])}
      {num('yaw', 'Смотреть', 'Куда смотрит игрок после переноса (yaw).', { step: 15, unit: '°' })}
      {num('pitch', 'Наклон взгляда', '0 — прямо, + — вниз.', { step: 5, unit: '°' })}
      {sel('scene', p.transition || p.video ? 'Сцена перехода' : 'Сцена после переноса', p.transition || p.video ? 'Если видео у игрока нет — эта сцена играет вживую, потом перенос за экраном «загрузка».' : 'Катсцена сразу после переноса (необязательно).', docOpts(core.list, '— нет —'))}
      <div className="cine-sep" style={{ margin: '6px 0 2px' }}>Переход</div>
      {chk('transition', 'Как переход', 'Включи — перенос идёт «за кадром»: игрок видит видео (или сцену, или экран «загрузка»), пока место назначения грузится; картинка проявляется, когда мир готов.')}
      {(p.transition || p.video) && sel('video', 'Видео', 'Видео какой сцены играть, пока грузится место (у кого оно есть). Записывается в атрибутах сцены.', docOpts(core.list, '— без видео —'))}
      {(p.transition || p.video) && chk('loadWhile', 'Грузить во время', 'Переносить сразу, пока идёт видео (мир грузится за кадром). Выключи — перенос после видео.')}
      {(p.transition || p.video) && num('maxWait', 'Ждать мир, с', 'Сколько ждать загрузку места, прежде чем показать как есть.', { min: 1, max: 120, step: 1, unit: 'с' })}
    </>; break;
    case 'fx': body = <>
      <ARow label="Эффект" hint="Эффект из библиотеки (экран, мир, звук). Его поля — ниже."><Select value={p.fx || ''} options={SCHEME_FX} onChange={(v) => u.patch((x) => ({ ...x, props: { ...JSON.parse(JSON.stringify((FX_LIB[v] || {}).def || {})), pos: undefined, fx: v, to: (x.props || {}).to, radius: (x.props || {}).radius } }))} /></ARow>
      <FxFields a={p} set={(np) => { for (const k of Object.keys(np)) if (np[k] !== p[k]) u.setProp(k, np[k]); }} refs={{ structures: core.structures, api: core.api }} hp={core.hp} api={core.api} hide={['pos']} />
      <div className="c4-ahint">Место эффекта — позиция самой сущности («Основное»).</div>
      {sel('to', 'Кому показать', 'Экранные эффекты и частицы: тому, кто вызвал, или всем рядом.', [['near', 'Всем рядом'], ['activator', 'Тому, кто вызвал']])}
      {p.to !== 'activator' && num('radius', 'Радиус', 'В блоках.', { min: 1, int: true })}
      <div className="c4-btnrow"><button className="c4-btn sm" disabled={!core.link.connected || !FX_LIB[p.fx]} onClick={() => fxPreview(core, FX_LIB[p.fx].track, { t: 0, do: p.fx, ...p, pos: e.pos })} {...core.hp('Показать эффект в игре в точке объекта.')}><I name="play" size={12} /> Показать в игре</button></div>
    </>; break;
    case 'sound': body = <>{txt('sound', 'Звук', 'id звука, например minecraft:block.bell.use.', { mono: true, list: 'sl-sounds' })}{num('vol', 'Громкость', '1 — обычно.', { step: 0.05, min: 0 })}{num('pitch', 'Высота', '0.5 — низко, 2 — высоко.', { step: 0.05, min: 0.5, max: 2 })}{num('radius', 'Слышно, блоков', '', { min: 1, int: true })}{num('every', 'Повтор, секунд', '0 — один раз; иначе — снова каждые N секунд до «Остановить».', { min: 0, step: 0.5 })}</>; break;
    case 'light': body = <>{num('level', 'Яркость', '0–15. Свет горит, пока объект включён (галочка «Включена» или входы «Включить/Выключить»).', { min: 0, max: 15, int: true })}</>; break;
    case 'particles': body = <>{txt('particle', 'Частицы', 'id частиц: minecraft:flame, minecraft:heart…', { mono: true, list: 'sl-particles' })}{num('count', 'Сколько', '', { min: 1, int: true })}{vec('spread', 'Разброс', 'На сколько блоков разлетаются по X, Y, Z.', 0.25)}{num('speed', 'Скорость', '', { step: 0.01, min: 0 })}{num('every', 'Каждые, тиков', 'Как часто сыпать, пока объект включён (0 — только «Вспышка»).', { min: 0, int: true, unit: 'т' })}</>; break;
    case 'message': body = <>{txt('text', 'Текст', 'Можно {player} и {var:имя}.', { area: true })}{p.style === 'title' && txt('sub', 'Подзаголовок', 'Мелкая строка под титром.')}{sel('style', 'Вид', 'Титр — крупно по центру; над хотбаром — строка внизу; чат — сообщение в чат.', [['title', 'Титр'], ['actionbar', 'Над хотбаром'], ['chat', 'Чат']])}{sel('to', 'Кому', '', [['activator', 'Тому, кто вызвал'], ['all', 'Всем'], ['near', 'Всем рядом']])}{p.to === 'near' && num('radius', 'Радиус', '', { min: 1, int: true })}{p.style === 'title' && num('ticks', 'Держать, тиков', '', { min: 1, int: true, unit: 'т' })}</>; break;
    case 'structure': body = <>{sel('structure', 'Постройка', 'Из библиотеки «Строительство».', [['', '— выбери —'], ...core.structures.map((x) => [x.id, x.name || x.id])])}{sel('rot', 'Поворот', '', [0, 90, 180, 270].map((r) => [r, r + '°']))}{sel('mirror', 'Отражение', '', [[false, 'нет'], ['x', 'по X'], ['z', 'по Z']])}</>; break;
    case 'quest_giver': body = sel('quest', 'Задание', 'Какое задание начинает вход «Начать задание».', docOpts(core.quests, '— выбери задание —')); break;
    case 'var_set': body = <>{sel('name', 'Переменная', 'Переменная проекта (вкладка «Переменные»).', [['', '— выбери —'], ...(core.project.vars || []).map((v) => [v.name, v.name + (v.note ? ' — ' + v.note : '')])])}{sel('op', 'Как', 'Записать значение или прибавить его.', [['set', 'Записать'], ['add', 'Прибавить']])}{txt('value', 'Значение', 'Что записать: true/false, число или текст.')}</>; break;
    default: body = <div className="c4-ahint">Свойств нет.</div>;
  }
  return <Sec title={'Свойства: ' + (ENT_TYPES[e.type] || {}).label}>{body}</Sec>;
}

// ---------- «Выходы»: таблица как в Hammer ----------
function targetOptions(core, self) {
  const groups = [];
  groups.push(['Сущности мира', core.ents.filter((x) => x.id !== self.id).map((x) => [x.id, x.name + ' · ' + ((ENT_TYPES[x.type] || {}).label || x.type)])]);
  groups.push(['', [[self.id, 'Сам себе («' + self.name + '»)'], ['player', 'Игрок (кто начал цепочку)']]]);
  groups.push(['Сцены', core.list.map((x) => ['scene:' + x.id, x.title || x.id])]);
  groups.push(['Задания', core.quests.map((x) => ['quest:' + x.id, x.title || x.id])]);
  groups.push(['Схемы', core.schemes.map((x) => ['scheme:' + x.id, x.title || x.id])]);
  groups.push(['Диалоги', core.dialogs.map((x) => ['dialog:' + x.id, x.title || x.id])]);
  const sig = new Set();
  for (const sc of core.schemes) { for (const x of sc.listened || []) sig.add(x); for (const x of sc.raised || []) sig.add(x); }
  groups.push(['Сигналы схем', [...sig].map((x) => ['signal:' + x, 'Сигнал «' + x + '»'])]);
  return groups;
}
function GSelect({ value, onChange, groups, placeholder, bad, hint }) {
  const { hp } = useStudio();
  const known = groups.some(([, opts]) => opts.some(([v]) => String(v) === String(value)));
  return (
    <select className={'c4-text' + (bad ? ' bad' : '')} value={value == null ? '' : value} onChange={(ev) => onChange(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} {...hp(hint)}>
      <option value="">{placeholder || '—'}</option>
      {!known && value ? <option value={value}>{value} (нет!)</option> : null}
      {groups.map(([g, opts], i) => (opts.length ? (g ? <optgroup key={i} label={g}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup> : opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)) : null))}
    </select>
  );
}

function OutputsTable({ e }) {
  const core = useStudio();
  const { hp } = core;
  const u = useEnt(e);
  const outs = e.outputs || [];
  const [rowSel, setRowSel] = useState(null);
  const ctx = useMemo(() => ({ scenes: core.list.map((x) => x.id), quests: core.quests.map((x) => x.id), schemes: core.schemes.map((x) => x.id), dialogs: core.dialogs.map((x) => x.id) }), [core.list, core.quests, core.schemes, core.dialogs]);
  const rowIss = useMemo(() => { const m = {}; validateOutputs(e, core.ents, ctx, (sev, msg, i) => { (m[i] = m[i] || []).push({ sev, msg }); }); return m; }, [e, core.ents, ctx]);
  const setOut = (i, patch, key) => u.patch((x) => ({ ...x, outputs: (x.outputs || []).map((o, j) => (j === i ? { ...o, ...patch } : o)) }), key ? 'o' + i + ':' + key : null);
  const add = () => { u.patch((x) => ({ ...x, outputs: [...(x.outputs || []), newOutput(x.type)] })); setRowSel(outs.length); };
  const del = (i) => { u.patch((x) => ({ ...x, outputs: (x.outputs || []).filter((_, j) => j !== i) })); setRowSel(null); };
  const dup = (i) => u.patch((x) => { const o = x.outputs || []; return { ...x, outputs: [...o.slice(0, i + 1), { ...o[i] }, ...o.slice(i + 1)] }; });
  const tg = targetOptions(core, e);
  const defOuts = outputsOf(e.type);
  const cur = rowSel != null ? outs[rowSel] : null;
  if (!defOuts.length) return <Sec title="Выходы"><div className="c4-ahint">У вида «{(ENT_TYPES[e.type] || {}).label}» нет выходов — его можно только вызывать (вкладка «Входы» покажет кто). Например, «Зона: Вошёл → {e.name} → …».</div></Sec>;
  return (
    <div className="c4-io">
      <div className="c4-ahint" style={{ margin: '6px 8px 4px' }}>Выход — «когда со мной это случится, сделай вот это». Как в Hammer: <b>Когда</b> → <b>Кому</b> → <b>Что сделать</b>. В «Что сделать» только то, что умеет выбранная цель.</div>
      <div className="c4-otab">
        <div className="c4-ohead">
          <span {...hp('Когда (выход): что должно случиться с этой сущностью.')}>Когда</span>
          <span {...hp('Кому (цель): объект мира, сцена, задание, схема, диалог, сигнал или игрок.')}>Кому</span>
          <span {...hp('Что сделать (вход цели): список зависит от выбранной цели.')}>Что сделать</span>
        </div>
        {outs.map((o, i) => {
          const iss = rowIss[i] || [];
          const bad = iss.some((x) => x.sev === ERR);
          const ins = inputsForTarget(o.target, core.ents, e);
          const inp = ins.find((x) => x[0] === o.input);
          const pd = inp && inp[3];
          const od = defOuts.find((x) => x[0] === outBase(o.on));
          const t = parseTarget(o.target);
          return (
            <div key={i} className={'c4-orow ' + (rowSel === i ? 'sel ' : '') + (bad ? 'bad' : iss.length ? 'warn' : '')} onClick={() => setRowSel(i)} title={iss.map((x) => x.msg).join('\n') || undefined}>
              <div className="l1">
                <span className="cell">
                  <select className="c4-text" value={outBase(o.on)} onChange={(ev) => setOut(i, { on: ev.target.value === 'mark' ? 'mark:' : ev.target.value })} onKeyDown={(ev) => ev.stopPropagation()} {...hp(od ? od[1] + ': ' + (od[2] || '') : 'Выбери, когда срабатывает.')}>
                    {!od && <option value={o.on}>{o.on || '—'}</option>}
                    {defOuts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {od && od[0] === 'mark' && <input className="c4-text mono" value={o.on.slice(5)} placeholder="метка" onChange={(ev) => setOut(i, { on: 'mark:' + ev.target.value.trim() }, 'onp')} onKeyDown={(ev) => ev.stopPropagation()} {...hp('Имя метки: событие «Метка» на дорожке «Мир» этой сцены.')} />}
                </span>
                <span className="arr">→</span>
                <span className="cell"><GSelect value={o.target} groups={tg} placeholder="— кому —" bad={bad && iss.some((x) => /цели|нет|«Кому»/.test(x.msg))} hint={o.target ? 'Цель: ' + targetLabel(o.target, core.ents, { scenes: core.list, quests: core.quests, schemes: core.schemes, dialogs: core.dialogs }) : 'Выбери, кому отправить.'} onChange={(v) => { const ok = inputsForTarget(v, core.ents, e).some((x) => x[0] === o.input); setOut(i, { target: v, ...(ok ? {} : { input: (inputsForTarget(v, core.ents, e)[0] || [''])[0], param: '' }) }); }} /></span>
                <span className="arr">→</span>
                <span className="cell">
                  <select className={'c4-text' + (o.input && !inp ? ' bad' : '')} value={o.input} disabled={!o.target} onChange={(ev) => setOut(i, { input: ev.target.value })} onKeyDown={(ev) => ev.stopPropagation()} {...hp(inp ? inp[1] + ': ' + (inp[2] || '') : !o.target ? 'Сначала выбери «Кому».' : 'Что сделать с целью. Здесь только то, что цель умеет.')}>
                    <option value="">{ins.length ? '— что —' : o.target ? 'цель ничего не умеет' : '—'}</option>
                    {o.input && !inp && <option value={o.input}>{o.input} (не умеет!)</option>}
                    {ins.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </span>
              </div>
              <div className="l2">
                <span className="lbl">Параметр</span>
                <span className="cell grow"><ParamField o={o} pd={pd} t={t} onChange={(v) => setOut(i, { param: v }, 'param')} /></span>
                <span className="lbl" {...hp('Задержка в секундах: 0 — сразу, 2.5 — через две с половиной секунды.')}>через</span>
                <input className="c4-text dly" value={o.delay == null ? 0 : o.delay} onChange={(ev) => { const n = Number(String(ev.target.value).replace(',', '.')); setOut(i, { delay: ev.target.value === '' ? 0 : isFinite(n) ? n : ev.target.value }, 'delay'); }} onKeyDown={(ev) => ev.stopPropagation()} {...hp('Задержка в секундах: 0 — сразу.')} />
                <span className="lbl">с</span>
                <label className="once" {...hp('Один раз: после первого срабатывания выход молчит (F5 сбрасывает).')}><Check value={!!o.once} onChange={(v) => setOut(i, { once: v })} /> 1×</label>
                <button className="c4-ib" title="Копия выхода" onClick={(ev) => { ev.stopPropagation(); dup(i); }}><I name="copy" size={11} /></button>
                <button className="c4-ib" title="Удалить выход" onClick={(ev) => { ev.stopPropagation(); del(i); }}><I name="close" size={11} /></button>
              </div>
            </div>
          );
        })}
        {!outs.length && <div className="c4-ahint">Выходов нет. «+ Выход» — например: Вошёл → Сцена «Встреча» → Запустить.</div>}
      </div>
      <div className="c4-btnrow">
        <button className="c4-btn sm prim" data-learn="out-add" onClick={add} {...hp('Добавить выход: когда → кому → что сделать.')}><I name="plus" size={12} /> Выход</button>
        {cur && <span className="dim" style={{ fontSize: 11 }}>{outputLabel(e.type, cur.on)} → {cur.target ? targetLabel(cur.target, core.ents, { scenes: core.list, quests: core.quests, schemes: core.schemes, dialogs: core.dialogs }) : '?'} → {cur.input ? inputLabel(cur.target, cur.input, core.ents, e) : '?'}{cur.param !== undefined && cur.param !== '' ? ' (' + cur.param + ')' : ''}{Number(cur.delay) > 0 ? ' через ' + cur.delay + ' с' : ''}{cur.once ? ', один раз' : ''}</span>}
      </div>
      {rowSel != null && (rowIss[rowSel] || []).map((x, k) => <div key={k} className={'c4-iss ' + (x.sev === ERR ? 'e' : 'w')}>{x.msg}</div>)}
    </div>
  );
}

function ParamField({ o, pd, t, onChange }) {
  const core = useStudio();
  const { hp } = core;
  if (!pd) return <input className="c4-text" disabled value="" placeholder="—" title="У этого входа нет параметра" />;
  const v = o.param == null ? '' : o.param;
  if (pd.kind === 'dialog') return <select className="c4-text" value={v} onChange={(ev) => onChange(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} {...hp(pd.hint || pd.label)}><option value="">— диалог —</option>{core.dialogs.map((d) => <option key={d.id} value={d.id}>{d.title || d.id}</option>)}</select>;
  const list = pd.kind === 'target' ? 'c4-ent-targets' : pd.kind === 'anim' ? 'c4-anims' : pd.kind === 'effect' ? 'c4-effects' : undefined;
  const fromGame = pd.kind === 'pos' || pd.kind === 'target';
  return (
    <span className="c4-pf">
      <input className={'c4-text' + (pd.kind === 'pos' || pd.kind === 'number' ? ' mono' : '')} list={list} value={v} placeholder={pd.label + (pd.required ? ' *' : '')}
        onChange={(ev) => { const s = ev.target.value; onChange(pd.kind === 'number' && s !== '' && isFinite(Number(s)) ? Number(s) : s); }} onKeyDown={(ev) => ev.stopPropagation()} {...hp(pd.label + (pd.hint ? ': ' + pd.hint : '') + (pd.required ? ' Обязательно.' : ''))} />
      {fromGame && <button className="c4-ib" disabled={!core.link.connected} title="Точка из игры (блок под прицелом)" onClick={async (ev) => { ev.stopPropagation(); try { const p = selToPos(await core.api.getSel()); if (!p) throw new Error('В игре прицел ни на что не наведён'); onChange(p.map(r2).join(' ')); } catch (er) { core.toast(er.message, 'error'); } }}><I name="look" size={11} /></button>}
      {pd.kind === 'pos' && v !== '' && !parsePos(v) ? <span className="c4-pf-bad">x y z</span> : null}
      {void t}
    </span>
  );
}

function InputsTable({ e, inc }) {
  const core = useStudio();
  const def = ENT_TYPES[e.type] || { inputs: [] };
  return (
    <div className="c4-io">
      <div className="c4-ahint" style={{ margin: '6px 8px 4px' }}>Кто вызывает «{e.name}» (только чтение — правится во «Выходах» вызывающего). Щёлкни строку — перейти к нему.</div>
      <table className="c4-iot">
        <thead><tr><th>От кого</th><th>Когда</th><th>Что сделать</th><th>Параметр</th><th style={{ width: 52 }}>Задер.</th></tr></thead>
        <tbody>
          {inc.map(({ from, i, out }) => (
            <tr key={from.id + ':' + i} className="link" onClick={() => core.setSelEnt(from.id)} {...core.hp('Перейти к «' + from.name + '» — там этот выход можно поправить.')}>
              <td><span className="c4-iotn"><EntIcon type={from.type} size={12} /> {from.name}</span></td>
              <td>{outputLabel(from.type, out.on)}</td>
              <td>{inputLabel(out.target, out.input, core.ents, from)}</td>
              <td className="mono">{out.param == null ? '' : String(out.param)}</td>
              <td>{Number(out.delay) > 0 ? out.delay + ' с' : '—'}{out.once ? ' · 1×' : ''}</td>
            </tr>
          ))}
          {!inc.length && <tr><td colSpan={5} className="empty">Эту сущность пока никто не вызывает.</td></tr>}
        </tbody>
      </table>
      <Sec title="Что умеет (входы вида)">
        {entInputs(e.type).length ? entInputs(e.type).map(([id, l, h, pd]) => <div key={id} className="c4-aitem" style={{ margin: '2px 8px' }} title={h}><I name="io" size={12} /><span className="grow">{l}</span><span className="dim mono" style={{ fontSize: 10.5 }}>{id}{pd ? ' (' + pd.label + ')' : ''}</span></div>) : <div className="c4-ahint">Входов нет — её нельзя вызвать, она только сообщает (выходы).</div>}
      </Sec>
    </div>
  );
}

// списки подсказок для параметров (жесты, эффекты, цели)
export function EntDatalists() {
  const core = useStudio();
  return (
    <>
      <datalist id="c4-ent-targets">{['player', ...core.ents.map((x) => x.id)].map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="c4-anims">{['wave', 'greet', 'sit', 'point', 'kneel', 'examine', 'offer', 'hammer', 'garden', 'stir', 'carry', 'rest', 'eureka', 'work', 'arms_crossed'].map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="c4-effects">{['minecraft:speed 10 1', 'minecraft:night_vision 30 0', 'minecraft:slowness 5 1', 'minecraft:blindness 3 0', 'minecraft:regeneration 10 1'].map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sl-particles">{['minecraft:flame', 'minecraft:campfire_cosy_smoke', 'minecraft:heart', 'minecraft:happy_villager', 'minecraft:end_rod', 'minecraft:enchant', 'minecraft:portal', 'minecraft:cloud'].map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}
export { TARGET_KINDS };
