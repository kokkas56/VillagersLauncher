// Тесты фазы 5 Студии: переезд проектов, level.dat, проверка «Выходов», небо (время через ночь), «Связи».
// Запуск: node scripts/tests/studio5.test.cjs
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('../sync-studio.cjs');
const SP = require('../../electron/studio-projects.cjs');
const NBT = require('../../electron/nbt.cjs');
const V = require('../../electron/studio-validate.cjs');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio5-'));
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const examples = path.join(__dirname, '..', '..', 'electron', 'assets', 'studio-examples');

t('переезд плоского studio/ в projects/default, примеры — в «Примеры»', () => {
  const root = tmp();
  wj(path.join(root, 'project.json'), { v: 1, name: 'Мой сюжет', actors: [{ id: 'miron', base: 'valley', who: 0 }], vars: [{ name: 'x', type: 'bool' }] });
  wj(path.join(root, 'scenes', 'alaric.json'), { id: 'alaric' });
  wj(path.join(root, 'scenes', 'example_flyaround.json'), { id: 'example_flyaround' });
  wj(path.join(root, 'dialogs', 'example_miron_work.json'), { id: 'example_miron_work' });
  wj(path.join(root, 'quests', 'q1.json'), { id: 'q1' });
  fs.mkdirSync(path.join(root, 'structures')); fs.writeFileSync(path.join(root, 'structures', 'hut.nbt'), 'x');
  fs.writeFileSync(path.join(root, '.dev'), '');
  fs.mkdirSync(path.join(root, 'cache')); fs.writeFileSync(path.join(root, 'cache', 'block_colors.json'), '{}');
  const r = SP.migrate(root, { lastWorld: 'Test World', examplesSrc: examples });
  assert.ok(r.migrated);
  const d = path.join(root, 'projects', 'default');
  assert.ok(fs.existsSync(path.join(d, 'scenes', 'alaric.json')));
  assert.ok(fs.existsSync(path.join(d, 'quests', 'q1.json')));
  assert.ok(fs.existsSync(path.join(d, 'structures', 'hut.nbt')));
  assert.ok(fs.existsSync(path.join(d, 'entities.json')));
  assert.ok(!fs.existsSync(path.join(d, 'scenes', 'example_flyaround.json')), 'пример ушёл из «Моего проекта»');
  const ex = path.join(root, 'projects', 'examples');
  assert.ok(fs.existsSync(path.join(ex, 'scenes', 'example_flyaround.json')));
  assert.ok(fs.existsSync(path.join(ex, 'dialogs', 'example_miron_work.json')));
  assert.ok(fs.existsSync(path.join(ex, 'scenes', 'example_folk_talk.json')), 'недостающие примеры доложены из лаунчера');
  const p = JSON.parse(fs.readFileSync(path.join(d, 'project.json'), 'utf8'));
  assert.strictEqual(p.v, 2); assert.strictEqual(p.id, 'default'); assert.strictEqual(p.name, 'Мой проект'); assert.strictEqual(p.world, 'Test World');
  assert.strictEqual(p.actors[0].id, 'miron', 'актёры сохранились');
  assert.strictEqual(SP.readCurrent(root), 'default');
  assert.ok(fs.existsSync(path.join(root, '.dev')) && fs.existsSync(path.join(root, 'cache', 'block_colors.json')), '.dev и cache остались в корне');
  assert.ok(!fs.existsSync(path.join(root, 'scenes')) && !fs.existsSync(path.join(root, 'project.json')));
  const again = SP.migrate(root, { lastWorld: 'X', examplesSrc: examples });
  assert.ok(!again.migrated && !again.seeded, 'второй раз ничего не делает');
  const list = SP.listProjects(root, path.join(root, 'saves'));
  assert.deepStrictEqual(list.map((x) => x.id).sort(), ['default', 'examples']);
});

t('пустой studio/: проекта по умолчанию нет, «Примеры» кладутся один раз', () => {
  const root = tmp();
  const r = SP.migrate(root, { examplesSrc: examples });
  assert.ok(!r.migrated && r.seeded);
  assert.strictEqual(SP.readCurrent(root), null);
  fs.rmSync(path.join(root, 'projects', 'examples'), { recursive: true });
  assert.ok(!SP.migrate(root, { examplesSrc: examples }).seeded, 'удалённые примеры не возвращаются');
});

