// «Защита деревни»: сохранение прогресса, контрольные точки, улучшения, альбом зомби, задания дня, награды.
// Корень сохранения: { v, p: настоящий прогресс, authorSave: прогресс режима автора }.
import { TYPES, TYPE_IDS, MOB_IDS, UPGRADES, upgradeCost, villageLevel, ckptOf } from './data.js';
import { rewardById } from '../rewards.js';

export const SAVE_V = 1;
export const AUTHOR_SPEED = 40;

export const DEF_REWARDS = [
  { id: 'def_badge_guard', test: (p) => p.bestW >= 20 },
  { id: 'def_frame_palisade', test: (p) => villageLevel(p.up) >= 5 },
  { id: 'def_theme_ash', test: (p) => p.bestW >= 40 },
  { id: 'def_title_lastline', test: (p) => p.bestW >= 60 },
  { id: 'def_cape_defender', test: (p) => p.kills >= 10000 }
];

export function freshProgress() {
  return { em: 0, up: [0, 0, 0, 0, 0, 0], ckpt: 1, start: 1, fails: 0, bestW: 0, kills: 0, alb: {}, runs: 0, best: 0, d: null };
}
const num = (v, d, lo, hi) => { v = Number(v); if (!Number.isFinite(v)) return d; return v < lo ? lo : v > hi ? hi : v; };
function sanitize(o) {
  const p = freshProgress();
  if (!o || typeof o !== 'object') return p;
  p.em = Math.floor(num(o.em, 0, 0, 1e9));
  p.bestW = Math.floor(num(o.bestW, 0, 0, 9999));
  p.ckpt = Math.floor(num(o.ckpt, 1, 1, 9999));
  p.ckpt = Math.min(p.ckpt, ckptOf(Math.max(1, p.bestW + 1)));
  p.ckpt = ckptOf(p.ckpt);
  p.start = ckptOf(Math.floor(num(o.start, p.ckpt, 1, p.ckpt)));
  p.fails = Math.floor(num(o.fails, 0, 0, 99));
  p.kills = Math.floor(num(o.kills, 0, 0, 1e9));
  p.runs = Math.floor(num(o.runs, 0, 0, 1e9));
  p.best = Math.floor(num(o.best, 0, 0, 1e9));
  if (Array.isArray(o.up)) for (let i = 0; i < UPGRADES.length; i++) p.up[i] = Math.floor(num(o.up[i], 0, 0, UPGRADES[i].max));
  if (o.alb && typeof o.alb === 'object') for (let i = 0; i < TYPE_IDS.length; i++) { const id = TYPE_IDS[i]; const n = Math.floor(num(o.alb[id], 0, 0, 1e9)); if (n > 0) p.alb[id] = n; }
  if (o.d && typeof o.d === 'object' && typeof o.d.k === 'string' && Array.isArray(o.d.l) && o.d.l.length === 3) {
    p.d = { k: o.d.k, l: o.d.l.map((t) => [num(t[0], 0, 0, 9) | 0, num(t[1], 0, 0, 99) | 0, num(t[2], 1, 1, 1e6) | 0, num(t[3], 0, 0, 1e6) | 0]), c: Array.isArray(o.d.c) ? [0, 1, 2].map((i) => (o.d.c[i] ? 1 : 0)) : [0, 0, 0], b: o.d.b ? 1 : 0 };
  }
  return p;
}

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

// типы заданий: 0 убей N, 1 убей N <тип>, 2 пройди N волн, 3 N волн без урона, 4 победи босса, 5 собери N изумрудов, 6 N мечом
export function makeDailies(p, day) {
  const rnd = mulberry((day.seed ^ 0xdef3a5e) >>> 0);
  const types = [0, 1, 2, 3, 4, 5, 6];
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = types[i]; types[i] = types[j]; types[j] = t; }
  const reach = Math.max(1, p.bestW);
  const l = [];
  for (let k = 0; l.length < 3 && k < types.length; k++) {
    const t = types[k];
    if (t === 0) l.push([0, 0, Math.round((60 + reach * 4) / 10) * 10, 0]);
    else if (t === 1) {
      const pool = [];
      for (let i = 1; i < MOB_IDS.length; i++) if (TYPES[MOB_IDS[i]].from <= reach) pool.push(i);
      if (!pool.length) continue;
      const ti = pool[Math.floor(rnd() * pool.length)];
      l.push([1, ti, 10 + Math.floor(reach / 4) * 2, 0]);
    } else if (t === 2) l.push([2, 0, 5 + Math.min(5, Math.floor(reach / 10)), 0]);
    else if (t === 3) l.push([3, 0, 2 + Math.min(2, Math.floor(reach / 15)), 0]);
    else if (t === 4) { if (reach >= 10) l.push([4, 0, 1, 0]); }
    else if (t === 5) l.push([5, 0, Math.round((80 + reach * 12) / 10) * 10, 0]);
    else if (t === 6) l.push([6, 0, 30 + Math.floor(reach / 2) * 2, 0]);
  }
  return { k: day.key, l, c: [0, 0, 0], b: 0 };
}
export const dailyReward = (p) => 30 + villageLevel(p.up) * 12 + Math.floor(p.bestW / 2);
export const upgradePrice = (p, i) => (p.up[i] >= UPGRADES[i].max ? -1 : upgradeCost(UPGRADES[i], p.up[i]));

