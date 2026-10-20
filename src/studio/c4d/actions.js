// Команды окна Студии (меню, клавиши, панели вызывают одно и то же).
import { call } from '../../lib/api.js';
import { objById, isAnimated, OBJ_LABEL, clonerOutput, structurePlacements } from '../scene3d.js';
import { CLONER_MODE_LABEL, EFFECTOR_LABEL, CLONER_MODES, EFFECTOR_KINDS } from '../mograph.js';
import { selToPos } from '../fields.jsx';
import { uniqueId } from '../model.js';
import { addObject, addActorObject, removeObjects, cloneObjects, groupObjects, intoCloner, patchObj, stageCutAt, deleteKeysAt, setKeyField } from './ops.js';

export const viewCenter = { pos: [0, 64, 0] }; // центр схемы сверху — туда встают новые объекты без игры

export const TYPE_HINT = {
  camera: 'Камера: откуда смотрит сцена. Двигай и крути её, ставь ключи (◇) — между ключами она пролетает сама. Какая камера снимает в какой момент — решает дорожка «Монтаж».',
  actor: 'Актёр: житель, сущность или игрок. Где он стоит в начале — тут; что делает — на его дорожке событий внизу.',
  light: 'Свет: невидимые блоки света (light) в мире на время сцены. Ключи «Включён» и «Яркость» — зажечь и погасить в нужный момент.',
  sound: 'Звук: проигрывается в моменты ключей «Играть». С местом — слышно оттуда, без места — «в ушах».',
  marker: 'Метка: просто точка с подписью — для себя (где встанет актёр, куда смотрит камера).',
  path: 'Путь (сплайн): точки в мире. По нему клонер раскладывает копии (режим «По пути»), его видно в игре.',
  group: 'Группа (нуль-объект): двигаешь группу — двигаются все её дети. Alt+G — сгруппировать выбранное.',
  cloner: 'Клонер: раскладывает копии того, что внутри (блок, шаблон, актёр, свет) — линией, сеткой, по кругу, по пути или случайно. Эффекторы меняют копии.',
  effector: 'Эффектор: меняет копии клонера — сдвиг, шаг, случайность, шум (рельеф), маска. Положи внутрь клонера или добавь в его список.',
  block: 'Блок: что клонирует клонер. Лежит внутри клонера. Можно задать состояние (axis=y, facing=north…).',
  template: 'Шаблон постройки внутри клонера: клонер расставит копии постройки из библиотеки.',
  structure: 'Постройка из библиотеки «Строительство» (studio/structures): ставится целиком, поворот по 90°, отражение. Призрак в игре, «Запечь в мир», может появляться во время сцены.',
  sky: 'Небо и солнце (как Sky/Sun в C4D): время суток, погода, дождь, туман, оттенок неба. Ставь ключи — 18:00 → 06:00 проходит через ночь. Прокрутка таймлайна двигает солнце в игре. Одно на сцену.'
};

async function placeHere(core) {
  if (core.link.connected) {
    try { const p = selToPos(await core.api.getSel()); if (p) return p.map((v) => Math.round(v * 2) / 2); } catch (_) {}
  }
  return viewCenter.pos.slice();
}

