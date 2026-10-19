// Декорации десяти тюрем: статичный фон (рисуется один раз в отдельный холст) и живые мелочи
// (огонь горна, факелы, окна день/ночь, капель, светлячки, снег, качка, летучие мыши, руны, туман, Кокк на балконе).
import { W, H, FLOOR, CRATE_X, PRISONS } from './config.js';
import { alphaTable, pickA, mixC } from './art.js';
import { drawKokkBust } from './kokk.js';

const MOONBEAM = alphaTable(170, 190, 255, 0.07);
const SUNBEAM = alphaTable(255, 220, 150, 0.09);
const NIGHT = alphaTable(10, 14, 40, 0.42);
const FOG = alphaTable(170, 200, 160, 0.16);
const MIST = alphaTable(140, 100, 200, 0.18);
const HEAT = alphaTable(255, 230, 180, 0.14);
const AUR = alphaTable(90, 255, 170, 0.35);
const FLY = alphaTable(220, 255, 120, 0.9);
const ARC = alphaTable(200, 140, 255, 0.5);
const VOIDE = alphaTable(160, 120, 255, 0.9);

const PANE_DAY = [138, 180, 226];
const PANE_NIGHT = [36, 44, 80];

// цвет-строки, зависящие от темноты — кэш на 8 ступеней
const SKY = [];
for (let i = 0; i < 8; i++) SKY.push(mixC(PANE_DAY, PANE_NIGHT, i / 7));
const DESERT_SKY = [];
for (let i = 0; i < 8; i++) DESERT_SKY.push(mixC([150, 200, 240], [30, 30, 70], i / 7));
const SEA = [];
for (let i = 0; i < 8; i++) SEA.push(mixC([60, 120, 170], [16, 30, 56], i / 7));

export function makeScene(p, rand) {
  const def = PRISONS[p];
  const S = {
    p, def, pal: def.pal,
    glow: alphaTable(def.pal.glow[0], def.pal.glow[1], def.pal.glow[2], 0.17),
    glow2: alphaTable(def.pal.glow[0], def.pal.glow[1], def.pal.glow[2], 0.1),
    seed: Math.floor(rand() * 1e9),
    bricks: [], stones: [], dots: [],
    parts: [], // мелкие частицы сцены (снег, светлячки, пыль, книги...)
    drops: [], tDrop: 2,
    sway: 0, shake: 0,
    kk: { look: 0, t: 0, act: 0, wave: 0 }, // Кокк на балконе
    ev: 0, evT: 6 // случайные мелкие события
  };
  for (let i = 0; i < 3; i++) S.drops.push({ on: false, x: 0, y: 0, vy: 0, t: 0 });
  const n = { 3: 10, 4: 3, 5: 40, 7: 8, 8: 5, 9: 14, 10: 6, 6: 6, 2: 8, 1: 0 }[p] || 0;
  for (let i = 0; i < n; i++) S.parts.push({ x: rand() * W, y: rand() * FLOOR, vx: 0, vy: 0, a: rand() * 6.28, k: rand() });
  // кирпичи / блоки
  const bw = p === 2 ? 36 : p === 5 ? 28 : p === 7 ? 0 : 18;
  const bh = p === 2 ? 18 : p === 5 ? 14 : 9;
  if (bw) for (let row = 0; row * bh < FLOOR; row++) {
    const off = row & 1 ? bw / 2 : 0;
    for (let x = -off; x < W; x += bw) { const r = rand(); if (r < 0.3) S.bricks.push(x + 1, row * bh + 1, bw - 1, bh - 1, r < 0.13 ? 0 : 1); }
  }
  for (let i = 0; i < 44; i++) S.stones.push(Math.floor(rand() * W), FLOOR + 6 + Math.floor(rand() * 26), 2 + Math.floor(rand() * 3));
  for (let i = 0; i < 60; i++) S.dots.push(Math.floor(rand() * W), Math.floor(rand() * FLOOR), Math.floor(rand() * 4));
  return S;
}

// ---------------- статичный фон ----------------
function bricks(ctx, S, bw, bh) {
  const P = S.pal;
  ctx.fillStyle = P.wall; ctx.fillRect(0, 0, W, FLOOR);
  ctx.fillStyle = P.wall2;
  for (let y = 0; y < FLOOR; y += bh) ctx.fillRect(0, y, W, 1);
  for (let row = 0; row * bh < FLOOR; row++) {
    const off = row & 1 ? bw / 2 : 0;
    for (let x = -off; x < W; x += bw) ctx.fillRect(x, row * bh, 1, bh);
  }
  for (let i = 0; i < S.bricks.length; i += 5) {
    ctx.fillStyle = S.bricks[i + 4] ? P.brick : P.brick2;
    ctx.fillRect(S.bricks[i], S.bricks[i + 1], S.bricks[i + 2], S.bricks[i + 3]);
  }
}
function ground(ctx, S, tile) {
  const P = S.pal;
  ctx.fillStyle = P.floor; ctx.fillRect(0, FLOOR, W, 4);
  ctx.fillStyle = P.floor2;
  for (let x = 0; x < W; x += tile) ctx.fillRect(x, FLOOR, tile - 1, 1);
  ctx.fillStyle = P.earth; ctx.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
  ctx.fillStyle = P.earth2;
  for (let i = 0; i < S.stones.length; i += 3) ctx.fillRect(S.stones[i], S.stones[i + 1], S.stones[i + 2], 2);
}
function forgeBody(ctx, S) {
  const P = S.pal;
  ctx.fillStyle = P.wall2; ctx.fillRect(18, 40, 46, 10); ctx.fillRect(28, 0, 26, 40);
  ctx.fillStyle = P.brick2; ctx.fillRect(16, 112, 50, FLOOR - 112);
  ctx.fillStyle = P.brick; ctx.fillRect(16, 112, 50, 3);
  ctx.fillStyle = '#1c1416'; ctx.fillRect(22, 118, 38, 14);
}
function crate(ctx, x, c1, c2) {
  ctx.fillStyle = c1; ctx.fillRect(x, FLOOR - 16, 26, 16);
  ctx.fillStyle = c2; ctx.fillRect(x, FLOOR - 16, 26, 2); ctx.fillRect(x, FLOOR - 9, 26, 1);
}
function bellHook(ctx) { ctx.fillStyle = '#4a4248'; ctx.fillRect(186, 6, 14, 2); ctx.fillRect(192, 8, 2, 3); }

