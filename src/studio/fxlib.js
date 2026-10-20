// Фаза 6 (трек A): библиотека эффектов и действий, запекание сцен, видео, переходы — общие данные и проверка.
// Этот файл входит в electron/studio-validate.cjs (scripts/sync-studio.cjs): одна проверка в окне Студии и при «Собрать».
// Чистые функции без импортов. Имена эффектов и поля совпадают с игрой (Kokk Story: StudioFxLib, StudioBakeData).

// ---------------- хэш запекания: тот же, что в игре (StudioBakeData.canon / hash) ----------------
// Хэш зависит только от того, что использует запекание: длина, измерение, якорь, подгрузка, ключи камеры, появление актёров,
// их «Идти»/«Переместить», место игрока в конце. Реплики, звуки и эффекты можно менять — запекание не устареет.
const fxR = (v) => (typeof v === 'number' && isFinite(v) ? String(Math.round(v * 100)) : '_');
const fxT = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const fxP = (p) => (Array.isArray(p) && p.length >= 3 ? fxR(p[0]) + ',' + fxR(p[1]) + ',' + fxR(p[2]) : '_');
const fxB = (v, def) => ((typeof v === 'boolean' ? v : def) ? '1' : '0');
const fxS = (o, k, def) => (o && o[k] !== undefined && o[k] !== null && typeof o[k] !== 'object' ? String(o[k]) : def);
const fxLook = (v) => (v === undefined || v === null ? '_' : Array.isArray(v) ? fxP(v) : typeof v === 'object' ? '_' : String(v));
const stableByT = (list) => list.map((x, i) => [x, i]).sort((a, b) => fxT(a[0].t) - fxT(b[0].t) || a[1] - b[1]).map((x) => x[0]);

export function bakeCanon(s) {
  const out = [];
  const tok = (x) => out.push(x);
  tok('v1');
  tok('len'); tok(fxR(s && s.length));
  const w = s && s.world && typeof s.world === 'object' ? s.world : null;
  tok('dim'); tok(fxS(w, 'dim', 'minecraft:overworld'));
  tok('anc'); { let a = fxS(w, 'anchor', ''); if (!a) a = fxS(w, 'origin', ''); tok(a); }
  const pre = s && s.preload && typeof s.preload === 'object' ? s.preload : null;
  tok('pre');
  tok(!pre || pre.radius === undefined || pre.radius === null ? '300' : fxR(pre.radius));
  tok(fxB(pre ? pre.alongCamera : undefined, true));
  if (pre && Array.isArray(pre.extra)) for (const e of pre.extra) { tok('x'); tok(Array.isArray(e) && e.length >= 2 ? fxR(e[0]) + ',' + fxR(e[1]) : '_'); }
  const keys = [];
  const acts = new Map();
  for (const t of (s && Array.isArray(s.tracks) ? s.tracks : [])) {
    if (!t || typeof t !== 'object') continue;
    if (t.kind === 'camera') { for (const k of Array.isArray(t.keys) ? t.keys : []) if (k && typeof k === 'object' && !Array.isArray(k)) keys.push(k); }
    else if (t.kind === 'actor') {
      if (!Array.isArray(t.events)) continue;
      const a = fxS(t, 'actor', '');
      if (!acts.has(a)) acts.set(a, []);
      for (const e of t.events) if (e && typeof e === 'object' && !Array.isArray(e)) acts.get(a).push(e);
    }
  }
  for (const k of stableByT(keys)) {
    tok('k'); tok(String(fxT(k.t))); tok(fxP(k.pos)); tok(fxR(k.yaw)); tok(fxR(k.pitch)); tok(fxR(k.fov)); tok(fxR(k.roll));
    tok(fxS(k, 'ease', 'smooth')); tok(fxLook(k.look)); tok(fxB(k.cut, false)); tok(fxB(k.back, false)); tok(fxR(k.shake));
  }
  for (const a of (s && Array.isArray(s.actors) ? s.actors : [])) {
    if (!a || typeof a !== 'object') continue;
    const sp = a.spawn && typeof a.spawn === 'object' ? a.spawn : null;
    tok('a'); tok(fxS(a, 'id', '')); tok(fxS(a, 'kind', '')); tok(fxP(sp ? sp.pos : null)); tok(fxR(sp ? sp.yaw : null)); tok(fxB(a.existing, false));
  }
  for (const [actor, evs] of acts) {
    for (const e of stableByT(evs)) {
      if (e.do !== 'walk' && e.do !== 'tp') continue;
      tok('e'); tok(actor); tok(e.do); tok(String(fxT(e.t)));
      if (Array.isArray(e.path)) for (const p of e.path) tok(fxP(p));
      tok(fxR(e.speed)); tok(fxP(e.pos)); tok(fxR(e.yaw));
    }
  }
  const ep = s && s.options && s.options.endPlayer && typeof s.options.endPlayer === 'object' ? s.options.endPlayer : null;
  tok('end'); tok(fxP(ep ? ep.pos : null));
  return out.join('|');
}
function hex8(h) { return (h >>> 0).toString(16).padStart(8, '0'); }
export function bakeHashText(c) {
  let h1 = 0x811c9dc5 | 0, h2 = 0x9747b28c | 0;
  const n = c.length;
  for (let i = 0; i < n; i++) {
    h1 ^= c.charCodeAt(i); h1 = Math.imul(h1, 16777619);
    h2 ^= c.charCodeAt(n - 1 - i); h2 = Math.imul(h2, 16777619);
  }
  return hex8(h1) + hex8(h2);
}
// сцена — в формате игры (normalizeScene / файл на диске)
export function sceneBakeHash(gameScene) { return bakeHashText(bakeCanon(gameScene)); }

