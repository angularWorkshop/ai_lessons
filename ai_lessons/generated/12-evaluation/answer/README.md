# Evaluate quality across a task set

Edit `src/evaluation.json`. Do not change the tests or runtime.

## English
- Set minCases: 4 and minPassRate: 0.75 in evaluation.json.
- Confirm that one successful case is insufficient.
- A critical failure must block release even with a 75% pass rate.

## Русский
- В evaluation.json задайте minCases: 4 и minPassRate: 0.75.
- Проверьте, что один удачный случай недостаточен.
- Критический провал должен блокировать release даже при 75% успеха.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Write four cases for your assistant and record expectations before execution. Run twice without changing instructions between runs. Mark inconsistent results separately.

Составьте четыре собственных случая для ассистента и запишите ожидания до запуска. Выполните два прогона без изменения правил между ними. Отметьте нестабильные результаты отдельно.
