// «3D-модель → блоки»: открыть OBJ (+MTL и картинки) или glTF/GLB, выбрать размер и поворот, палитру и сглаживание,
// посмотреть превью (крути мышью), показать призраком в игре, запечь в мир или сохранить шаблоном в библиотеку.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import { useStudio, lsGet, lsSet } from './core.jsx';
import I from './icons.jsx';
import { Modal } from './StudioApp.jsx';
import { Num, ARow } from './Attributes.jsx';
import { BlockField, addStructure } from './Build.jsx';
import { selToPos } from '../fields.jsx';
import { slug, uniqueId } from '../model.js';
import {
  parseOBJ, parseMTL, objLibs, parseGLB, parseGLTF, voxelize, mapToBlocks, toPlacement, renderPreview, filterPalette, DEFAULT_BLOCKS, PRESETS, baseName, meshBounds
} from '../voxel.js';

const UPS = [['y', 'Y вверх (обычно)'], ['z', 'Z вверх (Blender, 3ds Max)'], ['-z', '−Z вверх'], ['x', 'X вверх'], ['-y', 'вверх ногами']];
const DITHER = [['none', 'Нет', 'Каждый воксель — ближайший по цвету блок. Чисто, но плавные переходы становятся полосами.'], ['ordered', 'Узором', 'Сетка-узор (Байер): ровная «пиксельная» смесь двух блоков на переходах.'], ['diffuse', 'Рассеиванием', 'Ошибка цвета растекается на соседей (Флойд — Стейнберг в 3D): плавнее, но «шумнее».']];
const DEF = { size: 48, up: 'y', rotY: 0, fill: 'surface', preset: 'colorful', dither: 'none', strength: 0.6, noT: true, noG: true, noE: true, inner: '', custom: [], view: 'blocks', anchor: 'center', metric: 'de2000' };
const hex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

async function decodeImage(bytes, mime) {
  const blob = new Blob([bytes], { type: mime || 'image/png' });
  let src;
  try { src = await createImageBitmap(blob); } catch (_) {
    src = await new Promise((res, rej) => { const img = new Image(); const u = URL.createObjectURL(blob); img.onload = () => { URL.revokeObjectURL(u); res(img); }; img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('картинка не читается')); }; img.src = u; });
  }
  const k = Math.min(1, 2048 / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  return { w, h, data: g.getImageData(0, 0, w, h).data };
}
const mimeOf = (n) => (/\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : 'image/png');

// файлы → модель: { name, mesh, textures, info:{ tris, mats, tex, missing:[] } }
async function loadModel(files) {
  const by = {};
  for (const f of files) by[baseName(f.name)] = f.data;
  const names = Object.keys(by);
  const main = names.find((n) => /\.glb$/i.test(n)) || names.find((n) => /\.gltf$/i.test(n)) || names.find((n) => /\.obj$/i.test(n));
  if (!main) throw new Error('Нужен файл модели: .obj, .gltf или .glb');
  const textures = {};
  const missing = [];
  let mesh;
  if (/\.obj$/i.test(main)) {
    const text = new TextDecoder('utf-8').decode(by[main]);
    const mtl = {};
    for (const l of objLibs(text)) { if (by[l]) mtl[l] = parseMTL(new TextDecoder('utf-8').decode(by[l])); else missing.push(l); }
    for (const n of names) if (/\.mtl$/i.test(n) && !mtl[n]) mtl[n] = parseMTL(new TextDecoder('utf-8').decode(by[n]));
    mesh = parseOBJ(text, mtl);
    for (const m of mesh.materials) {
      if (!m.tex || textures[m.tex]) continue;
      if (!by[m.tex]) { missing.push(m.tex); continue; }
      try { textures[m.tex] = await decodeImage(by[m.tex], mimeOf(m.tex)); } catch (e) { missing.push(m.tex + ' (' + e.message + ')'); }
    }
  } else {
    let json, bin = null;
    if (/\.glb$/i.test(main)) ({ json, bin } = parseGLB(by[main])); else json = JSON.parse(new TextDecoder('utf-8').decode(by[main]));
    const r = parseGLTF(json, bin, by);
    mesh = r.mesh;
    for (const im of r.images) {
      if (!im.bytes) { missing.push(im.name); continue; }
      try { textures[im.key] = await decodeImage(im.bytes, im.mime); } catch (e) { missing.push(im.name + ' (' + e.message + ')'); }
    }
  }
  const b = meshBounds(mesh);
  return { name: main, mesh, textures, info: { tris: mesh.tris, mats: mesh.materials.length, tex: Object.keys(textures).length, missing, size: b.size } };
}

