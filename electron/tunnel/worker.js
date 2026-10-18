// Туннель «как Radmin», но без установки и аккаунтов. Живёт в скрытом окне лаунчера (там есть WebRTC из Chromium).
//  • Комната = имя + пароль. Найти друг друга помогают публичные MQTT-брокеры (только «рукопожатие», и оно зашифровано
//    паролем комнаты: брокер видит лишь шум).
//  • Дальше — прямое соединение компьютер↔компьютер (WebRTC, пробивает домашние роутеры через STUN), каждое
//    подключение игры — свой канал. Если задан TURN-сервер в настройках — через него, когда напрямую не выходит.
//  • У гостя игра видит комнату как мир в локальной сети (объявление LAN) и подключается к 127.0.0.1:порт.
'use strict';
const { ipcRenderer } = require('electron');
const net = require('net');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Mqtt } = require('./mqtt.js');
const upnp = require('./upnp.js');

const CHUNK = 16 * 1024;
const HIGH = 4 * 1024 * 1024;
const VERSION = 1;

let room = null; // текущая комната (хост или гость)
const log = (s) => { if (room) { room.log.push(`[${new Date().toLocaleTimeString()}] ${s}`); if (room.log.length > 200) room.log.shift(); } push(); };

// ---------------- шифрование ----------------
function roomIdOf(name) { return crypto.createHash('sha256').update('vl-room-v1:' + name.trim().toLowerCase()).digest('hex').slice(0, 32); }
function keyOf(id, password) { return crypto.pbkdf2Sync(String(password), 'vl-room:' + id, 120000, 32, 'sha256'); }
function seal(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ v: VERSION, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') });
}
function open(key, text) {
  try {
    const m = JSON.parse(text);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(m.iv, 'base64'));
    d.setAuthTag(Buffer.from(m.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(m.ct, 'base64')), d.final()]).toString('utf8'));
  } catch (_) { return null; }
}

// ---------------- сигналы через брокеры ----------------
class Signal {
  constructor(brokers, key, onMsg, onState) {
    this.key = key;
    this.seen = new Map();
    this.clients = brokers.map((u) => new Mqtt(u, (topic, text) => {
      const m = open(this.key, text);
      if (!m || !m.mid) return;
      if (this.seen.has(m.mid)) return;
      this.seen.set(m.mid, Date.now());
      if (this.seen.size > 2000) for (const [k, t] of this.seen) if (Date.now() - t > 120000) this.seen.delete(k);
      if (m.at && Math.abs(Date.now() - m.at) > (m.presence ? 60e3 : 10 * 60e3)) return; // старьё (и «комната открыта» от упавшего хоста)
      onMsg(topic, m);
    }, () => onState && onState(this.online())));
  }
  online() { return this.clients.filter((c) => c.ready).length; }
  sub(topic) { for (const c of this.clients) c.subscribe(topic); }
  pub(topic, obj, retain) {
    const text = seal(this.key, { ...obj, mid: crypto.randomBytes(8).toString('hex'), at: Date.now() });
    let n = 0;
    for (const c of this.clients) if (c.publish(topic, text, retain)) n++;
    return n;
  }
  clearRetained(topic) { for (const c of this.clients) if (c.ready) c.raw(Buffer.concat([Buffer.from([0x31]), Buffer.from(varLen(topic)), strBuf(topic)])); }
  close() { for (const c of this.clients) c.close(); }
}
function strBuf(s) { const b = Buffer.from(s, 'utf8'); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]); }
function varLen(topic) { let n = strBuf(topic).length; const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }

// ---------------- трубы: TCP ↔ канал ----------------
function pipe(sock, dc, stats) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 512 * 1024;
  const queue = [];
  const sendBuf = (d) => {
    for (let o = 0; o < d.length; o += CHUNK) dc.send(d.subarray(o, Math.min(d.length, o + CHUNK)));
    stats.up += d.length;
    if (dc.bufferedAmount > HIGH) sock.pause();
  };
  sock.on('data', (d) => { if (dc.readyState === 'open') sendBuf(d); else queue.push(d); });
  dc.onopen = () => { while (queue.length) sendBuf(queue.shift()); };
  if (dc.readyState === 'open') dc.onopen();
  dc.onbufferedamountlow = () => sock.resume();
  dc.onmessage = (e) => { const b = Buffer.from(e.data); stats.down += b.length; sock.write(b); };
  const end = () => { try { dc.close(); } catch (_) {} try { sock.destroy(); } catch (_) {} };
  sock.on('close', end);
  sock.on('error', end);
  dc.onclose = end;
  dc.onerror = end;
}