// ---------------- видео ----------------
export const VIDEO_QUALITIES = [[480, '480p — 854×480'], [720, '720p — 1280×720'], [1080, '1080p — 1920×1080']];
export const VIDEO_FPS = [[20, '20 кадров/с (как тики)'], [30, '30 кадров/с (плавнее)']];
export const VIDEO_DEFAULT = { quality: 720, fps: 20, jpeg: 80, ship: false, use: true };
// бит на пиксель JPEG по качеству (замер на кадрах Minecraft: трава, камень, небо) — для оценки до записи
const BPP = [[30, 0.32], [50, 0.45], [60, 0.55], [70, 0.7], [80, 0.9], [85, 1.05], [90, 1.3], [95, 1.9], [100, 3.2]];
export function jpegBpp(q) {
  const x = Math.max(30, Math.min(100, Number(q) || 80));
  for (let i = 1; i < BPP.length; i++) if (x <= BPP[i][0]) { const [a, va] = BPP[i - 1], [b, vb] = BPP[i]; return va + (vb - va) * (x - a) / (b - a); }
  return BPP[BPP.length - 1][1];
}
export function videoOpts(scene) {
  const v = scene && scene.options && scene.options.video && typeof scene.options.video === 'object' ? scene.options.video : {};
  const n = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  return {
    quality: [480, 720, 1080].includes(n(v.quality, 0)) ? v.quality : VIDEO_DEFAULT.quality,
    fps: [20, 30].includes(n(v.fps, 0)) ? v.fps : VIDEO_DEFAULT.fps,
    jpeg: Math.max(50, Math.min(95, Math.round(n(v.jpeg, VIDEO_DEFAULT.jpeg)))),
    ship: v.ship === true,
    use: v.use !== false
  };
}
// оценка размера: кадров = длина × fps / 20; байт = ширина × высота × bpp / 8 (+ заголовки). Реальный размер ±40 % — зависит от сцены
export function videoEstimate(lengthTicks, h, fps, jpeg) {
  const H = h - (h % 2), W = Math.round(H * 16 / 9) - (Math.round(H * 16 / 9) % 2);
  const frames = Math.ceil(Math.max(1, lengthTicks || 1) * (fps || 20) / 20);
  const per = Math.round(W * H * jpegBpp(jpeg) / 8) + 700;
  return { w: W, h: H, frames, bytesPerFrame: per, bytes: frames * per + 4096, perMinute: Math.round(per * (fps || 20) * 60) };
}
export function fmtSize(n) {
  if (!(n >= 0)) return '?';
  if (n < 1024) return n + ' Б';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' МБ';
  return (n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' ГБ';
}

// ---------------- переходы ----------------
export const TRANSITION_DEFAULT = { on: false, to: { dim: 'minecraft:overworld', pos: null, yaw: 0, pitch: 0 }, loadWhile: true, maxWait: 15, fadeIn: 20 };
// spec: { video?, scene?, to:{dim,pos,yaw,pitch}, loadWhile, maxWait, fadeIn }; add(sev, msg)
export function checkTransition(spec, where, add, E, W, refs) {
  refs = refs || {};
  if (!spec || typeof spec !== 'object') { add(E, where + ': переход повреждён'); return; }
  const to = spec.to && typeof spec.to === 'object' ? spec.to : null;
  if (!to || !isP3fx(to.pos)) add(E, where + ': не задано, куда перенести (x y z)');
  if (to && to.dim && !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(String(to.dim))) add(E, where + ': измерение пиши вида minecraft:the_nether');
  if (spec.maxWait !== undefined && !(typeof spec.maxWait === 'number' && spec.maxWait >= 1 && spec.maxWait <= 120)) add(E, where + ': ждать загрузку — от 1 до 120 секунд');
  if (spec.fadeIn !== undefined && !(typeof spec.fadeIn === 'number' && spec.fadeIn >= 0 && spec.fadeIn <= 200)) add(E, where + ': проявление — от 0 до 200 тиков');
  for (const k of ['video', 'scene']) {
    if (spec[k] && refs.scenes && !refs.scenes.includes(spec[k])) add(E, where + ': в проекте нет сцены «' + spec[k] + '»' + (k === 'video' ? ' (видео записывается со сцены)' : ''));
  }
  if (!spec.video && !spec.scene) add(W, where + ': без видео и сцены — игрок увидит только экран «загрузка», пока место грузится');
}
function isP3fx(p) { return Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && isFinite(v)); }

// ---------------- библиотека эффектов ----------------
// группы палитры «Эффекты»
export const FX_GROUPS = [
  ['screen', 'Экран', 'Как выглядит кадр: цвет, размытие, виньетка, зерно, тряска, рывок зума, замедление времени.'],
  ['world', 'Мир', 'Что происходит в мире: молния, взрыв, салют, частицы, обломки, трещины, залить блоками, постройка появляется.'],
  ['beings', 'Существа', 'Что происходит с актёром: появиться и исчезнуть с эффектом, подсветка, невидимость, взлететь, отбросить, поджечь, значок над головой.'],
  ['gestures', 'Жесты', 'Движения актёров: помахать, поклониться, кивнуть, сесть, уснуть, упасть, обрадоваться, заплакать…'],
  ['sound', 'Звук', 'Звук в мире с затуханием по расстоянию, фоновая петля (ветер, дождь, лес), звук от актёра.']
];
const ft = (k, label, def, hint) => ({ k, label, type: 'ticks', def, min: 0, hint: hint || 'В тиках: 20 = 1 секунда.' });
const fn = (k, label, step, min, max, hint) => ({ k, label, type: 'num', step, min, max, hint });
const fpos = (hint, k = 'pos', label = 'Место') => ({ k, label, type: 'pos', source: 'sel', hint: hint || 'Точка в мире: x y z. «Взять из игры» — блок, на который смотришь.' });
const fcol = (k, label, hint) => ({ k, label, type: 'color', hint });
const fsel = (k, label, options, hint) => ({ k, label, type: 'select', options, hint });
const fb = (k, label, hint) => ({ k, label, type: 'bool', hint });
const IN_OUT = [ft('in', 'Нарастание', 10, 'За сколько тиков эффект входит в силу (0 — сразу).'), ft('out', 'Спад', 10, 'За сколько тиков эффект уходит.')];
const LONG = ft('ticks', 'Длительность', 0, 'Сколько всего длится, в тиках (20 = 1 с). 0 — до конца сцены (или до следующего такого же эффекта).');
const tl = (e, d) => (e.ticks > 0 ? e.ticks : d);

