// «Побег» — кампания из 10 тюрем. В каждой своя охрана и свои звери; куй заказы на наковальне ради милости
// и тайком копай подкоп, пока никто не видит. Готовый подкоп — ползёшь в следующую тюрьму.
// В последнем зале ждёт сам Кокк (нарисован по его настоящему скину) и вручает плащ беглеца.
// Одновременно живой фон лаунчера: тюрьма, в которой игрок сидит сейчас (idle → intro → play → over/outro).
import { drawText, textWidth, drawInt, intWidth, drawLabel, labelWidth, drawIcon } from './pixfont.js';
import {
  W, H, FLOOR, ANVIL_X, SMITH_X, DIG_X, CROUCH_X, CRATE_X, TUN_Y, TUN_H, SHAFT_LEN, TUN_LEN, SEGS, SHIFT,
  authorNeedOf, FREE_NEED, needOf, EXPECT_TOOL, SHOVELS, ITEMS, PRISONS, REWARD_AT, ARTEFACTS, DAILY
} from './prison/config.js';
import { freshData, readRoot, buildRoot, rollDaily, albumCount, hasArt, addArt, rewardsFor } from './prison/progress.js';
import { alphaTable, pickA, rng, drawArt, drawIco } from './prison/art.js';
import { drawGuard, drawBeast, drawSeer, drawPrisoner } from './prison/figures.js';
import { makeScene, drawStatic, updateScene, drawBack, drawFront } from './prison/scenes.js';
import { buildKokk, skinPixels, drawKokk } from './prison/kokk.js';

const BTN = { x: 274, y: 140, w: 42, h: 36 }; // кнопка-лопата
const BOOK = { x: 3, y: 3, w: 16, h: 16 }; // кнопка-книга
const SLOT_Y = 160;
const INTRO_T = 1.9;
const OUTRO_T = 3.0;
const OUTRO_MAX = 3.8;
const ESC_DROP = 0.8; // прыжок в лаз
const ESC_CRAWL = 3.8; // конец ползка
const ESC_END = 6.2; // конец баннера новой тюрьмы
const FIN_END = 14.5;

const ORDERS = [
  { icon: 'horseshoe', speed: 0.85, mult: 1 },
  { icon: 'pickaxe', speed: 1.1, mult: 1.5 },
  { icon: 'sword', speed: 1.35, mult: 2 }
];

const DIM = alphaTable(10, 6, 10, 0.45);
const BLACK = alphaTable(0, 0, 0, 1);
const WHITE = alphaTable(255, 250, 230, 1);
const WARDG = alphaTable(200, 120, 255, 0.5);
const CONE_N = 'rgba(255,220,120,0.16)';
const CONE_A = 'rgba(255,60,50,0.26)';
const CONE_E = 'rgba(255,230,150,0.35)';
const CONE_EA = 'rgba(255,90,80,0.55)';
const PANEL = 'rgba(16,12,18,0.86)';
const SHADE = 'rgba(20,14,18,0.6)';

const FINALE_LINES = ['ПРИВЕТ, БЕГЛЕЦ!', 'ТЫ ПРОШЁЛ ВСЕ 10 ТЮРЕМ.', 'ДЕРЖИ ПЛАЩ БЕГЛЕЦА!', 'ТЫ СВОБОДЕН!'];
const FINALE_AT = [2.4, 5.2, 8.0, 10.8];
const PAGE_NAMES = ['ЛАВКА', 'АЛЬБОМ', 'ЗАДАНИЯ'];

