// «Рыбалка»: события месяца — особый улов (идёт в испытание), украшения сцены, погода.
// Таблица по id события из src/games/events.js. Испытание: поймать goal штук особого улова за месяц.
import { sprite, fishSprite } from './data.js';

// fall: что летит сверху ('snow' | 'petal' | 'leaf' | null); col — цвета частиц
// rain: доля дождя на озере (null — как у озера); night: улов чаще ночью/в дождь (bias)
export const SEASON = {
  yule: {
    item: 'Святочный ёрш', col: '#cfe8ff', goal: 60, fall: 'snow', fcol: ['#ffffff', '#e8f0ff'],
    spr: fishSprite({ L: 10, H: 5, back: '#5a7090', body: '#b8d0e8', belly: '#f4f8ff', fin: '#e04040', pat: 'spots', pc: '#ffffff', big: 1 })
  },
  maslenitsa: {
    item: 'Масленичный блин', col: '#ffcf5a', goal: 60, fall: 'snow', fcol: ['#ffffff'],
    spr: sprite({ a: '#e8b860', b: '#c88a3a', c: '#fff0b0' }, ['..aaaa..', '.abaaca.', 'aaaabaaa', 'abaaaaba', '.aacaaa.', '..bbbb..'])
  },
  thaw: {
    item: 'Вешний налим', col: '#7ad0ff', goal: 60, fall: null, fcol: null,
    spr: fishSprite({ L: 13, H: 4, back: '#3a4a30', body: '#7a8a50', belly: '#c8d8a0', fin: '#5a6a40', pat: 'spots', pc: '#a0e0ff', tail: 'r', whisk: 1 })
  },
  jest: {
    item: 'Резиновая уточка', col: '#ff8ad8', goal: 60, fall: null, fcol: null,
    spr: sprite({ a: '#ffd84a', b: '#ff8a2a', e: '#202020', c: '#e0b030' }, ['...aa...', '..aeab..', '...aa...', 'aaaaaa..', 'acaaaaa.', '.ccccc..'])
  },
  bloom: {
    item: 'Цветочная плотва', col: '#ffa0c8', goal: 60, fall: 'petal', fcol: ['#ffc0dc', '#ffffff', '#ff9ac8'],
    spr: fishSprite({ L: 10, H: 4, back: '#c0608a', body: '#ffb0d0', belly: '#fff0f6', fin: '#ff70b0', eye: '#a02060', pat: 'spots', pc: '#ffffff' })
  },
  kupala: {
    item: 'Купальский венок', col: '#ff9a3a', goal: 60, fall: null, fcol: null,
    spr: sprite({ g: '#3a8a3a', f: '#ffe04a', r: '#e04848', c: '#fff6d0', o: '#ff9a3a' }, ['...o...', '...c...', '.gfgrg.', 'g.....g', 'r.....f', '.gfgrg.'])
  },
  storm: {
    item: 'Грозовой угорь', col: '#e8e070', goal: 60, fall: null, fcol: null, rain: 0.5,
    spr: fishSprite({ L: 16, H: 3, back: '#1a2a50', body: '#3a5aa0', belly: '#a0b8e8', fin: '#ffe040', pat: 'line', pc: '#ffe040', tail: 'r' })
  },
  starfall: {
    item: 'Звёздный осколок', col: '#c8b0ff', goal: 60, fall: null, fcol: null, night: 1,
    spr: sprite({ a: '#c8b0ff', b: '#f0e8ff', c: '#ffffff' }, ['...a...', '..aba..', 'aabcbaa', '.abcba.', '..aba..', '.a...a.'])
  },
  harvest: {
    item: 'Наливное яблоко', col: '#e0b040', goal: 60, fall: 'leaf', fcol: ['#e0b040', '#d07a30', '#c8a030'],
    spr: sprite({ l: '#5a9a3a', s: '#6a4a2a', r: '#d83a2a', h: '#ff9a80', d: '#a02a1a' }, ['...l..', '..sl..', '.rrrr.', 'rrhrrr', 'rrrrrr', '.rrrd.'])
  },
  pumpkin: {
    item: 'Тыква-фонарь', col: '#ff8a2a', goal: 60, fall: 'leaf', fcol: ['#d07a30', '#a05020'], night: 1,
    spr: sprite({ s: '#4a7a2a', o: '#ff8a2a', y: '#ffe060', d: '#c05a10' }, ['....s...', '.oooooo.', 'oyoodyoo', 'oooyoood', 'oyyyyyod', '.dooood.'])
  },
  fog: {
    item: 'Туманный сиг', col: '#b8c4c8', goal: 60, fall: null, fcol: null, night: 1,
    spr: fishSprite({ L: 13, H: 5, back: '#8090a0', body: '#d0dce4', belly: '#f4f8fa', fin: '#a0b4c0', eye: '#40c0d0' })
  },
  newyear: {
    item: 'Подарок', col: '#7affc0', goal: 60, fall: 'snow', fcol: ['#ffffff', '#e8f0ff'],
    spr: sprite({ r: '#e04848', b: '#3a9a5a', y: '#ffe060' }, ['..r.r..', '...y...', 'bbbrbbb', 'bbbrbbb', 'rrrrrrr', 'bbbrbbb', 'bbbrbbb'])
  }
};

// предмет-улов события (для pickCatch): tier -3, в альбом не идёт
const ITEMS = {};
for (const id in SEASON) {
  const s = SEASON[id];
  ITEMS[id] = { id: 'ev_' + id, name: s.item, tier: -3, ev: 1, col: s.col, spr: s.spr };
}
export const eventItem = (id) => ITEMS[id] || ITEMS.yule;
export const seasonOf = (id) => SEASON[id] || SEASON.yule;
export const eventGoal = (id) => seasonOf(id).goal;
