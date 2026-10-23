# Choose an experiment without peeking at the final test

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Keep split: validation with finite numeric loss.
- Choose the lowest loss, breaking ties alphabetically by id.
- Return the id or null if no valid measurements exist.

## Русский
- Оставьте split: validation и конечные числовые loss.
- Выберите минимальный loss, при равенстве — id по алфавиту.
- Верните id или null, если подходящих измерений нет.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Create experiments.json for two CPU runs. Choose one on validation and explain the decision before inspecting final test results.

Создайте experiments.json для двух CPU-запусков. Выберите один по validation и объясните выбор до просмотра итогового test.
