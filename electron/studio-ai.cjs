// «Жители» (фаза 6, трек B): файлы ИИ жителей в проекте Студии и их сборка для игроков.
// Проект: studio/projects/<id>/ai/ = params.json (веса и пороги: values, trades, tempers), scripts/<id>.json (поведения:
// дела и реакции), lines/*.json (реплики ru + en), catalog.json (последний каталог из игры — чтобы править без связи).
// «Собрать» кладёт их туда, где их читает Villagers, Kokk у всех игроков: config/villagerskokk/ai_params.json,
// config/villagerskokk/ai_scripts/<id>.json, config/villagerskokk/ai_lines/studio_<проект>.json.
const fs = require('fs');
const path = require('path');
const SP = require('./studio-projects.cjs');
const AV = require('./studio-ai-validate.cjs');

const SAFE = /^[a-z0-9_.-]{1,64}$/;

module.exports = function setupStudioAi({ handle, store }) {
  const gameDir = () => store.get().gameDir;
  const sroot = () => path.join(gameDir(), 'studio');
  function projId() {
    const id = SP.readCurrent(sroot());
    if (!id) throw new Error('Проект не открыт — открой или создай проект (Файл → Открыть проект)');
    return id;
  }
  const aiDir = () => path.join(SP.projectDir(sroot(), projId()), 'ai');
  const vkDir = () => path.join(gameDir(), 'config', 'villagerskokk');
  function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  }
  function readJson(file, def) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (_) { return def; }
  }
  function listJson(dir) {
    try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch (_) { return []; }
  }
  function checkId(id, what) {
    if (!SAFE.test(String(id || ''))) throw new Error('Имя ' + what + ': только маленькие латинские буквы, цифры, _ . - (например mend_fence)');
    return String(id);
  }

  // всё ИИ проекта разом: { params, scripts:[…], lines:{файл: данные}, catalog }
  handle('studio:aiLoad', () => {
    const d = aiDir();
    const scripts = [];
    for (const f of listJson(path.join(d, 'scripts'))) {
      const s = readJson(path.join(d, 'scripts', f), null);
      if (s && typeof s === 'object') { if (!s.id) s.id = f.slice(0, -5); scripts.push(s); } else scripts.push({ id: f.slice(0, -5), _broken: 'файл не читается', type: 'goal', steps: [] });
    }
    const lines = {};
    for (const f of listJson(path.join(d, 'lines'))) lines[f.slice(0, -5)] = readJson(path.join(d, 'lines', f), { lines: [] });
    return { dir: d, params: readJson(path.join(d, 'params.json'), { v: 1, values: {}, trades: {}, tempers: {} }), scripts, lines, catalog: readJson(path.join(d, 'catalog.json'), null) };
  });
  handle('studio:aiSaveParams', (p) => {
    const o = { v: 1, values: (p && p.values) || {}, trades: (p && p.trades) || {}, tempers: (p && p.tempers) || {} };
    writeJson(path.join(aiDir(), 'params.json'), o);
    return true;
  });
  handle('studio:aiSaveScript', (s) => {
    const id = checkId(s && s.id, 'поведения');
    writeJson(path.join(aiDir(), 'scripts', id + '.json'), AV.aiCleanScript(s));
    return true;
  });
  handle('studio:aiDeleteScript', (id) => {
    const f = path.join(aiDir(), 'scripts', checkId(id, 'поведения') + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  });
  handle('studio:aiRenameScript', ({ from, to }) => {
    const a = path.join(aiDir(), 'scripts', checkId(from, 'поведения') + '.json');
    const b = path.join(aiDir(), 'scripts', checkId(to, 'поведения') + '.json');
    if (fs.existsSync(b)) throw new Error('Поведение «' + to + '» уже есть');
    const s = readJson(a, null);
    if (!s) throw new Error('Поведения «' + from + '» нет');
    s.id = to;
    writeJson(b, s);
    fs.unlinkSync(a);
    return true;
  });
  handle('studio:aiSaveLines', ({ file, data }) => {
    const name = checkId(file || 'lines', 'файла реплик');
    writeJson(path.join(aiDir(), 'lines', name + '.json'), { v: 1, lines: (data && Array.isArray(data.lines) ? data.lines : []) });
    return true;
  });
  handle('studio:aiSaveCatalog', (cat) => {
    if (cat && typeof cat === 'object') writeJson(path.join(aiDir(), 'catalog.json'), { ...cat, saved: new Date().toISOString() });
    return true;
  });

  // «Собрать»: проверка и копия в config/villagerskokk/. Поведения с ошибками не едут (остальные — да).
  handle('studio:aiBuild', (opts) => {
    const cat = { ...readJson(path.join(__dirname, 'studio-ai-catalog.json'), {}), ...(readJson(path.join(aiDir(), 'catalog.json'), null) || {}), ...((opts && opts.cat) || {}) };
    const d = aiDir();
    const pid = projId();
    const issues = [];
    const params = readJson(path.join(d, 'params.json'), null);
    const scripts = [];
    for (const f of listJson(path.join(d, 'scripts'))) {
      const s = readJson(path.join(d, 'scripts', f), null);
      if (!s) { issues.push({ sev: AV.AI_ERR, doc: f, msg: 'Файл поведения не читается' }); continue; }
      if (!s.id) s.id = f.slice(0, -5);
      scripts.push(s);
    }
    const sIssues = AV.aiValidateScripts(scripts, cat);
    issues.push(...sIssues.map((x) => ({ ...x, kind: 'ai' })));
    const bad = new Set(sIssues.filter((x) => x.sev === AV.AI_ERR).map((x) => x.doc));
    const out = vkDir();
    let nParams = 0;
    if (params && (Object.keys(params.values || {}).length || Object.keys(params.trades || {}).length || Object.keys(params.tempers || {}).length)) {
      issues.push(...AV.aiValidateParams(params, cat).map((x) => ({ ...x, kind: 'ai', doc: 'ai/params.json' })));
      writeJson(path.join(out, 'ai_params.json'), { v: 1, project: pid, values: params.values || {}, trades: params.trades || {}, tempers: params.tempers || {} });
      nParams = Object.keys(params.values || {}).length + Object.values(params.trades || {}).reduce((a, x) => a + Object.keys(x || {}).length, 0) + Object.values(params.tempers || {}).reduce((a, x) => a + Object.keys(x || {}).length, 0);
    }
    // поведения: что Студия клала раньше, но в проекте больше нет — убрать (чужие файлы не трогаем)
    const sOut = path.join(out, 'ai_scripts');
    fs.mkdirSync(sOut, { recursive: true });
    const manFile = path.join(sOut, '.studio.json');
    const man = readJson(manFile, { files: [] });
    const wrote = [];
    for (const s of scripts) {
      if (bad.has(s.id)) continue;
      writeJson(path.join(sOut, s.id + '.json'), AV.aiCleanScript(s));
      wrote.push(s.id + '.json');
    }
    let removed = 0;
    for (const f of man.files || []) if (!wrote.includes(f) && fs.existsSync(path.join(sOut, f))) { fs.unlinkSync(path.join(sOut, f)); removed++; }
    writeJson(manFile, { project: pid, files: wrote, built: new Date().toISOString() });
    // реплики: все файлы проекта одним файлом
    const all = [];
    for (const f of listJson(path.join(d, 'lines'))) {
      const l = readJson(path.join(d, 'lines', f), null);
      if (!l) { issues.push({ sev: AV.AI_ERR, kind: 'ai', doc: 'ai/lines/' + f, msg: 'Файл реплик не читается' }); continue; }
      issues.push(...AV.aiValidateLines(l).map((x) => ({ ...x, kind: 'ai', doc: 'ai/lines/' + f })));
      for (const x of l.lines || []) all.push(x);
    }
    const lOut = path.join(out, 'ai_lines', 'studio_' + pid + '.json');
    if (all.length) writeJson(lOut, { v: 1, project: pid, lines: all });
    else if (fs.existsSync(lOut)) fs.unlinkSync(lOut);
    return { ok: true, params: nParams, scripts: wrote.length, skipped: [...bad], lines: all.length, removed, issues, dir: out };
  });
};
