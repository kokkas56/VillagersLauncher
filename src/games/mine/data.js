// «Вагонетка»: глубины, руды (альбом), улучшения вагонетки, задания дня.

export const PX_PER_M = 1000; // пикселей пути на метр глубины
export const AUTHOR_MUL = 50;
export const END_DEPTH = 5500; // конец шахты — «Сердце горы» пройдено

// руды и камни: первые 12 — альбом «руды и камни», последние 2 — реликвии глубин
export const ORES = [
  { name: 'Уголь', c: '#4a4a52', d: '#24242a', val: 4 },
  { name: 'Медь', c: '#e08a50', d: '#a05a30', val: 8 },
  { name: 'Железо', c: '#d8b8a0', d: '#9a7a66', val: 12 },
  { name: 'Серебро', c: '#e8eef4', d: '#9aa4b0', val: 20 },
  { name: 'Золото', c: '#f2cc4a', d: '#b08a24', val: 30 },
  { name: 'Лазурит', c: '#4a7ad8', d: '#2a4a98', val: 40 },
  { name: 'Изумруд', c: '#3fd07a', d: '#1f8a4a', val: 60 },
  { name: 'Аквамарин', c: '#7ae8e8', d: '#3a9aa8', val: 70 },
  { name: 'Аметист', c: '#b07ae8', d: '#6a3aa8', val: 80 },
  { name: 'Рубин', c: '#ff4a5a', d: '#a01a2a', val: 110 },
  { name: 'Сапфир', c: '#3a5aff', d: '#1a2aa0', val: 140 },
  { name: 'Алмаз', c: '#c8ffff', d: '#5ac8d8', val: 200 },
  { name: 'Огненный опал', c: '#ff9a30', d: '#c04010', val: 300 },
  { name: 'Сердце горы', c: '#ff5ad8', d: '#a01a8a', val: 500 }
];
export const ALBUM_MAIN = 12;

