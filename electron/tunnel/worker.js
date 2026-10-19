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
const rc = require('./relaycore.js');

const CHUNK = 16 * 1024;
const HIGH = 4 * 1024 * 1024;
const VERSION = 1;

let room = null; // текущая комната (хост или гость)
const log = (s) => { if (room) { room.log.push(`[${new Date().toLocaleTimeString()}] ${s}`); if (room.log.length > 200) room.log.shift(); } push(); };

// ---------------- шифрование ----------------
function roomIdOf(name) { return crypto.createHash('sha256').update('vl-room-v1:' + name.trim().toLowerCase()).digest('hex').slice(0, 32); }
function keyOf(id, password) { return crypto.pbkdf2Sync(String(password), 'vl-room:' + id, 120000, 32, 'sha256'); }
// extra — открытые поля конверта (например, x25519-ключ отправителя для ретранслятора)
function seal(key, obj, extra) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ v: VERSION, ...(extra || {}), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') });
}
// key — ключ или функция (конверт) => ключ; во втором случае к сообщению добавляется _pk отправителя
function open(key, text) {
  try {
    const m = JSON.parse(text);
    const k = typeof key === 'function' ? key(m) : key;
    if (!k) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(m.iv, 'base64'));
    d.setAuthTag(Buffer.from(m.tag, 'base64'));
    const obj = JSON.parse(Buffer.concat([d.update(Buffer.from(m.ct, 'base64')), d.final()]).toString('utf8'));
    if (typeof key === 'function' && obj && typeof obj === 'object') obj._pk = m.pk;
    return obj;
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
  pub(topic, obj, retain, key, extra) {
    const text = seal(key || this.key, { ...obj, mid: crypto.randomBytes(8).toString('hex'), at: Date.now() }, extra);
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
  if (room !== r || r.route && r.route.kind === 'tcp' || r.tryingDirect || r.relayLeg) return false;
  const d = r.hostInfo && r.hostInfo.direct;
  if (!d) return false;
  r.tryingDirect = true;
  log(why + ' Пробую через проброс порта хозяина…');
  const ok = await probeDirect(r, d);
  r.tryingDirect = false;
  if (room !== r) return false;
  if (!ok) { log('Через проброс порта тоже не вышло (порт закрыт брандмауэром хозяина или провайдером)'); return false; }
  if (r.relayLeg || r.status === 'connected') return false; // пока проверяли, соединились иначе
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
  const extra = { relay: relaySnap(), relays: relaysVisible() };
  if (!room) return { active: false, ...extra };
  return {
    ...extra,
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

// ---------------- РЕТРАНСЛЯТОРЫ (лаунчеры друзей-добровольцев) ----------------
// Если хозяин и гость не пробились друг к другу, оба подключаются к третьему лаунчеру с включённым
// «Помогать друзьям соединяться». Он сводит две «ноги» по случайному токену и пересылает байты, не понимая их:
// всё зашифровано ключом комнаты (см. relaycore.js), а ни имени, ни пароля комнаты ретранслятор не знает.
const RELAY_TIMEOUT = 12000; // столько ждём прямое соединение, потом — через ретранслятор

// ждём сбора адресов (без «по капле»: сигналы через брокеры теряются, а hello/answer мы повторяем целиком)
function gathered(pc, ms) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
  });
}

// список ретрансляторов в сети (нужен, пока включена комната или свой ретранслятор)
let dir = null;
function dirNeed(brokers) {
  if (dir) return dir;
  const d = dir = { book: new rc.RelayDir() };
  d.sig = new Signal(brokers, rc.DIR_KEY, (topic, m) => {
    if (dir !== d) return;
    d.book.put(topic.slice(rc.RELAY_ROOT.length + 1), m);
    push();
  }, (n) => { if (n && relay) relay.announce(); push(); });
  d.sig.sub(`${rc.RELAY_ROOT}/+`);
  return d;
}
function dirMaybeStop() {
  if (!dir || relay || room) return;
  const d = dir;
  dir = null;
  setTimeout(() => d.sig.close(), 600);
}
function relaysVisible() { return dir ? dir.book.fresh(Date.now(), relay ? [relay.id] : []).length : null; }

