// Локальная связь лаунчера с запущенной игрой для лобби отряда (KokkHUD): TCP NDJSON на 127.0.0.1.
// Лаунчер — сервер (порт 47320, занят — 47321…47329, потом любой), игра — клиент. Порт и токен лежат в
// <папка игры>/.villagers/party.link = {v, port, token, pid, at}; первое сообщение игры — {t:'hello', token}.
// Протокол целиком: party_protocol.md (раздел 1).
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_PORT = 47320;
const MAX_LINE = 4 * 1024 * 1024;
const HELLO_WAIT = 5000;
const IDLE_CLOSE = 30000;
const PROTO = 1;

function createLink({ onMessage, onAuth, onClose, log = () => {}, version = '' }) {
  const token = crypto.randomBytes(16).toString('hex');
  const clients = new Set();
  let srv = null;
  let port = 0;
  let linkFile = null;

  function listenOn(p) {
    return new Promise((resolve) => {
      const s = net.createServer(onSocket);
      s.once('error', () => resolve(null));
      s.listen(p, '127.0.0.1', () => resolve(s));
    });
  }
  async function start() {
    if (srv) return port;
    for (let p = BASE_PORT; p < BASE_PORT + 10 && !srv; p++) srv = await listenOn(p);
    if (!srv) srv = await listenOn(0);
    if (!srv) throw new Error('Связь с игрой: не удалось открыть порт');
    port = srv.address().port;
    srv.on('error', (e) => log('link error ' + e.message));
    return port;
  }
  // файл связи — в папку игры (вызывать при старте и перед каждым запуском игры: папка могла смениться)
  function writeLinkFile(gameDir) {
    if (!srv || !gameDir) return;
    const f = path.join(gameDir, '.villagers', 'party.link');
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ v: 1, port, token, pid: process.pid, at: Date.now() }));
      if (linkFile && linkFile !== f) removeLinkFile();
      linkFile = f;
    } catch (e) { log('party.link: ' + e.message); }
  }
  function removeLinkFile() {
    if (!linkFile) return;
    try { const j = JSON.parse(fs.readFileSync(linkFile, 'utf8')); if (j.token === token) fs.rmSync(linkFile, { force: true }); } catch (_) {}
    linkFile = null;
  }

  function send(c, obj) {
    if (!c || c.sock.destroyed) return false;
    try { c.sock.write(JSON.stringify(obj) + '\n'); return true; } catch (_) { return false; }
  }
  function broadcast(obj) { let n = 0; for (const c of clients) if (c.authed && send(c, obj)) n++; return n; }
  const authed = () => [...clients].filter((c) => c.authed);

  function onSocket(sock) {
    if (sock.remoteAddress && !/^(::ffff:)?127\.0\.0\.1$|^::1$/.test(sock.remoteAddress)) { sock.destroy(); return; }
    const c = { sock, authed: false, buf: '', last: Date.now(), nick: null, ver: null };
    clients.add(c);
    sock.setEncoding('utf8');
    sock.setNoDelay(true);
    const helloT = setTimeout(() => { if (!c.authed) sock.destroy(); }, HELLO_WAIT);
    sock.on('data', (chunk) => {
      c.last = Date.now();
      c.buf += chunk;
      if (c.buf.length > MAX_LINE) { sock.destroy(); return; }
      let i;
      while ((i = c.buf.indexOf('\n')) >= 0) {
        const line = c.buf.slice(0, i).trim();
        c.buf = c.buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (_) { send(c, { t: 'error', code: 'bad', text: 'Не JSON' }); continue; }
        if (!msg || typeof msg.t !== 'string') continue;
        if (!c.authed) {
          if (msg.t !== 'hello' || typeof msg.token !== 'string' || msg.token.length !== token.length
            || !crypto.timingSafeEqual(Buffer.from(msg.token), Buffer.from(token))) {
            send(c, { t: 'hello', ok: false, code: 'auth', text: 'Неверный токен связи — перечитай .villagers/party.link' });
            sock.end();
            return;
          }
          c.authed = true;
          clearTimeout(helloT);
          c.nick = typeof msg.nick === 'string' ? msg.nick.slice(0, 32) : null;
          c.ver = typeof msg.ver === 'string' ? msg.ver.slice(0, 32) : null;
          try { onAuth && onAuth(c, msg); } catch (e) { log('onAuth ' + e.message); }
          continue;
        }
        if (msg.t === 'ping') { send(c, { t: 'pong' }); continue; }
        if (msg.t === 'pong') continue;
        Promise.resolve().then(() => onMessage(c, msg)).catch((e) => {
          send(c, { t: 'error', re: msg.t, rid: msg.rid, code: e.code || 'bad', text: e.message || String(e) });
        });
      }
    });
    const bye = () => { clearTimeout(helloT); if (clients.delete(c) && c.authed) { try { onClose && onClose(c); } catch (_) {} } };
    sock.on('close', bye);
    sock.on('error', () => {});
  }

  // сторож: тишина 30 с — закрываем; раз в 10 с пингуем сами
  const watch = setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (now - c.last > IDLE_CLOSE) { c.sock.destroy(); continue; }
      if (c.authed && now - c.last > 10000) send(c, { t: 'ping' });
    }
  }, 5000);
  watch.unref && watch.unref();

  function stop() {
    clearInterval(watch);
    for (const c of clients) c.sock.destroy();
    clients.clear();
    removeLinkFile();
    if (srv) { srv.close(); srv = null; }
  }

  return { start, stop, send, broadcast, authed, writeLinkFile, removeLinkFile, port: () => port, token: () => token, PROTO, helloReply: (nick) => ({ t: 'hello', ok: true, proto: PROTO, nick, launcher: version }) };
}

// Сообщение «музыка лобби» для игры: {t:'music', tracks:[{id, name, file}], selected} — только открытые игроком треки
// лаунчера, file — абсолютный путь к готовому файлу на этом компьютере (WAV/OGG в <папка игры>/.villagers/music).
// Игра играет выбранный по кругу в главном меню как «Музыку» Minecraft; выбор в игре приходит обратно {t:'music', id}.
// Протокол: party_protocol.md, раздел 1.4.
function musicMessage(tracks, selected) {
  const list = (Array.isArray(tracks) ? tracks : [])
    .filter((t) => t && typeof t.id === 'string' && /^[a-z0-9_-]{1,32}$/.test(t.id) && typeof t.file === 'string' && t.file)
    .map((t) => ({ id: t.id, name: String(t.name || t.id).slice(0, 60), file: t.file }));
  const sel = list.some((t) => t.id === selected) ? selected : (list[0] ? list[0].id : null);
  return { t: 'music', tracks: list, selected: sel };
}

module.exports = { createLink, musicMessage, BASE_PORT, PROTO };
