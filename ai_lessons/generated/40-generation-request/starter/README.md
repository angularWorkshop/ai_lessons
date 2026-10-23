# Control generation: length, temperature, and request shape

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Build the request from input.model, question, and maxOutput.
- Set stream: false, temperature: 0, and num_predict from maxOutput.
- Do not hard-code the model or make a request from solve.

## Русский
- Соберите объект запроса из input.model, question и maxOutput.
- Задайте stream: false, temperature: 0 и num_predict из maxOutput.
- Не хардкодьте имя модели и не отправляйте запрос из solve.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Use an installed model and one invented request. Compare two output limits and inspect the finish reason. Do not automatically download unfamiliar weights.

Используйте установленную модель и один вымышленный запрос. Сравните два лимита ответа и проверьте причину завершения. Не запускайте автоматическое скачивание неизвестных весов.
