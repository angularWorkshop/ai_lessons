# Function calling: from a model request to a tool result

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Check used >= limit first; then handle text as answer.
- For tool calls, allow only approved add with exactly two numeric fields a and b.
- Return tool-result with id and the computed value; otherwise deny.

## Русский
- Сначала проверьте used >= limit. Затем обработайте text как answer.
- Для tool разрешите только approved add с ровно двумя числовыми полями a и b.
- Верните tool-result с id и вычисленным value; при нарушении — deny.

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
Run node ai_lessons/workbench/demo.mjs agent in this branch. Inspect the computed result, trace, unknown-tool denial, and finite budget. The stub is not an LLM; actual local inference is a separate connection.

Запустите node ai_lessons/workbench/demo.mjs agent в ветке. Проверьте вычисленный результат, trace, отказ неизвестному инструменту и конечный бюджет. Stub не считается реальной LLM; локальная модель подключается отдельно.
