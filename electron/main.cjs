// VillagersLauncher — главный процесс.
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, Menu, Tray, nativeImage: NI, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

protocol.registerSchemesAsPrivileged([{ scheme: 'vlimg', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }]);

const store = require('./store.cjs');
const mc = require('./minecraft.cjs');
const splash = require('./splash.cjs');
const auth = require('./auth.cjs');
const pack = require('./pack.cjs');
const early = require('./early.cjs');
const java = require('./java.cjs');
const extras = require('./extras.cjs');

let win = null;
let quitting = false;
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
  // пока работает свой сервер, крестик сворачивает лаунчер в трей (сервер живёт, пока не выключишь его или компьютер)
  win.on('close', (e) => {
    if (!quitting && server.running()) {
      e.preventDefault();
      win.hide();
      ensureTray();
      if (!trayHinted && tray) { trayHinted = true; try { tray.displayBalloon && tray.displayBalloon({ title: 'Сервер работает', content: 'Лаунчер свернулся в трей. Выйти — правой кнопкой по значку.' }); } catch (_) {} }
    }
  });
  win.on('session-end', () => { server.stop(); }); // Windows выключается — сохраняем мир
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
  if (store.get().relayHelp) tunnel(); // ретранслятор включится, как только окно туннеля будет готово
  // автор: ранние выпуски, чья дата наступила, открываются для всех сами
  setTimeout(async () => {
    if (busy) return;
    try {
      setBusy('publish');
      const opened = await pack.openDue(progress);
      if (opened.length) send('toast', { text: 'Открыты для всех: ' + opened.join(', '), kind: 'ok' });
    } catch (e) { console.error('openDue', e); } finally { setBusy(null); progress(null); }
  }, 20000);
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
handle('settings:set', (patch) => {
  const before = store.get();
  const after = store.set(patch || {});
  // ретранслятор перезапускается при смене своих настроек (и сетевых, которыми пользуется)
  if (RELAY_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])) && (before.relayHelp || after.relayHelp)) relaySync().catch(() => {});
  return after;
});

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
  try { latest = await pack.chosenManifest(); } catch (e) { error = e.message; }
  let earlyState = null;
  try { earlyState = await early.status(); } catch (_) {}
  if (latest) { try { latest.changelog = pack.applyNews(latest.changelog, await pack.readNews()); } catch (_) {} }
  return {
    state,
    latest: latest ? { version: latest.version, tag: latest.tag, date: latest.date, changelog: latest.changelog, minecraft: latest.minecraft, loader: latest.loader, files: latest.files.length, size: latest.files.reduce((a, f) => a + f.size, 0), servers: latest.servers || [], optional: latest.files.filter((f) => f.optional).map((f) => f.path) } : null,
    authorHome: pack.isAuthorHome(s.gameDir),
    dir: dirStatus(),
    early: earlyState,
    latestEarly: !!(latest && latest.early),
    error
  };
});
// ранний доступ (зашифрованные выпуски на GitHub, коды)
handle('early:status', async () => { early.reset(); return early.status(); });
handle('early:releases', () => early.releases());
handle('early:config', () => early.config(true));
handle('early:setConfig', (patch) => early.setConfig(patch));
handle('early:redeem', (code) => early.redeem(code));
handle('early:author', async () => {
  const m = early.masterNow();
  return { hasMaster: !!m, masterId: m ? m.id : null, masters: early.masters().map((x) => ({ id: x.id, created: x.created })) };
});
handle('early:newMaster', () => early.newMaster());
handle('early:importMaster', (code) => early.importMaster(code));
handle('early:friendCode', () => early.friendCode());
handle('early:monthCode', (ym) => early.monthCode(ym));
handle('early:versionCode', (tag) => early.versionCode(tag));
handle('early:authorReleases', () => pack.authorEarlyReleases());
handle('early:open', async (tag) => {
  if (busy) throw new Error('Лаунчер сейчас занят — подожди');
  setBusy('publish');
  try { return await pack.openEarly(tag, progress); } finally { setBusy(null); progress(null); }
});
handle('early:freeAt', ({ tag, freeAt }) => pack.setEarlyFreeAt(tag, freeAt));
handle('early:delete', (tag) => pack.deleteEarly(tag));
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
handle('pack:news', () => pack.authorNews());
handle('pack:setNews', (d) => pack.setNews(d));
handle('pack:makeLatest', (id) => pack.makeLatest(id));
handle('pack:deleteRelease', (id) => pack.deleteRelease(id));
handle('pack:hideRelease', ({ id, hidden }) => pack.hideRelease(id, hidden));
handle('pack:renameRelease', ({ id, name, body }) => pack.renameRelease(id, name, body));
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

