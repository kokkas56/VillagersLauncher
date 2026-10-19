// VillagersLauncher — ранний доступ к сборке (Cloudflare Worker), версия 2: под тысячи игроков.
//
// Хранение:
//   R2 (привязка FILES)  — файлы ранних выпусков: <tag>/<имя> и <tag>/manifest.json; скачивание из R2 бесплатное.
//   D1 (привязка DB)     — выпуски, люди и их права, коды. Таблицы создаются сами при первом запросе.
// Секреты: SECRET (подпись токенов), ADMIN_KEY (ключ автора: им пользуется лаунчер автора).
//
// Права человека (люди хранятся по нику Ely.by, без учёта регистра):
//   friend   — друг: всё, бессрочно;
//   forever  — «навсегда ко всему»: все ранние выпуски, бессрочно;
//   until    — подписка до даты: все ранние выпуски, вышедшие до этой даты (они остаются у него навсегда);
//   versions — отдельно купленные выпуски (теги), навсегда.
// Выпуск, открытый всем, лежит в публичном GitHub — к нему воркер не нужен.
//
// Игрок:   GET /challenge → {sid, ticket};  POST /session {nick, ticket} (после session/join в Ely.by) → {token, ...права}
//          GET /me · GET /releases · GET /manifest/<tag> · GET /file/<tag>/<name> · POST /redeem {code}
// Автор:   заголовок Authorization: Admin <ADMIN_KEY>
//          GET  /admin/people?q=&offset=     POST /admin/people {nick, friend, forever, until, versions, note}   DELETE /admin/people/<nick>
//          GET  /admin/codes                 POST /admin/codes {code?, kind, days, tag, maxUses, expires, note}   DELETE /admin/codes/<code>
//          GET  /admin/releases              POST /admin/releases {tag, version, title, body, freeAt, opened}    DELETE /admin/releases/<tag>
//          PUT  /admin/file/<tag>/<name> (тело — файл)   GET /admin/file/<tag>/<name>
//          GET  /admin/stats

