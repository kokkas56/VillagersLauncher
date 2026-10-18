// Сборка MineVillagers: синхронизация у игроков и публикация автором через GitHub Releases.
const fs = require('fs');
const path = require('path');
const store = require('./store.cjs');
const netu = require('./net.cjs');

const SCHEMA = 1;

// ---------- маски игнора (как в .gitignore, упрощённо) ----------
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') { const j = glob.indexOf(']', i); re += glob.slice(i, j + 1); i = j; }
    else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return re;
}
function makeIgnore(patterns) {
  const res = (patterns || []).map((p) => {
    p = p.trim().replace(/^\//, '');
    if (!p) return null;
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1) + '/**';
    const anchored = p.includes('/');
    const body = globToRe(p);
    return new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`, 'i');
  }).filter(Boolean);
  return (rel) => res.some((r) => r.test(rel));
}

// ---------- кеш хешей ----------
function hashCache(dir) {
  const file = path.join(dir, '.villagers', 'hashcache.json');
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  let dirty = false;
  return {
    async sha1(abs, force) {
      const st = await fs.promises.stat(abs);
      const c = data[abs];
      if (!force && c && c.size === st.size && c.mtime === st.mtimeMs) return c.sha1;
      const sha1 = await netu.sha1File(abs);
      data[abs] = { size: st.size, mtime: st.mtimeMs, sha1 };
      dirty = true;
      return sha1;
    },
    save() {
      if (!dirty) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    }
  };
}

function walk(root, rel, out) {
  let list;
  try { list = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
  for (const e of list) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(root, r, out);
    else if (e.isFile()) out.push(r);
  }
}

// Список файлов сборки в папке автора
async function scanSource(dir, onProgress) {
  const s = store.get();
  const ignored = makeIgnore(s.ignore);
  const rels = [];
  for (const d of s.syncDirs) walk(dir, d, rels);
  const files = rels.filter((r) => !ignored(r) && !r.endsWith('.part') && !r.endsWith('.disabled'));
  const cache = hashCache(dir);
  const out = [];
  let i = 0;
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const st = fs.statSync(abs);
    out.push({ path: rel, size: st.size, sha1: await cache.sha1(abs) });
    if (onProgress && ++i % 25 === 0) onProgress({ stage: 'scan', text: `Проверяю файлы ${i}/${files.length}`, bytes: i, total: files.length });
  }
  cache.save();
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- чтение опубликованной сборки ----------
function repo() { return store.get().packRepo; }

async function latestManifest() {
  const res = await netu.fetchRaw(`https://github.com/${repo()}/releases/latest/download/manifest.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Не удалось получить сборку: HTTP ' + res.status);
  return res.json();
}

async function manifestByTag(tag) {
  return netu.getJson(`https://github.com/${repo()}/releases/download/${tag}/manifest.json`);
}

function ghHeaders(token) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function gh(method, url, token, body, extraHeaders) {
  const res = await netu.fetchRaw(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method,
    headers: { ...ghHeaders(token), ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(extraHeaders || {}) },
    body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    const e = new Error(`GitHub: ${msg}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

async function listReleases() {
  const token = store.getSecret('githubToken');
  const list = await gh('GET', `/repos/${repo()}/releases?per_page=50`, token);
  let latestId = null;
  try { latestId = (await gh('GET', `/repos/${repo()}/releases/latest`, token)).id; } catch (_) {}
  return list.filter((r) => r.tag_name.startsWith('pack-') && !r.draft).map((r) => ({
    id: r.id, tag: r.tag_name, name: r.name, body: r.body, date: r.published_at, latest: r.id === latestId, hidden: !!r.prerelease,
    version: parseInt(r.tag_name.slice(5), 10)
  }));
}

// ---------- синхронизация у игрока ----------
function statePath(gameDir) { return path.join(gameDir, '.villagers', 'state.json'); }
function readState(gameDir) {
  try { return JSON.parse(fs.readFileSync(statePath(gameDir), 'utf8')); } catch (_) { return { version: 0, files: {} }; }
}
function writeState(gameDir, st) {
  fs.mkdirSync(path.dirname(statePath(gameDir)), { recursive: true });
  fs.writeFileSync(statePath(gameDir), JSON.stringify(st, null, 1));
}

function isAuthorHome(gameDir) {
  const s = store.get();
  return s.authorMode && path.resolve(gameDir).toLowerCase() === path.resolve(s.authorSourceDir).toLowerCase();
}

async function sync(manifest, gameDir, progress, { verify = false } = {}) {
  if (isAuthorHome(gameDir)) return { skipped: 'author' };
  const s = store.get();
  const st = readState(gameDir);
  const cache = hashCache(gameDir);
  const strict = new Set(manifest.strictDirs || s.strictDirs);
  const disabled = new Set(s.disabledOptional || []);
  const backupRoot = path.join(gameDir, '.villagers', 'backup', new Date().toISOString().replace(/[:.]/g, '-'));
  const toGet = [];
  const newFiles = {};
  let i = 0;
  const backup = (abs, rel) => {
    const dst = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(abs, dst);
  };
  for (const f of manifest.files) {
    if (++i % 20 === 0) progress({ stage: 'pack', text: `Проверяю сборку ${i}/${manifest.files.length}`, bytes: i, total: manifest.files.length });
    const top = f.path.split('/')[0];
    const enabledAbs = path.join(gameDir, f.path);
    const disabledAbs = enabledAbs + '.disabled';
    const wantDisabled = f.optional && disabled.has(f.path);
    const target = wantDisabled ? disabledAbs : enabledAbs;
    const other = wantDisabled ? enabledAbs : disabledAbs;
    if (f.optional && fs.existsSync(other) && !fs.existsSync(target)) fs.renameSync(other, target);
    else if (fs.existsSync(other)) fs.rmSync(other, { force: true });
    newFiles[f.path] = f.sha1;
    if (!fs.existsSync(target)) { toGet.push({ ...f, file: target }); continue; }
    const cur = await cache.sha1(target, verify);
    if (cur === f.sha1) continue;
    const prev = st.files[f.path];
    if (!strict.has(top) && prev && cur !== prev && prev === f.sha1) continue; // игрок сам поменял конфиг, а в сборке он не менялся
    if (!strict.has(top) && prev && cur !== prev) backup(target, f.path); // сохраняем правку игрока
    toGet.push({ ...f, file: target });
  }
  // удалённые из сборки файлы
  for (const [rel, sha] of Object.entries(st.files || {})) {
    if (newFiles[rel]) continue;
    for (const abs of [path.join(gameDir, rel), path.join(gameDir, rel) + '.disabled']) {
      if (!fs.existsSync(abs)) continue;
      const cur = await cache.sha1(abs);
      if (cur === sha) fs.rmSync(abs, { force: true }); else backup(abs, rel);
    }
  }
  // лишние моды, которых нет в сборке, убираем (чтобы не конфликтовали) — если игрок не попросил оставлять свои
  const removed = [];
  for (const d of s.keepOwnMods ? [] : strict) {
    const dir = path.join(gameDir, d);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const rel = `${d}/${name}`;
      if (!/\.jar(\.disabled)?$/i.test(name)) continue;
      const base = rel.replace(/\.disabled$/i, '');
      if (newFiles[base]) continue;
      const dst = path.join(gameDir, '.villagers', 'removed-mods', name);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.rmSync(dst, { force: true });
      fs.renameSync(path.join(dir, name), dst);
      removed.push(name);
    }
  }
  cache.save();
  if (toGet.length) {
    await netu.downloadAll(toGet.map((f) => ({ url: f.url, file: f.file, sha1: f.sha1, size: f.size, name: f.path })), {
      threads: s.downloadThreads || 8,
      onProgress: (p) => progress({ stage: 'pack', text: `Скачиваю сборку: ${p.files}/${p.filesTotal}`, bytes: p.bytes, total: p.total })
    });
  }
  writeState(gameDir, { version: manifest.version, tag: manifest.tag, date: manifest.date, files: newFiles });
  return { downloaded: toGet.length, removed };
}

// ---------- автор: локальные изменения и публикация ----------
async function localChanges(progress) {
  const s = store.get();
  const files = await scanSource(s.authorSourceDir, progress);
  let manifest = null;
  try { manifest = await latestManifest(); } catch (_) {}
  const prev = new Map(((manifest && manifest.files) || []).map((f) => [f.path, f]));
  const cur = new Map(files.map((f) => [f.path, f]));
  const added = []; const changed = []; const removed = [];
  for (const f of files) {
    const p = prev.get(f.path);
    if (!p) added.push(f); else if (p.sha1 !== f.sha1) changed.push(f);
  }
  for (const [p, f] of prev) if (!cur.has(p)) removed.push(f);
  return { manifest, files, added, changed, removed, totalSize: files.reduce((a, f) => a + f.size, 0) };
}

function safeAssetName(sha1, rel) {
  const base = path.posix.basename(rel).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  return `${sha1.slice(0, 10)}-${base || 'file'}`;
}

async function modrinthLookup(hashes) {
  if (!hashes.length) return {};
  try {
    const res = await netu.fetchRaw('https://api.modrinth.com/v2/version_files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes, algorithm: 'sha1' })
    });
    if (!res.ok) return {};
    const data = await res.json();
    const out = {};
    for (const [h, v] of Object.entries(data)) {
      const f = (v.files || []).find((x) => x.hashes && x.hashes.sha1 === h);
      if (f) out[h] = { url: f.url, project: v.project_id };
    }
    return out;
  } catch (_) {
    return {};
  }
}

async function publish({ title, text }, progress) {
  const s = store.get();
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Добавь токен GitHub в разделе «Автор»');
  progress({ stage: 'publish', text: 'Сравниваю с опубликованной сборкой…', indeterminate: true });
  const ch = await localChanges(progress);
  const prevManifest = ch.manifest;
  const prev = new Map(((prevManifest && prevManifest.files) || []).map((f) => [f.path, f]));
  let releases = [];
  try { releases = await listReleases(); } catch (_) {}
  const version = Math.max(0, (prevManifest && prevManifest.version) || 0, ...releases.map((r) => r.version || 0)) + 1;
  const tag = `pack-${version}`;

  // что нужно загрузить
  const need = ch.files.filter((f) => { const p = prev.get(f.path); return !p || p.sha1 !== f.sha1 || !p.url; });
  progress({ stage: 'publish', text: 'Ищу моды на Modrinth (их не нужно заливать)…', indeterminate: true });
  const jars = need.filter((f) => f.path.startsWith('mods/') && f.path.endsWith('.jar'));
  const mr = await modrinthLookup(jars.map((f) => f.sha1));

  const optional = new Set(s.authorOptional || []);
  const files = [];
  const uploads = [];
  const usedNames = new Set();
  for (const f of ch.files) {
    const p = prev.get(f.path);
    const entry = { path: f.path, sha1: f.sha1, size: f.size };
    if (optional.has(f.path)) entry.optional = true;
    if (p && p.sha1 === f.sha1 && p.url) entry.url = p.url;
    else if (mr[f.sha1]) { entry.url = mr[f.sha1].url; entry.source = 'modrinth'; }
    else {
      let name = safeAssetName(f.sha1, f.path);
      while (usedNames.has(name.toLowerCase())) name = 'x' + name;
      usedNames.add(name.toLowerCase());
      entry.url = `https://github.com/${repo()}/releases/download/${tag}/${name}`;
      uploads.push({ name, abs: path.join(s.authorSourceDir, f.path), size: f.size });
    }
    files.push(entry);
  }

  const changelog = [{ version, date: new Date().toISOString(), title, text,
    added: ch.added.map((f) => f.path), changed: ch.changed.map((f) => f.path), removed: ch.removed.map((f) => f.path) },
  ...((prevManifest && prevManifest.changelog) || [])].slice(0, 40);

  const manifest = {
    schema: SCHEMA,
    name: 'MineVillagers',
    version,
    tag,
    date: new Date().toISOString(),
    minecraft: s.minecraftVersion,
    loader: { type: 'neoforge', version: s.neoforgeVersion },
    java: 21,
    syncDirs: s.syncDirs,
    strictDirs: s.strictDirs,
    servers: s.publishServers || [],
    changelog,
    files
  };

  progress({ stage: 'publish', text: 'Создаю выпуск на GitHub…', indeterminate: true });
  const body = `${text || ''}\n\n—\nДобавлено: ${ch.added.length}, изменено: ${ch.changed.length}, удалено: ${ch.removed.length}`;
  // убираем брошенные черновики (если прошлая заливка была прервана)
  try {
    const all = await gh('GET', `/repos/${repo()}/releases?per_page=50`, token);
    for (const r of all) if (r.draft) await gh('DELETE', `/repos/${repo()}/releases/${r.id}`, token).catch(() => {});
  } catch (_) {}
  const rel = await gh('POST', `/repos/${repo()}/releases`, token, { tag_name: tag, name: `#${version} ${title}`, body, draft: true });
  try {
    const total = uploads.reduce((a, u) => a + u.size, 0) || 1;
    let done = 0;
    let filesDone = 0;
    let idx = 0;
    // параллельная загрузка: мелких конфигов много, по одному это очень долго
    const queue = [...uploads].sort((a, b) => b.size - a.size);
    const worker = async () => {
      while (idx < queue.length) {
        const u = queue[idx++];
        const buf = fs.readFileSync(u.abs);
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await gh('POST', `https://uploads.github.com/repos/${repo()}/releases/${rel.id}/assets?name=${encodeURIComponent(u.name)}`, token, buf,
              { 'Content-Type': 'application/octet-stream' });
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (e.status === 422) { lastErr = null; break; } // уже загружен
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
        done += u.size;
        filesDone++;
        progress({ stage: 'publish', text: `Загружаю файлы: ${filesDone}/${queue.length}`, bytes: done, total });
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    const mbuf = Buffer.from(JSON.stringify(manifest));
    await gh('POST', `https://uploads.github.com/repos/${repo()}/releases/${rel.id}/assets?name=manifest.json`, token, mbuf,
      { 'Content-Type': 'application/json' });
    await gh('PATCH', `/repos/${repo()}/releases/${rel.id}`, token, { draft: false, make_latest: 'true' });
  } catch (e) {
    await gh('DELETE', `/repos/${repo()}/releases/${rel.id}`, token).catch(() => {});
    throw e;
  }
  return { version, tag, uploaded: uploads.length, fromModrinth: Object.keys(mr).length, files: files.length };
}

async function makeLatest(releaseId) {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub');
  await gh('PATCH', `/repos/${repo()}/releases/${releaseId}`, token, { make_latest: 'true' });
}

// ---------- автор: выпуски для всех ----------
function needToken() {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub (раздел «Автор»)');
  return token;
}
// удалить выпуск совсем (и его метку); у игроков он пропадёт из списка версий
async function deleteRelease(releaseId) {
  const token = needToken();
  const r = await gh('GET', `/repos/${repo()}/releases/${releaseId}`, token);
  await gh('DELETE', `/repos/${repo()}/releases/${releaseId}`, token);
  await gh('DELETE', `/repos/${repo()}/git/refs/tags/${encodeURIComponent(r.tag_name)}`, token).catch(() => {});
  return true;
}
// скрыть у игроков (не удаляя): выпуск становится «предварительным» — его нет в выборе версий и он не бывает «у всех»
async function hideRelease(releaseId, hidden) {
  const token = needToken();
  await gh('PATCH', `/repos/${repo()}/releases/${releaseId}`, token, hidden ? { prerelease: true, make_latest: 'false' } : { prerelease: false });
  return true;
}
async function renameRelease(releaseId, name, body) {
  const token = needToken();
  const patch = {};
  if (name != null) patch.name = name;
  if (body != null) patch.body = body;
  await gh('PATCH', `/repos/${repo()}/releases/${releaseId}`, token, patch);
  return true;
}

async function checkToken(token) {
  const r = await gh('GET', `/repos/${repo()}`, token);
  if (!r.permissions || !r.permissions.push) throw new Error('У токена нет права записи в ' + repo());
  return { ok: true, repo: r.full_name };
}

module.exports = { latestManifest, manifestByTag, listReleases, sync, localChanges, publish, makeLatest, deleteRelease, hideRelease, renameRelease, checkToken, readState, isAuthorHome, scanSource };