// уровни глубины: открываются суммарной глубиной (м)
// w — веса руд (индексы ORES), dark — темнота вне света фонаря, deco — особенность
export const LEVELS = [
  {
    name: 'Верхний штрек', need: 0, spd: 1, dark: 0, deco: '',
    strata: ['#4a4038', '#3f3832', '#52463a', '#3a3534', '#473d33', '#3d3630'],
    pal: { back: '#2b2624', backDk: '#211d1c', backHi: '#352f2b', edge: '#5a4c3e', edgeDk: '#1a1716', floor: '#4a3e32', floorHi: '#5a4b3c', floorDk: '#382f27', speckHi: '#5e5246', speckDk: '#2c2724', pit: '#120f0e', pit2: '#1c1816', face: '#5d5044', faceDk: '#463c33' },
    w: [30, 24, 22, 0, 8, 0, 3, 0, 0, 0, 0, 0, 0, 0], show: [2, 4, 6]
  },
  {
    name: 'Старые выработки', need: 250, spd: 1.05, dark: 0.45, deco: 'web',
    strata: ['#3a342e', '#332e2a', '#40382f', '#2e2a28', '#3a322a', '#302a26'],
    pal: { back: '#211d1b', backDk: '#191614', backHi: '#2b2622', edge: '#4a3e32', edgeDk: '#141210', floor: '#3e342a', floorHi: '#4a3e32', floorDk: '#2e2620', speckHi: '#4e443a', speckDk: '#221e1c', pit: '#0c0a09', pit2: '#161210', face: '#4d4238', faceDk: '#3a322a' },
    w: [22, 22, 22, 12, 10, 6, 3, 0, 0, 0, 0, 0, 0, 0], show: [1, 3, 5]
  },
  {
    name: 'Подземные озёра', need: 700, spd: 1.1, dark: 0.5, deco: 'water',
    strata: ['#34404a', '#2e3842', '#3a4652', '#2a323a', '#36424c', '#2c3640'],
    pal: { back: '#1e2428', backDk: '#161b1f', backHi: '#283036', edge: '#4a5a66', edgeDk: '#12161a', floor: '#3a444c', floorHi: '#4a5660', floorDk: '#2c343a', speckHi: '#52626e', speckDk: '#1e252a', pit: '#0c1a2a', pit2: '#14304a', face: '#4a5862', faceDk: '#3a464e' },
    w: [10, 12, 18, 16, 12, 10, 5, 9, 0, 0, 0, 0, 0, 0], show: [3, 5, 7]
  },
  {
    name: 'Хрустальные пещеры', need: 1400, spd: 1.15, dark: 0.45, deco: 'crystal',
    strata: ['#3a3048', '#322a40', '#423654', '#2c2638', '#3c3250', '#30283e'],
    pal: { back: '#1e1a28', backDk: '#16131e', backHi: '#2a2436', edge: '#5a4a72', edgeDk: '#120f18', floor: '#3a3248', floorHi: '#4a4060', floorDk: '#2c2638', speckHi: '#5a4e70', speckDk: '#1e1a28', pit: '#0e0a14', pit2: '#1a1424', face: '#4e4462', faceDk: '#3c3450' },
    w: [0, 4, 8, 10, 10, 10, 6, 6, 10, 5, 3, 1.4, 0, 0], show: [8, 11, 7]
  },
  {
    name: 'Лавовые глубины', need: 2600, spd: 1.2, dark: 0.55, deco: 'lava',
    strata: ['#3a2422', '#2e1c1a', '#46281f', '#261614', '#3e2220', '#2a1816'],
    pal: { back: '#1a1110', backDk: '#120b0a', backHi: '#2a1a16', edge: '#6a3424', edgeDk: '#0e0807', floor: '#3a2620', floorHi: '#5a3426', floorDk: '#2a1a16', speckHi: '#6a3a2a', speckDk: '#1a100e', pit: '#ff5a1a', pit2: '#c03010', face: '#4e2e24', faceDk: '#3a221c' },
    w: [0, 0, 4, 4, 12, 6, 6, 0, 4, 10, 6, 2, 4, 0], show: [9, 12, 4]
  },
  {
    name: 'Сердце горы', need: 4000, spd: 1.25, dark: 0.6, deco: 'heart',
    strata: ['#2e2238', '#261c30', '#382842', '#20182a', '#33243e', '#241a2e'],
    pal: { back: '#160f1c', backDk: '#100a14', backHi: '#221828', edge: '#7a3a7a', edgeDk: '#0c0810', floor: '#30223a', floorHi: '#4a2e52', floorDk: '#22182a', speckHi: '#6a3a72', speckDk: '#180f1e', pit: '#ff5a1a', pit2: '#a02a3a', face: '#44304e', faceDk: '#34243e' },
    w: [0, 0, 0, 4, 10, 6, 6, 4, 6, 8, 8, 4, 5, 1.2], show: [13, 11, 10]
  }
];
export const levelsOpen = (depth) => { let n = 0; for (const l of LEVELS) if (depth >= l.need) n++; return n; };

export const UPGRADES = [
  { id: 'brake', name: 'Тормоза', ic: 'cart', cost: [300, 900, 2500], info: (l) => (l ? 'СИЛА ' + l + ', ДЕРЖИ ВЛЕВО' : 'НЕ КУПЛЕНЫ') },
  { id: 'lamp', name: 'Фонарь', ic: 'bolt', cost: [200, 600, 1500, 3500], info: (l) => 'СВЕТ ' + (60 + 25 * l) },
  { id: 'magnet', name: 'Магнит', ic: 'magnet', cost: [400, 1200, 3000, 6000], info: (l) => (l ? 'РАДИУС ' + (12 + 12 * l) : 'НЕ КУПЛЕН') },
  { id: 'spring', name: 'Рессоры', ic: 'boot', cost: [350, 1000, 2800], info: (l) => 'ПРЫЖОК +' + 6 * l + '%' },
  { id: 'helmet', name: 'Каска', ic: 'heart', cost: [800, 4000], info: (l) => l + ' СПАС. ЗА ЗАЕЗД' }
];

