import React from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/ui.jsx';

const BOOSTY = 'https://boosty.to/ivan_kokk';

export default function Donate({ onClose }) {
  const { t } = useApp();
  return (
    <Modal title={t('Поддержать автора')} onClose={onClose}>
      <div className="donate">
        <div className="donate-hero">
          <div className="donate-gem"><Icon name="emerald" size={48} /></div>
          <div>
            <h3>Kokk · Boosty</h3>
            <p className="muted">{t('Все моды сборки — VillagersKokk, NightNight, Seasons, StrongMobs, Quality, Storage, KokkHUD — Кокк пишет сам. Поддержка помогает выпускать обновления чаще и делать жителей ещё умнее.')}</p>
          </div>
        </div>
        <ul className="donate-list">
          <li><Icon name="check" size={12} /> {t('Разовый донат или подписка — как удобно')}</li>
          <li><Icon name="check" size={12} /> {t('Оплата картами РФ и другими способами на стороне Boosty')}</li>
          <li><Icon name="check" size={12} /> {t('Лаунчер не видит и не хранит платёжные данные')}</li>
        </ul>
        <button className="btn primary big" onClick={() => call('shell:open', BOOSTY)}><Icon name="heart" /> {t('Открыть Boosty')}</button>
        <small className="muted">boosty.to/ivan_kokk</small>
      </div>
    </Modal>
  );
}
