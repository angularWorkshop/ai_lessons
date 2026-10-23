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

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Split two short documents you own by section, then compare with the character baseline. Find a question that requires text on both sides of a boundary.

Возьмите два собственных коротких документа. Разрежьте по разделам, затем сравните с символьным baseline. Найдите вопрос, которому нужен текст по обе стороны границы.