export function drawStatic(ctx, S) {
  const p = S.p;
  const P = S.pal;
  if (p === 1) {
    bricks(ctx, S, 18, 9);
    ctx.fillStyle = '#1a1a2c'; ctx.fillRect(236, 16, 30, 22);
    forgeBody(ctx, S); bellHook(ctx);
    ctx.fillStyle = '#16121a'; ctx.fillRect(302, FLOOR - 5, 8, 5); ctx.fillRect(303, FLOOR - 6, 6, 1);
    ground(ctx, S, 16);
    // цепи на стене
    ctx.fillStyle = '#4b4e56'; for (let y = 60; y < 96; y += 4) { ctx.fillRect(282, y, 2, 3); ctx.fillRect(296, y + 2, 2, 3); }
    crate(ctx, CRATE_X, '#5a3c22', '#7a5430');
  } else if (p === 2) {
    bricks(ctx, S, 36, 18);
    // бойницы
    ctx.fillStyle = '#1a1a24'; ctx.fillRect(244, 18, 8, 30); ctx.fillRect(276, 18, 8, 30);
    // герб и щиты
    ctx.fillStyle = '#3a3c42'; ctx.fillRect(126, 22, 2, 4);
    ctx.fillStyle = '#7a7c84'; ctx.fillRect(118, 26, 18, 18); ctx.fillStyle = '#2a4a8a'; ctx.fillRect(120, 28, 14, 14);
    ctx.fillStyle = '#e0c040'; ctx.fillRect(126, 30, 2, 10); ctx.fillRect(122, 33, 10, 2);
    // решётка ворот справа
    ctx.fillStyle = '#18181e'; ctx.fillRect(296, 80, 24, FLOOR - 80);
    ctx.fillStyle = '#5a5c64'; for (let x = 298; x < 320; x += 5) ctx.fillRect(x, 80, 2, FLOOR - 80); for (let y = 86; y < FLOOR; y += 10) ctx.fillRect(296, y, 24, 2);
    forgeBody(ctx, S); bellHook(ctx);
    ground(ctx, S, 24);
    // собачья миска
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(268, FLOOR - 3, 9, 3); ctx.fillStyle = '#8a7a6a'; ctx.fillRect(268, FLOOR - 4, 9, 1);
    crate(ctx, CRATE_X, '#4a4038', '#6a5a4a');
  } else if (p === 3) {
    // частокол из брёвен
    ctx.fillStyle = '#5a6a5a'; ctx.fillRect(0, 0, W, 30); // небо в тумане (перекрывается живым небом)
    for (let x = 0; x < W; x += 10) {
      const top = 14 + ((x * 7) % 9);
      ctx.fillStyle = (x / 10) & 1 ? P.brick : P.brick2; ctx.fillRect(x, top, 9, FLOOR - top);
      ctx.fillStyle = P.wall2; ctx.fillRect(x + 9, top, 1, FLOOR - top);
      ctx.fillStyle = '#6a5e38'; ctx.fillRect(x + 1, top, 7, 2); ctx.fillRect(x + 3, top - 2, 3, 2);
    }
    ctx.fillStyle = P.wall2; ctx.fillRect(0, 60, W, 3); ctx.fillRect(0, 110, W, 3); // связки
    // мох и лианы
    ctx.fillStyle = '#4a6a2e'; for (let i = 0; i < S.dots.length; i += 3) if (S.dots[i + 2] === 0) ctx.fillRect(S.dots[i], S.dots[i + 1], 3, 2);
    ctx.fillStyle = '#3a5a26'; for (let x = 130; x < 300; x += 37) for (let y = 14; y < 50 + (x % 30); y += 3) ctx.fillRect(x + ((y >> 2) & 1), y, 1, 2);
    forgeBody(ctx, S); bellHook(ctx);
    ground(ctx, S, 12);
    // пруд у горна
    ctx.fillStyle = '#2a3a26'; ctx.fillRect(66, FLOOR - 1, 40, 6);
    ctx.fillStyle = '#3a5a5a'; ctx.fillRect(68, FLOOR, 36, 4);
    ctx.fillStyle = '#4a6a3a'; for (let x = 66; x < 108; x += 7) { ctx.fillRect(x, FLOOR - 8 - (x % 3), 1, 8 + (x % 3)); ctx.fillRect(x + 1, FLOOR - 10, 1, 3); }
    crate(ctx, CRATE_X, '#4a3a22', '#6a5430');
  } else if (p === 4) {
    // небо и край ямы наверху
    ctx.fillStyle = '#a0c8e8'; ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = '#d8b878'; ctx.fillRect(0, 44, W, 14);
    ctx.fillStyle = '#e8c890'; ctx.fillRect(0, 44, W, 2);
    ctx.fillStyle = '#c8a464'; for (let x = 0; x < W; x += 9) ctx.fillRect(x, 48 + (x % 4), 4, 1);
    // стены ямы — песчаник слоями
    ctx.fillStyle = P.wall; ctx.fillRect(0, 58, W, FLOOR - 58);
    for (let y = 62; y < FLOOR; y += 11) { ctx.fillStyle = (y / 11) & 1 ? P.brick : P.brick2; ctx.fillRect(0, y, W, 6); }
    ctx.fillStyle = P.wall2; for (let i = 0; i < S.dots.length; i += 3) if (S.dots[i + 1] > 60) ctx.fillRect(S.dots[i], S.dots[i + 1], 2 + S.dots[i + 2], 1);
    // кости и череп быка
    ctx.fillStyle = '#e8e0c8'; ctx.fillRect(282, FLOOR - 4, 10, 3); ctx.fillRect(280, FLOOR - 7, 3, 3); ctx.fillRect(291, FLOOR - 7, 3, 3); ctx.fillStyle = '#2a1a0c'; ctx.fillRect(284, FLOOR - 3, 1, 1); ctx.fillRect(288, FLOOR - 3, 1, 1);
    // кактус на краю
    ctx.fillStyle = '#4a8a3a'; ctx.fillRect(150, 30, 4, 14); ctx.fillRect(146, 34, 2, 6); ctx.fillRect(146, 34, 4, 2); ctx.fillRect(156, 32, 2, 6); ctx.fillRect(154, 36, 4, 2);
    // горн — открытый костёр в камнях
    ctx.fillStyle = '#8a6a44'; ctx.fillRect(16, 126, 50, FLOOR - 126); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(16, 126, 50, 2);
    ctx.fillStyle = '#1c1416'; ctx.fillRect(22, 130, 38, 6);
    ground(ctx, S, 20);
    crate(ctx, CRATE_X, '#8a6438', '#a87a44');
    // навес над колоколом
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(182, 60, 2, 20); ctx.fillRect(202, 60, 2, 20); ctx.fillRect(180, 60, 26, 2);
  } else if (p === 5) {
    bricks(ctx, S, 28, 14);
    // иней и блеск льда
    ctx.fillStyle = '#e8f6ff'; for (let i = 0; i < S.dots.length; i += 3) if (S.dots[i + 2] < 2) ctx.fillRect(S.dots[i], S.dots[i + 1], 2, 1);
    // большое окно
    ctx.fillStyle = '#5a7a9a'; ctx.fillRect(232, 12, 40, 32);
    forgeBody(ctx, S); bellHook(ctx);
    ground(ctx, S, 28);
    // сугробы у стен
    ctx.fillStyle = '#f0faff'; ctx.fillRect(270, FLOOR - 4, 50, 4); ctx.fillRect(280, FLOOR - 6, 30, 2); ctx.fillRect(0, FLOOR - 3, 14, 3);
    crate(ctx, CRATE_X, '#6a5a4a', '#8a7a6a');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(CRATE_X, FLOOR - 17, 26, 1);
  } else if (p === 6) {
    // трюм: доски, шпангоуты
    ctx.fillStyle = P.wall; ctx.fillRect(0, 0, W, FLOOR);
    for (let y = 0; y < FLOOR; y += 8) { ctx.fillStyle = (y >> 3) & 1 ? P.brick : P.brick2; ctx.fillRect(0, y, W, 7); ctx.fillStyle = P.wall2; ctx.fillRect(0, y + 7, W, 1); }
    ctx.fillStyle = '#3a2814'; for (let i = 0; i < S.dots.length; i += 3) ctx.fillRect(S.dots[i], S.dots[i + 1] - (S.dots[i + 1] % 8) + 3, 1, 1);
    ctx.fillStyle = '#3e2a16'; for (let x = 90; x < W; x += 70) { ctx.fillRect(x, 0, 6, FLOOR); ctx.fillStyle = '#4e3620'; ctx.fillRect(x, 0, 2, FLOOR); ctx.fillStyle = '#3e2a16'; }
    ctx.fillRect(0, 0, W, 6);
    // иллюминаторы (стекло — вживую)
    ctx.fillStyle = '#8a7040'; ctx.fillRect(240, 26, 22, 22); ctx.fillRect(130, 30, 18, 18);
    // бочки и канаты
    ctx.fillStyle = '#6a4424'; ctx.fillRect(266, FLOOR - 22, 18, 22); ctx.fillRect(286, FLOOR - 18, 16, 18);
    ctx.fillStyle = '#4a4a50'; ctx.fillRect(266, FLOOR - 17, 18, 2); ctx.fillRect(266, FLOOR - 7, 18, 2); ctx.fillRect(286, FLOOR - 14, 16, 2); ctx.fillRect(286, FLOOR - 6, 16, 2);
    ctx.fillStyle = '#c8b080'; ctx.fillRect(304, FLOOR - 6, 12, 6); ctx.fillStyle = '#a89060'; ctx.fillRect(306, FLOOR - 4, 8, 1);
    // гамак
    ctx.fillStyle = '#c8b890'; for (let x = 0; x < 40; x++) ctx.fillRect(170 + x, 40 + Math.round(Math.sin((x / 40) * Math.PI) * 8), 1, 2);
    forgeBody(ctx, S);
    // палуба и трюмная вода внизу
    ctx.fillStyle = P.floor; ctx.fillRect(0, FLOOR, W, 4);
    ctx.fillStyle = P.floor2; for (let x = 0; x < W; x += 30) ctx.fillRect(x, FLOOR, 29, 1);
    ctx.fillStyle = '#2a1e12'; ctx.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
    ctx.fillStyle = '#3a2a1a'; for (let y = FLOOR + 6; y < H; y += 6) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = '#4a4a48'; for (let i = 0; i < S.stones.length; i += 3) ctx.fillRect(S.stones[i], S.stones[i + 1], S.stones[i + 2] + 2, 3);
    crate(ctx, CRATE_X, '#5a3c22', '#7a5430');
  } else if (p === 7) {
    // скальная стена с жилами
    ctx.fillStyle = P.wall; ctx.fillRect(0, 0, W, FLOOR);
    for (let i = 0; i < S.dots.length; i += 3) {
      const t = S.dots[i + 2];
      ctx.fillStyle = t === 0 ? P.brick : t === 1 ? P.brick2 : t === 2 ? P.wall2 : P.brick;
      ctx.fillRect(S.dots[i], S.dots[i + 1], 8 + t * 3, 5 + t);
    }
    ctx.fillStyle = '#e0b030'; for (let i = 0; i < S.dots.length; i += 9) ctx.fillRect(S.dots[i] + 3, S.dots[i + 1] + 2, 2, 1);
    ctx.fillStyle = '#50c0e8'; for (let i = 3; i < S.dots.length; i += 15) ctx.fillRect(S.dots[i] + 1, S.dots[i + 1] + 3, 2, 2);
    ctx.fillStyle = '#c03a3a'; for (let i = 6; i < S.dots.length; i += 21) ctx.fillRect(S.dots[i] + 4, S.dots[i + 1], 2, 1);
    // крепь
    ctx.fillStyle = P.beam; for (let x = 96; x < W; x += 84) { ctx.fillRect(x, 20, 5, FLOOR - 20); }
    ctx.fillRect(0, 16, W, 5); ctx.fillStyle = '#5a4024'; ctx.fillRect(0, 20, W, 1);
    // рельсы и вагонетка
    ctx.fillStyle = '#5a4a3a'; for (let x = 180; x < W; x += 8) ctx.fillRect(x, FLOOR - 2, 4, 2);
    ctx.fillStyle = '#8a8a94'; ctx.fillRect(180, FLOOR - 3, W - 180, 1);
    ctx.fillStyle = '#4a4a54'; ctx.fillRect(268, FLOOR - 16, 30, 12); ctx.fillStyle = '#6a6a74'; ctx.fillRect(268, FLOOR - 16, 30, 2);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(272, FLOOR - 5, 5, 5); ctx.fillRect(289, FLOOR - 5, 5, 5);
    ctx.fillStyle = '#e0b030'; ctx.fillRect(272, FLOOR - 19, 4, 3); ctx.fillStyle = '#50c0e8'; ctx.fillRect(280, FLOOR - 18, 3, 2); ctx.fillStyle = '#8a8a8a'; ctx.fillRect(286, FLOOR - 19, 6, 3);
    forgeBody(ctx, S); bellHook(ctx);
    ground(ctx, S, 14);
    crate(ctx, CRATE_X, '#5a4430', '#7a5a3a');
  } else if (p === 8) {
    bricks(ctx, S, 18, 9);
    // стрельчатое окно
    ctx.fillStyle = '#100c20'; ctx.fillRect(236, 14, 28, 34); ctx.fillRect(240, 10, 20, 4); ctx.fillRect(244, 7, 12, 3);
    // книжные полки
    ctx.fillStyle = '#3a2618'; ctx.fillRect(120, 30, 48, 50);
    const bc = ['#8a2a2a', '#2a5a8a', '#3a7a3a', '#8a6a2a', '#6a3a8a'];
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(120, 30 + r * 12 + 10, 48, 2);
      for (let x = 122, i = r; x < 166; i++) { const w = 2 + ((i * 7) % 3); ctx.fillStyle = bc[i % 5]; ctx.fillRect(x, 32 + r * 12 + ((i * 3) % 2), w, 8 - ((i * 3) % 2)); x += w + 1; }
    }
    // звёздные знаки на стенах
    ctx.fillStyle = '#6a5a9a'; for (let i = 0; i < S.dots.length; i += 3) if (S.dots[i + 2] === 0) { ctx.fillRect(S.dots[i], S.dots[i + 1], 1, 3); ctx.fillRect(S.dots[i] - 1, S.dots[i + 1] + 1, 3, 1); }
    forgeBody(ctx, S); bellHook(ctx);
    ground(ctx, S, 18);
    // котёл
    ctx.fillStyle = '#2a2a34'; ctx.fillRect(272, FLOOR - 14, 22, 12); ctx.fillRect(270, FLOOR - 15, 26, 2); ctx.fillRect(274, FLOOR - 2, 3, 2); ctx.fillRect(289, FLOOR - 2, 3, 2);
    crate(ctx, CRATE_X, '#3a2a4a', '#5a4a6a');
  } else if (p === 9) {
    // пустота с далёкими руинами
    ctx.fillStyle = '#0e0a16'; ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = '#16101e'; for (let i = 0; i < 6; i++) { const x = 20 + i * 52, h = 30 + ((i * 37) % 40); ctx.fillRect(x, 60 - (h >> 1), 10, h); ctx.fillRect(x - 3, 60 - (h >> 1), 16, 3); }
    ctx.fillStyle = '#1e1828'; for (let i = 0; i < S.dots.length; i += 3) if (S.dots[i + 1] > 70) ctx.fillRect(S.dots[i], S.dots[i + 1], 6 + S.dots[i + 2] * 2, 4);
    // обломки стены вблизи
    ctx.fillStyle = P.brick2; ctx.fillRect(0, 70, 96, FLOOR - 70); ctx.fillRect(226, 84, 94, FLOOR - 84);
    ctx.fillStyle = P.brick; for (let y = 72; y < FLOOR; y += 9) { ctx.fillRect(2, y, 40, 7); ctx.fillRect(48, y + 4, 44, 4); ctx.fillRect(230, y + 12 > FLOOR ? FLOOR - 2 : y + 12, 40, 6); }
    // трещины со светом рисуются вживую
    // цепи
    ctx.fillStyle = '#2a2638'; for (let y = 0; y < 60; y += 4) { ctx.fillRect(180, y, 2, 3); ctx.fillRect(296, y + 2, 2, 3); }
    forgeBody(ctx, S);
    ground(ctx, S, 22);
    crate(ctx, CRATE_X, '#2a2236', '#3a3248');
  } else {
    // зал: красные стены, золотая кайма, колонны, балкон
    ctx.fillStyle = P.wall; ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = P.wall2; for (let x = 0; x < W; x += 16) ctx.fillRect(x, 0, 1, FLOOR);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(0, 100, W, 2); ctx.fillRect(0, 8, W, 2);
    ctx.fillStyle = P.brick; ctx.fillRect(0, 102, W, FLOOR - 102);
    ctx.fillStyle = '#8a6a30'; for (let x = 4; x < W; x += 12) ctx.fillRect(x, 104, 6, 1);
    // колонны
    for (let x = 96; x < 230; x += 64) {
      ctx.fillStyle = '#8a7a6a'; ctx.fillRect(x, 12, 12, FLOOR - 12);
      ctx.fillStyle = '#a89a88'; ctx.fillRect(x + 2, 12, 3, FLOOR - 12);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(x - 2, 12, 16, 4); ctx.fillRect(x - 2, FLOOR - 6, 16, 6);
    }
    // знамёна с гербом «К»
    for (let x = 116; x < 230; x += 64) {
      ctx.fillStyle = '#8a1818'; ctx.fillRect(x, 20, 18, 36); ctx.fillRect(x, 56, 6, 4); ctx.fillRect(x + 12, 56, 6, 4);
      ctx.fillStyle = '#e0b040'; ctx.fillRect(x, 20, 18, 2);
      ctx.fillRect(x + 5, 28, 2, 14); ctx.fillRect(x + 7, 34, 2, 2); ctx.fillRect(x + 9, 32, 2, 2); ctx.fillRect(x + 11, 30, 2, 2); ctx.fillRect(x + 9, 36, 2, 2); ctx.fillRect(x + 11, 38, 2, 4);
    }
    // балкон Кокка
    ctx.fillStyle = '#2a1414'; ctx.fillRect(226, 14, 74, 42); // ниша
    ctx.fillStyle = '#3a1e1e'; ctx.fillRect(230, 18, 66, 38);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(224, 12, 78, 3);
    ctx.fillStyle = '#6a5a44'; ctx.fillRect(220, 56, 86, 5);
    ctx.fillStyle = '#8a7656'; ctx.fillRect(220, 56, 86, 1);
    ctx.fillStyle = '#5a4a34'; for (let x = 228; x < 304; x += 18) ctx.fillRect(x, 61, 4, 10);
    ctx.fillRect(224, 61, 78, 2);
    forgeBody(ctx, S); bellHook(ctx);
    // ковровая дорожка
    ctx.fillStyle = P.floor; ctx.fillRect(0, FLOOR, W, 4); ctx.fillStyle = '#a02020'; ctx.fillRect(90, FLOOR, 150, 3); ctx.fillStyle = '#e0b040'; ctx.fillRect(90, FLOOR, 150, 1);
    ctx.fillStyle = P.earth; ctx.fillRect(0, FLOOR + 4, W, H - FLOOR - 4);
    ctx.fillStyle = P.earth2; for (let i = 0; i < S.stones.length; i += 3) ctx.fillRect(S.stones[i], S.stones[i + 1], S.stones[i + 2], 2);
    crate(ctx, CRATE_X, '#6a4a2a', '#c8a040');
  }
}

