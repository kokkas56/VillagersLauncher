// Сервер сборки прямо в лаунчере: NeoForge-сервер в папке игры (server/), моды сборки без чисто клиентских,
// офлайн-режим (заходят и Ely.by, и офлайн-ники), консоль, остановка. Мир живёт, даже если хозяин вышел из игры.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store.cjs');
const netu = require('./net.cjs');
const java = require('./java.cjs');
const hosting = require('./hosting.cjs');
const modsides = require('./modsides.cjs');

let proc = null;
let state = 'stopped'; // stopped | installing | starting | running | stopping
let tail = [];
let players = new Set(); // кто сейчас на сервере (по строкам консоли)
let lastCrash = null; // причина последнего падения — показываем, пока не запустят снова
let runMax = null; // max-players этого запуска (для игры отрядом — из лобби)
let emit = () => {};

function dir() { return path.join(store.get().gameDir, 'server'); }
function markerFile() { return path.join(dir(), '.villagerslauncher.json'); }
function readMarker() { try { return JSON.parse(fs.readFileSync(markerFile(), 'utf8')); } catch (_) { return {}; } }
function writeMarker(m) { fs.writeFileSync(markerFile(), JSON.stringify(m, null, 2)); }

function setState(s, extra) { state = s; emit('server-state', { state, port: store.get().serverPort || 25565, players: [...players], maxPlayers: proc ? runMax : null, crash: lastCrash, ...(extra || {}) }); }
function line(l) { tail.push(l); if (tail.length > 600) tail = tail.slice(-500); emit('server-log', [l]); }

