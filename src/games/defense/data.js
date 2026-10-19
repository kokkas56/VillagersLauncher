// «Защита деревни»: данные прогресса — типы зомби и боссы, рост волн, улучшения деревни, задания дня.

// box: хитбокс относительно ног (x — центр-лево, смотрит вправо): l, r, t (верх, отрицательный)
// armor: доля урона от стрел, которая проходит (1 — весь); shield: стрелы не проходят вовсе
export const TYPES = {
  normal: { name: 'Зомби', hp: 8, spd: 10, dps: 4, gem: 1, s: 1, from: 1, box: { l: -2, r: 5, t: -13 } },
  fast: { name: 'Бегун', hp: 5, spd: 21, dps: 3, gem: 1, s: 1, from: 2, box: { l: -2, r: 4, t: -10 } },
  big: { name: 'Громила', hp: 14, spd: 6, dps: 8, gem: 2, s: 2, from: 3, box: { l: -4, r: 10, t: -25 } },
  armor: { name: 'Латник', hp: 16, spd: 9, dps: 5, gem: 2, s: 1, from: 6, armor: 0.4, box: { l: -2, r: 5, t: -14 } },
  jumper: { name: 'Прыгун', hp: 8, spd: 15, dps: 4, gem: 2, s: 1, from: 8, box: { l: -2, r: 5, t: -13 } },
  witch: { name: 'Ведьма', hp: 11, spd: 8, dps: 0, gem: 3, s: 1, from: 12, box: { l: -3, r: 5, t: -17 } },
  bomber: { name: 'Бочкарь', hp: 8, spd: 12, dps: 0, gem: 2, s: 1, from: 16, box: { l: -2, r: 6, t: -19 } },
  ghost: { name: 'Призрак', hp: 11, spd: 11, dps: 5, gem: 3, s: 1, from: 22, box: { l: -2, r: 5, t: -13 } },
  shield: { name: 'Щитоносец', hp: 14, spd: 8, dps: 6, gem: 3, s: 1, from: 28, shield: 1, box: { l: -2, r: 8, t: -13 } },
  giant: { name: 'Великан', hp: 160, spd: 4, dps: 20, gem: 25, s: 3, boss: 1, box: { l: -6, r: 16, t: -38 } },
  necro: { name: 'Некромант', hp: 135, spd: 5, dps: 10, gem: 30, s: 2, boss: 2, box: { l: -4, r: 10, t: -30 } },
  ram: { name: 'Таран', hp: 240, spd: 7, dps: 22, gem: 40, s: 2, boss: 3, armor: 0.5, box: { l: -4, r: 18, t: -26 } }
};
export const TYPE_IDS = ['normal', 'fast', 'big', 'armor', 'jumper', 'witch', 'bomber', 'ghost', 'shield', 'giant', 'necro', 'ram'];
export const MOB_IDS = TYPE_IDS.slice(0, 9);
export const BOSS_IDS = ['giant', 'necro', 'ram'];
export const bossFor = (wave) => (wave % 10 === 0 ? BOSS_IDS[((wave / 10) - 1) % 3] : null);
export const bossFirstWave = (id) => (BOSS_IDS.indexOf(id) + 1) * 10;

// ---------- волны ----------
export const waveCount = (w) => Math.min(10, 3 + Math.floor(0.4 * w));
export const waveWindow = (n) => 5 + 1.2 * n; // секунд на выход всей волны
export const bossMul = (w) => 1 + 0.1 * (w - 1);
// ранний «горб» сложности: волны 1–25 крепче (x1.45), к 45-й остаётся x1.1
const earlyMul = (w) => 1 + 0.45 * Math.min(1, (w - 1) / 14) * Math.max(0.22, 1 - Math.max(0, w - 25) / 20);
export const hpMul = (w) => (1 + 0.18 * (w - 1) + 0.003 * (w - 1) * (w - 1)) * earlyMul(w);
export const spdMul = (w) => 1 + Math.min(0.5, 0.012 * w);
export const dmgMul = (w) => 1 + 0.06 * w;
export const gemMul = (w) => 1 + 0.02 * w;
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
  { id: 'wall', name: 'Частокол', max: 20, base: 60, k: 1.3 },
  { id: 'archers', name: 'Лучники', max: 6, base: 240, k: 2.1 },
  { id: 'arrows', name: 'Стрелы', max: 20, base: 90, k: 1.3 },
  { id: 'traps', name: 'Ловушки', max: 8, base: 80, k: 1.5 },
  { id: 'sword', name: 'Меч', max: 20, base: 50, k: 1.29 },
  { id: 'bell', name: 'Колокол', max: 6, base: 120, k: 1.6 }
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.k, lvl) / 5) * 5;
export const MAX_SUM = UPGRADES.reduce((a, u) => a + u.max, 0);
export const villageLevel = (up) => { let s = 0; for (let i = 0; i < up.length; i++) s += up[i]; return 1 + Math.floor(s / 8); };
// производные значения
export const wallMax = (up) => 100 + 25 * up[0];
export const archerCount = (up) => up[1];
export const arrowDmg = (up) => 1 + 0.5 * up[2];
export const arrowCd = (up) => Math.max(0.5, 2.2 * Math.pow(0.93, up[2]));
export const fenceCount = (up) => Math.min(3, up[3]);
export const spikeDps = (up) => Math.max(0, up[3] - 3) * 0.6;
export const clickDmg = (up) => 1 + 0.5 * up[4];
export const bellHeal = (up) => 0.05 + 0.03 * up[5];
