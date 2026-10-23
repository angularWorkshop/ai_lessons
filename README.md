# Build a minimal .agents rather than a prompt collection

Edit `src/os.json`. Do not change the tests or runtime.

## English
- Require the six .agents paths in os.json: entry, workflow, role, skill, profile, and knowledge.
- A missing skill or knowledge file must appear in missing and prevent ready.
- Do not modify the real .agents. Use the isolated agent-os-example and doctor.mjs.

## Русский
- В os.json требуйте шесть путей из примера, кроме project/AGENTS.md: вход, цикл, роль, навык, профиль и знания.
- Отсутствующий навык или знания должны попадать в missing и блокировать ready.
- Не меняйте настоящую .agents. Используйте изолированный agent-os-example и его doctor.mjs.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Read agent-os-example/README.md, run its doctor, and connect the adapter only to a disposable project. Check loaded rules and the actual test command.

Изучите agent-os-example/README.md, запустите doctor.mjs, затем подключите его адаптер только к учебной копии проекта. Сверьте обнаруженные правила и команду тестов.
