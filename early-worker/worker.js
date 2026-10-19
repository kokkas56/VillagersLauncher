// VillagersLauncher — ранний доступ к сборке (Cloudflare Worker).
//
// Ранние выпуски лежат в ЗАКРЫТОМ репозитории GitHub (EARLY_REPO). Этот воркер знает токен на чтение и отдаёт их только тем,
// чьи ники Ely.by есть в списке доступа (access.json в том же закрытом репозитории). Личность проверяется как на серверах
// Minecraft: лаунчер «заходит на сервер» через Ely.by (session/join), а воркер спрашивает Ely.by, заходил ли этот ник
// (session/hasJoined). Пароли и токены игрока сюда не попадают.
//
// Переменные (Settings → Variables): EARLY_REPO = "kokkas56/MineVillagers-early"
// Секреты: GH_TOKEN (fine-grained, только этот репозиторий, Contents: Read), SECRET (любая длинная случайная строка).
//
// Пути:
//   GET  /challenge                 → { sid, ticket }         (одноразовый вызов для входа, живёт 5 минут)
//   POST /session  {nick, ticket}      → { token, nick, access, until, friend }
//   GET  /me                        → { nick, access, until, friend }
//   GET  /releases                  → [{ tag, version, name, body, date, freeAt }]   (только с доступом)
//   GET  /manifest/<tag>            → manifest.json выпуска                        (только с доступом)
//   GET  /file/<tag>/<asset>        → 302 на временную ссылку GitHub                 (только с доступом)
// Токен лаунчер шлёт в заголовке Authorization: Bearer <token> (12 часов).

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

async function signed(secret, payload) {
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, '');
  return body + '.' + (await hmac(secret, body));
}

async function unsign(secret, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if ((await hmac(secret, body)) !== sig) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(body)))); } catch (_) { return null; }
}

function gh(env, path, accept) {
  return fetch('https://api.github.com/repos/' + env.EARLY_REPO + path, {
    headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: accept || 'application/vnd.github+json', 'User-Agent': 'villagers-early', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'manual'
  });
}

let accessCache = null;
async function accessList(env) {
  if (accessCache && Date.now() - accessCache.t < 60e3) return accessCache.list;
  const res = await gh(env, '/contents/access.json', 'application/vnd.github.raw+json');
  let list = [];
  if (res.ok) { try { const d = await res.json(); list = Array.isArray(d) ? d : (d.people || []); } catch (_) {} }
  accessCache = { t: Date.now(), list };
  return list;
}

function today() { return new Date().toISOString().slice(0, 10); }

async function accessOf(env, nick) {
  const list = await accessList(env);
  const e = list.find((x) => String(x.nick || '').toLowerCase() === String(nick).toLowerCase());
  if (!e) return { access: false };
  const ok = e.friend || !e.until || String(e.until) >= today();
  return { access: !!ok, until: e.until || null, friend: !!e.friend };
}

async function who(req, env) {
  const h = req.headers.get('authorization') || '';
  const p = await unsign(env.SECRET, h.replace(/^Bearer\s+/i, ''));
  if (!p || !p.nick || !p.exp || p.exp < Date.now()) return null;
  return p.nick;
}

let releasesCache = null;
async function releases(env) {
  if (releasesCache && Date.now() - releasesCache.t < 60e3) return releasesCache.list;
  const res = await gh(env, '/releases?per_page=50');
  const list = res.ok ? await res.json() : [];
  releasesCache = { t: Date.now(), list };
  return list;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
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
        const acc = await accessOf(env, name);
        const token = await signed(env.SECRET, { nick: name, exp: Date.now() + 12 * 3600e3 });
        return json({ token, nick: name, ...acc });
      }
      const nick = await who(req, env);
      if (!nick) return json({ error: 'auth' }, 401);
      const acc = await accessOf(env, nick);
      if (parts[0] === 'me') return json({ nick, ...acc });
      if (!acc.access) return json({ error: 'no_access', nick }, 403);
      if (parts[0] === 'releases') {
        const list = (await releases(env)).filter((r) => !r.draft && /^pack-\d+$/.test(r.tag_name)).map((r) => {
          const m = /freeAt:\s*(\d{4}-\d{2}-\d{2})/.exec(r.body || '');
          return { tag: r.tag_name, version: parseInt(r.tag_name.slice(5), 10), name: r.name, body: r.body, date: r.published_at, freeAt: m ? m[1] : null, hidden: !!r.prerelease };
        });
        return json(list);
      }
      if (parts[0] === 'manifest' && parts[1]) {
        const r = (await releases(env)).find((x) => x.tag_name === parts[1]);
        const a = r && (r.assets || []).find((x) => x.name === 'manifest.json');
        if (!a) return json({ error: 'not_found' }, 404);
        const res = await gh(env, '/releases/assets/' + a.id, 'application/octet-stream');
        const loc = res.headers.get('location');
        const body = loc ? await (await fetch(loc)).text() : await res.text();
        return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
      if (parts[0] === 'file' && parts[1] && parts[2]) {
        const r = (await releases(env)).find((x) => x.tag_name === parts[1]);
        const a = r && (r.assets || []).find((x) => x.name === parts[2]);
        if (!a) return json({ error: 'not_found' }, 404);
        const res = await gh(env, '/releases/assets/' + a.id, 'application/octet-stream');
        const loc = res.headers.get('location');
        if (loc) return Response.redirect(loc, 302);
        return new Response(res.body, { status: res.status });
      }
      return json({ error: 'path' }, 404);
    } catch (e) {
      return json({ error: 'server', message: String(e && e.message || e) }, 500);
    }
  }
};
