// Награды мини-игр. У каждой игры свои; выдаются за долгую игру (игры зовут api.reward(id)).
// kind: badge — значок у ника, title — титул у ника, scene — новый фон, music — lofi-трек, theme — цвет лаунчера,
//       frame — рамка аватарки, cape — плащ для Minecraft (через систему скинов лаунчера).

export const AUTHOR_NICK = 'kokkas'; // аккаунт автора на Ely.by (скин «Kokk 2.0», ely.by/skins/s4749321) — рисуется в финале «Побега»

export const GAME_NAMES = {
  events: 'События месяца', weekly: 'Турнир недели',
  prison: 'Побег', fishing: 'Рыбалка', defense: 'Защита деревни', runner: 'Побег от зомби', fair: 'Ярмарочный тир', mine: 'Вагонетка'
};

export const REWARDS = [
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

export const rewardById = (id) => REWARDS.find((r) => r.id === id) || null;

export const KIND_NAMES = { badge: 'Значок', title: 'Титул', scene: 'Фон', music: 'Музыка', theme: 'Тема', frame: 'Рамка', cape: 'Плащ' };

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
  crown: ['.......', '#..#..#', '##.#.##', '#######', '#O#O#O#', '#######', '.......']
};
export function badgeSvg(r, size = 14) {
  const pix = BADGE_PIX[r.icon] || BADGE_PIX.target;
  let rects = '';
  pix.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${r.color}"/>`;
    else if (c === 'O') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#ffffff" opacity=".55"/>`;
  }));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" width="${size}" height="${size}" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

// Плащи — в capes.js (рисуются кодом)
export { capeDataUrl } from './capes.js';

// Темы лаунчера: переопределяют акцентные цвета
export const THEMES = {
  steel: { '--gold': '#b8c4d0', '--gold-2': '#dfe7ef', '--emerald': '#5aa0d0', '--emerald-2': '#8cc4ea', '--emerald-d': '#244a66' },
  lake: { '--gold': '#7fd0e8', '--gold-2': '#c4f0ff', '--emerald': '#2ab0c0', '--emerald-2': '#6ee0e8', '--emerald-d': '#145a63' },
  ash: { '--gold': '#e07050', '--gold-2': '#ffb090', '--emerald': '#c0503a', '--emerald-2': '#e88a70', '--emerald-d': '#5a2018' },
  fair: { '--gold': '#ff7aa8', '--gold-2': '#ffc0d8', '--emerald': '#e8a43a', '--emerald-2': '#ffd080', '--emerald-d': '#6a4410' },
  gems: { '--gold': '#b88cff', '--gold-2': '#dcc8ff', '--emerald': '#4ad0a0', '--emerald-2': '#90f0c8', '--emerald-d': '#155a44' }
};