// ---------------- живые мелочи ----------------
export function updateScene(S, dt, clk, rand, idle) {
  const p = S.p;
  // капель
  if (p === 1 || p === 2 || p === 5 || p === 7 || p === 6) {
    S.tDrop -= dt;
    if (S.tDrop <= 0) {
      S.tDrop = 2.5 + rand() * 4;
      for (let i = 0; i < S.drops.length; i++) {
        const d = S.drops[i];
        if (d.on) continue;
        d.on = true; d.x = 120 + Math.floor(rand() * 170); d.y = p === 4 ? 58 : 1; d.vy = 0; d.t = 0;
        break;
      }
    }
    for (let i = 0; i < S.drops.length; i++) {
      const d = S.drops[i];
      if (!d.on) continue;
      d.t += dt;
      if (d.t < 0.8) continue;
      d.vy += 260 * dt;
      d.y += d.vy * dt;
      if (d.y >= FLOOR) d.on = false;
    }
  }
  const ps = S.parts;
  if (p === 3) { // светлячки
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.a += dt * (0.6 + q.k); q.x += Math.cos(q.a) * 8 * dt; q.y += Math.sin(q.a * 1.3) * 5 * dt; if (q.x < 100) q.x = 300; if (q.x > 310) q.x = 110; if (q.y < 30) q.y = 30; if (q.y > FLOOR - 6) q.y = FLOOR - 6; }
  } else if (p === 5) { // снег за окном и у сугробов
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.y += (10 + q.k * 14) * dt; q.x += Math.sin(clk + q.a) * 4 * dt; if (q.y > 44) { q.y = 12; q.x = 233 + rand() * 38; } if (q.x < 233) q.x = 270; if (q.x > 271) q.x = 234; }
  } else if (p === 4) { // грифы в небе
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.a += dt * (0.25 + q.k * 0.1); }
  } else if (p === 7) { // летучие мыши под потолком
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.a += dt * (1 + q.k); q.x += (20 + q.k * 20) * dt * (i & 1 ? 1 : -1); q.y = 30 + Math.sin(q.a) * 8 + (i % 3) * 6; if (q.x > W + 10) q.x = -10; if (q.x < -10) q.x = W + 10; }
  } else if (p === 8) { // парящие книги
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.a += dt * (0.8 + q.k * 0.4); }
  } else if (p === 9 || p === 2 || p === 10 || p === 6) { // туман, пылинки, искры
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; q.x += (p === 9 ? 6 : 3) * dt * (0.5 + q.k); q.a += dt; if (q.x > W + 20) { q.x = -20; q.y = rand() * FLOOR; } }
  }
  if (p === 6) S.sway = Math.sin(clk * 0.9) * 1.6;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  // Кокк на балконе
  if (p === 10) {
    const k = S.kk;
    k.t -= dt;
    if (k.t <= 0) {
      const r = rand();
      k.act = r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3; // 0 смотрит, 1 поворачивает голову, 2 машет, 3 отходит
      k.t = 2.5 + rand() * 4;
      k.look = k.act === 1 ? (rand() < 0.5 ? -1 : 1) : 0;
    }
  }
  S.evT -= dt;
  if (S.evT <= 0) { S.evT = 8 + rand() * 10; S.ev = rand(); }
}

