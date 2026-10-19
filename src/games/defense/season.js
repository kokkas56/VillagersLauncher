// «Защита деревни»: события месяца — особый зомби (идёт в испытание), украшения деревни и поля.
// Таблица по id события из src/games/events.js. Испытание: победить goal особых зомби за месяц.
// acc — какой аксессуар рисовать особому зомби; fall — что летит сверху; col — цвет события в HUD.
export const SEASON = {
  yule: { foe: 'Ряженый', acc: 'goat', col: '#cfe8ff', goal: 200, fall: 'snow', fcol: ['#ffffff', '#e8f0ff'], snow: 1 },
  maslenitsa: { foe: 'Чучельник', acc: 'effigy', col: '#ffcf5a', goal: 200, fall: 'snow', fcol: ['#ffffff'], snow: 1 },
  thaw: { foe: 'Грязнуля', acc: 'mud', col: '#7ad0ff', goal: 200, fall: null, fcol: null, spd: 0.9, hp: 1.4 },
  jest: { foe: 'Шут', acc: 'jester', col: '#ff8ad8', goal: 200, fall: null, fcol: null, spd: 1.15 },
  bloom: { foe: 'Цветущий', acc: 'flower', col: '#ffa0c8', goal: 200, fall: 'petal', fcol: ['#ffc0dc', '#ffffff', '#ff9ac8'] },
  kupala: { foe: 'Венценосец', acc: 'wreath', col: '#ff9a3a', goal: 200, fall: null, fcol: null },
  storm: { foe: 'Громовой', acc: 'rod', col: '#e8e070', goal: 200, fall: null, fcol: null, spd: 1.25, rain: 1 },
  starfall: { foe: 'Звездочёт', acc: 'star', col: '#c8b0ff', goal: 200, fall: null, fcol: null },
  harvest: { foe: 'Пугало', acc: 'scare', col: '#e0b040', goal: 200, fall: 'leaf', fcol: ['#e0b040', '#d07a30', '#c8a030'], hp: 1.3 },
  pumpkin: { foe: 'Тыквоголовый', acc: 'pumpkin', col: '#ff8a2a', goal: 200, fall: 'leaf', fcol: ['#d07a30', '#a05020'] },
  fog: { foe: 'Болотник', acc: 'moss', col: '#b8c4c8', goal: 200, fall: null, fcol: null, fog: 1 },
  newyear: { foe: 'Морозный', acc: 'santa', col: '#7affc0', goal: 200, fall: 'snow', fcol: ['#ffffff', '#e8f0ff'], snow: 1 }
};
export const seasonOf = (id) => SEASON[id] || SEASON.yule;
export const eventGoal = (id) => seasonOf(id).goal;
export const EV_CHANCE = 0.14; // доля особых зомби в волне (~1 на волну)
