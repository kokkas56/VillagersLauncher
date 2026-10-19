// «Побег от зомби» — псевдо-3D раннер с видом из-за спины, три дорожки к горизонту.
import { drawNumber, drawText, textWidth, drawIcon } from './pixfont.js';

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
const DANGER_T = 8; // окно, в котором вторая ошибка = поимка
const BOOTS_T = 8;

const proj = (z) => ZK / (ZK + z);
const projY = (s) => HOR + (PY - HOR) * s;

// предрасчитанные цвета (без аллокаций в кадре)
const FOG = 4;
const mixHex = (a, b, t) => {
  const c = [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const FOGC = [120, 72, 78];
const shades = (c1, c2) => {
  const out = [];
  for (let f = 0; f < FOG; f++) out.push([mixHex(c1, FOGC, f / FOG * 0.85), mixHex(c2, FOGC, f / FOG * 0.85)]);
  return out;
};
const ROAD = shades([150, 112, 72], [136, 100, 64]);
const GRASSC = shades([70, 104, 52], [60, 92, 46]);
const EDGE = shades([96, 70, 44], [96, 70, 44]);
const LINE = shades([176, 140, 96], [176, 140, 96]);
const SKY = ['#241a3e', '#2f1f48', '#3e2450', '#582a54', '#7a3452', '#a2444c', '#c45c44', '#dc7c48'];

const ZOMBIE_SKIN = '#5f8a4e';
const ZOMBIE_DARK = '#4b6e3d';
const ZOMBIE_SHIRT = '#3e6a8e';
const ZOMBIE_SHIRT_D = '#2e5070';
const ZOMBIE_PANTS = '#3a3260';

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
    const best = Math.max(0, Math.floor(Number(api && api.best) || 0));
    const sfx = (n) => { try { api.sfx && api.sfx(n); } catch (e) { /* звук не обязателен */ } };

    // ---- состояние ----
    let mode = 'ready'; // ready | run | caught | over
    let time = 0; // время забега
    let clock = 0; // общее время (анимации)
    let dist = 0;
    let gems = 0;
    let speedMul = 1;
    let nextRow = 0; // дистанция до следующего ряда препятствий
    let nextDecoL = 0;
    let nextDecoR = 0;
    let laneT = 1; // целевая дорожка 0..2
    let laneX = 1; // текущая (плавная)
    let h = 0; // высота прыжка
    let vy = 0;
    let slide = 0;
    let bootsT = 0;
    let invuln = 0;
    let lastStumble = -100;
    let near = 0; // насколько близко орда 0..1
    let shake = 0;
    let caughtT = 0;
    let finalScore = 0;
    let lastPattern = '';

    const ents = []; // {k, lane, z, len, hgt, hit, side, v}
    const parts = [];
    for (let i = 0; i < 48; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, c: '#fff' });
    const puff = (x, y, n, c, spd = 40) => {
      for (const p of parts) {
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
      const e = { k, lane, z, len: 0, hgt: 0, hit: false, side: 0, v: rand() };
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
      if (bootsT <= 0 && t > 10 && rand() < 0.07) {
        const free = [0, 1, 2].find((l) => !ents.some((e) => e.lane === l && Math.abs(e.z - z) < 1 && e.k !== 'gem' && e.k !== 'deco'));
        if (free != null) add('boots', free, z + 6, { hgt: 6 });
      }
    };

    const reset = () => {
      mode = 'run';
      time = 0; dist = 0; gems = 0; speedMul = 1; nextRow = 30; laneT = 1; laneX = 1; h = 0; vy = 0; slide = 0;
      bootsT = 0; invuln = 0; lastStumble = -100; near = 0; shake = 0; caughtT = 0;
      ents.length = 0;
      // декор сразу вдоль дороги
      for (let z = -2; z < FAR; z += 4 + rand() * 4) { addDeco(-1, z); addDeco(1, z + 2); }
      ents.sort((a, b) => b.z - a.z);
    };
    function addDeco(side, z) {
      const r = rand();
      const kind = r < 0.45 ? 'tree' : r < 0.7 ? 'post' : r < 0.88 ? 'bush' : 'lamp';
      add('deco', side < 0 ? -1 : 3, z, { side, v: rand(), deco: kind, off: 2.3 + rand() * (kind === 'tree' ? 1.6 : 0.4) });
    }

    // ---- управление ----
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
    const start = () => {
      if (mode !== 'ready') return;
      mode = 'run';
      sfx('click');
    };
    const isAuto = () => typeof api.auto === 'function' && !!api.auto();
    const act = (a) => {
      if (isAuto()) return;
      if (mode === 'ready') { start(); return; }
      if (mode !== 'run') return;
      if (a === 'L') doLeft();
      else if (a === 'R') doRight();
      else if (a === 'U') doJump();
      else if (a === 'D') doDuck();
    };
    const KEYMAP = {
      ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', Space: 'U', ArrowDown: 'D', KeyS: 'D', Enter: 'S'
    };
    const onKey = (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      if (isAuto()) return;
      if (a === 'S') { if (mode === 'ready') start(); return; }
      act(a);
    };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H };
    };
    let pdown = null;
    const onDown = (e) => {
      e.preventDefault();
      if (mode === 'ready') { start(); pdown = null; return; }
      const p = toLocal(e);
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
    const onCtx = (e) => e.preventDefault();
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('contextmenu', onCtx);

    // ---- логика ----
    const stumble = () => {
      if (invuln > 0 || mode !== 'run') return;
      if (time - lastStumble < DANGER_T) {
        mode = 'caught';
        caughtT = 0;
        finalScore = score();
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
    const playerScreenX = () => camX() + (laneX - 1) * LW;
    const camX = () => Math.round(W / 2 - (laneX - 1) * 14);

    // автоигра: житель сам уворачивается пару секунд, потом спотыкается дважды и орда его ловит
    let autoT = -1;
    const autoPilot = (dt) => {
      if (mode !== 'run') return;
      if (autoT < 0) autoT = 0;
      autoT += dt;
      const lane = Math.round(laneX);
      const ahead = (l, z0, z1) => ents.find((e) => e.lane === l && !e.hit && e.k !== 'gem' && e.k !== 'boots' && e.k !== 'deco' && e.z > z0 && e.z < z1);
      if (autoT < 2.6) {
        const e = ahead(lane, 0, 3.2);
        if (!e) return;
        if (e.k === 'fence' && e.z < 2.2) doJump();
        else if (e.k === 'beam' && e.z < 1.6 && slide <= 0) doDuck();
        else if (e.k === 'cart' || e.k === 'gap') {
          const free = [lane - 1, lane + 1].filter((l) => l >= 0 && l <= 2 && !ahead(l, -1, 4));
          if (free.length) laneT = free[0];
          else if (e.k === 'gap' && e.z < 1.2) doJump();
        }
        return;
      }
      // дальше устал: не уворачивается; если долго не на что наткнуться — спотыкается сам
      if (autoT > 3.6 && time - lastStumble > 1.4 && invuln <= 0) stumble();
      if (autoT > 6.5) { invuln = 0; lastStumble = time; stumble(); }
    };

    const update = (dt) => {
      clock += dt;
      if (isAuto()) autoPilot(dt);
      // частицы
      for (const p of parts) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
      }
      if (shake > 0) shake -= dt;
      if (mode === 'caught') {
        caughtT += dt;
        near = Math.min(1.6, near + dt * 2);
        if (caughtT > 1.3) {
          mode = 'over';
          try { api.over(finalScore); } catch (e) { /* хост */ }
        }
        return;
      }
      if (mode !== 'run') return;
      time += dt;
      speedMul = Math.min(1, speedMul + dt * 0.45);
      const v = speed();
      const dz = v * dt;
      dist += dz;
      if (invuln > 0) invuln -= dt;
      if (bootsT > 0) bootsT -= dt;
      if (slide > 0 && h <= 0) slide -= dt;
      // дорожка
      const d = laneT - laneX;
      const step = dt * 9;
      laneX = Math.abs(d) <= step ? laneT : laneX + Math.sign(d) * step;
      // прыжок
      if (h > 0 || vy > 0) {
        h += vy * dt;
        vy -= GRAV * dt;
        if (h <= 0) { h = 0; vy = 0; if (slide <= 0) sfx('step'); }
      }
      // орда
      const danger = time - lastStumble < DANGER_T;
      const target = danger ? 1 - (time - lastStumble) / DANGER_T * 0.6 : 0;
      near += (target - near) * Math.min(1, dt * 2.5);

      // движение сущностей
      const lane = Math.round(laneX);
      let w = 0;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        const pz = e.z;
        e.z -= dz;
        if (!e.hit && e.lane === lane && mode === 'run') {
          if (e.k === 'gap') {
            if (e.z <= 0.2 && e.z + e.len >= -0.2 && h <= 0.5) { e.hit = true; stumble(); }
          } else if (pz > 0 && e.z <= 0) {
            if (e.k === 'fence' && h < 9) { e.hit = true; stumble(); }
            else if (e.k === 'beam' && (slide <= 0 || h > 0)) { e.hit = true; stumble(); }
            else if (e.k === 'cart' && h < 24) { e.hit = true; stumble(); }
          }
          if ((e.k === 'gem' || e.k === 'boots') && e.z <= 0.7 && e.z > -0.8) {
            const ph = slide > 0 ? 0 : h;
            if (Math.abs(ph + 8 - e.hgt) < 16) {
              e.hit = true;
              const sx = playerScreenX();
              if (e.k === 'gem') { gems++; sfx('coin'); puff(sx, PY - e.hgt - 8, 5, '#7dffaa', 35); }
              else { bootsT = BOOTS_T; sfx('win'); puff(sx, PY - e.hgt - 8, 10, '#62d8ff', 50); }
            }
          }
        }
        if (e.z + e.len > -4) ents[w++] = e;
      }
      ents.length = w;
      // спавн
      nextRow -= dz;
      if (nextRow <= 0) {
        spawnRow();
        const interval = 0.72 + 0.6 * Math.exp(-time / 70);
        nextRow = Math.max(10, v * interval * (0.9 + rand() * 0.35));
      }
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

    // ---- рисование ----
    let _bx = 0, _by = 0, _s = 1;
    const R = (dx, dy, w, hh) => {
      const x0 = Math.round(_bx + dx * _s), y0 = Math.round(_by + dy * _s);
      const x1 = Math.round(_bx + (dx + w) * _s), y1 = Math.round(_by + (dy + hh) * _s);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    };

    // небо, солнце, холмы и деревня вдали — статичный слой, рисуется один раз (если есть offscreen-холст)
    const SKYPAD = 30;
    let skyLayer = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') skyLayer = new OffscreenCanvas(W + SKYPAD * 2, HOR + 1);
      else if (typeof document !== 'undefined') { skyLayer = document.createElement('canvas'); skyLayer.width = W + SKYPAD * 2; skyLayer.height = HOR + 1; }
    } catch (e) { skyLayer = null; }
    let skyReady = false;
    const paintSky = (c, ox) => {
      const SW = W + SKYPAD * 2;
      const band = HOR / SKY.length;
      for (let i = 0; i < SKY.length; i++) {
        c.fillStyle = SKY[i];
        c.fillRect(0, Math.floor(i * band), SW, Math.ceil(band) + 1);
      }
      // низкое солнце
      const sx = ox + W / 2 + 38, sy = HOR - 8;
      c.fillStyle = 'rgba(255,170,90,0.18)';
      c.fillRect(sx - 14, sy - 14, 28, 28);
      c.fillStyle = '#ffb060';
      for (let y = -9; y <= 9; y++) {
        const w = Math.round(Math.sqrt(81 - y * y));
        if (sy + y < HOR) c.fillRect(sx - w, sy + y, w * 2, 1);
      }
      c.fillStyle = '#ffe0a0';
      c.fillRect(sx - 4, sy - 5, 6, 3);
      // холмы
      c.fillStyle = '#4a2c4a';
      for (let i = 0; i < hills.length; i++) {
        const y = Math.floor(hills[i]);
        c.fillRect(ox + i * 2 - 20, y, 2, HOR - y + 1);
      }
      // деревня вдали (цель побега)
      for (const fh of farHouses) {
        const x = ox + fh.x;
        c.fillStyle = '#3a2238';
        c.fillRect(x, HOR - fh.h, fh.w, fh.h + 1);
        c.fillRect(x + 1, HOR - fh.h - 2, fh.w - 2, 2);
        if (fh.lit) { c.fillStyle = '#ffc860'; c.fillRect(x + 2, HOR - fh.h + 1, 1, 1); }
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
      ctx.fillStyle = '#f4e8d0';
      for (let i = 0; i < 26; i++) {
        const sx = (i * 73 + 11) % W, sy = (i * 37) % 26 + 2;
        if (((clock * 2 + i) | 0) % 7 !== 0) ctx.fillRect(sx, sy, 1, 1);
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
          c = GRASSC[f][Math.floor((z + dist) / 2.5) & 1];
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
        const st = Math.floor((z + dist) / 2.5) & 1;
        const hw = Math.round(1.5 * LW * s + 3 * s);
        ctx.fillStyle = EDGE[f][0];
        ctx.fillRect(cx - hw - Math.max(1, Math.round(3 * s)), y, hw * 2 + Math.max(2, Math.round(6 * s)), 1);
        ctx.fillStyle = ROAD[f][st];
        ctx.fillRect(cx - hw, y, hw * 2, 1);
        if ((Math.floor((z + dist) / 3.2) & 1) === 0) {
          ctx.fillStyle = LINE[f][0];
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
        ctx.fillStyle = y - yF < Math.max(1, Math.round(3 * s)) ? '#5a3a22' : '#140c10';
        ctx.fillRect(Math.round(x) - hw, y, hw * 2, 1);
      }
      // кромка у ближнего края
      if (e.z > -1.5) {
        const s = proj(e.z);
        const x = cx + (e.lane - 1) * LW * s;
        ctx.fillStyle = '#7a5434';
        ctx.fillRect(Math.round(x - LW * s * 0.48), yN, Math.round(LW * s * 0.96), Math.max(1, Math.round(2 * s)));
      }
    };

    const drawEnt = (e, cx) => {
      if (e.z < -3 || e.z > FAR + 6) return;
      const s = proj(e.z);
      _s = s;
      _by = projY(s);
      if (e.k === 'deco') {
        _bx = cx + e.side * (e.off * LW) * s;
        if (_bx < -60 || _bx > W + 60) return;
        if (e.deco === 'tree') {
          ctx.fillStyle = '#4a3020'; R(-3, -22, 6, 22);
          ctx.fillStyle = e.v > 0.5 ? '#2e5a32' : '#3a6a34'; R(-16, -58, 32, 38);
          ctx.fillStyle = '#244a2a'; R(-16, -30, 32, 6); R(-12, -64, 24, 6);
          ctx.fillStyle = '#4c7c40'; R(-10, -54, 10, 8);
        } else if (e.deco === 'post') {
          ctx.fillStyle = '#6a4a2c'; R(-2, -14, 4, 14); R(-12, -12, 24, 3);
          ctx.fillStyle = '#4a321e'; R(-12, -7, 24, 2);
        } else if (e.deco === 'bush') {
          ctx.fillStyle = '#2e5a2e'; R(-10, -10, 20, 10);
          ctx.fillStyle = '#3e6e36'; R(-7, -14, 12, 5);
          if (e.v > 0.6) { ctx.fillStyle = '#d04848'; R(-4, -9, 2, 2); R(3, -6, 2, 2); }
        } else {
          ctx.fillStyle = '#3a2a1e'; R(-1, -34, 2, 34); R(-1, -34, 7, 2);
          const fl = 0.7 + 0.3 * Math.sin(clock * 9 + e.v * 20);
          ctx.fillStyle = `rgba(255,180,80,${0.22 * fl})`; R(-4, -38, 18, 16);
          ctx.fillStyle = '#ffc860'; R(4, -32, 3, 4);
        }
        return;
      }
      _bx = cx + (e.lane - 1) * LW * s;
      if (e.k === 'fence') {
        if (e.hit) {
          ctx.fillStyle = '#6a4a2c'; R(-20, -10, 4, 10); R(16, -6, 4, 6);
          ctx.fillStyle = '#8a6438'; R(-16, -5, 10, 3); R(6, -3, 10, 3);
          return;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; R(-22, -1, 44, 2);
        ctx.fillStyle = '#5a3c22'; R(-20, -12, 4, 12); R(-2, -12, 4, 12); R(16, -12, 4, 12);
        ctx.fillStyle = '#9a7040'; R(-22, -11, 44, 3); R(-22, -5, 44, 3);
        ctx.fillStyle = '#b88a52'; R(-22, -11, 44, 1);
      } else if (e.k === 'beam') {
        ctx.fillStyle = '#4a3020'; R(-23, -30, 3, 30); R(20, -30, 3, 30);
        ctx.fillStyle = '#7a5230'; R(-25, -26, 50, 7);
        ctx.fillStyle = '#9a6e40'; R(-25, -26, 50, 2);
        ctx.fillStyle = '#5a3a20';
        for (let i = -20; i < 20; i += 9) R(i, -21, 4, 1);
        // листва на балке
        ctx.fillStyle = '#3a6a34'; R(-14, -19, 4, 3); R(6, -19, 3, 4);
      } else if (e.k === 'cart') {
        const tilt = e.hit ? 4 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; R(-20, -2, 40, 3);
        ctx.fillStyle = '#6a4626'; R(-19, -20 + tilt, 38, 14);
        ctx.fillStyle = '#8a5e34'; R(-17, -18 + tilt, 34, 10);
        ctx.fillStyle = '#5a3a20'; R(-19, -14 + tilt, 38, 1); R(-6, -20 + tilt, 2, 14); R(4, -20 + tilt, 2, 14);
        ctx.fillStyle = '#d8b850'; R(-16, -25 + tilt, 32, 5); // сено
        ctx.fillStyle = '#e8cc68'; R(-12, -27 + tilt, 22, 2);
        ctx.fillStyle = '#2a1e16'; R(-17, -7, 8, 7); R(9, -7, 8, 7);
        ctx.fillStyle = '#7a7a84'; R(-15, -5, 4, 3); R(11, -5, 4, 3);
      } else if (e.k === 'gem') {
        if (e.hit) return;
        const ph = Math.floor(clock * 8 + e.z) & 3;
        const w = ph === 0 ? 6 : ph === 2 ? 2 : 4;
        _by -= e.hgt * s;
        ctx.fillStyle = 'rgba(47,211,106,0.25)'; R(-5, -14, 10, 14);
        ctx.fillStyle = '#17914a'; R(-w / 2, -11, w, 8);
        ctx.fillStyle = '#2fd36a'; R(-w / 2, -12, w, 6); R(-w / 2 + 1, -13, Math.max(1, w - 2), 12);
        ctx.fillStyle = '#b8ffd0'; R(-w / 2 + 1, -11, 1, 2);
      } else if (e.k === 'boots') {
        if (e.hit) return;
        _by -= e.hgt * s + Math.sin(clock * 5) * 2 * s;
        ctx.fillStyle = 'rgba(98,216,255,0.25)'; R(-9, -18, 18, 18);
        ctx.fillStyle = '#8a5a32'; R(-4, -15, 4, 10); R(-4, -7, 9, 4);
        ctx.fillStyle = '#4a2e18'; R(-5, -3, 11, 2);
        ctx.fillStyle = '#62d8ff'; R(-6, -12, 2, 2); R(5, -9, 2, 2); R(1, -17, 2, 2);
      }
    };

    const drawPlayer = (cx) => {
      const x = Math.round(cx + (laneX - 1) * LW);
      const ground = PY;
      // тень
      const sw = Math.max(6, 14 - Math.round(h / 4));
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - (sw >> 1), ground - 1, sw, 3);
      if (invuln > 0 && (Math.floor(clock * 14) & 1) && mode === 'run') return;
      const y = Math.round(ground - h);
      const u = PU;
      const robe = '#5a74b4', robeD = '#3e5490', skin = '#e8be96', hair = '#5a3a22', legs = '#3c2c22';
      if (slide > 0 && h <= 0) {
        // подкат: низкий силуэт
        ctx.fillStyle = legs; ctx.fillRect(x - 3 * u, y - 2 * u, 2 * u, 2 * u); ctx.fillRect(x + u, y - 2 * u, 2 * u, 2 * u);
        ctx.fillStyle = robe; ctx.fillRect(x - 3 * u, y - 6 * u, 6 * u, 4 * u);
        ctx.fillStyle = robeD; ctx.fillRect(x - 3 * u, y - 4 * u, 6 * u, u);
        ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - 9 * u, 4 * u, 3 * u);
        ctx.fillStyle = skin; ctx.fillRect(x - 4 * u, y - 5 * u, u, 2 * u); ctx.fillRect(x + 3 * u, y - 5 * u, u, 2 * u);
        // пыль
        if ((Math.floor(clock * 20) & 3) === 0 && mode === 'run') puff(x + (rand() - 0.5) * 12, y - 1, 1, '#b89a70', 20);
        return;
      }
      const run = mode === 'run' && h <= 0 ? Math.floor(clock * 10) & 1 : 0;
      const air = h > 0;
      // ноги
      ctx.fillStyle = legs;
      if (air) { ctx.fillRect(x - 2 * u, y - 3 * u, u, 2 * u); ctx.fillRect(x + u, y - 3 * u, u, 2 * u); }
      else {
        ctx.fillRect(x - 2 * u, y - (run ? 3 : 2) * u, u, (run ? 2 : 2) * u);
        ctx.fillRect(x + u, y - (run ? 2 : 3) * u, u, 2 * u);
      }
      // мантия (вид со спины)
      ctx.fillStyle = robe; ctx.fillRect(x - 3 * u, y - 9 * u, 6 * u, 7 * u);
      ctx.fillStyle = robeD; ctx.fillRect(x - 3 * u, y - 6 * u, 6 * u, u); ctx.fillRect(x - u / 2, y - 9 * u, u, 7 * u);
      // руки
      ctx.fillStyle = skin;
      const as = air ? -2 : run ? 1 : -1;
      ctx.fillRect(x - 4 * u, y - (8 - as) * u, u, 3 * u);
      ctx.fillRect(x + 3 * u, y - (8 + as) * u, u, 3 * u);
      // голова со спины: волосы
      ctx.fillStyle = skin; ctx.fillRect(x - 2 * u, y - 13 * u, 4 * u, 4 * u);
      ctx.fillStyle = hair; ctx.fillRect(x - 2 * u, y - 13 * u, 4 * u, 3 * u);
      ctx.fillRect(x - 2 * u, y - 14 * u, 4 * u, u);
      if (bootsT > 0) {
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
      const n = Math.min(1.6, near);
      for (let i = 0; i < horde.length; i++) {
        const z = horde[i];
        const ph = clock * 3 + z.ph;
        const sc = 2 + Math.round(n * 1.2 + z.d * 0.6);
        // в покое из-за края экрана видны только макушки и руки
        const base = H + 22 - Math.round(n * 42) + Math.round(z.d * 6) + Math.round(Math.sin(ph * 0.5) * 3);
        let x = z.x;
        if (n > 0.3) x = x + (W / 2 - x) * Math.min(0.5, (n - 0.3) * 0.5);
        drawZombie(Math.round(x), base, sc, ph);
      }
    };

    const drawHUD = () => {
      // изумруды
      ctx.fillStyle = 'rgba(20,12,16,0.55)';
      ctx.fillRect(3, 3, 8 + textWidth(String(gems), 2) + 6, 18);
      drawIcon(ctx, 'emerald', 6, 6, 2);
      drawNumber(ctx, gems, 19, 7, '#b8ffd0', 2);
      // счёт справа
      const sc = mode === 'run' || mode === 'ready' ? score() : finalScore;
      const sw = textWidth(String(sc), 2);
      ctx.fillStyle = 'rgba(20,12,16,0.55)';
      ctx.fillRect(W - sw - 10, 3, sw + 7, 14);
      drawNumber(ctx, sc, W - sw - 5, 7, '#2a1810', 2);
      drawNumber(ctx, sc, W - sw - 6, 6, '#fff2d0', 2);
      const bw = textWidth(String(Math.max(best, sc)), 1);
      drawIcon(ctx, 'trophy', W - bw - 15, 19, 1);
      drawNumber(ctx, Math.max(best, sc), W - bw - 5, 20, '#ffd34a', 1);
      // сапоги
      if (bootsT > 0) {
        drawIcon(ctx, 'boot', 5, 25, 2);
        ctx.fillStyle = '#1a2a34'; ctx.fillRect(21, 31, 32, 4);
        ctx.fillStyle = '#62d8ff'; ctx.fillRect(21, 31, Math.round(32 * bootsT / BOOTS_T), 4);
      }
      // опасность: орда рядом
      if (mode === 'run' && time - lastStumble < DANGER_T) {
        const k = 1 - (time - lastStumble) / DANGER_T;
        if ((Math.floor(clock * 6) & 1) || k < 0.5) drawIcon(ctx, 'skull', W / 2 - 7, 5, 2);
        ctx.fillStyle = '#3a1418'; ctx.fillRect(W / 2 - 20, 20, 40, 3);
        ctx.fillStyle = '#e04848'; ctx.fillRect(W / 2 - 20, 20, Math.round(40 * k), 3);
      }
    };

    const drawReady = () => {
      ctx.fillStyle = 'rgba(16,10,20,0.55)';
      ctx.fillRect(0, 0, W, H);
      // зоны для мыши
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 30, W / 3 - 1, H - 30);
      ctx.fillRect((W * 2) / 3 + 1, 30, W / 3, H - 30);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(W / 3 + 1, 120, W / 3 - 1, H - 120);
      drawIcon(ctx, 'left', 40, 110, 3);
      drawIcon(ctx, 'right', W - 55, 110, 3);
      drawIcon(ctx, 'up', W / 2 - 7, 92, 3);
      drawIcon(ctx, 'down', W / 2 - 7, 150, 3);
      const blink = (Math.floor(clock * 2) & 1) === 0;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a0e08';
      ctx.fillText('Нажми, чтобы начать', W / 2 + 1, 59);
      ctx.fillStyle = blink ? '#ffe7a8' : '#ffd060';
      ctx.fillText('Нажми, чтобы начать', W / 2, 58);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
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
      for (const p of parts) {
        if (!p.on) continue;
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      drawHorde();
      // красная виньетка, когда орда близко
      if (near > 0.2) {
        ctx.fillStyle = `rgba(160,20,30,${Math.min(0.35, (near - 0.2) * 0.3)})`;
        ctx.fillRect(0, 0, 6, H); ctx.fillRect(W - 6, 0, 6, H); ctx.fillRect(0, H - 6, W, 6);
      }
      ctx.restore();
      drawHUD();
      if (mode === 'ready') drawReady();
      if (mode === 'over' || mode === 'caught') {
        ctx.fillStyle = `rgba(20,0,0,${Math.min(0.5, caughtT * 0.4)})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    // ---- цикл ----
    reset();
    let raf = 0;
    let last = performance.now();
    let alive = true;
    const loop = (now) => {
      if (!alive) return;
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.05);
      const paused = typeof api.paused === 'function' && api.paused();
      if (!paused && mode !== 'over') update(dt);
      else if (mode === 'ready') clock += dt;
      draw();
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
