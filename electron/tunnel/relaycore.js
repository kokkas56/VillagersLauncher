// Ретрансляторы из лаунчеров игроков (как relay-серверы Radmin, только ретранслятор — лаунчер друга-добровольца).
// Здесь только «чистая» логика без Electron и WebRTC — её можно проверить обычным node:
//  • сквозное шифрование хозяин↔гость (ретранслятор видит лишь случайный токен сессии и непрозрачные байты);
//  • ключи для сигналов к ретранслятору (x25519: брокер не видит, кто и куда подключается);
//  • пары «нога хозяина + нога гостя» по токену и ограничения (сессий, скорость, очереди);
//  • пересылка сообщений между каналами двух ног с учётом bufferedAmount;
//  • выбор наименее загруженного ретранслятора из свежих объявлений.
'use strict';
const crypto = require('crypto');

const RELAY_V = 1;
const RELAY_ROOT = 'villagerskokk/v1/relay';
const RELAY_BEAT = 30e3; // объявление «я ретранслятор» — раз в 30 с
const RELAY_STALE = 90e3; // старше — считаем пропавшим
const RELAY_MAX_SESSIONS = 3;
const RELAY_PAIR_TTL = 45e3; // половинка сессии ждёт вторую не дольше
const CHUNK = 16 * 1024;
const HIGH = 4 * 1024 * 1024;
const LOW = 512 * 1024;
const MAX_QUEUE = 8 * 1024 * 1024; // больше в очереди ретранслятора на один канал — рвём канал
const WINDOW = 2 * 1024 * 1024; // сквозное окно: столько можно отправить без подтверждения от другой стороны
const ACK_EVERY = 256 * 1024;
// объявления ретрансляторов публичные по смыслу (адрес-идентификатор, загрузка); ключ общий для всех лаунчеров
const DIR_KEY = crypto.createHash('sha256').update('villagerskokk-relay-directory-v1').digest();
const EMPTY = Buffer.alloc(0);

// ---------------- ключи для сигналов к ретранслятору (x25519) ----------------
const X25519_SPKI = Buffer.from('302a300506032b656e032100', 'hex');
function boxKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return { pub: publicKey.export({ type: 'spki', format: 'der' }).subarray(X25519_SPKI.length).toString('base64'), priv: privateKey };
}
function boxShared(priv, pubB64) {
  try {
    const raw = Buffer.from(String(pubB64), 'base64');
    if (raw.length !== 32) return null;
    const pub = crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, raw]), format: 'der', type: 'spki' });
    return Buffer.from(crypto.hkdfSync('sha256', crypto.diffieHellman({ privateKey: priv, publicKey: pub }), EMPTY, 'vl-relay-box-v1', 32));
  } catch (_) { return null; }
}
// id ретранслятора привязан к его ключу — чужой ключ под этим id не подсунуть
function relayIdOf(pubB64) {
  const raw = Buffer.from(String(pubB64 || ''), 'base64');
  return raw.length === 32 ? crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16) : null;
}
const isToken = (t) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t);
function newToken() { return crypto.randomBytes(16).toString('hex'); }

// ---------------- сквозное шифрование хозяин↔гость ----------------
// ключ сессии = HKDF(ключ комнаты, соль = токен сессии); у каждого канала и направления — свой ключ,
// nonce = счётчик сообщений (канал упорядоченный и надёжный, так что любой пропуск/повтор/подмена — обрыв канала)
function sessionKey(roomKey, token) { return Buffer.from(crypto.hkdfSync('sha256', roomKey, Buffer.from(token, 'hex'), 'vl-relay-e2e-v1', 32)); }
function chanKey(sk, label, from) { return Buffer.from(crypto.hkdfSync('sha256', sk, EMPTY, `vl-ch:${from}:${label}`, 32)); }
const T_DATA = 0, T_ACK = 1, T_NOTE = 2;

