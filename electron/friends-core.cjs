// Друзья и отряд — чистая логика без Electron (её проверяют тесты scripts/tests/friends.test.cjs):
// ключи установки и подписи, шифрование приглашений и канала отряда, заявки в друзья, правила лидера и совместной загрузки.
'use strict';
const crypto = require('crypto');

const NS = 'villagerskokk/v1/fr/';
const T = {
  profile: (k) => NS + 'pr/' + k,
  status: (k) => NS + 'st/' + k,
  rq: (to, from) => NS + 'rq/' + to + '/' + from,
  inbox: (k) => NS + 'in/' + k,
  party: (id) => NS + 'pt/' + id
};
const keyOf = (nick) => String(nick || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24) || 'player';
const NICK_RE = /^[A-Za-z0-9_]{2,16}$/;

const STATUS_STALE = 150e3; // статус без пульса дольше — офлайн
const HB_STALE = 30e3; // участник отряда без пульса дольше — пропал
const DROP_AFTER = 90e3; // в лобби пропавшего убираем из отряда
const MSG_MAX_AGE = 10 * 60e3; // inbox/отряд: старые сообщения не принимаем
const INVITE_TTL = 120e3;
const ENTER_WAIT = 60e3; // совместная загрузка: ждём остальных не дольше минуты
const PARTY_MAX = 10; // в отряде не больше 10 игроков, лидер тоже считается
const FULL_TEXT = 'Отряд полон (' + PARTY_MAX + '/' + PARTY_MAX + ')';
// «Максимум игроков» на сервере для игры отрядом (лидер ставит в лобби): отряд сам по себе вход не ограничивает
const PLAYERS = { def: 20, min: 2, max: 100 };
function clampPlayers(v, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.max(PLAYERS.min, Math.min(PLAYERS.max, n)) : def === undefined ? PLAYERS.def : def;
}
const partyFull = (st) => !!(st && Array.isArray(st.members) && st.members.length >= PARTY_MAX);
// файл отряда для мода VillagersKokk на «Моём сервере»: <папка сервера>/config/villagerskokk/party.json
// { v:1, id, leader:'Ник', members:['Ник', …] (лидер тоже), at } ; без отряда — members: []
function partyFileDoc(st, now) {
  if (!st || !Array.isArray(st.members) || !st.members.length) return { v: 1, id: null, leader: null, members: [], at: now || Date.now() };
  const lead = st.members.find((m) => m.key === st.leader);
  const members = st.members.map((m) => m.nick).filter((n) => NICK_RE.test(String(n)));
  return { v: 1, id: st.id || null, leader: lead && NICK_RE.test(lead.nick) ? lead.nick : members[0] || null, members, at: now || Date.now() };
}

// ---------------- ключи ----------------
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const ED_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const X_SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const rawPub = (key) => key.export({ type: 'spki', format: 'der' }).subarray(-32);

// пара ключей установки: Ed25519 (подпись) + X25519 (шифрование). Хранится строкой (закрытые ключи — PKCS8 base64url)
function genIdentity() {
  const ed = crypto.generateKeyPairSync('ed25519');
  const x = crypto.generateKeyPairSync('x25519');
  return {
    ed: b64u(ed.privateKey.export({ type: 'pkcs8', format: 'der' })), pk: b64u(rawPub(ed.publicKey)),
    x: b64u(x.privateKey.export({ type: 'pkcs8', format: 'der' })), xk: b64u(rawPub(x.publicKey))
  };
}
function validIdentity(id) { return !!(id && id.ed && id.pk && id.x && id.xk && unb64u(id.pk).length === 32 && unb64u(id.xk).length === 32); }
const privKey = (s) => crypto.createPrivateKey({ key: unb64u(s), format: 'der', type: 'pkcs8' });
const pubKey = (prefix, raw) => crypto.createPublicKey({ key: Buffer.concat([prefix, unb64u(raw)]), format: 'der', type: 'spki' });

