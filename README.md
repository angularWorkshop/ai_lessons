# LoRA and QLoRA: what changes and what it costs

Edit `src/lora.json`. Do not change the tests or runtime.

## English
- Enable requireBaseMatch and requireAdapter in lora.json.
- Reject a mismatched base or tokenizer.
- Zero trainable parameters and unprepared QLoRA do not count as training. Check valid LoRA and QLoRA cases.

## Русский
- В lora.json включите requireBaseMatch и requireAdapter.
- Несовпадение базы или токенизатора должно дать reject.
- Ноль обучаемых параметров и неподготовленная QLoRA не являются обучением. Проверьте корректные LoRA и QLoRA.

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
Complete FINETUNING.md preflight. GPU training is optional and needs a suitable environment; otherwise complete the CPU path and mark LoRA unverified.

Пройдите preflight в FINETUNING.md. Запуск GPU-обучения необязателен и требует подходящего окружения; при отсутствии железа выполните CPU-маршрут и отметьте LoRA как не проверенную.
