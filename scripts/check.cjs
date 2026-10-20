// Быстрая проверка синтаксиса файлов главного процесса.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('./sync-studio.cjs'); // общая проверка сцен Студии → electron/studio-validate.cjs
require('./sync-ai.cjs'); // «Жители»: проверка ИИ жителей → electron/studio-ai-validate.cjs
const dir = path.join(__dirname, '..', 'electron');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.cjs'))) {
  execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'inherit' });
}
console.log('electron sources OK');