// ---- роль ретранслятора ----
let relay = null;
const rlog = (s) => { if (relay) { relay.log.push(`[${new Date().toLocaleTimeString()}] ${s}`); if (relay.log.length > 60) relay.log.shift(); } push(); };

function startRelay(o) {
  stopRelay();
  const keys = rc.boxKeys();
  const R = relay = {
    id: rc.relayIdOf(keys.pub), keys, o, book: new rc.RelayBook(rc.RELAY_MAX_SESSIONS), legs: new Map(), boxes: new Map(),
    shaper: new rc.Shaper(o.maxKbps), pacer: new rc.Pacer((fn) => setTimeout(fn, 25)), bytes: 0, served: 0, log: [], optsKey: relayOptsKey(o)
  };
  const d = dirNeed(o.brokers);
  const keyFor = (env) => {
    if (!env || typeof env.pk !== 'string') return null;
    let k = R.boxes.get(env.pk);
    if (!k) {
      k = rc.boxShared(keys.priv, env.pk);
      if (!k) return null;
      if (R.boxes.size > 300) R.boxes.clear();
      R.boxes.set(env.pk, k);
    }
    return k;
  };
  R.sig = new Signal(o.brokers, keyFor, (topic, m) => onRelayMsg(R, m), () => push());
  R.sig.sub(`${rc.RELAY_ROOT}/${R.id}/in`);
  R.announce = () => {
    if (relay !== R || !dir) return;
    dir.sig.pub(`${rc.RELAY_ROOT}/${R.id}`, { v: rc.RELAY_V, id: R.id, pk: keys.pub, load: R.book.load, cap: rc.RELAY_MAX_SESSIONS }, true);
  };
  R.beatT = setInterval(R.announce, rc.RELAY_BEAT);
  setTimeout(R.announce, 1500);
  R.sweepT = setInterval(() => { for (const s of R.book.stale()) endRelaySession(R, s, 'вторая сторона не пришла'); }, 10000);
  if (d.sig.online()) R.announce();
  rlog(`Ретранслятор включён (до ${rc.RELAY_MAX_SESSIONS} сессий, до ${R.shaper.kbps} кбит/с)`);
}

function stopRelay() {
  const R = relay;
  if (!R) return;
  for (const s of [...R.book.sessions.values()]) endRelaySession(R, s, null);
  clearInterval(R.beatT); clearInterval(R.sweepT);
  if (dir) {
    dir.sig.pub(`${rc.RELAY_ROOT}/${R.id}`, { id: R.id, gone: true });
    dir.sig.clearRetained(`${rc.RELAY_ROOT}/${R.id}`);
  }
  const sig = R.sig;
  setTimeout(() => sig.close(), 600);
  relay = null;
  dirMaybeStop();
  push();
}

function relayOptsKey(o) { return JSON.stringify([o.brokers, o.iceServers]); }

function endRelaySession(R, s, why) {
  const legs = R.book.end(s);
  if (!legs.length && !s.links.size) return;
  for (const L of [...s.links]) L.close();
  for (const leg of legs) {
    try { if (leg.ctl && leg.ctl.readyState === 'open') leg.ctl.send(JSON.stringify({ t: 'gone' })); } catch (_) {}
    clearTimeout(leg.closeT);
    leg.closeT = setTimeout(() => { try { leg.pc.close(); } catch (_) {} }, 300);
    R.legs.delete(leg.tag);
  }
  if (s.paired && why) rlog(`Сессия закончилась (${why}), передано ${Math.round(s.bytes / 1024)} КБ`);
  if (relay === R) R.announce();
  push();
}

