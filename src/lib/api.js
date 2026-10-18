// Мост к главному процессу. В браузере (vite dev без Electron) — заглушки.
const vl = typeof window !== 'undefined' ? window.vl : null;

export const hasBridge = !!vl;

export function call(channel, ...args) {
  if (!vl) return Promise.reject(new Error('Нет связи с лаунчером (' + channel + ')'));
  return vl.call(channel, ...args);
}

export function on(event, cb) {
  if (!vl) return () => {};
  return vl.on(event, cb);
}

export const win = vl ? vl.win : { minimize() {}, maximize() {}, close() {} };

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
}

export function fmtDate(d, lang = 'ru') {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(ms, lang = 'ru') {
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  return lang === 'en' ? `${h}h ${m}m` : `${h} ч ${m} мин`;
}
