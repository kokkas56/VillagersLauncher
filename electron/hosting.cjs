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
    password: store.getSecret('hostServer:password') || '', // только для карточки хозяина (показать/скопировать)
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
  // пароль меняется только явно: строка — новый пароль, null — убрать. Пустая строка из формы ничего не стирает.
  if (patch.password === null || patch.removePassword) store.setSecret('hostServer:password', null);
  else if (typeof patch.password === 'string' && patch.password.trim()) store.setSecret('hostServer:password', patch.password.trim().slice(0, 64));
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
// ---------- настройки игры на сервере (server.properties / ops.json / whitelist.json) ----------
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFS = ['peaceful', 'easy', 'normal', 'hard'];
const LEVEL_TYPES = ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'];
// ключ настройки → [ключ server.properties, как записать, как прочитать, применяется на ходу?]
const PROPS = {
  gamemode: ['gamemode', (v) => v, (v) => v],
  forceGamemode: ['force-gamemode', (v) => String(!!v), (v) => v === 'true'],
  difficulty: ['difficulty', (v) => v, (v) => v],
  pvp: ['pvp', (v) => String(!!v), (v) => v !== 'false'],
  viewDistance: ['view-distance', (v) => String(v), Number],
  simulationDistance: ['simulation-distance', (v) => String(v), Number],
  whitelist: ['white-list', (v) => String(!!v), (v) => v === 'true'],
  spawnProtection: ['spawn-protection', (v) => String(v), Number],
  allowFlight: ['allow-flight', (v) => String(!!v), (v) => v === 'true'],
  opLevel: ['op-permission-level', (v) => String(v), Number],
  seed: ['level-seed', (v) => v, (v) => v],
  levelType: ['level-type', (v) => v, (v) => v],
  commandBlocks: ['enable-command-block', (v) => String(!!v), (v) => v === 'true']
};
const VANILLA = { gamemode: 'survival', forceGamemode: false, difficulty: 'easy', pvp: true, viewDistance: 10, simulationDistance: 10, whitelist: false,
  spawnProtection: 16, allowFlight: false, opLevel: 4, seed: '', levelType: 'minecraft:normal', commandBlocks: false };
// что требует перезапуска (остальное отправляем командами в консоль работающего сервера)
const RESTART = { forceGamemode: 'принудительный режим', pvp: 'PvP', viewDistance: 'дальность прорисовки', simulationDistance: 'дальность симуляции',
  spawnProtection: 'защита спавна', allowFlight: 'полёты', opLevel: 'уровень прав операторов', motd: 'описание (MOTD)', maxPlayers: 'число игроков',
  commandBlocks: 'командные блоки', seed: 'сид (только для нового мира)', levelType: 'тип мира (только для нового мира)' };

function readProps() {
  const out = {};
  try {
    for (const l of fs.readFileSync(path.join(serverDir(), 'server.properties'), 'utf8').split(/\r?\n/)) {
      const m = /^([^#=\s][^=]*)=(.*)$/.exec(l);
      if (m) out[m[1].trim()] = m[2].replace(/\\(.)/g, '$1');
    }
  } catch (_) {}
  return out;
}
function hostName() {
  const s = store.get();
  const a = (s.accounts || []).find((x) => x.id === s.selectedAccount);
  return (a && a.name) || s.lastAccountName || '';
}
const nameList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9_]{2,16}$/.test(x)))];
function clampInt(v, lo, hi, def) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; }
function normGame(g) {
  g = g && typeof g === 'object' ? g : {};
  const o = {};
  if (g.gamemode !== undefined) o.gamemode = GAMEMODES.includes(g.gamemode) ? g.gamemode : 'survival';
  if (g.forceGamemode !== undefined) o.forceGamemode = !!g.forceGamemode;
  if (g.difficulty !== undefined) o.difficulty = DIFFS.includes(g.difficulty) ? g.difficulty : 'normal';
  if (g.pvp !== undefined) o.pvp = !!g.pvp;
  if (g.viewDistance !== undefined) o.viewDistance = clampInt(g.viewDistance, 3, 32, 10);
  if (g.simulationDistance !== undefined) o.simulationDistance = clampInt(g.simulationDistance, 3, 32, 10);
  if (g.whitelist !== undefined) o.whitelist = !!g.whitelist;
  if (g.spawnProtection !== undefined) o.spawnProtection = clampInt(g.spawnProtection, 0, 256, 16);
  if (g.allowFlight !== undefined) o.allowFlight = !!g.allowFlight;
  if (g.opLevel !== undefined) o.opLevel = clampInt(g.opLevel, 1, 4, 4);
  if (g.commandBlocks !== undefined) o.commandBlocks = !!g.commandBlocks;
  if (g.seed !== undefined) o.seed = String(g.seed || '').trim().slice(0, 64);
  if (g.levelType !== undefined) o.levelType = LEVEL_TYPES.includes(g.levelType) ? g.levelType : 'minecraft:normal';
  if (g.motd !== undefined) o.motd = String(g.motd || '').replace(/\r?\n/g, ' ').slice(0, 120);
  if (g.opHost !== undefined) o.opHost = !!g.opHost;
  if (g.ops !== undefined) o.ops = nameList(g.ops);
  if (g.whitelistNames !== undefined) o.whitelistNames = nameList(g.whitelistNames);
  return o;
}
// настройки игры для карточки: заданные в лаунчере → из server.properties → как у ванильного сервера
function game() {
  const g = store.get().serverGame || {};
  const p = readProps();
  const out = {};
  for (const [k, [pk, , read]] of Object.entries(PROPS)) out[k] = g[k] !== undefined ? g[k] : p[pk] !== undefined && p[pk] !== '' ? read(p[pk]) : VANILLA[k];
  if (!LEVEL_TYPES.includes(out.levelType)) out.levelType = 'minecraft:normal';
  out.motd = g.motd || '';
  out.opHost = g.opHost !== false;
  out.ops = g.ops || [];
  out.whitelistNames = g.whitelistNames || [];
  out.host = hostName();
  out.worldExists = worldExists();
  return out;
}
function worldExists() {
  const p = profile();
  return fs.existsSync(path.join(serverDir(), p.world ? 'worlds/' + p.world : 'world', 'level.dat'));
}
// сохранить; если сервер работает — какие команды отправить сразу и что применится после перезапуска
function updateGame(patch, running) {
  const prev = game();
  const next = { ...(store.get().serverGame || {}), ...normGame(patch) };
  store.set({ serverGame: next });
  const now = game();
  const commands = [];
  const restart = [];
  if (running) {
    if (now.difficulty !== prev.difficulty) commands.push('difficulty ' + now.difficulty);
    if (now.gamemode !== prev.gamemode) commands.push('defaultgamemode ' + now.gamemode);
    const opsOf = (g) => new Set([...(g.opHost && g.host ? [g.host] : []), ...g.ops].map((x) => x.toLowerCase()));
    const nameOf = (g, low) => [...(g.host ? [g.host] : []), ...g.ops].find((x) => x.toLowerCase() === low) || low;
    const po = opsOf(prev), no = opsOf(now);
    for (const n of no) if (!po.has(n)) commands.push('op ' + nameOf(now, n));
    for (const n of po) if (!no.has(n)) commands.push('deop ' + nameOf(prev, n));
    const wl = (g) => new Set(wlNames(g).map((x) => x.toLowerCase()));
    const pw = wl(prev), nw = wl(now);
    const turnedOn = now.whitelist && !prev.whitelist;
    for (const n of wlNames(now)) if (turnedOn || !pw.has(n.toLowerCase())) commands.push('whitelist add ' + n);
    for (const n of wlNames(prev)) if (!nw.has(n.toLowerCase())) commands.push('whitelist remove ' + n);
    if (now.whitelist !== prev.whitelist) commands.push(now.whitelist ? 'whitelist on' : 'whitelist off');
    for (const k of Object.keys(RESTART)) if (k !== 'maxPlayers' && JSON.stringify(now[k]) !== JSON.stringify(prev[k])) restart.push(RESTART[k]);
  }
  return { game: now, commands, restart };
}
function wlNames(g) { return [...new Set([...(g.host ? [g.host] : []), ...g.ops, ...g.whitelistNames])]; }

