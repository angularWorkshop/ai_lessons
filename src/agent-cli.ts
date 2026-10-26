// Агент в терминале: npm run agent "задача"
// С темы 6.1 ответ модели печатается по мере генерации.
import { Agent } from './agent.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { loadConfig } from './llm.ts';
import { createPrinter } from './printer.ts';
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

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox: new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator),
  system: SYSTEM,
  signal: controller.signal,
  onEvent: createPrinter(),
  stream: true,
});

const run = await agent.run(task);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}, сообщений в истории: ${run.messages.length}`);
