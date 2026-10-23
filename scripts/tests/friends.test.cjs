// Тесты друзей и отряда: подписи, шифрование, заявки, правила лидера и совместной загрузки, связь с игрой (TCP NDJSON),
// условия косметических наград. Запуск: node scripts/tests/friends.test.cjs
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
require('../sync-cosmetics.cjs');
const C = require('../../electron/friends-core.cjs');
const X = require('../../electron/cosmetics.cjs');
const { createLink, musicMessage } = require('../../electron/partylink.cjs');

let n = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const A = C.genIdentity();
const B = C.genIdentity();
const M = C.genIdentity(); // злоумышленник

// ---------------- ключи и подписи ----------------
t('подпись: своё сообщение проверяется, ключи в конверте', () => {
  const env = C.seal(A, { typ: 'req', from: 'Alice', to: 'Bob', t: 1 });
  const m = C.open(env);
  assert.ok(m);
  assert.strictEqual(m.pk, A.pk);
  assert.strictEqual(m.xk, A.xk);
  assert.strictEqual(m.p.from, 'Alice');
});
t('подпись: подмена текста или ключа — отклоняется', () => {
  const env = JSON.parse(C.seal(A, { typ: 'req', from: 'Alice', t: 1 }));
  assert.strictEqual(C.open(JSON.stringify({ ...env, d: env.d.replace('Alice', 'Mallo') })), null);
  assert.strictEqual(C.open(JSON.stringify({ ...env, k: M.pk })), null);
  assert.strictEqual(C.open('мусор'), null);
  assert.strictEqual(C.open(''), null);
  // подписано своим ключом, но в теле чужой pk
  const forged = C.seal(M, { typ: 'req', from: 'Alice', t: 1 });
  const fm = C.open(forged);
  assert.strictEqual(fm.pk, M.pk); // подпись верна, но это ключ злоумышленника — его отсеивает закрепление
});
t('шифрование для друга: читает только адресат', () => {
  const x = C.encryptFor(A, B.xk, { pkey: 'секрет', n: 5 });
  assert.deepStrictEqual(C.decryptFrom(B, A.xk, x), { pkey: 'секрет', n: 5 });
  assert.strictEqual(C.decryptFrom(M, A.xk, x), null);
  assert.strictEqual(C.decryptFrom(B, M.xk, x), null);
});
t('канал отряда: id из ключа, AES-GCM, порча — null', () => {
  const k = C.newPartyKey();
  assert.match(C.partyIdOf(k), /^[0-9a-f]{16}$/);
  const x = C.partySeal(k, { typ: 'hb', st: 'lobby' });
  assert.deepStrictEqual(C.partyOpen(k, x), { typ: 'hb', st: 'lobby' });
  assert.strictEqual(C.partyOpen(C.newPartyKey(), x), null);
  const bad = x.slice(0, -2) + (x.endsWith('A') ? 'B' : 'A') + x.slice(-1);
  assert.strictEqual(C.partyOpen(k, bad), null);
});

