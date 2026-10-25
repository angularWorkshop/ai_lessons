// Агент в терминале: npm run agent "задача"
import { Agent } from './agent.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { loadConfig } from './llm.ts';
import { startMcpServers } from './mcp/agent-tools.ts';
import { loadMcpConfig } from './mcp/config.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { Toolbox } from './tools.ts';

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Текущее время узнавай только через get_current_time, любые вычисления делай только через calculate.
Когда всё узнал, ответь коротко и по-русски.`;

const task = process.argv.slice(2).join(' ') || 'Сколько минут осталось до полуночи в Токио? Какая это доля суток в процентах?';
console.log(`задача> ${task}`);

// Ctrl+C останавливает агента, а не убивает процесс: run вернётся с aborted и целой историей.
const controller = new AbortController();
process.once('SIGINT', () => {
  console.log('\nCtrl+C — останавливаю агента...');
  controller.abort();
});

const toolbox = new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator);
// Тема 11.3: инструменты MCP-серверов из mcp.json. Нет файла — агент работает только со своими.
const mcp = await startMcpServers(toolbox, await loadMcpConfig());
for (const { error } of mcp.failed) {
  console.error(`${error}. Работаем без него.`);
}
console.log(`инструменты> ${toolbox.specs().map((spec) => spec.function.name).join(', ')}`);

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox,
  system: SYSTEM,
  signal: controller.signal,
  onEvent: printEvent,
});

// run не бросает, но серверы закрываем при любом исходе: done, error, aborted.
const run = await agent.run(task).finally(() => mcp.close());
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}, сообщений в истории: ${run.messages.length}`);
