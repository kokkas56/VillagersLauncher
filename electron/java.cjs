// Java: поиск установленных версий и автоматическая загрузка Temurin.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const AdmZip = require('adm-zip');
const store = require('./store.cjs');
const netu = require('./net.cjs');

const JAVA_DIR = path.join(store.RUNTIME_DIR, 'java');

function probe(javaExe) {
  return new Promise((resolve) => {
    // javaw ничего не пишет в консоль, поэтому версию спрашиваем у java.exe рядом
    let exe = javaExe;
    const alt = javaExe.replace(/javaw(\.exe)?$/i, (m, ext) => 'java' + (ext || ''));
    if (alt !== javaExe && fs.existsSync(alt)) exe = alt;
    execFile(exe, ['-XshowSettings:properties', '-version'], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const out = (stderr || '') + (stdout || '');
      const ver = /java\.version = (\S+)/.exec(out) || /version "([^"]+)"/.exec(out);
      if (!ver) return resolve(null);
      const v = ver[1];
      const major = v.startsWith('1.') ? parseInt(v.split('.')[1], 10) : parseInt(v, 10);
      const arch = (/os\.arch = (\S+)/.exec(out) || [])[1] || '';
      const vendor = (/java\.vendor = (.+)/.exec(out) || [])[1] || '';
      resolve({ path: javaExe, version: v, major, arch: arch.trim(), vendor: vendor.trim() });
    });
  });
}

function candidatesFrom(root, depth = 2) {
  const res = [];
  const walk = (dir, d) => {
    let list;
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    const javaw = path.join(dir, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (fs.existsSync(javaw)) { res.push(javaw); return; }
    if (d <= 0) return;
    for (const e of list) if (e.isDirectory()) walk(path.join(dir, e.name), d - 1);
  };
  walk(root, depth);
  return res;
}

async function detect() {
  const roots = [JAVA_DIR];
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['ProgramW6432']].filter(Boolean);
    for (const p of pf) {
      for (const v of ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'Zulu', 'Microsoft', 'BellSoft', 'Amazon Corretto', 'Semeru', 'GraalVM']) {
        roots.push(path.join(p, v));
      }
    }
    const appdata = process.env.APPDATA;
    if (appdata) {
      roots.push(path.join(appdata, '.minecraft', 'runtime'));
      roots.push(path.join(appdata, '.tlauncher', 'jvms'));
      roots.push(path.join(appdata, '.minecraft', 'jvms'));
    }
    const local = process.env.LOCALAPPDATA;
    if (local) roots.push(path.join(local, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'));
  } else {
    roots.push('/usr/lib/jvm');
  }
  const found = new Set();
  if (process.env.JAVA_HOME) {
    const j = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (fs.existsSync(j)) found.add(j);
  }
  for (const r of roots) for (const c of candidatesFrom(r, 4)) found.add(c);
  const results = [];
  for (const f of found) {
    const info = await probe(f);
    if (info) {
      info.managed = f.startsWith(JAVA_DIR);
      results.push(info);
    }
  }
  results.sort((a, b) => b.major - a.major);
  return results;
}

async function findManaged(major) {
  for (const c of candidatesFrom(path.join(JAVA_DIR, `temurin-${major}`), 2)) {
    const info = await probe(c);
    if (info && info.major === major) return info;
  }
  return null;
}

async function installTemurin(major, onProgress) {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=${os}&vendor=eclipse`;
  const list = await netu.getJson(url);
  if (!list.length) throw new Error('Adoptium не вернул сборку Java ' + major);
  const pkg = list[0].binary.package;
  const dest = path.join(JAVA_DIR, `temurin-${major}`);
  const archive = path.join(JAVA_DIR, pkg.name);
  let got = 0;
  onProgress && onProgress({ stage: 'java', text: `Java ${major}`, bytes: 0, total: pkg.size });
  await netu.downloadFile(pkg.link, archive, {
    size: pkg.size,
    onBytes: (n) => { got += n; onProgress && onProgress({ stage: 'java', text: `Java ${major}`, bytes: got, total: pkg.size }); }
  });
  // сверяем sha256
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (pkg.checksum && h !== pkg.checksum) {
    fs.rmSync(archive, { force: true });
    throw new Error('Контрольная сумма Java не совпала, попробуй ещё раз');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  onProgress && onProgress({ stage: 'java', text: `Распаковка Java ${major}`, bytes: pkg.size, total: pkg.size });
  if (pkg.name.endsWith('.zip')) {
    new AdmZip(archive).extractAllTo(dest, true);
  } else {
    await new Promise((resolve, reject) => {
      execFile('tar', ['-xzf', archive, '-C', dest], (err) => (err ? reject(err) : resolve()));
    });
  }
  fs.rmSync(archive, { force: true });
  const info = await findManaged(major);
  if (!info) throw new Error('Java распакована, но не запускается');
  return info;
}

// Возвращает путь к javaw подходящей версии, при необходимости скачивая её.
async function resolveJava(major, onProgress) {
  const s = store.get();
  if (s.javaMode === 'custom' && s.javaPath) {
    const info = await probe(s.javaPath);
    if (!info) throw new Error('Выбранная Java не запускается: ' + s.javaPath);
    if (info.major < major) throw new Error(`Нужна Java ${major}+, а выбрана Java ${info.major}. Поменяй в настройках или включи «Автоматически».`);
    return info.path;
  }
  const m = await findManaged(major);
  if (m) return m.path;
  const installed = await installTemurin(major, onProgress);
  return installed.path;
}

module.exports = { detect, probe, resolveJava, installTemurin, findManaged, JAVA_DIR };
