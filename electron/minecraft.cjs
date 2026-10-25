// Установка Minecraft + NeoForge и сборка команды запуска.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const store = require('./store.cjs');
const netu = require('./net.cjs');
const java = require('./java.cjs');

const RT = store.RUNTIME_DIR;
const LIB_DIR = path.join(RT, 'libraries');
const VER_DIR = path.join(RT, 'versions');
const ASSET_DIR = path.join(RT, 'assets');
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const AUTHLIB_INJECTOR = {
  url: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar',
  file: path.join(RT, 'authlib-injector-1.2.5.jar')
};

const OS_NAME = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const CP_SEP = process.platform === 'win32' ? ';' : ':';

function ruleAllows(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== OS_NAME) match = false;
      if (r.os.arch && r.os.arch !== (process.arch === 'ia32' ? 'x86' : process.arch)) match = false;
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) if (!!features[k] !== v) match = false;
    }
    if (match) allowed = r.action === 'allow';
  }
  return allowed;
}

function mavenPath(name) {
  // group:artifact:version[:classifier][@ext]
  let ext = 'jar';
  let n = name;
  const at = n.indexOf('@');
  if (at >= 0) { ext = n.slice(at + 1); n = n.slice(0, at); }
  const [group, artifact, version, classifier] = n.split(':');
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return path.join(...group.split('.'), artifact, version, file);
}

function libKey(name) {
  const p = name.split('@')[0].split(':');
  return p[0] + ':' + p[1] + (p[3] ? ':' + p[3] : '');
}

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

async function vanillaJson(mcVersion) {
  const file = path.join(VER_DIR, mcVersion, mcVersion + '.json');
  if (fs.existsSync(file)) return readJson(file);
  const manifest = await netu.getJson(MANIFEST_URL);
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error('Не найдена версия Minecraft ' + mcVersion);
  await netu.downloadFile(entry.url, file, { sha1: entry.sha1 });
  return readJson(file);
}

function libraryDownloads(json) {
  const items = [];
  for (const lib of json.libraries || []) {
    if (!ruleAllows(lib.rules)) continue;
    const art = lib.downloads && lib.downloads.artifact;
    if (art) {
      const rel = art.path || mavenPath(lib.name);
      if (art.url) items.push({ url: art.url, file: path.join(LIB_DIR, rel), sha1: art.sha1, size: art.size, name: lib.name });
    } else if (lib.url !== undefined || !lib.downloads) {
      const base = (lib.url || 'https://libraries.minecraft.net/').replace(/\/?$/, '/');
      const rel = mavenPath(lib.name);
      items.push({ url: base + rel.split(path.sep).join('/'), file: path.join(LIB_DIR, rel), name: lib.name });
    }
  }
  return items;
}

async function assetDownloads(json) {
  const idx = json.assetIndex;
  const idxFile = path.join(ASSET_DIR, 'indexes', idx.id + '.json');
  await netu.downloadFile(idx.url, idxFile, { sha1: idx.sha1 }).catch(async (e) => {
    if (!fs.existsSync(idxFile)) throw e;
  });
  const data = readJson(idxFile);
  const seen = new Set();
  const items = [];
  for (const [, o] of Object.entries(data.objects)) {
    if (seen.has(o.hash)) continue;
    seen.add(o.hash);
    const sub = o.hash.slice(0, 2);
    items.push({ url: `https://resources.download.minecraft.net/${sub}/${o.hash}`, file: path.join(ASSET_DIR, 'objects', sub, o.hash), sha1: o.hash, size: o.size, name: 'asset' });
  }
  return items;
}

async function installVanilla(mcVersion, progress, { verify = false } = {}) {
  progress({ stage: 'mc', text: 'Получаю данные Minecraft ' + mcVersion });
  const json = await vanillaJson(mcVersion);
  const items = [];
  const client = json.downloads.client;
  items.push({ url: client.url, file: path.join(VER_DIR, mcVersion, mcVersion + '.jar'), sha1: client.sha1, size: client.size, name: 'client.jar' });
  items.push(...libraryDownloads(json));
  if (json.logging && json.logging.client) {
    const f = json.logging.client.file;
    items.push({ url: f.url, file: path.join(ASSET_DIR, 'log_configs', f.id), sha1: f.sha1, size: f.size, name: f.id });
  }
  items.push(...(await assetDownloads(json)));
  const threads = store.get().downloadThreads || 8;
  await netu.downloadAll(items, {
    threads: Math.max(threads, 16),
    quick: !verify,
    onProgress: (p) => progress({ stage: 'mc', text: `Minecraft ${mcVersion}: файлы ${p.files}/${p.filesTotal}`, bytes: p.bytes, total: p.total })
  });
  return json;
}

