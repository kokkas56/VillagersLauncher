import React from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from './Icon.jsx';

// Приглашения в отряд и «Принять и запустить игру» — поверх любой вкладки (появляются, только когда есть что принять).
export default function FriendNotices({ fs, onOpen }) {
  const { t, toast } = useApp();
  if (!fs) return null;
  const invites = fs.invites || [];
  const pr = fs.prompt;
  if (!invites.length && !pr) return null;
  const act = async (ch, arg) => { try { await call(ch, arg); } catch (e) { toast(e.message, 'error', 6000); } };
  return (
    <div className="fr-notices">
      {pr && (
        <div className="fr-notice launch">
          <Icon name="rocket" />
          <div className="grow"><b>{pr.text}</b><small>{pr.kind === 'rejoin' ? t('Игра запустится сразу на сервер отряда') : t('Игра запустится и сразу зайдёт к лидеру')}</small></div>
          <button className="btn sm primary" onClick={() => act('friends:launch')}><Icon name="play" size={12} /> {pr.kind === 'rejoin' ? t('Вернуться к отряду') : t('Принять и запустить игру')}</button>
          <button className="btn sm ghost icon-btn" title={t('Позже')} onClick={() => act('friends:dismiss')}><Icon name="close" size={10} /></button>
        </div>
      )}
      {invites.map((i) => (
        <div key={i.id} className="fr-notice">
          <Icon name="friends" />
          <div className="grow"><b>{i.from} {t('зовёт в отряд')}</b><small>{t('Лидер')}: {i.leader} · {t('в отряде')} {i.size}</small></div>
          <button className="btn sm primary" onClick={() => { act('friends:acceptInvite', i.id); onOpen && onOpen(); }}>{t('Принять')}</button>
          <button className="btn sm ghost" onClick={() => act('friends:declineInvite', i.id)}>{t('Отклонить')}</button>
        </div>
      ))}
    </div>
  );
}
