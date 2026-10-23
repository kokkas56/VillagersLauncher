// Делает electron/cosmetics.cjs из src/games/cosmetics.js и src/games/rewards.js — одни и те же награды, рамки, темы,
// фоны лобби и условия открытия и в окне лаунчера, и в главном процессе (друзья, отряд, связь с игрой).
// Из rewards.js выкидываются import и реэкспорты (`export { … } from`, `export { … };`) — всё нужное уже объявлено выше.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['cosmetics.js', 'rewards.js'];
const all = [];
let out = '// АВТОГЕНЕРАЦИЯ из src/games/' + FILES.join(', ') + ' (node scripts/sync-cosmetics.cjs) — не править руками.\n\'use strict\';\n';
for (const f of FILES) {
  let src = fs.readFileSync(path.join(root, 'src', 'games', f), 'utf8');
  src = src.replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/cosmetics\.js';\s*$/gm, '');
  src = src.replace(/^export\s*\{[^}]*\}\s*from\s*'[^']+';\s*$/gm, '');
  src = src.replace(/^export\s*\{[^}]*\};\s*$/gm, '');
  if (/^\s*import\s/m.test(src)) throw new Error('src/games/' + f + ': лишний import');
  const names = [...src.matchAll(/^export (?:function|const|let) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  for (const n of names) if (all.includes(n)) throw new Error('имя «' + n + '» экспортируется дважды (' + f + ')');
  all.push(...names);
  out += '\n// ===== ' + f + ' =====\n' + src.replace(/^export (function|const|let) /gm, '$1 ') + '\n';
}
out += '\nmodule.exports = { ' + all.join(', ') + ' };\n';
const dst = path.join(root, 'electron', 'cosmetics.cjs');
if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== out) { fs.writeFileSync(dst, out); console.log('cosmetics.cjs обновлён'); }
