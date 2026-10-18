// Своя сеть для игры с друзьями на ZeroTier: сеть по имени и паролю, заявки, кто онлайн.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const store = require('./store.cjs');
const netu = require('./net.cjs');

const LOCAL = 'http://127.0.0.1:9993';
const CENTRAL = 'https://api.zerotier.com/api/v1';
const MSI_URL = 'https://download.zerotier.com/dist/ZeroTier%20One.msi';
const TOKEN_COPY = path.join(store.DATA_DIR, 'zerotier-authtoken.secret');
const PD = process.env.ProgramData || 'C:\\ProgramData';
const ZT_HOME = path.join(PD, 'ZeroTier', 'One');
const PBKDF2_ITER = 200000;

// ---------- шифрование записи сети паролем ----------
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'base64'), PBKDF2_ITER, 32, 'sha256');
}
function encrypt(obj, password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { salt, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decrypt(entry, password) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, entry.salt), Buffer.from(entry.iv, 'base64'));
    d.setAuthTag(Buffer.from(entry.tag, 'base64'));
    const out = Buffer.concat([d.update(Buffer.from(entry.data, 'base64')), d.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (_) {
    return null;
  }
}

// ---------- реестр сетей (файл в выпуске networks репозитория сборки) ----------
function registryUrl() { return `https://github.com/${store.get().packRepo}/releases/download/networks/networks.json`; }

async function readRegistry() {
  const res = await netu.fetchRaw(registryUrl() + '?t=' + Date.now());
  if (res.status === 404) return { networks: [] };
  if (!res.ok) throw new Error('Не удалось получить список сетей: HTTP ' + res.status);
  return res.json();
}

async function ghApi(method, url, token, body, headers) {
  const res = await netu.fetchRaw(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
    body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined
  });
  const t = await res.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch (_) { d = t; }
  if (!res.ok) { const e = new Error('GitHub: ' + ((d && d.message) || res.status)); e.status = res.status; throw e; }
  return d;
}

async function writeRegistry(reg) {
  const token = store.getSecret('githubToken');
  if (!token) throw new Error('Нужен токен GitHub (вкладка «Автор»)');
  const repo = store.get().packRepo;
  let rel;
  try {
    rel = await ghApi('GET', `/repos/${repo}/releases/tags/networks`, token);
  } catch (e) {
    if (e.status !== 404) throw e;
    rel = await ghApi('POST', `/repos/${repo}/releases`, token, { tag_name: 'networks', name: 'Сети для игры с друзьями', body: 'Служебный файл лаунчера: зашифрованный список сетей.', prerelease: true, make_latest: 'false' });
  }
  for (const a of rel.assets || []) if (a.name === 'networks.json') await ghApi('DELETE', `/repos/${repo}/releases/assets/${a.id}`, token);
  await ghApi('POST', `https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=networks.json`, token,
    Buffer.from(JSON.stringify(reg)), { 'Content-Type': 'application/json' });
}

