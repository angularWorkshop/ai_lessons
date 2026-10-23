# Prompt, RAG, or fine-tuning: choose by the failure

Edit `src/adaptation.json`. Do not change the tests or runtime.

## English
- Configure the four theory routes in adaptation.json.
- Do not route fresh facts to fine-tuning or call foundation pretraining ordinary assistant setup.
- An unknown task type must clarify rather than trigger training.

## Русский
- В adaptation.json настройте четыре маршрута из теории.
- Не отправляйте обновление фактов в fine-tune и не называйте обучение с нуля обычной настройкой ассистента.
- Неизвестный тип задачи должен дать clarify, а не автоматическое обучение.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Choose a task and write the exact behavior to change. Compare prompting and retrieval before choosing training. TRAINING.md provides a real small classification baseline.

Выберите собственную задачу и запишите, какое поведение хотите изменить. Сравните prompt и retrieval до решения об обучении. В TRAINING.md есть настоящий маленький baseline для классификации.