export const FX_LIB = {
  // ---- экран ----
  fade_color: { group: 'screen', track: 'fx', label: 'Затемнение цветом', icon: 'fade', color: '#c59cf0', hint: 'Экран уходит в цвет и обратно: белая вспышка памяти, красный «удар», чёрная склейка. Нарастание → держится → спад.',
    def: { color: '#000000', in: 20, hold: 20, out: 20 }, dur: (e) => (e.in || 0) + (e.hold || 0) + (e.out || 0),
    fields: [fcol('color', 'Цвет', 'В какой цвет уходит экран.'), ft('in', 'Нарастание', 20, 'За сколько тиков экран станет цветом.'), ft('hold', 'Держится', 20, 'Сколько тиков экран полностью цветом.'), ft('out', 'Спад', 20, 'За сколько тиков картинка вернётся.')] },
  vignette: { group: 'screen', track: 'fx', label: 'Виньетка', icon: 'vignette', color: '#c59cf0', hint: 'Края кадра темнеют (или окрашиваются) — взгляд тянется в центр. Хорошо для воспоминаний и тревоги.',
    def: { power: 0.6, color: '#000000', ticks: 0, in: 20, out: 20 }, dur: (e) => tl(e, 60),
    fields: [fn('power', 'Сила', 0.05, 0, 1, '0 — нет, 0,6 — заметно, 1 — края почти в цвет.'), fcol('color', 'Цвет', 'Обычно чёрный; тёмно-красный — тревога.'), LONG, ...IN_OUT] },
  blur: { group: 'screen', track: 'fx', label: 'Размытие', icon: 'blur', color: '#c59cf0', hint: 'Кадр расплывается: обморок, сон, переход «в воспоминание».',
    def: { radius: 4, ticks: 60, in: 20, out: 20 }, dur: (e) => tl(e, 60),
    fields: [fn('radius', 'Радиус', 0.5, 0, 16, '1–2 — чуть мягче, 4 — заметно, 10 — почти ничего не видно.'), LONG, ...IN_OUT] },
  grade: { group: 'screen', track: 'fx', label: 'Цвет кадра', icon: 'grade', color: '#c59cf0', hint: 'Цветокоррекция: оттенок, яркость, контраст, насыщенность. Тёплый закат, холодная ночь, «старое кино».',
    def: { tint: '#ffd9a0', mix: 0.35, brightness: 0, contrast: 1, saturation: 1, ticks: 0, in: 20, out: 20 }, dur: (e) => tl(e, 80),
    fields: [fcol('tint', 'Оттенок', 'Цвет, в который подкрашивается кадр.'), fn('mix', 'Сила оттенка', 0.05, 0, 1, '0 — без оттенка, 0,3 — мягко, 1 — сильно.'), fn('brightness', 'Яркость', 0.05, -1, 1, '0 — как есть; −0,2 — темнее; 0,2 — светлее.'), fn('contrast', 'Контраст', 0.05, 0, 3, '1 — как есть; 1,3 — резче; 0,8 — мягче.'), fn('saturation', 'Насыщенность', 0.05, 0, 3, '1 — как есть; 0 — чёрно-белое; 1,4 — сочнее.'), LONG, ...IN_OUT] },
  desaturate: { group: 'screen', track: 'fx', label: 'Обесцветить', icon: 'desat', color: '#c59cf0', hint: 'Цвет уходит из кадра: прошлое, горе, «время остановилось».',
    def: { amount: 1, ticks: 0, in: 30, out: 30 }, dur: (e) => tl(e, 80),
    fields: [fn('amount', 'Сколько', 0.05, 0, 1, '1 — совсем чёрно-белое, 0,5 — блёклое.'), LONG, ...IN_OUT] },
  chromatic: { group: 'screen', track: 'fx', label: 'Цветной сдвиг', icon: 'chroma', color: '#c59cf0', hint: 'Красный и синий расходятся к краям — магия, удар, «сбой реальности».',
    def: { power: 0.5, ticks: 30, in: 4, out: 16 }, dur: (e) => tl(e, 30),
    fields: [fn('power', 'Сила', 0.05, 0, 1, '0,2 — чуть заметно, 1 — сильно.'), LONG, ...IN_OUT] },
  grain: { group: 'screen', track: 'fx', label: 'Плёночное зерно', icon: 'grain', color: '#c59cf0', hint: 'Мелкий шум, как на старой плёнке.',
    def: { power: 0.35, ticks: 0, in: 10, out: 10 }, dur: (e) => tl(e, 80),
    fields: [fn('power', 'Сила', 0.05, 0, 1, '0,2 — едва заметно, 0,5 — явно.'), LONG, ...IN_OUT] },
  slowmo: { group: 'screen', track: 'fx', label: 'Замедление времени', icon: 'slowmo', color: '#c59cf0', hint: 'Весь мир замедляется (камера, существа, частицы), потом время возвращается. Работает, когда в мире только зрители сцены (одиночная игра).',
    def: { scale: 0.4, ticks: 60, in: 6, out: 10 }, dur: (e) => e.ticks || 60,
    fields: [fn('scale', 'Скорость', 0.05, 0.05, 1, '0,5 — в два раза медленнее, 0,2 — в пять.'), ft('ticks', 'Сколько тиков сцены', 60, 'Сколько тиков сцены идёт замедленно (в настоящем времени дольше).'), ft('in', 'Вход', 6, 'Плавный вход в замедление.'), ft('out', 'Выход', 10, 'Плавный выход.'), fb('force', 'Замедлить всех', 'Замедлить, даже если в мире есть игроки не из сцены (они тоже окажутся в замедлении).')] },
  shake_preset: { group: 'screen', track: 'fx', label: 'Тряска (готовая)', icon: 'shake', color: '#c59cf0', hint: 'Готовые тряски камеры: взрыв, землетрясение, «с рук», удар, гул. Работает и без камеры сцены.',
    def: { preset: 'explosion', power: 1, ticks: 18 }, dur: (e) => e.ticks || 18,
    fields: [fsel('preset', 'Вид', [['explosion', 'Взрыв'], ['earthquake', 'Землетрясение'], ['handheld', 'Съёмка с рук'], ['impact', 'Удар'], ['rumble', 'Гул']], 'Характер тряски.'), fn('power', 'Сила', 0.1, 0, 5, '1 — обычно; игрок может ослабить тряску в настройках.'), ft('ticks', 'Длительность', 18)] },
  zoom_punch: { group: 'screen', track: 'fx', label: 'Рывок зума', icon: 'zoom', color: '#c59cf0', hint: 'Короткий рывок угла обзора: камера «вздрагивает» к герою и обратно.',
    def: { fov: -15, in: 3, hold: 4, out: 12 }, dur: (e) => (e.in || 3) + (e.hold || 4) + (e.out || 12),
    fields: [fn('fov', 'Угол, °', 1, -60, 60, 'Минус — приблизить, плюс — отдалить.'), ft('in', 'Рывок', 3), ft('hold', 'Держится', 4), ft('out', 'Возврат', 12)] },
  // ---- мир ----
  lightning: { group: 'world', track: 'world', label: 'Молния', icon: 'lightning', color: '#e8a070', hint: 'Удар молнии в точку: вспышка и гром. По умолчанию — только картинка (ничего не горит).',
    def: { pos: null, real: false }, dur: () => 20,
    fields: [fpos('Куда бьёт молния.'), fb('real', 'Настоящая', 'Настоящая молния поджигает и ранит. Выключено — только вспышка и звук.')] },
  explosion: { group: 'world', track: 'world', label: 'Взрыв', icon: 'explosion', color: '#e8a070', hint: 'Взрыв: облако, звук и тряска. «Настоящий» ранит и может ломать блоки (после сцены они не вернутся).',
    def: { pos: null, power: 3, real: false, fire: false, blocks: false, shake: true }, dur: () => 20,
    fields: [fpos('Где взрыв.'), fn('power', 'Сила', 0.5, 0.1, 12, '1 — хлопок, 3 — как крипер, 4 — динамит, 6+ — очень сильно.'), fb('real', 'Настоящий', 'Ранит существ рядом. Без этого — только картинка и звук.'), fb('blocks', 'Ломает блоки', 'Настоящий взрыв разрушит блоки (нужно «Настоящий»).'), fb('fire', 'Поджигает', 'Настоящий взрыв поджигает вокруг.'), fb('shake', 'Трясти камеру', 'Тряска экрана у зрителей.')] },
  fireworks: { group: 'world', track: 'world', label: 'Салют', icon: 'fireworks', color: '#e8a070', hint: 'Ракеты фейерверка: взлетают и рассыпаются выбранными цветами.',
    def: { pos: null, count: 5, shape: 'large_ball', colors: ['#ff5040', '#ffd040', '#40a0ff'], fade: [], flight: 1, spread: 4, trail: true, twinkle: false }, dur: (e) => 20 + (e.flight || 1) * 20,
    fields: [fpos('Откуда взлетают ракеты.'), { k: 'count', label: 'Ракет', type: 'int', min: 1, max: 40, hint: 'Сколько ракет сразу.' }, fsel('shape', 'Форма', [['ball', 'Шар'], ['large_ball', 'Большой шар'], ['star', 'Звезда'], ['creeper', 'Крипер'], ['burst', 'Взрыв']], 'Форма вспышки.'), { k: 'colors', label: 'Цвета', type: 'colors', hint: 'Цвета вспышки, через запятую: #ff5040, #ffd040.' }, { k: 'fade', label: 'Угасают в', type: 'colors', hint: 'В какие цвета угасают искры (можно пусто).' }, { k: 'flight', label: 'Высота', type: 'int', min: 0, max: 3, hint: '0 — низко, 3 — высоко.' }, fn('spread', 'Разброс', 0.5, 0, 32, 'В каком радиусе от точки взлетают ракеты.'), fb('trail', 'След', 'Искры оставляют след.'), fb('twinkle', 'Мерцание', 'Искры мерцают.')] },
  emitter: { group: 'world', track: 'world', label: 'Частицы (излучатель)', icon: 'emitter', color: '#e8a070', hint: 'Поток частиц какое-то время: дым, угли, магия, листопад, пыль, искры, дождь, снег. Из точки, коробки, шара, линии или по пути.',
    def: { preset: 'smoke', shape: 'point', pos: null, size: [4, 2, 4], radius: 3, rate: 6, ticks: 60, speed: 0.02 }, dur: (e) => e.ticks || 60,
    fields: [fsel('preset', 'Что', [['smoke', 'Дым'], ['embers', 'Угли'], ['magic', 'Магия'], ['leaves', 'Листопад'], ['dust', 'Пыль'], ['sparks', 'Искры'], ['rain', 'Капли'], ['snow', 'Снег'], ['hearts', 'Сердечки'], ['soul', 'Синий огонь'], ['bubbles', 'Пузыри'], ['custom', 'Свои частицы…']], 'Набор частиц.'),
      { k: 'particle', label: 'Свои частицы', type: 'id', list: 'particles', when: (e) => e.preset === 'custom', hint: 'id частиц, например minecraft:end_rod.' },
      fsel('shape', 'Форма', [['point', 'Точка'], ['box', 'Коробка'], ['sphere', 'Шар'], ['line', 'Линия'], ['path', 'По пути']], 'Откуда идут частицы.'),
      { ...fpos('Центр (для линии — начало).'), when: (e) => e.shape !== 'path' },
      { k: 'size', label: 'Размер коробки', type: 'vec3', when: (e) => e.shape === 'box', hint: 'Ширина, высота, глубина в блоках.' },
      { ...fn('radius', 'Радиус шара', 0.5, 0.5, 64, 'В блоках.'), when: (e) => e.shape === 'sphere' },
      { ...fpos('Конец линии.', 'to', 'Конец'), when: (e) => e.shape === 'line' },
      { k: 'path', label: 'Путь', type: 'path', when: (e) => e.shape === 'path', hint: 'Точки пути; частицы идут вдоль него.' },
      fn('rate', 'Частиц за тик', 0.5, 0.1, 200, '2–10 обычно хватает.'), ft('ticks', 'Длительность', 60), fn('speed', 'Скорость', 0.01, 0, 2, 'Как быстро разлетаются.')] },
  debris: { group: 'world', track: 'world', label: 'Обломки', icon: 'debris', color: '#e8a070', hint: 'Осколки блока разлетаются и сыплется пыль. «Настоящие» — блоки вокруг правда падают вниз (меняет мир).',
    def: { pos: null, block: 'minecraft:cobblestone', count: 40, radius: 3, power: 1, real: false }, dur: () => 20,
    fields: [fpos('Где.'), { k: 'block', label: 'Блок', type: 'id', list: 'blocks', hint: 'Из чего обломки, например minecraft:stone_bricks.' }, { k: 'count', label: 'Сколько', type: 'int', min: 1, max: 400, hint: 'Сколько осколков.' }, fn('radius', 'Радиус', 0.5, 0.5, 16, 'В блоках.'), fn('power', 'Сила', 0.1, 0, 10, 'Как далеко разлетаются.'), fb('real', 'Настоящие', 'Блоки вокруг (под которыми пусто) срываются и падают. Мир меняется.')] },
  crack: { group: 'world', track: 'world', label: 'Трещины в блоке', icon: 'crack', color: '#e8a070', hint: 'Блок трескается стадия за стадией (как при добыче) — и может разрушиться в конце.',
    def: { pos: null, ticks: 40, break: false, keep: false }, dur: (e) => e.ticks || 40,
    fields: [{ ...fpos('Какой блок трескается.'), exact: true }, ft('ticks', 'За сколько', 40, 'За сколько тиков трещины дойдут до конца.'), fb('break', 'Разрушить в конце', 'Блок ломается (без выпадения предмета).'), fb('keep', 'Оставить трещины', 'Трещины остаются после конца (иначе исчезают).')] },
  fill: { group: 'world', track: 'world', label: 'Залить блоками', icon: 'fill', color: '#e8a070', hint: 'Залить коробку блоком (стены, пол, коробка изнутри пустая, рёбра). Можно постепенно и с возвратом в конце.',
    def: { from: null, to: null, block: 'minecraft:stone', shape: 'solid', ticks: 1, removeAtEnd: false }, dur: (e) => Math.max(10, e.ticks || 1),
    fields: [{ ...fpos('Первый угол.', 'from', 'Угол 1'), exact: true }, { ...fpos('Второй угол.', 'to', 'Угол 2'), exact: true }, { k: 'block', label: 'Блок', type: 'id', list: 'blocks', hint: 'Каким блоком: minecraft:oak_planks, minecraft:air (стереть)…' }, fsel('shape', 'Форма', [['solid', 'Сплошь'], ['hollow', 'Коробка (внутри пусто)'], ['walls', 'Только стены'], ['outline', 'Только рёбра']], 'Что заливать.'), ft('ticks', 'За сколько', 1, 'За сколько тиков поставить всё (1 — сразу).'), fb('removeAtEnd', 'Вернуть в конце', 'Когда сцена кончится, всё вернётся как было.')] },
  structure_anim: { group: 'world', track: 'world', label: 'Постройка появляется', icon: 'structure', color: '#e8a070', hint: 'Постройка из библиотеки появляется (слоями снизу вверх, вразброс, поднимается из земли) или исчезает (сверху вниз, растворяется, уходит под землю).',
    def: { structure: '', pos: null, rot: 0, mode: 'show', anim: 'layers', ticks: 60, removeAtEnd: false }, dur: (e) => e.ticks || 60,
    fields: [{ k: 'structure', label: 'Постройка', type: 'structRef', hint: 'Постройка из библиотеки «Строительства».' }, { ...fpos('Угол постройки (наименьшие x y z).'), exact: true }, fsel('rot', 'Поворот', [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], 'Поворот вокруг вертикали.'), fsel('mode', 'Что', [['show', 'Появляется'], ['hide', 'Исчезает']], 'Появиться или исчезнуть.'), fsel('anim', 'Как', [['layers', 'Слоями'], ['random', 'Вразброс (растворение)'], ['rise', 'Из земли / под землю'], ['instant', 'Сразу']], '«Из земли» — блоки плавно выезжают (до 1500 блоков; больше — слоями).'), ft('ticks', 'За сколько', 60), fb('removeAtEnd', 'Вернуть в конце', 'Когда сцена кончится, всё вернётся как было.')] },
  // ---- звук ----
  sound3d: { group: 'sound', track: 'sound', label: 'Звук в мире (3D)', icon: 'sound', color: '#7cc4f5', hint: 'Звук из точки или от актёра: тише с расстоянием, слышен до «дальности» блоков.',
    def: { id: 'minecraft:block.bell.use', pos: null, vol: 1, pitch: 1, range: 32 }, dur: () => 20,
    fields: [{ k: 'id', label: 'Звук', type: 'id', list: 'sounds', hint: 'id звука, например minecraft:entity.wolf.howl.' }, { ...fpos('Откуда звучит. Пусто — у камеры.'), nullable: true }, { k: 'actor', label: 'От актёра', type: 'actorRef', hint: 'Звук идёт от актёра и двигается с ним (вместо места).' }, fn('vol', 'Громкость', 0.1, 0, 10, '1 — обычная.'), fn('pitch', 'Высота', 0.05, 0.5, 2, '1 — как есть.'), fn('range', 'Дальность', 1, 1, 256, 'На сколько блоков слышно.')] },
  ambience: { group: 'sound', track: 'sound', label: 'Фон (петля)', icon: 'loop', color: '#7cc4f5', hint: 'Фоновый звук по кругу: ветер, дождь, лес, пещера. Плавно входит; уходит по «Фон стоп» или в конце сцены.',
    def: { id: 'minecraft:ambient.cave', vol: 0.8, in: 40, loop: true }, dur: () => 60,
    fields: [{ k: 'id', label: 'Звук', type: 'id', list: 'sounds', hint: 'id звука.' }, fn('vol', 'Громкость', 0.05, 0, 2, '0,8 — фоном.'), ft('in', 'Нарастание', 40), fb('loop', 'По кругу', 'Повторять, пока не остановят.')] },
  ambience_stop: { group: 'sound', track: 'sound', label: 'Фон стоп', icon: 'stop', color: '#7cc4f5', hint: 'Плавно заглушить фоновую петлю.', def: { out: 40 }, dur: (e) => e.out || 40, fields: [ft('out', 'Затухание', 40)] },
  // ---- существа (дорожка актёра) ----
  appear: { group: 'beings', track: 'actor', label: 'Появиться с эффектом', icon: 'appear', color: '#6ee7a0', hint: 'Актёр становится видимым с облачком, дымом, магией, вспышкой или молнией. Чтобы он был спрятан до этого — «Невидимость» в начале.',
    def: { effect: 'poof' }, dur: () => 20, fields: [fsel('effect', 'Эффект', [['poof', 'Облачко'], ['smoke', 'Дым'], ['magic', 'Магия'], ['flash', 'Вспышка'], ['lightning', 'Молния'], ['none', 'Без эффекта']], 'Как появляется.')] },
  vanish: { group: 'beings', track: 'actor', label: 'Исчезнуть с эффектом', icon: 'vanish', color: '#6ee7a0', hint: 'Актёр пропадает с облачком, дымом или магией.',
    def: { effect: 'poof', remove: false }, dur: () => 20, fields: [fsel('effect', 'Эффект', [['poof', 'Облачко'], ['smoke', 'Дым'], ['magic', 'Магия'], ['flash', 'Вспышка'], ['lightning', 'Молния'], ['none', 'Без эффекта']], 'Как исчезает.'), fb('remove', 'Убрать совсем', 'Убрать из мира (только актёров, поставленных сценой). Иначе — просто невидим.')] },
  glow: { group: 'beings', track: 'actor', label: 'Подсветка контуром', icon: 'glow', color: '#6ee7a0', hint: 'Светящийся контур сквозь стены — «вот он».', def: { on: true }, dur: () => 20, fields: [fb('on', 'Включить', 'Включить или выключить контур.')] },
  invisible: { group: 'beings', track: 'actor', label: 'Невидимость', icon: 'invis', color: '#6ee7a0', hint: 'Спрятать или показать актёра без эффектов.', def: { on: true }, dur: () => 20, fields: [fb('on', 'Невидим', 'Включить невидимость.')] },
  levitate: { group: 'beings', track: 'actor', label: 'Взлететь', icon: 'levitate', color: '#6ee7a0', hint: 'Актёр плавно поднимается (или опускается — минус) и висит.', def: { height: 2, ticks: 40 }, dur: (e) => e.ticks || 40,
    fields: [fn('height', 'Высота', 0.5, -32, 32, 'На сколько блоков вверх (минус — вниз).'), ft('ticks', 'За сколько', 40)] },
  push: { group: 'beings', track: 'actor', label: 'Отбросить', icon: 'push', color: '#6ee7a0', hint: 'Актёра отбрасывает дугой (от игрока или по направлению).', def: { power: 1, ticks: 10 }, dur: (e) => e.ticks || 10,
    fields: [fn('power', 'Сила', 0.1, 0, 10, '1 — на 2,5 блока.'), { k: 'dir', label: 'Направление', type: 'vec3', hint: 'Куда отбросить (x y z). Пусто — от игрока.' }, ft('ticks', 'За сколько', 10)] },
  effect: { group: 'beings', track: 'actor', label: 'Эффект зелья', icon: 'potion', color: '#6ee7a0', hint: 'Дать актёру эффект: свечение, медлительность, невидимость…', def: { effect: 'minecraft:glowing', seconds: 5, level: 1 }, dur: (e) => Math.round((e.seconds || 5) * 20),
    fields: [{ k: 'effect', label: 'Эффект', type: 'id', list: 'effects', hint: 'id эффекта.' }, fn('seconds', 'Секунд', 1, 1, 3600, 'Сколько длится.'), { k: 'level', label: 'Уровень', type: 'int', min: 1, max: 10, hint: '1 — обычный.' }] },
  ignite: { group: 'beings', track: 'actor', label: 'Поджечь', icon: 'fire', color: '#6ee7a0', hint: 'Актёр горит (актёры сцены неуязвимы — только картинка).', def: { seconds: 3 }, dur: (e) => Math.round((e.seconds || 3) * 20), fields: [fn('seconds', 'Секунд', 1, 1, 60, 'Сколько горит.')] },
  actor_sound: { group: 'sound', track: 'actor', label: 'Звук от актёра', icon: 'sound', color: '#6ee7a0', hint: 'Звук, который идёт от актёра и движется с ним.', def: { id: 'minecraft:entity.villager.ambient', vol: 1, pitch: 1 }, dur: () => 20,
    fields: [{ k: 'id', label: 'Звук', type: 'id', list: 'sounds', hint: 'id звука.' }, fn('vol', 'Громкость', 0.1, 0, 10, '1 — обычная.'), fn('pitch', 'Высота', 0.05, 0.5, 2, '1 — как есть.')] },
  emote: { group: 'beings', track: 'actor', label: 'Значок над головой', icon: 'emote', color: '#6ee7a0', hint: 'Облачко над головой: «!», «?», «…», сердце, злость, нота, сон, капля, идея.', def: { icon: '!', ticks: 50 }, dur: (e) => e.ticks || 50,
    fields: [fsel('icon', 'Значок', [['!', '! — заметил'], ['?', '? — не понял'], ['...', '… — молчит'], ['heart', 'сердце'], ['anger', 'злость'], ['note', 'нота'], ['zzz', 'сон'], ['sweat', 'капля (неловко)'], ['idea', 'идея']], 'Что показать.'), ft('ticks', 'Сколько', 50)] }
};
// жесты (событие «Анимация» на дорожке актёра): у жителей долины — их собственные позы, у остальных — общий слой поз
export const GESTURES = [
  ['wave', 'Помахать'], ['point', 'Показать рукой'], ['nod', 'Кивнуть'], ['shake_head', 'Покачать головой'], ['bow', 'Поклониться'], ['kneel', 'На колено'],
  ['sit', 'Сесть'], ['sleep', 'Уснуть'], ['cheer', 'Обрадоваться'], ['cry', 'Заплакать'], ['talk', 'Жестикулировать'], ['look_around', 'Оглядеться'],
  ['pick_up', 'Поднять'], ['give', 'Отдать'], ['attack', 'Ударить'], ['die', 'Упасть'], ['crouch', 'Присесть'], ['run', 'Бежать (наклон)'], ['stand', 'Встать (снять позу)']
];
export const GESTURE_HINT = {
  wave: 'Машет рукой.', point: 'Показывает рукой вперёд.', nod: 'Кивает головой (да).', shake_head: 'Качает головой (нет).', bow: 'Кланяется.', kneel: 'Встаёт на колено.',
  sit: 'Садится.', sleep: 'Ложится спать.', cheer: 'Подпрыгивает от радости.', cry: 'Плачет: опускает голову, капают слёзы.', talk: 'Жестикулирует, говоря.', look_around: 'Оглядывается по сторонам.',
  pick_up: 'Наклоняется и поднимает.', give: 'Протягивает руку — отдаёт.', attack: 'Замах и удар.', die: 'Падает на землю (и лежит).', crouch: 'Приседает.', run: 'Наклон вперёд, как на бегу (скорость — у «Идти»).', stand: 'Снять позу — встать как обычно.'
};
export const FX_TRACK_VERBS = (() => {
  const m = { fx: [], world: [], sound: [], actor: [] };
  for (const [k, d] of Object.entries(FX_LIB)) m[d.track].push(k);
  return m;
})();
export function fxDef(verb) { return FX_LIB[verb] || null; }
export function fxNewEvent(verb, t) {
  const d = FX_LIB[verb];
  if (!d) return null;
  return JSON.parse(JSON.stringify({ t: Math.max(0, Math.round(t || 0)), do: verb, ...d.def }));
}

