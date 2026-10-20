// «Жители» → «Поведение»: новые дела и реакции жителей как данные. Дело: кто → когда → насколько хочет (вес) → шаги.
// Реакция: на какое событие → кто → когда → шаги (или «затем дело»). Шаги — из реестра действий ИИ (каталог из игры).
// Файлы: ai/scripts/<id>.json; правка сразу уходит в игру ({t:'aiScript', data}); «Собрать» → config/villagerskokk/ai_scripts/.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../lib/api.js';
import I from '../c4d/icons.jsx';
import { lsGet, lsSet } from '../c4d/core.jsx';
import { learnMark } from '../learn/index.jsx';
import { TEMPLATES, blankScript, PLACE_PRESETS, placeText, stepText, condText } from './aiModel.js';
import { aiValidateScript, aiValidateScripts, aiCleanScript, AI_ERR, AI_ID } from './aiValidate.js';

const ITEMS = ['minecraft:oak_fence', 'minecraft:oak_planks', 'minecraft:oak_log', 'minecraft:cobblestone', 'minecraft:bread', 'minecraft:wheat', 'minecraft:torch', 'minecraft:stone_pickaxe', 'minecraft:stone_axe', 'minecraft:iron_ingot', 'minecraft:apple', 'minecraft:emerald', 'minecraft:flower_pot', 'minecraft:poppy', '#minecraft:logs', '#minecraft:planks'];
const BLOCKS = ['#minecraft:fences', '#minecraft:doors', '#minecraft:logs', '#minecraft:beds', '#minecraft:crops', '#minecraft:flowers', 'minecraft:chest', 'minecraft:crafting_table', 'minecraft:furnace', 'minecraft:bell', 'minecraft:composter', 'minecraft:water', 'minecraft:oak_fence_gate', 'minecraft:farmland'];
const SOUNDS = ['minecraft:entity.villager.yes', 'minecraft:entity.villager.no', 'minecraft:entity.villager.ambient', 'minecraft:entity.villager.celebrate', 'minecraft:block.bell.use', 'minecraft:entity.experience_orb.pickup', 'minecraft:block.wood.place'];
const PARTICLES = ['minecraft:happy_villager', 'minecraft:angry_villager', 'minecraft:heart', 'minecraft:note', 'minecraft:cloud', 'minecraft:smoke', 'minecraft:end_rod', 'minecraft:enchant'];
const ENTITIES = ['player', 'monster', 'citizen', 'villager', 'minecraft:zombie', 'minecraft:cow', 'minecraft:sheep', 'minecraft:iron_golem'];

