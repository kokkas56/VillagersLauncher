// «Студия Кокка» — отдельное окно (как Cinema 4D) + отдельные окна редакторов + встраивание окна игры.
// Окно грузит тот же интерфейс лаунчера с адресом #studio (или #studio-pop=<вкладка>), main.jsx выбирает, что показать.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { createHelper } = require('./embed.cjs');

const POP_TABS = ['dialogs', 'quests', 'vars', 'schemes', 'scene', 'build'];
const POP_TITLE = { dialogs: 'Диалоги', quests: 'Задания', vars: 'Переменные', schemes: 'Схемы', scene: 'Сцена', build: 'Строительство' };
// какие события главного процесса нужны окнам Студии
const FORWARD = ['studio-link', 'game-state', 'busy-state', 'studio-embed', 'studio-win'];

module.exports = function setupStudioWindow({ handle, store, dev, getGame, linkInfo, mainWindow, log, holdLink }) {
  let studio = null;
  const pops = new Map(); // tab → BrowserWindow
  const helper = createHelper(log);
  // встраивание: mode = off | embedded | side | pending; hwnd окна игры (строкой)
  const emb = { method: 'overlay', mode: 'off', hwnd: null, rect: null, hold: false, hidden: false, why: '', want: 'off' };

  function all() { return [studio, ...pops.values()].filter((w) => w && !w.isDestroyed()); }
  function forward(ch, data) { if (!FORWARD.includes(ch)) return; for (const w of all()) w.webContents.send(ch, data); }
  function embState() { return { mode: emb.mode, method: emb.method, prefer: embMethod(), want: emb.want, why: emb.why, hwnd: emb.hwnd, helper: process.platform !== 'win32' ? 'unsupported' : helper.available() ? 'ok' : 'missing', platform: process.platform, game: gameInfo() }; }
  function emitEmb() { forward('studio-embed', embState()); }
  function emitWin() { forward('studio-win', { type: 'pops', pops: [...pops.keys()].filter((k) => pops.get(k) && !pops.get(k).isDestroyed()) }); }
  function gameInfo() { const g = getGame(); const li = linkInfo() || {}; return { running: !!g, pid: (g && g.proc && g.proc.pid) || li.pid || null, linked: !!li.t }; }

  function load(w, hash) {
    if (dev) w.loadURL('http://localhost:5173/#' + hash);
    else w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash });
  }
  function makeWin(opts, hash) {
    const w = new BrowserWindow({
      frame: false, show: false, backgroundColor: '#262626', title: 'Студия Кокка',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
      ...opts
    });
    w.once('ready-to-show', () => w.show());
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.on('maximize', () => w.webContents.send('win-state', { maximized: true }));
    w.on('unmaximize', () => w.webContents.send('win-state', { maximized: false }));
    load(w, hash);
    return w;
  }
  function boundsOk(b) {
    if (!b || !(b.width > 400 && b.height > 300)) return false;
    return screen.getAllDisplays().some((d) => { const a = d.workArea; return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 20 && b.y < a.y + a.height - 80; });
  }
  function openStudio() {
    if (studio && !studio.isDestroyed()) { if (studio.isMinimized()) studio.restore(); studio.show(); studio.focus(); return true; }
    const saved = store.get().studioBounds;
    const b = boundsOk(saved) ? saved : { width: 1500, height: 920 };
    studio = makeWin({ ...b, minWidth: 1100, minHeight: 680 }, 'studio');
    // окно Студии держит живую связь с игрой всё время, пока открыто (не зависит от того, что делают вкладки)
    if (holdLink) holdLink(true);
    if (saved && saved.maximized) studio.once('ready-to-show', () => studio.maximize());
    const remember = () => {
      if (!studio || studio.isDestroyed() || studio.isMinimized()) return;
      const max = studio.isMaximized();
      store.set({ studioBounds: { ...(max ? (store.get().studioBounds || {}) : studio.getBounds()), maximized: max } });
    };
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(remember, 500); };
    studio.on('resize', later);
    studio.on('move', later);
    // в режиме «поверх» окно игры двигается вместе со Студией
    const follow = () => { if (emb.mode === 'embedded' && emb.method === 'overlay' && emb.rect) setRect(emb.rect).catch(() => {}); };
    studio.on('move', follow); studio.on('resize', follow); studio.on('maximize', follow); studio.on('unmaximize', follow); studio.on('restore', follow);
    studio.on('maximize', remember);
    studio.on('unmaximize', remember);
    // перед закрытием вернуть окно игры на место — иначе Windows закроет его вместе с родителем
    let closing = false;
    studio.on('close', (e) => {
      remember();
      if (emb.mode === 'embedded' && emb.hwnd && !closing) {
        e.preventDefault();
        closing = true;
        undock().catch(() => {}).finally(() => { if (studio && !studio.isDestroyed()) studio.close(); });
      }
    });
    studio.on('closed', () => {
      studio = null;
      if (holdLink) holdLink(false);
      emb.mode = 'off'; emb.want = 'off';
      for (const w of pops.values()) if (w && !w.isDestroyed()) w.close();
    });
    return true;
  }
  function openPop(tab) {
    if (!POP_TABS.includes(tab)) throw new Error('Нет такого редактора: ' + tab);
    const old = pops.get(tab);
    if (old && !old.isDestroyed()) { old.show(); old.focus(); return true; }
    const saved = (store.get().studioPops || {})[tab];
    const w = makeWin({ ...(boundsOk(saved) ? saved : { width: 1240, height: 780 }), minWidth: 900, minHeight: 560, title: 'Студия Кокка — ' + POP_TITLE[tab] }, 'studio-pop=' + tab);
    pops.set(tab, w);
    let tm = null;
    const remember = () => { clearTimeout(tm); tm = setTimeout(() => { if (w.isDestroyed() || w.isMinimized() || w.isMaximized()) return; store.set({ studioPops: { ...(store.get().studioPops || {}), [tab]: w.getBounds() } }); }, 500); };
    w.on('resize', remember); w.on('move', remember);
    w.on('closed', () => { if (pops.get(tab) === w) pops.delete(tab); emitWin(); });
    emitWin();
    return true;
  }

  // ---------- встраивание окна игры ----------
  function studioHwnd() {
    const buf = studio.getNativeWindowHandle();
    return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
  }
  // способ встраивания: overlay — окно игры без рамки лежит поверх видового окна (надёжно, по умолчанию);
  // child — настоящее дочернее окно (SetParent), на части видеокарт/драйверов даёт чёрный экран
  function embMethod() { return store.get().studioEmbedMode === 'child' ? 'child' : 'overlay'; }
  // прямоугольник видового окна → экранные физические пиксели (для overlay)
  function screenPx(r) {
    const cb = studio.getContentBounds();
    const d = { x: Math.round(cb.x + r.x), y: Math.round(cb.y + r.y), width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)) };
    let p = d;
    try { if (screen.dipToScreenRect) p = screen.dipToScreenRect(studio, d); } catch (_) {}
    return [p.x, p.y, Math.max(1, p.width), Math.max(1, p.height)];
  }
  function rectPx(r) { return emb.method === 'overlay' ? screenPx(r) : dipToPx(r); }
  function dipToPx(r) { const dpr = r.dpr || 1; return [Math.round(r.x * dpr), Math.round(r.y * dpr), Math.max(1, Math.round(r.w * dpr)), Math.max(1, Math.round(r.h * dpr))]; }
  async function findGame() {
    const li = linkInfo() || {};
    // игра сама сообщает hwnd в hello (на Windows); иначе ищем окно по pid процесса, который запустил лаунчер
    if (li.hwnd && /^\d+$/.test(String(li.hwnd))) {
      try { if ((await helper.cmd('alive', String(li.hwnd))) === '1') return String(li.hwnd); } catch (_) {}
    }
    const pids = [li.pid, getGame() && getGame().proc && getGame().proc.pid].filter((p) => Number.isInteger(Number(p)) && Number(p) > 0);
    let last = null;
    for (const pid of [...new Set(pids.map(Number))]) {
      try { return await helper.cmd('find', pid); } catch (e) { last = e; }
    }
    throw new Error(pids.length ? 'Окно игры не нашлось' + (last ? ' (' + last.message + ')' : '') : 'Игра не запущена через лаунчер и не сообщила своё окно');
  }
  async function embed() {
    if (!studio || studio.isDestroyed()) throw new Error('Окно Студии закрыто');
    emb.want = 'embedded';
    if (process.platform !== 'win32') { emb.why = 'Встраивание окна игры есть только в Windows — раскладываю окна рядом'; return side(); }
    emb.mode = 'pending'; emb.why = ''; emitEmb();
    try {
      const ok = await helper.start();
      if (!ok) throw new Error(helper.why() || 'PowerShell недоступен');
      const hwnd = await findGame();
      emb.method = embMethod();
      const [x, y, w, h] = emb.rect ? rectPx(emb.rect) : emb.method === 'overlay' ? screenPx({ x: 60, y: 80, w: 960, h: 540 }) : [0, 0, 640, 360];
      await helper.cmd(emb.method === 'overlay' ? 'overlay' : 'embed', hwnd, studioHwnd(), x, y, w, h);
      emb.hwnd = hwnd; emb.mode = 'embedded'; emb.hidden = false;
      lastRegion = ''; setRect().catch(() => {});
      if (emb.hold || (emb.rect && emb.rect.visible === false)) await helper.cmd('show', hwnd, 0).then(() => { emb.hidden = true; }).catch(() => {});
      emitEmb();
      return embState();
    } catch (e) {
      emb.mode = 'off';
      emb.why = 'Встроить не вышло: ' + e.message + '. Разложил окна рядом.';
      emitEmb();
      try { return await side(); } catch (e2) { emb.why = 'Встроить не вышло: ' + e.message + '. Рядом тоже: ' + e2.message; emb.mode = 'off'; emitEmb(); return embState(); }
    }
  }
  async function undock() {
    const hwnd = emb.hwnd;
    emb.want = 'off';
    if (emb.mode === 'embedded' && hwnd) {
      try { await helper.cmd('undock', hwnd); } catch (e) { log && log('undock: ' + e.message); }
    }
    emb.mode = 'off'; emb.hwnd = null; emb.hidden = false; lastRegion = '';
    emitEmb();
    return embState();
  }
  // окна рядом: Студия слева (58%), игра справа
  async function side() {
    if (!studio || studio.isDestroyed()) throw new Error('Окно Студии закрыто');
    if (emb.mode === 'embedded') await undock();
    emb.want = 'side';
    const d = screen.getDisplayMatching(studio.getBounds());
    const a = d.workArea;
    const sw = Math.round(a.width * 0.58);
    if (studio.isMaximized()) studio.unmaximize();
    studio.setBounds({ x: a.x, y: a.y, width: sw, height: a.height });
    let moved = false;
    if (process.platform === 'win32' && helper.available()) {
      try {
        const ok = await helper.start();
        if (ok) {
          const hwnd = await findGame();
          const s = d.scaleFactor || 1;
          await helper.cmd('place', hwnd, Math.round((a.x + sw) * s), Math.round(a.y * s), Math.round((a.width - sw) * s), Math.round(a.height * s));
          moved = true;
        }
      } catch (e) { emb.why = (emb.why ? emb.why + ' ' : '') + 'Окно игры подвинуть не вышло: ' + e.message; }
    }
    emb.mode = 'side';
    if (!moved && !emb.why) emb.why = 'Студия встала слева — перетащи окно игры в правую часть экрана.';
    emitEmb();
    return embState();
  }
  // перемещения склеиваются: пока помощник занят, копится только последний прямоугольник (окно игры не «догоняет» Студию)
  let rectBusy = false, rectAgain = false;
  async function setRect(r) {
    if (r !== undefined) {
      const holes = r && Array.isArray(r.holes) ? r.holes.filter((h) => Array.isArray(h) && h.length === 4 && h.every((v) => Number.isFinite(Number(v)))).slice(0, 12).map((h) => h.map(Number)) : (emb.rect && emb.rect.holes) || [];
      emb.rect = r && typeof r === 'object' ? { x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 1, h: Number(r.h) || 1, dpr: Number(r.dpr) || 1, visible: r.visible !== false, holes } : null;
    }
    if (rectBusy) { rectAgain = true; return true; }
    rectBusy = true;
    try { await applyRect(); } finally { rectBusy = false; }
    if (rectAgain) { rectAgain = false; setRect(); }
    return true;
  }
  let lastRegion = '';
  async function applyRect() {
    if (emb.mode !== 'embedded' || !emb.hwnd || !emb.rect) return true;
    const [x, y, w, h] = rectPx(emb.rect);
    const hide = emb.hold || !emb.rect.visible;
    try {
      if (hide !== emb.hidden) { await helper.cmd('show', emb.hwnd, hide ? 0 : 1); emb.hidden = hide; }
      if (!hide) {
        await helper.cmd('move', emb.hwnd, x, y, w, h);
        // дыры под плавающими панелями Студии (урок, окна, меню) — окно игры их не закрывает
        const sx = w / Math.max(1, emb.rect.w), sy = h / Math.max(1, emb.rect.h);
        const holes = (emb.rect.holes || []).map(([hx, hy, hw, hh]) => [Math.round((hx - emb.rect.x) * sx), Math.round((hy - emb.rect.y) * sy), Math.round(hw * sx), Math.round(hh * sy)])
          .filter(([hx, hy, hw, hh]) => hw > 0 && hh > 0 && hx < w && hy < h && hx + hw > 0 && hy + hh > 0);
        const key = w + 'x' + h + ':' + holes.map((q) => q.join(',')).join(';');
        if (key !== lastRegion) {
          lastRegion = key;
          await helper.cmd('region', emb.hwnd, w, h, holes.length, ...holes.flat()).catch((e) => { log && log('region: ' + e.message); });
        }
      }
    } catch (e) {
      // окно игры пропало (игру закрыли) — выходим из встраивания
      emb.mode = 'off'; emb.hwnd = null; emb.why = 'Окно игры пропало: ' + e.message; emitEmb();
    }
    return true;
  }

  handle('studio:openWindow', () => openStudio());
  handle('studio:popout', (tab) => openPop(String(tab)));
  handle('studio:popClose', (tab) => { const w = pops.get(String(tab)); if (w && !w.isDestroyed()) w.close(); return true; });
  handle('studio:popFocus', (tab) => { const w = pops.get(String(tab)); if (w && !w.isDestroyed()) { w.show(); w.focus(); return true; } return false; });
  handle('studio:focusMain', () => { if (studio && !studio.isDestroyed()) { studio.show(); studio.focus(); } return true; });
  handle('studio:winState', () => ({ pops: [...pops.keys()], embed: embState(), studioOpen: !!(studio && !studio.isDestroyed()) }));
  handle('studio:embed', async (mode) => {
    if (mode === 'embed') return embed();
    if (mode === 'side') return side();
    if (mode === 'undock' || mode === 'off') return undock();
    throw new Error('Неизвестный режим окна игры: ' + mode);
  });
  handle('studio:embedRect', (r) => setRect(r));
  // переключить способ встраивания (поверх / дочернее окно); если игра уже встроена — перевстроить
  handle('studio:embedMethod', async (m) => {
    store.set({ studioEmbedMode: m === 'child' ? 'child' : 'overlay' });
    if (emb.mode === 'embedded') { await undock(); return embed(); }
    emitEmb();
    return embState();
  });
  // меню/окна Студии поверх видового окна: на это время прячем встроенную игру (окно другой программы всегда сверху)
  handle('studio:embedHold', async (on) => {
    emb.hold = !!on;
    if (emb.mode === 'embedded' && emb.hwnd) await setRect(emb.rect);
    return true;
  });
  handle('studio:embedFocus', async () => { if (emb.mode === 'embedded' && emb.hwnd) { try { await helper.cmd('focus', emb.hwnd); } catch (_) {} } return true; });
  handle('studio:gameInfo', () => gameInfo());

  return {
    forward,
    open: openStudio,
    isOpen: () => !!(studio && !studio.isDestroyed()),
    embedded: () => emb.mode === 'embedded' && !!emb.hwnd,
    // игра закрылась — встраивание кончилось само
    onGameExit() { if (emb.mode !== 'off') { emb.mode = 'off'; emb.hwnd = null; emb.why = 'Игра закрылась'; emitEmb(); } else emitEmb(); },
    // главный процесс завершается: вернуть окно игры
    async shutdown() { try { if (emb.mode === 'embedded') await undock(); } catch (_) {} helper.stop(); },
    mainWindow
  };
};
