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

## Run the worked system
This worked system is included in the branch. Run from its root; the main exercise checks remain separate.
```sh
node ai_lessons/workbench/demo.mjs training
node --test ai_lessons/workbench/workbench.test.mjs
```
Expect w=0.25, b=0.25, and loss falling from about 0.693 to 0.474. The second output is B·A. These are executed calculations, not LLM training; full CPU training and the GPU path have separate acceptance.

## Сквозной разбор с исполняемым кодом
Дополнительный разбор уже включён в ветку. Выполните команды из её корня; автопроверка основного задания остаётся отдельной.
```sh
node ai_lessons/workbench/demo.mjs training
node --test ai_lessons/workbench/workbench.test.mjs
```
Ожидайте w=0.25, b=0.25 и уменьшение loss примерно с 0.693 до 0.474. Второй результат — матрица B·A. Это исполняемые вычисления, не обучение LLM; полный CPU-проект и GPU-маршрут принимаются отдельно.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Train the model, save the JSON artifact, and repeat with the same data. Verify reproducibility, changed weights, and separate test metrics. Do not describe this as an LLM fine-tune.

Обучите модель, сохраните JSON-артефакт и повторите запуск с теми же данными. Проверьте воспроизводимость, изменение весов и метрики на отдельном test. Не называйте этот результат дообученной LLM.
