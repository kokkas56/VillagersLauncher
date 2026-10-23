// «Анимации»: окно предпросмотра. Своя маленькая отрисовка кубов (как в Minecraft: развёртка скина по граням, без сглаживания)
// на 2D-канве — без WebGL, работает везде. Камера-орбита (ПКМ / Alt+ЛКМ — вращать, СКМ / Shift+ПКМ — двигать, колесо — ближе),
// выбор кости щелчком, гизмо поворота (кольца X/Y/Z по осям кости + свободное вращение внутри) и сдвига.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { app3, mul3, tr3, axisAngle, FEET, I3 } from './animCore.js';

const AX_COLOR = ['#e05050', '#63c34a', '#4f86ee'];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// модель (Y вниз, правая сторона −X) → мир (Y вверх, ноги на 0)
const toWorld = (p) => [-p[0], 24 - p[1], p[2]];
const dirToWorld = (d) => [-d[0], -d[1], d[2]];
const dirToModel = (d) => [-d[0], -d[1], d[2]];

export function makeCamera(c, W, H) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const eye = add(c.target, scl([Math.sin(c.yaw) * cp, sp, -Math.cos(c.yaw) * cp], c.dist));
  const fwd = norm(sub(c.target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = (Math.min(W, H) * 0.5) / Math.tan((c.fov || 32) * Math.PI / 360);
  const proj = (pw) => { const d = sub(pw, eye); const z = Math.max(0.5, dot(d, fwd)); return [W / 2 + f * dot(d, right) / z, H / 2 - f * dot(d, up) / z, z]; };
  return { eye, fwd, right, up, f, proj, W, H };
}

// грани куба как в ModelPart.Cube: [вершины], u1, v1, u2, v2
function cubeFaces(cb) {
  const g = cb.inflate || 0;
  let x0 = cb.from[0] - g, x1 = cb.from[0] + cb.size[0] + g;
  const y0 = cb.from[1] - g, y1 = cb.from[1] + cb.size[1] + g, z0 = cb.from[2] - g, z1 = cb.from[2] + cb.size[2] + g;
  if (cb.mirror) { const t = x0; x0 = x1; x1 = t; }
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const [w, h, d] = cb.size, u = cb.uv ? cb.uv[0] : 0, vv = cb.uv ? cb.uv[1] : 0;
  const f4 = u, f5 = u + d, f6 = u + d + w, f7 = u + d + w + w, f8 = u + d + w + d, f9 = u + d + w + d + w, f10 = vv, f11 = vv + d, f12 = vv + d + h;
  return [
    { vs: [v[5], v[4], v[0], v[1]], uv: [f5, f10, f6, f11], n: 'top' },
    { vs: [v[2], v[3], v[7], v[6]], uv: [f6, f11, f7, f10], n: 'bottom' },
    { vs: [v[0], v[4], v[7], v[3]], uv: [f4, f11, f5, f12], n: 'side' },
    { vs: [v[1], v[0], v[3], v[2]], uv: [f5, f11, f6, f12], n: 'front' },
    { vs: [v[5], v[1], v[2], v[6]], uv: [f6, f11, f8, f12], n: 'side' },
    { vs: [v[4], v[5], v[6], v[7]], uv: [f8, f11, f9, f12], n: 'back' }
  ];
}

/** Все грани модели в экранных координатах (для рисования и выбора). */
function buildFaces(rig, solved, extra, cam, texes) {
  const out = [];
  const add1 = (boneName, cubes, s, texFor) => {
    for (const cb of cubes) {
      const center = [cb.from[0] + cb.size[0] / 2, cb.from[1] + cb.size[1] / 2, cb.from[2] + cb.size[2] / 2];
      const cw = toWorld(add(s.P, app3(s.M, center)));
      for (const f of cubeFaces(cb)) {
        const pw = f.vs.map((p) => toWorld(add(s.P, app3(s.M, p))));
        const fc = scl(add(add(pw[0], pw[1]), add(pw[2], pw[3])), 0.25);
        const nrm = norm(sub(fc, cw));
        if (dot(nrm, sub(cam.eye, fc)) <= 0) continue;
        const ps = pw.map(cam.proj);
        const depth = (ps[0][2] + ps[1][2] + ps[2][2] + ps[3][2]) / 4;
        out.push({ bone: boneName, ps, uv: f.uv, nrm, depth, tex: texFor(cb), color: cb.color, overlay: (cb.inflate || 0) > 0 });
      }
    }
  };
  for (const b of rig.bones) {
    const s = solved.bones[b.name];
    if (!s || !s.visible) continue;
    add1(b.overlay || b.follows ? (b.follows || b.name) : b.name, b.cubes, s, () => texes.skin);
    // шапка выбирается вместе с головой
  }
  for (const e of extra || []) {
    const s = solved.bones[e.name];
    if (!s) continue;
    add1(e.name, e.cubes || [], s, (cb) => (cb.tex === 'skin' ? texes.skin : texes.extra && cb.uv ? texes.extra : null));
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

function shadeOf(n) { return n[1] > 0.6 ? 0 : n[1] < -0.6 ? 0.45 : Math.abs(n[0]) > Math.abs(n[2]) ? 0.24 : 0.12; }

function drawFace(ctx, f, sel) {
  const p = f.ps;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath();
  if (f.tex && f.uv) {
    ctx.clip();
    const [u1, v1, u2, v2] = f.uv;
    const sw = u2 - u1, sh = v2 - v1;
    if (Math.abs(sw) > 1e-6 && Math.abs(sh) > 1e-6) {
      const ex = [(p[0][0] - p[1][0]) / sw, (p[0][1] - p[1][1]) / sw], ey = [(p[2][0] - p[1][0]) / sh, (p[2][1] - p[1][1]) / sh];
      // небольшой нахлёст — без щелей между гранями
      ctx.setTransform(ctx.__dpr * ex[0], ctx.__dpr * ex[1], ctx.__dpr * ey[0], ctx.__dpr * ey[1], ctx.__dpr * (p[1][0] - u1 * ex[0] - v1 * ey[0]), ctx.__dpr * (p[1][1] - u1 * ex[1] - v1 * ey[1]));
      const ux = Math.min(u1, u2), vy = Math.min(v1, v2), uw = Math.abs(sw), vh = Math.abs(sh);
      try { ctx.drawImage(f.tex, ux, vy, uw, vh, ux - 0.02, vy - 0.02, uw + 0.04, vh + 0.04); } catch (_) {}
      ctx.setTransform(ctx.__dpr, 0, 0, ctx.__dpr, 0, 0);
    }
  } else {
    ctx.fillStyle = f.color || '#8a8a8a';
    ctx.fill();
  }
  const sh = shadeOf(f.nrm);
  if (sh > 0 && !(f.overlay && f.tex)) { ctx.fillStyle = 'rgba(0,0,0,' + sh + ')'; ctx.fill(); }
  if (sel) { ctx.fillStyle = 'rgba(110,130,255,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,175,255,0.9)'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

function inQuad(p, x, y) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

/** Где гизмо кости: центр (мировой), оси (модель), матрица родителя. */
export function gizmoFrame(bone, solved) {
  if (bone === 'root') {
    const r = solved.root;
    return { P: add(FEET, r.P), R: r.R, parentM: I3 };
  }
  const s = solved.bones[bone];
  if (!s) return null;
  // туловище крутится от пояса — там и гизмо (у кости сустав на шее, но наклон считается вокруг пояса)
  if (bone === 'body') return { P: add(s.P, app3(s.M, [0, 12, 0])), R: s.R, parentM: s.parentM };
  return { P: s.P, R: s.R, parentM: s.parentM };
}

export default function AnimView({ rig, solved, extra, texes, sel, onSelect, tool, onRotate, onMove, cam, setCam, showGrid, hp, overlay, axesSpace }) {
  const wrap = useRef(null);
  const cv = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [hover, setHover] = useState(null); // кольцо под мышью: 0/1/2/'free'/'move'
  const drag = useRef(null);
  const facesRef = useRef([]);
  const gizRef = useRef(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // ---------- рисование ----------
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size.w, H = size.h;
    if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr);
    if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d');
    ctx.__dpr = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // фон
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a3d46'); g.addColorStop(1, '#23242a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const C = makeCamera(cam, W, H);
    // пол: сетка 1 блок = 16 пикс.
    if (showGrid !== false) {
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i++) {
        const a = C.proj([i * 16, 0, -96]), b = C.proj([i * 16, 0, 96]);
        const a2 = C.proj([-96, 0, i * 16]), b2 = C.proj([96, 0, i * 16]);
        ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
      }
      // тень
      const rootP = solved.root ? solved.root.P : [0, 0, 0];
      const sc = C.proj([-rootP[0], 0, rootP[2]]);
      const r = C.f * 7 / sc[2];
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(sc[0], sc[1], r, r * 0.35 + 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    const faces = buildFaces(rig, solved, extra, C, texes || {});
    facesRef.current = faces;
    for (const f of faces) drawFace(ctx, f, sel && f.bone === sel);
    // гизмо
    gizRef.current = null;
    if (sel && (tool === 'rotate' || tool === 'move')) {
      const fr = gizmoFrame(sel, solved);
      if (fr) {
        const pc = C.proj(toWorld(fr.P));
        const R = axesSpace === 'parent' ? fr.parentM : fr.R;
        const axes = [0, 1, 2].map((i) => [R[i], R[3 + i], R[6 + i]]); // столбцы — оси кости в пространстве модели
        const rad = Math.min(W, H) * 0.12;
        const worldR = rad * pc[2] / C.f; // радиус кольца в пикселях модели
        const giz = { pc, rad, rings: [], axes, P: fr.P, frame: fr, C };
        if (tool === 'rotate') {
          for (let i = 0; i < 3; i++) {
            const ax = axes[i];
            const u = norm(Math.abs(ax[1]) < 0.9 ? cross(ax, [0, 1, 0]) : cross(ax, [1, 0, 0])), v = cross(ax, u);
            const pts = [];
            for (let s = 0; s <= 64; s++) {
              const t = (s / 64) * Math.PI * 2;
              const pm = add(fr.P, add(scl(u, Math.cos(t) * worldR), scl(v, Math.sin(t) * worldR)));
              const pp = C.proj(toWorld(pm));
              pts.push({ x: pp[0], y: pp[1], z: pp[2], t });
            }
            giz.rings.push({ i, pts, u, v });
          }
          // дальняя половина колец — тусклее
          for (const ring of giz.rings) {
            for (let s = 0; s < 64; s++) {
              const a = ring.pts[s], b = ring.pts[s + 1];
              const back = (a.z + b.z) / 2 > pc[2] + 0.01;
              ctx.strokeStyle = AX_COLOR[ring.i];
              ctx.globalAlpha = back ? 0.25 : 0.95;
              ctx.lineWidth = hover === ring.i || (drag.current && drag.current.ring === ring.i) ? 3.5 : 2;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = hover === 'free' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(pc[0], pc[1], rad * 1.18, 0, Math.PI * 2); ctx.stroke();
        } else {
          // сдвиг: стрелки по осям родителя + центр
          const PR = fr.parentM;
          const pax = [0, 1, 2].map((i) => [PR[i], PR[3 + i], PR[6 + i]]);
          giz.arrows = pax.map((ax, i) => { const e = C.proj(toWorld(add(fr.P, scl(ax, worldR)))); return { i, ax, x: e[0], y: e[1] }; });
          for (const a of giz.arrows) {
            ctx.strokeStyle = AX_COLOR[a.i]; ctx.fillStyle = AX_COLOR[a.i];
            ctx.lineWidth = hover === 'a' + a.i ? 3.5 : 2;
            ctx.beginPath(); ctx.moveTo(pc[0], pc[1]); ctx.lineTo(a.x, a.y); ctx.stroke();
            ctx.beginPath(); ctx.arc(a.x, a.y, 4.5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = hover === 'move' ? '#fff' : '#d8d8d8';
          ctx.fillRect(pc[0] - 5, pc[1] - 5, 10, 10);
        }
        ctx.fillStyle = '#ffd25a';
        ctx.beginPath(); ctx.arc(pc[0], pc[1], 3, 0, Math.PI * 2); ctx.fill();
        gizRef.current = giz;
      }
    }
    // оси вида в углу
    const o = [34, H - 30];
    for (let i = 0; i < 3; i++) {
      const d = [0, 0, 0]; d[i] = 1;
      const dm = dirToWorld(d); // ось модели
      const sx = dot(dm, C.right) * 18, sy = -dot(dm, C.up) * 18;
      ctx.strokeStyle = AX_COLOR[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + sx, o[1] + sy); ctx.stroke();
      ctx.fillStyle = AX_COLOR[i]; ctx.font = 'bold 10px Segoe UI, sans-serif'; ctx.fillText('XYZ'[i], o[0] + sx * 1.25 - 3, o[1] + sy * 1.25 + 4);
    }
  });

  // ---------- мышь ----------
  const local = (e) => { const r = cv.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hitGizmo = (x, y) => {
    const g = gizRef.current;
    if (!g) return null;
    if (g.rings.length) {
      let best = null, bd = 7;
      for (const ring of g.rings) for (let s = 0; s < 64; s++) {
        const a = ring.pts[s], b = ring.pts[s + 1];
        const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
        const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y);
        const back = (a.z + b.z) / 2 > g.pc[2] + 0.01;
        if (d < bd - (back ? 2 : 0)) { bd = d; best = { ring: ring.i, s, tan: [vx / Math.sqrt(l2), vy / Math.sqrt(l2)] }; }
      }
      if (best) return best;
      const dc = Math.hypot(x - g.pc[0], y - g.pc[1]);
      if (dc < g.rad * 1.25) return { free: true };
      return null;
    }
    if (g.arrows) {
      for (const a of g.arrows) if (Math.hypot(x - a.x, y - a.y) < 8) return { arrow: a.i };
      if (Math.abs(x - g.pc[0]) < 8 && Math.abs(y - g.pc[1]) < 8) return { move: true };
    }
    return null;
  };
  const pick = (x, y) => { const fs = facesRef.current; for (let i = fs.length - 1; i >= 0; i--) if (inQuad(fs[i].ps, x, y)) return fs[i].bone; return null; };

  const onDown = (e) => {
    const [x, y] = local(e);
    const orbit = e.button === 2 || (e.button === 0 && e.altKey);
    const pan = e.button === 1 || (e.button === 2 && e.shiftKey);
    if (orbit || pan) {
      e.preventDefault();
      const c0 = { ...cam };
      const x0 = e.clientX, y0 = e.clientY;
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (pan) {
          const C = makeCamera(c0, size.w, size.h);
          const k = c0.dist / C.f;
          setCam({ ...c0, target: add(c0.target, add(scl(C.right, -dx * k), scl(C.up, dy * k))) });
        } else setCam({ ...c0, yaw: c0.yaw - dx * 0.01, pitch: Math.max(-1.45, Math.min(1.45, c0.pitch + dy * 0.01)) });
      };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      return;
    }
    if (e.button !== 0) return;
    const h = hitGizmo(x, y);
    const g = gizRef.current;
    if (h && g && sel) {
      e.preventDefault();
      const R0 = g.frame.R;
      const x0 = e.clientX, y0 = e.clientY;
      drag.current = { ring: h.ring };
      if (h.ring != null || h.free) onRotate && onRotate({ phase: 'start', bone: sel });
      else onMove && onMove({ phase: 'start', bone: sel });
      const C = g.C;
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        const k = (ev.shiftKey ? 0.25 : 1);
        if (h.ring != null) {
          const ax = g.axes[h.ring];
          // знак: куда на экране едет точка кольца при повороте на +угол
          const ring = g.rings[h.ring];
          const pa = ring.pts[h.s];
          const tq = ring.pts[h.s].t + 0.05;
          const pm = add(g.P, add(scl(ring.u, Math.cos(tq) * 1), scl(ring.v, Math.sin(tq) * 1)));
          void pm;
          const along = dx * h.tan[0] + dy * h.tan[1];
          // направление касательной кольца совпадает с ростом t (u→v); поворот вокруг ax на +δ ведёт u→v, если ax = u×v
          const sign = dot(cross(ring.u, ring.v), ax) >= 0 ? 1 : -1;
          void pa;
          const ang = along * 0.012 * k * sign;
          const Wn = mul3(axisAngle(ax, ang), R0);
          onRotate && onRotate({ phase: 'move', bone: sel, W: Wn });
        } else if (h.free) {
          const upM = dirToModel(C.up), rightM = dirToModel(C.right);
          const a1 = axisAngle(norm(upM), -dx * 0.012 * k), a2 = axisAngle(norm(rightM), -dy * 0.012 * k);
          onRotate && onRotate({ phase: 'move', bone: sel, W: mul3(mul3(a2, a1), R0) });
        } else {
          const kk = cam.dist / C.f * k;
          let dW = add(scl(C.right, dx * kk), scl(C.up, -dy * kk));
          let dM = dirToModel(dW);
          if (h.arrow != null) { const ax = g.frame.parentM ? [g.frame.parentM[h.arrow], g.frame.parentM[3 + h.arrow], g.frame.parentM[6 + h.arrow]] : [0, 0, 0]; dM = scl(ax, dot(dM, ax)); }
          void dW;
          onMove && onMove({ phase: 'move', bone: sel, delta: dM, parentM: g.frame.parentM });
        }
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        drag.current = null;
        if (h.ring != null || h.free) onRotate && onRotate({ phase: 'end', bone: sel }); else onMove && onMove({ phase: 'end', bone: sel });
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      return;
    }
    onSelect && onSelect(pick(x, y));
  };
  const onMoveHover = (e) => {
    if (drag.current) return;
    const [x, y] = local(e);
    const h = hitGizmo(x, y);
    const v = h ? (h.ring != null ? h.ring : h.free ? 'free' : h.arrow != null ? 'a' + h.arrow : 'move') : null;
    if (v !== hover) setHover(v);
  };
  const onWheel = (e) => { e.preventDefault(); setCam({ ...cam, dist: Math.max(20, Math.min(400, cam.dist * Math.exp(e.deltaY * 0.0012))) }); };
  useEffect(() => {
    const c = cv.current;
    if (!c) return undefined;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });
  const tip = tool === 'rotate' ? 'Кольца: красное — X, зелёное — Y, синее — Z (оси кости). Тяни кольцо — поворот вокруг оси; внутри круга — свободно. Shift — точнее.' : tool === 'move' ? 'Сдвиг: тяни белый квадрат — в плоскости экрана, цветные точки — вдоль оси. Shift — точнее.' : 'Выбор: щёлкни часть тела.';
  return (
    <div className="an-view" ref={wrap} {...(hp ? hp('Предпросмотр. ЛКМ — выбрать кость. ' + tip + ' ПКМ или Alt+ЛКМ — вращать вид, СКМ или Shift+ПКМ — двигать, колесо — ближе/дальше.') : {})}>
      <canvas ref={cv} style={{ width: size.w, height: size.h, cursor: hover != null ? 'grab' : 'default' }} onMouseDown={onDown} onMouseMove={onMoveHover} onContextMenu={(e) => e.preventDefault()} />
      {overlay}
    </div>
  );
}

// ---------- текстуры по умолчанию (свои картинки: житель, житель долины, «обычный» игрок) ----------
function paintBox(ctx, u, v, w, h, d, col) {
  const R = (x, y, ww, hh, c) => { if (!c) return; ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  R(u + d, v, w, d, col.top || col.side); R(u + d + w, v, w, d, col.bottom || col.side);
  R(u, v + d, d, h, col.side); R(u + d, v + d, w, h, col.front || col.side); R(u + d + w, v + d, d, h, col.side); R(u + d + w + d, v + d, w, h, col.back || col.side);
}
function noise(ctx, x, y, w, h, amt, seed) {
  let s = seed || 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) { const a = (rnd() - 0.5) * amt; ctx.fillStyle = a > 0 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (-a) + ')'; ctx.fillRect(i, j, 1, 1); }
}
export function defaultPlayerTexture(kind) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const valley = kind === 'valley';
  const skin = valley ? '#c9966f' : '#b5835f', hair = valley ? '#5b3a1e' : '#3b2614', shirt = valley ? '#7a5a3a' : '#2f8f8a', pants = valley ? '#4a4038' : '#3b4aa0', shoe = '#3a3a3a';
  paintBox(ctx, 0, 0, 8, 8, 8, { side: skin, top: hair, back: hair });
  ctx.fillStyle = hair; ctx.fillRect(8, 8, 8, 2); ctx.fillRect(0, 8, 8, 3); ctx.fillRect(16, 8, 8, 3); ctx.fillRect(24, 8, 8, 8);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(9, 12, 2, 1); ctx.fillRect(13, 12, 2, 1);
  ctx.fillStyle = valley ? '#3a6a2a' : '#3b4aa0'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(13, 12, 1, 1);
  ctx.fillStyle = '#8a5a40'; ctx.fillRect(11, 14, 2, 1);
  ctx.fillStyle = '#6a3a2a'; ctx.fillRect(10, 15, 4, 1);
  paintBox(ctx, 16, 16, 8, 12, 4, { side: shirt });
  if (valley) { ctx.fillStyle = '#5a3f26'; ctx.fillRect(20, 29, 8, 1); ctx.fillRect(20, 26, 8, 1); }
  paintBox(ctx, 40, 16, 4, 12, 4, { side: shirt, bottom: skin });
  ctx.fillStyle = skin; ctx.fillRect(40, 28, 16, 4);
  paintBox(ctx, 32, 48, 4, 12, 4, { side: shirt, bottom: skin });
  ctx.fillStyle = skin; ctx.fillRect(32, 60, 16, 4);
  paintBox(ctx, 0, 16, 4, 12, 4, { side: pants, bottom: shoe });
  ctx.fillStyle = shoe; ctx.fillRect(0, 29, 16, 3);
  paintBox(ctx, 16, 48, 4, 12, 4, { side: pants, bottom: shoe });
  ctx.fillStyle = shoe; ctx.fillRect(16, 61, 16, 3);
  noise(ctx, 0, 16, 56, 16, 0.08, 3); noise(ctx, 16, 48, 32, 16, 0.08, 5);
  return c;
}
export function defaultVillagerTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const skin = '#b88a6c', robe = '#6e4a2c', robe2 = '#5c3c22', pants = '#3f2d1d';
  paintBox(ctx, 0, 0, 8, 10, 8, { side: skin, top: '#9a6e52' });
  ctx.fillStyle = '#3c2a1c'; ctx.fillRect(8, 11, 8, 1); // бровь
  ctx.fillStyle = '#ffffff'; ctx.fillRect(9, 12, 2, 1); ctx.fillRect(13, 12, 2, 1);
  ctx.fillStyle = '#2f7a3a'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(13, 12, 1, 1);
  ctx.fillStyle = '#8a5a44'; ctx.fillRect(10, 16, 4, 1);
  paintBox(ctx, 24, 0, 2, 4, 2, { side: '#a87a5e' });
  paintBox(ctx, 16, 20, 8, 12, 6, { side: robe });
  paintBox(ctx, 0, 38, 8, 20, 6, { side: robe2 });
  ctx.fillStyle = '#4a3020'; ctx.fillRect(6, 50, 22, 1);
  paintBox(ctx, 44, 22, 4, 8, 4, { side: robe, bottom: skin });
  paintBox(ctx, 40, 38, 8, 4, 4, { side: robe, front: skin });
  ctx.fillStyle = skin; ctx.fillRect(44, 42, 8, 4);
  paintBox(ctx, 0, 22, 4, 12, 4, { side: pants, bottom: '#2a2018' });
  noise(ctx, 16, 20, 28, 18, 0.1, 9); noise(ctx, 0, 38, 28, 26, 0.1, 11);
  return c;
}
