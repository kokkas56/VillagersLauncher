import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation } from 'skinview3d';
import { Raycaster, Vector2 } from 'three';
import Icon from '../components/Icon.jsx';
import ColorPicker from './ColorPicker.jsx';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import { css, toHex } from './color.js';
import { PARTS, PART_NAMES, pixelMap, SIZE, capeMask } from './layout.js';
import { BUILTIN_TEMPLATES, defaultCape } from './templates.js';
import {
  makeDoc, makeLayer, cloneLayers, composite, compositeData, maskFn, mirrorFn, pixelOp, stamp, linePoints,
  rectPoints, fill, gradient, extractPalette, loadImageData, layerToDataUrl, isEmpty, BLENDS
} from './engine.js';

const TOOLS = [
  { id: 'pencil', icon: 'pencil', name: 'Карандаш', key: 'B' },
  { id: 'brush', icon: 'brush', name: 'Мягкая кисть', key: 'N' },
  { id: 'eraser', icon: 'eraser', name: 'Ластик', key: 'E' },
  { id: 'fill', icon: 'bucket', name: 'Заливка', key: 'G' },
  { id: 'picker', icon: 'picker', name: 'Пипетка', key: 'I' },
  { id: 'line', icon: 'line', name: 'Линия', key: 'L', shape: true },
  { id: 'rect', icon: 'rect', name: 'Рамка', key: 'R', shape: true },
  { id: 'rectFill', icon: 'rectFill', name: 'Прямоугольник', key: 'U', shape: true },
  { id: 'gradient', icon: 'gradient', name: 'Градиент', key: 'T', shape: true },
  { id: 'dither', icon: 'dither', name: 'Шум (фактура)', key: 'D' },
  { id: 'checker', icon: 'grid', name: 'Шахматка', key: 'K' },
  { id: 'lighten', icon: 'sun', name: 'Осветлить', key: 'O' },
  { id: 'darken', icon: 'moon', name: 'Затемнить', key: 'P' },
  { id: 'blend', icon: 'blend', name: 'Смешать', key: 'S' },
  { id: 'rotate', icon: 'hand', name: 'Вращать модель', key: 'H' }
];
const PAINT_TOOLS = new Set(['pencil', 'brush', 'eraser', 'dither', 'checker', 'lighten', 'darken', 'blend']);

function emptyHidden() {
  return { head: false, body: false, rightArm: false, leftArm: false, rightLeg: false, leftLeg: false, base: false, overlay: false };
}

async function docFromSaved(kind, saved, slim) {
  const w = 64, h = kind === 'cape' ? 32 : 64;
  const layers = [];
  for (const l of saved.layers || []) {
    const data = await loadImageData(l.data, w, h);
    layers.push({ ...makeLayer(l.name, w, h, data), visible: l.visible !== false, opacity: l.opacity ?? 1, blend: l.blend || 'source-over', lockAlpha: !!l.lockAlpha });
  }
  if (!layers.length) layers.push(makeLayer('Слой 1', w, h));
  return { kind, w, h, slim, layers, active: layers[layers.length - 1].id };
}

function serializeDoc(doc) {
  return { layers: doc.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha, data: layerToDataUrl(l, doc.w, doc.h) })) };
}

