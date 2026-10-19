// «Студия Кокка», фаза 4: 3D-модели → блоки. Чистый JS без зависимостей (картинки текстур декодирует окно через canvas).
//   parseOBJ / parseMTL / parseGLTF / parseGLB  → «суп» треугольников { tris, pos, uv, col, mat, materials, flipV }
//   voxelize(mesh, textures, opts)              → воксели { size, n, xyz, rgb, inner }
//   mapToBlocks(vox, palette, opts)             → номер блока палитры на каждый воксель (CIELAB + сглаживание)
//   renderPreview(…)                            → картинка RGBA «в изометрии» (для превью без three.js)
// Текстура: { w, h, data: RGBA Uint8 } — ключ материала → текстура.

// ======================= разбор файлов =======================
const num = (s) => { const v = parseFloat(s); return isFinite(v) ? v : 0; };
export function baseName(p) { return String(p || '').replace(/\\/g, '/').split('/').pop().trim(); }

// MTL: { имя: { kd:[r,g,b], alpha, map } }
export function parseMTL(text) {
  const out = {};
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/);
    const k = sp[0].toLowerCase();
    if (k === 'newmtl') { cur = { kd: [0.8, 0.8, 0.8], alpha: 1, map: null }; out[line.slice(7).trim()] = cur; continue; }
    if (!cur) continue;
    if (k === 'kd') cur.kd = [num(sp[1]), num(sp[2]), num(sp[3])];
    else if (k === 'd') cur.alpha = num(sp[1]);
    else if (k === 'tr') cur.alpha = 1 - num(sp[1]);
    else if (k === 'map_kd') {
      // опции вида -s 1 1 1 / -o … / -clamp on пропускаем: имя файла — остаток строки после опций
      const rest = line.slice(sp[0].length).trim().split(/\s+/);
      let i = 0;
      const ARGS = { '-s': 3, '-o': 3, '-t': 3, '-bm': 1, '-clamp': 1, '-blendu': 1, '-blendv': 1, '-mm': 2, '-texres': 1, '-imfchan': 1, '-boost': 1, '-cc': 1 };
      while (i < rest.length && ARGS[rest[i]] !== undefined) i += 1 + ARGS[rest[i]];
      cur.map = baseName(rest.slice(i).join(' '));
    }
  }
  return out;
}

function newMesh(cap) {
  return { tris: 0, pos: new Float32Array(cap * 9), uv: new Float32Array(cap * 6), col: null, mat: new Int32Array(cap), materials: [], flipV: true };
}
function grow(m, need) {
  const cap = m.mat.length;
  if (need <= cap) return;
  let L = Math.max(16, cap * 2);
  while (L < need) L *= 2;
  const p = new Float32Array(L * 9); p.set(m.pos); m.pos = p;
  const u = new Float32Array(L * 6); u.set(m.uv); m.uv = u;
  if (m.col) { const c = new Float32Array(L * 9); c.set(m.col); m.col = c; }
  const t = new Int32Array(L); t.set(m.mat); m.mat = t;
}
function finish(m) {
  m.pos = m.pos.subarray(0, m.tris * 9);
  m.uv = m.uv.subarray(0, m.tris * 6);
  if (m.col) m.col = m.col.subarray(0, m.tris * 9);
  m.mat = m.mat.subarray(0, m.tris);
  return m;
}

// OBJ (+ MTL): mtl — { имя файла: текст } или уже разобранный объект материалов
export function parseOBJ(text, mtl) {
  const P = [], T = [], C = [];
  let hasC = false;
  const m = newMesh(1024);
  const matIdx = {};
  const mats = {};
  if (mtl) for (const v of Object.values(mtl)) Object.assign(mats, typeof v === 'string' ? parseMTL(v) : v);
  let cur = -1;
  const useMat = (name) => {
    if (matIdx[name] === undefined) {
      const d = mats[name] || null;
      matIdx[name] = m.materials.length;
      m.materials.push({ name, color: d ? [d.kd[0], d.kd[1], d.kd[2], d.alpha] : [0.8, 0.8, 0.8, 1], tex: d && d.map ? d.map : null });
    }
    return matIdx[name];
  };
  const lines = String(text || '').split(/\r?\n/);
  const ref = (s, n, L) => { const i = parseInt(s, 10); if (!isFinite(i) || i === 0) return -1; return i < 0 ? L + i : i - 1; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/);
    switch (sp[0]) {
      case 'v':
        P.push(num(sp[1]), num(sp[2]), num(sp[3]));
        if (sp.length >= 7) { C.push(num(sp[4]), num(sp[5]), num(sp[6])); hasC = true; } else C.push(1, 1, 1);
        break;
      case 'vt': T.push(num(sp[1]), num(sp[2])); break;
      case 'usemtl': cur = useMat(line.slice(7).trim()); break;
      case 'f': {
        if (cur < 0) cur = useMat('');
        const vs = [];
        for (let i = 1; i < sp.length; i++) {
          const q = sp[i].split('/');
          const vi = ref(q[0], 0, P.length / 3);
          const ti = q.length > 1 && q[1] !== '' ? ref(q[1], 0, T.length / 2) : -1;
          if (vi >= 0) vs.push([vi, ti]);
        }
        for (let i = 1; i + 1 < vs.length; i++) {
          grow(m, m.tris + 1);
          if (hasC && !m.col) { m.col = new Float32Array(m.mat.length * 9); m.col.fill(1); }
          const k = m.tris++;
          m.mat[k] = cur;
          [vs[0], vs[i], vs[i + 1]].forEach(([vi, ti], c) => {
            m.pos[k * 9 + c * 3] = P[vi * 3]; m.pos[k * 9 + c * 3 + 1] = P[vi * 3 + 1]; m.pos[k * 9 + c * 3 + 2] = P[vi * 3 + 2];
            if (ti >= 0 && ti * 2 + 1 < T.length) { m.uv[k * 6 + c * 2] = T[ti * 2]; m.uv[k * 6 + c * 2 + 1] = T[ti * 2 + 1]; } else { m.uv[k * 6 + c * 2] = NaN; m.uv[k * 6 + c * 2 + 1] = NaN; }
            if (m.col) { m.col[k * 9 + c * 3] = C[vi * 3]; m.col[k * 9 + c * 3 + 1] = C[vi * 3 + 1]; m.col[k * 9 + c * 3 + 2] = C[vi * 3 + 2]; }
          });
        }
        break;
      }
      default:
    }
  }
  if (hasC && !m.col) { m.col = new Float32Array(m.mat.length * 9); m.col.fill(1); }
  m.flipV = true; // у OBJ v=0 — низ картинки
  return finish(m);
}
// какие файлы просит OBJ
export function objLibs(text) { const out = []; for (const l of String(text || '').split(/\r?\n/)) { const t = l.trim(); if (t.startsWith('mtllib ')) out.push(...t.slice(7).trim().split(/\s+/).map(baseName)); } return out; }

