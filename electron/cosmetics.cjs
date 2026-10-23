// АВТОГЕНЕРАЦИЯ из src/games/cosmetics.js, rewards.js (node scripts/sync-cosmetics.cjs) — не править руками.
'use strict';

// ===== cosmetics.js =====
// Косметика профиля и лобби: рамки, темы, декорации меню, значки, фоны лобби отряда.
// Открываются сами — по мастерству в мини-играх, событиям месяца, игре с друзьями (условие cond).
// Без import: scripts/sync-cosmetics.cjs собирает из этого файла и rewards.js electron/cosmetics.cjs для главного процесса.

const MG_GAMES = ['prison', 'fishing', 'defense', 'runner', 'fair', 'mine'];
const MG_NAMES = { prison: 'Побег', fishing: 'Рыбалка', defense: 'Защита деревни', runner: 'Побег от зомби', fair: 'Ярмарочный тир', mine: 'Вагонетка' };

// уровень мастерства по опыту (как в главном процессе)
const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 120));

// cond: { mastery: [игра, уровень] } | { masteryAll: уровень } | { masteryTotal: сумма уровней } | { anyReward: [id…] }
//       | { events: сколько значков событий } | { rewards: сколько наград всего } | { party: совместных игр } | { friends: друзей }
const COSMETIC_REWARDS = [
  // ---- фоны лобби отряда (два базовых — бесплатно, см. LOBBY_BGS) ----
  { id: 'lobby_pier', game: 'lobby', kind: 'lobby', lobby: 'pier', name: 'Лобби «Рыбацкий причал»', how: 'Мастерство «Рыбалки» 5', cond: { mastery: ['fishing', 5] } },
  { id: 'lobby_mineshaft', game: 'lobby', kind: 'lobby', lobby: 'mineshaft', name: 'Лобби «Заброшенная шахта»', how: 'Мастерство «Вагонетки» 5', cond: { mastery: ['mine', 5] } },
  { id: 'lobby_fairground', game: 'lobby', kind: 'lobby', lobby: 'fairground', name: 'Лобби «Ночная ярмарка»', how: 'Мастерство «Ярмарочного тира» 5', cond: { mastery: ['fair', 5] } },
  { id: 'lobby_palisade', game: 'lobby', kind: 'lobby', lobby: 'palisade', name: 'Лобби «Частокол на закате»', how: 'Мастерство «Защиты деревни» 5', cond: { mastery: ['defense', 5] } },
  { id: 'lobby_nightroad', game: 'lobby', kind: 'lobby', lobby: 'nightroad', name: 'Лобби «Ночная дорога»', how: 'Мастерство «Побега от зомби» 5', cond: { mastery: ['runner', 5] } },
  { id: 'lobby_prisonyard', game: 'lobby', kind: 'lobby', lobby: 'prisonyard', name: 'Лобби «Тюремный двор»', how: 'Пройди все 10 тюрем «Побега»', cond: { anyReward: ['prison_badge_free'] } },
  { id: 'lobby_winterfair', game: 'lobby', kind: 'lobby', lobby: 'winterfair', name: 'Лобби «Зимняя ярмарка»', how: 'Значок события «Святки» или «Новый год»', cond: { anyReward: ['ev_yule', 'ev_newyear'] } },
  { id: 'lobby_harvest', game: 'lobby', kind: 'lobby', lobby: 'harvest', name: 'Лобби «Праздник урожая»', how: 'Значок события «Урожай» или «Ночь тыкв»', cond: { anyReward: ['ev_harvest', 'ev_pumpkin'] } },
  { id: 'lobby_starfall', game: 'lobby', kind: 'lobby', lobby: 'starfall', name: 'Лобби «Звездопад над холмом»', how: 'Значок события «Звездопад»', cond: { anyReward: ['ev_starfall'] } },
  { id: 'lobby_campfire', game: 'lobby', kind: 'lobby', lobby: 'campfire', name: 'Лобби «Костёр друзей»', how: '10 совместных игр отрядом', cond: { party: 10 } },
  { id: 'lobby_magetower', game: 'lobby', kind: 'lobby', lobby: 'magetower', name: 'Лобби «Башня магов»', how: 'Суммарное мастерство 30', cond: { masteryTotal: 30 } },
  { id: 'lobby_hall', game: 'lobby', kind: 'lobby', lobby: 'hall', name: 'Лобби «Зал чемпионов»', how: 'Стань чемпионом турнира недели', cond: { anyReward: ['week_champion'] } },
  // ---- декорации главного меню ----
  { id: 'decor_lanterns', game: 'lobby', kind: 'decor', decor: 'lanterns', name: 'Декорация «Фонарики»', how: 'Мастерство в любых трёх играх по 3', cond: { masteryCount: [3, 3] } },
  { id: 'decor_flags', game: 'lobby', kind: 'decor', decor: 'flags', name: 'Декорация «Флажки»', how: 'Сыграй отрядом 3 раза', cond: { party: 3 } },
  { id: 'decor_garland', game: 'lobby', kind: 'decor', decor: 'garland', name: 'Декорация «Гирлянда»', how: 'Значок события «Новый год»', cond: { anyReward: ['ev_newyear'] } },
  { id: 'decor_pumpkins', game: 'lobby', kind: 'decor', decor: 'pumpkins', name: 'Декорация «Тыквы»', how: 'Значок события «Ночь тыкв»', cond: { anyReward: ['ev_pumpkin'] } },
  { id: 'decor_snowfall', game: 'lobby', kind: 'decor', decor: 'snowfall', name: 'Декорация «Снегопад»', how: 'Значок события «Святки»', cond: { anyReward: ['ev_yule'] } },
  { id: 'decor_fireflies', game: 'lobby', kind: 'decor', decor: 'fireflies', name: 'Декорация «Светлячки»', how: 'Значки трёх событий месяца', cond: { events: 3 } },
  { id: 'decor_petals', game: 'lobby', kind: 'decor', decor: 'petals', name: 'Декорация «Лепестки сакуры»', how: 'Значок события «Цветение»', cond: { anyReward: ['ev_bloom'] } },
  // ---- рамки аватарки ----
  { id: 'frame_vines', game: 'style', kind: 'frame', frame: 'vines', name: 'Рамка «Лоза»', how: 'Мастерство «Рыбалки» или «Ярмарочного тира» 4', cond: { anyMastery: [['fishing', 'fair'], 4] } },
  { id: 'frame_ember', game: 'style', kind: 'frame', frame: 'ember', name: 'Рамка «Угли»', how: 'Мастерство «Защиты деревни» 6', cond: { mastery: ['defense', 6] } },
  { id: 'frame_ice', game: 'style', kind: 'frame', frame: 'ice', name: 'Рамка «Иней»', how: 'Значок события «Святки», «Оттепель» или «Туманы»', cond: { anyReward: ['ev_yule', 'ev_thaw', 'ev_fog'] } },
  { id: 'frame_runes', game: 'style', kind: 'frame', frame: 'runes', name: 'Рамка «Руны»', how: 'Мастерство «Вагонетки» 6', cond: { mastery: ['mine', 6] } },
  { id: 'frame_gold', game: 'style', kind: 'frame', frame: 'gold', name: 'Рамка «Золото»', how: 'Суммарное мастерство 20', cond: { masteryTotal: 20 } },
  { id: 'frame_friends', game: 'style', kind: 'frame', frame: 'friends', name: 'Рамка «Дружба»', how: 'Добавь 3 друзей', cond: { friends: 3 } },
  { id: 'frame_star', game: 'style', kind: 'frame', frame: 'star', name: 'Рамка «Звёздная»', how: 'Значки шести событий месяца', cond: { events: 6 } },
  { id: 'frame_rainbow', game: 'style', kind: 'frame', frame: 'rainbow', name: 'Рамка «Радуга»', how: 'Мастерство во всех шести играх по 6', cond: { masteryAll: 6 } },
  // ---- темы (лаунчер и главное меню игры) ----
  { id: 'theme_forest', game: 'style', kind: 'theme', theme: 'forest', name: 'Тема «Лес»', how: 'Мастерство «Побега от зомби» 4', cond: { mastery: ['runner', 4] } },
  { id: 'theme_dusk', game: 'style', kind: 'theme', theme: 'dusk', name: 'Тема «Сумерки»', how: 'Мастерство «Побега» 5', cond: { mastery: ['prison', 5] } },
  { id: 'theme_cherry', game: 'style', kind: 'theme', theme: 'cherry', name: 'Тема «Вишня»', how: 'Значок события «Цветение» или «Шутник»', cond: { anyReward: ['ev_bloom', 'ev_jest'] } },
  { id: 'theme_honey', game: 'style', kind: 'theme', theme: 'honey', name: 'Тема «Мёд»', how: 'Сыграй отрядом 5 раз', cond: { party: 5 } },
  { id: 'theme_frost', game: 'style', kind: 'theme', theme: 'frost', name: 'Тема «Мороз»', how: 'Значки четырёх событий месяца', cond: { events: 4 } },
  { id: 'theme_royal', game: 'style', kind: 'theme', theme: 'royal', name: 'Тема «Королевская»', how: 'Суммарное мастерство 40', cond: { masteryTotal: 40 } },
  // ---- значки ----
  { id: 'badge_company', game: 'style', kind: 'badge', name: 'Компанейский', icon: 'hands', color: '#ffb070', how: 'Сыграй отрядом с друзьями', cond: { party: 1 } },
  { id: 'badge_soul', game: 'style', kind: 'badge', name: 'Душа компании', icon: 'campfire', color: '#ff8a3a', how: '25 совместных игр отрядом', cond: { party: 25 } },
  { id: 'badge_villagefriend', game: 'style', kind: 'badge', name: 'Друг деревни', icon: 'heart', color: '#ff7a8a', how: 'Добавь 5 друзей', cond: { friends: 5 } },
  { id: 'badge_allhands', game: 'style', kind: 'badge', name: 'Мастер на все руки', icon: 'compass', color: '#7ad0a0', how: 'Мастерство во всех шести играх по 3', cond: { masteryAll: 3 } },
  { id: 'badge_veteran', game: 'style', kind: 'badge', name: 'Ветеран', icon: 'medal', color: '#d0a050', how: 'Суммарное мастерство 50', cond: { masteryTotal: 50 } },
  { id: 'badge_chronicler', game: 'style', kind: 'badge', name: 'Летописец', icon: 'scroll', color: '#e8d8a8', how: 'Значки восьми событий месяца', cond: { events: 8 } },
  { id: 'badge_collector', game: 'style', kind: 'badge', name: 'Коллекционер', icon: 'gem', color: '#b88cff', how: 'Собери 40 наград', cond: { rewards: 40 } }
];

