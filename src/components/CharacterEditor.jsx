import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { call } from '../lib/api.js';
import Icon from './Icon.jsx';
import SkinPreview from './SkinPreview.jsx';
import { Toggle } from './ui.jsx';
import {
  CATALOG, PATTERNS, PATTERN_HINTS, DEFAULT_CHARACTER, TEMPLATES, cleanCharacter, getPart, setPart, updatePart, hasSprings,
  randomCharacter, fromTemplate, patternSwatch, partDef
} from '../lib/characterRig.js';

// Вкладка «Персонаж» на странице «Скины»: пол, телосложение, руки, грудь, уши/хвост/причёска/одежда с цветами и
// узорами, физика. Сохраняется для текущего аккаунта и сразу пишется в <папка игры>/skinkokk/character.json —
// мод SkinKokk подхватит его в запущенной игре и покажет всем игрокам; друзья видят его в профиле и в лобби.

const PALETTE = ['#1e1e22', '#2e2a2c', '#5a3a22', '#7a4a2a', '#b35a20', '#d5762a', '#e8b07a', '#e8d27a', '#f4efe8', '#c9c4bc', '#7c7a78',
  '#b0303a', '#e0607a', '#f08cb0', '#7a3a8a', '#2c3a6a', '#3a5aa0', '#8fd0ff', '#2f5a3a', '#4f8a3a', '#55aa55', '#e9bc61', '#6b4a30', '#3d7a3a'];

function ColorDot({ value, onChange, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span className="ch-color" ref={ref}>
      <button type="button" className="ch-dot" title={title} style={{ background: value }} onClick={() => setOpen(!open)} />
      {open && (
        <span className="ch-pop">
          <span className="ch-pal">{PALETTE.map((c) => <button type="button" key={c} className={'ch-sw' + (c === value ? ' on' : '')} style={{ background: c }} onClick={() => { onChange(c); setOpen(false); }} />)}</span>
          <label className="ch-custom">Свой цвет <input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>
        </span>
      )}
    </span>
  );
}

/** Цветовой шаблон части: основной цвет + узор + цвет узора (как редактор флагов). */
function ColorTemplate({ c, style, onChange, t }) {
  return (
    <div className="ch-tpl">
      <span className="ch-lbl">{t('Цвет')}</span>
      <ColorDot value={c.b} title={t('Основной цвет')} onChange={(b) => onChange({ b })} />
      <span className="ch-pats">
        {PATTERNS.map((p) => (
          <button type="button" key={p} className={'ch-pat' + (c.p === p ? ' on' : '')} title={t(CATALOG.patterns[p]) + ' — ' + t(PATTERN_HINTS[p])} onClick={() => onChange({ p })}>
            <img src={patternSwatch({ ...c, p }, style)} alt="" />
          </button>
        ))}
      </span>
      <span className="ch-lbl">{t('Узор')}</span>
      <ColorDot value={c.pc} title={t('Цвет узора')} onChange={(pc) => onChange({ pc })} />
    </div>
  );
}

