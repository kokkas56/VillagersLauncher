// Аккаунты: Ely.by (Yggdrasil API) и офлайн-ники.
const crypto = require('crypto');
const store = require('./store.cjs');
const netu = require('./net.cjs');

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

module.exports = { loginEly, addOffline, remove, select, prepare, publicAccounts, elySkin, elyCape, offlineUuid };