// фоны лобби: id → как выглядит (для игры — только id и название), free — открыт сразу
const LOBBY_BGS = [
  { id: 'meadow', name: 'Летний луг', free: true, sky: ['#7ec8ff', '#d8f0ff'], ground: '#5fae4a' },
  { id: 'square', name: 'Деревенская площадь', free: true, sky: ['#f0b070', '#ffe0b0'], ground: '#a08060' },
  { id: 'pier', name: 'Рыбацкий причал', sky: ['#4a90c8', '#bfe4f4'], ground: '#2a6a8a' },
  { id: 'mineshaft', name: 'Заброшенная шахта', sky: ['#1a1410', '#3a2c20'], ground: '#4a3a2a' },
  { id: 'fairground', name: 'Ночная ярмарка', sky: ['#1a1440', '#5a2a6a'], ground: '#3a2a3a' },
  { id: 'palisade', name: 'Частокол на закате', sky: ['#c05030', '#f0a060'], ground: '#5a4020' },
  { id: 'nightroad', name: 'Ночная дорога', sky: ['#0a1020', '#2a3a5a'], ground: '#2a2a2a' },
  { id: 'prisonyard', name: 'Тюремный двор', sky: ['#5a6070', '#9aa0aa'], ground: '#6a6a6a' },
  { id: 'winterfair', name: 'Зимняя ярмарка', sky: ['#20304a', '#8ab0d0'], ground: '#e8f0f8' },
  { id: 'harvest', name: 'Праздник урожая', sky: ['#e08a3a', '#ffd890'], ground: '#b08030' },
  { id: 'starfall', name: 'Звездопад над холмом', sky: ['#080820', '#30306a'], ground: '#2a4a2a' },
  { id: 'campfire', name: 'Костёр друзей', sky: ['#100a14', '#3a2030'], ground: '#3a2a1a' },
  { id: 'magetower', name: 'Башня магов', sky: ['#2a1a4a', '#7a5ab0'], ground: '#4a4060' },
  { id: 'hall', name: 'Зал чемпионов', sky: ['#4a3010', '#c09040'], ground: '#6a4a20' }
];
const FREE_LOBBY = LOBBY_BGS.filter((b) => b.free).map((b) => b.id);