async function routeOf(pc) {
  try {
    const st = await pc.getStats();
    let pair = null;
    st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); });
    if (!pair) st.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
    if (!pair) return null;
    const l = st.get(pair.localCandidateId), r = st.get(pair.remoteCandidateId);
    const relay = (l && l.candidateType === 'relay') || (r && r.candidateType === 'relay');
    const lan = l && r && l.candidateType === 'host' && r.candidateType === 'host';
    return { kind: relay ? 'relay' : lan ? 'lan' : 'direct', rtt: pair.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : null };
  } catch (_) { return null; }
}

// ---------------- запасной путь: прямой TCP через проброс порта (UPnP) ----------------
// гость шлёт «VLT1» + nonce(12) + HMAC(16) + длина ника(1, 255 = только проверка) + ник; хозяин проверяет пароль комнаты
function preamble(key, nick) {
  const nonce = crypto.randomBytes(12);
  const nb = nick == null ? Buffer.alloc(0) : Buffer.from(String(nick).slice(0, 32), 'utf8');
  const len = Buffer.from([nick == null ? 255 : nb.length]);
  const mac = crypto.createHmac('sha256', key).update(Buffer.concat([Buffer.from('vlt'), nonce, len, nb])).digest().subarray(0, 16);
  return Buffer.concat([Buffer.from('VLT1'), nonce, mac, len, nb]);
}

function startDirect(r) {
  const srv = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    const t = setTimeout(() => sock.destroy(), 10000);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length < 33) return;
      const len = buf[32] === 255 ? 0 : buf[32];
      if (buf.length < 33 + len) return;
      sock.removeListener('data', onData);
      clearTimeout(t);
      const head = buf.subarray(0, 33 + len), rest = buf.subarray(33 + len);
      const want = crypto.createHmac('sha256', r.key).update(Buffer.concat([Buffer.from('vlt'), head.subarray(4, 16), head.subarray(32)])).digest().subarray(0, 16);
      if (head.subarray(0, 4).toString() !== 'VLT1' || !crypto.timingSafeEqual(want, head.subarray(16, 32))) { sock.destroy(); return; }
      if (buf[32] === 255) { sock.end('OK'); return; } // проверка связи
      const nick = head.subarray(33).toString('utf8') || 'гость';
      const target = hostTarget(r);
      if (!target) { log(`${nick} (через проброс порта) пытается зайти, но ${r.mode === 'server' ? 'сервер не запущен' : 'мир ещё не открыт для сети'}`); sock.destroy(); return; }
      const up = net.connect({ host: '127.0.0.1', port: target });
      r.directConns = (r.directConns || 0) + 1;
      if (!r.directSeen) r.directSeen = new Set();
      if (!r.directSeen.has(nick)) { r.directSeen.add(nick); log(`${nick} зашёл через проброс порта`); }
      if (rest.length) up.write(rest);
      sock.on('data', (x) => { r.stats.down += x.length; });
      up.on('data', (x) => { r.stats.up += x.length; });
      sock.pipe(up); up.pipe(sock);
      const end = () => { sock.destroy(); up.destroy(); };
      sock.on('error', end); up.on('error', end); sock.on('close', end); up.on('close', () => { r.directConns = Math.max(0, r.directConns - 1); end(); push(); });
      push();
    };
    sock.on('data', onData);
    sock.on('error', () => {});
  });
  srv.on('error', (e) => log('Проброс: ' + e.message));
  srv.listen(0, '0.0.0.0', async () => {
    r.directServer = srv;
    const port = srv.address().port;
    const res = await upnp.map(port).catch((e) => ({ ok: false, why: e.message }));
    if (room !== r) { if (res.cleanup) res.cleanup(); return; }
    r.upnpCleanup = res.cleanup;
    if (res.ok) { r.direct = { ip: res.ip, port: res.port }; log(`Порт на роутере открыт (${res.ip}:${res.port}) — если напрямую не пробьётся, друзья зайдут через него`); }
    else { r.directWhy = res.why; log('Проброс порта не вышел: ' + res.why); }
    if (r.announce) r.announce();
    push();
  });
}

