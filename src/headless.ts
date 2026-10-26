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
  throw new Error('TODO: шаг 2 — разбери -p, --json и слова через parseArgs');
}

export const USAGE_EXIT_CODE = 2;

// Шаг 3: код выхода по причине остановки. Его видит CI: 0 — шаг зелёный, всё остальное — красный.
export function exitCode(reason: StopReason): number {
  throw new Error('TODO: шаг 3 — код выхода по причине остановки');
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
  throw new Error('TODO: шаг 3 — answer, stopReason, usage и steps из run');
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
  throw new Error('TODO: шаг 4 — запусти агента с печатью в stderr, результат — в stdout, верни код выхода');
}
