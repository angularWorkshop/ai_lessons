# Модули проекта и их scope

- `llm` — `src/llm.ts`: запросы к модели, повторы, стриминг, ошибки шлюза.
- `session` — `src/session.ts`: история диалога.
- `prompt` — `src/prompt.ts`, `src/structured.ts`, `src/few-shot.ts`: system prompt, JSON-ответы, примеры.
- `eval` — `src/eval.ts` и наборы кейсов `src/*-cases.ts`.
- `tools` — `src/tools.ts`, `src/demo-tools.ts`: интерфейс инструмента, реестр, сами инструменты.
- `agent` — `src/agent.ts`, `src/provider.ts`, `src/concurrency.ts`, `src/print-event.ts`, `src/agent-cli.ts`: цикл агента и его запуск.
- `skills` — `src/skills/` и папка `skills/`: формат, загрузчик, сами скиллы.
- `testing` — `src/testing/`: ScriptedProvider и другие заглушки для тестов.

Не модули, а виды изменений — для них scope не нужен:

- `package.json`, `package-lock.json`, `tsconfig.json`, `scripts/` — type `build`, без scope.
- Только `tests/` — type `test`, scope — модуль, который проверяют тесты.
- Только `README.md` и тексты — type `docs`, без scope.
