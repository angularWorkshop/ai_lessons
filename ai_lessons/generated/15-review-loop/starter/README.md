# Review and repair: when to retry and when to stop

Edit `src/review.json`. Do not change the tests or runtime.

## English
- Set maxAttempts: 2 and onStop: human.
- Confirm that self-review cannot produce complete.
- Failed checks lead to repair; an exhausted limit or high risk leads to human.

## Русский
- Установите maxAttempts: 2 и onStop: human.
- Проверьте, что self-review не даёт complete.
- Провал проверок ведёт к repair, исчерпание лимита или высокий риск к human.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Ask a reviewer for one concrete risk in a learning diff. Give the worker at most two repair attempts. If it remains unresolved, write a handoff with the reason instead of expanding the limit indefinitely.

Попросите ревьюера найти конкретный риск в учебном diff. Дайте исполнителю максимум две попытки исправления. Если не получилось, составьте handoff с причиной, а не увеличивайте лимит бесконечно.