const ELY_HAS_JOINED = 'https://authserver.ely.by/session/hasJoined';
const enc = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
const b64 = (s) => btoa(String.fromCharCode(...enc.encode(s))).replace(/=+$/, '');
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
async function signed(secret, payload) { const body = b64(JSON.stringify(payload)); return body + '.' + (await hmac(secret, body)); }
async function unsign(secret, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if ((await hmac(secret, body)) !== sig) return null;
  try { return JSON.parse(unb64(body)); } catch (_) { return null; }
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

let schemaReady = false;
async function schema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS people (nick TEXT PRIMARY KEY, name TEXT, friend INTEGER DEFAULT 0, forever INTEGER DEFAULT 0, until TEXT, versions TEXT DEFAULT '', note TEXT DEFAULT '', updated TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS releases (tag TEXT PRIMARY KEY, version INTEGER, title TEXT, body TEXT, date TEXT, freeAt TEXT, opened INTEGER DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, kind TEXT, days INTEGER DEFAULT 0, tag TEXT, maxUses INTEGER DEFAULT 0, uses INTEGER DEFAULT 0, expires TEXT, note TEXT DEFAULT '', created TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS redeemed (code TEXT, nick TEXT, at TEXT, PRIMARY KEY (code, nick))`)
  ]);
  schemaReady = true;
}

async function person(env, nick) {
  return env.DB.prepare('SELECT * FROM people WHERE nick = ?').bind(String(nick).toLowerCase()).first();
}

function rights(p) {
  if (!p) return { access: false, friend: false, forever: false, until: null, versions: [] };
  const versions = String(p.versions || '').split(',').filter(Boolean);
  const live = !!(p.friend || p.forever || (p.until && p.until >= today()));
  return { access: live || versions.length > 0, live, friend: !!p.friend, forever: !!p.forever, until: p.until || null, versions };
}

/** Может ли человек взять этот выпуск. */
function canHave(p, rel) {
  if (!p || !rel) return false;
  const r = rights(p);
  if (r.friend || r.forever) return true;
  if (r.versions.includes(rel.tag)) return true;
  return !!(r.until && String(rel.date || '').slice(0, 10) <= r.until);
}

async function who(req, env) {
  const h = req.headers.get('authorization') || '';
  const p = await unsign(env.SECRET, h.replace(/^Bearer\s+/i, ''));
  if (!p || !p.nick || !p.exp || p.exp < Date.now()) return null;
  return p.nick;
}

function isAdmin(req, env) {
  const h = req.headers.get('authorization') || '';
  return !!env.ADMIN_KEY && h === 'Admin ' + env.ADMIN_KEY;
}

async function upsertPerson(env, x) {
  const nick = String(x.nick || '').trim();
  if (!nick) throw new Error('nick');
  await env.DB.prepare(`INSERT INTO people (nick, name, friend, forever, until, versions, note, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(nick) DO UPDATE SET name=?2, friend=?3, forever=?4, until=?5, versions=?6, note=?7, updated=?8`)
    .bind(nick.toLowerCase(), nick, x.friend ? 1 : 0, x.forever ? 1 : 0, x.until || null, (Array.isArray(x.versions) ? x.versions.join(',') : (x.versions || '')), x.note || '', today()).run();
}

function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(12));
  for (let i = 0; i < 12; i++) s += a[r[i] % a.length] + (i === 3 || i === 7 ? '-' : '');
  return s;
}

async function redeem(env, nick, code) {
  code = String(code || '').trim().toUpperCase();
  const c = await env.DB.prepare('SELECT * FROM codes WHERE code = ?').bind(code).first();
  if (!c) return { error: 'Код не найден' };
  if (c.expires && c.expires < today()) return { error: 'Срок действия кода истёк' };
  if (c.maxUses && c.uses >= c.maxUses) return { error: 'Код уже использован максимальное число раз' };
  const had = await env.DB.prepare('SELECT 1 FROM redeemed WHERE code = ? AND nick = ?').bind(code, nick.toLowerCase()).first();
  if (had) return { error: 'Этот код уже активирован на твоём аккаунте' };
  const p = (await person(env, nick)) || { nick, name: nick, friend: 0, forever: 0, until: null, versions: '', note: '' };
  const x = { nick: p.name || nick, friend: !!p.friend, forever: !!p.forever, until: p.until, versions: String(p.versions || '').split(',').filter(Boolean), note: p.note || '' };
  let what = '';
  if (c.kind === 'forever') { x.forever = true; what = 'Доступ навсегда ко всем ранним версиям'; }
  else if (c.kind === 'version') {
    let tag = c.tag;
    if (!tag) { const top = await env.DB.prepare('SELECT tag FROM releases WHERE opened = 0 ORDER BY version DESC LIMIT 1').first(); tag = top && top.tag; }
    if (!tag) return { error: 'Сейчас нет ранней версии' };
    if (!x.versions.includes(tag)) x.versions.push(tag);
    what = 'Версия ' + tag.replace('pack-', '#') + ' — твоя навсегда';
  } else {
    const days = c.days || 31;
    const from = x.until && x.until >= today() ? x.until : today();
    x.until = addDays(from, days);
    what = 'Подписка до ' + x.until;
  }
  if (c.note && !x.note.includes(c.note)) x.note = (x.note ? x.note + '; ' : '') + c.note;
  await upsertPerson(env, x);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO redeemed (code, nick, at) VALUES (?, ?, ?)').bind(code, nick.toLowerCase(), today()),
    env.DB.prepare('UPDATE codes SET uses = uses + 1 WHERE code = ?').bind(code)
  ]);
  return { ok: true, what, ...rights(await person(env, nick)) };
}

async function admin(req, env, parts) {
  const m = req.method;
  const DB = env.DB;
  if (parts[1] === 'stats') {
    const t = today();
    const [all, live, codes, rels] = await Promise.all([
      DB.prepare('SELECT COUNT(*) n FROM people').first(),
      DB.prepare('SELECT COUNT(*) n FROM people WHERE friend = 1 OR forever = 1 OR until >= ?').bind(t).first(),
      DB.prepare('SELECT COUNT(*) n FROM codes').first(),
      DB.prepare('SELECT COUNT(*) n FROM releases WHERE opened = 0').first()
    ]);
    return json({ people: all.n, active: live.n, codes: codes.n, early: rels.n });
  }
  if (parts[1] === 'people') {
    if (m === 'GET') {
      const url = new URL(req.url);
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const off = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      const rows = await DB.prepare(`SELECT * FROM people WHERE nick LIKE ?1 OR note LIKE ?1 ORDER BY updated DESC LIMIT 100 OFFSET ?2`).bind('%' + q + '%', off).all();
      return json(rows.results.map((p) => ({ nick: p.name || p.nick, friend: !!p.friend, forever: !!p.forever, until: p.until, versions: String(p.versions || '').split(',').filter(Boolean), note: p.note, updated: p.updated })));
    }
    if (m === 'POST') { const x = await req.json(); for (const one of Array.isArray(x) ? x : [x]) await upsertPerson(env, one); return json({ ok: true }); }
    if (m === 'DELETE' && parts[2]) { await DB.prepare('DELETE FROM people WHERE nick = ?').bind(parts[2].toLowerCase()).run(); return json({ ok: true }); }
  }
  if (parts[1] === 'codes') {
    if (m === 'GET') return json((await DB.prepare('SELECT * FROM codes ORDER BY created DESC LIMIT 200').all()).results);
    if (m === 'POST') {
      const x = await req.json();
      const code = String(x.code || randomCode()).trim().toUpperCase();
      await DB.prepare(`INSERT INTO codes (code, kind, days, tag, maxUses, uses, expires, note, created) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, days=excluded.days, tag=excluded.tag, maxUses=excluded.maxUses, expires=excluded.expires, note=excluded.note`)
        .bind(code, x.kind || 'sub', x.days || 0, x.tag || null, x.maxUses || 0, x.expires || null, x.note || '', today()).run();
      return json({ ok: true, code });
    }
    if (m === 'DELETE' && parts[2]) { await DB.prepare('DELETE FROM codes WHERE code = ?').bind(parts[2].toUpperCase()).run(); return json({ ok: true }); }
  }
  if (parts[1] === 'releases') {
    if (m === 'GET') return json((await DB.prepare('SELECT * FROM releases ORDER BY version DESC').all()).results);
    if (m === 'POST') {
      const x = await req.json();
      await DB.prepare(`INSERT INTO releases (tag, version, title, body, date, freeAt, opened) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(tag) DO UPDATE SET version=?2, title=?3, body=?4, freeAt=?6, opened=?7`)
        .bind(x.tag, x.version, x.title || '', x.body || '', x.date || new Date().toISOString(), x.freeAt || null, x.opened ? 1 : 0).run();
      return json({ ok: true });
    }
    if (m === 'DELETE' && parts[2]) {
      await DB.prepare('DELETE FROM releases WHERE tag = ?').bind(parts[2]).run();
      let cursor;
      do { const l = await env.FILES.list({ prefix: parts[2] + '/', cursor }); for (const o of l.objects) await env.FILES.delete(o.key); cursor = l.truncated ? l.cursor : null; } while (cursor);
      return json({ ok: true });
    }
  }
  if (parts[1] === 'file' && parts[2] && parts[3]) {
    const key = parts[2] + '/' + parts[3];
    if (m === 'PUT') { await env.FILES.put(key, req.body); return json({ ok: true }); }
    if (m === 'GET') { const o = await env.FILES.get(key); return o ? new Response(o.body) : json({ error: 'not_found' }, 404); }
    if (m === 'HEAD') { const o = await env.FILES.head(key); return new Response(null, { status: o ? 200 : 404 }); }
  }
  return json({ error: 'path' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      await schema(env);
      if (parts[0] === 'admin') return isAdmin(req, env) ? admin(req, env, parts) : json({ error: 'admin' }, 401);
      if (parts[0] === 'challenge') {
        const sid = crypto.randomUUID().replace(/-/g, '');
        return json({ sid, ticket: await signed(env.SECRET, { sid, t: Date.now() }) });
      }
      if (parts[0] === 'session' && req.method === 'POST') {
        const { nick, ticket } = await req.json();
        const ch = await unsign(env.SECRET, ticket);
        if (!ch || Date.now() - ch.t > 5 * 60e3) return json({ error: 'challenge' }, 400);
        const r = await fetch(`${ELY_HAS_JOINED}?username=${encodeURIComponent(nick)}&serverId=${encodeURIComponent(ch.sid)}`);
        if (r.status !== 200) return json({ error: 'not_joined' }, 403);
        const prof = await r.json();
        const name = prof.name || nick;
        const token = await signed(env.SECRET, { nick: name, exp: Date.now() + 12 * 3600e3 });
        return json({ token, nick: name, ...rights(await person(env, name)) });
      }
      const nick = await who(req, env);
      if (!nick) return json({ error: 'auth' }, 401);
      if (parts[0] === 'redeem' && req.method === 'POST') { const { code } = await req.json(); const r = await redeem(env, nick, code); return json(r, r.error ? 400 : 200); }
      const p = await person(env, nick);
      if (parts[0] === 'me') return json({ nick, ...rights(p) });
      if (parts[0] === 'releases') {
        const rows = (await env.DB.prepare('SELECT * FROM releases WHERE opened = 0 ORDER BY version DESC').all()).results;
        return json(rows.filter((r) => canHave(p, r)).map((r) => ({ tag: r.tag, version: r.version, name: '#' + r.version + (r.title ? ' ' + r.title : ''), body: r.body, date: r.date, freeAt: r.freeAt })));
      }
      if ((parts[0] === 'manifest' && parts[1]) || (parts[0] === 'file' && parts[1] && parts[2])) {
        const tag = parts[1];
        const rel = await env.DB.prepare('SELECT * FROM releases WHERE tag = ?').bind(tag).first();
        if (!rel) return json({ error: 'not_found' }, 404);
        if (!canHave(p, rel)) return json({ error: 'no_access', nick }, 403);
        const key = tag + '/' + (parts[0] === 'manifest' ? 'manifest.json' : parts[2]);
        const o = await env.FILES.get(key);
        if (!o) return json({ error: 'not_found' }, 404);
        return new Response(o.body, { headers: { 'content-type': parts[0] === 'manifest' ? 'application/json' : 'application/octet-stream', 'content-length': String(o.size) } });
      }
      return json({ error: 'path' }, 404);
    } catch (e) {
      return json({ error: 'server', message: String((e && e.message) || e) }, 500);
    }
  }
};
