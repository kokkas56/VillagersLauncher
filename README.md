# VillagersLauncher

Лаунчер сборки MineVillagers.

## Выпуск новой версии лаунчера

1. Поднять `version` в `package.json`.
2. Отправить коммит в ветку `release` (`git push origin main:release`).
3. GitHub Actions соберёт установщик и опубликует выпуск `vX.Y.Z` — у всех лаунчер обновится сам.
