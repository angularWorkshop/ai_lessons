# Project rules: what belongs in AGENTS.md

Edit `src/instructions.json`. Do not change the tests or runtime.

## English
- Set precedence to project, then directory in instructions.json.
- Lock secretPolicy and deploymentPolicy.
- Confirm that a local test command changes while security boundaries remain unchanged.

## Русский
- В instructions.json задайте порядок project, затем directory.
- Зафиксируйте secretPolicy и deploymentPolicy через locked.
- Убедитесь, что локальная команда test меняется, но ограничения безопасности остаются прежними.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Add AGENTS.md to a disposable project if your client supports it. Give an exact test command and prohibit publication. In a fresh session, verify discovery and ask which restrictions apply.

Создайте AGENTS.md в учебной копии проекта, если клиент его поддерживает. Укажите точную команду тестов и запрет публикации. В новой сессии проверьте обнаружение файла и попросите назвать действующие ограничения.
