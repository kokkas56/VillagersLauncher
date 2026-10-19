// Общий «набор прогресса» для мини-игр runner / fair / mine:
// сохранение (api.load/api.save, отдельный authorSave), ежедневные задания, награды лаунчера,
// всплывающие сообщения, пиксельная книжка (альбом / магазин / задания) и мелкие иконки.
// Ничего не выделяет в кадре, кроме случаев, когда открыта книжка (игра в это время на паузе).
import { drawLabel, labelWidth, drawInt, intWidth, drawText } from '../pixfont.js';
import { rewardById } from '../rewards.js';

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
    author, variant, S: null, toasts: [], dirty: false, dayT: 0, celebrate: 0,
    load() {
      if (variant) { P.S = fill({}, cfg.fresh()); if (cfg.fix) cfg.fix(P.S); return P.S; }
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
