// Агент упирается в лимит шагов: npm run limits
import { Agent } from './agent.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { loadConfig } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { Toolbox } from './tools.ts';

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Любые вычисления делай только через calculate, по одной операции за вызов.
Когда всё узнал, ответь коротко и по-русски.`;

const task = 'Вклад 100 000 ₽ под 12% годовых с капитализацией раз в год. Посчитай сумму на конец каждого года, с первого по шестой.';
console.log(`задача> ${task}`);

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox: new Toolbox().register(currentTime).register(calculator),
  system: SYSTEM,
  limits: { maxSteps: 4 },
  onEvent: printEvent,
});

const run = await agent.run(task);
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
