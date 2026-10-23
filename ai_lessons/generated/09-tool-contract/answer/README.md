# Tool contracts: inputs, outputs, and side effects

Edit `src/tools.json`. Do not change the tests or runtime.

## English
- Allow only readDoc inside docs.
- Its required and allowed fields must contain only path; set effect to read-only.
- Check missing and extra arguments, an unknown tool, and an out-of-scope path.

## Русский
- Разрешите только readDoc в roots: docs.
- Для него required и allowed должны содержать только path; effect: read-only.
- Проверьте отсутствующее поле, лишний аргумент, неизвестное имя и путь вне docs.

## Run the worked system
This worked system is included in the branch. Run from its root; the main exercise checks remain separate.
```sh
node ai_lessons/workbench/demo.mjs agent
node --test ai_lessons/workbench/workbench.test.mjs
```
Expect answered, result 5, and one actual add in the trace. The provider is explicitly an offline stub. Check unknown-tool denial and exhausted budget.

## Сквозной разбор с исполняемым кодом
Дополнительный разбор уже включён в ветку. Выполните команды из её корня; автопроверка основного задания остаётся отдельной.
```sh
node ai_lessons/workbench/demo.mjs agent
node --test ai_lessons/workbench/workbench.test.mjs
```
Ожидайте answered, результат 5 и один фактический add в trace. Provider здесь явно обозначен как offline stub. Проверьте отказ неизвестному инструменту и исчерпание бюджета.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Find the tools/MCP settings in your client without installing a random server. Use official documentation to record source, permissions, authentication, disconnection, and a denial test. Use only a trusted read-only tool for a real connection.

В выбранном клиенте найдите раздел инструментов/MCP, не устанавливая случайный сервер. По официальной документации составьте карточку подключения: источник, права, тип авторизации, отключение и тест отказа. Для реального запуска используйте только доверенный read-only инструмент.
