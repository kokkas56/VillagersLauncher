// «Студия Кокка», фаза 5: проекты (как карты в Hammer). Чистая работа с файлами — без Electron, чтобы проверять тестами.
//
// Раскладка:
//   <игра>/studio/.dev, .link, cache/, undo/   — общее (как раньше)
//   <игра>/studio/current                      — текст: id открытого проекта
//   <игра>/studio/projects/<id>/project.json   — { v:2, id, name, world, start:{pos,yaw,pitch,dim}, created, note, play, …поля v1 }
//   <игра>/studio/projects/<id>/scenes|dialogs|quests|schemes|structures/, entities.json
// Старый плоский studio/ переезжает в projects/default («Мой проект»), примеры (id example_*) — в projects/examples («Примеры»).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NBT = require('./nbt.cjs');

const SAFE_ID = /^[a-z0-9_-]{1,64}$/;
const DOC_DIRS = ['scenes', 'dialogs', 'quests', 'schemes'];
// что лежало в плоском studio/ и относится к проекту (остальное — .dev, .link, cache, undo — остаётся общим)
const FLAT_ITEMS = ['project.json', 'entities.json', 'scenes', 'dialogs', 'quests', 'schemes', 'structures', 'logic', 'ai', '.trash'];
const EXAMPLES_ID = 'examples';
const DEFAULT_ID = 'default';

function isProjectId(id) { return typeof id === 'string' && SAFE_ID.test(id); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
const projectsDir = (root) => path.join(root, 'projects');
const projectDir = (root, id) => { if (!isProjectId(id)) throw new Error('Имя проекта: только маленькие латинские буквы, цифры, _ и -'); return path.join(projectsDir(root), id); };

// перенос: rename, а если не вышло (другой диск, занято) — копия и удаление
function moveAny(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) {
    // папка уже есть — переносим содержимое по одному
    if (fs.statSync(src).isDirectory() && fs.statSync(dst).isDirectory()) {
      for (const n of fs.readdirSync(src)) moveAny(path.join(src, n), uniquePath(path.join(dst, n)));
      fs.rmSync(src, { recursive: true, force: true });
      return;
    }
    dst = uniquePath(dst);
  }
  try { fs.renameSync(src, dst); } catch (_) { copyAny(src, dst); fs.rmSync(src, { recursive: true, force: true }); }
}
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  let n = 2;
  while (fs.existsSync(base + '-' + n + ext)) n++;
  return base + '-' + n + ext;
}
// копия папки (работает и из asar: только readdir/readFile/writeFile)
function copyAny(src, dst, skip) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const n of fs.readdirSync(src)) { if (skip && skip(n)) continue; copyAny(path.join(src, n), path.join(dst, n), skip); }
  } else fs.writeFileSync(dst, fs.readFileSync(src));
}

// ---------- открытый проект ----------
function readCurrent(root) {
  try {
    const id = fs.readFileSync(path.join(root, 'current'), 'utf8').trim();
    if (isProjectId(id) && fs.existsSync(path.join(projectsDir(root), id, 'project.json'))) return id;
  } catch (_) {}
  return null;
}
function setCurrent(root, id) {
  const f = path.join(root, 'current');
  if (!id) { try { fs.unlinkSync(f); } catch (_) {} return null; }
  projectDir(root, id);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(f, id);
  return id;
}

// project.json проекта v2 (поля v1 — actors, vars, templates, talkPriority, ui, schemes — сохраняются)
function projectDefaults(id, name) {
  return { v: 2, id, name: name || 'Проект', world: null, start: null, created: new Date().toISOString(), note: '', actors: [], vars: [], templates: [], talkPriority: 0, ui: { hud: true, markers: true, chat: false }, play: { time: null, weather: null, gamerules: {}, immortal: false, deathStops: true, deathStopTicks: 20 } };
}
function readProject(root, id) {
  const f = path.join(projectDir(root, id), 'project.json');
  const p = readJson(f);
  return { ...projectDefaults(id, p.name), ...p, v: 2, id };
}
function ensureProjectDirs(dir) {
  for (const k of [...DOC_DIRS, 'structures']) fs.mkdirSync(path.join(dir, k), { recursive: true });
  if (!fs.existsSync(path.join(dir, 'entities.json'))) writeJson(path.join(dir, 'entities.json'), []);
}

