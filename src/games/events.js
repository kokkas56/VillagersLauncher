// Календарь событий мини-игр: каждый месяц своё событие (без обновления лаунчера), турнир недели и уровни мастерства.
// Игры получают это через api.event(), api.week(), api.xp()/api.mastery().

export const EVENTS = [
  { id: 'yule', month: 1, name: 'Святки', desc: 'Снег, гадания, ряженые' },
  { id: 'maslenitsa', month: 2, name: 'Масленица', desc: 'Блины, чучело, катания' },
  { id: 'thaw', month: 3, name: 'Оттепель', desc: 'Ручьи, грачи, первая зелень' },
  { id: 'jest', month: 4, name: 'Неделя шуток', desc: 'Всё немного наоборот' },
  { id: 'bloom', month: 5, name: 'Цветение', desc: 'Сады в цвету, пчёлы' },
  { id: 'kupala', month: 6, name: 'Купальская ночь', desc: 'Костры, венки, папоротник' },
  { id: 'storm', month: 7, name: 'Грозы', desc: 'Ливни, молнии, радуги' },
  { id: 'starfall', month: 8, name: 'Звездопад', desc: 'Падающие звёзды и метеориты' },
  { id: 'harvest', month: 9, name: 'Урожай', desc: 'Снопы, ярмарки, тыквы' },
  { id: 'pumpkin', month: 10, name: 'Ночь тыкв', desc: 'Фонари из тыкв, призраки' },
  { id: 'fog', month: 11, name: 'Туманы', desc: 'Густой туман, огоньки на болотах' },
  { id: 'newyear', month: 12, name: 'Новый год', desc: 'Ёлки, гирлянды, подарки' }
];

export function currentEvent(now = new Date()) {
  const ev = EVENTS.find((e) => e.month === now.getMonth() + 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { ...ev, year: now.getFullYear(), daysLeft: Math.max(0, Math.ceil((end - now) / 864e5)) };
}

// ISO-неделя: 'YYYY-Www'
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}
const TOURNEY_GAMES = ['runner', 'fishing', 'defense', 'fair', 'mine', 'prison'];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
// турнир недели: какая игра (одна на всю сборку) и сколько осталось
export function weekInfo(d = new Date()) {
  const key = weekKey(d);
  const game = TOURNEY_GAMES[hash('vk-week:' + key) % TOURNEY_GAMES.length];
  const prev = new Date(d.getTime() - 7 * 864e5);
  const day = d.getDay() || 7;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (8 - day));
  return { key, game, prevKey: weekKey(prev), prevGame: TOURNEY_GAMES[hash('vk-week:' + weekKey(prev)) % TOURNEY_GAMES.length], daysLeft: Math.max(1, Math.ceil((end - d) / 864e5)) };
}

// мастерство: уровень из опыта (бесконечный, каждый следующий чуть дороже)
export const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 120));
export const xpFor = (lvl) => lvl * lvl * 120;
