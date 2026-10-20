// «Студия»: запекание сцен и видео (фаза 6, трек A).
// - Запекание: игра пишет <проект>/scenes/<id>.bake.json сама (или присылает его — тогда пишем здесь, studio:bakeSave).
//   Свежесть — по хэшу сцены (тот же, что в игре: V.sceneBakeHash от сцены в формате игры).
// - Видео: игра пишет <игра>/kokkstory-videos/<проект>/<сцена>/ (meta.json + pack_NNN.kvp) — ОТДЕЛЬНО от файлов проекта.
//   Флаг «Отдавать игрокам» — options.video.ship в файле сцены (по умолчанию выкл.). «Собрать» копирует только отмеченные
//   видео в config/kokkstory/studio/<проект>/videos/<сцена>/; остальные в сборку не попадают никогда.
const fs = require('fs');
const path = require('path');
const V = require('./studio-validate.cjs');
const SP = require('./studio-projects.cjs');

const SAFE = /^[a-z0-9_-]{1,64}$/;
function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, f); }
function dirSize(d) {
  let n = 0;
  try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) n += dirSize(p); else try { n += fs.statSync(p).size; } catch (_) {} } } catch (_) {}
  return n;
}
function rmTree(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

// хэш запекания сцены из её файла (формат проекта: объекты + сгенерированные дорожки) → как увидит игра
function sceneHash(scene) {
  try { return V.sceneBakeHash(V.normalizeScene(scene)); } catch (_) { return null; }
}
function videosRoot(gameDir) { return path.join(gameDir, 'kokkstory-videos'); }
function videoDir(gameDir, project, id) { return path.join(videosRoot(gameDir), project, id); }
function videoInfo(dir) {
  const f = path.join(dir, 'meta.json');
  if (!fs.existsSync(f)) return null;
  try {
    const m = readJson(f);
    return { exists: true, w: m.w, h: m.h, fps: m.fps, quality: m.quality, frames: m.frames, length: m.length, hash: m.hash || null, made: m.made || null, bytes: dirSize(dir), dupes: m.dupes || 0, upscaled: !!m.upscaled, packs: (m.packs || []).length };
  } catch (e) { return { exists: true, broken: e.message, bytes: dirSize(dir) }; }
}

// сведения по сценам проекта: запекание и видео
function cineInfo({ gameDir, projectDir, projectId }) {
  const sd = path.join(projectDir, 'scenes');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(sd).filter((f) => f.endsWith('.json') && !f.endsWith('.bake.json')); } catch (_) {}
  for (const f of files) {
    const id = f.slice(0, -5);
    let s = null;
    try { s = readJson(path.join(sd, f)); s.id = id; } catch (e) { out.push({ id, title: id, broken: e.message }); continue; }
    const hash = sceneHash(s);
    const opts = V.videoOpts(s);
    const item = { id, title: s.title || id, length: s.length || 0, hash, bakeOnBuild: !(s.options && s.options.bakeOnBuild === false), video: opts, anchored: !!(s.world && (s.world.anchor || s.world.origin)) };
    const bf = path.join(sd, id + '.bake.json');
    if (fs.existsSync(bf)) {
      try {
        const b = readJson(bf);
        item.bake = { exists: true, hash: b.hash || null, fresh: !!hash && b.hash === hash, made: b.made || null, bytes: fs.statSync(bf).size, stats: b.stats || null, partial: !!b.partial };
      } catch (e) { item.bake = { exists: true, broken: e.message, fresh: false }; }
    } else item.bake = { exists: false, fresh: false };
    const vi = videoInfo(videoDir(gameDir, projectId, id));
    if (vi) { vi.fresh = !!hash && vi.hash === hash; item.vid = vi; }
    out.push(item);
  }
  const shipBytes = out.reduce((a, x) => a + (x.vid && x.video && x.video.ship ? x.vid.bytes || 0 : 0), 0);
  const allBytes = out.reduce((a, x) => a + (x.vid ? x.vid.bytes || 0 : 0), 0);
  return { scenes: out, videosDir: path.join(videosRoot(gameDir), projectId), shipBytes, allBytes };
}

