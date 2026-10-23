# A tool failed: retry, clarify, or stop?

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Stop first when attempt >= 3.
- Send 401/403 to human and accept successful 2xx responses.
- Retry only idempotent 429/5xx requests; otherwise stop.

## Русский
- Сначала остановите attempt >= 3.
- 401/403 направляйте человеку; успешные 2xx принимайте.
- Повтор разрешён только для идемпотентного 429/5xx. Остальное — stop.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Use a stub server to reproduce 403 and 503. Check retry limits and the absence of a second write call. Do not create real orders.

На тестовом stub-сервере воспроизведите 403 и 503. Проверьте ограничение повторов и отсутствие второго вызова для операции записи. Не создавайте реальные заказы.
