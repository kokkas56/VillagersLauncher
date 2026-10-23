// «Анимации» Студии: делает electron/studio-anim-core.cjs из src/studio/anim/animCore.js + animLib.js (проверка и сборка
// анимаций при «Собрать» — тем же кодом, что и окно Студии) и кладёт встроенную библиотеку в мод SkinKokk:
// skinkokk/src/main/resources/assets/skinkokk/anims/<id>.json + index.json. В исходниках нет import.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', 'studio', 'anim', f), 'utf8');
const core = read('animCore.js'), lib = read('animLib.js');
for (const [n, s] of [['animCore.js', core], ['animLib.js', lib]]) if (/^\s*import\s/m.test(s)) throw new Error(n + ' не должен ничего импортировать');
const names = [...(core + '\n' + lib).matchAll(/^export (?:function|const|let) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
// export const A = 1, B = 2 — тоже
for (const m of (core + '\n' + lib).matchAll(/^export const [A-Za-z0-9_]+ = [^;]*?, ([A-Z_][A-Za-z0-9_]*) = /gm)) names.push(m[1]);
const strip = (s) => s.replace(/^export (function|const|let) /gm, '$1 ');
const out = '// АВТОГЕНЕРАЦИЯ из src/studio/anim/animCore.js и animLib.js (node scripts/sync-anims.cjs) — не править руками.\n\'use strict\';\n'
  + strip(core) + '\n' + strip(lib) + '\nmodule.exports = { ' + [...new Set(names)].join(', ') + ' };\n';
const dst = path.join(root, 'electron', 'studio-anim-core.cjs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) { fs.writeFileSync(dst, out); console.log('studio-anim-core.cjs обновлён'); }

// встроенные анимации → ресурсы SkinKokk
const M = require(dst);
const resDir = path.join(root, 'skinkokk', 'src', 'main', 'resources', 'assets', 'skinkokk', 'anims');
if (fs.existsSync(path.join(root, 'skinkokk'))) {
  fs.mkdirSync(resDir, { recursive: true });
  const index = [];
  let changed = 0;
  for (const a of M.ANIM_LIBRARY) {
    const probs = M.validateAnim(a).filter((p) => p.sev === M.ANIM_ERR);
    if (probs.length) throw new Error('встроенная анимация «' + a.id + '»: ' + probs.map((p) => p.msg).join('; '));
    const clean = M.cleanAnim(a);
    const text = JSON.stringify(clean, null, 1) + '\n';
    const f = path.join(resDir, a.id + '.json');
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== text) { fs.writeFileSync(f, text); changed++; }
    index.push(a.id);
  }
  for (const f of fs.readdirSync(resDir)) if (f.endsWith('.json') && f !== 'index.json' && !index.includes(f.slice(0, -5))) { fs.unlinkSync(path.join(resDir, f)); changed++; }
  const idx = JSON.stringify({ v: 1, anims: index }, null, 1) + '\n';
  const fi = path.join(resDir, 'index.json');
  if (!fs.existsSync(fi) || fs.readFileSync(fi, 'utf8') !== idx) { fs.writeFileSync(fi, idx); changed++; }
  if (changed) console.log('SkinKokk: встроенных анимаций ' + index.length + ' (обновлено файлов: ' + changed + ')');
}
