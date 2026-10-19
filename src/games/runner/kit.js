// Общий «набор прогресса» для мини-игр runner / fair / mine:
// сохранение (api.load/api.save, отдельный authorSave), ежедневные задания, награды лаунчера,
// всплывающие сообщения, пиксельная книжка (альбом / магазин / задания) и мелкие иконки.
// Ничего не выделяет в кадре, кроме случаев, когда открыта книжка (игра в это время на паузе).
import { drawLabel, labelWidth, drawInt, intWidth, drawText, drawIcon } from '../pixfont.js';
import { rewardById, GAME_NAMES } from '../rewards.js';
import { EVENTS, currentEvent, levelOf, xpFor } from '../events.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function dayInfo(api) {
  try {
    const d = api && typeof api.day === 'function' ? api.day() : null;
    if (d && typeof d.key === 'string') return { key: d.key, seed: Number(d.seed) || hashStr(d.key) };
  } catch (e) { /* хост без day() */ }
  const t = new Date();
  const key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  return { key, seed: hashStr(key) };
}

// дозаполнить объект недостающими полями из шаблона (рекурсивно, массивы — по длине шаблона)
function fill(o, f) {
  for (const k in f) {
    const fv = f[k];
    if (o[k] === undefined || o[k] === null || typeof o[k] !== typeof fv || Array.isArray(fv) !== Array.isArray(o[k])) o[k] = fv;
    else if (Array.isArray(fv)) { for (let i = o[k].length; i < fv.length; i++) o[k].push(fv[i]); }
    else if (fv && typeof fv === 'object') fill(o[k], fv);
    else if (typeof fv === 'number' && !Number.isFinite(o[k])) o[k] = fv;
  }
  return o;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
export const fmtKm = (m) => (m >= 10000 ? (m / 1000).toFixed(0) + ' КМ' : m >= 1000 ? (m / 1000).toFixed(1) + ' КМ' : Math.floor(m) + ' М');

// ---------- прогресс ----------
// cfg: { id, version, fresh(): obj, fix?(S), daily: [{ id, stat, kind:'sum'|'max', goals:[...], text(n), icon, pay(n) }],
//        onDaily?(S, def, goal), rewards: [{ id, test(S) }] }
export function createProg(api, cfg) {
  const variant = Number(api && api.variant) || 0;
  const author = !!(api && api.author) && !variant;
  let root = {};
  const granted = new Set();
  const P = {
    author, variant, S: null, toasts: [], dirty: false, dayT: 0, celebrate: 0, onLoad: null,
    load() {
      if (variant) { P.S = fill({}, cfg.fresh()); if (cfg.fix) cfg.fix(P.S); if (P.onLoad) P.onLoad(P.S); return P.S; }
      let r = null;
      try { r = api && typeof api.load === 'function' ? api.load() : null; } catch (e) { r = null; }
      try { root = r && typeof r === 'object' ? clone(r) : {}; } catch (e) { root = {}; }
      if (author) {
        const a = root.authorSave && typeof root.authorSave === 'object' ? root.authorSave : {};
        fill(a, cfg.fresh()); a.v = cfg.version;
        root.authorSave = a;
        P.S = a;
      } else {
        const keepA = root.authorSave;
        delete root.authorSave;
        fill(root, cfg.fresh()); root.v = cfg.version;
        if (keepA) root.authorSave = keepA;
        P.S = root;
      }
      if (cfg.fix) cfg.fix(P.S);
      P.refreshDaily();
      P.checkRewards();
      if (P.onLoad) P.onLoad(P.S);
      return P.S;
    },
    save() {
      P.dirty = false;
      if (variant) return;
      try { if (api && typeof api.save === 'function') api.save(clone(root)); } catch (e) { /* хост */ }
    },
    // ---- задания дня ----
    refreshDaily() {
      const S = P.S;
      if (!S) return;
      const d = dayInfo(api);
      if (S.daily && S.daily.key === d.key && Array.isArray(S.daily.t) && S.daily.t.length === 3) return;
      const r = rng((d.seed ^ hashStr(cfg.id)) >>> 0);
      const pool = cfg.daily;
      const pick = [];
      let guard = 0;
      while (pick.length < 3 && guard++ < 50) {
        const i = Math.floor(r() * pool.length);
        if (pick.indexOf(i) < 0 && !pick.some((j) => pool[j].stat === pool[i].stat)) pick.push(i);
      }
      for (let i = 0; pick.length < 3 && i < pool.length; i++) if (pick.indexOf(i) < 0) pick.push(i);
      S.daily = { key: d.key, t: pick.map((i) => { const gl = pool[i].goals; return { i, g: gl[Math.floor(r() * gl.length)], n: 0, d: 0 }; }) };
      P.dirty = true;
    },
    tickDay(dt) {
      P.dayT -= dt;
      if (P.dayT <= 0) { P.dayT = 5; P.refreshDaily(); }
    },
    _done(t) {
      const def = cfg.daily[t.i];
      t.d = 1; t.n = t.g;
      P.dirty = true;
      P.celebrate = 1.5;
      const pay = def.pay ? def.pay(t.g) : 0;
      if (cfg.onDaily) cfg.onDaily(P.S, def, t.g, pay);
      P.toast('ЗАДАНИЕ ВЫПОЛНЕНО' + (pay ? ' +' + pay : ''), '#9cf08a');
      try { api.sfx && api.sfx('win'); } catch (e) { /* звук */ }
    },
    bump(stat, n = 1) {
      const S = P.S;
      if (!S || variant || !S.daily) return;
      const t = S.daily.t;
      for (let k = 0; k < t.length; k++) {
        const q = t[k];
        if (q.d) continue;
        const def = cfg.daily[q.i];
        if (!def || def.stat !== stat || def.kind !== 'sum') continue;
        q.n += n * (author ? 10 : 1);
        if (q.n >= q.g) P._done(q);
      }
    },
    peak(stat, v) {
      const S = P.S;
      if (!S || variant || !S.daily) return;
      const t = S.daily.t;
      for (let k = 0; k < t.length; k++) {
        const q = t[k];
        if (q.d) continue;
        const def = cfg.daily[q.i];
        if (!def || def.stat !== stat || def.kind !== 'max') continue;
        const vv = author ? v * 10 : v;
        if (vv > q.n) q.n = Math.floor(vv);
        if (q.n >= q.g) P._done(q);
      }
    },
    // ---- награды ----
    grant(id) {
      if (variant || granted.has(id)) return;
      granted.add(id);
      const r = rewardById(id);
      const name = r ? r.name : id;
      if (author) { P.toast('(АВТОР) НАГРАДА: ' + name, '#ffb0e0'); return; }
      let has = false;
      try { has = api && typeof api.hasReward === 'function' && !!api.hasReward(id); } catch (e) { has = false; }
      if (has) return;
      try { if (api && typeof api.reward === 'function') api.reward(id); } catch (e) { /* хост */ }
      P.toast('НАГРАДА: ' + name, '#ffd34a');
    },
    checkRewards() {
      if (variant || !P.S) return;
      for (const rw of cfg.rewards) { if (!granted.has(rw.id)) { let ok = false; try { ok = !!rw.test(P.S); } catch (e) { ok = false; } if (ok) P.grant(rw.id); } }
    },
    // ---- сообщения ----
    toast(text, col) {
      if (P.toasts.length >= 4) P.toasts.shift();
      P.toasts.push({ s: String(text).toUpperCase(), c: col || '#ffffff', t: 0, w: labelWidth(String(text).toUpperCase()) });
    },
    updToasts(dt) {
      if (P.celebrate > 0) P.celebrate -= dt;
      if (!P.toasts.length) return;
      const q = P.toasts[0];
      q.t += dt;
      if (q.t > 2.6) P.toasts.shift();
    },
    drawToasts(ctx, y, W) {
      const n = Math.min(2, P.toasts.length);
      for (let i = 0; i < n; i++) {
        const q = P.toasts[i];
        const a = i === 0 ? Math.min(1, q.t * 5, (2.6 - q.t) * 3) : 0.6;
        if (a <= 0) continue;
        const x = Math.round((W - q.w) / 2), yy = y + i * 11;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = 'rgba(16,10,14,0.82)'; ctx.fillRect(x - 4, yy - 2, q.w + 8, 9);
        ctx.fillStyle = q.c; ctx.fillRect(x - 4, yy - 2, q.w + 8, 1);
        drawLabel(ctx, q.s, x, yy, q.c);
        ctx.globalAlpha = 1;
      }
    },
    // ---- HUD заданий: иконка + n/m ----
    drawDailies(ctx, x, y) {
      const S = P.S;
      if (!S || !S.daily || variant) return 0;
      const t = S.daily.t;
      ctx.fillStyle = 'rgba(16,10,14,0.5)'; ctx.fillRect(x - 2, y - 2, 46, t.length * 8 + 3);
      for (let k = 0; k < t.length; k++) {
        const q = t[k], def = cfg.daily[q.i];
        if (!def) continue;
        const yy = y + k * 8;
        kitIcon(ctx, def.icon || 'star', x, yy);
        if (q.d) { kitIcon(ctx, 'check', x + 8, yy); continue; }
        let w = drawInt(ctx, Math.min(q.n, q.g), x + 8, yy + 1, '#ffffff');
        drawText(ctx, '/', x + 9 + w, yy + 1, '#a09080');
        drawInt(ctx, q.g, x + 13 + w, yy + 1, '#c8b8a0');
      }
      return t.length * 8 + 3;
    },
    dailyRows() {
      const S = P.S, out = [];
      if (!S || !S.daily) return out;
      for (const q of S.daily.t) {
        const def = cfg.daily[q.i];
        if (!def) continue;
        out.push({ t: def.text(q.g), r: q.d ? 'ГОТОВО' : Math.floor(Math.min(q.n, q.g)) + '/' + q.g, c: q.d ? '#9cf08a' : '#ffffff', ic: def.icon, s: def.pay ? '+' + def.pay(q.g) : '' });
      }
      return out;
    }
  };
  return P;
}

// ---------- мелкие иконки 7×7 ----------
const KI = {
  book: { p: { a: '#8a4a2a', b: '#f0e6d0', c: '#5a2e1a' }, r: ['aaaaaa.', 'abbbbac', 'abaabac', 'abbbbac', 'abaabac', 'abbbbac', 'aaaaaac'] },
  ticket: { p: { a: '#f2c230', b: '#c08a10', c: '#fff6b0' }, r: ['.......', 'aaaaaaa', 'acaaaba', 'aaaaaa.', 'abaaaba', 'aaaaaaa', '.......'] },
  coin: { p: { a: '#f2c230', b: '#fff6b0', c: '#a07010' }, r: ['..aaa..', '.abaaa.', 'abaaaac', 'abaaaac', 'aaaaaac', '.aaacc.', '..ccc..'] },
  star: { p: { a: '#ffe070', b: '#c89020' }, r: ['...a...', '...a...', 'aaaaaaa', '.aaaab.', '..aab..', '.aa.ab.', '.a...b.'] },
  check: { p: { a: '#7ef08a', b: '#2a8a3a' }, r: ['......a', '.....ab', 'a...ab.', 'ba.ab..', '.baab..', '..bb...', '.......'] },
  lock: { p: { a: '#a0a8b4', b: '#5a6270', c: '#2a2e36' }, r: ['..bbb..', '.b...b.', '.b...b.', 'aaaaaaa', 'aaacaaa', 'aaacaaa', 'bbbbbbb'] },
  magnet: { p: { a: '#d84a4a', b: '#e8eef4', c: '#8a2a2a' }, r: ['.aaaaa.', 'aac.caa', 'aa...aa', 'aa...aa', 'aa...aa', 'bb...bb', 'bb...bb'] },
  axe: { p: { a: '#c8d0dc', b: '#7e8a9a', c: '#8a5a32' }, r: ['.aaa...', 'aaabc..', 'aab.c..', '.b..c..', '....c..', '....c..', '....c..'] },
  apple: { p: { a: '#d83a3a', b: '#ff8a7a', c: '#4a8a3a', d: '#8a2020' }, r: ['...c...', '..c....', '.aaaaa.', 'abaaaaa', 'aaaaaad', 'aaaaadd', '.aaadd.'] },
  target: { p: { a: '#d83a3a', b: '#f4ecdc' }, r: ['.aaaaa.', 'abbbbba', 'aba.aba', 'ab.a.ba', 'aba.aba', 'abbbbba', '.aaaaa.'] },
  cart: { p: { a: '#8d9098', b: '#4a4c53', c: '#2a2a2e', d: '#f2cc4a' }, r: ['.d.d...', 'aaaaaaa', 'babbbab', 'bbbbbbb', '.bbbbb.', '.c...c.', '.......'] },
  gem: { p: { a: '#8fd0ff', b: '#e0f4ff', c: '#3a7ab8' }, r: ['.aaaaa.', 'abbaaac', 'aaaaacc', '.aaacc.', '..acc..', '...c...', '.......'] },
  flag: { p: { a: '#d84a4a', b: '#6a4a2c' }, r: ['baaaa..', 'baaaaa.', 'baaaa..', 'b......', 'b......', 'b......', 'b......'] },
  heart: { p: { a: '#e04848', b: '#ff8a8a' }, r: ['.aa.aa.', 'abaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...', '.......'] },
  bolt: { p: { a: '#ffe070', b: '#c89020' }, r: ['...aa..', '..aa...', '.aaaaa.', '...aa..', '..ab...', '.ab....', '.......'] },
  route: { p: { a: '#b89a70', b: '#4a8a3a' }, r: ['b..a..b', 'b..a..b', '.b.a.b.', '.b.a.b.', '..bab..', '...a...', '...a...'] },
  boot: { p: { a: '#8a5a32', b: '#62d8ff', c: '#4a2e18' }, r: ['.aa....', '.aa....', '.aa....', '.aab...', '.aaaaa.', 'aaaaaab', 'ccccccc'] },
  pick: { p: { a: '#c8d0dc', b: '#8a6238' }, r: ['.aaaaa.', 'a..b..a', '...b...', '...b...', '...b...', '...b...', '...b...'] },
  clock: { p: { a: '#d8d0c0', b: '#6a5a4a', c: '#2a2420' }, r: ['..bbb..', '.baaab.', 'baacaab', 'baacaab', 'baaacab', '.baaab.', '..bbb..'] },
  run: { p: { a: '#e8be96', b: '#5a74b4', c: '#3c2c22' }, r: ['...a...', '..bbb..', '.b.b.a.', 'a..b...', '..b.c..', '.c...c.', 'c......'] }
};
// знаки событий месяца (жетоны, которые собирают во время события)
const EVI = {
  yule: { p: { a: '#e8f4ff', b: '#8ac8ff' }, r: ['a..a..a', '.a.a.a.', '..aba..', 'aaabaaa', '..aba..', '.a.a.a.', 'a..a..a'] },
  maslenitsa: { p: { a: '#f0c060', b: '#c88a30', c: '#fff0a0' }, r: ['.......', '.aaaaa.', 'aaacaab', 'aacccab', 'aaacaab', '.bbbbb.', '.......'] },
  thaw: { p: { a: '#f4f4f0', b: '#c8ccd4', c: '#5ab0e0' }, r: ['...a...', '...aa..', '...aaa.', 'aaaaaaa', '.bbbbb.', 'ccccccc', '.c.c.c.'] },
  jest: { p: { a: '#e04848', b: '#48b048', c: '#ffd34a' }, r: ['c.....c', 'aa...bb', '.aa.bb.', '.aaabb.', '..aab..', '.ccccc.', '.......'] },
  bloom: { p: { a: '#ff9ac8', b: '#ffe070', c: '#4a9a3a' }, r: ['..a.a..', '.aaaaa.', 'aaabaaa', '.aaaaa.', '..a.a..', '...c...', '..ccc..'] },
  kupala: { p: { a: '#ff6a2a', b: '#ffd060', c: '#3a8a3a' }, r: ['...b...', '.a.b.a.', '..aba..', 'bbbabbb', '..aaa..', '.c.c.c.', '..ccc..'] },
  storm: { p: { a: '#c8d0e0', b: '#8a94a8', c: '#ffe070' }, r: ['.aaaa..', 'aaaaaa.', 'bbbbbbb', '..cc...', '.cccc..', '...cc..', '..c....'] },
  starfall: { p: { a: '#c8b0ff', b: '#8a6ad8', c: '#ffffff', d: '#ffd0a0' }, r: ['d......', '.d.....', '..d.aa.', '...aca.', '..aacab', '...abb.', '.......'] },
  harvest: { p: { a: '#f0c040', b: '#b08020', c: '#8a6a30' }, r: ['.a.a.a.', '.aaaaa.', '..aba..', '.aaaaa.', '..aba..', '...c...', '...c...'] },
  pumpkin: { p: { a: '#ff8a2a', b: '#c05a10', c: '#ffe070', d: '#4a8a3a' }, r: ['...d...', '.aaaaa.', 'acabaca', 'aaaaaaa', 'acccccb', '.abbbb.', '.......'] },
  fog: { p: { a: '#c8fff0', b: '#7ad8c0', c: '#ffffff' }, r: ['...a...', '..aba..', '.abcba.', '.abcba.', '..bbb..', '...b...', '..b....'] },
  newyear: { p: { a: '#e04848', b: '#ffd34a', c: '#a02828' }, r: ['.b...b.', '..b.b..', 'aaabaaa', 'aaabaaa', 'bbbbbbb', 'aaabaac', 'cccbccc'] }
};
for (const k in EVI) KI['ev_' + k] = EVI[k];
const KIR = {};
for (const k in KI) {
  const ic = KI[k], list = [];
  for (let y = 0; y < ic.r.length; y++) {
    const row = ic.r[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch !== '.' && ic.p[ch]) { let e = x; while (e < row.length && row[e] === ch) e++; list.push(ic.p[ch], x, y, e - x); x = e; } else x++;
    }
  }
  KIR[k] = list;
}
export function kitIcon(ctx, name, x, y, sc = 1) {
  const r = KIR[name];
  if (!r) return;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < r.length; j += 4) { ctx.fillStyle = r[j]; ctx.fillRect(x + r[j + 1] * sc, y + r[j + 2] * sc, r[j + 3] * sc, sc); }
}

