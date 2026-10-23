# Learning or memorizing? Read loss and validation curves

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return invalid for nonnumeric or nonfinite train/validation loss.
- Return more-evidence for fewer than two measurements.
- Falling train with rising validation means possible-overfit; falling validation means improving; otherwise investigate.

## Русский
- Отклоните нечисловые и бесконечные train/validation как invalid.
- Для менее двух точек верните more-evidence.
- Падающий train и растущий validation → possible-overfit; падающий validation → improving; иначе investigate.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Run the CPU project with two epoch counts. Preserve train/validation loss and several errors. Leave test untouched until choosing the configuration.

Запустите CPU-проект с двумя значениями числа эпох. Сохраните train/validation loss и несколько ошибок. Не трогайте test до выбора режима.
