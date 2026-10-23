# Choose the files a model actually needs

Edit `src/context.json`. Do not change the tests or runtime.

## English
- Allow .md and .ts; exclude the .env, node_modules, and dist path segments.
- Use maxChars: 30 for the tiny educational fixtures.
- Verify priority, overflow, and ../outside.md rejection. Choose a separate budget for a real project.

## Русский
- Разрешите .md и .ts; исключите сегменты .env, node_modules и dist.
- Установите maxChars: 30 для маленьких учебных фикстур.
- Проверьте приоритет, переполнение и путь ../outside.md. В настоящем проекте лимит выбирается отдельно.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Prepare three small files relevant to your task. Remove dependencies and private data. Ask the assistant to identify missing context before proposing edits.

Составьте пакет из трёх небольших файлов для своей задачи. Уберите зависимости и приватные данные. Попросите ассистента назвать недостающий контекст до предложения правок.
