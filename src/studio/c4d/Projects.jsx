// Проекты (фаза 5, как карты в Hammer): выбор проекта при старте, «Новый проект», «Открыть проект», «Свойства проекта».
// Проект = свой мир + свои сцены, диалоги, задания, схемы, постройки и сущности. Загружен только открытый.
import React, { useEffect, useState } from 'react';
import { call } from '../../lib/api.js';
import { useStudio } from './core.jsx';
import I from './icons.jsx';

const MODE_RU = { survival: 'Выживание', creative: 'Творческий', adventure: 'Приключение', spectator: 'Наблюдатель' };
export function fmtWhen(ms) {
  if (!ms) return '—';
  const d = new Date(ms), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return 'сегодня в ' + hm;
  if (diff === 1) return 'вчера в ' + hm;
  if (diff > 1 && diff < 7) return diff + ' дн. назад';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export async function openProject(core, id) {
  try {
    await core.flush();
    const r = await call('studio:projectOpen', id);
    // окно перечитается само по событию studio-win {type:'project'}
    if (r && r.match === false) core.toast('Игра сейчас в другом мире — «Открыть мир проекта» перенесёт её', 'warn', 6000);
  } catch (e) { core.toast(e.message, 'error', 7000); }
}

function ProjectCard({ p, onOpen, current, hp }) {
  const c = p.counts || {};
  return (
    <button className={'c4-pcard' + (current ? ' cur' : '')} data-learn={'project-' + p.id} onClick={onOpen} {...hp('Проект «' + p.name + '»' + (p.world ? ', мир saves/' + p.world : ', без своего мира') + '. Щёлкни — открыть.' + (p.note ? ' ' + p.note : ''))}>
      <span className="thumb">{p.icon ? <img src={p.icon} alt="" /> : <I name={p.id === 'examples' ? 'tutor' : 'world'} size={30} color="#6b7280" />}</span>
      <span className="body">
        <b>{p.name}{current ? <em> · открыт</em> : null}</b>
        <small>{p.world ? (p.worldMissing ? '⚠ мира «' + p.world + '» нет в saves' : 'мир: ' + (p.worldName || p.world)) : 'без своего мира'}</small>
        <small className="dim">сцен {c.scenes || 0} · диалогов {c.dialogs || 0} · заданий {c.quests || 0} · сущностей {c.entities || 0}</small>
        <small className="dim">изменён {fmtWhen(p.mtime)}</small>
      </span>
    </button>
  );
}

// экран без открытого проекта (как стартовое окно C4D / Hammer)
export function ProjectPicker({ onNew, onLearn }) {
  const core = useStudio();
  const { hp } = core;
  const b = core.boot || {};
  const list = b.projects || [];
  const recent = (b.recent || []).map((id) => list.find((p) => p.id === id)).filter(Boolean);
  const others = list.filter((p) => !recent.includes(p));
  return (
    <div className="c4-picker">
      <div className="c4-picker-in">
        <div className="c4-picker-head">
          <div>
            <h2>Студия Кокка</h2>
            <p>Проект — это как карта в Hammer: <b>свой мир</b> и всё, что в нём происходит (сцены, диалоги, задания, логика). Открыт и загружен в игре всегда только один проект.</p>
          </div>
          <div className="c4-picker-acts">
            <button className="c4-btn big prim" data-learn="new-project" onClick={onNew} {...hp('Новый проект: название и мир — новый (плоский, обычный, пустота), копия мира или существующий.')}><I name="plus" size={16} /> Новый проект…</button>
            <button className="c4-btn big" data-learn="open-learn" onClick={onLearn} {...hp('«Обучение»: пошаговые уроки — первая сцена за 5 минут, камера, логика, диалоги и другое.')}><I name="tutor" size={16} /> Обучение</button>
          </div>
        </div>
        {recent.length > 0 && <><h3>Недавние</h3><div className="c4-pgrid">{recent.map((p) => <ProjectCard key={p.id} p={p} hp={hp} onOpen={() => openProject(core, p.id)} />)}</div></>}
        <h3>{recent.length ? 'Все проекты' : 'Проекты'}</h3>
        <div className="c4-pgrid">
          {others.map((p) => <ProjectCard key={p.id} p={p} hp={hp} onOpen={() => openProject(core, p.id)} />)}
          <button className="c4-pcard add" onClick={onNew} {...hp('Создать проект.')}><span className="thumb"><I name="plus" size={28} /></span><span className="body"><b>Новый проект</b><small>свой мир + свои файлы</small></span></button>
        </div>
        <p className="dim small" style={{ marginTop: 14 }}>Проекты лежат в <span className="mono">{b.studio ? b.studio + '/projects' : 'studio/projects'}</span>. «Примеры» — готовые сцены, диалоги и задание: открой и посмотри, как устроено.</p>
      </div>
    </div>
  );
}

const TEMPLATES = [
  ['flat', 'Плоский', 'Ровная трава на коренной породе — удобно строить и ставить сцены.'],
  ['normal', 'Обычный', 'Обычный мир сборки (со всеми модами генерации). Лаунчер пишет level.dat, игра строит мир при первом входе.'],
  ['void', 'Пустота', 'Пустой мир с маленькой каменной площадкой — для студии, постановочных сцен, своих построек.'],
  ['copy', 'Копия мира', 'Копия одного из твоих миров: оригинал не тронется.']
];

export function NewProjectModal({ onClose, Modal }) {
  const core = useStudio();
  const { hp } = core;
  const [name, setName] = useState('');
  const [mode, setMode] = useState('new'); // new | existing
  const [tpl, setTpl] = useState('flat');
  const [worlds, setWorlds] = useState(null);
  const [src, setSrc] = useState('');
  const [copy, setCopy] = useState(true);
  const [creative, setCreative] = useState(true);
  const [rules, setRules] = useState({ doDaylightCycle: true, doMobSpawning: false, doWeatherCycle: false });
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('studio:worlds').then((r) => { const l = (r && r.worlds) || []; setWorlds(l); if (l[0]) setSrc(l[0].folder); }).catch(() => setWorlds([])); }, []);
  const needWorld = (mode === 'existing' || tpl === 'copy');
  const ok = name.trim() && !(needWorld && !src);
  const create = async () => {
    if (!ok || busy) return;
    setBusy(true);
    let world;
    if (mode === 'existing') world = { mode: 'existing', folder: src, copy, name: name.trim() };
    else if (tpl === 'copy') world = { mode: 'copy', from: src, name: name.trim() };
    else world = { mode: 'new', template: tpl, name: name.trim(), creative, seed: tpl === 'normal' ? seed : undefined, rules: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, v ? 'true' : 'false'])) };
    try {
      await core.flush();
      const r = await call('studio:projectCreate', { name: name.trim(), world });
      core.toast('Проект «' + r.project.name + '» создан' + (r.world ? ' — мир «' + r.world + '» в saves' : ''), 'ok', 5000);
      // окно перечитается само (studio-win {type:'project'})
    } catch (e) { core.toast(e.message, 'error', 8000); setBusy(false); }
  };
  const rule = (k, l, h) => <label className="c4-chk" {...hp(h)}><input type="checkbox" checked={!!rules[k]} onChange={(e) => setRules({ ...rules, [k]: e.target.checked })} /> {l}</label>;
  return (
    <Modal title="Новый проект" wide onClose={onClose} footer={<>
      <button className="c4-btn" onClick={onClose}>Отмена</button>
      <button className="c4-btn prim" data-learn="np-create" disabled={!ok || busy} onClick={create} {...hp('Создать проект и мир и открыть его. Игра откроет мир проекта (кнопка «Открыть мир проекта» вверху или F5).')}>{busy ? 'Создаю…' : 'Создать проект'}</button>
    </>}>
      <div className="c4-np">
        <label className="c4-np-l">Название</label>
        <input className="c4-text big" autoFocus data-learn="np-name" placeholder="Например: Пролог в долине" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') create(); }} {...hp('Как называется проект. Папка проекта получит имя латиницей.')} />
        <label className="c4-np-l">Мир проекта</label>
        <div className="c4-seg">
          <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')} {...hp('Сделать новый мир для проекта.')}>Новый мир</button>
          <button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')} {...hp('Взять мир из saves.')}>Существующий мир</button>
        </div>
        {mode === 'new' && (
          <div className="c4-tpls">
            {TEMPLATES.map(([id, l, h]) => (
              <button key={id} data-learn={'np-tpl-' + id} className={'c4-tpl' + (tpl === id ? ' on' : '')} onClick={() => setTpl(id)} {...hp(l + ': ' + h)}>
                <span className={'pic ' + id} /><b>{l}</b><small>{h}</small>
              </button>
            ))}
          </div>
        )}
        {needWorld && (
          <>
            <label className="c4-np-l">{mode === 'existing' ? 'Какой мир' : 'Копия какого мира'}</label>
            <div className="c4-np-worlds">
              {worlds === null && <span className="dim">Читаю миры…</span>}
              {worlds && !worlds.length && <span className="dim">В saves нет миров — выбери «Новый мир».</span>}
              {(worlds || []).map((w) => (
                <button key={w.folder} className={'c4-wrow' + (src === w.folder ? ' on' : '')} onClick={() => setSrc(w.folder)} {...hp('Мир «' + w.name + '» (saves/' + w.folder + ').')}>
                  {w.icon ? <img src={w.icon} alt="" /> : <span className="noimg"><I name="world" size={18} /></span>}
                  <span className="t"><b>{w.name}</b><small>{fmtWhen(w.lastPlayed)}{w.mode ? ' · ' + (MODE_RU[w.mode] || w.mode) : ''}</small></span>
                </button>
              ))}
            </div>
            {mode === 'existing' && <label className="c4-chk" {...hp('Работать с копией мира (по умолчанию): оригинал останется как был. Без копии правки пойдут прямо в этот мир.')}><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Работать с копией (оригинал не тронется)</label>}
          </>
        )}
        {mode === 'new' && tpl !== 'copy' && (
          <div className="c4-np-opts">
            <label className="c4-chk" {...hp('Творческий режим: летать, ломать сразу, бесконечные блоки. В режиме редактора игра и так делает игрока неуязвимым.')}><input type="checkbox" checked={creative} onChange={(e) => setCreative(e.target.checked)} /> Творческий режим</label>
            {rule('doDaylightCycle', 'Смена дня и ночи', 'Выключи — время в мире встанет (удобно снимать сцены).')}
            {rule('doMobSpawning', 'Мобы появляются сами', 'Выключено — в мире никого лишнего, кроме тех, кого поставишь.')}
            {rule('doWeatherCycle', 'Погода меняется сама', 'Выключено — погода только та, что задашь (небом сцены).')}
            {tpl === 'normal' && <span className="c4-np-seed" {...hp('Зерно мира (необязательно): число или слово, как в игре. Пусто — случайное.')}>Зерно <input className="c4-text" value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="случайное" /></span>}
          </div>
        )}
        <p className="dim small">Мир появится в <span className="mono">saves/</span>; проект — в <span className="mono">studio/projects/</span>. После создания: «Открыть мир проекта» — игра загрузит мир (если игра не запущена — лаунчер запустит её сразу в нём).</p>
      </div>
    </Modal>
  );
}

