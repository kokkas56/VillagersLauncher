// Состояние «Друзей» из главного процесса (electron/friends.cjs): друзья, заявки, отряд, приглашения, уведомления.
import { useEffect, useState } from 'react';
import { call, on } from './api.js';

export function useFriends() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    call('friends:state').then((s) => alive && s && setSt(s)).catch(() => {});
    const off = on('friends', (s) => s && setSt(s));
    return () => { alive = false; off(); };
  }, []);
  return st;
}

export const STATUS_TEXT = { ingame: 'В игре', online: 'В сети', offline: 'Не в сети' };
export const MEMBER_TEXT = {
  lobby: 'в лобби', away: 'игра не запущена', offline: 'пропал', starting: 'запускает игру', loading: 'загружается',
  ready: 'готов', world: 'в мире', crashed: 'игра вылетела'
};

export function ago(t) {
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
  return Math.floor(s / 86400) + ' дн назад';
}
