// Набор для eval: какой type Conventional Commits выбрать для diff.
// EXAMPLES идут в промпт, EVAL_CASES — только в проверку. Пересекаться они не должны.
import { z } from 'zod';
import { COMMIT_TYPES } from './commit.ts';
import type { EvalCase } from './eval.ts';
import type { Example } from './few-shot.ts';
import { buildSystemPrompt } from './prompt.ts';

export type CommitType = (typeof COMMIT_TYPES)[number];

export const CommitTypeSchema = z.object({ type: z.enum(COMMIT_TYPES) });

// Общепринятые определения из Conventional Commits. Договорённостей команды здесь нет — они в примерах.
export const COMMIT_TYPE_PROMPT = buildSystemPrompt({
  role: 'Ты выбираешь type Conventional Commits для git diff в TypeScript-проекте.',
  rules: [
    'feat — новая возможность.',
    'fix — исправление ошибки.',
    'refactor — код изменился, поведение нет.',
    'perf — ускорение или экономия ресурсов.',
    'docs — документация.',
    'test — тесты.',
    'build — сборка и внешние зависимости.',
    'ci — настройка CI.',
    'chore — прочее.',
  ],
  format: 'JSON с одним полем type.',
});

const answer = (type: CommitType) => JSON.stringify({ type });

export const EXAMPLES: Example[] = [
  {
    input: `diff --git a/package.json b/package.json
@@ -24,7 +24,7 @@
   "devDependencies": {
     "@types/node": "22.20.5",
-    "tsx": "4.23.14",
+    "tsx": "4.23.15",
     "typescript": "5.9.3"`,
    output: answer('build'),
  },
  {
    input: `diff --git a/src/llm.ts b/src/llm.ts
@@ -98,7 +98,7 @@ export function loadConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
     const value = env[name]?.trim();
     if (!value) {
-      throw new Error(\`Не задана переменая окружения \${name}\`);
+      throw new Error(\`Не задана переменная окружения \${name}\`);
     }`,
    output: answer('fix'),
  },
  {
    input: `diff --git a/tests/stream.test.ts b/tests/stream.test.ts
@@ -140,7 +140,7 @@ describe('Шаг 3 / Step 3. chatStream собирает ответ', () => {
   it('склеивает кусочки в ответ', async () => {
     stubFetch(stream(CHUNKS));
-    const result = chatStream(config, messages, {}, () => {});
+    const result = await chatStream(config, messages, {}, () => {});
     assert.equal(result.text, 'Привет');`,
    output: answer('test'),
  },
  {
    input: `diff --git a/package.json b/package.json
@@ -4,7 +4,7 @@
   "scripts": {
-    "test": "tsx --test tests/*.test.ts",
+    "test": "tsx --test --test-reporter=spec tests/*.test.ts",
     "start:dev": "node scripts/stackblitz-status.mjs",`,
    output: answer('build'),
  },
  {
    input: `diff --git a/src/session.ts b/src/session.ts
@@ -11,6 +11,8 @@ export interface SessionOptions {
 export class ChatSession {
+  // Историю меняет только сама сессия: наружу уходит копия.
   readonly #config: LlmConfig;`,
    output: answer('docs'),
  },
  {
    input: `diff --git a/.gitignore b/.gitignore
@@ -1,3 +1,4 @@
 node_modules
 .env
 .edutec-ready
+coverage/`,
    output: answer('chore'),
  },
];

