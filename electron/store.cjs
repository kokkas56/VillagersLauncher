// Настройки лаунчера и защищённое хранилище токенов.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, safeStorage } = require('electron');

const DATA_DIR = path.join(app.getPath('appData'), 'VillagersLauncher');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
fs.mkdirSync(DATA_DIR, { recursive: true });

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.bin');

const totalMb = Math.floor(os.totalmem() / 1024 / 1024);

const DEFAULTS = {
  language: 'ru',
  gameDir: process.platform === 'win32' ? 'C:\\Games\\MineVillagers' : path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Application Support/MineVillagers' : '.minevillagers'),
  memoryMaxMb: Math.min(8192, Math.max(3072, Math.floor(totalMb * 0.5 / 512) * 512)),
  memoryMinMb: 1024,
  width: 1600,
  height: 900,
  fullscreen: false,
  javaMode: 'auto', // auto | custom
  javaPath: '',
  jvmArgs: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
  gameArgs: '',
  afterLaunch: 'minimize', // minimize | hide | keep | close
  showConsole: false,
  autoUpdatePack: true,
  pinnedPackVersion: null, // null = всегда последняя
  disabledOptional: [],
  downloadThreads: 8,
  // Публичный репозиторий сборки (откуда качают все)
  packRepo: 'kokkas56/MineVillagers-pack',
  // Режим автора
  authorMode: false,
  authorSourceDir: 'C:\\Games\\MINEVILLAGERS',
  syncDirs: ['mods', 'config', 'defaultconfigs', 'resourcepacks', 'shaderpacks', 'kubejs'],
  strictDirs: ['mods'],
  ignore: [
    'desktop.ini', 'Thumbs.db', '*.bak', '*.tmp', '*.log', '*.backup[0-9]',
    'config/sodium-fingerprint.json', 'shaderpacks/*.txt',
    '*launcher_profiles*.json', '*launcher_accounts*.json', '*tlauncher*profiles*.json', '*tlauncher*accounts*.json',
    'usercache.json', 'usernamecache.json', 'config/ias.json', 'config/ias/**', 'config/accountswitcher/**',
    'config/fzzy_config/keybinds.toml',
    'config/sodium-options.json', 'config/embeddium-options.json', 'config/embeddium++.toml', 'config/rubidium-options.json',
    'config/betterfpsdist.json', 'config/DistantHorizons.toml', 'config/bobby.toml', 'config/iris.properties', 'config/oculus.properties',
    'config/fancymenu/user_variables.db', 'config/voicechat/username-cache.json', 'config/sounds/chat.json', 'config/fml.toml',
    'kubejs/fenix_dump/**', 'kubejs/exported/**', 'kubejs/fenix_night_spawn_status.json',
    'config/skinkokk-client.toml', 'server/**'
  ],
  // Версии игры, которые ставятся, пока сборка не опубликована
  minecraftVersion: '1.21.1',
  neoforgeVersion: '21.1.250',
  servers: [],
  selectedAccount: null,
  accounts: [], // {id, type: 'ely'|'offline', name, uuid}
  theme: 'auto', // auto | day | night | evening
  animations: true,
  sounds: true,
  // Игра с друзьями: свой туннель (комната = имя + пароль)
  roomName: '',
  rooms: [], // сохранённые комнаты {id, role: host|guest, name, mode}
  activeRoom: null,
  tunnelBrokers: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'],
  stunServers: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478', 'stun:stun1.l.google.com:19302'],
  turnServers: [], // {urls, username, credential} — если напрямую не соединяется
  tunnelLocalPort: 25565,
  // Сервер сборки в лаунчере
  serverPort: 25565,
  serverMemoryMb: 4096,
  serverMaxPlayers: 10,
  serverMotd: 'MineVillagers — сервер сборки',
  serverEulaAccepted: false,
  serverExcludeMods: ['sodium', 'iris', 'oculus', 'embeddium', 'rubidium', 'sounds-', 'entityculling', 'immediatelyfast', 'betterfpsdist',
    'notenoughanimations', 'fancymenu', 'drippyloadingscreen', 'konkrete', 'entity_model_features', 'entity_texture_features', 'continuity',
    'dynamic-fps', 'dynamicfps', 'skinlayers3d', 'kokkhud', 'floatingdamagenumbers', 'emi_loot', 'emi_ores']
};

let settings = { ...DEFAULTS };
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } else if (fs.existsSync('C:\\Games\\MINEVILLAGERS\\Исходники')) {
    // Компьютер автора: игра и исходники модов уже лежат здесь
    settings.gameDir = 'C:\\Games\\MINEVILLAGERS';
    settings.authorMode = true;
  }
} catch (e) {
  console.error('settings read failed', e);
}

function save() {
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, SETTINGS_FILE);
}

function get() { return settings; }
function set(patch) {
  settings = { ...settings, ...patch };
  save();
  return settings;
}

// --- секреты (токены Ely.by, GitHub) ---
function readSecrets() {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return {};
    const buf = fs.readFileSync(SECRETS_FILE);
    const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('secrets read failed', e);
    return {};
  }
}
function writeSecrets(obj) {
  const txt = JSON.stringify(obj);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf8');
  fs.writeFileSync(SECRETS_FILE, buf);
}
function getSecret(key) { return readSecrets()[key]; }
function setSecret(key, value) {
  const s = readSecrets();
  if (value === undefined || value === null) delete s[key]; else s[key] = value;
  writeSecrets(s);
}

module.exports = { DATA_DIR, RUNTIME_DIR, DEFAULTS, get, set, save, getSecret, setSecret, totalMb };
