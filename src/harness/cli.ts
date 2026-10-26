// Свой мини-Claude Code: npm run harness
//   npm run harness                         разговор в терминале, проект — playground/
//   npm run harness -- -p "задача" --json   одна задача без человека (тема 6.3)
//   npm run harness -- --mode auto          режим прав из темы 5.4, сильнее настроек
//   npm run harness -- --continue           продолжить последнюю сессию, --resume <id> — любую (тема 12.3)
// Настройки — ~/.agent/settings.json → playground/.agent/settings.json → playground/.agent/settings.local.json (тема 12.2).
// Всё, что написано в курсе, собирает createHarness. Этот файл только читает аргументы и настройки и выбирает интерфейс.
import os from 'node:os';
import path from 'node:path';
import { USAGE_EXIT_CODE, UsageError } from '../headless.ts';
import { loadConfig } from '../llm.ts';
import { loadMcpConfig } from '../mcp/config.ts';
import { llmProvider } from '../provider.ts';
import { runRepl } from '../repl.ts';
import { keyConfirm } from './confirm.ts';
import { createHarness, type Harness } from './create.ts';
import { HookError } from './hooks.ts';
import { HARNESS_USAGE, harnessPrinter, parseHarnessArgs, runOnce, type HarnessArgs } from './run.ts';
import { openSession, SessionConversation } from './session.ts';
import { fromSettings, loadSettings, SettingsError, type LoadedSettings } from './settings.ts';

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

let loaded: LoadedSettings;
try {
  loaded = await loadSettings({ home: os.homedir(), root });
} catch (error) {
  if (!(error instanceof SettingsError)) throw error;
  console.error(`Настройки не прочитались — ${error.message.replace(`${process.cwd()}${path.sep}`, '')}`);
  process.exit(USAGE_EXIT_CODE);
}
const { settings } = loaded;
const options = fromSettings({ settings, mode: args.mode, headless });
const config = loadConfig();

let harness: Harness;
try {
  harness = await createHarness({
    root,
    provider: llmProvider({ ...config, model: settings.model ?? config.model }),
    ...options,
    // Человека нет — confirm не нужен: в headless политика сама превращает ask в deny.
    confirm: headless ? undefined : keyConfirm(process.stdin, process.stdout),
    // Скиллы курса из секции 9 — встроенные, как у Claude Code. Свои добавляются настройкой skills.
    skillDirs: [path.resolve('skills'), ...(options.skillDirs ?? [])],
    // mcp.json проекта (тема 11.3) и mcpServers из настроек. При одинаковом имени побеждают настройки.
    mcp: { mcpServers: { ...(await loadMcpConfig(root)).mcpServers, ...options.mcp?.mcpServers } },
    ...harnessPrinter(out),
  });
} catch (error) {
  // Тема 12.4: хук не загрузился — не работаем без него: он мог быть единственной защитой.
  if (!(error instanceof HookError)) throw error;
  console.error(`Хуки не подключились — ${error.message.replace(`${process.cwd()}${path.sep}`, '')}`);
  process.exit(USAGE_EXIT_CODE);
}

const { info } = harness;
console.error(`проект> ${path.relative(process.cwd(), root) || '.'}/ · режим ${options.mode} · модель ${settings.model ?? config.model}`);
console.error(`настройки> ${loaded.files.map((file) => path.relative(process.cwd(), file)).join(' → ') || 'нет'}`);
console.error(`инструменты> ${info.tools.join(', ')}`);
console.error(`скиллы> ${info.skills.join(', ') || 'нет'} · AGENTS.md> ${info.agentsFiles.join(', ') || 'нет'}`);
const hooks = Object.entries(settings.hooks ?? {}).flatMap(([event, list]) => list.map((hook) => `${event} ${hook.matcher ?? '*'} → ${path.basename(hook.module)}`));
if (hooks.length > 0) console.error(`хуки> ${hooks.join(' · ')}`);
for (const warning of info.warnings) console.error(`⚠ ${warning}`);

const session = await openSession({ root, resume: args.resume, continue: args.continue });
const { restored } = session;
if (restored) {
  const compacted = restored.compact ? `, сводка вместо первых ${restored.compact.covered}` : '';
  console.error(`сессия> ${session.id} · восстановлено сообщений: ${restored.full.length}${compacted}`);
  if (restored.damaged) console.error('⚠ последняя строка журнала оборвана — процесс упал посреди записи. Её пропустили.');
} else {
  console.error(`сессия> ${session.id} · новая`);
}

try {
  const conversation = new SessionConversation(harness.agent, session.journal, session.id, restored);
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
  await conversation.flush();
  console.error(`\nпродолжить> npm run harness -- --resume ${session.id}`);
} finally {
  await harness.close();
}
