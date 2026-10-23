# Find the passage: search baselines, embeddings, and access

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Tokenize English text into unique lowercase [a-z0-9]+ words.
- Filter tenant before scoring and keep score > 0.
- Sort by descending score, then id, and return the first k ids.

## Русский
- Разбейте английский текст на уникальные lowercase-слова [a-z0-9]+.
- До подсчёта score отфильтруйте tenant, затем оставьте score > 0.
- Сортируйте по score убывающе, затем id; верните первые k id.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Write five questions with known source passages. Compare lexical search and an available local embedding search on the same corpus. Test another tenant separately.

Составьте пять вопросов с известным источником. Сравните лексический поиск и доступный локальный embeddings-поиск на тех же документах. Отдельно проверьте чужой tenant.
