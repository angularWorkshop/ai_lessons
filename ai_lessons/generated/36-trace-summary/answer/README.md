# Inspect a run through its trace, not its final answer

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return calls, total durationMs, and failed ids in input order.
- An empty run gives zero counts and an empty array.
- Exclude prompt and all other extra fields from the summary.

## Русский
- Верните calls, сумму durationMs и failed id в исходном порядке.
- Пустой запуск должен дать нули и пустой массив.
- Не переносите prompt и другие лишние поля в сводку.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Capture a safe event log for one learning task. Find its most expensive step and one ineffective retry. Remove request contents that diagnosis does not need.

Сохраните безопасный журнал одной учебной задачи. Найдите самый дорогой шаг и повтор, который не помог. Удалите содержимое запросов, если оно не нужно для диагностики.