export const DAILY = [
  { id: 'ore', stat: 'ore', kind: 'sum', goals: [20, 35, 50], text: (n) => 'СОБЕРИ ' + n + ' КУСКОВ РУДЫ', icon: 'gem', pay: (n) => n * 3 },
  { id: 'depth', stat: 'depth', kind: 'sum', goals: [15, 25, 40], text: (n) => 'ПРОЕДЬ ' + n + ' М ВГЛУБЬ', icon: 'pick', pay: (n) => n * 8 },
  { id: 'gap', stat: 'gap', kind: 'sum', goals: [15, 25, 40], text: (n) => 'ПЕРЕПРЫГНИ ' + n + ' ПРОВАЛОВ', icon: 'boot', pay: (n) => n * 5 },
  { id: 'duck', stat: 'duck', kind: 'sum', goals: [10, 20, 30], text: (n) => 'ПРОСКОЧИ ПОД ' + n + ' БАЛК. И МЫШАМИ', icon: 'run', pay: (n) => n * 6 },
  { id: 'runM', stat: 'runM', kind: 'max', goals: [5, 8, 12], text: (n) => 'ПРОЕДЬ ' + n + ' М ЗА ЗАЕЗД', icon: 'flag', pay: (n) => n * 20 },
  { id: 'value', stat: 'value', kind: 'sum', goals: [500, 900, 1500], text: (n) => 'ДОБУДЬ РУДЫ НА ' + n, icon: 'coin', pay: (n) => Math.round(n / 4) },
  { id: 'rare', stat: 'rare', kind: 'sum', goals: [1, 2, 3], text: (n) => 'НАЙДИ ' + n + ' РЕДК. КАМНЯ', icon: 'star', pay: (n) => n * 60 },
  { id: 'rides', stat: 'rides', kind: 'sum', goals: [3, 5, 8], text: (n) => 'СДЕЛАЙ ' + n + ' ЗАЕЗДОВ', icon: 'cart', pay: (n) => n * 20 }
];

export const fresh = () => ({
  v: 1, depth: 0, value: 0, coins: 0, rides: 0, best: 0, lvl: 0, done: 0,
  album: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  up: { brake: 0, lamp: 0, magnet: 0, spring: 0, helmet: 0 },
  daily: { key: '', t: [] }
});

// события месяца: находка события на путях, цель испытания, «небо» шахты (сквозь колодец и в штреке)
export const EVENT_MINE = {
  yule: { goal: 450, sky: 'snow', val: 50 },
  maslenitsa: { goal: 450, sky: 'embers', val: 50 },
  thaw: { goal: 450, sky: 'drops', val: 50 },
  jest: { goal: 450, sky: 'confetti', val: 50 },
  bloom: { goal: 450, sky: 'spores', val: 50 },
  kupala: { goal: 450, sky: 'fireflies', val: 50 },
  storm: { goal: 450, sky: 'rain', val: 50 },
  starfall: { goal: 450, sky: 'glints', val: 50 },
  harvest: { goal: 450, sky: 'leaves', val: 50 },
  pumpkin: { goal: 450, sky: 'bats', val: 50 },
  fog: { goal: 450, sky: 'fog', val: 50 },
  newyear: { goal: 450, sky: 'garland', val: 50 }
};
// косметика мастерства: окраска вагонетки [корпус, тень, блик]
export const MINE_COS = [
  { name: 'Железная', c: '#6b6e76', d: '#4a4c53', h: '#8d9098' },
  { name: 'Медная', c: '#b0683a', d: '#7a4426', h: '#d8905a' },
  { name: 'Зелёная', c: '#3e7a4a', d: '#2a5432', h: '#5aa06a' },
  { name: 'Красная', c: '#a83a3a', d: '#742424', h: '#d05a5a' },
  { name: 'Золотая', c: '#c8a030', d: '#8a6a1a', h: '#f0cc5a' },
  { name: 'Самоцветная', c: '#6a4aa8', d: '#462e7a', h: '#9a7ae0' }
];
