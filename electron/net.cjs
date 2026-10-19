// Сеть: загрузка файлов с проверкой SHA-1, параллельная очередь, JSON.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { net } = require('electron');

const UA = 'VillagersLauncher/1.0 (+https://github.com/kokkas56/VillagersLauncher)';

async function fetchRaw(url, opts = {}) {
  const res = await net.fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) }
  });
  return res;
}

async function getJson(url, opts = {}) {
  const res = await fetchRaw(url, opts);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${url}`);
    err.status = res.status;
    try { err.body = await res.text(); } catch (_) {}
    throw err;
  }
  return res.json();
}

async function getBuffer(url, opts = {}) {
  const res = await fetchRaw(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function sha1Buffer(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function fileOk(file, sha1, size) {
  try {
    const st = await fs.promises.stat(file);
    if (size != null && st.size !== size) return false;
    if (!sha1) return true;
    return (await sha1File(file)) === sha1;
  } catch (_) {
    return false;
  }
}

// Скачивает url в file. onBytes(n) вызывается по мере загрузки.
async function downloadFile(url, file, { sha1, size, onBytes, retries = 3, headers, decrypt } = {}) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.part';
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let got = 0;
    try {
      const res = await fetchRaw(url, headers ? { headers } : {});
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${url}`);
      if (decrypt) {
        // зашифрованный файл раннего выпуска: целиком в память, расшифровать, проверить хеш открытого текста
        const enc = Buffer.from(await res.arrayBuffer());
        got = enc.length;
        if (onBytes) onBytes(enc.length);
        const plain = decrypt(enc);
        if (sha1 && crypto.createHash('sha1').update(plain).digest('hex') !== sha1) throw new Error(`Хеш не совпал: ${path.basename(file)}`);
        await fs.promises.writeFile(tmp, plain);
        await fs.promises.rm(file, { force: true });
        await fs.promises.rename(tmp, file);
        return;
      }
      const hash = crypto.createHash('sha1');
      const src = Readable.fromWeb(res.body);
      src.on('data', (chunk) => {
        hash.update(chunk);
        got += chunk.length;
        if (onBytes) onBytes(chunk.length);
      });
      await pipeline(src, fs.createWriteStream(tmp));
      const digest = hash.digest('hex');
      if (sha1 && digest !== sha1) throw new Error(`Хеш не совпал: ${path.basename(file)}`);
      await fs.promises.rm(file, { force: true });
      await fs.promises.rename(tmp, file);
      return;
    } catch (e) {
      lastErr = e;
      if (onBytes && got) onBytes(-got);
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Очередь задач загрузки: [{url, file, sha1, size, name}]
async function downloadAll(items, { threads = 8, onProgress, signal, quick = false } = {}) {
  const total = items.reduce((s, i) => s + (i.size || 0), 0);
  let done = 0;
  let filesDone = 0;
  let idx = 0;
  let lastEmit = 0;
  const emit = (force) => {
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    if (onProgress) onProgress({ bytes: done, total, files: filesDone, filesTotal: items.length });
  };
  const errors = [];
  async function worker() {
    while (idx < items.length) {
      if (signal && signal.aborted) return;
      const it = items[idx++];
      try {
        if (!(await fileOk(it.file, quick ? null : it.sha1, it.size))) {
          await downloadFile(it.url, it.file, {
            sha1: it.sha1,
            size: it.size,
            headers: it.headers,
            decrypt: it.decrypt,
            onBytes: (n) => { done += n; emit(); }
          });
        } else {
          done += it.size || 0;
        }
      } catch (e) {
        errors.push({ item: it, error: e.message });
      }
      filesDone++;
      emit();
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, threads) }, worker));
  emit(true);
  if (errors.length) {
    const e = new Error(`Не удалось скачать ${errors.length} файл(ов): ` + errors.slice(0, 3).map((x) => x.item.name || path.basename(x.item.file)).join(', '));
    e.details = errors;
    throw e;
  }
}

module.exports = { UA, fetchRaw, getJson, getBuffer, sha1File, sha1Buffer, fileOk, downloadFile, downloadAll };
