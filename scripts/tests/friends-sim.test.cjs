// Симуляция двух лаунчеров (electron/friends.cjs) через брокер в памяти и две «игры» по TCP NDJSON:
// заявка → дружба → статус → приглашение в отряд → экипировка → фон → совместный запуск (туннель, пароль, connect)
// → все в мире → вылет и «Вернуться к отряду» → лидер выгоняет. Запуск: node scripts/tests/friends-sim.test.cjs
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { EventEmitter } = require('events');
require('../sync-cosmetics.cjs');
const setupFriends = require('../../electron/friends.cjs');

// ---------- брокер MQTT в памяти (retain, «+») ----------
const broker = { retained: new Map(), subs: [] };
const match = (pat, topic) => { const a = pat.split('/'), b = topic.split('/'); return a.length === b.length && a.every((x, i) => x === '+' || x === b[i]); };
function deliver(inst, topic, text) { setImmediate(() => inst.ipcMain.emit('fr-msg', { sender: inst.contents }, { topic, text })); }
function brokerCmd(inst, cmd, o) {
  if (cmd === 'frSub') for (const p of o.topics) { broker.subs.push({ inst, p }); for (const [tp, tx] of broker.retained) if (match(p, tp)) deliver(inst, tp, tx); }
  if (cmd === 'frUnsub') broker.subs = broker.subs.filter((s) => !(s.inst === inst && o.topics.includes(s.p)));
  if (cmd === 'frPub') {
    if (o.retain) { if (o.text) broker.retained.set(o.topic, o.text); else broker.retained.delete(o.topic); }
    if (o.text) { const seen = new Set(); for (const s of broker.subs) if (match(s.p, o.topic) && !seen.has(s.inst)) { seen.add(s.inst); deliver(s.inst, o.topic, o.text); } }
  }
}

// ---------- один «лаунчер» ----------
function launcher(nick) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-sim-' + nick + '-'));
  const inst = { nick, gameDir, ipcMain: new EventEmitter(), contents: {}, handlers: {}, ui: null, toasts: [], played: [], tunnel: { active: false }, tunnelCmds: [], game: null, serverRunning: false };
  let settings = { gameDir, serverPort: 25565, tunnelLocalPort: 25565, serverEulaAccepted: true, gameBest: { fishing: 120 }, playTimeMs: 3600e3 };
  const secrets = {};
  let prof = { games: {}, rewards: {}, equip: {}, equipT: 0, mastery: { fishing: 5 * 5 * 120 }, stats: {} };
  let hostWorld = null;
  inst.api = setupFriends({
    handle: (ch, fn) => { inst.handlers[ch] = fn; }, ipcMain: inst.ipcMain,
    send: (ch, d) => { if (ch === 'friends') inst.ui = d; if (ch === 'toast') inst.toasts.push(d.text); },
    store: { get: () => settings, set: (p) => { settings = { ...settings, ...p }; return settings; }, getSecret: (k) => secrets[k], setSecret: (k, v) => { if (v == null) delete secrets[k]; else secrets[k] = v; } },
    auth: { elySkin: async () => null }, extras: { currentSkin: () => null },
    scoresWorker: async () => ({ webContents: { send: (ch, m) => brokerCmd(inst, m.cmd, m.opts) } }), scoresContents: () => inst.contents,
    currentAcc: () => ({ name: nick, type: 'offline' }),
    profile: () => JSON.parse(JSON.stringify(prof)), setProfile: (p) => { prof = p; },
    getGame: () => inst.game, isBusy: () => false,
    playGame: async (o) => { inst.played.push(o); inst.game = { started: Date.now() }; inst.api.onGameStart(); return true; },
    server: {
      running: () => inst.serverRunning, state: () => (inst.serverRunning ? 'running' : 'stopped'),
      stop: async () => { inst.serverRunning = false; inst.api.onServerState({ state: 'stopped' }); }
    },
    startServer: async () => { setTimeout(() => { inst.serverRunning = true; inst.api.onServerState({ state: 'running' }); }, 80); return true; },
    hosting: {
      profile: () => ({ room: 'vks-' + nick.toLowerCase(), name: 'Сервер ' + nick, world: hostWorld }),
      worlds: () => ({ single: [{ name: 'Долина', mtime: 5 }], server: hostWorld ? [{ name: hostWorld, mtime: 1 }] : [] }),
      importWorld: (name) => { hostWorld = name; }, update: (p) => { if (p.world) hostWorld = p.world; }, newWorld: (n) => { hostWorld = n; }, updateGame: () => {},
      hostTunnelPassword: () => 'secret|parol'
    },
    tunnelCmd: async (cmd, o) => {
      inst.tunnelCmds.push({ cmd, o });
      if (cmd === 'join') setTimeout(() => { inst.tunnel = { active: true, role: 'guest', name: o.name, status: 'connected', port: 25570 }; inst.api.onTunnelState(inst.tunnel); }, 60);
      if (cmd === 'leave') inst.tunnel = { active: false };
      return true;
    },
    tunnelOpts: (x) => x, tunnelState: () => inst.tunnel,
    version: 'sim', win: () => null, Notification: null, whenReady: () => Promise.resolve(), bindDelay: 0, tickMs: 300
  });
  return inst;
}

