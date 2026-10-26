// Одна задача — с AGENTS.md и без: npm run agents-md
// Рабочая папка агента — examples/shop/billing, корень проекта — examples/shop.
import { Agent } from '../agent.ts';
import { calculator } from '../demo-tools.ts';
import { loadConfig } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { buildSystemPrompt, type SystemPromptSpec } from '../prompt.ts';
import { llmProvider } from '../provider.ts';
import { Toolbox } from '../tools.ts';
import { buildAgentSystem } from './agents-md.ts';

const BASE: SystemPromptSpec = {
  role: 'Ты — агент для работы с кодом. Решаешь задачи разработчика в его проекте.',
  rules: ['Любые вычисления делай только через calculate.', 'Отвечай коротко и по-русски.'],
};

const TASK = 'Клиент берёт 3 подписки по 1 999,99 ₽ со скидкой 15%. Сколько он заплатит?';
const provider = llmProvider(loadConfig());

const project = await buildAgentSystem(BASE, { cwd: 'examples/shop/billing', root: 'examples/shop' });
for (const layer of project.layers) {
  const cut = layer.content.length < layer.chars ? ` — обрезан до ${layer.content.length}` : '';
  console.log(`слой: ${layer.file} (${layer.chars} символов${cut})`);
}

for (const [name, system] of [
  ['Без AGENTS.md', buildSystemPrompt(BASE)],
  ['С AGENTS.md', project.system],
] as const) {
  console.log(`\n=== ${name}\nзадача> ${TASK}`);
  const agent = new Agent({ provider, toolbox: new Toolbox().register(calculator), system, onEvent: printEvent });
  const run = await agent.run(TASK);
  if (run.stopReason === 'error') {
    console.error(run.answer);
  }
}

console.log(`\n=== system prompt с AGENTS.md\n${project.system}`);
