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

## Run the worked system
This worked system is included in the branch. Run from its root; the main exercise checks remain separate.
```sh
node ai_lessons/workbench/demo.mjs rag
node --test ai_lessons/workbench/workbench.test.mjs
```
Expect reset@2 and abstain when evidence is absent. Another tenant must not enter the packet. Vectors are hand-authored and model generation is not simulated.

## Сквозной разбор с исполняемым кодом
Дополнительный разбор уже включён в ветку. Выполните команды из её корня; автопроверка основного задания остаётся отдельной.
```sh
node ai_lessons/workbench/demo.mjs rag
node --test ai_lessons/workbench/workbench.test.mjs
```
Ожидайте источник reset@2 и abstain без подходящих данных. Чужой tenant не должен попасть в пакет. Векторы заданы руками, генерация модели не имитируется.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Write five questions with known source passages. Compare lexical search and an available local embedding search on the same corpus. Test another tenant separately.

Составьте пять вопросов с известным источником. Сравните лексический поиск и доступный локальный embeddings-поиск на тех же документах. Отдельно проверьте чужой tenant.