// ---------------- заявки ----------------
const msgOf = (id, p) => C.open(C.seal(id, p));
t('заявка → принять: друг закреплён с его ключом', () => {
  let b = C.emptyBook();
  const r = C.onRq(b, 'bob', 'alice', msgOf(A, { typ: 'req', from: 'Alice', to: 'Bob', t: 10 }), null);
  assert.deepStrictEqual(r.events.map((e) => e.kind), ['request']);
  assert.strictEqual(r.clear, false);
  b = C.acceptIncoming(r.book, 'alice');
  assert.strictEqual(b.friends.alice.pk, A.pk);
  assert.strictEqual(b.friends.alice.xk, A.xk);
  assert.ok(!b.inc.alice);
});
t('ответ «принял» засчитывается, только если мы звали', () => {
  const acc = msgOf(B, { typ: 'acc', from: 'Bob', to: 'Alice', t: 11 });
  let r = C.onRq(C.emptyBook(), 'alice', 'bob', acc, null);
  assert.deepStrictEqual(r.events, []);
  assert.ok(!r.book.friends.bob);
  const b = C.emptyBook(); b.out.bob = { nick: 'Bob', t: 5 };
  r = C.onRq(b, 'alice', 'bob', acc, null);
  assert.strictEqual(r.book.friends.bob.pk, B.pk);
  assert.ok(!r.book.out.bob);
  assert.strictEqual(r.events[0].kind, 'accepted');
});
t('встречные заявки — сразу друзья и ответ acc', () => {
  const b = C.emptyBook(); b.out.alice = { nick: 'Alice', t: 1 };
  const r = C.onRq(b, 'bob', 'alice', msgOf(A, { typ: 'req', from: 'Alice', to: 'Bob', t: 2 }), null);
  assert.ok(r.book.friends.alice);
  assert.deepStrictEqual(r.reply, { typ: 'acc' });
});
t('подделка: «удалить» с чужим ключом не действует, с закреплённым — действует', () => {
  const b = C.emptyBook(); b.friends.alice = { nick: 'Alice', pk: A.pk, xk: A.xk };
  let r = C.onRq(b, 'bob', 'alice', msgOf(M, { typ: 'rm', from: 'Alice', to: 'Bob', t: 3 }), null);
  assert.ok(r.book.friends.alice);
  r = C.onRq(b, 'bob', 'alice', msgOf(A, { typ: 'rm', from: 'Alice', to: 'Bob', t: 3 }), null);
  assert.ok(!r.book.friends.alice);
  assert.strictEqual(r.events[0].kind, 'removed');
});
t('новый ключ у друга — не принимается молча, событие keychanged', () => {
  const b = C.emptyBook(); b.friends.alice = { nick: 'Alice', pk: A.pk, xk: A.xk };
  const r = C.onRq(b, 'bob', 'alice', msgOf(M, { typ: 'req', from: 'Alice', to: 'Bob', t: 9 }), null);
  assert.strictEqual(r.book.friends.alice.pk, A.pk);
  assert.strictEqual(r.book.friends.alice.newKey.pk, M.pk);
  assert.strictEqual(r.events[0].kind, 'keychanged');
});
t('заявка с ключом не как в профиле — «подозрительная»; не тот слот/ник — мусор', () => {
  let r = C.onRq(C.emptyBook(), 'bob', 'alice', msgOf(M, { typ: 'req', from: 'Alice', to: 'Bob', t: 9 }), A.pk);
  assert.strictEqual(r.book.inc.alice.suspicious, true);
  r = C.onRq(C.emptyBook(), 'bob', 'carl', msgOf(A, { typ: 'req', from: 'Alice', to: 'Bob', t: 9 }), null);
  assert.deepStrictEqual(r.events, []);
  r = C.onRq(C.emptyBook(), 'bob', 'alice', msgOf(A, { typ: 'req', from: 'Alice', to: 'Carl', t: 9 }), null);
  assert.deepStrictEqual(r.events, []);
});
t('заблокированный: заявки игнорируются', () => {
  const b = C.emptyBook(); b.blocked.alice = 'Alice';
  const r = C.onRq(b, 'bob', 'alice', msgOf(A, { typ: 'req', from: 'Alice', to: 'Bob', t: 9 }), null);
  assert.ok(!r.book.inc.alice);
});
t('статус: свежий / устаревший', () => {
  const now = 1e9;
  assert.strictEqual(C.statusOf({ status: 'ingame', doing: 'Тест', t: now - 1000 }, now).status, 'ingame');
  assert.strictEqual(C.statusOf({ status: 'ingame', t: now - C.STATUS_STALE - 1 }, now).status, 'offline');
  assert.strictEqual(C.statusOf(null, now).status, 'offline');
});

