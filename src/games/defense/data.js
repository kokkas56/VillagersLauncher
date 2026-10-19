// «Защита деревни»: данные прогресса — типы зомби и боссы, рост волн, улучшения деревни, задания дня.

// box: хитбокс относительно ног (x — центр-лево, смотрит вправо): l, r, t (верх, отрицательный)
// armor: доля урона от стрел, которая проходит (1 — весь); shield: стрелы не проходят вовсе
export const TYPES = {
  normal: { name: 'Зомби', hp: 3, spd: 10, dps: 4, gem: 2, s: 1, from: 1, box: { l: -2, r: 5, t: -13 } },
  fast: { name: 'Бегун', hp: 2, spd: 21, dps: 3, gem: 2, s: 1, from: 2, box: { l: -2, r: 4, t: -10 } },
  big: { name: 'Громила', hp: 5, spd: 6, dps: 8, gem: 4, s: 2, from: 3, box: { l: -4, r: 10, t: -25 } },
  armor: { name: 'Латник', hp: 6, spd: 9, dps: 5, gem: 4, s: 1, from: 6, armor: 0.4, box: { l: -2, r: 5, t: -14 } },
  jumper: { name: 'Прыгун', hp: 3, spd: 15, dps: 4, gem: 3, s: 1, from: 8, box: { l: -2, r: 5, t: -13 } },
  witch: { name: 'Ведьма', hp: 4, spd: 8, dps: 0, gem: 5, s: 1, from: 12, box: { l: -3, r: 5, t: -17 } },
  bomber: { name: 'Бочкарь', hp: 3, spd: 12, dps: 0, gem: 4, s: 1, from: 16, box: { l: -2, r: 6, t: -19 } },
  ghost: { name: 'Призрак', hp: 4, spd: 11, dps: 5, gem: 5, s: 1, from: 22, box: { l: -2, r: 5, t: -13 } },
  shield: { name: 'Щитоносец', hp: 5, spd: 8, dps: 6, gem: 5, s: 1, from: 28, shield: 1, box: { l: -2, r: 8, t: -13 } },
  giant: { name: 'Великан', hp: 60, spd: 4, dps: 20, gem: 40, s: 3, boss: 1, box: { l: -6, r: 16, t: -38 } },
  necro: { name: 'Некромант', hp: 50, spd: 5, dps: 10, gem: 50, s: 2, boss: 2, box: { l: -4, r: 10, t: -30 } },
  ram: { name: 'Таран', hp: 90, spd: 7, dps: 35, gem: 60, s: 2, boss: 3, armor: 0.5, box: { l: -4, r: 18, t: -26 } }
};
export const TYPE_IDS = ['normal', 'fast', 'big', 'armor', 'jumper', 'witch', 'bomber', 'ghost', 'shield', 'giant', 'necro', 'ram'];
export const MOB_IDS = TYPE_IDS.slice(0, 9);
export const BOSS_IDS = ['giant', 'necro', 'ram'];
export const bossFor = (wave) => (wave % 10 === 0 ? BOSS_IDS[((wave / 10) - 1) % 3] : null);
export const bossFirstWave = (id) => (BOSS_IDS.indexOf(id) + 1) * 10;

// ---------- волны ----------
export const waveCount = (w) => Math.min(42, 5 + Math.floor(2.2 * w));
export const hpMul = (w) => 1 + 0.13 * (w - 1);
export const spdMul = (w) => 1 + Math.min(0.5, 0.012 * w);
export const dmgMul = (w) => 1 + 0.04 * w;
export const gemMul = (w) => 1 + 0.04 * w;
export const ckptOf = (w) => Math.max(1, Math.floor((w - 1) / 5) * 5 + 1); // 1, 6, 11, ...
// веса типов на волне
export function typeWeight(id, w) {
  const T = TYPES[id];
  if (T.boss || w < T.from) return 0;
  if (id === 'normal') return Math.max(18, 60 - w * 1.5);
  const age = w - T.from;
  return Math.min(16, 6 + age * 1.2);
}

// ---------- улучшения деревни (за изумруды, навсегда) ----------
export const UPGRADES = [
  { id: 'wall', name: 'Частокол', max: 10, base: 30, k: 1.5 },
  { id: 'archers', name: 'Лучники', max: 6, base: 60, k: 1.9 },
  { id: 'arrows', name: 'Стрелы', max: 10, base: 40, k: 1.5 },
  { id: 'traps', name: 'Ловушки', max: 8, base: 35, k: 1.55 },
  { id: 'sword', name: 'Меч', max: 12, base: 25, k: 1.45 },
  { id: 'bell', name: 'Колокол', max: 6, base: 50, k: 1.6 }
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.k, lvl) / 5) * 5;
export const MAX_SUM = UPGRADES.reduce((a, u) => a + u.max, 0);
export const villageLevel = (up) => { let s = 0; for (let i = 0; i < up.length; i++) s += up[i]; return 1 + Math.floor(s / 5); };
// производные значения
export const wallMax = (up) => 100 + 35 * up[0];
export const archerCount = (up) => up[1];
export const arrowDmg = (up) => 1 + 0.4 * up[2];
export const arrowCd = (up) => 2.2 * Math.pow(0.94, up[2]);
export const fenceCount = (up) => Math.min(3, up[3]);
export const spikeDps = (up) => Math.max(0, up[3] - 3) * 0.6;
export const clickDmg = (up) => 1 + 0.5 * up[4];
export const bellHeal = (up) => 0.05 + 0.03 * up[5];
