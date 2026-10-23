# Train a CPU classifier and save its weights

Edit `src/training.json`. Do not change the tests or runtime.

## English
- Set requireWeightsChanged: true, minLossDrop: 0.05, and selectionSplit: validation.
- A lower loss without changed weights is insufficient; test-based selection is rejected.
- After configuration, run the real CPU lab and its unittest using TRAINING.md.

## Русский
- В training.json задайте requireWeightsChanged: true, minLossDrop: 0.05 и selectionSplit: validation.
- Падение loss без изменения весов не засчитывается; подбор по test отклоняется.
- После конфигурации отдельно выполните реальную CPU-лабораторию и её unittest по TRAINING.md.

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Train the model, save the JSON artifact, and repeat with the same data. Verify reproducibility, changed weights, and separate test metrics. Do not describe this as an LLM fine-tune.

Обучите модель, сохраните JSON-артефакт и повторите запуск с теми же данными. Проверьте воспроизводимость, изменение весов и метрики на отдельном test. Не называйте этот результат дообученной LLM.
