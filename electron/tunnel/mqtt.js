// Мини-клиент MQTT 3.1.1 поверх WebSocket (только то, что нужно для «рукопожатия» комнат: QoS 0, подписки, retain).
// Брокеры публичные и бесплатные, без аккаунтов; всё, что мы туда пишем, зашифровано паролем комнаты.
'use strict';

function varint(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return out;
}
function str(s) {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]);
}
function packet(type, flags, body) {
  return Buffer.concat([Buffer.from([(type << 4) | flags, ...varint(body.length)]), body]);
}

class Mqtt {
  constructor(url, onMessage, onState) {
    this.url = url;
    this.onMessage = onMessage;
    this.onState = onState || (() => {});
    this.subs = new Set();
    this.buf = Buffer.alloc(0);
    this.ready = false;
    this.closed = false;
    this.pid = 1;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const id = 'vl' + Math.random().toString(36).slice(2, 12);
      const body = Buffer.concat([str('MQTT'), Buffer.from([4, 2, 0, 50]), str(id)]);
      ws.send(packet(1, 0, body));
    };
    ws.onmessage = (e) => { this.buf = Buffer.concat([this.buf, Buffer.from(e.data)]); this.parse(); };
    ws.onclose = () => { this.ready = false; this.onState(false); clearInterval(this.ping); this.retry(); };
    ws.onerror = () => {};
  }

  retry() {
    if (this.closed) return;
    clearTimeout(this.rt);
    this.rt = setTimeout(() => this.connect(), 4000);
  }

  parse() {
    for (;;) {
      if (this.buf.length < 2) return;
      let mul = 1, len = 0, i = 1, b;
      do {
        if (i >= this.buf.length) return;
        b = this.buf[i++]; len += (b & 127) * mul; mul *= 128;
      } while (b & 128);
      if (this.buf.length < i + len) return;
      const type = this.buf[0] >> 4, flags = this.buf[0] & 15;
      const body = this.buf.subarray(i, i + len);
      this.buf = this.buf.subarray(i + len);
      if (type === 2) { // CONNACK
        if (body[1] === 0) {
          this.ready = true;
          this.onState(true);
          for (const t of this.subs) this.sendSub(t);
          clearInterval(this.ping);
          this.ping = setInterval(() => this.raw(Buffer.from([0xc0, 0])), 25000);
        }
      } else if (type === 3) { // PUBLISH
        const tl = (body[0] << 8) | body[1];
        const topic = body.subarray(2, 2 + tl).toString('utf8');
        let off = 2 + tl;
        if ((flags >> 1) & 3) off += 2;
        try { this.onMessage(topic, body.subarray(off).toString('utf8')); } catch (_) {}
      }
    }
  }

  raw(b) { if (this.ws && this.ws.readyState === 1) try { this.ws.send(b); } catch (_) {} }

  sendSub(topic) {
    const id = this.pid++ & 0xffff || 1;
    this.raw(packet(8, 2, Buffer.concat([Buffer.from([id >> 8, id & 255]), str(topic), Buffer.from([0])])));
  }

  subscribe(topic) { this.subs.add(topic); if (this.ready) this.sendSub(topic); }

  unsubscribe(topic) {
    if (!this.subs.delete(topic) || !this.ready) return;
    const id = this.pid++ & 0xffff || 1;
    this.raw(packet(10, 2, Buffer.concat([Buffer.from([id >> 8, id & 255]), str(topic)])));
  }

  publish(topic, text, retain) {
    if (!this.ready) return false;
    this.raw(packet(3, retain ? 1 : 0, Buffer.concat([str(topic), Buffer.from(text, 'utf8')])));
    return true;
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    clearTimeout(this.rt);
    try { this.raw(Buffer.from([0xe0, 0])); this.ws && this.ws.close(); } catch (_) {}
  }
}

module.exports = { Mqtt };