function status() {
  const m = readMarker();
  return { state, maxPlayers: proc ? runMax : null, installed: !!m.neo, neo: m.neo || null, dir: dir(), port: store.get().serverPort || 25565, eula: !!store.get().serverEulaAccepted, tail: tail.slice(-200), players: [...players], crash: lastCrash, mods: m.lastSync || null };
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

// моды и настройки сборки → сервер. Решаем по neoforge.mods.toml каждого jar (modsides.cjs) + ручные списки
// «всегда на сервер» / «никогда на сервер». Мир сервера и свои файлы сервера не трогаем.
function modPlan() {
  const s = store.get();
  const src = path.join(s.gameDir, 'mods');
  const m = readMarker();
  const cache = m.modScan || {};
  const plan = [];
  for (const f of fs.existsSync(src) ? fs.readdirSync(src) : []) {
    if (!f.toLowerCase().endsWith('.jar')) continue;
    plan.push(modsides.classify(path.join(src, f), f, { always: s.serverModsAlways || [], never: s.serverModsNever || [], cache }));
  }
  // кеш только по живым файлам
  const live = new Set(plan.map((p) => p.file));
  for (const k of Object.keys(cache)) if (!live.has(k) && !k.startsWith('server:')) delete cache[k];
  return { plan, cache };
}

function syncPack() {
  const s = store.get();
  const d = dir();
  const src = path.join(s.gameDir, 'mods');
  const dst = path.join(d, 'mods');
  fs.mkdirSync(dst, { recursive: true });
  const m = readMarker();
  const prev = new Set(m.mods || []);
  const { plan, cache } = modPlan();
  const want = plan.filter((p) => p.server);
  const wantFiles = new Set(want.map((p) => p.file.toLowerCase()));
  const packFiles = new Set(plan.map((p) => p.file.toLowerCase()));
  const packIds = new Set(plan.flatMap((p) => p.ids));
  const added = [];
  const removed = [];
  const own = [];
  for (const p of want) {
    const a = path.join(src, p.file), b = path.join(dst, p.file);
    const sa = fs.statSync(a);
    let same = false;
    try { const sb = fs.statSync(b); same = sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs - 2000; } catch (_) {}
    if (!same) { fs.copyFileSync(a, b); try { fs.utimesSync(b, sa.atime, sa.mtime); } catch (_) {} if (!prev.has(p.file)) added.push(p.file); }
  }
  // лишнее в server/mods: то, что клали мы раньше; файлы сборки, которые серверу не нужны (клиентские);
  // старые версии модов сборки под другим именем (тот же id). Чужие серверные моды не трогаем — только показываем.
  const trash = path.join(d, 'mods-removed');
  for (const f of fs.readdirSync(dst)) {
    if (!f.toLowerCase().endsWith('.jar') || wantFiles.has(f.toLowerCase())) continue;
    const abs = path.join(dst, f);
    if (prev.has(f)) { try { fs.rmSync(abs, { force: true }); removed.push(f); } catch (_) {} continue; }
    let ids = [];
    try { ids = modsides.classify(abs, f, { cache: (cache['server:'] = cache['server:'] || {}) }).ids; } catch (_) {}
    if (packFiles.has(f.toLowerCase()) || ids.some((id) => packIds.has(id))) {
      // положено вручную: не удаляем насовсем, а убираем в server/mods-removed
      try { fs.mkdirSync(trash, { recursive: true }); fs.renameSync(abs, path.join(trash, f)); removed.push(f); } catch (_) {}
    } else own.push(f);
  }
  copyDir(path.join(s.gameDir, 'defaultconfigs'), path.join(d, 'defaultconfigs'), true);
  copyDir(path.join(s.gameDir, 'config'), path.join(d, 'config'), false);
  const skipped = plan.filter((p) => !p.server).map((p) => ({ file: p.file, ids: p.ids, reason: p.reason }));
  const result = { at: Date.now(), total: plan.length, mods: want.length, skipped, added, removed, own,
    kept: want.filter((p) => /канал|вручную/.test(p.reason)).map((p) => ({ file: p.file, ids: p.ids, reason: p.reason })) };
  writeMarker({ ...readMarker(), mods: want.map((p) => p.file), modScan: cache, lastSync: result });
  return result;
}

function writeProps(opts) {
  const s = store.get();
  const f = path.join(dir(), 'server.properties');
  const want = {
    'server-port': String(s.serverPort || 25565),
    'online-mode': 'false', // заходят и Ely.by, и офлайн-ники (как в открытом мире NetKokk)
    'enforce-secure-profile': 'false',
    'enable-rcon': 'false',
    ...hosting.props(opts)
  };
  runMax = Number(want['max-players']) || null;
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

// opts: { maxPlayers } — только на этот запуск (игра отрядом); без него — из настроек «Моего сервера»
async function start(versions, progress, opts) {
  if (proc) throw new Error('Сервер уже запущен');
  if (!store.get().serverEulaAccepted) throw new Error('Сначала прими лицензию Minecraft (EULA) — галочка в разделе сервера');
  tail = [];
  players = new Set();
  lastCrash = null;
  const m = await install(versions, progress);
  progress({ stage: 'server', text: 'Переношу моды сборки на сервер…', indeterminate: true });
  const r = syncPack();
  line(`[лаунчер] Модов на сервере: ${r.mods} из ${r.total}` + (r.added.length ? `, добавлено ${r.added.length}` : '') + (r.removed.length ? `, убрано ${r.removed.length}` : ''));
  if (r.skipped.length) line(`[лаунчер] Только для клиента (не на сервер): ${r.skipped.map((x) => x.file).join(', ')}`);
  if (r.own.length) line(`[лаунчер] Свои моды сервера (не из сборки, оставлены): ${r.own.join(', ')}`);
  fs.writeFileSync(path.join(dir(), 'eula.txt'), 'eula=true\n');
  writeProps(opts);
  hosting.writeAccess(dir());
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
      const j = /\]: (\S+) joined the game/.exec(l);
      const q = /\]: (\S+) left the game/.exec(l);
      if (j) { players.add(j[1]); setState(state); }
      if (q) { players.delete(q[1]); setState(state); }
    }
  };
  proc.stdout.on('data', on);
  proc.stderr.on('data', on);
  proc.on('error', (e) => line('[лаунчер] ' + e.message));
  proc.on('close', (code) => {
    proc = null;
    line(`[лаунчер] Сервер остановлен (код ${code})`);
    const crashed = state !== 'stopping' && (code !== 0 || state === 'starting');
    players = new Set();
    if (crashed) lastCrash = { at: Date.now(), code, hint: hint(), reason: reasonLine(), lines: tail.filter((x) => /ERROR|Exception|Caused by|FATAL|failed|Missing|requires|incompatible/i.test(x)).slice(-12) };
    setState('stopped', crashed ? { crashed: true, hint: lastCrash.hint } : {});
  });
  return true;
}