export function makeActions(core) {
  const { edit, setSel, selRef, sceneRef, timeRef, toast } = core;
  const selected = () => selRef.current.objs.filter((id) => objById(sceneRef.current, id));
  const a = {
    async create(type, opts = {}) {
      if (!sceneRef.current) { toast('Сначала открой или создай сцену', 'warn'); return null; }
      const sel1 = selected().map((id) => objById(sceneRef.current, id))[0];
      // блок/эффектор/шаблон — внутрь выбранного клонера
      let parent = opts.parent;
      if (parent === undefined && ['block', 'effector', 'template'].includes(type) && sel1 && sel1.type === 'cloner') parent = sel1.id;
      if (parent === undefined && sel1 && sel1.type === 'group' && opts.intoGroup) parent = sel1.id;
      const at = ['block', 'effector', 'template', 'sky'].includes(type) ? null : opts.at || (await placeHere(core));
      let id = null;
      edit((s) => {
        let r = addObject(s, type, { parent: parent || null, at, props: opts.props, name: opts.name });
        id = r.id;
        // новый клонер сразу с блоком внутри
        if (type === 'cloner' && !opts.empty) r = { ...r, scene: addObject(r.scene, 'block', { parent: r.id }).scene };
        return r.scene;
      });
      if (id) { setSel({ objs: [id] }); core.setHint(TYPE_HINT[type] || ''); }
      return id;
    },
    async createActor(actor) {
      if (!sceneRef.current) { toast('Сначала открой сцену', 'warn'); return; }
      const at = await placeHere(core);
      let id = null;
      edit((s) => { const r = addActorObject(s, { spawn: { pos: at, yaw: 0 }, existing: false, despawnAtEnd: true, ...actor }); id = r.id; return r.scene; });
      if (id) setSel({ objs: [id] });
    },
    del() {
      const s = sceneRef.current;
      const ids = selected();
      const cur = selRef.current;
      if (cur.ev) { // событие на дорожке
        edit((sc) => ({ ...sc, tracks: sc.tracks.map((tr) => (trackKey(tr) === cur.ev.track ? { ...tr, events: (tr.events || []).filter((_, i) => i !== cur.ev.i) } : tr)) }));
        setSel({ objs: cur.objs });
        return;
      }
      if (cur.stage != null) { edit((sc) => ({ ...sc, stage: (sc.stage || []).filter((_, i) => i !== cur.stage) })); setSel({}); return; }
      if (core.selKeys.length) { a.deleteKeys(); return; }
      if (!ids.length) return;
      const actors = ids.map((id) => objById(s, id)).filter((o) => o && o.type === 'actor');
      if (actors.length) {
        const n = actors.reduce((k, o) => k + (((s.tracks || []).find((tr) => tr.kind === 'actor' && tr.actor === o.actor) || {}).events || []).length, 0);
        if (n && !window.confirm('Удалить актёра вместе с его событиями (' + n + ')?')) return;
      }
      edit((sc) => removeObjects(sc, ids));
      setSel({});
    },
    deleteKeys() {
      const ks = core.selKeys;
      if (!ks.length) return;
      edit((s) => ks.reduce((acc, k) => deleteKeysAt(acc, k.obj, [k.ch], k.t), s));
      core.setSelKeys([]);
    },
    setInterp(interp) {
      const ks = core.selKeys;
      if (!ks.length) { toast('Выбери ключи на таймлайне или в кривых', 'warn'); return; }
      edit((s) => ks.reduce((acc, k) => setKeyField(acc, k.obj, k.ch, k.t, { interp, in: undefined, out: undefined }), s));
    },
    dup() {
      const ids = selected();
      if (!ids.length) return;
      let out = [];
      edit((s) => { const r = cloneObjects(s, ids); out = r.ids; return r.scene; });
      setSel({ objs: out });
    },
    group() {
      const ids = selected();
      if (!ids.length) { toast('Выбери объекты для группы', 'warn'); return; }
      let gid = null;
      edit((s) => { const r = groupObjects(s, ids); gid = r.id; return r.scene; });
      setSel({ objs: [gid] });
    },
    toCloner(mode) {
      const ids = selected();
      let cid = null;
      edit((s) => { const r = intoCloner(s, ids, mode); cid = r.id; return r.scene; });
      setSel({ objs: [cid] });
    },
    rename(id, name) { if (name && name.trim()) edit((s) => patchObj(s, id, { name: name.trim().slice(0, 80) })); },
    toggleEnabled(id) { edit((s) => patchObj(s, id, (o) => ({ ...o, enabled: o.enabled === false }))); },
    toggleVisible(id) { edit((s) => patchObj(s, id, (o) => ({ ...o, visible: o.visible === false }))); },
    selectAll() { const s = sceneRef.current; if (s) setSel({ objs: s.objects.map((o) => o.id) }); },
    stageCut(camId) {
      const t = timeRef.current;
      edit((s) => stageCutAt(s, camId, t));
      toast('«Монтаж»: с ' + t + ' т снимает «' + ((objById(sceneRef.current, camId) || {}).name || camId) + '»', 'ok', 2200);
    },
    async bake(id) {
      const s = sceneRef.current;
      const o = objById(s, id);
      if (!o) return;
      if (!core.link.connected) { toast('Нет связи с игрой — запекать некуда', 'warn'); return; }
      let pl = [];
      try { pl = o.type === 'structure' ? structurePlacements(s, o, timeRef.current) : clonerOutput(s, o, timeRef.current); } catch (e) { toast(e.message, 'error'); return; }
      if (!pl.length) { toast('Нечего запекать — выбери постройку из библиотеки', 'warn'); return; }
      if (pl.length > 20000 && !window.confirm('Копий ' + pl.length + ' — запекутся только первые 20000. Продолжить?')) return;
      const undoId = 'bake_' + o.id + '_' + Date.now().toString(36);
      try {
        await call('studio:bake', { id: o.id, placements: pl, undoId });
        const rec = { undoId, obj: o.id, n: Math.min(pl.length, 20000), at: Date.now() };
        edit((sc) => ({ ...sc, bakes: [...(sc.bakes || []), rec].slice(-50) }));
        toast('Запекаю в мир: ' + rec.n + ' размещений — игра ставит их по тикам', 'ok', 3000);
      } catch (e) { toast(e.message, 'error'); }
    },
    async unbake(id) {
      const s = sceneRef.current;
      const list = (s.bakes || []).filter((b) => b.obj === id);
      const last = list[list.length - 1];
      if (!last) { toast('Этот клонер ещё не запекался', 'warn'); return; }
      try {
        await call('studio:undoBake', last.undoId);
        edit((sc) => ({ ...sc, bakes: (sc.bakes || []).filter((b) => b.undoId !== last.undoId) }));
        toast('Отменяю запекание — игра возвращает блоки как были', 'ok', 3000);
      } catch (e) { toast(e.message, 'error'); }
    }
  };
  return a;
}

