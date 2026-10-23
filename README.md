# Write a task you can actually verify

Edit `src/brief-policy.json`. Do not change the tests or runtime.

## English
- Require goal, scope, and acceptance in brief-policy.json.
- Return clarify, not guess, for a missing field or empty array.
- A complete brief must proceed to plan with an empty missing list.

## Русский
- В brief-policy.json сделайте goal, scope и acceptance обязательными.
- При пропуске поля или пустом массиве возвращайте clarify, не guess.
- Полная постановка должна переходить в plan с пустым missing.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Rewrite a vague task of your own into these three fields. First give the assistant a version without acceptance: it should ask for criteria instead of editing files.

Перепишите собственную размытую задачу в три поля. Дайте её ассистенту сначала без acceptance: он должен запросить критерии, а не начать менять файлы.
