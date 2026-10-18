// VillagersLauncher — главный процесс.
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

protocol.registerSchemesAsPrivileged([{ scheme: 'vlimg', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }]);

const store = require('./store.cjs');
const mc = require('./minecraft.cjs');
const auth = require('./auth.cjs');
const pack = require('./pack.cjs');
const java = require('./java.cjs');
const extras = require('./extras.cjs');

let win = null;
let game = null; // { proc, started }
let busy = false;
let busyWhat = null; // publish | play | verify
function setBusy(what) { busy = !!what; busyWhat = what || null; send('busy-state', { busy, what: busyWhat }); }
const DEV = !!process.env.VITE_DEV;

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function progress(p) { send('progress', p); }

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 1080,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#120d0a',
    title: 'VillagersLauncher',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  // скрытое окно туннеля не держит лаунчер открытым
  win.on('closed', () => { if (!game && !server.running()) app.quit(); });
  if (DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('maximize', () => send('win-state', { maximized: true }));
  win.on('unmaximize', () => send('win-state', { maximized: false }));
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

app.whenReady().then(() => {
  protocol.handle('vlimg', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const base = path.join(store.get().gameDir, u.hostname);
    const abs = path.normalize(path.join(base, rel));
    if (!abs.startsWith(path.normalize(base))) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(abs).toString());
  });
  createWindow();
  setupUpdater();
});

app.on('window-all-closed', () => { if (!game && !server.running()) app.quit(); });

// ---------------- обёртка IPC ----------------
function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      console.error(ch, e);
      return { ok: false, error: e.message || String(e), relogin: !!e.relogin, needTotp: !!e.needTotp };
    }
  });
}

// окно
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win && win.close());

handle('sys:info', () => ({
  version: app.getVersion(),
  totalMb: store.totalMb,
  dataDir: store.DATA_DIR,
  platform: process.platform,
  defaults: store.DEFAULTS
}));
handle('settings:get', () => store.get());
handle('settings:set', (patch) => store.set(patch || {}));

// аккаунты
handle('accounts:list', () => ({ accounts: auth.publicAccounts(), selected: store.get().selectedAccount }));
handle('accounts:loginEly', ({ login, password, totp }) => auth.loginEly(login, password, totp));
handle('accounts:loginElyBrowser', async () => {
  const acc = await auth.loginElyBrowser((url) => shell.openExternal(url));
  if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  return acc;
});
handle('accounts:cancelBrowser', () => auth.cancelBrowserLogin());
handle('accounts:browserReady', () => auth.browserLoginReady());
handle('accounts:addOffline', (name) => auth.addOffline(name));
handle('accounts:remove', (id) => auth.remove(id));
handle('accounts:select', (id) => auth.select(id));