// маркер автора и подсказка пропуска
export function drawAuthor(ctx, x, y) {
  ctx.fillStyle = 'rgba(120,20,90,0.85)'; ctx.fillRect(x, y, 22, 9);
  drawLabel(ctx, 'A', x + 2, y + 2, '#ffb0e0');
  // скобки [ ] — клавиши пропуска этапа
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 9, y + 2, 1, 5); ctx.fillRect(x + 10, y + 2, 1, 1); ctx.fillRect(x + 10, y + 6, 1, 1);
  ctx.fillRect(x + 18, y + 2, 1, 5); ctx.fillRect(x + 17, y + 2, 1, 1); ctx.fillRect(x + 17, y + 6, 1, 1);
}
// кнопка книжки (для мыши)
export function drawBookBtn(ctx, x, y, hot) {
  ctx.fillStyle = hot ? 'rgba(255,220,140,0.35)' : 'rgba(16,10,14,0.5)'; ctx.fillRect(x - 2, y - 2, 11, 11);
  kitIcon(ctx, 'book', x, y);
}

// полоска прогресса
export function bar(ctx, x, y, w, h, k, col, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
  const f = Math.max(0, Math.min(1, k || 0));
  if (f > 0) { ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(1, Math.round(w * f)), h); }
}

// ---------- книжка ----------
// pages: [{ title, rows(): [{ t, r?, s?, c?, ic?, lock? }], pick?(i) -> bool (true = перестроить) , foot?() -> string }]
export function createBook(pages, W, H) {
  const B = {
    open: false, page: 0, sel: 0, top: 0, rows: [], foot: '', dirty: true, flash: 0,
    x: 8, y: 8, w: W - 16, h: H - 16,
    toggle(v) { B.open = v === undefined ? !B.open : !!v; B.dirty = true; if (!B.open) B.flash = 0; },
    rebuild() {
      const p = pages[B.page];
      B.rows = p.rows() || [];
      B.foot = p.foot ? p.foot() : '';
      if (B.sel >= B.rows.length) B.sel = Math.max(0, B.rows.length - 1);
      B.dirty = false;
    },
    vis() { return Math.floor((B.h - 30) / 11); },
    go(dp) { B.page = (B.page + dp + pages.length) % pages.length; B.sel = 0; B.top = 0; B.dirty = true; },
    move(d) {
      if (!B.rows.length) return;
      B.sel = (B.sel + d + B.rows.length) % B.rows.length;
      const v = B.vis();
      if (B.sel < B.top) B.top = B.sel;
      if (B.sel >= B.top + v) B.top = B.sel - v + 1;
    },
    pick() { const p = pages[B.page]; if (p.pick && p.pick(B.sel)) { B.dirty = true; B.flash = 0.25; } },
    // true — клавиша поглощена книжкой
    key(code) {
      if (code === 'Tab' || code === 'KeyB') { B.toggle(); return true; }
      if (!B.open) return false;
      if (code === 'ArrowLeft' || code === 'KeyA') B.go(-1);
      else if (code === 'ArrowRight' || code === 'KeyD') B.go(1);
      else if (code === 'ArrowUp' || code === 'KeyW') B.move(-1);
      else if (code === 'ArrowDown' || code === 'KeyS') B.move(1);
      else if (code === 'Enter' || code === 'Space') B.pick();
      return true;
    },
    click(x, y) {
      if (!B.open) return false;
      if (x < B.x || x > B.x + B.w || y < B.y || y > B.y + B.h) { B.toggle(false); return true; }
      // вкладки
      if (y < B.y + 13) {
        let tx = B.x + 4;
        for (let i = 0; i < pages.length; i++) {
          const w = labelWidth(pages[i].title) + 8;
          if (x >= tx && x < tx + w) { if (B.page !== i) { B.page = i; B.sel = 0; B.top = 0; B.dirty = true; } return true; }
          tx += w + 2;
        }
        return true;
      }
      const ry = y - (B.y + 17);
      if (ry >= 0) {
        const i = B.top + Math.floor(ry / 11);
        if (i < B.rows.length) { if (B.sel === i) B.pick(); else B.sel = i; }
      }
      return true;
    },
    draw(ctx, dt) {
      if (!B.open) return;
      if (B.dirty) B.rebuild();
      if (B.flash > 0) B.flash -= dt;
      const { x, y, w, h } = B;
      ctx.fillStyle = 'rgba(8,6,10,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3a2416'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d4c4a0'; ctx.fillRect(x, y, w, 13);
      // вкладки
      let tx = x + 4;
      for (let i = 0; i < pages.length; i++) {
        const t = pages[i].title, tw = labelWidth(t) + 8;
        ctx.fillStyle = i === B.page ? '#e8dcc0' : '#a8946e';
        ctx.fillRect(tx, y + 2, tw, 11);
        drawLabel(ctx, t, tx + 4, y + 5, i === B.page ? '#3a2416' : '#f0e6d0');
        tx += tw + 2;
      }
      // строки
      const v = B.vis();
      for (let k = 0; k < v; k++) {
        const i = B.top + k;
        if (i >= B.rows.length) break;
        const r = B.rows[i], ry = y + 17 + k * 11;
        if (i === B.sel) { ctx.fillStyle = B.flash > 0 ? '#ffe9a0' : '#f6eed8'; ctx.fillRect(x + 2, ry - 2, w - 4, 10); ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x + 2, ry - 2, 1, 10); }
        let lx = x + 5;
        if (r.sw && !r.lock) { ctx.fillStyle = r.sw; ctx.fillRect(lx + 1, ry - 1, 6, 6); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(lx + 1, ry + 3, 6, 2); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(lx + 2, ry, 1, 1); lx += 10; }
        else if (r.ic) { kitIcon(ctx, r.lock ? 'lock' : r.ic, lx, ry - 1); lx += 10; }
        const col = r.lock ? '#9a8a70' : (r.c && r.c !== '#ffffff' ? darkOf(r.c) : '#2a1a10');
        drawLabel(ctx, r.t, lx, ry, col);
        if (r.s) drawLabel(ctx, r.s, lx + labelWidth(r.t) + 6, ry, '#8a7a60');
        if (r.r) { const rw = labelWidth(r.r); drawLabel(ctx, r.r, x + w - 6 - rw, ry, r.lock ? '#9a8a70' : '#5a3a1a'); }
      }
      if (B.rows.length > v) {
        ctx.fillStyle = '#b8a47e'; ctx.fillRect(x + w - 3, y + 16, 2, h - 30);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x + w - 3, y + 16 + Math.round((h - 30) * B.top / B.rows.length), 2, Math.max(4, Math.round((h - 30) * v / B.rows.length)));
      }
      ctx.fillStyle = '#d4c4a0'; ctx.fillRect(x, y + h - 11, w, 11);
      if (B.foot) drawLabel(ctx, B.foot, x + 5, y + h - 8, '#3a2416');
      drawLabel(ctx, 'TAB - ЗАКРЫТЬ', x + w - 5 - labelWidth('TAB - ЗАКРЫТЬ'), y + h - 8, '#7a6440');
    }
  };
  return B;
}
// светлые цвета строк на бумаге не читаются — затемняем
const DARK = new Map();
function darkOf(c) {
  let d = DARK.get(c);
  if (d) return d;
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return '#2a1a10';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  d = `rgb(${(r * 0.55) | 0},${(g * 0.55) | 0},${(b * 0.55) | 0})`;
  DARK.set(c, d);
  return d;
}

