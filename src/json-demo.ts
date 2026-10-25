// JSON по просьбе в тексте против response_format + zod.
// Запуск: npm run json
import { COMMIT_SYSTEM_PROMPT, CommitSchema, formatCommit } from './commit.ts';
import { chat, loadConfig, type Message } from './llm.ts';
import { askJson, StructuredOutputError } from './structured.ts';

const DIFFS = [
  `diff --git a/src/llm.ts b/src/llm.ts
@@ -112,7 +112,7 @@ function parseRetryAfter(value: string | null): number | undefined {
   const seconds = Number(value);
-  if (seconds) {
+  if (Number.isFinite(seconds)) {
     return Math.max(0, seconds * 1000);
   }`,
  `diff --git a/src/session.ts b/src/session.ts
@@ -44,6 +44,12 @@ export class ChatSession {
+  /** Сколько сообщений в истории, не считая system. */
+  get turns(): number {
+    return this.#history.filter((message) => message.role !== 'system').length;
+  }
+
   get usage(): Usage {`,
  `diff --git a/src/chat.ts b/src/chat.ts
@@ -20,6 +20,11 @@ while (true) {
   if (text === '/exit') break;
+  if (text === '/history') {
+    for (const message of session.messages) {
+      console.log(\`[\${message.role}] \${message.content}\`);
+    }
+    continue;
+  }
   if (text === '/reset') {`,
];

const config = loadConfig();

console.log('=== 1. «Верни JSON» только в тексте промпта');
const plain: Message[] = [
  { role: 'system', content: 'Ты пишешь сообщения коммитов для TypeScript-проекта. Верни JSON с полями type, scope, subject.' },
  { role: 'user', content: DIFFS[0] },
];
const naive = await chat(config, plain, { maxTokens: 200 });
console.log(naive.text);
try {
  JSON.parse(naive.text);
  console.log('→ JSON.parse: ok');
} catch (error) {
  console.log(`→ JSON.parse: ${(error as Error).message}`);
}

console.log('\n=== 2. askJson: response_format + zod + одна починка');
for (const diff of DIFFS) {
  const messages: Message[] = [
    { role: 'system', content: COMMIT_SYSTEM_PROMPT },
    { role: 'user', content: diff },
  ];
  try {
    const result = await askJson(config, messages, CommitSchema, {
      name: 'commit',
      maxTokens: 200,
      onRepair: (problem, raw) => console.log(`  ✖ не прошло схему:\n${raw}\n${problem}\n  → прошу исправить`),
    });
    console.log(`${formatCommit(result.data)}`);
    console.log(`  [попыток ${result.attempts} · вход ${result.usage.input} · выход ${result.usage.output}]`);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      console.log(`  ✖ ${error.message}`);
    } else {
      throw error;
    }
  }
}
