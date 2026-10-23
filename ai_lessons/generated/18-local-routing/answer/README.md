# Local routing and memory: where data really goes

Edit `src/routing.json`. Do not change the tests or runtime.

## English
- Enable localOnly and set fallback: block in routing.json.
- Reject a cloud endpoint and a local proxy with an external upstream.
- Allow a declared local model route; block an unknown role.

## Русский
- В routing.json включите localOnly и оставьте fallback: block.
- Проверьте, что облачный endpoint и локальный прокси с внешним upstream отклоняются.
- Локальный маршрут с моделью разрешается; неизвестная роль не получает случайную модель.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Use LOCAL_MODELS.md to map the real client-to-model chain. Do not start the original router with an external key or modify a user-owned kilo.jsonc for this exercise.

По LOCAL_MODELS.md нарисуйте реальную цепочку клиента до модели. Не запускайте исходный .agents/router с внешним ключом ради этой проверки и не меняйте пользовательский kilo.jsonc.
