// Вопрос человеку в терминале: разрешить вызов или нет.
import { createInterface, type Interface } from 'node:readline';
import type { Answer, PermissionRequest, Verdict } from './permissions.ts';

const MAX_PREVIEW_LINES = 10;

// Шаг 4: что именно агент собирается сделать — коротко, чтобы человек решил за секунду.
export function describeCall({ tool, args }: PermissionRequest): string {
  throw new Error('TODO: шаг 4 — опиши вызов для человека');
}

function preview(text: string, sign: string): string {
  const lines = text.split('\n');
  const shown = lines.slice(0, MAX_PREVIEW_LINES).map((line) => `${sign}${line}`);
  if (lines.length > MAX_PREVIEW_LINES) shown.push(`${sign}…ещё ${lines.length - MAX_PREVIEW_LINES} строк`);
  return shown.join('\n');
}

// Шаг 4: всё, кроме явного «да», — это «нет». Случайный Enter не должен разрешать запуск команды.
export function parseAnswer(line: string | null): Answer {
  throw new Error('TODO: шаг 4 — разбери ответ человека');
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
  throw new Error('TODO: шаг 4 — напечатай вопрос и дождись строки');
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
  throw new Error('TODO: шаг 4 — следующая строка из очереди или ожидание новой');
}
}
