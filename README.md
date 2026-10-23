# Streaming responses and a working Stop button

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Append delta.text in arrival order.
- Stop at the first done, cancel, or error.
- Without a terminal event, return incomplete, not complete.

## Русский
- Собирайте delta.text в порядке прихода.
- Остановитесь на первом done, cancel или error.
- Без завершающего события верните incomplete, не complete.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Cancel a long request in a test client. Confirm that the UI stops waiting and a late event cannot enter the next request’s answer.

Отмените длинный запрос в тестовом клиенте. Убедитесь, что интерфейс перестал ждать и поздний фрагмент не дописался в ответ следующего запроса.
