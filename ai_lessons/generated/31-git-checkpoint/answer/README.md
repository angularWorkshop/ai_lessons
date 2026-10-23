# Before editing: a branch, baseline diff, and recovery point

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return { ready: true } only for a clean learning branch other than main.
- Require backupVerified: true and secretsTracked: false.
- Do not invoke Git or delete files from solve; the lab checks a record, not your disk.

## Русский
- Верните { ready: true } только для чистой учебной ветки не main.
- Требуйте backupVerified: true и secretsTracked: false.
- Не вызывайте Git и не удаляйте файлы из solve: упражнение проверяет запись, не диск.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Capture a small project’s baseline diff and make one reversible edit. Identify your own diff and restore one of your edited files manually without touching someone else’s work.

Сохраните исходный diff маленького проекта и сделайте одну обратимую правку. Покажите только свой diff и вручную восстановите один свой изменённый файл, не затрагивая чужую работу.
