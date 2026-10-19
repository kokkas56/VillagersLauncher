// Видовое окно: сюда встраивается окно игры (Windows). Пока игра не встроена — «схема сверху» (план XZ) со всеми
// объектами сцены: камеры с конусом обзора и путём, свет, метки, пути, актёры, копии клонеров. Объекты можно двигать.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import { useStudio } from './core.jsx';
import I, { TYPE_COLOR } from './icons.jsx';
import { useMenu, MenuView } from './Menus.jsx';
import { viewCenter } from './actions.js';
import { worldPos, propsAt, activeCamera, clonerOutput, actorPosAt, isActive, objById, cameraPose } from '../scene3d.js';
import { smoothPath } from '../mograph.js';
import { setChan } from './ops.js';

const r2 = (n) => Math.round(n * 100) / 100;
const TOOL_RU = { select: 'Выбор', move: 'Перемещение', rotate: 'Поворот', scale: 'Масштаб' };

export default function Viewport({ visible = true }) {
  const core = useStudio();
  const { embed, embedCmd, hp, link, game, gameCmd, gameState, scene } = core;
  const hostRef = useRef(null);
  const [menu, openMenu, closeMenu] = useMenu();
  const [card, setCard] = useState(true);
  const embedded = embed.mode === 'embedded';

  // сообщать главному процессу прямоугольник видового окна (для встроенной игры)
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    let raf = 0;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        call('studio:embedRect', { x: r.left, y: r.top, w: r.width, h: r.height, dpr: window.devicePixelRatio || 1, visible }).catch(() => {});
      });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    report();
    return () => { ro.disconnect(); window.removeEventListener('resize', report); cancelAnimationFrame(raf); call('studio:embedRect', { x: 0, y: 0, w: 1, h: 1, visible: false }).catch(() => {}); };
  }, [visible]);

  const running = gameState && ['starting', 'running', 'preparing'].includes(gameState.state);
  const cams = scene ? scene.objects.filter((o) => o.type === 'camera') : [];
  const act = scene ? activeCamera(scene, core.time) : null;
  const viewMenu = (e, which) => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = { x: r.left, y: r.bottom };
    if (which === 'cams') openMenu(e, [
      { label: 'Камера Студии в игре', icon: 'gamecam', checked: game.editorCam, hint: 'Камера отделяется от игрока: Alt+ЛКМ — вращать, Alt+СКМ — двигать, Alt+ПКМ/колесо — приближать, ПКМ+WASD/QE — лететь (Shift — быстрее). F6 или Esc в игре — выйти.', run: () => gameCmd.editorCam(!game.editorCam) },
      { sep: true }, { head: 'Смотреть через камеру' },
      { label: 'Не смотреть (свободно)', checked: !game.lookThrough, run: () => gameCmd.lookThrough(null) },
      ...cams.map((c) => ({ label: c.name + (act && act.id === c.id ? ' — снимает сейчас' : ''), icon: 'camera', checked: game.lookThrough === c.id, hint: 'Вид в игре встанет на место камеры «' + c.name + '» и поедет с ней при прокрутке таймлайна.', run: () => gameCmd.lookThrough(c.id) }))
    ], at);
    if (which === 'game') openMenu(e, [
      { label: 'Встроить окно игры', icon: 'embed', disabled: embedded, hint: 'Окно Minecraft станет частью Студии — прямо здесь, в видовом окне (только Windows).', run: () => embedCmd('embed') },
      { label: 'Разместить рядом', icon: 'side', hint: 'Студия слева, игра справа.', run: () => embedCmd('side') },
      { label: 'Отстыковать', icon: 'undock', disabled: !embedded, hint: 'Вернуть окно игры отдельным окном.', run: () => embedCmd('undock') },
      { sep: true },
      { label: running ? 'Игра запущена' : 'Запустить игру', icon: 'play', disabled: running, hint: 'Запустить Minecraft через лаунчер (как кнопка «Играть»).', run: () => call('game:play', {}).catch((er) => core.toast(er.message, 'error', 7000)) },
      { label: 'Режим разработчика в игре', checked: !!(core.boot && core.boot.dev), hint: 'Файл studio/.dev: игра читает сцены прямо из Студии, открывает живую связь и Камеру Студии. Нужен перезапуск игры.', run: async () => { try { const d = await call('studio:devMode', !(core.boot && core.boot.dev)); core.setBoot({ ...core.boot, dev: d }); core.toast(d ? 'Режим разработчика включён — перезапусти игру' : 'Режим разработчика выключен', 'ok'); } catch (er) { core.toast(er.message, 'error'); } } }
    ], at);
    if (which === 'show') openMenu(e, [
      { label: 'Шейдеры', icon: 'shaders', checked: !!game.shaders, disabled: game.shadersAvail === false, hint: 'Включить/выключить шейдеры Iris в игре.', run: () => gameCmd.shaders(!game.shaders) },
      { label: 'Свет сцены в мире', icon: 'light', checked: !!game.lights, hint: 'Поставить блоки света у объектов «Свет», чтобы видеть освещение (потом уберутся).', run: () => gameCmd.lights(!game.lights) },
      { label: 'Скрыть интерфейс игры', icon: 'hud', checked: !!game.hud, hint: 'Спрятать хотбар и сердечки, пока включена Камера Студии.', run: () => gameCmd.hud(!game.hud) },
      { sep: true },
      { label: 'Показать выбранное', icon: 'frame', kb: 'H', run: () => gameCmd.frame() }
    ], at);
  };
  const mode = embedded ? 'Перспектива · Камера Студии' : 'Сверху · Схема';
  return (
    <div className="c4-vp" style={visible ? undefined : { display: 'none' }}>
      <div className="c4-vp-menu">
        <button onMouseDown={(e) => { e.stopPropagation(); viewMenu(e, 'cams'); }} {...hp('Камеры: Камера Студии в игре и «смотреть через» камеру сцены.')}>Камеры</button>
        <button onMouseDown={(e) => { e.stopPropagation(); viewMenu(e, 'show'); }} {...hp('Что показывать в игре: шейдеры, свет, интерфейс.')}>Показ</button>
        <button onMouseDown={(e) => { e.stopPropagation(); viewMenu(e, 'game'); }} {...hp('Окно игры: встроить сюда, разместить рядом, отстыковать; запустить игру.')}>Окно игры</button>
        <span className="dim" style={{ marginLeft: 10 }}>{mode}</span>
        <div className="c4-vp-ic">
          <button className={'c4-ib' + (game.editorCam ? ' on' : '')} onClick={() => gameCmd.editorCam(!game.editorCam)} {...hp('Камера Студии в игре (F6 в игре). ПКМ+WASD/QE — полёт, Alt+мышь — как в C4D.')}><I name="gamecam" size={14} /></button>
          <button className={'c4-ib' + (embedded ? ' on' : '')} onClick={() => embedCmd(embedded ? 'undock' : 'embed')} {...hp(embedded ? 'Отстыковать окно игры.' : 'Встроить окно игры в Студию.')}><I name={embedded ? 'undock' : 'embed'} size={14} /></button>
          <button className="c4-ib" onClick={() => embedCmd('side')} {...hp('Разместить окна рядом: Студия слева, игра справа.')}><I name="side" size={14} /></button>
        </div>
      </div>
      <div ref={hostRef} className={'c4-vp-host' + (embedded ? ' embedded' : '')}>
        {!embedded && <Schematic />}
        {!embedded && <div className="c4-vp-label">{mode}</div>}
        {!embedded && act && <div className="c4-vp-cam">{act.name} ⧉</div>}
        {!embedded && <div className="c4-vp-tool">{TOOL_RU[core.tool]} ✥</div>}
        {!embedded && card && (
          <div className="c4-vp-card" onMouseDown={(e) => e.stopPropagation()}>
            <h4><span className={'c4-led ' + (link.connected ? 'on' : running ? 'off' : 'bad')} />{link.connected ? 'Игра на связи' : running ? 'Игра запускается…' : 'Игра не запущена'}<span className="grow" /><button className="c4-ib" style={{ width: 20, height: 20 }} onClick={() => setCard(false)} title="Спрятать"><I name="close" size={11} /></button></h4>
            {link.connected
              ? <p>{[link.info && link.info.world, link.info && link.info.dim].filter(Boolean).join(' · ') || 'мир открыт'}. Встрой окно игры сюда — оно станет видовым окном Студии (как в Cinema 4D). Или разложи окна рядом.</p>
              : <p>Запусти игру через лаунчер с включённым режимом разработчика — Студия сама найдёт её. Пока игры нет, здесь схема сцены сверху: двигай объекты мышью.</p>}
            {embed.why && <p className="why">{embed.why}</p>}
            {embed.helper === 'missing' && <p className="why">Помощник встраивания (PowerShell) недоступен — доступно только «Разместить рядом».</p>}
            {embed.platform && embed.platform !== 'win32' && <p className="why">Встраивание есть только в Windows — здесь окна раскладываются рядом.</p>}
            <div className="row">
              {!running && !link.connected && <button className="c4-btn prim" onClick={() => call('game:play', {}).catch((er) => core.toast(er.message, 'error', 7000))} {...hp('Запустить Minecraft через лаунчер.')}><I name="play" size={13} /> Запусти игру</button>}
              <button className="c4-btn" disabled={embed.mode === 'pending' || (!running && !link.connected)} onClick={() => embedCmd('embed')} {...hp('Встроить окно Minecraft в видовое окно Студии (Windows).')}><I name="embed" size={13} /> {embed.mode === 'pending' ? 'Встраиваю…' : 'Встроить окно игры'}</button>
              <button className="c4-btn" onClick={() => embedCmd('side')} {...hp('Студия слева, игра справа.')}><I name="side" size={13} /> Разместить рядом</button>
            </div>
          </div>
        )}
        {!embedded && !card && <button className="c4-btn sm" style={{ position: 'absolute', right: 10, top: 34, zIndex: 5 }} onClick={() => setCard(true)}><span className={'c4-led ' + (link.connected ? 'on' : 'bad')} /> Игра</button>}
      </div>
      <MenuView menu={menu} close={closeMenu} hp={hp} />
    </div>
  );
}

