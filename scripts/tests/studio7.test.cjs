// Тесты фазы 6 (трек A): хэш запекания (JS ↔ Java игры), проверка эффектов библиотеки, переходы, оценка размера видео,
// «Собрать» для запеканий и видео. Запуск: node scripts/tests/studio7.test.cjs
// Сверка с Java — если есть javac и исходники игры (KOKK_SRC) и gson (KOKK_GSON); иначе пропускается.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
require('../sync-studio.cjs');
const V = require('../../electron/studio-validate.cjs');
const C = require('../../electron/studio-cine.cjs');

let n = 0, skipped = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const errs = (list) => list.filter((x) => x.sev === V.ERR || x[0] === V.ERR || x.level === 'error');

function scene(extra) {
  const s = V.defaultScene('s1', 'Тест');
  s.length = 200;
  s.actors = [{ id: 'miron', kind: 'entity', type: 'minecraft:villager', name: 'Мирон', spawn: { pos: [10, 64, 10], yaw: 90 } }];
  s.tracks = [
    { kind: 'camera', keys: [{ t: 0, pos: [0, 70, 0], look: [10, 64, 10], fov: 70 }, { t: 100, pos: [5.123, 71, 3], yaw: 30, pitch: 10, ease: 'smooth' }, { t: 200, pos: [8, 72, 9], look: [10, 64, 10] }] },
    { kind: 'actor', actor: 'miron', events: [{ t: 20, do: 'walk', path: [[10, 64, 10], [14, 64, 10]], speed: 0.6 }, { t: 120, do: 'say', text: 'Привет' }] },
    { kind: 'fx', events: [{ t: 0, do: 'fade_in', dur: 20 }] }
  ];
  return Object.assign(s, extra || {});
}

// ---------------- хэш ----------------
t('хэш: стабилен, 16 hex, не зависит от реплик и эффектов', () => {
  const a = V.sceneBakeHash(V.normalizeScene(scene()));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.strictEqual(V.sceneBakeHash(V.normalizeScene(scene())), a);
  const b = scene(); b.tracks[1].events[1].text = 'Другое'; b.tracks[2].events.push({ t: 50, do: 'flash' });
  assert.strictEqual(V.sceneBakeHash(V.normalizeScene(b)), a, 'текст и эффекты не меняют запекание');
});
t('хэш: меняется от камеры, ходьбы, длины, измерения, радиуса', () => {
  const a = V.sceneBakeHash(V.normalizeScene(scene()));
  const ch = (f) => { const s = scene(); f(s); return V.sceneBakeHash(V.normalizeScene(s)); };
  assert.notStrictEqual(ch((s) => { s.tracks[0].keys[1].pos[0] = 6; }), a);
  assert.notStrictEqual(ch((s) => { s.tracks[1].events[0].path[1] = [15, 64, 10]; }), a);
  assert.notStrictEqual(ch((s) => { s.length = 240; }), a);
  assert.notStrictEqual(ch((s) => { s.world.dim = 'minecraft:the_nether'; }), a);
  assert.notStrictEqual(ch((s) => { s.preload = { ...s.preload, radius: 120 }; }), a);
  // округление до сотых: шум в 1e-6 не меняет
  assert.strictEqual(ch((s) => { s.tracks[0].keys[1].pos[0] = 5.1230001; }), a);
});
t('хэш: формат проекта (cleanScene) = формат игры (normalizeScene)', () => {
  const s = scene();
  assert.strictEqual(V.sceneBakeHash(V.normalizeScene(V.cleanScene(s))), V.sceneBakeHash(V.normalizeScene(s)));
  assert.strictEqual(C.sceneHash(s), V.sceneBakeHash(V.normalizeScene(s)));
});