class Sealed {
  constructor(sk, label, side) {
    this.aad = Buffer.from(String(label), 'utf8');
    this.tx = chanKey(sk, label, side);
    this.rx = chanKey(sk, label, side === 'host' ? 'guest' : 'host');
    this.txN = 0n;
    this.rxN = 0n;
  }
  // [счётчик 8 байт][шифротекст: тип(1) + данные][тег 16]
  seal(type, data) {
    const n = Buffer.alloc(8);
    n.writeBigUInt64BE(this.txN++);
    const c = crypto.createCipheriv('aes-256-gcm', this.tx, Buffer.concat([Buffer.alloc(4), n]));
    c.setAAD(this.aad);
    const ct = Buffer.concat([c.update(Buffer.from([type])), c.update(data || EMPTY), c.final()]);
    return Buffer.concat([n, ct, c.getAuthTag()]);
  }
  open(buf) {
    if (!buf || buf.length < 8 + 1 + 16) return null;
    const n = buf.readBigUInt64BE(0);
    if (n !== this.rxN) return null;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', this.rx, Buffer.concat([Buffer.alloc(4), buf.subarray(0, 8)]));
      d.setAAD(this.aad);
      d.setAuthTag(buf.subarray(buf.length - 16));
      const pt = Buffer.concat([d.update(buf.subarray(8, buf.length - 16)), d.final()]);
      this.rxN++;
      return { type: pt[0], data: pt.subarray(1) };
    } catch (_) { return null; }
  }
}

// TCP ↔ канал через ретранслятор: как pipe() в worker.js, но с шифрованием и сквозным окном —
// ретранслятор не может притормозить отправителя сам, поэтому получатель подтверждает принятое (ACK),
// а отправитель держит не больше WINDOW неподтверждённых байт (и не больше HIGH в своём буфере канала)
function pipeSealed(sock, dc, stats, box) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = LOW;
  const queue = [];
  let unacked = 0, got = 0, paused = false, waitDrain = false, done = false;
  const flowOk = () => unacked < WINDOW && dc.bufferedAmount <= HIGH;
  const resume = () => { if (paused && flowOk()) { paused = false; sock.resume(); } };
  const sendBuf = (d) => {
    for (let o = 0; o < d.length; o += CHUNK) dc.send(box.seal(T_DATA, d.subarray(o, Math.min(d.length, o + CHUNK))));
    stats.up += d.length;
    unacked += d.length;
    if (!paused && !flowOk()) { paused = true; sock.pause(); }
  };
  const ack = () => {
    if (waitDrain || got < ACK_EVERY || dc.readyState !== 'open') return;
    const a = Buffer.alloc(4);
    a.writeUInt32BE(got);
    got = 0;
    try { dc.send(box.seal(T_ACK, a)); } catch (_) {}
  };
  const end = () => { if (done) return; done = true; try { dc.close(); } catch (_) {} try { sock.destroy(); } catch (_) {} };
  sock.on('data', (d) => { if (dc.readyState === 'open') sendBuf(d); else queue.push(d); });
  sock.on('drain', () => { waitDrain = false; ack(); });
  dc.onopen = () => { while (queue.length) sendBuf(queue.shift()); };
  if (dc.readyState === 'open') dc.onopen();
  dc.onbufferedamountlow = resume;
  dc.onmessage = (e) => {
    const m = box.open(Buffer.from(e.data));
    if (!m) { end(); return; } // подмена, повтор или чужой ключ
    if (m.type === T_DATA) {
      stats.down += m.data.length;
      got += m.data.length;
      if (sock.write(m.data) === false) waitDrain = true;
      ack();
    } else if (m.type === T_ACK && m.data.length === 4) {
      unacked = Math.max(0, unacked - m.data.readUInt32BE(0));
      resume();
    }
  };
  sock.on('close', end);
  sock.on('error', end);
  dc.onclose = end;
  dc.onerror = end;
}

// короткая записка хозяин → гость через ретранслятор (например «мир ещё не открыт»)
function sealNote(box, obj) { return box.seal(T_NOTE, Buffer.from(JSON.stringify(obj), 'utf8')); }
function openNote(box, data) {
  const m = box.open(Buffer.from(data));
  if (!m || m.type !== T_NOTE) return null;
  try { return JSON.parse(m.data.toString('utf8')); } catch (_) { return null; }
}