// «Собрать»: запекания рядом со сценами, отмеченные видео — в videos/ сборки; неотмеченные и удалённые — убрать из сборки
function shipBuild({ gameDir, projectDir, projectId, out, sceneIds }) {
  const res = { bakes: 0, bakesStale: [], videos: 0, videoBytes: 0, skipped: [], removed: 0 };
  const sd = path.join(projectDir, 'scenes');
  const outScenes = path.join(out, 'scenes');
  fs.mkdirSync(outScenes, { recursive: true });
  const keepBakes = new Set();
  for (const id of sceneIds) {
    const bf = path.join(sd, id + '.bake.json');
    if (!fs.existsSync(bf)) continue;
    try {
      const b = readJson(bf);
      let s = null;
      try { s = readJson(path.join(sd, id + '.json')); s.id = id; } catch (_) {}
      if (s && b.hash !== sceneHash(s)) { res.bakesStale.push(id); continue; } // устаревшее не везём: игра сыграет вживую
      fs.copyFileSync(bf, path.join(outScenes, id + '.bake.json'));
      keepBakes.add(id + '.bake.json');
      res.bakes++;
    } catch (_) {}
  }
  for (const f of fs.readdirSync(outScenes)) if (f.endsWith('.bake.json') && !keepBakes.has(f)) { try { fs.unlinkSync(path.join(outScenes, f)); res.removed++; } catch (_) {} }
  const outVideos = path.join(out, 'videos');
  const keepV = new Set();
  for (const id of sceneIds) {
    let s = null;
    try { s = readJson(path.join(sd, id + '.json')); } catch (_) { continue; }
    if (!V.videoOpts(s).ship) continue;
    const src = videoDir(gameDir, projectId, id);
    const vi = videoInfo(src);
    if (!vi || vi.broken) { res.skipped.push({ id, why: vi ? 'видео повреждено' : 'видео не записано' }); continue; }
    s.id = id;
    if (vi.hash && vi.hash !== sceneHash(s)) { res.skipped.push({ id, why: 'видео устарело — сцену меняли после записи (игра всё равно сыграла бы сцену вживую)' }); continue; }
    const dst = path.join(outVideos, id);
    // копируем только то, что изменилось (видео большие)
    fs.mkdirSync(dst, { recursive: true });
    const names = new Set(fs.readdirSync(src));
    for (const n of names) {
      const a = path.join(src, n), b = path.join(dst, n);
      const sa = fs.statSync(a);
      if (!sa.isFile()) continue;
      let same = false;
      try { const sb = fs.statSync(b); same = sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs; } catch (_) {}
      if (!same) fs.copyFileSync(a, b);
    }
    for (const n of fs.readdirSync(dst)) if (!names.has(n)) { try { fs.unlinkSync(path.join(dst, n)); } catch (_) {} }
    keepV.add(id);
    res.videos++;
    res.videoBytes += vi.bytes || 0;
  }
  if (fs.existsSync(outVideos)) for (const n of fs.readdirSync(outVideos)) if (!keepV.has(n)) { rmTree(path.join(outVideos, n)); res.removed++; }
  return res;
}

function setup({ handle, store }) {
  const gameDir = () => store.get().gameDir;
  const sroot = () => path.join(gameDir(), 'studio');
  const cur = () => { const id = SP.readCurrent(sroot()); if (!id) throw new Error('Проект не открыт'); return id; };
  const pdir = () => SP.projectDir(sroot(), cur());
  const sceneFile = (id) => { if (!SAFE.test(String(id || ''))) throw new Error('Неверное имя сцены'); return path.join(pdir(), 'scenes', id + '.json'); };

  handle('studio:cineInfo', () => cineInfo({ gameDir: gameDir(), projectDir: pdir(), projectId: cur() }));
  // запекание пришло из игры целиком (игра не смогла записать файл сама)
  handle('studio:bakeSave', ({ id, bake }) => {
    if (!bake || typeof bake !== 'object' || bake.v !== 1) throw new Error('Запекание повреждено');
    const f = sceneFile(id).replace(/\.json$/, '.bake.json');
    writeJson(f, bake);
    return { file: f, bytes: fs.statSync(f).size };
  });
  handle('studio:bakeDelete', (id) => { const f = sceneFile(id).replace(/\.json$/, '.bake.json'); if (fs.existsSync(f)) fs.unlinkSync(f); return true; });
  handle('studio:videoDelete', (id) => {
    if (!SAFE.test(String(id || ''))) throw new Error('Неверное имя сцены');
    const d = videoDir(gameDir(), cur(), id);
    const n = dirSize(d);
    rmTree(d);
    return { freed: n };
  });
  // «Отдавать игрокам» для сцены, которая не открыта в редакторе (открытую правит окно само)
  handle('studio:videoShip', ({ id, ship }) => {
    const f = sceneFile(id);
    const s = readJson(f);
    s.options = { ...(s.options || {}), video: { ...((s.options && s.options.video) || {}), ship: !!ship } };
    writeJson(f, s);
    return true;
  });
  handle('studio:videoFolder', (id) => path.relative(gameDir(), id ? videoDir(gameDir(), cur(), id) : path.join(videosRoot(gameDir()), cur())));
}

module.exports = { setup, shipBuild, cineInfo, sceneHash, videoInfo, videosRoot };
