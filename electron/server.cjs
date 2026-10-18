// Сервер сборки прямо в лаунчере: NeoForge-сервер в папке игры (server/), моды сборки без чисто клиентских,
// офлайн-режим (заходят и Ely.by, и офлайн-ники), консоль, остановка. Мир живёт, даже если хозяин вышел из игры.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store.cjs');
const netu = require('./net.cjs');
const java = require('./java.cjs');

let proc = null;
let state = 'stopped'; // stopped | installing | starting | running | stopping
let tail = [];
let emit = () => {};

function dir() { return path.join(store.get().gameDir, 'server'); }
function markerFile() { return path.join(dir(), '.villagerslauncher.json'); }
function readMarker() { try { return JSON.parse(fs.readFileSync(markerFile(), 'utf8')); } catch (_) { return {}; } }
function writeMarker(m) { fs.writeFileSync(markerFile(), JSON.stringify(m, null, 2)); }

function setState(s, extra) { state = s; emit('server-state', { state, port: store.get().serverPort || 25565, ...(extra || {}) }); }
function line(l) { tail.push(l); if (tail.length > 600) tail = tail.slice(-500); emit('server-log', [l]); }

function status() {
  const m = readMarker();
  return { state, installed: !!m.neo, neo: m.neo || null, dir: dir(), port: store.get().serverPort || 25565, eula: !!store.get().serverEulaAccepted, tail: tail.slice(-200) };
}

function excluded(name) {
  const pats = store.get().serverExcludeMods || [];
  const n = name.toLowerCase();
  return pats.some((p) => p && n.includes(String(p).toLowerCase()));
}