// ---------- схема сверху ----------
function Schematic() {
  const core = useStudio();
  const { scene, time, sel, setSel, edit, gesture, tool, axes, snap, autoKey, hp } = core;
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [view, setView] = useState({ cx: 0, cz: 0, k: 6 }); // k — пикселей на блок
  const [hover, setHover] = useState(null);
  const fitted = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 });
    return () => ro.disconnect();
  }, []);
  const SX = (x) => size.w / 2 + (x - view.cx) * view.k;
  const SZ = (z) => size.h / 2 + (z - view.cz) * view.k;
  const WX = (sx) => view.cx + (sx - size.w / 2) / view.k;
  const WZ = (sz) => view.cz + (sz - size.h / 2) / view.k;
  useEffect(() => { viewCenter.pos = [Math.round(view.cx), 64, Math.round(view.cz)]; }, [view]);

  // что рисовать
  const items = useMemo(() => {
    if (!scene) return [];
    const out = [];
    const len = scene.length || 200;
    for (const o of scene.objects) {
      if (o.visible === false) continue;
      const on = isActive(scene, o);
      const it = { o, on };
      if (o.type === 'camera') {
        const pose = cameraPose(scene, o, time);
        it.pos = pose.pos; it.yaw = pose.yaw; it.fov = pose.fov;
        if (Object.keys(o.anim || {}).length) { const pts = []; for (let t = 0; t <= len; t += 4) pts.push(worldPos(scene, o, t)); it.trail = pts.filter(Boolean); }
      } else if (o.type === 'actor') {
        const p = actorPosAt(scene, o.actor, time);
        if (p) { it.pos = p.pos; it.yaw = p.yaw; }
        const tr = (scene.tracks || []).find((x) => x.kind === 'actor' && x.actor === o.actor);
        it.walks = ((tr && tr.events) || []).filter((e) => e.do === 'walk' && Array.isArray(e.path)).map((e) => e.path);
      } else if (o.type === 'path') {
        const wp = worldPos(scene, o, time) || [0, 0, 0];
        const p = propsAt(o, time);
        it.points = (p.points || []).map((q) => q.map((v, i) => v + wp[i]));
        if (p.closed && it.points.length > 2) it.points = [...it.points, it.points[0]];
        it.line = p.smooth === false ? it.points : smoothPath(it.points, 8);
        it.pos = it.points[0];
      } else if (o.type === 'cloner') {
        it.pos = worldPos(scene, o, time);
        try { it.clones = clonerOutput(scene, o, time).slice(0, 8000); } catch (_) { it.clones = []; }
      } else if (o.type === 'light') {
        it.pos = worldPos(scene, o, time);
        const p = propsAt(o, time);
        it.lit = !!p.on; it.extra = (p.positions || []);
      } else if (['block', 'template', 'effector'].includes(o.type)) continue;
      else it.pos = worldPos(scene, o, time);
      if (it.pos || it.points) out.push(it);
    }
    return out;
  }, [scene, time]);

  // вписать всё при открытии сцены
  useEffect(() => {
    if (!scene || fitted.current === scene.id || !size.w) return;
    fitted.current = scene.id;
    const pts = [];
    for (const it of items) { if (it.pos) pts.push(it.pos); (it.points || []).forEach((p) => pts.push(p)); (it.clones || []).slice(0, 200).forEach((c) => pts.push(c.pos)); }
    if (!pts.length) { setView({ cx: 0, cz: 0, k: 6 }); return; }
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const k = Math.max(1, Math.min(24, Math.min((size.w - 120) / Math.max(8, x1 - x0), (size.h - 100) / Math.max(8, z1 - z0))));
    setView({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, k });
  }, [scene && scene.id, items, size.w]); // eslint-disable-line

  // колесо — масштаб вокруг курсора
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, mz = e.clientY - r.top;
      setView((v) => {
        const k2 = Math.min(60, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0015)));
        const wx = v.cx + (mx - size.w / 2) / v.k, wz = v.cz + (mz - size.h / 2) / v.k;
        return { k: k2, cx: wx - (mx - size.w / 2) / k2, cz: wz - (mz - size.h / 2) / k2 };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [size]);

  if (!scene) return <svg className="schem" ref={ref}><Grid {...{ SX, SZ, WX, WZ, size, view }} /></svg>;

  const hit = (sx, sz) => {
    let best = null, bd = 12;
    for (const it of items) {
      const cand = [];
      if (it.pos) cand.push(it.pos);
      if (it.points) cand.push(...it.points);
      for (const p of cand) { const d = Math.hypot(SX(p[0]) - sx, SZ(p[2]) - sz); if (d < bd) { bd = d; best = it.o; } }
    }
    return best;
  };
  const onDown = (e) => {
    const r = ref.current.getBoundingClientRect();
    const sx = e.clientX - r.left, sz = e.clientY - r.top;
    // сдвиг вида: СКМ или Alt+ЛКМ/ПКМ
    if (e.button === 1 || (e.altKey && e.button === 0) || e.button === 2) {
      e.preventDefault();
      const v0 = view, x0 = e.clientX, y0 = e.clientY;
      const mv = (ev) => setView({ ...v0, cx: v0.cx - (ev.clientX - x0) / v0.k, cz: v0.cz - (ev.clientY - y0) / v0.k });
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      return;
    }
    if (e.button !== 0) return;
    const o = hit(sx, sz);
    if (!o) { if (!e.shiftKey) setSel({}); return; }
    const ids = e.shiftKey ? (sel.objs.includes(o.id) ? sel.objs.filter((x) => x !== o.id) : [...sel.objs, o.id]) : sel.objs.includes(o.id) ? sel.objs : [o.id];
    setSel({ objs: ids });
    if (tool === 'select' || e.shiftKey) return;
    // перетаскивание: перемещение по XZ или поворот камеры
    const t = core.timeRef.current;
    const s0 = core.sceneRef.current;
    const starts = ids.map((id) => { const ob = objById(s0, id); return ob && { ob, p: (ob.type === 'actor' ? ((s0.actors.find((a) => a.id === ob.actor) || {}).spawn || {}).pos : propsAt(ob, t).pos) || null, yaw: ob.type === 'camera' ? (propsAt(ob, t).rot || [0])[0] : 0 }; }).filter((x) => x && x.p);
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) { moved = true; gesture(); }
      let dx = (ev.clientX - x0) / view.k, dz = (ev.clientY - y0) / view.k;
      const st = snap ? (ev.shiftKey ? 0 : 0.5) : ev.shiftKey ? 0.5 : 0;
      if (st) { dx = Math.round(dx / st) * st; dz = Math.round(dz / st) * st; }
      if (axes.x === false) dx = 0;
      if (axes.z === false) dz = 0;
      edit((s) => starts.reduce((acc, { ob, p, yaw }) => {
        if (tool === 'rotate') {
          if (ob.type !== 'camera') return acc;
          const wp = worldPos(acc, objById(acc, ob.id), t) || p;
          const r = ref.current.getBoundingClientRect();
          const ang = Math.atan2(-(WX(ev.clientX - r.left) - wp[0]), WZ(ev.clientY - r.top) - wp[2]) * 180 / Math.PI;
          let a = r2(ang);
          if (snap) a = Math.round(a / 15) * 15;
          void yaw;
          return setChan(acc, ob.id, 'rot.h', t, a, autoKey);
        }
        const np = [r2(p[0] + dx), p[1], r2(p[2] + dz)];
        if (ob.type === 'actor') return { ...acc, actors: acc.actors.map((a) => (a.id === ob.actor ? { ...a, spawn: { ...(a.spawn || {}), pos: np } } : a)) };
        if (ob.type === 'path' || ob.type === 'group' || ob.type === 'cloner' || ob.type === 'light' || ob.type === 'marker' || ob.type === 'sound' || ob.type === 'camera') {
          let x = setChan(acc, ob.id, 'pos.x', t, np[0], autoKey);
          x = setChan(x, ob.id, 'pos.z', t, np[2], autoKey);
          return x;
        }
        return acc;
      }, s), { silent: true });
    };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const selSet = new Set(sel.objs);
  const actCam = activeCamera(scene, time);
  const cloneD = (it) => {
    const s = Math.max(1, view.k);
    let d = '';
    for (const c of it.clones) { const x = SX(c.pos[0]), z = SZ(c.pos[2]); if (x < -s || z < -s || x > size.w + s || z > size.h + s) continue; d += `M${x.toFixed(1)} ${z.toFixed(1)}h${s.toFixed(1)}v${s.toFixed(1)}h${(-s).toFixed(1)}z`; }
    return d;
  };
  return (
    <svg className="schem" ref={ref} onMouseDown={onDown} onContextMenu={(e) => e.preventDefault()}
      onMouseMove={(e) => { const r = ref.current.getBoundingClientRect(); setHover([Math.floor(WX(e.clientX - r.left)), Math.floor(WZ(e.clientY - r.top))]); }} onMouseLeave={() => setHover(null)}
      {...hp('Схема сцены сверху (север вверху). ЛКМ — выбрать и тянуть (по X/Z), колесо — масштаб, СКМ или Alt+мышь — сдвиг. Инструмент «Поворот» (R) крутит камеру.')}>
      <Grid {...{ SX, SZ, WX, WZ, size, view }} />
      {items.filter((it) => it.clones).map((it) => <path key={'cl' + it.o.id} d={cloneD(it)} fill={selSet.has(it.o.id) ? 'rgba(160,230,140,0.75)' : 'rgba(127,211,107,0.42)'} stroke="rgba(20,40,20,0.6)" strokeWidth={view.k > 4 ? 0.6 : 0} />)}
      {items.map((it) => {
        const o = it.o;
        const sl = selSet.has(o.id);
        const col = sl ? '#ffd84a' : TYPE_COLOR[o.type] || '#ccc';
        const op = it.on ? 1 : 0.4;
        const lbl = (x, z) => <text x={x + 9} y={z - 7} fill={sl ? '#ffe680' : '#d8d8d8'} fontSize="11" style={{ paintOrder: 'stroke' }} stroke="#1e1e1e" strokeWidth="3">{o.name}</text>;
        if (o.type === 'camera') {
          const x = SX(it.pos[0]), z = SZ(it.pos[2]);
          const yr = (it.yaw * Math.PI) / 180;
          const dir = [-Math.sin(yr), Math.cos(yr)];
          const half = ((it.fov || 70) / 2) * Math.PI / 180;
          const L = 46;
          const rot = (a) => [dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a)];
          const a1 = rot(half), a2 = rot(-half);
          const live = actCam && actCam.id === o.id;
          return (
            <g key={o.id} opacity={op}>
              {it.trail && <polyline points={it.trail.map((p) => SX(p[0]) + ',' + SZ(p[2])).join(' ')} fill="none" stroke={col} strokeOpacity="0.55" strokeDasharray="4 3" />}
              <path d={`M${x} ${z} L${x + a1[0] * L} ${z + a1[1] * L} L${x + a2[0] * L} ${z + a2[1] * L}z`} fill={live ? 'rgba(124,139,255,0.18)' : 'rgba(166,180,200,0.08)'} stroke={col} strokeWidth={sl ? 1.6 : 1} />
              <rect x={x - 6} y={z - 4} width={12} height={8} rx={1.5} fill="#2b2b2b" stroke={col} strokeWidth="1.5" transform={`rotate(${(Math.atan2(dir[1], dir[0]) * 180) / Math.PI} ${x} ${z})`} />
              {lbl(x, z)}
              {live && <text x={x + 9} y={z + 14} fill="#9fb0ff" fontSize="10">▶ снимает</text>}
            </g>
          );
        }
        if (o.type === 'path') {
          return (
            <g key={o.id} opacity={op}>
              <polyline points={it.line.map((p) => SX(p[0]) + ',' + SZ(p[2])).join(' ')} fill="none" stroke={col} strokeWidth={sl ? 2.2 : 1.6} />
              {it.points.map((p, i) => <rect key={i} x={SX(p[0]) - 3} y={SZ(p[2]) - 3} width={6} height={6} fill="#1e1e1e" stroke={col} />)}
              {lbl(SX(it.points[0][0]), SZ(it.points[0][2]))}
            </g>
          );
        }
        if (o.type === 'actor') {
          const x = SX(it.pos[0]), z = SZ(it.pos[2]);
          const yr = ((it.yaw || 0) * Math.PI) / 180;
          return (
            <g key={o.id} opacity={op}>
              {it.walks.map((w, i) => <polyline key={i} points={w.filter(Array.isArray).map((p) => SX(p[0]) + ',' + SZ(p[2])).join(' ')} fill="none" stroke={col} strokeOpacity="0.5" strokeDasharray="2 3" />)}
              <circle cx={x} cy={z} r={6} fill="rgba(232,160,90,0.25)" stroke={col} strokeWidth="1.6" />
              <line x1={x} y1={z} x2={x - Math.sin(yr) * 11} y2={z + Math.cos(yr) * 11} stroke={col} strokeWidth="1.6" />
              {lbl(x, z)}
            </g>
          );
        }
        if (o.type === 'light') {
          const x = SX(it.pos[0]), z = SZ(it.pos[2]);
          return (
            <g key={o.id} opacity={op}>
              {it.lit && <circle cx={x} cy={z} r={Math.max(10, 7 * view.k)} fill="rgba(242,215,107,0.10)" />}
              {it.extra.map((p, i) => <circle key={i} cx={SX(p[0] + 0.5)} cy={SZ(p[2] + 0.5)} r={3.5} fill={it.lit ? '#f2d76b' : '#666'} />)}
              <circle cx={x} cy={z} r={5.5} fill={it.lit ? '#f2d76b' : '#555'} stroke={col} strokeWidth="1.4" />
              {lbl(x, z)}
            </g>
          );
        }
        const x = SX(it.pos[0]), z = SZ(it.pos[2]);
        if (o.type === 'cloner') return <g key={o.id} opacity={op}><rect x={x - 5} y={z - 5} width={10} height={10} fill="none" stroke={col} strokeWidth="1.6" transform={`rotate(45 ${x} ${z})`} />{lbl(x, z)}</g>;
        if (o.type === 'group') return <g key={o.id} opacity={op}><circle cx={x} cy={z} r={5} fill="none" stroke={col} strokeDasharray="2 2" />{lbl(x, z)}</g>;
        return <g key={o.id} opacity={op}><path d={`M${x} ${z - 6} L${x + 5} ${z} L${x} ${z + 6} L${x - 5} ${z}z`} fill={col} />{lbl(x, z)}</g>;
      })}
      <g pointerEvents="none">
        <text x={size.w - 30} y={size.h - 40} fill="#ccc" fontSize="11" textAnchor="middle">С</text>
        <path d={`M${size.w - 30} ${size.h - 36} l-5 12 l5 -3 l5 3z`} fill="#e05050" />
      </g>
      <text x={8} y={size.h - 8} fill="#bbb" fontSize="11.5" pointerEvents="none">Сетка: {gridStep(view.k)} бл.{hover ? ' · x ' + hover[0] + ', z ' + hover[1] : ''}</text>
    </svg>
  );
}

