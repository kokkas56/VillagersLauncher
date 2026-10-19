// Награды мини-игр. У каждой игры свои; выдаются за долгую игру (игры зовут api.reward(id)).
// kind: badge — значок у ника, title — титул у ника, scene — новый фон, music — lofi-трек, theme — цвет лаунчера,
//       frame — рамка аватарки, cape — плащ для Minecraft (через систему скинов лаунчера).

export const AUTHOR_NICK = 'Kokk'; // ник автора сборки: его скин рисуется в финале «Побега»

export const GAME_NAMES = {
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
  { id: 'mine_cape_miner', game: 'mine', kind: 'cape', name: 'Плащ шахтёра', cape: 'miner', how: 'Пройди все глубины до конца' }
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
  pick: ['.#####.', '#.....#', '...#...', '...#...', '...#...', '...#...', '...#...']
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

// Плащи: текстура 64×32 (развёртка плаща Minecraft: перед 10×16 с отступом 1,1). Рисуется кодом, своё оформление.
const CAPES = {
  runaway: { base: '#3a3a44', edge: '#ffd34a', draw: (p) => { p.stripes('#2a2a33', 2); p.emblem('key', '#ffd34a'); } },
  fisher: { base: '#2f6f9a', edge: '#d8f0ff', draw: (p) => { p.waves('#5ab0e0'); p.emblem('fish', '#ffe08a'); } },
  defender: { base: '#6b2a20', edge: '#c9b48a', draw: (p) => { p.stripes('#5a2018', 3); p.emblem('shield', '#c9b48a'); } },
  runner: { base: '#c46a2a', edge: '#ffe0b0', draw: (p) => { p.chevrons('#e08a40'); p.emblem('boot', '#ffe0b0'); } },
  archer: { base: '#2d5a2a', edge: '#e0c070', draw: (p) => { p.stripes('#254a22', 2); p.emblem('target', '#e05050'); } },
  miner: { base: '#2a2a30', edge: '#8fd0ff', draw: (p) => { p.gems(['#8fd0ff', '#55dd77', '#ffd34a', '#e05050']); p.emblem('pick', '#c0c8d0'); } }
};
export function capeDataUrl(id) {
  const def = CAPES[id];
  if (!def || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  // вся развёртка плаща: x 0..22, y 0..17 (верх, бока, перед 1..11, зад 12..22)
  g.fillStyle = def.base; g.fillRect(0, 0, 22, 17);
  const FX = 1, FY = 1, FW = 10, FH = 16; // перед (то, что видно сзади игрока)
  const BX = 12; // зад
  const both = (fn) => { fn(FX); fn(BX); };
  const p = {
    stripes: (col, w) => both((x0) => { g.fillStyle = col; for (let y = FY; y < FY + FH; y += w * 2) g.fillRect(x0, y, FW, w); }),
    waves: (col) => both((x0) => { g.fillStyle = col; for (let y = FY + 3; y < FY + FH; y += 4) for (let x = 0; x < FW; x++) g.fillRect(x0 + x, y + ((x >> 1) % 2), 1, 1); }),
    chevrons: (col) => both((x0) => { g.fillStyle = col; for (let y = FY + 2; y < FY + FH; y += 5) for (let x = 0; x < FW; x++) g.fillRect(x0 + x, y + Math.abs(x - 4.5) * 0.6, 1, 1); }),
    gems: (cols) => both((x0) => { let k = 0; for (let y = FY + 2; y < FY + FH; y += 3) for (let x = (y % 2); x < FW; x += 3) { g.fillStyle = cols[k++ % cols.length]; g.fillRect(x0 + x, y, 1, 1); } }),
    emblem: (icon, col) => {
      const pix = BADGE_PIX[icon] || BADGE_PIX.target;
      pix.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = ch === 'O' ? '#ffffff' : col; g.fillRect(FX + 1 + x + 1, FY + 4 + y, 1, 1); } }));
    }
  };
  def.draw(p);
  // кайма
  g.fillStyle = def.edge;
  both((x0) => { g.fillRect(x0, FY + FH - 1, FW, 1); g.fillRect(x0, FY, 1, FH); g.fillRect(x0 + FW - 1, FY, 1, FH); });
  return c.toDataURL('image/png');
}

// Темы лаунчера: переопределяют акцентные цвета
export const THEMES = {
  steel: { '--gold': '#b8c4d0', '--gold-2': '#dfe7ef', '--emerald': '#5aa0d0', '--emerald-2': '#8cc4ea', '--emerald-d': '#244a66' },
  lake: { '--gold': '#7fd0e8', '--gold-2': '#c4f0ff', '--emerald': '#2ab0c0', '--emerald-2': '#6ee0e8', '--emerald-d': '#145a63' },
  ash: { '--gold': '#e07050', '--gold-2': '#ffb090', '--emerald': '#c0503a', '--emerald-2': '#e88a70', '--emerald-d': '#5a2018' },
  fair: { '--gold': '#ff7aa8', '--gold-2': '#ffc0d8', '--emerald': '#e8a43a', '--emerald-2': '#ffd080', '--emerald-d': '#6a4410' },
  gems: { '--gold': '#b88cff', '--gold-2': '#dcc8ff', '--emerald': '#4ad0a0', '--emerald-2': '#90f0c8', '--emerald-d': '#155a44' }
};