function probeDirect(r, d) {
  return new Promise((resolve) => {
    const s = net.connect({ host: d.ip, port: d.port });
    let ok = false;
    const t = setTimeout(() => { s.destroy(); resolve(false); }, 6000);
    s.on('connect', () => s.write(preamble(r.key, null)));
    s.on('data', (x) => { if (x.toString().startsWith('OK')) ok = true; });
    s.on('close', () => { clearTimeout(t); resolve(ok); });
    s.on('error', () => {});
  });
}

async function tryDirect(r, why) {
  if (room !== r || r.route && r.route.kind === 'tcp' || r.tryingDirect) return false;
  const d = r.hostInfo && r.hostInfo.direct;
  if (!d) return false;
  r.tryingDirect = true;
  log(why + ' Пробую через проброс порта хозяина…');
  const ok = await probeDirect(r, d);
  r.tryingDirect = false;
  if (room !== r) return false;
  if (!ok) { log('Через проброс порта тоже не вышло (порт закрыт брандмауэром хозяина или провайдером)'); return false; }
  r.status = 'connected';
  r.error = null;
  clearTimeout(r.giveUp);
  r.route = { kind: 'tcp', rtt: null };
  await openLocal(r);
  log(`Соединение есть (через проброс порта). В игре: «Сетевая игра» → мир «${r.name}», или 127.0.0.1:${r.port}`);
  push();
  return true;
}

// что видно о соединении (для подсказки, почему не пробилось)
function candKinds(set, cand) {
  const m = /typ (\w+)/.exec(typeof cand === 'string' ? cand : (cand && cand.candidate) || '');
  if (m) set.add(m[1]);
}
function iceWhy(mine, theirs) {
  const a = mine.has('srflx') || mine.has('relay'), b = theirs.has('srflx') || theirs.has('relay');
  if (!a && !b) return 'Ни у кого не нашёлся внешний адрес — похоже, провайдеры не пускают к STUN-серверам.';
  if (!a) return 'У тебя не нашёлся внешний адрес (STUN недоступен) — у друга есть.';
  if (!b) return 'У друга не нашёлся внешний адрес (STUN недоступен) — у тебя есть.';
  return 'Внешние адреса есть у обоих, но роутеры/провайдеры не пропускают напрямую (строгий NAT).';
}

// ---------------- общее ----------------
function base(id) { return `villagerslauncher/v1/${id}`; }
function rnd() { return crypto.randomBytes(6).toString('hex'); }

function snapshot() {
  if (!room) return { active: false };
  return {
    active: true, role: room.role, name: room.name, mode: room.mode, status: room.status, error: room.error || null,
    brokers: room.sig ? room.sig.online() : 0, brokersTotal: room.brokers.length,
    port: room.port || null, target: room.role === 'host' ? room.targetDesc : null,
    direct: room.role === 'host' ? room.direct || null : null, directWhy: room.role === 'host' ? room.directWhy || null : null,
    host: room.hostInfo || null, route: room.route || null, notice: room.notice || null,
    peers: room.role === 'host' ? [...room.peers.values()].map((p) => ({ id: p.id, nick: p.nick, state: p.state, route: p.route, conns: p.conns })) : [],
    stats: room.stats, log: room.log.slice(-60)
  };
}
let pushT = null;
function push() { if (pushT) return; pushT = setTimeout(() => { pushT = null; ipcRenderer.send('tunnel-state', snapshot()); }, 120); }

function newPc(opts) {
  return new RTCPeerConnection({ iceServers: opts.iceServers, iceCandidatePoolSize: 2 });
}

// ---------------- ХОСТ ----------------
function lanPortFromFile(gameDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(gameDir, 'netkokk', 'lan.json'), 'utf8'));
    if (j && j.port && Date.now() - (j.at || 0) < 12 * 3600e3) return j.port;
  } catch (_) {}
  return null;
}