// ---------------- отряд ----------------
const me = (nick, id) => ({ key: C.keyOf(nick), nick, pk: id.pk, xk: id.xk });
const mA = me('Alice', A), mB = me('Bob', B), mM = me('Mallo', M);
function party3() {
  const st = C.newParty(mA);
  st.members.push({ key: mB.key, nick: 'Bob', pk: B.pk, xk: B.xk }, { key: 'carl', nick: 'Carl', pk: 'cpk', xk: 'cxk' });
  return st;
}
t('состояние: первое — только от лидера из списка', () => {
  const st = party3();
  assert.ok(C.acceptState(null, st, 'alice', A.pk, {}, 0));
  assert.ok(!C.acceptState(null, st, 'bob', B.pk, {}, 0));
  assert.ok(!C.acceptState(null, st, 'alice', M.pk, {}, 0));
});
t('состояние: лидер меняет, участник — нет, старый seq — нет', () => {
  const now = 100000;
  const cur = party3();
  const hbs = { alice: { t: now }, bob: { t: now } };
  const next = { ...cur, seq: cur.seq + 1, background: 'pier' };
  assert.ok(C.acceptState(cur, next, 'alice', A.pk, hbs, now));
  assert.ok(!C.acceptState(cur, { ...next, leader: 'bob' }, 'bob', B.pk, hbs, now));
  assert.ok(!C.acceptState(cur, { ...cur }, 'alice', A.pk, hbs, now));
  assert.ok(!C.acceptState(cur, { ...next, id: 'other' }, 'alice', A.pk, hbs, now));
});
t('лидерство: передача лидером и уход лидера', () => {
  const now = 100000;
  const cur = party3();
  const hbs = { alice: { t: now }, bob: { t: now } };
  const handed = { ...cur, seq: cur.seq + 1, leader: 'bob' };
  assert.ok(C.acceptState(cur, handed, 'alice', A.pk, hbs, now));
  const left = { ...cur, seq: cur.seq + 1, leader: 'bob', members: cur.members.filter((m) => m.key !== 'alice') };
  assert.ok(C.acceptState(cur, left, 'alice', A.pk, hbs, now));
});
t('лидер пропал: лидером может стать только следующий живой', () => {
  const now = 100000;
  const cur = party3();
  const hbs = { alice: { t: now - C.HB_STALE - 1 }, bob: { t: now }, carl: { t: now } };
  const byBob = { ...cur, seq: cur.seq + 1, leader: 'bob' };
  assert.ok(C.acceptState(cur, byBob, 'bob', B.pk, hbs, now));
  const byCarl = { ...cur, seq: cur.seq + 1, leader: 'carl' };
  assert.ok(!C.acceptState(cur, byCarl, 'carl', 'cpk', hbs, now));
  // лидер жив — переворот не принимается
  assert.ok(!C.acceptState(cur, byBob, 'bob', B.pk, { ...hbs, alice: { t: now } }, now));
  assert.strictEqual(C.successor(cur, hbs, now).key, 'bob');
});
t('лобби: пропавший дольше 90 с убирается, лидер остаётся', () => {
  const now = 1e6;
  const st = party3();
  const r = C.leaderTick(st, { alice: { t: 0 }, bob: { t: now - C.DROP_AFTER - 5 }, carl: { t: now } }, now, 'alice');
  assert.deepStrictEqual(r.dropped, ['Bob']);
  assert.deepStrictEqual(st.members.map((m) => m.key), ['alice', 'carl']);
});
t('совместная загрузка: go — когда все готовы', () => {
  const now = 1e6;
  const st = party3(); st.phase = 'live'; st.live = { deadline: now + 60000, go: false };
  const hbs = { alice: { t: now, st: 'ready' }, bob: { t: now, st: 'loading' }, carl: { t: now - 60000, st: 'away' } };
  assert.strictEqual(C.goNow(st, hbs, now), false);
  assert.deepStrictEqual(C.waitingFor(st, hbs, now), ['Bob']);
  hbs.bob.st = 'ready';
  assert.strictEqual(C.goNow(st, hbs, now), true); // Карл пропал — его не ждём
  const r = C.leaderTick(st, hbs, now, 'alice');
  assert.ok(r.changed && st.live.go);
});
t('совместная загрузка: через минуту — кто готов, тот заходит; «не ждать» — сразу', () => {
  const now = 1e6;
  const st = party3(); st.phase = 'live'; st.live = { deadline: now + 60000, go: false };
  const hbs = { alice: { t: now, st: 'ready' }, bob: { t: now, st: 'loading' } };
  assert.strictEqual(C.goNow(st, hbs, now + 59000), false);
  assert.strictEqual(C.goNow(st, hbs, now + 60000), true);
  st.live.force = true;
  assert.strictEqual(C.goNow(st, hbs, now), true);
});
t('все в мире → фаза ingame', () => {
  const now = 1e6;
  const st = party3(); st.phase = 'live'; st.live = { deadline: now, go: true };
  C.leaderTick(st, { alice: { t: now, st: 'world' }, bob: { t: now, st: 'world' } }, now, 'alice');
  assert.strictEqual(st.phase, 'ingame');
});
t('connect: только готовому, после go / «не ждать» / в ingame, один раз', () => {
  const st = { phase: 'live', live: { go: false } };
  const base = { st, myHb: { st: 'ready' }, enterNow: false, tunnelReady: true, alreadySent: false };
  assert.strictEqual(C.shouldConnect(base), false);
  assert.strictEqual(C.shouldConnect({ ...base, enterNow: true }), true);
  st.live.go = true;
  assert.strictEqual(C.shouldConnect(base), true);
  assert.strictEqual(C.shouldConnect({ ...base, alreadySent: true }), false);
  assert.strictEqual(C.shouldConnect({ ...base, tunnelReady: false }), false);
  assert.strictEqual(C.shouldConnect({ ...base, myHb: { st: 'loading' } }), false);
  assert.strictEqual(C.shouldConnect({ ...base, st: { phase: 'ingame', live: { go: false } } }), true);
  assert.strictEqual(C.shouldConnect({ ...base, st: { phase: 'lobby', live: null } }), false);
});
t('состояние участника из того, что знает лаунчер', () => {
  assert.strictEqual(C.memberState({ gameRunning: false, phase: 'lobby' }), 'away');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: true, phase: 'lobby' }), 'lobby');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: false, phase: 'lobby' }), 'loading');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: true, phase: 'live', stage: 'menu', tunnelReady: true }), 'ready');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: true, phase: 'live', stage: 'menu', tunnelReady: false }), 'loading');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: true, phase: 'live', stage: 'loading' }), 'loading');
  assert.strictEqual(C.memberState({ gameRunning: true, linked: true, phase: 'ingame', stage: 'world' }), 'world');
  assert.strictEqual(C.memberState({ gameRunning: false, crashed: true, phase: 'ingame' }), 'crashed');
  assert.strictEqual(C.memberState({ gameRunning: false, starting: true, phase: 'live' }), 'starting');
});
t('вступление: только позванный (и с тем же ключом), приглашение стареет', () => {
  const now = 1e6;
  const inv = { bob: { t: now - 1000, pk: B.pk } };
  assert.ok(C.mayJoin(inv, 'bob', B.pk, now));
  assert.ok(!C.mayJoin(inv, 'bob', M.pk, now));
  assert.ok(!C.mayJoin(inv, 'mallo', M.pk, now));
  assert.ok(!C.mayJoin(inv, 'bob', B.pk, now + C.INVITE_TTL * 4));
});
t('экипировка и карта из игры чистятся', () => {
  assert.deepStrictEqual(C.cleanEquip({ main: 'minecraft:iron_sword', off: '<script>', head: 5 }), { main: 'minecraft:iron_sword', off: null, head: null, chest: null, legs: null, feet: null });
  assert.deepStrictEqual(C.cleanEquip({ chest: 'minecraft:leather_chestplate', feet: 'minecraft:iron_boots', dye: { chest: '#A06540', legs: 'red', x: '#ffffff' } }),
    { main: null, off: null, head: null, chest: 'minecraft:leather_chestplate', legs: null, feet: 'minecraft:iron_boots', dye: { chest: '#a06540' } });
  assert.deepStrictEqual(C.cleanMap({ world: 'Долина' }), { kind: 'world', name: 'Долина' });
  assert.strictEqual(C.cleanMap({ world: '../etc' }), null);
  assert.strictEqual(C.cleanMap({ world: 'a/b' }), null);
  assert.deepStrictEqual(C.cleanMap({ newWorld: { name: 'Мир: новый?', seed: 42, type: 'amplified' } }), { kind: 'new', name: 'Мир новый', seed: '42', type: 'amplified' });
  assert.deepStrictEqual(C.cleanMap({ newWorld: { type: 'weird' } }), { kind: 'new', name: 'Мир отряда', seed: '', type: 'normal' });
  assert.deepStrictEqual(C.cleanMap({ server: 'Мир сервера' }), { kind: 'server', name: 'Мир сервера' });
  // тип мира — любой пресет мира из игры (моды сборки), в server.properties как level-type
  assert.deepStrictEqual(C.cleanMap({ newWorld: { name: 'Сюжет', type: 'kokkstory:journey' } }), { kind: 'new', name: 'Сюжет', seed: '', type: 'kokkstory:journey' });
  assert.strictEqual(C.levelTypeOf('kokkstory:journey'), 'kokkstory:journey');
  assert.strictEqual(C.levelTypeOf('amplified'), 'minecraft:amplified');
  assert.strictEqual(C.levelTypeOf('minecraft:flat'), 'minecraft:flat');
  assert.strictEqual(C.levelTypeOf('../x:y'), 'minecraft:normal');
  assert.strictEqual(C.levelTypeOf('A B'), 'minecraft:normal');
});

