# Choose a model for your hardware, license, and context

Edit `src/capacity.json`. Do not change the tests or runtime.

## English
- Set reserveGiB: 2 and licenseRequired: true in capacity.json.
- Accept an exact memory fit with headroom; reject insufficient capacity or an unapproved license.
- Test increased KV-cache use with unchanged weights.

## Русский
- Установите reserveGiB: 2 и licenseRequired: true в capacity.json.
- На точной границе памяти модель допустима; без запаса или лицензии не допускайте её.
- Проверьте рост KV-cache при том же размере весов.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Use LOCAL_MODELS.md to record hardware and model requirements. Do not download until size, license, and compatibility are understood. The CPU training lab needs no GPU.

По LOCAL_MODELS.md составьте паспорт своего ПК и выбранной модели. Пока не подтверждены размер загрузки, лицензия и совместимость, ничего не скачивайте. CPU-лаборатория обучения не требует GPU.
