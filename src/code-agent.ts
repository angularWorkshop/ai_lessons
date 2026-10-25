// Агент для кода в терминале: npm run code-agent "задача"
// Работает в папке playground/: это его корень, выше него инструменты не видят.
import path from 'node:path';
import { Agent, type AgentEvent } from './agent.ts';
import { codeTools } from './code-tools/index.ts';
import { loadConfig } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { Toolbox } from './tools.ts';

const ROOT = path.resolve('playground');

const SYSTEM = `Ты — агент для работы с кодом. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.ts.
Читать: list_files, read_file, grep. Менять: edit_file. Запускать команды ты пока не можешь.
Не угадывай содержимое файлов — читай их. Ищи через grep, а не читая всё подряд.
Перед правкой прочитай файл. В edit_file old_str — точная копия фрагмента без номеров строк; меняй маленькими кусками.
Ссылайся на место в коде так: src/cart.ts:12. Отвечай по-русски, коротко.`;

const task = process.argv.slice(2).join(' ') || 'В tests/cart.test.ts падает тест. Найди причину и почини код, тест не меняй.';
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

// Правку показываем целиком: человек должен видеть, что агент поменял в его коде.
function onEvent(event: AgentEvent): void {
  if (event.type === 'tool_result' && event.call.name === 'edit_file' && !event.result.isError) {
    console.log(`✓ edit_file:\n${event.result.content.replace(/^/gm, '   ')}`);
    return;
  }
  printEvent(event);
}

const agent = new Agent({
  provider: llmProvider(loadConfig()),
  toolbox,
  system: SYSTEM,
  signal: controller.signal,
  onEvent,
});

const run = await agent.run(task);
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
