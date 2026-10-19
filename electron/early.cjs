'use strict';
// Ранний доступ: выпуски сборки сначала в закрытом репозитории, их отдаёт воркер Cloudflare тем, кто в списке доступа.
// Настройка (адрес воркера, закрытый репозиторий, ссылка на Boosty) лежит в публичном репозитории сборки: early.json.
// Личность игрока: вход на «сервер» через Ely.by (session/join) — воркер проверяет hasJoined, пароли не передаются.
const store = require('./store.cjs');
const netu = require('./net.cjs');

let cfgCache = null;
let session = null; // { accountId, token, exp, nick, access, until, friend }

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

/** {worker, repo, boosty} из публичного репозитория (кэш 5 минут). */
async function config(force) {
  if (!force && cfgCache && Date.now() - cfgCache.t < 5 * 60e3) return cfgCache.c;
  let c = {};
  try {
    const token = store.getSecret('githubToken');
    const d = await ghJson('GET', `/repos/${packRepo()}/contents/early.json?_=${Date.now()}`, token, null, { Accept: 'application/vnd.github.raw+json', 'Cache-Control': 'no-cache' });
    c = typeof d === 'string' ? JSON.parse(d) : (d || {});
  } catch (_) {}
  c.worker = String(c.worker || '').replace(/\/+$/, '');
  cfgCache = { t: Date.now(), c };
  return c;
}

/** Автор: записать early.json (адрес воркера, закрытый репозиторий, Boosty). */
async function setConfig(patch) {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub (раздел «Автор»)');
  let sha; let cur = {};
  try {
    const d = await ghJson('GET', `/repos/${packRepo()}/contents/early.json?_=${Date.now()}`, token, null, { 'Cache-Control': 'no-cache' });
    if (d && d.sha) { sha = d.sha; cur = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8') || '{}'); }
  } catch (e) { if (e.status !== 404) throw e; }
  const next = { ...cur, ...patch };
  await ghJson('PUT', `/repos/${packRepo()}/contents/early.json`, token, { message: 'Ранний доступ: настройки', content: Buffer.from(JSON.stringify(next, null, 2) + '\n').toString('base64'), ...(sha ? { sha } : {}) });
  cfgCache = null;
  return next;
}

async function workerFetch(path, opts = {}) {
  const c = await config();
  if (!c.worker) throw new Error('Ранний доступ не настроен');
  return netu.fetchRaw(c.worker + path, opts);
}

/** Вход: join через Ely.by → токен воркера на 12 часов (для выбранного аккаунта). */
async function login(force) {
  const s = store.get();
  const accId = s.selectedAccount;
  if (!force && session && session.accountId === accId && session.exp > Date.now() + 60e3) return session;
  const auth = require('./auth.cjs');
  const acc = auth.publicAccounts().find((a) => a.id === accId);
  if (!acc || acc.type !== 'ely') { session = { accountId: accId, access: false, offline: true }; return session; }
  const ready = await auth.prepare(acc.id);
  const ch = await (await workerFetch('/challenge')).json();
  const join = await netu.fetchRaw('https://authserver.ely.by/session/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: ready.accessToken, selectedProfile: String(acc.uuid).replace(/-/g, ''), serverId: ch.sid })
  });
  if (!join.ok) throw new Error('Ely.by не подтвердил вход (' + join.status + ')');
  const res = await workerFetch('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nick: acc.name, ticket: ch.ticket }) });
  const d = await res.json();
  if (!res.ok) throw new Error('Ранний доступ: ' + (d.error || res.status));
  session = { accountId: accId, token: d.token, exp: Date.now() + 11 * 3600e3, nick: d.nick, access: !!d.access, until: d.until || null, friend: !!d.friend };
  return session;
}

function headers() {
  return session && session.token ? { Authorization: 'Bearer ' + session.token } : {};
}

/** Для интерфейса: включено ли, есть ли доступ, до какого числа, ссылка на Boosty. */
async function status() {
  const c = await config();
  if (!c.worker) return { enabled: false };
  const out = { enabled: true, boosty: c.boosty || null };
  try {
    const s = await login();
    if (s.offline) return { ...out, offline: true, access: false };
    return { ...out, nick: s.nick, access: s.access, until: s.until, friend: s.friend };
  } catch (e) {
    return { ...out, access: false, error: e.message };
  }
}

/** Ранние выпуски (только с доступом). */
async function releases() {
  const s = await login();
  if (!s.access) return [];
  const res = await workerFetch('/releases', { headers: headers() });
  if (!res.ok) return [];
  return (await res.json()).filter((r) => !r.hidden);
}

async function manifest(tag) {
  await login();
  const res = await workerFetch('/manifest/' + encodeURIComponent(tag), { headers: headers() });
  if (!res.ok) throw new Error('Ранний выпуск недоступен: HTTP ' + res.status);
  return res.json();
}

/** Новейший ранний выпуск (или null). */
async function latest() {
  const list = await releases();
  if (!list.length) return null;
  const top = list.sort((a, b) => b.version - a.version)[0];
  return manifest(top.tag);
}

/** Заголовки для загрузки файла (только для адресов воркера). */
async function fileHeaders(url) {
  const c = await config();
  if (!c.worker || !url || !url.startsWith(c.worker)) return null;
  await login();
  return headers();
}

// ---------- автор: список доступа (access.json в закрытом репозитории) ----------
async function earlyRepo() {
  const c = await config();
  return c.repo || null;
}

async function getAccess() {
  const token = store.getSecret('githubToken');
  const repo = await earlyRepo();
  if (!token || !repo) return { list: [], sha: null };
  try {
    const d = await ghJson('GET', `/repos/${repo}/contents/access.json?_=${Date.now()}`, token, null, { 'Cache-Control': 'no-cache' });
    const v = JSON.parse(Buffer.from(d.content || '', 'base64').toString('utf8') || '[]');
    return { list: Array.isArray(v) ? v : (v.people || []), sha: d.sha };
  } catch (e) {
    if (e.status === 404) return { list: [], sha: null };
    throw e;
  }
}

async function setAccess(list) {
  const token = store.getSecret('githubToken');
  const repo = await earlyRepo();
  if (!token || !repo) throw new Error('Сначала укажи закрытый репозиторий раннего доступа');
  const cur = await getAccess();
  const clean = list.map((x) => ({ nick: String(x.nick || '').trim(), until: x.until || null, friend: !!x.friend, note: x.note || '' })).filter((x) => x.nick);
  await ghJson('PUT', `/repos/${repo}/contents/access.json`, token, { message: 'Ранний доступ: список', content: Buffer.from(JSON.stringify(clean, null, 2) + '\n').toString('base64'), ...(cur.sha ? { sha: cur.sha } : {}) });
  return clean;
}

module.exports = { config, setConfig, login, status, releases, manifest, latest, fileHeaders, earlyRepo, getAccess, setAccess, ghJson, reset: () => { session = null; cfgCache = null; } };
