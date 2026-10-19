'use strict';
// Ранний доступ без сервера: ранние выпуски лежат в том же репозитории GitHub (метки early-N), но файлы зашифрованы
// (AES-256-GCM, у каждого выпуска свой ключ). Ключ выпуска открывается кодом:
//   • код месяца   VKM-ГГГГММ-…   — все ранние выпуски, вышедшие в этом месяце (остаются навсегда);
//   • код версии   VKV-N-…        — один выпуск навсегда;
//   • код друга    VKF-id-…       — всё (это мастер-ключ автора; при утечке автор его меняет).
// Ключи месяцев выводятся из мастер-ключа, ключи выпусков случайные и хранятся завёрнутыми в early-keys.json
// (в публичном репозитории — без кодов их не открыть). Коды игрока хранятся только у него в лаунчере.
const crypto = require('crypto');
const store = require('./store.cjs');
const netu = require('./net.cjs');

const KEYS_FILE = 'early-keys.json';
const b64 = (b) => Buffer.from(b).toString('base64url');
const unb64 = (s) => Buffer.from(String(s), 'base64url');
const check = (key) => crypto.createHmac('sha256', key).update('vk-early-check').digest('hex').slice(0, 16);

function encrypt(key, data) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function decrypt(key, blob) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}
const monthKey = (master, ym) => crypto.createHmac('sha256', master).update('month:' + ym).digest();
const ymOf = (d) => new Date(d || Date.now()).toISOString().slice(0, 7);

function packRepo() { return store.get().packRepo; }