async function install(versions, progress) {
  const d = dir();
  fs.mkdirSync(d, { recursive: true });
  const m = readMarker();
  if (m.neo === versions.neoVersion && fs.existsSync(path.join(d, 'libraries'))) return m;
  setState('installing');
  const javaPath = await java.resolveJava(21, progress);
  const javaCli = javaPath.replace(/javaw\.exe$/i, 'java.exe');
  const installer = path.join(store.DATA_DIR, 'runtime', 'installers', `neoforge-${versions.neoVersion}-installer.jar`);
  fs.mkdirSync(path.dirname(installer), { recursive: true });
  if (!fs.existsSync(installer)) {
    progress({ stage: 'server', text: 'Скачиваю NeoForge ' + versions.neoVersion });
    await netu.downloadFile(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${versions.neoVersion}/neoforge-${versions.neoVersion}-installer.jar`, installer);
  }
  progress({ stage: 'server', text: 'Ставлю сервер NeoForge (первый раз пару минут)…', indeterminate: true });
  await new Promise((resolve, reject) => {
    const p = spawn(fs.existsSync(javaCli) ? javaCli : javaPath, ['-jar', installer, '--installServer', d], { cwd: d, windowsHide: true });
    let log = '';
    const on = (b) => { const s = b.toString(); log = (log + s).slice(-60000); const l = s.trim().split(/\r?\n/).pop(); if (l) progress({ stage: 'server', text: 'NeoForge: ' + l.slice(0, 110), indeterminate: true }); };
    p.stdout.on('data', on);
    p.stderr.on('data', on);
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else { fs.writeFileSync(path.join(d, 'install.log'), log); reject(new Error('Установщик сервера NeoForge завершился с ошибкой (код ' + code + '), лог: server/install.log')); }
    });
  });
  const next = { ...readMarker(), neo: versions.neoVersion, mc: versions.mcVersion, installedAt: Date.now() };
  writeMarker(next);
  setState('stopped');
  return next;
}

function copyDir(src, dst, overwrite) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b, overwrite);
    else if (overwrite || !fs.existsSync(b)) fs.copyFileSync(a, b);
  }
}

// моды и настройки сборки → сервер (без чисто клиентских модов; лишние старые убираем)
function syncPack() {
  const s = store.get();
  const d = dir();
  const src = path.join(s.gameDir, 'mods');
  const dst = path.join(d, 'mods');
  fs.mkdirSync(dst, { recursive: true });
  const m = readMarker();
  const prev = new Set(m.mods || []);
  const now = [];
  const skipped = [];
  for (const f of fs.existsSync(src) ? fs.readdirSync(src) : []) {
    if (!f.endsWith('.jar')) continue;
    if (excluded(f)) { skipped.push(f); continue; }
    const a = path.join(src, f), b = path.join(dst, f);
    const sa = fs.statSync(a);
    if (!fs.existsSync(b) || fs.statSync(b).size !== sa.size) fs.copyFileSync(a, b);
    now.push(f);
  }
  for (const f of prev) if (!now.includes(f)) try { fs.rmSync(path.join(dst, f), { force: true }); } catch (_) {}
  for (const f of skipped) if (prev.has(f)) try { fs.rmSync(path.join(dst, f), { force: true }); } catch (_) {}
  copyDir(path.join(s.gameDir, 'defaultconfigs'), path.join(d, 'defaultconfigs'), true);
  copyDir(path.join(s.gameDir, 'config'), path.join(d, 'config'), false);
  writeMarker({ ...m, mods: now });
  return { mods: now.length, skipped };
}

function writeProps() {
  const s = store.get();
  const f = path.join(dir(), 'server.properties');
  const want = {
    'server-port': String(s.serverPort || 25565),
    'online-mode': 'false', // заходят и Ely.by, и офлайн-ники (как в открытом мире NetKokk)
    'enforce-secure-profile': 'false',
    motd: (s.serverMotd || 'MineVillagers — сервер сборки').replace(/\n/g, ' '),
    'max-players': String(s.serverMaxPlayers || 10)
  };
  let lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : ['#Minecraft server properties'];
  const seen = new Set();
  lines = lines.map((l) => {
    const m = /^([^#=\s][^=]*)=(.*)$/.exec(l);
    if (m && want[m[1]] !== undefined) { seen.add(m[1]); return `${m[1]}=${want[m[1]]}`; }
    return l;
  });
  for (const [k, v] of Object.entries(want)) if (!seen.has(k)) lines.push(`${k}=${v}`);
  fs.writeFileSync(f, lines.join('\n'));
  fs.writeFileSync(path.join(dir(), 'user_jvm_args.txt'), `-Xms1G\n-Xmx${s.serverMemoryMb || 4096}M\n-Dfile.encoding=UTF-8\n`);
}

async function start(versions, progress) {
  if (proc) throw new Error('Сервер уже запущен');
  if (!store.get().serverEulaAccepted) throw new Error('Сначала прими лицензию Minecraft (EULA) — галочка в разделе сервера');
  tail = [];
  const m = await install(versions, progress);
  progress({ stage: 'server', text: 'Переношу моды сборки на сервер…', indeterminate: true });
  const r = syncPack();
  if (r.skipped.length) line(`[лаунчер] Без клиентских модов: ${r.skipped.join(', ')}`);
  fs.writeFileSync(path.join(dir(), 'eula.txt'), 'eula=true\n');
  writeProps();
  const argsFile = path.join('libraries', 'net', 'neoforged', 'neoforge', m.neo, process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt');
  if (!fs.existsSync(path.join(dir(), argsFile))) throw new Error('Сервер установлен не полностью — удали папку server и запусти снова');
  const javaPath = await java.resolveJava(21, progress);
  const javaCli = javaPath.replace(/javaw\.exe$/i, 'java.exe');
  setState('starting');
  line('[лаунчер] Запускаю сервер…');
  proc = spawn(fs.existsSync(javaCli) ? javaCli : javaPath, ['@user_jvm_args.txt', '@' + argsFile, 'nogui'], { cwd: dir(), windowsHide: true });
  const on = (b) => {
    for (const l of b.toString('utf8').split(/\r?\n/)) {
      if (!l) continue;
      line(l);
      if (state === 'starting' && /Done \(\d/.test(l)) setState('running');
    }
  };
  proc.stdout.on('data', on);
  proc.stderr.on('data', on);
  proc.on('error', (e) => line('[лаунчер] ' + e.message));
  proc.on('close', (code) => {
    proc = null;
    line(`[лаунчер] Сервер остановлен (код ${code})`);
    const crashed = state !== 'stopping' && code !== 0;
    setState('stopped', crashed ? { crashed: true, hint: hint() } : {});
  });
  return true;
}

function hint() {
  const t = tail.slice(-120).join('\n');
  const m = /Attempted to load class (net\/minecraft\/client\S*)|invalid dist DEDICATED_SERVER|Mod (\S+) only supports CLIENT/i.exec(t);
  const mod = /mod file \S*?([^/\\\s]+\.jar)/i.exec(t);
  if (m) return 'Похоже, один из модов только для клиента' + (mod ? `: ${mod[1]}` : '') + '. Добавь часть его имени в «Не брать на сервер».';
  return null;
}

function command(text) { if (proc && text) proc.stdin.write(String(text).trim() + '\n'); }

function stop() {
  if (!proc) return Promise.resolve(true);
  setState('stopping');
  command('stop');
  return new Promise((resolve) => {
    const p = proc;
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, 40000);
    p.on('close', () => { clearTimeout(t); resolve(true); });
  });
}

function running() { return !!proc; }

module.exports = { init: (fn) => { emit = fn; }, status, install, start, stop, command, running, dir };