export default function Voxelizer({ onClose }) {
  const core = useStudio();
  const { hp } = core;
  const [st, setSt] = useState(() => ({ ...DEF, ...lsGet('vox', {}) }));
  const [model, setModel] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [vox, setVox] = useState(null); // { v, ms }
  const [map, setMap] = useState(null); // { idx, pl, pal, ms }
  const [view, setView] = useState({ yaw: 35, pitch: 28, zoom: 1 });
  const [pos, setPos] = useState(() => lsGet('voxPos', [0, 64, 0]));
  const [save, setSave] = useState({ name: '', saved: null });
  const [over, setOver] = useState(false);
  const cv = useRef(null);
  const set = (p) => setSt((s) => { const n = { ...s, ...p }; lsSet('vox', n); return n; });
  const allBlocks = core.gameBlocks || DEFAULT_BLOCKS;
  const palette = useMemo(() => filterPalette(allBlocks, { preset: st.preset, custom: st.custom, noTransparent: st.noT, noGravity: st.noG, noEntity: st.noE }), [allBlocks, st.preset, st.custom, st.noT, st.noG, st.noE]);

  const open = async (fileList) => {
    const fl = [...fileList];
    if (!fl.length) return;
    setErr(null); setBusy(true);
    try {
      const files = await Promise.all(fl.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      const m = await loadModel(files);
      setModel(m); setVox(null); setMap(null);
      setSave({ name: m.name.replace(/\.[^.]+$/, ''), saved: null });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  // вокселизация — при смене модели, размера, поворота, заливки
  useEffect(() => {
    if (!model) return undefined;
    setBusy(true);
    const t = setTimeout(() => {
      try { const t0 = performance.now(); const v = voxelize(model.mesh, model.textures, { size: st.size, up: st.up, rotY: st.rotY, fill: st.fill }); setVox({ v, ms: Math.round(performance.now() - t0) }); setErr(null); } catch (e) { setErr(e.message); setVox(null); }
      setBusy(false);
    }, 60);
    return () => clearTimeout(t);
  }, [model, st.size, st.up, st.rotY, st.fill]);
  // цвета → блоки
  useEffect(() => {
    if (!vox) { setMap(null); return; }
    if (!palette.length) { setMap(null); setErr('Палитра пустая — включи блоки или выбери другой набор'); return; }
    const t0 = performance.now();
    const innerIdx = st.fill === 'solid' && st.inner ? (() => { let i = palette.findIndex((b) => b.id === st.inner); return i; })() : -2;
    const pal = innerIdx === -1 ? [...palette, { id: st.inner, rgb: (allBlocks.find((b) => b.id === st.inner) || { rgb: [128, 128, 128] }).rgb }] : palette;
    const idx = mapToBlocks(vox.v, pal, { dither: st.dither, strength: st.strength, inner: innerIdx === -1 ? pal.length - 1 : innerIdx, metric: st.metric });
    const pl = toPlacement(vox.v, idx, pal);
    setMap({ idx, pl, pal, ms: Math.round(performance.now() - t0) });
  }, [vox, palette, st.dither, st.strength, st.inner, st.fill, st.metric]); // eslint-disable-line
  // превью
  const colors = useMemo(() => {
    if (!vox) return null;
    if (st.view === 'model' || !map) return vox.v.rgb;
    const c = new Uint8Array(vox.v.n * 3);
    for (let i = 0; i < vox.v.n; i++) { const p = map.idx[i]; const rgb = p >= 0 ? map.pal[p].rgb : [0, 0, 0]; c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
    return c;
  }, [vox, map, st.view]);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const W = c.width, H = c.height;
    const img = renderPreview(vox && vox.v, colors || new Uint8Array(0), { w: W, h: H, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, bg: [44, 44, 46] });
    const g = c.getContext('2d');
    g.putImageData(new ImageData(img.data, W, H), 0, 0);
  }, [vox, colors, view]);
  const drag = (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, v0 = view;
    const mv = (ev) => setView({ ...v0, yaw: v0.yaw + (ev.clientX - x0) * 0.6, pitch: Math.max(-89, Math.min(89, v0.pitch + (ev.clientY - y0) * 0.4)) });
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  useEffect(() => {
    const c = cv.current;
    if (!c) return undefined;
    const w = (e) => { e.preventDefault(); setView((v) => ({ ...v, zoom: Math.max(0.3, Math.min(6, v.zoom * Math.exp(-e.deltaY * 0.0015))) })); };
    c.addEventListener('wheel', w, { passive: false });
    return () => c.removeEventListener('wheel', w);
  }, []);

  const origin = () => {
    const sz = vox ? vox.v.size : [0, 0, 0];
    return st.anchor === 'center' ? [pos[0] - Math.floor(sz[0] / 2), pos[1], pos[2] - Math.floor(sz[2] / 2)] : pos.slice();
  };
  const grabPos = async () => { try { const p = selToPos(await core.api.getSel(), true); if (!p) throw new Error('В игре прицел ни на что не наведён'); const n = [p[0], p[1] + 1, p[2]]; setPos(n); lsSet('voxPos', n); } catch (e) { core.toast(e.message, 'error'); } };
  const ghost = async () => {
    if (!map) return;
    try { const r = await call('studio:ghostStream', { id: 'vox', origin: origin(), palette: map.pl.palette, blocks: map.pl.blocks }); core.toast('Призрак в игре: ' + map.pl.count.toLocaleString('ru-RU') + ' блоков' + (r.parts > 1 ? ' (частей: ' + r.parts + ')' : ''), 'ok', 2500); } catch (e) { core.toast(e.message, 'error'); }
  };
  const unghost = () => call('studio:ghost', { id: 'vox', placements: [] }).catch(() => {});
  const bake = async () => {
    if (!map) return;
    if (map.pl.count > 200000 && !window.confirm('Блоков ' + map.pl.count.toLocaleString('ru-RU') + ' — игра будет ставить их несколько минут. Продолжить?')) return;
    try { const r = await call('studio:bakeStream', { id: 'vox', origin: origin(), palette: map.pl.palette, blocks: map.pl.blocks, undoId: 'vox_' + Date.now().toString(36) }); core.noteBuildOp({ undoId: r.undoId, op: 'bake', n: map.pl.count }); unghost(); core.toast('Запекаю в мир — игра ставит блоки по тикам (можно отменить)', 'ok', 3000); } catch (e) { core.toast(e.message, 'error'); }
  };
  const saveTpl = async () => {
    if (!map) return;
    const name = save.name.trim() || 'Модель';
    const id = uniqueId(slug(name, 'model'), core.structures.map((x) => x.id));
    let png = null;
    try {
      const c = document.createElement('canvas'); c.width = 160; c.height = 120;
      const img = renderPreview(vox.v, colors, { w: 160, h: 120, yaw: view.yaw, pitch: view.pitch, bg: [40, 40, 40] });
      c.getContext('2d').putImageData(new ImageData(img.data, 160, 120), 0, 0);
      png = c.toDataURL('image/png');
    } catch (_) {}
    try {
      await call('studio:structSave', { id, name, size: map.pl.size, palette: map.pl.palette, blocks: map.pl.blocks, png, source: 'voxel', counts: map.pl.counts });
      await core.reloadAny('structures');
      setSave({ ...save, saved: id });
      core.toast('Шаблон «' + name + '» в библиотеке (studio/structures/' + id + '.nbt)', 'ok', 4000);
    } catch (e) { core.toast(e.message, 'error'); }
  };
  const toScene = () => {
    const st0 = core.structures.find((x) => x.id === save.saved) || { id: save.saved, name: save.name };
    if (!core.scene) { core.toast('Открой сцену', 'warn'); return; }
    let id = null;
    core.edit((sc) => { const r = addStructure(sc, st0, origin()); id = r.id; return r.scene; });
    if (id) core.setSel({ objs: [id] });
    onClose();
  };

  const counts = map ? Object.entries(map.pl.counts).sort((a, b) => b[1] - a[1]) : [];
  const v = vox && vox.v;
  return (
    <Modal title="3D-модель → блоки" wide onClose={onClose} footer={<>
      <span className="dim grow" style={{ textAlign: 'left' }}>{v ? 'Размер ' + v.size.join(' × ') + ' · вокселей ' + v.n.toLocaleString('ru-RU') + (map ? ' · блоков ' + map.pl.count.toLocaleString('ru-RU') + ', видов ' + map.pl.palette.length : '') + ' · ' + (vox.ms + (map ? map.ms : 0)) + ' мс' : 'Открой модель'}</span>
      <button className="c4-btn" disabled={!map || !core.link.connected} onClick={ghost} {...hp('Показать модель призраком в игре в выбранной точке (большие модели уходят частями).')}><I name="ghost" size={13} /> Призрак в игре</button>
      <button className="c4-btn" disabled={!core.link.connected} onClick={unghost} title="Убрать призрак"><I name="close" size={12} /></button>
      <button className="c4-btn" disabled={!map || !core.link.connected} onClick={bake} {...hp('Поставить блоки в мир по-настоящему (по тикам, можно отменить кнопкой «Отменить в мире»).')}><I name="bake" size={13} /> Запечь в мир</button>
      <button className="c4-btn prim" onClick={onClose}>Готово</button>
    </>}>
      <div className={'vx' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); open(e.dataTransfer.files); }}>
        <div className="vx-side">
          <div className="vx-sec">
            <div className="bd-h">Модель</div>
            <label className="c4-btn prim vx-file" {...hp('Выбери файл модели вместе с её файлами: для OBJ — .mtl и картинки текстур; для glTF — .bin и картинки. GLB — всё в одном файле. Можно перетащить файлы прямо в это окно.')}>
              <I name="folder" size={13} /> Открыть файлы…
              <input type="file" multiple accept=".obj,.mtl,.gltf,.glb,.bin,.png,.jpg,.jpeg,.webp" onChange={(e) => { open(e.target.files); e.target.value = ''; }} />
            </label>
            {model ? <div className="vx-info"><b className="mono">{model.name}</b><span className="dim">треугольников {model.info.tris.toLocaleString('ru-RU')} · материалов {model.info.mats} · текстур {model.info.tex}</span></div>
              : <div className="c4-ahint">OBJ (+MTL и PNG/JPG), glTF 2.0 (.gltf + .bin + картинки) или GLB. Перетащи файлы сюда.</div>}
            {model && model.info.missing.length > 0 && <div className="c4-iss w">Не хватает: {model.info.missing.join(', ')} — выбери их вместе с моделью (без них цвет — из материала).</div>}
            {err && <div className="c4-iss e">{err}</div>}
          </div>
          <div className="vx-sec">
            <div className="bd-h">Размер и поворот</div>
            <ARow label="Размер" hint="Сколько блоков по самой длинной стороне модели (8–256). 128 и больше — сотни тысяч блоков."><Num value={st.size} int min={4} max={256} step={1} unit="бл" onChange={(n) => set({ size: n })} /></ARow>
            <div className="vx-sizes">{[16, 32, 48, 64, 96, 128, 192, 256].map((n) => <button key={n} className={st.size === n ? 'on' : ''} onClick={() => set({ size: n })}>{n}</button>)}</div>
            <ARow label="Верх модели" hint="Какая ось модели смотрит вверх. Модели из Blender обычно «Z вверх», из Blockbench и glTF — «Y вверх»."><select className="c4-text" value={st.up} onChange={(e) => set({ up: e.target.value })}>{UPS.map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}</select></ARow>
            <ARow label="Поворот" hint="Повернуть модель вокруг вертикали шагами по 90°."><div className="bd-seg sm">{[0, 1, 2, 3].map((q) => <button key={q} className={st.rotY === q ? 'on' : ''} onClick={() => set({ rotY: q })}>{q * 90}°</button>)}</div></ARow>
            <ARow label="Заполнение" hint="Оболочка — только поверхность (меньше блоков, внутри пусто). Сплошная — внутри тоже блоки (для разрушаемых построек)."><div className="bd-seg sm"><button className={st.fill === 'surface' ? 'on' : ''} onClick={() => set({ fill: 'surface' })}>Оболочка</button><button className={st.fill === 'solid' ? 'on' : ''} onClick={() => set({ fill: 'solid' })}>Сплошная</button></div></ARow>
            {st.fill === 'solid' && <ARow label="Внутри" hint="Каким блоком заполнять невидимую середину. Пусто — как ближайшая поверхность."><BlockField value={st.inner} onChange={(b) => set({ inner: b })} placeholder="как снаружи" /></ARow>}
          </div>
          <div className="vx-sec">
            <div className="bd-h">Блоки</div>
            <ARow label="Набор" hint={PRESETS.map((p) => p[1] + ' — ' + p[2]).join(' ')}><select className="c4-text" value={st.preset} onChange={(e) => set({ preset: e.target.value })}>{PRESETS.map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}</select></ARow>
            {st.preset === 'custom' && <CustomList blocks={allBlocks} value={st.custom} onChange={(c) => set({ custom: c })} />}
            <div className="vx-checks">
              <label {...hp('Без стекла, листвы, льда — сквозь них видно.')}><input type="checkbox" checked={st.noT} onChange={(e) => set({ noT: e.target.checked })} /> без прозрачных</label>
              <label {...hp('Без песка, гравия, бетонного порошка — они осыпаются.')}><input type="checkbox" checked={st.noG} onChange={(e) => set({ noG: e.target.checked })} /> без падающих</label>
              <label {...hp('Без сундуков, бочек, печей и прочих блоков-сущностей.')}><input type="checkbox" checked={st.noE} onChange={(e) => set({ noE: e.target.checked })} /> без сундуков и т.п.</label>
            </div>
            <ARow label="Сглаживание" hint={DITHER.map((d) => d[1] + ' — ' + d[2]).join(' ')}><div className="bd-seg sm">{DITHER.map(([v2, l, h]) => <button key={v2} className={st.dither === v2 ? 'on' : ''} title={h} onClick={() => set({ dither: v2 })}>{l}</button>)}</div></ARow>
            {st.dither !== 'none' && <ARow label="Сила" hint="Насколько сильно смешивать блоки (0–1)."><Num value={st.strength} step={0.05} min={0} max={1} onChange={(n) => set({ strength: n })} /></ARow>}
            <div className="dim" style={{ fontSize: 11, padding: '2px 8px' }}>В наборе {palette.length} блоков · {core.gameBlocks ? 'палитра из игры' : 'встроенный список (⟳ в палитре — из игры)'} · цвет по CIELAB (ΔE2000)</div>
          </div>
        </div>
        <div className="vx-main">
          <div className="vx-view">
            <canvas ref={cv} width={520} height={360} onMouseDown={drag} onDoubleClick={() => setView({ yaw: 35, pitch: 28, zoom: 1 })} {...hp('Превью: тяни мышью — крутить, колесо — приблизить, двойной щелчок — как было.')} />
            {!model && <div className="vx-drop"><I name="block" size={36} color="#777" /><b>Перетащи сюда модель</b><span className="dim">.obj + .mtl + текстуры · .gltf + .bin · .glb</span></div>}
            {busy && <div className="vx-busy">Считаю…</div>}
            <div className="vx-viewbar">
              <div className="bd-seg sm"><button className={st.view === 'blocks' ? 'on' : ''} onClick={() => set({ view: 'blocks' })} {...hp('Показывать блоками, как будет в игре.')}>Блоками</button><button className={st.view === 'model' ? 'on' : ''} onClick={() => set({ view: 'model' })} {...hp('Показывать исходными цветами модели — сравнить.')}>Цвета модели</button></div>
              <span className="dim">{v ? v.size.join(' × ') + ' бл.' : ''}</span>
            </div>
          </div>
          <div className="vx-bottom">
            <div className="vx-counts" {...hp('Сколько каких блоков понадобится.')}>
              {counts.slice(0, 16).map(([id, n]) => { const b = allBlocks.find((x) => x.id === id); return <div key={id} className="vx-cnt"><span className="sw" style={{ background: b ? hex(b.rgb) : '#777' }} /><span className="nm mono">{id.replace(/^minecraft:/, '')}</span><b>{n.toLocaleString('ru-RU')}</b></div>; })}
              {counts.length > 16 && <div className="dim" style={{ padding: '2px 6px' }}>…и ещё {counts.length - 16} видов</div>}
              {!counts.length && <div className="dim" style={{ padding: 6 }}>Здесь будет список блоков.</div>}
            </div>
            <div className="vx-place">
              <div className="bd-h">Куда</div>
              <ARow label="Точка" hint="Где поставить модель в мире: x y z. «Из игры» — блок под прицелом (модель встанет на него).">
                {[0, 1, 2].map((i) => <Num key={i} ax={'XYZ'[i]} int value={pos[i]} onChange={(n) => { const c = pos.slice(); c[i] = n; setPos(c); lsSet('voxPos', c); }} />)}
                <button className="c4-ib" style={{ width: 22, height: 19 }} disabled={!core.link.connected} onClick={grabPos} title="Взять из игры (блок под прицелом)"><I name="look" size={12} /></button>
              </ARow>
              <ARow label="Точка — это" hint="Центр низа модели или её угол (минимальные x, y, z)."><div className="bd-seg sm"><button className={st.anchor === 'center' ? 'on' : ''} onClick={() => set({ anchor: 'center' })}>центр низа</button><button className={st.anchor === 'corner' ? 'on' : ''} onClick={() => set({ anchor: 'corner' })}>угол</button></div></ARow>
              <div className="bd-h" style={{ marginTop: 4 }}>В библиотеку</div>
              <ARow label="Название" hint="Под каким именем сохранить в «Постройки» (обычный шаблон .nbt — можно ставить схемами, клонерами и в сценах)."><input className="c4-text" value={save.name} onChange={(e) => setSave({ ...save, name: e.target.value, saved: null })} onKeyDown={(e) => e.stopPropagation()} /></ARow>
              <div className="c4-btnrow">
                <button className="c4-btn sm prim" disabled={!map} onClick={saveTpl} {...hp('Сохранить как шаблон постройки: studio/structures/<id>.nbt + картинка. Уйдёт игрокам при «Собрать».')}><I name="build" size={12} /> Сохранить шаблон</button>
                {save.saved && <button className="c4-btn sm" onClick={toScene} {...hp('Поставить сохранённую постройку объектом в открытую сцену.')}><I name="plus" size={12} /> В сцену</button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CustomList({ blocks, value, onChange }) {
  const [q, setQ] = useState('');
  const f = q.trim().toLowerCase();
  const l = blocks.filter((b) => !f || b.id.includes(f)).slice(0, 300);
  return (
    <div className="vx-custom">
      <div className="c4-btnrow"><input className="c4-search" placeholder="найти…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><span className="dim">выбрано {value.length}</span><button className="c4-btn sm" onClick={() => onChange([])}>снять все</button></div>
      <div className="vx-custom-list">
        {l.map((b) => <label key={b.id}><input type="checkbox" checked={value.includes(b.id)} onChange={(e) => onChange(e.target.checked ? [...value, b.id] : value.filter((x) => x !== b.id))} /><span className="sw" style={{ background: hex(b.rgb) }} />{b.id.replace(/^minecraft:/, '')}</label>)}
      </div>
    </div>
  );
}
