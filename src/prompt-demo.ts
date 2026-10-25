// Размытый system prompt против конкретного на одной и той же задаче.
// Запуск: npm run prompt
import { chat, loadConfig, type Message } from './llm.ts';
import { buildSystemPrompt } from './prompt.ts';

const DIFF = `diff --git a/src/llm.ts b/src/llm.ts
@@ -112,7 +112,7 @@ function parseRetryAfter(value: string | null): number | undefined {
   const seconds = Number(value);
-  if (seconds) {
+  if (Number.isFinite(seconds)) {
     return Math.max(0, seconds * 1000);
   }`;

const vague = 'Ты полезный помощник программиста. Напиши хорошее сообщение коммита для изменений.';

// Длинный, но такой же размытый: много слов, ни одного проверяемого правила.
const wordy = `Ты — опытный senior-разработчик с двадцатилетним стажем и глубоким пониманием лучших практик.
Ты всегда пишешь качественные, понятные, профессиональные и информативные сообщения коммитов,
которые помогают команде понимать историю проекта. Будь внимателен к деталям, думай о читателе,
следуй общепринятым стандартам индустрии и пиши так, чтобы гордиться результатом.`;

const concrete = buildSystemPrompt({
  role: 'Ты пишешь сообщения коммитов для TypeScript-проекта. Тебе присылают git diff.',
  goal: 'Сообщение, которое можно сразу передать в git commit -m без правок.',
  rules: [
    'Формат Conventional Commits: <type>(<scope>): <subject>.',
    'type — одно из feat, fix, refactor, perf, docs, test, build, ci, chore.',
    'scope — имя изменённого модуля без расширения, например llm или session.',
    'subject — на английском, в повелительном наклонении, со строчной буквы, без точки в конце, до 72 символов.',
    'Описывай, что меняется для поведения программы, а не какие строки поменялись.',
  ],
  format: 'Одна строка — само сообщение. Без кавычек, без Markdown, без пояснений до и после.',
});

const config = loadConfig();

for (const [name, system] of [
  ['Размытый', vague],
  ['Многословный', wordy],
  ['Конкретный', concrete],
] as const) {
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: DIFF },
  ];
  const result = await chat(config, messages, { maxTokens: 400 });
  console.log(`=== ${name} prompt · вход ${result.usage.input} · выход ${result.usage.output}`);
  console.log(result.text);
  console.log();
}
