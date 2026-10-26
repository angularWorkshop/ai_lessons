# Тема 14.3 — Разбор трейсов и отчёт

Задание — в описании практики на платформе. Коротко:

1. Проверка запускается сама и перезапускается при каждом сохранении (`npm run start:dev`).
2. Допиши `src/evals/trace.ts`, `diagnose.ts`, `store.ts`, `suite-report.ts`, `compare.ts` и подключи трейс в `runner.ts` по шагам 1–5, пока не увидишь `ASSIGNMENT STATUS: COMPLETED`. Тесты прошлых тем должны остаться зелёными.
3. `npm run evals -- --runs=2` — прогон набора с трейсами, результат — в `.agent/evals/base.jsonl`. `--variant=parallel` или `--variant=short` — другая версия агента, `--label=имя` — свой файл.
4. `npm run evals-report -- base short` — отчёт по сохранённым прогонам и сравнение версий, без модели. `npm run evals-report -- short --trace=rename-calc#1` — трейс одного прогона.
5. `npm run judge` — судья из темы 14.2 на месте.

Модель уже подключена: платформа сама кладёт в проект `.env` с адресом, ключом и моделью.