// GLB → { json, bin }
export function parseGLB(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Это не GLB-файл');
  const len = dv.getUint32(8, true);
  let off = 12, json = null, bin = null;
  while (off + 8 <= len) {
    const cl = dv.getUint32(off, true), ct = dv.getUint32(off + 4, true);
    const body = new Uint8Array(ab, off + 8, cl);
    if (ct === 0x4e4f534a) json = JSON.parse(new TextDecoder('utf-8').decode(body));
    else if (ct === 0x004e4942) bin = body;
    off += 8 + cl;
  }
  if (!json) throw new Error('В GLB нет JSON-части');
  return { json, bin };
}
function b64(s) {
  if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(s, 'base64')); // eslint-disable-line no-undef
}
function dataUri(uri) { const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri || ''); if (!m) return null; return { mime: m[1], bytes: m[2] ? b64(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3])) }; }

const COMP = { 5120: [Int8Array, 1, 127], 5121: [Uint8Array, 1, 255], 5122: [Int16Array, 2, 32767], 5123: [Uint16Array, 2, 65535], 5125: [Uint32Array, 4, 0], 5126: [Float32Array, 4, 0] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function mat4mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
function trs(n) {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix.slice();
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
  for (let i = 0; i < 3; i++) { r[i] *= s[0]; r[4 + i] *= s[1]; r[8 + i] *= s[2]; }
  r[12] = t[0]; r[13] = t[1]; r[14] = t[2];
  return r;
}

// glTF 2.0: json + bin (GLB) + files { имя: ArrayBuffer|Uint8Array } для внешних буферов.
// Возвращает { mesh, images:[{ key, mime, bytes, name }] } — картинки декодирует окно (canvas) и кладёт в textures[key].
export function parseGLTF(json, bin, files) {
  const g = json;
  const fileBytes = (uri) => {
    const d = dataUri(uri);
    if (d) return d.bytes;
    const f = files && (files[uri] || files[baseName(decodeURIComponent(uri))] || files[baseName(uri)]);
    if (!f) throw new Error('Не хватает файла «' + baseName(uri) + '» — выбери его вместе с моделью');
    return f instanceof Uint8Array ? f : new Uint8Array(f);
  };
  const buffers = (g.buffers || []).map((b, i) => (b.uri === undefined ? (i === 0 && bin ? bin : null) : fileBytes(b.uri)));
  const viewBytes = (vi) => {
    const v = g.bufferViews[vi];
    const b = buffers[v.buffer];
    if (!b) throw new Error('Буфер ' + v.buffer + ' пустой');
    return { u8: new Uint8Array(b.buffer, b.byteOffset + (v.byteOffset || 0), v.byteLength), stride: v.byteStride || 0 };
  };
  const readAcc = (ai) => {
    const a = g.accessors[ai];
    const nc = NCOMP[a.type] || 1;
    const out = new Float32Array(a.count * nc);
    if (a.bufferView === undefined) return out; // нули (sparse не поддерживаем)
    const [Arr, sz, norm] = COMP[a.componentType] || COMP[5126];
    const { u8, stride } = viewBytes(a.bufferView);
    const st = stride || sz * nc;
    const base = a.byteOffset || 0;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const get = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
    void Arr;
    for (let i = 0; i < a.count; i++) for (let c = 0; c < nc; c++) {
      let v = get(base + i * st + c * sz);
      if (a.normalized && norm) v = Math.max(-1, v / norm);
      out[i * nc + c] = v;
    }
    return out;
  };
  const images = (g.images || []).map((im, i) => {
    if (im.bufferView !== undefined) { const { u8 } = viewBytes(im.bufferView); return { key: 'img' + i, mime: im.mimeType || 'image/png', bytes: u8, name: im.name || 'картинка ' + i }; }
    const d = dataUri(im.uri);
    if (d) return { key: 'img' + i, mime: d.mime, bytes: d.bytes, name: 'картинка ' + i };
    let bytes = null;
    try { bytes = fileBytes(im.uri); } catch (_) {}
    return { key: 'img' + i, mime: /\.jpe?g$/i.test(im.uri || '') ? 'image/jpeg' : 'image/png', bytes, name: baseName(im.uri), missing: !bytes };
  });
  const m = newMesh(1024);
  m.flipV = false;
  const matMap = {};
  const material = (mi) => {
    const key = mi === undefined ? 'default' : mi;
    if (matMap[key] !== undefined) return matMap[key];
    const mt = mi === undefined ? {} : (g.materials || [])[mi] || {};
    const pbr = mt.pbrMetallicRoughness || {};
    const sg = (mt.extensions && mt.extensions.KHR_materials_pbrSpecularGlossiness) || null;
    const f = pbr.baseColorFactor || (sg && sg.diffuseFactor) || [1, 1, 1, 1];
    const texRef = pbr.baseColorTexture || (sg && sg.diffuseTexture) || null;
    let tex = null;
    if (texRef && g.textures && g.textures[texRef.index]) { const src = g.textures[texRef.index].source; if (src !== undefined) tex = 'img' + src; }
    matMap[key] = m.materials.length;
    m.materials.push({ name: mt.name || 'материал ' + m.materials.length, color: [f[0], f[1], f[2], f[3] === undefined ? 1 : f[3]], tex, cutoff: mt.alphaMode === 'MASK' ? (mt.alphaCutoff === undefined ? 0.5 : mt.alphaCutoff) : mt.alphaMode === 'BLEND' ? 0.5 : -1 });
    return matMap[key];
  };
  const drawMesh = (mesh, M) => {
    for (const pr of mesh.primitives || []) {
      const mode = pr.mode === undefined ? 4 : pr.mode;
      if (![4, 5, 6].includes(mode) || pr.attributes.POSITION === undefined) continue;
      const P = readAcc(pr.attributes.POSITION);
      const UV = pr.attributes.TEXCOORD_0 !== undefined ? readAcc(pr.attributes.TEXCOORD_0) : null;
      let CO = null, cn = 3;
      if (pr.attributes.COLOR_0 !== undefined) { CO = readAcc(pr.attributes.COLOR_0); cn = NCOMP[g.accessors[pr.attributes.COLOR_0].type] || 3; }
      const nv = P.length / 3;
      const idx = pr.indices !== undefined ? readAcc(pr.indices) : null;
      const at = (i) => (idx ? idx[i] : i);
      const cnt = idx ? idx.length : nv;
      const tri = [];
      if (mode === 4) for (let i = 0; i + 2 < cnt; i += 3) tri.push([at(i), at(i + 1), at(i + 2)]);
      else if (mode === 5) for (let i = 0; i + 2 < cnt; i++) tri.push(i % 2 ? [at(i + 1), at(i), at(i + 2)] : [at(i), at(i + 1), at(i + 2)]);
      else for (let i = 1; i + 1 < cnt; i++) tri.push([at(0), at(i), at(i + 1)]);
      const mi = material(pr.material);
      if (CO && !m.col) { m.col = new Float32Array(m.mat.length * 9); m.col.fill(1); }
      grow(m, m.tris + tri.length);
      for (const t of tri) {
        const k = m.tris++;
        m.mat[k] = mi;
        for (let c = 0; c < 3; c++) {
          const v = t[c];
          const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          m.pos[k * 9 + c * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
          m.pos[k * 9 + c * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
          m.pos[k * 9 + c * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
          m.uv[k * 6 + c * 2] = UV ? UV[v * 2] : NaN;
          m.uv[k * 6 + c * 2 + 1] = UV ? UV[v * 2 + 1] : NaN;
          if (m.col) for (let j = 0; j < 3; j++) m.col[k * 9 + c * 3 + j] = CO ? CO[v * cn + j] : 1;
        }
      }
    }
  };
  const visit = (ni, parent, depth) => {
    const n = (g.nodes || [])[ni];
    if (!n || depth > 64) return;
    const M = mat4mul(parent, trs(n));
    if (n.mesh !== undefined && g.meshes[n.mesh]) drawMesh(g.meshes[n.mesh], M);
    for (const c of n.children || []) visit(c, M, depth + 1);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const sc = (g.scenes || [])[g.scene || 0];
  if (sc && sc.nodes) sc.nodes.forEach((ni) => visit(ni, I, 0));
  else if (g.nodes) { const kids = new Set(); g.nodes.forEach((n) => (n.children || []).forEach((c) => kids.add(c))); g.nodes.forEach((_, i) => { if (!kids.has(i)) visit(i, I, 0); }); } else (g.meshes || []).forEach((ms) => drawMesh(ms, I));
  if (!m.tris) throw new Error('В модели нет треугольников');
  return { mesh: finish(m), images };
}

export function meshBounds(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const p = mesh.pos;
  for (let i = 0; i < p.length; i += 3) for (let j = 0; j < 3; j++) { const v = p[i + j]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
  return { lo, hi, size: hi.map((v, j) => v - lo[j]) };
}

// ======================= вокселизация =======================
// ориентация: up — какая ось модели смотрит вверх ('y' | 'z' | 'x' | '-y' | '-z' | '-x'), rotY — четверти поворота вокруг Y
export function orientPoint(x, y, z, up, rotY) {
  let a = x, b = y, c = z;
  switch (up) {
    case 'z': a = x; b = z; c = -y; break;
    case '-z': a = x; b = -z; c = y; break;
    case 'x': a = -y; b = x; c = z; break;
    case '-x': a = y; b = -x; c = z; break;
    case '-y': a = x; b = -y; c = -z; break;
    default:
  }
  const q = ((rotY | 0) % 4 + 4) % 4;
  for (let i = 0; i < q; i++) { const t = a; a = -c; c = t; }
  return [a, b, c];
}

function sampleTex(tex, u, v, flipV, wrap) {
  if (!tex) return null;
  let s = u, t = flipV ? 1 - v : v;
  if (wrap !== false) { s -= Math.floor(s); t -= Math.floor(t); } else { s = Math.min(1, Math.max(0, s)); t = Math.min(1, Math.max(0, t)); }
  const x = Math.min(tex.w - 1, Math.floor(s * tex.w)), y = Math.min(tex.h - 1, Math.floor(t * tex.h));
  const i = (y * tex.w + x) * 4;
  return tex.data[i] !== undefined ? [tex.data[i], tex.data[i + 1], tex.data[i + 2], tex.data[i + 3]] : null;
}

// opts: { size: блоков по длинной стороне (8–256), up, rotY, fill: 'surface'|'solid', alphaCut: 0..1 }
// результат: { size:[sx,sy,sz], n, xyz: Uint16Array(n*3), rgb: Uint8Array(n*3), inner: Uint8Array(n), scale, ms }
export function voxelize(mesh, textures, opts) {
  const t0 = Date.now();
  const o = opts || {};
  const S = Math.max(1, Math.min(512, Math.round(o.size || 64)));
  const up = o.up || 'y', rotY = o.rotY || 0;
  const T = mesh.tris;
  // повернуть вершины и найти рамку
  const P = new Float32Array(mesh.pos.length);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    const r = orientPoint(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2], up, rotY);
    for (let j = 0; j < 3; j++) { P[i + j] = r[j]; if (r[j] < lo[j]) lo[j] = r[j]; if (r[j] > hi[j]) hi[j] = r[j]; }
  }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const k = S / ext;
  const dim = [0, 1, 2].map((j) => Math.max(1, Math.min(S, Math.ceil((hi[j] - lo[j]) * k - 1e-6) || 1)));
  const [sx, sy, sz] = dim;
  const N = sx * sy * sz;
  if (N > 64e6) throw new Error('Слишком большая сетка — уменьши размер');
  for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) P[i + j] = (P[i + j] - lo[j]) * k;
  const slot = new Int32Array(N).fill(-1);
  let cap = 1 << 14, n = 0;
  let acc = new Float32Array(cap * 4); // r,g,b,count
  let xyz = new Uint16Array(cap * 3);
  const mats = mesh.materials;
  const alphaCut = o.alphaCut === undefined ? 0.5 : o.alphaCut;
  const add = (x, y, z, r, g, b) => {
    const ix = x < 0 ? 0 : x >= sx ? sx - 1 : x | 0;
    const iy = y < 0 ? 0 : y >= sy ? sy - 1 : y | 0;
    const iz = z < 0 ? 0 : z >= sz ? sz - 1 : z | 0;
    const c = (iy * sz + iz) * sx + ix;
    let s = slot[c];
    if (s < 0) {
      if (n >= cap) { cap *= 2; const a2 = new Float32Array(cap * 4); a2.set(acc); acc = a2; const x2 = new Uint16Array(cap * 3); x2.set(xyz); xyz = x2; }
      s = n++; slot[c] = s; xyz[s * 3] = ix; xyz[s * 3 + 1] = iy; xyz[s * 3 + 2] = iz;
    }
    acc[s * 4] += r; acc[s * 4 + 1] += g; acc[s * 4 + 2] += b; acc[s * 4 + 3] += 1;
  };
  const pos = P, uv = mesh.uv, col = mesh.col;
  for (let t = 0; t < T; t++) {
    const mt = mats[mesh.mat[t]] || { color: [0.8, 0.8, 0.8, 1], tex: null };
    const tex = mt.tex && textures ? textures[mt.tex] || textures[baseName(mt.tex)] || null : null;
    const cut = mt.cutoff !== undefined && mt.cutoff >= 0 ? mt.cutoff : alphaCut;
    const b = t * 9;
    const ax = pos[b], ay = pos[b + 1], az = pos[b + 2], bx = pos[b + 3], by = pos[b + 4], bz = pos[b + 5], cx = pos[b + 6], cy = pos[b + 7], cz = pos[b + 8];
    const L = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
    const steps = Math.max(1, Math.ceil(L * 2)); // шаг ≤ половины блока
    const u0 = uv[t * 6], v0 = uv[t * 6 + 1], u1 = uv[t * 6 + 2], v1 = uv[t * 6 + 3], u2 = uv[t * 6 + 4], v2 = uv[t * 6 + 5];
    const hasUV = tex && u0 === u0; // eslint-disable-line no-self-compare
    const base = mt.color;
    const vc = col ? [col[b], col[b + 1], col[b + 2], col[b + 3], col[b + 4], col[b + 5], col[b + 6], col[b + 7], col[b + 8]] : null;
    // без текстуры и цвета вершин — цвет постоянный, считаем один раз
    const flat = !hasUV && !vc;
    const fr = base[0] * 255, fg = base[1] * 255, fb = base[2] * 255;
    if (flat && base[3] < cut) continue;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps - i; j++) {
        const wb = i / steps, wc = j / steps, wa = 1 - wb - wc;
        const x = ax * wa + bx * wb + cx * wc, y = ay * wa + by * wb + cy * wc, z = az * wa + bz * wb + cz * wc;
        if (flat) { add(x, y, z, fr, fg, fb); continue; }
        let r = base[0], g = base[1], bl = base[2], al = base[3];
        if (vc) { r *= vc[0] * wa + vc[3] * wb + vc[6] * wc; g *= vc[1] * wa + vc[4] * wb + vc[7] * wc; bl *= vc[2] * wa + vc[5] * wb + vc[8] * wc; }
        if (hasUV) {
          const s = sampleTex(tex, u0 * wa + u1 * wb + u2 * wc, v0 * wa + v1 * wb + v2 * wc, mesh.flipV, o.wrap);
          if (s) { r *= s[0] / 255; g *= s[1] / 255; bl *= s[2] / 255; al *= s[3] / 255; }
        }
        if (al < cut) continue;
        add(x, y, z, r * 255, g * 255, bl * 255);
      }
    }
  }
  const surfN = n;
  const inner = [];
  // заполнить внутри: всё, до чего нельзя дойти снаружи (заливка по граням), — внутреннее
  if (o.fill === 'solid' && n) {
    const st = new Uint8Array(N); // 0 — неизвестно, 1 — стенка, 2 — снаружи
    for (let c = 0; c < N; c++) if (slot[c] >= 0) st[c] = 1;
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const seed = (c) => { if (!st[c]) { st[c] = 2; q[qt++] = c; } };
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
      if (x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1) seed((y * sz + z) * sx + x);
    }
    const SXZ = sx * sz;
    while (qh < qt) {
      const c = q[qh++];
      const x = c % sx, z = ((c / sx) | 0) % sz, y = (c / SXZ) | 0;
      if (x > 0) seed(c - 1); if (x < sx - 1) seed(c + 1);
      if (z > 0) seed(c - sx); if (z < sz - 1) seed(c + sx);
      if (y > 0) seed(c - SXZ); if (y < sy - 1) seed(c + SXZ);
    }
    // внутренние — цвет ближайшей стенки (волной от стенок)
    qh = 0; qt = 0;
    for (let c = 0; c < N; c++) if (st[c] === 1) q[qt++] = c;
    const take = (c, from) => {
      if (st[c] !== 0) return;
      st[c] = 1;
      if (n >= cap) { cap *= 2; const a2 = new Float32Array(cap * 4); a2.set(acc); acc = a2; const x2 = new Uint16Array(cap * 3); x2.set(xyz); xyz = x2; }
      const s = n++, f = slot[from];
      slot[c] = s;
      xyz[s * 3] = c % sx; xyz[s * 3 + 1] = (c / SXZ) | 0; xyz[s * 3 + 2] = ((c / sx) | 0) % sz;
      const fc = Math.max(1, acc[f * 4 + 3]);
      acc[s * 4] = acc[f * 4] / fc; acc[s * 4 + 1] = acc[f * 4 + 1] / fc; acc[s * 4 + 2] = acc[f * 4 + 2] / fc; acc[s * 4 + 3] = 1;
      q[qt++] = c;
    };
    while (qh < qt) {
      const c = q[qh++];
      const x = c % sx, z = ((c / sx) | 0) % sz, y = (c / SXZ) | 0;
      if (x > 0) take(c - 1, c); if (x < sx - 1) take(c + 1, c);
      if (z > 0) take(c - sx, c); if (z < sz - 1) take(c + sx, c);
      if (y > 0) take(c - SXZ, c); if (y < sy - 1) take(c + SXZ, c);
    }
    void inner;
  }
  const rgb = new Uint8Array(n * 3);
  for (let s = 0; s < n; s++) {
    const c = Math.max(1, acc[s * 4 + 3]);
    rgb[s * 3] = Math.min(255, Math.round(acc[s * 4] / c)); rgb[s * 3 + 1] = Math.min(255, Math.round(acc[s * 4 + 1] / c)); rgb[s * 3 + 2] = Math.min(255, Math.round(acc[s * 4 + 2] / c));
  }
  const inn = new Uint8Array(n);
  for (let s = surfN; s < n; s++) inn[s] = 1;
  return { size: dim, n, xyz: xyz.slice(0, n * 3), rgb, inner: inn, slot, scale: k, surface: surfN, ms: Date.now() - t0 };
}

