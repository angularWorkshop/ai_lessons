# First setup: client, model, workspace, and a check

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return ready and missing for the four fields in the specified order.
- A missing string or whitespace-only string counts as absent.
- Do not invent defaults for unknown settings.

## Русский
- Верните ready и missing для четырёх полей в указанном порядке.
- Отсутствующая строка и строка из пробелов считаются пропуском.
- Не заменяйте неизвестную настройку значением по умолчанию.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Copy generated/01-task-boundaries/starter and run npm test to record the expected initial failure. Connect your chosen client only to this copy. Separately record where inference happens.

Создайте копию generated/01-task-boundaries/starter, выполните npm test и сохраните исходный ожидаемый отказ. Подключите выбранный клиент только к этой копии. Отдельно запишите, где исполняется модель.