t('новый проект + плоский мир: level.dat читается и пересобирается без потерь', () => {
  const root = tmp(); const saves = path.join(root, 'saves');
  const f = SP.createWorld(saves, { name: 'Пролог: долина?', template: 'flat', rules: { doMobSpawning: 'false' } });
  assert.ok(!/[?:]/.test(f));
  const buf = fs.readFileSync(path.join(saves, f, 'level.dat'));
  const lv = NBT.readNbt(buf).Data;
  assert.strictEqual(lv.LevelName, 'Пролог: долина?');
  assert.strictEqual(lv.DataVersion, 3955);
  assert.strictEqual(lv.WorldGenSettings.dimensions['minecraft:overworld'].generator.type, 'minecraft:flat');
  assert.strictEqual(lv.GameRules.doMobSpawning, 'false');
  assert.strictEqual(lv.initialized, 0);
  const typed = NBT.readTyped(buf);
  assert.strictEqual(typed.v.Data.v.LastPlayed._t, NBT.T.LONG);
  const zlib = require('zlib');
  assert.ok(zlib.gunzipSync(NBT.writeTyped(typed)).equals(zlib.gunzipSync(buf)));
  const v = SP.createWorld(saves, { name: 'Пустота', template: 'void' });
  assert.strictEqual(NBT.readNbt(fs.readFileSync(path.join(saves, v, 'level.dat'))).Data.WorldGenSettings.dimensions['minecraft:overworld'].generator.settings.biome, 'minecraft:the_void');
  const c = SP.copyWorld(saves, f, 'Копия пролога');
  assert.strictEqual(NBT.readNbt(fs.readFileSync(path.join(saves, c, 'level.dat'))).Data.LevelName, 'Копия пролога');
  const p = SP.createProject(root, { name: 'Пролог в долине', world: f });
  assert.strictEqual(p.id, 'prolog_v_doline');
  assert.ok(fs.existsSync(path.join(root, 'projects', p.id, 'entities.json')));
  assert.strictEqual(SP.createProject(root, { name: 'Пролог в долине' }).id, 'prolog_v_doline_2');
});

t('«Выходы»: верная цепочка без ошибок', () => {
  const zone = V.makeEntity([], 'trigger_zone', { pos: [0, 64, 0] });
  const msg = V.makeEntity([zone], 'message', { pos: [1, 64, 0] });
  const start = V.makeEntity([zone, msg], 'player_start', { pos: [2, 64, 0] });
  zone.outputs = [{ on: 'enter', target: 'scene:meet', input: 'start', delay: 0 }, { on: 'enter', target: msg.id, input: 'show', param: 'Привет', delay: 1.5, once: true }];
  const iss = V.validateEntities([zone, msg, start], { scenes: ['meet'], quests: [], schemes: [], dialogs: [], structures: [], vars: [] });
  assert.deepStrictEqual(iss, []);
});

