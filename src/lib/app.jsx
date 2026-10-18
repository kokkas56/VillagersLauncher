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

  const account = useMemo(() => accounts.accounts.find((a) => a.id === accounts.selected) || null, [accounts]);

  const value = {
    settings, saveSettings, refreshSettings, info,
    accounts: accounts.accounts, account, refreshAccounts,
    pack, refreshPack,
    progress, gameState, logs, busyState,
    toasts, toast,
    update,
    lang, t
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