const DECOR = {
  lanterns: 'Фонарики', garland: 'Гирлянда', flags: 'Флажки', pumpkins: 'Тыквы', snowfall: 'Снегопад', fireflies: 'Светлячки', petals: 'Лепестки сакуры'
};

// рамки аватарки: как рисовать (и в лаунчере, и в лобби игры). colors[0] — внутренний, colors[1] — внешний
const FRAMES = {
  bars: { name: 'Решётка', style: 'bars', colors: ['#59606a', '#2a2e34'] },
  palisade: { name: 'Частокол', style: 'double', colors: ['#8a5a2a', '#4a2e14'] },
  target: { name: 'Мишень', style: 'rings', colors: ['#e05050', '#ffffff'] },
  vines: { name: 'Лоза', style: 'dots', colors: ['#5aa040', '#2a5a20'] },
  ember: { name: 'Угли', style: 'glow', colors: ['#ff7a30', '#7a2010'] },
  ice: { name: 'Иней', style: 'glow', colors: ['#bfe8ff', '#4a90c0'] },
  runes: { name: 'Руны', style: 'dots', colors: ['#8fd0ff', '#2a3a6a'] },
  gold: { name: 'Золото', style: 'double', colors: ['#ffd34a', '#a07010'] },
  friends: { name: 'Дружба', style: 'rings', colors: ['#ff9a70', '#ffd0a0'] },
  star: { name: 'Звёздная', style: 'glow', colors: ['#c8b0ff', '#4a3a8a'] },
  rainbow: { name: 'Радуга', style: 'rainbow', colors: ['#ff6a6a', '#6a8aff'] }
};

