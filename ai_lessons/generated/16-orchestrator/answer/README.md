# Core project: assemble and transfer an orchestrator

Edit `src/orchestrator.json`. Do not change the tests or runtime.

## English
- In orchestrator.json, use planner, developer, tester, and reviewer; implementation and review must differ.
- Set maxAttempts: 2 and maxCalls: 8: at most two attempts with four role invocations each.
- Verify clarification, denial, success, second-attempt repair, and stopping after two failures.
- Collect real artifacts using capstone-pack/ACCEPTANCE.md. Record simulator tests and manual transfer separately.

## Русский
- В orchestrator.json задайте роли planner, developer, tester, reviewer; исполнитель и ревьюер различаются.
- Установите maxAttempts: 2 и maxCalls: 8: максимум две попытки по четыре обращения к ролям.
- Проверьте уточнение, отказ, успешный проход, исправление со второй попытки и остановку после двух ошибок.
- Соберите реальные артефакты по capstone-pack/ACCEPTANCE.md. Автотесты симулятора и ручной перенос отмечаются отдельно.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Complete capstone-pack/ACCEPTANCE.md in your chosen assistant. Do not describe a green simulation as a verified client connection or a tested real model.

Выполните всю проверку capstone-pack/ACCEPTANCE.md в выбранном ассистенте. Не выдавайте зелёный симулятор за успешное подключение клиента или проверку настоящей модели.
