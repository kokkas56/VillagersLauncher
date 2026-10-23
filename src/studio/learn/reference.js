// «Справочник» Студии: статьи собираются из тех же подсказок и описаний, что видны в интерфейсе (виды объектов,
// сущности и их входы/выходы, узлы и события схем, дорожки и события сцен, поля атрибутов), — поэтому не расходятся
// с программой. Остальное (инструменты, кнопки) написано здесь руками.
// Статья: { id, cat, title, what, why, look (вид картинки), example, tutorials:[id], learn:[data-learn] }
import { ENT_TYPES, TARGET_KINDS, entInputs } from '../entities.js';
import { OBJ_LABEL, CHANNEL_LABEL, CHANNELS } from '../scene3d.js';
import { TYPE_HINT } from '../c4d/actions.js';
import { TRACKS, VERB_DEFS, SCENE_FIELDS, ACTOR_FIELDS } from '../schema.js';
import { SCHEME_DEFS, EVENT_HINT } from '../schemeKit.js';
import { EVENT_LABEL, SCHEME_ACTION_EXTRA_LABEL, SCHEME_COND_EXTRA_LABEL } from '../scheme.js';
import { ACTION_LABEL, COND_LABEL } from '../validate.js';
import { TUTORIALS } from './tutorials.js';
import { aiArticles } from './articlesAi.js'; // фаза 6, трек B: «Жители»
import { cineArticles } from './articlesCine.js'; // фаза 6, трек A: запекание, видео, переходы, эффекты
import { animArticles } from './articlesAnim.js'; // «Анимации»: макет, библиотека SkinKokk, формат

export const CATS = [
  ['tool', 'Инструменты и кнопки'], ['entity', 'Сущности мира'], ['io', 'Входы и выходы'], ['object', 'Объекты сцены'],
  ['attr', 'Свойства и атрибуты'], ['track', 'Дорожки и события сцены'], ['scheme', 'Схемы: узлы и события'], ['logic', 'Условия и действия'], ['ui', 'Окно Студии'], ['ai', 'Жители и их ИИ'], ['cine', 'Запекание, видео и эффекты'], ['anim', 'Анимации']
];

