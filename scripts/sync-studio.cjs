// Делает electron/studio-validate.cjs из src/studio/{mograph,scene3d,validate}.js
// (одна логика проверки и сборки сцен в окне и при «Собрать»). Каждый файл — в своей области видимости,
// наружу выходят только export-имена; import разрешён лишь между этими файлами.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['mograph.js', 'scene3d.js', 'validate.js'];
const all = [];
let out = '// АВТОГЕНЕРАЦИЯ из src/studio/' + FILES.join(', ') + ' (node scripts/sync-studio.cjs) — не править руками.\n\'use strict\';\n';
for (const f of FILES) {
  let src = fs.readFileSync(path.join(root, 'src', 'studio', f), 'utf8');
  src = src.replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/([a-z0-9]+\.js)';\s*$/gm, (m, dep) => {
    if (!FILES.includes(dep) || FILES.indexOf(dep) >= FILES.indexOf(f)) throw new Error(f + ': импорт из ' + dep + ' не поддерживается');
    return '';
  });
  if (/^\s*import\s/m.test(src)) throw new Error('src/studio/' + f + ' импортирует что-то кроме ' + FILES.join(', '));
  const names = [...src.matchAll(/^export (?:function|const|let) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  for (const n of names) if (all.includes(n)) throw new Error('имя «' + n + '» экспортируется дважды (' + f + ')');
  all.push(...names);
  const body = src.replace(/^export (function|const|let) /gm, '$1 ');
  const mod = '__' + f.replace('.js', '');
  out += '\n// ===== ' + f + ' =====\nconst ' + mod + ' = (function () {\n' + body + '\nreturn { ' + names.join(', ') + ' };\n})();\nconst { ' + names.join(', ') + ' } = ' + mod + ';\n';
}
out += '\nmodule.exports = { ' + all.join(', ') + ' };\n';
const dst = path.join(root, 'electron', 'studio-validate.cjs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) { fs.writeFileSync(dst, out); console.log('studio-validate.cjs обновлён'); }
