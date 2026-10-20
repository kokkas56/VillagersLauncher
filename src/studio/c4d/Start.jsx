// Вкладка «Старт» окна «Студия Кокка»: что такое проект, в каком мире тестировать, связь с игрой,
// как устроена Студия по шагам и как с ней связан сюжетный режим Kokk Story. Для автора-непрограммиста.
import React, { useCallback, useEffect, useState } from 'react';
import { call } from '../../lib/api.js';
import { useApp } from '../../lib/app.jsx';
import { useStudio } from './core.jsx';
import I from './icons.jsx';

const MODE_RU = { survival: 'Выживание', creative: 'Творческий', adventure: 'Приключение', spectator: 'Наблюдатель' };

function fmtPlayed(ms) {
  if (!ms) return 'ещё не заходили';
  const d = new Date(ms);
  const now = new Date();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return 'сегодня в ' + hm;
  if (diff === 1) return 'вчера в ' + hm;
  if (diff > 1 && diff < 7) return diff + ' дн. назад';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export default function StartTab({ setLayout, openDock, build }) {
  const core = useStudio();
  const { busyState } = useApp();
  const { hp, toast, link, boot, setBoot } = core;
  const b = boot || {};
  const [worlds, setWorlds] = useState(null); // null — ещё грузим
  const [savesDir, setSavesDir] = useState('');
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);

  const loadWorlds = useCallback(async (quiet) => {
    setLoading(true);
    try {
      const r = (await call('studio:worlds')) || {};
      const l = Array.isArray(r.worlds) ? r.worlds : [];
      setWorlds(l); setSavesDir(r.saves || '');
      setPicked((cur) => {
        const want = cur || r.selected;
        return l.some((w) => w.folder === want) ? want : (l[0] && l[0].folder) || null;
      });
      if (!quiet) toast('Список миров обновлён: ' + l.length, 'ok', 1800);
    } catch (e) { setWorlds([]); toast('Миры не прочитались: ' + e.message, 'error', 7000); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { loadWorlds(true); call('game:status').then((s) => setGameRunning(!!(s && s.running))).catch(() => {}); }, []); // eslint-disable-line

  const gs = (core.gameState && core.gameState.state) || 'idle';
  const running = ['preparing', 'starting', 'running'].includes(gs) || (gs === 'idle' && (gameRunning || !!(core.embed.game && core.embed.game.running))) || link.connected;
  const busy = busyState && busyState.busy && !running;
  const world = (worlds || []).find((w) => w.folder === picked) || null;

  const pick = (folder) => { setPicked(folder); call('studio:setWorld', folder).catch(() => {}); };
  const setDev = async (on) => {
    try { const d = await call('studio:devMode', on); setBoot({ ...b, dev: d }); toast(d ? 'Режим разработчика включён' + (running ? ' — перезапусти игру' : '') : 'Режим разработчика выключен', 'ok'); return d; } catch (e) { toast(e.message, 'error'); return b.dev; }
  };
  const launch = async () => {
    if (!world || running || launching) return;
    setLaunching(true);
    try {
      if (!b.dev) { const d = await call('studio:devMode', true); setBoot({ ...b, dev: d }); }
      await call('studio:setWorld', world.folder).catch(() => {});
      await core.flush();
      toast('Запускаю игру в мире «' + world.name + '»… Связь со Студией появится сама, когда мир загрузится.', 'ok', 6000);
      await call('game:play', { quickPlayWorld: world.folder });
      setGameRunning(true);
    } catch (e) { toast(e.message, 'error', 9000); }
    setLaunching(false);
  };

  const counts = [
    ['scene', 'film', 'Сцены', core.list.length, 'Катсцены: камеры, актёры, свет. Открывается макет «Сцена».'],
    ['dialogs', 'dialog', 'Диалоги', core.dialogs.length, 'Разговоры с жителями: реплики, выборы игрока, условия.'],
    ['quests', 'quest', 'Задания', core.quests.length, 'Задания по шагам и награды.'],
    ['schemes', 'scheme', 'Схемы', core.schemes.length, 'Логика мира: «событие → условие → действие».'],
    ['lib', 'structure', 'Постройки', core.structures.length, 'Библиотека построек: «Строительство» → «Постройки».'],
    ['vars', 'vars', 'Переменные', (core.project.vars || []).length, 'Память сюжета: что игрок уже сделал.']
  ];
  const goCount = (id) => (id === 'lib' ? openDock('lib') : setLayout(id));

  // что делать дальше — по состоянию связи
  const steps = link.connected
    ? [['ok', 'Всё готово: игра слышит Студию. Правки сцен, диалогов и заданий игра подхватывает сама.'], ['', 'Открой «Сцена» и нажми «В игре», чтобы посмотреть катсцену, или поговори с жителем, чтобы проверить диалог.']]
    : running
      ? [[b.dev ? '' : 'warn', b.dev ? 'Игра запускается или ещё в меню. Связь появится через пару секунд после входа в мир.' : 'Игра запущена без режима разработчика — Студию она не слышит.'], [b.dev ? '' : 'warn', b.dev ? 'Если вошёл в мир, а связи нет — режим включили уже после запуска: закрой игру и запусти снова.' : 'Включи режим ниже, закрой игру и запусти её снова кнопкой «Запустить игру в этом мире».']]
      : [[b.dev ? 'ok' : '', b.dev ? 'Режим разработчика включён.' : 'Режим разработчика выключен — кнопка запуска включит его сама.'], ['', 'Выбери мир слева и нажми «Запустить игру в этом мире». Больше ничего настраивать не нужно.']];

  return (
    <div className="c4-start">
      <div className="c4-start-in">
        <div className="c4-start-head">
          <div>
            <h2>С чего начать</h2>
            <p>Студия — твой редактор сюжета. Здесь видно, где лежит проект, в каком мире его проверять и как всё связано с сюжетным режимом. Наводи мышку на кнопки — внизу окна появится подсказка.</p>
          </div>
        </div>

        <div className="c4-start-grid">
          <div className="c4-start-col">
            {/* ---------- тестовый мир ---------- */}
            <section className="c4-sc c4-sc-world">
              <h3><I name="world" size={16} />Тестовый мир<span className="grow" />
                <button className="c4-btn sm" disabled={loading} onClick={() => loadWorlds(false)} {...hp('Перечитать папку saves: появится мир, который ты только что создал в игре.')}><I name="loop" size={12} /> Обновить список</button>
              </h3>
              <p className="c4-sc-lead">Проверять сюжет можно в <b>любом</b> одиночном мире со сборкой — особый мир не нужен. Выбери, в каком удобнее, и Студия запустит игру сразу в нём.</p>
              {worlds === null ? <div className="c4-sc-empty">Читаю миры…</div> : !worlds.length ? (
                <div className="c4-sc-empty">
                  <b>Миров пока нет.</b>
                  <span>Один раз создай мир в самой игре: запусти игру → «Одиночная игра» → «Создать мир» (удобно «Творческий»), зайди в него и выйди. Потом нажми «Обновить список».</span>
                  {savesDir && <span className="mono dim" style={{ fontSize: 11 }}>{savesDir}</span>}
                  <div><button className="c4-btn prim" disabled={running || busy} onClick={() => call('game:play', {}).catch((e) => toast(e.message, 'error', 8000))} {...hp('Запустить игру в главное меню, чтобы создать мир.')}><I name="play" size={12} /> Запустить игру</button></div>
                </div>
              ) : (
                <div className="c4-worlds">
                  {worlds.map((w) => (
                    <button key={w.folder} className={'c4-wrow' + (w.folder === picked ? ' on' : '')} onClick={() => pick(w.folder)} onDoubleClick={() => { pick(w.folder); }} {...hp('Мир «' + w.name + '» (папка saves/' + w.folder + '). Щёлкни — выбрать для проверки; Студия запомнит выбор.')}>
                      {w.icon ? <img src={w.icon} alt="" /> : <span className="noimg"><I name="world" size={22} /></span>}
                      <span className="t">
                        <b>{w.name}</b>
                        <small>{fmtPlayed(w.lastPlayed)}{w.mode ? ' · ' + (MODE_RU[w.mode] || w.mode) : ''}{w.name !== w.folder ? ' · ' + w.folder : ''}</small>
                      </span>
                      {w.folder === picked && <I name="check" size={15} color="#8f9cff" />}
                    </button>
                  ))}
                </div>
              )}
              {!!(worlds && worlds.length) && (running ? (
                <div className="c4-sc-note">
                  <I name="info" size={15} />
                  <span>{link.connected ? 'Игра уже запущена' + (link.info && link.info.world ? ' в мире «' + link.info.world + '»' : '') + '.' : 'Игра уже запускается.'} Чтобы перейти в другой мир — в игре нажми Esc → «Сохранить и выйти» и зайди в нужный мир, или закрой игру и нажми кнопку здесь снова.</span>
                </div>
              ) : (
                <button className="c4-btn big prim c4-launch" disabled={!world || launching || busy} onClick={launch} {...hp(world ? 'Запустить Minecraft сразу в мире «' + world.name + '». Режим разработчика включится сам — игра будет на связи со Студией.' : 'Сначала выбери мир.')}>
                  <I name="play" size={18} /> {launching ? 'Запускаю…' : busy ? 'Лаунчер занят…' : 'Запустить игру в этом мире'}
                </button>
              ))}
            </section>

            {/* ---------- как устроено ---------- */}
            <section className="c4-sc">
              <h3><I name="info" size={16} />Как это устроено</h3>
              <ol className="c4-how">
                <li><b>Выбери мир и запусти игру</b> кнопкой «Запустить игру в этом мире». Подходит любой мир со сборкой — особый режим выбирать не надо.</li>
                <li><b>Диалоги</b> — начни с них: напиши разговор с жителем, выйди в игру и поговори с ним. <a onClick={() => setLayout('dialogs')} {...hp('Перейти к диалогам.')}>Открыть</a></li>
                <li><b>Переменные</b> — память сюжета («познакомился с Мироном», «отдал хлеб»). Диалоги и задания их ставят и проверяют. <a onClick={() => setLayout('vars')} {...hp('Перейти к переменным.')}>Открыть</a></li>
                <li><b>Задания</b> — шаги и награды. Их начинает диалог или сцена. <a onClick={() => setLayout('quests')} {...hp('Перейти к заданиям.')}>Открыть</a></li>
                <li><b>Сцена</b> — катсцены: камера, актёры, свет, ключи на таймлайне. «В игре» проигрывает сцену как увидит игрок. <a onClick={() => setLayout('scene')} {...hp('Перейти к сценам.')}>Открыть</a></li>
                <li><b>Строительство</b> — постройки: рамка, кисть, библиотека, 3D-модели в блоки. <a onClick={() => setLayout('build')} {...hp('Перейти к строительству.')}>Открыть</a></li>
                <li><b>Схемы</b> — когда что происходит в мире: «ночью → если игрок рядом → набег». Последний шаг: «Собрать для игроков». <a onClick={() => setLayout('schemes')} {...hp('Перейти к схемам.')}>Открыть</a></li>
              </ol>
            </section>

          </div>
          <div className="c4-start-col">
            {/* ---------- проект ---------- */}
            <section className="c4-sc">
              <h3><I name="folder" size={16} />Проект</h3>
              <div className="c4-path">
                <span className="mono" {...hp('Папка проекта: здесь лежат все твои сцены, диалоги, задания, схемы и постройки обычными файлами.')}>{b.dir || '…/studio'}</span>
                <button className="c4-btn sm" onClick={() => call('shell:openPath', 'studio').catch((e) => toast(e.message, 'error'))} {...hp('Открыть папку проекта в Проводнике.')}><I name="folder" size={12} /> Открыть папку</button>
              </div>
              <div className="c4-counts">
                {counts.map(([id, ic, l, n, h]) => (
                  <button key={id} className="c4-count" onClick={() => goCount(id)} {...hp(l + ': ' + n + '. ' + h + ' Щёлкни — перейти.')}>
                    <I name={ic} size={15} /><b>{n}</b><span>{l}</span>
                  </button>
                ))}
              </div>
              <ul className="c4-facts">
                <li><b>Сохранять не нужно</b> — всё сохраняется само через секунду после правки.</li>
                <li><b>Компилировать не нужно</b> — проект это обычные файлы в папке игры <span className="mono">studio</span>.</li>
                <li>Пока включён <b>режим разработчика</b>, игра читает твои правки сразу, вживую.</li>
                <li>Без «Собрать» всё остаётся <b>только на этом компьютере</b>. «Собрать» проверяет проект и копирует готовое в <span className="mono">config/kokkstory/studio</span> — оттуда оно уйдёт игрокам со следующей публикацией сборки.</li>
              </ul>
              <div><button className="c4-btn prim" onClick={build} {...hp('Проверить всё и положить готовые сцены, диалоги, задания, схемы и постройки в config/kokkstory/studio для игроков. С ошибками ничего не записывается.')}><I name="build" size={13} /> Собрать для игроков</button></div>
            </section>

            {/* ---------- связь с игрой ---------- */}
            <section className="c4-sc">
              <h3><I name="link" size={16} />Связь с игрой</h3>
              <div className="c4-stat">
                <span {...hp(link.connected ? 'Студия и игра слышат друг друга.' : 'Студия ищет игру каждые 3 секунды.')}><span className={'c4-led ' + (link.connected ? 'on' : running ? 'off' : 'bad')} />{link.connected ? 'Игра на связи' + (link.info && link.info.world ? ' · ' + link.info.world : '') : running ? 'Игра запущена, связи пока нет' : 'Игра не запущена'}</span>
                <span {...hp('Режим разработчика — файл studio/.dev. С ним игра (только у тебя) читает проект прямо из папки и держит связь со Студией. Включается сам при запуске мира отсюда.')}><span className={'c4-led ' + (b.dev ? 'on' : 'bad')} />{b.dev ? 'Режим разработчика включён' : 'Режим разработчика выключен'}</span>
              </div>
              <ol className="c4-next">{steps.map(([k, t], i) => <li key={i} className={k}>{t}</li>)}</ol>
              <div className="c4-row">
                <button className="c4-btn" onClick={() => setDev(!b.dev)} {...hp(b.dev ? 'Выключить режим разработчика: игра перестанет читать проект напрямую и слушать Студию (после перезапуска).' : 'Включить режим разработчика. Если игра уже запущена — её нужно перезапустить.')}>{b.dev ? 'Выключить режим разработчика' : 'Включить режим разработчика'}</button>
                <button className="c4-btn" disabled={!link.connected} onClick={() => call('studio:reload').then(() => toast('Игра перечитывает проект', 'ok')).catch((e) => toast(e.message, 'error'))} {...hp('Попросить игру перечитать весь проект с диска (обычно не нужно — правки приходят сами).')}><I name="loop" size={12} /> Перечитать в игре</button>
              </div>
            </section>

            {/* ---------- Kokk Story ---------- */}
            <section className="c4-sc">
              <h3><I name="film" size={16} />Сюжетный режим Kokk Story</h3>
              <div className="c4-story">
                <div>
                  <p>Встроенная кампания («Свет в долине») сейчас переносится в Студию <b>по главам</b>. Перенесённая глава появляется здесь обычными файлами, которые можно править, — их имена начинаются с главы (например, <span className="mono">ch1_…</span>).</p>
                  <p>Пока глава не перенесена, она работает по-старому, из кода мода, и в Студии её не видно.</p>
                </div>
                <div {...hp('Файл config/kokkstory-common.toml в папке игры, раздел [story]. Значение "code" — старая глава из мода, "studio" — твоя версия из Студии.')}>
                  <p>Какую версию главы играть, решает настройка в <span className="mono">config/kokkstory-common.toml</span>:</p>
                  <pre className="c4-code">{'[story]\nsource_ch1 = "code"    # старая глава из мода\nsource_ch2 = "studio"  # твоя версия из Студии'}</pre>
                  <p className="dim">По умолчанию везде <span className="mono">"code"</span> — поэтому старые миры игроков продолжают работать как раньше.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