export { intWidth };

// =====================================================================================
// События месяца, мастерство, турнир недели (общая логика для runner / fair / mine)
// =====================================================================================
export const EV_IDS = EVENTS.map((e) => e.id);
// жетон события как спрайт { w, h, r:[цвет, x, y, w, ...] } (формат drawSpr в fair/mine)
const EVSPR = {};
for (const id of EV_IDS) EVSPR[id] = { w: 7, h: 7, r: KIR['ev_' + id] };
export const tokenSprite = (id) => EVSPR[id] || EVSPR.yule;

// декорации событий: пиксельные «предметы», рисуются от нижнего центра
const PROPS = {
  snowman: { p: { h: '#2a2a34', w: '#f4f8ff', s: '#c8d8e8', e: '#1a1a22', o: '#ff8a2a', b: '#6a4a2c', g: '#3a3a44', r: '#d84a4a' }, r: ['...hhh...', '...hhh...', '..hhhhh..', '...wws...', '..wewes..', '..wwoos..', '...wws...', '..rrrrr..', '.bwwgwsb.', 'b.wwwws.b', '.wwwwwss.', '.wwwgwws.', '.wwwwwss.', '..wwwss..'] },
  effigy: { p: { r: '#d84a4a', s: '#e8c870', y: '#c8a040', c: '#4a7ad8', d: '#ffd34a', p: '#6a4a2c', e: '#3a2a1a' }, r: ['...rrr...', '..rsssr..', '..sesss..', '...sss...', 'yy.ccc.yy', '.yycccyy.', '...ccc...', '..cdcdc..', '.ccccccc.', '.ccccccc.', 'ccdcdcdcc', '...yyy...', '....p....', '....p....', '....p....', '...ppp...'] },
  boat: { p: { w: '#f4f4f0', g: '#c8ccd4', l: '#7ac0e8', d: '#4a90c0', k: '#2a2a30' }, r: ['.......k.....', '......kw.....', '......www....', '...wwwwwwww..', '....ggggggg..', '.lllllllllll.', 'llddlllllddll', '.lllllllllll.'] },
  jbox: { p: { y: '#ffd34a', r: '#e04848', g: '#48b048', s: '#f0c8a0', e: '#2a2020', m: '#c04040', z: '#a8b0bc', b: '#8a5a32', q: '#ffd34a' }, r: ['y...y...y', '.r.rrg.g.', '..rrrgg..', '...sss...', '..sesesr.', '...sms...', '...zzz...', '..z...z..', '...zzz...', '.bbbbbbb.', '.bqbbbqb.', '.bbbqbbb.', '.bqbbbqb.', '.bbbbbbb.'] },
  blossom: { p: { p: '#ff9ac8', w: '#fff0f8', d: '#e070a8', t: '#6a4a2c' }, r: ['...ppwpp...', '.pwppdpwpp.', 'ppppwpppdpp', 'pwpdppppwpp', '.ppppwpppd.', '..dppwppd..', '.....t.....', '.....t.....', '....tt.....', '.....t.....', '....ttt....'] },
  fire: { p: { y: '#ffe070', o: '#ff9a2a', r: '#e0401a', L: '#6a4224', l: '#8a5a32' }, r: ['....y......', '...yoy.....', '..yoooy.y..', '..oorooyo..', '.oorrroooo.', '.orrrrrroo.', '..rrrrrrr..', '.LlLlLlLlL.', 'LLlLLlLLlLL'] },
  fire2: { p: { y: '#ffe070', o: '#ff9a2a', r: '#e0401a', L: '#6a4224', l: '#8a5a32' }, r: ['......y....', '.....yoy...', '..y.yoooy..', '..oyoorooo.', '.ooooorrro.', '.oorrrrrro.', '..rrrrrrr..', '.LlLlLlLlL.', 'LLlLLlLLlLL'] },
  umbrella: { p: { k: '#2a3a5a', b: '#4a7ad8', c: '#2a5ab0', h: '#5a3a22', d: '#8ac8ff' }, r: ['.....k.....', '..bbbbbbc..', '.bbbbbbbbc.', 'bbbbbbbbbbc', 'b.c.b.c.b.c', '.....h.....', '.....h.....', '.....h.....', '.....h.....', '..d..h.d...', '...h.h.....', '....h......'] },
  meteor: { p: { g: '#a080e0', p: '#5a4a7a', P: '#e0d0ff', d: '#4a3a2a', D: '#3a2a20' }, r: ['...ggggg...', '..gpppppg..', '.gpPppppPg.', '.gpppPpppg.', '..gpppppg..', 'ddddddddddd', '.DDdddddDD.'] },
  sheaf: { p: { y: '#f0c040', Y: '#c09028', r: '#8a4a2a' }, r: ['.y.y.y.y.', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '...yyy...', '...rrr...', '...yyy...', '..yyyyy..', '..yYyYy..', '.yyyyyyy.', '.yYyYyYy.', 'yyyyyyyyy'] },
  jack: { p: { s: '#4a8a3a', o: '#ff8a2a', O: '#d0601a', y: '#ffe070' }, r: ['.....s.....', '....s......', '..ooooooo..', '.oOoOoOoOo.', 'oOyyoOoyyOo', 'oOoOoyoOoOo', 'oOyyyyyyyOo', '.oOoOoOoOo.', '..ooooooo..'] },
  wisp: { p: { k: '#3a3a44', l: '#7ad8c0', w: '#e8fff8', p: '#5a4a3a' }, r: ['..kkk..', '.klllk.', '.lwwwl.', '.lwwwl.', '.klllk.', '...p...', '...p...', '...p...', '...p...', '...p...', '...p...', '..ppp..'] },
  fir: { p: { y: '#ffd34a', g: '#2e7a42', G: '#1e5a32', R: '#e04848', B: '#5ab0ff', Y: '#ffe070', t: '#6a4a2c' }, r: ['.....y.....', '....ggg....', '...gRgGg...', '..ggggBgG..', '....gGg....', '...gggYg...', '..gRgggGgg.', '.ggggGggBg.', '...gggGgg..', '..gYggggRg.', '.gggGggggGg', 'ggBgggGgYgg', '.....t.....', '.....t.....', '....ttt....'] }
};
const PROPR = {};
for (const k in PROPS) {
  const ic = PROPS[k], list = [];
  for (let y = 0; y < ic.r.length; y++) {
    const row = ic.r[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch !== '.' && ic.p[ch]) { let e = x; while (e < row.length && row[e] === ch) e++; list.push(ic.p[ch], x, y, e - x); x = e; } else x++;
    }
  }
  PROPR[k] = { w: ic.r[0].length, h: ic.r.length, r: list };
}
export const propSprite = (name) => PROPR[name] || null;
// предмет от нижнего центра (x, y), масштаб sc
export function drawProp(ctx, name, x, y, sc = 1) {
  const p = PROPR[name];
  if (!p) return;
  const x0 = Math.round(x - (p.w * sc) / 2), y0 = Math.round(y - p.h * sc), r = p.r;
  for (let j = 0; j < r.length; j += 4) { ctx.fillStyle = r[j]; ctx.fillRect(x0 + r[j + 1] * sc, y0 + r[j + 2] * sc, r[j + 3] * sc, sc); }
}