// дополнительные темы (цвета лаунчера и главного меню игры)
const EXTRA_THEMES = {
  forest: { '--gold': '#c8d870', '--gold-2': '#e8f0a8', '--emerald': '#4aa040', '--emerald-2': '#8ad070', '--emerald-d': '#1e4a18' },
  dusk: { '--gold': '#d898c8', '--gold-2': '#f0c8e8', '--emerald': '#8a6ad0', '--emerald-2': '#b8a0f0', '--emerald-d': '#36285a' },
  cherry: { '--gold': '#ff9ab8', '--gold-2': '#ffd0e0', '--emerald': '#d04a6a', '--emerald-2': '#f08aa0', '--emerald-d': '#5a1a2a' },
  honey: { '--gold': '#ffc040', '--gold-2': '#ffe090', '--emerald': '#e09020', '--emerald-2': '#f8c060', '--emerald-d': '#5a3a08' },
  frost: { '--gold': '#d0f0ff', '--gold-2': '#f0fbff', '--emerald': '#60b8e8', '--emerald-2': '#a0dcff', '--emerald-d': '#1a4a6a' },
  royal: { '--gold': '#ffd34a', '--gold-2': '#fff0a0', '--emerald': '#6a4ad0', '--emerald-2': '#a08af0', '--emerald-d': '#2a1a5a' }
};

const EXTRA_BADGE_PIX = {
  hands: ['.......', '##...##', '#O#.#O#', '.#O#O#.', '..#O#..', '...#...', '.......'],
  campfire: ['...#...', '..#O#..', '.#OOO#.', '..#O#..', '#.###.#', '.#####.', '#.#.#.#'],
  heart: ['.......', '.##.##.', '#OO#OO#', '#OOOOO#', '.#OOO#.', '..#O#..', '...#...'],
  compass: ['..###..', '.#..O#.', '#..O..#', '#.O#O.#', '#..O..#', '.#O..#.', '..###..'],
  medal: ['#.....#', '.#...#.', '..#.#..', '..###..', '.#OOO#.', '.#OOO#.', '..###..'],
  scroll: ['.#####.', '#OOOOO#', '.#O#O#.', '.#OOO#.', '.#O#O#.', '#OOOOO#', '.#####.'],
  gem: ['.#####.', '#O#O#O#', '#######', '.#####.', '..###..', '...#...', '.......']
};