// ---------------- косметика ----------------
t('награды с условием: мастерство, события, отряд, друзья', () => {
  const xp = (lvl) => lvl * lvl * 120;
  const p = { rewards: {}, mastery: { fishing: xp(5) }, stats: {} };
  assert.ok(X.newlyEarned(p).includes('lobby_pier'));
  assert.ok(!X.newlyEarned(p).includes('lobby_mineshaft'));
  assert.ok(X.newlyEarned({ rewards: { ev_yule: 1, ev_bloom: 1, ev_fog: 1 } }).includes('decor_fireflies'));
  assert.ok(X.newlyEarned({ rewards: {}, stats: { party: 1 } }).includes('badge_company'));
  assert.ok(X.newlyEarned({ rewards: {}, stats: { friends: 3 } }).includes('frame_friends'));
  assert.ok(!X.newlyEarned({ rewards: { badge_company: 1 }, stats: { party: 1 } }).includes('badge_company'));
  assert.strictEqual(X.accountLevel({ mastery: { fishing: xp(5), mine: xp(2) } }), 8);
  assert.deepStrictEqual(X.condProgress({ masteryTotal: 30 }, { mastery: { fishing: xp(5) } }), [5, 30]);
});
t('фоны лобби: два бесплатных, остальные — по наградам; у каждой награды-фона есть фон', () => {
  assert.deepStrictEqual([...X.lobbyUnlocked({ rewards: {} })].sort(), ['meadow', 'square']);
  assert.ok(X.lobbyUnlocked({ rewards: { lobby_pier: 1 } }).has('pier'));
  for (const r of X.REWARDS.filter((x) => x.kind === 'lobby')) assert.ok(X.LOBBY_BGS.some((b) => b.id === r.lobby), r.id);
  for (const b of X.LOBBY_BGS.filter((x) => !x.free)) assert.ok(X.REWARDS.some((r) => r.lobby === b.id), b.id);
  // рамки и темы наград описаны, значки рисуются
  for (const r of X.REWARDS.filter((x) => x.kind === 'frame')) assert.ok(X.FRAMES[r.frame], r.id);
  for (const r of X.REWARDS.filter((x) => x.kind === 'theme')) assert.ok(X.THEMES[r.theme], r.id);
  for (const r of X.REWARDS.filter((x) => x.kind === 'badge')) assert.strictEqual(X.badgeInfo(r.id).pix.length, 7, r.id);
  const ids = X.REWARDS.map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
t('условия не невыполнимы: каждое ссылается на существующие игры/награды', () => {
  for (const r of X.COSMETIC_REWARDS) {
    const c = r.cond;
    assert.ok(c, r.id);
    if (c.mastery) assert.ok(X.MG_GAMES.includes(c.mastery[0]), r.id);
    if (c.anyReward) for (const id of c.anyReward) assert.ok(X.rewardById(id), r.id + ' → ' + id);
    if (c.anyMastery) for (const g of c.anyMastery[0]) assert.ok(X.MG_GAMES.includes(g), r.id);
  }
});

// ---------------- связь с игрой (TCP NDJSON) ----------------
function client(port) {
  const s = net.connect(port, '127.0.0.1');
  s.setEncoding('utf8');
  let buf = '';
  const q = [];
  const waiters = [];
  s.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(m); else q.push(m); }
  });
  return {
    s, send: (o) => s.write(JSON.stringify(o) + '\n'),
    next: () => new Promise((res, rej) => { if (q.length) return res(q.shift()); const to = setTimeout(() => rej(new Error('нет ответа')), 3000); waiters.push((m) => { clearTimeout(to); res(m); }); }),
    closed: () => new Promise((res) => { if (s.destroyed) res(); s.on('close', res); })
  };
}
// ---------------- размер отряда, «Максимум игроков», файл отряда для сервера ----------------
t('отряд: не больше 10 (лидер считается), текст «Отряд полон (10/10)»', () => {
  const mk = (n) => ({ members: Array.from({ length: n }, (_, i) => ({ key: 'p' + i, nick: 'P' + i })) });
  assert.strictEqual(C.PARTY_MAX, 10);
  assert.strictEqual(C.partyFull(mk(9)), false);
  assert.strictEqual(C.partyFull(mk(10)), true);
  assert.strictEqual(C.partyFull(null), false);
  assert.strictEqual(C.FULL_TEXT, 'Отряд полон (10/10)');
});
t('«Максимум игроков»: по умолчанию 20, от 2 до 100', () => {
  assert.strictEqual(C.clampPlayers(undefined), 20);
  assert.strictEqual(C.clampPlayers(1), 2);
  assert.strictEqual(C.clampPlayers(500), 100);
  assert.strictEqual(C.clampPlayers('30'), 30);
  assert.strictEqual(C.clampPlayers('много', null), null);
  assert.strictEqual(C.clampPlayers(0, null), null);
});
t('party.json: лидер и участники по никам, без отряда — пустой список', () => {
  const st = { id: 'abc', leader: 'bob', members: [{ key: 'alice', nick: 'Alice' }, { key: 'bob', nick: 'Bob' }] };
  const d = C.partyFileDoc(st, 5);
  assert.deepStrictEqual(d, { v: 1, id: 'abc', leader: 'Bob', members: ['Alice', 'Bob'], at: 5 });
  assert.deepStrictEqual(C.partyFileDoc(null, 6), { v: 1, id: null, leader: null, members: [], at: 6 });
});
t('связь: файл party.link, неверный токен — отказ, верный — hello и сообщения', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-link-'));
  const got = [];
  const link = createLink({
    version: 'test',
    onAuth: (c) => link.send(c, link.helloReply('Alice')),
    onMessage: async (c, msg) => {
      got.push(msg.t);
      if (msg.t === 'party') link.send(c, { t: 'party', state: { id: null }, rid: msg.rid });
      else if (msg.t === 'kick') throw Object.assign(new Error('Это может только лидер отряда'), { code: 'leader_only' });
    }
  });
  const port = await link.start();
  link.writeLinkFile(dir);
  const lf = JSON.parse(fs.readFileSync(path.join(dir, '.villagers', 'party.link'), 'utf8'));
  assert.strictEqual(lf.port, port);
  assert.strictEqual(lf.pid, process.pid);
  assert.match(lf.token, /^[0-9a-f]{32}$/);
  // второй лаунчер (или занятый порт) — следующий порт
  const link2 = createLink({ onMessage: () => {} });
  const port2 = await link2.start();
  assert.notStrictEqual(port2, port);
  link2.stop();

  const bad = client(port);
  bad.send({ t: 'hello', token: '0'.repeat(32) });
  const r1 = await bad.next();
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.code, 'auth');
  await bad.closed();

  const g = client(port);
  g.send({ t: 'hello', token: lf.token, proto: 1, nick: 'Alice' });
  const h = await g.next();
  assert.deepStrictEqual([h.t, h.ok, h.proto, h.nick], ['hello', true, 1, 'Alice']);
  g.send({ t: 'ping' });
  assert.strictEqual((await g.next()).t, 'pong');
  g.send({ t: 'party', rid: 7 });
  const pr = await g.next();
  assert.strictEqual(pr.t, 'party'); assert.strictEqual(pr.rid, 7);
  g.send({ t: 'kick', nick: 'Bob', rid: 'x' });
  const er = await g.next();
  assert.deepStrictEqual([er.t, er.re, er.rid, er.code], ['error', 'kick', 'x', 'leader_only']);
  g.s.write('не json\n');
  assert.strictEqual((await g.next()).code, 'bad');
  assert.strictEqual(link.broadcast({ t: 'toast', text: 'привет' }), 1);
  assert.strictEqual((await g.next()).text, 'привет');
  link.stop();
  assert.ok(!fs.existsSync(path.join(dir, '.villagers', 'party.link')));
  assert.deepStrictEqual(got, ['party', 'kick']);
});
t('связь: без hello за 5 с — закрывается', async () => {
  const link = createLink({ onMessage: () => {} });
  const port = await link.start();
  const g = client(port);
  const t0 = Date.now();
  await g.closed();
  assert.ok(Date.now() - t0 >= 4500);
  link.stop();
});