// скины
handle('skin:ely', (name) => auth.elySkin(name));
handle('skin:elyCape', (name) => auth.elyCape(name));
handle('skin:current', () => extras.currentSkin(store.get().gameDir));
handle('skin:apply', (data) => extras.applySkin(store.get().gameDir, data));
handle('skin:clear', () => extras.clearSkin(store.get().gameDir));
handle('wardrobe:list', () => extras.listWardrobe(store.get().gameDir));
handle('wardrobe:save', (data) => extras.saveToWardrobe(store.get().gameDir, data));
handle('wardrobe:remove', (id) => extras.removeFromWardrobe(store.get().gameDir, id));
handle('editor:list', (kind) => extras.editorList(kind));
handle('editor:save', (kind, id, data) => extras.editorSave(kind, id, data));
handle('editor:remove', (kind, id) => extras.editorRemove(kind, id));
handle('ely:open', (url) => {
  const w = new BrowserWindow({
    width: 1200, height: 820, parent: win, title: 'Ely.by', backgroundColor: '#1b1b1b', autoHideMenuBar: true,
    webPreferences: { partition: 'persist:ely', contextIsolation: true, sandbox: true }
  });
  w.loadURL(url && /^https:\/\/([a-z0-9-]+\.)?ely\.by\//.test(url) ? url : 'https://ely.by/skins');
  w.webContents.setWindowOpenHandler(({ url: u }) => { w.loadURL(u); return { action: 'deny' }; });
  return new Promise((resolve) => w.on('closed', () => resolve(true)));
});

// сборка
handle('pack:info', async () => {
  const s = store.get();
  const state = pack.readState(s.gameDir);
  let latest = null;
  let error = null;
  try { latest = await pack.latestManifest(); } catch (e) { error = e.message; }
  return {
    state,
    latest: latest ? { version: latest.version, tag: latest.tag, date: latest.date, changelog: latest.changelog, minecraft: latest.minecraft, loader: latest.loader, files: latest.files.length, size: latest.files.reduce((a, f) => a + f.size, 0), servers: latest.servers || [], optional: latest.files.filter((f) => f.optional).map((f) => f.path) } : null,
    authorHome: pack.isAuthorHome(s.gameDir),
    error
  };
});
handle('pack:releases', () => pack.listReleases());
handle('pack:changes', async () => {
  try { return await pack.localChanges((p) => send('scan-progress', p)); } finally { send('scan-progress', null); }
});
handle('pack:publish', async (data) => {
  if (busy) throw new Error(busyWhat === 'play' ? 'Игра запускается — подожди' : 'Лаунчер уже чем-то занят');
  if (game) throw new Error('Сначала закрой игру: пока она открыта, файлы сборки заняты');
  setBusy('publish');
  try { return await pack.publish(data, progress); } finally { setBusy(null); progress(null); }
});
handle('pack:makeLatest', (id) => pack.makeLatest(id));
handle('pack:setToken', async (token) => {
  if (!token) { store.setSecret('githubToken', null); return { ok: true }; }
  const r = await pack.checkToken(token);
  store.setSecret('githubToken', token);
  return r;
});
handle('pack:hasToken', () => !!store.getSecret('githubToken'));

// java
handle('java:detect', () => java.detect());
handle('java:probe', (p) => java.probe(p));
handle('java:install', async (major) => {
  try { return await java.installJava(major || 21, progress); } finally { progress(null); }
});

// моды
handle('mods:list', () => extras.listMods(store.get().gameDir));
handle('mods:toggle', ({ path: rel, enabled }) => {
  const gameDir = store.get().gameDir;
  const abs = path.join(gameDir, rel);
  if (!abs.startsWith(path.join(gameDir, 'mods'))) throw new Error('bad path');
  if (enabled && fs.existsSync(abs + '.disabled')) fs.renameSync(abs + '.disabled', abs);
  if (!enabled && fs.existsSync(abs)) fs.renameSync(abs, abs + '.disabled');
  const set = new Set(store.get().disabledOptional || []);
  if (enabled) set.delete(rel); else set.add(rel);
  store.set({ disabledOptional: [...set] });
  return true;
});

// миры и скриншоты
handle('worlds:list', () => extras.listWorlds(store.get().gameDir));
handle('worlds:backup', (name) => extras.backupWorld(store.get().gameDir, name));
handle('worlds:backups', () => extras.listBackups(store.get().gameDir));
handle('worlds:restore', (file) => extras.restoreBackup(store.get().gameDir, file));
handle('shots:list', () => extras.listScreenshots(store.get().gameDir));
handle('shots:delete', (file) => {
  const abs = path.join(store.get().gameDir, 'screenshots', path.basename(file));
  return shell.trashItem(abs);
});
handle('shots:copy', (file) => {
  const { clipboard, nativeImage } = require('electron');
  clipboard.writeImage(nativeImage.createFromPath(path.join(store.get().gameDir, 'screenshots', path.basename(file))));
  return true;
});
handle('servers:ping', (address) => extras.pingServer(address));

// оболочка
handle('shell:open', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
handle('shell:openPath', (sub) => {
  const base = sub === '@data' ? store.DATA_DIR : path.join(store.get().gameDir, sub || '');
  fs.mkdirSync(base, { recursive: true });
  return shell.openPath(base);
});
handle('dialog:pickFolder', async (def) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: def });
  return r.canceled ? null : r.filePaths[0];
});
handle('dialog:pickJava', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
handle('dialog:openPng', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (r.canceled) return null;
  return 'data:image/png;base64,' + fs.readFileSync(r.filePaths[0]).toString('base64');
});
handle('dialog:savePng', async ({ dataUrl, name }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'skin') + '.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return r.filePath;
});

