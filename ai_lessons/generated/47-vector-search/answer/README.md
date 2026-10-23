# Embeddings by the numbers: cosine similarity and index compatibility

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Compute cosine for finite nonzero vectors of matching dimensions.
- Exclude other tenants and models before scoring. An invalid or zero query returns [].
- Keep score >= threshold, sort by descending score then id, and return the first k ids.

## Русский
- Посчитайте cosine для конечных ненулевых векторов одной размерности.
- До оценки исключите чужой tenant и другую model. Нулевой или некорректный query возвращает [].
- Оставьте score >= threshold, сортируйте по score убывающе, затем id; верните первые k id.

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
Run node ai_lessons/workbench/demo.mjs rag. With an installed embedding model, obtain real vectors using the local adapter and repeat retrieval. Never describe hand-authored vectors as learned embeddings.

Выполните node ai_lessons/workbench/demo.mjs rag. Затем, если embedding-модель установлена, получите настоящие векторы через локальный адаптер и повторите поиск. Не называйте вручную заданные векторы обученными embeddings.
