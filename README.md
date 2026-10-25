# Тема 7.1 — Что занимает окно

Задание — в описании практики на платформе. Коротко:

1. Проверка запускается сама и перезапускается при каждом сохранении (`npm run start:dev`).
2. Напиши `estimateTokens`, `contextBreakdown` и `StepLedger` в `src/context/budget.ts`, `compactToolResults` в `src/context/tool-results.ts` и вызов `prepareMessages` в `src/agent.ts` по шагам 1–4, пока не увидишь `ASSIGNMENT STATUS: COMPLETED`.
3. `npm run budget` — сколько занимает каждая часть запроса и сколько стоит каждый шаг. `npm run budget -- --compact` — то же со сжатием старых результатов инструментов.

Модель уже подключена: платформа сама кладёт в проект `.env` с адресом, ключом и моделью.
