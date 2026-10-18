import React, { useEffect, useRef } from 'react';

// Живая пиксельная деревня на фоне: время суток по часам, сезоны по месяцу,
// бродящие жители, дым из труб, светлячки, листопад/снег, параллакс от мыши.

const H = 180;

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

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ключевые цвета неба: [час, верх, низ]
const SKY = [
  [0, [8, 10, 28], [22, 22, 52]],
  [4.5, [12, 14, 40], [40, 32, 70]],
  [6, [70, 70, 140], [240, 150, 110]],
  [7.5, [110, 160, 225], [250, 210, 160]],
  [12, [90, 160, 235], [190, 225, 250]],
  [17, [100, 150, 220], [240, 210, 170]],
  [19, [70, 60, 130], [245, 130, 80]],
  [20.5, [30, 26, 70], [110, 60, 90]],
  [22, [10, 12, 34], [28, 26, 58]],
  [24, [8, 10, 28], [22, 22, 52]]
];

function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const a = SKY[i], b = SKY[i + 1];
    if (h >= a[0] && h <= b[0]) {
      const t = (h - a[0]) / (b[0] - a[0]);
      return { top: mix(a[1], b[1], t), bottom: mix(a[2], b[2], t) };
    }
  }
  return { top: SKY[0][1], bottom: SKY[0][2] };
}

