// «Жители» (фаза 6, трек B): данные окна — каталог (из игры или запасной), шаблоны поведений, расписание дня, подписи.
import FALLBACK from './aiCatalog.json';

export const FALLBACK_CATALOG = FALLBACK;

/** Каталог: свежий из игры поверх запасного (у игры может быть новее). */
export function mergeCatalog(game, params, cached) {
  const base = { ...FALLBACK, ...(cached || {}) };
  const c = { ...base, ...(game || {}) };
  if (params && Array.isArray(params.params)) {
    c.params = params.params;
    c.groups = params.groups || c.groups;
    c.trades = params.trades || c.trades;
    c.tempers = params.tempers || c.tempers;
    c.gameValues = {};
    for (const p of params.params) c.gameValues[p.id] = p.value;
    c.shipped = params.shipped;
    c.problems = params.problems || [];
  }
  c.fromGame = !!(game || params);
  return c;
}

// ---- распорядок дня (как Schedule в Villagers, Kokk): тики 0–24000, 0 = 6:00 утра ----
export const PHASES = [
  { id: 'morning', ru: 'Утро и работа', from: 23400, to: 5500, color: '#d9b44a' },
  { id: 'lunch', ru: 'Обед', from: 5500, to: 6700, color: '#e07a3a' },
  { id: 'afternoon', ru: 'После обеда', from: 6700, to: 10000, color: '#7fb34a' },
  { id: 'evening', ru: 'Вечер: разговоры', from: 10000, to: 12500, color: '#9a6ad6' },
  { id: 'night', ru: 'Ночь: сон', from: 12500, to: 23400, color: '#3b4f8f' }
];
export const PHASE_RU = Object.fromEntries(PHASES.map((p) => [p.id, p.ru]));

