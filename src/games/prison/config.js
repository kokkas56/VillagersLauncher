// «Побег» — таблица тюрем, предметов, артефактов, ежедневных заданий и наград.
// Всё, что отличает одну тюрьму от другой, описано здесь; код игры только читает таблицу.

export const W = 320;
export const H = 180;
export const FLOOR = 148; // линия пола (ноги)
export const U = 2; // масштаб человечков
export const ANVIL_X = 168;
export const SMITH_X = 150; // где стоит заключённый у наковальни
export const DIG_X = 112; // тайник с подкопом
export const CROUCH_X = DIG_X + 6; // где сидит заключённый, когда копает
export const CRATE_X = 214;
export const TUN_Y = 160; // верх горизонтального хода
export const TUN_H = 8;
export const SHAFT_LEN = TUN_Y + TUN_H - (FLOOR + 4);
export const TUN_LEN = SHAFT_LEN + (W - 2 - (DIG_X + 10)); // длина всего хода в пикселях
export const SEGS = 24; // пролётов (крепей) в одном подкопе
export const SHIFT = 180; // смена, секунд
export const AUTHOR_NEED = 42; // рабочих секунд копания в режиме автора (~1 мин реального времени)
export const FREE_NEED = 420; // «испытание» после свободы

// Часы реальной игры на каждую тюрьму (сумма 15 ч) и доля копания в реальном времени,
// измеренная «разумным» ботом (копает, когда не видят, кует остальное время, иногда попадается).
export const HOURS = [0.4, 0.6, 0.9, 1.1, 1.4, 1.6, 1.9, 2.2, 2.4, 2.5];
export const DIG_SHARE = [0.52, 0.42, 0.42, 0.38, 0.36, 0.38, 0.36, 0.33, 0.32, 0.3];
// какой лопатой игрок обычно копает в этой тюрьме (множитель скорости)
export const EXPECT_TOOL = [1, 1.1, 1.1, 1.22, 1.22, 1.36, 1.36, 1.52, 1.52, 1.7];
export const needOf = (p) => Math.round(HOURS[p - 1] * 3600 * DIG_SHARE[p - 1] * EXPECT_TOOL[p - 1]);

// Лопаты — постоянные улучшения
export const SHOVELS = [
  { name: 'Ложка', mul: 1, cost: 0 },
  { name: 'Совок', mul: 1.1, cost: 60 },
  { name: 'Лопата', mul: 1.22, cost: 220 },
  { name: 'Стальная', mul: 1.36, cost: 600 },
  { name: 'Гномья', mul: 1.52, cost: 1400 },
  { name: 'Мифрил', mul: 1.7, cost: 3000 }
];

// Расходники: клавиши 1–5
export const ITEMS = [
  { id: 'bone', name: 'Кость', cost: 12, max: 9, hint: 'Собака/зверь грызёт 25 с' },
  { id: 'bottle', name: 'Бутыль', cost: 18, max: 9, hint: 'Стражник выпьет и задремлет' },
  { id: 'cloak', name: 'Плащ', cost: 26, max: 9, hint: 'Магия не видит 20 с' },
  { id: 'flask', name: 'Фляга', cost: 8, max: 9, hint: 'Жара и усталость сброшены' },
  { id: 'prop', name: 'Подпорка', cost: 14, max: 9, hint: 'Спасёт ход от обвала' }
];

