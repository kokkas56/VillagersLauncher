// Правая колонка: свойства выбранного события / ключа / актёра, а если ничего не выбрано — настройки сцены.
import React from 'react';
import Icon from '../components/Icon.jsx';
import { TRACKS, VERB_DEFS, ACTOR_FIELDS, SCENE_FIELDS, actorName } from './schema.js';
import { getItem, getPath, kindOfKey, fmtTicks } from './model.js';
import { Field } from './fields.jsx';

export default function Inspector({ scene, sel, actorSel, project, api, hp, onEvent, onEventMany, onActor, onScene, onDelete, onDuplicate, onRemoveActor, issues, dialogs }) {
  const ctx = { hp, api, actors: scene.actors, projActors: (project && project.actors) || [], dialogs: dialogs || [] };
  const myIssues = (match) => issues.filter(match);
  const IssueList = ({ list }) => list.length ? (
    <div className="st-issues-mini">
      {list.slice(0, 4).map((x, i) => <div key={i} className={'st-iss ' + (x.sev === 'ошибка' ? 'e' : 'w')}>{x.msg}</div>)}
    </div>
  ) : null;

  const ev = getItem(scene, sel);
  if (sel && ev) {
    const kind = kindOfKey(sel.track);
    const verb = kind === 'camera' ? 'key' : kind === 'subtitles' ? 'line' : ev.do;
    const vd = (VERB_DEFS[kind] || {})[verb];
    const track = kind === 'actor' ? 'Актёр «' + actorName(scene.actors, sel.track.slice(6)) + '»' : TRACKS[kind].label;
    const list = myIssues((x) => x.sel && x.sel.track === sel.track && x.sel.i === sel.i);
    const camView = (v) => onEventMany({ pos: v.pos.map((n) => Math.round(n * 100) / 100), yaw: Math.round(v.yaw * 10) / 10, pitch: Math.round(v.pitch * 10) / 10, ...(v.fov ? { fov: Math.round(v.fov) } : {}) });
    return (
      <div className="st-insp">
        <div className="st-insp-head" {...hp(vd ? vd.hint : '')}>
          <span className="tl-dot" style={{ background: TRACKS[kind].color }} />
          <div className="grow">
            <b>{vd ? vd.label : verb}</b>
            <div className="muted small">{track} · {fmtTicks(ev.t || 0)}</div>
          </div>
          <button className="btn sm ghost icon-btn" title="Копия события чуть позже (Ctrl+D)" onClick={onDuplicate}><Icon name="copy" size={12} /></button>
          <button className="btn sm danger icon-btn" title="Удалить (Delete)" onClick={onDelete}><Icon name="trash" size={12} /></button>
        </div>
        {vd && <p className="st-insp-hint">{vd.hint}</p>}
        <IssueList list={list} />
        {kind === 'camera' && (
          <div className="st-btns">
            <button className="btn sm primary" disabled={!api.connected} onClick={async () => { try { camView(await api.getView()); } catch (e) { api.toast(e.message, 'error'); } }} {...hp('Записать в этот ключ место и взгляд твоего персонажа в игре. То же самое — F8 в игре (создаёт новый ключ в месте бегунка).')}>
              <Icon name="download" size={11} /> Взять вид из игры
            </button>
            <button className="btn sm ghost" disabled={!api.connected || !Array.isArray(ev.pos)} onClick={() => api.tp({ pos: ev.pos, yaw: ev.yaw || 0, pitch: ev.pitch || 0 })} {...hp('Встать в игре точно туда, где этот ключ, и посмотреть так же — удобно поправить кадр и снова «Взять вид из игры».')}>
              <Icon name="rocket" size={11} /> Встать в кадр
            </button>
          </div>
        )}
        <div className="st-fields">
          {(vd ? vd.fields : []).map((f) => (
            <Field key={f.k} f={f} value={ev[f.k]} ctx={kind === 'camera' && f.k === 'pos' ? { ...ctx, onView: camView } : ctx} onChange={(v) => onEvent(f.k, v)} />
          ))}
        </div>
      </div>
    );
  }

  if (actorSel != null && scene.actors[actorSel]) {
    const a = scene.actors[actorSel];
    const list = myIssues((x) => x.sel && x.sel.actor === actorSel);
    return (
      <div className="st-insp">
        <div className="st-insp-head" {...hp(TRACKS.actor.hint)}>
          <span className="tl-dot" style={{ background: TRACKS.actor.color }} />
          <div className="grow"><b>{a.name || a.id}</b><div className="muted small">актёр сцены</div></div>
          <button className="btn sm danger icon-btn" title="Убрать актёра из сцены" onClick={onRemoveActor}><Icon name="trash" size={12} /></button>
        </div>
        <p className="st-insp-hint">Кто играет роль и где стоит в начале. Его действия — на его дорожке таймлайна.</p>
        <IssueList list={list} />
        <div className="st-fields">
          {ACTOR_FIELDS.filter((f) => !f.when || f.when(a)).map((f) => (
            <Field key={f.k} f={f} value={getPath(a, f.k)} ctx={ctx} onChange={(v) => onActor(f.k, v)} />
          ))}
        </div>
      </div>
    );
  }

  const list = myIssues((x) => !x.sel);
  return (
    <div className="st-insp">
      <div className="st-insp-head" {...hp('Общие настройки сцены. Щёлкни по событию или актёру на таймлайне — здесь появятся его свойства.')}>
        <Icon name="gear" size={16} />
        <div className="grow"><b>Сцена</b><div className="muted small mono">{scene.id}.json</div></div>
      </div>
      <p className="st-insp-hint">Ничего не выбрано — это настройки всей сцены. Выбери событие на таймлайне, чтобы править его.</p>
      <IssueList list={list} />
      <div className="st-fields">
        {SCENE_FIELDS.filter((f) => !f.when || f.when(scene)).map((f) => (
          <Field key={f.k} f={f} value={getPath(scene, f.k)} ctx={ctx} onChange={(v) => onScene(f.k, v)} />
        ))}
      </div>
    </div>
  );
}