// ---------- ZeroTier Central ----------
async function central(method, p, apiToken, body) {
  const res = await netu.fetchRaw(CENTRAL + p, {
    method,
    headers: { Authorization: 'token ' + apiToken, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await res.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch (_) { d = t; }
  if (!res.ok) throw new Error('ZeroTier: ' + (res.status === 401 || res.status === 403 ? 'неверный API-токен' : (d && d.message) || res.status));
  return d;
}

// ---------- локальная служба ZeroTier ----------
function localToken() {
  for (const f of [TOKEN_COPY, path.join(ZT_HOME, 'authtoken.secret'), path.join(process.env.LOCALAPPDATA || '', 'ZeroTier', 'One', 'authtoken.secret')]) {
    try { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } catch (_) {}
  }
  return null;
}

async function local(method, p, body) {
  const token = localToken();
  if (!token) { const e = new Error('Нет доступа к ZeroTier'); e.needSetup = true; throw e; }
  const res = await netu.fetchRaw(LOCAL + p, {
    method,
    headers: { 'X-ZT1-Auth': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { const e = new Error('Нет доступа к ZeroTier'); e.needSetup = true; throw e; }
  if (!res.ok) throw new Error('ZeroTier служба: HTTP ' + res.status);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function installed() {
  return fs.existsSync(ZT_HOME) || fs.existsSync(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ZeroTier'))
    || fs.existsSync(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ZeroTier'));
}

async function status() {
  const res = { platform: process.platform, installed: installed(), running: false, address: null, hasToken: !!localToken(), networks: [] };
  try {
    const s = await local('GET', '/status');
    res.running = true;
    res.address = s.address;
    res.online = s.online;
    res.networks = (await local('GET', '/network')) || [];
  } catch (e) {
    res.error = e.message;
  }
  return res;
}

// Java-файлы для правила брандмауэра
function javaPaths() {
  const list = new Set();
  const s = store.get();
  if (s.javaPath) list.add(s.javaPath);
  const jd = path.join(store.RUNTIME_DIR, 'java');
  const walk = (d, depth) => {
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of items) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth > 0) walk(p, depth - 1);
      else if (/^javaw?\.exe$/i.test(e.name)) list.add(p);
    }
  };
  walk(jd, 4);
  return [...list];
}

// Один запрос прав администратора: установить ZeroTier, скопировать ключ службы, открыть Java в брандмауэре
async function setup({ installZt = true, firewall = true } = {}, progress) {
  if (process.platform !== 'win32') throw new Error('Автонастройка сети есть только для Windows');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-net-'));
  let msi = '';
  if (installZt && !installed()) {
    progress && progress({ stage: 'net', text: 'Скачиваю ZeroTier…', indeterminate: true });
    msi = path.join(tmp, 'ZeroTierOne.msi');
    await netu.downloadFile(MSI_URL, msi);
  }
  const result = path.join(tmp, 'result.txt');
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const javas = firewall ? javaPaths() : [];
  const ps = [
    "$ErrorActionPreference = 'Continue'",
    'try {',
    msi ? `  Start-Process msiexec.exe -ArgumentList '/i', ${q('"' + msi + '"')}, '/qn', '/norestart' -Wait` : '',
    `  $tok = ${q(path.join(ZT_HOME, 'authtoken.secret'))}`,
    "  for ($i = 0; $i -lt 90 -and -not (Test-Path $tok); $i++) { Start-Sleep -Seconds 1 }",
    `  if (Test-Path $tok) { Copy-Item $tok ${q(TOKEN_COPY)} -Force }`,
    ...javas.map((j) => `  netsh advfirewall firewall delete rule name="VillagersLauncher Java" program=${q(j)} | Out-Null; netsh advfirewall firewall add rule name="VillagersLauncher Java" dir=in action=allow program=${q(j)} enable=yes profile=any | Out-Null`),
    `  'ok' | Out-File -Encoding utf8 ${q(result)}`,
    '} catch {',
    `  $_.Exception.Message | Out-File -Encoding utf8 ${q(result)}`,
    '}'
  ].filter(Boolean).join('\r\n');
  const script = path.join(tmp, 'setup.ps1');
  fs.writeFileSync(script, '\ufeff' + ps, 'utf8');
  progress && progress({ stage: 'net', text: 'Подтверди права администратора в окне Windows…', indeterminate: true });
  await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','"${script}"'`], { windowsHide: true });
    p.on('close', resolve);
    p.on('error', resolve);
  });
  let out = '';
  try { out = fs.readFileSync(result, 'utf8').replace(/^\ufeff/, '').trim(); } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true });
  if (out !== 'ok') throw new Error(out ? 'Настройка не удалась: ' + out : 'Настройку отменили или Windows не дал прав администратора');
  // ждём службу
  for (let i = 0; i < 30; i++) {
    try { await local('GET', '/status'); return true; } catch (_) { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error('ZeroTier установлен, но служба не отвечает. Перезагрузи компьютер и попробуй снова');
}

async function ensureReady(progress) {
  try { await local('GET', '/status'); return; } catch (e) { /* нужна настройка */ }
  await setup({ installZt: true, firewall: true }, progress);
}

// ---------- сети ----------
function joinedList() { return store.get().ztNetworks || []; }
function saveJoined(list) { store.set({ ztNetworks: list }); }

async function join({ name, password, nick }, progress) {
  const reg = await readRegistry();
  const entry = (reg.networks || []).find((n) => n.name.toLowerCase() === String(name).trim().toLowerCase());
  if (!entry) throw new Error('Сеть с таким именем не найдена');
  const secret = decrypt(entry, password);
  if (!secret) throw new Error('Неверный пароль');
  await ensureReady(progress);
  progress && progress({ stage: 'net', text: 'Подключаюсь к сети…', indeterminate: true });
  await local('POST', `/network/${secret.networkId}`, { allowManaged: true, allowGlobal: false, allowDefault: false });
  const st = await local('GET', '/status');
  if (secret.apiToken && st && st.address) {
    try {
      await central('POST', `/network/${secret.networkId}/member/${st.address}`, secret.apiToken, {
        name: nick || os.userInfo().username,
        description: 'VillagersLauncher',
        config: secret.autoApprove ? { authorized: true } : {}
      });
    } catch (e) { console.error('member name failed', e); }
  }
  if (secret.apiToken) store.setSecret('zt:' + secret.networkId, secret.apiToken);
  const list = joinedList().filter((n) => n.networkId !== secret.networkId);
  list.push({ name: entry.name, networkId: secret.networkId, autoApprove: !!secret.autoApprove, joinedAt: Date.now() });
  saveJoined(list);
  return { networkId: secret.networkId, autoApprove: !!secret.autoApprove };
}

async function leave(networkId) {
  try { await local('DELETE', `/network/${networkId}`); } catch (_) {}
  saveJoined(joinedList().filter((n) => n.networkId !== networkId));
  store.setSecret('zt:' + networkId, null);
}

async function members(networkId) {
  const token = store.getSecret('zt:' + networkId) || store.getSecret('ztApiToken');
  if (!token) return null;
  const list = await central('GET', `/network/${networkId}/member`, token);
  const now = Date.now();
  return list.map((m) => ({
    nodeId: m.nodeId,
    name: m.name || m.nodeId,
    authorized: !!(m.config && m.config.authorized),
    ips: (m.config && m.config.ipAssignments) || [],
    online: !!(m.lastSeen && now - m.lastSeen < 5 * 60e3) || !!(m.lastOnline && now - m.lastOnline < 5 * 60e3),
    lastSeen: m.lastSeen || m.lastOnline || 0
  })).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
}

// ---------- автор: создание сетей и заявки ----------
async function setApiToken(token) {
  if (!token) { store.setSecret('ztApiToken', null); return { ok: true }; }
  const me = await central('GET', '/status', token);
  store.setSecret('ztApiToken', token);
  return { ok: true, user: me && me.user && (me.user.displayName || me.user.email) };
}

function ownerToken() {
  const t = store.getSecret('ztApiToken');
  if (!t) throw new Error('Сначала добавь API-токен ZeroTier');
  return t;
}

async function createNetwork({ name, password, autoApprove }) {
  name = String(name || '').trim();
  if (name.length < 3) throw new Error('Имя сети — минимум 3 символа');
  if (String(password || '').length < 4) throw new Error('Пароль — минимум 4 символа');
  const token = ownerToken();
  const reg = await readRegistry();
  if ((reg.networks || []).some((n) => n.name.toLowerCase() === name.toLowerCase())) throw new Error('Сеть с таким именем уже есть');
  const third = 20 + Math.floor(Math.random() * 200);
  const net = await central('POST', '/network', token, {
    config: {
      name: 'MineVillagers: ' + name,
      private: true,
      enableBroadcast: true,
      multicastLimit: 64,
      v4AssignMode: { zt: true },
      ipAssignmentPools: [{ ipRangeStart: `10.147.${third}.1`, ipRangeEnd: `10.147.${third}.254` }],
      routes: [{ target: `10.147.${third}.0/24` }]
    }
  });
  const networkId = net.id || (net.config && net.config.id);
  const entry = { name, created: Date.now(), ...encrypt({ networkId, apiToken: token, autoApprove: !!autoApprove }, password) };
  reg.networks = [...(reg.networks || []), entry];
  await writeRegistry(reg);
  const own = store.get().ztOwned || [];
  store.set({ ztOwned: [...own, { name, networkId, autoApprove: !!autoApprove }] });
  return { networkId };
}

async function deleteNetwork(networkId) {
  const token = ownerToken();
  const own = store.get().ztOwned || [];
  const item = own.find((n) => n.networkId === networkId);
  try { await central('DELETE', `/network/${networkId}`, token); } catch (e) { console.error(e); }
  if (item) {
    const reg = await readRegistry();
    reg.networks = (reg.networks || []).filter((n) => n.name.toLowerCase() !== item.name.toLowerCase());
    await writeRegistry(reg);
  }
  store.set({ ztOwned: own.filter((n) => n.networkId !== networkId) });
  await leave(networkId);
}

async function authorize(networkId, nodeId, allow) {
  const token = store.getSecret('ztApiToken') || store.getSecret('zt:' + networkId);
  if (!token) throw new Error('Нет доступа к управлению сетью');
  if (allow) await central('POST', `/network/${networkId}/member/${nodeId}`, token, { config: { authorized: true } });
  else await central('DELETE', `/network/${networkId}/member/${nodeId}`, token);
}

module.exports = { status, setup, join, leave, members, setApiToken, createNetwork, deleteNetwork, authorize, joinedList, readRegistry };
