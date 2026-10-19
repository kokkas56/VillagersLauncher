import { call, on } from './api.js';

// Войти на сервер игрока по ключу: туннель до хозяина → дождаться соединения → игра заходит на 127.0.0.1.
// onStep(text) — для подписи на кнопке. Ошибка — с понятным текстом (в т.ч. подсказка про Radmin, если она есть в ключе).
export async function joinByKey(key, password, onStep = () => {}) {
  onStep('Ищу сервер…');
  const r = await call('hosting:join', { key, password });
  const st = await new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); off(); fn(v); };
    const off = on('tunnel-state', (s) => {
      if (!s || !s.active) return;
      if (s.status === 'found' || s.status === 'connecting') onStep('Соединяюсь…');
      if (s.status === 'connected') finish(resolve, s);
    });
    const timer = setTimeout(() => {
      call('hosting:leave').catch(() => {});
      const why = 'Не получилось соединиться: сервер сейчас не в сети, пароль неверный или у обоих очень строгий интернет.';
      finish(reject, new Error(r.radmin ? why + ` Запасной путь: Radmin VPN, адрес хозяина ${r.radmin}.` : why));
    }, 35000);
  });
  onStep('Запускаю игру…');
  await call('game:play', { quickPlay: '127.0.0.1:' + st.port });
  return st;
}
