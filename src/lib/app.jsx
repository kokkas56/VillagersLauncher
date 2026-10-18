import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { call, on } from './api.js';
import { translate } from './i18n.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [info, setInfo] = useState(null);
  const [accounts, setAccounts] = useState({ accounts: [], selected: null });
  const [pack, setPack] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busyState, setBusyState] = useState({ busy: false, what: null });
  const [gameState, setGameState] = useState({ state: 'idle' });
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [update, setUpdate] = useState(null);
  const toastId = useRef(0);

  const lang = (settings && settings.language) || 'ru';
  const t = useCallback((s, vars) => translate(lang, s, vars), [lang]);

  const toast = useCallback((text, kind = 'info', ms = 4200) => {
    const id = ++toastId.current;
    setToasts((l) => [...l, { id, text, kind }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), ms);
  }, []);

  const refreshSettings = useCallback(async () => setSettings(await call('settings:get')), []);
  const saveSettings = useCallback(async (patch) => {
    const s = await call('settings:set', patch);
    setSettings(s);
    return s;
  }, []);
  const refreshAccounts = useCallback(async () => setAccounts(await call('accounts:list')), []);
  const refreshPack = useCallback(async () => {
    try { setPack(await call('pack:info')); } catch (e) { setPack({ error: e.message }); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await call('sys:info'));
        await refreshSettings();
        await refreshAccounts();
        refreshPack();
        try { const st = await call('game:status'); setBusyState({ busy: !!st.busy, what: st.what || null }); } catch (_) {}
      } catch (e) {
        setSettings({ language: 'ru', gameDir: '' });
      }
    })();
    const offs = [
      on('progress', setProgress),
      on('busy-state', setBusyState),
      on('game-state', (s) => {
        setGameState(s);
        if (s.state === 'preparing') setLogs([]);
        if (s.state === 'stopped') refreshPack();
      }),
      on('game-log', (lines) => setLogs((l) => { const n = l.concat(lines); return n.length > 1500 ? n.slice(-1200) : n; })),
      on('update-state', setUpdate)
    ];
    const timer = setInterval(refreshPack, 10 * 60e3);
    return () => { offs.forEach((f) => f()); clearInterval(timer); };
  }, [refreshSettings, refreshAccounts, refreshPack]);

  // «Проверить обновления»: и лаунчер, и сборка
  const [checking, setChecking] = useState(false);
  const checkUpdates = useCallback(async () => {
    setChecking(true);
    const tr = (s, v) => translate(lang, s, v);
    try {
      let l = null;
      try { l = await call('app:checkUpdates'); } catch (e) { toast(tr('Лаунчер: не удалось проверить') + ' — ' + e.message, 'error', 7000); }
      if (l) {
        if (l.state === 'latest') toast(tr('Лаунчер: последняя версия') + ' ' + l.version, 'ok');
        else if (l.state === 'downloading') toast(tr('Лаунчер: качаю версию') + ' ' + l.version + ' — ' + tr('потом появится кнопка «Перезапустить»'), 'info', 7000);
        else if (l.state === 'ready') { toast(tr('Лаунчер: версия') + ' ' + l.version + ' ' + tr('готова — нажми «Перезапустить» сверху'), 'info', 7000); setUpdate({ state: 'ready', version: l.version }); }
        else if (l.state === 'manual') { toast(tr('Лаунчер: вышла версия') + ' ' + l.version + ' — ' + tr('скачай её по кнопке сверху'), 'info', 7000); setUpdate(l); }
      }
      let p = null;
      try { p = await call('pack:info'); setPack(p); } catch (e) { toast(tr('Сборка: не удалось проверить') + ' — ' + e.message, 'error', 7000); }
      if (p) {
        if (p.error) toast(tr('Сборка: нет связи с GitHub') + ' — ' + p.error, 'error', 7000);
        else if (p.authorHome) toast(tr('Сборка: это папка автора — обновляется заливкой'), 'info');
        else if (p.latest && (!p.state || p.state.version !== p.latest.version)) toast(tr('Сборка: есть обновление') + ' #' + p.latest.version + ' — ' + tr('нажми «Обновить и играть»'), 'info', 7000);
        else if (p.latest) toast(tr('Сборка: последняя версия') + ' #' + p.latest.version, 'ok');
      }
    } finally { setChecking(false); }
  }, [lang, toast]);

  const account = useMemo(() => accounts.accounts.find((a) => a.id === accounts.selected) || null, [accounts]);

  const value = {
    settings, saveSettings, refreshSettings, info,
    accounts: accounts.accounts, account, refreshAccounts,
    pack, refreshPack,
    progress, gameState, logs, busyState,
    toasts, toast,
    update, checkUpdates, checking,
    lang, t
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
