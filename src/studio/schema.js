// Описание дорожек, событий и полей Студии для редактора: русские названия и подсказки «что это и зачем».
import { VERB_LABEL } from './validate.js';

export const TRACKS = {
  camera: { label: 'Камера', color: '#e6b65c', hint: 'Ключи камеры: где висит камера и куда смотрит в каждый момент. Между ключами камера плавно пролетает сама. Быстрее всего ставить ключи из игры: встань, как должна смотреть камера, и нажми F8 — ключ появится там, где стоит бегунок.' },
  actor: { label: 'Актёр', color: '#6ee7a0', hint: 'Что делает этот персонаж: идёт по пути, говорит, машет, смотрит на кого-то, берёт предмет. Щёлкни по имени слева — откроются настройки актёра (где появляется, кто это).' },
  fx: { label: 'Эффекты', color: '#c59cf0', hint: 'Всё, что происходит с картинкой: затемнение и проявление, вспышка, тряска экрана, частицы в мире, большие надписи («Глава 2»).' },
  sound: { label: 'Звук', color: '#7cc4f5', hint: 'Звуки (колокол, шаги, гром) и музыка сцены. Звук с местом слышно оттуда, без места — «в ушах».' },
  subtitles: { label: 'Субтитры', color: '#f4eadb', hint: 'Строки текста внизу экрана: кто говорит и что. Удобно для озвучки без голоса.' },
  world: { label: 'Мир', color: '#e8a070', hint: 'Изменения мира во время сцены: время суток, погода, поставить или убрать блок, записать переменную сюжета (например «встретил_аларика = да»).' }
};

// подсказки примеров (не обязательный список — можно писать своё)
export const SUGGEST = {
  particles: ['minecraft:campfire_cosy_smoke', 'minecraft:flame', 'minecraft:soul_fire_flame', 'minecraft:heart', 'minecraft:happy_villager', 'minecraft:angry_villager', 'minecraft:cloud', 'minecraft:smoke', 'minecraft:large_smoke', 'minecraft:end_rod', 'minecraft:portal', 'minecraft:enchant', 'minecraft:note', 'minecraft:poof', 'minecraft:snowflake', 'minecraft:cherry_leaves', 'minecraft:totem_of_undying', 'minecraft:glow', 'minecraft:explosion'],
  sounds: ['minecraft:block.bell.use', 'minecraft:entity.villager.ambient', 'minecraft:entity.villager.yes', 'minecraft:entity.villager.no', 'minecraft:entity.lightning_bolt.thunder', 'minecraft:block.wooden_door.open', 'minecraft:block.chest.open', 'minecraft:entity.player.levelup', 'minecraft:ui.toast.challenge_complete', 'minecraft:block.note_block.chime', 'minecraft:ambient.cave', 'minecraft:block.fire.ambient', 'minecraft:entity.wolf.howl'],
  music: ['minecraft:music.game', 'minecraft:music.menu', 'minecraft:music.credits', 'minecraft:music_disc.pigstep'],
  anims: ['wave', 'nod', 'shake_head', 'point', 'bow', 'clap', 'think', 'shrug', 'cheer', 'work'],
  faces: ['neutral', 'smile', 'sad', 'angry', 'surprised', 'scared', 'blink', 'sleep'],
  poses: ['kneel', 'sit', 'lie', 'pray', 'lean'],
  items: ['minecraft:lantern', 'minecraft:torch', 'minecraft:iron_sword', 'minecraft:book', 'minecraft:bread', 'minecraft:emerald', 'minecraft:wooden_hoe', 'minecraft:fishing_rod', 'minecraft:shield'],
  storyFx: ['vortex', 'glow', 'sparkles', 'rift'],
  entities: ['minecraft:villager', 'minecraft:wandering_trader', 'minecraft:iron_golem', 'minecraft:cat', 'minecraft:wolf', 'minecraft:horse', 'minecraft:zombie', 'minecraft:pillager'],
  dims: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end']
};

