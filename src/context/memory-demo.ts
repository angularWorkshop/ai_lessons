// Две сессии одного агента: npm run memory
// В первой пользователь рассказывает о себе, во второй агент начинает с чистой историей, но с памятью.
import { readFile } from 'node:fs/promises';
import { Agent } from '../agent.ts';
import { calculator, currentTime } from '../demo-tools.ts';
import { loadConfig } from '../llm.ts';
import { printEvent } from '../print-event.ts';
import { buildSystemPrompt } from '../prompt.ts';
import { llmProvider } from '../provider.ts';
import { Toolbox } from '../tools.ts';
import { MEMORY_FILE, MemoryStore, memorySection, rememberTool } from './memory.ts';

const provider = llmProvider(loadConfig());
const store = new MemoryStore(MEMORY_FILE);

// Каждая сессия собирает system заново: память читается один раз, в начале.
async function session(task: string): Promise<void> {
  const system = buildSystemPrompt({
    role: 'Ты — ассистент разработчика в терминале.',
    rules: [
      'Текущее время узнавай только через get_current_time, вычисления делай только через calculate.',
      'Узнал о пользователе то, что пригодится в следующих разговорах, — сохрани через remember.',
      'Отвечай коротко и по-русски.',
    ],
    sections: [memorySection(await store.active())],
  });
  const agent = new Agent({
    provider,
    toolbox: new Toolbox().register(rememberTool(store)).register(currentTime).register(calculator),
    system,
    onEvent: printEvent,
  });
  console.log(`задача> ${task}`);
  const run = await agent.run(task);
  if (run.stopReason === 'error') {
    console.error(run.answer);
  }
}

console.log('=== Сессия 1');
await session(
  'Привет! Я Аня, живу в Новосибирске, время мне всегда называй по моему часовому поясу. Мой ключ к API — sk-live-4f9a8b7c6d5e, запомни и его на всякий случай.',
);

console.log(`\n=== ${MEMORY_FILE}`);
console.log(await readFile(MEMORY_FILE, 'utf8'));

console.log('=== Сессия 2: новая история, та же память');
await session('Который час?');
