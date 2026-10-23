# Assistant, agent, workflow: who does what?

Edit `src/policy.json`. Do not change the tests or runtime.

## English
- In policy.json, allow format and explain.
- Require approval for deploy and delete; deny export-secrets.
- Return deny for unknown actions. Verify all four scenarios, not just harmless formatting.

## Русский
- В policy.json разрешите format и explain.
- Для deploy и delete требуйте approval; export-secrets запретите.
- Неизвестные действия должны возвращать deny. Проверьте все четыре сценария, а не только безопасное форматирование.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
In a disposable project copy, ask the assistant to explain one file without editing. Inspect the tools actually available and reject unexpected writes. Record how a written rule differs from a client-enforced restriction.

В копии небольшого проекта попросите ассистента только объяснить файл. Посмотрите, какие инструменты реально доступны, и откажите в любой неожиданной записи. Зафиксируйте разницу между разрешением в инструкции и ограничением в настройках клиента.
