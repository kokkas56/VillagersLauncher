// «Побег от зомби»: маршруты, магазин, миссии, задания дня, значки дистанций.
import { fmtKm } from './kit.js';

export const M_PER_UNIT = 0.3; // метров на единицу дороги (скорость ≈ 4–8 м/с)
export const AUTHOR_MUL = 40; // ускорение прогресса в режиме автора

// маршруты: открываются суммарной дистанцией (м)
export const ROUTES = [
  {
    name: 'Лесная дорога', need: 0, coin: 1, spd: 1, kind: 0,
    fog: [120, 72, 78], road: [[150, 112, 72], [136, 100, 64]], grass: [[70, 104, 52], [60, 92, 46]], edge: [96, 70, 44], line: [176, 140, 96],
    sky: ['#241a3e', '#2f1f48', '#3e2450', '#582a54', '#7a3452', '#a2444c', '#c45c44', '#dc7c48'],
    sun: '#ffb060', sunHi: '#ffe0a0', sunGlow: 'rgba(255,170,90,0.18)', hill: '#4a2c4a', house: '#3a2238', win: '#ffc860',
    gap: ['#5a3a22', '#140c10', '#7a5434'], fence: ['#5a3c22', '#9a7040', '#b88a52'], beam: ['#4a3020', '#7a5230', '#9a6e40', '#5a3a20', '#3a6a34'],
    hay: ['#d8b850', '#e8cc68'], cart: ['#6a4626', '#8a5e34', '#5a3a20'],
    tree: ['#4a3020', '#2e5a32', '#3a6a34', '#244a2a', '#4c7c40'], bush: ['#2e5a2e', '#3e6e36', '#d04848'], post: ['#6a4a2c', '#4a321e'],
    glow: [255, 180, 80], lampC: '#ffc860', star: '#f4e8d0', bird: '#2a1a30'
  },
  {
    name: 'Болото', need: 5000, coin: 1.2, spd: 1.04, kind: 1,
    fog: [70, 86, 70], road: [[96, 84, 58], [86, 76, 52]], grass: [[52, 76, 48], [44, 66, 42]], edge: [62, 54, 38], line: [120, 110, 80],
    sky: ['#18241e', '#1c2c24', '#22342a', '#2a3e30', '#344a36', '#40563c', '#4e6442', '#5e7048'],
    sun: '#c8d890', sunHi: '#eef4c0', sunGlow: 'rgba(200,220,140,0.14)', hill: '#22342a', house: '#1a2a20', win: '#b8ff90',
    gap: ['#3a4a2a', '#0e1a12', '#4a5a34'], fence: ['#4a3a24', '#6a5434', '#7e6a44'], beam: ['#3a2e1e', '#4e4028', '#5e5032', '#2e2416', '#5a8a3a'],
    hay: ['#7a8a4a', '#8e9e5a'], cart: ['#4e3e26', '#625030', '#3a2e1c'],
    tree: ['#3a3226', '#4a5e34', '#5a6e3a', '#2e3e26', '#6a8a48'], bush: ['#5a6a34', '#7a8a44', '#8a5a2a'], post: ['#4a3e2a', '#33291c'],
    glow: [140, 255, 170], lampC: '#a8ffc0', star: '#d8f0d0', bird: '#14201a'
  },
  {
    name: 'Снежный перевал', need: 20000, coin: 1.5, spd: 1.08, kind: 2,
    fog: [170, 186, 210], road: [[150, 156, 170], [136, 142, 158]], grass: [[226, 234, 242], [208, 218, 230]], edge: [110, 116, 132], line: [190, 200, 214],
    sky: ['#2a3a5e', '#34486e', '#40587e', '#50688e', '#64809e', '#7c98b0', '#98b0c2', '#b4c8d4'],
    sun: '#fff0d0', sunHi: '#ffffff', sunGlow: 'rgba(255,240,210,0.16)', hill: '#8a9ab4', house: '#5a6a84', win: '#ffd890',
    gap: ['#8ab4d8', '#1a2a44', '#c8e0f4'], fence: ['#5a3c22', '#8a6a48', '#f0f4f8'], beam: ['#4a3020', '#6a4a30', '#f0f4f8', '#4a3020', '#2e4a3a'],
    hay: ['#f0f4f8', '#ffffff'], cart: ['#5a3a20', '#7a5230', '#4a2e18'],
    tree: ['#4a3020', '#1e4232', '#285040', '#163428', '#f4f8ff'], bush: ['#e8f0f8', '#ffffff', '#a8c0d8'], post: ['#6a4a2c', '#f0f4f8'],
    glow: [255, 210, 140], lampC: '#ffd890', star: '#ffffff', bird: '#2a3448'
  },
  {
    name: 'Пустыня', need: 45000, coin: 1.8, spd: 1.12, kind: 3,
    fog: [210, 150, 100], road: [[196, 160, 110], [182, 146, 98]], grass: [[226, 190, 128], [214, 178, 116]], edge: [160, 120, 76], line: [230, 206, 160],
    sky: ['#3a2a5a', '#5a3466', '#7e3e66', '#a44e60', '#c86656', '#e0844e', '#eca252', '#f4c070'],
    sun: '#fff0a0', sunHi: '#ffffe0', sunGlow: 'rgba(255,230,140,0.22)', hill: '#b4744a', house: '#8a5434', win: '#ffe0a0',
    gap: ['#b48a5a', '#2a1810', '#d4aa76'], fence: ['#e8dcc4', '#d8ccb0', '#fff6e0'], beam: ['#6a4a2c', '#a8784a', '#c8946a', '#5a3a20', '#e0c890'],
    hay: ['#e0a060', '#f0c080'], cart: ['#8a5a32', '#a8784a', '#6a4426'],
    tree: ['#3e7a3a', '#4e8e42', '#5ea04e', '#2e5e2c', '#7ab866'], bush: ['#9a7a52', '#b49468', '#e05a5a'], post: ['#b49468', '#8a6a48'],
    glow: [255, 200, 110], lampC: '#ffd070', star: '#fff4d8', bird: '#4a2a24'
  },
  {
    name: 'Пепельные руины', need: 90000, coin: 2.2, spd: 1.18, kind: 4,
    fog: [90, 30, 30], road: [[70, 58, 62], [60, 50, 54]], grass: [[44, 30, 32], [36, 24, 26]], edge: [30, 20, 22], line: [220, 90, 40],
    sky: ['#140608', '#1e080a', '#2c0c0e', '#3e1010', '#561812', '#702414', '#8a3416', '#a44818'],
    sun: '#ff6a2a', sunHi: '#ffc070', sunGlow: 'rgba(255,90,40,0.22)', hill: '#2a0c0e', house: '#1a0608', win: '#ff7a2a',
    gap: ['#ff7a2a', '#3a0804', '#ffb050'], fence: ['#3a3236', '#5a5056', '#7a7076'], beam: ['#2a2226', '#4a4044', '#6a6064', '#1e181a', '#ff6a2a'],
    hay: ['#5a5056', '#6a6064'], cart: ['#3a3034', '#4e4448', '#2a2226'],
    tree: ['#4a4044', '#5a5056', '#6a6064', '#3a3236', '#8a8084'], bush: ['#3a3034', '#ff6a2a', '#ffb050'], post: ['#2a2226', '#ff6a2a'],
    glow: [255, 110, 50], lampC: '#ffa040', star: '#ff9a6a', bird: '#0e0404'
  }
];

