# Get JSON that your application can safely handle

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Parse the input string with JSON.parse and handle exceptions.
- Validate exactly two fields, types, category, and range; reject arrays and null.
- Return { ok: true, value } on success, otherwise { ok: false }.

## Русский
- Разберите входную строку через JSON.parse с обработкой исключения.
- Проверьте два поля, типы, категорию и диапазон; массивы и null отклоняются.
- При успехе верните { ok: true, value }, иначе { ok: false }.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Test your client with a wrong type, an extra field, and a model refusal. Record where schema validation occurs and what the user sees on failure.

Проверьте выбранный клиент на неверном типе, лишнем поле и отказе модели. Запишите, где проверяется схема и что пользователь увидит при ошибке.
