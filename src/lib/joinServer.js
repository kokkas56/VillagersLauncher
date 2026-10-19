import { call, on } from './api.js';

// Войти на сервер игрока по ключу: туннель до хозяина → дождаться соединения → игра заходит на 127.0.0.1.
// onStep(text) — для подписи на кнопке. Ошибка — с понятным текстом (в т.ч. подсказка про Radmin, если она есть в ключе).
export async function joinByKey(key, password, onStep = () => {}) {
  onStep('Ищу сервер…');
  const r = await call('hosting:join', { key, password });
  let st;
  try {
  st = await new Promise((resolve, reject) => {
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
      finish(reject, new Error(r.radmin ? why + ` Запасной путь: Radmin VPN — зайдите с хозяином в одну сеть Radmin, лаунчер сам попробует адрес ${r.radmin}.` : why));
    }, 35000);
  });
  } catch (err) {
    // напрямую не вышло — если у обоих стоит Radmin VPN, заходим через него (сам Radmin лаунчер не трогает)
    if (r.radmin) {
      const rm = await call('radmin:status').catch(() => null);
      if (rm && rm.found) {
        onStep('Пробую через Radmin VPN…');
        const ping = await call('servers:ping', r.radmin).catch(() => null);
        if (ping && ping.online) {
          onStep('Запускаю игру…');
          await call('game:play', { quickPlay: r.radmin });
          return { radmin: true };
        }
        throw new Error('Напрямую не вышло, и через Radmin сервер не отвечает. Проверь, что вы с хозяином в одной сети Radmin VPN (адрес хозяина ' + r.radmin + ').');
      }
    }
    throw err;
  }
  onStep('Запускаю игру…');
  await call('game:play', { quickPlay: '127.0.0.1:' + st.port });
  return st;
}
