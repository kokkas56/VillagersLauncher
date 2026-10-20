// «Жители» (фаза 6, трек B): делает electron/studio-ai-validate.cjs из src/studio/villagers/aiValidate.js —
// одна проверка поведений, параметров и реплик и в окне Студии, и при «Собрать». В исходнике нет import.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'studio', 'villagers', 'aiValidate.js'), 'utf8');
if (/^\s*import\s/m.test(src)) throw new Error('aiValidate.js не должен ничего импортировать');
const names = [...src.matchAll(/^export (?:function|const|let) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
const out = '// АВТОГЕНЕРАЦИЯ из src/studio/villagers/aiValidate.js (node scripts/sync-ai.cjs) — не править руками.\n\'use strict\';\n'
  + src.replace(/^export (function|const|let) /gm, '$1 ') + '\nmodule.exports = { ' + names.join(', ') + ' };\n';
const dst = path.join(root, 'electron', 'studio-ai-validate.cjs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) { fs.writeFileSync(dst, out); console.log('studio-ai-validate.cjs обновлён'); }
// запасной каталог ИИ (действия, условия, параметры) — и для «Собрать», когда игра ни разу не была на связи
const catSrc = fs.readFileSync(path.join(root, 'src', 'studio', 'villagers', 'aiCatalog.json'), 'utf8');
const catDst = path.join(root, 'electron', 'studio-ai-catalog.json');
if (!fs.existsSync(catDst) || fs.readFileSync(catDst, 'utf8') !== catSrc) { fs.writeFileSync(catDst, catSrc); console.log('studio-ai-catalog.json обновлён'); }
