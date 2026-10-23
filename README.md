# Project: an orchestrator with checks and stop conditions

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

## Run the worked system
This worked system is included in the branch. Run from its root; the main exercise checks remain separate.
```sh
node ai_lessons/workbench/demo.mjs agent
node --test ai_lessons/workbench/workbench.test.mjs
```
Expect answered, result 5, and one actual add in the trace. The provider is explicitly an offline stub. Check unknown-tool denial and exhausted budget.

## Сквозной разбор с исполняемым кодом
Дополнительный разбор уже включён в ветку. Выполните команды из её корня; автопроверка основного задания остаётся отдельной.
```sh
node ai_lessons/workbench/demo.mjs agent
node --test ai_lessons/workbench/workbench.test.mjs
```
Ожидайте answered, результат 5 и один фактический add в trace. Provider здесь явно обозначен как offline stub. Проверьте отказ неизвестному инструменту и исчерпание бюджета.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Complete capstone-pack/ACCEPTANCE.md in your chosen assistant. Do not describe a green simulation as a verified client connection or a tested real model.

Выполните всю проверку capstone-pack/ACCEPTANCE.md в выбранном ассистенте. Не выдавайте зелёный симулятор за успешное подключение клиента или проверку настоящей модели.
