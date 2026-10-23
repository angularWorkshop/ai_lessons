# Team roles: planner, worker, and reviewer

Edit `src/roles.json`. Do not change the tests or runtime.

## English
- Configure the four routes in roles.json as shown.
- Use fallback: human for an unknown kind.
- Confirm that review never returns developer.

## Русский
- Настройте четыре маршрута в roles.json по примеру.
- Для неизвестного kind используйте fallback: human.
- Проверьте, что review не возвращает developer.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Solve a small task with one worker. Give a separate reviewer session only the brief, diff, and evidence. Compare findings with the cost of the extra step.

Решите маленькую задачу одним исполнителем, затем дайте отдельной сессии ревьюера только постановку, diff и доказательства. Сравните найденные проблемы со стоимостью дополнительного шага.
