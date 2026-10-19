// Общее для «Рыбалки» и «Защиты деревни»: событие месяца и его испытание, опыт мастерства (пачками),
// уровень мастерства и мелкие бонусы, турнир недели. Всё через api.event/api.week/api.xp/api.mastery
// (с проверкой typeof), без выделений памяти в кадре.
import { EVENTS, currentEvent, levelOf, xpFor } from '../events.js';
import { rewardById } from '../rewards.js';

export const EVENT_IDS = EVENTS.map((e) => e.id);
export const FLUSH_SEC = 30; // опыт уходит хосту раз в 30 с игры и в конце забега
export const TIME_XP = 0.1; // 1 XP за 10 с активной игры

const num = (v, d) => { v = Number(v); return Number.isFinite(v) ? v : d; };

// сохранение испытания: { k: 'pumpkin2026', n: прогресс, done: 0|1 }
export function sanitizeEv(o) {
  if (!o || typeof o !== 'object' || typeof o.k !== 'string') return null;
  return { k: o.k.slice(0, 24), n: Math.max(0, Math.min(1e7, Math.floor(num(o.n, 0)))), done: o.done ? 1 : 0 };
}

// o: { getP: () => прогресс (с полем ev), save(), push(text, color, kind), isAuthor: () => bool, variant, mul: () => число, goal(id) }
export function createMeta(api, o) {
  const variant = o.variant | 0;
  const granted = new Set();
  const authorShown = new Set();
  const M = {
    ev: null, // { id, name, desc, month, year, daysLeft }
    id: 'yule',
    idx: 0,
    key: '',
    tourney: false,
    week: null,
    xp: 0, // опыт мастерства по данным хоста
    pend: 0, // накоплено, ещё не отправлено
    axp: 0, // автор: локальный опыт (хосту не уходит)
    flushT: 0,
    sent: 0, // всего отправлено за сессию (для тестов)
    lvl: 0,
    frac: 0,
    nextAt: 120,
    prevAt: 0,
    refreshEvent() {
      let e = null;
      try { if (typeof api.event === 'function') e = api.event(); } catch (err) { e = null; }
      if (!e || EVENT_IDS.indexOf(e.id) < 0) e = currentEvent(new Date());
      const year = Math.floor(num(e.year, new Date().getFullYear()));
      M.ev = e;
      M.id = e.id;
      M.idx = EVENT_IDS.indexOf(e.id);
      M.key = e.id + year;
      return M.ev;
    },
    refreshWeek() {
      let w = null;
      try { if (typeof api.week === 'function') w = api.week(); } catch (err) { w = null; }
      M.week = w && typeof w === 'object' ? w : null;
      M.tourney = !variant && !!(M.week && M.week.isThisGame);
    },
    readMastery() {
      let m = null;
      try { if (typeof api.mastery === 'function') m = api.mastery(); } catch (err) { m = null; }
      if (m && typeof m === 'object') M.xp = Math.max(0, num(m.xp, M.xp));
      M.calc();
    },
    calc() {
      const x = M.xp + M.pend + M.axp;
      const L = levelOf(x);
      M.lvl = L;
      M.prevAt = xpFor(L);
      M.nextAt = xpFor(L + 1);
      M.frac = Math.max(0, Math.min(1, (x - M.prevAt) / Math.max(1, M.nextAt - M.prevAt)));
    },
    refresh() { M.refreshEvent(); M.refreshWeek(); M.readMastery(); },
    // опыт за достижения (улов, убийство, волна...)
    addXp(n) {
      if (variant || !(n > 0)) return;
      if (o.isAuthor()) M.axp += n * o.mul(); else M.pend += n;
      M.calc();
    },
    // время активной игры; отправка пачками
    tick(dt, active) {
      if (variant) return;
      if (active) M.addXp(dt * TIME_XP);
      M.flushT += dt;
      if (M.flushT >= FLUSH_SEC) M.flush();
    },
    flush() {
      M.flushT = 0;
      if (variant || o.isAuthor()) return;
      const n = Math.floor(M.pend);
      if (n <= 0) return;
      M.pend -= n;
      if (typeof api.xp === 'function') {
        try { api.xp(n); } catch (err) { /* ignore */ }
        M.sent += n;
        const before = M.xp;
        M.readMastery();
        if (M.xp < before + n) { M.xp = before + n; M.calc(); } // хост без mastery() — считаем сами
      } else { M.xp += n; M.sent += n; M.calc(); }
    },
    // мелкие бонусы мастерства
    coinMul() { return 1 + Math.min(0.2, 0.01 * Math.floor(M.lvl / 5)); },
    coinPct() { return Math.round((M.coinMul() - 1) * 100); },
    // испытание события
    chal() {
      const p = o.getP();
      if (!p) return null;
      if (!p.ev || p.ev.k !== M.key) p.ev = { k: M.key, n: 0, done: 0 };
      return p.ev;
    },
    goal() { return o.goal(M.id); },
    count(n) {
      if (variant || !(n > 0)) return false;
      const c = M.chal();
      if (!c || c.done) return false;
      c.n = Math.min(1e7, c.n + Math.round(n));
      if (c.n >= M.goal()) { c.n = M.goal(); c.done = 1; o.push('Испытание выполнено!', '#ffd34a', 5); M.addXp(60); M.checkReward(false); }
      return true;
    },
    checkReward(onLoad) {
      if (variant) return;
      const c = M.chal();
      if (!c || !c.done) return;
      const rid = 'ev_' + M.id;
      if (o.isAuthor()) {
        if (!authorShown.has(rid)) { authorShown.add(rid); if (!onLoad) { const r = rewardById(rid); o.push('(автор) ' + (r ? r.name : rid), '#ff9ad0', 5); } }
        return;
      }
      if (granted.has(rid)) return;
      granted.add(rid);
      const has = typeof api.hasReward === 'function' && api.hasReward(rid);
      if (!has && typeof api.reward === 'function') {
        api.reward(rid);
        if (!onLoad) { const r = rewardById(rid); o.push('Награда: ' + (r ? r.name : rid), '#ffd34a', 5); }
      }
    }
  };
  M.refresh();
  return M;
}
