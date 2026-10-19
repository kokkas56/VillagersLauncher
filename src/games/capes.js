// Плащи-награды: рисуются кодом в текстуру 64×32 (развёртка плаща Minecraft).
// Лицевая сторона (видна со спины игрока) — x 1..10, y 1..16; изнанка — x 12..21; бока — x 0 и 11; верх/низ — y 0.
// Своё оформление: бархат со складками, вышивка, кайма, подкладка с монограммой.

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

// узоры-вышивки 7×7 и 5×5 ('#' — нить, 'o' — блик, '.' — пусто)
const EMB = {
  key: ['..###..', '.#...#.', '.#.o.#.', '..###..', '...#...', '...##..', '...#.#.', '...##..'],
  fish: ['.......', '.####..#', '#o####.#', '#######.', '.####..#', '........'],
  shield: ['#######', '#ooooo#', '#o###o#', '#o#o#o#', '.#o#o#.', '..#o#..', '...#...'],
  boot: ['..###..', '..#o#..', '..#o#..', '..#o#..', '.#oo###', '#ooooo#', '#######'],
  target: ['.#####.', '#ooooo#', '#o###o#', '#o#o#o#', '#o###o#', '#ooooo#', '.#####.'],
  pick: ['.#####.', '#o...o#', '...#...', '...#...', '...#...', '...#...', '...#...'],
  k: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  star: ['..#..', '.###.', '#####', '.#.#.', '#...#'],
  chain: ['.##.', '#..#', '.##.']
};

const DEFS = {
  // Плащ беглеца — вручает сам Кокк: тёмно-алый бархат, золотая двойная кайма, ключ и цепи, звёзды, подкладка с «K»
  runaway: { base: '#7a1622', dark: '#3a0810', light: '#b23040', trim: '#ffd34a', trim2: '#a87a18', lining: '#1a1420', mono: '#ffd34a', emb: 'key', embC: '#ffd34a', extra: 'chains', stars: '#ffe9a0' },
  fisher: { base: '#1f5a80', dark: '#0e2c44', light: '#3a8ac0', trim: '#d8f0ff', trim2: '#7ab0d0', lining: '#0c2030', mono: '#d8f0ff', emb: 'fish', embC: '#ffe08a', extra: 'waves' },
  defender: { base: '#5a2a18', dark: '#2a120a', light: '#8a4a2a', trim: '#c9b48a', trim2: '#7a6a4a', lining: '#1e140c', mono: '#c9b48a', emb: 'shield', embC: '#d8dce0', extra: 'planks' },
  runner: { base: '#b85a1a', dark: '#5a2a08', light: '#e08a40', trim: '#ffe0b0', trim2: '#b88a50', lining: '#2a1608', mono: '#ffe0b0', emb: 'boot', embC: '#ffe0b0', extra: 'chevrons' },
  archer: { base: '#245020', dark: '#0e2a0c', light: '#3e7a34', trim: '#e0c070', trim2: '#8a7030', lining: '#0c1a0a', mono: '#e0c070', emb: 'target', embC: '#e05050', extra: 'leaves' },
  miner: { base: '#24242c', dark: '#0c0c12', light: '#3c3c48', trim: '#8fd0ff', trim2: '#4a7a9a', lining: '#0a0a10', mono: '#8fd0ff', emb: 'pick', embC: '#c0c8d0', extra: 'gems' }
};

export function drawCape(g, id) {
  const d = DEFS[id];
  if (!d) return false;
  const B = hex(d.base), D = hex(d.dark), L = hex(d.light), T = hex(d.trim), T2 = hex(d.trim2), LN = hex(d.lining);
  const px = (x, y, c, a = 1) => { g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; g.fillRect(x, y, 1, 1); };
  // ткань со складками: вертикальные волны света + затемнение книзу и к краям
  const cloth = (x0, inner) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) {
      const fold = Math.sin((x + 0.5) * 1.25 + (inner ? 1.4 : 0)) * 0.5 + 0.5; // 0..1
      const down = y / 15;
      let c = inner ? mix(LN, shade(LN, 1.5), fold * 0.4) : mix(D, mix(B, L, fold * 0.7), 0.55 + fold * 0.45);
      c = shade(c, 1 - down * 0.25 - (x === 0 || x === 9 ? 0.12 : 0));
      if (!inner && (x * 7 + y * 3) % 11 === 0) c = shade(c, 1.08); // ворс
      px(x0 + x, 1 + y, c);
    }
  };
  cloth(1, false);
  cloth(12, true);
  // бока, верх, низ
  for (let y = 1; y < 17; y++) { px(0, y, shade(B, 0.7)); px(11, y, shade(B, 0.7)); }
  for (let x = 1; x < 11; x++) { px(x, 0, shade(B, 0.85)); px(x + 10, 0, shade(T2, 1)); }

  const F = 1; // лицевая сторона
  // двойная кайма
  for (let y = 1; y < 17; y++) { px(F, y, T); px(F + 9, y, T); px(F + 1, y, T2, 0.8); px(F + 8, y, T2, 0.8); }
  for (let x = 0; x < 10; x++) { px(F + x, 16, T); px(F + x, 15, T2, 0.8); px(F + x, 1, T2); }
  // бахрома снизу
  for (let x = 0; x < 10; x += 2) px(F + x, 16, shade(T, 1.15));
  // узоры фона
  const ex = d.extra;
  for (let y = 3; y < 15; y++) for (let x = 2; x < 8; x++) {
    let on = false;
    if (ex === 'chains') on = (y === 13 && x % 2 === 0) || (y === 12 && x % 2 === 1);
    if (ex === 'waves') on = (y === 11 || y === 14) && (x + y) % 3 === 0;
    if (ex === 'planks') on = y % 4 === 0;
    if (ex === 'chevrons') on = y === 11 + Math.abs(x - 4.5) * 0.7 >> 0 || y === 13 + Math.abs(x - 4.5) * 0.7 >> 0;
    if (ex === 'leaves') on = (x * 3 + y * 5) % 9 === 0 && y > 10;
    if (ex === 'gems') on = (x * 5 + y * 3) % 8 === 0 && y > 10;
    if (on) px(F + x, y, ex === 'gems' ? hex(['#8fd0ff', '#55dd77', '#ffd34a', '#e05050'][(x + y) % 4]) : T2, 0.9);
  }
  // вышитая эмблема по центру (с тенью и бликом)
  const art = EMB[d.emb];
  const w = Math.max(...art.map((r) => r.length)), ox = F + Math.floor((10 - w) / 2), oy = 3;
  const E = hex(d.embC);
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    px(ox + x + 1, oy + y + 1, shade(D, 0.8), 0.7); // тень
  }));
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') px(ox + x, oy + y, E);
    else if (ch === 'o') px(ox + x, oy + y, mix(E, [255, 255, 255], 0.55));
  }));
  // звёзды-искры (у плаща беглеца)
  if (d.stars) { const S = hex(d.stars); [[2, 3], [7, 2], [3, 10], [7, 9]].forEach(([x, y]) => px(F + x, y, S)); }
  // подкладка: монограмма «K» и золотой кант
  const M = hex(d.mono);
  EMB.k.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(12 + 3 + x, 6 + y, M, 0.85); }));
  for (let y = 1; y < 17; y++) { px(12, y, T2, 0.7); px(21, y, T2, 0.7); }
  return true;
}

export function capeDataUrl(id) {
  if (!DEFS[id] || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  drawCape(g, id);
  return c.toDataURL('image/png');
}
export const CAPE_IDS = Object.keys(DEFS);