// общее оформление событий: жетон, предмет, «небо», цвет вспышек, название жетонов (род. мн.)
export const EVK = {
  yule: { prop: 'snowman', sky: 'snow', col: '#cfe8ff', noun: 'СНЕЖИНОК' },
  maslenitsa: { prop: 'effigy', sky: 'ribbons', col: '#ffcf5a', noun: 'БЛИНОВ' },
  thaw: { prop: 'boat', sky: 'drops', col: '#7ad0ff', noun: 'КОРАБЛИКОВ' },
  jest: { prop: 'jbox', sky: 'confetti', col: '#ff8ad8', noun: 'ШУТОВСКИХ КОЛПАКОВ' },
  bloom: { prop: 'blossom', sky: 'petals', col: '#ffa0c8', noun: 'ЦВЕТКОВ' },
  kupala: { prop: 'fire', sky: 'fireflies', col: '#ff9a3a', noun: 'ЦВЕТКОВ ПАПОРОТНИКА' },
  storm: { prop: 'umbrella', sky: 'rain', col: '#e8e070', noun: 'МОЛНИЙ' },
  starfall: { prop: 'meteor', sky: 'meteors', col: '#c8b0ff', noun: 'МЕТЕОРИТОВ' },
  harvest: { prop: 'sheaf', sky: 'leaves', col: '#e0b040', noun: 'КОЛОСЬЕВ' },
  pumpkin: { prop: 'jack', sky: 'bats', col: '#ff8a2a', noun: 'ТЫКВ' },
  fog: { prop: 'wisp', sky: 'fog', col: '#b8fff0', noun: 'БОЛОТНЫХ ОГОНЬКОВ' },
  newyear: { prop: 'fir', sky: 'garland', col: '#7affc0', noun: 'ПОДАРКОВ' }
};

