// Какие моды сборки нужны серверу. Читаем META-INF/neoforge.mods.toml прямо из jar (свой маленький читатель zip,
// без зависимостей) и решаем: «на обе стороны» → на сервер, «только клиент» → не берём.
// Признаки клиентского мода: все зависимости с side="CLIENT", displayTest="IGNORE_ALL_VERSION", известные id.
// Но если мод регистрирует обязательный сетевой канал (PayloadRegistrar без .optional()), он нужен и серверу —
// иначе при входе «Канал мода … отсутствует на стороне сервера» (так было с Floating Damage Numbers).
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// известные чисто клиентские моды (id из neoforge.mods.toml; «*» в конце — по началу id)
const KNOWN_CLIENT = [
  'sodium', 'sodium_extra', 'sodiumextra', 'reeses_sodium_options', 'sodiumdynamiclights', 'sodiumoptionsapi',
  'iris', 'oculus', 'embeddium', 'rubidium', 'entityculling', 'immediatelyfast', 'betterfpsdist', 'notenoughanimations',
  'fancymenu', 'drippyloadingscreen', 'entity_model_features', 'entity_texture_features', 'continuity', 'dynamic_fps', 'dynamicfps',
  'skinlayers3d', 'sounds', 'mru', 'emi*', 'wthit', 'waila', 'mousetweaks', 'controlling', 'searchables', 'catalogue', 'betterf3',
  'legendarytooltips', 'zoomify', 'chat_heads'
];

// ---------- zip: центральный каталог ----------
function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  let off = 0;
  while (off < len) { const n = fs.readSync(fd, b, off, len - off, pos + off); if (!n) break; off += n; }
  return off === len ? b : b.subarray(0, off);
}
function entries(fd, size) {
  const tailLen = Math.min(size, 65557);
  const tail = readAt(fd, size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('не zip');
  let count = tail.readUInt16LE(e + 10);
  let cdSize = tail.readUInt32LE(e + 12);
  let cdOff = tail.readUInt32LE(e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) { // zip64
    const loc = e - 20;
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z = readAt(fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
      if (z.readUInt32LE(0) === 0x06064b50) { count = Number(z.readBigUInt64LE(32)); cdSize = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48)); }
    }
  }
  const cd = readAt(fd, cdOff, cdSize);
  const out = [];
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
    const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), comLen = cd.readUInt16LE(p + 32);
    out.push({ name: cd.toString('utf8', p + 46, p + 46 + nameLen), method: cd.readUInt16LE(p + 10), csize: cd.readUInt32LE(p + 20), size: cd.readUInt32LE(p + 24), off: cd.readUInt32LE(p + 42) });
    p += 46 + nameLen + extraLen + comLen;
  }
  return out;
}
function readEntry(fd, en) {
  const h = readAt(fd, en.off, 30);
  if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('битый zip');
  const data = readAt(fd, en.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), en.csize);
  if (en.method === 0) return data;
  if (en.method === 8) return zlib.inflateRawSync(data);
  throw new Error('сжатие ' + en.method);
}

