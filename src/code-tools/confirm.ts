// Вопрос человеку в терминале: разрешить вызов или нет.
import { createInterface, type Interface } from 'node:readline';
import type { Answer, PermissionRequest, Verdict } from './permissions.ts';

const MAX_PREVIEW_LINES = 10;

// Шаг 4: что именно агент собирается сделать — коротко, чтобы человек решил за секунду.
export function describeCall({ tool, args }: PermissionRequest): string {
  if (tool === 'edit_file') {
    const oldStr = String(args.old_str);
    const newStr = String(args.new_str);
    if (oldStr === '') {
      return `edit_file ${args.path}: новый файл\n${preview(newStr, '+')}`;
    }
    return `edit_file ${args.path}\n${preview(oldStr, '-')}\n${preview(newStr, '+')}`;
  }
  if (tool === 'run_command') {
    return `$ ${[args.command, ...(args.args as string[])].join(' ')}`;
  }
  return `${tool} ${JSON.stringify(args)}`;
}

function preview(text: string, sign: string): string {
  const lines = text.split('\n');
  const shown = lines.slice(0, MAX_PREVIEW_LINES).map((line) => `${sign}${line}`);
  if (lines.length > MAX_PREVIEW_LINES) shown.push(`${sign}…ещё ${lines.length - MAX_PREVIEW_LINES} строк`);
  return shown.join('\n');
}

// Шаг 4: всё, кроме явного «да», — это «нет». Случайный Enter не должен разрешать запуск команды.
export function parseAnswer(line: string | null): Answer {
  const answer = (line ?? '').trim().toLowerCase();
  if (['y', 'yes', 'д', 'да'].includes(answer)) return 'yes';
  if (['a', 'always', 'в', 'всегда'].includes(answer)) return 'always';
  return 'no';
}

export interface TerminalConfirmOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

// Шаг 4: строки читаем одним readline на всю сессию и складываем в очередь.
// Если ответы пришли раньше вопросов (их вставили в терминал или подали через pipe), они не потеряются.
export class TerminalConfirm {
  readonly #rl: Interface;
  readonly #output: NodeJS.WritableStream;
  readonly #lines: string[] = [];
  #waiting: ((line: string | null) => void) | undefined;
  #closed = false;

  constructor({ input = process.stdin, output = process.stdout }: TerminalConfirmOptions = {}) {
    this.#output = output;
    // terminal: false — Ctrl+C остаётся сигналом процессу, и агент останавливается как раньше.
    this.#rl = createInterface({ input, terminal: false });
    this.#rl.on('line', (line) => this.#push(line));
    this.#rl.on('close', () => {
      this.#closed = true;
      this.#push(null);
    });
  }

  /** Спросить человека. Ввод закончился или агента отменили — это «нет». */
  async ask(request: PermissionRequest, verdict: Verdict, signal?: AbortSignal): Promise<Answer> {
    const body = describeCall(request).replace(/^/gm, '  ');
    this.#output.write(`\n? ${verdict.reason} — разрешить?\n${body}\n  [y] да · [a] да, и больше не спрашивать про ${request.tool} · [n] нет > `);
    const line = await this.#nextLine(signal);
    if (line === null) this.#output.write('\n');
    return parseAnswer(line);
  }

  /** Отпустить stdin, иначе процесс не завершится. */
  close(): void {
    this.#rl.close();
  }

  #push(line: string | null): void {
    if (this.#waiting) {
      const resolve = this.#waiting;
      this.#waiting = undefined;
      resolve(line);
    } else if (line !== null) {
      this.#lines.push(line);
    }
  }

  #nextLine(signal?: AbortSignal): Promise<string | null> {
    if (this.#lines.length > 0) return Promise.resolve(this.#lines.shift()!);
    if (this.#closed || signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
      const onAbort = () => {
        this.#waiting = undefined;
        resolve(null);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#waiting = (line) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(line);
      };
    });
  }
}
