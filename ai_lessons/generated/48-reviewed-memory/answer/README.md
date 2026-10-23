# Agent memory: what to keep, revalidate, and delete

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Keep current scope, approved: true, sensitive: false, and a nonblank source.
- Require finite expiresAt strictly greater than now.
- Return only id, fact, and source, not the entire log.

## Русский
- Оставьте только текущий scope, approved: true, sensitive: false и непустой source.
- expiresAt должен быть конечным числом строго больше now.
- Возвращайте только id, fact и source; не переносите весь журнал в контекст.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Add one reviewed sourced fact to your disposable agent-os-example. Change its source and check that the stale record is no longer used. Do not edit the user’s working .agents.

В своей учебной копии agent-os-example добавьте один проверенный факт с источником. Измените источник и убедитесь, что устаревшая запись больше не используется. Не меняйте рабочую .agents пользователя.