const T = (...ids) => ids;
// руками: инструменты и кнопки окна
const MANUAL = [
  { id: 'tool:select', cat: 'tool', title: 'Выбор (Q)', learn: ['tool-select'], look: 'tool', what: 'Инструмент выбора: щёлкни объект в игре (Камера Студии) или на схеме — он выделится и в дереве, и в «Атрибутах».', why: 'Выбрать, что править, ничего не сдвинув случайно.', example: 'Пробел — вернуть прошлый инструмент.', tutorials: T('camera_keys') },
  { id: 'tool:move', cat: 'tool', title: 'Перемещение (E)', learn: ['tool-move'], look: 'gizmo', what: 'Гизмо со стрелками X (красная), Y (зелёная), Z (синяя): тяни стрелку — объект едет по оси; квадрат между двумя стрелками — движение в плоскости; центр — свободно.', why: 'Ставить камеры, свет, сущности точно на место прямо в игре.', example: 'Закрой ось Y кнопкой Y (или клавишей Y) — объект поедет только по земле. A — все оси снова открыты.', tutorials: T('camera_keys', 'first_scene') },
  { id: 'tool:rotate', cat: 'tool', title: 'Поворот (R)', learn: ['tool-rotate'], look: 'gizmo', what: 'Кольца поворота вокруг осей. Камеры крутятся во все стороны, сущности — по вертикали (куда смотрят).', why: 'Направить камеру или «Старт игрока».', example: 'Привязка — шаг 15°.', tutorials: T('camera_keys') },
  { id: 'tool:scale', cat: 'tool', title: 'Масштаб (T)', learn: ['tool-scale'], look: 'gizmo', what: 'Пока работает как перемещение (гизмо масштаба — позже).', why: '—', example: '', tutorials: [] },
  { id: 'tool:axes', cat: 'tool', title: 'Замки осей X / Y / Z', learn: ['axes'], look: 'gizmo', what: 'Кнопки X, Y, Z в командной строке (и клавиши X, Y, Z) открывают и закрывают оси в любом сочетании. Одна открытая ось — движение вдоль неё, две — в их плоскости, три — свободно. «XYZ» (клавиша A) — открыть все.', why: 'Двигать точно: только по высоте, только по земле, только вдоль улицы.', example: 'Открыты X и Z — объект скользит по земле, высота не меняется.', tutorials: [] },
  { id: 'tool:gamecam', cat: 'tool', title: 'Камера редактора (F6)', learn: ['tool-gamecam'], look: 'camera', what: 'Вид в игре отделяется от игрока: ПКМ+WASD/QE — полёт, Alt+ЛКМ — вращать вокруг точки, Alt+СКМ — двигать, Alt+ПКМ или колесо — приближать.', why: 'Облетать мир и ставить объекты, не бегая игроком.', example: 'Esc в игре — выйти.', tutorials: T('camera_keys') },
  { id: 'tool:path', cat: 'tool', title: 'Путь', learn: ['tool-path'], look: 'object', what: 'Создаёт сплайн-путь. Если путь выбран — Ctrl+ЛКМ или F9 в игре по блоку добавляют в него точки.', why: 'По пути летят камеры и раскладывают копии клонеры.', example: '', tutorials: [] },
  { id: 'ui:create', cat: 'ui', title: 'Палитра «Создать»', learn: ['create-palette', 'ctab-cams', 'ctab-actors', 'ctab-light', 'ctab-cloners', 'ctab-effectors', 'ctab-build', 'ctab-world'], look: 'ui', what: 'Справа рядом с «Объектами»: вкладки «Камеры», «Актёры», «Свет и небо», «Клонеры», «Эффекторы», «Постройки», «Мир» с крупными значками. Щелчок — создать в точке под прицелом в игре; перетаскивание — на схему в видовом окне или в дерево «Объектов».', why: 'Всё, что можно создать, — в одном месте и с подписями.', example: 'Перетащи «Камеру» на схему — она встанет туда, куда бросил.', tutorials: T('camera_keys', 'first_scene') },
  { id: 'ui:look-through', cat: 'ui', title: 'Смотреть через камеру', learn: ['cam-eye', 'look-through', 'lt-banner'], look: 'camera', what: 'Глаз в строке камеры в «Объектах» (или двойной щелчок по её значку). Вид в игре становится этой камерой: двигаешь вид — двигается камера, поля «Атрибутов» обновляются. С записью ● ставятся ключи в момент бегунка, F9 или ◇ — ключ вручную. Прокрутка таймлайна ставит камеру в позу по ключам. Вверху вида — «Вид через «Камера 1» · Esc — выйти».', why: 'Строить кадр глазами, как его увидит игрок.', example: 'Ctrl+колесо в игре — угол обзора камеры. Esc или ещё щелчок по глазу — выйти.', tutorials: T('camera_keys') },
  { id: 'ui:keysel', cat: 'ui', title: 'Выбор ключей рамкой', learn: ['tl-lanes'], look: 'keys', what: 'Тяни мышью по пустому месту таймлайна (или кривых) — рамка выберет ключи внутри. Shift — добавить к выбору, Ctrl — переключить. Тяни любой выбранный ключ — поедут все; Del — удалить; Ctrl+C / Ctrl+V — копировать и вставить с бегунка (на тот же объект или на выбранный такого же вида).', why: 'Сдвигать и копировать целые куски анимации.', example: 'Выдели ключи камеры за 2–4 с и перетащи на 6 с.', tutorials: T('camera_keys') },
  { id: 'ui:letterbox', cat: 'ui', title: 'Кинорамка', learn: ['lb-on', 'lb-aspect', 'lb-preview'], look: 'camera', what: 'Чёрные полосы — кинематографичный кадр. Это не угол обзора камеры: угол обзора (FOV) меняет ширину охвата, а рамка просто закрывает верх и низ экрана. Настройки сцены: включена, пропорция (2,39:1, 2:1, 1,85:1, 16:9 — без полос, своя), цвет, непрозрачность, время появления и ухода. Новые сцены — без рамки.', why: 'Кино-настроение в катсцене.', example: 'Щёлкни пустое место в «Объектах» под сценой — «Атрибуты» сцены → «Кинорамка».', tutorials: [] },
  { id: 'tool:brush', cat: 'tool', title: 'Блок-кисть', learn: ['tool-brush'], look: 'build', what: 'Рисует блоками в игре: шар, куб, цилиндр; ставить, заменять, стирать. Ctrl+колесо — размер.', why: 'Рельеф, пятна, дорожки — быстро и с отменой.', example: 'Шар 5, «заменять»: трава → подзол.', tutorials: T('build') },
  { id: 'tool:box', cat: 'tool', title: 'Рамка', learn: ['tool-box'], look: 'build', what: 'Выделение области в мире (B в игре). Действия: заполнить, заменить, очистить, копировать, вставить, повернуть, отразить, сохранить шаблоном.', why: 'Работа с кусками мира целиком.', example: 'Выдели домик → «Сохранить как шаблон» → он в библиотеке.', tutorials: T('build') },
  { id: 'tool:vox', cat: 'tool', title: '3D-модель → блоки', learn: ['tool-vox'], look: 'build', what: 'Открывает OBJ, glTF или GLB и превращает модель в постройку из блоков с цветами из текстур.', why: 'Статуи, корабли, сложные формы — без ручной стройки.', example: 'Модель из Blockbench, 48 блоков, палитра «шерсть+бетон».', tutorials: T('voxel') },
  { id: 'tool:play', cat: 'tool', title: '▶ Играть (F5)', learn: ['play'], look: 'play', what: 'Проверка «как у игрока»: Студия всё сохраняет, игра запоминает мир, убирает значки редактора, размораживает мир и ставит игрока на «Старт игрока». Вся логика проекта идёт с начала (переменные, задания и «один раз» сброшены для теста).', why: 'Увидеть, как работает карта, и не испортить мир: «Стоп» всё вернёт.', example: 'F5 → дошёл до зоны → сцена → F5 — мир как был. Откатывается: блоки, существа, время, погода, вещи, здоровье и место игрока, переменные и задания проекта. Не откатываются: то, что сделали другие игроки по сети, и изменения в чанках, которые выгрузились далеко от игрока.', tutorials: T('playtest', 'first_scene') },
  { id: 'tool:play-cam', cat: 'tool', title: '▶ с камеры (Shift+F5)', learn: ['play-cam'], look: 'play', what: 'То же, что F5, но игрок появляется там, где сейчас Камера Студии.', why: 'Проверить кусок посреди карты, не идя от старта.', example: '', tutorials: T('playtest') },
  { id: 'tool:stop', cat: 'tool', title: '■ Стоп', learn: ['stop'], look: 'play', what: 'Конец проверки: мир возвращается к состоянию до ▶, снова режим редактора. То же — F5 ещё раз (или удерживать Esc в игре).', why: 'Откат после теста.', example: '', tutorials: T('playtest') },
  { id: 'tool:editor', cat: 'tool', title: 'Режим редактора', learn: ['editor'], look: 'entity', what: 'Пока включён, мир заморожен (мобы стоят, время и погода не идут), сюжет и логика не работают, игрок неуязвим и летает, сущности видны значками с именами и помощниками (зоны — коробки, камеры — пирамиды).', why: 'Спокойно строить карту, не запуская события.', example: 'Выключи — увидишь мир как есть, без значков.', tutorials: T('playtest') },
  { id: 'tool:check', cat: 'tool', title: 'Проверить', learn: ['check'], look: 'ui', what: 'Ошибки и предупреждения сцены и сущностей мира. Щелчок по строке — выберет виноватого.', why: 'С ошибками сборка не запишется, а F5 переспросит.', example: '', tutorials: T('ship') },
  { id: 'tool:build', cat: 'tool', title: 'Собрать проект', learn: ['build', 'mi-build'], look: 'ui', what: 'Проверяет всё и кладёт готовый проект в config/kokkstory/studio/<проект>/: project.json, сцены, диалоги, задания, схемы, постройки, entities.json.', why: 'Без «Собрать» всё остаётся только на твоём компьютере.', example: 'Собрал → опубликовал пак → игроки получили проект.', tutorials: T('ship') },
  { id: 'ui:link', cat: 'ui', title: 'Связь с игрой', learn: ['link'], look: 'ui', what: 'Студия держит связь, пока окно открыто: каждые 2 секунды пробует порт из studio/.link (его пишет игра), потом порт из настроек, адреса 127.0.0.1 и localhost. Игра шлёт пульс раз в 5 секунд; 15 секунд тишины — переподключение.', why: 'Через связь Студия видит прицел, ставит сущности, показывает сцены и небо в игре.', example: 'Причины, если связи нет: игра не запущена; игра без режима разработчика; режим включён после запуска; отказ соединения; порт занят другой программой; старая версия мода; игра не отвечает. Кнопка «Переподключить» — попробовать сразу; все попытки — во вкладке «Журнал».', tutorials: T('first_scene') },
  { id: 'ui:objects', cat: 'ui', title: 'Менеджер объектов', learn: ['objects'], look: 'ui', what: 'Дерево проекта: «Мир» (сущности), «Сцены» (открытая — со своими объектами), «Диалоги», «Задания», «Схемы».', why: 'Всё в одном месте.', example: 'Двойной щелчок по сцене — открыть. Глаз у камеры — смотреть через неё. Перетащи свойство из «Атрибутов» на объект — «Связь».', tutorials: T('first_scene', 'camera_keys') },
  { id: 'ui:attributes', cat: 'ui', title: 'Менеджер атрибутов', learn: ['attributes'], look: 'ui', what: 'Свойства выбранного по вкладкам. ◇ у свойства — ключ в момент бегунка; подписи можно тянуть мышью; Ctrl+щелчок — сброс.', why: 'Тут правится всё.', example: '', tutorials: T('camera_keys') },
  { id: 'ui:outputs', cat: 'ui', title: 'Вкладка «Выходы»', learn: ['outputs-tab', 'out-add'], look: 'io', what: 'Таблица как в Hammer: Когда → Кому → Что сделать → Параметр → Задержка → Один раз. В «Что сделать» только входы, которые умеет цель. Ошибочные строки красные.', why: 'Связать сущности в логику без схем.', example: 'Зона: Вошёл → Сцена «Встреча» → Запустить, задержка 0, 1×.', tutorials: T('first_scene', 'zone_io') },
  { id: 'ui:project', cat: 'ui', title: 'Проект', learn: ['title-project', 'new-project', 'mi-new-project', 'mi-open-project'], look: 'project', what: 'Проект — как карта в Hammer: свой мир (папка в saves) и свои файлы в studio/projects/<id>. Открыт и загружен в игре только один.', why: 'Разные истории не мешают друг другу.', example: 'Новый проект: плоский, обычный (level.dat пишет лаунчер, мир строит игра), пустота или копия мира. Существующий мир — по умолчанию работаем с копией.', tutorials: T('first_scene') },
  { id: 'ui:timeline', cat: 'ui', title: 'Таймлайн', learn: ['tl-ruler', 'tl-key', 'tl-record', 'tl-curves', 'tl-lanes'], look: 'keys', what: 'Линейка времени (20 тиков = 1 с), ключи объектов ромбами, дорожки событий, «Монтаж», запись ключей, кривые.', why: 'Анимация во времени.', example: 'F/G — тик назад/вперёд, F9 — ключ на всё выбранное, рамка по пустому месту — выбрать ключи.', tutorials: T('camera_keys') },
  { id: 'ui:stage', cat: 'ui', title: '«Монтаж»', learn: ['tl-stage', 'obj-stage', 'stage-camera', 'tl-shooting'], look: 'keys', what: 'Объект сцены «Монтаж» (в «Объектах» всегда первый, один на сцену): свойство «Камера» с ключами-ступеньками — с момента ключа снимает выбранная камера. Дорожка «Монтаж» на таймлайне показывает это блоками и ромбами.', why: 'Монтаж из нескольких камер.', example: 'Бегунок на 5 с → «Атрибуты» «Монтажа» → Камера 2 → ◇. Или правый клик по дорожке → камера. Ромб можно тянуть.', tutorials: T('camera_keys') },
  { id: 'ui:scene-play', cat: 'ui', title: '▶ Сцена в игре', learn: ['tl-scene-play'], look: 'play', what: 'Сыграть только открытую сцену в игре целиком — как увидит игрок.', why: 'Проверить одну катсцену без F5.', example: '', tutorials: T('camera_keys', 'actors', 'fx') },
  { id: 'ui:links', cat: 'ui', title: '«Связи»', learn: ['atab-links'], look: 'link', what: 'Свойство ведёт свойство по таблице: «Небо.Время → Свет.Яркость». Можно «наоборот», ×, +. Считается при прокрутке и в игре.', why: 'Связанные вещи меняются сами.', example: '18:00 → 0, 20:00 → 15: в сумерках свет плавно загорается.', tutorials: T('sky_links') },
  { id: 'ui:learn', cat: 'ui', title: 'Обучение', learn: ['open-learn', 'mi-learn', 'start-learn'], look: 'ui', what: 'Пошаговые уроки: подсвечивают кнопку, объясняют «что» и «зачем», сами замечают, что шаг сделан, и показывают метку в игре.', why: 'Учиться на своём проекте.', example: 'Справка → Обучение. F1 над кнопкой — статья Справочника.', tutorials: T('first_scene') }
];

