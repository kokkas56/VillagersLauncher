// «Рыбалка»: сохранение прогресса, уровни, альбом, снасти, задания дня, награды лаунчера.
// Корень сохранения: { v, p: настоящий прогресс, authorSave: прогресс режима автора }.
import { SPECIES, LAKES, LEGENDS, ALBUM_TOTAL, UPGRADES, upgradeCost, xpNeed, MAX_LVL } from './data.js';
import { rewardById } from '../rewards.js';

export const SAVE_V = 1;
export const AUTHOR_SPEED = 40;

export const FISH_REWARDS = [
  { id: 'fish_badge_angler', test: (p) => albumCount(p) >= Math.ceil(ALBUM_TOTAL * 0.5) },
  { id: 'fish_music_reeds', test: (p) => p.lvl >= LAKES[2].lvl },
  { id: 'fish_theme_lake', test: (p) => albumCount(p) >= Math.ceil(ALBUM_TOTAL * 0.8) },
  { id: 'fish_title_legend', test: (p) => LEGENDS.every((id) => p.alb[id] && p.alb[id][0] > 0) },
  { id: 'fish_cape_fisher', test: (p) => albumCount(p) >= ALBUM_TOTAL }
];

export function albumCount(p) {
  let n = 0;
  for (let i = 0; i < SPECIES.length; i++) { const a = p.alb[SPECIES[i].id]; if (a && a[0] > 0) n++; }
  return n;
}

export function freshProgress() {
  return { xp: 0, lvl: 1, coins: 0, lake: 0, spot: 0, alb: {}, up: [0, 0, 0, 0, 0], tc: 0, gold: 0, best: 0, d: null };
}
const num = (v, d, lo, hi) => { v = Number(v); if (!Number.isFinite(v)) return d; return v < lo ? lo : v > hi ? hi : v; };
function sanitize(o) {
  const p = freshProgress();
  if (!o || typeof o !== 'object') return p;
  p.xp = num(o.xp, 0, 0, 1e9);
  p.lvl = Math.floor(num(o.lvl, 1, 1, MAX_LVL));
  p.coins = Math.floor(num(o.coins, 0, 0, 1e9));
  p.lake = Math.floor(num(o.lake, 0, 0, LAKES.length - 1));
  p.spot = Math.floor(num(o.spot, 0, 0, 2));
  p.tc = Math.floor(num(o.tc, 0, 0, 1e9));
  p.gold = Math.floor(num(o.gold, 0, 0, 999));
  p.best = Math.floor(num(o.best, 0, 0, 1e9));
  if (o.alb && typeof o.alb === 'object') {
    for (let i = 0; i < SPECIES.length; i++) {
      const id = SPECIES[i].id, a = o.alb[id];
      if (Array.isArray(a)) p.alb[id] = [Math.floor(num(a[0], 0, 0, 1e9)), Math.floor(num(a[1], 0, 0, 9999))];
    }
  }
  if (Array.isArray(o.up)) for (let i = 0; i < UPGRADES.length; i++) p.up[i] = Math.floor(num(o.up[i], 0, 0, UPGRADES[i].max));
  if (o.d && typeof o.d === 'object' && typeof o.d.k === 'string' && Array.isArray(o.d.l)) {
    p.d = { k: o.d.k, l: o.d.l.slice(0, 3).map((t) => [num(t[0], 0, 0, 9) | 0, num(t[1], 0, 0, 99) | 0, num(t[2], 1, 1, 1e6) | 0, num(t[3], 0, 0, 1e6) | 0]), c: Array.isArray(o.d.c) ? o.d.c.slice(0, 3).map((x) => (x ? 1 : 0)) : [0, 0, 0], b: o.d.b ? 1 : 0 };
    while (p.d.c.length < 3) p.d.c.push(0);
    if (p.d.l.length !== 3) p.d = null;
  }
  // уровень по опыту (самолечение)
  while (p.lvl < MAX_LVL && p.xp >= xpNeed(p.lvl)) { p.xp -= xpNeed(p.lvl); p.lvl++; }
  if (p.lake > 0 && p.lvl < LAKES[p.lake].lvl) p.lake = 0;
  if (p.lvl < LAKES[p.lake].spots[p.spot]) p.spot = 0;
  return p;
}

// детерминированный ГПСЧ для заданий дня
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function localDay() {
  const d = new Date();
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return { key, seed: h };
}