const F = {
  t: { k: 't', label: 'Время', type: 'ticks', hint: 'Когда это происходит от начала сцены. В тиках: 20 тиков = 1 секунда. Удобнее перетащить событие мышкой по дорожке.' },
  ticks: (def, what) => ({ k: 'ticks', label: 'Длительность', type: 'ticks', def, min: 1, hint: what || 'Сколько длится, в тиках (20 тиков = 1 секунда).' }),
  pos: (hint, source = 'sel') => ({ k: 'pos', label: 'Место', type: 'pos', source, hint: hint || 'Точка в мире: x y z. «Взять из игры» запишет блок, на который ты смотришь в игре (встанет сверху него).' })
};

// поля по видам: track kind → verb → { label, hint, fields, def, dur(ev) }
export const VERB_DEFS = {
  camera: {
    key: {
      label: 'Ключ камеры', hint: 'Положение камеры в этот момент. Камера летит от ключа к ключу по плавной кривой. Поставь хотя бы два ключа — будет пролёт.',
      def: { pos: null, yaw: 0, pitch: 0, fov: 70, roll: 0, look: null, ease: 'smooth', shake: 0 },
      fields: [
        F.t,
        { k: 'pos', label: 'Где камера', type: 'pos', source: 'view', hint: 'Точка, где висит камера. «Взять вид из игры» запишет место и взгляд твоего персонажа прямо сейчас — встань в игре, как будто ты оператор.' },
        { k: 'yaw', label: 'Поворот', type: 'num', step: 1, hint: 'Куда смотрит камера по горизонтали, в градусах: 0 — юг, 90 — запад, 180 — север, -90 — восток. Берётся из игры вместе с местом.' },
        { k: 'pitch', label: 'Наклон', type: 'num', step: 1, min: -90, max: 90, hint: 'Наклон вверх-вниз: 0 — прямо, 30 — немного вниз, 90 — в землю, -90 — в небо.' },
        { k: 'fov', label: 'Угол обзора', type: 'num', step: 1, min: 5, max: 170, hint: 'Насколько широко видит камера. 70 — как обычно в игре; 30–50 — «приближение»; 90 и больше — широкий угол. Меняй плавно между ключами — получится наезд.' },
        { k: 'roll', label: 'Крен', type: 'num', step: 1, hint: 'Наклон горизонта вбок, в градусах. Обычно 0; 5–15 — тревожный, «пьяный» кадр.' },
        { k: 'look', label: 'Смотреть на', type: 'target', hint: 'Если выбрать актёра или точку — камера сама будет поворачиваться к ним, а «поворот» и «наклон» не нужны. Удобно, когда камера облетает героя.' },
        { k: 'ease', label: 'Плавность', type: 'select', options: [['smooth', 'Плавно'], ['linear', 'Ровно'], ['in', 'Разгон'], ['out', 'Торможение']], hint: 'Как камера подлетает к этому ключу: «Плавно» — мягкий старт и остановка; «Ровно» — одна скорость; «Разгон» — медленно, потом быстрее; «Торможение» — быстро, потом медленнее.' },
        { k: 'shake', label: 'Дрожание', type: 'num', step: 0.05, min: 0, hint: 'Лёгкая тряска «съёмки с рук». 0 — нет, 0.2 — чуть-чуть, 1 — сильно.' }
      ]
    }
  },
  actor: {
    walk: {
      label: 'Идти', hint: 'Актёр идёт по точкам пути: первая — откуда, последняя — куда. Точки удобно добавлять из игры: F9 смотрит на блок и добавляет точку в выбранное «Идти».',
      def: { path: [], speed: 0.6 }, dur: (e) => walkTicks(e),
      fields: [F.t,
        { k: 'path', label: 'Путь', type: 'path', hint: 'Точки, через которые идёт актёр, по порядку. Минимум 2: откуда и куда. Актёр сам обходит препятствия между точками.' },
        { k: 'speed', label: 'Скорость', type: 'num', step: 0.05, min: 0.1, max: 3, hint: '0.4 — медленно, 0.6 — обычным шагом, 1 — бегом. На таймлайне длина полоски — примерное время пути.' }]
    },
    anim: {
      label: 'Анимация', hint: 'Актёр делает движение: машет рукой, кивает, кланяется. Если такой анимации нет — игра напишет об этом в журнал, сцена не сломается.',
      def: { name: 'wave', loop: false },
      fields: [F.t,
        { k: 'name', label: 'Какая', type: 'text', list: 'anims', hint: 'Имя анимации латиницей: wave — помахать, nod — кивнуть, bow — поклон, point — показать рукой…' },
        { k: 'loop', label: 'Повторять', type: 'bool', hint: 'Повторять анимацию по кругу, пока не придёт другая.' }]
    },
    face: {
      label: 'Лицо', hint: 'Выражение лица жителя: улыбка, грусть, удивление. Работает у жителей долины.',
      def: { name: 'smile' },
      fields: [F.t, { k: 'name', label: 'Выражение', type: 'text', list: 'faces', hint: 'smile — улыбка, sad — грусть, angry — злость, surprised — удивление, neutral — обычное.' }]
    },
    look: {
      label: 'Смотреть', hint: 'Актёр поворачивает голову к игроку, другому актёру или точке.',
      def: { at: 'player' },
      fields: [F.t, { k: 'at', label: 'На кого', type: 'target', hint: 'Игрок — тот, кто смотрит сцену; актёр — любой из сцены; точка — место в мире.' }]
    },
    say: {
      label: 'Сказать', hint: 'Фраза над головой актёра (облачко). Для текста внизу экрана — дорожка «Субтитры».',
      def: { text: '', ticks: 60 }, dur: (e) => e.ticks || 60,
      fields: [F.t,
        { k: 'text', label: 'Фраза', type: 'area', max: 140, hint: 'Что говорит актёр. Коротко — до 140 знаков, иначе не успеют прочитать.' },
        F.ticks(60, 'Сколько висит фраза, в тиках. Примерно 1 секунда (20 тиков) на 3 слова.')]
    },
    hold: {
      label: 'Взять в руки', hint: 'Дать актёру предмет в руку (фонарь, меч, книгу). Пустое поле — убрать предмет из этой руки.',
      def: { main: 'minecraft:lantern', off: null },
      fields: [F.t,
        { k: 'main', label: 'Правая рука', type: 'id', list: 'items', nullable: true, hint: 'id предмета, например minecraft:lantern. Пусто — рука пустая.' },
        { k: 'off', label: 'Левая рука', type: 'id', list: 'items', nullable: true, hint: 'id предмета во второй руке, например minecraft:torch. Пусто — ничего.' }]
    },
    tp: {
      label: 'Переместить', hint: 'Мгновенно переставить актёра в другое место (без ходьбы). Удобно между кадрами, пока камера смотрит в другую сторону.',
      def: { pos: null, yaw: 0 },
      fields: [F.t, F.pos('Куда переставить актёра. «Взять из игры» — блок, на который ты смотришь (актёр встанет на него сверху).'),
        { k: 'yaw', label: 'Повернуть', type: 'num', step: 1, hint: 'Куда актёр будет смотреть после перемещения, в градусах: 0 — юг, 90 — запад, 180 — север, -90 — восток.' }]
    },
    sit: { label: 'Сесть', hint: 'Актёр садится (на месте или на ближайший стул).', def: {}, fields: [F.t] },
    stand: { label: 'Встать', hint: 'Актёр встаёт и выходит из позы.', def: {}, fields: [F.t] },
    pose: {
      label: 'Поза', hint: 'Особая поза: на колено, лечь, молиться. Держится, пока не придёт «Встать» или другое движение.',
      def: { name: 'kneel' },
      fields: [F.t, { k: 'name', label: 'Какая', type: 'text', list: 'poses', hint: 'kneel — на колено, lie — лечь, sit — сесть на землю, pray — молиться.' }]
    }
  },
  fx: {
    fade_in: { label: 'Из темноты', hint: 'Экран проявляется из чёрного. Обычно в самом начале сцены.', def: { ticks: 20 }, dur: (e) => e.ticks || 20, fields: [F.t, F.ticks(20, 'За сколько тиков проявится картинка. 20 = 1 секунда.')] },
    fade_out: { label: 'В темноту', hint: 'Экран плавно уходит в чёрное. Обычно в конце или перед сменой места.', def: { ticks: 20 }, dur: (e) => e.ticks || 20, fields: [F.t, F.ticks(20, 'За сколько тиков экран станет чёрным.')] },
    flash: { label: 'Вспышка', hint: 'Короткая белая вспышка на весь экран — удар молнии, магия, воспоминание.', def: {}, fields: [F.t] },
    shake: {
      label: 'Тряска', hint: 'Экран трясётся: взрыв, землетрясение, удар.', def: { power: 0.6, ticks: 30 }, dur: (e) => e.ticks || 30,
      fields: [F.t, { k: 'power', label: 'Сила', type: 'num', step: 0.05, min: 0, max: 5, hint: '0.2 — дрожь, 0.6 — заметно, 1.5 — очень сильно.' }, F.ticks(30, 'Сколько трясётся, в тиках.')]
    },
    particles: {
      label: 'Частицы', hint: 'Облачко частиц в мире: дым, искры, сердечки, листья.', def: { name: 'minecraft:campfire_cosy_smoke', pos: null, count: 20, spread: [1, 1, 1] },
      fields: [F.t,
        { k: 'name', label: 'Какие', type: 'id', list: 'particles', hint: 'id частиц, например minecraft:flame или minecraft:heart.' },
        F.pos('Где появятся частицы. «Взять из игры» — блок, на который ты смотришь.'),
        { k: 'count', label: 'Сколько', type: 'int', min: 1, max: 2000, hint: 'Количество частиц. 10–50 обычно хватает.' },
        { k: 'spread', label: 'Разброс', type: 'vec3', hint: 'Насколько далеко разлетаются по x, y, z (в блоках).' }]
    },
    story_fx: {
      label: 'Сюжетный эффект', hint: 'Особый эффект мода Kokk Story (вихрь, сияние и т.п.) в точке мира.', def: { name: 'vortex', pos: null },
      fields: [F.t, { k: 'name', label: 'Эффект', type: 'text', list: 'storyFx', hint: 'Имя эффекта из мода, например vortex.' }, F.pos('Где появится эффект. Можно оставить пустым — тогда у камеры.')]
    },
    title: {
      label: 'Заголовок', hint: 'Большая надпись по центру экрана, как «Глава 2».', def: { text: 'Глава 1', sub: '' }, dur: () => 60,
      fields: [F.t, { k: 'text', label: 'Надпись', type: 'text', hint: 'Крупный текст по центру.' }, { k: 'sub', label: 'Подпись', type: 'text', hint: 'Мелкий текст под надписью. Можно пусто.' }]
    }
  },
  sound: {
    sound: {
      label: 'Звук', hint: 'Проиграть один звук: колокол, дверь, гром.', def: { id: 'minecraft:block.bell.use', pos: null, vol: 1, pitch: 1 },
      fields: [F.t,
        { k: 'id', label: 'Какой', type: 'id', list: 'sounds', hint: 'id звука, например minecraft:block.bell.use. Список звуков — в игре командой /playsound.' },
        { ...F.pos('Откуда звучит. Пусто — звучит «в ушах» у игрока, одинаково везде.'), nullable: true },
        { k: 'vol', label: 'Громкость', type: 'num', step: 0.1, min: 0, max: 10, hint: '1 — обычная. Больше 1 — слышно дальше (для звука с местом).' },
        { k: 'pitch', label: 'Высота', type: 'num', step: 0.05, min: 0.5, max: 2, hint: 'От 0.5 (низко, медленно) до 2 (высоко, быстро). 1 — как есть.' }]
    },
    music: {
      label: 'Музыка', hint: 'Включить музыку сцены. Обычная музыка игры на это время замолкает.', def: { id: 'minecraft:music.game' },
      fields: [F.t, { k: 'id', label: 'Какая', type: 'id', list: 'music', hint: 'id музыки, например villagerskokk:story.theme_x или minecraft:music.credits.' }]
    },
    music_fade: { label: 'Музыка затихает', hint: 'Плавно заглушить музыку сцены.', def: {}, fields: [F.t] }
  },
  subtitles: {
    line: {
      label: 'Реплика', hint: 'Строка субтитров внизу экрана: кто говорит и что.', def: { who: '', text: '', ticks: 60 }, dur: (e) => e.ticks || 60,
      fields: [F.t,
        { k: 'who', label: 'Кто', type: 'text', hint: 'Имя говорящего — показывается перед текстом. Можно пусто (голос за кадром).' },
        { k: 'text', label: 'Текст', type: 'area', max: 140, hint: 'Что говорит. До 140 знаков — иначе не успеют прочитать; длинное раздели на две реплики.' },
        F.ticks(60, 'Сколько показывать, в тиках. Примерно 1 секунда на 3 слова.')]
    }
  },
  world: {
    time: { label: 'Время суток', hint: 'Поставить время в мире. Внимание: меняет время по-настоящему, не только на сцену.', def: { value: 13000 },
      fields: [F.t, { k: 'value', label: 'Время', type: 'int', min: 0, max: 24000, hint: '0 — рассвет, 6000 — полдень, 12000 — закат, 13000 — ночь, 18000 — полночь.' }] },
    weather: { label: 'Погода', hint: 'Сменить погоду в мире.', def: { value: 'rain' },
      fields: [F.t, { k: 'value', label: 'Погода', type: 'select', options: [['clear', 'Ясно'], ['rain', 'Дождь'], ['thunder', 'Гроза']], hint: 'Ясно, дождь или гроза.' }] },
    block: { label: 'Блок', hint: 'Поставить или убрать блок: открыть дверь, зажечь костёр, сломать стену. Меняет мир по-настоящему.', def: { pos: null, state: 'minecraft:air' },
      fields: [F.t, { ...F.pos('Какой блок поменять. «Взять из игры» — именно тот блок, на который смотришь.'), exact: true },
        { k: 'state', label: 'На что', type: 'text', hint: 'id блока, можно с состоянием: minecraft:air — убрать, minecraft:oak_door[open=true] — открытая дверь.' }] },
    var: { label: 'Переменная', hint: 'Записать переменную сюжета — потом квесты и диалоги смогут её проверить (например «встретил_аларика = да»).', def: { name: 'met_x', value: true },
      fields: [F.t, { k: 'name', label: 'Имя', type: 'text', hint: 'Имя латиницей, например met_alaric.' }, { k: 'value', label: 'Значение', type: 'any', hint: 'true / false, число или текст.' }] }
  }
};