const ENT_WHY = {
  player_start: 'Чтобы F5 всегда начиналась с одного места.', trigger_zone: 'Главный «датчик» карты: дошёл — что-то случилось.', actor: 'Живые персонажи, управляемые выходами.',
  button: 'Интерактив: игрок жмёт — мир отвечает.', lever: 'Включить/выключить что-то в мире.', pressure_plate: 'Ловушки, двери, секреты.', scene_point: 'Запускать катсцену из логики.',
  timer: 'Задержки и повторы.', relay: 'Собирать и включать/выключать цепочки.', counter: '«Собери N», «три попытки».', teleport: 'Переходы между местами и измерениями.',
  sound: 'Звук в точке по сигналу.', light: 'Свет по сигналу.', particles: 'Эффекты в мире.', message: 'Титры и подсказки игроку.', structure: 'Мир меняется по ходу сюжета.',
  quest_giver: 'Дать задание из логики.', var_set: 'Записать память сюжета.'
};

export function buildArticles() {
  const out = MANUAL.map((a) => ({ ...a }));
  const tutFor = (pred) => TUTORIALS.filter(pred).map((t) => t.id);
  // сущности мира
  for (const [type, d] of Object.entries(ENT_TYPES)) {
    const outs = d.outputs.map((o) => '«' + o[1] + '»').join(', ') || 'нет';
    const ins = entInputs(type).map((o) => '«' + o[1] + '»').join(', ') || 'нет';
    out.push({
      id: 'ent:' + type, cat: 'entity', title: d.label, learn: ['ent-' + type], look: 'entity', icon: d.icon, color: d.color, entType: type,
      what: d.hint + ' Выходы: ' + outs + '. Входы: ' + ins + '.', why: ENT_WHY[type] || '',
      example: d.outputs.length ? d.label + ': ' + d.outputs[0][1] + ' → Сцена «Встреча» → Запустить' : 'Зона: Вошёл → ' + d.label + ' → ' + (d.inputs[0] ? d.inputs[0][1] : '…'),
      tutorials: tutFor((t) => t.steps.some((s) => String(s.target || '').includes('ent-' + type)))
    });
    for (const [on, l, h, pd] of d.outputs) out.push({ id: 'io:' + type + ':out:' + on, cat: 'io', title: d.label + ' → выход «' + l + '»', look: 'io', icon: d.icon, color: d.color, what: (h || 'Выход сущности «' + d.label + '».') + (pd ? ' Параметр выхода: ' + pd.label + '.' : ''), why: 'Выход — «когда со мной это случится». К нему цепляют, что делать дальше.', example: d.label + ': ' + l + ' → Сообщение → Показать', tutorials: T('zone_io'), machine: on });
    for (const [inp, l, h, pd] of entInputs(type)) out.push({ id: 'io:' + type + ':in:' + inp, cat: 'io', title: d.label + ' ← вход «' + l + '»', look: 'io', icon: d.icon, color: d.color, what: (h || 'Вход сущности «' + d.label + '».') + (pd ? ' Параметр: ' + pd.label + (pd.hint ? ' — ' + pd.hint : '') + '.' : ''), why: 'Вход — что сущность умеет делать по команде.', example: 'Зона: Вошёл → ' + d.label + ' → ' + l, tutorials: T('zone_io'), machine: inp });
  }
  for (const [k, d] of Object.entries(TARGET_KINDS)) for (const [inp, l, h, pd] of d.inputs) out.push({ id: 'io:' + k + ':in:' + inp, cat: 'io', title: d.label + ' ← «' + l + '»', look: 'io', what: (h || '') + (pd ? ' Параметр: ' + pd.label + '.' : ''), why: 'Цель выхода может быть не только сущностью.', example: 'Кнопка: Нажата → ' + d.label + ' → ' + l, tutorials: T('zone_io'), machine: inp });
  // объекты сцены
  for (const [type, label] of Object.entries(OBJ_LABEL)) {
    const chs = (CHANNELS[type] || []).map((c) => CHANNEL_LABEL[c] || c);
    out.push({ id: 'obj:' + type, cat: 'object', title: label, learn: ['create-' + type], look: type === 'sky' ? 'sky' : type === 'camera' ? 'camera' : 'object', objType: type, what: TYPE_HINT[type] || '', why: chs.length ? 'Анимируется ключами: ' + chs.join(', ') + '.' : 'Свойства — во вкладках «Атрибутов».', example: '', tutorials: tutFor((t) => t.steps.some((s) => String(s.target || '').includes('create-' + type))) });
  }
  // свойства (каналы) и поля
  const CH_HINT = { time: 'Время суток ЧЧ:ММ (в файле — тики 0–24000, 0 = 06:00). Ключи идут только вперёд: 18:00 → 06:00 через ночь.', weather: 'Ясно, дождь, гроза — ступенькой.', rain: 'Сила дождя на экране 0–1.', fov: 'Угол обзора: 70 — как в игре.', level: 'Яркость света 0–15.' };
  for (const [ch, l] of Object.entries(CHANNEL_LABEL)) out.push({ id: 'attr:' + ch, cat: 'attr', title: l, learn: ['attr-' + ch], look: ch === 'time' ? 'sky' : 'keys', what: CH_HINT[ch] || 'Анимируемое свойство: ◇ рядом — ключ в момент бегунка.', why: 'Меняется во времени ключами или «Связью».', example: '', tutorials: ch === 'time' || ch === 'weather' ? T('sky_links') : T('camera_keys') });
  for (const f of [...SCENE_FIELDS, ...ACTOR_FIELDS]) if (f && f.k && f.label) out.push({ id: 'field:' + f.k, cat: 'attr', title: f.label, look: 'ui', what: f.hint || '', why: '', example: '', tutorials: [] });
  // дорожки и события сцены
  for (const [k, d] of Object.entries(TRACKS)) out.push({ id: 'track:' + k, cat: 'track', title: 'Дорожка «' + d.label + '»', look: 'keys', what: d.hint, why: '', example: '', tutorials: k === 'actor' ? T('actors') : k === 'camera' ? T('camera_keys') : T('fx') });
  for (const [kind, verbs] of Object.entries(VERB_DEFS)) for (const [v, d] of Object.entries(verbs)) out.push({ id: 'verb:' + kind + ':' + v, cat: 'track', title: d.label + ' (' + ((TRACKS[kind] || {}).label || kind) + ')', look: 'keys', what: d.hint || '', why: '', example: (d.fields || []).filter((x) => x.label).map((x) => x.label).join(', '), tutorials: kind === 'actor' ? T('actors') : T('fx') });
  // схемы
  for (const [k, d] of Object.entries(SCHEME_DEFS)) out.push({ id: 'node:' + k, cat: 'scheme', title: 'Узел «' + d.label + '»', look: 'scheme', color: d.color, what: d.hint, why: '', example: '', tutorials: T('schemes') });
  for (const [k, l] of Object.entries(EVENT_LABEL)) out.push({ id: 'event:' + k, cat: 'scheme', title: 'Событие «' + l + '»', look: 'scheme', color: '#e5534b', what: EVENT_HINT[k] || '', why: 'С событий начинается схема.', example: '', tutorials: T('schemes') });
  for (const [k, l] of Object.entries({ ...COND_LABEL, ...SCHEME_COND_EXTRA_LABEL })) out.push({ id: 'cond:' + k, cat: 'logic', title: 'Условие «' + l + '»', look: 'scheme', color: '#e6c13c', what: 'Условие для диалогов, заданий и схем.', why: '', example: '', tutorials: T('schemes', 'dialog_choice') });
  for (const [k, l] of Object.entries({ ...ACTION_LABEL, ...SCHEME_ACTION_EXTRA_LABEL })) out.push({ id: 'act:' + k, cat: 'logic', title: 'Действие «' + l + '»', look: 'scheme', color: '#4f9cf5', what: 'Действие для диалогов, заданий и схем.', why: '', example: '', tutorials: T('schemes', 'dialog_choice') });
  // уникальные id
  const seen = new Set();
  out.push(...aiArticles()); // фаза 6, трек B: «Жители»
  out.push(...cineArticles()); // фаза 6, трек A
  out.push(...animArticles()); // «Анимации»
  return out.filter((a) => (seen.has(a.id) ? false : seen.add(a.id)));
}