// ======================= цвета → блоки =======================
function srgbLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = srgbLin(i);
export function rgbToLab(r, g, b) {
  const R = LIN[r | 0], G = LIN[g | 0], B = LIN[b | 0];
  let x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// CIEDE2000 — «как видит глаз» (в синих и красных тонах заметно точнее простого ΔE76). Палитра посчитана заранее.
function prepDE(L, a, b) {
  const C = Math.hypot(a, b);
  return { L, a, b, C };
}
function de2000(p, q, G) {
  // G — поправка a' по средней насыщенности (считается снаружи для пары; здесь берём по паре)
  const Cb = (p.C + q.C) / 2;
  const C7 = Math.pow(Cb, 7);
  const g = G !== undefined ? G : 0.5 * (1 - Math.sqrt(C7 / (C7 + 6103515625)));
  const a1 = p.a * (1 + g), a2 = q.a * (1 + g);
  const C1 = Math.hypot(a1, p.b), C2 = Math.hypot(a2, q.b);
  let h1 = Math.atan2(p.b, a1); if (h1 < 0) h1 += 2 * Math.PI;
  let h2 = Math.atan2(q.b, a2); if (h2 < 0) h2 += 2 * Math.PI;
  const dL = q.L - p.L, dC = C2 - C1;
  let dh = 0;
  if (C1 * C2) { dh = h2 - h1; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI; }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh / 2);
  const Lb = (p.L + q.L) / 2, Cb2 = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (C1 * C2) { if (Math.abs(h1 - h2) > Math.PI) hb += hb < 2 * Math.PI ? 2 * Math.PI : -2 * Math.PI; hb /= 2; }
  const T = 1 - 0.17 * Math.cos(hb - 0.5236) + 0.24 * Math.cos(2 * hb) + 0.32 * Math.cos(3 * hb + 0.1047) - 0.2 * Math.cos(4 * hb - 1.0996);
  const Lb50 = (Lb - 50) * (Lb - 50);
  const SL = 1 + (0.015 * Lb50) / Math.sqrt(20 + Lb50), SC = 1 + 0.045 * Cb2, SH = 1 + 0.015 * Cb2 * T;
  const dTheta = 0.5236 * Math.exp(-Math.pow((hb * 57.29578 - 275) / 25, 2));
  const C27 = Math.pow(Cb2, 7);
  const RT = -2 * Math.sqrt(C27 / (C27 + 6103515625)) * Math.sin(2 * dTheta);
  const x = dL / SL, y = dC / SC, z = dH / SH;
  return x * x + y * y + z * z + RT * y * z;
}
// palette: [{ id, rgb:[r,g,b] }] → индексатор ближайшего блока (кеш по 6 бит на канал). metric: 'de2000' (по умолчанию) | 'de76'
export function makeMatcher(palette, metric) {
  const P = palette.length;
  const L = new Float32Array(P * 3);
  const Q = palette.map((p, i) => { const l = rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]); L[i * 3] = l[0]; L[i * 3 + 1] = l[1]; L[i * 3 + 2] = l[2]; return prepDE(l[0], l[1], l[2]); });
  const cache = new Int16Array(1 << 18).fill(-1);
  const fast = metric === 'de76';
  return (r, g, b) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const c = cache[key];
    if (c >= 0) return c;
    const [l, a, bb] = rgbToLab((r & ~3) | 2, (g & ~3) | 2, (b & ~3) | 2);
    let best = 0, bd = Infinity;
    if (fast) {
      for (let i = 0; i < P; i++) { const d0 = L[i * 3] - l, d1 = L[i * 3 + 1] - a, d2 = L[i * 3 + 2] - bb; const d = d0 * d0 + d1 * d1 + d2 * d2; if (d < bd) { bd = d; best = i; } }
    } else {
      // 12 ближайших по простому ΔE76, из них — лучший по ΔE2000 (так в разы быстрее, а ошибается только на совсем далёких цветах)
      const p = prepDE(l, a, bb);
      const K = Math.min(P, 12);
      const top = new Array(K).fill(-1), td = new Array(K).fill(Infinity);
      for (let i = 0; i < P; i++) {
        const d0 = L[i * 3] - l, d1 = L[i * 3 + 1] - a, d2 = L[i * 3 + 2] - bb;
        const d = d0 * d0 + d1 * d1 + d2 * d2;
        if (d >= td[K - 1]) continue;
        let j = K - 1;
        while (j > 0 && td[j - 1] > d) { td[j] = td[j - 1]; top[j] = top[j - 1]; j--; }
        td[j] = d; top[j] = i;
      }
      for (let j = 0; j < K; j++) { const i = top[j]; if (i < 0) continue; const d = de2000(p, Q[i]); if (d < bd) { bd = d; best = i; } }
    }
    cache[key] = best;
    return best;
  };
}
// упорядоченное сглаживание: матрица Байера 4×4, сдвиг по Y — чтобы слои не совпадали
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// opts: { dither: 'none'|'ordered'|'diffuse', strength: 0..1, inner: индекс блока палитры для внутренних или -1, metric }
// результат: Int16Array(n) — номер блока палитры (−1 — не ставить)
export function mapToBlocks(vox, palette, opts) {
  const o = opts || {};
  if (!palette.length) throw new Error('Палитра пустая — выбери хоть один блок');
  const match = makeMatcher(palette, o.metric);
  const n = vox.n, out = new Int16Array(n);
  const mode = o.dither || 'none';
  const amp = (o.strength === undefined ? 0.6 : o.strength) * 48;
  const innerIdx = o.inner === undefined ? -2 : o.inner; // -2 — как снаружи
  if (mode === 'diffuse') {
    // ошибка цвета растекается на ещё не обработанных соседей (+x, +z, +y), как Флойд — Стейнберг в 3D
    const [sx, , sz] = vox.size;
    const err = new Float32Array(n * 3);
    const slot = vox.slot;
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    const cell = (i) => (vox.xyz[i * 3 + 1] * sz + vox.xyz[i * 3 + 2]) * sx + vox.xyz[i * 3];
    order.sort((a, b) => cell(a) - cell(b));
    const NB = [[1, 0, 0, 7], [0, 0, 1, 5], [1, 0, 1, 1], [-1, 0, 1, 3], [0, 1, 0, 2]];
    for (const i of order) {
      if (vox.inner[i] && innerIdx !== -2) { out[i] = innerIdx; continue; }
      const r = vox.rgb[i * 3] + err[i * 3], g = vox.rgb[i * 3 + 1] + err[i * 3 + 1], b = vox.rgb[i * 3 + 2] + err[i * 3 + 2];
      const p = match(r, g, b);
      out[i] = p;
      const pr = palette[p].rgb;
      const e = [(r - pr[0]) * (o.strength === undefined ? 0.8 : o.strength), (g - pr[1]) * (o.strength === undefined ? 0.8 : o.strength), (b - pr[2]) * (o.strength === undefined ? 0.8 : o.strength)];
      const x = vox.xyz[i * 3], y = vox.xyz[i * 3 + 1], z = vox.xyz[i * 3 + 2];
      const nbs = [];
      let ws = 0;
      for (const [dx, dy, dz, w] of NB) {
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < 0 || X >= sx || Z < 0 || Z >= sz || Y >= vox.size[1]) continue;
        const s = slot[(Y * sz + Z) * sx + X];
        if (s < 0 || s === undefined || vox.inner[s]) continue;
        nbs.push([s, w]); ws += w;
      }
      for (const [s, w] of nbs) { const f = w / ws; err[s * 3] += e[0] * f; err[s * 3 + 1] += e[1] * f; err[s * 3 + 2] += e[2] * f; }
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    if (vox.inner[i] && innerIdx !== -2) { out[i] = innerIdx; continue; }
    let r = vox.rgb[i * 3], g = vox.rgb[i * 3 + 1], b = vox.rgb[i * 3 + 2];
    if (mode === 'ordered') {
      const x = vox.xyz[i * 3], y = vox.xyz[i * 3 + 1], z = vox.xyz[i * 3 + 2];
      const d = (BAYER[((z + y) & 3) * 4 + ((x + 2 * y) & 3)] / 16 - 0.47) * amp;
      r += d; g += d; b += d;
    }
    out[i] = match(r, g, b);
  }
  return out;
}