function trackKey(tr) { return tr.kind === 'actor' ? 'actor:' + tr.actor : tr.kind; }

// подменю «Создать»
export function createItems(core, act) {
  const s = core.scene;
  const proj = (core.project && core.project.actors) || [];
  const taken = s ? (s.actors || []).map((x) => x.id) : [];
  const actorSub = [
    ...proj.map((pa) => ({ label: pa.name || pa.id, icon: 'actor', disabled: taken.includes(pa.id), hint: 'Персонаж проекта «' + (pa.name || pa.id) + '» (' + (pa.base === 'entity' ? pa.type : 'житель №' + pa.who) + '). В сцене — один раз.', run: () => act.createActor({ id: pa.id, kind: 'story', ref: pa.id, name: pa.name || pa.id }) })),
    proj.length ? { sep: true } : { head: 'Персонажей проекта нет' },
    { label: 'Житель долины по номеру', icon: 'actor', hint: 'Готовый житель долины из мода Villagers — номер (who) задашь в атрибутах.', run: () => act.createActor({ id: uniqueId('valley', taken), kind: 'valley', who: 0, name: 'Житель' }) },
    { label: 'Любая сущность', icon: 'actor', hint: 'Кот, голем, зомби — любой моб по id.', run: () => act.createActor({ id: uniqueId('mob', taken), kind: 'entity', type: 'minecraft:cat', name: 'Сущность' }) },
    { label: 'Игрок', icon: 'actor', disabled: s && (s.actors || []).some((x) => x.kind === 'player'), hint: 'Тот, кто смотрит сцену: повернуть голову, переместить, посадить.', run: () => act.createActor({ id: uniqueId('player', taken), kind: 'player', name: 'Игрок', spawn: undefined }) }
  ];
  return [
    { label: 'Камера', icon: 'camera', hint: TYPE_HINT.camera, run: () => act.create('camera') },
    { label: 'Актёр', icon: 'actor', hint: TYPE_HINT.actor, sub: actorSub },
    { label: 'Свет', icon: 'light', hint: TYPE_HINT.light, run: () => act.create('light') },
    { label: 'Звук', icon: 'sound', hint: TYPE_HINT.sound, run: () => act.create('sound') },
    { label: 'Метка', icon: 'marker', hint: TYPE_HINT.marker, run: () => act.create('marker') },
    { label: 'Путь (сплайн)', icon: 'path', hint: TYPE_HINT.path, run: () => act.create('path') },
    { label: 'Группа', icon: 'group', kb: 'Alt+G', hint: TYPE_HINT.group, run: () => act.create('group', { intoGroup: true }) },
    { label: 'Небо и солнце', icon: 'sky', hint: TYPE_HINT.sky, disabled: !!(s && (s.objects || []).some((o) => o.type === 'sky')), run: () => act.create('sky') },
    { sep: true },
    { label: 'Клонер', icon: 'cloner', hint: TYPE_HINT.cloner, sub: CLONER_MODES.map((m) => ({ label: CLONER_MODE_LABEL[m], icon: 'cloner', hint: TYPE_HINT.cloner, run: () => act.create('cloner', { props: { mode: m } }) })) },
    { label: 'Эффектор', icon: 'effector', hint: TYPE_HINT.effector, sub: EFFECTOR_KINDS.map((k) => ({ label: EFFECTOR_LABEL[k], icon: 'effector', hint: TYPE_HINT.effector, run: () => act.create('effector', { props: { kind: k }, name: EFFECTOR_LABEL[k] }) })) },
    { label: 'Блок (для клонера)', icon: 'block', hint: TYPE_HINT.block, run: () => act.create('block') },
    { label: 'Шаблон постройки (в клонер)', icon: 'template', hint: TYPE_HINT.template, run: () => act.create('template') },
    { label: 'Постройка из библиотеки', icon: 'structure', hint: TYPE_HINT.structure, sub: (core.structures || []).length ? core.structures.map((st) => ({ label: st.name || st.id, icon: 'structure', hint: (st.size ? st.size.join('×') + ' · ' : '') + st.id, run: () => act.create('structure', { props: { structure: st.id }, name: st.name || st.id }) })) : [{ label: 'Библиотека пуста — «Строительство» → «Постройки»', disabled: true }] }
  ];
}

export function objLabel(o) { return OBJ_LABEL[o.type] || o.type; }
export function hasAnim(o) { return Object.keys((o && o.anim) || {}).some((ch) => isAnimated(o, ch)); }