// порт открытого мира — из лога игры («Started serving on 51234» после «Открыть для сети»)
function lanPortFromLog(gameDir) {
  try {
    const f = path.join(gameDir, 'logs', 'latest.log');
    const st = fs.statSync(f);
    const fd = fs.openSync(f, 'r');
    const len = Math.min(st.size, 1024 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const all = [...text.matchAll(/Started serving on (\d+)/g)];
    if (!all.length) return null;
    const last = all[all.length - 1];
    // мир закрыт или игра вышла после этого — порт уже не тот
    const after = text.slice(last.index);
    if (/Stopping server|Stopping!|Saving worlds/.test(after.split('\n').slice(1).join('\n'))) return null;
    return Number(last[1]);
  } catch (_) { return null; }
}

function startLanSniffer(r) {
  // «Мой мир»: порт открытого мира узнаём из его объявления в локальной сети (так делает и сама игра)
  const own = new Set(['127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4') own.add(a.address);
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  s.on('message', (msg, rinfo) => {
    if (!own.has(rinfo.address)) return;
    const m = /\[AD\](\d+)\[\/AD\]/.exec(msg.toString('utf8'));
    const motd = /\[MOTD\]([\s\S]*?)\[\/MOTD\]/.exec(msg.toString('utf8'));
    if (m && !/через лаунчер/.test(motd ? motd[1] : '')) {
      const p = Number(m[1]);
      if (p !== r.lanPort) { r.lanPort = p; log(`Нашёл открытый мир на порту ${p}`); }
      r.lanSeen = Date.now();
    }
  });
  s.on('error', () => {});
  s.bind(4445, () => { try { s.addMembership('224.0.2.60'); } catch (_) {} });
  r.sniffer = s;
}

function hostTarget(r) {
  if (r.mode === 'server') return r.serverPort;
  const f = lanPortFromFile(r.gameDir) || lanPortFromLog(r.gameDir);
  if (f) return f;
  if (r.lanPort && Date.now() - (r.lanSeen || 0) < 20000) return r.lanPort;
  return null;
}

function startHost(opts) {
  const id = roomIdOf(opts.name);
  const r = room = {
    role: 'host', name: opts.name, mode: opts.mode, id, gameDir: opts.gameDir, serverPort: opts.serverPort || 25565,
    brokers: opts.brokers, peers: new Map(), status: 'starting', log: [], stats: { up: 0, down: 0 }, nick: opts.nick, opts
  };
  const B = base(id);
  r.key = keyOf(id, opts.password);
  r.sig = new Signal(opts.brokers, r.key, (topic, m) => onHostMsg(r, m), (n) => { if (room === r) { r.status = n ? 'open' : 'offline'; push(); } });
  r.sig.sub(`${B}/host`);
  if (r.mode === 'world') startLanSniffer(r);
  if (opts.upnp !== false) startDirect(r);
  const announce = () => {
    const t = hostTarget(r);
    r.targetDesc = r.mode === 'server' ? `сервер сборки, порт ${r.serverPort}` : t ? `мой мир, порт ${t}` : 'мир ещё не открыт для сети';
    r.sig.pub(`${B}/presence`, { presence: true, host: r.nick, mode: r.mode, ready: !!t, players: [...r.peers.values()].filter((p) => p.state === 'connected').length + (r.directConns ? 1 : 0), direct: r.direct || null, ver: VERSION }, true);
    push();
  };
  r.announce = announce;
  r.presenceT = setInterval(announce, 15000);
  setTimeout(announce, 1500);
  log(`Комната «${r.name}» открыта. Друзья входят по имени и паролю.`);
}

function onHostMsg(r, m) {
  if (room !== r || !m.from) return;
  const B = base(r.id);
  if (m.t === 'hello') {
    let p = r.peers.get(m.from);
    if (p && p.state === 'connected' && p.session === m.session) return; // повтор
    if (p) closePeer(p);
    p = { id: m.from, session: m.session, nick: String(m.nick || 'гость').slice(0, 32), state: 'connecting', conns: 0, pc: newPc(r.opts), mine: new Set(), theirs: new Set() };
    r.peers.set(m.from, p);
    log(`${p.nick} стучится в комнату…`);
    const to = `${B}/p/${m.from}`;
    p.pc.onicecandidate = (e) => { if (e.candidate) { candKinds(p.mine, e.candidate); r.sig.pub(to, { t: 'ice', from: 'host', session: m.session, c: e.candidate.toJSON() }); } };
    p.pc.onconnectionstatechange = async () => {
      const st = p.pc.connectionState;
      if (st === 'connected') {
        p.state = 'connected';
        p.route = await routeOf(p.pc);
        log(`${p.nick} подключён (${p.route && p.route.kind === 'relay' ? 'через ретранслятор' : p.route && p.route.kind === 'lan' ? 'по локальной сети' : 'напрямую'})`);
      } else if (st === 'failed') {
        p.state = 'failed';
        log(`${p.nick}: напрямую не пробилось. ${iceWhy(p.mine, p.theirs)}${r.direct ? ' Он попробует через проброс порта.' : r.directWhy ? ' Проброс порта у тебя тоже не вышел: ' + r.directWhy : ''}`);
      }
      else if (st === 'disconnected' || st === 'closed') { if (p.state === 'connected') log(`${p.nick} отключился`); p.state = st; }
      push();
    };
    const tell = (text) => { try { if (p.ctl && p.ctl.readyState === 'open') p.ctl.send(JSON.stringify({ t: 'err', text })); } catch (_) {} };
    p.pc.ondatachannel = (e) => {
      const dc = e.channel;
      if (dc.label === 'ctl') return;
      const target = hostTarget(r);
      if (!target) {
        try { dc.close(); } catch (_) {}
        const why = r.mode === 'server' ? 'Сервер сборки у хозяина не запущен' : 'Хозяин ещё не открыл мир для сети (Esc → «Открыть для сети»)';
        log(`${p.nick} пытается зайти, но ${r.mode === 'server' ? 'сервер не запущен' : 'мир ещё не открыт для сети'}`);
        tell(why);
        return;
      }
      const sock = net.connect({ host: '127.0.0.1', port: target });
      sock.once('error', (err) => {
        const why = r.mode === 'server' ? `Сервер сборки у хозяина не отвечает (порт ${target})` : `Мир хозяина не отвечает (порт ${target}) — открой его для сети заново`;
        log(why + ': ' + err.code);
        tell(why);
      });
      p.conns++;
      sock.on('close', () => { p.conns = Math.max(0, p.conns - 1); push(); });
      pipe(sock, dc, r.stats);
      push();
    };
    p.ctl = p.pc.createDataChannel('ctl');
    p.pc.createOffer().then((o) => p.pc.setLocalDescription(o)).then(() => {
      r.sig.pub(to, { t: 'offer', from: 'host', session: m.session, sdp: p.pc.localDescription.toJSON(), mode: r.mode, host: r.nick });
    }).catch((e) => log('offer: ' + e.message));
    push();
  } else if (m.t === 'answer') {
    const p = r.peers.get(m.from);
    if (p && p.session === m.session) p.pc.setRemoteDescription(m.sdp).catch((e) => log('answer: ' + e.message));
  } else if (m.t === 'ice') {
    const p = r.peers.get(m.from);
    if (p && p.session === m.session) { candKinds(p.theirs, m.c); p.pc.addIceCandidate(m.c).catch(() => {}); }
  } else if (m.t === 'bye') {
    const p = r.peers.get(m.from);
    if (p) { log(`${p.nick} вышел из комнаты`); closePeer(p); r.peers.delete(m.from); push(); }
  }
}

function closePeer(p) { try { p.pc.close(); } catch (_) {} p.state = 'closed'; }

// ---------------- ГОСТЬ ----------------
function freePort(pref) {
  return new Promise((resolve) => {
    const tryPort = (port, left) => {
      const s = net.createServer();
      s.once('error', () => (left > 0 ? tryPort(port + 1, left - 1) : tryPort(0, 0)));
      s.listen(port, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    };
    tryPort(pref, 20);
  });
}

function startJoin(opts) {
  const id = roomIdOf(opts.name);
  const me = rnd();
  const r = room = {
    role: 'guest', name: opts.name, id, me, session: rnd(), brokers: opts.brokers, status: 'searching', log: [], stats: { up: 0, down: 0 }, opts, conns: 0
  };
  const B = base(id);
  r.key = keyOf(id, opts.password);
  r.mine = new Set(); r.theirs = new Set();
  r.sig = new Signal(opts.brokers, r.key, (topic, m) => onGuestMsg(r, m), () => push());
  r.sig.sub(`${B}/p/${me}`);
  r.sig.sub(`${B}/presence`);
  const hello = () => {
    if (room !== r || r.status === 'connected') return;
    r.sig.pub(`${B}/host`, { t: 'hello', from: me, session: r.session, nick: opts.nick });
  };
  r.helloT = setInterval(hello, 3000);
  setTimeout(hello, 800);
  r.giveUp = setTimeout(() => {
    if (room === r && r.status !== 'connected') {
      r.status = 'error';
      r.error = r.hostInfo ? 'Хозяин комнаты не отвечает. Возможно, у него строгий NAT — нужен TURN-сервер в настройках сети.' : 'Комната не найдена или неверный пароль (хозяин должен быть онлайн с открытой комнатой).';
      log(r.error);
    }
  }, 45000);
  log(`Ищу комнату «${r.name}»…`);
}

function onGuestMsg(r, m) {
  if (room !== r) return;
  const B = base(r.id);
  if (m.presence) {
    r.hostInfo = { nick: m.host, mode: m.mode, ready: m.ready, players: m.players, direct: m.direct || null };
    if (r.status === 'searching') {
      r.status = 'found';
      log(`Комната найдена: хозяин ${m.host}`);
      // если за 20 секунд напрямую не соединилось — пробуем проброс порта хозяина
      setTimeout(() => { if (room === r && r.status !== 'connected') tryDirect(r, 'Напрямую долго не соединяется.'); }, 20000);
    }
    push();
    return;
  }
  if (m.session !== r.session) return;
  if (m.t === 'offer') {
    if (r.pc) try { r.pc.close(); } catch (_) {}
    const pc = r.pc = newPc(r.opts);
    r.hostInfo = { ...(r.hostInfo || {}), nick: m.host, mode: m.mode };
    pc.onicecandidate = (e) => { if (e.candidate) { candKinds(r.mine, e.candidate); r.sig.pub(`${B}/host`, { t: 'ice', from: r.me, session: r.session, c: e.candidate.toJSON() }); } };
    pc.onconnectionstatechange = async () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        r.status = 'connected';
        clearTimeout(r.giveUp);
        r.route = await routeOf(pc);
        await openLocal(r);
        log(`Соединение с ${m.host} есть (${r.route && r.route.kind === 'relay' ? 'через ретранслятор' : r.route && r.route.kind === 'lan' ? 'по локальной сети' : 'напрямую'}${r.route && r.route.rtt != null ? ', пинг ' + r.route.rtt + ' мс' : ''}). В игре: «Сетевая игра» → мир «${r.name}», или адрес 127.0.0.1:${r.port}`);
      } else if (st === 'failed') {
        if (r.route && r.route.kind === 'tcp') return;
        const why = iceWhy(r.mine, r.theirs);
        tryDirect(r, 'Напрямую не пробилось. ' + why).then((ok) => {
          if (ok || room !== r) return;
          r.status = 'error';
          r.error = 'Не удалось соединиться. ' + why + (r.hostInfo && r.hostInfo.direct ? '' : ' Проброс порта у хозяина не включился (роутер без UPnP или «серый» IP).') + ' Попробуйте, чтобы хостом был другой, или включите VPN.';
          log(r.error);
          push();
        });
      } else if (st === 'disconnected') {
        if (r.status === 'connected') { r.status = 'reconnecting'; log('Связь пропала, переподключаюсь…'); r.session = rnd(); }
      }
      push();
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label !== 'ctl') return;
      e.channel.onmessage = (ev) => {
        try { const msg = JSON.parse(String(ev.data)); if (msg.t === 'err') { r.notice = msg.text; log('Хозяин: ' + msg.text); } } catch (_) {}
      };
    };
    pc.setRemoteDescription(m.sdp).then(() => pc.createAnswer()).then((a) => pc.setLocalDescription(a)).then(() => {
      r.sig.pub(`${B}/host`, { t: 'answer', from: r.me, session: r.session, sdp: pc.localDescription.toJSON() });
    }).catch((e) => log('answer: ' + e.message));
    if (r.status !== 'connected') r.status = 'connecting';
    push();
  } else if (m.t === 'ice' && r.pc) {
    candKinds(r.theirs, m.c);
    r.pc.addIceCandidate(m.c).catch(() => {});
  }
}