// проверка события библиотеки в сцене (validateScene) или действия {fx: …} в схеме: add(sev, msg, sel)
const COLOR = /^#[0-9a-fA-F]{6}$/;
const RESID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const STATE = /^[a-z0-9_.-]+:[a-z0-9_./-]+(\[[a-z0-9_=,]*\])?$/;
function numIn(e, k, lo, hi) { return e[k] === undefined || e[k] === null || (typeof e[k] === 'number' && isFinite(e[k]) && e[k] >= lo && e[k] <= hi); }
export function checkFxEvent(verb, e, where, add, sel, E, W, refs) {
  refs = refs || {};
  const d = FX_LIB[verb];
  if (!d) { add(E, where + ': неизвестный эффект «' + verb + '»', sel); return; }
  const rng = (k, lo, hi, what) => { if (!numIn(e, k, lo, hi)) add(E, where + ': ' + what + ' — число от ' + String(lo).replace('.', ',') + ' до ' + String(hi).replace('.', ','), sel); };
  // в схемах место может быть «player», «event», имя или {of, offset}; без места — место события
  const okCtx = (v) => refs.ctxPos && (v === undefined || v === null || typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && v.of));
  const needPos = (k = 'pos', what = 'место') => { if (!isP3fx(e[k]) && !okCtx(e[k])) add(E, where + ': не задано ' + what + ' (x y z) — «Взять из игры»', sel); };
  if (e.ticks !== undefined && e.ticks !== null && !(typeof e.ticks === 'number' && e.ticks >= 0 && e.ticks <= 36000)) add(E, where + ': длительность — тики от 0 до 36000', sel);
  for (const k of ['in', 'out', 'hold']) if (e[k] !== undefined && !(typeof e[k] === 'number' && e[k] >= 0 && e[k] <= 6000)) add(E, where + ': «' + ({ in: 'нарастание', out: 'спад', hold: 'держится' })[k] + '» — тики от 0', sel);
  for (const k of ['color', 'tint']) if (e[k] !== undefined && e[k] !== null && !COLOR.test(String(e[k]))) add(E, where + ': цвет пиши вида #ff8040', sel);
  switch (verb) {
    case 'vignette': rng('power', 0, 1, 'сила'); break;
    case 'blur': rng('radius', 0, 16, 'радиус'); if (e.radius > 8) add(W, where + ': радиус больше 8 — почти ничего не видно', sel); break;
    case 'grade': rng('mix', 0, 1, 'сила оттенка'); rng('brightness', -1, 1, 'яркость'); rng('contrast', 0, 3, 'контраст'); rng('saturation', 0, 3, 'насыщенность'); break;
    case 'desaturate': rng('amount', 0, 1, 'сколько'); break;
    case 'chromatic': case 'grain': rng('power', 0, 1, 'сила'); break;
    case 'slowmo':
      rng('scale', 0.05, 1, 'скорость');
      if (!e.force) add(W, where + ': замедляется весь мир — сработает, только если в мире одни зрители сцены (иначе «Замедлить всех»)', sel);
      break;
    case 'shake_preset': if (!['explosion', 'earthquake', 'handheld', 'impact', 'rumble'].includes(e.preset)) add(E, where + ': вид тряски не выбран', sel); rng('power', 0, 5, 'сила'); break;
    case 'zoom_punch': rng('fov', -60, 60, 'угол'); break;
    case 'lightning': needPos(); if (e.real) add(W, where + ': настоящая молния поджигает и ранит', sel); break;
    case 'explosion':
      needPos(); rng('power', 0.1, 12, 'сила');
      if (e.real && e.blocks) add(W, where + ': настоящий взрыв ломает блоки — после сцены они не вернутся (в тестовой игре F5 вернутся)', sel);
      if (!e.real && (e.blocks || e.fire)) add(W, where + ': «ломает блоки» и «поджигает» работают только у настоящего взрыва', sel);
      break;
    case 'fireworks':
      needPos(); rng('count', 1, 40, 'ракет'); rng('flight', 0, 3, 'высота'); rng('spread', 0, 32, 'разброс');
      if (!['ball', 'large_ball', 'star', 'creeper', 'burst'].includes(e.shape || 'ball')) add(E, where + ': неизвестная форма салюта', sel);
      for (const k of ['colors', 'fade']) if (e[k] !== undefined && !(Array.isArray(e[k]) && e[k].every((c) => COLOR.test(String(c))))) add(E, where + ': цвета салюта — список вида #ff5040, #ffd040', sel);
      if (!Array.isArray(e.colors) || !e.colors.length) add(W, where + ': цвета не выбраны — будет золотой', sel);
      break;
    case 'emitter': {
      const presets = ['smoke', 'embers', 'magic', 'leaves', 'dust', 'sparks', 'rain', 'snow', 'hearts', 'soul', 'bubbles', 'custom'];
      if (!presets.includes(e.preset)) add(E, where + ': не выбран набор частиц', sel);
      if (e.preset === 'custom' && !RESID.test(String(e.particle || ''))) add(E, where + ': свои частицы пиши вида minecraft:end_rod', sel);
      const sh = e.shape || 'point';
      if (!['point', 'box', 'sphere', 'line', 'path'].includes(sh)) add(E, where + ': форма — точка, коробка, шар, линия или путь', sel);
      if (sh !== 'path') needPos();
      if (sh === 'line') needPos('to', 'конец линии');
      if (sh === 'path' && !(Array.isArray(e.path) && e.path.length >= 2 && e.path.every(isP3fx))) add(E, where + ': пути нужно 2 точки и больше', sel);
      if (sh === 'box' && e.size !== undefined && !isP3fx(e.size)) add(E, where + ': размер коробки — три числа', sel);
      rng('rate', 0.1, 200, 'частиц за тик'); rng('radius', 0.5, 64, 'радиус'); rng('speed', 0, 2, 'скорость');
      if ((e.rate || 6) * (e.ticks || 60) > 20000) add(W, where + ': очень много частиц (' + Math.round((e.rate || 6) * (e.ticks || 60)) + ') — у слабых компьютеров может тормозить', sel);
      break;
    }
    case 'debris': needPos(); if (e.block && !STATE.test(String(e.block))) add(E, where + ': блок пиши вида minecraft:stone', sel); rng('count', 1, 400, 'сколько'); rng('radius', 0.5, 16, 'радиус'); rng('power', 0, 10, 'сила'); if (e.real) add(W, where + ': настоящие обломки меняют мир (блоки падают)', sel); break;
    case 'crack': needPos(); break;
    case 'fill': {
      needPos('from', 'первый угол'); needPos('to', 'второй угол');
      if (!STATE.test(String(e.block || ''))) add(E, where + ': блок пиши вида minecraft:oak_planks', sel);
      if (!['solid', 'hollow', 'walls', 'outline'].includes(e.shape || 'solid')) add(E, where + ': форма заливки не выбрана', sel);
      if (isP3fx(e.from) && isP3fx(e.to)) { const v = [0, 1, 2].reduce((a, i) => a * (Math.abs(Math.floor(e.from[i]) - Math.floor(e.to[i])) + 1), 1); if (v > 200000) add(E, where + ': слишком большой объём (' + v + ' блоков, предел 200 000)', sel); else if (v > 20000) add(W, where + ': большой объём (' + v + ' блоков) — ставится несколько тиков', sel); }
      break;
    }
    case 'structure_anim':
      if (!e.structure) add(E, where + ': не выбрана постройка', sel);
      else if (refs.structures && !refs.structures.includes(e.structure)) add(E, where + ': в библиотеке нет постройки «' + e.structure + '»', sel);
      needPos();
      if (!['show', 'hide'].includes(e.mode || 'show')) add(E, where + ': появляется или исчезает?', sel);
      if (!['layers', 'random', 'rise', 'sink', 'instant'].includes(e.anim || 'layers')) add(E, where + ': как появляется — слоями, вразброс, из земли или сразу', sel);
      break;
    case 'sound3d': case 'ambience': case 'actor_sound':
      if (!RESID.test(String(e.id || ''))) add(E, where + ': id звука пиши вида minecraft:block.bell.use', sel);
      rng('vol', 0, 10, 'громкость'); rng('pitch', 0.5, 2, 'высота'); rng('range', 1, 256, 'дальность');
      if (verb === 'sound3d' && e.pos != null && !isP3fx(e.pos)) add(E, where + ': место — три числа x y z', sel);
      if (verb === 'sound3d' && e.actor && refs.actorIds && !refs.actorIds.includes(e.actor)) add(E, where + ': в сцене нет актёра «' + e.actor + '»', sel);
      break;
    case 'effect': if (!RESID.test(String(e.effect || ''))) add(E, where + ': эффект пиши вида minecraft:glowing', sel); rng('seconds', 1, 3600, 'секунд'); rng('level', 1, 10, 'уровень'); break;
    case 'emote': if (!['!', '?', '...', 'heart', 'anger', 'note', 'zzz', 'sweat', 'idea'].includes(e.icon)) add(E, where + ': значок не выбран', sel); break;
    case 'push': rng('power', 0, 10, 'сила'); if (e.dir != null && !isP3fx(e.dir)) add(E, where + ': направление — три числа', sel); break;
    case 'levitate': rng('height', -32, 32, 'высота'); break;
    case 'appear': case 'vanish': if (e.effect && !['poof', 'smoke', 'magic', 'flash', 'lightning', 'none'].includes(e.effect)) add(E, where + ': эффект не выбран', sel); break;
    default:
  }
}
// глаголы дорожек библиотеки — для validateScene (что обязательно: проверяет checkFxEvent)
export function fxVerbs() {
  const out = { fx: {}, world: {}, sound: {}, actor: {} };
  for (const [k, d] of Object.entries(FX_LIB)) out[d.track][k] = { need: [] };
  // мировые эффекты можно класть и на дорожку «Эффекты»
  for (const k of FX_TRACK_VERBS.world) out.fx[k] = { need: [] };
  return out;
}
export function fxLabels() { const o = {}; for (const [k, d] of Object.entries(FX_LIB)) o[k] = d.label; return o; }
export const ANIM_NAMES = GESTURES.map((g) => g[0]);
