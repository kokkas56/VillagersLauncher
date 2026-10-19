// Сохранение «Побега»: текущая тюрьма, прогресс подкопа, милость, лопата, предметы, альбом, задания.
// Прогресс автора живёт отдельно в root.authorSave и никогда не смешивается с настоящим.
import { ITEMS, ARTEFACTS, DAILY, SHOVELS, REWARD_AT } from './config.js';

export const SAVE_V = 1;

export function freshData() {
  return {
    cur: 1, // 1..10 — тюрьма, где сидит игрок; 11 — свободен
    dug: 0, // рабочих секунд в текущем подкопе
    fav: 0, // милость (валюта)
    tool: 0, // индекс лопаты
    it: [0, 0, 0, 0, 0], // предметы по ITEMS
    alb: 0, // битовая маска найденных артефактов (30 бит)
    st: { sh: 0, cg: 0, esc: 0, dig: 0, perf: 0, ord: 0, best: 0, free: 0 },
    dy: { key: '', t: [] }
  };
}

const num = (v, lo, hi, d) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
};

// привести любые данные к схеме (защита от мусора и старых версий)
export function cleanData(o) {
  const f = freshData();
  if (!o || typeof o !== 'object') return f;
  f.cur = num(o.cur, 1, 11, 1);
  f.dug = Math.max(0, Number(o.dug) || 0);
  f.fav = num(o.fav, 0, 1e9, 0);
  f.tool = num(o.tool, 0, SHOVELS.length - 1, 0);
  if (Array.isArray(o.it)) for (let i = 0; i < ITEMS.length; i++) f.it[i] = num(o.it[i], 0, ITEMS[i].max, 0);
  f.alb = num(o.alb, 0, 2 ** ARTEFACTS.length - 1, 0);
  if (o.st && typeof o.st === 'object') for (const k in f.st) f.st[k] = num(o.st[k], 0, 1e12, 0);
  if (o.dy && typeof o.dy === 'object' && typeof o.dy.key === 'string' && Array.isArray(o.dy.t)) {
    f.dy.key = o.dy.key;
    for (let i = 0; i < Math.min(3, o.dy.t.length); i++) {
      const t = o.dy.t[i];
      if (!t || typeof t !== 'object') continue;
      const ti = num(t.i, 0, DAILY.length - 1, 0);
      f.dy.t.push({ i: ti, g: num(t.g, 1, 9999, 1), n: num(t.n, 0, 99999, 0), done: t.done ? 1 : 0 });
    }
    if (f.dy.t.length !== 3) { f.dy.key = ''; f.dy.t = []; }
  }
  return f;
}

// разбор корня сохранения: { v, ...настоящие данные, authorSave: {...} }
export function readRoot(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const real = cleanData(r);
  const author = cleanData(r.authorSave);
  return { real, author };
}

export function buildRoot(real, author) {
  const o = JSON.parse(JSON.stringify(real));
  o.v = SAVE_V;
  o.authorSave = JSON.parse(JSON.stringify(author));
  return o;
}

// ежедневные задания по зерну дня: 3 разных вида, сложность растёт с номером тюрьмы
export function rollDaily(dy, day, cur) {
  if (!day || typeof day.key !== 'string') return false;
  if (dy.key === day.key && dy.t.length === 3) return false;
  let s = (Number(day.seed) >>> 0) || 1;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) / 16777216; };
  const pool = [];
  for (let i = 0; i < DAILY.length; i++) pool.push(i);
  dy.key = day.key;
  dy.t = [];
  const lvl = cur >= 7 ? 2 : cur >= 4 ? 1 : 0;
  for (let k = 0; k < 3; k++) {
    const j = Math.floor(r() * pool.length);
    const i = pool.splice(j, 1)[0];
    const d = DAILY[i];
    const g = d.g[Math.min(2, Math.max(0, lvl + (r() < 0.3 ? -1 : 0)))];
    dy.t.push({ i, g, n: 0, done: 0 });
  }
  return true;
}

export const albumCount = (alb) => {
  let n = 0;
  for (let i = 0; i < ARTEFACTS.length; i++) if (alb & (2 ** i) ? true : false) n++;
  return n;
};
export const hasArt = (alb, i) => Math.floor(alb / 2 ** i) % 2 === 1;
export const addArt = (alb, i) => (hasArt(alb, i) ? alb : alb + 2 ** i);

// какие награды положены за данный прогресс
export function rewardsFor(cur) {
  const out = [];
  for (let p = 3; p <= 10; p++) if (cur > p && REWARD_AT[p]) for (const id of REWARD_AT[p]) out.push(id);
  return out;
}
