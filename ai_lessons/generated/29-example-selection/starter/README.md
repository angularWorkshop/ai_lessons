# Show the format: examples instead of long prohibitions

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Keep only train records with approved: true and matching task.
- Sort by descending score, then id, and apply limit.
- Return ids. Exclude held-out and unreviewed examples.

## Русский
- Отберите только train, approved: true и совпадающую task.
- Сортируйте по score убывающе, затем id; примените limit.
- Верните список id. Набор test и непроверенные примеры не должны попасть в ответ.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Write two invented demonstrations and one new evaluation request. Compare outputs with and without examples, keeping the rest of the task unchanged.

Напишите два вымышленных образца для своей задачи и один новый проверочный запрос. Сравните ответы с примерами и без них, не меняя одновременно формулировку задачи.
