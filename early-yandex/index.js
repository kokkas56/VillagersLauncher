'use strict';
// VillagersLauncher — ранний доступ к сборке. Функция Yandex Cloud (Node.js 18+, без зависимостей).
//
// Всё хранится в одном бакете Object Storage (переменная BUCKET):
//   files/<tag>/<имя>        — файлы ранних выпусков (игрокам отдаются подписанные ссылки на 1 час)
//   releases/<tag>.json      — ранний выпуск: { tag, version, title, body, date, freeAt, opened }
//   people/<ник>.json        — права человека: { nick, friend, forever, until, versions[], note, updated }
//   codes/<КОД>.json         — коды для Boosty: { code, kind, days, tag, maxUses, uses, expires, note, created }
//   redeemed/<КОД>/<ник>     — кто активировал код
// Переменные окружения: BUCKET, S3_KEY_ID, S3_SECRET (статический ключ сервисного аккаунта с ролью storage.editor),
//   SECRET (подпись токенов игроков), ADMIN_KEY (ключ автора — его вставляют в лаунчер автора).
//
// Права: friend / forever — все ранние выпуски бессрочно; until — все выпуски, вышедшие до этой даты (остаются навсегда);
//   versions — отдельные выпуски навсегда.
//
// Маршрут — в параметре r (функция вызывается по своему адресу https://functions.yandexcloud.net/<id>?r=/...):
//   игрок: /challenge · POST /session {nick, ticket} · /me · /releases · POST /sign {tag, names[]} · POST /redeem {code}
//   автор (Authorization: Admin <ADMIN_KEY>): /admin/stats · /admin/people (GET ?q=&after= | POST [..] ) · DELETE /admin/people/<ник>
//     /admin/codes (GET | POST) · DELETE /admin/codes/<КОД> · /admin/releases (GET | POST) · DELETE /admin/releases/<tag>
//     POST /admin/upload {tag, name} → {url} (PUT туда файл) · POST /admin/download {tag, name} → {url}

const crypto = require('crypto');

const ELY_HAS_JOINED = 'https://authserver.ely.by/session/hasJoined';
const HOST = 'storage.yandexcloud.net';
const REGION = 'ru-central1';
const env = process.env;

// ---------- S3 (Signature V4) ----------
const sha256hex = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmacRaw = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const encKey = (k) => k.split('/').map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
const encQ = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function signingKey(date) {
  return hmacRaw(hmacRaw(hmacRaw(hmacRaw('AWS4' + env.S3_SECRET, date), REGION), 's3'), 'aws4_request');
}

function amzNow() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, date: iso.slice(0, 8) };
}

/** Подписанная ссылка (GET/PUT) на объект на `seconds` секунд. */
function presign(method, key, seconds = 3600) {
  const { amz, date } = amzNow();
  const scope = `${date}/${REGION}/s3/aws4_request`;
  const path = `/${env.BUCKET}/${encKey(key)}`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.S3_KEY_ID}/${scope}`, 'X-Amz-Date': amz,
    'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': 'host'
  };
  const qs = Object.keys(q).sort().map((k) => `${encQ(k)}=${encQ(q[k])}`).join('&');
  const canon = [method, path, qs, `host:${HOST}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', amz, scope, sha256hex(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(date)).update(sts).digest('hex');
  return `https://${HOST}${path}?${qs}&X-Amz-Signature=${sig}`;
}

