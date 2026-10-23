# Prepare RAG documents: chunks and source references

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return chunks with source, start, and text.
- Advance by size-overlap and stop after covering the end.
- Empty text returns []; require size > overlap and nonnegative overlap.

## Русский
- Верните фрагменты со source, start и text.
- Переходите на size-overlap, остановитесь после покрытия конца.
- Пустой текст даёт []; size должен быть больше overlap, overlap неотрицательный.

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
Split two short documents you own by section, then compare with the character baseline. Find a question that requires text on both sides of a boundary.

Возьмите два собственных коротких документа. Разрежьте по разделам, затем сравните с символьным baseline. Найдите вопрос, которому нужен текст по обе стороны границы.