export default function SkinEditor({ initial, onClose }) {
  const { t, toast, account } = useApp();
  const [mode, setMode] = useState('skin');
  const [tick, setTick] = useState(0);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState([46, 204, 113, 255]);
  const [color2, setColor2] = useState([24, 18, 14, 255]);
  const [recent, setRecent] = useState([]);
  const [size, setSize] = useState(1);
  const [strength, setStrength] = useState(0.5);
  const [noise, setNoise] = useState(0.15);
  const [shape, setShape] = useState('square');
  const [mirror, setMirror] = useState(false);
  const [fillMode, setFillMode] = useState('contiguous');
  const [tolerance, setTolerance] = useState(0);
  const [hidden, setHidden] = useState(emptyHidden);
  const [paintTarget, setPaintTarget] = useState('auto');
  const [zoom, setZoom] = useState(8);
  const [grid, setGrid] = useState(true);
  const [view, setView] = useState('both');
  const [pose, setPose] = useState('idle');
  const [name, setName] = useState(initial && initial.name ? initial.name : (account ? account.name : 'Мой скин'));
  const [panel, setPanel] = useState(null); // templates | projects | elyImport
  const [userTemplates, setUserTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [hover, setHover] = useState(null);
  const [elyNick, setElyNick] = useState('');
  const [busy, setBusy] = useState(false);

  const docs = useRef({ skin: null, cape: null });
  const hist = useRef({ skin: { undo: [], redo: [] }, cape: { undo: [], redo: [] } });
  const compSkin = useRef(document.createElement('canvas'));
  const compCape = useRef(document.createElement('canvas'));
  const view2d = useRef(null);
  const overlay = useRef(null); // предпросмотр фигур
  const canvas3d = useRef(null);
  const viewerRef = useRef(null);
  const stroke = useRef(null);
  const dirty = useRef(true);
  const wrap3d = useRef(null);
  const [size3d, setSize3d] = useState({ w: 420, h: 520 });
  const [vtick, setVtick] = useState(0);

  const doc = docs.current[mode];
  const rerender = useCallback(() => { dirty.current = true; setTick((n) => n + 1); }, []);

  // ---------- инициализация ----------
  useEffect(() => {
    (async () => {
      const slim = !!(initial && initial.slim);
      if (initial && initial.skin) {
        const data = await loadImageData(initial.skin, 64, 64);
        docs.current.skin = makeDoc('skin', [{ name: 'Импорт', data }], slim);
      } else {
        docs.current.skin = makeDoc('skin', BUILTIN_TEMPLATES[2].make(slim), slim);
      }
      if (initial && initial.cape) {
        const data = await loadImageData(initial.cape, 64, 32);
        docs.current.cape = makeDoc('cape', [{ name: 'Плащ', data }]);
      } else {
        docs.current.cape = makeDoc('cape', [{ name: 'Плащ', data: defaultCape() }]);
      }
      rerender();
    })();
    call('editor:list', 'templates').then(setUserTemplates).catch(() => {});
    call('editor:list', 'projects').then(setProjects).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 3D ----------
  useEffect(() => {
    if (!canvas3d.current) return undefined;
    const viewer = new SkinViewer({ canvas: canvas3d.current, width: size3d.w, height: size3d.h });
    viewer.zoom = 0.9;
    viewer.fov = 45;
    viewer.animation = new IdleAnimation();
    viewer.controls.enablePan = false;
    viewerRef.current = viewer;
    dirty.current = true;
    setVtick((n) => n + 1);
    return () => { viewer.dispose(); viewerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view === 'uv', !!doc]);

  useEffect(() => {
    const el = wrap3d.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize3d({ w: Math.max(200, Math.floor(r.width)), h: Math.max(240, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, !!doc]);
  useEffect(() => { if (viewerRef.current) viewerRef.current.setSize(size3d.w, size3d.h); }, [size3d]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.animation = pose === 'walk' ? new WalkingAnimation() : pose === 'idle' ? new IdleAnimation() : null;
    if (v.animation) v.animation.speed = 0.5;
    if (pose === 'static') { v.playerObject.skin.rightArm.rotation.x = 0; v.playerObject.skin.leftArm.rotation.x = 0; v.playerObject.skin.rightLeg.rotation.x = 0; v.playerObject.skin.leftLeg.rotation.x = 0; }
  }, [pose, vtick]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const painting = tool !== 'rotate';
    // левая кнопка рисует, правая вращает, колесо — масштаб
    v.controls.mouseButtons = painting ? { LEFT: -1, MIDDLE: 1, RIGHT: 0 } : { LEFT: 0, MIDDLE: 1, RIGHT: 0 };
    v.playerObject.rotation.y = mode === 'cape' ? Math.PI : 0;
    const sk = v.playerObject.skin;
    for (const p of PARTS) {
      sk[p].visible = !hidden[p];
      sk[p].innerLayer.visible = !hidden.base;
      sk[p].outerLayer.visible = !hidden.overlay;
    }
  }, [tool, hidden, mode, tick, vtick]);

  // ---------- отрисовка ----------
  useEffect(() => {
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty.current) return;
      dirty.current = false;
      const sd = docs.current.skin;
      const cd = docs.current.cape;
      if (!sd || !cd) return;
      composite(sd, compSkin.current);
      composite(cd, compCape.current);
      const v = viewerRef.current;
      if (v) {
        try {
          v.loadSkin(compSkin.current, { model: sd.slim ? 'slim' : 'default' });
          if (mode === 'cape' || !isEmpty(compositeData(cd))) v.loadCape(compCape.current); else v.resetCape();
        } catch (_) {}
      }
      draw2d();
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, zoom, grid, hidden, hover, view, size, mirror, vtick, !!doc]);

  function draw2d() {
    const c = view2d.current;
    const d = docs.current[mode];
    if (!c || !d) return;
    const Z = zoom;
    c.width = d.w * Z;
    c.height = d.h * Z;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16110d';
    ctx.fillRect(0, 0, c.width, c.height);
    const mask = maskFn(d, null);
    const vis = maskFn(d, hidden);
    // шахматка под развёрткой
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (!mask(x, y)) continue;
      ctx.fillStyle = (x + y) % 2 ? '#3a3330' : '#2c2623';
      ctx.fillRect(x * Z, y * Z, Z, Z);
    }
    ctx.drawImage(mode === 'cape' ? compCape.current : compSkin.current, 0, 0, d.w * Z, d.h * Z);
    // скрытые части затемнены
    ctx.fillStyle = 'rgba(10,8,6,0.72)';
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (mask(x, y) && !vis(x, y)) ctx.fillRect(x * Z, y * Z, Z, Z);
    if (grid && Z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= d.w; x++) { ctx.moveTo(x * Z + 0.5, 0); ctx.lineTo(x * Z + 0.5, d.h * Z); }
      for (let y = 0; y <= d.h; y++) { ctx.moveTo(0, y * Z + 0.5); ctx.lineTo(d.w * Z, y * Z + 0.5); }
      ctx.stroke();
    }
    // границы граней
    ctx.strokeStyle = 'rgba(227,181,90,0.35)';
    ctx.lineWidth = 1;
    if (mode === 'skin') {
      const map = pixelMap(d.slim);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const m = map[y * SIZE + x];
        if (!m) continue;
        const r = x + 1 < d.w ? map[y * SIZE + x + 1] : null;
        const b = y + 1 < d.h ? map[(y + 1) * SIZE + x] : null;
        const l = x > 0 ? map[y * SIZE + x - 1] : null;
        const tp = y > 0 ? map[(y - 1) * SIZE + x] : null;
        const diff = (n) => !n || n.part !== m.part || n.face !== m.face || n.layer !== m.layer;
        ctx.beginPath();
        if (diff(r)) { ctx.moveTo((x + 1) * Z - 0.5, y * Z); ctx.lineTo((x + 1) * Z - 0.5, (y + 1) * Z); }
        if (diff(b)) { ctx.moveTo(x * Z, (y + 1) * Z - 0.5); ctx.lineTo((x + 1) * Z, (y + 1) * Z - 0.5); }
        if (diff(l)) { ctx.moveTo(x * Z + 0.5, y * Z); ctx.lineTo(x * Z + 0.5, (y + 1) * Z); }
        if (diff(tp)) { ctx.moveTo(x * Z, y * Z + 0.5); ctx.lineTo((x + 1) * Z, y * Z + 0.5); }
        ctx.stroke();
      }
    }
    if (hover) {
      const r = Math.floor((size - 1) / 2);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect((hover[0] - r) * Z + 0.5, (hover[1] - r) * Z + 0.5, size * Z - 1, size * Z - 1);
      if (mirror) {
        const m = mirrorFn(d)(hover[0], hover[1]);
        if (m) { ctx.strokeStyle = 'rgba(46,204,113,0.9)'; ctx.strokeRect((m[0] - r) * Z + 0.5, (m[1] - r) * Z + 0.5, size * Z - 1, size * Z - 1); }
      }
    }
  }

  // ---------- история ----------
  const pushHistory = () => {
    const d = docs.current[mode];
    const h = hist.current[mode];
    h.undo.push({ layers: cloneLayers(d.layers), active: d.active, slim: d.slim });
    if (h.undo.length > 120) h.undo.shift();
    h.redo = [];
  };
  const undo = () => {
    const d = docs.current[mode];
    const h = hist.current[mode];
    const s = h.undo.pop();
    if (!s) return;
    h.redo.push({ layers: cloneLayers(d.layers), active: d.active, slim: d.slim });
    Object.assign(d, s);
    rerender();
  };
  const redo = () => {
    const d = docs.current[mode];
    const h = hist.current[mode];
    const s = h.redo.pop();
    if (!s) return;
    h.undo.push({ layers: cloneLayers(d.layers), active: d.active, slim: d.slim });
    Object.assign(d, s);
    rerender();
  };

  const activeLayer = () => { const d = docs.current[mode]; return d && d.layers.find((l) => l.id === d.active); };

  const pushRecent = (c) => setRecent((r) => [c, ...r.filter((x) => toHex(x) !== toHex(c) || x[3] !== c[3])].slice(0, 16));

  // ---------- рисование ----------
  const pickAt = (x, y) => {
    const d = docs.current[mode];
    const data = compositeData(d);
    const i = (y * d.w + x) * 4;
    if (data[i + 3] === 0) return;
    setColor([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  };

  const beginStroke = (x, y, button, alt) => {
    const d = docs.current[mode];
    const layer = activeLayer();
    if (!d || !layer) return;
    const useColor = button === 2 ? color2 : color;
    if (tool === 'picker' || alt) { pickAt(x, y); return; }
    if (tool === 'rotate') return;
    if (layer.locked) { toast(t('Слой заблокирован'), 'warn'); return; }
    if (!layer.visible) { toast(t('Слой скрыт — включи его, чтобы рисовать'), 'warn'); return; }
    const canPaint = maskFn(d, hidden);
    const mir = mirror ? mirrorFn(d) : null;
    pushHistory();
    if (tool === 'fill') {
      fill(d, layer, x, y, useColor, { tolerance, mode: fillMode, canPaint, mirror: mir });
      pushRecent(useColor);
      rerender();
      return;
    }
    const src = tool === 'blend' ? compositeData(d) : null;
    const op = pixelOp(tool, { color: useColor, strength, noise }, layer, d, src);
    stroke.current = { x0: x, y0: y, last: [x, y], useColor, op, canPaint, mir, shape: TOOLS.find((q) => q.id === tool).shape };
    if (!stroke.current.shape) {
      stamp(d, layer, x, y, { size, shape, soft: tool === 'brush' || tool === 'eraser' && strength < 1 }, op, canPaint, mir);
      rerender();
    } else {
      drawShapePreview(x, y);
    }
  };

  const moveStroke = (x, y) => {
    const s = stroke.current;
    if (!s) return;
    const d = docs.current[mode];
    const layer = activeLayer();
    if (s.shape) { s.last = [x, y]; drawShapePreview(x, y); return; }
    if (s.last[0] === x && s.last[1] === y) return;
    const pts = linePoints(s.last[0], s.last[1], x, y).slice(1);
    for (const [px, py] of pts) stamp(d, layer, px, py, { size, shape, soft: tool === 'brush' }, s.op, s.canPaint, s.mir);
    s.last = [x, y];
    rerender();
  };

  const endStroke = () => {
    const s = stroke.current;
    stroke.current = null;
    if (!s) return;
    const d = docs.current[mode];
    const layer = activeLayer();
    if (s.shape) {
      const [x1, y1] = s.last;
      clearShapePreview();
      if (tool === 'gradient') {
        gradient(d, layer, s.x0, s.y0, x1, y1, color, color2, { canPaint: s.canPaint, faceOnly: true });
      } else {
        const pts = tool === 'line' ? linePoints(s.x0, s.y0, x1, y1) : rectPoints(s.x0, s.y0, x1, y1, tool === 'rectFill');
        const op = pixelOp('pencil', { color: s.useColor }, layer, d);
        for (const [px, py] of pts) stamp(d, layer, px, py, { size: tool === 'line' ? size : 1, shape }, op, s.canPaint, s.mir);
      }
      rerender();
    }
    if (tool !== 'eraser') pushRecent(s.useColor);
  };

  function drawShapePreview(x, y) {
    const c = overlay.current;
    const d = docs.current[mode];
    if (!c || !d) return;
    const s = stroke.current;
    c.width = d.w * zoom; c.height = d.h * zoom;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = css(s.useColor);
    ctx.strokeStyle = '#fff';
    if (tool === 'gradient') {
      ctx.beginPath();
      ctx.moveTo((s.x0 + 0.5) * zoom, (s.y0 + 0.5) * zoom);
      ctx.lineTo((x + 0.5) * zoom, (y + 0.5) * zoom);
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    const pts = tool === 'line' ? linePoints(s.x0, s.y0, x, y) : rectPoints(s.x0, s.y0, x, y, tool === 'rectFill');
    for (const [px, py] of pts) ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
  }
  function clearShapePreview() {
    const c = overlay.current;
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  // 2D-события
  const pt2d = (e) => {
    const c = view2d.current;
    const r = c.getBoundingClientRect();
    const d = docs.current[mode];
    const x = Math.floor(((e.clientX - r.left) / r.width) * d.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * d.h);
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return null;
    return [x, y];
  };
  const onDown2d = (e) => {
    const p = pt2d(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    beginStroke(p[0], p[1], e.button, e.altKey);
  };
  const onMove2d = (e) => {
    const p = pt2d(e);
    if (p && (!hover || p[0] !== hover[0] || p[1] !== hover[1])) setHover(p);
    if (p && stroke.current) moveStroke(p[0], p[1]);
  };
  const onWheel2d = (e) => {
    if (!e.ctrlKey) return;
    setZoom((z) => Math.max(3, Math.min(16, z + (e.deltaY < 0 ? 1 : -1))));
  };

  // 3D-события: луч в модель -> пиксель развёртки
  const ray = useRef(new Raycaster());
  const pt3d = (e) => {
    const v = viewerRef.current;
    if (!v) return null;
    const r = canvas3d.current.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.current.setFromCamera(ndc, v.camera);
    const d = docs.current[mode];
    if (mode === 'cape') {
      const capeObj = v.playerObject.cape;
      if (!capeObj) return null;
      const hit = ray.current.intersectObject(capeObj, true)[0];
      if (!hit || !hit.uv) return null;
      const x = Math.min(63, Math.floor(hit.uv.x * 64));
      const y = Math.min(31, Math.floor((1 - hit.uv.y) * 32));
      return capeMask()[y * 64 + x] ? [x, y] : null;
    }
    const sk = v.playerObject.skin;
    const meshes = [];
    for (const p of PARTS) {
      if (hidden[p]) continue;
      if (!hidden.overlay) meshes.push({ mesh: sk[p].outerLayer, part: p, layer: 'overlay' });
      if (!hidden.base) meshes.push({ mesh: sk[p].innerLayer, part: p, layer: 'base' });
    }
    const hits = ray.current.intersectObjects(meshes.map((m) => m.mesh), true);
    const owner = (obj) => {
      for (let o = obj; o; o = o.parent) { const f = meshes.find((m) => m.mesh === o); if (f) return f; }
      return null;
    };
    const comp = compositeData(d);
    const map = pixelMap(d.slim);
    for (const h of hits) {
      const info = owner(h.object);
      if (!info || !h.uv) continue;
      if (paintTarget === 'base' && info.layer !== 'base') continue;
      if (paintTarget === 'overlay' && info.layer !== 'overlay') continue;
      const fx = h.uv.x * 64, fy = (1 - h.uv.y) * 64;
      let best = null;
      let bestD = 9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.floor(fx) + dx, y = Math.floor(fy) + dy;
        if (x < 0 || y < 0 || x > 63 || y > 63) continue;
        const m = map[y * SIZE + x];
        if (!m || m.part !== info.part || m.layer !== info.layer) continue;
        const dd = Math.abs(x + 0.5 - fx) + Math.abs(y + 0.5 - fy);
        if (dd < bestD) { bestD = dd; best = [x, y]; }
      }
      if (!best) continue;
      if (paintTarget === 'auto' && info.layer === 'overlay' && comp[(best[1] * 64 + best[0]) * 4 + 3] === 0 && tool !== 'eraser') continue;
      return best;
    }
    return null;
  };
  const onDown3d = (e) => {
    if (tool === 'rotate' || e.button !== 0) return;
    const p = pt3d(e);
    if (!p) return;
    const shapeTool = TOOLS.find((q) => q.id === tool).shape;
    if (shapeTool) { toast(t('Фигуры рисуются на развёртке (2D)'), 'info'); return; }
    beginStroke(p[0], p[1], 0, e.altKey);
  };
  const onMove3d = (e) => {
    if (!stroke.current) return;
    const p = pt3d(e);
    if (p) {
      // в 3D не тянем линию через другие грани — ставим отдельные точки
      const s = stroke.current;
      const d = docs.current[mode];
      stamp(d, activeLayer(), p[0], p[1], { size, shape, soft: tool === 'brush' }, s.op, s.canPaint, s.mir);
      s.last = p;
      rerender();
    }
  };

  useEffect(() => {
    const up = () => endStroke();
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  });

  // горячие клавиши
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (k === '[') setSize((s) => Math.max(1, s - 1));
      else if (k === ']') setSize((s) => Math.min(8, s + 1));
      else if (k === 'x') { setColor(color2); setColor2(color); }
      else if (k === 'm') setMirror((m) => !m);
      else {
        const tl = TOOLS.find((q) => q.key.toLowerCase() === k);
        if (tl) setTool(tl.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- слои ----------
  const layerOp = (fn) => { const d = docs.current[mode]; pushHistory(); fn(d); rerender(); };
  const addLayer = () => layerOp((d) => {
    const l = makeLayer(t('Слой') + ' ' + (d.layers.length + 1), d.w, d.h);
    const idx = d.layers.findIndex((q) => q.id === d.active);
    d.layers.splice(idx + 1, 0, l);
    d.active = l.id;
  });
  const dupLayer = () => layerOp((d) => {
    const src = activeLayer();
    const l = { ...makeLayer(src.name + ' ' + t('копия'), d.w, d.h, src.data), opacity: src.opacity, blend: src.blend };
    const idx = d.layers.findIndex((q) => q.id === d.active);
    d.layers.splice(idx + 1, 0, l);
    d.active = l.id;
  });
  const delLayer = () => layerOp((d) => {
    if (d.layers.length === 1) { d.layers[0].data.fill(0); return; }
    const idx = d.layers.findIndex((q) => q.id === d.active);
    d.layers.splice(idx, 1);
    d.active = d.layers[Math.max(0, idx - 1)].id;
  });
  const moveLayer = (dir) => layerOp((d) => {
    const idx = d.layers.findIndex((q) => q.id === d.active);
    const j = idx + dir;
    if (j < 0 || j >= d.layers.length) return;
    [d.layers[idx], d.layers[j]] = [d.layers[j], d.layers[idx]];
  });
  const mergeDown = () => layerOp((d) => {
    const idx = d.layers.findIndex((q) => q.id === d.active);
    if (idx <= 0) return;
    const top = d.layers[idx];
    const below = d.layers[idx - 1];
    const tmp = { ...d, layers: [{ ...below, visible: true }, { ...top, visible: true }] };
    const c = document.createElement('canvas');
    composite(tmp, c);
    below.data = c.getContext('2d').getImageData(0, 0, d.w, d.h).data;
    below.opacity = 1;
    below.blend = 'source-over';
    d.layers.splice(idx, 1);
    d.active = below.id;
  });
  const patchLayer = (id, patch, history = false) => {
    const d = docs.current[mode];
    if (history) pushHistory();
    const l = d.layers.find((q) => q.id === id);
    Object.assign(l, patch);
    rerender();
  };

  const setSlim = (slim) => {
    const d = docs.current.skin;
    if (d.slim === slim) return;
    pushHistory();
    d.slim = slim;
    rerender();
  };

  // ---------- шаблоны, проекты, импорт ----------
  const loadTemplate = async (tpl) => {
    setBusy(true);
    try {
      if (mode === 'cape' && tpl.builtin) {
        pushHistory();
        docs.current.cape = makeDoc('cape', [{ name: tpl.name, data: tpl.id === 'empty' ? null : defaultCape() }]);
      } else if (tpl.builtin) {
        pushHistory();
        const d = docs.current.skin;
        docs.current.skin = makeDoc('skin', tpl.make(d.slim), d.slim);
      } else {
        const slim = !!tpl.slim;
        if (tpl.skin) docs.current.skin = await docFromSaved('skin', tpl.skin, slim);
        if (tpl.cape) docs.current.cape = await docFromSaved('cape', tpl.cape, false);
        if (tpl.name && tpl.kind === 'project') setName(tpl.name);
        hist.current = { skin: { undo: [], redo: [] }, cape: { undo: [], redo: [] } };
      }
      setPanel(null);
      rerender();
    } finally { setBusy(false); }
  };

  const savedPayload = (kind) => {
    composite(docs.current.skin, compSkin.current);
    return {
      kind, name, slim: docs.current.skin.slim,
      preview: compSkin.current.toDataURL('image/png'),
      skin: serializeDoc(docs.current.skin),
      cape: serializeDoc(docs.current.cape)
    };
  };
  const saveProject = async () => {
    await call('editor:save', 'projects', name, savedPayload('project'));
    setProjects(await call('editor:list', 'projects'));
    toast(t('Проект сохранён'), 'ok');
  };
  const saveTemplate = async () => {
    await call('editor:save', 'templates', name, savedPayload('template'));
    setUserTemplates(await call('editor:list', 'templates'));
    toast(t('Шаблон сохранён — он появится в списке шаблонов'), 'ok');
  };
  const importPng = async () => {
    const url = await call('dialog:openPng');
    if (!url) return;
    const d = docs.current[mode];
    const data = await loadImageData(url, d.w, d.h);
    layerOp((dd) => { const l = makeLayer(t('Импорт'), dd.w, dd.h, data); dd.layers.push(l); dd.active = l.id; });
  };
  const importEly = async () => {
    if (!elyNick.trim()) return;
    setBusy(true);
    try {
      const r = await call('skin:ely', elyNick.trim());
      if (!r) { toast(t('У этого ника нет скина на Ely.by'), 'warn'); return; }
      const data = await loadImageData(r.dataUrl, 64, 64);
      mode !== 'skin' && setMode('skin');
      const d = docs.current.skin;
      pushHistory();
      const l = makeLayer('Ely.by: ' + elyNick.trim(), 64, 64, data);
      d.layers.push(l);
      d.active = l.id;
      d.slim = r.slim;
      setPanel(null);
      rerender();
    } finally { setBusy(false); }
  };
  const exportPng = async () => {
    const d = docs.current[mode];
    const c = document.createElement('canvas');
    composite(d, c);
    const p = await call('dialog:savePng', { dataUrl: c.toDataURL('image/png'), name: name + (mode === 'cape' ? '-cape' : '') });
    if (p) toast(t('Сохранено: ') + p, 'ok');
  };
  const finalImages = () => {
    composite(docs.current.skin, compSkin.current);
    composite(docs.current.cape, compCape.current);
    const capeEmpty = isEmpty(compositeData(docs.current.cape));
    return { skin: compSkin.current.toDataURL('image/png'), cape: capeEmpty ? null : compCape.current.toDataURL('image/png'), slim: docs.current.skin.slim, name };
  };
  const applyInGame = async () => {
    await call('skin:apply', finalImages());
    toast(t('Скин надет! Если игра запущена, он сменится через пару секунд.'), 'ok', 6000);
  };
  const toWardrobe = async () => {
    await call('wardrobe:save', finalImages());
    toast(t('Добавлено в гардероб'), 'ok');
  };

  const palette = useMemo(() => {
    const d = docs.current[mode];
    if (!d) return [];
    return extractPalette(compositeData(d), 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, mode]);

  if (!doc) return <div className="editor"><div className="editor-loading">{t('Загрузка редактора…')}</div></div>;

  const hoverInfo = hover && mode === 'skin' ? pixelMap(doc.slim)[hover[1] * SIZE + hover[0]] : null;
  const curTool = TOOLS.find((q) => q.id === tool);
  const al = activeLayer();
  const FACE_NAMES = { top: 'верх', bottom: 'низ', front: 'перед', back: 'спина', right: 'правый бок', left: 'левый бок' };

  return (
    <div className="editor">
      <div className="ed-top">
        <button className="btn ghost" onClick={onClose}><Icon name="close" /> {t('Закрыть')}</button>
        <input className="input ed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Название скина')} />
        <div className="seg">
          <button className={mode === 'skin' ? 'on' : ''} onClick={() => { setMode('skin'); rerender(); }}><Icon name="shirt" /> {t('Скин')}</button>
          <button className={mode === 'cape' ? 'on' : ''} onClick={() => { setMode('cape'); rerender(); }}><Icon name="cape" /> {t('Плащ')}</button>
        </div>
        {mode === 'skin' && (
          <div className="seg">
            <button className={!doc.slim ? 'on' : ''} onClick={() => setSlim(false)}>{t('Классика')}</button>
            <button className={doc.slim ? 'on' : ''} onClick={() => setSlim(true)}>{t('Тонкие руки')}</button>
          </div>
        )}
        <div className="ed-top-group">
          <button className="btn icon-btn" title={t('Отменить') + ' (Ctrl+Z)'} onClick={undo}><Icon name="undo" /></button>
          <button className="btn icon-btn" title={t('Вернуть') + ' (Ctrl+Y)'} onClick={redo}><Icon name="redo" /></button>
        </div>
        <div className="ed-top-group">
          <button className="btn" onClick={() => setPanel(panel === 'templates' ? null : 'templates')}><Icon name="template" /> {t('Шаблоны')}</button>
          <button className="btn" onClick={() => setPanel(panel === 'projects' ? null : 'projects')}><Icon name="folder" /> {t('Проекты')}</button>
          <button className="btn" onClick={() => setPanel(panel === 'import' ? null : 'import')}><Icon name="upload" /> {t('Импорт')}</button>
          <button className="btn" onClick={exportPng}><Icon name="download" /> PNG</button>
        </div>
        <div className="grow" />
        <button className="btn" onClick={saveProject}><Icon name="save" /> {t('Сохранить')}</button>
        <button className="btn" onClick={toWardrobe}><Icon name="shirt" /> {t('В гардероб')}</button>
        <button className="btn primary" onClick={applyInGame}><Icon name="check" /> {t('Надеть в игре')}</button>
      </div>

      <div className="ed-body">
        <div className="ed-tools">
          {TOOLS.map((tl) => (
            <button key={tl.id} className={'tool' + (tool === tl.id ? ' on' : '')} title={`${t(tl.name)} (${tl.key})`} onClick={() => setTool(tl.id)}>
              <Icon name={tl.icon} size={20} />
            </button>
          ))}
          <div className="tool-sep" />
          <button className={'tool' + (mirror ? ' on' : '')} title={t('Зеркало') + ' (M)'} onClick={() => setMirror(!mirror)}><Icon name="mirror" size={20} /></button>
          <button className={'tool' + (grid ? ' on' : '')} title={t('Сетка')} onClick={() => setGrid(!grid)}><Icon name="grid" size={20} /></button>
          <div className="tool-colors" title={t('Основной / второй цвет (X — поменять)')}>
            <div className="tc tc2 checker"><span style={{ background: css(color2) }} /></div>
            <div className="tc tc1 checker"><span style={{ background: css(color) }} /></div>
            <button className="tc-swap" onClick={() => { setColor(color2); setColor2(color); }}>⇄</button>
          </div>
        </div>

        <div className="ed-main">
          <div className="ed-options">
            <span className="ed-tool-name">{t(curTool.name)}</span>
            {(PAINT_TOOLS.has(tool) || tool === 'line') && (
              <label className="opt">{t('Размер')} <input type="range" min="1" max="8" value={size} onChange={(e) => setSize(+e.target.value)} /> <b>{size}</b></label>
            )}
            {PAINT_TOOLS.has(tool) && size > 2 && (
              <div className="seg sm">
                <button className={shape === 'square' ? 'on' : ''} onClick={() => setShape('square')}>■</button>
                <button className={shape === 'circle' ? 'on' : ''} onClick={() => setShape('circle')}>●</button>
              </div>
            )}
            {['brush', 'eraser', 'lighten', 'darken', 'blend'].includes(tool) && (
              <label className="opt">{t('Сила')} <input type="range" min="0.05" max="1" step="0.05" value={strength} onChange={(e) => setStrength(+e.target.value)} /> <b>{Math.round(strength * 100)}%</b></label>
            )}
            {tool === 'dither' && (
              <label className="opt">{t('Разброс')} <input type="range" min="0.02" max="0.5" step="0.01" value={noise} onChange={(e) => setNoise(+e.target.value)} /> <b>{Math.round(noise * 100)}%</b></label>
            )}
            {tool === 'fill' && (
              <>
                <div className="seg sm">
                  <button className={fillMode === 'contiguous' ? 'on' : ''} onClick={() => setFillMode('contiguous')}>{t('Область')}</button>
                  <button className={fillMode === 'face' ? 'on' : ''} onClick={() => setFillMode('face')}>{t('Вся грань')}</button>
                  <button className={fillMode === 'global' ? 'on' : ''} onClick={() => setFillMode('global')}>{t('Этот цвет везде')}</button>
                </div>
                {fillMode !== 'face' && <label className="opt">{t('Допуск')} <input type="range" min="0" max="60" value={tolerance} onChange={(e) => setTolerance(+e.target.value)} /> <b>{tolerance}</b></label>}
              </>
            )}
            {tool === 'gradient' && <span className="hint">{t('Тяни от основного цвета ко второму — заливка в пределах грани')}</span>}
            <div className="grow" />
            {mode === 'skin' && (
              <label className="opt">{t('Рисовать в 3D на')}
                <select className="input sm" value={paintTarget} onChange={(e) => setPaintTarget(e.target.value)}>
                  <option value="auto">{t('авто')}</option>
                  <option value="base">{t('основной слой')}</option>
                  <option value="overlay">{t('внешний слой')}</option>
                </select>
              </label>
            )}
            <div className="seg sm">
              <button className={view === 'uv' ? 'on' : ''} onClick={() => setView('uv')}>2D</button>
              <button className={view === 'both' ? 'on' : ''} onClick={() => setView('both')}>2D+3D</button>
              <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
            </div>
          </div>

          <div className={'ed-views view-' + view}>
            {view !== '3d' && (
              <div className="ed-uv" onWheel={onWheel2d}>
                <div className="uv-stack" style={{ width: doc.w * zoom, height: doc.h * zoom }}>
                  <canvas ref={view2d} className="uv-canvas" onPointerDown={onDown2d} onPointerMove={onMove2d} onPointerLeave={() => setHover(null)} onContextMenu={(e) => e.preventDefault()} />
                  <canvas ref={overlay} className="uv-overlay" />
                </div>
                <div className="uv-foot">
                  <span>{hover ? `${hover[0]}, ${hover[1]}` : '—'}</span>
                  {hoverInfo && <span>{t(PART_NAMES[hoverInfo.part])} · {t(FACE_NAMES[hoverInfo.face])} · {hoverInfo.layer === 'base' ? t('основной') : t('внешний')}</span>}
                  <div className="grow" />
                  <button className="btn icon-btn sm" onClick={() => setZoom((z) => Math.max(3, z - 1))}>−</button>
                  <span>{zoom * 100 / 8 | 0}%</span>
                  <button className="btn icon-btn sm" onClick={() => setZoom((z) => Math.min(16, z + 1))}>+</button>
                </div>
              </div>
            )}
            {view !== 'uv' && (
              <div className="ed-3d" ref={wrap3d}>
                <canvas ref={canvas3d} className={'ed-3d-canvas' + (tool === 'rotate' ? ' grab' : ' paint')} onPointerDown={onDown3d} onPointerMove={onMove3d} onContextMenu={(e) => e.preventDefault()} />
                <div className="ed-3d-bar">
                  <div className="seg sm">
                    <button className={pose === 'idle' ? 'on' : ''} onClick={() => setPose('idle')}>{t('Стоит')}</button>
                    <button className={pose === 'walk' ? 'on' : ''} onClick={() => setPose('walk')}>{t('Идёт')}</button>
                    <button className={pose === 'static' ? 'on' : ''} onClick={() => setPose('static')}>{t('Замер')}</button>
                  </div>
                  <span className="hint">{t('ПКМ — вращать, колесо — масштаб')}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ed-side">
          <div className="ed-card">
            <ColorPicker color={color} onChange={setColor} recent={recent} t={t} extraPalette={palette} />
          </div>
          {mode === 'skin' && (
            <div className="ed-card">
              <div className="ed-card-title">{t('Части тела')}</div>
              <div className="parts">
                <div className="parts-figure">
                  <button className={'pf head' + (hidden.head ? ' off' : '')} onClick={() => setHidden({ ...hidden, head: !hidden.head })} title={t('Голова')} />
                  <button className={'pf rarm' + (hidden.rightArm ? ' off' : '')} onClick={() => setHidden({ ...hidden, rightArm: !hidden.rightArm })} title={t('Правая рука')} />
                  <button className={'pf body' + (hidden.body ? ' off' : '')} onClick={() => setHidden({ ...hidden, body: !hidden.body })} title={t('Тело')} />
                  <button className={'pf larm' + (hidden.leftArm ? ' off' : '')} onClick={() => setHidden({ ...hidden, leftArm: !hidden.leftArm })} title={t('Левая рука')} />
                  <button className={'pf rleg' + (hidden.rightLeg ? ' off' : '')} onClick={() => setHidden({ ...hidden, rightLeg: !hidden.rightLeg })} title={t('Правая нога')} />
                  <button className={'pf lleg' + (hidden.leftLeg ? ' off' : '')} onClick={() => setHidden({ ...hidden, leftLeg: !hidden.leftLeg })} title={t('Левая нога')} />
                </div>
                <div className="parts-opts">
                  <label className="check"><input type="checkbox" checked={!hidden.base} onChange={() => setHidden({ ...hidden, base: !hidden.base })} /> {t('Основной слой')}</label>
                  <label className="check"><input type="checkbox" checked={!hidden.overlay} onChange={() => setHidden({ ...hidden, overlay: !hidden.overlay })} /> {t('Внешний слой')}</label>
                  <button className="btn sm" onClick={() => setHidden(emptyHidden())}>{t('Показать всё')}</button>
                  <span className="hint">{t('Скрытые части нельзя случайно закрасить')}</span>
                </div>
              </div>
            </div>
          )}
          <div className="ed-card layers-card">
            <div className="ed-card-title">
              <Icon name="layers" /> {t('Слои')}
              <div className="grow" />
              <button className="btn icon-btn sm" title={t('Новый слой')} onClick={addLayer}><Icon name="plus" size={14} /></button>
              <button className="btn icon-btn sm" title={t('Дублировать')} onClick={dupLayer}><Icon name="copy" size={14} /></button>
              <button className="btn icon-btn sm" title={t('Слить с нижним')} onClick={mergeDown}><Icon name="merge" size={14} /></button>
              <button className="btn icon-btn sm" title={t('Выше')} onClick={() => moveLayer(1)}><Icon name="up" size={14} /></button>
              <button className="btn icon-btn sm" title={t('Ниже')} onClick={() => moveLayer(-1)}><Icon name="down" size={14} /></button>
              <button className="btn icon-btn sm danger" title={t('Удалить')} onClick={delLayer}><Icon name="trash" size={14} /></button>
            </div>
            <div className="layers">
              {[...doc.layers].reverse().map((l) => (
                <div key={l.id} className={'layer' + (l.id === doc.active ? ' on' : '')} onClick={() => { doc.active = l.id; rerender(); }}>
                  <button className="lv" onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { visible: !l.visible }); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} /></button>
                  <LayerThumb layer={l} w={doc.w} h={doc.h} tick={tick} />
                  <input className="layer-name" value={l.name} onChange={(e) => patchLayer(l.id, { name: e.target.value })} onClick={(e) => e.stopPropagation()} />
                  <button className={'lv' + (l.lockAlpha ? ' on' : '')} title={t('Рисовать только по уже закрашенному')} onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { lockAlpha: !l.lockAlpha }); }}><Icon name="dither" size={12} /></button>
                  <button className={'lv' + (l.locked ? ' on' : '')} title={t('Заблокировать')} onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { locked: !l.locked }); }}><Icon name={l.locked ? 'lock' : 'unlock'} size={12} /></button>
                </div>
              ))}
            </div>
            {al && (
              <div className="layer-props">
                <label className="opt">{t('Прозрачность')} <input type="range" min="0" max="1" step="0.05" value={al.opacity} onChange={(e) => patchLayer(al.id, { opacity: +e.target.value })} /> <b>{Math.round(al.opacity * 100)}%</b></label>
                <label className="opt">{t('Режим')}
                  <select className="input sm" value={al.blend} onChange={(e) => patchLayer(al.id, { blend: e.target.value }, true)}>
                    {BLENDS.map(([v, n]) => <option key={v} value={v}>{t(n)}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {panel && (
        <div className="ed-drawer">
          <div className="ed-drawer-head">
            <b>{panel === 'templates' ? t('Шаблоны') : panel === 'projects' ? t('Мои проекты') : t('Импорт')}</b>
            <div className="grow" />
            {panel === 'templates' && <button className="btn sm" onClick={saveTemplate}><Icon name="plus" size={14} /> {t('Сохранить текущий как шаблон')}</button>}
            <button className="btn icon-btn sm" onClick={() => setPanel(null)}><Icon name="close" size={14} /></button>
          </div>
          {panel === 'templates' && (
            <div className="tpl-grid">
              {BUILTIN_TEMPLATES.map((tp) => <TemplateCard key={tp.id} name={t(tp.name)} make={() => tp.make(doc.slim)} onClick={() => loadTemplate({ ...tp, builtin: true })} />)}
              {userTemplates.map((tp) => (
                <div key={tp.id} className="tpl" onClick={() => loadTemplate(tp)}>
                  <MiniPreview src={tp.preview} />
                  <span>{tp.name}</span>
                  <button className="tpl-del" onClick={async (e) => { e.stopPropagation(); await call('editor:remove', 'templates', tp.id); setUserTemplates(await call('editor:list', 'templates')); }}><Icon name="trash" size={12} /></button>
                </div>
              ))}
            </div>
          )}
          {panel === 'projects' && (
            <div className="tpl-grid">
              {projects.length === 0 && <div className="empty">{t('Пока нет сохранённых проектов. Нажми «Сохранить» сверху.')}</div>}
              {projects.map((p) => (
                <div key={p.id} className="tpl" onClick={() => loadTemplate(p)}>
                  <MiniPreview src={p.preview} />
                  <span>{p.name}</span>
                  <button className="tpl-del" onClick={async (e) => { e.stopPropagation(); await call('editor:remove', 'projects', p.id); setProjects(await call('editor:list', 'projects')); }}><Icon name="trash" size={12} /></button>
                </div>
              ))}
            </div>
          )}
          {panel === 'import' && (
            <div className="import-box">
              <button className="btn" onClick={importPng}><Icon name="image" /> {t('PNG с компьютера (новым слоем)')}</button>
              <div className="row">
                <input className="input" placeholder={t('Ник на Ely.by')} value={elyNick} onChange={(e) => setElyNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importEly()} />
                <button className="btn" disabled={busy} onClick={importEly}>{t('Взять скин')}</button>
              </div>
              <span className="hint">{t('Скин встанет отдельным слоем — можно дорисовать поверх.')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LayerThumb({ layer, w, h, tick }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(layer.data), w, h), 0, 0);
  }, [layer, layer.data, tick, w, h]);
  return <canvas ref={ref} className="layer-thumb checker" />;
}

function MiniPreview({ src }) {
  return (
    <div className="tpl-prev checker">
      {src ? <img src={src} alt="" /> : null}
    </div>
  );
}

function TemplateCard({ name, make, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const layers = make();
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    for (const l of layers) {
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 64;
      tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(l.data), 64, 64), 0, 0);
      ctx.drawImage(tmp, 0, 0);
    }
    setSrc(c.toDataURL());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="tpl" onClick={onClick}>
      <MiniPreview src={src} />
      <span>{name}</span>
    </div>
  );
}
