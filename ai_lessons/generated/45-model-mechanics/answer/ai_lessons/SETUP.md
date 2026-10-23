# First real assistant session / Первый настоящий запуск

The course has two layers: configuration labs run without any account; real-assistant transfer uses a client already available to you. The authoring checks do not sign up, buy credits, or configure a provider on your behalf.

## 1. Prepare a disposable project

Copy `capstone-project` to a separate learning directory. Do not let a worker edit the original answer or tests to bypass acceptance. Open a terminal **in the copy**, run `node --version`, then `npm test`. The starter intentionally fails assertions about tag normalization. There is no dependency installation.

Русский: сделайте отдельную копию `capstone-project`, откройте в ней терминал и выполните `npm test`. Стартовое решение специально не проходит часть проверок. Не меняйте тесты.

## 2. Choose and open a client

Use your existing trusted coding assistant. In Codex, open the copied project through the project/folder selector; if using a terminal client, start it from that directory using the vendor's current installation guide. Authenticate through the official client UI yourself. Never paste passwords, access tokens, or provider keys into the course editor, instruction files, a Git repository, or chat messages.

Supported features differ. Record whether the client supports project instruction files, scoped editing, command execution, separate sessions/subagents, and cancellation. An ordinary web chat without project tools can explain a patch but cannot actually edit files or run tests. If a capability is unavailable, mark that step unavailable; do not claim it happened.

Русский: откройте копию проекта в уже доступном вам клиенте. Войдите через официальный интерфейс. Проверьте, есть ли чтение файлов, правки, терминал, инструкции проекта и отдельные сессии. Веб-чат без инструментов не является средой исполнения.

## 3. Load project rules

For Codex, adapt `capstone-pack/PROJECT_INSTRUCTIONS.md` as `AGENTS.md` at the copied project's root. Verify the current [instruction discovery rules](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Replace generic check placeholders with `npm test`, and limit scope to `src/tags.mjs`. Start a fresh session and ask the assistant to summarize the loaded scope, check command, and stop conditions.

Other clients may require another filename or settings surface. Follow their official documentation; do not rename a file and assume compatibility. Our `policy.json`, `tools.json`, and other lab files are **teaching schemas**, not vendor settings.

Русский: для Codex используйте документированный AGENTS.md в корне учебной копии. Укажите настоящий путь и команду `npm test`. В новой сессии проверьте обнаружение правил. Учебные JSON-файлы не нужно импортировать в клиент как готовые настройки.

## 4. Verify technical permissions

Use the least-privilege settings documented for your client. Permit only the disposable workspace and required checks. Leave networking, publication, external uploads, and credential access unavailable. Keep approval for consequential actions. Verify with dummy out-of-scope files, not secrets. See [official Codex security guidance](https://learn.chatgpt.com/docs/security); instruction text is not a sandbox.

## 5. Give the brief and inspect the first plan

Use the goal/scope/acceptance in the copied project's README. First ask the assistant to read the nearest tests and propose a minimal plan **without editing**. Check that it names the right source and `npm test`, does not suggest weakening tests, and asks about missing requirements rather than inventing them.

Then permit the scoped implementation. Obtain actual tool output and inspect `git diff` if the copy is a Git repository. Otherwise compare the source file before and after manually. Never run destructive reset commands to clean up evidence.

## 6. Add roles only after the single-worker loop works

Use ROLES.md with separate sessions if supported. Handoff the same brief, source diff, and actual test evidence to a reviewer who did not author the change. If automatic orchestration is not available, you can coordinate the roles manually; record this accurately. The course's runtime demonstrates sequencing, but does not install a multi-agent feature into every client.

## 7. Measure and stop

Record client/version, chosen model (if visible), actual checks, failures, and usage (if exposed). Do not hard-code model names or prices from a tutorial; check availability and current limits in your account. Keep at most two repair attempts. Finish ACCEPTANCE.md before marking real transfer verified. Publication is out of scope.
