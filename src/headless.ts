// Headless-режим: агент без человека за клавиатурой. Так его запускают из CI, скриптов и eval-прогонов.
// Задача — из аргументов, результат — JSON в stdout, всё для человека — в stderr, итог — в коде выхода.
import { parseArgs } from 'node:util';
import { Agent, type AgentOptions, type AgentRun, type StopReason } from './agent.ts';
import type { Usage } from './llm.ts';
import { createPrinter } from './printer.ts';

type Out = Pick<NodeJS.WritableStream, 'write'>;

/** Как запустили программу: разговор в терминале или одна задача без человека. */
export type CliMode = { mode: 'repl'; task?: string } | { mode: 'headless'; task: string; json: boolean };

/** Неправильные аргументы командной строки. Программа печатает подсказку и выходит с кодом 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Запуск:
  npm run agent                                разговор в терминале
  npm run agent "задача"                       разговор, начиная с задачи
  npm run agent -- -p "задача"                 одна задача без человека, ответ в stdout
  npm run agent -- -p "задача" --json          то же, результат — JSON`;

// Шаг 2
export function parseCli(argv: string[]): CliMode {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { print: { type: 'string', short: 'p' }, json: { type: 'boolean' } },
      allowPositionals: true,
    });
  } catch (error) {
    // Неизвестный флаг или -p без задачи: parseArgs бросает TypeError. Для нас это ошибка человека, а не программы.
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;
  if (values.print !== undefined) {
    const task = values.print.trim();
    if (!task) {
      throw new UsageError('После -p нужна задача: -p "что сделать"');
    }
    if (positionals.length > 0) {
      throw new UsageError(`Лишние аргументы: ${positionals.join(' ')}. Задачу целиком возьми в кавычки после -p`);
    }
    return { mode: 'headless', task, json: values.json ?? false };
  }
  if (values.json) {
    throw new UsageError('--json работает только вместе с -p "задача"');
  }
  const task = positionals.join(' ').trim();
  return task ? { mode: 'repl', task } : { mode: 'repl' };
}

export const USAGE_EXIT_CODE = 2;

// Шаг 3: код выхода по причине остановки. Его видит CI: 0 — шаг зелёный, всё остальное — красный.
export function exitCode(reason: StopReason): number {
  switch (reason) {
    case 'done':
      return 0;
    case 'error':
      return 1;
    // Агент работал, но не закончил: упёрся в лимит. Отдельный код — чтобы отличить от сбоя сети или ключа.
    case 'max_steps':
    case 'budget':
    case 'repeated_call':
    case 'truncated':
      return 3;
    // 128 + номер сигнала SIGINT (2): так завершаются программы, остановленные по Ctrl+C.
    case 'aborted':
      return 130;
  }
}

/** Что headless печатает в stdout с --json. История в результат не входит: она бывает огромной. */
export interface HeadlessResult {
  answer: string;
  stopReason: StopReason;
  usage: Usage;
  steps: number;
}

// Шаг 3
export function toResult(run: AgentRun): HeadlessResult {
  return { answer: run.answer, stopReason: run.stopReason, usage: run.usage, steps: run.steps };
}

export interface HeadlessOptions {
  /** Всё для агента, кроме onEvent и stream: их headless задаёт сам. signal — от SIGINT и SIGTERM. */
  agent: Omit<AgentOptions, 'onEvent' | 'stream'>;
  task: string;
  json: boolean;
  stdout: Out;
  stderr: Out;
}

// Шаг 4: одна задача без человека. stdin не трогаем вовсе: спрашивать некого.
export async function runHeadless({ agent, task, json, stdout, stderr }: HeadlessOptions): Promise<number> {
  // Шаги и текст модели по мере генерации — в stderr: в логах CI видно, что агент делает. stdout — только результат.
  const run = await new Agent({ ...agent, onEvent: createPrinter(stderr), stream: true }).run(task);

  if (json) {
    stdout.write(`${JSON.stringify(toResult(run))}\n`);
  } else if (run.stopReason === 'error') {
    // Текст ошибки — не ответ. В stdout ему не место: его прочтут как результат.
    stderr.write(`${run.answer}\n`);
  } else {
    stdout.write(`${run.answer}\n`);
  }
  return exitCode(run.stopReason);
}
