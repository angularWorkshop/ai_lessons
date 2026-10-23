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

## Check
`npm test` or `npm run start:dev` (Node 20+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Complete FINETUNING.md preflight. GPU training is optional and needs a suitable environment; otherwise complete the CPU path and mark LoRA unverified.

Пройдите preflight в FINETUNING.md. Запуск GPU-обучения необязателен и требует подходящего окружения; при отсутствии железа выполните CPU-маршрут и отметьте LoRA как не проверенную.
