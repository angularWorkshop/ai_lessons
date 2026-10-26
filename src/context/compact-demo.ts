// Агент со сжатием истории: npm run compact
// Порог нарочно маленький, чтобы сжатие случилось уже на втором файле.
import { Agent } from '../agent.ts';
import { loadConfig } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { llmProvider } from '../provider.ts';
import { Toolbox } from '../tools.ts';
import { Compactor } from './compaction.ts';
import { readFileTool } from './read-file.ts';

const SYSTEM = `Ты — агент, который отвечает на вопросы о коде этого проекта.
Код читай только через read_file, по одному файлу за шаг. Не отвечай по памяти.
Пока не прочитал все нужные файлы, каждый твой ответ — вызов read_file.`;

const TASK = `Прочитай по очереди src/llm.ts, src/tools.ts и src/agent.ts и найди все константы, чьё имя начинается с DEFAULT_.
Ответ — только JSON-объект {"ИМЯ": значение}, числа без подчёркиваний, без пояснений и без Markdown.`;

const provider = llmProvider(loadConfig());
const compactor = new Compactor({
  provider,
  threshold: 6000,
  keepLast: 2,
  onCompact: (event) => {
    console.log(`\n⇣ сжатие на шаге ${event.step}: ${event.summarized} сообщений → сводка; запрос ~${event.before} → ~${event.after} токенов`);
    console.log(`  сводка стоила ${event.usage.input} → ${event.usage.output} токенов:\n`);
    console.log(event.summary.replace(/^/gm, '  │ '));
  },
});

const agent = new Agent({
  provider,
  toolbox: new Toolbox({ maxResultChars: 40_000 }).register(readFileTool()),
  system: SYSTEM,
  prepareMessages: compactor.prepare,
  onEvent: printEvent,
});

console.log(`задача> ${TASK}`);
const run = await agent.run(TASK);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов агента: ${run.usage.input} → ${run.usage.output}, сообщений в истории: ${run.messages.length}`);
