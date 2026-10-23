# Release a model: export, quantization, and rollback

Edit `src/release.json`. Do not change the tests or runtime.

## English
- Require heldout and rollback; set maxLatencyMs: 3000 in release.json.
- A critical regression or quality below baseline must block readiness.
- Test missing rollback and excessive latency. The gate publishes nothing.

## Русский
- В release.json требуйте heldout и rollback, задайте maxLatencyMs: 3000.
- Провал критического сценария или качество ниже baseline должны блокировать ready.
- Проверьте отсутствие rollback и превышение задержки. Сам gate ничего не публикует.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
For the small classifier, verify reloading its JSON. For an LLM, import a compatible artifact under a new name and generate a response. Retain the previous artifact and describe rollback.

Для маленького классификатора проверьте загрузку сохранённого JSON; для LLM — совместимый импорт под новым именем и генерацию. Сохраните предыдущий артефакт и опишите возврат к нему.
