# Understand, change, verify, and report

Edit `src/verification.json`. Do not change the tests or runtime.

## English
- Require npm test and npm run lint in verification.json.
- Limit changed paths to src and tests.
- Test missing lint, failing lint, and an unrelated file despite passing checks.

## Русский
- В verification.json требуйте npm test и npm run lint.
- Допустимые изменения ограничьте src и tests.
- Проверьте отсутствующий lint, неуспешный lint и посторонний файл при зелёных тестах.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated configuration status. Real-assistant transfer is a separate manual check.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Ask the assistant for a small change in a project copy. Compare its report with your own git diff and check execution; a summary is not evidence.

Попросите ассистента внести маленькую правку в копию проекта. Сверьте его отчёт с собственным git diff и запуском проверок; не принимайте пересказ за доказательство.