// ---------------- эффекты ----------------
// поля-места, которые автор берёт из игры, в тесте — точка
const fillPos = (ev) => { for (const f of V.FX_LIB[ev.do].fields || []) { const v = ev[f.k], empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length); if (!empty) continue; if (f.type === 'pos') ev[f.k] = [0, 64, 0]; else if (f.type === 'path') ev[f.k] = [[0, 64, 0], [4, 64, 0]]; else if (f.type === 'structRef') ev[f.k] = 'house'; else if (f.type === 'actorRef' && v === null) ev[f.k] = 'miron'; } return ev; };
const chk = (track, ev, refs) => { const out = []; V.checkFxEvent(ev.do, ev, 'событие', (sev, msg) => out.push({ sev, msg }), null, V.ERR, V.WARN, refs || {}); return out; };
t('библиотека: у каждого эффекта метка, подсказка, дорожка, группа; значения по умолчанию проходят проверку', () => {
  const groups = new Set(V.FX_GROUPS.map((g) => g[0]));
  for (const [verb, d] of Object.entries(V.FX_LIB)) {
    assert.ok(d.label && d.hint && d.track && groups.has(d.group), verb);
    const ev = fillPos(V.fxNewEvent(verb, 40));
    assert.strictEqual(ev.do, verb);
    const e = chk(d.track, ev, { actors: ['miron'], structures: ['house'] }).filter((x) => x.sev === V.ERR);
    assert.deepStrictEqual(e.map((x) => x.msg), [], verb + ': ' + e.map((x) => x.msg).join('; '));
  }
});
t('библиотека: ошибки полей ловятся по-русски', () => {
  const bad = chk('world', { t: 0, do: 'lightning', pos: 'abc' }).filter((x) => x.sev === V.ERR);
  assert.ok(bad.length > 0 && /[а-я]/i.test(bad[0].msg), JSON.stringify(bad));
  const big = chk('world', { t: 0, do: 'explosion', pos: [0, 64, 0], power: 999 }).filter((x) => x.sev === V.ERR);
  assert.ok(big.length > 0, 'сила взрыва вне границ');
  const col = chk('fx', { t: 0, do: 'fade_color', color: 'red??', dur: 20 }).filter((x) => x.sev === V.ERR);
  assert.ok(col.length > 0, 'цвет');
});
t('библиотека: сцена с эффектами проходит validateScene, неизвестный эффект — ошибка', () => {
  const s = scene();
  s.tracks.push({ kind: 'world', events: [fillPos(V.fxNewEvent('lightning', 30)), fillPos(V.fxNewEvent('fireworks', 60))] });
  s.tracks[2].events.push(V.fxNewEvent('vignette', 10, {}), V.fxNewEvent('grade', 10, {}));
  const ok = errs(V.validateScene(V.normalizeScene(s), {}));
  assert.deepStrictEqual(ok.map((x) => x.msg || x[1]), []);
  s.tracks[2].events.push({ t: 5, do: 'no_such_fx' });
  assert.ok(errs(V.validateScene(V.normalizeScene(s), {})).length > 0);
});

// ---------------- переходы, видео ----------------
t('переход: нужен to.pos, границы ожидания, предупреждение без видео и сцены', () => {
  const run = (spec, refs) => { const out = []; V.checkTransition(spec, 'Переход', (sev, msg) => out.push({ sev, msg }), V.ERR, V.WARN, refs); return out; };
  assert.ok(run({ to: {} }).some((x) => x.sev === V.ERR));
  assert.ok(run({ to: { pos: [0, 64, 0] }, maxWait: 500 }).some((x) => x.sev === V.ERR));
  assert.ok(run({ to: { pos: [0, 64, 0] } }).some((x) => x.sev === V.WARN));
  assert.deepStrictEqual(run({ to: { pos: [0, 64, 0], dim: 'minecraft:the_nether' }, video: 's1' }, { scenes: ['s1'] }), []);
  assert.ok(run({ to: { pos: [0, 64, 0] }, video: 'nope' }, { scenes: ['s1'] }).some((x) => x.sev === V.ERR));
});
t('видео: настройки по умолчанию, оценка размера растёт с качеством', () => {
  const o = V.videoOpts({});
  assert.deepStrictEqual([o.quality, o.fps, o.jpeg, o.ship, o.use], [720, 20, 80, false, true]);
  const m = (h, fps, q) => V.videoEstimate(60 * 20, h, fps, q).bytes;
  assert.ok(m(480, 20, 80) < m(720, 20, 80) && m(720, 20, 80) < m(1080, 20, 80));
  assert.ok(m(720, 30, 80) > m(720, 20, 80) * 1.4);
  const mb = m(720, 20, 80) / 1048576;
  assert.ok(mb > 80 && mb < 200, '720p 20 к/с ≈ 124 МБ/мин, вышло ' + mb.toFixed(0));
  const e = V.videoEstimate(200, 1080, 30, 85);
  assert.deepStrictEqual([e.w, e.h, e.frames], [1920, 1080, 300]);
});

