// «Жители» → «Реплики»: что говорят жители. Строки игры (ru + en) по ситуациям (ключ и его варианты .0 .1 …);
// свои строки — «добавить» к обычным или «заменить» их. Файл проекта ai/lines/lines.json; правка сразу ложится на язык игры
// у автора ({t:'aiLines', data}); «Собрать» → config/villagerskokk/ai_lines/studio_<проект>.json — у всех игроков.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import I from '../c4d/icons.jsx';
import { learnMark } from '../learn/index.jsx';
import { aiValidateLines, AI_ERR } from './aiValidate.js';

const PREFIXES = [
  ['', 'все строки'], ['villagerskokk.talk.', 'разговор с жителем'], ['villagerskokk.life.', 'жизнь деревни'], ['villagerskokk.elect.', 'выборы старосты'],
  ['villagerskokk.tavern', 'таверна'], ['villagerskokk.order', 'заказы и доска'], ['villagerskokk.goal.', 'названия дел'], ['villagerskokk.act.', 'названия шагов'],
  ['villagerskokk.fail.', 'причины неудач'], ['villagerskokk.script.', 'поведения из Студии'], ['story.rt.', 'жители долины (Kokk Story)'], ['story.valley.', 'долина (Kokk Story)']
];
const FILE = 'lines';