function neoId(neoVersion) { return 'neoforge-' + neoVersion; }

async function installNeoForge(mcVersion, neoVersion, progress) {
  const id = neoId(neoVersion);
  const jsonFile = path.join(VER_DIR, id, id + '.json');
  if (fs.existsSync(jsonFile)) {
    const j = readJson(jsonFile);
    const missing = libraryDownloads(j).filter((i) => !fs.existsSync(i.file));
    const generated = (j.libraries || []).filter((l) => l.downloads && l.downloads.artifact && !l.downloads.artifact.url)
      .some((l) => !fs.existsSync(path.join(LIB_DIR, l.downloads.artifact.path || mavenPath(l.name))));
    if (!generated) {
      if (missing.length) {
        await netu.downloadAll(missing, { threads: 8, onProgress: (p) => progress({ stage: 'neo', text: 'Библиотеки NeoForge', bytes: p.bytes, total: p.total }) });
      }
      return j;
    }
  }
  const javaPath = await java.resolveJava(21, progress);
  const installer = path.join(RT, 'installers', `neoforge-${neoVersion}-installer.jar`);
  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;
  progress({ stage: 'neo', text: 'Скачиваю NeoForge ' + neoVersion });
  if (!fs.existsSync(installer)) await netu.downloadFile(url, installer);
  // установщику нужен профиль лаунчера в папке
  const profiles = path.join(RT, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: crypto.randomUUID() }));
  progress({ stage: 'neo', text: 'Устанавливаю NeoForge (первый раз 1–3 минуты)…', indeterminate: true });
  const javaCli = javaPath.replace(/javaw\.exe$/i, 'java.exe');
  await new Promise((resolve, reject) => {
    const p = spawn(fs.existsSync(javaCli) ? javaCli : javaPath, ['-jar', installer, '--installClient', RT], { cwd: RT, windowsHide: true });
    let log = '';
    const onData = (d) => {
      const s = d.toString();
      log += s;
      if (log.length > 200000) log = log.slice(-100000);
      const line = s.trim().split(/\r?\n/).pop();
      if (line) progress({ stage: 'neo', text: 'NeoForge: ' + line.slice(0, 120), indeterminate: true });
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(jsonFile)) resolve();
      else {
        fs.writeFileSync(path.join(store.DATA_DIR, 'neoforge-install.log'), log);
        reject(new Error('Установщик NeoForge завершился с ошибкой (код ' + code + '). Лог: neoforge-install.log в папке лаунчера'));
      }
    });
  });
  return readJson(jsonFile);
}

async function ensureAuthlibInjector() {
  if (!fs.existsSync(AUTHLIB_INJECTOR.file)) await netu.downloadFile(AUTHLIB_INJECTOR.url, AUTHLIB_INJECTOR.file);
  return AUTHLIB_INJECTOR.file;
}

async function installAll({ mcVersion, neoVersion }, progress, opts = {}) {
  const vanilla = await installVanilla(mcVersion, progress, opts);
  const javaMajor = (vanilla.javaVersion && vanilla.javaVersion.majorVersion) || 21;
  progress({ stage: 'java', text: 'Проверяю Java ' + javaMajor });
  const javaPath = await java.resolveJava(javaMajor, progress);
  const neo = await installNeoForge(mcVersion, neoVersion, progress);
  return { vanilla, neo, javaPath };
}

function collectArgs(list, vars, features) {
  const out = [];
  for (const a of list || []) {
    if (typeof a === 'string') out.push(a);
    else if (ruleAllows(a.rules, features)) {
      if (Array.isArray(a.value)) out.push(...a.value); else out.push(a.value);
    }
  }
  return out.map((s) => s.replace(/\$\{([^}]+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)));
}