// ---------------- «Собрать»: запекания и видео ----------------
t('сборка: свежее запекание едет, устаревшее — нет; видео — только отмеченные и свежие', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks7-'));
  const game = path.join(tmp, 'game'), proj = path.join(tmp, 'proj'), out = path.join(tmp, 'out');
  fs.mkdirSync(path.join(proj, 'scenes'), { recursive: true });
  const a = scene({ id: 'a' }), b = scene({ id: 'b', length: 300 }), c = scene({ id: 'c' });
  a.options = { ...a.options, video: { ship: true } };
  c.options = { ...c.options, video: { ship: false } };
  for (const s of [a, b, c]) fs.writeFileSync(path.join(proj, 'scenes', s.id + '.json'), JSON.stringify(V.cleanScene(s)));
  fs.writeFileSync(path.join(proj, 'scenes', 'a.bake.json'), JSON.stringify({ v: 1, id: 'a', hash: C.sceneHash(a) }));
  fs.writeFileSync(path.join(proj, 'scenes', 'b.bake.json'), JSON.stringify({ v: 1, id: 'b', hash: '0000000000000000' }));
  for (const s of [a, c]) {
    const d = path.join(game, 'kokkstory-videos', 'p1', s.id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ v: 1, hash: C.sceneHash(s), w: 1280, h: 720, fps: 20, frames: 200, packs: [{ file: 'pack_000.kvp' }] }));
    fs.writeFileSync(path.join(d, 'pack_000.kvp'), Buffer.alloc(5000));
  }
  // старые остатки в сборке уберутся
  fs.mkdirSync(path.join(out, 'videos', 'old'), { recursive: true });
  const r = C.shipBuild({ gameDir: game, projectDir: proj, projectId: 'p1', out, sceneIds: ['a', 'b', 'c'] });
  assert.strictEqual(r.bakes, 1);
  assert.deepStrictEqual(r.bakesStale, ['b']);
  assert.strictEqual(r.videos, 1);
  assert.ok(fs.existsSync(path.join(out, 'scenes', 'a.bake.json')));
  assert.ok(!fs.existsSync(path.join(out, 'scenes', 'b.bake.json')));
  assert.ok(fs.existsSync(path.join(out, 'videos', 'a', 'pack_000.kvp')));
  assert.ok(!fs.existsSync(path.join(out, 'videos', 'c')));
  assert.ok(!fs.existsSync(path.join(out, 'videos', 'old')));
  const info = C.cineInfo({ gameDir: game, projectDir: proj, projectId: 'p1' });
  const ia = info.scenes.find((x) => x.id === 'a');
  assert.ok(ia.bake.fresh && ia.vid.fresh && ia.video.ship);
  assert.ok(!info.scenes.find((x) => x.id === 'b').bake.fresh);
  assert.ok(info.shipBytes > 0 && info.allBytes >= info.shipBytes * 2);
  // сцену поменяли после записи → видео устарело и не едет
  a.length = 260;
  fs.writeFileSync(path.join(proj, 'scenes', 'a.json'), JSON.stringify(V.cleanScene(a)));
  const r2 = C.shipBuild({ gameDir: game, projectDir: proj, projectId: 'p1', out, sceneIds: ['a', 'b', 'c'] });
  assert.strictEqual(r2.videos, 0);
  assert.ok(r2.skipped.some((x) => x.id === 'a'));
  assert.ok(!fs.existsSync(path.join(out, 'videos', 'a')));
  fs.rmSync(tmp, { recursive: true, force: true });
});
t('публикация лаунчера не берёт kokkstory-videos', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../electron/store.cjs'), 'utf8');
  assert.ok(src.includes("'kokkstory-videos/**'"));
});

// ---------------- сверка с Java игры ----------------
(function java() {
  const src = process.env.KOKK_SRC || '/home/claude/kokk/KokkStoryCampaign/sources/KokkStory/src/main/java';
  const gson = process.env.KOKK_GSON || '/home/claude/kokk/cp/gson-2.10.1.jar';
  const bd = path.join(src, 'com/kokk/story/studio/StudioBakeData.java');
  let javac = true;
  try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); } catch (_) { javac = false; }
  if (!javac || !fs.existsSync(bd) || !fs.existsSync(gson)) { skipped++; console.log('— сверка с Java пропущена (нет javac, исходников игры или gson)'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks7j-'));
  const cls = path.join(tmp, 'cls'), fx = path.join(tmp, 'fx');
  fs.mkdirSync(cls); fs.mkdirSync(fx);
  execFileSync('javac', ['-nowarn', '-cp', gson, '-d', cls, bd, path.join(__dirname, 'java', 'BakeParity.java')], { stdio: 'pipe' });
  const want = {};
  const put = (name, s, file) => { fs.writeFileSync(path.join(fx, name + '.json'), JSON.stringify(file)); want[name] = V.sceneBakeHash(V.normalizeScene(s)); };
  const s0 = scene();
  put('norm', s0, V.normalizeScene(s0));
  put('clean', s0, V.cleanScene(s0));
  const s1 = scene({ length: 333 }); s1.world.anchor = 'anchor:hall'; s1.preload = { radius: 64.4, alongCamera: false, extra: [[1, 2], [3.333, 4]] };
  s1.tracks.push({ kind: 'camera', keys: [{ t: 100, pos: [1, 2, 3] }, { t: 50.4, pos: [-1.005, 2, 3], fov: 50 }] });
  s1.tracks[1].events.push({ t: 150, do: 'tp', pos: [1, 2, 3] });
  s1.options = { ...s1.options, endPlayer: { pos: [7, 65, 7] } };
  put('rich', s1, V.normalizeScene(s1));
  const s2 = V.defaultScene('empty', 'Пусто');
  put('empty', s2, V.normalizeScene(s2));
  const cp = [cls, gson].join(path.delimiter);
  const outp = execFileSync('java', ['-cp', cp, 'BakeParity', fx], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const got = Object.fromEntries(outp.trim().split('\n').map((l) => l.trim().split(' ')));
  t('хэш: Java игры = JS лаунчера (' + Object.keys(want).length + ' сцен)', () => {
    for (const k of Object.keys(want)) assert.strictEqual(got[k], want[k], k + ': java ' + got[k] + ' js ' + want[k]);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
})();

console.log('\nстудия a26 (трек A): ' + n + ' тестов прошло' + (skipped ? ', пропущено ' + skipped : ''));
