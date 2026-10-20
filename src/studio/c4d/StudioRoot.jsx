// Точка входа окон Студии: #studio — главное окно, #studio-pop=<вкладка> — отдельное окно редактора.
import React, { useEffect, useState } from 'react';
import { call, on } from '../../lib/api.js';
import { Toasts } from '../../components/ui.jsx';
import StudioApp, { TitleBar, LAYOUTS } from './StudioApp.jsx';
import { useStudioCore, StudioProvider } from './core.jsx';
import { Datalists } from '../fields.jsx';
import DialogTab from '../DialogTab.jsx';
import QuestTab from '../QuestTab.jsx';
import VarsTab from '../VarsTab.jsx';
import SchemeTab from '../SchemeTab.jsx';
import { LinkCard, ProjectActors } from '../../pages/Studio.jsx';
import './c4d.css';
import '../studio.css';

export function isStudioHash(h) { return /^#studio(\b|-pop=|$)/.test(h || ''); }

export default function StudioRoot() {
  const m = /^#studio-pop=([a-z]+)/.exec(window.location.hash || '');
  if (m) return <PopOut tab={m[1]} />;
  return <StudioApp />;
}

// отдельное окно: Диалоги / Задания / Переменные / Схемы
function PopOut({ tab }) {
  const core = useStudioCore({ withScene: false, who: 'pop-' + tab });
  const [max, setMax] = useState(false);
  const [goto] = useState(null);
  useEffect(() => on('win-state', (s) => setMax(!!s.maximized)), []);
  const label = (LAYOUTS.find((l) => l[0] === tab) || [tab, tab])[1];
  useEffect(() => { document.body.classList.add('c4d-body'); document.title = 'Студия Кокка — ' + label; }, [label]);
  const { hp, toast } = core;
  const shared = {
    tabs: <span className="dim" style={{ padding: '0 6px' }}>{label}</span>,
    linkCard: <LinkCard link={core.link} boot={core.boot || {}} setBoot={core.setBoot} hp={hp} toast={toast} setLink={core.setLink} />,
    hintBox: <div className="st-card" style={{ minHeight: 70 }}><b style={{ fontSize: 12 }}>Подсказка</b><div className="muted small" style={{ lineHeight: 1.45 }}>{core.hint}</div></div>,
    buildBtn: <button className="btn sm" onClick={async () => { try { await core.flush(); const r = await call('studio:build'); toast(r.ok ? 'Собрано: сцен ' + r.count + ', диалогов ' + r.dialogs + ', заданий ' + r.quests + ', схем ' + (r.schemes || 0) + ', построек ' + (r.structures || 0) : 'Не собрано: ошибок ' + r.errors, r.ok ? 'ok' : 'error', 6000); } catch (e) { toast(e.message, 'error'); } }}>Собрать</button>,
    actorsCard: <ProjectActors project={core.project} save={core.saveProject} hp={hp} toast={toast} sceneIds={null} addToScene={() => {}} />,
    toast, hp, api: core.api, link: core.link, project: core.project, saveProject: core.saveProject,
    lists: { scenes: core.list, dialogs: core.dialogs, quests: core.quests, schemes: core.schemes, structures: core.structures }, reloadList: core.reloadAny, patchList: core.patchList, baseRefs: core.baseRefs,
    addLog: core.addLog, gameVars: core.gameVars, setGameVars: core.setGameVars, setGameVarsState: core.setGameVarsState, questStates: core.questStates,
    openDoc: () => call('studio:focusMain')
  };
  return (
    <StudioProvider value={core}>
      <div className="c4d">
        <Datalists />
        <datalist id="sl-vars">{(core.project.vars || []).map((v) => <option key={v.name} value={v.name} />)}</datalist>
        <TitleBar max={max} title={'Студия Кокка — ' + label} />
        {core.bootErr ? <div className="c4-soon"><div className="c4-soon-card"><h3>Не открылось</h3><p>{core.bootErr}</p></div></div>
          : !core.boot ? <div className="c4-soon"><span className="dim">Открываю…</span></div>
          : !core.boot.project ? <div className="c4-soon"><div className="c4-soon-card"><h3>Проект не открыт</h3><p>Открой или создай проект в главном окне Студии (Файл → Открыть проект).</p></div></div>
            : (
                <div className="c4-docwrap">
                  <div className="studio" style={{ flex: 1 }}>
                    {tab === 'dialogs' && <DialogTab shared={shared} goto={goto} />}
                    {tab === 'quests' && <QuestTab shared={shared} goto={goto} />}
                    {tab === 'vars' && <VarsTab shared={shared} goto={goto} />}
                    {tab === 'schemes' && <SchemeTab shared={shared} goto={goto} />}
                  </div>
                </div>
              )}
        <div className="c4-status"><span className="hint">{core.hint}</span><span className="seg2"><span className={'c4-led ' + (core.link.connected ? 'on' : 'bad')} />{core.link.connected ? 'связь есть' : 'нет связи'}</span></div>
        <Toasts />
      </div>
    </StudioProvider>
  );
}