// F1 над элементом с data-learn="…" → статья
export function articleForLearn(arts, key) {
  if (!key) return null;
  const hit = arts.find((a) => (a.learn || []).includes(key));
  if (hit) return hit;
  const m = /^(ent|create|tool|attr|layout|atab)-(.+)$/.exec(key);
  if (m) {
    const id = m[1] === 'ent' ? 'ent:' + m[2] : m[1] === 'create' ? 'obj:' + m[2] : m[1] === 'tool' ? 'tool:' + m[2] : m[1] === 'attr' ? 'attr:' + m[2] : m[1] === 'atab' && m[2] === 'links' ? 'ui:links' : null;
    const a = id && arts.find((x) => x.id === id);
    if (a) return a;
  }
  return null;
}
export function searchArticles(arts, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return arts;
  const words = s.split(/\s+/);
  return arts.map((a) => {
    const t = a.title.toLowerCase(), w = (a.what + ' ' + a.example + ' ' + (a.machine || '') + ' ' + a.id).toLowerCase();
    let sc = 0;
    for (const x of words) { if (t.includes(x)) sc += 3; else if (w.includes(x)) sc += 1; else return null; }
    return { a, sc };
  }).filter(Boolean).sort((p, q2) => q2.sc - p.sc).map((x) => x.a);
}