export const ACTOR_FIELDS = [
  { k: 'name', label: 'Имя', type: 'text', hint: 'Как зовут актёра — для тебя и для субтитров.' },
  { k: 'id', label: 'id в сцене', type: 'actorId', hint: 'Короткое имя латиницей, по нему события находят актёра. Поменяешь — дорожка переименуется сама.' },
  { k: 'kind', label: 'Кто это', type: 'select', options: [['story', 'Персонаж проекта'], ['valley', 'Житель долины'], ['entity', 'Любая сущность'], ['player', 'Игрок']], hint: 'Персонаж проекта — из списка слева; житель долины — готовый житель по номеру; любая сущность — кот, голем, зомби; игрок — тот, кто смотрит сцену.' },
  { k: 'ref', label: 'Персонаж', type: 'projActor', when: (a) => a.kind === 'story', hint: 'Какой персонаж проекта играет эту роль.' },
  { k: 'who', label: 'Номер жителя', type: 'int', min: 0, when: (a) => a.kind === 'valley', hint: 'Номер жителя долины (who) — тот же, что в моде Villagers.' },
  { k: 'type', label: 'Тип сущности', type: 'id', list: 'entities', when: (a) => a.kind === 'entity', hint: 'id сущности, например minecraft:cat.' },
  { k: 'existing', label: 'Уже есть в мире', type: 'bool', when: (a) => a.kind !== 'player', hint: 'Не создавать нового, а взять того, кто уже стоит рядом (например житель деревни). Тогда «где появится» не нужно.' },
  { k: 'spawn.pos', label: 'Где появится', type: 'pos', source: 'sel', when: (a) => a.kind !== 'player' && !a.existing, hint: 'Место, где актёр стоит в начале сцены. «Взять из игры» — блок, на который смотришь (встанет сверху).' },
  { k: 'spawn.yaw', label: 'Смотрит', type: 'num', step: 1, when: (a) => a.kind !== 'player' && !a.existing, hint: 'Куда повёрнут в начале, в градусах: 0 — юг, 90 — запад, 180 — север, -90 — восток.' },
  { k: 'despawnAtEnd', label: 'Убрать в конце', type: 'bool', when: (a) => a.kind !== 'player', hint: 'Когда сцена кончится, актёр исчезнет. Выключи, если он должен остаться жить в мире.' }
];

