// Делает electron/studio-validate.cjs из src/studio/validate.js (одна логика проверки сцен в окне и при сборке).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'studio', 'validate.js'), 'utf8');
if (/^\s*import\s/m.test(src)) throw new Error('src/studio/validate.js не должен ничего импортировать');
const names = [...src.matchAll(/^export (?:function|const|let) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
const body = src.replace(/^export (function|const|let) /gm, '$1 ');
const out = '// АВТОГЕНЕРАЦИЯ из src/studio/validate.js (node scripts/sync-studio.cjs) — не править руками.\n\'use strict\';\n' +
  body + '\nmodule.exports = { ' + names.join(', ') + ' };\n';
const dst = path.join(root, 'electron', 'studio-validate.cjs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) { fs.writeFileSync(dst, out); console.log('studio-validate.cjs обновлён'); }
