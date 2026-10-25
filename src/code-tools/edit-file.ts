// edit_file: заменить один фрагмент файла другим — как str_replace у Claude Code.
// Модель присылает не весь файл, а кусок «было» и кусок «стало».
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { Mutex } from './mutex.ts';
import { safePath } from './safe-path.ts';

/** Сколько строк «было» и «стало» показать в diff. */
export const MAX_DIFF_LINES = 15;

const EditFileArgs = z.object({
  path: z.string().describe('Путь от корня проекта, например src/cart.ts'),
  old_str: z
    .string()
    .describe('Фрагмент, который заменить: точная копия из файла, с отступами, без номеров строк из read_file. Должен встречаться ровно один раз. Пустая строка — создать новый файл'),
  new_str: z.string().describe('Чем заменить old_str. Для нового файла — всё его содержимое'),
});

// Шаг 1: где в тексте встречается needle. Совпадения не перекрываются: в «aaaa» фрагмент «aa» встречается 2 раза.
export function findAll(text: string, needle: string): number[] {
  throw new Error('TODO: шаг 1 — найди все позиции needle в text');
}

// Шаг 1: номер строки (с 1), на которой стоит символ index.
export function lineAt(text: string, index: number): number {
  throw new Error('TODO: шаг 1 — посчитай переводы строк до index');
}

// Шаг 2: 0 совпадений — объясняем, почему так обычно бывает.
export function notFoundMessage(file: string, text: string, oldStr: string): string {
  throw new Error('TODO: шаг 2 — объясни модели, почему фрагмент не нашёлся');
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// Шаг 3: короткий diff — целые строки вокруг правки: «-» было, «+» стало.
export function shortDiff(before: string, index: number, oldStr: string, newStr: string): string {
  throw new Error('TODO: шаг 3 — покажи строки до и после правки');
}

function cap(lines: string[], sign: string): string[] {
  const shown = lines.slice(0, MAX_DIFF_LINES).map((line) => `${sign}${line}`);
  if (lines.length > MAX_DIFF_LINES) {
    shown.push(`${sign}…ещё ${lines.length - MAX_DIFF_LINES} строк`);
  }
  return shown;
}

// Шаги 2–4
export function editFileTool(root: string, lock = new Mutex()): Tool<z.infer<typeof EditFileArgs>> {
  return {
    name: 'edit_file',
    description:
      'Меняет файл проекта: находит old_str и заменяет его на new_str. old_str должен встречаться в файле ровно один раз — ' +
      'если мест несколько, добавь соседние строки. Перед правкой прочитай файл через read_file. ' +
      'Чтобы создать новый файл, передай пустой old_str и всё содержимое в new_str. В ответе — diff правки.',
    schema: EditFileArgs,
    async run({ path: file, old_str, new_str }) {
      throw new Error('TODO: шаг 2 — замени единственное вхождение old_str на new_str');
    },
  };
}

async function createFile(full: string, file: string, content: string): Promise<string> {
  throw new Error('TODO: шаг 3 — создай файл, если его ещё нет');
}