export const SCENE_FIELDS = [
  { k: 'title', label: 'Название', type: 'text', hint: 'Название сцены для тебя. Игроки его не видят.' },
  { k: 'note', label: 'Заметка', type: 'area', hint: 'Любой комментарий для себя: что тут происходит, что доделать.' },
  { k: 'length', label: 'Длина', type: 'ticks', min: 1, hint: 'Сколько длится сцена, в тиках (20 = 1 секунда). Можно тянуть золотой флажок на линейке.' },
  { k: 'world.dim', label: 'Измерение', type: 'id', list: 'dims', hint: 'В каком мире идёт сцена: обычный, Незер или Край.' },
  { k: 'preload.radius', label: 'Подгрузка, чанков', type: 'int', min: 0, max: 12, hint: 'Сколько чанков вокруг заранее загрузить, чтобы не было «дыр» в мире. 3 обычно хватает.' },
  { k: 'preload.alongCamera', label: 'Подгружать по пути камеры', type: 'bool', hint: 'Загрузить мир заранее вдоль всего полёта камеры — если камера летит далеко.' },
  { k: 'options.letterbox', label: 'Чёрные полосы', type: 'bool', hint: 'Кинематографичные чёрные полосы сверху и снизу.' },
  { k: 'options.hideHud', label: 'Скрыть интерфейс', type: 'bool', hint: 'Спрятать сердечки, хотбар и прочее на время сцены.' },
  { k: 'options.lockInput', label: 'Заблокировать управление', type: 'bool', hint: 'Игрок не может ходить и крутить головой, пока идёт сцена.' },
  { k: 'options.skippable', label: 'Можно пропустить', type: 'bool', hint: 'Игрок может пропустить сцену клавишей. Всё равно применится финал: актёры встанут на места, переменные запишутся.' },
  { k: 'options.music', label: 'Музыка всей сцены', type: 'id', list: 'music', nullable: true, hint: 'Музыка на всю сцену. Пусто — без неё (или ставь «Музыку» на дорожке «Звук»).' },
  { k: 'options.endPlayer.mode', label: 'Игрок после сцены', type: 'select', options: [['back', 'Вернуть, где был'], ['stay', 'Оставить как есть'], ['tp', 'Перенести в место']], hint: 'Где окажется игрок, когда сцена кончится.' },
  { k: 'options.endPlayer.pos', label: 'Куда перенести', type: 'pos', source: 'sel', when: (s) => s.options && s.options.endPlayer && s.options.endPlayer.mode === 'tp', hint: 'Место, куда встанет игрок после сцены.' },
  { k: 'options.endPlayer.yaw', label: 'Смотрит', type: 'num', when: (s) => s.options && s.options.endPlayer && s.options.endPlayer.mode === 'tp', hint: 'Куда повёрнут игрок после переноса.' }
];