// ---------------- мини-игры: общая таблица рекордов ----------------
let scoresWin = null;
let scoresReady = null;
let scoresBoard = {};
function scoresWorker() {
  if (scoresWin && !scoresWin.isDestroyed()) return scoresReady;
  scoresWin = new BrowserWindow({ show: false, width: 200, height: 100, skipTaskbar: true, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
  scoresReady = new Promise((resolve) => ipcMain.once('scores-ready', () => resolve(scoresWin)));
  scoresWin.loadFile(path.join(__dirname, 'scores', 'worker.html'));
  scoresWin.on('closed', () => { scoresWin = null; });
  scoresReady.then((w) => w.webContents.send('scores-cmd', { cmd: 'start', opts: { brokers: store.get().tunnelBrokers } }));
  return scoresReady;
}
ipcMain.on('scores-board', (e, b) => { if (scoresWin && e.sender === scoresWin.webContents) { scoresBoard = b || {}; send('scores', scoresBoard); } });
handle('games:board', async () => { scoresWorker(); return scoresBoard; });
async function submitBoard(game, score) {
  const s = store.get();
  const acc = currentAcc();
  if (!(score > 0) || s.gameShareScores === false || !acc) return;
  const p = profile();
  const w = await scoresWorker();
  w.webContents.send('scores-cmd', { cmd: 'submit', opts: { game, score, nick: acc.name, badge: p.equip.badge || null, title: p.equip.title || null } });
}
// мастерство: опыт копится навсегда, уровень видно у ника и в таблице мастеров
const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 120));
handle('games:xp', async ({ game, amount }) => {
  const add = Math.max(0, Math.min(5000, Number(amount) || 0));
  if (!add) return null;
  const p = profile();
  const before = levelOf(p.mastery[game] || 0);
  p.mastery[game] = Math.round((p.mastery[game] || 0) + add);
  const after = levelOf(p.mastery[game]);
  setProfile(p);
  if (after > before) submitBoard('ms_' + game, after).catch(() => {});
  return { xp: p.mastery[game], level: after, up: after > before };
});
handle('games:submit', async ({ game, score, week }) => {
  if (week) { const prev = (store.get().weekBest || {}); if (!(prev[week] >= score)) { store.set({ weekBest: { [week]: score } }); submitBoard('wk_' + week, score).catch(() => {}); } }
  const s = store.get();
  const best = { ...(s.gameBest || {}) };
  const isBest = !(best[game] >= score);
  if (isBest) { best[game] = score; store.set({ gameBest: best }); }
  const acc = currentAcc();
  if (isBest && score > 0 && s.gameShareScores !== false && acc) {
    const p = profile();
    const w = await scoresWorker();
    w.webContents.send('scores-cmd', { cmd: 'submit', opts: { game, score, nick: acc.name, badge: p.equip.badge || null, title: p.equip.title || null } });
  }
  return { best: best[game] || 0, isBest };
});

