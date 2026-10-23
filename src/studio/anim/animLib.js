// «Анимации» Студии Кокка — встроенная библиотека. Источник правды: отсюда scripts/sync-anims.cjs пишет
// skinkokk/src/main/resources/assets/skinkokk/anims/<id>.json (+ index.json) — их играет мод у всех игроков.
// Без import. Углы — градусы, оси как у ModelPart: рука X −90 — вперёд, −180 — вверх; правая рука Z + — в сторону,
// левая Z − — в сторону; голова X + — вниз; туловище X + — наклон вперёд (от пояса); корень Y + — ниже, Z + — назад.
// Ключ: k(t, x, y, z, ease) — ease у ключа = как идти К СЛЕДУЮЩЕМУ ключу (smooth по умолчанию).

const k = (t, x, y, z, ease) => (ease ? { t, v: [x, y, z], ease } : { t, v: [x, y, z] });
const A = (o) => ({ v: 1, target: 'any_humanoid', loop: false, speed: 1, blendIn: 4, blendOut: 6, mode: 'add', emote: true, ...o, builtin: true });
// ключи «дрожи»: от t0 до t1 с шагом step значение колеблется вокруг base по компоненте c на ±amp
const tremble = (t0, t1, step, base, c, amp) => { const out = []; let s = 1; for (let t = t0; t <= t1; t += step) { const v = base.slice(); v[c] += amp * s; s = -s; out.push({ t, v, ease: 'linear' }); } return out; };
const mirror = (keys) => keys.map((q) => ({ ...q, v: [q.v[0], -q.v[1], -q.v[2]] }));