// ---------- переезд со старого плоского studio/ ----------
// opts: { lastWorld: папка мира, где автор тестировал (studioWorld в настройках), examplesSrc: папка с примерами из лаунчера }
// Возвращает { migrated, moved: [...], examples: [...], seeded } — что сделано (для журнала).
function migrate(root, opts = {}) {
  const out = { migrated: false, moved: [], examples: [], seeded: false };
  fs.mkdirSync(root, { recursive: true });
  const pdir = projectsDir(root);
  const flat = FLAT_ITEMS.filter((n) => fs.existsSync(path.join(root, n)));
  // переезжаем, только если проектов ещё нет (повторный запуск ничего не трогает)
  const hasProjects = fs.existsSync(pdir) && fs.readdirSync(pdir).some((n) => fs.existsSync(path.join(pdir, n, 'project.json')));
  if (flat.length && !hasProjects) {
    const dst = path.join(pdir, DEFAULT_ID);
    fs.mkdirSync(dst, { recursive: true });
    let old = {};
    try { old = readJson(path.join(root, 'project.json')); } catch (_) {}
    for (const n of flat) { moveAny(path.join(root, n), path.join(dst, n)); out.moved.push(n); }
    const p = { ...projectDefaults(DEFAULT_ID, 'Мой проект'), ...old, v: 2, id: DEFAULT_ID, name: 'Мой проект', world: opts.lastWorld || old.world || null, migratedFrom: 'studio/', note: old.note || '' };
    if (old.name && old.name !== 'Мой сюжет' && old.name !== 'Мой проект') p.note = (p.note ? p.note + '\n' : '') + 'Старое название: ' + old.name;
    writeJson(path.join(dst, 'project.json'), p);
    ensureProjectDirs(dst);
    // примеры (id example_*) — в отдельный проект «Примеры»
    const ex = path.join(pdir, EXAMPLES_ID);
    for (const k of DOC_DIRS) {
      const d = path.join(dst, k);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!/^example_.*\.json$/.test(f)) continue;
        moveAny(path.join(d, f), path.join(ex, k, f));
        out.examples.push(k + '/' + f);
      }
    }
    if (out.examples.length && !fs.existsSync(path.join(ex, 'project.json'))) {
      // актёры и переменные примеров ссылаются на проект — даём «Примерам» копию актёров и переменных
      writeJson(path.join(ex, 'project.json'), { ...projectDefaults(EXAMPLES_ID, 'Примеры'), actors: p.actors || [], vars: p.vars || [], note: 'Примеры сцен, диалогов и задания — открой и посмотри, как устроено. Координаты поменяй на свои.' });
      ensureProjectDirs(ex);
      out.seeded = true;
    }
    if (!readCurrent(root)) setCurrent(root, DEFAULT_ID);
    out.migrated = true;
  }
  // «Примеры» из лаунчера — один раз (если автор удалит проект, заново не появится)
  const mark = path.join(root, '.examples');
  if (opts.examplesSrc && fs.existsSync(opts.examplesSrc) && !fs.existsSync(mark)) {
    const ex = path.join(pdir, EXAMPLES_ID);
    if (!fs.existsSync(path.join(ex, 'project.json'))) {
      copyAny(opts.examplesSrc, ex);
      let p = {};
      try { p = readJson(path.join(ex, 'project.json')); } catch (_) {}
      writeJson(path.join(ex, 'project.json'), { ...projectDefaults(EXAMPLES_ID, 'Примеры'), ...p, v: 2, id: EXAMPLES_ID, name: 'Примеры', note: 'Примеры сцен, диалогов и задания — открой и посмотри, как устроено. Координаты поменяй на свои.' });
      ensureProjectDirs(ex);
      out.seeded = true;
    } else {
      // примеры уже переехали из старого проекта — докладываем недостающие файлы
      for (const k of DOC_DIRS) {
        const s = path.join(opts.examplesSrc, k);
        if (!fs.existsSync(s)) continue;
        for (const f of fs.readdirSync(s)) if (!fs.existsSync(path.join(ex, k, f))) { copyAny(path.join(s, f), path.join(ex, k, f)); }
      }
    }
    fs.writeFileSync(mark, 'Примеры уже положены в projects/examples. Удали этот файл, чтобы лаунчер положил их снова.\n');
  }
  return out;
}