function Slider({ label, hint, value, min = 0, max = 1, step = 0.01, fmt = (v) => Math.round(v * 100) + '%', onChange }) {
  return (
    <label className="ch-slider" title={hint}>
      <span className="ch-sl-top"><span>{label}</span><b>{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Выбор одной части вида (уши, хвост, причёска): «Нет» + варианты, ниже — цвета и физика выбранной. */
function KindPicker({ kind, ch, set, t }) {
  const info = CATALOG.kinds[kind];
  const cur = getPart(ch, kind);
  const items = Object.entries(CATALOG.parts[kind]);
  return (
    <section className="card ch-card">
      <div className="card-head"><Icon name={kind === 'hair' ? 'brush' : kind === 'tail' ? 'star' : 'heart'} /><h3>{t(info.name)}</h3><div className="grow" /><span className="muted small">{t(info.hint)}</span></div>
      <div className="ch-chips">
        <button type="button" className={'chip' + (!cur ? ' on' : '')} onClick={() => set(setPart(ch, kind, null))}>{t('Нет')}</button>
        {items.map(([id, d]) => (
          <button type="button" key={id} className={'chip' + (cur && cur.id === id ? ' on' : '')} title={t(d.hint)} onClick={() => set(setPart(ch, kind, id))}>
            <img className="ch-chip-sw" src={patternSwatch(cur && cur.id === id ? cur.c : d.def, d.style, 6, 2)} alt="" />{t(d.name)}
          </button>
        ))}
      </div>
      {cur && (
        <div className="ch-sub">
          <ColorTemplate c={cur.c} style={partDef(kind, cur.id).style} t={t} onChange={(c) => set(updatePart(ch, kind, cur.id, { c }))} />
          {hasSprings(kind, cur.id) && <Slider label={t('Физика')} hint={t('Насколько часть качается и отстаёт при движении. 0 — неподвижная.')} value={cur.phys} onChange={(v) => set(updatePart(ch, kind, cur.id, { phys: v }))} />}
        </div>
      )}
    </section>
  );
}

export default function CharacterEditor({ skin, slim, fallback, account }) {
  const { t, toast } = useApp();
  const [ch, setCh] = useState(null);
  const [presets, setPresets] = useState([]);
  const [walk, setWalk] = useState(false);
  const [rotate, setRotate] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [saved, setSaved] = useState(true);
  const handle = useRef(null);
  const timer = useRef(null);

  const load = async () => {
    try {
      const r = await call('character:get');
      setCh(cleanCharacter(r && r.char ? r.char : { ...DEFAULT_CHARACTER }));
      setPresets((r && r.presets) || []);
    } catch (_) { setCh(cleanCharacter({ ...DEFAULT_CHARACTER })); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [account && account.id]);

  // правки сохраняются сами (через полсекунды): в лаунчер и в файл для игры
  const set = (next) => {
    const c = cleanCharacter(next);
    setCh(c);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await call('character:set', c); setSaved(true); } catch (e) { toast(e.message, 'error'); }
    }, 500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const clothes = useMemo(() => Object.entries(CATALOG.parts.clothes), []);
  if (!ch) return <p className="muted">{t('Загружаю персонажа…')}</p>;

  const female = ch.gender === 'female';
  const shownSlim = ch.arms === 'slim' ? true : ch.arms === 'wide' ? false : !!slim;
  const savePreset = async () => {
    const name = presetName.trim() || t('Персонаж') + ' ' + (presets.length + 1);
    try { setPresets(await call('character:presetSave', { name, char: ch })); setPresetName(''); toast(t('Пресет сохранён'), 'ok'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="skins-layout ch-layout">
      <section className="card skin-stage ch-stage">
        <SkinPreview skin={skin || fallback} slim={shownSlim} width={320} height={440} rotate={rotate} walk={walk} zoom={0.78}
          nameTag={account ? account.name : null} character={ch.on ? ch : null} onCharacter={(h) => { handle.current = h; }} />
        <div className="ch-stage-btns">
          <button type="button" className={'btn sm' + (walk ? ' primary' : '')} onClick={() => setWalk(!walk)}>{walk ? t('Идёт') : t('Стоит')}</button>
          <button type="button" className="btn sm" title={t('Проверить физику: персонаж подпрыгнет')} onClick={() => handle.current && handle.current.kick()}>{t('Встряхнуть')}</button>
          <button type="button" className={'btn sm' + (rotate ? ' primary' : '')} onClick={() => setRotate(!rotate)}><Icon name="refresh" size={12} /></button>
        </div>
        <div className="skin-stage-info">
          <Toggle checked={ch.on} onChange={(v) => set({ ...ch, on: v })} label={t('Персонаж включён')}
            hint={t('В игре (мод SkinKokk) его увидят все игроки сервера. Выключи — останется обычный скин.')} />
          <div className="pill-row">
            {saved ? <span className="pill green"><Icon name="check" size={12} /> {t('Сохранено — в игре сменится само')}</span> : <span className="pill">{t('Сохраняю…')}</span>}
          </div>
          <div className="row wrap">
            <button type="button" className="btn sm" onClick={() => set({ ...randomCharacter(), on: true })} title={t('Собрать случайного персонажа')}><Icon name="star" size={12} /> {t('Случайный')}</button>
            <button type="button" className="btn sm ghost" onClick={() => set({ ...DEFAULT_CHARACTER, on: ch.on })} title={t('Убрать все части и вернуть обычное телосложение')}><Icon name="undo" size={12} /> {t('Сбросить')}</button>
          </div>
        </div>
      </section>

      <div className="skins-right ch-right">
        <section className="card ch-card">
          <div className="card-head"><Icon name="template" /><h3>{t('Шаблоны')}</h3><div className="grow" /><span className="muted small">{t('Готовые персонажи — потом всё можно поменять')}</span></div>
          <div className="ch-chips">
            {TEMPLATES.map((tp) => <button type="button" key={tp.id} className="chip" onClick={() => set({ ...fromTemplate(tp), on: true })}>{t(tp.name)}</button>)}
          </div>
          <div className="ch-presets">
            <span className="ch-lbl">{t('Мои пресеты')}</span>
            {presets.length === 0 && <span className="muted small">{t('Пока пусто — сохрани текущего персонажа')}</span>}
            {presets.map((p) => (
              <span key={p.id} className="ch-preset">
                <button type="button" className="chip" onClick={() => set({ ...cleanCharacter(p.char), on: true })} title={t('Надеть этот пресет')}>{p.name}</button>
                <button type="button" className="btn icon-btn sm danger" title={t('Удалить пресет')} onClick={async () => setPresets(await call('character:presetRemove', p.id))}><Icon name="trash" size={10} /></button>
              </span>
            ))}
            <span className="grow" />
            <input className="ch-input" placeholder={t('Имя пресета')} value={presetName} maxLength={32} onChange={(e) => setPresetName(e.target.value)} />
            <button type="button" className="btn sm" onClick={savePreset}><Icon name="save" size={12} /> {t('Сохранить')}</button>
          </div>
        </section>

        <section className="card ch-card">
          <div className="card-head"><Icon name="user" /><h3>{t('Тело')}</h3><div className="grow" /><span className="muted small">{t('Только вид: хитбокс в игре не меняется')}</span></div>
          <div className="ch-grid">
            <span className="ch-lbl">{t('Пол')}</span>
            <div className="seg sm">
              <button type="button" className={!female ? 'on' : ''} onClick={() => set({ ...ch, gender: 'male' })}>{t('Мужской')}</button>
              <button type="button" className={female ? 'on' : ''} onClick={() => set({ ...ch, gender: 'female', arms: ch.arms === 'auto' ? 'slim' : ch.arms })}>{t('Женский')}</button>
            </div>
            <span className="ch-lbl">{t('Телосложение')}</span>
            <div className="ch-chips">
              {Object.entries(CATALOG.bodies).map(([id, b]) => <button type="button" key={id} className={'chip' + (ch.body === id ? ' on' : '')} title={t(b.hint)} onClick={() => set({ ...ch, body: id })}>{t(b.name)}</button>)}
            </div>
            <span className="ch-lbl">{t('Руки')}</span>
            <div className="seg sm" title={t('Тонкие руки — как у Алекс (3 пикселя). Скин лучше рисовать под выбранную ширину.')}>
              <button type="button" className={ch.arms === 'auto' ? 'on' : ''} onClick={() => set({ ...ch, arms: 'auto' })}>{t('Как в скине')}</button>
              <button type="button" className={ch.arms === 'slim' ? 'on' : ''} onClick={() => set({ ...ch, arms: 'slim' })}>{t('Тонкие 3 px')}</button>
              <button type="button" className={ch.arms === 'wide' ? 'on' : ''} onClick={() => set({ ...ch, arms: 'wide' })}>{t('Обычные 4 px')}</button>
            </div>
          </div>
          <Slider label={t('Рост')} hint={t('Чуть ниже или выше (вместе с телосложением). Хитбокс тот же.')} value={ch.height} min={0.9} max={1.08} step={0.01} onChange={(v) => set({ ...ch, height: v })} />
          {female && <p className="muted small ch-note">{t('Женская фигура: чуть уже плечи и талия, руки ближе к телу.')}</p>}
        </section>

        {female && (
          <section className="card ch-card">
            <div className="card-head"><Icon name="heart" /><h3>{t('Грудь')}</h3><div className="grow" /><span className="muted small">{t(CATALOG.chest.hint)}</span></div>
            <Slider label={t('Размер')} hint={t('0 — плоская (не рисуется).')} value={ch.chest.size} onChange={(v) => set({ ...ch, chest: { ...ch.chest, size: v } })} />
            <Slider label={t('Физика')} hint={t('Покачивание при ходьбе и прыжках. 0 — неподвижная.')} value={ch.chest.phys} onChange={(v) => set({ ...ch, chest: { ...ch.chest, phys: v } })} />
            <p className="muted small ch-note">{t('Под нагрудником грудь повторяет броню. Каждый игрок может у себя выключить грудь и физику у других (настройки мода SkinKokk → Персонаж).')}</p>
          </section>
        )}

        <KindPicker kind="ears" ch={ch} set={set} t={t} />
        <KindPicker kind="tail" ch={ch} set={set} t={t} />
        <KindPicker kind="hair" ch={ch} set={set} t={t} />

        <section className="card ch-card">
          <div className="card-head"><Icon name="cape" /><h3>{t('Одежда')}</h3><div className="grow" /><span className="muted small">{t(CATALOG.kinds.clothes.hint)}</span></div>
          <div className="ch-chips">
            {clothes.map(([id, d]) => {
              const on = getPart(ch, 'clothes', id);
              return (
                <button type="button" key={id} className={'chip' + (on ? ' on' : '')} title={t(d.hint)} onClick={() => set(setPart(ch, 'clothes', id))}>
                  <img className="ch-chip-sw" src={patternSwatch(on ? on.c : d.def, d.style, 6, 2)} alt="" />{t(d.name)}
                </button>
              );
            })}
          </div>
          {ch.parts.filter((p) => p.k === 'clothes').map((p) => (
            <div key={p.id} className="ch-sub">
              <b className="ch-sub-name">{t(partDef('clothes', p.id).name)}</b>
              <ColorTemplate c={p.c} style={partDef('clothes', p.id).style} t={t} onChange={(c) => set(updatePart(ch, 'clothes', p.id, { c }))} />
              {hasSprings('clothes', p.id) && <Slider label={t('Физика')} value={p.phys} onChange={(v) => set(updatePart(ch, 'clothes', p.id, { phys: v }))} />}
            </div>
          ))}
        </section>

        <section className="card ch-card">
          <div className="card-head"><Icon name="gear" /><h3>{t('Физика')}</h3></div>
          <Slider label={t('Общая сила физики')} hint={t('Множитель для всех частей твоего персонажа: хвост, волосы, плащ, грудь. 0 — всё неподвижно.')} value={ch.phys} onChange={(v) => set({ ...ch, phys: v })} />
          <p className="muted small ch-note">{t('В игре у каждого свои настройки (мод SkinKokk → Персонаж): показывать ли части, грудь и физику у других, сила физики, прятать ли уши и волосы под шлемом.')}</p>
        </section>
      </div>
    </div>
  );
}
