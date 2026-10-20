// Тесты правок a25 Студии: «Монтаж» как объект (переезд старого stage в ключи), «Кинорамка» сцены.
// Запуск: node scripts/tests/studio6.test.cjs
const assert = require('assert');
require('../sync-studio.cjs');
const V = require('../../electron/studio-validate.cjs');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const cam = (id, x) => ({ id, type: 'camera', name: id, parent: null, enabled: true, visible: true, anim: {}, props: { pos: [x, 70, 0], rot: [0, 0, 0], fov: 70 } });

t('старый stage блоками → ключи объекта «Монтаж», камера по времени', () => {
  const raw = { id: 's', length: 200, actors: [], tracks: [], objects: [cam('cam1', 0), cam('cam2', 10)], stage: [{ t0: 0, t1: 100, cam: 'cam1' }, { t0: 100, t1: 200, cam: 'cam2' }] };
  const s = V.toObjectScene(raw);
  const st = s.objects.filter((o) => o.type === 'stage');
  assert.strictEqual(st.length, 1);
  assert.deepStrictEqual(st[0].anim.camera.map((k) => [k.t, k.v]), [[0, 'cam1'], [100, 'cam2']]);
  assert.deepStrictEqual(s.stage, []);
  assert.ok(V.hasObjects(s));
  assert.strictEqual(V.activeCamera(s, 50).id, 'cam1');
  assert.strictEqual(V.activeCamera(s, 150).id, 'cam2');
  // повторное открытие не плодит «Монтажи»
  assert.strictEqual(V.toObjectScene(s).objects.filter((o) => o.type === 'stage').length, 1);
  // сборка для игры: камера переключается в 100, «Монтажа» в объектах нет
  const g = V.compileScene(s);
  const keys = g.tracks.find((tr) => tr.kind === 'camera').keys;
  assert.strictEqual(keys.find((k) => k.t === 100).pos[0], 10);
  assert.ok(!(g.objects || []).some((o) => o.type === 'stage'));
  assert.ok(!V.objectsSnapshot(s, 0, []).some((o) => o.type === 'stage'));
});

t('«Монтаж»: ключ на пропавшую камеру — ошибка проверки', () => {
  const s = V.toObjectScene({ id: 's', length: 100, actors: [], tracks: [], objects: [cam('cam1', 0)], stage: [{ t0: 0, t1: 50, cam: 'cam1' }, { t0: 50, t1: 100, cam: 'nope' }] });
  const issues = V.validateScene(s, {});
  assert.ok(issues.some((x) => /нет камеры «nope»/.test(x.msg)));
});

t('кинорамка: новые сцены без рамки, true → 2,39:1, высота полос', () => {
  assert.strictEqual(V.defaultScene('a').options.letterbox.on, false);
  assert.deepStrictEqual(V.letterboxOf(true).on, true);
  assert.strictEqual(V.letterboxOf(true).aspect, 2.39);
  const n = V.normalizeScene({ id: 'a', length: 10, actors: [], tracks: [], options: { letterbox: true } });
  assert.strictEqual(n.options.letterbox.on, true);
  const n2 = V.normalizeScene({ id: 'a', length: 10, actors: [], tracks: [] });
  assert.strictEqual(n2.options.letterbox.on, false); // ключ пишется явно: игра без ключа включила бы полосы
  assert.strictEqual(V.letterboxBar({ on: true, aspect: 16 / 9 }, 1600, 900), 0);
  assert.ok(Math.abs(V.letterboxBar({ on: true, aspect: 2.39 }, 1600, 900) - (900 - 1600 / 2.39) / 2 / 900) < 1e-9);
  const bad = V.validateScene({ ...V.defaultScene('a'), options: { letterbox: { on: true, color: 'black' } } }, {});
  assert.ok(bad.some((x) => /Кинорамка: цвет/.test(x.msg)));
});

console.log('\nВсё хорошо: ' + n + ' проверок');
