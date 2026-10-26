// Запуск harness: аргументы командной строки, вывод в терминал и одна задача без человека.
// Разбор -p и --json — parseCli из темы 6.3, коды выхода — exitCode оттуда же. Здесь только флаги harness.
import type { AgentEvent } from '../agent.ts';
import { MODES, type Mode } from '../code-tools/permissions.ts';
import type { CompactEvent } from '../context/compaction.ts';
import type { Conversation } from '../conversation.ts';
import { exitCode, parseCli, toResult, UsageError, type CliMode } from '../headless.ts';
import { createPrinter } from '../printer.ts';
import { todoPrinter } from '../todo/todo.ts';

type Out = Pick<NodeJS.WritableStream, 'write'>;

export const HARNESS_USAGE = `Запуск:
  npm run harness                              разговор в терминале
  npm run harness "задача"                     разговор, начиная с задачи
  npm run harness -- -p "задача" [--json]      одна задача без человека
Флаги:
  --cwd <папка>                                проект, по умолчанию playground
  --mode <read-only|ask|auto>                  режим прав, по умолчанию ask`;

export interface HarnessArgs {
  cli: CliMode;
  cwd: string;
  mode?: Mode;
}

export const DEFAULT_CWD = 'playground';

// Шаг 5: флаги harness забираем сами, остальное — parseCli из 6.3. Значение — через пробел или через =.
export function parseHarnessArgs(argv: string[]): HarnessArgs {
  throw new Error('TODO: шаг 5');
}

// Шаг 5: что видит человек. План — планом (10.1), субагенты — одной строкой на вызов, сжатие — пометкой.
export function harnessPrinter(out: Out): {
  onEvent: (event: AgentEvent) => void;
  onSubagentEvent: (event: AgentEvent, description: string) => void;
  onCompact: (event: CompactEvent) => void;
} {
  const line = (text: string) => void out.write(`${text}\n`);
  return {
    onEvent: todoPrinter(createPrinter(out), line),
    onSubagentEvent: (event, description) => {
      if (event.type === 'tool_call') line(`   [${description}] → ${event.call.name}(${event.call.arguments})`);
    },
    onCompact: (event) => line(`\n⇣ сжатие: ${event.summarized} сообщений → сводка, запрос ~${event.before} → ~${event.after} токенов`),
  };
}

export interface RunOnceOptions {
  conversation: Conversation;
  task: string;
  json: boolean;
  stdout: Out;
  stderr: Out;
  signal?: AbortSignal;
}

// Шаг 5: headless поверх Conversation. Вывод тот же, что у runHeadless из 6.3: JSON или ответ в stdout, ошибка — в stderr.
// Conversation, а не голый Agent: в следующих темах на неё повесим журнал сессии.
export async function runOnce({ conversation, task, json, stdout, stderr, signal }: RunOnceOptions): Promise<number> {
  throw new Error('TODO: шаг 5');
}