const has = (p, id) => !!(p.rewards && p.rewards[id]);
// уровни мастерства по играм из профиля
function masteryLevels(p) {
  const out = {};
  for (const g of MG_GAMES) out[g] = levelOf((p.mastery || {})[g] || 0);
  return out;
}
// уровень игрока: 1 + сумма уровней мастерства во всех мини-играх
function accountLevel(p) {
  const m = masteryLevels(p || {});
  return 1 + Object.values(m).reduce((a, b) => a + b, 0);
}
// выполнено ли условие награды для профиля p ({ rewards, mastery, stats: { party, friends } })
function condMet(cond, p) {
  if (!cond) return false;
  p = p || {};
  const m = masteryLevels(p);
  const st = p.stats || {};
  if (cond.mastery) return (m[cond.mastery[0]] || 0) >= cond.mastery[1];
  if (cond.anyMastery) return cond.anyMastery[0].some((g) => (m[g] || 0) >= cond.anyMastery[1]);
  if (cond.masteryAll) return MG_GAMES.every((g) => m[g] >= cond.masteryAll);
  if (cond.masteryCount) return MG_GAMES.filter((g) => m[g] >= cond.masteryCount[1]).length >= cond.masteryCount[0];
  if (cond.masteryTotal) return Object.values(m).reduce((a, b) => a + b, 0) >= cond.masteryTotal;
  if (cond.anyReward) return cond.anyReward.some((id) => has(p, id));
  if (cond.events) return Object.keys(p.rewards || {}).filter((id) => id.startsWith('ev_')).length >= cond.events;
  if (cond.rewards) return Object.keys(p.rewards || {}).length >= cond.rewards;
  if (cond.party) return (Number(st.party) || 0) >= cond.party;
  if (cond.friends) return (Number(st.friends) || 0) >= cond.friends;
  return false;
}
// какие награды с условием уже заслужены, но ещё не выданы
function newlyEarned(p) {
  return COSMETIC_REWARDS.filter((r) => r.cond && !has(p || {}, r.id) && condMet(r.cond, p)).map((r) => r.id);
}
// фоны лобби, открытые у игрока
function lobbyUnlocked(p) {
  const out = new Set(FREE_LOBBY);
  for (const r of COSMETIC_REWARDS) if (r.kind === 'lobby' && (has(p || {}, r.id) || condMet(r.cond, p))) out.add(r.lobby);
  return out;
}
// прогресс к условию: [сейчас, нужно] — для подсказок «ещё 2 уровня»
function condProgress(cond, p) {
  if (!cond) return null;
  p = p || {};
  const m = masteryLevels(p);
  const st = p.stats || {};
  if (cond.mastery) return [Math.min(m[cond.mastery[0]] || 0, cond.mastery[1]), cond.mastery[1]];
  if (cond.anyMastery) return [Math.min(Math.max(...cond.anyMastery[0].map((g) => m[g] || 0)), cond.anyMastery[1]), cond.anyMastery[1]];
  if (cond.masteryAll) return [MG_GAMES.filter((g) => m[g] >= cond.masteryAll).length, MG_GAMES.length];
  if (cond.masteryCount) return [Math.min(MG_GAMES.filter((g) => m[g] >= cond.masteryCount[1]).length, cond.masteryCount[0]), cond.masteryCount[0]];
  if (cond.masteryTotal) return [Math.min(Object.values(m).reduce((a, b) => a + b, 0), cond.masteryTotal), cond.masteryTotal];
  if (cond.events) return [Math.min(Object.keys(p.rewards || {}).filter((id) => id.startsWith('ev_')).length, cond.events), cond.events];
  if (cond.rewards) return [Math.min(Object.keys(p.rewards || {}).length, cond.rewards), cond.rewards];
  if (cond.party) return [Math.min(Number(st.party) || 0, cond.party), cond.party];
  if (cond.friends) return [Math.min(Number(st.friends) || 0, cond.friends), cond.friends];
  return null;
}


// ===== rewards.js =====
// Награды мини-игр. У каждой игры свои; выдаются за долгую игру (игры зовут api.reward(id)).
// kind: badge — значок у ника, title — титул у ника, scene — новый фон, music — lofi-трек, theme — цвет лаунчера,
//       frame — рамка аватарки, cape — плащ для Minecraft (через систему скинов лаунчера),
//       lobby — фон лобби отряда в игре, decor — декорация главного меню игры (cosmetics.js; открываются сами по условию cond).

const AUTHOR_NICK = 'kokkas'; // аккаунт автора на Ely.by (скин «Kokk 2.0», ely.by/skins/s4749321) — рисуется в финале «Побега»

const GAME_NAMES = {
  events: 'События месяца', weekly: 'Турнир недели',
  prison: 'Побег', fishing: 'Рыбалка', defense: 'Защита деревни', runner: 'Побег от зомби', fair: 'Ярмарочный тир', mine: 'Вагонетка',
  style: 'Стиль профиля', lobby: 'Лобби и меню игры'
};