// итог для игры и шаблона: палитра только из использованных блоков, блоки плоско [x,y,z,p,…], счёт по блокам
export function toPlacement(vox, idx, palette) {
  const used = new Map();
  const blocks = new Int32Array(vox.n * 4);
  let k = 0;
  const counts = {};
  for (let i = 0; i < vox.n; i++) {
    const p = idx[i];
    if (p < 0) continue;
    let u = used.get(p);
    if (u === undefined) { u = used.size; used.set(p, u); }
    blocks[k * 4] = vox.xyz[i * 3]; blocks[k * 4 + 1] = vox.xyz[i * 3 + 1]; blocks[k * 4 + 2] = vox.xyz[i * 3 + 2]; blocks[k * 4 + 3] = u;
    const id = palette[p].id;
    counts[id] = (counts[id] || 0) + 1;
    k++;
  }
  const pal = new Array(used.size);
  for (const [p, u] of used) pal[u] = palette[p].id;
  return { size: vox.size.slice(), palette: pal, blocks: blocks.subarray(0, k * 4), count: k, counts };
}

// вид сверху в формате описания постройки (как пишет игра): { w, d, top:[индекс pal или -1], y:[высота], pal:[id], rgb:"rrggbb…" }
export function topPreview(vox, idx, palette) {
  const [w, , d] = vox.size;
  const top = new Array(w * d).fill(-1), ys = new Array(w * d).fill(-1);
  for (let i = 0; i < vox.n; i++) {
    const p = idx[i];
    if (p < 0) continue;
    const c = vox.xyz[i * 3 + 2] * w + vox.xyz[i * 3], y = vox.xyz[i * 3 + 1];
    if (y > ys[c]) { ys[c] = y; top[c] = p; }
  }
  const used = new Map();
  let rgb = '';
  const t2 = top.map((p) => {
    if (p < 0) { rgb += '000000'; return -1; }
    rgb += palette[p].rgb.map((v) => (v | 0).toString(16).padStart(2, '0')).join('');
    if (!used.has(p)) used.set(p, used.size);
    return used.get(p);
  });
  const pal = new Array(used.size);
  for (const [p, u] of used) pal[u] = palette[p].id;
  return { w, d, top: t2, y: ys, pal, rgb };
}