export const routesOpen = (total) => { let n = 0; for (const r of ROUTES) if (total >= r.need) n++; return n; };

// магазин: стоимость следующего уровня
export const UPGRADES = [
  { id: 'boots', name: 'Сапоги-скороходы', ic: 'boot', cost: [60, 150, 350, 700, 1400], info: (l) => 'ПРЫЖОК ' + (8 + 2 * l) + ' С' },
  { id: 'magnet', name: 'Магнит', ic: 'magnet', cost: [100, 250, 500, 1000, 2000], info: (l) => (l ? 'МАГНИТ ' + (5 + 2 * l) + ' С' : 'НЕ КУПЛЕН') },
  { id: 'stam', name: 'Выносливость', ic: 'heart', cost: [120, 300, 700, 1500], info: (l) => 'ОРДА ' + (8 - l) + ' С' },
  { id: 'chance', name: 'Второй шанс', ic: 'star', cost: [200, 600, 1800], info: (l) => l + ' ЗА ЗАБЕГ' },
  { id: 'purse', name: 'Кошель', ic: 'coin', cost: [80, 200, 450, 900, 1800], info: (l) => '+' + 20 * l + '% МОНЕТ' }
];

// статистики: m (метры, сумма), mRun (за забег, максимум), gems, gemsRun, jump, duck, runs, clean (м без ошибок), power (бонусы)
// миссии — бесконечная цепочка, по три активных; номер растёт, цели растут
const MKINDS = [
  { stat: 'mRun', kind: 'max', base: 400, step: 60, text: (n) => 'ПРОБЕГИ ' + fmtKm(n) + ' ЗА ЗАБЕГ', ic: 'flag' },
  { stat: 'gemsRun', kind: 'max', base: 30, step: 6, text: (n) => 'СОБЕРИ ' + n + ' ИЗУМР. ЗА ЗАБЕГ', ic: 'coin' },
  { stat: 'jump', kind: 'sum', base: 20, step: 5, text: (n) => 'ПЕРЕПРЫГНИ ' + n + ' ПРЕПЯТСТВИЙ', ic: 'boot' },
  { stat: 'duck', kind: 'sum', base: 12, step: 4, text: (n) => 'ПРОСКОЛЬЗНИ ПОД ' + n + ' БАЛК.', ic: 'run' },
  { stat: 'm', kind: 'sum', base: 2000, step: 400, text: (n) => 'ПРОБЕГИ ВСЕГО ' + fmtKm(n), ic: 'route' },
  { stat: 'clean', kind: 'max', base: 250, step: 40, text: (n) => fmtKm(n) + ' БЕЗ СПОТЫКАНИЙ', ic: 'star' },
  { stat: 'power', kind: 'sum', base: 2, step: 1, text: (n) => 'ПОДБЕРИ ' + n + ' БОНУС.', ic: 'bolt' },
  { stat: 'gems', kind: 'sum', base: 80, step: 20, text: (n) => 'СОБЕРИ ВСЕГО ' + n + ' ИЗУМР.', ic: 'coin' }
];
export function missionDef(id) {
  const k = MKINDS[(id * 5 + (id >> 3)) % MKINDS.length];
  const goal = Math.round(k.base + k.step * id);
  return { stat: k.stat, kind: k.kind, goal, text: k.text(goal), ic: k.ic, pay: 25 + id * 6 };
}