export function makeDailies(p, day) {
  const rnd = mulberry((day.seed ^ 0x51f15e) >>> 0);
  const types = [0, 1, 2, 3, 4, 5, 6];
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = types[i]; types[i] = types[j]; types[j] = t; }
  const l = [];
  const commons = [];
  for (let i = 0; i < SPECIES.length; i++) { const s = SPECIES[i]; if (s.tier <= 1 && p.lvl >= LAKES[s.lake].lvl) commons.push(s.idx); }
  for (let k = 0; l.length < 3 && k < types.length; k++) {
    const t = types[k];
    const lv = p.lvl;
    if (t === 0) l.push([0, 0, Math.min(40, 14 + Math.floor(lv / 2) * 2), 0]);
    else if (t === 1) { const sp = commons[Math.floor(rnd() * commons.length)]; l.push([1, sp, SPECIES[sp].tier ? 3 : 5, 0]); }
    else if (t === 2) l.push([2, 0, lv >= 10 ? 2 : 1, 0]);
    else if (t === 3) l.push([3, 0, Math.round((120 + lv * 25) / 10) * 10, 0]);
    else if (t === 4) l.push([4, 0, 6 + Math.min(4, Math.floor(lv / 6)), 0]);
    else if (t === 5) l.push([5, 0, 6, 0]);
    else if (t === 6) { if (lv >= 2) l.push([6, lv >= LAKES[p.lake].spots[2] ? 2 : 1, 5, 0]); }
  }
  return { k: day.key, l, c: [0, 0, 0], b: 0 };
}
export const dailyReward = (p) => 40 + p.lvl * 10;

// ---------- магазин ----------
export const upgradePrice = (p, i) => (p.up[i] >= UPGRADES[i].max ? -1 : upgradeCost(UPGRADES[i], p.up[i]));