t('«Выходы»: пропавшая цель, неумелый вход, нет параметра, плохая задержка', () => {
  const zone = V.makeEntity([], 'trigger_zone', { pos: [0, 64, 0] });
  const timer = V.makeEntity([zone], 'timer', { pos: [0, 64, 0] });
  const actor = V.makeEntity([zone, timer], 'actor', { pos: [0, 64, 0] });
  zone.outputs = [
    { on: 'enter', target: 'e_gone1', input: 'show' },
    { on: 'enter', target: timer.id, input: 'show' },
    { on: 'enter', target: actor.id, input: 'say' },
    { on: 'enter', target: 'scene:nope', input: 'start' },
    { on: 'boom', target: timer.id, input: 'start' },
    { on: 'leave', target: timer.id, input: 'start', delay: -2 },
    { on: 'leave', target: 'player', input: 'teleport', param: '1 2' }
  ];
  const iss = V.validateEntities([zone, timer, actor], { scenes: [], quests: [], schemes: [], dialogs: [], structures: [] }).filter((x) => x.out != null);
  const by = (i) => iss.filter((x) => x.out === i && x.sev === V.ERR).map((x) => x.msg).join(' | ');
  assert.ok(/нет — её удалили/.test(by(0)), by(0));
  assert.ok(/не умеет «show»/.test(by(1)) && /Старт/.test(by(1)), by(1));
  assert.ok(/нужен параметр «Текст»/.test(by(2)), by(2));
  assert.ok(/сцены «nope» нет/.test(by(3)), by(3));
  assert.ok(/нет выхода «boom»/.test(by(4)), by(4));
  assert.ok(/задержка/.test(by(5)), by(5));
  assert.ok(/три числа/.test(by(6)), by(6));
  assert.deepStrictEqual(V.inputsForTarget(timer.id, [zone, timer, actor]).map((x) => x[0]), ['start', 'stop', 'reset', 'enable', 'disable', 'toggle']);
  assert.ok(V.inputsForTarget('signal:raid', []).some((x) => x[0] === 'raise'));
  const sp = V.makeEntity([], 'scene_point'); sp.outputs = [{ on: 'mark:', target: 'player', input: 'heal' }, { on: 'mark:door', target: 'player', input: 'heal' }];
  const mi = V.validateEntities([sp], {}).filter((x) => x.out != null && x.sev === V.ERR);
  assert.ok(mi.some((x) => x.out === 0) && !mi.some((x) => x.out === 1), 'метка: без имени — ошибка, mark:door — верно');
  assert.strictEqual(V.outputLabel('scene_point', 'mark:door'), 'На метке «door»');
  assert.deepStrictEqual(V.inputsForTarget('quest:q', []).map((x) => x[0]), ['start', 'advance', 'complete', 'fail', 'reset']);
  assert.strictEqual(V.incomingOf([zone, timer, actor], timer.id).length, 3);
});

t('два старта игрока — ошибка; чистка entities.json', () => {
  const a = V.makeEntity([], 'player_start'); const b = { ...V.makeEntity([a], 'player_start'), id: 'e_start2' };
  assert.ok(V.validateEntities([a, b], {}).some((x) => /Старт игрока поставлен 2/.test(x.msg)));
  const c = V.cleanEntities([{ ...a, outputs: [{ on: 'start', target: 'player', input: 'message', param: 'hi', delay: '2', extra: 1 }] }]);
  assert.deepStrictEqual(c[0].outputs[0], { on: 'start', target: 'player', input: 'message', param: 'hi', delay: 2 });
});

t('небо: время ЧЧ:ММ и ключи через ночь; «Связи» по таблице', () => {
  assert.strictEqual(V.ticksToHM(0), '06:00'); assert.strictEqual(V.ticksToHM(18000), '00:00'); assert.strictEqual(V.hmToTicks('18:00'), 12000);
  const sky = { id: 'sky1', type: 'sky', props: V.defaultProps('sky'), anim: { time: [{ t: 0, v: 12000, interp: 'linear' }, { t: 100, v: 0, interp: 'linear' }] } };
  assert.strictEqual(V.ticksToHM(V.propsAt(sky, 50).time), '00:00', 'середина 18:00→06:00 — полночь, а не полдень');
  const light = { id: 'l1', type: 'light', props: V.defaultProps('light'), anim: {} };
  const sc = { id: 's', length: 100, actors: [], tracks: [], stage: [], objects: [sky, light], links: [{ from: 'sky1.time', to: 'l1.level', map: [[12000, 0], [14000, 15]], clamp: true }] };
  const w = V.withLinks(sc);
  assert.strictEqual(V.propsAt(w.objects[1], 0).level, 0);
  assert.strictEqual(V.propsAt(w.objects[1], 25).level, 15);
  const comp = V.compileScene(sc);
  const so = comp.objects.find((o) => o.type === 'sky');
  assert.strictEqual(so.props.weather, 'clear');
  assert.ok(comp.objects.find((o) => o.type === 'light').anim.level.length > 1, 'связь запечена в ключи света');
  const iss = []; V.validateObjects({ ...sc, links: [...sc.links, { from: 'sky1.time', to: 'nope.level' }] }, (sev, msg) => iss.push(msg), 'E', 'W');
  assert.ok(iss.some((m) => /цели «nope» нет/.test(m)));
});

console.log('\nВсё хорошо: ' + n + ' проверок');