// ---------------- игра с друзьями: свой туннель ----------------
let tunnelWin = null;
let tunnelReady = null;
let tunnelState = { active: false };
function tunnel() {
  if (tunnelWin && !tunnelWin.isDestroyed()) return tunnelReady;
  tunnelWin = new BrowserWindow({
    show: false, width: 400, height: 300, skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false }
  });
  tunnelReady = new Promise((resolve) => ipcMain.once('tunnel-ready', () => resolve(tunnelWin)));
  tunnelWin.loadFile(path.join(__dirname, 'tunnel', 'worker.html'));
  tunnelWin.on('closed', () => { tunnelWin = null; tunnelState = { active: false }; send('tunnel-state', tunnelState); });
  return tunnelReady;
}
ipcMain.on('tunnel-state', (e, st) => { if (tunnelWin && e.sender === tunnelWin.webContents) { tunnelState = st; send('tunnel-state', st); } });
function tunnelOpts(data) {
  const s = store.get();
  const acc = auth.publicAccounts().find((a) => a.id === s.selectedAccount);
  const ice = [{ urls: s.stunServers || [] }, ...((s.turnServers || []).filter((t) => t && t.urls))];
  return {
    name: String(data.name || '').trim(), password: String(data.password || ''), mode: data.mode === 'server' ? 'server' : 'world',
    nick: acc ? acc.name : 'Игрок', brokers: s.tunnelBrokers, iceServers: ice, gameDir: s.gameDir,
    serverPort: s.serverPort || 25565, localPort: s.tunnelLocalPort || 25565
  };
}
async function tunnelCmd(cmd, opts) { const w = await tunnel(); w.webContents.send('tunnel-cmd', { cmd, opts }); return true; }
handle('net:state', () => tunnelState);
// сохранённые комнаты: выключить — комната остаётся в списке; удалить — пропадает (пароль хранится зашифрованным)
function roomKey(role, name) { return role + ':' + String(name).trim().toLowerCase(); }
function saveRoom(role, o) {
  const id = roomKey(role, o.name);
  store.setSecret('room:' + id, o.password);
  const rooms = (store.get().rooms || []).filter((r) => r.id !== id);
  rooms.unshift({ id, role, name: o.name, mode: o.mode, lastUsed: Date.now() });
  store.set({ rooms, roomName: o.name, activeRoom: id });
}
handle('net:host', (data) => {
  const o = tunnelOpts(data);
  if (o.name.length < 3) throw new Error('Имя комнаты — хотя бы 3 символа');
  if (o.password.length < 4) throw new Error('Пароль — хотя бы 4 символа');
  saveRoom('host', o);
  return tunnelCmd('host', o);
});
handle('net:join', (data) => {
  const o = tunnelOpts(data);
  if (!o.name || !o.password) throw new Error('Введи имя комнаты и пароль');
  saveRoom('guest', o);
  return tunnelCmd('join', o);
});
handle('net:rooms', () => ({ rooms: store.get().rooms || [], active: tunnelState.active ? store.get().activeRoom : null }));
handle('net:start', (id) => {
  const r = (store.get().rooms || []).find((x) => x.id === id);
  if (!r) throw new Error('Комната не найдена');
  const password = store.getSecret('room:' + id);
  if (!password) throw new Error('Пароль комнаты потерялся — удали её и создай заново');
  const o = tunnelOpts({ name: r.name, password, mode: r.mode });
  saveRoom(r.role, o);
  return tunnelCmd(r.role === 'host' ? 'host' : 'join', o);
});
handle('net:removeRoom', async (id) => {
  if (store.get().activeRoom === id && tunnelState.active && tunnelWin) await tunnelCmd('leave');
  store.setSecret('room:' + id, null);
  store.set({ rooms: (store.get().rooms || []).filter((r) => r.id !== id), activeRoom: store.get().activeRoom === id ? null : store.get().activeRoom });
  return true;
});
handle('net:leave', () => { store.set({ activeRoom: null }); return tunnelWin ? tunnelCmd('leave') : true; });

