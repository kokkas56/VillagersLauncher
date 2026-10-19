// Моды, миры, скриншоты, пинг серверов, файлы скинов.
const fs = require('fs');
const path = require('path');
const netSock = require('net');
const AdmZip = require('adm-zip');
const store = require('./store.cjs');

// ---------- моды ----------
function tomlValue(block, key) {
  const ml = new RegExp(`^\\s*${key}\\s*=\\s*('''|""")([\\s\\S]*?)\\1`, 'm').exec(block);
  if (ml) return ml[2].trim();
  const sl = new RegExp(`^\\s*${key}\\s*=\\s*(["'])(.*?)\\1`, 'm').exec(block);
  return sl ? sl[2] : null;
}

function readModInfo(file) {
  const info = { file: path.basename(file), size: fs.statSync(file).size };
  try {
    const zip = new AdmZip(file);
    const toml = zip.getEntry('META-INF/neoforge.mods.toml') || zip.getEntry('META-INF/mods.toml');
    if (toml) {
      const txt = toml.getData().toString('utf8');
      const start = txt.indexOf('[[mods]]');
      const end = start >= 0 ? txt.indexOf('[[', start + 8) : -1;
      const block = start >= 0 ? txt.slice(start, end > 0 ? end : undefined) : txt;
      info.id = tomlValue(block, 'modId');
      info.name = tomlValue(block, 'displayName') || info.id;
      info.version = tomlValue(block, 'version');
      info.description = (tomlValue(block, 'description') || '').slice(0, 400);
      info.authors = tomlValue(block, 'authors') || tomlValue(txt, 'authors');
      const logo = tomlValue(block, 'logoFile') || tomlValue(txt, 'logoFile');
      if (info.version && info.version.includes('${')) {
        const mf = zip.getEntry('META-INF/MANIFEST.MF');
        const m = mf && /Implementation-Version:\s*(\S+)/.exec(mf.getData().toString('utf8'));
        info.version = m ? m[1] : '';
      }
      if (logo) {
        const e = zip.getEntry(logo) || zip.getEntry(logo.replace(/^\//, ''));
        if (e && e.header.size < 400000) info.icon = 'data:image/png;base64,' + e.getData().toString('base64');
      }
    }
  } catch (_) {}
  if (!info.name) info.name = info.file.replace(/\.jar(\.disabled)?$/, '');
  info.kokk = /kokk/i.test(info.file) || /kokk/i.test(info.authors || '');
  return info;
}

const modCache = new Map();
function listMods(gameDir) {
  const dir = path.join(gameDir, 'mods');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.jar(\.disabled)?$/i.test(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    const key = abs + st.size + st.mtimeMs;
    let info = modCache.get(key);
    if (!info) { info = readModInfo(abs); modCache.set(key, info); }
    out.push({ ...info, enabled: !name.endsWith('.disabled'), path: 'mods/' + name.replace(/\.disabled$/i, '') });
  }
  return out.sort((a, b) => (b.kokk - a.kokk) || a.name.localeCompare(b.name));
}

// ---------- миры ----------
function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else try { total += fs.statSync(p).size; } catch (_) {}
    }
  };
  walk(dir);
  return total;
}

function listWorlds(gameDir) {
  const dir = path.join(gameDir, 'saves');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const p = path.join(dir, e.name);
    const icon = path.join(p, 'icon.png');
    let mtime = 0;
    try { mtime = fs.statSync(path.join(p, 'level.dat')).mtimeMs; } catch (_) { try { mtime = fs.statSync(p).mtimeMs; } catch (_) {} }
    return {
      name: e.name,
      icon: fs.existsSync(icon) ? 'data:image/png;base64,' + fs.readFileSync(icon).toString('base64') : null,
      mtime
    };
  }).sort((a, b) => b.mtime - a.mtime);
}

function backupsDir(gameDir) { return path.join(gameDir, 'backups'); }