export default function BehaviourPane({ ai, core }) {
  const { hp } = core;
  const cat = ai.cat;
  const scripts = (ai.proj && ai.proj.scripts) || [];
  const [selId, setSelState] = useState(() => lsGet('ai.script', null));
  const setSel = (id) => { setSelState(id); lsSet('ai.script', id); };
  const [tplOpen, setTplOpen] = useState(false);
  const sel = scripts.find((s) => s.id === selId) || null;
  const timers = useRef({});
  const gameById = useMemo(() => Object.fromEntries(((ai.gameScripts && ai.gameScripts.items) || []).map((x) => [x.id, x])), [ai.gameScripts]);
  const allIssues = useMemo(() => aiValidateScripts(scripts, cat), [scripts, cat]);

  const persist = (s, live) => {
    clearTimeout(timers.current[s.id]);
    timers.current[s.id] = setTimeout(async () => {
      try {
        await call('studio:aiSaveScript', s);
        const errs = aiValidateScript(s, cat).filter((x) => x.sev === AI_ERR);
        if (live !== false && !errs.length) ai.send({ t: 'aiScript', data: aiCleanScript(s) });
      } catch (e) { core.toast(e.message, 'error'); }
    }, 500);
  };
  const update = (s) => {
    ai.setProj((p) => ({ ...p, scripts: p.scripts.map((x) => (x.id === s.id ? s : x)) }));
    persist(s);
  };
  const freeId = (base) => { let id = base, n = 2; while (scripts.some((s) => s.id === id)) id = base + '_' + n++; return id; };
  const add = (s) => {
    ai.setProj((p) => ({ ...p, scripts: [...p.scripts, s] }));
    persist(s);
    setSel(s.id);
  };
  const remove = async (s) => {
    if (!window.confirm('Удалить поведение «' + (s.name || s.id) + '»? Файл ai/scripts/' + s.id + '.json будет удалён.')) return;
    try { await call('studio:aiDeleteScript', s.id); } catch (e) { core.toast(e.message, 'error'); return; }
    ai.setProj((p) => ({ ...p, scripts: p.scripts.filter((x) => x.id !== s.id) }));
    ai.send({ t: 'aiScript', id: s.id, remove: true });
    setSel(null);
  };
  const rename = async (s, to) => {
    if (to === s.id) return;
    if (!AI_ID.test(to)) { core.toast('Имя (id): маленькие латинские буквы, цифры, _ . -', 'error'); return; }
    if (scripts.some((x) => x.id === to)) { core.toast('Такое поведение уже есть', 'error'); return; }
    try { await call('studio:aiRenameScript', { from: s.id, to }); } catch (e) { core.toast(e.message, 'error'); return; }
    ai.send({ t: 'aiScript', id: s.id, remove: true });
    const n = { ...s, id: to };
    ai.setProj((p) => ({ ...p, scripts: p.scripts.map((x) => (x.id === s.id ? n : x)) }));
    setSel(to);
    persist(n);
  };

  return (
    <div className="vk-behave">
      <div className="vk-col vk-slist">
        <div className="vk-colh"><I name="scheme" size={14} /> Поведения <small>{scripts.length}</small></div>
        <div className="vk-sbtns">
          <button className="c4-btn sm" data-learn="ai-script-new" onClick={() => { add(blankScript('goal', freeId('new_goal'))); learnMark('ai-script-new'); }} {...hp('Новое дело: житель будет взвешивать его среди своих дел и браться, когда оно важнее остального.')}><I name="plus" size={11} /> Дело</button>
          <button className="c4-btn sm" onClick={() => add(blankScript('reaction', freeId('new_reaction')))} {...hp('Новая реакция: что житель делает, когда что-то случилось (увидел игрока, ранен, упал в воду…).')}><I name="plus" size={11} /> Реакция</button>
          <span className="vk-tplw">
            <button className="c4-btn sm" data-learn="ai-tpl" onClick={() => setTplOpen(!tplOpen)} {...hp('Готовые поведения: начни с похожего и поменяй под себя.')}><I name="copy" size={11} /> Шаблон…</button>
            {tplOpen && <div className="vk-pop wide" onMouseLeave={() => setTplOpen(false)}>{TEMPLATES.map((t) => (
              <div key={t.id} className="it" data-learn={'ai-tpl-' + t.id} onClick={() => { const s = JSON.parse(JSON.stringify(t)); delete s._tpl; s.id = freeId(t.id); add(s); setTplOpen(false); learnMark('ai-tpl-' + t.id); }}>
                <b>{t.type === 'reaction' ? '⚡ ' : '▶ '}{t.name}</b><span className="dim">{t._tpl}</span>
              </div>
            ))}</div>}
          </span>
        </div>
        <div className="vk-rows">
          {!scripts.length && <div className="vk-empty">Поведений пока нет.<br /><span className="dim">Начни с шаблона — например «Чинит забор».</span></div>}
          {scripts.map((s) => {
            const errs = allIssues.filter((x) => x.doc === s.id && x.sev === AI_ERR).length;
            const g = gameById[s.id];
            return (
              <div key={s.id} className={'vk-srow' + (s.id === selId ? ' sel' : '') + (s.enabled === false ? ' off' : '')} onClick={() => setSel(s.id)}>
                <span className={'ty ' + (s.type === 'reaction' ? 'r' : 'g')}>{s.type === 'reaction' ? '⚡' : '▶'}</span>
                <div className="sm"><div className="nm">{s.name || s.id}</div><div className="sub">{s.type === 'reaction' ? 'реакция: ' + ((cat.events || []).find((e) => e.id === s.on) || {}).ru : 'дело · ' + (s.steps || []).length + ' шаг.'}</div></div>
                {errs > 0 ? <span className="badge e" title="Ошибки — в игру не уйдёт">{errs}</span> : g ? <span className={'badge ' + (g.ok ? 'ok' : 'e')} title={g.ok ? 'В игре загружено' : 'Игра нашла ошибки'}>{g.ok ? '✓' : '!'}</span> : null}
              </div>
            );
          })}
        </div>
        <datalist id="vk-items">{ITEMS.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="vk-blocks">{BLOCKS.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="vk-sounds">{SOUNDS.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="vk-particles">{PARTICLES.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="vk-entities">{ENTITIES.map((x) => <option key={x} value={x} />)}</datalist>
      </div>
      <div className="vk-col vk-sedit">
        {!sel ? <BehaveHint /> : <ScriptEditor key={sel.id} s={sel} cat={cat} ai={ai} core={core} onChange={update} onRemove={() => remove(sel)} onRename={(to) => rename(sel, to)} game={gameById[sel.id]} />}
      </div>
    </div>
  );
}

function BehaveHint() {
  return (
    <div className="vk-hero">
      <I name="scheme" size={42} color="#7c8bff" />
      <h3>Поведение жителей — без программирования</h3>
      <p><b>Дело</b> — то, за что житель может взяться сам: <i>кто</i> (профессия, характер, возраст), <i>когда</i> (время, погода, рядом блок, есть вещь…), <i>насколько хочет</i> (вес: основа + слагаемые) и <i>шаги</i> (идти, добыть, скрафтить, поставить блок, сказать…).</p>
      <p><b>Реакция</b> — что он делает, когда что-то случилось: увидел игрока, ранен, упал в воду, пошёл дождь. Короткие шаги (сказать, жест, посмотреть) — сразу, не бросая работы.</p>
      <p className="dim">Слева — «Дело», «Реакция» или «Шаблон…». Файлы лежат в ai/scripts/ проекта.</p>
    </div>
  );
}

function Sec({ title, hint, children, learn, hp, extra }) {
  return (
    <section className="vk-sec" data-learn={learn}>
      <header {...hp(hint)}><b>{title}</b><div className="grow" />{extra}</header>
      <div className="vk-secb">{children}</div>
    </section>
  );
}

function ScriptEditor({ s, cat, ai, core, onChange, onRemove, onRename, game }) {
  const { hp } = core;
  const set = (patch) => onChange({ ...s, ...patch });
  const reaction = s.type === 'reaction';
  const issues = useMemo(() => aiValidateScript(s, cat), [s, cat]);
  const errs = issues.filter((x) => x.sev === AI_ERR);
  const [idTxt, setIdTxt] = useState(s.id);
  const who = s.who || { trades: [], tempers: [], age: 'adult' };
  const setWho = (patch) => set({ who: { ...who, ...patch } });
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const watched = ai.watchId.current;
  return (
    <div className="vk-ed">
      <div className="vk-edh">
        <span className={'ty big ' + (reaction ? 'r' : 'g')}>{reaction ? '⚡' : '▶'}</span>
        <input className="c4-text title" value={s.name || ''} placeholder="Название по-русски" onChange={(e) => set({ name: e.target.value })} {...hp('Название по-русски: его видно в Студии, в «Почему так решил» и игрокам (в осмотре жителя).')} />
        <input className="c4-text title en" value={s.name_en || ''} placeholder="Name in English" onChange={(e) => set({ name_en: e.target.value })} {...hp('Название по-английски — для игроков с английским языком игры.')} />
        <label className="vk-toggle" {...hp('Выключенное поведение лежит в проекте, но игра его не использует.')}><input type="checkbox" checked={s.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} /><span>{s.enabled !== false ? 'включено' : 'выключено'}</span></label>
        <div className="grow" />
        <button className="c4-btn sm prim" data-learn="ai-send" disabled={!ai.connected || errs.length > 0} onClick={() => { ai.send({ t: 'aiScript', data: aiCleanScript(s) }); learnMark('ai-send'); core.toast('Отправлено в игру', 'ok', 1500); }} {...hp(errs.length ? 'Сначала исправь ошибки внизу.' : 'Отправить в игру сейчас (и так уходит само через полсекунды после правки).')}><I name="rocket" size={11} /> В игру</button>
        <button className="c4-btn sm" data-learn="ai-try" disabled={!ai.connected || !watched || errs.length > 0} onClick={() => { ai.send({ t: 'aiTry', id: watched, script: s.id }); learnMark('ai-try'); }} {...hp(watched ? 'Попробовать: житель, за которым ты следишь в «Наблюдении», сразу возьмётся за это поведение.' : 'Сначала выбери жителя в «Наблюдении».')}><I name="play" size={11} /> Попробовать</button>
        <button className="c4-btn sm danger" onClick={onRemove} {...hp('Удалить поведение из проекта и из игры.')}><I name="trash" size={11} /></button>
      </div>
      <div className="vk-edb">
        <Sec title={reaction ? 'Реакция' : 'Дело'} hp={hp} learn="ai-what" hint={reaction ? 'На какое событие, как часто и с какой важностью.' : 'Имя файла, перерыв после выполнения, можно ли прервать.'}>
          <div className="vk-f"><label>Имя (id)</label><input className="c4-text mono" value={idTxt} onChange={(e) => setIdTxt(e.target.value)} onBlur={() => onRename(idTxt.trim())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} {...hp('Имя файла ai/scripts/<id>.json: маленькие латинские буквы, цифры, _ . -')} /></div>
          {reaction ? (
            <>
              <div className="vk-f"><label>Событие</label><select data-learn="ai-on" value={s.on || ''} onChange={(e) => set({ on: e.target.value })} {...hp('Что должно случиться, чтобы житель отреагировал.')}>{(cat.events || []).map((e) => <option key={e.id} value={e.id}>{e.ru}</option>)}</select></div>
              <div className="vk-f"><label>Вероятность</label><input type="range" min="0" max="1" step="0.05" value={s.chance ?? 1} onChange={(e) => set({ chance: Number(e.target.value) })} /><span className="v">{Math.round((s.chance ?? 1) * 100)}%</span></div>
              <div className="vk-f"><label>Важность</label><input className="c4-text num" value={s.utility ?? 900} onChange={(e) => set({ utility: Number(e.target.value) || 0 })} {...hp('Вес, с которым житель берётся за долгие шаги реакции (короткие — сказать, жест — идут сразу). 900 — почти как поесть; 1000+ — как бегство.')} /></div>
              <div className="vk-f"><label>Затем дело</label><select value={s.goal || ''} onChange={(e) => set({ goal: e.target.value || undefined })} {...hp('После реакции житель возьмётся за это дело (из поведений проекта).')}><option value="">— нет —</option>{(ai.proj.scripts || []).filter((x) => x.type !== 'reaction').map((x) => <option key={x.id} value={x.id}>{x.name || x.id}</option>)}</select></div>
            </>
          ) : (
            <div className="vk-f"><label>Не прерывать</label><label className="vk-toggle" {...hp('Включи — житель не бросит это дело ради еды, сна или другой работы (бросит только из-за опасности).')}><input type="checkbox" checked={s.interruptible === false} onChange={(e) => set({ interruptible: !e.target.checked })} /><span>{s.interruptible === false ? 'только опасность прервёт' : 'можно прервать'}</span></label></div>
          )}
          <div className="vk-f"><label>Перерыв</label><input className="c4-text num" value={s.cooldown ?? (reaction ? 600 : 1200)} onChange={(e) => set({ cooldown: Math.max(0, Number(e.target.value) || 0) })} {...hp('Сколько тиков после выполнения житель не берётся за это снова (20 тиков = 1 с, 1200 = минута, 24000 = игровые сутки).')} /><span className="v">{Math.round((s.cooldown ?? (reaction ? 600 : 1200)) / 20)} с</span></div>
        </Sec>
        <Sec title="Кто" hp={hp} learn="ai-who" hint="Каким жителям доступно. Пусто — всем.">
          <div className="vk-f"><label>Профессии</label><div className="vk-chips">{(cat.trades || []).map((t) => <span key={t.id} className={'chip' + ((who.trades || []).includes(t.id) ? ' on' : '')} onClick={() => setWho({ trades: toggle(who.trades || [], t.id) })}>{t.name}</span>)}</div></div>
          <div className="vk-f"><label>Характер</label><div className="vk-chips">{(cat.tempers || []).map((t) => <span key={t.id} className={'chip' + ((who.tempers || []).includes(t.id) ? ' on' : '')} onClick={() => setWho({ tempers: toggle(who.tempers || [], t.id) })}>{t.name}</span>)}</div></div>
          <div className="vk-f"><label>Возраст</label><select value={who.age || 'adult'} onChange={(e) => setWho({ age: e.target.value })}><option value="adult">взрослые</option><option value="child">дети</option><option value="any">все</option></select></div>
        </Sec>
        <Sec title="Когда" hp={hp} learn="ai-when" hint="Все условия должны выполняться. «НЕ» переворачивает условие." extra={<button className="c4-btn sm" onClick={() => set({ when: [...(s.when || []), { time: 'day' }] })}><I name="plus" size={10} /> условие</button>}>
          {!(s.when || []).length && <div className="dim">Без условий — всегда.</div>}
          {(s.when || []).map((c, i) => <CondRow key={i} c={c} cat={cat} hp={hp} onChange={(n) => set({ when: s.when.map((x, j) => (j === i ? n : x)) })} onRemove={() => set({ when: s.when.filter((_, j) => j !== i) })} />)}
        </Sec>
        {!reaction && (
          <Sec title="Насколько хочет (вес)" hp={hp} learn="ai-score" hint="Вес = основа + Σ (множитель × слагаемое). Обычные дела весят 20–150, срочное (еда, бегство) — 400–1300. Выигрывает самое тяжёлое из тех, что можно начать." extra={<button className="c4-btn sm" onClick={() => set({ score: { ...(s.score || { base: 50 }), terms: [...((s.score && s.score.terms) || []), { k: 'own_trade', w: 20 }] } })}><I name="plus" size={10} /> слагаемое</button>}>
            <div className="vk-f"><label>Основа</label><input type="range" min="0" max="400" value={Math.min(400, Number((s.score || {}).base ?? 50))} onChange={(e) => set({ score: { ...(s.score || {}), base: Number(e.target.value) } })} /><input className="c4-text num" value={(s.score || {}).base ?? 50} onChange={(e) => set({ score: { ...(s.score || {}), base: Number(e.target.value) || 0 } })} /></div>
            {((s.score || {}).terms || []).map((t, i) => (
              <div key={i} className="vk-f term">
                <label>{i === 0 ? 'плюс' : ''}</label>
                <input className="c4-text num" value={t.w} onChange={(e) => set({ score: { ...s.score, terms: s.score.terms.map((x, j) => (j === i ? { ...x, w: Number(e.target.value) || 0 } : x)) } })} {...hp('Множитель: на сколько вес меняется за единицу слагаемого. Минус — уменьшает.')} />
                <span>×</span>
                <select value={t.k} onChange={(e) => set({ score: { ...s.score, terms: s.score.terms.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) } })}>{(cat.terms || []).map((x) => <option key={x.id} value={x.id}>{x.ru}</option>)}</select>
                {(t.k === 'items' || t.k === 'stored') && <input className="c4-text" list="vk-items" value={t.item || ''} placeholder="minecraft:bread" onChange={(e) => set({ score: { ...s.score, terms: s.score.terms.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) } })} />}
                <button className="c4-ib" onClick={() => set({ score: { ...s.score, terms: s.score.terms.filter((_, j) => j !== i) } })}><I name="close" size={11} /></button>
              </div>
            ))}
            <div className="vk-formula">{formula(s, cat)}</div>
          </Sec>
        )}
        <Sec title="Шаги" hp={hp} learn="ai-steps" hint="Что житель делает по порядку. «сразу» — мгновенные шаги. Если шаг нельзя собрать (нет места, не добыть), дело не начнётся и в «Почему так решил» будет причина." extra={<span className="dim small">{(s.steps || []).length} шаг.</span>}>
          <Steps steps={s.steps || []} cat={cat} hp={hp} issues={issues} onChange={(steps) => set({ steps })} />
        </Sec>
        <div className={'vk-issues' + (issues.length ? '' : ' ok')} data-learn="ai-check">
          {!issues.length && <div className="okr"><I name="check" size={12} color="#6cc04a" /> Ошибок нет{game ? (game.ok ? ' · в игре загружено' : ' · игра нашла ошибки') : ai.connected ? '' : ' · игра не на связи'}</div>}
          {issues.map((x, i) => <div key={i} className={x.sev === AI_ERR ? 'e' : 'w'}><I name="warn" size={11} /> {x.msg}</div>)}
          {game && !game.ok && (game.problems || []).map((p, i) => <div key={'g' + i} className="e"><I name="warn" size={11} /> Игра: {p}</div>)}
        </div>
      </div>
    </div>
  );
}

function formula(s, cat) {
  const sc = s.score || {};
  const parts = [String(sc.base ?? 50)];
  for (const t of sc.terms || []) {
    const ru = (((cat.terms || []).find((x) => x.id === t.k) || {}).ru || t.k).replace(/:.*$/, '');
    parts.push((Number(t.w) < 0 ? '− ' + Math.abs(t.w) : '+ ' + t.w) + ' × ' + ru + (t.item ? ' (' + t.item + ')' : ''));
  }
  return 'Вес = ' + parts.join(' ') + '  (× «Вес поведений» и настройка вида «поведение» из «Параметров»)';
}

const COND_DEFAULT = {
  time: { time: 'day' }, weather: { weather: 'clear' }, need: { need: 'satiety', op: '<', value: 10 }, hungry: { hungry: true }, trade: { trade: 'FARMER' }, temper: { temper: 'CALM' },
  place: { place: 'settlement' }, item: { item: 'minecraft:bread', count: 1, op: '>=', in: 'any' }, block: { block: '#minecraft:fences', radius: 12 }, entity: { entity: 'player', radius: 12 },
  opinion: { opinion: true, op: '>=', value: 20 }, level: { level: true, op: '>=', value: 3 }, goal: { goal: 'IDLE' }, chance: { chance: 0.5 }, storage: { storage: true }, hurt: { hurt: true }
};

function CondRow({ c, cat, hp, onChange, onRemove }) {
  const neg = !!c.not;
  const inner = neg ? c.not : c;
  const k = Object.keys(inner).find((x) => COND_DEFAULT[x]) || 'time';
  const def = (cat.conds || []).find((x) => x.id === k);
  const set = (n) => onChange(neg ? { not: n } : n);
  const f = (key, v) => set({ ...inner, [key]: v });
  const OPS = ['<', '<=', '>', '>=', '==', '!='];
  return (
    <div className="vk-cond" {...hp(def ? def.ru : '')}>
      <button className={'neg' + (neg ? ' on' : '')} onClick={() => onChange(neg ? inner : { not: inner })} title="НЕ — перевернуть условие">НЕ</button>
      <select value={k} onChange={(e) => set(COND_DEFAULT[e.target.value])}>{(cat.conds || []).map((x) => <option key={x.id} value={x.id}>{({ time: 'время', weather: 'погода', need: 'потребность', hungry: 'голоден', trade: 'профессия', temper: 'характер', place: 'где он', item: 'есть вещь', block: 'рядом блок', entity: 'рядом существо', opinion: 'отношение к игроку', level: 'уровень поселения', goal: 'сейчас занят', chance: 'случайно', storage: 'есть склад', hurt: 'ранен' })[x.id] || x.id}</option>)}</select>
      {k === 'time' && <select value={inner.time} onChange={(e) => f('time', e.target.value)}>{[['day', 'днём'], ['night', 'ночью'], ['dawn', 'на рассвете'], ['dusk', 'на закате'], ['morning', 'утром'], ['lunch', 'в обед'], ['afternoon', 'после обеда'], ['evening', 'вечером']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      {k === 'weather' && <select value={inner.weather} onChange={(e) => f('weather', e.target.value)}><option value="clear">ясно</option><option value="rain">дождь</option><option value="thunder">гроза</option></select>}
      {k === 'need' && <><select value={inner.need} onChange={(e) => f('need', e.target.value)}><option value="satiety">сытость (0–20)</option><option value="health">здоровье (0–1)</option></select><select value={inner.op} onChange={(e) => f('op', e.target.value)}>{OPS.map((o) => <option key={o}>{o}</option>)}</select><input className="c4-text num" value={inner.value} onChange={(e) => f('value', Number(e.target.value) || 0)} /></>}
      {k === 'hungry' && <select value={String(inner.hungry)} onChange={(e) => f('hungry', e.target.value === 'true')}><option value="true">да</option><option value="false">нет</option></select>}
      {k === 'trade' && <select value={[].concat(inner.trade)[0]} onChange={(e) => f('trade', e.target.value)}>{(cat.trades || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      {k === 'temper' && <select value={[].concat(inner.temper)[0]} onChange={(e) => f('temper', e.target.value)}>{(cat.tempers || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      {k === 'place' && <select value={inner.place} onChange={(e) => f('place', e.target.value)}>{[['home', 'в своём доме'], ['settlement', 'в поселении'], ['outside', 'вне поселения'], ['water', 'в воде'], ['underground', 'под землёй'], ['sky', 'под открытым небом']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      {k === 'item' && <><input className="c4-text" list="vk-items" value={inner.item} onChange={(e) => f('item', e.target.value)} /><select value={inner.op || '>='} onChange={(e) => f('op', e.target.value)}>{OPS.map((o) => <option key={o}>{o}</option>)}</select><input className="c4-text num" value={inner.count ?? 1} onChange={(e) => f('count', Number(e.target.value) || 0)} /><select value={inner.in || 'any'} onChange={(e) => f('in', e.target.value)}><option value="any">где угодно</option><option value="inventory">в карманах</option><option value="storage">на складе</option></select></>}
      {k === 'block' && <><input className="c4-text" list="vk-blocks" value={inner.block} onChange={(e) => f('block', e.target.value)} /><span>в</span><input className="c4-text num" value={inner.radius ?? 12} onChange={(e) => f('radius', Number(e.target.value) || 1)} /><span>бл.</span></>}
      {k === 'entity' && <><input className="c4-text" list="vk-entities" value={inner.entity} onChange={(e) => f('entity', e.target.value)} /><span>в</span><input className="c4-text num" value={inner.radius ?? 12} onChange={(e) => f('radius', Number(e.target.value) || 1)} /><span>бл.</span></>}
      {(k === 'opinion' || k === 'level') && <><select value={inner.op || '>='} onChange={(e) => f('op', e.target.value)}>{OPS.map((o) => <option key={o}>{o}</option>)}</select><input className="c4-text num" value={inner.value ?? 0} onChange={(e) => f('value', Number(e.target.value) || 0)} /></>}
      {k === 'goal' && <select value={[].concat(inner.goal)[0]} onChange={(e) => f('goal', e.target.value)}>{(cat.goals || []).map((g) => <option key={g.id} value={g.id}>{g.ru}</option>)}</select>}
      {k === 'chance' && <><input type="range" min="0" max="1" step="0.05" value={inner.chance} onChange={(e) => f('chance', Number(e.target.value))} /><span>{Math.round(inner.chance * 100)}%</span></>}
      {(k === 'storage' || k === 'hurt') && <select value={String(inner[k])} onChange={(e) => f(k, e.target.value === 'true')}><option value="true">да</option><option value="false">нет</option></select>}
      <span className="txt">{condText(c, cat)}</span>
      <button className="c4-ib" onClick={onRemove}><I name="close" size={11} /></button>
    </div>
  );
}

function Steps({ steps, cat, hp, issues, onChange }) {
  const acts = cat.actions || [];
  const byId = Object.fromEntries(acts.map((a) => [a.id, a]));
  const [adding, setAdding] = useState(null);
  const ins = (i, id) => {
    const a = byId[id];
    const st = { do: id };
    for (const p of (a && a.params) || []) if (p.def !== '' && p.def != null) st[p.k] = p.type === 'number' ? Number(p.def) : p.type === 'bool' ? p.def === 'true' : p.type === 'place' && /^\{/.test(p.def) ? JSON.parse(p.def) : p.def;
    const n = [...steps];
    n.splice(i, 0, st);
    onChange(n);
    setAdding(null);
    learnMark('ai-step-add');
  };
  const mv = (i, d) => { const n = [...steps]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const groups = [
    ['Движение', ['go', 'follow', 'wander', 'wait']], ['Вещи и блоки', ['get', 'craft', 'take', 'deposit', 'place_block', 'break_block', 'use_block', 'give', 'drop', 'pickup']],
    ['Нужды и опасность', ['eat', 'sleep', 'flee', 'fight', 'escape', 'breathe']], ['Общение и знаки', ['say', 'look', 'anim', 'sound', 'particles', 'talk', 'signal']], ['Дальше', ['goal']]
  ];
  const Adder = ({ at }) => (
    <div className="vk-addstep">
      <button className="plus" onClick={() => setAdding(adding === at ? null : at)} title="Вставить шаг сюда">+</button>
      {adding === at && <div className="vk-pop steps" onMouseLeave={() => setAdding(null)}>{groups.map(([g, ids]) => (
        <div key={g} className="grp"><div className="gh">{g}</div>{ids.filter((id) => byId[id]).map((id) => <div key={id} className="it" onClick={() => ins(at, id)} {...hp(byId[id].desc)}><b>{byId[id].ru}</b>{byId[id].instant && <em>сразу</em>}</div>)}</div>
      ))}</div>}
    </div>
  );
  return (
    <div className="vk-steps">
      <Adder at={0} />
      {steps.map((st, i) => {
        const a = byId[st.do];
        const bad = issues.some((x) => x.step === i && x.sev === AI_ERR);
        return (
          <React.Fragment key={i}>
            <div className={'vk-step' + (bad ? ' bad' : '') + (a && a.instant ? ' inst' : '')}>
              <div className="sh"><span className="n">{i + 1}</span>
                <select value={st.do} onChange={(e) => onChange(steps.map((x, j) => (j === i ? { do: e.target.value } : x)))} {...hp(a ? a.desc : '')}>{acts.map((x) => <option key={x.id} value={x.id}>{x.ru}</option>)}</select>
                {a && a.instant && <em className="inst">сразу</em>}
                <span className="sum">{stepText(st, cat)}</span>
                <div className="grow" />
                <button className="c4-ib" onClick={() => mv(i, -1)} disabled={i === 0} title="Выше">↑</button>
                <button className="c4-ib" onClick={() => mv(i, 1)} disabled={i === steps.length - 1} title="Ниже">↓</button>
                <button className="c4-ib" onClick={() => { const n = [...steps]; n.splice(i + 1, 0, JSON.parse(JSON.stringify(st))); onChange(n); }} title="Копия"><I name="copy" size={11} /></button>
                <button className="c4-ib" onClick={() => onChange(steps.filter((_, j) => j !== i))} title="Удалить"><I name="close" size={11} /></button>
              </div>
              {a && a.params && a.params.length > 0 && <div className="sp">{a.params.map((p) => <StepField key={p.k} p={p} st={st} cat={cat} hp={hp} onChange={(v) => onChange(steps.map((x, j) => (j === i ? { ...x, [p.k]: v } : x)))} />)}</div>}
            </div>
            <Adder at={i + 1} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepField({ p, st, cat, hp, onChange }) {
  const v = st[p.k];
  const lbl = <label {...hp(p.hint || p.ru)}>{p.ru}</label>;
  switch (p.type) {
    case 'number': return <div className="sf">{lbl}<input className="c4-text num" value={v ?? p.def} onChange={(e) => onChange(Number(String(e.target.value).replace(',', '.')) || 0)} /></div>;
    case 'bool': return <div className="sf">{lbl}<input type="checkbox" checked={v === true || v === 'true'} onChange={(e) => onChange(e.target.checked)} /></div>;
    case 'item': return <div className="sf wide">{lbl}<input className="c4-text" list="vk-items" value={v ?? ''} placeholder="minecraft:…" onChange={(e) => onChange(e.target.value)} /></div>;
    case 'anim': return <div className="sf">{lbl}<select value={v || 'swing'} onChange={(e) => onChange(e.target.value)}>{(cat.anims || ['swing']).map((x) => <option key={x} value={x}>{({ swing: 'взмах рукой', nod: 'кивнуть', shake_head: 'покачать головой', happy: 'радость (искры)', angry: 'злость (тучка)', heart: 'сердечки', jump: 'подпрыгнуть', celebrate: 'праздновать' })[x] || x}</option>)}</select></div>;
    case 'goal': return <div className="sf wide">{lbl}<select value={v || 'IDLE'} onChange={(e) => onChange(e.target.value)}>{(cat.goals || []).map((g) => <option key={g.id} value={g.id}>{g.ru}</option>)}</select></div>;
    case 'place': return <div className="sf wide">{lbl}<PlaceField v={v} onChange={onChange} /></div>;
    default: {
      const list = p.k === 'id' ? 'vk-sounds' : p.k === 'name' && st.do === 'particles' ? 'vk-particles' : p.k === 'who' ? 'vk-entities' : undefined;
      return <div className={'sf' + (p.k === 'ru' || p.k === 'en' ? ' wide2' : ' wide')}>{lbl}<input className="c4-text" list={list} value={v ?? ''} placeholder={p.def || ''} onChange={(e) => onChange(e.target.value)} /></div>;
    }
  }
}

function PlaceField({ v, onChange }) {
  const kind = v == null || v === '' ? 'here' : Array.isArray(v) ? 'pos' : typeof v === 'string' ? (PLACE_PRESETS.some((x) => x[0] === v) ? v : 'here') : v.block ? 'block' : v.entity ? 'entity' : v.building ? 'building' : v.random ? 'random' : 'here';
  const setKind = (k) => {
    if (PLACE_PRESETS.some((x) => x[0] === k)) onChange(k);
    else if (k === 'pos') onChange([0, 64, 0]);
    else if (k === 'block') onChange({ block: '#minecraft:fences', radius: 12 });
    else if (k === 'entity') onChange({ entity: 'player', radius: 12 });
    else if (k === 'building') onChange({ building: 'farm' });
    else if (k === 'random') onChange({ random: 8 });
  };
  return (
    <span className="vk-place">
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {PLACE_PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        <option value="block">блок рядом…</option><option value="entity">существо рядом…</option><option value="building">постройка поселения…</option><option value="random">случайно рядом…</option><option value="pos">координаты…</option>
      </select>
      {kind === 'block' && <><input className="c4-text" list="vk-blocks" value={v.block} onChange={(e) => onChange({ ...v, block: e.target.value })} /><input className="c4-text num" value={v.radius ?? 12} onChange={(e) => onChange({ ...v, radius: Number(e.target.value) || 1 })} title="радиус поиска" /></>}
      {kind === 'entity' && <><input className="c4-text" list="vk-entities" value={v.entity} onChange={(e) => onChange({ ...v, entity: e.target.value })} /><input className="c4-text num" value={v.radius ?? 12} onChange={(e) => onChange({ ...v, radius: Number(e.target.value) || 1 })} title="радиус поиска" /></>}
      {kind === 'building' && <input className="c4-text" value={v.building} onChange={(e) => onChange({ building: e.target.value })} title="вид постройки: house, farm, store, forge, mine, tavern…" />}
      {kind === 'random' && <input className="c4-text num" value={v.random} onChange={(e) => onChange({ random: Number(e.target.value) || 1 })} title="радиус" />}
      {kind === 'pos' && [0, 1, 2].map((j) => <input key={j} className="c4-text num" value={v[j]} onChange={(e) => onChange(v.map((x, q) => (q === j ? Number(e.target.value) || 0 : x)))} />)}
      <span className="dim small">{placeText(v)}</span>
    </span>
  );
}