function buildLaunch({ vanilla, neo, javaPath, account, gameDir, quickPlay, quickPlayWorld, extraClasspath = [] }) {
  const s = store.get();
  const id = neo.id;
  const nativesDir = path.join(VER_DIR, id, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });
  // jar версии: как в официальном лаунчере — копия ванильного jar под именем версии
  const verJar = path.join(VER_DIR, id, id + '.jar');
  const vanillaJar = path.join(VER_DIR, vanilla.id, vanilla.id + '.jar');
  if (!fs.existsSync(verJar) || fs.statSync(verJar).size !== fs.statSync(vanillaJar).size) fs.copyFileSync(vanillaJar, verJar);

  const libs = new Map();
  for (const json of [vanilla, neo]) {
    for (const lib of json.libraries || []) {
      if (!ruleAllows(lib.rules)) continue;
      if (lib.downloadOnly) continue;
      const art = lib.downloads && lib.downloads.artifact;
      const rel = (art && art.path) || mavenPath(lib.name);
      libs.set(libKey(lib.name), path.join(LIB_DIR, rel));
    }
  }
  const classpath = [...libs.values(), ...extraClasspath, verJar].join(CP_SEP);
  const features = { has_custom_resolution: true, is_demo_user: false };
  const vars = {
    auth_player_name: account.name,
    version_name: id,
    game_directory: gameDir,
    assets_root: ASSET_DIR,
    assets_index_name: vanilla.assetIndex.id,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.accessToken || '0',
    clientid: account.clientToken || '0',
    auth_xuid: '0',
    user_type: account.type === 'ely' ? 'mojang' : 'legacy',
    version_type: 'VillagersLauncher',
    natives_directory: nativesDir,
    launcher_name: 'VillagersLauncher',
    launcher_version: require('electron').app.getVersion(),
    classpath,
    classpath_separator: CP_SEP,
    library_directory: LIB_DIR,
    resolution_width: s.width,
    resolution_height: s.height,
    user_properties: '{}'
  };
  const jvm = [];
  if (account.type === 'ely') jvm.push(`-javaagent:${AUTHLIB_INJECTOR.file}=ely.by`);
  jvm.push(`-Xms${s.memoryMinMb}M`, `-Xmx${s.memoryMaxMb}M`);
  jvm.push(...(s.jvmArgs || '').split(/\s+/).filter(Boolean));
  jvm.push('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8');
  // режим полного экрана для KokkHUD: «без рамки» (по умолчанию, быстрый Alt+Tab) или настоящий полноэкранный; F11 в игре — так же
  jvm.push('-Dkokkhud.windowMode=' + (s.windowMode === 'exclusive' ? 'fullscreen' : 'borderless'));
  if (vanilla.logging && vanilla.logging.client) {
    const lf = path.join(ASSET_DIR, 'log_configs', vanilla.logging.client.file.id);
    jvm.push(vanilla.logging.client.argument.replace('${path}', lf));
  }
  const vanillaJvm = vanilla.arguments ? vanilla.arguments.jvm : ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
  jvm.push(...collectArgs(vanillaJvm, vars, features));
  jvm.push(...collectArgs(neo.arguments && neo.arguments.jvm, vars, features));
  const game = [
    ...collectArgs(vanilla.arguments && vanilla.arguments.game, vars, features).filter((a) => !a.startsWith('--quickPlay') && !a.startsWith('${quickPlay')),
    ...collectArgs(neo.arguments && neo.arguments.game, vars, features)
  ];
  // убираем пары quickPlay с неподставленными значениями
  const cleanGame = [];
  for (let i = 0; i < game.length; i++) {
    if (/^\$\{/.test(game[i + 1] || '') && game[i].startsWith('--')) { i++; continue; }
    if (/^\$\{/.test(game[i])) continue;
    cleanGame.push(game[i]);
  }
  // полный экран включается через options.txt (см. splash.setFullscreenOption), не аргументом --fullscreen
  // сразу в одиночный мир (папка в saves) — для «Студии»; иначе — сразу на сервер
  if (quickPlayWorld) cleanGame.push('--quickPlaySingleplayer', quickPlayWorld);
  else if (quickPlay) cleanGame.push('--quickPlayMultiplayer', quickPlay);
  cleanGame.push(...(s.gameArgs || '').split(/\s+/).filter(Boolean));
  return { javaPath, args: [...jvm, neo.mainClass, ...cleanGame], cwd: gameDir };
}

module.exports = { installAll, installVanilla, installNeoForge, buildLaunch, ensureAuthlibInjector, ruleAllows, mavenPath, LIB_DIR, VER_DIR, ASSET_DIR };