// ======================= превью: изометрия на «точках» с буфером глубины =======================
// colors: Uint8Array(n*3) — какими рисовать (цвета модели или блоков). yaw/pitch — градусы. Возвращает { w, h, data }.
export function renderPreview(vox, colors, opts) {
  const o = opts || {};
  const W = o.w || 360, H = o.h || 300;
  const data = new Uint8ClampedArray(W * H * 4);
  const bg = o.bg || [38, 38, 38];
  for (let i = 0; i < W * H; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255; }
  if (!vox || !vox.n) return { w: W, h: H, data };
  const [sx, sy, sz] = vox.size;
  const yaw = ((o.yaw === undefined ? 35 : o.yaw) * Math.PI) / 180, pitch = ((o.pitch === undefined ? 30 : o.pitch) * Math.PI) / 180;
  const cy = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cx0 = sx / 2, cy0 = sy / 2, cz0 = sz / 2;
  const R = Math.hypot(sx, sy, sz) / 2 || 1;
  const sc = (Math.min(W, H) * 0.92) / (2 * R) * (o.zoom || 1);
  const pix = Math.max(1, Math.ceil(sc * 1.15));
  const zb = new Float32Array(W * H).fill(-Infinity);
  const slot = vox.slot;
  const occ = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && slot[(y * sz + z) * sx + x] >= 0;
  // свет: сверху-справа-спереди (в мировых осях)
  const lx = 0.45, ly = 0.8, lz = 0.4;
  for (let i = 0; i < vox.n; i++) {
    if (vox.inner[i]) continue;
    const x = vox.xyz[i * 3], y = vox.xyz[i * 3 + 1], z = vox.xyz[i * 3 + 2];
    // нормаль — по открытым граням
    let nx = 0, ny = 0, nz = 0;
    if (!occ(x + 1, y, z)) nx += 1; if (!occ(x - 1, y, z)) nx -= 1;
    if (!occ(x, y + 1, z)) ny += 1; if (!occ(x, y - 1, z)) ny -= 1;
    if (!occ(x, y, z + 1)) nz += 1; if (!occ(x, y, z - 1)) nz -= 1;
    const nl = Math.hypot(nx, ny, nz);
    if (!nl) continue; // со всех сторон закрыт — не виден
    const sh = 0.55 + 0.45 * Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
    const px = x + 0.5 - cx0, py = y + 0.5 - cy0, pz = z + 0.5 - cz0;
    const rx = px * cy - pz * syw;
    const rz = px * syw + pz * cy;
    const ry = py * cp - rz * sp;
    const depth = py * sp + rz * cp;
    const X = Math.round(W / 2 + rx * sc - pix / 2), Y = Math.round(H / 2 - ry * sc - pix / 2);
    const r = colors[i * 3] * sh, g = colors[i * 3 + 1] * sh, b = colors[i * 3 + 2] * sh;
    for (let yy = Math.max(0, Y); yy < Math.min(H, Y + pix); yy++) {
      for (let xx = Math.max(0, X); xx < Math.min(W, X + pix); xx++) {
        const c = yy * W + xx;
        if (depth <= zb[c]) continue;
        zb[c] = depth;
        data[c * 4] = r; data[c * 4 + 1] = g; data[c * 4 + 2] = b;
      }
    }
  }
  // контур граней: где глубина резко меняется — чуть темнее (читаются блоки)
  if (pix >= 4) {
    for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
      const c = y * W + x;
      if (zb[c] === -Infinity) continue;
      if (Math.abs(zb[c] - zb[c - 1]) > 0.5 || Math.abs(zb[c] - zb[c - W]) > 0.5) { data[c * 4] *= 0.8; data[c * 4 + 1] *= 0.8; data[c * 4 + 2] *= 0.8; }
    }
  }
  return { w: W, h: H, data };
}