// ---------- список проектов ----------
function countDocs(dir) {
  const c = {};
  for (const k of DOC_DIRS) { try { c[k] = fs.readdirSync(path.join(dir, k)).filter((f) => f.endsWith('.json') && !f.endsWith('.bake.json')).length; } catch (_) { c[k] = 0; } }
  try { const e = readJson(path.join(dir, 'entities.json')); c.entities = Array.isArray(e) ? e.length : 0; } catch (_) { c.entities = 0; }
  return c;
}
function listProjects(root, savesDir) {
  const pdir = projectsDir(root);
  let names = [];
  try { names = fs.readdirSync(pdir).filter((n) => isProjectId(n) && fs.existsSync(path.join(pdir, n, 'project.json'))); } catch (_) {}
  return names.map((id) => {
    const dir = path.join(pdir, id);
    let p = {};
    let broken = null;
    try { p = readJson(path.join(dir, 'project.json')); } catch (e) { broken = e.message; }
    let mtime = 0;
    try { mtime = fs.statSync(path.join(dir, 'project.json')).mtimeMs; } catch (_) {}
    for (const k of DOC_DIRS) { try { for (const f of fs.readdirSync(path.join(dir, k))) { const m = fs.statSync(path.join(dir, k, f)).mtimeMs; if (m > mtime) mtime = m; } } catch (_) {} }
    const w = p.world && savesDir ? worldSummary(savesDir, p.world) : null;
    return { id, name: p.name || id, note: p.note || '', world: p.world || null, worldName: w ? w.name : null, worldMissing: !!p.world && !w, icon: w ? w.icon : null, created: p.created || null, mtime, counts: countDocs(dir), broken };
  }).sort((a, b) => b.mtime - a.mtime);
}

// ---------- миры ----------
function worldSummary(saves, folder) {
  const dir = path.join(saves, folder);
  const lvl = path.join(dir, 'level.dat');
  if (!fs.existsSync(lvl)) return null;
  let name = folder, lastPlayed = 0, mode = null;
  try { lastPlayed = fs.statSync(lvl).mtimeMs; } catch (_) {}
  try {
    const r = NBT.readNbt(fs.readFileSync(lvl));
    const d = (r && r.Data) || {};
    if (typeof d.LevelName === 'string' && d.LevelName.trim()) name = d.LevelName.trim();
    if (typeof d.LastPlayed === 'number' && d.LastPlayed > 0) lastPlayed = d.LastPlayed;
    if (typeof d.GameType === 'number') mode = ['survival', 'creative', 'adventure', 'spectator'][d.GameType] || null;
  } catch (_) {}
  let icon = null;
  try { const f = path.join(dir, 'icon.png'); if (fs.statSync(f).size < 400000) icon = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'); } catch (_) {}
  return { folder, name, lastPlayed, mode, icon };
}
// имя папки мира из названия: Windows не любит < > : " / \ | ? * и точки/пробелы в конце
function worldFolderName(saves, name) {
  let base = String(name || 'Мир').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 60) || 'Мир';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = '_' + base;
  let f = base, n = 2;
  while (fs.existsSync(path.join(saves, f))) f = base + ' (' + n++ + ')';
  return f;
}

