// Вкладка «Старт» окна «Студия Кокка» (фаза 5): открытый проект и его мир, связь с игрой с точной причиной,
// порядок работы как в Hammer (мир → сущности → выходы → F5), обучение, сюжетный режим Kokk Story.
import React from 'react';
import { call } from '../../lib/api.js';
import { useApp } from '../../lib/app.jsx';
import { useStudio } from './core.jsx';
import I from './icons.jsx';
import { fmtWhen } from './Projects.jsx';

export default function StartTab({ setLayout, openDock, build, openLearn, newProject, openProjectWorld, playtest }) {
  const core = useStudio();
  const { busyState } = useApp();
  const { hp, toast, link, boot, setBoot, project } = core;
  const b = boot || {};
  const w = b.world || null; // мир проекта из saves
  const gs = (core.gameState && core.gameState.state) || 'idle';
  const running = ['preparing', 'starting', 'running'].includes(gs) || link.connected;
  const busy = busyState && busyState.busy && !running;
  const wm = core.worldMatch;
  const setDev = async (on) => {
    try { const d = await call('studio:devMode', on); setBoot({ ...b, dev: d }); toast(d ? 'Режим разработчика включён' + (running ? ' — перезапусти игру (новый мод подхватит сам)' : '') : 'Режим разработчика выключен', 'ok'); } catch (e) { toast(e.message, 'error'); }
  };
  const counts = [
    ['world', 'world', 'Сущности', core.ents.length, 'Сущности мира: старт игрока, зоны, актёры, кнопки… «Объекты» → «Мир».'],
    ['scene', 'film', 'Сцены', core.list.length, 'Катсцены: камеры, актёры, небо, свет.'],
    ['dialogs', 'dialog', 'Диалоги', core.dialogs.length, 'Разговоры с жителями.'],
    ['quests', 'quest', 'Задания', core.quests.length, 'Задания по шагам и награды.'],
    ['schemes', 'scheme', 'Схемы', core.schemes.length, 'Сложная логика узлами.'],
    ['lib', 'structure', 'Постройки', core.structures.length, 'Библиотека построек.']
  ];
  const goCount = (id) => (id === 'lib' ? openDock('lib') : id === 'world' ? setLayout('scene') : setLayout(id));
  const steps = [
    ['Мир', 'Проект открыт — пусть игра откроет его мир', !!(link.connected && wm && wm.match !== false), 'link'],
    ['Старт игрока', 'Поставь «Старт игрока» (кнопка слева в макете «Сцена»)', core.ents.some((e) => e.type === 'player_start'), 'ent-player_start'],
    ['Сущности', 'Зоны, актёры, кнопки, таймеры — в точку под прицелом', core.ents.length > 1, 'ent-trigger_zone'],
    ['Выходы', '«Выходы» сущностей: «Вошёл → сцена → Запустить»', core.ents.some((e) => (e.outputs || []).length), 'outputs-tab'],
    ['F5', '▶ Играть — проверка как у игрока, «Стоп» откатит мир', false, 'play']
  ];
  return (
    <div className="c4-start">
      <div className="c4-start-in">
        <div className="c4-start-head">
          <div>
            <h2>{project.name || 'Проект'}</h2>
            <p>Камеры и ключи на таймлайне, логика «Выходами»: у проекта свой мир, в нём сущности с «Выходами», катсцены и схемы. F5 — играть, F5 ещё раз — мир откатится. Наводи мышку — внизу подсказка, F1 — статья Справочника.</p>
          </div>
          <button className="c4-btn big prim" data-learn="start-learn" onClick={openLearn} {...hp('«Обучение»: уроки с подсветкой кнопок — первая сцена за 5 минут, камера, логика, диалоги, небо, строительство, сборка.')}><I name="tutor" size={16} /> Обучение</button>
        </div>
        <div className="c4-start-grid">
          <div className="c4-start-col">
            <section className="c4-sc c4-sc-world" data-learn="start-world">
              <h3><I name="world" size={16} />Мир проекта</h3>
              <div className="c4-pworld">
                {w && w.icon ? <img src={w.icon} alt="" /> : <span className="noimg"><I name="world" size={28} /></span>}
                <div>
                  <b>{w ? w.name : project.world ? project.world + ' (нет в saves!)' : 'без своего мира'}</b>
                  <small>{project.world ? 'saves/' + project.world : 'Проект работает в любом мире'}{w ? ' · заходили ' + fmtWhen(w.lastPlayed) : ''}</small>
                  <small className={wm && wm.match === false ? 'warn' : ''}>{!link.connected ? 'игра не на связи' : wm && wm.match === false ? 'игра сейчас в другом мире' : 'игра в мире проекта'}</small>
                </div>
              </div>
              <div className="c4-row">
                {project.world && <button className="c4-btn prim" disabled={busy || (link.connected && wm && wm.match !== false)} onClick={openProjectWorld} {...hp('Игра откроет мир проекта (если игра закрыта — лаунчер запустит её сразу в нём, режим разработчика включится сам).')}><I name="play" size={12} /> {link.connected ? 'Открыть мир проекта' : 'Запустить игру в мире проекта'}</button>}
                <button className="c4-btn" disabled={!link.connected} onClick={() => { setLayout('scene'); playtest('start'); }} {...hp('▶ Играть (F5) от «Старта игрока».')}><I name="play" size={12} /> Играть (F5)</button>
                <button className="c4-btn" onClick={() => call('shell:openPath', 'studio/projects/' + (core.projectId || ''))} {...hp('Папка проекта: project.json, entities.json, scenes/, dialogs/…')}><I name="folder" size={12} /> Папка</button>
              </div>
            </section>
            <section className="c4-sc">
              <h3><I name="info" size={16} />Порядок работы</h3>
              <ol className="c4-flow">
                {steps.map(([t, h, ok, lk], i) => <li key={i} className={ok ? 'ok' : ''} data-learn={'flow-' + lk}><b>{t}</b><span>{h}</span>{ok ? <I name="check" size={13} color="#7fd36b" /> : null}</li>)}
              </ol>
              <p className="dim small">Простое — «Выходами» сущностей, сложное — «Схемами» (выходы внутри тоже становятся схемой). Диалоги и задания — свои вкладки.</p>
            </section>
          </div>
          <div className="c4-start-col">
            <section className="c4-sc">
              <h3><I name="project" size={16} />Проект</h3>
              <div className="c4-counts">
                {counts.map(([id, ic, l, n, h]) => (
                  <button key={id} className="c4-count" onClick={() => goCount(id)} {...hp(l + ': ' + n + '. ' + h + ' Щёлкни — перейти.')}><I name={ic} size={15} /><b>{n}</b><span>{l}</span></button>
                ))}
              </div>
              <ul className="c4-facts">
                <li><b>Сохранять не нужно</b> — всё пишется само; Ctrl+S — записать прямо сейчас.</li>
                <li>Загружен <b>только этот проект</b>: в игре работают только его сцены и логика.</li>
                <li>«Собрать» кладёт проект в <span className="mono">config/kokkstory/studio/{core.projectId}/</span> — он уйдёт игрокам с публикацией пака.</li>
              </ul>
              <div className="c4-row">
                <button className="c4-btn prim" onClick={build} {...hp('Проверить всё и собрать проект для игроков.')}><I name="build" size={13} /> Собрать проект</button>
                <button className="c4-btn" onClick={newProject} {...hp('Новый проект со своим миром.')}><I name="plus" size={12} /> Новый проект</button>
              </div>
            </section>
            <section className="c4-sc">
              <h3><I name="link" size={16} />Связь с игрой</h3>
              <div className="c4-stat">
                <span><span className={'c4-led ' + (link.connected ? 'on' : running ? 'off' : 'bad')} />{link.connected ? 'Игра на связи' + (link.info && link.info.world ? ' · ' + link.info.world : '') : 'Нет связи'}</span>
                <span {...hp('Файл studio/.dev: игра (только у тебя) читает открытый проект прямо из папки и держит связь со Студией.')}><span className={'c4-led ' + (b.dev ? 'on' : 'bad')} />{b.dev ? 'Режим разработчика включён' : 'Режим разработчика выключен'}</span>
              </div>
              {!link.connected && <p className="c4-linkwhy">{link.text || 'Ищу игру…'}</p>}
              <div className="c4-row">
                <button className="c4-btn" onClick={() => call('studio:reconnect').catch((e) => toast(e.message, 'error'))} {...hp('Сразу попробовать подключиться снова.')}><I name="reconnect" size={12} /> Переподключить</button>
                <button className="c4-btn" onClick={() => setDev(!b.dev)}>{b.dev ? 'Выключить режим разработчика' : 'Включить режим разработчика'}</button>
                <button className="c4-btn" disabled={!link.connected} onClick={() => call('studio:reload').then(() => toast('Игра перечитывает проект', 'ok')).catch((e) => toast(e.message, 'error'))}><I name="loop" size={12} /> Перечитать в игре</button>
              </div>
              <p className="dim small">Все попытки связи — во вкладке «Журнал» справа (в макете «Сцена»).</p>
            </section>
            <section className="c4-sc">
              <h3><I name="film" size={16} />Сюжетный режим Kokk Story</h3>
              <p className="dim">Кампания «Свет в долине» позже станет отдельным проектом Студии (мир «любой»). Пока она работает из кода мода и проекты её не трогают.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