// Тюрьмы. guards: kind look/x/range/спд/обзор; beasts — звери-нюхачи; seers — летающие наблюдатели;
// wards — руны; hazards: heat (жара), slip (лёд), quake (обвалы), sway (качка).
export const PRISONS = [
  null,
  {
    n: 1, name: 'Деревенская кутузка', short: 'Кутузка', warden: 'Стражник Митяй',
    pal: { wall: '#3a3640', wall2: '#2a2730', brick: '#43404a', brick2: '#322f38', floor: '#4a4450', floor2: '#5c5662', earth: '#3e2c20', earth2: '#4a3626', tun: '#140c0c', beam: '#6a4a2c', fire: '#ff8a30', fire2: '#ffe080', glow: [255, 150, 60] },
    guards: [{ look: 'town', x: 236, min: 26, max: 296, spd: 20, vis: 92, sus: 0.1 }],
    beasts: [], seers: [], wards: [], hazards: {},
    ambient: 'rat'
  },
  {
    n: 2, name: 'Каменная крепость', short: 'Крепость', warden: 'Латники и псарь',
    pal: { wall: '#56585e', wall2: '#3e4046', brick: '#64666c', brick2: '#4a4c52', floor: '#5a5650', floor2: '#6e6a62', earth: '#463a30', earth2: '#56483a', tun: '#160e0c', beam: '#5e4630', fire: '#ff9a40', fire2: '#fff0a0', glow: [255, 160, 70] },
    guards: [
      { look: 'knight', x: 250, min: 30, max: 296, spd: 22, vis: 96, sus: 0.12 },
      { look: 'houndman', x: 70, post: true, min: 60, max: 80, spd: 0, vis: 70, sus: 0.22 }
    ],
    beasts: [{ kind: 'dog', x: 200, min: 130, max: 290, spd: 34, rad: 30 }],
    seers: [], wards: [], hazards: {},
    ambient: 'banner'
  },
  {
    n: 3, name: 'Болотный острог', short: 'Острог', warden: 'Надсмотрщик с арбалетом',
    pal: { wall: '#3c3a26', wall2: '#2c2a1a', brick: '#55502e', brick2: '#47422a', floor: '#3e4428', floor2: '#4e5632', earth: '#2e2a1a', earth2: '#3a3622', tun: '#0e0c06', beam: '#5a4a2a', fire: '#ffa040', fire2: '#fff0a0', glow: [230, 190, 90] },
    guards: [{ look: 'swamp', x: 240, min: 30, max: 296, spd: 22, vis: 104, sus: 0.13 }],
    beasts: [{ kind: 'croc', x: 70, min: 60, max: 150, spd: 12, rad: 34, pond: true }],
    seers: [], wards: [], hazards: {},
    ambient: 'swamp'
  },
  {
    n: 4, name: 'Пустынная яма', short: 'Яма', warden: 'Смотритель с кнутом',
    pal: { wall: '#b8884e', wall2: '#9a6e3a', brick: '#c89a5c', brick2: '#a87a44', floor: '#c8a464', floor2: '#dcb878', earth: '#8a6438', earth2: '#9e7646', tun: '#2a1a0c', beam: '#6a4a2a', fire: '#ff8a30', fire2: '#ffe080', glow: [255, 190, 110] },
    guards: [
      { look: 'desert', x: 220, min: 40, max: 290, spd: 18, vis: 110, sus: 0.13, ledge: 58 },
      { look: 'desert2', x: 270, min: 200, max: 300, spd: 16, vis: 84, sus: 0.16 }
    ],
    beasts: [{ kind: 'scorpion', x: 150, min: 70, max: 220, spd: 20, rad: 24 }, { kind: 'scorpion', x: 260, min: 160, max: 300, spd: 18, rad: 24 }],
    seers: [], wards: [], hazards: { heat: 1 },
    ambient: 'sun'
  },
  {
    n: 5, name: 'Ледяная цитадель', short: 'Цитадель', warden: 'Северный страж',
    pal: { wall: '#8ab0cc', wall2: '#6a90ae', brick: '#a6c8e0', brick2: '#7ca2c0', floor: '#c8e4f4', floor2: '#e8f6ff', earth: '#5a7088', earth2: '#6e86a0', tun: '#1a2232', beam: '#7a6a5a', fire: '#ffa860', fire2: '#fff0c0', glow: [255, 180, 120] },
    guards: [
      { look: 'north', x: 240, min: 30, max: 296, spd: 22, vis: 104, sus: 0.14 },
      { look: 'north2', x: 60, post: true, min: 50, max: 70, spd: 0, vis: 78, sus: 0.2 }
    ],
    beasts: [{ kind: 'wolf', x: 220, min: 120, max: 296, spd: 30, rad: 32 }],
    seers: [], wards: [], hazards: { slip: 1 },
    ambient: 'snow'
  },
  {
    n: 6, name: 'Пиратский бриг', short: 'Бриг', warden: 'Боцман и юнга',
    pal: { wall: '#5a3e26', wall2: '#46301c', brick: '#6a4a2e', brick2: '#523820', floor: '#7a5634', floor2: '#8e6840', earth: '#3a2a1a', earth2: '#2a3a44', tun: '#120c08', beam: '#8a6a40', fire: '#ffa040', fire2: '#ffe8a0', glow: [255, 170, 80] },
    guards: [
      { look: 'pirate', x: 240, min: 30, max: 296, spd: 24, vis: 100, sus: 0.15 },
      { look: 'cabin', x: 80, min: 40, max: 200, spd: 26, vis: 70, sus: 0.18 }
    ],
    beasts: [{ kind: 'rat', x: 200, min: 120, max: 300, spd: 40, rad: 22 }, { kind: 'rat', x: 90, min: 40, max: 200, spd: 40, rad: 22 }],
    seers: [{ kind: 'parrot', x: 200, y: 54, rad: 48 }],
    wards: [], hazards: { sway: 1 },
    ambient: 'sea'
  },
  {
    n: 7, name: 'Гномья шахта', short: 'Шахта', warden: 'Гном-надзиратель',
    pal: { wall: '#3a3430', wall2: '#2a2522', brick: '#4a423c', brick2: '#342e2a', floor: '#4e463e', floor2: '#5e554c', earth: '#2e2620', earth2: '#3a3028', tun: '#0c0806', beam: '#7a5a34', fire: '#ff7020', fire2: '#ffd060', glow: [255, 130, 50] },
    guards: [
      { look: 'dwarf', x: 240, min: 30, max: 296, spd: 18, vis: 120, sus: 0.15 },
      { look: 'dwarf2', x: 60, min: 30, max: 200, spd: 20, vis: 90, sus: 0.16 }
    ],
    beasts: [], seers: [{ kind: 'bat', x: 200, y: 40, rad: 0 }],
    wards: [], hazards: { quake: 1 },
    ambient: 'mine'
  },
  {
    n: 8, name: 'Башня магов', short: 'Башня', warden: 'Каменный голем',
    pal: { wall: '#3a2e4e', wall2: '#2a2040', brick: '#4a3c62', brick2: '#34284a', floor: '#4a3e5e', floor2: '#5e4e76', earth: '#2a2232', earth2: '#382c42', tun: '#0e0a14', beam: '#6a5a7a', fire: '#c060ff', fire2: '#f0c0ff', glow: [190, 110, 255] },
    guards: [{ look: 'golem', x: 240, min: 30, max: 296, spd: 13, vis: 130, sus: 0.12 }],
    beasts: [],
    seers: [{ kind: 'wisp', x: 200, y: 70, rad: 36 }, { kind: 'wisp', x: 90, y: 90, rad: 36 }],
    wards: [{ x: 60, per: 9, off: 0 }, { x: 250, per: 11, off: 4.5 }], hazards: {},
    ambient: 'arcane'
  },
  {
    n: 9, name: 'Царство теней', short: 'Тени', warden: 'Тюремщик-тень',
    pal: { wall: '#1e1a2a', wall2: '#141020', brick: '#2a2438', brick2: '#1a1626', floor: '#2a2436', floor2: '#3a3248', earth: '#16121e', earth2: '#201a2a', tun: '#050308', beam: '#4a405a', fire: '#60a0ff', fire2: '#d0f0ff', glow: [110, 160, 255] },
    guards: [{ look: 'shade', x: 240, min: 30, max: 296, spd: 24, vis: 110, sus: 0.16 }],
    beasts: [],
    seers: [{ kind: 'ghost', x: 220, y: 90, rad: 42, through: 1 }, { kind: 'ghost', x: 60, y: 70, rad: 42, through: 1 }],
    wards: [], hazards: {},
    ambient: 'shadow'
  },
  {
    n: 10, name: 'Последний зал', short: 'Зал', warden: 'Рыцари зала',
    pal: { wall: '#4a2a2a', wall2: '#361e1e', brick: '#5a3434', brick2: '#422626', floor: '#6a5a40', floor2: '#8a7650', earth: '#2e2218', earth2: '#3a2c20', tun: '#0c0806', beam: '#c8a040', fire: '#ffb040', fire2: '#fff0b0', glow: [255, 200, 110] },
    guards: [
      { look: 'royal', x: 240, min: 30, max: 296, spd: 24, vis: 112, sus: 0.16 },
      { look: 'royal', x: 50, post: true, min: 40, max: 60, spd: 0, vis: 86, sus: 0.22 }
    ],
    beasts: [],
    seers: [{ kind: 'ghost', x: 200, y: 80, rad: 38, through: 1 }],
    wards: [{ x: 80, per: 12, off: 2 }, { x: 260, per: 13, off: 8 }], hazards: {},
    ambient: 'hall'
  }
];

