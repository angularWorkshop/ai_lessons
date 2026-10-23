# A real local MCP server / Настоящий локальный MCP-сервер

This optional package uses pinned SDK dependencies. The default course labs and workbench do not need them. No model, cloud account, API key, or public port is involved. This proves this SDK client/server interaction, not compatibility with every assistant application.

Этот дополнительный пакет использует закреплённые версии официального MCP SDK и Zod. Базовые задания курса по-прежнему не требуют npm install. Здесь не нужна модель или платный аккаунт: проверяется настоящее соединение MCP-клиента и stdio-сервера, а не симуляция каталога.

## Run / Запуск

From the root of a starter/answer branch:

```sh
cd ai_lessons/mcp-demo
npm ci --ignore-scripts
npm test
```

Expect one passing integration test. It starts server.mjs as a child process, initializes MCP, discovers add, sends numeric arguments, and receives 5. Wrong argument types, an unknown tool, and numeric overflow must not succeed. package-lock.json pins the dependency tree. node_modules is never included in published branches.

Ожидается один интеграционный тест: инициализация, tools/list, tools/call и результат 5. Это реальные сообщения между процессами через SDK. Прочитайте client.test.mjs; нет захардкоженного ответа вместо сервера. Отдельно проверяются неверный тип, неизвестное имя и переполнение результата.

## Connect a client / Подключение к своему клиенту

If your client supports local stdio MCP servers, configure a local process with command `node` and args containing the **absolute path** to server.mjs. Do not paste an arbitrary vendor configuration schema: find the MCP server settings for your client version. Keep the reviewed tool set restricted to add. No token or environment secret is required. Inspect discovery before invoking anything.

Если клиент поддерживает локальный stdio MCP, укажите команду node и абсолютный путь server.mjs в аргументах запуска. У каждого клиента свой формат настроек, поэтому учебный объект ниже — только значения, не готовая конфигурация конкретного приложения:

```text
command: node
args: [absolute/path/to/server.mjs]
environment secrets: none
expected discovered tools: add only
```

Some clients require an absolute node executable path or a restart to rediscover capabilities. If discovery fails, check executable and file paths, then server stderr. Never log ordinary text to stdout: stdio uses it for protocol messages. Ask for `add(2,3)` and inspect the actual tool event. A model saying “5” without a call does not demonstrate MCP use.

Если сервер не обнаружен, проверьте путь к node, путь к файлу и stderr. stdout занят протоколом; console.log способен испортить обмен. Если обнаружен инструмент, но нет вызова, проверяйте поддержку tools выбранной моделью и настройки разрешений клиента. readOnlyHint — подсказка, не техническая песочница: безопасность примера обеспечивается отсутствием файловых, сетевых и shell-инструментов в сервере.

## Limits / Границы

Only one arithmetic capability is exposed. This is not a filesystem server, production authorization system, or proof of prompt-injection immunity. Changing tools requires code review and a new discovery check. No personal .agents, credentials, project files, or cloud configuration are used.