// ---------------- сервер сборки ----------------
const server = require('./server.cjs');
server.init((ch, data) => send(ch, data));
async function packVersions() {
  const s = store.get();
  let manifest = null;
  try { manifest = s.pinnedPackVersion ? await pack.manifestByTag(s.pinnedPackVersion) : await pack.latestManifest(); } catch (_) {}
  return {
    mcVersion: (manifest && manifest.minecraft) || s.minecraftVersion,
    neoVersion: (manifest && manifest.loader && manifest.loader.version) || s.neoforgeVersion
  };
}
handle('server:status', () => server.status());
handle('server:start', async () => {
  try { return await server.start(await packVersions(), progress); } finally { progress(null); }
});
handle('server:stop', () => server.stop());
handle('server:command', (text) => server.command(text));
handle('server:openDir', () => { fs.mkdirSync(server.dir(), { recursive: true }); shell.openPath(server.dir()); return true; });
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  if (server.running() || tunnelWin) {
    e.preventDefault();
    quitting = true;
    Promise.all([server.stop(), tunnelWin ? tunnelCmd('leave').then(() => new Promise((r) => setTimeout(r, 700))) : null])
      .finally(() => { if (tunnelWin && !tunnelWin.isDestroyed()) tunnelWin.destroy(); app.quit(); });
  }
});

// ---------------- запуск игры ----------------
handle('game:status', () => ({ running: !!game, busy, what: busyWhat }));

async function prepareGame({ verify = false } = {}) {
  const s = store.get();
  const gameDir = s.gameDir;
  fs.mkdirSync(gameDir, { recursive: true });
  let manifest = null;
  if (!pack.isAuthorHome(gameDir)) {
    progress({ stage: 'pack', text: 'Проверяю обновления сборки…', indeterminate: true });
    try {
      manifest = s.pinnedPackVersion ? await pack.manifestByTag(s.pinnedPackVersion) : await pack.latestManifest();
    } catch (e) {
      const st = pack.readState(gameDir);
      if (!st.version) throw new Error('Нет связи с GitHub, а сборка ещё не скачана: ' + e.message);
      progress({ stage: 'pack', text: 'Нет связи, запускаю то, что уже скачано', indeterminate: true });
    }
  }
  const versions = {
    mcVersion: (manifest && manifest.minecraft) || s.minecraftVersion,
    neoVersion: (manifest && manifest.loader && manifest.loader.version) || s.neoforgeVersion
  };
  const installed = await mc.installAll(versions, progress, { verify });
  if (manifest && (s.autoUpdatePack || verify || !pack.readState(gameDir).version)) {
    await pack.sync(manifest, gameDir, progress, { verify });
  }
  return { installed, gameDir };
}

handle('game:verify', async () => {
  if (game) throw new Error('Сначала закрой игру');
  if (busy) throw new Error(busyWhat === 'publish' ? 'Идёт заливка сборки — подожди, пока она закончится' : 'Лаунчер ещё занят');
  setBusy('verify');
  try {
    await prepareGame({ verify: true });
    return true;
  } finally { setBusy(null); progress(null); }
});

