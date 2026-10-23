# Run budgets: money, time, and calls

Edit `src/budget.json`. Do not change the tests or runtime.

## English
- Set maxCost: 1, maxCalls: 3, and timeoutMs: 1000.
- Verify the 0.004 example calculation.
- Deny another call at the call-count or elapsed-time boundary.

## Русский
- Установите maxCost: 1, maxCalls: 3, timeoutMs: 1000.
- Проверьте расчёт 0.004 для учебного примера.
- Следующий вызов на границе числа вызовов или времени должен быть запрещён.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Locate usage reporting and task cancellation in your client. If you choose to try a paid API, set a personal limit first; the course requires neither a purchase nor model calls.

Найдите в своём клиенте отображение использования и остановку задачи. Если пробуете платный API, сначала задайте собственный лимит; курс не требует покупки или отправки запросов.