function onRelayMsg(R, m) {
  if (relay !== R || !m || typeof m.tag !== 'string' || !/^[0-9a-f]{12}$/.test(m.tag)) return;
  const key = R.boxes.get(m._pk);
  if (!key) return;
  const to = `${rc.RELAY_ROOT}/${R.id}/p/${m.tag}`;
  let leg = R.legs.get(m.tag);
  if (leg && leg.pk !== m._pk) return; // чужой ключ под тем же тегом
  if (m.t === 'hello') {
    if (leg) { if (leg.answer) R.sig.pub(to, { t: 'answer', sdp: leg.answer }, false, key); return; } // повтор hello
    if (!m.sdp || m.sdp.type !== 'offer' || typeof m.sdp.sdp !== 'string') return;
    leg = { tag: m.tag, pk: m._pk, key, ready: false, answer: null };
    const res = R.book.admit(String(m.token || ''), m.side, leg);
    if (!res.ok) { R.sig.pub(to, { t: res.why }, false, key); return; }
    if (res.replaced) { R.legs.delete(res.replaced.tag); try { res.replaced.pc.close(); } catch (_) {} }
    R.legs.set(m.tag, leg);
    const s = leg.session;
    const pc = leg.pc = newPc(R.o);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if ((st === 'failed' || st === 'closed') && R.legs.get(leg.tag) === leg) endRelaySession(R, s, st === 'failed' ? 'связь пропала' : 'отключились');
    };
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      if (dc.label === 'ctl') {
        leg.ctl = dc;
        dc.onopen = () => { leg.ready = true; relayPairCheck(R, s); };
        if (dc.readyState === 'open') dc.onopen();
        dc.onclose = () => { if (R.legs.get(leg.tag) === leg) endRelaySession(R, s, 'отключились'); };
        return;
      }
      relayMirror(R, leg, dc);
    };
    pc.setRemoteDescription(m.sdp).then(() => pc.createAnswer()).then((a) => pc.setLocalDescription(a)).then(() => gathered(pc, 2500)).then(() => {
      if (R.legs.get(leg.tag) !== leg) return;
      leg.answer = pc.localDescription.toJSON();
      R.sig.pub(to, { t: 'answer', sdp: leg.answer }, false, key);
    }).catch((e) => { rlog('answer: ' + e.message); endRelaySession(R, s, null); });
    push();
  } else if (m.t === 'bye' && leg) {
    endRelaySession(R, leg.session, 'отключились');
  }
}

function relayPairCheck(R, s) {
  if (s.paired || !R.book.ready(s)) return;
  s.paired = true;
  R.served++;
  for (const leg of [s.host, s.guest]) try { leg.ctl.send(JSON.stringify({ t: 'paired' })); } catch (_) {}
  for (const go of s.pending.splice(0)) go();
  rlog(`Помогаю соединиться паре игроков (сейчас сессий: ${R.book.active})`);
  R.announce();
}

// канал, открытый одной ногой, повторяем на другой ноге с той же меткой и связываем их
function relayMirror(R, leg, dc) {
  const s = leg.session;
  if (!R.book.allowLabel(leg, dc.label)) { try { dc.close(); } catch (_) {} return; }
  dc.binaryType = 'arraybuffer';
  const early = [];
  dc.onmessage = (e) => early.push(e.data);
  const go = () => {
    const other = R.book.other(leg);
    if (s.ended || !other || !other.pc || relay !== R) { try { dc.close(); } catch (_) {} return; }
    let dc2;
    try { dc2 = other.pc.createDataChannel(dc.label, { ordered: true }); } catch (_) { try { dc.close(); } catch (__) {} return; }
    const L = rc.link(dc, dc2, { shaper: R.shaper, pacer: R.pacer, onBytes: (n) => { R.bytes += n; s.bytes += n; } });
    s.links.add(L);
    L.onClose = () => s.links.delete(L);
    for (const x of early.splice(0)) L.ab.push(x);
  };
  if (s.paired) go(); else s.pending.push(go);
}

function relaySnap() {
  const R = relay;
  if (!R) return { on: false };
  return { on: true, id: R.id, sessions: R.book.active, waiting: R.book.load - R.book.active, cap: rc.RELAY_MAX_SESSIONS, kbps: R.shaper.kbps, bytes: R.bytes, served: R.served, brokers: R.sig.online(), log: R.log.slice(-10) };
}

