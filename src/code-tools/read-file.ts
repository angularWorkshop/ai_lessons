// read_file: содержимое файла с номерами строк, кусками.
import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '../tools.ts';
import { safePath } from './safe-path.ts';

/** Файл больше этого не читаем: это не исходник, а лог, бандл или база. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** Строку длиннее обрезаем: в минифицированном файле одна строка — весь файл. */
export const MAX_LINE_CHARS = 500;
export const DEFAULT_LINE_LIMIT = 200;

const ReadFileArgs = z.object({
  path: z.string().describe('Путь от корня проекта, например src/cart.ts'),
  offset: z.number().int().min(1).default(1).describe('С какой строки читать, считая с 1'),
  limit: z.number().int().min(1).max(2000).default(DEFAULT_LINE_LIMIT).describe('Сколько строк прочитать'),
});

// Шаг 2: «  7\tтекст». Ширина номера одна на весь кусок, чтобы текст шёл ровной колонкой.
export function numberLines(lines: string[], first: number): string {
  throw new Error('TODO: шаг 2 — пронумеруй строки: номер, табуляция, текст');
}

// Шаг 2
export function readFileTool(root: string): Tool<z.infer<typeof ReadFileArgs>> {
  return {
    name: 'read_file',
    description:
      'Читает текстовый файл проекта. Каждая строка начинается с номера и табуляции — номер не часть файла. ' +
      `По умолчанию первые ${DEFAULT_LINE_LIMIT} строк; дальше читай с offset.`,
    schema: ReadFileArgs,
    async run({ path, offset, limit }) {
      throw new Error('TODO: шаг 2 — прочитай кусок файла с номерами строк');
    },
  };
}
