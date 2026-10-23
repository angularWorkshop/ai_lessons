# Worked systems / Сквозные разборы

All paths below assume the root of a starter/answer branch, where package.json lives. In the main repository, omit the leading `ai_lessons/` only if your terminal is already inside that directory.

Команды выполняются из корня учебной ветки с package.json. Node 20.19+; установка пакетов не нужна. Это дополнительные исполняемые разборы, не подмена автоматических условий `src/exercise.mjs`.

## Tool-calling loop / Цикл инструментов

```sh
node ai_lessons/workbench/demo.mjs agent
```

Expect `provider: explicit offline stub`, `status: answered`, answer containing 5, two model events and one actual add event. The stub is not an LLM. Read agent.mjs: the host owns schema validation, approval, dispatch, history, deadline, and replay limits. Unknown tools cannot become terminal commands.

Ожидается явная пометка stub, answered, число 5, два обращения к тестовому поставщику и один реально исполненный add. Откройте agent.mjs и найдите границу доверия. Прогоните тесты ниже: неизвестный инструмент, неверные аргументы, повтор, исчерпание бюджета и зависший provider не должны объявляться успехом.

Optional real local inference, only with an already installed tool-capable model:

```powershell
$env:AI_LOCAL_MODEL='exact-installed-name:tag'
node ai_lessons/workbench/demo.mjs local-agent
```

This contacts loopback Ollama only. It does not pull models, open public ports, or fall back to cloud. The model may answer without using a tool or propose unsupported calls; inspect the trace. A final answer alone does not prove the tool was used.

Реальный запуск требует совместимой уже установленной модели. Имя задаётся явно. Проверьте в trace факт вызова add: красивый ответ без вызова не считается демонстрацией function calling. Для приложения с несколькими параллельными tool calls расширяйте обработчик и тесты отдельно; здесь поддерживается один вызов на ход.

## Retrieval and citations / Поиск и источники

```sh
node ai_lessons/workbench/demo.mjs rag
```

Expect source reset, revision 2, no private-reset source, and abstain in noEvidence. Vectors are hand-authored to make cosine visible, not learned embeddings. The result is an extractive evidence packet, not a generated answer. See rag.mjs for access filtering, active versions, ranking, and context bounds.

Ожидается reset@2, отсутствие чужого private-reset и abstain без подходящего источника. Сравните запрос [1,0] с [-1,0] и смену tenant. Затем смените имя embedding-модели: старый индекс не должен использоваться. Для настоящих embeddings есть local-client.mjs: `localClient({model: installedEmbeddingModel}).embed(texts)`. Перестройте корпус и запрос одним и тем же пространством; не смешивайте ручные и обученные векторы.

## Training arithmetic / Арифметика обучения

```sh
node ai_lessons/workbench/demo.mjs training
```

Expect probability 0.5 before the update, weight and bias 0.25 afterward, loss falling from about 0.693 to 0.474, and a 2×3 low-rank update. Real arithmetic is executed; no LLM is trained by this command. Continue with local-training/train.py for actual classifier training across epochs and FINETUNING.md for the optional hardware-dependent LLM path.

Откройте training-math.mjs: сопоставьте каждую строку с формулой урока. Тест численной производной проверяет градиент, а не только ожидаемый статус. Один удачный шаг на одном примере не доказывает обобщение: для этого нужны validation и независимый test из CPU-проекта.

## Verification / Проверки

```sh
node --test ai_lessons/workbench/workbench.test.mjs
```

Tests execute tools, retrieval, source budgeting, numerical optimization, and real HTTP handling against a loopback stub. They do not verify a live LLM, GPU training, or a client’s MCP integration. In a Node-only WebContainer, the Python and GPU routes remain separate local work.

Тесты HTTP используют явно обозначенный stub. Никакие ключи не нужны, рабочая .agents не копируется. Сохраняйте выполненные команды отдельно от неисполненных шагов: не переименовывайте план в доказательство.