const BASE_REWARDS = [
  // ---- Побег (10 тюрем) ----
  { id: 'prison_badge_digger', game: 'prison', kind: 'badge', name: 'Копатель', icon: 'shovel', color: '#b08850', how: 'Сбеги из 3-й тюрьмы' },
  { id: 'prison_scene_dungeon', game: 'prison', kind: 'scene', name: 'Фон «Пустынная яма»', variant: 4, how: 'Сбеги из 4-й тюрьмы' },
  { id: 'prison_music_chains', game: 'prison', kind: 'music', name: 'Трек «Кандальный блюз»', track: 'chains', how: 'Сбеги из 5-й тюрьмы' },
  { id: 'prison_theme_steel', game: 'prison', kind: 'theme', name: 'Тема «Сталь»', theme: 'steel', how: 'Сбеги из 6-й тюрьмы' },
  { id: 'prison_frame_bars', game: 'prison', kind: 'frame', name: 'Рамка «Решётка»', frame: 'bars', how: 'Сбеги из 7-й тюрьмы' },
  { id: 'prison_scene_arcane', game: 'prison', kind: 'scene', name: 'Фон «Башня магов»', variant: 8, how: 'Сбеги из 8-й тюрьмы' },
  { id: 'prison_title_elusive', game: 'prison', kind: 'title', name: 'Неуловимый', how: 'Сбеги из 9-й тюрьмы' },
  { id: 'prison_badge_free', game: 'prison', kind: 'badge', name: 'Свобода', icon: 'key', color: '#ffd34a', how: 'Пройди все 10 тюрем' },
  { id: 'prison_cape_runaway', game: 'prison', kind: 'cape', name: 'Плащ беглеца', cape: 'runaway', how: 'Пройди все 10 тюрем — вручает сам Кокк' },
  // ---- Рыбалка ----
  { id: 'fish_badge_angler', game: 'fishing', kind: 'badge', name: 'Рыболов', icon: 'fish', color: '#5ab0e0', how: 'Заполни альбом рыб наполовину' },
  { id: 'fish_music_reeds', game: 'fishing', kind: 'music', name: 'Трек «Тихий плёс»', track: 'reeds', how: 'Открой третье озеро' },
  { id: 'fish_theme_lake', game: 'fishing', kind: 'theme', name: 'Тема «Озеро»', theme: 'lake', how: 'Заполни альбом рыб на 80 %' },
  { id: 'fish_title_legend', game: 'fishing', kind: 'title', name: 'Легенда озера', how: 'Поймай все 4 легендарные рыбы' },
  { id: 'fish_cape_fisher', game: 'fishing', kind: 'cape', name: 'Плащ рыбака', cape: 'fisher', how: 'Собери весь альбом рыб' },
  // ---- Защита деревни ----
  { id: 'def_badge_guard', game: 'defense', kind: 'badge', name: 'Страж', icon: 'shield', color: '#9aa4b0', how: 'Дойди до 20-й волны' },
  { id: 'def_frame_palisade', game: 'defense', kind: 'frame', name: 'Рамка «Частокол»', frame: 'palisade', how: 'Прокачай деревню до 5-го уровня' },
  { id: 'def_theme_ash', game: 'defense', kind: 'theme', name: 'Тема «Пепел»', theme: 'ash', how: 'Дойди до 40-й волны' },
  { id: 'def_title_lastline', game: 'defense', kind: 'title', name: 'Последний рубеж', how: 'Дойди до 60-й волны' },
  { id: 'def_cape_defender', game: 'defense', kind: 'cape', name: 'Плащ защитника', cape: 'defender', how: 'Победи 10 000 зомби' },
  // ---- Побег от зомби ----
  { id: 'run_badge_marathon', game: 'runner', kind: 'badge', name: 'Марафонец', icon: 'boot', color: '#e08a40', how: 'Пробеги в сумме 42 км' },
  { id: 'run_music_chase', game: 'runner', kind: 'music', name: 'Трек «Погоня»', track: 'chase', how: 'Открой все 5 маршрутов' },
  { id: 'run_title_wind', game: 'runner', kind: 'title', name: 'Быстрее ветра', how: 'Пробеги 10 км за один забег' },
  { id: 'run_cape_runner', game: 'runner', kind: 'cape', name: 'Плащ бегуна', cape: 'runner', how: 'Пробеги в сумме 500 км' },
  // ---- Ярмарочный тир ----
  { id: 'fair_badge_eye', game: 'fair', kind: 'badge', name: 'Меткий глаз', icon: 'target', color: '#e05050', how: 'Сбей 100 золотых мишеней' },
  { id: 'fair_frame_target', game: 'fair', kind: 'frame', name: 'Рамка «Мишень»', frame: 'target', how: 'Прокачай все аттракционы' },
  { id: 'fair_theme_fair', game: 'fair', kind: 'theme', name: 'Тема «Ярмарка»', theme: 'fair', how: 'Получи ранг «Мастер»' },
  { id: 'fair_title_robin', game: 'fair', kind: 'title', name: 'Робин', how: 'Идеальный раунд: 60+ попаданий без промахов' },
  { id: 'fair_cape_archer', game: 'fair', kind: 'cape', name: 'Плащ стрелка', cape: 'archer', how: 'Получи ранг «Легенда»' },
  // ---- Вагонетка ----
  { id: 'mine_badge_miner', game: 'mine', kind: 'badge', name: 'Шахтёр', icon: 'pick', color: '#8fd0ff', how: 'Проедь в сумме 1 км вглубь' },
  { id: 'mine_theme_gems', game: 'mine', kind: 'theme', name: 'Тема «Самоцветы»', theme: 'gems', how: 'Собери все руды и камни в альбом' },
  { id: 'mine_music_deep', game: 'mine', kind: 'music', name: 'Трек «Глубина»', track: 'deep', how: 'Доберись до лавовых глубин' },
  { id: 'mine_title_king', game: 'mine', kind: 'title', name: 'Король руды', how: 'Добудь руды на 100 000' },
  { id: 'mine_cape_miner', game: 'mine', kind: 'cape', name: 'Плащ шахтёра', cape: 'miner', how: 'Пройди все глубины до конца' },
  // ---- события месяца: значок за испытание события (в любой из игр) ----
  { id: 'ev_yule', game: 'events', kind: 'badge', name: 'Святки', icon: 'snow', color: '#cfe8ff', how: 'Испытание января' },
  { id: 'ev_maslenitsa', game: 'events', kind: 'badge', name: 'Масленица', icon: 'sun', color: '#ffcf5a', how: 'Испытание февраля' },
  { id: 'ev_thaw', game: 'events', kind: 'badge', name: 'Оттепель', icon: 'drop', color: '#7ad0ff', how: 'Испытание марта' },
  { id: 'ev_jest', game: 'events', kind: 'badge', name: 'Шутник', icon: 'star', color: '#ff8ad8', how: 'Испытание апреля' },
  { id: 'ev_bloom', game: 'events', kind: 'badge', name: 'Цветение', icon: 'flower', color: '#ffa0c8', how: 'Испытание мая' },
  { id: 'ev_kupala', game: 'events', kind: 'badge', name: 'Купала', icon: 'fire', color: '#ff9a3a', how: 'Испытание июня' },
  { id: 'ev_storm', game: 'events', kind: 'badge', name: 'Гроза', icon: 'bolt', color: '#e8e070', how: 'Испытание июля' },
  { id: 'ev_starfall', game: 'events', kind: 'badge', name: 'Звездопад', icon: 'star', color: '#c8b0ff', how: 'Испытание августа' },
  { id: 'ev_harvest', game: 'events', kind: 'badge', name: 'Урожай', icon: 'leaf', color: '#e0b040', how: 'Испытание сентября' },
  { id: 'ev_pumpkin', game: 'events', kind: 'badge', name: 'Ночь тыкв', icon: 'pumpkin', color: '#ff8a2a', how: 'Испытание октября' },
  { id: 'ev_fog', game: 'events', kind: 'badge', name: 'Туманы', icon: 'drop', color: '#b8c4c8', how: 'Испытание ноября' },
  { id: 'ev_newyear', game: 'events', kind: 'badge', name: 'Новый год', icon: 'snow', color: '#7affc0', how: 'Испытание декабря' },
  // ---- турнир недели ----
  { id: 'week_champion', game: 'weekly', kind: 'badge', name: 'Чемпион недели', icon: 'crown', color: '#ffd34a', how: 'Займи 1-е место в турнире недели' },
  { id: 'week_podium', game: 'weekly', kind: 'title', name: 'Призёр турнира', how: 'Займи место в тройке турнира недели' }
];
const REWARDS = [...BASE_REWARDS, ...COSMETIC_REWARDS];

