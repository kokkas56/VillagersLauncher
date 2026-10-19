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
  // виды документов проекта: сцены, диалоги, задания — по файлу на штуку
  const KINDS = {
    scenes: { dir: 'scenes', what: 'Сцена', whatGen: 'сцены', clean: (d) => V.cleanScene(d), norm: (d) => V.normalizeScene(d) },
    dialogs: { dir: 'dialogs', what: 'Диалог', whatGen: 'диалога', clean: (d) => V.cleanDoc(d), norm: (d) => V.normalizeDialog(d) },
    quests: { dir: 'quests', what: 'Задание', whatGen: 'задания', clean: (d) => V.cleanDoc(d), norm: (d) => V.normalizeQuest(d) }
  };
  function kindOf(k) { const d = KINDS[k]; if (!d) throw new Error('Неизвестный вид файлов Студии: ' + k); return d; }
  const kindDir = (k) => path.join(root(), kindOf(k).dir);
  function docFile(k, id) {
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Имя ' + kindOf(k).whatGen + ': только маленькие латинские буквы, цифры, _ и - (например miron_first)');
    return path.join(kindDir(k), String(id) + '.json');
  }
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
    for (const k of Object.keys(KINDS)) fs.mkdirSync(kindDir(k), { recursive: true });
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

  // список диалогов/заданий: id, название + id узлов/шагов (для выпадающих списков и проверки ссылок)
  function listDocs(k) {
    if (k === 'scenes') return list();
    ensure();
    const dir = kindDir(k);
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      const id = f.slice(0, -5);
      const file = path.join(dir, f);
      let mtime = 0;
      try { mtime = fs.statSync(file).mtimeMs; } catch (_) {}
      try {
        const d = readJson(file);
        const it = { id, title: d.title || id, mtime };
        if (k === 'dialogs') { it.nodes = d.nodes && typeof d.nodes === 'object' ? Object.keys(d.nodes) : []; it.speaker = d.speaker || 'any'; }
        if (k === 'quests') it.steps = Array.isArray(d.steps) ? d.steps.map((s) => ({ id: s && s.id, title: s && s.title })) : [];
        return it;
      } catch (e) { return { id, title: id, mtime, broken: e.message, nodes: [], steps: [] }; }
    }).sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'));
  }
  function readAll(k) {
    const out = [];
    for (const it of listDocs(k)) { try { const d = readJson(docFile(k, it.id)); d.id = it.id; out.push(d); } catch (_) {} }
    return out;
  }
  // переименовали диалог/сцену/задание/переменную — поправить ссылки во всех файлах проекта
  function walk(v, fn) {
    if (Array.isArray(v)) { let ch = false; const a = v.map((x) => { const r = walk(x, fn); if (r !== x) ch = true; return r; }); return ch ? a : v; }
    if (v && typeof v === 'object') {
      let o = fn(v);
      let ch = o !== v;
      const c = {};
      for (const k of Object.keys(o)) { const r = walk(o[k], fn); if (r !== o[k]) ch = true; c[k] = r; }
      return ch ? c : v;
    }
    return v;
  }
  function fixRefs(fn, strFn) {
    let files = 0;
    for (const k of Object.keys(KINDS)) {
      for (const it of listDocs(k)) {
        const f = docFile(k, it.id);
        let d;
        try { d = readJson(f); } catch (_) { continue; }
        let n = walk(d, fn);
        if (strFn) n = walkStr(n, strFn);
        if (n !== d) { writeJson(f, n); files++; }
      }
    }
    return files;
  }
  function walkStr(v, fn) {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) { let ch = false; const a = v.map((x) => { const r = walkStr(x, fn); if (r !== x) ch = true; return r; }); return ch ? a : v; }
    if (v && typeof v === 'object') { let ch = false; const c = {}; for (const k of Object.keys(v)) { const r = walkStr(v[k], fn); if (r !== v[k]) ch = true; c[k] = r; } return ch ? c : v; }
    return v;
  }
  const refFixers = {
    dialogs: (from, to) => (o) => {
      if (o.do === 'dialog' && o.id === from) return { ...o, id: to };
      if (o.dialog === from) return { ...o, dialog: to };
      return o;
    },
    scenes: (from, to) => (o) => (o.scene === from ? { ...o, scene: to } : o),
    quests: (from, to) => (o) => (o.quest === from ? { ...o, quest: to } : o)
  };

  handle('studio:open', () => {
    ensure();
    return { dir: root(), out: outDir(), dev: devOn(), project: readProject(), scenes: list(), dialogs: listDocs('dialogs'), quests: listDocs('quests'), link: status() };
  });
  // ---- диалоги и задания (и сцены тем же путём): kind = 'scenes' | 'dialogs' | 'quests' ----
  handle('studio:docList', (k) => listDocs(k));
  handle('studio:docRead', ({ kind, id }) => {
    const f = docFile(kind, id);
    if (!fs.existsSync(f)) throw new Error('Файл «' + id + '.json» (' + kindOf(kind).what.toLowerCase() + ') не найден');
    const d = readJson(f);
    if (!d.id) d.id = id;
    return d;
  });
  handle('studio:docSave', ({ kind, doc }) => {
    if (!doc || typeof doc !== 'object') throw new Error('Пустой файл');
    const f = docFile(kind, doc.id);
    writeJson(f, kindOf(kind).clean(doc));
    return { mtime: fs.statSync(f).mtimeMs };
  });
  handle('studio:docDelete', ({ kind, id }) => {
    const f = docFile(kind, id);
    if (!fs.existsSync(f)) return true;
    const trash = path.join(root(), '.trash', kindOf(kind).dir);
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(f, path.join(trash, id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
    return true;
  });
  // fixRefs: true — поправить ссылки в других файлах; вернёт { refs: сколько файлов поправлено }
  handle('studio:docRename', ({ kind, from, to, title, fixRefs: fix }) => {
    const a = docFile(kind, from), b = docFile(kind, to);
    if (from === to) return { refs: 0 };
    if (fs.existsSync(b)) throw new Error(kindOf(kind).what + ' с именем «' + to + '» уже есть');
    const d = readJson(a);
    d.id = to;
    if (title) d.title = title;
    writeJson(b, d);
    fs.unlinkSync(a);
    return { refs: fix === false ? 0 : fixRefs(refFixers[kind](from, to)) };
  });
  handle('studio:docDuplicate', ({ kind, from, to, title }) => {
    const b = docFile(kind, to);
    if (fs.existsSync(b)) throw new Error(kindOf(kind).what + ' с именем «' + to + '» уже есть');
    const d = readJson(docFile(kind, from));
    d.id = to;
    d.title = title || (d.title || from) + ' (копия)';
    writeJson(b, d);
    return true;
  });
  // переменная переименована: условия, действия, событие сцены «Переменная», {var:имя} в текстах
  handle('studio:renameVar', ({ from, to }) => {
    if (!V.isVarName(from) || !V.isVarName(to)) throw new Error('Имя переменной — латиница, цифры, _ . -');
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\{var:' + esc + '\\}', 'g');
    try { // и в project.json
      const pr = readProject();
      if ((pr.vars || []).some((v) => v && v.name === from) && !(pr.vars || []).some((v) => v && v.name === to)) writeJson(projectFile(), V.cleanProject({ ...pr, vars: pr.vars.map((v) => (v && v.name === from ? { ...v, name: to } : v)) }));
    } catch (_) {}
    return { refs: fixRefs((o) => {
      let c = o;
      if (c.var === from) c = { ...c, var: to };
      if (c.set === from) c = { ...c, set: to };
      if (c.add === from && typeof c.add === 'string') c = { ...c, add: to };
      if (c.do === 'var' && c.name === from) c = { ...c, name: to };
      return c;
    }, (s) => (s.includes('{var:' + from + '}') ? s.replace(re, '{var:' + to + '}') : s)) };
  });
  // где используются переменные: { имя: [{ kind, id, title }] }
  handle('studio:varUsage', () => {
    const use = {};
    const note = (name, k, d) => { if (!name || typeof name !== 'string') return; const a = (use[name] = use[name] || []); if (!a.some((x) => x.kind === k && x.id === d.id)) a.push({ kind: k, id: d.id, title: d.title || d.id }); };
    for (const k of Object.keys(KINDS)) {
      for (const d of readAll(k)) {
        walk(d, (o) => {
          if (typeof o.var === 'string') note(o.var, k, d);
          if (typeof o.set === 'string') note(o.set, k, d);
          if (typeof o.add === 'string') note(o.add, k, d);
          if (o.do === 'var') note(o.name, k, d);
          return o;
        });
        walkStr(d, (s) => { for (const m of s.matchAll(/\{var:([^}]+)\}/g)) note(m[1], k, d); return s; });
      }
    }
    return use;
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
    fixRefs(refFixers.scenes(from, to));
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
    const docs = { dialogs: [], quests: [] };
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
    for (const k of ['dialogs', 'quests']) {
      for (const it of listDocs(k)) {
        try {
          const d = readJson(docFile(k, it.id));
          if (d.id && d.id !== it.id) issues.push({ sev: V.WARN, kind: k === 'dialogs' ? 'dialog' : 'quest', doc: it.id, sel: null, msg: 'Файл ' + it.id + '.json, а внутри id «' + d.id + '» — при сборке берётся имя файла' });
          d.id = it.id;
          docs[k].push(d);
        } catch (e) { issues.push({ sev: V.ERR, kind: k === 'dialogs' ? 'dialog' : 'quest', doc: it.id, sel: null, msg: 'Файл не читается: ' + e.message }); }
      }
    }
    issues.push(...V.validateProject(project, scenes, docs));
    const errors = issues.filter((i) => i.sev === V.ERR).length;
    if (errors) return { ok: false, issues, errors, count: 0, dialogs: 0, quests: 0, dir: outDir() };
    const out = outDir();
    const outScenes = path.join(out, 'scenes');
    fs.mkdirSync(outScenes, { recursive: true });
    writeJson(path.join(out, 'project.json'), V.normalizeProject(project));
    const keep = new Set();
    for (const s of scenes) { writeJson(path.join(outScenes, s.id + '.json'), V.normalizeScene(s)); keep.add(s.id + '.json'); }
    // убрать из сборки сцены, которых больше нет в проекте
    let removed = 0;
    for (const f of fs.readdirSync(outScenes)) if (f.endsWith('.json') && !keep.has(f)) { fs.unlinkSync(path.join(outScenes, f)); removed++; }
    for (const k of ['dialogs', 'quests']) {
      const dir = path.join(out, k);
      fs.mkdirSync(dir, { recursive: true });
      const keepK = new Set();
      for (const d of docs[k]) { writeJson(path.join(dir, d.id + '.json'), KINDS[k].norm(d)); keepK.add(d.id + '.json'); }
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !keepK.has(f)) { fs.unlinkSync(path.join(dir, f)); removed++; }
    }
    writeJson(path.join(out, 'index.json'), { v: 2, built: new Date().toISOString(), scenes: scenes.map((s) => s.id), dialogs: docs.dialogs.map((d) => d.id), quests: docs.quests.map((d) => d.id) });
    return { ok: true, issues, errors: 0, count: scenes.length, dialogs: docs.dialogs.length, quests: docs.quests.length, removed, dir: out };
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
  // фаза 2: открыть диалог у автора, управлять заданием, прочитать переменные из игры
  handle('studio:dialog', (dialog) => write({ t: 'dialog', dialog: V.normalizeDialog(dialog) }));
  handle('studio:quest', ({ op, id, step, quest }) => {
    if (!['start', 'advance', 'complete', 'fail', 'reset', 'status'].includes(op)) throw new Error('Неизвестная команда задания: ' + op);
    const msg = { t: 'quest', op, id };
    if (step) msg.step = step;
    if (quest) msg.quest = V.normalizeQuest(quest);
    return write(msg);
  });
  handle('studio:vars', () => request({ t: 'vars' }, 'vars', 4000));
  handle('studio:setVar', ({ name, value }) => {
    if (!V.isVarName(name)) throw new Error('Имя переменной — латиница, цифры, _ . -');
    return write({ t: 'setVar', name, value });
  });
};