// ======================= палитра по умолчанию (без игры) =======================
// средние цвета текстур ванильных блоков 1.21 (примерно). flags: t — прозрачный, g — падает, e — блок-сущность (сундук…)
const RAW = `white_wool 234 236 237|orange_wool 241 118 20|magenta_wool 189 68 179|light_blue_wool 58 175 217|yellow_wool 249 198 40|lime_wool 112 185 26|pink_wool 237 141 172|gray_wool 63 68 72|light_gray_wool 142 142 135|cyan_wool 21 138 145|purple_wool 122 42 173|blue_wool 53 57 157|brown_wool 114 72 41|green_wool 85 110 28|red_wool 161 39 35|black_wool 21 21 26
|white_concrete 207 213 214|orange_concrete 224 97 1|magenta_concrete 169 48 159|light_blue_concrete 36 137 199|yellow_concrete 241 175 21|lime_concrete 94 169 24|pink_concrete 214 101 143|gray_concrete 55 58 62|light_gray_concrete 125 125 115|cyan_concrete 21 119 136|purple_concrete 100 32 156|blue_concrete 45 47 143|brown_concrete 96 60 32|green_concrete 73 91 36|red_concrete 142 33 33|black_concrete 8 10 15
|terracotta 152 94 67|white_terracotta 210 178 161|orange_terracotta 162 84 38|magenta_terracotta 150 88 109|light_blue_terracotta 113 109 138|yellow_terracotta 186 133 35|lime_terracotta 104 118 53|pink_terracotta 162 78 79|gray_terracotta 58 42 36|light_gray_terracotta 135 107 98|cyan_terracotta 87 91 91|purple_terracotta 118 70 86|blue_terracotta 74 60 91|brown_terracotta 77 51 36|green_terracotta 76 83 42|red_terracotta 143 61 47|black_terracotta 37 23 17
|stone 126 126 126|cobblestone 128 127 128|mossy_cobblestone 110 118 95|smooth_stone 158 158 158|andesite 136 136 137|polished_andesite 132 135 134|diorite 189 188 189|polished_diorite 193 193 195|granite 149 103 86|polished_granite 154 106 89|deepslate 80 80 82|cobbled_deepslate 77 77 81|polished_deepslate 72 72 73|deepslate_bricks 70 70 71|tuff 108 109 103|calcite 223 224 221|dripstone_block 134 107 92
|dirt 134 96 67|coarse_dirt 119 86 59|rooted_dirt 144 104 77|grass_block 108 140 64|podzol 92 63 24|mud 60 57 61|packed_mud 142 106 80|mud_bricks 137 103 79|clay 160 166 179|moss_block 89 109 45|sand 219 207 163 g|red_sand 190 102 33 g|gravel 131 127 126 g|sandstone 216 203 155|smooth_sandstone 223 214 170|red_sandstone 181 98 31|snow_block 249 254 254|packed_ice 141 180 250|blue_ice 116 167 253|ice 145 183 253 t
|oak_log 109 85 50|spruce_log 58 37 16|birch_log 216 215 210|jungle_log 85 67 25|acacia_log 103 96 86|dark_oak_log 60 46 26|mangrove_log 84 66 36|cherry_log 54 33 44|oak_planks 162 130 78|spruce_planks 114 84 48|birch_planks 192 175 121|jungle_planks 160 115 80|acacia_planks 168 90 50|dark_oak_planks 66 43 20|mangrove_planks 117 54 48|cherry_planks 226 178 172|bamboo_planks 193 173 80|crimson_planks 101 48 70|warped_planks 43 104 99|stripped_oak_log 177 144 86|stripped_birch_log 196 176 118|stripped_spruce_log 115 89 52
|bricks 150 97 83|stone_bricks 122 121 122|mossy_stone_bricks 115 121 105|cracked_stone_bricks 118 117 118|chiseled_stone_bricks 119 118 119|prismarine 99 156 151|prismarine_bricks 99 171 158|dark_prismarine 51 91 75|nether_bricks 44 21 26|red_nether_bricks 69 7 9|netherrack 97 38 38|blackstone 42 36 41|polished_blackstone 53 48 56|basalt 80 81 86|smooth_basalt 72 72 78|end_stone 219 222 158|end_stone_bricks 218 224 162|purpur_block 169 125 169|quartz_block 235 229 222|obsidian 15 10 24|crying_obsidian 32 10 60
|gold_block 246 208 61|iron_block 220 220 220|diamond_block 98 237 228|emerald_block 42 203 87|lapis_block 30 67 140|redstone_block 175 24 5|coal_block 16 15 15|copper_block 192 107 79|exposed_copper 161 125 103|weathered_copper 108 153 110|oxidized_copper 82 162 132|netherite_block 66 61 63|amethyst_block 133 97 191|raw_iron_block 166 135 107|raw_gold_block 221 169 46|raw_copper_block 154 105 79
|hay_block 166 136 38|melon 111 145 30|pumpkin 198 118 24|bone_block 229 225 207|dried_kelp_block 50 58 38|honeycomb_block 229 148 29|nether_wart_block 114 2 2|warped_wart_block 22 119 121|shroomlight 240 146 70|glowstone 171 131 84|sea_lantern 172 199 190|magma_block 142 63 31|mushroom_stem 203 196 185|red_mushroom_block 200 46 45|brown_mushroom_block 149 111 81|sculk 12 29 36|target 226 170 157|bookshelf 117 94 59
|glass 175 213 219 t|white_stained_glass 255 255 255 t|oak_leaves 60 100 30 t|barrel 134 100 58 e|white_concrete_powder 225 227 227 g|slime_block 111 192 91 t`;
export const DEFAULT_BLOCKS = RAW.split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
  const p = s.split(/\s+/);
  return { id: 'minecraft:' + p[0], rgb: [Number(p[1]), Number(p[2]), Number(p[3])], flags: p[4] || '' };
});