t('музыка лобби: только треки с файлом и правильным id, выбранный — из них', () => {
  const m = musicMessage([{ id: 'default', name: 'Мелодия', file: '/g/.villagers/music/default.v1.wav' }, { id: 'bad id', file: '/x' }, { id: 'deep', file: '' },
    { id: 'chains', name: 'Кандальный блюз', file: '/g/.villagers/music/chains.v1.wav' }], 'chains');
  assert.deepStrictEqual(m, { t: 'music', tracks: [{ id: 'default', name: 'Мелодия', file: '/g/.villagers/music/default.v1.wav' },
    { id: 'chains', name: 'Кандальный блюз', file: '/g/.villagers/music/chains.v1.wav' }], selected: 'chains' });
  assert.strictEqual(musicMessage([{ id: 'default', file: '/a.wav' }], 'deep').selected, 'default');
  assert.deepStrictEqual(musicMessage([], 'x'), { t: 'music', tracks: [], selected: null });
  // треки-награды в списке косметики: по одному на награду «music»
  assert.ok(X.REWARDS.filter((r) => r.kind === 'music').every((r) => typeof r.track === 'string'));
});

(async () => {
  for (const [name, fn] of tests) {
    await fn();
    n++;
    console.log('✓ ' + name);
  }
  console.log('Пройдено: ' + n);
})().catch((e) => { console.error('✗', e); process.exit(1); });