// ---------------- ограничение скорости (общее на все сессии ретранслятора) ----------------
class Shaper {
  constructor(kbps, now = Date.now) { this.now = now; this.set(kbps); this.tokens = this.burst; this.t = now(); }
  set(kbps) {
    this.kbps = Math.max(64, Number(kbps) || 4000);
    this.rate = this.kbps * 125; // байт в секунду
    this.burst = Math.max(64 * 1024, this.rate / 4);
    if (this.tokens > this.burst) this.tokens = this.burst;
  }
  take(n) {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, t - this.t) * this.rate / 1000);
    this.t = t;
    if (this.tokens < Math.min(n, this.burst)) return false;
    this.tokens -= n;
    return true;
  }
}

// кто ждёт «жетонов» скорости — тех будим по таймеру
class Pacer {
  constructor(schedule) { this.schedule = schedule; this.waiting = new Set(); this.armed = false; }
  wait(out) {
    this.waiting.add(out);
    if (!this.armed && this.schedule) { this.armed = true; this.schedule(() => { this.armed = false; this.tick(); }); }
  }
  tick() { const w = [...this.waiting]; this.waiting.clear(); for (const o of w) o.drain(); }
}

// очередь одного направления: отдаём в канал, пока он открыт, его буфер не выше HIGH и хватает скорости
class Out {
  constructor(dst, ctx, kill) { this.dst = dst; this.ctx = ctx; this.kill = kill; this.q = []; this.bytes = 0; this.dead = false; this.closeAfter = false; }
  push(m) {
    if (this.dead || typeof m === 'string') return;
    this.q.push(m);
    this.bytes += m.byteLength;
    if (this.bytes > (this.ctx.maxQueue || MAX_QUEUE)) { this.kill(); return; }
    this.drain();
  }
  drain() {
    while (this.q.length && !this.dead) {
      if (this.dst.readyState !== 'open' || this.dst.bufferedAmount > (this.ctx.high || HIGH)) return; // ждём onopen / onbufferedamountlow
      const m = this.q[0], n = m.byteLength;
      if (!this.ctx.shaper.take(n)) { this.ctx.pacer.wait(this); return; }
      this.q.shift();
      this.bytes -= n;
      try { this.dst.send(m); } catch (_) { this.kill(); return; }
      if (this.ctx.onBytes) this.ctx.onBytes(n);
    }
    if (!this.q.length && this.closeAfter) this.kill();
  }
}

// связать канал ноги хозяина с одноимённым каналом ноги гостя: всё, что пришло в один, уходит в другой
function link(a, b, ctx) {
  const L = { closed: false, onClose: null };
  for (const d of [a, b]) { d.binaryType = 'arraybuffer'; d.bufferedAmountLowThreshold = ctx.low || LOW; }
  const close = () => {
    if (L.closed) return;
    L.closed = true;
    ab.dead = ba.dead = true;
    ab.q = []; ba.q = [];
    try { a.close(); } catch (_) {}
    try { b.close(); } catch (_) {}
    if (L.onClose) L.onClose();
  };
  const ab = new Out(b, ctx, close), ba = new Out(a, ctx, close);
  L.ab = ab; L.ba = ba; L.close = close;
  a.onmessage = (e) => ab.push(e.data);
  b.onmessage = (e) => ba.push(e.data);
  a.onbufferedamountlow = () => ba.drain();
  b.onbufferedamountlow = () => ab.drain();
  a.onopen = () => ba.drain();
  b.onopen = () => ab.drain();
  // одна сторона закрылась — сначала досылаем, что уже взяли от неё, потом закрываем другую
  const gone = (out) => () => { if (L.closed) return; if (!out.q.length) close(); else out.closeAfter = true; };
  a.onclose = gone(ab);
  b.onclose = gone(ba);
  a.onerror = b.onerror = close;
  return L;
}

