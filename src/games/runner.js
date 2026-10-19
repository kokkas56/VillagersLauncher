// «Побег от зомби» — псевдо-3D раннер с видом из-за спины, три дорожки к горизонту.
// Одновременно живой фон лаунчера «Дорога»: житель спокойно идёт по дороге на закате (idle),
// по «Играть» из кустов вываливается орда и он срывается в бег (intro), при выходе добегает
// до заставы, стража закрывает ворота, он отдыхает и снова идёт пешком (outro).
import { drawText, drawIcon, drawInt, intWidth, drawLabel, labelWidth } from './pixfont.js';
import { createProg, createBook, kitIcon, drawAuthor, drawBookBtn, bar, fmtKm } from './runner/kit.js';
import { ROUTES, routesOpen, UPGRADES, missionDef, DAILY, BADGES, fresh as freshSave, M_PER_UNIT, AUTHOR_MUL } from './runner/data.js';

const W = 320;
const H = 180;
const HOR = 64; // линия горизонта
const PY = 152; // где стоят ноги игрока (z = 0)
const ZK = 7; // «фокус» перспективы
const LW = 50; // ширина дорожки у игрока
const FAR = 72; // дальность появления
const PU = 2; // масштаб игрока (пикселей на «пиксель» жителя)

const JUMP_V = 150;
const JUMP_V_BOOTS = 196;
const GRAV = 480;
const SLIDE_T = 0.6;

const V_WALK = 3.2; // скорость прогулки в покое
const CAM_IDLE = 34; // в покое дорога смещена вправо (слева меню лаунчера)
const INTRO_T = 1.9;
const INTRO_RETRY_T = 1.5;
const GATE_T = 2.0; // за сколько застава доезжает до жителя
const OUTRO_T = 3.6;
const GATE_STOP = -1.6; // где застава останавливается (между ордой и жителем)
const ROAD_WRAP = 160; // общий период полос дороги (5 и 6.4)

const proj = (z) => ZK / (ZK + z);
const projY = (s) => HOR + (PY - HOR) * s;