handle('game:play', async (opts = {}) => {
  if (game) throw new Error('Игра уже запущена');
  if (busy) throw new Error(busyWhat === 'publish' ? 'Идёт заливка сборки — играть можно будет, когда она закончится' : 'Лаунчер ещё занят');
  setBusy('play');
  send('game-state', { state: 'preparing' });
  try {
    const s = store.get();
    const account = await auth.prepare(s.selectedAccount);
    const { installed, gameDir } = await prepareGame();
    if (account.type === 'ely') {
      progress({ stage: 'auth', text: 'Подключаю Ely.by', indeterminate: true });
      await mc.ensureAuthlibInjector();
    }
    fs.mkdirSync(path.join(gameDir, 'skinkokk'), { recursive: true });
    const launch = mc.buildLaunch({ ...installed, account, gameDir, quickPlay: opts.quickPlay });
    progress({ stage: 'launch', text: 'Запускаю Minecraft…', indeterminate: true });
    const proc = spawn(launch.javaPath, launch.args, { cwd: launch.cwd, windowsHide: false, detached: false });
    game = { proc, started: Date.now() };
    let tail = [];
    let shown = false;
    const onLine = (d) => {
      const lines = d.toString('utf8').split(/\r?\n/).filter(Boolean);
      tail.push(...lines);
      if (tail.length > 400) tail = tail.slice(-400);
      send('game-log', lines);
      if (!shown && lines.some((l) => /Backend library: LWJGL|Setting user:|Loading \d+ mods/i.test(l))) {
        shown = true;
        send('game-state', { state: 'running' });
        const act = store.get().afterLaunch;
        if (act === 'minimize') win && win.minimize();
        else if (act === 'hide') win && win.hide();
        else if (act === 'close') setTimeout(() => win && win.close(), 1500);
      }
    };
    proc.stdout.on('data', onLine);
    proc.stderr.on('data', onLine);
    proc.on('error', (e) => send('game-log', ['[launcher] ' + e.message]));
    proc.on('close', (code) => {
      const played = Date.now() - game.started;
      game = null;
      const s2 = store.get();
      store.set({ playTimeMs: (s2.playTimeMs || 0) + played, lastPlayed: Date.now() });
      if (win && !win.isDestroyed()) { win.show(); win.restore(); }
      send('game-state', { state: 'stopped', code, crashed: code !== 0 && code !== null && played < 24 * 3600e3 && code !== 130, tail: tail.slice(-80) });
      if (!win || win.isDestroyed()) app.quit();
    });
    send('game-state', { state: 'starting' });
    return true;
  } catch (e) {
    send('game-state', { state: 'idle' });
    throw e;
  } finally {
    setBusy(null);
    progress(null);
  }
});

handle('game:kill', () => { if (game) game.proc.kill(); return true; });

// ---------------- автообновление лаунчера ----------------
// На Mac лаунчер без подписи Apple — сам себя заменить не может; говорим о новой версии и даём ссылку.
function newer(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
function macUpdateCheck() {
  const check = async () => {
    try {
      const rel = await require('./net.cjs').getJson('https://api.github.com/repos/kokkas56/VillagersLauncher/releases/latest');
      const v = String(rel.tag_name || '').replace(/^v/, '');
      if (v && newer(v, app.getVersion())) {
        const asset = (rel.assets || []).find((a) => a.name === `VillagersLauncher-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`);
        send('update-state', { state: 'manual', version: v, url: asset ? asset.browser_download_url : rel.html_url });
      }
    } catch (_) {}
  };
  setTimeout(check, 5000);
  setInterval(check, 3 * 3600e3);
}
function setupUpdater() {
  if (DEV || !app.isPackaged) return;
  if (process.platform === 'darwin') { macUpdateCheck(); return; }
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => send('update-state', { state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', (p) => send('update-state', { state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => send('update-state', { state: 'ready', version: i.version }));
  autoUpdater.on('error', () => {});
  handle('app:installUpdate', () => { autoUpdater.quitAndInstall(); });
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 3600e3);
}