export const ANIM_LIBRARY = [
  // ---------- приветствия ----------
  A({ id: 'wave', name: 'Помахать', name_en: 'Wave', cat: 'greet', icon: '👋', length: 40, blendOut: 8, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 5, 'out'), k(7, -12, -5, 152), k(13, -12, -5, 126), k(19, -12, -5, 156), k(25, -12, -5, 126), k(31, -12, -5, 150), k(40, 0, 0, 5)] },
    head: { rot: [k(0, 0, 0, 0), k(7, -6, 0, -6), k(33, -6, 0, -6), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(7, 0, 0, -3), k(33, 0, 0, -3), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(7, 0, 0, -6), k(33, 0, 0, -6), k(40, 0, 0, 0)] } } }),
  A({ id: 'nod', name: 'Кивнуть', name_en: 'Nod', cat: 'greet', icon: '🙂', length: 22, blendIn: 2, blendOut: 3, tracks: {
    head: { rot: [k(0, 0, 0, 0, 'out'), k(5, 18, 0, 0), k(10, -4, 0, 0), k(15, 14, 0, 0, 'out'), k(22, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(5, 3, 0, 0), k(10, 0, 0, 0), k(15, 2, 0, 0), k(22, 0, 0, 0)] } } }),
  A({ id: 'shake_head', name: 'Покачать головой', name_en: 'Shake head', cat: 'talk', icon: '🙅', length: 28, blendIn: 2, blendOut: 3, tracks: {
    head: { rot: [k(0, 0, 0, 0), k(5, 4, -28, 0), k(11, 4, 26, 0), k(17, 4, -22, 0), k(23, 4, 14, 0, 'out'), k(28, 0, 0, 0)] } } }),
  A({ id: 'bow', name: 'Поклониться', name_en: 'Bow', cat: 'greet', icon: '🙇', length: 40, blendOut: 4, modes: { right_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 0, 0, 0, 'out'), k(10, 42, 0, 0), k(26, 42, 0, 0), k(38, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(10, 12, 0, 0), k(26, 12, 0, 0), k(38, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(10, -52, -32, 0), k(26, -52, -32, 0), k(38, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(10, 10, 0, -2), k(26, 10, 0, -2), k(38, 0, 0, 0)] } } }),
  A({ id: 'salute', name: 'Отдать честь', name_en: 'Salute', cat: 'greet', icon: '🫡', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, lockLegs: true, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'back'), k(8, -142, -38, 12), k(30, -142, -38, 12), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, -2), k(40, 0, 0, -2)] },
    head: { rot: [k(0, 0, 0, 0), k(8, -4, 0, 0), k(30, -4, 0, 0), k(40, 0, 0, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0)] }, left_leg: { rot: [k(0, 0, 0, 0)] } } }),
  A({ id: 'beckon', name: 'Подозвать', name_en: 'Beckon', cat: 'greet', icon: '🫴', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -78, 10, 10), k(11, -122, 10, 10), k(16, -78, 10, 10), k(21, -122, 10, 10), k(26, -78, 10, 10), k(31, -118, 10, 10), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 0, -4, 6), k(31, 0, -4, 6), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 0, -8, 0), k(31, 0, -8, 0), k(40, 0, 0, 0)] } } }),

  // ---------- разговор ----------
  A({ id: 'talk', name: 'Жестикулировать', name_en: 'Talk', cat: 'talk', icon: '💬', length: 40, loop: true, blendIn: 6, tracks: {
    right_arm: { rot: [k(0, -25, 0, 8), k(10, -42, -10, 14), k(20, -20, 0, 6), k(30, -38, 8, 12), k(40, -25, 0, 8)] },
    left_arm: { rot: [k(0, -10, 0, -4), k(13, -22, 0, -8), k(26, -8, 0, -4), k(40, -10, 0, -4)] },
    head: { rot: [k(0, 0, 0, 0), k(8, 4, 6, 2), k(18, -2, -4, 0), k(28, 5, 3, -2), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(10, 0, -4, 0), k(30, 0, 4, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'talk_explain', name: 'Объяснять', name_en: 'Explain', cat: 'talk', icon: '🗣', length: 48, loop: true, blendIn: 6, tracks: {
    right_arm: { rot: [k(0, -40, 0, 20), k(12, -56, -15, 32), k(24, -36, 0, 18), k(36, -52, 10, 28), k(48, -40, 0, 20)] },
    left_arm: { rot: mirror([k(0, -36, 0, 18), k(12, -30, 0, 14), k(24, -54, -14, 30), k(36, -40, 6, 22), k(48, -36, 0, 18)]) },
    head: { rot: [k(0, 0, 0, 0), k(12, 6, -6, 0), k(24, -2, 4, 0), k(36, 6, 6, 0), k(48, 0, 0, 0)] },
    body: { rot: [k(0, 3, 0, 0), k(24, 5, 0, 0), k(48, 3, 0, 0)] } } }),
  A({ id: 'point', name: 'Показать рукой', name_en: 'Point', cat: 'talk', icon: '👉', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'back'), k(6, -88, -6, 0), k(34, -88, -6, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 0, -8, 0), k(34, 0, -8, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, -2, -6, 0), k(34, -2, -6, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, 6, 0, -4), k(34, 6, 0, -4), k(40, 0, 0, 0)] } } }),
  A({ id: 'think', name: 'Задуматься', name_en: 'Think', cat: 'talk', icon: '🤔', length: 60, loop: true, blendIn: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -112, -30, 0), k(30, -108, -28, 2), k(60, -112, -30, 0)] },
    left_arm: { rot: [k(0, -50, 38, -10), k(60, -50, 38, -10)] },
    head: { rot: [k(0, -6, 0, 8), k(30, -10, 10, 6), k(60, -6, 0, 8)] },
    body: { rot: [k(0, 4, 0, 0), k(60, 4, 0, 0)] } } }),
  A({ id: 'shrug', name: 'Пожать плечами', name_en: 'Shrug', cat: 'talk', icon: '🤷', length: 30, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(8, -35, 20, 38), k(20, -35, 20, 38), k(30, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(8, -35, -20, -38), k(20, -35, -20, -38), k(30, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(8, -4, 0, 12), k(20, -4, 0, 12), k(30, 0, 0, 0)] },
    body: { pos: [k(0, 0, 0, 0), k(8, 0, -1, 0), k(20, 0, -1, 0), k(30, 0, 0, 0)] } } }),

  // ---------- чувства ----------
  A({ id: 'cheer', name: 'Обрадоваться', name_en: 'Cheer', cat: 'emotion', icon: '🙌', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, 165), k(12, -10, 0, 145), k(18, -10, 0, 165), k(24, -10, 0, 145), k(32, -10, 0, 160), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, -165), k(12, -10, 0, -145), k(18, -10, 0, -165), k(24, -10, 0, -145), k(32, -10, 0, -160), k(40, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(5, 0, -5, 0, 'in'), k(10, 0, 0, 0, 'out'), k(15, 0, -5, 0, 'in'), k(20, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, -12, 0, 0), k(32, -12, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'celebrate_jump', name: 'Прыжок радости', name_en: 'Jump for joy', cat: 'emotion', icon: '🎉', length: 30, lockLegs: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0), k(4, 0, 2, 0, 'out'), k(9, 0, -10, 0, 'in'), k(15, 0, 0, 0, 'bounce'), k(20, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(4, 20, 0, 20, 'out'), k(9, -10, 0, 165), k(15, -10, 0, 150), k(30, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(4, 20, 0, -20, 'out'), k(9, -10, 0, -165), k(15, -10, 0, -150), k(30, 0, 0, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0), k(4, -8, 0, 0), k(9, -14, 0, 4), k(15, 0, 0, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0), k(4, -8, 0, 0), k(9, 10, 0, -4), k(15, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(4, 12, 0, 0), k(9, -6, 0, 0), k(15, 4, 0, 0), k(22, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(9, -15, 0, 0), k(22, 0, 0, 0)] } },
    events: [{ t: 9, particle: 'minecraft:happy_villager', bone: 'head', count: 6, spread: 0.5 }] }),
  A({ id: 'laugh', name: 'Смеяться', name_en: 'Laugh', cat: 'emotion', icon: '😂', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    head: { rot: [k(0, 0, 0, 0, 'out'), k(4, -22, 0, 0, 'linear'), ...tremble(7, 28, 3, [-20, 0, 0], 0, 3).slice(1), k(32, -18, 0, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(4, -6, 0, 0, 'linear'), ...tremble(7, 28, 3, [-5, 0, 0], 0, 2).slice(1), k(32, -4, 0, 0), k(40, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(6, -35, -22, 0), k(32, -35, -22, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -35, 22, 0), k(32, -35, 22, 0), k(40, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), ...tremble(6, 30, 3, [0, -0.5, 0], 1, 0.5), k(34, 0, 0, 0)] } } }),
  A({ id: 'cry', name: 'Заплакать', name_en: 'Cry', cat: 'emotion', icon: '😢', length: 40, loop: true, blendIn: 8, blendOut: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    head: { rot: [k(0, 28, 0, 0), k(10, 32, 0, 3), k(20, 28, 0, 0), k(30, 32, 0, -3), k(40, 28, 0, 0)] },
    right_arm: { rot: [k(0, -120, -22, 0), k(5, -124, -22, 0), k(10, -120, -22, 0), k(25, -124, -22, 0), k(30, -120, -22, 0), k(40, -120, -22, 0)] },
    left_arm: { rot: [k(0, -120, 22, 0), k(5, -124, 22, 0), k(10, -120, 22, 0), k(25, -124, 22, 0), k(30, -120, 22, 0), k(40, -120, 22, 0)] },
    body: { rot: [k(0, 10, 0, 0), k(5, 13, 0, 0), k(10, 10, 0, 0), k(25, 13, 0, 0), k(30, 10, 0, 0), k(40, 10, 0, 0)] } },
    events: [{ t: 5, particle: 'minecraft:falling_water', bone: 'head', count: 2, spread: 0.2 }, { t: 25, particle: 'minecraft:falling_water', bone: 'head', count: 2, spread: 0.2 }] }),
  A({ id: 'facepalm', name: 'Рука-лицо', name_en: 'Facepalm', cat: 'emotion', icon: '🤦', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'in'), k(8, -118, -28, 0), k(30, -118, -28, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(8, 24, 0, 0), k(14, 24, -8, 0), k(20, 24, 8, 0), k(26, 24, -6, 0), k(30, 24, 0, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(8, 8, 0, 0), k(30, 8, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'angry', name: 'Злиться', name_en: 'Angry', cat: 'emotion', icon: '😠', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -150, 0, 20, 'linear'), ...tremble(10, 30, 4, [-140, 0, 20], 0, 10), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -12, 0, -30), k(32, -12, 0, -30), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 10, 0, 0, 'linear'), ...tremble(8, 30, 2, [10, 0, 0], 2, 2), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(6, 6, 0, 0), k(32, 6, 0, 0), k(40, 0, 0, 0)] },
    root: { pos: [k(6, 0, 0, 0, 'in'), k(8, 0, -2, 0, 'bounce'), k(11, 0, 0, 0)] } },
    events: [{ t: 8, particle: 'minecraft:angry_villager', bone: 'head', count: 2, spread: 0.3 }] }),
  A({ id: 'scared', name: 'Испугаться', name_en: 'Scared', cat: 'emotion', icon: '😱', length: 40, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(6, 0, 0, 4), k(34, 0, 0, 4), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(6, -10, 0, 0), k(34, -10, 0, 0), k(40, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -100, -24, 10, 'linear'), ...tremble(8, 32, 2, [-100, -24, 10], 0, 3), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(6, -100, 24, -10, 'linear'), ...tremble(8, 32, 2, [-100, 24, -10], 0, 3), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0, 'out'), k(6, 12, 0, 0, 'linear'), ...tremble(8, 32, 2, [12, 0, 0], 1, 3), k(40, 0, 0, 0)] } } }),
  A({ id: 'yawn', name: 'Зевнуть', name_en: 'Yawn', cat: 'emotion', icon: '🥱', length: 50, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0), k(15, -20, 0, 155), k(30, -20, 0, 155), k(42, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(15, -20, 0, -155), k(30, -20, 0, -155), k(42, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(15, -24, 0, 0), k(30, -24, 0, 0), k(42, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(15, -6, 0, 0), k(30, -6, 0, 0), k(42, 0, 0, 0)] } } }),

  // ---------- работа и действия ----------
  A({ id: 'pick_up', name: 'Поднять с земли', name_en: 'Pick up', cat: 'work', icon: '🫳', length: 40, modes: { right_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 0, 0, 0), k(12, 70, 0, 0), k(20, 70, 0, 0), k(32, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), k(12, 0, 2, 0), k(20, 0, 2, 0), k(32, 0, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -40, 0, 0), k(20, -36, 0, 0), k(32, -45, 0, 0), k(40, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(12, -20, 0, -6), k(32, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -25, 0, 0), k(32, 0, 0, 0)] } } }),
  A({ id: 'give', name: 'Протянуть', name_en: 'Give', cat: 'work', icon: '🤲', length: 40, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(10, -75, -10, 0), k(26, -75, -10, 0), k(34, -68, -10, 0), k(40, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(10, 8, 0, 0), k(30, 8, 0, 0), k(40, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(10, 10, 0, 0), k(30, 10, 0, 0), k(40, 0, 0, 0)] } } }),
  A({ id: 'hammer', name: 'Стучать молотком', name_en: 'Hammer', cat: 'work', icon: '🔨', length: 20, loop: true, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -145, 0, 10, 'in'), k(5, -40, 0, 2, 'out'), k(12, -150, 0, 10), k(20, -145, 0, 10)] },
    body: { rot: [k(0, 2, 0, 0, 'in'), k(5, 14, 0, 0, 'out'), k(12, 2, 0, 0), k(20, 2, 0, 0)] },
    head: { rot: [k(0, 8, 0, 0), k(5, 16, 0, 0), k(12, 8, 0, 0), k(20, 8, 0, 0)] } },
    events: [{ t: 5, sound: 'minecraft:block.wood.hit', vol: 0.6, pitch: 1 }] }),
  A({ id: 'sweep', name: 'Мести пол', name_en: 'Sweep', cat: 'work', icon: '🧹', length: 30, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    body: { rot: [k(0, 14, -18, 0), k(15, 14, 18, 0), k(30, 14, -18, 0)] },
    right_arm: { rot: [k(0, -35, -30, 0), k(15, -45, 10, 0), k(30, -35, -30, 0)] },
    left_arm: { rot: [k(0, -30, 20, 0), k(15, -40, 40, 0), k(30, -30, 20, 0)] },
    head: { rot: [k(0, 10, 10, 0), k(15, 10, -10, 0), k(30, 10, 10, 0)] } } }),
  A({ id: 'warm_hands', name: 'Греть руки', name_en: 'Warm hands', cat: 'work', icon: '🔥', length: 32, loop: true, blendIn: 8, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -62, -26, 0), k(4, -62, -22, 0), k(8, -62, -26, 0), k(12, -62, -22, 0), k(16, -62, -26, 0), k(24, -58, -26, 0), k(32, -62, -26, 0)] },
    left_arm: { rot: [k(0, -62, 26, 0), k(4, -62, 22, 0), k(8, -62, 26, 0), k(12, -62, 22, 0), k(16, -62, 26, 0), k(24, -58, 26, 0), k(32, -62, 26, 0)] },
    body: { rot: [k(0, 10, 0, 0), k(32, 10, 0, 0)], pos: [k(0, 0, 1, 0), k(32, 0, 1, 0)] },
    head: { rot: [k(0, 12, 0, 0), k(16, 14, 0, 0), k(32, 12, 0, 0)] } } }),
  A({ id: 'clap', name: 'Хлопать', name_en: 'Clap', cat: 'emotion', icon: '👏', length: 16, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -72, -6, 0, 'in'), k(4, -72, -28, 0, 'out'), k(8, -72, -6, 0, 'in'), k(12, -72, -28, 0, 'out'), k(16, -72, -6, 0)] },
    left_arm: { rot: [k(0, -72, 6, 0, 'in'), k(4, -72, 28, 0, 'out'), k(8, -72, 6, 0, 'in'), k(12, -72, 28, 0, 'out'), k(16, -72, 6, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(4, 4, 0, 0), k(8, 0, 0, 0), k(12, 4, 0, 0), k(16, 0, 0, 0)] } },
    events: [{ t: 4, sound: 'minecraft:block.wool.place', vol: 0.7, pitch: 1.6 }, { t: 12, sound: 'minecraft:block.wool.place', vol: 0.7, pitch: 1.5 }] }),

  // ---------- бой ----------
  A({ id: 'attack', name: 'Ударить', name_en: 'Attack', cat: 'combat', icon: '⚔', length: 16, blendIn: 2, blendOut: 3, modes: { right_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(5, -165, 0, 15, 'in'), k(9, -30, 0, -5), k(16, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(5, 0, -20, 0, 'in'), k(9, 6, 25, 0), k(16, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(5, 0, 15, 0), k(9, 0, -15, 0), k(16, 0, 0, 0)] } } }),
  A({ id: 'die', name: 'Упасть', name_en: 'Fall down', cat: 'combat', icon: '💀', length: 30, stay: true, blendIn: 2, lockLegs: true, emote: false, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace' }, tracks: {
    root: { rot: [k(0, 0, 0, 0), k(6, 8, 0, 4), k(10, 8, 0, 4, 'bounce'), k(22, -90, 0, 0)], pos: [k(10, 0, 0, 0, 'bounce'), k(22, 0, -3, -2)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(6, -60, -30, 0), k(10, -60, -30, 0), k(22, -10, 0, 70)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(6, -60, 30, 0), k(10, -60, 30, 0), k(22, -10, 0, -70)] },
    head: { rot: [k(0, 0, 0, 0), k(6, 14, 0, 0), k(10, 14, 0, 0), k(22, -10, 20, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0), k(22, 0, 0, 8)] }, left_leg: { rot: [k(0, 0, 0, 0), k(22, 0, 0, -8)] } } }),

  // ---------- отдых и позы ----------
  A({ id: 'sit', name: 'Сесть на землю', name_en: 'Sit', cat: 'rest', icon: '🪑', length: 16, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(14, 0, 10, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -88, 4, 3)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -88, -4, -3)] },
    body: { rot: [k(0, 0, 0, 0, 'out'), k(14, -12, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, 30, 0, 12)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, 30, 0, -12)] },
    head: { rot: [k(0, 0, 0, 0), k(14, 8, 0, 0)] } } }),
  A({ id: 'sit_ground', name: 'Сидеть по-турецки', name_en: 'Sit cross-legged', cat: 'rest', icon: '🧘', length: 16, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace', left_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(14, 0, 10, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -90, -50, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(14, -90, 50, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, -40, -10, 8)] },
    left_arm: { rot: [k(0, 0, 0, 0, 'out'), k(14, -40, 10, -8)] },
    body: { rot: [k(0, 0, 0, 0), k(14, 6, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(14, -4, 0, 0)] } } }),
  A({ id: 'kneel', name: 'Встать на колено', name_en: 'Kneel', cat: 'rest', icon: '🧎', length: 14, stay: true, blendIn: 2, blendOut: 8, lockLegs: true, modes: { right_leg: 'replace', left_leg: 'replace', right_arm: 'replace' }, tracks: {
    root: { pos: [k(0, 0, 0, 0, 'out'), k(12, 0, 6, 0)] },
    right_leg: { rot: [k(0, 0, 0, 0, 'out'), k(12, -86, 0, 0)] },
    left_leg: { rot: [k(0, 0, 0, 0, 'out'), k(12, 60, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, 6, 0, 0)] },
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -40, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -4, 0, 0)] } } }),
  A({ id: 'sleep', name: 'Уснуть', name_en: 'Sleep', cat: 'rest', icon: '😴', length: 60, loop: true, blendIn: 14, blendOut: 10, lockLegs: true, emote: true, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace', head: 'replace' }, tracks: {
    root: { rot: [k(0, -90, 0, 0), k(60, -90, 0, 0)], pos: [k(0, 0, -3, -14), k(60, 0, -3, -14)] },
    body: { rot: [k(0, 0, 0, 0), k(30, -1.5, 0, 0), k(60, 0, 0, 0)] },
    head: { rot: [k(0, 0, 10, 0), k(30, -2, 12, 0), k(60, 0, 10, 0)] },
    right_arm: { rot: [k(0, 0, 0, 4), k(60, 0, 0, 4)] }, left_arm: { rot: [k(0, 0, 0, -4), k(60, 0, 0, -4)] },
    right_leg: { rot: [k(0, 0, 0, 2), k(60, 0, 0, 2)] }, left_leg: { rot: [k(0, 0, 0, -2), k(60, 0, 0, -2)] } },
    events: [{ t: 20, particle: 'minecraft:note', bone: 'head', count: 1, spread: 0.2 }] }),
  A({ id: 'crouch_idle', name: 'Присесть и ждать', name_en: 'Crouch', cat: 'rest', icon: '🫣', length: 40, loop: true, blendIn: 4, tracks: {
    body: { rot: [k(0, 26, 0, 0), k(20, 28, 0, 0), k(40, 26, 0, 0)], pos: [k(0, 0, 2.5, 0), k(40, 0, 2.5, 0)] },
    head: { rot: [k(0, -22, 0, 0), k(20, -24, 0, 0), k(40, -22, 0, 0)] },
    right_arm: { rot: [k(0, -15, 0, 0), k(40, -15, 0, 0)] }, left_arm: { rot: [k(0, -15, 0, 0), k(40, -15, 0, 0)] } } }),
  A({ id: 'arms_crossed', name: 'Скрестить руки', name_en: 'Arms crossed', cat: 'rest', icon: '🙎', length: 60, loop: true, blendIn: 6, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -55, -38, -12), k(60, -55, -38, -12)] },
    left_arm: { rot: [k(0, -50, 40, 12), k(60, -50, 40, 12)] },
    head: { rot: [k(0, 0, 0, 0), k(30, 2, 4, 0), k(60, 0, 0, 0)] },
    body: { pos: [k(0, 0, 0, 0), k(30, 0, -0.3, 0), k(60, 0, 0, 0)] } } }),
  A({ id: 'look_around', name: 'Оглядеться', name_en: 'Look around', cat: 'misc', icon: '👀', length: 60, tracks: {
    head: { rot: [k(0, 0, 0, 0), k(12, -5, -55, 0), k(24, -5, -55, 0), k(36, -3, 50, 0), k(48, -3, 50, 0), k(60, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, 0, -12, 0), k(24, 0, -12, 0), k(36, 0, 10, 0), k(48, 0, 10, 0), k(60, 0, 0, 0)] } } }),
  A({ id: 'stretch', name: 'Потянуться', name_en: 'Stretch', cat: 'misc', icon: '🙆', length: 60, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, 0, 0, 0), k(12, -175, 0, 8), k(48, -175, 0, 8), k(60, 0, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, 0), k(12, -175, 0, -8), k(48, -175, 0, -8), k(60, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0), k(12, -4, 0, 0), k(24, -4, 0, -12), k(36, -4, 0, 12), k(48, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0), k(12, 0, -1, 0), k(48, 0, -1, 0), k(60, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 0), k(12, -14, 0, 0), k(48, -14, 0, 0), k(60, 0, 0, 0)] } } }),

  // ---------- танцы ----------
  A({ id: 'dance', name: 'Танцевать', name_en: 'Dance', cat: 'dance', icon: '💃', length: 20, loop: true, lockLegs: true, modes: { right_arm: 'replace', left_arm: 'replace', right_leg: 'replace', left_leg: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -20, 0, 150), k(10, -20, 0, 30), k(20, -20, 0, 150)] },
    left_arm: { rot: [k(0, -20, 0, -30), k(10, -20, 0, -150), k(20, -20, 0, -30)] },
    body: { rot: [k(0, 0, 0, -6), k(10, 0, 0, 6), k(20, 0, 0, -6)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(5, 0, -1.5, 0, 'in'), k(10, 0, 0, 0, 'out'), k(15, 0, -1.5, 0, 'in'), k(20, 0, 0, 0)] },
    head: { rot: [k(0, 0, 0, 6), k(10, 0, 0, -6), k(20, 0, 0, 6)] },
    right_leg: { rot: [k(0, -20, 0, 0), k(10, 5, 0, 0), k(20, -20, 0, 0)] },
    left_leg: { rot: [k(0, 5, 0, 0), k(10, -20, 0, 0), k(20, 5, 0, 0)] } } }),
  A({ id: 'dance_robot', name: 'Танец робота', name_en: 'Robot dance', cat: 'dance', icon: '🤖', length: 32, loop: true, modes: { right_arm: 'replace', left_arm: 'replace' }, tracks: {
    right_arm: { rot: [k(0, -90, 0, 0, 'linear'), k(6, -90, 0, 0, 'linear'), k(8, 0, 0, 90, 'linear'), k(14, 0, 0, 90, 'linear'), k(16, -90, 0, 0, 'linear'), k(22, -90, 0, 0, 'linear'), k(24, -180, 0, 0, 'linear'), k(30, -180, 0, 0, 'linear'), k(32, -90, 0, 0)] },
    left_arm: { rot: [k(0, 0, 0, -90, 'linear'), k(6, 0, 0, -90, 'linear'), k(8, -90, 0, 0, 'linear'), k(14, -90, 0, 0, 'linear'), k(16, -180, 0, 0, 'linear'), k(22, -180, 0, 0, 'linear'), k(24, -90, 0, 0, 'linear'), k(30, -90, 0, 0, 'linear'), k(32, 0, 0, -90)] },
    head: { rot: [k(0, 0, 0, 0, 'linear'), k(6, 0, 0, 0, 'linear'), k(8, 0, 30, 0, 'linear'), k(14, 0, 30, 0, 'linear'), k(16, 0, 0, 0, 'linear'), k(22, 0, 0, 0, 'linear'), k(24, 0, -30, 0, 'linear'), k(30, 0, -30, 0, 'linear'), k(32, 0, 0, 0)] },
    body: { rot: [k(0, 0, 0, 0, 'linear'), k(6, 0, 0, 0, 'linear'), k(8, 0, 10, 0, 'linear'), k(14, 0, 10, 0, 'linear'), k(16, 0, 0, 0, 'linear'), k(22, 0, 0, 0, 'linear'), k(24, 0, -10, 0, 'linear'), k(30, 0, -10, 0, 'linear'), k(32, 0, 0, 0)] },
    root: { pos: [k(0, 0, 0, 0, 'out'), k(2, 0, -1, 0, 'in'), k(4, 0, 0, 0), k(8, 0, 0, 0, 'out'), k(10, 0, -1, 0, 'in'), k(12, 0, 0, 0), k(16, 0, 0, 0, 'out'), k(18, 0, -1, 0, 'in'), k(20, 0, 0, 0), k(24, 0, 0, 0, 'out'), k(26, 0, -1, 0, 'in'), k(28, 0, 0, 0)] } } })
];

/** Встроенная по id (копия — её можно править). */
export function builtinAnim(id) { const a = ANIM_LIBRARY.find((x) => x.id === id); return a ? JSON.parse(JSON.stringify(a)) : null; }
export const BUILTIN_IDS = ANIM_LIBRARY.map((a) => a.id);
