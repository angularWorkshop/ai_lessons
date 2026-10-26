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
  /** Своя проверка команды вместо checkCommand: так песочница из темы 13.2 подменяет белый список. */
  check?: (root: string, command: string, args: string[]) => Promise<string | null>;
}

const RunCommandArgs = z.object({
  command: z.string().describe('Программа: node, npm, ls или cat'),
  args: z.array(z.string()).default([]).describe('Аргументы по одному, например ["test"] или ["-e", "console.log(1)"]'),
});

// Шаг 1: белый список. Не только имя программы, но и аргументы: npm install скачает что угодно,
// а cat ../.env прочитает ключ мимо safePath. null — можно, строка — почему нельзя.
export async function checkCommand(root: string, command: string, args: string[]): Promise<string | null> {
  switch (command) {
    case 'node':
      return null;
    case 'npm':
      return args[0] === 'test' ? null : 'из npm можно только npm test';
    case 'ls':
    case 'cat':
      for (const arg of args) {
        if (!arg.startsWith('-')) {
          await safePath(root, arg); // за корень и к .env — PathError
        }
      }
      return null;
    default:
      return `команды ${command} нет в белом списке. Можно: node, npm test, ls, cat`;
  }
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
    this.#total += chunk.length;
    if (this.#head.length < this.#half) {
      const take = this.#half - this.#head.length;
      this.#head += chunk.slice(0, take);
      chunk = chunk.slice(take);
    }
    // Хвост держим не длиннее половины: память не растёт, сколько бы команда ни печатала.
    this.#tail = (this.#tail + chunk).slice(-this.#half);
  }

  toString(): string {
    const skipped = this.#total - this.#head.length - this.#tail.length;
    if (skipped === 0) {
      return this.#head + this.#tail;
    }
    return `${this.#head}\n…[пропущено ${skipped} символов из ${this.#total}]…\n${this.#tail}`;
  }
}

// Шаг 4: окружение для команды — только безопасные переменные.
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const name of SAFE_ENV) {
    if (env[name] !== undefined) clean[name] = env[name];
  }
  return clean;
}

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
}

// Шаги 2–4
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
      const refusal = await (options.check ?? checkCommand)(root, command, args);
      if (refusal) {
        throw new Error(refusal);
      }
      const cwd = await realpath(root);

      return lock.run(async () => {
        const output = new OutputBuffer(maxOutputChars);
        // node — тот же, что запустил агента: не зависим от PATH.
        const child = spawn(command === 'node' ? process.execPath : command, args, {
          cwd,
          env: cleanEnv(options.env ?? process.env),
          // stdin закрыт: команда, которая ждёт ввода (cat без аргументов), не повиснет.
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        // stdout и stderr — в один буфер, в порядке прихода: так их видит человек в терминале.
        for (const stream of [child.stdout, child.stderr]) {
          stream?.setEncoding('utf8');
          stream?.on('data', (chunk: string) => output.push(chunk));
        }

        const exit = await waitForExit(child, timeoutMs, killGraceMs, ctx.signal);
        return formatResult([command, ...args].join(' '), exit, output.toString(), timeoutMs);
      });
    },
  };
}

// Шаг 4: таймаут и отмена. SIGTERM просит процесс завершиться, SIGKILL — убивает того, кто не послушался.
function waitForExit(child: ChildLike, timeoutMs: number, killGraceMs: number, signal?: AbortSignal): Promise<Exit> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | undefined;

    const stop = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        // Не дождались и после SIGKILL — больше не ждём: агент не должен висеть из-за одной команды.
        killTimer = setTimeout(() => finish({ code: null, signal: 'SIGKILL', timedOut, aborted }), killGraceMs);
      }, killGraceMs);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const onAbort = () => {
      aborted = true;
      stop();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    let settled = false;
    const finish = (exit: Exit | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      if (exit instanceof Error) reject(exit);
      else resolve(exit);
    };
    // Программы нет (ENOENT): в Node придёт error, а close — не всегда. В WebContainer close не придёт вовсе.
    child.once('error', (error) => finish(error));
    child.once('close', (code, exitSignal) => finish({ code, signal: exitSignal, timedOut, aborted }));
  });
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
