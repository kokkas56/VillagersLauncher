import React, { useEffect, useState } from 'react';
import { call } from '../lib/api.js';

// Запасной путь через Radmin VPN: лаунчер сам замечает установленный Radmin и использует его, если напрямую не вышло.
export default function RadminInfo({ t }) {
  const [rm, setRm] = useState(null);
  useEffect(() => {
    const load = () => call('radmin:status').then(setRm).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);
  if (!rm) return null;
  return (
    <div className="radmin-info small">
      <span className={'dot ' + (rm.found ? 'on' : 'off')} />
      {rm.found
        ? <span>{t('Radmin VPN найден')} · <b className="mono">{rm.ip}</b> — {t('если напрямую не соединится, лаунчер сам зайдёт через него')}</span>
        : <span className="muted">{t('Radmin VPN не нужен: лаунчер соединяет сам. Он пригодится, только если у обоих очень строгий интернет —')} <a href="#" onClick={(e) => { e.preventDefault(); call('shell:open', 'https://www.radmin-vpn.com/ru/'); }}>radmin-vpn.com</a></span>}
    </div>
  );
}