// UUID офлайн-игрока (сервер в online-mode=false считает его так же)
function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
// перед запуском: ops.json и whitelist.json по настройкам (операторы из списка лаунчера; добавленные командой /op тоже остаются)
function writeAccess(dir) {
  const g = game();
  const read = (f) => { try { const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const prevManaged = new Set(((store.get().serverGame || {})._managedOps || []).map((x) => x.toLowerCase()));
  const want = [...new Set([...(g.opHost && g.host ? [g.host] : []), ...g.ops])];
  const wantLow = new Set(want.map((x) => x.toLowerCase()));
  // убираем тех, кого лаунчер раньше сделал оператором, а теперь их нет в списке
  const ops = read('ops.json').filter((o) => o && o.name && (wantLow.has(o.name.toLowerCase()) || !prevManaged.has(o.name.toLowerCase())));
  for (const n of want) {
    const i = ops.findIndex((o) => o.name.toLowerCase() === n.toLowerCase());
    const e = { uuid: offlineUuid(n), name: n, level: g.opLevel || 4, bypassesPlayerLimit: false };
    if (i >= 0) ops[i] = { ...ops[i], ...e }; else ops.push(e);
  }
  fs.writeFileSync(path.join(dir, 'ops.json'), JSON.stringify(ops, null, 2));
  store.set({ serverGame: { ...(store.get().serverGame || {}), _managedOps: want } });
  if (g.whitelist) {
    const wl = read('whitelist.json').filter((o) => o && o.name);
    for (const n of wlNames(g)) if (!wl.some((o) => o.name.toLowerCase() === n.toLowerCase())) wl.push({ uuid: offlineUuid(n), name: n });
    fs.writeFileSync(path.join(dir, 'whitelist.json'), JSON.stringify(wl, null, 2));
  }
}

// что прописать в server.properties. opts.maxPlayers — на этот запуск (игра отрядом: «Максимум игроков» из лобби)
function props(opts) {
  const p = profile();
  const g = store.get().serverGame || {};
  const out = {
    'level-name': p.world ? 'worlds/' + p.world : 'world',
    motd: (g.motd || (p.name + (p.desc ? ' — ' + p.desc : ''))).replace(/\n/g, ' ').slice(0, 120),
    'max-players': String(opts && Number(opts.maxPlayers) > 0 ? Math.max(1, Math.min(100, Math.round(Number(opts.maxPlayers)))) : p.maxPlayers),
    'white-list': 'false'
  };
  // только то, что хозяин задал в лаунчере; остальное остаётся как в server.properties
  for (const [k, [pk, write]] of Object.entries(PROPS)) if (g[k] !== undefined) out[pk] = write(g[k]);
  if (g.whitelist !== undefined) out['enforce-whitelist'] = String(!!g.whitelist);
  return out;
}

module.exports = { radmin, profile, update, resetKey, keyOf, parseKey, tunnelPassword, hostTunnelPassword, worlds, importWorld, newWorld, props, publicIdOf, game, updateGame, writeAccess, offlineUuid, normGame };
