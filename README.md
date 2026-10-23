# Before a LoRA run: data, chat templates, and one batch

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Check licensed, basePinned, splitChecked, templateChecked, maskChecked, and smokePassed.
- Only strict true counts as a completed check.
- Return ready and missing in that order; solve must not download anything.

## Русский
- Проверьте licensed, basePinned, splitChecked, templateChecked, maskChecked, smokePassed.
- Только строгое true считается пройденной проверкой.
- Верните ready и missing в указанном порядке; никаких скачиваний из solve.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
On compatible hardware, complete preflight and a single batch using FINETUNING.md. Preserve versions and evidence. Without a GPU, complete the CPU path and explicitly mark LoRA as not run.

На совместимом оборудовании выполните только preflight и один batch по FINETUNING.md. Сохраните версии и выводы. Если GPU нет, завершите CPU-маршрут и явно отметьте LoRA как не выполненный.