export function OpenProjectModal({ onClose, onNew, Modal }) {
  const core = useStudio();
  const [list, setList] = useState(null);
  useEffect(() => { call('studio:projects').then((r) => setList((r && r.list) || [])).catch(() => setList([])); }, []);
  return (
    <Modal title="Открыть проект" wide onClose={onClose} footer={<><button className="c4-btn" onClick={() => { onClose(); onNew(); }}><I name="plus" size={12} /> Новый проект…</button><button className="c4-btn" onClick={onClose}>Отмена</button></>}>
      <p className="dim">Открытый проект закроется (всё уже сохранено). Игра получит {'{t:"project"}'} и перечитает только новый проект.</p>
      <div className="c4-pgrid">{(list || []).map((p) => <ProjectCard key={p.id} p={p} hp={core.hp} current={p.id === core.projectId} onOpen={() => { onClose(); openProject(core, p.id); }} />)}</div>
      {list && !list.length && <p>Проектов нет.</p>}
    </Modal>
  );
}

export function ProjectPropsModal({ onClose, Modal }) {
  const core = useStudio();
  const p = core.project;
  const [v, setV] = useState(() => ({ name: p.name || '', note: p.note || '', time: p.play && p.play.time != null ? p.play.time : '', weather: (p.play && p.play.weather) || '', rules: { ...((p.play && p.play.gamerules) || {}) } }));
  const save = () => {
    const t = v.time === '' ? null : Math.max(0, Math.min(23999, Math.round(Number(v.time) || 0)));
    core.saveProject({ ...p, name: v.name.trim() || p.name, note: v.note, play: { time: t, weather: v.weather || null, gamerules: v.rules } });
    core.toast('Свойства проекта сохранены', 'ok', 2000);
    onClose();
  };
  const rule = (k, l, h) => (
    <label className="c4-chk" title={h}>
      <select className="c4-text" style={{ width: 90 }} value={v.rules[k] == null ? '' : String(v.rules[k])} onChange={(e) => { const r = { ...v.rules }; if (e.target.value === '') delete r[k]; else r[k] = e.target.value === 'true'; setV({ ...v, rules: r }); }}>
        <option value="">как в мире</option><option value="true">да</option><option value="false">нет</option>
      </select> {l}
    </label>
  );
  return (
    <Modal title="Свойства проекта" wide onClose={onClose} footer={<><button className="c4-btn" onClick={onClose}>Отмена</button><button className="c4-btn prim" onClick={save}>Сохранить</button></>}>
      <div className="c4-np">
        <label className="c4-np-l">Название</label>
        <input className="c4-text big" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        <label className="c4-np-l">Мир</label>
        <div className="dim">{p.world ? 'saves/' + p.world : 'без своего мира'} · id проекта <span className="mono">{p.id}</span> · сборка в <span className="mono">config/kokkstory/studio/{p.id}/</span></div>
        <label className="c4-np-l">«Мир» при ▶ Играть (F5)</label>
        <div className="c4-np-opts">
          <span className="c4-np-seed" title="Время суток в начале игры (тики: 0 — 06:00, 6000 — полдень, 13000 — ночь). Пусто — как было.">Время <input className="c4-text" value={v.time} placeholder="как было" onChange={(e) => setV({ ...v, time: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></span>
          <span className="c4-np-seed" title="Погода в начале игры.">Погода <select className="c4-text" value={v.weather} onChange={(e) => setV({ ...v, weather: e.target.value })}><option value="">как была</option><option value="clear">ясно</option><option value="rain">дождь</option><option value="thunder">гроза</option></select></span>
        </div>
        <div className="c4-np-opts">
          {rule('doDaylightCycle', 'смена дня и ночи', '')}
          {rule('doMobSpawning', 'мобы появляются', '')}
          {rule('doWeatherCycle', 'погода меняется', '')}
          {rule('keepInventory', 'не терять вещи', '')}
        </div>
        <label className="c4-np-l">Заметка</label>
        <textarea className="c4-text" rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </div>
    </Modal>
  );
}