// Награды лаунчера (id из rewards.js) — за побег из тюрьмы N
export const REWARD_AT = {
  3: ['prison_badge_digger'],
  4: ['prison_scene_dungeon'],
  5: ['prison_music_chains'],
  6: ['prison_theme_steel'],
  7: ['prison_frame_bars'],
  8: ['prison_scene_arcane'],
  9: ['prison_title_elusive'],
  10: ['prison_cape_runaway', 'prison_badge_free']
};

// Артефакты: по 3 в каждой тюрьме. shape — форма из ART_SHAPES, c — [основной, светлый, тёмный]
export const ARTEFACTS = [
  { p: 1, name: 'Ржавый ключ', shape: 'key', c: ['#a8643a', '#d08a50', '#6a3a1e'] },
  { p: 1, name: 'Старая подкова', shape: 'horseshoe', c: ['#8a929e', '#c0c8d4', '#4a5058'] },
  { p: 1, name: 'Медный грош', shape: 'coin', c: ['#c87a3a', '#f0b070', '#7a4418'] },
  { p: 2, name: 'Наконечник стрелы', shape: 'arrow', c: ['#9aa4b0', '#dce4ec', '#5a6470'] },
  { p: 2, name: 'Перстень коменданта', shape: 'ring', c: ['#e0b040', '#fff0a0', '#c02030'] },
  { p: 2, name: 'Ошейник пса', shape: 'collar', c: ['#7a4a2a', '#c8a050', '#4a2a14'] },
  { p: 3, name: 'Зуб крокодила', shape: 'tooth', c: ['#e8e0c8', '#ffffff', '#a89878'] },
  { p: 3, name: 'Болотная жемчужина', shape: 'pearl', c: ['#c8e0d0', '#ffffff', '#6a8a70'] },
  { p: 3, name: 'Лягушачий идол', shape: 'idol', c: ['#4a8a3a', '#8ad070', '#24481c'] },
  { p: 4, name: 'Золотой скарабей', shape: 'beetle', c: ['#e0b030', '#40a0c0', '#7a5a10'] },
  { p: 4, name: 'Песочные часы', shape: 'hourglass', c: ['#a87a44', '#f0d090', '#5a3a1a'] },
  { p: 4, name: 'Жало скорпиона', shape: 'stinger', c: ['#a03a20', '#e07050', '#4a1a10'] },
  { p: 5, name: 'Вечный лёд', shape: 'crystal', c: ['#8ad8f0', '#e8ffff', '#3a7aa0'] },
  { p: 5, name: 'Снежный оберег', shape: 'flake', c: ['#d0ecff', '#ffffff', '#6a9ac0'] },
  { p: 5, name: 'Волчий клык', shape: 'tooth', c: ['#d8dce4', '#ffffff', '#7a8494'] },
  { p: 6, name: 'Компас', shape: 'compass', c: ['#c8a040', '#f0f0e0', '#c02020'] },
  { p: 6, name: 'Пиратский дублон', shape: 'coin', c: ['#f0c030', '#fff0a0', '#9a7010'] },
  { p: 6, name: 'Письмо в бутылке', shape: 'bottle', c: ['#4a9a6a', '#f0e8c8', '#245a3a'] },
  { p: 7, name: 'Гномья кирка', shape: 'pick', c: ['#9aa4b0', '#e0e8f0', '#6a4a2a'] },
  { p: 7, name: 'Самородок', shape: 'nugget', c: ['#f0c030', '#fff4b0', '#a07010'] },
  { p: 7, name: 'Руна гномов', shape: 'rune', c: ['#6a6a74', '#60d0ff', '#3a3a44'] },
  { p: 8, name: 'Древний свиток', shape: 'scroll', c: ['#e8d8a8', '#fff8e0', '#a08a50'] },
  { p: 8, name: 'Кристалл маны', shape: 'crystal', c: ['#a060f0', '#f0d0ff', '#5a2a9a'] },
  { p: 8, name: 'Совиный глаз', shape: 'orb', c: ['#f0c040', '#fff8c0', '#2a2010'] },
  { p: 9, name: 'Призрачная свеча', shape: 'candle', c: ['#c8d0f0', '#80c0ff', '#5a6080'] },
  { p: 9, name: 'Чёрное перо', shape: 'feather', c: ['#3a3450', '#8a80b0', '#16121e'] },
  { p: 9, name: 'Осколок тьмы', shape: 'shard', c: ['#4a2a7a', '#b080ff', '#1a0a2a'] },
  { p: 10, name: 'Ключ-корона', shape: 'crown', c: ['#f0c030', '#fff4b0', '#c02030'] },
  { p: 10, name: 'Печать Кокка', shape: 'seal', c: ['#c02a2a', '#ff8070', '#6a1010'] },
  { p: 10, name: 'Перо автора', shape: 'quill', c: ['#f0f0f0', '#ffd34a', '#8a8a9a'] }
];

// Ежедневные задания: k — что считаем, g — цели по сложности, short — подпись в HUD
export const DAILY = [
  { k: 'dig', short: 'КОПАЙ', g: [90, 150, 240], unit: 'с', fav: 30 },
  { k: 'perf', short: 'ТОЧНО', g: [12, 20, 32], fav: 30 },
  { k: 'ord', short: 'ЗАКАЗ', g: [6, 10, 16], fav: 25 },
  { k: 'clean', short: 'ЧИСТО', g: [1, 1, 2], fav: 40 },
  { k: 'seg', short: 'КРЕПЬ', g: [1, 2, 3], fav: 35 },
  { k: 'item', short: 'ХИТРО', g: [1, 2, 3], fav: 25 },
  { k: 'combo', short: 'СЕРИЯ', g: [5, 8, 12], fav: 30 }
];
