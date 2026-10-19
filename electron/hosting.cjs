// «Мой сервер»: настройки сервера, который открывает игрок (имя, описание, мир, пароль, доступ) и ключ для входа.
// Сервер наружу не торчит: зайти можно только через туннель лаунчера, а комната туннеля открывается секретом из ключа
// (+ паролем, если он задан). Без ключа (и пароля) до сервера не добраться.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const store = require('./store.cjs');

// Radmin VPN, если уже стоит у игрока: адаптер «Radmin VPN» с адресом 26.x.x.x. Ничего не ставим и не трогаем — только читаем.
function radmin() {
  const ifs = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifs)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (/radmin/i.test(name) || /^26\./.test(a.address)) return { found: true, ip: a.address, adapter: name };
    }
  }
  return { found: false, ip: null };
}

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const publicIdOf = (room) => crypto.createHash('sha256').update('vks-public:' + room).digest('hex').slice(0, 16);

function serverDir() { return path.join(store.get().gameDir, 'server'); }
function worldsDir() { return path.join(serverDir(), 'worlds'); }

// настройки + постоянные id (создаются один раз)
function profile() {
  const s = store.get();
  let h = s.hostServer || {};
  if (!h.room) {
    h = { ...h, room: 'vks-' + crypto.randomBytes(6).toString('hex') };
    store.set({ hostServer: h });
  }
  if (!store.getSecret('hostServer:secret')) store.setSecret('hostServer:secret', b64u(crypto.randomBytes(18)));
  return {
    name: h.name || ((s.lastAccountName || 'Мой') + ' сервер'),
    desc: h.desc || '',
    maxPlayers: h.maxPlayers || s.serverMaxPlayers || 10,
    world: h.world || null,
    radmin: h.radmin || '',
    room: h.room,
    id: publicIdOf(h.room),
    hasPassword: !!store.getSecret('hostServer:password'),
    autoStart: !!h.autoStart
  };
}
function update(patch) {
  const cur = store.get().hostServer || {};
  const next = { ...cur };
  for (const k of ['name', 'desc', 'maxPlayers', 'world', 'radmin', 'autoStart']) if (patch[k] !== undefined) next[k] = patch[k];
  if (next.name) next.name = String(next.name).slice(0, 48);
  if (next.desc) next.desc = String(next.desc).slice(0, 400);
  if (next.maxPlayers) next.maxPlayers = Math.max(1, Math.min(100, Number(next.maxPlayers) || 10));
  store.set({ hostServer: next });
  if (patch.password !== undefined) store.setSecret('hostServer:password', patch.password ? String(patch.password) : null);
  return profile();
}
// новый ключ: старый перестаёт работать (например, если ключ утёк)
function resetKey() {
  const cur = store.get().hostServer || {};
  store.set({ hostServer: { ...cur, room: 'vks-' + crypto.randomBytes(6).toString('hex') } });
  store.setSecret('hostServer:secret', b64u(crypto.randomBytes(18)));
  return profile();
}

function keyOf() {
  const p = profile();
  const rm = radmin();
  const auto = rm.found ? rm.ip + ':' + (store.get().serverPort || 25565) : '';
  const data = { r: p.room, s: store.getSecret('hostServer:secret'), n: p.name, pw: p.hasPassword ? 1 : 0, a: p.radmin || auto || undefined };
  return 'VKS1-' + b64u(JSON.stringify(data));
}
function parseKey(key) {
  const m = /VKS1-([A-Za-z0-9_-]+)/.exec(String(key || '').trim());
  if (!m) throw new Error('Это не ключ сервера: он начинается с VKS1-');
  let d;
  try { d = JSON.parse(unb64u(m[1]).toString('utf8')); } catch (_) { throw new Error('Ключ повреждён — скопируй его целиком'); }
  if (!d || !d.r || !d.s) throw new Error('Ключ повреждён — скопируй его целиком');
  return { key: 'VKS1-' + m[1], room: String(d.r), secret: String(d.s), name: String(d.n || 'Сервер').slice(0, 48), password: !!d.pw, radmin: d.a ? String(d.a).slice(0, 64) : '', id: publicIdOf(String(d.r)) };
}
// пароль комнаты туннеля = секрет ключа (+ пароль сервера)
function tunnelPassword(secret, password) { return password ? secret + '|' + password : secret; }
function hostTunnelPassword() { return tunnelPassword(store.getSecret('hostServer:secret'), store.getSecret('hostServer:password') || ''); }

// ---------- миры ----------
function listDirs(d) {
  try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(d, e.name, 'level.dat'))).map((e) => e.name); } catch (_) { return []; }
}
function worlds() {
  const saves = path.join(store.get().gameDir, 'saves');
  const own = listDirs(worldsDir());
  const sp = listDirs(saves);
  const info = (d, name) => { let mtime = 0; try { mtime = fs.statSync(path.join(d, name, 'level.dat')).mtimeMs; } catch (_) {} return mtime; };
  return {
    server: own.map((n) => ({ name: n, mtime: info(worldsDir(), n) })).sort((a, b) => b.mtime - a.mtime),
    single: sp.map((n) => ({ name: n, mtime: info(saves, n), onServer: own.includes(n) })).sort((a, b) => b.mtime - a.mtime)
  };
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'session.lock') continue;
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
// перенести одиночный мир на сервер (копия: одиночный остаётся как был)
function importWorld(name, overwrite) {
  const src = path.join(store.get().gameDir, 'saves', name);
  if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Мир не найден: ' + name);
  const dst = path.join(worldsDir(), name);
  if (fs.existsSync(dst)) {
    if (!overwrite) throw new Error('На сервере уже есть мир с таким именем');
    fs.renameSync(dst, dst + '.old-' + Date.now());
  }
  copyDir(src, dst);
  return update({ world: name });
}
function newWorld(name) {
  const clean = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'Мир сервера';
  fs.mkdirSync(path.join(worldsDir(), clean), { recursive: true }); // мир создаст сам сервер при первом запуске
  return update({ world: clean });
}
// что прописать в server.properties
function props() {
  const p = profile();
  return {
    'level-name': p.world ? 'worlds/' + p.world : 'world',
    motd: (p.name + (p.desc ? ' — ' + p.desc : '')).replace(/\n/g, ' ').slice(0, 59),
    'max-players': String(p.maxPlayers),
    'white-list': 'false'
  };
}

module.exports = { radmin, profile, update, resetKey, keyOf, parseKey, tunnelPassword, hostTunnelPassword, worlds, importWorld, newWorld, props, publicIdOf };