function gridStep(k) { return k > 12 ? 1 : k > 3 ? 4 : k > 0.8 ? 16 : 64; }
function Grid({ SX, SZ, WX, WZ, size, view }) {
  const st = gridStep(view.k);
  const lines = [];
  const x0 = Math.floor(WX(0) / st) * st, x1 = WX(size.w), z0 = Math.floor(WZ(0) / st) * st, z1 = WZ(size.h);
  for (let x = x0; x <= x1 && lines.length < 400; x += st) lines.push(<line key={'x' + x} x1={SX(x)} x2={SX(x)} y1={0} y2={size.h} stroke={x % (st * 4) === 0 ? '#3d3d3d' : '#363636'} />);
  for (let z = z0; z <= z1 && lines.length < 800; z += st) lines.push(<line key={'z' + z} y1={SZ(z)} y2={SZ(z)} x1={0} x2={size.w} stroke={z % (st * 4) === 0 ? '#3d3d3d' : '#363636'} />);
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={size.w} height={size.h} fill="#323232" />
      {lines}
      <line x1={SX(0)} x2={SX(0)} y1={0} y2={size.h} stroke="#4f86ee" strokeOpacity="0.7" />
      <line y1={SZ(0)} y2={SZ(0)} x1={0} x2={size.w} stroke="#e05050" strokeOpacity="0.7" />
    </g>
  );
}

