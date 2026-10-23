# How an LLM builds an answer, and why confidence can be wrong

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Normalize finite nonnegative weight values in solve(input), preserving token order.
- Return probability as a ratio. Return [] for empty input, negative weights, or zero total mass.
- Do not claim a probability proves that a token is correct.

## Русский
- Нормируйте неотрицательные конечные weight в solve(input), сохраняя порядок token.
- Возвращайте probability как долю, не проценты. При пустом входе, отрицательном весе или нулевой сумме верните [].
- Не добавляйте к вероятности утверждение о правильности токена.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Compare a question about a fictional unknown product with the same question plus a short document you wrote. Mark unsupported details even when the answer sounds confident. Use no private data.

Сравните вопрос о неизвестном вымышленном продукте с тем же вопросом и коротким собственным документом. Отметьте неподтверждённые детали, даже если ответ звучит уверенно. Не используйте личные данные.
