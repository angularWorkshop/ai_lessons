// Агент для кода в терминале: npm run code-agent "задача"
// Режим прав: npm run code-agent -- --mode=read-only "задача" (по умолчанию ask, ещё есть auto).
// Работает в папке playground/: это его корень, выше него инструменты не видят.
import path from 'node:path';
import { Agent, type AgentEvent } from './agent.ts';
import { TerminalConfirm } from './code-tools/confirm.ts';
import { codeTools } from './code-tools/index.ts';
import { codePolicy, GuardedToolbox, MODES, type Mode } from './code-tools/permissions.ts';
import { loadConfig } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';

const ROOT = path.resolve('playground');

const SYSTEM = `Ты — агент для работы с кодом. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.ts.
Читать: list_files, read_file, grep. Менять: edit_file. Запускать: run_command — node, npm test, ls, cat, без shell.
Не угадывай содержимое файлов — читай их. Ищи через grep, а не читая всё подряд.
Перед правкой прочитай файл. В edit_file old_str — точная копия фрагмента без номеров строк; меняй маленькими кусками.
После правки проверь себя: запусти тесты через run_command {"command": "npm", "args": ["test"]}.
Ссылайся на место в коде так: src/cart.ts:12. Отвечай по-русски, коротко.`;

const argv = process.argv.slice(2);
const modeArg = argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length) ?? 'ask';
if (!MODES.includes(modeArg as Mode)) {
  console.error(`Режим ${modeArg} не знаю. Есть: ${MODES.join(', ')}`);
  process.exit(1);
}
const mode = modeArg as Mode;
const task = argv.filter((arg) => !arg.startsWith('--mode=')).join(' ') || 'Почини тест в playground. Тесты не меняй.';
console.log(`проект> ${path.relative(process.cwd(), ROOT)}/ · режим ${mode}`);
console.log(`задача> ${task}`);

const controller = new AbortController();
process.once('SIGINT', () => {
  console.log('\nCtrl+C — останавливаю агента...');
  controller.abort();
});

// Права — обёртка над Toolbox. Агент тот же, что в секции 4.
const terminal = new TerminalConfirm();
const toolbox = new GuardedToolbox({
  maxResultChars: 8000,
  policy: codePolicy(mode),
  confirm: (request, verdict, signal) => terminal.ask(request, verdict, signal),
});
for (const tool of codeTools(ROOT)) {
  toolbox.register(tool);
}

// Правку показываем целиком: человек должен видеть, что агент поменял в его коде.
function onEvent(event: AgentEvent): void {
  if (event.type === 'tool_result' && event.call.name === 'edit_file' && !event.result.isError) {
    console.log(`✓ edit_file:\n${event.result.content.replace(/^/gm, '   ')}`);
    return;
  }
  // От команды — заголовок (команда и код выхода) и последние строки вывода: там итог.
  if (event.type === 'tool_result' && event.call.name === 'run_command' && !event.result.isError) {
    const [command, ...rest] = event.result.content.split('\n');
    const status = rest.findIndex((line) => line.startsWith('код выхода') || line.startsWith('завершена'));
    console.log(`✓ ${command} · ${rest[status]}`);
    console.log(rest.slice(Math.max(status + 1, rest.length - 6)).map((line) => `   ${line}`).join('\n'));
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
terminal.close();
if (run.stopReason === 'error') {
  console.error(run.answer);
}
console.log(`шагов: ${run.steps}, токенов: ${run.usage.input} → ${run.usage.output}`);