export const EVAL_CASES: EvalCase<string, CommitType>[] = [
  {
    id: 'deps-zod',
    expected: 'build',
    input: `diff --git a/package.json b/package.json
@@ -19,7 +19,7 @@
   "dependencies": {
-    "zod": "4.6.6"
+    "zod": "4.6.7"
   },`,
  },
  {
    id: 'typo-reset',
    expected: 'fix',
    input: `diff --git a/src/chat.ts b/src/chat.ts
@@ -24,7 +24,7 @@ while (true) {
   if (text === '/reset') {
     session.reset();
-    console.log('История очишена. Потраченное за сессию остаётся в /cost.');
+    console.log('История очищена. Потраченное за сессию остаётся в /cost.');
     continue;`,
  },
  {
    id: 'flaky-test',
    expected: 'test',
    input: `diff --git a/tests/reliable.test.ts b/tests/reliable.test.ts
@@ -230,7 +230,7 @@ describe('Шаг 4 / Step 4. Повторы в chat', () => {
   it('повторяет после 502', async () => {
     const calls = stubFetch(upstream(), ok());
     const { sleep } = fakeSleep();
-    await chat(config, messages, { sleep: async (ms) => new Promise((r) => setTimeout(r, ms)) });
+    await chat(config, messages, { sleep });
     assert.equal(calls.count, 2);`,
  },
  {
    id: 'tsconfig-target',
    expected: 'build',
    input: `diff --git a/tsconfig.json b/tsconfig.json
@@ -1,6 +1,6 @@
 {
   "compilerOptions": {
-    "target": "ES2022",
+    "target": "ES2023",
     "module": "NodeNext",`,
  },
  {
    id: 'gitignore-env',
    expected: 'chore',
    input: `diff --git a/.gitignore b/.gitignore
@@ -1,3 +1,4 @@
 node_modules
 .env
+.env.local
 .edutec-ready`,
  },
  {
    id: 'comment-retry',
    expected: 'docs',
    input: `diff --git a/src/llm.ts b/src/llm.ts
@@ -150,6 +150,8 @@ function parseRetryAfter(value: string | null): number | undefined {
 // Шаг 3
+// Экспоненциальная пауза: 1, 2, 4 секунды…, но не больше MAX_DELAY_MS.
+// Если сервер сам прислал Retry-After, слушаемся его.
 export function retryDelay(attempt: number, retryAfterMs?: number): number {`,
  },
  {
    id: 'retry-after-zero',
    expected: 'fix',
    input: `diff --git a/src/llm.ts b/src/llm.ts
@@ -112,7 +112,7 @@ function parseRetryAfter(value: string | null): number | undefined {
   const seconds = Number(value);
-  if (seconds) {
+  if (Number.isFinite(seconds)) {
     return Math.max(0, seconds * 1000);
   }`,
  },
  {
    id: 'history-command',
    expected: 'feat',
    input: `diff --git a/src/chat.ts b/src/chat.ts
@@ -20,6 +20,12 @@ while (true) {
   if (text === '/exit') break;
+  if (text === '/history') {
+    for (const message of session.messages) {
+      console.log(\`[\${message.role}] \${message.content}\`);
+    }
+    continue;
+  }
   if (text === '/reset') {`,
  },
  {
    id: 'rename-helper',
    expected: 'refactor',
    input: `diff --git a/src/llm.ts b/src/llm.ts
@@ -120,7 +120,7 @@ export async function errorFromResponse(response: Response): Promise<LlmError> {
   const body = await response.text();
-  const code = readErrorCode(body);
+  const code = errorCodeFromBody(body);
@@ -131,7 +131,7 @@
-function readErrorCode(body: string): string | undefined {
+function errorCodeFromBody(body: string): string | undefined {`,
  },
  {
    id: 'stream-join',
    expected: 'perf',
    input: `diff --git a/src/llm.ts b/src/llm.ts
@@ -330,7 +330,7 @@ export async function chatStream(
-  let text = '';
+  // Склеиваем один раз в конце, а не на каждом кусочке.
+  const parts: string[] = [];
@@ -362,7 +362,7 @@
         if (delta) {
-          text += delta;
+          parts.push(delta);
           onDelta(delta);
@@ -380,5 +380,5 @@
-  return { text, finishReason, truncated: finishReason === 'length', usage };
+  return { text: parts.join(''), finishReason, truncated: finishReason === 'length', usage };`,
  },
  {
    id: 'ci-node',
    expected: 'ci',
    input: `diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
@@ -12,7 +12,7 @@ jobs:
       - uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version: 22
       - run: npm ci`,
  },
  {
    id: 'npm-script',
    expected: 'build',
    input: `diff --git a/package.json b/package.json
@@ -16,6 +16,7 @@
     "typecheck": "tsc --noEmit",
+    "check": "npm run typecheck && npm test",
     "prechat": "node scripts/check-env.mjs",`,
  },
  {
    id: 'readme-run',
    expected: 'docs',
    input: `diff --git a/README.md b/README.md
@@ -5,4 +5,5 @@
 1. Проверка запускается сама и перезапускается при каждом сохранении.
 2. Дописывай src/llm.ts по шагам, пока не увидишь ASSIGNMENT STATUS: COMPLETED.
+3. npm run chat — чат с моделью в терминале.`,
  },
  {
    id: 'new-test',
    expected: 'test',
    input: `diff --git a/tests/reliable.test.ts b/tests/reliable.test.ts
@@ -205,4 +205,9 @@ describe('Шаг 3 / Step 3. retryDelay: сколько ждать перед повтором', () => {
+
+  it('Retry-After больше потолка обрезается до 30 секунд', () => {
+    assert.equal(retryDelay(0, 120_000), 30_000);
+  });
 });`,
  },
];
