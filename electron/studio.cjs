// «Студия»: проекты автора на диске (<игра>/studio/projects/<id>, фаза 5 — проект = карта со своим миром),
// сборка для игроков (<игра>/config/kokkstory/studio/<id>) и живая связь с запущенной игрой — TCP, JSON построчно.
const fs = require('fs');
const path = require('path');
const net = require('net');
const V = require('./studio-validate.cjs');
const NBT = require('./nbt.cjs');
const SP = require('./studio-projects.cjs');

const SAFE_ID = /^[a-z0-9_-]{1,64}$/;
const DEFAULT_PORT = 47311;

module.exports = function setupStudio({ handle, send, store, getGame }) {
  const gameDir = () => store.get().gameDir;
  // общая папка Студии: .dev, .link, current, cache/, undo/, projects/
  const sroot = () => path.join(gameDir(), 'studio');
  const savesDir = () => path.join(gameDir(), 'saves');
  // переезд со старого плоского studio/ — один раз на папку игры (и «Примеры» из лаунчера)
  let bootedFor = null;
  function boot() {
    const r = sroot();
    if (bootedFor === r) return;
    bootedFor = r;
    try {
      const m = SP.migrate(r, { lastWorld: store.get().studioWorld || null, examplesSrc: path.join(__dirname, 'assets', 'studio-examples') });
      if (m.migrated) linkLog('ok', 'Студия: проект переехал в studio/projects/default («Мой проект»): ' + m.moved.join(', ') + (m.examples.length ? '; примеры (' + m.examples.length + ') — в проект «Примеры»' : ''));
      else if (m.seeded) linkLog('info', 'Студия: положил проект «Примеры» в studio/projects/examples');
    } catch (e) { linkLog('error', 'Студия: переезд проекта не удался — ' + e.message); }
  }
  const curId = () => { boot(); return SP.readCurrent(sroot()); };
  // папка открытого проекта; без проекта документы недоступны
  function root() {
    const id = curId();
    if (!id) throw new Error('Проект не открыт — открой или создай проект (Файл → Открыть проект)');
    return SP.projectDir(sroot(), id);
  }
  const scenesDir = () => path.join(root(), 'scenes');
  // виды документов проекта: сцены, диалоги, задания — по файлу на штуку
  const KINDS = {
    scenes: { dir: 'scenes', what: 'Сцена', whatGen: 'сцены', clean: (d) => V.cleanScene(d), norm: (d) => V.normalizeScene(d) },
    dialogs: { dir: 'dialogs', what: 'Диалог', whatGen: 'диалога', clean: (d) => V.cleanDoc(d), norm: (d) => V.normalizeDialog(d) },
    quests: { dir: 'quests', what: 'Задание', whatGen: 'задания', clean: (d) => V.cleanDoc(d), norm: (d) => V.normalizeQuest(d) },
    schemes: { dir: 'schemes', what: 'Схема', whatGen: 'схемы', clean: (d) => V.cleanDoc(d), norm: (d) => V.normalizeScheme(d) }
  };
  function kindOf(k) { const d = KINDS[k]; if (!d) throw new Error('Неизвестный вид файлов Студии: ' + k); return d; }
  const kindDir = (k) => path.join(root(), kindOf(k).dir);
  function docFile(k, id) {
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Имя ' + kindOf(k).whatGen + ': только маленькие латинские буквы, цифры, _ и - (например miron_first)');
    return path.join(kindDir(k), String(id) + '.json');
  }
  const projectFile = () => path.join(root(), 'project.json');
  const devFile = () => path.join(sroot(), '.dev');
  const linkFile = () => path.join(sroot(), '.link');
  const entFile = () => path.join(root(), 'entities.json');
  // сборка проекта для игроков: config/kokkstory/studio/<id проекта>/
  const outDir = () => path.join(gameDir(), 'config', 'kokkstory', 'studio', curId() || '_');

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
  const structDir = () => path.join(root(), 'structures');
  function ensure() {
    for (const k of Object.keys(KINDS)) fs.mkdirSync(kindDir(k), { recursive: true });
    fs.mkdirSync(structDir(), { recursive: true });
    if (!fs.existsSync(projectFile())) writeJson(projectFile(), SP.projectDefaults(curId(), 'Проект'));
    if (!fs.existsSync(entFile())) writeJson(entFile(), []);
  }
  function readProject() {
    ensure();
    try { return { ...V.defaultProject(), ...readJson(projectFile()), v: 2, id: curId() }; } catch (e) { throw new Error('project.json не читается: ' + e.message); }
  }
  function readEntities() {
    ensure();
    try { const e = readJson(entFile()); return Array.isArray(e) ? e : e && Array.isArray(e.entities) ? e.entities : []; } catch (e) { throw new Error('entities.json не читается: ' + e.message); }
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
        if (k === 'schemes') { const ns = d.nodes && typeof d.nodes === 'object' ? Object.values(d.nodes) : []; it.nodes = Object.keys(d.nodes || {}); it.enabled = d.enabled !== false; it.events = ns.filter((n) => n && n.type === 'event').map((n) => n.event); const sg = V.schemeSignals(d); it.raised = sg.raised; it.listened = sg.listened; }
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
    quests: (from, to) => (o) => (o.quest === from ? { ...o, quest: to } : o),
    schemes: (from, to) => (o) => (o.scheme === from ? { ...o, scheme: to } : o)
  };

  handle('studio:open', () => {
    const id = curId();
    const base = { studio: sroot(), dev: devOn(), link: status(), projects: SP.listProjects(sroot(), savesDir()), recent: recentIds(), saves: savesDir() };
    if (!id) return { ...base, dir: null, out: null, project: null, projectId: null, scenes: [], dialogs: [], quests: [], schemes: [], structures: [], entities: [] };
    ensure();
    return { ...base, dir: root(), out: outDir(), projectId: id, project: readProject(), scenes: list(), dialogs: listDocs('dialogs'), quests: listDocs('quests'), schemes: listDocs('schemes'), structures: structList(), entities: readEntities(), world: worldOfProject(readProject()) };
  });

  // ---------- фаза 5: проекты ----------
  function recentIds() { const r = store.get().studioRecent; return Array.isArray(r) ? r.filter((x) => SP.isProjectId(x) && fs.existsSync(path.join(SP.projectsDir(sroot()), x, 'project.json'))).slice(0, 8) : []; }
  function touchRecent(id) { store.set({ studioRecent: [id, ...recentIds().filter((x) => x !== id)].slice(0, 8) }); }
  function worldOfProject(p) { return p && p.world && p.world !== '*' ? SP.worldSummary(savesDir(), p.world) : null; }
  // окна Студии перечитываются, когда проект сменили (studio-window.cjs пересылает событие во все окна)
  function emitProject(id) { send('studio-win', { type: 'project', id: id || null }); }
  function tellGameProject() {
    if (!connected) return;
    const id = curId();
    let p = null;
    try { p = id ? readProject() : null; } catch (_) {}
    try { write({ t: 'project', id: id || null, editor: true, name: p ? p.name : null, world: p ? p.world || null : null, dir: id ? SP.projectDir(sroot(), id) : null }); } catch (_) {}
  }
  // мир игры совпадает с миром проекта? (hello.worldDir — папка мира в saves, hello.world — его название)
  function worldMatch(p) {
    if (!p || !p.world || p.world === '*') return { match: true };
    if (!connected || !info) return { match: null };
    if (info.inWorld === false) return { match: false, why: 'Игра в меню — мир не открыт' };
    const folder = info.worldFolder || info.worldDir;
    if (folder) return { match: folder === p.world };
    const w = SP.worldSummary(savesDir(), p.world);
    return { match: !!w && (info.world === w.name || info.world === p.world) };
  }
  handle('studio:projects', () => ({ current: curId(), list: SP.listProjects(sroot(), savesDir()), recent: recentIds(), saves: savesDir() }));
  handle('studio:worldMatch', () => { const id = curId(); let p = null; try { p = id ? readProject() : null; } catch (_) {} return { ...worldMatch(p), world: p && p.world, worldName: (worldOfProject(p) || {}).name || null, game: info ? { world: info.world, worldFolder: info.worldFolder || info.worldDir, inWorld: info.inWorld } : null }; });
  handle('studio:projectOpen', (id) => {
    if (!SP.isProjectId(id) || !fs.existsSync(path.join(SP.projectsDir(sroot()), id, 'project.json'))) throw new Error('Проекта «' + id + '» нет');
    SP.setCurrent(sroot(), id);
    touchRecent(id);
    ensure();
    const p = readProject();
    linkLog('info', 'Открыт проект «' + p.name + '»' + (p.world ? ' (мир ' + p.world + ')' : ''));
    tellGameProject();
    emitProject(id);
    return { project: p, ...worldMatch(p) };
  });
  handle('studio:projectClose', () => {
    SP.setCurrent(sroot(), null);
    tellGameProject();
    emitProject(null);
    return true;
  });
  // новый проект. world: { mode:'new', template:'flat'|'void'|'normal', name, seed?, creative?, rules? }
  //                     | { mode:'copy', from, name }  | { mode:'existing', folder, copy:true|false }  | { mode:'none' }
  handle('studio:projectCreate', ({ name, note, world }) => {
    boot();
    const nm = String(name || '').trim();
    if (!nm) throw new Error('Назови проект');
    const w = world || { mode: 'none' };
    let folder = null;
    const saves = savesDir();
    if (w.mode === 'new') {
      if (!['flat', 'void', 'normal'].includes(w.template)) throw new Error('Неизвестный шаблон мира: ' + w.template);
      folder = SP.createWorld(saves, { name: w.name || nm, template: w.template, seed: w.seed, creative: w.creative !== false, cheats: true, rules: w.rules || {} });
    } else if (w.mode === 'copy' || (w.mode === 'existing' && w.copy !== false)) {
      const src = String(w.from || w.folder || '');
      if (!src || /[\\/]/.test(src)) throw new Error('Выбери мир');
      folder = SP.copyWorld(saves, src, w.name || nm);
    } else if (w.mode === 'existing') {
      const src = String(w.folder || '');
      if (!src || /[\\/]/.test(src) || !fs.existsSync(path.join(saves, src, 'level.dat'))) throw new Error('Мир «' + src + '» не найден в saves');
      folder = src;
    }
    const p = SP.createProject(sroot(), { name: nm, note, world: folder });
    // метка проекта в папке мира: игра при старте мира берёт её в SavedData kokkstory_studio
    if (folder) { try { fs.writeFileSync(path.join(saves, folder, 'kokkstory_project.txt'), p.id + '\n'); } catch (_) {} }
    SP.setCurrent(sroot(), p.id);
    touchRecent(p.id);
    linkLog('ok', 'Создан проект «' + p.name + '»' + (folder ? ', мир saves/' + folder : ''));
    tellGameProject();
    emitProject(p.id);
    return { project: p, world: folder };
  });
  // «Открыть мир проекта»: игра уходит в меню и загружает мир проекта; без связи — запуск через лаунчер (quickPlay)
  handle('studio:openProjectWorld', () => {
    const p = readProject();
    if (!p.world || p.world === '*') throw new Error('У проекта нет своего мира');
    if (!fs.existsSync(path.join(savesDir(), p.world, 'level.dat'))) throw new Error('Мира «' + p.world + '» нет в saves');
    if (connected) { write({ t: 'openWorld', world: p.world, project: p.id }); return { sent: true }; }
    return { sent: false, world: p.world };
  });
  // ---------- сущности мира (entities.json) ----------
  handle('studio:entities', () => readEntities());
  handle('studio:entitiesSave', (list) => {
    if (!Array.isArray(list)) throw new Error('Сущности — список');
    const clean = V.cleanEntities(list);
    writeJson(entFile(), clean);
    return { mtime: fs.statSync(entFile()).mtimeMs, count: clean.length };
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
      if (c.type === 'event' && c.event === 'var' && c.name === from) c = { ...c, name: to };
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
          if (o.type === 'event' && o.event === 'var') note(o.name, k, d);
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
    if (data && typeof data === 'object') writeJson(projectFile(), V.cleanProject({ ...V.defaultProject(), ...data, v: 2, id: curId() }));
    return readProject();
  });
  handle('studio:devMode', (on) => {
    fs.mkdirSync(sroot(), { recursive: true });
    if (on === true) fs.writeFileSync(devFile(), 'Режим разработчика Студии: игра читает сцены прямо из этой папки и открывает связь с лаунчером.\nУдали файл (или выключи переключатель в лаунчере), чтобы выключить.\n');
    else if (on === false && fs.existsSync(devFile())) fs.unlinkSync(devFile());
    return devOn();
  });
  // тестовые миры для вкладки «Старт»: одиночные миры из <игра>/saves (имя из level.dat, когда играли, значок icon.png)
  function worldInfo(saves, folder) {
    const dir = path.join(saves, folder);
    const lvl = path.join(dir, 'level.dat');
    let name = folder, lastPlayed = 0, mode = null;
    try { lastPlayed = fs.statSync(lvl).mtimeMs; } catch (_) {}
    try {
      const root = NBT.readNbt(fs.readFileSync(lvl));
      const d = (root && root.Data) || {};
      if (typeof d.LevelName === 'string' && d.LevelName.trim()) name = d.LevelName.trim();
      if (typeof d.LastPlayed === 'number' && d.LastPlayed > 0) lastPlayed = d.LastPlayed;
      if (typeof d.GameType === 'number') mode = ['survival', 'creative', 'adventure', 'spectator'][d.GameType] || null;
    } catch (_) {}
    let icon = null;
    try { const f = path.join(dir, 'icon.png'); if (fs.statSync(f).size < 400000) icon = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'); } catch (_) {}
    return { folder, name, lastPlayed, mode, icon };
  }
  handle('studio:worlds', () => {
    const saves = path.join(gameDir(), 'saves');
    let names = [];
    try { names = fs.readdirSync(saves, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(saves, e.name, 'level.dat'))).map((e) => e.name); } catch (_) {}
    const worlds = names.map((n) => worldInfo(saves, n)).sort((a, b) => b.lastPlayed - a.lastPlayed);
    return { worlds, selected: store.get().studioWorld || null, saves };
  });
  handle('studio:setWorld', (folder) => {
    const v = folder == null ? null : String(folder);
    if (v && (/[\\/]/.test(v) || v === '.' || v === '..')) throw new Error('Неверное имя папки мира');
    store.set({ studioWorld: v });
    return v;
  });
  handle('studio:build', () => {
    const project = readProject();
    const docs = { dialogs: [], quests: [], schemes: [] };
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
    const KIND1 = { dialogs: 'dialog', quests: 'quest', schemes: 'scheme' };
    for (const k of ['dialogs', 'quests', 'schemes']) {
      for (const it of listDocs(k)) {
        try {
          const d = readJson(docFile(k, it.id));
          if (d.id && d.id !== it.id) issues.push({ sev: V.WARN, kind: KIND1[k], doc: it.id, sel: null, msg: 'Файл ' + it.id + '.json, а внутри id «' + d.id + '» — при сборке берётся имя файла' });
          d.id = it.id;
          docs[k].push(d);
        } catch (e) { issues.push({ sev: V.ERR, kind: KIND1[k], doc: it.id, sel: null, msg: 'Файл не читается: ' + e.message }); }
      }
    }
    issues.push(...V.validateProject(project, scenes, { dialogs: docs.dialogs, quests: docs.quests }));
    // схемы: ссылки на сцены/диалоги/задания/постройки и сигналы между схемами
    const structs = structList();
    const sigs = { raised: new Set(), listened: new Set() };
    for (const d of docs.schemes) { const sg = V.schemeSignals(d); sg.raised.forEach((x) => sigs.raised.add(x)); sg.listened.forEach((x) => sigs.listened.add(x)); }
    const sctx = {
      project, ids: docs.schemes.map((d) => d.id), scenes: scenes.map((s) => s.id), schemes: docs.schemes.map((d) => d.id), structures: structs.map((x) => x.id), signals: sigs,
      dialogs: docs.dialogs.map((d) => ({ id: d.id, nodes: Object.keys(d.nodes || {}) })), quests: docs.quests.map((q) => ({ id: q.id, steps: (q.steps || []).map((x) => x && x.id) }))
    };
    for (const d of docs.schemes) issues.push(...V.validateScheme(d, sctx));
    // сущности мира и их выходы
    let ents = [];
    try { ents = readEntities(); } catch (e) { issues.push({ sev: V.ERR, kind: 'entity', doc: 'entities.json', sel: null, msg: e.message }); }
    issues.push(...V.validateEntities(ents, { scenes: scenes.map((s) => s.id), quests: docs.quests.map((d) => d.id), schemes: docs.schemes.map((d) => d.id), dialogs: docs.dialogs.map((d) => d.id), structures: structs.map((x) => x.id), vars: (project.vars || []).map((v) => v && v.name) }).map((x) => ({ ...x, doc: x.ent || 'entities.json' })));
    const errors = issues.filter((i) => i.sev === V.ERR).length;
    if (errors) return { ok: false, issues, errors, count: 0, dialogs: 0, quests: 0, schemes: 0, structures: 0, entities: 0, dir: outDir() };
    const out = outDir();
    const outScenes = path.join(out, 'scenes');
    fs.mkdirSync(outScenes, { recursive: true });
    writeJson(path.join(out, 'project.json'), V.normalizeProject({ ...project, v: 2, id: curId() }));
    writeJson(path.join(out, 'entities.json'), V.cleanEntities(ents));
    const keep = new Set();
    for (const s of scenes) { writeJson(path.join(outScenes, s.id + '.json'), V.normalizeScene(s)); keep.add(s.id + '.json'); }
    // убрать из сборки сцены, которых больше нет в проекте
    let removed = 0;
    for (const f of fs.readdirSync(outScenes)) if (f.endsWith('.json') && !keep.has(f)) { fs.unlinkSync(path.join(outScenes, f)); removed++; }
    for (const k of ['dialogs', 'quests', 'schemes']) {
      const dir = path.join(out, k);
      fs.mkdirSync(dir, { recursive: true });
      const keepK = new Set();
      for (const d of docs[k]) { writeJson(path.join(dir, d.id + '.json'), KINDS[k].norm(d)); keepK.add(d.id + '.json'); }
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !keepK.has(f)) { fs.unlinkSync(path.join(dir, f)); removed++; }
    }
    // постройки: .nbt (+ .json с описанием) как есть
    const sOut = path.join(out, 'structures');
    fs.mkdirSync(sOut, { recursive: true });
    const keepS = new Set();
    for (const st of structs) {
      for (const ext of ['.nbt', '.json']) {
        const src = path.join(structDir(), st.id + ext);
        if (!fs.existsSync(src)) continue;
        fs.copyFileSync(src, path.join(sOut, st.id + ext));
        keepS.add(st.id + ext);
      }
    }
    for (const f of fs.readdirSync(sOut)) if (/\.(nbt|json)$/.test(f) && !keepS.has(f)) { fs.unlinkSync(path.join(sOut, f)); removed++; }
    writeJson(path.join(out, 'index.json'), { v: 5, project: curId(), name: project.name, world: project.world || null, built: new Date().toISOString(), scenes: scenes.map((s) => s.id), dialogs: docs.dialogs.map((d) => d.id), quests: docs.quests.map((d) => d.id), schemes: docs.schemes.map((d) => d.id), structures: structs.map((x) => x.id), entities: ents.length });
    return { ok: true, issues, errors: 0, count: scenes.length, dialogs: docs.dialogs.length, quests: docs.quests.length, schemes: docs.schemes.length, structures: structs.length, entities: ents.length, removed, dir: out, project: curId() };
  });

  // ---------- живая связь с игрой (фаза 5: надёжная) ----------
  // Окно Студии держит связь всё время, пока открыто (holders). Попытка — раз в 2 с: порт из studio/.link ({port,pid,ver},
  // его пишет игра), затем порт из настроек (и +1…+4, если .link нет); адреса 127.0.0.1 и localhost.
  // Игра шлёт {t:'ping'} раз в 5 с; 15 с тишины после первого пульса — связь мёртвая, переподключаемся.
  let want = false;
  let sock = null;
  let connected = false;
  let info = null;
  let timer = null;
  let buf = '';
  let waiters = [];
  let busyTry = false;
  const ls = { reason: 'idle', text: 'Связь не нужна — Студия закрыта', attempts: 0, host: null, port: null, pingSeen: false, lastMsg: 0, helloAt: 0, heartbeat: 'unknown', lastLogText: '' };
  const port = () => Number(store.get().studioPort) || DEFAULT_PORT;
  function status() { return { connected, info, port: ls.port || port(), want, reason: ls.reason, text: ls.text, attempts: ls.attempts, host: ls.host, heartbeat: ls.heartbeat }; }
  function emitState() { send('studio-link', { type: 'state', ...status() }); }
  // строка в «Журнал» окна Студии (одинаковые подряд окно склеивает)
  function linkLog(level, text) { send('studio-link', { type: 'log', level, text }); }
  function setReason(reason, text, level) {
    const changed = ls.reason !== reason || ls.text !== text;
    ls.reason = reason; ls.text = text;
    if (changed) emitState();
    if (level) linkLog(level, text);
  }
  function failWaiters(msg) { const w = waiters; waiters = []; w.forEach((x) => { clearTimeout(x.timer); x.reject(new Error(msg)); }); }
  function schedule(ms) {
    clearTimeout(timer);
    if (want && !sock) timer = setTimeout(attempt, ms == null ? 2000 : ms);
  }
  function write(msg) {
    if (!sock || !connected) throw new Error('Нет связи с игрой: ' + (ls.text || 'запусти игру с режимом разработчика'));
    sock.write(JSON.stringify(msg) + '\n');
    return true;
  }
  function readLinkFile() {
    try { const j = JSON.parse(fs.readFileSync(linkFile(), 'utf8')); return j && Number(j.port) > 0 ? j : null; } catch (_) { return null; }
  }
  function pidAlive(pid) { if (!(Number(pid) > 0)) return false; try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; } }
  function gameRunning(lf) { return !!(getGame && getGame()) || !!(lf && pidAlive(lf.pid)); }
  // одна попытка TCP: { ok, socket } или { ok:false, code }
  function tryOne(host, p) {
    return new Promise((resolve) => {
      const s = net.createConnection({ host, port: p });
      let done = false;
      const fin = (r) => { if (done) return; done = true; clearTimeout(to); s.removeAllListeners('error'); s.removeAllListeners('connect'); if (!r.ok) s.destroy(); resolve(r); };
      const to = setTimeout(() => fin({ ok: false, code: 'ETIMEDOUT' }), 1500);
      s.once('connect', () => fin({ ok: true, socket: s }));
      s.once('error', (e) => fin({ ok: false, code: e.code || e.message }));
    });
  }
  const CODE_RU = { ECONNREFUSED: 'отказ', ETIMEDOUT: 'нет ответа', EADDRNOTAVAIL: 'адрес недоступен', ENOTFOUND: 'имя не найдено', EACCES: 'доступ запрещён', ECONNRESET: 'сброс' };
  async function attempt() {
    if (!want || sock || busyTry) return;
    busyTry = true;
    try {
      ls.attempts++;
      const lf = readLinkFile();
      const ports = [];
      if (lf && (!lf.pid || pidAlive(lf.pid))) ports.push(Number(lf.port));
      ports.push(port());
      if (!lf && ls.attempts % 3 === 0) for (let k = 1; k <= 4; k++) ports.push(port() + k);
      const tried = [];
      const hosts = [...new Set([lf && typeof lf.host === 'string' && /^[\w.:-]+$/.test(lf.host) ? lf.host : null, '127.0.0.1', 'localhost'].filter(Boolean))];
      for (const p of [...new Set(ports)]) {
        for (const host of hosts) {
          const r = await tryOne(host, p);
          if (!want) { if (r.socket) r.socket.destroy(); return; }
          if (r.ok) { linkLog('info', 'Связь: попытка ' + ls.attempts + ' — ' + host + ':' + p + ' ответил, жду «hello» от игры'); adopt(r.socket, host, p); return; }
          tried.push(host + ':' + p + ' — ' + (CODE_RU[r.code] || r.code));
        }
      }
      // почему не вышло — по обстановке
      const running = gameRunning(lf);
      const g = getGame && getGame();
      let devAt = 0;
      try { devAt = fs.statSync(devFile()).mtimeMs; } catch (_) {}
      const timeouts = tried.length && tried.every((x) => x.endsWith('нет ответа'));
      let reason, text;
      if (!running) { reason = 'no-game'; text = 'Игра не запущена'; }
      else if (!devAt) { reason = 'no-dev'; text = 'Игра без режима разработчика: нет файла studio/.dev — включи режим (кнопка ниже) и перезапусти игру'; }
      else if (g && g.started && devAt > g.started) { reason = 'dev-late'; text = 'Режим разработчика включён после запуска игры — подожди пару секунд (новый мод подхватит сам) или перезапусти игру'; }
      else if (timeouts) { reason = 'timeout'; text = 'Порт ' + (lf ? lf.port : port()) + ' не отвечает — похоже на брандмауэр Windows'; }
      else if (!lf && g && g.started && Date.now() - g.started > 120000) { reason = 'old-mod'; text = 'Отказ соединения: игра не открыла связь (нет studio/.link) — старая версия мода Kokk Story или порт ' + port() + ' занят'; }
      else { reason = 'refused'; text = 'Отказ соединения (' + (lf ? 'порт ' + lf.port + ' из .link' : 'порт ' + port()) + ') — игра ещё грузится или связь не открылась'; }
      ls.port = lf ? Number(lf.port) : port(); ls.host = null;
      setReason(reason, text);
      // в журнал — каждая попытка (окно склеивает одинаковые строки в «×N»)
      linkLog(reason === 'no-game' ? 'info' : 'warn', 'Связь: попытка ' + ls.attempts + ' — ' + tried.join('; ') + ' → ' + text);
      schedule(2000);
    } finally { busyTry = false; }
  }
  function adopt(s, host, p) {
    sock = s; connected = false; buf = '';
    ls.host = host; ls.port = p; ls.pingSeen = false; ls.lastMsg = Date.now(); ls.heartbeat = 'unknown';
    s.setEncoding('utf8');
    s.setNoDelay(true);
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
      clearTimeout(helloTimer);
      failWaiters('Связь с игрой пропала');
      if (ls.reason !== 'dead' && ls.reason !== 'busy') setReason('closed', was ? 'Игра закрыла связь (вышла из мира, закрылась или перезапускается)' : 'Соединение закрылось до «hello»', was ? 'warn' : 'warn');
      else emitState();
      schedule(was ? 800 : 2000);
    });
    try { s.write(JSON.stringify({ t: 'hello', from: 'launcher', proto: 5 }) + '\n'); } catch (_) {}
    clearTimeout(helloTimer);
    helloTimer = setTimeout(() => {
      if (sock === s && !connected) { setReason('busy', 'Порт ' + p + ' занят другой программой: она не ответила как игра', 'error'); s.destroy(); }
    }, 4000);
  }
  let helloTimer = null;
  function onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    ls.lastMsg = Date.now();
    if (msg.t === 'pong') return;
    if (msg.t === 'ping') {
      if (info) { info = { ...info, inWorld: msg.inWorld, editor: msg.editor, playing: msg.playing, project: msg.project }; }
      if (!ls.pingSeen) { ls.pingSeen = true; ls.heartbeat = 'ok'; emitState(); }
      send('studio-link', { type: 'msg', msg });
      return;
    }
    if (msg.t === 'hello') {
      const first = !connected;
      const oldWorld = info && (info.worldDir || info.world);
      info = msg;
      if (first) {
        connected = true; ls.helloAt = Date.now(); clearTimeout(helloTimer);
        setReason('ok', 'Игра на связи' + (msg.world ? ' · ' + msg.world : '') + ' (' + ls.host + ':' + ls.port + ', мод ' + (msg.ver || '?') + ')', 'ok');
        tellGameProject();
      } else {
        if ((msg.worldDir || msg.world) !== oldWorld) linkLog('info', 'Игра: мир — ' + (msg.world || 'меню'));
        emitState();
      }
      if (!first) msg.refresh = true;
    }
    const match = (w) => (w.pred ? w.pred(msg) : w.type === msg.t);
    const hit = waiters.filter(match);
    if (hit.length) { waiters = waiters.filter((w) => !match(w)); hit.forEach((w) => { clearTimeout(w.timer); w.resolve(msg); }); }
    send('studio-link', { type: 'msg', msg });
  }
  // сторож: пульс, обновление «hello» (мир мог смениться)
  let helloPoll = 0;
  setInterval(() => {
    if (!sock || !connected) return;
    const now = Date.now();
    if (ls.pingSeen && now - ls.lastMsg > 15000) {
      setReason('dead', 'Игра перестала отвечать (15 с без пульса) — переподключаюсь', 'error');
      const s = sock; sock = null; connected = false; info = null; failWaiters('Игра не отвечает'); s.destroy(); emitState(); schedule(500);
      return;
    }
    if (!ls.pingSeen && ls.heartbeat !== 'old' && now - ls.helloAt > 16000) {
      ls.heartbeat = 'old';
      linkLog('warn', 'Игра не шлёт пульс ({t:\'ping\'}) — похоже, старая версия мода Kokk Story: связь работает, но обрыв замечу только по закрытию');
      emitState();
    }
    // свой пульс (игра фазы 5 отвечает pong); старой игре не шлём — она пишет «не знаю сообщения»
    if (info && Number(info.proto) >= 5 && helloPoll % 2 === 0) { try { sock.write('{"t":"ping"}\n'); } catch (_) {} }
    if (++helloPoll % 4 === 0) { try { sock.write(JSON.stringify({ t: 'hello', from: 'launcher', proto: 5, refresh: true }) + '\n'); } catch (_) {} }
  }, 2500).unref();
  // ждать сообщение игры, подходящее под условие (без отправки)
  function waitMsg(pred, ms) {
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, reject };
      w.timer = setTimeout(() => { waiters = waiters.filter((x) => x !== w); reject(new Error('Игра не ответила за ' + Math.round(ms / 1000) + ' с')); }, ms);
      waiters.push(w);
    });
  }
  function request(msg, type, ms = 3000) {
    if (msg) write(msg); else if (!sock || !connected) throw new Error('Нет связи с игрой');
    return new Promise((resolve, reject) => {
      const w = { type, resolve, reject };
      w.timer = setTimeout(() => { waiters = waiters.filter((x) => x !== w); reject(new Error('Игра не ответила за ' + Math.round(ms / 1000) + ' с')); }, ms);
      waiters.push(w);
    });
  }

  // связь держат открытой «держатели»: окно Студии ('studio-window' — из главного процесса, пока окно открыто),
  // его вкладки и старая вкладка «Студия» в лаунчере ('tab')
  const holders = new Set();
  function hold(key, on) {
    const was = want;
    if (on) holders.add(key); else holders.delete(key);
    want = holders.size > 0;
    if (want && !was) { ls.attempts = 0; setReason('connecting', 'Ищу игру…'); clearTimeout(timer); attempt(); }
    else if (!want && was) {
      clearTimeout(timer);
      if (sock) { const s = sock; sock = null; connected = false; info = null; failWaiters('Студия закрыта'); s.destroy(); }
      setReason('idle', 'Связь не нужна — Студия закрыта');
    }
    return status();
  }
  handle('studio:link', (on, who) => {
    const k = typeof who === 'string' && who ? who : 'tab';
    hold(k, !!on);
    emitState();
    return status();
  });
  handle('studio:linkState', () => status());
  // «Переподключить»: бросить текущее и сразу попробовать снова
  handle('studio:reconnect', () => {
    if (!want) hold('tab-reconnect', true);
    clearTimeout(timer);
    if (sock) { const s = sock; sock = null; connected = false; info = null; failWaiters('Переподключаюсь'); s.destroy(); }
    ls.attempts = 0;
    setReason('connecting', 'Переподключаюсь…', 'info');
    attempt();
    return status();
  });
  handle('studio:setPort', (p) => {
    const n = Math.floor(Number(p));
    if (!(n > 1023 && n < 65536)) throw new Error('Порт — число от 1024 до 65535');
    store.set({ studioPort: n });
    if (sock) sock.destroy(); else if (want) { clearTimeout(timer); attempt(); }
    return status();
  });
  // ▶ Играть (F5) / ▶ с камеры (Shift+F5) / ■ Стоп: игра отвечает {t:'playtest', state:'playing'|'stopped'|'error', …}
  handle('studio:playtest', ({ on, from, pos, yaw, pitch }) => {
    if (!on) return write({ t: 'playtestStop' });
    const m = { t: 'playtest', from: from === 'camera' ? 'camera' : 'start' };
    if (Array.isArray(pos)) { m.pos = pos; if (typeof yaw === 'number') m.yaw = yaw; if (typeof pitch === 'number') m.pitch = pitch; }
    return write(m);
  });
  handle('studio:editor', (on) => write({ t: 'editor', on: !!on }));
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
  // ---------- фаза 3: редактор в игре, клонеры ----------
  // шейдеры: игра отвечает {t:'shaders', on, available}
  handle('studio:shaders', (on) => request({ t: 'shaders', on: !!on }, 'shaders', 4000));
  // призрачные блоки клонера: { id, placements } (не больше 20000), пустые placements — убрать призрак
  handle('studio:ghost', ({ id, placements }) => {
    if (!id) return write({ t: 'ghostClear' });
    if (!Array.isArray(placements) || !placements.length) return write({ t: 'ghost', id: String(id), placements: [] });
    return write({ t: 'ghost', id: String(id), placements: placements.slice(0, V.MAX_SEND) });
  });
  // «Запечь в мир»: игра ставит блоки по тикам и шлёт {t:'bake', undoId, state:'progress'|'done'|'error', done, total}
  handle('studio:bake', ({ id, placements, undoId, replace }) => {
    if (!Array.isArray(placements) || !placements.length) throw new Error('Клонер ничего не создаёт — запекать нечего');
    const u = String(undoId || ('bake_' + Date.now().toString(36)));
    const msg = { t: 'bake', id: String(id || ''), placements: placements.slice(0, V.MAX_SEND), undoId: u };
    if (replace === false) msg.replace = false;
    write(msg);
    return { sent: true, undoId: u, count: msg.placements.length };
  });
  // «Отменить запекание»: игра отвечает {t:'undo', undoId, state:'progress'|'done'|'error', …}
  handle('studio:undoBake', (undoId) => {
    if (!undoId) throw new Error('Нечего отменять');
    write({ t: 'undo', undoId: String(undoId) });
    return { sent: true, undoId };
  });
  // список запечек, которые игра может отменить: ответ {t:'undoList', items:[…]}
  handle('studio:undoList', () => request({ t: 'undoList' }, 'undoList', 4000));
  handle('studio:setVar', ({ name, value }) => {
    if (!V.isVarName(name)) throw new Error('Имя переменной — латиница, цифры, _ . -');
    return write({ t: 'setVar', name, value });
  });

  // ---------- фаза 4: «Схемы» ----------
  handle('studio:scheme', (scheme) => write({ t: 'scheme', scheme: V.normalizeScheme(scheme) }));
  // запустить событие вручную: { id, node?, ctx? } — игра шлёт {t:'trace', …} по шагам, если трассировка включена
  handle('studio:schemeFire', ({ id, node, ctx }) => { const m = { t: 'schemeFire', id: String(id) }; if (node) m.node = String(node); if (ctx && typeof ctx === 'object') m.ctx = ctx; return write(m); });
  handle('studio:schemeTrace', ({ on, chat }) => { const m = { t: 'schemeTrace', on: !!on }; if (chat !== undefined) m.chat = !!chat; return write(m); });
  // состояние схем в игре: {t:'schemes', items:[{ id, title, enabled, ok, errors, running, source, problems }]}
  handle('studio:schemes', () => request({ t: 'schemes' }, 'schemes', 4000));
  handle('studio:schemeEnable', ({ id, on }) => write({ t: 'schemeEnable', id: String(id), on: !!on }));
  // ---------- фаза 4: «Строительство» ----------
  // палитра блоков игры: {t:'blocks', ids:[…], colors:{id:[r,g,b]}, flags?:{id:'tge'}} — первый раз считается долго
  handle('studio:blocks', () => request({ t: 'blocks' }, 'blocks', 30000));
  // библиотека построек: studio/structures/<id>.nbt (+ <id>.json описание, <id>.png картинка сверху)
  function structList() {
    const dir = structDir();
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.nbt')) continue;
      const id = f.slice(0, -4);
      if (!SAFE_ID.test(id)) continue;
      let meta = {};
      try { meta = readJson(path.join(dir, id + '.json')); } catch (_) {}
      let mtime = 0;
      try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch (_) {}
      out.push({ ...meta, id, name: meta.name || id, mtime, png: fs.existsSync(path.join(dir, id + '.png')) });
    }
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  }
  handle('studio:structList', () => { ensure(); return structList(); });
  handle('studio:structPng', (id) => {
    if (!SAFE_ID.test(String(id || ''))) return null;
    const f = path.join(structDir(), id + '.png');
    return fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null;
  });
  // сохранить постройку из Студии (3D-модель → блоки): { id, name, size, palette, blocks:[x,y,z,p,…], png?, source?, counts? }
  handle('studio:structSave', ({ id, name, size, palette, blocks, png, source, counts, overwrite, preview }) => {
    ensure();
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Имя постройки: только маленькие латинские буквы, цифры, _ и -');
    if (!Array.isArray(size) || size.length !== 3 || size.some((v) => !(v > 0 && v <= 512))) throw new Error('Размер постройки — от 1 до 512 по каждой оси');
    if (!Array.isArray(palette) || !palette.length) throw new Error('Пустая палитра');
    const arr = blocks && blocks.length !== undefined ? blocks : [];
    const f = path.join(structDir(), id + '.nbt');
    if (!overwrite && fs.existsSync(f)) throw new Error('Постройка «' + id + '» уже есть — выбери другое имя');
    fs.writeFileSync(f, NBT.structureNbt({ size, palette, blocks: arr }));
    const cnt = {};
    if (counts && typeof counts === 'object') Object.assign(cnt, counts);
    else for (let i = 3; i < arr.length; i += 4) { const b = palette[arr[i]]; cnt[b] = (cnt[b] || 0) + 1; }
    const meta = { v: 1, id, name: String(name || id).slice(0, 80), size, blocks: Math.floor(arr.length / 4), entities: 0, palette: cnt, source: source || 'studio', created: new Date().toISOString() };
    if (preview && typeof preview === 'object' && preview.w > 0 && typeof preview.rgb === 'string') meta.preview = preview;
    writeJson(path.join(structDir(), id + '.json'), meta);
    if (typeof png === 'string' && png.startsWith('data:image/png;base64,')) fs.writeFileSync(path.join(structDir(), id + '.png'), Buffer.from(png.slice(22), 'base64'));
    return { id, file: f };
  });
  handle('studio:structDelete', (id) => {
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Неверное имя постройки');
    const trash = path.join(root(), '.trash', 'structures');
    fs.mkdirSync(trash, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const ext of ['.nbt', '.json', '.png']) { const f = path.join(structDir(), id + ext); if (fs.existsSync(f)) fs.renameSync(f, path.join(trash, id + '-' + stamp + ext)); }
    return true;
  });
  handle('studio:structRename', ({ id, name }) => {
    if (!SAFE_ID.test(String(id || ''))) throw new Error('Неверное имя постройки');
    const f = path.join(structDir(), id + '.json');
    let meta = { v: 1, id };
    try { meta = readJson(f); } catch (_) {}
    writeJson(f, { ...meta, name: String(name || id).slice(0, 80) });
    return true;
  });
  // Большие объёмы блоков (3D-модели, до ~200 000): шлём частями по порядку и ждём подтверждения каждой части, кроме последней.
  // { t:'ghostChunk'|'bakeChunk', id, seq (с 0), last, placements:[{ pos, block }], undoId?, replace? }
  // игра: { t, id, seq, ok, got } на каждую не последнюю часть; на последнюю — обычный ghost / bake.
  // Из окна приходит компактно: origin + palette + blocks [dx,dy,dz,p, …] — здесь разворачиваем в размещения.
  const CHUNK = 8000;
  const streams = new Map(); // id → номер текущей отправки (новая отправка того же id обрывает старую)
  async function stream(kind, { id, origin, palette, blocks, undoId, replace }) {
    const arr = blocks && blocks.length !== undefined ? blocks : [];
    const n = Math.floor(arr.length / 4);
    if (!Array.isArray(palette) || !n) throw new Error('Нечего отправлять');
    const o = (origin || [0, 0, 0]).map((v) => Math.floor(v));
    const parts = Math.max(1, Math.ceil(n / CHUNK));
    const sid = String(id || 'vox');
    const my = (streams.get(sid) || 0) + 1;
    streams.set(sid, my);
    const u = kind === 'bakeChunk' ? String(undoId || ('bake_' + Date.now().toString(36))) : null;
    for (let seq = 0; seq < parts; seq++) {
      if (streams.get(sid) !== my) return { sent: false, cancelled: true };
      const a = seq * CHUNK, b = Math.min(n, a + CHUNK);
      const placements = new Array(b - a);
      for (let i = a; i < b; i++) placements[i - a] = { pos: [o[0] + arr[i * 4], o[1] + arr[i * 4 + 1], o[2] + arr[i * 4 + 2]], block: palette[arr[i * 4 + 3]] };
      const last = seq === parts - 1;
      const m = { t: kind, id: sid, seq, last, placements };
      if (u) m.undoId = u;
      if (u && seq === 0 && replace === false) m.replace = false;
      const ack = last ? null : waitMsg((x) => x && x.t === kind && x.id === sid && x.seq === seq, 20000);
      write(m);
      if (ack) {
        const r = await ack;
        if (r.ok === false) throw new Error('Игра не приняла часть ' + (seq + 1) + ' из ' + parts + ': ' + (r.error || '?'));
      }
    }
    return { sent: true, parts, count: n, undoId: u };
  }
  handle('studio:ghostStream', (a) => stream('ghostChunk', a || {}));
  handle('studio:bakeStream', (a) => stream('bakeChunk', a || {}));

  return { info: () => info, status, write: (m) => write(m), hold };
};