// задний план: окна, свет, горн, факелы — до персонажей
export function drawBack(ctx, S, clk, dark, bellT, crateN) {
  const p = S.p;
  const P = S.pal;
  const di = Math.round(dark * 7);
  // окна и небо
  if (p === 1) {
    ctx.fillStyle = SKY[di]; ctx.fillRect(238, 18, 26, 18);
    if (dark > 0.5) { ctx.fillStyle = '#e8ecf4'; ctx.fillRect(255, 21, 4, 4); }
    else { ctx.fillStyle = '#e8f0ff'; ctx.fillRect(242, 24, 7, 2); ctx.fillRect(244, 23, 3, 1); }
    ctx.fillStyle = '#5a5866'; for (let x = 241; x < 264; x += 6) ctx.fillRect(x, 16, 2, 22);
    ctx.fillStyle = dark > 0.5 ? pickA(MOONBEAM, 0.85) : pickA(SUNBEAM, 1 - dark);
    for (let i = 0; i < 6; i++) ctx.fillRect(232 - i * 6, 38 + i * 18, 34 + i * 4, 18);
  } else if (p === 2) {
    ctx.fillStyle = SKY[di]; ctx.fillRect(246, 20, 4, 26); ctx.fillRect(278, 20, 4, 26);
    ctx.fillStyle = dark > 0.5 ? pickA(MOONBEAM, 0.9) : pickA(SUNBEAM, 1 - dark);
    for (let i = 0; i < 5; i++) { ctx.fillRect(240 - i * 7, 46 + i * 20, 10 + i * 2, 20); ctx.fillRect(272 - i * 7, 46 + i * 20, 10 + i * 2, 20); }
    // знамёна колышутся
    for (let b = 0; b < 2; b++) {
      const bx = 160 + b * 44;
      ctx.fillStyle = '#4a4c52'; ctx.fillRect(bx - 2, 18, 18, 2);
      for (let y = 0; y < 30; y++) { const o = Math.round(Math.sin(clk * 2 + y * 0.25 + b) * (y / 30) * 1.5); ctx.fillStyle = y < 2 ? '#e0c040' : '#2a4a8a'; ctx.fillRect(bx + o, 20 + y, 14, 1); }
      ctx.fillStyle = '#e0c040'; ctx.fillRect(bx + 5 + Math.round(Math.sin(clk * 2 + 3 + b) * 0.7), 30, 4, 6);
    }
  } else if (p === 3) {
    ctx.fillStyle = SKY[di]; ctx.fillRect(0, 0, W, 12);
    ctx.fillStyle = dark > 0.5 ? '#e8ecf4' : '#f0f0d0'; ctx.fillRect(270, 3, 5, 5);
  } else if (p === 4) {
    ctx.fillStyle = DESERT_SKY[di]; ctx.fillRect(0, 0, W, 44);
    // солнце или луна идёт по небу
    const sx = 40 + ((clk * 0.6) % 280);
    if (dark > 0.5) { ctx.fillStyle = '#e8ecf4'; ctx.fillRect(Math.round(sx), 10, 6, 6); }
    else { ctx.fillStyle = '#fff4b0'; ctx.fillRect(Math.round(sx) - 1, 8, 10, 10); ctx.fillStyle = '#ffd060'; ctx.fillRect(Math.round(sx), 9, 8, 8); }
    ctx.fillStyle = '#2a2018';
    for (let i = 0; i < S.parts.length; i++) {
      const q = S.parts[i];
      const vx = 200 + Math.cos(q.a) * (30 + i * 12), vy = 18 + Math.sin(q.a) * 6 + i * 4;
      const fl = Math.floor(clk * 4 + i) & 1;
      ctx.fillRect(Math.round(vx) - 3, Math.round(vy) - fl, 3, 1); ctx.fillRect(Math.round(vx), Math.round(vy), 2, 1); ctx.fillRect(Math.round(vx) + 2, Math.round(vy) - fl, 3, 1);
    }
    // дрожание горячего воздуха
    if (dark < 0.6) { ctx.fillStyle = pickA(HEAT, 1 - dark); for (let y = 70; y < FLOOR; y += 12) ctx.fillRect(Math.round(Math.sin(clk * 3 + y) * 4) + 100, y, 200, 1); }
  } else if (p === 5) {
    ctx.fillStyle = SKY[di]; ctx.fillRect(234, 14, 36, 28);
    if (dark > 0.4) {
      ctx.fillStyle = pickA(AUR, 0.5 + 0.5 * Math.sin(clk * 0.7));
      for (let x = 234; x < 270; x += 2) ctx.fillRect(x, 18 + Math.round(Math.sin(clk + x * 0.2) * 3), 2, 8);
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < S.parts.length; i++) { const q = S.parts[i]; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
    ctx.fillStyle = '#e8f6ff'; ctx.fillRect(250, 12, 2, 32); ctx.fillRect(232, 27, 40, 2);
    // сосульки
    ctx.fillStyle = '#d8f0ff';
    for (let x = 100; x < 320; x += 13) { const h = 4 + ((x * 7) % 9); ctx.fillRect(x, 0, 3, h); ctx.fillRect(x + 1, h, 1, 2); }
  } else if (p === 6) {
    // иллюминаторы с морем
    const sw = Math.round(Math.sin(clk * 0.9) * 2);
    for (let k = 0; k < 2; k++) {
      const cx = k ? 139 : 251, cy = k ? 39 : 37, r = k ? 7 : 8;
      ctx.fillStyle = SKY[di]; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = SEA[di]; ctx.fillRect(cx - r, cy + sw, r * 2, r - sw);
      ctx.fillStyle = '#c8e0f0'; ctx.fillRect(cx - r + ((clk * 6) | 0) % (r * 2), cy + sw, 2, 1);
      ctx.fillStyle = '#8a7040'; ctx.fillRect(cx - r, cy - r, r * 2, 1); ctx.fillRect(cx - r, cy + r - 1, r * 2, 1); ctx.fillRect(cx - r, cy - r, 1, r * 2); ctx.fillRect(cx + r - 1, cy - r, 1, r * 2);
    }
    ctx.fillStyle = dark > 0.5 ? pickA(MOONBEAM, 0.6) : pickA(SUNBEAM, 0.8 * (1 - dark));
    for (let i = 0; i < 5; i++) ctx.fillRect(244 - i * 8 + sw, 48 + i * 20, 16 + i * 2, 20);
    // качающийся фонарь
    const la = Math.sin(clk * 0.9 + 0.6) * 0.35;
    const lx = 200 + Math.round(Math.sin(la) * 18), ly = 6 + Math.round(Math.cos(la) * 18);
    ctx.fillStyle = '#4a4a50'; for (let i = 0; i < 16; i += 2) ctx.fillRect(200 + Math.round(Math.sin(la) * i), 6 + Math.round(Math.cos(la) * i), 1, 1);
    ctx.fillStyle = pickA(S.glow, 0.8); ctx.fillRect(lx - 16, ly - 10, 32, 32);
    ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - 3, ly, 7, 2); ctx.fillStyle = '#ffd060'; ctx.fillRect(lx - 2, ly + 2, 5, 5); ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - 3, ly + 7, 7, 1);
  } else if (p === 7) {
    // фонари на крепи
    for (let x = 98; x < W; x += 84) {
      const f = 0.75 + 0.25 * Math.sin(clk * 9 + x);
      ctx.fillStyle = pickA(S.glow, f); ctx.fillRect(x - 14, 22, 32, 34);
      ctx.fillStyle = '#3a3036'; ctx.fillRect(x - 2, 28, 7, 2); ctx.fillStyle = '#ffc050'; ctx.fillRect(x - 1, 30, 5, 5);
    }
    ctx.fillStyle = '#1a1418';
    for (let i = 0; i < S.parts.length; i++) {
      const q = S.parts[i];
      const fl = Math.floor(clk * 14 + i) & 1;
      const x = Math.round(q.x), y = Math.round(q.y);
      ctx.fillRect(x - 1, y, 3, 2); ctx.fillRect(x - 4, y - fl, 3, 1); ctx.fillRect(x + 2, y - fl, 3, 1);
    }
  } else if (p === 8) {
    // окно со звёздами и луной всегда
    ctx.fillStyle = '#1a1438'; ctx.fillRect(238, 16, 24, 30); ctx.fillRect(242, 12, 16, 4);
    ctx.fillStyle = '#f0e8ff'; ctx.fillRect(250, 20, 5, 5); ctx.fillStyle = '#1a1438'; ctx.fillRect(252, 20, 3, 3);
    ctx.fillStyle = '#c8c0ff'; for (let i = 0; i < 6; i++) if (((clk * 2 + i * 0.7) % 3) > 0.5) ctx.fillRect(240 + ((i * 7) % 20), 26 + ((i * 5) % 16), 1, 1);
    ctx.fillStyle = '#4a3c62'; ctx.fillRect(249, 12, 2, 34); ctx.fillRect(238, 30, 24, 2);
    // парящие книги
    for (let i = 0; i < S.parts.length; i++) {
      const q = S.parts[i];
      const x = 130 + i * 30 + Math.round(Math.cos(q.a) * 6), y = 92 + Math.round(Math.sin(q.a * 1.3) * 5) - (i % 2) * 14;
      const fl = Math.floor(clk * 3 + i) & 1;
      ctx.fillStyle = i % 2 ? '#8a2a2a' : '#2a5a8a'; ctx.fillRect(x, y, 7, 5);
      ctx.fillStyle = '#e8d8b0'; ctx.fillRect(x + 1, y + 1 - fl, 5, 3);
      ctx.fillStyle = pickA(ARC, 0.4); ctx.fillRect(x - 2, y + 6, 11, 1);
    }
    // котёл бурлит
    const b = Math.floor(clk * 3) % 4;
    ctx.fillStyle = '#50e070'; ctx.fillRect(273, FLOOR - 15, 20, 2);
    ctx.fillStyle = '#90ffa0'; ctx.fillRect(276 + b * 4, FLOOR - 17 - (b & 1), 2, 2); ctx.fillRect(286 - b * 2, FLOOR - 19 - ((b + 1) & 1) * 2, 2, 2);
    ctx.fillStyle = '#ff7020'; ctx.fillRect(276, FLOOR - 2, 14, 2);
  } else if (p === 9) {
    // светящиеся трещины и глаза во тьме
    const pl = 0.5 + 0.5 * Math.sin(clk * 1.3);
    ctx.fillStyle = pickA(VOIDE, 0.4 + 0.4 * pl);
    ctx.fillRect(40, 80, 1, 18); ctx.fillRect(41, 97, 1, 12); ctx.fillRect(260, 96, 1, 22); ctx.fillRect(261, 117, 1, 14);
    for (let i = 0; i < 3; i++) {
      const ph = (clk * 0.3 + i * 0.37 + S.ev) % 1;
      if (ph < 0.15) { const ex = 120 + i * 60 + ((i * 37) % 20), ey = 30 + i * 14; ctx.fillStyle = '#c8a0ff'; ctx.fillRect(ex, ey, 2, 1); ctx.fillRect(ex + 5, ey, 2, 1); }
    }
    ctx.fillStyle = pickA(MIST, 0.6);
    for (let i = 0; i < S.parts.length; i++) { const q = S.parts[i]; ctx.fillRect(Math.round(q.x), Math.round(q.y), 26 + Math.round(q.k * 20), 3); }
  } else if (p === 10) {
    // люстра
    const cx = 160;
    ctx.fillStyle = '#c8a040'; ctx.fillRect(cx, 0, 1, 14); ctx.fillRect(cx - 14, 14, 29, 2);
    for (let i = 0; i < 5; i++) {
      const x = cx - 14 + i * 7;
      ctx.fillStyle = '#f0e8d0'; ctx.fillRect(x, 10, 2, 4);
      ctx.fillStyle = (Math.floor(clk * 8 + i) & 1) ? '#ffe080' : '#ffb040'; ctx.fillRect(x, 8, 2, 2);
    }
    ctx.fillStyle = pickA(S.glow, 0.7); ctx.fillRect(cx - 40, 0, 80, 40);
  }

  // горн (у всех, кроме ямы — там костёр)
  const fl = 0.75 + 0.25 * Math.sin(clk * 11) * Math.sin(clk * 4.3);
  ctx.fillStyle = pickA(S.glow, (0.12 * fl + 0.05) / 0.17); ctx.fillRect(0, 70, 96, FLOOR - 70);
  ctx.fillStyle = pickA(S.glow2, fl); ctx.fillRect(10, 90, 70, FLOOR - 90);
  if (p === 4) {
    ctx.fillStyle = P.fire; ctx.fillRect(26, 124 - Math.round(fl * 4), 30, 8 + Math.round(fl * 4));
    ctx.fillStyle = P.fire2; ctx.fillRect(32 + Math.round(fl * 5), 122 - Math.round(fl * 3), 5, 6); ctx.fillRect(44 - Math.round(fl * 3), 124, 4, 5);
  } else {
    ctx.fillStyle = fl > 0.8 ? P.fire2 : P.fire; ctx.fillRect(24, 124, 34, 8);
    ctx.fillStyle = P.fire2; ctx.fillRect(28 + Math.round(fl * 6), 126, 4, 3); ctx.fillRect(44 - Math.round(fl * 4), 125, 5, 3);
    ctx.fillStyle = P.fire; ctx.fillRect(24, 130, 34, 2);
  }
  // факел у окна (кроме ямы и брига)
  if (p !== 4 && p !== 6) {
    const tf = 0.7 + 0.3 * Math.sin(clk * 13 + 2);
    ctx.fillStyle = pickA(S.glow2, tf); ctx.fillRect(196, 40, 34, 40);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(212, 58, 2, 10);
    ctx.fillStyle = P.fire; ctx.fillRect(211, 54, 4, 4);
    ctx.fillStyle = P.fire2; ctx.fillRect(212, 53 - Math.round(tf), 2, 2);
  }
  // колокол
  if (p !== 6) {
    const by = p === 4 ? 62 : 11;
    const bs = bellT > 0 ? Math.round(Math.sin(clk * 22) * 2) : 0;
    ctx.fillStyle = '#c8a040'; ctx.fillRect(189 + bs, by, 8, 6); ctx.fillRect(188 + bs, by + 5, 10, 2);
    ctx.fillStyle = '#e8c860'; ctx.fillRect(190 + bs, by, 2, 5);
    ctx.fillStyle = '#6a5020'; ctx.fillRect(192 + bs * 2, by + 7, 2, 2);
    if (bellT > 0 && ((clk * 8) | 0) & 1) {
      ctx.fillStyle = '#ffe8a0';
      ctx.fillRect(181, by - 1, 3, 1); ctx.fillRect(180, by + 3, 3, 1); ctx.fillRect(202, by - 1, 3, 1); ctx.fillRect(203, by + 3, 3, 1);
    }
  } else if (bellT > 0) {
    // на бриге — рында у мачты
    const bs = Math.round(Math.sin(clk * 22) * 2);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(96 + bs, 40, 6, 6);
  }
  // изделия в ящике
  ctx.fillStyle = '#9aa4b2';
  for (let i = 0; i < crateN; i++) ctx.fillRect(CRATE_X + 3 + i * 3, FLOOR - 19 - (i & 1), 2, 3);
  // капель
  ctx.fillStyle = p === 5 ? '#d8f0ff' : '#8aa0c0';
  for (let i = 0; i < S.drops.length; i++) {
    const d = S.drops[i];
    if (!d.on) continue;
    if (d.t < 0.8) ctx.fillRect(d.x, 0, 1, 1 + (d.t > 0.4 ? 1 : 0));
    else ctx.fillRect(d.x, Math.round(d.y), 1, 2);
  }
  // Кокк на балконе последнего зала (если не спустился)
  if (p === 10 && S.kokk && S.kokkOnBalcony) {
    const k = S.kk;
    if (k.act !== 3) {
      drawKokkBust(ctx, S.kokk, 262, 26, k.look);
      if (k.act === 2) { // машет
        const up = Math.floor(clk * 5) & 1;
        ctx.fillStyle = S.kokk.hat; ctx.fillRect(272, 22 - up * 2, 3, 6);
      }
    }
    // перила поверх
    ctx.fillStyle = '#c8a040'; ctx.fillRect(226, 46, 74, 2);
    ctx.fillStyle = '#a88030'; for (let x = 228; x < 300; x += 6) ctx.fillRect(x, 48, 2, 8);
  } else if (p === 10) {
    ctx.fillStyle = '#c8a040'; ctx.fillRect(226, 46, 74, 2);
    ctx.fillStyle = '#a88030'; for (let x = 228; x < 300; x += 6) ctx.fillRect(x, 48, 2, 8);
  }
}

