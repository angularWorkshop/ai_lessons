// Агент в терминале.
//   npm run agent                         разговор: задачи, /команды, Esc — остановить задачу
//   npm run agent "задача"                разговор, начиная с задачи
//   npm run agent -- -p "задача" --json   headless: одна задача без человека, JSON в stdout (тема 6.3)
import { Conversation } from './conversation.ts';
import { calculator, currentTime } from './demo-tools.ts';
import { parseCli, runHeadless, USAGE, USAGE_EXIT_CODE, UsageError, type CliMode } from './headless.ts';
import { loadConfig } from './llm.ts';
import { createPrinter } from './printer.ts';
import { llmProvider } from './provider.ts';
import { runRepl } from './repl.ts';
import { wait } from './slow-tools.ts';
import { Toolbox } from './tools.ts';

const SYSTEM = `Ты — агент, который решает задачи с помощью инструментов.
Текущее время узнавай только через get_current_time, любые вычисления делай только через calculate.
Когда всё узнал, ответь коротко и по-русски.`;

let cli: CliMode;
try {
  cli = parseCli(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  console.error(`${error.message}\n\n${USAGE}`);
  process.exit(USAGE_EXIT_CODE);
}

const provider = llmProvider(loadConfig());
const toolbox = new Toolbox({ maxResultChars: 2000 }).register(currentTime).register(calculator).register(wait);

if (cli.mode === 'headless') {
  // Человека нет, Esc нажать некому. Остановить могут сигналом: Ctrl+C — SIGINT, CI по таймауту — SIGTERM.
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  process.exitCode = await runHeadless({
    agent: { provider, toolbox, system: SYSTEM, signal: controller.signal },
    task: cli.task,
    json: cli.json,
    stdout: process.stdout,
    stderr: process.stderr,
  });
} else {
  const conversation = new Conversation({ provider, toolbox, system: SYSTEM, onEvent: createPrinter(), stream: true });
  await runRepl(conversation, cli.task);
}
