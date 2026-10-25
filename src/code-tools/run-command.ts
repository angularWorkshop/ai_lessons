// run_command: запустить программу в корне проекта и вернуть модели её вывод и код выхода.
// Без shell: никаких &&, |, > и $(…). Модель называет программу и аргументы по отдельности.
import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { Mutex } from './mutex.ts';
import { safePath } from './safe-path.ts';

export const DEFAULT_TIMEOUT_MS = 30_000;
/** Сколько ждать после SIGTERM, прежде чем убить SIGKILL. */
export const KILL_GRACE_MS = 2000;
export const MAX_OUTPUT_CHARS = 6000;
/** Переменные окружения, которые получает команда. Всё остальное — ключи, токены, пароли — остаётся у агента. */
export const SAFE_ENV = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM'];

/** То, что нам нужно от дочернего процесса. Настоящий ChildProcess подходит, заглушка в тестах — тоже. */
export interface ChildLike {
  stdout: Readable | null;
  stderr: Readable | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildLike;

export interface RunCommandOptions {
  timeoutMs?: number;
  killGraceMs?: number;
  maxOutputChars?: number;
  /** Окружение агента. Команде достанется только SAFE_ENV из него. По умолчанию process.env. */
  env?: NodeJS.ProcessEnv;
  /** Подмена spawn для тестов. */
  spawn?: SpawnFn;
  /** Общий замок с edit_file: команда не запустится посреди правки. */
  lock?: Mutex;
}

const RunCommandArgs = z.object({
  command: z.string().describe('Программа: node, npm, ls или cat'),
  args: z.array(z.string()).default([]).describe('Аргументы по одному, например ["test"] или ["-e", "console.log(1)"]'),
});

// Шаг 1: белый список. Не только имя программы, но и аргументы: npm install скачает что угодно,
// а cat ../.env прочитает ключ мимо safePath. null — можно, строка — почему нельзя.
export async function checkCommand(root: string, command: string, args: string[]): Promise<string | null> {
  throw new Error('TODO: шаг 1 — реши, можно ли запускать эту команду с этими аргументами');
}

// Шаг 3: голова и хвост. В начале вывода — что запустилось и первые ошибки, в конце — итог тестов и код выхода.
export class OutputBuffer {
  readonly #half: number;
  #head = '';
  #tail = '';
  #total = 0;

  constructor(maxChars: number) {
    this.#half = Math.floor(maxChars / 2);
  }

  push(chunk: string): void {
  throw new Error('TODO: шаг 3 — сохрани начало и конец вывода');
}

  toString(): string {
  throw new Error('TODO: шаг 3 — склей начало и конец, отметь пропуск');
}
}

// Шаг 4: окружение для команды — только безопасные переменные.
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  throw new Error('TODO: шаг 4 — оставь только переменные из SAFE_ENV');
}

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
}

// Шаги 2 и 4
export function runCommandTool(root: string, options: RunCommandOptions = {}): Tool<z.infer<typeof RunCommandArgs>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    killGraceMs = KILL_GRACE_MS,
    maxOutputChars = MAX_OUTPUT_CHARS,
    spawn = nodeSpawn,
    lock = new Mutex(),
  } = options;

  return {
    name: 'run_command',
    description:
      'Запускает программу в корне проекта без shell: command — программа, args — аргументы по одному. ' +
      'Можно: node, npm test, ls, cat. Нельзя: &&, |, >, перенаправления. ' +
      `Ответ — код выхода и вывод; длинный вывод сокращается до начала и конца. Таймаут ${timeoutMs / 1000} с.`,
    schema: RunCommandArgs,
    async run({ command, args }, ctx) {
  throw new Error('TODO: шаг 2 — проверь команду, запусти её через spawn и дождись выхода');
},
  };
}

// Шаг 2: дождаться close (или error — программы нет). Шаг 4: таймаут и отмена: SIGTERM, через killGraceMs — SIGKILL.
function waitForExit(child: ChildLike, timeoutMs: number, killGraceMs: number, signal?: AbortSignal): Promise<Exit> {
  throw new Error('TODO: шаги 2 и 4 — дождись close или error; таймаут и отмена');
}

function formatResult(commandLine: string, exit: Exit, output: string, timeoutMs: number): string {
  const lines = [`$ ${commandLine}`];
  if (exit.timedOut) {
    lines.push(`остановлена по таймауту: работала дольше ${timeoutMs / 1000} с`);
  } else if (exit.aborted) {
    lines.push('остановлена: агента отменили');
  }
  lines.push(exit.code !== null ? `код выхода: ${exit.code}` : `завершена сигналом ${exit.signal}`);
  lines.push(output.trim() === '' ? '(вывода нет)' : output.trimEnd());
  return lines.join('\n');
}