// ---- нога хозяина или гостя к ретранслятору ----
// h: { onPaired(leg), onChannel(dc), onFail(why) }
function relayLeg(o, info, side, token, h) {
  const keys = rc.boxKeys();
  const key = rc.boxShared(keys.priv, info.pk);
  const tag = rnd();
  const RB = `${rc.RELAY_ROOT}/${info.id}`;
  const leg = { tag, token, relay: info, paired: false, closed: false };
  const out = (obj) => leg.sig.pub(`${RB}/in`, { ...obj, tag }, false, null, { pk: keys.pub });
  let hello = null, answered = false;
  const sendHello = () => { if (hello && !answered && !leg.closed) out(hello); };
  const fail = (why) => { if (leg.closed) return; leg.close(); h.onFail(why); };
  leg.close = () => {
    if (leg.closed) return;
    leg.closed = true;
    clearInterval(leg.helloT); clearTimeout(leg.giveUp);
    try { out({ t: 'bye' }); } catch (_) {}
    try { leg.pc.close(); } catch (_) {}
    setTimeout(() => leg.sig.close(), 600);
  };
  leg.sig = new Signal(o.brokers, key, (topic, m) => {
    if (leg.closed) return;
    if (m.t === 'answer' && !answered && m.sdp) {
      answered = true;
      leg.pc.setRemoteDescription(m.sdp).catch((e) => fail('ретранслятор: ' + e.message));
    } else if (m.t === 'busy') fail('ретранслятор занят');
    else if (m.t === 'bad') fail('ретранслятор не принял запрос');
  }, (n) => { if (n) sendHello(); });
  leg.sig.sub(`${RB}/p/${tag}`);
  const pc = leg.pc = newPc(o);
  leg.ctl = pc.createDataChannel('ctl');
  leg.ctl.onmessage = (e) => {
    let msg = null;
    try { msg = JSON.parse(String(e.data)); } catch (_) { return; }
    if (msg.t === 'paired' && !leg.paired) { leg.paired = true; clearTimeout(leg.giveUp); h.onPaired(leg); }
    else if (msg.t === 'gone') fail('другая сторона отключилась от ретранслятора');
  };
  leg.ctl.onclose = () => fail('связь с ретранслятором пропала');
  pc.ondatachannel = (e) => { if (!leg.closed) h.onChannel(e.channel); };
  pc.onconnectionstatechange = () => { const st = pc.connectionState; if (st === 'failed' || st === 'closed') fail('связь с ретранслятором пропала'); };
  pc.createOffer().then((of) => pc.setLocalDescription(of)).then(() => gathered(pc, 2500)).then(() => {
    hello = { t: 'hello', token, side, sdp: pc.localDescription.toJSON() };
    sendHello();
    leg.helloT = setInterval(sendHello, 3000);
  }).catch((e) => fail('ретранслятор: ' + e.message));
  leg.giveUp = setTimeout(() => fail('ретранслятор не ответил'), 25000);
  return leg;
}
async function legRoute(leg) { const x = await routeOf(leg.pc); return { kind: 'relay', rtt: x ? x.rtt : null }; }

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
  dirNeed(opts.brokers); // только чтобы показать, сколько ретрансляторов в сети
  if (r.mode === 'world') startLanSniffer(r);
  if (opts.upnp !== false) startDirect(r);
  const announce = () => {
    const t = hostTarget(r);
    r.targetDesc = r.mode === 'server' ? `сервер сборки, порт ${r.serverPort}` : t ? `мой мир, порт ${t}` : 'мир ещё не открыт для сети';
    r.sig.pub(`${B}/presence`, { presence: true, host: r.nick, mode: r.mode, ready: !!t, players: [...r.peers.values()].filter((p) => p.state === 'connected').length + (r.directConns ? 1 : 0), direct: r.direct || null, relayId: relay ? relay.id : null, ver: VERSION }, true);
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
    if (p && (p.state === 'connected' || p.relayLeg) && p.session === m.session) return; // повтор
    if (p) closePeer(p);
    p = { id: m.from, session: m.session, nick: String(m.nick || 'гость').slice(0, 32), state: 'connecting', conns: 0, pc: newPc(r.opts), mine: new Set(), theirs: new Set() };
    r.peers.set(m.from, p);
    log(`${p.nick} стучится в комнату…`);
    const to = `${B}/p/${m.from}`;
    p.pc.onicecandidate = (e) => { if (e.candidate) { candKinds(p.mine, e.candidate); r.sig.pub(to, { t: 'ice', from: 'host', session: m.session, c: e.candidate.toJSON() }); } };
    p.pc.onconnectionstatechange = async () => {
      if (p.relayLeg) return; // уже идём через ретранслятор
      const st = p.pc.connectionState;
      if (st === 'connected') {
        p.state = 'connected';
        p.route = await routeOf(p.pc);
        log(`${p.nick} подключён (${p.route && p.route.kind === 'relay' ? 'через ретранслятор' : p.route && p.route.kind === 'lan' ? 'по локальной сети' : 'напрямую'})`);
      } else if (st === 'failed') {
        p.state = 'failed';
        log(`${p.nick}: напрямую не пробилось. ${iceWhy(p.mine, p.theirs)}${r.direct ? ' Он попробует через проброс порта.' : r.directWhy ? ' Проброс порта у тебя тоже не вышел: ' + r.directWhy : ''} Попробуем через ретранслятор.`);
      }
      else if (st === 'disconnected' || st === 'closed') { if (p.state === 'connected') log(`${p.nick} отключился`); p.state = st; }
      push();
    };
    p.pc.ondatachannel = (e) => {
      if (e.channel.label === 'ctl') return;
      acceptGame(r, p, e.channel, (sock, dc) => pipe(sock, dc, r.stats));
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
  } else if (m.t === 'relay') {
    const p = r.peers.get(m.from);
    if (p && p.session === m.session) hostViaRelay(r, p, m);
  } else if (m.t === 'bye') {
    const p = r.peers.get(m.from);
    if (p) { log(`${p.nick} вышел из комнаты`); closePeer(p); r.peers.delete(m.from); push(); }
  }
}