// пресеты палитры
export const PRESETS = [
  ['all', 'Все блоки', 'Все полные блоки из палитры игры (или встроенного списка) — точнее всего по цвету.'],
  ['colorful', 'Шерсть + бетон + терракота', 'Яркие ровные цвета без узоров — как пиксель-арт.'],
  ['natural', 'Только натуральные', 'Камень, земля, дерево, песчаник, кирпич — чтобы постройка выглядела «по-майнкрафтовски».'],
  ['custom', 'Свой список', 'Отметь галочками нужные блоки в палитре.']
];
const COLORFUL = /(^|:)(\w+_)?(wool|concrete|terracotta)$/;
const NATURAL = /(^|:)(stone|cobblestone|mossy_cobblestone|smooth_stone|(polished_)?(andesite|diorite|granite|deepslate|blackstone)|cobbled_deepslate|deepslate_bricks|tuff|calcite|dripstone_block|dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mud|packed_mud|mud_bricks|clay|moss_block|(smooth_|red_)?sandstone|snow_block|packed_ice|\w+_log|stripped_\w+_log|\w+_planks|bricks|(mossy_|cracked_|chiseled_)?stone_bricks|basalt|smooth_basalt|netherrack|nether_bricks|end_stone|obsidian|hay_block|bone_block|terracotta|\w+_terracotta|bookshelf)$/;
// без флагов от игры — догадываемся по имени
const TRANSPARENT = /glass|leaves|(^|:)ice$|frosted_ice|slime_block|honey_block|barrier|spawner|_pane|iron_bars|chain$|scaffolding|cobweb|light$/;
const GRAVITY = /(^|:)(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$|concrete_powder|anvil|dragon_egg|pointed_dripstone/;
const ENTITY = /chest|barrel|furnace|smoker|hopper|dispenser|dropper|shulker|sign|banner|_bed$|beehive|bee_nest|lectern|beacon|jukebox|note_block|command_block|structure_block|jigsaw|campfire|brewing|enchanting|conduit|(^|:)bell$|skull|_head$|sculk_(sensor|shrieker|catalyst)|crafter|vault|trial_spawner|decorated_pot|chiseled_bookshelf|comparator|daylight_detector|spawner/;
export function blockFlags(b) {
  if (b.flags !== undefined && b.flags !== null) return b.flags;
  const id = b.id;
  return (TRANSPARENT.test(id) ? 't' : '') + (GRAVITY.test(id) ? 'g' : '') + (ENTITY.test(id) ? 'e' : '');
}
// blocks: [{ id, rgb, flags? }]; opts: { preset, custom:[id], noTransparent, noGravity, noEntity }
export function filterPalette(blocks, opts) {
  const o = opts || {};
  return blocks.filter((b) => {
    const f = blockFlags(b);
    if (o.noTransparent !== false && f.includes('t')) return false;
    if (o.noGravity !== false && f.includes('g')) return false;
    if (o.noEntity !== false && f.includes('e')) return false;
    if (o.preset === 'colorful') return COLORFUL.test(b.id);
    if (o.preset === 'natural') return NATURAL.test(b.id);
    if (o.preset === 'custom') return (o.custom || []).includes(b.id);
    return true;
  });
}
// ответ игры {t:'blocks', ids, colors:{id:[r,g,b]}, names:{id:'название'}, info:{id:{ full, transparent, gravity, be, light }}} → список блоков.
// Флаги: t — прозрачный или не полный блок (ступеньки, заборы — для модели как «дырки»), g — падает, e — блок-сущность.
export function blocksFromGame(msg) {
  if (!msg || !msg.colors) return null;
  const info = msg.info || {};
  const names = msg.names || {};
  const flags = msg.flags || {};
  return Object.keys(msg.colors).filter((id) => Array.isArray(msg.colors[id]) && msg.colors[id].length >= 3).map((id) => {
    const inf = info[id];
    const f = inf ? (inf.transparent || inf.full === false ? 't' : '') + (inf.gravity ? 'g' : '') + (inf.be ? 'e' : '') : flags[id];
    return { id, rgb: msg.colors[id].slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v)))), flags: f, name: names[id] || undefined, light: inf && inf.light ? inf.light : undefined };
  });
}