export default function LinesPane({ ai, core }) {
  const { hp } = core;
  const [q, setQ] = useState('');
  const [prefix, setPrefix] = useState('villagerskokk.talk.');
  const [onlyOver, setOnlyOver] = useState(false);
  const [open, setOpen] = useState(null);
  const [saved, setSaved] = useState('saved');
  const timer = useRef(null);
  const data = (ai.proj && ai.proj.lines && ai.proj.lines[FILE]) || { lines: [] };
  const otherFiles = Object.entries((ai.proj && ai.proj.lines) || {}).filter(([k]) => k !== FILE);
  const over = useMemo(() => Object.fromEntries((data.lines || []).map((l) => [l.key, l])), [data]);

  const ask = () => { if (ai.connected) ai.send({ t: 'aiLines', op: 'list', q, prefix, limit: 300 }); };
  useEffect(() => { const t = setTimeout(ask, 300); return () => clearTimeout(t); }, [q, prefix, ai.connected]); // eslint-disable-line

  const save = (lines) => {
    const next = { v: 1, lines };
    ai.setProj((p) => ({ ...p, lines: { ...(p.lines || {}), [FILE]: next } }));
    setSaved('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await call('studio:aiSaveLines', { file: FILE, data: next });
        const files = [next, ...otherFiles.map(([, d]) => d)];
        ai.send({ t: 'aiLines', data: { files, scripts: ai.proj.scripts } });
        setSaved('saved');
      } catch (e) { setSaved('error'); core.toast(e.message, 'error'); }
    }, 500);
  };
  const setOver = (key, patch) => {
    const cur = over[key];
    let lines = (data.lines || []).filter((l) => l.key !== key);
    if (patch) lines = [...lines, { key, mode: 'add', ru: [], en: [], ...(cur || {}), ...patch }];
    save(lines);
    learnMark('ai-line-edit');
  };

  const groups = ai.linesList ? ai.linesList.groups || [] : [];
  const gKeys = new Set(groups.map((g) => g.key));
  // свои строки, которых нет в выдаче игры (или игры нет), — тоже в таблицу
  const extra = (data.lines || []).filter((l) => !gKeys.has(l.key) && (!prefix || l.key.startsWith(prefix)) && (!q || (l.key + ' ' + (l.ru || []).join(' ') + ' ' + (l.en || []).join(' ')).toLowerCase().includes(q.toLowerCase())))
    .map((l) => ({ key: l.key, n: 0, ru: [], en: [], keys: [], own: true }));
  const rows = [...extra, ...groups].filter((g) => !onlyOver || over[g.key]);
  const issues = useMemo(() => aiValidateLines(data), [data]);
  const [newKey, setNewKey] = useState('');

  return (
    <div className="vk-lines">
      <div className="vk-tool">
        <div className="vk-search" data-learn="ai-line-search"><I name="search" size={13} /><input placeholder="Найти: слово из реплики или ключ (например «привет», bye, greet)" value={q} onChange={(e) => setQ(e.target.value)} {...hp('Ищет в ключах и в самих строках, по-русски и по-английски.')} /></div>
        <select value={prefix} onChange={(e) => setPrefix(e.target.value)} {...hp('Раздел: какие строки показывать.')}>{PREFIXES.map(([v, l]) => <option key={v} value={v}>{l}{v ? ' (' + v + '…)' : ''}</option>)}</select>
        <label className="vk-chk"><input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> только свои</label>
        <div className="grow" />
        <span className={'vk-save ' + saved}>{{ saved: 'Сохранено', dirty: 'Есть правки…', error: 'Не сохранилось!' }[saved]}</span>
      </div>
      <div className="vk-pinfo">
        <span>Своих ситуаций: <b>{(data.lines || []).length}</b>{ai.linesList ? <> · найдено в игре: <b>{ai.linesList.total}</b>{ai.linesList.total > groups.length ? ' (показаны первые ' + groups.length + ')' : ''}</> : null}</span>
        <span className="dim">{ai.connected ? 'Правка сразу видна в игре (у тебя). Игроки получат её после «Собрать».' : 'Без связи с игрой видны только свои строки. Все строки игры появятся, когда игра будет на связи.'} Подстановки: %s, %1$s — как в исходной строке.</span>
      </div>
      <div className="vk-ltable">
        <div className="vk-lh"><span>Ситуация (ключ)</span><span>Сейчас в игре (ru / en)</span><span>Свои строки</span></div>
        {!rows.length && <div className="vk-empty">{ai.connected ? 'Ничего не найдено.' : 'Своих строк пока нет. Можно добавить по ключу внизу.'}</div>}
        {rows.map((g) => {
          const o = over[g.key];
          const isOpen = open === g.key;
          return (
            <div key={g.key} className={'vk-lrow' + (o ? ' over' : '')} data-learn={'ai-line-' + g.key.replace(/[^a-z0-9]/g, '_')}>
              <div className="lk" onClick={() => setOpen(isOpen ? null : g.key)}><span className="mono">{g.key}</span>{g.n > 1 && <small>{g.n} вар.</small>}{g.own && <small className="own">своя</small>}</div>
              <div className="lo" onClick={() => setOpen(isOpen ? null : g.key)}>
                {(isOpen ? g.ru.map((r, i) => [r, g.en[i]]) : [[g.ru[0], g.en[0]]]).filter((x) => x[0] || x[1]).map(([r, e], i) => <div key={i} className="pair"><span className="ru">{r}</span><span className="en">{e}</span></div>)}
                {!isOpen && g.n > 1 && <span className="dim small">ещё {g.n - 1}…</span>}
                {g.own && !g.n && <span className="dim small">ключа нет в игре — строка сработает, если игра его спросит</span>}
              </div>
              <div className="lv">
                <select value={o ? o.mode || 'add' : ''} onChange={(e) => (e.target.value ? setOver(g.key, { mode: e.target.value }) : setOver(g.key, null))} {...hp('«Добавить» — свои строки звучат вперемешку с обычными. «Заменить» — только свои.')}>
                  <option value="">как в игре</option><option value="add">добавить к обычным</option><option value="replace">заменить</option>
                </select>
                {o && <>
                  <textarea rows={Math.max(2, (o.ru || []).length + 1)} placeholder="По-русски: по строке на вариант" value={(o.ru || []).join('\n')} onChange={(e) => setOver(g.key, { ru: e.target.value.split('\n') })} onBlur={(e) => setOver(g.key, { ru: e.target.value.split('\n').filter((x) => x.trim()) })} onKeyDown={(e) => e.stopPropagation()} />
                  <textarea rows={Math.max(2, (o.en || []).length + 1)} placeholder="In English: one line per variant" value={(o.en || []).join('\n')} onChange={(e) => setOver(g.key, { en: e.target.value.split('\n') })} onBlur={(e) => setOver(g.key, { en: e.target.value.split('\n').filter((x) => x.trim()) })} onKeyDown={(e) => e.stopPropagation()} />
                </>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="vk-lfoot">
        <input className="c4-text mono" placeholder="ключ ситуации, например villagerskokk.talk.bye" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} onKeyDown={(e) => e.stopPropagation()} />
        <button className="c4-btn sm" disabled={!/^[a-z0-9_.-]+$/.test(newKey) || !!over[newKey]} onClick={() => { setOver(newKey, { mode: 'add', ru: [''], en: [''] }); setOpen(newKey); setNewKey(''); setOnlyOver(true); }} {...hp('Добавить свои строки к ситуации по её ключу (ключ видно в таблице выше).')}><I name="plus" size={11} /> Свои строки к ключу</button>
        {issues.length > 0 && <div className="vk-issues inline">{issues.slice(0, 4).map((x, i) => <div key={i} className={x.sev === AI_ERR ? 'e' : 'w'}><I name="warn" size={11} /> {x.msg}</div>)}</div>}
      </div>
    </div>
  );
}