// подключение игры гостя → к миру/серверу хозяина (wrap — простая труба или зашифрованная через ретранслятор)
function acceptGame(r, p, dc, wrap) {
  const target = hostTarget(r);
  if (!target) {
    try { dc.close(); } catch (_) {}
    const why = r.mode === 'server' ? 'Сервер сборки у хозяина не запущен' : 'Хозяин ещё не открыл мир для сети (Esc → «Открыть для сети»)';
    log(`${p.nick} пытается зайти, но ${r.mode === 'server' ? 'сервер не запущен' : 'мир ещё не открыт для сети'}`);
    tellPeer(p, why);
    return;
  }
  const sock = net.connect({ host: '127.0.0.1', port: target });
  sock.once('error', (err) => {
    const why = r.mode === 'server' ? `Сервер сборки у хозяина не отвечает (порт ${target})` : `Мир хозяина не отвечает (порт ${target}) — открой его для сети заново`;
    log(why + ': ' + err.code);
    tellPeer(p, why);
  });
  p.conns++;
  sock.on('close', () => { p.conns = Math.max(0, p.conns - 1); push(); });
  wrap(sock, dc);
  push();
}

function tellPeer(p, text) {
  try {
    const leg = p.relayLeg;
    if (leg && leg.paired) { // записка через ретранслятор — тоже зашифрована
      const dc = leg.pc.createDataChannel('n' + (++leg.notes));
      const box = new rc.Sealed(leg.sk, dc.label, 'host');
      dc.onopen = () => { try { dc.send(rc.sealNote(box, { t: 'err', text })); } catch (_) {} setTimeout(() => { try { dc.close(); } catch (_) {} }, 3000); };
      return;
    }
    if (p.ctl && p.ctl.readyState === 'open') p.ctl.send(JSON.stringify({ t: 'err', text }));
  } catch (_) {}
}