export function createProgress(api) {
  const variant = typeof api.variant === 'number' ? api.variant : 0;
  let root = { v: SAVE_V };
  let p = freshProgress();
  let author = false;
  const granted = new Set();
  const authorShown = new Set();
  const events = [];
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
      if (variant) { p = freshProgress(); const v = Math.max(1, Math.min(11, variant)); for (let i = 0, s = (v - 1) * 8; i < p.up.length && s > 0; i++) { const add = Math.min(UPGRADES[i].max, Math.ceil(s / (p.up.length - i))); p.up[i] = add; s -= add; } author = false; return p; }
      let o = null;
      try { o = typeof api.load === 'function' ? api.load() : null; } catch (e) { o = null; }
      root = o && typeof o === 'object' ? o : {};
      if (!root.v && (root.em != null || root.up)) root = { v: SAVE_V, p: root };
      root.v = SAVE_V;
      author = !!api.author;
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
    vlvl: () => villageLevel(p.up),
    setStart(dir) {
      const s = Math.max(1, Math.min(p.ckpt, p.start + dir * 5));
      if (s === p.start) return false;
      p.start = s;
      p.fails = 0;
      P.save();
      return true;
    },
    // убийство зомби: id типа, мечом ли
    kill(id, sword, gems) {
      p.kills++;
      p.alb[id] = (p.alb[id] || 0) + 1;
      if (p.alb[id] === 1) push('Новый враг: ' + TYPES[id].name, '#ffe070', 3);
      p.em += gems;
      P.daily(0, 1, 0);
      const mi = MOB_IDS.indexOf(id);
      if (mi >= 0) P.daily(1, 1, mi);
      if (TYPES[id].boss) P.daily(4, 1, 0);
      if (sword) P.daily(6, 1, 0);
      P.daily(5, gems, 0);
      if (p.kills % 50 === 0 || TYPES[id].boss) P.checkRewards(false);
    },
    addGems(n) { p.em += n; P.daily(5, n, 0); },
    reachWave(w) {
      if (w > p.bestW) { p.bestW = w; P.checkRewards(false); }
    },
    waveCleared(w, perfect) {
      P.checkDay();
      P.daily(2, 1, 0);
      if (perfect) P.daily(3, 1, 0);
      p.fails = 0;
      if (w % 5 === 0) {
        const c = w + 1;
        if (c > p.ckpt) {
          if (p.start === p.ckpt) p.start = c;
          p.ckpt = c;
          push('Рубеж: волна ' + c, '#8fe0ff', 2);
        }
      }
      P.checkRewards(false);
      P.save();
    },
    daily(type, n, param) {
      const d = p.d;
      if (!d) return;
      for (let i = 0; i < 3; i++) {
        const t = d.l[i];
        if (!t || d.c[i] || t[0] !== type) continue;
        if (type === 1 && t[1] !== param) continue;
        t[3] += n;
        if (t[3] >= t[2]) {
          t[3] = t[2];
          d.c[i] = 1;
          const r = dailyReward(p) * P.mul();
          p.em += r;
          push('Задание! +' + r, '#8af0a8', 4);
        }
      }
      if (!d.b && d.c[0] && d.c[1] && d.c[2]) {
        d.b = 1;
        const r = dailyReward(p) * 3 * P.mul();
        p.em += r;
        push('Все задания: +' + r, '#ffd34a', 4);
      }
    },
    buy(i) {
      const pr = upgradePrice(p, i);
      if (pr < 0 || p.em < pr) return false;
      const before = villageLevel(p.up);
      p.em -= pr;
      p.up[i]++;
      const after = villageLevel(p.up);
      if (after > before) push('Деревня: уровень ' + after, '#ffe070', 1);
      P.checkRewards(false);
      P.save();
      return true;
    },
    // cleared — сколько волн пройдено за забег; два пустых забега подряд — старт на рубеж ниже
    endRun(score, cleared) {
      p.runs++;
      if (!cleared) {
        p.fails++;
        if (p.fails >= 2 && p.start > 1) { p.start = Math.max(1, p.start - 5); p.fails = 0; push('Старт ниже: волна ' + p.start, '#8fe0ff', 2); }
      }
      if (score > p.best) p.best = score;
      P.checkRewards(false);
      P.save();
    },
    checkRewards(onLoad) {
      if (variant) return;
      for (let i = 0; i < DEF_REWARDS.length; i++) {
        const R = DEF_REWARDS[i];
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
    }
  };
  return P;
}
