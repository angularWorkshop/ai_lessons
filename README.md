# Beyond accuracy: misses, false alarms, and error cost

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Count TP, FP, and FN from boolean fields.
- Return precision and recall as ratios, not percentages.
- Return zero for an empty denominator.

## Русский
- Посчитайте TP, FP, FN по boolean-полям.
- Верните precision и recall, не проценты.
- При пустом знаменателе верните 0; не делите на ноль.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Label a small approved set with routine and critical cases. Show a confusion matrix and baseline. Do not present a tiny learning set as proof of market-wide quality.

Разметьте небольшой разрешённый набор: обычные и критичные случаи. Покажите матрицу ошибок и baseline. Не используйте этот учебный размер как доказательство качества на всём рынке.