// гость не пробился напрямую и выбрал ретранслятор — подключаемся к нему же с тем же токеном
function hostViaRelay(r, p, m) {
  const info = m.relay || {};
  if (!rc.isToken(m.token) || typeof info.pk !== 'string' || rc.relayIdOf(info.pk) !== info.id) return;
  if (p.relayLeg && p.relayLeg.token === m.token) return; // повтор
  if (p.relayLeg) p.relayLeg.close();
  log(`${p.nick}: напрямую не вышло — соединяемся через ретранслятор…`);
  const sk = rc.sessionKey(r.key, m.token);
  const seen = new Set();
  const leg = relayLeg(r.opts, { id: info.id, pk: info.pk }, 'host', m.token, {
    onPaired: async () => {
      if (room !== r || p.relayLeg !== leg) return;
      p.state = 'connected';
      p.route = await legRoute(leg);
      log(`${p.nick} подключён через ретранслятор${p.route.rtt != null ? ' (до ретранслятора ' + p.route.rtt + ' мс)' : ''}`);
      push();
    },
    onChannel: (dc) => {
      if (room !== r || !/^c\d{1,9}$/.test(dc.label) || seen.has(dc.label)) { try { dc.close(); } catch (_) {} return; } // метка дважды = повтор шифротекста
      seen.add(dc.label);
      acceptGame(r, p, dc, (sock, ch) => rc.pipeSealed(sock, ch, r.stats, new rc.Sealed(sk, ch.label, 'host')));
    },
    onFail: (why) => {
      if (p.relayLeg !== leg) return;
      p.relayLeg = null;
      if (p.state !== 'closed') p.state = 'failed';
      log(`${p.nick}: через ретранслятор не вышло — ${why}`);
      push();
    }
  });
  leg.sk = sk;
  leg.notes = 0;
  p.relayLeg = leg;
  p.state = 'connecting';
  try { p.pc.close(); } catch (_) {} // прямую попытку бросаем
  push();
}