export function mcClock(t) {
  const m = Math.floor(((Number(t) || 0) + 6000) % 24000 / 1000 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export const MODE_RU = {
  'выбор': 'Выбор из всех дел', 'срочное': 'Срочное', 'прерывание': 'Бросил дело ради срочного', 'рефлекс': 'Рефлекс',
  'поручение': 'Поручение', 'служба': 'Служба', 'реакция': 'Реакция'
};
export const STATUS_RU = { 'выбрано': 'выбрано', 'ниже': 'ниже других', 'перерыв': 'на перерыве', 'пропущено': 'пропущено', 'не начать': 'не вышло начать', 'убрано': 'убрано' };

export const PLACE_PRESETS = [
  ['center', 'центр поселения'], ['home', 'его дом'], ['bed', 'его кровать'], ['storage', 'ближайший сундук склада'], ['here', 'где стоит'], ['player', 'ближайший игрок']
];

// ---- шаблоны поведений: из них удобно начинать (и по ним идут уроки) ----
export const TEMPLATES = [
  {
    id: 'mend_fence', type: 'goal', name: 'Чинит забор', name_en: 'Mends the fence', enabled: true, _tpl: 'Строитель берёт доски, делает забор и ставит его рядом с забором поселения.',
    who: { trades: ['BUILDER', 'LABORER'], tempers: [], age: 'adult' },
    when: [{ time: 'day' }, { weather: 'clear' }, { block: '#minecraft:fences', radius: 16 }],
    score: { base: 60, terms: [{ k: 'own_trade', w: 30 }, { k: 'hunger', w: -3 }] },
    steps: [
      { do: 'get', item: 'minecraft:oak_fence', count: 2 },
      { do: 'go', to: { block: '#minecraft:fences', radius: 16 }, radius: 2.5 },
      { do: 'place_block', block: 'minecraft:oak_fence', at: { block: '#minecraft:fences', radius: 16 }, near: true },
      { do: 'anim', name: 'swing' },
      { do: 'say', ru: 'Вот, теперь крепко.', en: 'There, good and sturdy.' }
    ],
    interruptible: true, cooldown: 2400
  },
  {
    id: 'wave_player', type: 'reaction', on: 'saw_player', name: 'Машет игроку', name_en: 'Waves to the player', enabled: true, chance: 0.35, cooldown: 1200, utility: 900,
    _tpl: 'Увидел игрока — повернулся, помахал и поздоровался. Дело не бросает.',
    who: { trades: [], tempers: [], age: 'any' }, when: [{ time: 'day' }],
    steps: [{ do: 'look', at: 'player' }, { do: 'anim', name: 'swing' }, { do: 'say', ru: 'Здравствуй!', en: 'Hello there!' }]
  },
  {
    id: 'rain_home', type: 'goal', name: 'Прячется от дождя', name_en: 'Shelters from the rain', enabled: true, _tpl: 'Под дождём без срочной работы житель идёт под крышу своего дома.',
    who: { trades: [], tempers: [], age: 'any' }, when: [{ weather: 'rain' }, { place: 'sky' }],
    score: { base: 90, terms: [{ k: 'rain', w: 20 }] },
    steps: [{ do: 'say', ru: 'Ну и льёт…', en: 'What a downpour…' }, { do: 'go', to: 'home', radius: 1.5, stay: 200 }],
    interruptible: true, cooldown: 1200
  },
  {
    id: 'out_of_water', type: 'reaction', on: 'fell_in_water', name: 'Выбирается из воды', name_en: 'Gets out of the water', enabled: true, chance: 1, cooldown: 200, utility: 1150,
    _tpl: 'Упал в воду — сразу выбирается (своим «Выбраться»), не дожидаясь, пока проплавает «Сколько барахтается».',
    who: { trades: [], tempers: [], age: 'any' }, when: [],
    steps: [{ do: 'say', ru: 'Ох, мокро!', en: 'Oh, it is wet!' }, { do: 'escape' }]
  },
  {
    id: 'hungry_ask', type: 'reaction', on: 'hungry', name: 'Голодный просит еды', name_en: 'Hungry, asks for food', enabled: true, chance: 0.5, cooldown: 6000, utility: 900,
    _tpl: 'Проголодался, а на складе пусто — жалуется вслух.',
    who: { trades: [], tempers: [], age: 'adult' }, when: [{ item: 'minecraft:bread', in: 'storage', count: 1, op: '<' }],
    steps: [{ do: 'anim', name: 'shake_head' }, { do: 'say', ru: 'Есть нечего… кто бы хлеба принёс.', en: 'Nothing to eat… if only someone brought bread.' }]
  },
  {
    id: 'evening_tavern', type: 'goal', name: 'Вечером к соседу', name_en: 'Visits a neighbour in the evening', enabled: true, _tpl: 'Вечером, если делать нечего, идёт к площади и зовёт соседа поговорить.',
    who: { trades: [], tempers: ['GENEROUS', 'CALM'], age: 'adult' }, when: [{ time: 'evening' }],
    score: { base: 40, terms: [{ k: 'idle', w: 60 }, { k: 'evening', w: 20 }] },
    steps: [{ do: 'go', to: 'center', radius: 4 }, { do: 'talk', radius: 16 }],
    interruptible: true, cooldown: 12000
  }
];

export function blankScript(type, id) {
  return type === 'reaction'
    ? { id, type: 'reaction', on: 'saw_player', name: 'Новая реакция', name_en: '', enabled: true, chance: 1, cooldown: 600, utility: 900, who: { trades: [], tempers: [], age: 'any' }, when: [], steps: [{ do: 'say', ru: 'Ой!', en: 'Oh!' }] }
    : { id, type: 'goal', name: 'Новое дело', name_en: '', enabled: true, who: { trades: [], tempers: [], age: 'adult' }, when: [{ time: 'day' }], score: { base: 50, terms: [] }, steps: [{ do: 'go', to: 'center', radius: 3 }], interruptible: true, cooldown: 1200 };
}

/** Значение параметра в слое проекта для области ('all' | 'trade:X' | 'temper:Y'); undefined — не задано. */
export function layerValue(params, scope, id) {
  if (!params) return undefined;
  if (scope === 'all') return (params.values || {})[id];
  const [k, x] = scope.split(':');
  const g = k === 'trade' ? params.trades : params.tempers;
  return g && g[x] ? g[x][id] : undefined;
}

export function setLayerValue(params, scope, id, v) {
  const p = { v: 1, values: { ...(params.values || {}) }, trades: { ...(params.trades || {}) }, tempers: { ...(params.tempers || {}) } };
  if (scope === 'all') {
    if (v === undefined) delete p.values[id]; else p.values[id] = v;
    return p;
  }
  const [k, x] = scope.split(':');
  const key = k === 'trade' ? 'trades' : 'tempers';
  const cur = { ...(p[key][x] || {}) };
  if (v === undefined) delete cur[id]; else cur[id] = v;
  if (Object.keys(cur).length) p[key][x] = cur; else delete p[key][x];
  return p;
}

export function countSet(params) {
  if (!params) return 0;
  let n = Object.keys(params.values || {}).length;
  for (const g of ['trades', 'tempers']) for (const v of Object.values(params[g] || {})) n += Object.keys(v || {}).length;
  return n;
}

export function fmtNum(v, p) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (p && (p.int || p.bool)) return String(Math.round(n));
  return Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Читаемо: место шага. */
export function placeText(p) {
  if (p == null || p === '') return 'здесь';
  if (Array.isArray(p)) return p.join(', ');
  if (typeof p === 'string') { const x = PLACE_PRESETS.find((q) => q[0] === p); return x ? x[1] : p; }
  if (p.block) return 'блок ' + p.block + (p.radius ? ' в ' + p.radius + ' бл.' : '');
  if (p.entity) return 'существо ' + p.entity + (p.radius ? ' в ' + p.radius + ' бл.' : '');
  if (p.building) return 'постройка ' + p.building;
  if (p.random) return 'случайно в ' + p.random + ' бл.';
  if (p.of) return placeText(p.of) + ' + ' + (p.offset || []).join(',');
  return JSON.stringify(p);
}

/** Короткий текст шага для карточки. */
export function stepText(st, cat) {
  const a = (cat.actions || []).find((x) => x.id === st.do);
  const n = a ? a.ru : st.do;
  switch (st.do) {
    case 'go': return n + ': ' + placeText(st.to);
    case 'say': return n + ': «' + (st.ru || st.text || '') + '»';
    case 'get': case 'craft': case 'take': case 'give': return n + ': ' + (st.item || '?') + ' ×' + (st.count || 1);
    case 'place_block': return n + ': ' + (st.block || '?');
    case 'anim': return n + ': ' + (st.name || 'swing');
    case 'wait': return n + ' ' + Math.round((st.ticks || 40) / 20 * 10) / 10 + ' с';
    case 'goal': return n + ': ' + (st.kind || '?');
    default: return n;
  }
}

/** Текст условия «Когда». */
export function condText(c, cat) {
  if (!c || typeof c !== 'object') return '?';
  if (c.not) return 'НЕ (' + condText(c.not, cat) + ')';
  if (c.any) return 'любое из: ' + c.any.map((x) => condText(x, cat)).join(' / ');
  if (c.all) return 'все: ' + c.all.map((x) => condText(x, cat)).join(' + ');
  const k = Object.keys(c)[0];
  const v = c[k];
  const T = { day: 'днём', night: 'ночью', dawn: 'на рассвете', dusk: 'на закате', morning: 'утром', lunch: 'в обед', afternoon: 'после обеда', evening: 'вечером' };
  switch (k) {
    case 'time': return T[v] || v;
    case 'weather': return { clear: 'ясно', rain: 'дождь', thunder: 'гроза' }[v] || v;
    case 'need': return (v === 'health' ? 'здоровье' : 'сытость') + ' ' + (c.op || '<') + ' ' + c.value;
    case 'hungry': return v ? 'голоден' : 'сыт';
    case 'block': return 'рядом ' + v + (c.radius ? ' (' + c.radius + ' бл.)' : '');
    case 'entity': return 'рядом ' + v + (c.radius ? ' (' + c.radius + ' бл.)' : '');
    case 'item': return v + ' ' + (c.op || '>=') + ' ' + (c.count || 1) + ' ' + ({ inventory: 'в карманах', storage: 'на складе' }[c.in] || '');
    case 'place': return { home: 'в своём доме', settlement: 'в поселении', outside: 'вне поселения', water: 'в воде', underground: 'под землёй', sky: 'под открытым небом' }[v] || v;
    case 'chance': return 'с вероятностью ' + v;
    default: return k + ' ' + JSON.stringify(v);
  }
}
