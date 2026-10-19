// Общая таблица рекордов мини-игр лаунчера — без своего сервера: через публичные MQTT-брокеры (те же, что для комнат).
// Каждый игрок держит на брокере одно «сохранённое» (retain) сообщение на игру: свой лучший счёт. Подписавшись на все,
// получаем таблицу. Это для фана: подделать счёт можно, ничего ценного здесь нет.
'use strict';
const { ipcRenderer } = require('electron');
const { Mqtt } = require('../tunnel/mqtt.js');

const ROOT = 'villagerskokk/v1/scores/';
const boards = {}; // game -> { key -> {nick, score, at} }
let clients = [];

function push() {
  const out = {};
  for (const [g, m] of Object.entries(boards)) out[g] = Object.values(m).sort((a, b) => b.score - a.score).slice(0, 50);
  ipcRenderer.send('scores-board', out);
}

function onMessage(topic, text) {
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
    if (!cur || score >= cur.score) boards[game][key] = { nick, score, at: v.at || 0 };
    push();
  } catch (_) {}
}

ipcRenderer.on('scores-cmd', (e, { cmd, opts }) => {
  if (cmd === 'start') {
    if (clients.length) return;
    clients = (opts.brokers || []).slice(0, 2).map((url) => {
      const c = new Mqtt(url, onMessage, () => {});
      c.subscribe(ROOT + '+/+');
      return c;
    });
  }
  if (cmd === 'submit') {
    const key = String(opts.nick).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24) || 'player';
    const msg = JSON.stringify({ nick: opts.nick, score: opts.score, at: Date.now() });
    const pub = (c, n) => { if (!c.publish(ROOT + opts.game + '/' + key, msg, true) && n < 20) setTimeout(() => pub(c, n + 1), 3000); };
    for (const c of clients) pub(c, 0);
    onMessage(ROOT + opts.game + '/' + key, msg);
  }
});
ipcRenderer.send('scores-ready');
