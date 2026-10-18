// Свой экран загрузки MineVillagers: провайдер раннего окна NeoForge (villagers-earlywindow.jar)
// + тёмный фон загрузки Minecraft. Всё включается/выключается настройкой customSplash.
const fs = require('fs');
const path = require('path');

const VERSION = '1.0.0';
const JAR = `villagers-earlywindow-${VERSION}.jar`;
const PROVIDER = 'villagersearly';
const STOCK = 'fmlearlywindow';

/** Кладёт jar провайдера в библиотеки лаунчера и возвращает путь к нему. */
function ensureJar(libDir) {
  const src = fs.readFileSync(path.join(__dirname, 'assets', JAR)); // читается и из asar
  const dst = path.join(libDir, 'ru', 'kokk', 'villagers-earlywindow', VERSION, JAR);
  let same = false;
  try { same = fs.readFileSync(dst).equals(src); } catch (_) { /* нет файла */ }
  if (!same) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, src);
  }
  return dst;
}

/** Ставит earlyWindowProvider в config/fml.toml (ключ верхнего уровня — до первой [таблицы]). */
function setProvider(gameDir, name) {
  const file = path.join(gameDir, 'config', 'fml.toml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* FML создаст остальное сам */ }
  const line = `earlyWindowProvider = "${name}"`;
  const re = /^[ \t]*earlyWindowProvider[ \t]*=.*$/m;
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    const lines = text.split(/\r?\n/);
    const tableAt = lines.findIndex((l) => /^\s*\[/.test(l));
    if (tableAt < 0) lines.push(line); else lines.splice(tableAt, 0, line, '');
    text = lines.join('\n');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
}

/** Тёмный фон экрана загрузки Minecraft (options.txt → darkMojangStudiosBackground). */
function setDarkBackground(gameDir, dark) {
  const file = path.join(gameDir, 'options.txt');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* первого запуска ещё не было */ }
  const line = `darkMojangStudiosBackground:${dark ? 'true' : 'false'}`;
  const re = /^darkMojangStudiosBackground:.*$/m;
  if (re.test(text)) text = text.replace(re, line);
  else text = (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n';
  fs.writeFileSync(file, text);
}

/**
 * Подготовка перед запуском. Возвращает путь к jar, который надо добавить в classpath (или null).
 * Ошибки здесь не должны мешать запуску игры.
 */
function prepare({ enabled, gameDir, libDir, log }) {
  try {
    if (!enabled) {
      setProvider(gameDir, STOCK);
      return null;
    }
    const jar = ensureJar(libDir);
    setProvider(gameDir, PROVIDER);
    setDarkBackground(gameDir, true);
    return jar;
  } catch (e) {
    if (log) log('[launcher] свой экран загрузки не подготовлен: ' + e.message);
    try { setProvider(gameDir, STOCK); } catch (_) { /* ignore */ }
    return null;
  }
}

module.exports = { prepare, PROVIDER };