function closePeer(p) {
  if (p.relayLeg) { const leg = p.relayLeg; p.relayLeg = null; leg.close(); }
  try { p.pc.close(); } catch (_) {}
  p.state = 'closed';
}

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
  r.relayTried = [];
  dirNeed(opts.brokers); // заранее узнаём, какие ретрансляторы в сети
  r.sig = new Signal(opts.brokers, r.key, (topic, m) => onGuestMsg(r, m), () => push());
  r.sig.sub(`${B}/p/${me}`);
  r.sig.sub(`${B}/presence`);
  const hello = () => {
    if (room !== r || r.status === 'connected' || r.relayLeg) return;
    r.sig.pub(`${B}/host`, { t: 'hello', from: me, session: r.session, nick: opts.nick });
  };
  r.helloT = setInterval(hello, 3000);
  setTimeout(hello, 800);
  r.giveUp = setTimeout(() => {
    if (room === r && r.status !== 'connected' && !r.relayLeg && !r.falling) {
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
    r.hostInfo = { nick: m.host, mode: m.mode, ready: m.ready, players: m.players, direct: m.direct || null, relayId: m.relayId || null };
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
    if (r.relayLeg) return; // уже идём через ретранслятор
    // напрямую не соединилось за 12 секунд — пробуем проброс порта и ретранслятор
    if (!r.relayT) r.relayT = setTimeout(() => { if (room === r && r.status !== 'connected') fallback(r, 'Напрямую не соединяется 12 секунд.'); }, RELAY_TIMEOUT);
    if (r.pc) try { r.pc.close(); } catch (_) {}
    const pc = r.pc = newPc(r.opts);
    r.hostInfo = { ...(r.hostInfo || {}), nick: m.host, mode: m.mode };
    pc.onicecandidate = (e) => { if (e.candidate) { candKinds(r.mine, e.candidate); r.sig.pub(`${B}/host`, { t: 'ice', from: r.me, session: r.session, c: e.candidate.toJSON() }); } };
    pc.onconnectionstatechange = async () => {
      if (r.pc !== pc || r.relayLeg) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        r.status = 'connected';
        clearTimeout(r.relayT);
        clearTimeout(r.giveUp);
        r.route = await routeOf(pc);
        await openLocal(r);
        log(`Соединение с ${m.host} есть (${r.route && r.route.kind === 'relay' ? 'через ретранслятор' : r.route && r.route.kind === 'lan' ? 'по локальной сети' : 'напрямую'}${r.route && r.route.rtt != null ? ', пинг ' + r.route.rtt + ' мс' : ''}). В игре: «Сетевая игра» → мир «${r.name}», или адрес 127.0.0.1:${r.port}`);
      } else if (st === 'failed') {
        if (r.route && r.route.kind === 'tcp') return;
        fallback(r, 'Напрямую не пробилось. ' + iceWhy(r.mine, r.theirs));
      } else if (st === 'disconnected') {
        if (r.status === 'connected') { r.status = 'reconnecting'; log('Связь пропала, переподключаюсь…'); r.session = rnd(); r.relayT = null; }
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

// запасные пути гостя по порядку: проброс порта хозяина → ретранслятор → понятная ошибка (последний вариант — Radmin)
async function fallback(r, why) {
  if (room !== r || r.status === 'connected' || r.relayLeg || r.falling) return;
  r.falling = true;
  try {
    const ok = await tryDirect(r, why);
    if (ok || room !== r || r.status === 'connected') return;
    if (guestViaRelay(r, why)) return;
    fatal(r, why, relaysVisible() ? 'Свободных ретрансляторов сейчас нет.' : 'Ретрансляторов в сети сейчас нет.');
  } finally { r.falling = false; }
}

function fatal(r, why, relayWhy) {
  if (room !== r || r.status === 'connected') return;
  r.status = 'error';
  r.error = 'Не удалось соединиться. ' + why + (r.hostInfo && r.hostInfo.direct ? '' : ' Проброс порта у хозяина не включился (роутер без UPnP или «серый» IP).') +
    ' ' + relayWhy + ' Помочь может друг с включённым «Помогать друзьям соединяться» (раздел «Сеть»), TURN-сервер, или чтобы хостом был другой. Последний вариант — Radmin VPN: зайдите с хозяином в одну сеть Radmin.';
  log(r.error);
  push();
}

function guestViaRelay(r, why) {
  if (room !== r || r.relayLeg) return false;
  const exclude = [...r.relayTried, r.hostInfo && r.hostInfo.relayId, relay && relay.id].filter(Boolean);
  const pick = rc.selectRelay(dir ? dir.book.fresh() : [], Date.now(), exclude);
  if (!pick) return false;
  r.relayTried.push(pick.id);
  const token = rc.newToken();
  const sk = rc.sessionKey(r.key, token);
  const B = base(r.id);
  log(`${why} Соединяюсь через ретранслятор друга (${pick.id.slice(0, 6)}, загрузка ${pick.load}/${pick.cap})…`);
  r.status = 'connecting';
  clearTimeout(r.giveUp);
  if (r.pc) { const pc = r.pc; r.pc = null; try { pc.close(); } catch (_) {} } // прямую попытку бросаем
  const relayInfo = { id: pick.id, pk: pick.pk };
  const tellHost = () => { if (room === r && r.relayLeg === leg && !leg.paired) r.sig.pub(`${B}/host`, { t: 'relay', from: r.me, session: r.session, relay: relayInfo, token }); };
  const seen = new Set();
  const leg = relayLeg(r.opts, relayInfo, 'guest', token, {
    onPaired: async () => {
      if (room !== r || r.relayLeg !== leg) return;
      clearInterval(leg.tellT);
      r.status = 'connected';
      r.error = null;
      r.route = await legRoute(leg);
      await openLocal(r);
      log(`Соединение с ${r.hostInfo && r.hostInfo.nick ? r.hostInfo.nick : 'хозяином'} есть (через ретранслятор, всё зашифровано паролем комнаты). В игре: «Сетевая игра» → мир «${r.name}», или адрес 127.0.0.1:${r.port}`);
      push();
    },
    onChannel: (dc) => { // записки хозяина
      if (!/^n\d{1,9}$/.test(dc.label) || seen.has(dc.label)) { try { dc.close(); } catch (_) {} return; }
      seen.add(dc.label);
      const box = new rc.Sealed(sk, dc.label, 'guest');
      dc.binaryType = 'arraybuffer';
      dc.onmessage = (e) => { const msg = rc.openNote(box, e.data); if (msg && msg.t === 'err') { r.notice = String(msg.text).slice(0, 300); log('Хозяин: ' + r.notice); push(); } };
    },
    onFail: (w) => {
      if (room !== r || r.relayLeg !== leg) return;
      clearInterval(leg.tellT);
      r.relayLeg = null;
      if (leg.paired) { // была связь и пропала — начинаем заново (сначала напрямую)
        r.status = 'reconnecting'; r.route = null; r.session = rnd(); r.relayT = null; r.relayTried = [];
        log('Ретранслятор: ' + w + '. Переподключаюсь…');
        push();
        return;
      }
      log('Ретранслятор: ' + w + '.');
      if (!guestViaRelay(r, 'Пробую другой ретранслятор.')) fatal(r, why, 'Через ретранслятор тоже не вышло (' + w + ').');
      push();
    }
  });
  leg.sk = sk;
  r.relayLeg = leg;
  r.relaySk = sk;
  tellHost();
  leg.tellT = setInterval(tellHost, 3000);
  push();
  return true;
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
    const leg = r.relayLeg;
    const viaRelay = r.route && r.route.kind === 'relay' && leg && leg.paired;
    if (!viaRelay && (!r.pc || r.pc.connectionState !== 'connected')) { sock.destroy(); return; }
    const dc = (viaRelay ? leg.pc : r.pc).createDataChannel('c' + (++n), { ordered: true });
    r.notice = null;
    r.conns++;
    sock.on('close', () => { r.conns = Math.max(0, r.conns - 1); push(); });
    if (viaRelay) rc.pipeSealed(sock, dc, r.stats, new rc.Sealed(leg.sk, dc.label, 'guest'));
    else pipe(sock, dc, r.stats);
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
      clearInterval(r.helloT); clearTimeout(r.giveUp); clearInterval(r.annT); clearTimeout(r.relayT);
      if (r.relayLeg) { const leg = r.relayLeg; r.relayLeg = null; clearInterval(leg.tellT); leg.close(); }
      if (r.ann) r.ann.close();
      if (r.server) r.server.close();
      if (r.pc) r.pc.close();
    }
  } catch (_) {}
  const sig = r.sig;
  setTimeout(() => sig && sig.close(), 600);
  room = null;
  dirMaybeStop();
  push();
}

// ---------------- команды из лаунчера ----------------
ipcRenderer.on('tunnel-cmd', (_e, c) => {
  try {
    if (c.cmd === 'host') { leave(); startHost(c.opts); }
    else if (c.cmd === 'join') { leave(); startJoin(c.opts); }
    else if (c.cmd === 'leave') leave();
    else if (c.cmd === 'relay') { // включить/выключить/обновить роль ретранслятора
      const o = c.opts || {};
      if (!o.on) stopRelay();
      else if (relay && relay.optsKey === relayOptsKey(o)) { relay.shaper.set(o.maxKbps); relay.o = o; rlog(`Лимит скорости: ${relay.shaper.kbps} кбит/с`); }
      else startRelay(o);
    }
    else if (c.cmd === 'shutdown') { leave(); stopRelay(); }
    else if (c.cmd === 'state') push();
  } catch (e) {
    ipcRenderer.send('tunnel-state', { active: false, error: e.message });
  }
});
setInterval(async () => {
  if (!room) { if (relay) push(); return; }
  if (room.role === 'host') for (const p of room.peers.values()) if (p.state === 'connected') p.route = (p.relayLeg ? await legRoute(p.relayLeg) : await routeOf(p.pc)) || p.route;
  if (room.role === 'guest' && room.status === 'connected') {
    if (room.relayLeg && room.route && room.route.kind === 'relay') room.route = await legRoute(room.relayLeg);
    else if (room.pc) room.route = await routeOf(room.pc) || room.route;
  }
  push();
}, 5000);
ipcRenderer.send('tunnel-ready');
