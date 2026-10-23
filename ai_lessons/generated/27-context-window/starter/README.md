# Why a model forgets: tokens and the context window

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Compute remaining in solve(input) after all reservations.
- Compute fits from the original remainder, not the clamped value.
- Check the exact boundary and history that already exceeds the window.

## Русский
- В solve(input) вычислите remaining после всех резервов.
- Возвращайте fits по исходному остатку, не по обрезанному до нуля.
- Проверьте точную границу и случай, когда одна история уже переполняет окно.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Find context or usage information in your client. Compare a short task with the same task plus a large log. Do not treat the exercise numbers as a real model limit.

В своём клиенте найдите счётчик контекста или usage запроса. Сравните короткую задачу с той же задачей и большим логом. Не используйте вымышленные числа из упражнения как лимит реальной модели.