const rewardById = (id) => REWARDS.find((r) => r.id === id) || null;

const KIND_NAMES = { badge: 'Значок', title: 'Титул', scene: 'Фон', music: 'Музыка', theme: 'Тема', frame: 'Рамка', cape: 'Плащ', lobby: 'Фон лобби', decor: 'Декорация меню' };

// Пиксельные значки 7×7 (рисуются у ника)
const BADGE_PIX = {
  shovel: ['......#', '.....#.', '....#..', '.##....', '#O##...', '#OO#...', '.##....'],
  key: ['.###...', '#...#..', '#...#..', '.###...', '..#....', '..##...', '..#.##.'],
  fish: ['.......', '.####.#', '#O####.', '######.', '.####.#', '.......', '.......'],
  shield: ['#######', '#OOOOO#', '#O###O#', '#O###O#', '.#O#O#.', '..#O#..', '...#...'],
  boot: ['..###..', '..#O#..', '..#O#..', '..#O#..', '.#OO###', '#OOOOO#', '#######'],
  target: ['.#####.', '#OOOOO#', '#O###O#', '#O#O#O#', '#O###O#', '#OOOOO#', '.#####.'],
  pick: ['.#####.', '#.....#', '...#...', '...#...', '...#...', '...#...', '...#...'],
  snow: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  sun: ['#..#..#', '.#####.', '.#OOO#.', '##OOO##', '.#OOO#.', '.#####.', '#..#..#'],
  drop: ['...#...', '..###..', '.#####.', '.##O##.', '#######', '.#####.', '..###..'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  flower: ['.#.#.#.', '#######', '.##O##.', '#######', '.#.#.#.', '...#...', '..###..'],
  fire: ['...#...', '..##...', '..###..', '.##O##.', '.#OOO#.', '#OOOOO#', '.#####.'],
  bolt: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  leaf: ['....###', '..#####', '.###O##', '.##O###', '.#O####', '.O#####', 'O......'],
  pumpkin: ['...#...', '.#####.', '#O#O#O#', '#######', '#O###O#', '#.OOO.#', '.#####.'],
  crown: ['.......', '#..#..#', '##.#.##', '#######', '#O#O#O#', '#######', '.......'],
  ...EXTRA_BADGE_PIX
};
// значок для игры (лобби): пиксели 7×7 строками, # — цвет, O — белый 55 %
function badgeInfo(id) {
  const r = id ? rewardById(id) : null;
  if (!r || r.kind !== 'badge') return null;
  return { id: r.id, name: r.name, color: r.color, pix: BADGE_PIX[r.icon] || BADGE_PIX.target };
}
function frameInfo(id) { const f = id && FRAMES[id]; return f ? { id, name: f.name, style: f.style, colors: f.colors } : null; }
function badgeSvg(r, size = 14) {
  const pix = BADGE_PIX[r.icon] || BADGE_PIX.target;
  let rects = '';
  pix.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${r.color}"/>`;
    else if (c === 'O') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#ffffff" opacity=".55"/>`;
  }));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" width="${size}" height="${size}" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

