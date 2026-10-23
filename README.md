# Assistant permissions: files, terminal, and network

Edit `src/permissions.json`. Do not change the tests or runtime.

## English
- Keep roots limited to src and tests; allow read and edit there.
- Require approval for delete and deny deploy.
- Verify an unknown tool, a similar directory prefix, and a path containing .. .

## Русский
- Оставьте roots: src и tests; read и edit разрешены внутри них.
- Для delete требуйте approval, deploy запретите.
- Проверьте неизвестный инструмент, похожий префикс каталога и путь с .. .

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Restrict your chosen assistant to a disposable directory. Check that it cannot read a neighboring dummy file; do not test with genuine secrets.

В настройках выбранного ассистента ограничьте работу учебным каталогом. Проверьте отказ на чтение соседнего тестового файла, не используя настоящие секреты.
