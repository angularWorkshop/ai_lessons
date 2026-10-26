// Свой мини-Claude Code: npm run harness
//   npm run harness                         разговор в терминале, проект — playground/
//   npm run harness -- -p "задача" --json   одна задача без человека (тема 6.3)
//   npm run harness -- --mode auto          режим прав из темы 5.4
// Всё, что написано в курсе, собирает createHarness. Этот файл только читает аргументы и выбирает интерфейс.
import path from 'node:path';
import { Conversation } from '../conversation.ts';
import { USAGE_EXIT_CODE, UsageError } from '../headless.ts';
import { loadConfig } from '../llm.ts';
import { loadMcpConfig } from '../mcp/config.ts';
import { llmProvider } from '../provider.ts';
import { runRepl } from '../repl.ts';
import { keyConfirm } from './confirm.ts';
import { createHarness } from './create.ts';
import { HARNESS_USAGE, harnessPrinter, parseHarnessArgs, runOnce, type HarnessArgs } from './run.ts';

let args: HarnessArgs;
try {
  args = parseHarnessArgs(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`${error.message}\n\n${HARNESS_USAGE}`);
  process.exit(USAGE_EXIT_CODE);
}

const headless = args.cli.mode === 'headless';
// В headless stdout занят результатом: всё для человека — в stderr.
const out = headless ? process.stderr : process.stdout;
const root = path.resolve(args.cwd);

const harness = await createHarness({
  root,
  provider: llmProvider(loadConfig()),
  mode: args.mode,
  // Человека нет — спросить некого. Без confirm harness отвечает «нет» на каждый вопрос.
  confirm: headless ? undefined : keyConfirm(process.stdin, process.stdout),
  // Скиллы курса из секции 9 — общие для любого проекта, как ~/.claude/skills у Claude Code.
  skillDirs: [path.resolve('skills')],
  mcp: await loadMcpConfig(root),
  ...harnessPrinter(out),
});

const { info } = harness;
console.error(`проект> ${path.relative(process.cwd(), root) || '.'}/ · режим ${args.mode ?? 'ask'}`);
console.error(`инструменты> ${info.tools.join(', ')}`);
console.error(`скиллы> ${info.skills.join(', ') || 'нет'} · AGENTS.md> ${info.agentsFiles.join(', ') || 'нет'}`);
for (const warning of info.warnings) console.error(`⚠ ${warning}`);

try {
  const conversation = new Conversation(harness.agent);
  if (args.cli.mode === 'headless') {
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    process.exitCode = await runOnce({
      conversation,
      task: args.cli.task,
      json: args.cli.json,
      stdout: process.stdout,
      stderr: process.stderr,
      signal: controller.signal,
    });
  } else {
    await runRepl(conversation, args.cli.task);
  }
} finally {
  await harness.close();
}
