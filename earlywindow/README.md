# villagers-earlywindow

Свой ранний экран загрузки MineVillagers. Это провайдер раннего окна NeoForge (`ImmediateWindowProvider`, имя `villagersearly`). Он наследует штатное окно FML, включает тёмную схему, убирает лису и рисует логотип MineVillagers.

Лаунчер (`electron/splash.cjs`) перед запуском делает три вещи:
- кладёт jar в libraries и добавляет его в classpath;
- пишет `earlyWindowProvider = "villagersearly"` в `config/fml.toml`;
- ставит `darkMojangStudiosBackground:true` в `options.txt`.

Выключается в настройках: «Свой экран загрузки».

Если провайдер не найден (игра запущена другим лаунчером), FML просто выключает ранний экран, и игра грузится без него.

Логотип рисует `gen_logo.py` (шрифт Monocraft из earlydisplay jar).
