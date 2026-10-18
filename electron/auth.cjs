// Аккаунты: Ely.by (Yggdrasil API) и офлайн-ники.
const crypto = require('crypto');
const store = require('./store.cjs');
const netu = require('./net.cjs');
const http = require('http');
const ELY_APP = require('./ely-app.cjs');

const ELY_AUTH = 'https://authserver.ely.by/auth';

function clientToken() {
  let t = store.getSecret('clientToken');
  if (!t) { t = crypto.randomUUID(); store.setSecret('clientToken', t); }
  return t;
}

function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function dashed(id) {
  const h = id.replace(/-/g, '');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function post(endpoint, body) {
  const res = await netu.fetchRaw(`${ELY_AUTH}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok) {
    const msg = data.errorMessage || `Ely.by ответил ${res.status}`;
    const err = new Error(msg);
    err.code = data.error;
    err.needTotp = /two factor/i.test(msg);
    throw err;
  }
  return data;
}

function publicAccounts() {
  return store.get().accounts || [];
}

function upsert(acc) {
  const list = publicAccounts().filter((a) => a.id !== acc.id);
  list.push(acc);
  store.set({ accounts: list, selectedAccount: acc.id });
  return acc;
}

async function loginEly(login, password, totp) {
  const data = await post('authenticate', {
    username: login,
    password: totp ? `${password}:${totp}` : password,
    clientToken: clientToken(),
    requestUser: true
  });
  if (!data.selectedProfile) throw new Error('У этого аккаунта Ely.by нет игрового профиля');
  const id = 'ely:' + data.selectedProfile.id;
  store.setSecret(id, { accessToken: data.accessToken });
  return upsert({ id, type: 'ely', name: data.selectedProfile.name, uuid: dashed(data.selectedProfile.id), login, addedAt: Date.now() });
}

// ---------------- вход через браузер (Ely.by OAuth2) ----------------
const ELY_OAUTH = 'https://account.ely.by/oauth2/v1';
const ELY_TOKEN = 'https://account.ely.by/api/oauth2/v1/token';
const ELY_INFO = 'https://account.ely.by/api/account/v1/info';
const SCOPES = 'account_info minecraft_server_session offline_access';

function elyApp() {
  const s = store.get();
  return {
    clientId: s.elyClientId || ELY_APP.clientId,
    clientSecret: s.elyClientSecret || ELY_APP.clientSecret,
    port: Number(s.elyRedirectPort || ELY_APP.port) || 38627
  };
}

function browserLoginReady() { return !!elyApp().clientId; }

async function tokenCall(form) {
  const res = await netu.fetchRaw(ELY_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok || !data.access_token) throw new Error(data.message || data.error_description || data.error || `Ely.by ответил ${res.status}`);
  return data;
}

function page(title, text, ok) {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#120d0a;color:#f3e6d3;font:16px system-ui,sans-serif">
<div style="text-align:center;padding:32px 40px;border-radius:16px;background:#1f1712;border:1px solid ${ok ? '#3ecf6e' : '#e0564b'}">
<div style="font-size:42px">${ok ? '✔' : '✖'}</div><h2 style="margin:8px 0">${title}</h2><p style="opacity:.8">${text}</p></div></body></html>`;
}

let pendingBrowser = null; // { cancel }

function cancelBrowserLogin() {
  if (pendingBrowser) pendingBrowser.cancel();
  return true;
}

async function loginElyBrowser(openExternal) {
  const appCfg = elyApp();
  if (!appCfg.clientId || !appCfg.clientSecret) throw new Error('Вход через браузер ещё не настроен (нет приложения Ely.by). Пока войди по паролю.');
  if (pendingBrowser) pendingBrowser.cancel();
  const state = crypto.randomBytes(16).toString('hex');
  const redirect = `http://localhost:${appCfg.port}/ely/callback`;
  const url = `${ELY_OAUTH}?` + new URLSearchParams({
    client_id: appCfg.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPES, state, prompt: 'select_account'
  }).toString();
  const code = await new Promise((resolve, reject) => {
    let done = false;
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/ely/callback') { res.writeHead(404); res.end(); return; }
      const c = u.searchParams.get('code');
      const ok = c && u.searchParams.get('state') === state;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? page('Вход выполнен', 'Можно закрыть вкладку и вернуться в лаунчер.', true)
        : page('Вход не удался', u.searchParams.get('error_message') || 'Вход отменён. Попробуй ещё раз из лаунчера.', false));
      finish(ok ? null : new Error(u.searchParams.get('error_message') || 'Вход отменён'), c);
    });
    const finish = (err, c) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pendingBrowser = null;
      setTimeout(() => srv.close(), 300);
      err ? reject(err) : resolve(c);
    };
    const timer = setTimeout(() => finish(new Error('Время входа вышло (5 минут)')), 5 * 60e3);
    pendingBrowser = { cancel: () => finish(new Error('Вход отменён')) };
    srv.on('error', (e) => finish(new Error(`Порт ${appCfg.port} занят: ${e.message}`)));
    srv.listen(appCfg.port, '127.0.0.1', () => openExternal(url));
  });
  const tok = await tokenCall({ client_id: appCfg.clientId, client_secret: appCfg.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code });
  const res = await netu.fetchRaw(ELY_INFO, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!res.ok) throw new Error(`Не удалось узнать аккаунт Ely.by (${res.status})`);
  const me = await res.json();
  if (!me.uuid || !me.username) throw new Error('У этого аккаунта Ely.by нет игрового профиля');
  const id = 'ely:' + me.uuid.replace(/-/g, '');
  store.setSecret(id, { accessToken: tok.access_token, refreshToken: tok.refresh_token || null, expiresAt: Date.now() + (Number(tok.expires_in) || 86400) * 1000, oauth: true });
  return upsert({ id, type: 'ely', via: 'browser', name: me.username, uuid: dashed(me.uuid), login: me.username, profileLink: me.profileLink ? String(me.profileLink).replace(/^http:/, 'https:') : null, addedAt: Date.now() });
}