// Плащи — в capes.js (рисуются кодом)

// Темы лаунчера: переопределяют акцентные цвета
const THEMES = {
  steel: { '--gold': '#b8c4d0', '--gold-2': '#dfe7ef', '--emerald': '#5aa0d0', '--emerald-2': '#8cc4ea', '--emerald-d': '#244a66' },
  lake: { '--gold': '#7fd0e8', '--gold-2': '#c4f0ff', '--emerald': '#2ab0c0', '--emerald-2': '#6ee0e8', '--emerald-d': '#145a63' },
  ash: { '--gold': '#e07050', '--gold-2': '#ffb090', '--emerald': '#c0503a', '--emerald-2': '#e88a70', '--emerald-d': '#5a2018' },
  fair: { '--gold': '#ff7aa8', '--gold-2': '#ffc0d8', '--emerald': '#e8a43a', '--emerald-2': '#ffd080', '--emerald-d': '#6a4410' },
  gems: { '--gold': '#b88cff', '--gold-2': '#dcc8ff', '--emerald': '#4ad0a0', '--emerald-2': '#90f0c8', '--emerald-d': '#155a44' },
  ...EXTRA_THEMES
};
const THEME_NAMES = { steel: 'Сталь', lake: 'Озеро', ash: 'Пепел', fair: 'Ярмарка', gems: 'Самоцветы', forest: 'Лес', dusk: 'Сумерки', cherry: 'Вишня', honey: 'Мёд', frost: 'Мороз', royal: 'Королевская' };
// тема для игры: { id, name, colors: { gold, gold2, emerald, emerald2, emeraldD } }
function themeInfo(id) {
  const th = id && THEMES[id];
  if (!th) return null;
  return { id, name: THEME_NAMES[id] || id, colors: { gold: th['--gold'], gold2: th['--gold-2'], emerald: th['--emerald'], emerald2: th['--emerald-2'], emeraldD: th['--emerald-d'] } };
}


module.exports = { MG_GAMES, MG_NAMES, levelOf, COSMETIC_REWARDS, LOBBY_BGS, FREE_LOBBY, DECOR, FRAMES, EXTRA_THEMES, EXTRA_BADGE_PIX, masteryLevels, accountLevel, condMet, newlyEarned, lobbyUnlocked, condProgress, AUTHOR_NICK, GAME_NAMES, REWARDS, rewardById, KIND_NAMES, badgeInfo, frameInfo, badgeSvg, THEMES, THEME_NAMES, themeInfo };