// предрасчитанные цвета (без аллокаций в кадре)
const FOG = 4;
const mixHex = (a, b, t) => {
  const c = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const shades = (c1, c2, fogc) => {
  const out = [];
  for (let f = 0; f < FOG; f++) out.push([mixHex(c1, fogc, f / FOG * 0.85), mixHex(c2, fogc, f / FOG * 0.85)]);
  return out;
};

// полупрозрачные заливки: таблицы по 16 ступеней
const ALPHA_N = 16;
const alphaTable = (r, g, b, maxA) => {
  const t = [];
  for (let i = 0; i < ALPHA_N; i++) t.push(`rgba(${r},${g},${b},${((maxA * i) / (ALPHA_N - 1)).toFixed(3)})`);
  return t;
};
const pickA = (tbl, k) => tbl[Math.max(0, Math.min(ALPHA_N - 1, Math.round(k * (ALPHA_N - 1))))];
const VIG = alphaTable(160, 20, 30, 0.35);
const RED = alphaTable(20, 0, 0, 0.5);
const NIGHT = alphaTable(14, 12, 40, 0.42);
const SNOWC = 'rgba(255,255,255,0.8)';
const MIST = alphaTable(140, 170, 140, 0.3);
// цвета каждого маршрута
const RC = ROUTES.map((r) => ({
  ROAD: shades(r.road[0], r.road[1], r.fog), GRASSC: shades(r.grass[0], r.grass[1], r.fog),
  EDGE: shades(r.edge, r.edge, r.fog), LINE: shades(r.line, r.line, r.fog), GLOW: alphaTable(r.glow[0], r.glow[1], r.glow[2], 0.26)
}));

const ZOMBIE_SKIN = '#5f8a4e';
const ZOMBIE_DARK = '#4b6e3d';
const ZOMBIE_SHIRT = '#3e6a8e';
const ZOMBIE_SHIRT_D = '#2e5070';
const ZOMBIE_PANTS = '#3a3260';
const WALK_ROBES = [['#8a5a32', '#6a4424'], ['#4a7a3a', '#365c2a'], ['#7a4a8a', '#5a3468'], ['#d8d0c0', '#a8a090'], ['#3a6a9a', '#2a4e74']];

// позы жителя
const P_WALK = 0, P_RUN = 1, P_STAND = 2, P_LOOK = 3, P_BREATH = 4, P_WAVE = 5, P_WRIG = 6, P_SIDE = 7;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'runner',
  title: 'Побег от зомби',
  sceneTitle: 'Дорога',
  desc: 'Беги от орды: прыгай через заборы, пригибайся под балками, обходи телеги и собирай изумруды.',
  controls: '← → дорожка · ↑/Пробел прыжок · ↓ пригнуться · мышь: клик слева/справа, выше/ниже жителя или свайп',

  mount(canvas, api) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    const rand = rng((Date.now() ^ 0x5eed) >>> 0);
    const readBest = () => Math.max(0, Math.floor(Number(api && api.best) || 0));
    let best = readBest();
    const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (e) { /* звук не обязателен */ } };
    const getMode = () => {
      try { return typeof api.mode === 'function' ? api.mode() : 'play'; } catch (e) { return 'idle'; }
    };

    // ---- фазы: idle | intro | play | end (поймали, до over) | wait (карточка результата) | outro ----
    let phase = 'idle';
    let pt = 0; // время в фазе
    let age = 0; // время с монтирования
    let introRetry = false;
    let sawOver = false;
    let fl1 = false, fl2 = false, fl3 = false; // одноразовые события внутри фазы

    // ---- состояние забега ----
    let time = 0;
    let clock = 0;
    let dist = 0;
    let roadPos = 0; // для полос дороги, крутится по кругу
    let gems = 0;
    let speedMul = 1;
    let nextRow = 0;
    let nextDecoL = 0;
    let nextDecoR = 0;
    let laneT = 2;
    let laneX = 2;
    let h = 0;
    let vy = 0;
    let slide = 0;
    let bootsT = 0;
    let invuln = 0;
    let lastStumble = -100;
    let near = 0; // насколько близко орда 0..1.6
    let nearT = 0;
    let nearK = 2.5;
    let hordeShow = 0; // 0 — орды нет вовсе (покой), 1 — видна у нижнего края
    let hordeT = 0;
    let shake = 0;
    let finalScore = 0;
    let lastPattern = '';
    let lastRun = 0; // последний счёт для HUD после забега
    // подача
    let vCur = V_WALK; // скорость мира вне забега
    let camOff = CAM_IDLE;
    let camT = CAM_IDLE;
    let laneRate = 1.5;
    let pose = P_WALK;
    let stepPh = 0;
    let lookSide = 1;
    let exclT = 0; // «!» над головой
    let waveT = 0;
    let breathT = 0;
    let hudA = 0;
    let redOv = 0;
    let dustT = 0;
    // покой: таймеры событий
    let tCart = 6 + Math.random() * 6;
    let tWalker = 2 + Math.random() * 4;
    let tBirds = 3 + Math.random() * 5;
    let tLone = 18 + Math.random() * 14;
    let tPause = 10 + Math.random() * 8;
    let idlePause = 0;
    // покой: одинокий зомби, отставший далеко позади
    const lone = { on: false, x: 240, n: 0, t: 0, st: 0, tx: 240 };
    // птицы
    const birds = [];
    for (let i = 0; i < 6; i++) birds.push({ on: false, x: 0, y: 0, vx: 0, ph: 0 });
    // настройки окружения
    let dark = 0;
    let anim = true;
    let envT = 0;
    const pollEnv = () => {
      try {
        const e = typeof api.env === 'function' ? api.env() : null;
        if (e) { dark = Math.max(0, Math.min(1, Number(e.dark) || 0)); anim = e.animations !== false; }
      } catch (err) { /* по умолчанию */ }
    };
    pollEnv();

    // ---- прогресс: сохранение, маршруты, магазин, миссии, задания дня, награды ----
    const fixSave = (S) => {
      S.route = Math.max(0, Math.min(routesOpen(S.total) - 1, Math.floor(Number(S.route) || 0)));
      for (const u of UPGRADES) S.up[u.id] = Math.max(0, Math.min(u.cost.length, Math.floor(Number(S.up[u.id]) || 0)));
      if (!Array.isArray(S.mis.a) || S.mis.a.length !== 3) S.mis.a = [{ id: 0, n: 0 }, { id: 1, n: 0 }, { id: 2, n: 0 }];
      S.mis.next = Math.max(S.mis.next | 0, ...S.mis.a.map((a) => (a.id | 0) + 1));
    };
    const prog = createProg(api, {
      id: 'runner', version: 1, fresh: freshSave, fix: fixSave, daily: DAILY,
      onDaily: (S, def, goal, pay) => { S.coins += pay; },
      rewards: [
        { id: 'run_badge_marathon', test: (S) => S.total >= 42000 },
        { id: 'run_music_chase', test: (S) => routesOpen(S.total) >= ROUTES.length },
        { id: 'run_title_wind', test: (S) => S.best >= 10000 },
        { id: 'run_cape_runner', test: (S) => S.total >= 500000 }
      ]
    });
    const MUL = prog.author ? AUTHOR_MUL : 1;
    prog.load();
    let skyReady = false;
    let rt = -1, RT = ROUTES[0], RCc = RC[0];
    const setRoute = (i) => {
      i = Math.max(0, Math.min(ROUTES.length - 1, i | 0));
      if (i === rt) return;
      rt = i; RT = ROUTES[i]; RCc = RC[i]; skyReady = false;
    };
    const idleRoute = () => (prog.variant ? (prog.variant - 1) % ROUTES.length : prog.S.route);
    setRoute(idleRoute());
    // миссии: кэш описаний трёх активных
    const misDef = [null, null, null];
    const refreshMis = () => { for (let k = 0; k < 3; k++) misDef[k] = missionDef(prog.S.mis.a[k].id); };
    refreshMis();
    let lastOpen = routesOpen(prog.S.total);
    const badgeCount = (S) => { let n = 0; for (const b of BADGES) if ((b.t === 'total' ? S.total : S.best) >= b.m) n++; return n; };
    let lastBadges = badgeCount(prog.S);
    // забег
    let runActive = false, runM = 0, cleanM = 0, runGems = 0, chances = 0, magnetT = 0, magnetMax = 5, bootsMax = 8, dangerT = 8;
    let tickT = 1, saveT = 20;
    const stat = (name, v) => {
      if (prog.variant) return;
      const S = prog.S;
      if (name === 'mRun' || name === 'gemsRun' || name === 'clean') prog.peak(name, v); else prog.bump(name, v);
      for (let k = 0; k < 3; k++) {
        const d = misDef[k], a = S.mis.a[k];
        if (d.stat !== name) continue;
        if (d.kind === 'sum') a.n += name === 'm' ? v : v * (prog.author ? 10 : 1);
        else if (v > a.n) a.n = v;
        if (a.n >= d.goal) {
          S.coins += d.pay; S.mis.done++;
          prog.toast('МИССИЯ ВЫПОЛНЕНА +' + d.pay, '#ffe070');
          sfx('win');
          a.id = S.mis.next++; a.n = 0;
          misDef[k] = missionDef(a.id);
        }
      }
    };
    const periodic = () => {
      const S = prog.S;
      const open = routesOpen(S.total);
      if (open > lastOpen) { lastOpen = open; prog.toast('ОТКРЫТ МАРШРУТ: ' + ROUTES[open - 1].name, '#9cf0ff'); sfx('win'); }
      const bc = badgeCount(S);
      if (bc > lastBadges) { lastBadges = bc; prog.toast('НОВЫЙ ЗНАЧОК ДИСТАНЦИИ', '#ffe070'); }
      prog.checkRewards();
    };
    const finishRun = () => {
      if (!runActive || prog.variant) { runActive = false; return; }
      runActive = false;
      const S = prog.S;
      if (runM > S.best) S.best = runM;
      if (runM >= 30) { S.runs++; stat('runs', 1); }
      periodic();
      prog.save();
    };
    const coinVal = () => RT.coin * (1 + 0.2 * prog.S.up.purse) * (prog.author ? 10 : 1);
    // ---- книжка ----
    const book = createBook([
      {
        title: 'МАРШРУТЫ',
        rows: () => ROUTES.map((r, i) => {
          const open = prog.S.total >= r.need;
          return { t: r.name, ic: i === prog.S.route ? 'check' : 'route', lock: !open, r: open ? 'X' + r.coin + ' МОНЕТ' : 'НУЖНО ' + fmtKm(r.need), s: i === prog.S.route ? 'ВЫБРАН' : '' };
        }),
        pick: (i) => {
          if (prog.S.total < ROUTES[i].need) { sfx('click'); return false; }
          prog.S.route = i; setRoute(i); sfx('coin'); prog.save(); return true;
        },
        foot: () => 'ВСЕГО ' + fmtKm(prog.S.total) + '  РЕКОРД ' + fmtKm(prog.S.best)
      },
      {
        title: 'МАГАЗИН',
        rows: () => UPGRADES.map((u) => {
          const l = prog.S.up[u.id], max = l >= u.cost.length;
          return { t: u.name, ic: u.ic, s: u.info(l), r: max ? 'МАКС' : u.cost[l] + ' МОН.', c: max ? '#9cf08a' : '#ffffff' };
        }),
        pick: (i) => {
          const u = UPGRADES[i], S = prog.S, l = S.up[u.id];
          if (l >= u.cost.length || S.coins < u.cost[l]) { sfx('click'); return false; }
          S.coins -= u.cost[l]; S.up[u.id] = l + 1; sfx('win'); prog.save(); return true;
        },
        foot: () => 'МОНЕТЫ: ' + Math.floor(prog.S.coins)
      },
      {
        title: 'ЗАДАНИЯ',
        rows: () => {
          const out = [];
          for (let k = 0; k < 3; k++) { const d = misDef[k], a = prog.S.mis.a[k]; out.push({ t: d.text, ic: d.ic, r: (d.stat === 'm' || d.stat === 'mRun' || d.stat === 'clean' ? fmtKm(a.n) : Math.floor(a.n)) + ' / +' + d.pay }); }
          out.push({ t: '- ЗАДАНИЯ ДНЯ -', c: '#8a6a3a' });
          for (const r of prog.dailyRows()) out.push(r);
          return out;
        },
        foot: () => 'МИССИЙ ВЫПОЛНЕНО: ' + prog.S.mis.done
      },
      {
        title: 'ЗНАЧКИ',
        rows: () => BADGES.map((b) => {
          const v = b.t === 'total' ? prog.S.total : prog.S.best, got = v >= b.m;
          return { t: b.name, ic: got ? 'star' : 'flag', lock: !got, r: (b.t === 'total' ? 'ВСЕГО ' : 'ЗА ЗАБЕГ ') + fmtKm(b.m) };
        }),
        foot: () => 'ЗАБЕГОВ: ' + prog.S.runs
      }
    ], W, H);
    const authorKey = (code) => {
      if (!prog.author) return false;
      const S = prog.S;
      if (code === 'BracketRight') {
        const i = Math.min(ROUTES.length - 1, rt + 1);
        if (S.total < ROUTES[i].need) S.total = ROUTES[i].need;
        S.route = i; setRoute(i); periodic(); prog.save();
        prog.toast('(АВТОР) МАРШРУТ ' + (i + 1), '#ffb0e0');
        return true;
      }
      if (code === 'BracketLeft') {
        const i = Math.max(0, rt - 1);
        S.route = i; setRoute(i); prog.save();
        prog.toast('(АВТОР) МАРШРУТ ' + (i + 1), '#ffb0e0');
        return true;
      }
      return false;
    };

    const ents = []; // {k, lane, z, len, hgt, hit, side, v, ...}
    const parts = [];
    for (let i = 0; i < 56; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff' });
    const puff = (x, y, n, c, spd = 40) => {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (n <= 0) break;
        if (p.on) continue;
        p.on = true;
        p.x = x; p.y = y;
        const a = rand() * Math.PI * 2;
        const v = spd * (0.4 + rand() * 0.8);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 20;
        p.life = 0.4 + rand() * 0.4;
        p.c = c;
        n--;
      }
    };

    // дальние холмы и деревня на горизонте
    const hills = new Float32Array(W / 2 + 40);
    for (let i = 0; i < hills.length; i++) hills[i] = HOR - 6 - 7 * Math.sin(i / 9) - 4 * Math.sin(i / 4 + 1) - rand() * 2;
    const farHouses = [];
    for (let i = 0; i < 7; i++) farHouses.push({ x: 120 + i * 13 + Math.floor(rand() * 5), w: 6 + Math.floor(rand() * 4), h: 4 + Math.floor(rand() * 3), lit: rand() > 0.3 });
    const horde = [];
    for (let i = 0; i < 7; i++) horde.push({ x: 24 + i * 45 + rand() * 14, ph: rand() * 6, d: rand() });

    const speed = () => (13 + 12 * (1 - Math.exp(-time / 90))) * speedMul;
    const score = () => Math.floor(dist * 0.5) + gems * 10;

    const add = (k, lane, z, extra) => {
      const e = { k, lane, z, len: 0, hgt: 0, hit: false, side: 0, v: rand(), sp: 0, flee: 0, ghost: false, fade: 1, fadeV: 0, waved: false, waveT: 0, doors: 0, deco: '', off: 0, mag: 0 };
      if (extra) Object.assign(e, extra);
      ents.push(e);
      return e;
    };
    const gemLine = (lane, z0, n, arcOver) => {
      for (let i = 0; i < n; i++) {
        let hgt = 5;
        if (arcOver) {
          const u = (i + 0.5) / n;
          hgt = 5 + 22 * Math.sin(Math.PI * u);
        }
        add('gem', lane, z0 + i * 2.2, { hgt });
      }
    };
    const isObstacle = (e) => e.k === 'fence' || e.k === 'beam' || e.k === 'cart' || e.k === 'gap' || e.k === 'gem' || e.k === 'boots' || e.k === 'magnet';

    const spawnRow = () => {
      const z = FAR;
      const t = time;
      const L = Math.floor(rand() * 3);
      const others = [0, 1, 2].filter((x) => x !== L);
      const r = rand();
      const hard = Math.min(1, t / 100);
      let pat;
      if (t < 4) pat = 'gems';
      else if (r < 0.14) pat = 'gems';
      else if (r < 0.42 - hard * 0.12) pat = 'one';
      else if (r < 0.6) pat = 'twocarts';
      else if (r < 0.7) pat = 'fencewall';
      else if (r < 0.8) pat = 'beamwall';
      else pat = 'mixed';
      if (pat === lastPattern && (pat === 'fencewall' || pat === 'beamwall')) pat = 'one';
      lastPattern = pat;

      const single = (lane, type) => {
        if (type === 'gap') add('gap', lane, z, { len: 3 });
        else add(type, lane, z);
      };
      if (pat === 'gems') {
        gemLine(L, z, 5, false);
      } else if (pat === 'one') {
        const types = t > 15 ? ['fence', 'beam', 'cart', 'gap'] : ['fence', 'beam', 'cart'];
        const type = types[Math.floor(rand() * types.length)];
        single(L, type);
        if (type === 'fence' || type === 'gap') gemLine(L, z - 4.5, 5, true);
        else if (rand() < 0.6) gemLine(others[Math.floor(rand() * 2)], z - 2, 4, false);
        if (hard > 0.4 && rand() < hard * 0.6) {
          const l2 = others[Math.floor(rand() * 2)];
          single(l2, rand() < 0.5 ? 'cart' : 'fence');
        }
      } else if (pat === 'twocarts') {
        add('cart', others[0], z);
        add('cart', others[1], z);
        gemLine(L, z - 2, 4, false);
      } else if (pat === 'fencewall') {
        for (let l = 0; l < 3; l++) add('fence', l, z);
        gemLine(Math.floor(rand() * 3), z - 4.5, 5, true);
      } else if (pat === 'beamwall') {
        for (let l = 0; l < 3; l++) add('beam', l, z);
        if (rand() < 0.5) gemLine(Math.floor(rand() * 3), z + 1.5, 3, false);
      } else {
        // смешанный ряд: в каждой дорожке своё действие, одна всегда проходима
        const kinds = ['fence', 'beam', t > 15 ? 'gap' : 'fence'];
        for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = kinds[i]; kinds[i] = kinds[j]; kinds[j] = tmp; }
        if (rand() < 0.5) kinds[Math.floor(rand() * 3)] = 'cart';
        if (kinds.every((k) => k === 'cart')) kinds[0] = 'fence';
        for (let l = 0; l < 3; l++) single(l, kinds[l]);
      }
      const wantMag = prog.S.up.magnet > 0 && magnetT <= 0 && t > 14 && rand() < 0.05;
      if ((bootsT <= 0 && t > 10 && rand() < 0.07) || wantMag) {
        const free = [0, 1, 2].find((l) => !ents.some((e) => e.lane === l && Math.abs(e.z - z) < 1 && isObstacle(e) && e.k !== 'gem'));
        if (free != null) add(wantMag ? 'magnet' : 'boots', free, z + 6, { hgt: 6 });
      }
    };

    function addDeco(side, z) {
      const r = rand();
      const kind = r < 0.45 ? 'tree' : r < 0.7 ? 'post' : r < 0.88 ? 'bush' : 'lamp';
      add('deco', side < 0 ? -1 : 3, z, { side, deco: kind, off: 2.3 + rand() * (kind === 'tree' ? 1.6 : 0.4) });
    }
    // декор сразу вдоль дороги
    for (let z = -2; z < FAR; z += 4 + rand() * 4) { addDeco(-1, z); addDeco(1, z + 2); }
    ents.sort((a, b) => b.z - a.z);

    // ---- управление (только в забеге) ----
    const doLeft = () => { if (laneT > 0) { laneT--; sfx('step'); } };
    const doRight = () => { if (laneT < 2) { laneT++; sfx('step'); } };
    const doJump = () => {
      if (h <= 0.01) {
        vy = bootsT > 0 ? JUMP_V_BOOTS : JUMP_V;
        slide = 0;
        sfx('jump');
      }
    };
    const doDuck = () => {
      if (h > 0.01) { vy = Math.min(vy, -260); slide = SLIDE_T; } // резко вниз и в подкат
      else slide = SLIDE_T;
    };
    const act = (a) => {
      if (phase !== 'play') return;
      if (a === 'L') doLeft();
      else if (a === 'R') doRight();
      else if (a === 'U') doJump();
      else if (a === 'D') doDuck();
    };
    const KEYMAP = {
      ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', Space: 'U', ArrowDown: 'D', KeyS: 'D'
    };
    const onKey = (e) => {
      if (phase !== 'play') return; // в покое клавиши принадлежат лаунчеру
      if (!e.repeat && authorKey(e.code)) { e.preventDefault(); return; }
      if (book.key(e.code)) { e.preventDefault(); sfx('click'); return; }
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      act(a);
    };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H };
    };
    let pdown = null;
    const onDown = (e) => {
      if (phase !== 'play') { pdown = null; return; }
      e.preventDefault();
      const p = toLocal(e);
      if (book.open) { book.click(p.x, p.y); pdown = null; return; }
      if (p.x < 16 && p.y > H - 17) { book.toggle(true); sfx('click'); pdown = null; return; }
      pdown = { x: p.x, y: p.y, used: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
    };
    const onMove = (e) => {
      if (!pdown || pdown.used) return;
      const p = toLocal(e);
      const dx = p.x - pdown.x, dy = p.y - pdown.y;
      if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
        pdown.used = true;
        if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'L' : 'R');
        else act(dy < 0 ? 'U' : 'D');
      }
    };
    const onUp = (e) => {
      if (!pdown) return;
      if (!pdown.used) {
        const p = toLocal(e);
        const dx = p.x - pdown.x, dy = p.y - pdown.y;
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'L' : 'R');
        else if (Math.abs(dy) > 10) act(dy < 0 ? 'U' : 'D');
        else if (pdown.x < W / 3) act('L');
        else if (pdown.x > (W * 2) / 3) act('R');
        else act(pdown.y < 120 ? 'U' : 'D');
      }
      pdown = null;
    };
    const onCancel = () => { pdown = null; };
    const onCtx = (e) => { if (phase === 'play') e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('contextmenu', onCtx);

    const camX = () => Math.round(W / 2 + camOff - (laneX - 1) * 14);
    const playerScreenX = () => camX() + (laneX - 1) * LW;

    // ---- логика забега ----
    const stumble = () => {
      if (invuln > 0 || phase !== 'play') return;
      cleanM = 0;
      if (time - lastStumble < dangerT && chances > 0) {
        // второй шанс: вырывается и бежит дальше
        chances--;
        lastStumble = -100; invuln = 2; speedMul = 0.6; shake = 0.35; slide = 0;
        prog.toast('ВТОРОЙ ШАНС!', '#ffe070');
        sfx('win');
        puff(playerScreenX(), PY - h - 12, 12, '#ffe070', 60);
        return;
      }
      if (time - lastStumble < dangerT) {
        setPhase('end');
        finalScore = score();
        lastRun = finalScore;
        shake = 0.5;
        sfx('lose');
        return;
      }
      lastStumble = time;
      speedMul = 0.5;
      invuln = 1.1;
      shake = 0.3;
      slide = 0;
      sfx('hit');
      puff(playerScreenX(), PY - h - 12, 8, '#d8c8a0', 50);
    };

    // ---- переходы ----
    function setPhase(p) {
      phase = p; pt = 0; fl1 = false; fl2 = false; fl3 = false;
      if (typeof api._phase === 'function') { try { api._phase(p); } catch (e) { /* отладка */ } }
    }
    const fleeAll = () => {
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.k === 'walker' || e.k === 'ocart') e.flee = e.lane < 1 ? -1 : 1;
      }
    };
    const startIntro = (retry) => {
      setPhase('intro');
      introRetry = retry;
      best = readBest();
      book.toggle(false);
      if (!retry) { prog.load(); refreshMis(); lastOpen = routesOpen(prog.S.total); lastBadges = badgeCount(prog.S); setRoute(prog.S.route); }
      idlePause = 0;
      waveT = 0;
      if (lone.on && lone.st < 3) { lone.st = 3; lone.t = 0; }
      fleeAll();
    };
    const beginPlay = () => {
      setPhase('play');
      time = 0; dist = 0; gems = 0; speedMul = 1; nextRow = 22; laneT = 1;
      slide = 0; bootsT = 0; invuln = 0; lastStumble = -100; nearT = 0; nearK = 2.5;
      lastPattern = '';
      const S = prog.S;
      runActive = true; runM = 0; cleanM = 0; runGems = 0; magnetT = 0;
      chances = S.up.chance; bootsMax = 8 + 2 * S.up.boots; magnetMax = 5 + 2 * S.up.magnet; dangerT = 8 - S.up.stam;
      tickT = 1; saveT = 20;
      // оставшиеся препятствия прошлого забега (если были) — убрать
      let w = 0;
      for (let i = 0; i < ents.length; i++) if (!isObstacle(ents[i])) ents[w++] = ents[i];
      ents.length = w;
    };
    const startOutro = () => {
      const from = phase;
      book.toggle(false);
      finishRun();
      magnetT = 0;
      setPhase('outro');
      let v0 = vCur;
      if (from === 'play') v0 = speed();
      if (from === 'end' || from === 'wait') {
        // вырывается из лап и бежит
        v0 = 10;
        vy = 110; h = 0.01;
        puff(playerScreenX(), PY - 10, 8, '#d8c8a0', 55);
        nearT = 1.0;
      }
      v0 = Math.max(v0, 6);
      slide = 0; invuln = 0; exclT = 0;
      // препятствия растворяются, столкновений больше нет
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (isObstacle(e)) { e.ghost = true; if (e.z > 1.5) e.fadeV = -3; }
        if (e.k === 'gate') e.k = 'gateOld';
      }
      fleeAll();
      const z0 = Math.max(9, v0 * GATE_T / 2 + GATE_STOP);
      gateStart = z0;
      add('gate', 1, z0, { fade: 0, fadeV: 3.5, doors: 0 });
    };
    let gateStart = 10;
    const findGate = () => {
      for (let i = 0; i < ents.length; i++) if (ents[i].k === 'gate') return ents[i];
      return null;
    };

    const handleMode = (m) => {
      if (prog.variant) return; // декоративный фон: только покой
      if (m === 'play') {
        if (phase === 'idle') { if (age >= 1.2) startIntro(false); }
        else if (phase === 'outro') startIntro(false);
        else if (phase === 'wait' && (sawOver || pt > 5)) startIntro(true);
      } else if (m === 'idle') {
        if (phase === 'intro' || phase === 'play' || phase === 'end' || phase === 'wait') startOutro();
      } else if (m === 'over') {
        if (phase === 'wait') sawOver = true;
      }
    };

    // ---- фазы ----
    const spawnBirds = () => {
      const dir = rand() < 0.5 ? 1 : -1;
      const n = 3 + Math.floor(rand() * 3);
      const y0 = 12 + rand() * 26;
      const x0 = dir > 0 ? -12 : W + 12;
      const sp = 16 + rand() * 10;
      let k = 0;
      for (let i = 0; i < birds.length && k < n; i++) {
        const b = birds[i];
        if (b.on) continue;
        b.on = true;
        b.x = x0 - dir * k * 7;
        b.y = y0 + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 3;
        b.vx = dir * sp;
        b.ph = rand() * 4;
        k++;
      }
    };

    const updIdle = (dt) => {
      tCart -= dt; tWalker -= dt; tBirds -= dt; tLone -= dt; tPause -= dt;
      if (tCart <= 0) {
        tCart = 16 + rand() * 22;
        if (!ents.some((e) => e.k === 'ocart')) add('ocart', 1, -3.2, { sp: 5.2 });
      }
      if (tWalker <= 0) {
        tWalker = 8 + rand() * 12;
        add('walker', 0, FAR, { sp: -1 - rand() * 0.4 });
      }
      if (tBirds <= 0) { tBirds = 7 + rand() * 10; spawnBirds(); }
      if (tLone <= 0) {
        tLone = 24 + rand() * 22;
        if (!lone.on) { lone.on = true; lone.st = 0; lone.t = 0; lone.n = 0; lone.x = 170 + rand() * 120; lone.tx = lone.x; }
      }
      if (tPause <= 0 && idlePause <= 0 && waveT <= 0) {
        tPause = 12 + rand() * 14;
        idlePause = 2.2 + rand() * 1.6;
        lookSide = rand() < 0.5 ? -1 : 1;
      }
      if (idlePause > 0) idlePause -= dt;
      if (waveT > 0) waveT -= dt;
      // встречные машут рукой — житель отвечает
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.k === 'walker' && !e.waved && e.z < 8 && e.z > 2) { e.waved = true; e.waveT = 1.6; if (idlePause <= 0) waveT = 1.4; }
      }
      const vT = idlePause > 0 ? 0 : V_WALK;
      vCur += (vT - vCur) * Math.min(1, dt * 1.8);
      laneT = 2; laneRate = 1.2;
      nearT = 0; hordeT = 0; camT = CAM_IDLE;
      if (waveT > 0) pose = P_WAVE;
      else if (vCur < 0.8) pose = idlePause > 0.5 && idlePause < 2.0 ? P_SIDE : P_STAND;
      else pose = P_WALK;
      return vCur * dt;
    };

    const updIntro = (dt) => {
      const t = pt;
      laneRate = 3;
      if (!introRetry) {
        if (!fl1 && t >= 0.05) {
          fl1 = true;
          // из кустов позади вываливается орда
          for (let i = 0; i < horde.length; i++) puff(horde[i].x, H - 4, 2, i & 1 ? '#3e6e36' : '#2e5a2e', 60);
          sfx('hit');
          shake = 0.25;
          hordeT = 1; nearT = 0.55; nearK = 4;
        }
        if (t < 0.75) {
          vCur += (0 - vCur) * Math.min(1, dt * 6);
          pose = t < 0.2 ? P_WALK : P_LOOK;
          if (t >= 0.25 && t < 0.3) exclT = 0.6;
        } else {
          if (!fl2) { fl2 = true; vy = 95; h = 0.01; sfx('jump'); laneT = 1; camT = 0; }
          vCur += (13 - vCur) * Math.min(1, dt * 2.4);
          pose = P_RUN;
          if (t >= 1.0) { nearT = 0; nearK = 1.6; }
        }
        if (t >= INTRO_T) beginPlay();
      } else {
        // ещё раз: вырывается из лап и снова бежит
        hordeT = 1;
        if (t < 0.35) { pose = P_WRIG; vCur = 0; }
        else {
          if (!fl1) { fl1 = true; vy = 110; h = 0.01; sfx('jump'); shake = 0.2; puff(playerScreenX(), PY - 10, 8, '#d8c8a0', 55); nearT = 0.6; nearK = 3; laneT = 1; camT = 0; }
          if (t > 0.7) { nearT = 0; nearK = 1.6; }
          vCur += (13 - vCur) * Math.min(1, dt * 2.6);
          pose = P_RUN;
        }
        if (t >= INTRO_RETRY_T) beginPlay();
      }
      return vCur * dt;
    };

    const updPlay = (dt) => {
      time += dt;
      speedMul = Math.min(1, speedMul + dt * 0.45);
      const v = speed() * RT.spd;
      vCur = v;
      const dz = v * dt;
      dist += dz;
      if (!prog.variant) {
        const dm = dz * M_PER_UNIT * MUL;
        prog.S.total += dm; runM += dm; cleanM += dm;
        stat('m', dm); stat('mRun', runM); stat('clean', cleanM);
        tickT -= dt; saveT -= dt;
        if (tickT <= 0) { tickT = 1; periodic(); }
        if (saveT <= 0) { saveT = 20; prog.save(); }
      }
      if (invuln > 0) invuln -= dt;
      if (bootsT > 0) bootsT -= dt;
      if (magnetT > 0) magnetT -= dt;
      if (slide > 0 && h <= 0) slide -= dt;
      laneRate = 9;
      pose = P_RUN;
      hordeT = 1; camT = 0;
      const danger = time - lastStumble < dangerT;
      nearT = danger ? 1 - (time - lastStumble) / dangerT * 0.6 : 0;
      nearK = 2.5;
      nextRow -= dz;
      if (nextRow <= 0) {
        spawnRow();
        const interval = 0.72 + 0.6 * Math.exp(-time / 70);
        nextRow = Math.max(10, v * interval * (0.9 + rand() * 0.35));
      }
      return dz;
    };

    const updEnd = (dt) => {
      vCur += (0 - vCur) * Math.min(1, dt * 5);
      nearT = 1.3; nearK = 2; hordeT = 1;
      pose = pt > 0.5 ? P_WRIG : P_STAND;
      slide = 0;
      if (pt > 1.3) {
        finishRun();
        setPhase('wait');
        sawOver = false;
        try { api.over(finalScore); } catch (e) { /* хост */ }
      }
      return vCur * dt;
    };

    const updWait = (dt) => {
      vCur = 0;
      nearT = 1.1 + 0.08 * Math.sin(clock * 1.7); nearK = 1.5; hordeT = 1;
      pose = P_WRIG;
      dustT -= dt;
      if (dustT <= 0) { dustT = 0.5 + rand() * 0.7; puff(playerScreenX() + (rand() - 0.5) * 30, PY - 2, 2, '#b89a70', 25); }
      return 0;
    };

    const updOutro = (dt) => {
      const t = pt;
      const g = findGate();
      let dz;
      if (t < GATE_T) {
        // разгон сходит на нет, застава подъезжает к жителю
        const u = Math.min(1, (t + dt) / GATE_T), u0 = Math.min(1, t / GATE_T);
        const e1 = 1 - (1 - u) * (1 - u), e0 = 1 - (1 - u0) * (1 - u0);
        dz = (gateStart - GATE_STOP) * (e1 - e0);
        vCur = dt > 0 ? dz / dt : vCur;
        pose = P_RUN;
        nearT = t < 0.4 && nearT > 1 ? nearT : 0.5; nearK = 2; hordeT = 1;
      } else {
        const tt = t - GATE_T;
        if (g && g.doors < 1) {
          g.doors = Math.min(1, g.doors + dt * 2.2);
          if (g.doors >= 1 && !fl1) { fl1 = true; sfx('hit'); shake = 0.2; }
        }
        laneT = 2; laneRate = 1.4; camT = CAM_IDLE;
        if (tt < 0.6) { nearT = 0.62; nearK = 3; }
        else { nearT = 0; nearK = 1.4; hordeT = 0; }
        if (tt < 1.2) {
          vCur += (0 - vCur) * Math.min(1, dt * 8);
          pose = P_BREATH;
          breathT -= dt;
          if (breathT <= 0) { breathT = 0.45; puff(playerScreenX() + 2, PY - 22, 1, '#f0e8e0', 10); }
        } else {
          vCur += (V_WALK - vCur) * Math.min(1, dt * 2);
          pose = P_WALK;
        }
        dz = vCur * dt;
      }
      if (t >= OUTRO_T) {
        setPhase('idle');
        tPause = 10 + rand() * 6;
        idlePause = 0;
      }
      return dz;
    };

    // ---- мир ----
    const scroll = (dz, dt, collide) => {
      roadPos = (roadPos + dz) % ROAD_WRAP;
      const lane = Math.round(laneX);
      let w = 0;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        const pz = e.z;
        e.z -= dz;
        if (e.sp !== 0) e.z += e.sp * dt;
        if (e.flee !== 0) e.lane += e.flee * dt * 2.4;
        if (e.fadeV !== 0) {
          e.fade += e.fadeV * dt;
          if (e.fade >= 1) { e.fade = 1; e.fadeV = 0; }
        }
        if (e.waveT > 0) e.waveT -= dt;
        if (collide && !e.hit && !e.ghost && phase === 'play') {
          if (e.k === 'gem' && magnetT > 0 && e.z < 10 && e.z > -0.8) e.mag = Math.min(1, e.mag + dt * 4);
          if (e.lane === lane) {
            if (e.k === 'gap') {
              if (e.z <= 0.2 && e.z + e.len >= -0.2 && h <= 0.5) { e.hit = true; stumble(); }
              else if (pz + e.len > -0.2 && e.z + e.len <= -0.2) stat('jump', 1);
            } else if (pz > 0 && e.z <= 0) {
              if (e.k === 'fence') { if (h < 9) { e.hit = true; stumble(); } else stat('jump', 1); }
              else if (e.k === 'beam') { if (slide <= 0 || h > 0) { e.hit = true; stumble(); } else stat('duck', 1); }
              else if (e.k === 'cart') { if (h < 24) { e.hit = true; stumble(); } else stat('jump', 1); }
            }
          }
          if ((e.k === 'gem' || e.k === 'boots' || e.k === 'magnet') && e.z <= 0.7 && e.z > -0.8 && (e.lane === lane || e.mag > 0.5)) {
            const ph = slide > 0 ? 0 : h;
            if (e.mag > 0.5 || Math.abs(ph + 8 - e.hgt) < 16) {
              e.hit = true;
              const sx = playerScreenX();
              if (e.k === 'gem') {
                gems++; runGems++;
                if (!prog.variant) { prog.S.coins += coinVal(); prog.S.st.gems++; stat('gems', 1); stat('gemsRun', runGems); }
                sfx('coin'); puff(sx, PY - e.hgt - 8, 5, '#7dffaa', 35);
              } else if (e.k === 'boots') { bootsT = bootsMax; stat('power', 1); sfx('win'); puff(sx, PY - e.hgt - 8, 10, '#62d8ff', 50); }
              else { magnetT = magnetMax; stat('power', 1); sfx('win'); puff(sx, PY - e.hgt - 8, 10, '#ff8a8a', 50); }
            }
          }
        }
        const keep = e.z + e.len > -4 && e.z < FAR + 12 && e.fade > 0 && (e.flee === 0 || Math.abs(e.lane - 1) < 4.5);
        if (keep) ents[w++] = e;
      }
      ents.length = w;
      nextDecoL -= dz; nextDecoR -= dz;
      if (nextDecoL <= 0) { addDeco(-1, FAR + 2); nextDecoL = 3 + rand() * 5; }
      if (nextDecoR <= 0) { addDeco(1, FAR + 3); nextDecoR = 3 + rand() * 5; }
      // почти отсортировано — сортировка вставками O(n)
      for (let i = 1; i < ents.length; i++) {
        const e = ents[i];
        let j = i - 1;
        while (j >= 0 && ents[j].z < e.z) { ents[j + 1] = ents[j]; j--; }
        ents[j + 1] = e;
      }
    };

    const updLone = (dt) => {
      if (!lone.on) return;
      lone.t += dt;
      if (lone.st === 0) { // показывается из-за края
        lone.n = Math.min(0.6, lone.n + dt * 0.3);
        if (lone.t > 2.2) { lone.st = 1; lone.t = 0; }
      } else if (lone.st === 1) { // тащится следом
        lone.tx = playerScreenX();
        lone.x += Math.sign(lone.tx - lone.x) * Math.min(Math.abs(lone.tx - lone.x), dt * 6);
        if (lone.t > 3) { lone.st = 2; lone.t = 0; }
      } else if (lone.st === 2) { // теряет интерес
        if (lone.t > 1.4) { lone.st = 3; lone.t = 0; }
      } else {
        lone.n -= dt * 0.35;
        if (lone.n <= 0) { lone.n = 0; lone.on = false; }
      }
    };

    const update = (dt) => {
      prog.updToasts(dt);
      if (phase === 'idle' && prog.toasts.length) prog.toasts.length = 0;
      if (book.open) {
        if (phase === 'play') return; // книжка открыта — забег на паузе
        book.toggle(false);
      }
      prog.tickDay(dt);
      clock += dt; age += dt; pt += dt;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
      }
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        if (!b.on) continue;
        b.x += b.vx * dt;
        b.y += Math.sin(clock * 2 + b.ph) * dt * 3;
        if (b.x < -30 || b.x > W + 30) b.on = false;
      }
      if (shake > 0) shake -= dt;
      if (exclT > 0) exclT -= dt;
      let dz;
      if (phase === 'idle') dz = updIdle(dt);
      else if (phase === 'intro') dz = updIntro(dt);
      else if (phase === 'play') dz = updPlay(dt);
      else if (phase === 'end') dz = updEnd(dt);
      else if (phase === 'wait') dz = updWait(dt);
      else dz = updOutro(dt);
      if (phase !== 'idle' && lone.on && lone.st < 3) { lone.st = 3; lone.t = 0; }
      updLone(dt);
      // дорожка
      const d = laneT - laneX;
      const step = dt * laneRate;
      laneX = Math.abs(d) <= step ? laneT : laneX + Math.sign(d) * step;
      // прыжок
      if (h > 0 || vy > 0) {
        h += vy * dt;
        vy -= GRAV * dt;
        if (h <= 0) { h = 0; vy = 0; if (slide <= 0 && phase === 'play') sfx('step'); }
      }
      near += (nearT - near) * Math.min(1, dt * nearK);
      hordeShow += (hordeT - hordeShow) * Math.min(1, dt * (hordeT > hordeShow ? 5 : 1.2));
      camOff += (camT - camOff) * Math.min(1, dt * 1.6);
      const hudT = phase === 'play' || phase === 'end' || phase === 'wait' || (phase === 'intro' && pt > (introRetry ? 0.6 : 1.2)) ? 1 : 0;
      hudA += (hudT - hudA) * Math.min(1, dt * 4);
      const redT = phase === 'end' ? Math.min(0.45, pt * 0.4) : phase === 'wait' ? 0.22 : 0;
      redOv += (redT - redOv) * Math.min(1, dt * 3);
      // шаги
      const sv = phase === 'play' ? vCur : Math.abs(vCur);
      if (sv > 0.3) stepPh += dt * Math.min(11, 0.75 * sv + 0.8);
      scroll(dz, dt, phase === 'play');
    };

    // ---- рисование ----
    let _bx = 0, _by = 0, _s = 1;
    const R = (dx, dy, w, hh) => {
      const x0 = Math.round(_bx + dx * _s), y0 = Math.round(_by + dy * _s);
      const x1 = Math.round(_bx + (dx + w) * _s), y1 = Math.round(_by + (dy + hh) * _s);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    };

    // небо, солнце, холмы и деревня вдали — статичный слой, рисуется один раз (если есть offscreen-холст)
    const SKYPAD = 40;
    let skyLayer = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') skyLayer = new OffscreenCanvas(W + SKYPAD * 2, HOR + 1);
      else if (typeof document !== 'undefined') { skyLayer = document.createElement('canvas'); skyLayer.width = W + SKYPAD * 2; skyLayer.height = HOR + 1; }
    } catch (e) { skyLayer = null; }
    const paintSky = (c, ox) => {
      const SW = W + SKYPAD * 2;
      const SKY = RT.sky;
      const band = HOR / SKY.length;
      for (let i = 0; i < SKY.length; i++) {
        c.fillStyle = SKY[i];
        c.fillRect(0, Math.floor(i * band), SW, Math.ceil(band) + 1);
      }
      // низкое солнце
      const sx = ox + W / 2 + 38, sy = HOR - 8;
      c.fillStyle = RT.sunGlow;
      c.fillRect(sx - 14, sy - 14, 28, 28);
      c.fillStyle = RT.sun;
      for (let y = -9; y <= 9; y++) {
        const w = Math.round(Math.sqrt(81 - y * y));
        if (sy + y < HOR) c.fillRect(sx - w, sy + y, w * 2, 1);
      }
      c.fillStyle = RT.sunHi;
      c.fillRect(sx - 4, sy - 5, 6, 3);
      // холмы
      c.fillStyle = RT.hill;
      for (let i = 0; i < hills.length; i++) {
        const y = Math.floor(hills[i]);
        c.fillRect(ox + i * 2 - 20, y, 2, HOR - y + 1);
      }
      // деревня вдали (цель побега)
      for (const fh of farHouses) {
        const x = ox + fh.x;
        c.fillStyle = RT.house;
        c.fillRect(x, HOR - fh.h, fh.w, fh.h + 1);
        c.fillRect(x + 1, HOR - fh.h - 2, fh.w - 2, 2);
        if (fh.lit) { c.fillStyle = RT.win; c.fillRect(x + 2, HOR - fh.h + 1, 1, 1); }
      }
    };
    const drawSky = (cx) => {
      const off = Math.round((cx - W / 2) * 0.3);
      if (skyLayer && !skyReady) {
        const c = skyLayer.getContext('2d');
        if (c) { paintSky(c, SKYPAD); skyReady = true; } else skyLayer = null;
      }
      if (skyReady) ctx.drawImage(skyLayer, off - SKYPAD, 0);
      else paintSky(ctx, off);
      // мерцающие звёзды вверху
      ctx.fillStyle = RT.star;
      for (let i = 0; i < 26; i++) {
        const sx = (i * 73 + 11) % W, sy = (i * 37) % 26 + 2;
        if (((clock * 2 + i) | 0) % 7 !== 0) ctx.fillRect(sx, sy, 1, 1);
      }
      // птицы
      ctx.fillStyle = RT.bird;
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        if (!b.on) continue;
        const x = Math.round(b.x), y = Math.round(b.y);
        const up = ((clock * 7 + b.ph) | 0) & 1;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x - 2, y + (up ? -1 : 1), 2, 1);
        ctx.fillRect(x + 1, y + (up ? -1 : 1), 2, 1);
      }
    };

    const drawGround = (cx) => {
      // трава: сплошные полосы, склеенные по одинаковому цвету
      let bandC = null, bandY = HOR + 1;
      for (let y = HOR + 1; y <= H; y++) {
        let c = null;
        if (y < H) {
          const s = (y - HOR) / (PY - HOR);
          const z = ZK / s - ZK;
          const f = Math.max(0, Math.min(FOG - 1, Math.floor((z / FAR) * FOG)));
          c = RCc.GRASSC[f][Math.floor((z + roadPos) / 2.5) & 1];
        }
        if (c !== bandC) {
          if (bandC) { ctx.fillStyle = bandC; ctx.fillRect(0, bandY, W, y - bandY); }
          bandC = c; bandY = y;
        }
      }
      for (let y = HOR + 1; y < H; y++) {
        const s = (y - HOR) / (PY - HOR);
        const z = ZK / s - ZK;
        const f = Math.max(0, Math.min(FOG - 1, Math.floor((z / FAR) * FOG)));
        const st = Math.floor((z + roadPos) / 2.5) & 1;
        const hw = Math.round(1.5 * LW * s + 3 * s);
        ctx.fillStyle = RCc.EDGE[f][0];
        ctx.fillRect(cx - hw - Math.max(1, Math.round(3 * s)), y, hw * 2 + Math.max(2, Math.round(6 * s)), 1);
        ctx.fillStyle = RCc.ROAD[f][st];
        ctx.fillRect(cx - hw, y, hw * 2, 1);
        if ((Math.floor((z + roadPos) / 3.2) & 1) === 0) {
          ctx.fillStyle = RCc.LINE[f][0];
          const lw = Math.max(1, Math.round(2 * s));
          const o = Math.round(0.5 * LW * s);
          ctx.fillRect(cx - o - (lw >> 1), y, lw, 1);
          ctx.fillRect(cx + o - (lw >> 1), y, lw, 1);
        }
      }
    };

    const drawGap = (e, cx) => {
      const zn = Math.max(-1.5, e.z), zf = e.z + e.len;
      if (zf < -1.5) return;
      const yN = Math.min(H - 1, Math.round(projY(proj(zn))));
      const yF = Math.round(projY(proj(zf)));
      for (let y = yF; y <= yN; y++) {
        const s = (y - HOR) / (PY - HOR);
        if (s <= 0) continue;
        const x = cx + (e.lane - 1) * LW * s;
        const hw = Math.round(LW * s * 0.48);
        ctx.fillStyle = y - yF < Math.max(1, Math.round(3 * s)) ? RT.gap[0] : RT.gap[1];
        ctx.fillRect(Math.round(x) - hw, y, hw * 2, 1);
      }
      // кромка у ближнего края
      if (e.z > -1.5) {
        const s = proj(e.z);
        const x = cx + (e.lane - 1) * LW * s;
        ctx.fillStyle = RT.gap[2];
        ctx.fillRect(Math.round(x - LW * s * 0.48), yN, Math.round(LW * s * 0.96), Math.max(1, Math.round(2 * s)));
      }
    };

    const drawCartBody = (tilt) => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; R(-20, -2, 40, 3);
      const cc = RT.cart, hy = RT.hay;
      ctx.fillStyle = cc[0]; R(-19, -20 + tilt, 38, 14);
      ctx.fillStyle = cc[1]; R(-17, -18 + tilt, 34, 10);
      ctx.fillStyle = cc[2]; R(-19, -14 + tilt, 38, 1); R(-6, -20 + tilt, 2, 14); R(4, -20 + tilt, 2, 14);
      ctx.fillStyle = hy[0]; R(-16, -25 + tilt, 32, 5); // груз
      ctx.fillStyle = hy[1]; R(-12, -27 + tilt, 22, 2);
      ctx.fillStyle = '#2a1e16'; R(-17, -7, 8, 7); R(9, -7, 8, 7);
      ctx.fillStyle = '#7a7a84'; R(-15, -5, 4, 3); R(11, -5, 4, 3);
    };

    // стражник заставы (лицом к камере)
    const drawGateGuard = (x, push) => {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; R(x - 7, -1, 14, 2);
      ctx.fillStyle = '#2a2228'; R(x - 4, -8, 3, 8); R(x + 1, -8, 3, 8);
      ctx.fillStyle = '#7a2a2e'; R(x - 6, -24, 12, 16);
      ctx.fillStyle = '#5a1e22'; R(x - 6, -12, 12, 2);
      ctx.fillStyle = '#9aa4b2'; R(x - 6, -24, 12, 3);
      ctx.fillStyle = '#d8b08a'; R(x - 4, -32, 8, 8);
      ctx.fillStyle = '#2a1e1e'; R(x - 3, -29, 2, 1); R(x + 1, -29, 2, 1);
      ctx.fillStyle = '#8a94a2'; R(x - 5, -34, 10, 3);
      ctx.fillStyle = '#b8c2ce'; R(x - 3, -36, 6, 2);
      if (push) { ctx.fillStyle = '#7a2a2e'; R(x - 9, -21, 18, 3); ctx.fillStyle = '#d8b08a'; R(x - 10, -21, 2, 3); R(x + 8, -21, 2, 3); }
      ctx.fillStyle = '#6a4a2c'; R(x + 7, -46, 2, 46);
      ctx.fillStyle = '#c8d0dc'; R(x + 7, -50, 2, 4);
    };

    const drawGate = (e) => {
      const d = e.doors;
      // частокол по обе стороны
      ctx.fillStyle = '#4e3420'; R(-272, -58, 180, 58); R(92, -58, 180, 58);
      ctx.fillStyle = '#3a2616';
      for (let x = -272; x < -92; x += 9) { R(x, -58, 1, 58); }
      for (let x = 92; x < 272; x += 9) { R(x, -58, 1, 58); }
      ctx.fillStyle = '#5e4028';
      for (let x = -270; x < -92; x += 9) R(x + 1, -62, 6, 4);
      for (let x = 94; x < 272; x += 9) R(x + 1, -62, 6, 4);
      // стражники толкают створки
      const pushing = d > 0 && d < 1;
      drawGateGuard(-80 + 66 * d, pushing);
      drawGateGuard(80 - 66 * d, pushing);
      // низкие створки ворот
      if (d > 0.01) {
        const dw = 88 * d;
        ctx.fillStyle = '#7a5230'; R(-88, -17, dw, 17); R(88 - dw, -17, dw, 17);
        ctx.fillStyle = '#9a6e40'; R(-88, -17, dw, 2); R(88 - dw, -17, dw, 2);
        ctx.fillStyle = '#5a3a20'; R(-88, -9, dw, 2); R(88 - dw, -9, dw, 2);
        for (let x = 8; x < dw; x += 10) { R(-88 + x, -15, 1, 15); R(88 - x, -15, 1, 15); }
      }
      // столбы, перекладина, кровля
      ctx.fillStyle = '#5a3c22'; R(-98, -88, 10, 88); R(88, -88, 10, 88);
      ctx.fillStyle = '#7a5434'; R(-98, -88, 2, 88); R(88, -88, 2, 88);
      ctx.fillStyle = '#5a3c22'; R(-104, -94, 208, 8);
      ctx.fillStyle = '#6a3a2a'; R(-110, -100, 220, 6);
      ctx.fillStyle = '#8a4a34'; R(-110, -100, 220, 1);
      // фонари
      ctx.fillStyle = pickA(RC[0].GLOW, 0.6 + 0.4 * Math.sin(clock * 7)); R(-112, -70, 20, 18); R(92, -70, 20, 18);
      ctx.fillStyle = '#ffc860'; R(-104, -64, 4, 5); R(100, -64, 4, 5);
    };

    const drawWalker = (e) => {
      const pal = WALK_ROBES[Math.floor(e.v * WALK_ROBES.length) % WALK_ROBES.length];
      const step = ((clock * 3 + e.v * 5) | 0) & 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; R(-7, -1, 14, 2);
      ctx.fillStyle = '#3c2c22'; R(-4, -6 - step, 3, 6 + step); R(1, -6 - (1 - step), 3, 6 + (1 - step));
      ctx.fillStyle = pal[0]; R(-6, -22, 12, 16);
      ctx.fillStyle = pal[1]; R(-6, -18, 12, 4); R(-1, -14, 2, 8);
      ctx.fillStyle = '#c8946e'; R(-4, -30, 8, 8);
      ctx.fillStyle = '#4a3020'; R(-4, -30, 8, 2);
      ctx.fillStyle = '#2a4a2a'; R(-3, -27, 2, 1); R(1, -27, 2, 1);
      ctx.fillStyle = '#a8744e'; R(-1, -26, 2, 4);
      if (e.waveT > 0) {
        const up = ((clock * 6) | 0) & 1;
        ctx.fillStyle = pal[0]; R(6, -24, 2, 4);
        ctx.fillStyle = '#c8946e'; R(6 + up, -32, 2, 8);
      }
    };

    // придорожный декор: свой у каждого маршрута
    const drawDeco = (e) => {
      const k = RT.kind, T = RT.tree, B = RT.bush, Pc = RT.post;
      if (e.deco === 'tree') {
        if (k === 0) {
          ctx.fillStyle = T[0]; R(-3, -22, 6, 22);
          ctx.fillStyle = e.v > 0.5 ? T[1] : T[2]; R(-16, -58, 32, 38);
          ctx.fillStyle = T[3]; R(-16, -30, 32, 6); R(-12, -64, 24, 6);
          ctx.fillStyle = T[4]; R(-10, -54, 10, 8);
        } else if (k === 1) {
          // сухая ива с мхом
          ctx.fillStyle = T[0]; R(-3, -46, 6, 46); R(-14, -44, 12, 3); R(3, -38, 13, 3); R(-14, -44, 3, 10); R(13, -38, 3, 8);
          ctx.fillStyle = T[1]; R(-15, -34, 2, 10); R(14, -30, 2, 12); R(-2, -50, 4, 6);
          ctx.fillStyle = T[4]; R(-15, -26, 1, 6); R(15, -20, 1, 6); R(-8, -42, 1, 8); R(8, -36, 1, 9);
        } else if (k === 2) {
          // ель в снегу
          ctx.fillStyle = T[0]; R(-2, -12, 4, 12);
          for (let i = 0; i < 4; i++) {
            const w = 26 - i * 6, y = -18 - i * 12;
            ctx.fillStyle = e.v > 0.5 ? T[1] : T[2]; R(-w / 2, y, w, 10);
            ctx.fillStyle = T[4]; R(-w / 2, y, w, 2);
          }
          ctx.fillStyle = T[4]; R(-2, -68, 4, 4);
        } else if (k === 3) {
          // кактус
          ctx.fillStyle = T[1]; R(-4, -44, 8, 44);
          ctx.fillStyle = T[0]; R(-16, -30, 4, 14); R(-16, -18, 12, 4); R(12, -36, 4, 12); R(4, -26, 12, 4);
          ctx.fillStyle = T[4]; R(-2, -42, 2, 40); R(-15, -29, 1, 12);
          if (e.v > 0.7) { ctx.fillStyle = '#ff7aa0'; R(-2, -48, 4, 4); }
        } else {
          // обломок колонны
          const hh = 30 + Math.round(e.v * 24);
          ctx.fillStyle = T[3]; R(-9, -hh, 18, hh);
          ctx.fillStyle = T[1]; R(-7, -hh, 14, hh);
          ctx.fillStyle = T[4]; R(-7, -hh, 3, hh); R(-11, -6, 22, 6);
          ctx.fillStyle = T[0]; R(-9, -hh - 3, 8, 3); R(2, -hh - 6, 5, 6);
          ctx.fillStyle = RT.lampC; R(-1, -hh + 10, 2, 2);
        }
      } else if (e.deco === 'post') {
        ctx.fillStyle = Pc[0]; R(-2, -14, 4, 14); R(-12, -12, 24, 3);
        ctx.fillStyle = Pc[1]; R(-12, -7, 24, 2);
        if (k === 2) { ctx.fillStyle = '#ffffff'; R(-12, -13, 24, 1); R(-2, -16, 4, 2); }
      } else if (e.deco === 'bush') {
        if (k === 1) {
          // камыш
          ctx.fillStyle = B[0];
          for (let i = -8; i <= 8; i += 3) R(i, -16 - ((i * 7) & 3) * 2, 1, 16 + ((i * 7) & 3) * 2);
          ctx.fillStyle = B[2]; R(-5, -20, 2, 5); R(4, -22, 2, 5);
        } else if (k === 4) {
          ctx.fillStyle = B[0]; R(-10, -6, 20, 6); R(-6, -9, 10, 3);
          const fl = (((clock * 5 + e.v * 9) | 0) & 1);
          ctx.fillStyle = fl ? B[1] : B[2]; R(-4, -7, 2, 2); R(3, -5, 2, 2);
        } else {
          ctx.fillStyle = B[0]; R(-10, -10, 20, 10);
          ctx.fillStyle = B[1]; R(-7, -14, 12, 5);
          if (e.v > 0.6) { ctx.fillStyle = B[2]; R(-4, -9, 2, 2); R(3, -6, 2, 2); }
        }
      } else {
        const fl = 0.7 + 0.3 * Math.sin(clock * 9 + e.v * 20);
        if (k === 1) {
          // блуждающий огонёк
          const yy = -26 + Math.sin(clock * 1.7 + e.v * 9) * 5;
          ctx.fillStyle = pickA(RCc.GLOW, fl); R(-7, yy - 7, 14, 14);
          ctx.fillStyle = RT.lampC; R(-1, yy - 1, 3, 3);
        } else {
          ctx.fillStyle = k === 4 ? '#2a2226' : '#3a2a1e'; R(-1, -34, 2, 34); R(-1, -34, 7, 2);
          ctx.fillStyle = pickA(RCc.GLOW, fl * (0.85 + 0.15 * dark)); R(-4, -38, 18, 16);
          ctx.fillStyle = RT.lampC; R(4, -32, 3, 4);
        }
      }
    };

    const drawEnt = (e, cx) => {
      if (e.z < -3 || e.z > FAR + 10) return;
      const s = proj(e.z);
      _s = s;
      _by = projY(s);
      if (e.fade < 1) ctx.globalAlpha = Math.max(0, e.fade);
      if (e.k === 'deco') {
        _bx = cx + e.side * (e.off * LW) * s;
        if (_bx > -60 && _bx < W + 60) drawDeco(e);
      } else if (e.k === 'gate' || e.k === 'gateOld') {
        _bx = cx;
        drawGate(e);
      } else {
        const ln = e.mag > 0 ? e.lane + (laneX - e.lane) * e.mag : e.lane;
        _bx = cx + (ln - 1) * LW * s;
        if (e.k === 'walker') drawWalker(e);
        else if (e.k === 'ocart') {
          // телега обгоняет: лошадь впереди, возница на сене
          ctx.fillStyle = '#6a4428'; R(4, -38, 7, 9);
          ctx.fillStyle = '#4a2e1a'; R(4, -40, 2, 3); R(9, -40, 2, 3);
          drawCartBody(0);
          ctx.fillStyle = '#4a6a3a'; R(-6, -35, 11, 9);
          ctx.fillStyle = '#4a3020'; R(-4, -42, 7, 7);
        } else if (e.k === 'fence') {
          const fc = RT.fence;
          if (e.hit) {
            ctx.fillStyle = fc[0]; R(-20, -10, 4, 10); R(16, -6, 4, 6);
            ctx.fillStyle = fc[1]; R(-16, -5, 10, 3); R(6, -3, 10, 3);
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; R(-22, -1, 44, 2);
            ctx.fillStyle = fc[0]; R(-20, -12, 4, 12); R(-2, -12, 4, 12); R(16, -12, 4, 12);
            ctx.fillStyle = fc[1]; R(-22, -11, 44, 3); R(-22, -5, 44, 3);
            ctx.fillStyle = fc[2]; R(-22, -11, 44, 1);
          }
        } else if (e.k === 'beam') {
          const bc = RT.beam;
          ctx.fillStyle = bc[0]; R(-23, -30, 3, 30); R(20, -30, 3, 30);
          ctx.fillStyle = bc[1]; R(-25, -26, 50, 7);
          ctx.fillStyle = bc[2]; R(-25, -26, 50, 2);
          ctx.fillStyle = bc[3];
          for (let i = -20; i < 20; i += 9) R(i, -21, 4, 1);
          // листва / сосульки / угли на балке
          ctx.fillStyle = bc[4]; R(-14, -19, 4, 3); R(6, -19, 3, 4);
        } else if (e.k === 'cart') {
          drawCartBody(e.hit ? 4 : 0);
        } else if (e.k === 'gem') {
          if (!e.hit) {
            const ph = Math.floor(clock * 8 + e.z) & 3;
            const w = ph === 0 ? 6 : ph === 2 ? 2 : 4;
            _by -= (e.mag > 0 ? e.hgt + (h + 8 - e.hgt) * e.mag : e.hgt) * s;
            ctx.fillStyle = 'rgba(47,211,106,0.25)'; R(-5, -14, 10, 14);
            ctx.fillStyle = '#17914a'; R(-w / 2, -11, w, 8);
            ctx.fillStyle = '#2fd36a'; R(-w / 2, -12, w, 6); R(-w / 2 + 1, -13, Math.max(1, w - 2), 12);
            ctx.fillStyle = '#b8ffd0'; R(-w / 2 + 1, -11, 1, 2);
          }
        } else if (e.k === 'boots') {
          if (!e.hit) {
            _by -= e.hgt * s + Math.sin(clock * 5) * 2 * s;
            ctx.fillStyle = 'rgba(98,216,255,0.25)'; R(-9, -18, 18, 18);
            ctx.fillStyle = '#8a5a32'; R(-4, -15, 4, 10); R(-4, -7, 9, 4);
            ctx.fillStyle = '#4a2e18'; R(-5, -3, 11, 2);
            ctx.fillStyle = '#62d8ff'; R(-6, -12, 2, 2); R(5, -9, 2, 2); R(1, -17, 2, 2);
          }
        } else if (e.k === 'magnet') {
          if (!e.hit) {
            _by -= e.hgt * s + Math.sin(clock * 5) * 2 * s;
            ctx.fillStyle = 'rgba(255,120,120,0.25)'; R(-9, -18, 18, 18);
            ctx.fillStyle = '#d84a4a'; R(-6, -15, 12, 4); R(-6, -15, 4, 11); R(2, -15, 4, 11);
            ctx.fillStyle = '#e8eef4'; R(-6, -5, 4, 3); R(2, -5, 4, 3);
            ctx.fillStyle = '#ffe070'; R(-1, -18, 2, 2); R(7, -10, 2, 2);
          }
        }
      }
      if (e.fade < 1) ctx.globalAlpha = 1;
    };

    // погода маршрута: снег, угли, туман
    const drawWeather = () => {
      const k = RT.kind;
      if (k === 2) {
        ctx.fillStyle = SNOWC;
        for (let i = 0; i < 40; i++) {
          const x = ((i * 97 + clock * (8 + (i % 5) * 3)) % (W + 20)) - 10 + Math.sin(clock + i) * 4;
          const y = ((i * 53 + clock * (14 + (i % 7) * 2)) % (H + 10)) - 5;
          ctx.fillRect(Math.round(x), Math.round(y), (i & 3) === 0 ? 2 : 1, (i & 3) === 0 ? 2 : 1);
        }
      } else if (k === 4) {
        for (let i = 0; i < 24; i++) {
          const u = ((clock * (0.12 + (i % 5) * 0.03) + i * 0.137) % 1);
          const x = (i * 131) % W + Math.sin(clock * 2 + i) * 6;
          const y = H - u * (H - 20);
          ctx.fillStyle = u < 0.5 ? '#ffb050' : '#ff6a2a';
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      } else if (k === 1) {
        ctx.fillStyle = pickA(MIST, 0.6 + 0.2 * Math.sin(clock * 0.4));
        ctx.fillRect(0, HOR - 6, W, 14);
        ctx.fillStyle = pickA(MIST, 0.35);
        ctx.fillRect(0, HOR + 8, W, 10);
      } else if (k === 3) {
        // пыль по дороге
        ctx.fillStyle = 'rgba(240,210,160,0.5)';
        for (let i = 0; i < 10; i++) {
          const x = ((i * 71 + clock * 30) % (W + 40)) - 20, y = 120 + (i * 13) % 50;
          ctx.fillRect(Math.round(x), y, 3, 1);
        }
      }
    };

    const drawPlayer = (cx) => {
      let x = Math.round(cx + (laneX - 1) * LW);
      if (pose === P_WRIG) x += (((clock * 9) | 0) & 1) ? 2 : -2;
      const ground = PY;
      // тень
      const sw = Math.max(6, 14 - Math.round(h / 4));
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - (sw >> 1), ground - 1, sw, 3);
      if (invuln > 0 && (Math.floor(clock * 14) & 1) && phase === 'play') return;
      const y = Math.round(ground - h);
      const u = PU;
      const robe = '#5a74b4', robeD = '#3e5490', skin = '#e8be96', hair = '#5a3a22', legs = '#3c2c22';
      if (slide > 0 && h <= 0 && phase === 'play') {
        // подкат: низкий силуэт
        ctx.fillStyle = legs; ctx.fillRect(x - 3 * u, y - 2 * u, 2 * u, 2 * u); ctx.fillRect(x + u, y - 2 * u, 2 * u, 2 * u);
        ctx.fillStyle = robe; ctx.fillRect(x - 3 * u, y - 6 * u, 6 * u, 4 * u);
        ctx.fillStyle = robeD; ctx.fillRect(x - 3 * u, y - 4 * u, 6 * u, u);
        ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - 9 * u, 4 * u, 3 * u);
        ctx.fillStyle = skin; ctx.fillRect(x - 4 * u, y - 5 * u, u, 2 * u); ctx.fillRect(x + 3 * u, y - 5 * u, u, 2 * u);
        // пыль
        if ((Math.floor(clock * 20) & 3) === 0) puff(x + (rand() - 0.5) * 12, y - 1, 1, '#b89a70', 20);
        return;
      }
      if (pose === P_BREATH) {
        // отдышка: согнулся, руки на коленях
        const b = (((clock * 2.2) | 0) & 1);
        ctx.fillStyle = legs; ctx.fillRect(x - 3 * u, y - 3 * u, u, 3 * u); ctx.fillRect(x + 2 * u, y - 3 * u, u, 3 * u);
        ctx.fillStyle = robe; ctx.fillRect(x - 3 * u, y - (8 - b) * u, 6 * u, 5 * u);
        ctx.fillStyle = robeD; ctx.fillRect(x - u / 2, y - (8 - b) * u, u, 5 * u);
        ctx.fillStyle = skin; ctx.fillRect(x - 4 * u, y - 5 * u, u, 2 * u); ctx.fillRect(x + 3 * u, y - 5 * u, u, 2 * u);
        ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - (11 - b) * u, 4 * u, 3 * u);
        return;
      }
      const moving = pose === P_WALK || pose === P_RUN;
      const st = moving && h <= 0 ? (stepPh | 0) & 1 : 0;
      const air = h > 0;
      // ноги
      ctx.fillStyle = legs;
      if (air) { ctx.fillRect(x - 2 * u, y - 3 * u, u, 2 * u); ctx.fillRect(x + u, y - 3 * u, u, 2 * u); }
      else {
        ctx.fillRect(x - 2 * u, y - (st ? 3 : 2) * u, u, 2 * u);
        ctx.fillRect(x + u, y - (st ? 2 : 3) * u, u, 2 * u);
        if (!moving) { ctx.fillRect(x - 2 * u, y - 3 * u, u, 3 * u); ctx.fillRect(x + u, y - 3 * u, u, 3 * u); }
      }
      // мантия (вид со спины)
      ctx.fillStyle = robe; ctx.fillRect(x - 3 * u, y - 9 * u, 6 * u, 7 * u);
      ctx.fillStyle = robeD; ctx.fillRect(x - 3 * u, y - 6 * u, 6 * u, u); ctx.fillRect(x - u / 2, y - 9 * u, u, 7 * u);
      // руки
      ctx.fillStyle = skin;
      if (pose === P_WAVE) {
        const wv = ((clock * 6) | 0) & 1;
        ctx.fillRect(x - 4 * u, y - 8 * u, u, 3 * u);
        ctx.fillRect(x + 3 * u + wv, y - 14 * u, u, 4 * u);
      } else if (pose === P_WRIG) {
        const a = ((clock * 9) | 0) & 1;
        ctx.fillRect(x - 4 * u, y - (a ? 14 : 12) * u, u, 4 * u);
        ctx.fillRect(x + 3 * u, y - (a ? 12 : 14) * u, u, 4 * u);
      } else {
        const as = air ? -2 : pose === P_RUN ? (st ? 1 : -1) : pose === P_WALK ? (st ? 0 : -1) : -1;
        ctx.fillRect(x - 4 * u, y - (8 - as) * u, u, 3 * u);
        ctx.fillRect(x + 3 * u, y - (8 + as) * u, u, 3 * u);
      }
      // голова
      ctx.fillStyle = skin; ctx.fillRect(x - 2 * u, y - 13 * u, 4 * u, 4 * u);
      if (pose === P_LOOK) {
        // обернулся: лицо к нам
        ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - 14 * u, 4 * u, 2 * u);
        ctx.fillStyle = '#2a4a2a'; ctx.fillRect(x - 2 * u, y - 12 * u, u, u); ctx.fillRect(x + u, y - 12 * u, u, u);
        ctx.fillStyle = '#c8946e'; ctx.fillRect(x - u / 2, y - 11 * u, u, 2 * u + 2);
      } else if (pose === P_SIDE) {
        // смотрит в сторону: виден профиль и нос
        const sd = lookSide;
        ctx.fillStyle = hair;
        ctx.fillRect(x - 2 * u, y - 14 * u, 4 * u, 2 * u);
        ctx.fillRect(sd > 0 ? x - 2 * u : x, y - 12 * u, 2 * u, 2 * u);
        ctx.fillStyle = '#2a4a2a'; ctx.fillRect(sd > 0 ? x + u : x - 2 * u, y - 12 * u, u, u);
        ctx.fillStyle = '#c8946e'; ctx.fillRect(sd > 0 ? x + 2 * u : x - 3 * u, y - 11 * u, u, 2 * u);
      } else {
        ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - 13 * u, 4 * u, 3 * u);
        ctx.fillRect(x - 2 * u, y - 14 * u, 4 * u, u);
      }
      if (exclT > 0) drawText(ctx, '!', x - 1, y - 40, '#ffe08a', 2);
      if (bootsT > 0 && phase === 'play') {
        ctx.fillStyle = (Math.floor(clock * 8) & 1) ? '#62d8ff' : '#3aa8d8';
        ctx.fillRect(x - 3 * u, y - u, 2 * u, u); ctx.fillRect(x + u, y - u, 2 * u, u);
      }
    };

    const drawZombie = (x, y, sc, ph) => {
      // вид спереди: тянутся вперёд к камере (кисти по бокам на уровне груди)
      const u = sc;
      const bob = Math.round(Math.sin(ph) * u * 0.6);
      y += bob;
      ctx.fillStyle = ZOMBIE_PANTS; ctx.fillRect(x - 2 * u, y - 3 * u, 2 * u, 3 * u); ctx.fillRect(x + u, y - 3 * u, 2 * u, 3 * u);
      ctx.fillStyle = ZOMBIE_SHIRT; ctx.fillRect(x - 3 * u, y - 10 * u, 7 * u, 7 * u);
      ctx.fillStyle = ZOMBIE_SHIRT_D; ctx.fillRect(x - 3 * u, y - 4 * u, 2 * u, u); ctx.fillRect(x + 2 * u, y - 5 * u, u, 2 * u); ctx.fillRect(x, y - 4 * u, u, u);
      ctx.fillStyle = ZOMBIE_DARK; ctx.fillRect(x - u, y - 6 * u, u, u);
      // руки вперёд
      const reach = Math.round(Math.sin(ph * 1.3) * u);
      ctx.fillStyle = ZOMBIE_SHIRT; ctx.fillRect(x - 5 * u, y - 10 * u + reach, 2 * u, 3 * u); ctx.fillRect(x + 4 * u, y - 10 * u - reach, 2 * u, 3 * u);
      ctx.fillStyle = ZOMBIE_SKIN; ctx.fillRect(x - 5 * u, y - 7 * u + reach, 2 * u, 2 * u); ctx.fillRect(x + 4 * u, y - 7 * u - reach, 2 * u, 2 * u);
      // голова
      ctx.fillStyle = ZOMBIE_SKIN; ctx.fillRect(x - 2 * u, y - 15 * u, 5 * u, 5 * u);
      ctx.fillStyle = ZOMBIE_DARK; ctx.fillRect(x - 2 * u, y - 15 * u, 5 * u, u); ctx.fillRect(x + 2 * u, y - 13 * u, u, 2 * u);
      ctx.fillStyle = '#1c2418'; ctx.fillRect(x - u, y - 13 * u, u, u); ctx.fillRect(x + u, y - 13 * u, u, u);
      ctx.fillStyle = '#2e3a26'; ctx.fillRect(x - u, y - 11 * u, 3 * u, Math.max(1, u >> 1));
    };

    const drawHorde = () => {
      if (hordeShow < 0.02) return;
      const n = Math.min(1.6, near);
      const hide = Math.round((1 - hordeShow) * 40);
      const waiting = phase === 'wait';
      for (let i = 0; i < horde.length; i++) {
        const z = horde[i];
        const ph = clock * 3 + z.ph;
        const sc = 2 + Math.round(n * 1.2 + z.d * 0.6);
        // в покое из-за края экрана видны только макушки и руки
        let base = H + 22 - Math.round(n * 42) + Math.round(z.d * 6) + Math.round(Math.sin(ph * 0.5) * 3) + hide;
        // после поимки: зомби спотыкаются друг о друга
        if (waiting && ((clock * 0.8 + i * 0.37) % 2.6) < 0.35) base += 8;
        let x = z.x;
        if (n > 0.3) x = x + (W / 2 + camOff - x) * Math.min(0.5, (n - 0.3) * 0.5);
        drawZombie(Math.round(x), base, sc, ph);
      }
    };

    const drawLone = () => {
      if (!lone.on || lone.n <= 0) return;
      const base = H + 30 - Math.round(lone.n * 36);
      const ph = clock * 2;
      drawZombie(Math.round(lone.x), base, 2, ph);
      if (lone.st === 2) drawText(ctx, '?', Math.round(lone.x) - 2, base - 42, '#d8e8c0', 2);
    };

    const drawHUD = () => {
      if (hudA < 0.02) return;
      ctx.globalAlpha = hudA;
      const live = phase === 'play' || phase === 'intro';
      // изумруды
      ctx.fillStyle = 'rgba(20,12,16,0.55)';
      ctx.fillRect(3, 3, 8 + intWidth(gems, 2) + 6, 18);
      drawIcon(ctx, 'emerald', 6, 6, 2);
      drawInt(ctx, gems, 19, 7, '#b8ffd0', 2);
      // счёт справа
      const sc = live ? score() : lastRun;
      const sw = intWidth(sc, 2);
      ctx.fillStyle = 'rgba(20,12,16,0.55)';
      ctx.fillRect(W - sw - 10, 3, sw + 7, 14);
      drawInt(ctx, sc, W - sw - 5, 7, '#2a1810', 2);
      drawInt(ctx, sc, W - sw - 6, 6, '#fff2d0', 2);
      const bv = Math.max(best, sc);
      const bw = intWidth(bv, 1);
      drawIcon(ctx, 'trophy', W - bw - 15, 19, 1);
      drawInt(ctx, bv, W - bw - 5, 20, '#ffd34a', 1);
      // метры забега
      if (!prog.variant) {
        kitIcon(ctx, 'flag', 5, 24);
        drawInt(ctx, runM, 14, 25, '#fff2d0');
        for (let k = 0; k < chances; k++) kitIcon(ctx, 'star', 5 + k * 8, 33);
      }
      let by = chances > 0 ? 43 : 34;
      // сапоги и магнит
      if (bootsT > 0 && phase === 'play') {
        kitIcon(ctx, 'boot', 5, by);
        bar(ctx, 14, by + 2, 32, 3, bootsT / bootsMax, '#62d8ff', '#1a2a34');
        by += 9;
      }
      if (magnetT > 0 && phase === 'play') {
        kitIcon(ctx, 'magnet', 5, by);
        bar(ctx, 14, by + 2, 32, 3, magnetT / magnetMax, '#ff8a8a', '#341a1a');
        by += 9;
      }
      // задания дня
      if (!prog.variant) prog.drawDailies(ctx, 5, by + 3);
      // опасность: орда рядом
      if (phase === 'play' && time - lastStumble < dangerT) {
        const k = 1 - (time - lastStumble) / dangerT;
        if ((Math.floor(clock * 6) & 1) || k < 0.5) drawIcon(ctx, 'skull', W / 2 - 7, 5, 2);
        ctx.fillStyle = '#3a1418'; ctx.fillRect(W / 2 - 20, 20, 40, 3);
        ctx.fillStyle = '#e04848'; ctx.fillRect(W / 2 - 20, 20, Math.round(40 * k), 3);
      }
      // подсказка управления в конце вступления
      if (phase === 'intro') {
        const px = Math.round(playerScreenX());
        drawIcon(ctx, 'left', px - 40, 128, 2);
        drawIcon(ctx, 'right', px + 30, 128, 2);
        drawIcon(ctx, 'up', px - 5, 92, 2);
        drawIcon(ctx, 'down', px - 5, 160, 2);
      }
      ctx.globalAlpha = 1;
      if (phase === 'play' && !prog.variant) {
        drawBookBtn(ctx, 4, H - 13, book.open);
        if (prog.author) drawAuthor(ctx, W - 26, 30);
        // название маршрута в первые секунды забега
        if (time < 3) {
          const lw = labelWidth(RT.name);
          ctx.globalAlpha = Math.min(1, (3 - time) * 2);
          drawLabel(ctx, RT.name, ((W - lw) >> 1) + 1, 31, '#1a1010');
          drawLabel(ctx, RT.name, (W - lw) >> 1, 30, '#ffe8c0');
          ctx.globalAlpha = 1;
        }
      }
    };

    const drawFireflies = () => {
      if (dark < 0.35 || (phase !== 'idle' && phase !== 'outro')) return;
      ctx.fillStyle = '#e8ff90';
      for (let i = 0; i < 8; i++) {
        if (((clock * 0.9 + i * 0.73) % 2.2) > 1.3) continue;
        const x = 120 + ((i * 61) % 190) + Math.sin(clock * 0.6 + i * 2.1) * 10;
        const y = 92 + ((i * 29) % 60) + Math.cos(clock * 0.8 + i) * 5;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    };

    const draw = () => {
      const cx = camX();
      ctx.save();
      if (shake > 0) ctx.translate(Math.round((rand() - 0.5) * 6 * shake * 3), Math.round((rand() - 0.5) * 4 * shake * 3));
      drawSky(cx);
      drawGround(cx);
      for (let i = 0; i < ents.length; i++) if (ents[i].k === 'gap') drawGap(ents[i], cx);
      // от дальних к ближним; игрок — между z>0 и z<=0
      let i = 0;
      for (; i < ents.length && ents[i].z > 0; i++) if (ents[i].k !== 'gap') drawEnt(ents[i], cx);
      drawPlayer(cx);
      for (; i < ents.length; i++) if (ents[i].k !== 'gap') drawEnt(ents[i], cx);
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k];
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      drawLone();
      drawHorde();
      if (phase === 'end' || phase === 'wait' || (phase === 'intro' && introRetry && pt < 0.4)) drawPlayer(cx); // вырывается из толпы — поверх
      // красная виньетка, когда орда близко
      if (near > 0.2) {
        ctx.fillStyle = pickA(VIG, Math.min(1, (near - 0.2) * 0.86));
        ctx.fillRect(0, 0, 6, H); ctx.fillRect(W - 6, 0, 6, H); ctx.fillRect(0, H - 6, W, 6);
      }
      ctx.restore();
      drawWeather();
      if (dark > 0.02) { ctx.fillStyle = pickA(NIGHT, dark); ctx.fillRect(0, 0, W, H); }
      drawFireflies();
      if (redOv > 0.01) { ctx.fillStyle = pickA(RED, redOv / 0.5); ctx.fillRect(0, 0, W, H); }
      drawHUD();
      if (phase !== 'idle') prog.drawToasts(ctx, 46, W);
      book.draw(ctx, 1 / 60);
    };

    // ---- цикл ----
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
        // пауза или «без анимаций» — неподвижный кадр, перерисовываем изредка
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
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.style.touchAction = prevTouch;
    };
  }
};
