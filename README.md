# Serve a local model: queues, compatibility, and safe switching

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Require schema and embeddingModel to match active.
- Require strict true for health, qualityPassed, failureChecksPassed, and rollbackAvailable.
- Return the selected version and switched; preserve active on any failure.

## Русский
- Проверьте совпадение schema и embeddingModel с active.
- Требуйте строго true для health, qualityPassed, failureChecksPassed и rollbackAvailable.
- Верните выбранную version и switched; при любом отказе оставьте active.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
On the CPU path, check /health and /predict using ADVANCED_ACCEPTANCE.md, then reproduce an invalid request and artifact reload. For an LLM, separately measure warm inference and verify client settings without exposing a public port.

В CPU-маршруте проверьте /health и /predict по ADVANCED_ACCEPTANCE.md, затем повторите ошибочный запрос и reload артефакта. Для LLM отдельно измерьте прогретый inference и проверьте конфигурацию клиента без публичного открытия порта.