// ---------- «небо» события: дешёвые процедурные частицы без выделений памяти ----------
const SNOW_C = 'rgba(255,255,255,0.85)';
const RIB_C = ['#e04848', '#ffd34a', '#4a7ad8', '#48b048', '#ff8ad8'];
const CONF_C = ['#ff5a8a', '#ffe070', '#5ad0ff', '#7aff8a', '#c88aff', '#ff9a3a'];
const LEAF_C = ['#e0a030', '#c0601a', '#f0c040', '#a04a20'];
const BULB_C = ['#ff4a4a', '#ffd34a', '#4ad0ff', '#7aff8a', '#ff8ad8'];
const FOG_C = 'rgba(205,214,220,0.16)';
const FOG_C2 = 'rgba(205,214,220,0.10)';
const FLASH_C = ['rgba(240,244,255,0.10)', 'rgba(240,244,255,0.22)', 'rgba(240,244,255,0.34)'];
const DROP_C = 'rgba(170,210,255,0.7)';
const RAIN_C = 'rgba(180,200,240,0.55)';
const BAT_TINT = 'rgba(70,20,90,0.10)';
const SUN_C = 'rgba(255,210,120,0.10)';
const wrap = (v, m) => ((v % m) + m) % m;
// kind: snow|garland|ribbons|drops|confetti|petals|fireflies|rain|meteors|leaves|bats|fog|embers|spores|glints
export function drawEvSky(ctx, kind, t, W, H, skyH) {
  const sh = skyH || H * 0.5;
  if (kind === 'snow' || kind === 'garland') {
    ctx.fillStyle = SNOW_C;
    const n = kind === 'snow' ? 34 : 24;
    for (let i = 0; i < n; i++) {
      const x = wrap(i * 97 + t * (6 + (i % 5) * 3), W + 20) - 10 + Math.sin(t + i) * 4;
      const y = wrap(i * 53 + t * (10 + (i % 7) * 2), H + 10) - 5;
      const s = (i & 3) === 0 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
    if (kind === 'garland') {
      // гирлянда поверху: провод и мигающие лампочки
      ctx.fillStyle = '#1e3a24';
      for (let x = 0; x < W; x += 4) ctx.fillRect(x, 3 + Math.round(3 * Math.abs(Math.sin(x / 40))), 4, 1);
      for (let k = 0; k < 16; k++) {
        const x = 10 + k * Math.floor((W - 20) / 15);
        const on = ((t * 2.5 + k * 0.7) | 0) % 3 !== 0;
        ctx.fillStyle = on ? BULB_C[k % 5] : '#3a3a3a';
        ctx.fillRect(x, 4 + Math.round(3 * Math.abs(Math.sin(x / 40))), 2, 3);
      }
    }
  } else if (kind === 'ribbons') {
    ctx.fillStyle = SUN_C; ctx.fillRect(W - 90, 0, 90, sh * 0.6);
    for (let i = 0; i < 16; i++) {
      const x = wrap(i * 71 + t * (12 + (i % 4) * 4), W + 20) - 10;
      const y = wrap(i * 37 + t * (8 + (i % 3) * 3), H + 10) - 5;
      const w = ((t * 6 + i) | 0) & 1;
      ctx.fillStyle = RIB_C[i % 5];
      ctx.fillRect(Math.round(x), Math.round(y), w ? 3 : 2, w ? 1 : 2);
    }
  } else if (kind === 'drops' || kind === 'rain') {
    const n = kind === 'rain' ? 46 : 22;
    ctx.fillStyle = kind === 'rain' ? RAIN_C : DROP_C;
    for (let i = 0; i < n; i++) {
      const sp = kind === 'rain' ? 150 + (i % 5) * 20 : 60 + (i % 4) * 10;
      const y = wrap(i * 61 + t * sp, H + 10) - 5;
      const x = wrap(i * 89 - (kind === 'rain' ? y * 0.3 : 0), W);
      ctx.fillRect(Math.round(x), Math.round(y), 1, kind === 'rain' ? 4 : 2);
    }
    if (kind === 'drops') {
      // грачи прилетели
      ctx.fillStyle = '#1e1a22';
      for (let i = 0; i < 3; i++) {
        const x = Math.round(wrap(i * 120 + t * (14 + i * 3), W + 60) - 30), y = Math.round(sh * 0.3 + i * 7 + Math.sin(t + i) * 3);
        const up = ((t * 6 + i) | 0) & 1;
        ctx.fillRect(x, y, 2, 1); ctx.fillRect(x - 3, y + (up ? -1 : 1), 3, 1); ctx.fillRect(x + 2, y + (up ? -1 : 1), 3, 1);
      }
    } else {
      // молния: короткие вспышки раз в ~8.5 с
      const ph = wrap(t, 8.5);
      const f = ph < 0.08 ? 2 : ph > 0.2 && ph < 0.27 ? 1 : ph < 0.4 ? 0 : -1;
      if (f >= 0) {
        ctx.fillStyle = FLASH_C[f]; ctx.fillRect(0, 0, W, H);
        if (f > 0) {
          const cyc = Math.floor(t / 8.5);
          let x = 40 + ((cyc * 97) % (W - 80));
          ctx.fillStyle = '#fffbe0';
          for (let y = 0; y < sh * 0.8; y += 4) { ctx.fillRect(x, y, 1, 4); x += ((y * 7 + cyc) % 5) - 2; }
        }
      }
    }
  } else if (kind === 'confetti') {
    for (let i = 0; i < 30; i++) {
      const x = wrap(i * 83 + Math.sin(t * 1.5 + i) * 10, W);
      const y = wrap(i * 41 + t * (16 + (i % 6) * 3), H + 10) - 5;
      ctx.fillStyle = CONF_C[i % 6];
      ctx.fillRect(Math.round(x), Math.round(y), ((t * 5 + i) | 0) & 1 ? 2 : 1, 1);
    }
  } else if (kind === 'petals') {
    for (let i = 0; i < 22; i++) {
      const x = wrap(i * 79 + t * (14 + (i % 4) * 4), W + 20) - 10;
      const y = wrap(i * 43 + t * (7 + (i % 3) * 2) + Math.sin(t * 2 + i) * 6, H + 10) - 5;
      ctx.fillStyle = i % 3 ? '#ffb0d8' : '#fff0f8';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    }
  } else if (kind === 'fireflies' || kind === 'spores') {
    const n = kind === 'spores' ? 20 : 18;
    for (let i = 0; i < n; i++) {
      if (((t * 0.9 + i * 0.73) % 2.2) > 1.5) continue;
      const x = (i * 61) % W + Math.sin(t * 0.6 + i * 2.1) * 10;
      const y = H * 0.45 + ((i * 29) % Math.floor(H * 0.5)) + Math.cos(t * 0.8 + i) * 5;
      ctx.fillStyle = kind === 'spores' ? (i & 1 ? '#9aff9a' : '#7ae8e8') : '#e8ff90';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    if (kind === 'fireflies') {
      for (let i = 0; i < 8; i++) {
        const u = wrap(t * (0.15 + (i % 4) * 0.04) + i * 0.137, 1);
        ctx.fillStyle = u < 0.5 ? '#ffb050' : '#ff6a2a';
        ctx.fillRect(Math.round((i * 131) % W + Math.sin(t * 2 + i) * 5), Math.round(H - u * H * 0.7), 1, 1);
      }
    }
  } else if (kind === 'embers') {
    for (let i = 0; i < 20; i++) {
      const u = wrap(t * (0.12 + (i % 5) * 0.03) + i * 0.137, 1);
      ctx.fillStyle = u < 0.5 ? '#ffd060' : '#ff7a2a';
      ctx.fillRect(Math.round((i * 131) % W + Math.sin(t * 2 + i) * 6), Math.round(H - u * (H - 20)), 1, 1);
    }
  } else if (kind === 'meteors') {
    for (let i = 0; i < 3; i++) {
      const per = 4.3 + i * 1.7, ph = wrap(t + i * 2.1, per), cyc = Math.floor((t + i * 2.1) / per);
      if (ph > 0.9) continue;
      const u = ph / 0.9, x0 = 80 + ((cyc * 73 + i * 151) % (W - 60)), y0 = 4 + ((cyc * 31 + i * 17) % Math.max(4, Math.floor(sh * 0.4)));
      const hx = x0 - u * 90, hy = y0 + u * 40;
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = k === 0 ? '#ffffff' : k < 3 ? '#ffe8c0' : '#c8b0ff';
        ctx.fillRect(Math.round(hx + k * 3), Math.round(hy - k * 1.35), k === 0 ? 2 : 1, 1);
      }
    }
    for (let i = 0; i < 12; i++) if (((t * 1.3 + i * 0.61) % 3) < 1.6) { ctx.fillStyle = '#f0e8ff'; ctx.fillRect((i * 113 + 7) % W, (i * 23) % Math.max(8, Math.floor(sh * 0.7)) + 2, 1, 1); }
  } else if (kind === 'leaves') {
    for (let i = 0; i < 18; i++) {
      const x = wrap(i * 67 + t * (10 + (i % 4) * 4) + Math.sin(t * 1.7 + i) * 8, W + 20) - 10;
      const y = wrap(i * 47 + t * (9 + (i % 3) * 3), H + 10) - 5;
      ctx.fillStyle = LEAF_C[i % 4];
      const f = ((t * 4 + i) | 0) & 1;
      ctx.fillRect(Math.round(x), Math.round(y), f ? 2 : 1, f ? 1 : 2);
    }
  } else if (kind === 'bats') {
    ctx.fillStyle = BAT_TINT; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1020';
    for (let i = 0; i < 5; i++) {
      const x = Math.round(wrap(i * 90 - t * (22 + i * 4), W + 40) - 20), y = Math.round(10 + i * 9 + Math.sin(t * 3 + i) * 5);
      const up = ((t * 10 + i) | 0) & 1;
      ctx.fillRect(x - 1, y, 3, 2);
      ctx.fillRect(x - 4, y + (up ? -1 : 1), 3, 1); ctx.fillRect(x + 2, y + (up ? -1 : 1), 3, 1);
    }
  } else if (kind === 'fog') {
    for (let i = 0; i < 6; i++) {
      const y = Math.round(H * 0.35 + i * (H * 0.11)), h = 8 + (i % 3) * 4;
      const w = 120 + (i % 3) * 40, x = Math.round(wrap(i * 70 + t * (5 + i * 1.5), W + w) - w);
      ctx.fillStyle = i & 1 ? FOG_C : FOG_C2;
      ctx.fillRect(x, y, w, h); ctx.fillRect(x + 20, y - 3, w - 40, 3);
    }
    ctx.fillStyle = FOG_C2; ctx.fillRect(0, Math.round(H * 0.55), W, Math.round(H * 0.45));
  } else if (kind === 'glints') {
    for (let i = 0; i < 14; i++) {
      const b = Math.sin(t * 1.7 + i * 2.3);
      if (b < 0.55) continue;
      const x = (i * 113 + 19) % W, y = (i * 47 + 11) % Math.floor(H * 0.8);
      ctx.fillStyle = '#e8d8ff'; ctx.fillRect(x, y, 1, 1);
      if (b > 0.85) { ctx.fillStyle = '#b090ff'; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
    }
  }
}

// ---------- косметика мастерства: уровни открытия ----------
export const COS_LV = [0, 3, 8, 15, 25, 40];

// ---------- живые системы: событие месяца, мастерство (api.xp), турнир недели ----------
// cfg: { id, table: { [evId]: { goal, sky?, val? } }, cos?: [{ name }] }
export function createLive(api, prog, cfg) {
  const variant = prog.variant, author = prog.author;
  const L = {
    ev: null, id: 'yule', key: '', def: null, vis: EVK.yule, ic: 'ev_yule', noun: '', goal: 0,
    tour: false, week: null, mx: 0, lvl: 0, frac: 0, mlab: 'МАСТЕР 0', pend: 0, act: 0, flushT: 0, chkT: 10,
    evOv: -1, announced: false, xpCalls: 0,
    refresh() {
      let e = null;
      if (L.evOv >= 0) { const b = EVENTS[L.evOv]; const c = currentEvent(); e = { id: b.id, name: b.name, desc: b.desc, month: b.month, year: c.year, daysLeft: c.daysLeft }; }
      else {
        try { if (api && typeof api.event === 'function') e = api.event(); } catch (er) { e = null; }
        if (!e || !EVK[e.id]) e = currentEvent();
      }
      L.ev = e; L.id = e.id; L.key = e.id + (e.year | 0);
      L.vis = EVK[e.id]; L.ic = 'ev_' + e.id; L.noun = L.vis.noun;
      L.def = cfg.table[e.id] || null; L.goal = L.def ? L.def.goal : 0;
      let w = null;
      try { if (api && typeof api.week === 'function') w = api.week(); } catch (er) { w = null; }
      L.week = w; L.tour = !variant && !!(w && w.isThisGame);
      let m = null;
      try { if (api && typeof api.mastery === 'function') m = api.mastery(); } catch (er) { m = null; }
      if (m && Number.isFinite(Number(m.xp))) L.mx = Math.max(0, Number(m.xp));
      L.setLvl(true);
      const S = prog.S;
      if (!variant && S) {
        if (!Array.isArray(S.evh)) S.evh = [];
        if (!S.ev || typeof S.ev !== 'object' || S.ev.k !== L.key) {
          if (S.ev && S.ev.d && typeof S.ev.k === 'string' && S.evh.indexOf(S.ev.k) < 0) { S.evh.push(S.ev.k); if (S.evh.length > 24) S.evh.shift(); }
          S.ev = { k: L.key, n: 0, d: 0 };
        }
        S.ev.n = Math.max(0, Number(S.ev.n) || 0);
        if (S.ev.d) prog.grant('ev_' + L.id); // потерянный значок восстанавливается
      }
    },
    setLvl(quiet) {
      const l = levelOf(L.mx);
      if (!quiet && l > L.lvl) { prog.toast('МАСТЕРСТВО: УРОВЕНЬ ' + l, '#9cf0ff'); try { api.sfx && api.sfx('win'); } catch (e) { /* звук */ } }
      if (l !== L.lvl || quiet) L.mlab = 'МАСТЕР ' + l;
      L.lvl = l;
      const a = xpFor(l), b = xpFor(l + 1);
      L.frac = (L.mx - a) / Math.max(1, b - a);
    },
    // первое начало игры за сессию: объявить событие и турнир
    announce() {
      if (L.announced || variant) return;
      L.announced = true;
      prog.toast('СОБЫТИЕ: ' + L.ev.name, L.vis.col);
      if (L.tour) prog.toast('ТУРНИР НЕДЕЛИ: ЭТА ИГРА!', '#ffd34a');
    },
    // ---- испытание события ----
    bump(n = 1) {
      const S = prog.S;
      if (variant || !S || !L.def || !S.ev || S.ev.d) return;
      S.ev.n += n * (author ? 30 : 1);
      prog.dirty = true;
      if (S.ev.n >= L.goal) {
        S.ev.n = L.goal; S.ev.d = 1;
        prog.toast('ИСПЫТАНИЕ «' + L.ev.name + '» ПРОЙДЕНО!', L.vis.col);
        prog.grant('ev_' + L.id);
        try { api.sfx && api.sfx('win'); } catch (e) { /* звук */ }
        prog.save();
      }
    },
    evN() { const S = prog.S; return S && S.ev ? Math.floor(S.ev.n) : 0; },
    evDone() { const S = prog.S; return !!(S && S.ev && S.ev.d); },
    // ---- опыт мастерства: копится и уходит пачками ----
    xp(n) { if (variant || !(n > 0)) return; L.pend += n; },
    tick(dt, active) {
      L.chkT -= dt;
      if (L.chkT <= 0) {
        L.chkT = 10;
        if (L.evOv < 0) {
          let e = null;
          try { e = api && typeof api.event === 'function' ? api.event() : null; } catch (er) { e = null; }
          if (!e || !EVK[e.id]) e = currentEvent();
          if (e.id !== L.id || e.id + (e.year | 0) !== L.key) L.refresh();
        }
      }
      if (variant || !active) return;
      L.act += dt;
      if (L.act >= 10) { L.act -= 10; L.pend += 1; }
      L.flushT += dt;
      if (L.flushT >= 30) L.flush();
    },
    flush() {
      L.flushT = 0;
      const n = Math.floor(L.pend);
      if (variant || n <= 0) return 0;
      L.pend -= n;
      if (!author) {
        try { if (api && typeof api.xp === 'function') { api.xp(n); L.xpCalls++; } } catch (e) { /* хост */ }
      }
      L.mx += n;
      L.setLvl(false);
      return n;
    },
    // ---- перки мастерства (маленькие, необязательные) ----
    coinMul() { return 1 + Math.min(0.2, 0.01 * Math.floor(L.lvl / 5)); },
    cosOpen() { let n = 0; for (const l of COS_LV) if (L.lvl >= l || author) n++; return n; },
    cos() {
      const S = prog.S, open = L.cosOpen();
      const c = S && Number.isInteger(S.cos) ? S.cos : -1;
      return c >= 0 && c < open ? c : open - 1;
    },
    // ---- автор: \\ — следующее событие (посмотреть все 12) ----
    authorKey(code) {
      if (!author || code !== 'Backslash') return false;
      L.evOv = ((L.evOv >= 0 ? L.evOv : EV_IDS.indexOf(L.id)) + 1) % EV_IDS.length;
      L.refresh();
      prog.toast('(АВТОР) СОБЫТИЕ: ' + L.ev.name, '#ffb0e0');
      return true;
    },
    // ---- HUD: мастер N + полоска, «ТУРНИР», жетон события n/m ----
    drawHud(ctx, x, y) {
      if (variant) return 0;
      const h = 10 + (L.tour ? 9 : 0) + (L.def ? 9 : 0);
      ctx.fillStyle = 'rgba(16,10,14,0.5)'; ctx.fillRect(x - 2, y - 2, 56, h + 2);
      drawLabel(ctx, L.mlab, x, y, '#9cf0ff');
      bar(ctx, x, y + 6, 52, 1, L.frac, '#9cf0ff', 'rgba(0,0,0,0.6)');
      let yy = y + 9;
      if (L.tour) { drawIcon(ctx, 'trophy', x, yy); drawLabel(ctx, 'ТУРНИР', x + 9, yy + 1, '#ffd34a'); yy += 9; }
      if (L.def) {
        kitIcon(ctx, L.ic, x, yy);
        if (L.evDone()) kitIcon(ctx, 'check', x + 9, yy);
        else {
          const w = drawInt(ctx, L.evN(), x + 9, yy + 1, '#ffffff');
          drawText(ctx, '/', x + 10 + w, yy + 1, '#a09080');
          drawInt(ctx, L.goal, x + 14 + w, yy + 1, '#c8b8a0');
        }
      }
      return h;
    },
    // ---- страница книжки ----
    page(cosNames) {
      return {
        title: 'СОБЫТИЕ',
        rows: () => {
          const out = [], S = prog.S, e = L.ev;
          out.push({ t: e.name, ic: L.ic, r: 'ЕЩЁ ' + (e.daysLeft | 0) + ' ДН.', c: L.vis.col });
          out.push({ t: e.desc, c: '#8a6a3a' });
          if (L.def) {
            out.push({ t: 'СОБЕРИ ' + L.goal + ' ' + L.noun, ic: L.ic, r: L.evDone() ? 'ГОТОВО' : L.evN() + '/' + L.goal, c: L.evDone() ? '#9cf08a' : '#ffffff' });
            const rw = rewardById('ev_' + L.id);
            out.push({ t: 'НАГРАДА: ЗНАЧОК «' + (rw ? rw.name : L.id) + '»', ic: 'star', c: '#8a6a3a' });
          }
          if (S && Array.isArray(S.evh) && S.evh.length) out.push({ t: 'ПРОШЛЫХ ИСПЫТАНИЙ ПРОЙДЕНО', ic: 'check', r: String(S.evh.length) });
          const w = L.week;
          out.push({ t: L.tour ? 'ТУРНИР НЕДЕЛИ: ЭТА ИГРА!' : 'ТУРНИР НЕДЕЛИ: ' + (w && GAME_NAMES[w.game] ? GAME_NAMES[w.game] : '-'), ic: 'star', r: w ? 'ЕЩЁ ' + (w.daysLeft | 0) + ' ДН.' : '', c: L.tour ? '#ffd34a' : '#ffffff' });
          out.push({ t: '- МАСТЕРСТВО -', c: '#8a6a3a' });
          out.push({ t: 'УРОВЕНЬ ' + L.lvl, ic: 'bolt', r: Math.floor(L.mx) + '/' + xpFor(L.lvl + 1) + ' ОП.', c: '#2a8aa8' });
          out.push({ t: 'МОНЕТЫ +' + Math.round((L.coinMul() - 1) * 100) + '%', ic: 'coin', s: '+1% ЗА 5 УРОВНЕЙ', r: 'ДО 20%' });
          if (cosNames) {
            const cur = L.cos(), open = L.cosOpen();
            for (let i = 0; i < cosNames.length && i < COS_LV.length; i++) {
              const lock = i >= open;
              out.push({ t: cosNames[i].name, sw: cosNames[i].c, ic: 'lock', lock, r: lock ? 'УР. ' + COS_LV[i] : i === cur ? 'НАДЕТО' : 'ВЫБРАТЬ', c: i === cur ? '#9cf08a' : '#ffffff' });
            }
          }
          return out;
        },
        pick: (i) => {
          if (!cosNames || variant) return false;
          const base = L.cosRow();
          const k = i - base;
          if (k < 0 || k >= cosNames.length || k >= L.cosOpen()) return false;
          prog.S.cos = k; prog.save();
          try { api.sfx && api.sfx('coin'); } catch (e) { /* звук */ }
          return true;
        },
        foot: () => 'ОПЫТ ' + Math.floor(L.mx) + '  УРОВЕНЬ ' + L.lvl
      };
    }
  };
  // номер первой строки косметики на странице (повторяет порядок rows())
  L.cosRow = () => {
    const S = prog.S;
    return 2 + (L.def ? 2 : 0) + (S && Array.isArray(S.evh) && S.evh.length ? 1 : 0) + 1 + 1 + 2;
  };
  prog.onLoad = () => L.refresh();
  return L;
}