async function openLocal(r) {
  if (r.server) return;
  r.port = await freePort(r.opts.localPort || 25565);
  let n = 0;
  r.server = net.createServer((sock) => {
    if (r.route && r.route.kind === 'tcp' && r.hostInfo && r.hostInfo.direct) {
      const d = r.hostInfo.direct;
      const up = net.connect({ host: d.ip, port: d.port });
      up.write(preamble(r.key, r.opts.nick));
      r.conns++;
      sock.on('data', (x) => { r.stats.up += x.length; });
      up.on('data', (x) => { r.stats.down += x.length; });
      sock.pipe(up); up.pipe(sock);
      const end = () => { sock.destroy(); up.destroy(); };
      sock.on('error', end); up.on('error', end); up.on('close', end);
      sock.on('close', () => { r.conns = Math.max(0, r.conns - 1); end(); push(); });
      push();
      return;
    }
    if (!r.pc || r.pc.connectionState !== 'connected') { sock.destroy(); return; }
    const dc = r.pc.createDataChannel('c' + (++n), { ordered: true });
    r.notice = null;
    r.conns++;
    sock.on('close', () => { r.conns = Math.max(0, r.conns - 1); push(); });
    pipe(sock, dc, r.stats);
    push();
  });
  r.server.on('error', (e) => log('Порт: ' + e.message));
  r.server.listen(r.port, '127.0.0.1');
  // мир в списке «Сетевая игра»: объявление в локальную сеть этого компьютера
  const ann = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  ann.on('error', () => {});
  ann.bind(0, () => { try { ann.setMulticastLoopback(true); ann.setMulticastTTL(1); } catch (_) {} });
  const motd = `§a${r.name}§r — ${r.hostInfo && r.hostInfo.nick ? r.hostInfo.nick : 'друг'} (через лаунчер)`;
  r.annT = setInterval(() => {
    const msg = Buffer.from(`[MOTD]${motd}[/MOTD][AD]${r.port}[/AD]`, 'utf8');
    try { ann.send(msg, 4445, '224.0.2.60'); } catch (_) {}
    try { ann.send(msg, 4445, '127.0.0.1'); } catch (_) {}
  }, 1500);
  r.ann = ann;
  push();
}

