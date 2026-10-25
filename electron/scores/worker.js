// Общая таблица рекордов мини-игр лаунчера — без своего сервера: через публичные MQTT-брокеры (те же, что для комнат).
// Каждый игрок держит на брокере одно «сохранённое» (retain) сообщение на игру: свой лучший счёт. Подписавшись на все,
// получаем таблицу. Это для фана: подделать счёт можно, ничего ценного здесь нет.
'use strict';
const { ipcRenderer } = require('electron');
const { Mqtt } = require('../tunnel/mqtt.js');

const ROOT = 'villagerskokk/v1/scores/';
const PROG = 'villagerskokk/v1/progress/';
const SRV = 'villagerskokk/v1/srv/'; // открытые сервера игроков: кто в сети (публично: имя, игроки, без ключа) // прогресс мини-игр и награды игрока (по нику), retain
const keyOf = (nick) => String(nick).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24) || 'player';
const boards = {}; // game -> { key -> {nick, score, at} }
let clients = [];
// подписки друзей храним здесь же: подписка, пришедшая раньше, чем открылись соединения, раньше терялась навсегда
// (лаунчер считал, что подписан на статус друга, а сервер о ней не знал — друг «не в сети», профиль пустой)
const frTopics = new Set();

function push() {
  const out = {};
  for (const [g, m] of Object.entries(boards)) out[g] = Object.values(m).sort((a, b) => b.score - a.score).slice(0, 50);
  ipcRenderer.send('scores-board', out);
}

// друзья и отряд (electron/friends.cjs): свои топики под FR, сообщения уходят в главный процесс как есть (подписи проверяет он)
const FR = 'villagerskokk/v1/fr/';
const frSeen = new Map(); // одно и то же сообщение приходит с двух брокеров — пропускаем повтор
function frForward(topic, text) {
  const k = topic + '\n' + text;
  const now = Date.now();
  if (frSeen.has(k) && now - frSeen.get(k) < 20000) return;
  frSeen.set(k, now);
  if (frSeen.size > 600) for (const [x, t] of frSeen) if (now - t > 20000) frSeen.delete(x);
  ipcRenderer.send('fr-msg', { topic, text });
}
const frOk = (t) => typeof t === 'string' && t.startsWith(FR) && t.length < 200;

function onMessage(topic, text) {
  if (topic.startsWith(FR)) { frForward(topic, text); return; }
  if (topic.startsWith(SRV)) {
    try { ipcRenderer.send('srv-presence', { id: topic.slice(SRV.length), info: text ? JSON.parse(text) : null }); } catch (_) {}
    return;
  }
  if (topic.startsWith(PROG)) {
    try { ipcRenderer.send('progress-remote', { key: topic.slice(PROG.length), doc: JSON.parse(text) }); } catch (_) {}
    return;
  }
  if (!topic.startsWith(ROOT)) return;
  const [game, key] = topic.slice(ROOT.length).split('/');
  if (!game || !key) return;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v.score !== 'number' || !v.nick) return;
    const nick = String(v.nick).slice(0, 24);
    const score = Math.max(0, Math.min(10000000, Math.floor(v.score)));
    boards[game] = boards[game] || {};
    const cur = boards[game][key];
    if (!cur || score >= cur.score) boards[game][key] = { nick, score, at: v.at || 0, badge: typeof v.badge === 'string' ? v.badge.slice(0, 40) : null, title: typeof v.title === 'string' ? v.title.slice(0, 40) : null };
    push();
  } catch (_) {}
}

ipcRenderer.on('scores-cmd', (e, { cmd, opts }) => {
  if (cmd === 'start') {
    if (clients.length) return;
    // ко всем серверам сразу: если у одного игрока провайдер режет один сервер, а у друга — другой,
    // при двух серверах они могли вообще не встретиться (друг «не в сети», хотя оба в лаунчере)
    const netState = () => ipcRenderer.send('fr-net', {
      online: clients.filter((x) => x.ready).length, total: clients.length,
      list: clients.map((x) => ({ host: String(x.url).replace(/^wss?:\/\//, '').replace(/[:/].*$/, ''), ready: !!x.ready, subs: [...x.subs].filter((t) => t.startsWith(FR)).length })), fr: frTopics.size
    });
    clients = [...new Set(opts.brokers || [])].slice(0, 5).map((url) => {
      const c = new Mqtt(url, onMessage, () => setTimeout(netState, 0));
      c.subscribe(ROOT + '+/+');
      for (const t of frTopics) c.subscribe(t);
      return c;
    });
    globalThis.netState = netState;
  }
  if (cmd === 'submit') {
    const key = keyOf(opts.nick);
    const msg = JSON.stringify({ nick: opts.nick, score: opts.score, at: Date.now(), badge: opts.badge || null, title: opts.title || null });
    const pub = (c, n) => { if (!c.publish(ROOT + opts.game + '/' + key, msg, true) && n < 20) setTimeout(() => pub(c, n + 1), 3000); };
    for (const c of clients) pub(c, 0);
    onMessage(ROOT + opts.game + '/' + key, msg);
  }
  if (cmd === 'watch') { // следить за своим прогрессом (приходит сохранённая копия с брокера)
    for (const c of clients) c.subscribe(PROG + keyOf(opts.nick));
  }
  if (cmd === 'srvWatch') { for (const c of clients) for (const id of opts.ids || []) c.subscribe(SRV + String(id).replace(/[^a-f0-9]/g, '')); }
  if (cmd === 'srvPresence') {
    const msg = JSON.stringify(opts.info);
    const topic = SRV + String(opts.id).replace(/[^a-f0-9]/g, '');
    for (const c of clients) c.publish(topic, msg, true);
  }
  if (cmd === 'frSub') { for (const t of opts.topics || []) if (frOk(t)) { frTopics.add(t); for (const c of clients) c.subscribe(t); } if (globalThis.netState) globalThis.netState(); }
  if (cmd === 'frUnsub') { for (const t of opts.topics || []) if (frOk(t)) { frTopics.delete(t); for (const c of clients) c.unsubscribe(t); } if (globalThis.netState) globalThis.netState(); }
  // сверка: лаунчер раз в минуту присылает полный список — чего у соединений нет, досылаем (лишнего не трогаем)
  if (cmd === 'frSync') {
    for (const t of opts.topics || []) if (frOk(t) && !frTopics.has(t)) { frTopics.add(t); for (const c of clients) c.subscribe(t); }
    for (const c of clients) for (const t of frTopics) if (!c.subs.has(t)) c.subscribe(t);
    if (globalThis.netState) globalThis.netState();
  }
  if (cmd === 'frPub' && frOk(opts.topic)) {
    const pub = (c, n) => { if (!c.publish(opts.topic, opts.text || '', !!opts.retain) && n < (opts.retain ? 20 : 3)) setTimeout(() => pub(c, n + 1), 3000); };
    for (const c of clients) pub(c, 0);
  }
  if (cmd === 'saveProgress') {
    const msg = JSON.stringify(opts.doc);
    const topic = PROG + keyOf(opts.nick);
    const pub = (c, n) => { if (!c.publish(topic, msg, true) && n < 20) setTimeout(() => pub(c, n + 1), 3000); };
    for (const c of clients) pub(c, 0);
  }
});
ipcRenderer.send('scores-ready');
