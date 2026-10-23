# Answer from evidence, or say what is missing

Edit `src/exercise.mjs`. Do not change the tests or runtime.

## English
- Return accepted only for nonempty claims.
- Require at least one source id per claim.
- Every id must exist in retrieved; do not pretend a regex proves semantic support.

## Русский
- Верните accepted только для непустого claims.
- У каждого claim.sources должен быть хотя бы один id.
- Каждый id должен существовать в retrieved; не оценивайте смысл текста регулярным выражением.

## Run the worked system
This worked system is included in the branch. Run from its root; the main exercise checks remain separate.
```sh
node ai_lessons/workbench/demo.mjs rag
node --test ai_lessons/workbench/workbench.test.mjs
```
Expect reset@2 and abstain when evidence is absent. Another tenant must not enter the packet. Vectors are hand-authored and model generation is not simulated.

## Сквозной разбор с исполняемым кодом
Дополнительный разбор уже включён в ветку. Выполните команды из её корня; автопроверка основного задания остаётся отдельной.
```sh
node ai_lessons/workbench/demo.mjs rag
node --test ai_lessons/workbench/workbench.test.mjs
```
Ожидайте источник reset@2 и abstain без подходящих данных. Чужой tenant не должен попасть в пакет. Векторы заданы руками, генерация модели не имитируется.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Test a known fact, an absent fact, and an outdated rule. Open every cited source manually. Report reference integrity separately from semantic grounding.

Проверьте ответ на известный факт, отсутствующий факт и устаревшее правило. Для каждого утверждения вручную откройте источник. Отметьте ссылочную и смысловую проверку отдельно.
