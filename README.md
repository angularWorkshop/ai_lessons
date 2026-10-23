# Why local inference is slow: memory and fair measurements

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Keep warm: true, ok: true, and seconds > 0.
- Return samples and tokensPerSecond using totals.
- With no valid requests, tokensPerSecond is null.

## Русский
- Отфильтруйте warm: true, ok: true и seconds > 0.
- Верните samples и tokensPerSecond по суммарным токенам и времени.
- Если валидных запросов нет, tokensPerSecond равен null.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Record a cold start and three warm runs of one model. Change one setting and compare both latency and quality. Report hardware alongside speed.

Запишите отдельно холодный и три прогретых запуска одной модели. Сравните задержку и качество при одном изменённом параметре. Укажите оборудование, а не только красивую скорость.