/** Обычный запрос к хранилищу (подпись в заголовках). */
async function s3(method, key, { query = {}, body } = {}) {
  const { amz, date } = amzNow();
  const scope = `${date}/${REGION}/s3/aws4_request`;
  const path = key === null ? `/${env.BUCKET}` : `/${env.BUCKET}/${encKey(key)}`;
  const qs = Object.keys(query).sort().map((k) => `${encQ(k)}=${encQ(query[k])}`).join('&');
  const payload = body ? Buffer.from(body) : Buffer.alloc(0);
  const ph = sha256hex(payload);
  const headers = { host: HOST, 'x-amz-content-sha256': ph, 'x-amz-date': amz };
  const signed = Object.keys(headers).sort();
  const canon = [method, path, qs, signed.map((h) => `${h}:${headers[h]}\n`).join(''), signed.join(';'), ph].join('\n');
  const sts = ['AWS4-HMAC-SHA256', amz, scope, sha256hex(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(date)).update(sts).digest('hex');
  const res = await fetch(`https://${HOST}${path}${qs ? '?' + qs : ''}`, {
    method,
    headers: { 'x-amz-content-sha256': ph, 'x-amz-date': amz, Authorization: `AWS4-HMAC-SHA256 Credential=${env.S3_KEY_ID}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? payload : undefined
  });
  return res;
}

async function getJson(key) {
  const r = await s3('GET', key);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('storage ' + r.status);
  return r.json();
}
async function putJson(key, data) {
  const r = await s3('PUT', key, { body: JSON.stringify(data) });
  if (!r.ok) throw new Error('storage put ' + r.status);
}
async function del(key) { await s3('DELETE', key); }

/** Ключи с префиксом (страница до `max`). */
async function list(prefix, { after, max = 1000 } = {}) {
  const query = { 'list-type': '2', prefix, 'max-keys': String(max) };
  if (after) query['continuation-token'] = after;
  const r = await s3('GET', null, { query });
  if (!r.ok) throw new Error('storage list ' + r.status);
  const xml = await r.text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const next = (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || null;
  return { keys, next };
}
async function countPrefix(prefix) {
  let n = 0; let after = null;
  do { const p = await list(prefix, { after }); n += p.keys.length; after = p.next; } while (after);
  return n;
}

// ---------- токены ----------
const b64u = (b) => Buffer.from(b).toString('base64url');
const hmac = (text) => crypto.createHmac('sha256', env.SECRET).update(text).digest('base64url');
function signed(payload) { const body = b64u(JSON.stringify(payload)); return body + '.' + hmac(body); }
function unsign(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (hmac(body) !== sig) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
}

// ---------- права ----------
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const nickKey = (n) => 'people/' + String(n).toLowerCase().replace(/[^a-z0-9_]/g, '_') + '.json';

function rights(p) {
  if (!p) return { access: false, live: false, friend: false, forever: false, until: null, versions: [] };
  const versions = p.versions || [];
  const live = !!(p.friend || p.forever || (p.until && p.until >= today()));
  return { access: live || versions.length > 0, live, friend: !!p.friend, forever: !!p.forever, until: p.until || null, versions };
}
function canHave(p, rel) {
  if (!p || !rel) return false;
  if (p.friend || p.forever) return true;
  if ((p.versions || []).includes(rel.tag)) return true;
  return !!(p.until && String(rel.date || '').slice(0, 10) <= p.until);
}
async function person(nick) { return getJson(nickKey(nick)); }
async function savePerson(x) {
  const nick = String(x.nick || '').trim();
  if (!nick) throw new Error('nick');
  await putJson(nickKey(nick), { nick, friend: !!x.friend, forever: !!x.forever, until: x.until || null, versions: x.versions || [], note: x.note || '', updated: today() });
}
async function releases() {
  const { keys } = await list('releases/');
  const out = [];
  for (const k of keys) { const r = await getJson(k); if (r) out.push(r); }
  return out.sort((a, b) => b.version - a.version);
}

function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += a[r[i] % a.length] + (i === 3 || i === 7 ? '-' : '');
  return s;
}

async function redeem(nick, codeIn) {
  const code = String(codeIn || '').trim().toUpperCase();
  const c = code ? await getJson('codes/' + code + '.json') : null;
  if (!c) return { error: 'Код не найден' };
  if (c.expires && c.expires < today()) return { error: 'Срок действия кода истёк' };
  if (c.maxUses && c.uses >= c.maxUses) return { error: 'Код уже использован максимальное число раз' };
  const mark = `redeemed/${code}/${String(nick).toLowerCase()}`;
  if ((await s3('HEAD', mark)).ok) return { error: 'Этот код уже активирован на твоём аккаунте' };
  const p = (await person(nick)) || { nick, versions: [] };
  const x = { ...p, nick: p.nick || nick, versions: [...(p.versions || [])] };
  let what = '';
  if (c.kind === 'forever') { x.forever = true; what = 'Доступ навсегда ко всем ранним версиям'; }
  else if (c.kind === 'version') {
    let tag = c.tag;
    if (!tag) { const top = (await releases()).find((r) => !r.opened); tag = top && top.tag; }
    if (!tag) return { error: 'Сейчас нет ранней версии' };
    if (!x.versions.includes(tag)) x.versions.push(tag);
    what = 'Версия ' + tag.replace('pack-', '#') + ' — твоя навсегда';
  } else {
    const from = x.until && x.until >= today() ? x.until : today();
    x.until = addDays(from, c.days || 31);
    what = 'Подписка до ' + x.until;
  }
  if (c.note && !(x.note || '').includes(c.note)) x.note = (x.note ? x.note + '; ' : '') + c.note;
  await savePerson(x);
  await putJson(mark, { at: today() });
  c.uses = (c.uses || 0) + 1;
  await putJson('codes/' + code + '.json', c);
  return { ok: true, what, ...rights(await person(nick)) };
}

// ---------- HTTP ----------
function reply(statusCode, data, extra = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, body: JSON.stringify(data) };
}

async function admin(method, parts, q, body) {
  if (parts[1] === 'stats') {
    const [people, codes, rels] = await Promise.all([countPrefix('people/'), countPrefix('codes/'), releases()]);
    return reply(200, { people, codes, early: rels.filter((r) => !r.opened).length });
  }
  if (parts[1] === 'people') {
    if (method === 'GET') {
      const prefix = 'people/' + String(q.q || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const page = await list(prefix, { after: q.after || null, max: 100 });
      const items = [];
      for (const k of page.keys) { const p = await getJson(k); if (p) items.push(p); }
      return reply(200, { items, next: page.next });
    }
    if (method === 'POST') { for (const x of Array.isArray(body) ? body : [body]) await savePerson(x); return reply(200, { ok: true }); }
    if (method === 'DELETE' && parts[2]) { await del(nickKey(parts[2])); return reply(200, { ok: true }); }
  }
  if (parts[1] === 'codes') {
    if (method === 'GET') {
      const { keys } = await list('codes/');
      const out = [];
      for (const k of keys) { const c = await getJson(k); if (c) out.push(c); }
      return reply(200, out.sort((a, b) => String(b.created).localeCompare(String(a.created))));
    }
    if (method === 'POST') {
      const code = String(body.code || randomCode()).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const old = await getJson('codes/' + code + '.json');
      await putJson('codes/' + code + '.json', { code, kind: body.kind || 'sub', days: +body.days || 0, tag: body.tag || null, maxUses: +body.maxUses || 0, uses: old ? old.uses : 0, expires: body.expires || null, note: body.note || '', created: (old && old.created) || new Date().toISOString() });
      return reply(200, { ok: true, code });
    }
    if (method === 'DELETE' && parts[2]) { await del('codes/' + parts[2].toUpperCase() + '.json'); return reply(200, { ok: true }); }
  }
  if (parts[1] === 'releases') {
    if (method === 'GET') return reply(200, await releases());
    if (method === 'POST') {
      const old = await getJson('releases/' + body.tag + '.json');
      await putJson('releases/' + body.tag + '.json', { tag: body.tag, version: body.version, title: body.title || '', body: body.body || '', date: (old && old.date) || body.date || new Date().toISOString(), freeAt: body.freeAt || null, opened: !!body.opened });
      return reply(200, { ok: true });
    }
    if (method === 'DELETE' && parts[2]) {
      await del('releases/' + parts[2] + '.json');
      let after = null;
      do { const p = await list('files/' + parts[2] + '/', { after }); for (const k of p.keys) await del(k); after = p.next; } while (after);
      return reply(200, { ok: true });
    }
  }
  if (parts[1] === 'upload' && method === 'POST') return reply(200, { url: presign('PUT', `files/${body.tag}/${body.name}`, 3600) });
  if (parts[1] === 'download' && method === 'POST') return reply(200, { url: presign('GET', `files/${body.tag}/${body.name}`, 3600) });
  return reply(404, { error: 'path' });
}

module.exports.handler = async function (event) {
  try {
    const method = event.httpMethod || 'GET';
    const q = event.queryStringParameters || {};
    const parts = String(q.r || '').split('/').filter(Boolean).map(decodeURIComponent);
    const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    let body = null;
    if (event.body) {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      try { body = JSON.parse(raw); } catch (_) { body = null; }
    }
    if (parts[0] === 'admin') {
      if (!env.ADMIN_KEY || h.authorization !== 'Admin ' + env.ADMIN_KEY) return reply(401, { error: 'admin' });
      return await admin(method, parts, q, body);
    }
    if (parts[0] === 'challenge') {
      const sid = crypto.randomBytes(16).toString('hex');
      return reply(200, { sid, ticket: signed({ sid, t: Date.now() }) });
    }
    if (parts[0] === 'session' && method === 'POST') {
      const ch = unsign(body && body.ticket);
      if (!ch || Date.now() - ch.t > 5 * 60e3) return reply(400, { error: 'challenge' });
      const r = await fetch(`${ELY_HAS_JOINED}?username=${encodeURIComponent(body.nick)}&serverId=${encodeURIComponent(ch.sid)}`);
      if (r.status !== 200) return reply(403, { error: 'not_joined' });
      const prof = await r.json();
      const name = prof.name || body.nick;
      return reply(200, { token: signed({ nick: name, exp: Date.now() + 12 * 3600e3 }), nick: name, ...rights(await person(name)) });
    }
    const tok = unsign(String(h.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!tok || !tok.nick || tok.exp < Date.now()) return reply(401, { error: 'auth' });
    const nick = tok.nick;
    if (parts[0] === 'redeem' && method === 'POST') { const r = await redeem(nick, body && body.code); return reply(r.error ? 400 : 200, r); }
    const p = await person(nick);
    if (parts[0] === 'me') return reply(200, { nick, ...rights(p) });
    if (parts[0] === 'releases') {
      const rels = (await releases()).filter((r) => !r.opened && canHave(p, r));
      return reply(200, rels.map((r) => ({ tag: r.tag, version: r.version, name: '#' + r.version + (r.title ? ' ' + r.title : ''), body: r.body, date: r.date, freeAt: r.freeAt })));
    }
    if (parts[0] === 'sign' && method === 'POST') {
      const rel = await getJson('releases/' + (body && body.tag) + '.json');
      if (!rel) return reply(404, { error: 'not_found' });
      if (!canHave(p, rel)) return reply(403, { error: 'no_access' });
      const names = (body.names || []).slice(0, 5000);
      const urls = {};
      for (const n of names) urls[n] = presign('GET', `files/${rel.tag}/${n}`, 3600);
      return reply(200, { urls });
    }
    return reply(404, { error: 'path' });
  } catch (e) {
    return reply(500, { error: 'server', message: String((e && e.message) || e) });
  }
};