// ---------------- мини-игры: прогресс и награды (привязаны к нику, синхронизируются через брокер) ----------------
function currentAcc() { const s = store.get(); return auth.publicAccounts().find((a) => a.id === s.selectedAccount) || null; }
function nickKey() { const a = currentAcc(); return a ? String(a.name).toLowerCase() : '_local'; }
function profile() {
  const all = store.get().gameProfiles || {};
  const p = all[nickKey()] || {};
  return { games: p.games || {}, rewards: p.rewards || {}, equip: p.equip || {}, equipT: p.equipT || 0, mastery: p.mastery || {} };
}
function setProfile(p) {
  const all = { ...(store.get().gameProfiles || {}) };
  all[nickKey()] = p;
  store.set({ gameProfiles: all });
  send('profile', p);
  syncProfile();
}
let syncTimer = null;
function syncProfile() {
  const acc = currentAcc();
  if (!acc) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const p = profile();
    const w = await scoresWorker();
    w.webContents.send('scores-cmd', { cmd: 'saveProgress', opts: { nick: acc.name, doc: { v: 1, t: Date.now(), ...p } } });
  }, 4000);
}
let watchedNick = null;
async function watchProfile() {
  const acc = currentAcc();
  if (!acc || watchedNick === acc.name.toLowerCase()) return;
  watchedNick = acc.name.toLowerCase();
  const w = await scoresWorker();
  w.webContents.send('scores-cmd', { cmd: 'watch', opts: { nick: acc.name } });
}
ipcMain.on('progress-remote', (e, { key, doc }) => {
  if (!scoresWin || e.sender !== scoresWin.webContents || !doc || typeof doc !== 'object') return;
  const acc = currentAcc();
  if (!acc || key !== String(acc.name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24)) return;
  const p = profile();
  let changed = false; let localNewer = false;
  for (const [g, v] of Object.entries(doc.games || {})) {
    if (!v || typeof v !== 'object' || typeof v.t !== 'number') continue;
    if (!p.games[g] || v.t > p.games[g].t) { p.games[g] = v; changed = true; }
  }
  for (const [g, v] of Object.entries(p.games)) if (!doc.games || !doc.games[g] || doc.games[g].t < v.t) localNewer = true;
  for (const [id, t] of Object.entries(doc.rewards || {})) if (!p.rewards[id]) { p.rewards[id] = t; changed = true; }
  for (const id of Object.keys(p.rewards)) if (!doc.rewards || !doc.rewards[id]) localNewer = true;
  for (const [g, x] of Object.entries(doc.mastery || {})) { const v = Number(x) || 0; if (v > (p.mastery[g] || 0)) { p.mastery[g] = v; changed = true; } }
  for (const [g, x] of Object.entries(p.mastery)) if (x > ((doc.mastery || {})[g] || 0)) localNewer = true;
  if ((doc.equipT || 0) > p.equipT && doc.equip) { p.equip = doc.equip; p.equipT = doc.equipT; changed = true; }
  else if (p.equipT > (doc.equipT || 0)) localNewer = true;
  if (changed) { const all = { ...(store.get().gameProfiles || {}) }; all[nickKey()] = p; store.set({ gameProfiles: all }); send('profile', p); }
  if (localNewer) syncProfile();
});
handle('games:profile', async () => { watchProfile().catch(() => {}); return profile(); });
handle('games:save', async ({ game, data }) => {
  const p = profile();
  p.games[game] = { t: Date.now(), d: data };
  setProfile(p);
  return true;
});
handle('games:reward', async (id) => {
  const p = profile();
  if (p.rewards[id]) return false;
  p.rewards[id] = Date.now();
  setProfile(p);
  return true;
});
handle('games:equip', async ({ kind, value, cape }) => {
  const p = profile();
  p.equip = { ...p.equip, [kind]: value || null };
  p.equipT = Date.now();
  if (kind === 'cape') extras.applyCape(store.get().gameDir, value ? cape : null);
  setProfile(p);
  return p;
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
  // ретранслятор для друзей живёт в том же окне — включаем его сразу, как окно готово (и после пересоздания окна)
  tunnelReady.then((w) => { const o = relayOpts(); if (o.on && w && !w.isDestroyed()) w.webContents.send('tunnel-cmd', { cmd: 'relay', opts: o }); });
  tunnelWin.loadFile(path.join(__dirname, 'tunnel', 'worker.html'));
  tunnelWin.on('closed', () => { tunnelWin = null; tunnelState = { active: false }; send('tunnel-state', tunnelState); });
  return tunnelReady;
}
ipcMain.on('tunnel-state', (e, st) => { if (tunnelWin && e.sender === tunnelWin.webContents) { tunnelState = st; send('tunnel-state', st); } });
function iceServers(s) {
  const stun = [...new Set([...(s.stunServers || []), ...store.DEFAULTS.stunServers])]; // новые серверы из обновлений лаунчера тоже
  return [{ urls: stun }, ...((s.turnServers || []).filter((t) => t && t.urls))];
}
function tunnelOpts(data) {
  const s = store.get();
  const acc = auth.publicAccounts().find((a) => a.id === s.selectedAccount);
  const ice = iceServers(s);
  return {
    name: String(data.name || '').trim(), password: String(data.password || ''), mode: data.mode === 'server' ? 'server' : 'world',
    nick: acc ? acc.name : 'Игрок', brokers: s.tunnelBrokers, iceServers: ice, gameDir: s.gameDir,
    serverPort: s.serverPort || 25565, localPort: s.tunnelLocalPort || 25565
  };
}
async function tunnelCmd(cmd, opts) { const w = await tunnel(); w.webContents.send('tunnel-cmd', { cmd, opts }); return true; }
// «Помогать друзьям соединяться»: этот лаунчер — ретранслятор для чужих пар, которые не пробились напрямую.
// Работает и без своей комнаты; трафик зашифрован, ретранслятор не знает ни комнат, ни паролей.
function relayOpts() {
  const s = store.get();
  return { on: !!s.relayHelp, brokers: s.tunnelBrokers, iceServers: iceServers(s), maxKbps: Math.max(64, Number(s.relayMaxKbps) || 4000) };
}
const RELAY_KEYS = ['relayHelp', 'relayMaxKbps', 'tunnelBrokers', 'stunServers', 'turnServers'];
function relaySync() {
  const o = relayOpts();
  if (!o.on && !tunnelWin) return Promise.resolve(true); // выключен и окна нет — нечего выключать
  return tunnelCmd('relay', o);
}
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
handle('net:roomPassword', (id) => store.getSecret('room:' + id) || '');
// изменить комнату: имя, пароль, режим (включённая — перезапускается с новыми)
handle('net:updateRoom', async ({ id, name, password, mode }) => {
  const rooms = store.get().rooms || [];
  const r = rooms.find((x) => x.id === id);
  if (!r) throw new Error('Комната не найдена');
  const newName = String(name || r.name).trim();
  const newPass = password != null && password !== '' ? String(password) : store.getSecret('room:' + id);
  if (newName.length < 3) throw new Error('Имя комнаты — хотя бы 3 символа');
  if (!newPass || newPass.length < 4) throw new Error('Пароль — хотя бы 4 символа');
  const wasActive = store.get().activeRoom === id && tunnelState.active;
  const newId = roomKey(r.role, newName);
  store.setSecret('room:' + id, null);
  store.setSecret('room:' + newId, newPass);
  const next = rooms.filter((x) => x.id !== id && x.id !== newId);
  next.unshift({ ...r, id: newId, name: newName, mode: mode || r.mode, lastUsed: Date.now() });
  store.set({ rooms: next, activeRoom: wasActive ? newId : store.get().activeRoom === id ? null : store.get().activeRoom });
  if (wasActive) {
    const o = tunnelOpts({ name: newName, password: newPass, mode: mode || r.mode });
    await tunnelCmd(r.role === 'host' ? 'host' : 'join', o);
  }
  return { id: newId, restarted: wasActive };
});
handle('net:leave', () => { store.set({ activeRoom: null }); return tunnelWin ? tunnelCmd('leave') : true; });

// ---------------- сервер сборки ----------------
const server = require('./server.cjs');
const hosting = require('./hosting.cjs');
server.init((ch, data) => { send(ch, data); if (ch === 'server-state') onServerState(data); });

// ---------- свой сервер: туннель + «в сети» для каталога + трей ----------
let tray = null;
let trayHinted = false;
let presenceTimer = null;
function trayMenu() {
  const p = hosting.profile();
  const st = server.state();
  return Menu.buildFromTemplate([
    { label: 'Открыть лаунчер', click: () => { if (win) { win.show(); win.focus(); } } },
    { type: 'separator' },
    { label: `${p.name}: ${st === 'running' ? 'работает, игроков ' + server.playerList().length : st}`, enabled: false },
    { label: 'Остановить сервер', enabled: server.running(), click: () => server.stop() },
    { type: 'separator' },
    { label: 'Выход (сервер сохранится и закроется)', click: () => app.quit() }
  ]);
}
function ensureTray() {
  if (tray) { tray.setContextMenu(trayMenu()); return; }
  try {
    const img = NI.createFromPath(path.join(__dirname, '..', 'dist', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('VillagersLauncher — сервер');
    tray.on('click', () => { if (win) { win.show(); win.focus(); } });
    tray.setContextMenu(trayMenu());
  } catch (_) { tray = null; }
}
function presenceInfo(online) {
  const p = hosting.profile();
  return online ? { online: true, name: p.name, players: server.playerList().length, max: p.maxPlayers, at: Date.now() } : { online: false, at: Date.now() };
}
async function publishPresence(online) {
  try { const w = await scoresWorker(); w.webContents.send('scores-cmd', { cmd: 'srvPresence', opts: { id: hosting.profile().id, info: presenceInfo(online) } }); } catch (_) {}
}
function onServerState(d) {
  if (tray) tray.setContextMenu(trayMenu());
  if (d.state === 'running' && !presenceTimer) {
    // комната туннеля: друзья по ключу заходят прямо на сервер
    const p = hosting.profile();
    const o = tunnelOpts({ name: p.room, password: hosting.hostTunnelPassword(), mode: 'server' });
    store.set({ hostingActive: true });
    tunnelCmd('host', o).catch(() => {});
    publishPresence(true);
    presenceTimer = setInterval(() => publishPresence(true), 30000);
    ensureTray();
  } else if (d.state === 'running') publishPresence(true);
  if (d.state === 'stopped' && (presenceTimer || store.get().hostingActive)) {
    clearInterval(presenceTimer); presenceTimer = null;
    store.set({ hostingActive: false });
    publishPresence(false);
    if (tunnelWin && tunnelState.active && tunnelState.role === 'host' && tunnelState.mode === 'server') tunnelCmd('leave').catch(() => {});
    if (tray && win && win.isVisible()) { tray.destroy(); tray = null; }
    if (win && !win.isVisible()) { tray && tray.destroy(); tray = null; app.quit(); } // сервер закрыли из трея — выходим
  }
}
handle('hosting:get', () => ({ ...hosting.profile(), key: hosting.keyOf(), worlds: hosting.worlds(), radminNow: hosting.radmin() }));
handle('hosting:update', (patch) => { hosting.update(patch || {}); if (server.running()) publishPresence(true); return { ...hosting.profile(), key: hosting.keyOf() }; });
handle('hosting:resetKey', async () => {
  hosting.resetKey();
  if (server.running()) { const p = hosting.profile(); await tunnelCmd('host', tunnelOpts({ name: p.room, password: hosting.hostTunnelPassword(), mode: 'server' })); }
  return { ...hosting.profile(), key: hosting.keyOf() };
});
handle('hosting:importWorld', ({ name, overwrite }) => { hosting.importWorld(name, overwrite); return { ...hosting.profile(), worlds: hosting.worlds() }; });
handle('hosting:newWorld', (name) => { hosting.newWorld(name); return { ...hosting.profile(), worlds: hosting.worlds() }; });
handle('hosting:parseKey', (key) => { const k = hosting.parseKey(key); return { name: k.name, password: k.password, radmin: k.radmin, id: k.id, key: k.key }; });
// войти на сервер по ключу: туннель до хозяина → игра заходит на 127.0.0.1
handle('hosting:join', async ({ key, password }) => {
  const k = hosting.parseKey(key);
  if (k.password && !password) throw new Error('У сервера пароль — введи его');
  if (server.running()) throw new Error('Пока работает твой сервер, туннель занят им. Останови свой сервер, чтобы зайти к другому.');
  const o = tunnelOpts({ name: k.room, password: hosting.tunnelPassword(k.secret, password || ''), mode: 'server' });
  await tunnelCmd('join', o);
  return { ok: true, name: k.name, radmin: k.radmin };
});
handle('hosting:leave', () => (tunnelWin ? tunnelCmd('leave') : true));
handle('radmin:status', () => hosting.radmin());
// каталог серверов от автора (вкладка «Сервера» у всех) + кто сейчас в сети
let srvPresence = {};
ipcMain.on('srv-presence', (e, { id, info }) => {
  if (!scoresWin || e.sender !== scoresWin.webContents) return;
  srvPresence[id] = info && typeof info === 'object' ? { online: !!info.online, players: Number(info.players) || 0, max: Number(info.max) || 0, at: Number(info.at) || 0 } : null;
  send('servers-presence', srvPresence);
});
handle('catalog:list', async () => {
  const c = await pack.readCatalog();
  const ids = c.servers.map((x) => x.id);
  try { const w = await scoresWorker(); w.webContents.send('scores-cmd', { cmd: 'srvWatch', opts: { ids } }); } catch (_) {}
  return { servers: c.servers.filter((x) => !x.hidden), presence: srvPresence };
});
handle('catalog:author', async () => (await pack.readCatalog()).servers);
handle('catalog:save', async (entry) => {
  const k = hosting.parseKey(entry.key);
  return (await pack.writeCatalog((c) => {
    const i = c.servers.findIndex((x) => x.id === k.id);
    const prev = i >= 0 ? c.servers[i] : {};
    const next = { ...prev, ...entry, id: k.id, key: k.key, name: entry.name || prev.name || k.name, addedAt: prev.addedAt || Date.now() };
    if (i >= 0) c.servers[i] = next; else c.servers.push(next);
  }, 'Сервера: ' + (entry.name || k.name))).servers;
});
handle('catalog:remove', async (id) => (await pack.writeCatalog((c) => { c.servers = c.servers.filter((x) => x.id !== id); }, 'Сервера: убран')).servers);
async function packVersions() {
  const s = store.get();
  let manifest = null;
  try { manifest = await pack.chosenManifest(); } catch (_) {}
  return {
    mcVersion: (manifest && manifest.minecraft) || s.minecraftVersion,
    neoVersion: (manifest && manifest.loader && manifest.loader.version) || s.neoforgeVersion
  };
}
handle('server:status', () => server.status());
powerMonitor.on('shutdown', () => { if (server.running()) server.stop(); });
handle('server:start', async () => {
  try { return await server.start(await packVersions(), progress); } finally { progress(null); }
});
handle('server:stop', () => server.stop());
handle('server:command', (text) => server.command(text));
handle('server:openDir', () => { fs.mkdirSync(server.dir(), { recursive: true }); shell.openPath(server.dir()); return true; });
app.on('before-quit', (e) => {
  if (quitting) return;
  if (server.running() || tunnelWin) {
    e.preventDefault();
    quitting = true;
    Promise.all([server.stop(), tunnelWin ? tunnelCmd('shutdown').then(() => new Promise((r) => setTimeout(r, 700))) : null])
      .finally(() => { if (tunnelWin && !tunnelWin.isDestroyed()) tunnelWin.destroy(); app.quit(); });
  }
});


// ---------- папка игры: нашлась ли сборка, переименование, перенос ----------
function hasPackIn(d) { try { return fs.existsSync(path.join(d, '.villagers', 'state.json')); } catch (_) { return false; } }
function samePath(a, b) { return !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
// сборка уже скачивалась сюда, а теперь папки нет (переименовали/перенесли) — не качаем заново молча
function dirStatus() {
  const s = store.get();
  const d = s.gameDir;
  const exists = fs.existsSync(d);
  const has = hasPackIn(d);
  if (has && !s.lastPackDir) store.set({ lastPackDir: d });
  const lost = !has && !pack.isAuthorHome(d) && samePath(s.lastPackDir, d);
  let candidates = [];
  if (lost) {
    // ищем рядом: папка с нашей сборкой с другим названием
    try {
      const parent = path.dirname(d);
      candidates = fs.readdirSync(parent, { withFileTypes: true })
        .filter((e) => e.isDirectory() && hasPackIn(path.join(parent, e.name)))
        .map((e) => path.join(parent, e.name)).slice(0, 5);
    } catch (_) {}
  }
  return { path: d, name: path.basename(d), exists, hasPack: has, lost, candidates };
}
function dirBusyCheck() {
  if (game) throw new Error('Сначала закрой игру');
  if (busy) throw new Error('Лаунчер сейчас занят — подожди');
  if (server.running()) throw new Error('Сначала выключи сервер (раздел «Сеть»)');
  if (tunnelState.active) throw new Error('Сначала выключи комнату (раздел «Сеть»)');
}
function setGameDir(d) {
  const s = store.get();
  const patch = { gameDir: d };
  if (samePath(s.authorSourceDir, s.gameDir)) patch.authorSourceDir = d;
  if (hasPackIn(d)) patch.lastPackDir = d;
  store.set(patch);
}
// выбрать папку: если выбрали «родителя», а сборка лежит внутри — берём её
handle('game:useDir', (d) => {
  if (!d) return null;
  let pick = d;
  if (!hasPackIn(d)) {
    try {
      const inner = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && hasPackIn(path.join(d, e.name)));
      if (inner.length === 1) pick = path.join(d, inner[0].name);
    } catch (_) {}
  }
  setGameDir(pick);
  return dirStatus();
});
handle('game:freshDir', () => { store.set({ lastPackDir: null }); return dirStatus(); });
const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]/;
handle('game:renameDir', async (name) => {
  dirBusyCheck();
  name = String(name || '').trim().replace(/[. ]+$/, '');
  if (!name || BAD_NAME.test(name) || name === '.' || name === '..') throw new Error('Такое название папки нельзя: без символов < > : " / \\ | ? *');
  const from = store.get().gameDir;
  const to = path.join(path.dirname(from), name);
  if (samePath(from, to) && path.basename(from) === name) return dirStatus();
  if (!samePath(from, to) && fs.existsSync(to)) throw new Error('Папка «' + name + '» уже есть рядом — выбери другое название');
  if (fs.existsSync(from)) {
    try { await fs.promises.rename(from, to); }
    catch (e) { throw new Error('Не получилось переименовать: папка чем-то занята (открыта в Проводнике или другой программе?). ' + (e.code || e.message)); }
  }
  setGameDir(to);
  return dirStatus();
});
handle('game:moveDir', async (parent) => {
  dirBusyCheck();
  if (!parent) return dirStatus();
  const from = store.get().gameDir;
  const to = path.join(parent, path.basename(from));
  if (samePath(from, to)) return dirStatus();
  if (path.resolve(to).toLowerCase().startsWith(path.resolve(from).toLowerCase() + path.sep)) throw new Error('Нельзя перенести папку внутрь самой себя');
  if (fs.existsSync(to)) throw new Error('В выбранном месте уже есть папка «' + path.basename(from) + '»');
  if (fs.existsSync(from)) {
    setBusy('move');
    try {
      try { await fs.promises.rename(from, to); }
      catch (e) {
        if (e.code !== 'EXDEV') throw new Error('Не получилось перенести: папка чем-то занята. ' + (e.code || e.message));
        // другой диск: копируем, потом убираем старую
        progress({ stage: 'move', text: 'Переношу папку игры на другой диск…', indeterminate: true });
        await fs.promises.cp(from, to, { recursive: true, errorOnExist: true, force: false });
        await fs.promises.rm(from, { recursive: true, force: true });
      }
    } finally { setBusy(null); progress(null); }
  }
  setGameDir(to);
  return dirStatus();
});

// ---------------- запуск игры ----------------
handle('game:status', () => ({ running: !!game, busy, what: busyWhat }));

async function prepareGame({ verify = false, update = false, noUpdate = false } = {}) {
  const s = store.get();
  const gameDir = s.gameDir;
  if (dirStatus().lost && !verify) throw new Error('Сборка не найдена в папке «' + gameDir + '». Если ты переименовал или перенёс папку — укажи её в «Настройках», иначе нажми «Скачать заново» в баннере сверху.');
  fs.mkdirSync(gameDir, { recursive: true });
  let manifest = null;
  if (!pack.isAuthorHome(gameDir)) {
    progress({ stage: 'pack', text: 'Проверяю обновления сборки…', indeterminate: true });
    try {
      manifest = await pack.chosenManifest();
    } catch (e) {
      const st = pack.readState(gameDir);
      if (e.code === 'closed') {
        if (!st.version) throw new Error(e.message);
        progress({ stage: 'pack', text: 'Обновления сборки закрыты автором — запускаю то, что уже скачано', indeterminate: true });
      } else {
        if (!st.version) throw new Error('Нет связи с GitHub, а сборка ещё не скачана: ' + e.message);
        progress({ stage: 'pack', text: 'Нет связи, запускаю то, что уже скачано', indeterminate: true });
      }
    }
  }
  const versions = {
    mcVersion: (manifest && manifest.minecraft) || s.minecraftVersion,
    neoVersion: (manifest && manifest.loader && manifest.loader.version) || s.neoforgeVersion
  };
  const installed = await mc.installAll(versions, progress, { verify });
  const have = pack.readState(gameDir).version;
  // «Играть без обновления» — остаёмся на своей версии; «Обновить и играть» — обновляем, даже если автообновление выключено
  if (manifest && (verify || !have || (!noUpdate && (update || s.autoUpdatePack)))) {
    await pack.sync(manifest, gameDir, progress, { verify });
  }
  if (hasPackIn(gameDir) && !samePath(store.get().lastPackDir, gameDir)) store.set({ lastPackDir: gameDir });
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
    const { installed, gameDir } = await prepareGame({ update: !!opts.update, noUpdate: !!opts.noUpdate });
    if (account.type === 'ely') {
      progress({ stage: 'auth', text: 'Подключаю Ely.by', indeterminate: true });
      await mc.ensureAuthlibInjector();
    }
    fs.mkdirSync(path.join(gameDir, 'skinkokk'), { recursive: true });
    const splashJar = splash.prepare({ enabled: s.customSplash !== false, gameDir, libDir: mc.LIB_DIR, log: (l) => send('game-log', [l]) });
    const launch = mc.buildLaunch({ ...installed, account, gameDir, quickPlay: opts.quickPlay, extraClasspath: splashJar ? [splashJar] : [] });
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
// кнопка «Проверить обновления»: лаунчер (сборка проверяется в окне сама)
let checkLauncher = async () => ({ state: 'dev', version: app.getVersion() });
handle('app:checkUpdates', () => checkLauncher());

// Обновление само: скачалось — как только лаунчер свободен (нет игры, заливки, сервера), тихо ставится и перезапускается.
let installNow = null;
function whenIdleInstall(version) {
  send('update-state', { state: 'ready', version });
  const tryIt = () => {
    if (game || busy || server.running()) { setTimeout(tryIt, 30000); return; }
    send('update-state', { state: 'installing', version });
    setTimeout(() => installNow && installNow(), 3000);
  };
  setTimeout(tryIt, 1500);
}

// Mac: лаунчер без подписи Apple — меняет себя сам: качает новую версию (zip), подменяет .app и запускается заново
function macUpdateCheck() {
  const netu = require('./net.cjs');
  let pending = null;
  const appPath = path.resolve(app.getPath('exe'), '..', '..', '..');
  const canSelf = () => {
    if (!appPath.endsWith('.app') || appPath.startsWith('/Volumes/')) return false;
    try { fs.accessSync(path.dirname(appPath), fs.constants.W_OK); return true; } catch (_) { return false; }
  };
  const check = async () => {
    if (pending) return { state: pending.ready ? 'ready' : 'downloading', version: pending.v };
    const rel = await netu.getJson('https://api.github.com/repos/kokkas56/VillagersLauncher/releases/latest');
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (!v || !newer(v, app.getVersion())) return { state: 'latest', version: app.getVersion() };
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const zip = (rel.assets || []).find((x) => x.name === `VillagersLauncher-mac-${arch}.zip`);
    const dmg = (rel.assets || []).find((x) => x.name === `VillagersLauncher-mac-${arch}.dmg`);
    if (!zip || !canSelf()) {
      const st = { state: 'manual', version: v, url: dmg ? dmg.browser_download_url : rel.html_url };
      send('update-state', st);
      return st;
    }
    pending = { v, ready: false };
    send('update-state', { state: 'downloading', version: v });
    (async () => {
      const dir = path.join(app.getPath('temp'), 'villagerslauncher-update-' + v);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'update.zip');
      await netu.downloadFile(zip.browser_download_url, file, { size: zip.size, onBytes: () => {} });
      require('child_process').execFileSync('ditto', ['-x', '-k', file, dir]);
      const fresh = fs.readdirSync(dir).find((n) => n.endsWith('.app'));
      if (!fresh) throw new Error('в архиве нет приложения');
      const newApp = path.join(dir, fresh);
      installNow = () => {
        const q = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";
        const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done; rm -rf ${q(appPath)} && mv ${q(newApp)} ${q(appPath)}; xattr -dr com.apple.quarantine ${q(appPath)} 2>/dev/null; open ${q(appPath)}`;
        spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
        app.quit();
      };
      pending.ready = true;
      whenIdleInstall(v);
    })().catch((e) => {
      pending = null;
      send('update-state', { state: 'manual', version: v, url: dmg ? dmg.browser_download_url : rel.html_url, error: e.message });
    });
    return { state: 'downloading', version: v };
  };
  checkLauncher = check;
  handle('app:installUpdate', () => { if (installNow) installNow(); });
  setTimeout(() => check().catch(() => {}), 5000);
  setInterval(() => check().catch(() => {}), 3 * 3600e3);
}

function setupUpdater() {
  if (DEV || !app.isPackaged) return;
  if (process.platform === 'darwin') { macUpdateCheck(); return; }
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let ready = null;
  autoUpdater.on('update-available', (i) => send('update-state', { state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', (p) => send('update-state', { state: 'downloading', percent: p.percent }));
  // тихая установка (без окна установщика) и сразу запуск новой версии
  installNow = () => autoUpdater.quitAndInstall(true, true);
  autoUpdater.on('update-downloaded', (i) => { ready = i.version; whenIdleInstall(i.version); });
  autoUpdater.on('error', () => {});
  handle('app:installUpdate', () => installNow());
  checkLauncher = async () => {
    if (ready && newer(ready, app.getVersion())) return { state: 'ready', version: ready };
    const r = await autoUpdater.checkForUpdates();
    const v = r && r.updateInfo && r.updateInfo.version;
    if (v && newer(v, app.getVersion())) return { state: 'downloading', version: v };
    return { state: 'latest', version: app.getVersion() };
  };
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 3600e3);
}
