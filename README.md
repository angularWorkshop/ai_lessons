# Run on your PC: healthcheck and a real first answer

Edit `src/endpoint.json`. Do not change the tests or runtime.

## English
- Set allowRemote: false and requireDone: true in endpoint.json.
- HTTP errors, empty output, and done: false must not produce ready.
- Verify remote-address denial. Run a real smoke test separately using LOCAL_MODELS.md.

## Русский
- В endpoint.json установите allowRemote: false и requireDone: true.
- HTTP-ошибка, пустой ответ и done: false не должны давать ready.
- Проверьте запрет внешнего адреса. Настоящий smoke-test выполняется отдельно по LOCAL_MODELS.md.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Complete LOCAL_MODELS.md on your computer. Retain runtime version, model identity, health, and a real short response. If no model is installed, mark the check unperformed rather than substituting a fixture.

Выполните LOCAL_MODELS.md на своём ПК. Сохраните версию runtime, имя модели, health и реальный короткий ответ. Если модели нет, отметьте проверку как не выполненную, а не подставляйте фикстуру.
