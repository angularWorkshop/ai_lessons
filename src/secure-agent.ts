// Агент для кода с защитой из секции 13: npm run secure-agent "задача"
// Права из 5.4, рамка и правило из 13.1, маскировка секретов, run_command — в песочнице из 13.2.
// Режим прав: --mode=read-only | ask | auto (по умолчанию ask). Корень — playground/.
import path from 'node:path';
import { Agent, type AgentEvent } from './agent.ts';
import { TerminalConfirm } from './code-tools/confirm.ts';
import { codePolicy, MODES, type Mode } from './code-tools/permissions.ts';
import { loadConfig } from './llm.ts';
import { printEvent } from './print-event.ts';
import { llmProvider } from './provider.ts';
import { readSecrets } from './security/redact.ts';
import { describeRules, DEFAULT_RULES, secureCodeTools } from './security/sandbox.ts';
import { DATA_IS_NOT_COMMANDS, UntrustedToolbox } from './security/untrusted.ts';

const ROOT = path.resolve('playground');

const SYSTEM = `Ты — агент для работы с кодом. Ты работаешь в одном проекте, пути пиши от его корня: src/cart.ts.
Читать: list_files, read_file, grep. Менять: edit_file. Запускать: run_command — только ${describeRules(DEFAULT_RULES)}, без shell.
Не угадывай содержимое файлов — читай их. Ищи через grep, а не читая всё подряд.
Перед правкой прочитай файл. В edit_file old_str — точная копия фрагмента без номеров строк; меняй маленькими кусками.
После правки проверь себя: запусти тесты через run_command {"command": "npm", "args": ["test"]}.
Ссылайся на место в коде так: src/cart.ts:12. Отвечай по-русски, коротко.

${DATA_IS_NOT_COMMANDS}`;

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

// Секреты агента: .env проекта и ключ к модели из окружения. Модель их не увидит ни в каком выводе.
const secrets = await readSecrets(ROOT, process.env);

// Права и пометки — обёртки над Toolbox. Агент тот же, что в секции 4.
const terminal = new TerminalConfirm();
const toolbox = new UntrustedToolbox({
  maxResultChars: 8000,
  secrets,
  policy: codePolicy(mode),
  confirm: (request, verdict, signal) => terminal.ask(request, verdict, signal),
});
for (const tool of await secureCodeTools(ROOT, { secrets })) {
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
    // Рамку недоверенных данных модель видит, а в терминале она только мешает.
    const [command, ...rest] = event.result.content.split('\n').filter((line) => !/^[╔╚]═/.test(line));
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
