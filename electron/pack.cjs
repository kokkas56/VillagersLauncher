// Сборка MineVillagers: синхронизация у игроков и публикация автором через GitHub Releases.
const fs = require('fs');
const path = require('path');
const store = require('./store.cjs');
const netu = require('./net.cjs');
const early = require('./early.cjs');

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

/** Что ставить игроку: закреплённая версия (публичная или ранняя), иначе новейшая из публичной и ранней (если есть доступ). */
async function chosenManifest() {
  const s = store.get();
  if (s.pinnedPackVersion) {
    if (s.pinnedEarly) { try { return await early.manifest(s.pinnedPackVersion); } catch (_) { return manifestByTag(String(s.pinnedPackVersion).replace('early-', 'pack-')); } }
    if (await publicClosed() && !pack_isAuthor()) { let acc = false; try { acc = !!(await early.status()).access; } catch (_) {} if (!acc) { const err = new Error('Сборка сейчас доступна только по раннему доступу.'); err.code = 'closed'; throw err; } }
    return manifestByTag(s.pinnedPackVersion);
  }
  const pub = await latestManifest();
  let st = null;
  try {
    st = await early.status();
    if (s.useEarly !== false && st.enabled && st.access) {
      const e = await early.latest();
      if (e && (!pub || e.version > pub.version)) return e;
    }
  } catch (_) {}
  // автор закрыл открытые версии: скачать сборку можно только с ранним доступом (у кого уже скачано — играют своей)
  if (await publicClosed() && !(st && st.access) && !pack_isAuthor()) {
    const err = new Error('Сборка сейчас доступна только по раннему доступу — код можно получить на Boosty автора. Если сборка уже скачана, она запустится как есть.');
    err.code = 'closed';
    throw err;
  }
  return pub;
}
async function publicClosed() { try { const c = await early.config(); return !!(c && c.publicClosed); } catch (_) { return false; } }
function pack_isAuthor() { try { return !!store.getSecret('githubToken') && !!store.get().authorMode; } catch (_) { return false; } }

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
  return list.filter((r) => r.tag_name.startsWith('pack-') && !r.draft && (r.assets || []).some((a) => a.name === 'manifest.json')).map((r) => ({
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
    // ранние выпуски: адреса в манифесте меняются на подписанные ссылки хранилища (на час)
    const items = await early.resolveDecrypt(toGet.map((f) => ({ url: f.url, file: f.file, sha1: f.sha1, size: f.size, name: f.path, enc: f.enc })));
    await netu.downloadAll(items, {
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
  // если есть ранний выпуск новее — сравниваем с ним (это то, что у поддержавших)
  try {
    const top = (await authorEarlyReleases()).filter((r) => !r.hidden).sort((a, b) => b.version - a.version)[0];
    if (top && (!manifest || top.version > (manifest.version || 0))) manifest = (await authorEarlyManifest(top.tag)) || manifest;
  } catch (_) {}
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

async function publish({ title, text, noNews, early: isEarly, freeAt, replaceTag }, progress) {
  title = (title || '').trim() || 'Обновление';
  const s = store.get();
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Добавь токен GitHub в разделе «Автор»');
  const R = repo();
  // файлы ранних выпусков (зашифрованные, метки early-N): бесплатные их не откроют
  const isEarlyFile = (p) => !!(p && (p.enc || (p.url && p.url.includes('/releases/download/early-'))));
  progress({ stage: 'publish', text: 'Сравниваю с опубликованной сборкой…', indeterminate: true });
  const ch = await localChanges(progress);
  let prevManifest = ch.manifest;
  let earlyRels = [];
  {
    try {
      earlyRels = await authorEarlyReleases();
      const top = earlyRels.filter((r) => !r.hidden).sort((x, y) => y.version - x.version)[0];
      if (top && (!prevManifest || top.version > (prevManifest.version || 0))) prevManifest = (await authorEarlyManifest(top.tag)) || prevManifest;
    } catch (_) {}
  }
  // нет изменений в файлах (и в «по желанию») — новая версия не нужна: публикуем только новость,
  // чтобы у игроков не было «доступна новая сборка» и лишних скачиваний. Ранний доступ — как раньше (явный выбор).
  if (!isEarly && prevManifest && !ch.added.length && !ch.changed.length && !ch.removed.length) {
    const opt = new Set(s.authorOptional || []);
    const optChanged = (prevManifest.files || []).some((f) => !!f.optional !== opt.has(f.path));
    if (!optChanged) {
      if (noNews) throw new Error('Нечего заливать: изменений в файлах нет, а новость выключена');
      progress({ stage: 'publish', text: 'Изменений в файлах нет — публикую только новость…', indeterminate: true });
      const post = await addNewsPost({ title, text, version: prevManifest.version || 0 });
      return { newsOnly: true, version: prevManifest.version || 0, post: post.id, message: 'Изменений в файлах нет — новость опубликована без новой версии' };
    }
  }
  const prev = new Map(((prevManifest && prevManifest.files) || []).map((f) => [f.path, f]));
  let releases = [];
  try { releases = await listReleases(); } catch (_) {}
  // «Дополнить ранний выпуск»: тот же номер, тот же ключ, недостающие файлы дозаливаются, манифест заменяется
  const replacing = isEarly && replaceTag ? earlyRels.find((r) => r.tag === replaceTag && !r.hidden) : null;
  if (isEarly && replaceTag && !replacing) throw new Error('Ранний выпуск ' + replaceTag + ' не найден или уже открыт всем');
  const version = replacing ? replacing.version : Math.max(0, (prevManifest && prevManifest.version) || 0, ...releases.map((r) => r.version || 0), ...earlyRels.map((r) => r.version || 0)) + 1;
  const tag = replacing ? replacing.tag : isEarly ? `early-${version}` : `pack-${version}`;
  let earlyPrep = null;
  if (replacing) {
    const key = await early.keyFor(tag);
    if (!key) throw new Error('Нет ключа от ' + tag + ' на этом компьютере');
    earlyPrep = { key, commit: () => early.updateRelease(tag, { title: noNews ? replacing.title : title, freeAt: freeAt || replacing.freeAt || null }) };
  } else if (isEarly) earlyPrep = await early.prepareRelease(tag, version, { title: noNews ? '' : title, freeAt });

  // что нужно загрузить
  // для всех: файлы, лежащие только в раннем доступе (адрес воркера), заливаем заново — иначе бесплатные их не скачают
  const sameRel = (p) => replacing && p && p.enc === tag;
  // файлы, лежащие в выпуске, которого уже нет (удалён или закрыт старым способом), заливаем заново — иначе у игроков «Не удалось скачать»
  let liveTags = null;
  try {
    liveTags = new Set();
    for (let page = 1; page <= 10; page++) {
      const part = await gh('GET', `/repos/${R}/releases?per_page=100&page=${page}`, token);
      for (const r of part) if (!r.draft) liveTags.add(r.tag_name);
      if (part.length < 100) break;
    }
  } catch (_) { liveTags = null; }
  const ghPrefix = `https://github.com/${R}/releases/download/`.toLowerCase();
  const brokenUrl = (p) => {
    if (!liveTags || !p || !p.url || !p.url.toLowerCase().startsWith(ghPrefix)) return false;
    const t = decodeURIComponent(p.url.slice(ghPrefix.length).split('/')[0]);
    return !liveTags.has(t);
  };
  let healed = 0;
  const need = ch.files.filter((f) => { const p = prev.get(f.path); return !p || p.sha1 !== f.sha1 || !p.url || (isEarlyFile(p) && !sameRel(p)) || brokenUrl(p); });
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
    if (p && p.sha1 === f.sha1 && p.url && (!isEarlyFile(p) || sameRel(p)) && !brokenUrl(p)) { entry.url = p.url; if (sameRel(p)) entry.enc = tag; }
    else if (mr[f.sha1]) { entry.url = mr[f.sha1].url; entry.source = 'modrinth'; }
    else {
      if (p && p.sha1 === f.sha1 && brokenUrl(p)) healed++;
      let name = safeAssetName(f.sha1, f.path);
      while (usedNames.has(name.toLowerCase())) name = 'x' + name;
      usedNames.add(name.toLowerCase());
      entry.url = `https://github.com/${R}/releases/download/${tag}/${name}`;
      if (isEarly) entry.enc = tag;
      uploads.push({ name, abs: path.join(s.authorSourceDir, f.path), size: f.size });
    }
    files.push(entry);
  }

  let changelog = [{ version, date: new Date().toISOString(), title, text,
    added: ch.added.map((f) => f.path), changed: ch.changed.map((f) => f.path), removed: ch.removed.map((f) => f.path) },
  ...((prevManifest && prevManifest.changelog) || [])].slice(0, 40);
  if (replacing && changelog[1] && changelog[1].version === version) {
    // дополнение: одна запись на выпуск — изменения складываются, текст новый (если написан)
    const o = changelog[1]; const n = changelog[0];
    const u = (a, b) => [...new Set([...(a || []), ...(b || [])])];
    changelog = [{ ...o, title: noNews ? o.title : n.title, text: noNews || !n.text ? o.text : n.text, added: u(o.added, n.added), changed: u(o.changed, n.changed).filter((x) => !(o.added || []).includes(x)), removed: u(o.removed, n.removed) }, ...changelog.slice(2)];
  }

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
    files,
    ...(isEarly ? { early: { freeAt: freeAt || null } } : {})
  };

  progress({ stage: 'publish', text: 'Создаю выпуск на GitHub…', indeterminate: true });
  const body = `${noNews ? '' : (text || '')}${isEarly ? `\n\nfreeAt: ${freeAt || ''}` : ''}\n\n—\nДобавлено: ${ch.added.length}, изменено: ${ch.changed.length}, удалено: ${ch.removed.length}`;
  // убираем брошенные черновики (если прошлая заливка была прервана)
  try {
    const all = await gh('GET', `/repos/${R}/releases?per_page=50`, token);
    for (const r of all) if (r.draft) await gh('DELETE', `/repos/${R}/releases/${r.id}`, token).catch(() => {});
  } catch (_) {}
  const rel = replacing ? await gh('GET', `/repos/${R}/releases/tags/${tag}`, token)
    : await gh('POST', `/repos/${R}/releases`, token, { tag_name: tag, name: (isEarly ? '★ ' : '') + (noNews ? `#${version}` : `#${version} ${title}`), body: isEarly ? 'Ранний доступ (файлы зашифрованы).' : body, draft: true, prerelease: !!isEarly });
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
        const raw = fs.readFileSync(u.abs);
        const buf = isEarly ? early.encrypt(earlyPrep.key, raw) : raw;
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await gh('POST', `https://uploads.github.com/repos/${R}/releases/${rel.id}/assets?name=${encodeURIComponent(u.name)}`, token, buf,
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
    if (isEarly) {
      const oldM = (rel.assets || []).find((a) => a.name === 'manifest.enc');
      if (oldM) await gh('DELETE', `/repos/${R}/releases/assets/${oldM.id}`, token);
      await gh('POST', `https://uploads.github.com/repos/${R}/releases/${rel.id}/assets?name=manifest.enc`, token, early.encrypt(earlyPrep.key, mbuf),
        { 'Content-Type': 'application/octet-stream' });
      await earlyPrep.commit();
      await gh('PATCH', `/repos/${R}/releases/${rel.id}`, token, { draft: false, prerelease: true, make_latest: 'false' });
    } else {
      await gh('POST', `https://uploads.github.com/repos/${R}/releases/${rel.id}/assets?name=manifest.json`, token, mbuf,
        { 'Content-Type': 'application/json' });
      await gh('PATCH', `/repos/${R}/releases/${rel.id}`, token, { draft: false, make_latest: 'true' });
    }
  } catch (e) {
    if (!replacing) await gh('DELETE', `/repos/${R}/releases/${rel.id}`, token).catch(() => {});
    throw e;
  }
  // ранний выпуск: сайт и лаунчеры узнают, что поддержавшие уже играют в него (без файлов и ссылок)
  if (isEarly) { try { await early.setConfig({ latest: { version, title: noNews ? '' : title, freeAt: freeAt || null } }); } catch (_) {} }
  // новость: без новости — прячем запись; с новостью — снимаем старые пометки с этого номера (если номер повторился)
  let newsWarn = null;
  if (!isEarly) try {
    const cur = await readNews();
    const listed = cur.hidden.includes(version) || cur.deleted.includes(version) || cur.edits[version];
    if (noNews || listed) {
      await writeNews((n) => {
        n.hidden = n.hidden.filter((v) => v !== version);
        n.deleted = n.deleted.filter((v) => v !== version);
        delete n.edits[version];
        if (noNews) n.hidden.push(version);
      }, `Новость #${version}`);
    }
  } catch (e) { newsWarn = 'Сборка залита, но новость не удалось скрыть: ' + e.message; }
  return { version, tag, uploaded: uploads.length, healed, fromModrinth: Object.keys(mr).length, files: files.length, newsWarn };
}


// ---------- автор: ранние выпуски (зашифрованные, метки early-N в том же репозитории) ----------
async function authorEarlyReleases() {
  try { return await early.authorReleases(); } catch (_) { return []; }
}

async function authorEarlyManifest(tag) {
  try { return await early.manifest(tag); } catch (_) { return null; }
}

/**
 * «Открыть всем»: файлы раннего выпуска расшифровываются и заливаются как обычный выпуск pack-N, адреса в манифесте
 * меняются на открытые; зашифрованный выпуск удаляется. Более старые ранние открываются раньше — по порядку.
 */
async function openEarly(tag, progress = () => {}) {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub');
  const all = await authorEarlyReleases();
  const rel = all.find((x) => x.tag === tag);
  if (!rel) throw new Error('Нет такого раннего выпуска: ' + tag);
  if (rel.hidden) return true;
  for (const older of all.filter((x) => x.version < rel.version && !x.hidden).sort((a, b) => a.version - b.version)) await openEarly(older.tag, progress);
  const key = await early.keyFor(tag);
  if (!key) throw new Error('Нет ключа от ' + tag + ' — на этом компьютере нет мастер-ключа (вставь код друга в «Ранний доступ → Мастер-ключ»)');
  const m = await early.manifest(tag);
  const pub = repo();
  const newTag = `pack-${rel.version}`;
  const er = await gh('GET', `/repos/${pub}/releases/tags/${tag}`, token);
  let pr;
  try { pr = await gh('GET', `/repos/${pub}/releases/tags/${newTag}`, token); } catch (_) {}
  const text = (m.changelog && m.changelog[0] && m.changelog[0].text) || '';
  const counts = m.changelog && m.changelog[0] ? `\n\n—\nДобавлено: ${(m.changelog[0].added || []).length}, изменено: ${(m.changelog[0].changed || []).length}, удалено: ${(m.changelog[0].removed || []).length}` : '';
  if (!pr) pr = await gh('POST', `/repos/${pub}/releases`, token, { tag_name: newTag, name: '#' + rel.version + (rel.title ? ' ' + rel.title : ''), body: text + counts, draft: true });
  const have = new Set((pr.assets || []).map((a) => a.name));
  const assets = new Map((er.assets || []).map((a) => [a.name, a]));
  const mine = m.files.filter((f) => f.enc === tag);
  let n = 0;
  for (const f of m.files) {
    if (f.enc !== tag) continue;
    const name = decodeURIComponent(f.url.split('/').pop());
    if (!have.has(name)) {
      const a = assets.get(name);
      if (!a) throw new Error('В раннем выпуске нет файла ' + name);
      const res = await netu.fetchRaw(a.browser_download_url);
      if (!res.ok) throw new Error('Не скачался ' + name + ': HTTP ' + res.status);
      const plain = early.decrypt(key, Buffer.from(await res.arrayBuffer()));
      await gh('POST', `https://uploads.github.com/repos/${pub}/releases/${pr.id}/assets?name=${encodeURIComponent(name)}`, token, plain, { 'Content-Type': 'application/octet-stream' });
      have.add(name);
    }
    f.url = `https://github.com/${pub}/releases/download/${newTag}/${name}`;
    delete f.enc;
    progress({ stage: 'publish', text: `Открываю #${rel.version} для всех: ${++n}/${mine.length}`, bytes: n, total: mine.length || 1 });
  }
  m.tag = newTag;
  delete m.early;
  const old = (pr.assets || []).find((a) => a.name === 'manifest.json');
  if (old) await gh('DELETE', `/repos/${pub}/releases/assets/${old.id}`, token).catch(() => {});
  await gh('POST', `https://uploads.github.com/repos/${pub}/releases/${pr.id}/assets?name=manifest.json`, token, Buffer.from(JSON.stringify(m)), { 'Content-Type': 'application/json' });
  // (выпуск мог остаться «хранилищем» после закрытия в ранний доступ — снова обычная открытая версия)
  await gh('PATCH', `/repos/${pub}/releases/${pr.id}`, token, { draft: false, prerelease: false, make_latest: 'true', name: '#' + rel.version + (rel.title ? ' ' + rel.title : ''), body: text + counts });
  // зашифрованный выпуск больше не нужен: те, у кого он стоит, обновятся на открытый
  await early.updateRelease(tag, { opened: true });
  await gh('DELETE', `/repos/${pub}/releases/${er.id}`, token).catch(() => {});
  await gh('DELETE', `/repos/${pub}/git/refs/tags/${encodeURIComponent(tag)}`, token).catch(() => {});
  try { const c = await early.config(true); if (c.latest && c.latest.version <= rel.version) await early.setConfig({ latest: null }); } catch (_) {}
  return true;
}

/** Автор: уже открытый выпуск pack-N → снова ранний доступ (early-N, файлы этого выпуска зашифрованы).
 *  У кого версия уже скачана — играют дальше; скачать её смогут только с кодом. Обратное — openEarly. */
async function closeToEarly(tag, progress = () => {}) {
  const token = needToken();
  const pub = repo();
  const pr = await gh('GET', `/repos/${pub}/releases/tags/${tag}`, token);
  const m = await manifestByTag(tag);
  const version = m.version;
  const newTag = `early-${version}`;
  let er = null;
  try { er = await gh('GET', `/repos/${pub}/releases/tags/${newTag}`, token); } catch (_) {}
  if (er) throw new Error('Ранний выпуск ' + newTag + ' уже есть');
  const title = String(pr.name || '').replace(/^#\d+\s*/, '');
  const prep = await early.prepareRelease(newTag, version, { title, freeAt: null });
  er = await gh('POST', `/repos/${pub}/releases`, token, { tag_name: newTag, name: '★ #' + version + (title ? ' ' + title : ''), body: 'Ранний доступ (файлы зашифрованы).', draft: true, prerelease: true });
  try {
    const assets = new Map((pr.assets || []).map((a) => [a.name, a]));
    const mine = m.files.filter((f) => f.url && f.url.includes(`/releases/download/${tag}/`));
    let n = 0;
    for (const f of mine) {
      const name = decodeURIComponent(f.url.split('/').pop());
      const a = assets.get(name);
      if (!a) throw new Error('В выпуске нет файла ' + name);
      const res = await netu.fetchRaw(a.browser_download_url);
      if (!res.ok) throw new Error('Не скачался ' + name + ': HTTP ' + res.status);
      const enc = early.encrypt(prep.key, Buffer.from(await res.arrayBuffer()));
      await gh('POST', `https://uploads.github.com/repos/${pub}/releases/${er.id}/assets?name=${encodeURIComponent(name)}`, token, enc, { 'Content-Type': 'application/octet-stream' }).catch((e) => { if (e.status !== 422) throw e; });
      f.url = `https://github.com/${pub}/releases/download/${newTag}/${name}`;
      f.enc = newTag;
      progress({ stage: 'publish', text: `Закрываю #${version}: ${++n}/${mine.length}`, bytes: n, total: mine.length || 1 });
    }
    m.tag = newTag;
    m.early = { freeAt: null };
    await gh('POST', `https://uploads.github.com/repos/${pub}/releases/${er.id}/assets?name=manifest.enc`, token, early.encrypt(prep.key, Buffer.from(JSON.stringify(m))), { 'Content-Type': 'application/octet-stream' });
    await prep.commit();
    await gh('PATCH', `/repos/${pub}/releases/${er.id}`, token, { draft: false, prerelease: true, make_latest: 'false' });
  } catch (e) {
    await gh('DELETE', `/repos/${pub}/releases/${er.id}`, token).catch(() => {});
    throw e;
  }
  // открытый выпуск НЕ удаляем: более новые версии берут из него неизменённые файлы (иначе у игроков «Не удалось скачать»).
  // Убираем только его манифест — версия пропадает из списка и не скачивается, файлы остаются хранилищем.
  const om = (pr.assets || []).find((a) => a.name === 'manifest.json');
  if (om) await gh('DELETE', `/repos/${pub}/releases/assets/${om.id}`, token).catch(() => {});
  await gh('PATCH', `/repos/${pub}/releases/${pr.id}`, token, { prerelease: true, make_latest: 'false', name: '(закрыт, файлы для других версий) #' + version, body: 'Эта версия закрыта в ранний доступ (' + newTag + '). Файлы оставлены: их используют более новые версии.' }).catch(() => {});
  try { const c = await early.config(true); if (!c.latest || c.latest.version < version) await early.setConfig({ latest: { version, title, freeAt: null } }); } catch (_) {}
  return newTag;
}

/** Автор: открыть всем ранние выпуски, чья дата наступила (при запуске лаунчера автора). */
async function openDue(progress) {
  if (!store.get().authorMode || !store.getSecret('githubToken') || !early.masters().length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const due = (await authorEarlyReleases()).filter((r) => !r.hidden && r.freeAt && r.freeAt <= today).sort((a, b) => a.version - b.version);
  const done = [];
  for (const r of due) { await openEarly(r.tag, progress); done.push(r.tag); }
  return done;
}

async function setEarlyFreeAt(tag, freeAt) {
  await early.updateRelease(tag, { freeAt: freeAt || null });
  try { const c = await early.config(true); const r = (await authorEarlyReleases()).find((x) => x.tag === tag); if (c.latest && r && c.latest.version === r.version) await early.setConfig({ latest: { ...c.latest, freeAt: freeAt || null } }); } catch (_) {}
  return true;
}

async function deleteEarly(tag) {
  const token = store.getSecret('githubToken');
  try {
    const er = await gh('GET', `/repos/${repo()}/releases/tags/${tag}`, token);
    await gh('DELETE', `/repos/${repo()}/releases/${er.id}`, token);
  } catch (_) {}
  await gh('DELETE', `/repos/${repo()}/git/refs/tags/${encodeURIComponent(tag)}`, token).catch(() => {});
  await early.removeRelease(tag);
  return true;
}

// ---------- новости: news.json в репозитории сборки (скрыть / удалить / исправить) ----------
function normNews(n) {
  n = n && typeof n === 'object' ? n : {};
  return {
    hidden: Array.isArray(n.hidden) ? n.hidden.map(Number).filter(Boolean) : [],
    deleted: Array.isArray(n.deleted) ? n.deleted.map(Number).filter(Boolean) : [],
    edits: n.edits && typeof n.edits === 'object' ? n.edits : {},
    // новости без новой версии сборки: { id, date, title, text, version (какая сборка была), hidden?, deleted? }
    posts: Array.isArray(n.posts) ? n.posts.filter((p) => p && typeof p === 'object' && p.id && (p.title || p.text)) : []
  };
}
// новость без новой версии: запись в news.json (сборка и манифест не меняются)
async function addNewsPost({ title, text, version }) {
  const post = { id: 'p' + Date.now().toString(36), date: new Date().toISOString(), title: String(title || '').trim() || 'Новость', text: String(text || '').trim(), version: Number(version) || 0 };
  await writeNews((n) => { n.posts.push(post); }, 'Новость: ' + post.title);
  return post;
}
const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
const postItem = (p) => ({ post: p.id, version: p.version, date: p.date, title: p.title, text: p.text });
async function readNews() {
  const token = store.getSecret('githubToken');
  try {
    const d = await gh('GET', `/repos/${repo()}/contents/news.json?raw=1&_=${Date.now()}`, token, null, { Accept: 'application/vnd.github.raw+json', 'Cache-Control': 'no-cache' });
    return normNews(typeof d === 'string' ? JSON.parse(d) : d);
  } catch (e) {
    if (e.status === 404) return normNews(null);
    // лимит API — пробуем «сырой» файл
    try {
      const res = await netu.fetchRaw(`https://raw.githubusercontent.com/${repo()}/HEAD/news.json`);
      if (res.status === 404) return normNews(null);
      if (res.ok) return normNews(await res.json());
    } catch (_) {}
    return normNews(null);
  }
}
async function writeNews(mutate, message) {
  const token = needToken();
  let sha;
  let cur = null;
  // свежий ответ без кэша (иначе Electron может отдать закэшированный «сырой» файл без sha)
  const nc = () => `_=${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    const d = await gh('GET', `/repos/${repo()}/contents/news.json?${nc()}`, token, null, { 'Cache-Control': 'no-cache', Accept: 'application/vnd.github+json' });
    if (d && d.sha) {
      sha = d.sha;
      cur = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8') || '{}');
    } else {
      // запасной путь: sha из списка файлов, содержимое из blob
      const list = await gh('GET', `/repos/${repo()}/contents/?${nc()}`, token, null, { 'Cache-Control': 'no-cache' });
      const f = Array.isArray(list) && list.find((x) => x.name === 'news.json');
      if (f) {
        sha = f.sha;
        const b = await gh('GET', `/repos/${repo()}/git/blobs/${f.sha}`, token);
        cur = JSON.parse(Buffer.from(b.content || '', 'base64').toString('utf8') || '{}');
      }
    }
  } catch (e) { if (e.status !== 404) throw e; }
  const n = normNews(cur);
  mutate(n);
  n.hidden = [...new Set(n.hidden)].sort((a, b) => a - b);
  n.deleted = [...new Set(n.deleted)].sort((a, b) => a - b);
  const content = Buffer.from(JSON.stringify(n, null, 2) + '\n').toString('base64');
  await gh('PUT', `/repos/${repo()}/contents/news.json`, token, { message: message || 'Новости', content, ...(sha ? { sha } : {}) });
  return n;
}
// для игроков: убрать скрытые/удалённые, подставить исправленный текст
function applyNews(changelog, n) {
  const list = (changelog || [])
    .filter((c) => !n.hidden.includes(c.version) && !n.deleted.includes(c.version))
    .map((c) => (n.edits[c.version] ? { ...c, ...n.edits[c.version] } : c));
  const posts = (n.posts || []).filter((p) => !p.hidden && !p.deleted).map(postItem);
  return posts.length ? [...list, ...posts].sort(byDate) : list;
}
// для автора: все записи с пометками
async function authorNews() {
  const m = await latestManifest();
  const n = await readNews();
  const list = ((m && m.changelog) || []).map((c) => ({ ...c, ...(n.edits[c.version] || {}), edited: !!n.edits[c.version],
    hidden: n.hidden.includes(c.version), deleted: n.deleted.includes(c.version) }));
  const posts = (n.posts || []).map((p) => ({ ...postItem(p), hidden: !!p.hidden, deleted: !!p.deleted }));
  return posts.length ? [...list, ...posts].sort(byDate) : list;
}
async function setNews({ version, post, hidden, deleted, title, text, restoreAll }) {
  version = Number(version);
  await writeNews((n) => {
    if (restoreAll) { n.deleted = []; n.posts.forEach((p) => { delete p.deleted; }); return; }
    if (post) {
      const p = n.posts.find((x) => x.id === post);
      if (!p) throw new Error('Новость не найдена — обнови список');
      if (hidden != null) p.hidden = !!hidden;
      if (deleted != null) p.deleted = !!deleted;
      if (title != null) p.title = title;
      if (text != null) p.text = text;
      return;
    }
    if (hidden != null) { n.hidden = n.hidden.filter((v) => v !== version); if (hidden) n.hidden.push(version); }
    if (deleted != null) { n.deleted = n.deleted.filter((v) => v !== version); if (deleted) n.deleted.push(version); }
    if (title != null || text != null) n.edits[version] = { ...(n.edits[version] || {}), ...(title != null ? { title } : {}), ...(text != null ? { text } : {}) };
  }, `Новости: ${post ? 'новость' : '#' + (version || 'все')}`);
  return true;
}

// ---------- каталог серверов: servers.json в репозитории сборки (ведёт автор, видят все) ----------
function normCatalog(c) {
  const list = c && Array.isArray(c.servers) ? c.servers : [];
  return {
    servers: list.filter((x) => x && x.key && x.id).map((x) => ({
      id: String(x.id), key: String(x.key), name: String(x.name || 'Сервер').slice(0, 48), desc: String(x.desc || '').slice(0, 1200),
      image: x.image ? String(x.image).slice(0, 400) : '', tags: Array.isArray(x.tags) ? x.tags.map(String).slice(0, 6) : [],
      ad: !!x.ad, order: Number(x.order) || 0, owner: x.owner ? String(x.owner).slice(0, 32) : '', hidden: !!x.hidden, addedAt: Number(x.addedAt) || 0
    }))
  };
}
async function readCatalog() {
  const token = store.getSecret('githubToken');
  try {
    const d = await gh('GET', `/repos/${repo()}/contents/servers.json?raw=1&_=${Date.now()}`, token, null, { Accept: 'application/vnd.github.raw+json', 'Cache-Control': 'no-cache' });
    return normCatalog(typeof d === 'string' ? JSON.parse(d) : d);
  } catch (e) {
    if (e.status === 404) return normCatalog(null);
    try {
      const res = await netu.fetchRaw(`https://raw.githubusercontent.com/${repo()}/HEAD/servers.json?_=${Date.now()}`);
      if (res.status === 404) return normCatalog(null);
      if (res.ok) return normCatalog(await res.json());
    } catch (_) {}
    return normCatalog(null);
  }
}
async function writeCatalog(mutate, message) {
  const token = needToken();
  let sha; let cur = null;
  try {
    const d = await gh('GET', `/repos/${repo()}/contents/servers.json?_=${Date.now()}`, token, null, { 'Cache-Control': 'no-cache', Accept: 'application/vnd.github+json' });
    if (d && d.sha) { sha = d.sha; cur = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8') || '{}'); }
  } catch (e) { if (e.status !== 404) throw e; }
  const c = normCatalog(cur);
  mutate(c);
  const out = normCatalog(c);
  const content = Buffer.from(JSON.stringify(out, null, 2) + '\n').toString('base64');
  await gh('PUT', `/repos/${repo()}/contents/servers.json`, token, { message: message || 'Сервера', content, ...(sha ? { sha } : {}) });
  return out;
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

module.exports = { closeToEarly, readCatalog, writeCatalog, chosenManifest, authorEarlyReleases, openEarly, openDue, setEarlyFreeAt, deleteEarly, readNews, applyNews, authorNews, setNews, latestManifest, manifestByTag, listReleases, sync, localChanges, publish, makeLatest, deleteRelease, hideRelease, renameRelease, checkToken, readState, isAuthorHome, scanSource };
