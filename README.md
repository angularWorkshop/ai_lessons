# MCP in practice: server, client, and tool execution

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Keep approved names with readOnly: true.
- Return names in alphabetical order.
- Exclude unfamiliar tools and a previously approved tool that now writes.

## Русский
- Оставьте только approved-имена с readOnly: true.
- Верните имена в алфавитном порядке.
- Незнакомый инструмент и изменившаяся возможность записи должны исчезнуть из результата.

## Separate MCP integration check
This optional package requires npm ci. The main src/exercise.mjs exercise remains dependency-free. Do not edit personal configuration or the working .agents.
```sh
cd ai_lessons/mcp-demo
npm ci --ignore-scripts
npm test
```
One real integration test: initialize, tools/list, add(2,3)=5. Wrong types, an unknown tool, and overflow must fail. Test a particular GUI client separately.

## Отдельная интеграционная проверка MCP
Для этого дополнительного пакета нужен npm ci. Основное упражнение в src/exercise.mjs по-прежнему работает без зависимостей. Не редактируйте личную конфигурацию или рабочую .agents.
```sh
cd ai_lessons/mcp-demo
npm ci --ignore-scripts
npm test
```
Один реальный интеграционный тест: initialize, tools/list, add(2,3)=5. Неверный тип, неизвестный tool и переполнение должны отклоняться. Совместимость с конкретным GUI-клиентом проверяется отдельно.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Draw the client, server, data, and account for one integration. Read a tool schema and describe its side effects before connecting. No work credentials are needed for this review.

Нарисуйте цепочку выбранной интеграции: клиент, сервер, данные, учётная запись. Перед подключением прочитайте схему одного инструмента и опишите его побочные эффекты. Не вводите рабочие ключи для этой проверки.
