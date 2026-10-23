# Build an SFT example: roles, padding, and the loss mask

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Validate arrays and equal lengths; ids are integers and masks contain strictly 0 or 1.
- Build labels without an extra causal shift: keep id where both masks are one, otherwise -100.
- Return { valid: true, labels } only with supervised positions, otherwise { valid: false }.

## Русский
- Проверьте массивы и одинаковую длину; ids целочисленные, маски состоят строго из 0 и 1.
- Постройте labels без дополнительного causal shift: id при двух единицах, иначе -100.
- Верните { valid: true, labels } только при наличии обучаемых позиций; иначе { valid: false }.

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
Run node ai_lessons/workbench/demo.mjs training to calculate loss and a weight update. Separately use FINETUNING.md to prepare and decode one SFT sample with your tokenizer. CPU arithmetic is not a fine-tuned LLM.

Запустите node ai_lessons/workbench/demo.mjs training для расчёта ошибки и шага обновления. Затем по FINETUNING.md отдельно подготовьте и декодируйте один SFT-пример своим токенизатором. CPU-арифметика не является дообученной LLM.