// ---------- «игра»: клиент связи ----------
async function gameClient(inst) {
  const lf = JSON.parse(fs.readFileSync(path.join(inst.gameDir, '.villagers', 'party.link'), 'utf8'));
  const s = net.connect(lf.port, '127.0.0.1');
  s.setEncoding('utf8');
  const g = { s, msgs: [], buf: '' };
  s.on('data', (c) => { g.buf += c; let i; while ((i = g.buf.indexOf('\n')) >= 0) { g.msgs.push(JSON.parse(g.buf.slice(0, i))); g.buf = g.buf.slice(i + 1); } });
  g.send = (o) => s.write(JSON.stringify(o) + '\n');
  g.last = (t) => [...g.msgs].reverse().find((m) => m.t === t);
  g.send({ t: 'hello', token: lf.token, proto: 1, nick: inst.nick });
  await until(() => g.last('hello'), 'hello ' + inst.nick);
  return g;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('не дождался: ' + what); await sleep(40); }
}
const step = (s) => console.log('✓ ' + s);

(async () => {
  const A = launcher('Alice');
  const B = launcher('Bob');
  await sleep(200);
  await until(() => A.ui && B.ui, 'первое состояние');

  // дружба
  await A.handlers['friends:add']('Bob');
  await until(() => B.ui.incoming.some((r) => r.nick === 'Alice'), 'заявка у Боба');
  assert.ok(B.toasts.some((x) => /Alice хочет дружить/.test(x)));
  await B.handlers['friends:accept']('alice');
  await until(() => A.ui.friends.some((f) => f.nick === 'Bob'), 'Боб у Алисы в друзьях');
  await until(() => B.ui.friends.some((f) => f.nick === 'Alice'), 'Алиса у Боба в друзьях');
  assert.strictEqual(A.ui.outgoing.length, 0);
  assert.ok(![...broker.retained.keys()].some((k) => k.includes('/rq/')), 'слоты заявок стёрты');
  step('заявка → принять: друзья с обеих сторон, слоты заявок на брокере стёрты');

  // статусы и профиль
  B.game = { started: Date.now() };
  B.api.onGameStart();
  await until(() => { const f = A.ui.friends.find((x) => x.nick === 'Bob'); return f && f.status === 'ingame'; }, 'Боб в игре');
  const prof = await A.handlers['friends:profile']('Bob');
  assert.ok(prof.friend && prof.verified);
  assert.strictEqual(prof.level, 6); // 1 + мастерство «Рыбалки» 5
  assert.strictEqual(prof.records.fishing, 120);
  step('статус «в игре» и профиль друга (подпись проверена закреплённым ключом)');

  // «скрыть статус»
  await B.handlers['friends:prefs']({ hide: true });
  await until(() => A.ui.friends.find((x) => x.nick === 'Bob').status === 'offline', 'скрытый статус');
  await B.handlers['friends:prefs']({ hide: false });
  await until(() => A.ui.friends.find((x) => x.nick === 'Bob').status === 'ingame', 'статус снова виден');
  step('«Скрыть мой статус»: друзья видят «не в сети»');

  // игры на связи
  A.game = { started: Date.now() };
  A.api.onGameStart();
  const ga = await gameClient(A);
  const gb = await gameClient(B);
  assert.strictEqual(ga.last('party').state.solo, true);
  assert.ok(ga.last('friends').items.some((f) => f.nick === 'Bob' && f.status === 'ingame'));
  ga.send({ t: 'loadState', stage: 'menu' });
  gb.send({ t: 'loadState', stage: 'menu' });

  // приглашение
  ga.send({ t: 'invite', nick: 'Bob', rid: 1 });
  await until(() => ga.msgs.some((m) => m.t === 'ok' && m.re === 'invite' && m.rid === 1), 'ok на invite');
  const inv = await until(() => gb.last('invite'), 'приглашение в игре Боба');
  assert.strictEqual(inv.from, 'Alice');
  gb.send({ t: 'accept', partyId: inv.partyId });
  await until(() => { const p = ga.last('party'); return p && p.state.members.length === 2; }, 'Боб в отряде (у Алисы)');
  await until(() => { const p = gb.last('party'); return p && p.state.id === inv.partyId && p.state.leader === 'Alice' && p.state.members.length === 2; }, 'Боб в отряде (у Боба)');
  step('приглашение из игры → «принять» → отряд из двух, лидер Алиса');

  // экипировка, фон, права лидера
  gb.send({ t: 'equip', items: { main: 'minecraft:bow', off: 'minecraft:shield', head: 'bad item!' } });
  await until(() => { const p = ga.last('party'); const b = p && p.state.members.find((m) => m.nick === 'Bob'); return b && b.equip.main === 'minecraft:bow' && b.equip.head === null; }, 'экипировка Боба у Алисы');
  ga.send({ t: 'background', id: 'mineshaft', rid: 2 });
  await until(() => ga.msgs.some((m) => m.t === 'error' && m.rid === 2), 'закрытый фон — ошибка');
  ga.send({ t: 'background', id: 'pier', rid: 3 }); // мастерство «Рыбалки» 5 — открыт
  await until(() => { const p = gb.last('party'); return p && p.state.background === 'pier'; }, 'фон у Боба');
  gb.send({ t: 'start', world: 'Долина', rid: 4 });
  await until(() => gb.msgs.some((m) => m.t === 'error' && m.rid === 4 && m.code === 'leader_only'), 'не лидер не запускает');
  step('экипировка видна отряду, фон — только открытый и только лидером, запуск — только лидер');

  // совместный запуск
  ga.send({ t: 'worlds', rid: 5 });
  const w = await until(() => ga.msgs.find((m) => m.t === 'worlds' && m.rid === 5), 'миры');
  assert.strictEqual(w.single[0].name, 'Долина');
  ga.send({ t: 'start', world: 'Долина', rid: 6 });
  await until(() => ga.msgs.some((m) => m.t === 'ok' && m.rid === 6), 'ok на start');
  await until(() => { const p = gb.last('party'); return p && p.state.phase === 'live'; }, 'фаза live у Боба');
  const join = await until(() => B.tunnelCmds.find((c) => c.cmd === 'join'), 'туннель Боба');
  assert.strictEqual(join.o.name, 'vks-alice');
  assert.strictEqual(join.o.password, 'secret|parol', 'пароль комнаты = секрет + пароль сервера');
  const ca = await until(() => ga.last('connect'), 'connect Алисе');
  const cb = await until(() => gb.last('connect'), 'connect Бобу');
  assert.strictEqual(ca.address, '127.0.0.1:25565');
  assert.strictEqual(cb.address, '127.0.0.1:25570');
  assert.strictEqual(cb.password, null);
  assert.ok(gb.msgs.some((m) => m.t === 'members' && m.go), 'members с go');
  step('старт: мир скопирован, сервер поднят, туннель с паролем, оба готовы → connect каждому на свой адрес');

  ga.send({ t: 'loadState', stage: 'world', progress: 1 });
  gb.send({ t: 'loadState', stage: 'world', progress: 1 });
  await until(() => { const p = gb.last('party'); return p && p.state.phase === 'ingame'; }, 'фаза ingame');
  step('все в мире → фаза ingame');

  // вылет Боба и возвращение
  gb.s.destroy();
  B.game = null;
  B.api.onGameExit(1);
  await until(() => B.ui.prompt && B.ui.prompt.kind === 'rejoin', 'предложение вернуться');
  await until(() => { const p = ga.last('party'); const b = p && p.state.members.find((m) => m.nick === 'Bob'); return b && b.state === 'crashed'; }, 'Алиса видит вылет Боба');
  await B.handlers['friends:launch']();
  assert.deepStrictEqual(B.played[0], { quickPlay: '127.0.0.1:25570' });
  step('вылет: «Вернуться к отряду» запускает игру сразу на сервер (quickPlay через туннель)');

  // выгнать
  ga.send({ t: 'kick', nick: 'Bob' });
  await until(() => B.ui.party.solo && !B.ui.party.id, 'Боб снова один');
  assert.ok(B.ui.notes.some((x) => /убрали из отряда/.test(x.text)));
  step('лидер выгоняет: у Боба снова «отряд из одного»');

  // удалить из друзей
  await B.handlers['friends:remove']('alice');
  await until(() => !A.ui.friends.some((f) => f.nick === 'Bob'), 'удалён у Алисы');
  step('удалить из друзей — пропадает у обоих');

  A.api.shutdown(); B.api.shutdown();
  ga.s.destroy();
  console.log('Симуляция пройдена');
  setTimeout(() => process.exit(0), 100);
})().catch((e) => { console.error('✗', e); process.exit(1); });
