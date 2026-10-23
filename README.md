# Handoffs: what the next worker needs

Edit `src/handoff.json`. Do not change the tests or runtime.

## English
- Require owner, status, summary, and evidence.
- Allow only ready and blocked.
- Reject empty evidence, a missing owner, and an uncertain status.

## Русский
- Требуйте owner, status, summary и evidence.
- Разрешите только ready и blocked.
- Отвергайте пустые доказательства, отсутствующего владельца и неопределённый статус.

## Check
`npm test` or `npm run start:dev` (Node 20.19+; no dependencies or paid API required).

The runner reports automated exercise status. Real-assistant transfer is a separate manual check. Executable labs test JavaScript behavior; policy labs test educational configurations.

Transfer guides and runnable CPU/local-model resources are in [ai_lessons](./ai_lessons). Python training runs on your PC, not in a Node-only browser terminal. No weights are downloaded automatically.

## Transfer / Перенос
Finish a small task with a handoff file. Start a new session with only that file and the project. Check whether the assistant can identify the next step without the old chat.

Закончите короткую задачу handoff-файлом и откройте новую сессию только с ним и проектом. Проверьте, сможет ли ассистент назвать следующий шаг без старого чата.