export const DAILY = [
  { id: 'm', stat: 'm', kind: 'sum', goals: [1500, 2500, 4000], text: (n) => 'ПРОБЕГИ ' + fmtKm(n), icon: 'route', pay: (n) => Math.round(n / 15) },
  { id: 'gems', stat: 'gems', kind: 'sum', goals: [60, 100, 160], text: (n) => 'СОБЕРИ ' + n + ' ИЗУМРУДОВ', icon: 'coin', pay: (n) => n },
  { id: 'jump', stat: 'jump', kind: 'sum', goals: [25, 40, 60], text: (n) => 'ПЕРЕПРЫГНИ ' + n + ' ПРЕПЯТСТВИЙ', icon: 'boot', pay: (n) => n * 3 },
  { id: 'duck', stat: 'duck', kind: 'sum', goals: [15, 25, 40], text: (n) => 'ПРОСКОЛЬЗНИ ПОД ' + n + ' БАЛОК', icon: 'run', pay: (n) => n * 4 },
  { id: 'mRun', stat: 'mRun', kind: 'max', goals: [600, 900, 1300], text: (n) => 'ПРОБЕГИ ' + fmtKm(n) + ' ЗА ЗАБЕГ', icon: 'flag', pay: (n) => Math.round(n / 6) },
  { id: 'clean', stat: 'clean', kind: 'max', goals: [300, 500, 800], text: (n) => fmtKm(n) + ' БЕЗ СПОТЫКАНИЙ', icon: 'star', pay: (n) => Math.round(n / 4) },
  { id: 'runs', stat: 'runs', kind: 'sum', goals: [3, 5, 8], text: (n) => 'СДЕЛАЙ ' + n + ' ЗАБЕГОВ', icon: 'clock', pay: (n) => n * 25 },
  { id: 'power', stat: 'power', kind: 'sum', goals: [2, 3, 5], text: (n) => 'ПОДБЕРИ ' + n + ' БОНУСА', icon: 'bolt', pay: (n) => n * 40 }
];

// значки дистанций (альбом)
export const BADGES = [
  { t: 'total', m: 1000, name: 'Первый километр' }, { t: 'total', m: 5000, name: 'Пять вёрст' }, { t: 'total', m: 10000, name: 'Десятка' },
  { t: 'total', m: 21097, name: 'Полумарафон' }, { t: 'total', m: 42195, name: 'Марафон' }, { t: 'total', m: 100000, name: 'Сотня' },
  { t: 'total', m: 200000, name: 'Двести вёрст' }, { t: 'total', m: 300000, name: 'Триста' }, { t: 'total', m: 500000, name: 'Пятьсот' },
  { t: 'run', m: 500, name: 'Разминка' }, { t: 'run', m: 1000, name: 'Километр без остановки' }, { t: 'run', m: 2000, name: 'Два км' },
  { t: 'run', m: 5000, name: 'Пять км' }, { t: 'run', m: 10000, name: 'Быстрее ветра' }
];

export const fresh = () => ({
  v: 1, coins: 0, total: 0, best: 0, runs: 0, route: 0,
  up: { boots: 0, magnet: 0, stam: 0, chance: 0, purse: 0 },
  mis: { next: 3, done: 0, a: [{ id: 0, n: 0 }, { id: 1, n: 0 }, { id: 2, n: 0 }] },
  st: { gems: 0, jump: 0, duck: 0, power: 0 },
  daily: { key: '', t: [] }
});