export function verbDef(kind, verb) { return (VERB_DEFS[kind] || {})[verb] || null; }
export function verbName(v) { return VERB_LABEL[v] || v; }

// примерная длина ходьбы: ~ (скорость × 7) блоков в секунду
export function walkTicks(e) {
  const p = Array.isArray(e.path) ? e.path : [];
  let d = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (Array.isArray(a) && Array.isArray(b)) d += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const bps = Math.max(0.3, (e.speed || 0.6) * 7);
  return d > 0 ? Math.max(10, Math.round((d / bps) * 20)) : 40;
}

// короткая надпись на событии в таймлайне
export function summary(kind, ev, actors) {
  if (kind === 'camera') return ev.look && typeof ev.look === 'string' && ev.look.startsWith('actor:') ? '→ ' + actorName(actors, ev.look.slice(6)) : (ev.fov && ev.fov !== 70 ? 'FOV ' + ev.fov : '');
  if (kind === 'subtitles') return (ev.who ? ev.who + ': ' : '') + (ev.text || '…');
  const nm = verbName(ev.do);
  switch (ev.do) {
    case 'say': return '«' + (ev.text || '…') + '»';
    case 'walk': return nm + ' · ' + ((ev.path || []).length) + ' т.';
    case 'anim': case 'face': case 'pose': return nm + ': ' + (ev.name || '?');
    case 'look': return nm + ' → ' + targetName(ev.at, actors);
    case 'hold': return nm + ': ' + short(ev.main || ev.off || 'пусто');
    case 'particles': return nm + ': ' + short(ev.name);
    case 'sound': case 'music': return nm + ': ' + short(ev.id);
    case 'title': return '«' + (ev.text || '') + '»';
    case 'time': return nm + ': ' + ev.value;
    case 'weather': return { clear: 'Ясно', rain: 'Дождь', thunder: 'Гроза' }[ev.value] || nm;
    case 'block': return nm + ': ' + short(ev.state);
    case 'var': return ev.name + ' = ' + JSON.stringify(ev.value);
    default: return nm;
  }
}
function short(id) { return id ? String(id).replace(/^minecraft:/, '') : '?'; }
export function actorName(actors, id) { const a = (actors || []).find((x) => x.id === id); return a ? a.name || a.id : id; }
export function targetName(v, actors) {
  if (v === 'player') return 'игрок';
  if (typeof v === 'string' && v.startsWith('actor:')) return actorName(actors, v.slice(6));
  if (Array.isArray(v)) return v.map((n) => Math.round(n)).join(' ');
  return '—';
}

export const ONBOARDING = [
  ['Включи связь с игрой', 'Слева включи «Режим разработчика в игре» и запусти игру через лаунчер. Когда сверху слева загорится «Игра на связи» — Студия и игра слышат друг друга.'],
  ['Создай сцену и актёров', '«+ Сцена» слева. Персонажей заведи в «Актёры проекта», потом на таймлайне нажми «+ Актёр в сцену» и укажи, где он появится («Взять из игры»).'],
  ['Поставь камеру из игры', 'В игре встань туда, откуда должна смотреть камера, и нажми F8 — ключ ляжет на таймлайн в месте бегунка, а бегунок сдвинется дальше. Повтори для следующего кадра.'],
  ['Добавь события', 'Правый клик по дорожке → «Идти», «Сказать», затемнение, музыка… Перетаскивай мышкой (Shift — без привязки к 5 тикам). Точки пути — F9 в игре или «Добавить точку из игры».'],
  ['Смотри и собирай', '«Проиграть в игре» — посмотреть сразу, без сохранения. «Проверить» — найти ошибки. «Собрать для игроков» — сцены попадут в config сборки и уйдут игрокам со следующей публикацией.']
];