// ---------------- выход ----------------
function leave() {
  const r = room;
  if (!r) return;
  try {
    const B = base(r.id);
    if (r.role === 'host') {
      r.sig.clearRetained(`${B}/presence`);
      for (const p of r.peers.values()) closePeer(p);
      clearInterval(r.presenceT);
      if (r.sniffer) r.sniffer.close();
      if (r.directServer) r.directServer.close();
      if (r.upnpCleanup) r.upnpCleanup();
    } else {
      r.sig.pub(`${B}/host`, { t: 'bye', from: r.me, session: r.session });
      clearInterval(r.helloT); clearTimeout(r.giveUp); clearInterval(r.annT);
      if (r.ann) r.ann.close();
      if (r.server) r.server.close();
      if (r.pc) r.pc.close();
    }
  } catch (_) {}
  const sig = r.sig;
  setTimeout(() => sig && sig.close(), 600);
  room = null;
  push();
}

// ---------------- команды из лаунчера ----------------
ipcRenderer.on('tunnel-cmd', (_e, c) => {
  try {
    if (c.cmd === 'host') { leave(); startHost(c.opts); }
    else if (c.cmd === 'join') { leave(); startJoin(c.opts); }
    else if (c.cmd === 'leave') leave();
    else if (c.cmd === 'state') push();
  } catch (e) {
    ipcRenderer.send('tunnel-state', { active: false, error: e.message });
  }
});
setInterval(async () => {
  if (!room) return;
  if (room.role === 'host') for (const p of room.peers.values()) if (p.state === 'connected') p.route = await routeOf(p.pc) || p.route;
  if (room.role === 'guest' && room.pc && room.status === 'connected') room.route = await routeOf(room.pc) || room.route;
  push();
}, 5000);
ipcRenderer.send('tunnel-ready');