function darkness(h) {
  // 0 — день, 1 — ночь
  if (h >= 7.5 && h <= 17.5) return 0;
  if (h > 17.5 && h < 21) return (h - 17.5) / 3.5;
  if (h >= 21 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 3;
}

function season(month) {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

const FOLIAGE = {
  spring: [[86, 160, 70], [120, 190, 90], [235, 170, 200]],
  summer: [[60, 130, 50], [86, 160, 64], [70, 140, 56]],
  autumn: [[200, 110, 40], [220, 160, 50], [170, 70, 40]],
  winter: [[70, 100, 80], [230, 238, 245], [200, 215, 230]]
};
const GRASS = { spring: [96, 168, 72], summer: [84, 150, 60], autumn: [140, 140, 60], winter: [226, 234, 242] };

function buildWorld(W, seed) {
  const r = rng(seed);
  const far = [];
  for (let x = 0; x <= W + 40; x += 4) far.push(118 - 22 * Math.sin(x / 47) - 12 * Math.sin(x / 19 + 2) - r() * 3);
  const mid = [];
  for (let x = 0; x <= W + 40; x += 2) mid.push(136 - 8 * Math.sin(x / 33 + 1) - 5 * Math.sin(x / 13) - r() * 1.5);
  const trees = [];
  for (let x = -10; x < W + 30; x += 6 + r() * 14) trees.push({ x, h: 10 + r() * 14, w: 6 + r() * 6, shade: r() });
  const houses = [];
  let x = 18 + r() * 20;
  while (x < W - 30) {
    const w = 22 + Math.floor(r() * 16);
    const h = 16 + Math.floor(r() * 10);
    houses.push({
      x: Math.floor(x), w, h,
      roof: [[150, 60, 44], [110, 70, 50], [70, 90, 110], [120, 50, 60], [90, 70, 40]][Math.floor(r() * 5)],
      wall: [[200, 168, 116], [176, 150, 120], [150, 120, 90], [214, 196, 160]][Math.floor(r() * 4)],
      windows: 1 + Math.floor(r() * 2),
      chimney: r() > 0.35,
      flicker: r() * 10,
      lit: r() > 0.15
    });
    x += w + 26 + r() * 40;
  }
  const lanterns = [];
  for (let lx = 30; lx < W; lx += 60 + r() * 50) lanterns.push({ x: Math.floor(lx), f: r() * 10 });
  const stars = Array.from({ length: Math.floor(W / 3) }, () => ({ x: r() * W, y: r() * 100, s: r(), t: r() * 10 }));
  const clouds = Array.from({ length: 6 }, () => ({ x: r() * W, y: 10 + r() * 50, w: 24 + r() * 40, v: 0.6 + r() * 1.4 }));
  const flowers = Array.from({ length: Math.floor(W / 7) }, () => ({ x: r() * W, y: 166 + r() * 12, c: [[240, 220, 90], [230, 110, 130], [160, 140, 240], [250, 250, 250]][Math.floor(r() * 4)] }));
  const robes = [[120, 80, 50], [70, 90, 140], [150, 60, 60], [80, 120, 70], [140, 120, 80], [110, 70, 120], [190, 170, 120]];
  const folk = Array.from({ length: Math.max(4, Math.floor(W / 70)) }, () => ({
    x: r() * W,
    y: 160 + Math.floor(r() * 8),
    dir: r() > 0.5 ? 1 : -1,
    v: 6 + r() * 6,
    robe: robes[Math.floor(r() * robes.length)],
    hat: r() > 0.5 ? robes[Math.floor(r() * robes.length)] : null,
    skin: [[232, 190, 150], [200, 150, 110], [150, 100, 70], [240, 205, 170]][Math.floor(r() * 4)],
    pause: 0,
    phase: r() * 10,
    carry: r() > 0.7
  }));
  return { far, mid, trees, houses, lanterns, stars, clouds, flowers, folk };
}

export default function VillageScene({ paused, hourOverride, animations = true }) {
  const ref = useRef(null);
  const state = useRef({ mouse: 0, smooth: 0 });
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let W = 320;
    let world = null;
    let raf = 0;
    let last = performance.now();
    let particles = [];
    let smoke = [];

    const resize = () => {
      const ar = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      W = Math.max(240, Math.round(H * ar));
      canvas.width = W;
      canvas.height = H;
      world = buildWorld(W, 1337);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onMove = (e) => { state.current.mouse = (e.clientX / window.innerWidth - 0.5) * 2; };
    window.addEventListener('mousemove', onMove);

    const draw = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const date = new Date();
      const hour = hourOverride != null ? hourOverride : date.getHours() + date.getMinutes() / 60;
      const seas = season(date.getMonth());
      const dark = darkness(hour);
      const sky = skyAt(hour);
      const st = state.current;
      st.smooth += (st.mouse - st.smooth) * Math.min(1, dt * 3);
      const px = (k) => Math.round(-st.smooth * k);
      const t = now / 1000;

      // небо
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(sky.top));
      g.addColorStop(1, rgb(sky.bottom));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // звёзды
      if (dark > 0.2) {
        for (const s of world.stars) {
          const a = (dark - 0.2) * (0.5 + 0.5 * Math.sin(t * (1 + s.s * 2) + s.t));
          ctx.fillStyle = `rgba(255,250,230,${a})`;
          ctx.fillRect(Math.floor(s.x + px(1)), Math.floor(s.y), s.s > 0.9 ? 2 : 1, 1);
        }
      }
      // солнце / луна по дуге
      const dayT = (hour - 6) / 13;
      if (dayT > -0.05 && dayT < 1.05) {
        const sx = W * (0.1 + 0.8 * dayT) + px(2);
        const sy = 110 - Math.sin(Math.PI * Math.max(0, Math.min(1, dayT))) * 90;
        ctx.fillStyle = 'rgba(255,230,150,0.25)';
        ctx.fillRect(sx - 9, sy - 9, 18, 18);
        ctx.fillStyle = '#fff1b8';
        ctx.fillRect(sx - 6, sy - 6, 12, 12);
        ctx.fillStyle = '#ffd86b';
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
      }
      const nightT = ((hour + 24 - 19) % 24) / 11;
      if (nightT >= 0 && nightT <= 1 && dark > 0.1) {
        const mx = W * (0.15 + 0.7 * nightT) + px(2);
        const my = 100 - Math.sin(Math.PI * nightT) * 75;
        ctx.fillStyle = `rgba(220,230,255,${0.15 * dark})`;
        ctx.fillRect(mx - 8, my - 8, 16, 16);
        ctx.fillStyle = `rgba(235,238,250,${dark})`;
        ctx.fillRect(mx - 5, my - 5, 10, 10);
        ctx.fillStyle = `rgba(190,198,220,${dark})`;
        ctx.fillRect(mx - 2, my - 3, 3, 2);
        ctx.fillRect(mx + 1, my + 1, 2, 2);
      }
      // облака
      for (const c of world.clouds) {
        if (animations) c.x += c.v * dt * 2;
        if (c.x > W + 40) c.x = -c.w - 20;
        const cx = Math.floor(c.x + px(3));
        const cc = mix([255, 255, 255], [60, 60, 90], dark);
        ctx.fillStyle = rgb(cc, 0.75);
        ctx.fillRect(cx, Math.floor(c.y), Math.floor(c.w), 5);
        ctx.fillRect(cx + 5, Math.floor(c.y) - 3, Math.floor(c.w * 0.5), 3);
        ctx.fillRect(cx + Math.floor(c.w * 0.4), Math.floor(c.y) - 5, Math.floor(c.w * 0.3), 3);
      }
      // дальние горы
      const farC = mix(mix(sky.bottom, [70, 90, 120], 0.55), [18, 20, 40], dark * 0.7);
      ctx.fillStyle = rgb(farC);
      const o1 = px(4);
      for (let i = 0; i < world.far.length; i++) {
        const y = Math.floor(world.far[i]);
        ctx.fillRect(i * 4 + o1 - 10, y, 4, H - y);
      }
      if (seas === 'winter') {
        ctx.fillStyle = rgb(mix([240, 245, 255], [80, 90, 120], dark), 0.8);
        for (let i = 0; i < world.far.length; i++) {
          const y = Math.floor(world.far[i]);
          if (y < 104) ctx.fillRect(i * 4 + o1 - 10, y, 4, 3);
        }
      }
      // средние холмы с деревьями
      const fol = FOLIAGE[seas];
      const midC = mix(mix(fol[0], [40, 60, 50], 0.4), [14, 18, 30], dark * 0.75);
      const o2 = px(7);
      for (const tr of world.trees) {
        const bx = Math.floor(tr.x + o2);
        const idx = Math.max(0, Math.min(world.mid.length - 1, Math.floor((tr.x + 10) / 2)));
        const by = Math.floor(world.mid[idx]);
        ctx.fillStyle = rgb(mix([70, 50, 36], [16, 14, 20], dark * 0.8));
        ctx.fillRect(bx + Math.floor(tr.w / 2) - 1, by - 4, 2, 6);
        ctx.fillStyle = rgb(mix(mix(fol[0], fol[1], tr.shade), [14, 20, 30], dark * 0.75));
        ctx.fillRect(bx, by - Math.floor(tr.h), Math.floor(tr.w), Math.floor(tr.h) - 3);
        ctx.fillRect(bx + 1, by - Math.floor(tr.h) - 2, Math.floor(tr.w) - 2, 2);
      }
      ctx.fillStyle = rgb(midC);
      for (let i = 0; i < world.mid.length; i++) {
        const y = Math.floor(world.mid[i]);
        ctx.fillRect(i * 2 + o2 - 10, y, 2, H - y);
      }
      // деревня
      const o3 = px(11);
      const groundY = 156;
      for (const h of world.houses) {
        const x = h.x + o3;
        const y = groundY - h.h;
        const wall = mix(h.wall, [24, 22, 34], dark * 0.72);
        const roof = mix(h.roof, [20, 16, 26], dark * 0.7);
        ctx.fillStyle = rgb(mix([60, 46, 36], [14, 12, 18], dark * 0.7));
        ctx.fillRect(x - 1, y, h.w + 2, h.h);
        ctx.fillStyle = rgb(wall);
        ctx.fillRect(x, y + 1, h.w, h.h - 1);
        ctx.fillStyle = rgb(mix(wall, [0, 0, 0], 0.12));
        for (let yy = y + 4; yy < groundY; yy += 4) ctx.fillRect(x, yy, h.w, 1);
        // крыша ступеньками
        const rh = Math.floor(h.w / 2.4);
        for (let i = 0; i < rh; i++) {
          const inset = Math.floor(i * (h.w / 2 + 2) / rh);
          ctx.fillStyle = rgb(i % 3 === 0 ? mix(roof, [0, 0, 0], 0.18) : roof);
          ctx.fillRect(x - 3 + inset, y - i, h.w + 6 - inset * 2, 1);
        }
        if (h.chimney) {
          ctx.fillStyle = rgb(mix([110, 100, 100], [20, 18, 26], dark * 0.7));
          const cx = x + h.w - 7;
          ctx.fillRect(cx, y - rh + 2, 4, rh - 2);
          if (animations && Math.random() < dt * 2.2) smoke.push({ x: cx + 2 - o3, y: y - rh + 1, life: 0, vx: 2 + Math.random() * 2 });
        }
        // дверь и окна
        ctx.fillStyle = rgb(mix([96, 62, 36], [20, 14, 14], dark * 0.6));
        const dx = x + Math.floor(h.w / 2) - 2;
        ctx.fillRect(dx, groundY - 8, 5, 8);
        const lit = h.lit && dark > 0.25;
        const fl = 0.85 + 0.15 * Math.sin(t * 7 + h.flicker) * Math.sin(t * 3.1 + h.flicker);
        const winC = lit ? [255, 200 * fl, 90 * fl] : mix([120, 160, 190], [30, 34, 50], dark);
        for (let w = 0; w < h.windows; w++) {
          const wx = h.windows === 1 ? x + 3 : (w === 0 ? x + 3 : x + h.w - 7);
          ctx.fillStyle = rgb(winC);
          ctx.fillRect(wx, y + 5, 4, 4);
          if (lit) {
            ctx.fillStyle = `rgba(255,190,90,${0.18 * dark * fl})`;
            ctx.fillRect(wx - 3, y + 2, 10, 10);
          }
        }
        if (seas === 'winter') {
          ctx.fillStyle = rgb(mix([245, 248, 255], [90, 100, 130], dark));
          for (let i = 0; i < rh; i += 1) {
            const inset = Math.floor(i * (h.w / 2 + 2) / rh);
            if (i === rh - 1 || i % 4 === 0) ctx.fillRect(x - 3 + inset, y - i - 1, h.w + 6 - inset * 2, 1);
          }
        }
      }
      // дым
      for (const s of smoke) {
        s.life += dt;
        s.y -= dt * 6;
        s.x += dt * s.vx;
      }
      smoke = smoke.filter((s) => s.life < 4);
      for (const s of smoke) {
        ctx.fillStyle = rgb(mix([210, 210, 215], [70, 70, 90], dark), 0.5 * (1 - s.life / 4));
        const sz = 2 + Math.floor(s.life);
        ctx.fillRect(Math.floor(s.x + o3), Math.floor(s.y), sz, sz);
      }
      // фонари
      for (const l of world.lanterns) {
        const x = l.x + o3;
        ctx.fillStyle = rgb(mix([60, 44, 30], [16, 12, 16], dark * 0.6));
        ctx.fillRect(x, groundY - 14, 1, 14);
        ctx.fillRect(x - 1, groundY - 14, 4, 1);
        const fl = 0.8 + 0.2 * Math.sin(t * 9 + l.f);
        ctx.fillStyle = dark > 0.3 ? `rgba(255,${(190 * fl) | 0},90,1)` : 'rgba(120,110,90,1)';
        ctx.fillRect(x + 2, groundY - 13, 2, 3);
        if (dark > 0.3) {
          ctx.fillStyle = `rgba(255,180,80,${0.13 * dark * fl})`;
          ctx.fillRect(x - 6, groundY - 19, 14, 14);
        }
      }
      // земля
      const grass = mix(GRASS[seas], [12, 18, 24], dark * 0.75);
      ctx.fillStyle = rgb(grass);
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = rgb(mix(grass, [0, 0, 0], 0.15));
      for (let x = (o3 % 6 + 6) % 6; x < W; x += 6) ctx.fillRect(x, groundY, 3, 1);
      ctx.fillStyle = rgb(mix([150, 120, 80], [26, 22, 26], dark * 0.75));
      ctx.fillRect(0, 168, W, 5); // тропинка
      ctx.fillStyle = rgb(mix([170, 140, 96], [30, 26, 30], dark * 0.75));
      for (let x = (o3 % 9 + 9) % 9; x < W; x += 9) ctx.fillRect(x, 169, 3, 1);
      if (seas !== 'winter') {
        for (const f of world.flowers) {
          ctx.fillStyle = rgb(mix(f.c, [20, 20, 30], dark * 0.7));
          ctx.fillRect(Math.floor(f.x + px(14)), Math.floor(f.y), 1, 1);
        }
      }
      // жители
      for (const p of world.folk) {
        if (animations) {
          if (p.pause > 0) p.pause -= dt;
          else {
            p.x += p.dir * p.v * dt;
            if (Math.random() < dt * 0.08) p.pause = 1 + Math.random() * 3;
            if (Math.random() < dt * 0.04) p.dir *= -1;
          }
          if (p.x < -10) p.dir = 1;
          if (p.x > W + 10) p.dir = -1;
        }
        const x = Math.floor(p.x + px(14));
        const y = p.y;
        const walking = p.pause <= 0 && animations;
        const step = walking ? Math.floor((t * 6 + p.phase) % 2) : 0;
        const shade = (c) => rgb(mix(c, [16, 16, 26], dark * 0.65));
        // тень
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x - 3, y + 12, 7, 1);
        // ноги
        ctx.fillStyle = shade([60, 44, 34]);
        ctx.fillRect(x - 1 + (step ? 1 : 0), y + 10, 1, 2);
        ctx.fillRect(x + 1 - (step ? 1 : 0), y + 10, 1, 2);
        // мантия
        ctx.fillStyle = shade(p.robe);
        ctx.fillRect(x - 2, y + 4, 5, 7);
        ctx.fillStyle = shade(mix(p.robe, [0, 0, 0], 0.25));
        ctx.fillRect(x - 2, y + 7, 5, 1);
        // руки
        ctx.fillStyle = shade(p.skin);
        ctx.fillRect(x + (p.dir > 0 ? 2 : -2), y + 6 + (step ? 1 : 0), 1, 2);
        // голова
        ctx.fillRect(x - 1, y, 4, 4);
        ctx.fillStyle = shade([40, 30, 30]);
        ctx.fillRect(p.dir > 0 ? x + 2 : x - 1, y + 1, 1, 1);
        if (p.hat) {
          ctx.fillStyle = shade(p.hat);
          ctx.fillRect(x - 2, y - 1, 6, 1);
          ctx.fillRect(x - 1, y - 2, 4, 1);
        }
        if (p.carry) {
          ctx.fillStyle = shade([150, 110, 60]);
          ctx.fillRect(x + (p.dir > 0 ? 3 : -4), y + 5, 2, 3);
        }
      }
      // частицы сезона
      if (animations) {
        const want = seas === 'winter' ? 60 : seas === 'autumn' ? 22 : seas === 'spring' ? 14 : 0;
        if (particles.length < want && Math.random() < 0.5) {
          particles.push({ x: Math.random() * W, y: -4, vx: (Math.random() - 0.3) * 6, vy: 6 + Math.random() * 10, w: Math.random() * 10, kind: seas });
        }
        // светлячки ночью летом/весной
        if ((seas === 'summer' || seas === 'spring') && dark > 0.5 && particles.filter((q) => q.kind === 'fly').length < 18) {
          particles.push({ x: Math.random() * W, y: 120 + Math.random() * 40, vx: 0, vy: 0, w: Math.random() * 10, kind: 'fly', life: 0 });
        }
        for (const q of particles) {
          if (q.kind === 'fly') {
            q.life += dt;
            q.x += Math.sin(t * 0.8 + q.w) * dt * 6;
            q.y += Math.cos(t * 0.6 + q.w * 2) * dt * 4;
          } else {
            q.x += (q.vx + Math.sin(t * 2 + q.w) * 5) * dt;
            q.y += q.vy * dt;
          }
        }
        particles = particles.filter((q) => (q.kind === 'fly' ? q.life < 14 : q.y < H + 4));
        for (const q of particles) {
          if (q.kind === 'winter') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.floor(q.x), Math.floor(q.y), q.w > 7 ? 2 : 1, q.w > 7 ? 2 : 1); }
          else if (q.kind === 'autumn') { ctx.fillStyle = rgb(mix(FOLIAGE.autumn[Math.floor(q.w) % 3], [20, 20, 30], dark * 0.6)); ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 2, 1); }
          else if (q.kind === 'spring') { ctx.fillStyle = 'rgba(250,200,220,0.9)'; ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 1, 1); }
          else if (q.kind === 'fly') {
            const a = Math.max(0, Math.sin(t * 3 + q.w * 5)) * Math.min(1, q.life) * Math.min(1, 14 - q.life);
            ctx.fillStyle = `rgba(230,255,130,${a})`;
            ctx.fillRect(Math.floor(q.x), Math.floor(q.y), 1, 1);
            ctx.fillStyle = `rgba(230,255,130,${a * 0.25})`;
            ctx.fillRect(Math.floor(q.x) - 1, Math.floor(q.y) - 1, 3, 3);
          }
        }
      }
      // виньетка снизу, чтобы интерфейс читался
      const v = ctx.createLinearGradient(0, 0, W, 0);
      v.addColorStop(0, 'rgba(10,7,5,0.55)');
      v.addColorStop(0.35, 'rgba(10,7,5,0.12)');
      v.addColorStop(1, 'rgba(10,7,5,0.25)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    };

    const loop = (now) => {
      if (!paused) draw(now);
      raf = requestAnimationFrame(loop);
    };
    draw(performance.now());
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, [paused, hourOverride, animations]);

  return <canvas ref={ref} className="village-scene" />;
}