async function backupWorld(gameDir, name) {
  const src = path.join(gameDir, 'saves', name);
  if (!fs.existsSync(src)) throw new Error('Мир не найден');
  fs.mkdirSync(backupsDir(gameDir), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = path.join(backupsDir(gameDir), `${name}_${stamp}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(src, name, (f) => !/session\.lock$/.test(f));
  await zip.writeZipPromise(out);
  return { file: out, size: fs.statSync(out).size };
}

function listBackups(gameDir) {
  const dir = backupsDir(gameDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return { file: f, size: st.size, mtime: st.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
}

function restoreBackup(gameDir, file) {
  const abs = path.join(backupsDir(gameDir), path.basename(file));
  const zip = new AdmZip(abs);
  const first = zip.getEntries()[0];
  const worldName = first ? first.entryName.split('/')[0] : path.basename(file, '.zip');
  let target = path.join(gameDir, 'saves', worldName);
  if (fs.existsSync(target)) {
    // не перезаписываем живой мир: восстанавливаем рядом
    let n = 2;
    while (fs.existsSync(`${target} (${n})`)) n++;
    const tmp = path.join(gameDir, 'saves', `.restore-${Date.now()}`);
    zip.extractAllTo(tmp, true);
    fs.renameSync(path.join(tmp, worldName), `${target} (${n})`);
    fs.rmSync(tmp, { recursive: true, force: true });
    target = `${target} (${n})`;
  } else {
    zip.extractAllTo(path.join(gameDir, 'saves'), true);
  }
  return path.basename(target);
}

// ---------- скриншоты ----------
function listScreenshots(gameDir) {
  const dir = path.join(gameDir, 'screenshots');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f) => {
    const st = fs.statSync(path.join(dir, f));
    return { file: f, size: st.size, mtime: st.mtimeMs, url: 'vlimg://screenshots/' + encodeURIComponent(f) };
  }).sort((a, b) => b.mtime - a.mtime);
}

// ---------- пинг сервера (Server List Ping) ----------
function varint(n) {
  const out = [];
  n >>>= 0;
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return Buffer.from(out);
}
function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}
function readVarint(buf, off) {
  let val = 0, shift = 0, b;
  do {
    if (off >= buf.length) return null;
    b = buf[off++];
    val |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return { val, off };
}

function pingServer(address, timeout = 4500) {
  let host = address.trim();
  let port = 25565;
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(host);
  if (m) { host = m[1]; if (m[2]) port = parseInt(m[2], 10); }
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = netSock.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    const done = (r) => { sock.destroy(); resolve(r); };
    sock.setTimeout(timeout, () => done({ online: false, error: 'timeout' }));
    sock.on('error', (e) => done({ online: false, error: e.code || e.message }));
    sock.on('connect', () => {
      const hostBuf = Buffer.from(host, 'utf8');
      const portBuf = Buffer.alloc(2); portBuf.writeUInt16BE(port);
      const hs = Buffer.concat([varint(767), varint(hostBuf.length), hostBuf, portBuf, varint(1)]);
      sock.write(packet(0, hs));
      sock.write(packet(0, Buffer.alloc(0)));
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const len = readVarint(buf, 0);
      if (!len || buf.length < len.off + len.val) return;
      const id = readVarint(buf, len.off);
      const sl = readVarint(buf, id.off);
      const json = buf.slice(sl.off, sl.off + sl.val).toString('utf8');
      try {
        const data = JSON.parse(json);
        const motd = typeof data.description === 'string' ? data.description : flattenChat(data.description);
        done({
          online: true,
          ping: Date.now() - started,
          version: data.version && data.version.name,
          players: data.players ? { online: data.players.online, max: data.players.max, sample: (data.players.sample || []).map((p) => p.name) } : null,
          motd: (motd || '').replace(/§./g, ''),
          favicon: data.favicon || null
        });
      } catch (e) {
        done({ online: false, error: 'bad response' });
      }
    });
  });
}
function flattenChat(c) {
  if (!c) return '';
  if (typeof c === 'string') return c;
  return (c.text || '') + (c.extra || []).map(flattenChat).join('');
}

// ---------- скины для мода SkinKokk ----------
function skinDir(gameDir) { return path.join(gameDir, 'skinkokk'); }

function dataUrlToBuf(u) { return Buffer.from(u.split(',')[1], 'base64'); }

function applySkin(gameDir, { skin, cape, slim, name }) {
  const dir = skinDir(gameDir);
  fs.mkdirSync(path.join(dir, 'wardrobe'), { recursive: true });
  if (skin) fs.writeFileSync(path.join(dir, 'skin.png'), dataUrlToBuf(skin));
  if (cape) fs.writeFileSync(path.join(dir, 'cape.png'), dataUrlToBuf(cape));
  else if (cape === null) fs.rmSync(path.join(dir, 'cape.png'), { force: true });
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ model: slim ? 'slim' : 'default', name: name || '', updated: Date.now() }, null, 1));
  if (name && skin) saveToWardrobe(gameDir, { skin, cape, slim, name });
  return true;
}

// плащ-награда из мини-игр: только cape.png, сам скин не трогаем
function applyCape(gameDir, cape) {
  const dir = skinDir(gameDir);
  fs.mkdirSync(dir, { recursive: true });
  if (cape) fs.writeFileSync(path.join(dir, 'cape.png'), dataUrlToBuf(cape));
  else fs.rmSync(path.join(dir, 'cape.png'), { force: true });
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8')); } catch (_) {}
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ ...meta, updated: Date.now() }, null, 1));
  return true;
}

function clearSkin(gameDir) {
  const dir = skinDir(gameDir);
  for (const f of ['skin.png', 'cape.png']) fs.rmSync(path.join(dir, f), { force: true });
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ model: 'default', name: '', updated: Date.now(), cleared: true }));
}

function safeName(n) { return (n || 'skin').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48); }

function saveToWardrobe(gameDir, { skin, cape, slim, name }) {
  const dir = path.join(skinDir(gameDir), 'wardrobe');
  fs.mkdirSync(dir, { recursive: true });
  const base = safeName(name);
  fs.writeFileSync(path.join(dir, base + '.png'), dataUrlToBuf(skin));
  if (cape) fs.writeFileSync(path.join(dir, base + '.cape.png'), dataUrlToBuf(cape));
  fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify({ model: slim ? 'slim' : 'default', name }));
}

function listWardrobe(gameDir) {
  const dir = path.join(skinDir(gameDir), 'wardrobe');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.endsWith('.cape.png')).map((f) => {
    const base = f.slice(0, -4);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, base + '.json'), 'utf8')); } catch (_) {}
    const capeFile = path.join(dir, base + '.cape.png');
    return {
      id: base,
      name: meta.name || base,
      slim: meta.model === 'slim',
      skin: 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'),
      cape: fs.existsSync(capeFile) ? 'data:image/png;base64,' + fs.readFileSync(capeFile).toString('base64') : null
    };
  });
}

function removeFromWardrobe(gameDir, id) {
  const dir = path.join(skinDir(gameDir), 'wardrobe');
  for (const ext of ['.png', '.cape.png', '.json']) fs.rmSync(path.join(dir, safeName(id) + ext), { force: true });
}

function currentSkin(gameDir) {
  const dir = skinDir(gameDir);
  const f = path.join(dir, 'skin.png');
  if (!fs.existsSync(f)) return null;
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8')); } catch (_) {}
  const cape = path.join(dir, 'cape.png');
  return {
    skin: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'),
    cape: fs.existsSync(cape) ? 'data:image/png;base64,' + fs.readFileSync(cape).toString('base64') : null,
    slim: meta.model === 'slim',
    name: meta.name || ''
  };
}

// ---------- шаблоны и проекты редактора ----------
const EDITOR_DIR = path.join(store.DATA_DIR, 'skin-editor');
function editorList(kind) {
  const dir = path.join(EDITOR_DIR, kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    try { return { id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }; } catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
function editorSave(kind, id, data) {
  const dir = path.join(EDITOR_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  const sid = safeName(id || data.name || ('item-' + Date.now()));
  fs.writeFileSync(path.join(dir, sid + '.json'), JSON.stringify({ ...data, updated: Date.now() }));
  return sid;
}
function editorRemove(kind, id) {
  fs.rmSync(path.join(EDITOR_DIR, kind, safeName(id) + '.json'), { force: true });
}

module.exports = { applyCape,
  listMods, listWorlds, backupWorld, listBackups, restoreBackup, listScreenshots, pingServer,
  applySkin, clearSkin, saveToWardrobe, listWardrobe, removeFromWardrobe, currentSkin,
  editorList, editorSave, editorRemove, dirSize
};