async function ghJson(method, url, token, body, extra) {
  const res = await netu.fetchRaw(url.startsWith('http') ? url : 'https://api.github.com' + url, {
    method,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) { const e = new Error('GitHub: ' + ((data && data.message) || res.status)); e.status = res.status; throw e; }
  return data;
}

// ---------- файлы настроек в репозитории сборки ----------
async function readRepoJson(name) {
  const token = store.getSecret('githubToken');
  try {
    const d = await ghJson('GET', `/repos/${packRepo()}/contents/${name}?_=${Date.now()}`, token, null, { Accept: 'application/vnd.github.raw+json', 'Cache-Control': 'no-cache' });
    return typeof d === 'string' ? JSON.parse(d) : (d || {});
  } catch (e) {
    if (e.status === 404) return {};
    try {
      const res = await netu.fetchRaw(`https://raw.githubusercontent.com/${packRepo()}/HEAD/${name}`);
      if (res.ok) return await res.json();
    } catch (_) {}
    return {};
  }
}

async function writeRepoJson(name, mutate, message) {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub (раздел «Автор»)');
  let sha; let cur = {};
  try {
    const d = await ghJson('GET', `/repos/${packRepo()}/contents/${name}?_=${Date.now()}`, token, null, { 'Cache-Control': 'no-cache' });
    if (d && d.sha) { sha = d.sha; cur = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8') || '{}'); }
  } catch (e) { if (e.status !== 404) throw e; }
  const next = mutate(cur) || cur;
  await ghJson('PUT', `/repos/${packRepo()}/contents/${name}`, token, { message, content: Buffer.from(JSON.stringify(next, null, 2) + '\n').toString('base64'), ...(sha ? { sha } : {}) });
  return next;
}

let cfgCache = null;
/** early.json: { boosty, latest } — видят все лаунчеры и сайт. */
async function config(force) {
  if (!force && cfgCache && Date.now() - cfgCache.t < 5 * 60e3) return cfgCache.c;
  const c = await readRepoJson('early.json');
  cfgCache = { t: Date.now(), c };
  return c;
}
async function setConfig(patch) {
  const next = await writeRepoJson('early.json', (cur) => ({ ...cur, ...patch }), 'Ранний доступ: настройки');
  cfgCache = null;
  return next;
}

let keysCache = null;
async function keys(force) {
  if (!force && keysCache && Date.now() - keysCache.t < 60e3) return keysCache.k;
  const k = await readRepoJson(KEYS_FILE);
  k.releases = k.releases || {};
  keysCache = { t: Date.now(), k };
  return k;
}
async function writeKeys(mutate, msg) {
  const next = await writeRepoJson(KEYS_FILE, (cur) => { cur.releases = cur.releases || {}; return mutate(cur) || cur; }, msg || 'Ранний доступ: ключи');
  keysCache = null;
  return next;
}

// ---------- коды игрока ----------
function myCodes() { return store.getSecret('earlyCodes') || []; }

/** Разбор кода: { kind: 'friend'|'month'|'version', id|ym|version, key } или null. */
function parseCode(code) {
  const m = String(code || '').trim().match(/^VK([FMV])-([A-Za-z0-9]+)-([A-Za-z0-9_-]{40,})$/);
  if (!m) return null;
  const key = unb64(m[3]);
  if (key.length !== 32) return null;
  if (m[1] === 'F') return { kind: 'friend', id: m[2], key };
  if (m[1] === 'M') return { kind: 'month', ym: m[2].slice(0, 4) + '-' + m[2].slice(4, 6), key };
  return { kind: 'version', version: parseInt(m[2], 10), key };
}

/** Мастер-ключи автора (история: старые нужны, чтобы открыть старые выпуски). */
function masters() { return store.getSecret('earlyMasters') || []; }

/** Ключ выпуска, если он доступен (коды игрока или мастер-ключи автора). */
async function keyFor(tag) {
  const k = await keys();
  const rel = k.releases[tag];
  if (!rel) return null;
  const tryUnwrap = (wrapKey, wrapped) => { try { const kr = decrypt(wrapKey, unb64(wrapped)); return check(kr) === rel.check ? kr : null; } catch (_) { return null; } };
  for (const mk of masters()) {
    if (mk.id !== rel.mid) continue;
    const kr = tryUnwrap(unb64(mk.key), rel.wf);
    if (kr) return kr;
  }
  for (const c of myCodes().map(parseCode).filter(Boolean)) {
    if (c.kind === 'version' && c.version === rel.version && check(c.key) === rel.check) return c.key;
    if (c.kind === 'month' && c.ym === rel.month) { const kr = tryUnwrap(c.key, rel.wm); if (kr) return kr; }
    if (c.kind === 'friend' && c.id === rel.mid) { const kr = tryUnwrap(c.key, rel.wf); if (kr) return kr; }
  }
  return null;
}

/** Ранние (ещё не открытые всем) выпуски, доступные этому игроку. */
async function releases() {
  const k = await keys();
  const out = [];
  for (const [tag, r] of Object.entries(k.releases)) {
    if (r.opened) continue;
    if (await keyFor(tag)) out.push({ tag, version: r.version, name: '#' + r.version + (r.title ? ' ' + r.title : ''), date: r.date, freeAt: r.freeAt || null });
  }
  return out.sort((a, b) => b.version - a.version);
}

async function manifest(tag) {
  const key = await keyFor(tag);
  if (!key) throw new Error('Нет кода для ранней версии ' + tag.replace('early-', '#'));
  const res = await netu.fetchRaw(`https://github.com/${packRepo()}/releases/download/${tag}/manifest.enc`);
  if (!res.ok) throw new Error('Ранний выпуск недоступен: HTTP ' + res.status);
  return JSON.parse(decrypt(key, Buffer.from(await res.arrayBuffer())).toString('utf8'));
}

async function latest() {
  const list = await releases();
  return list.length ? manifest(list[0].tag) : null;
}

/** Для загрузки: файлам ранних выпусков — функция расшифровки (по полю enc в манифесте). */
async function resolveDecrypt(items) {
  const tags = [...new Set(items.filter((i) => i.enc).map((i) => i.enc))];
  const ks = {};
  for (const t of tags) {
    ks[t] = await keyFor(t);
    if (!ks[t]) throw new Error('Нет кода для ранней версии ' + t.replace('early-', '#') + ' — введи код в «Настройки → Сборка»');
  }
  for (const it of items) if (it.enc) { const key = ks[it.enc]; it.decrypt = (blob) => decrypt(key, blob); delete it.enc; }
  return items;
}

/** Для интерфейса игрока. */
async function status() {
  const c = await config();
  const k = await keys();
  const any = Object.values(k.releases).some((r) => !r.opened);
  const codes = myCodes().map(parseCode).filter(Boolean).map((x) => x.kind === 'month' ? { kind: 'month', ym: x.ym } : x.kind === 'version' ? { kind: 'version', version: x.version } : { kind: 'friend' });
  const mine = await releases();
  return { enabled: !!(c.enabled || any || c.boosty), boosty: c.boosty || null, codes, access: mine.length > 0, available: mine.map((r) => r.version), anyEarly: any };
}

/** Игрок вводит код. */
async function redeem(code) {
  code = String(code || '').trim();
  const c = parseCode(code);
  if (!c) throw new Error('Это не похоже на код раннего доступа');
  const k = await keys(true);
  const rels = Object.values(k.releases);
  let what;
  if (c.kind === 'version') {
    const r = rels.find((x) => x.version === c.version);
    if (!r || check(c.key) !== r.check) throw new Error('Код не подходит');
    what = 'Версия #' + c.version + ' — твоя навсегда';
  } else if (c.kind === 'month') {
    const has = rels.filter((x) => x.month === c.ym);
    if (has.length && !has.some((r) => { try { return check(decrypt(c.key, unb64(r.wm))) === r.check; } catch (_) { return false; } })) throw new Error('Код не подходит');
    what = 'Все ранние версии за ' + c.ym + (has.length ? '' : ' (откроются, когда выйдут)');
  } else {
    const ok = (k.master && k.master.id === c.id && k.master.check === check(c.key)) || rels.some((x) => x.mid === c.id);
    if (!ok) throw new Error('Код не подходит');
    what = 'Все ранние версии';
  }
  const list = myCodes().filter((x) => x !== code);
  list.push(code);
  store.setSecret('earlyCodes', list);
  return { ok: true, what };
}

// ---------- автор ----------
function masterNow() { const m = masters(); return m.length ? m[m.length - 1] : null; }

/** Новый мастер-ключ (первый раз или если код друга утёк). Старые остаются — ими открываются старые выпуски. */
async function newMaster() {
  const id = crypto.randomBytes(3).toString('hex');
  const key = crypto.randomBytes(32);
  const list = masters();
  list.push({ id, key: b64(key), created: new Date().toISOString().slice(0, 10) });
  store.setSecret('earlyMasters', list);
  await writeKeys((k) => { k.master = { id, check: check(key) }; return k; }, 'Ранний доступ: новый мастер-ключ');
  return id;
}

/** Импорт мастер-ключа (на другом компьютере автора) — это код друга. */
async function importMaster(code) {
  const c = parseCode(code);
  if (!c || c.kind !== 'friend') throw new Error('Нужен код друга (VKF-…)');
  const list = masters().filter((m) => m.id !== c.id);
  list.push({ id: c.id, key: b64(c.key), created: 'imported' });
  store.setSecret('earlyMasters', list);
  return true;
}

function friendCode() { const m = masterNow(); return m ? `VKF-${m.id}-${m.key}` : null; }
function monthCode(ym) { const m = masterNow(); return m ? `VKM-${ym.replace('-', '')}-${b64(monthKey(unb64(m.key), ym))}` : null; }
async function versionCode(tag) {
  const k = await keys(true);
  const r = k.releases[tag];
  const kr = await keyFor(tag);
  return r && kr ? `VKV-${r.version}-${b64(kr)}` : null;
}

/** Ключ нового раннего выпуска: завёрнут мастер-ключом и ключом месяца. */
async function prepareRelease(tag, version, info) {
  let m = masterNow();
  if (!m) { await newMaster(); m = masterNow(); }
  const kr = crypto.randomBytes(32);
  const master = unb64(m.key);
  const month = ymOf();
  const entry = {
    version, title: info.title || '', date: new Date().toISOString(), freeAt: info.freeAt || null, month, opened: false,
    mid: m.id, check: check(kr), wf: b64(encrypt(master, kr)), wm: b64(encrypt(monthKey(master, month), kr))
  };
  return { key: kr, entry, commit: () => writeKeys((k) => { k.releases[tag] = entry; return k; }, 'Ранний выпуск ' + tag) };
}

async function authorReleases() {
  const k = await keys(true);
  return Object.entries(k.releases).map(([tag, r]) => ({ ...r, tag, name: '#' + r.version + (r.title ? ' ' + r.title : ''), hidden: !!r.opened, early: true }));
}
async function updateRelease(tag, patch) {
  return writeKeys((k) => { if (k.releases[tag]) Object.assign(k.releases[tag], patch); return k; }, 'Ранний выпуск ' + tag);
}
async function removeRelease(tag) {
  return writeKeys((k) => { delete k.releases[tag]; return k; }, 'Ранний выпуск удалён ' + tag);
}

module.exports = {
  config, setConfig, keys, keyFor, releases, manifest, latest, resolveDecrypt, status, redeem, parseCode,
  masters, masterNow, newMaster, importMaster, friendCode, monthCode, versionCode, prepareRelease, authorReleases, updateRelease, removeRelease,
  encrypt, decrypt, ghJson, reset: () => { cfgCache = null; keysCache = null; }
};