export function createProgress(api) {
  const variant = typeof api.variant === 'number' ? api.variant : 0;
  const isAuthor = () => !variant && !!api.author;
  let root = { v: SAVE_V };
  let p = freshProgress();
  let author = false;
  const granted = new Set(); // награды, выданные в этой сессии
  const authorShown = new Set();
  const events = []; // { text, color, kind }
  const push = (text, color, kind) => { if (events.length < 12) events.push({ text, color: color || '#ffe070', kind: kind || 0 }); };
  const dayNow = () => {
    try { if (typeof api.day === 'function') { const d = api.day(); if (d && typeof d.key === 'string') return { key: d.key, seed: Number(d.seed) >>> 0 }; } } catch (e) { /* ignore */ }
    return localDay();
  };

  const P = {
    get p() { return p; },
    get author() { return author; },
    events,
    load() {
      if (variant) { p = freshProgress(); p.lake = Math.max(0, Math.min(LAKES.length - 1, variant - 1)); p.lvl = LAKES[p.lake].lvl; author = false; return p; }
      let o = null;
      try { o = typeof api.load === 'function' ? api.load() : null; } catch (e) { o = null; }
      root = o && typeof o === 'object' ? o : {};
      if (!root.v) {
        // ранняя версия без вложенности: считаем, что это прогресс
        if (root.xp != null || root.alb) root = { v: SAVE_V, p: root };
      }
      root.v = SAVE_V;
      author = isAuthor();
      p = sanitize(author ? root.authorSave : root.p);
      P.checkDay();
      P.checkRewards(true);
      return p;
    },
    save() {
      if (variant || typeof api.save !== 'function') return;
      if (author) root.authorSave = p; else root.p = p;
      root.v = SAVE_V;
      try { api.save(root); } catch (e) { /* ignore */ }
    },
    mul() { return author ? AUTHOR_SPEED : 1; },
    checkDay() {
      const d = dayNow();
      if (!p.d || p.d.k !== d.key) { p.d = makeDailies(p, d); return true; }
      return false;
    },
    lakeOpen: (i) => p.lvl >= LAKES[i].lvl,
    spotOpen: (lake, s) => p.lvl >= LAKES[lake].spots[s],
    setPlace(lake, spot) {
      if (!P.lakeOpen(lake)) return false;
      if (!P.spotOpen(lake, spot)) spot = 0;
      p.lake = lake; p.spot = spot;
      P.save();
      return true;
    },
    addXp(x) {
      const before = p.lvl;
      p.xp += x;
      while (p.lvl < MAX_LVL && p.xp >= xpNeed(p.lvl)) { p.xp -= xpNeed(p.lvl); p.lvl++; }
      if (p.lvl >= MAX_LVL) p.xp = Math.min(p.xp, xpNeed(MAX_LVL));
      if (p.lvl > before) {
        push('Уровень ' + p.lvl, '#ffe070', 1);
        for (let i = 0; i < LAKES.length; i++) if (LAKES[i].lvl > before && LAKES[i].lvl <= p.lvl) push('Открыто: ' + LAKES[i].name, '#8fe0ff', 2);
        for (let i = 0; i < LAKES.length; i++) for (let s = 1; s < 3; s++) { const L = LAKES[i].spots[s]; if (L > before && L <= p.lvl && LAKES[i].lvl < L) push(LAKES[i].name + ': ' + (s === 1 ? 'Камыши' : 'Омут'), '#8fe0ff', 2); }
      }
      return p.lvl - before;
    },
    // вызов при поимке рыбы: возвращает { coins, xp, isNew }
    addCatch(sp, size, ctx) {
      P.checkDay();
      const L = LAKES[sp.lake];
      const T = sp.tier;
      const avg = (sp.len[0] + sp.len[1]) / 2;
      const sizeK = 0.6 + 0.8 * (size / Math.max(1, avg)) * 0.5;
      const TIERS_XP = [4, 10, 26, 60, 300], TIERS_C = [3, 8, 22, 60, 400];
      const m = P.mul();
      const coins = Math.max(1, Math.round(TIERS_C[T] * L.coin * sizeK)) * m;
      const xp = Math.max(1, Math.round(TIERS_XP[T] * L.xp)) * m;
      const a = p.alb[sp.id] || (p.alb[sp.id] = [0, 0]);
      const isNew = a[0] === 0;
      a[0]++;
      const rec = size > a[1];
      if (rec) a[1] = size;
      p.tc++;
      p.coins += coins;
      if (isNew) push('Новый вид: ' + sp.name, '#ffe070', 3);
      else if (rec && T >= 1) push('Рекорд: ' + size + ' см', '#c8f0ff', 0);
      P.addXp(xp);
      P.daily(sp, coins, ctx);
      P.checkRewards(false);
      P.save();
      return { coins, xp, isNew, rec };
    },
    addCoins(c, ctx) {
      p.coins += c;
      P.daily(null, c, ctx);
      P.save();
    },
    // обновление заданий дня; ctx: { tod, spot, streak }
    daily(sp, coins, ctx) {
      const d = p.d;
      if (!d) return;
      for (let i = 0; i < 3; i++) {
        const t = d.l[i];
        if (!t || d.c[i]) continue;
        const ty = t[0];
        if (ty === 0 && sp) t[3]++;
        else if (ty === 1 && sp && sp.idx === t[1]) t[3]++;
        else if (ty === 2 && sp && sp.tier >= 2) t[3]++;
        else if (ty === 3 && coins > 0) t[3] += coins;
        else if (ty === 4 && ctx) t[3] = Math.max(t[3], ctx.streak | 0);
        else if (ty === 5 && sp && ctx && ctx.tod === 2) t[3]++;
        else if (ty === 6 && sp && ctx && ctx.spot === t[1]) t[3]++;
        if (t[3] >= t[2]) {
          t[3] = t[2];
          d.c[i] = 1;
          const r = dailyReward(p) * P.mul();
          p.coins += r;
          push('Задание! +' + r, '#8af0a8', 4);
          P.addXp(Math.round(xpNeed(p.lvl) * 0.08));
        }
      }
      if (!d.b && d.c[0] && d.c[1] && d.c[2]) {
        d.b = 1;
        p.gold += 10;
        push('Все задания: золотая наживка', '#ffd34a', 4);
      }
    },
    buy(i) {
      const pr = upgradePrice(p, i);
      if (pr < 0 || p.coins < pr) return false;
      p.coins -= pr;
      p.up[i]++;
      P.save();
      return true;
    },
    checkRewards(onLoad) {
      if (variant) return;
      for (let i = 0; i < FISH_REWARDS.length; i++) {
        const R = FISH_REWARDS[i];
        if (!R.test(p)) continue;
        if (author) {
          if (!authorShown.has(R.id)) {
            authorShown.add(R.id);
            if (!onLoad) { const r = rewardById(R.id); push('(автор) ' + (r ? r.name : R.id), '#ff9ad0', 5); }
          }
          continue;
        }
        if (granted.has(R.id)) continue;
        granted.add(R.id);
        const has = typeof api.hasReward === 'function' && api.hasReward(R.id);
        if (!has && typeof api.reward === 'function') {
          api.reward(R.id);
          if (!onLoad) { const r = rewardById(R.id); push('Награда: ' + (r ? r.name : R.id), '#ffd34a', 5); }
        }
      }
    },
    // автор: перескок на следующее / предыдущее озеро
    authorSkip(dir) {
      if (!author) return false;
      const target = Math.max(0, Math.min(LAKES.length - 1, p.lake + dir));
      if (dir > 0 && p.lvl < LAKES[target].spots[2]) { p.lvl = LAKES[target].spots[2]; p.xp = 0; }
      p.lake = target;
      p.spot = 0;
      push('A: ' + LAKES[target].name, '#ff9ad0', 2);
      P.checkRewards(false);
      P.save();
      return true;
    }
  };
  return P;
}
