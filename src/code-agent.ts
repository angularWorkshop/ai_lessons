// Агент для кода в терминале: npm run code-agent "задача"
// Работает в папке playground/: это его корень, выше него инструменты не видят.
import path from 'node:path';
import { Agent } from './agent.ts';
import { codeTools } from './code-tools/index.ts';
import { loadConfig } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { Toolbox } from './tools.ts';

const ROOT = path.resolve('playground');

const SYSTEM = `Ты — агент для работы с кодом. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.ts.
Пока у тебя есть только чтение: list_files, read_file и grep. Менять файлы и запускать команды ты не можешь.
Не угадывай содержимое файлов — читай их. Ищи через grep, а не читая всё подряд.
Ссылайся на место в коде так: src/cart.ts:12. Отвечай по-русски, коротко.`;

const task = process.argv.slice(2).join(' ') || 'Почему падает тест в tests/cart.test.ts? Найди причину, ничего не меняй.';
console.log(`проект> ${path.relative(process.cwd(), ROOT)}/`);
console.log(`задача> ${task}`);

const controller = new AbortController();
process.once('SIGINT', () => {
  console.log('\nCtrl+C — останавливаю агента...');
  controller.abort();
});

const toolbox = new Toolbox({ maxResultChars: 8000 });
for (const tool of codeTools(ROOT)) {
  toolbox.register(tool);
}

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox,
  system: SYSTEM,
  signal: controller.signal,
  onEvent: printEvent,
});

const run = await agent.run(task);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
