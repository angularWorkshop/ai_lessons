# Advanced Acceptance / Приёмка итогового проекта

RU: SUCCESS в браузере означает прохождение автоматических сценариев конкретного задания.
Настоящий итог оценивается отдельно. Выберите CPU или LLM, не смешивая их доказательства.
EN: Browser SUCCESS proves the supplied automated exercise scenarios only. Evaluate the real project
separately; choose the CPU or LLM route and do not substitute one route's evidence.

## Common / Общее

1. Run `node ai_lessons/agent-os-example/doctor.mjs`. Inspect the entry point,
   workflow, role, skill, profile, and knowledge. Configure actual client permissions
   separately. RU: наличие файлов не доказывает соблюдение инструкций клиентом.
2. Work in a disposable copy. Keep the task, allowed tools, acceptance, and budget.
   RU: не используйте production, реальные ключи или пользовательскую `.agents`.
3. Save actual commands, exit codes, revision, environment, and timestamps, with no
   tokens or private data. RU: поля true в JSON не являются доказательством.

## CPU Route / CPU-маршрут

- Follow TRAINING.md. Preserve dataset fingerprint, model JSON, loss history,
  validation-selected checkpoint, majority baseline, and heldout score.
- Start serve.py on loopback, call /health and /predict, then stop it.
- Reproduce invalid JSON and an unapproved/leaking dataset; both must fail.
- Load the saved model without training and repeat prediction.
- Keep baseline/candidate files; switch to the old artifact, restart the process,
  and demonstrate rollback. Explain bag-of-words limits and synthetic-data bias.

RU: нужен настоящий запуск Python, изменённые веса и HTTP-ответ от модели.
EN: Actual Python training, changed weights, and a real model HTTP response are required.

## LLM Route / LLM-маршрут

- Follow LOCAL_MODELS.md: exact local model tag, license/revision, memory measurement,
  actual chat response, and proof that there is no hidden cloud upstream.
- For retrieval, review allowed sources, citations, missing-source abstention, and
  prompt injection attempts. RU: RAG не следует выдавать за обучение весов.
- For LoRA/QLoRA, follow FINETUNING.md: exact compatible base/tokenizer/template,
  trainable parameter counts, separated data, baseline, validation, and heldout evidence.
- Compare the exported candidate using the same criteria and resource limits.
  Keep a named old version and demonstrate switching back. Do not publish weights.

## Review / Ревью

RU: Ревьюер сопоставляет команды с артефактами и условиями, воспроизводит хотя бы
один успешный и один провальный сценарий. Отдельно перечисляет выполненное,
спроектированное и недоступное. Без GPU допустим завершённый CPU-трек и честный
статус NOT EXECUTED для LoRA, а не ложное «всё проверено».

EN: The reviewer checks actual artifacts against commands and acceptance, reproduces
at least one success and one failure, and separates executed, designed, and unavailable
steps. A completed CPU route with LoRA explicitly NOT EXECUTED is valid; false claims
of full hardware verification are not.
