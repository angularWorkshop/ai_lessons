// Что занимает окно и сколько стоит каждый шаг агента: npm run budget
// npm run budget -- --compact — та же задача со сжатием старых результатов инструментов.
import { Agent } from '../agent.ts';
import { calculator } from '../demo-tools.ts';
import { chat, loadConfig, type Message, type ToolSpec } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { llmProvider } from '../provider.ts';
import { Toolbox } from '../tools.ts';
import { contextBreakdown, StepLedger } from './budget.ts';
import { readFileTool } from './read-file.ts';
import { compactToolResults } from './tool-results.ts';

const PRICE = { inputPerMillion: 0.03, outputPerMillion: 0.13 };

const SYSTEM = `Ты — агент, который отвечает на вопросы о коде этого проекта.
Код читай только через read_file, по одному файлу за шаг. Не отвечай по памяти.
Прочитав файл, перед следующим вызовом одной строкой запиши, что из него нужно для задачи.
В конце ответь коротко и по-русски.`;

const TASK = 'Какие значения по умолчанию заданы константами DEFAULT_* в src/llm.ts, src/tools.ts и src/agent.ts? Выпиши каждую с её значением.';

const compact = process.argv.includes('--compact');
const config = loadConfig();
const toolbox = new Toolbox({ maxResultChars: 40_000 }).register(readFileTool()).register(calculator);

// 1. Замер по разности: один и тот же вопрос без system, с system, с system и инструментами.
// maxTokens: 1 — ответ не нужен, нужен только usage.input.
async function inputTokens(messages: Message[], tools?: ToolSpec[]): Promise<number> {
  const result = await chat(config, messages, { maxTokens: 1, tools });
  return result.usage.input;
}

const task: Message = { role: 'user', content: TASK };
const bare = await inputTokens([task]);
const withSystem = await inputTokens([{ role: 'system', content: SYSTEM }, task]);
const withTools = await inputTokens([{ role: 'system', content: SYSTEM }, task], toolbox.specs());
console.log(`задача: ${bare} · system: ${withSystem - bare} · описания инструментов: ${withTools - withSystem} токенов`);
console.log(`задача> ${TASK}${compact ? '\n(старые результаты инструментов сжимаются)' : ''}`);

// 2. Агент на настоящей задаче. Журнал шагов слушает те же события, что и печать.
const ledger = new StepLedger(PRICE);
const prepareMessages = compact ? (messages: Message[]) => compactToolResults(messages, { keep: 1 }) : undefined;
const agent = new Agent({
  provider: llmProvider(config),
  toolbox,
  system: SYSTEM,
  prepareMessages,
  onEvent: (event) => {
    printEvent(event);
    ledger.onEvent(event);
  },
});
const run = await agent.run(TASK);
if (run.stopReason === 'error') {
  console.error(run.answer);
}

console.log('\nшаг   вход   выход   цена шага    с начала задачи');
for (const step of ledger.steps) {
  console.log(
    `${String(step.step).padStart(3)} ${String(step.input).padStart(7)} ${String(step.output).padStart(6)}   $${step.cost.toFixed(6)}   $${step.total.toFixed(6)}`,
  );
}
console.log(`всего входных токенов: ${ledger.inputTokens}`);

// 3. Из чего состоял последний запрос: оценка по символам против счёта модели.
const lastRequest = run.messages.slice(0, -1);
const parts = contextBreakdown({
  system: SYSTEM,
  tools: toolbox.specs(),
  messages: prepareMessages ? prepareMessages(lastRequest) : lastRequest,
});
console.log(
  `последний запрос, оценка: system ${parts.system}, инструменты ${parts.tools}, история ${parts.history}, ` +
    `результаты инструментов ${parts.toolResults}, всего ${parts.total}; модель насчитала ${ledger.steps.at(-1)?.input}`,
);