// передний план: туман, светлячки, ночная тень для открытых тюрем
export function drawFront(ctx, S, clk, dark) {
  const p = S.p;
  if (p === 3) {
    ctx.fillStyle = pickA(FOG, 0.8);
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(((clk * (4 + i)) + i * 90) % (W + 120)) - 120, FLOOR - 26 + i * 5, 120, 4);
    for (let i = 0; i < S.parts.length; i++) {
      const q = S.parts[i];
      const a = 0.5 + 0.5 * Math.sin(clk * 3 + q.a * 4);
      if (a < 0.25 && dark < 0.3) continue;
      ctx.fillStyle = pickA(FLY, a * (0.4 + dark * 0.6));
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
  }
  if ((p === 3 || p === 4) && dark > 0.05) { ctx.fillStyle = pickA(NIGHT, dark * 0.7); ctx.fillRect(0, 0, W, FLOOR + 4); }
  if (p === 2 || p === 10 || p === 6) {
    ctx.fillStyle = p === 10 ? '#ffe8a0' : '#c8c0b0';
    for (let i = 0; i < S.parts.length; i++) { const q = S.parts[i]; if ((Math.floor(clk * 2 + i) & 3) !== 0) ctx.fillRect(Math.round(q.x), Math.round(q.y + Math.sin(q.a) * 3), 1, 1); }
  }
  if (p === 9) { ctx.fillStyle = pickA(MIST, 0.5); ctx.fillRect(0, FLOOR - 8, W, 8); }
}

