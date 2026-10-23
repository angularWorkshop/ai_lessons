# Training data: labeling, rights, and an independent test

Edit `src/dataset.json`. Do not change the tests or runtime.

## English
- Enable requireProvenance and rejectOverlap in dataset.json.
- Overlapping groups or normalized text across splits must reject the dataset.
- Check missing source permission and a clean split.

## Русский
- В dataset.json включите requireProvenance и rejectOverlap.
- Пересечение групп или одинаковый текст в разных split должны блокировать accepted.
- Проверьте пропущенное разрешение источника и чистое разбиение.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Inspect local-training/dataset.json. Run the loader tests and introduce a group overlap in a copy to observe rejection. Restore the copy afterward.

Изучите dataset.json в local-training. Запустите тесты загрузчика и намеренно добавьте в копии пересечение групп. Верните данные после наблюдения ошибки.