async function refreshOauth(acc, sec) {
  const appCfg = elyApp();
  if (!sec.refreshToken || !appCfg.clientId) throw new Error('no refresh');
  const tok = await tokenCall({ client_id: appCfg.clientId, client_secret: appCfg.clientSecret, scope: SCOPES, refresh_token: sec.refreshToken, grant_type: 'refresh_token' });
  const next = { ...sec, accessToken: tok.access_token, expiresAt: Date.now() + (Number(tok.expires_in) || 86400) * 1000 };
  store.setSecret(acc.id, next);
  return next;
}

function addOffline(name) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Ник: 3–16 символов, латиница, цифры и _');
  const uuid = offlineUuid(name);
  return upsert({ id: 'offline:' + name.toLowerCase(), type: 'offline', name, uuid, addedAt: Date.now() });
}

function remove(id) {
  store.setSecret(id, null);
  const list = publicAccounts().filter((a) => a.id !== id);
  const sel = store.get().selectedAccount === id ? (list[0] && list[0].id) || null : store.get().selectedAccount;
  store.set({ accounts: list, selectedAccount: sel });
}

function select(id) { store.set({ selectedAccount: id }); }

// Перед запуском: проверить/обновить токен Ely.by
async function prepare(id) {
  const acc = publicAccounts().find((a) => a.id === id);
  if (!acc) throw new Error('Выбери аккаунт');
  if (acc.type === 'offline') return { ...acc, accessToken: '0', clientToken: '0' };
  const sec = store.getSecret(acc.id) || {};
  if (!sec.accessToken) {
    const e = new Error('Войди в Ely.by заново');
    e.relogin = true;
    throw e;
  }
  if (sec.oauth) {
    // вход через браузер: токен живёт сутки, обновляется по refresh-токену
    let cur = sec;
    if (!cur.expiresAt || cur.expiresAt - Date.now() < 30 * 60e3) {
      try { cur = await refreshOauth(acc, sec); } catch (_) {
        const e = new Error('Сессия Ely.by истекла, войди заново');
        e.relogin = true;
        throw e;
      }
    }
    return { ...acc, accessToken: cur.accessToken, clientToken: clientToken() };
  }
  let token = sec.accessToken;
  try {
    await post('validate', { accessToken: token });
  } catch (_) {
    try {
      const data = await post('refresh', { accessToken: token, clientToken: clientToken(), requestUser: true });
      token = data.accessToken;
      store.setSecret(acc.id, { accessToken: token });
      if (data.selectedProfile && data.selectedProfile.name !== acc.name) upsert({ ...acc, name: data.selectedProfile.name });
    } catch (e2) {
      const e = new Error('Сессия Ely.by истекла, войди заново');
      e.relogin = true;
      throw e;
    }
  }
  return { ...acc, accessToken: token, clientToken: clientToken() };
}

async function elySkin(name) {
  // Скин с Ely.by (main процесс, чтобы не упираться в CORS)
  try {
    const res = await netu.fetchRaw(`https://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    let slim = false;
    try {
      const tex = await netu.getJson(`https://skinsystem.ely.by/textures/${encodeURIComponent(name)}`);
      slim = !!(tex && tex.SKIN && tex.SKIN.metadata && tex.SKIN.metadata.model === 'slim');
    } catch (_) {}
    return { dataUrl: 'data:image/png;base64,' + buf.toString('base64'), slim };
  } catch (_) {
    return null;
  }
}

async function elyCape(name) {
  try {
    const res = await netu.fetchRaw(`https://skinsystem.ely.by/cloaks/${encodeURIComponent(name)}.png`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (_) {
    return null;
  }
}

module.exports = { loginEly, loginElyBrowser, cancelBrowserLogin, browserLoginReady, addOffline, remove, select, prepare, publicAccounts, elySkin, elyCape, offlineUuid };