const B = (v) => ({ _t: NBT.T.BYTE, v: v ? 1 : 0 });
const L = (v) => ({ _t: NBT.T.LONG, v: typeof v === 'bigint' ? v : BigInt(Math.trunc(v)) });
const F = (v) => ({ _t: NBT.T.FLOAT, v });
const LIST = (et, v) => ({ _t: NBT.T.LIST, _et: et, v });
const STR_LIST = (a) => LIST(NBT.T.STRING, a);

// генераторы измерений как в ванильных пресетах 1.21.1
function dimensions(template) {
  const nether = { type: 'minecraft:the_nether', generator: { type: 'minecraft:noise', settings: 'minecraft:nether', biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' } } };
  const end = { type: 'minecraft:the_end', generator: { type: 'minecraft:noise', settings: 'minecraft:end', biome_source: { type: 'minecraft:the_end' } } };
  let over;
  if (template === 'flat') {
    over = { type: 'minecraft:overworld', generator: { type: 'minecraft:flat', settings: {
      biome: 'minecraft:plains', features: B(false), lakes: B(false),
      layers: LIST(NBT.T.COMPOUND, [{ block: 'minecraft:bedrock', height: 1 }, { block: 'minecraft:dirt', height: 2 }, { block: 'minecraft:grass_block', height: 1 }]),
      structure_overrides: LIST(NBT.T.STRING, [])
    } } };
  } else if (template === 'void') {
    // ванильный пресет «Пустота»: один слой воздуха, биом the_void с площадкой из камня у 0,0 (features)
    over = { type: 'minecraft:overworld', generator: { type: 'minecraft:flat', settings: {
      biome: 'minecraft:the_void', features: B(true), lakes: B(false),
      layers: LIST(NBT.T.COMPOUND, [{ block: 'minecraft:air', height: 1 }]),
      structure_overrides: LIST(NBT.T.STRING, [])
    } } };
  } else {
    // обычный мир: шумовой генератор overworld. Моды и датапаки сборки (Terralith и т. п.) подменяют эти записи реестра —
    // мир получается таким же, как из меню «Создать мир».
    over = { type: 'minecraft:overworld', generator: { type: 'minecraft:noise', settings: 'minecraft:overworld', biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' } } };
  }
  return { 'minecraft:overworld': over, 'minecraft:the_nether': nether, 'minecraft:the_end': end };
}

// level.dat нового мира. initialized=0 — сервер сам найдёт точку появления и подготовит мир при первом входе.
// opts: { name, template: flat|void|normal, seed?, creative (true), cheats (true), dayTime?, rules:{ правило: 'true'|'false'|число } }
function levelDat(opts) {
  const seed = opts.seed != null && String(opts.seed).trim() !== '' ? seedOf(opts.seed) : BigInt.asIntN(64, BigInt('0x' + crypto.randomBytes(8).toString('hex')));
  const rules = {};
  for (const [k, v] of Object.entries(opts.rules || {})) if (/^[A-Za-z]+$/.test(k)) rules[k] = String(v);
  const data = {
    DataVersion: NBT.DATA_VERSION,
    version: 19133,
    Version: { Id: NBT.DATA_VERSION, Name: '1.21.1', Series: 'main', Snapshot: B(false) },
    LevelName: String(opts.name || 'Мир').slice(0, 80),
    GameType: opts.creative === false ? 0 : 1,
    Difficulty: { _t: NBT.T.BYTE, v: opts.creative === false ? 2 : 1 },
    DifficultyLocked: B(false),
    hardcore: B(false),
    allowCommands: B(opts.cheats !== false),
    initialized: B(false),
    LastPlayed: L(Date.now()),
    SpawnX: 0, SpawnY: 64, SpawnZ: 0, SpawnAngle: F(0),
    Time: L(0), DayTime: L(Number.isFinite(opts.dayTime) ? opts.dayTime : 1000),
    clearWeatherTime: 0, raining: B(false), rainTime: 0, thundering: B(false), thunderTime: 0,
    WanderingTraderSpawnChance: 25, WanderingTraderSpawnDelay: 24000,
    WasModded: B(false),
    ServerBrands: STR_LIST([]),
    ScheduledEvents: LIST(NBT.T.END, []),
    GameRules: rules,
    WorldGenSettings: { seed: L(seed), generate_features: B(opts.template === 'normal' || !opts.template), bonus_chest: B(false), dimensions: dimensions(opts.template || 'normal') },
    DataPacks: { Enabled: STR_LIST(['vanilla']), Disabled: STR_LIST([]) },
    enabled_features: STR_LIST(['minecraft:vanilla'])
  };
  return NBT.writeNbt({ Data: data });
}
// «зерно» как в игре: число — как есть, текст — hashCode строки (Java)
function seedOf(s) {
  const t = String(s).trim();
  if (/^-?\d{1,19}$/.test(t)) { try { return BigInt.asIntN(64, BigInt(t)); } catch (_) {} }
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return BigInt(h);
}

// новый мир: папка в saves + level.dat. Возвращает имя папки.
function createWorld(saves, opts) {
  fs.mkdirSync(saves, { recursive: true });
  const folder = worldFolderName(saves, opts.name);
  const dir = path.join(saves, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'level.dat'), levelDat(opts));
  return folder;
}
// копия существующего мира (без session.lock); новое имя пишется в level.dat
function copyWorld(saves, srcFolder, newName) {
  const src = path.join(saves, srcFolder);
  if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Мир «' + srcFolder + '» не найден в saves');
  const folder = worldFolderName(saves, newName || srcFolder + ' — копия');
  const dst = path.join(saves, folder);
  copyAny(src, dst, (n) => n === 'session.lock');
  try {
    const f = path.join(dst, 'level.dat');
    const root = NBT.readTyped(fs.readFileSync(f));
    const d = root.v.Data;
    if (d && d.v) d.v.LevelName = { _t: NBT.T.STRING, v: String(newName || folder).slice(0, 80) };
    fs.writeFileSync(f, NBT.writeTyped(root));
  } catch (_) { /* имя останется старым — не страшно */ }
  return folder;
}

// новый проект: папка, project.json, пустые entities.json и папки документов
function createProject(root, { id, name, world, note, start }) {
  const pid = id && isProjectId(id) ? id : uniqueProjectId(root, slugify(name || 'proekt'));
  const dir = projectDir(root, pid);
  if (fs.existsSync(path.join(dir, 'project.json'))) throw new Error('Проект «' + pid + '» уже есть');
  const p = { ...projectDefaults(pid, String(name || pid).slice(0, 80)), world: world || null, note: note || '', start: start || null };
  writeJson(path.join(dir, 'project.json'), p);
  ensureProjectDirs(dir);
  return p;
}
function uniqueProjectId(root, base) {
  const b = (base || 'proekt').slice(0, 56);
  let id = b, n = 2;
  while (fs.existsSync(path.join(projectsDir(root), id))) id = b + '_' + n++;
  return id;
}
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function slugify(s) {
  const t = String(s || '').toLowerCase().split('').map((c) => (TR[c] !== undefined ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return t || 'proekt';
}

module.exports = {
  SAFE_ID, DOC_DIRS, FLAT_ITEMS, EXAMPLES_ID, DEFAULT_ID, isProjectId, projectsDir, projectDir, readCurrent, setCurrent, readProject,
  projectDefaults, ensureProjectDirs, migrate, listProjects, worldSummary, worldFolderName, levelDat, seedOf, createWorld, copyWorld,
  createProject, uniqueProjectId, slugify, copyAny, readJson, writeJson
};