export default {
  id: 'prison',
  title: 'Побег',
  sceneTitle: 'Тюрьма',
  desc: 'Десять тюрем, одна лопата. Куй заказы ради милости охраны и тайком копай подкоп, пока никто не видит.',
  controls: 'Пробел/↑/клик — молот · держи ↓ или кнопку-лопату — копать · 1–5 — хитрости · Tab — книга',

  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const rand = rng((Date.now() ^ 0xa11e) >>> 0);
    const variant = Math.max(0, Math.min(10, Math.floor(Number(api && api.variant) || 0)));
    const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (e) { /* звук не обязателен */ } };
    const getMode = () => {
      if (variant) return 'idle';
      try { return typeof api.mode === 'function' ? api.mode() : 'play'; } catch (e) { return 'idle'; }
    };
    const readBest = () => Math.max(0, Math.floor(Number(api && api.best) || 0));
    let best = readBest();

    // ---------- прогресс ----------
    let real = freshData();
    let auth = freshData();
    let authorMode = false;
    let D = real;
    const isAuthor = () => { try { return !!api.author; } catch (e) { return false; } };
    const hasR = (id) => { try { return typeof api.hasReward === 'function' && !!api.hasReward(id); } catch (e) { return false; } };
    const grant = (id) => {
      if (variant) return;
      if (authorMode) { msg('(АВТОР) НАГРАДА', '#c8a0ff'); return; }
      if (hasR(id)) return;
      try { typeof api.reward === 'function' && api.reward(id); } catch (e) { /* хост */ }
    };
    const loadSave = () => {
      if (variant) { D = freshData(); D.cur = variant; return; }
      let raw = {};
      try { raw = typeof api.load === 'function' ? api.load() || {} : {}; } catch (e) { raw = {}; }
      const r = readRoot(raw);
      real = r.real; auth = r.author;
      authorMode = isAuthor();
      D = authorMode ? auth : real;
      // потерянные награды восстанавливаются сами
      if (!authorMode) for (const id of rewardsFor(real.cur)) if (!hasR(id)) { try { api.reward(id); } catch (e) { /* хост */ } }
    };
    let saveT = 0;
    const persist = () => {
      if (variant) return;
      saveT = 0;
      try { typeof api.save === 'function' && api.save(buildRoot(real, auth)); } catch (e) { /* хост */ }
    };
    const getDay = () => { try { return typeof api.day === 'function' ? api.day() : null; } catch (e) { return null; } };
    const checkDay = () => { if (!variant && rollDaily(D.dy, getDay(), Math.min(10, D.cur))) persist(); };
    loadSave();
    checkDay();
    const isFree = () => !variant && D.cur > 10;
    const homeP = () => (isFree() ? (D.rp || 10) : Math.min(10, D.cur));
    const curNeed = () => (isFree() ? (authorMode ? 30 : FREE_NEED) : authorMode ? authorNeedOf(Math.min(10, D.cur)) : needOf(Math.min(10, D.cur)));
    const toolMul = () => (authorMode ? Math.max(SHOVELS[D.tool].mul, EXPECT_TOOL[Math.min(10, D.cur) - 1]) : SHOVELS[D.tool].mul);

    // ---------- Кокк ----------
    let kokk = buildKokk(null);
    try {
      if (typeof api.skin === 'function') {
        const pr0 = api.skin(api.authorNick || 'Kokk');
        if (pr0 && typeof pr0.then === 'function') pr0.then((img) => { const px = skinPixels(img); if (px && alive) { kokk = buildKokk(px); if (S) S.kokk = kokk; } }, () => {});
      }
    } catch (e) { /* запасной Кокк */ }
    const KK = { on: false, x: 300, tx: 300, walk: 0, reach: 0, wave: 0, t: 0, face: -1 }; // Кокк на полу

    // ---------- фазы ----------
    // idle | intro | play | end | wait | escape | finale | outro
    let phase = 'idle';
    let pt = 0;
    let age = 0;
    let clock = 0;
    let sawOver = false;
    let fl1 = false;
    let endWin = false;
    let menu = false;
    let page = 0;
    let sel = 0;

    // ---------- сцена ----------
    let S = null;
    let sceneP = 0;
    const guards = [];
    const beasts = [];
    const seers = [];
    const wards = [];
    let bg = null;
    let bgReady = false;
    try {
      if (typeof OffscreenCanvas !== 'undefined') bg = new OffscreenCanvas(W, H);
      else if (typeof document !== 'undefined') { bg = document.createElement('canvas'); bg.width = W; bg.height = H; }
    } catch (e) { bg = null; }

    const setScene = (p) => {
      sceneP = p;
      S = makeScene(p, rand);
      S.kokk = kokk;
      S.kokkOnBalcony = p === 10 && !(isFree() && !variant);
      bgReady = false;
      const def = PRISONS[p];
      guards.length = 0; beasts.length = 0; seers.length = 0; wards.length = 0;
      for (const g of def.guards) guards.push({ look: g.look, x: g.x, y: g.ledge || FLOOR, ledge: !!g.ledge, dir: -1, state: 'ipause', t: 0, len: 1, spd: g.spd, base: g.spd, vis: g.vis, sus: g.sus, min: g.min, max: g.max, post: !!g.post, home: g.x, tx: g.x, after: '', moving: false, stir: 0, look2: 0, drunk: 0 });
      for (const b of def.beasts) beasts.push({ kind: b.kind, x: b.x, dir: -1, st: 'idle', t: 0, len: 1, tx: b.x, min: b.min, max: b.max, spd: b.spd, rad: b.rad, pond: !!b.pond, sub: !!b.pond, home: false, warn: 0, chew: 0 });
      for (const s of def.seers) seers.push({ kind: s.kind, x: s.x, y: s.y, bx: s.x, by: s.y, tx: s.x, ty: s.y, dir: 1, st: s.kind === 'parrot' ? 'perch' : 'fly', t: 0, len: 3, rad: s.rad, through: !!s.through });
      for (const w of def.wards) wards.push({ x: w.x, per: w.per, off: w.off });
      KK.on = p === 10 && isFree();
      KK.x = 250; KK.tx = 250; KK.walk = 0; KK.reach = 0; KK.wave = 0;
    };
    setScene(variant || homeP());

    // ---------- состояние смены ----------
    let time = 0;
    let scoreV = 0;
    let lastScore = 0;
    let order = null;
    let orderGap = 0;
    let marker = 0;
    let mdir = 1;
    let zoneC = 0.5;
    let hitCd = 0;
    let swing = 0;
    let lastQ = -1;
    let lastQT = 0;
    let combo = 0;
    let runCombo = 0;
    let digHoldKey = false;
    let digHoldPtr = false;
    let digging = false;
    let sw = 0; // 0 у наковальни … 1 у лаза
    let digSnd = 0;
    let seenT = 0;
    let seenBy = 0; // 0 стражник, 1 зверь, 2 дух, 3 руна
    let heat = 0;
    let faintT = 0;
    let flaskT = 0;
    let cloakT = 0;
    let quakeT = 40;
    let quakeWarn = 0;
    let stunT = 0;
    let caughtLoss = 0;
    let runFav = 0;
    let runDig = 0;
    let lastSeg = 0;
    let wardClock = 0;
    let finaleGiven = false;
    let pendingFinal = false;
    let crawlPal = null;
    let crawlFrom = 1;
    let escToP = 1;
    let escWasFree = false;
    let escArrived = false;
    let bannerT = 0;
    let bannerP = 0;
    let dayT = 0;
    // подача
    let hudA = 0;
    let coneA = 0;
    let tileOpen = 0;
    let pileA = 0;
    let bellT = 0;
    let dimA = 0;
    let crateN = 2;
    const pr = { x: SMITH_X, tx: SMITH_X, spd: 40, pose: 'forge', face: 1, st: 'forge', t: 0, hitT: 0.6, hits: 0, need: 6, icon: 'horseshoe', wink: 0 };
    const prq = { x: SMITH_X, pose: 'forge', face: 1, wink: 0, dig: false, shovel: false, swing: 0, sheep: false, cape: false };
    let tGlance = 8 + rand() * 8;
    let dark = 1;
    let anim = true;
    let envT = 0;
    const pollEnv = () => {
      try {
        const e = typeof api.env === 'function' ? api.env() : null;
        if (e) { dark = Math.max(0, Math.min(1, Number(e.dark) || 0)); anim = e.animations !== false; }
      } catch (err) { /* по умолчанию */ }
    };
    pollEnv();

    // частицы и всплывающие надписи
    const parts = [];
    for (let i = 0; i < 56; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff', g: 1 });
    const spark = (x, y, n, c, spd, g = 1) => {
      for (let i = 0; i < parts.length && n > 0; i++) {
        const p = parts[i];
        if (p.on) continue;
        p.on = true; p.x = x; p.y = y;
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
        const v = spd * (0.4 + rand() * 0.8);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
        p.life = 0.3 + rand() * 0.4;
        p.c = c; p.g = g;
        n--;
      }
    };
    const pops = [];
    for (let i = 0; i < 6; i++) pops.push({ on: false, x: 0, y: 0, s: '', c: '#fff', life: 0 });
    const pop = (x, y, s, c) => {
      let p = pops[0];
      for (let i = 0; i < pops.length; i++) if (!pops[i].on) { p = pops[i]; break; }
      p.on = true; p.x = x; p.y = y; p.s = s; p.c = c; p.life = 1;
    };
    const msgs = [];
    for (let i = 0; i < 3; i++) msgs.push({ on: false, s: '', c: '#fff', t: 0, w: 0 });
    function msg(s, c) {
      let m = msgs[0];
      for (let i = 0; i < msgs.length; i++) if (!msgs[i].on) { m = msgs[i]; break; }
      if (m.on) { msgs[0].on = false; msgs.push(msgs.shift()); m = msgs[2]; }
      m.on = true; m.s = s; m.c = c; m.t = 2.6; m.w = labelWidth(s, 1);
    }

    function setPhase(p) {
      phase = p; pt = 0; fl1 = false;
      if (typeof api._phase === 'function') { try { api._phase(p); } catch (e) { /* отладка */ } }
    }

    // ---------- ежедневные задания ----------
    const task = (k, add, isMax) => {
      if (variant) return;
      const t = D.dy.t;
      for (let i = 0; i < t.length; i++) {
        const q = t[i];
        if (q.done || DAILY[q.i].k !== k) continue;
        q.n = isMax ? Math.max(q.n, add) : q.n + add;
        if (q.n >= q.g) {
          q.n = q.g; q.done = 1;
          const f = DAILY[q.i].fav;
          D.fav += f; runFav += f;
          msg('ЗАДАНИЕ ВЫПОЛНЕНО +' + f, '#7dffaa');
          sfx('win');
          persist();
        }
      }
    };

    // ---------- ковка ----------
    const timeLeft = () => Math.max(0, SHIFT - time);
    const hardK = () => (sceneP - 1) / 9;
    const zoneW = () => (0.15 - 0.05 * Math.min(1, time / SHIFT)) * (1 - 0.15 * hardK());
    const newOrder = () => {
      const tier = time < 25 ? 1 : time < 60 ? 2 : 3;
      const o = ORDERS[Math.floor(rand() * tier)];
      const pat = 11 - 3.5 * Math.min(1, time / SHIFT);
      order = { o, hits: [], pat, max: pat };
      zoneC = 0.2 + rand() * 0.6;
      marker = 0; mdir = 1;
    };
    const hit = () => {
      if (phase !== 'play' || menu || !order || orderGap > 0) return;
      if (hitCd > 0 || sw > 0 || faintT > 0) return;
      const half = zoneW() / 2;
      const d = Math.abs(marker - zoneC);
      let q = 0;
      if (d <= half) q = 2;
      else if (d <= half + 0.11) q = 1;
      swing = 0.16;
      hitCd = q === 0 ? 0.45 : 0.28;
      lastQ = q; lastQT = 0.5;
      order.hits.push(q);
      const m = order.o.mult;
      const ax = ANVIL_X + 2, ay = FLOOR - 22;
      if (q === 2) {
        combo++;
        if (combo > runCombo) { runCombo = combo; task('combo', combo, true); }
        const pts = Math.round(10 * m) + Math.min(10, combo);
        scoreV += pts;
        pop(ax, ay - 14, '+' + pts, '#7dffaa');
        spark(ax, ay, 9, '#ffd060', 70);
        sfx('coin');
        D.st.perf++;
        task('perf', 1);
      } else if (q === 1) {
        combo = 0;
        const pts = Math.round(4 * m);
        scoreV += pts;
        pop(ax, ay - 14, '+' + pts, '#ffe08a');
        spark(ax, ay, 4, '#ff9a40', 50);
        sfx('click');
      } else {
        combo = 0;
        pop(ax, ay - 14, 'x', '#ff7070');
        spark(ax, ay, 2, '#a0a0a0', 30);
        sfx('hit');
      }
      zoneC = 0.15 + rand() * 0.7;
      if (order.hits.length >= 3) {
        let good = 0, perfect = true;
        for (let i = 0; i < order.hits.length; i++) { if (order.hits[i] > 0) good++; if (order.hits[i] !== 2) perfect = false; }
        let bonus = good >= 2 ? Math.round(10 * m) : 0;
        let fav = good >= 2 ? Math.round(2 * m) : 0;
        if (perfect) { bonus += Math.round(15 * m); fav += Math.round(3 * m); }
        if (bonus > 0) {
          scoreV += bonus;
          D.fav += fav; runFav += fav;
          pop(46, 74, '+' + fav, '#ffd34a');
          if (perfect) spark(ax, ay - 6, 12, '#7dffaa', 80);
          crateN = Math.min(6, crateN + 1);
          D.st.ord++;
          task('ord', 1);
        }
        orderGap = 0.7;
      }
    };

    // ---------- предметы ----------
    const useItem = (i) => {
      if (phase !== 'play' || menu) return;
      const it = ITEMS[i];
      if (!it) return;
      if (D.it[i] <= 0) { msg('НЕТ: ' + it.name.toUpperCase(), '#ff9a80'); sfx('hit'); return; }
      let used = false;
      if (it.id === 'bone') {
        let b = null, bd = 1e9;
        for (const q of beasts) { if (q.st === 'chew' || q.sub) continue; const d = Math.abs(q.x - DIG_X); if (d < bd) { bd = d; b = q; } }
        if (b) { b.st = 'chew'; b.t = 0; b.chew = 25; b.warn = 0; used = true; msg('ГРЫЗЁТ КОСТЬ', '#ece4d0'); }
        else msg('НЕКОМУ БРОСИТЬ', '#ff9a80');
      } else if (it.id === 'bottle') {
        let g = null, gd = 1e9;
        for (const q of guards) { if (q.drunk > 0 || q.look === 'golem' || q.look === 'shade') continue; const d = Math.abs(q.x - DIG_X); if (d < gd) { gd = d; g = q; } }
        if (g) { g.drunk = 12; g.state = 'drunk'; g.t = 0; used = true; msg('СТРАЖ ЗАДРЕМАЛ', '#9ae0a0'); }
        else msg('ЭТОТ НЕ ПЬЁТ', '#ff9a80');
      } else if (it.id === 'cloak') { cloakT = 20; used = true; msg('ПЛАЩ: МАГИЯ СЛЕПА', '#c8a0ff'); }
      else if (it.id === 'flask') { heat = 0; faintT = 0; flaskT = 30; used = true; msg('ГЛОТОК ВОДЫ', '#8ad0ff'); }
      else if (it.id === 'prop') { msg('ПОДПОРКА СРАБОТАЕТ САМА', '#e0c080'); }
      if (used) { D.it[i]--; sfx('click'); task('item', 1); persist(); }
    };

    // ---------- лавка ----------
    const shopRows = () => 1 + ITEMS.length;
    const buy = (row) => {
      if (row === 0) {
        const nx = D.tool + 1;
        if (nx >= SHOVELS.length) { msg('ЛУЧШЕ НЕ БЫВАЕТ', '#ffd34a'); return; }
        if (D.fav < SHOVELS[nx].cost) { msg('МАЛО МИЛОСТИ', '#ff9a80'); sfx('hit'); return; }
        D.fav -= SHOVELS[nx].cost; D.tool = nx; sfx('win'); msg('НОВАЯ: ' + SHOVELS[nx].name.toUpperCase(), '#7dffaa'); persist();
        return;
      }
      const i = row - 1;
      const it = ITEMS[i];
      if (!it) return;
      if (D.it[i] >= it.max) { msg('БОЛЬШЕ НЕ УНЕСТИ', '#ff9a80'); return; }
      if (D.fav < it.cost) { msg('МАЛО МИЛОСТИ', '#ff9a80'); sfx('hit'); return; }
      D.fav -= it.cost; D.it[i]++; sfx('coin'); persist();
    };

    // ---------- ввод ----------
    const KEYS_HIT = { Space: 1, Enter: 1, ArrowUp: 1, KeyW: 1 };
    const KEYS_DIG = { ArrowDown: 1, KeyS: 1 };
    const KEYS_ITEM = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };
    const toggleMenu = () => {
      if (phase !== 'play') return;
      menu = !menu;
      digHoldKey = false; digHoldPtr = false;
      sfx('click');
      if (menu) sel = 0;
    };
    // после свободы: вернуться в пройденную тюрьму (0 — последний зал) — ради заданий дня, альбома и испытаний
    function goReplay(p) {
      if (!isFree() || phase !== 'play') return;
      D.rp = p; D.dug = 0; lastSeg = 0;
      setScene(homeP());
      bannerP = sceneP; bannerT = 2.4;
      menu = false;
      continueAfterEscape();
      msg(p ? 'СНОВА В ТЮРЬМЕ ' + p : 'ПОСЛЕДНИЙ ЗАЛ', '#ffd34a');
    }
    const menuKey = (code) => {
      const left = code === 'ArrowLeft' || code === 'KeyA', right = code === 'ArrowRight' || code === 'KeyD';
      if (page === 1 && left && sel % 10 > 0) sel--;
      else if (page === 1 && right && sel % 10 < 9) sel++;
      else if (left) { page = (page + 2) % 3; sel = 0; sfx('click'); }
      else if (right) { page = (page + 1) % 3; sel = 0; sfx('click'); }
      else if (code === 'ArrowUp' || code === 'KeyW') { sel = page === 1 ? (sel + ARTEFACTS.length - 10) % ARTEFACTS.length : Math.max(0, sel - 1); }
      else if (code === 'ArrowDown' || code === 'KeyS') { sel = page === 1 ? (sel + 10) % ARTEFACTS.length : Math.min(page === 0 ? shopRows() - 1 : 2, sel + 1); }
      else if (code === 'Enter' || code === 'Space') { if (page === 0) buy(sel); }
      else if (page === 2 && isFree() && /^Digit[0-9]$/.test(code)) { const n = Number(code.slice(5)); goReplay(n === 0 ? 0 : n); }
    };
    const onKeyDown = (e) => {
      if (phase !== 'play') return; // в покое и в сценках клавиши принадлежат лаунчеру
      const c = e.code;
      if (c === 'Tab' || c === 'KeyB') { e.preventDefault(); if (!e.repeat) toggleMenu(); return; }
      if (menu) {
        if (c === 'Escape') return; // Esc — лаунчеру
        e.preventDefault();
        if (!e.repeat || c.startsWith('Arrow')) menuKey(c);
        return;
      }
      if (authorMode && (e.key === ']' || c === 'BracketRight')) { e.preventDefault(); if (!e.repeat) authorSkip(1); return; }
      if (authorMode && (e.key === '[' || c === 'BracketLeft')) { e.preventDefault(); if (!e.repeat) authorSkip(-1); return; }
      if (KEYS_HIT[c]) { e.preventDefault(); if (!e.repeat) hit(); }
      else if (KEYS_DIG[c]) { e.preventDefault(); if (!e.repeat) digHoldKey = true; }
      else if (KEYS_ITEM[c] !== undefined) { e.preventDefault(); if (!e.repeat) useItem(KEYS_ITEM[c]); }
    };
    const onKeyUp = (e) => {
      if (KEYS_DIG[e.code]) { digHoldKey = false; if (phase === 'play') e.preventDefault(); }
      else if (KEYS_HIT[e.code] && phase === 'play') e.preventDefault();
    };
    const onBlur = () => { digHoldKey = false; digHoldPtr = false; };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H };
    };
    let digPtrId = null;
    const onDown = (e) => {
      if (phase !== 'play') return;
      e.preventDefault();
      const p = toLocal(e);
      if (p.x >= BOOK.x - 2 && p.x <= BOOK.x + BOOK.w + 2 && p.y >= BOOK.y - 2 && p.y <= BOOK.y + BOOK.h + 2) { toggleMenu(); return; }
      if (menu) { menuClick(p.x, p.y); return; }
      if (p.y >= SLOT_Y - 2 && p.x < 4 + ITEMS.length * 18) { useItem(Math.floor((p.x - 4) / 18)); return; }
      if (p.x >= BTN.x - 4 && p.y >= BTN.y - 4) {
        digHoldPtr = true;
        digPtrId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
      } else hit();
    };
    const onUp = (e) => { if (e.pointerId === digPtrId) { digHoldPtr = false; digPtrId = null; } };
    const onCtx = (e) => { if (phase === 'play') e.preventDefault(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', onCtx);

    // книга: геометрия
    const MB = { x: 40, y: 22, w: 240, h: 136 };
    function menuClick(x, y) {
      // вкладки
      if (y >= MB.y + 4 && y <= MB.y + 14) {
        for (let i = 0; i < 3; i++) if (x >= MB.x + 8 + i * 78 && x < MB.x + 8 + i * 78 + 72) { page = i; sel = 0; sfx('click'); return; }
      }
      if (x < MB.x || x > MB.x + MB.w || y < MB.y || y > MB.y + MB.h) { menu = false; return; }
      if (page === 0) {
        const r = Math.floor((y - (MB.y + 24)) / 16);
        if (r >= 0 && r < shopRows()) { sel = r; buy(r); }
      } else if (page === 1) {
        const c = Math.floor((x - (MB.x + 10)) / 22), r = Math.floor((y - (MB.y + 26)) / 22);
        if (c >= 0 && c < 10 && r >= 0 && r < 3) sel = r * 10 + c;
      } else if (page === 2 && isFree() && y >= MB.y + 82 && y < MB.y + 100) {
        const i = Math.floor((x - (MB.x + 8)) / 22) + 1;
        if (i >= 1 && i <= 10) goReplay(i === 10 ? 0 : i);
      }
    }

    // ---------- стражники ----------
    const guardGo = (g, tx, spd, after) => { g.state = 'iwalk'; g.tx = tx; g.spd = spd; g.after = after; g.t = 0; };
    const sees = (g) => {
      if (g.state === 'drunk' || g.state === 'doze' || g.drunk > 0) return false;
      const dx = DIG_X + 5 - g.x;
      if (Math.abs(dx) < 10) return true;
      return dx * g.dir > 0 && Math.abs(dx) <= g.vis;
    };
    const updGuardPlay = (g, dt) => {
      g.t += dt;
      g.moving = false;
      const k = Math.min(1, time / SHIFT);
      if (g.drunk > 0) {
        g.drunk -= dt;
        g.state = 'drunk';
        if (g.drunk <= 0) { g.state = g.post ? 'stand' : 'walk'; g.t = 0; g.stir = 0.8; }
        return;
      }
      if (g.post) {
        // часовой: стоит, иногда оборачивается (с предупреждением «?»)
        if (g.state === 'suspect') {
          if (g.t > 0.65) {
            g.dir = -g.dir; g.state = 'stand'; g.t = 0;
            // к тайнику смотрит недолго, в другую сторону — подольше
            const toward = (DIG_X + 5 - g.x) * g.dir > 0;
            g.len = toward ? 0.9 + rand() * 1.2 + k * 0.6 : 3.5 + rand() * 3.5 - k;
          }
        }
        else if (g.state === 'stand') { if (g.t > g.len) { g.state = 'suspect'; g.t = 0; } }
        else { g.state = 'stand'; g.t = 0; g.len = 2 + rand() * 2; g.x = g.home; }
        return;
      }
      if (g.state === 'walk') {
        g.moving = true;
        g.x += g.dir * g.base * (1 + 0.5 * k) * (S.def.hazards.slip ? 0.9 : 1) * dt;
        if (g.x < g.min) { g.x = g.min; g.state = 'endpause'; g.t = 0; }
        else if (g.x > g.max) { g.x = g.max; g.state = 'endpause'; g.t = 0; }
        else if (g.t > 1.5 && rand() < g.sus * (1 + k) * dt) { g.state = 'suspect'; g.t = 0; }
        else if (S.def.hazards.sway && rand() < 0.05 * dt) { g.state = 'stumble'; g.t = 0; }
      } else if (g.state === 'endpause') { if (g.t > 0.7) { g.dir = -g.dir; g.state = 'walk'; g.t = 0; } }
      else if (g.state === 'suspect') { if (g.t > 0.65) { g.dir = -g.dir; g.state = 'look'; g.t = 0; g.look2 = 0.9 + rand() * 0.8; } }
      else if (g.state === 'look') { if (g.t > g.look2) { g.dir = -g.dir; g.state = 'walk'; g.t = 0; } }
      else if (g.state === 'stumble') { if (g.t > 0.8) { g.state = 'walk'; g.t = 0; } }
      else { g.state = 'walk'; g.t = 0; if (g.x < g.min || g.x > g.max) g.x = Math.max(g.min, Math.min(g.max, g.x)); }
    };
    const updGuardIdle = (g, dt, i) => {
      g.t += dt;
      g.moving = false;
      if (g.stir > 0) g.stir -= dt;
      if (g.drunk > 0) { g.drunk = 0; }
      if (g.state === 'iwalk') {
        const d = g.tx - g.x;
        if (Math.abs(d) <= g.spd * dt + 0.1) {
          g.x = g.tx;
          g.state = g.after || 'ipause'; g.t = 0; g.len = 0.8 + rand() * 1.6;
          if (g.state === 'doze') { g.len = 9 + rand() * 6; g.dir = -1; }
          if (g.state === 'collect') g.len = 1.8;
          if (g.state === 'yawn') g.len = 2.2;
        } else { g.dir = d > 0 ? 1 : -1; g.x += g.dir * g.spd * dt; g.moving = true; }
      } else if (g.state === 'ipause' || g.state === 'stand') {
        if (g.t > g.len) {
          const r = rand();
          if (g.post) {
            if (r < 0.3) { g.state = 'yawn'; g.t = 0; g.len = 2.2; }
            else if (r < 0.45) { g.state = 'doze'; g.t = 0; g.len = 8 + rand() * 6; }
            else { g.dir = -g.dir; g.state = 'ipause'; g.t = 0; g.len = 2 + rand() * 4; }
            if (Math.abs(g.x - g.home) > 1) guardGo(g, g.home, 14, 'ipause');
          } else if (i === 0 && !g.ledge && crateN >= 5 && r < 0.6) guardGo(g, CRATE_X + 18, 14, 'collect');
          else if (r < 0.2) { g.state = 'yawn'; g.t = 0; g.len = 2.2; }
          else if (r < 0.34) guardGo(g, Math.min(g.max, 286), 14, 'doze');
          else {
            const lo = Math.max(g.min, 180), hi = g.max;
            guardGo(g, rand() < 0.75 ? lo + rand() * (hi - lo) : g.min + rand() * Math.max(10, (hi - g.min) * 0.5), g.base * 0.6 + rand() * 4, 'ipause');
          }
        }
      } else if (g.state === 'yawn') { if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 0.6; } }
      else if (g.state === 'doze') { if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 1.2; g.stir = 0.6; } }
      else if (g.state === 'collect') { if (g.t > 0.9 && crateN > 0) crateN = 0; if (g.t > g.len) { g.state = 'ipause'; g.t = 0; g.len = 0.8; } }
      else if (g.state === 'salute') { /* стоят смирно в финале */ }
      else guardGo(g, g.post ? g.home : Math.max(g.min, Math.min(g.max, 236 + rand() * 50)), 14, 'ipause');
    };

    // ---------- звери ----------
    const updBeast = (b, dt, play) => {
      b.t += dt;
      if (b.st === 'chew') {
        b.chew -= dt;
        if (b.chew <= 0 || !play) { b.st = 'idle'; b.t = 0; b.len = 1; }
        return;
      }
      if (b.pond && b.sub) {
        // крокодил в пруду
        b.x += Math.sin(clock * 0.7) * 3 * dt;
        if (b.x < 70) b.x = 70; if (b.x > 100) b.x = 100;
        if (b.t > b.len) { b.sub = false; b.st = 'walk'; b.t = 0; b.tx = 110 + rand() * 40; b.dir = 1; }
        return;
      }
      if (b.st === 'walk') {
        const d = b.tx - b.x;
        if (Math.abs(d) <= b.spd * dt + 0.2) {
          b.x = b.tx;
          const r = rand();
          if (b.pond && b.home) { b.home = false; b.sub = true; b.st = 'idle'; b.t = 0; b.len = 6 + rand() * 8; }
          else if (b.pond && r < 0.35) { b.st = 'walk'; b.tx = 84; b.t = 0; b.home = true; }
          else if (!play && r < 0.15) { b.st = 'sleep'; b.t = 0; b.len = 6 + rand() * 8; }
          else { b.st = 'sniff'; b.t = 0; b.len = 0.8 + rand() * 1.6; }
        } else { b.dir = d > 0 ? 1 : -1; b.x += b.dir * b.spd * (play ? 1 : 0.6) * dt; }
      } else if (b.st === 'sniff' || b.st === 'idle' || b.st === 'sleep') {
        if (b.t > b.len) {
          b.st = 'walk'; b.t = 0;
          // в смене звери чаще подбираются к тайнику
          if (play && rand() < 0.25) b.tx = Math.max(b.min, Math.min(b.max, DIG_X + 5 + (rand() - 0.5) * 60));
          else b.tx = b.min + rand() * (b.max - b.min);
        }
      } else if (b.st === 'warn') {
        if (b.t > 3) { b.st = 'sniff'; b.t = 0; b.len = 1; }
      }
    };

    // ---------- летающие ----------
    const updSeer = (s, dt, play) => {
      s.t += dt;
      if (s.kind === 'parrot') {
        if (s.st === 'perch' || s.st === 'sleep') {
          s.x += (s.bx - s.x) * Math.min(1, dt * 4); s.y += (s.by - s.y) * Math.min(1, dt * 4);
          if (s.t > s.len) {
            const r = rand();
            if (s.st === 'sleep' || r < 0.45) { s.st = 'fly'; s.t = 0; s.tx = 40 + rand() * 250; s.ty = 60 + rand() * 50; }
            else { s.st = r < 0.75 ? 'sleep' : 'perch'; s.t = 0; s.len = 3 + rand() * (play ? 4 : 8); }
          }
        } else {
          const dx = s.tx - s.x, dy = s.ty - s.y;
          const d = Math.hypot(dx, dy);
          s.dir = dx > 0 ? 1 : -1;
          if (d < 2) {
            if (s.tx === s.bx && s.ty === s.by) { s.st = 'perch'; s.t = 0; s.len = 3 + rand() * 4; }
            else if (s.t > 2.5) { s.tx = s.bx; s.ty = s.by; s.t = 0; }
          } else { const v = 46 * dt / d; s.x += dx * Math.min(1, v); s.y += dy * Math.min(1, v); }
        }
        return;
      }
      if (s.kind === 'bat') {
        s.x += s.dir * 30 * dt; s.y = s.by + Math.sin(clock * 2 + s.bx) * 10;
        if (s.x > 310) s.dir = -1; if (s.x < 100) s.dir = 1;
        return;
      }
      // огонёк и призрак плывут к случайным точкам
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      const spd = s.kind === 'wisp' ? 20 : 13;
      if (d < 2 || s.t > 9) {
        s.t = 0;
        if (play && rand() < 0.35) { s.tx = DIG_X + 5 + (rand() - 0.5) * 120; s.ty = FLOOR - 20 - rand() * 40; }
        else { s.tx = 20 + rand() * 280; s.ty = (s.kind === 'ghost' ? 50 : 50) + rand() * 70; }
        s.tx = Math.max(10, Math.min(310, s.tx));
      } else { const v = spd * dt / d; s.x += dx * Math.min(1, v); s.y += dy * Math.min(1, v); s.dir = dx > 0 ? 1 : -1; }
    };

    const wardPhase = (w) => { const c = (wardClock + w.off) % w.per; return c; };
    const wardActive = (w) => wardPhase(w) > w.per - 0.9;

    // ---------- заключённый вне смены ----------
    const prMove = (dt) => {
      const d = pr.tx - pr.x;
      if (Math.abs(d) <= pr.spd * dt + 0.1) { pr.x = pr.tx; return true; }
      pr.face = d > 0 ? 1 : -1;
      pr.x += pr.face * pr.spd * dt;
      return false;
    };
    const newPiece = () => { pr.hits = 0; pr.need = 5 + Math.floor(rand() * 4); pr.icon = ORDERS[Math.floor(rand() * 3)].icon; };
    const updPrisonerIdle = (dt) => {
      pr.t += dt;
      const g0 = guards[0];
      if (pr.st === 'forge') {
        pr.pose = 'forge'; pr.face = 1;
        if (Math.abs(pr.x - SMITH_X) > 0.5) { pr.tx = SMITH_X; pr.spd = 40; pr.st = 'back'; return; }
        tGlance -= dt;
        if (tGlance <= 0) {
          tGlance = 10 + rand() * 12;
          if (!variant && !isFree() && g0 && g0.state === 'doze' && g0.t < g0.len - 5) { pr.st = 'sneak'; pr.tx = CROUCH_X; pr.spd = 22; pr.t = 0; }
          else { pr.st = 'glance'; pr.t = 0; }
          return;
        }
        pr.hitT -= dt;
        if (pr.hitT <= 0) {
          pr.hitT = 0.7 + rand() * 0.25;
          swing = 0.16;
          pr.hits++;
          spark(ANVIL_X + 2, FLOOR - 22, 4 + Math.floor(rand() * 4), rand() < 0.5 ? '#ffd060' : '#ff9a40', 60);
          sfx('click');
          if (pr.hits >= pr.need) { pr.st = 'tocrate'; pr.tx = CRATE_X - 6; pr.spd = 30; pr.hitT = 0.9; }
        }
      } else if (pr.st === 'glance') {
        pr.pose = 'stand'; pr.face = -1;
        if (pr.t > 1.6) { pr.st = 'forge'; pr.t = 0; }
      } else if (pr.st === 'sneak') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'peek'; pr.t = 0; }
      } else if (pr.st === 'peek') {
        pr.pose = 'crouch';
        tileOpen = Math.min(0.6, tileOpen + dt * 1.5);
        if (pr.t > 1.4) { if (g0) g0.stir = 0.9; pr.st = 'hurry'; pr.tx = SMITH_X; pr.spd = 75; pr.t = 0; }
      } else if (pr.st === 'hurry') {
        tileOpen = Math.max(0, tileOpen - dt * 4);
        pr.pose = tileOpen > 0 ? 'crouch' : 'walk';
        if (tileOpen <= 0 && prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.t = 0; }
      } else if (pr.st === 'tocrate') {
        pr.pose = 'carry';
        if (prMove(dt)) { pr.face = 1; crateN = Math.min(6, crateN + 1); pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 30; newPiece(); }
      } else if (pr.st === 'back') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.t = 0; }
      } else { pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 40; }
    };

    // Кокк на полу (после свободы и в финале)
    const updKokkFloor = (dt) => {
      if (!KK.on) return;
      KK.t += dt;
      const d = KK.tx - KK.x;
      if (Math.abs(d) > 0.6) { KK.face = d > 0 ? 1 : -1; KK.x += KK.face * 22 * dt; KK.walk = (Math.floor(clock * 6) & 1) ? 1 : -1; }
      else {
        KK.walk = 0;
        if (phase === 'idle' || phase === 'outro') {
          if (KK.t > 4 + rand() * 6) { KK.t = 0; KK.tx = 190 + rand() * 100; KK.wave = rand() < 0.3 ? 2.2 : 0; }
        }
      }
      if (KK.wave > 0) KK.wave -= dt;
    };

    // ---------- переходы ----------
    const resetRun = () => {
      time = 0; scoreV = 0; combo = 0; runCombo = 0; hitCd = 0; swing = 0; lastQT = 0; order = null; orderGap = 0;
      seenT = 0; digSnd = 0; heat = 0; faintT = 0; flaskT = 0; cloakT = 0; stunT = 0; quakeWarn = 0; quakeT = 30 + rand() * 25;
      runFav = 0; runDig = 0; sw = 0; menu = false; caughtLoss = 0;
      digHoldKey = false; digHoldPtr = false; digging = false;
      for (const b of beasts) { b.warn = 0; if (b.st === 'chew') b.st = 'idle'; }
      for (const g of guards) { g.drunk = 0; }
    };
    const startIntro = () => {
      // свежая копия прогресса (могла прийти с другого компьютера)
      const wasAuthor = authorMode;
      loadSave();
      checkDay();
      const want = homeP();
      if (want !== sceneP || wasAuthor !== authorMode) setScene(want);
      setPhase('intro');
      best = readBest();
      resetRun();
      lastSeg = Math.floor(D.dug / (curNeed() / SEGS));
      const g0 = guards[0];
      if (g0) { if (g0.state === 'doze') g0.stir = 0.5; if (!g0.post) guardGo(g0, Math.min(g0.max, Math.max(g0.x + 40, 250)), 45, 'ipause'); }
      pr.tx = SMITH_X; pr.spd = 70;
      bannerP = sceneP; bannerT = 2.4;
    };
    const beginPlay = () => {
      setPhase('play');
      resetRun();
      tileOpen = 0;
      pr.x = SMITH_X; pr.tx = SMITH_X;
      for (const g of guards) { g.state = g.post ? 'stand' : 'walk'; g.dir = g.post ? (g.x < DIG_X ? 1 : -1) * (rand() < 0.5 ? 1 : -1) : g.x < 160 ? 1 : -1; g.t = 0; g.len = 2; if (g.post) g.x = g.home; }
      newOrder();
      D.st.sh++;
    };
    const startOutro = () => {
      if (phase === 'escape' || phase === 'finale') finishCutscene();
      menu = false;
      setPhase('outro');
      bellT = 1.4;
      sfx('coin');
      digging = false; digHoldKey = false; digHoldPtr = false;
      const needCover = sw > 0 || tileOpen > 0 || Math.abs(pr.x - CROUCH_X) < 4;
      pr.st = needCover ? 'cover' : 'back';
      pr.tx = needCover ? CROUCH_X : SMITH_X;
      pr.spd = 80; pr.t = 0;
      for (let i = 0; i < guards.length; i++) { const g = guards[i]; g.drunk = 0; if (g.state === 'salute') g.state = 'ipause'; guardGo(g, g.post ? g.home : Math.max(g.min, Math.min(g.max, 240 + rand() * 40)), 30, 'ipause'); }
      persist();
    };
    const handleMode = (m) => {
      if (m === 'play') {
        if (phase === 'idle') { if (age >= 1.2) startIntro(); }
        else if (phase === 'outro') startIntro();
        else if (phase === 'wait' && (sawOver || pt > 5)) startIntro();
      } else if (m === 'idle') {
        if (phase === 'intro' || phase === 'play' || phase === 'end' || phase === 'wait' || phase === 'escape' || phase === 'finale') startOutro();
      } else if (m === 'over') {
        if (phase === 'wait') sawOver = true;
      }
    };

    // конец смены: поймали (win=false) или отработал/сбежал (win=true)
    const finish = (win, why) => {
      if (phase !== 'play' && phase !== 'escape' && phase !== 'finale') return;
      endWin = win;
      menu = false;
      setPhase('end');
      digging = false;
      if (win && why !== 'escape') { D.fav += 10; runFav += 10; task('clean', 1); }
      scoreV += Math.round(runDig * 2);
      lastScore = Math.floor(scoreV);
      if (lastScore > D.st.best) D.st.best = lastScore;
      if (!win) D.st.cg++;
      persist();
      sfx(win ? 'win' : 'lose');
      if (win) { bellT = 1.4; const g = guards[0]; if (g && why !== 'escape') guardGo(g, Math.min(g.max, CRATE_X + 16), 30, 'stand'); }
      else { sw = 1; pr.x = CROUCH_X; pr.tx = CROUCH_X; pr.pose = 'handsup'; const g = guards[0]; if (g) { g.state = 'grab'; g.t = 0; g.drunk = 0; } }
      if (why === 'escape') pt = 0.6;
    };

    const caught = (by) => {
      seenBy = by;
      // охрана засыпает часть хода
      const need = curNeed();
      const loss = Math.min(D.dug, Math.max(authorMode ? 2 : 15, need * 0.03));
      D.dug -= loss;
      caughtLoss = loss;
      if (loss >= need * 0.005) pop(DIG_X, FLOOR - 40, '-' + Math.max(1, Math.round((loss / need) * 100)) + '%', '#ff7070');
      msg(by === 1 ? 'ЗВЕРЬ ПОДНЯЛ ШУМ!' : by === 2 ? 'ДУХ ТЕБЯ ЗАМЕТИЛ!' : by === 3 ? 'РУНА ВСПЫХНУЛА!' : 'ПОЙМАН!', '#ff7070');
      sfx('hit');
      finish(false, 'caught');
    };

    // ---------- побег: подкоп готов ----------
    const startEscape = () => {
      menu = false;
      digging = false;
      crawlPal = S.pal;
      crawlFrom = sceneP;
      escWasFree = isFree();
      escArrived = false;
      setPhase('escape');
      sfx('win');
      // фиксируем прогресс сразу (если игрок уйдёт посреди сценки — ничего не теряется)
      const from = Math.min(10, D.cur);
      scoreV += 500;
      D.dug = 0;
      lastSeg = 0;
      if (escWasFree) {
        D.st.free++; D.fav += 100; runFav += 100;
        const rp = D.rp || 10;
        escToP = rp >= 10 ? 10 : rp + 1;
        D.rp = rp >= 10 ? 0 : escToP;
      } else {
        // недостающие артефакты этой тюрьмы находятся в ползке
        for (let i = 0; i < ARTEFACTS.length; i++) if (ARTEFACTS[i].p === from && !hasArt(D.alb, i)) { D.alb = addArt(D.alb, i); }
        D.st.esc++;
        D.fav += 40; runFav += 40;
        D.cur = from + 1;
        escToP = Math.min(10, D.cur);
        if (from < 10 && REWARD_AT[from]) for (const id of REWARD_AT[from]) grant(id);
        if (from === 10) pendingFinal = true;
      }
      task('clean', 1);
      persist();
    };
    // досрочный выход из сценки — довести мир до итогового состояния
    function finishCutscene() {
      if (phase === 'escape' && !escArrived) { escArrived = true; setScene(escToP); }
      if (pendingFinal) giveFinal();
      if (sceneP === 10 && isFree()) { S.kokkOnBalcony = false; KK.on = true; }
      pr.pose = 'forge'; pr.st = 'back'; pr.x = SMITH_X; pr.tx = SMITH_X;
      sw = 0; tileOpen = 0;
    }
    function giveFinal() {
      if (!pendingFinal) return;
      pendingFinal = false;
      finaleGiven = true;
      for (const id of REWARD_AT[10]) grant(id);
    }
    const updEscape = (dt) => {
      if (pt < ESC_DROP) {
        sw = 1; tileOpen = 1;
        pr.x = CROUCH_X; pr.pose = pt < 0.45 ? 'crouch' : 'gone';
        if (pt > 0.4 && !fl1) { fl1 = true; spark(DIG_X + 5, FLOOR - 2, 10, '#8a6440', 60, 1.2); sfx('step'); }
      } else if (pt < ESC_CRAWL) {
        pr.pose = 'gone';
        if (Math.floor(pt * 3) !== Math.floor((pt - dt) * 3)) sfx('step');
      } else {
        if (!escArrived) {
          escArrived = true;
          setScene(escToP);
          bannerP = escToP; bannerT = 2.4;
          sw = 0; tileOpen = 0;
          // выбирается из лаза у новой наковальни
          pr.x = SMITH_X; pr.tx = SMITH_X; pr.pose = 'front'; pr.face = 1;
          for (const g of guards) { g.state = 'ipause'; g.t = 0; g.len = 3; }
          if (escToP === 10 && pendingFinal) { setPhase('finale'); startFinale(); return; }
        }
        pr.pose = pt > ESC_CRAWL + 0.8 && pt < ESC_CRAWL + 1.4 ? 'front' : 'front';
        pr.wink = pt > ESC_CRAWL + 1 && pt < ESC_CRAWL + 1.4 ? 1 : 0;
        for (let i = 0; i < guards.length; i++) updGuardIdle(guards[i], dt, i);
        if (pt >= ESC_END) continueAfterEscape();
      }
    };
    function continueAfterEscape() {
      setPhase('play');
      time = 0; // в новой тюрьме — новая смена
      seenT = 0; heat = 0; faintT = 0; stunT = 0; quakeWarn = 0; quakeT = 30 + rand() * 25; caughtLoss = 0;
      sw = 0; tileOpen = 0; menu = false; digging = false; digHoldKey = false; digHoldPtr = false;
      pr.x = SMITH_X; pr.tx = SMITH_X; pr.pose = 'forge'; pr.wink = 0;
      for (const g of guards) { g.state = g.post ? 'stand' : 'walk'; g.dir = g.x < 160 ? 1 : -1; g.t = 0; g.len = 2; if (g.post) g.x = g.home; }
      for (const b of beasts) { b.warn = 0; if (b.st === 'chew') b.st = 'idle'; }
      lastSeg = 0;
      newOrder();
      msg('ПРОДОЛЖАЙ!', '#7dffaa');
      persist();
    }

    // ---------- финал: Кокк вручает плащ ----------
    let finLine = -1;
    function startFinale() {
      S.kokkOnBalcony = false;
      KK.on = true; KK.x = 312; KK.tx = 196; KK.reach = 0; KK.wave = 0; KK.t = 0;
      pr.x = SMITH_X; pr.tx = SMITH_X; pr.pose = 'front'; pr.face = 1;
      for (const g of guards) { g.state = 'salute'; g.t = 0; g.moving = false; g.dir = g.x < 160 ? 1 : -1; }
      finLine = -1;
      bannerT = 0;
      msg('ПОСЛЕДНИЙ ЗАЛ', '#ffd34a');
    }
    const updFinale = (dt) => {
      updKokkFloor(dt);
      pr.pose = pt > FINALE_AT[3] ? 'cheer' : 'front';
      pr.face = 1;
      let li = -1;
      for (let i = 0; i < FINALE_AT.length; i++) if (pt >= FINALE_AT[i]) li = i;
      if (li !== finLine) { finLine = li; if (li >= 0) sfx('click'); }
      KK.reach = pt > FINALE_AT[2] && pt < FINALE_AT[3] + 0.4 ? -1 : 0;
      KK.wave = pt > FINALE_AT[0] && pt < FINALE_AT[0] + 1.4 ? 1 : 0;
      if (pt > FINALE_AT[3] && !finaleGiven) { giveFinal(); sfx('win'); spark(SMITH_X, FLOOR - 30, 16, '#ffd34a', 80); }
      if (pt >= FIN_END) continueAfterEscape();
    };

    // ---------- автор: пропуск уровней ----------
    function authorSkip(dir) {
      if (!authorMode || phase !== 'play') return;
      if (dir > 0) { D.dug = curNeed(); msg('(АВТОР) ПОДКОП ГОТОВ', '#c8a0ff'); }
      else {
        if (D.cur <= 1) return;
        D.cur = Math.min(10, D.cur - 1);
        if (D.cur === 10 && sceneP === 10) D.cur = 9;
        D.dug = 0;
        setScene(Math.min(10, D.cur));
        bannerP = sceneP; bannerT = 2.4;
        resetRun(); newOrder();
        for (const g of guards) { g.state = g.post ? 'stand' : 'walk'; g.t = 0; }
        msg('(АВТОР) ТЮРЬМА ' + D.cur, '#c8a0ff');
        persist();
      }
    }

    // ---------- обновление по фазам ----------
    const updIntro = (dt) => {
      for (let i = 0; i < guards.length; i++) updGuardIdle(guards[i], dt, i);
      tileOpen = Math.max(0, tileOpen - dt * 3);
      const there = prMove(dt);
      if (!there) pr.pose = 'walk';
      else if (pt > 0.45 && pt < 1.25) {
        pr.pose = 'front';
        if (pt > 0.7 && pt < 1.05) { if (!fl1) { fl1 = true; sfx('click'); spark(SMITH_X + 6, FLOOR - 28, 3, '#fff2a8', 30, 0.2); } pr.wink = 1; } else pr.wink = 0;
      } else { pr.pose = 'forge'; pr.face = 1; pr.wink = 0; }
      if (pt >= INTRO_T) beginPlay();
    };

    const updPlay = (dt) => {
      if (menu) return; // книга открыта — смена стоит
      time += dt;
      wardClock += dt;
      saveT += dt;
      dayT += dt;
      if (dayT > 30) { dayT = 0; checkDay(); }
      if (D.dug >= curNeed()) { startEscape(); return; }
      if (time >= SHIFT) { finish(true, 'shift'); return; }
      if (hitCd > 0) hitCd -= dt;
      if (lastQT > 0) lastQT -= dt;
      if (cloakT > 0) cloakT -= dt;
      if (flaskT > 0) flaskT -= dt;
      if (stunT > 0) stunT -= dt;
      const hz = S.def.hazards;
      // ковка
      if (orderGap > 0) { orderGap -= dt; if (orderGap <= 0) newOrder(); }
      else if (order) {
        const sp = order.o.speed * (1 + time / 200) * (1 + 0.04 * (sceneP - 1));
        marker += mdir * sp * dt;
        if (marker > 1) { marker = 2 - marker; mdir = -1; }
        if (marker < 0) { marker = -marker; mdir = 1; }
        order.pat -= dt;
        if (order.pat <= 0) { pop(40, 74, 'x', '#ff7070'); sfx('lose'); combo = 0; orderGap = 0.8; }
      }
      // перемещение между наковальней и лазом
      const want = (digHoldKey || digHoldPtr) && faintT <= 0;
      const swT = hz.slip ? 0.34 : 0.12;
      sw = want ? Math.min(1, sw + dt / swT) : Math.max(0, sw - dt / swT);
      tileOpen = sw > 0 ? 1 : 0;
      digging = want && sw >= 1 && stunT <= 0;
      if (faintT > 0) { faintT -= dt; digging = false; }
      if (D.dug > 0) pileA = 1;
      // жара
      if (hz.heat) {
        if (digging && flaskT <= 0) heat += dt / 24; else heat = Math.max(0, heat - dt / 14);
        if (heat >= 1) { heat = 0.6; faintT = 3; digHoldKey = false; digHoldPtr = false; msg('ЖАРА! ОТДЫШИСЬ', '#ffb060'); sfx('hit'); }
      }
      // обвалы
      if (hz.quake) {
        quakeT -= dt;
        if (quakeT <= 0 && quakeWarn <= 0) { quakeWarn = 1.6; S.shake = 2.2; sfx('hit'); }
        if (quakeWarn > 0) {
          quakeWarn -= dt;
          if (quakeWarn <= 0) {
            quakeT = 35 + rand() * 30;
            if (sw > 0.5) {
              if (D.it[4] > 0) { D.it[4]--; msg('ПОДПОРКА ВЫДЕРЖАЛА', '#e0c080'); task('item', 1); }
              else { const l = Math.min(D.dug, curNeed() * 0.015); D.dug -= l; stunT = 1.5; msg('ОБВАЛ! ХОД ЗАСЫПАЛО', '#ff9a80'); spark(DIG_X + 20, TUN_Y, 12, '#8a6440', 40, 1.2); }
            }
          }
        }
      }
      // копание
      if (digging) {
        const v = dt * toolMul();
        D.dug += v;
        runDig += dt;
        D.st.dig += dt;
        task('dig', dt);
        digSnd -= dt;
        if (digSnd <= 0) { sfx('step'); digSnd = 0.35; spark(DIG_X + 4, FLOOR - 2, 2, '#8a6440', 40, 1.2); }
        const need = curNeed();
        const seg = Math.floor(D.dug / (need / SEGS));
        if (seg > lastSeg) {
          lastSeg = seg;
          scoreV += 60;
          pop(DIG_X - 10, FLOOR - 36, '+60', '#ffd34a');
          sfx('coin');
          task('seg', 1);
          // находка в земле
          if (!isFree() && rand() < 0.16) {
            for (let i = 0; i < ARTEFACTS.length; i++) {
              if (ARTEFACTS[i].p === sceneP && !hasArt(D.alb, i)) { D.alb = addArt(D.alb, i); msg('НАХОДКА: ' + ARTEFACTS[i].name.toUpperCase(), '#ffd34a'); sfx('win'); break; }
            }
          }
          persist();
        }
        if (D.dug >= need) { startEscape(); return; }
      }
      if (saveT > 30) persist();
      // охрана
      for (let i = 0; i < guards.length; i++) updGuardPlay(guards[i], dt);
      for (let i = 0; i < beasts.length; i++) updBeast(beasts[i], dt, true);
      for (let i = 0; i < seers.length; i++) updSeer(seers[i], dt, true);
      // кто видит
      const exposed = sw > 0.02;
      let see = -1;
      if (exposed) {
        for (let i = 0; i < guards.length; i++) if (sees(guards[i])) { see = 0; break; }
        if (see < 0) for (let i = 0; i < seers.length; i++) {
          const s = seers[i];
          if (s.rad <= 0 || s.st === 'sleep') continue;
          if ((s.kind === 'wisp' || s.kind === 'ghost') && cloakT > 0) continue;
          if (Math.hypot(s.x - (DIG_X + 5), s.y - (FLOOR - 10)) < s.rad) { see = 2; break; }
        }
        if (see < 0 && cloakT <= 0 && digging) for (let i = 0; i < wards.length; i++) if (wardActive(wards[i])) { see = 3; break; }
      }
      if (see >= 0) { seenT += dt; if (seenT > (see === 3 ? 0.12 : see === 2 ? 0.3 : 0.22)) { caught(see); return; } }
      else seenT = Math.max(0, seenT - dt * 2);
      // звери чуют копание
      for (let i = 0; i < beasts.length; i++) {
        const b = beasts[i];
        if (b.st === 'chew' || b.sub || b.st === 'sleep') { b.warn = 0; continue; }
        if (digging && Math.abs(b.x - (DIG_X + 5)) < b.rad) {
          if (b.st !== 'warn') { b.st = 'warn'; b.t = 0; b.dir = b.x < DIG_X ? 1 : -1; sfx('hit'); }
          b.warn += dt;
          if (b.warn > 0.85) { caught(1); return; }
        } else if (b.warn > 0) { b.warn = Math.max(0, b.warn - dt); if (b.warn <= 0 && b.st === 'warn') { b.st = 'sniff'; b.t = 0; b.len = 0.6; } }
      }
    };

    const updEndWait = (dt) => {
      for (let i = 1; i < guards.length; i++) updGuardIdle(guards[i], dt, i);
      const g = guards[0];
      if (endWin) {
        if (g) { if (g.state === 'iwalk' || g.state === 'ipause' || g.state === 'yawn' || g.state === 'doze' || g.state === 'salute') updGuardIdle(g, dt, 0); else { g.state = 'stand'; g.dir = -1; g.t += dt; } }
        pr.pose = finaleGiven && sceneP === 10 && KK.on ? 'cheer' : 'front'; pr.wink = 0;
        sw = Math.max(0, sw - dt * 6); tileOpen = 0;
        if (Math.abs(pr.x - SMITH_X) > 0.5) { pr.tx = SMITH_X; pr.spd = 50; if (!prMove(dt)) pr.pose = 'walk'; }
        updKokkFloor(dt);
      } else if (g) {
        g.t += dt;
        g.moving = false;
        const tx = pr.x + 18;
        const d = tx - g.x;
        if (Math.abs(d) > 1) { g.dir = d > 0 ? 1 : -1; g.x += g.dir * Math.min(Math.abs(d), 70 * dt); g.moving = true; }
        else g.dir = -1;
        g.state = 'grab';
        pr.pose = 'handsup'; pr.face = 1;
      }
      if (phase === 'end' && pt > 1.2) {
        setPhase('wait');
        sawOver = false;
        try { api.over(lastScore); } catch (e) { /* хост */ }
      }
    };

    const updOutro = (dt) => {
      for (let i = 0; i < guards.length; i++) updGuardIdle(guards[i], dt, i);
      updKokkFloor(dt);
      pr.t += dt;
      sw = Math.max(0, sw - dt * 4);
      if (pr.st === 'cover') {
        if (prMove(dt)) {
          pr.pose = 'crouch';
          tileOpen = Math.max(0, tileOpen - dt * 2);
          if (!fl1) { fl1 = true; pr.t = 0; }
          if (pr.t > 0.7 && tileOpen <= 0) { pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 70; sfx('step'); }
        } else pr.pose = 'walk';
      } else if (pr.st === 'back') {
        pr.pose = 'walk';
        if (prMove(dt)) { pr.st = 'forge'; pr.face = 1; pr.hitT = 0.4; pr.t = 0; }
      } else pr.pose = 'forge';
      if ((pt >= OUTRO_T && pr.st === 'forge') || pt >= OUTRO_MAX) {
        setPhase('idle');
        if (pr.st !== 'forge') { pr.st = 'back'; pr.tx = SMITH_X; pr.spd = 60; }
        tileOpen = 0;
        tGlance = 8 + rand() * 8;
      }
    };

    const update = (dt) => {
      clock += dt; age += dt; pt += dt;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * p.g * dt;
      }
      for (let i = 0; i < pops.length; i++) {
        const p = pops[i];
        if (!p.on) continue;
        p.life -= dt * 0.9; p.y -= dt * 14;
        if (p.life <= 0) p.on = false;
      }
      for (let i = 0; i < msgs.length; i++) if (msgs[i].on) { msgs[i].t -= dt; if (msgs[i].t <= 0) msgs[i].on = false; }
      if (bannerT > 0 && !menu) bannerT -= dt;
      if (swing > 0) swing -= dt;
      if (bellT > 0) bellT -= dt;
      const idleLike = phase === 'idle' || phase === 'outro' || phase === 'intro';
      updateScene(S, dt, clock, rand, idleLike);
      if (phase !== 'play') wardClock += dt * 0.5;
      if (phase === 'idle') {
        for (let i = 0; i < guards.length; i++) updGuardIdle(guards[i], dt, i);
        updPrisonerIdle(dt);
        updKokkFloor(dt);
        // в покое звери просто бродят, а в 7-й с потолка иногда сыплется пыль
        if (S.def.hazards.quake && rand() < dt * 0.04) { S.shake = 0.8; spark(120 + rand() * 180, 22, 5, '#8a7a6a', 10, 0.8); }
      } else if (phase === 'intro') updIntro(dt);
      else if (phase === 'play') updPlay(dt);
      else if (phase === 'end' || phase === 'wait') updEndWait(dt);
      else if (phase === 'escape') updEscape(dt);
      else if (phase === 'finale') updFinale(dt);
      else updOutro(dt);
      if (phase !== 'play') {
        for (let i = 0; i < beasts.length; i++) updBeast(beasts[i], dt, false);
        for (let i = 0; i < seers.length; i++) updSeer(seers[i], dt, false);
      } else if (menu) { /* стоп */ }
      const inGame = phase === 'play' || phase === 'end' || phase === 'wait';
      const hudT = inGame || (phase === 'intro' && pt > 0.9) ? 1 : 0;
      hudA += (hudT - hudA) * Math.min(1, dt * 4);
      const coneT = phase === 'play' || (phase === 'intro' && pt > 1.2) ? 1 : 0;
      coneA += (coneT - coneA) * Math.min(1, dt * 4);
      const dimT = phase === 'end' ? Math.min(1, pt) : phase === 'wait' ? 0.6 : 0;
      dimA += (dimT - dimA) * Math.min(1, dt * 3);
    };

    // ---------- рисование ----------
    const drawRoom = () => {
      if (bg && !bgReady) {
        const bctx = bg.getContext('2d');
        if (bctx) { drawStatic(bctx, S); bgReady = true; } else bg = null;
      }
      if (bgReady) ctx.drawImage(bg, 0, 0);
      else drawStatic(ctx, S);
      drawBack(ctx, S, clock, dark, bellT, crateN);
    };

    const tunnelFrac = () => (variant ? 0 : phase === 'escape' && !escArrived ? 1 : Math.max(0, Math.min(1, D.dug / curNeed())));
    const drawTunnel = () => {
      const f = tunnelFrac();
      const P = S.pal;
      if (f > 0) {
        const len = f * TUN_LEN;
        const top = FLOOR + 4;
        const sh = Math.min(len, SHAFT_LEN);
        ctx.fillStyle = P.tun;
        ctx.fillRect(DIG_X, top, 10, Math.max(1, Math.round(sh)));
        if (len > SHAFT_LEN) {
          const w = Math.round(len - SHAFT_LEN);
          ctx.fillRect(DIG_X + 10, TUN_Y, w, TUN_H);
          ctx.fillStyle = P.beam;
          for (let xx = DIG_X + 34; xx < DIG_X + 10 + w; xx += 24) { ctx.fillRect(xx, TUN_Y - 1, 2, TUN_H + 2); ctx.fillRect(xx - 2, TUN_Y - 1, 6, 2); }
          // свеча в конце хода
          if (phase === 'play' || phase === 'idle') { ctx.fillStyle = (Math.floor(clock * 5) & 1) ? '#ffd060' : '#ffb040'; ctx.fillRect(DIG_X + 8 + w, TUN_Y + TUN_H - 4, 1, 2); }
        }
      }
      // обвал: камни сыплются в ход
      if (quakeWarn > 0 && phase === 'play') {
        ctx.fillStyle = '#8a7a6a';
        for (let i = 0; i < 6; i++) ctx.fillRect(DIG_X + 20 + i * 14 + Math.round(Math.sin(clock * 20 + i) * 2), TUN_Y + ((clock * 30 + i * 5) % TUN_H), 2, 2);
      }
      // плитка-тайник
      ctx.fillStyle = P.floor2;
      if (tileOpen > 0.02) {
        ctx.fillStyle = P.tun; ctx.fillRect(DIG_X - 1, FLOOR, 12, 2);
        ctx.fillStyle = P.floor2; ctx.fillRect(DIG_X - 1 - Math.round(13 * tileOpen), FLOOR - 2 * (tileOpen > 0.5 ? 1 : 0), 12, tileOpen > 0.5 ? 3 : 2);
      } else ctx.fillRect(DIG_X - 1, FLOOR, 12, 2);
      if (pileA > 0.01 && (phase === 'play' || phase === 'end' || phase === 'wait')) {
        ctx.fillStyle = '#b8a070'; ctx.fillRect(DIG_X + 14, FLOOR - 6, 10, 6);
        ctx.fillStyle = '#9a8458'; ctx.fillRect(DIG_X + 15, FLOOR - 7, 8, 1); ctx.fillRect(DIG_X + 18, FLOOR - 8, 2, 1);
      }
    };

    const drawCones = () => {
      if (coneA < 0.02) return;
      ctx.globalAlpha = coneA;
      const alarm = seenT > 0 && sw > 0;
      for (let gi = 0; gi < guards.length; gi++) {
        const g = guards[gi];
        if (g.state === 'drunk' || g.state === 'doze' || g.state === 'salute' || g.drunk > 0) continue;
        const big = g.look === 'golem';
        const ex = Math.round(g.x) + g.dir * (big ? 6 : 4);
        const ey = g.y - (big ? 40 : 22);
        const fill = alarm && seenBy === 0 ? CONE_A : CONE_N;
        const edge = alarm && seenBy === 0 ? CONE_EA : CONE_E;
        for (let d = 0; d < g.vis; d += 3) {
          const x = g.dir > 0 ? ex + d : ex - d - 3;
          let hh, yt;
          if (g.ledge) { // взгляд сверху — конус уходит вниз к полу
            const k = d / g.vis;
            yt = ey + Math.round(k * (FLOOR - ey - 30)); hh = 6 + Math.round(k * 32);
          } else { hh = 3 + Math.round(d * 0.32); yt = ey - (hh >> 2); }
          ctx.fillStyle = fill; ctx.fillRect(x, yt, 3, hh);
          if ((d % 6) === 0) { ctx.fillStyle = edge; ctx.fillRect(x, yt, 3, 1); ctx.fillRect(x, yt + hh - 1, 3, 1); }
        }
      }
      // кольца духов
      for (let i = 0; i < seers.length; i++) {
        const s = seers[i];
        if (s.rad <= 0) continue;
        const magic = s.kind !== 'parrot';
        const off = s.st === 'sleep' || (magic && cloakT > 0);
        ctx.fillStyle = off ? 'rgba(160,160,200,0.18)' : seenBy === 2 && alarm ? 'rgba(255,90,80,0.6)' : magic ? 'rgba(170,220,255,0.4)' : 'rgba(255,220,120,0.4)';
        for (let a = 0; a < 20; a++) {
          const an = a * 0.314 + clock * 0.4;
          ctx.fillRect(Math.round(s.x + Math.cos(an) * s.rad), Math.round(s.y + Math.sin(an) * s.rad * 0.8), 2, 1);
        }
      }
      // нюх зверей
      for (let i = 0; i < beasts.length; i++) {
        const b = beasts[i];
        if (b.sub || b.st === 'chew' || b.st === 'sleep') continue;
        ctx.fillStyle = b.st === 'warn' ? 'rgba(255,90,80,0.55)' : 'rgba(255,200,140,0.28)';
        for (let x = -b.rad; x <= b.rad; x += 4) ctx.fillRect(Math.round(b.x + x), FLOOR + 1, 2, 1);
      }
      ctx.globalAlpha = 1;
    };

    const drawWards = () => {
      for (let i = 0; i < wards.length; i++) {
        const w = wards[i];
        const c = wardPhase(w);
        const charge = Math.max(0, (c - (w.per - 2.6)) / 1.7);
        const act = c > w.per - 0.9;
        const k = act ? 1 : Math.min(1, 0.15 + charge * 0.6);
        const x = Math.round(w.x);
        ctx.fillStyle = pickA(WARDG, cloakT > 0 && phase === 'play' ? k * 0.3 : k);
        ctx.fillRect(x - 12, FLOOR - 2, 25, 3);
        if (act) ctx.fillRect(x - 6, 20, 13, FLOOR - 22);
        ctx.fillStyle = act ? '#f0d0ff' : '#8a6ac0';
        ctx.fillRect(x - 9, FLOOR, 3, 1); ctx.fillRect(x - 1, FLOOR - 1, 3, 1); ctx.fillRect(x + 7, FLOOR, 3, 1);
        if (act && phase === 'play' && cloakT <= 0) { ctx.fillStyle = 'rgba(220,170,255,0.18)'; ctx.fillRect(0, FLOOR - 4, W, 8); }
      }
    };

    const drawAnvil = () => {
      const x = ANVIL_X;
      const y = FLOOR;
      ctx.fillStyle = '#4a3020'; ctx.fillRect(x - 8, y - 10, 18, 10);
      ctx.fillStyle = '#5c3c26'; ctx.fillRect(x - 8, y - 10, 18, 2);
      ctx.fillStyle = '#2e3038'; ctx.fillRect(x - 4, y - 16, 10, 6);
      ctx.fillStyle = '#3e4250'; ctx.fillRect(x - 9, y - 22, 22, 6); ctx.fillRect(x - 14, y - 21, 5, 3);
      ctx.fillStyle = '#5a6070'; ctx.fillRect(x - 9, y - 22, 22, 1);
      let ic = null, heatC = 0;
      if (phase === 'play' || phase === 'end' || phase === 'wait') {
        if (order && orderGap <= 0) { ic = order.o.icon; heatC = 1 - order.hits.length / 3; }
      } else if (pr.st !== 'tocrate') { ic = pr.icon; heatC = 1 - pr.hits / pr.need; }
      if (ic) {
        ctx.fillStyle = heatC > 0.5 ? '#ffb040' : heatC > 0.1 ? '#e07030' : '#b0b8c4';
        if (ic === 'sword') ctx.fillRect(x - 6, y - 24, 16, 2);
        else if (ic === 'pickaxe') { ctx.fillRect(x - 4, y - 24, 12, 2); ctx.fillRect(x - 5, y - 25, 2, 1); ctx.fillRect(x + 7, y - 25, 2, 1); }
        else { ctx.fillRect(x - 2, y - 24, 8, 2); ctx.fillRect(x - 3, y - 25, 2, 1); ctx.fillRect(x + 5, y - 25, 2, 1); }
      }
    };

    const drawPr = () => {
      const play = phase === 'play';
      let pose = pr.pose;
      let x = pr.x;
      if (play) {
        x = SMITH_X + (CROUCH_X - SMITH_X) * sw;
        pose = faintT > 0 ? 'faint' : sw >= 1 ? 'crouch' : sw > 0 ? (S.def.hazards.slip ? 'slide' : 'walk') : 'forge';
        if (pose === 'faint') x = CROUCH_X + 8;
      } else if ((phase === 'end' || phase === 'wait') && !endWin) { pose = 'handsup'; }
      prq.x = x; prq.pose = pose; prq.face = play ? (sw > 0 ? -1 : 1) : pr.face; prq.wink = pr.wink;
      prq.dig = play ? digging : pr.st === 'peek' || pr.st === 'cover';
      prq.shovel = play || pr.st === 'cover' || phase === 'escape';
      prq.swing = swing;
      prq.sheep = pose === 'handsup' && phase === 'wait' && ((clock * 0.5) % 2) < 0.8;
      prq.cape = !variant && isFree() && !(phase === 'finale' && pt <= FINALE_AT[3]) && !(phase === 'escape' && crawlFrom === 10 && !escWasFree);
      drawPrisoner(ctx, prq, clock);
      if (play && seenT > 0) drawIcon(ctx, 'eye', x - 7, FLOOR - 34, 2);
      // жара
      if (play && S.def.hazards.heat && heat > 0.05) {
        ctx.fillStyle = '#2a1a0c'; ctx.fillRect(x - 10, FLOOR - 44, 22, 3);
        ctx.fillStyle = heat > 0.75 ? ((Math.floor(clock * 8) & 1) ? '#ff5030' : '#ffb060') : '#ff9a40';
        ctx.fillRect(x - 10, FLOOR - 44, Math.round(22 * Math.min(1, heat)), 3);
        drawIco(ctx, 'sun', x - 19, FLOOR - 46, 1);
      }
      if (play && cloakT > 0) { ctx.fillStyle = 'rgba(160,110,230,0.25)'; ctx.fillRect(x - 9, FLOOR - 32, 19, 32); }
    };

    const drawActors = () => {
      drawWards();
      for (let i = 0; i < seers.length; i++) if (seers[i].kind === 'bat') drawSeer(ctx, seers[i], clock, false);
      for (let i = 0; i < beasts.length; i++) drawBeast(ctx, beasts[i], clock);
      for (let i = 0; i < guards.length; i++) {
        const g = guards[i];
        drawGuard(ctx, g, clock, g.state === 'grab' && phase === 'wait' && (((clock * 3) | 0) & 1));
        const hx = Math.round(g.x) - 1, hy = g.y - (g.look === 'golem' ? 62 : 52);
        if (phase === 'play' && g.state === 'suspect') drawText(ctx, '?', hx, hy, '#ffe08a', 2);
        else if (g.stir > 0) drawText(ctx, '?', hx, hy, '#ffe08a', 2);
        else if (g.state === 'grab' && phase === 'end' && (Math.floor(clock * 8) & 1)) drawText(ctx, '!', hx + 1, hy, '#ff5050', 2);
      }
      for (let i = 0; i < beasts.length; i++) { const b = beasts[i]; if (b.st === 'warn' && phase === 'play' && (Math.floor(clock * 8) & 1)) drawText(ctx, '!', Math.round(b.x), FLOOR - 22, '#ff5050', 2); }
      drawAnvil();
      if (KK.on && kokk) drawKokk(ctx, kokk, KK.x, FLOOR, KK.walk, KK.reach, KK.wave > 0, clock);
      drawPr();
      for (let i = 0; i < seers.length; i++) if (seers[i].kind !== 'bat') drawSeer(ctx, seers[i], clock, cloakT > 0 && phase === 'play');
    };

    const drawBar = () => {
      const bx = 100, by = 64, bw = 120, bh = 8;
      ctx.fillStyle = '#1a1418'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(bx, by, bw, bh);
      if (!order || orderGap > 0 || phase !== 'play') {
        ctx.fillStyle = '#3a3036'; ctx.fillRect(bx, by, bw, bh);
        drawIcon(ctx, 'hammer', bx - 14, by, 1);
        return;
      }
      const half = zoneW() / 2;
      const y0 = Math.max(0, zoneC - half - 0.11), y1 = Math.min(1, zoneC + half + 0.11);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(bx + Math.round(y0 * bw), by, Math.round((y1 - y0) * bw), bh);
      ctx.fillStyle = '#3ec060'; ctx.fillRect(bx + Math.round((zoneC - half) * bw), by, Math.round(half * 2 * bw), bh);
      ctx.fillStyle = '#7dffaa'; ctx.fillRect(bx + Math.round((zoneC - half) * bw), by, Math.round(half * 2 * bw), 1);
      const mx = bx + Math.round(marker * bw);
      ctx.fillStyle = sw > 0 ? '#8a8a8a' : '#ffffff'; ctx.fillRect(mx - 1, by - 3, 2, bh + 6);
      ctx.fillRect(mx - 2, by - 4, 4, 1); ctx.fillRect(mx - 2, by + bh + 3, 4, 1);
      if (lastQT > 0) {
        ctx.fillStyle = lastQ === 2 ? 'rgba(125,255,170,0.5)' : lastQ === 1 ? 'rgba(255,224,138,0.45)' : 'rgba(255,90,90,0.45)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, 1); ctx.fillRect(bx - 2, by + bh + 1, bw + 4, 1);
      }
      drawIcon(ctx, 'hammer', bx - 14, by, 1);
      for (let i = 0; i < 3; i++) {
        const q = order.hits[i];
        ctx.fillStyle = q == null ? '#3a3036' : q === 2 ? '#3ec060' : q === 1 ? '#c8a040' : '#a03030';
        ctx.fillRect(bx + bw / 2 - 13 + i * 9, by + bh + 5, 7, 3);
      }
    };

    const drawHUD = () => {
      if (hudA < 0.02) return;
      const slide = Math.round((1 - hudA) * 30);
      ctx.globalAlpha = hudA;
      ctx.save();
      ctx.translate(0, -slide);
      // книга, милость, тюрьма
      ctx.fillStyle = menu ? '#5a3a2a' : SHADE; ctx.fillRect(BOOK.x, BOOK.y, BOOK.w, BOOK.h);
      drawIco(ctx, 'book', BOOK.x + 1, BOOK.y + 1, 2);
      ctx.fillStyle = SHADE; ctx.fillRect(22, 3, 46 + Math.max(0, intWidth(D.fav, 1) - 12), 16);
      drawIco(ctx, 'fav', 24, 4, 2);
      drawInt(ctx, D.fav, 41, 6, '#ffd34a', 2);
      const lab = isFree() ? 'СВОБОДА' : 'ТЮРЬМА ' + sceneP;
      drawLabel(ctx, lab, 4, 22, '#c8b8a0', 1);
      if (authorMode) { ctx.fillStyle = '#7a2ad0'; ctx.fillRect(labelWidth(lab, 1) + 7, 21, 7, 7); drawLabel(ctx, 'A', labelWidth(lab, 1) + 9, 22, '#ffffff', 1); }
      // часы
      const tl = phase === 'play' ? Math.ceil(timeLeft()) : phase === 'intro' ? SHIFT : Math.ceil(timeLeft());
      const mins = Math.floor(tl / 60), secs = tl % 60;
      const tw = intWidth(mins, 2) + 2 + textWidth(':', 2) + 2 + intWidth(secs, 2, 2) + 18;
      const tx = Math.round(W / 2 - tw / 2);
      ctx.fillStyle = SHADE; ctx.fillRect(tx - 3, 3, tw + 6, 16);
      drawIcon(ctx, 'clock', tx, 4, 2);
      const tc = tl <= 10 && (Math.floor(clock * 4) & 1) ? '#ff7070' : '#f4ecdc';
      let cx = tx + 18;
      cx += drawInt(ctx, mins, cx, 6, tc, 2) + 2;
      cx += drawText(ctx, ':', cx, 6, tc, 2) + 2;
      drawInt(ctx, secs, cx, 6, tc, 2, 2);
      // счёт
      const sc = Math.floor(scoreV);
      const sw2 = intWidth(sc, 2);
      ctx.fillStyle = SHADE; ctx.fillRect(W - sw2 - 10, 3, sw2 + 7, 14);
      drawInt(ctx, sc, W - sw2 - 5, 7, '#1a0e08', 2);
      drawInt(ctx, sc, W - sw2 - 6, 6, '#fff2d0', 2);
      const b = Math.max(best, sc);
      const bw = intWidth(b, 1);
      drawIcon(ctx, 'trophy', W - bw - 15, 19, 1);
      drawInt(ctx, b, W - bw - 5, 20, '#ffd34a', 1);
      // задания дня
      const t = D.dy.t;
      for (let i = 0; i < t.length; i++) {
        const q = t[i];
        const y = 30 + i * 9;
        const nm = DAILY[q.i].short;
        const n = Math.floor(q.n), g = q.g;
        const w = labelWidth(nm, 1) + intWidth(n, 1) + intWidth(g, 1) + 14;
        ctx.fillStyle = SHADE; ctx.fillRect(W - w - 4, y - 1, w + 2, 8);
        const col = q.done ? '#7dffaa' : '#d8c8a8';
        let x = W - w - 2;
        x += drawLabel(ctx, nm, x, y, col, 1) + 3;
        x += drawInt(ctx, n, x, y, col, 1) + 1;
        x += drawText(ctx, '/', x, y, col, 1) + 1;
        drawInt(ctx, g, x, y, col, 1);
        if (q.done) { ctx.fillStyle = '#7dffaa'; ctx.fillRect(W - w - 6, y + 2, 1, 1); }
      }
      // заказ
      const o = order && phase !== 'intro' ? order.o : ORDERS[0];
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(4, 32, 30, 34);
      ctx.fillStyle = '#b8a47a'; ctx.fillRect(4, 64, 30, 2); ctx.fillRect(32, 32, 2, 34);
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(17, 30, 4, 4);
      drawIcon(ctx, o.icon, 9, 37, 3);
      if (order && orderGap <= 0 && phase === 'play') {
        const k = Math.max(0, order.pat / order.max);
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(6, 60, 26, 3);
        ctx.fillStyle = k > 0.35 ? '#3ec060' : (Math.floor(clock * 6) & 1) ? '#ff5050' : '#c03030';
        ctx.fillRect(6, 60, Math.round(26 * k), 3);
      }
      if (combo >= 2 && phase === 'play') { const w = drawText(ctx, 'x', 38, 35, '#7dffaa', 1); drawInt(ctx, combo, 39 + w, 35, '#7dffaa', 1); }
      if (cloakT > 0) { drawIco(ctx, 'cloak', 38, 44, 1); drawInt(ctx, Math.ceil(cloakT), 47, 45, '#c8a0ff', 1); }
      drawBar();
      ctx.restore();
      // низ: предметы, прогресс, лопата
      ctx.save();
      ctx.translate(0, slide * 2);
      for (let i = 0; i < ITEMS.length; i++) {
        const x = 4 + i * 18;
        ctx.fillStyle = SHADE; ctx.fillRect(x, SLOT_Y, 16, 17);
        drawIco(ctx, ITEMS[i].id, x + 1, SLOT_Y + 1, 2);
        if (D.it[i] <= 0) { ctx.fillStyle = 'rgba(20,14,18,0.6)'; ctx.fillRect(x, SLOT_Y, 16, 17); }
        drawInt(ctx, D.it[i], x + 12, SLOT_Y + 11, D.it[i] > 0 ? '#ffffff' : '#7a6a6a', 1);
        drawInt(ctx, i + 1, x + 1, SLOT_Y + 11, '#a89878', 1);
      }
      const f = tunnelFrac();
      const px0 = 100, pw = 166;
      ctx.fillStyle = SHADE; ctx.fillRect(px0 - 2, 163, pw + 4, 15);
      const pct = Math.floor(f * 100);
      let lx = px0;
      lx += drawLabel(ctx, isFree() ? 'ИСПЫТАНИЕ' : 'ПОДКОП', lx, 165, '#e8d8b0', 1) + 4;
      lx += drawInt(ctx, pct, lx, 165, '#ffd34a', 1);
      drawText(ctx, '%', lx + 1, 165, '#ffd34a', 1);
      const tn = SHOVELS[D.tool].name.toUpperCase();
      drawLabel(ctx, tn, px0 + pw - labelWidth(tn, 1), 165, '#a8b4c4', 1);
      ctx.fillStyle = '#2a1e14'; ctx.fillRect(px0, 172, pw, 4);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(px0, 172, Math.round(pw * f), 4);
      ctx.fillStyle = '#5a4630'; for (let i = 1; i < SEGS; i++) ctx.fillRect(px0 + Math.round((pw * i) / SEGS), 172, 1, 4);
      const pressed = digging;
      ctx.fillStyle = pressed ? '#2a1e14' : '#1a120e';
      ctx.fillRect(BTN.x - 1, BTN.y - 1, BTN.w + 2, BTN.h + 2);
      ctx.fillStyle = pressed ? '#6a4a2c' : '#8a6440';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, BTN.h);
      ctx.fillStyle = pressed ? '#5a3c22' : '#a87c50';
      ctx.fillRect(BTN.x, BTN.y, BTN.w, 2);
      drawIcon(ctx, 'shovel', BTN.x + 11, BTN.y + 4 + (pressed ? 1 : 0), 3);
      const segK = (D.dug % (curNeed() / SEGS)) / (curNeed() / SEGS);
      ctx.fillStyle = '#2a1e14'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, BTN.w - 6, 4);
      ctx.fillStyle = '#ffd34a'; ctx.fillRect(BTN.x + 3, BTN.y + BTN.h - 7, Math.round((BTN.w - 6) * (variant ? 0 : segK)), 4);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawMenu = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e8d8b0'; ctx.fillRect(MB.x - 2, MB.y - 2, MB.w + 4, MB.h + 4);
      ctx.fillStyle = '#2a1e18'; ctx.fillRect(MB.x, MB.y, MB.w, MB.h);
      for (let i = 0; i < 3; i++) {
        const x = MB.x + 8 + i * 78;
        ctx.fillStyle = i === page ? '#8a3a2a' : '#3a2a22'; ctx.fillRect(x, MB.y + 4, 72, 11);
        drawLabel(ctx, PAGE_NAMES[i], x + 36 - (labelWidth(PAGE_NAMES[i], 1) >> 1), MB.y + 7, i === page ? '#fff2d0' : '#a89878', 1);
      }
      const x0 = MB.x + 10;
      if (page === 0) {
        // лопата
        for (let r = 0; r < shopRows(); r++) {
          const y = MB.y + 24 + r * 16;
          if (r === sel) { ctx.fillStyle = '#4a3428'; ctx.fillRect(MB.x + 4, y - 2, MB.w - 8, 15); }
          let name, cost, have, hint;
          if (r === 0) {
            const nx = D.tool + 1;
            drawIcon(ctx, 'shovel', x0, y, 1);
            name = nx < SHOVELS.length ? 'ЛОПАТА: ' + SHOVELS[nx].name.toUpperCase() : 'ЛОПАТА: ' + SHOVELS[D.tool].name.toUpperCase();
            cost = nx < SHOVELS.length ? SHOVELS[nx].cost : 0;
            have = -1;
            hint = 'X' + (nx < SHOVELS.length ? SHOVELS[nx].mul : SHOVELS[D.tool].mul).toFixed(2) + ' К СКОРОСТИ';
          } else {
            const it = ITEMS[r - 1];
            drawIco(ctx, it.id, x0, y, 1);
            name = it.name.toUpperCase(); cost = it.cost; have = D.it[r - 1]; hint = it.hint.toUpperCase();
          }
          drawLabel(ctx, name, x0 + 12, y, '#fff2d0', 1);
          drawLabel(ctx, hint, x0 + 12, y + 7, '#9a8a78', 1);
          if (have >= 0) { drawInt(ctx, have, MB.x + MB.w - 64, y + 2, '#c8b8a0', 1); }
          if (cost > 0) {
            const cw = intWidth(cost, 1);
            drawIco(ctx, 'fav', MB.x + MB.w - cw - 22, y, 1);
            drawInt(ctx, cost, MB.x + MB.w - cw - 12, y + 1, D.fav >= cost ? '#ffd34a' : '#8a6a4a', 1);
          } else if (r === 0) drawIco(ctx, 'check', MB.x + MB.w - 20, y, 1);
        }
      } else if (page === 1) {
        const n = albumCount(D.alb);
        for (let i = 0; i < ARTEFACTS.length; i++) {
          const c = i % 10, r = Math.floor(i / 10);
          const a = ARTEFACTS[Math.floor(i / 10) + (i % 10) * 3];
          const ai = Math.floor(i / 10) + (i % 10) * 3;
          const x = MB.x + 10 + c * 22, y = MB.y + 26 + r * 22;
          ctx.fillStyle = i === sel ? '#5a4030' : '#3a2a22'; ctx.fillRect(x, y, 20, 20);
          drawArt(ctx, a.shape, a.c, x + 3, y + 3, 2, hasArt(D.alb, ai) ? null : '#1a1210');
        }
        const ai = Math.floor(sel / 10) + (sel % 10) * 3;
        const a = ARTEFACTS[ai];
        const known = hasArt(D.alb, ai);
        drawLabel(ctx, known ? a.name.toUpperCase() : '???', x0, MB.y + 98, known ? '#ffd34a' : '#7a6a5a', 1);
        drawLabel(ctx, 'ТЮРЬМА ' + a.p + ' · ' + PRISONS[a.p].short.toUpperCase(), x0, MB.y + 106, '#9a8a78', 1);
        drawLabel(ctx, 'НАЙДЕНО', x0, MB.y + 120, '#c8b8a0', 1);
        drawInt(ctx, n, x0 + 40, MB.y + 120, '#ffd34a', 1);
        drawText(ctx, '/30', x0 + 41 + intWidth(n, 1), MB.y + 120, '#ffd34a', 1);
      } else {
        drawLabel(ctx, 'ЗАДАНИЯ ДНЯ', x0, MB.y + 22, '#fff2d0', 1);
        const t = D.dy.t;
        for (let i = 0; i < t.length; i++) {
          const q = t[i];
          const d = DAILY[q.i];
          const y = MB.y + 32 + i * 10;
          drawLabel(ctx, d.short, x0, y, q.done ? '#7dffaa' : '#d8c8a8', 1);
          ctx.fillStyle = '#3a2a22'; ctx.fillRect(x0 + 34, y + 1, 80, 3);
          ctx.fillStyle = q.done ? '#7dffaa' : '#ffd34a'; ctx.fillRect(x0 + 34, y + 1, Math.round(80 * Math.min(1, q.n / q.g)), 3);
          drawInt(ctx, Math.floor(q.n), x0 + 120, y, '#c8b8a0', 1);
          drawText(ctx, '/', x0 + 121 + intWidth(Math.floor(q.n), 1), y, '#c8b8a0', 1);
          drawInt(ctx, q.g, x0 + 125 + intWidth(Math.floor(q.n), 1), y, '#c8b8a0', 1);
          drawIco(ctx, 'fav', x0 + 168, y - 1, 1);
          drawInt(ctx, d.fav, x0 + 177, y, '#ffd34a', 1);
        }
        // карта тюрем
        drawLabel(ctx, 'ПУТЬ К СВОБОДЕ', x0, MB.y + 72, '#fff2d0', 1);
        for (let i = 1; i <= 10; i++) {
          const x = x0 + (i - 1) * 22, y = MB.y + 82;
          const done = D.cur > i, here = D.cur === i;
          ctx.fillStyle = done ? '#3a6a3a' : here ? '#8a6a2a' : '#3a2a22'; ctx.fillRect(x, y, 18, 18);
          if (here && (Math.floor(clock * 2) & 1)) { ctx.fillStyle = '#ffd34a'; ctx.fillRect(x, y + 17, 18, 1); }
          drawInt(ctx, i, x + 9 - (intWidth(i, 1) >> 1), y + 3, done ? '#c8ffc8' : '#e8d8b0', 1);
          if (done) drawIco(ctx, 'check', x + 6, y + 10, 1);
          else if (REWARD_AT[i]) { ctx.fillStyle = '#ffd34a'; ctx.fillRect(x + 8, y + 12, 2, 2); }
        }
        if (isFree()) { const cx = x0 + ((D.rp || 10) - 1) * 22; ctx.fillStyle = '#ffd34a'; ctx.fillRect(cx, MB.y + 81, 18, 1); ctx.fillRect(cx, MB.y + 100, 18, 1); }
        drawLabel(ctx, isFree() ? 'СВОБОДЕН · ИСПЫТАНИЙ ' + D.st.free + ' · КЛИК ПО ТЮРЬМЕ — ВЕРНУТЬСЯ' : PRISONS[Math.min(10, D.cur)].name.toUpperCase(), x0, MB.y + 106, '#ffd34a', 1);
        drawLabel(ctx, 'ПОБЕГОВ ' + D.st.esc + ' · ПОЙМАН ' + D.st.cg, x0, MB.y + 116, '#9a8a78', 1);
      }
      drawLabel(ctx, '< > СТРАНИЦЫ · ENTER КУПИТЬ · TAB ЗАКРЫТЬ', MB.x + 8, MB.y + MB.h - 9, '#7a6a5a', 1);
    };

    const drawPops = () => {
      for (let i = 0; i < pops.length; i++) {
        const p = pops[i];
        if (!p.on) continue;
        const w = textWidth(p.s, 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2) + 1, Math.round(p.y) + 1, '#1a0e08', 2);
        drawText(ctx, p.s, Math.round(p.x - w / 2), Math.round(p.y), p.c, 2);
      }
      let y = 84;
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (!m.on) continue;
        const x = Math.round(W / 2 - m.w / 2);
        ctx.fillStyle = 'rgba(16,12,18,0.75)'; ctx.fillRect(x - 4, y - 2, m.w + 8, 9);
        drawLabel(ctx, m.s, x, y, m.c, 1);
        y += 11;
      }
    };

    // ползок по подкопу — во весь экран
    const drawCrawl = () => {
      const k = pt - ESC_DROP;
      const P = crawlPal || S.pal;
      ctx.fillStyle = P.earth; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = P.earth2;
      const sc = Math.round(k * 70);
      for (let i = 0; i < 40; i++) { const x = ((i * 53 - sc) % (W + 40) + W + 40) % (W + 40) - 20; ctx.fillRect(x, (i * 37) % H, 4 + (i % 4) * 2, 3); }
      ctx.fillStyle = P.tun; ctx.fillRect(0, 76, W, 34);
      ctx.fillStyle = P.beam;
      for (let x = ((-sc) % 60 + 60) % 60; x < W; x += 60) { ctx.fillRect(x, 72, 4, 42); ctx.fillRect(x - 3, 72, 10, 4); }
      // корни и находки
      ctx.fillStyle = '#6a5a3a';
      for (let i = 0; i < 6; i++) { const x = ((i * 71 - sc * 1.2) % (W + 30) + W + 30) % (W + 30) - 15; ctx.fillRect(x, 66 + (i % 2) * 2, 1, 10); ctx.fillRect(x + 1, 70, 3, 1); }
      // ползущий беглец
      const bx = 150 + Math.round(Math.sin(k * 3) * 4), by = 100;
      const st = Math.floor(k * 8) & 1;
      ctx.fillStyle = '#2a2228'; ctx.fillRect(bx - 18, by - 2 - st, 8, 3); ctx.fillRect(bx - 18, by + 2 + st - 2, 8, 2);
      ctx.fillStyle = '#c8c4b8'; ctx.fillRect(bx - 10, by - 6, 18, 8);
      ctx.fillStyle = '#5a5660'; ctx.fillRect(bx - 6, by - 6, 2, 8); ctx.fillRect(bx, by - 6, 2, 8);
      ctx.fillStyle = '#e8be96'; ctx.fillRect(bx + 8, by - 9, 8, 8); ctx.fillRect(bx + 10 + st * 3, by + 1, 4, 2);
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(bx + 8, by - 9, 8, 2);
      ctx.fillStyle = '#2a1e1e'; ctx.fillRect(bx + 13, by - 6, 2, 2);
      // свеча в зубах
      ctx.fillStyle = (Math.floor(clock * 6) & 1) ? '#ffd060' : '#ffb040'; ctx.fillRect(bx + 18, by - 6, 2, 3);
      ctx.fillStyle = pickA(WHITE, 0.08); ctx.fillRect(bx + 4, by - 20, 40, 34);
      // пыль
      ctx.fillStyle = '#8a7a5a';
      for (let i = 0; i < 8; i++) ctx.fillRect(((i * 41 - sc * 2) % W + W) % W, 78 + ((i * 13 + Math.floor(k * 10)) % 30), 1, 1);
      // затемнение входа/выхода
      const a = k < 0.4 ? 1 - k / 0.4 : k > ESC_CRAWL - ESC_DROP - 0.5 ? (k - (ESC_CRAWL - ESC_DROP - 0.5)) / 0.5 : 0;
      if (a > 0) { ctx.fillStyle = pickA(BLACK, a); ctx.fillRect(0, 0, W, H); }
      drawLabel(ctx, 'ПОЛЗЁШЬ ПО ПОДКОПУ...', W / 2 - (labelWidth('ПОЛЗЁШЬ ПО ПОДКОПУ...', 1) >> 1), 130, '#e8d8b0', 1);
    };

    const drawBanner = () => {
      if (bannerT <= 0 || variant) return;
      const a = Math.min(1, bannerT / 0.5, (2.4 - bannerT) / 0.3 + 0.01);
      const def = PRISONS[bannerP];
      if (!def) return;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      const t1 = (isFree() && bannerP === 10 ? 'СВОБОДА' : 'ТЮРЬМА ' + bannerP);
      const t2 = def.name.toUpperCase();
      const w1 = labelWidth(t1, 2), w2 = labelWidth(t2, 1);
      const w = Math.max(w1, w2) + 16;
      ctx.fillStyle = PANEL; ctx.fillRect(Math.round(W / 2 - w / 2), 92, w, 28);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(Math.round(W / 2 - w / 2), 92, w, 1); ctx.fillRect(Math.round(W / 2 - w / 2), 119, w, 1);
      drawLabel(ctx, t1, Math.round(W / 2 - w1 / 2), 96, '#ffd34a', 2);
      drawLabel(ctx, t2, Math.round(W / 2 - w2 / 2), 110, '#e8d8b0', 1);
      ctx.globalAlpha = 1;
    };

    const drawSpeech = () => {
      if (phase !== 'finale' || finLine < 0 || !KK.on) return;
      const s = FINALE_LINES[finLine];
      const w = labelWidth(s, 1) + 10;
      const x = Math.max(4, Math.min(W - w - 4, Math.round(KK.x - w + 20)));
      const y = FLOOR - 58;
      ctx.fillStyle = '#1a1418'; ctx.fillRect(x - 1, y - 1, w + 2, 13);
      ctx.fillStyle = '#fff8e8'; ctx.fillRect(x, y, w, 11);
      ctx.fillRect(Math.round(KK.x) - 2, y + 11, 4, 2); ctx.fillRect(Math.round(KK.x) - 1, y + 13, 2, 2);
      drawLabel(ctx, s, x + 5, y + 3, '#2a1a10', 1);
      // плащ летит от Кокка к беглецу
      if (pt > FINALE_AT[2] + 0.4 && pt < FINALE_AT[3]) {
        const k = (pt - FINALE_AT[2] - 0.4) / (FINALE_AT[3] - FINALE_AT[2] - 0.4);
        const cx = KK.x - 14 + (SMITH_X - KK.x + 14) * k, cy = FLOOR - 26 - Math.sin(k * Math.PI) * 14;
        drawIco(ctx, 'cape', cx - 7, cy - 7, 2);
      }
    };

    const draw = () => {
      const sway = S.sway || 0;
      const sh = S.shake > 0 ? Math.round(Math.sin(clock * 50) * 1.5) : 0;
      const ox = Math.round(sway) + sh;
      if (ox) { ctx.save(); ctx.translate(ox, 0); }
      drawRoom();
      drawTunnel();
      drawCones();
      drawActors();
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      drawFront(ctx, S, clock, dark);
      if (ox) ctx.restore();
      if (dimA > 0.01) { ctx.fillStyle = pickA(DIM, dimA); ctx.fillRect(0, 0, W, H); }
      if (phase === 'escape' && pt >= ESC_DROP && pt < ESC_CRAWL) drawCrawl();
      else if (phase === 'escape' && pt >= ESC_CRAWL && pt < ESC_CRAWL + 0.6) { ctx.fillStyle = pickA(BLACK, 1 - (pt - ESC_CRAWL) / 0.6); ctx.fillRect(0, 0, W, H); }
      drawHUD();
      drawSpeech();
      drawBanner();
      drawPops();
      if (menu) drawMenu();
    };

    // отладочный доступ для автотестов (хост его не передаёт)
    if (typeof api._probe === 'function') {
      try {
        api._probe({
          get D() { return D; }, get real() { return real; }, get auth() { return auth; }, get authorMode() { return authorMode; },
          guards, beasts, seers, wards, sees, wardActive, curNeed, wardPhase,
          get sw() { return sw; }, get phase() { return phase; }, get sceneP() { return sceneP; }, get cloak() { return cloakT; },
          get heat() { return heat; }, get quake() { return quakeWarn; }, get digging() { return digging; }, get time() { return time; },
          get marker() { return marker; }, get zoneC() { return zoneC; }, get zoneW() { return zoneW(); }, get order() { return order; }, get orderGap() { return orderGap; },
          get menu() { return menu; }, get faint() { return faintT; }, get kk() { return KK; }, get free() { return isFree(); }
        });
      } catch (e) { /* тесты */ }
    }

    // ---------- цикл ----------
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let stillT = 0;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.05);
      envT -= dt;
      if (envT <= 0) { envT = 0.5; pollEnv(); }
      const m = getMode();
      const paused = typeof api.paused === 'function' && !!api.paused();
      const still = !anim && phase === 'idle' && m !== 'play';
      if (!paused && !still) {
        handleMode(m);
        update(dt);
        stillT = 0;
        draw();
      } else {
        if (!paused && m === 'play') handleMode(m);
        stillT -= dt;
        if (stillT <= 0) { stillT = 0.5; draw(); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (!variant && (phase === 'play' || phase === 'end' || phase === 'wait')) persist();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.style.touchAction = prevTouch;
    };
  }
};
