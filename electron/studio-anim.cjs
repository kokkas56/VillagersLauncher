// «Анимации» Студии: файлы анимаций проекта (studio/projects/<id>/anims/<anim>.json) и их сборка для игроков.
// «Собрать» кладёт их в config/skinkokk/anims/ — SkinKokk на сервере читает эту папку и раздаёт всем клиентам
// (встроенные анимации живут в самом моде; анимация проекта с тем же id перекрывает встроенную).
const fs = require('fs');
const path = require('path');
const SP = require('./studio-projects.cjs');
const AC = require('./studio-anim-core.cjs');

module.exports = function setupStudioAnim({ handle, store }) {
  const gameDir = () => store.get().gameDir;
  const sroot = () => path.join(gameDir(), 'studio');
  function projId() {
    const id = SP.readCurrent(sroot());
    if (!id) throw new Error('Проект не открыт — открой или создай проект (Файл → Открыть проект)');
    return id;
  }
  const animDir = () => path.join(SP.projectDir(sroot(), projId()), 'anims');
  const outDir = () => path.join(gameDir(), 'config', 'skinkokk', 'anims');
  function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, file);
  }
  function readJson(file, def) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (_) { return def; }
  }
  const listJson = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort(); } catch (_) { return []; } };
  function checkId(id) {
    if (!AC.SAFE_ID.test(String(id || ''))) throw new Error('Имя анимации: только маленькие латинские буквы, цифры, _ . - (например my_wave)');
    return String(id);
  }

  // все анимации проекта: { dir, anims:[…] } (битые файлы — с пометкой _broken)
  handle('studio:animLoad', () => {
    const d = animDir();
    const anims = [];
    for (const f of listJson(d)) {
      const a = readJson(path.join(d, f), null);
      if (a && typeof a === 'object') anims.push(AC.normalizeAnim(a, f.slice(0, -5)));
      else anims.push({ ...AC.newAnim(f.slice(0, -5)), _broken: 'файл не читается' });
    }
    return { dir: d, anims };
  });
  handle('studio:animSave', (a) => {
    const id = checkId(a && a.id);
    writeJson(path.join(animDir(), id + '.json'), AC.cleanAnim(a));
    return true;
  });
  handle('studio:animDelete', (id) => {
    const f = path.join(animDir(), checkId(id) + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  });
  handle('studio:animRename', ({ from, to }) => {
    const a = path.join(animDir(), checkId(from) + '.json');
    const b = path.join(animDir(), checkId(to) + '.json');
    if (fs.existsSync(b)) throw new Error('Анимация «' + to + '» уже есть');
    const o = readJson(a, null);
    if (!o) throw new Error('Анимации «' + from + '» нет');
    o.id = to;
    writeJson(b, AC.cleanAnim(o));
    fs.unlinkSync(a);
    return true;
  });
  // персонаж автора (трек A пишет <игра>/skinkokk/character.json) и его скин — для предпросмотра
  handle('studio:animCharacter', () => {
    const dir = path.join(gameDir(), 'skinkokk');
    const ch = readJson(path.join(dir, 'character.json'), null);
    let skin = null, slim = false;
    try {
      const f = path.join(dir, 'skin.png');
      if (fs.existsSync(f)) skin = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
      const meta = readJson(path.join(dir, 'skin.json'), {});
      slim = meta.model === 'slim';
    } catch (_) {}
    return { character: ch, skin, slim };
  });

  // «Собрать»: проверка и копия в config/skinkokk/anims/. С ошибками не едут; что Студия клала раньше, а в проекте нет, — убрать.
  handle('studio:animBuild', () => {
    const d = animDir();
    const pid = projId();
    const issues = [];
    const known = new Set(AC.BUILTIN_IDS);
    const out = outDir();
    fs.mkdirSync(out, { recursive: true });
    const manFile = path.join(out, '.studio.json');
    const man = readJson(manFile, { files: [] });
    const wrote = [], skipped = [], overrides = [];
    for (const f of listJson(d)) {
      const raw = readJson(path.join(d, f), null);
      if (!raw) { issues.push({ sev: 'error', doc: 'anims/' + f, msg: 'Файл анимации не читается' }); skipped.push(f.slice(0, -5)); continue; }
      const a = AC.normalizeAnim(raw, f.slice(0, -5));
      const probs = AC.validateAnim(a, known);
      for (const p of probs) if (p.sev !== 'info') issues.push({ sev: p.sev, doc: 'anims/' + f, msg: p.msg });
      if (probs.some((p) => p.sev === AC.ANIM_ERR)) { skipped.push(a.id); continue; }
      if (known.has(a.id)) overrides.push(a.id);
      writeJson(path.join(out, a.id + '.json'), AC.cleanAnim(a));
      wrote.push(a.id + '.json');
    }
    let removed = 0;
    for (const f of man.files || []) if (!wrote.includes(f) && fs.existsSync(path.join(out, f))) { fs.unlinkSync(path.join(out, f)); removed++; }
    writeJson(manFile, { project: pid, files: wrote, built: new Date().toISOString() });
    return { ok: true, anims: wrote.length, overrides, skipped, removed, issues, dir: out };
  });
};
