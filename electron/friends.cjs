// «Друзья» и отряд: заявки по нику, статусы, профили, приглашения в отряд, совместный запуск через «Мой сервер»
// и связь с запущенной игрой (лобби в главном меню KokkHUD). Транспорт — те же публичные MQTT-брокеры, что у таблицы
// рекордов (окно electron/scores/worker.js), свой сервер не нужен. Подписи и шифрование — electron/friends-core.cjs.
// Протокол для игры: party_protocol.md.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./friends-core.cjs');
const X = require('./cosmetics.cjs');
const { createLink, musicMessage } = require('./partylink.cjs');

module.exports = function setupFriends(d) {
  // d: { handle, ipcMain, send, store, auth, extras, scoresWorker, scoresContents, currentAcc, profile, setProfile, getGame, isBusy,
  //      playGame, server, hosting, tunnelCmd, tunnelOpts, tunnelState, packVersions, progress, win, Notification, version }
  const { store } = d;
  const log = (l) => console.log('[friends] ' + l);
  // журнал связи для «Отчёта связи» (вкладка «Друзья»): что пришло/ушло и почему отброшено
  const diag = [];
  const dl = (l) => { diag.push(new Date().toISOString().slice(11, 19) + ' ' + l); if (diag.length > 300) diag.shift(); };
  const fp = (pk) => (pk ? String(pk).slice(0, 8) : '—');
  // связь с игрой: каждая попытка и её итог — в консоль, в «Консоль игры» окна лаунчера и в <папка игры>/.villagers/partylink.log
  function linkLog(l) {
    log('связь с игрой: ' + l);
    try { d.send('game-log', ['[связь с игрой] ' + l]); } catch (_) {}
    try {
      const g = store.get().gameDir;
      if (!g) return;
      const f = path.join(g, '.villagers', 'partylink.log');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.old'); } catch (_) {}
      fs.appendFileSync(f, new Date().toISOString() + ' ' + l + '\n');
    } catch (_) {}
  }

  // ---------------- ключи установки ----------------
  let ident = null;
  function identity() {
    if (ident) return ident;
    // запасная копия ключа рядом с настройками: если хранилище секретов не прочиталось, новый ключ не создаём —
    // иначе у всех друзей ты пропадаешь («не в сети», пустой профиль), пока они не нажмут «Доверять новому ключу»
    const backup = store.DATA_DIR ? path.join(store.DATA_DIR, 'friends-key.json') : null;
    try { const j = JSON.parse(store.getSecret('friends:identity') || 'null'); if (C.validIdentity(j)) ident = j; } catch (_) {}
    if (!ident && backup) { try { const j = JSON.parse(fs.readFileSync(backup, 'utf8')); if (C.validIdentity(j)) { ident = j; store.setSecret('friends:identity', JSON.stringify(ident)); } } catch (_) {} }
    if (!ident) { ident = C.genIdentity(); store.setSecret('friends:identity', JSON.stringify(ident)); }
    try { if (backup && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(ident)); } catch (_) {}
    return ident;
  }
  function me() {
    const a = d.currentAcc();
    if (!a || !C.NICK_RE.test(String(a.name))) return null;
    const id = identity();
    return { nick: a.name, key: C.keyOf(a.name), pk: id.pk, xk: id.xk, ely: a.type === 'ely' };
  }

  // ---------------- хранилище (по нику) ----------------
  const per = (field, k, def) => { const all = store.get()[field] || {}; return all[k] !== undefined ? all[k] : def; };
  const setPer = (field, k, v) => { const all = { ...(store.get()[field] || {}) }; all[k] = v; store.set({ [field]: all }); };
  const book = () => { const m = me(); return C.normBook(m ? per('friendBooks', m.key, null) : null); };
  const saveBook = (b) => { const m = me(); if (m) setPer('friendBooks', m.key, b); changed(); };
  const DEF_PREFS = { hide: false, about: '', showcase: [], equip: { main: null, off: null, head: null, chest: null, legs: null, feet: null }, notify: true };
  const prefs = () => { const m = me(); return { ...DEF_PREFS, ...(m ? per('friendPrefs', m.key, {}) : {}) }; };
  const savePrefs = (p) => { const m = me(); if (m) setPer('friendPrefs', m.key, { ...prefs(), ...p }); changed(); };
  const notes = () => { const m = me(); return m ? per('friendNotes', m.key, []) : []; };

  // ---------------- MQTT ----------------
  let net = { online: 0, total: 0 };
  const subs = new Set();
  async function cmd(c, opts) { const w = await d.scoresWorker(); w.webContents.send('scores-cmd', { cmd: c, opts }); }
  function sub(topics) { const n = topics.filter((t) => !subs.has(t)); n.forEach((t) => subs.add(t)); if (n.length) cmd('frSub', { topics: n }).catch(() => {}); }
  function unsub(topics) { const n = topics.filter((t) => subs.has(t)); n.forEach((t) => subs.delete(t)); if (n.length) cmd('frUnsub', { topics: n }).catch(() => {}); }
  function pub(topic, payload, retain) { if (payload && payload.typ && payload.typ !== 'status' && payload.typ !== 'profile' && payload.typ !== 'hb') dl('→ ' + topic.slice(C.NS.length) + ' ' + payload.typ); return cmd('frPub', { topic, text: payload == null ? '' : C.seal(identity(), payload), retain: !!retain }).catch(() => {}); }
  const clearRetained = (topic) => cmd('frPub', { topic, text: '', retain: true }).catch(() => {});

  d.ipcMain.on('fr-net', (e, n) => { if (e.sender === d.scoresContents()) { net = n || net; changed(); } });
  d.ipcMain.on('fr-msg', (e, m) => { if (e.sender === d.scoresContents() && m && typeof m.topic === 'string') { try { onMsg(m.topic, m.text); } catch (er) { log('msg ' + er.message); } } });

  // ---------------- кеш профилей и статусов ----------------
  const profiles = {}; // key -> { doc, pk, t }
  const statuses = {}; // key -> { doc, pk, t, recv }
  // статус друга: онлайн, пока от него идут пульсы (по времени получения у нас — не зависит от часов друга)
  function stOf(key, now) {
    const e = statuses[key];
    if (!e || !e.doc) return { status: 'offline', doing: '', lastSeen: 0 };
    const age = now - (e.recv || 0);
    // сохранённая на брокере копия от давно ушедшего друга: если по его же часам ей больше получаса — не верим «в сети»
    const ancient = !!(e.firstRetained && e.t && now - e.t > 30 * 60e3);
    if (age > 150e3 || ancient) return { status: 'offline', doing: '', lastSeen: e.recv || 0 };
    const r = C.statusOf({ ...e.doc, t: now }, now);
    return { ...r, lastSeen: e.recv || 0 };
  }
  const elySkins = {}; // nick -> { skin, slim } | false
  function wantProfile(key) { sub([C.T.profile(key)]); }
  function elySkin(nick) {
    if (elySkins[nick] !== undefined) return elySkins[nick];
    elySkins[nick] = false;
    d.auth.elySkin(nick).then((s) => { if (s && s.dataUrl) { elySkins[nick] = { skin: s.dataUrl, slim: !!s.slim }; changed(); } }).catch(() => {});
    return false;
  }

  // ---------------- уведомления ----------------
  let prompt = null; // { kind: 'launch'|'rejoin', text, partyId }
  function note(kind, text, extra) {
    const m = me();
    if (!m) return;
    const list = [{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, text, t: Date.now(), read: false, ...(extra || {}) }, ...notes()].slice(0, 40);
    setPer('friendNotes', m.key, list);
    if (prefs().notify !== false) {
      d.send('toast', { text, kind: kind === 'removed' || kind === 'declined' ? 'info' : 'ok' });
      systemNote(text);
    }
    toGame({ t: 'toast', text, kind: 'info' });
    changed();
  }
  function systemNote(text, onClick) {
    try {
      const w = d.win();
      if (w && !w.isDestroyed() && w.isFocused()) return;
      if (!d.Notification || !d.Notification.isSupported()) return;
      const n = new d.Notification({ title: 'VillagersLauncher', body: text, silent: false });
      n.on('click', () => { const ww = d.win(); if (ww) { ww.show(); ww.focus(); } if (onClick) onClick(); });
      n.show();
    } catch (_) {}
  }

  // ---------------- подписки под текущий ник ----------------
  let boundKey = null;
  function bind() {
    const m = me();
    const k = m ? m.key : null;
    if (k === boundKey) return;
    if (boundKey) { unsub([...subs]); if (party) dropParty(true); }
    boundKey = k;
    if (!m) { changed(); return; }
    const b = book();
    sub([C.T.rq(m.key, '+'), C.T.inbox(m.key), C.T.profile(m.key)]);
    const keys = Object.keys(b.friends);
    sub(keys.flatMap((x) => [C.T.profile(x), C.T.status(x)]));
    Object.keys(b.out).forEach(wantProfile);
    Object.keys(b.inc).forEach(wantProfile);
    publishProfile(true);
    publishStatus(true);
    // повторить свои незавершённые заявки (вдруг брокер потерял retained)
    for (const [k2, o] of Object.entries(b.out)) pub(C.T.rq(k2, m.key), { typ: 'req', from: m.nick, to: o.nick, t: o.t, note: o.note || '' }, true);
    changed();
  }

  // ---------------- входящие ----------------
  function onMsg(topic, text) {
    const m = me();
    if (!m || !topic.startsWith(C.NS)) return;
    const rest = topic.slice(C.NS.length).split('/');
    const kind = rest[0];
    if (!text) return; // стёртый retained
    const msg = C.open(text);
    if (!msg) { dl('✗ ' + kind + ' ' + rest.slice(1).join('/') + ': подпись не сошлась'); return; }
    const now = Date.now();
    if (kind !== 'pt') dl('← ' + kind + ' ' + rest.slice(1).join('/') + ' от ' + msg.p.from + ' [' + fp(msg.pk) + '] ' + (msg.p.typ || '') + (msg.p.t ? ' (часы отправителя ' + Math.round((now - msg.p.t) / 1000) + ' с назад)' : ''));
    if (kind === 'pr' && rest[1]) {
      const key = rest[1];
      if (C.keyOf(msg.p.from) !== key || msg.p.typ !== 'profile') return;
      const f = book().friends[key];
      if (f && f.pk !== msg.pk && key !== m.key) { if ((Number(msg.p.t) || 0) > (keySeenT[key] || 0)) profiles[key] = { doc: msg.p, pk: msg.pk, t: Number(msg.p.t) || 0 }; keyMismatch(key, msg); changed(); return; } // профиль друга с другим ключом: показываем с предупреждением
      if (key === m.key && msg.pk !== m.pk) { profiles['!' + key] = { doc: msg.p, pk: msg.pk, t: msg.p.t }; return; } // тёзка
      const prev = profiles[key];
      if (prev && !C.fresher(prev.t, msg.p.t, now) && prev.pk === msg.pk) return;
      profiles[key] = { doc: msg.p, pk: msg.pk, t: Number(msg.p.t) || 0 };
      if (f) seen(key, msg.p.t);
      changed();
      return;
    }
    if (kind === 'st' && rest[1]) {
      const key = rest[1];
      const f = book().friends[key];
      if (f && f.pk !== msg.pk && C.keyOf(msg.p.from) === key && msg.p.typ === 'status') { keyMismatch(key, msg); return; }
      if (!f || f.pk !== msg.pk || C.keyOf(msg.p.from) !== key || msg.p.typ !== 'status') return;
      const prev = statuses[key];
      // часы у друзей могут расходиться на минуты: свежесть считаем по времени получения, а не по часам отправителя
      const t = Number(msg.p.t) || 0;
      if (prev && t && prev.t && t < prev.t && t > prev.t - 6 * 3600e3) return; // старая копия того же статуса
      const was = prev ? stOf(key, now).status : 'offline';
      statuses[key] = { doc: msg.p, pk: msg.pk, t, recv: now, firstRetained: !prev };
      seen(key, t);
      const nowSt = stOf(key, now).status;
      if (was === 'offline' && nowSt !== 'offline' && prev) d.send('toast', { text: f.nick + ' в сети', kind: 'info' });
      changed();
      return;
    }
    if (kind === 'rq' && rest[1] === m.key && rest[2]) {
      const fromKey = rest[2];
      const pr = profiles[fromKey];
      const r = C.onRq(book(), m.key, fromKey, msg, pr ? pr.pk : null);
      dl('  заявка → ' + (r.events.map((e) => e.kind).join(',') || 'без изменений') + (r.reply ? ', отвечаю ' + r.reply.typ : ''));
      saveBook(r.book);
      if (r.reply) pub(C.T.rq(fromKey, m.key), { typ: r.reply.typ, from: m.nick, to: msg.p.from, t: Date.now() }, true);
      if (r.clear) clearRetained(topic);
      for (const ev of r.events) onBookEvent(ev);
      return;
    }
    if (kind === 'in' && rest[1] === m.key) { onInbox(msg, now); return; }
    if (kind === 'pt' && party && rest[1] === party.id) { onParty(msg, now); }
  }
  // друг пишет с другим ключом (переустановил лаунчер, другой компьютер): раньше такие статусы и профиль молча отбрасывались —
  // друг навсегда «не в сети» с пустым профилем. Теперь показываем «Ключ друга сменился · Доверять новому ключу».
  // самое свежее время сообщения друга под принятым ключом (по его же часам): старые копии с другим ключом,
  // оставшиеся на каком-то сервере-посреднике, не должны перебивать новый ключ (иначе ключ «скачет» туда-обратно)
  const keySeenT = {};
  const seen = (key, t) => { t = Number(t) || 0; if (t > (keySeenT[key] || 0)) keySeenT[key] = t; };
  function keyMismatch(key, msg) {
    const t = Number(msg.p.t) || 0;
    if (t && t <= (keySeenT[key] || 0)) { dl('  старая копия ' + key + ' под ключом ' + fp(msg.pk) + ' — пропускаю'); return; }
    dl('  ключ друга ' + key + ' не совпал: ждал ' + fp((book().friends[key] || {}).pk) + ', пришёл ' + fp(msg.pk));
    const b = book();
    const f = b.friends[key];
    if (!f) return;
    f.newKey = { pk: msg.pk, xk: msg.xk, t: Number(msg.p.t) || Date.now() };
    saveBook(b);
    onBookEvent({ kind: 'keychanged', nick: f.nick, key });
  }
  const autoTrusted = {};
  function onBookEvent(ev) {
    const m = me();
    if (ev.kind === 'request') { wantProfile(ev.key); note('request', ev.nick + ' хочет дружить — ответь во вкладке «Друзья»', { nick: ev.nick }); }
    if (ev.kind === 'accepted') { sub([C.T.profile(ev.key), C.T.status(ev.key)]); note('accepted', ev.nick + ' теперь твой друг', { nick: ev.nick }); bumpFriends(); publishStatus(true); }
    if (ev.kind === 'declined') note('declined', ev.nick + ' отклонил заявку в друзья', { nick: ev.nick });
    if (ev.kind === 'removed') { unsub([C.T.status(ev.key)]); delete statuses[ev.key]; note('removed', ev.nick + ' убрал тебя из друзей', { nick: ev.nick }); bumpFriends(); }
    if (ev.kind === 'keychanged') {
      // новый ключ друга принимаем сами (раньше нужно было нажать «Доверять новому ключу», а до того друг просто пропадал).
      // Не чаще раза в 10 минут на друга: если под одним ником пишут две установки, не скакать между ключами — тогда остаётся кнопка.
      const nt = (book().friends[ev.key] && book().friends[ev.key].newKey && book().friends[ev.key].newKey.t) || 0;
      if (trustKey(ev.key)) {
        seen(ev.key, nt);
        if (!autoTrusted[ev.key]) note('key', 'У ' + ev.nick + ' сменился ключ (переустановил лаунчер или новый компьютер) — принят автоматически.', { nick: ev.nick });
        autoTrusted[ev.key] = Date.now();
      }
    }
    if (m) changed();
  }
  function bumpFriends() {
    const n = Object.keys(book().friends).length;
    const p = d.profile();
    p.stats = { ...(p.stats || {}), friends: Math.max(n, (p.stats && p.stats.friends) || 0) };
    d.setProfile(p);
  }

  // ---------------- профиль и статус ----------------
  let activity = { launcher: '', game: '' }; // что делаю: мини-игра в лаунчере / из игры
  let docCache = { t: 0, key: null, doc: null };
  function profileDoc(m, fresh) {
    if (!fresh && docCache.key === m.key && Date.now() - docCache.t < 3000) return docCache.doc;
    const doc = buildDoc(m);
    docCache = { t: Date.now(), key: m.key, doc };
    return doc;
  }
  function buildDoc(m) {
    const p = d.profile();
    const s = store.get();
    let skin = null; let cape = null; let slim = false;
    try { const cur = d.extras.currentSkin(s.gameDir); if (cur) { skin = cur.skin; cape = cur.cape; slim = !!cur.slim; } } catch (_) {}
    if (skin && skin.length > 60000) skin = null;
    if (cape && cape.length > 40000) cape = null;
    const rw = Object.entries(p.rewards || {});
    const pr = prefs();
    // персонаж SkinKokk (вкладка «Персонаж»): друзья видят его в профиле и в лобби
    let character = null;
    try { const ch = d.character ? d.character() : null; if (ch && ch.on !== false && JSON.stringify(ch).length <= 12000) character = ch; } catch (_) {}
    return {
      typ: 'profile', from: m.nick, t: Date.now(), ver: 1,
      level: X.accountLevel(p), mastery: X.masteryLevels(p), rewards: rw.map(([id]) => id).slice(0, 300),
      recent: rw.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0)).slice(0, 8).map(([id, t]) => ({ id, t: Number(t) || 0 })),
      equip: { badge: p.equip.badge || null, title: p.equip.title || null, frame: p.equip.frame || null, theme: p.equip.theme || null, cape: p.equip.cape || null, decor: p.equip.decor || null, lobby: p.equip.lobby || null },
      skin, slim, cape, ely: !!m.ely && !skin, character,
      about: String(pr.about || '').slice(0, 300), showcase: (pr.showcase || []).slice(0, 6),
      records: { ...(s.gameBest || {}) }, playMs: s.playTimeMs || 0, party: (p.stats && p.stats.party) || 0,
      friends: Object.keys(book().friends).length, equipItems: pr.equip
    };
  }
  let profT = null;
  function publishProfile(now) {
    clearTimeout(profT);
    profT = setTimeout(() => { const m = me(); if (m) { const doc = profileDoc(m, true); profiles[m.key] = { doc, pk: m.pk, t: doc.t }; pub(C.T.profile(m.key), doc, true); changed(); } }, now ? 300 : 4000);
  }
  function doing() {
    const g = d.getGame();
    const st = party && party.st;
    if (g) {
      if (st && st.live && ['live', 'ingame'].includes(st.phase)) return 'В отряде на сервере «' + st.live.name + '»';
      if (activity.game) return activity.game;
      return party && st && st.members.length > 1 ? 'В Minecraft, в лобби отряда' : 'В Minecraft';
    }
    if (activity.launcher) return activity.launcher;
    if (party && st && st.members.length > 1) return 'В лобби отряда (' + st.members.length + ')';
    return 'В лаунчере';
  }
  let lastStatus = '';
  let statusAt = 0;
  function publishStatus(force) {
    const m = me();
    if (!m) return;
    const hide = !!prefs().hide;
    const status = hide ? 'offline' : d.getGame() ? 'ingame' : 'online';
    const doc = { typ: 'status', from: m.nick, status, doing: hide ? '' : doing(), party: party && party.st ? party.st.members.length : 1 };
    const sig = JSON.stringify(doc);
    if (!force && sig === lastStatus && (hide || Date.now() - statusAt < 60e3)) return;
    if (hide && lastStatus && JSON.parse(lastStatus).status === 'offline' && !force) return;
    lastStatus = sig;
    statusAt = Date.now();
    pub(C.T.status(m.key), { ...doc, t: Date.now() }, true);
  }

  // ---------------- заявки ----------------
  function add(nick) {
    const m = me();
    if (!m) throw new Error('Сначала войди в аккаунт');
    nick = String(nick || '').trim();
    if (!C.NICK_RE.test(nick)) throw new Error('Ник — 2–16 символов: латиница, цифры, «_»');
    const key = C.keyOf(nick);
    if (key === m.key) throw new Error('Это ты :)');
    const b = book();
    if (b.friends[key]) throw new Error(nick + ' уже в друзьях');
    if (b.blocked[key]) delete b.blocked[key];
    if (b.inc[key]) { saveBook(b); return accept(key); }
    b.out[key] = { nick, t: Date.now() };
    saveBook(b);
    wantProfile(key);
    pub(C.T.rq(key, m.key), { typ: 'req', from: m.nick, to: nick, t: b.out[key].t, note: '' }, true);
    return true;
  }
  function accept(key) {
    const m = me();
    if (!m) throw new Error('Сначала войди в аккаунт');
    const b0 = book();
    const r = b0.inc[key];
    if (!r) throw new Error('Заявка не найдена');
    const b = C.acceptIncoming(b0, key);
    saveBook(b);
    pub(C.T.rq(key, m.key), { typ: 'acc', from: m.nick, to: r.nick, t: Date.now() }, true);
    clearRetained(C.T.rq(m.key, key));
    sub([C.T.profile(key), C.T.status(key)]);
    note('accepted', r.nick + ' теперь твой друг', { nick: r.nick });
    bumpFriends();
    publishStatus(true);
    return true;
  }
  function decline(key) {
    const m = me();
    const b = book();
    const r = b.inc[key];
    if (!m || !r) return false;
    delete b.inc[key];
    saveBook(b);
    pub(C.T.rq(key, m.key), { typ: 'dec', from: m.nick, to: r.nick, t: Date.now() }, true);
    clearRetained(C.T.rq(m.key, key));
    return true;
  }
  function cancel(key) {
    const m = me();
    const b = book();
    const o = b.out[key];
    if (!m || !o) return false;
    delete b.out[key];
    saveBook(b);
    pub(C.T.rq(key, m.key), { typ: 'rm', from: m.nick, to: o.nick, t: Date.now() }, true);
    return true;
  }
  function remove(key) {
    const m = me();
    const b = book();
    const f = b.friends[key];
    if (!m || !f) return false;
    delete b.friends[key];
    saveBook(b);
    unsub([C.T.status(key)]);
    delete statuses[key];
    pub(C.T.rq(key, m.key), { typ: 'rm', from: m.nick, to: f.nick, t: Date.now() }, true);
    return true;
  }
  function block(key, nick) {
    const b = book();
    const n = (b.friends[key] && b.friends[key].nick) || (b.inc[key] && b.inc[key].nick) || nick || key;
    if (b.friends[key]) remove(key);
    if (book().inc[key]) decline(key);
    if (book().out[key]) cancel(key);
    const b2 = book();
    b2.blocked[key] = n;
    saveBook(b2);
    for (const [id, inv] of Object.entries(invites)) if (C.keyOf(inv.from) === key) delete invites[id];
    return true;
  }
  function unblock(key) { const b = book(); delete b.blocked[key]; saveBook(b); return true; }
  function trustKey(key) {
    const b = book();
    const f = b.friends[key];
    if (!f) return false;
    // новый ключ: из пришедшего статуса/заявки (newKey) или из профиля, подписанного другим ключом
    const pr = profiles[key];
    const nk = f.newKey || (pr && pr.pk && pr.pk !== f.pk && pr.doc && typeof pr.doc.xk === 'string' ? { pk: pr.pk, xk: pr.doc.xk } : null);
    if (!nk) return false;
    dl('доверяю новому ключу ' + key + ': ' + fp(f.pk) + ' → ' + fp(nk.pk));
    f.pk = nk.pk; f.xk = nk.xk; delete f.newKey;
    saveBook(b);
    delete profiles[key]; delete statuses[key];
    unsub([C.T.profile(key), C.T.status(key)]); sub([C.T.profile(key), C.T.status(key)]); // перечитать retained
    return true;
  }

  // ---------------- отряд ----------------
  // party: { id, key, st, hbs, invited, joining, enterNow, connectSent, tunnelRoom, starting, crashed, counted, notice }
  let party = null;
  const invites = {}; // partyId -> { from, key, leader, size, t }
  let stage = { stage: null, progress: null }; // из игры (loadState)
  let soloMap = null; // мир, выбранный, пока ты один (переходит в отряд)
  const isLeader = () => !!(party && party.st && me() && party.st.leader === me().key);
  // «Максимум игроков» для игры отрядом: что лидер выбрал в лобби (запоминается) → «Мой сервер», если хозяин задал там сам → 20
  function playersDefault() {
    const s = store.get();
    if (s.partyMaxPlayers != null) return C.clampPlayers(s.partyMaxPlayers);
    const host = (s.hostServer || {}).maxPlayers;
    return host ? C.clampPlayers(host) : C.PLAYERS.def;
  }
  const partyPlayers = () => C.clampPlayers(party && party.st && party.st.maxPlayers != null ? party.st.maxPlayers : playersDefault(), playersDefault());
  function setMaxPlayers(n) {
    if (party && party.st && !party.joining && !isLeader()) throw Object.assign(new Error('Число игроков выбирает лидер отряда'), { code: 'leader_only' });
    const v = C.clampPlayers(n, null);
    if (v == null) throw Object.assign(new Error('Максимум игроков — число от ' + C.PLAYERS.min + ' до ' + C.PLAYERS.max), { code: 'bad' });
    store.set({ partyMaxPlayers: v });
    if (party && party.st && !party.joining && party.st.maxPlayers !== v) bumpState((x) => { x.maxPlayers = v; }); else changed();
    return v;
  }
  const myKey = () => (me() ? me().key : null);

  function partySend(body) {
    if (!party) return;
    const m = me();
    pub(C.T.party(party.id), { typ: 'pt', from: m.nick, t: Date.now(), x: C.partySeal(party.key, body) }, body.typ === 'state');
  }
  function publishState() {
    if (!party || !party.st || !isLeader()) return;
    party.st.t = Date.now();
    const { key, ...st } = party.st; // ключ отряда не рассылаем
    partySend({ typ: 'state', state: st });
    changed();
  }
  function bumpState(fn) { fn(party.st); party.st.seq++; publishState(); }
  function ensureParty() {
    if (party) return party;
    const m = me();
    if (!m) throw Object.assign(new Error('Сначала войди в аккаунт'), { code: 'offline' });
    const p = d.profile();
    const unlocked = X.lobbyUnlocked(p);
    const st = C.newParty(m, { background: p.equip.lobby && unlocked.has(p.equip.lobby) ? p.equip.lobby : 'meadow', map: soloMap });
    st.maxPlayers = playersDefault();
    party = { id: st.id, key: st.key, st, hbs: { [m.key]: { t: Date.now(), st: myState(), equip: prefs().equip } }, invited: {}, enterNow: false, connectSent: false, tunnelRoom: null, starting: false, crashed: false, counted: null };
    sub([C.T.party(party.id)]);
    publishState();
    sendHb();
    return party;
  }
  function dropParty(silent) {
    if (!party) return;
    const p = party;
    if (p.tunnelRoom && !isLeader()) leaveTunnel(p);
    unsub([C.T.party(p.id)]);
    party = null;
    prompt = null;
    if (!silent) changed();
  }
  function leave() {
    const m = me();
    if (!party || !m) return true;
    const st = party.st;
    if (isLeader()) {
      const others = st ? st.members.filter((x) => x.key !== m.key) : [];
      if (others.length) {
        const next = others.find((x) => C.alive(party.hbs, x.key, Date.now())) || others[0];
        bumpState((s) => { s.members = others; s.leader = next.key; });
      } else clearRetained(C.T.party(party.id));
    } else partySend({ typ: 'leave', nick: m.nick });
    dropParty();
    publishStatus(true);
    return true;
  }
  function invite(nick) {
    const m = me();
    if (!m) throw Object.assign(new Error('Сначала войди в аккаунт'), { code: 'offline' });
    const key = C.keyOf(nick);
    const f = book().friends[key];
    if (!f) throw Object.assign(new Error(nick + ' не в друзьях'), { code: 'not_friend' });
    const s = stOf(key, Date.now());
    if (s.status === 'offline') throw Object.assign(new Error(f.nick + ' сейчас не в сети'), { code: 'offline' });
    ensureParty();
    if (party.st && party.st.members.some((x) => x.key === key)) throw Object.assign(new Error(f.nick + ' уже в отряде'), { code: 'busy' });
    if (C.partyFull(party.st)) throw Object.assign(new Error(C.FULL_TEXT), { code: 'full' });
    const last = party.invited[key];
    if (last && Date.now() - last.t < 8000) return true;
    party.invited[key] = { t: Date.now(), pk: f.pk, xk: f.xk, nick: f.nick, by: m.key };
    if (!isLeader()) partySend({ typ: 'vouch', key, nick: f.nick, pk: f.pk, xk: f.xk });
    const leaderNick = (party.st.members.find((x) => x.key === party.st.leader) || {}).nick || m.nick;
    pub(C.T.inbox(key), { typ: 'inv', from: m.nick, to: f.nick, t: Date.now(), x: C.encryptFor(identity(), f.xk, { pkey: party.key, id: party.id, leader: leaderNick, size: party.st.members.length }) });
    changed();
    return true;
  }
  function onInbox(msg, now) {
    const m = me();
    const p = msg.p;
    const fromKey = C.keyOf(p.from);
    const f = C.friendBy(book(), fromKey, msg.pk);
    if (!f || book().blocked[fromKey] || now - (Number(p.t) || 0) > C.MSG_MAX_AGE || C.keyOf(p.to) !== m.key) {
      dl('  личное отброшено: ' + (!f ? 'не друг или другой ключ' : book().blocked[fromKey] ? 'в чёрном списке' : C.keyOf(p.to) !== m.key ? 'не мне' : 'слишком старое (часы?)'));
      return;
    }
    if (p.typ === 'inv') {
      const body = C.decryptFrom(identity(), f.xk, p.x);
      if (!body || !body.pkey || C.partyIdOf(body.pkey) !== body.id) return;
      if (party && party.id === body.id) return;
      invites[body.id] = { from: f.nick, key: body.pkey, leader: String(body.leader || f.nick).slice(0, 16), size: Number(body.size) || 1, t: now };
      toGame({ t: 'invite', from: f.nick, partyId: body.id, size: invites[body.id].size, leader: invites[body.id].leader });
      note('invite', f.nick + ' зовёт тебя в отряд', { nick: f.nick, partyId: body.id });
      systemNote(f.nick + ' зовёт тебя в отряд — открой «Друзья», чтобы принять');
      setTimeout(() => { if (invites[body.id] && Date.now() - invites[body.id].t >= C.INVITE_TTL) { delete invites[body.id]; changed(); } }, C.INVITE_TTL + 500);
    }
    if (p.typ === 'invno') { toGame({ t: 'toast', text: f.nick + ' отказался от приглашения' }); d.send('toast', { text: f.nick + ' отказался от приглашения', kind: 'info' }); }
    changed();
  }
  function acceptInvite(id) {
    const inv = invites[id];
    if (!inv || Date.now() - inv.t > C.INVITE_TTL) { delete invites[id]; throw Object.assign(new Error('Приглашение устарело — попроси позвать ещё раз'), { code: 'no_party' }); }
    if (inv.size >= C.PARTY_MAX) { delete invites[id]; throw Object.assign(new Error(C.FULL_TEXT), { code: 'full' }); }
    const m = me();
    if (party) leave();
    delete invites[id];
    party = { id, key: inv.key, st: null, hbs: {}, invited: {}, joining: Date.now(), enterNow: false, connectSent: false, tunnelRoom: null, starting: false, crashed: false, counted: null };
    sub([C.T.party(id)]);
    partySend({ typ: 'join', nick: m.nick, key: m.key, via: inv.from });
    sendHb();
    setTimeout(() => {
      if (party && party.id === id && party.joining) {
        partySend({ typ: 'join', nick: m.nick, key: m.key, via: inv.from }); // ещё раз: лидер мог не успеть подписаться
        setTimeout(() => { if (party && party.id === id && party.joining) { dropParty(); note('party', 'Не получилось вступить в отряд — лидер не ответил'); } }, 12000);
      }
    }, 6000);
    changed();
    return true;
  }
  function declineInvite(id) {
    const inv = invites[id];
    delete invites[id];
    const m = me();
    if (inv && m && book().friends[C.keyOf(inv.from)]) pub(C.T.inbox(C.keyOf(inv.from)), { typ: 'invno', from: m.nick, to: inv.from, t: Date.now() });
    changed();
    return true;
  }
  function onParty(msg, now) {
    const m = me();
    const body = C.partyOpen(party.key, msg.p.x);
    if (!body || typeof body.typ !== 'string') return;
    const sKey = C.keyOf(msg.p.from);
    if (now - (Number(msg.p.t) || 0) > C.MSG_MAX_AGE && body.typ !== 'state') return;
    const st = party.st;
    const member = st && st.members.find((x) => x.key === sKey);
    if (body.typ === 'state') {
      if (!C.acceptState(st, body.state, sKey, msg.pk, party.hbs, now)) return;
      const wasLeader = isLeader();
      const prevPhase = st ? st.phase : null;
      party.st = { ...body.state, key: party.key };
      party.hbs[sKey] = { ...(party.hbs[sKey] || {}), t: now };
      const inIt = party.st.members.some((x) => x.key === m.key);
      if (party.joining && inIt) {
        party.joining = null;
        for (const x of party.st.members) { if (!party.hbs[x.key]) party.hbs[x.key] = { t: now }; wantProfile(x.key); }
        note('party', 'Ты в отряде ' + (party.st.members.find((x) => x.key === party.st.leader) || {}).nick);
      } else if (!party.joining && !inIt) {
        dropParty();
        note('party', sKey === m.key ? 'Отряд распущен' : 'Тебя убрали из отряда');
        return;
      }
      for (const x of party.st.members) wantProfile(x.key);
      if (!wasLeader && isLeader()) note('party', 'Теперь ты лидер отряда');
      if (party.st.notice && party.st.notice.t > (party.noticeT || 0)) { party.noticeT = party.st.notice.t; toGame({ t: 'toast', text: party.st.notice.text, kind: party.st.notice.kind || 'info' }); d.send('toast', { text: party.st.notice.text, kind: party.st.notice.kind || 'info' }); }
      onPhase(prevPhase);
      changed();
      return;
    }
    if (body.typ === 'hb') {
      if (!member || member.pk !== msg.pk) return;
      party.hbs[sKey] = { t: now, st: String(body.st || ''), stage: body.stage || null, progress: typeof body.progress === 'number' ? body.progress : null, equip: C.cleanEquip(body.equip) };
      leaderCheck();
      changed();
      return;
    }
    if (body.typ === 'full') {
      // лидер не впустил: отряд уже полон
      if (party.joining && body.key === m.key) { dropParty(); note('party', C.FULL_TEXT); toGame({ t: 'error', re: 'accept', code: 'full', text: C.FULL_TEXT }); }
      return;
    }
    if (!isLeader()) return;
    // дальше — то, что решает лидер
    if (body.typ === 'join') {
      if (body.key !== sKey || st.members.some((x) => x.key === sKey)) { if (st.members.some((x) => x.key === sKey)) publishState(); return; }
      if (!C.mayJoin(party.invited, sKey, msg.pk, now)) return;
      if (C.partyFull(st)) { partySend({ typ: 'full', key: sKey }); return; }
      wantProfile(sKey);
      party.hbs[sKey] = { t: now, st: 'lobby' };
      delete party.invited[sKey];
      bumpState((s) => { s.members = [...s.members, { key: sKey, nick: String(msg.p.from).slice(0, 16), pk: msg.pk, xk: msg.xk }]; });
      return;
    }
    if (body.typ === 'vouch') {
      if (!member || member.pk !== msg.pk || !body.key || !body.pk) return;
      party.invited[String(body.key)] = { t: now, pk: String(body.pk), xk: String(body.xk || ''), nick: String(body.nick || '').slice(0, 16), by: sKey };
      return;
    }
    if (body.typ === 'leave') {
      if (!member || member.pk !== msg.pk) return;
      bumpState((s) => { s.members = s.members.filter((x) => x.key !== sKey); });
      delete party.hbs[sKey];
    }
  }
  // лидер: пропавшие, «пора заходить», все в мире; участник: подхватить лидерство, если лидер пропал
  function leaderCheck() {
    if (!party || !party.st || party.joining) return;
    const now = Date.now();
    const m = me();
    if (isLeader()) {
      party.hbs[m.key] = { ...(party.hbs[m.key] || {}), t: now, st: myState(), equip: prefs().equip, stage: stage.stage, progress: stage.progress };
      const r = C.leaderTick(party.st, party.hbs, now, m.key);
      if (r.changed) publishState();
    } else if (!C.alive(party.hbs, party.st.leader, now)) {
      const succ = C.successor(party.st, { ...party.hbs, [m.key]: { t: now } }, now);
      if (succ && succ.key === m.key) {
        const old = party.st.members.find((x) => x.key === party.st.leader);
        bumpState((s) => { s.leader = m.key; if (s.phase === 'starting') s.phase = 'lobby'; });
        note('party', (old ? old.nick : 'Лидер') + ' пропал — теперь ты лидер отряда');
      }
    }
  }
  function sendHb() {
    if (!party) return;
    const m = me();
    if (!m) return;
    const hb = { typ: 'hb', st: myState(), stage: stage.stage, progress: stage.progress, equip: prefs().equip };
    party.hbs[m.key] = { ...hb, t: Date.now() };
    partySend(hb);
  }

  // ---------------- совместный запуск ----------------
  function tunnelReadyFor(live) {
    if (!live) return null;
    if (isLeader() && live.mode === 'lan') return null; // «Сетевая игра»: лидер уже в своём мире
    if (isLeader()) return d.server.running() && d.server.state() === 'running' ? '127.0.0.1:' + (live.port || store.get().serverPort || 25565) : null;
    const ts = d.tunnelState();
    if (ts && ts.active && ts.role === 'guest' && ts.name === live.room && ts.status === 'connected' && ts.port) return '127.0.0.1:' + ts.port;
    return null;
  }
  function myState() {
    const st = party && party.st;
    return C.memberState({
      gameRunning: !!d.getGame(), linked: link.authed().length > 0, stage: stage.stage, phase: st ? st.phase : 'lobby',
      tunnelReady: !!(st && tunnelReadyFor(st.live)), crashed: !!(party && party.crashed), starting: !!(party && party.starting && !d.getGame())
    });
  }
  function leaveTunnel(p) {
    const ts = d.tunnelState();
    if (ts && ts.active && ts.role === 'guest' && p.tunnelRoom && ts.name === p.tunnelRoom) d.tunnelCmd('leave').catch(() => {});
    p.tunnelRoom = null;
  }
  function onPhase(prev) {
    const st = party && party.st;
    if (!st) return;
    const live = st.live;
    if ((st.phase === 'live' || st.phase === 'ingame') && live) {
      if (!isLeader() && party.tunnelRoom !== live.room) {
        if (d.server.running()) { note('party', 'У тебя работает свой сервер — останови его, чтобы зайти к отряду'); }
        else {
          party.tunnelRoom = live.room;
          d.tunnelCmd('join', d.tunnelOpts({ name: live.room, password: live.pass, mode: 'server' })).catch((e) => log('tunnel ' + e.message));
        }
      }
      if (prev !== 'live' && prev !== 'ingame') {
        party.connectSent = false; party.enterNow = false;
        if (!d.getGame()) {
          prompt = { kind: 'launch', text: 'Отряд заходит на сервер «' + live.name + '»', partyId: party.id };
          systemNote('Отряд заходит в мир — нажми «Принять и запустить игру» в лаунчере');
        }
      }
    } else {
      if (prev === 'live' || prev === 'ingame') {
        if (!isLeader() && party.tunnelRoom) leaveTunnel(party);
        party.connectSent = false; party.crashed = false; party.starting = false;
        prompt = null;
      }
    }
    pump();
  }
  // ---------------- файл отряда для сервера ----------------
  // Лаунчер, на котором работает «Мой сервер» отряда (лидер, или тот, чей сервер сейчас у отряда), пишет
  // <папка сервера>/config/villagerskokk/party.json — VillagersKokk на сервере сам собирает отряд в одну команду.
  // Без отряда (или не мой сервер) — members: [] (мод убирает из команды тех, кого туда поставил отряд).
  let partyFileSig = null;
  function partyFilePath() { try { return path.join(d.server.dir(), 'config', 'villagerskokk', 'party.json'); } catch (_) { return null; } }
  function hostedParty() {
    const st = party && !party.joining && party.st;
    if (!st) return null;
    let room = null;
    try { room = d.hosting.profile().room; } catch (_) {}
    return isLeader() || (st.live && room && st.live.room === room) ? st : null;
  }
  function syncPartyFile(force) {
    if (!d.server || typeof d.server.dir !== 'function') return;
    const sst = typeof d.server.state === 'function' ? d.server.state() : 'stopped';
    if (!force && (sst === 'stopped' || sst === 'stopping')) return; // запишется при следующем запуске сервера
    const doc = C.partyFileDoc(hostedParty());
    const sig = JSON.stringify([doc.id, doc.leader, doc.members]);
    if (!force && sig === partyFileSig) return;
    const f = partyFilePath();
    if (!f) return;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2));
      fs.renameSync(f + '.tmp', f);
      partyFileSig = sig;
    } catch (e) { log('party.json ' + e.message); }
  }

  // каждую секунду (и по событиям): готов ли я, слать ли connect
  function pump() {
    if (!party || !party.st) return;
    const st = party.st;
    const prevSt = party.hbs[myKey()] && party.hbs[myKey()].st;
    const mySt = myState();
    if (mySt !== prevSt) sendHb();
    const addr = tunnelReadyFor(st.live);
    if (C.shouldConnect({ st, myHb: { st: mySt }, enterNow: party.enterNow, tunnelReady: !!addr, alreadySent: party.connectSent }) && link.authed().length) {
      party.connectSent = true;
      party.crashed = false;
      toGame({ t: 'connect', address: addr, password: null, server: st.live.name });
    }
    if (['starting', 'live', 'ingame'].includes(st.phase)) {
      const now = Date.now();
      const loading = st.members.map((x) => { const h = party.hbs[x.key] || {}; return { nick: x.nick, stage: h.stage || h.st || null, progress: typeof h.progress === 'number' ? h.progress : null, state: C.alive(party.hbs, x.key, now) ? h.st || 'lobby' : 'offline' }; });
      const sig = JSON.stringify([loading, st.live && st.live.go]);
      if (sig !== party.membersSig) {
        party.membersSig = sig;
        toGame({ t: 'members', loading, deadline: st.live ? st.live.deadline : null, waitingFor: C.waitingFor(st, party.hbs, now), go: !!(st.live && st.live.go) });
      }
    }
    // совместная игра засчитывается, когда я в мире вместе хотя бы с одним другом
    if (mySt === 'world' && st.members.length > 1 && st.live && party.counted !== st.live.room + st.live.at) {
      party.counted = st.live.room + st.live.at;
      const p = d.profile();
      p.stats = { ...(p.stats || {}), party: ((p.stats && p.stats.party) || 0) + 1 };
      d.setProfile(p);
    }
  }
  async function start(arg, where) {
    const m = me();
    ensureParty();
    if (!isLeader()) throw Object.assign(new Error('Запускает только лидер отряда'), { code: 'leader_only' });
    const st = party.st;
    if (st.phase !== 'lobby') throw Object.assign(new Error('Отряд уже запускается'), { code: 'busy' });
    let map = C.cleanMap(arg) || st.map;
    const hp = d.hosting.profile();
    if (where === 'lan') return startLan(map);
    if (!map && hp.world) map = { kind: 'server', name: hp.world };
    if (!map) throw Object.assign(new Error('Выбери мир: свой одиночный, мир сервера или новый'), { code: 'world' });
    const ws = d.hosting.worlds();
    const targetWorld = map.kind === 'new' ? null : map.name;
    if (d.server.running()) {
      if (targetWorld && hp.world === targetWorld) { st.map = map; return goLive(); }
      throw Object.assign(new Error('Уже работает твой сервер с миром «' + (hp.world || 'world') + '» — останови его или выбери этот мир'), { code: 'server' });
    }
    if (!store.get().serverEulaAccepted) throw Object.assign(new Error('Один раз прими лицензию Minecraft (EULA): лаунчер → «С друзьями» → «Мой сервер»'), { code: 'eula' });
    if (d.isBusy()) throw Object.assign(new Error('Лаунчер занят (обновление или проверка файлов) — подожди немного'), { code: 'busy' });
    // мир: одиночный → копия на сервер (если копия на сервере новее — берём её), мир сервера, или новый
    if (map.kind === 'world') {
      const sp = ws.single.find((w) => w.name === map.name);
      if (!sp) throw Object.assign(new Error('Мир «' + map.name + '» не найден в saves'), { code: 'world' });
      const sv = ws.server.find((w) => w.name === map.name);
      if (sv && sv.mtime > sp.mtime) d.hosting.update({ world: map.name });
      else d.hosting.importWorld(map.name, true);
    } else if (map.kind === 'server') {
      if (!ws.server.some((w) => w.name === map.name)) throw Object.assign(new Error('На сервере нет мира «' + map.name + '»'), { code: 'world' });
      d.hosting.update({ world: map.name });
    } else {
      let name = map.name;
      for (let i = 2; ws.server.some((w) => w.name === name); i++) name = map.name + ' ' + i;
      map.name = name;
      d.hosting.newWorld(name);
      d.hosting.updateGame({ seed: map.seed || '', levelType: C.levelTypeOf(map.type) }); // level-type в server.properties: id пресета мира из игры
    }
    // отряд не ограничивает вход: на сервер заходят и не из отряда — до «Максимума игроков» (не меньше размера отряда)
    const players = Math.max(partyPlayers(), st.members.length);
    bumpState((s) => { s.phase = 'starting'; s.where = 'server'; s.map = map; s.maxPlayers = players; s.notice = { t: Date.now(), text: 'Лидер запускает сервер «' + hp.name + '»…', kind: 'info' }; });
    toGame({ t: 'toast', text: 'Запускаю сервер «' + hp.name + '» (до ' + players + ' игроков)…' });
    log('party start by ' + m.nick + ' map ' + JSON.stringify(map) + ' max ' + players);
    syncPartyFile(true);
    (async () => {
      try { await d.startServer({ maxPlayers: players }); } catch (e) {
        if (party && party.st && party.st.phase === 'starting') bumpState((s) => { s.phase = 'lobby'; s.notice = { t: Date.now(), text: 'Сервер не запустился: ' + e.message, kind: 'error' }; });
        toGame({ t: 'error', re: 'start', code: 'server', text: 'Сервер не запустился: ' + e.message });
      }
    })();
    return true;
  }
  function goLive(lan) {
    if (!party || !isLeader()) return;
    const hp = d.hosting.profile();
    const now = Date.now();
    bumpState((s) => {
      s.phase = 'live';
      s.live = lan
        ? { room: lan.room, pass: lan.pass, name: lan.name, port: lan.port, mode: 'lan', at: now, deadline: now + C.ENTER_WAIT, go: false }
        : { room: hp.room, pass: d.hosting.hostTunnelPassword(), name: hp.name, port: store.get().serverPort || 25565, at: now, deadline: now + C.ENTER_WAIT, go: false };
      s.notice = { t: now, text: (lan ? 'Мир «' + lan.name + '» открыт' : 'Сервер готов') + ' — заходим! Ждём остальных не дольше минуты.', kind: 'ok' };
    });
    onPhase('starting');
  }

  // ---------------- «Сетевая игра»: мир открывает игра лидера ----------------
  // Лидер (игра) → start {where:'lan'} → лаунчер лидера: фаза starting, игре {t:'openWorld', world|newWorld, maxPlayers}
  // → игра открывает одиночный мир и сама открывает его для сети → {t:'lanReady', port, world} → лаунчер лидера открывает
  // комнату туннеля (своя на каждый запуск, пароль случайный) на этот порт → фаза live; участники — как с «Моим сервером».
  // Мир закрыт ({t:'lanStopped'}) или игра лидера закрылась → туннель закрыт, фаза lobby. Протокол: party_protocol.md, 3.4.
  let lan = null; // { room, pass, timer }
  function startLan(map) {
    const st = party.st;
    if (!map) throw Object.assign(new Error('Выбери мир: свой одиночный или новый'), { code: 'world' });
    if (map.kind === 'server') throw Object.assign(new Error('Мир «Моего сервера» играется только на нём — выбери «Где играть: Мой сервер» или одиночный мир'), { code: 'world' });
    if (map.kind === 'world' && !d.hosting.worlds().single.some((w) => w.name === map.name)) throw Object.assign(new Error('Мир «' + map.name + '» не найден в saves'), { code: 'world' });
    if (!link.authed().length) throw Object.assign(new Error('Сетевую игру открывает сама игра — запусти игру и нажми «Играть» в лобби'), { code: 'offline' });
    if (d.server.running()) throw Object.assign(new Error('Работает твой «Мой сервер» — останови его или выбери «Где играть: Мой сервер»'), { code: 'server' });
    const players = Math.max(partyPlayers(), st.members.length);
    if (lan && lan.timer) clearTimeout(lan.timer);
    const crypto = require('crypto');
    lan = { room: 'vkl-' + crypto.randomBytes(6).toString('hex'), pass: crypto.randomBytes(12).toString('hex'), timer: null };
    lan.timer = setTimeout(() => { if (party && party.st && party.st.phase === 'starting' && party.st.where === 'lan') endLan('Мир лидера так и не открылся', 'error'); }, 330000);
    if (lan.timer.unref) lan.timer.unref();
    bumpState((s) => { s.phase = 'starting'; s.where = 'lan'; s.map = map; s.maxPlayers = players; s.notice = { t: Date.now(), text: 'Лидер открывает мир «' + map.name + '» по сети…', kind: 'info' }; });
    toGame(map.kind === 'new'
      ? { t: 'openWorld', newWorld: { name: map.name, seed: map.seed || '', type: map.type || 'minecraft:normal' }, maxPlayers: players }
      : { t: 'openWorld', world: map.name, maxPlayers: players });
    log('party start (lan) by ' + me().nick + ' map ' + JSON.stringify(map) + ' max ' + players);
    changed();
    return true;
  }
  function lanReady(msg) {
    if (!party || !party.st || !isLeader() || party.st.where !== 'lan' || party.st.phase !== 'starting' || !lan) throw Object.assign(new Error('Отряд не ждёт сетевой мир'), { code: 'bad' });
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Object.assign(new Error('Не понял порт мира'), { code: 'bad' });
    const st = party.st;
    const world = typeof msg.world === 'string' && msg.world.trim() && !/[\\/]/.test(msg.world) ? msg.world.trim().slice(0, 64) : null;
    if (lan.timer) { clearTimeout(lan.timer); lan.timer = null; }
    if (world && st.map && st.map.kind === 'new') st.map = { kind: 'world', name: world }; // новый мир создан — дальше это одиночный мир
    const name = world || (st.map && st.map.name) || 'Мир отряда';
    d.tunnelCmd('host', { ...d.tunnelOpts({ name: lan.room, password: lan.pass, mode: 'server' }), serverPort: port }).catch((e) => log('tunnel ' + e.message));
    log('party lan ready: world ' + name + ' port ' + port + ' room ' + lan.room);
    goLive({ room: lan.room, pass: lan.pass, name, port });
  }
  function endLan(text, kind) {
    const room = lan && lan.room;
    if (lan && lan.timer) clearTimeout(lan.timer);
    lan = null;
    const ts = d.tunnelState();
    if (room && ts && ts.active && ts.role === 'host' && ts.name === room) d.tunnelCmd('leave').catch(() => {});
    if (party && party.st && isLeader() && party.st.where === 'lan' && ['starting', 'live', 'ingame'].includes(party.st.phase)) {
      const prev = party.st.phase;
      bumpState((x) => { x.phase = 'lobby'; x.live = null; x.notice = { t: Date.now(), text, kind: kind || 'info' }; });
      onPhase(prev);
    }
    changed();
  }

  // файл отряда для VillagersKokk в мире «Сетевой игры»: <папка игры>/config/villagerskokk/party.json (папка сервера
  // встроенного сервера = папка игры); вне сетевой игры — пустой (только если мы его писали или он остался от прошлого раза)
  let lanFileSig = null;
  function lanFilePath() { const g = store.get().gameDir; return g ? path.join(g, 'config', 'villagerskokk', 'party.json') : null; }
  try { const j = JSON.parse(fs.readFileSync(lanFilePath(), 'utf8')); if (j && Array.isArray(j.members) && j.members.length) lanFileSig = 'stale'; } catch (_) {}
  function syncLanFile() {
    const st = party && !party.joining && party.st;
    const on = !!(st && isLeader() && st.where === 'lan' && ['starting', 'live', 'ingame'].includes(st.phase));
    if (!on && lanFileSig === null) return;
    const doc = C.partyFileDoc(on ? st : null);
    const sig = JSON.stringify([doc.id, doc.leader, doc.members]);
    if (sig === lanFileSig) return;
    const f = lanFilePath();
    if (!f) return;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2));
      fs.renameSync(f + '.tmp', f);
      lanFileSig = on ? sig : null;
    } catch (e) { log('party.json (lan) ' + e.message); }
  }
  function onServerState(s) {
    if (s && (s.state === 'installing' || s.state === 'starting')) syncPartyFile(true);
    if (!party || !party.st || !isLeader()) return;
    const st = party.st;
    if (st.where === 'lan') return; // «Сетевая игра»: «Мой сервер» тут ни при чём
    if (s.state === 'running' && st.phase === 'starting') goLive();
    if (s.state === 'stopped' && ['starting', 'live', 'ingame'].includes(st.phase)) {
      const prev = st.phase;
      bumpState((x) => { x.phase = 'lobby'; x.live = null; x.notice = { t: Date.now(), text: s.crashed ? 'Сервер лидера упал' + (s.hint ? ': ' + s.hint : '') : 'Сервер остановлен — отряд снова в лобби', kind: s.crashed ? 'error' : 'info' }; });
      onPhase(prev);
    }
  }
  function enterNow() {
    if (!party || !party.st) throw Object.assign(new Error('Ты не в отряде'), { code: 'no_party' });
    if (isLeader() && party.st.live && !party.st.live.go) bumpState((s) => { s.live.force = true; s.live.go = true; });
    party.enterNow = true;
    party.connectSent = false; // «зайти в мир» ещё раз (вышел в меню или вылетел)
    pump();
    return true;
  }
  // «Принять и запустить игру» / «Вернуться к отряду»: игра стартует сразу на сервер
  async function launch() {
    if (!party || !party.st || !party.st.live) throw new Error('Отряд сейчас не в мире');
    if (d.getGame()) { party.connectSent = false; party.enterNow = true; pump(); prompt = null; changed(); return true; }
    prompt = null;
    party.starting = true;
    sendHb();
    changed();
    let addr = tunnelReadyFor(party.st.live);
    for (let i = 0; !addr && i < 40; i++) { await new Promise((r) => setTimeout(r, 750)); if (!party || !party.st || !party.st.live) return false; addr = tunnelReadyFor(party.st.live); }
    if (!addr) addr = '127.0.0.1:' + (isLeader() ? store.get().serverPort || 25565 : (d.tunnelState().port || store.get().tunnelLocalPort || 25565));
    try {
      party.connectSent = true; // игра сама зайдёт по --quickPlayMultiplayer
      await d.playGame({ quickPlay: addr });
    } catch (e) { if (party) { party.starting = false; party.connectSent = false; sendHb(); } throw e; }
    return true;
  }
  function onGameStart() { link.writeLinkFile(store.get().gameDir); stage = { stage: null, progress: null }; if (party) { party.starting = false; sendHb(); } publishStatus(true); }
  function onGameExit(code) {
    stage = { stage: null, progress: null };
    activity.game = '';
    if (party && party.st && isLeader() && party.st.where === 'lan' && ['starting', 'live', 'ingame'].includes(party.st.phase)) {
      endLan(code !== 0 && code !== null ? 'Игра лидера вылетела — мир закрыт, отряд снова в лобби' : 'Лидер закрыл игру — отряд снова в лобби', code !== 0 && code !== null ? 'error' : 'info');
    }
    if (party && party.st && ['live', 'ingame'].includes(party.st.phase)) {
      const crashed = code !== 0 && code !== null;
      party.crashed = crashed;
      party.connectSent = false;
      prompt = { kind: 'rejoin', text: crashed ? 'Игра закрылась с ошибкой — отряд ещё в мире' : 'Отряд ещё в мире «' + party.st.live.name + '»', partyId: party.id };
      if (crashed) systemNote('Игра вылетела — вернись к отряду из лаунчера');
    }
    if (party) sendHb();
    publishStatus(true);
    changed();
  }

  // ---------------- что видит игра и окно лаунчера ----------------
  function memberView(key, nick, extra) {
    const m = me();
    const mine = m && key === m.key;
    const pr = profiles[key];
    const doc = mine ? profileDoc(m) : pr ? pr.doc : null;
    let skin = doc && doc.skin; let slim = !!(doc && doc.slim);
    if (!skin && (doc ? doc.ely : mine && m.ely)) { const e = elySkin(nick); if (e) { skin = e.skin; slim = e.slim; } }
    const eq = (doc && doc.equip) || {};
    return {
      nick, skin: skin || null, slim, cape: (doc && doc.cape) || null, level: doc ? Number(doc.level) || 1 : 1,
      character: doc && doc.character && typeof doc.character === 'object' ? doc.character : null,
      badge: X.badgeInfo(eq.badge), frame: X.frameInfo(eq.frame), title: eq.title && X.rewardById(eq.title) ? X.rewardById(eq.title).name : null,
      decor: eq.decor || null, ...(extra || {})
    };
  }
  function partyView() {
    const m = me();
    const p = d.profile();
    const unlocked = X.lobbyUnlocked(p);
    const backgrounds = X.LOBBY_BGS.map((b) => ({ id: b.id, name: b.name, unlocked: unlocked.has(b.id), how: b.free ? 'Открыт сразу' : ((X.REWARDS.find((r) => r.kind === 'lobby' && r.lobby === b.id) || {}).how || '') }));
    const menu = { theme: X.themeInfo(p.equip.theme), decor: p.equip.decor || null };
    const limits = { partyMax: C.PARTY_MAX, maxPlayers: partyPlayers(), playersMin: C.PLAYERS.min, playersMax: C.PLAYERS.max };
    if (!m) return { id: null, solo: true, leader: null, me: null, phase: 'lobby', members: [], background: 'meadow', backgrounds, map: null, invited: [], server: null, deadline: null, go: false, menu, ...limits };
    const now = Date.now();
    if (!party || !party.st || party.joining) {
      const solo = { id: null, solo: true, leader: m.nick, me: m.nick, phase: 'lobby', background: p.equip.lobby && unlocked.has(p.equip.lobby) ? p.equip.lobby : 'meadow', backgrounds, map: soloMap, invited: [], server: null, deadline: null, go: false, menu, joining: !!(party && party.joining), ...limits };
      solo.members = [memberView(m.key, m.nick, { leader: true, me: true, online: true, state: myState(), stage: stage.stage, progress: stage.progress, equip: prefs().equip })];
      return solo;
    }
    const st = party.st;
    const leaderNick = (st.members.find((x) => x.key === st.leader) || {}).nick || null;
    return {
      id: party.id, solo: st.members.length === 1 && !Object.keys(party.invited).length, leader: leaderNick, me: m.nick, phase: st.phase,
      members: st.members.map((x) => {
        const h = party.hbs[x.key] || {};
        const mine = x.key === m.key;
        const on = mine || C.alive(party.hbs, x.key, now);
        return memberView(x.key, x.nick, {
          leader: x.key === st.leader, me: mine, online: on, state: mine ? myState() : on ? h.st || 'lobby' : 'offline',
          stage: mine ? stage.stage : h.stage || null, progress: mine ? stage.progress : typeof h.progress === 'number' ? h.progress : null,
          equip: mine ? prefs().equip : h.equip || { main: null, off: null, head: null, chest: null, legs: null, feet: null }
        });
      }),
      background: st.background || 'meadow', backgrounds, map: st.map || null,
      invited: Object.values(party.invited).filter((i) => now - i.t < C.INVITE_TTL).map((i) => i.nick),
      server: st.live ? { name: st.live.name, address: tunnelReadyFor(st.live) } : null, where: st.where || 'server',
      deadline: st.live ? st.live.deadline : null, go: !!(st.live && st.live.go), menu, ...limits, full: C.partyFull(st)
    };
  }
  function friendItems() {
    const b = book();
    const now = Date.now();
    const inParty = new Set(party && party.st ? party.st.members.map((x) => x.key) : []);
    const full = C.partyFull(party && party.st);
    const ord = { ingame: 0, online: 1, offline: 2 };
    return Object.entries(b.friends).map(([key, f]) => {
      const s = stOf(key, now);
      const pr = profiles[key];
      const v = memberView(key, f.nick, { status: s.status, doing: s.doing, inParty: inParty.has(key), invitable: s.status !== 'offline' && !inParty.has(key) && !full });
      v.equip = (pr && pr.doc && pr.doc.equipItems) ? C.cleanEquip(pr.doc.equipItems) : null;
      v.key = key; v.newKey = !!f.newKey; v.since = f.since; v.verified = !!(pr && pr.pk === f.pk);
      return v;
    }).sort((a, b2) => ord[a.status] - ord[b2.status] || a.nick.localeCompare(b2.nick));
  }
  // полный профиль для страницы профиля (свой или друга/любого ника)
  function profileView(nickOrKey) {
    const m = me();
    const key = C.keyOf(nickOrKey || (m && m.nick));
    const mine = m && key === m.key;
    if (!mine) wantProfile(key);
    const b = book();
    const pr = profiles[key];
    const doc = mine ? profileDoc(m) : pr ? pr.doc : null;
    const f = b.friends[key];
    const s = mine ? { status: prefs().hide ? 'offline' : d.getGame() ? 'ingame' : 'online', doing: prefs().hide ? 'Статус скрыт' : doing() } : stOf(key, Date.now());
    const nick = (doc && doc.from) || (f && f.nick) || (b.inc[key] && b.inc[key].nick) || (b.out[key] && b.out[key].nick) || nickOrKey;
    const base = memberView(key, nick, {});
    return {
      key, nick, me: !!mine, friend: !!f, incoming: !!b.inc[key], outgoing: !!b.out[key], blocked: !!b.blocked[key], loaded: !!doc,
      verified: mine || !!(f && pr && pr.pk === f.pk), status: f || mine ? s.status : null, doing: f || mine ? s.doing : '',
      skin: base.skin, slim: base.slim, cape: base.cape, character: base.character, level: base.level, badge: base.badge, frame: base.frame, title: base.title,
      equip: (doc && doc.equip) || {}, mastery: (doc && doc.mastery) || {}, rewards: (doc && doc.rewards) || [], recent: (doc && doc.recent) || [],
      records: (doc && doc.records) || {}, playMs: (doc && doc.playMs) || 0, party: (doc && doc.party) || 0, friends: (doc && doc.friends) || 0,
      about: (doc && doc.about) || '', showcase: (doc && doc.showcase) || [], since: f ? f.since : null, t: doc ? doc.t : null
    };
  }
  function uiState() {
    const m = me();
    const b = book();
    const now = Date.now();
    return {
      me: m ? { nick: m.nick, key: m.key } : null, net, prefs: prefs(), friends: friendItems(),
      incoming: Object.entries(b.inc).map(([key, r]) => ({ key, nick: r.nick, t: r.t, suspicious: r.suspicious, level: profiles[key] ? profiles[key].doc.level : null })),
      outgoing: Object.entries(b.out).map(([key, o]) => ({ key, nick: o.nick, t: o.t })),
      blocked: Object.entries(b.blocked).map(([key, nick]) => ({ key, nick })),
      notes: notes(), invites: Object.entries(invites).filter(([, i]) => now - i.t < C.INVITE_TTL).map(([id, i]) => ({ id, from: i.from, leader: i.leader, size: i.size, t: i.t })),
      party: partyView(), prompt, linked: link.authed().length > 0, leader: isLeader()
    };
  }

  // ---------------- музыка лобби (игра играет треки лаунчера в главном меню) ----------------
  // Треки лаунчера синтезируются в окне (src/lib/music.js) — файлов у них нет. Окно один раз записывает каждый
  // открытый игроком трек в WAV (friends:musicNeed → friends:musicSave), файлы лежат в <папка игры>/.villagers/music
  // (туда же tracks.json — список, чтобы музыка была и без связи), игре уходит {t:'music', tracks, selected}.
  const MUSIC_V = 1; // поменять, если поменялся синтез: файлы перезапишутся
  function musicDir() { const g = store.get().gameDir; return g ? path.join(g, '.villagers', 'music') : null; }
  function musicFile(id) { const dir = musicDir(); return dir ? path.join(dir, id + '.v' + MUSIC_V + '.wav') : null; }
  function musicTracks() {
    const p = d.profile() || {};
    const list = [{ id: 'default', name: 'Мелодия лаунчера' }];
    for (const r of X.REWARDS) {
      if (r.kind !== 'music' || !r.track || !(p.rewards && p.rewards[r.id]) || list.some((t) => t.id === r.track)) continue;
      list.push({ id: r.track, name: (/«(.+)»/.exec(r.name) || [])[1] || r.name });
    }
    return list;
  }
  function musicSelected(list) {
    const want = prefs().lobbyMusic || ((d.profile() || {}).equip || {}).music || 'default';
    return list.some((t) => t.id === want) ? want : 'default';
  }
  function musicView() {
    const all = musicTracks();
    const ready = all.map((t) => ({ ...t, file: musicFile(t.id) })).filter((t) => t.file && fs.existsSync(t.file));
    return musicMessage(ready, musicSelected(all));
  }
  let lastMusic = '';
  function pushMusic(force) {
    try {
      const v = musicView();
      const s2 = JSON.stringify(v);
      if (!force && s2 === lastMusic) return;
      lastMusic = s2;
      const dir = musicDir();
      if (dir && v.tracks.length) {
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, 'tracks.json');
        fs.writeFileSync(f + '.tmp', JSON.stringify({ v: 1, tracks: v.tracks, selected: v.selected, at: Date.now() }, null, 1));
        fs.renameSync(f + '.tmp', f);
      }
      toGame(v);
    } catch (e) { log('music ' + e.message); }
  }

  // рассылка изменений: окну лаунчера и игре (не чаще ~6 раз в секунду)
  let chT = null;
  let lastGameParty = ''; let lastGameFriends = '';
  function changed() {
    if (chT) return;
    chT = setTimeout(() => {
      chT = null;
      try {
        syncPartyFile();
        syncLanFile();
        d.send('friends', uiState());
        if (link.authed().length) {
          const pv = partyView();
          const ps = JSON.stringify(pv);
          if (ps !== lastGameParty) { lastGameParty = ps; toGame({ t: 'party', state: pv }); }
          const fi = gameFriends();
          const fs2 = JSON.stringify(fi);
          if (fs2 !== lastGameFriends) { lastGameFriends = fs2; toGame({ t: 'friends', items: fi }); }
          pushMusic();
        }
      } catch (e) { log('changed ' + e.message); }
    }, 160);
  }
  const gameFriends = () => friendItems().map(({ key, newKey, since, verified, decor, ...x }) => x);
  function toGame(obj) { if (link) link.broadcast(obj); }

  // ---------------- связь с игрой ----------------
  const link = createLink({
    version: d.version,
    log: linkLog,
    onAuth: (c) => {
      const m = me();
      link.send(c, link.helloReply(m ? m.nick : null));
      lastGameParty = ''; lastGameFriends = '';
      link.send(c, { t: 'party', state: partyView() });
      link.send(c, { t: 'friends', items: gameFriends() });
      link.send(c, musicView());
      for (const [id, i] of Object.entries(invites)) if (Date.now() - i.t < C.INVITE_TTL) link.send(c, { t: 'invite', from: i.from, partyId: id, size: i.size, leader: i.leader });
      if (party) { party.starting = false; if (party.crashed || prompt) { party.connectSent = false; prompt = null; } }
      sendHb(); pump(); changed();
    },
    onClose: () => { if (party) sendHb(); changed(); },
    onMessage: async (c, msg) => {
      const ok = () => link.send(c, { t: 'ok', re: msg.t, rid: msg.rid });
      const leaderOnly = () => {
        if (!party || !party.st) throw Object.assign(new Error('Ты пока один — позови друга'), { code: 'no_party' });
        if (!isLeader()) throw Object.assign(new Error('Это может только лидер отряда'), { code: 'leader_only' });
      };
      switch (msg.t) {
        case 'friends': link.send(c, { t: 'friends', items: gameFriends(), rid: msg.rid }); break;
        case 'party': link.send(c, { t: 'party', state: partyView(), rid: msg.rid }); break;
        case 'invite': invite(String(msg.nick || '')); ok(); break;
        case 'accept': acceptInvite(String(msg.partyId || '')); ok(); break;
        case 'decline': declineInvite(String(msg.partyId || '')); ok(); break;
        case 'leave': leave(); ok(); break;
        case 'kick': {
          leaderOnly();
          const k = C.keyOf(msg.nick);
          if (k === myKey()) throw Object.assign(new Error('Себя выгнать нельзя — выйди из отряда'), { code: 'bad' });
          if (!party.st.members.some((x) => x.key === k)) throw Object.assign(new Error('Такого игрока нет в отряде'), { code: 'bad' });
          bumpState((s) => { s.members = s.members.filter((x) => x.key !== k); });
          delete party.invited[k];
          ok(); break;
        }
        case 'lead': {
          leaderOnly();
          const k = C.keyOf(msg.nick);
          if (!party.st.members.some((x) => x.key === k) || k === myKey()) throw Object.assign(new Error('Такого игрока нет в отряде'), { code: 'bad' });
          bumpState((s) => { s.leader = k; });
          ok(); break;
        }
        case 'equip': savePrefs({ equip: C.cleanEquip(msg.items) }); sendHb(); publishProfile(); ok(); break;
        case 'background': {
          if (party && !isLeader()) throw Object.assign(new Error('Фон выбирает лидер отряда'), { code: 'leader_only' });
          const id = String(msg.id || '');
          if (!X.LOBBY_BGS.some((b) => b.id === id)) throw Object.assign(new Error('Нет такого фона'), { code: 'bad' });
          if (!X.lobbyUnlocked(d.profile()).has(id)) throw Object.assign(new Error('Этот фон ещё не открыт'), { code: 'bad' });
          if (party && party.st) bumpState((s) => { s.background = id; });
          const p = d.profile(); p.equip = { ...p.equip, lobby: id }; p.equipT = Date.now(); d.setProfile(p);
          ok(); break;
        }
        case 'map': {
          if (party && !isLeader()) throw Object.assign(new Error('Мир выбирает лидер отряда'), { code: 'leader_only' });
          const mp = C.cleanMap(msg);
          if (!mp) throw Object.assign(new Error('Не понял, какой мир'), { code: 'world' });
          soloMap = mp;
          if (party && party.st) bumpState((s) => { s.map = mp; }); else changed();
          ok(); break;
        }
        case 'worlds': { const w = d.hosting.worlds(); link.send(c, { t: 'worlds', rid: msg.rid, single: w.single, server: w.server, current: d.hosting.profile().world || null }); break; }
        case 'maxPlayers': { const v = setMaxPlayers(msg.n !== undefined ? msg.n : msg.value); link.send(c, { t: 'ok', re: msg.t, rid: msg.rid, maxPlayers: v }); break; }
        case 'start': { if (msg.maxPlayers !== undefined) setMaxPlayers(msg.maxPlayers); await start(msg.newWorld ? { newWorld: msg.newWorld } : msg.world !== undefined ? { world: msg.world } : msg.server !== undefined ? { server: msg.server } : null, msg.where === 'lan' ? 'lan' : 'server'); ok(); break; }
        case 'cancel': {
          leaderOnly();
          if (party.st.phase !== 'starting') throw Object.assign(new Error('Нечего отменять'), { code: 'bad' });
          if (party.st.where === 'lan') { toGame({ t: 'lanCancel' }); endLan('Лидер отменил запуск', 'info'); } else d.server.stop().catch(() => {});
          ok(); break;
        }
        // «Сетевая игра» (игра лидера): мир открыт для сети / не открылся / закрыт
        case 'lanReady': lanReady(msg); ok(); break;
        case 'lanFailed': if (party && party.st && isLeader() && party.st.where === 'lan') endLan('Сетевая игра не открылась: ' + String(msg.text || '').slice(0, 200), 'error'); ok(); break;
        case 'lanStopped': if (party && party.st && isLeader() && party.st.where === 'lan') endLan('Лидер закрыл мир — отряд снова в лобби', 'info'); ok(); break;
        case 'loadState': {
          const sg = ['menu', 'connecting', 'joining', 'loading', 'world', 'failed'].includes(msg.stage) ? msg.stage : null;
          stage = { stage: sg, progress: typeof msg.progress === 'number' ? Math.max(0, Math.min(1, msg.progress)) : null };
          if (sg === 'failed' && party) { party.connectSent = false; party.enterNow = false; }
          if (sg === 'world' && party) { party.crashed = false; prompt = null; }
          sendHb(); pump(); publishStatus(); changed();
          break;
        }
        case 'enterNow': enterNow(); ok(); break;
        case 'music': {
          // {t:'music'} — прислать список; {t:'music', id} — игрок выбрал трек в лобби (только из открытых)
          if (msg.id !== undefined) {
            const id = String(msg.id || '');
            if (!musicTracks().some((t) => t.id === id)) throw Object.assign(new Error('Этот трек ещё не открыт'), { code: 'bad' });
            savePrefs({ lobbyMusic: id });
          }
          const v = musicView();
          lastMusic = JSON.stringify(v);
          link.send(c, { ...v, rid: msg.rid });
          break;
        }
        case 'activity': activity.game = String(msg.text || '').slice(0, 60); publishStatus(); ok(); break;
        case 'hello': break;
        default: link.send(c, { t: 'error', re: msg.t, rid: msg.rid, code: 'bad', text: 'Неизвестное сообщение ' + msg.t });
      }
    }
  });
  link.start().then((p) => { link.writeLinkFile(store.get().gameDir); linkLog('готова: 127.0.0.1:' + p + ', лаунчер ' + (d.version || '?')); }).catch((e) => linkLog('не запустилась: ' + e.message));

  // ---------------- таймеры ----------------
  let ready = false;
  d.whenReady().then(() => setTimeout(() => { ready = true; try { bind(); } catch (e) { log('bind ' + e.message); } }, d.bindDelay != null ? d.bindDelay : 2500));
  const timers = [];
  timers.push(setInterval(() => {
    try {
      if (!ready) return;
      bind();
      if (!me()) return;
      publishStatus();
      if (party) { sendHb(); leaderCheck(); }
    } catch (e) { log('tick ' + e.message); }
  }, d.tickMs || 8000));
  timers.push(setInterval(() => { try { if (party) { pump(); if (party.st && party.st.live && !party.st.live.go) leaderCheck(); } } catch (_) {} }, 1000));
  timers.push(setInterval(() => changed(), 30000)); // статусы «устаревают» сами — обновить список
  timers.push(setInterval(() => { if (subs.size) cmd('frSync', { topics: [...subs] }).catch(() => {}); }, 60000)); // сверка подписок с соединениями

  // ---------------- IPC окна лаунчера ----------------
  const h = d.handle;
  h('friends:state', () => { bind(); return uiState(); });
  h('friends:diag', () => {
    const m = me();
    const b = book();
    const L = [];
    L.push('VillagersLauncher ' + (d.version || '') + ' · ' + new Date().toISOString());
    L.push('Я: ' + (m ? m.nick + ' (' + m.key + ') ключ ' + fp(m.pk) : 'не вошёл'));
    L.push('Серверы: ' + (net.list ? net.list.map((x) => (x.ready ? '✓' : '✗') + x.host + (x.subs != null ? '(' + x.subs + ')' : '')).join(' ') : net.online + '/' + net.total) + (net.fr != null ? ' · подписок у соединений ' + net.fr : ''));
    L.push('Подписан на: ' + [...subs].map((t) => t.slice(C.NS.length)).join(' '));
    L.push('Друзья: ' + (Object.entries(b.friends).map(([k, f]) => f.nick + '[' + fp(f.pk) + (f.newKey ? '→' + fp(f.newKey.pk) : '') + ']' + ' ' + stOf(k, Date.now()).status).join(', ') || '—'));
    L.push('Мои заявки: ' + (Object.values(b.out).map((o) => o.nick).join(', ') || '—') + ' · Входящие: ' + (Object.values(b.inc).map((o) => o.nick + '[' + fp(o.pk) + ']').join(', ') || '—') + ' · Чёрный список: ' + (Object.values(b.blocked).join(', ') || '—'));
    L.push('Подписки: ' + subs.size);
    L.push('--- журнал ---');
    return L.concat(diag).join('\n');
  });
  h('friends:add', (nick) => add(nick));
  h('friends:accept', (key) => accept(key));
  h('friends:decline', (key) => decline(key));
  h('friends:cancel', (key) => cancel(key));
  h('friends:remove', (key) => remove(key));
  h('friends:block', ({ key, nick }) => block(key || C.keyOf(nick), nick));
  h('friends:unblock', (key) => unblock(key));
  h('friends:trustKey', (key) => trustKey(key));
  h('friends:prefs', (patch) => {
    const p = {};
    if (patch && patch.hide !== undefined) p.hide = !!patch.hide;
    if (patch && patch.about !== undefined) p.about = String(patch.about || '').slice(0, 300);
    if (patch && Array.isArray(patch.showcase)) p.showcase = patch.showcase.filter((x) => typeof x === 'string' && x.length < 64).slice(0, 6);
    if (patch && patch.notify !== undefined) p.notify = !!patch.notify;
    savePrefs(p);
    publishStatus(true);
    publishProfile();
    return prefs();
  });
  h('friends:profile', (nick) => profileView(nick));
  h('friends:invite', (nick) => invite(nick));
  h('friends:acceptInvite', (id) => acceptInvite(id));
  h('friends:declineInvite', (id) => declineInvite(id));
  h('friends:leave', () => leave());
  h('friends:kick', (nick) => { if (!isLeader()) throw new Error('Только лидер'); const k = C.keyOf(nick); bumpState((s) => { s.members = s.members.filter((x) => x.key !== k); }); return true; });
  h('friends:lead', (nick) => { if (!isLeader()) throw new Error('Только лидер'); const k = C.keyOf(nick); if (!party.st.members.some((x) => x.key === k)) throw new Error('Нет в отряде'); bumpState((s) => { s.leader = k; }); return true; });
  h('friends:launch', () => launch());
  h('friends:maxPlayers', (n) => setMaxPlayers(n));
  h('friends:dismiss', () => { prompt = null; changed(); return true; });
  h('friends:readNotes', () => { const m = me(); if (m) setPer('friendNotes', m.key, notes().map((n) => ({ ...n, read: true }))); changed(); return true; });
  h('friends:clearNotes', () => { const m = me(); if (m) setPer('friendNotes', m.key, []); changed(); return true; });
  // музыка лобби: каких файлов треков не хватает (окно их синтезирует) и запись готового файла
  h('friends:musicNeed', () => {
    if (!musicDir()) return { need: [], version: MUSIC_V };
    return { need: musicTracks().filter((t) => !fs.existsSync(musicFile(t.id))).map((t) => t.id), version: MUSIC_V };
  });
  h('friends:musicSave', ({ id, data } = {}) => {
    if (!musicTracks().some((t) => t.id === id)) throw new Error('Нет такого открытого трека');
    const buf = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data || []));
    if (buf.length < 44 || buf.length > 64 * 1024 * 1024 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Не WAV');
    const f = musicFile(id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', buf);
    fs.renameSync(f + '.tmp', f);
    // старые версии файла этого трека — прочь
    try { for (const n of fs.readdirSync(path.dirname(f))) if (n.startsWith(id + '.v') && n.endsWith('.wav') && path.join(path.dirname(f), n) !== f) fs.rmSync(path.join(path.dirname(f), n), { force: true }); } catch (_) {}
    pushMusic(true);
    return true;
  });
  h('friends:activity', (text) => { activity.launcher = String(text || '').slice(0, 60); publishStatus(); return true; });

  return {
    onServerState, onGameStart, onGameExit, onProfileChanged: () => { publishProfile(); pushMusic(); }, onTunnelState: () => { if (party) pump(); },
    onSkinChanged: () => publishProfile(), beforeLaunch: (dir) => link.writeLinkFile(dir),
    shutdown() { const m = me(); if (m && !prefs().hide) pub(C.T.status(m.key), { typ: 'status', from: m.nick, status: 'offline', doing: '', t: Date.now() }, true); if (party) leave(); link.stop(); timers.forEach(clearInterval); },
    linkInfo: () => ({ port: link.port() })
  };
};
