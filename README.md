# Find a failure’s cause without rewriting everything

Edit `src/debugging.json`. Do not change the tests or runtime.

## English
- Map compile to inspect-types, test to reproduce-assertion, and runtime to inspect-trace.
- Verify that the first failure wins.
- Check an unknown stage and a fully successful sequence.

## Русский
- Настройте actions: compile → inspect-types, test → reproduce-assertion, runtime → inspect-trace.
- Убедитесь, что выбирается первая ошибка.
- Проверьте неизвестный этап и полностью успешную последовательность.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Break one check in a disposable project. Ask the assistant to explain the first error and propose one experiment before editing; forbid disabling the test.

В учебной копии сломайте одну проверку. Попросите ассистента сначала объяснить первую ошибку и предложить один эксперимент; запретите отключать тест.
