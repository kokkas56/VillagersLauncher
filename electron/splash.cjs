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

/** Ставит ключ верхнего уровня в config/fml.toml (до первой [таблицы]). */
function setFmlKey(gameDir, key, value) {
  const file = path.join(gameDir, 'config', 'fml.toml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* FML создаст остальное сам */ }
  const line = `${key} = ${value}`;
  const re = new RegExp('^[ \\t]*' + key + '[ \\t]*=.*$', 'm');
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
const setProvider = (gameDir, name) => setFmlKey(gameDir, 'earlyWindowProvider', `"${name}"`);
// earlyWindowControl = false — NeoForge не открывает раннее окно вовсе: окно создаёт сама игра, как без лаунчера.
// На части компьютеров (видел на NVIDIA) передача раннего окна игре роняет её ещё до открытия окна.
const setEarlyControl = (gameDir, on) => setFmlKey(gameDir, 'earlyWindowControl', on ? 'true' : 'false');

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
function prepare({ enabled, early = true, gameDir, libDir, log }) {
  try {
    setEarlyControl(gameDir, early !== false);
    if (!enabled || early === false) {
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

/**
 * Полный экран — через options.txt (fullscreen:true), а не аргументом --fullscreen: окно создаётся обычным,
 * и игра сама разворачивает его после запуска (KokkHUD — без рамки или настоящий полный экран).
 * С --fullscreen окно создаётся сразу полноэкранным, и на части видеокарт игра падает ещё до открытия окна.
 */
function setFullscreenOption(gameDir, on) {
  const file = path.join(gameDir, 'options.txt');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* первого запуска ещё не было */ }
  const line = `fullscreen:${on ? 'true' : 'false'}`;
  const re = /^fullscreen:.*$/m;
  if (re.test(text)) text = text.replace(re, line);
  else text = (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n';
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(file, text);
}

module.exports = { prepare, PROVIDER, setFullscreenOption };