// ---------------- пары и ограничения ретранслятора ----------------
class RelayBook {
  constructor(max = RELAY_MAX_SESSIONS) { this.max = max; this.sessions = new Map(); }
  // нога пришла с токеном и стороной: новая сессия (если есть место) или вторая половинка существующей
  admit(token, side, leg, now = Date.now()) {
    if (!isToken(token) || (side !== 'host' && side !== 'guest')) return { ok: false, why: 'bad' };
    let s = this.sessions.get(token);
    if (!s) {
      if (this.sessions.size >= this.max) return { ok: false, why: 'busy' };
      s = { token, host: null, guest: null, at: now, paired: false, ended: false, links: new Set(), pending: [], labels: { host: new Set(), guest: new Set() }, bytes: 0 };
      this.sessions.set(token, s);
    }
    const old = s[side];
    s[side] = leg;
    leg.session = s;
    leg.side = side;
    return { ok: true, session: s, replaced: old && old !== leg ? old : null };
  }
  other(leg) { const s = leg.session; return s ? s[leg.side === 'host' ? 'guest' : 'host'] : null; }
  ready(s) { return !!(s && !s.ended && s.host && s.guest && s.host.ready && s.guest.ready); }
  // канал с меткой от этой ноги: только c<N> от гостя / n<N> от хозяина, каждая метка один раз (иначе повтор шифротекста)
  allowLabel(leg, label) {
    const s = leg.session;
    if (!s || s.ended) return false;
    const re = leg.side === 'guest' ? /^c\d{1,9}$/ : /^n\d{1,9}$/;
    if (!re.test(label) || s.labels[leg.side].has(label) || s.labels[leg.side].size > 4096) return false;
    s.labels[leg.side].add(label);
    return true;
  }
  end(s) {
    if (!s || s.ended) return [];
    s.ended = true;
    this.sessions.delete(s.token);
    return [s.host, s.guest].filter(Boolean);
  }
  stale(now = Date.now(), ttl = RELAY_PAIR_TTL) { return [...this.sessions.values()].filter((s) => !s.paired && now - s.at > ttl); }
  get load() { return this.sessions.size; }
  get active() { let n = 0; for (const s of this.sessions.values()) if (s.paired) n++; return n; }
}

// ---------------- список ретрансляторов и выбор ----------------
class RelayDir {
  constructor() { this.map = new Map(); }
  put(id, m) {
    if (!m || m.id !== id) return;
    if (m.gone) { this.map.delete(id); return; }
    if (relayIdOf(m.pk) !== id) return;
    this.map.set(id, { id, v: m.v, at: Number(m.at) || 0, load: Number(m.load) || 0, cap: Number(m.cap) || 0, pk: m.pk });
  }
  fresh(now = Date.now(), exclude = []) {
    const out = [];
    for (const [id, e] of this.map) {
      if (now - e.at > RELAY_STALE) { this.map.delete(id); continue; }
      if (!exclude.includes(id)) out.push(e);
    }
    return out;
  }
}

function selectRelay(entries, now = Date.now(), exclude = []) {
  const ok = (entries || []).filter((e) => e && e.v === RELAY_V && typeof e.id === 'string' && relayIdOf(e.pk) === e.id
    && now - e.at < RELAY_STALE && e.at - now < 60e3 && e.cap > 0 && e.load < e.cap && !exclude.includes(e.id));
  ok.sort((a, b) => a.load - b.load || b.at - a.at);
  return ok[0] || null;
}

module.exports = {
  RELAY_V, RELAY_ROOT, RELAY_BEAT, RELAY_STALE, RELAY_MAX_SESSIONS, RELAY_PAIR_TTL, DIR_KEY, HIGH, LOW, MAX_QUEUE, WINDOW, ACK_EVERY, CHUNK,
  T_DATA, T_ACK, T_NOTE,
  boxKeys, boxShared, relayIdOf, isToken, newToken,
  sessionKey, Sealed, pipeSealed, sealNote, openNote,
  Shaper, Pacer, Out, link, RelayBook, RelayDir, selectRelay
};
