// «Студия»: проект сцен автора на диске (<игра>/studio), сборка для игроков
// (<игра>/config/kokkstory/studio) и живая связь с запущенной игрой — TCP 127.0.0.1:47311, JSON построчно.
const fs = require('fs');
const path = require('path');
const net = require('net');
const V = require('./studio-validate.cjs');

const SAFE_ID = /^[a-z0-9_-]{1,64}$/;
const DEFAULT_PORT = 47311;

module.exports = function setupStudio({ handle, send, store }) {
  const gameDir = () => store.get().gameDir;
  const root = () => path.join(gameDir(), 'studio');
  const scenesDir = () => path.join(root(), 'scenes');
  const projectFile = () => path.join(root(), 'project.json');
  const devFile = () => path.join(root(), '.dev');
  const outDir = () => path.join(gameDir(), 'config', 'kokkstory', 'studio');

  function checkId(id) {
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Имя сцены: только маленькие латинские буквы, цифры, _ и - (например alaric_arrival)');
    return String(id);
  }
  const sceneFile = (id) => path.join(scenesDir(), checkId(id) + '.json');
  function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  }
  function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  function ensure() {
    fs.mkdirSync(scenesDir(), { recursive: true });
    if (!fs.existsSync(projectFile())) writeJson(projectFile(), V.defaultProject());
  }
  function readProject() {
    ensure();
    try { return { ...V.defaultProject(), ...readJson(projectFile()) }; } catch (e) { throw new Error('project.json не читается: ' + e.message); }
  }
  function list() {
    ensure();
    return fs.readdirSync(scenesDir()).filter((f) => f.endsWith('.json')).map((f) => {
      const id = f.slice(0, -5);
      const file = path.join(scenesDir(), f);
      let mtime = 0;
      try { mtime = fs.statSync(file).mtimeMs; } catch (_) {}
      try {
        const s = readJson(file);
        return { id, title: s.title || id, length: s.length || 0, mtime };
      } catch (e) { return { id, title: id, length: 0, mtime, broken: e.message }; }
    }).sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'));
  }
  const devOn = () => fs.existsSync(devFile());

  handle('studio:open', () => {
    ensure();
    return { dir: root(), out: outDir(), dev: devOn(), project: readProject(), scenes: list(), link: status() };
  });
  handle('studio:list', () => list());
  handle('studio:read', (id) => {
    const f = sceneFile(id);
    if (!fs.existsSync(f)) throw new Error('Сцена «' + id + '» не найдена');
    const s = readJson(f);
    if (!s.id) s.id = id;
    return s;
  });
  handle('studio:save', (scene) => {
    if (!scene || typeof scene !== 'object') throw new Error('Пустая сцена');
    const f = sceneFile(scene.id);
    writeJson(f, V.cleanScene(scene));
    return { mtime: fs.statSync(f).mtimeMs };
  });
  handle('studio:delete', (id) => {
    const f = sceneFile(id);
    if (!fs.existsSync(f)) return true;
    // не стираем насовсем: кладём в studio/.trash — вдруг пригодится
    const trash = path.join(root(), '.trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(f, path.join(trash, id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
    return true;
  });
  handle('studio:rename', ({ from, to, title }) => {
    const a = sceneFile(from), b = sceneFile(to);
    if (from === to) return true;
    if (fs.existsSync(b)) throw new Error('Сцена с именем «' + to + '» уже есть');
    const s = readJson(a);
    s.id = to;
    if (title) s.title = title;
    writeJson(b, s);
    fs.unlinkSync(a);
    return true;
  });
  handle('studio:duplicate', ({ from, to, title }) => {
    const b = sceneFile(to);
    if (fs.existsSync(b)) throw new Error('Сцена с именем «' + to + '» уже есть');
    const s = readJson(sceneFile(from));
    s.id = to;
    s.title = title || (s.title || from) + ' (копия)';
    writeJson(b, s);
    return true;
  });
  handle('studio:project', (data) => {
    if (data && typeof data === 'object') writeJson(projectFile(), V.cleanProject({ ...V.defaultProject(), ...data }));
    return readProject();
  });
  handle('studio:devMode', (on) => {
    ensure();
    if (on === true) fs.writeFileSync(devFile(), 'Режим разработчика Студии: игра читает сцены прямо из этой папки и открывает связь с лаунчером.\nУдали файл (или выключи переключатель в лаунчере), чтобы выключить.\n');
    else if (on === false && fs.existsSync(devFile())) fs.unlinkSync(devFile());
    return devOn();
  });
  handle('studio:build', () => {
    const project = readProject();
    const scenes = [];
    const issues = [];
    for (const it of list()) {
      try {
        const s = readJson(path.join(scenesDir(), it.id + '.json'));
        if (!s.id) s.id = it.id;
        if (s.id !== it.id) issues.push({ sev: V.WARN, scene: it.id, sel: null, msg: 'Файл ' + it.id + '.json, а внутри id «' + s.id + '» — при сборке берётся имя файла' });
        s.id = it.id;
        scenes.push(s);
      } catch (e) { issues.push({ sev: V.ERR, scene: it.id, sel: null, msg: 'Файл сцены не читается: ' + e.message }); }
    }
    issues.push(...V.validateProject(project, scenes));
    const errors = issues.filter((i) => i.sev === V.ERR).length;
    if (errors) return { ok: false, issues, errors, count: 0, dir: outDir() };
    const out = outDir();
    const outScenes = path.join(out, 'scenes');
    fs.mkdirSync(outScenes, { recursive: true });
    writeJson(path.join(out, 'project.json'), V.normalizeProject(project));
    const keep = new Set();
    for (const s of scenes) { writeJson(path.join(outScenes, s.id + '.json'), V.normalizeScene(s)); keep.add(s.id + '.json'); }
    // убрать из сборки сцены, которых больше нет в проекте
    let removed = 0;
    for (const f of fs.readdirSync(outScenes)) if (f.endsWith('.json') && !keep.has(f)) { fs.unlinkSync(path.join(outScenes, f)); removed++; }
    writeJson(path.join(out, 'index.json'), { v: 1, built: new Date().toISOString(), scenes: scenes.map((s) => s.id) });
    return { ok: true, issues, errors: 0, count: scenes.length, removed, dir: out };
  });

  // ---------- живая связь с игрой ----------
  let want = false;
  let sock = null;
  let connected = false;
  let info = null;
  let timer = null;
  let buf = '';
  let waiters = [];
  const port = () => Number(store.get().studioPort) || DEFAULT_PORT;
  function status() { return { connected, info, port: port(), want }; }
  function emitState() { send('studio-link', { type: 'state', ...status() }); }
  function failWaiters(msg) { const w = waiters; waiters = []; w.forEach((x) => { clearTimeout(x.timer); x.reject(new Error(msg)); }); }
  function schedule() {
    clearTimeout(timer);
    if (want && !sock) timer = setTimeout(connect, 3000);
  }
  function write(msg) {
    if (!sock || !connected) throw new Error('Нет связи с игрой — запусти игру с режимом разработчика');
    sock.write(JSON.stringify(msg) + '\n');
    return true;
  }
  function onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { info = msg; emitState(); }
    const hit = waiters.filter((w) => w.type === msg.t);
    if (hit.length) { waiters = waiters.filter((w) => w.type !== msg.t); hit.forEach((w) => { clearTimeout(w.timer); w.resolve(msg); }); }
    send('studio-link', { type: 'msg', msg });
  }
  function connect() {
    if (!want || sock) return;
    const s = net.createConnection({ host: '127.0.0.1', port: port() });
    sock = s;
    s.setEncoding('utf8');
    s.setNoDelay(true);
    s.on('connect', () => {
      connected = true; buf = '';
      try { write({ t: 'hello', from: 'launcher' }); } catch (_) {}
      emitState();
    });
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
      if (buf.length > 8e6) buf = '';
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (sock !== s) return;
      sock = null;
      const was = connected;
      connected = false; info = null;
      failWaiters('Связь с игрой пропала');
      if (was) emitState();
      schedule();
    });
  }
  function request(msg, type, ms = 3000) {
    write(msg);
    return new Promise((resolve, reject) => {
      const w = { type, resolve, reject };
      w.timer = setTimeout(() => { waiters = waiters.filter((x) => x !== w); reject(new Error('Игра не ответила за ' + Math.round(ms / 1000) + ' с')); }, ms);
      waiters.push(w);
    });
  }

  handle('studio:link', (on) => {
    want = !!on;
    clearTimeout(timer);
    if (want) connect();
    else if (sock) { const s = sock; sock = null; connected = false; info = null; failWaiters('Студия закрыта'); s.destroy(); }
    emitState();
    return status();
  });
  handle('studio:linkState', () => status());
  handle('studio:setPort', (p) => {
    const n = Math.floor(Number(p));
    if (!(n > 1023 && n < 65536)) throw new Error('Порт — число от 1024 до 65535');
    store.set({ studioPort: n });
    if (sock) sock.destroy(); else if (want) connect();
    return status();
  });
  handle('studio:send', (msg) => write(msg));
  handle('studio:play', (scene) => write({ t: 'play', scene }));
  handle('studio:stop', () => write({ t: 'stop' }));
  handle('studio:reload', () => write({ t: 'reload' }));
  handle('studio:preview', (camera) => write({ t: 'preview', camera }));
  handle('studio:gizmos', (data) => write({ t: 'gizmos', data: data || null }));
  handle('studio:tp', (a) => write(Array.isArray(a) ? { t: 'tp', pos: a } : { t: 'tp', pos: a && a.pos, yaw: a && a.yaw, pitch: a && a.pitch }));
  handle('studio:getView', () => request({ t: 'getView' }, 'view'));
  handle('studio:getSel', () => request({ t: 'getSel' }, 'sel'));
};
