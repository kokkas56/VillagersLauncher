// «Ярмарочный тир»: аттракционы, ранги, призы, задания дня.

export const AUTHOR_MUL = 30;

export const STALLS = [
  { name: 'Тир', ic: 'target', hint: 'СТРЕЛЯЙ ПО МИШЕНЯМ' },
  { name: 'Топоры', ic: 'axe', hint: 'МЕТАЙ ТОПОРЫ В ЧУРКИ' },
  { name: 'Яблоки', ic: 'apple', hint: 'ЛОВИ ЯБЛОКИ КОРЗИНОЙ' }
];
// опыт аттракциона (сумма очков) для уровней 1..5
export const LV_XP = [0, 8000, 25000, 60000, 120000];
export const lvOf = (xp) => { let l = 1; for (let i = 1; i < LV_XP.length; i++) if (xp >= LV_XP[i]) l = i + 1; return l; };

// ранги по всем заработанным билетам
export const RANKS = [
  { name: 'Новичок', need: 0 }, { name: 'Стрелок', need: 300 }, { name: 'Меткий', need: 1200 }, { name: 'Снайпер', need: 3500 },
  { name: 'Мастер', need: 9000 }, { name: 'Чемпион', need: 20000 }, { name: 'Легенда', need: 40000 }
];
export const rankOf = (earned) => { let r = 0; for (let i = 0; i < RANKS.length; i++) if (earned >= RANKS[i].need) r = i; return r; };

// призы за билеты (альбом): цвет и форма значка на полке
export const PRIZES = [
  { name: 'Ленточка', cost: 30, c: '#4a7ad8', sh: 0 }, { name: 'Свистулька', cost: 60, c: '#e0b050', sh: 1 },
  { name: 'Леденец-петушок', cost: 90, c: '#e05050', sh: 2 }, { name: 'Глиняный кот', cost: 150, c: '#c08a60', sh: 3 },
  { name: 'Деревянный меч', cost: 220, c: '#a07040', sh: 4 }, { name: 'Бумажный змей', cost: 300, c: '#60c0e0', sh: 0 },
  { name: 'Плюшевый заяц', cost: 400, c: '#e8e0d0', sh: 3 }, { name: 'Колокольчик', cost: 520, c: '#f2c230', sh: 1 },
  { name: 'Губная гармошка', cost: 650, c: '#a8b0c0', sh: 4 }, { name: 'Расписная кружка', cost: 800, c: '#5aa060', sh: 2 },
  { name: 'Фонарик', cost: 1000, c: '#ffb050', sh: 1 }, { name: 'Плюшевый медведь', cost: 1300, c: '#8a5a32', sh: 3 },
  { name: 'Кукла-стрелок', cost: 1700, c: '#7a4a9a', sh: 4 }, { name: 'Серебряная стрела', cost: 2200, c: '#d8e0e8', sh: 0 },
  { name: 'Золотой кубок', cost: 3000, c: '#ffd34a', sh: 2 }, { name: 'Огромный медведь', cost: 4500, c: '#6a3a1a', sh: 3 }
];

export const DAILY = [
  { id: 'hits', stat: 'hits', kind: 'sum', goals: [80, 120, 180], text: (n) => 'ПОПАДИ ' + n + ' РАЗ', icon: 'target', pay: (n) => Math.round(n / 2) },
  { id: 'gold', stat: 'gold', kind: 'sum', goals: [2, 3, 5], text: (n) => 'СБЕЙ ' + n + ' ЗОЛОТЫХ', icon: 'star', pay: (n) => n * 30 },
  { id: 'score', stat: 'score', kind: 'max', goals: [1500, 2500, 4000], text: (n) => 'НАБЕРИ ' + n + ' ОЧКОВ ЗА РАУНД', icon: 'ticket', pay: (n) => Math.round(n / 25) },
  { id: 'combo', stat: 'combo', kind: 'max', goals: [10, 15, 25], text: (n) => 'СЕРИЯ ИЗ ' + n + ' ПОПАДАНИЙ', icon: 'bolt', pay: (n) => n * 4 },
  { id: 'rounds', stat: 'rounds', kind: 'sum', goals: [3, 5, 8], text: (n) => 'СЫГРАЙ ' + n + ' РАУНДОВ', icon: 'clock', pay: (n) => n * 15 },
  { id: 'axes', stat: 'axes', kind: 'sum', goals: [1, 2, 3], text: (n) => 'РАУНДОВ В «ТОПОРАХ»: ' + n, icon: 'axe', pay: (n) => n * 25 },
  { id: 'apples', stat: 'apples', kind: 'sum', goals: [40, 70, 100], text: (n) => 'ПОЙМАЙ ' + n + ' ЯБЛОК', icon: 'apple', pay: (n) => Math.round(n / 2) },
  { id: 'tickets', stat: 'tickets', kind: 'sum', goals: [100, 200, 300], text: (n) => 'ЗАРАБОТАЙ ' + n + ' БИЛЕТОВ', icon: 'ticket', pay: (n) => Math.round(n / 4) }
];

export const fresh = () => ({
  v: 1, tickets: 0, earned: 0, gold: 0, rounds: 0, best: 0, robin: 0, next: 0,
  xp: [0, 0, 0], lv: [1, 1, 1], prizes: [], hits: 0,
  daily: { key: '', t: [] }
});

// события месяца: праздничная мишень (жетон события), цель испытания, «небо» площади
export const EVENT_FAIR = {
  yule: { goal: 400, sky: 'snow', pts: 40 },
  maslenitsa: { goal: 400, sky: 'ribbons', pts: 40 },
  thaw: { goal: 400, sky: 'drops', pts: 40 },
  jest: { goal: 400, sky: 'confetti', pts: 40 },
  bloom: { goal: 400, sky: 'petals', pts: 40 },
  kupala: { goal: 400, sky: 'fireflies', pts: 40 },
  storm: { goal: 400, sky: 'rain', pts: 40 },
  starfall: { goal: 400, sky: 'meteors', pts: 40 },
  harvest: { goal: 400, sky: 'leaves', pts: 40 },
  pumpkin: { goal: 400, sky: 'bats', pts: 40 },
  fog: { goal: 400, sky: 'fog', pts: 40 },
  newyear: { goal: 400, sky: 'garland', pts: 40 }
};
// косметика мастерства: оперение стрел и лента на шляпе героя
export const FAIR_COS = [
  { name: 'Красное оперение', c: '#d84a4a' },
  { name: 'Синее оперение', c: '#4a7ad8' },
  { name: 'Зелёное оперение', c: '#4ac060' },
  { name: 'Золотое оперение', c: '#f2c230' },
  { name: 'Лиловое оперение', c: '#b07ae8' },
  { name: 'Белое оперение', c: '#f4f4f0' }
];
