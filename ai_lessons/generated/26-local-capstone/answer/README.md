# Final project: a local model in a verifiable workflow

Edit `src/capstone.json`. Do not change the tests or runtime.

## English
- Require osDoctor, localHealth, baseline, heldout, and rollback in capstone.json.
- Allow classifier, rag, lora, and qlora; block an unknown method.
- Any missing or failed evidence keeps the result blocked. Complete separate real acceptance using ADVANCED_ACCEPTANCE.md.

## Русский
- В capstone.json требуйте osDoctor, localHealth, baseline, heldout и rollback.
- Разрешите методы classifier, rag, lora и qlora; неизвестный метод блокируйте.
- Любое отсутствующее или проваленное доказательство должно оставить blocked. Выполните отдельную реальную приёмку по ADVANCED_ACCEPTANCE.md.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Choose the CPU or LLM path in ADVANCED_ACCEPTANCE.md. Execute available real steps and explicitly mark unperformed ones. Attach evidence to a portfolio, not just a SUCCESS screenshot.

Выберите CPU- или LLM-маршрут из ADVANCED_ACCEPTANCE.md. Выполните доступные реальные шаги и явно укажите неисполненные. В портфолио прикладывайте доказательства, а не только скриншот SUCCESS.