// конверт: { v, d: JSON-строка, k: pk, s: подпись d }
function seal(id, payload) {
  const d = JSON.stringify({ ...payload, pk: id.pk, xk: id.xk });
  const s = crypto.sign(null, Buffer.from(d, 'utf8'), privKey(id.ed));
  return JSON.stringify({ v: 1, d, k: id.pk, s: b64u(s) });
}
// разобрать и проверить подпись; null — подделка/мусор
function open(text) {
  if (!text || typeof text !== 'string' || text.length > 400000) return null;
  let env;
  try { env = JSON.parse(text); } catch (_) { return null; }
  if (!env || env.v !== 1 || typeof env.d !== 'string' || typeof env.k !== 'string' || typeof env.s !== 'string') return null;
  try {
    if (unb64u(env.k).length !== 32) return null;
    if (!crypto.verify(null, Buffer.from(env.d, 'utf8'), pubKey(ED_SPKI, env.k), unb64u(env.s))) return null;
    const p = JSON.parse(env.d);
    if (!p || typeof p !== 'object' || p.pk !== env.k) return null;
    return { p, pk: env.k, xk: typeof p.xk === 'string' ? p.xk : null, sig: env.s };
  } catch (_) { return null; }
}

// AES-256-GCM: iv(12) | tag(16) | шифротекст
function aesSeal(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), ct]));
}
function aesOpen(key, data) {
  try {
    const b = unb64u(data);
    if (b.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (_) { return null; }
}
// общий ключ двух установок (X25519 → HKDF)
function sharedKey(myX, theirXk) {
  const s = crypto.diffieHellman({ privateKey: privKey(myX), publicKey: pubKey(X_SPKI, theirXk) });
  return Buffer.from(crypto.hkdfSync('sha256', s, Buffer.from('villagers-friends'), Buffer.from('dm-v1'), 32));
}
const encryptFor = (id, theirXk, obj) => aesSeal(sharedKey(id.x, theirXk), obj);
const decryptFrom = (id, theirXk, data) => { try { return aesOpen(sharedKey(id.x, theirXk), data); } catch (_) { return null; } };
// отряд: ключ 32 байта, id канала = 16 hex от SHA-256 ключа
const newPartyKey = () => b64u(crypto.randomBytes(32));
const partyIdOf = (key) => crypto.createHash('sha256').update('pt:').update(unb64u(key)).digest('hex').slice(0, 16);
const partySeal = (key, obj) => aesSeal(unb64u(key), obj);
const partyOpen = (key, data) => aesOpen(unb64u(key), data);

// ---------------- заявки в друзья ----------------
// book: { friends: {key: {nick, pk, xk, since, newKey?}}, out: {key: {nick, t}}, inc: {key: {nick, pk, xk, t, note, suspicious}}, blocked: {key: nick} }
function emptyBook() { return { friends: {}, out: {}, inc: {}, blocked: {} }; }
function normBook(b) { b = b && typeof b === 'object' ? b : {}; return { friends: { ...(b.friends || {}) }, out: { ...(b.out || {}) }, inc: { ...(b.inc || {}) }, blocked: { ...(b.blocked || {}) } }; }

// пришло сообщение в слот rq/<я>/<fromKey>. profilePk — ключ из опубликованного профиля этого ника (если знаем).
// Возвращает { book, events: [{kind, nick, key}], reply?: {typ}, clear: bool }
function onRq(book, me, fromKey, msg, profilePk) {
  book = normBook(book);
  const events = [];
  const res = { book, events, clear: true, reply: null };
  if (!msg) return res;
  const { p, pk, xk } = msg;
  if (!p || keyOf(p.from) !== fromKey || keyOf(p.to) !== me || !NICK_RE.test(String(p.from))) return res;
  const nick = String(p.from);
  if (book.blocked[fromKey]) return res;
  const fr = book.friends[fromKey];
  if (p.typ === 'req') {
    if (fr) {
      if (fr.pk === pk) { res.reply = { typ: 'acc' }; return res; } // друг переспросил (потерял ответ) — подтверждаем снова
      fr.newKey = { pk, xk, t: p.t }; events.push({ kind: 'keychanged', nick, key: fromKey }); return res;
    }
    if (book.out[fromKey]) { // встречные заявки — сразу дружим
      book.friends[fromKey] = { nick, pk, xk, since: Date.now() };
      delete book.out[fromKey];
      res.reply = { typ: 'acc' };
      events.push({ kind: 'accepted', nick, key: fromKey });
      return res;
    }
    const prev = book.inc[fromKey];
    if (prev && prev.t >= (p.t || 0)) { res.clear = false; return res; }
    book.inc[fromKey] = { nick, pk, xk, t: Number(p.t) || Date.now(), note: String(p.note || '').slice(0, 140), suspicious: !!(profilePk && profilePk !== pk) };
    res.clear = false; // заявка лежит, пока не ответим
    events.push({ kind: 'request', nick, key: fromKey });
    return res;
  }
  if (p.typ === 'acc') {
    if (fr) { if (fr.pk === pk) return res; fr.newKey = { pk, xk, t: p.t }; events.push({ kind: 'keychanged', nick, key: fromKey }); return res; }
    if (!book.out[fromKey]) return res; // мы не звали — чужой ответ
    book.friends[fromKey] = { nick, pk, xk, since: Date.now() };
    delete book.out[fromKey];
    delete book.inc[fromKey];
    events.push({ kind: 'accepted', nick, key: fromKey });
    return res;
  }
  if (p.typ === 'dec') {
    if (book.out[fromKey]) { delete book.out[fromKey]; events.push({ kind: 'declined', nick, key: fromKey }); }
    return res;
  }
  if (p.typ === 'rm') {
    if (fr && fr.pk === pk) { delete book.friends[fromKey]; events.push({ kind: 'removed', nick, key: fromKey }); }
    if (book.inc[fromKey] && book.inc[fromKey].pk === pk) delete book.inc[fromKey]; // отозвал заявку
    return res;
  }
  return res;
}
// ответить на входящую заявку
function acceptIncoming(book, key) {
  book = normBook(book);
  const r = book.inc[key];
  if (!r) throw new Error('Заявка не найдена');
  book.friends[key] = { nick: r.nick, pk: r.pk, xk: r.xk, since: Date.now() };
  delete book.inc[key];
  delete book.out[key];
  return book;
}
// проверка сообщения «от друга»: ключ должен совпасть с закреплённым
function friendBy(book, key, pk) {
  const f = book && book.friends && book.friends[key];
  return f && f.pk === pk ? f : null;
}

// ---------------- статус ----------------
function statusOf(doc, now) {
  if (!doc || !doc.status || now - (Number(doc.t) || 0) > STATUS_STALE) return { status: 'offline', doing: '' };
  const status = ['online', 'ingame'].includes(doc.status) ? doc.status : 'offline';
  return { status, doing: status === 'offline' ? '' : String(doc.doing || '').slice(0, 60) };
}
// новее ли retained-документ (защита от повторов старых копий)
function fresher(prevT, t, now) { t = Number(t) || 0; return t > (prevT || 0) && t < now + 5 * 60e3; }

// ---------------- отряд ----------------
// state (общее, рассылает лидер): { id, key, leader, members: [{key, nick, pk, xk}], seq, phase, background, map, live, t }
// live: { room, pass, name, port, deadline, go } — только в фазах live/ingame
const PHASES = ['lobby', 'starting', 'live', 'ingame'];
function newParty(me, opts = {}) {
  const key = opts.key || newPartyKey();
  return {
    id: partyIdOf(key), key, leader: me.key, seq: 1, t: Date.now(), phase: 'lobby',
    members: [{ key: me.key, nick: me.nick, pk: me.pk, xk: me.xk }],
    background: opts.background || 'meadow', map: opts.map || null, live: null
  };
}
const isMember = (st, k) => !!(st && st.members.some((m) => m.key === k));
// hbs: { key: { t, st, stage, progress, equip } } — кто когда последний раз отзывался
const alive = (hbs, k, now) => !!(hbs[k] && now - hbs[k].t < HB_STALE);
// кто должен быть лидером, если текущий пропал: первый по списку живой
function successor(st, hbs, now) {
  return (st.members.find((m) => m.key !== st.leader && alive(hbs, m.key, now)) || null);
}
// принять ли новое состояние отряда от отправителя senderKey (подпись уже проверена: pk отправителя = senderPk)
function acceptState(cur, inc, senderKey, senderPk, hbs, now) {
  if (!inc || typeof inc !== 'object' || !Array.isArray(inc.members) || !PHASES.includes(inc.phase)) return false;
  // первое состояние после вступления (ключ отряда мы получили от друга): только от лидера, который сам в списке
  if (!cur) return inc.leader === senderKey && inc.members.some((m) => m.key === senderKey && m.pk === senderPk);
  if (inc.id !== cur.id || !(inc.seq > cur.seq)) return false;
  const sm = cur.members.find((x) => x.key === senderKey);
  if (!sm || sm.pk !== senderPk) return false; // отправитель — участник с тем же ключом
  if (senderKey === cur.leader) return true; // лидер решает всё, в том числе передаёт лидерство и уходит сам
  if (inc.leader !== senderKey) return false;
  // участник объявил себя лидером: можно только преемнику, когда прежний лидер пропал
  if (alive(hbs, cur.leader, now)) return false;
  const succ = successor(cur, hbs, now);
  return !!succ && succ.key === senderKey;
}
// лидер: убрать пропавших (в лобби), отметить, кто готов; вернуть { changed, dropped }
function leaderTick(st, hbs, now, meKey) {
  let changed = false;
  const dropped = [];
  if (st.phase === 'lobby') {
    const keep = st.members.filter((m) => m.key === meKey || !hbs[m.key] || now - hbs[m.key].t < DROP_AFTER);
    // кто ни разу не отозвался — даём время вступить
    for (const m of st.members) if (!keep.includes(m)) dropped.push(m.nick);
    if (dropped.length) { st.members = keep; changed = true; }
  }
  if (st.phase === 'live' && st.live && !st.live.go && goNow(st, hbs, now)) { st.live.go = true; changed = true; }
  if (st.phase === 'live' && st.live && st.live.go && allInWorld(st, hbs, now)) { st.phase = 'ingame'; changed = true; }
  if (changed) { st.seq++; st.t = now; }
  return { changed, dropped };
}
const READY = ['ready', 'world'];
// пора заходить: все живые готовы, или прошла минута, или лидер сказал «не ждать»
function goNow(st, hbs, now) {
  if (!st.live) return false;
  if (st.live.force) return true;
  if (now >= (st.live.deadline || 0)) return true;
  const live = st.members.filter((m) => alive(hbs, m.key, now));
  return live.length > 0 && live.every((m) => READY.includes(hbs[m.key].st));
}
function allInWorld(st, hbs, now) {
  const live = st.members.filter((m) => alive(hbs, m.key, now));
  return live.length > 0 && live.every((m) => hbs[m.key].st === 'world');
}
// кого ещё ждём
function waitingFor(st, hbs, now) {
  return st.members.filter((m) => alive(hbs, m.key, now) && !READY.includes(hbs[m.key].st)).map((m) => m.nick);
}
// должен ли этот участник получить connect сейчас
function shouldConnect({ st, myHb, enterNow, tunnelReady, alreadySent }) {
  if (alreadySent || !st || !st.live || !['live', 'ingame'].includes(st.phase)) return false;
  if (!tunnelReady || !myHb || myHb.st !== 'ready') return false;
  return !!(st.live.go || enterNow || st.phase === 'ingame');
}
// состояние участника из того, что знает его лаунчер
function memberState({ gameRunning, linked, stage, phase, tunnelReady, crashed, starting }) {
  if (crashed) return 'crashed';
  if (starting) return 'starting';
  if (!gameRunning) return 'away';
  if (stage === 'world') return 'world';
  if (phase === 'live' || phase === 'ingame') {
    if (['connecting', 'joining', 'loading'].includes(stage)) return 'loading';
    if (linked && (stage === 'menu' || !stage) && tunnelReady) return 'ready';
    return 'loading';
  }
  if (phase === 'starting') return 'starting';
  return linked ? 'lobby' : 'loading';
}
// приглашение: можно ли впустить нового участника (лидер позвал сам или за него поручился участник)
function mayJoin(invited, key, pk, now) {
  const inv = invited[key];
  return !!(inv && now - inv.t < INVITE_TTL * 3 && (!inv.pk || inv.pk === pk));
}

// ---------------- локальная связь с игрой: проверки ----------------
const ITEM_RE = /^[a-z0-9_.:/-]{1,64}$/;
// экипировка в лобби: руки, голова и (KokkHUD 0.32) вся броня; dye — цвет кожаных частей «#rrggbb» по слотам брони
const EQUIP_SLOTS = ['main', 'off', 'head', 'chest', 'legs', 'feet'];
const DYE_RE = /^#[0-9a-f]{6}$/;
function cleanEquip(items) {
  const o = {};
  for (const k of EQUIP_SLOTS) {
    const v = items && items[k];
    o[k] = typeof v === 'string' && ITEM_RE.test(v) ? v : null;
  }
  const d = items && items.dye;
  if (d && typeof d === 'object') {
    const dye = {};
    for (const k of ['head', 'chest', 'legs', 'feet']) {
      const v = typeof d[k] === 'string' ? d[k].toLowerCase() : null;
      if (v && DYE_RE.test(v)) dye[k] = v;
    }
    if (Object.keys(dye).length) o.dye = dye;
  }
  return o;
}
const LEVEL_TYPES = { normal: 'minecraft:normal', flat: 'minecraft:flat', large_biomes: 'minecraft:large_biomes', amplified: 'minecraft:amplified' };
// тип мира — id пресета мира (worldgen/world_preset) из игры: ванильные и любые модов сборки («kokkstory:journey», …).
// Короткие старые имена (normal/flat/…) тоже понимаем. То, что пойдёт в server.properties как level-type.
const PRESET_RE = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,100}$/;
function cleanType(t) {
  const v = String(t == null ? '' : t).trim().toLowerCase();
  if (LEVEL_TYPES[v]) return v;
  if (PRESET_RE.test(v) && !v.includes('..')) return v;
  return 'normal';
}
function levelTypeOf(t) { const v = cleanType(t); return LEVEL_TYPES[v] || v; }
function cleanMap(m) {
  if (!m || typeof m !== 'object') return null;
  const nameOk = (s) => typeof s === 'string' && s.trim() && !/[\\/]|^\.\.?$/.test(s.trim()) && s.length <= 64;
  if (m.world !== undefined) return nameOk(m.world) ? { kind: 'world', name: m.world.trim() } : null;
  if (m.server !== undefined) return nameOk(m.server) ? { kind: 'server', name: m.server.trim() } : null;
  if (m.newWorld) {
    const n = m.newWorld;
    const name = String(n.name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'Мир отряда';
    const type = cleanType(n.type);
    return { kind: 'new', name, seed: String(n.seed == null ? '' : n.seed).trim().slice(0, 64), type };
  }
  if (m.kind && ['world', 'server', 'new'].includes(m.kind)) return m.kind === 'new' ? cleanMap({ newWorld: m }) : cleanMap({ [m.kind]: m.name });
  return null;
}

module.exports = {
  NS, T, keyOf, NICK_RE, STATUS_STALE, HB_STALE, DROP_AFTER, MSG_MAX_AGE, INVITE_TTL, ENTER_WAIT, LEVEL_TYPES,
  PARTY_MAX, FULL_TEXT, PLAYERS, clampPlayers, partyFull, partyFileDoc,
  b64u, unb64u, genIdentity, validIdentity, seal, open, encryptFor, decryptFrom, newPartyKey, partyIdOf, partySeal, partyOpen,
  emptyBook, normBook, onRq, acceptIncoming, friendBy, statusOf, fresher,
  newParty, isMember, alive, successor, acceptState, leaderTick, goNow, allInWorld, waitingFor, shouldConnect, memberState, mayJoin,
  cleanEquip, cleanMap, cleanType, levelTypeOf, PRESET_RE, EQUIP_SLOTS
};