// ---------- neoforge.mods.toml (только нужное: моды, displayTest, стороны зависимостей) ----------
function parseToml(text) {
  const mods = [];
  const deps = {};
  let sec = null; let cur = null;
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    // многострочные строки """…""" / '''…''' пропускаем целиком
    const ml = /=\s*("""|''')/.exec(l);
    if (ml && l.indexOf(ml[1], ml.index + ml[0].length) < 0) {
      while (++i < lines.length && lines[i].indexOf(ml[1]) < 0);
      continue;
    }
    l = l.replace(/^\s+/, '');
    if (!l || l[0] === '#') continue;
    const h = /^\[\[\s*([^\]]+?)\s*\]\]/.exec(l) || /^\[\s*([^\]]+?)\s*\]/.exec(l);
    if (h) {
      const name = h[1].replace(/"/g, '');
      if (name === 'mods') { cur = { modId: null, displayTest: null }; mods.push(cur); sec = 'mods'; }
      else if (name.startsWith('dependencies.')) { const id = name.slice(13); cur = { modId: null, side: null }; (deps[id] = deps[id] || []).push(cur); sec = 'dep'; }
      else { cur = null; sec = name; }
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))/.exec(l);
    if (!kv) continue;
    const k = kv[1]; const v = kv[2] != null ? kv[2] : kv[3] != null ? kv[3] : kv[4];
    if (sec === 'mods' && cur) { if (k === 'modId') cur.modId = v; else if (k === 'displayTest') cur.displayTest = v; }
    else if (sec === 'dep' && cur) { if (k === 'modId') cur.modId = v; else if (k === 'side') cur.side = String(v).toUpperCase(); }
    else if (sec === null && k === 'displayTest') mods.forEach((m) => { if (!m.displayTest) m.displayTest = v; });
  }
  return { mods: mods.filter((m) => m.modId), deps };
}

const REG = Buffer.from('net/neoforged/neoforge/network/registration/PayloadRegistrar');
const OPT = Buffer.from('()Lnet/neoforged/neoforge/network/registration/PayloadRegistrar;'); // .optional()

// разбор одного jar: id модов, признаки «только клиент», сетевые каналы
function inspect(file, { deep } = {}) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const list = entries(fd, size);
    const toml = list.find((e) => e.name === 'META-INF/neoforge.mods.toml') || list.find((e) => e.name === 'META-INF/mods.toml');
    const r = { ids: [], library: !toml, clientDeps: false, ignoreAll: false, ignoreServer: false, payload: null, payloadOptional: null };
    if (!toml) return r;
    const t = parseToml(readEntry(fd, toml).toString('utf8'));
    r.ids = t.mods.map((m) => m.modId);
    r.ignoreAll = t.mods.length > 0 && t.mods.every((m) => /IGNORE_ALL_VERSION/i.test(m.displayTest || ''));
    r.ignoreServer = t.mods.some((m) => /IGNORE_SERVER_VERSION/i.test(m.displayTest || ''));
    // все зависимости модов (обычно neoforge и minecraft) помечены side="CLIENT" → мод только для клиента
    const sides = r.ids.flatMap((id) => (t.deps[id] || []).map((d) => d.side || 'BOTH'));
    const core = r.ids.flatMap((id) => (t.deps[id] || []).filter((d) => d.modId === 'neoforge' || d.modId === 'minecraft').map((d) => d.side || 'BOTH'));
    r.clientDeps = (core.length > 0 && core.every((s) => s === 'CLIENT')) || (sides.length > 0 && sides.every((s) => s === 'CLIENT'));
    if (deep) {
      // ищем регистрацию сетевых каналов в классах (только у подозрительных на «клиентский», это недолго)
      let any = false; let allOpt = true;
      for (const e of list) {
        if (!e.name.endsWith('.class') || e.size > 2e6) continue;
        let b;
        try { b = readEntry(fd, e); } catch (_) { continue; }
        if (b.indexOf(REG) < 0) continue;
        any = true;
        if (b.indexOf(OPT) < 0 || b.indexOf('optional') < 0) allOpt = false;
      }
      r.payload = any;
      r.payloadOptional = any ? allOpt : null;
    }
    return r;
  } finally { fs.closeSync(fd); }
}

function matchId(pats, id) {
  id = String(id || '').toLowerCase();
  return (pats || []).some((p) => { p = String(p || '').toLowerCase().trim(); if (!p) return false; return p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p; });
}
// ручной список: id мода (sodium, emi*) или часть имени файла
function matchUser(pats, file, ids) {
  const n = file.toLowerCase();
  return (pats || []).some((p) => {
    p = String(p || '').toLowerCase().trim();
    if (!p) return false;
    return ids.some((id) => matchId([p], id)) || n.includes(p.replace(/\*$/, ''));
  });
}

/**
 * Решение по одному jar. cache — объект { [file]: { size, mtime, info } } (переживает перезапуски).
 * Возвращает { file, ids, server: true|false, reason }.
 */
function classify(abs, file, { always = [], never = [], cache = {} } = {}) {
  let st;
  try { st = fs.statSync(abs); } catch (_) { return { file, ids: [], server: false, reason: 'нет файла' }; }
  const c = cache[file];
  let info = c && c.size === st.size && c.mtime === st.mtimeMs ? c.info : null;
  if (!info) {
    try { info = inspect(abs); } catch (e) { info = { ids: [], library: true, error: e.message }; }
    cache[file] = { size: st.size, mtime: st.mtimeMs, info };
  }
  const ids = info.ids || [];
  if (matchUser(never, file, ids)) return { file, ids, server: false, reason: 'никогда на сервер (вручную)' };
  if (matchUser(always, file, ids)) return { file, ids, server: true, reason: 'всегда на сервер (вручную)' };
  if (info.library) return { file, ids, server: true, reason: info.error ? 'не прочитался — беру на всякий случай' : 'библиотека' };
  const known = ids.length > 0 && ids.every((id) => matchId(KNOWN_CLIENT, id));
  const hinted = info.clientDeps || info.ignoreAll;
  if (!known && !hinted) return { file, ids, server: true, reason: info.ignoreServer ? 'серверный мод' : 'нужен обеим сторонам' };
  // похож на клиентский: проверяем, не регистрирует ли он обязательный сетевой канал
  if (info.payload == null) {
    try { const d = inspect(abs, { deep: true }); info = { ...info, payload: d.payload, payloadOptional: d.payloadOptional }; } catch (_) { info = { ...info, payload: false }; }
    cache[file] = { size: st.size, mtime: st.mtimeMs, info };
  }
  if (info.payload && !info.payloadOptional) return { file, ids, server: true, reason: 'есть сетевой канал — нужен и серверу' };
  const why = known ? 'известный клиентский мод' : info.clientDeps ? 'в mods.toml только side="CLIENT"' : 'displayTest=IGNORE_ALL_VERSION';
  return { file, ids, server: false, reason: why };
}

module.exports = { KNOWN_CLIENT, inspect, classify, parseToml, entries };