// главная строка причины падения из лога сервера (+ какой мод виноват)
function reasonLine() {
  const t = tail.slice(-400);
  const pats = [/Failed to create mod instance\. ModID: \S+.*/i, /for invalid dist DEDICATED_SERVER.*/i, /Mod (\S+) only supports CLIENT.*/i,
    /Missing or unsupported mandatory dependencies.*/i, /Mod \S+ requires .*/i, /Address already in use.*|FAILED TO BIND TO PORT.*/i,
    /OutOfMemoryError.*|Could not reserve enough space.*/i, /Failed to load level.*|Exception reading .*level\.dat.*/i,
    /Caused by: .*/, /Exception in thread .*/, /\b(ERROR|FATAL)\]: .*/];
  for (const re of pats) for (let i = t.length - 1; i >= 0; i--) { const m = re.exec(t[i]); if (m) return t[i].replace(/^\[[^\]]*\]\s*(\[[^\]]*\]\s*)*:?\s*/, '').trim().slice(0, 300); }
  return null;
}
function modFileOf(id) {
  const cache = readMarker().modScan || {};
  for (const [f, c] of Object.entries(cache)) if (c && c.info && (c.info.ids || []).includes(id)) return f;
  return null;
}
function hint() {
  const t = tail.slice(-400).join('\n');
  const inst = /Failed to create mod instance\. ModID: (\S+?),/i.exec(t);
  const only = /Mod (\S+) only supports CLIENT/i.exec(t);
  const client = /Attempted to load class (net\/minecraft\/client\S*)|invalid dist DEDICATED_SERVER/i.test(t);
  if (client || only) {
    const id = (inst && inst[1]) || (only && only[1]);
    const file = id ? modFileOf(id) : null;
    const jar = /mod file \S*?([^/\\\s]+\.jar)/i.exec(t);
    const who = id ? `«${id}»${file ? ' (' + file + ')' : ''}` : jar ? jar[1] : '';
    return `Мод ${who || 'из сборки'} на сервере обращается к клиентским классам. Если это мод только для клиента — впиши его id в «Никогда на сервер» (блок «Моды сервера») и запусти снова. Если мод нужен на сервере (например, свой мод) — это ошибка в самом моде.`;
  }
  if (/Address already in use|FAILED TO BIND TO PORT/i.test(t)) return 'Порт занят: уже запущен другой сервер или игра. Закрой его или поменяй порт.';
  if (/OutOfMemoryError|Could not reserve enough space/i.test(t)) return 'Серверу не хватило памяти. Уменьши «Память, МБ» или закрой лишние программы.';
  if (/Missing or unsupported mandatory dependencies|requires .* or above/i.test(t)) return 'Не хватает мода-зависимости или версия не та — смотри строки ниже. Если зависимость нужна только клиенту, а сервер её требует — добавь мод в «Всегда на сервер».';
  if (/Failed to load level|level\.dat|corrupt/i.test(t)) return 'Не получилось открыть мир — возможно, он повреждён. Выбери другой мир.';
  if (/EULA/i.test(t)) return 'Нужно принять лицензию Minecraft (EULA).';
  return 'Сервер упал при запуске. Ниже — строки с ошибкой; пришли автору файл server/logs/latest.log.';
}

// пересобрать моды сервера без запуска (кнопка в карточке)
function syncMods() {
  if (proc) throw new Error('Сначала останови сервер: пока он работает, файлы модов заняты');
  return syncPack();
}
// что будет на сервере (без копирования) — для карточки
function previewMods() {
  const { plan } = modPlan();
  return { total: plan.length, mods: plan.filter((p) => p.server).length, skipped: plan.filter((p) => !p.server).map((p) => ({ file: p.file, ids: p.ids, reason: p.reason })) };
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
function playerList() { return [...players]; }
function maxPlayers() { return proc ? runMax : null; }

module.exports = { init: (fn) => { emit = fn; }, status, install, start, stop, command, running, dir, playerList, maxPlayers, syncMods, previewMods, state: () => state };
